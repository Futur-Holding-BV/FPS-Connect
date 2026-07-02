// Dagelijkse planning-bewaking voor aanvraag-planningen
// Stuurt een overzicht van aanstaande / verlopen deadlines naar PL-gebruikers.
import { db, aanvraagPlanningenTable, gebruikersTable, inboxItemsTable } from "@workspace/db";
import { eq, and, isNotNull, or, lte, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { stuurPlanningMelding } from "../services/email";

interface PlanningRegel {
  planning_id: number;
  offerte_titel: string | null;
  pl_planning_datum: string;
  dagen_tot: number;
}

async function haalVervallendePlanningen(): Promise<PlanningRegel[]> {
  const vandaag = new Date().toISOString().slice(0, 10);
  const overVier = new Date(Date.now() + 4 * 24 * 3_600_000).toISOString().slice(0, 10);

  const planningen = await db
    .select({
      id: aanvraagPlanningenTable.id,
      plPlanningDatum: aanvraagPlanningenTable.plPlanningDatum,
      meldingVerzondOp: aanvraagPlanningenTable.meldingVerzondOp,
      inboxItemId: aanvraagPlanningenTable.inboxItemId,
      offerteId: aanvraagPlanningenTable.offerteId,
    })
    .from(aanvraagPlanningenTable)
    .where(
      and(
        isNotNull(aanvraagPlanningenTable.plPlanningDatum),
        lte(aanvraagPlanningenTable.plPlanningDatum, overVier),
        or(
          isNull(aanvraagPlanningenTable.meldingVerzondOp),
          // Opnieuw melden als de vorige melding > 24u geleden is
          lte(aanvraagPlanningenTable.meldingVerzondOp, new Date(Date.now() - 24 * 3_600_000)),
        ),
      ),
    );

  if (planningen.length === 0) return [];

  // Haal inbox-items op voor titels
  const itemIds = planningen.map((p) => p.inboxItemId).filter((x): x is number => x !== null);
  const items =
    itemIds.length > 0
      ? await db
          .select({ id: inboxItemsTable.id, naam: inboxItemsTable.gekoppeldeEntiteitNaam })
          .from(inboxItemsTable)
          .where(eq(inboxItemsTable.id, itemIds[0]!)) // drizzle inArray-vrij pad
      : [];

  const titelMap = new Map(items.map((i) => [i.id, i.naam]));

  const vandaagMs = new Date(vandaag).getTime();

  return planningen
    .filter((p) => p.plPlanningDatum !== null)
    .map((p) => {
      const ms = new Date(p.plPlanningDatum!).getTime() - vandaagMs;
      const dagen = Math.round(ms / 86_400_000);
      return {
        planning_id: p.id,
        offerte_titel: titelMap.get(p.inboxItemId ?? -1) ?? null,
        pl_planning_datum: p.plPlanningDatum!,
        dagen_tot: dagen,
      };
    });
}

async function haalPlOntvangers(): Promise<Array<{ naam: string; email: string }>> {
  const gebruikers = await db
    .select({ naam: gebruikersTable.naam, email: gebruikersTable.email, bevoegdheden: gebruikersTable.bevoegdheden })
    .from(gebruikersTable)
    .where(and(eq(gebruikersTable.actief, true), eq(gebruikersTable.gearchiveerd, false)));

  return gebruikers.filter((g) => {
    const bev = g.bevoegdheden as Record<string, number> | null;
    return (bev?.["offertes"] ?? 0) >= 2 && g.email;
  }) as Array<{ naam: string; email: string }>;
}

async function voerCheckUit(): Promise<void> {
  logger.info("Planning-meldingen check gestart");

  let planningen: PlanningRegel[];
  try {
    planningen = await haalVervallendePlanningen();
  } catch (err) {
    logger.error({ err }, "Planning-meldingen: planningen ophalen mislukt");
    return;
  }

  if (planningen.length === 0) {
    logger.info("Planning-meldingen: geen vervallende planningen gevonden");
    return;
  }

  let ontvangers: Array<{ naam: string; email: string }>;
  try {
    ontvangers = await haalPlOntvangers();
  } catch (err) {
    logger.error({ err }, "Planning-meldingen: ontvangers ophalen mislukt");
    return;
  }

  if (ontvangers.length === 0) {
    logger.warn("Planning-meldingen: geen PL-ontvangers gevonden (offertes:2+)");
    return;
  }

  for (const ontvanger of ontvangers) {
    try {
      await stuurPlanningMelding({ naarEmail: ontvanger.email, naarNaam: ontvanger.naam, planningen });
    } catch (err) {
      logger.error({ err, email: ontvanger.email }, "Planning-meldingen: verzenden mislukt");
    }
  }

  // Bijhouden dat melding verzonden is
  const nu = new Date();
  for (const p of planningen) {
    try {
      await db
        .update(aanvraagPlanningenTable)
        .set({ meldingVerzondOp: nu })
        .where(eq(aanvraagPlanningenTable.id, p.planning_id));
    } catch (err) {
      logger.error({ err, id: p.planning_id }, "Planning-meldingen: bijwerken mislukt");
    }
  }

  logger.info({ ontvangers: ontvangers.length, planningen: planningen.length }, "Planning-meldingen voltooid");
}

let _gepland = false;

/**
 * Plant de dagelijkse planning-meldingencheck op 08:00.
 * Veilig om meerdere keren aan te roepen — plant slechts één timer.
 */
export function planDagelijksePlanningMeldingen(): void {
  if (_gepland) return;
  _gepland = true;

  function scheduleNext() {
    const now = new Date();
    const volgende = new Date(now);
    volgende.setHours(8, 0, 0, 0);
    if (volgende <= now) volgende.setDate(volgende.getDate() + 1);
    const vertragingMs = volgende.getTime() - now.getTime();
    const uren = Math.floor(vertragingMs / 3_600_000);
    const minuten = Math.floor((vertragingMs % 3_600_000) / 60_000);
    logger.info({ uren, minuten }, "Volgende planning-melding gepland");

    setTimeout(async () => {
      try {
        await voerCheckUit();
      } catch (err) {
        logger.error({ err }, "Planning-meldingen onverwacht mislukt");
      }
      scheduleNext();
    }, vertragingMs).unref();
  }

  scheduleNext();
}

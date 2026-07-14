// Dagelijkse bewaking van verstreken reactietermijnen op definitieve rapporten.
// Stuurt een e-mail naar alle beheerders met rapportage-schrijfbevoegdheid (rapportages:2+)
// zodra een reactietermijn is verstreken zonder klantreactie.
// De melding wordt maximaal éénmaal per rapport verstuurd (reactietermijn_melding_verzond_op).
import { db, opleverrapportenTable, gebouwenTable, gebruikersTable } from "@workspace/db";
import { eq, and, isNotNull, isNull, lt } from "drizzle-orm";
import { berekenEffectieveBevoegdhedenBatch } from "./effectieve-bevoegdheden";
import { logger } from "./logger";
import { stuurReactietermijnMelding } from "../services/email";

interface VerstrekenRapport {
  rapport_id: number;
  gebouw_naam: string | null;
  rapport_type: string;
  reactietermijn_datum: string;
  dagen_verstreken: number;
}

async function haalVerstrekenRapporten(): Promise<VerstrekenRapport[]> {
  const nu = new Date();

  const rijen = await db
    .select({
      id: opleverrapportenTable.id,
      rapportType: opleverrapportenTable.rapportType,
      reactietermijnDatum: opleverrapportenTable.reactietermijnDatum,
      gebouwNaam: gebouwenTable.naam,
    })
    .from(opleverrapportenTable)
    .leftJoin(gebouwenTable, eq(opleverrapportenTable.gebouwId, gebouwenTable.id))
    .where(
      and(
        eq(opleverrapportenTable.status, "definitief"),
        isNotNull(opleverrapportenTable.reactietermijnDatum),
        lt(opleverrapportenTable.reactietermijnDatum, nu),
        isNull(opleverrapportenTable.reactietermijnMeldingVerzondOp),
      ),
    );

  return rijen
    .filter((r) => r.reactietermijnDatum !== null)
    .map((r) => {
      const ms = nu.getTime() - r.reactietermijnDatum!.getTime();
      const dagenVerstreken = Math.max(1, Math.floor(ms / 86_400_000));
      return {
        rapport_id: r.id,
        gebouw_naam: r.gebouwNaam ?? null,
        rapport_type: r.rapportType,
        reactietermijn_datum: r.reactietermijnDatum!.toLocaleDateString("nl-NL"),
        dagen_verstreken: dagenVerstreken,
      };
    });
}

async function haalBeheerderOntvangers(): Promise<Array<{ naam: string; email: string }>> {
  const gebruikers = await db
    .select({
      id: gebruikersTable.id,
      naam: gebruikersTable.naam,
      email: gebruikersTable.email,
      rol: gebruikersTable.rol,
      bevoegdheden: gebruikersTable.bevoegdheden,
    })
    .from(gebruikersTable)
    .where(and(eq(gebruikersTable.actief, true), eq(gebruikersTable.gearchiveerd, false)));

  const effectief = await berekenEffectieveBevoegdhedenBatch(
    gebruikers.map((g) => ({ id: g.id, rol: g.rol, storedBevoegdheden: g.bevoegdheden })),
  );

  return gebruikers.filter((g) => {
    const bev = effectief.get(g.id) ?? {};
    return (bev["rapportages"] ?? 0) >= 2 && g.email;
  }) as Array<{ naam: string; email: string }>;
}

async function voerCheckUit(): Promise<void> {
  logger.info("Reactietermijn-signalering check gestart");

  let rapporten: VerstrekenRapport[];
  try {
    rapporten = await haalVerstrekenRapporten();
  } catch (err) {
    logger.error({ err }, "Reactietermijn-signalering: rapporten ophalen mislukt");
    return;
  }

  if (rapporten.length === 0) {
    logger.info("Reactietermijn-signalering: geen verstreken reactietermijnen gevonden");
    return;
  }

  let ontvangers: Array<{ naam: string; email: string }>;
  try {
    ontvangers = await haalBeheerderOntvangers();
  } catch (err) {
    logger.error({ err }, "Reactietermijn-signalering: ontvangers ophalen mislukt");
    return;
  }

  if (ontvangers.length === 0) {
    logger.warn("Reactietermijn-signalering: geen ontvangers gevonden (rapportages:2+)");
    return;
  }

  for (const ontvanger of ontvangers) {
    try {
      await stuurReactietermijnMelding({
        naarEmail: ontvanger.email,
        naarNaam: ontvanger.naam,
        rapporten,
      });
    } catch (err) {
      logger.error({ err, email: ontvanger.email }, "Reactietermijn-signalering: verzenden mislukt");
    }
  }

  // Markeer rapporten als gemeld zodat we niet opnieuw sturen
  const nu = new Date();
  for (const rapport of rapporten) {
    try {
      await db
        .update(opleverrapportenTable)
        .set({ reactietermijnMeldingVerzondOp: nu })
        .where(eq(opleverrapportenTable.id, rapport.rapport_id));
    } catch (err) {
      logger.error({ err, id: rapport.rapport_id }, "Reactietermijn-signalering: bijwerken mislukt");
    }
  }

  logger.info(
    { ontvangers: ontvangers.length, rapporten: rapporten.length },
    "Reactietermijn-signalering voltooid",
  );
}

let _gepland = false;

/**
 * Plant de dagelijkse reactietermijn-signalering op 07:30.
 * Veilig om meerdere keren aan te roepen — plant slechts één timer.
 */
export function planDagelijkseReactietermijnSignalering(): void {
  if (_gepland) return;
  _gepland = true;

  function scheduleNext() {
    const now = new Date();
    const volgende = new Date(now);
    volgende.setHours(7, 30, 0, 0);
    if (volgende <= now) volgende.setDate(volgende.getDate() + 1);
    const vertragingMs = volgende.getTime() - now.getTime();
    const uren = Math.floor(vertragingMs / 3_600_000);
    const minuten = Math.floor((vertragingMs % 3_600_000) / 60_000);
    logger.info({ uren, minuten }, "Volgende reactietermijn-signalering gepland");

    setTimeout(async () => {
      try {
        await voerCheckUit();
      } catch (err) {
        logger.error({ err }, "Reactietermijn-signalering onverwacht mislukt");
      }
      scheduleNext();
    }, vertragingMs).unref();
  }

  scheduleNext();
}

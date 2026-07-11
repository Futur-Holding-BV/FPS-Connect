// Governance & Approval Engine — deterministische bewaking zonder AI.
//
// Periodieke achtergrondtaak (elk uur) die voor elke openstaande goedkeurings-
// aanvraag controleert of een herinnering of escalatie-stap verschuldigd is,
// op basis van de beleidsregel die hoort bij de aanvraag.
//
// Escalatie-volgorde (configureerbaar per beleidsregel):
//   1. herinnering_uren  → herinnering naar de aangewezen goedkeurder
//   2. escalatie_stap_1_uren → escalatie naar stap-1 persoon (leidinggevende)
//   3. escalatie_stap_2_uren → escalatie naar stap-2 persoon (directeur)
//   4. max_doorlooptijd_uren → harde deadline, altijd naar hoofdbeheerder
//
// Elk type wordt per aanvraag maximaal één keer verstuurd (via goedkeuring_escalaties).
// Logging: workflow_transitie_log (tijdlijn object) + goedkeuring_escalaties (dedup).
import {
  db,
  goedkeuringAanvragenTable,
  goedkeuringBeleidsregelsTable,
  goedkeuringEscalatiesTable,
  workflowTransitieLogTable,
  gebruikersTable,
} from "@workspace/db";
import { and, eq, or, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import { stuurGoedkeuringEscalatieMail } from "../services/email";

// ── Helpers ──────────────────────────────────────────────────────────────────

function urenVerstreken(vanDatum: Date, uren: number): boolean {
  return Date.now() - vanDatum.getTime() >= uren * 3_600_000;
}

async function heeftEscalatieType(aanvraagId: number, type: string): Promise<boolean> {
  const [rij] = await db
    .select({ id: goedkeuringEscalatiesTable.id })
    .from(goedkeuringEscalatiesTable)
    .where(
      and(
        eq(goedkeuringEscalatiesTable.aanvraagId, aanvraagId),
        eq(goedkeuringEscalatiesTable.type, type),
      ),
    )
    .limit(1);
  return Boolean(rij);
}

async function logEscalatie(
  aanvraagId: number,
  type: string,
  naarGebruikerId: number | null,
  naarGebruikerNaam: string | null,
  bericht: string,
): Promise<void> {
  await db.insert(goedkeuringEscalatiesTable).values({
    aanvraagId,
    type,
    naarGebruikerId,
    naarGebruikerNaam,
    bericht,
  });
}

async function logTijdlijn(
  objectType: string,
  objectId: number,
  naarStatus: string,
  reden: string,
): Promise<void> {
  await db.insert(workflowTransitieLogTable).values({
    workflowId: "goedkeuring_bewaking",
    entityId: objectId,
    entityType: objectType,
    vanStatus: "ingediend",
    naarStatus,
    gebruikerId: null,
    gebruikerNaam: "Systeem",
    reden,
    aangemaaktOp: new Date(),
  });
}

async function zoekHoofdBeheerder(): Promise<{ id: number; naam: string | null; email: string | null } | null> {
  const [g] = await db
    .select({ id: gebruikersTable.id, naam: gebruikersTable.naam, email: gebruikersTable.email })
    .from(gebruikersTable)
    .where(and(eq(gebruikersTable.rol, "hoofdbeheerder"), eq(gebruikersTable.actief, true)))
    .limit(1);
  return g ?? null;
}

async function zoekGebruiker(id: number): Promise<{ id: number; naam: string | null; email: string | null } | null> {
  const [g] = await db
    .select({ id: gebruikersTable.id, naam: gebruikersTable.naam, email: gebruikersTable.email })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, id));
  return g ?? null;
}

// ── Kerncheck ─────────────────────────────────────────────────────────────────

async function verwerkOpenAanvragen(): Promise<number> {
  // Haal alle ingediende aanvragen op met een beleidsregel die escalatieconfiguratie heeft
  const aanvragen = await db
    .select({
      aanvraag: goedkeuringAanvragenTable,
      beleid: goedkeuringBeleidsregelsTable,
    })
    .from(goedkeuringAanvragenTable)
    .innerJoin(
      goedkeuringBeleidsregelsTable,
      eq(goedkeuringAanvragenTable.beleidsregelId, goedkeuringBeleidsregelsTable.id),
    )
    .where(
      and(
        eq(goedkeuringAanvragenTable.status, "ingediend"),
        // Alleen aanvragen met enige escalatieconfiguratie
        or(
          sql`${goedkeuringBeleidsregelsTable.herinneringUren} IS NOT NULL`,
          sql`${goedkeuringBeleidsregelsTable.escalatieStap1Uren} IS NOT NULL`,
          sql`${goedkeuringBeleidsregelsTable.escalatieStap2Uren} IS NOT NULL`,
          sql`${goedkeuringBeleidsregelsTable.maxDoorlooptijdUren} IS NOT NULL`,
        ),
      ),
    );

  let verwerkt = 0;

  for (const rij of aanvragen) {
    const { aanvraag, beleid } = rij;
    const indienTijdstip = aanvraag.ingediendOp;
    if (!indienTijdstip) continue;

    // ── Herinnering ────────────────────────────────────────────────────────
    if (
      beleid.herinneringUren != null &&
      urenVerstreken(indienTijdstip, beleid.herinneringUren) &&
      !(await heeftEscalatieType(aanvraag.id, "herinnering"))
    ) {
      // Goedkeurder bepalen vanuit snapshot of beleidsregel
      let ontvangerGebruikerId: number | null = null;
      let ontvangerNaam: string | null = null;
      let ontvangerEmail: string | null = null;

      if (beleid.goedkeurderGebruikerId) {
        const g = await zoekGebruiker(beleid.goedkeurderGebruikerId);
        ontvangerGebruikerId = g?.id ?? null;
        ontvangerNaam = g?.naam ?? null;
        ontvangerEmail = g?.email ?? null;
      }
      // Vervanging: als de aangewezen goedkeurder niet beschikbaar, zoek vervanger
      if (!ontvangerGebruikerId && beleid.vervangerGebruikerId) {
        const g = await zoekGebruiker(beleid.vervangerGebruikerId);
        ontvangerGebruikerId = g?.id ?? null;
        ontvangerNaam = g?.naam ?? null;
        ontvangerEmail = g?.email ?? null;
      }
      // Fallback naar hoofdbeheerder
      if (!ontvangerGebruikerId) {
        const hb = await zoekHoofdBeheerder();
        ontvangerGebruikerId = hb?.id ?? null;
        ontvangerNaam = hb?.naam ?? null;
        ontvangerEmail = hb?.email ?? null;
      }

      const bericht = `Herinnering: goedkeuringsaanvraag #${aanvraag.id} (${aanvraag.documentType}) staat al meer dan ${beleid.herinneringUren} uur open en wacht op uw actie.`;
      await logEscalatie(aanvraag.id, "herinnering", ontvangerGebruikerId, ontvangerNaam, bericht);
      await logTijdlijn(aanvraag.objectType, aanvraag.objectId, "herinnering_verstuurd", bericht);

      if (ontvangerEmail) {
        try {
          await stuurGoedkeuringEscalatieMail({
            naarEmail: ontvangerEmail,
            naarNaam: ontvangerNaam,
            aanvraagId: aanvraag.id,
            documentType: aanvraag.documentType,
            omschrijving: aanvraag.omschrijving,
            escalatieType: "herinnering",
            bericht,
          });
        } catch (err) {
          logger.warn({ err, aanvraagId: aanvraag.id }, "Goedkeuring herinnering mail niet verstuurd");
        }
      }
      verwerkt++;
    }

    // ── Escalatie stap 1 ──────────────────────────────────────────────────
    if (
      beleid.escalatieStap1Uren != null &&
      urenVerstreken(indienTijdstip, beleid.escalatieStap1Uren) &&
      !(await heeftEscalatieType(aanvraag.id, "escalatie_1"))
    ) {
      let ontvangerGebruikerId: number | null = beleid.escalatieStap1GebruikerId ?? null;
      let ontvangerNaam: string | null = null;
      let ontvangerEmail: string | null = null;

      if (ontvangerGebruikerId) {
        const g = await zoekGebruiker(ontvangerGebruikerId);
        ontvangerNaam = g?.naam ?? null;
        ontvangerEmail = g?.email ?? null;
      } else {
        const hb = await zoekHoofdBeheerder();
        ontvangerGebruikerId = hb?.id ?? null;
        ontvangerNaam = hb?.naam ?? null;
        ontvangerEmail = hb?.email ?? null;
      }

      const bericht = `Escalatie (stap 1): aanvraag #${aanvraag.id} (${aanvraag.documentType}) staat ${beleid.escalatieStap1Uren} uur open zonder beslissing. Actie vereist.`;
      await logEscalatie(aanvraag.id, "escalatie_1", ontvangerGebruikerId, ontvangerNaam, bericht);
      await logTijdlijn(aanvraag.objectType, aanvraag.objectId, "escalatie_stap_1", bericht);

      if (ontvangerEmail) {
        try {
          await stuurGoedkeuringEscalatieMail({
            naarEmail: ontvangerEmail,
            naarNaam: ontvangerNaam,
            aanvraagId: aanvraag.id,
            documentType: aanvraag.documentType,
            omschrijving: aanvraag.omschrijving,
            escalatieType: "escalatie_1",
            bericht,
          });
        } catch (err) {
          logger.warn({ err, aanvraagId: aanvraag.id }, "Goedkeuring escalatie-stap-1 mail niet verstuurd");
        }
      }
      verwerkt++;
    }

    // ── Escalatie stap 2 ──────────────────────────────────────────────────
    if (
      beleid.escalatieStap2Uren != null &&
      urenVerstreken(indienTijdstip, beleid.escalatieStap2Uren) &&
      !(await heeftEscalatieType(aanvraag.id, "escalatie_2"))
    ) {
      let ontvangerGebruikerId: number | null = beleid.escalatieStap2GebruikerId ?? null;
      let ontvangerNaam: string | null = null;
      let ontvangerEmail: string | null = null;

      if (ontvangerGebruikerId) {
        const g = await zoekGebruiker(ontvangerGebruikerId);
        ontvangerNaam = g?.naam ?? null;
        ontvangerEmail = g?.email ?? null;
      } else {
        const hb = await zoekHoofdBeheerder();
        ontvangerGebruikerId = hb?.id ?? null;
        ontvangerNaam = hb?.naam ?? null;
        ontvangerEmail = hb?.email ?? null;
      }

      const bericht = `Escalatie (stap 2): aanvraag #${aanvraag.id} (${aanvraag.documentType}) staat ${beleid.escalatieStap2Uren} uur open. Urgente actie vereist.`;
      await logEscalatie(aanvraag.id, "escalatie_2", ontvangerGebruikerId, ontvangerNaam, bericht);
      await logTijdlijn(aanvraag.objectType, aanvraag.objectId, "escalatie_stap_2", bericht);

      if (ontvangerEmail) {
        try {
          await stuurGoedkeuringEscalatieMail({
            naarEmail: ontvangerEmail,
            naarNaam: ontvangerNaam,
            aanvraagId: aanvraag.id,
            documentType: aanvraag.documentType,
            omschrijving: aanvraag.omschrijving,
            escalatieType: "escalatie_2",
            bericht,
          });
        } catch (err) {
          logger.warn({ err, aanvraagId: aanvraag.id }, "Goedkeuring escalatie-stap-2 mail niet verstuurd");
        }
      }
      verwerkt++;
    }

    // ── Maximale doorlooptijd ─────────────────────────────────────────────
    if (
      beleid.maxDoorlooptijdUren != null &&
      urenVerstreken(indienTijdstip, beleid.maxDoorlooptijdUren) &&
      !(await heeftEscalatieType(aanvraag.id, "max_doorlooptijd"))
    ) {
      const hb = await zoekHoofdBeheerder();

      const bericht = `Maximale doorlooptijd overschreden: aanvraag #${aanvraag.id} (${aanvraag.documentType}) staat langer dan ${beleid.maxDoorlooptijdUren} uur open. Directe interventie vereist.`;
      await logEscalatie(aanvraag.id, "max_doorlooptijd", hb?.id ?? null, hb?.naam ?? null, bericht);
      await logTijdlijn(aanvraag.objectType, aanvraag.objectId, "max_doorlooptijd_overschreden", bericht);

      if (hb?.email) {
        try {
          await stuurGoedkeuringEscalatieMail({
            naarEmail: hb.email,
            naarNaam: hb.naam,
            aanvraagId: aanvraag.id,
            documentType: aanvraag.documentType,
            omschrijving: aanvraag.omschrijving,
            escalatieType: "max_doorlooptijd",
            bericht,
          });
        } catch (err) {
          logger.warn({ err, aanvraagId: aanvraag.id }, "Goedkeuring max-doorlooptijd mail niet verstuurd");
        }
      }
      verwerkt++;
    }
  }

  return verwerkt;
}

// ── Plannen ───────────────────────────────────────────────────────────────────

let _bewakingGepland = false;

/**
 * Plant de uurlijkse bewakingstaak voor goedkeurings-escalaties.
 * Veilig om meerdere keren aan te roepen — plant slechts één timer.
 */
export function planUurlijkseGoedkeuringBewaking(): void {
  if (_bewakingGepland) return;
  _bewakingGepland = true;

  function scheduleNext() {
    setTimeout(async () => {
      try {
        logger.info("Goedkeuring-bewaking: check starten");
        const n = await verwerkOpenAanvragen();
        if (n > 0) {
          logger.info({ verwerkt: n }, "Goedkeuring-bewaking: escalaties verstuurd");
        }
      } catch (err) {
        logger.error({ err }, "Goedkeuring-bewaking: check mislukt");
      }
      scheduleNext();
    }, 60 * 60 * 1000).unref(); // elk uur
  }

  // Direct een eerste check uitvoeren na 10 seconden (om opstartconflicten te vermijden)
  setTimeout(async () => {
    try {
      logger.info("Goedkeuring-bewaking: eerste check na opstart");
      await verwerkOpenAanvragen();
    } catch (err) {
      logger.error({ err }, "Goedkeuring-bewaking: eerste check mislukt");
    }
    scheduleNext();
  }, 10_000).unref();
}

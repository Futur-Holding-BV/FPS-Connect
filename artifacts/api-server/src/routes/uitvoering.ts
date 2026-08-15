// Uitvoering — overzicht van opdrachten in de uitvoeringsfase, met alles wat
// aandacht vraagt voor wie op de bouw staat: openstaande werkbakitems,
// wachtende materiaalaanvragen en afwijkingen die nog beslist moeten worden.
//
// Alleen aggregatie/lezen; alle schrijfacties lopen via de bestaande modules
// (pim.ts, materiaal-aanvragen.ts, werkbak.ts, uren.ts, ...). Projecten-
// niveau 1 = lezen zónder bedragen — dit endpoint geeft bewust geen enkel
// bedrag terug (PROJECTEN-sleutel), dus niveau 1 volstaat.
import { Router } from "express";
import {
  db,
  opdrachtenTable,
  pimModellenTable,
  pimUitvoeringStappenTable,
  materiaalAanvragenTable,
  werkbakItemsTable,
  planningItemsTable,
  medewerkersTable,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();
const lezen = requireBevoegdheid("projecten", 1);

// ── GET /uitvoering/overzicht ────────────────────────────────────────────────
// Opdrachten in fase uitvoering of oplevering (oplevercontrole hoort bij dit
// scherm), met per opdracht: wie eraan werkt, voortgang van de stappen en de
// aandachtspunten. Een uitkomst van nul is een antwoord: lege lijsten en
// nul-tellingen worden gewoon teruggegeven.
router.get("/uitvoering/overzicht", lezen, async (_req, res): Promise<void> => {
  try {
    const opdrachten = await db
      .select({
        id: opdrachtenTable.id,
        titel: opdrachtenTable.titel,
        werknummer: opdrachtenTable.werknummer,
        opdrachtgever: opdrachtenTable.opdrachtgever,
        status: opdrachtenTable.status,
        aiFase: opdrachtenTable.aiFase,
      })
      .from(opdrachtenTable)
      .where(
        and(
          inArray(opdrachtenTable.aiFase, ["uitvoering", "oplevering"]),
          eq(opdrachtenTable.status, "actief"),
        ),
      );

    if (opdrachten.length === 0) {
      res.json({ opdrachten: [] });
      return;
    }
    const ids = opdrachten.map((o) => o.id);

    // Wie eraan werkt: medewerkers met een (niet-vervallen) planning-item.
    const planningRijen = await db
      .select({
        opdrachtId: planningItemsTable.opdrachtId,
        naam: medewerkersTable.naam,
      })
      .from(planningItemsTable)
      .innerJoin(medewerkersTable, eq(planningItemsTable.medewerkerId, medewerkersTable.id))
      .where(
        and(
          inArray(planningItemsTable.opdrachtId, ids),
          sql`${planningItemsTable.status} <> 'vervallen'`,
        ),
      );
    const monteursPerOpdracht = new Map<number, string[]>();
    for (const r of planningRijen) {
      if (r.opdrachtId == null) continue;
      const lijst = monteursPerOpdracht.get(r.opdrachtId) ?? [];
      if (!lijst.includes(r.naam)) lijst.push(r.naam);
      monteursPerOpdracht.set(r.opdrachtId, lijst);
    }

    // Voortgang + onbesliste afwijkingen uit de PIM-uitvoeringsstappen.
    const stapRijen = await db
      .select({
        opdrachtId: pimModellenTable.opdrachtId,
        totaal: sql<number>`count(*)::int`,
        voltooid: sql<number>`count(*) filter (where ${pimUitvoeringStappenTable.status} in ('voltooid','overgeslagen'))::int`,
        onbeslisteAfwijkingen: sql<number>`count(*) filter (where ${pimUitvoeringStappenTable.afwijkingJson} is not null and ${pimUitvoeringStappenTable.afwijkingJson}->>'beslissing' is null)::int`,
      })
      .from(pimUitvoeringStappenTable)
      .innerJoin(pimModellenTable, eq(pimUitvoeringStappenTable.pimId, pimModellenTable.id))
      .where(inArray(pimModellenTable.opdrachtId, ids))
      .groupBy(pimModellenTable.opdrachtId);
    const stappenPerOpdracht = new Map(stapRijen.map((r) => [r.opdrachtId, r]));

    // Wachtende materiaalaanvragen (status 'nieuw' = nog niet behandeld).
    const materiaalRijen = await db
      .select({
        opdrachtId: materiaalAanvragenTable.opdrachtId,
        aantal: sql<number>`count(*)::int`,
      })
      .from(materiaalAanvragenTable)
      .where(
        and(
          inArray(materiaalAanvragenTable.opdrachtId, ids),
          eq(materiaalAanvragenTable.status, "nieuw"),
        ),
      )
      .groupBy(materiaalAanvragenTable.opdrachtId);
    const materiaalPerOpdracht = new Map(materiaalRijen.map((r) => [r.opdrachtId, r.aantal]));

    // Openstaande werkbakitems die rechtstreeks aan de opdracht hangen.
    const werkbakRijen = await db
      .select({
        herkomstId: werkbakItemsTable.herkomstId,
        aantal: sql<number>`count(*)::int`,
      })
      .from(werkbakItemsTable)
      .where(
        and(
          eq(werkbakItemsTable.herkomstType, "opdracht"),
          inArray(werkbakItemsTable.herkomstId, ids),
          eq(werkbakItemsTable.status, "open"),
        ),
      )
      .groupBy(werkbakItemsTable.herkomstId);
    const werkbakPerOpdracht = new Map(werkbakRijen.map((r) => [r.herkomstId, r.aantal]));

    res.json({
      opdrachten: opdrachten.map((o) => {
        const stappen = stappenPerOpdracht.get(o.id);
        return {
          id: o.id,
          titel: o.titel,
          werknummer: o.werknummer ?? null,
          opdrachtgever: o.opdrachtgever ?? null,
          fase: o.aiFase ?? "uitvoering",
          monteurs: monteursPerOpdracht.get(o.id) ?? [],
          stappen_totaal: stappen?.totaal ?? 0,
          stappen_voltooid: stappen?.voltooid ?? 0,
          onbesliste_afwijkingen: stappen?.onbeslisteAfwijkingen ?? 0,
          wachtende_materiaal_aanvragen: materiaalPerOpdracht.get(o.id) ?? 0,
          open_werkbak_items: werkbakPerOpdracht.get(o.id) ?? 0,
        };
      }),
    });
  } catch (err) {
    logger.error({ err }, "uitvoering-overzicht mislukt");
    res.status(500).json({ error: "Serverfout bij ophalen uitvoeringsoverzicht" });
  }
});

export default router;

// FACTUUR_01 — beheeringang voor uitzendbureau-koppelingen.
//
// Historisch is het uitzendbureau als vrije tekst vastgelegd op gebruikers en
// medewerkers (bedrijf_uitzendbureau). De bron van waarheid wordt de
// verwijzing uitzendbureau_id → crm_klanten. Het migratiescript
// (scripts/src/migreer-uitzendbureau-koppelingen.ts) koppelt eenduidige
// naam-matches automatisch; alles wat overblijft is hier zichtbaar zodat een
// beheerder het één keer handmatig kan oplossen. Nooit koppelen bij twijfel:
// de kandidatenlijst is een hulpmiddel, de mens beslist.
import { Router } from "express";
import { and, eq, isNull, isNotNull, ne, sql } from "drizzle-orm";
import { db, gebruikersTable, medewerkersTable, crmKlantenTable } from "@workspace/db";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();
const lezen = requireBevoegdheid("personeel", 1);
const schrijven = requireBevoegdheid("personeel", 2);

// Verzamel alle nog niet gekoppelde tekstwaarden uit beide tabellen.
async function openstaandeTeksten(): Promise<Map<string, { gebruikers: number; medewerkers: number }>> {
  const perTekst = new Map<string, { gebruikers: number; medewerkers: number }>();
  const gebruikers = await db
    .select({ tekst: gebruikersTable.bedrijfUitzendbureau, aantal: sql<number>`count(*)::int` })
    .from(gebruikersTable)
    .where(and(
      isNotNull(gebruikersTable.bedrijfUitzendbureau),
      ne(gebruikersTable.bedrijfUitzendbureau, ""),
      isNull(gebruikersTable.uitzendbureauId),
    ))
    .groupBy(gebruikersTable.bedrijfUitzendbureau);
  for (const r of gebruikers) {
    const tekst = (r.tekst ?? "").trim();
    if (!tekst) continue;
    const bestaand = perTekst.get(tekst) ?? { gebruikers: 0, medewerkers: 0 };
    bestaand.gebruikers += r.aantal;
    perTekst.set(tekst, bestaand);
  }
  const medewerkers = await db
    .select({ tekst: medewerkersTable.bedrijfUitzendbureau, aantal: sql<number>`count(*)::int` })
    .from(medewerkersTable)
    .where(and(
      isNotNull(medewerkersTable.bedrijfUitzendbureau),
      ne(medewerkersTable.bedrijfUitzendbureau, ""),
      isNull(medewerkersTable.uitzendbureauId),
    ))
    .groupBy(medewerkersTable.bedrijfUitzendbureau);
  for (const r of medewerkers) {
    const tekst = (r.tekst ?? "").trim();
    if (!tekst) continue;
    const bestaand = perTekst.get(tekst) ?? { gebruikers: 0, medewerkers: 0 };
    bestaand.medewerkers += r.aantal;
    perTekst.set(tekst, bestaand);
  }
  return perTekst;
}

// GET /uitzendbureau-koppelingen — handmatig te koppelen lijst met kandidaten.
router.get("/uitzendbureau-koppelingen", lezen, async (_req, res): Promise<void> => {
  try {
    const perTekst = await openstaandeTeksten();
    const organisaties = await db
      .select({ id: crmKlantenTable.id, naam: crmKlantenTable.naam, type: crmKlantenTable.type })
      .from(crmKlantenTable);
    const openstaand = [...perTekst.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "nl"))
      .map(([tekst, aantallen]) => {
        const laag = tekst.toLowerCase();
        const kandidaten = organisaties
          .filter((o) => {
            const naam = o.naam.toLowerCase();
            return naam === laag || naam.includes(laag) || laag.includes(naam);
          })
          .slice(0, 10)
          .map((o) => ({ id: o.id, naam: o.naam, type: o.type ?? null }));
        return {
          tekst,
          aantal_gebruikers: aantallen.gebruikers,
          aantal_medewerkers: aantallen.medewerkers,
          kandidaten,
        };
      });
    res.json({ openstaand });
  } catch (err) {
    console.error("Fout bij ophalen uitzendbureau-koppelingen:", err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /uitzendbureau-koppelingen — koppel één tekstwaarde aan een organisatie.
// Zet uitzendbureau_id op alle gebruikers/medewerkers met exact die tekst en
// zet het organisatietype op "uitzendbureau" als het nog leverancier/overig was.
router.post("/uitzendbureau-koppelingen", schrijven, async (req, res): Promise<void> => {
  try {
    const tekst = typeof req.body?.tekst === "string" ? req.body.tekst.trim() : "";
    const crmKlantId = Number(req.body?.crm_klant_id);
    if (!tekst || !Number.isInteger(crmKlantId)) {
      return void res.status(400).json({ error: "tekst en crm_klant_id zijn verplicht" });
    }
    const [organisatie] = await db
      .select({ id: crmKlantenTable.id, type: crmKlantenTable.type })
      .from(crmKlantenTable)
      .where(eq(crmKlantenTable.id, crmKlantId));
    if (!organisatie) {
      return void res.status(404).json({ error: "Organisatie niet gevonden" });
    }
    // Alleen koppelen aan organisaties die (na typecorrectie) uitzendbureau of
    // inlener zijn. Een bewust ander type (aannemer, gemeente, …) koppelen is
    // vrijwel zeker een vergissing — UI-filtering is geen integriteitsgrens.
    const toegestaneTypen = ["uitzendbureau", "inlener", "leverancier", "overig", null];
    if (!toegestaneTypen.includes(organisatie.type ?? null)) {
      return void res.status(400).json({
        error: `Organisatie heeft type "${organisatie.type}"; alleen uitzendbureau/inlener (of leverancier/overig, die dan uitzendbureau worden) kunnen gekoppeld worden.`,
      });
    }
    const resultaat = await db.transaction(async (tx) => {
      const g = await tx
        .update(gebruikersTable)
        .set({ uitzendbureauId: crmKlantId })
        .where(and(
          sql`lower(trim(${gebruikersTable.bedrijfUitzendbureau})) = ${tekst.toLowerCase()}`,
          isNull(gebruikersTable.uitzendbureauId),
        ))
        .returning({ id: gebruikersTable.id });
      const m = await tx
        .update(medewerkersTable)
        .set({ uitzendbureauId: crmKlantId })
        .where(and(
          sql`lower(trim(${medewerkersTable.bedrijfUitzendbureau})) = ${tekst.toLowerCase()}`,
          isNull(medewerkersTable.uitzendbureauId),
        ))
        .returning({ id: medewerkersTable.id });
      // Typecorrectie alleen bij neutrale typen; een bewust gekozen ander type
      // (bv. aannemer) blijft staan — dat is een beheerdersbeslissing.
      if (organisatie.type === "leverancier" || organisatie.type === "overig" || organisatie.type == null) {
        await tx.update(crmKlantenTable).set({ type: "uitzendbureau" }).where(eq(crmKlantenTable.id, crmKlantId));
      }
      return { gebruikers: g.length, medewerkers: m.length };
    });
    res.json({ gekoppelde_gebruikers: resultaat.gebruikers, gekoppelde_medewerkers: resultaat.medewerkers });
  } catch (err) {
    console.error("Fout bij koppelen uitzendbureau:", err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

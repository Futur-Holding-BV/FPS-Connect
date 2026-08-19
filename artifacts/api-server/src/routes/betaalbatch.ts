// ── ADMINISTRATIE_02 §3: crediteuren-betaalbatch met SEPA (pain.001) ─────────
// Achter de akkoord-schakelaar app_instellingen.betaalbatch_actief (standaard
// UIT). Zolang die uit staat weigeren alle batch-endpoints met 423 — de code
// is aanwezig maar de functie gaat pas werken na uitdrukkelijk akkoord van de
// directie. De schakelaar zelf is alleen door de hoofdbeheerder om te zetten
// via de bestaande app-instellingenroute.
//
// Selectieregels (fail-closed):
// - alleen inkoopfacturen die geaccordeerd én geboekt (AccountView-boeking) zijn
// - nooit geblokkeerd, afgekeurd of al (deels) betaald
// - factuur-BV moet gelijk zijn aan de batch-BV (BV op het werk-resolver)
// - crediteur moet een geldig IBAN hebben (leveranciersregister)
// - G-rekeningfacturen vallen buiten de batch (verdeelde betaling = handwerk)
// - een factuur kan maar in één lopende batch zitten (unieke index)
//
// Bevestigen gebeurt in ÉÉN handeling en zet de facturen op betaald — er is
// (nog) geen bankafschrift-import (CAMT/MT940) om de uitvoering automatisch
// terug te koppelen; dat is gemeld in docs/metingen.

import { Router } from "express";
import type { Request, Response } from "express";
import {
  db, facturenTable, betaalbatchesTable, betaalbatchRegelsTable,
  leveranciersTable, appInstellingenTable, werkgeversTable,
  werkgeverBankrekeningenTable,
} from "@workspace/db";
import { eq, and, desc, isNull, ne, or, inArray } from "drizzle-orm";
import { requireBevoegdheid, requireRol } from "../middlewares/auth";
import { bepaalFactuurWerkmaatschappij } from "../services/factuurWerkmaatschappij";
import { genereerPain001, valideerIban } from "../lib/sepaBetaalbestand";
import { veiligeFoutmelding } from "../middlewares/foutafhandelaar";
import { logger } from "../lib/logger";

const router = Router();

async function batchActief(): Promise<boolean> {
  const [inst] = await db.select({ actief: appInstellingenTable.betaalbatchActief })
    .from(appInstellingenTable).limit(1);
  return inst?.actief === true;
}

// Gate: 423 Locked zolang de directie geen akkoord heeft gegeven.
async function eisBatchActief(res: Response): Promise<boolean> {
  if (await batchActief()) return true;
  res.status(423).json({
    error: "Betaalbatch staat uit",
    detail: "De crediteuren-betaalfunctie gaat pas werken na uitdrukkelijk akkoord van de directie (instelling betaalbatch_actief).",
  });
  return false;
}

type BetaalbaarResultaat = {
  factuur_id: number;
  factuurnummer: string | null;
  relatienaam: string | null;
  bedrag: number;
  vervaldatum: string | null;
  crediteur_iban: string | null;
  betaalbaar: boolean;
  reden: string | null;
};

async function beoordeelFactuur(
  factuur: typeof facturenTable.$inferSelect,
  werkgeverId: number,
): Promise<BetaalbaarResultaat> {
  const basis = {
    factuur_id: factuur.id,
    factuurnummer: factuur.factuurnummer,
    relatienaam: factuur.relatienaam,
    bedrag: factuur.bedragInclBtw != null ? Number.parseFloat(factuur.bedragInclBtw) : 0,
    vervaldatum: factuur.vervaldatum,
    crediteur_iban: null as string | null,
  };
  const afkeur = (reden: string): BetaalbaarResultaat => ({ ...basis, betaalbaar: false, reden });

  if (factuur.type !== "inkoop") return afkeur("Geen inkoopfactuur");
  if (!factuur.geaccordeerd) return afkeur("Niet geaccordeerd");
  if (factuur.geblokkeerd) return afkeur("Geblokkeerd");
  if (factuur.status === "afgekeurd") return afkeur("Afgekeurd");
  if (!factuur.accountviewBoekingId) return afkeur("Nog niet geboekt in AccountView");
  if (factuur.betaalstatus === "betaald" || factuur.betaaldOp != null) return afkeur("Al betaald");
  if (factuur.gRekeningVanToepassing) return afkeur("G-rekening: verdeelde betaling is handwerk");
  if (basis.bedrag <= 0) return afkeur("Geen positief factuurbedrag");

  const bv = await bepaalFactuurWerkmaatschappij(factuur);
  if (bv == null) return afkeur("Werkmaatschappij van de factuur is onbekend");
  if (bv.id !== werkgeverId) return afkeur("Factuur hoort bij een andere werkmaatschappij");

  if (factuur.leverancierId == null) return afkeur("Geen leverancier gekoppeld");
  const [lev] = await db.select({ iban: leveranciersTable.iban, naam: leveranciersTable.naam })
    .from(leveranciersTable).where(eq(leveranciersTable.id, factuur.leverancierId)).limit(1);
  if (!lev?.iban || !valideerIban(lev.iban)) return afkeur("Leverancier heeft geen geldig IBAN");

  const [alInBatch] = await db.select({ id: betaalbatchRegelsTable.id })
    .from(betaalbatchRegelsTable).where(eq(betaalbatchRegelsTable.factuurId, factuur.id)).limit(1);
  if (alInBatch) return afkeur("Zit al in een betaalbatch");

  return { ...basis, crediteur_iban: lev.iban, betaalbaar: true, reden: null };
}

// Betaalbare facturen voor een BV (met redenen voor wat er buiten valt).
router.get("/betaalbatches/betaalbare-facturen", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  if (!(await eisBatchActief(res))) return;
  const werkgeverId = Number.parseInt(String(req.query.werkgever_id ?? ""), 10);
  if (!Number.isFinite(werkgeverId)) { res.status(400).json({ error: "werkgever_id is verplicht" }); return; }

  const kandidaten = await db.select().from(facturenTable)
    // Bewust breed: de beoordeling hieronder geeft per factuur de reden waarom
    // hij (nog) niet betaalbaar is — dat is zichtbaar voor de gebruiker.
    .where(and(
      eq(facturenTable.type, "inkoop"),
      ne(facturenTable.status, "afgekeurd"),
      isNull(facturenTable.betaaldOp),
      or(isNull(facturenTable.betaalstatus), ne(facturenTable.betaalstatus, "betaald")),
    ))
    .orderBy(facturenTable.vervaldatum);

  const items: BetaalbaarResultaat[] = [];
  for (const f of kandidaten) items.push(await beoordeelFactuur(f, werkgeverId));
  res.json({ items });
});

router.get("/betaalbatches", requireBevoegdheid("financieel", 2), async (_req: Request, res: Response): Promise<void> => {
  if (!(await eisBatchActief(res))) return;
  const batches = await db.select({
    batch: betaalbatchesTable,
    werkgever_naam: werkgeversTable.naam,
  }).from(betaalbatchesTable)
    .leftJoin(werkgeversTable, eq(betaalbatchesTable.werkgeverId, werkgeversTable.id))
    .orderBy(desc(betaalbatchesTable.id));
  res.json(batches.map(({ batch, werkgever_naam }) => ({
    id: batch.id, werkgever_id: batch.werkgeverId, werkgever_naam,
    status: batch.status, uitvoerdatum: batch.uitvoerdatum,
    totaal_bedrag: Number.parseFloat(batch.totaalBedrag),
    aantal_betalingen: batch.aantalBetalingen,
    bestand_referentie: batch.bestandReferentie,
    aangemaakt_op: batch.aangemaaktOp.toISOString(),
    bevestigd_op: batch.bevestigdOp?.toISOString() ?? null,
  })));
});

// Batch aanmaken: valideert élke factuur opnieuw (fail-closed) en pakt de
// crediteuren-rekening van de BV als debiteurrekening.
router.post("/betaalbatches", requireBevoegdheid("financieel", 3), async (req: Request, res: Response): Promise<void> => {
  if (!(await eisBatchActief(res))) return;
  const werkgeverId = Number.parseInt(String(req.body?.werkgever_id ?? ""), 10);
  const uitvoerdatum = String(req.body?.uitvoerdatum ?? "").trim();
  const factuurIds: number[] = Array.isArray(req.body?.factuur_ids)
    ? req.body.factuur_ids.map((v: unknown) => Number.parseInt(String(v), 10)).filter((n: number) => Number.isFinite(n))
    : [];
  if (!Number.isFinite(werkgeverId) || !/^\d{4}-\d{2}-\d{2}$/.test(uitvoerdatum) || factuurIds.length === 0) {
    res.status(400).json({ error: "werkgever_id, uitvoerdatum (YYYY-MM-DD) en factuur_ids zijn verplicht" });
    return;
  }

  const [wg] = await db.select().from(werkgeversTable).where(eq(werkgeversTable.id, werkgeverId)).limit(1);
  if (!wg) { res.status(404).json({ error: "Werkmaatschappij niet gevonden" }); return; }
  const rekeningen = await db.select().from(werkgeverBankrekeningenTable)
    .where(eq(werkgeverBankrekeningenTable.werkgeverId, werkgeverId));
  const crediteurenRekening = rekeningen.find((r) => (r.doelen ?? []).includes("crediteuren")) ?? rekeningen[0];
  if (!crediteurenRekening || !valideerIban(crediteurenRekening.iban)) {
    res.status(422).json({ error: "Deze werkmaatschappij heeft geen (geldige) bankrekening met doel crediteuren" });
    return;
  }

  const userId = req.session?.userId ?? null;
  try {
    const batch = await db.transaction(async (tx) => {
      // Row locks: beoordeel de facturen bínnen de transactie, zodat een
      // parallelle blokkade/afkeuring/betaling tussen selectie en insert
      // niet tot een ongeldige batch kan leiden (review-eis).
      const facturen = await tx.select().from(facturenTable)
        .where(inArray(facturenTable.id, factuurIds)).for("update");
      const beoordelingen = await Promise.all(facturen.map((f) => beoordeelFactuur(f, werkgeverId)));
      const nietBetaalbaar = beoordelingen.filter((b) => !b.betaalbaar);
      if (nietBetaalbaar.length > 0 || beoordelingen.length !== factuurIds.length) {
        const fout = new Error("NIET_BETAALBAAR") as Error & { detail?: string[] };
        fout.detail = nietBetaalbaar.map((b) => `${b.factuurnummer ?? b.factuur_id}: ${b.reden}`);
        throw fout;
      }
      const totaal = beoordelingen.reduce((s, b) => s + b.bedrag, 0);
      const [nieuw] = await tx.insert(betaalbatchesTable).values({
        werkgeverId, uitvoerdatum, status: "concept",
        debiteurIban: crediteurenRekening.iban, debiteurNaam: crediteurenRekening.tenaamstelling,
        totaalBedrag: totaal.toFixed(2), aantalBetalingen: beoordelingen.length,
        aangemaaktDoor: userId,
      }).returning();
      await tx.update(betaalbatchesTable)
        .set({ bestandReferentie: `FPS-BATCH-${nieuw!.id}` })
        .where(eq(betaalbatchesTable.id, nieuw!.id));
      for (const b of beoordelingen) {
        await tx.insert(betaalbatchRegelsTable).values({
          batchId: nieuw!.id, factuurId: b.factuur_id,
          crediteurNaam: b.relatienaam ?? "Onbekend", crediteurIban: b.crediteur_iban!,
          bedrag: b.bedrag.toFixed(2),
          omschrijving: b.factuurnummer ?? `Factuur ${b.factuur_id}`,
        });
      }
      return { rij: nieuw!, totaal, aantal: beoordelingen.length };
    });
    res.status(201).json({ id: batch.rij.id, status: "concept", totaal_bedrag: batch.totaal, aantal_betalingen: batch.aantal });
  } catch (err) {
    if (err instanceof Error && err.message === "NIET_BETAALBAAR") {
      res.status(422).json({
        error: "Niet alle facturen zijn betaalbaar",
        detail: (err as Error & { detail?: string[] }).detail ?? [],
      });
      return;
    }
    // Unieke index: factuur zit al in een batch (race met een collega).
    logger.warn({ err }, "betaalbatch aanmaken faalde");
    res.status(409).json({ error: "Een van de facturen zit al in een andere betaalbatch", detail: veiligeFoutmelding(err) });
  }
});

// SEPA-bestand (pain.001) downloaden; markeert de batch als bestand_aangemaakt.
router.get("/betaalbatches/:id/pain001", requireBevoegdheid("financieel", 3), async (req: Request, res: Response): Promise<void> => {
  if (!(await eisBatchActief(res))) return;
  const id = Number.parseInt(String(req.params.id ?? ""), 10);
  const [batch] = await db.select().from(betaalbatchesTable).where(eq(betaalbatchesTable.id, id)).limit(1);
  if (!batch) { res.status(404).json({ error: "Batch niet gevonden" }); return; }
  if (batch.status === "geannuleerd") { res.status(422).json({ error: "Batch is geannuleerd" }); return; }
  const regels = await db.select().from(betaalbatchRegelsTable).where(eq(betaalbatchRegelsTable.batchId, id));

  const xml = genereerPain001({
    referentie: batch.bestandReferentie ?? `FPS-BATCH-${batch.id}`,
    debiteurNaam: batch.debiteurNaam, debiteurIban: batch.debiteurIban,
    uitvoerdatum: batch.uitvoerdatum, aangemaaktOp: batch.aangemaaktOp,
    betalingen: regels.map((r) => ({
      eindToEndId: `${batch.bestandReferentie ?? `FPS-BATCH-${batch.id}`}-${r.factuurId}`,
      crediteurNaam: r.crediteurNaam, crediteurIban: r.crediteurIban,
      bedrag: Number.parseFloat(r.bedrag), omschrijving: r.omschrijving,
    })),
  });
  if (batch.status === "concept") {
    await db.update(betaalbatchesTable)
      .set({ status: "bestand_aangemaakt", bestandAangemaaktOp: new Date(), bijgewerktOp: new Date() })
      .where(eq(betaalbatchesTable.id, id));
  }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${batch.bestandReferentie ?? `FPS-BATCH-${batch.id}`}.xml"`);
  res.send(xml);
});

// Bevestigen in één handeling: batch definitief + facturen op betaald.
// Er is geen bankafschrift-import om dit automatisch te doen — gemeld.
// FACTUUR_03: de vrijgave van een betaalbatch is één vaste directiepoort —
// alleen de hoofdbeheerder (directie), zonder bedragsgrens en zonder
// delegatie. Aanmaken/downloaden blijft financieel niveau 3; vrijgeven niet.
router.post("/betaalbatches/:id/bevestigen", requireRol("hoofdbeheerder"), async (req: Request, res: Response): Promise<void> => {
  if (!(await eisBatchActief(res))) return;
  const id = Number.parseInt(String(req.params.id ?? ""), 10);
  const userId = req.session?.userId ?? null;
  const [batch] = await db.select().from(betaalbatchesTable).where(eq(betaalbatchesTable.id, id)).limit(1);
  if (!batch) { res.status(404).json({ error: "Batch niet gevonden" }); return; }
  if (batch.status !== "bestand_aangemaakt") {
    res.status(422).json({ error: "Alleen een batch waarvan het bestand is aangemaakt kan worden bevestigd" });
    return;
  }
  const regels = await db.select().from(betaalbatchRegelsTable).where(eq(betaalbatchRegelsTable.batchId, id));
  const nu = new Date();
  await db.transaction(async (tx) => {
    // Optimistische vergrendeling: alleen vanuit bestand_aangemaakt.
    const bijgewerkt = await tx.update(betaalbatchesTable)
      .set({ status: "bevestigd", bevestigdOp: nu, bevestigdDoor: userId, bijgewerktOp: nu })
      .where(and(eq(betaalbatchesTable.id, id), eq(betaalbatchesTable.status, "bestand_aangemaakt")))
      .returning({ id: betaalbatchesTable.id });
    if (bijgewerkt.length === 0) throw new Error("Batch is intussen al bevestigd of gewijzigd");
    for (const r of regels) {
      await tx.update(facturenTable)
        .set({ betaalstatus: "betaald", betaaldatum: batch.uitvoerdatum, betaaldOp: nu, bijgewerktOp: nu })
        .where(and(eq(facturenTable.id, r.factuurId), isNull(facturenTable.betaaldOp)));
    }
  });
  res.json({ status: "bevestigd", facturen_betaald: regels.length });
});

// Annuleren: alleen zolang niet bevestigd; regels verdwijnen zodat facturen
// weer betaalbaar worden.
router.post("/betaalbatches/:id/annuleren", requireBevoegdheid("financieel", 3), async (req: Request, res: Response): Promise<void> => {
  if (!(await eisBatchActief(res))) return;
  const id = Number.parseInt(String(req.params.id ?? ""), 10);
  const [batch] = await db.select().from(betaalbatchesTable).where(eq(betaalbatchesTable.id, id)).limit(1);
  if (!batch) { res.status(404).json({ error: "Batch niet gevonden" }); return; }
  if (batch.status === "bevestigd") { res.status(422).json({ error: "Een bevestigde batch kan niet worden geannuleerd" }); return; }
  await db.transaction(async (tx) => {
    await tx.delete(betaalbatchRegelsTable).where(eq(betaalbatchRegelsTable.batchId, id));
    await tx.update(betaalbatchesTable)
      .set({ status: "geannuleerd", bijgewerktOp: new Date() })
      .where(eq(betaalbatchesTable.id, id));
  });
  res.json({ status: "geannuleerd" });
});

export default router;

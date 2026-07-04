// Financial Intelligence Engine (FIE) — API-laag.
// Alle financiële berekeningen lopen via fie-service.ts; hier alleen routing + validatie.
// Fase 1+2: jaarbegrotingen, AK-posten, capaciteitssnapsots en live calculatieblok.
import { Router, Request, Response } from "express";
import { db, fieJaarbegrotingenTable, fieAkPostenTable, fieCapaciteitSnapshotsTable, werkgeversTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { berekenFieContext, rnd2 } from "../services/fie-service";

const router = Router();

// Bedrijfskompas is strategische financiële informatie — alleen directeur/hoofdbeheerder
// (niveau 2 = schrijven in de financieel-module = hoogste bevoegdheidsdrempel).
const lezen    = requireBevoegdheid("financieel", 2);
const schrijven = requireBevoegdheid("financieel", 2);
// Calculatiecontext is ook beschikbaar voor calculateurs (calculaties:1).
const calcLezen = requireBevoegdheid("calculaties", 1);

function parseId(v: unknown): number {
  const n = parseInt(String(v), 10);
  if (isNaN(n)) throw new Error(`Ongeldig id: ${v}`);
  return n;
}

// ─── Jaarbegrotingen ──────────────────────────────────────────────────────────

function mapBegroting(r: typeof fieJaarbegrotingenTable.$inferSelect) {
  return {
    id: r.id,
    boekjaar: r.boekjaar,
    status: r.status,
    omzet_doel: r.omzetDoel ?? null,
    directe_kosten_doel: r.directeKostenDoel ?? null,
    doel_marge_pct: r.doelMargePct,
    ak_per_productief_uur: r.akPerProductiefUur ?? null,
    productieve_uren_doel: r.productieveUrenDoel ?? null,
    verdeelsleutel: r.verdeelsleutel,
    opmerkingen: r.opmerkingen ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

function mapAkPost(r: typeof fieAkPostenTable.$inferSelect, werkgeverNaam?: string | null) {
  return {
    id: r.id,
    begroting_id: r.begrotingId,
    werkgever_id: r.werkgeverId ?? null,
    werkgever_naam: werkgeverNaam ?? null,
    categorie: r.categorie,
    omschrijving: r.omschrijving,
    bedrag_jaarbasis: r.bedragJaarbasis,
    actief: r.actief,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

// GET /fie/begrotingen
router.get("/fie/begrotingen", lezen, async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(fieJaarbegrotingenTable)
    .orderBy(desc(fieJaarbegrotingenTable.boekjaar));
  res.json(rows.map(mapBegroting));
});

// POST /fie/begrotingen
router.post("/fie/begrotingen", schrijven, async (req: Request, res: Response) => {
  const {
    boekjaar, status, omzet_doel, directe_kosten_doel,
    doel_marge_pct, ak_per_productief_uur, productieve_uren_doel,
    verdeelsleutel, opmerkingen,
  } = req.body as Record<string, unknown>;

  if (!boekjaar || typeof boekjaar !== "number") {
    res.status(400).json({ error: "boekjaar is verplicht" }); return;
  }

  const [rij] = await db.insert(fieJaarbegrotingenTable).values({
    boekjaar: boekjaar as number,
    status: (status as string | undefined) ?? "concept",
    omzetDoel: (omzet_doel as number | undefined) ?? null,
    directeKostenDoel: (directe_kosten_doel as number | undefined) ?? null,
    doelMargePct: (doel_marge_pct as number | undefined) ?? 15,
    akPerProductiefUur: (ak_per_productief_uur as number | undefined) ?? null,
    productieveUrenDoel: (productieve_uren_doel as number | undefined) ?? null,
    verdeelsleutel: (verdeelsleutel as string | undefined) ?? "uren",
    opmerkingen: (opmerkingen as string | undefined) ?? null,
  }).returning();
  res.status(201).json(mapBegroting(rij));
});

// GET /fie/begrotingen/:id  (incl. ak-posten)
router.get("/fie/begrotingen/:id", lezen, async (req: Request, res: Response) => {
  const id = parseId(req.params["id"]);

  const [begroting] = await db
    .select()
    .from(fieJaarbegrotingenTable)
    .where(eq(fieJaarbegrotingenTable.id, id))
    .limit(1);

  if (!begroting) { res.status(404).json({ error: "Begroting niet gevonden" }); return; }

  const akPostenRows = await db
    .select({ post: fieAkPostenTable, werkgeverNaam: werkgeversTable.naam })
    .from(fieAkPostenTable)
    .leftJoin(werkgeversTable, eq(fieAkPostenTable.werkgeverId, werkgeversTable.id))
    .where(eq(fieAkPostenTable.begrotingId, id));

  const akPosten = akPostenRows.map((r) => mapAkPost(r.post, r.werkgeverNaam));
  const totaalAk = rnd2(akPosten.filter((p) => p.actief).reduce((s, p) => s + p.bedrag_jaarbasis, 0));
  const productieveUren = begroting.productieveUrenDoel ?? null;
  const akPerUurBerekend = (productieveUren && productieveUren > 0 && totaalAk > 0)
    ? rnd2(totaalAk / productieveUren)
    : null;

  res.json({
    ...mapBegroting(begroting),
    ak_posten: akPosten,
    totaal_ak: totaalAk,
    ak_per_uur_berekend: akPerUurBerekend,
  });
});

// PATCH /fie/begrotingen/:id
router.patch("/fie/begrotingen/:id", schrijven, async (req: Request, res: Response) => {
  const id = parseId(req.params["id"]);
  const {
    status, omzet_doel, directe_kosten_doel, doel_marge_pct,
    ak_per_productief_uur, productieve_uren_doel, verdeelsleutel, opmerkingen,
  } = req.body as Record<string, unknown>;

  const [existing] = await db
    .select()
    .from(fieJaarbegrotingenTable)
    .where(eq(fieJaarbegrotingenTable.id, id))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Begroting niet gevonden" }); return; }

  const updateData: Partial<typeof fieJaarbegrotingenTable.$inferInsert> = {
    bijgewerktOp: new Date(),
  };
  if (status !== undefined)                 updateData.status = status as string;
  if (omzet_doel !== undefined)             updateData.omzetDoel = omzet_doel as number | null;
  if (directe_kosten_doel !== undefined)    updateData.directeKostenDoel = directe_kosten_doel as number | null;
  if (doel_marge_pct !== undefined)         updateData.doelMargePct = doel_marge_pct as number;
  if (ak_per_productief_uur !== undefined)  updateData.akPerProductiefUur = ak_per_productief_uur as number | null;
  if (productieve_uren_doel !== undefined)  updateData.productieveUrenDoel = productieve_uren_doel as number | null;
  if (verdeelsleutel !== undefined)         updateData.verdeelsleutel = verdeelsleutel as string;
  if (opmerkingen !== undefined)            updateData.opmerkingen = opmerkingen as string | null;

  const [updated] = await db
    .update(fieJaarbegrotingenTable)
    .set(updateData)
    .where(eq(fieJaarbegrotingenTable.id, id))
    .returning();
  res.json(mapBegroting(updated));
});

// ─── AK-posten ────────────────────────────────────────────────────────────────

// GET /fie/begrotingen/:id/ak-posten
router.get("/fie/begrotingen/:id/ak-posten", lezen, async (req: Request, res: Response) => {
  const id = parseId(req.params["id"]);
  const rows = await db
    .select({ post: fieAkPostenTable, werkgeverNaam: werkgeversTable.naam })
    .from(fieAkPostenTable)
    .leftJoin(werkgeversTable, eq(fieAkPostenTable.werkgeverId, werkgeversTable.id))
    .where(eq(fieAkPostenTable.begrotingId, id));
  res.json(rows.map((r) => mapAkPost(r.post, r.werkgeverNaam)));
});

// POST /fie/begrotingen/:id/ak-posten
router.post("/fie/begrotingen/:id/ak-posten", schrijven, async (req: Request, res: Response) => {
  const begrotingId = parseId(req.params["id"]);

  const [beg] = await db
    .select()
    .from(fieJaarbegrotingenTable)
    .where(eq(fieJaarbegrotingenTable.id, begrotingId))
    .limit(1);
  if (!beg) { res.status(404).json({ error: "Begroting niet gevonden" }); return; }

  const { werkgever_id, categorie, omschrijving, bedrag_jaarbasis, actief } = req.body as Record<string, unknown>;

  if (!omschrijving || typeof bedrag_jaarbasis !== "number") {
    res.status(400).json({ error: "omschrijving en bedrag_jaarbasis zijn verplicht" }); return;
  }

  const [rij] = await db.insert(fieAkPostenTable).values({
    begrotingId,
    werkgeverId: (werkgever_id as number | undefined) ?? null,
    categorie: (categorie as string | undefined) ?? "overig",
    omschrijving: omschrijving as string,
    bedragJaarbasis: bedrag_jaarbasis as number,
    actief: (actief as boolean | undefined) ?? true,
  }).returning();

  const [wg] = rij.werkgeverId
    ? await db.select().from(werkgeversTable).where(eq(werkgeversTable.id, rij.werkgeverId)).limit(1)
    : [];
  res.status(201).json(mapAkPost(rij, wg?.naam ?? null));
});

// PATCH /fie/ak-posten/:id
router.patch("/fie/ak-posten/:id", schrijven, async (req: Request, res: Response) => {
  const id = parseId(req.params["id"]);

  const [existing] = await db
    .select()
    .from(fieAkPostenTable)
    .where(eq(fieAkPostenTable.id, id))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "AK-post niet gevonden" }); return; }

  const { werkgever_id, categorie, omschrijving, bedrag_jaarbasis, actief } = req.body as Record<string, unknown>;
  const updateData: Partial<typeof fieAkPostenTable.$inferInsert> = {
    bijgewerktOp: new Date(),
  };
  if (werkgever_id !== undefined)    updateData.werkgeverId = werkgever_id as number | null;
  if (categorie !== undefined)       updateData.categorie = categorie as string;
  if (omschrijving !== undefined)    updateData.omschrijving = omschrijving as string;
  if (bedrag_jaarbasis !== undefined) updateData.bedragJaarbasis = bedrag_jaarbasis as number;
  if (actief !== undefined)          updateData.actief = actief as boolean;

  const [updated] = await db
    .update(fieAkPostenTable)
    .set(updateData)
    .where(eq(fieAkPostenTable.id, id))
    .returning();

  const wgId = updated.werkgeverId;
  const [wg] = wgId
    ? await db.select().from(werkgeversTable).where(eq(werkgeversTable.id, wgId)).limit(1)
    : [];
  res.json(mapAkPost(updated, wg?.naam ?? null));
});

// DELETE /fie/ak-posten/:id
router.delete("/fie/ak-posten/:id", schrijven, async (req: Request, res: Response) => {
  const id = parseId(req.params["id"]);
  await db.delete(fieAkPostenTable).where(eq(fieAkPostenTable.id, id));
  res.status(204).send();
});

// ─── Capaciteit ───────────────────────────────────────────────────────────────

// GET /fie/capaciteit/:boekjaar
router.get("/fie/capaciteit/:boekjaar", lezen, async (req: Request, res: Response) => {
  const boekjaar = parseId(req.params["boekjaar"]);
  const rows = await db
    .select({ snap: fieCapaciteitSnapshotsTable, werkgeverNaam: werkgeversTable.naam })
    .from(fieCapaciteitSnapshotsTable)
    .leftJoin(werkgeversTable, eq(fieCapaciteitSnapshotsTable.werkgeverId, werkgeversTable.id))
    .where(eq(fieCapaciteitSnapshotsTable.boekjaar, boekjaar))
    .orderBy(desc(fieCapaciteitSnapshotsTable.aangemaaktOp));

  const snapshots = rows.map((r) => ({
    id: r.snap.id,
    boekjaar: r.snap.boekjaar,
    werkgever_id: r.snap.werkgeverId ?? null,
    werkgever_naam: r.werkgeverNaam ?? null,
    productieve_uren: r.snap.productieveUren,
    fte: r.snap.fte ?? null,
    snapshot_datum: r.snap.snapshotDatum,
    bron: r.snap.bron,
    aangemaakt_op: r.snap.aangemaaktOp.toISOString(),
  }));

  const totaalProductieveUren = rnd2(snapshots.reduce((s, r) => s + r.productieve_uren, 0));
  const totaalFte = rnd2(snapshots.reduce((s, r) => s + (r.fte ?? 0), 0));

  res.json({ boekjaar, snapshots, totaal_productieve_uren: totaalProductieveUren, totaal_fte: totaalFte });
});

// POST /fie/capaciteit/:boekjaar
router.post("/fie/capaciteit/:boekjaar", schrijven, async (req: Request, res: Response) => {
  const boekjaar = parseId(req.params["boekjaar"]);
  const { werkgever_id, productieve_uren, fte, snapshot_datum, bron } = req.body as Record<string, unknown>;

  if (typeof productieve_uren !== "number" || !snapshot_datum) {
    res.status(400).json({ error: "productieve_uren en snapshot_datum zijn verplicht" }); return;
  }

  const [rij] = await db.insert(fieCapaciteitSnapshotsTable).values({
    boekjaar,
    werkgeverId: (werkgever_id as number | undefined) ?? null,
    productieveUren: productieve_uren as number,
    fte: (fte as number | undefined) ?? null,
    snapshotDatum: snapshot_datum as string,
    bron: (bron as string | undefined) ?? "handmatig",
  }).returning();

  const [wg] = rij.werkgeverId
    ? await db.select().from(werkgeversTable).where(eq(werkgeversTable.id, rij.werkgeverId)).limit(1)
    : [];

  const snap = {
    id: rij.id,
    boekjaar: rij.boekjaar,
    werkgever_id: rij.werkgeverId ?? null,
    werkgever_naam: wg?.naam ?? null,
    productieve_uren: rij.productieveUren,
    fte: rij.fte ?? null,
    snapshot_datum: rij.snapshotDatum,
    bron: rij.bron,
    aangemaakt_op: rij.aangemaaktOp.toISOString(),
  };

  const alleRows = await db
    .select()
    .from(fieCapaciteitSnapshotsTable)
    .where(eq(fieCapaciteitSnapshotsTable.boekjaar, boekjaar));

  const totaalProductieveUren = rnd2(alleRows.reduce((s, r) => s + r.productieveUren, 0));
  const totaalFte = rnd2(alleRows.reduce((s, r) => s + (r.fte ?? 0), 0));

  res.status(201).json({ boekjaar, snapshots: [snap], totaal_productieve_uren: totaalProductieveUren, totaal_fte: totaalFte });
});

// ─── Live FIE-context voor calculatieblok ────────────────────────────────────
// Delegeert volledige berekening aan fie-service.ts (centrale rekenmotor).

// GET /fie/context/calculatie/:id
router.get("/fie/context/calculatie/:id", calcLezen, async (req: Request, res: Response) => {
  const calcId = parseId(req.params["id"]);

  const context = await berekenFieContext(calcId);
  if (!context) { res.status(404).json({ error: "Calculatie niet gevonden" }); return; }

  res.json({
    calculatie_id: context.calculatieId,
    heeft_begroting: context.heeftBegroting,
    boekjaar: context.boekjaar,
    doel_marge_pct: context.doelMargePct,
    ak_per_uur: context.akPerUur,
    totaal_arbeid: context.totaalArbeid,
    totaal_materiaal: context.totaalMateriaal,
    totaal_onderaanneming: context.totaalOnderaanneming,
    totaal_mu: context.totaalMu,
    totaal_excl_opslag: context.totaalExclOpslag,
    totaal_incl_opslag: context.totaalInclOpslag,
    ak_bijdrage: context.akBijdrage,
    verwachte_marge_abs: context.verwachteMargeAbs,
    verwachte_marge_pct: context.verwachteMargePct,
    advies_status: context.adviesStatus,
    advies_tekst: context.adviesTekst,
    opslag_ak_pct: context.opslagAkPct,
  });
});

export default router;

// Financial Intelligence Engine (FIE) — centrale financiële rekenmotor.
// Fase 1+2: jaarbegrotingen, AK-posten, capaciteitssnapsots en live calculatieblok.
import { Router, Request, Response } from "express";
import { db, fieJaarbegrotingenTable, fieAkPostenTable, fieCapaciteitSnapshotsTable, werkgeversTable, modCalcHeadersTable, modCalcRegelsTable } from "@workspace/db";
import { eq, desc, and, sum, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();

const lezen    = requireBevoegdheid("financieel", 1);
const schrijven = requireBevoegdheid("financieel", 2);
const calcLezen = requireBevoegdheid("calculaties", 1);

function parseId(v: unknown): number {
  const n = parseInt(String(v), 10);
  if (isNaN(n)) throw new Error(`Ongeldig id: ${v}`);
  return n;
}

function rnd2(n: number) { return Math.round(n * 100) / 100; }

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

// GET /fie/context/calculatie/:id
router.get("/fie/context/calculatie/:id", calcLezen, async (req: Request, res: Response) => {
  const calcId = parseId(req.params["id"]);

  const [header] = await db
    .select()
    .from(modCalcHeadersTable)
    .where(eq(modCalcHeadersTable.id, calcId))
    .limit(1);

  if (!header) { res.status(404).json({ error: "Calculatie niet gevonden" }); return; }

  const regels = await db
    .select()
    .from(modCalcRegelsTable)
    .where(eq(modCalcRegelsTable.calculatieId, calcId));

  // Totalen uit regels
  let totaalArbeid = 0;
  let totaalMateriaal = 0;
  let totaalOnderaanneming = 0;
  let totaalMu = 0;

  for (const r of regels) {
    const arb = (r.hoeveelheid ?? 0) * (r.muPerEenheid ?? 0) * (r.arbeidsTarief ?? 0);
    const mat = (r.hoeveelheid ?? 0) * (r.tarief ?? 0);
    const oa  = r.onderaannemingBedrag ?? 0;
    totaalArbeid        += arb;
    totaalMateriaal     += mat;
    totaalOnderaanneming += oa;
    totaalMu            += (r.hoeveelheid ?? 0) * (r.muPerEenheid ?? 0);
  }

  totaalArbeid         = rnd2(totaalArbeid);
  totaalMateriaal      = rnd2(totaalMateriaal);
  totaalOnderaanneming = rnd2(totaalOnderaanneming);
  totaalMu             = rnd2(totaalMu);

  const totaalExclOpslag = rnd2(totaalArbeid + totaalMateriaal + totaalOnderaanneming);

  // Opslagen berekenen (zelfde logica als berekenTotalen in mod-calculatie)
  const opslagAk     = header.opslagAk ?? 0;   // AK-opslag %
  const opslagAbk    = header.opslagAbk ?? 0;
  const opslagRisico = header.opslagRisico ?? 0;
  const opslagWinst  = header.opslagWinst ?? 0;
  const opslagMat    = header.opslagMateriaal ?? 0;
  const opslagArb    = header.opslagArbeid ?? 0;
  const korting      = header.korting ?? 0;

  const matOpslag = rnd2(totaalMateriaal * opslagMat / 100);
  const arbOpslag = rnd2(totaalArbeid * opslagArb / 100);
  const naToeslag = rnd2(totaalExclOpslag + matOpslag + arbOpslag);

  const akBijdrageOpslag  = header.akIsVast  ? (header.opslagAk ?? 0) : rnd2(naToeslag * opslagAk / 100);
  const abkBijdrage       = header.abkIsVast ? (header.opslagAbk ?? 0) : rnd2(naToeslag * opslagAbk / 100);
  const risicoBijdrage    = header.risicoIsVast ? (header.opslagRisico ?? 0) : rnd2(naToeslag * opslagRisico / 100);
  const winstBijdrage     = header.winstIsVast  ? (header.opslagWinst ?? 0) : rnd2(naToeslag * opslagWinst / 100);

  const subtotaalMetOpslagen = rnd2(naToeslag + akBijdrageOpslag + abkBijdrage + risicoBijdrage + winstBijdrage);
  const totaalInclOpslag = rnd2(subtotaalMetOpslagen * (1 - korting / 100));

  // Actieve jaarbegroting zoeken voor huidig/vorig jaar
  const huidigJaar = new Date().getFullYear();
  const [activeBegroting] = await db
    .select()
    .from(fieJaarbegrotingenTable)
    .where(and(
      eq(fieJaarbegrotingenTable.boekjaar, huidigJaar),
      eq(fieJaarbegrotingenTable.status, "actief"),
    ))
    .limit(1);

  // Fallback: meest recente begroting als geen actieve gevonden
  const [fallbackBegroting] = activeBegroting ? [] : await db
    .select()
    .from(fieJaarbegrotingenTable)
    .orderBy(desc(fieJaarbegrotingenTable.boekjaar))
    .limit(1);

  const begroting = activeBegroting ?? fallbackBegroting ?? null;
  const heeftBegroting = !!begroting;

  let akBijdrageFie: number | null = null;
  let verwachteMarge: number | null = null;
  let verwachteMargeP: number | null = null;
  let adviesStatus = "geen_begroting";
  let adviesTekst = "Geen actieve jaarbegroting gevonden. Stel een begroting in via Beheer > Bedrijfskompas.";

  if (begroting) {
    const akPerUur = begroting.akPerProductiefUur ?? null;
    if (akPerUur !== null && totaalMu > 0) {
      akBijdrageFie = rnd2(akPerUur * totaalMu);
    }

    const doelMargePct = begroting.doelMargePct;

    if (totaalInclOpslag > 0) {
      const directeKosten = totaalArbeid + totaalMateriaal + totaalOnderaanneming;
      const akKosten = akBijdrageFie ?? (totaalInclOpslag * opslagAk / 100);
      verwachteMarge = rnd2(totaalInclOpslag - directeKosten - akKosten);
      verwachteMargeP = rnd2((verwachteMarge / totaalInclOpslag) * 100);

      const afwijking = verwachteMargeP - doelMargePct;
      if (afwijking >= 2) {
        adviesStatus = "goed";
        adviesTekst = `Verwachte marge ${verwachteMargeP.toFixed(1)}% — boven de doelmarge van ${doelMargePct}%.`;
      } else if (afwijking >= -2) {
        adviesStatus = "neutraal";
        adviesTekst = `Verwachte marge ${verwachteMargeP.toFixed(1)}% — dicht bij de doelmarge van ${doelMargePct}%.`;
      } else {
        adviesStatus = "laag";
        adviesTekst = `Verwachte marge ${verwachteMargeP.toFixed(1)}% — onder de doelmarge van ${doelMargePct}%. Overweeg tarieven of AK-opslag aan te passen.`;
      }
    } else {
      adviesStatus = "leeg";
      adviesTekst = "Calculatie heeft nog geen regels.";
    }
  }

  res.json({
    calculatie_id: calcId,
    heeft_begroting: heeftBegroting,
    boekjaar: begroting?.boekjaar ?? null,
    doel_marge_pct: begroting?.doelMargePct ?? null,
    ak_per_uur: begroting?.akPerProductiefUur ?? null,
    totaal_arbeid: totaalArbeid,
    totaal_materiaal: totaalMateriaal,
    totaal_onderaanneming: totaalOnderaanneming,
    totaal_mu: totaalMu,
    totaal_excl_opslag: totaalExclOpslag,
    totaal_incl_opslag: totaalInclOpslag,
    ak_bijdrage: akBijdrageFie,
    verwachte_marge_abs: verwachteMarge,
    verwachte_marge_pct: verwachteMargeP,
    advies_status: adviesStatus,
    advies_tekst: adviesTekst,
    opslag_ak_pct: opslagAk,
  });
});

export default router;

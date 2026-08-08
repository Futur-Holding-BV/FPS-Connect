// Regiewerk — /api/regie/*
// Volwaardige werkvorm naast aangenomen werk, onderhoud en service/storing.
// Bevoegdheid: offertes:1 lezen, offertes:2 schrijven

import { Router } from "express";
import { db } from "@workspace/db";
import {
  regieVoorwaardenTable,
  regieTarievenTable,
  regieBegrotingTable,
  regieMaterialenTable,
  opdrachtenTable,
  urenRegistratiesTable,
  medewerkersTable,
  gebruikersTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { requireAuth, requireBevoegdheid } from "../middlewares/auth";

const router = Router();
const lezen    = requireBevoegdheid("offertes", 1);
const schrijven = requireBevoegdheid("offertes", 2);

// ── Helpers ───────────────────────────────────────────────────────────────────

const FUNCTIEGROEPEN = ["monteur", "timmerman", "voorman", "projectleider", "werkvoorbereider", "onderaannemer"];
const WERKVORMEN     = ["aangenomen", "regie", "onderhoud", "service", "combinatie", "vast", "overig"];

function mapVoorwaarden(v: typeof regieVoorwaardenTable.$inferSelect, tarieven: typeof regieTarievenTable.$inferSelect[]) {
  return {
    id: v.id,
    opdrachtId: v.opdrachtId,
    contactpersoonOpdrachtgever: v.contactpersoonOpdrachtgever,
    akkoordgeverOpdrachtgever: v.akkoordgeverOpdrachtgever,
    projectleiderFps: v.projectleiderFps,
    materiaalopslag: v.materiaalopslag,
    materieelopslag: v.materieelopslag,
    transportkosten: v.transportkosten,
    voorrijkosten: v.voorrijkosten,
    toeslagAvond: v.toeslagAvond,
    toeslagWeekend: v.toeslagWeekend,
    toeslagSpoed: v.toeslagSpoed,
    betaaltermijn: v.betaaltermijn,
    facturatiefrequentie: v.facturatiefrequentie,
    handtekeningVereist: v.handtekeningVereist,
    weekstaatVereist: v.weekstaatVereist,
    fotosVereist: v.fotosVereist,
    bewijsvereisten: v.bewijsvereisten,
    notities: v.notities,
    tarieven: tarieven.map(t => ({
      id: t.id,
      functiegroep: t.functiegroep,
      tariefsoort: t.tariefsoort,
      uurtarief: t.uurtarief,
    })),
    aangemaaktOp: v.aangemaaktOp,
    bijgewerktOp: v.bijgewerktOp,
  };
}

function mapBegroting(b: typeof regieBegrotingTable.$inferSelect) {
  return {
    id: b.id,
    opdrachtId: b.opdrachtId,
    verwachtUren: b.verwachtUren,
    verwachtMateriaal: b.verwachtMateriaal,
    verwachtMaterieel: b.verwachtMaterieel,
    verwachtDoorlooptijdDagen: b.verwachtDoorlooptijdDagen,
    maximaalBudget: b.maximaalBudget,
    meldgrensOpdrachtgever: b.meldgrensOpdrachtgever,
    aiSignaleringActief: b.aiSignaleringActief,
    aangemaaktOp: b.aangemaaktOp,
    bijgewerktOp: b.bijgewerktOp,
  };
}

function mapMateriaal(m: typeof regieMaterialenTable.$inferSelect) {
  return {
    id: m.id,
    opdrachtId: m.opdrachtId,
    datum: m.datum,
    artikel: m.artikel,
    omschrijving: m.omschrijving,
    hoeveelheid: m.hoeveelheid,
    eenheid: m.eenheid,
    inkoopprijs: m.inkoopprijs,
    verkoopprijs: m.verkoopprijs,
    bron: m.bron,
    leverancier: m.leverancier,
    bonnummer: m.bonnummer,
    fotoPad: m.fotoPad,
    status: m.status,
    opmerking: m.opmerking,
    aangemaaktOp: m.aangemaaktOp,
    bijgewerktOp: m.bijgewerktOp,
  };
}

// ── GET /regie/opdrachten — alle regie-opdrachten ────────────────────────────
router.get("/regie/opdrachten", requireAuth, lezen, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(opdrachtenTable)
    .where(eq(opdrachtenTable.type, "regie"))
    .orderBy(desc(opdrachtenTable.aangemaaktOp));
  res.json(rows.map(o => ({
    id: o.id,
    titel: o.titel,
    werknummer: o.werknummer,
    opdrachtgever: o.opdrachtgever,
    omschrijving: o.omschrijving,
    type: o.type,
    status: o.status,
    aangemaaktOp: o.aangemaaktOp,
    bijgewerktOp: o.bijgewerktOp,
  })));
});

// ── GET /regie/dashboard — budget-bewaking + AI-signalering ──────────────────
router.get("/regie/dashboard", requireAuth, lezen, async (req, res): Promise<void> => {
  // Alle actieve regie-opdrachten
  const opdrachten = await db
    .select()
    .from(opdrachtenTable)
    .where(and(eq(opdrachtenTable.type, "regie"), eq(opdrachtenTable.status, "actief")));

  const signalen: {
    opdrachtId: number;
    opdrachtTitel: string;
    type: string;
    boodschap: string;
    ernst: string;
  }[] = [];

  const stats: {
    opdrachtId: number;
    titel: string;
    werknummer: string | null;
    opdrachtgever: string | null;
    besteedUren: number;
    besteedMateriaal: number;
    maximaalBudget: number | null;
    meldgrens: number | null;
    budgetPercentage: number | null;
    signalen: typeof signalen;
  }[] = [];

  for (const o of opdrachten) {
    // Geboekte uren
    const urenRows = await db
      .select({ totaal: sql<number>`coalesce(sum(netto_uren),0)` })
      .from(urenRegistratiesTable)
      .where(eq(urenRegistratiesTable.opdrachtId, o.id));
    const besteedUren = Number(urenRows[0]?.totaal ?? 0);

    // Materiaal totaal
    const matRows = await db
      .select({ totaal: sql<number>`coalesce(sum(hoeveelheid * coalesce(verkoopprijs, inkoopprijs, 0)),0)` })
      .from(regieMaterialenTable)
      .where(eq(regieMaterialenTable.opdrachtId, o.id));
    const besteedMateriaal = Number(matRows[0]?.totaal ?? 0);

    // Begroting
    const [begroting] = await db.select().from(regieBegrotingTable).where(eq(regieBegrotingTable.opdrachtId, o.id));
    const [voorwaarden] = await db.select().from(regieVoorwaardenTable).where(eq(regieVoorwaardenTable.opdrachtId, o.id));

    // Tarieven ophalen voor uren-kostprijsberekening
    const tarieven = begroting && voorwaarden
      ? await db.select().from(regieTarievenTable).where(eq(regieTarievenTable.voorwaardenId, voorwaarden.id))
      : [];

    // Alleen uur-tarieven middelen: een dagdeeltarief is geen uurprijs en zou
    // de uren-kostprijsberekening vervuilen (WVB_01 review).
    const uurTarieven = tarieven.filter(t => t.tariefsoort !== "dagdeel");
    const gemiddelTarief = uurTarieven.length > 0
      ? uurTarieven.reduce((s, t) => s + t.uurtarief, 0) / uurTarieven.length
      : 0;

    const besteedUrenEuro = besteedUren * gemiddelTarief;
    const besteedTotaal   = besteedUrenEuro + besteedMateriaal;
    const maxBudget       = begroting?.maximaalBudget ?? null;
    const meldgrens       = begroting?.meldgrensOpdrachtgever ?? null;
    const budgetPct       = maxBudget && maxBudget > 0 ? Math.round((besteedTotaal / maxBudget) * 100) : null;
    const opdSignalen: typeof signalen = [];

    if (begroting?.aiSignaleringActief) {
      if (meldgrens !== null && besteedTotaal >= meldgrens * 0.9) {
        opdSignalen.push({
          opdrachtId: o.id,
          opdrachtTitel: o.titel,
          type: "meldgrens",
          boodschap: `Regiewerk nadert de meldgrens opdrachtgever (${Math.round(besteedTotaal / meldgrens * 100)}% bereikt).`,
          ernst: besteedTotaal >= meldgrens ? "kritiek" : "waarschuwing",
        });
      }
      if (budgetPct !== null && budgetPct >= 80) {
        opdSignalen.push({
          opdrachtId: o.id,
          opdrachtTitel: o.titel,
          type: "budget",
          boodschap: `Regiewerk heeft inmiddels ${budgetPct}% van het indicatieve budget bereikt.`,
          ernst: budgetPct >= 95 ? "kritiek" : "waarschuwing",
        });
      }
      if (begroting.verwachtUren !== null && besteedUren >= begroting.verwachtUren * 0.85) {
        const urenPct = Math.round((besteedUren / begroting.verwachtUren) * 100);
        opdSignalen.push({
          opdrachtId: o.id,
          opdrachtTitel: o.titel,
          type: "uren",
          boodschap: `${urenPct}% van de verwachte uren is besteed (${besteedUren} van ${begroting.verwachtUren} uur).`,
          ernst: urenPct >= 100 ? "kritiek" : "waarschuwing",
        });
      }
    }

    signalen.push(...opdSignalen);
    stats.push({
      opdrachtId: o.id,
      titel: o.titel,
      werknummer: o.werknummer,
      opdrachtgever: o.opdrachtgever,
      besteedUren,
      besteedMateriaal,
      maximaalBudget: maxBudget,
      meldgrens,
      budgetPercentage: budgetPct,
      signalen: opdSignalen,
    });
  }

  res.json({
    aantalActief: opdrachten.length,
    signalen,
    opdrachten: stats,
  });
});

// ── GET /regie/voorwaarden/:opdrachtId ────────────────────────────────────────
router.get("/regie/voorwaarden/:opdrachtId", requireAuth, lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.opdrachtId));
  const [v] = await db.select().from(regieVoorwaardenTable).where(eq(regieVoorwaardenTable.opdrachtId, id));
  if (!v) { res.status(404).json({ fout: "Geen regievoorwaarden gevonden." }); return; }
  const tarieven = await db.select().from(regieTarievenTable).where(eq(regieTarievenTable.voorwaardenId, v.id));
  res.json(mapVoorwaarden(v, tarieven));
});

// ── PUT /regie/voorwaarden/:opdrachtId — aanmaken of bijwerken (upsert) ──────
router.put("/regie/voorwaarden/:opdrachtId", requireAuth, schrijven, async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.opdrachtId));
  const {
    contactpersoonOpdrachtgever, akkoordgeverOpdrachtgever, projectleiderFps,
    materiaalopslag, materieelopslag, transportkosten, voorrijkosten,
    toeslagAvond, toeslagWeekend, toeslagSpoed,
    betaaltermijn, facturatiefrequentie,
    handtekeningVereist, weekstaatVereist, fotosVereist,
    bewijsvereisten, notities,
    tarieven: tarievenInput,
  } = req.body as {
    contactpersoonOpdrachtgever?: string;
    akkoordgeverOpdrachtgever?: string;
    projectleiderFps?: string;
    materiaalopslag?: number;
    materieelopslag?: number;
    transportkosten?: number;
    voorrijkosten?: number;
    toeslagAvond?: number;
    toeslagWeekend?: number;
    toeslagSpoed?: number;
    betaaltermijn?: number;
    facturatiefrequentie?: string;
    handtekeningVereist?: boolean;
    weekstaatVereist?: boolean;
    fotosVereist?: boolean;
    bewijsvereisten?: string;
    notities?: string;
    tarieven?: { functiegroep: string; uurtarief: number; tariefsoort?: string }[];
  };

  const velden = {
    contactpersoonOpdrachtgever: contactpersoonOpdrachtgever ?? null,
    akkoordgeverOpdrachtgever: akkoordgeverOpdrachtgever ?? null,
    projectleiderFps: projectleiderFps ?? null,
    materiaalopslag: materiaalopslag ?? 0,
    materieelopslag: materieelopslag ?? 0,
    transportkosten: transportkosten ?? 0,
    voorrijkosten: voorrijkosten ?? 0,
    toeslagAvond: toeslagAvond ?? 0,
    toeslagWeekend: toeslagWeekend ?? 0,
    toeslagSpoed: toeslagSpoed ?? 0,
    betaaltermijn: betaaltermijn ?? 30,
    facturatiefrequentie: facturatiefrequentie ?? "maandelijks",
    handtekeningVereist: handtekeningVereist ?? false,
    weekstaatVereist: weekstaatVereist ?? false,
    fotosVereist: fotosVereist ?? false,
    bewijsvereisten: bewijsvereisten ?? null,
    notities: notities ?? null,
    bijgewerktOp: new Date(),
  };

  // Voorwaarden + tarieven in één transactie (schuldpunt 13): anders kunnen de
  // oude tarieven al verwijderd zijn terwijl de nieuwe insert faalt.
  const voorwaardenId = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(regieVoorwaardenTable).where(eq(regieVoorwaardenTable.opdrachtId, opdrachtId));

    let id: number;
    if (existing) {
      await tx.update(regieVoorwaardenTable).set(velden).where(eq(regieVoorwaardenTable.id, existing.id));
      id = existing.id;
    } else {
      const [created] = await tx.insert(regieVoorwaardenTable).values({
        opdrachtId,
        aangemaaktDoorId: req.session.userId ?? null,
        ...velden,
      }).returning();
      id = created.id;
    }

    // Tarieven vervangen
    if (Array.isArray(tarievenInput)) {
      await tx.delete(regieTarievenTable).where(eq(regieTarievenTable.voorwaardenId, id));
      if (tarievenInput.length > 0) {
        await tx.insert(regieTarievenTable).values(
          tarievenInput.map(t => ({
            voorwaardenId: id,
            functiegroep: t.functiegroep,
            // Dagdeel is een eigen tariefsoort — nooit stilzwijgend als 4 uur rekenen (WVB_01)
            tariefsoort: t.tariefsoort === "dagdeel" ? "dagdeel" : "uur",
            uurtarief: t.uurtarief,
          }))
        );
      }
    }
    return id;
  });

  const [v] = await db.select().from(regieVoorwaardenTable).where(eq(regieVoorwaardenTable.id, voorwaardenId));
  const tarieven = await db.select().from(regieTarievenTable).where(eq(regieTarievenTable.voorwaardenId, voorwaardenId));
  res.json(mapVoorwaarden(v, tarieven));
});

// ── GET /regie/begroting/:opdrachtId ─────────────────────────────────────────
router.get("/regie/begroting/:opdrachtId", requireAuth, lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.opdrachtId));
  const [b] = await db.select().from(regieBegrotingTable).where(eq(regieBegrotingTable.opdrachtId, id));
  if (!b) { res.status(404).json({ fout: "Geen regiebegroting gevonden." }); return; }
  res.json(mapBegroting(b));
});

// ── PUT /regie/begroting/:opdrachtId ─────────────────────────────────────────
router.put("/regie/begroting/:opdrachtId", requireAuth, schrijven, async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.opdrachtId));
  const {
    verwachtUren, verwachtMateriaal, verwachtMaterieel,
    verwachtDoorlooptijdDagen, maximaalBudget, meldgrensOpdrachtgever,
    aiSignaleringActief,
  } = req.body as {
    verwachtUren?: number;
    verwachtMateriaal?: number;
    verwachtMaterieel?: number;
    verwachtDoorlooptijdDagen?: number;
    maximaalBudget?: number;
    meldgrensOpdrachtgever?: number;
    aiSignaleringActief?: boolean;
  };

  const velden = {
    verwachtUren: verwachtUren ?? null,
    verwachtMateriaal: verwachtMateriaal ?? null,
    verwachtMaterieel: verwachtMaterieel ?? null,
    verwachtDoorlooptijdDagen: verwachtDoorlooptijdDagen ?? null,
    maximaalBudget: maximaalBudget ?? null,
    meldgrensOpdrachtgever: meldgrensOpdrachtgever ?? null,
    aiSignaleringActief: aiSignaleringActief ?? true,
    bijgewerktOp: new Date(),
  };

  const [existing] = await db.select().from(regieBegrotingTable).where(eq(regieBegrotingTable.opdrachtId, opdrachtId));
  let result: typeof regieBegrotingTable.$inferSelect;

  if (existing) {
    [result] = await db.update(regieBegrotingTable).set(velden).where(eq(regieBegrotingTable.id, existing.id)).returning();
  } else {
    [result] = await db.insert(regieBegrotingTable).values({
      opdrachtId,
      aangemaaktDoorId: req.session.userId ?? null,
      ...velden,
    }).returning();
  }

  res.json(mapBegroting(result));
});

// ── GET /regie/materiaal?opdrachtId=X ────────────────────────────────────────
router.get("/regie/materiaal", requireAuth, lezen, async (req, res): Promise<void> => {
  const opdrachtId = req.query.opdrachtId ? parseInt(req.query.opdrachtId as string) : null;
  const rows = opdrachtId
    ? await db.select().from(regieMaterialenTable).where(eq(regieMaterialenTable.opdrachtId, opdrachtId)).orderBy(desc(regieMaterialenTable.datum))
    : await db.select().from(regieMaterialenTable).orderBy(desc(regieMaterialenTable.datum));
  res.json(rows.map(mapMateriaal));
});

// ── POST /regie/materiaal ─────────────────────────────────────────────────────
router.post("/regie/materiaal", requireAuth, schrijven, async (req, res): Promise<void> => {
  const {
    opdrachtId, datum, artikel, omschrijving, hoeveelheid, eenheid,
    inkoopprijs, verkoopprijs, bron, leverancier, bonnummer, opmerking,
  } = req.body as {
    opdrachtId: number;
    datum: string;
    artikel: string;
    omschrijving?: string;
    hoeveelheid?: number;
    eenheid?: string;
    inkoopprijs?: number;
    verkoopprijs?: number;
    bron?: string;
    leverancier?: string;
    bonnummer?: string;
    opmerking?: string;
  };

  if (!opdrachtId || !datum || !artikel) {
    res.status(422).json({ fout: "opdrachtId, datum en artikel zijn verplicht." });
    return;
  }

  const [row] = await db.insert(regieMaterialenTable).values({
    opdrachtId,
    datum,
    artikel,
    omschrijving: omschrijving ?? null,
    hoeveelheid: hoeveelheid ?? 1,
    eenheid: eenheid ?? "st",
    inkoopprijs: inkoopprijs ?? null,
    verkoopprijs: verkoopprijs ?? null,
    bron: bron ?? "magazijn",
    leverancier: leverancier ?? null,
    bonnummer: bonnummer ?? null,
    opmerking: opmerking ?? null,
    geboektDoorId: req.session.userId ?? null,
  }).returning();

  res.status(201).json(mapMateriaal(row));
});

// ── PATCH /regie/materiaal/:id ────────────────────────────────────────────────
router.patch("/regie/materiaal/:id", requireAuth, schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const [existing] = await db.select().from(regieMaterialenTable).where(eq(regieMaterialenTable.id, id));
  if (!existing) { res.status(404).json({ fout: "Materiaalregel niet gevonden." }); return; }

  const {
    datum, artikel, omschrijving, hoeveelheid, eenheid,
    inkoopprijs, verkoopprijs, bron, leverancier, bonnummer, opmerking, status,
  } = req.body as Partial<{
    datum: string; artikel: string; omschrijving: string;
    hoeveelheid: number; eenheid: string; inkoopprijs: number; verkoopprijs: number;
    bron: string; leverancier: string; bonnummer: string; opmerking: string; status: string;
  }>;

  const [updated] = await db.update(regieMaterialenTable).set({
    ...(datum        !== undefined && { datum }),
    ...(artikel      !== undefined && { artikel }),
    ...(omschrijving !== undefined && { omschrijving }),
    ...(hoeveelheid  !== undefined && { hoeveelheid }),
    ...(eenheid      !== undefined && { eenheid }),
    ...(inkoopprijs  !== undefined && { inkoopprijs }),
    ...(verkoopprijs !== undefined && { verkoopprijs }),
    ...(bron         !== undefined && { bron }),
    ...(leverancier  !== undefined && { leverancier }),
    ...(bonnummer    !== undefined && { bonnummer }),
    ...(opmerking    !== undefined && { opmerking }),
    ...(status       !== undefined && { status }),
    bijgewerktOp: new Date(),
  }).where(eq(regieMaterialenTable.id, id)).returning();

  res.json(mapMateriaal(updated));
});

// ── DELETE /regie/materiaal/:id ───────────────────────────────────────────────
router.delete("/regie/materiaal/:id", requireAuth, schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  await db.delete(regieMaterialenTable).where(eq(regieMaterialenTable.id, id));
  res.json({ ok: true });
});

// ── GET /regie/uren?opdrachtId=X — uren van een regieproject ─────────────────
router.get("/regie/uren", requireAuth, lezen, async (req, res): Promise<void> => {
  const opdrachtId = req.query.opdrachtId ? parseInt(req.query.opdrachtId as string) : null;
  if (!opdrachtId) { res.status(422).json({ fout: "opdrachtId vereist." }); return; }

  const rows = await db
    .select({
      u: urenRegistratiesTable,
      medewerkerNaam: sql<string | null>`concat(m.voornaam, ' ', m.achternaam)`,
    })
    .from(urenRegistratiesTable)
    .leftJoin(medewerkersTable, eq(urenRegistratiesTable.medewerkerId, medewerkersTable.id))
    .where(eq(urenRegistratiesTable.opdrachtId, opdrachtId))
    .orderBy(desc(urenRegistratiesTable.datum));

  res.json(rows.map(r => ({
    id: r.u.id,
    datum: r.u.datum,
    medewerkerId: r.u.medewerkerId,
    medewerkerNaam: r.medewerkerNaam,
    werkzaamheden: r.u.werkzaamheden,
    beginTijd: r.u.beginTijd,
    eindTijd: r.u.eindTijd,
    pauzeMinuten: r.u.pauzeMinuten,
    nettoUren: r.u.nettoUren,
    tariefgroep: r.u.tariefgroep,
    reisUren: r.u.reisUren,
    wachtTijd: r.u.wachtTijd,
    akkoordVereist: r.u.akkoordVereist,
    akkoordGegeven: r.u.akkoordGegeven,
    akkoordDoorNaam: r.u.akkoordDoorNaam,
    status: r.u.status,
    opmerkingen: r.u.opmerkingen,
    aangemaaktOp: r.u.aangemaaktOp,
  })));
});

export const regieRouter = router;

import { Router } from "express";
import { db } from "@workspace/db";
import {
  urenRegistratiesTable,
  weekStatenTable,
  medewerkersTable,
  gebouwenTable,
  gebruikersTable,
  planningItemsTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, desc, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoWeekNummer(datum: Date): number {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const jaarStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - jaarStart.getTime()) / 86400000 + 1) / 7);
}

function weekGrenzen(jaar: number, week: number): { van: string; tot: string } {
  const jan4 = new Date(Date.UTC(jaar, 0, 4));
  const dag = jan4.getUTCDay() || 7;
  const maandag = new Date(jan4);
  maandag.setUTCDate(jan4.getUTCDate() - dag + 1 + (week - 1) * 7);
  const zondag = new Date(maandag);
  zondag.setUTCDate(maandag.getUTCDate() + 6);
  return {
    van: maandag.toISOString().slice(0, 10),
    tot: zondag.toISOString().slice(0, 10),
  };
}

function berekenNettoUren(begin: string, eind: string, pauzeMin: number): number {
  const [bH, bM] = begin.split(":").map(Number);
  const [eH, eM] = eind.split(":").map(Number);
  const totMin = (eH * 60 + eM) - (bH * 60 + bM);
  return Math.max(0, Math.round((totMin - pauzeMin) * 10) / 10) / 10;
}

const ADV_FACTOR = 2 / 40;
function berekenAdv(medewerker: { cao: string | null; dienstverband: string }, gewerktUren: number): number {
  if (
    (medewerker.cao ?? "").toLowerCase().includes("metaal") &&
    medewerker.dienstverband === "vast"
  ) {
    return Math.round(gewerktUren * ADV_FACTOR * 100) / 100;
  }
  return 0;
}

function mapUren(
  u: typeof urenRegistratiesTable.$inferSelect,
  extra?: {
    medewerkerNaam?: string | null;
    gebouwNaam?: string | null;
    goedgekeurdDoorNaam?: string | null;
  }
) {
  return {
    id: u.id,
    datum: u.datum,
    medewerker_id: u.medewerkerId,
    medewerker_naam: extra?.medewerkerNaam ?? null,
    gebouw_id: u.gebouwId ?? null,
    gebouw_naam: extra?.gebouwNaam ?? null,
    project_naam: u.projectNaam ?? null,
    werkzaamheden: u.werkzaamheden ?? null,
    begin_tijd: u.beginTijd,
    eind_tijd: u.eindTijd,
    pauze_minuten: u.pauzeMinuten,
    netto_uren: u.nettoUren,
    opmerkingen: u.opmerkingen ?? null,
    status: u.status,
    planning_item_id: u.planningItemId ?? null,
    ingediend_op: u.ingediendOp?.toISOString() ?? null,
    goedgekeurd_door_id: u.goedgekeurdDoorId ?? null,
    goedgekeurd_door_naam: extra?.goedgekeurdDoorNaam ?? null,
    goedgekeurd_op: u.goedgekeurdOp?.toISOString() ?? null,
    afgewezen: u.afgewezen,
    afwijzing_reden: u.afwijzingReden ?? null,
    aangemaakt_op: u.aangemaaktOp.toISOString(),
    bijgewerkt_op: u.bijgewerktOp.toISOString(),
  };
}

function mapWeekStaat(
  w: typeof weekStatenTable.$inferSelect,
  extra?: {
    medewerkerNaam?: string | null;
    goedgekeurdDoorNaam?: string | null;
  }
) {
  return {
    id: w.id,
    medewerker_id: w.medewerkerId,
    medewerker_naam: extra?.medewerkerNaam ?? null,
    jaar: w.jaar,
    week_nummer: w.weekNummer,
    status: w.status,
    totaal_uren: w.totaalUren ?? null,
    adv_uren: w.advUren ?? null,
    notities: w.notities ?? null,
    afwijzing_reden: w.afwijzingReden ?? null,
    ingediend_op: w.ingediendOp?.toISOString() ?? null,
    goedgekeurd_door_id: w.goedgekeurdDoorId ?? null,
    goedgekeurd_door_naam: extra?.goedgekeurdDoorNaam ?? null,
    goedgekeurd_op: w.goedgekeurdOp?.toISOString() ?? null,
    document_id: w.documentId ?? null,
    aangemaakt_op: w.aangemaaktOp.toISOString(),
    bijgewerkt_op: w.bijgewerktOp.toISOString(),
  };
}

async function medewerkerId(gebruikerId: number): Promise<number | null> {
  const [m] = await db
    .select({ id: medewerkersTable.id })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, gebruikerId))
    .limit(1);
  return m?.id ?? null;
}

async function gebruikerInfo(userId: number) {
  const [u] = await db
    .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, userId))
    .limit(1);
  return u ?? null;
}

// ── GET /uren ─────────────────────────────────────────────────────────────────
router.get("/uren", requireAuth, async (req, res) => {
  const {
    medewerker_id,
    datum_van,
    datum_tot,
    week,
    jaar,
    status,
    gebouw_id,
  } = req.query as Record<string, string | undefined>;

  const userId = req.session.userId!;
  const info = await gebruikerInfo(userId);
  const isManager = ((info?.bevoegdheden as Record<string, number> | null)?.uren ?? 0) >= 1 || info?.rol === "hoofdbeheerder";

  let eigenMedewerkerId: number | null = null;
  if (!isManager) {
    eigenMedewerkerId = await medewerkerId(userId);
    if (!eigenMedewerkerId) return res.json([]);
  }

  const filters = [];

  if (eigenMedewerkerId) {
    filters.push(eq(urenRegistratiesTable.medewerkerId, eigenMedewerkerId));
  } else if (medewerker_id) {
    filters.push(eq(urenRegistratiesTable.medewerkerId, Number(medewerker_id)));
  }

  if (datum_van) filters.push(gte(urenRegistratiesTable.datum, datum_van));
  if (datum_tot) filters.push(lte(urenRegistratiesTable.datum, datum_tot));

  if (week && jaar) {
    const { van, tot } = weekGrenzen(Number(jaar), Number(week));
    filters.push(gte(urenRegistratiesTable.datum, van));
    filters.push(lte(urenRegistratiesTable.datum, tot));
  }

  if (status) filters.push(eq(urenRegistratiesTable.status, status));
  if (gebouw_id) filters.push(eq(urenRegistratiesTable.gebouwId, Number(gebouw_id)));

  const rows = await db
    .select({
      uren: urenRegistratiesTable,
      medewerkerNaam: medewerkersTable.naam,
      gebouwNaam: gebouwenTable.naam,
    })
    .from(urenRegistratiesTable)
    .leftJoin(medewerkersTable, eq(urenRegistratiesTable.medewerkerId, medewerkersTable.id))
    .leftJoin(gebouwenTable, eq(urenRegistratiesTable.gebouwId, gebouwenTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(urenRegistratiesTable.datum), desc(urenRegistratiesTable.beginTijd));

  res.json(rows.map((r) => mapUren(r.uren, { medewerkerNaam: r.medewerkerNaam, gebouwNaam: r.gebouwNaam })));
});

// ── GET /uren/mijn-week ───────────────────────────────────────────────────────
router.get("/uren/mijn-week", requireAuth, async (req, res) => {
  const { jaar, week } = req.query as Record<string, string | undefined>;
  const userId = req.session.userId!;

  const mid = await medewerkerId(userId);
  if (!mid) {
    return res.json({
      medewerker_id: null, jaar: 0, week_nummer: 0,
      datum_van: "", datum_tot: "", dagen: [], planning_items: [],
      totaal_uren: 0, adv_uren: 0,
    });
  }

  const nu = new Date();
  const targetJaar = jaar ? Number(jaar) : nu.getFullYear();
  const targetWeek = week ? Number(week) : isoWeekNummer(nu);

  const { van, tot } = weekGrenzen(targetJaar, targetWeek);

  const rows = await db
    .select({
      uren: urenRegistratiesTable,
      gebouwNaam: gebouwenTable.naam,
    })
    .from(urenRegistratiesTable)
    .leftJoin(gebouwenTable, eq(urenRegistratiesTable.gebouwId, gebouwenTable.id))
    .where(
      and(
        eq(urenRegistratiesTable.medewerkerId, mid),
        gte(urenRegistratiesTable.datum, van),
        lte(urenRegistratiesTable.datum, tot)
      )
    )
    .orderBy(urenRegistratiesTable.datum, urenRegistratiesTable.beginTijd);

  const planningItems = await db
    .select()
    .from(planningItemsTable)
    .where(
      and(
        eq(planningItemsTable.medewerkerId, mid),
        gte(planningItemsTable.datumStart, van),
        lte(planningItemsTable.datumStart, tot)
      )
    );

  const [medewerker] = await db
    .select({ cao: medewerkersTable.cao, dienstverband: medewerkersTable.dienstverband })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.id, mid))
    .limit(1);

  const totaalUren = rows.reduce((acc, r) => acc + r.uren.nettoUren, 0);
  const advUren = medewerker ? berekenAdv(medewerker, totaalUren) : 0;

  const dagenMap: Record<string, ReturnType<typeof mapUren>[]> = {};
  for (const r of rows) {
    if (!dagenMap[r.uren.datum]) dagenMap[r.uren.datum] = [];
    dagenMap[r.uren.datum].push(mapUren(r.uren, { gebouwNaam: r.gebouwNaam }));
  }

  res.json({
    medewerker_id: mid,
    jaar: targetJaar,
    week_nummer: targetWeek,
    datum_van: van,
    datum_tot: tot,
    dagen: Object.entries(dagenMap).map(([datum, uren]) => ({ datum, uren })),
    planning_items: planningItems.map((p) => ({
      id: p.id,
      datum: p.datumStart,
      gebouw_id: p.gebouwId ?? null,
      omschrijving: p.omschrijving ?? null,
      begin_tijd: p.tijdStart ?? null,
      eind_tijd: p.tijdEind ?? null,
    })),
    totaal_uren: Math.round(totaalUren * 100) / 100,
    adv_uren: advUren,
  });
});

// ── POST /uren ────────────────────────────────────────────────────────────────
router.post("/uren", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const info = await gebruikerInfo(userId);
  const {
    datum,
    medewerker_id: inputMedId,
    gebouw_id,
    project_naam,
    werkzaamheden,
    begin_tijd,
    eind_tijd,
    pauze_minuten = 30,
    opmerkingen,
    planning_item_id,
  } = req.body;

  if (!datum || !begin_tijd || !eind_tijd) {
    return res.status(400).json({ error: "datum, begin_tijd en eind_tijd zijn verplicht" });
  }

  const isManager = ((info?.bevoegdheden as Record<string, number> | null)?.uren ?? 0) >= 2 || info?.rol === "hoofdbeheerder";
  let mid: number;

  if (inputMedId && isManager) {
    mid = Number(inputMedId);
  } else {
    const eigenId = await medewerkerId(userId);
    if (!eigenId) return res.status(400).json({ error: "Geen medewerkersprofiel gekoppeld aan dit account" });
    mid = eigenId;
  }

  const nettoUren = berekenNettoUren(begin_tijd, eind_tijd, Number(pauze_minuten));

  const [rij] = await db
    .insert(urenRegistratiesTable)
    .values({
      datum,
      medewerkerId: mid,
      gebouwId: gebouw_id ? Number(gebouw_id) : null,
      projectNaam: project_naam ?? null,
      werkzaamheden: werkzaamheden ?? null,
      beginTijd: begin_tijd,
      eindTijd: eind_tijd,
      pauzeMinuten: Number(pauze_minuten),
      nettoUren,
      opmerkingen: opmerkingen ?? null,
      planningItemId: planning_item_id ? Number(planning_item_id) : null,
      aangemaaktDoorId: userId,
      bijgewerktOp: new Date(),
    })
    .returning();

  res.status(201).json(mapUren(rij));
});

// ── GET /uren/:id ─────────────────────────────────────────────────────────────
router.get("/uren/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;
  const info = await gebruikerInfo(userId);

  const [row] = await db
    .select({
      uren: urenRegistratiesTable,
      medewerkerNaam: medewerkersTable.naam,
      gebouwNaam: gebouwenTable.naam,
    })
    .from(urenRegistratiesTable)
    .leftJoin(medewerkersTable, eq(urenRegistratiesTable.medewerkerId, medewerkersTable.id))
    .leftJoin(gebouwenTable, eq(urenRegistratiesTable.gebouwId, gebouwenTable.id))
    .where(eq(urenRegistratiesTable.id, id))
    .limit(1);

  if (!row) return res.status(404).json({ error: "Niet gevonden" });

  const eigenId = await medewerkerId(userId);
  const isManager = ((info?.bevoegdheden as Record<string, number> | null)?.uren ?? 0) >= 1 || info?.rol === "hoofdbeheerder";
  if (!isManager && row.uren.medewerkerId !== eigenId) {
    return res.status(403).json({ error: "Geen toegang" });
  }

  res.json(mapUren(row.uren, { medewerkerNaam: row.medewerkerNaam, gebouwNaam: row.gebouwNaam }));
});

// ── PATCH /uren/:id ───────────────────────────────────────────────────────────
router.patch("/uren/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;
  const info = await gebruikerInfo(userId);

  const [bestaand] = await db
    .select()
    .from(urenRegistratiesTable)
    .where(eq(urenRegistratiesTable.id, id))
    .limit(1);

  if (!bestaand) return res.status(404).json({ error: "Niet gevonden" });

  const eigenId = await medewerkerId(userId);
  const isManager = ((info?.bevoegdheden as Record<string, number> | null)?.uren ?? 0) >= 2 || info?.rol === "hoofdbeheerder";
  if (!isManager && bestaand.medewerkerId !== eigenId) {
    return res.status(403).json({ error: "Geen toegang" });
  }

  if (bestaand.status === "goedgekeurd" && !isManager) {
    return res.status(409).json({ error: "Goedgekeurde uren kunnen niet worden gewijzigd" });
  }

  const {
    datum,
    gebouw_id,
    project_naam,
    werkzaamheden,
    begin_tijd,
    eind_tijd,
    pauze_minuten,
    opmerkingen,
  } = req.body;

  const nieuwBegin = begin_tijd ?? bestaand.beginTijd;
  const nieuwEind = eind_tijd ?? bestaand.eindTijd;
  const nieuwPauze = pauze_minuten !== undefined ? Number(pauze_minuten) : bestaand.pauzeMinuten;
  const nettoUren = berekenNettoUren(nieuwBegin, nieuwEind, nieuwPauze);

  const [rij] = await db
    .update(urenRegistratiesTable)
    .set({
      datum: datum ?? bestaand.datum,
      gebouwId: gebouw_id !== undefined ? (gebouw_id ? Number(gebouw_id) : null) : bestaand.gebouwId,
      projectNaam: project_naam !== undefined ? project_naam : bestaand.projectNaam,
      werkzaamheden: werkzaamheden !== undefined ? werkzaamheden : bestaand.werkzaamheden,
      beginTijd: nieuwBegin,
      eindTijd: nieuwEind,
      pauzeMinuten: nieuwPauze,
      nettoUren,
      opmerkingen: opmerkingen !== undefined ? opmerkingen : bestaand.opmerkingen,
      bijgewerktOp: new Date(),
    })
    .where(eq(urenRegistratiesTable.id, id))
    .returning();

  res.json(mapUren(rij));
});

// ── DELETE /uren/:id ──────────────────────────────────────────────────────────
router.delete("/uren/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;
  const info = await gebruikerInfo(userId);

  const [bestaand] = await db
    .select()
    .from(urenRegistratiesTable)
    .where(eq(urenRegistratiesTable.id, id))
    .limit(1);

  if (!bestaand) return res.status(404).json({ error: "Niet gevonden" });

  const eigenId = await medewerkerId(userId);
  const isManager = ((info?.bevoegdheden as Record<string, number> | null)?.uren ?? 0) >= 2 || info?.rol === "hoofdbeheerder";
  if (!isManager && bestaand.medewerkerId !== eigenId) {
    return res.status(403).json({ error: "Geen toegang" });
  }

  if (bestaand.status === "goedgekeurd" && !isManager) {
    return res.status(409).json({ error: "Goedgekeurde uren kunnen niet worden verwijderd" });
  }

  await db.delete(urenRegistratiesTable).where(eq(urenRegistratiesTable.id, id));
  res.status(204).end();
});

// ── GET /weekstaten ───────────────────────────────────────────────────────────
router.get("/weekstaten", requireAuth, async (req, res) => {
  const { medewerker_id, jaar, week, status } = req.query as Record<string, string | undefined>;
  const userId = req.session.userId!;
  const info = await gebruikerInfo(userId);
  const isManager = ((info?.bevoegdheden as Record<string, number> | null)?.uren ?? 0) >= 1 || info?.rol === "hoofdbeheerder";

  let eigenId: number | null = null;
  if (!isManager) {
    eigenId = await medewerkerId(userId);
    if (!eigenId) return res.json([]);
  }

  const filters = [];
  if (eigenId) filters.push(eq(weekStatenTable.medewerkerId, eigenId));
  else if (medewerker_id) filters.push(eq(weekStatenTable.medewerkerId, Number(medewerker_id)));
  if (jaar) filters.push(eq(weekStatenTable.jaar, Number(jaar)));
  if (week) filters.push(eq(weekStatenTable.weekNummer, Number(week)));
  if (status) filters.push(eq(weekStatenTable.status, status));

  const rows = await db
    .select({
      ws: weekStatenTable,
      medewerkerNaam: medewerkersTable.naam,
    })
    .from(weekStatenTable)
    .leftJoin(medewerkersTable, eq(weekStatenTable.medewerkerId, medewerkersTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(weekStatenTable.jaar), desc(weekStatenTable.weekNummer));

  res.json(rows.map((r) => mapWeekStaat(r.ws, { medewerkerNaam: r.medewerkerNaam })));
});

// ── POST /weekstaten ──────────────────────────────────────────────────────────
router.post("/weekstaten", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const info = await gebruikerInfo(userId);
  const { medewerker_id: inputMedId, jaar, week_nummer, notities } = req.body;

  if (!jaar || !week_nummer) {
    return res.status(400).json({ error: "jaar en week_nummer zijn verplicht" });
  }

  const isManager = ((info?.bevoegdheden as Record<string, number> | null)?.uren ?? 0) >= 2 || info?.rol === "hoofdbeheerder";
  let mid: number;
  if (inputMedId && isManager) {
    mid = Number(inputMedId);
  } else {
    const eigenId = await medewerkerId(userId);
    if (!eigenId) return res.status(400).json({ error: "Geen medewerkersprofiel gekoppeld" });
    mid = eigenId;
  }

  const [bestaand] = await db
    .select()
    .from(weekStatenTable)
    .where(
      and(
        eq(weekStatenTable.medewerkerId, mid),
        eq(weekStatenTable.jaar, Number(jaar)),
        eq(weekStatenTable.weekNummer, Number(week_nummer))
      )
    )
    .limit(1);

  if (bestaand) return res.status(409).json({ error: "Weekstaat bestaat al voor deze week" });

  const { van, tot } = weekGrenzen(Number(jaar), Number(week_nummer));
  const urenRows = await db
    .select({ nettoUren: urenRegistratiesTable.nettoUren })
    .from(urenRegistratiesTable)
    .where(
      and(
        eq(urenRegistratiesTable.medewerkerId, mid),
        gte(urenRegistratiesTable.datum, van),
        lte(urenRegistratiesTable.datum, tot)
      )
    );

  const [medewerker] = await db
    .select({ cao: medewerkersTable.cao, dienstverband: medewerkersTable.dienstverband })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.id, mid))
    .limit(1);

  const totaalUren = urenRows.reduce((acc, r) => acc + r.nettoUren, 0);
  const advUren = medewerker ? berekenAdv(medewerker, totaalUren) : 0;

  const [rij] = await db
    .insert(weekStatenTable)
    .values({
      medewerkerId: mid,
      jaar: Number(jaar),
      weekNummer: Number(week_nummer),
      totaalUren: Math.round(totaalUren * 100) / 100,
      advUren,
      notities: notities ?? null,
      aangemaaktDoorId: userId,
      bijgewerktOp: new Date(),
    })
    .returning();

  res.status(201).json(mapWeekStaat(rij));
});

// ── GET /weekstaten/:id ───────────────────────────────────────────────────────
router.get("/weekstaten/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;
  const info = await gebruikerInfo(userId);

  const [row] = await db
    .select({
      ws: weekStatenTable,
      medewerkerNaam: medewerkersTable.naam,
      medewerkerBsn: sql<string | null>`${medewerkersTable}.bsn`,
      medewerkerGeboortedatum: medewerkersTable.geboortedatum,
      goedgekeurdDoorNaam: gebruikersTable.naam,
    })
    .from(weekStatenTable)
    .leftJoin(medewerkersTable, eq(weekStatenTable.medewerkerId, medewerkersTable.id))
    .leftJoin(gebruikersTable, eq(weekStatenTable.goedgekeurdDoorId, gebruikersTable.id))
    .where(eq(weekStatenTable.id, id))
    .limit(1);

  if (!row) return res.status(404).json({ error: "Niet gevonden" });

  const eigenId = await medewerkerId(userId);
  const isManager = ((info?.bevoegdheden as Record<string, number> | null)?.uren ?? 0) >= 1 || info?.rol === "hoofdbeheerder";
  if (!isManager && row.ws.medewerkerId !== eigenId) {
    return res.status(403).json({ error: "Geen toegang" });
  }

  const { van, tot } = weekGrenzen(row.ws.jaar, row.ws.weekNummer);
  const urenRows = await db
    .select({
      uren: urenRegistratiesTable,
      gebouwNaam: gebouwenTable.naam,
    })
    .from(urenRegistratiesTable)
    .leftJoin(gebouwenTable, eq(urenRegistratiesTable.gebouwId, gebouwenTable.id))
    .where(
      and(
        eq(urenRegistratiesTable.medewerkerId, row.ws.medewerkerId),
        gte(urenRegistratiesTable.datum, van),
        lte(urenRegistratiesTable.datum, tot)
      )
    )
    .orderBy(urenRegistratiesTable.datum, urenRegistratiesTable.beginTijd);

  res.json({
    ...mapWeekStaat(row.ws, {
      medewerkerNaam: row.medewerkerNaam,
      goedgekeurdDoorNaam: row.goedgekeurdDoorNaam,
    }),
    medewerker_bsn: row.medewerkerBsn,
    medewerker_geboortedatum: row.medewerkerGeboortedatum,
    datum_van: van,
    datum_tot: tot,
    uren: urenRows.map((r) => mapUren(r.uren, { gebouwNaam: r.gebouwNaam })),
  });
});

// ── PATCH /weekstaten/:id ─────────────────────────────────────────────────────
router.patch("/weekstaten/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { notities } = req.body;

  const [rij] = await db
    .update(weekStatenTable)
    .set({ notities: notities ?? null, bijgewerktOp: new Date() })
    .where(eq(weekStatenTable.id, id))
    .returning();

  if (!rij) return res.status(404).json({ error: "Niet gevonden" });
  res.json(mapWeekStaat(rij));
});

// ── POST /weekstaten/:id/indienen ─────────────────────────────────────────────
router.post("/weekstaten/:id/indienen", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;
  const info = await gebruikerInfo(userId);

  const [bestaand] = await db.select().from(weekStatenTable).where(eq(weekStatenTable.id, id)).limit(1);
  if (!bestaand) return res.status(404).json({ error: "Niet gevonden" });

  const eigenId = await medewerkerId(userId);
  const isManager = ((info?.bevoegdheden as Record<string, number> | null)?.uren ?? 0) >= 2 || info?.rol === "hoofdbeheerder";
  if (!isManager && bestaand.medewerkerId !== eigenId) {
    return res.status(403).json({ error: "Geen toegang" });
  }

  if (bestaand.status !== "concept" && bestaand.status !== "afgewezen") {
    return res.status(409).json({ error: "Weekstaat is al ingediend of goedgekeurd" });
  }

  const { van, tot } = weekGrenzen(bestaand.jaar, bestaand.weekNummer);
  const urenRows = await db
    .select({ nettoUren: urenRegistratiesTable.nettoUren })
    .from(urenRegistratiesTable)
    .where(
      and(
        eq(urenRegistratiesTable.medewerkerId, bestaand.medewerkerId),
        gte(urenRegistratiesTable.datum, van),
        lte(urenRegistratiesTable.datum, tot)
      )
    );

  const [medewerker] = await db
    .select({ cao: medewerkersTable.cao, dienstverband: medewerkersTable.dienstverband })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.id, bestaand.medewerkerId))
    .limit(1);

  const totaalUren = urenRows.reduce((acc, r) => acc + r.nettoUren, 0);
  const advUren = medewerker ? berekenAdv(medewerker, totaalUren) : 0;

  await db
    .update(urenRegistratiesTable)
    .set({ status: "ingediend", ingediendOp: new Date(), bijgewerktOp: new Date() })
    .where(
      and(
        eq(urenRegistratiesTable.medewerkerId, bestaand.medewerkerId),
        gte(urenRegistratiesTable.datum, van),
        lte(urenRegistratiesTable.datum, tot),
        eq(urenRegistratiesTable.status, "concept")
      )
    );

  const [rij] = await db
    .update(weekStatenTable)
    .set({
      status: "ingediend",
      totaalUren: Math.round(totaalUren * 100) / 100,
      advUren,
      ingediendOp: new Date(),
      afwijzingReden: null,
      bijgewerktOp: new Date(),
    })
    .where(eq(weekStatenTable.id, id))
    .returning();

  res.json(mapWeekStaat(rij));
});

// ── POST /weekstaten/:id/goedkeuren ───────────────────────────────────────────
router.post("/weekstaten/:id/goedkeuren", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;
  const info = await gebruikerInfo(userId);

  const isManager = ((info?.bevoegdheden as Record<string, number> | null)?.uren ?? 0) >= 2 || info?.rol === "hoofdbeheerder";
  if (!isManager) return res.status(403).json({ error: "Geen bevoegdheid" });

  const [bestaand] = await db.select().from(weekStatenTable).where(eq(weekStatenTable.id, id)).limit(1);
  if (!bestaand) return res.status(404).json({ error: "Niet gevonden" });

  if (bestaand.status !== "ingediend") {
    return res.status(409).json({ error: "Weekstaat is niet ingediend" });
  }

  const { van, tot } = weekGrenzen(bestaand.jaar, bestaand.weekNummer);

  await db
    .update(urenRegistratiesTable)
    .set({ status: "goedgekeurd", goedgekeurdDoorId: userId, goedgekeurdOp: new Date(), bijgewerktOp: new Date() })
    .where(
      and(
        eq(urenRegistratiesTable.medewerkerId, bestaand.medewerkerId),
        gte(urenRegistratiesTable.datum, van),
        lte(urenRegistratiesTable.datum, tot),
        eq(urenRegistratiesTable.status, "ingediend")
      )
    );

  const [rij] = await db
    .update(weekStatenTable)
    .set({
      status: "goedgekeurd",
      goedgekeurdDoorId: userId,
      goedgekeurdOp: new Date(),
      bijgewerktOp: new Date(),
    })
    .where(eq(weekStatenTable.id, id))
    .returning();

  res.json(mapWeekStaat(rij));
});

// ── POST /weekstaten/:id/afwijzen ─────────────────────────────────────────────
router.post("/weekstaten/:id/afwijzen", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;
  const info = await gebruikerInfo(userId);
  const { reden } = req.body;

  const isManager = ((info?.bevoegdheden as Record<string, number> | null)?.uren ?? 0) >= 2 || info?.rol === "hoofdbeheerder";
  if (!isManager) return res.status(403).json({ error: "Geen bevoegdheid" });

  if (!reden) return res.status(400).json({ error: "reden is verplicht" });

  const [bestaand] = await db.select().from(weekStatenTable).where(eq(weekStatenTable.id, id)).limit(1);
  if (!bestaand) return res.status(404).json({ error: "Niet gevonden" });

  if (bestaand.status !== "ingediend") {
    return res.status(409).json({ error: "Weekstaat is niet ingediend" });
  }

  const { van, tot } = weekGrenzen(bestaand.jaar, bestaand.weekNummer);

  await db
    .update(urenRegistratiesTable)
    .set({ status: "afgewezen", afgewezen: true, afwijzingReden: reden, bijgewerktOp: new Date() })
    .where(
      and(
        eq(urenRegistratiesTable.medewerkerId, bestaand.medewerkerId),
        gte(urenRegistratiesTable.datum, van),
        lte(urenRegistratiesTable.datum, tot),
        eq(urenRegistratiesTable.status, "ingediend")
      )
    );

  const [rij] = await db
    .update(weekStatenTable)
    .set({
      status: "afgewezen",
      afwijzingReden: reden,
      bijgewerktOp: new Date(),
    })
    .where(eq(weekStatenTable.id, id))
    .returning();

  res.json(mapWeekStaat(rij));
});

export default router;

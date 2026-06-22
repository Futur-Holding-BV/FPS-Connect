// Planning-module routes — /api/modules/planning/*
// Uitvoeringsplanner: alleen uitvoerend personeel (monteurs, timmermannen, zzp, uitzendkrachten)
import { Router } from "express";
import {
  db,
  planningItemsTable,
  planningAfwezigheidTable,
  medewerkersTable,
  gebouwenTable,
  gebruikersTable,
  functiesTable,
  projectBegrotingenTable,
  planningMeerwerkTable,
  urenRegistratiesTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, asc, inArray, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();
const iso = (d: Date) => d.toISOString();

const lezenPlanning    = requireBevoegdheid("planning", 1);
const schrijvenPlanning = requireBevoegdheid("planning", 2);
const aanmakenPlanning  = requireBevoegdheid("planning", 3);

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

function mapItem(item: typeof planningItemsTable.$inferSelect, medewerkNaam: string | null, gebouwNaam: string | null) {
  return {
    id: item.id,
    titel: item.titel,
    omschrijving: item.omschrijving ?? null,
    medewerker_id: item.medewerkerId ?? null,
    medewerker_naam: medewerkNaam ?? null,
    gebouw_id: item.gebouwId ?? null,
    gebouw_naam: gebouwNaam ?? null,
    project_naam: item.projectNaam ?? null,
    datum_start: item.datumStart,
    datum_eind: item.datumEind,
    tijd_start: item.tijdStart ?? null,
    tijd_eind: item.tijdEind ?? null,
    uren: item.uren,
    status: item.status,
    type: item.type,
    opdracht_type: item.opdrachtType ?? null,
    locaties: item.locaties ?? null,
    werknummer: item.werknummer ?? null,
    dag_notities: item.dagNotities ?? null,
    notities: item.notities ?? null,
    aangemaakt_op: iso(item.aangemaaktOp),
  };
}

// ── Medewerkers voor planning ─────────────────────────────────────────────
// Altijd gefilterd op uitvoerend=true — geen kantoorpersoneel in de planning.

router.get("/modules/planning/medewerkers", lezenPlanning, async (req, res) => {
  try {
    const wmFilter = typeof req.query.werkmaatschappij === "string" ? req.query.werkmaatschappij : undefined;
    const dvFilter = typeof req.query.dienstverband    === "string" ? req.query.dienstverband    : undefined;

    const conditions = [
      eq(medewerkersTable.actief, true),
      eq(functiesTable.uitvoerend, true),
    ];
    if (wmFilter) conditions.push(eq(medewerkersTable.werkmaatschappij, wmFilter));
    if (dvFilter) conditions.push(eq(medewerkersTable.dienstverband, dvFilter));

    const rows = await db
      .select({
        id: medewerkersTable.id,
        naam: medewerkersTable.naam,
        email: medewerkersTable.email,
        telefoon: medewerkersTable.telefoon,
        contracturenPerWeek: medewerkersTable.contracturenPerWeek,
        dienstverband: medewerkersTable.dienstverband,
        werkmaatschappij: medewerkersTable.werkmaatschappij,
        bedrijfUitzendbureau: medewerkersTable.bedrijfUitzendbureau,
        uitDienstPer: medewerkersTable.uitDienstPer,
        actief: medewerkersTable.actief,
        functieNaam: functiesTable.naam,
        functieUitvoerend: functiesTable.uitvoerend,
      })
      .from(medewerkersTable)
      .innerJoin(functiesTable, eq(medewerkersTable.functieId, functiesTable.id))
      .where(and(...conditions))
      .orderBy(asc(medewerkersTable.naam));

    res.json(rows.map((r) => ({
      id: r.id,
      naam: r.naam,
      email: r.email,
      telefoon: r.telefoon,
      contracturen_per_week: r.contracturenPerWeek,
      dienstverband: r.dienstverband ?? null,
      werkmaatschappij: r.werkmaatschappij ?? null,
      bedrijf_uitzendbureau: r.bedrijfUitzendbureau ?? null,
      uit_dienst_per: r.uitDienstPer ?? null,
      actief: r.actief,
      functie: r.functieNaam ?? null,
      functie_uitvoerend: r.functieUitvoerend ?? true,
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Planning items ─────────────────────────────────────────────────────────

router.get("/modules/planning/items", lezenPlanning, async (req, res) => {
  try {
    const { van, tot, medewerker_id, gebouw_id, status, opdracht_type } =
      req.query as Record<string, string>;

    const rows = await db
      .select({
        item: planningItemsTable,
        medewerkNaam: medewerkersTable.naam,
        gebouwNaam: gebouwenTable.naam,
      })
      .from(planningItemsTable)
      .leftJoin(medewerkersTable, eq(planningItemsTable.medewerkerId, medewerkersTable.id))
      .leftJoin(gebouwenTable, eq(planningItemsTable.gebouwId, gebouwenTable.id))
      .orderBy(asc(planningItemsTable.datumStart), asc(planningItemsTable.tijdStart), asc(planningItemsTable.id));

    let resultaten = rows;
    if (van)          resultaten = resultaten.filter((r) => r.item.datumStart >= van);
    if (tot)          resultaten = resultaten.filter((r) => r.item.datumEind  <= tot);
    if (medewerker_id) {
      const mid = parseInt(medewerker_id, 10);
      resultaten = resultaten.filter((r) => r.item.medewerkerId === mid);
    }
    if (gebouw_id) {
      const gid = parseInt(gebouw_id, 10);
      resultaten = resultaten.filter((r) => r.item.gebouwId === gid);
    }
    if (status)       resultaten = resultaten.filter((r) => r.item.status === status);
    if (opdracht_type) resultaten = resultaten.filter((r) => r.item.opdrachtType === opdracht_type);

    res.json(resultaten.map(({ item, medewerkNaam, gebouwNaam }) =>
      mapItem(item, medewerkNaam ?? null, gebouwNaam ?? null)
    ));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/planning/items", aanmakenPlanning, async (req, res) => {
  try {
    const {
      titel, omschrijving, medewerker_id, gebouw_id, project_naam,
      datum_start, datum_eind, tijd_start, tijd_eind, uren,
      status = "concept", type = "uitvoering", notities,
      werknummer, dag_notities, opdracht_type, locaties,
    } = req.body as Record<string, unknown>;

    if (!datum_start || !datum_eind) {
      return res.status(400).json({ error: "datum_start en datum_eind zijn verplicht" });
    }

    const titelStr = titel
      ? String(titel)
      : (project_naam ? String(project_naam) : "Werk");

    const [row] = await db.insert(planningItemsTable).values({
      titel: titelStr,
      omschrijving:   omschrijving  ? String(omschrijving)  : null,
      medewerkerId:   medewerker_id ? Number(medewerker_id) : null,
      gebouwId:       gebouw_id     ? Number(gebouw_id)     : null,
      projectNaam:    project_naam  ? String(project_naam)  : null,
      datumStart:     String(datum_start),
      datumEind:      String(datum_eind),
      tijdStart:      tijd_start    ? String(tijd_start)    : null,
      tijdEind:       tijd_eind     ? String(tijd_eind)     : null,
      uren:           uren !== undefined ? Number(uren) : 8,
      status:         String(status),
      type:           String(type),
      opdrachtType:   opdracht_type ? String(opdracht_type) : null,
      locaties:       locaties      ? String(locaties)      : null,
      werknummer:     werknummer    ? String(werknummer)    : null,
      dagNotities:    dag_notities  ? String(dag_notities)  : null,
      notities:       notities      ? String(notities)      : null,
      aangemaaktDoorId: (req as any).session?.gebruikerId ?? null,
    }).returning();

    const gebouw = row.gebouwId
      ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, row.gebouwId)).limit(1)
      : [];

    res.status(201).json(mapItem(row, null, gebouw[0]?.naam ?? null));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.get("/modules/planning/items/:id", lezenPlanning, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const [row] = await db
      .select({ item: planningItemsTable, medewerkNaam: medewerkersTable.naam, gebouwNaam: gebouwenTable.naam })
      .from(planningItemsTable)
      .leftJoin(medewerkersTable, eq(planningItemsTable.medewerkerId, medewerkersTable.id))
      .leftJoin(gebouwenTable,    eq(planningItemsTable.gebouwId,     gebouwenTable.id))
      .where(eq(planningItemsTable.id, id));

    if (!row) return res.status(404).json({ error: "Niet gevonden" });
    res.json(mapItem(row.item, row.medewerkNaam ?? null, row.gebouwNaam ?? null));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/planning/items/:id", schrijvenPlanning, async (req, res) => {
  try {
    const id   = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;

    const update: Partial<typeof planningItemsTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.titel         !== undefined) update.titel        = String(body.titel);
    if (body.omschrijving  !== undefined) update.omschrijving = body.omschrijving  ? String(body.omschrijving)  : null;
    if (body.medewerker_id !== undefined) update.medewerkerId = body.medewerker_id ? Number(body.medewerker_id) : null;
    if (body.gebouw_id     !== undefined) update.gebouwId     = body.gebouw_id     ? Number(body.gebouw_id)     : null;
    if (body.project_naam  !== undefined) update.projectNaam  = body.project_naam  ? String(body.project_naam)  : null;
    if (body.datum_start   !== undefined) update.datumStart   = String(body.datum_start);
    if (body.datum_eind    !== undefined) update.datumEind    = String(body.datum_eind);
    if (body.tijd_start    !== undefined) update.tijdStart    = body.tijd_start    ? String(body.tijd_start)    : null;
    if (body.tijd_eind     !== undefined) update.tijdEind     = body.tijd_eind     ? String(body.tijd_eind)     : null;
    if (body.uren          !== undefined) update.uren         = Number(body.uren);
    if (body.status        !== undefined) update.status       = String(body.status);
    if (body.type          !== undefined) update.type         = String(body.type);
    if (body.opdracht_type !== undefined) update.opdrachtType = body.opdracht_type ? String(body.opdracht_type) : null;
    if (body.locaties      !== undefined) update.locaties     = body.locaties      ? String(body.locaties)      : null;
    if (body.werknummer    !== undefined) update.werknummer   = body.werknummer    ? String(body.werknummer)    : null;
    if (body.dag_notities  !== undefined) update.dagNotities  = body.dag_notities  ? String(body.dag_notities)  : null;
    if (body.notities      !== undefined) update.notities     = body.notities      ? String(body.notities)      : null;

    const [row] = await db.update(planningItemsTable).set(update).where(eq(planningItemsTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Niet gevonden" });

    const gebouw = row.gebouwId
      ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, row.gebouwId)).limit(1)
      : [];

    res.json(mapItem(row, null, gebouw[0]?.naam ?? null));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/planning/items/:id", aanmakenPlanning, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(planningItemsTable).where(eq(planningItemsTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Afwezigheid ────────────────────────────────────────────────────────────

router.get("/modules/planning/afwezigheid", lezenPlanning, async (req, res) => {
  try {
    const { medewerker_id, van, tot } = req.query as Record<string, string>;

    const rows = await db
      .select({ af: planningAfwezigheidTable, medewerkNaam: medewerkersTable.naam })
      .from(planningAfwezigheidTable)
      .leftJoin(medewerkersTable, eq(planningAfwezigheidTable.medewerkerId, medewerkersTable.id))
      .orderBy(desc(planningAfwezigheidTable.datumStart));

    let resultaten = rows;
    if (medewerker_id) {
      const mid = parseInt(medewerker_id, 10);
      resultaten = resultaten.filter((r) => r.af.medewerkerId === mid);
    }
    if (van) resultaten = resultaten.filter((r) => r.af.datumEind   >= van);
    if (tot) resultaten = resultaten.filter((r) => r.af.datumStart  <= tot);

    res.json(resultaten.map(({ af, medewerkNaam }) => ({
      id: af.id,
      medewerker_id: af.medewerkerId,
      medewerker_naam: medewerkNaam ?? null,
      type: af.type,
      datum_start: af.datumStart,
      datum_eind: af.datumEind,
      omschrijving: af.omschrijving ?? null,
      status: af.status,
      aangemaakt_op: iso(af.aangemaaktOp),
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/planning/afwezigheid", schrijvenPlanning, async (req, res) => {
  try {
    const { medewerker_id, type = "vakantie", datum_start, datum_eind, omschrijving, status = "aangevraagd" } =
      req.body as Record<string, unknown>;

    if (!medewerker_id || !datum_start || !datum_eind) {
      return res.status(400).json({ error: "medewerker_id, datum_start en datum_eind zijn verplicht" });
    }

    const [row] = await db.insert(planningAfwezigheidTable).values({
      medewerkerId: Number(medewerker_id),
      type: String(type),
      datumStart: String(datum_start),
      datumEind: String(datum_eind),
      omschrijving: omschrijving ? String(omschrijving) : null,
      status: String(status),
      aangemaaktDoorId: (req as any).session?.gebruikerId ?? null,
    }).returning();

    res.status(201).json({
      id: row.id, medewerker_id: row.medewerkerId, medewerker_naam: null,
      type: row.type, datum_start: row.datumStart, datum_eind: row.datumEind,
      omschrijving: row.omschrijving ?? null, status: row.status, aangemaakt_op: iso(row.aangemaaktOp),
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/planning/afwezigheid/:id", schrijvenPlanning, async (req, res) => {
  try {
    const id   = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof planningAfwezigheidTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.type        !== undefined) update.type        = String(body.type);
    if (body.datum_start !== undefined) update.datumStart  = String(body.datum_start);
    if (body.datum_eind  !== undefined) update.datumEind   = String(body.datum_eind);
    if (body.omschrijving !== undefined) update.omschrijving = body.omschrijving ? String(body.omschrijving) : null;
    if (body.status      !== undefined) update.status      = String(body.status);

    const [row] = await db.update(planningAfwezigheidTable).set(update).where(eq(planningAfwezigheidTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Niet gevonden" });

    res.json({ id: row.id, medewerker_id: row.medewerkerId, medewerker_naam: null,
      type: row.type, datum_start: row.datumStart, datum_eind: row.datumEind,
      omschrijving: row.omschrijving ?? null, status: row.status, aangemaakt_op: iso(row.aangemaaktOp) });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/planning/afwezigheid/:id", schrijvenPlanning, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(planningAfwezigheidTable).where(eq(planningAfwezigheidTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Projectbegrotingen ─────────────────────────────────────────────────────

function mapBegroting(b: typeof projectBegrotingenTable.$inferSelect, gebouwNaam: string | null) {
  return {
    id: b.id,
    gebouw_id: b.gebouwId ?? null,
    gebouw_naam: gebouwNaam,
    werknummer: b.werknummer ?? null,
    hoofd_uren_begroot: b.hoofdUrenBegroot,
    meerwerk_uren_begroot: b.meerwerkUrenBegroot,
    omschrijving: b.omschrijving ?? null,
    aangemaakt_op: iso(b.aangemaaktOp),
  };
}

router.get("/modules/planning/begrotingen", lezenPlanning, async (req, res) => {
  try {
    const gebouwFilter = req.query.gebouw_id ? Number(req.query.gebouw_id) : undefined;

    const rows = await db
      .select({ b: projectBegrotingenTable, gebouwNaam: gebouwenTable.naam })
      .from(projectBegrotingenTable)
      .leftJoin(gebouwenTable, eq(projectBegrotingenTable.gebouwId, gebouwenTable.id))
      .orderBy(asc(projectBegrotingenTable.id));

    const resultaten = gebouwFilter
      ? rows.filter((r) => r.b.gebouwId === gebouwFilter)
      : rows;

    res.json(resultaten.map(({ b, gebouwNaam }) => mapBegroting(b, gebouwNaam ?? null)));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/planning/begrotingen", aanmakenPlanning, async (req, res) => {
  try {
    const { gebouw_id, werknummer, hoofd_uren_begroot = 0, meerwerk_uren_begroot = 0, omschrijving } =
      req.body as Record<string, unknown>;

    const [row] = await db.insert(projectBegrotingenTable).values({
      gebouwId: gebouw_id ? Number(gebouw_id) : null,
      werknummer: werknummer ? String(werknummer) : null,
      hoofdUrenBegroot: Number(hoofd_uren_begroot),
      meerwerkUrenBegroot: Number(meerwerk_uren_begroot),
      omschrijving: omschrijving ? String(omschrijving) : null,
      aangemaaktDoorId: (req as any).session?.gebruikerId ?? null,
    }).returning();

    const gebouw = row.gebouwId
      ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, row.gebouwId)).limit(1)
      : [];

    res.status(201).json(mapBegroting(row, gebouw[0]?.naam ?? null));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/planning/begrotingen/:id", schrijvenPlanning, async (req, res) => {
  try {
    const id   = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof projectBegrotingenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.gebouw_id            !== undefined) update.gebouwId          = body.gebouw_id ? Number(body.gebouw_id) : null;
    if (body.werknummer           !== undefined) update.werknummer        = body.werknummer ? String(body.werknummer) : null;
    if (body.hoofd_uren_begroot   !== undefined) update.hoofdUrenBegroot  = Number(body.hoofd_uren_begroot);
    if (body.meerwerk_uren_begroot !== undefined) update.meerwerkUrenBegroot = Number(body.meerwerk_uren_begroot);
    if (body.omschrijving         !== undefined) update.omschrijving      = body.omschrijving ? String(body.omschrijving) : null;

    const [row] = await db.update(projectBegrotingenTable).set(update).where(eq(projectBegrotingenTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Niet gevonden" });

    const gebouw = row.gebouwId
      ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, row.gebouwId)).limit(1)
      : [];

    res.json(mapBegroting(row, gebouw[0]?.naam ?? null));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/planning/begrotingen/:id", aanmakenPlanning, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(projectBegrotingenTable).where(eq(projectBegrotingenTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Meerwerk ───────────────────────────────────────────────────────────────

function mapMeerwerk(m: typeof planningMeerwerkTable.$inferSelect) {
  return {
    id: m.id,
    planning_item_id: m.planningItemId,
    meerwerk_nummer: m.meerwerkNummer ?? null,
    omschrijving: m.omschrijving ?? null,
    status: m.status,
    aangemaakt_op: iso(m.aangemaaktOp),
  };
}

router.get("/modules/planning/meerwerk", lezenPlanning, async (req, res) => {
  try {
    const planningItemFilter = req.query.planning_item_id ? Number(req.query.planning_item_id) : undefined;

    const rows = await db
      .select()
      .from(planningMeerwerkTable)
      .orderBy(asc(planningMeerwerkTable.id));

    const resultaten = planningItemFilter
      ? rows.filter((r) => r.planningItemId === planningItemFilter)
      : rows;

    res.json(resultaten.map(mapMeerwerk));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/planning/meerwerk", aanmakenPlanning, async (req, res) => {
  try {
    const { planning_item_id, meerwerk_nummer, omschrijving, status = "concept" } =
      req.body as Record<string, unknown>;

    if (!planning_item_id) {
      return res.status(400).json({ error: "planning_item_id is verplicht" });
    }

    const [row] = await db.insert(planningMeerwerkTable).values({
      planningItemId: Number(planning_item_id),
      meerwerkNummer: meerwerk_nummer ? String(meerwerk_nummer) : null,
      omschrijving:   omschrijving    ? String(omschrijving)    : null,
      status:         String(status),
    }).returning();

    res.status(201).json(mapMeerwerk(row));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/planning/meerwerk/:id", schrijvenPlanning, async (req, res) => {
  try {
    const id   = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof planningMeerwerkTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.meerwerk_nummer !== undefined) update.meerwerkNummer = body.meerwerk_nummer ? String(body.meerwerk_nummer) : null;
    if (body.omschrijving   !== undefined) update.omschrijving   = body.omschrijving    ? String(body.omschrijving)    : null;
    if (body.status         !== undefined) update.status         = String(body.status);

    const [row] = await db.update(planningMeerwerkTable).set(update).where(eq(planningMeerwerkTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Niet gevonden" });

    res.json(mapMeerwerk(row));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/planning/meerwerk/:id", aanmakenPlanning, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(planningMeerwerkTable).where(eq(planningMeerwerkTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Nacalculatie ───────────────────────────────────────────────────────────
// Geaggregeerde view: begroot (project_begrotingen) + gepland (planning_items)
// + werkelijk (uren_registraties via planning_item_id of gebouw_id).

router.get("/modules/planning/nacalculatie", lezenPlanning, async (req, res) => {
  try {
    const { van, tot, gebouw_id } = req.query as Record<string, string>;

    // 1. Begrotingen per gebouw
    const begrotingen = await db
      .select({ b: projectBegrotingenTable, gebouwNaam: gebouwenTable.naam })
      .from(projectBegrotingenTable)
      .leftJoin(gebouwenTable, eq(projectBegrotingenTable.gebouwId, gebouwenTable.id));

    // 2. Geplande uren per gebouw per opdracht_type (in datumbereik)
    const allItems = await db
      .select({ item: planningItemsTable, gebouwNaam: gebouwenTable.naam })
      .from(planningItemsTable)
      .leftJoin(gebouwenTable, eq(planningItemsTable.gebouwId, gebouwenTable.id))
      .where(planningItemsTable.gebouwId !== null ? undefined : undefined);

    const gefilterdItems = allItems.filter((r) => {
      if (!r.item.gebouwId) return false;
      if (van && r.item.datumStart < van) return false;
      if (tot && r.item.datumEind  > tot) return false;
      if (gebouw_id && r.item.gebouwId !== parseInt(gebouw_id, 10)) return false;
      return true;
    });

    // 3. Werkelijke uren per gebouw (via planning_item_id → gebouw_id)
    const itemIds = gefilterdItems.map((r) => r.item.id);
    const werkelijk: Record<number, number> = {};

    if (itemIds.length > 0) {
      const urenRows = await db
        .select({ planningItemId: urenRegistratiesTable.planningItemId, netto: urenRegistratiesTable.nettoUren })
        .from(urenRegistratiesTable)
        .where(inArray(urenRegistratiesTable.planningItemId, itemIds));

      for (const ur of urenRows) {
        const gid = gefilterdItems.find((r) => r.item.id === ur.planningItemId)?.item.gebouwId;
        if (gid && ur.netto) werkelijk[gid] = (werkelijk[gid] ?? 0) + ur.netto;
      }
    }

    // Aggregeer per gebouw
    const gebouwen: Record<number, {
      gebouw_id: number;
      gebouw_naam: string | null;
      werknummer: string | null;
      hoofd_uren_begroot: number;
      meerwerk_uren_begroot: number;
      hoofd_uren_gepland: number;
      meerwerk_uren_gepland: number;
      totaal_uren_werkelijk: number;
    }> = {};

    // Stel records in vanuit begrotingen
    for (const { b, gebouwNaam } of begrotingen) {
      if (!b.gebouwId) continue;
      if (gebouw_id && b.gebouwId !== parseInt(gebouw_id, 10)) continue;
      gebouwen[b.gebouwId] = {
        gebouw_id: b.gebouwId,
        gebouw_naam: gebouwNaam ?? null,
        werknummer: b.werknummer ?? null,
        hoofd_uren_begroot: b.hoofdUrenBegroot,
        meerwerk_uren_begroot: b.meerwerkUrenBegroot,
        hoofd_uren_gepland: 0,
        meerwerk_uren_gepland: 0,
        totaal_uren_werkelijk: 0,
      };
    }

    // Voeg geplande uren toe (ook voor gebouwen zonder begroting)
    for (const { item, gebouwNaam } of gefilterdItems) {
      const gid = item.gebouwId!;
      if (!gebouwen[gid]) {
        gebouwen[gid] = {
          gebouw_id: gid,
          gebouw_naam: gebouwNaam ?? null,
          werknummer: null,
          hoofd_uren_begroot: 0,
          meerwerk_uren_begroot: 0,
          hoofd_uren_gepland: 0,
          meerwerk_uren_gepland: 0,
          totaal_uren_werkelijk: 0,
        };
      }
      if (item.opdrachtType === "meerwerk") {
        gebouwen[gid].meerwerk_uren_gepland += item.uren;
      } else {
        gebouwen[gid].hoofd_uren_gepland += item.uren;
      }
    }

    // Voeg werkelijke uren toe
    for (const [gidStr, uren] of Object.entries(werkelijk)) {
      const gid = parseInt(gidStr, 10);
      if (gebouwen[gid]) gebouwen[gid].totaal_uren_werkelijk = uren;
    }

    res.json(Object.values(gebouwen));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

export default router;

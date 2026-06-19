// Planning-module routes — /api/modules/planning/*
// Aparte module naast FPS Connect. Raakt geen bestaande tabellen.
import { Router } from "express";
import {
  db,
  planningItemsTable,
  planningAfwezigheidTable,
  medewerkersTable,
  gebouwenTable,
  gebruikersTable,
  functiesTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, asc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();
const iso = (d: Date) => d.toISOString();

const lezenPlanning = requireBevoegdheid("planning", 1);
const schrijvenPlanning = requireBevoegdheid("planning", 2);
const aanmakenPlanning = requireBevoegdheid("planning", 3);

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

// ── Medewerkers voor planning ─────────────────────────────────────────────

router.get("/modules/planning/medewerkers", lezenPlanning, async (req, res) => {
  try {
    const alleenUitvoerend = req.query.alleen_uitvoerend === "true";
    const wmFilter = typeof req.query.werkmaatschappij === "string" ? req.query.werkmaatschappij : undefined;
    const dvFilter = typeof req.query.dienstverband === "string" ? req.query.dienstverband : undefined;

    const conditions = [eq(medewerkersTable.actief, true)];
    if (alleenUitvoerend) conditions.push(eq(functiesTable.uitvoerend, true));
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
      .leftJoin(functiesTable, eq(medewerkersTable.functieId, functiesTable.id))
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
      functie_uitvoerend: r.functieUitvoerend ?? null,
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Planning items ─────────────────────────────────────────────────────────

router.get("/modules/planning/items", lezenPlanning, async (req, res) => {
  try {
    const { van, tot, medewerker_id } = req.query as Record<string, string>;

    const rows = await db
      .select({
        item: planningItemsTable,
        medewerkNaam: medewerkersTable.naam,
        gebouwNaam: gebouwenTable.naam,
      })
      .from(planningItemsTable)
      .leftJoin(medewerkersTable, eq(planningItemsTable.medewerkerId, medewerkersTable.id))
      .leftJoin(gebouwenTable, eq(planningItemsTable.gebouwId, gebouwenTable.id))
      .orderBy(asc(planningItemsTable.datumStart), asc(planningItemsTable.id));

    let resultaten = rows;
    if (van) resultaten = resultaten.filter((r) => r.item.datumStart >= van);
    if (tot) resultaten = resultaten.filter((r) => r.item.datumEind <= tot);
    if (medewerker_id) {
      const mid = parseInt(medewerker_id, 10);
      resultaten = resultaten.filter((r) => r.item.medewerkerId === mid);
    }

    res.json(resultaten.map(({ item, medewerkNaam, gebouwNaam }) => ({
      id: item.id,
      titel: item.titel,
      omschrijving: item.omschrijving,
      medewerker_id: item.medewerkerId,
      medewerker_naam: medewerkNaam ?? null,
      gebouw_id: item.gebouwId,
      gebouw_naam: gebouwNaam ?? null,
      project_naam: item.projectNaam,
      datum_start: item.datumStart,
      datum_eind: item.datumEind,
      tijd_start: item.tijdStart,
      tijd_eind: item.tijdEind,
      uren: item.uren,
      status: item.status,
      type: item.type,
      werknummer: item.werknummer ?? null,
      tijdsloten: item.tijdsloten ?? null,
      dag_notities: item.dagNotities ?? null,
      notities: item.notities,
      aangemaakt_op: iso(item.aangemaaktOp),
    })));
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
      status = "concept", type = "intern", notities,
      werknummer, tijdsloten, dag_notities,
    } = req.body as Record<string, unknown>;

    if (!titel || !datum_start || !datum_eind) {
      return res.status(400).json({ error: "titel, datum_start en datum_eind zijn verplicht" });
    }

    const [row] = await db.insert(planningItemsTable).values({
      titel: String(titel),
      omschrijving: omschrijving ? String(omschrijving) : null,
      medewerkerId: medewerker_id ? Number(medewerker_id) : null,
      gebouwId: gebouw_id ? Number(gebouw_id) : null,
      projectNaam: project_naam ? String(project_naam) : null,
      datumStart: String(datum_start),
      datumEind: String(datum_eind),
      tijdStart: tijd_start ? String(tijd_start) : null,
      tijdEind: tijd_eind ? String(tijd_eind) : null,
      uren: uren !== undefined ? Number(uren) : 8,
      status: String(status),
      type: String(type),
      werknummer: werknummer ? String(werknummer) : null,
      tijdsloten: tijdsloten ? String(tijdsloten) : null,
      dagNotities: dag_notities ? String(dag_notities) : null,
      notities: notities ? String(notities) : null,
      aangemaaktDoorId: (req as any).session?.gebruikerId ?? null,
    }).returning();

    res.status(201).json({
      id: row.id,
      titel: row.titel,
      omschrijving: row.omschrijving,
      medewerker_id: row.medewerkerId,
      medewerker_naam: null,
      gebouw_id: row.gebouwId,
      gebouw_naam: null,
      project_naam: row.projectNaam,
      datum_start: row.datumStart,
      datum_eind: row.datumEind,
      tijd_start: row.tijdStart,
      tijd_eind: row.tijdEind,
      uren: row.uren,
      status: row.status,
      type: row.type,
      werknummer: row.werknummer ?? null,
      tijdsloten: row.tijdsloten ?? null,
      dag_notities: row.dagNotities ?? null,
      notities: row.notities,
      aangemaakt_op: iso(row.aangemaaktOp),
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.get("/modules/planning/items/:id", lezenPlanning, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const [row] = await db
      .select({
        item: planningItemsTable,
        medewerkNaam: medewerkersTable.naam,
        gebouwNaam: gebouwenTable.naam,
      })
      .from(planningItemsTable)
      .leftJoin(medewerkersTable, eq(planningItemsTable.medewerkerId, medewerkersTable.id))
      .leftJoin(gebouwenTable, eq(planningItemsTable.gebouwId, gebouwenTable.id))
      .where(eq(planningItemsTable.id, id));

    if (!row) return res.status(404).json({ error: "Niet gevonden" });

    const { item, medewerkNaam, gebouwNaam } = row;
    res.json({
      id: item.id, titel: item.titel, omschrijving: item.omschrijving,
      medewerker_id: item.medewerkerId, medewerker_naam: medewerkNaam ?? null,
      gebouw_id: item.gebouwId, gebouw_naam: gebouwNaam ?? null,
      project_naam: item.projectNaam, datum_start: item.datumStart,
      datum_eind: item.datumEind, tijd_start: item.tijdStart, tijd_eind: item.tijdEind,
      uren: item.uren, status: item.status, type: item.type,
      werknummer: item.werknummer ?? null,
      tijdsloten: item.tijdsloten ?? null,
      dag_notities: item.dagNotities ?? null,
      notities: item.notities,
      aangemaakt_op: iso(item.aangemaaktOp),
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/planning/items/:id", schrijvenPlanning, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;

    const update: Partial<typeof planningItemsTable.$inferInsert> = {
      bijgewerktOp: new Date(),
    };
    if (body.titel !== undefined) update.titel = String(body.titel);
    if (body.omschrijving !== undefined) update.omschrijving = body.omschrijving ? String(body.omschrijving) : null;
    if (body.medewerker_id !== undefined) update.medewerkerId = body.medewerker_id ? Number(body.medewerker_id) : null;
    if (body.gebouw_id !== undefined) update.gebouwId = body.gebouw_id ? Number(body.gebouw_id) : null;
    if (body.project_naam !== undefined) update.projectNaam = body.project_naam ? String(body.project_naam) : null;
    if (body.datum_start !== undefined) update.datumStart = String(body.datum_start);
    if (body.datum_eind !== undefined) update.datumEind = String(body.datum_eind);
    if (body.tijd_start !== undefined) update.tijdStart = body.tijd_start ? String(body.tijd_start) : null;
    if (body.tijd_eind !== undefined) update.tijdEind = body.tijd_eind ? String(body.tijd_eind) : null;
    if (body.uren !== undefined) update.uren = Number(body.uren);
    if (body.status !== undefined) update.status = String(body.status);
    if (body.type !== undefined) update.type = String(body.type);
    if (body.werknummer !== undefined) update.werknummer = body.werknummer ? String(body.werknummer) : null;
    if (body.tijdsloten !== undefined) update.tijdsloten = body.tijdsloten ? String(body.tijdsloten) : null;
    if (body.dag_notities !== undefined) update.dagNotities = body.dag_notities ? String(body.dag_notities) : null;
    if (body.notities !== undefined) update.notities = body.notities ? String(body.notities) : null;

    const [row] = await db.update(planningItemsTable).set(update).where(eq(planningItemsTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Niet gevonden" });

    res.json({ id: row.id, titel: row.titel, datum_start: row.datumStart, datum_eind: row.datumEind,
      uren: row.uren, status: row.status, type: row.type, medewerker_id: row.medewerkerId,
      gebouw_id: row.gebouwId, project_naam: row.projectNaam,
      werknummer: row.werknummer ?? null, tijdsloten: row.tijdsloten ?? null,
      dag_notities: row.dagNotities ?? null, notities: row.notities,
      medewerker_naam: null, gebouw_naam: null, aangemaakt_op: iso(row.aangemaaktOp) });
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
    const { medewerker_id } = req.query as Record<string, string>;

    const rows = await db
      .select({
        af: planningAfwezigheidTable,
        medewerkNaam: medewerkersTable.naam,
      })
      .from(planningAfwezigheidTable)
      .leftJoin(medewerkersTable, eq(planningAfwezigheidTable.medewerkerId, medewerkersTable.id))
      .orderBy(desc(planningAfwezigheidTable.datumStart));

    let resultaten = rows;
    if (medewerker_id) {
      const mid = parseInt(medewerker_id, 10);
      resultaten = resultaten.filter((r) => r.af.medewerkerId === mid);
    }

    res.json(resultaten.map(({ af, medewerkNaam }) => ({
      id: af.id,
      medewerker_id: af.medewerkerId,
      medewerker_naam: medewerkNaam ?? null,
      type: af.type,
      datum_start: af.datumStart,
      datum_eind: af.datumEind,
      omschrijving: af.omschrijving,
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
      omschrijving: row.omschrijving, status: row.status, aangemaakt_op: iso(row.aangemaaktOp),
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/planning/afwezigheid/:id", schrijvenPlanning, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof planningAfwezigheidTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.type !== undefined) update.type = String(body.type);
    if (body.datum_start !== undefined) update.datumStart = String(body.datum_start);
    if (body.datum_eind !== undefined) update.datumEind = String(body.datum_eind);
    if (body.omschrijving !== undefined) update.omschrijving = body.omschrijving ? String(body.omschrijving) : null;
    if (body.status !== undefined) update.status = String(body.status);

    const [row] = await db.update(planningAfwezigheidTable).set(update).where(eq(planningAfwezigheidTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Niet gevonden" });

    res.json({ id: row.id, medewerker_id: row.medewerkerId, medewerker_naam: null,
      type: row.type, datum_start: row.datumStart, datum_eind: row.datumEind,
      omschrijving: row.omschrijving, status: row.status, aangemaakt_op: iso(row.aangemaaktOp) });
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

export default router;

import { Router } from "express";
import { db, projectenTable, crmKlantenTable, gebouwenTable, gebruikersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

function mapProject(
  row: typeof projectenTable.$inferSelect,
  extra?: { klantNaam?: string | null; gebouwNaam?: string | null; aangemaaktDoorNaam?: string | null }
) {
  return {
    id:                    row.id,
    naam:                  row.naam,
    werknummer:            row.werknummer ?? null,
    status:                row.status,
    werkmaatschappij:      row.werkmaatschappij ?? null,
    omschrijving:          row.omschrijving ?? null,
    crm_klant_id:          row.crmKlantId ?? null,
    crm_klant_naam:        extra?.klantNaam ?? null,
    gebouw_id:             row.gebouwId ?? null,
    gebouw_naam:           extra?.gebouwNaam ?? null,
    start_datum:           row.startDatum ?? null,
    eind_datum:            row.eindDatum ?? null,
    aangemaakt_door_naam:  extra?.aangemaaktDoorNaam ?? null,
    aangemaakt_op:         row.aangemaaktOp.toISOString(),
    bijgewerkt_op:         row.bijgewerktOp.toISOString(),
  };
}

async function projectMetNamen(id: number) {
  const rows = await db
    .select({
      project:   projectenTable,
      klantNaam: crmKlantenTable.naam,
      gebouwNaam: gebouwenTable.naam,
      makerNaam: gebruikersTable.naam,
    })
    .from(projectenTable)
    .leftJoin(crmKlantenTable, eq(projectenTable.crmKlantId, crmKlantenTable.id))
    .leftJoin(gebouwenTable,   eq(projectenTable.gebouwId,   gebouwenTable.id))
    .leftJoin(gebruikersTable, eq(projectenTable.aangemaaktDoorId, gebruikersTable.id))
    .where(eq(projectenTable.id, id))
    .limit(1);

  if (!rows.length) return null;
  const { project, klantNaam, gebouwNaam, makerNaam } = rows[0];
  return mapProject(project, { klantNaam, gebouwNaam, aangemaaktDoorNaam: makerNaam });
}

// ── GET /projecten ────────────────────────────────────────────────────────────

router.get("/projecten", requireAuth, async (req, res): Promise<void> => {
  const crmKlantId = req.query.crm_klant_id ? Number(req.query.crm_klant_id) : undefined;
  const gebouwId   = req.query.gebouw_id    ? Number(req.query.gebouw_id)    : undefined;
  const status     = req.query.status as string | undefined;

  const filters = [];
  if (crmKlantId) filters.push(eq(projectenTable.crmKlantId, crmKlantId));
  if (gebouwId)   filters.push(eq(projectenTable.gebouwId,   gebouwId));
  if (status)     filters.push(eq(projectenTable.status,     status));

  const rows = await db
    .select({
      project:    projectenTable,
      klantNaam:  crmKlantenTable.naam,
      gebouwNaam: gebouwenTable.naam,
      makerNaam:  gebruikersTable.naam,
    })
    .from(projectenTable)
    .leftJoin(crmKlantenTable, eq(projectenTable.crmKlantId, crmKlantenTable.id))
    .leftJoin(gebouwenTable,   eq(projectenTable.gebouwId,   gebouwenTable.id))
    .leftJoin(gebruikersTable, eq(projectenTable.aangemaaktDoorId, gebruikersTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(projectenTable.bijgewerktOp);

  res.json(rows.map(({ project, klantNaam, gebouwNaam, makerNaam }) =>
    mapProject(project, { klantNaam, gebouwNaam, aangemaaktDoorNaam: makerNaam })
  ));
});

// AANVRAAG_01 §7: POST /projecten is bewust verwijderd. Een project ontstaat
// uitsluitend bij ondertekening van een offerte (routes/portaal.ts) — nooit
// handmatig of vanuit de aanvraagstroom.

// ── GET /projecten/:id ────────────────────────────────────────────────────────

router.get("/projecten/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const project = await projectMetNamen(id);
  if (!project) { res.status(404).json({ fout: "Niet gevonden" }); return; }
  res.json(project);
});

// ── PATCH /projecten/:id ──────────────────────────────────────────────────────

router.patch("/projecten/:id", requireAuth, async (req, res): Promise<void> => {
  const id   = Number(req.params.id);
  const body = req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
  if (body.naam             !== undefined) updates.naam             = body.naam;
  if (body.werknummer       !== undefined) updates.werknummer       = body.werknummer ?? null;
  if (body.status           !== undefined) updates.status           = body.status;
  if (body.werkmaatschappij !== undefined) updates.werkmaatschappij = body.werkmaatschappij ?? null;
  if (body.omschrijving     !== undefined) updates.omschrijving     = body.omschrijving ?? null;
  if (body.crm_klant_id     !== undefined) updates.crmKlantId       = body.crm_klant_id ?? null;
  if (body.gebouw_id        !== undefined) updates.gebouwId         = body.gebouw_id ?? null;
  if (body.start_datum      !== undefined) updates.startDatum       = body.start_datum ?? null;
  if (body.eind_datum       !== undefined) updates.eindDatum        = body.eind_datum ?? null;

  const [updated] = await db
    .update(projectenTable)
    .set(updates)
    .where(eq(projectenTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ fout: "Niet gevonden" }); return; }
  const volledig = await projectMetNamen(id);
  res.json(volledig);
});

// ── DELETE /projecten/:id ─────────────────────────────────────────────────────

router.delete("/projecten/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [deleted] = await db
    .delete(projectenTable)
    .where(eq(projectenTable.id, id))
    .returning();
  if (!deleted) { res.status(404).json({ fout: "Niet gevonden" }); return; }
  res.status(204).send();
});

export default router;

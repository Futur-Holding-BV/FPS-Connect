import { Router } from "express";
import { z } from "zod/v4";
import {
  db,
  projectenTable,
  projectleiderGeschiedenisTable,
  werkbakItemsTable,
  crmKlantenTable,
  gebouwenTable,
  gebruikersTable,
  medewerkersTable,
} from "@workspace/db";
import { eq, and, isNull, inArray, count } from "drizzle-orm";
import { requireAuth, requireBevoegdheid, requireEnigeBevoegdheid } from "../middlewares/auth.js";
import { haalProjectleiderKandidaten } from "../lib/projectleiderKandidaten.js";
import {
  wijzigProjectleider,
  ProjectService422Error,
  ProjectServiceNietGevonden,
} from "../services/projectService.js";

const router = Router();

function mapProject(
  row: typeof projectenTable.$inferSelect,
  extra?: {
    klantNaam?: string | null;
    gebouwNaam?: string | null;
    aangemaaktDoorNaam?: string | null;
    projectleiderNaam?: string | null;
  }
) {
  return {
    id:                           row.id,
    naam:                         row.naam,
    werknummer:                   row.werknummer ?? null,
    status:                       row.status,
    werkmaatschappij:             row.werkmaatschappij ?? null,
    omschrijving:                 row.omschrijving ?? null,
    crm_klant_id:                 row.crmKlantId ?? null,
    crm_klant_naam:               extra?.klantNaam ?? null,
    gebouw_id:                    row.gebouwId ?? null,
    gebouw_naam:                  extra?.gebouwNaam ?? null,
    start_datum:                  row.startDatum ?? null,
    eind_datum:                   row.eindDatum ?? null,
    aangemaakt_door_naam:         extra?.aangemaaktDoorNaam ?? null,
    aangemaakt_op:                row.aangemaaktOp.toISOString(),
    bijgewerkt_op:                row.bijgewerktOp.toISOString(),
    projectleider_medewerker_id:  row.projectleiderMedewerkerId ?? null,
    projectleider_naam:           extra?.projectleiderNaam ?? null,
  };
}

async function projectMetNamen(id: number) {
  const rows = await db
    .select({
      project:            projectenTable,
      klantNaam:          crmKlantenTable.naam,
      gebouwNaam:         gebouwenTable.naam,
      makerNaam:          gebruikersTable.naam,
      projectleiderNaam:  medewerkersTable.naam,
    })
    .from(projectenTable)
    .leftJoin(crmKlantenTable,  eq(projectenTable.crmKlantId,               crmKlantenTable.id))
    .leftJoin(gebouwenTable,    eq(projectenTable.gebouwId,                  gebouwenTable.id))
    .leftJoin(gebruikersTable,  eq(projectenTable.aangemaaktDoorId,          gebruikersTable.id))
    .leftJoin(medewerkersTable, eq(projectenTable.projectleiderMedewerkerId, medewerkersTable.id))
    .where(eq(projectenTable.id, id))
    .limit(1);

  if (!rows.length) return null;
  const { project, klantNaam, gebouwNaam, makerNaam, projectleiderNaam } = rows[0];
  return mapProject(project, { klantNaam, gebouwNaam, aangemaaktDoorNaam: makerNaam, projectleiderNaam });
}

// ── GET /projecten ─────────────────────────────────────────────────────────────

router.get("/projecten", requireAuth, requireEnigeBevoegdheid([["gebouwen", 1], ["crm", 1]]), async (req, res): Promise<void> => {
  const crmKlantId = req.query.crm_klant_id ? Number(req.query.crm_klant_id) : undefined;
  const gebouwId   = req.query.gebouw_id    ? Number(req.query.gebouw_id)    : undefined;
  const status     = req.query.status as string | undefined;

  const filters = [];
  if (crmKlantId) filters.push(eq(projectenTable.crmKlantId, crmKlantId));
  if (gebouwId)   filters.push(eq(projectenTable.gebouwId,   gebouwId));
  if (status)     filters.push(eq(projectenTable.status,     status));

  const rows = await db
    .select({
      project:           projectenTable,
      klantNaam:         crmKlantenTable.naam,
      gebouwNaam:        gebouwenTable.naam,
      makerNaam:         gebruikersTable.naam,
      projectleiderNaam: medewerkersTable.naam,
    })
    .from(projectenTable)
    .leftJoin(crmKlantenTable,  eq(projectenTable.crmKlantId,               crmKlantenTable.id))
    .leftJoin(gebouwenTable,    eq(projectenTable.gebouwId,                  gebouwenTable.id))
    .leftJoin(gebruikersTable,  eq(projectenTable.aangemaaktDoorId,          gebruikersTable.id))
    .leftJoin(medewerkersTable, eq(projectenTable.projectleiderMedewerkerId, medewerkersTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(projectenTable.bijgewerktOp);

  res.json(rows.map(({ project, klantNaam, gebouwNaam, makerNaam, projectleiderNaam }) =>
    mapProject(project, { klantNaam, gebouwNaam, aangemaaktDoorNaam: makerNaam, projectleiderNaam })
  ));
});

// AANVRAAG_01 §7: POST /projecten is bewust verwijderd. Een project ontstaat
// uitsluitend bij ondertekening van een offerte (routes/portaal.ts) of bij
// handmatige gebouw-dossier-aanmaak (routes/gebouwen.ts POST) — nooit via
// een generiek POST /projecten endpoint.

// ── GET /projecten/projectleider-kandidaten (vóór /:id) ───────────────────────

router.get(
  "/projecten/projectleider-kandidaten",
  requireAuth,
  requireEnigeBevoegdheid([["gebouwen", 1]]),
  async (_req, res): Promise<void> => {
    const kandidaten = await haalProjectleiderKandidaten();
    res.json(kandidaten.map((k) => ({
      id:          k.id,
      naam:        k.naam,
      gebruiker_id: k.gebruikerId ?? null,
    })));
  },
);

// ── GET /projecten/beheer-backlog (vóór /:id) ─────────────────────────────────

router.get(
  "/projecten/beheer-backlog",
  requireAuth,
  requireBevoegdheid("gebouwen", 2),
  async (_req, res): Promise<void> => {
    const rows = await db
      .select({
        project:    projectenTable,
        gebouwNaam: gebouwenTable.naam,
      })
      .from(projectenTable)
      .leftJoin(gebouwenTable, eq(projectenTable.gebouwId, gebouwenTable.id))
      .where(isNull(projectenTable.projectleiderMedewerkerId))
      .orderBy(projectenTable.aangemaaktOp);

    const items = rows.map(({ project, gebouwNaam }) => ({
      id:          project.id,
      naam:        project.naam,
      status:      project.status,
      gebouw_id:   project.gebouwId ?? null,
      gebouw_naam: gebouwNaam ?? null,
      aangemaakt_op: project.aangemaaktOp.toISOString(),
    }));
    res.json({ items, totaal: items.length });
  },
);

// ── POST /projecten/bulk-toewijzing (vóór /:id) ───────────────────────────────

const BulkToewijzingBody = z.object({
  toewijzingen: z.array(
    z.object({
      project_id:               z.number().int().positive(),
      projectleider_medewerker_id: z.number().int().positive(),
    }),
  ).min(1),
  reden: z.string().nullable().optional(),
});

router.post(
  "/projecten/bulk-toewijzing",
  requireAuth,
  requireBevoegdheid("gebouwen", 2),
  async (req, res): Promise<void> => {
    const parsed = BulkToewijzingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Ongeldige invoer.",
        details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
      return;
    }
    const { toewijzingen, reden } = parsed.data;
    const actorGebruikerId = (req.session as { userId?: number }).userId ?? null;

    let geslaagd = 0;
    let mislukt  = 0;

    // Atomisch: alles in één transactie. Bij één fout rolt alles terug.
    try {
      await db.transaction(async (tx) => {
        for (const rij of toewijzingen) {
          // Gebruik de centrale service, maar meegeven van tx is niet direct
          // mogelijk via wijzigProjectleider (die start zijn eigen tx).
          // Doe hier de operaties direct in de al-bestaande tx.
          const [huidig] = await tx
            .select({
              id: projectenTable.id,
              projectleiderMedewerkerId: projectenTable.projectleiderMedewerkerId,
            })
            .from(projectenTable)
            .where(eq(projectenTable.id, rij.project_id));

          if (!huidig) {
            throw new ProjectServiceNietGevonden(`Project ${rij.project_id} niet gevonden.`);
          }

          // Valideer kandidaat inline
          const kandidaten = await haalProjectleiderKandidaten(tx as Parameters<typeof haalProjectleiderKandidaten>[0]);
          const kandidaat = kandidaten.find((k) => k.id === rij.projectleider_medewerker_id);
          if (!kandidaat) {
            throw new ProjectService422Error(
              `Medewerker ${rij.projectleider_medewerker_id} is geen geldige projectleider-kandidaat voor project ${rij.project_id}.`,
            );
          }

          const oud = huidig.projectleiderMedewerkerId;
          if (oud === rij.projectleider_medewerker_id) {
            // Idempotent: zelfde toewijzing, geen duplicaat
            geslaagd++;
            continue;
          }

          await tx
            .update(projectenTable)
            .set({ projectleiderMedewerkerId: rij.projectleider_medewerker_id, bijgewerktOp: new Date() })
            .where(eq(projectenTable.id, rij.project_id));

          await tx.insert(projectleiderGeschiedenisTable).values({
            projectId:           rij.project_id,
            oudeMedewerkerId:    oud,
            nieuweMedewerkerId:  rij.projectleider_medewerker_id,
            actorGebruikerId,
            reden:               reden ?? null,
          });

          // Sluit eventueel open werkbak-item
          await tx
            .update(werkbakItemsTable)
            .set({ status: "afgehandeld", afgehandeldOp: new Date(), bijgewerktOp: new Date() })
            .where(
              and(
                eq(werkbakItemsTable.dedupSleutel, `projectleider-ontbreekt:${rij.project_id}`),
                eq(werkbakItemsTable.status, "open"),
              ),
            );

          geslaagd++;
        }
      });
    } catch (err) {
      if (err instanceof ProjectService422Error) {
        res.status(422).json({ error: err.message });
        return;
      }
      if (err instanceof ProjectServiceNietGevonden) {
        res.status(404).json({ error: err.message });
        return;
      }
      throw err;
    }

    // Tel resterend zonder projectleider
    const [telling] = await db
      .select({ totaal: count() })
      .from(projectenTable)
      .where(isNull(projectenTable.projectleiderMedewerkerId));

    res.json({
      geslaagd,
      mislukt,
      resterend_zonder_projectleider: Number(telling?.totaal ?? 0),
    });
  },
);

// ── GET /projecten/:id ────────────────────────────────────────────────────────

router.get("/projecten/:id", requireAuth, requireEnigeBevoegdheid([["gebouwen", 1], ["crm", 1]]), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const project = await projectMetNamen(id);
  if (!project) { res.status(404).json({ fout: "Niet gevonden" }); return; }
  res.json(project);
});

// ── PATCH /projecten/:id ──────────────────────────────────────────────────────

const PatchProjectBody = z.object({
  naam:             z.string().optional(),
  werknummer:       z.string().nullable().optional(),
  status:           z.string().nullable().optional(),
  werkmaatschappij: z.string().nullable().optional(),
  omschrijving:     z.string().nullable().optional(),
  crm_klant_id:     z.number().int().nullable().optional(),
  gebouw_id:        z.number().int().nullable().optional(),
  start_datum:      z.string().nullable().optional(),
  eind_datum:       z.string().nullable().optional(),
  projectleider_medewerker_id: z.number().int().positive().nullable().optional(),
});

router.patch("/projecten/:id", requireAuth, requireBevoegdheid("gebouwen", 2), async (req, res): Promise<void> => {
  const id   = Number(req.params.id);
  const parsed = PatchProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Ongeldige invoer.",
      details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
    return;
  }
  const body = parsed.data;
  const actorGebruikerId = (req.session as { userId?: number }).userId ?? null;

  try {
    // Behandel projectleider-wijziging apart via centrale service
    if (body.projectleider_medewerker_id !== undefined && body.projectleider_medewerker_id !== null) {
      await wijzigProjectleider(id, body.projectleider_medewerker_id, actorGebruikerId);
    }

    // Resterende veldwijzigingen
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
  } catch (err) {
    if (err instanceof ProjectService422Error) {
      res.status(422).json({ error: err.message });
      return;
    }
    if (err instanceof ProjectServiceNietGevonden) {
      res.status(404).json({ fout: err.message });
      return;
    }
    throw err;
  }
});

// ── GET /projecten/:id/projectleider-geschiedenis ─────────────────────────────

router.get(
  "/projecten/:id/projectleider-geschiedenis",
  requireAuth,
  requireEnigeBevoegdheid([["gebouwen", 1]]),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);

    // Controleer of project bestaat
    const [project] = await db
      .select({ id: projectenTable.id })
      .from(projectenTable)
      .where(eq(projectenTable.id, id))
      .limit(1);
    if (!project) { res.status(404).json({ fout: "Niet gevonden" }); return; }

    // Haal geschiedenis op
    const rows = await db
      .select()
      .from(projectleiderGeschiedenisTable)
      .where(eq(projectleiderGeschiedenisTable.projectId, id))
      .orderBy(projectleiderGeschiedenisTable.tijdstip);

    if (rows.length === 0) {
      res.json([]);
      return;
    }

    // Haal namen op
    const medewerkerIds = new Set<number>();
    const actorIds     = new Set<number>();
    for (const r of rows) {
      if (r.oudeMedewerkerId)   medewerkerIds.add(r.oudeMedewerkerId);
      if (r.nieuweMedewerkerId) medewerkerIds.add(r.nieuweMedewerkerId);
      if (r.actorGebruikerId)   actorIds.add(r.actorGebruikerId);
    }

    const medewerkerNamen = new Map<number, string>();
    if (medewerkerIds.size > 0) {
      const medewerkers = await db
        .select({ id: medewerkersTable.id, naam: medewerkersTable.naam })
        .from(medewerkersTable)
        .where(inArray(medewerkersTable.id, [...medewerkerIds]));
      for (const m of medewerkers) medewerkerNamen.set(m.id, m.naam);
    }

    const actorNamen = new Map<number, string>();
    if (actorIds.size > 0) {
      const actoren = await db
        .select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(inArray(gebruikersTable.id, [...actorIds]));
      for (const a of actoren) actorNamen.set(a.id, a.naam);
    }

    res.json(rows.map((r) => ({
      id:                   r.id,
      project_id:           r.projectId,
      oude_medewerker_id:   r.oudeMedewerkerId ?? null,
      oude_medewerker_naam: r.oudeMedewerkerId ? (medewerkerNamen.get(r.oudeMedewerkerId) ?? null) : null,
      nieuwe_medewerker_id: r.nieuweMedewerkerId ?? null,
      nieuwe_medewerker_naam: r.nieuweMedewerkerId ? (medewerkerNamen.get(r.nieuweMedewerkerId) ?? null) : null,
      actor_gebruiker_id:   r.actorGebruikerId ?? null,
      actor_naam:           r.actorGebruikerId ? (actorNamen.get(r.actorGebruikerId) ?? null) : null,
      reden:                r.reden ?? null,
      tijdstip:             r.tijdstip.toISOString(),
    })));
  },
);

// ── DELETE /projecten/:id ─────────────────────────────────────────────────────

router.delete("/projecten/:id", requireAuth, requireBevoegdheid("gebouwen", 4), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [deleted] = await db
    .delete(projectenTable)
    .where(eq(projectenTable.id, id))
    .returning();
  if (!deleted) { res.status(404).json({ fout: "Niet gevonden" }); return; }
  res.status(204).send();
});

export default router;

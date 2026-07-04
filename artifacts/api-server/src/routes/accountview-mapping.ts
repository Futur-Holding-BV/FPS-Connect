import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { accountviewRelatieMappingTable, accountviewProjectMappingTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();

function paramInt(val: unknown): number {
  return parseInt(String(val), 10);
}

// ── GET /accountview/relatie-mapping ──────────────────────────────────────────
router.get("/accountview/relatie-mapping", requireBevoegdheid("financieel", 1), async (_req: Request, res: Response) => {
  const rijen = await db.select().from(accountviewRelatieMappingTable)
    .orderBy(desc(accountviewRelatieMappingTable.bijgewerktOp));
  res.json(rijen.map((r) => ({
    id: r.id,
    connect_relatienaam: r.connectRelatienaam,
    accountview_code: r.accountviewCode,
    type: r.type,
    opmerking: r.opmerking,
    bestaat_in_accountview: r.bestaatInAccountview,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  })));
});

// ── POST /accountview/relatie-mapping ─────────────────────────────────────────
router.post("/accountview/relatie-mapping", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    connect_relatienaam?: string;
    accountview_code?: string;
    type?: string;
    opmerking?: string | null;
    bestaat_in_accountview?: boolean;
  };
  if (!body.connect_relatienaam?.trim()) { res.status(400).json({ error: "connect_relatienaam is verplicht" }); return; }
  if (!body.accountview_code?.trim()) { res.status(400).json({ error: "accountview_code is verplicht" }); return; }

  const [rij] = await db.insert(accountviewRelatieMappingTable).values({
    connectRelatienaam: body.connect_relatienaam.trim(),
    accountviewCode: body.accountview_code.trim(),
    type: body.type ?? "crediteur",
    opmerking: body.opmerking ?? null,
    bestaatInAccountview: body.bestaat_in_accountview ?? false,
  }).returning();

  res.status(201).json({
    id: rij.id,
    connect_relatienaam: rij.connectRelatienaam,
    accountview_code: rij.accountviewCode,
    type: rij.type,
    opmerking: rij.opmerking,
    bestaat_in_accountview: rij.bestaatInAccountview,
    aangemaakt_op: rij.aangemaaktOp.toISOString(),
    bijgewerkt_op: rij.bijgewerktOp.toISOString(),
  });
});

// ── PATCH /accountview/relatie-mapping/:id ────────────────────────────────────
router.patch("/accountview/relatie-mapping/:id", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const body = req.body as {
    connect_relatienaam?: string;
    accountview_code?: string;
    type?: string;
    opmerking?: string | null;
    bestaat_in_accountview?: boolean;
  };

  const [rij] = await db.update(accountviewRelatieMappingTable).set({
    ...(body.connect_relatienaam !== undefined ? { connectRelatienaam: body.connect_relatienaam } : {}),
    ...(body.accountview_code !== undefined ? { accountviewCode: body.accountview_code } : {}),
    ...(body.type !== undefined ? { type: body.type } : {}),
    ...(body.opmerking !== undefined ? { opmerking: body.opmerking } : {}),
    ...(body.bestaat_in_accountview !== undefined ? { bestaatInAccountview: body.bestaat_in_accountview } : {}),
    bijgewerktOp: new Date(),
  }).where(eq(accountviewRelatieMappingTable.id, id)).returning();

  if (!rij) { res.status(404).json({ error: "Niet gevonden" }); return; }

  res.json({
    id: rij.id,
    connect_relatienaam: rij.connectRelatienaam,
    accountview_code: rij.accountviewCode,
    type: rij.type,
    opmerking: rij.opmerking,
    bestaat_in_accountview: rij.bestaatInAccountview,
    aangemaakt_op: rij.aangemaaktOp.toISOString(),
    bijgewerkt_op: rij.bijgewerktOp.toISOString(),
  });
});

// ── DELETE /accountview/relatie-mapping/:id ───────────────────────────────────
router.delete("/accountview/relatie-mapping/:id", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  await db.delete(accountviewRelatieMappingTable).where(eq(accountviewRelatieMappingTable.id, id));
  res.status(204).send();
});

// ── GET /accountview/project-mapping ─────────────────────────────────────────
router.get("/accountview/project-mapping", requireBevoegdheid("financieel", 1), async (_req: Request, res: Response) => {
  const rijen = await db.select().from(accountviewProjectMappingTable)
    .orderBy(desc(accountviewProjectMappingTable.bijgewerktOp));
  res.json(rijen.map((r) => ({
    id: r.id,
    connect_project_code: r.connectProjectCode,
    connect_gebouw_naam: r.connectGebouwNaam,
    accountview_projectcode: r.accountviewProjectcode,
    accountview_kostenplaats: r.accountviewKostenplaats,
    opmerking: r.opmerking,
    export_zonder_mapping: r.exportZonderMapping,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  })));
});

// ── POST /accountview/project-mapping ────────────────────────────────────────
router.post("/accountview/project-mapping", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    connect_project_code?: string;
    connect_gebouw_naam?: string | null;
    accountview_projectcode?: string | null;
    accountview_kostenplaats?: string | null;
    opmerking?: string | null;
    export_zonder_mapping?: boolean;
  };
  if (!body.connect_project_code?.trim()) { res.status(400).json({ error: "connect_project_code is verplicht" }); return; }

  const [rij] = await db.insert(accountviewProjectMappingTable).values({
    connectProjectCode: body.connect_project_code.trim(),
    connectGebouwNaam: body.connect_gebouw_naam ?? null,
    accountviewProjectcode: body.accountview_projectcode ?? null,
    accountviewKostenplaats: body.accountview_kostenplaats ?? null,
    opmerking: body.opmerking ?? null,
    exportZonderMapping: body.export_zonder_mapping ?? false,
  }).returning();

  res.status(201).json({
    id: rij.id,
    connect_project_code: rij.connectProjectCode,
    connect_gebouw_naam: rij.connectGebouwNaam,
    accountview_projectcode: rij.accountviewProjectcode,
    accountview_kostenplaats: rij.accountviewKostenplaats,
    opmerking: rij.opmerking,
    export_zonder_mapping: rij.exportZonderMapping,
    aangemaakt_op: rij.aangemaaktOp.toISOString(),
    bijgewerkt_op: rij.bijgewerktOp.toISOString(),
  });
});

// ── PATCH /accountview/project-mapping/:id ────────────────────────────────────
router.patch("/accountview/project-mapping/:id", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const body = req.body as {
    connect_project_code?: string;
    connect_gebouw_naam?: string | null;
    accountview_projectcode?: string | null;
    accountview_kostenplaats?: string | null;
    opmerking?: string | null;
    export_zonder_mapping?: boolean;
  };

  const [rij] = await db.update(accountviewProjectMappingTable).set({
    ...(body.connect_project_code !== undefined ? { connectProjectCode: body.connect_project_code } : {}),
    ...(body.connect_gebouw_naam !== undefined ? { connectGebouwNaam: body.connect_gebouw_naam } : {}),
    ...(body.accountview_projectcode !== undefined ? { accountviewProjectcode: body.accountview_projectcode } : {}),
    ...(body.accountview_kostenplaats !== undefined ? { accountviewKostenplaats: body.accountview_kostenplaats } : {}),
    ...(body.opmerking !== undefined ? { opmerking: body.opmerking } : {}),
    ...(body.export_zonder_mapping !== undefined ? { exportZonderMapping: body.export_zonder_mapping } : {}),
    bijgewerktOp: new Date(),
  }).where(eq(accountviewProjectMappingTable.id, id)).returning();

  if (!rij) { res.status(404).json({ error: "Niet gevonden" }); return; }

  res.json({
    id: rij.id,
    connect_project_code: rij.connectProjectCode,
    connect_gebouw_naam: rij.connectGebouwNaam,
    accountview_projectcode: rij.accountviewProjectcode,
    accountview_kostenplaats: rij.accountviewKostenplaats,
    opmerking: rij.opmerking,
    export_zonder_mapping: rij.exportZonderMapping,
    aangemaakt_op: rij.aangemaaktOp.toISOString(),
    bijgewerkt_op: rij.bijgewerktOp.toISOString(),
  });
});

// ── DELETE /accountview/project-mapping/:id ───────────────────────────────────
router.delete("/accountview/project-mapping/:id", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  await db.delete(accountviewProjectMappingTable).where(eq(accountviewProjectMappingTable.id, id));
  res.status(204).send();
});

export default router;

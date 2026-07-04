import { Router } from "express";
import type { Request, Response } from "express";
import { SNAGSTREAM_RAPPORT_ANALYSE_PROMPT } from "../lib/aiPrompts";
import {
  db,
  snagstreamRapportenTable,
  snagstreamSnagsTable,
  gebouwenTable,
  gebruikersTable,
  voorzieningenTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { aiGateway } from "../lib/aiGateway";

const router = Router();
const objectStorage = new ObjectStorageService();

// ── Sessie helper ─────────────────────────────────────────────────────────────
function sessionUserId(req: Request): number | null {
  const sess = req.session as unknown as Record<string, unknown>;
  const uid = sess["gebruikerId"];
  return typeof uid === "number" ? uid : null;
}

// ── Helper: param → integer ───────────────────────────────────────────────────
function paramInt(val: unknown): number {
  return parseInt(String(val), 10);
}

// ── Helper: rapport met gebouwnaam + snag_count ────────────────────────────
async function mapRapport(r: typeof snagstreamRapportenTable.$inferSelect) {
  const [gebouw] = r.gebouwId
    ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, r.gebouwId)).limit(1)
    : [null];
  const [uploader] = r.uploaderId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, r.uploaderId)).limit(1)
    : [null];
  const [count] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(snagstreamSnagsTable)
    .where(eq(snagstreamSnagsTable.rapportId, r.id));
  return {
    ...r,
    gebouw_naam: gebouw?.naam ?? null,
    uploader_naam: uploader?.naam ?? null,
    snag_count: count?.c ?? 0,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
    pdf_url: r.pdfUrl,
    project_naam: r.projectNaam,
    gebouw_id: r.gebouwId,
    uploader_id: r.uploaderId,
    ai_metadata: r.aiMetadata,
  };
}

// POST /snagstream/upload-url — presigned upload URL voor PDF
router.post("/snagstream/upload-url", requireBevoegdheid("gebouwen", 1), async (req: Request, res: Response): Promise<void> => {
  const { bestandsnaam } = req.body as { bestandsnaam?: string };
  if (!bestandsnaam) { res.status(400).json({ error: "bestandsnaam is verplicht" }); return; }
  try {
    const { uploadURL, objectPath } = await objectStorage.getObjectEntityUploadURL(null, "rapport");
    res.json({ upload_url: uploadURL, object_path: objectPath });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Upload URL aanvragen mislukt" });
  }
});

// GET /snagstream/rapporten — archief ophalen
router.get("/snagstream/rapporten", requireBevoegdheid("gebouwen", 1), async (req: Request, res: Response): Promise<void> => {
  const rawGebouwId = req.query["gebouw_id"];
  const gebouwId = rawGebouwId ? parseInt(String(rawGebouwId), 10) : null;
  const rijen = await db
    .select()
    .from(snagstreamRapportenTable)
    .where(gebouwId ? eq(snagstreamRapportenTable.gebouwId, gebouwId) : undefined)
    .orderBy(desc(snagstreamRapportenTable.aangemaaktOp));
  const mapped = await Promise.all(rijen.map(mapRapport));
  res.json(mapped);
});

// POST /snagstream/rapporten — rapport toevoegen
router.post("/snagstream/rapporten", requireBevoegdheid("gebouwen", 2), async (req: Request, res: Response): Promise<void> => {
  const { bestandsnaam, pdf_url, rapportdatum, opdrachtgever, project_naam, gebouw_id } = req.body as {
    bestandsnaam?: string; pdf_url?: string; rapportdatum?: string; opdrachtgever?: string;
    project_naam?: string; gebouw_id?: number;
  };
  if (!bestandsnaam || !pdf_url) { res.status(400).json({ error: "bestandsnaam en pdf_url zijn verplicht" }); return; }
  const [rij] = await db.insert(snagstreamRapportenTable).values({
    bestandsnaam,
    pdfUrl: pdf_url,
    rapportdatum: rapportdatum ?? null,
    opdrachtgever: opdrachtgever ?? null,
    projectNaam: project_naam ?? null,
    gebouwId: gebouw_id ?? null,
    uploaderId: sessionUserId(req),
    status: "nieuw",
  }).returning();
  res.status(201).json(await mapRapport(rij));
});

// GET /snagstream/rapporten/:id — detail
router.get("/snagstream/rapporten/:id", requireBevoegdheid("gebouwen", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const [rij] = await db.select().from(snagstreamRapportenTable).where(eq(snagstreamRapportenTable.id, id)).limit(1);
  if (!rij) { res.status(404).json({ error: "Niet gevonden" }); return; }
  res.json(await mapRapport(rij));
});

// PATCH /snagstream/rapporten/:id — koppelen / status bijwerken
router.patch("/snagstream/rapporten/:id", requireBevoegdheid("gebouwen", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const { gebouw_id, status, rapportdatum, opdrachtgever, project_naam } = req.body as {
    gebouw_id?: number | null; status?: string; rapportdatum?: string; opdrachtgever?: string; project_naam?: string;
  };
  const [updated] = await db.update(snagstreamRapportenTable)
    .set({
      ...(gebouw_id !== undefined ? { gebouwId: gebouw_id } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(rapportdatum !== undefined ? { rapportdatum } : {}),
      ...(opdrachtgever !== undefined ? { opdrachtgever } : {}),
      ...(project_naam !== undefined ? { projectNaam: project_naam } : {}),
      bijgewerktOp: new Date(),
    })
    .where(eq(snagstreamRapportenTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Niet gevonden" }); return; }
  res.json(await mapRapport(updated));
});

// DELETE /snagstream/rapporten/:id
router.delete("/snagstream/rapporten/:id", requireBevoegdheid("gebouwen", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  await db.delete(snagstreamRapportenTable).where(eq(snagstreamRapportenTable.id, id));
  res.status(204).send();
});

// POST /snagstream/rapporten/:id/ai-uitlezen — AI analyseert de PDF
router.post("/snagstream/rapporten/:id/ai-uitlezen", requireBevoegdheid("gebouwen", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const [rapport] = await db.select().from(snagstreamRapportenTable).where(eq(snagstreamRapportenTable.id, id)).limit(1);
  if (!rapport) { res.status(404).json({ error: "Niet gevonden" }); return; }

  // Bouw een toegankelijke download-URL
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  const downloadUrl = devDomain
    ? `https://${devDomain}/api/storage/files?path=${encodeURIComponent(rapport.pdfUrl)}`
    : rapport.pdfUrl;

  try {
    await db.update(snagstreamRapportenTable)
      .set({ status: "ai_uitgelezen", bijgewerktOp: new Date() })
      .where(eq(snagstreamRapportenTable.id, id));

    const snagstreamChatResultaat = await aiGateway.chat("default", {
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: SNAGSTREAM_RAPPORT_ANALYSE_PROMPT.tekst,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyseer dit Snagstream inspectierapport en extraheer alle snags/spots met hun eigenschappen.",
            },
            {
              type: "image_url",
              image_url: { url: downloadUrl, detail: "high" },
            },
          ],
        },
      ],
    });

    const rawText = snagstreamChatResultaat.ok ? snagstreamChatResultaat.inhoud : "{}";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    type ParsedResult = {
      rapport_info?: Record<string, unknown>;
      snags?: Array<{
        snagnummer?: string | null;
        verdieping?: string | null;
        ruimte?: string | null;
        omschrijving?: string | null;
        type_naam?: string | null;
        applicatie_naam?: string | null;
        label_naam?: string | null;
        classificatie?: string | null;
        status_origineel?: string | null;
        opmerkingen?: string | null;
        confidence_scores?: Record<string, number>;
      }>;
    };
    let parsed: ParsedResult = {};
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]) as ParsedResult; } catch { /* laat leeg */ }
    }

    const aiMetadata = parsed.rapport_info ?? {};
    await db.update(snagstreamRapportenTable).set({
      aiMetadata: aiMetadata as Record<string, unknown>,
      rapportdatum: (aiMetadata["rapportdatum"] as string | undefined) ?? rapport.rapportdatum ?? undefined,
      opdrachtgever: (aiMetadata["opdrachtgever"] as string | undefined) ?? rapport.opdrachtgever ?? undefined,
      projectNaam: (aiMetadata["projectnaam"] as string | undefined) ?? rapport.projectNaam ?? undefined,
      status: "concept_herkend",
      bijgewerktOp: new Date(),
    }).where(eq(snagstreamRapportenTable.id, id));

    const bestaandeSnags = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(snagstreamSnagsTable)
      .where(eq(snagstreamSnagsTable.rapportId, id));

    if ((bestaandeSnags[0]?.c ?? 0) === 0 && parsed.snags?.length) {
      await db.insert(snagstreamSnagsTable).values(
        parsed.snags.map((s) => ({
          rapportId: id,
          snagnummer: s.snagnummer ?? null,
          verdieping: s.verdieping ?? null,
          ruimte: s.ruimte ?? null,
          omschrijving: s.omschrijving ?? null,
          typeNaam: s.type_naam ?? null,
          applicatieNaam: s.applicatie_naam ?? null,
          labelNaam: s.label_naam ?? null,
          classificatie: s.classificatie ?? null,
          statusOrigineel: s.status_origineel ?? null,
          opmerkingen: s.opmerkingen ?? null,
          confidenceScores: s.confidence_scores ?? null,
        })),
      );
    }

    const [updated] = await db.select().from(snagstreamRapportenTable).where(eq(snagstreamRapportenTable.id, id)).limit(1);
    res.json(await mapRapport(updated));
  } catch (err) {
    req.log.error(err);
    await db.update(snagstreamRapportenTable).set({ status: "fout", bijgewerktOp: new Date() }).where(eq(snagstreamRapportenTable.id, id));
    res.status(500).json({ error: "AI-uitlezing mislukt" });
  }
});

// GET /snagstream/rapporten/:id/snags — snags ophalen
router.get("/snagstream/rapporten/:id/snags", requireBevoegdheid("gebouwen", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const snags = await db
    .select()
    .from(snagstreamSnagsTable)
    .where(eq(snagstreamSnagsTable.rapportId, id))
    .orderBy(snagstreamSnagsTable.id);
  res.json(snags.map((s) => ({
    ...s,
    aangemaakt_op: s.aangemaaktOp.toISOString(),
    type_naam: s.typeNaam,
    applicatie_naam: s.applicatieNaam,
    label_naam: s.labelNaam,
    toepassing_naam: s.toepassingNaam,
    status_origineel: s.statusOrigineel,
    foto_url: s.fotoUrl,
    pdf_pagina: s.pdfPagina,
    pdf_x: s.pdfX,
    pdf_y: s.pdfY,
    confidence_scores: s.confidenceScores,
    overgenomen: s.overgenomen,
    overgenomen_als_voorziening_id: s.overgenomenAlsVoorzieningId,
    rapport_id: s.rapportId,
  })));
});

// POST /snagstream/snags/:id/overnemen — snag omzetten naar Connect-spot
router.post("/snagstream/snags/:id/overnemen", requireBevoegdheid("gebouwen", 2), async (req: Request, res: Response): Promise<void> => {
  const snagId = paramInt(req.params["id"]);
  const [snag] = await db.select().from(snagstreamSnagsTable).where(eq(snagstreamSnagsTable.id, snagId)).limit(1);
  if (!snag) { res.status(404).json({ error: "Snag niet gevonden" }); return; }
  if (snag.overgenomen) { res.status(409).json({ error: "Snag is al overgenomen" }); return; }

  const { gebouw_id, verdieping_id, type_naam, ruimte, omschrijving } = req.body as {
    gebouw_id?: number; verdieping_id?: number; type_naam?: string; ruimte?: string; omschrijving?: string;
  };
  if (!gebouw_id || !verdieping_id) { res.status(400).json({ error: "gebouw_id en verdieping_id zijn verplicht" }); return; }

  const gebouwIdNum = Number(gebouw_id);
  const verdiepingIdNum = Number(verdieping_id);

  // Haal volgend spotnummer op
  const [volgnummerRij] = await db
    .select({ volgnummer: sql<number>`coalesce(max(cast(regexp_replace(objectnummer, '^[^0-9]*', '') as integer)), 0) + 1` })
    .from(voorzieningenTable)
    .where(eq(voorzieningenTable.gebouwId, gebouwIdNum));

  const volgnummer = volgnummerRij?.volgnummer ?? 1;

  const [gebouw] = await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, gebouwIdNum)).limit(1);
  const prefix = (gebouw?.naam ?? "SS").substring(0, 3).toUpperCase();
  const objectnummer = `${prefix}-${String(volgnummer).padStart(3, "0")}`;

  const typeValue = type_naam ?? snag.typeNaam ?? "doorvoering";
  const ruimteValue = ruimte ?? snag.ruimte ?? null;
  const omschrijvingWaarden = [
    "Aangemaakt vanuit Snagstream PDF-import",
    snag.snagnummer ? `Origineel snagnummer: ${snag.snagnummer}` : null,
    omschrijving ?? snag.omschrijving ?? null,
  ].filter((x): x is string => x !== null && x !== undefined);
  const opmerkingenValue = omschrijvingWaarden.join("\n") || null;

  const [voorziening] = await db.insert(voorzieningenTable).values({
    gebouwId: gebouwIdNum,
    verdiepingId: verdiepingIdNum,
    objectnummer,
    type: typeValue,
    ruimte: ruimteValue,
    opmerkingen: opmerkingenValue,
    status: "concept",
  }).returning();

  await db.update(snagstreamSnagsTable).set({
    overgenomen: true,
    overgenomenAlsVoorzieningId: voorziening.id,
  }).where(eq(snagstreamSnagsTable.id, snagId));

  const restSnags = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(snagstreamSnagsTable)
    .where(and(eq(snagstreamSnagsTable.rapportId, snag.rapportId), eq(snagstreamSnagsTable.overgenomen, false)));
  const statusNieuw = (restSnags[0]?.c ?? 0) === 0 ? "volledig_geimporteerd" : "deels_geimporteerd";
  await db.update(snagstreamRapportenTable)
    .set({ status: statusNieuw, bijgewerktOp: new Date() })
    .where(eq(snagstreamRapportenTable.id, snag.rapportId));

  res.status(201).json({ voorziening_id: voorziening.id });
});

export default router;

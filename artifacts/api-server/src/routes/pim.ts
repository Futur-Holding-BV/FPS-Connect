// PIM — Project Intelligence Model
// Routes: POST /aanvragen, GET /opdrachten/:id/pim,
//         PATCH /opdrachten/:id/pim/fase,
//         POST /opdrachten/:id/pim/analyseer,
//         POST /opdrachten/:id/pim/advies/bevestig,
//         POST /opdrachten/:id/pim/advies/afwijzen,
//         POST /opdrachten/:id/pim/advies/rapport,
//         POST /opdrachten/:id/pim/documenten/koppel,
//         POST /opdrachten/:id/pim/werkvoorbereiding/analyseer
import { Router } from "express";
import type { OpenAI } from "openai";
import {
  db,
  pimModellenTable,
  pimUitvoeringStappenTable,
  opdrachtenTable,
  documentLogboekTable,
  documentenTable,
  documentKoppelingenTable,
  gebruikersTable,
  voorzieningenTable,
} from "@workspace/db";
import type { PimUitvoeringStap } from "@workspace/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import { requireBevoegdheid, requireBevoegdheidOfKlant } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { execSync } from "child_process";
import {
  PIM_AANVRAAG_ANALYSE_PROMPT,
  PIM_WERKVOORBEREIDING_PROMPT,
  UITVOERING_STAP_PROMPT,
  UITVOERING_FOTO_ANALYSE_PROMPT,
  PIM_OPLEVERING_CONTROLEER_PROMPT,
  PIM_OPLEVERING_GENEREER_PROMPT,
  PIM_ONDERHOUD_NOTITIE_PROMPT,
} from "../lib/aiPrompts";
import { kbService, KB_BESLISSTRUCTUUR } from "../lib/kbService";
import { ObjectStorageService } from "../lib/objectStorage";

// Chromium voor PDF-generatie (zelfde aanpak als offertes.ts)
let CHROMIUM_PAD: string | null = null;
try {
  const pad = execSync("which chromium 2>/dev/null").toString().trim();
  if (pad) CHROMIUM_PAD = pad;
} catch { /* niet gevonden */ }

/** Escapet HTML-speciale tekens in user/AI-afkomstige strings. */
function htmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Bouw een eenvoudige maar volledige HTML-representatie van de advies_context. */
function bouwAdviesRapportHtml(ctx: Record<string, unknown>, opdrachttitel: string, datum: string): string {
  const sectie = (titel: string, inhoud: string) =>
    inhoud ? `<section><h3>${titel}</h3>${inhoud}</section>` : "";
  const lijst = (items: unknown) =>
    Array.isArray(items) && items.length > 0
      ? `<ul>${(items as string[]).map((i) => `<li>${htmlEscape(String(i))}</li>`).join("")}</ul>`
      : "";
  const aanbeveling = htmlEscape(String(ctx.aanbeveling ?? "").replace(/_/g, " "));
  const toelichting = htmlEscape(String(ctx.aanbeveling_toelichting ?? ""));
  return `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8">
<title>PIM Adviesrapport</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11pt;margin:40px;color:#1a1a1a}
  h1{font-size:16pt;margin-bottom:4px}
  h2{font-size:13pt;border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:24px}
  h3{font-size:11pt;margin-bottom:4px;color:#333}
  section{margin-bottom:16px}
  ul{margin:4px 0;padding-left:20px}
  li{margin:2px 0}
  .meta{color:#666;font-size:9pt;margin-bottom:20px}
  .aanbeveling{background:#f0f7ff;border:1px solid #b3d4f0;border-radius:4px;padding:10px 14px;margin-bottom:16px}
  .badge{display:inline-block;background:#e2e8f0;border-radius:3px;padding:2px 8px;font-size:9pt;font-weight:bold;margin-right:8px}
  .vop{background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:8px 12px;margin-top:8px;font-weight:bold}
</style></head><body>
<h1>PIM Adviesrapport</h1>
<div class="meta">Opdracht: <strong>${htmlEscape(opdrachttitel)}</strong> &nbsp;|&nbsp; Datum: ${htmlEscape(datum)} &nbsp;|&nbsp; Gegenereerd door FPS Connect AI Regisseur</div>
<h2>Advies</h2>
<div class="aanbeveling">
  <span class="badge">${aanbeveling || "—"}</span>
  <span class="badge">betrouwbaarheid: ${htmlEscape(String(ctx.betrouwbaarheid ?? "—"))}</span>
  ${toelichting ? `<p style="margin:8px 0 0">${toelichting}</p>` : ""}
</div>
${ctx.vop_aandachtspunt === true ? '<div class="vop">VOP-aandachtspunt: ja — inzet VOP-gecertificeerd monteur vereist</div>' : ""}
${sectie("Aangevraagde werkzaamheden", lijst(ctx.werkzaamheden))}
${sectie("Herkende locaties", lijst(ctx.locaties))}
${sectie("Risico&#39;s &amp; aandachtspunten", lijst(ctx.risicos))}
${sectie("Aannames", lijst(ctx.aannames))}
${sectie("Ontbrekende informatie", lijst(ctx.ontbrekende_info))}
${sectie("Open vragen voor opdrachtgever", lijst(ctx.vragen))}
${sectie("Benodigde competenties", lijst(ctx.competenties))}
${sectie("Relevante normen &amp; regelgeving", lijst(ctx.normen))}
</body></html>`;
}

const router = Router();
const lezen = requireBevoegdheidOfKlant("offertes", 1);
const schrijven = requireBevoegdheid("offertes", 2);

// ── Fase-transitiematrix ─────────────────────────────────────────────────────
// Volgorde is bepalend; alleen +1 stap voorwaarts is toegestaan.
// advies_gereed = beheerder heeft de AI-adviesrapportage goedgekeurd.
const FASEN = [
  "nieuw",
  "advies",
  "advies_gereed",
  "werkvoorbereiding",
  "inkoop",
  "uitvoering",
  "oplevering",
  "gereed",
] as const;
type AiFase = (typeof FASEN)[number];

const FASE_INDEX: Record<string, number> = Object.fromEntries(
  FASEN.map((f, i) => [f, i]),
);

function valideerTransitie(
  oudeFase: string | null | undefined,
  nieuweFase: AiFase,
): { ok: true } | { ok: false; van: string; naar: string } {
  if (!oudeFase) {
    if (nieuweFase === "nieuw") return { ok: true };
    return { ok: false, van: "—", naar: nieuweFase };
  }
  const oud = FASE_INDEX[oudeFase];
  const nieuw = FASE_INDEX[nieuweFase];
  if (oud === undefined) return { ok: true };
  if (nieuw === oud + 1) return { ok: true };
  return { ok: false, van: oudeFase, naar: nieuweFase };
}

// ── Map helpers ───────────────────────────────────────────────────────────────

function mapPim(m: typeof pimModellenTable.$inferSelect, isKlant: boolean) {
  const base = {
    id: m.id,
    opdracht_id: m.opdrachtId,
    aanvraag_via_one: m.aanvraagViaOne,
    aanvraag_context: (m.aanvraagContext as Record<string, unknown> | null) ?? null,
    advies_context: (m.adviesContext as Record<string, unknown> | null) ?? null,
    oplevering_context: (m.opleveringContext as Record<string, unknown> | null) ?? null,
    aangemaakt_op: m.aangemaaktOp.toISOString(),
    bijgewerkt_op: m.bijgewerktOp.toISOString(),
  };
  if (isKlant) return base;
  return {
    ...base,
    werkvoorbereiding_context: (m.werkvoorbereidingContext as Record<string, unknown> | null) ?? null,
    inkoop_context: (m.inkoopContext as Record<string, unknown> | null) ?? null,
    uitvoerings_log: (m.uitvoeringsLog as Record<string, unknown> | null) ?? null,
  };
}

// ── Hulpfunctie: objectPath → data-URL voor vision ────────────────────────────
async function objectPathNaarDataUrl(objectPath: string): Promise<string | null> {
  try {
    const svc = new ObjectStorageService();
    const genormaliseerd = svc.normalizeObjectEntityPath(objectPath);
    const file = await svc.getObjectEntityFile(genormaliseerd);
    const stream = file.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    const buf = Buffer.concat(chunks);
    const mimeType = objectPath.match(/\.(png)$/i)
      ? "image/png"
      : objectPath.match(/\.(gif)$/i)
      ? "image/gif"
      : objectPath.match(/\.(webp)$/i)
      ? "image/webp"
      : "image/jpeg";
    return `data:${mimeType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function isAfbeelding(url: string | null): boolean {
  if (!url) return false;
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
}

function isPdf(url: string | null): boolean {
  if (!url) return false;
  return /\.pdf$/i.test(url);
}

async function objectPathNaarPdfTekst(objectPath: string): Promise<string | null> {
  try {
    const svc = new ObjectStorageService();
    const genormaliseerd = svc.normalizeObjectEntityPath(objectPath);
    const file = await svc.getObjectEntityFile(genormaliseerd);
    const stream = file.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    const buf = Buffer.concat(chunks);
    // pdf-parse@2.x exports a named class (PDFParse) — bypass the v1.x @types declaration
    // via a typed dynamic import cast so TypeScript passes and runtime works correctly.
    type PdfParseV2 = {
      PDFParse: new (opts: { data: Uint8Array }) => {
        load(): Promise<void>;
        getText(params?: Record<string, unknown>): Promise<{ text: string }>;
      };
    };
    const { PDFParse } = (await import("pdf-parse")) as unknown as PdfParseV2;
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    await parser.load();
    const result = await parser.getText();
    const tekst = result.text?.trim();
    return tekst ? tekst.slice(0, 6000) : null;
  } catch {
    return null;
  }
}

// ── POST /aanvragen ──────────────────────────────────────────────────────────
router.post("/aanvragen", schrijven, async (req, res): Promise<void> => {
  try {
    const { titel, gebouw_id, omschrijving, aanvraag_via_one, aanvraag_context } =
      req.body as {
        titel?: string;
        gebouw_id?: number;
        omschrijving?: string;
        aanvraag_via_one?: boolean;
        aanvraag_context?: Record<string, unknown>;
      };

    if (!titel) {
      res.status(400).json({ error: "Titel is verplicht" });
      return;
    }

    const { opdracht, pim } = await db.transaction(async (tx) => {
      const [opdracht] = await tx
        .insert(opdrachtenTable)
        .values({
          titel,
          gebouwId: gebouw_id ?? null,
          omschrijving: omschrijving ?? null,
          status: "concept",
          aiFase: "nieuw",
          aangemaaktDoorId: req.session.userId!,
          bijgewerktOp: new Date(),
        })
        .returning();

      const [pim] = await tx
        .insert(pimModellenTable)
        .values({
          opdrachtId: opdracht.id,
          aanvraagViaOne: aanvraag_via_one ?? false,
          aanvraagContext: aanvraag_context ?? null,
          bijgewerktOp: new Date(),
        })
        .returning();

      return { opdracht, pim };
    });

    res.status(201).json({ opdracht_id: opdracht.id, pim_id: pim.id });
  } catch (err) {
    logger.error({ err }, "aanvraag aanmaken mislukt");
    res.status(500).json({ error: "Serverfout bij aanmaken aanvraag" });
  }
});

// ── GET /opdrachten/:id/pim ──────────────────────────────────────────────────
router.get("/opdrachten/:id/pim", lezen, async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [pim] = await db
      .select()
      .from(pimModellenTable)
      .where(eq(pimModellenTable.opdrachtId, opdrachtId));

    if (!pim) { res.status(404).json({ error: "PIM niet gevonden voor deze opdracht" }); return; }

    const isKlant = req.permissies?.isKlant ?? false;
    res.json(mapPim(pim, isKlant));
  } catch (err) {
    logger.error({ err }, "getPim fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── PATCH /opdrachten/:id/pim/fase ───────────────────────────────────────────
router.patch("/opdrachten/:id/pim/fase", schrijven, async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const { fase } = req.body as { fase?: string };
    if (!fase || !Object.prototype.hasOwnProperty.call(FASE_INDEX, fase)) {
      res.status(400).json({ error: `Ongeldige fase. Geldige waarden: ${FASEN.join(", ")}` });
      return;
    }
    const nieuweFase = fase as AiFase;

    const [opdracht] = await db
      .select({ id: opdrachtenTable.id, aiFase: opdrachtenTable.aiFase, titel: opdrachtenTable.titel })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, opdrachtId));

    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const transitie = valideerTransitie(opdracht.aiFase, nieuweFase);
    if (!transitie.ok) {
      res.status(409).json({
        error: `Ongeldige fase-overgang: ${transitie.van} → ${transitie.naar}. Alleen de eerstvolgende stap is toegestaan.`,
        van: transitie.van,
        naar: transitie.naar,
      });
      return;
    }

    const oudeFase = opdracht.aiFase;
    const gebruikerId = req.session.userId!;

    const [updated] = await db.transaction(async (tx) => {
      const [upd] = await tx
        .update(opdrachtenTable)
        .set({ aiFase: nieuweFase, bijgewerktOp: new Date() })
        .where(eq(opdrachtenTable.id, opdrachtId))
        .returning();

      const [gebruiker] = await tx
        .select({ naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, gebruikerId));

      await tx.insert(documentLogboekTable).values({
        gebruikerId,
        gebruikerNaam: gebruiker?.naam ?? null,
        actie: "pim_fase_overgang",
        detail: `PIM fase: ${oudeFase ?? "—"} → ${nieuweFase} (opdracht: ${opdracht.titel})`,
      });

      return [upd];
    });

    res.json({ opdracht_id: opdrachtId, ai_fase: updated.aiFase });
  } catch (err) {
    logger.error({ err }, "pimFase patch fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/pim/analyseer ────────────────────────────────────────
// Laadt de aanvraagcontext + gekoppelde documenten, roept AI aan (vision-slot),
// slaat het resultaat op in pim.advies_context en zet ai_fase = "advies".
// KB-context (Task #303) wordt hier later toegevoegd zodra kbService beschikbaar is.
router.post("/opdrachten/:id/pim/analyseer", schrijven, async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  if (!heeftGateway()) {
    res.status(503).json({ error: "AI-gateway niet geconfigureerd" });
    return;
  }

  try {
    const vrije_tekst: string = typeof req.body?.vrije_tekst === "string"
      ? req.body.vrije_tekst.slice(0, 8000)
      : "";

    // 1. Haal opdracht + PIM op
    const [opdracht] = await db
      .select()
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, opdrachtId));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const [pim] = await db
      .select()
      .from(pimModellenTable)
      .where(eq(pimModellenTable.opdrachtId, opdrachtId));
    if (!pim) { res.status(404).json({ error: "PIM niet gevonden voor deze opdracht" }); return; }

    // 2. Laad gekoppelde documenten via DMS (doel_type='opdracht')
    const koppelingen = await db
      .select({ documentId: documentKoppelingenTable.documentId })
      .from(documentKoppelingenTable)
      .where(
        and(
          eq(documentKoppelingenTable.doelType, "opdracht"),
          eq(documentKoppelingenTable.doelId, opdrachtId),
        ),
      );

    const documentIds = koppelingen.map((k) => k.documentId);
    const documenten = documentIds.length > 0
      ? await db.select().from(documentenTable).where(
          // drizzle inArray fallback voor kleine sets
          eq(documentenTable.id, documentIds[0])
        ).then(async (eerste) => {
          const rest = await Promise.all(
            documentIds.slice(1).map((id) =>
              db.select().from(documentenTable).where(eq(documentenTable.id, id))
            ),
          );
          return [eerste[0], ...rest.flat().filter(Boolean)].filter(Boolean);
        })
      : [];

    // 3. Stel de context-tekst samen
    const aanvraagCtx = (pim.aanvraagContext as Record<string, unknown> | null) ?? {};
    const contextDelen: string[] = [
      `Opdrachttitel: ${opdracht.titel}`,
      opdracht.omschrijving ? `Omschrijving: ${opdracht.omschrijving}` : "",
      aanvraagCtx.vrije_tekst ? `Aanvraagcontext: ${String(aanvraagCtx.vrije_tekst)}` : "",
      vrije_tekst ? `Aanvullende toelichting: ${vrije_tekst}` : "",
      documenten.length > 0
        ? `Beschikbare documenten (${documenten.length}):\n` +
          documenten.map((d) => `- ${d?.naam ?? "?"} (${d?.documenttype ?? "?"})${d?.fabrikant ? ` — ${d.fabrikant}` : ""}`).join("\n")
        : "Geen documenten bijgevoegd.",
    ].filter(Boolean);
    const contextTekst = contextDelen.join("\n\n");

    // 4. Probeer afbeeldingen op te halen voor vision (max 3)
    const imageDataUrls: string[] = [];
    for (const doc of documenten.slice(0, 6)) {
      if (!doc) continue;
      if (isAfbeelding(doc.pdfUrl)) {
        const dataUrl = await objectPathNaarDataUrl(doc.pdfUrl!);
        if (dataUrl) imageDataUrls.push(dataUrl);
        if (imageDataUrls.length >= 3) break;
      }
    }

    // 4b. PDF-tekst extraheren voor context (max 5 PDFs, max 6000 tekens per PDF)
    const pdfTeksten: string[] = [];
    for (const doc of documenten.slice(0, 5)) {
      if (!doc || !doc.pdfUrl || isAfbeelding(doc.pdfUrl)) continue;
      if (isPdf(doc.pdfUrl)) {
        const tekst = await objectPathNaarPdfTekst(doc.pdfUrl);
        if (tekst) pdfTeksten.push(`[PDF: ${doc.naam ?? "document"}]\n${tekst}`);
      }
    }

    // 5. Bouw de berichten op
    type ContentPart =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } };
    const userContent: ContentPart[] = [{ type: "text", text: contextTekst }];
    for (const url of imageDataUrls) {
      userContent.push({ type: "image_url", image_url: { url } });
    }
    if (pdfTeksten.length > 0) {
      const eersteTextPart = userContent[0] as { type: "text"; text: string };
      userContent[0] = {
        type: "text",
        text: `${eersteTextPart.text}\n\n=== GEEXTRAHEERDE PDF-INHOUD ===\n${pdfTeksten.join("\n\n---\n")}`,
      };
    }

    // 6. KB-context (Task #303 stub — retourneert null totdat KB-module beschikbaar is)
    // contextTekst en userContent zijn al opgebouwd; kbContext wordt als extra tekststuk toegevoegd.
    const kbContext = await kbService.assembleKbContext(opdrachtId);
    const kbExtras = [
      kbContext ? `=== KENNISBANK CONTEXT ===\n${kbContext}` : "",
      KB_BESLISSTRUCTUUR ? `=== BESLISSTRUCTUUR ===\n${KB_BESLISSTRUCTUUR}` : "",
    ].filter(Boolean).join("\n\n");
    if (kbExtras) {
      const eersteTextPart = userContent[0] as { type: "text"; text: string };
      userContent[0] = { type: "text", text: `${eersteTextPart.text}\n\n${kbExtras}` };
    }

    // 7. AI-aanroep (vision-slot = gpt-5)
    const resultaat = await aiGateway.chat(
      "vision",
      {
        messages: [
          { role: "system", content: PIM_AANVRAAG_ANALYSE_PROMPT.tekst },
          { role: "user", content: userContent as unknown as OpenAI.Chat.Completions.ChatCompletionContentPart[] },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 4000,
      },
      90_000,
      {
        module: "pim_advies",
        functie: "analyseer",
        gebruikerId: req.session.userId ?? null,
        entiteitstype: "pim",
        entiteitId: pim.id,
        promptNaam: PIM_AANVRAAG_ANALYSE_PROMPT.naam,
        promptVersie: PIM_AANVRAAG_ANALYSE_PROMPT.versie,
        project_id: opdrachtId,
      },
    );

    if (!resultaat.ok) {
      res.status(502).json({ error: `AI-analyse mislukt: ${resultaat.fout}` });
      return;
    }

    // 7. Valideer en bewaar het JSON-resultaat
    let adviesJson: Record<string, unknown>;
    try {
      adviesJson = JSON.parse(resultaat.inhoud);
    } catch {
      res.status(502).json({ error: "AI leverde geen geldige JSON terug" });
      return;
    }

    const gebruikerId = req.session.userId!;

    await db.transaction(async (tx) => {
      await tx
        .update(pimModellenTable)
        .set({ adviesContext: adviesJson, bijgewerktOp: new Date() })
        .where(eq(pimModellenTable.id, pim.id));

      // Fase vooruitschuiven naar "advies" (vanuit "nieuw")
      if (opdracht.aiFase === "nieuw" || !opdracht.aiFase) {
        await tx
          .update(opdrachtenTable)
          .set({ aiFase: "advies", bijgewerktOp: new Date() })
          .where(eq(opdrachtenTable.id, opdrachtId));
      }

      const [gebruiker] = await tx
        .select({ naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, gebruikerId));

      await tx.insert(documentLogboekTable).values({
        gebruikerId,
        gebruikerNaam: gebruiker?.naam ?? null,
        actie: "pim_ai_analyse",
        detail: `AI-adviesanalyse uitgevoerd voor opdracht: ${opdracht.titel} (${documenten.length} document(en), ${imageDataUrls.length} afbeelding(en))`,
      });
    });

    res.json({
      opdracht_id: opdrachtId,
      ai_fase: "advies",
      aanbeveling: String(adviesJson.aanbeveling ?? ""),
      betrouwbaarheid: String(adviesJson.betrouwbaarheid ?? "laag"),
    });
  } catch (err) {
    logger.error({ err }, "pimAnalyseer fout");
    res.status(500).json({ error: "Serverfout bij AI-analyse" });
  }
});

// ── POST /opdrachten/:id/pim/advies/bevestig ─────────────────────────────────
// Beheerder keurt de AI-adviesanalyse goed; zet ai_fase = "advies_gereed".
router.post("/opdrachten/:id/pim/advies/bevestig", schrijven, async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [opdracht] = await db
      .select({ id: opdrachtenTable.id, aiFase: opdrachtenTable.aiFase, titel: opdrachtenTable.titel })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, opdrachtId));

    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    if (opdracht.aiFase !== "advies") {
      res.status(409).json({
        error: `Bevestigen is alleen mogelijk vanuit fase 'advies' (huidige fase: '${opdracht.aiFase ?? "—"}').`,
      });
      return;
    }

    const [pim] = await db
      .select({ id: pimModellenTable.id, adviesContext: pimModellenTable.adviesContext })
      .from(pimModellenTable)
      .where(eq(pimModellenTable.opdrachtId, opdrachtId));

    if (!pim?.adviesContext) {
      res.status(409).json({ error: "Er is nog geen AI-adviesanalyse om goed te keuren. Voer eerst een analyse uit." });
      return;
    }

    const gebruikerId = req.session.userId!;

    await db.transaction(async (tx) => {
      await tx
        .update(opdrachtenTable)
        .set({ aiFase: "advies_gereed", bijgewerktOp: new Date() })
        .where(eq(opdrachtenTable.id, opdrachtId));

      const [gebruiker] = await tx
        .select({ naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, gebruikerId));

      await tx.insert(documentLogboekTable).values({
        gebruikerId,
        gebruikerNaam: gebruiker?.naam ?? null,
        actie: "pim_advies_bevestigd",
        detail: `Beheerder heeft AI-adviesanalyse goedgekeurd voor opdracht: ${opdracht.titel}`,
      });
    });

    res.json({ opdracht_id: opdrachtId, ai_fase: "advies_gereed" });
  } catch (err) {
    logger.error({ err }, "pimAdviesBevestig fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/pim/advies/rapport ───────────────────────────────────
// Genereert een PDF via DDS-engine (puppeteer + page.setContent) en koppelt
// het als DMS-document aan de opdracht.
router.post("/opdrachten/:id/pim/advies/rapport", schrijven, async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [opdracht] = await db
      .select({ id: opdrachtenTable.id, titel: opdrachtenTable.titel, aiFase: opdrachtenTable.aiFase })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, opdrachtId));

    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const [pim] = await db
      .select()
      .from(pimModellenTable)
      .where(eq(pimModellenTable.opdrachtId, opdrachtId));

    // Minimaal fase "advies" vereist (AI-analyse moet hebben gedraaid).
    const rapportFaseIdx = FASE_INDEX[opdracht.aiFase ?? ""] ?? -1;
    const adviesIdx = FASE_INDEX["advies"]!;
    if (rapportFaseIdx < adviesIdx) {
      res.status(409).json({
        error: `Rapport aanmaken vereist dat de AI-analyse is uitgevoerd (minimaal fase 'advies', huidige fase: '${opdracht.aiFase ?? "nieuw"}').`,
      });
      return;
    }

    if (!pim?.adviesContext) {
      res.status(409).json({ error: "Er is geen adviescontext beschikbaar. Voer eerst een AI-analyse uit." });
      return;
    }

    const gebruikerId = req.session.userId!;
    const rapportNaam = `PIM Adviesrapport — ${opdracht.titel}`;
    const vandaag = new Date().toISOString().slice(0, 10);
    const adviesCtx = pim.adviesContext as Record<string, unknown>;

    // ── PDF genereren via DDS (puppeteer + page.setContent) ──────────────────
    let pdfObjectPad: string | null = null;
    if (CHROMIUM_PAD) {
      try {
        const puppeteer = await import("puppeteer-core");
        const browser = await puppeteer.launch({
          executablePath: CHROMIUM_PAD,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
        });
        try {
          const page = await browser.newPage();
          const htmlContent = bouwAdviesRapportHtml(adviesCtx, opdracht.titel, vandaag);
          await page.setContent(htmlContent, { waitUntil: "load", timeout: 30000 });
          const pdfBuffer = await page.pdf({ format: "A4", printBackground: true, margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" } });
          await browser.close();

          const svc = new ObjectStorageService();
          const sleutelnaam = `pim/adviesrapporten/${opdrachtId}_${Date.now()}.pdf`;
          pdfObjectPad = await svc.uploadBestand(sleutelnaam, Buffer.from(pdfBuffer), "application/pdf");
        } catch (pdfErr) {
          await browser.close().catch(() => undefined);
          logger.warn({ err: pdfErr }, "PIM PDF generatie mislukt, doorgaan zonder PDF");
        }
      } catch (puppeteerErr) {
        logger.warn({ err: puppeteerErr }, "Puppeteer niet beschikbaar, doorgaan zonder PDF");
      }
    }

    // ── DMS-document aanmaken en koppelen ────────────────────────────────────
    const { document: doc } = await db.transaction(async (tx) => {
      const [document] = await tx
        .insert(documentenTable)
        .values({
          naam: rapportNaam,
          documenttype: "adviesrapport",
          datum: vandaag,
          ...(pdfObjectPad ? { pdfUrl: pdfObjectPad } : {}),
          aiGeanalyseerd: true,
          aiMetadata: adviesCtx,
          bijgewerktOp: new Date(),
        })
        .returning();

      await tx
        .insert(documentKoppelingenTable)
        .values({
          documentId: document.id,
          doelType: "opdracht",
          doelId: opdrachtId,
          aangemaaktDoorId: gebruikerId,
        });

      const [gebruiker] = await tx
        .select({ naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, gebruikerId));

      await tx.insert(documentLogboekTable).values({
        documentId: document.id,
        documentNaam: rapportNaam,
        gebruikerId,
        gebruikerNaam: gebruiker?.naam ?? null,
        actie: "geupload",
        detail: `PIM Adviesrapport aangemaakt voor opdracht: ${opdracht.titel}${pdfObjectPad ? " (incl. PDF)" : " (zonder PDF — chromium niet beschikbaar)"}`,
      });

      return { document };
    });

    res.status(200).json({ opdracht_id: opdrachtId, document_id: doc.id, pdf_gegenereerd: pdfObjectPad !== null });
  } catch (err) {
    logger.error({ err }, "pimAdviesRapport fout");
    res.status(500).json({ error: "Serverfout bij aanmaken rapport" });
  }
});

// ── POST /opdrachten/:id/pim/advies/afwijzen ──────────────────────────────────
// Beheerder wijst de AI-adviesanalyse af; reset ai_fase → "nieuw" zodat de
// analyse opnieuw kan worden gestart na aanvulling.
router.post("/opdrachten/:id/pim/advies/afwijzen", schrijven, async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const reden: string = typeof req.body?.reden === "string" ? req.body.reden.slice(0, 1000) : "";

    const [opdracht] = await db
      .select({ id: opdrachtenTable.id, titel: opdrachtenTable.titel, aiFase: opdrachtenTable.aiFase })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, opdrachtId));

    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    // Afwijzen is alleen zinvol in fase "advies"
    if (opdracht.aiFase !== "advies") {
      res.status(409).json({
        error: `Afwijzen is alleen mogelijk in fase 'advies' (huidige fase: '${opdracht.aiFase ?? "nieuw"}').`,
      });
      return;
    }

    const gebruikerId = req.session.userId!;

    await db.transaction(async (tx) => {
      await tx
        .update(opdrachtenTable)
        .set({ aiFase: "nieuw", bijgewerktOp: new Date() })
        .where(eq(opdrachtenTable.id, opdrachtId));

      const [gebruiker] = await tx
        .select({ naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, gebruikerId));

      await tx.insert(documentLogboekTable).values({
        gebruikerId,
        gebruikerNaam: gebruiker?.naam ?? null,
        actie: "pim_advies_afgewezen",
        detail: `Beheerder heeft AI-adviesanalyse afgewezen voor opdracht: ${opdracht.titel}${reden ? ` — reden: ${reden}` : ""}`,
      });
    });

    res.json({ opdracht_id: opdrachtId, ai_fase: "nieuw" });
  } catch (err) {
    logger.error({ err }, "pimAdviesAfwijzen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/pim/documenten/koppel ────────────────────────────────
// Koppelt een bestaand DMS-document aan de opdracht (doel_type='opdracht').
// Wordt aangeroepen door FPS One Adviescentrum direct na aanmaken van het document.
router.post("/opdrachten/:id/pim/documenten/koppel", schrijven, async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const documentId = typeof req.body?.document_id === "number"
    ? req.body.document_id
    : parseInt(String(req.body?.document_id ?? ""), 10);
  if (isNaN(documentId) || documentId <= 0) {
    res.status(400).json({ error: "document_id is verplicht" });
    return;
  }

  try {
    const [opdracht] = await db
      .select({ id: opdrachtenTable.id })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, opdrachtId));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    await db.insert(documentKoppelingenTable).values({
      documentId,
      doelType: "opdracht",
      doelId: opdrachtId,
      aangemaaktDoorId: req.session.userId!,
    }).onConflictDoNothing();

    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "pimDocumentKoppel fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── PATCH /opdrachten/:id/pim/werkvoorbereiding ───────────────────────────────
// Handmatige aanpassingen aan werkvoorbereiding_context opslaan.
router.patch("/opdrachten/:id/pim/werkvoorbereiding", schrijven, async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const { werkvoorbereiding_context } = req.body as { werkvoorbereiding_context?: unknown };
  if (!werkvoorbereiding_context || typeof werkvoorbereiding_context !== "object") {
    res.status(400).json({ error: "werkvoorbereiding_context ontbreekt of is geen object" });
    return;
  }

  try {
    const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const [pim] = await db.select().from(pimModellenTable).where(eq(pimModellenTable.opdrachtId, opdrachtId));
    if (!pim) { res.status(404).json({ error: "PIM niet gevonden voor deze opdracht" }); return; }

    if (opdracht.aiFase !== "werkvoorbereiding") {
      res.status(409).json({
        error: `Bewerken vereist fase 'werkvoorbereiding' (huidige fase: '${opdracht.aiFase ?? "nieuw"}').`,
      });
      return;
    }

    await db
      .update(pimModellenTable)
      .set({ werkvoorbereidingContext: werkvoorbereiding_context as Record<string, unknown>, bijgewerktOp: new Date() })
      .where(eq(pimModellenTable.id, pim.id));

    res.json({
      opdracht_id: opdrachtId,
      ai_fase: opdracht.aiFase ?? "werkvoorbereiding",
      voorbereiding_volledigheid: (werkvoorbereiding_context as Record<string, unknown>).voorbereiding_volledigheid
        ? String((werkvoorbereiding_context as Record<string, unknown>).voorbereiding_volledigheid)
        : "voldoende",
    });
  } catch (err) {
    logger.error({ err }, "patchPimWerkvoorbereiding fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/pim/werkvoorbereiding/vaststellen ────────────────────
// Menselijke goedkeuring: zet ai_fase → inkoop; logt in audittrail.
router.post("/opdrachten/:id/pim/werkvoorbereiding/vaststellen", schrijven, async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const [pim] = await db.select().from(pimModellenTable).where(eq(pimModellenTable.opdrachtId, opdrachtId));
    if (!pim) { res.status(404).json({ error: "PIM niet gevonden voor deze opdracht" }); return; }

    if (opdracht.aiFase !== "werkvoorbereiding") {
      res.status(409).json({
        error: `Vaststellen vereist fase 'werkvoorbereiding' (huidige fase: '${opdracht.aiFase ?? "nieuw"}').`,
      });
      return;
    }

    const gebruikerId = req.session.userId!;

    await db.transaction(async (tx) => {
      await tx
        .update(opdrachtenTable)
        .set({ aiFase: "inkoop", bijgewerktOp: new Date() })
        .where(eq(opdrachtenTable.id, opdrachtId));

      const [gebruiker] = await tx
        .select({ naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, gebruikerId));

      await tx.insert(documentLogboekTable).values({
        gebruikerId,
        gebruikerNaam: gebruiker?.naam ?? null,
        actie: "pim_werkvoorbereiding_vaststellen",
        detail: `Werkvoorbereiding vastgesteld voor opdracht: ${opdracht.titel} — fase naar inkoop`,
      });
    });

    res.json({ opdracht_id: opdrachtId, ai_fase: "inkoop" });
  } catch (err) {
    logger.error({ err }, "vaststellenPimWerkvoorbereiding fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/pim/werkvoorbereiding/analyseer + /genereer ──────────
// Laadt advies_context + spots voor het gebouw, roept AI aan, slaat op in
// werkvoorbereiding_context en zet ai_fase → "werkvoorbereiding".
// Beide paden zijn actief: /analyseer (legacy) + /genereer (canonical, taakspec).
async function werkvoorbereidingAnalyseer(req: import("express").Request, res: import("express").Response): Promise<void> {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  if (!heeftGateway()) {
    res.status(503).json({ error: "AI-gateway niet geconfigureerd" });
    return;
  }

  try {
    const vriejeTekst: string = typeof req.body?.vrije_tekst === "string"
      ? req.body.vrije_tekst.slice(0, 4000)
      : "";

    const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const [pim] = await db.select().from(pimModellenTable).where(eq(pimModellenTable.opdrachtId, opdrachtId));
    if (!pim) { res.status(404).json({ error: "PIM niet gevonden voor deze opdracht" }); return; }

    // Vereist minimaal fase advies_gereed (AI-advies bevestigd)
    const wvFaseIdx = FASE_INDEX[opdracht.aiFase ?? ""] ?? -1;
    const adviesGereedIdx = FASE_INDEX["advies_gereed"]!;
    if (wvFaseIdx < adviesGereedIdx) {
      res.status(409).json({
        error: `Werkvoorbereiding analyseren vereist minimaal fase 'advies_gereed' (huidige fase: '${opdracht.aiFase ?? "nieuw"}').`,
      });
      return;
    }

    if (!pim.adviesContext) {
      res.status(409).json({ error: "Geen adviescontext beschikbaar. Voer eerst de adviesanalyse uit en bevestig deze." });
      return;
    }

    // Bestaande spots voor het gebouw (max 50, niet gearchiveerd)
    const spots = opdracht.gebouwId
      ? await db
          .select({
            objectnummer: voorzieningenTable.objectnummer,
            type: voorzieningenTable.type,
            status: voorzieningenTable.status,
            ruimte: voorzieningenTable.ruimte,
            locatieOmschrijving: voorzieningenTable.locatieOmschrijving,
          })
          .from(voorzieningenTable)
          .where(
            and(
              eq(voorzieningenTable.gebouwId, opdracht.gebouwId),
              eq(voorzieningenTable.gearchiveerd, false),
            ),
          )
          .limit(50)
      : [];

    const adviesCtx = (pim.adviesContext as Record<string, unknown>) ?? {};
    const spotsamenvatting = spots.length > 0
      ? `Bestaande spots in het gebouw (${spots.length}):\n` +
        spots.map((s) =>
          `- [${s.objectnummer}] ${s.type} | status: ${s.status}` +
          (s.ruimte ? ` | ruimte: ${s.ruimte}` : "") +
          (s.locatieOmschrijving ? ` | locatie: ${s.locatieOmschrijving}` : "")
        ).join("\n")
      : "Nog geen spots geregistreerd voor dit gebouw.";

    const contextTekst = [
      `Opdrachttitel: ${opdracht.titel}`,
      opdracht.omschrijving ? `Omschrijving: ${opdracht.omschrijving}` : "",
      `\n=== ADVIESCONTEXT (AI-fase B) ===`,
      `Aanbeveling: ${String(adviesCtx.aanbeveling ?? "—")}`,
      adviesCtx.aanbeveling_toelichting ? `Toelichting: ${String(adviesCtx.aanbeveling_toelichting)}` : "",
      Array.isArray(adviesCtx.werkzaamheden) && adviesCtx.werkzaamheden.length > 0
        ? `Aangevraagde werkzaamheden:\n${(adviesCtx.werkzaamheden as string[]).map((w) => `- ${w}`).join("\n")}`
        : "",
      Array.isArray(adviesCtx.locaties) && adviesCtx.locaties.length > 0
        ? `Locaties:\n${(adviesCtx.locaties as string[]).map((l) => `- ${l}`).join("\n")}`
        : "",
      Array.isArray(adviesCtx.risicos) && adviesCtx.risicos.length > 0
        ? `Risico's:\n${(adviesCtx.risicos as string[]).map((r) => `- ${r}`).join("\n")}`
        : "",
      Array.isArray(adviesCtx.normen) && adviesCtx.normen.length > 0
        ? `Normen: ${(adviesCtx.normen as string[]).join(", ")}`
        : "",
      adviesCtx.vop_aandachtspunt === true ? "VOP-aandachtspunt: ja" : "",
      Array.isArray(adviesCtx.competenties) && adviesCtx.competenties.length > 0
        ? `Competenties uit advies:\n${(adviesCtx.competenties as string[]).map((c) => `- ${c}`).join("\n")}`
        : "",
      `\n=== BESTAANDE SPOTS IN HET GEBOUW ===`,
      spotsamenvatting,
      vriejeTekst ? `\n=== AANVULLENDE INSTRUCTIES ===\n${vriejeTekst}` : "",
    ].filter(Boolean).join("\n");

    const resultaat = await aiGateway.chat(
      "default",
      {
        messages: [
          { role: "system", content: PIM_WERKVOORBEREIDING_PROMPT.tekst },
          { role: "user", content: contextTekst },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 3000,
      },
      60_000,
      {
        module: "pim_werkvoorbereiding",
        functie: "analyseer",
        gebruikerId: req.session.userId ?? null,
        entiteitstype: "pim",
        entiteitId: pim.id,
        promptNaam: PIM_WERKVOORBEREIDING_PROMPT.naam,
        promptVersie: PIM_WERKVOORBEREIDING_PROMPT.versie,
        project_id: opdrachtId,
      },
    );

    if (!resultaat.ok) {
      res.status(502).json({ error: `AI-werkvoorbereiding mislukt: ${resultaat.fout}` });
      return;
    }

    let wvJson: Record<string, unknown>;
    try {
      wvJson = JSON.parse(resultaat.inhoud);
    } catch {
      res.status(502).json({ error: "AI leverde geen geldige JSON terug" });
      return;
    }

    const gebruikerId = req.session.userId!;

    await db.transaction(async (tx) => {
      await tx
        .update(pimModellenTable)
        .set({ werkvoorbereidingContext: wvJson, bijgewerktOp: new Date() })
        .where(eq(pimModellenTable.id, pim.id));

      // Fase-overgang: advies_gereed → werkvoorbereiding (alleen als nog niet verder)
      if (opdracht.aiFase === "advies_gereed") {
        await tx
          .update(opdrachtenTable)
          .set({ aiFase: "werkvoorbereiding", bijgewerktOp: new Date() })
          .where(eq(opdrachtenTable.id, opdrachtId));
      }

      const [gebruiker] = await tx
        .select({ naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, gebruikerId));

      await tx.insert(documentLogboekTable).values({
        gebruikerId,
        gebruikerNaam: gebruiker?.naam ?? null,
        actie: "pim_werkvoorbereiding_analyse",
        detail: `AI-werkvoorbereiding gegenereerd voor opdracht: ${opdracht.titel} (${spots.length} spot(s) meegenomen)`,
      });
    });

    res.json({
      opdracht_id: opdrachtId,
      ai_fase: opdracht.aiFase === "advies_gereed" ? "werkvoorbereiding" : (opdracht.aiFase ?? "werkvoorbereiding"),
      voorbereiding_volledigheid: String(wvJson.voorbereiding_volledigheid ?? "onvolledig"),
    });
  } catch (err) {
    logger.error({ err }, "pimWerkvoorbereidingAnalyseer fout");
    res.status(500).json({ error: "Serverfout bij AI-werkvoorbereiding" });
  }
}

router.post("/opdrachten/:id/pim/werkvoorbereiding/genereer", schrijven, werkvoorbereidingAnalyseer);
router.post("/opdrachten/:id/pim/werkvoorbereiding/analyseer", schrijven, werkvoorbereidingAnalyseer);

// ── PIM Uitvoering ────────────────────────────────────────────────────────────

function serializeStap(stap: PimUitvoeringStap): Record<string, unknown> {
  return {
    id: stap.id,
    pim_id: stap.pimId,
    volgorde: stap.volgorde,
    status: stap.status,
    werkpakket_sleutel: stap.werkpakketSleutel ?? null,
    instructie_json: stap.instructieJson ?? null,
    antwoorden_json: stap.antwoordenJson ?? null,
    foto_urls: stap.fotoUrls ?? [],
    ai_analyse_json: stap.aiAnalyseJson ?? null,
    afwijking_json: stap.afwijkingJson ?? null,
    voltooid_door_id: stap.voltooidDoorId ?? null,
    voltooid_op: stap.voltooidOp?.toISOString() ?? null,
    aangemaakt_op: stap.aangemaaktOp.toISOString(),
    bijgewerkt_op: stap.bijgewerktOp.toISOString(),
  };
}

function fallbackStapJson(volgorde: number, werkpakket: string | null): Record<string, unknown> {
  return {
    volgorde,
    werkpakket,
    doel: "Uitvoering voorbereiden",
    handeling: "Controleer de werkplek en de benodigde materialen.",
    benodigde_artikelen: [],
    benodigde_gereedschappen: [],
    veiligheidscontrole: "Voer een LMRA uit voor aanvang van de werkzaamheden.",
    productinstructie: null,
    foto_opdracht: "Maak een overzichtsfoto van de werkplek voor aanvang.",
    controlevraag: "Is de werkplek veilig en zijn alle benodigde materialen aanwezig?",
    is_laatste_stap: false,
  };
}

async function genereerStapViaAi(
  pimId: number,
  volgorde: number,
  opdrachtTitel: string,
  inkoopCtx: Record<string, unknown>,
  wvCtx: Record<string, unknown>,
  aiAnalyseVorigeStap: Record<string, unknown> | null,
  gebruikerId: number | null,
): Promise<Record<string, unknown> | null> {
  const vorigeStappen = await db
    .select({
      volgorde: pimUitvoeringStappenTable.volgorde,
      instructieJson: pimUitvoeringStappenTable.instructieJson,
      status: pimUitvoeringStappenTable.status,
    })
    .from(pimUitvoeringStappenTable)
    .where(eq(pimUitvoeringStappenTable.pimId, pimId))
    .orderBy(asc(pimUitvoeringStappenTable.volgorde));

  const stapContext = {
    opdracht_titel: opdrachtTitel,
    werkpakketten: Object.keys(inkoopCtx),
    werkvoorbereiding_samenvatting: wvCtx,
    vorige_stappen: vorigeStappen.map((s) => ({
      volgorde: s.volgorde,
      status: s.status,
      doel: (s.instructieJson as Record<string, unknown> | null)?.doel ?? null,
    })),
    stap_nummer: volgorde,
    ai_analyse_vorige_stap: aiAnalyseVorigeStap,
  };

  const resultaat = await aiGateway.chat(
    "default",
    {
      messages: [
        { role: "system", content: UITVOERING_STAP_PROMPT.tekst },
        {
          role: "user",
          content: `Genereer stap ${volgorde} voor deze opdracht:\n${JSON.stringify(stapContext, null, 2)}`,
        },
      ],
      max_tokens: 1024,
    },
    60_000,
    {
      module: "pim_uitvoering",
      functie: "genereer_stap",
      gebruikerId,
      promptNaam: UITVOERING_STAP_PROMPT.naam,
      promptVersie: UITVOERING_STAP_PROMPT.versie,
    },
  );

  if (!resultaat.ok || !resultaat.inhoud) return null;
  const cleaned = resultaat.inhoud.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned) as Record<string, unknown>;
}

/** POST /opdrachten/:id/pim/uitvoering/start */
router.post("/opdrachten/:id/pim/uitvoering/start", schrijven, async (req, res) => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) { res.status(400).json({ error: "Ongeldig opdracht-ID" }); return; }
  const gebruikerId = req.session.userId ?? null;

  try {
    const [pim] = await db
      .select()
      .from(pimModellenTable)
      .where(eq(pimModellenTable.opdrachtId, opdrachtId));
    if (!pim) { res.status(404).json({ error: "PIM niet gevonden voor deze opdracht" }); return; }

    const bestaandeStappen = await db
      .select({ id: pimUitvoeringStappenTable.id })
      .from(pimUitvoeringStappenTable)
      .where(eq(pimUitvoeringStappenTable.pimId, pim.id));
    if (bestaandeStappen.length > 0) {
      res.status(409).json({ error: "Uitvoering is al gestart" });
      return;
    }

    const [opdracht] = await db
      .select()
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, opdrachtId));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const inkoopCtx = (pim.inkoopContext as Record<string, unknown> | null) ?? {};
    const wvCtx = (pim.werkvoorbereidingContext as Record<string, unknown> | null) ?? {};
    const werkpakketSleutels = Object.keys(inkoopCtx);

    let stapJson: Record<string, unknown> = fallbackStapJson(1, werkpakketSleutels[0] ?? null);

    if (heeftGateway()) {
      try {
        const result = await genereerStapViaAi(
          pim.id, 1, opdracht.titel ?? "", inkoopCtx, wvCtx, null, gebruikerId,
        );
        if (result) stapJson = result;
      } catch (aiErr) {
        logger.warn({ aiErr }, "AI stapgeneratie mislukt, fallback stap aangemaakt");
      }
    }

    const [nieuweStap] = await db.transaction(async (tx) => {
      const [stap] = await tx
        .insert(pimUitvoeringStappenTable)
        .values({
          pimId: pim.id,
          volgorde: 1,
          status: "actief",
          werkpakketSleutel: (stapJson.werkpakket as string | null) ?? (werkpakketSleutels[0] ?? null),
          instructieJson: stapJson,
          bijgewerktOp: new Date(),
        })
        .returning();

      const huidigeAiFase = opdracht.aiFase ?? "inkoop";
      if (!["uitvoering", "oplevering", "gereed"].includes(huidigeAiFase)) {
        await tx
          .update(opdrachtenTable)
          .set({ aiFase: "uitvoering", bijgewerktOp: new Date() })
          .where(eq(opdrachtenTable.id, opdrachtId));
      }

      return [stap];
    });

    // Log uitvoering gestart
    await appendUitvoeringLog(pim.id, {
      actie: "uitvoering_gestart",
      stap_id: nieuweStap.id,
      gebruiker_id: gebruikerId,
    });

    res.status(201).json(serializeStap(nieuweStap));
  } catch (err) {
    logger.error({ err }, "startPimUitvoering fout");
    res.status(500).json({ error: "Serverfout bij starten uitvoering" });
  }
});

/** GET /opdrachten/:id/pim/uitvoering/huidige-stap */
router.get("/opdrachten/:id/pim/uitvoering/huidige-stap", lezen, async (req, res) => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) { res.status(400).json({ error: "Ongeldig opdracht-ID" }); return; }

  try {
    const [pim] = await db
      .select({ id: pimModellenTable.id })
      .from(pimModellenTable)
      .where(eq(pimModellenTable.opdrachtId, opdrachtId));
    if (!pim) { res.status(404).json({ error: "PIM niet gevonden" }); return; }

    const stappen = await db
      .select()
      .from(pimUitvoeringStappenTable)
      .where(
        and(
          eq(pimUitvoeringStappenTable.pimId, pim.id),
          inArray(pimUitvoeringStappenTable.status, ["actief", "afgeweken"]),
        ),
      )
      .orderBy(asc(pimUitvoeringStappenTable.volgorde))
      .limit(1);

    if (stappen.length === 0) {
      res.status(404).json({ error: "Geen actieve stap gevonden" });
      return;
    }

    res.json(serializeStap(stappen[0]));
  } catch (err) {
    logger.error({ err }, "getHuidigePimUitvoeringStap fout");
    res.status(500).json({ error: "Serverfout bij ophalen huidige stap" });
  }
});

// ── Uitvoeringslog helper ─────────────────────────────────────────────────────

async function appendUitvoeringLog(
  pimId: number,
  entry: Record<string, unknown>,
): Promise<void> {
  const [huidigePim] = await db
    .select({ uitvoeringsLog: pimModellenTable.uitvoeringsLog })
    .from(pimModellenTable)
    .where(eq(pimModellenTable.id, pimId));

  const huidigLog = Array.isArray(huidigePim?.uitvoeringsLog)
    ? (huidigePim.uitvoeringsLog as Record<string, unknown>[])
    : [];

  await db
    .update(pimModellenTable)
    .set({
      uitvoeringsLog: [...huidigLog, { ...entry, ts: new Date().toISOString() }],
      bijgewerktOp: new Date(),
    })
    .where(eq(pimModellenTable.id, pimId));
}

// ── PIM stap-eigenaar verificatie ─────────────────────────────────────────────

async function resolvePimVoorOpdracht(
  opdrachtId: number,
  stapId: number,
): Promise<{ pim: typeof pimModellenTable.$inferSelect; stap: PimUitvoeringStap } | null> {
  const [stap] = await db
    .select()
    .from(pimUitvoeringStappenTable)
    .where(eq(pimUitvoeringStappenTable.id, stapId));
  if (!stap) return null;

  const [pim] = await db
    .select()
    .from(pimModellenTable)
    .where(eq(pimModellenTable.id, stap.pimId));
  if (!pim) return null;

  // Eigendomscheck: stap moet toebehoren aan de PIM van de opgegeven opdracht
  if (pim.opdrachtId !== opdrachtId) return null;

  return { pim, stap };
}

/** POST /opdrachten/:id/pim/uitvoering/stap/:stapId/voltooien */
router.post("/opdrachten/:id/pim/uitvoering/stap/:stapId/voltooien", schrijven, async (req, res) => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  const stapId = parseInt(String(req.params.stapId), 10);
  if (isNaN(opdrachtId) || isNaN(stapId)) { res.status(400).json({ error: "Ongeldig ID" }); return; }
  const gebruikerId = req.session.userId ?? null;
  const { antwoord_controle, opmerkingen, foto_urls } = req.body as {
    antwoord_controle: boolean;
    opmerkingen?: string;
    foto_urls?: string[];
  };

  try {
    // Eigendomscheck: stap → PIM → opdracht
    const resolved = await resolvePimVoorOpdracht(opdrachtId, stapId);
    if (!resolved) { res.status(404).json({ error: "Stap niet gevonden of behoort niet tot deze opdracht" }); return; }
    const { pim, stap } = resolved;

    if (stap.status !== "actief") { res.status(409).json({ error: "Stap is niet actief" }); return; }

    const [opdracht] = await db
      .select({ titel: opdrachtenTable.titel })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, opdrachtId));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const stapInstructie = stap.instructieJson as Record<string, unknown> | null;

    // AI antwoord-analyse: check correctheid + detecteer eventuele afwijking
    let aiAnalyse: Record<string, unknown> | null = null;
    let aiAfwijkingGedetecteerd = false;
    if (heeftGateway()) {
      try {
        const analyseCtx = {
          stap_volgorde: stap.volgorde,
          doel: stapInstructie?.doel ?? null,
          handeling: stapInstructie?.handeling ?? null,
          veiligheidscontrole: stapInstructie?.veiligheidscontrole ?? null,
          controlevraag: stapInstructie?.controlevraag ?? null,
          antwoord_controle,
          opmerkingen: opmerkingen ?? null,
          foto_urls_aangeleverd: (foto_urls ?? []).length,
        };
        const resultaat = await aiGateway.chat(
          "default",
          {
            messages: [
              { role: "system", content: UITVOERING_FOTO_ANALYSE_PROMPT.tekst },
              {
                role: "user",
                content: `Beoordeel de voltooiing van uitvoeringsstap ${stap.volgorde}:\n${JSON.stringify(analyseCtx, null, 2)}\n\nGeef JSON terug met velden: controle_correct (boolean), bevindingen (string), afwijking_gedetecteerd (boolean), afwijking_omschrijving (string|null).`,
              },
            ],
            max_tokens: 512,
          },
          30_000,
          { module: "pim_uitvoering", functie: "stap_voltooien_analyse", gebruikerId, promptNaam: UITVOERING_FOTO_ANALYSE_PROMPT.naam, promptVersie: UITVOERING_FOTO_ANALYSE_PROMPT.versie },
        );
        if (resultaat.ok && resultaat.inhoud) {
          const cleaned = resultaat.inhoud.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
          const parsed = JSON.parse(cleaned) as Record<string, unknown>;
          aiAnalyse = {
            controle_correct: parsed.controle_correct ?? true,
            bevindingen: parsed.bevindingen ?? null,
            afwijking_gedetecteerd: parsed.afwijking_gedetecteerd ?? false,
            afwijking_omschrijving: parsed.afwijking_omschrijving ?? null,
          };
          aiAfwijkingGedetecteerd = parsed.afwijking_gedetecteerd === true;
        }
      } catch (aiErr) {
        logger.warn({ aiErr }, "AI voltooien-analyse mislukt, stap toch voltooid");
      }
    }

    // Als AI een afwijking detecteert: stap naar 'afgeweken' i.p.v. 'voltooid'
    if (aiAfwijkingGedetecteerd) {
      const afwijkingJson = {
        afwijking_omschrijving: (aiAnalyse?.afwijking_omschrijving as string | null) ?? "AI heeft een afwijking gedetecteerd",
        impact: "Onbekend — projectleider beslist over vervolgstappen",
        vervolgopties: ["Doorgaan met aanpassing", "Stoppen en overleggen met projectleider"],
        meerwerk_indicatie: false,
        stop_vereist: false,
        ai_gedetecteerd: true,
        gemeld_op: new Date().toISOString(),
        beslissing: null,
      };
      const [afgewekenStap] = await db
        .update(pimUitvoeringStappenTable)
        .set({
          status: "afgeweken",
          antwoordenJson: { antwoord_controle, opmerkingen: opmerkingen ?? null },
          fotoUrls: foto_urls ?? [],
          aiAnalyseJson: aiAnalyse,
          afwijkingJson,
          voltooidDoorId: gebruikerId,
          bijgewerktOp: new Date(),
        })
        .where(eq(pimUitvoeringStappenTable.id, stapId))
        .returning();

      await appendUitvoeringLog(pim.id, {
        actie: "stap_afgeweken_ai",
        stap_id: stapId,
        stap_volgorde: stap.volgorde,
        gebruiker_id: gebruikerId,
        afwijking_omschrijving: afwijkingJson.afwijking_omschrijving,
      });

      res.json({ voltooid_stap_id: stapId, uitvoering_gereed: false, volgende_stap: serializeStap(afgewekenStap) });
      return;
    }

    // Normaal pad: stap als voltooid markeren
    await db
      .update(pimUitvoeringStappenTable)
      .set({
        status: "voltooid",
        antwoordenJson: { antwoord_controle, opmerkingen: opmerkingen ?? null, voltooid_op: new Date().toISOString() },
        fotoUrls: foto_urls ?? [],
        aiAnalyseJson: aiAnalyse,
        voltooidDoorId: gebruikerId,
        voltooidOp: new Date(),
        bijgewerktOp: new Date(),
      })
      .where(eq(pimUitvoeringStappenTable.id, stapId));

    await appendUitvoeringLog(pim.id, {
      actie: "stap_voltooid",
      stap_id: stapId,
      stap_volgorde: stap.volgorde,
      gebruiker_id: gebruikerId,
      antwoord_controle,
    });

    const isLaatsteStap = stapInstructie?.is_laatste_stap === true;
    if (isLaatsteStap) {
      res.json({ voltooid_stap_id: stapId, uitvoering_gereed: true, volgende_stap: null });
      return;
    }

    // Volgende stap genereren
    let volgendeStapSerialized = null;
    if (heeftGateway()) {
      try {
        const inkoopCtx = (pim.inkoopContext as Record<string, unknown> | null) ?? {};
        const wvCtx = (pim.werkvoorbereidingContext as Record<string, unknown> | null) ?? {};
        const volgendeVolgorde = stap.volgorde + 1;

        const volgendeInstructie = await genereerStapViaAi(
          pim.id, volgendeVolgorde, opdracht.titel ?? "", inkoopCtx, wvCtx, aiAnalyse, gebruikerId,
        );

        if (volgendeInstructie?.is_laatste_stap === true && !volgendeInstructie?.doel) {
          res.json({ voltooid_stap_id: stapId, uitvoering_gereed: true, volgende_stap: null });
          return;
        }

        if (volgendeInstructie) {
          const [nieuwStap] = await db
            .insert(pimUitvoeringStappenTable)
            .values({
              pimId: pim.id,
              volgorde: volgendeVolgorde,
              status: "actief",
              werkpakketSleutel: (volgendeInstructie.werkpakket as string | null) ?? null,
              instructieJson: volgendeInstructie,
              bijgewerktOp: new Date(),
            })
            .returning();
          volgendeStapSerialized = serializeStap(nieuwStap);
        }
      } catch (nextErr) {
        logger.warn({ nextErr }, "Volgende stap generatie mislukt");
      }
    }

    res.json({ voltooid_stap_id: stapId, uitvoering_gereed: false, volgende_stap: volgendeStapSerialized });
  } catch (err) {
    logger.error({ err }, "voltooiPimUitvoeringStap fout");
    res.status(500).json({ error: "Serverfout bij voltooien stap" });
  }
});

/** POST /opdrachten/:id/pim/uitvoering/stap/:stapId/afwijking */
router.post("/opdrachten/:id/pim/uitvoering/stap/:stapId/afwijking", schrijven, async (req, res) => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  const stapId = parseInt(String(req.params.stapId), 10);
  if (isNaN(opdrachtId) || isNaN(stapId)) { res.status(400).json({ error: "Ongeldig ID" }); return; }
  const gebruikerId = req.session.userId ?? null;
  const { omschrijving, foto_urls } = req.body as { omschrijving: string; foto_urls?: string[] };

  try {
    // Eigendomscheck: stap → PIM → opdracht
    const resolved = await resolvePimVoorOpdracht(opdrachtId, stapId);
    if (!resolved) { res.status(404).json({ error: "Stap niet gevonden of behoort niet tot deze opdracht" }); return; }
    const { pim, stap } = resolved;

    let afwijkingAi: Record<string, unknown> = {
      afwijking_omschrijving: omschrijving,
      impact: "Onbekend — projectleider beslist over vervolgstappen",
      vervolgopties: ["Doorgaan met aanpassing", "Stoppen en overleggen met projectleider"],
      meerwerk_indicatie: false,
      stop_vereist: false,
    };

    if (heeftGateway()) {
      try {
        const stapInstructie = stap.instructieJson as Record<string, unknown> | null;
        const resultaat = await aiGateway.chat(
          "default",
          {
            messages: [
              { role: "system", content: UITVOERING_FOTO_ANALYSE_PROMPT.tekst },
              {
                role: "user",
                content: `Er is een afwijking gemeld bij uitvoeringsstap ${stap.volgorde}.\nStap doel: ${stapInstructie?.doel ?? "onbekend"}\nAfwijking: ${omschrijving}\nAnalyseer de impact en geef vervolgopties. Geef JSON terug.`,
              },
            ],
            max_tokens: 512,
          },
          30_000,
          { module: "pim_uitvoering", functie: "afwijking_analyse", gebruikerId, promptNaam: UITVOERING_FOTO_ANALYSE_PROMPT.naam, promptVersie: UITVOERING_FOTO_ANALYSE_PROMPT.versie },
        );
        if (resultaat.ok && resultaat.inhoud) {
          const cleaned = resultaat.inhoud.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
          const parsed = JSON.parse(cleaned) as Record<string, unknown>;
          afwijkingAi = {
            afwijking_omschrijving: omschrijving,
            impact: parsed.impact ?? "Onbekend",
            vervolgopties: parsed.vervolgopties ?? ["Doorgaan", "Stoppen"],
            meerwerk_indicatie: parsed.meerwerk_indicatie ?? false,
            stop_vereist: parsed.stop_vereist ?? false,
            bevindingen: parsed.bevindingen ?? null,
          };
        }
      } catch (aiErr) {
        logger.warn({ aiErr }, "AI afwijkingsanalyse mislukt, basis afwijking opgeslagen");
      }
    }

    const [bijgewerktStap] = await db
      .update(pimUitvoeringStappenTable)
      .set({
        status: "afgeweken",
        fotoUrls: foto_urls ?? [],
        afwijkingJson: { ...afwijkingAi, gemeld_op: new Date().toISOString(), beslissing: null },
        bijgewerktOp: new Date(),
      })
      .where(eq(pimUitvoeringStappenTable.id, stapId))
      .returning();

    await appendUitvoeringLog(pim.id, {
      actie: "stap_afwijking_gemeld",
      stap_id: stapId,
      stap_volgorde: stap.volgorde,
      gebruiker_id: gebruikerId,
      afwijking_omschrijving: omschrijving,
    });

    res.json(serializeStap(bijgewerktStap));
  } catch (err) {
    logger.error({ err }, "meldPimUitvoeringAfwijking fout");
    res.status(500).json({ error: "Serverfout bij melden afwijking" });
  }
});

/** POST /opdrachten/:id/pim/uitvoering/stap/:stapId/afwijking/beslis */
router.post("/opdrachten/:id/pim/uitvoering/stap/:stapId/afwijking/beslis", schrijven, async (req, res) => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  const stapId = parseInt(String(req.params.stapId), 10);
  if (isNaN(opdrachtId) || isNaN(stapId)) { res.status(400).json({ error: "Ongeldig ID" }); return; }
  const gebruikerId = req.session.userId ?? null;
  const { beslissing, toelichting } = req.body as { beslissing: "doorgaan" | "stoppen"; toelichting?: string };

  try {
    // Eigendomscheck: stap → PIM → opdracht
    const resolved = await resolvePimVoorOpdracht(opdrachtId, stapId);
    if (!resolved) { res.status(404).json({ error: "Stap niet gevonden of behoort niet tot deze opdracht" }); return; }
    const { pim, stap } = resolved;

    if (stap.status !== "afgeweken") {
      res.status(409).json({ error: "Stap heeft geen actieve afwijking" }); return;
    }

    const bestaandeAfwijking = (stap.afwijkingJson as Record<string, unknown> | null) ?? {};
    const bijgewerktAfwijking = {
      ...bestaandeAfwijking,
      beslissing,
      toelichting: toelichting ?? null,
      beslist_op: new Date().toISOString(),
    };

    await appendUitvoeringLog(pim.id, {
      actie: "afwijking_beslissing",
      stap_id: stapId,
      stap_volgorde: stap.volgorde,
      gebruiker_id: gebruikerId,
      beslissing,
      toelichting: toelichting ?? null,
    });

    if (beslissing === "stoppen") {
      await db
        .update(pimUitvoeringStappenTable)
        .set({ status: "overgeslagen", afwijkingJson: bijgewerktAfwijking, bijgewerktOp: new Date() })
        .where(eq(pimUitvoeringStappenTable.id, stapId));

      res.json({ voltooid_stap_id: stapId, uitvoering_gereed: true, volgende_stap: null });
      return;
    }

    // Doorgaan: stap terug op actief, afwijking blijft gelogd
    const [bijgewerktStap] = await db
      .update(pimUitvoeringStappenTable)
      .set({ status: "actief", afwijkingJson: bijgewerktAfwijking, bijgewerktOp: new Date() })
      .where(eq(pimUitvoeringStappenTable.id, stapId))
      .returning();

    res.json({
      voltooid_stap_id: stapId,
      uitvoering_gereed: false,
      volgende_stap: bijgewerktStap ? serializeStap(bijgewerktStap) : null,
    });
  } catch (err) {
    logger.error({ err }, "beslisPimUitvoeringAfwijking fout");
    res.status(500).json({ error: "Serverfout bij beslissing afwijking" });
  }
});

// ── PIM Oplevering ────────────────────────────────────────────────────────────

function bouwOpleverDossierHtml(
  data: Record<string, unknown>,
  opdrachttitel: string,
  datum: string,
): string {
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lijst = (items: unknown) =>
    Array.isArray(items) && items.length > 0
      ? `<ul>${(items as unknown[]).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
      : "<p><em>Geen gegevens</em></p>";
  const materiaalTabel = (items: unknown) => {
    if (!Array.isArray(items) || items.length === 0) return "<p><em>Geen materialen</em></p>";
    return `<table><thead><tr><th>Artikel</th><th>Hoeveelheid</th><th>Werkpakket</th></tr></thead><tbody>${
      (items as Record<string, unknown>[]).map((r) => `<tr><td>${esc(r.artikel)}</td><td>${esc(r.hoeveelheid)}</td><td>${esc(r.werkpakket)}</td></tr>`).join("")
    }</tbody></table>`;
  };
  const afwijkingTabel = (items: unknown) => {
    if (!Array.isArray(items) || items.length === 0) return "<p><em>Geen afwijkingen</em></p>";
    return `<table><thead><tr><th>Stap</th><th>Omschrijving</th><th>Beslissing</th><th>Impact</th></tr></thead><tbody>${
      (items as Record<string, unknown>[]).map((r) => `<tr><td>${esc(r.stap)}</td><td>${esc(r.omschrijving)}</td><td>${esc(r.beslissing)}</td><td>${esc(r.impact)}</td></tr>`).join("")
    }</tbody></table>`;
  };
  return `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8">
<title>Opleverdossier</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11pt;margin:40px;color:#1a1a1a}
  h1{font-size:17pt;margin-bottom:4px;color:#c0320b}
  h2{font-size:13pt;border-bottom:2px solid #c0320b;padding-bottom:4px;margin-top:24px;color:#c0320b}
  .meta{color:#666;font-size:9pt;margin-bottom:20px}
  .verklaring{background:#f0fdf4;border:1px solid #86efac;border-radius:4px;padding:10px 14px;margin-bottom:16px;font-style:italic}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  th{background:#f4f4f4;text-align:left;padding:4px 8px;font-size:9pt;border:1px solid #ddd}
  td{padding:4px 8px;font-size:10pt;border:1px solid #ddd;vertical-align:top}
  ul{margin:4px 0;padding-left:20px} li{margin:2px 0}
  .footer{color:#888;font-size:8pt;margin-top:30px;border-top:1px solid #ddd;padding-top:8px}
</style></head><body>
<h1>Opleverdossier — FPS Brandpreventie</h1>
<div class="meta">Opdracht: <strong>${esc(opdrachttitel)}</strong> &nbsp;|&nbsp; Datum: ${esc(datum)} &nbsp;|&nbsp; Gegenereerd door FPS Connect AI</div>
<h2>Projectsamenvatting</h2>
<p>${esc(data.opdracht_samenvatting)}</p>
<h2>Kwaliteitsverklaring</h2>
<div class="verklaring">${esc(data.kwaliteitsverklaring)}</div>
<h2>Uitgevoerde werkzaamheden</h2>${lijst(data.uitgevoerde_werkzaamheden)}
<h2>Gebruikte materialen</h2>${materiaalTabel(data.gebruikte_materialen)}
<h2>Afwijkingen &amp; beslissingen</h2>${afwijkingTabel(data.afwijkingen)}
<h2>Restpunten</h2>${lijst(data.restpunten)}
<h2>Aanbevelingen aan gebouweigenaar</h2>${lijst(data.aanbevelingen_eigenaar)}
<div class="footer">Dit document is automatisch gegenereerd door FPS Connect. Bewaar dit dossier als onderdeel van het brandveiligheidsdossier van het gebouw.</div>
</body></html>`;
}

function bouwOnderhoudNotitieHtml(
  data: Record<string, unknown>,
  opdrachttitel: string,
  datum: string,
): string {
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lijst = (items: unknown) =>
    Array.isArray(items) && items.length > 0
      ? `<ul>${(items as unknown[]).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
      : "<p><em>Geen gegevens</em></p>";
  const intervalTabel = (items: unknown) => {
    if (!Array.isArray(items) || items.length === 0) return "<p><em>Geen intervallen</em></p>";
    return `<table><thead><tr><th>Voorziening</th><th>Interval</th><th>Toelichting</th></tr></thead><tbody>${
      (items as Record<string, unknown>[]).map((r) => `<tr><td>${esc(r.voorziening_type)}</td><td>${esc(r.interval_maanden)} maanden</td><td>${esc(r.toelichting)}</td></tr>`).join("")
    }</tbody></table>`;
  };
  return `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8">
<title>Overdrachtsnotitie Onderhoud</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11pt;margin:40px;color:#1a1a1a}
  h1{font-size:17pt;margin-bottom:4px;color:#c0320b}
  h2{font-size:13pt;border-bottom:2px solid #c0320b;padding-bottom:4px;margin-top:24px;color:#c0320b}
  .meta{color:#666;font-size:9pt;margin-bottom:20px}
  .verbod{background:#fff7ed;border:1px solid #fdba74;border-radius:4px;padding:10px 14px;margin-bottom:16px}
  .contact{background:#f0f9ff;border:1px solid #7dd3fc;border-radius:4px;padding:8px 14px;margin-top:20px}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  th{background:#f4f4f4;text-align:left;padding:4px 8px;font-size:9pt;border:1px solid #ddd}
  td{padding:4px 8px;font-size:10pt;border:1px solid #ddd;vertical-align:top}
  ul{margin:4px 0;padding-left:20px} li{margin:2px 0}
</style></head><body>
<h1>${esc(data.titel)}</h1>
<div class="meta">Opdracht: <strong>${esc(opdrachttitel)}</strong> &nbsp;|&nbsp; Datum: ${esc(datum)}</div>
<h2>Samenvatting</h2>
<p>${esc(data.samenvatting)}</p>
<h2>Inspectie-intervallen</h2>${intervalTabel(data.inspectie_intervallen)}
<h2>Onderhoudspunten</h2>${lijst(data.aandachtspunten_onderhoud)}
<h2>Verboden acties zonder FPS-overleg</h2>
<div class="verbod">${lijst(data.verboden_acties)}</div>
<div class="contact"><strong>Contact FPS Brandpreventie:</strong> ${esc(data.contactgegevens_fps)}</div>
</body></html>`;
}

/** POST /opdrachten/:id/pim/oplevering/controleer */
router.post("/opdrachten/:id/pim/oplevering/controleer", schrijven, async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  const gebruikerId = req.session.userId ?? null;

  try {
    const [opdracht] = await db
      .select({ id: opdrachtenTable.id, titel: opdrachtenTable.titel, aiFase: opdrachtenTable.aiFase })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, opdrachtId));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const uitvoeringIdx = FASE_INDEX["uitvoering"]!;
    const huidigIdx = FASE_INDEX[opdracht.aiFase ?? ""] ?? -1;
    if (huidigIdx < uitvoeringIdx) {
      res.status(409).json({ error: `Volledigheidscheck vereist minimaal fase 'uitvoering' (huidig: '${opdracht.aiFase ?? "nieuw"}')` });
      return;
    }

    const [pim] = await db
      .select()
      .from(pimModellenTable)
      .where(eq(pimModellenTable.opdrachtId, opdrachtId));
    if (!pim) { res.status(404).json({ error: "PIM niet gevonden voor deze opdracht" }); return; }

    // Haal alle uitvoeringsstappen op
    const stappen = await db
      .select()
      .from(pimUitvoeringStappenTable)
      .where(eq(pimUitvoeringStappenTable.pimId, pim.id))
      .orderBy(asc(pimUitvoeringStappenTable.volgorde));

    // ── Lokale checks ─────────────────────────────────────────────────────────
    const controlePunten: { label: string; ok: boolean; detail: string | null }[] = [];
    const ontbrekenPunten: string[] = [];

    // Check 1: zijn er überhaupt stappen?
    const heeftStappen = stappen.length > 0;
    controlePunten.push({
      label: "Uitvoeringsstappen aangemaakt",
      ok: heeftStappen,
      detail: heeftStappen ? `${stappen.length} stap(pen) gevonden` : "Geen stappen gevonden — start de uitvoering eerst",
    });
    if (!heeftStappen) ontbrekenPunten.push("Geen uitvoeringsstappen aanwezig");

    // Check 2: alle stappen voltooid of overgeslagen
    const openStappen = stappen.filter((s) => s.status === "open" || s.status === "actief");
    controlePunten.push({
      label: "Alle stappen afgesloten",
      ok: openStappen.length === 0,
      detail: openStappen.length > 0
        ? `${openStappen.length} stap(pen) nog open of actief (volgnrs: ${openStappen.map((s) => s.volgorde).join(", ")})`
        : null,
    });
    if (openStappen.length > 0) ontbrekenPunten.push(`${openStappen.length} stap(pen) nog niet afgesloten`);

    // Check 3: afwijkingen met beslissing
    const afwijkingenZonderBeslissing = stappen.filter((s) => {
      if (s.status !== "afgeweken") return false;
      const afwijking = s.afwijkingJson as Record<string, unknown> | null;
      return !afwijking?.beslissing;
    });
    controlePunten.push({
      label: "Alle afwijkingen besloten",
      ok: afwijkingenZonderBeslissing.length === 0,
      detail: afwijkingenZonderBeslissing.length > 0
        ? `${afwijkingenZonderBeslissing.length} afwijking(en) zonder beslissing`
        : null,
    });
    if (afwijkingenZonderBeslissing.length > 0) ontbrekenPunten.push(`${afwijkingenZonderBeslissing.length} afwijking(en) vereisen nog een beslissing`);

    // Check 4: foto-aanwezigheid (elke voltooide stap moet minimaal 1 foto hebben)
    const stappenZonderFoto = stappen.filter((s) =>
      s.status === "voltooid" && (!Array.isArray(s.fotoUrls) || (s.fotoUrls as string[]).length === 0),
    );
    controlePunten.push({
      label: "Fotodocumentatie per stap",
      ok: stappenZonderFoto.length === 0,
      detail: stappenZonderFoto.length > 0
        ? `${stappenZonderFoto.length} voltooide stap(pen) zonder foto (volgnrs: ${stappenZonderFoto.map((s) => s.volgorde).join(", ")})`
        : null,
    });
    if (stappenZonderFoto.length > 0) ontbrekenPunten.push(`${stappenZonderFoto.length} stap(pen) missen verplichte foto`);

    // ── AI volledigheidscheck ─────────────────────────────────────────────────
    const stappenSamenvatting = stappen.map((s) => ({
      volgorde: s.volgorde,
      status: s.status,
      werkpakket: s.werkpakketSleutel ?? null,
      foto_count: Array.isArray(s.fotoUrls) ? (s.fotoUrls as string[]).length : 0,
      afwijking: s.afwijkingJson ? {
        omschrijving: (s.afwijkingJson as Record<string, unknown>).afwijking_omschrijving ?? null,
        beslissing: (s.afwijkingJson as Record<string, unknown>).beslissing ?? null,
      } : null,
    }));

    const wvCtx = (pim.werkvoorbereidingContext as Record<string, unknown> | null) ?? {};
    const inkoopCtx = (pim.inkoopContext as Record<string, unknown> | null) ?? {};

    let aiCheck: Record<string, unknown> = {
      volledig: ontbrekenPunten.length === 0,
      controle_punten: controlePunten,
      ontbrekende_punten: ontbrekenPunten,
      aandachtspunten_oplevering: [],
      onderhoudsadvies: [],
      samenvatting: ontbrekenPunten.length === 0
        ? `Alle ${stappen.length} uitvoeringsstappen zijn afgesloten en gedocumenteerd.`
        : `Er zijn nog ${ontbrekenPunten.length} ontbrekende punt(en) voor oplevering.`,
      betrouwbaarheid: "midden",
    };

    if (heeftGateway()) {
      try {
        const resultaat = await aiGateway.chat(
          "default",
          {
            messages: [
              { role: "system", content: PIM_OPLEVERING_CONTROLEER_PROMPT.tekst },
              {
                role: "user",
                content: JSON.stringify({
                  opdracht_titel: opdracht.titel,
                  stappen: stappenSamenvatting,
                  werkvoorbereiding_samenvatting: wvCtx,
                  werkpakketten: Object.keys(inkoopCtx),
                  lokale_controles: { open_stappen: openStappen.length, afwijkingen_zonder_beslissing: afwijkingenZonderBeslissing.length, stappen_zonder_foto: stappenZonderFoto.length },
                }),
              },
            ],
            max_tokens: 1024,
          },
          60_000,
          {
            module: "pim_oplevering",
            functie: "controleer",
            gebruikerId,
            entiteitstype: "pim",
            entiteitId: pim.id,
            promptNaam: PIM_OPLEVERING_CONTROLEER_PROMPT.naam,
            promptVersie: PIM_OPLEVERING_CONTROLEER_PROMPT.versie,
            project_id: opdrachtId,
          },
        );
        if (resultaat.ok && resultaat.inhoud) {
          const cleaned = resultaat.inhoud.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
          const parsed = JSON.parse(cleaned) as Record<string, unknown>;
          aiCheck = {
            ...aiCheck,
            aandachtspunten_oplevering: parsed.aandachtspunten_oplevering ?? [],
            onderhoudsadvies: parsed.onderhoudsadvies ?? [],
            samenvatting: parsed.samenvatting ?? aiCheck.samenvatting,
            betrouwbaarheid: parsed.betrouwbaarheid ?? "midden",
          };
          if (typeof parsed.volledig === "boolean" && !parsed.volledig) {
            if (Array.isArray(parsed.ontbrekende_punten)) {
              for (const p of parsed.ontbrekende_punten as string[]) {
                if (!ontbrekenPunten.includes(p)) ontbrekenPunten.push(p);
              }
            }
            aiCheck.volledig = false;
            aiCheck.ontbrekende_punten = ontbrekenPunten;
          }
          if (Array.isArray(parsed.controle_punten)) {
            const aiPunten = parsed.controle_punten as { label: string; ok: boolean; detail: string | null }[];
            for (const ap of aiPunten) {
              if (!controlePunten.find((p) => p.label === ap.label)) {
                controlePunten.push(ap);
              }
            }
          }
          aiCheck.controle_punten = controlePunten;
        }
      } catch (aiErr) {
        logger.warn({ aiErr }, "AI volledigheidscheck mislukt, doorgaan met lokale check");
      }
    }

    const isVolledig = Boolean(aiCheck.volledig);

    // Sla resultaat op in pim.opleveringContext
    const opleveringCtx = {
      ...(pim.opleveringContext as Record<string, unknown> | null ?? {}),
      controlerapport: aiCheck,
      gecontroleerd_op: new Date().toISOString(),
      gecontroleerd_door: gebruikerId,
    };

    await db.transaction(async (tx) => {
      await tx
        .update(pimModellenTable)
        .set({ opleveringContext: opleveringCtx, bijgewerktOp: new Date() })
        .where(eq(pimModellenTable.id, pim.id));

      // Zet ai_fase naar 'oplevering' als volledig en nog niet voorbij uitvoering
      if (isVolledig && (FASE_INDEX[opdracht.aiFase ?? ""] ?? -1) <= FASE_INDEX["uitvoering"]!) {
        await tx
          .update(opdrachtenTable)
          .set({ aiFase: "oplevering", bijgewerktOp: new Date() })
          .where(eq(opdrachtenTable.id, opdrachtId));
      }
    });

    res.json({
      opdracht_id: opdrachtId,
      volledig: isVolledig,
      controle_punten: controlePunten,
      ontbrekende_punten: ontbrekenPunten,
      aandachtspunten_oplevering: (aiCheck.aandachtspunten_oplevering as string[]) ?? [],
      ai_samenvatting: String(aiCheck.samenvatting ?? ""),
      ai_fase: isVolledig ? "oplevering" : (opdracht.aiFase ?? "uitvoering"),
    });
  } catch (err) {
    logger.error({ err }, "controleerPimOplevering fout");
    res.status(500).json({ error: "Serverfout bij volledigheidscheck" });
  }
});

/** POST /opdrachten/:id/pim/oplevering/genereer */
router.post("/opdrachten/:id/pim/oplevering/genereer", schrijven, async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  const gebruikerId = req.session.userId!;

  try {
    const [opdracht] = await db
      .select({ id: opdrachtenTable.id, titel: opdrachtenTable.titel, aiFase: opdrachtenTable.aiFase })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, opdrachtId));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const opleveringIdx = FASE_INDEX["oplevering"]!;
    if ((FASE_INDEX[opdracht.aiFase ?? ""] ?? -1) < opleveringIdx) {
      res.status(409).json({ error: "Voer eerst de volledigheidscheck uit en zorg dat alle punten gereed zijn (fase 'oplevering' vereist)" });
      return;
    }

    const [pim] = await db
      .select()
      .from(pimModellenTable)
      .where(eq(pimModellenTable.opdrachtId, opdrachtId));
    if (!pim) { res.status(404).json({ error: "PIM niet gevonden voor deze opdracht" }); return; }

    const stappen = await db
      .select()
      .from(pimUitvoeringStappenTable)
      .where(eq(pimUitvoeringStappenTable.pimId, pim.id))
      .orderBy(asc(pimUitvoeringStappenTable.volgorde));

    const opleveringCtx = (pim.opleveringContext as Record<string, unknown> | null) ?? {};
    const wvCtx = (pim.werkvoorbereidingContext as Record<string, unknown> | null) ?? {};
    const inkoopCtx = (pim.inkoopContext as Record<string, unknown> | null) ?? {};
    const vandaag = new Date().toISOString().slice(0, 10);

    const stappenDetail = stappen.map((s) => ({
      volgorde: s.volgorde,
      status: s.status,
      werkpakket: s.werkpakketSleutel ?? null,
      doel: (s.instructieJson as Record<string, unknown> | null)?.doel ?? null,
      antwoorden: s.antwoordenJson ?? null,
      foto_count: Array.isArray(s.fotoUrls) ? (s.fotoUrls as string[]).length : 0,
      afwijking: s.afwijkingJson ?? null,
    }));

    // ── AI Opleverdossier generatie ───────────────────────────────────────────
    let opleverData: Record<string, unknown> = {
      opdracht_samenvatting: `Opleverdossier voor opdracht: ${opdracht.titel}. Werkzaamheden uitgevoerd conform het Project Intelligence Model.`,
      uitgevoerde_werkzaamheden: stappen.filter((s) => s.status !== "open").map((s) => (s.instructieJson as Record<string, unknown> | null)?.doel ?? `Stap ${s.volgorde}`),
      gebruikte_materialen: Array.isArray(wvCtx.materiaallijst) ? (wvCtx.materiaallijst as Record<string, unknown>[]).map((m) => ({ artikel: m.artikel, hoeveelheid: `${m.hoeveelheid} ${m.eenheid}`, werkpakket: m.opmerkingen ?? "—" })) : [],
      afwijkingen: stappen.filter((s) => s.status === "afgeweken" || s.afwijkingJson).map((s) => {
        const afw = s.afwijkingJson as Record<string, unknown> | null;
        return { stap: s.volgorde, omschrijving: afw?.afwijking_omschrijving ?? "Onbekend", beslissing: afw?.beslissing ?? "Niet besloten", impact: afw?.impact ?? "Onbekend" };
      }),
      restpunten: (opleveringCtx.controlerapport as Record<string, unknown> | null)?.ontbrekende_punten ?? [],
      kwaliteitsverklaring: `De werkzaamheden voor opdracht "${opdracht.titel}" zijn uitgevoerd conform de van toepassing zijnde normen en voorschriften op het gebied van passieve brandpreventie.`,
      aanbevelingen_eigenaar: [],
      datum: vandaag,
    };

    if (heeftGateway()) {
      try {
        const resultaat = await aiGateway.chat(
          "default",
          {
            messages: [
              { role: "system", content: PIM_OPLEVERING_GENEREER_PROMPT.tekst },
              {
                role: "user",
                content: JSON.stringify({
                  opdracht_titel: opdracht.titel,
                  stappen: stappenDetail,
                  werkvoorbereiding: wvCtx,
                  werkpakketten: Object.keys(inkoopCtx),
                  controlerapport: opleveringCtx.controlerapport ?? null,
                }),
              },
            ],
            max_tokens: 2048,
          },
          90_000,
          {
            module: "pim_oplevering",
            functie: "genereer_dossier",
            gebruikerId,
            entiteitstype: "pim",
            entiteitId: pim.id,
            promptNaam: PIM_OPLEVERING_GENEREER_PROMPT.naam,
            promptVersie: PIM_OPLEVERING_GENEREER_PROMPT.versie,
            project_id: opdrachtId,
          },
        );
        if (resultaat.ok && resultaat.inhoud) {
          const cleaned = resultaat.inhoud.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
          const parsed = JSON.parse(cleaned) as Record<string, unknown>;
          opleverData = { ...opleverData, ...parsed, datum: vandaag };
        }
      } catch (aiErr) {
        logger.warn({ aiErr }, "AI opleverdossier generatie mislukt, standaard data gebruikt");
      }
    }

    // ── AI Onderhoud notitie ──────────────────────────────────────────────────
    let onderhoudData: Record<string, unknown> = {
      titel: `Overdrachtsnotitie onderhoud — ${opdracht.titel}`,
      samenvatting: `Passieve brandpreventievoorzieningen aangebracht voor ${opdracht.titel}.`,
      inspectie_intervallen: [
        { voorziening_type: "Brandstoppers / doorvoeringen", interval_maanden: 12, toelichting: "Jaarlijkse visuele inspectie conform NEN-EN 16034" },
        { voorziening_type: "Brandkleppen / brandwerende beglazing", interval_maanden: 12, toelichting: "Jaarlijkse functietest" },
      ],
      aandachtspunten_onderhoud: (opleveringCtx.controlerapport as Record<string, unknown> | null)?.aandachtspunten_oplevering ?? [],
      verboden_acties: ["Zelf wijzigingen aanbrengen aan brandwerende afdichtingen", "Doorvoeringen openen zonder overleg met FPS", "Brandwerende afwerkingen overschilderen of verwijderen"],
      contactgegevens_fps: "FPS Brandpreventie — info@fps.nl — 0800-0000000",
      datum: vandaag,
    };

    if (heeftGateway()) {
      try {
        const resultaat = await aiGateway.chat(
          "default",
          {
            messages: [
              { role: "system", content: PIM_ONDERHOUD_NOTITIE_PROMPT.tekst },
              {
                role: "user",
                content: JSON.stringify({
                  opdracht_titel: opdracht.titel,
                  gebruikte_materialen: opleverData.gebruikte_materialen,
                  afwijkingen: opleverData.afwijkingen,
                  onderhoudsadvies: (opleveringCtx.controlerapport as Record<string, unknown> | null)?.onderhoudsadvies ?? [],
                }),
              },
            ],
            max_tokens: 1024,
          },
          60_000,
          {
            module: "pim_oplevering",
            functie: "genereer_onderhoud_notitie",
            gebruikerId,
            entiteitstype: "pim",
            entiteitId: pim.id,
            promptNaam: PIM_ONDERHOUD_NOTITIE_PROMPT.naam,
            promptVersie: PIM_ONDERHOUD_NOTITIE_PROMPT.versie,
            project_id: opdrachtId,
          },
        );
        if (resultaat.ok && resultaat.inhoud) {
          const cleaned = resultaat.inhoud.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
          const parsed = JSON.parse(cleaned) as Record<string, unknown>;
          onderhoudData = { ...onderhoudData, ...parsed, datum: vandaag };
        }
      } catch (aiErr) {
        logger.warn({ aiErr }, "AI onderhoud notitie generatie mislukt, standaard data gebruikt");
      }
    }

    // ── PDF genereren ─────────────────────────────────────────────────────────
    async function genereerPdf(htmlContent: string, sleutel: string): Promise<string | null> {
      if (!CHROMIUM_PAD) return null;
      try {
        const puppeteer = await import("puppeteer-core");
        const browser = await puppeteer.launch({
          executablePath: CHROMIUM_PAD,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
        });
        try {
          const page = await browser.newPage();
          await page.setContent(htmlContent, { waitUntil: "load", timeout: 30000 });
          const pdfBuffer = await page.pdf({ format: "A4", printBackground: true, margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" } });
          await browser.close();
          const svc = new ObjectStorageService();
          return await svc.uploadBestand(sleutel, Buffer.from(pdfBuffer), "application/pdf");
        } catch (pdfErr) {
          await browser.close().catch(() => undefined);
          logger.warn({ err: pdfErr }, "PDF generatie mislukt voor " + sleutel);
          return null;
        }
      } catch {
        return null;
      }
    }

    const [opleverPdfPad, onderhoudPdfPad] = await Promise.all([
      genereerPdf(
        bouwOpleverDossierHtml(opleverData, opdracht.titel, vandaag),
        `pim/opleverdossiers/${opdrachtId}_oplevering_${Date.now()}.pdf`,
      ),
      genereerPdf(
        bouwOnderhoudNotitieHtml(onderhoudData, opdracht.titel, vandaag),
        `pim/onderhoudnotities/${opdrachtId}_onderhoud_${Date.now()}.pdf`,
      ),
    ]);

    // ── DMS-documenten aanmaken en koppelen ───────────────────────────────────
    const [gebruiker] = await db
      .select({ naam: gebruikersTable.naam })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, gebruikerId));

    const gemaakteDocumenten: { document_id: number; type: string; naam: string }[] = [];

    await db.transaction(async (tx) => {
      // 1. Opleverdossier
      const opleverNaam = `Opleverdossier — ${opdracht.titel}`;
      const [opleverDoc] = await tx
        .insert(documentenTable)
        .values({
          naam: opleverNaam,
          documenttype: "opleverdossier",
          datum: vandaag,
          ...(opleverPdfPad ? { pdfUrl: opleverPdfPad } : {}),
          aiGeanalyseerd: true,
          aiMetadata: opleverData,
          bijgewerktOp: new Date(),
        })
        .returning({ id: documentenTable.id });

      await tx.insert(documentKoppelingenTable).values({
        documentId: opleverDoc.id,
        doelType: "opdracht",
        doelId: opdrachtId,
        aangemaaktDoorId: gebruikerId,
      });
      await tx.insert(documentLogboekTable).values({
        documentId: opleverDoc.id,
        documentNaam: opleverNaam,
        gebruikerId,
        gebruikerNaam: gebruiker?.naam ?? null,
        actie: "geupload",
        detail: `PIM Opleverdossier aangemaakt voor opdracht: ${opdracht.titel}${opleverPdfPad ? " (incl. PDF)" : " (zonder PDF)"}`,
      });
      gemaakteDocumenten.push({ document_id: opleverDoc.id, type: "opleverdossier", naam: opleverNaam });

      // 2. Overdrachtsnotitie onderhoud
      const onderhoudNaam = `Overdrachtsnotitie onderhoud — ${opdracht.titel}`;
      const [onderhoudDoc] = await tx
        .insert(documentenTable)
        .values({
          naam: onderhoudNaam,
          documenttype: "overdrachtsnotitie",
          datum: vandaag,
          ...(onderhoudPdfPad ? { pdfUrl: onderhoudPdfPad } : {}),
          aiGeanalyseerd: true,
          aiMetadata: onderhoudData,
          bijgewerktOp: new Date(),
        })
        .returning({ id: documentenTable.id });

      await tx.insert(documentKoppelingenTable).values({
        documentId: onderhoudDoc.id,
        doelType: "opdracht",
        doelId: opdrachtId,
        aangemaaktDoorId: gebruikerId,
      });
      await tx.insert(documentLogboekTable).values({
        documentId: onderhoudDoc.id,
        documentNaam: onderhoudNaam,
        gebruikerId,
        gebruikerNaam: gebruiker?.naam ?? null,
        actie: "geupload",
        detail: `PIM Overdrachtsnotitie onderhoud aangemaakt voor opdracht: ${opdracht.titel}`,
      });
      gemaakteDocumenten.push({ document_id: onderhoudDoc.id, type: "overdrachtsnotitie", naam: onderhoudNaam });

      // Opslaan in opleveringContext
      const bijgewerktCtx = {
        ...(pim.opleveringContext as Record<string, unknown> | null ?? {}),
        gegenereerd_op: new Date().toISOString(),
        gegenereerd_door: gebruikerId,
        document_ids: gemaakteDocumenten.map((d) => d.document_id),
        opleverdossier_data: opleverData,
        onderhoud_data: onderhoudData,
      };
      await tx
        .update(pimModellenTable)
        .set({ opleveringContext: bijgewerktCtx, bijgewerktOp: new Date() })
        .where(eq(pimModellenTable.id, pim.id));
    });

    res.json({
      opdracht_id: opdrachtId,
      documenten: gemaakteDocumenten,
    });
  } catch (err) {
    logger.error({ err }, "genereerPimOplevering fout");
    res.status(500).json({ error: "Serverfout bij genereren opleverdossier" });
  }
});

/** POST /opdrachten/:id/pim/oplevering/definitief */
router.post("/opdrachten/:id/pim/oplevering/definitief", schrijven, async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  const gebruikerId = req.session.userId ?? null;

  try {
    const [opdracht] = await db
      .select({ id: opdrachtenTable.id, titel: opdrachtenTable.titel, aiFase: opdrachtenTable.aiFase })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, opdrachtId));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const opleveringIdx = FASE_INDEX["oplevering"]!;
    const huidigIdx = FASE_INDEX[opdracht.aiFase ?? ""] ?? -1;
    if (huidigIdx < opleveringIdx) {
      res.status(409).json({ error: `Definitief maken vereist fase 'oplevering' (huidig: '${opdracht.aiFase ?? "nieuw"}')` });
      return;
    }
    if (opdracht.aiFase === "gereed" || opdracht.aiFase === "afgerond") {
      res.status(409).json({ error: "Opdracht is al definitief afgerond" });
      return;
    }

    const [pim] = await db
      .select({ id: pimModellenTable.id, opleveringContext: pimModellenTable.opleveringContext })
      .from(pimModellenTable)
      .where(eq(pimModellenTable.opdrachtId, opdrachtId));
    if (!pim) { res.status(404).json({ error: "PIM niet gevonden voor deze opdracht" }); return; }

    const nu = new Date();
    const bijgewerktCtx = {
      ...(pim.opleveringContext as Record<string, unknown> | null ?? {}),
      definitief_op: nu.toISOString(),
      definitief_door: gebruikerId,
    };

    await db.transaction(async (tx) => {
      await tx
        .update(opdrachtenTable)
        .set({ aiFase: "gereed", bijgewerktOp: nu })
        .where(eq(opdrachtenTable.id, opdrachtId));

      await tx
        .update(pimModellenTable)
        .set({ opleveringContext: bijgewerktCtx, bijgewerktOp: nu })
        .where(eq(pimModellenTable.id, pim.id));

      const [gebruiker] = await tx
        .select({ naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, gebruikerId!));

      await tx.insert(documentLogboekTable).values({
        gebruikerId,
        gebruikerNaam: gebruiker?.naam ?? null,
        actie: "pim_definitief",
        detail: `Opdracht definitief opgeleverd: ${opdracht.titel}`,
      });
    });

    res.json({ opdracht_id: opdrachtId, ai_fase: "gereed" });
  } catch (err) {
    logger.error({ err }, "definieerPimOplevering fout");
    res.status(500).json({ error: "Serverfout bij definitief maken" });
  }
});

export default router;

// PIM — Project Intelligence Model
// Routes: POST /aanvragen, GET /opdrachten/:id/pim,
//         PATCH /opdrachten/:id/pim/fase,
//         POST /opdrachten/:id/pim/analyseer,
//         POST /opdrachten/:id/pim/advies/bevestig,
//         POST /opdrachten/:id/pim/advies/rapport
import { Router } from "express";
import type { OpenAI } from "openai";
import {
  db,
  pimModellenTable,
  opdrachtenTable,
  documentLogboekTable,
  documentenTable,
  documentKoppelingenTable,
  gebruikersTable,
  voorzieningenTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireBevoegdheid, requireBevoegdheidOfKlant } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { PIM_AANVRAAG_ANALYSE_PROMPT, PIM_WERKVOORBEREIDING_PROMPT } from "../lib/aiPrompts";
import { ObjectStorageService } from "../lib/objectStorage";

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

// ── POST /aanvragen ──────────────────────────────────────────────────────────
router.post("/aanvragen", lezen, async (req, res): Promise<void> => {
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

    // 5. Bouw de berichten op
    type ContentPart =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } };
    const userContent: ContentPart[] = [{ type: "text", text: contextTekst }];
    for (const url of imageDataUrls) {
      userContent.push({ type: "image_url", image_url: { url } });
    }

    // 6. AI-aanroep (vision-slot = gpt-5)
    // TODO #303: kbService.assembleKbContext(opdrachtId) hier toevoegen als KB-module beschikbaar is.
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
// Maakt een DMS-document aan met de adviescontext en koppelt het aan de opdracht.
// PDF-rendering via DDS (puppeteer) volgt zodra de PIM-printpagina gebouwd is.
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
    // Klanten zijn al volledig geblokkeerd via de "schrijven" middleware.
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

    const { document: doc } = await db.transaction(async (tx) => {
      // Maak DMS-document aan
      const [document] = await tx
        .insert(documentenTable)
        .values({
          naam: rapportNaam,
          documenttype: "adviesrapport",
          datum: vandaag,
          aiGeanalyseerd: true,
          aiMetadata: pim.adviesContext as Record<string, unknown>,
          bijgewerktOp: new Date(),
        })
        .returning();

      // Koppel aan opdracht via polymorf koppelmodel
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
        detail: `PIM Adviesrapport aangemaakt voor opdracht: ${opdracht.titel}`,
      });

      return { document };
    });

    res.status(201).json({ opdracht_id: opdrachtId, document_id: doc.id });
  } catch (err) {
    logger.error({ err }, "pimAdviesRapport fout");
    res.status(500).json({ error: "Serverfout bij aanmaken rapport" });
  }
});

// ── POST /opdrachten/:id/pim/werkvoorbereiding/analyseer ──────────────────────
// Laadt advies_context + spots voor het gebouw, roept AI aan, slaat op in
// werkvoorbereiding_context en zet ai_fase → "werkvoorbereiding".
router.post("/opdrachten/:id/pim/werkvoorbereiding/analyseer", schrijven, async (req, res): Promise<void> => {
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
});

export default router;

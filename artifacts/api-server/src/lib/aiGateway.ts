import crypto from "node:crypto";
import type OpenAI from "openai";
import { heeftOpenAi, maakOpenAiClient } from "./openai";
import { logger } from "./logger";
import { db } from "@workspace/db";
import { aiAanroepenTable } from "@workspace/db";

// ── Model registry ────────────────────────────────────────────────────────────

export type ModelSlot = "default" | "fast" | "reasoning" | "vision" | "embedding";

const MODEL_REGISTRY: Record<ModelSlot, string> = {
  default:   "gpt-4o",
  fast:      "gpt-4o-mini",
  reasoning: "gpt-5",
  vision:    "gpt-5",
  embedding: "text-embedding-3-small",
};

// ── Prijstabel (EUR per 1 miljoen tokens) ─────────────────────────────────────
// Bijgewerkt op basis van OpenAI-tarieven (indicatief; niet voor facturatie).

interface ModelPrijs {
  input: number;
  output: number;
}

const PRIJS_PER_MODEL: Record<string, ModelPrijs> = {
  "gpt-4o":                   { input: 2.50,  output: 10.00 },
  "gpt-4o-mini":              { input: 0.15,  output: 0.60  },
  "gpt-5":                    { input: 2.50,  output: 10.00 },
  "gpt-4-turbo":              { input: 10.00, output: 30.00 },
  "gpt-4":                    { input: 30.00, output: 60.00 },
  "text-embedding-3-small":   { input: 0.02,  output: 0.00  },
  "text-embedding-3-large":   { input: 0.13,  output: 0.00  },
};

function berekenKosten(
  modelNaam: string,
  promptTokens: number | null | undefined,
  completionTokens: number | null | undefined,
): string | null {
  const prijs = PRIJS_PER_MODEL[modelNaam];
  if (!prijs) return null;
  const inp = promptTokens ?? 0;
  const out = completionTokens ?? 0;
  const totaal = (inp * prijs.input + out * prijs.output) / 1_000_000;
  return totaal.toFixed(6);
}

function promptHashVan(tekst: string): string {
  return crypto.createHash("sha256").update(tekst).digest("hex").slice(0, 16);
}

// ── Context-bron type ─────────────────────────────────────────────────────────
//
// `AiContextBron` is een uitbreidbare container voor een onafhankelijke
// contextbron. De toekomstige Orchestrator stelt een lijst van bronnen samen
// vóór een gateway-aanroep; bestaande modules hoeven dit type niet te vullen.
//
// Beschikbare type-waarden (open string-unie zodat toekomstige bronsoorten
// naadloos kunnen worden toegevoegd zonder breaking change):
//   "workflow"       — workflowstatus en transitieparameters
//   "document"       — PDF- of documenttekst uit de bibliotheek of DMS
//   "rag"            — opgehaalde fragmenten uit een kennisbase (RAG)
//   "kennisbron"     — domeinkennis-object (bijv. ETA, testnorm, bibliotheekitem)
//   "auditlog"       — relevante audittrailregels als historische context
//   "gebruikersinput"— geverifieerde gebruikersinvoer als expliciete contextbron

export interface AiContextBron {
  /** Soort contextbron (open string-unie voor uitbreidbaarheid). */
  type: "workflow" | "document" | "rag" | "kennisbron" | "auditlog" | "gebruikersinput" | string;
  /** Optionele referentie naar de bronentiteit (bijv. document-id, dossier-id). */
  bronId?: string;
  /** Vrije payload; structuur per type afgesproken tussen Orchestrator en gateway. */
  payload: Record<string, unknown>;
}

// ── Log-context ───────────────────────────────────────────────────────────────
//
// `LogContext` bevat twee categorieën velden:
//
// 1. Basale log-velden (module, functie, gebruikerId, etc.) — al aanwezig.
//
// 2. Flat businesscontext-velden (optioneel) — nieuw. Door modules in te vullen
//    zodra de id al bekend is bij de gateway-aanroep. Worden opgeslagen in
//    context_json zodat AI-aanroepen later koppelbaar zijn aan bedrijfsentiteiten.
//    Alle velden zijn optioneel; bestaande aanroepen zonder deze velden blijven
//    ongewijzigd werken (geen breaking change).
//
// 3. contextBronnen (optioneel) — voor de toekomstige Orchestrator. Bestaande
//    modules laten dit veld leeg; de Orchestrator vult het vóór een aanroep.

export interface LogContext {
  // ── Basale log-velden ──────────────────────────────────────────────────────
  module: string;
  functie?: string;
  gebruikerId?: number | null;
  entiteitstype?: string | null;
  entiteitId?: number | null;
  promptNaam?: string | null;
  promptVersie?: string | null;

  // ── Flat businesscontext-velden ────────────────────────────────────────────
  /** Type workflow (bijv. "offerte", "opleverrapport", "inkoopplanning"). */
  workflow_type?: string | null;
  /** Werkstroomstatus ten tijde van de aanroep (bijv. "concept", "gereed"). */
  workflow_status?: string | null;
  /** Opdracht-/project-id gekoppeld aan deze aanroep. */
  project_id?: number | null;
  /** Gebouw-id gekoppeld aan deze aanroep. */
  gebouw_id?: number | null;
  /** Klant-id (CRM) gekoppeld aan deze aanroep. */
  klant_id?: number | null;
  /** Offerte-id gekoppeld aan deze aanroep. */
  offerte_id?: number | null;
  /** Calculatie-id gekoppeld aan deze aanroep. */
  calculatie_id?: number | null;
  /** Document-id (bibliotheek/DMS) gekoppeld aan deze aanroep. */
  document_id?: number | null;
  /** Voorziening-/spot-id gekoppeld aan deze aanroep. */
  voorziening_id?: number | null;
  /** Medewerker-id (HRM) gekoppeld aan deze aanroep. */
  medewerker_id?: number | null;
  /** Planning-item-id gekoppeld aan deze aanroep. */
  planning_item_id?: number | null;

  // ── Uitbreidbare contextbronnen (voor de Orchestrator) ─────────────────────
  /**
   * Gestructureerde contextbronnen samengesteld door de Orchestrator.
   * Bestaande modules laten dit veld leeg; de Orchestrator vult het vóór
   * een aanroep zodat de gateway meerdere onafhankelijke contextbronnen
   * naar het model kan doorgeven zonder dat modules dit weten of beheren.
   */
  contextBronnen?: AiContextBron[];
}

// ── Helpers: context_json samenstellen ────────────────────────────────────────

function bouwContextJson(ctx: LogContext | undefined): Record<string, unknown> | null {
  if (!ctx) return null;
  const velden: Record<string, unknown> = {};
  if (ctx.workflow_type != null)    velden.workflow_type    = ctx.workflow_type;
  if (ctx.workflow_status != null)  velden.workflow_status  = ctx.workflow_status;
  if (ctx.project_id != null)       velden.project_id       = ctx.project_id;
  if (ctx.gebouw_id != null)        velden.gebouw_id        = ctx.gebouw_id;
  if (ctx.klant_id != null)         velden.klant_id         = ctx.klant_id;
  if (ctx.offerte_id != null)       velden.offerte_id       = ctx.offerte_id;
  if (ctx.calculatie_id != null)    velden.calculatie_id    = ctx.calculatie_id;
  if (ctx.document_id != null)      velden.document_id      = ctx.document_id;
  if (ctx.voorziening_id != null)   velden.voorziening_id   = ctx.voorziening_id;
  if (ctx.medewerker_id != null)    velden.medewerker_id    = ctx.medewerker_id;
  if (ctx.planning_item_id != null) velden.planning_item_id = ctx.planning_item_id;
  if (ctx.contextBronnen && ctx.contextBronnen.length > 0) {
    velden.contextBronnen = ctx.contextBronnen;
  }
  return Object.keys(velden).length > 0 ? velden : null;
}

// ── Resultaattype ─────────────────────────────────────────────────────────────

export type ChatResultaat =
  | { ok: true;  inhoud: string }
  | { ok: false; fout: string };

// ── Netwerk/5xx-detectie voor retry ──────────────────────────────────────────

function isRetrybaar(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("econnreset") || msg.includes("enotfound") || msg.includes("etimedout") || msg.includes("fetch failed")) return true;
  }
  // OpenAI SDK voegt een `status`-veld toe bij HTTP-fouten
  const status = (err as { status?: number }).status;
  if (typeof status === "number" && status >= 500) return true;
  return false;
}

function isTimeout(err: unknown): boolean {
  if (err instanceof Error && err.name === "TimeoutError") return true;
  if (err instanceof Error && err.message.toLowerCase().includes("timeout")) return true;
  return false;
}

// ── Params-typen: volledige create-params minus model ────────────────────────

export type ChatParams = Omit<
  OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  "model"
>;

/** Params voor de Responses API (web search / file search tools). */
export type ResponsesParams = {
  tools?: Array<{ type: string; [k: string]: unknown }>;
  input: string;
  text?: { format?: { type?: string; [k: string]: unknown } };
  [k: string]: unknown;
};

// ── Prompt-hash helper ────────────────────────────────────────────────────────

function extractSystemPromptHash(params: ChatParams): string | null {
  const systemMsg = params.messages?.find((m) => m.role === "system");
  if (!systemMsg) return null;
  const tekst = typeof systemMsg.content === "string" ? systemMsg.content : null;
  return tekst ? promptHashVan(tekst) : null;
}

// ── Asynchroon logging (fire-and-forget) ──────────────────────────────────────

function logAanroep(record: {
  module: string;
  functie: string | null;
  gebruikerId: number | null;
  entiteitstype: string | null;
  entiteitId: number | null;
  modelSlot: string;
  modelNaam: string;
  promptNaam: string | null;
  promptVersie: string | null;
  promptHash: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  geschatteKostenEur: string | null;
  duurMs: number | null;
  status: string;
  foutmelding: string | null;
  contextJson: Record<string, unknown> | null;
}): void {
  db.insert(aiAanroepenTable).values(record).catch((err) => {
    logger.warn({ err }, "AI-aanroeplogging mislukt (fire-and-forget)");
  });
}

// ── Singleton gateway ─────────────────────────────────────────────────────────

const STANDAARD_TIMEOUT_MS = 60_000;
const MAX_POGINGEN = 3; // 1 initieel + 2 retries

class AiGatewayService {
  private _client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this._client) {
      this._client = maakOpenAiClient();
    }
    return this._client;
  }

  /** Geeft aan of de AI-gateway geconfigureerd is. */
  heeftGateway(): boolean {
    return heeftOpenAi();
  }

  /**
   * Stuurt een chat-completion-aanroep via de gateway.
   * - Gebruikt de modelslot om het model op te zoeken in de registry.
   * - Voegt een AbortSignal-timeout toe.
   * - Herprobeert maximaal 2x bij netwerk- of 5xx-fout; bij 4xx nooit.
   * - Geeft altijd een ChatResultaat terug — throw bereikt nooit de HTTP-handler.
   * - Schrijft asynchroon een record naar ai_aanroepen (fire-and-forget).
   */
  async chat(
    slot: ModelSlot,
    params: ChatParams,
    timeoutMs: number = STANDAARD_TIMEOUT_MS,
    logCtx?: LogContext,
  ): Promise<ChatResultaat> {
    const model = MODEL_REGISTRY[slot];
    const promptHash = extractSystemPromptHash(params);
    const contextJson = bouwContextJson(logCtx);
    let pogingen = 0;
    const start = Date.now();

    while (pogingen < MAX_POGINGEN) {
      pogingen++;
      try {
        const completion = await this.getClient().chat.completions.create(
          { ...params, model },
          { signal: AbortSignal.timeout(timeoutMs) },
        );
        const duurMs = Date.now() - start;
        const inhoud = completion.choices[0]?.message?.content ?? null;
        const usage = completion.usage;

        const promptTokens = usage?.prompt_tokens ?? null;
        const completionTokens = usage?.completion_tokens ?? null;
        const totalTokens = usage?.total_tokens ?? null;

        logAanroep({
          module: logCtx?.module ?? "onbekend",
          functie: logCtx?.functie ?? null,
          gebruikerId: logCtx?.gebruikerId ?? null,
          entiteitstype: logCtx?.entiteitstype ?? null,
          entiteitId: logCtx?.entiteitId ?? null,
          modelSlot: slot,
          modelNaam: model,
          promptNaam: logCtx?.promptNaam ?? null,
          promptVersie: logCtx?.promptVersie ?? null,
          promptHash,
          promptTokens,
          completionTokens,
          totalTokens,
          geschatteKostenEur: berekenKosten(model, promptTokens, completionTokens),
          duurMs,
          status: inhoud ? "ok" : "fout",
          foutmelding: inhoud ? null : "Geen inhoud in antwoord",
          contextJson,
        });

        if (!inhoud) {
          return { ok: false, fout: "De AI gaf geen inhoud terug." };
        }
        return { ok: true, inhoud };
      } catch (err) {
        const isLaatste = pogingen >= MAX_POGINGEN;
        if (!isRetrybaar(err) || isLaatste) {
          const duurMs = Date.now() - start;
          const bericht = err instanceof Error ? err.message : String(err);
          const statusCode = isTimeout(err) ? "timeout" : "fout";
          logger.error({ err, slot, model, pogingen }, "AI-gateway chat-aanroep mislukt");
          logAanroep({
            module: logCtx?.module ?? "onbekend",
            functie: logCtx?.functie ?? null,
            gebruikerId: logCtx?.gebruikerId ?? null,
            entiteitstype: logCtx?.entiteitstype ?? null,
            entiteitId: logCtx?.entiteitId ?? null,
            modelSlot: slot,
            modelNaam: model,
            promptNaam: logCtx?.promptNaam ?? null,
            promptVersie: logCtx?.promptVersie ?? null,
            promptHash,
            promptTokens: null,
            completionTokens: null,
            totalTokens: null,
            geschatteKostenEur: null,
            duurMs,
            status: statusCode,
            foutmelding: bericht.slice(0, 500),
            contextJson,
          });
          return { ok: false, fout: `AI-aanroep mislukt: ${bericht}` };
        }
        logger.warn({ err, slot, model, poging: pogingen }, "AI-gateway retry na tijdelijke fout");
      }
    }

    return { ok: false, fout: "AI-aanroep mislukt na maximaal aantal pogingen." };
  }

  /**
   * Stuurt een Responses-API-aanroep via de gateway (bv. met web_search_preview).
   * Zelfde timeout/retry/error-contract als chat().
   * Retourneert ChatResultaat met output_text als inhoud.
   */
  async responses(
    slot: ModelSlot,
    params: ResponsesParams,
    timeoutMs: number = STANDAARD_TIMEOUT_MS,
    logCtx?: LogContext,
  ): Promise<ChatResultaat> {
    const model = MODEL_REGISTRY[slot];
    const contextJson = bouwContextJson(logCtx);
    let pogingen = 0;
    const start = Date.now();

    while (pogingen < MAX_POGINGEN) {
      pogingen++;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resp = await (this.getClient() as any).responses.create(
          { ...params, model },
          { signal: AbortSignal.timeout(timeoutMs) },
        );
        const duurMs = Date.now() - start;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inhoud: string | null = (resp as any).output_text ?? null;

        logAanroep({
          module: logCtx?.module ?? "onbekend",
          functie: logCtx?.functie ?? null,
          gebruikerId: logCtx?.gebruikerId ?? null,
          entiteitstype: logCtx?.entiteitstype ?? null,
          entiteitId: logCtx?.entiteitId ?? null,
          modelSlot: slot,
          modelNaam: model,
          promptNaam: logCtx?.promptNaam ?? null,
          promptVersie: logCtx?.promptVersie ?? null,
          promptHash: null,
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          geschatteKostenEur: null,
          duurMs,
          status: inhoud ? "ok" : "fout",
          foutmelding: inhoud ? null : "Geen output_text in antwoord",
          contextJson,
        });

        if (!inhoud) {
          return { ok: false, fout: "De AI gaf geen output_text terug." };
        }
        return { ok: true, inhoud };
      } catch (err) {
        const isLaatste = pogingen >= MAX_POGINGEN;
        if (!isRetrybaar(err) || isLaatste) {
          const duurMs = Date.now() - start;
          const bericht = err instanceof Error ? err.message : String(err);
          const statusCode = isTimeout(err) ? "timeout" : "fout";
          logger.error({ err, slot, model, pogingen }, "AI-gateway responses-aanroep mislukt");
          logAanroep({
            module: logCtx?.module ?? "onbekend",
            functie: logCtx?.functie ?? null,
            gebruikerId: logCtx?.gebruikerId ?? null,
            entiteitstype: logCtx?.entiteitstype ?? null,
            entiteitId: logCtx?.entiteitId ?? null,
            modelSlot: slot,
            modelNaam: model,
            promptNaam: logCtx?.promptNaam ?? null,
            promptVersie: logCtx?.promptVersie ?? null,
            promptHash: null,
            promptTokens: null,
            completionTokens: null,
            totalTokens: null,
            geschatteKostenEur: null,
            duurMs,
            status: statusCode,
            foutmelding: bericht.slice(0, 500),
            contextJson,
          });
          return { ok: false, fout: `AI responses-aanroep mislukt: ${bericht}` };
        }
        logger.warn({ err, slot, model, poging: pogingen }, "AI-gateway retry na tijdelijke fout");
      }
    }

    return { ok: false, fout: "AI responses-aanroep mislukt na maximaal aantal pogingen." };
  }

  /**
   * Geeft de onderliggende OpenAI-client terug voor gevallen die buiten de
   * standaard chat/responses-flow vallen.
   * @deprecated Gebruik aiGateway.chat() of aiGateway.responses() waar mogelijk.
   */
  rawClient(): OpenAI {
    return this.getClient();
  }
}

export const aiGateway = new AiGatewayService();

/** Vervanger voor `heeftOpenAi()` buiten de gateway. */
export function heeftGateway(): boolean {
  return aiGateway.heeftGateway();
}

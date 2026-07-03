import type OpenAI from "openai";
import { heeftOpenAi, maakOpenAiClient } from "./openai";
import { logger } from "./logger";

// ── Model registry ────────────────────────────────────────────────────────────

export type ModelSlot = "default" | "fast" | "reasoning" | "vision" | "embedding";

const MODEL_REGISTRY: Record<ModelSlot, string> = {
  default:   "gpt-4o",
  fast:      "gpt-4o-mini",
  reasoning: "gpt-5",
  vision:    "gpt-5",
  embedding: "text-embedding-3-small",
};

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
   */
  async chat(
    slot: ModelSlot,
    params: ChatParams,
    timeoutMs: number = STANDAARD_TIMEOUT_MS,
  ): Promise<ChatResultaat> {
    const model = MODEL_REGISTRY[slot];
    let pogingen = 0;

    while (pogingen < MAX_POGINGEN) {
      pogingen++;
      try {
        const completion = await this.getClient().chat.completions.create(
          { ...params, model },
          { signal: AbortSignal.timeout(timeoutMs) },
        );
        const inhoud = completion.choices[0]?.message?.content ?? null;
        if (!inhoud) {
          return { ok: false, fout: "De AI gaf geen inhoud terug." };
        }
        return { ok: true, inhoud };
      } catch (err) {
        const isLaatste = pogingen >= MAX_POGINGEN;
        if (!isRetrybaar(err) || isLaatste) {
          logger.error({ err, slot, model, pogingen }, "AI-gateway chat-aanroep mislukt");
          const bericht = err instanceof Error ? err.message : String(err);
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
  ): Promise<ChatResultaat> {
    const model = MODEL_REGISTRY[slot];
    let pogingen = 0;

    while (pogingen < MAX_POGINGEN) {
      pogingen++;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resp = await (this.getClient() as any).responses.create(
          { ...params, model },
          { signal: AbortSignal.timeout(timeoutMs) },
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inhoud: string | null = (resp as any).output_text ?? null;
        if (!inhoud) {
          return { ok: false, fout: "De AI gaf geen output_text terug." };
        }
        return { ok: true, inhoud };
      } catch (err) {
        const isLaatste = pogingen >= MAX_POGINGEN;
        if (!isRetrybaar(err) || isLaatste) {
          logger.error({ err, slot, model, pogingen }, "AI-gateway responses-aanroep mislukt");
          const bericht = err instanceof Error ? err.message : String(err);
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

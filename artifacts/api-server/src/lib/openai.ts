import OpenAI from "openai";
import { logger } from "./logger";

const PROXY_BASE_URL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const PROXY_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const EIGEN_KEY = process.env.OPENAI_API_KEY;

const PROXY_VOLLEDIG = Boolean(PROXY_BASE_URL && PROXY_KEY);
const PROXY_GEDEELTELIJK = Boolean(PROXY_BASE_URL) !== Boolean(PROXY_KEY);

if (PROXY_GEDEELTELIJK) {
  logger.warn(
    "Slechts één van AI_INTEGRATIONS_OPENAI_BASE_URL / AI_INTEGRATIONS_OPENAI_API_KEY is gezet; " +
      "AI valt terug op OPENAI_API_KEY. Zet beide proxy-vars of geen.",
  );
}

logger.info(
  { aiBron: PROXY_VOLLEDIG ? "replit-proxy" : EIGEN_KEY ? "openai-key" : "geen" },
  "OpenAI-configuratie geladen",
);

export function heeftOpenAi(): boolean {
  if (process.env.CONNECT_AI_ENABLED === "false") return false;
  return PROXY_VOLLEDIG || Boolean(EIGEN_KEY);
}

export function maakOpenAiClient(): OpenAI {
  if (PROXY_VOLLEDIG) {
    return new OpenAI({ baseURL: PROXY_BASE_URL, apiKey: PROXY_KEY });
  }
  return new OpenAI({ apiKey: EIGEN_KEY });
}

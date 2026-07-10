/**
 * AI Taakregister (Fase 0)
 *
 * Declaratief register van AI-taken. Elke taak beschrijft:
 *   - welke prompt zij gebruikt (uit het bestaande promptregister);
 *   - welk taakprofiel het model bepaalt (via de modelrouter);
 *   - of de uitvoer menselijke goedkeuring vereist (human-in-the-loop);
 *   - een optioneel Zod-outputschema (in Fase 0 aangeboden, nog niet afgedwongen).
 *
 * Zie docs/architectuur/ai-platform/README.md §4.2.
 *
 * Fase 0 wijzigt GEEN gedrag: de hier geregistreerde taken zijn niet aan
 * bestaande routes gekoppeld. Ze maken de nieuwe Decision Engine aantoonbaar
 * werkend (één passthrough-taak en één taak met menselijke goedkeuring) zonder
 * bestaande AI-functies te raken.
 */

import { z } from "zod";
import type { ModuleId } from "@workspace/permissies";
import type { AiPrompt } from "./aiPrompts";
import { RAPPORT_SAMENVATTING_PROMPT, SALARIS_MUTATIES_CONTROLE_PROMPT } from "./aiPrompts";
import type { Taakprofiel } from "./aiModelRouter";

/** Declaratief profiel van één AI-taak. */
export interface AiTaak {
  /** Stabiele, unieke sleutel (URL-veilig). */
  taaknaam: string;
  /** Menselijk leesbare procesnaam (voor logging en de beheerlijst). */
  procesNaam: string;
  /** Module waarvoor de aanvrager bevoegd moet zijn. */
  module: ModuleId;
  /** Minimaal vereist niveau (1 = lezen, 2 = schrijven). */
  minNiveau: 1 | 2;
  /** Bronprompt uit het promptregister. */
  prompt: AiPrompt;
  /** Taakprofiel dat de modelrouter naar een slot vertaalt. */
  modelprofiel: Taakprofiel;
  /**
   * Neem de gedeelde guardrails op in de prompt. Standaard true; zet op false
   * voor taken die bewust vrije tekst teruggeven.
   */
  guardrails?: boolean;
  /** Optioneel Zod-outputschema (Fase 0: aangeboden, nog niet afgedwongen). */
  outputSchema?: z.ZodTypeAny;
  /** Menselijk leesbare beschrijving van het verwachte antwoordformaat. */
  outputSchemaBeschrijving?: string;
  /**
   * Vereist de uitvoer expliciete menselijke goedkeuring vóór gebruik?
   * false = passthrough (AI-voorstel gaat direct terug, mens beslist elders).
   * true  = human-in-the-loop (voorstel wacht op akkoord/afwijzing).
   */
  requiresHumanApproval: boolean;
}

/**
 * Het taakregister. Sleutel = taaknaam. Additief uitbreidbaar; bestaande
 * services blijven hun eigen prompts direct gebruiken tot ze in een latere fase
 * via de Decision Engine lopen.
 */
export const AI_TAKEN: Record<string, AiTaak> = {
  // Passthrough-demonstratie: een vrije-tekst samenvatting. Geen goedkeuring
  // nodig; het AI-voorstel gaat direct terug (identiek aan een directe
  // gateway-aanroep).
  "rapport-samenvatting": {
    taaknaam: "rapport-samenvatting",
    procesNaam: "Rapportsamenvatting opstellen",
    module: "rapportages",
    minNiveau: 1,
    prompt: RAPPORT_SAMENVATTING_PROMPT,
    modelprofiel: { kostengevoelig: true },
    guardrails: false,
    requiresHumanApproval: false,
  },

  // Human-in-the-loop-demonstratie: een controlevoorstel dat een mens moet
  // beoordelen voordat het gebruikt wordt.
  "salaris-mutaties-controle": {
    taaknaam: "salaris-mutaties-controle",
    procesNaam: "Salarismutaties controleren",
    module: "salaris_mutaties",
    minNiveau: 2,
    prompt: SALARIS_MUTATIES_CONTROLE_PROMPT,
    modelprofiel: { vereistRedenering: true },
    guardrails: true,
    outputSchema: z.object({
      bevindingen: z.array(
        z.object({
          ernst: z.enum(["waarschuwing", "aandacht", "ok"]),
          mutatie_naam: z.string(),
          bericht: z.string(),
        }),
      ),
      compleet: z.boolean(),
      aanbeveling: z.string(),
    }),
    outputSchemaBeschrijving:
      "{ bevindingen: [{ ernst: 'waarschuwing'|'aandacht'|'ok', mutatie_naam: string, bericht: string }], compleet: boolean, aanbeveling: string }",
    requiresHumanApproval: true,
  },
};

/** Zoek een taak op via naam. Retourneert null als de taak niet bestaat. */
export function vindTaak(taaknaam: string): AiTaak | null {
  return AI_TAKEN[taaknaam] ?? null;
}

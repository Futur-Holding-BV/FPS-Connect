/**
 * AI Prompt Builder (Fase 0)
 *
 * Doel: één component dat prompts samenstelt uit het bestaande promptregister
 * (`aiPrompts.ts`) + gedeelde guardrails + (optioneel) een contextbundel +
 * (optioneel) een outputschema-instructie — zonder per-feature-duplicatie.
 *
 * Zie docs/architectuur/ai-platform/README.md §4.3.
 *
 * Belangrijk (Fase 0): de Prompt Builder voegt GEEN tweede promptbron toe.
 * Promptteksten blijven in `aiPrompts.ts` (naam + semver). De Builder biedt de
 * guardrails en het outputschema aan als instructie; de Decision Engine
 * valideert de uitvoer (aangeboden, nog niet afgedwongen).
 */

import type { AiPrompt } from "./aiPrompts";

/**
 * Gedeelde guardrails: precies de regels die nu overal handmatig in prompts
 * worden herhaald. De Builder biedt ze centraal aan zodat ze consistent blijven
 * en op één plek onderhouden worden.
 */
export const GEDEELDE_GUARDRAILS = [
  "Antwoord uitsluitend als geldige JSON, zonder markdown of tekst eromheen.",
  "Verzin niets. Laat velden die je niet met redelijke zekerheid kunt bepalen op null.",
  "Geef een veld 'betrouwbaarheid' met een van: 'laag', 'midden', 'hoog'.",
  "Je bepaalt nooit zelfstandig de brandwerendheid, WBDBO-waarde of juridische classificatie; dat doet altijd een mens.",
  "Je doet uitsluitend een voorstel. Een mens beoordeelt en bevestigt; jij neemt nooit een definitief besluit.",
].join("\n");

/** Resultaat van de Prompt Builder. */
export interface PromptBundel {
  /** De volledige samengestelde systemprompt. */
  systemPrompt: string;
  /** Naam van de gebruikte prompt (voor logging/herleidbaarheid). */
  promptNaam: string;
  /** Versie van de gebruikte prompt (voor logging/herleidbaarheid). */
  promptVersie: string;
}

export interface BouwPromptOpties {
  /** De bronprompt uit het promptregister (naam + versie + tekst). */
  prompt: AiPrompt;
  /** Optionele, reeds samengestelde contextbundel (Fase 1 vult dit; nu leeg). */
  contextBundel?: string | null;
  /** Optionele, menselijk leesbare beschrijving van het verwachte outputschema. */
  outputSchemaBeschrijving?: string | null;
  /**
   * Neem de gedeelde guardrails op. Standaard true. Zet op false voor prompts
   * die bewust vrije tekst (geen JSON) teruggeven, zoals samenvattingen.
   */
  guardrails?: boolean;
}

/**
 * Stel een prompt samen volgens de vaste volgorde:
 *   systemprompt (register) + gedeelde guardrails + contextbundel + outputschema.
 *
 * Alleen de delen die aanwezig zijn worden opgenomen; de bronprompt blijft
 * altijd de basis.
 */
export function bouwPrompt(opties: BouwPromptOpties): PromptBundel {
  const delen: string[] = [opties.prompt.tekst.trim()];

  if (opties.guardrails !== false) {
    delen.push(`Gedeelde richtlijnen:\n${GEDEELDE_GUARDRAILS}`);
  }

  if (opties.contextBundel && opties.contextBundel.trim().length > 0) {
    delen.push(`Beschikbare context:\n${opties.contextBundel.trim()}`);
  }

  if (opties.outputSchemaBeschrijving && opties.outputSchemaBeschrijving.trim().length > 0) {
    delen.push(`Verwacht antwoordformaat:\n${opties.outputSchemaBeschrijving.trim()}`);
  }

  return {
    systemPrompt: delen.join("\n\n"),
    promptNaam: opties.prompt.naam,
    promptVersie: opties.prompt.versie,
  };
}

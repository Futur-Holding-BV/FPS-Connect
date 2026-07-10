// ── AI Context Service — tokenbudget (puur) ──────────────────────────────────
//
// Pure functies zonder DB/IO: schatting van tokengebruik en het inkorten van
// een lijst contextbronnen tot binnen een budget. De wortelbron wordt nooit
// weggelaten (die is de kern van de vraag); wel mag zijn inkortbare tekst
// gekrompen worden.

import type { AiContextBron } from "../aiGateway";
import type { ContextEntiteitType, ModelSlot, WeggelatenBron } from "./types";

// Grove tokenschatting: ~4 tekens per token. Bewust conservatief en snel; de
// echte tokenizer zit in de gateway/model, hier gaat het om budgetbewaking.
export function schatTokens(tekst: string): number {
  if (!tekst) return 0;
  return Math.ceil(tekst.length / 4);
}

export function schatBronTokens(bron: AiContextBron): number {
  return schatTokens(JSON.stringify(bron.payload ?? {}));
}

// Tokenbudget per model-slot voor het CONTEXT-deel van de prompt.
export const SLOT_BUDGET: Record<ModelSlot, number> = {
  fast: 4000,
  reasoning: 16000,
  vision: 6000,
  embedding: 3000,
  default: 8000,
};

export function budgetVoorSlot(slot: ModelSlot | undefined, override?: number): number {
  if (typeof override === "number" && override > 0) return override;
  return SLOT_BUDGET[slot ?? "default"] ?? SLOT_BUDGET.default;
}

// Een te trimmen bron: de contextbron plus metadata om te kunnen prioriteren en
// gericht in te korten.
export interface TrimbareBron {
  type: ContextEntiteitType;
  id: number;
  bron: AiContextBron;
  // Lager = belangrijker. De wortel heeft prioriteit 0.
  prioriteit: number;
  relatie?: string;
  // Sleutel in payload waarvan de tekst ingekort mag worden.
  inkortbaarVeld?: string;
  isWortel: boolean;
}

export interface TrimResultaat {
  behouden: AiContextBron[];
  weggelaten: WeggelatenBron[];
  tokenSchatting: number;
}

const MINIMALE_TEKSTLENGTE = 240; // tekens; korter inkorten heeft geen zin

// Copy-on-write: muteert NOOIT de aangeleverde bron (die kan een gedeelde,
// gecachte knoop zijn). Lukt inkorten, dan retourneert deze functie een NIEUWE
// bron met een gekloonde payload; anders null (geen wijziging nodig/mogelijk).
function kortInkortbareTekstIn(bron: AiContextBron, veld: string | undefined, ruimteTokens: number): AiContextBron | null {
  if (!veld) return null;
  const payload = bron.payload as Record<string, unknown>;
  const huidig = payload[veld];
  if (typeof huidig !== "string" || huidig.length <= MINIMALE_TEKSTLENGTE) return null;
  // Ruimte in tekens (≈ 4 per token), met marge voor de rest van de payload.
  const doelTekens = Math.max(MINIMALE_TEKSTLENGTE, ruimteTokens * 4);
  if (huidig.length <= doelTekens) return null;
  const ingekort = huidig.slice(0, doelTekens).trimEnd() + " […ingekort]";
  return { ...bron, payload: { ...payload, [veld]: ingekort } };
}

// Trimt de bronnen tot binnen `budget` tokens. Sorteert op prioriteit (oplopend)
// zodat de belangrijkste context eerst plaats krijgt. Bij overschrijding wordt
// eerst geprobeerd de inkortbare tekst van de bron te krimpen; lukt dat niet,
// dan valt de bron weg (behalve de wortel).
export function trimBronnen(bronnen: TrimbareBron[], budget: number): TrimResultaat {
  const gesorteerd = [...bronnen].sort((a, b) => {
    if (a.isWortel !== b.isWortel) return a.isWortel ? -1 : 1;
    return a.prioriteit - b.prioriteit;
  });

  const behouden: AiContextBron[] = [];
  const weggelaten: WeggelatenBron[] = [];
  let gebruikt = 0;

  for (const item of gesorteerd) {
    let teGebruikenBron = item.bron;
    let kosten = schatBronTokens(teGebruikenBron);
    const resterend = budget - gebruikt;

    if (kosten > resterend) {
      // Probeer de inkortbare tekst te krimpen zodat de bron alsnog past.
      // Copy-on-write: nooit de (mogelijk gecachte) originele bron muteren.
      const gekrompen = kortInkortbareTekstIn(teGebruikenBron, item.inkortbaarVeld, resterend);
      if (gekrompen) {
        teGebruikenBron = gekrompen;
        kosten = schatBronTokens(teGebruikenBron);
      }
    }

    if (kosten <= resterend || item.isWortel) {
      behouden.push(teGebruikenBron);
      gebruikt += kosten;
    } else {
      weggelaten.push({ type: item.type, id: item.id, reden: "tokenbudget", relatie: item.relatie });
    }
  }

  return { behouden, weggelaten, tokenSchatting: gebruikt };
}

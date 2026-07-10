/**
 * AI Modelrouteringslaag (Fase 0)
 *
 * Doel: kies per AI-taak automatisch het juiste modelslot op basis van een
 * declaratief taakprofiel. De router mapt een profiel op een SLOT
 * (`default` | `fast` | `reasoning` | `vision` | `embedding`), nooit op een
 * harde modelnaam. Daardoor blijft `MODEL_REGISTRY` in `aiGateway.ts` de enige
 * plek waar modelnamen staan; een model upgraden of vervangen gebeurt op één
 * plek zonder enige service aan te raken.
 *
 * Zie docs/architectuur/ai-platform/README.md §4.7.
 *
 * Dit formaliseert wat nu impliciet gebeurt (elke service kiest zelf een slot)
 * tot een expliciete, testbare beslissing — zonder het registermodel te wijzigen.
 */

import type { ModelSlot } from "./aiGateway";

/**
 * Declaratief taakprofiel. Een taak beschrijft WAT zij nodig heeft, niet WELK
 * model. De router vertaalt dit naar een slot.
 */
export interface Taakprofiel {
  /** Vereist beeldanalyse (foto's, satelliet, Street View, tekeningen). */
  vereistVision?: boolean;
  /** Vereist zware redenering (opleidingen, offerte-secties, complexe analyse). */
  vereistRedenering?: boolean;
  /** Kostengevoelige bulktaak (security-scan, e-mail) — kies het goedkope slot. */
  kostengevoelig?: boolean;
  /** Betreft een embedding-taak (vectorisatie), geen chat-completion. */
  isEmbedding?: boolean;
}

/** Uitkomst van de modelrouter: het gekozen slot plus een menselijk leesbare reden. */
export interface ModelKeuze {
  slot: ModelSlot;
  reden: string;
}

/**
 * Kies het modelslot voor een taakprofiel.
 *
 * Prioriteitsvolgorde (conform §4.7):
 *   1. embeddings        -> `embedding`
 *   2. vision            -> `vision`
 *   3. zware redenering  -> `reasoning`
 *   4. kostengevoelig    -> `fast`
 *   5. standaard         -> `default`
 *
 * De reden wordt vastgelegd in het redeneerlog (Fase 3) en is nu al beschikbaar
 * voor logging/diagnose.
 */
export function kiesSlot(profiel: Taakprofiel): ModelKeuze {
  if (profiel.isEmbedding) {
    return { slot: "embedding", reden: "Embedding-taak: slot embedding." };
  }
  if (profiel.vereistVision) {
    return { slot: "vision", reden: "Beeldanalyse vereist: slot vision." };
  }
  if (profiel.vereistRedenering) {
    return { slot: "reasoning", reden: "Zware redenering vereist: slot reasoning." };
  }
  if (profiel.kostengevoelig) {
    return { slot: "fast", reden: "Kostengevoelige bulktaak: slot fast." };
  }
  return { slot: "default", reden: "Standaardtaak: slot default." };
}

// BIAE-capability — AI Decision Engine (dunne adapter).
//
// Registreert de AI Decision Engine als capability op de bus. De engine bepaalt
// zelf (via zijn passthrough-laag en module-matrix) wanneer AI-ondersteuning is
// toegestaan; deze adapter maakt hem uitsluitend zichtbaar en observeert
// spot-/document-events waar AI-ondersteuning relevant kan zijn. Geen directe
// AI-aanroep hier — dat blijft human-in-the-loop in de bestaande routes.
import type { BiaeCapability } from "../types";
import { logger } from "../../../lib/logger";

export const aiDecisionCapability: BiaeCapability = {
  naam: "ai-decision",
  omschrijving: "Registreert de AI Decision Engine; observeert AI-relevante events.",
  categorieen: ["spot", "document"],
  types: ["spot_aangemaakt", "document_aangemaakt"],
  verwerk: (event) => {
    logger.info(
      { type: event.type },
      "BIAE ai-decision-capability: AI-relevant event ontvangen",
    );
  },
};

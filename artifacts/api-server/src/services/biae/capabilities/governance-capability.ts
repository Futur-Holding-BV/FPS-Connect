// BIAE-capability — Governance & Approval (dunne adapter).
//
// Observeert governance-events (goedkeuring ingediend/afgehandeld, escalatie
// verstuurd) op de bus. De risicoscoring en goedkeuringsmotor zelf blijven in
// governance-engine.ts resp. goedkeuring-engine.ts; deze adapter maakt de
// gebeurtenissen centraal zichtbaar en herbruikbaar voor andere capabilities.
import type { BiaeCapability } from "../types";
import { logger } from "../../../lib/logger";

export const governanceCapability: BiaeCapability = {
  naam: "governance",
  omschrijving: "Ontvangt goedkeurings- en escalatie-events voor centrale bewaking.",
  categorieen: ["governance"],
  verwerk: (event) => {
    logger.info(
      { type: event.type, payload: event.payload },
      "BIAE governance-capability: governance-event ontvangen",
    );
  },
};

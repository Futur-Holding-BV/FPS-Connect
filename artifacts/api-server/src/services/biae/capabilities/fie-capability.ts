// BIAE-capability — Financial Intelligence Engine (dunne adapter).
//
// Observeert financiële events (factuur ontvangen, inkoopbon-status,
// nacalculatie-afwijking) op de bus. De rekenmotor blijft in fie-service.ts;
// deze adapter maakt financiële signalen beschikbaar voor de KPI-aggregatie.
import type { BiaeCapability } from "../types";
import { logger } from "../../../lib/logger";

export const fieCapability: BiaeCapability = {
  naam: "fie",
  omschrijving: "Ontvangt financiële events voor KPI- en risicoaggregatie.",
  categorieen: ["financieel"],
  verwerk: (event) => {
    logger.info(
      { type: event.type, payload: event.payload },
      "BIAE fie-capability: financieel event ontvangen",
    );
  },
};

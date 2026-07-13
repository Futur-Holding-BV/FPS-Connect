// BIAE-capability — WorkflowService (dunne adapter).
//
// Abonneert op workflow-transitie-events die de WorkflowService op de bus
// publiceert. Zorgt dat cross-module reacties één centrale ingang hebben; de
// transitie zelf (incl. audit + tijdlijn) blijft volledig in workflow-engine.ts.
import type { BiaeCapability } from "../types";
import { logger } from "../../../lib/logger";

export const workflowCapability: BiaeCapability = {
  naam: "workflow",
  omschrijving: "Ontvangt workflow-transities voor cross-module orkestratie.",
  categorieen: ["workflow"],
  verwerk: (event) => {
    const p = event.payload;
    logger.info(
      {
        workflowId: p["workflowId"],
        entityType: p["entityType"],
        entityId: p["entityId"],
        naarStatus: p["naarStatus"],
      },
      "BIAE workflow-capability: transitie ontvangen",
    );
  },
};

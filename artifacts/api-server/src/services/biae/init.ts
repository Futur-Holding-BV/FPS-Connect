// BIAE — initialisatie: registreert de bestaande engines als capabilities.
//
// Wordt éénmalig aangeroepen bij serverstart (index.ts). Idempotent te houden
// is niet nodig omdat het maar één keer loopt, maar registerCapability overschrijft
// veilig bij dubbele registratie.
import { biae } from "./index";
import { workflowCapability } from "./capabilities/workflow-capability";
import { governanceCapability } from "./capabilities/governance-capability";
import { goedkeuringCapability } from "./capabilities/goedkeuring-capability";
import { fieCapability } from "./capabilities/fie-capability";
import { aiDecisionCapability } from "./capabilities/ai-decision-capability";
import { aiContextCapability } from "./capabilities/ai-context-capability";
import { securityIntakeCapability } from "./capabilities/security-intake-capability";
import { logger } from "../../lib/logger";

let _geinitialiseerd = false;

export function initBiae(): void {
  if (_geinitialiseerd) return;
  _geinitialiseerd = true;

  biae.registerCapability(workflowCapability);
  biae.registerCapability(governanceCapability);
  biae.registerCapability(goedkeuringCapability);
  biae.registerCapability(fieCapability);
  biae.registerCapability(aiDecisionCapability);
  biae.registerCapability(aiContextCapability);
  biae.registerCapability(securityIntakeCapability);

  logger.info({ aantal: biae.aantalCapabilities() }, "BIAE: capabilities geregistreerd");
}

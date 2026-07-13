// BIAE-capability — Security Intake Engine (dunne adapter).
//
// Observeert document-events (nieuw document aangemaakt) op de bus. De feitelijke
// scan (metadata/bytes/e-mail) blijft in security-intake-engine.ts en wordt
// aangeroepen op het upload-pad; deze adapter registreert de engine als
// capability en maakt document-intake centraal zichtbaar.
import type { BiaeCapability } from "../types";
import { logger } from "../../../lib/logger";

export const securityIntakeCapability: BiaeCapability = {
  naam: "security-intake",
  omschrijving: "Registreert de beveiligingsintake; observeert document-intake-events.",
  categorieen: ["document"],
  types: ["document_aangemaakt"],
  verwerk: (event) => {
    logger.info(
      { documentId: event.payload["documentId"] },
      "BIAE security-intake-capability: document-intake ontvangen",
    );
  },
};

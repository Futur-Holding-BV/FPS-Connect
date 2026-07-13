// BIAE-capability — Goedkeuringsmotor (dunne adapter).
//
// Observeert offerte- en financiële events die een goedkeuringstraject kunnen
// raken. De motor (indienen, goedkeuren, escaleren) blijft volledig in
// goedkeuring-engine.ts en goedkeuringBewaking.ts; deze adapter registreert de
// motor als capability zodat toekomstige koppelingen via de bus kunnen lopen.
import type { BiaeCapability } from "../types";
import { logger } from "../../../lib/logger";

export const goedkeuringCapability: BiaeCapability = {
  naam: "goedkeuring",
  omschrijving: "Ontvangt offerte-/financiële events die goedkeuring kunnen vereisen.",
  categorieen: ["offerte", "financieel"],
  verwerk: (event) => {
    logger.info(
      { type: event.type, payload: event.payload },
      "BIAE goedkeuring-capability: event ontvangen",
    );
  },
};

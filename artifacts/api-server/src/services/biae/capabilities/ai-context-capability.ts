// BIAE-capability — AI Context Service (dunne adapter).
//
// Abonneert op mutatie-events van kernentiteiten en invalideert de gecachte
// contextbundel via de bestaande aiContext-implementatie. De onderliggende
// engine blijft ongewijzigd; deze adapter koppelt hem alleen aan de bus.
import type { BiaeCapability, BiaeGelogdEvent } from "../types";
import { invalideerContext } from "../../../lib/aiContext/cache";
import type { ContextEntiteitType } from "../../../lib/aiContext/types";

function bepaalDoel(event: BiaeGelogdEvent): { type: ContextEntiteitType; id: number } | null {
  const p = event.payload;
  switch (event.categorie) {
    case "spot": {
      const id = Number(p["spotId"]);
      return Number.isFinite(id) ? { type: "voorziening", id } : null;
    }
    case "document": {
      const id = Number(p["documentId"]);
      return Number.isFinite(id) ? { type: "document", id } : null;
    }
    case "offerte": {
      const id = Number(p["offerteId"]);
      return Number.isFinite(id) ? { type: "offerte", id } : null;
    }
    default:
      return null;
  }
}

export const aiContextCapability: BiaeCapability = {
  naam: "ai-context",
  omschrijving: "Invalideert de AI-contextcache bij mutaties op kernentiteiten.",
  categorieen: ["spot", "document", "offerte"],
  verwerk: (event) => {
    const doel = bepaalDoel(event);
    if (doel) invalideerContext(doel.type, doel.id);
  },
};

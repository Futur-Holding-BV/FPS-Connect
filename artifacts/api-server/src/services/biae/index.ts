// Business Intelligence & Automation Engine (BIAE) — centrale event-verwerkingslaag.
//
// De kern is bewust minimaal en zonder database-afhankelijkheid:
//  - registerCapability(): registreer een dunne adapter rond een bestaande engine.
//  - publiceerEvent(): publiceer een getypeerd event; de kern logt het in een
//    in-memory circulaire buffer (laatste 500) en dispatcht asynchroon naar alle
//    geabonneerde capabilities.
//  - recentEvents()/capabilityStatus(): read-model voor het beheerscherm.
//
// Dispatch is fire-and-forget: een falende capability mag NOOIT de publicerende
// route of job breken (stabiliteit > functionaliteit). Fouten worden gelogd en
// per capability bijgehouden.
import { logger } from "../../lib/logger";
import type {
  BiaeCapability,
  BiaeCapabilityStatus,
  BiaeEvent,
  BiaeGelogdEvent,
} from "./types";

const MAX_LOG = 500;

interface CapabilityRuntime {
  capability: BiaeCapability;
  verwerkteEvents: number;
  laatsteFout: string | null;
  laatstActiefOp: string | null;
}

class BIAEService {
  private readonly capabilities = new Map<string, CapabilityRuntime>();
  private readonly log: BiaeGelogdEvent[] = [];
  private volgendeId = 1;

  // ── Capability-registratie ────────────────────────────────────────────────
  registerCapability(capability: BiaeCapability): this {
    if (this.capabilities.has(capability.naam)) {
      logger.warn({ capability: capability.naam }, "BIAE: capability opnieuw geregistreerd (overschreven)");
    }
    this.capabilities.set(capability.naam, {
      capability,
      verwerkteEvents: 0,
      laatsteFout: null,
      laatstActiefOp: null,
    });
    return this;
  }

  // ── Event publiceren ──────────────────────────────────────────────────────
  // Synchroon: schrijft het event in de log. De dispatch naar capabilities loopt
  // asynchroon (microtask) zodat de aanroeper niet wacht en fouten geïsoleerd
  // blijven. Retourneert het gelogde event (voor tests/bewijsvoering).
  publiceerEvent(event: BiaeEvent): BiaeGelogdEvent {
    const gelogd: BiaeGelogdEvent = {
      id: this.volgendeId++,
      categorie: event.categorie,
      type: event.type,
      gebruikerId: event.gebruikerId ?? null,
      gebruikerNaam: event.gebruikerNaam ?? null,
      payload: (event.payload as Record<string, unknown>) ?? {},
      tijdstip: new Date().toISOString(),
    };

    this.log.push(gelogd);
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG);

    // Asynchrone, geïsoleerde dispatch — breekt nooit de aanroeper.
    void this.dispatch(gelogd);

    return gelogd;
  }

  private async dispatch(event: BiaeGelogdEvent): Promise<void> {
    for (const runtime of this.capabilities.values()) {
      const cap = runtime.capability;
      if (!cap.verwerk) continue;
      if (!cap.categorieen.includes(event.categorie)) continue;
      if (cap.types && cap.types.length > 0 && !cap.types.includes(event.type)) continue;

      try {
        await cap.verwerk(event);
        runtime.verwerkteEvents++;
        runtime.laatstActiefOp = new Date().toISOString();
        runtime.laatsteFout = null;
      } catch (err) {
        runtime.laatsteFout = err instanceof Error ? err.message : String(err);
        logger.error(
          { err, capability: cap.naam, eventType: event.type },
          "BIAE: capability faalde bij event-verwerking",
        );
      }
    }
  }

  // ── Read-model voor beheerscherm ──────────────────────────────────────────
  recentEvents(limiet = 100): BiaeGelogdEvent[] {
    const n = Math.max(1, Math.min(limiet, MAX_LOG));
    return this.log.slice(-n).reverse();
  }

  capabilityStatus(): BiaeCapabilityStatus[] {
    return Array.from(this.capabilities.values()).map((r) => ({
      naam: r.capability.naam,
      omschrijving: r.capability.omschrijving,
      categorieen: r.capability.categorieen,
      types: r.capability.types ?? [],
      verwerkteEvents: r.verwerkteEvents,
      laatsteFout: r.laatsteFout,
      laatstActiefOp: r.laatstActiefOp,
    }));
  }

  aantalCapabilities(): number {
    return this.capabilities.size;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────
export const biae = new BIAEService();

export type { BiaeEvent, BiaeGelogdEvent, BiaeCapability, BiaeCapabilityStatus } from "./types";
export { analyseImpact } from "./impact";

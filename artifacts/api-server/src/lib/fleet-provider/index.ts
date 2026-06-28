// Factory — geeft de geconfigureerde FleetProvider terug.
// TRAXGO_API_KEY → TraxgoProvider.
// Geen key → StubProvider (geeft lege data, geen netwerkaanroepen).

import type { FleetProvider, VoertuigData, LocatieData, RitData } from "./interface.js";
import { TraxgoProvider } from "./traxgo.js";
import { logger } from "../logger.js";

// ── Stub (geen API-key geconfigureerd) ───────────────────────
class StubProvider implements FleetProvider {
  readonly naam = "stub";

  async testVerbinding()                             { return false; }
  async lijstVoertuigIds()                           { return []; }
  async haalVoertuigDataOp(_id: string): Promise<VoertuigData | null> { return null; }
  async haalLocatieOp(_id: string): Promise<LocatieData | null>       { return null; }
  async haalRittenOp(_id: string, _v: Date, _t: Date): Promise<RitData[]> { return []; }
}

// ── Factory ───────────────────────────────────────────────────
let _provider: FleetProvider | null = null;

export function getFleetProvider(): FleetProvider {
  if (_provider) return _provider;

  const traxgoKey = process.env["TRAXGO_API_KEY"];

  if (traxgoKey) {
    logger.info("Fleet-provider: Traxgo (API-key geconfigureerd)");
    _provider = new TraxgoProvider(traxgoKey);
  } else {
    logger.warn("Fleet-provider: geen API-key — stub actief (geen synchronisatie)");
    _provider = new StubProvider();
  }

  return _provider;
}

export type { FleetProvider, VoertuigData, LocatieData, RitData } from "./interface.js";

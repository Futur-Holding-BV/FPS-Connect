// Traxgo-implementatie van de FleetProvider-interface.
// API-sleutel uitsluitend via TRAXGO_API_KEY omgevingsvariabele.
// Traxgo-specifieke logica blijft VOLLEDIG in dit bestand — de rest van de
// applicatie importeert alleen de generieke FleetProvider-interface.

import type {
  FleetProvider, VoertuigData, LocatieData, RitData,
} from "./interface.js";
import { logger } from "../logger.js";

const BASE_URL = "https://api.traxgo.com/v1"; // productie-endpoint

function headers(apiKey: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type":  "application/json",
    "Accept":        "application/json",
  };
}

async function traxgoFetch<T>(
  apiKey:   string,
  pad:      string,
  opties?:  RequestInit,
  poging = 1,
): Promise<T> {
  const url = `${BASE_URL}${pad}`;
  let lastError: Error | null = null;

  for (let i = 0; i < poging; i++) {
    try {
      const resp = await fetch(url, {
        ...opties,
        headers: { ...headers(apiKey), ...((opties?.headers as Record<string, string>) ?? {}) },
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Traxgo HTTP ${resp.status}: ${body.slice(0, 200)}`);
      }
      return (await resp.json()) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < poging - 1) {
        await new Promise((r) => setTimeout(r, 1_000 * (i + 1)));
      }
    }
  }
  throw lastError ?? new Error("Onbekende Traxgo-fout");
}

// ── Ruwe Traxgo-responsetypen ──────────────────────────────
interface TraxgoVehicle {
  id:             string;
  registration?:  string; // kenteken
  make?:          string;
  model?:         string;
  mileage?:       number;  // km
  fuelLevel?:     number;  // %
  chargeLevel?:   number;  // % elektrisch
  engineHours?:   number;
  faultCodes?:    string[];
  lastUpdate?:    string;  // ISO
}

interface TraxgoPosition {
  vehicleId: string;
  lat:       number;
  lng:       number;
  address?:  string;
  speed?:    number;
  timestamp: string;
}

interface TraxgoTrip {
  tripId:     string;
  vehicleId:  string;
  startTime:  string;
  endTime:    string;
  startKm?:   number;
  endKm?:     number;
  distance?:  number;
  origin?:    string;
  destination?: string;
}

// ══════════════════════════════════════════════════════════════
// TraxgoProvider
// ══════════════════════════════════════════════════════════════

export class TraxgoProvider implements FleetProvider {
  readonly naam = "traxgo";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async testVerbinding(): Promise<boolean> {
    try {
      await traxgoFetch<unknown>(this.apiKey, "/vehicles?limit=1");
      return true;
    } catch (err) {
      logger.warn({ err }, "Traxgo verbindingstest mislukt");
      return false;
    }
  }

  async lijstVoertuigIds(): Promise<string[]> {
    const data = await traxgoFetch<{ items: TraxgoVehicle[] }>(
      this.apiKey, "/vehicles?limit=500", undefined, 3,
    );
    return (data.items ?? []).map((v) => v.id);
  }

  async haalVoertuigDataOp(externalId: string): Promise<VoertuigData | null> {
    try {
      const v = await traxgoFetch<TraxgoVehicle>(
        this.apiKey, `/vehicles/${externalId}`, undefined, 3,
      );
      return {
        externalId:       v.id,
        kenteken:         v.registration,
        merk:             v.make,
        type:             v.model,
        kmStand:          v.mileage,
        kmStandDatum:     v.lastUpdate ? new Date(v.lastUpdate) : undefined,
        brandstofProcent: v.fuelLevel,
        laadProcent:      v.chargeLevel,
        draaiuren:        v.engineHours,
        foutcodes:        v.faultCodes,
        laatsGezienOp:    v.lastUpdate ? new Date(v.lastUpdate) : undefined,
      };
    } catch (err) {
      logger.error({ err, externalId }, "Traxgo voertuigdata ophalen mislukt");
      return null;
    }
  }

  async haalLocatieOp(externalId: string): Promise<LocatieData | null> {
    try {
      const p = await traxgoFetch<TraxgoPosition>(
        this.apiKey, `/vehicles/${externalId}/position`, undefined, 2,
      );
      return {
        externalId:   p.vehicleId,
        lat:          p.lat,
        lng:          p.lng,
        adres:        p.address,
        snelheidKmh: p.speed,
        tijdstip:     new Date(p.timestamp),
      };
    } catch {
      return null;
    }
  }

  async haalRittenOp(externalId: string, van: Date, tot: Date): Promise<RitData[]> {
    const vanaf = van.toISOString();
    const tm    = tot.toISOString();
    const data  = await traxgoFetch<{ items: TraxgoTrip[] }>(
      this.apiKey,
      `/trips?vehicleId=${externalId}&from=${encodeURIComponent(vanaf)}&to=${encodeURIComponent(tm)}&limit=500`,
      undefined, 3,
    );
    return (data.items ?? []).map((t) => ({
      externalRitId:       t.tripId,
      externalVoertuigId:  t.vehicleId,
      startDatum:          new Date(t.startTime),
      eindDatum:           new Date(t.endTime),
      kmStart:             t.startKm,
      kmEind:              t.endKm,
      afstandKm:           t.distance,
      vertrekAdres:        t.origin,
      bestemmingAdres:     t.destination,
    }));
  }
}

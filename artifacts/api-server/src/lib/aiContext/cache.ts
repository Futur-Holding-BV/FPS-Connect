// ── AI Context Service — cache met invalidatie ───────────────────────────────
//
// Cachet de RUWE (scope-onafhankelijke) knoop per `type:id`. Autorisatie hangt
// af van de vragende gebruiker en wordt daarom NOOIT gecachet — alleen de kale
// entiteitgegevens. Zo blijft de cache veilig te delen tussen gebruikers.
//
// Invalidatie: `invalideerContext(type, id)` wordt door mutatie-handlers
// aangeroepen (nog niet aangesloten in deze fase). TTL vangt bovendien
// achtergrondwijzigingen op.

import type { ContextEntiteitType, OpgehaaldeKnoop } from "./types";

interface CacheItem {
  knoop: OpgehaaldeKnoop | null;
  vervaltOp: number;
}

const STANDAARD_TTL_MS = 60_000;

const cache = new Map<string, CacheItem>();

function sleutel(type: ContextEntiteitType, id: number): string {
  return `${type}:${id}`;
}

export function leesCache(type: ContextEntiteitType, id: number, nu = Date.now()): { hit: boolean; knoop: OpgehaaldeKnoop | null } {
  const item = cache.get(sleutel(type, id));
  if (!item) return { hit: false, knoop: null };
  if (item.vervaltOp <= nu) {
    cache.delete(sleutel(type, id));
    return { hit: false, knoop: null };
  }
  return { hit: true, knoop: item.knoop };
}

export function schrijfCache(
  type: ContextEntiteitType,
  id: number,
  knoop: OpgehaaldeKnoop | null,
  ttlMs = STANDAARD_TTL_MS,
  nu = Date.now(),
): void {
  cache.set(sleutel(type, id), { knoop, vervaltOp: nu + ttlMs });
}

// Aan te roepen door mutatie-handlers na wijzigen/verwijderen van een entiteit.
export function invalideerContext(type: ContextEntiteitType, id: number): void {
  cache.delete(sleutel(type, id));
}

export function invalideerContextAlles(): void {
  cache.clear();
}

// Alleen voor tests/diagnose.
export function cacheOmvang(): number {
  return cache.size;
}

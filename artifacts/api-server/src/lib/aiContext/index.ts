// ── AI Context Service — Orchestrator (architectuur §4.1) ────────────────────
//
// Kernbelofte: een AI-functie krijgt NOOIT alleen het huidige formulier. Deze
// service stelt automatisch de volledige, GEAUTORISEERDE contextbundel samen
// rond een entiteit door de graaf van gerelateerde entiteiten te doorlopen,
// elke knoop te toetsen aan de bevoegdheden-matrix + gebouwtoewijzing (nooit
// rolnaam), het geheel binnen het tokenbudget te trimmen en te leveren als
// `contextBronnen: AiContextBron[]` plus vlakke LogContext-velden.
//
// De service is los valideerbaar: hij is nog NIET aangesloten op AI-functies.

import type { AiContextBron, LogContext } from "../aiGateway";
import {
  ENTITEIT_CONFIG,
  type ContextBundel,
  type ContextBundelOpties,
  type ContextEntiteitType,
  type ContextScope,
  type OpgehaaldeKnoop,
  type ResolverKaart,
  type WeggelatenBron,
} from "./types";
import { budgetVoorSlot, trimBronnen, type TrimbareBron } from "./tokenBudget";
import { leesCache, schrijfCache } from "./cache";
import { DB_RESOLVERS } from "./resolvers";

export * from "./types";
export { schatTokens, schatBronTokens, SLOT_BUDGET, budgetVoorSlot, trimBronnen } from "./tokenBudget";
export { invalideerContext, invalideerContextAlles, cacheOmvang } from "./cache";
export { DB_RESOLVERS } from "./resolvers";

const STANDAARD_MAX_DIEPTE = 2;

// ── Autorisatie per knoop ────────────────────────────────────────────────────
//
// Faithful mirror van de route-level gating: de Context Service kan geen data
// leveren die de gebruiker zelf niet mag zien.
//   - gebouw-gescoped : magBijGebouw(gebouwId) EN (klant | module-lees |
//                       object-recht). Klanten zien uitsluitend hun eigen
//                       (toegewezen) gebouwen, nooit interne modules.
//   - niet-gescoped   : geen klant EN module-leesrecht.
// Hoofdbeheerder ziet alles.
export function magKnoopZien(type: ContextEntiteitType, knoop: OpgehaaldeKnoop, scope: ContextScope): boolean {
  if (scope.isHoofdbeheerder) return true;
  const cfg = ENTITEIT_CONFIG[type];

  if (cfg.gebouwGescoped) {
    if (!scope.magBijGebouw(knoop.gebouwId)) return false;
    return scope.heeftModuleRecht(cfg.module, 1) || scope.heeftObjectRecht(type, knoop.id, 1);
  }

  return scope.heeftModuleRecht(cfg.module, 1);
}

interface WachtrijItem {
  type: ContextEntiteitType;
  id: number;
  diepte: number;
  prioriteit: number;
  relatie?: string;
}

async function haalKnoop(
  type: ContextEntiteitType,
  id: number,
  resolvers: ResolverKaart,
  gebruikCache: boolean,
): Promise<OpgehaaldeKnoop | null> {
  if (gebruikCache) {
    const gecacht = leesCache(type, id);
    if (gecacht.hit) return gecacht.knoop;
  }
  const resolver = resolvers[type];
  const knoop = resolver ? await resolver(id) : null;
  if (gebruikCache) schrijfCache(type, id, knoop);
  return knoop;
}

// Voegt de vlakke velden van een knoop toe zonder bestaande (eerder gezette,
// belangrijker) niet-lege waarden te overschrijven. De wortel wordt als eerste
// samengevoegd en wint dus.
function vulFlatAan(doel: Partial<LogContext>, bron: Partial<LogContext>): void {
  for (const [sleutel, waarde] of Object.entries(bron)) {
    if (waarde === null || waarde === undefined) continue;
    const bestaand = (doel as Record<string, unknown>)[sleutel];
    if (bestaand === null || bestaand === undefined) {
      (doel as Record<string, unknown>)[sleutel] = waarde;
    }
  }
}

export async function bouwContextBundel(opties: ContextBundelOpties): Promise<ContextBundel> {
  const {
    entiteitstype,
    entiteitId,
    scope,
    modelSlot,
    tokenBudget,
    maxDiepte = STANDAARD_MAX_DIEPTE,
    resolvers = DB_RESOLVERS,
    gebruikCache = true,
  } = opties;

  const weggelaten: WeggelatenBron[] = [];
  const flat: Partial<LogContext> = {};
  const trimbaar: TrimbareBron[] = [];

  // ── Wortel ──────────────────────────────────────────────────────────────
  const wortel = await haalKnoop(entiteitstype, entiteitId, resolvers, gebruikCache);
  if (!wortel) {
    return {
      geautoriseerd: false,
      contextBronnen: [],
      logContext: {
        module: "ai-context",
        entiteitstype,
        entiteitId,
        gebruikerId: scope.userId,
      },
      weggelaten: [{ type: entiteitstype, id: entiteitId, reden: "niet-gevonden" }],
      tokenSchatting: 0,
      diepteBereikt: 0,
    };
  }
  if (!magKnoopZien(entiteitstype, wortel, scope)) {
    return {
      geautoriseerd: false,
      contextBronnen: [],
      logContext: {
        module: "ai-context",
        entiteitstype,
        entiteitId,
        gebruikerId: scope.userId,
      },
      weggelaten: [{ type: entiteitstype, id: entiteitId, reden: "geen-toegang" }],
      tokenSchatting: 0,
      diepteBereikt: 0,
    };
  }

  // ── Graaf-BFS met autorisatiegrens ────────────────────────────────────────
  const gezien = new Set<string>();
  const wachtrij: WachtrijItem[] = [{ type: entiteitstype, id: entiteitId, diepte: 0, prioriteit: 0 }];
  gezien.add(`${entiteitstype}:${entiteitId}`);
  // De wortel is al opgehaald+geautoriseerd; verwerk 'm samen in de lus door de
  // eerste iteratie de reeds opgehaalde knoop te laten hergebruiken.
  const voorafOpgehaald = new Map<string, OpgehaaldeKnoop>();
  voorafOpgehaald.set(`${entiteitstype}:${entiteitId}`, wortel);

  let diepteBereikt = 0;

  while (wachtrij.length > 0) {
    const item = wachtrij.shift()!;
    const sleutel = `${item.type}:${item.id}`;

    const knoop = voorafOpgehaald.get(sleutel) ?? (await haalKnoop(item.type, item.id, resolvers, gebruikCache));
    if (!knoop) {
      if (item.diepte > 0) weggelaten.push({ type: item.type, id: item.id, reden: "niet-gevonden", relatie: item.relatie });
      continue;
    }

    const isWortel = item.diepte === 0;
    if (!isWortel && !magKnoopZien(item.type, knoop, scope)) {
      // Autorisatiegrens: knoop weglaten EN NIET verder uitbreiden. Een niet-
      // toegankelijke knoop mag geen zichtbaarheid geven op wat erachter ligt.
      weggelaten.push({ type: item.type, id: item.id, reden: "geen-toegang", relatie: item.relatie });
      continue;
    }

    diepteBereikt = Math.max(diepteBereikt, item.diepte);
    vulFlatAan(flat, knoop.flat);
    trimbaar.push({
      type: item.type,
      id: item.id,
      bron: knoop.bron,
      prioriteit: item.prioriteit,
      relatie: item.relatie,
      inkortbaarVeld: knoop.inkortbaarVeld,
      isWortel,
    });

    if (item.diepte >= maxDiepte) continue;
    for (const rel of knoop.relaties) {
      const relSleutel = `${rel.type}:${rel.id}`;
      if (gezien.has(relSleutel)) continue;
      gezien.add(relSleutel);
      wachtrij.push({
        type: rel.type,
        id: rel.id,
        diepte: item.diepte + 1,
        prioriteit: item.prioriteit + rel.prioriteitOffset,
        relatie: rel.relatie,
      });
    }
  }

  // ── Tokenbudget-trimming ──────────────────────────────────────────────────
  const budget = budgetVoorSlot(modelSlot, tokenBudget);
  const { behouden, weggelaten: budgetWeg, tokenSchatting } = trimBronnen(trimbaar, budget);
  weggelaten.push(...budgetWeg);

  const contextBronnen: AiContextBron[] = behouden;

  const logContext: Partial<LogContext> = {
    module: "ai-context",
    entiteitstype,
    entiteitId,
    gebruikerId: scope.userId,
    ...flat,
    contextBronnen,
  };

  return {
    geautoriseerd: true,
    contextBronnen,
    logContext,
    weggelaten,
    tokenSchatting,
    diepteBereikt,
  };
}

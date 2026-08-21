// ── AI Context Service — Orchestrator (architectuur §4.1) ────────────────────
//
// Kernbelofte: een AI-functie krijgt NOOIT alleen het huidige formulier. Deze
// service stelt automatisch de volledige, GEAUTORISEERDE contextbundel samen
// rond een entiteit door de graaf van gerelateerde entiteiten te doorlopen,
// elke knoop te toetsen aan de bevoegdheden-matrix + gebouwtoewijzing (nooit
// rolnaam), het geheel binnen het tokenbudget te trimmen en te leveren als
// `contextBronnen: AiContextBron[]` plus vlakke LogContext-velden.
//
// De service is los valideerbaar en wordt onder meer door de vaste Connect-
// assistent gebruikt.

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
import { DB_RESOLVERS, vindGebouwIdVoorContextKnoop } from "./resolvers";

export * from "./types";
export { schatTokens, schatBronTokens, SLOT_BUDGET, budgetVoorSlot, trimBronnen } from "./tokenBudget";
export { invalideerContext, invalideerContextAlles, cacheOmvang } from "./cache";
export { DB_RESOLVERS } from "./resolvers";

const STANDAARD_MAX_DIEPTE = 2;

// ── Autorisatie per knoop ────────────────────────────────────────────────────
//
// Faithful mirror van de route-level gating: de Context Service kan geen data
// leveren die de gebruiker zelf niet mag zien.
//   - gebouw-gescoped : magBijGebouw(gebouwId) EN (module-lees of object-recht).
//   - niet-gescoped   : module-leesrecht.
// Hoofdbeheerder ziet alles.
export function magKnoopZien(type: ContextEntiteitType, knoop: OpgehaaldeKnoop, scope: ContextScope): boolean {
  if (scope.isHoofdbeheerder) return true;
  const cfg = ENTITEIT_CONFIG[type];
  if (!cfg) return false;

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

/**
 * Productiepoort vóór de inhoudelijke resolver/cache-read. Voor
 * gebouwgebonden knopen wordt alleen de gebouw-id als scope-metadata gelezen;
 * pas na magBijGebouw() mag de volledige knoop worden opgehaald.
 *
 * Bij geïnjecteerde testresolvers is geen DB-metadata beschikbaar. De pure
 * module/objectpoort draait daar wel vooraf; de gebouwcontrole volgt op de
 * geïnjecteerde knoop via magKnoopZien().
 */
async function magVoorInhoudelijkeQuery(
  type: ContextEntiteitType,
  id: number,
  scope: ContextScope,
  gebruikDbResolvers: boolean,
): Promise<boolean> {
  if (scope.isHoofdbeheerder) return true;
  const cfg = ENTITEIT_CONFIG[type];
  if (!cfg) return false;

  const heeftMatrixrecht =
    scope.heeftModuleRecht(cfg.module, 1) ||
    (cfg.gebouwGescoped && scope.heeftObjectRecht(type, id, 1));
  if (!heeftMatrixrecht) return false;

  if (cfg.gebouwGescoped && gebruikDbResolvers) {
    const gebouwId = await vindGebouwIdVoorContextKnoop(type, id);
    return scope.magBijGebouw(gebouwId);
  }
  return true;
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
  const gebruikDbResolvers = resolvers === DB_RESOLVERS;

  // ── Wortel ──────────────────────────────────────────────────────────────
  if (!(await magVoorInhoudelijkeQuery(entiteitstype, entiteitId, scope, gebruikDbResolvers))) {
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

    if (
      item.diepte > 0 &&
      !(await magVoorInhoudelijkeQuery(item.type, item.id, scope, gebruikDbResolvers))
    ) {
      // Geen inhoudelijke query/cache-read en geen uitbreiding achter deze
      // autorisatiegrens.
      weggelaten.push({
        type: item.type,
        id: item.id,
        reden: "geen-toegang",
        relatie: item.relatie,
      });
      continue;
    }

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

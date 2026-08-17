// ── AI Context Service — types (architectuur §4.1) ───────────────────────────
//
// De Context Service stelt automatisch de VOLLEDIGE, GEAUTORISEERDE
// contextbundel samen rond een entiteit, zodat een AI-functie nooit alleen het
// huidige formulier ziet. Dit bestand bevat uitsluitend types + configuratie;
// er zit geen DB- of businesslogica in, zodat het los te redeneren en te testen
// is.

import type { AiContextBron, LogContext } from "../aiGateway";

// De acht kernentiteiten waarrond context wordt opgebouwd.
export type ContextEntiteitType =
  | "gebouw"
  | "voorziening"
  | "offerte"
  | "medewerker"
  | "document"
  | "dossier"
  | "onderhoud"
  | "klant"; // klantloos-ok: CRM-entiteitstype (graafknooptype), geen rol

// ── Scoping-contract ─────────────────────────────────────────────────────────
//
// De Context Service mag NOOIT scopen op rolnaam. Alle autorisatie loopt via de
// bevoegdheden-matrix (heeftModuleRecht / heeftObjectRecht) en de
// gebouwtoewijzing (magBijGebouw), inclusief impersonatie ("bekijken als"). De
// bestaande `PermissieService` voldoet structureel aan dit contract; de
// Orchestrator hoeft de implementatie niet te kennen.
export interface ContextScope {
  readonly isHoofdbeheerder: boolean;
  readonly userId: number;
  heeftModuleRecht(module: string, minNiveau: number): boolean;
  magBijGebouw(gebouwId: number | null): boolean;
  heeftObjectRecht(objectType: string, objectId: number, minNiveau?: number): boolean;
}

// ── Graafmodel ───────────────────────────────────────────────────────────────
//
// Een resolver haalt één entiteit op en levert een `OpgehaaldeKnoop`: de
// contextbron zelf, de vlakke LogContext-velden die eruit volgen, het gebouw
// waaronder de knoop valt (voor gebouw-scoping) en verwijzingen naar
// gerelateerde knopen die de graaf verder kunnen uitbreiden.
export interface KnoopVerwijzing {
  type: ContextEntiteitType;
  id: number;
  // Menselijke omschrijving van de relatie (bijv. "gebouw", "klant").
  relatie: string;
  // Prioriteit-offset t.o.v. de bronknoop; hoger = minder belangrijk, valt
  // eerder af bij tokenbudget-overschrijding.
  prioriteitOffset: number;
}

export interface OpgehaaldeKnoop {
  type: ContextEntiteitType;
  id: number;
  // De contextbron die aan de AI wordt aangeboden.
  bron: AiContextBron;
  // Vlakke businesscontext-velden voor LogContext (id-verwijzingen + workflow).
  flat: Partial<LogContext>;
  // Gebouw waaronder deze knoop valt; null = niet gebouw-gescoped.
  gebouwId: number | null;
  // Verwijzingen naar gerelateerde knopen (graafuitbreiding).
  relaties: KnoopVerwijzing[];
  // Naam van de payload-sleutel waarvan de tekst bij budgetoverschrijding
  // ingekort mag worden (bijv. "omschrijving"). Optioneel.
  inkortbaarVeld?: string;
}

// Een resolver haalt de ruwe (scope-onafhankelijke) knoop op, of null als de
// entiteit niet bestaat. Resolvers doen GEEN autorisatie; dat doet de
// Orchestrator centraal.
export type ContextResolver = (id: number) => Promise<OpgehaaldeKnoop | null>;

export type ResolverKaart = Record<ContextEntiteitType, ContextResolver>;

// ── Configuratie per entiteit ────────────────────────────────────────────────
//
// `module` = de bevoegdheden-matrix-module die leesrecht bepaalt.
// `gebouwGescoped` = valt de entiteit onder een gebouw (dan geldt magBijGebouw).
export interface EntiteitConfig {
  module: string;
  gebouwGescoped: boolean;
}

export const ENTITEIT_CONFIG: Record<ContextEntiteitType, EntiteitConfig> = {
  gebouw: { module: "gebouwen", gebouwGescoped: true },
  voorziening: { module: "voorzieningen", gebouwGescoped: true },
  onderhoud: { module: "onderhoud", gebouwGescoped: true },
  dossier: { module: "dossiers", gebouwGescoped: true },
  offerte: { module: "offertes", gebouwGescoped: true },
  document: { module: "bibliotheek", gebouwGescoped: false },
  medewerker: { module: "personeel", gebouwGescoped: false },
  klant: { module: "crm", gebouwGescoped: false },
};

// ── Model-slots & tokenbudget ────────────────────────────────────────────────
export type ModelSlot = "fast" | "reasoning" | "vision" | "embedding" | "default";

// ── Resultaat ────────────────────────────────────────────────────────────────
export interface WeggelatenBron {
  type: ContextEntiteitType;
  id: number;
  // "geen-toegang" (autorisatiegrens), "tokenbudget", of "niet-gevonden".
  reden: "geen-toegang" | "tokenbudget" | "niet-gevonden";
  relatie?: string;
}

export interface ContextBundel {
  // Was de wortel-entiteit zelf zichtbaar voor de gebruiker?
  geautoriseerd: boolean;
  // De samengestelde, gebudgetteerde contextbronnen voor de AI.
  contextBronnen: AiContextBron[];
  // Vlakke LogContext-velden (voor de gateway/log).
  logContext: Partial<LogContext>;
  // Weggelaten knopen met reden (autorisatiegrens of budget).
  weggelaten: WeggelatenBron[];
  // Geschatte tokens van de contextbronnen samen.
  tokenSchatting: number;
  // Diepste bereikte graafniveau (wortel = 0).
  diepteBereikt: number;
}

export interface ContextBundelOpties {
  entiteitstype: ContextEntiteitType;
  entiteitId: number;
  scope: ContextScope;
  // Bepaalt het tokenbudget (default "default").
  modelSlot?: ModelSlot;
  // Expliciet tokenbudget dat het slot-budget overschrijft.
  tokenBudget?: number;
  // Maximale graafdiepte (wortel = 0). Standaard 2.
  maxDiepte?: number;
  // Resolvers injecteren (voor tests); standaard de DB-resolvers.
  resolvers?: ResolverKaart;
  // Cache gebruiken (standaard true).
  gebruikCache?: boolean;
}

// Rechten-types voor het centrale autorisatiesysteem van FPS Connect.
// Bewust generiek gehouden zodat nieuwe dimensies zonder refactor worden
// toegevoegd. Geïmporteerd door zowel api-server als firevault (via lib/permissies).

/**
 * Bekende object-types — extensibel: elke string is geldig.
 * De type-union geeft code-completion zonder de evaluatielogica te limiteren.
 */
export type ObjectType =
  | "gebouw"
  | "project"
  | "document"
  | "medewerker"
  | "offerte"
  | "dossier"
  | "onderhoudscontract"
  | (string & Record<never, never>);

/**
 * Een individueel object-recht geladen uit de database.
 * Vertegenwoordigt één rij uit de `object_rechten` tabel.
 */
export interface ObjectRecht {
  id: number;
  objectType: string;
  objectId: number;
  moduleId: string | null;          // null = geldt voor alle modules
  niveau: number;                   // 0–4, identiek aan module-niveaus
  geldigVan: Date | null;           // null = onmiddellijk ingaand
  geldigTot: Date | null;           // null = permanent; ingevuld = tijdelijk recht
  werkmaatschappijId: number | null;
}

/**
 * Volledige autorisatiecontext die de PermissieEngine nodig heeft.
 * Wordt één keer per request geladen en gecached.
 *
 * Huidige dimensies (actief):
 *   bevoegdheden         → module-rechten (0–4 per module)
 *   objectRechten        → per-object grants (incl. tijdgebonden)
 *   toegewezenGebouwIds  → gebouwtoewijzingen (bestaand mechanisme)
 *
 * Toekomstige dimensies (schema klaargezet, logica volgt later):
 *   werkmaatschappijId   → multi-tenant scope
 *   workflowRechten      → statusgebonden toegangsregels
 */
export interface PermissieContext {
  userId: number;
  rol: string;                             // hoofdbeheerder | gebruiker
  bevoegdheden: Record<string, number>;    // module → niveau (0–4)
  objectRechten: ObjectRecht[];
  toegewezenGebouwIds: number[];           // uit gebouw_toewijzingen
  nu: Date;                                // evaluatiemoment
  werkmaatschappijId?: number | null;      // toekomstige tenant-scope
}

// IMPORT_01: importrecht = beheerrecht (niveau 4) op de module waar de
// gegevens thuishoren. Zelfde afleiding als de server (routes/import.ts).
export const IMPORT_MODULES = [
  "crm",
  "magazijn",
  "personeel",
  "gebouwen",
  "calculaties",
  "financieel",
] as const;

export const IMPORT_NIVEAU = 4;

/** Mag deze gebruiker minstens één importtype gebruiken? */
export function magIetsImporteren(heeftNiveau: (module: string, niveau: number) => boolean): boolean {
  return IMPORT_MODULES.some((m) => heeftNiveau(m, IMPORT_NIVEAU));
}

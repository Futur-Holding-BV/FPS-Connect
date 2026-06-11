// Gedeelde definities voor voorziening-types en statussen.
// Coördinaten (locatie_x/y) worden opgeslagen in de PDF-pixelruimte op scale 2,
// identiek aan de web-plattegrond, zodat spots op beide platformen overeenkomen.

export type TypeInfo = { label: string; kleur: string };

// Legacy statische types — voor weergave van records met vrije type-string
export const TYPEN: Record<string, TypeInfo> = {
  branddeur: { kleur: "#ef4444", label: "Branddeur" },
  doorvoering: { kleur: "#f97316", label: "Doorvoering" },
  brandklep: { kleur: "#eab308", label: "Brandklep" },
  kitvoeg: { kleur: "#84cc16", label: "Kitvoeg" },
  manchet: { kleur: "#10b981", label: "Manchet" },
  brandwerend_glas: { kleur: "#3b82f6", label: "Brandwerend glas" },
  coating: { kleur: "#8b5cf6", label: "Coating" },
  luik: { kleur: "#ec4899", label: "Luik" },
  plaatconstructie: { kleur: "#78716c", label: "Plaatconstructie" },
  schuifdeur: { kleur: "#dc2626", label: "Schuifdeur" },
  puiconstructie: { kleur: "#6366f1", label: "Puiconstructie" },
  dakdoorvoer: { kleur: "#14b8a6", label: "Dakdoorvoer" },
};

// Kleur per hoofdcijfer van de applicatie-code (bijv. "1" uit "1.20")
export const CATEGORIE_KLEUREN: Record<string, string> = {
  "1": "#ef4444",
  "2": "#f97316",
  "3": "#eab308",
  "4": "#10b981",
  "5": "#3b82f6",
  "6": "#8b5cf6",
  "7": "#ec4899",
  "8": "#14b8a6",
  "9": "#6366f1",
};

// Kleur op basis van type-code (numeriek "1.20" of legacy string)
export function typeKleur(code: string): string {
  if (TYPEN[code]) return TYPEN[code].kleur;
  const hoofdnr = code.split(".")[0];
  return CATEGORIE_KLEUREN[hoofdnr] ?? "#94a3b8";
}

export const TYPE_VOLGORDE = Object.keys(TYPEN);

export const STATUSKLEUREN: Record<string, string> = {
  goedgekeurd: "#22c55e",
  afgekeurd: "#ef4444",
  in_onderhoud: "#f97316",
  in_uitvoering: "#3b82f6",
  concept: "#94a3b8",
};

export const STATUSLABEL: Record<string, string> = {
  goedgekeurd: "Gereed",
  afgekeurd: "Afgekeurd",
  in_onderhoud: "In onderhoud",
  in_uitvoering: "In uitvoering",
  concept: "Concept",
};

export const STATUS_VOLGORDE = ["in_uitvoering", "goedgekeurd", "afgekeurd", "in_onderhoud", "concept"];

export const CLASSIFICATIE_OPTIES = ["30", "60", "90", "120"];
export const WAND_PLAFOND_OPTIES = ["wand", "plafond"];

export function typeInfo(t: string): TypeInfo {
  if (TYPEN[t]) return TYPEN[t];
  return { kleur: typeKleur(t), label: t };
}

export function statusKleur(s: string): string {
  return STATUSKLEUREN[s] ?? "#94a3b8";
}

export function statusLabel(s: string): string {
  return STATUSLABEL[s] ?? s;
}

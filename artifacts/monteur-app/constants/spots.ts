// Gedeelde definities voor voorziening-types en statussen.
// Coördinaten (locatie_x/y) worden opgeslagen in de PDF-pixelruimte op scale 2,
// identiek aan de web-plattegrond, zodat spots op beide platformen overeenkomen.

export type TypeInfo = { label: string; kleur: string };

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

export const TYPE_VOLGORDE = Object.keys(TYPEN);

export const STATUSKLEUREN: Record<string, string> = {
  goedgekeurd: "#22c55e",
  afgekeurd: "#ef4444",
  in_onderhoud: "#f97316",
  in_uitvoering: "#3b82f6",
  concept: "#94a3b8",
};

export const STATUSLABEL: Record<string, string> = {
  goedgekeurd: "Goedgekeurd",
  afgekeurd: "Afgekeurd",
  in_onderhoud: "In onderhoud",
  in_uitvoering: "In uitvoering",
  concept: "Concept",
};

export const STATUS_VOLGORDE = ["in_uitvoering", "goedgekeurd", "afgekeurd", "in_onderhoud", "concept"];

export const CLASSIFICATIE_OPTIES = ["30", "60", "90", "120"];
export const WBDBO_OPTIES = ["20", "30", "60"];
export const WRD_OPTIES = ["30"];
export const WAND_PLAFOND_OPTIES = ["wand", "plafond"];

export function typeInfo(t: string): TypeInfo {
  return TYPEN[t] ?? { kleur: "#94a3b8", label: t };
}

export function statusKleur(s: string): string {
  return STATUSKLEUREN[s] ?? "#94a3b8";
}

export function statusLabel(s: string): string {
  return STATUSLABEL[s] ?? s;
}

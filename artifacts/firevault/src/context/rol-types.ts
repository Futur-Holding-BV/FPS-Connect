export type Rol = "hoofdbeheerder" | "beheerder" | "monteur" | "controleur" | "klant";

export const ROL_INFO: Record<Rol, { label: string; omschrijving: string; kleur: string }> = {
  hoofdbeheerder: { label: "Hoofdbeheerder", omschrijving: "Volledig beheer — alle rechten", kleur: "text-primary" },
  beheerder:  { label: "Beheerder",  omschrijving: "FPS Brandpreventie — volledige toegang",     kleur: "text-primary" },
  monteur:    { label: "Monteur",    omschrijving: "Veldmedewerker — werkbonnen en inspecties",   kleur: "text-blue-600" },
  controleur: { label: "Controleur", omschrijving: "Veldmedewerker — inspecties en kwaliteit",   kleur: "text-purple-600" },
  klant:      { label: "Klant",      omschrijving: "Gebouwbeheerder — rapportages en meldingen",  kleur: "text-gray-700" },
};

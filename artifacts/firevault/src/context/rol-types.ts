export type Rol = "hoofdbeheerder" | "gebruiker" | "klant";

export const ROL_INFO: Record<Rol, { label: string; omschrijving: string; kleur: string }> = {
  hoofdbeheerder: { label: "Hoofdbeheerder", omschrijving: "Volledig beheer — alle rechten",      kleur: "text-primary" },
  gebruiker:      { label: "Gebruiker",       omschrijving: "Matrix-gestuurde toegang",            kleur: "text-blue-600" },
  klant:      { label: "Klant",      omschrijving: "Gebouwbeheerder — rapportages en meldingen",  kleur: "text-gray-700" },
};

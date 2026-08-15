export type Rol = "hoofdbeheerder" | "gebruiker";

export const ROL_INFO: Record<Rol, { label: string; omschrijving: string; kleur: string }> = {
  hoofdbeheerder: { label: "Hoofdbeheerder", omschrijving: "Volledig beheer — alle rechten",      kleur: "text-primary" },
  gebruiker:      { label: "Gebruiker",       omschrijving: "Matrix-gestuurde toegang",            kleur: "text-blue-600" },
};

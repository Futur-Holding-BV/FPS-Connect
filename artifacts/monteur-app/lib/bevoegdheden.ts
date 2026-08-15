// APP_01 §3 — bevoegdheden-check voor de UI. De niveaus komen 1-op-1 van de
// server (effectieve bevoegdheden bij login / verversing); hier wordt NIETS
// zelf berekend of gecombineerd. De backend blijft de echte poortwachter —
// dit bepaalt alleen wat er getoond wordt.
import type { Gebruiker } from "@/context/auth";

export type Vereiste = { module: string; niveau: number } | "basis";

export function heeftBevoegdheid(
  gebruiker: Gebruiker | null,
  vereiste: Vereiste,
): boolean {
  if (!gebruiker) return false;
  if (vereiste === "basis") return true; // eigen gegevens = basisrecht (§4)
  if (gebruiker.rol === "hoofdbeheerder") return true;
  return (gebruiker.bevoegdheden?.[vereiste.module] ?? 0) >= vereiste.niveau;
}

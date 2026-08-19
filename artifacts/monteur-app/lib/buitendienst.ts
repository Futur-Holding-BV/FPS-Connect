/**
 * Buitendienst-hulpfuncties voor de monteur-app.
 *
 * GEBRUIKERS_01 v2: de server bepaalt `is_uitvoerend_veld` op basis van de
 * uitvoerend-vlag van de functie (niet van een hardcoded titellijst).
 * De auth-payload (login én auth/me) bevat deze vlag altijd.
 * Lokale fallback-lijsten zijn verwijderd: ontbrekende vlag = false.
 */

export function isUitvoerendVeld(gebruiker: {
  rol?: string | null;
  is_uitvoerend_veld?: boolean | null;
}): boolean {
  if (!gebruiker) return false;
  // Server-vlag is de enige bron; ontbrekend = false (niet uitvoerend).
  return gebruiker.is_uitvoerend_veld === true;
}

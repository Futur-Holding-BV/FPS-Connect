/**
 * Buitendienst-hulpfuncties voor de monteur-app.
 *
 * ENIGE BRON VAN WAARHEID: de server berekent `is_uitvoerend_veld` in
 * mapAuthGebruiker (api-server/src/routes/auth.ts) op basis van de
 * uitvoerende functietitellijst. De auth-payload (login én auth/me) bevat
 * deze vlag. Gebruik altijd die server-vlag; de lokale functietitels dienen
 * uitsluitend als fallback voor gecachte gebruikers die vóór de upgrade zijn
 * opgeslagen en de vlag nog niet kennen.
 */

/** Fallback-lijst — houd synchroon met UITVOERENDE_FUNCTIES_AUTH in auth.ts. */
export const UITVOERENDE_FUNCTIES = [
  "Monteur",
  "Timmerman",
  "Uitvoerder",
  "Onderhoudsmonteur",
];

export function isUitvoerendVeld(gebruiker: {
  rol?: string | null;
  functietitels?: string[] | null;
  is_uitvoerend_veld?: boolean | null;
}): boolean {
  if (!gebruiker) return false;
  // Gebruik de server-berekende vlag wanneer aanwezig (primaire bron).
  if (typeof gebruiker.is_uitvoerend_veld === "boolean") {
    return gebruiker.is_uitvoerend_veld;
  }
  // Fallback: lokale berekening voor gecachte gebruikers zonder vlag.
  if (gebruiker.rol === "hoofdbeheerder") return false;
  const titels = gebruiker.functietitels ?? [];
  return (
    titels.length > 0 && titels.every((f) => UITVOERENDE_FUNCTIES.includes(f))
  );
}

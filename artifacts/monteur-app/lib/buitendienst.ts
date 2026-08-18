// Zelfde definitie als in de web-app (artifacts/firevault/src/routes/
// connect-routes.tsx): iemand is "uitvoerend veld" (buitendienst) wanneer hij
// géén hoofdbeheerder is en al zijn functietitels in de uitvoerende lijst
// vallen. Deze lijst moet synchroon blijven met de web-app.
export const UITVOERENDE_FUNCTIES = [
  "Monteur",
  "Timmerman",
  "Uitvoerder",
  "Onderhoudsmonteur",
];

export function isUitvoerendVeld(gebruiker: {
  rol?: string | null;
  functietitels?: string[] | null;
}): boolean {
  if (!gebruiker) return false;
  if (gebruiker.rol === "hoofdbeheerder") return false;
  const titels = gebruiker.functietitels ?? [];
  return (
    titels.length > 0 && titels.every((f) => UITVOERENDE_FUNCTIES.includes(f))
  );
}

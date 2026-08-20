// Eenmalige SPA-overdracht van Slim Upload naar de gekozen calculatie. Het
// bestand wordt pas opgeslagen nadat de gebruiker die concrete bestemming heeft
// bevestigd. Lezen wist de stash om hergebruik bij een andere calculatie te
// voorkomen.
let gestashtBestand: File | null = null;

export function stashAdviesrapportBestand(bestand: File): void {
  gestashtBestand = bestand;
}

export function leesEnWisAdviesrapportBestand(): File | null {
  const bestand = gestashtBestand;
  gestashtBestand = null;
  return bestand;
}
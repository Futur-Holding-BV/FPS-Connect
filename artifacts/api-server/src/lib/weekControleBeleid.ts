export interface WeekControleKandidaat {
  functieUitvoerend?: boolean | null;
}

/**
 * Volledige-weekverantwoording geldt uitsluitend voor buitendienstmedewerkers.
 * De functiecatalogus is daarbij leidend: alleen expliciet `uitvoerend=true`
 * wordt meegenomen. Een kantoorfunctie of ontbrekende classificatie valt
 * bewust buiten de bewaking.
 */
export function selecteerBuitendienstVoorWeekcontrole<T extends WeekControleKandidaat>(
  kandidaten: readonly T[],
): T[] {
  return kandidaten.filter((kandidaat) => kandidaat.functieUitvoerend === true);
}
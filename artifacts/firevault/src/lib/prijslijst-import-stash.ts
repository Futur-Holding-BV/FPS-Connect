// PRIJS_01 §4 — eenmalige overdracht van een prijslijst-bestand van Slim Upload
// naar de importpagina (/beheer/import). De File gaat rechtstreeks naar de
// gerichte importstroom en wordt niet als algemeen document gearchiveerd.
// In-memory (geen sessionStorage) omdat een File niet serialiseerbaar is;
// SPA-navigatie houdt deze module in leven. Bij lezen wordt de stash gewist zodat
// een oud bestand nooit per ongeluk bij een volgende import opduikt.

let gestashtBestand: File | null = null;

export function stashPrijslijstBestand(bestand: File): void {
  gestashtBestand = bestand;
}

export function leesEnWisPrijslijstBestand(): File | null {
  const b = gestashtBestand;
  gestashtBestand = null;
  return b;
}

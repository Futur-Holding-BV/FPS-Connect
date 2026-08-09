// PRIJS_01 §4 — eenmalige overdracht van een prijslijst-bestand van Slim Upload
// naar de importpagina (/beheer/import). Het bestand is al gearchiveerd in de
// bibliotheek; hier wordt de File in-memory doorgegeven zodat de importpagina de
// prijzen kan analyseren zonder dat de gebruiker het bestand opnieuw hoeft te
// kiezen. In-memory (geen sessionStorage) omdat een File niet serialiseerbaar is;
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

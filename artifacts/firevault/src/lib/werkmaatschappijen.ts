// Werkmaatschappijen binnen de FPS Groep en hun standaard-CAO.
//
// BRON VAN WAARHEID: de werkgevers-tabel via GET /werkgevers (naam + cao per
// rij; cao komt exact overeen met CAO_OPTIES in de api-server). Componenten
// gebruiken de hook useWerkmaatschappijen() zodat een nieuw aangemaakte
// werkmaatschappij overal direct in de keuzelijsten verschijnt.
//
// De statische lijst hieronder is uitsluitend een fallback voor de eerste
// render (voordat de API-respons binnen is) en voor module-level defaults.
import { useListWerkgevers } from "@workspace/api-client-react";

export const WERKMAATSCHAPPIJEN = [
  "FPS Brandpreventie",
  "FPS Bouw",
  "FPS Bouw & Renovatie",
  "FPS Onderhoud",
] as const;

export type Werkmaatschappij = (typeof WERKMAATSCHAPPIJEN)[number];

const CAO_PER_WERKMAATSCHAPPIJ: Record<string, string> = {
  "FPS Brandpreventie": "Metaal & Techniek",
  "FPS Bouw": "Metaal & Techniek",
  "FPS Bouw & Renovatie": "Bouw & Infra",
  "FPS Onderhoud": "Metaal & Techniek",
};

// Geeft de standaard-CAO voor een werkmaatschappij, of undefined als die niet bekend is.
export function caoVoorWerkmaatschappij(
  werkmaatschappij: string | null | undefined,
): string | undefined {
  if (!werkmaatschappij) return undefined;
  return CAO_PER_WERKMAATSCHAPPIJ[werkmaatschappij];
}

// Keuzelijst voor werkmaatschappij. Een bestaande (afwijkende) waarde wordt vooraan
// toegevoegd zodat een Select-veld nooit een opgeslagen waarde verbergt.
export function werkmaatschappijOpties(huidige?: string | null): string[] {
  const opties: string[] = [...WERKMAATSCHAPPIJEN];
  if (huidige && !opties.includes(huidige)) return [huidige, ...opties];
  return opties;
}

// Hook-variant: werkmaatschappijen én CAO-voorselectie live uit de
// werkgevers-API (alleen actieve). Valt terug op de statische lijst zolang
// de API-respons nog niet binnen is. Retourneert dezelfde vormen als de
// statische helpers, zodat call-sites ze 1-op-1 kunnen vervangen (of via
// shadowing binnen een component).
export function useWerkmaatschappijen() {
  const { data: werkgevers } = useListWerkgevers();
  // Fallback alleen zolang de query nog geen data heeft; een geslaagde maar
  // lege respons (geen actieve werkgevers) levert bewust een lege lijst.
  const namen: string[] =
    werkgevers === undefined
      ? [...WERKMAATSCHAPPIJEN]
      : werkgevers.filter((w) => w.actief).map((w) => w.naam);
  const actieve = (werkgevers ?? []).filter((w) => w.actief);
  const caoVoor = (werkmaatschappij: string | null | undefined): string | undefined => {
    if (!werkmaatschappij) return undefined;
    const rij = actieve.find((w) => w.naam === werkmaatschappij);
    return rij?.cao ?? CAO_PER_WERKMAATSCHAPPIJ[werkmaatschappij];
  };
  const opties = (huidige?: string | null): string[] =>
    huidige && !namen.includes(huidige) ? [huidige, ...namen] : namen;
  return { namen, caoVoor, opties };
}

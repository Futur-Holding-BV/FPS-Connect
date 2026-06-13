// Werkmaatschappijen binnen de FPS Groep en hun standaard-CAO. De CAO-naam komt
// exact overeen met CAO_OPTIES.naam in de api-server (artifacts/api-server/src/routes/hrm.ts),
// zodat een voorgeselecteerde CAO altijd een geldige optie is.
//
// Wanneer een medewerker aan een werkmaatschappij wordt gekoppeld, wordt de
// bijbehorende CAO automatisch voorgeselecteerd (de gebruiker kan dit overschrijven).

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

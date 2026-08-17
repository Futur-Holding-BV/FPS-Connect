/**
 * Client-side hulpfunctie: voegt een AI-voorstel samen met de huidige
 * formulierstaat zonder handmatige invoer te overschrijven.
 *
 * Regels (touched-field precedentie):
 * - Een veld dat de gebruiker zelf heeft aangeraakt (in `aangeraakteVelden`)
 *   wordt NOOIT overschreven door de AI, ook niet als de AI een niet-lege
 *   waarde teruggeeft.
 * - Een veld dat de gebruiker NIET heeft aangeraakt krijgt de AI-waarde als die
 *   niet-leeg/niet-null is; anders blijft de beginwaarde staan.
 * - `staat_indicatie` → `opmerkingen`: zelfde logica, met prefix "Staat bij
 *   registratie: " als de AI een niet-lege staat meldt.
 *
 * Waarom touched-field tracking en niet waarde-vergelijking:
 * Het formulier initialiseert boolean-velden (met_snoer, keuringsplichtig …)
 * en tekstvelden (categorie, aandrijving) met niet-null defaults. Zonder
 * bijhouding van welke velden de gebruiker zelf heeft gewijzigd, is een
 * standaardwaarde ononderscheidbaar van handmatige invoer.
 */
export interface GereedschapAiVoorstel {
  omschrijving?: string | null;
  merk?: string | null;
  type?: string | null;
  categorie?: string | null;
  aandrijving?: string | null;
  met_snoer?: boolean | null;
  accu_inbegrepen?: boolean | null;
  lader_inbegrepen?: boolean | null;
  koffer_inbegrepen?: boolean | null;
  keuringsplichtig?: boolean | null;
  staat_indicatie?: string | null;
}

export interface GereedschapFormulier {
  omschrijving: string | null;
  merk: string | null;
  type: string | null;
  categorie: string | null;
  aandrijving: string | null;
  met_snoer: boolean | null;
  accu_inbegrepen: boolean | null;
  lader_inbegrepen: boolean | null;
  koffer_inbegrepen: boolean | null;
  keuringsplichtig: boolean | null;
  opmerkingen: string | null;
  [key: string]: unknown;
}

/**
 * Geeft een nieuw formulierobject terug waarbij handmatig aangeraakte velden
 * nooit worden overschreven door de AI, ongeacht of de AI-waarde niet-leeg is.
 *
 * @param huidig          Huidige formulierstaat
 * @param voorstel        AI-voorstel (null/undefined-velden worden overgeslagen)
 * @param aangeraakteVelden Veldnamen die de gebruiker zelf heeft gewijzigd
 */
/**
 * Controleert of een lopend AI-analyseverzoek nog actueel is.
 * Wordt gebruikt om late AI-responses te negeren wanneer het formulier al is
 * gereset (dialog gesloten, nieuw verzoek gestart) voordat de respons terugkwam.
 *
 * Gebruik: leg het verzoek-ID vast bij aanvang van de async aanroep; verhoog de
 * teller in sluitEnReset() en bij een nieuw fotoselect; vergelijk na de await.
 */
export function isAnalyseVerzoekActueel(vastgelegdId: number, huidigId: number): boolean {
  return vastgelegdId === huidigId;
}

export function pasVoorstelToeOpFormulier(
  huidig: GereedschapFormulier,
  voorstel: GereedschapAiVoorstel,
  aangeraakteVelden: ReadonlySet<string> = new Set(),
): GereedschapFormulier {
  /** Pas een tekstveld aan: alleen als niet aangeraakt én AI geeft een niet-lege waarde. */
  function vulTekst(
    veldnaam: string,
    bestaand: string | null,
    ai: string | null | undefined,
  ): string | null {
    if (aangeraakteVelden.has(veldnaam)) return bestaand;
    return ai?.trim() || bestaand;
  }

  /** Pas een boolean-veld aan: alleen als niet aangeraakt én AI geeft een echte boolean. */
  function vulBool(
    veldnaam: string,
    bestaand: boolean | null,
    ai: boolean | null | undefined,
  ): boolean | null {
    if (aangeraakteVelden.has(veldnaam)) return bestaand;
    return ai ?? bestaand;
  }

  const aiOpmerkingen =
    voorstel.staat_indicatie?.trim()
      ? `Staat bij registratie: ${voorstel.staat_indicatie.trim()}`
      : null;

  return {
    ...huidig,
    omschrijving: vulTekst("omschrijving", huidig.omschrijving, voorstel.omschrijving),
    merk: vulTekst("merk", huidig.merk, voorstel.merk),
    type: vulTekst("type", huidig.type, voorstel.type),
    categorie: vulTekst("categorie", huidig.categorie, voorstel.categorie),
    aandrijving: vulTekst("aandrijving", huidig.aandrijving, voorstel.aandrijving),
    met_snoer: vulBool("met_snoer", huidig.met_snoer, voorstel.met_snoer),
    accu_inbegrepen: vulBool("accu_inbegrepen", huidig.accu_inbegrepen, voorstel.accu_inbegrepen),
    lader_inbegrepen: vulBool("lader_inbegrepen", huidig.lader_inbegrepen, voorstel.lader_inbegrepen),
    koffer_inbegrepen: vulBool("koffer_inbegrepen", huidig.koffer_inbegrepen, voorstel.koffer_inbegrepen),
    keuringsplichtig: vulBool("keuringsplichtig", huidig.keuringsplichtig, voorstel.keuringsplichtig),
    opmerkingen: vulTekst("opmerkingen", huidig.opmerkingen, aiOpmerkingen),
  };
}

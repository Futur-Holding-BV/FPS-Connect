/**
 * PANEEL_01 — Paneelgeschiktheid van interne portaalschermen.
 *
 * De lijst hieronder is één-op-één overgenomen uit de meting
 *   docs/metingen/PANEEL_01_paneelgeschiktheid.md
 * (§ "Machineleesbare lijst", export const PANEEL_GESCHIKTE_PADEN).
 *
 * Zie dat document voor de classificatieregels en de per-scherm-reden.
 * Wijzig deze lijst niet zonder de meting bij te werken; ze horen bij elkaar.
 *
 * Een pad dat NIET in deze lijst voorkomt is niet-paneelgeschikt en wordt
 * volgens PANEEL_01 §4.2 over de volle breedte in het hoofdvenster geopend
 * (niet verminkt in een smalle baan).
 */

// Paneelgeschikte wouter-padpatronen (exact zoals in
// artifacts/firevault/src/App.tsx, ConnectPortal, regels 333–621).
export const PANEEL_GESCHIKTE_PADEN: string[] = [
  "/",
  "/gebouwen",
  "/gebouwen/:id",
  "/voorzieningen",
  "/voorzieningen/nieuw",
  "/voorzieningen/:id/qr",
  "/voorzieningen/:id",
  "/inspecties",
  "/inspecties/:id",
  "/opname",
  "/opname/:id",
  "/modules/calculatie/nieuw",
  "/modules/calculatie/import",
  "/modules/calculatie/:id",
  "/modules/calculatie",
  "/rapporten",
  "/inkoop/overzicht",
  "/algemene-inkoop",
  "/onderhoud/contracten/:id",
  "/onderhoud/werkbonnen/:id",
  "/onderhoud/:rest*",
  "/onderhoud",
  "/offertes",
  "/opdrachten/:id",
  "/werkvoorbereiding",
  "/regie",
  "/regie/:id",
  "/documenten",
  "/dossiers",
  "/veiligheid/toolboxen",
  "/veiligheid/lmra",
  "/veiligheid/meldingen",
  "/veiligheid/incidenten",
  "/veiligheid/pbm",
  "/veiligheid/toolbox-compliance",
  "/snagstream",
  "/snagstream/:id",
  "/facturen/klaar-voor-export",
  "/facturen/:id",
  "/facturen",
  "/salarisarchief/batch/:id",
  "/salarisarchief",
  "/sepa-bestanden",
  "/salaris-mutaties",
  "/scab-mail",
  "/loon-output",
  "/boekhouder",
  "/berichten",
  "/toolbox",
  "/crm/organisaties",
  "/crm/aanvragen",
  "/crm/projectkansen",
  "/crm/concurrenten",
  "/crm/marktintelligentie",
  "/crm/contactpersonen",
  "/crm/taken",
  "/crm/relatievoorstellen",
  "/crm/kennisbibliotheek",
  "/crm/:id",
  "/crm",
  "/werk-inbox",
  "/assistent",
  "/workflow",
  "/personeel/verlof",
  "/personeel/verlof-instellingen",
  "/beheer/indirecte-werkzaamheden",
  "/personeel/jaarafsluiting",
  "/personeel/onboarden",
  "/personeel/integriteitstools",
  "/personeel/uitboarden",
  "/personeel/oud-medewerkers",
  "/personeel/externen",
  "/personeel/uitzendbureaus",
  "/personeel/contracten",
  "/personeel/:id",
  "/personeel",
  "/gereedschappen",
  "/gereedschappen/:id",
  "/wagenpark",
  "/wagenpark/brandstof-import",
  "/wagenpark/meldingen",
  "/wagenpark/buiten-werktijd",
  "/wagenpark/documentsoorten",
  "/wagenpark/nieuw",
  "/wagenpark/:id/bewerken",
  "/wagenpark/:id",
  "/magazijn",
  "/magazijn/artikelen",
  "/magazijn/artikelen/:id/label",
  "/magazijn/artikelen/:id",
  "/magazijn/locaties",
  "/magazijn/voorraad",
  "/magazijn/stellingscans",
  "/magazijn/mutaties",
  "/magazijn/reserveringen",
  "/magazijn/uitgiftes",
  "/magazijn/retouren",
  "/magazijn/inkooporders",
  "/magazijn/inkooporders/:id",
  "/magazijn/picklijsten",
  "/magazijn/picklijsten/:id",
  "/magazijn/voorraadwaarde",
  "/financieel/crediteuren",
  "/financieel/onderhanden-werk",
  "/organisatie/autopark",
  "/organisatie/verzekeringen",
  "/organisatie/bedrijfsgegevens",
  "/organisatie/jaarverslagen",
  "/organisatie/bedrijfsdocumenten",
  "/uren",
  "/hall-of-fame",
  "/leveranciers",
  "/leveranciers/:id",
  "/artikelen",
  "/gebruikers",
  "/abonnementen",
  "/beheer/toepassingen",
  "/beheer/bibliotheek",
  "/beheer/login-pogingen",
  "/beheer/helpdesk",
  "/beheer/feedback",
  "/beheer/visual-library",
  "/beheer/profielen",
  "/beheer/goedkeuringsbeleid",
  "/beheer/biae",
  "/declaraties/:id",
  "/declaraties",
  "/beheer/object-rechten",
  "/organisatie/documentopmaak",
  "/organisatie/werkmaatschappijen",
  "/beheer/spotconfiguratie",
  "/beheer/visuals",
  "/beheer/mail",
  "/beheer/mailboxen",
  "/beheer/backup",
  "/beheer/import",
  "/beheer/go-live",
  "/beheer/meldingen",
  "/beheer/projectstatus",
  "/beheer/pwa-test",
  "/instellingen",
  "/beheer/security-intake",
  "/beheer/systeemstatus",
  "/release-notes",
  "/beheer/privacy",
  "/beheer/avg",
  "/beheer/gebouwen-archief",
  "/mijn/privacy",
  "/mijn/salarisdocumenten",
  "/one/dashboard",
  "/one/gebouwen/:id",
  "/one/gebouwen",
  "/one/documenten",
  "/one/rapporten",
  "/one/abonnementen",
  "/one/adviescentrum",
  "/info",
];

/**
 * Zet een wouter-padpatroon (bv. "/gebouwen/:id" of "/onderhoud/:rest*") om
 * naar een reguliere expressie die tegen een concreet pad matcht.
 *  - ":naam"   → één padsegment (geen "/")
 *  - ":naam*"  → nul of meer segmenten (mag "/" bevatten, incl. leeg)
 */
function patroonNaarRegex(patroon: string): RegExp {
  // Escape reguliere-expressie-metatekens buiten de parameters.
  const bron = patroon
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        // ":rest*" — greedy rest-matcher (nul of meer segmenten)
        if (segment.endsWith("*")) return "?(.*)";
        // ":id" — precies één segment
        return "[^/]+";
      }
      // gewoon segment — escape metatekens
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  // Een rest-patroon plakt "/?(.*)" achteraan; we normaliseren dubbele slash.
  const genormaliseerd = bron.replace(/\/\?\(\.\*\)/g, "(?:/.*)?");
  return new RegExp(`^${genormaliseerd}/?$`);
}

// Vooraf gecompileerde matchers — één keer opbouwen, vaak gebruiken.
const GESCHIKTE_MATCHERS: RegExp[] = PANEEL_GESCHIKTE_PADEN.map(patroonNaarRegex);

/**
 * Bepaalt of een concreet pad (bv. "/gebouwen/42") paneelgeschikt is.
 * Querystring en hash worden genegeerd.
 */
export function isPaneelGeschikt(pad: string): boolean {
  const schoon = normaliseerPad(pad);
  return GESCHIKTE_MATCHERS.some((re) => re.test(schoon));
}

/**
 * Normaliseert een pad voor vergelijking tussen banen (§4.3 "twee keer
 * hetzelfde"): verwijdert query/hash en een eventuele trailing slash
 * (behalve voor de root "/").
 */
export function normaliseerPad(pad: string): string {
  let p = pad.split("?")[0].split("#")[0];
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

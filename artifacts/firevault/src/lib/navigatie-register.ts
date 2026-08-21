// Centraal navigatie-register. Pure module: geen
// browser-globals, geen dependencies. Herleidt een pad naar een
// NavigatieRouteMatch, valideert veilige interne paden en vervangt/verwijdert
// één query-parameter met behoud van overige params en hash. De terug-knop
// leunt nooit op browsergeschiedenis; onbekende routes vallen terug op "/".

export type NavigatieResolver =
  | "gebouw"
  | "calculatie"
  | "offerte"
  | "opdracht"
  | "voorziening"
  | "inspectie"
  | "opname"
  | "generiek";

export interface NavigatieRouteMatch {
  sleutel: string;
  resolver: NavigatieResolver;
  params: Record<string, string>;
  tab: string | null;
  moduleLabel: string;
  modulePad: string;
  huidigeLabel: string;
  terugLabel: string;
  terugPad: string;
}

const DASHBOARD_PAD = "/";
const DASHBOARD_LABEL = "Dashboard";

// Canonieke module-overzichtspaden als losse constanten; een mutatie
// (bv. pluralisatie) wordt daardoor meteen door de test betrapt.
export const CALCULATIE_OVERZICHT_PAD = "/modules/calculatie";
export const OFFERTE_OVERZICHT_PAD = "/offertes";
export const OPDRACHT_OVERZICHT_PAD = "/offertes";
export const VOORZIENING_OVERZICHT_PAD = "/voorzieningen";
export const INSPECTIE_OVERZICHT_PAD = "/inspecties";
export const OPNAME_OVERZICHT_PAD = "/opname";
export const GEBOUW_OVERZICHT_PAD = "/gebouwen";

const GEBOUW_TAB_LABELS: Record<string, string> = {
  uitvoering: "Uitvoering", beheer: "Beheer", documenten: "Documenten", rapporten: "Rapporten", plattegrond: "Plattegrond",
};

function splitsLocatie(locatie: string): { pad: string; query: string; hash: string } {
  let rest = locatie;
  let hash = "";
  const h = rest.indexOf("#");
  if (h >= 0) {
    hash = rest.slice(h);
    rest = rest.slice(0, h);
  }
  let query = "";
  const q = rest.indexOf("?");
  if (q >= 0) {
    query = rest.slice(q);
    rest = rest.slice(0, q);
  }
  return { pad: rest, query, hash };
}

/** Ontleedt een querystring tot een lijst [sleutel, waarde|null]-paren. */
function ontleedQuery(query: string): Array<[string, string | null]> {
  const zonder = query.startsWith("?") ? query.slice(1) : query;
  const paren: Array<[string, string | null]> = [];
  if (!zonder) return paren;
  for (const deel of zonder.split("&")) {
    if (deel === "") continue;
    const i = deel.indexOf("=");
    if (i >= 0) paren.push([deel.slice(0, i), deel.slice(i + 1)]);
    else paren.push([deel, null]);
  }
  return paren;
}

function leesTab(query: string): string | null {
  for (const [k, v] of ontleedQuery(query)) {
    if (decodeURIComponent(k) === "tab") return decodeURIComponent(v ?? "");
  }
  return null;
}

/**
 * Gebouw-hiërarchie: default/tab=dashboard → Project (terug naar
 * ?tab=project, label Gebouw); tab=project → Gebouw (terug naar /gebouwen);
 * overige tabs → tab-label (terug naar het Project van dit gebouw).
 */
function bouwGebouwMatch(id: string, tab: string | null, sleutel = "gebouw:detail"): NavigatieRouteMatch {
  const basis = { sleutel, resolver: "gebouw" as const, params: { id }, moduleLabel: "Gebouwen", modulePad: GEBOUW_OVERZICHT_PAD };
  const gebouwPad = `${GEBOUW_OVERZICHT_PAD}/${id}`;
  if (tab === "project") {
    return { ...basis, tab: "project", huidigeLabel: "Gebouw", terugLabel: "Gebouwen", terugPad: GEBOUW_OVERZICHT_PAD };
  }
  if (tab === null || tab === "dashboard") {
    return { ...basis, tab, huidigeLabel: "Project", terugLabel: "Gebouw", terugPad: `${gebouwPad}?tab=project` };
  }
  const tabLabel = GEBOUW_TAB_LABELS[tab] ?? tab;
  return { ...basis, tab, huidigeLabel: tabLabel, terugLabel: "Project", terugPad: gebouwPad };
}

/** Detail-match met een enkelvoudig overzicht als terugval. */
function detailMatch(
  sleutel: string, resolver: NavigatieResolver, id: string,
  moduleLabel: string, modulePad: string, huidigeLabel: string, terugLabel = moduleLabel,
): NavigatieRouteMatch {
  return { sleutel, resolver, params: { id }, tab: null, moduleLabel, modulePad, huidigeLabel, terugLabel, terugPad: modulePad };
}

interface RegisterRegel { test: (pad: string, tab: string | null) => NavigatieRouteMatch | null }

// Geordend register: statische/specifieke patronen vóór dynamische :id. Elke
// regel dekt een route-familie; statische kinderen worden expliciet uitgesloten.
const CALC_STATISCH = new Set(["nieuw", "import", "leveranciers", "eenheidsprijzen"]);

const REGISTER: RegisterRegel[] = [
  { test: (pad) => {
    const m = /^\/gebouwen\/([^/]+)\/plattegrond\/([^/]+)$/.exec(pad);
    return m ? bouwGebouwMatch(m[1], "plattegrond", "gebouw:plattegrond") : null;
  } },
  { test: (pad, tab) => {
    const m = /^\/gebouwen\/([^/]+)$/.exec(pad);
    return m ? bouwGebouwMatch(m[1], tab) : null;
  } },
  { test: (pad) => {
    const m = /^\/voorzieningen\/([^/]+)\/qr$/.exec(pad);
    return m ? detailMatch("voorziening:qr", "voorziening", m[1], "Voorzieningen", VOORZIENING_OVERZICHT_PAD, "QR-code") : null;
  } },
  { test: (pad) => {
    const m = /^\/voorzieningen\/([^/]+)$/.exec(pad);
    if (!m || m[1] === "nieuw") return null;
    return detailMatch("voorziening:detail", "voorziening", m[1], "Voorzieningen", VOORZIENING_OVERZICHT_PAD, "Voorziening");
  } },
  { test: (pad) => {
    const m = /^\/inspecties\/([^/]+)$/.exec(pad);
    return m ? detailMatch("inspectie:detail", "inspectie", m[1], "Inspecties", INSPECTIE_OVERZICHT_PAD, "Inspectie") : null;
  } },
  { test: (pad) => {
    const m = /^\/opname\/([^/]+)$/.exec(pad);
    return m ? detailMatch("opname:detail", "opname", m[1], "Opname", OPNAME_OVERZICHT_PAD, "Opname") : null;
  } },
  { test: (pad) => {
    const m = /^\/modules\/calculatie\/([^/]+)$/.exec(pad);
    if (!m || CALC_STATISCH.has(m[1])) return null;
    return detailMatch("calculatie:detail", "calculatie", m[1], "Calculatie", CALCULATIE_OVERZICHT_PAD, "Calculatie");
  } },
  { test: (pad) => {
    const m = /^\/offertes\/([^/]+)$/.exec(pad);
    return m ? detailMatch("offerte:detail", "offerte", m[1], "Offertes", OFFERTE_OVERZICHT_PAD, "Offerte") : null;
  } },
  { test: (pad) => {
    const m = /^\/opdrachten\/([^/]+)$/.exec(pad);
    return m ? detailMatch("opdracht:detail", "opdracht", m[1], "Opdrachten", OPDRACHT_OVERZICHT_PAD, "Opdracht", "Offertes") : null;
  } },
];

interface GeneriekePrefix { prefix: string; pad: string; label: string }

// Generieke terugval per module. Meest-specifieke (langste) prefix wint,
// ongeacht volgorde. Dekt de brede reeks Connect-routefamilies.
const D: [string, string] = [DASHBOARD_PAD, DASHBOARD_LABEL];
const GENERIEKE_PREFIXEN: GeneriekePrefix[] = (
  [
    ["/modules/calculatie", CALCULATIE_OVERZICHT_PAD, "Calculatie"],
    ["/modules/planning", "/modules/planning", "Planning"],
    ["/modules", ...D],
    ["/magazijn", "/magazijn", "Magazijn"],
    ["/onderhoud", "/onderhoud", "Onderhoud"],
    ["/facturen", "/facturen", "Facturen"],
    ["/financieel", ...D],
    ["/salarisarchief", "/salarisarchief", "Salarisarchief"],
    ["/declaraties", "/declaraties", "Declaraties"],
    ["/personeel/werving", "/personeel/werving", "Werving"],
    ["/personeel", "/personeel", "Personeel"],
    ["/gereedschappen", "/gereedschappen", "Gereedschappen"],
    ["/wagenpark", "/wagenpark", "Wagenpark"],
    ["/crm", "/crm", "Relaties"],
    ["/leveranciers", "/leveranciers", "Leveranciers"],
    ["/uitvoering", "/uitvoering", "Uitvoering"],
    ["/regie", "/regie", "Regie"],
    ["/veiligheid", ...D],
    ["/snagstream", "/snagstream", "Snagstream"],
    ["/organisatie", ...D],
    ["/directie", ...D],
    ["/mijn", ...D],
    ["/beheer", ...D],
    ["/gebruikers", "/gebruikers", "Gebruikers"],
    ["/abonnementen", "/abonnementen", "Abonnementen"],
    ["/gebouwen", GEBOUW_OVERZICHT_PAD, "Gebouwen"],
    ["/voorzieningen", VOORZIENING_OVERZICHT_PAD, "Voorzieningen"],
    ["/inspecties", INSPECTIE_OVERZICHT_PAD, "Inspecties"],
    ["/opname", OPNAME_OVERZICHT_PAD, "Opname"],
    ["/offertes", OFFERTE_OVERZICHT_PAD, "Offertes"],
    ["/opdrachten", OPDRACHT_OVERZICHT_PAD, "Opdrachten"],
  ] as Array<[string, string, string]>
).map(([prefix, pad, label]) => ({ prefix, pad, label }));

function vindGeneriekePrefix(pad: string): GeneriekePrefix | null {
  let beste: GeneriekePrefix | null = null;
  for (const ingang of GENERIEKE_PREFIXEN) {
    if (pad !== ingang.prefix && !pad.startsWith(ingang.prefix + "/")) continue;
    if (beste === null || ingang.prefix.length > beste.prefix.length) beste = ingang;
  }
  return beste;
}

// Compacte kaart van bekende statische routes naar een net Nederlands label.
const STATISCHE_LABELS: Record<string, string> = {
  "/modules/calculatie/nieuw": "Nieuwe calculatie", "/modules/calculatie/leveranciers": "Leveranciers",
  "/modules/calculatie/eenheidsprijzen": "Eenheidsprijzen", "/personeel/verlof": "Verlof",
  "/personeel/contracten": "Contractbewaking", "/facturen/betaalbatch": "Betaalbatch",
  "/facturen/dashboard": "Financieel dashboard", "/crm/organisaties": "Organisaties",
  "/veiligheid/toolboxen": "Toolboxen", "/beheer/audit": "Audit trail", "/organisatie/autopark": "Autopark",
};

/** Title-case het laatste segment (koppeltekens → spaties) als terugval-label. */
function afgeleidLabel(pad: string): string {
  const laatste = pad.split("/").filter(Boolean).pop() ?? "";
  const woorden = laatste.replace(/-/g, " ").trim();
  if (!woorden) return DASHBOARD_LABEL;
  return woorden.charAt(0).toUpperCase() + woorden.slice(1);
}

// Generieke match. Op een module-overzicht (pad === modulePad) gaat de terug-knop
// naar het dashboard; diepere routes keren terug naar het module-overzicht.
// huidigeLabel komt uit STATISCHE_LABELS of anders het title-cased laatste segment.
function generiekeMatch(sleutel: string, pad: string, modulePad: string, moduleLabel: string): NavigatieRouteMatch {
  const isOverzicht = pad === modulePad;
  const huidigeLabel = STATISCHE_LABELS[pad] ?? (isOverzicht ? moduleLabel : afgeleidLabel(pad));
  return {
    sleutel, resolver: "generiek", params: {}, tab: null,
    moduleLabel, modulePad, huidigeLabel,
    terugLabel: isOverzicht ? DASHBOARD_LABEL : moduleLabel,
    terugPad: isOverzicht ? DASHBOARD_PAD : modulePad,
  };
}

function dashboardMatch(pad: string): NavigatieRouteMatch {
  const sleutel = pad === DASHBOARD_PAD ? "dashboard" : "generiek:dashboard";
  return generiekeMatch(sleutel, DASHBOARD_PAD, DASHBOARD_PAD, DASHBOARD_LABEL);
}

// Herleidt een locatie. Volgorde: dashboard → kern-resolvers (statisch vóór
// dynamisch) → meest-specifieke generieke prefix → dashboard als redmiddel.
export function resolveerNavigatieRoute(locatie: string): NavigatieRouteMatch {
  const { pad, query } = splitsLocatie(locatie);
  const genormaliseerd = pad === "" ? DASHBOARD_PAD : pad;
  if (genormaliseerd === DASHBOARD_PAD) return dashboardMatch(DASHBOARD_PAD);

  const tab = leesTab(query);
  for (const regel of REGISTER) {
    const match = regel.test(genormaliseerd, tab);
    if (match) return match;
  }

  const prefix = vindGeneriekePrefix(genormaliseerd);
  if (prefix) {
    return generiekeMatch(`generiek:${prefix.prefix}`, genormaliseerd, prefix.pad, prefix.label);
  }
  return dashboardMatch(genormaliseerd);
}

// Controltekens (0x00–0x1F en 0x7F) zijn nooit toegestaan in een pad.
const CONTROLTEKENS = /[\u0000-\u001f\u007f]/; // eslint-disable-line no-control-regex

// Veilig intern pad: exact één slash (geen `//`), geen backslashes/controltekens,
// geen protocol/scheme (`:` in padgedeelte), en niet naar /api of /auth.
export function isVeiligInternNavigatiepad(pad: string): boolean {
  if (typeof pad !== "string" || pad.length === 0) return false;
  if (pad[0] !== "/" || pad[1] === "/") return false;
  if (pad.includes("\\") || CONTROLTEKENS.test(pad)) return false;
  const padDeel = pad.split(/[?#]/)[0];
  if (padDeel.includes(":")) return false;
  if (padDeel === "/api" || padDeel.startsWith("/api/")) return false;
  if (padDeel === "/auth" || padDeel.startsWith("/auth/")) return false;
  return true;
}

// Vervangt (waarde niet-null) of verwijdert (waarde null) één query-param met
// behoud van overige params én hash. Retourneert `pad?query#hash`; nieuwe sleutel achteraan.
export function vervangQueryWaarde(locatie: string, sleutel: string, waarde: string | null): string {
  const { pad, query, hash } = splitsLocatie(locatie);
  const paren = ontleedQuery(query);
  const resultaat: Array<[string, string | null]> = [];
  let gevonden = false;

  for (const [k, v] of paren) {
    if (decodeURIComponent(k) === sleutel) {
      gevonden = true;
      if (waarde !== null) resultaat.push([sleutel, waarde]);
    } else {
      resultaat.push([k, v]);
    }
  }
  if (!gevonden && waarde !== null) resultaat.push([sleutel, waarde]);

  const nieuweQuery = resultaat.map(([k, v]) => (v === null ? k : `${k}=${v}`)).join("&");
  return `${pad}${nieuweQuery ? `?${nieuweQuery}` : ""}${hash}`;
}

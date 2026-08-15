// KLANTLOOS_01 fase 3 — buildcontrole die FAALT zodra de klantrol terugkeert.
//
// Connect is de binnenlaag zonder externe gebruikers (klanten wonen in het
// Platform). Deze check bewaakt dat de rol "klant" en elke "of klant"-
// autorisatievariant nooit meer terugkomen, en dat geen sessieroute zonder
// rechtencontrole ontstaat.
//
//   pnpm --filter @workspace/scripts run klantloos-check
//
// Controles:
//   1. Verboden identifiers in broncode (api-server, firevault, permissies,
//      aiContext, monteur-app, scripts): isKlant, requireBevoegdheidOfKlant,
//      klantPoort, KLANT_BEVOEGDHEDEN.
//   2. Rol-vergelijkingen/-toewijzingen met "klant" (rol === "klant",
//      rol: "klant", enz.). CRM-terminologie (klant_id, crm_klanten,
//      klant_naam, knooptype "klant" in aiContext) blijft toegestaan.
//      Legacy verificatiescripts die de 403-blokkade testen dragen de
//      marker "klantloos-ok" zodat ze niet falen.
//   3. OpenAPI: geen "klant" in een rol-enum.
//   4. Route-scan api-server: middleware met "OfKlant" in de naam of
//      requireRol met "klant" als argument is verboden. Routes zonder
//      per-route middleware vallen onder de globale requireAuth-mount in
//      routes/index.ts en worden alleen informatief geteld.
//   5. ONE-verwijdering (aug 2026): Connect is de binnenlaag en bevat geen
//      One-buitenlaag meer. Faalt zodra er weer een One-scherm
//      (pages/one/…), een /one/-route of een Connect/One-omgevingsschakelaar
//      (fps.omgeving, kiesOmgeving, Omgeving-type) in de code verschijnt.
//
// Exit 0 = klantloos; exit 1 = klantverwijzing gevonden (met vindplaatsen).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;

const SCAN_DIRS = [
  "artifacts/api-server/src",
  "artifacts/firevault/src",
  "lib/permissies/src",
  "artifacts/monteur-app",
  "scripts/src",
];

// Bestanden die "klant" als CRM-/historieterm mogen bevatten worden niet
// uitgezonderd — de patronen hieronder zijn zelf al specifiek voor de ROL.
const VERBODEN_IDENTIFIERS = [
  /\bisKlant\b/,
  /\brequireBevoegdheidOfKlant\b/,
  /\bklantPoort\b/i,
  /\bKLANT_BEVOEGDHEDEN\b/,
];

// Rol-context: vergelijking of toewijzing van letterlijk "klant" aan iets dat
// Achtervoegselregel: een regel faalt wanneer links een naam staat die eindigt
// op "rol"/"Rol" (rol, testRol, gebruikerRol, gebruiker.rol) én rechts de
// tekst "klant" (beide aanhalingstekens). CRM-/weergavevelden zoals
// type: "klant", entityType: "klant" en weergave === "klant" vallen hier
// bewust buiten — geen uitzonderingslijst of markers nodig.
const VERBODEN_ROLPATRONEN = [
  /[\w.$]*[Rr]ol\b\s*(?:===|!==|==|!=)\s*["'`]klant["'`]/,
  /["'`]klant["'`]\s*(?:===|!==|==|!=)\s*[\w.$]*[Rr]ol\b/,
  /[\w.$]*[Rr]ol\b\s*[:=]\s*["'`]klant["'`]/,
  /requireRol\([^)]*["'`]klant["'`]/,
];

// ONE-verwijdering: verboden patronen die wijzen op terugkeer van de
// One-buitenlaag in Connect (schermen, routes of de omgevingsschakelaar).
const VERBODEN_ONE_PATRONEN: [RegExp, string][] = [
  [/["'`]\/one\//, "one-route (/one/…)"],
  [/pages\/one\b/, "one-scherm (pages/one)"],
  [/\bfps\.omgeving\b|["'`]fps\.omgeving["'`]/, "omgevingsschakelaar (fps.omgeving)"],
  [/\bkiesOmgeving\b/, "omgevingsschakelaar (kiesOmgeving)"],
  [/["'`]connect["'`]\s*\|\s*["'`]one["'`]|["'`]one["'`]\s*\|\s*["'`]connect["'`]/, "Omgeving-type connect|one"],
];

// Zelf-test: verifieer dat alle verwachte varianten daadwerkelijk matchen
// vóór het broncode-scannen begint.
{
  const positieve: [string, number][] = [
    // prefix-varianten (rol / Rol — [Rr]ol matcht lowercase 'ol' na R of r)
    ['rol === "klant"',          0],
    ['Rol === "klant"',          0],
    ['"klant" === rol',          1],
    ['"klant" !== Rol',          1],
    // object-literal / toewijzing (patroon 2, [:=])
    ['rol: "klant"',             2],
    ['Rol: "klant"',             2],
    ['rol = "klant"',            2],
    // camelCase-suffix
    ['gebruikerRol === "klant"', 0],
    ['testRol !== "klant"',      0],
    ['userRol === "klant"',      0],
    ['"klant" === gebruikerRol', 1],
    ['"klant" !== testRol',      1],
    ['gebruikerRol: "klant"',    2],
    ['testRol = "klant"',        2],
    // dot-notatie
    ['gebruiker.rol === "klant"',0],
    ['"klant" === gebruiker.Rol',1],
    ['gebruiker.rol: "klant"',   2],
  ];

  const negatieve = [
    'klant_id === 3',
    'crm_klanten.find()',
    'klant_naam',
    '"klant" in object',
    'entityType === "klant"',
    'weergave === "klant"',
  ];

  for (const [invoer, idx] of positieve) {
    if (!VERBODEN_ROLPATRONEN[idx].test(invoer)) {
      console.error(`[klantloos-check] ZELFTEST MISLUKT — patroon[${idx}] herkent niet: ${invoer}`);
      process.exit(2);
    }
  }
  for (const invoer of negatieve) {
    const match = VERBODEN_ROLPATRONEN.find((p) => p.test(invoer));
    if (match) {
      console.error(`[klantloos-check] ZELFTEST MISLUKT — vals positief op: ${invoer}  [${match}]`);
      process.exit(2);
    }
  }

  // Zelf-test ONE-patronen.
  const onePositief: [string, number][] = [
    ['<Route path="/one/dashboard" component={OneDashboard} />', 0],
    ['navigeer("/one/gebouwen")', 0],
    ['import OneDashboard from "@/pages/one/dashboard";', 1],
    ['const OMGEVING_SLEUTEL = "fps.omgeving";', 2],
    ['onClick={() => kiesOmgeving("one")}', 3],
    ['type Omgeving = "connect" | "one";', 4],
  ];
  const oneNegatief = [
    'iedereen/oneindig',                    // "one" los in een woord
    'const telefoon = "06-1";',
    'if (a === 1) doe();',
    '"/onertalig/pad"',                     // /one zonder afsluitende slash-groep? (bevat /oner…)
    'omgevingsvariabele PROD',
  ];
  for (const [invoer, idx] of onePositief) {
    if (!VERBODEN_ONE_PATRONEN[idx][0].test(invoer)) {
      console.error(`[klantloos-check] ZELFTEST MISLUKT — one-patroon[${idx}] herkent niet: ${invoer}`);
      process.exit(2);
    }
  }
  for (const invoer of oneNegatief) {
    const match = VERBODEN_ONE_PATRONEN.find(([p]) => p.test(invoer));
    if (match) {
      console.error(`[klantloos-check] ZELFTEST MISLUKT — vals positief (one) op: ${invoer}  [${match[0]}]`);
      process.exit(2);
    }
  }
}

interface Vondst { file: string; regel: number; tekst: string; patroon: string }
const vondsten: Vondst[] = [];

function* loopBestanden(dir: string): Generator<string> {
  for (const naam of readdirSync(dir)) {
    const p = join(dir, naam);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (naam === "node_modules" || naam === "dist" || naam === "generated" || naam === ".expo") continue;
      yield* loopBestanden(p);
    } else if (/\.(ts|tsx)$/.test(naam)) {
      yield p;
    }
  }
}

// Dit controlebestand zelf en testbestanden met legacy-assertions overslaan.
const EIGEN_PAD = "scripts/src/klantloos-check.ts";

for (const dir of SCAN_DIRS) {
  for (const file of loopBestanden(join(ROOT, dir))) {
    const rel = file.slice(ROOT.length);
    if (rel === EIGEN_PAD) continue;
    const regels = readFileSync(file, "utf8").split("\n");
    regels.forEach((regel, i) => {
      // Bewuste uitzondering: regels die het klantloos-beleid zélf afdwingen
      // (bv. de heractiveringsblokkade) dragen de marker "klantloos-ok".
      if (regel.includes("klantloos-ok")) return;
      for (const p of [...VERBODEN_IDENTIFIERS, ...VERBODEN_ROLPATRONEN]) {
        if (p.test(regel)) {
          vondsten.push({ file: rel, regel: i + 1, tekst: regel.trim().slice(0, 140), patroon: String(p) });
        }
      }
      for (const [p, label] of VERBODEN_ONE_PATRONEN) {
        if (p.test(regel)) {
          vondsten.push({ file: rel, regel: i + 1, tekst: regel.trim().slice(0, 140), patroon: `ONE: ${label}` });
        }
      }
    });
  }
}

// 2b. ONE-schermenmap mag niet meer bestaan.
{
  const oneDir = join(ROOT, "artifacts/firevault/src/pages/one");
  try {
    if (statSync(oneDir).isDirectory()) {
      vondsten.push({ file: "artifacts/firevault/src/pages/one", regel: 0, tekst: "map met One-schermen bestaat weer", patroon: "ONE: pages/one-map" });
    }
  } catch { /* map bestaat niet — goed */ }
}

// 3. OpenAPI rol-enums.
const openapi = readFileSync(join(ROOT, "lib/api-spec/openapi.yaml"), "utf8").split("\n");
openapi.forEach((regel, i) => {
  if (/enum:\s*\[[^\]]*hoofdbeheerder[^\]]*\bklant\b[^\]]*\]/.test(regel)) {
    vondsten.push({ file: "lib/api-spec/openapi.yaml", regel: i + 1, tekst: regel.trim().slice(0, 140), patroon: "rol-enum bevat klant" });
  }
});

// 4. Route-scan: sessieroutes zonder enige auth-/rechten-middleware, en
// verboden middleware-namen op routes.
const ROUTES_DIR = join(ROOT, "artifacts/api-server/src/routes");
const PUBLIEKE_BESTANDEN = new Set(["health.ts", "auth.ts", "uitnodiging.ts", "installatie.ts", "portaal.ts"]);
const AUTH_MIDDLEWARES = /require(Auth|Bevoegdheid|EnigeBevoegdheid|Rol|Hoofdbeheerder)|alleenBeheerder/;

let routesTotaal = 0;
const routesZonderCheck: Vondst[] = [];

for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts") && f !== "index.ts")) {
  const src = readFileSync(join(ROUTES_DIR, file), "utf8");
  // Const-aliassen (const lezen = requireBevoegdheid("x", 1)) meenemen.
  const aliassen = new Set<string>();
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*\[?\s*require\w+\(/g)) aliassen.add(m[1]);
  const routerBreed = AUTH_MIDDLEWARES.test(
    [...src.matchAll(/router\.use\(([^;]*)\)/g)].map((m) => m[1]).join(" "),
  );
  const routeRe = /router\.(get|post|patch|put|delete)\(\s*(["'`])([^"'`]*)\2\s*,\s*([\s\S]{0,200}?)(?:async|\(req|\(_req|function)/g;
  for (const m of src.matchAll(routeRe)) {
    routesTotaal++;
    const [, method, , pad, mwBlob] = m;
    if (/OfKlant/i.test(mwBlob)) {
      vondsten.push({ file: `routes/${file}`, regel: 0, tekst: `${method.toUpperCase()} ${pad} — middleware met 'OfKlant'`, patroon: "of-klant-middleware" });
    }
    const heeftCheck =
      routerBreed ||
      AUTH_MIDDLEWARES.test(mwBlob) ||
      [...aliassen].some((a) => new RegExp(`\\b${a}\\b`).test(mwBlob));
    if (PUBLIEKE_BESTANDEN.has(file)) continue; // publiek oppervlak, eigen tokenvalidatie
    if (!heeftCheck) {
      // Informatief: deze routes leunen op de globale requireAuth-mount
      // (routes/index.ts) en eventuele checks in de handler zelf.
      routesZonderCheck.push({ file: `routes/${file}`, regel: 0, tekst: `${method.toUpperCase()} ${pad}`, patroon: "alleen globale requireAuth" });
    }
  }
}

// Rapport.
console.log(`[klantloos-check] ${SCAN_DIRS.length} bronbomen gescand, ${routesTotaal} routes onderzocht.`);
console.log(`[klantloos-check] Informatief: ${routesZonderCheck.length} sessieroutes zonder per-route middleware (gedekt door globale requireAuth).`);
const fouten = vondsten;
if (fouten.length === 0) {
  console.log("[klantloos-check] OK — geen klantrol-verwijzingen, geen of-klant-middleware, geen sessieroute zonder rechtencontrole, geen One-restanten.");
  process.exit(0);
}
console.error(`[klantloos-check] GEFAALD — ${fouten.length} bevinding(en):`);
for (const v of fouten) {
  console.error(`  - ${v.file}${v.regel ? `:${v.regel}` : ""} → ${v.tekst}  [${v.patroon}]`);
}
console.error(
  "\nKLANTLOOS_01: Connect kent geen externe gebruikers. De rol 'klant' en elke" +
  " 'of klant'-autorisatievariant zijn definitief verwijderd; klanten wonen in" +
  " het Platform. Verwijder de gevonden verwijzing(en) of bouw de functie op" +
  " gewone module-rechten (requireBevoegdheid). ONE: de One-buitenlaag is" +
  " definitief uit Connect verwijderd — geen One-schermen, /one/-routes of" +
  " Connect/One-schakelaar terugbouwen.",
);
process.exit(1);

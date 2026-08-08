// KLANT_01 Fase 3 — buildcontrole klant-begrenzing.
//
// Controleert statisch dat:
//  1. de klant-poort in routes/index.ts direct na laadPermissies gemount is;
//  2. elke route met requireBevoegdheidOfKlant (of een alias daarvan) in de
//     allowlist KLANT_TOEGESTANE_ROUTES staat — een nieuwe klantroute zonder
//     bewuste allowlist-opname laat deze check falen;
//  3. elke allowlist-regel op minstens één bestaande route matcht (drift).
// Exit 0 = in orde, exit 1 = schending (met uitleg).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = new URL("../../artifacts/api-server/src", import.meta.url).pathname;
const ROUTES_DIR = join(API_SRC, "routes");
const fouten: string[] = [];

// De allowlist wordt uit de brontekst van klantPoort.ts geparseerd in plaats
// van geïmporteerd: een directe import van api-server-source valt buiten de
// rootDir van het scripts-package en breekt de scripts-typecheck (TS6059).
// De entries zijn bewust eenregelige objectliterals met een regex-literal.
interface KlantRoute { methode: string; patroon: RegExp; omschrijving: string }
const poortSrc = readFileSync(join(API_SRC, "middlewares/klantPoort.ts"), "utf8");
const KLANT_TOEGESTANE_ROUTES: KlantRoute[] = [];
for (const m of poortSrc.matchAll(
  /\{\s*methode:\s*"(GET|POST|PATCH|PUT|DELETE)"\s*,\s*patroon:\s*\/((?:[^/\\\n]|\\.)+)\/([a-z]*)\s*,\s*omschrijving:\s*"([^"]*)"/g,
)) {
  KLANT_TOEGESTANE_ROUTES.push({ methode: m[1], patroon: new RegExp(m[2], m[3]), omschrijving: m[4] });
}
if (KLANT_TOEGESTANE_ROUTES.length === 0) {
  console.error("KLANT-POORT-CHECK GEFAALD:\n - Kon KLANT_TOEGESTANE_ROUTES niet uit klantPoort.ts parsen — is het bestandsformaat gewijzigd?");
  process.exit(1);
}

// 1. Poort gemount na laadPermissies
const indexSrc = readFileSync(join(ROUTES_DIR, "index.ts"), "utf8");
const posPerm = indexSrc.indexOf("router.use(laadPermissies)");
const posPoort = indexSrc.indexOf("router.use(klantPoort)");
if (posPerm === -1 || posPoort === -1 || posPoort < posPerm) {
  fouten.push("klantPoort is niet (of vóór laadPermissies) gemount in routes/index.ts");
}

// 2. Alle OfKlant-routes moeten in de allowlist staan
interface Gevonden { file: string; methode: string; pad: string }
const ofKlantRoutes: Gevonden[] = [];
for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts") && f !== "index.ts")) {
  const src = readFileSync(join(ROUTES_DIR, file), "utf8");
  // aliassen: const x = requireBevoegdheidOfKlant(...)
  const aliassen = new Set<string>(["requireBevoegdheidOfKlant"]);
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*requireBevoegdheidOfKlant\(/g)) aliassen.add(m[1]);
  for (const m of src.matchAll(/router\.(get|post|patch|put|delete)\(\s*(["'`])([^"'`]*)\2\s*,\s*(\w+)/g)) {
    if (aliassen.has(m[4])) ofKlantRoutes.push({ file, methode: m[1].toUpperCase(), pad: m[3] });
  }
}
for (const r of ofKlantRoutes) {
  // Express-pad naar voorbeeld-pad: :param → 1
  const voorbeeld = r.pad.replace(/:[^/]+/g, "1");
  const gedekt = KLANT_TOEGESTANE_ROUTES.some((a) => a.methode === r.methode && a.patroon.test(voorbeeld));
  if (!gedekt) {
    fouten.push(`${r.methode} ${r.pad} (${r.file}) gebruikt requireBevoegdheidOfKlant maar staat NIET in KLANT_TOEGESTANE_ROUTES — voeg bewust toe mét gebouw-begrenzing in de handler, of gebruik requireBevoegdheid.`);
  }
}

// 3. Elke allowlist-regel matcht minstens één echte route (drift-detectie)
const alleRoutes: Gevonden[] = [];
for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts") && f !== "index.ts")) {
  const src = readFileSync(join(ROUTES_DIR, file), "utf8");
  for (const m of src.matchAll(/router\.(get|post|patch|put|delete)\(\s*(["'`])([^"'`]*)\2/g)) {
    alleRoutes.push({ file, methode: m[1].toUpperCase(), pad: m[3] });
  }
}
for (const a of KLANT_TOEGESTANE_ROUTES) {
  const bestaat = alleRoutes.some(
    (r) => r.methode === a.methode && a.patroon.test(r.pad.replace(/:[^/]+/g, "1").replace(/\*\w+/g, "x/y")),
  );
  if (!bestaat) fouten.push(`Allowlist-regel "${a.methode} ${a.patroon}" (${a.omschrijving}) matcht geen enkele bestaande route — verwijder of corrigeer.`);
}

if (fouten.length) {
  console.error("KLANT-POORT-CHECK GEFAALD:\n" + fouten.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
console.log(`Klant-poort-check OK: poort gemount, ${ofKlantRoutes.length} OfKlant-routes gedekt, ${KLANT_TOEGESTANE_ROUTES.length} allowlist-regels geldig.`);

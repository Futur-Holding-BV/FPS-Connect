/**
 * HERSTEL_01 §3.5 — CI-controle op dubbele route-declaraties.
 *
 * Faalt (exit 1) zodra dezelfde methode+pad-combinatie meer dan één keer in
 * één routebestand van de api-server wordt gedeclareerd. Express registreert
 * bij dubbele declaratie stilzwijgend alleen de eerste; de tweede is dode
 * code — dat is vandaag (8 aug 2026) twee keer misgegaan bij merges.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES_DIR = join(import.meta.dirname, "../../artifacts/api-server/src/routes");
const ROUTE_RE = /\brouter\.(get|post|patch|put|delete)\(\s*(["'`])([^"'`]+)\2/g;

let fouten = 0;
let totaal = 0;

for (const bestand of readdirSync(ROUTES_DIR).filter((b) => b.endsWith(".ts")).sort()) {
  const inhoud = readFileSync(join(ROUTES_DIR, bestand), "utf8");
  const gezien = new Map<string, number[]>();
  for (const m of inhoud.matchAll(ROUTE_RE)) {
    const sleutel = `${m[1]!.toUpperCase()} ${m[3]}`;
    const regel = inhoud.slice(0, m.index).split("\n").length;
    gezien.set(sleutel, [...(gezien.get(sleutel) ?? []), regel]);
    totaal++;
  }
  for (const [sleutel, regels] of gezien) {
    if (regels.length > 1) {
      console.error(`DUBBEL in ${bestand}: ${sleutel} op regels ${regels.join(", ")} — Express gebruikt alleen de eerste, de rest is dode code.`);
      fouten++;
    }
  }
}

if (fouten > 0) {
  console.error(`\n${fouten} dubbele route-declaratie(s) gevonden.`);
  process.exit(1);
}
console.log(`OK: ${totaal} route-declaraties gecontroleerd, nul duplicaten.`);

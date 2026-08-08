/**
 * HERSTEL_01 §3.5 — CI-controle op dubbele route-declaraties.
 *
 * Faalt (exit 1) zodra dezelfde methode+pad-combinatie meer dan één keer in
 * één routebestand van de api-server wordt gedeclareerd. Express registreert
 * bij dubbele declaratie stilzwijgend alleen de eerste; de tweede is dode
 * code — dat is op 8 aug 2026 twee keer misgegaan bij merges.
 *
 * Dekt beide declaratievormen:
 *   router.get("/pad", ...)                       (direct)
 *   router.route("/pad").get(...).post(...)       (geketend)
 * en scant de routes-map recursief.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROUTES_DIR = join(import.meta.dirname, "../../artifacts/api-server/src/routes");
const METHODEN = ["get", "post", "patch", "put", "delete", "all"] as const;
const DIRECT_RE = new RegExp(String.raw`\brouter\.(${METHODEN.join("|")})\(\s*(["'\`])([^"'\`]+)\2`, "g");
const ROUTE_RE = /\brouter\.route\(\s*(["'`])([^"'`]+)\1\s*\)((?:\s*\.\s*\w+\s*\()?)/g;
const KETEN_METHODE_RE = new RegExp(String.raw`\.\s*(${METHODEN.join("|")})\s*\(`, "g");

function tsBestanden(dir: string): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(dir).sort()) {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) uit.push(...tsBestanden(pad));
    else if (naam.endsWith(".ts")) uit.push(pad);
  }
  return uit;
}

/** Pakt de aaneengesloten methodeketen direct na router.route("...") — tot de
 *  eerste statement-afsluiter (;) op ketendiepte nul. */
function ketenMethoden(inhoud: string, vanaf: number): string[] {
  const methoden: string[] = [];
  let diepte = 0;
  let i = vanaf;
  while (i < inhoud.length) {
    const c = inhoud[i]!;
    if (c === "(") diepte++;
    else if (c === ")") diepte--;
    else if (diepte === 0) {
      if (c === ";") break;
      if (c === ".") {
        const rest = inhoud.slice(i);
        const m = new RegExp(String.raw`^\.\s*(\w+)\s*\(`).exec(rest);
        if (!m) break;
        if ((METHODEN as readonly string[]).includes(m[1]!)) methoden.push(m[1]!);
        i += m[0].length;
        diepte = 1;
        continue;
      }
      if (!/\s/.test(c)) break;
    }
    i++;
  }
  return methoden;
}

let fouten = 0;
let totaal = 0;

for (const pad of tsBestanden(ROUTES_DIR)) {
  const bestand = relative(ROUTES_DIR, pad);
  const inhoud = readFileSync(pad, "utf8");
  const gezien = new Map<string, number[]>();
  const registreer = (methode: string, routePad: string, index: number) => {
    const sleutel = `${methode.toUpperCase()} ${routePad}`;
    const regel = inhoud.slice(0, index).split("\n").length;
    gezien.set(sleutel, [...(gezien.get(sleutel) ?? []), regel]);
    totaal++;
  };
  for (const m of inhoud.matchAll(DIRECT_RE)) registreer(m[1]!, m[3]!, m.index);
  for (const m of inhoud.matchAll(ROUTE_RE)) {
    for (const methode of ketenMethoden(inhoud, m.index + m[0].length - (m[3] ? m[3].length : 0))) {
      registreer(methode, m[2]!, m.index);
    }
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
console.log(`OK: ${totaal} route-declaraties gecontroleerd (direct + geketend), nul duplicaten.`);

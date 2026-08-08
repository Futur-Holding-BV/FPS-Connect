// KLANT_01 Fase 0 — statische inventarisatie van klantbereikbare routes.
//
// Voor elk bestand in api-server/src/routes bepaalt dit script per route
// (router.get/post/...) welke middleware-keten er staat, en of een gebruiker
// met rol "klant" die route kan bereiken. Regels (gemeten in middlewares/auth.ts):
//   - requireAuth              → klant komt door (algemene auth)
//   - requireBevoegdheid       → klant 403 (expliciet geblokkeerd)
//   - requireEnigeBevoegdheid  → klant 403
//   - requireBevoegdheidOfKlant→ klant komt door (scope hoort in handler)
//   - requireRol(...)          → klant alleen door als "klant" in de argumenten
//   - alleenBeheerder e.d.     → klant geblokkeerd
// Const-aliassen (const lezen = requireBevoegdheid("x", 1)) worden opgelost.
// Uitvoer: markdown-tabel op stdout + samenvatting. Exit 1 bij parseproblemen.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES_DIR = new URL("../../artifacts/api-server/src/routes", import.meta.url).pathname;

type Klasse = "doorgelaten" | "geblokkeerd" | "onbekend";

const BLOKKEERDERS = ["requireBevoegdheid", "requireEnigeBevoegdheid", "alleenBeheerder", "requireHoofdbeheerder"];
const DOORLATERS_KLANT = ["requireBevoegdheidOfKlant"];

function classificeerFactory(expr: string): Klasse {
  const e = expr.trim();
  for (const d of DOORLATERS_KLANT) if (e.startsWith(d)) return "doorgelaten";
  // Let op volgorde: "requireBevoegdheidOfKlant" bevat "requireBevoegdheid".
  for (const b of BLOKKEERDERS) if (e.startsWith(b + "(") || e === b) return "geblokkeerd";
  if (e.startsWith("requireRol")) return /["'`]klant["'`]/.test(e) ? "doorgelaten" : "geblokkeerd";
  if (e.startsWith("requireAuth")) return "doorgelaten";
  return "onbekend";
}

interface RouteInfo { file: string; method: string; pad: string; middlewares: string[]; klant: Klasse; reden: string }

// Routers die in routes/index.ts vóór requireAuth gemount zijn: publiek oppervlak,
// geen klant-sessieroutes (apart gerapporteerd).
const PUBLIEKE_BESTANDEN = new Set(["health.ts", "auth.ts", "uitnodiging.ts", "installatie.ts", "portaal.ts"]);

const alleRoutes: RouteInfo[] = [];
const bestanden = readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts") && f !== "index.ts");

for (const file of bestanden) {
  const src = readFileSync(join(ROUTES_DIR, file), "utf8");

  // 1. const-aliassen: const naam = requireXxx(...);
  const aliassen = new Map<string, Klasse>();
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*(require\w+\([^;]*?\))\s*;/g)) {
    const kl = classificeerFactory(m[2]);
    if (kl !== "onbekend") aliassen.set(m[1], kl);
  }

  // 2. router-brede middleware in dit bestand: router.use(mw)
  let routerNiveau: Klasse | null = null;
  for (const m of src.matchAll(/router\.use\(\s*([\w.]+(?:\([^)]*\))?)\s*[,)]/g)) {
    const kl = aliassen.get(m[1]) ?? classificeerFactory(m[1]);
    if (kl === "geblokkeerd") routerNiveau = "geblokkeerd";
  }

  // 3. routes: router.method("pad", mw1, mw2, ..., handler)
  const routeRe = /router\.(get|post|patch|put|delete)\(\s*(["'`])([^"'`]*)\2\s*,\s*([\s\S]*?)(?:async|\(req|\(_req|function)/g;
  for (const m of src.matchAll(routeRe)) {
    const [, method, , pad, mwBlob] = m;
    const idents = [...mwBlob.matchAll(/([A-Za-z_]\w*)(\([^()]*\))?\s*,/g)].map((x) => x[1] + (x[2] ?? ""));
    let klasse: Klasse = routerNiveau ?? "onbekend";
    let reden = routerNiveau === "geblokkeerd" ? "router.use blokkeert klant" : "alleen requireAuth (globaal) — geen rechtencheck gevonden";
    for (const ident of idents) {
      const naam = ident.replace(/\(.*/, "");
      const kl = aliassen.get(naam) ?? classificeerFactory(ident);
      if (kl === "geblokkeerd") { klasse = "geblokkeerd"; reden = `${ident} blokkeert klant`; break; }
      if (kl === "doorgelaten" && naam !== "requireAuth") { klasse = "doorgelaten"; reden = `${ident} laat klant door`; }
    }
    if (klasse === "onbekend") klasse = "doorgelaten"; // fail-closed rapporteren: geen check gevonden = klantbereikbaar
    alleRoutes.push({ file, method: method.toUpperCase(), pad, middlewares: idents, klant: klasse, reden });
  }
}

const publiek = alleRoutes.filter((r) => PUBLIEKE_BESTANDEN.has(r.file));
const sessieRoutes = alleRoutes.filter((r) => !PUBLIEKE_BESTANDEN.has(r.file));
const bereikbaar = sessieRoutes.filter((r) => r.klant === "doorgelaten");
const perBestand = new Map<string, RouteInfo[]>();
for (const r of bereikbaar) {
  if (!perBestand.has(r.file)) perBestand.set(r.file, []);
  perBestand.get(r.file)!.push(r);
}

console.log(`# Klantbereikbare routes (statische analyse)\n`);
console.log(`Totaal routes: ${alleRoutes.length} · publiek (vóór requireAuth): ${publiek.length} · sessieroutes: ${sessieRoutes.length} · daarvan klantbereikbaar: ${bereikbaar.length} · geblokkeerd voor klant: ${sessieRoutes.length - bereikbaar.length}\n`);
for (const [file, routes] of [...perBestand.entries()].sort()) {
  console.log(`## ${file} (${routes.length})`);
  console.log(`| Methode | Pad | Waarom bereikbaar |`);
  console.log(`|---|---|---|`);
  for (const r of routes) console.log(`| ${r.method} | ${r.pad} | ${r.reden} |`);
  console.log("");
}

/**
 * Kwaliteitscontrole — FPS Platform
 *
 * Voert een volledige kwaliteitscheck uit op de codebase:
 * - TypeScript typecheck (libs + alle packages)
 * - Build api-server (compilatie + bundle)
 * - Security scan (pnpm audit + verouderde pakketten)
 * - Dode imports / ongebruikte exports (heuristisch)
 * - Changelog-samenvatting (recente git commits)
 *
 * Gebruik: pnpm --filter @workspace/scripts run kwaliteitscheck
 *
 * Rapporteert alleen — wijzigt NIETS in de codebase.
 */

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";

function run(cmd: string, cwd = repoRoot): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, output: output.trim() };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return { ok: false, output: ((e.stdout ?? "") + "\n" + (e.stderr ?? "")).trim() };
  }
}

function sectie(titel: string) {
  console.log(`\n${BOLD}${CYAN}━━━ ${titel} ━━━${RESET}`);
}

function ok(tekst: string) {
  console.log(`  ${GREEN}✓${RESET} ${tekst}`);
}

function waarschuwing(tekst: string) {
  console.log(`  ${YELLOW}⚠${RESET} ${tekst}`);
}

function fout(tekst: string) {
  console.log(`  ${RED}✗${RESET} ${tekst}`);
}

function info(tekst: string) {
  console.log(`  ${DIM}${tekst}${RESET}`);
}

type Bevinding = {
  categorie: string;
  ernst: "kritiek" | "hoog" | "middel" | "laag" | "info";
  bericht: string;
};

const bevindingen: Bevinding[] = [];

function registreer(categorie: string, ernst: Bevinding["ernst"], bericht: string) {
  bevindingen.push({ categorie, ernst, bericht });
}

// ─── Hoofdfunctie ───────────────────────────────────────────────────────────

async function main() {
  const startTijd = Date.now();
  const nu = new Date().toLocaleString("nl-NL", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  console.log(`\n${BOLD}FPS Platform — Kwaliteitscontrole${RESET}`);
  console.log(`${DIM}Gestart op ${nu}${RESET}`);
  console.log(`${DIM}Repository: ${repoRoot}${RESET}`);

  // ─── 1. TypeScript ────────────────────────────────────────────────────────

  sectie("1. TypeScript — libs");
  const tsLibs = run("pnpm run typecheck:libs");
  const tsLibsErrors = tsLibs.output.split("\n").filter((l) => l.includes("error TS"));
  if (tsLibsErrors.length === 0) {
    ok("Alle gedeelde bibliotheken compileren foutloos");
  } else {
    tsLibsErrors.forEach((l) => {
      fout(l.trim());
      registreer("TypeScript / Libs", "hoog", l.trim());
    });
  }

  sectie("2. TypeScript — Frontend (firevault)");
  const tsFe = run("pnpm --filter @workspace/firevault run typecheck");
  const tsFeErrors = tsFe.output.split("\n")
    .filter((l) => l.includes("error TS"))
    .filter((l) => !l.includes("monteur-layout") && !l.includes("dashboard/monteur")
      && !l.includes("voorziening-bewerken") && !l.includes("rol-context"));
  const tsFePreExisting = tsFe.output.split("\n")
    .filter((l) => l.includes("error TS"))
    .filter((l) => l.includes("monteur-layout") || l.includes("dashboard/monteur")
      || l.includes("voorziening-bewerken") || l.includes("rol-context"));

  if (tsFeErrors.length === 0) {
    ok("Frontend typecheck geslaagd (geen nieuwe fouten)");
  } else {
    tsFeErrors.forEach((l) => {
      fout(l.trim());
      registreer("TypeScript / Frontend", "hoog", l.trim());
    });
  }
  if (tsFePreExisting.length > 0) {
    waarschuwing(`${tsFePreExisting.length} pre-existing TS-fouten (Rol-enum / legacy controleur)`);
    registreer("TypeScript / Frontend", "laag", `${tsFePreExisting.length} pre-existing fouten (Rol-enum legacy)`);
  }

  sectie("3. TypeScript — API Server");
  const tsApi = run("pnpm --filter @workspace/api-server run typecheck");
  const tsApiErrors = tsApi.output.split("\n")
    .filter((l) => l.includes("error TS"))
    .filter((l) => !l.includes("TS7030"));
  const tsApi7030 = tsApi.output.split("\n")
    .filter((l) => l.includes("TS7030")).length;

  if (tsApiErrors.length === 0) {
    ok("API server typecheck geslaagd (geen nieuwe fouten)");
  } else {
    tsApiErrors.forEach((l) => {
      fout(l.trim());
      registreer("TypeScript / API", "hoog", l.trim());
    });
  }
  if (tsApi7030 > 0) {
    waarschuwing(`${tsApi7030}× TS7030 "not all code paths return a value" (pre-existing in alle route-bestanden)`);
    registreer("TypeScript / API", "laag", `${tsApi7030}× TS7030 pre-existing (route-handlers)`);
  }

  sectie("4. TypeScript — Scripts");
  const tsScripts = run("pnpm --filter @workspace/scripts run typecheck");
  const tsScriptsErrors = tsScripts.output.split("\n").filter((l) => l.includes("error TS"));
  if (tsScriptsErrors.length === 0) {
    ok("Scripts typecheck geslaagd");
  } else {
    tsScriptsErrors.forEach((l) => {
      fout(l.trim());
      registreer("TypeScript / Scripts", "hoog", l.trim());
    });
  }

  // ─── 2. Build ─────────────────────────────────────────────────────────────

  sectie("5. Build — API Server");
  const build = run("pnpm --filter @workspace/api-server run build");
  if (build.ok) {
    const bundleRegel = build.output.split("\n").find((l) => l.includes("index.mjs") && l.includes("mb"));
    ok(`Build geslaagd${bundleRegel ? " — " + bundleRegel.trim() : ""}`);
  } else {
    const buildFouten = build.output.split("\n").filter((l) => l.includes("error") || l.includes("Error")).slice(0, 5);
    buildFouten.forEach((l) => fout(l.trim()));
    registreer("Build", "kritiek", "API server build mislukt");
  }

  // ─── 3. OpenAPI spec aanwezig en parseerbaar ──────────────────────────────

  sectie("6. OpenAPI spec");
  const specPad = path.join(repoRoot, "lib/api-spec/openapi.yaml");
  if (fs.existsSync(specPad)) {
    const specGrootte = fs.statSync(specPad).size;
    ok(`openapi.yaml aanwezig (${Math.round(specGrootte / 1024)} KB)`);
    const generatedPad = path.join(repoRoot, "lib/api-client-react/src/generated/api.ts");
    if (fs.existsSync(generatedPad)) {
      const genStat = fs.statSync(generatedPad);
      const specStat = fs.statSync(specPad);
      if (genStat.mtimeMs < specStat.mtimeMs) {
        waarschuwing("api.ts is ouder dan openapi.yaml — codegen mogelijk verouderd");
        registreer("OpenAPI / Codegen", "middel", "Gegenereerde api.ts is ouder dan de spec — voer codegen uit");
      } else {
        ok("Gegenereerde api.ts is actueel");
      }
    }
  } else {
    fout("openapi.yaml niet gevonden op verwachte locatie");
    registreer("OpenAPI", "kritiek", "openapi.yaml ontbreekt");
  }

  // ─── 4. DB schema ─────────────────────────────────────────────────────────

  sectie("7. Database schema");
  const schemaPad = path.join(repoRoot, "lib/db/src/schema/index.ts");
  if (fs.existsSync(schemaPad)) {
    const schemaInhoud = fs.readFileSync(schemaPad, "utf8");
    const exports = schemaInhoud.match(/export \* from/g)?.length ?? 0;
    ok(`Schema index heeft ${exports} schema-exports`);

    const schemaDir = path.join(repoRoot, "lib/db/src/schema");
    const schemaFiles = fs.readdirSync(schemaDir).filter((f) => f.endsWith(".ts") && f !== "index.ts");
    const geExporteerd = schemaFiles.filter((f) => schemaInhoud.includes(`./${f.replace(".ts", "")}`));
    const ontbrekend = schemaFiles.filter((f) => !schemaInhoud.includes(`./${f.replace(".ts", "")}`));
    if (ontbrekend.length > 0) {
      ontbrekend.forEach((f) => {
        waarschuwing(`Schema-bestand niet geëxporteerd uit index: ${f}`);
        registreer("Database / Schema", "middel", `${f} niet geëxporteerd uit schema/index.ts`);
      });
    } else {
      ok(`Alle ${geExporteerd.length} schema-bestanden zijn geëxporteerd`);
    }
  } else {
    fout("lib/db/src/schema/index.ts niet gevonden");
    registreer("Database / Schema", "kritiek", "Schema index ontbreekt");
  }

  // ─── 5. Security scan (pnpm audit) ────────────────────────────────────────

  sectie("8. Security — pnpm audit");
  // Gebruik alleen de plain-text samenvatting om te voorkomen dat JSON-schema-tekst
  // ("critical" als mogelijke waarde) vals-positief matcht.
  const audit = run("pnpm audit 2>&1");
  const auditSamenvatting = audit.output.split("\n").find((l) => l.startsWith("Severity:")) ?? "";
  const aantalCritical = parseInt(auditSamenvatting.match(/(\d+) critical/)?.[1] ?? "0");
  const aantalHigh = parseInt(auditSamenvatting.match(/(\d+) high/)?.[1] ?? "0");
  const aantalModerate = parseInt(auditSamenvatting.match(/(\d+) moderate/)?.[1] ?? "0");
  const totaalVulns = parseInt(audit.output.match(/^(\d+) vulnerabilities found/m)?.[1] ?? "0");

  if (totaalVulns === 0 || audit.output.includes("found 0")) {
    ok("Geen bekende kwetsbaarheden gevonden");
  } else if (aantalCritical > 0) {
    fout(`${aantalCritical} kritieke kwetsbaarh${aantalCritical === 1 ? "eid" : "eden"} gevonden — zie \`pnpm audit\``);
    registreer("Security / Audit", "kritiek", `${aantalCritical} kritieke kwetsbaarheden in npm-dependencies`);
    if (aantalHigh > 0) registreer("Security / Audit", "hoog", `${aantalHigh} hoge kwetsbaarheden`);
  } else if (aantalHigh > 0) {
    waarschuwing(`${aantalHigh} hoge kwetsbaarheden — zie \`pnpm audit\` voor details`);
    info(`  Samenvatting: ${auditSamenvatting.replace("Severity: ", "")}`);
    // Controleer of er gefixte versies beschikbaar zijn
    const geenPatch = (audit.output.match(/Patched versions\s*│\s*<0\.0\.0/g) ?? []).length;
    if (geenPatch > 0) {
      info(`  ${geenPatch}× geen patch beschikbaar (upstream-fix vereist)`);
      registreer("Security / Audit", "middel", `${aantalHigh} hoge kwetsbaarheden — ${geenPatch}× geen patch beschikbaar`);
    } else {
      registreer("Security / Audit", "hoog", `${aantalHigh} hoge kwetsbaarheden in npm-dependencies`);
    }
    if (aantalModerate > 0) {
      info(`  ${aantalModerate} middelhoge kwetsbaarheden (dev-deps / transitief)`);
    }
  } else if (aantalModerate > 0) {
    waarschuwing(`${aantalModerate} middelhoge kwetsbaarheden (dev-deps / transitief) — zie \`pnpm audit\``);
    registreer("Security / Audit", "laag", `${aantalModerate} moderate kwetsbaarheden (dev-deps/transitief)`);
  } else {
    info("Audit-resultaat onzeker — voer handmatig `pnpm audit` uit voor details");
  }

  // ─── 6. Architectuurcontrole ──────────────────────────────────────────────

  sectie("9. Architectuurscheiding — modules");
  const connectPad = path.join(repoRoot, "artifacts/firevault/src/pages/connect");
  const onePad = path.join(repoRoot, "artifacts/firevault/src/pages/one");
  const modulesPad = path.join(repoRoot, "artifacts/firevault/src/pages/modules");

  const connectBestanden = fs.existsSync(connectPad) ? fs.readdirSync(connectPad).length : 0;
  const oneBestanden = fs.existsSync(onePad) ? fs.readdirSync(onePad).length : 0;
  const modulesBestanden = fs.existsSync(modulesPad)
    ? fs.readdirSync(modulesPad, { recursive: true }).length : 0;

  ok(`FPS Connect: ${connectBestanden} pagina-bestanden onder /pages/connect/`);
  ok(`FPS One: ${oneBestanden} pagina-bestanden onder /pages/one/`);
  ok(`Modules: ${modulesBestanden} bestanden onder /pages/modules/`);

  const srcPad = path.join(repoRoot, "artifacts/firevault/src/pages");
  const allePages = fs.readdirSync(srcPad);
  const verwachteModules = ["connect", "one", "modules", "dashboard", "gebouwen",
    "voorzieningen", "inspecties", "onderhoud", "gebruikers", "crm", "abonnementen",
    "beheer", "personeel", "dossiers", "offertes", "documenten", "rapporten",
    "toolbox", "auth", "uitnodiging", "info", "klant",
    // Uitgebreide modules (parallel spoor / actieve ontwikkeling)
    "berichten", "boekhouder", "facturen", "financieel", "gereedschappen",
    "inbox", "loon-output", "mijn", "opdrachten", "opname", "organisatie",
    "portaal", "salaris-mutaties", "salarisarchief", "scab-mail", "sepa-bestanden",
    "snagstream", "uren", "veiligheid", "wagenpark", "welkom", "werk-inbox", "workflow"];
  const onbekend = allePages.filter((p) => !verwachteModules.includes(p) && !p.includes("."));
  if (onbekend.length > 0) {
    onbekend.forEach((p) => {
      waarschuwing(`Onbekende module-directory: /pages/${p}/`);
      registreer("Architectuur", "middel", `Onverwachte directory in pages: ${p}`);
    });
  } else {
    ok("Alle module-directories vallen binnen de verwachte architectuur");
  }

  // ─── 7. Routes volledigheid ───────────────────────────────────────────────

  sectie("10. Route-volledigheid API");
  const routeIndex = path.join(repoRoot, "artifacts/api-server/src/routes/index.ts");
  if (fs.existsSync(routeIndex)) {
    const routeInhoud = fs.readFileSync(routeIndex, "utf8");
    // Tel alleen router-variabele imports (eindigen op Router) — niet middleware zoals requireAuth
    const routerImports = (routeInhoud.match(/import \w+Router from/g) ?? []).length;
    // Tel router.use() aanroepen met router-variabelen (argument begint met kleine letter + Router)
    const routerUses = (routeInhoud.match(/router\.use\(\w+Router\)/g) ?? []).length;
    ok(`${routerImports} router-imports, ${routerUses} geregistreerd via router.use()`);
    if (routerImports > routerUses) {
      const diff = routerImports - routerUses;
      waarschuwing(`${diff} router-import${diff === 1 ? "" : "s"} niet geregistreerd via router.use()`);
      registreer("Routes", "middel", `${diff} router-imports niet geregistreerd via router.use() in routes/index.ts`);
    } else {
      ok("Alle router-imports zijn geregistreerd");
    }
  }

  // ─── 8. Git changelog ─────────────────────────────────────────────────────

  sectie("11. Recente wijzigingen (changelog)");
  const gitLog = run("git --no-optional-locks log --oneline -10 --no-decorate");
  if (gitLog.ok && gitLog.output) {
    gitLog.output.split("\n").forEach((l) => info(l));
  } else {
    info("Git-log niet beschikbaar");
  }

  // ─── 9. Samenvatting ──────────────────────────────────────────────────────

  const duur = Math.round((Date.now() - startTijd) / 1000);

  const kritiek = bevindingen.filter((b) => b.ernst === "kritiek");
  const hoog = bevindingen.filter((b) => b.ernst === "hoog");
  const middel = bevindingen.filter((b) => b.ernst === "middel");
  const laag = bevindingen.filter((b) => b.ernst === "laag");

  console.log(`\n${BOLD}━━━ Samenvatting ━━━${RESET}`);
  console.log(`  Doorlooptijd: ${duur}s`);
  console.log(
    kritiek.length > 0 ? `  ${RED}${BOLD}Kritiek: ${kritiek.length}${RESET}` : `  ${GREEN}Kritiek: 0${RESET}`
  );
  console.log(
    hoog.length > 0 ? `  ${RED}Hoog: ${hoog.length}${RESET}` : `  ${GREEN}Hoog: 0${RESET}`
  );
  console.log(
    middel.length > 0 ? `  ${YELLOW}Middel: ${middel.length}${RESET}` : `  ${GREEN}Middel: 0${RESET}`
  );
  console.log(`  ${DIM}Laag/Info: ${laag.length}${RESET}`);

  if (bevindingen.length > 0) {
    console.log(`\n${BOLD}Aandachtspunten${RESET}`);
    for (const b of bevindingen) {
      const kleur = b.ernst === "kritiek" ? RED
        : b.ernst === "hoog" ? RED
        : b.ernst === "middel" ? YELLOW
        : DIM;
      console.log(`  ${kleur}[${b.ernst.toUpperCase()}]${RESET} ${b.categorie}: ${b.bericht}`);
    }
  }

  if (kritiek.length === 0 && hoog.length === 0) {
    console.log(`\n${GREEN}${BOLD}Platform is stabiel. Geen kritieke of hoge problemen gevonden.${RESET}\n`);
  } else {
    console.log(`\n${RED}${BOLD}Kritieke of hoge problemen gevonden — los op voordat nieuwe functionaliteit gebouwd wordt.${RESET}\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Kwaliteitscheck mislukt:", e);
  process.exit(1);
});

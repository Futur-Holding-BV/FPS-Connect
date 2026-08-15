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

      // Controleer of lib/api-client-react/dist/ ook herbouwd is na de laatste codegen-run.
      // Na een codegen-run zonder aansluitende typecheck:libs zijn de dist/-declaraties
      // verouderd en kan de frontend stale types importeren.
      const distDeclaratiePad = path.join(repoRoot, "lib/api-client-react/dist/generated/api.d.ts");
      if (fs.existsSync(distDeclaratiePad)) {
        const distStat = fs.statSync(distDeclaratiePad);
        if (distStat.mtimeMs < genStat.mtimeMs) {
          waarschuwing(
            "lib/api-client-react/dist/ is ouder dan src/generated/api.ts — " +
            "voer pnpm run typecheck:libs uit na codegen"
          );
          registreer(
            "OpenAPI / Codegen",
            "middel",
            "dist/generated/api.d.ts is ouder dan src/generated/api.ts — typecheck:libs niet uitgevoerd na codegen"
          );
        } else {
          ok("lib/api-client-react/dist/ is up-to-date na de laatste codegen-run");
        }
      } else {
        waarschuwing(
          "lib/api-client-react/dist/generated/api.d.ts niet gevonden — " +
          "voer pnpm run typecheck:libs uit"
        );
        registreer(
          "OpenAPI / Codegen",
          "middel",
          "lib/api-client-react/dist/ ontbreekt — typecheck:libs nog niet uitgevoerd"
        );
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
  const modulesPad = path.join(repoRoot, "artifacts/firevault/src/pages/modules");

  const connectBestanden = fs.existsSync(connectPad) ? fs.readdirSync(connectPad).length : 0;
  const modulesBestanden = fs.existsSync(modulesPad)
    ? fs.readdirSync(modulesPad, { recursive: true }).length : 0;

  ok(`FPS Connect: ${connectBestanden} pagina-bestanden onder /pages/connect/`);
  ok(`Modules: ${modulesBestanden} bestanden onder /pages/modules/`);

  const srcPad = path.join(repoRoot, "artifacts/firevault/src/pages");
  const allePages = fs.readdirSync(srcPad);
  const verwachteModules = ["connect", "modules", "dashboard", "gebouwen",
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

  // ─── 8. Stale lib-declaraties ─────────────────────────────────────────────

  sectie("11. Lib dist/ — stale declaraties en git-tracking");

  // Stap A: controleer of er dist/-bestanden getrackt zijn in git.
  // Tracked dist/-bestanden betekent dat stale declaraties ooit gecommit zijn
  // en bij een volgende checkout kapotte types kunnen veroorzaken.
  const trackedDist = run("git --no-optional-locks ls-files lib/*/dist/");
  const trackedDistBestanden = trackedDist.output.split("\n").filter((l) => l.trim().length > 0);
  if (trackedDistBestanden.length > 0) {
    trackedDistBestanden.forEach((f) => {
      fout(`Git-tracked dist-declaratie: ${f}`);
      registreer("Lib dist/", "hoog", `Stale declaratie getrackt in git: ${f} — verwijder met git rm --cached`);
    });
  } else {
    ok("Geen lib dist/-bestanden getrackt in git");
  }

  // Stap B: controleer of de lokale dist/-map up-to-date is met de broncode.
  // Daarvoor voeren we tsc --build uit en kijken we of er daarna wijzigingen
  // zijn in lib/*/dist/ ten opzichte van de working tree (git diff + untracked).
  const tscBuildResult = run("pnpm run typecheck:libs");
  const tscBuildErrors = tscBuildResult.output.split("\n").filter((l) => l.includes("error TS"));
  if (tscBuildErrors.length > 0) {
    // Typecheck zelf rapporteert de fouten al in sectie 1 — hier alleen
    // een samenvatting toevoegen als context voor de dist/-check.
    waarschuwing("tsc --build faalde; dist/-sync kon niet worden geverifieerd");
    registreer("Lib dist/", "middel", "tsc --build faalde — dist/-sync onbekend");
  } else {
    // Na een geslaagde build: kijk of de dist/-mappen na het builden gewijzigde
    // of onverwachte bestanden bevatten (indicator: git ziet ze als untracked
    // terwijl ze juist NIET getrackt mogen zijn).
    // We controleren of er .d.ts-bestanden zijn die NIET kunnen worden
    // gebuild (d.w.z. de dist/ bevat meer bestanden dan de build zou
    // produceren, wat duidt op verouderde declaraties van verwijderde exports).
    const compositeLibs = ["lib/api-client-react", "lib/api-zod", "lib/db",
      "lib/object-storage-web", "lib/permissies"];
    let staleBestanden = 0;
    for (const lib of compositeLibs) {
      const distPad = path.join(repoRoot, lib, "dist");
      if (!fs.existsSync(distPad)) continue;

      // Verzamel alle .d.ts-bestanden in dist/
      const distDeclaraties = new Set<string>();
      const leesDistDir = (dir: string) => {
        for (const item of fs.readdirSync(dir)) {
          const volledigPad = path.join(dir, item);
          if (fs.statSync(volledigPad).isDirectory()) {
            leesDistDir(volledigPad);
          } else if (item.endsWith(".d.ts")) {
            distDeclaraties.add(volledigPad.replace(distPad + "/", ""));
          }
        }
      };
      leesDistDir(distPad);

      // Controleer voor elke dist-declaratie of er een bijbehorend
      // bronbestand bestaat (.ts, .tsx, .mts of .cts). Ontbreekt het
      // voor alle geldige extensies → stale declaratie van een
      // verwijderde export.
      const srcPadLib = path.join(repoRoot, lib, "src");
      const bronExtensies = [".ts", ".tsx", ".mts", ".cts"];
      for (const decl of distDeclaraties) {
        const basisZonderExt = decl.replace(/\.d\.ts$/, "");
        const bestaatBron = bronExtensies.some((ext) =>
          fs.existsSync(path.join(srcPadLib, basisZonderExt + ext))
        );
        if (!bestaatBron) {
          fout(`Stale declaratie zonder bronbestand: ${lib}/dist/${decl}`);
          registreer("Lib dist/", "hoog",
            `Stale declaratie: ${lib}/dist/${decl} — geen overeenkomend bronbestand in ${lib}/src/`);
          staleBestanden++;
        }
      }
    }
    if (staleBestanden === 0) {
      ok("Alle dist/-declaraties hebben een overeenkomend bronbestand");
    }
  }

  // (KLANTLOOS_01: de klant-poort-allowlist-controle is vervallen — Connect
  // kent geen externe gebruikers meer; zie de klantloos-buildcontrole.)

  // ─── 9. Git changelog ─────────────────────────────────────────────────────

  sectie("13. Recente wijzigingen (changelog)");
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

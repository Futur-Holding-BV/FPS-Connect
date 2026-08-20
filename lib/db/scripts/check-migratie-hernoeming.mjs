#!/usr/bin/env node
// check-migratie-hernoeming.mjs (SCHEMA_01-bewaker)
//
// Faalt met exit 1 wanneer één of meer migratiebestanden in
// lib/db/src/migrations/ t.o.v. de basis zijn hernoemd of verwijderd zonder
// expliciete, checksum-gecontroleerde HERNUMMERD-reconciliatie.
//
// SCHEMA_01-regel: migraties zijn immutabel zodra ze gedeployed zijn.
// Hernoemen of verwijderen laat verweesd registraties achter in
// prod-`schema_migraties`, waardoor de migratierunner elke volgende
// deploy blokkeert met een harde STOP. Zie docs/schema-migratieketen.md
// en .agents/memory/schema-migratieketen.md voor het herstelpatroon
// (VERWEESD-reconciliatie in migrate.mjs).
//
// Gebruik:
//   node lib/db/scripts/check-migratie-hernoeming.mjs
//   pnpm --filter @workspace/db run check-hernoeming
//
// De check vergelijkt altijd t.o.v. origin/main. Zorg dat origin/main
// bereikbaar is vóór het uitvoeren (in CI: voeg een expliciete fetch-stap toe).
// Als origin/main ontbreekt faalt de check hard — fail-closed.

import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MIGRATIONS_PAD = "lib/db/src/migrations";
const BASIS_REF = process.env.MIGRATIE_BASIS_REF || "origin/main";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATE_BESTAND = path.join(REPO_ROOT, "lib/db/scripts/migrate.mjs");

function gitDiffHernoemdVerwijderd() {
  try {
    // --diff-filter=DR  →  D = deleted, R = renamed (t.o.v. origin/main)
    // --name-only       →  alleen bestandsnamen, geen diff-inhoud
    // --                →  scheidt opties van pad-patronen
    const uitvoer = execFileSync(
      "git",
      ["diff", "--diff-filter=DR", "--name-only", BASIS_REF, "--", MIGRATIONS_PAD],
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return uitvoer.trim().split("\n").filter(Boolean);
  } catch (err) {
    // Basis niet beschikbaar → fail-closed: we weten het niet zeker,
    // dus blokkeren we. Roep in CI eerst 'git fetch origin main' aan.
    const bericht = (err.stderr ?? err.message ?? String(err)).toLowerCase();
    if (
      bericht.includes("unknown revision") ||
      bericht.includes("no such commit") ||
      bericht.includes("not found") ||
      bericht.includes("fatal")
    ) {
      console.error(`[check-hernoeming] STOP: ${BASIS_REF} is niet bereikbaar.`);
      console.error(
        "[check-hernoeming] Voer eerst 'git fetch origin main' uit en probeer opnieuw.",
      );
      console.error(
        "[check-hernoeming] In CI: voeg een 'git fetch origin main --depth=1' stap toe vóór deze check.",
      );
      process.exit(1);
    }
    throw err;
  }
}

function sha256(inhoud) {
  return createHash("sha256").update(inhoud).digest("hex");
}

function leesHernummeringen() {
  const bron = readFileSync(MIGRATE_BESTAND, "utf8");
  const begin = bron.indexOf("const HERNUMMERD = [");
  const einde = bron.indexOf("\n    ];", begin);
  if (begin < 0 || einde < 0) {
    console.error("[check-hernoeming] STOP: HERNUMMERD-register in migrate.mjs niet eenduidig gevonden.");
    process.exit(1);
  }
  const resultaat = new Map();
  const blok = bron.slice(begin, einde);
  const objectRegex = /\{\s*oud:\s*"([^"]+)",([\s\S]*?)\n\s*\},/g;
  for (const match of blok.matchAll(objectRegex)) {
    const oud = match[1];
    const inhoud = match[2];
    const nieuw = inhoud.match(/nieuw:\s*"([^"]+)"/)?.[1];
    const oudeChecksum = inhoud.match(/oudeChecksum:\s*"([a-f0-9]{64})"/)?.[1];
    if (!nieuw || resultaat.has(oud)) {
      console.error(`[check-hernoeming] STOP: ongeldige of dubbele HERNUMMERD-entry voor ${oud}.`);
      process.exit(1);
    }
    resultaat.set(oud, { nieuw, oudeChecksum });
  }
  return resultaat;
}

function controleerHernummering(bestand, hernummeringen) {
  const oud = path.basename(bestand);
  const alias = hernummeringen.get(oud);
  if (!alias) return { toegestaan: false, reden: "geen HERNUMMERD-entry" };
  const nieuwPad = path.join(REPO_ROOT, MIGRATIONS_PAD, alias.nieuw);
  if (!existsSync(nieuwPad)) {
    return { toegestaan: false, reden: `doel ${alias.nieuw} ontbreekt` };
  }
  let oudeInhoud;
  try {
    oudeInhoud = execFileSync("git", ["show", `${BASIS_REF}:${bestand}`], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return { toegestaan: false, reden: `oude inhoud niet leesbaar uit ${BASIS_REF}` };
  }
  const oudeChecksum = sha256(oudeInhoud);
  const nieuweChecksum = sha256(readFileSync(nieuwPad, "utf8"));
  if (oudeChecksum !== nieuweChecksum && alias.oudeChecksum !== oudeChecksum) {
    return { toegestaan: false, reden: "checksum wijkt af en oudeChecksum autoriseert de basisinhoud niet" };
  }
  return { toegestaan: true, nieuw: alias.nieuw };
}

// ─── MIGRATIE_DUBBEL: geen twee migraties met hetzelfde nummer ────────────
//
// De migratierunner sorteert op de volledige bestandsnaam (migrate.mjs:
// readdirSync().filter(/^\d{4}_.+\.sql$/).sort()). Binnen een dubbel paar is
// de volgorde daardoor deterministisch, maar een nieuw dubbel nummer maakt de
// bedoelde volgorde onleesbaar en is de oorzaak van de scheefstand van
// 11 augustus. Nieuwe dubbelen zijn daarom verboden.
//
// De zes bestaande paren hieronder zijn op productie uitgevoerd en onder hun
// huidige bestandsnaam geregistreerd in schema_migraties — hernoemen breekt
// die registratie (SCHEMA_01). Ze blijven staan en zijn per exact
// bestandsnaam-paar uitgezonderd. NIEUWE bestanden mogen NOOIT aan deze
// lijst worden toegevoegd; schrijf gewoon het volgende vrije nummer.
const TOEGESTANE_DUBBELEN = new Map([
  // nummer → exact toegestane set bestandsnamen (beide reeds gedeployed)
  ["0007", ["0007_fie-jaarrealisaties-ak-adviezen.sql", "0007_schemadrift-dev-prod-gelijk.sql"]],
  ["0010", ["0010_mail-notitie-koppeling-scoping.sql", "0010_nummer-kenmerkketen.sql"]],
  ["0013", ["0013_mailbox-sync-status.sql", "0013_wvb-stroom.sql"]],
  ["0014", ["0014_werkinbox-token-gezondheid.sql", "0014_wvb-signaal-dedup.sql"]],
  ["0032", ["0032_kalender.sql", "0032_veldpresets-projectenrecht.sql"]],
  ["0033", ["0033_uren01c-slot-verbruik-per-regel.sql", "0033_werkbak02.sql"]],
]);

// Onafhankelijk van de werkmap (pnpm --filter draait vanuit lib/db).
const MIGRATIES_DIR = new URL("../src/migrations", import.meta.url).pathname;

function controleerDubbeleNummers() {
  const bestanden = readdirSync(MIGRATIES_DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
  const perNummer = new Map();
  for (const f of bestanden) {
    const nr = f.slice(0, 4);
    if (!perNummer.has(nr)) perNummer.set(nr, []);
    perNummer.get(nr).push(f);
  }
  const fouten = [];
  for (const [nr, namen] of perNummer) {
    if (namen.length < 2) continue;
    const toegestaan = TOEGESTANE_DUBBELEN.get(nr);
    const ok =
      toegestaan &&
      namen.length === toegestaan.length &&
      namen.every((n) => toegestaan.includes(n));
    if (!ok) fouten.push({ nr, namen });
  }
  return fouten;
}

// ─── Hulpfunctie: eerstvolgende vrije migratienummer ─────────────────────────
function eerstVrijNummer(bestanden) {
  // Verzamel alle gebruikte nummers (inclusief de zes legacy-paren).
  const gebruikte = new Set(bestanden.map((f) => parseInt(f.slice(0, 4), 10)));
  // Begin bij de hoogste plus één, zoek het eerste aaneengesloten vrije gat.
  let kandidaat = Math.max(0, ...gebruikte) + 1;
  while (gebruikte.has(kandidaat)) kandidaat++;
  return String(kandidaat).padStart(4, "0");
}

const alleBestanden = readdirSync(MIGRATIES_DIR)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();

const dubbelen = controleerDubbeleNummers();
if (dubbelen.length > 0) {
  const vrijNr = eerstVrijNummer(alleBestanden);
  console.error("");
  console.error("╔══════════════════════════════════════════════════════════════╗");
  console.error("║  MIGRATIE_DUBBEL: migratienummer bestaat al                  ║");
  console.error("╚══════════════════════════════════════════════════════════════╝");
  console.error("");
  for (const { nr, namen } of dubbelen) {
    console.error(`  ✗  nummer ${nr} komt ${namen.length}× voor:`);
    for (const n of namen) console.error(`       - ${n}`);
  }
  console.error("");
  console.error(`Eerstvolgende vrije migratienummer: ${vrijNr}`);
  console.error("");
  console.error("Stap-voor-stap herstelpatroon (incident 18-08-2026, nummer 0083):");
  console.error(`  1. Hernummer het NIEUWE bestand naar ${vrijNr}_<omschrijving>.sql`);
  console.error("     (het bestand dat als laatste is toegevoegd / gemerged).");
  console.error("  2. Voeg een HERNUMMERD-entry toe in lib/db/scripts/migrate.mjs");
  console.error("     (stap 2b) zodat databases die het bestand al draaiden onder");
  console.error("     de oude naam automatisch worden omgezet naar de nieuwe naam:");
  console.error("       { oud: '<oud_bestand>.sql',");
  console.error(`         nieuw: '${vrijNr}_<omschrijving>.sql',`);
  console.error("         reden: 'nummerbotsing met <bestaand_bestand> (datum)' }");
  console.error("  3. Voeg het NIET toe aan TOEGESTANE_DUBBELEN — die lijst is");
  console.error("     uitsluitend voor de zes reeds gedeployede legacy-paren.");
  console.error("  Zie ook: docs/technische-schuld.md (MIGRATIE_DUBBEL) en");
  console.error("  docs/schema-migratieketen.md §Hernummering.");
  console.error("");
  process.exit(1);
}
console.log("[check-hernoeming] OK: geen nieuwe dubbele migratienummers (6 legacy-paren uitgezonderd).");

const hernoemd = gitDiffHernoemdVerwijderd();

if (hernoemd.length === 0) {
  console.log(
    `[check-hernoeming] OK: geen hernoemde of verwijderde migratiebestanden t.o.v. ${BASIS_REF}.`,
  );
  process.exit(0);
}

const hernummeringen = leesHernummeringen();
const gecontroleerd = hernoemd.map((bestand) => ({
  bestand,
  ...controleerHernummering(bestand, hernummeringen),
}));
const nietToegestaan = gecontroleerd.filter((item) => !item.toegestaan);
for (const item of gecontroleerd.filter((waarde) => waarde.toegestaan)) {
  console.log(`[check-hernoeming] OK: ${path.basename(item.bestand)} → ${item.nieuw} via checksum-gecontroleerde HERNUMMERD-entry.`);
}
if (nietToegestaan.length === 0) process.exit(0);

console.error("");
console.error("╔══════════════════════════════════════════════════════════════╗");
console.error("║  SCHEMA_01-SCHENDING: hernoemde of verwijderde migratie(s)  ║");
console.error("╚══════════════════════════════════════════════════════════════╝");
console.error("");
console.error(
  `De volgende migratiebestanden zijn hernoemd of verwijderd t.o.v. ${BASIS_REF} zonder geldige reconciliatie:`,
);
for (const item of nietToegestaan) {
  console.error(`  ✗  ${item.bestand} (${item.reden})`);
}
console.error("");
console.error("SCHEMA_01-regel: een migratie mag NOOIT worden hernoemd of");
console.error("verwijderd nadat die gedeployed is. Hernoemde bestanden laten");
console.error("verweesd registraties achter in prod-schema_migraties, waardoor");
console.error("de migratierunner elke volgende deploy blokkeert.");
console.error("");
console.error("Correcte aanpak:");
console.error("  1. Maak het originele bestand (met de originele naam) terug.");
console.error("  2. Schrijf eventuele correcties als een NIEUW genummerd");
console.error("     migratiebestand (volgend NNNN_*.sql).");
console.error("  3. Als het netto schema-effect nul is (kolom toegevoegd én");
console.error("     direct daarna weer verwijderd), raadpleeg dan");
console.error("     docs/schema-migratieketen.md §Uitzondering (VERWEESD).");
console.error("");
process.exit(1);

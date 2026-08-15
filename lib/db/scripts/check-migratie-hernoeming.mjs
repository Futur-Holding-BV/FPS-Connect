#!/usr/bin/env node
// check-migratie-hernoeming.mjs (SCHEMA_01-bewaker)
//
// Faalt met exit 1 wanneer één of meer migratiebestanden in
// lib/db/src/migrations/ t.o.v. origin/main zijn hernoemd of verwijderd.
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

import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";

const MIGRATIONS_PAD = "lib/db/src/migrations";

function gitDiffHernoemdVerwijderd() {
  try {
    // --diff-filter=DR  →  D = deleted, R = renamed (t.o.v. origin/main)
    // --name-only       →  alleen bestandsnamen, geen diff-inhoud
    // --                →  scheidt opties van pad-patronen
    const uitvoer = execSync(
      `git diff --diff-filter=DR --name-only origin/main -- "${MIGRATIONS_PAD}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return uitvoer.trim().split("\n").filter(Boolean);
  } catch (err) {
    // origin/main niet beschikbaar → fail-closed: we weten het niet zeker,
    // dus blokkeren we. Roep in CI eerst 'git fetch origin main' aan.
    const bericht = (err.stderr ?? err.message ?? String(err)).toLowerCase();
    if (
      bericht.includes("unknown revision") ||
      bericht.includes("no such commit") ||
      bericht.includes("not found") ||
      bericht.includes("fatal")
    ) {
      console.error("[check-hernoeming] STOP: origin/main is niet bereikbaar.");
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

const dubbelen = controleerDubbeleNummers();
if (dubbelen.length > 0) {
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
  console.error("Elke migratie krijgt een eigen, nog niet gebruikt nummer.");
  console.error("Hernummer het NIEUWE bestand naar het eerstvolgende vrije");
  console.error("nummer. Voeg het NIET toe aan TOEGESTANE_DUBBELEN — die lijst");
  console.error("is uitsluitend voor de zes reeds gedeployede legacy-paren");
  console.error("(zie docs/technische-schuld.md, MIGRATIE_DUBBEL).");
  console.error("");
  process.exit(1);
}
console.log("[check-hernoeming] OK: geen nieuwe dubbele migratienummers (6 legacy-paren uitgezonderd).");

const hernoemd = gitDiffHernoemdVerwijderd();

if (hernoemd.length === 0) {
  console.log(
    "[check-hernoeming] OK: geen hernoemde of verwijderde migratiebestanden t.o.v. origin/main.",
  );
  process.exit(0);
}

console.error("");
console.error("╔══════════════════════════════════════════════════════════════╗");
console.error("║  SCHEMA_01-SCHENDING: hernoemde of verwijderde migratie(s)  ║");
console.error("╚══════════════════════════════════════════════════════════════╝");
console.error("");
console.error(
  "De volgende migratiebestanden zijn hernoemd of verwijderd t.o.v. origin/main:",
);
for (const bestand of hernoemd) {
  console.error(`  ✗  ${bestand}`);
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

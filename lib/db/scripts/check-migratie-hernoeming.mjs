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

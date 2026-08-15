#!/usr/bin/env node
// check-migratie-wijziging.mjs (SCHEMA_01-bewaker)
//
// Faalt met exit 1 wanneer één of meer migratiebestanden in
// lib/db/src/migrations/ t.o.v. origin/main zijn gewijzigd
// (inhoudelijk aangepast, maar nog steeds dezelfde bestandsnaam).
//
// SCHEMA_01-regel: migraties zijn immutabel zodra ze gedeployed zijn.
// Een inhoudelijke wijziging aan een al-gedraaide migratie leidt ertoe
// dat migrate.mjs alleen een WAARSCHUWING logt maar gewoon doorgaat,
// waardoor de productiedatabase stilzwijgend afwijkt van de broncode.
// Zie docs/schema-migratieketen.md en .agents/memory/schema-migratieketen.md.
//
// Gebruik:
//   node lib/db/scripts/check-migratie-wijziging.mjs
//   pnpm --filter @workspace/db run check-wijziging
//
// De check vergelijkt altijd t.o.v. origin/main. Zorg dat origin/main
// bereikbaar is vóór het uitvoeren (in CI: voeg een expliciete fetch-stap toe).
// Als origin/main ontbreekt faalt de check hard — fail-closed.

import { execSync } from "node:child_process";

const MIGRATIONS_PAD = "lib/db/src/migrations";

function gitDiffGewijzigd() {
  try {
    // --diff-filter=M  →  M = modified (inhoud gewijzigd, naam ongewijzigd)
    // --name-only      →  alleen bestandsnamen, geen diff-inhoud
    // --               →  scheidt opties van pad-patronen
    const uitvoer = execSync(
      `git diff --diff-filter=M --name-only origin/main -- "${MIGRATIONS_PAD}"`,
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
      console.error("[check-wijziging] STOP: origin/main is niet bereikbaar.");
      console.error(
        "[check-wijziging] Voer eerst 'git fetch origin main' uit en probeer opnieuw.",
      );
      console.error(
        "[check-wijziging] In CI: voeg een 'git fetch origin main --depth=1' stap toe vóór deze check.",
      );
      process.exit(1);
    }
    throw err;
  }
}

const gewijzigd = gitDiffGewijzigd();

if (gewijzigd.length === 0) {
  console.log(
    "[check-wijziging] OK: geen gewijzigde migratiebestanden t.o.v. origin/main.",
  );
  process.exit(0);
}

console.error("");
console.error("╔══════════════════════════════════════════════════════════════╗");
console.error("║  SCHEMA_01-SCHENDING: inhoudelijk gewijzigde migratie(s)    ║");
console.error("╚══════════════════════════════════════════════════════════════╝");
console.error("");
console.error(
  "De volgende migratiebestanden zijn inhoudelijk gewijzigd t.o.v. origin/main:",
);
for (const bestand of gewijzigd) {
  console.error(`  ✗  ${bestand}`);
}
console.error("");
console.error("SCHEMA_01-regel: een migratie mag NOOIT inhoudelijk worden");
console.error("aangepast nadat die gedeployed is. migrate.mjs logt hierbij");
console.error("alleen een waarschuwing maar stopt NIET — de productiedatabase");
console.error("loopt dan stilzwijgend uit de pas met de broncode.");
console.error("");
console.error("Correcte aanpak:");
console.error("  1. Herstel het originele bestand naar de inhoud op origin/main.");
console.error("     Gebruik: git checkout origin/main -- <bestand>");
console.error("  2. Schrijf eventuele correcties als een NIEUW genummerd");
console.error("     migratiebestand (volgend NNNN_*.sql).");
console.error("  3. Raadpleeg docs/schema-migratieketen.md voor het volledig");
console.error("     herstelpatroon (VERWEESD-reconciliatie in migrate.mjs).");
console.error("");
process.exit(1);

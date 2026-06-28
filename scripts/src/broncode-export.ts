/**
 * Dagelijkse broncode-export
 *
 * Maakt een compleet, verifieerbaar exportpakket aan van:
 *  - Volledige Git-repository (git-bundle)
 *  - Database-schema (Drizzle TypeScript-bestanden)
 *  - Gegenereerde SQL-migraties
 *  - Herbouwdocumentatie (docs/herbouw/)
 *  - .env.example
 *  - Manifest met checksums (SHA-256)
 *
 * Uitvoeren:
 *   pnpm --filter @workspace/scripts run broncode-export
 *
 * Versleutelen van de bundle:
 *   openssl enc -aes-256-gcm -pbkdf2 -k "$BACKUP_WACHTWOORD" \
 *     -in exports/fps-broncode-YYYY-MM-DD.tar.gz \
 *     -out exports/fps-broncode-YYYY-MM-DD.tar.gz.enc
 */

import { execSync, spawnSync } from "child_process";
import {
  mkdirSync, existsSync, writeFileSync, readFileSync,
  readdirSync, statSync, rmSync,
} from "fs";
import { join, relative } from "path";
import { createHash } from "crypto";

const REPO_ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const EXPORTS_DIR = join(REPO_ROOT, "exports");
const DATUM = new Date().toISOString().slice(0, 10);
const WERK_DIR = join(EXPORTS_DIR, `fps-broncode-${DATUM}`);

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stdout.write(`[broncode-export] ${msg}\n`);
}

function sha256Bestand(pad: string): string {
  const inhoud = readFileSync(pad);
  return createHash("sha256").update(inhoud).digest("hex");
}

function maakTar(bronDir: string, uitvoer: string, bronPad: string) {
  const r = spawnSync("tar", ["-czf", uitvoer, "-C", bronDir, bronPad], {
    stdio: "inherit",
  });
  if (r.status !== 0) throw new Error(`tar mislukt voor ${bronPad}`);
}

function kopieerMap(bron: string, doel: string) {
  mkdirSync(doel, { recursive: true });
  for (const item of readdirSync(bron, { withFileTypes: true })) {
    const bronPad = join(bron, item.name);
    const doelPad = join(doel, item.name);
    if (item.isDirectory()) {
      kopieerMap(bronPad, doelPad);
    } else {
      const inhoud = readFileSync(bronPad);
      writeFileSync(doelPad, inhoud);
    }
  }
}

// ─── Exportstappen ────────────────────────────────────────────────────────────

function stap1GitBundle() {
  log("Stap 1/6 — Git-bundle aanmaken...");
  const uitvoer = join(WERK_DIR, "fps-connect.bundle");
  const r = spawnSync(
    "git",
    ["bundle", "create", uitvoer, "--all"],
    { cwd: REPO_ROOT, stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error("git bundle mislukt");
  log(`  → ${uitvoer}`);
  return uitvoer;
}

function stap2Schema() {
  log("Stap 2/6 — Database-schema kopiëren...");
  const bron = join(REPO_ROOT, "lib", "db", "src", "schema");
  const tijdelijk = join(WERK_DIR, "schema-src");
  kopieerMap(bron, tijdelijk);

  const uitvoer = join(WERK_DIR, "db-schema.tar.gz");
  maakTar(WERK_DIR, uitvoer, "schema-src");
  rmSync(tijdelijk, { recursive: true });
  log(`  → ${uitvoer}`);
  return uitvoer;
}

function stap3Migraties() {
  log("Stap 3/6 — SQL-migraties kopiëren...");
  const bron = join(REPO_ROOT, "lib", "db", "drizzle");
  if (!existsSync(bron)) {
    log("  → Geen migraties gevonden (overgeslagen)");
    return null;
  }
  const tijdelijk = join(WERK_DIR, "migraties");
  kopieerMap(bron, tijdelijk);

  const uitvoer = join(WERK_DIR, "db-migraties.tar.gz");
  maakTar(WERK_DIR, uitvoer, "migraties");
  rmSync(tijdelijk, { recursive: true });
  log(`  → ${uitvoer}`);
  return uitvoer;
}

function stap4Documentatie() {
  log("Stap 4/6 — Herbouwdocumentatie kopiëren...");
  const bron = join(REPO_ROOT, "docs", "herbouw");
  const tijdelijk = join(WERK_DIR, "herbouw-docs");
  kopieerMap(bron, tijdelijk);

  // Voeg ook deployment.md toe
  const deployment = join(REPO_ROOT, "docs", "deployment.md");
  if (existsSync(deployment)) {
    writeFileSync(
      join(tijdelijk, "deployment.md"),
      readFileSync(deployment),
    );
  }

  const uitvoer = join(WERK_DIR, "herbouw-documentatie.tar.gz");
  maakTar(WERK_DIR, uitvoer, "herbouw-docs");
  rmSync(tijdelijk, { recursive: true });
  log(`  → ${uitvoer}`);
  return uitvoer;
}

function stap5EnvExample() {
  log("Stap 5/6 — .env.example kopiëren...");
  const bron = join(REPO_ROOT, ".env.example");
  const uitvoer = join(WERK_DIR, "env.example.txt");
  if (existsSync(bron)) {
    writeFileSync(uitvoer, readFileSync(bron));
    log(`  → ${uitvoer}`);
  } else {
    log("  → .env.example niet gevonden (overgeslagen)");
  }
}

function stap6Manifest(bestanden: string[]) {
  log("Stap 6/6 — Manifest met checksums aanmaken...");

  let gitCommit = "onbekend";
  try {
    gitCommit = execSync("git rev-parse HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch { /* ignore */ }

  const manifest = {
    aangemaakt: new Date().toISOString(),
    gitCommit,
    bestanden: bestanden
      .filter(Boolean)
      .map((pad) => ({
        bestand: relative(WERK_DIR, pad),
        grootte: statSync(pad).size,
        sha256: sha256Bestand(pad),
      })),
  };

  const uitvoer = join(WERK_DIR, "manifest.json");
  writeFileSync(uitvoer, JSON.stringify(manifest, null, 2));
  log(`  → ${uitvoer}`);

  // Druk manifest af voor verificatie
  log("\nExport-manifest:");
  for (const b of manifest.bestanden) {
    log(`  ${b.bestand}`);
    log(`    SHA-256: ${b.sha256}`);
    log(`    Grootte: ${(b.grootte / 1024).toFixed(1)} KB`);
  }
}

// ─── Alles samenvoegen in één tar.gz ──────────────────────────────────────────

function maakFinalePakket() {
  log("\nAlles samenvoegen in eindpakket...");
  const uitvoer = join(EXPORTS_DIR, `fps-broncode-${DATUM}.tar.gz`);
  maakTar(EXPORTS_DIR, uitvoer, `fps-broncode-${DATUM}`);
  rmSync(WERK_DIR, { recursive: true });

  const grootte = (statSync(uitvoer).size / 1024 / 1024).toFixed(1);
  log(`\nEindpakket: ${uitvoer}`);
  log(`Grootte: ${grootte} MB`);
  log(`SHA-256: ${sha256Bestand(uitvoer)}`);
  log(`\nVersleutelen met:`);
  log(`  openssl enc -aes-256-gcm -pbkdf2 -k "$BACKUP_WACHTWOORD" \\`);
  log(`    -in ${uitvoer} \\`);
  log(`    -out ${uitvoer}.enc`);
}

// ─── Hoofdfunctie ─────────────────────────────────────────────────────────────

async function main() {
  log(`FPS Connect — broncode-export ${DATUM}`);
  log("=".repeat(50));

  mkdirSync(WERK_DIR, { recursive: true });

  const bundlePad = stap1GitBundle();
  const schemaPad = stap2Schema();
  const migratiesPad = stap3Migraties();
  const docsPad = stap4Documentatie();
  stap5EnvExample();

  const bestanden = [bundlePad, schemaPad, docsPad];
  if (migratiesPad) bestanden.push(migratiesPad);

  // env.example is geen tar.gz — voeg het apart toe
  const envPad = join(WERK_DIR, "env.example.txt");
  if (existsSync(envPad)) bestanden.push(envPad);

  stap6Manifest(bestanden);
  maakFinalePakket();

  log("\nExport geslaagd.");
  log("Bewaar het eindpakket op een tweede locatie (NAS of fysieke schijf).");
  log("Zie docs/herbouw/backup-restore.md voor instructies.");
}

main().catch((err) => {
  process.stderr.write(`[broncode-export] FOUT: ${(err as Error).message}\n`);
  process.exit(1);
});

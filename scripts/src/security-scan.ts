import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

type Severity = "critical" | "high" | "moderate" | "low" | "info";

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Kritiek",
  high: "Hoog",
  moderate: "Middel",
  low: "Laag",
  info: "Info",
};

function run(command: string): string {
  try {
    return execSync(command, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return e.stdout ?? e.stderr ?? "";
  }
}

function parseJson<T>(raw: string): T | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

interface AuditAdvisory {
  module_name?: string;
  severity?: Severity;
  title?: string;
  patched_versions?: string;
  url?: string;
  vulnerable_versions?: string;
}

interface AuditReport {
  advisories?: Record<string, AuditAdvisory>;
  metadata?: {
    vulnerabilities?: Record<Severity, number>;
  };
}

interface OutdatedEntry {
  current?: string;
  latest?: string;
  wanted?: string;
}

function line(char = "=", length = 60): string {
  return char.repeat(length);
}

function scanDependencies(): { critical: number; high: number } {
  console.log(line());
  console.log("1. Afhankelijkheden — bekende kwetsbaarheden (pnpm audit)");
  console.log(line());

  const raw = run("pnpm audit --json");
  const report = parseJson<AuditReport>(raw);

  if (!report) {
    console.log("Kon de audit-uitvoer niet lezen. Ruwe uitvoer:");
    console.log(raw.slice(0, 2000) || "(geen uitvoer)");
    return { critical: 0, high: 0 };
  }

  const counts = report.metadata?.vulnerabilities ?? {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    info: 0,
  };

  const order: Severity[] = ["critical", "high", "moderate", "low", "info"];
  for (const sev of order) {
    console.log(`  ${SEVERITY_LABEL[sev].padEnd(8)}: ${counts[sev] ?? 0}`);
  }

  const advisories = Object.values(report.advisories ?? {});
  const ernstig = advisories.filter(
    (a) => a.severity === "critical" || a.severity === "high",
  );

  if (ernstig.length > 0) {
    console.log("");
    console.log("Belangrijkste bevindingen (kritiek/hoog):");
    for (const a of ernstig.slice(0, 15)) {
      const sev = a.severity ? SEVERITY_LABEL[a.severity] : "?";
      const fix = a.patched_versions
        ? `oplossing: ${a.patched_versions}`
        : "geen patch beschikbaar";
      console.log(
        `  [${sev}] ${a.module_name ?? "?"} (${a.vulnerable_versions ?? "?"}) — ${a.title ?? ""} (${fix})`,
      );
    }
  }

  return { critical: counts.critical ?? 0, high: counts.high ?? 0 };
}

function scanOutdated(): void {
  console.log("");
  console.log(line());
  console.log("2. Verouderde pakketten (pnpm outdated)");
  console.log(line());

  const raw = run("pnpm -r outdated --format json");
  const report = parseJson<Record<string, OutdatedEntry>>(raw);

  if (!report || Object.keys(report).length === 0) {
    console.log("  Alle pakketten zijn up-to-date of geen gegevens beschikbaar.");
    return;
  }

  const entries = Object.entries(report);
  console.log(`  ${entries.length} pakket(ten) hebben een nieuwere versie:`);
  for (const [naam, info] of entries.slice(0, 25)) {
    console.log(`  ${naam}: ${info.current ?? "?"} -> ${info.latest ?? "?"}`);
  }
  if (entries.length > 25) {
    console.log(`  ... en nog ${entries.length - 25} andere.`);
  }
}

function main(): void {
  console.log(line());
  console.log("FPS Brandpreventie — Nachtelijke beveiligingsscan");
  console.log(`Datum: ${new Date().toISOString()}`);
  console.log(line());
  console.log("");

  const { critical, high } = scanDependencies();
  scanOutdated();

  console.log("");
  console.log(line());
  console.log("Samenvatting");
  console.log(line());
  if (critical > 0 || high > 0) {
    console.log(
      `LET OP: ${critical} kritieke en ${high} hoge kwetsbaarheid(en) gevonden. Beoordeel en plan een update in.`,
    );
  } else {
    console.log("Geen kritieke of hoge kwetsbaarheden gevonden.");
  }
  console.log(
    "Updates worden NIET automatisch toegepast — beoordeel en test wijzigingen handmatig.",
  );
}

main();

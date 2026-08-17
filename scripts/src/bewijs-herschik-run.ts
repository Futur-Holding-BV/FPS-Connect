// Validatie-runner voor het herschik-bewijs (Task #873/#876).
//
// Validatiestappen draaien parallel (Project-workflow is "parallel"). De
// api-server dev-script doet bovendien een onvoorwaardelijke `fuser -k
// 8080/tcp`, dus meeliften op de gedeelde poort 8080 is een race met de
// e2e-runners. Daarom start deze runner ALTIJD een eigen api-server-instantie
// (build + kale start, zónder port-kill) op een per-run dynamisch toegewezen
// vrije poort, en wijst het bewijsscript daarheen via BEWIJS_API_BASIS.
// Gereedheid is gebonden aan het eigen kindproces: elke exit vóór gereedheid
// (ook exit 0) telt als opstartfout, en de health-check telt alleen zolang het
// eigen kind nog draait — we valideren dus nooit per ongeluk tegen een
// vreemde server. Na afloop wordt alleen de eigen procesgroep afgesloten.
//
// Draaien: pnpm --filter @workspace/scripts run bewijs-herschik-ci
import "./lib/prodGuard";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import net from "node:net";

const WORKSPACE_ROOT = new URL("../../", import.meta.url).pathname;
const START_TIMEOUT_MS = 180_000;

function log(bericht: string): void {
  process.stdout.write(`[bewijs-herschik-runner] ${bericht}\n`);
}

// Vraagt het OS om een vrije poort (listen op 0) en geeft die direct weer vrij.
function vrijePoort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const adres = server.address();
      if (adres == null || typeof adres === "string") {
        server.close(() => reject(new Error("Kon geen vrije poort bepalen.")));
        return;
      }
      const poort = adres.port;
      server.close(() => resolve(poort));
    });
  });
}

// Eén poging om de health-URL te bereiken. true = bereikbaar (2xx).
function isBereikbaar(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let afgerond = false;
    const klaar = (waarde: boolean) => {
      if (!afgerond) {
        afgerond = true;
        resolve(waarde);
      }
    };
    const req = http.get(url, { timeout: 5_000 }, (res) => {
      const ok = (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300;
      res.resume();
      klaar(ok);
    });
    req.on("timeout", () => {
      req.destroy();
      klaar(false);
    });
    req.on("error", () => klaar(false));
  });
}

function wacht(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let apiServer: ChildProcess | null = null;
let apiServerGestopt = false;

// Start een eigen api-server op de gegeven poort. Bewust NIET via het
// dev-script: dat doet `fuser -k 8080/tcp` en zou een parallel draaiende
// runner/workflow doden. In plaats daarvan: build (idempotent) + kale start.
async function startEigenApiServer(poort: number, healthUrl: string): Promise<void> {
  // Fail fast: als de zojuist toegewezen poort tóch al door iets anders wordt
  // beantwoord, stoppen we — we mogen nooit tegen een vreemde server valideren.
  if (await isBereikbaar(healthUrl)) {
    throw new Error(`Poort ${poort} wordt al door een andere server beantwoord; run afgebroken.`);
  }

  log(`eigen api-server starten op poort ${poort} (build naar dist-bewijs + start, zonder port-kill)...`);
  // Eigen outdir (API_BUILD_OUTDIR): het build-script wist zijn outdir eerst,
  // dus bouwen naar het gedeelde dist/ zou een parallel draaiende e2e-runner
  // zijn lazy-geladen modules onder de voeten wegtrekken.
  const commando =
    "API_BUILD_OUTDIR=dist-bewijs pnpm --filter @workspace/api-server run build && " +
    "cd artifacts/api-server && node --enable-source-maps ./dist-bewijs/index.mjs";
  const kind = spawn("bash", ["-lc", commando], {
    cwd: WORKSPACE_ROOT,
    env: { ...process.env, PORT: String(poort), NODE_ENV: "development" },
    stdio: "inherit",
    detached: true,
  });
  apiServer = kind;
  apiServerGestopt = false;
  kind.on("exit", () => {
    apiServerGestopt = true;
  });

  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // Elke exit vóór gereedheid — ook exit 0 — is een opstartfout.
    if (apiServerGestopt || kind.exitCode !== null) {
      throw new Error(`api-server-proces stopte vóór gereedheid (exit ${kind.exitCode}).`);
    }
    // Alleen gereed als de health-check slaagt ÉN het eigen kind nog draait,
    // zodat een reactie nooit van een vreemd proces kan komen.
    if ((await isBereikbaar(healthUrl)) && !apiServerGestopt && kind.exitCode === null) {
      log("api-server: gezond.");
      return;
    }
    await wacht(3_000);
  }
  throw new Error(
    `api-server werd niet gezond binnen ${Math.round(START_TIMEOUT_MS / 1000)}s (${healthUrl}).`,
  );
}

// Sluit alleen de eigen instantie af (hele procesgroep, detached → -pid).
function stopEigenApiServer(): void {
  const kind = apiServer;
  if (!kind || kind.pid == null || kind.killed) return;
  try {
    process.kill(-kind.pid, "SIGTERM");
  } catch {
    try {
      kind.kill("SIGTERM");
    } catch {
      // best-effort
    }
  }
}

function draaiBewijs(poort: number): Promise<number> {
  return new Promise((resolve) => {
    const kind = spawn(
      "pnpm",
      ["--filter", "@workspace/scripts", "exec", "tsx", "src/bewijs-task873-herschik.ts"],
      {
        cwd: WORKSPACE_ROOT,
        env: { ...process.env, BEWIJS_API_BASIS: `http://localhost:${poort}/api` },
        stdio: "inherit",
      },
    );
    kind.on("exit", (code) => resolve(code ?? 1));
    kind.on("error", () => resolve(1));
  });
}

async function main(): Promise<void> {
  let exitCode = 1;
  try {
    const poort = await vrijePoort();
    const healthUrl = `http://localhost:${poort}/api/healthz`;
    await startEigenApiServer(poort, healthUrl);
    log("api-server gezond, bewijsscript starten.");
    exitCode = await draaiBewijs(poort);
    // Extra zekerheid: als onze server tijdens de test wegviel, is het
    // resultaat niet betrouwbaar — hard laten falen.
    if (apiServerGestopt) {
      log("Fout: eigen api-server viel weg tijdens de test; resultaat onbetrouwbaar.");
      exitCode = 1;
    }
  } catch (err) {
    log(`Fout: ${(err as Error).message}`);
    exitCode = 1;
  } finally {
    stopEigenApiServer();
  }
  process.exit(exitCode);
}

void main();

// Validatie-runner voor de E2E web-test (gebouw-detail + voorziening-detail).
//
// Deze wrapper zorgt dat de benodigde services draaien voordat Playwright start:
//   - api-server (poort 8080, /api/healthz)
//   - firevault web-app (proxy op REPLIT_DEV_DOMAIN of localhost:80)
// Reeds draaiende services worden hergebruikt; ontbrekende services worden hier
// opgestart en na afloop weer afgesloten. Daarna draait `playwright test` met
// de web-config en wordt de exitcode doorgegeven.
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web-ci
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import https from "node:https";

import {
  archiveerE2eBedragenAccounts,
  archiveerE2eUitvoeringAccounts,
  archiveerE2eUurcodesAccount,
  archiveerE2eWebAccount,
  archiveerE2eWebAdminAccount,
} from "./e2e-monteur-testaccount";
import { archiveerE2eWachtwoordAccounts } from "./e2e-wachtwoord-testaccounts";

const WORKSPACE_ROOT = new URL("../../", import.meta.url).pathname;

type Service = {
  naam: string;
  healthUrl: string;
  startCommando: string;
  startEnv: Record<string, string>;
  startTimeoutMs: number;
};

const devDomain = process.env.REPLIT_DEV_DOMAIN;

const services: Service[] = [
  {
    naam: "api-server",
    healthUrl: "http://localhost:8080/api/healthz",
    startCommando: "pnpm --filter @workspace/api-server run dev",
    startEnv: { PORT: "8080", NODE_ENV: "development" },
    startTimeoutMs: 120_000,
  },
  {
    naam: "firevault web",
    // De web-app draait via de gedeelde proxy. REPLIT_DEV_DOMAIN is de
    // externe proxy-url; als die ontbreekt vallen we terug op localhost:80.
    healthUrl: devDomain
      ? `https://${devDomain}/`
      : "http://localhost:80/",
    startCommando: "pnpm --filter @workspace/firevault run dev",
    startEnv: { PORT: "25392", BASE_PATH: "/", NODE_ENV: "development" },
    startTimeoutMs: 90_000,
  },
];

function log(bericht: string): void {
  process.stdout.write(`[e2e-web-runner] ${bericht}\n`);
}

function isBereikbaar(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let afgerond = false;
    const klaar = (waarde: boolean) => {
      if (!afgerond) {
        afgerond = true;
        resolve(waarde);
      }
    };
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(
      url,
      { timeout: 5_000, rejectUnauthorized: false },
      (res) => {
        const ok = (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 400;
        res.resume();
        klaar(ok);
      },
    );
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

async function wachtTotGezond(service: Service, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isBereikbaar(service.healthUrl)) return true;
    await wacht(3_000);
  }
  return false;
}

const opgestart: ChildProcess[] = [];

// ───────────────────────── Suite-mutex ─────────────────────────
// E2e-suites (e2e-menu en e2e-web) delen de api-server-poort 8080 en kunnen
// in CI-validatie parallel starten. Cross-suite hergebruik van elkaars
// api-server is fundamenteel onveilig: de CI-harnas ruimt bij het einde van
// een validatiestap de complete procesboom van die stap op (ook detached
// kinderen), waardoor de zustersuite midden in haar run 502's krijgt.
// Oplossing: één suite tegelijk. De tweede runner wacht tot de mutex vrij is
// en start daarna zijn eigen services in zijn eigen procesboom.
const SUITE_MUTEX_PAD = "/tmp/e2e-suite.lock";
const SUITE_MUTEX_STALE_MS = 20 * 60_000; // suite duurt ~4 min; 20 min = zeker stale
const SUITE_MUTEX_WACHT_MS = 15 * 60_000;

let suiteMutexVerkregen = false;

function probeerSuiteMutex(): boolean {
  try {
    mkdirSync(SUITE_MUTEX_PAD);
    return true;
  } catch {
    // bestaat al
  }
  try {
    const st = statSync(SUITE_MUTEX_PAD);
    if (Date.now() - st.mtimeMs > SUITE_MUTEX_STALE_MS) {
      log(`Suite-mutex ouder dan ${SUITE_MUTEX_STALE_MS / 60_000} min — stale, opruimen.`);
      rmSync(SUITE_MUTEX_PAD, { recursive: true, force: true });
      mkdirSync(SUITE_MUTEX_PAD);
      return true;
    }
  } catch {
    // race met andere runner — volgende poll-poging
  }
  return false;
}

async function verkrijgSuiteMutex(): Promise<void> {
  const deadline = Date.now() + SUITE_MUTEX_WACHT_MS;
  let gemeld = false;
  while (Date.now() < deadline) {
    if (probeerSuiteMutex()) {
      suiteMutexVerkregen = true;
      log("Suite-mutex verkregen.");
      return;
    }
    if (!gemeld) {
      log("Andere e2e-suite draait — wachten tot die klaar is...");
      gemeld = true;
    }
    await wacht(5_000);
  }
  throw new Error(
    `Suite-mutex niet verkregen binnen ${SUITE_MUTEX_WACHT_MS / 60_000} minuten.`,
  );
}

function geefSuiteMutexVrij(): void {
  if (!suiteMutexVerkregen) return;
  suiteMutexVerkregen = false;
  try {
    rmSync(SUITE_MUTEX_PAD, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}




// Roep het development-only reset-endpoint aan om de in-memory login-rate-limiter
// te legen zonder de api-server te herstarten (herstart verbreekt sessies waardoor
// TOTP-stap-2 mislukt voor lopende browser-tests).
async function resetRateLimiter(): Promise<void> {
  const url = "http://localhost:80/api/auth/e2e-rate-reset";
  const gelukt = await new Promise<boolean>((resolve) => {
    const req = http.request(
      url,
      { method: "DELETE", timeout: 5_000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 204);
      },
    );
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
    req.end();
  });
  if (gelukt) {
    log("api-server: rate-limiter gewist via /auth/e2e-rate-reset.");
  } else {
    log("WAARSCHUWING: rate-limiter reset mislukt (endpoint niet bereikbaar?); doorgaan.");
  }
}

async function zorgServiceDraait(service: Service): Promise<void> {
  if (!service.healthUrl) {
    throw new Error(`Geen health-URL voor ${service.naam}.`);
  }

  for (let poging = 0; poging < 3; poging++) {
    if (await isBereikbaar(service.healthUrl)) {
      log(`${service.naam}: draait al, hergebruiken.`);
      return;
    }
    if (poging < 2) {
      log(`${service.naam}: niet bereikbaar (poging ${poging + 1}/3), 5s wachten...`);
      await wacht(5_000);
    }
  }


  log(`${service.naam}: niet bereikbaar, opstarten...`);
  const startTijd = Date.now();
  const kind = spawn("bash", ["-lc", service.startCommando], {
    cwd: WORKSPACE_ROOT,
    env: { ...process.env, ...service.startEnv },
    stdio: "inherit",
    detached: true,
  });
  opgestart.push(kind);

  // Detecteer vroegtijdige exit (poortconflict bij parallelle runners).
  // Als het kindproces binnen 10 seconden afsluit met fout, verwijder het
  // uit opgestart zodat stopOpgestarteServices() geen concurrent-service doodt.
  kind.on("exit", (code) => {
    if (code !== 0 && code !== null && Date.now() - startTijd < 10_000) {
      const idx = opgestart.indexOf(kind);
      if (idx !== -1) opgestart.splice(idx, 1);
    }
  });

  const gezond = await wachtTotGezond(service, service.startTimeoutMs);
  if (!gezond) {
    throw new Error(
      `${service.naam} werd niet gezond binnen ${Math.round(service.startTimeoutMs / 1000)}s (${service.healthUrl}).`,
    );
  }
  log(`${service.naam}: gezond.`);
}

function stopOpgestarteServices(): void {
  for (const kind of opgestart) {
    if (kind.pid == null || kind.killed) continue;
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
}

function draaiPlaywright(): Promise<number> {
  return new Promise((resolve) => {
    const kind = spawn(
      "pnpm",
      ["--filter", "@workspace/scripts", "run", "e2e-web"],
      {
        cwd: WORKSPACE_ROOT,
        env: process.env,
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
    await verkrijgSuiteMutex();
    for (const service of services) {
      await zorgServiceDraait(service);
    }
    // Wis de in-memory login-rate-limiter via het development-only endpoint.
    // Vorige runs kunnen de teller hebben opgebouwd → 429 → TOTP nooit zichtbaar.
    // Geen server-herstart nodig: sessies blijven intact voor browser-TOTP-tests.
    await resetRateLimiter();
    log("Alle services gezond, Playwright starten.");
    exitCode = await draaiPlaywright();
  } catch (err) {
    log(`Fout: ${(err as Error).message}`);
    exitCode = 1;
  } finally {
    // Testaccounts altijd archiveren/deactiveren (ook bij falende tests),
    // zodat ze niet zichtbaar blijven in Gebruikersbeheer. De volgende run
    // activeert ze opnieuw via de idempotente seeder.
    try {
      // Zowel de wachtwoord-testaccounts als het eigen web-account (gebruikt
      // door web-gebouw-detail en web-offerte-badge specs). Bewust NIET het
      // monteur-account: de monteur-suite kan parallel draaien en beheert
      // haar eigen account.
      await archiveerE2eWachtwoordAccounts();
      await archiveerE2eWebAccount();
      await archiveerE2eWebAdminAccount();
      await archiveerE2eBedragenAccounts();
      await archiveerE2eUitvoeringAccounts();
      await archiveerE2eUurcodesAccount();
      log("E2e-testaccounts gearchiveerd en gedeactiveerd.");
    } catch (err) {
      log(`Waarschuwing: opruimen e2e-testaccounts mislukt: ${(err as Error).message}`);
    }
    stopOpgestarteServices();
    geefSuiteMutexVrij();
  }
  process.exit(exitCode);
}

void main();

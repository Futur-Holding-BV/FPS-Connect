// Validatie-runner voor de E2E menu-test (radiaal startmenu).
//
// Deze wrapper zorgt dat de benodigde services draaien voordat Playwright start:
//   - api-server (poort 8080, /api/healthz)
//   - expo monteur-app (Expo dev-domein, /status)
// Reeds draaiende services worden hergebruikt; ontbrekende services worden hier
// opgestart en na afloop weer afgesloten. Daarna draait `playwright test` en
// wordt de exitcode doorgegeven, zodat de validatiestap zichtbaar slaagt/faalt.
//
// Draaien: pnpm --filter @workspace/scripts run e2e-monteur
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import https from "node:https";

import { archiveerE2eAccount } from "./e2e-monteur-testaccount";

const WORKSPACE_ROOT = new URL("../../", import.meta.url).pathname;

type Service = {
  naam: string;
  healthUrl: string;
  startCommando: string;
  startEnv: Record<string, string>;
  // Hoe lang we maximaal wachten tot de service gezond is (ms).
  startTimeoutMs: number;
};

const expoDomain = process.env.REPLIT_EXPO_DEV_DOMAIN;

const services: Service[] = [
  {
    naam: "api-server",
    // Directe service-poort: de proxy hoeft hiervoor niet betrokken te worden.
    healthUrl: "http://localhost:8080/api/healthz",
    startCommando: "pnpm --filter @workspace/api-server run dev",
    startEnv: { PORT: "8080", NODE_ENV: "development" },
    startTimeoutMs: 120_000,
  },
  {
    naam: "expo monteur-app",
    // De Expo-app draait buiten de /api-proxy op het Expo dev-domein.
    healthUrl: expoDomain ? `https://${expoDomain}/status` : "",
    startCommando: "pnpm --filter @workspace/monteur-app run dev",
    startEnv: { PORT: "21646", BASE_PATH: "/monteur-app/" },
    startTimeoutMs: 180_000,
  },
];

function log(bericht: string): void {
  process.stdout.write(`[e2e-runner] ${bericht}\n`);
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
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(
      url,
      { timeout: 5_000, rejectUnauthorized: false },
      (res) => {
        const ok = (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300;
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

// Pollt tot de service bereikbaar is of de timeout verstrijkt.
async function wachtTotGezond(
  service: Service,
  timeoutMs: number,
): Promise<boolean> {
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




// Zorgt dat één service draait. Hergebruikt een al draaiende instantie; start
// hem anders zelf op en wacht tot hij gezond is.
// Meerdere pogingen vóórdat we concluderen dat de service niet draait — dit
// voorkomt dat een momenteel-herbouwende workflow-service (die even niet
// antwoordt) onterecht als "niet draaiend" wordt beschouwd en we een tweede
// instantie starten die een poortconflict veroorzaakt.
async function zorgServiceDraait(service: Service): Promise<void> {
  if (!service.healthUrl) {
    throw new Error(
      `Geen health-URL voor ${service.naam} (ontbreekt REPLIT_EXPO_DEV_DOMAIN?).`,
    );
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
      `${service.naam} werd niet gezond binnen ${Math.round(
        service.startTimeoutMs / 1000,
      )}s (${service.healthUrl}).`,
    );
  }
  log(`${service.naam}: gezond.`);
}

// Sluit alleen de services die deze runner zelf heeft opgestart.
function stopOpgestarteServices(): void {
  for (const kind of opgestart) {
    if (kind.pid == null || kind.killed) continue;
    try {
      // Het hele procesgroep afsluiten (detached → negatieve pid).
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
    // Hergebruik het bestaande npm-script (`playwright test`); pnpm zet de juiste
    // node_modules/.bin op het PATH zodat de binary betrouwbaar gevonden wordt.
    const kind = spawn(
      "pnpm",
      ["--filter", "@workspace/scripts", "run", "e2e-monteur"],
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

// Pre-warmt de Expo web-bundle door de rootpagina én de menu-route op te halen.
// Metro compileert elke route-chunk pas op het eerste verzoek; dat kan 30-60s duren.
// De menu-route heeft een eigen lazy chunk die na login geladen wordt — die compileert
// hier alvast zodat de Playwright-test niet op compilatie hoeft te wachten.
async function preWarmUrl(url: string): Promise<void> {
  log(`Pre-warm: ${url}`);
  const startMs = Date.now();
  await new Promise<void>((resolve) => {
    const req = https.get(url, { rejectUnauthorized: false, timeout: 90_000 }, (res) => {
      res.resume();
      res.on("end", resolve);
      res.on("error", () => resolve());
    });
    req.on("error", () => resolve());
    req.on("timeout", () => { req.destroy(); resolve(); });
  });
  log(`Pre-warm klaar: ${url} (${Math.round((Date.now() - startMs) / 1000)}s).`);
}

async function preWarmExpoBundle(): Promise<void> {
  if (!expoDomain) return;
  try {
    // Root eerst — Metro opent de bundler; menu-chunk laadt daarna snel parallel.
    await preWarmUrl(`https://${expoDomain}/`);
    // Menu-route lazy-compileert na login; alvast opwarmen zodat de test niet wacht.
    await preWarmUrl(`https://${expoDomain}/menu`);
  } catch {
    log("Pre-warm mislukt (niet fataal).");
  }
}

async function main(): Promise<void> {
  let exitCode = 1;
  try {
    await verkrijgSuiteMutex();
    for (const service of services) {
      await zorgServiceDraait(service);
    }
    await preWarmExpoBundle();
    log("Alle services gezond, Playwright starten.");
    exitCode = await draaiPlaywright();
  } catch (err) {
    log(`Fout: ${(err as Error).message}`);
    exitCode = 1;
  } finally {
    // Testaccount altijd archiveren/deactiveren (ook bij falende tests),
    // zodat het niet zichtbaar blijft in Gebruikersbeheer. De volgende run
    // activeert het opnieuw via de idempotente seeder.
    try {
      await archiveerE2eAccount();
      log("E2e-testaccount gearchiveerd en gedeactiveerd.");
    } catch (err) {
      log(`Waarschuwing: opruimen e2e-testaccount mislukt: ${(err as Error).message}`);
    }
    stopOpgestarteServices();
    geefSuiteMutexVrij();
  }
  process.exit(exitCode);
}

void main();

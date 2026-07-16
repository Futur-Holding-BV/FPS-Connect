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

// Zorgt dat één service draait. Hergebruikt een al draaiende instantie; start
// hem anders zelf op en wacht tot hij gezond is.
async function zorgServiceDraait(service: Service): Promise<void> {
  if (!service.healthUrl) {
    throw new Error(
      `Geen health-URL voor ${service.naam} (ontbreekt REPLIT_EXPO_DEV_DOMAIN?).`,
    );
  }

  if (await isBereikbaar(service.healthUrl)) {
    log(`${service.naam}: draait al, hergebruiken.`);
    return;
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

async function main(): Promise<void> {
  let exitCode = 1;
  try {
    for (const service of services) {
      await zorgServiceDraait(service);
    }
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
  }
  process.exit(exitCode);
}

void main();

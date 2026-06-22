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
import http from "node:http";
import https from "node:https";

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

async function zorgServiceDraait(service: Service): Promise<void> {
  if (!service.healthUrl) {
    throw new Error(`Geen health-URL voor ${service.naam}.`);
  }

  if (await isBereikbaar(service.healthUrl)) {
    log(`${service.naam}: draait al, hergebruiken.`);
    return;
  }

  log(`${service.naam}: niet bereikbaar, opstarten...`);
  const kind = spawn("bash", ["-lc", service.startCommando], {
    cwd: WORKSPACE_ROOT,
    env: { ...process.env, ...service.startEnv },
    stdio: "inherit",
    detached: true,
  });
  opgestart.push(kind);

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
    for (const service of services) {
      await zorgServiceDraait(service);
    }
    log("Alle services gezond, Playwright starten.");
    exitCode = await draaiPlaywright();
  } catch (err) {
    log(`Fout: ${(err as Error).message}`);
    exitCode = 1;
  } finally {
    stopOpgestarteServices();
  }
  process.exit(exitCode);
}

void main();

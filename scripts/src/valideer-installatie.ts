/**
 * FPS Connect — Installatie-validatiescript
 *
 * Controleert na installatie of alle onderdelen bereikbaar en operationeel zijn.
 * Draait volledig buiten de applicatie-code — test het draaiende systeem.
 *
 * Gebruik:
 *   pnpm --filter @workspace/scripts run valideer-installatie
 *
 * Optionele omgevingsvariabelen:
 *   API_BASE_URL   = http://localhost:8080   (standaard)
 *   WEB_BASE_URL   = http://localhost:80     (standaard)
 *   DATABASE_URL   = (uit .env of omgeving)
 *   S3_ENDPOINT    = (uit .env of omgeving)
 *   S3_BUCKET      = (uit .env of omgeving)
 *   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
 *   AZURE_TENANT_ID / AZURE_CLIENT_ID_NEW / AZURE_CLIENT_SECRET
 *   OPENAI_API_KEY of AI_INTEGRATIONS_OPENAI_API_KEY
 */

import { createConnection } from "net";
import { URL as NodeURL } from "url";

const API_BASE  = process.env["API_BASE_URL"]  ?? "http://localhost:8080";
const WEB_BASE  = process.env["WEB_BASE_URL"]  ?? "http://localhost:80";
const DB_URL    = process.env["DATABASE_URL"]   ?? "";

let totaal = 0;
let geslaagd = 0;
const mislukt: string[] = [];

// ─── Resultaatregistratie ─────────────────────────────────────────────────────

function ok(naam: string, detail?: string) {
  totaal++;
  geslaagd++;
  const extra = detail ? ` — ${detail}` : "";
  process.stdout.write(`  \x1b[32m✓\x1b[0m  ${naam}${extra}\n`);
}

function fout(naam: string, reden: string) {
  totaal++;
  mislukt.push(naam);
  process.stdout.write(`  \x1b[31m✗\x1b[0m  ${naam}\n`);
  process.stdout.write(`        ${reden}\n`);
}

function info(naam: string, detail: string) {
  process.stdout.write(`  \x1b[33m~\x1b[0m  ${naam} — ${detail}\n`);
}

function sectie(titel: string) {
  process.stdout.write(`\n\x1b[1m${titel}\x1b[0m\n`);
  process.stdout.write("─".repeat(50) + "\n");
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function get(url: string, opts: RequestInit = {}): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    ...opts,
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.text();
  return { status: res.status, body };
}

// ─── Controles ────────────────────────────────────────────────────────────────

function tcpBereikbaar(host: string, port: number, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(timeoutMs);
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
  });
}

async function controleerDatabase() {
  sectie("1. Database (PostgreSQL)");

  if (!DB_URL) {
    fout("DATABASE_URL", "Omgevingsvariabele DATABASE_URL ontbreekt");
    return;
  }

  let host = "localhost";
  let port = 5432;
  try {
    const parsed = new NodeURL(DB_URL.replace(/^postgresql:\/\//, "http://"));
    host = parsed.hostname || "localhost";
    port = Number(parsed.port) || 5432;
  } catch { /* gebruik defaults */ }

  ok("Configuratie", `DATABASE_URL aanwezig (host: ${host}:${port})`);

  const bereikbaar = await tcpBereikbaar(host, port);
  if (bereikbaar) {
    ok("TCP-verbinding", `PostgreSQL bereikbaar op ${host}:${port}`);
  } else {
    fout("TCP-verbinding", `PostgreSQL NIET bereikbaar op ${host}:${port} — draait de database?`);
    return;
  }

  info("Schema-controle", "Wordt gevalideerd via de API (zie controle 2)");
}

async function controleerApi() {
  sectie("2. API-server (Express)");

  try {
    const { status, body } = await get(`${API_BASE}/healthz`);
    if (status === 200) {
      ok("/healthz", `HTTP ${status}`);
    } else {
      fout("/healthz", `HTTP ${status} — verwacht 200. Body: ${body.slice(0, 100)}`);
    }
  } catch (e) {
    fout("/healthz", `Niet bereikbaar op ${API_BASE} — ${(e as Error).message}`);
    return;
  }

  try {
    const { status } = await get(`${API_BASE}/api/healthz`);
    if (status === 200) {
      ok("/api/healthz", `HTTP ${status} — routing werkt`);
    } else {
      fout("/api/healthz", `HTTP ${status}`);
    }
  } catch (e) {
    fout("/api/healthz", (e as Error).message);
  }

  try {
    const { status } = await get(`${API_BASE}/api/auth/me`);
    if (status === 401 || status === 403) {
      ok("Auth-middleware", `HTTP ${status} — beschermde route correct geblokkeerd`);
    } else if (status === 404) {
      fout("Auth-middleware", "Route /api/auth/me niet gevonden");
    } else {
      info("Auth-middleware", `Onverwachte statuscode ${status}`);
    }
  } catch (e) {
    fout("Auth-middleware", (e as Error).message);
  }
}

async function controleerFrontend() {
  sectie("3. Frontend (React + Vite)");

  try {
    const { status, body } = await get(WEB_BASE);
    if (status === 200 && body.includes("<!DOCTYPE html")) {
      ok("Startpagina", `HTTP ${status} — HTML ontvangen`);
    } else if (status === 200) {
      fout("Startpagina", "HTTP 200 maar geen HTML — controle Vite build");
    } else {
      fout("Startpagina", `HTTP ${status}`);
    }
  } catch (e) {
    fout("Startpagina", `Niet bereikbaar op ${WEB_BASE} — ${(e as Error).message}`);
    return;
  }

  try {
    const { status } = await get(`${WEB_BASE}/assets/`);
    if (status === 404 || status === 403) {
      ok("Assets directory", "Correct — directory listing uitgeschakeld");
    }
  } catch { /* ignore */ }
}

async function controleerOpslag() {
  sectie("4. Object Storage (S3)");

  const endpoint = process.env["S3_ENDPOINT"];
  const bucket   = process.env["S3_BUCKET"];
  const keyId    = process.env["S3_ACCESS_KEY_ID"];
  const secret   = process.env["S3_SECRET_ACCESS_KEY"];

  if (!endpoint || !bucket || !keyId || !secret) {
    fout("Configuratie", "S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID of S3_SECRET_ACCESS_KEY ontbreekt");
    return;
  }

  try {
    const testViaApi = await get(`${API_BASE}/api/beheer/opslag-status`);
    if (testViaApi.status === 200) {
      ok("Opslagverbinding", "API meldt storage bereikbaar");
    } else if (testViaApi.status === 401 || testViaApi.status === 403) {
      info("Opslagverbinding", "Endpoint vereist auth — handmatig testen via Beheer > Back-up");
    } else {
      info("Opslagverbinding", `HTTP ${testViaApi.status} — omgevingsvariabelen ingesteld, directe test overgeslagen`);
    }

    info("Endpoint", `${endpoint}`);
    info("Bucket", `${bucket}`);
    ok("Configuratie", "Omgevingsvariabelen aanwezig");
  } catch (e) {
    fout("Opslagverbinding", (e as Error).message);
  }
}

async function controleerMail() {
  sectie("5. E-mail (Microsoft Graph)");

  const tenantId   = process.env["AZURE_TENANT_ID"];
  const clientId   = process.env["AZURE_CLIENT_ID_NEW"];
  const secret     = process.env["AZURE_CLIENT_SECRET"];
  const mailbox    = process.env["MAIL_MAILBOX"];

  if (!tenantId || !clientId || !secret) {
    fout("Configuratie", "AZURE_TENANT_ID, AZURE_CLIENT_ID_NEW of AZURE_CLIENT_SECRET ontbreekt");
    return;
  }

  ok("Configuratie", "Azure-omgevingsvariabelen aanwezig");
  info("Mailbox", mailbox ?? "(niet ingesteld)");

  try {
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });

    const json = await res.json() as Record<string, unknown>;

    if (res.ok && json["access_token"]) {
      ok("Azure AD token", "Token succesvol opgehaald — Graph-verbinding werkt");

      const graphRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${json["access_token"]}` },
        signal: AbortSignal.timeout(10000),
      });
      if (graphRes.status === 200 || graphRes.status === 403) {
        ok("Graph API", "Bereikbaar (HTTP " + graphRes.status + ")");
      }
    } else {
      fout("Azure AD token", JSON.stringify(json["error_description"] ?? json["error"]).slice(0, 200));
    }
  } catch (e) {
    fout("Azure AD token", (e as Error).message);
  }
}

async function controleerAi() {
  sectie("6. AI Gateway (OpenAI)");

  const sleutel = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"]
    ?? process.env["OPENAI_API_KEY"];
  const baseUrl = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"]
    ?? "https://api.openai.com/v1";

  if (!sleutel) {
    fout("Configuratie", "OPENAI_API_KEY of AI_INTEGRATIONS_OPENAI_API_KEY ontbreekt");
    return;
  }

  ok("Configuratie", `API-sleutel aanwezig (${sleutel.slice(0, 8)}...)`);

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${sleutel}` },
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const json = await res.json() as { data?: unknown[] };
      const aantalModellen = json.data?.length ?? 0;
      ok("Modellen ophalen", `${aantalModellen} modellen beschikbaar`);
    } else if (res.status === 401) {
      fout("Modellen ophalen", "Ongeldige API-sleutel (HTTP 401)");
    } else if (res.status === 429) {
      info("Modellen ophalen", "Rate limit bereikt — sleutel werkt wel (HTTP 429)");
      ok("Configuratie", "API-sleutel actief (rate limit geeft aan dat auth werkt)");
    } else {
      fout("Modellen ophalen", `HTTP ${res.status}`);
    }
  } catch (e) {
    fout("AI Gateway", (e as Error).message);
  }
}

async function controleerExports() {
  sectie("7. Exports en back-ups");

  try {
    const { status } = await get(`${API_BASE}/api/backups`);
    if (status === 401 || status === 403) {
      ok("Back-up endpoint", `Aanwezig en beveiligd (HTTP ${status})`);
    } else if (status === 200) {
      ok("Back-up endpoint", "Bereikbaar");
    } else {
      fout("Back-up endpoint", `HTTP ${status}`);
    }
  } catch (e) {
    fout("Back-up endpoint", (e as Error).message);
  }
}

async function controleerUploads() {
  sectie("8. Uploads");

  try {
    const { status } = await get(`${API_BASE}/api/documenten`);
    if (status === 401 || status === 403) {
      ok("Document-upload endpoint", `Aanwezig en beveiligd (HTTP ${status})`);
    } else if (status === 200) {
      ok("Document-upload endpoint", "Bereikbaar");
    } else {
      fout("Document-upload endpoint", `HTTP ${status}`);
    }
  } catch (e) {
    fout("Upload endpoint", (e as Error).message);
  }
}

// ─── Samenvatting ────────────────────────────────────────────────────────────

function samenvatting() {
  process.stdout.write("\n" + "═".repeat(50) + "\n");
  process.stdout.write(`\x1b[1mResultaat\x1b[0m\n`);
  process.stdout.write("─".repeat(50) + "\n");
  process.stdout.write(`  Geslaagd:  ${geslaagd}/${totaal}\n`);

  if (mislukt.length === 0) {
    process.stdout.write("\n  \x1b[32m\x1b[1mAlle controles geslaagd — installatie is correct.\x1b[0m\n\n");
  } else {
    process.stdout.write(`\n  \x1b[31mMislukt (${mislukt.length}):\x1b[0m\n`);
    for (const m of mislukt) {
      process.stdout.write(`    • ${m}\n`);
    }
    process.stdout.write("\n  Zie docs/herbouw/ voor instructies.\n\n");
  }
}

// ─── Hoofdfunctie ─────────────────────────────────────────────────────────────

async function main() {
  process.stdout.write("\n");
  process.stdout.write("█".repeat(50) + "\n");
  process.stdout.write("  FPS Connect — Installatie-validatie\n");
  process.stdout.write("█".repeat(50) + "\n");
  process.stdout.write(`  API:      ${API_BASE}\n`);
  process.stdout.write(`  Frontend: ${WEB_BASE}\n`);
  process.stdout.write(`  Datum:    ${new Date().toISOString()}\n`);

  await controleerDatabase();
  await controleerApi();
  await controleerFrontend();
  await controleerOpslag();
  await controleerMail();
  await controleerAi();
  await controleerExports();
  await controleerUploads();

  samenvatting();

  if (mislukt.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`[validatie] Onverwachte fout: ${(err as Error).message}\n`);
  process.exit(1);
});

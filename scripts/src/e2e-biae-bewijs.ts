// BIAE (Business Intelligence & Automation Engine) — bewijsvoering
//
// Doel: aantonen dat de centrale BIAE-bus als gated systeem-eindpunt werkt en dat
// de vier lees-endpoints correcte, geaggregeerde data teruggeven na een echte
// authenticatie (wachtwoord + TOTP) als hoofdbeheerder.
//
// Scenario's:
//   1. Ongeauthenticeerd verzoek op elk BIAE-endpoint → 401 (fail-closed gating)
//   2. Admin-login (wachtwoord + TOTP) → capabilities-endpoint toont 7 adapters
//   3. compliance-signalen + kpi-feed geven een geldige gestructureerde respons
import { authenticator } from "otplib";
import {
  setupE2eWachtwoordAccounts,
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_ADMIN_TOTP_SECRET,
} from "./e2e-wachtwoord-testaccounts";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) {
  console.error("REPLIT_DEV_DOMAIN ontbreekt — kan niet tegen de dev-omgeving testen.");
  process.exit(1);
}
const BASIS = `https://${DOMEIN}/api`;

class Sessie {
  private cookies = new Map<string, string>();
  async fetch(pad: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (init?.body) headers.set("Content-Type", "application/json");
    const cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.set("Cookie", cookie);
    const res = await fetch(`${BASIS}${pad}`, { ...init, headers, redirect: "manual" });
    for (const sc of res.headers.getSetCookie()) {
      const [paar] = sc.split(";");
      const idx = paar.indexOf("=");
      if (idx > 0) {
        const naam = paar.slice(0, idx).trim();
        const waarde = paar.slice(idx + 1).trim();
        if (waarde === "" || /expires=Thu, 01 Jan 1970/i.test(sc)) this.cookies.delete(naam);
        else this.cookies.set(naam, waarde);
      }
    }
    return res;
  }
  post(pad: string, body?: unknown): Promise<Response> {
    return this.fetch(pad, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  }
  get(pad: string): Promise<Response> {
    return this.fetch(pad);
  }
}

async function json<T = any>(res: Response): Promise<T> {
  const tekst = await res.text();
  try {
    return JSON.parse(tekst) as T;
  } catch {
    return tekst as unknown as T;
  }
}

function eis(voorwaarde: boolean, stap: string, detail: string): void {
  if (!voorwaarde) throw new Error(`FAIL — ${stap}: ${detail}`);
}

async function versTotp(secret: string, minResterendeSec = 10): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) {
    await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  }
  return authenticator.generate(secret);
}

function log(regel: string): void {
  console.log(regel);
}

const BIAE_PADEN = [
  "/biae/capabilities",
  "/biae/events",
  "/biae/compliance-signalen",
  "/biae/kpi/2026",
];

async function main(): Promise<void> {
  log(`BIAE Bewijsvoering — ${new Date().toISOString()} — doel: ${BASIS}`);

  // ── SCENARIO 1: fail-closed gating (ongeauthenticeerd) ──────────────────────
  {
    const anon = new Sessie();
    for (const pad of BIAE_PADEN) {
      const r = await anon.get(pad);
      eis(r.status === 401, "scenario 1", `${pad} gaf ${r.status}, verwacht 401`);
    }
    log(`SCENARIO 1 PASS — alle ${BIAE_PADEN.length} BIAE-endpoints gaven 401 zonder sessie (fail-closed gating)`);
  }

  // Voorbereiding: admin-sessie (wachtwoord + TOTP)
  await setupE2eWachtwoordAccounts();
  const admin = new Sessie();
  {
    const r1 = await admin.post("/auth/login", {
      email: E2E_WW_ADMIN_EMAIL,
      wachtwoord: E2E_WW_ADMIN_WACHTWOORD,
    });
    const b1 = await json(r1);
    eis(r1.status === 200 && b1.status === "verify_2fa", "voorbereiding", `admin-login gaf ${r1.status} ${JSON.stringify(b1)}`);
    const code = await versTotp(E2E_WW_ADMIN_TOTP_SECRET, 10);
    const r2 = await admin.post("/auth/2fa/verify", { code });
    const b2 = await json(r2);
    eis(r2.status === 200 && b2.rol === "hoofdbeheerder", "voorbereiding", `admin 2FA-verify gaf ${r2.status} ${JSON.stringify(b2)}`);
    log(`Voorbereiding: admin ingelogd via wachtwoord + TOTP → 200, rol=${b2.rol}`);
  }

  // ── SCENARIO 2: capabilities toont de geregistreerde adapters ───────────────
  {
    const r = await admin.get("/biae/capabilities");
    const b = await json(r);
    eis(r.status === 200, "scenario 2", `capabilities gaf ${r.status}`);
    const lijst = Array.isArray(b) ? b : b.capabilities ?? b.items ?? [];
    eis(Array.isArray(lijst) && lijst.length >= 7, "scenario 2", `verwacht >=7 capabilities, kreeg ${lijst.length}`);
    const sleutels = lijst.map((c: any) => c.sleutel ?? c.naam ?? c.id).filter(Boolean);
    log(`SCENARIO 2 PASS — ${lijst.length} capabilities geregistreerd: ${sleutels.join(", ")}`);
  }

  // ── SCENARIO 3: compliance-signalen + kpi-feed geven geldige structuur ───────
  {
    const rc = await admin.get("/biae/compliance-signalen");
    const bc = await json(rc);
    eis(rc.status === 200, "scenario 3", `compliance-signalen gaf ${rc.status}`);
    const signalen = Array.isArray(bc) ? bc : bc.signalen ?? bc.items ?? [];
    eis(Array.isArray(signalen), "scenario 3", `compliance-signalen is geen lijst: ${JSON.stringify(bc).slice(0, 200)}`);

    const rk = await admin.get("/biae/kpi/2026");
    const bk = await json(rk);
    eis(rk.status === 200, "scenario 3", `kpi-feed gaf ${rk.status}`);
    eis(
      bk && typeof bk === "object" && "compliance_signalen" in bk && "fie_observaties" in bk,
      "scenario 3",
      `kpi-feed mist verwachte velden: ${JSON.stringify(bk).slice(0, 200)}`,
    );
    log(
      `SCENARIO 3 PASS — compliance-signalen lijst (${signalen.length} rijen), kpi-feed 2026 volledig: ` +
        `open_goedkeuringen=${bk.open_goedkeuringen}, compliance open=${bk.compliance_signalen?.open}, ` +
        `fie observaties=${bk.fie_observaties?.totaal}`,
    );
  }

  log("BIAE Bewijsvoering — ALLE SCENARIO'S GESLAAGD");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });

// Bewijs: documenten per bedrijfsverzekering (VERZEKERING-DOC)
// A: polis aanmaken + document uploaden per soort (polis, uitsluitingen)
// B: lijst per verzekering toont soorten; archiveren verplaatst naar archief
// C: download levert het bestand; verwijderen ruimt op; ongeldige soort = 400
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-verzekering-documenten.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import {
  setupE2eWachtwoordAccounts,
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_ADMIN_TOTP_SECRET,
} from "./e2e-wachtwoord-testaccounts";

const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
let cookie = "";
let geslaagd = 0;
let mislukt = 0;

function check(naam: string, ok: boolean, detail?: string) {
  if (ok) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { mislukt++; console.log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

async function api(pad: string, init: RequestInit = {}): Promise<Response> {
  const resp = await fetch(`${BASE}${pad}`, {
    ...init,
    headers: { ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), cookie, ...(init.headers ?? {}) },
  });
  const setCookie = resp.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return resp;
}

async function login() {
  await setupE2eWachtwoordAccounts();
  const r1 = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD }) });
  if (!r1.ok) throw new Error(`login faalde: ${r1.status}`);
  const code = authenticator.generate(E2E_WW_ADMIN_TOTP_SECRET);
  const r2 = await api("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code }) });
  if (!r2.ok) throw new Error(`2fa faalde: ${r2.status}`);
}

async function main() {
  await login();
  console.log("Ingelogd als e2e-hoofdbeheerder\n");

  // A — polis + uploads
  console.log("Bewijs A: polis + documentupload per soort");
  const polisResp = await api("/organisatie/verzekeringen", {
    method: "POST",
    body: JSON.stringify({ type: "CYBER", maatschappij: "Bewijs BV", polisnummer: "BWJS-001", status: "actief" }),
  });
  check("polis aangemaakt (201)", polisResp.status === 201, String(polisResp.status));
  const polis = await polisResp.json() as { id: number };

  async function uploadDoc(soort: string, naam: string): Promise<{ status: number; body: { id?: number; soort?: string; error?: string } }> {
    const fd = new FormData();
    fd.append("bestand", new Blob([`inhoud ${naam}`], { type: "application/pdf" }), `${naam}.pdf`);
    fd.append("soort", soort);
    const resp = await api(`/organisatie/verzekeringen/${polis.id}/documenten`, { method: "POST", body: fd });
    return { status: resp.status, body: (await resp.json()) as { id?: number; soort?: string; error?: string } };
  }

  const up1 = await uploadDoc("polis", "polisblad");
  check("upload soort=polis (201)", up1.status === 201 && up1.body.soort === "polis", JSON.stringify(up1));
  const up2 = await uploadDoc("uitsluitingen", "uitsluitingenclausule");
  check("upload soort=uitsluitingen (201)", up2.status === 201, String(up2.status));
  const upFout = await uploadDoc("geheim", "x");
  check("ongeldige soort geweigerd (400)", upFout.status === 400, String(upFout.status));

  // B — lijst + archiveren
  console.log("\nBewijs B: lijst per verzekering + archiveren");
  const lijst1 = await (await api(`/organisatie/verzekeringen/${polis.id}/documenten`)).json() as Array<{ id: number; soort: string; gearchiveerd: boolean }>;
  check("lijst bevat 2 documenten", lijst1.length === 2, String(lijst1.length));
  check("soorten aanwezig", lijst1.some((d) => d.soort === "polis") && lijst1.some((d) => d.soort === "uitsluitingen"));

  const archResp = await api(`/organisatie/verzekeringen/${polis.id}/documenten/${up2.body.id}`, {
    method: "PATCH", body: JSON.stringify({ gearchiveerd: true }),
  });
  check("archiveren (200)", archResp.status === 200);
  const lijst2 = await (await api(`/organisatie/verzekeringen/${polis.id}/documenten`)).json() as Array<{ id: number; gearchiveerd: boolean }>;
  check("document staat in archief", lijst2.find((d) => d.id === up2.body.id)?.gearchiveerd === true);

  // C — download + verwijderen
  console.log("\nBewijs C: download + verwijderen");
  const dl = await api(`/organisatie/verzekeringen/${polis.id}/documenten/${up1.body.id}/download`);
  const dlTekst = await dl.text();
  check("download 200 + inhoud klopt", dl.status === 200 && dlTekst === "inhoud polisblad", `${dl.status} ${dlTekst.slice(0, 40)}`);

  const delDoc = await api(`/organisatie/verzekeringen/${polis.id}/documenten/${up1.body.id}`, { method: "DELETE" });
  check("document verwijderd (200)", delDoc.status === 200, String(delDoc.status));
  const dlNaDelete = await api(`/organisatie/verzekeringen/${polis.id}/documenten/${up1.body.id}/download`);
  check("download na verwijderen = 404 (opslag ook opgeruimd)", dlNaDelete.status === 404, String(dlNaDelete.status));
  await api(`/organisatie/verzekeringen/${polis.id}/documenten/${up2.body.id}`, { method: "DELETE" });
  const lijst3 = await (await api(`/organisatie/verzekeringen/${polis.id}/documenten`)).json() as unknown[];
  check("documenten verwijderd", lijst3.length === 0, String(lijst3.length));
  const delPolis = await api(`/organisatie/verzekeringen/${polis.id}`, { method: "DELETE" });
  check("testpolis opgeruimd", delPolis.ok, String(delPolis.status));

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${mislukt} mislukt`);
  process.exit(mislukt === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });

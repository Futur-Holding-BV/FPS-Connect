// Smoketest: medewerker-wizard endpoints
//
// Verifieert het basispad van de 4 nieuwe endpoint-groepen:
//   1. Middelen          — POST → GET → PATCH → DELETE
//   2. Onboarding-taken  — POST → GET → PATCH → DELETE
//   3. AI-voorstellen    — GET geeft lege lijst terug op nieuwe medewerker
//   4. Heranalyseer      — POST geeft 200 terug
//   5. Wizard-status     — GET geeft huidige status terug
//   6. Wizard-voortgang  — PATCH slaat stap op
//
// Draaien: pnpm --filter @workspace/scripts run smoketest-wizard-endpoints
//
// Vereist: de api-server workflow moet draaien en REPLIT_DEV_DOMAIN moet gezet zijn.
// Hergebruikt het vaste e2e-admin testaccount zodat er geen login-details
// in de repo hoeven te staan.

import { eq } from "drizzle-orm";
import { authenticator } from "otplib";
import {
  db,
  medewerkersTable,
  hrmMiddelenTable,
  hrmOnboardingTakenTable,
} from "@workspace/db";

import {
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_TOTP_SECRET,
  E2E_WW_ADMIN_WACHTWOORD,
  setupE2eWachtwoordAccounts,
  archiveerE2eWachtwoordAccounts,
} from "./e2e-wachtwoord-testaccounts";
import {
  maakWegwerpOnboardingGebruiker,
  verwijderWegwerpOnboardingGebruikers,
} from "./e2e-onboarding-testgebruikers";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) {
  console.error("REPLIT_DEV_DOMAIN ontbreekt — stel de env-variabele in.");
  process.exit(1);
}
const BASIS = `https://${DOMEIN}/api`;

// ── Hulpklassen ───────────────────────────────────────────────────────────────

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
  patch(pad: string, body: unknown): Promise<Response> {
    return this.fetch(pad, { method: "PATCH", body: JSON.stringify(body) });
  }
  get(pad: string): Promise<Response> {
    return this.fetch(pad, { method: "GET" });
  }
  del(pad: string): Promise<Response> {
    return this.fetch(pad, { method: "DELETE" });
  }
}

async function json<T = unknown>(res: Response): Promise<T> {
  const tekst = await res.text();
  try { return JSON.parse(tekst) as T; } catch { return tekst as unknown as T; }
}

function eis(voorwaarde: boolean, stap: string, detail: string): void {
  if (!voorwaarde) throw new Error(`FAIL — ${stap}: ${detail}`);
}

const bewijs: string[] = [];
function log(regel: string): void {
  bewijs.push(regel);
  console.log(regel);
}

async function versTotp(secret: string, minResterendeSec = 8): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) {
    await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  }
  return authenticator.generate(secret);
}

// ── Hoofdprogramma ────────────────────────────────────────────────────────────

let aangemaakteMedewerkerId: number | null = null;

async function main(): Promise<void> {
  const ts = Date.now();
  log(`Wizard-endpoint smoketest — ${new Date().toISOString()} — doel: ${BASIS}`);

  // ── Voorbereiding: admin-sessie ─────────────────────────────────────────────
  await setupE2eWachtwoordAccounts();
  const admin = new Sessie();
  {
    const r1 = await admin.post("/auth/login", {
      email: E2E_WW_ADMIN_EMAIL,
      wachtwoord: E2E_WW_ADMIN_WACHTWOORD,
    });
    const b1 = await json<{ status?: string }>(r1);
    eis(r1.status === 200 && b1.status === "verify_2fa", "voorbereiding", `login gaf ${r1.status} ${JSON.stringify(b1)}`);
    const code = await versTotp(E2E_WW_ADMIN_TOTP_SECRET, 10);
    const r2 = await admin.post("/auth/2fa/verify", { code });
    const b2 = await json<{ rol?: string }>(r2);
    eis(r2.status === 200 && b2.rol === "hoofdbeheerder", "voorbereiding", `2FA-verify gaf ${r2.status} ${JSON.stringify(b2)}`);
    log("Voorbereiding PASS — admin ingelogd als hoofdbeheerder");
  }

  // ── STAP 1: Medewerker aanmaken ─────────────────────────────────────────────
  // POST /medewerkers vereist sinds de onboarding-consolidatie een bestaand
  // gebruikersaccount (gebruiker_id verplicht) — maak eerst een wegwerp-account.
  let medewerkerId: number;
  {
    const gebruiker = await maakWegwerpOnboardingGebruiker("Smoketest Wizard");
    const r = await admin.post("/medewerkers", {
      naam: `Smoketest Wizard ${ts}`,
      werkmaatschappij: "FPS Brandpreventie",
      dienstverband: "vast",
      gebruiker_id: gebruiker.id,
    });
    const b = await json<{ id?: number; naam?: string }>(r);
    eis(r.status === 201 && typeof b.id === "number", "stap 1", `POST /medewerkers gaf ${r.status} ${JSON.stringify(b)}`);
    medewerkerId = b.id!;
    aangemaakteMedewerkerId = medewerkerId;
    // DB-bewijs
    const [rij] = await db.select({ id: medewerkersTable.id, naam: medewerkersTable.naam }).from(medewerkersTable).where(eq(medewerkersTable.id, medewerkerId));
    eis(!!rij, "stap 1", "medewerker niet gevonden in DB na aanmaken");
    log(`STAP 1 PASS — medewerker aangemaakt: 201, id=${medewerkerId}, naam=${rij.naam}`);
  }

  // ── STAP 2: Wizard-status ophalen ───────────────────────────────────────────
  {
    const r = await admin.get(`/medewerkers/${medewerkerId}/wizard-status`);
    const b = await json<{ id?: number; medewerker_status?: string; huidig_stap?: number }>(r);
    eis(r.status === 200 && b.id === medewerkerId, "stap 2", `GET wizard-status gaf ${r.status} ${JSON.stringify(b)}`);
    eis(typeof b.medewerker_status === "string", "stap 2", "medewerker_status ontbreekt in response");
    eis(typeof b.huidig_stap === "number", "stap 2", "huidig_stap ontbreekt in response");
    log(`STAP 2 PASS — wizard-status: 200, status=${b.medewerker_status}, huidig_stap=${b.huidig_stap}`);
  }

  // ── STAP 3: Wizard-voortgang opslaan ────────────────────────────────────────
  {
    const r = await admin.patch(`/medewerkers/${medewerkerId}/wizard-voortgang`, {
      stap: 2,
      medewerker_status: "in_aanmaken",
      voortgang_data: { naam_ingevuld: true },
    });
    const b = await json<{ huidig_stap?: number; medewerker_status?: string }>(r);
    eis(r.status === 200 && b.huidig_stap === 2, "stap 3", `PATCH wizard-voortgang gaf ${r.status} ${JSON.stringify(b)}`);
    eis(b.medewerker_status === "in_aanmaken", "stap 3", `medewerker_status onjuist: ${b.medewerker_status}`);
    log(`STAP 3 PASS — wizard-voortgang: 200, huidig_stap=2, medewerker_status=in_aanmaken`);
  }

  // ── STAP 4: Middelen — POST → GET → PATCH → DELETE ─────────────────────────
  let middelId: number;
  {
    // POST
    const rPost = await admin.post(`/medewerkers/${medewerkerId}/middelen`, {
      categorie: "gereedschap",
      naam: "Smoketest Laptop",
      status: "aangevraagd",
      retour_vereist: true,
    });
    const bPost = await json<{ id?: number; naam?: string; status?: string }>(rPost);
    eis(rPost.status === 201 && typeof bPost.id === "number", "stap 4 POST", `POST middel gaf ${rPost.status} ${JSON.stringify(bPost)}`);
    middelId = bPost.id!;

    // DB-bewijs
    const [rij] = await db.select({ id: hrmMiddelenTable.id, naam: hrmMiddelenTable.naam }).from(hrmMiddelenTable).where(eq(hrmMiddelenTable.id, middelId));
    eis(!!rij, "stap 4 POST", "middel niet gevonden in DB na aanmaken");
    log(`STAP 4 POST PASS — middel aangemaakt: id=${middelId}, naam=${rij.naam}`);

    // GET
    const rGet = await admin.get(`/medewerkers/${medewerkerId}/middelen`);
    const bGet = await json<Array<{ id: number }>>(rGet);
    eis(rGet.status === 200 && Array.isArray(bGet), "stap 4 GET", `GET middelen gaf ${rGet.status} ${JSON.stringify(bGet)}`);
    eis(bGet.some((m) => m.id === middelId), "stap 4 GET", `nieuw middel id=${middelId} niet in lijst`);
    log(`STAP 4 GET PASS — ${bGet.length} middel(en) opgehaald, nieuw middel aanwezig`);

    // PATCH
    const rPatch = await admin.patch(`/hrm/middelen/${middelId}`, { status: "uitgegeven", naam: "Smoketest Laptop (bijgewerkt)" });
    const bPatch = await json<{ status?: string; naam?: string }>(rPatch);
    eis(rPatch.status === 200 && bPatch.status === "uitgegeven", "stap 4 PATCH", `PATCH middel gaf ${rPatch.status} ${JSON.stringify(bPatch)}`);
    eis(bPatch.naam === "Smoketest Laptop (bijgewerkt)", "stap 4 PATCH", `naam niet bijgewerkt: ${bPatch.naam}`);
    log(`STAP 4 PATCH PASS — middel bijgewerkt: status=uitgegeven, naam gewijzigd`);

    // DELETE
    const rDel = await admin.del(`/hrm/middelen/${middelId}`);
    eis(rDel.status === 204, "stap 4 DELETE", `DELETE middel gaf ${rDel.status}`);
    const [verwijderd] = await db.select({ id: hrmMiddelenTable.id }).from(hrmMiddelenTable).where(eq(hrmMiddelenTable.id, middelId));
    eis(!verwijderd, "stap 4 DELETE", "middel nog aanwezig in DB na verwijderen");
    log(`STAP 4 DELETE PASS — middel verwijderd: 204, niet meer in DB`);
  }

  // ── STAP 5: Onboarding-taken — POST → GET → PATCH → DELETE ─────────────────
  let taakId: number;
  {
    // POST
    const rPost = await admin.post(`/medewerkers/${medewerkerId}/onboarding-taken`, {
      naam: "Smoketest: Arbeidscontract ondertekenen",
      status: "openstaand",
      categorie: "administratie",
      volgorde: 1,
    });
    const bPost = await json<{ id?: number; naam?: string; status?: string }>(rPost);
    eis(rPost.status === 201 && typeof bPost.id === "number", "stap 5 POST", `POST onboarding-taak gaf ${rPost.status} ${JSON.stringify(bPost)}`);
    taakId = bPost.id!;

    // DB-bewijs
    const [rij] = await db.select({ id: hrmOnboardingTakenTable.id, naam: hrmOnboardingTakenTable.naam }).from(hrmOnboardingTakenTable).where(eq(hrmOnboardingTakenTable.id, taakId));
    eis(!!rij, "stap 5 POST", "onboarding-taak niet gevonden in DB na aanmaken");
    log(`STAP 5 POST PASS — onboarding-taak aangemaakt: id=${taakId}, naam=${rij.naam}`);

    // GET
    const rGet = await admin.get(`/medewerkers/${medewerkerId}/onboarding-taken`);
    const bGet = await json<Array<{ id: number }>>(rGet);
    eis(rGet.status === 200 && Array.isArray(bGet), "stap 5 GET", `GET onboarding-taken gaf ${rGet.status} ${JSON.stringify(bGet)}`);
    eis(bGet.some((t) => t.id === taakId), "stap 5 GET", `nieuwe taak id=${taakId} niet in lijst`);
    log(`STAP 5 GET PASS — ${bGet.length} taak/taken opgehaald, nieuwe taak aanwezig`);

    // PATCH
    const rPatch = await admin.patch(`/hrm/onboarding-taken/${taakId}`, { status: "afgerond", opmerking: "Ondertekend op dag 1" });
    const bPatch = await json<{ status?: string; opmerking?: string }>(rPatch);
    eis(rPatch.status === 200 && bPatch.status === "afgerond", "stap 5 PATCH", `PATCH onboarding-taak gaf ${rPatch.status} ${JSON.stringify(bPatch)}`);
    eis(bPatch.opmerking === "Ondertekend op dag 1", "stap 5 PATCH", `opmerking niet bijgewerkt: ${bPatch.opmerking}`);
    log(`STAP 5 PATCH PASS — taak bijgewerkt: status=afgerond, opmerking gezet`);

    // DELETE
    const rDel = await admin.del(`/hrm/onboarding-taken/${taakId}`);
    eis(rDel.status === 204, "stap 5 DELETE", `DELETE onboarding-taak gaf ${rDel.status}`);
    const [verwijderd] = await db.select({ id: hrmOnboardingTakenTable.id }).from(hrmOnboardingTakenTable).where(eq(hrmOnboardingTakenTable.id, taakId));
    eis(!verwijderd, "stap 5 DELETE", "onboarding-taak nog aanwezig in DB na verwijderen");
    log(`STAP 5 DELETE PASS — onboarding-taak verwijderd: 204, niet meer in DB`);
  }

  // ── STAP 6: AI-voorstellen — lege lijst op nieuwe medewerker ───────────────
  {
    const r = await admin.get(`/medewerkers/${medewerkerId}/ai-voorstellen`);
    const b = await json<unknown>(r);
    eis(r.status === 200 && Array.isArray(b), "stap 6", `GET ai-voorstellen gaf ${r.status} ${JSON.stringify(b)}`);
    // Nieuwe medewerker heeft nog geen documenten → geen AI-voorstellen verwacht
    eis((b as unknown[]).length === 0, "stap 6", `Verwacht lege lijst, maar ${(b as unknown[]).length} voorstel(len) aanwezig: ${JSON.stringify(b)}`);
    log(`STAP 6 PASS — ai-voorstellen: 200, lege lijst bevestigd (0 items)`);
  }

  // ── STAP 7: Heranalyseer-dossier — geeft 200 ───────────────────────────────
  {
    const r = await admin.post(`/medewerkers/${medewerkerId}/heranalyseer-dossier`);
    const b = await json<{ aangemaakt?: number; overgeslagen?: number; fout?: number }>(r);
    eis(r.status === 200, "stap 7", `POST heranalyseer-dossier gaf ${r.status} ${JSON.stringify(b)}`);
    eis(typeof b.aangemaakt === "number", "stap 7", `aangemaakt-veld ontbreekt: ${JSON.stringify(b)}`);
    log(`STAP 7 PASS — heranalyseer-dossier: 200, aangemaakt=${b.aangemaakt}, overgeslagen=${b.overgeslagen}, fout=${b.fout}`);
  }
}

// ── Opruimen + afsluiten ──────────────────────────────────────────────────────

async function opruimen(): Promise<void> {
  if (aangemaakteMedewerkerId !== null) {
    try {
      await db.delete(medewerkersTable).where(eq(medewerkersTable.id, aangemaakteMedewerkerId));
      console.log(`Opruimen: medewerker id=${aangemaakteMedewerkerId} verwijderd uit DB`);
    } catch (err) {
      console.warn("Opruimen mislukt voor medewerker:", err);
    }
  }
  try {
    await verwijderWegwerpOnboardingGebruikers();
  } catch (err) {
    console.warn("Opruimen: wegwerp-gebruikers verwijderen mislukt:", err);
  }
  try {
    await archiveerE2eWachtwoordAccounts();
  } catch (err) {
    console.warn("Opruimen: e2e-accounts archiveren mislukt:", err);
  }
}

main()
  .then(async () => {
    await opruimen();
    console.log("\n=== SMOKETEST GESLAAGD ===");
    console.log("Alle 7 stappen succesvol doorlopen.\n");
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error("\n=== SMOKETEST MISLUKT ===");
    console.error(err instanceof Error ? err.message : String(err));
    await opruimen();
    process.exit(1);
  });

// Verificatie: geconsolideerd onboarding-contract (POST /medewerkers + context).
//
// Bewijst tegen de lopende dev-api-server:
//   1. POST /medewerkers zonder gebruiker_id            → 400
//   2. POST /medewerkers met onbekende gebruiker_id     → 404 USER_NOT_FOUND
//   3. POST /medewerkers met geldige gebruiker_id       → 201
//   4. POST /medewerkers nogmaals zelfde gebruiker_id   → 409 EMPLOYEE_PROFILE_ALREADY_EXISTS
//   5. GET  /medewerkers/onboarding-context/:id (vrij)  → 200 met identiteitsvelden
//   6a. GET /medewerkers/onboarding-context/:id (concept-medewerker) → 200 met concept_medewerker_id (hervatten)
//   6b. GET /medewerkers/onboarding-context/:id (wachtrijstatus) → 200 (hervatten)
//   6c. Twee PATCHes met dezelfde versie → tweede 409; herstart met verse versie slaagt
//   6d. GET /medewerkers/onboarding-context/:id (actieve medewerker) → 409 EMPLOYEE_PROFILE_ALREADY_EXISTS
//   6e. PATCH wizard op actief/onbekend profiel → 409 (fail-closed)
//   7. GET  /medewerkers/onboarding-context/999999      → 404 USER_NOT_FOUND
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-onboarding-contract.ts
import "./lib/prodGuard";
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";
import { db, medewerkersTable } from "@workspace/db";

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
  console.error("REPLIT_DEV_DOMAIN ontbreekt.");
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
  patch(pad: string, body: unknown): Promise<Response> {
    return this.fetch(pad, { method: "PATCH", body: JSON.stringify(body) });
  }
  get(pad: string): Promise<Response> {
    return this.fetch(pad, { method: "GET" });
  }
}

async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  const t = await res.text();
  try { return JSON.parse(t) as T; } catch { return t as unknown as T; }
}

function eis(v: boolean, stap: string, detail: string): void {
  if (!v) throw new Error(`FAIL — ${stap}: ${detail}`);
}

async function versTotp(secret: string, minResterendeSec = 10): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  return authenticator.generate(secret);
}

let medewerkerId: number | null = null;
let medewerkerIdB: number | null = null;

async function main(): Promise<void> {
  console.log(`Onboarding-contract verificatie — ${new Date().toISOString()} — doel: ${BASIS}`);
  await setupE2eWachtwoordAccounts();
  const admin = new Sessie();
  {
    const r1 = await admin.post("/auth/login", { email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD });
    const b1 = await json<{ status?: string }>(r1);
    eis(r1.status === 200 && b1.status === "verify_2fa", "login", `${r1.status} ${JSON.stringify(b1)}`);
    const r2 = await admin.post("/auth/2fa/verify", { code: await versTotp(E2E_WW_ADMIN_TOTP_SECRET) });
    eis(r2.status === 200, "2fa", `${r2.status}`);
    console.log("PASS — admin ingelogd");
  }

  // 1. Zonder gebruiker_id → 400
  {
    const r = await admin.post("/medewerkers", { naam: "Contract Test Zonder", dienstverband: "vast" });
    const b = await json(r);
    eis(r.status === 400, "1: zonder gebruiker_id", `verwacht 400, kreeg ${r.status} ${JSON.stringify(b)}`);
    console.log(`PASS 1 — POST zonder gebruiker_id → 400 (${JSON.stringify(b)})`);
  }

  // 2. Onbekende gebruiker_id → 404 USER_NOT_FOUND
  {
    const r = await admin.post("/medewerkers", { naam: "Contract Test Onbekend", gebruiker_id: 999999 });
    const b = await json<{ code?: string }>(r);
    eis(r.status === 404 && b.code === "USER_NOT_FOUND", "2: onbekende gebruiker", `verwacht 404 USER_NOT_FOUND, kreeg ${r.status} ${JSON.stringify(b)}`);
    console.log("PASS 2 — POST met onbekende gebruiker_id → 404 USER_NOT_FOUND");
  }

  const gebruiker = await maakWegwerpOnboardingGebruiker("Contract Verificatie");

  // 5 (eerst): context voor vrij account → 200 met identiteit
  {
    const r = await admin.get(`/medewerkers/onboarding-context/${gebruiker.id}`);
    const b = await json<{ gebruiker_id?: number; naam?: string; email?: string; concept_medewerker_id?: number | null }>(r);
    eis(r.status === 200 && b.gebruiker_id === gebruiker.id && b.naam === gebruiker.naam && b.email === gebruiker.email,
      "5: context vrij account", `verwacht 200 + identiteit, kreeg ${r.status} ${JSON.stringify(b)}`);
    console.log(`PASS 5 — onboarding-context vrij account → 200 (naam='${b.naam}', concept=${b.concept_medewerker_id ?? "null"})`);
  }

  // 3. Geldige gebruiker_id → 201
  {
    const r = await admin.post("/medewerkers", { naam: gebruiker.naam, gebruiker_id: gebruiker.id, dienstverband: "vast" });
    const b = await json<{ id?: number }>(r);
    eis(r.status === 201 && typeof b.id === "number", "3: geldige gebruiker", `verwacht 201, kreeg ${r.status} ${JSON.stringify(b)}`);
    medewerkerId = b.id!;
    console.log(`PASS 3 — POST met geldige gebruiker_id → 201 (medewerker id=${medewerkerId})`);
  }

  // 4. Zelfde gebruiker_id nogmaals → 409
  {
    const r = await admin.post("/medewerkers", { naam: "Contract Dubbel", gebruiker_id: gebruiker.id });
    const b = await json<{ code?: string }>(r);
    eis(r.status === 409 && b.code === "EMPLOYEE_PROFILE_ALREADY_EXISTS", "4: dubbele koppeling", `verwacht 409 EMPLOYEE_PROFILE_ALREADY_EXISTS, kreeg ${r.status} ${JSON.stringify(b)}`);
    console.log("PASS 4 — tweede POST zelfde gebruiker_id → 409 EMPLOYEE_PROFILE_ALREADY_EXISTS");
  }

  // 6a. Context voor account met concept-medewerker → 200 + concept_medewerker_id (hervatten)
  {
    const r = await admin.get(`/medewerkers/onboarding-context/${gebruiker.id}`);
    const b = await json<{ concept_medewerker_id?: number | null }>(r);
    eis(r.status === 200 && b.concept_medewerker_id === medewerkerId, "6a: context concept-medewerker", `verwacht 200 + concept_medewerker_id=${medewerkerId}, kreeg ${r.status} ${JSON.stringify(b)}`);
    console.log(`PASS 6a — onboarding-context bij concept → 200, concept_medewerker_id=${b.concept_medewerker_id} (hervatten mogelijk)`);
  }

  // 6b. Een medewerker in de onboardingwachtrij blijft hervatbaar.
  {
    await db
      .update(medewerkersTable)
      .set({ medewerkerStatus: "in_voorbereiding", bijgewerktOp: new Date() })
      .where(eq(medewerkersTable.id, medewerkerId!));
    const r = await admin.get(`/medewerkers/onboarding-context/${gebruiker.id}`);
    const b = await json<{ concept_medewerker_id?: number | null; onboarding_status?: string | null }>(r);
    eis(
      r.status === 200 &&
        b.concept_medewerker_id === medewerkerId &&
        b.onboarding_status === "in_voorbereiding",
      "6b: context wachtrijstatus",
      `verwacht hervatbare onboarding, kreeg ${r.status} ${JSON.stringify(b)}`,
    );
    console.log("PASS 6b — onboarding-context bij in_voorbereiding → 200 (hervatbaar)");
  }

  // 6c. Opnieuw starten wist de wizardvoortgang en zet terug naar stap 1.
  {
    const eerste = await admin.patch(`/medewerkers/${medewerkerId}/wizard-voortgang`, {
      stap: 2,
      versie: 0,
      voortgang_data: { tab: "eerste" },
    });
    const eersteBody = await json<{ versie?: number }>(eerste);
    eis(
      eerste.status === 200 && eersteBody.versie === 1,
      "6c: eerste versie-opslag",
      `verwacht versie 1, kreeg ${eerste.status} ${JSON.stringify(eersteBody)}`,
    );
    const stale = await admin.patch(`/medewerkers/${medewerkerId}/wizard-voortgang`, {
      stap: 3,
      versie: 0,
      voortgang_data: { tab: "stale" },
    });
    const staleBody = await json<{ code?: string; server_versie?: number }>(stale);
    eis(
      stale.status === 409 &&
        staleBody.code === "ONBOARDING_VERSION_CONFLICT" &&
        staleBody.server_versie === 1,
      "6c: stale browsertab",
      `verwacht 409 ONBOARDING_VERSION_CONFLICT, kreeg ${stale.status} ${JSON.stringify(staleBody)}`,
    );

    const r = await admin.patch(`/medewerkers/${medewerkerId}/wizard-voortgang`, {
      stap: 1,
      versie: 1,
      opnieuw_starten: true,
    });
    const b = await json<{
      medewerker_status?: string;
      huidig_stap?: number;
      versie?: number;
      wizard_voortgang?: Record<string, unknown>;
    }>(r);
    eis(
      r.status === 200 &&
        b.medewerker_status === "concept" &&
        b.huidig_stap === 1 &&
        b.versie === 2 &&
        b.wizard_voortgang?._huidig_stap === 1 &&
        b.wizard_voortgang?._versie === 2 &&
        Object.keys(b.wizard_voortgang ?? {}).length === 2,
      "6c: onboarding opnieuw starten",
      `verwacht lege stap-1-voortgang, kreeg ${r.status} ${JSON.stringify(b)}`,
    );
    console.log("PASS 6c — stale tab 409; verse herstart → concept, stap 1 en versie 2");

    const staleAfronding = await admin.patch(`/medewerkers/${medewerkerId}`, {
      naam: "MAG NIET WORDEN OPGESLAGEN",
      onboarding_afronden: true,
      onboarding_versie: 1,
      onboarding_stroom: "vast",
    });
    const staleAfrondingBody = await json<{ code?: string; server_versie?: number }>(
      staleAfronding,
    );
    const [naStaleAfronding] = await db
      .select({
        naam: medewerkersTable.naam,
        medewerkerStatus: medewerkersTable.medewerkerStatus,
        wizardVoortgang: medewerkersTable.wizardVoortgang,
      })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.id, medewerkerId))
      .limit(1);
    const versieNaStaleAfronding =
      (naStaleAfronding?.wizardVoortgang as Record<string, unknown> | null)?._versie;
    eis(
      staleAfronding.status === 409 &&
        staleAfrondingBody.code === "ONBOARDING_VERSION_CONFLICT" &&
        staleAfrondingBody.server_versie === 2 &&
        naStaleAfronding?.naam === gebruiker.naam &&
        naStaleAfronding.medewerkerStatus === "concept" &&
        versieNaStaleAfronding === 2,
      "6c: stale atomaire afronding",
      `verwacht 409 zonder profielmutatie, kreeg ${staleAfronding.status} ${JSON.stringify(staleAfrondingBody)} / ${JSON.stringify(naStaleAfronding)}`,
    );
    console.log("PASS 6c — stale afronding schrijft geen profielvelden of actieve status");
  }

  // 6d. Context voor account met actieve medewerker → 409
  {
    const gebruikerB = await maakWegwerpOnboardingGebruiker("Contract Verificatie B");
    const rMaak = await admin.post("/medewerkers", { naam: gebruikerB.naam, gebruiker_id: gebruikerB.id });
    const bMaak = await json<{ id?: number }>(rMaak);
    eis(rMaak.status === 201 && typeof bMaak.id === "number", "6d: setup", `verwacht 201, kreeg ${rMaak.status} ${JSON.stringify(bMaak)}`);
    medewerkerIdB = bMaak.id!;
    // POST zet status altijd op concept; maak er via DB een afgeronde medewerker van.
    await db
      .update(medewerkersTable)
      .set({ medewerkerStatus: "actief", bijgewerktOp: new Date() })
      .where(eq(medewerkersTable.id, medewerkerIdB));
    const r = await admin.get(`/medewerkers/onboarding-context/${gebruikerB.id}`);
    const b = await json<{ code?: string }>(r);
    eis(r.status === 409 && b.code === "EMPLOYEE_PROFILE_ALREADY_EXISTS", "6d: context actief", `verwacht 409 EMPLOYEE_PROFILE_ALREADY_EXISTS, kreeg ${r.status} ${JSON.stringify(b)}`);
    console.log("PASS 6d — onboarding-context bij actieve medewerker → 409 EMPLOYEE_PROFILE_ALREADY_EXISTS");
  }

  // 7. Context onbekend account → 404
  {
    const r = await admin.get("/medewerkers/onboarding-context/999999");
    const b = await json<{ code?: string }>(r);
    eis(r.status === 404 && b.code === "USER_NOT_FOUND", "7: context onbekend", `verwacht 404 USER_NOT_FOUND, kreeg ${r.status} ${JSON.stringify(b)}`);
    console.log("PASS 7 — onboarding-context onbekend account → 404 USER_NOT_FOUND");
  }

  // 6e. Ook rechtstreeks schrijven naar de wizard blijft fail-closed voor
  // actieve én onbekende statussen.
  {
    const rActief = await admin.patch(`/medewerkers/${medewerkerIdB}/wizard-voortgang`, {
      stap: 1,
      versie: 0,
      opnieuw_starten: true,
    });
    const bActief = await json<{ code?: string }>(rActief);
    eis(
      rActief.status === 409 && bActief.code === "ONBOARDING_ALREADY_COMPLETED",
      "6e: actief profiel herstarten",
      `verwacht 409 ONBOARDING_ALREADY_COMPLETED, kreeg ${rActief.status} ${JSON.stringify(bActief)}`,
    );

    await db
      .update(medewerkersTable)
      .set({ medewerkerStatus: "onbekende_legacy_status", bijgewerktOp: new Date() })
      .where(eq(medewerkersTable.id, medewerkerIdB!));
    const rOnbekend = await admin.patch(`/medewerkers/${medewerkerIdB}/wizard-voortgang`, {
      stap: 2,
      versie: 0,
      medewerker_status: "concept",
      voortgang_data: { mag_niet: true },
    });
    const bOnbekend = await json<{ code?: string }>(rOnbekend);
    eis(
      rOnbekend.status === 409 && bOnbekend.code === "ONBOARDING_ALREADY_COMPLETED",
      "6e: onbekende status wijzigen",
      `verwacht fail-closed 409, kreeg ${rOnbekend.status} ${JSON.stringify(bOnbekend)}`,
    );
    console.log("PASS 6e — actieve en onbekende status kunnen niet via de wizard worden teruggezet");
  }
}

async function opruimen(): Promise<void> {
  for (const id of [medewerkerId, medewerkerIdB]) {
    if (id !== null) {
      try { await db.delete(medewerkersTable).where(eq(medewerkersTable.id, id)); } catch { /* best-effort */ }
    }
  }
  try { await verwijderWegwerpOnboardingGebruikers(); } catch { /* best-effort */ }
  try { await archiveerE2eWachtwoordAccounts(); } catch { /* best-effort */ }
}

main()
  .then(async () => {
    await opruimen();
    console.log("\n=== VERIFICATIE GESLAAGD — alle onboarding-contractchecks PASS ===");
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error("\n=== VERIFICATIE MISLUKT ===");
    console.error(err instanceof Error ? err.message : String(err));
    await opruimen();
    process.exit(1);
  });

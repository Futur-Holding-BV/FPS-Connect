// Bewijsscript taak 891: de accountstap van de één-flow onboarding kan optioneel
// direct een rechtenprofiel koppelen, met de bestaande zelf-escalatiebeveiliging
// server-side. Bewijst via echte login (TOTP):
//   1. Zonder profiel_id blijft het gedrag ongewijzigd (least-privilege, lege matrix).
//   2. Met geldig profiel_id: account krijgt de profiel-matrix, een
//      gebruiker_profielen-koppeling en herkomst_profiel_id.
//   3. Onbestaand profiel_id → 400.
//   4. Een gebruiker met alleen personeel:2 (geen gebruikers:4, geen
//      hoofdbeheerder) mag géén profiel met hogere niveaus koppelen → 403,
//      en er wordt dan ook géén account aangemaakt (fail-closed).
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-task891-onboarding-profiel.ts
import "./lib/prodGuard";
import {
  setupE2eWebAccount,
  archiveerE2eWebAccount,
  genereerVersWebTotp,
  E2E_WEB_EMAIL,
  E2E_WEB_WACHTWOORD,
} from "./e2e-monteur-testaccount";
import { db, gebruikersTable, gebruikerProfielenTable, profielenTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) {
  console.error("REPLIT_DEV_DOMAIN ontbreekt.");
  process.exit(1);
}
const BASIS = `https://${DOMEIN}/api`;

const BEPERKT_EMAIL = "e2e-task891-beperkt@fps.local";
const BEPERKT_WACHTWOORD = "E2eTask891!2026";
const BEPERKT_TOTP_SECRET = "MZ2WGZLONBUW4ZDF";

class Sessie {
  private cookies = new Map<string, string>();
  async fetch(pad: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (typeof init?.body === "string") headers.set("Content-Type", "application/json");
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
  const t = await res.text();
  try {
    return JSON.parse(t) as T;
  } catch {
    return t as unknown as T;
  }
}

function eis(v: boolean, stap: string, detail: string): void {
  if (!v) throw new Error(`FAIL — ${stap}: ${detail}`);
}

// Beperkt account: alleen personeel:2 (mag de wizard gebruiken, mag niets escaleren).
async function zorgVoorBeperktAccount(): Promise<void> {
  const hash = await bcrypt.hash(BEPERKT_WACHTWOORD, 10);
  const waarden = {
    naam: "E2E Task891 Beperkt",
    rol: "gebruiker" as const,
    wachtwoord: hash,
    totpSecret: BEPERKT_TOTP_SECRET,
    tweeFactorIngeschakeld: true,
    actief: true,
    gearchiveerd: false,
    bevoegdheden: { personeel: 2 },
    initialen: "E2E",
  };
  const [bestaand] = await db
    .select({ id: gebruikersTable.id })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.email, BEPERKT_EMAIL));
  if (bestaand) {
    await db.update(gebruikersTable).set(waarden).where(eq(gebruikersTable.id, bestaand.id));
  } else {
    await db.insert(gebruikersTable).values({ ...waarden, email: BEPERKT_EMAIL });
  }
}

async function versBeperktTotp(minResterendeSec = 20): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) {
    await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  }
  return authenticator.generate(BEPERKT_TOTP_SECRET);
}

async function login(email: string, wachtwoord: string, totp: () => Promise<string>): Promise<Sessie> {
  const s = new Sessie();
  const r1 = await s.post("/auth/login", { email, wachtwoord });
  const b1 = await json(r1);
  eis(r1.status === 200 && b1.status === "verify_2fa", `login ${email}`, `${r1.status} ${JSON.stringify(b1)}`);
  const r2 = await s.post("/auth/2fa/verify", { code: await totp() });
  eis(r2.status === 200, `2fa ${email}`, `${r2.status}`);
  return s;
}

const aangemaakteEmails: string[] = [];

async function ruimOp(): Promise<void> {
  if (aangemaakteEmails.length > 0) {
    const rijen = await db
      .select({ id: gebruikersTable.id })
      .from(gebruikersTable)
      .where(inArray(gebruikersTable.email, aangemaakteEmails));
    const ids = rijen.map((r) => r.id);
    if (ids.length > 0) {
      await db.delete(gebruikerProfielenTable).where(inArray(gebruikerProfielenTable.gebruikerId, ids));
      await db.delete(gebruikersTable).where(inArray(gebruikersTable.id, ids));
    }
  }
  await db
    .update(gebruikersTable)
    .set({ actief: false, gearchiveerd: true })
    .where(eq(gebruikersTable.email, BEPERKT_EMAIL));
  await archiveerE2eWebAccount();
}

async function main(): Promise<void> {
  console.log(`Bewijs taak 891 — doel ${BASIS}`);
  await setupE2eWebAccount();
  await zorgVoorBeperktAccount();

  const admin = await login(E2E_WEB_EMAIL, E2E_WEB_WACHTWOORD, genereerVersWebTotp);

  // Profiel met niet-lege bevoegdheden en minstens één niveau > 2 (zodat het
  // beperkte account het zeker niet mag toekennen).
  const profielen = await db
    .select({ id: profielenTable.id, naam: profielenTable.naam, bevoegdheden: profielenTable.bevoegdheden })
    .from(profielenTable);
  const doelProfiel = profielen.find((p) => {
    const bev = (p.bevoegdheden ?? {}) as Record<string, number>;
    return Object.values(bev).some((n) => Number(n) >= 3);
  });
  eis(!!doelProfiel, "profielkeuze", "geen profiel met niveau >= 3 gevonden");
  console.log(`Gebruikt profiel: "${doelProfiel!.naam}" (id=${doelProfiel!.id})`);

  // STAP 1 — regressie: zonder profiel_id blijft het account least-privilege.
  const email1 = `task891.zonder.${Date.now()}@example.com`;
  aangemaakteEmails.push(email1);
  const r1 = await admin.post("/medewerkers/onboarding-account", {
    naam: "Task891 Zonder Profiel",
    email: email1,
    uitnodigen: false,
  });
  const b1 = await json(r1);
  eis(r1.status === 201, "aanmaak zonder profiel", `${r1.status} ${JSON.stringify(b1)}`);
  const [g1] = await db
    .select({ bevoegdheden: gebruikersTable.bevoegdheden, herkomst: gebruikersTable.herkomstProfielId, rol: gebruikersTable.rol })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, b1.id));
  eis(
    g1.rol === "gebruiker" && Object.keys((g1.bevoegdheden ?? {}) as object).length === 0 && g1.herkomst == null,
    "least-privilege zonder profiel",
    JSON.stringify(g1),
  );
  console.log("STAP 1 PASS — zonder profiel_id: rol=gebruiker, lege matrix, geen herkomst (ongewijzigd gedrag).");

  // STAP 2 — met geldig profiel_id: matrix + koppeling + herkomst.
  const email2 = `task891.met.${Date.now()}@example.com`;
  aangemaakteEmails.push(email2);
  const r2 = await admin.post("/medewerkers/onboarding-account", {
    naam: "Task891 Met Profiel",
    email: email2,
    uitnodigen: false,
    profiel_id: doelProfiel!.id,
  });
  const b2 = await json(r2);
  eis(r2.status === 201, "aanmaak met profiel", `${r2.status} ${JSON.stringify(b2)}`);
  const [g2] = await db
    .select({ bevoegdheden: gebruikersTable.bevoegdheden, herkomst: gebruikersTable.herkomstProfielId })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, b2.id));
  eis(
    JSON.stringify(g2.bevoegdheden) === JSON.stringify(doelProfiel!.bevoegdheden ?? {}),
    "matrix == profielmatrix",
    JSON.stringify({ gekregen: g2.bevoegdheden, verwacht: doelProfiel!.bevoegdheden }),
  );
  eis(g2.herkomst === doelProfiel!.id, "herkomst_profiel_id", JSON.stringify(g2.herkomst));
  const koppelingen = await db
    .select({ profielId: gebruikerProfielenTable.profielId })
    .from(gebruikerProfielenTable)
    .where(eq(gebruikerProfielenTable.gebruikerId, b2.id));
  eis(
    koppelingen.length === 1 && koppelingen[0].profielId === doelProfiel!.id,
    "gebruiker_profielen-koppeling",
    JSON.stringify(koppelingen),
  );
  console.log(`STAP 2 PASS — met profiel_id=${doelProfiel!.id}: matrix overgenomen, koppeling + herkomst gezet.`);

  // STAP 3 — onbestaand profiel → 400, geen account.
  const email3 = `task891.fout.${Date.now()}@example.com`;
  const r3 = await admin.post("/medewerkers/onboarding-account", {
    naam: "Task891 Fout Profiel",
    email: email3,
    uitnodigen: false,
    profiel_id: 99999999,
  });
  eis(r3.status === 400, "onbestaand profiel", `${r3.status}`);
  const geen3 = await db
    .select({ id: gebruikersTable.id })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.email, email3));
  eis(geen3.length === 0, "geen account bij 400", JSON.stringify(geen3));
  console.log("STAP 3 PASS — onbestaand profiel_id → 400, geen account aangemaakt.");

  // STAP 4 — zelf-escalatie: beperkt account (alleen personeel:2) mag dit
  // profiel niet koppelen → 403, en er wordt geen account aangemaakt.
  const beperkt = await login(BEPERKT_EMAIL, BEPERKT_WACHTWOORD, versBeperktTotp);
  const email4 = `task891.escalatie.${Date.now()}@example.com`;
  const r4 = await beperkt.post("/medewerkers/onboarding-account", {
    naam: "Task891 Escalatie",
    email: email4,
    uitnodigen: false,
    profiel_id: doelProfiel!.id,
  });
  const b4 = await json(r4);
  eis(r4.status === 403, "zelf-escalatie geweigerd", `${r4.status} ${JSON.stringify(b4)}`);
  const geen4 = await db
    .select({ id: gebruikersTable.id })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.email, email4));
  eis(geen4.length === 0, "geen account bij 403", JSON.stringify(geen4));
  console.log(`STAP 4 PASS — beperkt account krijgt 403 (${JSON.stringify(b4.error).slice(0, 90)}…), fail-closed.`);

  // STAP 5 — beperkt account zonder profiel_id mag nog steeds gewoon een
  // least-privilege account aanmaken (bestaand wizard-gedrag intact).
  const email5 = `task891.beperkt.zonder.${Date.now()}@example.com`;
  aangemaakteEmails.push(email5);
  const r5 = await beperkt.post("/medewerkers/onboarding-account", {
    naam: "Task891 Beperkt Zonder",
    email: email5,
    uitnodigen: false,
  });
  eis(r5.status === 201, "beperkt zonder profiel", `${r5.status}`);
  console.log("STAP 5 PASS — beperkt account kan zonder profiel_id nog steeds onboarden.");

  console.log("ALLE STAPPEN PASS");
}

main()
  .then(async () => {
    await ruimOp();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(String(err));
    try {
      await ruimOp();
    } catch (opruimErr) {
      console.error("Opruimen mislukt:", String(opruimErr));
    }
    process.exit(1);
  });

// Bewijs voor task 851: het activatiescherm mag het wachtwoord van een
// bestaand account NIET overschrijven vóór de activatie (2FA) is afgerond.
//
// Scenario:
//   1. Wegwerpaccount met bekend "oud" wachtwoord + geldige uitnodigingstoken.
//   2. Activatie starten (nieuw wachtwoord invullen) en AFBREKEN vóór 2FA.
//      → oud wachtwoord werkt nog, nieuw wachtwoord werkt NIET.
//   3. Activatie volledig afronden (setup + 2FA-code bevestigen).
//      → nieuw wachtwoord werkt, oud wachtwoord werkt NIET meer.
//   4. Opruimen: wegwerpaccount verwijderd.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-task851-activatie-wachtwoord.ts
import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";

import { db, gebruikersTable } from "@workspace/db";

function weigerBuitenDev(): void {
  if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
    throw new Error("GEWEIGERD: bewijsscript alleen op dev.");
  }
}

const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;

const EMAIL = "bewijs-task851@fps.local";
const OUD_WACHTWOORD = "OudWachtwoord!2026";
const NIEUW_WACHTWOORD = "NieuwWachtwoord!2026";

let geslaagd = 0;
let mislukt = 0;
function check(naam: string, ok: boolean, detail?: string): void {
  if (ok) {
    geslaagd++;
    console.log(`  PASS  ${naam}`);
  } else {
    mislukt++;
    console.error(`  FAIL  ${naam}${detail ? ` — ${detail}` : ""}`);
  }
}

class Sessie {
  private cookies = new Map<string, string>();
  async fetch(pad: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (this.cookies.size > 0) {
      headers.set(
        "cookie",
        [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
      );
    }
    if (init?.body) headers.set("content-type", "application/json");
    const res = await fetch(`${BASE}${pad}`, { ...init, headers });
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(";");
      const idx = pair!.indexOf("=");
      this.cookies.set(pair!.slice(0, idx), pair!.slice(idx + 1));
    }
    return res;
  }
}

async function dbHash(id: number): Promise<string> {
  const [g] = await db
    .select({ wachtwoord: gebruikersTable.wachtwoord })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, id));
  return g!.wachtwoord ?? "";
}

async function main(): Promise<void> {
  weigerBuitenDev();

  // Opruimen van eventuele eerdere run
  await db.delete(gebruikersTable).where(eq(gebruikersTable.email, EMAIL));

  const token = randomBytes(24).toString("hex");
  const oudHash = await bcrypt.hash(OUD_WACHTWOORD, 10);
  const [aangemaakt] = await db
    .insert(gebruikersTable)
    .values({
      email: EMAIL,
      naam: "Bewijs Task851",
      rol: "gebruiker",
      wachtwoord: oudHash,
      actief: true,
      tweeFactorIngeschakeld: false,
      totpSecret: null,
      uitnodigingToken: token,
      uitnodigingStatus: "verzonden",
      uitnodigingVerlooptOp: new Date(Date.now() + 60 * 60 * 1000),
    })
    .returning({ id: gebruikersTable.id });
  const userId = aangemaakt!.id;

  try {
    console.log("Stap 1: activatie starten en AFBREKEN vóór 2FA");
    const s1 = new Sessie();
    const r1 = await s1.fetch(`/uitnodiging/${token}/activeren`, {
      method: "POST",
      body: JSON.stringify({ wachtwoord: NIEUW_WACHTWOORD, taal: "nl" }),
    });
    const j1 = (await r1.json()) as { status?: string };
    check("activeren geeft 200 + setup_2fa", r1.status === 200 && j1.status === "setup_2fa", `status=${r1.status} body=${JSON.stringify(j1)}`);

    // Afbreken = simpelweg niets meer doen in deze sessie.
    const hashNaAfbreken = await dbHash(userId);
    check("DB-wachtwoord ongewijzigd na afbreken", hashNaAfbreken === oudHash);
    check("oud wachtwoord werkt nog (bcrypt)", await bcrypt.compare(OUD_WACHTWOORD, hashNaAfbreken));
    check("nieuw wachtwoord werkt NIET (bcrypt)", !(await bcrypt.compare(NIEUW_WACHTWOORD, hashNaAfbreken)));

    const loginOud = await new Sessie().fetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, wachtwoord: OUD_WACHTWOORD }),
    });
    check("HTTP-login met OUD wachtwoord slaagt na afbreken", loginOud.status === 200, `status=${loginOud.status}`);
    const loginNieuw = await new Sessie().fetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, wachtwoord: NIEUW_WACHTWOORD }),
    });
    check("HTTP-login met NIEUW wachtwoord faalt na afbreken", loginNieuw.status === 401, `status=${loginNieuw.status}`);

    console.log("Stap 2: activatie volledig afronden (2FA bevestigen)");
    const s2 = new Sessie();
    const r2 = await s2.fetch(`/uitnodiging/${token}/activeren`, {
      method: "POST",
      body: JSON.stringify({ wachtwoord: NIEUW_WACHTWOORD, taal: "nl" }),
    });
    check("tweede activeren geeft 200", r2.status === 200, `status=${r2.status}`);
    const setup = await s2.fetch("/auth/2fa/setup", { method: "POST" });
    const setupJson = (await setup.json()) as { secret?: string };
    check("2fa/setup geeft secret", setup.status === 200 && !!setupJson.secret, `status=${setup.status}`);
    const code = authenticator.generate(setupJson.secret!);
    const act = await s2.fetch("/auth/2fa/activeren", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    check("2fa/activeren slaagt", act.status === 200, `status=${act.status} body=${await act.text()}`);

    const hashNaAfronden = await dbHash(userId);
    check("DB-wachtwoord is nu het NIEUWE (bcrypt)", await bcrypt.compare(NIEUW_WACHTWOORD, hashNaAfronden));
    check("OUD wachtwoord werkt niet meer (bcrypt)", !(await bcrypt.compare(OUD_WACHTWOORD, hashNaAfronden)));

    const loginNieuw2 = await new Sessie().fetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, wachtwoord: NIEUW_WACHTWOORD }),
    });
    const loginNieuw2Json = (await loginNieuw2.json()) as { status?: string };
    check(
      "HTTP-login met NIEUW wachtwoord slaagt na afronden (→ verify_2fa)",
      loginNieuw2.status === 200 && loginNieuw2Json.status === "verify_2fa",
      `status=${loginNieuw2.status} body=${JSON.stringify(loginNieuw2Json)}`,
    );
    const loginOud2 = await new Sessie().fetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, wachtwoord: OUD_WACHTWOORD }),
    });
    check("HTTP-login met OUD wachtwoord faalt na afronden", loginOud2.status === 401, `status=${loginOud2.status}`);

    console.log("Stap 3: stale activatiesessie kan afgerond account NIET overschrijven");
    // s1 startte de activatie eerder (pending wachtwoord in sessie), maar de
    // uitnodiging is inmiddels door s2 verbruikt. s1 probeert alsnog af te ronden.
    const [rijVoor] = await db
      .select({ totpSecret: gebruikersTable.totpSecret })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, userId));
    const staleSetup = await s1.fetch("/auth/2fa/setup", { method: "POST" });
    const staleSetupJson = (await staleSetup.json()) as { secret?: string };
    if (staleSetup.status === 200 && staleSetupJson.secret) {
      const staleCode = authenticator.generate(staleSetupJson.secret);
      const staleAct = await s1.fetch("/auth/2fa/activeren", {
        method: "POST",
        body: JSON.stringify({ code: staleCode }),
      });
      check("stale 2fa/activeren wordt geweigerd (409)", staleAct.status === 409, `status=${staleAct.status} body=${await staleAct.text()}`);
    } else {
      check("stale sessie komt niet eens door 2fa/setup", staleSetup.status !== 200, `status=${staleSetup.status}`);
    }
    const [rijNa] = await db
      .select({ wachtwoord: gebruikersTable.wachtwoord, totpSecret: gebruikersTable.totpSecret })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, userId));
    check("wachtwoord ongewijzigd na stale poging", await bcrypt.compare(NIEUW_WACHTWOORD, rijNa!.wachtwoord ?? ""));
    check("TOTP-secret ongewijzigd na stale poging", rijNa!.totpSecret === rijVoor!.totpSecret);

    console.log("Stap 4 (task 852): al-in-gebruik account weigert activatielink met 409");
    // Simuleer een historisch inconsistente rij: account heeft al ingelogd
    // (laatst_online gezet) en 2FA aan, maar uitnodigingStatus staat nog op
    // "verzonden" met een geldige, niet-verlopen token.
    await db
      .update(gebruikersTable)
      .set({
        uitnodigingStatus: "verzonden",
        uitnodigingToken: token,
        uitnodigingVerlooptOp: new Date(Date.now() + 60 * 60 * 1000),
        laatstOnline: new Date(),
      })
      .where(eq(gebruikersTable.id, userId));

    const get852 = await new Sessie().fetch(`/uitnodiging/${token}`);
    const get852Json = (await get852.json()) as { error?: string };
    check("GET /uitnodiging/:token geeft 409 voor al-in-gebruik account", get852.status === 409, `status=${get852.status}`);
    check(
      "409-melding verwijst naar gewoon inloggen",
      (get852Json.error ?? "").toLowerCase().includes("al in gebruik"),
      `error=${get852Json.error}`,
    );
    const post852 = await new Sessie().fetch(`/uitnodiging/${token}/activeren`, {
      method: "POST",
      body: JSON.stringify({ wachtwoord: "AanvallerWachtwoord!2026", taal: "nl" }),
    });
    check("POST /uitnodiging/:token/activeren geeft 409 voor al-in-gebruik account", post852.status === 409, `status=${post852.status}`);

    // Ook alleen 2FA-aan (zonder laatst_online) moet weigeren.
    await db
      .update(gebruikersTable)
      .set({ laatstOnline: null })
      .where(eq(gebruikersTable.id, userId));
    const [rij852] = await db
      .select({ tweeFactorIngeschakeld: gebruikersTable.tweeFactorIngeschakeld })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, userId));
    check("2FA staat aan na afgeronde activatie", rij852!.tweeFactorIngeschakeld === true);
    const get852b = await new Sessie().fetch(`/uitnodiging/${token}`);
    check("GET geeft ook 409 op alleen-2FA-aan account", get852b.status === 409, `status=${get852b.status}`);

    const hashNa852 = await dbHash(userId);
    check("wachtwoord onaangetast na 852-pogingen", await bcrypt.compare(NIEUW_WACHTWOORD, hashNa852));
  } finally {
    await db.delete(gebruikersTable).where(eq(gebruikersTable.id, userId));
    console.log("Opruimen: wegwerpaccount verwijderd.");
  }

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${mislukt} mislukt`);
  if (mislukt > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

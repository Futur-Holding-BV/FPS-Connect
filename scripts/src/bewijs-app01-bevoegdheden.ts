// Gedragsbewijs APP_01 — bevoegdheden in de app-laag:
//  1. POST /auth/mobile/login en GET /auth/me geven de effectieve bevoegdheden
//     terug (voer voor menu-filtering + verversing bij app-start).
//  2. Basisrecht eigen declaraties: een medewerker ZONDER de module
//     `declaraties` kan zijn eigen declaraties zien, aanmaken en indienen.
//  3. De module blijft gelden voor andermans gegevens: dezelfde gebruiker
//     krijgt 403 op de lijst-alle-route GET /declaraties.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-app01-bevoegdheden.ts
// Vereist: api-server workflow draait lokaal.
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";

import { db, gebruikersTable, medewerkersTable, declaratiesTable } from "@workspace/db";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const EMAIL = "bewijs-app01@fps.local";
const WACHTWOORD = "BewijsApp01!2026";
const TOTP_SECRET = "MFRGGZDFMZTWQ2LK";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

let gebruikerId = 0;
let medewerkerId = 0;

async function opruimen(): Promise<void> {
  if (medewerkerId) {
    await db.delete(declaratiesTable).where(eq(declaratiesTable.medewerkerId, medewerkerId));
    await db.delete(medewerkersTable).where(eq(medewerkersTable.id, medewerkerId));
  }
  if (gebruikerId) {
    await db.delete(gebruikersTable).where(eq(gebruikersTable.id, gebruikerId));
  }
}

function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) {
    console.error(`✗ FAALT: ${naam}`, detail ?? "");
    throw new Error(`Bewijs mislukt: ${naam}`);
  }
  console.log(`✓ ${naam}`);
}

async function main(): Promise<void> {
  // ── Opzet: monteur met beperkt profiel, GEEN declaraties-module ────────────
  const hash = await bcrypt.hash(WACHTWOORD, 10);
  const bevoegdheden = { gebouwen: 1, toolbox: 1, magazijn: 1 }; // bewust géén declaraties/personeel/bibliotheek
  // Restanten van eerdere (gecrashte) runs eerst opruimen.
  const [oud] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, EMAIL));
  if (oud) {
    const [oudM] = await db.select({ id: medewerkersTable.id }).from(medewerkersTable).where(eq(medewerkersTable.gebruikerId, oud.id));
    if (oudM) {
      await db.delete(declaratiesTable).where(eq(declaratiesTable.medewerkerId, oudM.id));
      await db.delete(medewerkersTable).where(eq(medewerkersTable.id, oudM.id));
    }
    await db.delete(gebruikersTable).where(eq(gebruikersTable.id, oud.id));
  }

  const [g] = await db.insert(gebruikersTable).values({
    naam: "Bewijs APP01 Monteur",
    email: EMAIL,
    rol: "gebruiker",
    wachtwoord: hash,
    totpSecret: TOTP_SECRET,
    tweeFactorIngeschakeld: true,
    actief: true,
    bevoegdheden,
  }).returning({ id: gebruikersTable.id });
  gebruikerId = g.id;

  const [m] = await db.insert(medewerkersTable).values({
    gebruikerId,
    naam: "Bewijs APP01 Monteur",
  } as typeof medewerkersTable.$inferInsert).returning({ id: medewerkersTable.id });
  medewerkerId = m.id;

  // ── 1. Mobile login geeft bevoegdheden terug ───────────────────────────────
  const code = authenticator.generate(TOTP_SECRET);
  const loginResp = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, wachtwoord: WACHTWOORD, code }),
  });
  check("mobile login slaagt (200)", loginResp.status === 200, loginResp.status);
  const login = await loginResp.json() as { token: string; gebruiker: { bevoegdheden?: Record<string, number> } };
  check("login-respons bevat effectieve bevoegdheden", !!login.gebruiker.bevoegdheden && login.gebruiker.bevoegdheden["gebouwen"] === 1, login.gebruiker.bevoegdheden);
  check("login-respons: geen declaraties-module", (login.gebruiker.bevoegdheden?.["declaraties"] ?? 0) === 0);
  const auth = { Authorization: `Bearer ${login.token}` };

  // ── 2. GET /auth/me (verversing bij app-start) geeft dezelfde bevoegdheden ─
  const meResp = await fetch(`${BASIS}/auth/me`, { headers: auth });
  check("GET /auth/me slaagt via bearer (200)", meResp.status === 200, meResp.status);
  const me = await meResp.json() as { bevoegdheden?: Record<string, number> };
  check("GET /auth/me bevat effectieve bevoegdheden", !!me.bevoegdheden && me.bevoegdheden["toolbox"] === 1, me.bevoegdheden);

  // ── 3. Basisrecht: eigen declaraties zonder declaraties-module ─────────────
  const lijstResp = await fetch(`${BASIS}/mijn/declaraties`, { headers: auth });
  check("GET /mijn/declaraties = 200 zonder declaraties-module", lijstResp.status === 200, lijstResp.status);

  const beleidResp = await fetch(`${BASIS}/declaratiebeleid`, { headers: auth });
  check("GET /declaratiebeleid = 200 zonder declaraties-module", beleidResp.status === 200, beleidResp.status);

  const maakResp = await fetch(`${BASIS}/declaraties`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ categorie: "reiskosten", omschrijving: "Bewijs APP01", bedrag_totaal_cents: 1250, datum: "2026-08-08" }),
  });
  check("POST /declaraties (eigen concept) = 201", maakResp.status === 201, maakResp.status);
  const decl = await maakResp.json() as { id: number };

  const indienResp = await fetch(`${BASIS}/declaraties/${decl.id}/indienen`, { method: "POST", headers: auth });
  check("POST /declaraties/:id/indienen = 200", indienResp.status === 200, indienResp.status);

  // ── 4. Module blijft gelden voor andermans gegevens ────────────────────────
  const alleResp = await fetch(`${BASIS}/declaraties`, { headers: auth });
  check("GET /declaraties (lijst alle) = 403 zonder module", alleResp.status === 403, alleResp.status);

  console.log("\nAlle APP_01-bevoegdheidsbewijzen geslaagd.");
}

main()
  .then(async () => { await opruimen(); process.exit(0); })
  .catch(async (err) => { console.error(err); await opruimen(); process.exit(1); });

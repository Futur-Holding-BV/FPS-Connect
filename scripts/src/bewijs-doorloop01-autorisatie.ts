// Gedragsbewijs DOORLOOP_01 §1.1/§1.2/§2 — afgesloten routes:
//  1. import-routes (preview/uitvoeren/logs/template) eisen nu de module
//     `systeem` (schrijven=2, lezen=1) — een monteur krijgt overal 403.
//  2. calculaties-routes eisen nu `calculaties` (lezen=1, schrijven=2) —
//     een monteur krijgt 403, een medewerker mét calculaties:2 kan wél lezen.
//  3. PBM foto-inspectie eist nu toolbox:2 — toolbox:1 krijgt 403.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-doorloop01-autorisatie.ts
// Vereist: api-server workflow draait lokaal.
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";

import { db, gebruikersTable, medewerkersTable, verlofsoortenTable, verlofAanvragenTable, opdrachtenTable } from "@workspace/db";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const WACHTWOORD = "BewijsDoorloop01!2026";
const TOTP_SECRET = "MFRGGZDFMZTWQ2LK";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

const EMAILS = ["bewijs-dl01-monteur@fps.local", "bewijs-dl01-calculator@fps.local"];

let doelMedewerkerId = 0;
let aanvraagId = 0;
let opdrachtId = 0;
let verlofsoortId = 0;
let verlofsoortAangemaakt = false;

async function opruimen(): Promise<void> {
  if (aanvraagId) await db.delete(verlofAanvragenTable).where(eq(verlofAanvragenTable.id, aanvraagId));
  if (doelMedewerkerId) await db.delete(medewerkersTable).where(eq(medewerkersTable.id, doelMedewerkerId));
  if (opdrachtId) await db.delete(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId));
  if (verlofsoortAangemaakt && verlofsoortId) await db.delete(verlofsoortenTable).where(eq(verlofsoortenTable.id, verlofsoortId));
  for (const email of EMAILS) {
    await db.delete(gebruikersTable).where(eq(gebruikersTable.email, email));
  }
}

function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) {
    console.error(`✗ FAALT: ${naam}`, detail ?? "");
    throw new Error(`Bewijs mislukt: ${naam}`);
  }
  console.log(`✓ ${naam}`);
}

async function maakEnLogin(email: string, naam: string, bevoegdheden: Record<string, number>): Promise<Record<string, string>> {
  const hash = await bcrypt.hash(WACHTWOORD, 10);
  await db.delete(gebruikersTable).where(eq(gebruikersTable.email, email));
  await db.insert(gebruikersTable).values({
    naam, email, rol: "gebruiker", wachtwoord: hash,
    totpSecret: TOTP_SECRET, tweeFactorIngeschakeld: true, actief: true, bevoegdheden,
  });
  const code = authenticator.generate(TOTP_SECRET);
  const resp = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord: WACHTWOORD, code }),
  });
  check(`login ${naam} slaagt (200)`, resp.status === 200, resp.status);
  const { token } = await resp.json() as { token: string };
  return { Authorization: `Bearer ${token}` };
}

async function main(): Promise<void> {
  // ── Monteur: gebouwen/toolbox 1, GEEN systeem/calculaties ──────────────────
  const monteur = await maakEnLogin(EMAILS[0], "Bewijs DL01 Monteur", { gebouwen: 1, toolbox: 1 });

  const gevallen: Array<[string, string, RequestInit | undefined]> = [
    ["GET /calculaties", `${BASIS}/calculaties`, undefined],
    ["POST /calculaties", `${BASIS}/calculaties`, { method: "POST", body: JSON.stringify({ naam: "x" }) }],
    ["GET /import/logs", `${BASIS}/import/logs`, undefined],
    ["POST /import/uitvoeren", `${BASIS}/import/uitvoeren`, { method: "POST", body: JSON.stringify({}) }],
    ["GET /import/template/leveranciers", `${BASIS}/import/template/leveranciers`, undefined],
    ["POST /pbm/items/1/foto-inspectie", `${BASIS}/pbm/items/1/foto-inspectie`, { method: "POST", body: JSON.stringify({}) }],
  ];
  for (const [naam, url, init] of gevallen) {
    const resp = await fetch(url, { ...init, headers: { ...monteur, "Content-Type": "application/json" } });
    check(`${naam} = 403 zonder recht`, resp.status === 403, resp.status);
  }

  // ── Calculator: calculaties:2 + systeem:1 → lezen mag wél ──────────────────
  const calc = await maakEnLogin(EMAILS[1], "Bewijs DL01 Calculator", { calculaties: 2, systeem: 1 });
  const lees = await fetch(`${BASIS}/calculaties`, { headers: calc });
  check("GET /calculaties = 200 met calculaties:2", lees.status === 200, lees.status);
  const logs = await fetch(`${BASIS}/import/logs`, { headers: calc });
  check("GET /import/logs = 200 met systeem:1", logs.status === 200, logs.status);
  const uitvoeren = await fetch(`${BASIS}/import/uitvoeren`, { method: "POST", headers: { ...calc, "Content-Type": "application/json" }, body: JSON.stringify({}) });
  check("POST /import/uitvoeren = 403 met slechts systeem:1", uitvoeren.status === 403, uitvoeren.status);

  // ── §2-nacontrole: andermans verlofaanvraag en andermans opdracht ──────────
  const [doelM] = await db.insert(medewerkersTable).values({ naam: "Bewijs DL01 Doelwit" } as typeof medewerkersTable.$inferInsert).returning({ id: medewerkersTable.id });
  doelMedewerkerId = doelM.id;
  let [soort] = await db.select({ id: verlofsoortenTable.id }).from(verlofsoortenTable).limit(1);
  if (!soort) {
    [soort] = await db.insert(verlofsoortenTable).values({ naam: "Bewijs DL01 soort" } as typeof verlofsoortenTable.$inferInsert).returning({ id: verlofsoortenTable.id });
    verlofsoortAangemaakt = true;
  }
  verlofsoortId = soort.id;
  const [aanvraag] = await db.insert(verlofAanvragenTable).values({
    medewerkerId: doelMedewerkerId, verlofsoortId, startDatum: "2026-09-01", eindDatum: "2026-09-02", aantalUren: 16,
  }).returning({ id: verlofAanvragenTable.id });
  aanvraagId = aanvraag.id;

  const hack = await fetch(`${BASIS}/verlofaanvragen/${aanvraagId}`, {
    method: "PATCH",
    headers: { ...monteur, "Content-Type": "application/json" },
    body: JSON.stringify({ reden: "gehackt" }),
  });
  check("PATCH andermans verlofaanvraag (reden) = 403", hack.status === 403, hack.status);

  const [opdr] = await db.insert(opdrachtenTable).values({ titel: "Bewijs DL01 opdracht" } as typeof opdrachtenTable.$inferInsert).returning({ id: opdrachtenTable.id });
  opdrachtId = opdr.id;
  const mat = await fetch(`${BASIS}/materiaal-aanvragen`, {
    method: "POST",
    headers: { ...monteur, "Content-Type": "application/json" },
    body: JSON.stringify({ opdracht_id: opdrachtId, reden: "nodig", omschrijving: "Bewijs DL01" }),
  });
  check("POST materiaal-aanvraag voor niet-toegewezen opdracht = 403", mat.status === 403, mat.status);

  console.log("\nAlle DOORLOOP_01-autorisatiebewijzen geslaagd.");
}

main()
  .then(async () => { await opruimen(); process.exit(0); })
  .catch(async (err) => { console.error(err); await opruimen(); process.exit(1); });

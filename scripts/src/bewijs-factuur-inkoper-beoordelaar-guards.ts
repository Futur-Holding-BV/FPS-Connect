// Gedragsbewijs FACTUUR_GUARDS §1 — inkoper- en beoordelaarcontroles afdwingen:
//
//  Na de fix van sessionUserId() (las per abuis 'gebruikerId' in plaats van
//  'userId') worden de persoonsgebonden guards nu echt getest:
//
//  (a) POST /facturen/:id/bevestig-inkoop:
//      – toegewezen inkoper mag wél (200)
//      – andere gebruiker mét financieel:2 krijgt 403
//      – gebruiker met financieel:1 krijgt 403 (niveau-check)
//
//  (b) POST /facturen/:id/beoordelen-medewerker:
//      – toegewezen beoordelaar mag wél (200)
//      – andere gebruiker mét financieel:2 krijgt 403
//      – factuur zonder toegewezen beoordelaar geeft 403 (fail-closed)
//      – gebruiker met financieel:1 krijgt 403 (niveau-check)
//
//  (c) Leesroutes voor financieel:1 geven 200 (leesrecht intact).
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-factuur-inkoper-beoordelaar-guards.ts
// Vereist: api-server workflow draait lokaal.

import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { authenticator } from "otplib";

import { db, gebruikersTable, facturenTable } from "@workspace/db";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const WACHTWOORD = "BewijsFactuurGuards2026!";
const TOTP_SECRET = "MFRGGZDFMZTWQ2LK";

if (
  process.env.REPLIT_DEPLOYMENT ||
  process.env.NODE_ENV === "production" ||
  !process.env.REPLIT_DEV_DOMAIN
) {
  throw new Error(
    "GEWEIGERD: bewijsscript draait alleen in de lokale dev-omgeving " +
    "(REPLIT_DEV_DOMAIN vereist, nooit productie)."
  );
}

// ── Opruimregisters ────────────────────────────────────────────────────────────
const aangemaakteGebruikers: number[] = [];
const aangemaakteFacturen: number[] = [];

async function opruimen(): Promise<void> {
  if (aangemaakteFacturen.length > 0) {
    await db.delete(facturenTable).where(inArray(facturenTable.id, aangemaakteFacturen));
  }
  if (aangemaakteGebruikers.length > 0) {
    await db.delete(gebruikersTable).where(inArray(gebruikersTable.id, aangemaakteGebruikers));
  }
}

// ── Hulpfuncties ───────────────────────────────────────────────────────────────
function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) {
    console.error(`✗ FAALT: ${naam}`, detail ?? "");
    throw new Error(`Bewijs mislukt: ${naam}`);
  }
  console.log(`✓ ${naam}`);
}

async function maakGebruiker(
  email: string,
  naam: string,
  bevoegdheden: Record<string, number>
): Promise<number> {
  // Verwijder eventuele overblijvende testgebruiker van een vorige run.
  await db.delete(gebruikersTable).where(eq(gebruikersTable.email, email));
  const [g] = await db
    .insert(gebruikersTable)
    .values({
      naam,
      email,
      rol: "gebruiker",
      wachtwoord: await bcrypt.hash(WACHTWOORD, 10),
      totpSecret: TOTP_SECRET,
      tweeFactorIngeschakeld: true,
      actief: true,
      bevoegdheden,
    })
    .returning({ id: gebruikersTable.id });
  aangemaakteGebruikers.push(g.id);
  return g.id;
}

async function login(email: string): Promise<Record<string, string>> {
  const resp = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      wachtwoord: WACHTWOORD,
      code: authenticator.generate(TOTP_SECRET),
    }),
  });
  if (resp.status !== 200) {
    throw new Error(`Login mislukt voor ${email}: HTTP ${resp.status}`);
  }
  const { token } = (await resp.json()) as { token: string };
  return { Authorization: `Bearer ${token}` };
}

async function maakFactuur(
  overrides: Partial<typeof facturenTable.$inferInsert>
): Promise<number> {
  const [f] = await db
    .insert(facturenTable)
    .values({
      type: "inkoop",
      ...overrides,
    } as typeof facturenTable.$inferInsert)
    .returning({ id: facturenTable.id });
  aangemaakteFacturen.push(f.id);
  return f.id;
}

async function httpStatus(
  auth: Record<string, string>,
  pad: string,
  init?: RequestInit
): Promise<number> {
  const r = await fetch(`${BASIS}${pad}`, {
    ...init,
    headers: {
      ...auth,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  return r.status;
}

const b = (o: unknown) => JSON.stringify(o);

// ── Hoofdscript ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Maak vier testgebruikers aan:
  //   inkoper   – toegewezen inkoper        (financieel: 2)
  //   beoordelaar – toegewezen beoordelaar  (financieel: 2)
  //   ander     – onbekende met financieel:2 (mag géén persoonsgebonden actie)
  //   lezer     – alleen financieel:1       (mag helemaal niet muteren)
  const inkoperId = await maakGebruiker(
    "bewijs-fguards-inkoper@fps.local",
    "Bewijs FGuards Inkoper",
    { financieel: 2 }
  );
  const beoordelaarId = await maakGebruiker(
    "bewijs-fguards-beoordelaar@fps.local",
    "Bewijs FGuards Beoordelaar",
    { financieel: 2 }
  );
  const anderId = await maakGebruiker(
    "bewijs-fguards-ander@fps.local",
    "Bewijs FGuards Ander",
    { financieel: 2 }
  );
  const lezerId = await maakGebruiker(
    "bewijs-fguards-lezer@fps.local",
    "Bewijs FGuards Lezer",
    { financieel: 1 }
  );

  // Login: verkrijg bearer tokens.
  const inkoperHeaders    = await login("bewijs-fguards-inkoper@fps.local");
  const beoordelaarHeaders = await login("bewijs-fguards-beoordelaar@fps.local");
  const anderHeaders      = await login("bewijs-fguards-ander@fps.local");
  const lezerHeaders      = await login("bewijs-fguards-lezer@fps.local");

  // Maak testfacturen aan met de juiste status en toegewezen persoon.
  // Aparte facturen per testgeval zodat mutaties van het ene geval de andere
  // niet verstoren.
  const fInkoperMag = await maakFactuur({
    status: "wacht_op_inkoper",
    inkoperId: inkoperId,
  });
  const fInkoperNiet = await maakFactuur({
    status: "wacht_op_inkoper",
    inkoperId: inkoperId,
  });
  const fInkoperLezer = await maakFactuur({
    status: "wacht_op_inkoper",
    inkoperId: inkoperId,
  });
  const fInkoperNul = await maakFactuur({
    status: "wacht_op_inkoper",
    inkoperId: null,
  });
  const fBeoordelaarMag = await maakFactuur({
    status: "ter_beoordeling_medewerker",
    beoordelaarId: beoordelaarId,
  });
  const fBeoordelaarNiet = await maakFactuur({
    status: "ter_beoordeling_medewerker",
    beoordelaarId: beoordelaarId,
  });
  const fBeoordelaarNul = await maakFactuur({
    status: "ter_beoordeling_medewerker",
    beoordelaarId: null,
  });
  const fBeoordelaarLezer = await maakFactuur({
    status: "ter_beoordeling_medewerker",
    beoordelaarId: beoordelaarId,
  });

  console.log("\n── (a) bevestig-inkoop guards ──────────────────────────────────────────────");

  // (a1) Toegewezen inkoper mag wél bevestigen.
  const statusInkoperMag = await httpStatus(
    inkoperHeaders,
    `/facturen/${fInkoperMag}/bevestig-inkoop`,
    { method: "POST", body: b({}) }
  );
  check("(a1) toegewezen inkoper → bevestig-inkoop = 200", statusInkoperMag === 200, statusInkoperMag);

  // (a2) Factuur zonder toegewezen inkoper → fail-closed 403 (ook voor financieel:2).
  const statusInkoperNul = await httpStatus(
    anderHeaders,
    `/facturen/${fInkoperNul}/bevestig-inkoop`,
    { method: "POST", body: b({}) }
  );
  check("(a2) factuur zonder inkoper → bevestig-inkoop = 403 (fail-closed)", statusInkoperNul === 403, statusInkoperNul);

  // (a3) Andere gebruiker mét financieel:2 maar géén toegewezen inkoper → 403.
  const statusAnderInkoop = await httpStatus(
    anderHeaders,
    `/facturen/${fInkoperNiet}/bevestig-inkoop`,
    { method: "POST", body: b({}) }
  );
  check("(a3) niet-inkoper financieel:2 → bevestig-inkoop = 403", statusAnderInkoop === 403, statusAnderInkoop);

  // (a4) Gebruiker met financieel:1 → 403 (niveau-check, vóór persoonscheck).
  const statusLezerInkoop = await httpStatus(
    lezerHeaders,
    `/facturen/${fInkoperLezer}/bevestig-inkoop`,
    { method: "POST", body: b({}) }
  );
  check("(a4) financieel:1 → bevestig-inkoop = 403", statusLezerInkoop === 403, statusLezerInkoop);

  console.log("\n── (b) beoordelen-medewerker guards ────────────────────────────────────────");

  // (b1) Toegewezen beoordelaar mag wél beoordelen.
  const statusBeoordelaarMag = await httpStatus(
    beoordelaarHeaders,
    `/facturen/${fBeoordelaarMag}/beoordelen-medewerker`,
    { method: "POST", body: b({ actie: "goedkeuren" }) }
  );
  check("(b1) toegewezen beoordelaar → beoordelen-medewerker = 200", statusBeoordelaarMag === 200, statusBeoordelaarMag);

  // (b2) Andere gebruiker mét financieel:2 maar géén toegewezen beoordelaar → 403.
  const statusAnderBeoordeel = await httpStatus(
    anderHeaders,
    `/facturen/${fBeoordelaarNiet}/beoordelen-medewerker`,
    { method: "POST", body: b({ actie: "goedkeuren" }) }
  );
  check("(b2) niet-beoordelaar financieel:2 → beoordelen-medewerker = 403", statusAnderBeoordeel === 403, statusAnderBeoordeel);

  // (b3) Factuur zonder toegewezen beoordelaar → fail-closed 403.
  const statusNulBeoordeel = await httpStatus(
    anderHeaders,
    `/facturen/${fBeoordelaarNul}/beoordelen-medewerker`,
    { method: "POST", body: b({ actie: "goedkeuren" }) }
  );
  check("(b3) factuur zonder beoordelaar → beoordelen-medewerker = 403 (fail-closed)", statusNulBeoordeel === 403, statusNulBeoordeel);

  // (b4) Gebruiker met financieel:1 → 403 (niveau-check).
  const statusLezerBeoordeel = await httpStatus(
    lezerHeaders,
    `/facturen/${fBeoordelaarLezer}/beoordelen-medewerker`,
    { method: "POST", body: b({ actie: "goedkeuren" }) }
  );
  check("(b4) financieel:1 → beoordelen-medewerker = 403", statusLezerBeoordeel === 403, statusLezerBeoordeel);

  console.log("\n── (c) leesroutes voor financieel:1 ────────────────────────────────────────");

  // (c1) GET /facturen → 200 voor financieel:1.
  const statusLezerLijst = await httpStatus(lezerHeaders, "/facturen");
  check("(c1) financieel:1 → GET /facturen = 200", statusLezerLijst === 200, statusLezerLijst);

  // (c2) GET /facturen/analyse → 200 voor financieel:1.
  const statusLezerAnalyse = await httpStatus(lezerHeaders, "/facturen/analyse");
  check("(c2) financieel:1 → GET /facturen/analyse = 200", statusLezerAnalyse === 200, statusLezerAnalyse);

  // (c3) Sanity-check: niet-bestaand niveau-1 account kan ook niet muteren.
  //      (Bewijs RECHTEN_HRM_02 §1 dekt dit volledig; hier beperken we ons tot
  //       één oproep als rooktest.)
  const statusLezerUpload = await httpStatus(lezerHeaders, "/facturen/upload-url", {
    method: "POST",
    body: b({}),
  });
  check("(c3) financieel:1 → POST /facturen/upload-url = 403", statusLezerUpload === 403, statusLezerUpload);

  console.log("\n✓ Alle FACTUUR_GUARDS §1-bewijzen geslaagd.");
  void anderId; void lezerId; // enkel voor het aanmaken gebruikt
}

main()
  .then(async () => {
    await opruimen();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await opruimen();
    process.exit(1);
  });

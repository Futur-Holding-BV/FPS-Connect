// Gedragsbewijs PANEEL_01 §4.4 / MENU_01 §4.3 — generiek per-gebruiker
// UI-voorkeurenmechanisme (één mechanisme, geen tweede opslag), via HTTP tegen
// de lokale api-server:
//   1. PUT /mijn/voorkeuren/:sleutel slaat een voorkeur op.
//   2. GET /mijn/voorkeuren toont die voorkeur terug.
//   3. Een TWEEDE gebruiker ziet die voorkeur NIET (strikte eigen-rijen-scope).
//   4. DELETE /mijn/voorkeuren/:sleutel verwijdert hem; GET toont hem daarna niet meer.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-paneel01-voorkeuren.ts
import bcrypt from "bcryptjs";
import { inArray } from "drizzle-orm";
import { authenticator } from "otplib";
import { db, gebruikersTable } from "@workspace/db";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "BewijsPaneel01!2026";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) { console.error(`✗ FAALT: ${naam}`, JSON.stringify(detail ?? "", null, 1).slice(0, 2000)); throw new Error(naam); }
  console.log(`✓ ${naam}`);
}

const EMAILS = [
  "bewijs-paneel01-a@fps.local", // gebruiker A (eigenaar van de voorkeur)
  "bewijs-paneel01-b@fps.local", // gebruiker B (mag de voorkeur van A niet zien)
];

async function ruimOp(): Promise<void> {
  await db.delete(gebruikersTable).where(inArray(gebruikersTable.email, EMAILS));
}

async function maakGebruiker(email: string, naam: string): Promise<number> {
  const [g] = await db.insert(gebruikersTable).values({
    naam, email, rol: "gebruiker", wachtwoord: await bcrypt.hash(WW, 10),
    totpSecret: TOTP, tweeFactorIngeschakeld: true, actief: true,
  } as typeof gebruikersTable.$inferInsert).returning({ id: gebruikersTable.id });
  return g!.id;
}

async function login(email: string): Promise<Record<string, string>> {
  const r = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord: WW, code: authenticator.generate(TOTP) }),
  });
  if (r.status !== 200) throw new Error(`login ${email} faalde: ${r.status} ${await r.text()}`);
  const j = await r.json() as { token: string };
  return { Authorization: `Bearer ${j.token}` };
}

async function main(): Promise<void> {
  await ruimOp();

  await maakGebruiker(EMAILS[0]!, "Bewijs Paneel01 A");
  await maakGebruiker(EMAILS[1]!, "Bewijs Paneel01 B");
  const a = await login(EMAILS[0]!);
  const b = await login(EMAILS[1]!);

  const SLEUTEL = "paneel.breedte.projecten";
  const WAARDE = { breedte: 320, ingeklapt: false };

  // ── 1. PUT slaat een voorkeur op ─────────────────────────────────────────
  const put = await fetch(`${BASIS}/mijn/voorkeuren/${SLEUTEL}`, {
    method: "PUT", headers: { ...a, "Content-Type": "application/json" },
    body: JSON.stringify({ waarde: WAARDE }),
  });
  check("1. PUT /mijn/voorkeuren/:sleutel → 200", put.status === 200, put.status);
  const putBody = await put.json() as { sleutel: string; waarde: unknown };
  check("1b. PUT retourneert sleutel + waarde", putBody.sleutel === SLEUTEL && JSON.stringify(putBody.waarde) === JSON.stringify(WAARDE), putBody);

  // ── 2. GET toont de voorkeur terug ───────────────────────────────────────
  const getA = await fetch(`${BASIS}/mijn/voorkeuren`, { headers: a });
  check("2. GET /mijn/voorkeuren → 200", getA.status === 200, getA.status);
  const bodyA = await getA.json() as Record<string, unknown>;
  check("2b. GET toont de opgeslagen waarde onder de sleutel", JSON.stringify(bodyA[SLEUTEL]) === JSON.stringify(WAARDE), bodyA);

  // ── 3. TWEEDE gebruiker ziet hem NIET ────────────────────────────────────
  const getB = await fetch(`${BASIS}/mijn/voorkeuren`, { headers: b });
  const bodyB = await getB.json() as Record<string, unknown>;
  check("3. tweede gebruiker ziet de voorkeur NIET", !(SLEUTEL in bodyB), bodyB);

  // ── 4. DELETE verwijdert hem; daarna weg ─────────────────────────────────
  const del = await fetch(`${BASIS}/mijn/voorkeuren/${SLEUTEL}`, { method: "DELETE", headers: a });
  check("4. DELETE /mijn/voorkeuren/:sleutel → 204", del.status === 204, del.status);
  const delOpnieuw = await fetch(`${BASIS}/mijn/voorkeuren/${SLEUTEL}`, { method: "DELETE", headers: a });
  check("4b. DELETE is idempotent → 204 ook als niet bestond", delOpnieuw.status === 204, delOpnieuw.status);
  const naDelete = await fetch(`${BASIS}/mijn/voorkeuren`, { headers: a });
  const bodyNaDelete = await naDelete.json() as Record<string, unknown>;
  check("4c. GET na DELETE toont de sleutel niet meer", !(SLEUTEL in bodyNaDelete), bodyNaDelete);

  // ── Validatie: ongeldige sleutel en te grote waarde → 422 ────────────────
  const foutSleutel = await fetch(`${BASIS}/mijn/voorkeuren/Ongeldige Sleutel!`, {
    method: "PUT", headers: { ...a, "Content-Type": "application/json" },
    body: JSON.stringify({ waarde: 1 }),
  });
  check("5. ongeldige sleutel → 422", foutSleutel.status === 422, foutSleutel.status);
  const teGroot = await fetch(`${BASIS}/mijn/voorkeuren/te.grote.waarde`, {
    method: "PUT", headers: { ...a, "Content-Type": "application/json" },
    body: JSON.stringify({ waarde: "x".repeat(50001) }),
  });
  check("5b. waarde > 50000 tekens → 422", teGroot.status === 422, teGroot.status);

  await ruimOp();
  console.log("\nAlle PANEEL_01-voorkeuren-acceptatiepunten groen.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

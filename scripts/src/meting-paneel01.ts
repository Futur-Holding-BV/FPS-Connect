// PANEEL_01 Fase 0 — de goedkope test: twee "vensters" tegelijk op één sessie
// en op dezelfde calculatie. Simuleert twee browservensters als twee
// onafhankelijke HTTP-clients met dezelfde inloggegevens, en toetst:
//   1. blijft de sessie in beide geldig?
//   2. wat gebeurt er als beide dezelfde calculatie wijzigen (wie wint)?
// Draaien: pnpm --filter @workspace/scripts exec tsx src/meting-paneel01.ts
import bcrypt from "bcryptjs";
import { inArray, like } from "drizzle-orm";
import { authenticator } from "otplib";
import { db, gebruikersTable } from "@workspace/db";
import { modCalcHeadersTable, modCalcRegelsTable } from "@workspace/db/schema";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "MetingPaneel01!2026";
const EMAIL = "meting-paneel01@fps.local";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: meetscript nooit tegen productie draaien.");
}

async function ruimOp(): Promise<void> {
  const headers = await db.select({ id: modCalcHeadersTable.id }).from(modCalcHeadersTable).where(like(modCalcHeadersTable.naam, "Meting PANEEL01%"));
  if (headers.length) await db.delete(modCalcRegelsTable).where(inArray(modCalcRegelsTable.calculatieId, headers.map((h) => h.id)));
  await db.delete(modCalcHeadersTable).where(like(modCalcHeadersTable.naam, "Meting PANEEL01%"));
  await db.delete(gebruikersTable).where(like(gebruikersTable.email, EMAIL));
}

async function login(): Promise<Record<string, string>> {
  const r = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, wachtwoord: WW, code: authenticator.generate(TOTP) }),
  });
  if (r.status !== 200) throw new Error(`login faalde: ${r.status} ${await r.text()}`);
  const j = await r.json() as { token: string };
  return { Authorization: `Bearer ${j.token}`, "Content-Type": "application/json" };
}

async function main(): Promise<void> {
  await ruimOp();
  await db.insert(gebruikersTable).values({
    naam: "Meting PANEEL01", email: EMAIL, rol: "gebruiker",
    wachtwoord: await bcrypt.hash(WW, 10), totpSecret: TOTP, tweeFactorIngeschakeld: true, actief: true,
    bevoegdheden: { calculaties: 3 },
  } as typeof gebruikersTable.$inferInsert);

  // Twee "vensters": twee onafhankelijke clients, zelfde gebruiker.
  const vensterA = await login();
  const vensterB = await login();

  // 1. Sessie in beide geldig, ook door elkaar heen gebruikt?
  const [meA, meB] = await Promise.all([
    fetch(`${BASIS}/auth/me`, { headers: vensterA }),
    fetch(`${BASIS}/auth/me`, { headers: vensterB }),
  ]);
  console.log(`1. sessie venster A: ${meA.status}, venster B: ${meB.status}`);
  const meA2 = await fetch(`${BASIS}/auth/me`, { headers: vensterA });
  console.log(`1b. venster A na gebruik van B nog geldig: ${meA2.status}`);

  // 2. Beide vensters wijzigen dezelfde calculatie.
  const [header] = await db.insert(modCalcHeadersTable).values({ naam: "Meting PANEEL01 calculatie", status: "concept", klantNaam: "Oorspronkelijk" } as typeof modCalcHeadersTable.$inferInsert).returning();
  const id = header!.id;

  // 2a. Verschillende velden: A wijzigt naam, B (met verouderd beeld) wijzigt klant_naam.
  const rA = await fetch(`${BASIS}/modules/calculaties/${id}`, { method: "PATCH", headers: vensterA, body: JSON.stringify({ naam: "Meting PANEEL01 door A" }) });
  const rB = await fetch(`${BASIS}/modules/calculaties/${id}`, { method: "PATCH", headers: vensterB, body: JSON.stringify({ klant_naam: "Klant door B" }) });
  const na1 = await (await fetch(`${BASIS}/modules/calculaties/${id}`, { headers: vensterA })).json() as { naam: string; klant_naam: string };
  console.log(`2a. verschillende velden (A:${rA.status}/B:${rB.status}) → naam="${na1.naam}", klant_naam="${na1.klant_naam}" (beide behouden: ${na1.naam.endsWith("door A") && na1.klant_naam === "Klant door B"})`);

  // 2b. Hetzelfde veld: A zet naam, daarna B (op basis van verouderd beeld) ook.
  await fetch(`${BASIS}/modules/calculaties/${id}`, { method: "PATCH", headers: vensterA, body: JSON.stringify({ naam: "Meting PANEEL01 versie-A" }) });
  const rB2 = await fetch(`${BASIS}/modules/calculaties/${id}`, { method: "PATCH", headers: vensterB, body: JSON.stringify({ naam: "Meting PANEEL01 versie-B" }) });
  const na2 = await (await fetch(`${BASIS}/modules/calculaties/${id}`, { headers: vensterA })).json() as { naam: string };
  console.log(`2b. zelfde veld (B laatst, ${rB2.status}) → naam="${na2.naam}" — laatste schrijver wint, zonder waarschuwing of foutmelding aan A`);

  await ruimOp();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

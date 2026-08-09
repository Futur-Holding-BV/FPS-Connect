// PANEEL_01 §8.6 — een baan is geen omweg langs de rechten: het serverantwoord
// voor een monteur (zonder financieel recht) die een financieel scherm in een
// baan opent. De baan rendert het bestaande scherm; dat scherm haalt zijn data
// bij de bestaande API — en die weigert.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-paneel01-rechten.ts
import bcrypt from "bcryptjs";
import { like } from "drizzle-orm";
import { authenticator } from "otplib";
import { db, gebruikersTable } from "@workspace/db";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "BewijsPaneel01Rechten!";
const EMAIL = "bewijs-paneel01-monteur@fps.local";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

async function ruimOp(): Promise<void> {
  await db.delete(gebruikersTable).where(like(gebruikersTable.email, EMAIL));
}

async function main(): Promise<void> {
  await ruimOp();
  // Monteur-achtig account: wél gebouwen/voorzieningen, GEEN financiële modules.
  await db.insert(gebruikersTable).values({
    naam: "Bewijs PANEEL01 Monteur", email: EMAIL, rol: "gebruiker",
    wachtwoord: await bcrypt.hash(WW, 10), totpSecret: TOTP,
    tweeFactorIngeschakeld: true, actief: true, functietitels: ["Monteur"],
    bevoegdheden: { gebouwen: 1, voorzieningen: 2 },
  } as typeof gebruikersTable.$inferInsert);

  const login = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, wachtwoord: WW, code: authenticator.generate(TOTP) }),
  });
  if (login.status !== 200) throw new Error(`login faalde: ${login.status}`);
  const { token } = await login.json() as { token: string };
  const headers = { Authorization: `Bearer ${token}` };

  // De financiële schermen die een baan zou kunnen tonen, halen hun data hier:
  for (const pad of ["/facturen", "/fie/begrotingen", "/modules/calculaties"]) {
    const r = await fetch(`${BASIS}${pad}`, { headers });
    const tekst = (await r.text()).slice(0, 120);
    console.log(`${r.status === 403 ? "✓" : "✗"} GET ${pad} als monteur → ${r.status} ${tekst}`);
    if (r.status !== 403) process.exitCode = 1;
  }

  await ruimOp();
  console.log(process.exitCode ? "FAAL" : "PANEEL_01 §8.6 groen: de server weigert, de baan kan niets tonen.");
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error(e); process.exit(1); });

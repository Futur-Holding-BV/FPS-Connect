// Gedragsbewijs #1037/#1038 — modulegrenzen marketing, social en merk:
//  Per systeem-preset (Commercieel, Directie, Calculatie, Monteur) wordt
//  een wegwerpgebruiker aangemaakt met exact de preset-bevoegdheden en
//  via bearer getoetst tegen de echte API:
//   - marketing (3=beheren): Commercieel/Directie JA, Calculatie/Monteur NEE
//   - social 3 (opstellen):  Commercieel/Directie JA, Calculatie/Monteur NEE
//   - social 4 (koppelingen): alleen Directie JA (Commercieel 403)
//   - merk 1 (merkenkast/beeldbank lezen): Commercieel/Directie/Calculatie/
//     Administratie/Projectleider JA, Monteur (veldprofiel) NEE
//   - merk 3 (beeldbank uploaden): Commercieel/Directie JA (non-403), Calculatie 403
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-module-rechten-1038.ts
// Vereist: api-server workflow draait lokaal.
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";

import { db, gebruikersTable } from "@workspace/db";
import { PRESETS } from "@workspace/permissies";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP_SECRET = "MFRGGZDFMZTWQ2LK";
const WACHTWOORD = "BewijsRechten1038!";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production" || !process.env.REPLIT_DEV_DOMAIN) {
  throw new Error("GEWEIGERD: bewijsscript draait alleen in de lokale dev-omgeving (REPLIT_DEV_DOMAIN vereist, nooit productie).");
}

const PROFIELEN = ["Commercieel", "Directie", "Calculatie", "Administratie", "Projectleider", "Monteur"] as const;
type Profiel = (typeof PROFIELEN)[number];

const aangemaakt: number[] = [];

async function opruimen(): Promise<void> {
  for (const id of aangemaakt) {
    await db.delete(gebruikersTable).where(eq(gebruikersTable.id, id));
  }
}

function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) {
    console.error(`✗ FAALT: ${naam}`, detail ?? "");
    throw new Error(`Bewijs mislukt: ${naam}`);
  }
  console.log(`✓ ${naam}`);
}

async function maakEnLogin(profiel: Profiel): Promise<Record<string, string>> {
  const preset = PRESETS.find((p) => p.naam === profiel);
  if (!preset) throw new Error(`Preset ${profiel} niet gevonden`);
  const email = `bewijs-1038-${profiel.toLowerCase()}@fps.local`;
  // Restant van een eerdere gecrashte run alléén opruimen als het aantoonbaar
  // onze eigen wegwerpgebruiker is (naam-marker) — nooit een vreemd account.
  const [oud] = await db.select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
    .from(gebruikersTable).where(eq(gebruikersTable.email, email));
  if (oud) {
    if (!oud.naam.startsWith("Bewijs 1038 ")) throw new Error(`E-mail ${email} is al in gebruik door een niet-bewijsaccount; stop.`);
    await db.delete(gebruikersTable).where(eq(gebruikersTable.id, oud.id));
  }
  const [g] = await db.insert(gebruikersTable).values({
    naam: `Bewijs 1038 ${profiel}`,
    email,
    rol: "gebruiker",
    wachtwoord: await bcrypt.hash(WACHTWOORD, 10),
    totpSecret: TOTP_SECRET,
    tweeFactorIngeschakeld: true,
    actief: true,
    bevoegdheden: preset.bevoegdheden,
  }).returning({ id: gebruikersTable.id });
  aangemaakt.push(g.id);

  const resp = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord: WACHTWOORD, code: authenticator.generate(TOTP_SECRET) }),
  });
  if (resp.status !== 200) throw new Error(`login ${profiel} faalt: ${resp.status}`);
  const { token } = await resp.json() as { token: string };
  return { Authorization: `Bearer ${token}` };
}

async function status(auth: Record<string, string>, pad: string, init?: RequestInit): Promise<number> {
  const r = await fetch(`${BASIS}${pad}`, { ...init, headers: { ...auth, ...(init?.body ? { "Content-Type": "application/json" } : {}) } });
  return r.status;
}

async function main(): Promise<void> {
  const auth: Record<Profiel, Record<string, string>> = {} as never;
  for (const p of PROFIELEN) auth[p] = await maakEnLogin(p);

  // ── Marketing (module marketing, 3 = beheren) ──────────────────────────────
  check("marketing: Commercieel ziet campagnes (200)", await status(auth.Commercieel, "/marketing/campagnes") === 200);
  check("marketing: Directie ziet campagnes (200)", await status(auth.Directie, "/marketing/campagnes") === 200);
  check("marketing: Calculatie geweigerd (403)", await status(auth.Calculatie, "/marketing/campagnes") === 403);
  check("marketing: Monteur geweigerd (403)", await status(auth.Monteur, "/marketing/campagnes") === 403);

  // ── Social (module social: 3 = opstellen, 4 = plannen/koppelingen) ─────────
  check("social 3: Commercieel ziet berichten (200)", await status(auth.Commercieel, "/social/berichten") === 200);
  check("social 3: Directie ziet berichten (200)", await status(auth.Directie, "/social/berichten") === 200);
  check("social 3: Calculatie geweigerd (403)", await status(auth.Calculatie, "/social/berichten") === 403);
  check("social 3: Monteur geweigerd (403)", await status(auth.Monteur, "/social/berichten") === 403);
  check("social 4: Directie ziet koppelingen (200)", await status(auth.Directie, "/social/koppelingen") === 200);
  check("social 4: Commercieel géén koppelingen (403)", await status(auth.Commercieel, "/social/koppelingen") === 403);

  // ── Merk (module merk: 1 = zoeken/downloaden, 3 = uploaden) ────────────────
  for (const p of ["Commercieel", "Directie", "Calculatie", "Administratie", "Projectleider"] as const) {
    check(`merk 1: ${p} ziet merkenkast (200)`, await status(auth[p], "/merkenkast") === 200);
    check(`merk 1: ${p} ziet beeldbank (200)`, await status(auth[p], "/beeldbank/fotos") === 200);
  }
  check("merk 1: Monteur geweigerd op merkenkast (403)", await status(auth.Monteur, "/merkenkast") === 403);
  check("merk 1: Monteur geweigerd op beeldbank (403)", await status(auth.Monteur, "/beeldbank/fotos") === 403);

  const uploadBody = JSON.stringify({});
  const upCalc = await status(auth.Calculatie, "/beeldbank/fotos", { method: "POST", body: uploadBody });
  check("merk 3: Calculatie mag NIET uploaden (403)", upCalc === 403, upCalc);
  const upCom = await status(auth.Commercieel, "/beeldbank/fotos", { method: "POST", body: uploadBody });
  check("merk 3: Commercieel komt door de rechtenpoort (geen 403)", upCom !== 403 && upCom !== 401, upCom);
  const upDir = await status(auth.Directie, "/beeldbank/fotos", { method: "POST", body: uploadBody });
  check("merk 3: Directie komt door de rechtenpoort (geen 403)", upDir !== 403 && upDir !== 401, upDir);

  console.log("\nAlle modulerechten-bewijzen (#1037/#1038) geslaagd.");
}

main()
  .then(async () => { await opruimen(); process.exit(0); })
  .catch(async (err) => { console.error(err); await opruimen(); process.exit(1); });

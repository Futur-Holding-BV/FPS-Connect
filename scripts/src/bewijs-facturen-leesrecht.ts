// Gedragsbewijs RECHTEN_HRM_02 §1 — financieel niveau 1 is puur leesrecht:
//  Een wegwerpgebruiker met de preset "Externe boekhouder" (financieel:1,
//  financieel_vertrouwelijk:1) kan facturen en opmerkingen LEZEN (200), maar
//  elke muterende factuur-route weigert met 403 — óók de vier routes die in
//  RECHTEN_HRM_02 zijn opgetild (bevestig-inkoop, beoordelen-medewerker,
//  opmerkingen plaatsen/afhandelen).
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-facturen-leesrecht.ts
// Vereist: api-server workflow draait lokaal.
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";

import { db, gebruikersTable } from "@workspace/db";
import { PRESETS } from "@workspace/permissies";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP_SECRET = "MFRGGZDFMZTWQ2LK";
const WACHTWOORD = "BewijsLeesrecht2026!";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production" || !process.env.REPLIT_DEV_DOMAIN) {
  throw new Error("GEWEIGERD: bewijsscript draait alleen in de lokale dev-omgeving (REPLIT_DEV_DOMAIN vereist, nooit productie).");
}

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

async function maakEnLogin(): Promise<Record<string, string>> {
  const preset = PRESETS.find((p) => p.naam === "Externe boekhouder");
  if (!preset) throw new Error("Preset Externe boekhouder niet gevonden");
  const email = "bewijs-leesrecht-boekhouder@fps.local";
  const [oud] = await db.select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
    .from(gebruikersTable).where(eq(gebruikersTable.email, email));
  if (oud) {
    if (!oud.naam.startsWith("Bewijs Leesrecht ")) throw new Error(`E-mail ${email} is al in gebruik door een niet-bewijsaccount; stop.`);
    await db.delete(gebruikersTable).where(eq(gebruikersTable.id, oud.id));
  }
  const [g] = await db.insert(gebruikersTable).values({
    naam: "Bewijs Leesrecht Boekhouder",
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
  if (resp.status !== 200) throw new Error(`login faalt: ${resp.status}`);
  const { token } = await resp.json() as { token: string };
  return { Authorization: `Bearer ${token}` };
}

async function status(auth: Record<string, string>, pad: string, init?: RequestInit): Promise<number> {
  const r = await fetch(`${BASIS}${pad}`, { ...init, headers: { ...auth, ...(init?.body ? { "Content-Type": "application/json" } : {}) } });
  return r.status;
}

async function main(): Promise<void> {
  const auth = await maakEnLogin();

  // Lezen mag (niveau 1)
  const lijstResp = await fetch(`${BASIS}/facturen`, { headers: auth });
  check("lezen: GET /facturen → 200", lijstResp.status === 200);
  check("lezen: GET /facturen/analyse → 200", await status(auth, "/facturen/analyse") === 200);
  const lijst = await lijstResp.json() as Array<{ id: number }>;
  if (lijst.length > 0) {
    check(`lezen: GET /facturen/${lijst[0]!.id}/opmerkingen → 200`, await status(auth, `/facturen/${lijst[0]!.id}/opmerkingen`) === 200);
  } else {
    console.log("– lezen opmerkingen: geen facturen in de doelomgeving, check overgeslagen");
  }

  // Muteren mag niet (alles ≥ niveau 2) — de negen routes uit RECHTEN_HRM_02 §1
  const b = (o: unknown) => JSON.stringify(o);
  check("403: POST /facturen/upload-url", await status(auth, "/facturen/upload-url", { method: "POST", body: b({}) }) === 403);
  check("403: POST /facturen", await status(auth, "/facturen", { method: "POST", body: b({}) }) === 403);
  check("403: POST /facturen/1/bevestig-inkoop", await status(auth, "/facturen/1/bevestig-inkoop", { method: "POST", body: b({}) }) === 403);
  check("403: PATCH /facturen/1", await status(auth, "/facturen/1", { method: "PATCH", body: b({}) }) === 403);
  check("403: POST /facturen/1/ai-uitlezen", await status(auth, "/facturen/1/ai-uitlezen", { method: "POST", body: b({}) }) === 403);
  check("403: POST /facturen/1/ter-goedkeuring-indienen", await status(auth, "/facturen/1/ter-goedkeuring-indienen", { method: "POST", body: b({}) }) === 403);
  check("403: POST /facturen/1/beoordelen-medewerker", await status(auth, "/facturen/1/beoordelen-medewerker", { method: "POST", body: b({ actie: "goedkeuren" }) }) === 403);
  check("403: POST /facturen/1/opmerkingen", await status(auth, "/facturen/1/opmerkingen", { method: "POST", body: b({ tekst: "x" }) }) === 403);
  check("403: PATCH /facturen/1/opmerkingen/1", await status(auth, "/facturen/1/opmerkingen/1", { method: "PATCH", body: b({ afgehandeld: true }) }) === 403);

  console.log("\nAlle leesrecht-bewijzen (RECHTEN_HRM_02 §1) geslaagd.");
}

main()
  .then(async () => { await opruimen(); process.exit(0); })
  .catch(async (err) => { console.error(err); await opruimen(); process.exit(1); });

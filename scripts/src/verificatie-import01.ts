/**
 * IMPORT_01 gedragsbewijs — echte HTTP-flows tegen de dev api-server.
 *
 * Bewijst:
 *  B1. Gebruiker zonder importrechten: preview 403, template 403, logs 403.
 *  B2. Gebruiker met alléén magazijn:4 mag artikelen (template 200) maar
 *      geen leveranciers (template 403) en geen medewerkers (403).
 *  B3. Uitvoeren zonder voorafgaande controle wordt geweigerd (400).
 *  B4. Zelfde lijst twee keer importeren: tweede keer worden alle rijen als
 *      dubbel herkend; met keuze "overslaan" ontstaan er géén dubbelen.
 *  B5. Zonder keuze bij dubbelen weigert uitvoeren (422).
 *  B6. Terugdraaien verwijdert exact de geïmporteerde records en de log
 *      krijgt teruggedraaid_op; records dragen bron='import' + import_id.
 *
 * Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-import01.ts
 */
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { db, gebruikersTable, artikelenTable, importLogsTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;

const GEEN_EMAIL = "import01-geenrechten@fps.local";
const MAG_EMAIL = "import01-magazijn@fps.local";
const WACHTWOORD = "Import01Test!2026";
const TOTP_GEEN = "IMPORTGEENRECHT234";
const TOTP_MAG = "IMPORTMAGAZIJN2345";

function faal(msg: string): never {
  console.error(`❌ FAAL: ${msg}`);
  process.exit(1);
}
function ok(msg: string) {
  console.log(`✅ ${msg}`);
}

async function maakGebruiker(email: string, bevoegdheden: Record<string, number>, totpSecret: string): Promise<void> {
  if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
    throw new Error("GEWEIGERD: testaccounts alleen in dev");
  }
  const hash = await bcrypt.hash(WACHTWOORD, 10);
  const [bestaand] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, email));
  if (bestaand) {
    await db.update(gebruikersTable).set({ wachtwoord: hash, bevoegdheden, rol: "gebruiker", actief: true, gearchiveerd: false, totpSecret, tweeFactorIngeschakeld: true }).where(eq(gebruikersTable.id, bestaand.id));
  } else {
    await db.insert(gebruikersTable).values({
      naam: `IMPORT_01 test (${email.split("@")[0]})`,
      email,
      wachtwoord: hash,
      rol: "gebruiker",
      bevoegdheden,
      actief: true,
      totpSecret,
      tweeFactorIngeschakeld: true,
    });
  }
}

type Sessie = { auth: string };

async function login(email: string, totpSecret: string): Promise<Sessie> {
  const code = authenticator.generate(totpSecret);
  const resp = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord: WACHTWOORD, code }),
  });
  if (!resp.ok) faal(`login ${email} → ${resp.status}: ${await resp.text()}`);
  const { token } = (await resp.json()) as { token: string };
  return { auth: `Bearer ${token}` };
}

async function get(s: Sessie, pad: string) {
  return fetch(`${BASIS}${pad}`, { headers: { Authorization: s.auth } });
}
async function post(s: Sessie, pad: string, body: unknown) {
  return fetch(`${BASIS}${pad}`, {
    method: "POST",
    headers: { Authorization: s.auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function postForm(s: Sessie, pad: string, form: FormData) {
  return fetch(`${BASIS}${pad}`, { method: "POST", headers: { Authorization: s.auth }, body: form });
}

const CSV = [
  "code,naam,eenheid,inkoopprijs",
  "IMP01-A,IMPORT01 Testartikel Alfa,st,10.50",
  "IMP01-B,IMPORT01 Testartikel Beta,m2,4.25",
  "IMP01-C,IMPORT01 Testartikel Gamma,st,1.99",
].join("\n");

function csvForm(type: string): FormData {
  const form = new FormData();
  form.append("bestand", new Blob([CSV], { type: "text/csv" }), "import01-artikelen.csv");
  form.append("type", type);
  return form;
}
const KOPPELING = { code: "code", naam: "naam", eenheid: "eenheid", inkoopprijs: "inkoopprijs" };

async function main() {
  // Schone uitgangssituatie
  await db.delete(artikelenTable).where(like(artikelenTable.naam, "IMPORT01 %"));
  await maakGebruiker(GEEN_EMAIL, {}, TOTP_GEEN);
  await maakGebruiker(MAG_EMAIL, { magazijn: 4 }, TOTP_MAG);

  // ── B1: geen rechten ──
  const geen = await login(GEEN_EMAIL, TOTP_GEEN);
  const r1 = await postForm(geen, "/import/preview", csvForm("artikelen"));
  if (r1.status !== 403) faal(`B1 preview zonder rechten → ${r1.status} (verwacht 403)`);
  const r1b = await get(geen, "/import/template/artikelen");
  if (r1b.status !== 403) faal(`B1 template zonder rechten → ${r1b.status} (verwacht 403)`);
  const r1c = await get(geen, "/import/logs");
  if (r1c.status !== 403) faal(`B1 logs zonder rechten → ${r1c.status} (verwacht 403)`);
  ok("B1: gebruiker zonder rechten wordt overal geweigerd (preview/template/logs 403)");

  // ── B2: alleen magazijn:4 ──
  const mag = await login(MAG_EMAIL, TOTP_MAG);
  const r2 = await get(mag, "/import/template/artikelen");
  if (r2.status !== 200) faal(`B2 template artikelen met magazijn:4 → ${r2.status} (verwacht 200)`);
  const r2b = await get(mag, "/import/template/leveranciers");
  if (r2b.status !== 403) faal(`B2 template leveranciers met alleen magazijn → ${r2b.status} (verwacht 403)`);
  const r2c = await postForm(mag, "/import/preview", csvForm("medewerkers"));
  if (r2c.status !== 403) faal(`B2 preview medewerkers met alleen magazijn → ${r2c.status} (verwacht 403)`);
  ok("B2: magazijn:4 mag artikelen, maar leveranciers/medewerkers worden geweigerd");

  // ── B3: uitvoeren zonder controle ──
  const p1 = await postForm(mag, "/import/preview", csvForm("artikelen"));
  if (p1.status !== 200) faal(`B3 preview artikelen → ${p1.status}`);
  const prev1 = (await p1.json()) as { bestand_id: string; totaal_rijen: number };
  const r3 = await post(mag, "/import/uitvoeren", { bestand_id: prev1.bestand_id, type: "artikelen", kolomkoppeling: KOPPELING });
  if (r3.status !== 400) faal(`B3 uitvoeren zonder controle → ${r3.status} (verwacht 400)`);
  ok("B3: uitvoeren zonder voorafgaande controle wordt geweigerd (400)");

  // ── Eerste import (na controle) ──
  const c1 = await post(mag, "/import/controleren", { bestand_id: prev1.bestand_id, type: "artikelen", kolomkoppeling: KOPPELING });
  if (c1.status !== 200) faal(`controle 1 → ${c1.status}: ${await c1.text()}`);
  const con1 = (await c1.json()) as { nieuw: number; dubbel: number; onbruikbaar: number };
  if (con1.nieuw !== 3 || con1.dubbel !== 0) faal(`controle 1: nieuw=${con1.nieuw} dubbel=${con1.dubbel} (verwacht 3/0)`);
  const u1 = await post(mag, "/import/uitvoeren", { bestand_id: prev1.bestand_id, type: "artikelen", kolomkoppeling: KOPPELING });
  if (u1.status !== 200) faal(`uitvoeren 1 → ${u1.status}: ${await u1.text()}`);
  const res1 = (await u1.json()) as { rijen_verwerkt: number; log_id: number };
  if (res1.rijen_verwerkt !== 3) faal(`uitvoeren 1 verwerkt=${res1.rijen_verwerkt} (verwacht 3)`);
  ok(`Eerste import: 3 rijen verwerkt (log #${res1.log_id})`);

  // Bron + import_id op de records?
  const rijen1 = await db.select().from(artikelenTable).where(like(artikelenTable.naam, "IMPORT01 %"));
  if (rijen1.length !== 3) faal(`na import 1: ${rijen1.length} records (verwacht 3)`);
  if (!rijen1.every((r) => r.bron === "import" && r.importId === res1.log_id)) {
    faal(`records missen bron='import'/import_id=${res1.log_id}: ${JSON.stringify(rijen1.map((r) => ({ bron: r.bron, importId: r.importId })))}`);
  }
  ok(`Alle 3 records dragen bron='import' en import_id=${res1.log_id}`);

  // ── B4/B5: zelfde lijst opnieuw ──
  const p2 = await postForm(mag, "/import/preview", csvForm("artikelen"));
  const prev2 = (await p2.json()) as { bestand_id: string };
  const c2 = await post(mag, "/import/controleren", { bestand_id: prev2.bestand_id, type: "artikelen", kolomkoppeling: KOPPELING });
  const con2 = (await c2.json()) as { nieuw: number; dubbel: number };
  if (con2.dubbel !== 3 || con2.nieuw !== 0) faal(`B4 controle 2: nieuw=${con2.nieuw} dubbel=${con2.dubbel} (verwacht 0/3)`);
  ok("B4: tweede keer dezelfde lijst → alle 3 rijen herkend als dubbel");

  const u2zonder = await post(mag, "/import/uitvoeren", { bestand_id: prev2.bestand_id, type: "artikelen", kolomkoppeling: KOPPELING });
  if (u2zonder.status !== 422) faal(`B5 uitvoeren met dubbelen zonder keuze → ${u2zonder.status} (verwacht 422)`);
  ok("B5: bij dubbelen zonder keuze weigert uitvoeren (422)");

  const u2 = await post(mag, "/import/uitvoeren", { bestand_id: prev2.bestand_id, type: "artikelen", kolomkoppeling: KOPPELING, keuze_dubbelen: "overslaan" });
  if (u2.status !== 200) faal(`uitvoeren 2 → ${u2.status}: ${await u2.text()}`);
  const res2 = (await u2.json()) as { rijen_verwerkt: number; rijen_dubbel_overgeslagen: number };
  if (res2.rijen_verwerkt !== 0 || res2.rijen_dubbel_overgeslagen !== 3) {
    faal(`B4 uitvoeren 2: verwerkt=${res2.rijen_verwerkt} dubbel_overgeslagen=${res2.rijen_dubbel_overgeslagen} (verwacht 0/3)`);
  }
  const rijen2 = await db.select().from(artikelenTable).where(like(artikelenTable.naam, "IMPORT01 %"));
  if (rijen2.length !== 3) faal(`B4: na tweede import ${rijen2.length} records (verwacht nog steeds 3 — geen dubbelen)`);
  ok("B4: met keuze 'overslaan' zijn er géén dubbelen ontstaan (nog exact 3 records)");

  // ── B6: terugdraaien ──
  const t1 = await post(mag, `/import/logs/${res1.log_id}/terugdraaien`, {});
  if (t1.status !== 200) faal(`B6 terugdraaien → ${t1.status}: ${await t1.text()}`);
  const ter = (await t1.json()) as { verwijderd: number; volledig: boolean; niet_verwijderd: unknown[] };
  if (!ter.volledig || ter.verwijderd !== 3) faal(`B6: verwijderd=${ter.verwijderd} volledig=${ter.volledig} (verwacht 3/true)`);
  const rijen3 = await db.select().from(artikelenTable).where(like(artikelenTable.naam, "IMPORT01 %"));
  if (rijen3.length !== 0) faal(`B6: na terugdraaien nog ${rijen3.length} records (verwacht 0)`);
  const [logNa] = await db.select().from(importLogsTable).where(eq(importLogsTable.id, res1.log_id));
  if (!logNa?.teruggedraaidOp) faal("B6: log mist teruggedraaid_op");
  const t2 = await post(mag, `/import/logs/${res1.log_id}/terugdraaien`, {});
  if (t2.status !== 409) faal(`B6: tweede keer terugdraaien → ${t2.status} (verwacht 409)`);
  ok("B6: terugdraaien verwijdert exact 3 records, log gemarkeerd, tweede keer 409");

  // Zonder rechten terugdraaien? (log is van type artikelen; geen-rechten-gebruiker)
  const t3 = await post(geen, `/import/logs/${res1.log_id}/terugdraaien`, {});
  if (t3.status !== 403) faal(`terugdraaien zonder rechten → ${t3.status} (verwacht 403)`);
  ok("Extra: terugdraaien zonder rechten geweigerd (403)");

  // Opruimen testaccounts (archiveren, niet verwijderen i.v.m. FK's op logs)
  await db.update(gebruikersTable).set({ actief: false, gearchiveerd: true }).where(eq(gebruikersTable.email, GEEN_EMAIL));
  await db.update(gebruikersTable).set({ actief: false, gearchiveerd: true }).where(eq(gebruikersTable.email, MAG_EMAIL));

  console.log("\n🎉 Alle IMPORT_01-bewijzen geslaagd");
  process.exit(0);
}

main().catch((err) => faal(String(err)));

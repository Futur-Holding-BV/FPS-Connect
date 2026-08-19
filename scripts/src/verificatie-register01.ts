/**
 * REGISTER_01 — bewijsscript (dev).
 *
 * V1: register gevuld (≥ 400 punten, ≥ 50 opdrachten) met alleen geldige standen.
 * V2: GET /api/acceptatieregister zonder login → 401; gewone gebruiker → 403.
 * V3: hoofdbeheerder ziet de lijst inclusief de REGISTER_01-punten.
 * V4: PATCH met ongeldige stand → 400; geldige stand-wissel → 200 en persistent,
 *     daarna netjes teruggezet.
 * V5: oplever-check faalt (exit 1) op een opdracht met open punten en slaagt op
 *     een volledig gehaalde opdracht.
 * V6: statusrapport van vandaag bestaat en is gegenereerd uit het register.
 *
 * Testaccounts worden na afloop gearchiveerd.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { db, gebruikersTable, acceptatieRegisterTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { hash } from "bcryptjs";
import { authenticator } from "otplib";

const TOTPS = new Map<string, string>();
const BASIS = process.env["API_BASIS"] ?? `https://${process.env["REPLIT_DEV_DOMAIN"]}/api`;
const WACHTWOORD = "Register01!bewijs";

function faal(msg: string): never { console.error(`❌ ${msg}`); process.exit(1); }
function ok(msg: string): void { console.log(`✅ ${msg}`); }

async function maakAccount(email: string, naam: string, rol: string): Promise<number> {
  const ww = await hash(WACHTWOORD, 10);
  const totp = authenticator.generateSecret();
  TOTPS.set(email, totp);
  const [rij] = await db.insert(gebruikersTable).values({
    email, naam, rol, wachtwoord: ww, actief: true, totpSecret: totp, tweeFactorIngeschakeld: true,
  } as typeof gebruikersTable.$inferInsert).returning({ id: gebruikersTable.id });
  return rij!.id;
}

async function login(email: string): Promise<string> {
  const r = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord: WACHTWOORD, code: authenticator.generate(TOTPS.get(email)!) }),
  });
  if (!r.ok) faal(`login ${email} → ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { token?: string };
  if (!j.token) faal(`login ${email}: geen token`);
  return j.token;
}

async function api(token: string | null, methode: string, pad: string, body?: unknown) {
  const r = await fetch(`${BASIS}${pad}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: unknown = null;
  try { json = await r.json(); } catch { /* leeg */ }
  return { status: r.status, json };
}

type Punt = { id: number; opdracht_code: string; punt_nummer: number; stand: string };

async function main(): Promise<void> {
  const stempel = Date.now();
  const hbEmail = `register01-hb-${stempel}@voorbeeld.example`;
  const gbEmail = `register01-gb-${stempel}@voorbeeld.example`;
  const hbId = await maakAccount(hbEmail, "Register01 Hoofdbeheerder", "hoofdbeheerder");
  const gbId = await maakAccount(gbEmail, "Register01 Gebruiker", "gebruiker");
  try {
    // V1 — vulling en geldige standen
    const [tellers] = (await db.execute(sql`
      SELECT count(*)::int AS punten, count(DISTINCT opdracht_code)::int AS opdrachten,
             count(*) FILTER (WHERE stand NOT IN ('gehaald','niet_gebouwd','onbewezen','wacht_op_rene'))::int AS ongeldig
      FROM acceptatie_register`)).rows as { punten: number; opdrachten: number; ongeldig: number }[];
    if (!tellers || tellers.punten < 400 || tellers.opdrachten < 50) faal(`V1: register te leeg: ${JSON.stringify(tellers)}`);
    if (tellers.ongeldig !== 0) faal(`V1: ${tellers.ongeldig} regels met ongeldige stand`);
    ok(`V1 Register gevuld: ${tellers.punten} punten over ${tellers.opdrachten} opdrachten, alle standen geldig`);

    // V2 — autorisatie
    const anon = await api(null, "GET", "/acceptatieregister");
    if (anon.status !== 401) faal(`V2: zonder login moet 401, kreeg ${anon.status}`);
    const gb = await login(gbEmail);
    const alsGb = await api(gb, "GET", "/acceptatieregister");
    if (alsGb.status !== 403) faal(`V2: gewone gebruiker moet 403, kreeg ${alsGb.status}`);
    ok("V2 Register is hoofdbeheerder-only (401 anoniem, 403 gewone gebruiker)");

    // V3 — hoofdbeheerder ziet de lijst
    const hb = await login(hbEmail);
    const lijst = await api(hb, "GET", "/acceptatieregister");
    if (lijst.status !== 200) faal(`V3: GET als hoofdbeheerder → ${lijst.status}`);
    const punten = lijst.json as Punt[];
    const eigen = punten.filter((p) => p.opdracht_code === "REGISTER_01");
    if (eigen.length < 5) faal(`V3: REGISTER_01-punten ontbreken (${eigen.length})`);
    ok(`V3 Hoofdbeheerder ziet ${punten.length} punten, incl. ${eigen.length} REGISTER_01-punten`);

    // V4 — PATCH validatie + persistentie
    const doel = eigen[0]!;
    const fout400 = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, { stand: "kapot" });
    if (fout400.status !== 400) faal(`V4: ongeldige stand moet 400, kreeg ${fout400.status}`);
    const leeg = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, {});
    if (leeg.status !== 400) faal(`V4: lege PATCH moet 400 (mag bijgewerkt_op niet verversen), kreeg ${leeg.status}`);
    const onbekendVeld = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, { hack: 1 });
    if (onbekendVeld.status !== 400) faal(`V4: onbekend veld moet 400, kreeg ${onbekendVeld.status}`);
    const zonderBewijs = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, { stand: "gehaald", bewijs_vindplaats: null });
    if (zonderBewijs.status !== 400) faal(`V4: gehaald zonder bewijs moet 400, kreeg ${zonderBewijs.status}`);
    const oude = doel.stand;
    const wissel = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, { stand: "wacht_op_rene" });
    if (wissel.status !== 200) faal(`V4: geldige PATCH → ${wissel.status}`);
    const [naDb] = await db.select().from(acceptatieRegisterTable).where(eq(acceptatieRegisterTable.id, doel.id));
    if (naDb?.stand !== "wacht_op_rene") faal(`V4: stand niet gepersisteerd (${naDb?.stand})`);
    await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, { stand: oude });
    ok("V4 PATCH: ongeldige stand/lege body/onbekend veld/gehaald-zonder-bewijs → 400; geldige wissel persistent en teruggezet");

    // V5 — oplever-check gedrag
    const openCode = punten.find((p) => p.stand === "niet_gebouwd")?.opdracht_code;
    if (!openCode) faal("V5: geen opdracht met niet_gebouwd punt gevonden");
    let faalde = false;
    try { execSync(`pnpm exec tsx src/oplever-check.ts ${openCode}`, { stdio: "pipe" }); } catch { faalde = true; }
    if (!faalde) faal(`V5: oplever-check hoort te falen op ${openCode}`);
    execSync(`pnpm exec tsx src/oplever-check.ts REGISTER_01`, { stdio: "pipe" });
    ok(`V5 Oplever-check faalt op ${openCode} (open punten) en slaagt op REGISTER_01`);

    // V5b — deels-verouderd register: één regel op gisteren → oplever-check faalt
    const eigenPunt = eigen[1]!;
    await db.execute(sql`UPDATE acceptatie_register SET bijgewerkt_op = now() - interval '1 day' WHERE id = ${eigenPunt.id}`);
    let faaldeStale = false;
    try { execSync(`pnpm exec tsx src/oplever-check.ts REGISTER_01`, { stdio: "pipe" }); } catch { faaldeStale = true; }
    await db.execute(sql`UPDATE acceptatie_register SET bijgewerkt_op = now() WHERE id = ${eigenPunt.id}`);
    if (!faaldeStale) faal("V5b: oplever-check hoort te falen zodra één regel niet vandaag is bijgewerkt");
    ok("V5b Oplever-check faalt zodra ook maar één registerregel verouderd is");

    // V5c — DB-invariant: ongeldige stand wordt door de CHECK geweigerd
    let dbWeigerde = false;
    try { await db.execute(sql`UPDATE acceptatie_register SET stand = 'kapot' WHERE id = ${eigenPunt.id}`); }
    catch { dbWeigerde = true; }
    if (!dbWeigerde) faal("V5c: DB CHECK-constraint op stand ontbreekt of grijpt niet in");
    ok("V5c DB weigert ongeldige standen (CHECK-constraint)");

    // V6 — gegenereerd statusrapport
    const datum = new Date().toISOString().slice(0, 10);
    const pad = `../docs/status/STATUS_${datum}.md`;
    if (!existsSync(pad)) faal(`V6: ${pad} ontbreekt — draai genereer-statusrapport.ts`);
    const inhoud = readFileSync(pad, "utf8");
    if (!inhoud.includes("Gegenereerd uit het acceptatieregister")) faal("V6: rapport is niet uit het register gegenereerd");
    if (!inhoud.includes("| REGISTER_01 |")) faal("V6: REGISTER_01 ontbreekt in de opdrachttabel");
    ok(`V6 Statusrapport STATUS_${datum}.md gegenereerd uit het register`);

    console.log("\nAlle REGISTER_01-verificaties groen.");
  } finally {
    await db.update(gebruikersTable).set({ actief: false, email: `gearchiveerd-${hbId}@voorbeeld.example` }).where(eq(gebruikersTable.id, hbId));
    await db.update(gebruikersTable).set({ actief: false, email: `gearchiveerd-${gbId}@voorbeeld.example` }).where(eq(gebruikersTable.id, gbId));
  }
  process.exit(0);
}

main().catch((e) => faal(String(e)));

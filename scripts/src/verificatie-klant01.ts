/**
 * KLANT_01 gedragsbewijs — klantafscherming (dicht tenzij open).
 *
 * Bewijst:
 *  K1. Klant A ziet in /gebouwen alleen zijn eigen gebouw; gebouw van klant B
 *      is ook via direct URL onbereikbaar.
 *  K2. Rapporten: klant A kan de rapporten van gebouw B niet opvragen (404),
 *      wél zijn eigen definitieve rapporten; concepten blijven onzichtbaar.
 *  K3. PIM: klant A kan de PIM van een opdracht op gebouw B niet opvragen (404),
 *      wél die van zijn eigen gebouw.
 *  K4. Klant-poort: routes buiten het klantoppervlak geven 403 voor een klant
 *      (projecten, opname, workflow, chat-gebruikers, info, nieuws, kantoor-release),
 *      inclusief muterende verzoeken.
 *  K5. Allowlist: het bedoelde klantoppervlak blijft werken (dashboard, inspecties).
 *  M1. Medewerker-toegang is ongewijzigd: dezelfde routes die voor klant dicht
 *      zijn, blijven voor een hoofdbeheerder bereikbaar.
 *
 * Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-klant01.ts
 */
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import {
  db, gebruikersTable, gebouwenTable, gebouwToewijzingenTable,
  opleverrapportenTable, opdrachtenTable, pimModellenTable, gebouwPublicatiesTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const WACHTWOORD = "Klant01Test!2026";

const ACCOUNTS = {
  klantA: { email: "klant01-a@fps.local", totp: "KLANTATEST2345678", rol: "klant" as const },
  klantB: { email: "klant01-b@fps.local", totp: "KLANTBTEST2345678", rol: "klant" as const },
  admin: { email: "klant01-admin@fps.local", totp: "KLANTADMIN2345678", rol: "hoofdbeheerder" as const },
};

function faal(msg: string): never { console.error(`❌ FAAL: ${msg}`); process.exit(1); }
function ok(msg: string) { console.log(`✅ ${msg}`); }

async function maakGebruiker(a: { email: string; totp: string; rol: "klant" | "hoofdbeheerder" }): Promise<number> {
  if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") throw new Error("GEWEIGERD: testaccounts alleen in dev");
  const hash = await bcrypt.hash(WACHTWOORD, 10);
  const [bestaand] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, a.email));
  if (bestaand) {
    await db.update(gebruikersTable).set({ wachtwoord: hash, rol: a.rol, bevoegdheden: {}, actief: true, gearchiveerd: false, totpSecret: a.totp, tweeFactorIngeschakeld: true }).where(eq(gebruikersTable.id, bestaand.id));
    return bestaand.id;
  }
  const [rij] = await db.insert(gebruikersTable).values({
    naam: `KLANT_01 test (${a.email.split("@")[0]})`,
    email: a.email, wachtwoord: hash, rol: a.rol, bevoegdheden: {},
    actief: true, totpSecret: a.totp, tweeFactorIngeschakeld: true,
  }).returning({ id: gebruikersTable.id });
  return rij.id;
}

async function login(a: { email: string; totp: string }): Promise<Record<string, string>> {
  const resp = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: a.email, wachtwoord: WACHTWOORD, code: authenticator.generate(a.totp) }),
  });
  if (!resp.ok) faal(`login ${a.email} → ${resp.status}: ${await resp.text()}`);
  const { token } = (await resp.json()) as { token: string };
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function haal(h: Record<string, string>, pad: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const resp = await fetch(`${BASIS}${pad}`, { ...init, headers: { ...h, ...(init?.headers as Record<string, string> | undefined) } });
  let body: unknown = null;
  try { body = await resp.json(); } catch { /* leeg */ }
  return { status: resp.status, body };
}

async function main() {
  // ── Setup: 2 gebouwen, 2 klanten (elk 1 toewijzing), rapporten + PIM ──
  const [idA, idB, idAdmin] = await Promise.all([
    maakGebruiker(ACCOUNTS.klantA), maakGebruiker(ACCOUNTS.klantB), maakGebruiker(ACCOUNTS.admin),
  ]);

  async function maakGebouw(naam: string): Promise<number> {
    const [bestaand] = await db.select({ id: gebouwenTable.id }).from(gebouwenTable).where(eq(gebouwenTable.naam, naam));
    if (bestaand) return bestaand.id;
    const [rij] = await db.insert(gebouwenTable).values({ naam, adres: "Teststraat 1", stad: "Testdam" }).returning({ id: gebouwenTable.id });
    return rij.id;
  }
  const gebouwA = await maakGebouw("KLANT_01 Gebouw A");
  const gebouwB = await maakGebouw("KLANT_01 Gebouw B");
  // Klanten zien alleen gepubliceerde gebouwen
  for (const gid of [gebouwA, gebouwB]) {
    const [pub] = await db.select({ id: gebouwPublicatiesTable.id }).from(gebouwPublicatiesTable)
      .where(and(eq(gebouwPublicatiesTable.gebouwId, gid), eq(gebouwPublicatiesTable.status, "gepubliceerd")));
    if (!pub) await db.insert(gebouwPublicatiesTable).values({ gebouwId: gid, status: "gepubliceerd" });
  }

  // Toewijzingen exclusief maken
  await db.delete(gebouwToewijzingenTable).where(inArray(gebouwToewijzingenTable.gebruikerId, [idA, idB]));
  await db.insert(gebouwToewijzingenTable).values([
    { gebouwId: gebouwA, gebruikerId: idA },
    { gebouwId: gebouwB, gebruikerId: idB },
  ]);

  async function maakRapport(gebouwId: number, status: string): Promise<number> {
    const [rij] = await db.insert(opleverrapportenTable).values({
      gebouwId, rapportType: "opleverrapport", status, titel: `KLANT_01 ${status} ${gebouwId}`,
      secties: {}, spotSelectie: {}, bijlagenIds: [], tekeningIds: [], aangemaaktDoor: idAdmin, bijgewerktOp: new Date(),
    }).returning({ id: opleverrapportenTable.id });
    return rij.id;
  }
  await db.delete(opleverrapportenTable).where(inArray(opleverrapportenTable.gebouwId, [gebouwA, gebouwB]));
  const rapportA = await maakRapport(gebouwA, "definitief");
  await maakRapport(gebouwA, "concept");
  const rapportB = await maakRapport(gebouwB, "definitief");

  async function maakOpdrachtMetPim(gebouwId: number): Promise<number> {
    const [opdracht] = await db.insert(opdrachtenTable).values({ titel: `KLANT_01 opdracht ${gebouwId}`, gebouwId }).returning({ id: opdrachtenTable.id });
    await db.insert(pimModellenTable).values({ opdrachtId: opdracht.id });
    return opdracht.id;
  }
  // Oude testrestanten opruimen
  const oude = await db.select({ id: opdrachtenTable.id }).from(opdrachtenTable).where(inArray(opdrachtenTable.gebouwId, [gebouwA, gebouwB]));
  if (oude.length) {
    await db.delete(pimModellenTable).where(inArray(pimModellenTable.opdrachtId, oude.map(o => o.id)));
    await db.delete(opdrachtenTable).where(inArray(opdrachtenTable.id, oude.map(o => o.id)));
  }
  const opdrachtA = await maakOpdrachtMetPim(gebouwA);
  const opdrachtB = await maakOpdrachtMetPim(gebouwB);

  const [hA, hAdmin] = await Promise.all([login(ACCOUNTS.klantA), login(ACCOUNTS.admin)]);

  // ── K1: gebouwafscherming ──
  const lijst = await haal(hA, "/gebouwen");
  if (lijst.status !== 200) faal(`K1 /gebouwen → ${lijst.status}`);
  const idsInLijst = (lijst.body as Array<{ id: number }>).map(g => g.id);
  if (!idsInLijst.includes(gebouwA)) faal("K1: klant A ziet eigen gebouw niet");
  if (idsInLijst.includes(gebouwB)) faal("K1: klant A ziet gebouw van klant B in de lijst!");
  const detailB = await haal(hA, `/gebouwen/${gebouwB}`);
  if (detailB.status === 200) faal("K1: klant A kan gebouwdetail van B openen via directe URL!");
  ok(`K1 gebouwen: eigen gebouw zichtbaar, gebouw B via lijst én directe URL onbereikbaar (${detailB.status})`);

  // ── K2: rapporten ──
  const rapB = await haal(hA, `/gebouwen/${gebouwB}/rapporten`);
  if (rapB.status !== 404) faal(`K2: rapportenlijst vreemd gebouw gaf ${rapB.status}, verwacht 404`);
  const rapBdirect = await haal(hA, `/gebouwen/${gebouwB}/rapporten/${rapportB}`);
  if (rapBdirect.status !== 404) faal(`K2: rapportdetail vreemd gebouw gaf ${rapBdirect.status}, verwacht 404`);
  const rapEigen = await haal(hA, `/gebouwen/${gebouwA}/rapporten`);
  if (rapEigen.status !== 200) faal(`K2: eigen rapportenlijst gaf ${rapEigen.status}`);
  const eigenStatussen = (rapEigen.body as Array<{ id: number; status: string }>);
  if (!eigenStatussen.some(r => r.id === rapportA)) faal("K2: eigen definitief rapport ontbreekt");
  if (eigenStatussen.some(r => r.status === "concept")) faal("K2: klant ziet conceptrapport!");
  ok("K2 rapporten: vreemd gebouw 404 (lijst+detail), eigen definitief zichtbaar, concept verborgen");

  // ── K3: PIM ──
  const pimB = await haal(hA, `/opdrachten/${opdrachtB}/pim`);
  if (pimB.status !== 404) faal(`K3: PIM van vreemde opdracht gaf ${pimB.status}, verwacht 404`);
  const pimEigen = await haal(hA, `/opdrachten/${opdrachtA}/pim`);
  if (pimEigen.status !== 200) faal(`K3: eigen PIM gaf ${pimEigen.status}`);
  const stappenB = await haal(hA, `/opdrachten/${opdrachtB}/pim/uitvoering/stappen`);
  if (stappenB.status !== 404) faal(`K3: uitvoeringsstappen vreemde opdracht gaf ${stappenB.status}`);
  ok("K3 PIM: vreemde opdracht 404 (pim + uitvoeringsstappen), eigen PIM 200");

  // ── K4: klant-poort dicht-tenzij-open ──
  const dicht: Array<[string, string, RequestInit?]> = [
    ["GET", "/projecten"], ["GET", `/projecten/1`],
    ["PATCH", "/projecten/1", { method: "PATCH", body: JSON.stringify({ titel: "hack" }) }],
    ["DELETE", "/projecten/1", { method: "DELETE" }],
    ["GET", "/opname"], ["POST", "/opname", { method: "POST", body: JSON.stringify({ gebouw_id: gebouwB }) }],
    ["GET", "/workflow-definities"], ["GET", "/chat/gebruikers"],
    ["GET", "/info/instellingen"], ["GET", "/nieuws"], ["GET", "/kantoor-release/actief"],
    ["GET", "/gebruikers"], ["GET", "/offertes"], ["GET", "/uren"], ["GET", "/hrm/medewerkers"],
  ];
  for (const [methode, pad, init] of dicht) {
    const r = await haal(hA, pad, { method: methode, ...init });
    if (r.status !== 403) faal(`K4: ${methode} ${pad} gaf ${r.status} voor klant, verwacht 403`);
  }
  ok(`K4 klant-poort: ${dicht.length} routes buiten het klantoppervlak geven 403 (incl. muterend)`);

  // ── K4b: padvarianten omzeilen de poort niet ──
  for (const pad of ["/projecten/", "//projecten", "/Projecten", "/projecten/..%2Fprojecten", "/projecten?x=1"]) {
    const r = await haal(hA, pad);
    if (r.status === 200) faal(`K4b: padvariant ${pad} omzeilt de poort (200)!`);
  }
  ok("K4b padvarianten (trailing slash, dubbele slash, case, encoded, query) blijven dicht");

  // ── K4c: ongescoopte (legacy) storage-paden dicht voor klant ──
  const legacy = await haal(hA, "/storage/objects/uploads/niet-bestaand-testpad");
  if (legacy.status !== 403) faal(`K4c: legacy storage-pad gaf ${legacy.status} voor klant, verwacht 403`);
  const legacyAdmin = await haal(hAdmin, "/storage/objects/uploads/niet-bestaand-testpad");
  if (legacyAdmin.status === 403) faal("K4c: legacy storage-pad is óók dicht voor medewerker (regressie)");
  ok(`K4c storage: ongescoopt pad 403 voor klant, medewerker ongewijzigd (${legacyAdmin.status})`);

  // ── K2b: bijlagenbundel — vreemd gebouw dicht, eigen definitief rapport toegestaan ──
  const bundelB = await haal(hA, `/gebouwen/${gebouwB}/rapporten/${rapportB}/bijlagenbundel`);
  if (bundelB.status !== 404) faal(`K2b: bijlagenbundel vreemd gebouw gaf ${bundelB.status}, verwacht 404`);
  const bundelEigen = await haal(hA, `/gebouwen/${gebouwA}/rapporten/${rapportA}/bijlagenbundel`);
  if (bundelEigen.status === 403 || bundelEigen.status === 404) faal(`K2b: eigen bijlagenbundel gaf ${bundelEigen.status} — klant-download kapot`);
  ok(`K2b bijlagenbundel: vreemd gebouw 404, eigen definitief rapport bereikbaar (${bundelEigen.status})`);

  // ── K5: bedoeld klantoppervlak blijft werken ──
  for (const pad of ["/dashboard/stats", "/inspecties"]) {
    const r = await haal(hA, pad);
    if (r.status !== 200) faal(`K5: ${pad} gaf ${r.status} voor klant, verwacht 200`);
  }
  ok("K5 allowlist: dashboard/stats en inspecties blijven 200 voor klant");

  // ── M1: medewerker-toegang ongewijzigd ──
  for (const pad of ["/gebouwen", "/projecten", "/workflow-definities", "/nieuws", `/gebouwen/${gebouwB}/rapporten`, `/opdrachten/${opdrachtB}/pim`]) {
    const r = await haal(hAdmin, pad);
    if (r.status !== 200) faal(`M1: ${pad} gaf ${r.status} voor hoofdbeheerder, verwacht 200`);
  }
  ok("M1 medewerker: hoofdbeheerder bereikt dezelfde routes gewoon (200)");

  // ── Opruimen: testaccounts deactiveren ──
  await db.update(gebruikersTable).set({ actief: false, gearchiveerd: true }).where(inArray(gebruikersTable.id, [idA, idB, idAdmin]));
  console.log("\n🎉 KLANT_01 bewijs volledig geslaagd");
}

main().catch((err) => { console.error(err); process.exit(1); });

// ADMINISTRATIE_01 vervolg — bewijsscript.
// Bewijst: (1) werkbak-actiepunt voor de gekoppelde BV zonder rekeningschema,
// zelfsluitend zodra het schema gevuld is, en NIET voor niet-boekende BV's;
// (2) poortstatus-endpoint per werkmaatschappij; (3) typefouten in één keer
// omzetten — BV- en statusbewust: geboekte facturen en facturen van een
// andere BV worden overgeslagen en geteld; (4) regelmutaties op verwerkte/
// geboekte facturen weigeren met 409.
// Test via HTTP (nooit api-server-source importeren) + @workspace/db voor
// opzet/schoonmaak. Draaien: npx tsx scripts/src/verificatie-administratie01-vervolg.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import { eq, like, sql } from "drizzle-orm";
import {
  db, facturenTable, factuurRegelsTable, leveranciersTable, gebouwenTable,
  grootboekrekeningenTable, accountviewInstellingenTable, werkgeversTable,
} from "@workspace/db";
import {
  setupE2eWebAdminAccount,
  E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET,
} from "./e2e-monteur-testaccount";

const BASIS = process.env.API_BASIS
  ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/api` : "http://localhost:8080/api");

let geslaagd = 0;
let gefaald = 0;
function check(naam: string, conditie: boolean, detail?: string) {
  if (conditie) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { gefaald++; console.error(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

type Sessie = { cookie: string };
async function login(): Promise<Sessie> {
  const r1 = await fetch(`${BASIS}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: E2E_WEB_ADMIN_EMAIL, wachtwoord: E2E_WEB_ADMIN_WACHTWOORD }),
  });
  const cookie = (r1.headers.get("set-cookie") ?? "").split(";")[0]!;
  const j1 = (await r1.json()) as { status?: string };
  if (j1.status === "verify_2fa" || j1.status === "setup_2fa") {
    const code = authenticator.generate(E2E_WEB_ADMIN_TOTP_SECRET);
    const r2 = await fetch(`${BASIS}/auth/2fa/verify`, {
      method: "POST", headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ code }),
    });
    if (!r2.ok) throw new Error(`2fa verify faalde: ${r2.status} ${await r2.text()}`);
    const c2 = r2.headers.get("set-cookie");
    return { cookie: c2 ? c2.split(";")[0]! : cookie };
  }
  if (!r1.ok) throw new Error(`login faalde: ${r1.status} ${JSON.stringify(j1)}`);
  return { cookie };
}

async function api(s: Sessie, methode: string, pad: string, body?: unknown) {
  const r = await fetch(`${BASIS}${pad}`, {
    method: methode,
    headers: { "Content-Type": "application/json", cookie: s.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try { json = await r.json(); } catch { /* leeg */ }
  return { status: r.status, json };
}

const MARKER = "BEWIJS-ADM01V";

async function schoonmaken() {
  await db.delete(factuurRegelsTable).where(like(factuurRegelsTable.omschrijving, `${MARKER}%`));
  await db.delete(facturenTable).where(like(facturenTable.omschrijving, `${MARKER}%`));
  await db.delete(leveranciersTable).where(like(leveranciersTable.naam, `${MARKER}%`));
  await db.delete(grootboekrekeningenTable).where(like(grootboekrekeningenTable.omschrijving, `${MARKER}%`));
  await db.delete(gebouwenTable).where(like(gebouwenTable.naam, `${MARKER}%`));
  const wgs = await db.select({ id: werkgeversTable.id }).from(werkgeversTable).where(like(werkgeversTable.naam, `${MARKER}%`));
  for (const wg of wgs) {
    await db.execute(sql`DELETE FROM werkbak_items WHERE bron = 'rekeningschema_open' AND dedup_sleutel = ${"rekeningschema-open:" + wg.id}`);
    await db.delete(werkgeversTable).where(eq(werkgeversTable.id, wg.id));
  }
}

async function werkbakStatus(wgId: number): Promise<{ titel: string; status: string } | undefined> {
  const res = await db.execute(sql`SELECT titel, status FROM werkbak_items WHERE bron='rekeningschema_open' AND dedup_sleutel = ${"rekeningschema-open:" + wgId}`);
  return ((res as unknown as { rows: Array<{ titel: string; status: string }> }).rows
    ?? (res as unknown as Array<{ titel: string; status: string }>))[0];
}

async function main() {
  await setupE2eWebAdminAccount();
  await schoonmaken();
  const s = await login();

  // Opzet: W = gekoppelde BV (leeg schema), K = niet-boekende BV.
  const [wgW] = await db.insert(werkgeversTable).values({ naam: `${MARKER} Boek BV` }).returning();
  const [wgK] = await db.insert(werkgeversTable).values({ naam: `${MARKER} Overige BV` }).returning();
  const [instVoor] = await db.select().from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
  const origineleWgId = instVoor?.werkgeverId ?? null;
  if (instVoor) {
    await db.update(accountviewInstellingenTable).set({ werkgeverId: wgW!.id }).where(eq(accountviewInstellingenTable.id, 1));
  } else {
    await db.insert(accountviewInstellingenTable).values({ id: 1, werkgeverId: wgW!.id } as typeof accountviewInstellingenTable.$inferInsert);
  }

  console.log("— 1. Actiepunt alleen voor de gekoppelde BV zonder schema —");
  // Voeder triggeren via een import voor K (raakt het schema van W niet).
  const imp0 = await api(s, "POST", "/grootboekrekeningen/import", {
    werkgever_id: wgK!.id,
    regels: `BEW-HULP;${MARKER} hulprekening;kosten`,
  });
  check("trigger-import geslaagd", imp0.status === 201, JSON.stringify(imp0.json));
  await new Promise((r) => setTimeout(r, 1500)); // voeder is fire-and-forget
  const itemW = await werkbakStatus(wgW!.id);
  check("actiepunt open voor gekoppelde BV zonder schema", itemW?.status === "open", JSON.stringify(itemW));
  check("titel noemt BV en 'ongecontroleerd'", (itemW?.titel ?? "").includes(`${MARKER} Boek BV`) && (itemW?.titel ?? "").includes("ongecontroleerd"));
  // K heeft inmiddels een schema, maar ook een lege niet-gekoppelde BV mag
  // nooit een item krijgen — dat toetsen we via een derde, lege BV.
  const [wgL] = await db.insert(werkgeversTable).values({ naam: `${MARKER} Lege BV` }).returning();
  await api(s, "POST", "/grootboekrekeningen/import", { werkgever_id: wgK!.id, regels: `BEW-HULP2;${MARKER} hulprekening 2;kosten` });
  await new Promise((r) => setTimeout(r, 1500));
  check("géén actiepunt voor lege niet-boekende BV", (await werkbakStatus(wgL!.id)) === undefined);

  console.log("— 2. Poortstatus per werkmaatschappij —");
  const ps1 = await api(s, "GET", "/grootboekrekeningen/poortstatus");
  const lijst1 = ps1.json as Array<{ werkgever_id: number; poort_actief: boolean; aantal_actief: number; gekoppeld_aan_boekhouding: boolean }>;
  const rijW = lijst1.find((p) => p.werkgever_id === wgW!.id);
  const rijK = lijst1.find((p) => p.werkgever_id === wgK!.id);
  check("poortstatus 200 met beide BV's", ps1.status === 200 && rijW != null && rijK != null);
  check("gekoppelde BV: poort open (0 rekeningen)", rijW?.poort_actief === false && rijW?.aantal_actief === 0 && rijW?.gekoppeld_aan_boekhouding === true);
  check("overige BV: niet gekoppeld aan de boekhouding", rijK?.gekoppeld_aan_boekhouding === false);

  console.log("— 3. Schema vullen → actiepunt sluit zichzelf —");
  const imp1 = await api(s, "POST", "/grootboekrekeningen/import", {
    werkgever_id: wgW!.id,
    regels: `4000;${MARKER} Inkoop;kosten\n8000;${MARKER} Omzet;opbrengsten`,
  });
  check("import voor gekoppelde BV geslaagd", imp1.status === 201);
  await new Promise((r) => setTimeout(r, 1500));
  check("actiepunt automatisch afgehandeld na vullen", (await werkbakStatus(wgW!.id))?.status === "afgehandeld");
  const ps2 = await api(s, "GET", "/grootboekrekeningen/poortstatus");
  const rijW2 = (ps2.json as typeof lijst1).find((p) => p.werkgever_id === wgW!.id);
  check("gekoppelde BV: poort nu actief (2 rekeningen)", rijW2?.poort_actief === true && rijW2?.aantal_actief === 2);

  console.log("— 4. Typefout omzetten: BV- en statusbewust —");
  const FOUT = "99BEW";
  // Gebouwen bepalen de BV van de testfacturen (legacy-keten in de resolver).
  const [gbW] = await db.insert(gebouwenTable).values({ naam: `${MARKER} pand W`, adres: "Teststraat 1", werkgeverId: wgW!.id } as typeof gebouwenTable.$inferInsert).returning();
  const [gbK] = await db.insert(gebouwenTable).values({ naam: `${MARKER} pand K`, adres: "Teststraat 2", werkgeverId: wgK!.id } as typeof gebouwenTable.$inferInsert).returning();
  const [fOk] = await db.insert(facturenTable).values({
    omschrijving: `${MARKER} factuur wijzigbaar`, relatienaam: `${MARKER} lev`, grootboekrekening: FOUT, gebouwId: gbW!.id,
  } as typeof facturenTable.$inferInsert).returning();
  await db.insert(factuurRegelsTable).values({
    factuurId: fOk!.id, regelnummer: 1, omschrijving: `${MARKER} regel`, grootboekrekening: FOUT,
  } as typeof factuurRegelsTable.$inferInsert);
  const [fGeboekt] = await db.insert(facturenTable).values({
    omschrijving: `${MARKER} factuur geboekt`, relatienaam: `${MARKER} lev`, grootboekrekening: FOUT, gebouwId: gbW!.id,
    status: "verwerkt", accountviewStatus: "success",
  } as typeof facturenTable.$inferInsert).returning();
  const [rGeboekt] = await db.insert(factuurRegelsTable).values({
    factuurId: fGeboekt!.id, regelnummer: 1, omschrijving: `${MARKER} regel geboekt`, grootboekrekening: FOUT,
  } as typeof factuurRegelsTable.$inferInsert).returning();
  const [fAndere] = await db.insert(facturenTable).values({
    omschrijving: `${MARKER} factuur andere BV`, relatienaam: `${MARKER} lev`, grootboekrekening: FOUT, gebouwId: gbK!.id,
  } as typeof facturenTable.$inferInsert).returning();
  await db.insert(leveranciersTable).values({
    naam: `${MARKER} leverancier`, grootboekrekening: FOUT,
  } as typeof leveranciersTable.$inferInsert);

  const om422 = await api(s, "POST", "/grootboekrekeningen/omzetten", { van: FOUT, naar: "BESTAAT-NIET-999" });
  check("omzetten naar niet-schema-rekening = 422", om422.status === 422);
  const omGelijk = await api(s, "POST", "/grootboekrekeningen/omzetten", { van: FOUT, naar: FOUT });
  check("van==naar = 400", omGelijk.status === 400);
  const om = await api(s, "POST", "/grootboekrekeningen/omzetten", { van: FOUT, naar: "4000" });
  const omJ = om.json as { totaal: number; facturen: number; factuurregels: number; leveranciers: number; overgeslagen_geboekt: number; overgeslagen_andere_bv: number };
  check("omzetten 200", om.status === 200, JSON.stringify(om.json));
  check("alleen wijzigbare factuur van eigen BV omgezet (kop+regel+leverancier)", omJ?.facturen === 1 && omJ?.factuurregels === 1 && omJ?.leveranciers === 1, JSON.stringify(omJ));
  check("geboekte factuur overgeslagen en geteld", omJ?.overgeslagen_geboekt === 1, JSON.stringify(omJ));
  check("factuur van andere BV overgeslagen en geteld", omJ?.overgeslagen_andere_bv === 1, JSON.stringify(omJ));
  const [fOkNa] = await db.select({ g: facturenTable.grootboekrekening }).from(facturenTable).where(eq(facturenTable.id, fOk!.id));
  const [fGeboektNa] = await db.select({ g: facturenTable.grootboekrekening }).from(facturenTable).where(eq(facturenTable.id, fGeboekt!.id));
  const [fAndereNa] = await db.select({ g: facturenTable.grootboekrekening }).from(facturenTable).where(eq(facturenTable.id, fAndere!.id));
  check("wijzigbare kop draagt schema-rekening; geboekt en andere BV onaangeroerd",
    fOkNa?.g === "4000" && fGeboektNa?.g === FOUT && fAndereNa?.g === FOUT,
    JSON.stringify({ fOkNa, fGeboektNa, fAndereNa }));

  console.log("— 5. Regelmutatie op geboekte factuur = 409 —");
  const patch409 = await api(s, "PATCH", `/facturen/${fGeboekt!.id}/regels/${rGeboekt!.id}`, { omschrijving: `${MARKER} regel geboekt`, grootboekrekening: "4000" });
  check("PATCH regel op geboekte factuur = 409", patch409.status === 409, JSON.stringify(patch409.json));
  const del409 = await api(s, "DELETE", `/facturen/${fGeboekt!.id}/regels/${rGeboekt!.id}`);
  check("DELETE regel op geboekte factuur = 409", del409.status === 409);
  const patchOk = await api(s, "PATCH", `/facturen/${fOk!.id}/regels/${(await db.select({ id: factuurRegelsTable.id }).from(factuurRegelsTable).where(eq(factuurRegelsTable.factuurId, fOk!.id)))[0]!.id}`, { omschrijving: `${MARKER} regel`, grootboekrekening: "8000" });
  check("PATCH regel op wijzigbare factuur = 200", patchOk.status === 200, JSON.stringify(patchOk.json));

  console.log("— 6. Race: export boekt de factuur tijdens het omzetten —");
  // TOCTOU-scenario uit de architect-review: de omzet-route selecteert
  // kandidaten vóór de transactie; een gelijktijdige export mag er niet
  // tussendoor glippen. We houden de factuurrij vergrendeld in een eigen
  // transactie die 'm op success zet, en vuren het omzet-verzoek terwijl die
  // nog open staat — de route moet op FOR UPDATE wachten en 'm dan overslaan.
  const FOUT2 = "98BEW";
  const [fRace] = await db.insert(facturenTable).values({
    omschrijving: `${MARKER} factuur race`, relatienaam: `${MARKER} lev`, grootboekrekening: FOUT2, gebouwId: gbW!.id,
  } as typeof facturenTable.$inferInsert).returning();
  const exportTx = db.transaction(async (tx) => {
    await tx.update(facturenTable)
      .set({ status: "verwerkt", accountviewStatus: "success" })
      .where(eq(facturenTable.id, fRace!.id));
    await new Promise((r) => setTimeout(r, 2500)); // houd de rij vergrendeld
  });
  await new Promise((r) => setTimeout(r, 300)); // laat de "export" eerst de rij pakken
  const [omRace] = await Promise.all([
    api(s, "POST", "/grootboekrekeningen/omzetten", { van: FOUT2, naar: "4000" }),
    exportTx,
  ]);
  const omRaceJ = omRace.json as { facturen: number; overgeslagen_geboekt: number };
  check("omzetten tijdens export: 200", omRace.status === 200, JSON.stringify(omRace.json));
  check("net-geboekte factuur in de tx overgeslagen", omRaceJ?.facturen === 0 && omRaceJ?.overgeslagen_geboekt >= 1, JSON.stringify(omRaceJ));
  const [fRaceNa] = await db.select({ g: facturenTable.grootboekrekening }).from(facturenTable).where(eq(facturenTable.id, fRace!.id));
  check("kop van de geraceade factuur onaangeroerd", fRaceNa?.g === FOUT2, JSON.stringify(fRaceNa));

  console.log("— 7. Lopende exportclaim ('verzenden') blokkeert mutaties —");
  // Productieflow: claimAccountviewVerzending commit accountview_status =
  // 'verzenden' en de externe call loopt daarna búiten de transactie. Met die
  // status gecommit mogen omzetten én regel-CRUD niets wijzigen.
  const FOUT3 = "97BEW";
  const [fClaim] = await db.insert(facturenTable).values({
    omschrijving: `${MARKER} factuur claim`, relatienaam: `${MARKER} lev`, grootboekrekening: FOUT3, gebouwId: gbW!.id,
    accountviewStatus: "verzenden",
  } as typeof facturenTable.$inferInsert).returning();
  const [rClaim] = await db.insert(factuurRegelsTable).values({
    factuurId: fClaim!.id, regelnummer: 1, omschrijving: `${MARKER} regel claim`, grootboekrekening: FOUT3,
  } as typeof factuurRegelsTable.$inferInsert).returning();
  const omClaim = await api(s, "POST", "/grootboekrekeningen/omzetten", { van: FOUT3, naar: "4000" });
  const omClaimJ = omClaim.json as { facturen: number; factuurregels: number; overgeslagen_geboekt: number };
  check("omzetten bij lopende claim: factuur overgeslagen", omClaim.status === 200 && omClaimJ?.facturen === 0 && omClaimJ?.factuurregels === 0 && omClaimJ?.overgeslagen_geboekt >= 1, JSON.stringify(omClaimJ));
  const patchClaim = await api(s, "PATCH", `/facturen/${fClaim!.id}/regels/${rClaim!.id}`, { omschrijving: `${MARKER} regel claim`, grootboekrekening: "4000" });
  check("regel-PATCH bij lopende claim = 409", patchClaim.status === 409);
  const [fClaimNa] = await db.select({ g: facturenTable.grootboekrekening }).from(facturenTable).where(eq(facturenTable.id, fClaim!.id));
  const [rClaimNa] = await db.select({ g: factuurRegelsTable.grootboekrekening }).from(factuurRegelsTable).where(eq(factuurRegelsTable.id, rClaim!.id));
  check("kop en regel onaangeroerd bij lopende claim", fClaimNa?.g === FOUT3 && rClaimNa?.g === FOUT3);

  console.log("— 8. Schoonmaak —");
  if (instVoor) {
    await db.update(accountviewInstellingenTable).set({ werkgeverId: origineleWgId }).where(eq(accountviewInstellingenTable.id, 1));
  } else {
    await db.delete(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1));
  }
  await schoonmaken();
  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  process.exit(gefaald === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });

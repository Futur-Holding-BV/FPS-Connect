// MERK_01 — bewijsscript. Test via HTTP (nooit api-server-source importeren)
// + @workspace/db voor opzet/controle. Draaien:
//   pnpm --filter @workspace/scripts run tsx src/verificatie-merk01.ts
//
// Bewijst conform de spec:
//  1. Merkenkast en beeldbank zijn afgeschermd: zonder sessie 401, zonder
//     crm-niveau 3 een 403 (bekijken/zoeken/downloaden = crm 3).
//  2. Merkenkast leest uit de werkgever-huisstijl (één bron): velden die via
//     PATCH /werkgevers worden gezet (logo-varianten, merkkleuren, lettertype,
//     omschrijvingen) verschijnen in GET /merkenkast, met downloadbare URLs.
//  3. Het merkpakket (zip) is per werkmaatschappij te downloaden en benoemt
//     ontbrekende bestanden expliciet (nooit stil).
//  4. De beeldbank aggregeert alle vier bronnen (spot/opname/inspectie/upload)
//     met gebouw, werksoort, fase, wanneer en wie; filters en zoeken werken.
//  5. Opdracht is alleen gevuld bij handmatige uploads (gemelde scope-afwijking).
//  6. Gebouw-ACL: een beperkte veldgebruiker ziet alleen foto's van zijn
//     toegewezen gebouwen — ook in de bulk-download (fail-closed, met melding).
import { authenticator } from "otplib";
import bcrypt from "bcryptjs";
import { eq, like, inArray } from "drizzle-orm";
import {
  db, werkgeversTable, gebouwenTable, voorzieningenTable, fotosTable,
  opnamesTable, opnameItemsTable, opnameFotosTable,
  inspectiesTable, inspectieBevindingen, beeldbankUploadsTable,
  gebruikersTable, gebouwToewijzingenTable,
} from "@workspace/db";
import {
  setupE2eWebAdminAccount,
  E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET,
} from "./e2e-monteur-testaccount";

const BASIS = process.env.API_BASIS
  ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/api` : "http://localhost:8080/api");

const MARKER = "[MERK01-BEWIJS]";
const BEPERKT_EMAIL = "e2e-merk01-beperkt@fps.local";
const BEPERKT_WACHTWOORD = "E2eMerk01Beperkt!2026";
const BEPERKT_TOTP = "GVSXG2LSNZKW4MRK";
const GEENCRM_EMAIL = "e2e-merk01-geencrm@fps.local";
const GEENCRM_WACHTWOORD = "E2eMerk01GeenCrm!2026";
const GEENCRM_TOTP = "MZXW6YTBOJUW6MRK";

import { inflateRawSync } from "node:zlib";

// Pakt alle entries van een (kleine) zip-buffer uit naar één doorzoekbare tekst.
function zipInhoudAlsTekst(buf: Buffer): string {
  const delen: string[] = [];
  // Central directory parsen: die bevat óók bij gestreamde zips (data
  // descriptors, zoals archiver schrijft) de juiste groottes en offsets.
  for (let i = 0; i + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(i) !== 0x02014b50) continue;
    const methode = buf.readUInt16LE(i + 10);
    const compGrootte = buf.readUInt32LE(i + 20);
    const naamLen = buf.readUInt16LE(i + 28);
    const extraLen = buf.readUInt16LE(i + 30);
    const commentLen = buf.readUInt16LE(i + 32);
    const lokaalOffset = buf.readUInt32LE(i + 42);
    const naam = buf.subarray(i + 46, i + 46 + naamLen).toString("utf8");
    delen.push(naam);
    if (buf.readUInt32LE(lokaalOffset) === 0x04034b50) {
      const lNaamLen = buf.readUInt16LE(lokaalOffset + 26);
      const lExtraLen = buf.readUInt16LE(lokaalOffset + 28);
      const dataStart = lokaalOffset + 30 + lNaamLen + lExtraLen;
      const data = buf.subarray(dataStart, dataStart + compGrootte);
      try {
        delen.push(methode === 8 ? inflateRawSync(data).toString("utf8") : data.toString("utf8"));
      } catch { /* onleesbare entry: alleen naam */ }
    }
    i += 45 + naamLen + extraLen + commentLen; // -1 want for-lus doet i++
  }
  // Fallback voor gestreamde zips (data descriptors): ruwe tekst meenemen.
  delen.push(buf.toString("latin1"));
  return delen.join("\n");
}

let geslaagd = 0;
let gefaald = 0;
function check(naam: string, conditie: boolean, detail?: string) {
  if (conditie) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { gefaald++; console.error(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

type Sessie = { cookie: string };
async function login(email: string, wachtwoord: string, totpSecret: string): Promise<Sessie> {
  const r1 = await fetch(`${BASIS}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord }),
  });
  const cookie = (r1.headers.get("set-cookie") ?? "").split(";")[0]!;
  const j1 = (await r1.json()) as { status?: string };
  if (j1.status === "verify_2fa" || j1.status === "setup_2fa") {
    const code = authenticator.generate(totpSecret);
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

async function api(s: Sessie | null, methode: string, pad: string, body?: unknown) {
  const r = await fetch(`${BASIS}${pad}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(s ? { cookie: s.cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try { json = await r.json(); } catch { /* leeg of binair */ }
  return { status: r.status, json, headers: r.headers };
}

async function maakTestGebruiker(opties: {
  email: string; naam: string; wachtwoord: string; totp: string;
  bevoegdheden: Record<string, number>;
}): Promise<number> {
  const hash = await bcrypt.hash(opties.wachtwoord, 10);
  const [bestaand] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable)
    .where(eq(gebruikersTable.email, opties.email));
  const waarden = {
    naam: opties.naam, rol: "gebruiker" as const, wachtwoord: hash,
    totpSecret: opties.totp, tweeFactorIngeschakeld: true, actief: true,
    gearchiveerd: false, bevoegdheden: opties.bevoegdheden, initialen: "E2E",
  };
  if (bestaand) {
    await db.update(gebruikersTable).set(waarden).where(eq(gebruikersTable.id, bestaand.id));
    return bestaand.id;
  }
  const [nieuw] = await db.insert(gebruikersTable)
    .values({ email: opties.email, ...waarden }).returning({ id: gebruikersTable.id });
  return nieuw.id;
}

async function opruimen() {
  const testGebouwen = await db.select({ id: gebouwenTable.id }).from(gebouwenTable)
    .where(like(gebouwenTable.naam, `${MARKER}%`));
  const gebouwIds = testGebouwen.map((g) => g.id);
  await db.delete(beeldbankUploadsTable).where(like(beeldbankUploadsTable.objectPath, "%merk01-bewijs%"));
  if (gebouwIds.length) {
    const inspecties = await db.select({ id: inspectiesTable.id }).from(inspectiesTable)
      .where(inArray(inspectiesTable.gebouwId, gebouwIds));
    if (inspecties.length) {
      await db.delete(inspectieBevindingen).where(inArray(inspectieBevindingen.inspectieId, inspecties.map((i) => i.id)));
      await db.delete(inspectiesTable).where(inArray(inspectiesTable.id, inspecties.map((i) => i.id)));
    }
    const opnames = await db.select({ id: opnamesTable.id }).from(opnamesTable)
      .where(inArray(opnamesTable.gebouwId, gebouwIds));
    if (opnames.length) {
      // opname_items/opname_fotos cascaden mee
      await db.delete(opnamesTable).where(inArray(opnamesTable.id, opnames.map((o) => o.id)));
    }
    // voorzieningen + fotos cascaden mee met gebouw-delete
    await db.delete(gebouwToewijzingenTable).where(inArray(gebouwToewijzingenTable.gebouwId, gebouwIds));
    await db.delete(gebouwenTable).where(inArray(gebouwenTable.id, gebouwIds));
  }
}

async function hoofd() {
  console.log(`MERK_01 bewijsscript — API: ${BASIS}\n`);
  await opruimen();

  const adminId = await setupE2eWebAdminAccount();
  void adminId;
  const admin = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);

  // ── 1. Afscherming ────────────────────────────────────────────────────────
  console.log("1. Afscherming (401 zonder sessie, 403 zonder crm 3)");
  for (const pad of ["/merkenkast", "/beeldbank/fotos"]) {
    const r = await api(null, "GET", pad);
    check(`GET ${pad} zonder sessie → 401`, r.status === 401, `kreeg ${r.status}`);
  }
  await maakTestGebruiker({
    email: GEENCRM_EMAIL, naam: `${MARKER} zonder crm`, wachtwoord: GEENCRM_WACHTWOORD,
    totp: GEENCRM_TOTP, bevoegdheden: { gebouwen: 1 },
  });
  const geenCrm = await login(GEENCRM_EMAIL, GEENCRM_WACHTWOORD, GEENCRM_TOTP);
  for (const pad of ["/merkenkast", "/beeldbank/fotos"]) {
    const r = await api(geenCrm, "GET", pad);
    check(`GET ${pad} zonder crm-recht → 403`, r.status === 403, `kreeg ${r.status}`);
  }

  // ── 2. Merkenkast = werkgever-huisstijl (één bron) ───────────────────────
  console.log("\n2. Merkenkast leest uit de werkgever-huisstijl");
  const werkgeversResp = await api(admin, "GET", "/werkgevers");
  const werkgevers = werkgeversResp.json as Array<{ id: number; naam: string; actief: boolean }>;
  const doelwg = werkgevers.find((w) => w.actief);
  if (!doelwg) throw new Error("Geen actieve werkgever in dev-DB");
  const patch = await api(admin, "PATCH", `/werkgevers/${doelwg.id}`, {
    naam: doelwg.naam,
    logo_varianten: { wit: "/objects/uploads/merk01-bewijs-wit.png" },
    merk_kleuren: [{ naam: `${MARKER} Donker`, hex: "#212631" }],
    lettertype: `${MARKER} Inter`,
    omschrijving_kort: `${MARKER} korte omschrijving`,
    omschrijving_lang: `${MARKER} lange omschrijving`,
  });
  check("PATCH /werkgevers accepteert merkenkast-velden", patch.status === 200, `kreeg ${patch.status}`);

  const kast = await api(admin, "GET", "/merkenkast");
  check("GET /merkenkast → 200", kast.status === 200, `kreeg ${kast.status}`);
  const merken = (kast.json ?? []) as Array<{
    werkgever_id: number; naam: string; primaire_kleur: string;
    logo_varianten: Record<string, string>;
    merk_kleuren: Array<{ naam: string; hex: string }>;
    lettertype: string | null; omschrijving_kort: string | null; omschrijving_lang: string | null;
    kvk: string | null;
  }>;
  const merk = merken.find((m) => m.werkgever_id === doelwg.id);
  check("werkmaatschappij aanwezig in merkenkast", !!merk);
  if (merk) {
    check("logo-variant 'wit' met downloadbare URL",
      typeof merk.logo_varianten.wit === "string" && merk.logo_varianten.wit.startsWith("/api/storage/objects/"),
      merk.logo_varianten.wit);
    check("merkkleur uit PATCH zichtbaar", merk.merk_kleuren.some((k) => k.hex === "#212631"));
    check("primaire kleur aanwezig (hex)", /^#[0-9a-fA-F]{6}$/.test(merk.primaire_kleur), merk.primaire_kleur);
    check("lettertype doorgegeven", merk.lettertype === `${MARKER} Inter`);
    check("korte + lange omschrijving doorgegeven",
      merk.omschrijving_kort === `${MARKER} korte omschrijving` && merk.omschrijving_lang === `${MARKER} lange omschrijving`);
  }

  // ── 3. Merkpakket-zip ─────────────────────────────────────────────────────
  console.log("\n3. Merkpakket (zip) per werkmaatschappij");
  const zipResp = await fetch(`${BASIS}/merkenkast/${doelwg.id}/pakket`, { headers: { cookie: admin.cookie } });
  check("pakket → 200 + application/zip", zipResp.status === 200 && (zipResp.headers.get("content-type") ?? "").includes("zip"),
    `${zipResp.status} ${zipResp.headers.get("content-type")}`);
  const zipBuf = Buffer.from(await zipResp.arrayBuffer());
  check("zip heeft PK-signatuur en inhoud", zipBuf.length > 100 && zipBuf[0] === 0x50 && zipBuf[1] === 0x4b, `${zipBuf.length} bytes`);
  const zipTekst = zipInhoudAlsTekst(zipBuf);
  check("zip bevat merkgegevens", zipTekst.includes("merkgegevens"));
  check("ontbrekend logobestand wordt benoemd (nooit stil)", zipTekst.includes("NIET AANGETROFFEN") || zipTekst.includes("ontbrekend"));

  // ── 4. Beeldbank-aggregatie (seed 4 bronnen) ─────────────────────────────
  console.log("\n4. Beeldbank aggregeert spot/opname/inspectie/upload");
  const [gebouwA] = await db.insert(gebouwenTable)
    .values({ naam: `${MARKER} Gebouw A`, adres: "Teststraat 1" }).returning();
  const [gebouwB] = await db.insert(gebouwenTable)
    .values({ naam: `${MARKER} Gebouw B`, adres: "Teststraat 2" }).returning();
  const [spot] = await db.insert(voorzieningenTable).values({
    objectnummer: `${MARKER}-SPOT-${Date.now()}`, type: "doorvoering", gebouwId: gebouwA.id,
  }).returning();
  await db.insert(fotosTable).values({
    voorzieningId: spot.id, fase: "uitvoering", url: "/objects/uploads/merk01-bewijs-spot.jpg",
    beschrijving: `${MARKER} spotfoto`,
  });
  const [opname] = await db.insert(opnamesTable).values({
    gebouwId: gebouwB.id, naam: `${MARKER} Opname`, datum: "2026-08-17",
  }).returning();
  const [opnameItem] = await db.insert(opnameItemsTable).values({
    opnameId: opname.id, spotType: "branddeur",
  }).returning();
  await db.insert(opnameFotosTable).values({
    itemId: opnameItem.id, objectPath: "/objects/uploads/merk01-bewijs-opname.jpg", bijschrift: `${MARKER} opnamefoto`,
  });
  const [inspectie] = await db.insert(inspectiesTable).values({
    gebouwId: gebouwA.id, type: "periodiek",
  }).returning();
  await db.insert(inspectieBevindingen).values({
    inspectieId: inspectie.id, omschrijving: `${MARKER} bevinding`,
    fotoUrls: JSON.stringify(["/objects/uploads/merk01-bewijs-insp-0.jpg", "/objects/uploads/merk01-bewijs-insp-1.jpg"]),
  });
  const upload = await api(admin, "POST", "/beeldbank/fotos", {
    object_path: "/objects/uploads/merk01-bewijs-upload.jpg",
    bijschrift: `${MARKER} upload`, gebouw_id: gebouwA.id, werksoort: "branddeuren",
  });
  check("handmatige upload registreren → 201", upload.status === 201, `kreeg ${upload.status}`);
  const ongeldigeUpload = await api(admin, "POST", "/beeldbank/fotos", { object_path: "geen-pad" });
  check("upload zonder intern pad → 400", ongeldigeUpload.status === 400, `kreeg ${ongeldigeUpload.status}`);

  type Foto = {
    bron: string; bron_id: number; volgnummer: number; url: string;
    gebouw_id: number | null; gebouw_naam: string | null; werksoort: string | null;
    fase: string | null; gemaakt_op: string | null; gemaakt_door: string | null;
    opdracht_id: number | null; bijschrift: string | null;
  };
  const haal = async (s: Sessie, query = "") => {
    const r = await api(s, "GET", `/beeldbank/fotos${query}`);
    return { status: r.status, ...(r.json as { totaal: number; fotos: Foto[] }) };
  };
  const alles = await haal(admin, `?zoek=${encodeURIComponent(MARKER)}&limit=200`);
  const bronnen = new Set(alles.fotos?.map((f) => f.bron));
  check("alle 4 bronnen aanwezig (spot/opname/inspectie/upload)",
    ["spot", "opname", "inspectie", "upload"].every((b) => bronnen.has(b)), [...bronnen].join(","));
  check("inspectiefoto's per index (2 stuks, volgnummer 0 en 1)",
    alles.fotos?.filter((f) => f.bron === "inspectie").length === 2);
  const spotFoto = alles.fotos?.find((f) => f.bron === "spot");
  check("spotfoto draagt gebouw + fase + werksoort + wanneer",
    !!spotFoto && spotFoto.gebouw_naam === `${MARKER} Gebouw A` && spotFoto.fase === "uitvoering"
    && spotFoto.werksoort === "doorvoering" && !!spotFoto.gemaakt_op);
  check("automatische bron heeft géén gegokte opdracht (null)",
    !!spotFoto && spotFoto.opdracht_id === null);
  check("per-stuk download-URL via storage-route",
    !!spotFoto && spotFoto.url.startsWith("/api/storage/objects/"));
  // De URL moet door een echt bestaande route worden afgehandeld (bestand
  // bestaat niet in opslag → nette 404-JSON, géén "Cannot GET").
  const deref = await fetch(`${BASIS.replace(/\/api$/, "")}${spotFoto!.url}`, { headers: { cookie: admin.cookie } });
  const derefTekst = await deref.text();
  check("download-URL wordt door de storage-route afgehandeld",
    deref.status === 404 && !derefTekst.includes("Cannot GET"), `${deref.status} ${derefTekst.slice(0, 60)}`);

  const alleenSpot = await haal(admin, `?zoek=${encodeURIComponent(MARKER)}&bron=spot&limit=200`);
  check("filter bron=spot", alleenSpot.fotos?.every((f) => f.bron === "spot") && alleenSpot.totaal === 1, `totaal=${alleenSpot.totaal}`);
  const alleenA = await haal(admin, `?zoek=${encodeURIComponent(MARKER)}&gebouw_id=${gebouwA.id}&limit=200`);
  check("filter gebouw_id", alleenA.fotos?.every((f) => f.gebouw_id === gebouwA.id) && (alleenA.totaal ?? 0) >= 3, `totaal=${alleenA.totaal}`);
  const zoekWerksoort = await haal(admin, `?zoek=${encodeURIComponent(MARKER)}&werksoort=branddeur&limit=200`);
  check("filter werksoort (branddeur*)", (zoekWerksoort.totaal ?? 0) >= 2 && zoekWerksoort.fotos.every((f) => (f.werksoort ?? "").includes("branddeur")), `totaal=${zoekWerksoort.totaal}`);

  // ── 5. Gebouw-ACL voor beperkte veldgebruiker ────────────────────────────
  console.log("\n5. Gebouw-ACL (beperkte veldgebruiker ziet alleen eigen gebouwen)");
  const beperktId = await maakTestGebruiker({
    email: BEPERKT_EMAIL, naam: `${MARKER} beperkt`, wachtwoord: BEPERKT_WACHTWOORD, totp: BEPERKT_TOTP,
    // gebouwen 1 + veld-uitvoeringsrecht (voorzieningen 2) ⇒ beperkt tot toewijzingen; crm 3 voor de beeldbank.
    bevoegdheden: { crm: 3, gebouwen: 1, voorzieningen: 2 },
  });
  await db.delete(gebouwToewijzingenTable).where(eq(gebouwToewijzingenTable.gebruikerId, beperktId));
  await db.insert(gebouwToewijzingenTable).values({ gebruikerId: beperktId, gebouwId: gebouwA.id });
  const beperkt = await login(BEPERKT_EMAIL, BEPERKT_WACHTWOORD, BEPERKT_TOTP);
  const uploadZonderGebouw = await api(beperkt, "POST", "/beeldbank/fotos", { object_path: "/objects/uploads/merk01-bewijs-acl.jpg" });
  check("beperkte gebruiker: upload zonder gebouw → 403", uploadZonderGebouw.status === 403, `kreeg ${uploadZonderGebouw.status}`);
  const uploadVreemdGebouw = await api(beperkt, "POST", "/beeldbank/fotos", { object_path: "/objects/uploads/merk01-bewijs-acl.jpg", gebouw_id: gebouwB.id });
  check("beperkte gebruiker: upload bij niet-toegewezen gebouw → 403", uploadVreemdGebouw.status === 403, `kreeg ${uploadVreemdGebouw.status}`);
  const uploadEigenGebouw = await api(beperkt, "POST", "/beeldbank/fotos", { object_path: "/objects/uploads/merk01-bewijs-acl.jpg", gebouw_id: gebouwA.id });
  check("beperkte gebruiker: upload bij eigen gebouw → 201", uploadEigenGebouw.status === 201, `kreeg ${uploadEigenGebouw.status}`);
  const uploadOnbekendGebouw = await api(admin, "POST", "/beeldbank/fotos", { object_path: "/objects/uploads/merk01-bewijs-acl2.jpg", gebouw_id: 99999999 });
  check("upload met onbekend gebouw → 400", uploadOnbekendGebouw.status === 400, `kreeg ${uploadOnbekendGebouw.status}`);
  const beperktLijst = await haal(beperkt, `?zoek=${encodeURIComponent(MARKER)}&limit=200`);
  check("beperkte gebruiker ziet gebouw A-foto's", beperktLijst.fotos?.some((f) => f.gebouw_id === gebouwA.id));
  check("beperkte gebruiker ziet gebouw B (opname) NIET", !beperktLijst.fotos?.some((f) => f.gebouw_id === gebouwB.id));
  check("upload zonder gebouw blijft algemeen zichtbaar of afwezig — geen B-lek",
    beperktLijst.fotos?.every((f) => f.gebouw_id === gebouwA.id || f.gebouw_id === null));

  // ── 6. Bulk-download: ACL opnieuw afgedwongen + nooit stil ───────────────
  console.log("\n6. Bulk-download (zip) met ACL en melding");
  const opnameFoto = alles.fotos.find((f) => f.bron === "opname")!;
  const bulk = await fetch(`${BASIS}/beeldbank/download`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: beperkt.cookie },
    body: JSON.stringify({ items: [
      { bron: spotFoto!.bron, bron_id: spotFoto!.bron_id, volgnummer: 0 },
      { bron: opnameFoto.bron, bron_id: opnameFoto.bron_id, volgnummer: 0 }, // buiten toegang
    ] }),
  });
  check("bulk-zip voor beperkte gebruiker → 200", bulk.status === 200, `kreeg ${bulk.status}`);
  const bulkBuf = Buffer.from(await bulk.arrayBuffer());
  const bulkTekst = zipInhoudAlsTekst(bulkBuf);
  check("zip meldt overgeslagen foto's (buiten toegang/ontbrekend)", bulkTekst.includes("OVERGESLAGEN"), `${bulkBuf.length} bytes`);
  const bulkLeeg = await api(beperkt, "POST", "/beeldbank/download", { items: [{ bron: "opname", bron_id: opnameFoto.bron_id, volgnummer: 0 }] });
  check("alleen buiten-toegang items → 404 (fail-closed)", bulkLeeg.status === 404, `kreeg ${bulkLeeg.status}`);

  // ── Opruimen ──────────────────────────────────────────────────────────────
  await api(admin, "PATCH", `/werkgevers/${doelwg.id}`, {
    naam: doelwg.naam, logo_varianten: {}, merk_kleuren: [],
    lettertype: null, omschrijving_kort: null, omschrijving_lang: null,
  });
  await opruimen();

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  if (gefaald > 0) process.exit(1);
  process.exit(0);
}

hoofd().catch((err) => { console.error(err); process.exit(1); });

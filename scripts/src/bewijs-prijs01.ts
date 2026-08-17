// PRIJS_01 §11 — bewijs: jaarprijzen, factuurcontrole en de marktspiegel.
//
// Bewijst end-to-end (§11.1 t/m §11.11) dat:
//  - Slim Upload een prijslijst-XLSX herkent en leverancier/periode/kolommen
//    voorstelt, met proef van ≤20 regels en niet-plaatsbare regels gemeld;
//  - de vergelijking met de vorige afspraak (duurder/goedkoper + top-verschillen)
//    getoond wordt;
//  - overlappende perioden geweigerd worden (409) en niets stil oplossen;
//  - de import → prijsafspraken (bron=import+importId) gaat en terugdraaien de
//    regels markeert (teruggedraaid_op) i.p.v. verwijdert;
//  - een calculatie de afgesproken INKOOPprijs als herkomst toont maar het
//    tarief (verkoopprijs) ongewijzigd laat; een artikel zonder afspraak =catalogus;
//  - factuurcontrole boven de marge een prijsafwijking-goedkeuring oplevert
//    (idempotent), binnen de marge niets, en de factuurregel nooit wijzigt;
//  - het maandtotaal "meer betaald" telt;
//  - een aflopende afspraak via de bestaande bewakingsloop een werkbakitem voedt;
//  - de marktspiegel per vergelijking een vindplaats + datum draagt en nooit een
//    wisseladvies bevat.
//
// Dit script raakt GEEN api-server-bronbestanden aan: het praat uitsluitend via
// HTTP met de draaiende API en leest/schrijft via @workspace/db. Het pakket
// `xlsx` (voor de prijslijst) wordt via een absoluut pad uit de api-server-
// node_modules geladen — geen bronimport, alleen de generieke Excel-schrijver.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-prijs01.ts
import "./lib/prodGuard";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, like, inArray, isNull } from "drizzle-orm";
import { authenticator } from "otplib";
import {
  db,
  gebruikersTable,
  leveranciersTable,
  modCalcArtekelenTable,
  modCalcHeadersTable,
  prijsafsprakenTable,
  facturenTable,
  factuurRegelsTable,
  goedkeuringAanvragenTable,
  goedkeuringBeleidsregelsTable,
  marktspiegelOnderzoekenTable,
  importLogsTable,
  appInstellingenTable,
} from "@workspace/db";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
// Testgeheimen worden bij elke run vers gegenereerd — geen hard-coded constanten.
const TOTP = authenticator.generateSecret();
const WW = `${randomBytes(12).toString("base64url")}Aa1!`;
const EMAIL = "bewijs-prijs01@fps.local";

// Deployment-grendel: een bewijsscript raakt nooit productie aan.
if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

// ── Testmarkeringen voor doelgericht opruimen ────────────────────────────────
const LEV_NAAM = "PRIJS01 Testleverancier BV";
const ART_CODE = "KNF-W111-P01TEST";
const CALC_MERK = "PRIJS01-TESTCALCULATIE";
const BELEID_MERK = "PRIJS01-TEST prijsafwijking";
const ONBEKENDE_CODES = ["P01X-001", "P01X-002", "P01X-003", "P01X-004", "P01X-005"];

const fout: string[] = [];
const uitvoer: string[] = [];
function log(regel: string): void {
  console.log(regel);
  uitvoer.push(regel);
}
function check(ok: boolean, regel: string): void {
  const lijn = `${ok ? "✓" : "✗"} ${regel}`;
  console.log(lijn);
  uitvoer.push(lijn);
  if (!ok) {
    fout.push(regel);
    process.exitCode = 1;
  }
}

const VANDAAG = new Date().toISOString().slice(0, 10);
const MAAND = VANDAAG.slice(0, 7);
const JAAR = Number(VANDAAG.slice(0, 4));

// ── HTTP-helper ──────────────────────────────────────────────────────────────
async function api(
  method: string,
  pad: string,
  opties: { token?: string; json?: unknown; timeoutMs?: number } = {},
): Promise<{ status: number; body: any; tekst: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opties.timeoutMs ?? 30_000);
  try {
    const headers: Record<string, string> = {};
    if (opties.token) headers.Authorization = `Bearer ${opties.token}`;
    let body: string | undefined;
    if (opties.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opties.json);
    }
    const r = await fetch(`${BASIS}${pad}`, { method, headers, body, signal: ctrl.signal });
    const tekst = await r.text();
    let parsed: any = null;
    try { parsed = tekst ? JSON.parse(tekst) : null; } catch { parsed = null; }
    return { status: r.status, body: parsed, tekst };
  } finally {
    clearTimeout(timer);
  }
}

async function uploadBestand(
  pad: string,
  token: string,
  buffer: Buffer,
  bestandsnaam: string,
  mime: string,
  extraVelden: Record<string, string> = {},
  timeoutMs = 120_000,
): Promise<{ status: number; body: any; tekst: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const form = new FormData();
    form.append("bestand", new Blob([new Uint8Array(buffer)], { type: mime }), bestandsnaam);
    for (const [k, v] of Object.entries(extraVelden)) form.append(k, v);
    const r = await fetch(`${BASIS}${pad}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: ctrl.signal,
    });
    const tekst = await r.text();
    let parsed: any = null;
    try { parsed = tekst ? JSON.parse(tekst) : null; } catch { parsed = null; }
    return { status: r.status, body: parsed, tekst };
  } finally {
    clearTimeout(timer);
  }
}

// ── Opruimen (begin + eind) ─────────────────────────────────────────────────
async function ruimOp(): Promise<void> {
  // Leverancier(s) van de test opzoeken.
  const levs = await db.select({ id: leveranciersTable.id }).from(leveranciersTable).where(eq(leveranciersTable.naam, LEV_NAAM));
  const levIds = levs.map((l) => l.id);

  // Facturen van de testleverancier + hun regels.
  if (levIds.length > 0) {
    const facts = await db.select({ id: facturenTable.id }).from(facturenTable).where(inArray(facturenTable.leverancierId, levIds));
    const factIds = facts.map((f) => f.id);
    if (factIds.length > 0) {
      await db.delete(factuurRegelsTable).where(inArray(factuurRegelsTable.factuurId, factIds));
      // Goedkeuringsaanvragen die aan die facturen hangen.
      await db.delete(goedkeuringAanvragenTable).where(and(eq(goedkeuringAanvragenTable.objectType, "factuur_prijsafwijking"), inArray(goedkeuringAanvragenTable.objectId, factIds)));
      await db.delete(facturenTable).where(inArray(facturenTable.id, factIds));
    }
    // Marktspiegel-onderzoeken op prijsafspraken van deze leverancier — MOET
    // vóór het verwijderen van de afspraken (onderwerp_id = afspraak-id).
    const afs = await db.select({ id: prijsafsprakenTable.id }).from(prijsafsprakenTable).where(inArray(prijsafsprakenTable.leverancierId, levIds));
    const afsIds = afs.map((a) => a.id);
    if (afsIds.length > 0) {
      await db.delete(marktspiegelOnderzoekenTable).where(and(eq(marktspiegelOnderzoekenTable.onderwerpType, "prijsafspraak"), inArray(marktspiegelOnderzoekenTable.onderwerpId, afsIds)));
    }
    // Prijsafspraken (óók teruggedraaide → hard deleten, per opdracht).
    await db.delete(prijsafsprakenTable).where(inArray(prijsafsprakenTable.leverancierId, levIds));
  }

  // Testcalculatie.
  const calcs = await db.select({ id: modCalcHeadersTable.id }).from(modCalcHeadersTable).where(eq(modCalcHeadersTable.naam, CALC_MERK));
  const calcIds = calcs.map((c) => c.id);
  if (calcIds.length > 0) {
    await db.delete(modCalcHeadersTable).where(inArray(modCalcHeadersTable.id, calcIds));
  }

  // Importlogs van type prijsafspraken met onze testbestandsnaam.
  await db.delete(importLogsTable).where(like(importLogsTable.bestandsnaam, "prijs01-jaarprijslijst%"));

  // Testartikel.
  await db.delete(modCalcArtekelenTable).where(eq(modCalcArtekelenTable.artikelcode, ART_CODE));

  // Testbeleidsregel.
  await db.delete(goedkeuringBeleidsregelsTable).where(eq(goedkeuringBeleidsregelsTable.naam, BELEID_MERK));

  // Testleverancier.
  if (levIds.length > 0) {
    await db.delete(leveranciersTable).where(inArray(leveranciersTable.id, levIds));
  }

  // Testgebruiker.
  await db.delete(gebruikersTable).where(eq(gebruikersTable.email, EMAIL));
}

// ── Prijslijst-XLSX bouwen (via generieke xlsx-schrijver) ────────────────────
async function bouwPrijslijst(): Promise<Buffer> {
  // xlsx uit de api-server-node_modules — geen bronimport, alleen de Excel-writer.
  // @ts-expect-error — absoluut pad naar de generieke xlsx-writer (geen types nodig).
  const XLSX: any = await import("/home/runner/workspace/artifacts/api-server/node_modules/xlsx/xlsx.mjs");

  const kop = `Jaarprijslijst 2027 — ${LEV_NAAM}, geldig 01-01-2027 t/m 31-12-2027`;
  // Rij 1 = kolomkoppen; rij 2 = titel-dragende rij (de AI leest hier leverancier
  // + periode uit); daarna ~25 productrijen (KNF + onbekende + verdere fillers).
  const aoa: (string | number)[][] = [
    ["Artikelnr", "Omschrijving", "Eenheid", "Nettoprijs"],
    ["", kop, "", ""],
    [ART_CODE, "Knauf W111 metal-stud wandsysteem", "m2", 13.75],
  ];
  for (const code of ONBEKENDE_CODES) {
    aoa.push([code, `Onbekend artikel ${code}`, "st", 9.5]);
  }
  // Vul aan tot ~25 productrijen met nog meer (onbekende) artikelnummers.
  let n = aoa.length - 2; // reeds toegevoegde productrijen
  let teller = 100;
  while (n < 25) {
    const code = `P01F-${teller}`;
    aoa.push([code, `Filler artikel ${code}`, "st", 4.25 + (teller % 7)]);
    teller++;
    n++;
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "Prijslijst");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function main(): Promise<void> {
  await ruimOp();

  // ── Testgebruiker ─────────────────────────────────────────────────────────
  // Rol hoofdbeheerder: de bewakingsloop-draai (§11.9) vereist isHoofdbeheerder,
  // en import vereist het hoogste modulerecht. De ruime bevoegdheden staan er
  // conform de opdracht bij (calculaties 4 + financieel 2 + goedkeuring 2), ook
  // al maakt hoofdbeheerder ze functioneel overbodig. GEMELD in het rapport.
  await db.insert(gebruikersTable).values({
    naam: "Bewijs PRIJS_01",
    email: EMAIL,
    rol: "hoofdbeheerder",
    wachtwoord: await bcrypt.hash(WW, 10),
    totpSecret: TOTP,
    tweeFactorIngeschakeld: true,
    actief: true,
    functietitels: ["Inkoop"],
    bevoegdheden: { calculaties: 4, financieel: 2, goedkeuring: 2 },
  } as typeof gebruikersTable.$inferInsert);

  // ── Seed: leverancier + artikel ───────────────────────────────────────────
  const [lev] = await db.insert(leveranciersTable).values({ naam: LEV_NAAM, stad: "Testdorp" } as typeof leveranciersTable.$inferInsert).returning();
  const leverancierId = lev!.id;
  const [art] = await db.insert(modCalcArtekelenTable).values({
    artikelcode: ART_CODE,
    omschrijving: "Knauf W111 metal-stud wandsysteem (PRIJS01-test)",
    eenheid: "m2",
    inkoopprijs: 14,
    verkoopprijs: 18.5,
    categorie: "materiaal",
  } as typeof modCalcArtekelenTable.$inferInsert).returning();
  const artikelId = art!.id;
  log(`Seed: leverancier #${leverancierId} "${LEV_NAAM}", artikel #${artikelId} ${ART_CODE} (inkoop 14, verkoop 18.50).`);

  // appInstellingen-rij verzekeren (marge nodig voor factuurcontrole).
  const [inst] = await db.select().from(appInstellingenTable).orderBy(appInstellingenTable.id).limit(1);
  if (!inst) {
    await db.insert(appInstellingenTable).values({} as typeof appInstellingenTable.$inferInsert);
  }
  const [inst2] = await db.select({ marge: appInstellingenTable.prijsafwijkingMargePct }).from(appInstellingenTable).orderBy(appInstellingenTable.id).limit(1);
  const margePct = inst2?.marge ?? 2;
  log(`Marge uit app_instellingen: ${margePct}%.`);

  // Beleidsregel voor prijsafwijking verzekeren (goedkeuringsmotor eist er een).
  const [beleid] = await db.select({ id: goedkeuringBeleidsregelsTable.id }).from(goedkeuringBeleidsregelsTable).where(and(eq(goedkeuringBeleidsregelsTable.documentType, "prijsafwijking"), eq(goedkeuringBeleidsregelsTable.actief, true), isNull(goedkeuringBeleidsregelsTable.werkmaatschappijId))).limit(1);
  let beleidZelfGezaaid = false;
  if (!beleid) {
    await db.insert(goedkeuringBeleidsregelsTable).values({
      naam: BELEID_MERK,
      documentType: "prijsafwijking",
      werkmaatschappijId: null,
      goedkeurderModule: "financieel",
      goedkeurderMinNiveau: 4,
      aantalGoedkeuringenVereist: 1,
      vierOgenVerplicht: false,
      actief: true,
    } as typeof goedkeuringBeleidsregelsTable.$inferInsert);
    beleidZelfGezaaid = true;
    log("Geen bestaande prijsafwijking-beleidsregel gevonden → test-beleidsregel gezaaid (wordt opgeruimd).");
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = await api("POST", "/auth/mobile/login", { json: { email: EMAIL, wachtwoord: WW, code: authenticator.generate(TOTP) } });
  if (login.status !== 200) throw new Error(`login faalde: ${login.status} ${login.tekst}`);
  const token = login.body.token as string;

  // ═══ Check 1 (§11.1): prijslijst-XLSX → Slim-Upload voorstel ═══════════════
  log("\n[1] §11.1 — prijslijst-voorstel (echte AI)…");
  const xlsxBuf = await bouwPrijslijst();
  const bestandsnaam = "prijs01-jaarprijslijst-2027.xlsx";
  const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const voorstel = await uploadBestand("/import/prijslijst-voorstel", token, xlsxBuf, bestandsnaam, mime, {}, 180_000);
  if (voorstel.status !== 200) throw new Error(`prijslijst-voorstel ${voorstel.status}: ${voorstel.tekst.slice(0, 400)}`);
  const v = voorstel.body;
  check(v.bestandssoort === "excel", `1. bestandssoort='excel' → ${v.bestandssoort}`);
  check(v.leverancier_voorstel?.leverancier_id === leverancierId, `1. leverancier_voorstel matcht testleverancier (#${leverancierId}) → id=${v.leverancier_voorstel?.leverancier_id} naam=${JSON.stringify(v.leverancier_voorstel?.naam)}`);
  const pv = v.periode_voorstel ?? {};
  const periode2027 = String(pv.geldig_van ?? "").startsWith("2027") || String(pv.geldig_tot ?? "").startsWith("2027");
  check(periode2027, `1. periode_voorstel wijst naar 2027 → van=${pv.geldig_van} tot=${pv.geldig_tot}`);
  // Kolomkoppeling wijst de 4 kolommen goed toe (kolomkop → doelveld).
  const kk = (v.kolomkoppeling_voorstel ?? {}) as Record<string, string>;
  check(kk["Artikelnr"] === "artikelcode", `1. Artikelnr→artikelcode → ${kk["Artikelnr"]}`);
  check(kk["Omschrijving"] === "omschrijving", `1. Omschrijving→omschrijving → ${kk["Omschrijving"]}`);
  check(kk["Eenheid"] === "eenheid", `1. Eenheid→eenheid → ${kk["Eenheid"]}`);
  check(kk["Nettoprijs"] === "prijs", `1. Nettoprijs→prijs → ${kk["Nettoprijs"]}`);
  check(Array.isArray(v.proefregels) && v.proefregels.length <= 20 && v.proefregels.length > 0, `1. proefregels exact ≤20 (en >0) → ${v.proefregels?.length}`);

  // ── Upload het bestand nogmaals via /import/preview zodat we een bestand_id
  //    krijgen voor de importstroom (controleren/uitvoeren). Zelfde bestand. ──
  const preview = await uploadBestand("/import/preview", token, xlsxBuf, bestandsnaam, mime, { type: "prijsafspraken" });
  if (preview.status !== 200) throw new Error(`import/preview ${preview.status}: ${preview.tekst.slice(0, 400)}`);
  const bestandId = preview.body.bestand_id as string;

  // Kolomkoppeling voor de importstroom is DOELVELD→KOLOMKOP (haal() draait het om).
  const importKoppeling: Record<string, string> = {
    artikelcode: "Artikelnr",
    omschrijving: "Omschrijving",
    eenheid: "Eenheid",
    prijs: "Nettoprijs",
  };
  const defaults = { defaults: { leverancier_id: leverancierId, geldig_van: "2027-01-01", geldig_tot: "2027-12-31", valuta: "EUR" } };

  // ═══ Check 1b (§11.1b): niet-plaatsbare regels ═════════════════════════════
  log("\n[1b] §11.1b — niet-koppelbare regels…");
  const controle1 = await api("POST", "/import/controleren", { token, json: { bestand_id: bestandId, type: "prijsafspraken", kolomkoppeling: importKoppeling, ...defaults } });
  if (controle1.status !== 200) throw new Error(`controleren(1b) ${controle1.status}: ${controle1.tekst.slice(0, 400)}`);
  const nk = controle1.body.niet_koppelbaar ?? {};
  check((nk.aantal ?? 0) >= 5, `1b. niet_koppelbaar.aantal ≥5 → ${nk.aantal}`);
  check(Array.isArray(nk.redenen) && nk.redenen.length >= 1 && typeof nk.redenen[0]?.reden === "string", `1b. redenen aanwezig → ${nk.redenen?.length} (bv: ${JSON.stringify(nk.redenen?.[0]?.reden ?? "")})`);

  // ═══ Check 2 (§11.2): oude afspraak + vergelijking ═════════════════════════
  log("\n[2] §11.2 — oude afspraak (12.50, 2026) + vergelijking…");
  const oud = await api("POST", "/prijsafspraken", { token, json: {
    leverancier_id: leverancierId,
    artikel_id: artikelId,
    leverancier_artikelcode: ART_CODE,
    leverancier_omschrijving: "Knauf W111 metal-stud wandsysteem",
    prijs: 12.5,
    eenheid: "m2",
    geldig_van: "2026-01-01",
    geldig_tot: "2026-12-31",
  } });
  check(oud.status === 201, `2. Oude afspraak 12.50 (2026) aangemaakt → ${oud.status}`);
  const oudeAfspraakId = oud.body?.id as number;

  const controle2 = await api("POST", "/import/controleren", { token, json: { bestand_id: bestandId, type: "prijsafspraken", kolomkoppeling: importKoppeling, ...defaults } });
  if (controle2.status !== 200) throw new Error(`controleren(2) ${controle2.status}: ${controle2.tekst.slice(0, 400)}`);
  const vgl = controle2.body.vergelijking ?? {};
  check((vgl.duurder ?? 0) >= 1, `2. vergelijking.duurder ≥1 → ${vgl.duurder}`);
  const top = Array.isArray(vgl.top_verschillen) ? vgl.top_verschillen : [];
  const knfInTop = top.find((t: any) => t.artikelId === artikelId || String(t.leverancierArtikelcode ?? t.artikelcode ?? "").toUpperCase().includes(ART_CODE) || (t.artikelId == null && Math.abs((t.nieuwePrijs ?? 0) - 13.75) < 0.01));
  // Verwacht % = (13.75 - 12.50)/12.50 = 10%.
  const pct = knfInTop?.verschilPct ?? knfInTop?.verschil_pct;
  check(!!knfInTop, `2. top_verschillen bevat het KNF-artikel → ${JSON.stringify(knfInTop ?? null)}`);
  check(pct != null && Math.abs(Math.abs(pct) - 10) < 0.6, `2. verschil ≈ +10% → ${pct}`);

  // ═══ Check 3 (§11.3): overlap 409 + import + terugdraaien ══════════════════
  log("\n[3] §11.3 — overlap geweigerd + import/uitvoeren + terugdraaien…");
  const voorAantal = (await db.select().from(prijsafsprakenTable).where(eq(prijsafsprakenTable.leverancierId, leverancierId))).length;
  const overlap = await api("POST", "/prijsafspraken", { token, json: {
    leverancier_id: leverancierId,
    artikel_id: artikelId,
    leverancier_artikelcode: ART_CODE,
    prijs: 11,
    eenheid: "m2",
    geldig_van: "2026-06-01",
    geldig_tot: "2027-06-01",
  } });
  check(overlap.status === 409, `3. Overlappende periode geweigerd met 409 → ${overlap.status}`);
  check(!!overlap.body?.botsende_regel, `3. 409-respons bevat botsende_regel → id=${overlap.body?.botsende_regel?.id}`);
  const naAantal = (await db.select().from(prijsafsprakenTable).where(eq(prijsafsprakenTable.leverancierId, leverancierId))).length;
  check(naAantal === voorAantal, `3. Geen rij bijgekomen na de weigering → voor=${voorAantal} na=${naAantal}`);

  // Import uitvoeren (2027-lijst). Controle2 hierboven zette de controle-hash;
  // uitvoeren gebruikt dezelfde kolomkoppeling.
  const uitvoeren = await api("POST", "/import/uitvoeren", { token, json: { bestand_id: bestandId, type: "prijsafspraken", kolomkoppeling: importKoppeling, keuze_dubbelen: "als_nieuw", ...defaults }, timeoutMs: 60_000 });
  check(uitvoeren.status === 200, `3. /import/uitvoeren → ${uitvoeren.status} (verwerkt=${uitvoeren.body?.rijen_verwerkt})`);
  const importId = uitvoeren.body?.log_id as number;
  const importRegels = await db.select().from(prijsafsprakenTable).where(eq(prijsafsprakenTable.importId, importId));
  check(importRegels.length >= 1 && importRegels.every((r) => r.bron === "import" && r.importId === importId), `3. Prijsafspraken met bron='import'+importId=${importId} → ${importRegels.length} rij(en)`);
  const knfImport = importRegels.find((r) => r.artikelId === artikelId);
  check(!!knfImport, `3. KNF-regel gekoppeld aan artikel_id in de import → id=${knfImport?.id} prijs=${knfImport?.prijs}`);

  // Terugdraaien: markeert (teruggedraaid_op), verwijdert niet.
  const terug = await api("POST", `/import/logs/${importId}/terugdraaien`, { token });
  check(terug.status === 200, `3. /import/logs/${importId}/terugdraaien → ${terug.status} (verwijderd=${terug.body?.verwijderd})`);
  const naTerug = await db.select().from(prijsafsprakenTable).where(eq(prijsafsprakenTable.importId, importId));
  const allesGemarkeerd = naTerug.length >= 1 && naTerug.every((r) => r.teruggedraaidOp != null);
  check(allesGemarkeerd, `3. Regels gemarkeerd teruggedraaid_op (niet verwijderd) → ${naTerug.filter((r) => r.teruggedraaidOp != null).length}/${naTerug.length}`);
  // Tellen niet meer mee in /prijsafspraken/geldig op een 2027-datum.
  const geldig2027 = await api("GET", `/prijsafspraken/geldig?artikel_id=${artikelId}&datum=2027-06-01`, { token });
  const geenImportGeldig = geldig2027.body?.afspraak == null || geldig2027.body?.afspraak?.import_id !== importId;
  check(geenImportGeldig, `3. Teruggedraaide importregels tellen niet mee in /prijsafspraken/geldig(2027) → afspraak=${JSON.stringify(geldig2027.body?.afspraak?.id ?? null)}`);

  // Zorg dat er een GELDIGE afspraak 12.50 (2026, vandaag geldig) staat voor de
  // vervolgpunten. De 2026-afspraak (oudeAfspraakId) is nog niet teruggedraaid.
  const geldigVandaag = await api("GET", `/prijsafspraken/geldig?artikel_id=${artikelId}&datum=${VANDAAG}`, { token });
  const heeft1250 = geldigVandaag.body?.afspraak && Math.abs(geldigVandaag.body.afspraak.prijs - 12.5) < 0.001;
  check(!!heeft1250, `3. Geldige afspraak 12.50 vandaag aanwezig voor vervolg → prijs=${geldigVandaag.body?.afspraak?.prijs}`);

  // ═══ Check 4 (§11.4): calculatie plak-analyse — herkomst, tarief ongewijzigd ═
  log("\n[4] §11.4 — plak-analyse: inkoop_bron=afspraak, tarief ongewijzigd (echte AI)…");
  const [calc] = await db.insert(modCalcHeadersTable).values({ naam: CALC_MERK, status: "concept" } as typeof modCalcHeadersTable.$inferInsert).returning();
  const calcId = calc!.id;
  const plakRes = await plakAnalyse(token, calcId, "Knauf W111 metal-stud scheidingswand, dubbel beplaat, 60 min brandwerend", 5, 2.5);
  const pW = vindProduct(plakRes, "W111", "Knauf", "wand");
  check(!!pW && pW.inkoop_bron === "afspraak", `4. KNF product inkoop_bron='afspraak' → ${pW?.inkoop_bron}`);
  check(!!pW && Math.abs((pW.afgesproken_inkoopprijs ?? -1) - 12.5) < 0.001, `4. afgesproken_inkoopprijs=12.50 → ${pW?.afgesproken_inkoopprijs}`);
  check(!!pW && !!pW.afspraak_leverancier, `4. afspraak_leverancier gevuld → ${JSON.stringify(pW?.afspraak_leverancier)}`);
  check(!!pW && !!pW.afspraak_geldig_tot, `4. afspraak_geldig_tot gevuld → ${pW?.afspraak_geldig_tot}`);
  check(!!pW && Math.abs((pW.conceptregel?.tarief ?? -1) - 18.5) < 0.001, `4. conceptregel-tarief ONGEWIJZIGD = verkoopprijs 18.50 → ${pW?.conceptregel?.tarief}`);

  // Tweede product ZONDER afspraak → catalogus. Gebruik een ander bestaand
  // artikel (brandklep) is er niet gegarandeerd; we plakken een generiek product
  // en verwachten óf een gekoppeld artikel zonder afspraak (catalogus) óf
  // ongekoppeld. We eisen: als er een gekoppeld artikel is, dan inkoop_bron=catalogus.
  const plakRes2 = await plakAnalyse(token, calcId, "Gipsplaat 12,5 mm standaard, per plaat", null, null);
  const gekoppeld2 = (plakRes2.producten as any[]).find((p) => p.artikel && p.inkoop_bron);
  if (gekoppeld2) {
    check(gekoppeld2.inkoop_bron === "catalogus", `4. Tweede (gekoppeld) product zonder afspraak → inkoop_bron='catalogus' → ${gekoppeld2.inkoop_bron}`);
  } else {
    // Fallback: koppel de calculatie-plak aan het KNF-artikel maar zonder afspraak
    // kan niet (er ís een afspraak). We melden dit als informatief 'catalogus'-
    // bewijs via een tweede seed-artikel zonder afspraak.
    const [art2] = await db.insert(modCalcArtekelenTable).values({ artikelcode: "P01-CATALOGUS-TEST", omschrijving: "Gipsplaat 12.5mm (PRIJS01-test, geen afspraak)", eenheid: "st", inkoopprijs: 7, verkoopprijs: 9.5, categorie: "materiaal" } as typeof modCalcArtekelenTable.$inferInsert).returning();
    const plakRes3 = await plakAnalyse(token, calcId, "Gipsplaat 12,5 mm P01-CATALOGUS-TEST standaard bouwplaat", null, null);
    const g3 = (plakRes3.producten as any[]).find((p) => p.artikel && p.inkoop_bron);
    check(!!g3 && g3.inkoop_bron === "catalogus", `4. Product zonder afspraak → inkoop_bron='catalogus' → ${g3?.inkoop_bron}`);
    await db.delete(modCalcArtekelenTable).where(eq(modCalcArtekelenTable.id, art2!.id));
  }

  // ═══ Check 5 (§11.5): factuurcontrole afwijking + goedkeuringsaanvraag ═════
  log("\n[5] §11.5 — inkoopfactuur (stukprijs 14.00) → afwijking + prijsafwijking-aanvraag…");
  // Inkoopfactuur + regel via DB (API weigert handmatige inkoopfacturen; §11 staat DB toe).
  const [factuur] = await db.insert(facturenTable).values({
    type: "inkoop",
    leverancierId,
    factuurdatum: VANDAAG,
    relatienaam: LEV_NAAM,
    status: "ontvangen",
  } as typeof facturenTable.$inferInsert).returning();
  const factuurId = factuur!.id;
  await db.insert(factuurRegelsTable).values({
    factuurId,
    regelnummer: 1,
    omschrijving: `${ART_CODE} Knauf W111 metal-stud wandsysteem`,
    hoeveelheid: 10,
    eenheid: "m2",
    stukprijs: "14.00",
  } as typeof factuurRegelsTable.$inferInsert).returning();

  const controle5 = await api("GET", `/facturen/${factuurId}/prijscontrole?verse=1`, { token, timeoutMs: 60_000 });
  check(controle5.status === 200, `5. GET prijscontrole → ${controle5.status}`);
  const regel5 = (controle5.body?.regels ?? []).find((r: any) => r.omschrijving?.includes(ART_CODE));
  check(!!regel5 && regel5.uitkomst === "afwijking", `5. Uitkomst 'afwijking' (14.00 vs 12.50, marge ${margePct}%) → ${regel5?.uitkomst}`);
  check(!!regel5 && Math.abs((regel5.afgesproken_prijs ?? -1) - 12.5) < 0.001, `5. afgesproken_prijs=12.50 → ${regel5?.afgesproken_prijs}`);

  const aanvragen5 = await db.select().from(goedkeuringAanvragenTable).where(and(eq(goedkeuringAanvragenTable.objectType, "factuur_prijsafwijking"), eq(goedkeuringAanvragenTable.objectId, factuurId)));
  const openAanvraag = aanvragen5.find((a) => a.status === "ingediend") ?? aanvragen5[0];
  check(!!openAanvraag && openAanvraag.documentType === "prijsafwijking", `5. Goedkeuringsaanvraag type prijsafwijking bestaat → ${aanvragen5.length} (status=${openAanvraag?.status})`);
  const oms = openAanvraag?.omschrijving ?? "";
  check(oms.includes("12.50") && oms.includes("14.00"), `5. Omschrijving bevat afspraak (12.50) én factuurprijs (14.00) → ${JSON.stringify(oms.slice(0, 140))}`);

  // Idempotent: 2e toets maakt geen 2e open aanvraag.
  const controle5b = await api("GET", `/facturen/${factuurId}/prijscontrole?verse=1`, { token, timeoutMs: 60_000 });
  check(controle5b.status === 200, `5. 2e toets → ${controle5b.status}`);
  const aanvragen5b = await db.select().from(goedkeuringAanvragenTable).where(and(eq(goedkeuringAanvragenTable.objectType, "factuur_prijsafwijking"), eq(goedkeuringAanvragenTable.objectId, factuurId), eq(goedkeuringAanvragenTable.status, "ingediend")));
  check(aanvragen5b.length === 1, `5. Idempotent: precies 1 open prijsafwijking-aanvraag → ${aanvragen5b.length}`);

  // ═══ Check 6 (§11.6): binnen marge → klopt ════════════════════════════════
  log("\n[6] §11.6 — tweede regel 12.60 (binnen marge) → 'klopt', geen melding…");
  await db.insert(factuurRegelsTable).values({
    factuurId,
    regelnummer: 2,
    omschrijving: `${ART_CODE} Knauf W111 (binnen marge)`,
    hoeveelheid: 5,
    eenheid: "m2",
    stukprijs: "12.60",
  } as typeof factuurRegelsTable.$inferInsert).returning();
  const controle6 = await api("GET", `/facturen/${factuurId}/prijscontrole?verse=1`, { token, timeoutMs: 60_000 });
  const regel6 = (controle6.body?.regels ?? []).filter((r: any) => r.omschrijving?.includes(ART_CODE)).find((r: any) => Math.abs((r.factuur_stukprijs ?? 0) - 12.6) < 0.001);
  // 12.60 vs 12.50 = +0.8% < marge → klopt.
  check(!!regel6 && regel6.uitkomst === "klopt", `6. Regel 12.60 → uitkomst 'klopt' (+0.8% < ${margePct}%) → ${regel6?.uitkomst}`);
  // Geen 2e open aanvraag door de nieuwe regel.
  const aanvragen6 = await db.select().from(goedkeuringAanvragenTable).where(and(eq(goedkeuringAanvragenTable.objectType, "factuur_prijsafwijking"), eq(goedkeuringAanvragenTable.objectId, factuurId), eq(goedkeuringAanvragenTable.status, "ingediend")));
  check(aanvragen6.length === 1, `6. Nog steeds precies 1 open aanvraag (12.60 gaf geen melding) → ${aanvragen6.length}`);

  // ═══ Check 7 (§11.7): factuurregel ongewijzigd ════════════════════════════
  log("\n[7] §11.7 — factuurregel 14.00 blijft 14.00 na de toets…");
  const [regelDB] = await db.select().from(factuurRegelsTable).where(and(eq(factuurRegelsTable.factuurId, factuurId), eq(factuurRegelsTable.regelnummer, 1)));
  check(regelDB != null && parseFloat(String(regelDB.stukprijs)) === 14, `7. stukprijs in DB = 14.00 (onveranderd) → ${regelDB?.stukprijs}`);

  // ═══ Check 8 (§11.8): maandtotaal ═════════════════════════════════════════
  log("\n[8] §11.8 — maandtotaal 'meer betaald'…");
  const maandtot = await api("GET", `/facturen/prijscontrole/maandtotaal?maand=${MAAND}`, { token });
  check(maandtot.status === 200, `8. GET maandtotaal → ${maandtot.status}`);
  // Verwacht: (14.00-12.50) × 10 = 15.00 meebetaald op deze factuur.
  const teltOnzeAfwijking = (maandtot.body?.regels ?? []).some((r: any) => r.factuur_id === factuurId && Math.abs((r.verschil_totaal ?? 0) - 15) < 0.01);
  check((maandtot.body?.totaal_meer_betaald ?? 0) > 0, `8. totaal_meer_betaald > 0 → ${maandtot.body?.totaal_meer_betaald}`);
  check(teltOnzeAfwijking, `8. Maandtotaal telt de afwijking uit §11.5 (verschil×hoeveelheid = 15.00) → ${JSON.stringify((maandtot.body?.regels ?? []).find((r: any) => r.factuur_id === factuurId)?.verschil_totaal ?? null)}`);

  // ═══ Check 9 (§11.9): bewaking aflopende afspraak ═════════════════════════
  log("\n[9] §11.9 — aflopende afspraak → bewakingsloop → werkbakitem 'prijsafspraak_verloopt'…");
  // Zet de geldige 2026-afspraak geldig_tot op over 10 dagen (binnen 60).
  const over10 = new Date(); over10.setDate(over10.getDate() + 10);
  const over10Iso = over10.toISOString().slice(0, 10);
  await db.update(prijsafsprakenTable).set({ geldigTot: over10Iso, bijgewerktOp: new Date() }).where(eq(prijsafsprakenTable.id, oudeAfspraakId));
  const draai = await api("POST", "/werkbak/bewaking/draai", { token, timeoutMs: 180_000 });
  check(draai.status === 200, `9. /werkbak/bewaking/draai → ${draai.status}`);
  const draaien = await api("GET", "/werkbak/bewaking/draaien", { token });
  const laatste = (draaien.body ?? [])[0];
  check(!!laatste, `9. bewaking_draaien-regel aanwezig → ${JSON.stringify(laatste ? { id: laatste.id, status: laatste.status } : null)}`);
  const voeder = laatste?.samenvatting?.prijsafspraken_verlopen;
  check(!!voeder && typeof voeder.nieuw === "number", `9. Voeder 'prijsafspraken_verlopen' in de draai-samenvatting → ${JSON.stringify(voeder ?? null)}`);
  log(`   bewaking_draaien-regel: ${JSON.stringify(laatste)}`);
  // Werkbakitem voor déze afspraak.
  const werkbak = await api("GET", "/werkbak", { token });
  const item = (werkbak.body ?? []).find((i: any) => i.bron === "prijsafspraak_verloopt" && i.herkomst_id === oudeAfspraakId);
  check(!!item, `9. Werkbakitem bron 'prijsafspraak_verloopt' voor afspraak #${oudeAfspraakId} → ${JSON.stringify(item ? { id: item.id, titel: item.titel } : null)}`);

  // ═══ Check 10 (§11.10): marktspiegel ══════════════════════════════════════
  log("\n[10] §11.10 — marktspiegel (echte websearch-AI, poll tot 4 min)…");
  // Onderwerp = de geldige prijsafspraak. De afspraak draagt leverancier_artikelcode=ART_CODE.
  const markt = await api("POST", "/marktspiegel", { token, json: { onderwerp_type: "prijsafspraak", onderwerp_id: oudeAfspraakId, aanleiding: "handmatig" } });
  check(markt.status === 201, `10. POST /marktspiegel → ${markt.status}`);
  const onderzoekId = markt.body?.id as number;
  let onderzoek: any = null;
  const deadline = Date.now() + 240_000; // 4 min
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 6_000));
    const g = await api("GET", `/marktspiegel/${onderzoekId}`, { token });
    onderzoek = g.body;
    if (onderzoek?.status === "klaar" || onderzoek?.status === "fout") break;
  }
  check(onderzoek?.status === "klaar", `10. Onderzoek status 'klaar' → ${onderzoek?.status}${onderzoek?.fout ? ` (fout: ${onderzoek.fout})` : ""}`);
  const res = onderzoek?.resultaat ?? {};
  const vergs = Array.isArray(res.vergelijkingen) ? res.vergelijkingen : [];
  const samenvatting = String(res.samenvatting ?? "");
  log(`   Samenvatting: ${samenvatting}`);
  for (const vv of vergs.slice(0, 3)) log(`   • ${vv.vindplaats_url} (gevonden_op ${vv.gevonden_op})`);
  if (vergs.length > 0) {
    const alleMetBron = vergs.every((x: any) => typeof x.vindplaats_url === "string" && /^https?:\/\//i.test(x.vindplaats_url) && typeof x.gevonden_op === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.gevonden_op));
    check(alleMetBron, `10. Elke vergelijking heeft http-vindplaats_url én geldige gevonden_op → ${vergs.length} vergelijking(en)`);
  } else {
    check(true, "10. 0 vindbare bronnen → vergelijkingen leeg = OK (nooit geschat)");
  }
  // De vaste zin bevat zélf "niet wisselen" (= géén wisseladvies). Strip die
  // eerst, controleer de rest op overstap-/wisseltaal.
  const VASTE_ZIN = "Het doel van deze marktspiegel is weten, niet wisselen. De gebruikelijke vervolgstap is een gesprek met de bestaande leverancier.";
  const zonderVasteZin = samenvatting.replace(VASTE_ZIN, "");
  const geenWissel = !/overstap|wissel|switch/i.test(zonderVasteZin);
  check(geenWissel, `10. Samenvatting (excl. vaste zin) bevat GEEN overstap-/wisseladvies → ${JSON.stringify(zonderVasteZin.slice(0, 160))}`);
  check(samenvatting.includes("weten, niet wisselen"), `10. Samenvatting bevat de vaste weten-niet-wisselen-zin → ${samenvatting.includes("weten, niet wisselen")}`);

  // ═══ Check 11 (§11.11): verkoopkant = eigen opdracht ══════════════════════
  log("\n[11] §11.11 — §8.4 verkoopkant = eigen opdracht (gemeld)");

  // ── Opruimen ───────────────────────────────────────────────────────────
  await ruimOp();
  void beleidZelfGezaaid; // reeds opgeruimd via BELEID_MERK

  log("");
  if (process.exitCode) {
    log(`FAAL — ${fout.length} check(s) rood:\n- ${fout.join("\n- ")}`);
  } else {
    log("PRIJS_01 §11 groen: prijslijst→voorstel, vergelijking, overlap geweigerd, import+terugdraaien, calculatie-herkomst zonder offerteverlaging, factuurcontrole+goedkeuring, maandtotaal, bewaking-werkbakitem, marktspiegel met bron zonder wisseladvies.");
  }
}

// ── plak-analyse helper (echte AI, ruime timeout) ────────────────────────────
async function plakAnalyse(token: string, calcId: number, tekst: string, lengte: number | null, hoogte: number | null): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const form = new FormData();
    form.append("tekst", tekst);
    if (lengte != null) form.append("lengte", String(lengte));
    if (hoogte != null) form.append("hoogte", String(hoogte));
    const r = await fetch(`${BASIS}/modules/calculaties/${calcId}/plak-analyse`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: ctrl.signal,
    });
    const t = await r.text();
    if (r.status !== 200) throw new Error(`plak-analyse ${r.status}: ${t.slice(0, 300)}`);
    return JSON.parse(t);
  } finally {
    clearTimeout(timer);
  }
}

function vindProduct(res: any, ...termen: string[]): any {
  return (res.producten as any[]).find((p) => {
    const blob = `${p.herkend?.fabrikant ?? ""} ${p.herkend?.aanduiding ?? ""} ${p.herkend?.soort ?? ""} ${p.artikel?.omschrijving ?? ""}`.toLowerCase();
    return termen.some((t) => blob.includes(t.toLowerCase()));
  });
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error(e); process.exit(1); });

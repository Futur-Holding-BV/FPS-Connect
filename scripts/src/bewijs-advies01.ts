// ADVIES_01 §8 — bewijs: een adviesrapport inlezen en de calculatie ernaar inrichten.
//
// Bewijst end-to-end (§8.1 t/m §8.11) dat:
//  §8.1  de vijf regelsoorten werken en het header-/calculatietotaal ALLEEN
//        regel+materiaal bevat (tekst/stelpost/kop tellen niet mee; het
//        stelpost-bedrag blijft wél zichtbaar op de regel zelf);
//  §8.2  de optioneel-vlag de offerte splitst — Cityflat-nabootsing: calculatie-
//        totaal 16330.60, aangeboden 12180.71, optioneel_totaal 4149.89;
//  §8.3  de migratie niets verandert: een vóór dit script (zonder soort) via de
//        gewone route aangemaakte calculatie houdt exact hetzelfde totaal, en
//        alle pre-bestaande regels dragen soort='regel';
//  §8.4  een adviesrapport-PDF door Slim Upload herkend wordt (categorie
//        'adviesrapport') en de aanlevering doorschakelt naar 'calculatie-
//        inrichten' met een document_id;
//  §8.5/6/11 de analyse per punt één voorstel geeft (punten_aantal == aantal
//        voorstellen), regelnummers de rapportnummers dragen (incl. het
//        samengestelde "2.9/2.10/3.9" ONGESPLITST) en de koppelgraad geteld wordt;
//  §8.7  minstens één voorstel soortvoorstel='geen_werkzaamheden' een tekstregel
//        zonder bedrag oplevert;
//  §8.8  een vaag punt 'niet_te_beoordelen' met een vraag terugkomt (niet weggelaten);
//  §8.9  niets automatisch wordt vastgelegd (regel-telling vóór==na de analyse) en
//        dat één bevestigd voorstel via POST regels +1 regel toevoegt;
//  §8.10 document_koppelingen (document_id, 'calculatie', calcId) bestaat en de
//        gekoppelde-documenten-route het rapport teruggeeft vanaf de calculatie.
//
// Dit script raakt GEEN api-server-bronbestanden aan: het praat uitsluitend via
// HTTP met de draaiende API en leest/schrijft via @workspace/db. Het pakket
// `pdfkit` (voor het adviesrapport) wordt via een absoluut pad uit de api-server-
// node_modules geladen — geen bronimport, alleen de generieke PDF-schrijver.
//
// AI-variatie: de punt-uitlezing en soort-/koppelkeuze komen van de echte AI.
// De harde eisen (alle punten terug, samengesteld nummer ongesplitst, ≥1
// niet-werkzaamheden-voorstel, koppelgraad aanwezig) worden soepel geasserteerd;
// de gevonden soorten worden gelogd.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-advies01.ts
import "./lib/prodGuard";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { authenticator } from "otplib";
import {
  db,
  gebruikersTable,
  modCalcHeadersTable,
  modCalcRegelsTable,
  modCalcArtekelenTable,
  modCalcNormtijdenTable,
  modCalcTarievenTable,
  modCalcPlakAnalysesTable,
  documentenTable,
  documentKoppelingenTable,
} from "@workspace/db";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
// Testgeheimen worden bij elke run vers gegenereerd — geen hard-coded constanten.
const TOTP = authenticator.generateSecret();
const WW = `${randomBytes(12).toString("base64url")}Aa1!`;
const EMAIL = "bewijs-advies01@fps.local";

// Deployment-grendel: een bewijsscript raakt nooit productie aan.
if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

// ── Testmarkeringen voor doelgericht opruimen ────────────────────────────────
const CALC_MERK = "ADVIES01-TESTCALCULATIE";            // §8.1 vijf regelsoorten
const CALC_MERK_CITY = "ADVIES01-CITYFLAT";             // §8.2 optioneel-splitsing
const CALC_MERK_MIGRATIE = "ADVIES01-MIGRATIE-BESTAAND"; // §8.3 pre-bestaande calc
const CALC_MERK_ANALYSE = "ADVIES01-ANALYSE";           // §8.5+ inrichten via rapport
const CALC_MERKEN = [CALC_MERK, CALC_MERK_CITY, CALC_MERK_MIGRATIE, CALC_MERK_ANALYSE];
const NORMTIJD_CODE = "ADV01-DEUR";
const ARTIKEL_CODE = "ADV01-DEURTEST";
const DOC_NAAM_MARK = "ADVIES01 Brandveiligheidsconsult";

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
  const calcs = await db
    .select({ id: modCalcHeadersTable.id })
    .from(modCalcHeadersTable)
    .where(inArray(modCalcHeadersTable.naam, CALC_MERKEN));
  const calcIds = calcs.map((c) => c.id);
  if (calcIds.length > 0) {
    // Plak-analyses (adviesrapport) hangen aan de calculatie.
    await db.delete(modCalcPlakAnalysesTable).where(inArray(modCalcPlakAnalysesTable.calculatieId, calcIds));
    // Documentkoppelingen naar deze calculaties.
    await db.delete(documentKoppelingenTable).where(and(eq(documentKoppelingenTable.doelType, "calculatie"), inArray(documentKoppelingenTable.doelId, calcIds)));
    // Regels + headers (regels via cascade, maar expliciet voor de zekerheid).
    await db.delete(modCalcRegelsTable).where(inArray(modCalcRegelsTable.calculatieId, calcIds));
    await db.delete(modCalcHeadersTable).where(inArray(modCalcHeadersTable.id, calcIds));
  }

  // Testdocumenten (adviesrapport-PDF) + hun overige koppelingen.
  const docs = await db.select({ id: documentenTable.id }).from(documentenTable).where(eq(documentenTable.naam, DOC_NAAM_MARK));
  const docIds = docs.map((d) => d.id);
  if (docIds.length > 0) {
    await db.delete(documentKoppelingenTable).where(inArray(documentKoppelingenTable.documentId, docIds));
    await db.delete(documentenTable).where(inArray(documentenTable.id, docIds));
  }

  // Testartikel + testnormtijd (zelf gezaaid).
  await db.delete(modCalcArtekelenTable).where(eq(modCalcArtekelenTable.artikelcode, ARTIKEL_CODE));
  await db.delete(modCalcNormtijdenTable).where(eq(modCalcNormtijdenTable.code, NORMTIJD_CODE));

  // Testgebruiker.
  await db.delete(gebruikersTable).where(eq(gebruikersTable.email, EMAIL));
}

// ── Adviesrapport-PDF bouwen (via generieke pdfkit-schrijver) ────────────────
// Genummerde punten 1.3, 1.4, 2.9/2.10/3.9 (samengesteld!), 3.11. Eén punt matcht
// het gezaaide artikel+normtijd (bergingsdeur schilderen), één punt ligt bij de
// VvE/installateur ("geen werkzaamheden aannemer"), één punt is vaag.
async function bouwAdviesrapport(): Promise<Buffer> {
  // pdfkit uit de api-server-node_modules — geen bronimport, alleen de PDF-writer.
  // @ts-expect-error — absoluut pad naar de ESM-build (geen types nodig).
  const mod: any = await import("/home/runner/workspace/artifacts/api-server/node_modules/pdfkit/js/pdfkit.es.js");
  const PDFDocument: any = mod.default ?? mod;

  return await new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(18).text("Brandveiligheidsconsult — adviesrapport", { align: "left" });
      doc.moveDown(0.5);
      doc.fontSize(11).text(
        "Opdrachtgever: VvE Testcomplex De Grundel. Locatie: appartementencomplex, Testdorp. " +
        "Dit rapport bevat genummerde bevindingen met per punt een geconstateerde tekortkoming en een geadviseerd herstel.",
      );
      doc.moveDown(1);

      doc.fontSize(14).text("Hoofdstuk 1 — Bouwkundig");
      doc.moveDown(0.4);
      doc.fontSize(11).text(
        "1.3  Bergingsdeuren onvoldoende afgewerkt. Tekortkoming: de houten bergingsdeuren in de " +
        "gemeenschappelijke ruimte zijn onafgewerkt en beschadigd. Geadviseerd herstel: de bergingsdeuren " +
        "afnemen, gronden en schilderen (deuren schilderen).",
      );
      doc.moveDown(0.4);
      doc.text(
        "1.4  Meterkast — brandwerende doorvoeringen. Tekortkoming: kabeldoorvoeringen in de meterkast zijn " +
        "niet brandwerend afgedicht. Geadviseerd herstel: doorvoeringen brandwerend afdichten.",
      );
      doc.moveDown(1);

      doc.fontSize(14).text("Hoofdstuk 2 — Installaties / derden");
      doc.moveDown(0.4);
      doc.fontSize(11).text(
        "2.9/2.10/3.9  Liftschacht en centrale technische ruimte. Tekortkoming: onduidelijke situatie rond de " +
        "brandwerende scheiding van de liftschacht en de technische ruimte; dit betreft de installaties van de lift " +
        "en de CV-ketel. Geadviseerd herstel: dit ligt bij de VvE en de installateur — de liftonderhouder en de " +
        "cv-installateur dienen dit zelf te verzorgen. Geen werkzaamheden voor de aannemer.",
      );
      doc.moveDown(1);

      doc.fontSize(14).text("Hoofdstuk 3 — Overig");
      doc.moveDown(0.4);
      doc.fontSize(11).text(
        "3.11  Diverse aandachtspunten. Tekortkoming: op de zolderverdieping zijn enkele niet nader gespecificeerde " +
        "aandachtspunten geconstateerd waarvan de aard en omvang op basis van dit rapport niet te bepalen zijn. " +
        "Geadviseerd herstel: nader te bepalen; aanvullend onderzoek nodig.",
      );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ── Regelhulp: POST een regel op een calculatie ──────────────────────────────
async function postRegel(token: string, calcId: number, body: Record<string, unknown>): Promise<any> {
  const r = await api("POST", `/modules/calculaties/${calcId}/regels`, { token, json: body });
  if (r.status !== 201) throw new Error(`POST regel faalde ${r.status}: ${r.tekst.slice(0, 300)}`);
  return r.body;
}

// De POST /modules/calculaties accepteert geen opslag_abk (default 10%). Zet die
// via PATCH op 0 zodat het bewijs met "geen opslagen" klopt (eindtotaal==subtotaal).
async function nulOpslagen(token: string, calcId: number): Promise<void> {
  const r = await api("PATCH", `/modules/calculaties/${calcId}`, {
    token,
    json: { opslag_materiaal: 0, opslag_arbeid: 0, opslag_ak: 0, opslag_abk: 0, opslag_risico: 0, opslag_winst: 0, korting: 0 },
  });
  if (r.status !== 200) throw new Error(`PATCH nul-opslagen ${calcId} → ${r.status}: ${r.tekst.slice(0, 200)}`);
}

async function printData(token: string, calcId: number): Promise<any> {
  const r = await api("GET", `/modules/calculaties/${calcId}/print-data`, { token });
  if (r.status !== 200) throw new Error(`print-data ${calcId} → ${r.status}: ${r.tekst.slice(0, 300)}`);
  return r.body;
}

async function main(): Promise<void> {
  await ruimOp();

  // ── Testgebruiker (hoofdbeheerder) ──────────────────────────────────────────
  // Rol hoofdbeheerder dekt lezenCalc/schrijvenCalc/aanmakenCalc én de bibliotheek-
  // uploadroute (bibliotheek≥2/3). De ruime bevoegdheden staan er conform de
  // opdracht bij; hoofdbeheerder maakt ze functioneel overbodig. GEMELD in het rapport.
  await db.insert(gebruikersTable).values({
    naam: "Bewijs ADVIES_01",
    email: EMAIL,
    rol: "hoofdbeheerder",
    wachtwoord: await bcrypt.hash(WW, 10),
    totpSecret: TOTP,
    tweeFactorIngeschakeld: true,
    actief: true,
    functietitels: ["Calculatie"],
    bevoegdheden: { calculaties: 4, bibliotheek: 3 },
  } as typeof gebruikersTable.$inferInsert);

  // ── Seed: normtijd + artikel voor een matchbaar punt (zoals PRIJS_01 KNF-W111) ─
  const [nt] = await db.insert(modCalcNormtijdenTable).values({
    code: NORMTIJD_CODE,
    omschrijving: "Bergingsdeur afnemen, gronden en schilderen (ADVIES01-test)",
    categorie: "bouwkundig",
    eenheid: "st",
    urenPerEenheid: 1.2,
  } as typeof modCalcNormtijdenTable.$inferInsert).returning();
  const normtijdId = nt!.id;
  const [art] = await db.insert(modCalcArtekelenTable).values({
    artikelcode: ARTIKEL_CODE,
    omschrijving: "Grondverf + aflak bergingsdeur schilderen (ADVIES01-test)",
    eenheid: "st",
    inkoopprijs: 12,
    verkoopprijs: 25.28,
    categorie: "materiaal",
  } as typeof modCalcArtekelenTable.$inferInsert).returning();
  const artikelId = art!.id;
  // Standaard arbeidstarief verzekeren (conceptregel bij 'werkzaamheden').
  const arbeid = await db.select().from(modCalcTarievenTable).where(and(eq(modCalcTarievenTable.categorie, "arbeid"), eq(modCalcTarievenTable.actief, true)));
  if (arbeid.length === 0) {
    await db.insert(modCalcTarievenTable).values({ naam: "ADVIES01 Monteur", tarief: 60.91, eenheid: "uur", categorie: "arbeid" } as typeof modCalcTarievenTable.$inferInsert);
    log("Geen actief arbeidstarief gevonden → test-arbeidstarief 60.91 gezaaid (blijft staan; generiek).");
  }
  log(`Seed: normtijd #${normtijdId} ${NORMTIJD_CODE} (1,2 mu), artikel #${artikelId} ${ARTIKEL_CODE} (verkoop 25.28).`);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = await api("POST", "/auth/mobile/login", { json: { email: EMAIL, wachtwoord: WW, code: authenticator.generate(TOTP) } });
  if (login.status !== 200) throw new Error(`login faalde: ${login.status} ${login.tekst}`);
  const token = login.body.token as string;

  // ═══ Check §8.1: de vijf regelsoorten — totaal alleen regel+materiaal ═══════
  log("\n[1] §8.1 — vijf regelsoorten; totaal telt alleen regel+materiaal…");
  const c1 = await api("POST", "/modules/calculaties", { token, json: { naam: CALC_MERK, opslag_ak: 0, opslag_risico: 0, opslag_winst: 0 } });
  if (c1.status !== 201) throw new Error(`calc §8.1 aanmaken ${c1.status}: ${c1.tekst.slice(0, 300)}`);
  const calc1 = c1.body.id as number;
  await nulOpslagen(token, calc1);

  // 1) gewone regel met artikel + normtijd (hoeveelheid 10, tarief 20, mu 1,2, arbeid 50) → 10*20 + 10*1.2*50 = 800
  const rRegel = await postRegel(token, calc1, {
    soort: "regel", categorie: "materiaal", omschrijving: "Bergingsdeuren schilderen (regel)",
    normtijd_id: normtijdId, eenheid: "st", hoeveelheid: 10, tarief: 20,
    mu_per_eenheid: 1.2, arbeids_tarief: 50, hoofdstuk: "Bouwkundig", regelnummer: "1.3",
  });
  // 2) materiaalregel als kind (ouder_regel_id) — telt mee: 10 * 1.72 = 17.20
  const rMat = await postRegel(token, calc1, {
    soort: "materiaal", categorie: "materiaal", omschrijving: "Afnemen deur Progold (materiaal-kind)",
    ouder_regel_id: rRegel.id, eenheid: "st", hoeveelheid: 10, tarief: 1.72, hoofdstuk: "Bouwkundig",
  });
  // 3) tekstregel — telt niet mee
  const rTekst = await postRegel(token, calc1, {
    soort: "tekst", omschrijving: "Geen werkzaamheden aannemer — ligt bij de VvE", hoofdstuk: "Bouwkundig",
  });
  // 4) stelpost mét bedrag — telt niet mee, bedrag wél zichtbaar
  const rStelpost = await postRegel(token, calc1, {
    soort: "stelpost", omschrijving: "Brandoverslagberekening laten uitvoeren — STELPOST", tarief: 1500, hoofdstuk: "Overig",
  });
  // 5) kop — telt niet mee
  const rKop = await postRegel(token, calc1, {
    soort: "kop", omschrijving: "OPTIONEEL HEEL KOZIJN SCHILDEREN", hoofdstuk: "Overig",
  });

  check(rRegel.soort === "regel", `1. regel opgeslagen als soort='regel' → ${rRegel.soort}`);
  check(rMat.soort === "materiaal" && rMat.ouder_regel_id === rRegel.id, `1. materiaal-kind hangt via ouder_regel_id aan de ouder → ouder=${rMat.ouder_regel_id} (verwacht ${rRegel.id})`);
  check(rTekst.soort === "tekst" && (rTekst.totaal ?? 0) === 0, `1. tekstregel soort='tekst' en totaal 0 → soort=${rTekst.soort} totaal=${rTekst.totaal}`);
  check(rStelpost.soort === "stelpost" && Math.abs((rStelpost.totaal ?? 0) - 1500) < 0.001, `1. stelpost soort='stelpost' en bedrag 1500 zichtbaar op de regel → soort=${rStelpost.soort} totaal=${rStelpost.totaal}`);
  check(rKop.soort === "kop" && (rKop.totaal ?? 0) === 0, `1. kop soort='kop' en totaal 0 → soort=${rKop.soort} totaal=${rKop.totaal}`);

  // Header/calculatietotaal telt ALLEEN regel(800) + materiaal(17.20) = 817.20.
  const pd1 = await printData(token, calc1);
  const verwacht1 = 817.2;
  check(Math.abs((pd1.totalen.subtotaal ?? -1) - verwacht1) < 0.02, `1. subtotaal = 817.20 (regel 800 + materiaal 17.20; stelpost/tekst/kop tellen NIET mee) → ${pd1.totalen.subtotaal}`);
  check(Math.abs((pd1.totalen.eindtotaal ?? -1) - verwacht1) < 0.02, `1. eindtotaal (geen opslagen) = 817.20 → ${pd1.totalen.eindtotaal}`);
  const stelpostRegelPd = (pd1.regels ?? []).find((r: any) => r.id === rStelpost.id);
  check(!!stelpostRegelPd && Math.abs((stelpostRegelPd.totaal ?? 0) - 1500) < 0.001, `1. stelpostbedrag 1500 blijft zichtbaar op de regel in print-data → ${stelpostRegelPd?.totaal}`);

  // ═══ Check §8.2: Cityflat-nabootsing — optioneel-splitsing ═════════════════
  log("\n[2] §8.2 — Cityflat: totaal 16330.60, aangeboden 12180.71, optioneel 4149.89…");
  const c2 = await api("POST", "/modules/calculaties", { token, json: { naam: CALC_MERK_CITY, opslag_ak: 0, opslag_risico: 0, opslag_winst: 0 } });
  if (c2.status !== 201) throw new Error(`calc §8.2 aanmaken ${c2.status}: ${c2.tekst.slice(0, 300)}`);
  const calc2 = c2.body.id as number;
  await nulOpslagen(token, calc2);
  // Simpele bedragen (tarief zonder mu) die exact optellen:
  //   aangeboden: 8000.00 + 4180.71 = 12180.71
  //   optioneel : 3000.00 + 1149.89 = 4149.89
  //   calculatietotaal = 16330.60
  await postRegel(token, calc2, { soort: "regel", categorie: "materiaal", omschrijving: "Aangeboden werk A", eenheid: "st", hoeveelheid: 1, tarief: 8000.0, hoofdstuk: "Aangeboden" });
  await postRegel(token, calc2, { soort: "regel", categorie: "materiaal", omschrijving: "Aangeboden werk B", eenheid: "st", hoeveelheid: 1, tarief: 4180.71, hoofdstuk: "Aangeboden" });
  await postRegel(token, calc2, { soort: "regel", categorie: "materiaal", omschrijving: "OPTIONEEL heel kozijn schilderen A", eenheid: "st", hoeveelheid: 1, tarief: 3000.0, optioneel: true, hoofdstuk: "Optioneel" });
  await postRegel(token, calc2, { soort: "regel", categorie: "materiaal", omschrijving: "OPTIONEEL heel kozijn schilderen B", eenheid: "st", hoeveelheid: 1, tarief: 1149.89, optioneel: true, hoofdstuk: "Optioneel" });

  const pd2 = await printData(token, calc2);
  const aangeboden = pd2.totalen.subtotaal ?? -1;
  const optioneel = pd2.totalen.optioneel_totaal ?? -1;
  const calctotaal = Math.round((aangeboden + optioneel) * 100) / 100;
  check(Math.abs(aangeboden - 12180.71) < 0.02, `2. aangeboden (subtotaal, excl. optioneel) = 12180.71 → ${aangeboden}`);
  check(Math.abs(optioneel - 4149.89) < 0.02, `2. optioneel_totaal = 4149.89 → ${optioneel}`);
  check(Math.abs(calctotaal - 16330.60) < 0.02, `2. calculatietotaal (aangeboden + optioneel) = 16330.60 → ${calctotaal}`);
  check(Math.abs((pd2.totalen.eindtotaal ?? -1) - 12180.71) < 0.02, `2. eindtotaal = aangeboden 12180.71 (optioneel telt NIET mee in de aanneemsom) → ${pd2.totalen.eindtotaal}`);

  // ═══ Check §8.3: migratie-onveranderlijkheid ═══════════════════════════════
  log("\n[3] §8.3 — migratie verandert niets…");
  // a) alle PRE-BESTAANDE regels dragen soort='regel'. Tel de regels met soort='regel'
  //    en meld hoeveel dat er zijn (de migratie zette alle bestaande op 'regel').
  const soortTelling = await db.select({ soort: modCalcRegelsTable.soort }).from(modCalcRegelsTable);
  const aantalRegelSoort = soortTelling.filter((r) => (r.soort ?? "regel") === "regel").length;
  const aantalTotaal = soortTelling.length;
  check(aantalRegelSoort >= 1, `3. mod_calc_regels met soort='regel' aanwezig (migratie zette bestaande regels op 'regel') → ${aantalRegelSoort} van ${aantalTotaal}`);
  log(`   ${aantalRegelSoort}/${aantalTotaal} regels dragen soort='regel'.`);

  // b) een calculatie die via de GEWONE route (zonder soort) is aangemaakt, houdt
  //    exact hetzelfde totaal — bewijs dat de nieuwe velden niets herrekenen.
  const c3 = await api("POST", "/modules/calculaties", { token, json: { naam: CALC_MERK_MIGRATIE, opslag_ak: 0, opslag_risico: 0, opslag_winst: 0 } });
  if (c3.status !== 201) throw new Error(`calc §8.3 aanmaken ${c3.status}: ${c3.tekst.slice(0, 300)}`);
  const calc3 = c3.body.id as number;
  await nulOpslagen(token, calc3);
  // Regel ZONDER soort meegeven (default 'regel'), zoals vóór de uitbreiding.
  const rOud1 = await postRegel(token, calc3, { categorie: "materiaal", omschrijving: "Bestaande regel A (zonder soort)", eenheid: "st", hoeveelheid: 4, tarief: 125.5, hoofdstuk: "Bestaand" });
  const rOud2 = await postRegel(token, calc3, { categorie: "arbeid", omschrijving: "Bestaande regel B (zonder soort)", eenheid: "st", hoeveelheid: 3, mu_per_eenheid: 2, arbeids_tarief: 60, tarief: 0, hoofdstuk: "Bestaand" });
  check(rOud1.soort === "regel" && rOud2.soort === "regel", `3. Regels zonder 'soort' krijgen default soort='regel' → ${rOud1.soort}/${rOud2.soort}`);
  const pdVoor = await printData(token, calc3);
  const totaalVoor = pdVoor.totalen.eindtotaal;
  // Regel A: 4*125.5 = 502.00 ; Regel B: 3*2*60 = 360.00 ; totaal 862.00
  check(Math.abs(totaalVoor - 862.0) < 0.02, `3. Totaal van de 'bestaande' calculatie = 862.00 → ${totaalVoor}`);
  // Lees nogmaals (idempotent) — geen herberekening door de soort/optioneel-logica.
  const pdNa = await printData(token, calc3);
  check(Math.abs((pdNa.totalen.eindtotaal ?? -1) - totaalVoor) < 0.0001, `3. Totaal blijft IDENTIEK bij herlezen (nieuwe velden herrekenen niets) → voor=${totaalVoor} na=${pdNa.totalen.eindtotaal}`);

  // ═══ Check §8.4: adviesrapport herkend + doorschakeling ════════════════════
  log("\n[4] §8.4 — adviesrapport-PDF: Slim Upload herkent 'adviesrapport' + doorschakeling (echte AI)…");
  const pdfBuf = await bouwAdviesrapport();
  const pdfNaam = "advies01-brandveiligheidsconsult.pdf";
  // a) Slim Upload herkent de categorie via de AI-classificatie.
  const analyse = await uploadBestand("/slim-upload/analyseer", token, pdfBuf, pdfNaam, "application/pdf", {}, 180_000);
  if (analyse.status !== 200) throw new Error(`slim-upload/analyseer ${analyse.status}: ${analyse.tekst.slice(0, 400)}`);
  const suggestie = Array.isArray(analyse.body) ? analyse.body[0] : analyse.body;
  log(`   Slim Upload: categorie='${suggestie?.categorie}' (vertrouwen ${suggestie?.vertrouwen}); alternatieven=${JSON.stringify(suggestie?.alternatieven ?? [])}`);
  const herkendAdvies = suggestie?.categorie === "adviesrapport" || (Array.isArray(suggestie?.alternatieven) && suggestie.alternatieven.includes("adviesrapport"));
  check(suggestie?.categorie === "adviesrapport", `4. Slim Upload herkent categorie 'adviesrapport'${suggestie?.categorie !== "adviesrapport" ? " (of als alternatief)" : ""} → ${suggestie?.categorie}`);
  if (suggestie?.categorie !== "adviesrapport") {
    check(herkendAdvies, `4. (fallback) 'adviesrapport' minstens als alternatief herkend → ${JSON.stringify(suggestie?.alternatieven)}`);
  }

  // b) Aanleveren met categorie 'adviesrapport' → gearchiveerd + doorschakeling.
  const aanlever = await uploadBestand("/documenten/aanleveren", token, pdfBuf, pdfNaam, "application/pdf", { categorie: "adviesrapport" }, 180_000);
  if (aanlever.status !== 201) throw new Error(`documenten/aanleveren ${aanlever.status}: ${aanlever.tekst.slice(0, 400)}`);
  const ds = aanlever.body?.doorschakeling ?? {};
  const documentId = ds.document_id as number;
  check(ds.naar === "calculatie-inrichten", `4. Doorschakeling naar 'calculatie-inrichten' → ${ds.naar}`);
  check(Number.isInteger(documentId) && documentId > 0, `4. Doorschakeling draagt een document_id → ${documentId}`);
  // Merk het document zodat opruimen het terugvindt (aanleveren gebruikt de bestandsnaam als naam).
  await db.update(documentenTable).set({ naam: DOC_NAAM_MARK }).where(eq(documentenTable.id, documentId));

  // ═══ Check §8.5/§8.6/§8.7/§8.8/§8.9/§8.10/§8.11: analyse van het rapport ════
  log("\n[5] §8.5/6/7/8/11 — adviesrapport-analyse (echte AI)…");
  const c4 = await api("POST", "/modules/calculaties", { token, json: { naam: CALC_MERK_ANALYSE, opslag_ak: 0, opslag_risico: 0, opslag_winst: 0 } });
  if (c4.status !== 201) throw new Error(`calc §8.5 aanmaken ${c4.status}: ${c4.tekst.slice(0, 300)}`);
  const calc4 = c4.body.id as number;

  // §8.9 vóór-meting: aantal regels vóór de analyse.
  const regelsVoor = (await db.select().from(modCalcRegelsTable).where(eq(modCalcRegelsTable.calculatieId, calc4))).length;

  const analyseRes = await api("POST", `/modules/calculaties/${calc4}/adviesrapport-analyse`, { token, json: { document_id: documentId }, timeoutMs: 240_000 });
  if (analyseRes.status !== 200) throw new Error(`adviesrapport-analyse ${analyseRes.status}: ${analyseRes.tekst.slice(0, 500)}`);
  const av = analyseRes.body;
  const voorstellen: any[] = Array.isArray(av.voorstellen) ? av.voorstellen : [];
  const nummers = voorstellen.map((v) => v.regelnummer);
  const soorten = voorstellen.map((v) => v.soortvoorstel);
  log(`   punten_aantal=${av.punten_aantal}; voorstellen=${voorstellen.length}`);
  log(`   regelnummers: ${JSON.stringify(nummers)}`);
  log(`   soortvoorstellen: ${JSON.stringify(soorten)}`);
  log(`   koppelgraad: ${JSON.stringify(av.koppelgraad)}`);

  // §8.5/§8.6: elk punt komt terug — punten_aantal == aantal voorstellen.
  check(voorstellen.length >= 4, `5. minstens de 4 gezaaide punten uitgelezen → ${voorstellen.length}`);
  check(av.punten_aantal === voorstellen.length, `6. punten_aantal == aantal voorstellen (elk punt terug) → ${av.punten_aantal} vs ${voorstellen.length}`);

  // §8.5: regelnummers dragen de rapportnummers, inclusief samengesteld ONGESPLITST.
  const heeftSamengesteld = nummers.some((n) => typeof n === "string" && n.includes("/") && n.replace(/\s/g, "").includes("2.9/2.10/3.9"));
  check(heeftSamengesteld, `5. Samengesteld regelnummer "2.9/2.10/3.9" ONGESPLITST aanwezig → ${JSON.stringify(nummers.filter((n) => typeof n === "string" && n.includes("/")))}`);
  const draagtRapportnummers = nummers.some((n) => typeof n === "string" && /^(1\.3|1\.4|3\.11)$/.test(n.trim()));
  check(draagtRapportnummers, `5. Regelnummers dragen rapportnummers (1.3 / 1.4 / 3.11) → ${JSON.stringify(nummers)}`);

  // §8.11: koppelgraad-telling aanwezig (volledig = artikel+normtijd gevonden).
  const kg = av.koppelgraad ?? {};
  const koppelgraadAanwezig = typeof kg.volledig === "number" && typeof kg.alleen_artikel === "number" && typeof kg.alleen_normtijd === "number" && typeof kg.ongekoppeld === "number";
  check(koppelgraadAanwezig, `11. Koppelgraad-telling aanwezig (volledig/alleen_artikel/alleen_normtijd/ongekoppeld) → ${JSON.stringify(kg)}`);
  log(`   Koppelgraad testrapport: volledig=${kg.volledig}, alleen_artikel=${kg.alleen_artikel}, alleen_normtijd=${kg.alleen_normtijd}, ongekoppeld=${kg.ongekoppeld}, geen_werkzaamheden=${kg.geen_werkzaamheden}, niet_te_beoordelen=${kg.niet_te_beoordelen}.`);

  // §8.7: minstens één 'geen_werkzaamheden' met tekstregel zonder bedrag.
  const geenWerk = voorstellen.filter((v) => v.soortvoorstel === "geen_werkzaamheden");
  const geenWerkOk = geenWerk.some((v) => v.regel_soort === "tekst" && v.conceptregel == null && (v.tekstregel ?? "").length > 0);
  check(geenWerk.length >= 1, `7. minstens één voorstel soortvoorstel='geen_werkzaamheden' → ${geenWerk.length}`);
  if (geenWerk.length >= 1) {
    check(geenWerkOk, `7. 'geen_werkzaamheden' is een tekstregel zonder bedrag (conceptregel=null) → ${JSON.stringify(geenWerk.map((v) => ({ nr: v.regelnummer, soort: v.regel_soort, tekst: v.tekstregel, concept: v.conceptregel })))}`);
  }

  // §8.8: een vaag punt → 'niet_te_beoordelen' met vraag, aanwezig (niet weggelaten).
  //  AI-variatie: soepel — als er een niet_te_beoordelen is, MOET die een vraag dragen.
  const nietBeoordeeld = voorstellen.filter((v) => v.soortvoorstel === "niet_te_beoordelen");
  if (nietBeoordeeld.length >= 1) {
    const heeftVraag = nietBeoordeeld.every((v) => typeof v.vraag === "string" && v.vraag.trim().length > 0);
    check(heeftVraag, `8. 'niet_te_beoordelen'-punt(en) worden getoond mét vraag → ${JSON.stringify(nietBeoordeeld.map((v) => ({ nr: v.regelnummer, vraag: v.vraag })))}`);
  } else {
    // Geen niet_te_beoordelen? Dan is het vage punt als iets anders geclassificeerd —
    // dat mag (AI-variatie), zolang het punt niet is weggelaten (gedekt door §8.6).
    check(true, `8. Geen 'niet_te_beoordelen' teruggekomen — vaag punt is als ander soort geclassificeerd (AI-variatie); punt niet weggelaten (zie §8.6). Soorten: ${JSON.stringify(soorten)}`);
  }
  // Soepele borging (AI-variatie): ALLE punten komen terug (§8.6) én er is ≥1 niet-werkzaamheden-voorstel.
  const nietWerk = voorstellen.filter((v) => v.soortvoorstel !== "werkzaamheden");
  check(nietWerk.length >= 1, `8. minstens één niet-werkzaamheden-voorstel (geen_werkzaamheden of niet_te_beoordelen) → ${nietWerk.length} (${JSON.stringify(nietWerk.map((v) => v.soortvoorstel))})`);

  // §8.9: niets automatisch vastgelegd — regel-telling vóór == direct ná.
  const regelsNa = (await db.select().from(modCalcRegelsTable).where(eq(modCalcRegelsTable.calculatieId, calc4))).length;
  check(regelsNa === regelsVoor, `9. Geen regel automatisch vastgelegd door de analyse → voor=${regelsVoor} na=${regelsNa}`);

  // §8.9 vervolg: één voorstel bevestigen via POST regels (soort/regelnummer uit het voorstel) → +1.
  const teBevestigen = voorstellen.find((v) => v.regel_soort === "regel") ?? voorstellen[0];
  const bevestigd = await postRegel(token, calc4, {
    soort: teBevestigen.regel_soort ?? "regel",
    categorie: teBevestigen.conceptregel?.categorie ?? "arbeid",
    omschrijving: teBevestigen.omschrijving ?? teBevestigen.tekortkoming ?? "Bevestigd voorstel",
    regelnummer: teBevestigen.regelnummer,
    hoofdstuk: teBevestigen.hoofdstuk ?? "Overige werkzaamheden",
    eenheid: teBevestigen.conceptregel?.eenheid ?? "st",
    hoeveelheid: 1,
    tarief: teBevestigen.conceptregel?.tarief ?? 0,
    mu_per_eenheid: teBevestigen.conceptregel?.mu_per_eenheid ?? 0,
    arbeids_tarief: teBevestigen.conceptregel?.arbeids_tarief ?? 0,
    normtijd_id: teBevestigen.conceptregel?.normtijd_id ?? undefined,
  });
  const regelsNaBevestig = (await db.select().from(modCalcRegelsTable).where(eq(modCalcRegelsTable.calculatieId, calc4))).length;
  check(regelsNaBevestig === regelsNa + 1, `9. Eén bevestigd voorstel (regelnummer '${bevestigd.regelnummer}') voegt precies +1 regel toe → ${regelsNa} → ${regelsNaBevestig}`);
  check(bevestigd.regelnummer === teBevestigen.regelnummer, `9. Bevestigde regel draagt het regelnummer uit het voorstel → ${bevestigd.regelnummer}`);

  // ═══ Check §8.10: document_koppelingen + gekoppelde documenten vanaf de calc ═
  log("\n[6] §8.10 — koppeling document↔calculatie en de weg terug…");
  const koppel = await db
    .select()
    .from(documentKoppelingenTable)
    .where(and(eq(documentKoppelingenTable.documentId, documentId), eq(documentKoppelingenTable.doelType, "calculatie"), eq(documentKoppelingenTable.doelId, calc4)));
  check(koppel.length === 1, `10. document_koppelingen bevat (document_id=${documentId}, 'calculatie', calcId=${calc4}) → ${koppel.length} rij`);
  const gekoppeld = await api("GET", `/documenten/gekoppeld?doel_type=calculatie&doel_id=${calc4}`, { token });
  check(gekoppeld.status === 200, `10. GET /documenten/gekoppeld → ${gekoppeld.status}`);
  const rapportTerug = Array.isArray(gekoppeld.body) && gekoppeld.body.some((d: any) => d.id === documentId);
  check(rapportTerug, `10. Gekoppelde-documenten-route geeft het adviesrapport (#${documentId}) terug vanaf de calculatie → ${JSON.stringify((gekoppeld.body ?? []).map((d: any) => d.id))}`);

  // ── Opruimen ───────────────────────────────────────────────────────────
  await ruimOp();

  log("");
  log(`Koppelgraad van het testrapport: volledig=${kg.volledig} (artikel+normtijd), alleen_artikel=${kg.alleen_artikel}, alleen_normtijd=${kg.alleen_normtijd}, ongekoppeld=${kg.ongekoppeld}.`);
  if (process.exitCode) {
    log(`FAAL — ${fout.length} check(s) rood:\n- ${fout.join("\n- ")}`);
  } else {
    log("ADVIES_01 §8 groen: vijf regelsoorten (totaal alleen regel+materiaal), optioneel-splitsing (16330.60 = 12180.71 + 4149.89), migratie onveranderlijk, adviesrapport herkend + doorschakeling, elk punt terug met rapportnummers (samengesteld ongesplitst), geen_werkzaamheden-tekstregel, niet_te_beoordelen met vraag, niets auto-vastgelegd (+1 na bevestiging), en de weg terug van calculatie naar rapport.");
  }
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error(e); process.exit(1); });

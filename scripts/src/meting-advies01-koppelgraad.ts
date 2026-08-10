// ADVIES_01 — nulmeting koppelgraad adviesrapport-analyse (taak: meet hoe goed
// de AI adviesrapport-punten aan artikelen en normtijden koppelt).
//
// Er staan in dev- én productiedatabase nog GEEN adviesrapport-documenten en
// GEEN analyses met invoer_soort='adviesrapport'. Deze meting volgt daarom het
// CALC_INVOER_01-precedent (docs/metingen/CALC_INVOER_01_koppelgraad.md):
// een gecontroleerde nulmeting via de ÉCHTE route
// POST /modules/calculaties/:id/adviesrapport-analyse met echte AI, tegen de
// HUIDIGE bibliotheek (geen test-artikelen/-normtijden zaaien!) — precies de
// vraag die René beantwoord wil zien: heeft de bibliotheek genoeg dekking?
//
// Zes realistische FPS-adviesrapporten (naar de stijl van de echte stukken uit
// ADVIES_01: Grundel/Cityflat — genummerde punten, hoofdstukken, tekortkoming +
// geadviseerd herstel) gaan door de analyse. Per rapport wordt de koppelgraad
// uit de respons én uit calc_plak_analyses gelezen; ongekoppelde punten worden
// verzameld voor de conclusie (welke artikelen/normtijden ontbreken).
//
// De meetdata blijft bewust staan (calculaties "ADVIES01-METING …", documenten,
// calc_plak_analyses-rijen) zodat de meting naspeurbaar is; alleen het
// meetaccount wordt gedeactiveerd.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/meting-advies01-koppelgraad.ts
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { authenticator } from "otplib";
import {
  db,
  gebruikersTable,
  modCalcPlakAnalysesTable,
  modCalcHeadersTable,
} from "@workspace/db";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = authenticator.generateSecret();
const WW = `${randomBytes(12).toString("base64url")}Aa1!`;
const EMAIL = "meting-advies01@fps.local";

// Deployment-grendel: nooit tegen productie draaien.
if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: meetscript nooit tegen productie draaien.");
}

// ── HTTP-helpers (patroon uit bewijs-advies01.ts) ───────────────────────────
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
  timeoutMs = 180_000,
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

// ── Rapporten: zes realistische FPS-adviesrapporten ──────────────────────────
// Stijl van de echte stukken: genummerde punten per hoofdstuk, per punt een
// tekortkoming + geadviseerd herstel; sommige punten liggen bij derden, sommige
// zijn vaag. De inhoud dekt het echte FPS-werkveld (doorvoeringen, manchetten,
// brandkleppen, branddeuren, coating, blusleidingen) plus werk dat (nog) niet
// in de bibliotheek zit (kitvoegen, brandwerend glas, detectie, noodverlichting,
// vluchtwegaanduiding, sparingen boven plafonds, deurdrangers, stelposten).
type Rapport = { titel: string; kop: string; hoofdstukken: Array<{ titel: string; punten: string[] }> };

const RAPPORTEN: Rapport[] = [
  {
    titel: "Brandveiligheidsconsult VvE Parkflat Zuidzicht",
    kop: "Opdrachtgever: VvE Parkflat Zuidzicht, Enschede. Inspectie brandcompartimentering woongebouw, 8 bouwlagen.",
    hoofdstukken: [
      { titel: "Hoofdstuk 1 — Bouwkundig", punten: [
        "1.1  Kabeldoorvoeringen bergingsgang. Tekortkoming: meerdere kabelbundels door de compartimentscheiding zijn niet brandwerend afgedicht. Geadviseerd herstel: doorvoeringen brandwerend afdichten met steenwol en brandwerende coating.",
        "1.2  Kunststof rioleringsleiding parkeerkelder. Tekortkoming: PVC-leiding Ø110 doorvoert de wand zonder voorziening. Geadviseerd herstel: brandwerende manchet aanbrengen om de kunststof leiding.",
        "1.3  Sparingen boven systeemplafond entree. Tekortkoming: open sparingen in de scheidingswand boven het plafond. Geadviseerd herstel: sparingen dichtzetten met brandwerend spuitmortel.",
      ] },
      { titel: "Hoofdstuk 2 — Deuren", punten: [
        "2.1  Branddeur trappenhuis begane grond. Tekortkoming: deur sluit niet zelfstandig, dranger defect. Geadviseerd herstel: deurdranger vervangen.",
        "2.2  Deur naar containerruimte. Tekortkoming: houten deur zonder brandwerende kwaliteit in 60-minuten scheiding. Geadviseerd herstel: deur compleet vervangen door gecertificeerde branddeur inclusief kozijn.",
      ] },
      { titel: "Hoofdstuk 3 — Derden / overig", punten: [
        "3.1  Liftmachinekamer. Tekortkoming: doorvoer hydrauliekleiding lift onduidelijk uitgevoerd. Geadviseerd herstel: dit betreft de liftinstallatie; de liftonderhouder dient dit te verzorgen. Geen werkzaamheden aannemer.",
        "3.2  Zolderberging blok C. Tekortkoming: diverse niet nader gespecificeerde aandachtspunten. Geadviseerd herstel: nader onderzoek nodig, omvang niet te bepalen uit dit rapport.",
      ] },
    ],
  },
  {
    titel: "Adviesrapport brandcompartimentering Zorgcentrum De Wieken",
    kop: "Opdrachtgever: Zorggroep Twente, locatie De Wieken, Hengelo. Doorlichting subbrandcompartimenten zorgvleugels.",
    hoofdstukken: [
      { titel: "Hoofdstuk 1 — Installatietechnisch", punten: [
        "1.1  Luchtkanaal keuken. Tekortkoming: ventilatiekanaal doorvoert de compartimentwand zonder brandklep. Geadviseerd herstel: brandwerende klep plaatsen in het kanaal ter plaatse van de scheiding.",
        "1.2  Bestaande brandkleppen vleugel B. Tekortkoming: zes brandkleppen zijn nooit onderhouden of getest. Geadviseerd herstel: onderhoud en functionele test van de brandkleppen uitvoeren.",
        "1.3  Brandmeldinstallatie. Tekortkoming: melders ontbreken in bergingen. Geadviseerd herstel: uitbreiding BMI door erkend branddetectiebedrijf. Geen werkzaamheden aannemer.",
      ] },
      { titel: "Hoofdstuk 2 — Bouwkundig", punten: [
        "2.1  Doorvoeringen boven gangplafonds. Tekortkoming: circa 40 m² scheidingswand boven de plafonds vertoont open doorvoeringen en kieren. Geadviseerd herstel: afdichten met mineraalwol en brandwerende coating.",
        "2.2  Kitvoegen aansluiting wand-dak. Tekortkoming: krimpvoegen niet brandwerend afgekit. Geadviseerd herstel: voegen brandwerend afkitten met geschikte brandwerende kit.",
        "2.3/2.4  Brandwerend glas zusterpost. Tekortkoming: enkelglas in binnenpui van de 30-minuten scheiding. Geadviseerd herstel: vervangen door brandwerend glas EW30 in bestaand kozijn.",
      ] },
    ],
  },
  {
    titel: "Brandveiligheidsinspectie kantoorgebouw Twentepoort",
    kop: "Opdrachtgever: Twentepoort Vastgoed BV, Almelo. Inspectie kantoorgebouw 5 verdiepingen met parkeerkelder.",
    hoofdstukken: [
      { titel: "Hoofdstuk 1 — Constructie", punten: [
        "1.1  Stalen kolommen parkeerkelder. Tekortkoming: acht dragende stalen kolommen zonder brandwerende bescherming (eis 90 minuten). Geadviseerd herstel: kolommen voorzien van brandwerende coating.",
        "1.2  Staalconstructie atrium. Tekortkoming: liggers atrium onbeschermd. Geadviseerd herstel: brandwerende coating aanbrengen op de liggers, circa 120 m².",
      ] },
      { titel: "Hoofdstuk 2 — Blusvoorzieningen", punten: [
        "2.1  Droge blusleiding. Tekortkoming: het gebouw mist een droge blusleiding terwijl de hoogste vloer boven 20 meter ligt. Geadviseerd herstel: droge blusleiding aanleggen over vijf bouwlagen, circa 25 meter.",
        "2.2  Brandslanghaspels. Tekortkoming: haspelkasten ontbreken op verdieping 3 en 4. Geadviseerd herstel: twee brandslangkasten plaatsen en aansluiten.",
        "2.3  Blustoestellen. Tekortkoming: keuring verlopen. Geadviseerd herstel: jaarlijkse keuring door onderhoudsbedrijf blusmiddelen. Geen werkzaamheden aannemer.",
      ] },
      { titel: "Hoofdstuk 3 — Overig", punten: [
        "3.1  Noodverlichting vluchtroutes. Tekortkoming: armaturen defect in trappenhuis west. Geadviseerd herstel: vervangen noodverlichtingsarmaturen door installateur.",
        "3.2  Vluchtwegaanduiding. Tekortkoming: pictogrammen ontbreken bij nooduitgang kelder. Geadviseerd herstel: vluchtwegaanduiding aanbrengen.",
      ] },
    ],
  },
  {
    titel: "Adviesrapport doorvoeringen woontoren Residentie Botermarkt",
    kop: "Opdrachtgever: Woningstichting Sint Joseph, Almelo. Herstelplan brandwerende doorvoeringen na renovatie standleidingen.",
    hoofdstukken: [
      { titel: "Hoofdstuk 1 — Standleidingen", punten: [
        "1.1  Kunststof standleidingen badkamers. Tekortkoming: 84 nieuwe PVC-standleidingen doorvoeren de woningscheidende vloeren zonder voorziening. Geadviseerd herstel: per doorvoer een brandwerende manchet aanbrengen om de kunststof leiding.",
        "1.2  Metalen CV-leidingen schachten. Tekortkoming: ringspleten rond stalen leidingen open. Geadviseerd herstel: ringspleten afdichten met steenwol en brandwerende coating (mineraalwol-systeem).",
        "1.3  Restsparingen leidingschachten. Tekortkoming: na verwijderen oude leidingen resteren open sparingen. Geadviseerd herstel: sparingen afdichten met brandwerend spuitmortel, circa 12 m².",
      ] },
      { titel: "Hoofdstuk 2 — Overig", punten: [
        "2.1  Wandcontactdozen woningscheidende wanden. Tekortkoming: doorlopende inbouwdozen rug-aan-rug. Geadviseerd herstel: brandwerende pads of intumescente omhulling aanbrengen achter de inbouwdozen.",
        "2.2  Registratie. Tekortkoming: geen logboek van doorvoeringen. Geadviseerd herstel: doorvoeringenregistratie met fotobewijs opstellen en bijhouden.",
      ] },
    ],
  },
  {
    titel: "Brandscan sporthal en zwembad De Vijverberg",
    kop: "Opdrachtgever: Gemeente Borne. Quickscan brandveiligheid sportcomplex met horeca.",
    hoofdstukken: [
      { titel: "Hoofdstuk 1 — Bouwkundig", punten: [
        "1.1  Scheiding horeca-sporthal. Tekortkoming: doorvoeringen tapinstallatie en ventilatie niet afgedicht. Geadviseerd herstel: doorvoeringen brandwerend afdichten (mineraalwol met coating).",
        "1.2  Branddeur chlooropslag. Tekortkoming: zelfsluitende deur ontbreekt op de chloorruimte. Geadviseerd herstel: gecertificeerde branddeur met kozijn plaatsen, zelfsluitend.",
        "1.3  Houten dakconstructie boven kleedkamers. Tekortkoming: onbeschermd houten dakbeschot in 30-minuten compartiment. Geadviseerd herstel: nader te bepalen; constructeur dient de opbouw eerst te beoordelen.",
      ] },
      { titel: "Hoofdstuk 2 — Installaties", punten: [
        "2.1  Luchtbehandelingskast zwembad. Tekortkoming: kanalen door compartimentwand zonder kleppen. Geadviseerd herstel: twee brandwerende kleppen plaatsen.",
        "2.2  Ontruimingsinstallatie. Tekortkoming: slow-whoop niet hoorbaar in doucheruimten. Geadviseerd herstel: uitbreiding door het branddetectiebedrijf. Geen werkzaamheden aannemer.",
      ] },
    ],
  },
  {
    titel: "Herinspectie brandcompartimentering basisschool De Regenboog",
    kop: "Opdrachtgever: Stichting Primair Onderwijs Oost, Oldenzaal. Herinspectie na eerdere afkeuring compartimentering.",
    hoofdstukken: [
      { titel: "Hoofdstuk 1 — Restpunten vorige inspectie", punten: [
        "1.4  Doorvoeringen technieklokaal. Tekortkoming: eerder afgekeurde kabeldoorvoeringen nog altijd open. Geadviseerd herstel: brandwerend afdichten met steenwol en coating, circa 6 m².",
        "1.7  Deur aula. Tekortkoming: dranger levert onvoldoende sluitkracht. Geadviseerd herstel: deurdranger vervangen door zwaarder type.",
        "1.9  Manchetten toiletgroep. Tekortkoming: twee HWA/riool-doorvoeren zonder manchet. Geadviseerd herstel: brandwerende manchetten aanbrengen.",
      ] },
      { titel: "Hoofdstuk 2 — Nieuwe bevindingen", punten: [
        "2.1  Brandwerende beglazing directiekamer. Tekortkoming: gewoon glas in scheiding naar vluchtgang. Geadviseerd herstel: vervangen door brandwerend glas in bestaand stalen kozijn.",
        "2.3/2.5  Kruipruimteluiken. Tekortkoming: situatie rond luiken en leidingwerk in de kruipruimte onoverzichtelijk. Geadviseerd herstel: nader onderzoek; omvang op basis van dit rapport niet te bepalen.",
        "2.6  Stelpost herstel plafond speellokaal. Tekortkoming: beschadigd brandwerend plafond. Geadviseerd herstel: stelpost herstellen plafond € 1.250,- excl. btw op te nemen.",
      ] },
    ],
  },
];

async function bouwPdf(rapport: Rapport): Promise<Buffer> {
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
      doc.fontSize(18).text(`${rapport.titel} — adviesrapport`);
      doc.moveDown(0.5);
      doc.fontSize(11).text(rapport.kop + " Dit rapport bevat genummerde bevindingen met per punt een geconstateerde tekortkoming en een geadviseerd herstel.");
      doc.moveDown(1);
      for (const h of rapport.hoofdstukken) {
        doc.fontSize(14).text(h.titel);
        doc.moveDown(0.4);
        for (const p of h.punten) {
          doc.fontSize(11).text(p);
          doc.moveDown(0.4);
        }
        doc.moveDown(0.6);
      }
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function main(): Promise<void> {
  // Eerder meetaccount opruimen zodat de run idempotent start.
  await db.delete(gebruikersTable).where(eq(gebruikersTable.email, EMAIL));
  await db.insert(gebruikersTable).values({
    naam: "Meting ADVIES_01",
    email: EMAIL,
    rol: "hoofdbeheerder",
    wachtwoord: await bcrypt.hash(WW, 10),
    totpSecret: TOTP,
    tweeFactorIngeschakeld: true,
    actief: true,
    functietitels: ["Calculatie"],
    bevoegdheden: { calculaties: 4, bibliotheek: 3 },
  } as typeof gebruikersTable.$inferInsert);

  const login = await api("POST", "/auth/mobile/login", { json: { email: EMAIL, wachtwoord: WW, code: authenticator.generate(TOTP) } });
  if (login.status !== 200) throw new Error(`login faalde: ${login.status} ${login.tekst}`);
  const token = login.body.token as string;

  const totalen = { punten: 0, werkzaamheden: 0, volledig: 0, alleen_artikel: 0, alleen_normtijd: 0, ongekoppeld: 0, geen_werkzaamheden: 0, niet_te_beoordelen: 0 };
  const perRapport: Array<{ titel: string; calcId: number; docId: number; kg: any; punten: number }> = [];
  const ongekoppeldePunten: Array<{ rapport: string; nummer: string; omschrijving: string }> = [];
  const alleenNormtijdPunten: Array<{ rapport: string; nummer: string; omschrijving: string; normtijd: string }> = [];

  for (let i = 0; i < RAPPORTEN.length; i++) {
    const rapport = RAPPORTEN[i]!;
    console.log(`\n[${i + 1}/${RAPPORTEN.length}] ${rapport.titel}`);
    const pdf = await bouwPdf(rapport);
    const aanlever = await uploadBestand("/documenten/aanleveren", token, pdf, `ADVIES01-METING-${i + 1}.pdf`, "application/pdf", { categorie: "adviesrapport" });
    if (aanlever.status !== 201) throw new Error(`aanleveren ${aanlever.status}: ${aanlever.tekst.slice(0, 300)}`);
    const docId = aanlever.body?.doorschakeling?.document_id as number;
    if (!Number.isInteger(docId)) throw new Error(`geen document_id in doorschakeling: ${aanlever.tekst.slice(0, 300)}`);

    const c = await api("POST", "/modules/calculaties", { token, json: { naam: `ADVIES01-METING ${i + 1} — ${rapport.titel.slice(0, 60)}` } });
    if (c.status !== 201) throw new Error(`calc aanmaken ${c.status}: ${c.tekst.slice(0, 300)}`);
    const calcId = c.body.id as number;

    const res = await api("POST", `/modules/calculaties/${calcId}/adviesrapport-analyse`, { token, json: { document_id: docId }, timeoutMs: 300_000 });
    if (res.status !== 200) throw new Error(`analyse ${res.status}: ${res.tekst.slice(0, 500)}`);
    const kg = res.body.koppelgraad;
    const puntenAantal = res.body.punten_aantal as number;
    console.log(`   punten=${puntenAantal} koppelgraad=${JSON.stringify(kg)}${res.body.waarschuwing ? ` waarschuwing="${res.body.waarschuwing}"` : ""}`);

    totalen.punten += puntenAantal;
    for (const k of ["werkzaamheden", "volledig", "alleen_artikel", "alleen_normtijd", "ongekoppeld", "geen_werkzaamheden", "niet_te_beoordelen"] as const) {
      totalen[k] += Number(kg?.[k] ?? 0);
    }
    for (const v of res.body.voorstellen ?? []) {
      if (v.uitkomst === "ongekoppeld") ongekoppeldePunten.push({ rapport: rapport.titel, nummer: v.nummer ?? "?", omschrijving: v.omschrijving ?? v.punt_tekst ?? "" });
      if (v.uitkomst === "alleen_normtijd") alleenNormtijdPunten.push({ rapport: rapport.titel, nummer: v.nummer ?? "?", omschrijving: v.omschrijving ?? "", normtijd: v.normtijd ? `${v.normtijd.code} ${v.normtijd.omschrijving}` : "?" });
    }
    perRapport.push({ titel: rapport.titel, calcId, docId, kg, punten: puntenAantal });
  }

  // Kruiscontrole: de meting is ook terug te lezen uit calc_plak_analyses.
  const calcIds = perRapport.map((r) => r.calcId);
  const rijen = await db.select().from(modCalcPlakAnalysesTable).where(inArray(modCalcPlakAnalysesTable.calculatieId, calcIds));
  console.log(`\ncalc_plak_analyses (invoer_soort=adviesrapport): ${rijen.filter((r) => r.invoerSoort === "adviesrapport").length} rijen voor ${calcIds.length} meetcalculaties.`);

  console.log("\n══ TOTALEN ══");
  console.log(JSON.stringify(totalen, null, 2));
  console.log("\n── Punten met alleen normtijd (artikel/materiaal ontbreekt) ──");
  for (const p of alleenNormtijdPunten) console.log(`  [${p.nummer}] ${p.omschrijving} → normtijd ${p.normtijd} (${p.rapport})`);
  console.log("\n── Ongekoppelde punten (geen artikel én geen normtijd) ──");
  for (const p of ongekoppeldePunten) console.log(`  [${p.nummer}] ${p.omschrijving} (${p.rapport})`);
  console.log("\n── Per rapport ──");
  for (const r of perRapport) console.log(`  calc #${r.calcId} doc #${r.docId} punten=${r.punten} ${JSON.stringify(r.kg)} — ${r.titel}`);

  // Meetaccount deactiveren; meetdata blijft staan (naspeurbaar, ADVIES01-METING).
  await db.update(gebruikersTable).set({ actief: false }).where(eq(gebruikersTable.email, EMAIL));
  console.log("\nMeetaccount gedeactiveerd; meetcalculaties/documenten/analyses blijven staan (merk: ADVIES01-METING).");
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error(e); process.exit(1); });

// INKOOP_AI_01 — gedragsbewijs voor de eigen-cijfersblokken van inkoop en
// werkbegroting (inkoopEigenCijfers.ts).
//
// Seedt een herkenbare dataset (alles gemarkeerd met BEWIJS_IAI01, opgeruimd in
// finally), draait de builders twee keer en toetst de acceptatiepunten:
//  1. verwachte prijs aantoonbaar uit eigen betalingen, met aantal waarnemingen;
//  2. te weinig historie → ONBEKEND, geen geschat bedrag;
//  3. geen leverancierskeuze — meerdere leveranciers mét prijs getoond;
//  4. prijsstijging bij dezelfde leverancier gesignaleerd, met bedragen en data;
//  5. inkoopmediaan boven calculatieprijs → signaal richting calculatiekant;
//  6. werkbegroting: begrote uren/kosten afgezet tegen werkelijk (nacalculaties);
//  + vervuilingscases: conceptbonnen, verkoopfacturen en afgekeurde
//    inkoopfacturen tellen niet mee.
//
// Draaien: S3_BUCKET=dummy pnpm --filter @workspace/scripts exec tsx src/bewijs-inkoop-eigen-cijfers.ts

import "./lib/prodGuard";
import {
  db,
  eenheidsprijzenTable,
  facturenTable,
  factuurRegelsTable,
  fieNacalculatiesTable,
  inkoopbonnenTable,
  inkoopbonRegelsTable,
  inkoopplannenTable,
  opdrachtenTable,
} from "@workspace/db";
import { inArray } from "drizzle-orm";

const MARK = "BEWIJS_IAI01";
let geslaagd = 0;
let gefaald = 0;
function check(naam: string, conditie: boolean): void {
  if (conditie) { geslaagd++; console.log(`✅ ${naam}`); }
  else { gefaald++; console.log(`❌ ${naam}`); }
}

async function main(): Promise<void> {
  const opdrachtIds: number[] = [];
  const bonIds: number[] = [];
  const factuurIds: number[] = [];
  const nacalcIds: number[] = [];
  const epIds: number[] = [];

  try {
    // Runtime-import buiten het scripts-project (rootDir) — bewust niet statisch getypeerd.
    const apiLib = "../../artifacts/api-server/src/lib/";
    const { haalInkoopHistorie, bouwInkoopEigenCijfersContext, bouwWerkbegrotingEigenCijfersContext, leveranciersOpsomming } =
      await import(apiLib + "inkoopEigenCijfers");

    // ── Seed: opdracht als kapstok voor bonnen ───────────────────────────────
    const [opdracht] = await db.insert(opdrachtenTable).values({
      titel: `${MARK} opdracht`, status: "concept",
    }).returning();
    opdrachtIds.push(opdracht!.id);
    const [plan] = await db.insert(inkoopplannenTable).values({ opdrachtId: opdracht!.id, status: "concept" }).returning();

    const KIT = `${MARK} brandwerende kit 310ml`;
    const MANCHET = `${MARK} maatwerk manchet DN200`;

    // Bonnen: Leverancier A besteld (2x, met prijsstijging), plus een CONCEPT-bon
    // met een gifprijs die nooit mee mag tellen.
    const maakBon = async (leverancier: string, status: string, prijs: number): Promise<void> => {
      const [bon] = await db.insert(inkoopbonnenTable).values({
        inkoopplanId: plan!.id, opdrachtId: opdracht!.id, leverancier, status,
      }).returning();
      bonIds.push(bon!.id);
      await db.insert(inkoopbonRegelsTable).values({
        inkoopbonId: bon!.id, omschrijving: KIT, hoeveelheid: 10, eenheid: "st", prijs, totaal: prijs * 10,
      });
    };
    await maakBon(`${MARK} Leverancier A`, "besteld", 4.2);
    await maakBon(`${MARK} Leverancier A`, "geleverd", 4.6); // zelfde leverancier, later, duurder → stijging
    await maakBon(`${MARK} Leverancier A`, "concept", 999.0); // mag NOOIT meetellen

    // Facturen: Leverancier B via verwerkte inkoopfactuur; plus verkoopfactuur
    // en afgekeurde inkoopfactuur als vervuiling.
    const maakFactuur = async (type: string, status: string, relatienaam: string, omschrijving: string, prijs: number): Promise<void> => {
      const [f] = await db.insert(facturenTable).values({
        type, factuurnummer: `${MARK}-${factuurIds.length + 1}`, relatienaam, status,
      }).returning();
      factuurIds.push(f!.id);
      await db.insert(factuurRegelsTable).values({
        factuurId: f!.id, omschrijving, eenheid: "st", hoeveelheid: 5, stukprijs: String(prijs), bron: "handmatig",
      });
    };
    await maakFactuur("inkoop", "verwerkt", `${MARK} Leverancier B`, KIT, 4.4);
    await maakFactuur("verkoop", "verwerkt", `${MARK} Klant`, KIT, 777.77);   // verkoop: uitsluiten
    await maakFactuur("inkoop", "afgekeurd", `${MARK} Leverancier C`, KIT, 888.88); // afgekeurd: uitsluiten
    await maakFactuur("inkoop", "verwerkt", `${MARK} Leverancier B`, MANCHET, 61.0); // 1 waarneming: te weinig

    // Nacalculaties: 3x doorvoeringen (genoeg), 1x deuren (te weinig).
    for (const afw of [12, 18, 25]) {
      const [n] = await db.insert(fieNacalculatiesTable).values({
        opdrachtId: opdracht!.id, werktype: `${MARK}-doorvoeringen`,
        calcArbeidUren: 100, werkelijkArbeidUren: 100 + afw, afwijkingPctArbeid: afw,
        calcMateriaalBedrag: 1000, werkelijkMateriaalBedrag: 1000 + afw * 10, afwijkingPctMateriaal: afw / 2,
        afgesloten: true,
      }).returning();
      nacalcIds.push(n!.id);
    }
    const [n1] = await db.insert(fieNacalculatiesTable).values({
      opdrachtId: opdracht!.id, werktype: `${MARK}-deuren`, afwijkingPctArbeid: 40, afwijkingPctMateriaal: 5, afgesloten: true,
    }).returning();
    nacalcIds.push(n1!.id);
    // Niet-afgesloten nacalculatie met gifwaarde: mag NOOIT meetellen (fail-closed).
    const [n2] = await db.insert(fieNacalculatiesTable).values({
      opdrachtId: opdracht!.id, werktype: `${MARK}-doorvoeringen`, afwijkingPctArbeid: 500, afwijkingPctMateriaal: 500, afgesloten: false,
    }).returning();
    nacalcIds.push(n2!.id);

    // Eenheidsprijs met werkelijk gemeten uren die structureel afwijken van de normtijd.
    const [ep] = await db.insert(eenheidsprijzenTable).values({
      code: `${MARK}-DV-01`, omschrijving: `${MARK} doorvoering afdichten`, categorie: "doorvoeringen",
      eenheid: "st", materiaalcomponent: 12, arbeidscomponent: 26, normtijd: 0.4, gemWerkelijkUren: 0.55,
      kostprijs: 30, verkoopprijs: 38, marge: 21,
    }).returning();
    epIds.push(ep!.id);

    // ── Builders draaien (2x voor determinisme) ─────────────────────────────
    const items = [
      { omschrijving: KIT, eenheid: "st", calcPrijs: 4.0 },       // mediaan 4.40 > calc 4.00 → blok D
      { omschrijving: MANCHET, eenheid: "st", calcPrijs: 58.0 },  // 1 waarneming → onbekend
    ];
    const hist1 = await haalInkoopHistorie(items);
    const hist2 = await haalInkoopHistorie(items);
    const ctx1: string = bouwInkoopEigenCijfersContext(items, hist1);
    const ctx2: string = bouwInkoopEigenCijfersContext(items, hist2);
    const wbRegels = [{ omschrijving: `${MARK} doorvoering afdichten`, eenheid: "st" }];
    const wb1: string = await bouwWerkbegrotingEigenCijfersContext(wbRegels);
    const wb2: string = await bouwWerkbegrotingEigenCijfersContext(wbRegels);

    console.log("── INKOOPCONTEXT ──\n" + ctx1 + "\n\n── WERKBEGROTINGSCONTEXT ──\n" + wb1 + "\n");
    console.log("──────────────────────────────");

    const kitHist = hist1.get(`${KIT.toLowerCase()}|st`);

    check("Determinisme: twee runs identiek (inkoop + werkbegroting)", ctx1 === ctx2 && wb1 === wb2);
    check("1. Verwachte prijs uit eigen betalingen: mediaan € 4.40 over 3 waarnemingen (bon + factuur)",
      kitHist?.mediaan === 4.4 && kitHist?.aantal === 3 && ctx1.includes("mediaan € 4.40") && ctx1.includes("3 waarnemingen") && ctx1.includes("inkoopbon + inkoopfactuur"));
    check("2. Te weinig historie → ONBEKEND, geen geschat bedrag",
      hist1.get(`${MANCHET.toLowerCase()}|st`)?.mediaan === null && ctx1.includes("Verwachte inkoopprijs: ONBEKEND"));
    check("3. Geen leverancierskeuze: beide leveranciers getoond mét prijs",
      ctx1.includes("Leverancier A (mediaan € 4.40, 2x") && ctx1.includes("Leverancier B (mediaan € 4.40, 1x") && ctx1.includes("kies er NIET één"));
    check("3b. leveranciersOpsomming levert opsomming voor aanbevolen_leverancier-veld",
      (leveranciersOpsomming(kitHist!) as string).includes("Leverancier A") && (leveranciersOpsomming(kitHist!) as string).includes("Leverancier B"));
    check("4. Prijsstijging zelfde leverancier gesignaleerd met bedragen en data",
      ctx1.includes("Leverancier A: € 4.20 (") && ctx1.includes("→ € 4.60 (") && ctx1.includes("+9.5%"));
    check("5. Inkoopmediaan boven calculatieprijs → signaal richting calculatiekant",
      ctx1.includes("BOVEN de calculatieprijs € 4.00") && ctx1.includes("signaal terug naar de calculatiekant"));
    check("Vervuiling: conceptbon (999), verkoopfactuur (777.77) en afgekeurde factuur (888.88) tellen niet mee",
      !ctx1.includes("999") && !ctx1.includes("777.77") && !ctx1.includes("888.88"));
    check("6. Werkbegroting: werkelijk besteed per werktype met mediaan en aantal (niet-afgesloten nacalculatie uitgesloten)",
      wb1.includes("doorvoeringen\" (3 afgeronde opdrachten") && wb1.includes("mediaan +18.0%") && !wb1.includes("500"));
    check("6b. Werktype met te weinig nacalculaties → melding, geen advies",
      wb1.includes("deuren\": 1 afgeronde opdracht(en)") && wb1.includes("te weinig"));
    check("Normtijd vs werkelijk: structurele afwijking gemeld en gekoppeld aan begroting",
      wb1.includes("normtijd 0.40 u vs werkelijk gemeten 0.55 u = +37.5%") && wb1.includes("DEZE POST ZIT IN DEZE BEGROTING"));

    console.log("──────────────────────────────");
    console.log(gefaald === 0 ? "ALLE CHECKS GESLAAGD" : `${gefaald} CHECK(S) GEFAALD`);
    process.exitCode = gefaald === 0 ? 0 : 1;
  } finally {
    if (bonIds.length) await db.delete(inkoopbonnenTable).where(inArray(inkoopbonnenTable.id, bonIds));
    if (factuurIds.length) await db.delete(facturenTable).where(inArray(facturenTable.id, factuurIds));
    if (nacalcIds.length) await db.delete(fieNacalculatiesTable).where(inArray(fieNacalculatiesTable.id, nacalcIds));
    if (epIds.length) await db.delete(eenheidsprijzenTable).where(inArray(eenheidsprijzenTable.id, epIds));
    if (opdrachtIds.length) await db.delete(opdrachtenTable).where(inArray(opdrachtenTable.id, opdrachtIds));
    process.exit(process.exitCode ?? 0);
  }
}
void main();

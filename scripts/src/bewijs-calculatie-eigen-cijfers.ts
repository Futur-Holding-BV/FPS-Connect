// Gedragsbewijs CALCULATIE_AI_01 — "Adviseren op basis van je eigen cijfers".
//
// Seedt een realistische situatie in de dev-database en bewijst dat
// bouwEigenCijfersContext() de vier blokken correct en deterministisch bouwt:
//   1. Blok A noemt de eigen eenheidsprijs met afwijking in euro's én procenten.
//   2. Een niet-koppelbare regel wordt expliciet gemeld (geen gok).
//   3. Blok B geeft mediaan + aantal waarnemingen bij ≥5 waarnemingen.
//   4. Bij <5 waarnemingen wordt géén historisch advies meegegeven, met melding.
//   5. Blok C noemt de werkelijk betaalde mediaan alleen bij aantoonbare koppeling.
//   6. Twee runs geven byte-voor-byte dezelfde tekst (determinisme).
//
// Draaien: S3_BUCKET=dummy pnpm --filter @workspace/scripts exec tsx src/bewijs-calculatie-eigen-cijfers.ts
// Alles wordt in finally opgeruimd.

import {
  db,
  eenheidsprijzenTable,
  factuurRegelsTable,
  facturenTable,
  modCalcHeadersTable,
  modCalcNormtijdenTable,
  modCalcRegelsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const MARK = "BEWIJS_CAI01";
let fouten = 0;
function check(naam: string, conditie: boolean, detail?: string): void {
  console.log(`${conditie ? "✅" : "❌"} ${naam}${detail ? ` — ${detail}` : ""}`);
  if (!conditie) fouten++;
}

async function main(): Promise<void> {
  const headerIds: number[] = [];
  const epIds: number[] = [];
  const normtijdIds: number[] = [];
  const factuurIds: number[] = [];

  try {
    // ── Seed: eenheidsprijzenbibliotheek ─────────────────────────────────
    const [epDoorvoering] = await db.insert(eenheidsprijzenTable).values({
      code: `${MARK}-DV-01`, omschrijving: `${MARK} brandwerende doorvoering afdichten`, categorie: "doorvoeringen",
      eenheid: "st", materiaalcomponent: 12, arbeidscomponent: 26, normtijd: 0.4, kostprijs: 30, verkoopprijs: 38, marge: 21,
    }).returning();
    epIds.push(epDoorvoering!.id);

    const [normtijd] = await db.insert(modCalcNormtijdenTable).values({
      code: `${MARK}-MAN-60`, omschrijving: `${MARK} manchet aanbrengen`, eenheid: "st", urenPerEenheid: 0.5,
    }).returning();
    normtijdIds.push(normtijd!.id);
    const [epManchet] = await db.insert(eenheidsprijzenTable).values({
      code: `${MARK}-MAN-60`, omschrijving: `${MARK} manchet 60 min (andere omschrijving dan regel)`, categorie: "manchetten",
      eenheid: "st", materiaalcomponent: 20, arbeidscomponent: 30, normtijd: 0.5, kostprijs: 42, verkoopprijs: 55, marge: 24,
    }).returning();
    epIds.push(epManchet!.id);

    // ── Seed: 6 eerdere calculaties met prijshistorie ────────────────────
    const histPrijzen = [36, 37, 39, 40, 41, 44]; // mediaan (39+40)/2 = 39.50
    for (const p of histPrijzen) {
      const [h] = await db.insert(modCalcHeadersTable).values({
        naam: `${MARK} historie €${p}`, status: "afgerond",
        opslagAk: 12, opslagAbk: 8, opslagRisico: 4, opslagWinst: 9,
      }).returning();
      headerIds.push(h!.id);
      await db.insert(modCalcRegelsTable).values({
        calculatieId: h!.id, categorie: "materiaal", omschrijving: `${MARK} brandwerende doorvoering afdichten`,
        eenheid: "st", hoeveelheid: 10, tarief: p, muPerEenheid: 0, arbeidsTarief: 0,
      });
    }
    // Regelsoort met te weinig geschiedenis (2 waarnemingen) in bestaande headers
    for (const p of [15, 18]) {
      await db.insert(modCalcRegelsTable).values({
        calculatieId: headerIds[0]!, categorie: "arbeid", omschrijving: `${MARK} kitvoeg aanbrengen`,
        eenheid: "m1", hoeveelheid: 5, tarief: p, muPerEenheid: 0, arbeidsTarief: 0,
      });
    }

    // Dubbele eenheidsprijs → ambigue match moet fail-closed gemeld worden
    for (const v of [70, 75]) {
      const [dup] = await db.insert(eenheidsprijzenTable).values({
        code: `${MARK}-DUP-${v}`, omschrijving: `${MARK} dubbele bibliotheekregel`, categorie: "overig",
        eenheid: "st", materiaalcomponent: 10, arbeidscomponent: 10, normtijd: 0.2, kostprijs: 20, verkoopprijs: v, marge: 10,
      }).returning();
      epIds.push(dup!.id);
    }

    // ── Seed: werkelijk betaalde inkoopprijs (factuurregel) ──────────────
    const [factuur] = await db.insert(facturenTable).values({
      type: "inkoop", factuurnummer: `${MARK}-F1`, relatienaam: `${MARK} Leverancier BV`, status: "verwerkt",
    }).returning();
    factuurIds.push(factuur!.id);
    for (const p of [33.5, 34.0, 35.25]) {
      await db.insert(factuurRegelsTable).values({
        factuurId: factuur!.id, omschrijving: `${MARK} brandwerende doorvoering afdichten`,
        eenheid: "st", hoeveelheid: 20, stukprijs: String(p), bron: "handmatig",
      });
    }

    // Verkoopfactuur en afgekeurde inkoopfactuur — mogen Blok C NIET beïnvloeden
    const [verkoop] = await db.insert(facturenTable).values({ type: "verkoop", factuurnummer: `${MARK}-V1`, relatienaam: `${MARK} Klant BV`, status: "verwerkt" }).returning();
    const [afgekeurd] = await db.insert(facturenTable).values({ type: "inkoop", factuurnummer: `${MARK}-A1`, relatienaam: `${MARK} Leverancier BV`, status: "afgekeurd" }).returning();
    factuurIds.push(verkoop!.id, afgekeurd!.id);
    for (const fid of [verkoop!.id, afgekeurd!.id]) {
      await db.insert(factuurRegelsTable).values({
        factuurId: fid, omschrijving: `${MARK} brandwerende doorvoering afdichten`,
        eenheid: "st", hoeveelheid: 1, stukprijs: "999.99", bron: "handmatig",
      });
    }

    // ── Seed: de huidige calculatie met 3 regels ─────────────────────────
    const [huidige] = await db.insert(modCalcHeadersTable).values({
      naam: `${MARK} huidige calculatie`, status: "concept",
      opslagAk: 15, opslagAbk: 10, opslagRisico: 5, opslagWinst: 10,
    }).returning();
    headerIds.push(huidige!.id);
    await db.insert(modCalcRegelsTable).values([
      // 1: match op omschrijving+eenheid; €47 vs norm €38 → +€9 (+23,7%)
      { calculatieId: huidige!.id, categorie: "materiaal", omschrijving: `${MARK} brandwerende doorvoering afdichten`, eenheid: "st", hoeveelheid: 12, tarief: 47, muPerEenheid: 0, arbeidsTarief: 0, volgorde: 1 },
      // 2: match via normtijd-code (omschrijving wijkt af van bibliotheek)
      { calculatieId: huidige!.id, categorie: "materiaal", omschrijving: `${MARK} manchet plaatsen rond kunststof leiding`, eenheid: "st", hoeveelheid: 4, tarief: 30, muPerEenheid: 0.5, arbeidsTarief: 50, normtijdId: normtijd!.id, volgorde: 2 },
      // 3: nergens koppelbaar
      { calculatieId: huidige!.id, categorie: "arbeid", omschrijving: `${MARK} volstrekt uniek specialistisch werk`, eenheid: "uur", hoeveelheid: 8, tarief: 65, muPerEenheid: 0, arbeidsTarief: 0, volgorde: 3 },
      // 5: ambigue bibliotheekmatch (twee eenheidsprijzen met zelfde omschrijving+eenheid)
      { calculatieId: huidige!.id, categorie: "materiaal", omschrijving: `${MARK} dubbele bibliotheekregel`, eenheid: "st", hoeveelheid: 2, tarief: 72, muPerEenheid: 0, arbeidsTarief: 0, volgorde: 5 },
      // 4: regelsoort met slechts 2 historische waarnemingen
      { calculatieId: huidige!.id, categorie: "arbeid", omschrijving: `${MARK} kitvoeg aanbrengen`, eenheid: "m1", hoeveelheid: 6, tarief: 22, muPerEenheid: 0, arbeidsTarief: 0, volgorde: 4 },
    ]);

    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, huidige!.id));
    const regels = await db.select().from(modCalcRegelsTable).where(eq(modCalcRegelsTable.calculatieId, huidige!.id));

    // Runtime-import buiten het scripts-project (rootDir) — bewust niet statisch getypeerd.
    const apiLib = "../../artifacts/api-server/src/lib/";
    const { bouwEigenCijfersContext } = await import(apiLib + "calculatieEigenCijfers");
    const run1: string = await bouwEigenCijfersContext(header!, regels);
    const run2: string = await bouwEigenCijfersContext(header!, regels);
    console.log("──── gegenereerde context ────\n" + run1 + "\n──────────────────────────────");

    // ── Assersies ────────────────────────────────────────────────────────
    check("Determinisme: twee runs identiek", run1 === run2);
    check("Blok A: afwijking in euro's én procenten t.o.v. eigen eenheidsprijs",
      run1.includes("€ 47.00/eenheid vs eigen eenheidsprijs BEWIJS_CAI01-DV-01 € 38.00") && run1.includes("€ 9.00 (+23.7%)"));
    check("Blok A: match via normtijd-code ondanks afwijkende omschrijving",
      run1.includes("manchet plaatsen rond kunststof leiding") && run1.includes(`${MARK}-MAN-60 € 55.00`));
    check("Blok A: niet-koppelbare regel expliciet gemeld",
      run1.includes(`"${MARK} volstrekt uniek specialistisch werk" (uur): geen eenheidsprijs gevonden`));
    check("Blok B: mediaan + aantal waarnemingen bij ≥5",
      run1.includes("mediaan € 39.50") && run1.includes("6 waarnemingen"));
    check("Blok B: <5 waarnemingen → geen historisch advies, wél melding",
      run1.includes(`kitvoeg aanbrengen" (m1): 2 eerdere waarneming(en) — te weinig geschiedenis`));
    check("Blok C: werkelijk betaalde mediaan alleen bij aantoonbare koppeling",
      run1.includes("werkelijk betaald (inkoopfacturen) mediaan € 34.00 — 3 factuurregel(s)")
      && !run1.includes(`volstrekt uniek specialistisch werk" (uur): werkelijk betaald`));
    check("Blok D: eigen opslagenpraktijk met medianen over eerdere calculaties",
      run1.includes("AK: FPS-praktijk mediaan 12.0%") && run1.includes("over 6 eerdere calculaties"));
    check("Blok C: verkoop- en afgekeurde facturen tellen niet mee (mediaan blijft € 34.00, geen € 999.99)",
      run1.includes("mediaan € 34.00 — 3 factuurregel(s)") && !run1.includes("999.99"));
    check("Blok A: ambigue bibliotheekmatch fail-closed gemeld",
      run1.includes(`dubbele bibliotheekregel" (st): meerdere eenheidsprijzen`));
    check("Geen vaste 30-45%-norm meer in de prompt", !(await import(apiLib + "aiPrompts")).CALCULATIE_ANALYSE_BASE_PROMPT.tekst.includes("30-45%"));

    console.log(fouten === 0 ? "\nALLE CHECKS GESLAAGD" : `\n${fouten} CHECK(S) GEFAALD`);
    if (fouten > 0) process.exitCode = 1;
  } finally {
    // ── Opruimen ─────────────────────────────────────────────────────────
    if (factuurIds.length) await db.delete(facturenTable).where(inArray(facturenTable.id, factuurIds)); // regels cascaden
    if (headerIds.length) await db.delete(modCalcHeadersTable).where(inArray(modCalcHeadersTable.id, headerIds));
    if (epIds.length) await db.delete(eenheidsprijzenTable).where(inArray(eenheidsprijzenTable.id, epIds));
    if (normtijdIds.length) await db.delete(modCalcNormtijdenTable).where(inArray(modCalcNormtijdenTable.id, normtijdIds));
    process.exit(fouten === 0 ? 0 : 1);
  }
}

void main();

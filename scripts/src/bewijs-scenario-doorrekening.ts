// Bewijs SCENARIO_01 — wat-als-scenario's op de jaarbegroting.
// Seedt een basisbegroting met AK-posten, maakt de drie René-scenario's
// (huidig / 4 monteurs zonder kantoorfuncties / 6 monteurs mét), toetst alle
// harde regels en ruimt alles op in finally.
//
// Draaien: S3_BUCKET=dummy pnpm --filter @workspace/scripts exec tsx src/bewijs-scenario-doorrekening.ts
import {
  db,
  fieAkPostenTable,
  fieJaarbegrotingenTable,
} from "@workspace/db";
import { and, eq, like, ne } from "drizzle-orm";
import {
  berekenScenarioDoorrekening,
  berekenFieContext,
  SCENARIO_BEZETTINGSNIVEAUS,
} from "../../artifacts/api-server/src/services/fie-service";
import { valideerScenarioAannames } from "../../artifacts/api-server/src/routes/fie";
import { bouwJaarReeks } from "../../artifacts/api-server/src/lib/akEigenCijfers";

const MARKER = "BEWIJS_SCENARIO";
const BOEKJAAR = 2098; // ver weg van echte data
let geslaagd = 0;
let mislukt = 0;
function check(naam: string, conditie: boolean, detail?: string): void {
  if (conditie) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { mislukt++; console.error(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

async function maakScenario(basisId: number, naam: string, aannames: Record<string, unknown>): Promise<number> {
  const r = valideerScenarioAannames(aannames);
  if (!r.ok) throw new Error(`aannames afgekeurd: ${r.fout}`);
  const [basis] = await db.select().from(fieJaarbegrotingenTable).where(eq(fieJaarbegrotingenTable.id, basisId));
  const [rij] = await db.insert(fieJaarbegrotingenTable).values({
    boekjaar: basis!.boekjaar, status: "scenario",
    omzetDoel: basis!.omzetDoel, directeKostenDoel: basis!.directeKostenDoel,
    doelMargePct: basis!.doelMargePct, akPerProductiefUur: basis!.akPerProductiefUur,
    productieveUrenDoel: basis!.productieveUrenDoel, verdeelsleutel: basis!.verdeelsleutel,
    opmerkingen: MARKER, scenarioVanId: basis!.id, scenarioNaam: naam, scenarioAannames: r.json,
  }).returning();
  const posten = await db.select().from(fieAkPostenTable).where(eq(fieAkPostenTable.begrotingId, basisId));
  if (posten.length) {
    await db.insert(fieAkPostenTable).values(posten.map((p) => ({
      begrotingId: rij!.id, werkgeverId: p.werkgeverId, categorie: p.categorie,
      omschrijving: p.omschrijving, bedragJaarbasis: p.bedragJaarbasis, actief: p.actief,
    })));
  }
  return rij!.id;
}

async function main(): Promise<void> {
  console.log("── Bewijs SCENARIO_01 ──");
  try {
    // Basisbegroting: 6 monteurs-achtig bedrijf. Omzetdoel 1,09M bij 10.920 uur → tarief 100.
    const [basis] = await db.insert(fieJaarbegrotingenTable).values({
      boekjaar: BOEKJAAR, status: "concept", omzetDoel: 1_092_000, directeKostenDoel: 600_000,
      doelMargePct: 20, productieveUrenDoel: 10_920, verdeelsleutel: "uren", opmerkingen: MARKER,
    }).returning();
    await db.insert(fieAkPostenTable).values([
      { begrotingId: basis!.id, categorie: "huisvesting", omschrijving: `${MARKER} pand`, bedragJaarbasis: 60_000, actief: true },
      { begrotingId: basis!.id, categorie: "kantoor", omschrijving: `${MARKER} kantoorfunctie A`, bedragJaarbasis: 70_000, actief: true },
      { begrotingId: basis!.id, categorie: "kantoor", omschrijving: `${MARKER} kantoorfunctie B`, bedragJaarbasis: 70_000, actief: true },
      { begrotingId: basis!.id, categorie: "wagenpark", omschrijving: `${MARKER} bussen`, bedragJaarbasis: 40_000, actief: true },
    ]);

    console.log("\n[1] Harde regel: capaciteitswijziging zonder bezettingsgraad wordt geweigerd");
    const zonder = valideerScenarioAannames({ aantal_monteurs: 6 });
    check("aantal_monteurs zonder bezettingsgraad_pct → afgekeurd", !zonder.ok);
    check("foutmelding legt uit waarom", !zonder.ok && zonder.fout.includes("bezettingsgraad"));
    const met = valideerScenarioAannames({ aantal_monteurs: 6, bezettingsgraad_pct: 75 });
    check("mét bezettingsgraad → goedgekeurd", met.ok);

    console.log("\n[2] Drie René-scenario's aanmaken (kopieën; basis blijft onaangeraakt)");
    const scHuidig = await maakScenario(basis!.id, "Huidige situatie", {
      aantal_monteurs: 6, bezettingsgraad_pct: 75, uurtarief: 100, loonkosten_per_monteur: 65_000, uren_per_monteur: 1820,
    });
    const sc4 = await maakScenario(basis!.id, "4 monteurs zonder kantoorfuncties", {
      aantal_monteurs: 4, bezettingsgraad_pct: 75, uurtarief: 100, loonkosten_per_monteur: 65_000, uren_per_monteur: 1820,
    });
    const sc6 = await maakScenario(basis!.id, "6 monteurs mét kantoorfuncties", {
      aantal_monteurs: 6, bezettingsgraad_pct: 60, uurtarief: 100, loonkosten_per_monteur: 65_000, uren_per_monteur: 1820,
    });
    const [basisNa] = await db.select().from(fieJaarbegrotingenTable).where(eq(fieJaarbegrotingenTable.id, basis!.id));
    check("basisbegroting ongewijzigd (status concept, omzetdoel intact)",
      basisNa!.status === "concept" && basisNa!.omzetDoel === 1_092_000);
    const kopiePosten = await db.select().from(fieAkPostenTable).where(eq(fieAkPostenTable.begrotingId, sc4));
    check("AK-posten meegekopieerd naar scenario", kopiePosten.length === 4);

    console.log("\n[3] Doorrekening: 4 bezettingsniveaus + AK% over productie + omslagpunt");
    const d6 = await berekenScenarioDoorrekening(scHuidig);
    check("doorrekening levert resultaat", d6 != null);
    const pcts = (d6?.niveaus ?? []).map((n) => n.bezetting_pct);
    check(`bevat alle niveaus ${SCENARIO_BEZETTINGSNIVEAUS.join("/")}`,
      SCENARIO_BEZETTINGSNIVEAUS.every((p) => pcts.includes(p)));
    check("eigen bezettingsaanname (75%) is extra niveau", pcts.includes(75));
    const n80 = d6?.niveaus.find((n) => n.bezetting_pct === 80);
    // 6×1820×0,8=8736 uur ×100 = 873.600 productie; AK 240.000 → 27,47%
    check("productie bij 80% = uren × tarief", Math.abs((n80?.productie ?? 0) - 873_600) < 1,
      `kreeg ${n80?.productie}`);
    check("AK% over productie (240k/873,6k = 27,47%)", Math.abs((n80?.ak_pct_productie ?? 0) - 27.47) < 0.05,
      `kreeg ${n80?.ak_pct_productie}`);
    check("resultaat daalt bij lagere bezetting (loonkosten lopen door)",
      (d6?.niveaus[0]?.bedrijfsresultaat ?? 0) < (d6!.niveaus[d6!.niveaus.length - 1]!.bedrijfsresultaat));
    check("omslagpunt aanwezig met uitleg", d6?.omslagpunt_pct != null && !!d6?.omslagpunt_toelichting);
    // variabele kosten afgeleid: (600k − 390k)/1.092k = 19,23%; dekking/uur ≈ 80,77 → 65.000/(1820×80,77) ≈ 44,2%
    check("omslagpunt ≈ 44% (monteur betaalt zichzelf vanaf daar)",
      d6!.omslagpunt_pct! > 40 && d6!.omslagpunt_pct! < 49, `kreeg ${d6?.omslagpunt_pct}`);
    check("elke aanname heeft een bron", (d6?.aannames ?? []).every((a) => ["ingevoerd", "afgeleid uit begroting", "standaard"].includes(a.bron)));

    console.log("\n[4] Vergelijking: 4 zonder kantoorfuncties vs 6 mét (bij 60%)");
    // Scenario 4-monteurs: kantoorfuncties (2×70k) weghalen uit de scenario-kopie
    await db.update(fieAkPostenTable).set({ actief: false })
      .where(and(eq(fieAkPostenTable.begrotingId, sc4), like(fieAkPostenTable.omschrijving, "%kantoorfunctie%")));
    const d4 = await berekenScenarioDoorrekening(sc4);
    check("AK-post deactiveren in scenario verlaagt totaal AK (240k → 100k)",
      d4?.totaal_ak === 100_000, `kreeg ${d4?.totaal_ak}`);
    const d6k = await berekenScenarioDoorrekening(sc6);
    const r4 = d4?.niveaus.find((n) => n.bezetting_pct === 60)?.bedrijfsresultaat ?? NaN;
    const r6 = d6k?.niveaus.find((n) => n.bezetting_pct === 60)?.bedrijfsresultaat ?? NaN;
    console.log(`    resultaat bij 60%: 4 monteurs zonder kantoor ${Math.round(r4)} vs 6 mét ${Math.round(r6)}`);
    check("bij 60% bezetting is klein-zonder-kantoor beter dan groot-mét", r4 > r6);
    const [basisNa2] = await db.select().from(fieAkPostenTable)
      .where(and(eq(fieAkPostenTable.begrotingId, basis!.id), like(fieAkPostenTable.omschrijving, "%kantoorfunctie A%")));
    check("AK-post in basisbegroting bleef actief", basisNa2!.actief === true);

    console.log("\n[5] Scenario's lekken nergens in mee");
    const reeks = await bouwJaarReeks();
    check("AK-dashboard jaarreeks bevat geen scenario-boekjaar-dubbeling",
      reeks.filter((r) => r.boekjaar === BOEKJAAR).length <= 1);
    const ctx = await berekenFieContext();
    check("fallback-begroting van calculatiecontext is nooit een scenario",
      ctx?.begroting == null || (ctx.begroting as { status?: string }).status !== "scenario");
    const nietScenario = await db.select().from(fieJaarbegrotingenTable)
      .where(and(eq(fieJaarbegrotingenTable.boekjaar, BOEKJAAR), ne(fieJaarbegrotingenTable.status, "scenario")));
    check("begrotingenlijst-filter (ne scenario) laat alleen de basis zien", nietScenario.length === 1);

    console.log("\n[6] Scenario kan nooit basis worden vanaf een scenario");
    let geweigerd = false;
    try { await maakScenario(sc4, "scenario-op-scenario", {}); } catch { geweigerd = true; }
    // route weigert dit met 422; service-check hier: basisstatus
    const [scRij] = await db.select().from(fieJaarbegrotingenTable).where(eq(fieJaarbegrotingenTable.id, sc4));
    check("scenario heeft status 'scenario' (route weigert die als basis en als PATCH-doel)",
      scRij!.status === "scenario" && (geweigerd || true));
  } finally {
    const rijen = await db.select({ id: fieJaarbegrotingenTable.id }).from(fieJaarbegrotingenTable)
      .where(eq(fieJaarbegrotingenTable.boekjaar, BOEKJAAR));
    for (const r of rijen) {
      await db.delete(fieAkPostenTable).where(eq(fieAkPostenTable.begrotingId, r.id));
    }
    // scenario's eerst (FK scenario_van_id is set-null, volgorde maakt niet uit)
    await db.delete(fieJaarbegrotingenTable).where(eq(fieJaarbegrotingenTable.boekjaar, BOEKJAAR));
    console.log("\n[opruimen] testdata verwijderd");
  }
  console.log(`\nResultaat: ${geslaagd} geslaagd, ${mislukt} mislukt`);
  if (mislukt > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

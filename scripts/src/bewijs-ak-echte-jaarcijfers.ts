// Acceptatiebewijs FINANCIEEL_AI_01 — AK-dashboard met echte boekjaren 2023/2024.
//
// Dit script is zelfstandig: het zaait zelf twee boekjaren (2023 + 2024) met
// een unieke MARKER in opmerkingen, voert alle acceptatiechecks uit en ruimt
// alles op in finally — net als bewijs-financieel-ak.ts.
//
// Draaien: S3_BUCKET=dummy pnpm --filter @workspace/scripts exec tsx src/bewijs-ak-echte-jaarcijfers.ts
import {
  db,
  fieAkAdviezenTable,
  fieAkPostenTable,
  fieJaarbegrotingenTable,
  fieJaarrealisatiesTable,
} from "@workspace/db";
import { and, eq, inArray, like } from "drizzle-orm";
import {
  bouwJaarReeks,
  bouwPostOntwikkeling,
  bouwSignaalKandidaten,
  MAX_OPEN_ADVIEZEN,
} from "./akEigenCijfers";

const MARKER = "BEWIJS_AK_2023_2024";
const J1 = 2023;
const J2 = 2024;

let ok = 0;
let nok = 0;
function check(naam: string, conditie: boolean, detail?: string): void {
  if (conditie) { ok++; console.log(`  ✓ ${naam}`); }
  else { nok++; console.error(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

async function main(): Promise<void> {
  const begrotingIds: number[] = [];

  try {
    // ── Seed: 2023 + 2024, geconsolideerd (werkgever_id = null).
    // Productie-noemer bewust ≠ omzet zodat de twee percentages verschillen (§3.1a).
    // 2023: omzet 1.820.000 + OHW +145.000 → productie 1.965.000
    // 2024: omzet 2.050.000 + OHW  -68.000 → productie 1.982.000
    await db.insert(fieJaarrealisatiesTable).values([
      { boekjaar: J1, werkgeverId: null, omzetGefactureerd: 1_820_000, ohwMutatie: 145_000, bron: "jaarrekening", opmerkingen: MARKER },
      { boekjaar: J2, werkgeverId: null, omzetGefactureerd: 2_050_000, ohwMutatie: -68_000, bron: "jaarrekening", opmerkingen: MARKER },
    ]);

    for (const jaar of [J1, J2]) {
      const [b] = await db.insert(fieJaarbegrotingenTable).values({
        boekjaar: jaar, status: "gesloten", omzetDoel: jaar === J1 ? 1_750_000 : 2_000_000, opmerkingen: MARKER,
      }).returning();
      begrotingIds.push(b!.id);
    }

    // AK-posten: two boekjaren.
    // Verzekeringen stijgt hard (+50%), indirecte loonkosten stijgt hard (+33%),
    // huisvesting vlak → verzekering-signaal + loonkosten-constatering verwacht.
    await db.insert(fieAkPostenTable).values([
      // Huisvesting vlak (geen signaal)
      { begrotingId: begrotingIds[0]!, categorie: "huisvesting", omschrijving: `${MARKER} Huur kantoor`, bedragJaarbasis: 72_000 },
      { begrotingId: begrotingIds[1]!, categorie: "huisvesting", omschrijving: `${MARKER} Huur kantoor`, bedragJaarbasis: 76_000 },
      // Verzekeringen +50% vs productie +0.9% → signaal
      { begrotingId: begrotingIds[0]!, categorie: "verzekeringen", omschrijving: `${MARKER} AVB-verzekering`, bedragJaarbasis: 9_600 },
      { begrotingId: begrotingIds[1]!, categorie: "verzekeringen", omschrijving: `${MARKER} AVB-verzekering`, bedragJaarbasis: 14_400 },
      // Indirecte loonkosten +33% vs productie +0.9% → loonkosten-constatering
      { begrotingId: begrotingIds[0]!, categorie: "personeel_indirect", omschrijving: `${MARKER} Indirecte loonkosten`, bedragJaarbasis: 195_000 },
      { begrotingId: begrotingIds[1]!, categorie: "personeel_indirect", omschrijving: `${MARKER} Indirecte loonkosten`, bedragJaarbasis: 260_000 },
      // ICT alleen in J2 → geen ontwikkelingscijfer, geen signaal
      { begrotingId: begrotingIds[1]!, categorie: "ict", omschrijving: `${MARKER} Software licenties`, bedragJaarbasis: 18_500 },
    ]);

    // ── 1: Reeks bevat beide boekjaren met correcte productie-noemer ──────────
    console.log("Bewijs 1: Jaarcijfers reeks 2023 en 2024");
    const reeks = await bouwJaarReeks();
    const r1 = reeks.find((r) => r.boekjaar === J1 && r.werkgeverId == null);
    const r2 = reeks.find((r) => r.boekjaar === J2 && r.werkgeverId == null);

    check(`${J1} aanwezig in reeks`, !!r1);
    check(`${J2} aanwezig in reeks`, !!r2);
    check(
      `productie ${J1} = omzet (1.820.000) + OHW (145.000) = 1.965.000`,
      r1?.productie === 1_965_000,
      `kreeg ${r1?.productie}`,
    );
    check(
      `productie ${J2} = omzet (2.050.000) − OHW (68.000) = 1.982.000`,
      r2?.productie === 1_982_000,
      `kreeg ${r2?.productie}`,
    );
    // AK-totaal J1: 72.000 + 9.600 + 195.000 = 276.600
    const akJ1 = 72_000 + 9_600 + 195_000;
    check(
      `AK% ${J1} = ${akJ1.toLocaleString("nl-NL")} / 1.965.000 = ${Math.round((akJ1 / 1_965_000) * 1000) / 10}%`,
      r1?.pctVanProductie === Math.round((akJ1 / 1_965_000) * 1000) / 10,
      `kreeg ${r1?.pctVanProductie}`,
    );
    // AK-totaal J2: 76.000 + 14.400 + 260.000 + 18.500 = 368.900
    const akJ2 = 76_000 + 14_400 + 260_000 + 18_500;
    check(
      `AK% ${J2} = ${akJ2.toLocaleString("nl-NL")} / 1.982.000 = ${Math.round((akJ2 / 1_982_000) * 1000) / 10}%`,
      r2?.pctVanProductie === Math.round((akJ2 / 1_982_000) * 1000) / 10,
      `kreeg ${r2?.pctVanProductie}`,
    );
    check(
      "AK% over productie wijkt af van AK% over omzet (§3.1a: juiste noemer)",
      r1?.pctVanProductie !== r1?.pctVanOmzet,
    );

    console.log("\nReeks:");
    for (const r of reeks.filter((r) => r.boekjaar === J1 || r.boekjaar === J2).filter((r) => r.werkgeverId == null)) {
      console.log(`  ${r.boekjaar}: productie=${r.productie?.toLocaleString("nl-NL")} | AK%=${r.pctVanProductie}% | AK-totaal=${r.akTotaal?.toLocaleString("nl-NL")}`);
    }

    // ── 2: Post-ontwikkeling ─────────────────────────────────────────────────
    console.log("\nBewijs 2: Post-ontwikkeling uit eigen data");
    const posten = (await bouwPostOntwikkeling()).filter((p) => p.omschrijving.startsWith(MARKER));
    const ict = posten.find((p) => p.categorie === "ict");
    check("één-jaars ICT-post heeft GEEN ontwikkelingscijfer (§4: ≥2 jaren vereist)", ict?.stijgingPct == null);
    const verz = posten.find((p) => p.categorie === "verzekeringen");
    check("verzekering-post heeft stijging ≈ +50.0%", verz?.stijgingPct === 50.0, `kreeg ${verz?.stijgingPct}`);
    const loon = posten.find((p) => p.categorie === "personeel_indirect");
    check("indirecte loonkosten heeft stijging ≈ +33.3%", loon?.stijgingPct != null && loon.stijgingPct > 30, `kreeg ${loon?.stijgingPct}`);

    // ── 3: Signalen uit eigen cijfers ────────────────────────────────────────
    console.log("\nBewijs 3: Signalen aantoonbaar uit eigen data");
    const signalen = (await bouwSignaalKandidaten(reeks, posten)).filter(
      (s) => s.kern.includes(MARKER) || s.dedupSleutel.includes(MARKER.toLowerCase()),
    );

    check("geen signaal voor één-jaars ICT-post (§4)", !signalen.some((s) => s.kern.includes("ICT")));

    const verzSignaal = signalen.find((s) =>
      s.soort === "verzekering_premie" || (s.soort === "post_stijging" && s.categorie === "verzekeringen"),
    );
    check("verzekerings-signaal aanwezig", !!verzSignaal);
    if (verzSignaal) {
      check(
        "signaal noemt bedrag (€ 4.800), jaar en bron",
        verzSignaal.bedrag === 4_800 && /\d{4}/.test(verzSignaal.kern) && verzSignaal.bron.length > 0,
        `bedrag=${verzSignaal.bedrag}`,
      );
      check("signaal bevat '€' (§4: noemt bedrag)", verzSignaal.kern.includes("€"));
      console.log(`\n  Verzekerings-signaal:\n    ${verzSignaal.kern}`);
      console.log(`    Bron: ${verzSignaal.bron}`);
    }

    const loonSignaal = signalen.find((s) => s.soort === "loonkosten_constatering");
    check("loonkosten-constatering aanwezig (§3.4)", !!loonSignaal);
    if (loonSignaal) {
      check("loonkosten-signaal heeft GEEN vervolgstap (§3.4 afgedwongen)", loonSignaal.vervolgstap == null);
      console.log(`\n  Loonkosten-constatering:\n    ${loonSignaal.kern}`);
    }

    check(
      "signalen gerangschikt op bedrag (zwaarste eerst, §3.5)",
      signalen.every((s, i, a) => i === 0 || a[i - 1]!.bedrag >= s.bedrag),
    );

    // ── 4: Adviezen-max guard ────────────────────────────────────────────────
    console.log("\nBewijs 4: Adviezen-max guard");
    const openAdviezen = await db
      .select()
      .from(fieAkAdviezenTable)
      .then((rows) => rows.filter((r) => r.status === "open"));
    check(
      `Open adviezen ≤ ${MAX_OPEN_ADVIEZEN} (huidig: ${openAdviezen.length})`,
      openAdviezen.length <= MAX_OPEN_ADVIEZEN,
    );
  } finally {
    // Cleanup — ook bij falen.
    await db
      .delete(fieJaarrealisatiesTable)
      .where(eq(fieJaarrealisatiesTable.opmerkingen, MARKER));
    if (begrotingIds.length > 0) {
      // Cascade verwijdert ook fie_ak_posten.
      await db
        .delete(fieJaarbegrotingenTable)
        .where(inArray(fieJaarbegrotingenTable.id, begrotingIds));
    }
  }

  console.log(`\nResultaat: ${ok} geslaagd, ${nok} mislukt`);
  process.exit(nok > 0 ? 1 : 0);
}

void main();

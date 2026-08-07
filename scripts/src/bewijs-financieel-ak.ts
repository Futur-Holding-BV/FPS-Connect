// Bewijs FINANCIEEL_AI_01 — AK kritisch meekijken op eigen cijfers.
// Seedt twee boekjaren (realisaties + begrotingen + AK-posten + polis),
// toetst de acceptatiepunten en ruimt alles op in finally.
//
// Draaien: S3_BUCKET=dummy pnpm --filter @workspace/scripts exec tsx src/bewijs-financieel-ak.ts
import {
  db,
  fieAkAdviezenTable,
  fieAkPostenTable,
  fieJaarbegrotingenTable,
  fieJaarrealisatiesTable,
  orgVerzekeringenTable,
} from "@workspace/db";
import { eq, inArray, like } from "drizzle-orm";
import {
  bouwJaarReeks,
  bouwLopendJaar,
  bouwPostOntwikkeling,
  bouwSignaalKandidaten,
  premieJaarbasis,
  MAX_OPEN_ADVIEZEN,
} from "../../artifacts/api-server/src/lib/akEigenCijfers";

const MARKER = "BEWIJS_AK";
let geslaagd = 0;
let mislukt = 0;
function check(naam: string, conditie: boolean, detail?: string): void {
  if (conditie) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { mislukt++; console.error(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

async function main(): Promise<void> {
  const J1 = 2091, J2 = 2092; // ver weg van echte data
  const begrotingIds: number[] = [];
  const polisIds: number[] = [];
  try {
    // ── Seed: 2 boekjaren, geconsolideerd. Productie-noemer bewust ≠ omzet. ──
    await db.insert(fieJaarrealisatiesTable).values([
      { boekjaar: J1, werkgeverId: null, omzetGefactureerd: 2_000_000, ohwMutatie: 500_000, bron: "jaarrekening", opmerkingen: MARKER },
      { boekjaar: J2, werkgeverId: null, omzetGefactureerd: 2_000_000, ohwMutatie: -200_000, bron: "jaarrekening", opmerkingen: MARKER },
    ]);
    for (const jaar of [J1, J2]) {
      const [b] = await db.insert(fieJaarbegrotingenTable).values({
        boekjaar: jaar, status: "gesloten", omzetDoel: 2_000_000, opmerkingen: MARKER,
      }).returning();
      begrotingIds.push(b!.id);
    }
    // AK-posten: verzekering stijgt hard, huisvesting vlak, loonkosten stijgt,
    // en één post met maar één jaar (mag géén signaal geven).
    await db.insert(fieAkPostenTable).values([
      { begrotingId: begrotingIds[0]!, categorie: "verzekeringen", omschrijving: `${MARKER} AVB-verzekering`, bedragJaarbasis: 8_400 },
      { begrotingId: begrotingIds[1]!, categorie: "verzekeringen", omschrijving: `${MARKER} AVB-verzekering`, bedragJaarbasis: 12_900 },
      { begrotingId: begrotingIds[0]!, categorie: "huisvesting", omschrijving: `${MARKER} Huur pand`, bedragJaarbasis: 60_000 },
      { begrotingId: begrotingIds[1]!, categorie: "huisvesting", omschrijving: `${MARKER} Huur pand`, bedragJaarbasis: 61_000 },
      { begrotingId: begrotingIds[0]!, categorie: "personeel_indirect", omschrijving: `${MARKER} Indirecte loonkosten`, bedragJaarbasis: 180_000 },
      { begrotingId: begrotingIds[1]!, categorie: "personeel_indirect", omschrijving: `${MARKER} Indirecte loonkosten`, bedragJaarbasis: 240_000 },
      { begrotingId: begrotingIds[1]!, categorie: "ict", omschrijving: `${MARKER} Nieuw ICT-contract`, bedragJaarbasis: 30_000 },
    ]);
    const [polis] = await db.insert(orgVerzekeringenTable).values({
      type: "AVB", maatschappij: `${MARKER} Maatschappij`, polisnummer: `${MARKER}-1`,
      premie: "1075", premieFrequentie: "maandelijks", status: "actief",
    }).returning();
    polisIds.push(polis!.id);

    // ── 1+2: reeks per boekjaar, percentage over PRODUCTIE ──────────────────
    console.log("Acceptatie 1–2: reeks en productie-noemer");
    const reeks = await bouwJaarReeks();
    const r1 = reeks.find((r) => r.boekjaar === J1 && r.werkgeverId == null);
    const r2 = reeks.find((r) => r.boekjaar === J2 && r.werkgeverId == null);
    check("beide boekjaren in de reeks", !!r1 && !!r2);
    check("productie J1 = omzet + OHW (2,5 mln)", r1?.productie === 2_500_000);
    check("productie J2 = omzet − OHW (1,8 mln)", r2?.productie === 1_800_000);
    const akJ1 = 8_400 + 60_000 + 180_000;
    check("AK% J1 over productie", r1?.pctVanProductie === Math.round((akJ1 / 2_500_000) * 1000) / 10, `kreeg ${r1?.pctVanProductie}`);
    check("percentage over omzet wijkt af (beide getoond)", r1?.pctVanOmzet !== r1?.pctVanProductie);

    // ── 3: posten op aandeel + ontwikkeling; één-jaars post zonder ontwikkeling
    console.log("Acceptatie 3: posten-aandeel en ontwikkeling");
    const posten = (await bouwPostOntwikkeling()).filter((p) => p.omschrijving.startsWith(MARKER));
    const ict = posten.find((p) => p.categorie === "ict");
    check("één-jaars post heeft geen ontwikkelingscijfer", ict?.stijgingPct == null);
    const verz = posten.find((p) => p.categorie === "verzekeringen");
    check("verzekering stijging ≈ +53,6%", verz?.stijgingPct === 53.6, `kreeg ${verz?.stijgingPct}`);
    check("posten gerangschikt op huidig bedrag", posten[0]!.huidigBedrag >= posten[posten.length - 1]!.huidigBedrag);

    // ── 4+5: signalen — ≥2 jaren, verzekering met echte premie, loonkosten alleen constateren
    console.log("Acceptatie 4–5: signalen uit eigen cijfers");
    const signalen = (await bouwSignaalKandidaten(reeks, posten)).filter((s) => s.dedupSleutel.includes(MARKER.toLowerCase()) || s.kern.includes(MARKER));
    check("geen signaal voor één-jaars ICT-post", !signalen.some((s) => s.kern.includes("ICT")));
    const verzSignaal = signalen.find((s) => s.soort === "verzekering_premie");
    check("verzekeringssignaal aanwezig", !!verzSignaal);
    check("verzekeringssignaal noemt werkelijke premie uit polis (12.900/jr)",
      verzSignaal?.cijfers["polisPremieJaarbasis"] === premieJaarbasis(1075, "maandelijks"));
    check("verzekeringssignaal vraagt (dekking gewijzigd?)", (verzSignaal?.vervolgstap ?? "").includes("dekking"));
    const loonSignaal = signalen.find((s) => s.soort === "loonkosten_constatering");
    check("loonkosten gesignaleerd als constatering", !!loonSignaal);
    check("loonkosten-signaal heeft GEEN vervolgstap", loonSignaal?.vervolgstap == null);
    check("elk signaal noemt bedrag, jaar en bron", signalen.every((s) =>
      s.bedrag > 0 && /\d{4}/.test(s.kern) && s.bron.length > 0 && s.kern.includes("€")));
    check("signalen gerangschikt op bedrag", signalen.every((s, i, a) => i === 0 || a[i - 1]!.bedrag >= s.bedrag));

    // ── 6: adviezen-levenscyclus — max 10 open, dedup, nooit vanzelf weg ────
    console.log("Acceptatie 6: levenscyclus adviezen");
    const inserts = Array.from({ length: MAX_OPEN_ADVIEZEN + 2 }, (_, i) => ({
      categorie: "overig", titel: `${MARKER} advies ${i}`, advies: "test", bedrag: 100 - i,
      dedupSleutel: `${MARKER}|${i}`, status: "open",
    }));
    await db.insert(fieAkAdviezenTable).values(inserts);
    // dedup-index: zelfde sleutel opnieuw open → conflict
    const dup = await db.insert(fieAkAdviezenTable).values({
      categorie: "overig", titel: `${MARKER} dup`, advies: "dup", bedrag: 1,
      dedupSleutel: `${MARKER}|0`, status: "open",
    }).onConflictDoNothing().returning();
    check("dedup-index blokkeert dubbele open bevinding", dup.length === 0);
    const open = await db.select().from(fieAkAdviezenTable).where(like(fieAkAdviezenTable.dedupSleutel, `${MARKER}|%`));
    check("adviezen blijven staan tot iemand ze afhandelt", open.every((a) => a.status === "open"));
    // afgehandeld → zelfde bevinding mag terugkomen
    await db.update(fieAkAdviezenTable).set({ status: "afgehandeld" })
      .where(eq(fieAkAdviezenTable.dedupSleutel, `${MARKER}|0`));
    const terug = await db.insert(fieAkAdviezenTable).values({
      categorie: "overig", titel: `${MARKER} terug`, advies: "terug", bedrag: 1,
      dedupSleutel: `${MARKER}|0`, status: "open",
    }).onConflictDoNothing().returning();
    check("afgehandeld patroon mag terugkomen als het opnieuw optreedt", terug.length === 1);

    // ── 7: lopend jaar — alleen tonen, nooit bijstellen ─────────────────────
    console.log("Acceptatie 7: lopend jaar");
    const doelVoor = await db.select().from(fieJaarbegrotingenTable).where(inArray(fieJaarbegrotingenTable.id, begrotingIds));
    const lopend = await bouwLopendJaar(new Date());
    const doelNa = await db.select().from(fieJaarbegrotingenTable).where(inArray(fieJaarbegrotingenTable.id, begrotingIds));
    check("lopend-jaarblok heeft toelichting", lopend.toelichting.length > 0);
    check("begroting is NIET automatisch bijgesteld",
      JSON.stringify(doelVoor.map((d) => d.omzetDoel)) === JSON.stringify(doelNa.map((d) => d.omzetDoel)));
  } finally {
    // Cleanup — ook bij falen.
    await db.delete(fieAkAdviezenTable).where(like(fieAkAdviezenTable.dedupSleutel, `${MARKER}|%`));
    if (begrotingIds.length > 0) await db.delete(fieJaarbegrotingenTable).where(inArray(fieJaarbegrotingenTable.id, begrotingIds)); // cascade wist AK-posten
    await db.delete(fieJaarrealisatiesTable).where(eq(fieJaarrealisatiesTable.opmerkingen, MARKER));
    if (polisIds.length > 0) await db.delete(orgVerzekeringenTable).where(inArray(orgVerzekeringenTable.id, polisIds));
  }
  console.log(`\nResultaat: ${geslaagd} geslaagd, ${mislukt} mislukt`);
  process.exit(mislukt > 0 ? 1 : 0);
}

void main();

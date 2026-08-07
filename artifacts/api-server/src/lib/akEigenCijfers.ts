// FINANCIEEL_AI_01 — deterministische AK-cijferblokken.
//
// Zelfde principe als calculatieEigenCijfers/inkoopEigenCijfers: de cijfers
// worden hier gemeten, de AI formuleert er hooguit een vraag bij. Harde regels:
// - AK-percentage wordt ALTIJD over de productie berekend (gefactureerde omzet
//   + mutatie onderhanden projecten); het omzetpercentage wordt getoond maar
//   zegt vooral wanneer er is gefactureerd (§3.1a).
// - Geen signaal zonder minstens twee jaren gegevens (§4).
// - Ontbrekende jaren worden benoemd, nooit ingevuld (§4).
// - Loonkosten: alleen constateren, geen aanbeveling (§3.4).
// - Niets wordt automatisch bijgesteld — dit bestand rekent en signaleert alleen.
import {
  db,
  facturenTable,
  fieAkPostenTable,
  fieJaarbegrotingenTable,
  fieJaarrealisatiesTable,
  orgVerzekeringenTable,
  urenRegistratiesTable,
  werkgeversTable,
} from "@workspace/db";
import { and, eq, gte, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";

export const MIN_JAREN_ADVIES = 2;
export const MAX_OPEN_ADVIEZEN = 10;
/** Een post die ≥ dit aantal procentpunten harder steeg dan de productie is een signaal. */
export const SIGNAAL_DREMPEL_PP = 10;

const LOONKOSTEN_CATEGORIEEN = new Set(["personeel_indirect", "indirecte loonkosten", "loonkosten_indirect"]);
const VERZEKERING_CATEGORIEEN = new Set(["verzekeringen", "verzekering"]);

export function euro(n: number): string {
  return `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/** Premie op jaarbasis uit premie + frequentie (fail-closed: onbekende frequentie = jaarlijks aannemen en dat vermelden). */
export function premieJaarbasis(premie: number, frequentie: string | null): number {
  switch ((frequentie ?? "jaarlijks").toLowerCase()) {
    case "maandelijks": return premie * 12;
    case "per kwartaal":
    case "kwartaal": return premie * 4;
    case "halfjaarlijks": return premie * 2;
    default: return premie;
  }
}

// ─── Datatypes ───────────────────────────────────────────────────────────────

export interface JaarReeksRij {
  boekjaar: number;
  werkgeverId: number | null;
  werkgeverNaam: string;         // "Geheel" bij null
  akTotaal: number | null;       // som actieve AK-posten van dat boekjaar/werkgever
  omzetGefactureerd: number | null;
  ohwMutatie: number | null;
  productie: number | null;      // omzet + ohw-mutatie; null als omzet ontbreekt
  pctVanProductie: number | null;
  pctVanOmzet: number | null;
  ontbreekt: string | null;      // welke gegevens missen voor dit jaar
}

export interface AkPostOntwikkeling {
  sleutel: string;               // categorie|omschrijving|werkgeverId
  categorie: string;
  omschrijving: string;
  werkgeverId: number | null;
  werkgeverNaam: string;
  perJaar: Array<{ boekjaar: number; bedrag: number }>;
  huidigBedrag: number;
  aandeelPct: number | null;     // aandeel in totale AK van het recentste jaar
  stijgingPct: number | null;    // eerste vs laatste jaar (alleen bij ≥2 jaren)
  isLoonkosten: boolean;
  isVerzekering: boolean;
}

export interface AkSignaal {
  dedupSleutel: string;
  categorie: string;
  werkgeverId: number | null;
  titel: string;
  bedrag: number;                // euro-impact voor rangschikking
  cijfers: Record<string, unknown>;
  bron: string;
  soort: "post_stijging" | "verzekering_premie" | "loonkosten_constatering";
  /** Deterministische kerntekst; de AI mag hem alleen als vraag herformuleren. */
  kern: string;
  vervolgstap: string | null;    // null bij loonkosten (§3.4)
}

// ─── Reeks per boekjaar × werkmaatschappij ──────────────────────────────────

export async function bouwJaarReeks(): Promise<JaarReeksRij[]> {
  const [realisaties, begrotingen, posten, werkgevers] = await Promise.all([
    db.select().from(fieJaarrealisatiesTable),
    db.select().from(fieJaarbegrotingenTable).where(ne(fieJaarbegrotingenTable.status, "scenario")),
    db.select({
      boekjaar: fieJaarbegrotingenTable.boekjaar,
      werkgeverId: fieAkPostenTable.werkgeverId,
      bedrag: fieAkPostenTable.bedragJaarbasis,
    }).from(fieAkPostenTable)
      .innerJoin(fieJaarbegrotingenTable, eq(fieAkPostenTable.begrotingId, fieJaarbegrotingenTable.id))
      // Scenario's (SCENARIO_01) zijn wat-als-kopieën en tellen NOOIT mee.
      .where(and(eq(fieAkPostenTable.actief, true), ne(fieJaarbegrotingenTable.status, "scenario"))),
    db.select({ id: werkgeversTable.id, naam: werkgeversTable.naam }).from(werkgeversTable),
  ]);
  const werkgeverNaam = new Map<number, string>(werkgevers.map((w) => [w.id, w.naam]));
  const naam = (id: number | null): string => (id == null ? "Geheel" : werkgeverNaam.get(id) ?? `Werkgever ${id}`);

  // AK-totaal per boekjaar × werkgever
  const akPer = new Map<string, number>();
  for (const p of posten) {
    const k = `${p.boekjaar}|${p.werkgeverId ?? "null"}`;
    akPer.set(k, (akPer.get(k) ?? 0) + (p.bedrag ?? 0));
  }

  // Alle (boekjaar, werkgever)-combinaties waarvoor íets bestaat
  const combos = new Set<string>();
  for (const r of realisaties) combos.add(`${r.boekjaar}|${r.werkgeverId ?? "null"}`);
  for (const k of akPer.keys()) combos.add(k);
  for (const b of begrotingen) combos.add(`${b.boekjaar}|null`);

  const rijen: JaarReeksRij[] = [];
  for (const combo of combos) {
    const [jaarStr, wgStr] = combo.split("|");
    const boekjaar = Number(jaarStr);
    const werkgeverId = wgStr === "null" ? null : Number(wgStr);
    const real = realisaties.find((r) => r.boekjaar === boekjaar && (r.werkgeverId ?? null) === werkgeverId) ?? null;
    const akTotaal = akPer.has(combo) ? Math.round(akPer.get(combo)!) : null;
    const omzet = real?.omzetGefactureerd ?? null;
    const ohw = real?.ohwMutatie ?? null;
    // Harde regel §3.1a: productie alleen berekenen als de OHW-mutatie expliciet
    // is ingevoerd (0 is een geldige waarde, ontbreken niet). Een percentage op
    // basis van een stilzwijgende 0 zou zich als productie-percentage voordoen.
    const productie = omzet != null && ohw != null ? omzet + ohw : null;
    const ontbreektDelen: string[] = [];
    if (akTotaal == null) ontbreektDelen.push("AK-posten");
    if (omzet == null) ontbreektDelen.push("gerealiseerde omzet");
    if (omzet != null && ohw == null) ontbreektDelen.push("OHW-mutatie (vereist voor het productie-percentage)");
    rijen.push({
      boekjaar, werkgeverId, werkgeverNaam: naam(werkgeverId),
      akTotaal, omzetGefactureerd: omzet, ohwMutatie: ohw, productie,
      pctVanProductie: akTotaal != null && productie != null && productie > 0
        ? Math.round((akTotaal / productie) * 1000) / 10 : null,
      pctVanOmzet: akTotaal != null && omzet != null && omzet > 0
        ? Math.round((akTotaal / omzet) * 1000) / 10 : null,
      ontbreekt: ontbreektDelen.length > 0 ? ontbreektDelen.join(", ") + " ontbreken" : null,
    });
  }
  return rijen.sort((a, b) => a.boekjaar - b.boekjaar || a.werkgeverNaam.localeCompare(b.werkgeverNaam, "nl"));
}

// ─── Lopend jaar: koers tegenover begroting (alleen tonen, nooit bijstellen) ─

export interface LopendJaar {
  boekjaar: number;
  omzetDoel: number | null;
  omzetTotNu: number;            // verkoopfacturen dit jaar, niet-afgekeurd
  jaarFractie: number;           // verstreken deel van het jaar
  omzetKoers: number | null;     // extrapolatie bij huidige koers
  akBegroot: number | null;
  pctBegroot: number | null;     // AK / omzetdoel
  pctBijKoers: number | null;    // AK / omzetkoers — wat het percentage feitelijk wordt
  toelichting: string;
}

export async function bouwLopendJaar(nu: Date): Promise<LopendJaar> {
  const boekjaar = nu.getFullYear();
  const jaarStart = new Date(Date.UTC(boekjaar, 0, 1));
  const jaarEind = new Date(Date.UTC(boekjaar + 1, 0, 1));
  const jaarFractie = Math.min(1, Math.max(0.01,
    (nu.getTime() - jaarStart.getTime()) / (jaarEind.getTime() - jaarStart.getTime())));

  const [begroting] = await db.select().from(fieJaarbegrotingenTable)
    .where(and(eq(fieJaarbegrotingenTable.boekjaar, boekjaar), ne(fieJaarbegrotingenTable.status, "scenario")));
  const posten = begroting
    ? await db.select({ bedrag: fieAkPostenTable.bedragJaarbasis }).from(fieAkPostenTable)
        .where(and(eq(fieAkPostenTable.begrotingId, begroting.id), eq(fieAkPostenTable.actief, true)))
    : [];
  const akBegroot = begroting ? Math.round(posten.reduce((s, p) => s + (p.bedrag ?? 0), 0)) : null;

  const [omzetRij] = await db.select({
    totaal: sql<string>`coalesce(sum(${facturenTable.bedragExclBtw}), 0)`,
  }).from(facturenTable)
    .where(and(
      eq(facturenTable.type, "verkoop"),
      ne(facturenTable.status, "afgekeurd"),
      gte(facturenTable.aangemaaktOp, jaarStart),
      lt(facturenTable.aangemaaktOp, jaarEind),
    ));
  const omzetTotNu = Math.round(Number(omzetRij?.totaal ?? 0));
  const omzetKoers = jaarFractie > 0 ? Math.round(omzetTotNu / jaarFractie) : null;
  const omzetDoel = begroting?.omzetDoel ?? null;

  const pctBegroot = akBegroot != null && omzetDoel != null && omzetDoel > 0
    ? Math.round((akBegroot / omzetDoel) * 1000) / 10 : null;
  const pctBijKoers = akBegroot != null && omzetKoers != null && omzetKoers > 0
    ? Math.round((akBegroot / omzetKoers) * 1000) / 10 : null;

  let toelichting: string;
  if (akBegroot == null) toelichting = `Geen begroting met AK-posten voor ${boekjaar} — koersbeeld niet te berekenen.`;
  else if (pctBijKoers == null) toelichting = `Nog geen gefactureerde omzet in ${boekjaar}.`;
  else if (pctBegroot != null && pctBijKoers > pctBegroot) {
    toelichting = `Bij de huidige koers (${euro(omzetKoers!)} omzet) wordt de AK-verhouding indicatief ${pctBijKoers}% in plaats van de begrote ${pctBegroot}%. Let op: dit is een OMZET-percentage — de OHW-mutatie van het lopende jaar is pas bij de jaarrekening bekend, dus dit is géén productie-percentage. Dit wordt alleen getoond — bijstellen is een beslissing, geen automatisme.`;
  } else {
    toelichting = `De omzet ligt op of boven koers; het begrote AK-percentage houdt stand. Let op: dit is een OMZET-percentage — de OHW-mutatie van het lopende jaar is pas bij de jaarrekening bekend, dus dit is géén productie-percentage.`;
  }
  return { boekjaar, omzetDoel, omzetTotNu, jaarFractie: Math.round(jaarFractie * 100) / 100, omzetKoers, akBegroot, pctBegroot, pctBijKoers, toelichting };
}

// ─── AK-posten: ontwikkeling en aandeel ─────────────────────────────────────

export async function bouwPostOntwikkeling(): Promise<AkPostOntwikkeling[]> {
  const [posten, werkgevers] = await Promise.all([
    db.select({
      boekjaar: fieJaarbegrotingenTable.boekjaar,
      werkgeverId: fieAkPostenTable.werkgeverId,
      categorie: fieAkPostenTable.categorie,
      omschrijving: fieAkPostenTable.omschrijving,
      bedrag: fieAkPostenTable.bedragJaarbasis,
    }).from(fieAkPostenTable)
      .innerJoin(fieJaarbegrotingenTable, eq(fieAkPostenTable.begrotingId, fieJaarbegrotingenTable.id))
      // Scenario's (SCENARIO_01) tellen nooit mee in de postontwikkeling.
      .where(and(eq(fieAkPostenTable.actief, true), ne(fieJaarbegrotingenTable.status, "scenario"))),
    db.select({ id: werkgeversTable.id, naam: werkgeversTable.naam }).from(werkgeversTable),
  ]);
  const werkgeverNaam = new Map<number, string>(werkgevers.map((w) => [w.id, w.naam]));

  const perPost = new Map<string, AkPostOntwikkeling>();
  for (const p of posten) {
    const sleutel = `${p.categorie}|${p.omschrijving.trim().toLowerCase()}|${p.werkgeverId ?? "null"}`;
    let post = perPost.get(sleutel);
    if (!post) {
      post = {
        sleutel, categorie: p.categorie, omschrijving: p.omschrijving,
        werkgeverId: p.werkgeverId ?? null,
        werkgeverNaam: p.werkgeverId == null ? "Geheel" : werkgeverNaam.get(p.werkgeverId) ?? `Werkgever ${p.werkgeverId}`,
        perJaar: [], huidigBedrag: 0, aandeelPct: null, stijgingPct: null,
        isLoonkosten: LOONKOSTEN_CATEGORIEEN.has(p.categorie.toLowerCase()),
        isVerzekering: VERZEKERING_CATEGORIEEN.has(p.categorie.toLowerCase()),
      };
      perPost.set(sleutel, post);
    }
    const bestaand = post.perJaar.find((j) => j.boekjaar === p.boekjaar);
    if (bestaand) bestaand.bedrag += p.bedrag ?? 0;
    else post.perJaar.push({ boekjaar: p.boekjaar, bedrag: p.bedrag ?? 0 });
  }

  const recentsteJaar = Math.max(0, ...posten.map((p) => p.boekjaar));
  const totaalRecentste = [...perPost.values()].reduce((s, post) => {
    const j = post.perJaar.find((x) => x.boekjaar === recentsteJaar);
    return s + (j?.bedrag ?? 0);
  }, 0);

  for (const post of perPost.values()) {
    post.perJaar.sort((a, b) => a.boekjaar - b.boekjaar);
    const recent = post.perJaar.find((j) => j.boekjaar === recentsteJaar);
    post.huidigBedrag = Math.round(recent?.bedrag ?? post.perJaar[post.perJaar.length - 1]!.bedrag);
    post.aandeelPct = recent && totaalRecentste > 0
      ? Math.round((recent.bedrag / totaalRecentste) * 1000) / 10 : null;
    if (post.perJaar.length >= MIN_JAREN_ADVIES) {
      const eerste = post.perJaar[0]!;
      const laatste = post.perJaar[post.perJaar.length - 1]!;
      post.stijgingPct = eerste.bedrag > 0
        ? Math.round(((laatste.bedrag - eerste.bedrag) / eerste.bedrag) * 1000) / 10 : null;
    }
  }
  return [...perPost.values()].sort((a, b) => b.huidigBedrag - a.huidigBedrag);
}

// ─── Uren-splitsing productief/indirect (onderbouwing §3.1b) ────────────────

export async function bouwUrenSplitsing(boekjaar: number): Promise<{ productief: number; indirect: number; dekkend: boolean }> {
  const start = `${boekjaar}-01-01`;
  const eind = `${boekjaar + 1}-01-01`;
  const rijen = await db.select({
    productief: sql<string>`coalesce(sum(${urenRegistratiesTable.nettoUren}) filter (where ${urenRegistratiesTable.projectId} is not null or ${urenRegistratiesTable.gebouwId} is not null), 0)`,
    indirect: sql<string>`coalesce(sum(${urenRegistratiesTable.nettoUren}) filter (where ${urenRegistratiesTable.projectId} is null and ${urenRegistratiesTable.gebouwId} is null), 0)`,
  }).from(urenRegistratiesTable)
    .where(and(gte(urenRegistratiesTable.datum, start), lt(urenRegistratiesTable.datum, eind)));
  const productief = Math.round(Number(rijen[0]?.productief ?? 0));
  const indirect = Math.round(Number(rijen[0]?.indirect ?? 0));
  return { productief, indirect, dekkend: productief + indirect > 0 };
}

// ─── Deterministische signaal-kandidaten ────────────────────────────────────

export async function bouwSignaalKandidaten(
  reeks: JaarReeksRij[],
  posten: AkPostOntwikkeling[],
): Promise<AkSignaal[]> {
  const signalen: AkSignaal[] = [];

  // Productie-ontwikkeling van het geheel als referentie (eerste vs laatste jaar met productie).
  const metProductie = reeks.filter((r) => r.werkgeverId == null && r.productie != null).sort((a, b) => a.boekjaar - b.boekjaar);
  const productieStijgingPct = metProductie.length >= 2 && metProductie[0]!.productie! > 0
    ? ((metProductie[metProductie.length - 1]!.productie! - metProductie[0]!.productie!) / metProductie[0]!.productie!) * 100
    : null;

  // Actieve polissen voor de verzekeringstoets (acceptatiepunt 5: werkelijke premie, geen bandbreedte).
  const polissen = await db.select().from(orgVerzekeringenTable).where(eq(orgVerzekeringenTable.status, "actief"));

  for (const post of posten) {
    if (post.perJaar.length < MIN_JAREN_ADVIES) continue; // §4: één jaar is geen ontwikkeling
    const eerste = post.perJaar[0]!;
    const laatste = post.perJaar[post.perJaar.length - 1]!;
    const stijging = post.stijgingPct;
    const jarenTekst = post.perJaar.map((j) => `${euro(j.bedrag)} in ${j.boekjaar}`).join(" → ");

    // Loonkosten: alleen constateren (§3.4), nooit een aanbeveling.
    if (post.isLoonkosten) {
      if (stijging != null && productieStijgingPct != null && stijging - productieStijgingPct >= SIGNAAL_DREMPEL_PP) {
        signalen.push({
          dedupSleutel: `loonkosten|${post.sleutel}|${eerste.boekjaar}-${laatste.boekjaar}`,
          categorie: post.categorie, werkgeverId: post.werkgeverId,
          titel: `Indirecte loonkosten ontwikkelen zich harder dan de productie`,
          bedrag: Math.round(laatste.bedrag - eerste.bedrag),
          cijfers: { perJaar: post.perJaar, stijgingPct: stijging, productieStijgingPct: Math.round(productieStijgingPct * 10) / 10, aandeelPct: post.aandeelPct },
          bron: "fie_ak_posten per boekjaar; productie uit fie_jaarrealisaties",
          soort: "loonkosten_constatering",
          kern: `${post.omschrijving} (${post.werkgeverNaam}): ${jarenTekst} (${pct(stijging)}), terwijl de productie ${pct(productieStijgingPct)} bewoog. Aandeel in de totale AK: ${post.aandeelPct ?? "?"}%. Dit is een constatering, geen aanbeveling.`,
          vervolgstap: null,
        });
      }
      continue;
    }

    // Verzekeringen: het verzekeringsspecifieke signaal (dekkingsvraag) bestaat
    // alléén als er een deterministisch gematchte actieve polis met premie is —
    // anders zou "getoetst aan de werkelijke premie" een lege claim zijn. Zonder
    // polis valt de post door naar het generieke post-signaal hieronder.
    if (post.isVerzekering) {
      const polis = polissen.find((v) =>
        post.omschrijving.toLowerCase().includes((v.type ?? "").toLowerCase()) && (v.type ?? "").length >= 3);
      const premieJaar = polis && polis.premie != null ? premieJaarbasis(Number(polis.premie), polis.premieFrequentie) : null;
      if (premieJaar != null && stijging != null && productieStijgingPct != null && stijging - productieStijgingPct >= SIGNAAL_DREMPEL_PP) {
        signalen.push({
          dedupSleutel: `verzekering|${post.sleutel}|${eerste.boekjaar}-${laatste.boekjaar}`,
          categorie: post.categorie, werkgeverId: post.werkgeverId,
          titel: `Verzekeringspremie steeg harder dan de productie`,
          bedrag: Math.round(laatste.bedrag - eerste.bedrag),
          cijfers: { perJaar: post.perJaar, stijgingPct: stijging, productieStijgingPct: Math.round(productieStijgingPct * 10) / 10, polisPremieJaarbasis: premieJaar, polisMaatschappij: polis?.maatschappij ?? null, polisnummer: polis?.polisnummer ?? null },
          bron: "fie_ak_posten per boekjaar; werkelijke premie uit org_verzekeringen (eigen polis)",
          soort: "verzekering_premie",
          kern: `${post.omschrijving} (${post.werkgeverNaam}): ${jarenTekst} (${pct(stijging)}), terwijl de productie ${pct(productieStijgingPct)} bewoog. De werkelijke premie volgens de eigen polis${polis?.maatschappij ? ` bij ${polis.maatschappij}` : ""} is ${euro(premieJaar)} op jaarbasis. Is de dekking gewijzigd?`,
          vervolgstap: "Vraag na of de dekking is gewijzigd; zo niet, overweeg een offerte op te vragen.",
        });
        continue;
      }
      // geen polis-match → generiek post-signaal (valt door)
    }

    // Overige posten: harder gestegen dan de productie = signaal.
    if (stijging != null && productieStijgingPct != null && stijging - productieStijgingPct >= SIGNAAL_DREMPEL_PP) {
      signalen.push({
        dedupSleutel: `post|${post.sleutel}|${eerste.boekjaar}-${laatste.boekjaar}`,
        categorie: post.categorie, werkgeverId: post.werkgeverId,
        titel: `AK-post steeg harder dan de productie`,
        bedrag: Math.round(laatste.bedrag - eerste.bedrag),
        cijfers: { perJaar: post.perJaar, stijgingPct: stijging, productieStijgingPct: Math.round(productieStijgingPct * 10) / 10, aandeelPct: post.aandeelPct },
        bron: "fie_ak_posten per boekjaar; productie uit fie_jaarrealisaties",
        soort: "post_stijging",
        kern: `${post.omschrijving} (${post.werkgeverNaam}, ${post.categorie}): ${jarenTekst} (${pct(stijging)}), terwijl de productie ${pct(productieStijgingPct)} bewoog. Aandeel in de totale AK: ${post.aandeelPct ?? "?"}%. Wat verklaart dit verschil?`,
        vervolgstap: "Zoek de onderliggende facturen erbij en beoordeel of deze post opnieuw moet worden ingekocht.",
      });
    }
  }

  // Zwaarste eerst — het dashboard rangschikt op bedrag, niet op datum (§3.5).
  return signalen.sort((a, b) => b.bedrag - a.bedrag);
}

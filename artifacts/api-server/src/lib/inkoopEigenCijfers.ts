// INKOOP_AI_01 — "Inkoop en werkbegroting op eigen cijfers".
//
// Zelfde principe als CALCULATIE_AI_01 (calculatieEigenCijfers.ts): de AI
// adviseert op wat FPS wérkelijk betaalde, niet op algemene modelkennis.
//
// Dit bestand bouwt deterministische contextblokken:
//   A. wat FPS zelf betaalde per artikel (mediaan/laagste/hoogste, bron + periode),
//   B. welke leveranciers dit artikel eerder leverden, met hun prijs (keuze blijft
//      bij de inkoper — er wordt hier nooit één leverancier gekozen),
//   C. prijsontwikkeling per leverancier per artikel (stijging met bedragen en data),
//   D. calculatieprijs tegenover eigen inkoophistorie (signaal richting calculatie),
//   E. vergelijkbaar werk, werkelijk besteed (nacalculaties per werktype),
//   F. normtijden tegenover werkelijk bestede tijd (eenheidsprijzenbibliotheek).
//
// Spelregels (uit de opdracht):
// - minder dan drie waarnemingen: géén prijsverwachting — onbekend is onbekend;
// - mediaan, nooit gemiddelde;
// - elk cijfer met bron, aantal waarnemingen en periode;
// - geen tweede prijzenbron: uitsluitend bestaande tabellen lezen
//   (inkoopbonregels, inkoopfacturen, nacalculaties, eenheidsprijzen).
//
// Alles hier is puur lezen + rekenen; vaste sortering en afronding zodat twee
// runs op dezelfde data letterlijk dezelfde cijfers opleveren.

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  eenheidsprijzenTable,
  facturenTable,
  factuurRegelsTable,
  fieNacalculatiesTable,
  inkoopbonnenTable,
  inkoopbonRegelsTable,
} from "@workspace/db";

// Inkoophistorie: drie waarnemingen volstaan voor een gemeten verwachting
// (de opdracht schrijft deze grens expliciet voor; calculatiehistorie hanteert 5).
export const MIN_WAARNEMINGEN_INKOOP = 3;

// ── helpers (bewust identiek aan calculatieEigenCijfers) ───────────────────

function normaliseer(tekst: string): string {
  return tekst.toLowerCase().replace(/\s+/g, " ").trim();
}

function mediaan(waarden: number[]): number {
  const s = [...waarden].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function euro(n: number): string {
  return `€ ${n.toFixed(2)}`;
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function datumStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function periode(datums: Date[]): string {
  const tijden = datums.map((d) => d.getTime());
  return `${datumStr(new Date(Math.min(...tijden)))} t/m ${datumStr(new Date(Math.max(...tijden)))}`;
}

export function artikelSleutel(omschrijving: string, eenheid: string): string {
  return `${normaliseer(omschrijving)}|${normaliseer(eenheid)}`;
}

// ── datamodel ──────────────────────────────────────────────────────────────

interface Waarneming {
  prijs: number;
  datum: Date;
  leverancier: string | null;
  bron: "inkoopbon" | "inkoopfactuur";
}

export interface LeverancierHistorie {
  naam: string;
  mediaan: number;
  aantal: number;
  laatsteDatum: Date;
}

export interface PrijsStijging {
  leverancier: string;
  eerstePrijs: number;
  eersteDatum: Date;
  laatstePrijs: number;
  laatsteDatum: Date;
  stijgingPct: number;
}

export interface ArtikelHistorie {
  aantal: number;
  /** null zolang er minder dan MIN_WAARNEMINGEN_INKOOP waarnemingen zijn. */
  mediaan: number | null;
  laagste: number | null;
  hoogste: number | null;
  periode: string | null;
  bronnen: string;
  leveranciers: LeverancierHistorie[];
  stijgingen: PrijsStijging[];
}

/**
 * Haalt de eigen inkoophistorie op voor een set artikelen (match op
 * genormaliseerde omschrijving + eenheid — het enige gestructureerde
 * artikelkenmerk dat inkoopbon- en factuurregels hebben).
 *
 * Bronnen, fail-closed gefilterd:
 * - inkoopbonregels waarvan de bon besteld of geleverd is (concepten zijn
 *   geen betaling), leverancier van de bon;
 * - factuurregels van inkoopfacturen met status verwerkt/betaald
 *   (zelfde regel als CALCULATIE_AI_01), leverancier = relatienaam factuur.
 */
export async function haalInkoopHistorie(
  artikelen: Array<{ omschrijving: string; eenheid: string }>,
): Promise<Map<string, ArtikelHistorie>> {
  const gevraagd = new Set(artikelen.map((a) => artikelSleutel(a.omschrijving, a.eenheid)));
  const resultaat = new Map<string, ArtikelHistorie>();
  if (gevraagd.size === 0) return resultaat;

  const [bonRegels, factRegels] = await Promise.all([
    db.select({ regel: inkoopbonRegelsTable, bon: inkoopbonnenTable })
      .from(inkoopbonRegelsTable)
      .innerJoin(inkoopbonnenTable, eq(inkoopbonRegelsTable.inkoopbonId, inkoopbonnenTable.id))
      .where(and(
        isNotNull(inkoopbonRegelsTable.prijs),
        inArray(inkoopbonnenTable.status, ["besteld", "geleverd"]),
      )),
    db.select({ regel: factuurRegelsTable, factuur: facturenTable })
      .from(factuurRegelsTable)
      .innerJoin(facturenTable, eq(factuurRegelsTable.factuurId, facturenTable.id))
      .where(and(
        isNotNull(factuurRegelsTable.stukprijs),
        eq(facturenTable.type, "inkoop"),
        inArray(facturenTable.status, ["verwerkt", "betaald"]),
      )),
  ]);

  const perArtikel = new Map<string, Waarneming[]>();
  const voegToe = (sleutel: string, w: Waarneming): void => {
    if (!gevraagd.has(sleutel)) return;
    const lijst = perArtikel.get(sleutel) ?? [];
    lijst.push(w);
    perArtikel.set(sleutel, lijst);
  };
  for (const { regel, bon } of bonRegels) {
    voegToe(artikelSleutel(regel.omschrijving, regel.eenheid), {
      prijs: Number(regel.prijs), datum: regel.aangemaaktOp, leverancier: bon.leverancier, bron: "inkoopbon",
    });
  }
  for (const { regel, factuur } of factRegels) {
    if (regel.eenheid == null) continue;
    voegToe(artikelSleutel(regel.omschrijving, regel.eenheid), {
      prijs: Number(regel.stukprijs), datum: regel.aangemaaktOp, leverancier: factuur.relatienaam, bron: "inkoopfactuur",
    });
  }

  for (const sleutel of [...gevraagd].sort()) {
    const waarnemingen = (perArtikel.get(sleutel) ?? [])
      .sort((a, b) => a.datum.getTime() - b.datum.getTime() || a.prijs - b.prijs);
    const prijzen = waarnemingen.map((w) => w.prijs);
    const genoeg = waarnemingen.length >= MIN_WAARNEMINGEN_INKOOP;

    // Leveranciers met historie voor dit artikel (alfabetisch, deterministisch).
    const perLeverancier = new Map<string, Waarneming[]>();
    for (const w of waarnemingen) {
      if (!w.leverancier) continue;
      const lijst = perLeverancier.get(w.leverancier) ?? [];
      lijst.push(w);
      perLeverancier.set(w.leverancier, lijst);
    }
    const leveranciers: LeverancierHistorie[] = [...perLeverancier.entries()]
      .map(([naam, ws]) => ({
        naam,
        mediaan: mediaan(ws.map((w) => w.prijs)),
        aantal: ws.length,
        laatsteDatum: ws[ws.length - 1]!.datum,
      }))
      .sort((a, b) => a.naam.localeCompare(b.naam, "nl"));

    // Prijsontwikkeling: eerste vs. laatste waarneming per leverancier (≥2).
    const stijgingen: PrijsStijging[] = [];
    for (const [naam, ws] of [...perLeverancier.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl"))) {
      if (ws.length < 2) continue;
      const eerste = ws[0]!;
      const laatste = ws[ws.length - 1]!;
      if (laatste.prijs > eerste.prijs && eerste.prijs > 0) {
        stijgingen.push({
          leverancier: naam,
          eerstePrijs: eerste.prijs,
          eersteDatum: eerste.datum,
          laatstePrijs: laatste.prijs,
          laatsteDatum: laatste.datum,
          stijgingPct: ((laatste.prijs - eerste.prijs) / eerste.prijs) * 100,
        });
      }
    }

    const bronnen = [...new Set(waarnemingen.map((w) => w.bron))].sort().join(" + ");
    resultaat.set(sleutel, {
      aantal: waarnemingen.length,
      mediaan: genoeg ? mediaan(prijzen) : null,
      laagste: genoeg ? Math.min(...prijzen) : null,
      hoogste: genoeg ? Math.max(...prijzen) : null,
      periode: genoeg ? periode(waarnemingen.map((w) => w.datum)) : null,
      bronnen: bronnen || "geen",
      leveranciers,
      stijgingen,
    });
  }
  return resultaat;
}

/** Deterministische tekst "Leverancier (mediaan € x, n waarnemingen)" voor het veld aanbevolen_leverancier — een opsomming, geen keuze. */
export function leveranciersOpsomming(historie: ArtikelHistorie): string | null {
  if (historie.leveranciers.length === 0) return null;
  return historie.leveranciers
    .map((l) => `${l.naam} (mediaan ${euro(l.mediaan)}, ${l.aantal}x, laatst ${datumStr(l.laatsteDatum)})`)
    .join("; ");
}

// ── Blokken A t/m D — inkoopcontext voor de AI ─────────────────────────────

export function bouwInkoopEigenCijfersContext(
  items: Array<{ omschrijving: string; eenheid: string; calcPrijs: number | null }>,
  historie: Map<string, ArtikelHistorie>,
): string {
  const gesorteerd = [...items].sort((a, b) =>
    artikelSleutel(a.omschrijving, a.eenheid).localeCompare(artikelSleutel(b.omschrijving, b.eenheid), "nl"));

  const blokA: string[] = [];
  const blokB: string[] = [];
  const blokC: string[] = [];
  const blokD: string[] = [];

  for (const item of gesorteerd) {
    const naam = `"${item.omschrijving}" (${item.eenheid})`;
    const h = historie.get(artikelSleutel(item.omschrijving, item.eenheid));

    // A — wat FPS zelf betaalde
    if (!h || h.mediaan == null) {
      blokA.push(`- ${naam}: ${h?.aantal ?? 0} eigen waarneming(en) — te weinig (minimaal ${MIN_WAARNEMINGEN_INKOOP}). Verwachte inkoopprijs: ONBEKEND. Vul géén geschat bedrag in.`);
    } else {
      blokA.push(`- ${naam}: werkelijk betaald mediaan ${euro(h.mediaan)}, laagste ${euro(h.laagste!)}, hoogste ${euro(h.hoogste!)} — ${h.aantal} waarnemingen (${h.bronnen}), periode ${h.periode}.`);
    }

    // B — leveranciers met historie (opsomming, geen keuze)
    if (h && h.leveranciers.length > 0) {
      blokB.push(`- ${naam}: ${leveranciersOpsomming(h)}. Toon deze opties; kies er NIET één — de keuze is aan de inkoper.`);
    } else {
      blokB.push(`- ${naam}: geen leverancier met eigen leverhistorie. Beveel géén leverancier aan uit algemene kennis.`);
    }

    // C — prijsontwikkeling per leverancier
    if (h) {
      for (const s of h.stijgingen) {
        blokC.push(`- ${naam} bij ${s.leverancier}: ${euro(s.eerstePrijs)} (${datumStr(s.eersteDatum)}) → ${euro(s.laatstePrijs)} (${datumStr(s.laatsteDatum)}) = ${pct(s.stijgingPct)}. Signaal: prijsstijging benoemen.`);
      }
    }

    // D — calculatie tegenover eigen inkoop (signaal richting calculatiekant)
    if (h && h.mediaan != null && item.calcPrijs != null && h.mediaan > item.calcPrijs) {
      const verschil = h.mediaan - item.calcPrijs;
      blokD.push(`- ${naam}: eigen inkoopmediaan ${euro(h.mediaan)} ligt BOVEN de calculatieprijs ${euro(item.calcPrijs)} (${euro(verschil)}, ${pct((verschil / item.calcPrijs) * 100)}). Dit is een calculatieprobleem, geen inkoopprobleem — signaal terug naar de calculatiekant.`);
    }
  }

  return [
    `EIGEN INKOOPHISTORIE PER ARTIKEL (inkoopbonnen besteld/geleverd + verwerkte/betaalde inkoopfacturen; mediaan, nooit gemiddelde):`,
    blokA.length > 0 ? blokA.join("\n") : "(geen artikelen)",
    ``,
    `LEVERANCIERS MET EIGEN LEVERHISTORIE (de inkoper kiest, de AI niet):`,
    blokB.length > 0 ? blokB.join("\n") : "(geen artikelen)",
    ``,
    `PRIJSONTWIKKELING PER LEVERANCIER:`,
    blokC.length > 0 ? blokC.join("\n") : "(geen prijsstijgingen gesignaleerd in de eigen historie)",
    ``,
    `CALCULATIE TEGENOVER EIGEN INKOOP:`,
    blokD.length > 0 ? blokD.join("\n") : "(geen artikelen waar de eigen inkoopmediaan boven de calculatieprijs ligt)",
  ].join("\n");
}

// ── Blokken E en F — werkbegrotingscontext voor de AI ──────────────────────

export async function bouwWerkbegrotingEigenCijfersContext(
  regels: Array<{ omschrijving: string; eenheid: string }>,
): Promise<string> {
  const [nacalcs, eenheidsprijzen] = await Promise.all([
    db.select().from(fieNacalculatiesTable),
    db.select().from(eenheidsprijzenTable)
      .where(and(eq(eenheidsprijzenTable.actief, true), isNotNull(eenheidsprijzenTable.gemWerkelijkUren))),
  ]);

  // E — vergelijkbaar werk, werkelijk besteed (nacalculaties per werktype)
  const perWerktype = new Map<string, typeof nacalcs>();
  for (const n of nacalcs) {
    const lijst = perWerktype.get(n.werktype) ?? [];
    lijst.push(n);
    perWerktype.set(n.werktype, lijst);
  }
  const blokE: string[] = [];
  for (const [werktype, rijen] of [...perWerktype.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl"))) {
    if (rijen.length < MIN_WAARNEMINGEN_INKOOP) {
      blokE.push(`- werktype "${werktype}": ${rijen.length} afgeronde opdracht(en) met nacalculatie — te weinig (minimaal ${MIN_WAARNEMINGEN_INKOOP}) voor een betrouwbaar beeld; geen advies op baseren.`);
      continue;
    }
    const arb = rijen.map((r) => Number(r.afwijkingPctArbeid)).filter((v) => Number.isFinite(v));
    const mat = rijen.map((r) => Number(r.afwijkingPctMateriaal)).filter((v) => Number.isFinite(v));
    blokE.push(
      `- werktype "${werktype}" (${rijen.length} afgeronde opdrachten, nacalculatie): werkelijke arbeidsuren wijken mediaan ${arb.length > 0 ? pct(mediaan(arb)) : "?"} af van begroot; werkelijk materiaal wijkt mediaan ${mat.length > 0 ? pct(mediaan(mat)) : "?"} af.`,
    );
  }

  // F — normtijden tegenover werkelijkheid (eenheidsprijzenbibliotheek)
  const regelSleutels = new Set(regels.map((r) => artikelSleutel(r.omschrijving, r.eenheid)));
  const blokF: string[] = [];
  const kandidaten = eenheidsprijzen
    .map((e) => {
      const norm = Number(e.normtijd);
      const werkelijk = Number(e.gemWerkelijkUren);
      const afwijking = norm > 0 ? ((werkelijk - norm) / norm) * 100 : null;
      return { e, norm, werkelijk, afwijking };
    })
    .filter((k) => k.afwijking != null && Math.abs(k.afwijking) >= 15)
    .sort((a, b) => Math.abs(b.afwijking!) - Math.abs(a.afwijking!) || a.e.code.localeCompare(b.e.code, "nl"));
  for (const k of kandidaten.slice(0, 10)) {
    const inBegroting = regelSleutels.has(artikelSleutel(k.e.omschrijving, k.e.eenheid));
    blokF.push(
      `- ${k.e.code} "${k.e.omschrijving}" (${k.e.eenheid}): normtijd ${k.norm.toFixed(2)} u vs werkelijk gemeten ${k.werkelijk.toFixed(2)} u = ${pct(k.afwijking!)}${inBegroting ? " — DEZE POST ZIT IN DEZE BEGROTING" : ""}. Structurele afwijking: de normtijd werkt door in elke calculatie.`,
    );
  }

  return [
    `VERGELIJKBAAR WERK, WERKELIJK BESTEED (nacalculaties FPS; mediaan, nooit gemiddelde):`,
    blokE.length > 0 ? blokE.join("\n") : "(nog geen nacalculaties van afgeronde opdrachten — toets de begroting NIET aan verzonnen ervaringscijfers; benoem dat de eigen historie ontbreekt)",
    ``,
    `NORMTIJDEN TEGENOVER WERKELIJK BESTEDE TIJD (eenheidsprijzenbibliotheek, afwijking ≥ 15%):`,
    blokF.length > 0 ? blokF.join("\n") : (eenheidsprijzen.length === 0
      ? "(nog geen werkelijk-gemeten uren per eenheidsprijs beschikbaar)"
      : "(geen structurele afwijkingen ≥ 15% tussen normtijd en werkelijk gemeten uren)"),
  ].join("\n");
}

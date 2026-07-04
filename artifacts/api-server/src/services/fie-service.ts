// Financial Intelligence Engine (FIE) — centrale rekenmotor.
// Alle margeberekeningen, AK-normderivaties en context-analyses lopen via dit service-module.
// KRITISCH: berekenFieContext gebruikt DEZELFDE berekeningsvolgorde als detail.tsx (frontend),
// zodat projectomzet, kostprijs en margeadvies identiek zijn aan de getoonde calculatietotalen.
import { db, fieJaarbegrotingenTable, fieAkPostenTable, fieCapaciteitSnapshotsTable, modCalcHeadersTable, modCalcRegelsTable } from "@workspace/db";
import { medewerkersTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdviesStatus = "goed" | "neutraal" | "laag" | "leeg" | "geen_begroting";

export interface FieCalculatieContext {
  calculatieId: number;
  heeftBegroting: boolean;
  boekjaar: number | null;
  doelMargePct: number | null;
  akPerUur: number | null;
  // Directe kosten (spiegelt rawKosten in detail.tsx)
  totaalArbeid: number;
  totaalMateriaal: number;
  totaalOnderaanneming: number;
  totaalMu: number;
  // Kostprijs = directe kosten zonder opslagen (= rawKosten in detail.tsx)
  totaalExclOpslag: number;
  // Projectomzet = aanneemsom na korting (= totaal in detail.tsx)
  totaalInclOpslag: number;
  // FIE margeadvies
  akBijdrage: number | null;
  verwachteMargeAbs: number | null;
  verwachteMargePct: number | null;
  adviesStatus: AdviesStatus;
  adviesTekst: string;
  opslagAkPct: number;
}

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

export function rnd2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── AK-normderivatie ─────────────────────────────────────────────────────────

/**
 * Berekent het AK-bedrag per productief uur uit de actieve begroting:
 * totale actieve AK-posten / productieve uren doel.
 * Retourneert null als er geen begroting is of geen uren-doel.
 */
export async function berekenAkPerUur(boekjaar: number): Promise<number | null> {
  const [begroting] = await db
    .select()
    .from(fieJaarbegrotingenTable)
    .where(and(
      eq(fieJaarbegrotingenTable.boekjaar, boekjaar),
      eq(fieJaarbegrotingenTable.status, "actief"),
    ))
    .limit(1);

  if (!begroting) return null;
  if (begroting.akPerProductiefUur) return begroting.akPerProductiefUur;
  if (!begroting.productieveUrenDoel || begroting.productieveUrenDoel <= 0) return null;

  const posten = await db
    .select()
    .from(fieAkPostenTable)
    .where(and(
      eq(fieAkPostenTable.begrotingId, begroting.id),
      eq(fieAkPostenTable.actief, true),
    ));

  const totaalAk = posten.reduce((s, p) => s + p.bedragJaarbasis, 0);
  if (totaalAk <= 0) return null;
  return rnd2(totaalAk / begroting.productieveUrenDoel);
}

// ─── Live calculatie-context ──────────────────────────────────────────────────

/**
 * Berekent de volledige FIE-context voor een calculatie.
 *
 * Berekeningsvolgorde (identiek aan detail.tsx):
 *   matSubtotaal + matOpslag + arbSubtotaal + arbOpslag + OA + bouwplaats + staart = subtotaal
 *   subtotaal → AK/ABK/risico opslagen → basisWinst → winstOpslag → aanneemsom → korting → totaal
 *   rawKosten = mat + arb + OA + bouwplaats + staart (GEEN opslagen)
 *   marge = (totaal - rawKosten - fiNormAk) / totaal
 */
export async function berekenFieContext(calculatieId: number): Promise<FieCalculatieContext | null> {
  const [header] = await db
    .select()
    .from(modCalcHeadersTable)
    .where(eq(modCalcHeadersTable.id, calculatieId))
    .limit(1);

  if (!header) return null;

  const alleRegels = await db
    .select()
    .from(modCalcRegelsTable)
    .where(eq(modCalcRegelsTable.calculatieId, calculatieId));

  // ── Splits regels (zelfde als detail.tsx) ────────────────────────────────────
  const directeRegels    = alleRegels.filter((r) => !r.isStaartkosten && !r.isBouwplaatskosten);
  const bouwplaatsRegels = alleRegels.filter((r) => r.isBouwplaatskosten);
  const staartRegels     = alleRegels.filter((r) => r.isStaartkosten);

  // Bereken per-regel velden
  function regelMateriaal(r: typeof alleRegels[0]) {
    return (r.hoeveelheid ?? 0) * (r.tarief ?? 0);
  }
  function regelArbeid(r: typeof alleRegels[0]) {
    return (r.hoeveelheid ?? 0) * (r.muPerEenheid ?? 0) * (r.arbeidsTarief ?? 0);
  }
  function regelTotaal(r: typeof alleRegels[0]) {
    return regelMateriaal(r) + regelArbeid(r) + (r.onderaannemingBedrag ?? 0);
  }

  // ── Subtotalen (identiek aan detail.tsx regels 2263-2267) ────────────────────
  const matSubtotaal        = rnd2(directeRegels.reduce((s, r) => s + regelMateriaal(r), 0));
  const arbSubtotaal        = rnd2(directeRegels.reduce((s, r) => s + regelArbeid(r), 0));
  const oaSubtotaal         = rnd2(directeRegels.reduce((s, r) => s + (r.onderaannemingBedrag ?? 0), 0));
  const bouwplaatsSubtotaal = rnd2(bouwplaatsRegels.reduce((s, r) => s + regelTotaal(r), 0));
  const staartSubtotaal     = rnd2(staartRegels.reduce((s, r) => s + regelTotaal(r), 0));

  // Directe kosten (rawKosten in detail.tsx regel 2290 — GEEN opslagen)
  const rawKosten = rnd2(matSubtotaal + arbSubtotaal + oaSubtotaal + bouwplaatsSubtotaal + staartSubtotaal);

  // Totaal MU (alle regels incl. bouwplaats/staart)
  const totaalMu = rnd2(alleRegels.reduce((s, r) => s + (r.hoeveelheid ?? 0) * (r.muPerEenheid ?? 0), 0));

  // ── Materiaal- en arbeidopslag ────────────────────────────────────────────────
  const opslagMateriaal = header.opslagMateriaal ?? 0;
  const opslagArbeid    = header.opslagArbeid ?? 0;
  const matOpslagBedrag = rnd2(matSubtotaal * opslagMateriaal / 100);
  const arbOpslagBedrag = rnd2(arbSubtotaal * opslagArbeid / 100);

  // ── Subtotaal (basis voor AK/ABK/risico — identiek aan detail.tsx regel 2280) ─
  const subtotaal = rnd2(
    matSubtotaal + matOpslagBedrag +
    arbSubtotaal + arbOpslagBedrag +
    oaSubtotaal + bouwplaatsSubtotaal + staartSubtotaal
  );

  const opslagAk     = header.opslagAk ?? 0;
  const opslagAbk    = header.opslagAbk ?? 0;
  const opslagRisico = header.opslagRisico ?? 0;
  const opslagWinst  = header.opslagWinst ?? 0;
  const korting      = header.korting ?? 0;

  // ── AK/ABK/risico opslagen op subtotaal (identiek aan detail.tsx regels 2281-2283) ─
  const akBedrag     = header.akIsVast     ? rnd2(opslagAk)     : rnd2(subtotaal * opslagAk / 100);
  const abkBedrag    = header.abkIsVast    ? rnd2(opslagAbk)    : rnd2(subtotaal * opslagAbk / 100);
  const risicoBedrag = header.risicoIsVast ? rnd2(opslagRisico) : rnd2(subtotaal * opslagRisico / 100);

  // ── Winstopslag op basisWinst (identiek aan detail.tsx regels 2284-2285) ─────
  const basisWinst  = rnd2(subtotaal + akBedrag + abkBedrag + risicoBedrag);
  const winstBedrag = header.winstIsVast ? rnd2(opslagWinst) : rnd2(basisWinst * opslagWinst / 100);

  // ── Aanneemsom en korting (identiek aan detail.tsx regels 2286-2288) ─────────
  const aanneemsom    = rnd2(basisWinst + winstBedrag);
  const kortingBedrag = rnd2(aanneemsom * korting / 100);
  const totaal        = rnd2(aanneemsom - kortingBedrag);  // = projectomzet

  // ── Actieve jaarbegroting ─────────────────────────────────────────────────────
  const huidigJaar = new Date().getFullYear();
  const [activeBegroting] = await db
    .select()
    .from(fieJaarbegrotingenTable)
    .where(and(
      eq(fieJaarbegrotingenTable.boekjaar, huidigJaar),
      eq(fieJaarbegrotingenTable.status, "actief"),
    ))
    .limit(1);

  const [fallbackBegroting] = activeBegroting ? [] : await db
    .select()
    .from(fieJaarbegrotingenTable)
    .orderBy(desc(fieJaarbegrotingenTable.boekjaar))
    .limit(1);

  const begroting = activeBegroting ?? fallbackBegroting ?? null;
  const heeftBegroting = !!begroting;

  // ── Effectief AK/uur (handmatig norm || berekend uit AK-posten) ───────────────
  let effectiefAkPerUur: number | null = begroting?.akPerProductiefUur ?? null;
  if (!effectiefAkPerUur && begroting) {
    effectiefAkPerUur = await berekenAkPerUur(begroting.boekjaar);
  }

  // ── FIE margeadvies ──────────────────────────────────────────────────────────
  let akBijdrageFie: number | null = null;
  let verwachteMargeAbs: number | null = null;
  let verwachteMargePct: number | null = null;
  let adviesStatus: AdviesStatus = "geen_begroting";
  let adviesTekst = "Geen actieve jaarbegroting gevonden. Stel een begroting in via Beheer > Bedrijfskompas.";

  if (begroting) {
    if (effectiefAkPerUur !== null && totaalMu > 0) {
      akBijdrageFie = rnd2(effectiefAkPerUur * totaalMu);
    }

    const doelMargePct = begroting.doelMargePct;

    if (totaal > 0) {
      // Brutowinst = projectomzet - directe kosten - FIE AK-bijdrage
      // Gebruik FIE-normatieve AK, niet de calculatie-opslag-AK
      const akKosten = akBijdrageFie ?? akBedrag;
      verwachteMargeAbs = rnd2(totaal - rawKosten - akKosten);
      verwachteMargePct = rnd2((verwachteMargeAbs / totaal) * 100);

      const afwijking = verwachteMargePct - doelMargePct;
      if (afwijking >= 2) {
        adviesStatus = "goed";
        adviesTekst = `Verwachte marge ${verwachteMargePct.toFixed(1)}% — boven de doelmarge van ${doelMargePct}%.`;
      } else if (afwijking >= -2) {
        adviesStatus = "neutraal";
        adviesTekst = `Verwachte marge ${verwachteMargePct.toFixed(1)}% — dicht bij de doelmarge van ${doelMargePct}%.`;
      } else {
        adviesStatus = "laag";
        adviesTekst = `Verwachte marge ${verwachteMargePct.toFixed(1)}% — onder de doelmarge van ${doelMargePct}%. Overweeg tarieven of AK-opslag aan te passen.`;
      }
    } else {
      adviesStatus = "leeg";
      adviesTekst = "Calculatie heeft nog geen regels.";
    }
  }

  return {
    calculatieId,
    heeftBegroting,
    boekjaar: begroting?.boekjaar ?? null,
    doelMargePct: begroting?.doelMargePct ?? null,
    akPerUur: effectiefAkPerUur,
    totaalArbeid: arbSubtotaal,
    totaalMateriaal: matSubtotaal,
    totaalOnderaanneming: oaSubtotaal,
    totaalMu,
    totaalExclOpslag: rawKosten,       // = directe kostprijs (geen opslagen)
    totaalInclOpslag: totaal,          // = projectomzet (aanneemsom na korting)
    akBijdrage: akBijdrageFie,
    verwachteMargeAbs,
    verwachteMargePct,
    adviesStatus,
    adviesTekst,
    opslagAkPct: opslagAk,
  };
}

// ─── HRM-afgeleid capaciteitsoverzicht ───────────────────────────────────────

export interface FieCapaciteitResultaat {
  boekjaar: number;
  // HRM-afgeleid (uit contracturen_per_week van actieve medewerkers)
  aantalMedewerkersHrm: number;
  totaalContractUrenPerWeek: number;
  totaalBrutoUrenJaar: number;       // contracturen × 52
  totaalProductieveUrenHrm: number;  // bruto × 0.877 (52-6,5 weken)/52
  totaalFteHrm: number;              // contracturen / 40
  // Snapshots (handmatig ingevoerd)
  aantalSnapshots: number;
  totaalProductieveUrenSnapshots: number;
  // Effectief (voorkeur: snapshots als aanwezig, anders HRM)
  effectieveProductieveUren: number;
  bron: "snapshot" | "hrm" | "leeg";
}

/**
 * berekenCapaciteit: leidt productieve uren af uit HRM-contracturen + snapshots.
 * Productiviteitsfactor: 52 werkbare weken − 6.5 verlof/ziekte/feestdagen = 45.5 weken → factor 45.5/52 ≈ 0.875
 */
export async function berekenCapaciteit(boekjaar: number): Promise<FieCapaciteitResultaat> {
  const PRODUCTIVITEITSFACTOR = 45.5 / 52; // ~87.5% van bruto uren zijn productief
  const STANDAARD_UU_PER_WEEK = 40;

  // HRM: actieve medewerkers met contracturen
  const actieveMedewerkers = await db
    .select({ contracturenPerWeek: medewerkersTable.contracturenPerWeek })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.actief, true));

  const aantalMedewerkersHrm = actieveMedewerkers.length;
  const totaalContractUrenPerWeek = rnd2(
    actieveMedewerkers.reduce((s, m) => s + (m.contracturenPerWeek ?? STANDAARD_UU_PER_WEEK), 0)
  );
  const totaalBrutoUrenJaar = rnd2(totaalContractUrenPerWeek * 52);
  const totaalProductieveUrenHrm = rnd2(totaalBrutoUrenJaar * PRODUCTIVITEITSFACTOR);
  const totaalFteHrm = rnd2(totaalContractUrenPerWeek / STANDAARD_UU_PER_WEEK);

  // Snapshots voor dit boekjaar
  const snapshots = await db
    .select()
    .from(fieCapaciteitSnapshotsTable)
    .where(eq(fieCapaciteitSnapshotsTable.boekjaar, boekjaar));

  const totaalProductieveUrenSnapshots = rnd2(snapshots.reduce((s, r) => s + r.productieveUren, 0));
  const aantalSnapshots = snapshots.length;

  // Effectieve uren: snapshots hebben voorrang (expliciet ingevoerd), anders HRM-afleiding
  let effectieveProductieveUren = 0;
  let bron: "snapshot" | "hrm" | "leeg" = "leeg";

  if (aantalSnapshots > 0 && totaalProductieveUrenSnapshots > 0) {
    effectieveProductieveUren = totaalProductieveUrenSnapshots;
    bron = "snapshot";
  } else if (aantalMedewerkersHrm > 0) {
    effectieveProductieveUren = totaalProductieveUrenHrm;
    bron = "hrm";
  }

  return {
    boekjaar,
    aantalMedewerkersHrm,
    totaalContractUrenPerWeek,
    totaalBrutoUrenJaar,
    totaalProductieveUrenHrm,
    totaalFteHrm,
    aantalSnapshots,
    totaalProductieveUrenSnapshots,
    effectieveProductieveUren,
    bron,
  };
}

// ─── Doelmarge en AK-normoverzicht voor een begroting ────────────────────────

export interface FieDoelmargeResultaat {
  begrotingId: number;
  boekjaar: number;
  doelMargePct: number;
  omzetDoel: number | null;
  directeKostenDoel: number | null;
  productieveUrenDoel: number | null;
  akPerProductiefUurHandmatig: number | null;
  totaalAkPosten: number;
  akPerUurBerekend: number | null;   // uit AK-posten / productieve uren
  effectiefAkPerUur: number | null;  // handmatig || berekend
  verdeelsleutel: string;
}

/**
 * berekenDoelmarge: retourneert doelmarge, AK-norm en omzetdoelen voor een begroting.
 * Combineert de begrotingsdata met de berekende AK-norm.
 */
export async function berekenDoelmarge(begrotingId: number): Promise<FieDoelmargeResultaat | null> {
  const [begroting] = await db
    .select()
    .from(fieJaarbegrotingenTable)
    .where(eq(fieJaarbegrotingenTable.id, begrotingId))
    .limit(1);

  if (!begroting) return null;

  const akPosten = await db
    .select()
    .from(fieAkPostenTable)
    .where(and(
      eq(fieAkPostenTable.begrotingId, begrotingId),
      eq(fieAkPostenTable.actief, true),
    ));

  const totaalAkPosten = rnd2(akPosten.reduce((s, p) => s + p.bedragJaarbasis, 0));
  const productieveUren = begroting.productieveUrenDoel;
  const akPerUurBerekend = (productieveUren && productieveUren > 0 && totaalAkPosten > 0)
    ? rnd2(totaalAkPosten / productieveUren)
    : null;
  const effectiefAkPerUur = begroting.akPerProductiefUur ?? akPerUurBerekend;

  return {
    begrotingId,
    boekjaar: begroting.boekjaar,
    doelMargePct: begroting.doelMargePct,
    omzetDoel: begroting.omzetDoel ?? null,
    directeKostenDoel: begroting.directeKostenDoel ?? null,
    productieveUrenDoel: productieveUren ?? null,
    akPerProductiefUurHandmatig: begroting.akPerProductiefUur ?? null,
    totaalAkPosten,
    akPerUurBerekend,
    effectiefAkPerUur,
    verdeelsleutel: begroting.verdeelsleutel,
  };
}

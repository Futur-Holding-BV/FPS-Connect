// Financial Intelligence Engine (FIE) — centrale rekenmotor.
// Alle margeberekeningen, AK-normderivaties en context-analyses lopen via dit service-module.
// KRITISCH: berekenFieContext gebruikt DEZELFDE berekeningsvolgorde als detail.tsx (frontend),
// zodat projectomzet, kostprijs en margeadvies identiek zijn aan de getoonde calculatietotalen.
import {
  db,
  fieJaarbegrotingenTable, fieAkPostenTable, fieCapaciteitSnapshotsTable, fieObservatiesTable,
  fieNacalculatiesTable, fieLeerMomentenTable,
  modCalcHeadersTable, modCalcRegelsTable,
  offertesTable, offerteSjablonenTable,
  opdrachtenTable, onderhandenWerkOverridesTable,
  projectBegrotingenTable,
  urenRegistratiesTable,
  voorraadMutatiesTable, artikelenTable,
} from "@workspace/db";
import { medewerkersTable } from "@workspace/db/schema";
import { eq, and, desc, gte, lt, inArray, isNull } from "drizzle-orm";

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

  const posten = await db
    .select()
    .from(fieAkPostenTable)
    .where(and(
      eq(fieAkPostenTable.begrotingId, begroting.id),
      eq(fieAkPostenTable.actief, true),
    ));

  const totaalAk = posten.reduce((s, p) => s + p.bedragJaarbasis, 0);
  if (totaalAk <= 0) return null;

  // Prioriteit: handmatig ingesteld uren-doel → HRM-afleiding (berekenCapaciteit)
  let productieveUren: number | null = begroting.productieveUrenDoel ?? null;
  if (!productieveUren || productieveUren <= 0) {
    const cap = await berekenCapaciteit(boekjaar);
    productieveUren = cap.effectieveProductieveUren > 0 ? cap.effectieveProductieveUren : null;
  }

  if (!productieveUren || productieveUren <= 0) return null;
  return rnd2(totaalAk / productieveUren);
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

  // ── Effectief AK/uur (handmatig norm || berekend uit AK-posten || HRM-afgeleid) ──
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

// ─── FIE Fase 3 — Continue jaarbedrijfsprognose ───────────────────────────────

const WINKANS_PER_STATUS: Record<string, number> = {
  concept:  0.20,
  verzonden: 0.40,
  bekeken:  0.60,
};
const BEVESTIGDE_STATUSSEN = new Set(["akkoord", "ondertekend"]);
const PIPELINE_STATUSSEN   = new Set(["concept", "verzonden", "bekeken"]);

function kwartaalVanDatum(d: Date): 1 | 2 | 3 | 4 {
  return Math.ceil((d.getUTCMonth() + 1) / 3) as 1 | 2 | 3 | 4;
}

export interface FieKwartaalPrognose {
  kwartaal: 1 | 2 | 3 | 4;
  bevestigd: number;
  pipeline_gewogen: number;
  prognose: number;
}

export interface FiePrognoseObservatie {
  type: string;
  ernst: "info" | "waarschuwing" | "kritiek";
  omschrijving: string;
  waarde: number | null;
  drempelwaarde: number | null;
  afwijking_pct: number | null;
  impact: string | null;
  advies: string | null;
  betrouwbaarheidsscore: number | null;
}

export interface FieWerkmaatschappijPrognose {
  werkmaatschappij: string;
  bevestigd: number;
  pipeline_gewogen: number;
  prognose: number;
}

export interface FieJaarprognoseResultaat {
  boekjaar: number;
  heeft_begroting: boolean;
  omzet_doel: number | null;
  doel_marge_pct: number | null;
  totaal_ak: number;
  bevestigde_omzet: number;
  aantal_bevestigde_offertes: number;
  gewogen_pipeline: number;
  pijplijn_bruto: number;
  aantal_pipeline_offertes: number;
  ohw_restwaarde: number;
  aantal_ohw_opdrachten: number;
  prognose_omzet: number;
  prognose_inclusief_ohw: number;
  coverage_pct: number | null;
  gap_tot_doel: number | null;
  ak_dekkingsgraad_pct: number | null;
  break_even_omzet: number | null;
  break_even_bereikt: boolean | null;
  prognose_brutowinst: number | null;
  prognose_nettoresultaat: number | null;
  kwartaal_verdeling: FieKwartaalPrognose[];
  begroting_per_kwartaal: { kwartaal: 1 | 2 | 3 | 4; begroting: number }[];
  observaties: FiePrognoseObservatie[];
  werkmaatschappij_verdeling: FieWerkmaatschappijPrognose[];
}

// ─── Per-type observatie metadata ────────────────────────────────────────────

const OBSERVATIE_META: Record<string, { impact: string; advies: string; score: number }> = {
  geen_begroting:   { impact: "Prognose zonder referentiekader — vergelijking niet mogelijk.", advies: "Stel een actieve jaarbegroting in via Beheer › FIE Begroting.", score: 100 },
  omzet_risico:     { impact: "Significante omzetderving: prognose dekt minder dan 80% van het doel.", advies: "Versterk de pipeline direct of pas het omzetdoel aan.", score: 90 },
  omzet_achterstand:{ impact: "Omzetdoelstelling waarschijnlijk niet gehaald.", advies: "Zoek aanvullende offertemogelijkheden of stel verwachtingen bij.", score: 85 },
  omzet_voorsprong: { impact: "Omzetdoel wordt overtroffen — capaciteitsdruk mogelijk.", advies: "Controleer of de beschikbare productieve uren de extra omzet kunnen dragen.", score: 88 },
  break_even_risico:{ impact: "Algemene kosten (AK) worden niet volledig gedekt bij doelmarge.", advies: "Vul de orderportefeuille aan of verlaag de AK-basis.", score: 92 },
  ak_onderdekking:  { impact: "Verliesgevend resultaat bij huidige omzetprognose en kostprijzen.", advies: "Verhoog uurtarieven of verlaag de AK-posten.", score: 88 },
  lege_pipeline:    { impact: "Geen zichtbaar orderboek voor dit boekjaar.", advies: "Controleer of offertes in het juiste boekjaar zijn aangemaakt.", score: 95 },
};

function observatieMetadata(type: string): { impact: string | null; advies: string | null; betrouwbaarheidsscore: number | null } {
  const m = OBSERVATIE_META[type];
  if (!m) return { impact: null, advies: null, betrouwbaarheidsscore: null };
  return { impact: m.impact, advies: m.advies, betrouwbaarheidsscore: m.score };
}

export async function berekenJaarprognose(boekjaar: number): Promise<FieJaarprognoseResultaat> {
  const jaarStart = new Date(`${boekjaar}-01-01T00:00:00.000Z`);
  const jaarEind  = new Date(`${boekjaar + 1}-01-01T00:00:00.000Z`);

  // 1. Actieve begroting + doelmarge + AK-totaal
  const [activeBegroting] = await db
    .select()
    .from(fieJaarbegrotingenTable)
    .where(and(
      eq(fieJaarbegrotingenTable.boekjaar, boekjaar),
      eq(fieJaarbegrotingenTable.status, "actief"),
    ))
    .orderBy(desc(fieJaarbegrotingenTable.id))
    .limit(1);

  const begroting    = activeBegroting ?? null;
  const omzetDoel    = begroting?.omzetDoel ?? null;
  const doelMargePct = begroting?.doelMargePct ?? null;

  let totaalAk = 0;
  if (begroting) {
    const akPosten = await db
      .select({ bedrag: fieAkPostenTable.bedragJaarbasis })
      .from(fieAkPostenTable)
      .where(and(
        eq(fieAkPostenTable.begrotingId, begroting.id),
        eq(fieAkPostenTable.actief, true),
      ));
    totaalAk = rnd2(akPosten.reduce((s, p) => s + p.bedrag, 0));
  }

  // 2. Offertes aangemaakt in dit boekjaar (inclusief datum voor kwartaalindeling)
  const alleOffertes = await db
    .select({
      id:              offertesTable.id,
      status:          offertesTable.status,
      bedragExclBtw:   offertesTable.bedragExclBtw,
      aangemaaktOp:    offertesTable.aangemaaktOp,
      werkmaatschappij: offerteSjablonenTable.werkmaatschappij,
    })
    .from(offertesTable)
    .leftJoin(offerteSjablonenTable, eq(offertesTable.sjabloonId, offerteSjablonenTable.id))
    .where(and(
      gte(offertesTable.aangemaaktOp, jaarStart),
      lt(offertesTable.aangemaaktOp, jaarEind),
    ));

  const bevestigdeOffertes = alleOffertes.filter(o => BEVESTIGDE_STATUSSEN.has(o.status));
  const pipelineOffertes   = alleOffertes.filter(o => PIPELINE_STATUSSEN.has(o.status));

  const bevestigdeOmzet = rnd2(bevestigdeOffertes.reduce((s, o) => s + o.bedragExclBtw, 0));
  const pijplijnBruto   = rnd2(pipelineOffertes.reduce((s, o) => s + o.bedragExclBtw, 0));
  const gewogenPipeline = rnd2(pipelineOffertes.reduce((s, o) =>
    s + o.bedragExclBtw * (WINKANS_PER_STATUS[o.status] ?? 0), 0));

  // Kwartaalverdeling
  const kd: Record<number, { bevestigd: number; pipeline: number }> = {
    1: { bevestigd: 0, pipeline: 0 },
    2: { bevestigd: 0, pipeline: 0 },
    3: { bevestigd: 0, pipeline: 0 },
    4: { bevestigd: 0, pipeline: 0 },
  };
  for (const o of alleOffertes) {
    const kw = kwartaalVanDatum(new Date(o.aangemaaktOp));
    if (BEVESTIGDE_STATUSSEN.has(o.status)) {
      kd[kw].bevestigd += o.bedragExclBtw;
    } else if (PIPELINE_STATUSSEN.has(o.status)) {
      kd[kw].pipeline += o.bedragExclBtw * (WINKANS_PER_STATUS[o.status] ?? 0);
    }
  }
  const kwartaalVerdeling: FieKwartaalPrognose[] = ([1, 2, 3, 4] as const).map(kw => ({
    kwartaal: kw,
    bevestigd:        rnd2(kd[kw].bevestigd),
    pipeline_gewogen: rnd2(kd[kw].pipeline),
    prognose:         rnd2(kd[kw].bevestigd + kd[kw].pipeline),
  }));

  // Per-werkmaatschappij verdeling
  const wmMap: Record<string, { bevestigd: number; pipeline: number }> = {};
  for (const o of alleOffertes) {
    const wm = o.werkmaatschappij || "Onbekend";
    if (!wmMap[wm]) wmMap[wm] = { bevestigd: 0, pipeline: 0 };
    if (BEVESTIGDE_STATUSSEN.has(o.status)) {
      wmMap[wm].bevestigd += o.bedragExclBtw;
    } else if (PIPELINE_STATUSSEN.has(o.status)) {
      wmMap[wm].pipeline += o.bedragExclBtw * (WINKANS_PER_STATUS[o.status] ?? 0);
    }
  }
  const werkmaatschappijVerdeling: FieWerkmaatschappijPrognose[] = Object.entries(wmMap)
    .map(([wm, v]) => ({
      werkmaatschappij: wm,
      bevestigd:        rnd2(v.bevestigd),
      pipeline_gewogen: rnd2(v.pipeline),
      prognose:         rnd2(v.bevestigd + v.pipeline),
    }))
    .sort((a, b) => b.prognose - a.prognose);

  // 3. OHW restwaarde — actieve opdrachten in dit boekjaar met OHW-override
  const actieveOpdrachten = await db
    .select({ id: opdrachtenTable.id, offerteId: opdrachtenTable.offerteId })
    .from(opdrachtenTable)
    .where(and(
      eq(opdrachtenTable.status, "actief"),
      gte(opdrachtenTable.aangemaaktOp, jaarStart),
      lt(opdrachtenTable.aangemaaktOp, jaarEind),
    ));

  let ohwRestwaarde       = 0;
  let aantalOhwOpdrachten = 0;

  if (actieveOpdrachten.length > 0) {
    const opdrachtIds = actieveOpdrachten.map(o => o.id);
    const overrides   = await db
      .select()
      .from(onderhandenWerkOverridesTable)
      .where(inArray(onderhandenWerkOverridesTable.opdrachtId, opdrachtIds));

    const offerteIds = actieveOpdrachten
      .filter(o => o.offerteId != null)
      .map(o => o.offerteId as number);

    const offerteBedragen = offerteIds.length > 0
      ? await db
          .select({ id: offertesTable.id, bedragExclBtw: offertesTable.bedragExclBtw })
          .from(offertesTable)
          .where(inArray(offertesTable.id, offerteIds))
      : [];

    const bedragMap = new Map(offerteBedragen.map(o => [o.id, o.bedragExclBtw]));

    for (const ov of overrides) {
      const opdracht = actieveOpdrachten.find(o => o.id === ov.opdrachtId);
      if (!opdracht?.offerteId) continue;
      const bedrag = bedragMap.get(opdracht.offerteId) ?? 0;
      if (bedrag <= 0) continue;
      ohwRestwaarde += bedrag * Math.max(0, 1 - (ov.percentageGereed ?? 0) / 100);
      aantalOhwOpdrachten++;
    }
    ohwRestwaarde = rnd2(ohwRestwaarde);
  }

  // 4. Prognose totaal + financiële KPI's
  const prognoseOmzet        = rnd2(bevestigdeOmzet + gewogenPipeline);
  const prognoseInclusiefOhw = rnd2(prognoseOmzet + ohwRestwaarde);
  const coveragePct = omzetDoel != null && omzetDoel > 0
    ? rnd2((prognoseOmzet / omzetDoel) * 100)
    : null;
  const gapTotDoel = omzetDoel != null
    ? rnd2(omzetDoel - prognoseOmzet)
    : null;

  // AK-dekkingsgraad: hoe groot is de prognose t.o.v. totale AK-last
  const akDekkingsgraadPct = totaalAk > 0
    ? rnd2((prognoseOmzet / totaalAk) * 100)
    : null;

  // Break-even: minimale omzet om AK te dekken bij de gewenste nettomarge
  const breakEvenOmzet =
    doelMargePct != null && doelMargePct > 0 && doelMargePct < 100 && totaalAk > 0
      ? rnd2(totaalAk / (1 - doelMargePct / 100))
      : null;

  // 5. Observaties genereren
  const observaties: FiePrognoseObservatie[] = [];

  if (!begroting) {
    const t = "geen_begroting";
    observaties.push({
      type: t, ernst: "info",
      omschrijving: `Geen actieve jaarbegroting gevonden voor ${boekjaar}. Stel een begroting in via Bedrijfskompas.`,
      waarde: null, drempelwaarde: null, afwijking_pct: null,
      ...observatieMetadata(t),
    });
  } else {
    if (omzetDoel != null && omzetDoel > 0 && coveragePct !== null) {
      if (coveragePct < 80) {
        const t = "omzet_risico";
        observaties.push({
          type: t, ernst: "kritiek",
          omschrijving: `Prognose dekt slechts ${coveragePct.toFixed(1)}% van het omzetdoel. Significante achterstand — pipeline versterken.`,
          waarde: prognoseOmzet, drempelwaarde: omzetDoel,
          afwijking_pct: rnd2(coveragePct - 100),
          ...observatieMetadata(t),
        });
      } else if (coveragePct < 95) {
        const t = "omzet_achterstand";
        observaties.push({
          type: t, ernst: "waarschuwing",
          omschrijving: `Prognose is ${(100 - coveragePct).toFixed(1)}% onder het omzetdoel. Pipeline versterken of verwachtingen bijstellen.`,
          waarde: prognoseOmzet, drempelwaarde: omzetDoel,
          afwijking_pct: rnd2(coveragePct - 100),
          ...observatieMetadata(t),
        });
      } else if (coveragePct > 110) {
        const t = "omzet_voorsprong";
        observaties.push({
          type: t, ernst: "info",
          omschrijving: `Prognose overtreft het omzetdoel met ${(coveragePct - 100).toFixed(1)}%. Controleer de beschikbare capaciteit.`,
          waarde: prognoseOmzet, drempelwaarde: omzetDoel,
          afwijking_pct: rnd2(coveragePct - 100),
          ...observatieMetadata(t),
        });
      }
    }

    if (breakEvenOmzet != null && prognoseOmzet < breakEvenOmzet) {
      const t = "break_even_risico";
      observaties.push({
        type: t,
        ernst: prognoseOmzet < breakEvenOmzet * 0.8 ? "kritiek" : "waarschuwing",
        omschrijving: `Prognose ligt onder break-even (€ ${breakEvenOmzet.toLocaleString("nl-NL", { maximumFractionDigits: 0 })}). AK wordt niet volledig gedekt bij doelmarge ${doelMargePct?.toFixed(1)}%.`,
        waarde: prognoseOmzet, drempelwaarde: breakEvenOmzet,
        afwijking_pct: rnd2(((prognoseOmzet / breakEvenOmzet) - 1) * 100),
        ...observatieMetadata(t),
      });
    }

    if (akDekkingsgraadPct !== null && akDekkingsgraadPct < 100) {
      const t = "ak_onderdekking";
      observaties.push({
        type: t, ernst: "waarschuwing",
        omschrijving: `Prognose dekt slechts ${akDekkingsgraadPct.toFixed(1)}% van de totale AK (€ ${totaalAk.toLocaleString("nl-NL", { maximumFractionDigits: 0 })}). Kosten worden niet volledig gedekt.`,
        waarde: prognoseOmzet, drempelwaarde: totaalAk,
        afwijking_pct: rnd2(akDekkingsgraadPct - 100),
        ...observatieMetadata(t),
      });
    }
  }

  if (bevestigdeOffertes.length === 0 && pipelineOffertes.length === 0) {
    const t = "lege_pipeline";
    observaties.push({
      type: t, ernst: "waarschuwing",
      omschrijving: `Geen offertes aangetroffen in ${boekjaar}. Controleer of offertes in dit boekjaar zijn aangemaakt.`,
      waarde: 0, drempelwaarde: null, afwijking_pct: null,
      ...observatieMetadata(t),
    });
  }

  // Afgeleid: brutowinst, nettoresultaat, break-even status, begroting-kwartaalverdeling
  const prognoseBrutowinst =
    doelMargePct != null && doelMargePct > 0
      ? rnd2(prognoseOmzet * (doelMargePct / 100))
      : null;
  const prognoseNettoresultaat =
    prognoseBrutowinst != null
      ? rnd2(prognoseBrutowinst - totaalAk)
      : null;
  const breakEvenBereikt =
    breakEvenOmzet != null ? prognoseOmzet >= breakEvenOmzet : null;

  // Begroting per kwartaal (gelijkmatige spreiding van omzetDoel over 4 kwartalen)
  const begrotingPerKwartaal: { kwartaal: 1 | 2 | 3 | 4; begroting: number }[] =
    omzetDoel != null
      ? ([1, 2, 3, 4] as const).map(kw => ({
          kwartaal: kw,
          begroting: rnd2(omzetDoel / 4),
        }))
      : [];

  // 6. Observaties persisteren (vervang alle observaties voor dit boekjaar)
  await db.delete(fieObservatiesTable).where(eq(fieObservatiesTable.boekjaar, boekjaar));
  if (observaties.length > 0) {
    await db.insert(fieObservatiesTable).values(
      observaties.map(o => ({
        boekjaar,
        type:          o.type,
        ernst:         o.ernst,
        omschrijving:  o.omschrijving,
        waarde:        o.waarde ?? undefined,
        drempelwaarde: o.drempelwaarde ?? undefined,
        afwijkingPct:  o.afwijking_pct ?? undefined,
      }))
    );
  }

  return {
    boekjaar,
    heeft_begroting:            !!begroting,
    omzet_doel:                 omzetDoel,
    doel_marge_pct:             doelMargePct,
    totaal_ak:                  totaalAk,
    bevestigde_omzet:           bevestigdeOmzet,
    aantal_bevestigde_offertes: bevestigdeOffertes.length,
    gewogen_pipeline:           gewogenPipeline,
    pijplijn_bruto:             pijplijnBruto,
    aantal_pipeline_offertes:   pipelineOffertes.length,
    ohw_restwaarde:             ohwRestwaarde,
    aantal_ohw_opdrachten:      aantalOhwOpdrachten,
    prognose_omzet:             prognoseOmzet,
    prognose_inclusief_ohw:     prognoseInclusiefOhw,
    coverage_pct:               coveragePct,
    gap_tot_doel:               gapTotDoel,
    ak_dekkingsgraad_pct:       akDekkingsgraadPct,
    break_even_omzet:           breakEvenOmzet,
    break_even_bereikt:         breakEvenBereikt,
    prognose_brutowinst:        prognoseBrutowinst,
    prognose_nettoresultaat:    prognoseNettoresultaat,
    kwartaal_verdeling:         kwartaalVerdeling,
    begroting_per_kwartaal:     begrotingPerKwartaal,
    observaties,
    werkmaatschappij_verdeling: werkmaatschappijVerdeling,
  };
}

// ─── Opgeslagen prognose-observaties lezen ───────────────────────────────────
export async function leesPrognoseObservaties(boekjaar: number): Promise<FiePrognoseObservatie[]> {
  const rows = await db
    .select()
    .from(fieObservatiesTable)
    .where(eq(fieObservatiesTable.boekjaar, boekjaar))
    .orderBy(fieObservatiesTable.id);
  return rows.map(r => ({
    type:          r.type,
    ernst:         r.ernst as "info" | "waarschuwing" | "kritiek",
    omschrijving:  r.omschrijving,
    waarde:        r.waarde ?? null,
    drempelwaarde: r.drempelwaarde ?? null,
    afwijking_pct: r.afwijkingPct ?? null,
    ...observatieMetadata(r.type),
  }));
}

// ─── Fase 5: Nacalculatie & Leereffecten ─────────────────────────────────────

const AFWIJKING_DREMPEL = 10; // procent — structurele afwijking drempel voor leermoment-impact

/**
 * Berekent de nacalculatie voor één opdracht en slaat het op in fie_nacalculaties.
 * Gebruikt de vastgestelde werkbegroting als calculatiebasis.
 * Wordt aangeroepen door de dagelijkse achtergrondtaak na projectafsluiting.
 */
export async function berekenEnSlaOpNacalculatie(opdrachtId: number): Promise<void> {
  // Werkbegroting als calculatiebasis (totaalArbeidUren + totaalMateriaalBedrag)
  const [begroting] = await db.select({
    totaalArbeidUren:     projectBegrotingenTable.totaalArbeidUren,
    totaalMateriaalBedrag: projectBegrotingenTable.totaalMateriaalBedrag,
  }).from(projectBegrotingenTable).where(eq(projectBegrotingenTable.opdrachtId, opdrachtId)).limit(1);

  const calcArbeidUren     = begroting?.totaalArbeidUren ?? 0;
  const calcMateriaalBedrag = begroting?.totaalMateriaalBedrag ?? 0;

  // Werkelijke uren (goedgekeurde uren-registraties)
  const urenRows = await db.select({ nettoUren: urenRegistratiesTable.nettoUren })
    .from(urenRegistratiesTable)
    .where(and(
      eq(urenRegistratiesTable.opdrachtId, opdrachtId),
      eq(urenRegistratiesTable.status, "goedgekeurd"),
    ));
  const werkelijkArbeidUren = rnd2(urenRows.reduce((s, r) => s + r.nettoUren, 0));

  // Werkelijke materiaalkosten (uitgifte − retour uit het magazijn)
  const mutatieRows = await db.select({
    hoeveelheid: voorraadMutatiesTable.hoeveelheid,
    type:        voorraadMutatiesTable.type,
    prijs:       artikelenTable.inkoopprijs,
  }).from(voorraadMutatiesTable)
    .leftJoin(artikelenTable, eq(voorraadMutatiesTable.artikelId, artikelenTable.id))
    .where(and(
      eq(voorraadMutatiesTable.referentieType, "opdracht"),
      eq(voorraadMutatiesTable.referentieId, opdrachtId),
    ));

  let werkelijkMateriaalBedrag = 0;
  for (const m of mutatieRows) {
    if (m.type !== "uitgifte" && m.type !== "retour") continue;
    const bedrag = (m.prijs ?? 0) * (m.hoeveelheid ?? 0);
    werkelijkMateriaalBedrag += m.type === "retour" ? -bedrag : bedrag;
  }
  werkelijkMateriaalBedrag = rnd2(Math.max(0, werkelijkMateriaalBedrag));

  // Afwijkingspercentages (null als er geen calculatiebasis is)
  const afwijkingPctArbeid = calcArbeidUren > 0
    ? rnd2(((werkelijkArbeidUren - calcArbeidUren) / calcArbeidUren) * 100)
    : null;
  const afwijkingPctMateriaal = calcMateriaalBedrag > 0
    ? rnd2(((werkelijkMateriaalBedrag - calcMateriaalBedrag) / calcMateriaalBedrag) * 100)
    : null;

  // Upsert: één rij per opdracht_id
  const [bestaande] = await db.select({ id: fieNacalculatiesTable.id })
    .from(fieNacalculatiesTable).where(eq(fieNacalculatiesTable.opdrachtId, opdrachtId)).limit(1);

  const values = {
    opdrachtId,
    werktype:               "algemeen",
    calcArbeidUren,
    werkelijkArbeidUren,
    afwijkingPctArbeid,
    calcMateriaalBedrag,
    werkelijkMateriaalBedrag,
    afwijkingPctMateriaal,
    afgesloten:             true,
    berekendOp:             new Date(),
    bijgewerktOp:           new Date(),
  };

  if (bestaande) {
    await db.update(fieNacalculatiesTable).set(values).where(eq(fieNacalculatiesTable.id, bestaande.id));
  } else {
    await db.insert(fieNacalculatiesTable).values(values);
  }
}

/**
 * Aggregeert alle fie_nacalculaties per werktype en berekent gemiddelde afwijkingen.
 * Alleen nacalculaties met abs(afwijking) > AFWIJKING_DREMPEL tellen mee.
 * Slaat de leermomenten op in fie_leermomenten (upsert per werktype).
 */
export async function herberekeenLeermomenten(): Promise<number> {
  const alle = await db.select().from(fieNacalculatiesTable);
  if (alle.length === 0) return 0;

  // Groepeer per werktype
  const groepen = new Map<string, { arbeid: number[]; materiaal: number[] }>();
  for (const n of alle) {
    if (!groepen.has(n.werktype)) groepen.set(n.werktype, { arbeid: [], materiaal: [] });
    const g = groepen.get(n.werktype)!;
    if (n.afwijkingPctArbeid !== null && Math.abs(n.afwijkingPctArbeid) > AFWIJKING_DREMPEL) {
      g.arbeid.push(n.afwijkingPctArbeid);
    }
    if (n.afwijkingPctMateriaal !== null && Math.abs(n.afwijkingPctMateriaal) > AFWIJKING_DREMPEL) {
      g.materiaal.push(n.afwijkingPctMateriaal);
    }
  }

  let aantalBijgewerkt = 0;
  for (const [werktype, g] of groepen.entries()) {
    const n = alle.filter(a => a.werktype === werktype).length;
    const gemArbeid = g.arbeid.length > 0 ? rnd2(g.arbeid.reduce((s, v) => s + v, 0) / g.arbeid.length) : 0;
    const gemMateriaal = g.materiaal.length > 0 ? rnd2(g.materiaal.reduce((s, v) => s + v, 0) / g.materiaal.length) : 0;

    const [bestaande] = await db.select({ id: fieLeerMomentenTable.id })
      .from(fieLeerMomentenTable).where(eq(fieLeerMomentenTable.werktype, werktype)).limit(1);

    const updateVals = {
      afwijkingPctArbeid: gemArbeid,
      afwijkingPctMateriaal: gemMateriaal,
      gebaseerdOpNProjecten: n,
      laatsteUpdate: new Date(),
    };

    if (bestaande) {
      await db.update(fieLeerMomentenTable).set(updateVals).where(eq(fieLeerMomentenTable.id, bestaande.id));
    } else {
      await db.insert(fieLeerMomentenTable).values({ werktype, ...updateVals });
    }
    aantalBijgewerkt++;
  }
  return aantalBijgewerkt;
}

/**
 * Dagelijkse achtergrondtaak: verwerk alle afgesloten opdrachten zonder nacalculatie-record,
 * bereken daarna leermomenten opnieuw.
 * Draait om 04:00 (na de backup).
 */
export function planDagelijkseLeermomenten(): void {
  const nu = new Date();
  const volgende = new Date(nu);
  volgende.setHours(4, 0, 0, 0);
  if (volgende <= nu) volgende.setDate(volgende.getDate() + 1);
  const ms = volgende.getTime() - nu.getTime();

  setTimeout(async () => {
    try {
      // Verwerk afgesloten opdrachten die nog geen nacalculatie hebben
      const afgesloten = await db.select({ id: opdrachtenTable.id })
        .from(opdrachtenTable)
        .where(and(eq(opdrachtenTable.status, "afgerond"), isNull(fieNacalculatiesTable.id)))
        .leftJoin(fieNacalculatiesTable, eq(fieNacalculatiesTable.opdrachtId, opdrachtenTable.id));

      for (const o of afgesloten) {
        await berekenEnSlaOpNacalculatie(o.id).catch(() => {});
      }
      await herberekeenLeermomenten().catch(() => {});
    } catch {}
    planDagelijkseLeermomenten();
  }, ms);
}

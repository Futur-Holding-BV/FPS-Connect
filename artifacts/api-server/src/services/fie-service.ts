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
  onderaannemeOrdersTable,
  regieTarievenTable,
  voorzieningenTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { berekenLiquiditeitSignalen } from "./liquiditeit-service";
import { bepaalSignaalActie, type SignaalActie } from "../lib/signaalActies";
import { medewerkersTable } from "@workspace/db/schema";
import { eq, and, desc, gte, lt, ne, inArray, isNull } from "drizzle-orm";

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
  // Leereffect-correctie (null als geen leermoment of factor = 1.0)
  correctieFactor: number | null;
  gecorrigeerdeArbeid: number | null;
  gecorrigeerdeMateriaal: number | null;
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

  // Scenario's (SCENARIO_01) zijn wat-als-kopieën en mogen nooit als
  // (fallback-)begroting voor de live calculatiecontext dienen.
  const [fallbackBegroting] = activeBegroting ? [] : await db
    .select()
    .from(fieJaarbegrotingenTable)
    .where(ne(fieJaarbegrotingenTable.status, "scenario"))
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

  // Leermoment-hint: voeg historische terugkoppeling toe aan de adviesTekst
  // Werktype afgeleid van de gekoppelde opdracht (vast/regie/overig); fallback op "algemeen"
  let toegepasteCorrectieFactor: number | null = null;
  let gecorrigeerdeArbeid: number | null = null;
  let gecorrigeerdeMateriaal: number | null = null;

  if (adviesStatus !== "leeg" && adviesStatus !== "geen_begroting") {
    const [gekoppeldeOpdracht] = await db.select({ type: opdrachtenTable.type })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.calculatieId, calculatieId))
      .limit(1);
    const hintWerktype = gekoppeldeOpdracht?.type ?? "algemeen";

    const [leermoment] = await db.select({
      afwijkingPctArbeid:    fieLeerMomentenTable.afwijkingPctArbeid,
      afwijkingPctMateriaal: fieLeerMomentenTable.afwijkingPctMateriaal,
      gebaseerdOpNProjecten: fieLeerMomentenTable.gebaseerdOpNProjecten,
      correctieFactor:       fieLeerMomentenTable.correctieFactor,
    }).from(fieLeerMomentenTable)
      .where(eq(fieLeerMomentenTable.werktype, hintWerktype))
      .limit(1);

    if (leermoment) {
      // Historische hints: alleen bij voldoende projecten (>= 2) voor statistische betrouwbaarheid
      if (leermoment.gebaseerdOpNProjecten >= 2) {
        const hints: string[] = [];
        if (Math.abs(leermoment.afwijkingPctArbeid) > 5) {
          const richting = leermoment.afwijkingPctArbeid > 0 ? "meer" : "minder";
          hints.push(`Historisch wordt gemiddeld ${Math.abs(leermoment.afwijkingPctArbeid).toFixed(0)}% ${richting} arbeid gerealiseerd dan begroot`);
        }
        if (Math.abs(leermoment.afwijkingPctMateriaal) > 5) {
          const richting = leermoment.afwijkingPctMateriaal > 0 ? "hogere" : "lagere";
          hints.push(`${richting} materiaalkosten (gem. ${Math.abs(leermoment.afwijkingPctMateriaal).toFixed(0)}% afwijking) op basis van ${leermoment.gebaseerdOpNProjecten} projecten`);
        }
        if (hints.length > 0) {
          adviesTekst = `${adviesTekst} Let op (werktype ${hintWerktype}): ${hints.join("; ")}.`;
        }
      }

      // Correctiefactor: altijd toepassen als er een leermoment bestaat en de factor afwijkt van 1.0
      // (ongeacht het aantal projecten — de factor is handmatig instelbaar en bewust ingesteld)
      const factor = leermoment.correctieFactor ?? 1.0;
      if (Math.abs(factor - 1.0) >= 0.01) {
        toegepasteCorrectieFactor = factor;
        gecorrigeerdeArbeid    = rnd2(arbSubtotaal * factor);
        gecorrigeerdeMateriaal = rnd2(matSubtotaal * factor);

        const factorPct = rnd2((factor - 1) * 100);
        const richting  = factor > 1 ? "hogere" : "lagere";
        adviesTekst = `${adviesTekst} Correctiefactor ${factor.toFixed(2)} (leereffect op basis van ${leermoment.gebaseerdOpNProjecten} project(en)) toegepast: ${richting} indicatoren — gecorrigeerde arbeid \u20ac${gecorrigeerdeArbeid.toLocaleString("nl-NL", { maximumFractionDigits: 0 })}, materiaal \u20ac${gecorrigeerdeMateriaal.toLocaleString("nl-NL", { maximumFractionDigits: 0 })} (${factorPct > 0 ? "+" : ""}${factorPct.toFixed(0)}% t.o.v. calculatie).`;
      }
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
    correctieFactor: toegepasteCorrectieFactor,
    gecorrigeerdeArbeid,
    gecorrigeerdeMateriaal,
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

// ─── SCENARIO_01 — Wat-als-doorrekening op een (scenario-)begroting ──────────
//
// Een scenario is een kopie van de jaarbegroting (status 'scenario') met
// expliciete aannames. De doorrekening hergebruikt berekenDoelmarge (zelfde
// AK-som, zelfde normen) — er is bewust GEEN tweede rekenmodel. Harde regels:
//  - capaciteitswijziging zonder bezettingsaanname bestaat niet (route dwingt af);
//  - de uitkomst wordt bij meerdere bezettingsniveaus getoond, nooit als één getal;
//  - het AK-percentage wordt over de productie berekend (verkochte uren × tarief);
//  - elke gebruikte waarde vermeldt zijn bron (ingevoerd / afgeleid / standaard).

export const SCENARIO_BEZETTINGSNIVEAUS = [60, 70, 80, 90] as const;
/** Productieve uren per monteur per jaar — zelfde afleiding als berekenCapaciteit (40 u/wk × 45,5 wk). */
export const SCENARIO_UREN_PER_MONTEUR_STANDAARD = 1820;

export interface FieScenarioAannames {
  aantalMonteurs: number | null;
  urenPerMonteur: number | null;
  bezettingsgraadPct: number | null;
  uurtarief: number | null;
  loonkostenPerMonteur: number | null;
  variabeleKostenPct: number | null;
  toelichting: string | null;
}

export function parseScenarioAannames(tekst: string | null): FieScenarioAannames {
  const leeg: FieScenarioAannames = {
    aantalMonteurs: null, urenPerMonteur: null, bezettingsgraadPct: null,
    uurtarief: null, loonkostenPerMonteur: null, variabeleKostenPct: null, toelichting: null,
  };
  if (!tekst) return leeg;
  try {
    const j = JSON.parse(tekst) as Record<string, unknown>;
    const num = (v: unknown): number | null => {
      const n = Number(v);
      return v == null || !isFinite(n) ? null : n;
    };
    return {
      aantalMonteurs: num(j["aantal_monteurs"]),
      urenPerMonteur: num(j["uren_per_monteur"]),
      bezettingsgraadPct: num(j["bezettingsgraad_pct"]),
      uurtarief: num(j["uurtarief"]),
      loonkostenPerMonteur: num(j["loonkosten_per_monteur"]),
      variabeleKostenPct: num(j["variabele_kosten_pct"]),
      toelichting: j["toelichting"] != null ? String(j["toelichting"]).slice(0, 1000) : null,
    };
  } catch {
    return leeg;
  }
}

/** Fout met HTTP-status voor de scenario-routes. */
export class ScenarioFout extends Error {
  constructor(public status: number, melding: string) { super(melding); }
}

/**
 * Kopieert een begroting (incl. AK-posten) als scenario — transactioneel
 * consistent: de basisrij wordt binnen de transactie gelockt (FOR UPDATE)
 * zodat begrotingsvelden en posten uit hetzelfde moment komen.
 * Dwingt af dat het scenario doorrekenbaar is: bij een capaciteitswijziging
 * moeten loonkosten per monteur bekend zijn (anders bestaat er geen omslagpunt
 * en is het resultaat te rooskleurig), en het uurtarief moet opgegeven of uit
 * de basis afleidbaar zijn.
 */
export async function kopieerBegrotingAlsScenario(
  basisId: number,
  naam: string,
  aannamesJson: string,
): Promise<typeof fieJaarbegrotingenTable.$inferSelect> {
  const aan = parseScenarioAannames(aannamesJson);
  return db.transaction(async (tx) => {
    const [basis] = await tx.select().from(fieJaarbegrotingenTable)
      .where(eq(fieJaarbegrotingenTable.id, basisId)).for("update").limit(1);
    if (!basis) throw new ScenarioFout(404, "Basisbegroting niet gevonden");
    if (basis.status === "scenario") {
      throw new ScenarioFout(422, "Een scenario kan niet vanaf een ander scenario worden gemaakt — vertrek altijd vanaf een echte begroting.");
    }
    const tariefAfleidbaar = aan.uurtarief != null
      || (basis.omzetDoel != null && basis.omzetDoel > 0 && basis.productieveUrenDoel != null && basis.productieveUrenDoel > 0);
    if (!tariefAfleidbaar) {
      throw new ScenarioFout(422, "Geef een uurtarief op: de basisbegroting heeft geen omzetdoel + urendoel om het uit af te leiden, dus het scenario zou niet doorrekenbaar zijn.");
    }
    if (aan.aantalMonteurs != null && aan.loonkostenPerMonteur == null) {
      throw new ScenarioFout(422, "Bij een wijziging van het aantal monteurs zijn de loonkosten per monteur verplicht — zonder dat bedrag bestaat er geen omslagpunt en is het resultaat te rooskleurig.");
    }
    const [rij] = await tx.insert(fieJaarbegrotingenTable).values({
      boekjaar: basis.boekjaar,
      status: "scenario",
      omzetDoel: basis.omzetDoel,
      directeKostenDoel: basis.directeKostenDoel,
      doelMargePct: basis.doelMargePct,
      akPerProductiefUur: basis.akPerProductiefUur,
      productieveUrenDoel: basis.productieveUrenDoel,
      verdeelsleutel: basis.verdeelsleutel,
      opmerkingen: basis.opmerkingen,
      scenarioVanId: basis.id,
      scenarioNaam: naam,
      scenarioAannames: aannamesJson,
    }).returning();
    const posten = await tx.select().from(fieAkPostenTable)
      .where(eq(fieAkPostenTable.begrotingId, basis.id));
    if (posten.length > 0) {
      await tx.insert(fieAkPostenTable).values(posten.map((p) => ({
        begrotingId: rij!.id,
        werkgeverId: p.werkgeverId,
        categorie: p.categorie,
        omschrijving: p.omschrijving,
        bedragJaarbasis: p.bedragJaarbasis,
        actief: p.actief,
      })));
    }
    return rij!;
  });
}

export interface FieScenarioNiveau {
  bezetting_pct: number;
  verkochte_uren: number;
  productie: number;               // verkochte uren × uurtarief
  variabele_kosten: number;
  dekkingsbijdrage: number;        // productie − variabele kosten
  loonkosten_monteurs: number;
  totaal_ak: number;
  ak_pct_productie: number | null; // AK / productie ×100 (harde regel §3.1a)
  ak_per_verkocht_uur: number | null;
  bedrijfsresultaat: number;       // dekking − monteursloon − AK
}

export interface FieScenarioAanname {
  label: string;
  waarde: string;
  bron: "ingevoerd" | "afgeleid uit begroting" | "standaard";
}

export interface FieScenarioDoorrekening {
  begroting_id: number;
  boekjaar: number;
  status: string;
  naam: string | null;
  basis_id: number | null;
  totaal_ak: number;
  beschikbare_uren: number | null;
  niveaus: FieScenarioNiveau[];
  omslagpunt_pct: number | null;
  omslagpunt_toelichting: string | null;
  aannames: FieScenarioAanname[];
  meldingen: string[];
}

/**
 * Rekent een begroting of scenario door bij meerdere bezettingsniveaus.
 * Werkt voor elke begroting (ook de actieve, als vergelijkingskolom); een
 * scenario levert daarnaast het omslagpunt t.o.v. zijn basisbegroting.
 */
export async function berekenScenarioDoorrekening(begrotingId: number): Promise<FieScenarioDoorrekening | null> {
  const [begroting] = await db
    .select()
    .from(fieJaarbegrotingenTable)
    .where(eq(fieJaarbegrotingenTable.id, begrotingId))
    .limit(1);
  if (!begroting) return null;

  const doelmarge = await berekenDoelmarge(begrotingId);
  const totaalAk = doelmarge?.totaalAkPosten ?? 0;
  const aan = parseScenarioAannames(begroting.scenarioAannames ?? null);

  const aannames: FieScenarioAanname[] = [];
  const meldingen: string[] = [];
  const euro = (n: number) => `€ ${Math.round(n).toLocaleString("nl-NL")}`;

  // ── Capaciteit ──────────────────────────────────────────────────────────────
  const urenPerMonteur = aan.urenPerMonteur ?? SCENARIO_UREN_PER_MONTEUR_STANDAARD;
  let beschikbareUren: number | null = null;
  if (aan.aantalMonteurs != null) {
    beschikbareUren = aan.aantalMonteurs * urenPerMonteur;
    aannames.push({ label: "Aantal monteurs", waarde: String(aan.aantalMonteurs), bron: "ingevoerd" });
    aannames.push({
      label: "Productieve uren per monteur", waarde: `${urenPerMonteur} uur/jaar`,
      bron: aan.urenPerMonteur != null ? "ingevoerd" : "standaard",
    });
  } else if (begroting.productieveUrenDoel && begroting.productieveUrenDoel > 0) {
    beschikbareUren = begroting.productieveUrenDoel;
    aannames.push({ label: "Beschikbare productieve uren", waarde: `${beschikbareUren} uur`, bron: "afgeleid uit begroting" });
  } else {
    meldingen.push("Geen aantal monteurs opgegeven en geen productieve-urendoel in de begroting — er valt niets door te rekenen.");
  }

  // ── Uurtarief ───────────────────────────────────────────────────────────────
  let uurtarief: number | null = aan.uurtarief;
  if (uurtarief != null) {
    aannames.push({ label: "Uurtarief", waarde: `€ ${uurtarief.toLocaleString("nl-NL")}`, bron: "ingevoerd" });
  } else if (begroting.omzetDoel && begroting.productieveUrenDoel && begroting.productieveUrenDoel > 0) {
    uurtarief = rnd2(begroting.omzetDoel / begroting.productieveUrenDoel);
    aannames.push({ label: "Uurtarief", waarde: `€ ${uurtarief.toLocaleString("nl-NL")} (omzetdoel / urendoel)`, bron: "afgeleid uit begroting" });
  } else {
    meldingen.push("Geen uurtarief opgegeven en niet af te leiden uit de begroting (omzetdoel + urendoel ontbreken).");
  }

  // ── Monteursloon (vaste kosten die doorlopen bij lage bezetting) ────────────
  let loonkostenTotaal = 0;
  if (aan.aantalMonteurs != null) {
    if (aan.loonkostenPerMonteur != null) {
      loonkostenTotaal = aan.aantalMonteurs * aan.loonkostenPerMonteur;
      aannames.push({ label: "Loonkosten per monteur", waarde: `${euro(aan.loonkostenPerMonteur)}/jaar`, bron: "ingevoerd" });
    } else {
      meldingen.push("Loonkosten per monteur niet opgegeven — het bedrijfsresultaat is exclusief monteursloon en dus te rooskleurig.");
    }
  }

  // ── Variabele kosten (materiaal/onderaanneming, % van de productie) ─────────
  let variabelePct: number | null = aan.variabeleKostenPct;
  if (variabelePct != null) {
    aannames.push({ label: "Variabele kosten", waarde: `${variabelePct}% van de productie`, bron: "ingevoerd" });
  } else if (
    aan.aantalMonteurs != null && aan.loonkostenPerMonteur != null &&
    begroting.omzetDoel && begroting.omzetDoel > 0 && begroting.directeKostenDoel != null
  ) {
    variabelePct = rnd2(Math.max(0, ((begroting.directeKostenDoel - loonkostenTotaal) / begroting.omzetDoel) * 100));
    aannames.push({ label: "Variabele kosten", waarde: `${variabelePct}% van de productie (directe kosten minus monteursloon)`, bron: "afgeleid uit begroting" });
  } else if (begroting.omzetDoel && begroting.omzetDoel > 0 && begroting.directeKostenDoel != null && aan.aantalMonteurs == null) {
    variabelePct = rnd2((begroting.directeKostenDoel / begroting.omzetDoel) * 100);
    aannames.push({ label: "Variabele kosten", waarde: `${variabelePct}% van de productie (directe kosten / omzetdoel; incl. loon)`, bron: "afgeleid uit begroting" });
  } else {
    variabelePct = 0;
    meldingen.push("Variabele kosten niet opgegeven en niet af te leiden — gerekend met 0%, de dekkingsbijdrage is daardoor te hoog.");
    aannames.push({ label: "Variabele kosten", waarde: "0% van de productie", bron: "standaard" });
  }

  if (aan.bezettingsgraadPct != null) {
    aannames.push({ label: "Bezettingsgraad (eigen aanname)", waarde: `${aan.bezettingsgraadPct}%`, bron: "ingevoerd" });
  }
  aannames.push({ label: "Totaal AK-posten", waarde: euro(totaalAk), bron: "afgeleid uit begroting" });
  if (aan.toelichting) aannames.push({ label: "Toelichting", waarde: aan.toelichting, bron: "ingevoerd" });

  // ── Niveaus ─────────────────────────────────────────────────────────────────
  const niveauPcts = [...SCENARIO_BEZETTINGSNIVEAUS.map(Number)];
  if (aan.bezettingsgraadPct != null && !niveauPcts.includes(aan.bezettingsgraadPct)) {
    niveauPcts.push(aan.bezettingsgraadPct);
    niveauPcts.sort((a, b) => a - b);
  }

  const niveaus: FieScenarioNiveau[] = [];
  if (beschikbareUren != null && uurtarief != null) {
    for (const bez of niveauPcts) {
      const verkochteUren = rnd2(beschikbareUren * bez / 100);
      const productie = rnd2(verkochteUren * uurtarief);
      const variabeleKosten = rnd2(productie * (variabelePct ?? 0) / 100);
      const dekking = rnd2(productie - variabeleKosten);
      const resultaat = rnd2(dekking - loonkostenTotaal - totaalAk);
      niveaus.push({
        bezetting_pct: bez,
        verkochte_uren: verkochteUren,
        productie,
        variabele_kosten: variabeleKosten,
        dekkingsbijdrage: dekking,
        loonkosten_monteurs: rnd2(loonkostenTotaal),
        totaal_ak: totaalAk,
        ak_pct_productie: productie > 0 ? rnd2(totaalAk / productie * 100) : null,
        ak_per_verkocht_uur: verkochteUren > 0 ? rnd2(totaalAk / verkochteUren) : null,
        bedrijfsresultaat: resultaat,
      });
    }
  }

  // ── Omslagpunt: bij welke bezetting verdient een extra monteur zichzelf terug ─
  // Delta t.o.v. de basisbegroting: extra monteur = vaste loonkosten erbij, en
  // per verkocht uur een dekkingsbijdrage van uurtarief × (1 − variabele kosten).
  let omslagpuntPct: number | null = null;
  let omslagpuntToelichting: string | null = null;
  if (aan.aantalMonteurs != null && aan.loonkostenPerMonteur != null && uurtarief != null) {
    const dekkingPerUur = uurtarief * (1 - (variabelePct ?? 0) / 100);
    if (dekkingPerUur > 0 && urenPerMonteur > 0) {
      const bez = (aan.loonkostenPerMonteur / (urenPerMonteur * dekkingPerUur)) * 100;
      omslagpuntPct = rnd2(bez);
      omslagpuntToelichting = bez <= 100
        ? `Een monteur (${euro(aan.loonkostenPerMonteur)}/jaar) betaalt zichzelf terug vanaf ${Math.round(bez)}% bezetting: ${Math.round(urenPerMonteur * bez / 100)} verkochte uren × ${euro(dekkingPerUur)} dekkingsbijdrage per uur.`
        : `Een monteur betaalt zichzelf bij dit uurtarief en deze variabele kosten NIET terug binnen 100% bezetting (omslagpunt: ${Math.round(bez)}%).`;
    }
  }

  return {
    begroting_id: begroting.id,
    boekjaar: begroting.boekjaar,
    status: begroting.status,
    naam: begroting.scenarioNaam ?? null,
    basis_id: begroting.scenarioVanId ?? null,
    totaal_ak: totaalAk,
    beschikbare_uren: beschikbareUren,
    niveaus,
    omslagpunt_pct: omslagpuntPct,
    omslagpunt_toelichting: omslagpuntToelichting,
    aannames,
    meldingen,
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

export interface FiePrognoseObservatie extends SignaalActie {
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
  liquiditeit_tekort:        { impact: "Onvoldoende middelen om lopende verplichtingen te dekken.", advies: "Versnel debiteureninning, stel crediteurenbetalingen uit of regel aanvullende financiering.", score: 95 },
  crediteuren_achterstallig: { impact: "Risico op aanmaningen, rente of verstoorde leveranciersrelaties.", advies: "Plan de openstaande crediteuren in of maak betaalafspraken met leveranciers.", score: 80 },
  debiteuren_achterstallig:  { impact: "Vertraagde binnenkomst van geld drukt op de liquiditeit.", advies: "Verstuur herinneringen of aanmaningen voor de vervallen debiteuren.", score: 80 },
  cashflow_negatief_30d:     { impact: "Uitgaven overtreffen de verwachte inkomsten op korte termijn.", advies: "Bewaak de betaalkalender en stem inkoop- en betaalmomenten af op binnenkomende gelden.", score: 88 },
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
  const observaties: Array<Omit<FiePrognoseObservatie, keyof SignaalActie>> = [];

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

  // 5b. Liquiditeitssignalen injecteren in het observatiespaneel — alleen voor
  // het huidige boekjaar (liquiditeit is een actuele momentopname, geen
  // historische boekjaargrootheid). DB-only en fail-soft, zodat de prognose
  // nooit crasht als de liquiditeitsberekening faalt.
  if (boekjaar === new Date().getFullYear()) {
    try {
      const liquiditeitSignalen = await berekenLiquiditeitSignalen();
      for (const s of liquiditeitSignalen) {
        observaties.push({
          type: s.type,
          ernst: s.ernst,
          omschrijving: s.omschrijving,
          waarde: s.waarde,
          drempelwaarde: s.drempelwaarde,
          afwijking_pct: s.afwijking_pct,
          impact: s.impact,
          advies: s.advies,
          betrouwbaarheidsscore: observatieMetadata(s.type).betrouwbaarheidsscore,
        });
      }
    } catch {
      // Liquiditeitssignalen zijn aanvullend; falen mag de prognose niet blokkeren.
    }
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
  const observatiesMetActies: FiePrognoseObservatie[] = observaties.map((observatie) => ({
    ...observatie,
    ...bepaalSignaalActie(observatie.type),
  }));

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
  if (observatiesMetActies.length > 0) {
    await db.insert(fieObservatiesTable).values(
      observatiesMetActies.map(o => ({
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
    observaties: observatiesMetActies,
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
    ...bepaalSignaalActie(r.type),
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
  // Opdracht-metadata: calculatieId + gebouwId (voor spottype-afleiding)
  const [opdracht] = await db.select({
    calculatieId: opdrachtenTable.calculatieId,
    gebouwId:     opdrachtenTable.gebouwId,
  }).from(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId)).limit(1);

  // Werktype afleiden uit het dominante spottype van het gekoppelde gebouw.
  // Telt de voorkomens van elk spottype (voorzieningenTable.type) en kiest de meest voorkomende.
  //
  // Terugval op "algemeen" in drie gevallen:
  //   1. Opdracht heeft geen gebouwId (onbekend of niet-gekoppeld gebouw).
  //   2. Het gebouw heeft geen niet-gearchiveerde spots (spotRows.length === 0).
  //      Dit geldt ook als eerder WÉL spots aanwezig waren maar de laatste spot
  //      verwijderd of gearchiveerd is — de functie zet het werktype dan altijd
  //      terug op "algemeen", ongeacht de vorige waarde in fie_nacalculaties.
  //   3. Geen enkel spottype heeft count > 0 (alle type-velden zijn null).
  //
  // Gevolg: na het verwijderen van de laatste spot van een gebouw zal de
  // spot-DELETE-trigger (triggerNacalculatieHerberekeningVoorGebouw) deze
  // functie aanroepen, waarna werktype netjes terugvalt op "algemeen".
  let werktype = "algemeen";
  let werktypeBron = "fallback";
  if (opdracht?.gebouwId) {
    const spotRows = await db
      .select({ type: voorzieningenTable.type })
      .from(voorzieningenTable)
      .where(and(
        eq(voorzieningenTable.gebouwId, opdracht.gebouwId),
        eq(voorzieningenTable.gearchiveerd, false),
      ));

    if (spotRows.length > 0) {
      const tellingen = new Map<string, number>();
      for (const r of spotRows) {
        if (r.type) tellingen.set(r.type, (tellingen.get(r.type) ?? 0) + 1);
      }
      if (tellingen.size > 0) {
        let maxAantal = 0;
        let dominantType = "algemeen";
        for (const [type, aantal] of tellingen.entries()) {
          if (aantal > maxAantal) {
            maxAantal = aantal;
            dominantType = type;
          }
        }
        werktype = dominantType;
        werktypeBron = "spots";
      }
    }
  }

  // Werkbegroting als calculatiebasis voor uren
  const [begroting] = await db.select({
    totaalArbeidUren:      projectBegrotingenTable.totaalArbeidUren,
    totaalMateriaalBedrag: projectBegrotingenTable.totaalMateriaalBedrag,
  }).from(projectBegrotingenTable).where(eq(projectBegrotingenTable.opdrachtId, opdrachtId)).limit(1);

  const calcArbeidUren      = begroting?.totaalArbeidUren ?? 0;
  const calcMateriaalBedrag = begroting?.totaalMateriaalBedrag ?? 0;

  // Calculatie-monetaire arbeid: som(hoeveelheid × muPerEenheid × arbeidsTarief) uit gekoppelde calculatieregels
  let calcArbeidBedrag = 0;
  let calcOnderaannemingBedrag = 0;
  if (opdracht?.calculatieId) {
    const regels = await db.select({
      hoeveelheid:          modCalcRegelsTable.hoeveelheid,
      muPerEenheid:         modCalcRegelsTable.muPerEenheid,
      arbeidsTarief:        modCalcRegelsTable.arbeidsTarief,
      onderaannemingBedrag: modCalcRegelsTable.onderaannemingBedrag,
    }).from(modCalcRegelsTable)
      .where(eq(modCalcRegelsTable.calculatieId, opdracht.calculatieId));

    for (const r of regels) {
      calcArbeidBedrag      += (r.hoeveelheid ?? 0) * (r.muPerEenheid ?? 0) * (r.arbeidsTarief ?? 0);
      calcOnderaannemingBedrag += r.onderaannemingBedrag ?? 0;
    }
    calcArbeidBedrag      = rnd2(calcArbeidBedrag);
    calcOnderaannemingBedrag = rnd2(calcOnderaannemingBedrag);
  }

  // Werkelijke uren (goedgekeurde uren-registraties) met tariefgroep voor monetaire waarde
  const urenRows = await db.select({
    nettoUren:    urenRegistratiesTable.nettoUren,
    tariefgroep:  urenRegistratiesTable.tariefgroep,
  }).from(urenRegistratiesTable)
    .where(and(
      eq(urenRegistratiesTable.opdrachtId, opdrachtId),
      eq(urenRegistratiesTable.status, "goedgekeurd"),
    ));
  const werkelijkArbeidUren = rnd2(urenRows.reduce((s, r) => s + r.nettoUren, 0));

  // Regie-tarieven per functiegroep: gebruik laatste beschikbare tarief per groep
  // regieTarievenTable.functiegroep bevat dezelfde waarden als urenRegistraties.tariefgroep
  const tariefRows = await db.select({
    functiegroep: regieTarievenTable.functiegroep,
    uurtarief:    regieTarievenTable.uurtarief,
  }).from(regieTarievenTable)
    .orderBy(desc(regieTarievenTable.id));

  const tariefMap = new Map<string, number>();
  for (const t of tariefRows) {
    if (!tariefMap.has(t.functiegroep)) tariefMap.set(t.functiegroep, t.uurtarief);
  }

  // Werkelijke monetaire arbeidkosten: uren × uurtarief per tariefgroep
  let werkelijkArbeidBedrag = 0;
  for (const u of urenRows) {
    const tarief = u.tariefgroep != null ? (tariefMap.get(u.tariefgroep) ?? 0) : 0;
    werkelijkArbeidBedrag += u.nettoUren * tarief;
  }
  werkelijkArbeidBedrag = rnd2(werkelijkArbeidBedrag);

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

  // Werkelijke onderaanneming: betaalde/uitgevoerde onderaannemer-orders
  const oaOrders = await db.select({ bedrag: onderaannemeOrdersTable.bedragExclBtw })
    .from(onderaannemeOrdersTable)
    .where(and(
      eq(onderaannemeOrdersTable.opdrachtId, opdrachtId),
      inArray(onderaannemeOrdersTable.status, ["uitgevoerd", "betaald"]),
    ));
  const werkelijkOnderaannemingBedrag = rnd2(oaOrders.reduce((s, r) => s + (r.bedrag ?? 0), 0));

  // Afwijkingspercentages — uren-basis (null als er geen calculatiebasis is)
  const afwijkingPctArbeid = calcArbeidUren > 0
    ? rnd2(((werkelijkArbeidUren - calcArbeidUren) / calcArbeidUren) * 100)
    : null;

  // Afwijkingspercentages — monetaire basis (null als er geen calculatiebasis is)
  const afwijkingPctArbeidBedrag = calcArbeidBedrag > 0
    ? rnd2(((werkelijkArbeidBedrag - calcArbeidBedrag) / calcArbeidBedrag) * 100)
    : null;

  const afwijkingPctMateriaal = calcMateriaalBedrag > 0
    ? rnd2(((werkelijkMateriaalBedrag - calcMateriaalBedrag) / calcMateriaalBedrag) * 100)
    : null;
  const afwijkingPctOnderaanneming = calcOnderaannemingBedrag > 0
    ? rnd2(((werkelijkOnderaannemingBedrag - calcOnderaannemingBedrag) / calcOnderaannemingBedrag) * 100)
    : null;

  // Upsert: één rij per opdracht_id
  const [bestaande] = await db.select({ id: fieNacalculatiesTable.id })
    .from(fieNacalculatiesTable).where(eq(fieNacalculatiesTable.opdrachtId, opdrachtId)).limit(1);

  const values = {
    opdrachtId,
    werktype,
    werktypeBron,
    calcArbeidUren,
    werkelijkArbeidUren,
    afwijkingPctArbeid,
    calcArbeidBedrag,
    werkelijkArbeidBedrag,
    afwijkingPctArbeidBedrag,
    calcMateriaalBedrag,
    werkelijkMateriaalBedrag,
    afwijkingPctMateriaal,
    calcOnderaannemingBedrag,
    werkelijkOnderaannemingBedrag,
    afwijkingPctOnderaanneming,
    afgesloten:  true,
    berekendOp:  new Date(),
    bijgewerktOp: new Date(),
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
    // Gebruik monetaire afwijking (bedrag-basis) als die beschikbaar is; anders uren-basis als fallback
    const arbeidAfwijking = n.afwijkingPctArbeidBedrag ?? n.afwijkingPctArbeid;
    if (arbeidAfwijking !== null && Math.abs(arbeidAfwijking) > AFWIJKING_DREMPEL) {
      g.arbeid.push(arbeidAfwijking);
    }
    if (n.afwijkingPctMateriaal !== null && Math.abs(n.afwijkingPctMateriaal) > AFWIJKING_DREMPEL) {
      g.materiaal.push(n.afwijkingPctMateriaal);
    }
  }

  const MIN_KWALIFICERENDE = 2; // minimaal 2 projecten mét structurele afwijking per kostensoort

  let aantalBijgewerkt = 0;
  for (const [werktype, g] of groepen.entries()) {
    const n = alle.filter(a => a.werktype === werktype).length;
    const gemArbeid = g.arbeid.length > 0 ? rnd2(g.arbeid.reduce((s, v) => s + v, 0) / g.arbeid.length) : 0;
    const gemMateriaal = g.materiaal.length > 0 ? rnd2(g.materiaal.reduce((s, v) => s + v, 0) / g.materiaal.length) : 0;

    // Alleen persisteren als minstens één kostensoort ≥ 2 kwalificerende projecten heeft
    // én een gemiddelde afwijking buiten de neutrale zone (≠ 0)
    const voldoetArbeid   = g.arbeid.length   >= MIN_KWALIFICERENDE && gemArbeid   !== 0;
    const voldoetMateriaal = g.materiaal.length >= MIN_KWALIFICERENDE && gemMateriaal !== 0;
    if (!voldoetArbeid && !voldoetMateriaal) continue;

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
 * Geef het aantal nacalculaties terug met werktype "algemeen" waarbij het gebouw
 * inmiddels spots heeft. Dit is een snelle telling zonder herberekening.
 */
export async function telVerouderdeNacalculaties(): Promise<number> {
  const kandidaten = await db
    .select({
      opdrachtId: fieNacalculatiesTable.opdrachtId,
      gebouwId:   opdrachtenTable.gebouwId,
    })
    .from(fieNacalculatiesTable)
    .innerJoin(opdrachtenTable, eq(opdrachtenTable.id, fieNacalculatiesTable.opdrachtId))
    .where(eq(fieNacalculatiesTable.werktype, "algemeen"));

  if (kandidaten.length === 0) return 0;

  const gebouwIds = [...new Set(kandidaten.map((k) => k.gebouwId).filter((id): id is number => id != null))];
  if (gebouwIds.length === 0) return 0;

  const metSpots = await db
    .selectDistinct({ gebouwId: voorzieningenTable.gebouwId })
    .from(voorzieningenTable)
    .where(and(
      inArray(voorzieningenTable.gebouwId, gebouwIds),
      eq(voorzieningenTable.gearchiveerd, false),
    ));

  const gebouwenMetSpots = new Set(metSpots.map((r) => r.gebouwId));
  return kandidaten.filter((k) => k.gebouwId != null && gebouwenMetSpots.has(k.gebouwId)).length;
}

/**
 * Herbereken nacalculaties die verouderd zijn: werktype is "algemeen" maar het gebouw
 * heeft inmiddels spots waardoor een specifieker werktype bepaald kan worden.
 * Retourneert het aantal herberekende nacalculaties.
 */
export async function herberekeenVerouderdeNacalculaties(): Promise<number> {
  // Haal alle nacalculaties op met werktype "algemeen", inclusief het gebouwId van de opdracht
  const kandidaten = await db
    .select({
      opdrachtId: fieNacalculatiesTable.opdrachtId,
      gebouwId:   opdrachtenTable.gebouwId,
    })
    .from(fieNacalculatiesTable)
    .innerJoin(opdrachtenTable, eq(opdrachtenTable.id, fieNacalculatiesTable.opdrachtId))
    .where(eq(fieNacalculatiesTable.werktype, "algemeen"));

  if (kandidaten.length === 0) return 0;

  // Bepaal welke gebouwen inmiddels spots hebben (niet-gearchiveerd)
  const gebouwIds = [...new Set(kandidaten.map((k) => k.gebouwId).filter((id): id is number => id != null))];
  if (gebouwIds.length === 0) return 0;

  const metSpots = await db
    .selectDistinct({ gebouwId: voorzieningenTable.gebouwId })
    .from(voorzieningenTable)
    .where(and(
      inArray(voorzieningenTable.gebouwId, gebouwIds),
      eq(voorzieningenTable.gearchiveerd, false),
    ));

  const gebouwenMetSpots = new Set(metSpots.map((r) => r.gebouwId));

  // Herbereken alleen opdrachten waarvan het gebouw nu spots heeft
  const teHerberekenen = kandidaten.filter(
    (k) => k.gebouwId != null && gebouwenMetSpots.has(k.gebouwId),
  );

  let herberekend = 0;
  for (const k of teHerberekenen) {
    const geslaagd = await berekenEnSlaOpNacalculatie(k.opdrachtId)
      .then(() => true)
      .catch((err: unknown) => {
        logger.warn({ opdrachtId: k.opdrachtId, err }, "fie: herbereken verouderde nacalculatie mislukt");
        return false;
      });
    if (geslaagd) herberekend++;
  }
  return herberekend;
}

/**
 * Fire-and-forget helper: herbereken nacalculaties met werktype "algemeen" voor opdrachten
 * die gekoppeld zijn aan het opgegeven gebouw. Bedoeld om aan te roepen na het aanmaken of
 * verwijderen van een spot, zodat het werktype direct bijgewerkt wordt zonder de responsetijd
 * van het spot-endpoint te beïnvloeden.
 */
export function triggerNacalculatieHerberekeningVoorGebouw(
  gebouwId: number,
  log: { warn: (obj: Record<string, unknown>, msg: string) => void },
): void {
  setImmediate(async () => {
    try {
      const kandidaten = await db
        .select({ opdrachtId: fieNacalculatiesTable.opdrachtId })
        .from(fieNacalculatiesTable)
        .innerJoin(opdrachtenTable, eq(opdrachtenTable.id, fieNacalculatiesTable.opdrachtId))
        .where(eq(opdrachtenTable.gebouwId, gebouwId));

      for (const k of kandidaten) {
        await berekenEnSlaOpNacalculatie(k.opdrachtId).catch((err: unknown) => {
          log.warn({ opdrachtId: k.opdrachtId, gebouwId, err }, "fie: spot-trigger nacalculatie herberekening mislukt");
        });
      }
    } catch (err) {
      log.warn({ gebouwId, err }, "fie: spot-trigger nacalculatie query mislukt");
    }
  });
}

/**
 * Dagelijkse achtergrondtaak: verwerk alle afgesloten opdrachten zonder nacalculatie-record,
 * herbereken verouderde "algemeen"-nacalculaties waar spots beschikbaar zijn,
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
        await berekenEnSlaOpNacalculatie(o.id).catch((err: unknown) => {
          logger.warn({ opdrachtId: o.id, err }, "fie: nacalculatie mislukt voor opdracht");
        });
      }

      // Herbereken verouderde nacalculaties (werktype was "algemeen" maar spots zijn er nu)
      const verouderd = await herberekeenVerouderdeNacalculaties().catch((err: unknown) => {
        logger.warn({ err }, "fie: herbereken verouderde nacalculaties mislukt");
        return 0;
      });

      const n = await herberekeenLeermomenten().catch((err: unknown) => {
        logger.warn({ err }, "fie: herbereken leermomenten mislukt");
        return 0;
      });
      logger.info({ verwerkt: afgesloten.length, verouderdHerberekend: verouderd, leermomenten: n }, "fie: dagelijkse leermomenten bijgewerkt");
    } catch (err) {
      logger.warn({ err }, "fie: planDagelijkseLeermomenten achtergrondtaak crashte");
    }
    planDagelijkseLeermomenten();
  }, ms);
}

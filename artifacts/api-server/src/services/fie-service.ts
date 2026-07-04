// Financial Intelligence Engine (FIE) — centrale rekenmotor.
// Alle margeberekeningen, AK-normderivaties en context-analyses lopen via dit service-module.
// Routes roepen uitsluitend deze functies aan; geen business-logica in route-handlers.
import { db, fieJaarbegrotingenTable, fieAkPostenTable, modCalcHeadersTable, modCalcRegelsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdviesStatus = "goed" | "neutraal" | "laag" | "leeg" | "geen_begroting";

export interface FieCalculatieContext {
  calculatieId: number;
  heeftBegroting: boolean;
  boekjaar: number | null;
  doelMargePct: number | null;
  akPerUur: number | null;
  totaalArbeid: number;
  totaalMateriaal: number;
  totaalOnderaanneming: number;
  totaalMu: number;
  totaalExclOpslag: number;
  totaalInclOpslag: number;
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
 * Berekent de volledige FIE-context voor een calculatie:
 * - Totalen uit regels (arbeid, materiaal, OA, MU)
 * - Oplagen op basis van header-velden (zelfde logica als berekenTotalen in frontend)
 * - AK-bijdrage via akPerUur × totaalMu (uit actieve begroting of handmatige norm)
 * - Verwachte marge vs. doelmarge → adviesStatus
 */
export async function berekenFieContext(calculatieId: number): Promise<FieCalculatieContext | null> {
  const [header] = await db
    .select()
    .from(modCalcHeadersTable)
    .where(eq(modCalcHeadersTable.id, calculatieId))
    .limit(1);

  if (!header) return null;

  const regels = await db
    .select()
    .from(modCalcRegelsTable)
    .where(eq(modCalcRegelsTable.calculatieId, calculatieId));

  // ── Totalen uit regels ──────────────────────────────────────────────────────
  let totaalArbeid = 0;
  let totaalMateriaal = 0;
  let totaalOnderaanneming = 0;
  let totaalMu = 0;

  for (const r of regels) {
    totaalArbeid        += (r.hoeveelheid ?? 0) * (r.muPerEenheid ?? 0) * (r.arbeidsTarief ?? 0);
    totaalMateriaal     += (r.hoeveelheid ?? 0) * (r.tarief ?? 0);
    totaalOnderaanneming += (r.onderaannemingBedrag ?? 0);
    totaalMu            += (r.hoeveelheid ?? 0) * (r.muPerEenheid ?? 0);
  }

  totaalArbeid         = rnd2(totaalArbeid);
  totaalMateriaal      = rnd2(totaalMateriaal);
  totaalOnderaanneming = rnd2(totaalOnderaanneming);
  totaalMu             = rnd2(totaalMu);

  const totaalExclOpslag = rnd2(totaalArbeid + totaalMateriaal + totaalOnderaanneming);

  // ── Oplagen (spiegelt berekenTotalen in frontend) ───────────────────────────
  const opslagAk     = header.opslagAk ?? 0;
  const opslagAbk    = header.opslagAbk ?? 0;
  const opslagRisico = header.opslagRisico ?? 0;
  const opslagWinst  = header.opslagWinst ?? 0;
  const opslagMat    = header.opslagMateriaal ?? 0;
  const opslagArb    = header.opslagArbeid ?? 0;
  const korting      = header.korting ?? 0;

  const matOpslag = rnd2(totaalMateriaal * opslagMat / 100);
  const arbOpslag = rnd2(totaalArbeid * opslagArb / 100);
  const naToeslag = rnd2(totaalExclOpslag + matOpslag + arbOpslag);

  const akBijdrageOpslag  = header.akIsVast  ? (header.opslagAk ?? 0) : rnd2(naToeslag * opslagAk / 100);
  const abkBijdrage       = header.abkIsVast ? (header.opslagAbk ?? 0) : rnd2(naToeslag * opslagAbk / 100);
  const risicoBijdrage    = header.risicoIsVast ? (header.opslagRisico ?? 0) : rnd2(naToeslag * opslagRisico / 100);
  const winstBijdrage     = header.winstIsVast  ? (header.opslagWinst ?? 0) : rnd2(naToeslag * opslagWinst / 100);

  const subtotaalMetOpslagen = rnd2(naToeslag + akBijdrageOpslag + abkBijdrage + risicoBijdrage + winstBijdrage);
  const totaalInclOpslag = rnd2(subtotaalMetOpslagen * (1 - korting / 100));

  // ── Actieve jaarbegroting (huidig jaar, fallback meest recent) ──────────────
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

  // ── AK-bijdrage via MU × normtarief ────────────────────────────────────────
  let akBijdrageFie: number | null = null;
  let verwachteMargeAbs: number | null = null;
  let verwachteMargePct: number | null = null;
  let adviesStatus: AdviesStatus = "geen_begroting";
  let adviesTekst = "Geen actieve jaarbegroting gevonden. Stel een begroting in via Beheer > Bedrijfskompas.";

  if (begroting) {
    // AK per uur: handmatige norm op begroting krijgt prioriteit; daarna berekend uit posten
    let akPerUur = begroting.akPerProductiefUur ?? null;
    if (!akPerUur) {
      akPerUur = await berekenAkPerUur(begroting.boekjaar);
    }

    if (akPerUur !== null && totaalMu > 0) {
      akBijdrageFie = rnd2(akPerUur * totaalMu);
    }

    const doelMargePct = begroting.doelMargePct;

    if (totaalInclOpslag > 0) {
      const directeKosten = totaalArbeid + totaalMateriaal + totaalOnderaanneming;
      const akKosten = akBijdrageFie ?? (totaalInclOpslag * opslagAk / 100);
      verwachteMargeAbs = rnd2(totaalInclOpslag - directeKosten - akKosten);
      verwachteMargePct = rnd2((verwachteMargeAbs / totaalInclOpslag) * 100);

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

  // Effectief AK/uur: gebruik de berekende waarde als de handmatige norm niet is ingesteld.
  let effectiefAkPerUur: number | null = begroting?.akPerProductiefUur ?? null;
  if (!effectiefAkPerUur && begroting) {
    effectiefAkPerUur = await berekenAkPerUur(begroting.boekjaar);
  }

  return {
    calculatieId,
    heeftBegroting,
    boekjaar: begroting?.boekjaar ?? null,
    doelMargePct: begroting?.doelMargePct ?? null,
    akPerUur: effectiefAkPerUur,
    totaalArbeid,
    totaalMateriaal,
    totaalOnderaanneming,
    totaalMu,
    totaalExclOpslag,
    totaalInclOpslag,
    akBijdrage: akBijdrageFie,
    verwachteMargeAbs,
    verwachteMargePct,
    adviesStatus,
    adviesTekst,
    opslagAkPct: opslagAk,
  };
}

// Liquiditeit-service — Financieel Dashboard / Projectcontrol (Directiecockpit).
//
// Berekent de liquiditeitspositie van de organisatie op basis van openstaande
// facturen (debiteuren = verkoop, crediteuren = inkoop) plus een optioneel
// banksaldo dat via AccountView wordt opgehaald. Er worden GEEN gesimuleerde
// bankcijfers verzonnen: als AccountView geen banksaldo levert, blijft het veld
// leeg en toont het dashboard "niet beschikbaar".
//
// De signalen worden als observatie-shape teruggegeven zodat ze zowel in het
// liquiditeitsdashboard als in het bestaande FIE-observatiespaneel gebruikt
// kunnen worden.
import { db, facturenTable, accountviewInstellingenTable } from "@workspace/db";
import { and, eq, ne, or, isNull, sql } from "drizzle-orm";
import { maakAccountViewClient } from "./accountview-client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LiquiditeitSignaal {
  type: string;
  ernst: "info" | "waarschuwing" | "kritiek";
  omschrijving: string;
  waarde: number | null;
  drempelwaarde: number | null;
  afwijking_pct: number | null;
  impact: string | null;
  advies: string | null;
}

export interface LiquiditeitAging {
  niet_vervallen: number;
  vervallen_1_30: number;
  vervallen_31_60: number;
  vervallen_60_plus: number;
}

export interface LiquiditeitCashflow {
  horizon_dagen: number;
  verwachte_inkomsten: number;
  verwachte_uitgaven: number;
  netto: number;
}

export interface LiquiditeitDashboard {
  peildatum: string;
  banksaldo: number | null;
  banksaldo_bron: string;
  banksaldo_reden: string | null;
  openstaande_debiteuren: number;
  aantal_debiteuren: number;
  openstaande_crediteuren: number;
  aantal_crediteuren: number;
  werkkapitaal: number;
  netto_liquiditeit: number | null;
  debiteuren_aging: LiquiditeitAging;
  crediteuren_aging: LiquiditeitAging;
  cashflow: LiquiditeitCashflow[];
  drempel_liquiditeit: number;
  signalen: LiquiditeitSignaal[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function rnd2(v: number): number {
  return Math.round(v * 100) / 100;
}

function numOf(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Parse een tekstdatum (YYYY-MM-DD of ISO) naar Date, of null bij ongeldig. */
function parseDatum(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dagenTussen(vanaf: Date, tot: Date): number {
  return Math.floor((tot.getTime() - vanaf.getTime()) / (1000 * 60 * 60 * 24));
}

interface OpenFactuur {
  bedrag: number;
  vervaldatum: Date | null;
}

/**
 * Haalt openstaande facturen op voor één type (inkoop/verkoop).
 * Openstaand = betaalstatus niet 'betaald' (incl. null/openstaand/deels_betaald)
 * en factuur niet afgekeurd of geblokkeerd.
 */
async function leesOpenstaandeFacturen(type: "inkoop" | "verkoop"): Promise<OpenFactuur[]> {
  const rows = await db
    .select({
      bedragInclBtw: facturenTable.bedragInclBtw,
      vervaldatum: facturenTable.vervaldatum,
    })
    .from(facturenTable)
    .where(
      and(
        eq(facturenTable.type, type),
        eq(facturenTable.geblokkeerd, false),
        ne(facturenTable.status, "afgekeurd"),
        or(isNull(facturenTable.betaalstatus), ne(facturenTable.betaalstatus, "betaald")),
      ),
    );

  return rows
    .map((r) => ({ bedrag: numOf(r.bedragInclBtw), vervaldatum: parseDatum(r.vervaldatum) }))
    .filter((r) => r.bedrag > 0);
}

function berekenAging(facturen: OpenFactuur[], peildatum: Date): LiquiditeitAging {
  const aging: LiquiditeitAging = {
    niet_vervallen: 0,
    vervallen_1_30: 0,
    vervallen_31_60: 0,
    vervallen_60_plus: 0,
  };
  for (const f of facturen) {
    if (!f.vervaldatum) {
      // Onbekende vervaldatum: behandel als niet-vervallen (voorzichtig).
      aging.niet_vervallen += f.bedrag;
      continue;
    }
    const dagenVervallen = dagenTussen(f.vervaldatum, peildatum);
    if (dagenVervallen <= 0) aging.niet_vervallen += f.bedrag;
    else if (dagenVervallen <= 30) aging.vervallen_1_30 += f.bedrag;
    else if (dagenVervallen <= 60) aging.vervallen_31_60 += f.bedrag;
    else aging.vervallen_60_plus += f.bedrag;
  }
  aging.niet_vervallen = rnd2(aging.niet_vervallen);
  aging.vervallen_1_30 = rnd2(aging.vervallen_1_30);
  aging.vervallen_31_60 = rnd2(aging.vervallen_31_60);
  aging.vervallen_60_plus = rnd2(aging.vervallen_60_plus);
  return aging;
}

/**
 * Verwachte cashflow binnen een horizon: alle facturen die op of vóór
 * peildatum+horizon vervallen (inclusief reeds vervallen — die worden op korte
 * termijn verwacht binnen te komen respectievelijk te moeten worden betaald).
 */
function berekenCashflow(
  debiteuren: OpenFactuur[],
  crediteuren: OpenFactuur[],
  peildatum: Date,
  horizonDagen: number,
): LiquiditeitCashflow {
  const grens = new Date(peildatum.getTime() + horizonDagen * 24 * 60 * 60 * 1000);
  const binnen = (f: OpenFactuur) => f.vervaldatum != null && f.vervaldatum <= grens;
  const inkomsten = rnd2(debiteuren.filter(binnen).reduce((s, f) => s + f.bedrag, 0));
  const uitgaven = rnd2(crediteuren.filter(binnen).reduce((s, f) => s + f.bedrag, 0));
  return {
    horizon_dagen: horizonDagen,
    verwachte_inkomsten: inkomsten,
    verwachte_uitgaven: uitgaven,
    netto: rnd2(inkomsten - uitgaven),
  };
}

// ─── Banksaldo via AccountView (fail-soft) ────────────────────────────────────

async function leesBanksaldo(): Promise<{ saldo: number | null; bron: string; reden: string | null }> {
  const [inst] = await db.select().from(accountviewInstellingenTable).limit(1);
  if (!inst) {
    return { saldo: null, bron: "niet_beschikbaar", reden: "AccountView is niet geconfigureerd." };
  }
  const client = maakAccountViewClient(inst);
  const resultaat = await client.leesBankSaldo();
  if (resultaat.beschikbaar && resultaat.saldo != null) {
    return { saldo: rnd2(resultaat.saldo), bron: "accountview", reden: null };
  }
  return { saldo: null, bron: "niet_beschikbaar", reden: resultaat.reden ?? "Banksaldo niet beschikbaar via AccountView." };
}

// ─── Signalen (drempelsignalering) ────────────────────────────────────────────

const DREMPEL_LIQUIDITEIT = 0;

export function bouwLiquiditeitSignalen(d: {
  banksaldo: number | null;
  netto_liquiditeit: number | null;
  debiteuren_aging: LiquiditeitAging;
  crediteuren_aging: LiquiditeitAging;
  cashflow: LiquiditeitCashflow[];
  werkkapitaal: number;
}): LiquiditeitSignaal[] {
  const signalen: LiquiditeitSignaal[] = [];

  // 1. Negatieve nettoliquiditeit (alleen als banksaldo bekend is)
  if (d.netto_liquiditeit != null && d.netto_liquiditeit < DREMPEL_LIQUIDITEIT) {
    signalen.push({
      type: "liquiditeit_tekort",
      ernst: "kritiek",
      omschrijving: `Netto liquiditeitspositie is negatief (€ ${d.netto_liquiditeit.toLocaleString("nl-NL", { maximumFractionDigits: 0 })}). Direct actie vereist.`,
      waarde: d.netto_liquiditeit,
      drempelwaarde: DREMPEL_LIQUIDITEIT,
      afwijking_pct: null,
      impact: "Onvoldoende middelen om lopende verplichtingen te dekken.",
      advies: "Versnel debiteureninning, stel crediteurenbetalingen uit of regel aanvullende financiering.",
    });
  }

  // 2. Achterstallige crediteuren (te laat te betalen)
  const credAchterstallig = rnd2(
    d.crediteuren_aging.vervallen_1_30 + d.crediteuren_aging.vervallen_31_60 + d.crediteuren_aging.vervallen_60_plus,
  );
  if (credAchterstallig > 0) {
    const ernstig = d.crediteuren_aging.vervallen_60_plus > 0;
    signalen.push({
      type: "crediteuren_achterstallig",
      ernst: ernstig ? "waarschuwing" : "info",
      omschrijving: `€ ${credAchterstallig.toLocaleString("nl-NL", { maximumFractionDigits: 0 })} aan crediteuren is vervallen${ernstig ? ", waarvan een deel langer dan 60 dagen" : ""}.`,
      waarde: credAchterstallig,
      drempelwaarde: 0,
      afwijking_pct: null,
      impact: "Risico op aanmaningen, rente of verstoorde leveranciersrelaties.",
      advies: "Plan de openstaande crediteuren in of neem contact op met leveranciers over betaalafspraken.",
    });
  }

  // 3. Achterstallige debiteuren (te laat ontvangen)
  const debAchterstallig = rnd2(
    d.debiteuren_aging.vervallen_1_30 + d.debiteuren_aging.vervallen_31_60 + d.debiteuren_aging.vervallen_60_plus,
  );
  if (debAchterstallig > 0) {
    const ernstig = d.debiteuren_aging.vervallen_60_plus > 0;
    signalen.push({
      type: "debiteuren_achterstallig",
      ernst: ernstig ? "waarschuwing" : "info",
      omschrijving: `€ ${debAchterstallig.toLocaleString("nl-NL", { maximumFractionDigits: 0 })} aan debiteuren is vervallen${ernstig ? ", waarvan een deel langer dan 60 dagen" : ""}.`,
      waarde: debAchterstallig,
      drempelwaarde: 0,
      afwijking_pct: null,
      impact: "Vertraagde binnenkomst van geld drukt op de liquiditeit.",
      advies: "Verstuur herinneringen of aanmaningen voor de vervallen debiteuren.",
    });
  }

  // 4. Negatieve verwachte cashflow op 30 dagen
  const cf30 = d.cashflow.find((c) => c.horizon_dagen === 30);
  const cf90 = d.cashflow.find((c) => c.horizon_dagen === 90);
  if (cf30 && cf30.netto < 0) {
    const ookLang = cf90 != null && cf90.netto < 0;
    signalen.push({
      type: "cashflow_negatief_30d",
      ernst: ookLang ? "kritiek" : "waarschuwing",
      omschrijving: `Verwachte cashflow over 30 dagen is negatief (€ ${cf30.netto.toLocaleString("nl-NL", { maximumFractionDigits: 0 })})${ookLang ? " en blijft negatief over 90 dagen" : ""}.`,
      waarde: cf30.netto,
      drempelwaarde: 0,
      afwijking_pct: null,
      impact: "Uitgaven overtreffen de verwachte inkomsten op korte termijn.",
      advies: "Bewaak de betaalkalender en stem inkoop- en betaalmomenten af op binnenkomende gelden.",
    });
  }

  return signalen;
}

// ─── Hoofdfunctie ─────────────────────────────────────────────────────────────

/**
 * Berekent het volledige liquiditeitsdashboard.
 * @param metBanksaldo of het (mogelijk trage) AccountView-banksaldo opgehaald wordt.
 */
export async function berekenLiquiditeit(metBanksaldo = true): Promise<LiquiditeitDashboard> {
  const peildatum = new Date();

  const [debiteuren, crediteuren] = await Promise.all([
    leesOpenstaandeFacturen("verkoop"),
    leesOpenstaandeFacturen("inkoop"),
  ]);

  const openDeb = rnd2(debiteuren.reduce((s, f) => s + f.bedrag, 0));
  const openCred = rnd2(crediteuren.reduce((s, f) => s + f.bedrag, 0));
  const werkkapitaal = rnd2(openDeb - openCred);

  const debiteurenAging = berekenAging(debiteuren, peildatum);
  const crediteurenAging = berekenAging(crediteuren, peildatum);

  const cashflow = [7, 30, 90].map((h) => berekenCashflow(debiteuren, crediteuren, peildatum, h));

  let banksaldo: number | null = null;
  let banksaldoBron = "niet_beschikbaar";
  let banksaldoReden: string | null = "Banksaldo niet opgehaald.";
  if (metBanksaldo) {
    const bank = await leesBanksaldo();
    banksaldo = bank.saldo;
    banksaldoBron = bank.bron;
    banksaldoReden = bank.reden;
  }

  const nettoLiquiditeit = banksaldo != null ? rnd2(banksaldo + werkkapitaal) : null;

  const signalen = bouwLiquiditeitSignalen({
    banksaldo,
    netto_liquiditeit: nettoLiquiditeit,
    debiteuren_aging: debiteurenAging,
    crediteuren_aging: crediteurenAging,
    cashflow,
    werkkapitaal,
  });

  return {
    peildatum: peildatum.toISOString(),
    banksaldo,
    banksaldo_bron: banksaldoBron,
    banksaldo_reden: banksaldoReden,
    openstaande_debiteuren: openDeb,
    aantal_debiteuren: debiteuren.length,
    openstaande_crediteuren: openCred,
    aantal_crediteuren: crediteuren.length,
    werkkapitaal,
    netto_liquiditeit: nettoLiquiditeit,
    debiteuren_aging: debiteurenAging,
    crediteuren_aging: crediteurenAging,
    cashflow,
    drempel_liquiditeit: DREMPEL_LIQUIDITEIT,
    signalen,
  };
}

/**
 * Snelle, DB-only liquiditeitssignalen zonder AccountView-aanroep.
 * Gebruikt door berekenJaarprognose om liquiditeitssignalen in het
 * observatiespaneel te injecteren zonder de prognose-hotpath te vertragen.
 */
export async function berekenLiquiditeitSignalen(): Promise<LiquiditeitSignaal[]> {
  const dashboard = await berekenLiquiditeit(false);
  return dashboard.signalen;
}

/**
 * CALC_KERN_01 — dé ene rekenkern voor de calculatiemodule.
 *
 * Server (api-server) én scherm (firevault) rekenen uitsluitend via deze kern.
 * Er wordt intern in hele centen (integers) gerekend zodat floating-point-drift
 * over honderden regels onmogelijk is. Afronden gebeurt op precies één plek:
 * `naarCenten` (banker's-vrij: Math.round op centen).
 *
 * Semantiek (ADVIES_01 §3/§6):
 * - alleen soorten 'regel' en 'materiaal' tellen mee in totalen;
 * - tekst/kop dragen nooit een bedrag; stelpost toont een bedrag maar telt niet mee;
 * - optioneel=true telt niet mee in het aangeboden totaal, wel apart gesommeerd;
 * - subtotalen zijn de som van per-regel afgeronde bedragen (natelbaar: het
 *   totaal is exact de som van de getoonde regelbedragen).
 */

// ── Afronding: de enige plek ────────────────────────────────────────────────

/** Euro's → hele centen (integer). NaN/null/undefined → 0. */
export function naarCenten(n: number | null | undefined): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  // Kleine epsilon tegen binaire representatie (bv. 4.985 * 100 = 498.49999…).
  return Math.round(v * 100 + (v >= 0 ? 1e-6 : -1e-6));
}

/** Centen (integer) → euro's met 2 decimalen. */
export function naarEuro(centen: number): number {
  return centen / 100;
}

/** Afronden op 2 decimalen via centen. Dé afrondfunctie van de calculatiemodule. */
export function rond2(n: number | null | undefined): number {
  return naarEuro(naarCenten(n));
}

/**
 * Percentage van een centenbedrag, afgerond op hele centen.
 * Zelfde tekensymmetrische afronding als naarCenten (halve cent weg van nul),
 * zodat negatieve bedragen niet anders afronden dan positieve.
 */
function pctVanCenten(centen: number, pct: number | null | undefined): number {
  const p = typeof pct === "number" && Number.isFinite(pct) ? pct : 0;
  const v = (centen * p) / 100;
  return v >= 0 ? Math.round(v) : -Math.round(-v);
}

// ── Regelsoorten ────────────────────────────────────────────────────────────

export const MEETELLENDE_SOORTEN: ReadonlySet<string> = new Set(["regel", "materiaal"]);

export function teltMeeRegel(r: { soort?: string | null }): boolean {
  return MEETELLENDE_SOORTEN.has(r.soort ?? "regel");
}

// ── Typen ───────────────────────────────────────────────────────────────────

/** Regelinvoer voor de kern — snake_case zoals de API-responses en het scherm. */
export type KernRegel = {
  soort?: string | null;
  optioneel?: boolean | null;
  is_staartkosten?: boolean | null;
  is_bouwplaatskosten?: boolean | null;
  hoeveelheid?: number | null;
  tarief?: number | null;
  mu_per_eenheid?: number | null;
  arbeids_tarief?: number | null;
  onderaanneming_bedrag?: number | null;
};

export type KernOpslagen = {
  opslag_materiaal?: number | null;
  opslag_arbeid?: number | null;
  opslag_ak?: number | null;
  opslag_abk?: number | null;
  opslag_risico?: number | null;
  opslag_winst?: number | null;
  korting?: number | null;
  ak_is_vast?: boolean | null;
  abk_is_vast?: boolean | null;
  risico_is_vast?: boolean | null;
  winst_is_vast?: boolean | null;
};

export type RegelBedragen = {
  /** hv × tarief, afgerond op de cent. */
  materiaal_totaal: number;
  /** hv × mu_per_eenheid, afgerond op 2 decimalen (manuren). */
  mu_totaal: number;
  /** mu_totaal × arbeids_tarief, afgerond op de cent. */
  arbeidsloon: number;
  onderaanneming_bedrag: number;
  /** materiaal + arbeidsloon + onderaanneming (stelpost: het stelpostbedrag). */
  totaal: number;
};

export type SomBedragen = {
  mu_totaal: number;
  materiaal_totaal: number;
  arbeidsloon: number;
  onderaanneming_bedrag: number;
  totaal: number;
};

export type CalculatieTotalen = {
  // Kostensubtotalen (vóór opslagen)
  materiaal_subtotaal: number;
  arbeid_subtotaal: number;
  onderaanneming_subtotaal: number;
  bouwplaats_subtotaal: number;
  staart_subtotaal: number;
  /** Som van de kale kosten (materiaal+arbeid+oa+bouwplaats+staart, vóór opslagen). */
  kostprijs: number;
  // Opslagen
  materiaal_opslag_bedrag: number;
  arbeid_opslag_bedrag: number;
  subtotaal: number;
  ak_bedrag: number;
  abk_bedrag: number;
  risico_bedrag: number;
  basis_winst: number;
  winst_bedrag: number;
  aanneemsom: number;
  korting_bedrag: number;
  /** Eindtotaal excl. btw ná korting. */
  totaal_na_opslagen: number;
  btw_bedrag: number;
  incl_btw: number;
  /** Marge t.o.v. kostprijs, in % met 1 decimaal (weergavewaarde). */
  marge_pct: number;
  optioneel_totaal: number;
  /** Manuren over alle meetellende, niet-optionele regels. */
  mu_totaal: number;
};

// ── Per-regel bedragen ──────────────────────────────────────────────────────

/** Interne variant in centen (mu in honderdsten van uren). */
function regelCenten(r: KernRegel): {
  matC: number; muH: number; arbC: number; oaC: number; totC: number;
} {
  const soort = r.soort ?? "regel";
  if (soort === "tekst" || soort === "kop") {
    return { matC: 0, muH: 0, arbC: 0, oaC: 0, totC: 0 };
  }
  if (soort === "stelpost") {
    // Stelpost: bedrag staat in tarief (hv=1); zichtbaar, telt niet mee in totalen.
    const c = naarCenten(r.tarief);
    return { matC: c, muH: 0, arbC: 0, oaC: 0, totC: c };
  }
  const hv = typeof r.hoeveelheid === "number" && Number.isFinite(r.hoeveelheid) ? r.hoeveelheid : 0;
  const matC = naarCenten(hv * (r.tarief ?? 0));
  const muH = naarCenten(hv * (r.mu_per_eenheid ?? 0)); // manuren ×100, 2 dec
  const arbC = naarCenten(naarEuro(muH) * (r.arbeids_tarief ?? 0));
  const oaC = naarCenten(r.onderaanneming_bedrag);
  return { matC, muH, arbC, oaC, totC: matC + arbC + oaC };
}

/** Bedragen van één regel, in euro's — identiek voor server en scherm. */
export function berekenRegelBedragen(r: KernRegel): RegelBedragen {
  const c = regelCenten(r);
  return {
    materiaal_totaal: naarEuro(c.matC),
    mu_totaal: naarEuro(c.muH),
    arbeidsloon: naarEuro(c.arbC),
    onderaanneming_bedrag: naarEuro(c.oaC),
    totaal: naarEuro(c.totC),
  };
}

/**
 * Som van regelbedragen over een willekeurige set regels (bv. één categorie of
 * één eenheid op het scherm). Alleen meetellende, niet-optionele regels dragen
 * bij, tenzij `alles` — dan telt elke regel die een bedrag kán dragen mee.
 */
export function somRegelBedragen(regels: KernRegel[], opts?: { alles?: boolean }): SomBedragen {
  let muH = 0, matC = 0, arbC = 0, oaC = 0, totC = 0;
  for (const r of regels) {
    if (!opts?.alles && (!teltMeeRegel(r) || r.optioneel)) continue;
    if (opts?.alles && !teltMeeRegel(r)) continue;
    const c = regelCenten(r);
    muH += c.muH; matC += c.matC; arbC += c.arbC; oaC += c.oaC; totC += c.totC;
  }
  return {
    mu_totaal: naarEuro(muH),
    materiaal_totaal: naarEuro(matC),
    arbeidsloon: naarEuro(arbC),
    onderaanneming_bedrag: naarEuro(oaC),
    totaal: naarEuro(totC),
  };
}

// ── Calculatietotalen ───────────────────────────────────────────────────────

export function berekenTotalen(regels: KernRegel[], opslagen: KernOpslagen): CalculatieTotalen {
  const meetellend = regels.filter((r) => teltMeeRegel(r) && !r.optioneel);
  const optioneleRegels = regels.filter((r) => teltMeeRegel(r) && r.optioneel);

  let optioneelC = 0;
  for (const r of optioneleRegels) optioneelC += regelCenten(r).totC;

  const directe = meetellend.filter((r) => !r.is_staartkosten && !r.is_bouwplaatskosten);
  const bouwplaats = meetellend.filter((r) => r.is_bouwplaatskosten);
  const staart = meetellend.filter((r) => r.is_staartkosten && !r.is_bouwplaatskosten);

  let matC = 0, arbC = 0, oaC = 0, muH = 0;
  for (const r of directe) {
    const c = regelCenten(r);
    matC += c.matC; arbC += c.arbC; oaC += c.oaC; muH += c.muH;
  }
  let bouwplaatsC = 0;
  for (const r of bouwplaats) { const c = regelCenten(r); bouwplaatsC += c.totC; muH += c.muH; }
  let staartC = 0;
  for (const r of staart) { const c = regelCenten(r); staartC += c.totC; muH += c.muH; }

  const matOpslagC = pctVanCenten(matC, opslagen.opslag_materiaal);
  const arbOpslagC = pctVanCenten(arbC, opslagen.opslag_arbeid);

  const subtotaalC = matC + matOpslagC + arbC + arbOpslagC + oaC + bouwplaatsC + staartC;

  const akC = opslagen.ak_is_vast ? naarCenten(opslagen.opslag_ak) : pctVanCenten(subtotaalC, opslagen.opslag_ak);
  const abkC = opslagen.abk_is_vast ? naarCenten(opslagen.opslag_abk) : pctVanCenten(subtotaalC, opslagen.opslag_abk);
  const risicoC = opslagen.risico_is_vast ? naarCenten(opslagen.opslag_risico) : pctVanCenten(subtotaalC, opslagen.opslag_risico);
  const basisWinstC = subtotaalC + akC + abkC + risicoC;
  const winstC = opslagen.winst_is_vast ? naarCenten(opslagen.opslag_winst) : pctVanCenten(basisWinstC, opslagen.opslag_winst);

  const aanneemsomC = basisWinstC + winstC;
  const kortingC = pctVanCenten(aanneemsomC, opslagen.korting);
  const totaalC = aanneemsomC - kortingC;
  const btwC = pctVanCenten(totaalC, 21);

  const kostprijsC = matC + arbC + oaC + bouwplaatsC + staartC;
  const margePct = totaalC !== 0 ? Math.round(((totaalC - kostprijsC) / totaalC) * 1000) / 10 : 0;

  return {
    materiaal_subtotaal: naarEuro(matC),
    arbeid_subtotaal: naarEuro(arbC),
    onderaanneming_subtotaal: naarEuro(oaC),
    bouwplaats_subtotaal: naarEuro(bouwplaatsC),
    staart_subtotaal: naarEuro(staartC),
    kostprijs: naarEuro(kostprijsC),
    materiaal_opslag_bedrag: naarEuro(matOpslagC),
    arbeid_opslag_bedrag: naarEuro(arbOpslagC),
    subtotaal: naarEuro(subtotaalC),
    ak_bedrag: naarEuro(akC),
    abk_bedrag: naarEuro(abkC),
    risico_bedrag: naarEuro(risicoC),
    basis_winst: naarEuro(basisWinstC),
    winst_bedrag: naarEuro(winstC),
    aanneemsom: naarEuro(aanneemsomC),
    korting_bedrag: naarEuro(kortingC),
    totaal_na_opslagen: naarEuro(totaalC),
    btw_bedrag: naarEuro(btwC),
    incl_btw: naarEuro(totaalC + btwC),
    marge_pct: margePct,
    optioneel_totaal: naarEuro(optioneelC),
    mu_totaal: naarEuro(muH),
  };
}

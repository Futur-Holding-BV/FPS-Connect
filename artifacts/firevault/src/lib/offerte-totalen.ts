// Gedeelde offertetotaal-berekening (ADVIES_01 review-fix).
//
// Klantgerichte sommen mogen optionele regels NIET meetellen in de aanneemsom.
// Optionele regels (is_optioneel === true) worden apart gesommeerd en getoond als
// blok "Optioneel — niet in de aanneemsom". Btw wordt uitsluitend over het
// aangeboden (niet-optionele) deel berekend; het optioneel-blok toont zijn eigen
// bedrag.
//
// Eén helper zodat print.tsx, studio.tsx en verzend-tab.tsx dezelfde regels volgen.

export interface OfferteTotaalRegel {
  kosten?: number | null;
  is_optioneel?: boolean | null;
}

export interface OfferteTotalen {
  /** Som van NIET-optionele regels (het aangeboden totaal, excl. btw). */
  aangebodenExcl: number;
  /** Btw uitsluitend over het aangeboden deel. */
  btw: number;
  /** Aangeboden totaal incl. btw. */
  aangebodenIncl: number;
  /** Som van optionele regels (excl. btw) — apart, telt niet mee in de aanneemsom. */
  optioneelExcl: number;
  /** Of er ten minste één optionele regel is. */
  heeftOptioneel: boolean;
}

export function isOptioneel(r: OfferteTotaalRegel): boolean {
  return r.is_optioneel === true;
}

/**
 * Berekent de aangeboden (niet-optionele) som, de btw over uitsluitend dat deel,
 * en het aparte optioneel-subtotaal.
 */
export function berekenOfferteTotalen(
  regels: readonly OfferteTotaalRegel[] | null | undefined,
  btwPercentage: number,
): OfferteTotalen {
  const lijst = regels ?? [];
  const aangebodenExcl = lijst
    .filter((r) => !isOptioneel(r))
    .reduce((s, r) => s + (r.kosten ?? 0), 0);
  const optioneleRegels = lijst.filter((r) => isOptioneel(r));
  const optioneelExcl = optioneleRegels.reduce((s, r) => s + (r.kosten ?? 0), 0);
  const btw = aangebodenExcl * ((btwPercentage ?? 21) / 100);
  return {
    aangebodenExcl,
    btw,
    aangebodenIncl: aangebodenExcl + btw,
    optioneelExcl,
    heeftOptioneel: optioneleRegels.length > 0,
  };
}

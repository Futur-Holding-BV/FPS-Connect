// UREN_01 §3 — CAO-instellingen als expliciete configuratie op de CAO-keuze.
// Geen vrije-tekst-matching ("bevat metaal") en geen losse factor in de code:
// de ADV-regels (drempel + maximum per week) staan hier per CAO en worden
// overal via vindCaoInstelling() / berekenAdvVoorMedewerker() gebruikt.
//
// De regel van FPS (René, 9 aug 2026): 38 uur CAO + 2 uur ADV sparen = 40 uur
// planning. ADV = min(max_per_week, max(0, gewerkteUren − drempel)).
// Verlof telt niet mee voor ADV-opbouw; alleen werkelijk gewerkte uren.

export interface CaoInstelling {
  naam: string;
  standaard_uren_per_week: number;
  /** Verlofopbouw-gerelateerde ADV (bestaand veld, gebruikt door verlofprofiel). */
  adv_uren_per_week: number;
  /** UREN_01: pas boven dit aantal werkelijk gewerkte uren begint ADV-opbouw. */
  adv_drempel_uren: number;
  /** UREN_01: maximaal zoveel ADV-uren per week op te bouwen (0 = geen weekopbouw). */
  adv_max_uren_per_week: number;
  toelichting: string;
}

export const CAO_OPTIES: readonly CaoInstelling[] = [
  {
    naam: "Metaal & Techniek",
    standaard_uren_per_week: 38,
    adv_uren_per_week: 0,
    adv_drempel_uren: 38,
    adv_max_uren_per_week: 2,
    toelichting:
      "CAO Metaal & Techniek (Technisch Installatiebedrijf). Normweek 38 uur; bij een 40-urige werkweek wordt het verschil als ADV/roostervrije tijd opgebouwd.",
  },
  {
    naam: "Bouw & Infra",
    standaard_uren_per_week: 40,
    adv_uren_per_week: 3.8,
    adv_drempel_uren: 40,
    adv_max_uren_per_week: 0,
    toelichting:
      "CAO Bouw & Infra. Normweek 40 uur met opbouw van roostervrije (ADV-)dagen volgens het bouwplaatsrooster (via verlofopbouw, niet via de weekstaat).",
  },
  {
    naam: "Geen CAO / individueel",
    standaard_uren_per_week: 40,
    adv_uren_per_week: 0,
    adv_drempel_uren: 40,
    adv_max_uren_per_week: 0,
    toelichting:
      "Geen toepasselijke bedrijfstak-CAO; arbeidsvoorwaarden volgen de individuele arbeidsovereenkomst.",
  },
] as const;

/** Exacte match op de CAO-naam (case-insensitief, getrimd) — geen substrings. */
export function vindCaoInstelling(cao: string | null | undefined): CaoInstelling | null {
  const naam = (cao ?? "").trim().toLowerCase();
  if (!naam) return null;
  return CAO_OPTIES.find((c) => c.naam.toLowerCase() === naam) ?? null;
}

export interface AdvUitkomst {
  adv_uren: number;
  /** null = ADV opgebouwd (of 0 door te weinig uren); anders de reden waarom niet. */
  adv_reden: string | null;
}

/**
 * ADV = min(max, max(0, gewerkteUren − drempel)) — alleen werkelijk gewerkte
 * uren. Komt de medewerker niet in aanmerking, dan is dat een zichtbare reden
 * en geen leeg veld dat op een fout lijkt (UREN_01 §3.3).
 */
export function berekenAdvVoorMedewerker(
  medewerker: { cao: string | null; dienstverband: string | null },
  gewerkteUren: number,
): AdvUitkomst {
  const instelling = vindCaoInstelling(medewerker.cao);
  if (!instelling) {
    return { adv_uren: 0, adv_reden: "geen ADV-opbouw (CAO onbekend of niet ingesteld)" };
  }
  if (instelling.adv_max_uren_per_week <= 0) {
    return { adv_uren: 0, adv_reden: `geen ADV-opbouw (CAO ${instelling.naam})` };
  }
  if (medewerker.dienstverband !== "vast") {
    return { adv_uren: 0, adv_reden: "geen ADV-opbouw (dienstverband niet vast)" };
  }
  const adv = Math.min(
    instelling.adv_max_uren_per_week,
    Math.max(0, gewerkteUren - instelling.adv_drempel_uren),
  );
  return { adv_uren: Math.round(adv * 100) / 100, adv_reden: null };
}

/**
 * Weekgrens waarboven uren als overwerk gelden (UREN_01 §4): CAO-drempel +
 * ADV-ruimte (38 + 2 = 40 voor Metaal & Techniek). Onbekende CAO → 40.
 */
export function overwerkGrens(cao: string | null | undefined): number {
  const instelling = vindCaoInstelling(cao);
  if (!instelling) return 40;
  return instelling.adv_drempel_uren + instelling.adv_max_uren_per_week;
}

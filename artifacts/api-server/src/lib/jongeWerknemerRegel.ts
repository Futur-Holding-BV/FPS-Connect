// Arbeidstijdenwet (ATW) — wettelijke regels voor jonge werknemers.
//
// Bronnen (leidend):
//   Arbeidstijdenwet art. 4:3 – dagelijkse en wekelijkse grenzen jongeren.
//   Arbeidstijdenwet art. 5:7 – verbod nachtarbeid jongeren.
//   Arbeidstijdenbesluit jongeren §2 – gevaarlijk werk, pauzerecht.
//
// Gebruik: deze module bevat ALLEEN pure functies (geen I/O). Ze zijn bewust
// losgekoppeld van routes zodat routes, compliance-monitoring en planning
// allemaal dezelfde juridisch correcte bron gebruiken.
//
// Leeftijdsbanden:
//   16–17 jaar  →  ATW art. 4:3 (beperkingen zoals hieronder)
//   < 16 jaar   →  andere, strengere wetgeving (art. 4:2 en ATB §2);
//                  afzonderlijk signaal "te_jong_voor_regulier_werk".
//   ≥ 18 jaar   →  geen ATW-jongerenbeperkingen.

export interface AtwBeperking {
  /** Korte machine-leesbare code. */
  code: string;
  /** Mensleesbare omschrijving inclusief wetsartikel. */
  omschrijving: string;
}

/** Een concrete overtreding van een ATW-grens in een specifieke planningscontext. */
export interface AtwSchending {
  code: string;
  omschrijving: string;
}

/** Berekent de leeftijd in gehele jaren op de peildatum. */
export function berekenLeeftijd(
  geboortedatum: string | null,
  peildatum: Date = new Date(),
): number | null {
  if (!geboortedatum) return null;
  const geb = new Date(`${geboortedatum}T00:00:00`);
  if (isNaN(geb.getTime())) return null;
  let leeftijd = peildatum.getFullYear() - geb.getFullYear();
  const mDiff = peildatum.getMonth() - geb.getMonth();
  if (mDiff < 0 || (mDiff === 0 && peildatum.getDate() < geb.getDate())) {
    leeftijd--;
  }
  return leeftijd;
}

/** Retourneert true als de medewerker op de peildatum jonger dan 18 jaar is. */
export function isMinderjarig(
  geboortedatum: string | null,
  peildatum: Date = new Date(),
): boolean {
  const l = berekenLeeftijd(geboortedatum, peildatum);
  return l !== null && l < 18;
}

/**
 * Geeft de wettelijke ATW-beperkingen terug per leeftijdsband.
 *
 * Beperkingen voor 16–17-jarigen (ATW art. 4:3 / 5:7 / ATB jongeren):
 *  • Max. 9 uur per dag
 *  • Max. 45 uur per week; gemiddeld max. 40 uur/week over 4 aaneengesloten weken
 *  • Geen nachtarbeid tussen 22:00 en 07:00
 *  • Gevaarlijk werk alleen onder directe volwassen begeleiding
 *  • Minimaal 12 uur dagelijkse rusttijd
 *  • Pauze van minimaal 30 min. bij een werkdag van meer dan 4,5 uur
 *
 * Leeg array → medewerker is 18 jaar of ouder, geen ATW-jongerenbeperkingen.
 */
export function atwBeperkingen(leeftijd: number): AtwBeperking[] {
  if (leeftijd >= 18) return [];

  if (leeftijd < 16) {
    return [
      {
        code: "te_jong_voor_regulier_werk",
        omschrijving:
          `Medewerker is ${leeftijd} jaar. Reguliere arbeid voor medewerkers jonger dan 16 jaar ` +
          "valt onder afzonderlijke, strengere wetgeving (ATW art. 4:2 en Arbeidstijdenbesluit §2). " +
          "Raadpleeg HR/juridisch advies vóór inzet.",
      },
    ];
  }

  // Leeftijdsband 16–17 jaar (ATW art. 4:3):
  return [
    {
      code: "max_uren_dag",
      omschrijving: "Maximaal 9 uur per werkdag (ATW art. 4:3 lid 1).",
    },
    {
      code: "max_uren_week",
      omschrijving:
        "Maximaal 45 uur per week; gemiddeld maximaal 40 uur/week over elke aaneengesloten periode van 4 weken (ATW art. 4:3 lid 2).",
    },
    {
      code: "nachtdienst_verbod",
      omschrijving: "Geen nachtarbeid tussen 22:00 en 07:00 (ATW art. 5:7 lid 1 + ATB jongeren §1).",
    },
    {
      code: "gevaarlijk_werk_toezicht",
      omschrijving:
        "Gevaarlijk of risicovol werk alleen onder directe begeleiding van een volwassen medewerker (Arbobesluit art. 1.37).",
    },
    {
      code: "rusttijd_min_12u",
      omschrijving: "Minimaal 12 aaneengesloten uren rust per etmaal (ATW art. 4:3 lid 3).",
    },
    {
      code: "pauze_na_4u30",
      omschrijving:
        "Pauze van minimaal 30 minuten bij een werkdag van meer dan 4,5 uur (ATW art. 5:8).",
    },
  ];
}

// ── Hulpfuncties voor planningscontext ──────────────────────────────────────

/**
 * Converteert een "HH:MM" of "HH:MM:SS" string naar decimale uren (bijv. "23:30" → 23.5).
 * Retourneert null bij een ongeldige string.
 */
function tijdNaarUren(tijdStr: string | null | undefined): number | null {
  if (!tijdStr) return null;
  const [h, m] = tijdStr.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h + m / 60;
}

/**
 * Berekent het aantal kalenderdagen dat een item beslaat.
 * datum_start == datum_eind → 1 dag.
 */
export function itemAantalDagen(datumStart: string, datumEind: string): number {
  const s = new Date(`${datumStart}T00:00:00`).getTime();
  const e = new Date(`${datumEind}T00:00:00`).getTime();
  if (isNaN(s) || isNaN(e) || e < s) return 1;
  return Math.round((e - s) / 86_400_000) + 1;
}

/**
 * Berekent het aantal overlappende kalenderdagen van twee datumranges.
 * Retourneert 0 als er geen overlap is.
 */
export function overlapDagen(
  aStart: string, aEind: string,
  bStart: string, bEind: string,
): number {
  const overlapStart = aStart > bStart ? aStart : bStart;
  const overlapEind  = aEind  < bEind  ? aEind  : bEind;
  if (overlapStart > overlapEind) return 0;
  return itemAantalDagen(overlapStart, overlapEind);
}

/** Geeft de ISO-maandag van de n-de week ná een gegeven ISO-maandag. */
export function maandagPlusWeken(maandagStr: string, n: number): string {
  const d = new Date(`${maandagStr}T00:00:00`);
  d.setDate(d.getDate() + 7 * n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Geeft de ISO-maandag van elke kalenderweek die het bereik [van, tot] raakt. */
export function enumWeken(van: string, tot: string): string[] {
  const weken: string[] = [];
  const { van: eersteWkMa } = isoWeekGrenzen(van);
  const d = new Date(`${eersteWkMa}T00:00:00`);
  const eindD = new Date(`${tot}T00:00:00`);
  const fmt = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  while (d <= eindD) {
    weken.push(fmt(d));
    d.setDate(d.getDate() + 7);
  }
  return weken;
}

/** Geeft alle kalenderdatums van van t/m tot als "YYYY-MM-DD" strings. */
export function enumDagen(van: string, tot: string): string[] {
  const dagen: string[] = [];
  const start = new Date(`${van}T00:00:00`);
  const eind  = new Date(`${tot}T00:00:00`);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  for (const d = new Date(start); d <= eind; d.setDate(d.getDate() + 1)) {
    dagen.push(fmt(d));
  }
  return dagen;
}

/** Geeft de ISO-weekgrenzen (maandag–zondag) van een datum in "YYYY-MM-DD" formaat. */
export function isoWeekGrenzen(datumStr: string): { van: string; tot: string } {
  const d = new Date(`${datumStr}T00:00:00`);
  const dag = d.getDay() || 7; // Ma=1 … Zo=7
  const ma = new Date(d);
  ma.setDate(d.getDate() - (dag - 1));
  const zo = new Date(ma);
  zo.setDate(ma.getDate() + 6);
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return { van: fmt(ma), tot: fmt(zo) };
}

/** Geeft de grenzen van de 4-weken-periode eindigend op de huidige week. */
export function vierWekenGrenzen(datumStr: string): { van: string; tot: string } {
  const week = isoWeekGrenzen(datumStr);
  const eind = new Date(`${week.tot}T00:00:00`);
  const begin = new Date(eind);
  begin.setDate(eind.getDate() - 27); // 4 × 7 − 1 dagen terug
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return { van: fmt(begin), tot: fmt(eind) };
}

/**
 * Detecteert concrete ATW-overtredingen voor een planningsitem van een 16/17-jarige.
 *
 * @param params.leeftijd          Leeftijd op peildatum (alleen band 16–17 wordt geëvalueerd).
 * @param params.dagTotaalUren     Totaal geplande uren op de dag, ÍNclusief het huidige item.
 * @param params.weekTotaalUren    Totaal geplande uren in de ISO-week, ÍNclusief het huidige item.
 * @param params.vierWekenUren     Totaal geplande uren over de 4-weken-periode, ÍNclusief huidig.
 * @param params.tijdStart         Begintijd van het item ("HH:MM" of "HH:MM:SS"), optioneel.
 * @param params.tijdEind          Eindtijd van het item ("HH:MM" of "HH:MM:SS"), optioneel.
 */
export function berekenAtwSchendingen(params: {
  leeftijd: number;
  dagTotaalUren: number;
  weekTotaalUren: number;
  vierWekenUren: number;
  tijdStart?: string | null;
  tijdEind?: string | null;
}): AtwSchending[] {
  if (params.leeftijd < 16 || params.leeftijd >= 18) return [];

  const schendingen: AtwSchending[] = [];

  // Dagmaximum: 9 uur (ATW art. 4:3 lid 1)
  if (params.dagTotaalUren > 9) {
    schendingen.push({
      code: "dagmaximum_overschreden",
      omschrijving:
        `Dagmaximum overschreden: ${params.dagTotaalUren.toFixed(1)} u gepland op deze dag (max. 9 u/dag, ATW art. 4:3 lid 1).`,
    });
  }

  // Weekmaximum: 45 uur (ATW art. 4:3 lid 2)
  if (params.weekTotaalUren > 45) {
    schendingen.push({
      code: "weekmaximum_overschreden",
      omschrijving:
        `Weekmaximum overschreden: ${params.weekTotaalUren.toFixed(1)} u deze week (max. 45 u/week, ATW art. 4:3 lid 2).`,
    });
  }

  // 4-weken-gemiddelde: max. 40 uur/week → max. 160 uur over 4 weken (ATW art. 4:3 lid 2)
  if (params.vierWekenUren > 160) {
    schendingen.push({
      code: "vierwekengemiddelde_overschreden",
      omschrijving:
        `4-weken-gemiddelde overschreden: ${params.vierWekenUren.toFixed(1)} u over 4 weken (max. gem. 40 u/week = 160 u per 4 weken, ATW art. 4:3 lid 2).`,
    });
  }

  // Nachtdienstverbod 22:00–07:00 (ATW art. 5:7 lid 1)
  // Gebruik interval-overlap: een dienst raakt de verboden periode als het
  // tijdvenster [tijdStart, tijdEind] overlapt met [22:00, 07:00 volgend etmaal).
  // Dat geldt ook voor diensten die over middernacht gaan (bijv. 22:00–07:00).
  if (params.tijdStart && params.tijdEind) {
    const s = tijdNaarUren(params.tijdStart);
    const e = tijdNaarUren(params.tijdEind);
    if (s !== null && e !== null) {
      // Verboden nachtperiode: 22:00–07:00 (ATW art. 5:7 lid 1 + ATB jongeren §1).
      // Overlap-methode: dienst [s, e] raakt [22, 07 volgend etmaal) als:
      //  - dienst gaat over middernacht (e <= s), of
      //  - normale dienst begint vóór 07:00, of eindigt na 22:00.
      const overlaptNacht = (): boolean => {
        if (e <= s) {
          // Dienst over middernacht: bevat altijd 22:00 of 07:00-zone.
          return true;
        }
        // Normale dienst (s < e): overlap met [22, 24) of [0, 7).
        return s < 7 || e > 22;
      };
      if (overlaptNacht()) {
        schendingen.push({
          code: "nachtdienst_overlap",
          omschrijving:
            `Dienst ${params.tijdStart}–${params.tijdEind} overlapt de verboden nachtperiode (22:00–07:00, ATW art. 5:7 lid 1 + ATB jongeren §1).`,
        });
      }
    }
  } else if (params.tijdStart || params.tijdEind) {
    // Slechts één kant bekend — controleer het bekende eindpunt.
    const u = tijdNaarUren(params.tijdStart ?? params.tijdEind);
    if (u !== null && (u >= 22 || u < 7)) {
      const tijdLabel = params.tijdStart ?? params.tijdEind;
      schendingen.push({
        code: "nachtdienst_tijdpunt",
        omschrijving:
          `Tijdstip ${tijdLabel} valt in de verboden nachtperiode (22:00–07:00, ATW art. 5:7 lid 1 + ATB jongeren §1).`,
      });
    }
  }

  return schendingen;
}

// ── API-response type ────────────────────────────────────────────────────────

/**
 * JSON-vriendelijke samenvatting voor gebruik als `jonge_werknemer` veld in
 * API-responses.
 */
export interface JongeWerknemerMelding {
  minderjarig: true;
  leeftijd: number;
  /** "16_17" | "jonger_dan_16" */
  leeftijdsband: "16_17" | "jonger_dan_16";
  /** Volledige lijst van wettelijke ATW-beperkingen voor deze leeftijdsband. */
  beperkingen: AtwBeperking[];
  /**
   * Aantoonbare overtredingen van ATW-grenzen in de context van dit planningsitem.
   * Leeg array = geen aantoonbare overtreding (maar beperkingen gelden altijd).
   */
  schendingen: AtwSchending[];
}

/**
 * Berekent de ATW-bijdrage van één planningsitem aan een periode [van, tot],
 * waarbij alleen de dagen tellen waarop de medewerker nog minderjarig is.
 *
 * Semantiek van `uren`: dagrate — het veld geeft de uren die de medewerker
 * ELKE gedekte dag werkt (gelijk aan hoe de plannings-UI ze optelt).
 * Bijdrage = uren × aantal_minderjarige_overlapdagen (géén deling door
 * de totale itemduur).
 *
 * Uren ná de 18e verjaardag worden nooit meegeteld.
 */
export function berekenPlanningBijdrageMinderjarig(
  item: { datumStart: string; datumEind: string | null; uren: number | null },
  van: string,
  tot: string,
  geboortedatum: string | null,
): number {
  if (!geboortedatum) return 0;
  const iEind = item.datumEind ?? item.datumStart;
  const overlapVan = item.datumStart > van ? item.datumStart : van;
  const overlapTot = iEind < tot ? iEind : tot;
  if (overlapVan > overlapTot) return 0;
  const minderjarigeDagen = enumDagen(overlapVan, overlapTot).filter((d) => {
    const lft = berekenLeeftijd(geboortedatum, new Date(`${d}T00:00:00`));
    return lft !== null && lft < 18;
  }).length;
  return (item.uren ?? 0) * minderjarigeDagen;
}

export function jongeWerknemerMelding(
  leeftijd: number,
  schendingen: AtwSchending[] = [],
): JongeWerknemerMelding {
  const leeftijdsband: "16_17" | "jonger_dan_16" = leeftijd >= 16 ? "16_17" : "jonger_dan_16";
  return {
    minderjarig: true,
    leeftijd,
    leeftijdsband,
    beperkingen: atwBeperkingen(leeftijd),
    schendingen,
  };
}

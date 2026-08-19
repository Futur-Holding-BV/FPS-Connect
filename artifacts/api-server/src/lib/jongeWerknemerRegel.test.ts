import { describe, it, expect } from "vitest";
import {
  berekenLeeftijd,
  isMinderjarig,
  atwBeperkingen,
  berekenAtwSchendingen,
  berekenPlanningBijdrageMinderjarig,
  itemAantalDagen,
  overlapDagen,
  enumDagen,
  enumWeken,
  maandagPlusWeken,
  isoWeekGrenzen,
  vierWekenGrenzen,
} from "./jongeWerknemerRegel";

// ── berekenLeeftijd ──────────────────────────────────────────────────────────

describe("berekenLeeftijd", () => {
  it("retourneert null bij null geboortedatum", () => {
    expect(berekenLeeftijd(null)).toBeNull();
  });

  it("retourneert null bij ongeldige datum", () => {
    expect(berekenLeeftijd("niet-een-datum")).toBeNull();
  });

  it("berekent 17 jaar de dag vóór de 18e verjaardag", () => {
    // Geboren 2007-04-01, peildatum 2025-03-31 → nog 17 jaar
    expect(berekenLeeftijd("2007-04-01", new Date("2025-03-31T00:00:00"))).toBe(17);
  });

  it("berekent 18 jaar op de exacte verjaardag", () => {
    expect(berekenLeeftijd("2007-04-01", new Date("2025-04-01T00:00:00"))).toBe(18);
  });

  it("berekent 19 jaar een jaar na de verjaardag", () => {
    expect(berekenLeeftijd("2007-04-01", new Date("2026-04-02T00:00:00"))).toBe(19);
  });

  it("isMinderjarig: true voor peildatum vóór 18e verjaardag", () => {
    expect(isMinderjarig("2009-01-01", new Date("2026-01-01T00:00:00"))).toBe(true);
  });

  it("isMinderjarig: false op exacte 18e verjaardag", () => {
    expect(isMinderjarig("2008-01-01", new Date("2026-01-01T00:00:00"))).toBe(false);
  });
});

// ── atwBeperkingen ──────────────────────────────────────────────────────────

describe("atwBeperkingen", () => {
  it("geeft lege array voor 18+", () => {
    expect(atwBeperkingen(18)).toHaveLength(0);
    expect(atwBeperkingen(25)).toHaveLength(0);
  });

  it("geeft 6 beperkingen voor 16/17-jarigen", () => {
    expect(atwBeperkingen(16)).toHaveLength(6);
    expect(atwBeperkingen(17)).toHaveLength(6);
  });

  it("dagmaximum-beperking vermeldt 9 uur", () => {
    const dagMax = atwBeperkingen(16).find((b) => b.code === "max_uren_dag");
    expect(dagMax).toBeDefined();
    expect(dagMax!.omschrijving).toContain("9 uur");
  });

  it("weekmaximum-beperking vermeldt 45 uur", () => {
    const weekMax = atwBeperkingen(17).find((b) => b.code === "max_uren_week");
    expect(weekMax!.omschrijving).toContain("45 uur");
  });

  it("nachtverbod-beperking vermeldt 22:00 en 07:00", () => {
    const nacht = atwBeperkingen(16).find((b) => b.code === "nachtdienst_verbod");
    expect(nacht!.omschrijving).toContain("22:00");
    expect(nacht!.omschrijving).toContain("07:00");
  });

  it("geeft te-jong-signaal voor medewerker jonger dan 16", () => {
    const beperkingen = atwBeperkingen(14);
    expect(beperkingen).toHaveLength(1);
    expect(beperkingen[0]!.code).toBe("te_jong_voor_regulier_werk");
  });
});

// ── berekenAtwSchendingen — week/4-weken ─────────────────────────────────────

describe("berekenAtwSchendingen – weekmaximum (45 u)", () => {
  const base = { leeftijd: 17, dagTotaalUren: 0, vierWekenUren: 0 };

  it("geen schending bij precies 45 u/week", () => {
    const result = berekenAtwSchendingen({ ...base, weekTotaalUren: 45 });
    expect(result.find((s) => s.code === "weekmaximum_overschreden")).toBeUndefined();
  });

  it("schending bij 45,1 u/week", () => {
    const result = berekenAtwSchendingen({ ...base, weekTotaalUren: 45.1 });
    expect(result.find((s) => s.code === "weekmaximum_overschreden")).toBeDefined();
  });

  it("geen schending voor 18-jarige ongeacht uren", () => {
    const result = berekenAtwSchendingen({ leeftijd: 18, dagTotaalUren: 0, weekTotaalUren: 50, vierWekenUren: 200 });
    expect(result).toHaveLength(0);
  });
});

describe("berekenAtwSchendingen – 4-weken-gemiddelde (160 u)", () => {
  const base = { leeftijd: 16, dagTotaalUren: 0, weekTotaalUren: 40 };

  it("geen schending bij precies 160 u/4 weken", () => {
    const result = berekenAtwSchendingen({ ...base, vierWekenUren: 160 });
    expect(result.find((s) => s.code === "vierwekengemiddelde_overschreden")).toBeUndefined();
  });

  it("schending bij 161 u/4 weken", () => {
    const result = berekenAtwSchendingen({ ...base, vierWekenUren: 161 });
    expect(result.find((s) => s.code === "vierwekengemiddelde_overschreden")).toBeDefined();
  });
});

// ── berekenAtwSchendingen — nachtdienst interval 22:00–07:00 ────────────────

describe("berekenAtwSchendingen – nachtdienstverbod (22:00–07:00)", () => {
  const base = { leeftijd: 17, dagTotaalUren: 0, weekTotaalUren: 40, vierWekenUren: 160 };

  it("normale dagdienst 09:00–17:00: geen nacht-schending", () => {
    const r = berekenAtwSchendingen({ ...base, tijdStart: "09:00", tijdEind: "17:00" });
    expect(r.find((s) => s.code === "nachtdienst_overlap")).toBeUndefined();
  });

  it("dienst eindigt precies op 22:00: geen nacht-schending (grenswaarde)", () => {
    const r = berekenAtwSchendingen({ ...base, tijdStart: "14:00", tijdEind: "22:00" });
    expect(r.find((s) => s.code === "nachtdienst_overlap")).toBeUndefined();
  });

  it("dienst eindigt op 22:01: wél nacht-schending", () => {
    const r = berekenAtwSchendingen({ ...base, tijdStart: "14:00", tijdEind: "22:01" });
    expect(r.find((s) => s.code === "nachtdienst_overlap")).toBeDefined();
  });

  it("dienst start precies op 07:00: geen nacht-schending (grenswaarde)", () => {
    const r = berekenAtwSchendingen({ ...base, tijdStart: "07:00", tijdEind: "15:00" });
    expect(r.find((s) => s.code === "nachtdienst_overlap")).toBeUndefined();
  });

  it("dienst start op 06:59: wél nacht-schending", () => {
    const r = berekenAtwSchendingen({ ...base, tijdStart: "06:59", tijdEind: "15:00" });
    expect(r.find((s) => s.code === "nachtdienst_overlap")).toBeDefined();
  });

  it("avonddienst 20:00–22:00: geen nacht-schending", () => {
    const r = berekenAtwSchendingen({ ...base, tijdStart: "20:00", tijdEind: "22:00" });
    expect(r.find((s) => s.code === "nachtdienst_overlap")).toBeUndefined();
  });

  it("avonddienst 20:00–22:30: wél nacht-schending", () => {
    const r = berekenAtwSchendingen({ ...base, tijdStart: "20:00", tijdEind: "22:30" });
    expect(r.find((s) => s.code === "nachtdienst_overlap")).toBeDefined();
  });

  it("dienst 22:00–07:00 over middernacht: wél nacht-schending", () => {
    const r = berekenAtwSchendingen({ ...base, tijdStart: "22:00", tijdEind: "07:00" });
    expect(r.find((s) => s.code === "nachtdienst_overlap")).toBeDefined();
  });

  it("middernacht-overschrijdende dienst 23:00–05:00: wél nacht-schending", () => {
    const r = berekenAtwSchendingen({ ...base, tijdStart: "23:00", tijdEind: "05:00" });
    expect(r.find((s) => s.code === "nachtdienst_overlap")).toBeDefined();
  });

  it("vroege ochtend 06:00–14:00: wél nacht-schending (start < 07:00)", () => {
    const r = berekenAtwSchendingen({ ...base, tijdStart: "06:00", tijdEind: "14:00" });
    expect(r.find((s) => s.code === "nachtdienst_overlap")).toBeDefined();
  });

  it("geen tijdstip aanwezig: geen nacht-schending", () => {
    const r = berekenAtwSchendingen({ ...base });
    expect(r.find((s) => s.code.startsWith("nachtdienst"))).toBeUndefined();
  });

  it("nacht-schending omschrijving vermeldt 22:00 en 07:00", () => {
    const r = berekenAtwSchendingen({ ...base, tijdStart: "23:00", tijdEind: "06:00" });
    const schending = r.find((s) => s.code === "nachtdienst_overlap");
    expect(schending!.omschrijving).toContain("22:00");
    expect(schending!.omschrijving).toContain("07:00");
  });
});

// ── itemAantalDagen / overlapDagen / enumDagen ───────────────────────────────

describe("itemAantalDagen", () => {
  it("één dag: start == eind", () => {
    expect(itemAantalDagen("2026-01-05", "2026-01-05")).toBe(1);
  });

  it("drie aaneengesloten dagen", () => {
    expect(itemAantalDagen("2026-01-05", "2026-01-07")).toBe(3);
  });

  it("eind vóór start valt terug op 1", () => {
    expect(itemAantalDagen("2026-01-07", "2026-01-05")).toBe(1);
  });
});

describe("overlapDagen", () => {
  it("volledig binnenin: alle dagen overlappen", () => {
    expect(overlapDagen("2026-01-05", "2026-01-07", "2026-01-04", "2026-01-08")).toBe(3);
  });

  it("partieel links: alleen overlappende dagen", () => {
    expect(overlapDagen("2026-01-01", "2026-01-05", "2026-01-03", "2026-01-10")).toBe(3);
  });

  it("geen overlap: retourneert 0", () => {
    expect(overlapDagen("2026-01-01", "2026-01-03", "2026-01-05", "2026-01-07")).toBe(0);
  });

  it("aangrenzende ranges (eind == start): 1 dag overlap", () => {
    expect(overlapDagen("2026-01-01", "2026-01-05", "2026-01-05", "2026-01-10")).toBe(1);
  });
});

describe("enumWeken", () => {
  it("enkel-weeks bereik: één maandag", () => {
    // Woensdag 2026-08-12 zit in week ma 2026-08-10 – zo 2026-08-16
    expect(enumWeken("2026-08-12", "2026-08-14")).toEqual(["2026-08-10"]);
  });

  it("precies twee weken (ma t/m zo volgende week)", () => {
    // ma 10 aug t/m zo 23 aug = twee weken
    const result = enumWeken("2026-08-10", "2026-08-23");
    expect(result).toEqual(["2026-08-10", "2026-08-17"]);
  });

  it("item loopt van vrijdag week 1 naar dinsdag week 2 (twee weken geraakt)", () => {
    const result = enumWeken("2026-08-14", "2026-08-18");
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("2026-08-10"); // ma week 1
    expect(result[1]).toBe("2026-08-17"); // ma week 2
  });

  it("vier opeenvolgende weken bij 4-weeks item (ma t/m zo wk4)", () => {
    // Ma 3 aug → zo 30 aug: Mondays = 3/10/17/24 aug → 4 weken
    const result = enumWeken("2026-08-03", "2026-08-30");
    expect(result).toHaveLength(4);
    expect(result[0]).toBe("2026-08-03");
    expect(result[3]).toBe("2026-08-24");
  });
});

describe("enumDagen", () => {
  it("één datum: array met één element", () => {
    expect(enumDagen("2026-08-11", "2026-08-11")).toEqual(["2026-08-11"]);
  });

  it("drie opeenvolgende datums", () => {
    expect(enumDagen("2026-08-11", "2026-08-13")).toEqual([
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
    ]);
  });

  it("maandgrens-overgang", () => {
    const result = enumDagen("2026-01-30", "2026-02-02");
    expect(result).toEqual(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
  });
});

// ── Multi-dag dagmaximum — hoe de route per-datum uitrekent ─────────────────
//
// `uren` is een DAGRATE: hoe lang de medewerker die dag werkt.
// Bijdrage aan een periode = uren × aantal_overlapdagen (geen deling door
// de totale itemduur). Dit is hoe de plannings-UI items optelt en hoe
// berekenPlanningBijdrageMinderjarig in de route werkt.
//
// Let op: de geboortedatum-filter zit in berekenPlanningBijdrageMinderjarig.
// In de route-simulaties hieronder gebruiken we overlapDagen direct (geen
// leeftijdsfilter) omdat we de andere regels apart testen.

describe("dag-bijdrage per-dag semantiek (simulatie route-logica)", () => {
  /** Bijdrage van item op een specifieke dag: uren als dag ∈ item, anders 0. */
  const dagBijdrage = (
    item: { datumStart: string; datumEind: string; uren: number },
    datum: string,
  ): number => {
    const dk = overlapDagen(item.datumStart, item.datumEind, datum, datum);
    return dk === 0 ? 0 : item.uren;
  };

  /** Bijdrage van item aan een periode [van, tot]: uren × overlapdagen. */
  const periodeBijdrage = (
    item: { datumStart: string; datumEind: string; uren: number },
    van: string,
    tot: string,
  ): number => {
    const dk = overlapDagen(item.datumStart, item.datumEind, van, tot);
    return item.uren * dk;
  };

  it("enkel-daags item draagt alleen bij op zijn eigen datum", () => {
    const item = { datumStart: "2026-08-11", datumEind: "2026-08-11", uren: 8 };
    expect(dagBijdrage(item, "2026-08-11")).toBe(8);
    expect(dagBijdrage(item, "2026-08-12")).toBe(0);
  });

  it("driedaags item met 10 u/dag draagt 10 u bij op elke gedekte dag", () => {
    // uren = dagrate 10: elke dag levert 10 uur op (3×10 = 30 uur totaal)
    const item = { datumStart: "2026-08-11", datumEind: "2026-08-13", uren: 10 };
    expect(dagBijdrage(item, "2026-08-11")).toBe(10);
    expect(dagBijdrage(item, "2026-08-12")).toBe(10);
    expect(dagBijdrage(item, "2026-08-13")).toBe(10);
    expect(dagBijdrage(item, "2026-08-14")).toBe(0);
  });

  it("geannuleerd item draagt 0 u bij (route filtert ze eruit)", () => {
    // In alleItems zitten alleen niet-geannuleerde items.
    const gefilterd: Array<{ datumStart: string; datumEind: string; uren: number }> = [];
    const totaal = gefilterd.reduce((s, i) => s + dagBijdrage(i, "2026-08-11"), 0);
    expect(totaal).toBe(0);
  });

  it("later gedekte dag van multi-dag item veroorzaakt dagmaximum bij extra belasting", () => {
    // Item A: 3 dagen (ma t/m wo), 10 u/dag.
    // Item B (bestaand, alleen wo): 5 u.
    // → wo-totaal = 10 + 5 = 15 u > 9 u → schending verwacht.
    const itemA = { datumStart: "2026-08-10", datumEind: "2026-08-12", uren: 10 };
    const itemB = { datumStart: "2026-08-12", datumEind: "2026-08-12", uren: 5 };
    const alleItems = [itemA, itemB];

    const woDag = "2026-08-12";
    const woDagTotaal = alleItems.reduce((s, i) => s + dagBijdrage(i, woDag), 0);
    expect(woDagTotaal).toBe(15);
    expect(woDagTotaal).toBeGreaterThan(9); // dagmaximum overschreden
  });

  it("dagmaximum op startdatum: 10 u/dag overschrijdt dagmax van 9 u", () => {
    const itemA = { datumStart: "2026-08-10", datumEind: "2026-08-12", uren: 10 };
    const maTotaal = dagBijdrage(itemA, "2026-08-10");
    expect(maTotaal).toBe(10);
    expect(maTotaal).toBeGreaterThan(9);
  });

  it("multi-week regressie: week-2-schending bij twee wekitems + bestaand item", () => {
    // Twee enkeldaagse items (één per week) + bestaand item in week 2.
    // Week 1: 1 dag × 40 u = 40 u; week 2: 1 dag × 40 u + 1 dag × 6 u = 46 u > 45 u.
    const wk1Item      = { datumStart: "2026-08-10", datumEind: "2026-08-10", uren: 40 };
    const wk2Item      = { datumStart: "2026-08-17", datumEind: "2026-08-17", uren: 40 };
    const bestaandItem = { datumStart: "2026-08-18", datumEind: "2026-08-18", uren: 6  };
    const alleItems    = [wk1Item, wk2Item, bestaandItem];

    const weken = enumWeken("2026-08-10", "2026-08-17");
    expect(weken).toHaveLength(2);

    const { van: wk2Van, tot: wk2Tot } = isoWeekGrenzen(weken[1]!);
    const weekTotaalWk2 = alleItems.reduce((s, i) => s + periodeBijdrage(i, wk2Van, wk2Tot), 0);
    expect(weekTotaalWk2).toBe(46); // 40 (wk2Item) + 6 (bestaand)
    expect(weekTotaalWk2).toBeGreaterThan(45); // → schending
  });

  it("4-weken regressie: schending door extra item in de 4e week", () => {
    // 4 enkeldaagse items (één per week), elk 40 u. Extra item in week 4 met 15 u.
    // 4-weken-totaal: 4×40 + 15 = 175 > 160.
    const wk1 = { datumStart: "2026-08-03", datumEind: "2026-08-03", uren: 40 };
    const wk2 = { datumStart: "2026-08-10", datumEind: "2026-08-10", uren: 40 };
    const wk3 = { datumStart: "2026-08-17", datumEind: "2026-08-17", uren: 40 };
    const wk4 = { datumStart: "2026-08-24", datumEind: "2026-08-24", uren: 40 };
    const extra = { datumStart: "2026-08-25", datumEind: "2026-08-25", uren: 15 };
    const alleItems = [wk1, wk2, wk3, wk4, extra];

    const weken = enumWeken("2026-08-03", "2026-08-24");
    expect(weken).toHaveLength(4);

    const { van: v4Van, tot: v4Tot } = vierWekenGrenzen(weken[3]!);
    const v4Totaal = alleItems.reduce((s, i) => s + periodeBijdrage(i, v4Van, v4Tot), 0);
    expect(v4Totaal).toBe(175); // 40×4 + 15
    expect(v4Totaal).toBeGreaterThan(160); // → schending
  });

  it("maandagPlusWeken: geeft de maandag n weken later", () => {
    expect(maandagPlusWeken("2026-08-10", 1)).toBe("2026-08-17");
    expect(maandagPlusWeken("2026-08-10", 3)).toBe("2026-08-31");
    expect(maandagPlusWeken("2026-08-31", 1)).toBe("2026-09-07");
  });

  it("W+3 4-weken-venster regressie: enkeldaags item triggert schending in venster drie weken later", () => {
    // Item: één dag in week W (ma 2026-08-10), 40 u/dag.
    // Bestaand schema: week W+1 (1 dag 40u), W+2 (1 dag 40u), W+3 (1 dag 45u).
    // 4-weken-venster [W, W+1, W+2, W+3]: 40+40+40+45 = 165 > 160.
    // Zonder fix: route evalueert alleen venster eindigend op W → 40 u → geen schending.
    // Met fix (extraWekenV4 = [W+1, W+2, W+3]): venster W+3 geëvalueerd → schending.
    const nieuwItem = { datumStart: "2026-08-10", datumEind: "2026-08-10", uren: 40 };
    const wPlusEen  = { datumStart: "2026-08-17", datumEind: "2026-08-17", uren: 40 };
    const wPlusTwee = { datumStart: "2026-08-24", datumEind: "2026-08-24", uren: 40 };
    const wPlusDrie = { datumStart: "2026-08-31", datumEind: "2026-08-31", uren: 45 };
    const alleItems = [nieuwItem, wPlusEen, wPlusTwee, wPlusDrie];

    const lastMaandag = "2026-08-10";
    const extraWeken = [1, 2, 3].map(n => maandagPlusWeken(lastMaandag, n));

    // Venster eindigend op W+3 (ma 2026-08-31)
    const { van: v4VanW3, tot: v4TotW3 } = vierWekenGrenzen(extraWeken[2]!);
    const v4TotaalW3 = alleItems.reduce((s, i) => s + periodeBijdrage(i, v4VanW3, v4TotW3), 0);
    expect(v4TotaalW3).toBeGreaterThan(160); // 40+40+40+45 = 165 → schending
    expect(v4TotaalW3).toBe(165);

    // Venster eindigend op W (ma 2026-08-10) — enige wat de oud-code controleerde
    const { van: v4VanW, tot: v4TotW } = vierWekenGrenzen(lastMaandag);
    const v4TotaalW = alleItems.reduce((s, i) => s + periodeBijdrage(i, v4VanW, v4TotW), 0);
    expect(v4TotaalW).toBe(40); // alleen nieuwItem → 40 u → ten onrechte geen schending
    expect(v4TotaalW).toBeLessThanOrEqual(160);
  });

  it("query-grens regressie: item op latere gedekte dag telt mee wanneer queryTot correct is", () => {
    // Scenario: item op dag 29 (bestaand) valt buiten v4Tot (dag 27),
    // maar binnen queryTot (dag 29). Met juiste query zit het wél in alleItems.
    const nieuwItem    = { datumStart: "2026-09-29", datumEind: "2026-09-29", uren: 10 };
    const bestaandItem = { datumStart: "2026-09-29", datumEind: "2026-09-29", uren: 5  };

    const alleItemsMet = [nieuwItem, bestaandItem];
    const dag29totaalMet = alleItemsMet.reduce((s, i) => s + dagBijdrage(i, "2026-09-29"), 0);
    expect(dag29totaalMet).toBe(15); // 10 + 5 → schending
    expect(dag29totaalMet).toBeGreaterThan(9);

    // Zonder fix ontbreekt bestaandItem in alleItems.
    const dag29totaalZonder = [nieuwItem].reduce((s, i) => s + dagBijdrage(i, "2026-09-29"), 0);
    expect(dag29totaalZonder).toBe(10); // alleen nieuwItem → geen schending gerapporteerd
  });
});

// ── Geannuleerde items — simulatie route-logica ──────────────────────────────
// De route slaat de ATW-evaluatie volledig over als row.status === "geannuleerd".
// Dit simuleert die beslissing op het niveau van pure helper-functies.

describe("geannuleerde items: geen ATW-schending verwacht", () => {
  /**
   * Simuleert de route-logica: retourneert undefined (geen melding) als
   * het item geannuleerd is, anders het ATW-resultaat.
   */
  const evalueer = (
    status: string,
    tijdStart: string,
    tijdEind: string,
  ): ReturnType<typeof berekenAtwSchendingen> | undefined => {
    if (status === "geannuleerd") return undefined; // sla evaluatie over
    return berekenAtwSchendingen({
      leeftijd: 17,
      dagTotaalUren: 0,
      weekTotaalUren: 40,
      vierWekenUren: 160,
      tijdStart,
      tijdEind,
    });
  };

  it("actief item met nachturen 23:00–05:00 geeft nacht-schending", () => {
    const result = evalueer("concept", "23:00", "05:00");
    expect(result).toBeDefined();
    expect(result!.find((s) => s.code === "nachtdienst_overlap")).toBeDefined();
  });

  it("geannuleerd item met nachturen 23:00–05:00 geeft géén schending", () => {
    const result = evalueer("geannuleerd", "23:00", "05:00");
    expect(result).toBeUndefined();
  });

  it("geannuleerd item met avonduren 22:30–06:30 geeft géén schending", () => {
    const result = evalueer("geannuleerd", "22:30", "06:30");
    expect(result).toBeUndefined();
  });

  it("actief item dat later wordt geannuleerd: evaluatie op geannuleerde status geeft undefined", () => {
    // Simuleer PATCH naar geannuleerd: na de update is row.status === "geannuleerd".
    const naPatch = "geannuleerd";
    expect(evalueer(naPatch, "23:00", "05:00")).toBeUndefined();
  });

  it("geannuleerde items tellen niet mee in dagbijdrage (route filtert ze eruit)", () => {
    // In alleItems zitten alleen niet-geannuleerde items (ne-filter in DB-query).
    // Simuleer: een geannuleerd item staat NIET in alleItems → dagbijdrage = 0.
    const alleItems: Array<{ datumStart: string; datumEind: string; uren: number }> = [];
    // Uren = dagrate; lege lijst → som = 0.
    const dagTotaal = alleItems.reduce((s, i) => {
      const dk = overlapDagen(i.datumStart, i.datumEind, "2026-08-12", "2026-08-12");
      return dk === 0 ? s : s + i.uren;
    }, 0);
    expect(dagTotaal).toBe(0);
  });
});

// ── isoWeekGrenzen / vierWekenGrenzen ────────────────────────────────────────

describe("isoWeekGrenzen", () => {
  it("maandag is de eerste dag van de ISO-week", () => {
    const { van } = isoWeekGrenzen("2026-08-10"); // maandag
    expect(van).toBe("2026-08-10");
  });

  it("zondag zit in dezelfde week als de voorafgaande maandag", () => {
    const { van, tot } = isoWeekGrenzen("2026-08-16"); // zondag
    expect(van).toBe("2026-08-10");
    expect(tot).toBe("2026-08-16");
  });

  it("woensdag geeft correcte weekgrenzen", () => {
    const { van, tot } = isoWeekGrenzen("2026-08-12");
    expect(van).toBe("2026-08-10");
    expect(tot).toBe("2026-08-16");
  });
});

describe("vierWekenGrenzen", () => {
  it("periode eindigt op zondag van de gevraagde week", () => {
    const { tot } = vierWekenGrenzen("2026-08-12");
    const { tot: weekTot } = isoWeekGrenzen("2026-08-12");
    expect(tot).toBe(weekTot);
  });

  it("periode beslaat precies 28 dagen (27 dagen verschil incl. grenzen)", () => {
    const { van, tot } = vierWekenGrenzen("2026-08-12");
    const diff = (new Date(tot).getTime() - new Date(van).getTime()) / 86_400_000;
    expect(diff).toBe(27);
  });
});

// ── berekenPlanningBijdrageMinderjarig — verjaardagsgrens ────────────────────
//
// De helper staat in jongeWerknemerRegel.ts zodat hij hier direct getest
// wordt (niet via simulatie). Semantiek: uren = DAGRATE.
// Bijdrage = uren × aantal_minderjarige_overlapdagen (geen deling).
//
// Scenario: medewerker wordt donderdag 2026-08-13 exact 18 jaar.
// Item ma–zo (7 dagen), 8 u/dag dagrate.
// Minderjarige dagen: ma 10, di 11, wo 12 → 3 dagen.
// Volwassen dagen:    do 13, vr 14, za 15, zo 16 → 4 dagen.

describe("berekenPlanningBijdrageMinderjarig — verjaardagsgrens", () => {
  const geboortedatum = "2008-08-13"; // wordt do 2026-08-13 exact 18 jaar
  const item = { datumStart: "2026-08-10", datumEind: "2026-08-16", uren: 8 }; // 8 u/dag

  it("telt alleen minderjarige dagen mee voor een periode die de verjaardag kruist", () => {
    const bijdrage = berekenPlanningBijdrageMinderjarig(item, "2026-08-10", "2026-08-16", geboortedatum);
    // 3 minderjarige dagen × 8 u/dag = 24 u
    expect(bijdrage).toBe(24);
  });

  it("geeft 0 voor een periode volledig ná de verjaardag", () => {
    const bijdrage = berekenPlanningBijdrageMinderjarig(item, "2026-08-13", "2026-08-16", geboortedatum);
    // do t/m zo: medewerker is 18 → 0 u
    expect(bijdrage).toBe(0);
  });

  it("geeft de volle dagrate voor een enkeldaags item vóór de verjaardag", () => {
    const enkeldaags = { datumStart: "2026-08-12", datumEind: "2026-08-12", uren: 9 };
    const bijdrage = berekenPlanningBijdrageMinderjarig(enkeldaags, "2026-08-12", "2026-08-12", geboortedatum);
    // wo 12 aug: nog 17 → volledige 9 u dagrate mee
    expect(bijdrage).toBe(9);
  });

  it("week-totaal voor de verjaardagsweek bevat alleen minderjarige uren", () => {
    // Verjaardagsweek 2026-08-10 t/m 2026-08-16: 3 minderjarige dagen × 8 u = 24 u.
    // 24 u < 45 u weekmax → geen valse ATW-schending.
    const { van: wVan, tot: wTot } = isoWeekGrenzen("2026-08-10");
    const weekTotaal = berekenPlanningBijdrageMinderjarig(item, wVan, wTot, geboortedatum);
    expect(weekTotaal).toBe(24);
    expect(weekTotaal).toBeLessThanOrEqual(45); // geen valse weekschending
  });

  it("week-totaal volledig ná verjaardag is nul (geen valse ATW-schending)", () => {
    // Vervolg-item in de week ná verjaardag: medewerker is nu 18 → 0 bijdrage.
    const vervolg = { datumStart: "2026-08-17", datumEind: "2026-08-23", uren: 8 };
    const { van: wVan, tot: wTot } = isoWeekGrenzen("2026-08-17");
    const weekTotaal = berekenPlanningBijdrageMinderjarig(vervolg, wVan, wTot, geboortedatum);
    expect(weekTotaal).toBe(0);
  });

  it("4-weken bijdrage is alleen de minderjarige uren (3 van 28 dagen)", () => {
    // 4-weken venster: ma 2026-07-20 t/m zo 2026-08-16.
    // Item: 2026-08-10 t/m 2026-08-16 (7 dagen); minderjarig: ma/di/wo = 3 dagen.
    // Bijdrage = 3 × 8 = 24 u.
    const { van: v4Van, tot: v4Tot } = vierWekenGrenzen("2026-08-10");
    const v4Bijdrage = berekenPlanningBijdrageMinderjarig(item, v4Van, v4Tot, geboortedatum);
    expect(v4Bijdrage).toBe(24); // alleen de 3 minderjarige dagen
    expect(v4Bijdrage).toBeLessThanOrEqual(160); // geen valse 4-weken-schending
  });

  it("geeft 0 voor null geboortedatum", () => {
    const bijdrage = berekenPlanningBijdrageMinderjarig(item, "2026-08-10", "2026-08-16", null);
    expect(bijdrage).toBe(0);
  });
});

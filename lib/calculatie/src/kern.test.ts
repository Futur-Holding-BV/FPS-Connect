/**
 * CALC_KERN_01 §3 — natellingen op de rekenkern.
 *
 * Vijf toetsen op echte calculatiegegevens (Cityflat / De Grundel) plus de
 * regelsoorten-toets. De twee volledige eindbedrag-natellingen staan klaar als
 * skip met de verwachte bedragen; ze worden gevuld zodra de volledige regels
 * van die calculaties zijn aangeleverd.
 */
import { describe, it, expect } from "vitest";
import { berekenRegelBedragen, berekenTotalen, somRegelBedragen, rond2, type KernRegel } from "./index";

const GEEN_OPSLAGEN = {
  opslag_materiaal: 0, opslag_arbeid: 0, opslag_ak: 0, opslag_abk: 0,
  opslag_risico: 0, opslag_winst: 0, korting: 0,
};

// Cityflat: zelfde verkooptarief over alle arbeidsregels.
const CITYFLAT_UURTARIEF = 60.91;

// Cityflat-normtijden (uren per eenheid) met representatieve hoeveelheden
// (65 bergingsdeuren; de overige hoeveelheden toetsen de vermenigvuldiging).
const CITYFLAT_NORMTIJDEN: Array<{ omschrijving: string; normtijd: number; hoeveelheid: number }> = [
  { omschrijving: "Afspraken maken met bewoners", normtijd: 0.3,  hoeveelheid: 65 },
  { omschrijving: "Bergingsdeur schilderen",      normtijd: 1.2,  hoeveelheid: 65 },
  { omschrijving: "Bovenlicht kitten",            normtijd: 0.35, hoeveelheid: 65 },
  { omschrijving: "Kozijnstijl bijwerken",        normtijd: 0.25, hoeveelheid: 65 },
  { omschrijving: "Heel kozijn schilderen",       normtijd: 0.75, hoeveelheid: 65 },
  { omschrijving: "Afnemen kozijn",               normtijd: 0.1,  hoeveelheid: 65 },
];

describe("CALC_KERN_01 — uurtarief (Cityflat)", () => {
  it("arbeidsloon / manuren geeft over elke regel exact € 60,91", () => {
    for (const n of CITYFLAT_NORMTIJDEN) {
      const r: KernRegel = {
        hoeveelheid: n.hoeveelheid,
        mu_per_eenheid: n.normtijd,
        arbeids_tarief: CITYFLAT_UURTARIEF,
      };
      const b = berekenRegelBedragen(r);
      expect(b.mu_totaal).toBeGreaterThan(0);
      // Arbeidsloon = manuren × tarief, op de cent; terugdelen geeft het tarief.
      expect(rond2(b.arbeidsloon / b.mu_totaal)).toBe(CITYFLAT_UURTARIEF);
      expect(b.arbeidsloon).toBe(rond2(b.mu_totaal * CITYFLAT_UURTARIEF));
    }
  });
});

describe("CALC_KERN_01 — normtijden (Cityflat)", () => {
  it("manuren per regel is hoeveelheid × normtijd", () => {
    const verwacht: Record<string, number> = {
      "Afspraken maken met bewoners": 19.5,   // 65 × 0,3
      "Bergingsdeur schilderen":      78,     // 65 × 1,2
      "Bovenlicht kitten":            22.75,  // 65 × 0,35
      "Kozijnstijl bijwerken":        16.25,  // 65 × 0,25
      "Heel kozijn schilderen":       48.75,  // 65 × 0,75
      "Afnemen kozijn":               6.5,    // 65 × 0,1
    };
    for (const n of CITYFLAT_NORMTIJDEN) {
      const b = berekenRegelBedragen({ hoeveelheid: n.hoeveelheid, mu_per_eenheid: n.normtijd });
      expect(b.mu_totaal).toBe(verwacht[n.omschrijving]);
    }
  });
});

describe("CALC_KERN_01 — regelsoorten", () => {
  it("tekst, kop en stelpost dragen nul bij; materiaalregels tellen mee", () => {
    const arbeidsregel: KernRegel = { soort: "regel", hoeveelheid: 10, mu_per_eenheid: 1, arbeids_tarief: 50 };
    const materiaalkind: KernRegel = { soort: "materiaal", hoeveelheid: 10, tarief: 12.5 };
    const tekst: KernRegel = { soort: "tekst" };
    const kop: KernRegel = { soort: "kop" };
    const stelpost: KernRegel = { soort: "stelpost", tarief: 2500 };

    // Stelpost toont wél een bedrag…
    expect(berekenRegelBedragen(stelpost).totaal).toBe(2500);
    // …maar telt (net als tekst/kop) op nul bij in het totaal.
    const t = berekenTotalen([arbeidsregel, materiaalkind, tekst, kop, stelpost], GEEN_OPSLAGEN);
    expect(t.totaal_na_opslagen).toBe(500 + 125); // arbeid 10×1×50 + materiaal 10×12,50
    expect(t.materiaal_subtotaal).toBe(125);
    expect(t.arbeid_subtotaal).toBe(500);

    const somZonderMateriaal = berekenTotalen([arbeidsregel, tekst, kop, stelpost], GEEN_OPSLAGEN);
    expect(somZonderMateriaal.totaal_na_opslagen).toBe(500);
  });
});

describe("CALC_KERN_01 — negatieve regel (De Grundel)", () => {
  it("de kortingsregel −€ 6.361,74 verlaagt het totaal en telt niet dubbel", () => {
    const werk: KernRegel = { soort: "regel", hoeveelheid: 1, onderaanneming_bedrag: 100000 };
    const kortingRegel: KernRegel = {
      soort: "regel", hoeveelheid: 1, tarief: -6361.74,
    };
    const zonder = berekenTotalen([werk], GEEN_OPSLAGEN);
    const met = berekenTotalen([werk, kortingRegel], GEEN_OPSLAGEN);
    expect(zonder.totaal_na_opslagen).toBe(100000);
    expect(met.totaal_na_opslagen).toBe(rond2(100000 - 6361.74));
    // Geen aparte korting: het kortingveld blijft 0.
    expect(met.korting_bedrag).toBe(0);
  });
});

describe("CALC_KERN_01 — negatieve halve-cent-afronding", () => {
  it("percentages ronden bij negatieve bedragen symmetrisch af (weg van nul)", () => {
    // −0,01 × 50% = −0,005 → −0,01 (niet 0, zoals Math.round(−0,5) zou geven)
    const t = berekenTotalen(
      [{ soort: "regel", hoeveelheid: 1, tarief: -0.01 }],
      { ...GEEN_OPSLAGEN, opslag_materiaal: 50 },
    );
    expect(t.materiaal_opslag_bedrag).toBe(-0.01);
    const pos = berekenTotalen(
      [{ soort: "regel", hoeveelheid: 1, tarief: 0.01 }],
      { ...GEEN_OPSLAGEN, opslag_materiaal: 50 },
    );
    expect(pos.materiaal_opslag_bedrag).toBe(0.01);
    expect(t.materiaal_opslag_bedrag).toBe(-pos.materiaal_opslag_bedrag);
  });
});

describe("CALC_KERN_01 — centen-precisie", () => {
  it("honderden regels van € 0,01 en € 1,10 sommeren zonder float-drift", () => {
    const regels: KernRegel[] = Array.from({ length: 300 }, () => ({ hoeveelheid: 1, tarief: 1.1 }));
    const t = berekenTotalen(regels, GEEN_OPSLAGEN);
    expect(t.totaal_na_opslagen).toBe(330); // 300 × 1,10 exact
    const som = somRegelBedragen(regels);
    expect(som.materiaal_totaal).toBe(330);
  });
});

// ── Volledige natellingen — regels worden apart aangeleverd (CALC_KERN_01 §3) ──

describe.skip("CALC_KERN_01 — Cityflat volledige natelling (wacht op aangeleverde regels)", () => {
  it("totaal € 16.330,60 = aangeboden € 12.180,71 + optioneel € 4.149,89", () => {
    const regels: KernRegel[] = []; // TODO: volledige Cityflat-regels invullen
    const t = berekenTotalen(regels, GEEN_OPSLAGEN /* TODO: echte opslagen */);
    expect(t.totaal_na_opslagen).toBe(12180.71);
    expect(t.optioneel_totaal).toBe(4149.89);
    expect(rond2(t.totaal_na_opslagen + t.optioneel_totaal)).toBe(16330.6);
  });
});

describe.skip("CALC_KERN_01 — De Grundel volledige natelling (wacht op aangeleverde regels)", () => {
  it("eindtotaal € 294.452,65 inclusief de negatieve regel −€ 6.361,74", () => {
    const regels: KernRegel[] = []; // TODO: volledige De Grundel-regels invullen
    const t = berekenTotalen(regels, GEEN_OPSLAGEN /* TODO: echte opslagen */);
    expect(t.totaal_na_opslagen).toBe(294452.65);
  });
});

import { describe, it, expect } from "vitest";
import {
  genereerDeterministischeBody,
  eersteOngeldigeElement,
  dedupliceerId,
  type WerkgeverBodyInfo,
  type MutatieBodyItem,
} from "../lib/scabMailHelpers";

// ── SCAB-mail — unit tests van de validatie- en body-helpers (#984) ────────────
//
// Bewijst dat de fail-closed validatielogica en de deterministische
// body-generator correct werken.  Twee gelaagde suites:
//   A. eersteOngeldigeElement  — type-validatie (fail-closed)
//   B. dedupliceerId           — deduplicatie met behoud van volgorde
//   C. genereerDeterministischeBody — body-inhoud per scenario

// ── Vaste testdata ─────────────────────────────────────────────────────────────

const WG: WerkgeverBodyInfo = {
  naam: "FPS Bouw & Renovatie",
  internContactNaam: "Jan de Vries",
  internContactEmail: "jan@fps.nl",
};

const MUTATIES: MutatieBodyItem[] = [
  { medewerkerNaam: "Piet Klaassen", medewerkerId: 1, type: "loonsverhoging", omschrijving: "CAO",  ingangsdatum: "2026-07-01" },
  { medewerkerNaam: "Koos Jansen",   medewerkerId: 2, type: "functiewijziging", omschrijving: null, ingangsdatum: null },
];

// ── A. eersteOngeldigeElement ──────────────────────────────────────────────────

describe("eersteOngeldigeElement — fail-closed type-validatie", () => {
  it("geeft undefined terug voor een lege array", () => {
    expect(eersteOngeldigeElement([])).toBeUndefined();
  });

  it("geeft undefined terug voor een array van gehele getallen", () => {
    expect(eersteOngeldigeElement([1, 2, 99])).toBeUndefined();
  });

  it("detecteert een string-element", () => {
    const gevonden = eersteOngeldigeElement([1, "twee", 3]);
    expect(gevonden).toBe("twee");
  });

  it("detecteert een float", () => {
    const gevonden = eersteOngeldigeElement([1, 1.5]);
    expect(gevonden).toBe(1.5);
  });

  it("detecteert null", () => {
    const gevonden = eersteOngeldigeElement([1, null, 3]);
    expect(gevonden).toBeNull();
  });

  it("detecteert NaN (typeof NaN === 'number' maar !isFinite)", () => {
    const gevonden = eersteOngeldigeElement([1, NaN, 3]);
    expect(Number.isNaN(gevonden)).toBe(true);
  });

  it("detecteert Infinity", () => {
    const gevonden = eersteOngeldigeElement([1, Infinity]);
    expect(gevonden).toBe(Infinity);
  });

  it("detecteert een boolean (typeof false !== 'number')", () => {
    const gevonden = eersteOngeldigeElement([1, false]);
    expect(gevonden).toBe(false);
  });

  it("retourneert het EERSTE foute element (stopt niet bij het eerste)", () => {
    // Array [1, 'x', 2, 'y'] → 'x' (niet 'y')
    expect(eersteOngeldigeElement([1, "x", 2, "y"])).toBe("x");
  });
});

// ── B. dedupliceerId ────────────────────────────────────────────────────────────

describe("dedupliceerId — deduplicatie met volgordebehoud", () => {
  it("lege array → lege array", () => {
    expect(dedupliceerId([])).toEqual([]);
  });

  it("geen duplicaten → ongewijzigd", () => {
    expect(dedupliceerId([3, 1, 4, 1, 5])).toEqual([3, 1, 4, 5]);
  });

  it("verwijdert meervoudige duplicaten", () => {
    expect(dedupliceerId([1, 2, 1, 2, 1])).toEqual([1, 2]);
  });

  it("behoudt de volgorde van het eerste voorkomen", () => {
    // 2 staat vóór 1, dus [2, 1] is het verwachte resultaat
    expect(dedupliceerId([2, 1, 2])).toEqual([2, 1]);
  });
});

// ── C. genereerDeterministischeBody ────────────────────────────────────────────

describe("genereerDeterministischeBody — body-inhoud", () => {
  it("bevat aanhef, mutatielijst en ondertekening bij gevulde selectie", () => {
    const body = genereerDeterministischeBody("FPS BV", 2026, 6, MUTATIES, WG);

    expect(body).toContain("Geachte heer/mevrouw");
    expect(body).toContain("FPS BV");
    expect(body).toContain("juni 2026");
    expect(body).toContain("Piet Klaassen");
    expect(body).toContain("loonsverhoging");
    expect(body).toContain("CAO");                  // omschrijving
    expect(body).toContain("2026-07-01");            // ingangsdatum
    expect(body).toContain("Koos Jansen");
    expect(body).toContain("functiewijziging");
    expect(body).toContain("Met vriendelijke groet");
    expect(body).toContain("Jan de Vries");          // internContactNaam
    expect(body).toContain("jan@fps.nl");            // internContactEmail
  });

  it("lege mutatielijst → meldt expliciet dat er geen mutaties zijn", () => {
    const body = genereerDeterministischeBody("FPS BV", 2026, 6, [], WG);

    expect(body).toContain("geen mutaties");
    expect(body).not.toContain("Piet Klaassen");
    expect(body).toContain("Met vriendelijke groet");
  });

  it("werkgeverInfo = null → werkmaatschappij als afzender", () => {
    const body = genereerDeterministischeBody("Eigen BV", 2026, 6, MUTATIES, null);

    expect(body).toContain("Eigen BV");
    expect(body).not.toContain("Jan de Vries");
    expect(body).not.toContain("jan@fps.nl");
    expect(body).toContain("Met vriendelijke groet");
  });

  it("werkgeverInfo zonder internContactNaam → geen lege naamregel", () => {
    const wgZonderNaam: WerkgeverBodyInfo = {
      naam: "FPS BV",
      internContactNaam: null,
      internContactEmail: null,
    };
    const body = genereerDeterministischeBody("FPS BV", 2026, 6, MUTATIES, wgZonderNaam);

    // Mag geen lege regel voor de firmanaam staan (internContactNaam was null)
    expect(body).not.toMatch(/groet,\n\nFPS/); // dubbele newline = lege naamregel
    expect(body).toContain("Met vriendelijke groet");
    expect(body).toContain("FPS BV");
  });

  it("mutatie zonder omschrijving en ingangsdatum → compacte regels", () => {
    const m: MutatieBodyItem[] = [
      { medewerkerNaam: "Henk", medewerkerId: 5, type: "uitdiensttreding", omschrijving: null, ingangsdatum: null },
    ];
    const body = genereerDeterministischeBody("Test BV", 2026, 1, m, null);

    expect(body).toContain("- Henk: uitdiensttreding\n");
    expect(body).not.toContain("(");     // geen omschrijving-haakjes
    expect(body).not.toContain("ingangsdatum");
  });

  it("medewerkerNaam = null → fallback op medewerkerId", () => {
    const m: MutatieBodyItem[] = [
      { medewerkerNaam: null, medewerkerId: 42, type: "salariswijziging", omschrijving: null, ingangsdatum: null },
    ];
    const body = genereerDeterministischeBody("Test BV", 2026, 3, m, null);

    expect(body).toContain("medewerker 42");
  });

  it("periode-label gebruikt de juiste Nederlandse maandnaam", () => {
    const lichaamJan = genereerDeterministischeBody("X", 2025, 1, [], null);
    const lichaamDec = genereerDeterministischeBody("X", 2025, 12, [], null);

    expect(lichaamJan).toContain("januari 2025");
    expect(lichaamDec).toContain("december 2025");
  });
});

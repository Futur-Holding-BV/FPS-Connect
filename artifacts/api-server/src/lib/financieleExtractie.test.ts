import { describe, it, expect } from "vitest";
import { _test } from "./financieleExtractie";

const { parseNederlandsGetal, extraheerKerncijfersHeuristisch, berekenAfgeleideKengetallen } = _test;

// Regressietests voor de financiele extractie-engine (heuristisch pad + afgeleide
// kengetallen; geen AI/DB-netwerkcall nodig). Elk gevonden cijfer moet bronbewijs
// dragen zodat het nooit zonder herkomst definitief kan worden.

describe("parseNederlandsGetal — Nederlands financieel getalformaat", () => {
  it("leest duizendtalscheiding met punt", () => {
    expect(parseNederlandsGetal("1.234.567")).toBe(1234567);
  });

  it("leest decimalen met komma", () => {
    expect(parseNederlandsGetal("1.234,50")).toBe(1234.5);
  });

  it("herkent haakjes als negatief bedrag", () => {
    expect(parseNederlandsGetal("(12.500)")).toBe(-12500);
  });

  it("herkent een leidend minteken als negatief", () => {
    expect(parseNederlandsGetal("-8.000")).toBe(-8000);
  });

  it("negeert euroteken en spaties", () => {
    expect(parseNederlandsGetal("€ 45.000")).toBe(45000);
  });

  it("geeft null bij niet-numerieke tekst", () => {
    expect(parseNederlandsGetal("n.v.t.")).toBeNull();
  });
});

describe("extraheerKerncijfersHeuristisch — kerncijfers met bronbewijs", () => {
  const tekst = [
    "Winst-en-verliesrekening",
    "Netto-omzet                     12.500.000        11.200.000",
    "Bedrijfsresultaat                1.250.000           980.000",
    "Netto-resultaat                    950.000           720.000",
    "Balans",
    "Balanstotaal                     8.400.000         7.900.000",
    "Eigen vermogen                   3.360.000         3.100.000",
    "Vlottende activa                 2.000.000         1.800.000",
    "Kortlopende schulden             1.000.000           950.000",
  ].join("\n");

  it("herkent de netto-omzet met huidige-boekjaar-waarde", () => {
    const cijfers = extraheerKerncijfersHeuristisch(tekst);
    const omzet = cijfers.find((c) => c.sleutel === "netto_omzet");
    expect(omzet).toBeTruthy();
    expect(omzet!.waarde).toBe(12500000);
  });

  it("legt bronbewijs vast bij elk cijfer (methode + bronregel)", () => {
    const cijfers = extraheerKerncijfersHeuristisch(tekst);
    for (const c of cijfers) {
      expect(c.extractieMethode).toBe("heuristiek");
      expect(typeof c.bronTekst).toBe("string");
      expect(c.bronTekst!.length).toBeGreaterThan(0);
      expect(c.confidence).toBeGreaterThan(0);
    }
  });

  it("kent de sectie toe als bron_tabel", () => {
    const cijfers = extraheerKerncijfersHeuristisch(tekst);
    const ev = cijfers.find((c) => c.sleutel === "eigen_vermogen");
    expect(ev!.bronTabel).toBe("Balans");
  });

  it("geeft een lege lijst bij lege tekst", () => {
    expect(extraheerKerncijfersHeuristisch("")).toEqual([]);
  });
});

describe("berekenAfgeleideKengetallen — solvabiliteit/current ratio/werkkapitaal", () => {
  const basis = extraheerKerncijfersHeuristisch(
    [
      "Balanstotaal                     8.400.000",
      "Eigen vermogen                   3.360.000",
      "Vlottende activa                 2.000.000",
      "Kortlopende schulden             1.000.000",
    ].join("\n"),
  );

  it("berekent solvabiliteit als eigen vermogen / balanstotaal", () => {
    const afgeleid = berekenAfgeleideKengetallen(basis);
    const solv = afgeleid.find((c) => c.sleutel === "solvabiliteit");
    expect(solv).toBeTruthy();
    expect(solv!.waarde).toBe(40);
    expect(solv!.isBerekend).toBe(true);
    expect(solv!.extractieMethode).toBe("berekend");
  });

  it("berekent current ratio en werkkapitaal", () => {
    const afgeleid = berekenAfgeleideKengetallen(basis);
    expect(afgeleid.find((c) => c.sleutel === "current_ratio")!.waarde).toBe(2);
    expect(afgeleid.find((c) => c.sleutel === "werkkapitaal")!.waarde).toBe(1000000);
  });

  it("berekent niets zonder de benodigde grondslagen", () => {
    const afgeleid = berekenAfgeleideKengetallen([]);
    expect(afgeleid).toEqual([]);
  });
});

describe("bepaalSchaalfactor — ×€1.000-notatie", () => {
  const { bepaalSchaalfactor } = _test;

  it("herkent 'bedragen in duizenden euro's'", () => {
    expect(bepaalSchaalfactor("Alle bedragen zijn vermeld in duizenden euro's, tenzij anders aangegeven.")).toBe(1000);
  });

  it("herkent '(× € 1.000)'", () => {
    expect(bepaalSchaalfactor("Geconsolideerde balans (× € 1.000)")).toBe(1000);
  });

  it("herkent 'x € 1.000'", () => {
    expect(bepaalSchaalfactor("Winst-en-verliesrekening x € 1.000")).toBe(1000);
  });

  it("herkent EUR '000", () => {
    expect(bepaalSchaalfactor("Amounts in EUR '000")).toBe(1000);
  });

  it("geeft 1 zonder expliciete vermelding", () => {
    expect(bepaalSchaalfactor("Netto-omzet 12.500.000")).toBe(1);
  });
});

describe("extraheerKerncijfersHeuristisch — ×1.000-schaal toegepast op eurobedragen", () => {
  const tekst = [
    "Geconsolideerde jaarrekening 2023",
    "Alle bedragen x € 1.000",
    "Winst-en-verliesrekening",
    "Netto-omzet                     1.766        1.542",
    "Balans",
    "Balanstotaal                    2.400        2.100",
    "Eigen vermogen                    960          850",
    "Gemiddeld aantal werknemers (fte)  12           11",
  ].join("\n");

  it("vermenigvuldigt eurobedragen met 1.000", () => {
    const cijfers = extraheerKerncijfersHeuristisch(tekst);
    expect(cijfers.find((c) => c.sleutel === "netto_omzet")!.waarde).toBe(1766000);
    expect(cijfers.find((c) => c.sleutel === "balanstotaal")!.waarde).toBe(2400000);
  });

  it("schaalt aantallen (FTE) niet mee", () => {
    const cijfers = extraheerKerncijfersHeuristisch(tekst);
    const fte = cijfers.find((c) => c.eenheid === "aantal");
    if (fte) expect(fte.waarde).toBeLessThan(1000);
  });

  it("legt de toegepaste schaal vast in het bronbewijs", () => {
    const cijfers = extraheerKerncijfersHeuristisch(tekst);
    const omzet = cijfers.find((c) => c.sleutel === "netto_omzet");
    expect(omzet!.bronTekst).toContain("×1.000-notatie");
  });
});

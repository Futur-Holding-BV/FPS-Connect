import { describe, expect, it } from "vitest";
import { bouwVerkoopfactuurMailHtml } from "./verkoopfactuurMail";

describe("bouwVerkoopfactuurMailHtml", () => {
  it("gebruikt de FPS-huisstijl en de herberekende definitieve totalen", () => {
    const html = bouwVerkoopfactuurMailHtml({
      factuur: {
        factuurnummer: "2026-F-0042",
        kenmerk: "FPS-42",
        factuurdatum: "2026-08-19",
        vervaldatum: "2026-09-02",
        bedragExclBtw: "1100.00",
        btwBedrag: "231.00",
        bedragInclBtw: "1331.00",
      },
      regels: [
        {
          omschrijving: "Aangepaste regelomschrijving",
          hoeveelheid: "10.000",
          eenheid: "st",
          stukprijs: "45.00",
          bedragExclBtw: "500.00",
        },
        {
          omschrijving: "Brandklep vervangen",
          hoeveelheid: "2.000",
          eenheid: "st",
          stukprijs: "300.00",
          bedragExclBtw: "600.00",
        },
      ],
      naarNaam: "Testklant & Partners",
    });

    expect(html).toContain("background:#F23B0D");
    expect(html).toContain("Aangepaste regelomschrijving");
    expect(html).toContain("€ 1.100,00");
    expect(html).toContain("€ 231,00");
    expect(html).toContain("€ 1.331,00");
    expect(html).toContain("Testklant &amp; Partners");
  });

  it("escaped vrije tekst voordat die in de e-mail komt", () => {
    const html = bouwVerkoopfactuurMailHtml({
      factuur: {
        factuurnummer: "F-1",
        kenmerk: null,
        factuurdatum: null,
        vervaldatum: null,
        bedragExclBtw: "0.00",
        btwBedrag: "0.00",
        bedragInclBtw: "0.00",
      },
      regels: [],
      naarNaam: "<script>alert(1)</script>",
      bericht: "<b>niet als HTML</b>",
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>niet als HTML</b>");
    expect(html).toContain("&lt;b&gt;niet als HTML&lt;/b&gt;");
  });
});
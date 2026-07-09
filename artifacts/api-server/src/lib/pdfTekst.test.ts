import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extraheerPdfTekst } from "./pdfTekst";

// Regressietest: pdf-parse v2 heeft geen default-functie-export meer (alleen de
// PDFParse-class). Alle PDF-tekstextractie loopt via extraheerPdfTekst; deze
// test bewaakt dat een tekst-PDF echt tekst oplevert, zodat een toekomstige
// API-wijziging van pdf-parse niet opnieuw stil faalt in try/catch-blokken.
describe("extraheerPdfTekst (pdf-parse v2)", () => {
  it("extraheert tekst en paginateller uit een tekst-PDF", async () => {
    const buffer = await readFile(path.join(__dirname, "__fixtures__", "test-document.pdf"));
    const resultaat = await extraheerPdfTekst(buffer);
    expect(resultaat.tekst).toBeTruthy();
    expect(resultaat.tekst).toContain("FPS testdocument brandpreventie");
    expect(resultaat.tekst!.length).toBeGreaterThan(0);
    expect(resultaat.paginaAantal).toBe(1);
  });

  it("gooit een fout op een corrupt bestand in plaats van stil te falen", async () => {
    await expect(extraheerPdfTekst(Buffer.from("dit is geen pdf"))).rejects.toThrow();
  });
});

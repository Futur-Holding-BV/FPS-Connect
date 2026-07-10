// Centrale PDF-tekstextractie op basis van de pdf-parse v2-API (named class
// PDFParse met getText()/destroy()). De oude v1-API (default-functie-export)
// bestaat niet meer in pdf-parse >= 2.x; aanroepen daarvan gooien
// "pdfParse is not a function". Alle PDF-lezende code hoort deze helper te
// gebruiken zodat een toekomstige API-wijziging op één plek breekt.
import { PDFParse } from "pdf-parse";

export interface PdfTekstResultaat {
  tekst: string | null;
  paginaAantal: number | null;
  /** Tekst per pagina, index 0 = pagina 1. Leeg als per-pagina-extractie niet lukte. */
  paginaTeksten: string[];
}

export async function extraheerPdfTekst(buffer: Buffer): Promise<PdfTekstResultaat> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const resultaat = await parser.getText();
    const tekst = resultaat.text?.trim() || null;
    const paginaTeksten = Array.isArray(resultaat.pages)
      ? [...resultaat.pages].sort((a, b) => a.num - b.num).map((p) => p.text ?? "")
      : [];
    return { tekst, paginaAantal: resultaat.total ?? null, paginaTeksten };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

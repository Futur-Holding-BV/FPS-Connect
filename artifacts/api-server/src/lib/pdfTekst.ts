// Centrale PDF-tekstextractie op basis van de pdf-parse v2-API (named class
// PDFParse met getText()/destroy()). De oude v1-API (default-functie-export)
// bestaat niet meer in pdf-parse >= 2.x; aanroepen daarvan gooien
// "pdfParse is not a function". Alle PDF-lezende code hoort deze helper te
// gebruiken zodat een toekomstige API-wijziging op één plek breekt.
import { PDFParse } from "pdf-parse";

export interface PdfTekstResultaat {
  tekst: string | null;
  paginaAantal: number | null;
}

export async function extraheerPdfTekst(buffer: Buffer): Promise<PdfTekstResultaat> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const resultaat = await parser.getText();
    const tekst = resultaat.text?.trim() || null;
    return { tekst, paginaAantal: resultaat.total ?? null };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

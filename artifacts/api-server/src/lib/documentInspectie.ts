// Stap 1 van de Document Intelligence-pipeline: bestandsinspectie.
//
// Bepaalt UITSLUITEND op basis van structurele kenmerken (mime-type, paginatal,
// tekstdichtheid per pagina) of een document een bruikbare tekstlaag heeft, dan
// wel (gedeeltelijk) pixel-based is — d.w.z. dat de inhoud alleen via een
// afbeelding leesbaar is (scan, foto, of een PDF zonder ingesloten tekstlaag).
//
// Puur-functioneel: geen AI-aanroep, geen bestandsnaam-afhankelijkheid, geen
// I/O. Wordt gebruikt door documentIntelligence.ts om te beslissen wélke
// pagina's voor visuele analyse gerenderd moeten worden (stap 3), in plaats
// van de vorige "tekst < 80 tekens op het hele document"-vuistregel.

export interface PaginaInspectie {
  paginaNummer: number; // 1-based
  tekstlengte: number;
  isPixelBased: boolean;
}

export type TekstlaagKwaliteit = "goed" | "zwak" | "geen";

export interface DocumentInspectieResultaat {
  mime: string;
  paginaAantal: number | null;
  paginas: PaginaInspectie[];
  totaleTekstlengte: number;
  tekstlaagKwaliteit: TekstlaagKwaliteit;
  /** Het document als geheel: onvoldoende machineleesbare tekst t.o.v. het aantal pagina's. */
  isPixelBased: boolean;
  /** Vision/OCR-stap is nodig om de inhoud te kunnen interpreteren. */
  vereistVisueleAnalyse: boolean;
  /** Welke pagina's (1-based) het meest waard zijn om te renderen voor vision, in prioriteitsvolgorde. */
  visuelePrioriteitPaginas: number[];
}

// Drempel per pagina: minder dan dit aantal tekens telt als "pixel-based"
// (geen bruikbare tekstlaag op die pagina — vergelijkbaar met een gescande
// pagina of een pagina die volledig uit een afbeelding bestaat).
const MIN_TEKST_PER_PAGINA = 80;

// Mimetypes die per definitie geen native tekstlaag hebben en dus altijd
// visuele analyse (of OCR-via-vision) nodig hebben om gelezen te worden.
const AFBEELDING_MIMES_ZONDER_TEKSTLAAG = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/**
 * Inspecteert een reeds gedane tekstextractie (documentIntelligence blijft
 * verantwoordelijk voor de daadwerkelijke extractie zelf) en bepaalt de
 * structurele kwaliteit van de tekstlaag, per pagina waar mogelijk.
 */
export function inspecteerDocument(input: {
  mime: string;
  paginaAantal: number | null;
  /** Tekst per pagina, index 0 = pagina 1. Leeg/undefined als niet per pagina beschikbaar. */
  paginaTeksten?: string[] | null;
  /** Totale/samengevoegde tekst, gebruikt als er geen per-pagina-tekst beschikbaar is. */
  totaleTekst: string | null;
}): DocumentInspectieResultaat {
  const mime = input.mime || "application/octet-stream";
  const totaleTekst = input.totaleTekst ?? "";
  const totaleTekstlengte = totaleTekst.trim().length;

  // ── Afbeeldingsbestanden: per definitie geen tekstlaag, altijd pixel-based ──
  if (AFBEELDING_MIMES_ZONDER_TEKSTLAAG.has(mime)) {
    return {
      mime,
      paginaAantal: 1,
      paginas: [{ paginaNummer: 1, tekstlengte: 0, isPixelBased: true }],
      totaleTekstlengte: 0,
      tekstlaagKwaliteit: "geen",
      isPixelBased: true,
      vereistVisueleAnalyse: true,
      visuelePrioriteitPaginas: [1],
    };
  }

  // ── PDF met per-pagina-tekst: nauwkeurige inspectie per pagina ────────────
  if (input.paginaTeksten && input.paginaTeksten.length > 0) {
    const paginas: PaginaInspectie[] = input.paginaTeksten.map((tekst, i) => {
      const lengte = (tekst ?? "").trim().length;
      return { paginaNummer: i + 1, tekstlengte: lengte, isPixelBased: lengte < MIN_TEKST_PER_PAGINA };
    });
    const pixelPaginas = paginas.filter((p) => p.isPixelBased);
    // Document is "pixel-based" als de meerderheid van de pagina's geen bruikbare tekst heeft.
    const isPixelBased = pixelPaginas.length / paginas.length >= 0.5;
    const gemiddelde = totaleTekstlengte / paginas.length;
    const kwaliteit: TekstlaagKwaliteit = totaleTekstlengte === 0 ? "geen" : gemiddelde < MIN_TEKST_PER_PAGINA ? "zwak" : "goed";

    // Prioriteer voor vision: eerste pagina altijd (briefhoofd/logo staat meestal
    // vooraan), aangevuld met de pixel-based pagina's met de minste tekst
    // (meest waarschijnlijk puur beeld — bv. handtekeningpagina, tabel-als-scan).
    const overigeOpTekstlengte = pixelPaginas
      .filter((p) => p.paginaNummer !== 1)
      .sort((a, b) => a.tekstlengte - b.tekstlengte)
      .map((p) => p.paginaNummer);
    const visuelePrioriteitPaginas = [1, ...overigeOpTekstlengte].filter(
      (n, i, arr) => arr.indexOf(n) === i && n <= paginas.length,
    );

    return {
      mime,
      paginaAantal: input.paginaAantal ?? paginas.length,
      paginas,
      totaleTekstlengte,
      tekstlaagKwaliteit: kwaliteit,
      isPixelBased,
      vereistVisueleAnalyse: kwaliteit !== "goed",
      visuelePrioriteitPaginas,
    };
  }

  // ── Geen per-pagina-tekst beschikbaar (DOCX/spreadsheet/platte tekst, of PDF
  //    waar per-pagina-extractie niet lukte) — beoordeel op het geheel. ──────
  const paginaAantal = input.paginaAantal;
  const gemiddelde = paginaAantal && paginaAantal > 0 ? totaleTekstlengte / paginaAantal : totaleTekstlengte;
  const kwaliteit: TekstlaagKwaliteit = totaleTekstlengte === 0 ? "geen" : gemiddelde < MIN_TEKST_PER_PAGINA ? "zwak" : "goed";
  const isPixelBased = kwaliteit !== "goed";

  return {
    mime,
    paginaAantal: paginaAantal ?? null,
    paginas: [],
    totaleTekstlengte,
    tekstlaagKwaliteit: kwaliteit,
    isPixelBased,
    vereistVisueleAnalyse: isPixelBased,
    visuelePrioriteitPaginas: isPixelBased ? [1] : [],
  };
}

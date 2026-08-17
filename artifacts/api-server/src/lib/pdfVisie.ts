// Gedeelde helpers om een PDF-pagina om te zetten naar een base64-JPEG voor
// AI-vision-aanroepen, en om leesbare tekst uit een PDF te halen. Gebruikt door
// slim-upload.ts (documentclassificatie) en studio.ts (huisstijl-analyse).
import { execFile } from "node:child_process";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { logger } from "./logger";
import { extraheerPdfTekst } from "./pdfTekst";

// DOCUMENT_01: instellingen voor leesbare vision-invoer. Een A4 op 220 DPI is
// ±1870 px breed en blijft dus onder de bovengrens van 2000 px (nooit vergroten).
// Deze constanten worden ook in het bewijsspoor vermeld.
export const VISION_RENDER_DPI = 220;
export const VISION_MAX_PIXELS = 2000; // lange zijde
export const VISION_JPEG_KWALITEIT = 85;

export interface PdfRenderUitkomst {
  base64: string | null;
  /** Reden waarom renderen niet lukte (bv. pdftoppm niet geïnstalleerd), of null bij succes. */
  fout: string | null;
}

function beschrijfRenderFout(err: unknown): string {
  const e = err as NodeJS.ErrnoException | undefined;
  if (e?.code === "ENOENT") {
    return "pdftoppm (poppler-utils) is niet geïnstalleerd op deze server — pagina's kunnen niet als afbeelding worden gelezen";
  }
  const melding = e instanceof Error ? e.message : String(err);
  if (/Command failed:.*pdftoppm/s.test(melding)) {
    return "PDF-pagina's konden niet worden weergegeven — het bestand is mogelijk beschadigd of geen geldige PDF";
  }
  return `PDF-rendering mislukt: ${melding}`;
}

export async function renderPdfPaginaMetStatus(buffer: Buffer, paginaNummer = 1): Promise<PdfRenderUitkomst> {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tmpIn     = path.join(tmpdir(), `fps_in_${id}.pdf`);
  const tmpPrefix = path.join(tmpdir(), `fps_out_${id}`);

  try {
    await writeFile(tmpIn, buffer);

    await new Promise<void>((resolve, reject) => {
      execFile(
        "pdftoppm",
        ["-jpeg", "-f", String(paginaNummer), "-l", String(paginaNummer), "-r", String(VISION_RENDER_DPI), tmpIn, tmpPrefix],
        { timeout: 15_000 },
        (err) => { if (err) reject(err); else resolve(); },
      );
    });

    let imgBuffer: Buffer | null = null;
    const paginaStr = String(paginaNummer).padStart(2, "0");
    for (const candidate of [`${tmpPrefix}-${paginaStr}.jpg`, `${tmpPrefix}-${paginaNummer}.jpg`]) {
      try {
        imgBuffer = await readFile(candidate);
        await unlink(candidate).catch(() => {});
        break;
      } catch { /* probeer volgende */ }
    }
    if (!imgBuffer) return { base64: null, fout: "pdftoppm leverde geen afbeelding op voor deze pagina" };

    const sharp = (await import("sharp")).default;
    const base64 = (await sharp(imgBuffer)
      .resize({ width: VISION_MAX_PIXELS, height: VISION_MAX_PIXELS, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: VISION_JPEG_KWALITEIT })
      .toBuffer()).toString("base64");
    return { base64, fout: null };
  } catch (err) {
    logger.warn({ err, paginaNummer }, "pdfVisie: PDF→afbeelding mislukt, doorgaan zonder vision");
    return { base64: null, fout: beschrijfRenderFout(err) };
  } finally {
    await unlink(tmpIn).catch(() => {});
  }
}

export async function renderPdfPagina(buffer: Buffer, paginaNummer = 1): Promise<string | null> {
  return (await renderPdfPaginaMetStatus(buffer, paginaNummer)).base64;
}

/**
 * Rendert meerdere pagina's van dezelfde PDF naar afbeeldingen (voor multi-page
 * vision bij documenten met een zwakke/geen tekstlaag). Geeft alleen de
 * pagina's terug die daadwerkelijk gerenderd konden worden — een mislukte
 * pagina wordt overgeslagen, niet de hele aanroep.
 */
export async function renderPdfPaginas(
  buffer: Buffer,
  paginaNummers: number[],
): Promise<Array<{ paginaNummer: number; base64: string }>> {
  return (await renderPdfPaginasMetStatus(buffer, paginaNummers)).paginas;
}

/**
 * Als renderPdfPaginas, maar met expliciete foutreden wanneer er níéts gerenderd
 * kon worden — zodat aanroepers "onleesbaar document" zichtbaar kunnen maken in
 * plaats van stil door te gaan met nul afbeeldingen.
 */
export async function renderPdfPaginasMetStatus(
  buffer: Buffer,
  paginaNummers: number[],
): Promise<{ paginas: Array<{ paginaNummer: number; base64: string }>; fout: string | null }> {
  const paginas: Array<{ paginaNummer: number; base64: string }> = [];
  let laatsteFout: string | null = null;
  for (const paginaNummer of paginaNummers) {
    const uitkomst = await renderPdfPaginaMetStatus(buffer, paginaNummer);
    if (uitkomst.base64) paginas.push({ paginaNummer, base64: uitkomst.base64 });
    else laatsteFout = uitkomst.fout;
    // Ontbrekende binary treft élke pagina — niet nodeloos doorproberen.
    if (uitkomst.fout?.includes("niet geïnstalleerd")) break;
  }
  return { paginas, fout: paginas.length === 0 ? laatsteFout : null };
}

export async function haalPdfTekst(buffer: Buffer): Promise<string | null> {
  try {
    const result = await extraheerPdfTekst(buffer);
    return result.tekst;
  } catch { return null; }
}

export async function resizeAfbeelding(buffer: Buffer): Promise<string | null> {
  try {
    const sharp = (await import("sharp")).default;
    return (await sharp(buffer)
      .resize({ width: VISION_MAX_PIXELS, height: VISION_MAX_PIXELS, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: VISION_JPEG_KWALITEIT })
      .toBuffer()).toString("base64");
  } catch (err) {
    logger.warn({ err }, "pdfVisie: afbeelding resize mislukt");
    return null;
  }
}

// Gedeelde helpers om een PDF-pagina om te zetten naar een base64-JPEG voor
// AI-vision-aanroepen, en om leesbare tekst uit een PDF te halen. Gebruikt door
// slim-upload.ts (documentclassificatie) en studio.ts (huisstijl-analyse).
import { execFile } from "node:child_process";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { logger } from "./logger";
import { extraheerPdfTekst } from "./pdfTekst";

export async function renderPdfPagina(buffer: Buffer): Promise<string | null> {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tmpIn     = path.join(tmpdir(), `fps_in_${id}.pdf`);
  const tmpPrefix = path.join(tmpdir(), `fps_out_${id}`);

  try {
    await writeFile(tmpIn, buffer);

    await new Promise<void>((resolve, reject) => {
      execFile(
        "pdftoppm",
        ["-jpeg", "-f", "1", "-l", "1", "-r", "120", tmpIn, tmpPrefix],
        { timeout: 15_000 },
        (err) => { if (err) reject(err); else resolve(); },
      );
    });

    let imgBuffer: Buffer | null = null;
    for (const candidate of [`${tmpPrefix}-01.jpg`, `${tmpPrefix}-1.jpg`]) {
      try {
        imgBuffer = await readFile(candidate);
        await unlink(candidate).catch(() => {});
        break;
      } catch { /* probeer volgende */ }
    }
    if (!imgBuffer) return null;

    const sharp = (await import("sharp")).default;
    return (await sharp(imgBuffer)
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer()).toString("base64");
  } catch (err) {
    logger.warn({ err }, "pdfVisie: PDF→afbeelding mislukt, doorgaan zonder vision");
    return null;
  } finally {
    await unlink(tmpIn).catch(() => {});
  }
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
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer()).toString("base64");
  } catch (err) {
    logger.warn({ err }, "pdfVisie: afbeelding resize mislukt");
    return null;
  }
}

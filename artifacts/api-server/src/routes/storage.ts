import { Router, type IRouter, type Request, type Response } from "express";
import path from "path";
import { Readable } from "stream";
import sharp from "sharp";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import {
  ObjectStorageService,
  ObjectNotFoundError,
  parseGebouwIdFromObjectPath,
  type BestandType,
} from "../lib/objectStorage";
import { requireAuth } from "../middlewares/auth";
import { db } from "@workspace/db";
import { gebouwToewijzingenTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isBeperktTotToegewezen } from "../utils/rol";
import { haalScanStatusOpVoorPad } from "../services/security-intake-engine";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Maximale uploadgrootte in bytes. Standaard 100 MB; overschrijfbaar via
// MAX_UPLOAD_SIZE_MB (geheel getal, in megabytes).
const MAX_UPLOAD_BYTES = (() => {
  const mb = parseInt(process.env["MAX_UPLOAD_SIZE_MB"] ?? "", 10);
  return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : 100 * 1024 * 1024;
})();

// ---- Gebouw-ACL helper ----
// Controleer of de ingelogde gebruiker toegang heeft tot het gebouw dat bij
// dit bestand hoort. Gebruikers met volledige bevoegdheden zijn niet beperkt.
// Bestanden zonder gebouw-koppeling (legacy/algemeen) zijn toegankelijk voor
// elke geauthenticeerde gebruiker.
async function magBestandInGebouw(
  userId: number,
  objectPath: string,
): Promise<boolean> {
  const gebouwId = parseGebouwIdFromObjectPath(objectPath);
  if (gebouwId == null) {
    // Legacy uploads/ of algemeen/ — elke ingelogde gebruiker mag lezen.
    return true;
  }
  // Gebruikers die niet beperkt zijn (beheerder, bevoegdheid gebouwen:2) zien alles.
  if (!(await isBeperktTotToegewezen(userId))) return true;
  // Beperkte gebruikers: alleen toegewezen gebouwen.
  const rows = await db
    .select({ gebouwId: gebouwToewijzingenTable.gebouwId })
    .from(gebouwToewijzingenTable)
    .where(eq(gebouwToewijzingenTable.gebruikerId, userId));
  return rows.some((r) => r.gebouwId === gebouwId);
}

/**
 * POST /storage/uploads/request-url
 *
 * Vraag een presigned PUT-URL aan voor directe upload naar object storage.
 * De client stuurt JSON-metadata (name, size, contentType, gebouw_id?, bestand_type?).
 * Bestanden worden georganiseerd als {gebouw_id}/{type}s/{uuid} zodat ACL
 * en archivering per project werken.
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { name, size, contentType, gebouw_id, bestand_type } = parsed.data;

  // ── Security Intake — Poort 1: metadata screening ────────────────────────
  // Blokkeert gevaarlijke extensies direct bij URL-aanvraag,
  // vóórdat het bestand ook maar naar storage wordt gestuurd.
  const ALTIJD_GEBLOKKEERD_UPLOAD = new Set([
    ".exe", ".bat", ".cmd", ".com", ".scr", ".ps1", ".ps2", ".psc1", ".psc2",
    ".vbs", ".vbe", ".wsf", ".wsh", ".jar", ".msi", ".dll", ".reg", ".hta",
    ".apk", ".pif", ".application", ".gadget", ".lnk",
  ]);
  const GEBLOKKEERDE_UPLOAD = new Set([
    ...ALTIJD_GEBLOKKEERD_UPLOAD,
    ".js", ".jse", ".xlsm", ".docm", ".pptm", ".xlam", ".dotm", ".potm", ".ppam",
    ".iso", ".img", ".inf", ".msu", ".msp", ".prg",
  ]);
  const uploadExt = path.extname(name ?? "").toLowerCase();
  if (GEBLOKKEERDE_UPLOAD.has(uploadExt)) {
    res.status(422).json({
      error: `Bestandstype "${uploadExt}" is niet toegestaan in FPS Connect. Neem contact op met de beheerder als dit onterecht is.`,
      code: "SECURITY_EXTENSIE_GEBLOKKEERD",
    });
    return;
  }
  // Dubbele extensie detectie (bv. factuur.pdf.exe)
  const naamZonderExt = (name ?? "").slice(0, (name ?? "").length - uploadExt.length);
  const tweedeExt = path.extname(naamZonderExt).toLowerCase();
  if (ALTIJD_GEBLOKKEERD_UPLOAD.has(tweedeExt)) {
    res.status(422).json({
      error: `Verdachte bestandsnaam gedetecteerd (dubbele extensie "${tweedeExt}${uploadExt}"). Upload geweigerd.`,
      code: "SECURITY_DUBBELE_EXTENSIE",
    });
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Weiger bestanden die de harde server-limiet overschrijden.
  if (size > MAX_UPLOAD_BYTES) {
    const limietMB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
    res.status(422).json({ error: `Bestand te groot: maximaal ${limietMB} MB toegestaan.` });
    return;
  }

  try {
    // Verifieer toegang tot het gebouw vóór het genereren van de upload-URL.
    if (gebouw_id != null) {
      const userId = req.session.userId!;
      if (!(await magBestandInGebouw(userId, `/objects/${gebouw_id}/check`))) {
        res.status(403).json({ error: "Geen toegang tot dit gebouw" });
        return;
      }
    }

    const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURL(
      gebouw_id ?? null,
      (bestand_type ?? null) as BestandType | null,
    );

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType, gebouw_id, bestand_type },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serveer publieke assets uit PUBLIC_OBJECT_SEARCH_PATHS.
 * Geen authenticatie of ACL-check — uitsluitend voor publieke assets.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serveer een privé-bestand uit PRIVATE_OBJECT_DIR.
 * Vereist authenticatie + gebouw-ACL:
 * - Gestructureerde paden ({gebouw_id}/{type}/{uuid}): alleen gebruikers met
 *   toegang tot dat gebouw.
 * - Legacy-paden (uploads/{uuid}) of algemeen/{uuid}: elke ingelogde gebruiker.
 */
router.get("/storage/objects/*path", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    // Gebouw-ACL: controleer of de gebruiker toegang heeft tot dit bestand.
    const userId = req.session.userId!;
    if (!(await magBestandInGebouw(userId, objectPath))) {
      res.status(403).json({ error: "Geen toegang tot dit bestand" });
      return;
    }

    // ── Scan-first gate (OWASP File Upload — automatische blokkade ongescande bestanden) ────
    // Bestanden die na beveiligingsscan geblokkeerd zijn, worden NOOIT geserveerd.
    // Bestanden zonder scanrecord (geüpload vóór de security intake) worden doorgelaten.
    const scanStatus = await haalScanStatusOpVoorPad(objectPath).catch(() => null);
    if (scanStatus?.geblokkeerd) {
      req.log.warn({ objectPath }, "Scan-first gate: geblokkeerd bestand geweigerd");
      res.status(403).json({
        error: "Dit bestand is geblokkeerd door de beveiligingsscan en kan niet worden gedownload.",
        code: "SECURITY_BESTAND_GEBLOKKEERD",
      });
      return;
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

/**
 * GET /storage/thumbnails/*
 *
 * Serveer een on-demand thumbnail van een opgeslagen afbeelding.
 * Query-parameters: w (breedte, default 300) en h (hoogte, default 300).
 * Dezelfde ACL-regels als /storage/objects/*.
 *
 * De thumbnail wordt gegenereerd via sharp, verkleind naar max w×h
 * (cover-fit) en geretourneerd als WebP voor optimale compressie.
 */
router.get("/storage/thumbnails/*path", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    // Gebouw-ACL
    const userId = req.session.userId!;
    if (!(await magBestandInGebouw(userId, objectPath))) {
      res.status(403).json({ error: "Geen toegang tot dit bestand" });
      return;
    }

    const w = Math.min(Math.max(parseInt(String(req.query.w || "300"), 10) || 300, 32), 1920);
    const h = Math.min(Math.max(parseInt(String(req.query.h || "300"), 10) || 300, 32), 1920);

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const [metadata] = await objectFile.getMetadata();
    const contentType = String(metadata.contentType || "");

    // Alleen afbeeldingen worden verwerkt — andere types worden doorgestuurd.
    if (!contentType.startsWith("image/")) {
      const response = await objectStorageService.downloadObject(objectFile);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
      return;
    }

    const nodeStream = objectFile.createReadStream();

    const transformer = sharp()
      .resize(w, h, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 });

    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "private, max-age=86400");

    nodeStream.pipe(transformer).pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Thumbnail: object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error generating thumbnail");
    res.status(500).json({ error: "Failed to generate thumbnail" });
  }
});

export default router;

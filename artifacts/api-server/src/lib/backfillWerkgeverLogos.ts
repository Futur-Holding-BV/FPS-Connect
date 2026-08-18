/**
 * backfillWerkgeverLogos — eenmalige startup-backfill.
 *
 * Kopieert werkgever-logo's die nog op het legacy-pad (objects/algemeen/<uuid>.<ext>)
 * staan naar de canonieke sleutel werkgevers/<id>/logo.<ext>, en werkt de
 * logo_url-kolom atomair bij. Hierna zijn ze beschikbaar via de publieke
 * marketing-proxy en de mandagstaat-download.
 *
 * Veiligheid:
 * - Loopt alleen langs werkgevers met een aantoonbaar legacy-pad.
 * - Afzonderlijke fouten worden gelogd en overgeslagen; de server start door.
 * - Is idempotent: werkgevers met al een werkgevers/-pad worden overgeslagen.
 */
import { db } from "@workspace/db";
import { werkgeversTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { berekenWerkgeverLogoPad, resolveWerkgeverLogoSubPath, LOGO_PRIMARY_PREFIX, LOGO_LEGACY_PREFIX, LOGO_TOEGESTANE_EXTENSIES } from "./werkgever-logo-pad";
import { logger } from "./logger";

const storage = new ObjectStorageService();

export async function backfillWerkgeverLogos(): Promise<void> {
  // Haal alleen werkgevers op met een niet-null logo_url.
  const werkgevers = await db
    .select({ id: werkgeversTable.id, logoUrl: werkgeversTable.logoUrl })
    .from(werkgeversTable);

  const teBackfilen = werkgevers.filter((w) => {
    if (!w.logoUrl) return false;
    const subPath = resolveWerkgeverLogoSubPath(w.logoUrl);
    // Overgeslagen: onbekend pad of al op primair prefix.
    if (!subPath) return false;
    return !subPath.startsWith(LOGO_PRIMARY_PREFIX);
  });

  if (teBackfilen.length === 0) return;

  logger.info({ aantal: teBackfilen.length }, "[backfill-logos] Legacy werkgever-logo's gevonden — starten met migratie");

  for (const w of teBackfilen) {
    try {
      const origSubPath = resolveWerkgeverLogoSubPath(w.logoUrl!)!;

      // Strenge validatie van het legacy-pad vóór elke kopie:
      // 1. Moet beginnen met de legacy-prefix "algemeen/" (nooit werkgevers/ of andere paden).
      // 2. Geen padtraversal (geen ".." of extra "/").
      // 3. Alleen goedgekeurde afbeeldingsextensies — dezelfde lijst als de proxy.
      const TOEGESTANE_EXTS = new Set(LOGO_TOEGESTANE_EXTENSIES as readonly string[]);
      if (!origSubPath.startsWith(LOGO_LEGACY_PREFIX)) {
        logger.warn({ werkgeverId: w.id, origSubPath }, "[backfill-logos] Overgeslagen: pad niet op legacy-prefix");
        continue;
      }
      const bestandsnaam = origSubPath.slice(LOGO_LEGACY_PREFIX.length);
      if (bestandsnaam.includes("/") || bestandsnaam.includes("..")) {
        logger.warn({ werkgeverId: w.id, origSubPath }, "[backfill-logos] Overgeslagen: traversal in pad");
        continue;
      }
      const punt = bestandsnaam.lastIndexOf(".");
      const extMetPunt = punt >= 0 ? bestandsnaam.slice(punt).toLowerCase() : "";
      if (!TOEGESTANE_EXTS.has(extMetPunt)) {
        logger.warn({ werkgeverId: w.id, origSubPath, extMetPunt }, "[backfill-logos] Overgeslagen: extensie niet toegestaan");
        continue;
      }

      const targetSubPath = berekenWerkgeverLogoPad(w.id, origSubPath);

      // Download vanuit het legacy-pad.
      const buf = await storage.downloadBestandBuffer(origSubPath);

      // Mime-type op basis van de al gevalideerde extensie.
      const ext = extMetPunt.slice(1); // zonder punt
      const mimeMap: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
      };
      const mime = mimeMap[ext] ?? "application/octet-stream";

      // Upload naar het canonieke pad.
      const nieuwObjectPath = await storage.uploadBestand(targetSubPath, buf, mime);

      // Werk logo_url atomair bij.
      await db
        .update(werkgeversTable)
        .set({ logoUrl: nieuwObjectPath })
        .where(eq(werkgeversTable.id, w.id));

      logger.info({ werkgeverId: w.id, van: origSubPath, naar: targetSubPath }, "[backfill-logos] Logo gemigreerd");
    } catch (err) {
      logger.warn({ err, werkgeverId: w.id, logoUrl: w.logoUrl }, "[backfill-logos] Migratie mislukt — overgeslagen");
    }
  }

  logger.info("[backfill-logos] Backfill afgerond");
}

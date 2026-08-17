/**
 * Hulpfuncties voor werkgever-logo-padvalidatie en -migratie.
 *
 * Geïsoleerd in een apart bestand zodat pure-logica getest kan worden
 * zonder de objectStorage- of DB-initialisatie mee te trekken.
 */

/**
 * Primair storage-prefix voor werkgever-logo's na migratie.
 * Alle nieuwe uploads worden hier opgeslagen via PATCH /werkgevers/:id.
 */
export const LOGO_PRIMARY_PREFIX = "werkgevers/";

/**
 * Legacy prefix — logo's opgeslagen vóór de migratie (standaard upload-pad).
 * Worden tijdelijk ondersteund voor lezen totdat een backfill is uitgevoerd.
 * De PATCH /werkgevers/:id route migreert naar LOGO_PRIMARY_PREFIX bij opslaan.
 */
export const LOGO_LEGACY_PREFIX = "algemeen/";

/**
 * Geaccepteerde afbeeldingsextensies voor werkgever-logo's.
 * SVG wordt bewust uitgesloten: PDFKit ondersteunt geen SVG-rendering.
 */
export const LOGO_TOEGESTANE_EXTENSIES = [".png", ".jpg", ".jpeg", ".webp", ".gif"] as const;

/**
 * Vertaalt een logo_url (zoals opgeslagen in werkgevers.logo_url) naar een
 * opaque storage-subPath, of null als het pad niet is toegestaan.
 *
 * Geaccepteerde vormen:
 *   - "/api/storage/objects/<subPath>"  (canonieke download-URL)
 *   - "/api/storage/files?path=<URL-encoded subPath>"  (historisch formaat)
 *   - "/objects/<subPath>"  (canonical pad na uploadBestand)
 *   - kale subPath (geen "/" of "http"-prefix)
 *
 * Geweigerd: externe http(s)-URLs, onbekende root-paden, paden buiten de
 * werkgever- of legacy algemeen-prefix.
 */
export function resolveWerkgeverLogoSubPath(logoUrl: string): string | null {
  let subPath: string;
  if (logoUrl.startsWith("/api/storage/objects/")) {
    subPath = decodeURIComponent(logoUrl.slice("/api/storage/objects/".length));
  } else if (logoUrl.startsWith("/api/storage/files?path=")) {
    subPath = decodeURIComponent(logoUrl.replace("/api/storage/files?path=", ""));
  } else if (logoUrl.startsWith("/objects/")) {
    subPath = logoUrl.slice("/objects/".length);
  } else if (
    logoUrl.startsWith("http://") ||
    logoUrl.startsWith("https://") ||
    logoUrl.startsWith("/")
  ) {
    return null;
  } else {
    subPath = logoUrl;
  }
  // Primair pad (na migratie) of legacy pad (vóór migratie, tijdelijk ondersteund).
  if (!subPath.startsWith(LOGO_PRIMARY_PREFIX) && !subPath.startsWith(LOGO_LEGACY_PREFIX)) {
    return null;
  }
  return subPath;
}

/**
 * Geeft true als het gegeven subPath naar een SVG-bestand wijst.
 * PDFKit ondersteunt SVG niet; uploads worden geweigerd en downloads overgeslagen.
 */
export function isSvgSubPath(subPath: string): boolean {
  return subPath.toLowerCase().endsWith(".svg");
}

/**
 * Berekent het doel-subPath voor logo-migratie van algemeen/<uuid>.<ext>
 * naar werkgevers/<id>/logo.<ext>.
 *
 * Na de migratie slaagt resolveWerkgeverLogoSubPath voor het nieuwe pad,
 * zodat de mandagstaat het logo kan downloaden.
 */
export function berekenWerkgeverLogoPad(werkgeverId: number, origSubPath: string): string {
  const lastDot = origSubPath.lastIndexOf(".");
  const ext = lastDot >= 0 ? origSubPath.slice(lastDot) : "";
  return `${LOGO_PRIMARY_PREFIX}${werkgeverId}/logo${ext}`;
}

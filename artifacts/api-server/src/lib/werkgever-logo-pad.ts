/**
 * Hulpfuncties voor werkgever-logo-padvalidatie en -migratie.
 *
 * Geïsoleerd in een apart bestand zodat pure-logica getest kan worden
 * zonder de objectStorage- of DB-initialisatie mee te trekken.
 */

/**
 * Alle werkgever-logo's moeten opgeslagen zijn onder dit prefix.
 * Paden buiten dit prefix kunnen documenten met eigen ACL bevatten en
 * worden door haalLogoBuffer geweigerd.
 */
export const LOGO_STORAGE_PREFIX = "werkgevers/";

/**
 * Vertaalt een logo_url (zoals opgeslagen in werkgevers.logo_url) naar een
 * opaque storage-subPath, of null als het pad niet is toegestaan.
 *
 * Geaccepteerde vormen:
 *   - "/api/storage/objects/<subPath>"  (canonieke download-URL)
 *   - "/api/storage/files?path=<URL-encoded subPath>"  (historisch dood formaat)
 *   - "/objects/<subPath>"  (canonical pad na uploadBestand)
 *   - kale subPath (geen "/" of "http"-prefix)
 * Geweigerd: externe http(s)-URLs, onbekende root-paden, paden buiten LOGO_STORAGE_PREFIX.
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
  if (!subPath.startsWith(LOGO_STORAGE_PREFIX)) return null;
  return subPath;
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
  return `werkgevers/${werkgeverId}/logo${ext}`;
}

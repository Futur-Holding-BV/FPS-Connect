/**
 * Normaliseert een opgeslagen storage-verwijzing naar de canonieke
 * download-URL /api/storage/objects/<subPath> (zelfde toegangscontrole als
 * MERK_01). Spiegel van lib/storageObjectsUrl.ts in de api-server.
 *
 * Accepteert: canonieke URL (passthrough), historisch dood
 * /api/storage/files?path=-formaat, /objects/-pad, kale subPath.
 * Externe http(s)-URL's en andere rootpaden blijven onaangeroerd.
 */
const DODE_FILES_PREFIX = "/api/storage/files?path=";
const OBJECTS_PREFIX = "/api/storage/objects/";

function objectsUrl(subPath: string): string {
  return OBJECTS_PREFIX + subPath.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
}

export function normaliseerStorageUrl(padOfUrl: string): string {
  if (!padOfUrl) return padOfUrl;
  if (/^https?:\/\//i.test(padOfUrl)) return padOfUrl;
  if (padOfUrl.startsWith(OBJECTS_PREFIX)) return padOfUrl;
  if (padOfUrl.startsWith(DODE_FILES_PREFIX)) {
    return objectsUrl(decodeURIComponent(padOfUrl.slice(DODE_FILES_PREFIX.length)));
  }
  if (padOfUrl.startsWith("/objects/")) return objectsUrl(padOfUrl.slice("/objects/".length));
  if (padOfUrl.startsWith("/")) return padOfUrl; // ander bekend rootpad: niet gokken
  return objectsUrl(padOfUrl); // kale subPath
}

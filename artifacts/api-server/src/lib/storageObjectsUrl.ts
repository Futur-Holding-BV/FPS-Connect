/**
 * Canonieke storage-download-URL's.
 *
 * DEFECT-context: her en der werd `/api/storage/files?path=...` gegenereerd,
 * maar die route heeft nooit bestaan (routes/storage.ts kent alleen
 * /storage/public-objects, /storage/objects en /storage/thumbnails).
 * Alle downloadlinks horen op /api/storage/objects/<subPath> te wijzen —
 * dezelfde route (en dus dezelfde toegangscontrole: requireAuth + gebouw- en
 * document-ACL) als MERK_01/de beeldbank gebruikt.
 */

const DODE_FILES_PREFIX = "/api/storage/files?path=";
const OBJECTS_PREFIX = "/api/storage/objects/";

/** Bouwt de canonieke download-URL voor een storage-subPath (bv. "facturen/12/x.pdf"). */
export function storageObjectsUrl(subPath: string): string {
  const schoon = subPath.replace(/^\/+/, "");
  // Slashes moeten segmentscheiders blijven; overige tekens per segment encoden.
  return OBJECTS_PREFIX + schoon.split("/").map(encodeURIComponent).join("/");
}

/**
 * Normaliseert een opgeslagen waarde (oud dood formaat, /objects/-pad, kale
 * subPath of al-canonieke URL) naar de canonieke /api/storage/objects/-URL.
 * Externe http(s)-URL's blijven onaangeroerd.
 */
export function normaliseerStorageUrl(padOfUrl: string): string {
  if (!padOfUrl) return padOfUrl;
  if (/^https?:\/\//i.test(padOfUrl)) return padOfUrl;
  if (padOfUrl.startsWith(OBJECTS_PREFIX)) return padOfUrl;
  if (padOfUrl.startsWith(DODE_FILES_PREFIX)) {
    return storageObjectsUrl(decodeURIComponent(padOfUrl.slice(DODE_FILES_PREFIX.length)));
  }
  if (padOfUrl.startsWith("/objects/")) {
    return storageObjectsUrl(padOfUrl.slice("/objects/".length));
  }
  if (padOfUrl.startsWith("/")) return padOfUrl; // ander bekend rootpad: niet gokken
  return storageObjectsUrl(padOfUrl); // kale subPath
}

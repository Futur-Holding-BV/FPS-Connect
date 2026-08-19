import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

/**
 * Platform-onafhankelijke bestandslaag voor de offline-wachtrij.
 *
 * Native (iOS/Android): dunne wrapper om expo-file-system — gedrag identiek
 * aan vóór deze abstractie (documentDirectory, copyAsync, uploadAsync, ...).
 *
 * Web (/app op de telefoon): expo-file-system werkt niet in de browser.
 * Een "pad" is op web een idb://<uuid>-sleutel waarvan de blob in IndexedDB
 * wordt bewaard. IndexedDB biedt honderden MB's (afhankelijk van het apparaat)
 * en overleeft een herlaad. De logische-map-index (welke sleutels in welke map
 * zitten) wordt apart in AsyncStorage (localStorage) bewaard als kleine
 * stringlijst. Achterwaartse compatibiliteit voor bestaande wachtrij-items
 * met een data:-URL is ingebakken: alle read/upload-paden accepteren beide.
 *
 * Migratie: wachtrij-items met een data:-URL die al in AsyncStorage staan
 * blijven gewoon werken via de passthrough-paden hieronder.
 */

const isWeb = Platform.OS === "web";
const MAP_PREFIX = "fps_webmap_v1:";

// ─── IndexedDB helpers (uitsluitend web) ─────────────────────────────────────

const IDB_DB_NAME = "fps_offline_files_v1";
const IDB_STORE = "bestanden";
const IDB_VERSION = 1;
const IDB_PAD_PREFIX = "idb://";

/** In-memory blob-URL cache (paginalevensduur; voor <Image>-weergave). */
const blobUrlCache = new Map<string, string>();

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSlaOp(sleutel: string, blob: Blob): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(blob, sleutel);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function idbLees(sleutel: string): Promise<Blob | undefined> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(sleutel);
    req.onsuccess = () => {
      db.close();
      resolve(req.result as Blob | undefined);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function idbVerwijder(sleutel: string): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(sleutel);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function idbBestaat(sleutel: string): Promise<boolean> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).getKey(sleutel);
    req.onsuccess = () => {
      db.close();
      resolve(req.result !== undefined);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

function nieuweIdbPad(): string {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${IDB_PAD_PREFIX}${id}`;
}

// ─── Map-index helpers (AsyncStorage — alleen de kleine sleutellijst) ─────────

async function leesMapIndex(map: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(`${MAP_PREFIX}${map}`);
  if (!raw) return [];
  try {
    const lijst = JSON.parse(raw) as unknown;
    return Array.isArray(lijst) ? (lijst as string[]) : [];
  } catch {
    return [];
  }
}

async function schrijfMapIndex(map: string, lijst: string[]): Promise<void> {
  await AsyncStorage.setItem(`${MAP_PREFIX}${map}`, JSON.stringify(lijst));
}

/** Verwijdert een pad uit alle map-indexen (voor zowel idb:// als data:-URLs). */
async function verwijderUitMapIndex(pad: string): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) =>
    k.startsWith(MAP_PREFIX),
  );
  for (const key of keys) {
    const map = key.slice(MAP_PREFIX.length);
    const lijst = await leesMapIndex(map);
    if (lijst.includes(pad)) {
      await schrijfMapIndex(
        map,
        lijst.filter((p) => p !== pad),
      );
    }
  }
}

// ─── Publieke helpers ─────────────────────────────────────────────────────────

/** Geeft true voor webpaden (idb:// of legacy data:-URLs). */
export function isWebPad(pad: string): boolean {
  return pad.startsWith(IDB_PAD_PREFIX) || pad.startsWith("data:");
}

/** Basis voor een logische opslagmap (native: onder documentDirectory). */
export function documentMap(sub: string): string {
  if (isWeb) return sub.replace(/\/+$/, "");
  return `${FileSystem.documentDirectory ?? ""}${sub}${sub.endsWith("/") ? "" : "/"}`;
}

export async function maakMap(map: string): Promise<void> {
  if (isWeb) return; // logische map — niets aan te maken
  await FileSystem.makeDirectoryAsync(map, { intermediates: true });
}

/**
 * Geeft een displaybare URI voor een lokaal pad.
 *
 * - idb://<uuid>  → blob-URL (gecached per paginalevensduur)
 * - data:...      → as-is (achterwaartse compatibiliteit)
 * - overige       → as-is (native file:// paden)
 *
 * Gebruik dit in <Image source={{ uri: await resolveDisplayUri(pad) }}> of
 * via de useResolvedUri-hook.
 */
export async function resolveDisplayUri(pad: string): Promise<string> {
  if (!pad.startsWith(IDB_PAD_PREFIX)) return pad;
  const cached = blobUrlCache.get(pad);
  if (cached) return cached;
  const sleutel = pad.slice(IDB_PAD_PREFIX.length);
  const blob = await idbLees(sleutel);
  if (!blob) return pad;
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(pad, url);
  return url;
}

/**
 * Bewaart een bron-URI (camera/galerij) lokaal en geeft het lokale pad terug.
 * Native: kopieert naar `${map}${naam}`. Web: blob in IndexedDB, key in map-index.
 */
export async function bewaarBestandUitUri(
  bronUri: string,
  map: string,
  naam: string,
): Promise<string> {
  if (isWeb) {
    const res = await fetch(bronUri);
    if (!res.ok) throw new Error(`Bestand lezen mislukt (http ${res.status})`);
    const blob = await res.blob();
    const pad = nieuweIdbPad();
    const sleutel = pad.slice(IDB_PAD_PREFIX.length);
    await idbSlaOp(sleutel, blob);
    const lijst = await leesMapIndex(map);
    await schrijfMapIndex(map, [...lijst, pad]);
    return pad;
  }
  await maakMap(map);
  const doel = `${map}${naam}`;
  await FileSystem.copyAsync({ from: bronUri, to: doel });
  return doel;
}

/** Schrijft tekst (bv. een handtekening-SVG) en geeft het pad terug. */
export async function schrijfTekstBestand(
  map: string,
  naam: string,
  tekst: string,
): Promise<string> {
  if (isWeb) {
    const blob = new Blob([tekst], { type: "image/svg+xml" });
    const pad = nieuweIdbPad();
    const sleutel = pad.slice(IDB_PAD_PREFIX.length);
    await idbSlaOp(sleutel, blob);
    const lijst = await leesMapIndex(map);
    await schrijfMapIndex(map, [...lijst, pad]);
    return pad;
  }
  await maakMap(map);
  const pad = `${map}${naam}`;
  await FileSystem.writeAsStringAsync(pad, tekst);
  return pad;
}

/** Alle bestanden (volledige paden) in een logische map, gesorteerd. */
export async function lijstMap(map: string): Promise<string[]> {
  if (isWeb) return leesMapIndex(map);
  const info = await FileSystem.getInfoAsync(map);
  if (!info.exists || !info.isDirectory) return [];
  const bestanden = await FileSystem.readDirectoryAsync(map);
  return bestanden.sort().map((b) => `${map}${b}`);
}

export async function bestandBestaat(pad: string): Promise<boolean> {
  if (isWeb) {
    if (pad.startsWith(IDB_PAD_PREFIX)) {
      return idbBestaat(pad.slice(IDB_PAD_PREFIX.length));
    }
    // Legacy data:-URL
    return pad.startsWith("data:") && pad.length > "data:".length;
  }
  const info = await FileSystem.getInfoAsync(pad);
  return info.exists;
}

export async function bestandGrootte(pad: string): Promise<number | null> {
  if (isWeb) {
    if (pad.startsWith(IDB_PAD_PREFIX)) {
      const blob = await idbLees(pad.slice(IDB_PAD_PREFIX.length));
      return blob?.size ?? null;
    }
    // Legacy data:-URL: ruwe schatting op basis van base64-lengte
    const komma = pad.indexOf(",");
    if (komma < 0) return null;
    return Math.floor(((pad.length - komma - 1) * 3) / 4);
  }
  const info = await FileSystem.getInfoAsync(pad);
  return info.exists && !info.isDirectory ? (info.size ?? null) : null;
}

export async function leesTekstBestand(pad: string): Promise<string> {
  if (isWeb) {
    if (pad.startsWith(IDB_PAD_PREFIX)) {
      const blob = await idbLees(pad.slice(IDB_PAD_PREFIX.length));
      if (!blob) throw new Error("Bestand niet gevonden in IndexedDB");
      return blob.text();
    }
    // Legacy data:-URL of andere web-URL
    const res = await fetch(pad);
    return res.text();
  }
  return FileSystem.readAsStringAsync(pad);
}

export async function verwijderBestand(pad: string): Promise<void> {
  if (isWeb) {
    if (pad.startsWith(IDB_PAD_PREFIX)) {
      await idbVerwijder(pad.slice(IDB_PAD_PREFIX.length));
      const cached = blobUrlCache.get(pad);
      if (cached) {
        URL.revokeObjectURL(cached);
        blobUrlCache.delete(pad);
      }
    }
    // Verwijder uit alle logische map-indexen (werkt voor idb:// én legacy data:-URLs)
    await verwijderUitMapIndex(pad);
    return;
  }
  await FileSystem.deleteAsync(pad, { idempotent: true });
}

/** Bestandsnaam voor upload-aanvragen; webpaden krijgen een gegenereerde naam. */
export function bestandsnaamVan(pad: string, fallback: string): string {
  if (isWebPad(pad)) return fallback;
  return pad.split("/").pop() ?? fallback;
}

/**
 * Upload een lokaal bestand naar een (presigned) URL. Geeft de HTTP-status
 * terug. Native: FileSystem.uploadAsync; web: blob uit IndexedDB → PUT.
 */
export async function uploadBestandNaarUrl(
  pad: string,
  url: string,
  contentType: string,
): Promise<number> {
  if (isWeb) {
    let blob: Blob;
    if (pad.startsWith(IDB_PAD_PREFIX)) {
      const stored = await idbLees(pad.slice(IDB_PAD_PREFIX.length));
      if (!stored) throw new Error("Bestand niet gevonden in IndexedDB voor upload");
      blob = stored;
    } else {
      // Legacy data:-URL
      blob = await (await fetch(pad)).blob();
    }
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });
    return res.status;
  }
  const resultaat = await FileSystem.uploadAsync(pad, url, {
    httpMethod: "PUT",
    headers: { "Content-Type": contentType },
  });
  return resultaat.status;
}

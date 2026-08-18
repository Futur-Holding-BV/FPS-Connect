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
 * Een "pad" is op web een data:-URL (base64) die als string in AsyncStorage
 * (localStorage) wordt bewaard, gegroepeerd per logische map. Zo overleeft
 * een offline gemaakte foto een herlaad van de pagina, rendert hij direct in
 * <Image source={{ uri: pad }}> en kan de wachtrij hem later uploaden via
 * fetch(pad) → blob → PUT.
 *
 * Bekende webbeperking (bewust, gedocumenteerd in MONTEUR_NU_01): de
 * localStorage-quota is ~5 MB, dus de offline fotobuffer op web is beperkt.
 * Bij een volle opslag geven we een duidelijke fout in plaats van stil falen.
 */

const isWeb = Platform.OS === "web";
const MAP_PREFIX = "fps_webmap_v1:";

export function isWebPad(pad: string): boolean {
  return pad.startsWith("data:");
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

async function uriNaarDataUrl(uri: string): Promise<string> {
  if (uri.startsWith("data:")) return uri;
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`Bestand lezen mislukt (http ${res.status})`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Bestand lezen mislukt"));
    fr.readAsDataURL(blob);
  });
}

/**
 * Bewaart een bron-URI (camera/galerij) lokaal en geeft het lokale pad terug.
 * Native: kopieert naar `${map}${naam}`. Web: zet om naar data:-URL en
 * registreert die in de logische map.
 */
export async function bewaarBestandUitUri(
  bronUri: string,
  map: string,
  naam: string,
): Promise<string> {
  if (isWeb) {
    const dataUrl = await uriNaarDataUrl(bronUri);
    const lijst = await leesMapIndex(map);
    try {
      await schrijfMapIndex(map, [...lijst, dataUrl]);
    } catch {
      throw new Error(
        "Lokale opslag is vol. Maak verbinding zodat wachtende foto's kunnen synchroniseren.",
      );
    }
    return dataUrl;
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
    // Base64 zodat leesTekstBestand symmetrisch kan decoderen.
    const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(tekst)))}`;
    const lijst = await leesMapIndex(map);
    await schrijfMapIndex(map, [...lijst, dataUrl]);
    return dataUrl;
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
  if (isWeb) return isWebPad(pad) && pad.length > "data:".length;
  const info = await FileSystem.getInfoAsync(pad);
  return info.exists;
}

export async function bestandGrootte(pad: string): Promise<number | null> {
  if (isWeb) {
    const komma = pad.indexOf(",");
    if (komma < 0) return null;
    // base64 → bytes (ruwe schatting is voldoende voor de upload-aanvraag)
    return Math.floor(((pad.length - komma - 1) * 3) / 4);
  }
  const info = await FileSystem.getInfoAsync(pad);
  return info.exists && !info.isDirectory ? (info.size ?? null) : null;
}

export async function leesTekstBestand(pad: string): Promise<string> {
  if (isWeb) {
    const res = await fetch(pad);
    return await res.text();
  }
  return FileSystem.readAsStringAsync(pad);
}

export async function verwijderBestand(pad: string): Promise<void> {
  if (isWeb) {
    // Verwijder de data-URL uit alle logische mappen zodat localStorage
    // niet onbeperkt groeit.
    const keys = (await AsyncStorage.getAllKeys()).filter((k) =>
      k.startsWith(MAP_PREFIX),
    );
    for (const key of keys) {
      const map = key.slice(MAP_PREFIX.length);
      const lijst = await leesMapIndex(map);
      if (lijst.includes(pad)) {
        await schrijfMapIndex(map, lijst.filter((p) => p !== pad));
      }
    }
    return;
  }
  await FileSystem.deleteAsync(pad, { idempotent: true });
}

/** Bestandsnaam voor upload-aanvragen; data-URLs krijgen een gegenereerde naam. */
export function bestandsnaamVan(pad: string, fallback: string): string {
  if (isWebPad(pad)) return fallback;
  return pad.split("/").pop() ?? fallback;
}

/**
 * Upload een lokaal bestand naar een (presigned) URL. Geeft de HTTP-status
 * terug. Native: FileSystem.uploadAsync; web: fetch(dataURL) → blob → PUT.
 */
export async function uploadBestandNaarUrl(
  pad: string,
  url: string,
  contentType: string,
): Promise<number> {
  if (isWeb) {
    const blob = await (await fetch(pad)).blob();
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

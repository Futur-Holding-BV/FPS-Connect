import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";

import { useAuth } from "@/context/auth";
import {
  WachtrijItem,
  aantalActief,
  aantalMislukt,
  laadWachtrij,
  verwerkWachtrij,
  wisMislukteItems,
} from "@/lib/syncQueue";
import { verwijderOfflineUren } from "@/lib/offlineCache";

const INTERVAL_MS = 5 * 60 * 1000;

export type SyncStatus =
  | "gesynchroniseerd"
  | "opgeslagen"
  | "synchroniseert"
  | "wacht_op_verbinding"
  | "mislukt";

type SyncContextType = {
  aantalWachtend: number;
  aantalMislukt: number;
  isSyncing: boolean;
  syncStatus: SyncStatus;
  mislukteItems: WachtrijItem[];
  forceerSync: () => Promise<void>;
  herlaadAantal: () => Promise<void>;
  wisMislukte: () => Promise<void>;
};

const SyncContext = createContext<SyncContextType>({
  aantalWachtend: 0,
  aantalMislukt: 0,
  isSyncing: false,
  syncStatus: "gesynchroniseerd",
  mislukteItems: [],
  forceerSync: async () => {},
  herlaadAantal: async () => {},
  wisMislukte: async () => {},
});

async function controleerVerbinding(basis: string): Promise<boolean> {
  try {
    const r = await fetch(`${basis}/api/healthz`, {
      method: "HEAD",
      signal: AbortSignal.timeout(4000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [aantalWachtend, setAantalWachtend] = useState(0);
  const [aantalMisluktState, setAantalMislukt] = useState(0);
  const [mislukteItems, setMislukteItems] = useState<WachtrijItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("gesynchroniseerd");
  const syncRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const basis = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  const herlaadAantal = useCallback(async () => {
    const actief = await aantalActief();
    const mislukt = await aantalMislukt();
    const alleItems = await laadWachtrij();
    const mislukteItemsLijst = alleItems.filter(
      (i) => i.pogingen >= 5,
    );
    setAantalWachtend(actief);
    setAantalMislukt(mislukt);
    setMislukteItems(mislukteItemsLijst);
    if (syncRef.current) return;
    if (mislukt > 0) setSyncStatus("mislukt");
    else if (actief > 0) setSyncStatus("opgeslagen");
    else setSyncStatus("gesynchroniseerd");
  }, []);

  const wisMislukte = useCallback(async () => {
    await wisMislukteItems();
    await herlaadAantal();
  }, [herlaadAantal]);

  // ─── Verwerk één wachtrij-item ─────────────────────────────────────────────
  const verwerkItem = useCallback(
    async (item: WachtrijItem) => {
      if (!token) throw new Error("Niet ingelogd");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      switch (item.type) {
        // ── Bestaand ──────────────────────────────────────────────────────────
        case "create_voorziening": {
          const r = await fetch(`${basis}/api/voorzieningen`, {
            method: "POST",
            headers,
            body: JSON.stringify(item.payload),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          break;
        }
        case "add_foto": {
          const r = await fetch(
            `${basis}/api/voorzieningen/${item.voorzieningId}/fotos`,
            { method: "POST", headers, body: JSON.stringify(item.payload) },
          );
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          break;
        }

        // ── Werkdag-status ─────────────────────────────────────────────────────
        case "patch_werkdag_status": {
          const r = await fetch(
            `${basis}/api/werkdag/${item.werkdagId}`,
            {
              method: "PATCH",
              headers,
              body: JSON.stringify({ uitvoering_status: item.nieuweStatus }),
            },
          );
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          break;
        }

        // ── Voorziening patchen ────────────────────────────────────────────────
        case "patch_voorziening": {
          const r = await fetch(
            `${basis}/api/voorzieningen/${item.voorzieningId}`,
            {
              method: "PATCH",
              headers,
              body: JSON.stringify(item.velden),
            },
          );
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          break;
        }

        // ── Opname-item patchen ────────────────────────────────────────────────
        case "patch_opname_item": {
          const r = await fetch(
            `${basis}/api/opname/items/${item.itemId}`,
            {
              method: "PATCH",
              headers,
              body: JSON.stringify(item.velden),
            },
          );
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          break;
        }

        // ── Foto lokaal uploaden ───────────────────────────────────────────────
        case "upload_foto_lokaal": {
          const fileInfo = await FileSystem.getInfoAsync(item.lokaalPad);
          if (!fileInfo.exists) {
            // Bestand niet meer beschikbaar (bijv. gewist) — stil doorgaan
            break;
          }

          const naam = item.lokaalPad.split("/").pop() ?? "foto.jpg";
          const urlResp = await fetch(
            `${basis}/api/opname/items/${item.itemId}/fotos/upload-url`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                bestandsnaam: naam,
                content_type: "image/jpeg",
              }),
            },
          );
          if (!urlResp.ok) throw new Error(`Upload-URL HTTP ${urlResp.status}`);
          const { upload_url } = (await urlResp.json()) as {
            upload_url: string;
          };

          const uploadResult = await FileSystem.uploadAsync(
            item.lokaalPad,
            upload_url,
            {
              httpMethod: "PUT",
              headers: { "Content-Type": "image/jpeg" },
            },
          );
          if (uploadResult.status >= 400) {
            throw new Error(`Upload HTTP ${uploadResult.status}`);
          }
          break;
        }

        // ── Uren aanmaken ──────────────────────────────────────────────────────
        case "create_uren": {
          const r = await fetch(`${basis}/api/uren`, {
            method: "POST",
            headers,
            body: JSON.stringify(item.payload),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          // Verwijder de lokale kopie na succesvolle sync
          await verwijderOfflineUren(item.lokaalId);
          break;
        }

        // ── Uren bijwerken ─────────────────────────────────────────────────────
        case "update_uren": {
          const r = await fetch(`${basis}/api/uren/${item.urenId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(item.velden),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          break;
        }

        // ── Uren verwijderen ───────────────────────────────────────────────────
        case "delete_uren": {
          const r = await fetch(`${basis}/api/uren/${item.urenId}`, {
            method: "DELETE",
            headers,
          });
          // 404 is acceptabel (al verwijderd)
          if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`);
          break;
        }

        // ── Handtekening uploaden ──────────────────────────────────────────────
        case "create_handtekening": {
          const fileInfo = await FileSystem.getInfoAsync(item.lokaalPad);
          if (!fileInfo.exists) break; // Bestand weg — stil doorgaan

          const svgContent = await FileSystem.readAsStringAsync(item.lokaalPad);
          const r = await fetch(
            `${basis}/api/werkdag/${item.werkdagId}/handtekening`,
            {
              method: "PATCH",
              headers,
              body: JSON.stringify({
                svg_data: svgContent,
                positie: item.positie,
              }),
            },
          );
          // 404/501 = endpoint nog niet beschikbaar — lokaal geslaagd, sync later
          if (!r.ok && r.status !== 404 && r.status !== 501) {
            throw new Error(`HTTP ${r.status}`);
          }
          break;
        }

        // ── PIM uitvoeringsstap voltooien ─────────────────────────────────────
        case "voltooi_pim_stap": {
          // 1. Upload offline genomen foto's (lokale file:// URI's)
          const extraFotoUrls: string[] = [];
          for (const lokaalPad of item.lokale_foto_paden ?? []) {
            const fileInfo = await FileSystem.getInfoAsync(lokaalPad);
            if (!fileInfo.exists) continue; // bestand gewist — overslaan

            const naam = lokaalPad.split("/").pop() ?? `pim_foto_${Date.now()}.jpg`;

            // Vraag presigned upload-URL aan
            const urlResp = await fetch(`${basis}/api/storage/uploads/request-url`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                name: naam,
                size: fileInfo.size ?? 1,
                contentType: "image/jpeg",
                bestand_type: "foto",
              }),
            });
            if (!urlResp.ok) throw new Error(`Upload-URL HTTP ${urlResp.status}`);
            const { uploadURL, objectPath } = (await urlResp.json()) as {
              uploadURL: string;
              objectPath: string;
            };

            // Upload bestand via presigned URL
            const uploadResult = await FileSystem.uploadAsync(lokaalPad, uploadURL, {
              httpMethod: "PUT",
              headers: { "Content-Type": "image/jpeg" },
            });
            if (uploadResult.status >= 300) {
              throw new Error(`Foto-upload HTTP ${uploadResult.status}`);
            }
            extraFotoUrls.push(objectPath);
          }

          // 2. Samenstellen definitieve payload (inclusief offline geüploade foto's)
          const definitiefPayload = {
            ...item.payload,
            foto_urls: [
              ...(item.payload.foto_urls ?? []),
              ...extraFotoUrls,
            ],
          };

          // 3. Stap voltooien
          const r = await fetch(
            `${basis}/api/opdrachten/${item.opdrachtId}/pim/uitvoering/stap/${item.stapId}/voltooien`,
            { method: "POST", headers, body: JSON.stringify(definitiefPayload) },
          );
          // 409 = stap al voltooid door een ander (conflict) — stil doorgaan
          if (!r.ok && r.status !== 409) throw new Error(`HTTP ${r.status}`);

          // 4. Cache invalideren zodat de monteur niet een verouderde stap ziet
          await AsyncStorage.removeItem(
            `pim_stap_${item.opdrachtId}_v1`,
          ).catch(() => undefined);
          break;
        }

        default:
          // Onbekend type — verwijder uit queue zodat het niet eindeloos retried
          break;
      }
    },
    [token, basis],
  );

  // ─── Hoofd sync-functie ────────────────────────────────────────────────────
  const forceerSync = useCallback(async () => {
    if (syncRef.current || !token) return;

    const online = await controleerVerbinding(basis);
    if (!online) {
      const n = await aantalActief();
      setAantalWachtend(n);
      if (n > 0) setSyncStatus("wacht_op_verbinding");
      return;
    }

    syncRef.current = true;
    setIsSyncing(true);
    setSyncStatus("synchroniseert");

    try {
      const { verwerkt } = await verwerkWachtrij(verwerkItem);
      if (verwerkt > 0) queryClient.invalidateQueries();
    } finally {
      syncRef.current = false;
      setIsSyncing(false);
      await herlaadAantal();
    }
  }, [token, basis, verwerkItem, queryClient, herlaadAantal]);

  // ─── 5-minuten interval + foreground sync ─────────────────────────────────
  useEffect(() => {
    void herlaadAantal();
    if (!token) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      void forceerSync();
    }, INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token, forceerSync, herlaadAantal]);

  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      (status: AppStateStatus) => {
        if (status === "active") void forceerSync();
      },
    );
    return () => sub.remove();
  }, [forceerSync]);

  return (
    <SyncContext.Provider
      value={{
        aantalWachtend,
        aantalMislukt: aantalMisluktState,
        isSyncing,
        syncStatus,
        mislukteItems,
        forceerSync,
        herlaadAantal,
        wisMislukte,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}

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
  aantalWachtrij,
  verwerkWachtrij,
} from "@/lib/syncQueue";

const INTERVAL_MS = 5 * 60 * 1000;

export type SyncStatus =
  | "gesynchroniseerd"
  | "opgeslagen"
  | "synchroniseert"
  | "wacht_op_verbinding";

type SyncContextType = {
  aantalWachtend: number;
  isSyncing: boolean;
  syncStatus: SyncStatus;
  forceerSync: () => Promise<void>;
  herlaadAantal: () => Promise<void>;
};

const SyncContext = createContext<SyncContextType>({
  aantalWachtend: 0,
  isSyncing: false,
  syncStatus: "gesynchroniseerd",
  forceerSync: async () => {},
  herlaadAantal: async () => {},
});

async function controleerVerbinding(basis: string): Promise<boolean> {
  try {
    const r = await fetch(`${basis}/api/healthz`, {
      method: "HEAD",
      // Korte timeout via AbortController
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("gesynchroniseerd");
  const syncRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const basis = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  const herlaadAantal = useCallback(async () => {
    const n = await aantalWachtrij();
    setAantalWachtend(n);
    if (n === 0) setSyncStatus("gesynchroniseerd");
    else if (!syncRef.current) setSyncStatus("opgeslagen");
  }, []);

  const verwerkItem = useCallback(
    async (item: WachtrijItem) => {
      if (!token) throw new Error("Niet ingelogd");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      if (item.type === "create_voorziening") {
        const r = await fetch(`${basis}/api/voorzieningen`, {
          method: "POST",
          headers,
          body: JSON.stringify(item.payload),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      } else if (item.type === "add_foto") {
        const r = await fetch(
          `${basis}/api/voorzieningen/${item.voorzieningId}/fotos`,
          { method: "POST", headers, body: JSON.stringify(item.payload) },
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      }
    },
    [token, basis],
  );

  const forceerSync = useCallback(async () => {
    if (syncRef.current || !token) return;

    // Controleer verbinding vóór sync
    const online = await controleerVerbinding(basis);
    if (!online) {
      const n = await aantalWachtrij();
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

  useEffect(() => {
    herlaadAantal();
    if (!token) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    // 5-minuten vangnet
    intervalRef.current = setInterval(() => forceerSync(), INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token, forceerSync, herlaadAantal]);

  // Sync bij terugkeer naar voorgrond
  useEffect(() => {
    const sub = AppState.addEventListener("change", (status: AppStateStatus) => {
      if (status === "active") forceerSync();
    });
    return () => sub.remove();
  }, [forceerSync]);

  return (
    <SyncContext.Provider
      value={{ aantalWachtend, isSyncing, syncStatus, forceerSync, herlaadAantal }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}

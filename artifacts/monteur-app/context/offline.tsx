import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";

import { getHuidigToken } from "@/context/auth";
import {
  leesMeta,
  leesPlanning,
  leesVoorzieningen,
  leesWerkorder,
  leesWerkorders,
  slaPlanningOp,
  slaVoorzieningenOp,
  slaWerkorderOp,
  slaWerkordersOp,
} from "@/lib/offlineCache";

// ─── Configuratie ─────────────────────────────────────────────────────────────
const PING_INTERVAL_MS = 30 * 1000;
const basis = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

async function ping(): Promise<boolean> {
  try {
    const r = await fetch(`${basis}/api/healthz`, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ─── Context type ─────────────────────────────────────────────────────────────
type OfflineContextType = {
  isOnline: boolean;
  isDownloading: boolean;
  gecachedOp: string | null;
  downloadVandaag: () => Promise<void>;
  // Cache-lees helpers (direct doorgestuurd vanuit offlineCache)
  getCachedPlanning: () => Promise<unknown[] | null>;
  getCachedWerkorders: () => Promise<unknown[] | null>;
  getCachedWerkorder: (id: number) => Promise<unknown | null>;
  getCachedVoorzieningen: (gebouwId: number) => Promise<unknown[] | null>;
};

const OfflineContext = createContext<OfflineContextType>({
  isOnline: true,
  isDownloading: false,
  gecachedOp: null,
  downloadVandaag: async () => {},
  getCachedPlanning: async () => null,
  getCachedWerkorders: async () => null,
  getCachedWerkorder: async () => null,
  getCachedVoorzieningen: async () => null,
});

// ─── Provider ────────────────────────────────────────────────────────────────
export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [gecachedOp, setGecachedOp] = useState<string | null>(null);

  // Laad cache-tijdstip bij start
  useEffect(() => {
    void leesMeta().then((meta) => {
      if (meta) setGecachedOp(meta.gecachedOp);
    });
  }, []);

  // Connectivity polling
  const controleer = useCallback(async () => {
    const online = await ping();
    setIsOnline(online);
  }, []);

  useEffect(() => {
    void controleer();
    const timer = setInterval(() => {
      void controleer();
    }, PING_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [controleer]);

  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      (status: AppStateStatus) => {
        if (status === "active") void controleer();
      },
    );
    return () => sub.remove();
  }, [controleer]);

  // ─── Download dagplanning voor offline gebruik ──────────────────────────────
  const downloadVandaag = useCallback(async () => {
    const token = getHuidigToken();
    if (!token) return;

    setIsDownloading(true);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      // 1. Dagplanning (MijnWerkGebouw[])
      try {
        const planningResp = await fetch(`${basis}/api/mijn-werk`, { headers });
        if (planningResp.ok) {
          const planning = (await planningResp.json()) as unknown[];
          await slaPlanningOp(planning); // slaMetaOp wordt intern aangeroepen

          // 3. Voorzieningen per gebouw
          for (const gebouw of planning) {
            const g = gebouw as Record<string, unknown>;
            const gebouwId = g.gebouw_id as number | undefined;
            if (!gebouwId) continue;
            try {
              const vResp = await fetch(
                `${basis}/api/voorzieningen?gebouwId=${gebouwId}&limiet=500`,
                { headers },
              );
              if (vResp.ok) {
                const vData = (await vResp.json()) as
                  | { items?: unknown[] }
                  | unknown[];
                const items = Array.isArray(vData)
                  ? vData
                  : (vData as { items?: unknown[] }).items ?? [];
                await slaVoorzieningenOp(gebouwId, items);
              }
            } catch {
              // Skip individueel gebouw bij fout
            }
          }
        }
      } catch {
        // Planning ophalen mislukt — ga verder met rest
      }

      // 2. Werkorders van vandaag (WerkdagItem[])
      try {
        const wResp = await fetch(`${basis}/api/werkdag/vandaag`, { headers });
        if (wResp.ok) {
          const werkorders = (await wResp.json()) as unknown[];
          await slaWerkordersOp(werkorders);

          // Detail per werkorder
          for (const wo of werkorders) {
            const item = wo as Record<string, unknown>;
            const id = item.id as number | undefined;
            if (!id) continue;
            try {
              const detailResp = await fetch(`${basis}/api/werkdag/${id}`, {
                headers,
              });
              if (detailResp.ok) {
                const detail = (await detailResp.json()) as unknown;
                await slaWerkorderOp(id, detail);
              }
            } catch {
              // Skip individueel werkorder bij fout
            }
          }
        }
      } catch {
        // Werkorders ophalen mislukt
      }

      // Bijwerk gecachedOp state
      const meta = await leesMeta();
      if (meta) setGecachedOp(meta.gecachedOp);
    } finally {
      setIsDownloading(false);
    }
  }, []);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isDownloading,
        gecachedOp,
        downloadVandaag,
        getCachedPlanning: leesPlanning,
        getCachedWerkorders: leesWerkorders,
        getCachedWerkorder: leesWerkorder,
        getCachedVoorzieningen: leesVoorzieningen,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}

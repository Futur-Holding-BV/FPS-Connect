import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from "react";
import { useRol } from "@/context/rol-context";
import { useAuth } from "@/context/auth-context";

export interface AssistentCitatie {
  label: string;
  bron: string;
  entiteitstype?: string | null;
  entiteit_id?: number | null;
  href?: string | null;
}

export interface AssistentBericht {
  rol: "gebruiker" | "assistent";
  inhoud: string;
  citaties?: AssistentCitatie[];
}

export type DockTab = "werkbak" | "assistent" | "actiepunten";

const OPSLAG_OPEN = "fps.zijrand.open";
const OPSLAG_TAB = "fps.zijrand.tab";

function leesOpen(): boolean {
  try { return localStorage.getItem(OPSLAG_OPEN) === "1"; } catch { return false; }
}
function leesTab(): DockTab {
  try { const t = localStorage.getItem(OPSLAG_TAB); return t === "werkbak" || t === "actiepunten" ? t : "assistent"; } catch { return "assistent"; }
}

interface AssistentStateWaarde {
  contextKey: string;
  autorisatieContext: string | null;
  setAutorisatieContext: React.Dispatch<React.SetStateAction<string | null>>;
  berichten: AssistentBericht[];
  setBerichten: React.Dispatch<React.SetStateAction<AssistentBericht[]>>;
  invoer: string;
  setInvoer: React.Dispatch<React.SetStateAction<string>>;
  bezig: boolean;
  setBezig: React.Dispatch<React.SetStateAction<boolean>>;
  signalen: string[];
  setSignalen: React.Dispatch<React.SetStateAction<string[]>>;
  
  isDockOpen: boolean;
  setIsDockOpen: (b: boolean) => void;
  dockTab: DockTab;
  setDockTab: (t: DockTab) => void;
  
  openVoorVraag: (vraag?: string) => void;
  registreerListener: (listener: (vraag?: string) => void) => () => void;
}

const AssistentStateContext = createContext<AssistentStateWaarde | null>(null);

export function AssistentStateProvider({ children }: { children: ReactNode }) {
  const { gebruiker } = useAuth();
  const { persoon, rol, bevoegdheden } = useRol();
  
  // Real authenticated user ID + effective person ID + effective role
  const bevoegdhedenKey = Object.entries(bevoegdheden)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, niveau]) => `${module}:${niveau}`)
    .join(",");
  const contextKey = `auth-${gebruiker?.id ?? 0}-eff-${persoon?.id ?? 0}-rol-${rol}-bev-${bevoegdhedenKey}`;

  const [autorisatieContext, setAutorisatieContext] = useState<string | null>(null);
  const [berichten, setBerichten] = useState<AssistentBericht[]>([]);
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const [signalen, setSignalen] = useState<string[]>([]);
  
  const [isDockOpen, setDockOpenState] = useState<boolean>(leesOpen);
  const [dockTab, setDockTabState] = useState<DockTab>(leesTab);

  // Sync to localStorage
  useEffect(() => {
    try { localStorage.setItem(OPSLAG_OPEN, isDockOpen ? "1" : "0"); } catch { /* ignore */ }
  }, [isDockOpen]);
  useEffect(() => {
    try { localStorage.setItem(OPSLAG_TAB, dockTab); } catch { /* ignore */ }
  }, [dockTab]);

  // Reset conversation when effective role/user changes
  useEffect(() => {
    setBerichten([]);
    setInvoer("");
    setBezig(false);
    setSignalen([]);
    setAutorisatieContext(null);
  }, [contextKey]);

  const queuedVraagRef = useRef<string | undefined>(undefined);
  const listenersRef = useRef<((vraag?: string) => void)[]>([]);

  const openVoorVraag = useCallback((vraag?: string) => {
    setDockOpenState(true);
    setDockTabState("assistent");
    
    if (vraag) {
      if (listenersRef.current.length > 0) {
        listenersRef.current[listenersRef.current.length - 1](vraag);
      } else {
        queuedVraagRef.current = vraag;
      }
    }
  }, []);

  const registreerListener = useCallback((listener: (vraag?: string) => void) => {
    listenersRef.current.push(listener);
    if (queuedVraagRef.current) {
      listener(queuedVraagRef.current);
      queuedVraagRef.current = undefined;
    }
    return () => {
      listenersRef.current = listenersRef.current.filter((l) => l !== listener);
    };
  }, []);

  const waarde = {
    contextKey,
    autorisatieContext, setAutorisatieContext,
    berichten, setBerichten,
    invoer, setInvoer,
    bezig, setBezig,
    signalen, setSignalen,
    isDockOpen, setIsDockOpen: setDockOpenState,
    dockTab, setDockTab: setDockTabState,
    openVoorVraag,
    registreerListener
  };

  return <AssistentStateContext.Provider value={waarde}>{children}</AssistentStateContext.Provider>;
}

export function useAssistentState() {
  const ctx = useContext(AssistentStateContext);
  if (!ctx) throw new Error("useAssistentState must be used binnen AssistentStateProvider");
  return ctx;
}

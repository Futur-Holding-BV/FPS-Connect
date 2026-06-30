import { createContext, useContext, useEffect, useState, ReactNode } from "react";

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

export type Thema         = "licht" | "donker" | "systeem";
export type Kleurthema    = "standaard" | "marine" | "leisteen" | "natuur";
export type Lettergrootte = "klein" | "normaal" | "groot" | "extra-groot";
export type Dichtheid     = "compact" | "normaal" | "ruim";

export interface WeergaveVoorkeuren {
  thema:         Thema;
  kleurthema:    Kleurthema;
  lettergrootte: Lettergrootte;
  dichtheid:     Dichtheid;
  helderheid:    number; // 50–100
  toonPaginaHulp: boolean;
}

// ═══════════════════════════════════════════════════════════
// Constanten
// ═══════════════════════════════════════════════════════════

export const STANDAARD_VOORKEUREN: WeergaveVoorkeuren = {
  thema:         "licht",
  kleurthema:    "standaard",
  lettergrootte: "normaal",
  dichtheid:     "normaal",
  helderheid:    100,
  toonPaginaHulp: true,
};

const FONT_GROOTTE: Record<Lettergrootte, string> = {
  klein:        "13px",
  normaal:      "16px",
  groot:        "18px",
  "extra-groot":"20px",
};

const DICHTHEID_ZOOM: Record<Dichtheid, string> = {
  compact: "0.88",
  normaal: "1",
  ruim:    "1.1",
};

export const KLEUR_THEMAS: Record<Kleurthema, {
  label: string;
  primary: string;
  sidebar: string;
  sidebarAccent: string;
  ring: string;
  sidebarPrimary: string;
}> = {
  standaard: {
    label:          "FPS Rood",
    primary:        "12 90% 50%",
    sidebar:        "220 20% 16%",
    sidebarAccent:  "12 80% 22%",
    ring:           "12 90% 50%",
    sidebarPrimary: "12 90% 50%",
  },
  marine: {
    label:          "Marine blauw",
    primary:        "213 90% 48%",
    sidebar:        "213 35% 18%",
    sidebarAccent:  "213 50% 26%",
    ring:           "213 90% 48%",
    sidebarPrimary: "213 90% 65%",
  },
  leisteen: {
    label:          "Leisteen",
    primary:        "215 65% 52%",
    sidebar:        "220 25% 18%",
    sidebarAccent:  "215 38% 28%",
    ring:           "215 65% 52%",
    sidebarPrimary: "215 65% 65%",
  },
  natuur: {
    label:          "Groen",
    primary:        "142 70% 38%",
    sidebar:        "142 28% 16%",
    sidebarAccent:  "142 42% 24%",
    ring:           "142 70% 38%",
    sidebarPrimary: "142 70% 55%",
  },
};

// ═══════════════════════════════════════════════════════════
// CSS-toepassers
// ═══════════════════════════════════════════════════════════

function pasThemaToe(thema: Thema) {
  const isDonker =
    thema === "donker" ||
    (thema === "systeem" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDonker);
}

function pasKleurthemaToe(kt: Kleurthema) {
  const t = KLEUR_THEMAS[kt];
  const el = document.documentElement;
  el.style.setProperty("--primary",                t.primary);
  el.style.setProperty("--ring",                   t.ring);
  el.style.setProperty("--sidebar",               t.sidebar);
  el.style.setProperty("--sidebar-primary",        t.sidebarPrimary);
  el.style.setProperty("--sidebar-accent",         t.sidebarAccent);
  el.style.setProperty("--sidebar-ring",           t.ring);
  el.style.setProperty("--sidebar-border",         t.sidebar.replace(/\d+%$/, m => `${Math.max(0, parseInt(m) - 4)}%`));
}

function pasLettergrootteToe(lg: Lettergrootte) {
  document.documentElement.style.fontSize = FONT_GROOTTE[lg];
}

function pasDichtheidToe(d: Dichtheid) {
  (document.body.style as unknown as Record<string, string>).zoom = DICHTHEID_ZOOM[d];
}

function pasHelderheidToe(h: number) {
  const root = document.getElementById("root");
  if (root) root.style.filter = h < 100 ? `brightness(${h}%)` : "";
}

// ═══════════════════════════════════════════════════════════
// Context
// ═══════════════════════════════════════════════════════════

interface WeergaveContextType {
  voorkeuren:          WeergaveVoorkeuren;
  setThema:            (v: Thema) => void;
  setKleurthema:       (v: Kleurthema) => void;
  setLettergrootte:    (v: Lettergrootte) => void;
  setDichtheid:        (v: Dichtheid) => void;
  setHelderheid:       (v: number) => void;
  setToonPaginaHulp:   (v: boolean) => void;
  resetAlles:          () => void;
}

const WeergaveContext = createContext<WeergaveContextType | null>(null);

function laadVoorkeuren(): WeergaveVoorkeuren {
  try {
    const raw = localStorage.getItem("fps.weergave");
    if (raw) {
      const opgeslagen = JSON.parse(raw) as Partial<WeergaveVoorkeuren>;
      // Migreer "systeem" naar "licht": de app gebruikt altijd lichtmodus als standaard
      if (opgeslagen.thema === "systeem") opgeslagen.thema = "licht";
      return { ...STANDAARD_VOORKEUREN, ...opgeslagen };
    }
  } catch { /* negeer */ }
  return { ...STANDAARD_VOORKEUREN };
}

export function WeergaveProvider({ children }: { children: ReactNode }) {
  const [voorkeuren, setVoorkeuren] = useState<WeergaveVoorkeuren>(laadVoorkeuren);

  // Pas alle voorkeuren toe bij elke wijziging + bij mount
  useEffect(() => {
    pasThemaToe(voorkeuren.thema);
    pasKleurthemaToe(voorkeuren.kleurthema);
    pasLettergrootteToe(voorkeuren.lettergrootte);
    pasDichtheidToe(voorkeuren.dichtheid);
    pasHelderheidToe(voorkeuren.helderheid);
    try { localStorage.setItem("fps.weergave", JSON.stringify(voorkeuren)); } catch { /* negeer */ }
  }, [voorkeuren]);

  // Luister naar systeemthema-wijzigingen
  useEffect(() => {
    if (voorkeuren.thema !== "systeem") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => pasThemaToe("systeem");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [voorkeuren.thema]);

  function update(partial: Partial<WeergaveVoorkeuren>) {
    setVoorkeuren(prev => ({ ...prev, ...partial }));
  }

  return (
    <WeergaveContext.Provider value={{
      voorkeuren,
      setThema:            (v) => update({ thema: v }),
      setKleurthema:       (v) => update({ kleurthema: v }),
      setLettergrootte:    (v) => update({ lettergrootte: v }),
      setDichtheid:        (v) => update({ dichtheid: v }),
      setHelderheid:       (v) => update({ helderheid: v }),
      setToonPaginaHulp:   (v) => update({ toonPaginaHulp: v }),
      resetAlles:          () => setVoorkeuren({ ...STANDAARD_VOORKEUREN }),
    }}>
      {children}
    </WeergaveContext.Provider>
  );
}

export function useWeergave(): WeergaveContextType {
  const ctx = useContext(WeergaveContext);
  if (!ctx) throw new Error("useWeergave moet binnen WeergaveProvider gebruikt worden");
  return ctx;
}

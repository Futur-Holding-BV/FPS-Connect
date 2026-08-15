import { useEffect } from "react";
import { useListOnlineGebruikers } from "@workspace/api-client-react";
import { useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";



// ── Initialen-kleur op basis van naam-hash ────────────────
const PALET = [
  "#C0392B", // donkerrood
  "#1F618D", // marine blauw
  "#1E8449", // donkergroen
  "#6C3483", // paars
  "#D35400", // oranje
  "#0E6655", // teal
  "#7D6608", // goudgeel
  "#154360", // indigo
];

function naamKleur(naam: string): string {
  let h = 0;
  for (let i = 0; i < naam.length; i++) {
    h = naam.charCodeAt(i) + ((h << 5) - h);
  }
  return PALET[Math.abs(h) % PALET.length]!;
}

// ── Rol-label ─────────────────────────────────────────────
const ROL_LABELS: Record<string, string> = {
  hoofdbeheerder: "Beheerder",
  gebruiker:       "Gebruiker",
};

// ═══════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════

function OnlineGebruikersInner() {
  const { state: sidebarState } = useSidebar();

  const { data, refetch } = useListOnlineGebruikers();

  // Poll elke 45 seconden (setInterval + refetch, i.p.v. refetchInterval om TS2741 te vermijden)
  useEffect(() => {
    const id = setInterval(() => { refetch().catch(() => {}); }, 45_000);
    return () => clearInterval(id);
  }, [refetch]);

  // Niemand online (buiten jezelf)
  if (!data || data.length === 0) return null;

  // Ingeklapte sidebar: toon alleen een compact groen puntje
  if (sidebarState === "collapsed") {
    return (
      <div className="flex items-center justify-center py-2">
        <div
          className="h-2 w-2 rounded-full bg-emerald-400"
          title={`${data.length} ${data.length === 1 ? "collega" : "collega's"} online`}
        />
      </div>
    );
  }

  const MAX = 5;
  const zichtbaar = data.slice(0, MAX);
  const rest      = data.length - MAX;

  return (
    <div className="px-3 pb-2 pt-1">
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <p className="text-[10px] text-sidebar-foreground/50 uppercase tracking-wide font-medium select-none">
          {data.length === 1
            ? "1 collega online"
            : `${data.length} collega's online`}
        </p>
      </div>

      <div className="flex items-center gap-1">
        {zichtbaar.map((g, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white ring-1 ring-black/20 shrink-0 cursor-default select-none"
                style={{ backgroundColor: naamKleur(g.naam) }}
              >
                {g.initialen}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex flex-col gap-0.5">
              <span className="font-medium">{g.naam}</span>
              <span className="text-xs text-muted-foreground">
                {ROL_LABELS[g.rol] ?? g.rol}
              </span>
            </TooltipContent>
          </Tooltip>
        ))}

        {rest > 0 && (
          <div className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-black/20 shrink-0 select-none">
            +{rest}
          </div>
        )}
      </div>
    </div>
  );
}

export function OnlineGebruikers() {
  return <OnlineGebruikersInner />;
}

// ═══════════════════════════════════════════════════════════
// Compacte taakbalk-variant (onderin de schermrand)
// ═══════════════════════════════════════════════════════════

function OnlineGebruikersTaakbalkInner() {
  const { data, refetch } = useListOnlineGebruikers();

  useEffect(() => {
    const id = setInterval(() => { refetch().catch(() => {}); }, 45_000);
    return () => clearInterval(id);
  }, [refetch]);

  if (!data || data.length === 0) return null;

  const MAX = 4;
  const zichtbaar = data.slice(0, MAX);
  const rest      = data.length - MAX;

  return (
    <div className="flex-shrink-0 flex items-center gap-2 pl-3 border-l border-border">
      <div className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
      <div className="flex items-center gap-1">
        {zichtbaar.map((g, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white ring-1 ring-black/10 shrink-0 cursor-default select-none"
                style={{ backgroundColor: naamKleur(g.naam) }}
              >
                {g.initialen}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex flex-col gap-0.5">
              <span className="font-medium">{g.naam}</span>
              <span className="text-xs text-muted-foreground">
                {ROL_LABELS[g.rol] ?? g.rol}
              </span>
            </TooltipContent>
          </Tooltip>
        ))}
        {rest > 0 && (
          <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold bg-muted text-muted-foreground ring-1 ring-black/10 shrink-0 select-none">
            +{rest}
          </div>
        )}
      </div>
    </div>
  );
}

export function OnlineGebruikersTaakbalk() {
  return <OnlineGebruikersTaakbalkInner />;
}

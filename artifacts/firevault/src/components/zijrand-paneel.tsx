// ASSISTENT_01 §3 — één gedeelde rechterrand met twee tabbladen: Werkbak en
// Assistent. Vast in-/uitklapbaar element; de ingeklapte stand wordt onthouden
// (localStorage). Op de telefoon is de assistent een eigen scherm (/assistent),
// geen zwevend venster over de inhoud heen.
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Inbox, Bot, X, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { WerkbakInhoud, useWerkbakAantal } from "@/components/werkbak-paneel";
import { AssistentInhoud } from "@/components/assistent-inhoud";
import { ActiepuntenInhoud } from "@/components/actiepunten-inhoud";
import { useAuth } from "@/context/auth-context";

type ZijrandTab = "werkbak" | "assistent" | "actiepunten";

const OPSLAG_OPEN = "fps.zijrand.open";
const OPSLAG_TAB = "fps.zijrand.tab";

function leesOpen(): boolean {
  try { return localStorage.getItem(OPSLAG_OPEN) === "1"; } catch { return false; }
}
function leesTab(): ZijrandTab {
  try { const t = localStorage.getItem(OPSLAG_TAB); return t === "werkbak" || t === "actiepunten" ? t : "assistent"; } catch { return "assistent"; }
}

/**
 * Knoppen voor de topbalk + het (altijd gemounte, verborgen bij dicht) paneel.
 * Gemount houden bewaart het assistent-gesprek bij dicht-/openklappen.
 */
export function ZijrandKnoppen({ metWerkbak = false, zonderPaneel = false }: { metWerkbak?: boolean; zonderPaneel?: boolean }) {
  const [, navigeer] = useLocation();
  const [open, setOpen] = useState<boolean>(leesOpen);
  const [tab, setTab] = useState<ZijrandTab>(metWerkbak ? leesTab : () => "assistent");
  const werkbakAantal = useWerkbakAantal();
  const { gebruiker } = useAuth();
  const isHoofdbeheerder = gebruiker?.rol === "hoofdbeheerder";

  useEffect(() => {
    try { localStorage.setItem(OPSLAG_OPEN, open ? "1" : "0"); } catch { /* privé-modus */ }
  }, [open]);
  useEffect(() => {
    try { localStorage.setItem(OPSLAG_TAB, tab); } catch { /* privé-modus */ }
  }, [tab]);

  const isMobiel = (): boolean => typeof window !== "undefined" && window.innerWidth < 640;

  // Krimpt het venster naar telefoonformaat terwijl het paneel open staat,
  // dan sluit het paneel — op mobiel is de assistent een eigen scherm.
  useEffect(() => {
    const bijResize = () => { if (window.innerWidth < 640) setOpen(false); };
    window.addEventListener("resize", bijResize);
    return () => window.removeEventListener("resize", bijResize);
  }, []);

  const openTab = useCallback((gewenst: ZijrandTab) => {
    if (gewenst === "assistent" && (isMobiel() || zonderPaneel)) {
      // Telefoon: eigen scherm, geen zwevend venster (ASSISTENT_01 §3)
      navigeer("/assistent");
      return;
    }
    setOpen((was) => (was && tab === gewenst ? false : true));
    setTab(gewenst);
  }, [navigeer, tab, zonderPaneel]);

  return (
    <>
      {metWerkbak && (
        <Button
          variant="ghost"
          size="sm"
          className="relative h-8 px-2"
          title="Werkbak openen"
          onClick={() => openTab("werkbak")}
          data-testid="knop-werkbak"
        >
          <Inbox className="h-4 w-4" />
          {werkbakAantal > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 rounded-full bg-primary text-primary-foreground text-[10px] leading-4 text-center"
              data-testid="badge-werkbak-aantal"
            >
              {werkbakAantal > 99 ? "99+" : werkbakAantal}
            </span>
          )}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        title="Assistent openen"
        onClick={() => openTab("assistent")}
        data-testid="knop-assistent"
      >
        <Bot className="h-4 w-4" />
      </Button>

      {/* Paneel: altijd gemount zodat het gesprek bewaard blijft; verborgen bij dicht */}
      {!zonderPaneel && <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-background border-l border-border shadow-xl flex-col",
          open ? "flex" : "hidden",
        )}
        data-testid="paneel-zijrand"
      >
        <div className="flex items-center gap-1 px-2 py-2 border-b border-border">
          {metWerkbak && (
            <button
              type="button"
              onClick={() => setTab("werkbak")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium",
                tab === "werkbak" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              data-testid="tab-zijrand-werkbak"
            >
              <Inbox className="h-3.5 w-3.5" /> Werkbak
              {werkbakAantal > 0 && <span className="text-[10px] rounded-full bg-primary text-primary-foreground min-w-4 h-4 px-1 leading-4">{werkbakAantal > 99 ? "99+" : werkbakAantal}</span>}
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab("assistent")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium",
              tab === "assistent" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="tab-zijrand-assistent"
          >
            <Bot className="h-3.5 w-3.5" /> Assistent
          </button>
          {metWerkbak && isHoofdbeheerder && (
            <button
              type="button"
              onClick={() => setTab("actiepunten")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium",
                tab === "actiepunten" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              data-testid="tab-zijrand-actiepunten"
            >
              <ListTodo className="h-3.5 w-3.5" /> Actiepunten
            </button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 w-7 p-0"
            onClick={() => setOpen(false)}
            title="Sluiten"
            data-testid="knop-zijrand-sluiten"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {metWerkbak && (
          <div className={cn("flex-1 min-h-0 flex-col", tab === "werkbak" && open ? "flex" : "hidden")}>
            <WerkbakInhoud onNavigeer={() => setOpen(false)} actief={open && tab === "werkbak"} />
          </div>
        )}
        <div className={cn("flex-1 min-h-0 flex-col", tab === "assistent" ? "flex" : "hidden")}>
          <AssistentInhoud />
        </div>
        {metWerkbak && isHoofdbeheerder && tab === "actiepunten" && (
          <div className="flex-1 min-h-0 flex flex-col">
            <ActiepuntenInhoud />
          </div>
        )}
      </div>}
    </>
  );
}

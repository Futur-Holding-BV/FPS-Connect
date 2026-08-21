// ASSISTENT_01 §3 — één gedeelde rechterrand met twee tabbladen: Werkbak en
// Assistent. Vast in-/uitklapbaar element; de ingeklapte stand wordt onthouden
// (localStorage). Op de telefoon is de assistent een eigen scherm (/assistent),
// geen zwevend venster over de inhoud heen.
import { useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Inbox, Bot, X, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { WerkbakInhoud, useWerkbakAantal } from "@/components/werkbak-paneel";
import { AssistentInhoud } from "@/components/assistent-inhoud";
import { ActiepuntenInhoud } from "@/components/actiepunten-inhoud";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAssistentState, DockTab } from "@/lib/assistent-state";

/**
 * Knoppen voor de topbalk + het (altijd gemounte, verborgen bij dicht) paneel.
 * Gemount houden bewaart het assistent-gesprek bij dicht-/openklappen.
 */
export function ZijrandKnoppen({ metWerkbak = false, zonderPaneel = false }: { metWerkbak?: boolean; zonderPaneel?: boolean }) {
  const [location, navigeer] = useLocation();
  const werkbakAantal = useWerkbakAantal();
  const { heeftNiveau } = useBevoegdheid();

  const magActiepuntenZien = heeftNiveau("actiepunten", 1) || heeftNiveau("goedkeuring", 3);

  const isMobile = useIsMobile();
  const { isDockOpen, setIsDockOpen, dockTab, setDockTab } = useAssistentState();

  // Telefoon = scherm gesloten, paneel gesloten
  useEffect(() => {
    if (isMobile && isDockOpen) {
      setIsDockOpen(false);
    }
  }, [isMobile, isDockOpen, setIsDockOpen]);

  const openTab = useCallback((gewenst: DockTab) => {
    if (gewenst === "assistent" && (isMobile || zonderPaneel)) {
      // Telefoon: eigen scherm, geen zwevend venster (ASSISTENT_01 §3)
      navigeer("/assistent");
      return;
    }
    setIsDockOpen(isDockOpen && dockTab === gewenst ? false : true);
    setDockTab(gewenst);
  }, [navigeer, dockTab, isDockOpen, zonderPaneel, isMobile, setIsDockOpen, setDockTab]);

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
      {!zonderPaneel && location !== "/assistent" && <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 hidden w-[420px] bg-background border-l border-border shadow-xl flex-col",
          isDockOpen && "md:flex",
        )}
        data-testid="paneel-zijrand"
      >
        <div className="flex items-center gap-1 px-2 py-2 border-b border-border">
          {metWerkbak && (
            <button
              type="button"
              onClick={() => setDockTab("werkbak")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium",
                dockTab === "werkbak" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              data-testid="tab-zijrand-werkbak"
            >
              <Inbox className="h-3.5 w-3.5" /> Werkbak
              {werkbakAantal > 0 && <span className="text-[10px] rounded-full bg-primary text-primary-foreground min-w-4 h-4 px-1 leading-4">{werkbakAantal > 99 ? "99+" : werkbakAantal}</span>}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDockTab("assistent")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium",
              dockTab === "assistent" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="tab-zijrand-assistent"
          >
            <Bot className="h-3.5 w-3.5" /> Assistent
          </button>
          {metWerkbak && magActiepuntenZien && (
            <button
              type="button"
              onClick={() => setDockTab("actiepunten")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium",
                dockTab === "actiepunten" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
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
            onClick={() => setIsDockOpen(false)}
            title="Sluiten"
            data-testid="knop-zijrand-sluiten"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {metWerkbak && (
          <div className={cn("flex-1 min-h-0 flex-col", dockTab === "werkbak" && isDockOpen ? "flex" : "hidden")}>
            <WerkbakInhoud onNavigeer={() => setIsDockOpen(false)} actief={isDockOpen && dockTab === "werkbak"} />
          </div>
        )}
        <div className={cn("flex-1 min-h-0 flex-col", dockTab === "assistent" ? "flex" : "hidden")}>
          <AssistentInhoud />
        </div>
        {metWerkbak && magActiepuntenZien && dockTab === "actiepunten" && (
          <div className="flex-1 min-h-0 flex flex-col">
            <ActiepuntenInhoud />
          </div>
        )}
      </div>}
    </>
  );
}

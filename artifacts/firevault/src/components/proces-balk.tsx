import { Check, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ProcesBalk — herbruikbaar procespatroon voor detailpagina's onder Projectaanpak.
 *
 * Toont de workflow als stappen (bv. Concept → Intern akkoord → Offerte → Opdracht):
 * afgeronde stappen krijgen een vinkje, de huidige stap licht op, komende stappen
 * zijn gedempt. Een verloren/vervallen document is een zichtbare eindtoestand op
 * de balk zelf — geen verborgen status.
 *
 * Toegankelijkheid: kleur is nooit het enige signaal (vinkje + tekstgewicht +
 * rand markeren de toestand), teksten blijven leesbaar in licht én donker
 * (semantische tokens; accent via het hoofdstukkleursysteem uit NAV_01).
 */
export interface ProcesStap {
  sleutel: string;
  label: string;
}

export function ProcesBalk({
  stappen,
  huidige,
  eindtoestand,
  hoofdstuk = "projectaanpak",
  className,
}: {
  stappen: ProcesStap[];
  /** Sleutel van de huidige stap. Mag ook een sleutel ná de laatste stap zijn (alles afgerond). */
  huidige: string;
  /** Zichtbare negatieve eindtoestand (bv. "Verloren" of "Vervallen"); onderdrukt de huidige-stap-markering. */
  eindtoestand?: string | null;
  /** Hoofdstuksleutel voor de accentkleur (NAV_01-token --hoofdstuk-<sleutel>). */
  hoofdstuk?: string;
  className?: string;
}) {
  const huidigeIndex = stappen.findIndex((s) => s.sleutel === huidige);
  const accent = `hsl(var(--hoofdstuk-${hoofdstuk}))`;

  return (
    <div
      className={cn("flex items-center gap-0.5 flex-wrap", className)}
      role="list"
      aria-label="Processtatus"
      data-testid="proces-balk"
    >
      {stappen.map((stap, i) => {
        const afgerond = eindtoestand
          ? false
          : huidigeIndex === -1 || i < huidigeIndex;
        const actief = !eindtoestand && i === huidigeIndex;
        return (
          <div key={stap.sleutel} className="flex items-center" role="listitem">
            {i > 0 && (
              <div
                aria-hidden
                className={cn("h-px w-3 sm:w-4 mx-0.5", afgerond || actief ? "bg-foreground/40" : "bg-border")}
              />
            )}
            <div
              data-testid={`proces-stap-${stap.sleutel}`}
              aria-current={actief ? "step" : undefined}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap",
                actief && "font-semibold text-foreground bg-background shadow-sm",
                afgerond && !actief && "text-foreground/80 border-transparent",
                !afgerond && !actief && "text-muted-foreground/70 border-transparent",
              )}
              style={actief ? { borderColor: accent } : undefined}
            >
              {afgerond && <Check aria-label="afgerond" className="h-3 w-3" style={{ color: accent }} />}
              {actief && <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />}
              {stap.label}
            </div>
          </div>
        );
      })}
      {eindtoestand && (
        <div
          role="listitem"
          data-testid="proces-eindtoestand"
          className="ml-1.5 flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive"
        >
          <XCircle aria-hidden className="h-3 w-3" />
          {eindtoestand}
        </div>
      )}
    </div>
  );
}

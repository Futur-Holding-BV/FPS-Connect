import React, { useEffect, useId, useMemo, useRef } from "react";
import { Router as WouterRouter, useLocation } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { X, Copy } from "lucide-react";
import { ConnectRoutes } from "@/routes/connect-routes";
import { HierarchischeNavigatie } from "@/components/navigatie/hierarchische-navigatie";
import { NavigatieBewakingProvider } from "@/context/navigatie-bewaking";
import { normaliseerPad, isPaneelGeschikt } from "@/lib/paneel-geschiktheid";
import { cn } from "@/lib/utils";

/**
 * PANEEL_01 — één baan (kolom) met een eigen wouter-Router op basis van
 * memoryLocation. Links binnen de baan navigeren binnen die baan; de
 * sidebar/topbar blijft van het hoofdvenster.
 */

interface BaanProps {
  index: number;
  startPad: string;
  /** Aantal andere banen dat exact hetzelfde genormaliseerde pad toont. */
  duplicaatVan: number[];
  onPadWijzig: (index: number, pad: string) => void;
  onSluit: (index: number) => void;
  /** Open een niet-paneelgeschikt pad over de volle breedte in het hoofdvenster. */
  onNietGeschikt: (pad: string) => void;
}

/** Leest de huidige memory-locatie en meldt wijzigingen terug naar boven. */
function BaanBewaker({
  index,
  onPadWijzig,
  onNietGeschikt,
  onSchermnaam,
}: {
  index: number;
  onPadWijzig: (index: number, pad: string) => void;
  onNietGeschikt: (pad: string) => void;
  onSchermnaam: (pad: string) => void;
}) {
  const [locatie] = useLocation();

  useEffect(() => {
    const genormaliseerd = normaliseerPad(locatie);
    onSchermnaam(genormaliseerd);
    if (!isPaneelGeschikt(genormaliseerd)) {
      onNietGeschikt(genormaliseerd);
      return;
    }
    onPadWijzig(index, genormaliseerd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locatie]);

  return null;
}

function BaanKop({
  index,
  padWeergave,
  duplicaatVan,
  onSluit,
}: {
  index: number;
  padWeergave: string;
  duplicaatVan: number[];
  onSluit: (index: number) => void;
}) {
  const duplicaatTekst =
    duplicaatVan.length > 0
      ? duplicaatVan.length === 1
        ? `Staat ook open in baan ${duplicaatVan[0] + 1}`
        : `Staat ook open in banen ${duplicaatVan.map((i) => i + 1).join(", ")}`
      : null;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-2 py-1.5 text-xs">
      <span className="font-semibold text-muted-foreground shrink-0">
        Baan {index + 1}
      </span>
      <span className="truncate text-foreground/80" title={padWeergave}>
        {padWeergave}
      </span>
      {duplicaatTekst && (
        <span
          className="ml-1 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
          title={duplicaatTekst}
        >
          <Copy className="h-3 w-3" />
          <span className="hidden sm:inline">{duplicaatTekst}</span>
        </span>
      )}
      <button
        type="button"
        onClick={() => onSluit(index)}
        title="Baan sluiten"
        className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function Baan({
  index,
  startPad,
  duplicaatVan,
  onPadWijzig,
  onSluit,
  onNietGeschikt,
}: BaanProps) {
  // Eén memoryLocation-instantie per baan-mount. Wordt herbouwd wanneer de
  // key (in de container) verandert.
  const loc = useMemo(
    () => memoryLocation({ path: startPad || "/", record: true }),
    // startPad alleen bij mount — verdere navigatie loopt via de router zelf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [schermnaam, setSchermnaam] = React.useState(startPad || "/");
  const laatstGemeld = useRef(normaliseerPad(startPad || "/"));
  const navigatieScopeId = useId();

  const meldPad = (i: number, pad: string) => {
    if (pad === laatstGemeld.current) return;
    laatstGemeld.current = pad;
    onPadWijzig(i, pad);
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-navigatie-geheugen-scope={navigatieScopeId}
    >
      <BaanKop
        index={index}
        padWeergave={schermnaam}
        duplicaatVan={duplicaatVan}
        onSluit={onSluit}
      />
      <div className={cn("min-h-0 flex-1 overflow-y-auto")}>
        <WouterRouter hook={loc.hook}>
          <NavigatieBewakingProvider klikScopeId={navigatieScopeId}>
            <BaanBewaker
              index={index}
              onPadWijzig={meldPad}
              onNietGeschikt={onNietGeschikt}
              onSchermnaam={setSchermnaam}
            />
            <div className="sticky top-0 z-10 border-b border-border bg-background">
              <HierarchischeNavigatie compact />
            </div>
            <div className="p-3 md:p-4">
              <ConnectRoutes />
            </div>
          </NavigatieBewakingProvider>
        </WouterRouter>
      </div>
    </div>
  );
}

import { useRef, useState, useEffect } from "react";
import { useListNieuws } from "@workspace/api-client-react";
import { Newspaper, Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioSpeler } from "@/components/radio-speler";
import { PauzeKnopTaakbalk } from "@/components/pauze/pauze-modal";

export function NieuwsTicker() {
  const { data: nieuws = [], isLoading, refetch } = useListNieuws();

  // Ververs elke 30 minuten (queryKey TS2741 workaround via setInterval)
  useEffect(() => {
    const id = setInterval(() => void refetch(), 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [refetch]);

  const [gepauzeerd, setGepauzeerd] = useState(false);
  const [gesloten, setGesloten] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  if (isLoading || nieuws.length === 0 || gesloten) return null;

  // Bereken animatieduur op basis van aantal items (ca. 8s per item)
  const duur = Math.max(60, nieuws.length * 8);

  return (
    <>
      <style>{`
        @keyframes fps-ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .fps-ticker-track {
          animation: fps-ticker ${duur}s linear infinite;
        }
        .fps-ticker-track.gepauzeerd {
          animation-play-state: paused;
        }
      `}</style>

      <div className="fixed bottom-0 left-0 right-0 z-40 h-8 flex items-stretch bg-[#1a1f2b] border-t border-white/10 text-white select-none">
        {/* Label */}
        <div className="flex-shrink-0 flex items-center gap-1.5 px-3 border-r border-white/10 bg-[hsl(12,90%,50%)]/10">
          <Newspaper className="w-3 h-3 text-[hsl(12,90%,50%)]" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(12,90%,50%)]">
            Nieuws
          </span>
        </div>

        {/* Scrollende items */}
        <div
          className="flex-1 overflow-hidden relative"
          onMouseEnter={() => setGepauzeerd(true)}
          onMouseLeave={() => setGepauzeerd(false)}
        >
          <div
            ref={trackRef}
            className={cn("flex items-center h-8 whitespace-nowrap", "fps-ticker-track", gepauzeerd && "gepauzeerd")}
          >
            {/* Twee herhalingen voor naadloze oneindige lus */}
            {[...nieuws, ...nieuws].map((item, idx) => (
              <a
                key={`${item.url}-${idx}`}
                href={item.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 h-full text-[12px] text-white/70 hover:text-white transition-colors cursor-pointer shrink-0"
              >
                <span className="text-[10px] font-medium text-[hsl(12,90%,50%)]/70 uppercase tracking-wide shrink-0">
                  {item.bron}
                </span>
                <span className="shrink-0">{item.titel}</span>
                <span className="text-white/20 shrink-0">·</span>
              </a>
            ))}
          </div>
        </div>

        {/* Radio compact */}
        <RadioSpeler compact />

        {/* Pauze / spelletjes */}
        <PauzeKnopTaakbalk />

        {/* Ticker pauzeer-knop */}
        <button
          type="button"
          title={gepauzeerd ? "Nieuws verder scrollen" : "Nieuws pauzeren"}
          onClick={() => setGepauzeerd((v) => !v)}
          className="flex-shrink-0 flex items-center justify-center w-8 border-l border-white/10 text-white/40 hover:text-white/80 transition-colors"
        >
          {gepauzeerd ? (
            <Play className="w-3 h-3" />
          ) : (
            <Pause className="w-3 h-3" />
          )}
        </button>

        {/* Sluiten-knop */}
        <button
          type="button"
          title="Nieuwsticker verbergen"
          onClick={() => setGesloten(true)}
          className="flex-shrink-0 flex items-center justify-center w-8 border-l border-white/10 text-white/40 hover:text-white/80 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </>
  );
}

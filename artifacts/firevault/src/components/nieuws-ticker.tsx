import { useRef, useState, useEffect } from "react";
import { useListNieuws } from "@workspace/api-client-react";
import { Newspaper, Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioSpeler } from "@/components/radio-speler";
import { PauzeKnopTaakbalk } from "@/components/pauze/pauze-modal";
import { WeergaveKnopTaakbalk } from "@/components/weergave/weergave-modal";
import { OnlineGebruikersTaakbalk } from "@/components/online-gebruikers/online-gebruikers";

export function NieuwsTicker() {
  const { data: nieuws = [], isLoading, refetch } = useListNieuws();

  useEffect(() => {
    const id = setInterval(() => void refetch(), 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [refetch]);

  const [gepauzeerd, setGepauzeerd] = useState(false);
  const [nieuwsVerborgen, setNieuwsVerborgen] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const heeftNieuws = !isLoading && nieuws.length > 0;
  const duur = Math.max(30, Math.round(nieuws.length * 5));

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

      <div className="fixed bottom-0 left-0 z-40 h-8 flex items-stretch bg-[#1a1f2b] border-t border-white/10 text-white select-none max-w-[calc(40ch+220px)]">

        {/* Nieuws-sectie — alleen wanneer niet verborgen */}
        {!nieuwsVerborgen ? (
          <>
            {/* Label */}
            <div className="flex-shrink-0 flex items-center gap-1.5 px-3 border-r border-white/10 bg-[hsl(12,90%,50%)]/10">
              <Newspaper className="w-3 h-3 text-[hsl(12,90%,50%)]" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(12,90%,50%)]">
                Nieuws
              </span>
            </div>

            {/* Scrollende items of laadindicator */}
            <div
              className="w-[40ch] min-w-0 overflow-hidden relative"
              onMouseEnter={() => setGepauzeerd(true)}
              onMouseLeave={() => setGepauzeerd(false)}
            >
              {heeftNieuws ? (
                <div
                  ref={trackRef}
                  className={cn(
                    "flex items-center h-8 whitespace-nowrap",
                    "fps-ticker-track",
                    gepauzeerd && "gepauzeerd",
                  )}
                >
                  {[...nieuws, ...nieuws].map((item, idx) => (
                    <button
                      key={`${item.url}-${idx}`}
                      type="button"
                      onClick={() => {
                        if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
                      }}
                      className="inline-flex items-center gap-2 px-5 h-full text-[12px] text-white/70 hover:text-white transition-colors cursor-pointer shrink-0 bg-transparent border-0"
                      title={item.titel}
                    >
                      <span className="text-[10px] font-medium text-[hsl(12,90%,50%)]/70 uppercase tracking-wide shrink-0">
                        {item.bron}
                      </span>
                      <span className="shrink-0">{item.titel}</span>
                      <span className="text-white/20 shrink-0">·</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center h-8 px-4 text-white/25 text-[11px] italic">
                  {isLoading ? "Nieuws laden\u2026" : "Geen nieuws beschikbaar"}
                </div>
              )}
            </div>

            {/* Ticker pauzeer-knop */}
            {heeftNieuws && (
              <button
                type="button"
                title={gepauzeerd ? "Nieuws verder scrollen" : "Nieuws pauzeren"}
                onClick={() => setGepauzeerd((v) => !v)}
                className="flex-shrink-0 flex items-center justify-center w-8 border-l border-white/10 text-white/40 hover:text-white/80 transition-colors"
              >
                {gepauzeerd ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              </button>
            )}

            {/* Nieuws verbergen */}
            <button
              type="button"
              title="Nieuwsbalk verbergen"
              onClick={() => setNieuwsVerborgen(true)}
              className="flex-shrink-0 flex items-center justify-center w-8 border-l border-white/10 text-white/40 hover:text-white/80 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            {/* Nieuws tonen-knop als balk verborgen is */}
            <button
              type="button"
              title="Nieuwsbalk tonen"
              onClick={() => setNieuwsVerborgen(false)}
              className="flex-shrink-0 flex items-center justify-center gap-1.5 px-3 border-r border-white/10 text-white/30 hover:text-white/70 transition-colors"
            >
              <Newspaper className="w-3 h-3" />
            </button>
            {/* Opvulling zodat radio/pauze rechts blijven */}
            <div className="flex-1" />
          </>
        )}

        {/* Wie is online — altijd zichtbaar, verborgen als niemand online */}
        <OnlineGebruikersTaakbalk />

        {/* Weergave-instellingen — altijd zichtbaar */}
        <WeergaveKnopTaakbalk />

        {/* Radio — altijd zichtbaar */}
        <RadioSpeler compact />

        {/* Pauze / spelletjes — altijd zichtbaar */}
        <PauzeKnopTaakbalk />
      </div>
    </>
  );
}

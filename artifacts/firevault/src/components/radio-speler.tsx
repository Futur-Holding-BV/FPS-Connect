import { useState, useRef, useEffect, useCallback } from "react";
import { Radio, Play, Pause, Volume2, VolumeX, ChevronUp, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";

// ── Zenderlijst ───────────────────────────────────────────────────────────────

export interface Zender {
  id: string;
  naam: string;
  url: string;
  genre: string;
}

const ZENDERS: Zender[] = [
  { id: "radio1",   naam: "NPO Radio 1",   url: "https://icecast.omroep.nl/radio1-bb-mp3",    genre: "Nieuws & info" },
  { id: "radio2",   naam: "NPO Radio 2",   url: "https://icecast.omroep.nl/radio2-bb-mp3",    genre: "Muziek & cultuur" },
  { id: "3fm",      naam: "NPO 3FM",       url: "https://icecast.omroep.nl/3fm-bb-mp3",       genre: "Pop & alternatief" },
  { id: "bnr",      naam: "BNR Nieuwsradio", url: "https://icecast.omroep.nl/bnr_mp3_128_03", genre: "Nieuws & info" },
  { id: "r538",     naam: "Radio 538",     url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO538.mp3",  genre: "Pop" },
  { id: "qmusic",   naam: "Q-music",       url: "https://playerservices.streamtheworld.com/api/livestream-redirect/QMUSIC.mp3",   genre: "Pop" },
  { id: "skyradio", naam: "Sky Radio",     url: "https://playerservices.streamtheworld.com/api/livestream-redirect/SKYRADIO.mp3", genre: "Pop" },
  { id: "slam",     naam: "Slam!",         url: "https://playerservices.streamtheworld.com/api/livestream-redirect/SLAM_MP3.mp3", genre: "Dance & pop" },
  { id: "veronica", naam: "Radio Veronica", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/VERONICA.mp3", genre: "Classic rock" },
  { id: "klassiek", naam: "NPO Klassiek",  url: "https://icecast.omroep.nl/radio4-bb-mp3",    genre: "Klassiek" },
];

// ── Voorkeursinstellingen opslaan in localStorage ────────────────────────────

const LS_ZENDER  = "fps.radio.zender";
const LS_VOLUME  = "fps.radio.volume";
const LS_FAVORIET = "fps.radio.favorieten";

function leesVoorkeur<T>(sleutel: string, standaard: T): T {
  try {
    const v = localStorage.getItem(sleutel);
    if (v === null) return standaard;
    return JSON.parse(v) as T;
  } catch {
    return standaard;
  }
}

function schrijfVoorkeur(sleutel: string, waarde: unknown) {
  try { localStorage.setItem(sleutel, JSON.stringify(waarde)); } catch { /* ignore */ }
}

// ── RadioSpeler component ─────────────────────────────────────────────────────

export function RadioSpeler() {
  const audioRef = useRef<HTMLAudioElement>(null);

  const [actieveZender, setActieveZender] = useState<Zender>(
    () => ZENDERS.find(z => z.id === leesVoorkeur<string>(LS_ZENDER, "radio2")) ?? ZENDERS[1],
  );
  const [speelt, setSpeelt]       = useState(false);
  const [laden, setLaden]         = useState(false);
  const [fout, setFout]           = useState(false);
  const [volume, setVolume]       = useState<number>(() => leesVoorkeur<number>(LS_VOLUME, 0.7));
  const [gedempt, setGedempt]     = useState(false);
  const [favorieten, setFavorieten] = useState<string[]>(
    () => leesVoorkeur<string[]>(LS_FAVORIET, ["radio2", "bnr"]),
  );
  const [instellingenOpen, setInstellingenOpen] = useState(false);

  // Synchroniseer volume naar audio-element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = gedempt ? 0 : volume;
    }
  }, [volume, gedempt]);

  // Laad nieuwe zender wanneer actieveZender wijzigt
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setFout(false);
    if (speelt) {
      setLaden(true);
      audio.src = actieveZender.url;
      audio.load();
      void audio.play().catch(() => {
        setFout(true);
        setSpeelt(false);
        setLaden(false);
      });
    } else {
      audio.pause();
      audio.src = actieveZender.url;
    }
    schrijfVoorkeur(LS_ZENDER, actieveZender.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actieveZender]);

  const wisselAfspelen = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setFout(false);
    if (speelt) {
      audio.pause();
      setSpeelt(false);
    } else {
      setLaden(true);
      audio.src = actieveZender.url;
      audio.load();
      void audio.play().catch(() => {
        setFout(true);
        setSpeelt(false);
        setLaden(false);
      });
    }
  }, [speelt, actieveZender]);

  function kiesZender(zender: Zender) {
    setActieveZender(zender);
    setSpeelt(true);
    setInstellingenOpen(false);
  }

  function wisselFavoriet(id: string) {
    setFavorieten(prev => {
      const nieuw = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
      schrijfVoorkeur(LS_FAVORIET, nieuw);
      return nieuw;
    });
  }

  function wisselVolume(vals: number[]) {
    const v = vals[0] ?? 0.7;
    setVolume(v);
    schrijfVoorkeur(LS_VOLUME, v);
    if (gedempt && v > 0) setGedempt(false);
  }

  const genreGroepen = ZENDERS.reduce<Record<string, Zender[]>>((acc, z) => {
    if (!acc[z.genre]) acc[z.genre] = [];
    acc[z.genre].push(z);
    return acc;
  }, {});

  return (
    <>
      {/* Verborgen audio-element */}
      <audio
        ref={audioRef}
        onCanPlay={() => setLaden(false)}
        onPlaying={() => { setSpeelt(true); setLaden(false); setFout(false); }}
        onPause={() => setSpeelt(false)}
        onError={() => { setFout(true); setSpeelt(false); setLaden(false); }}
        onWaiting={() => setLaden(true)}
        preload="none"
      />

      {/* Balk — verborgen in icoonmodus */}
      <div className="group-data-[collapsible=icon]:hidden px-2 py-1.5">
        <div className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors",
          "bg-sidebar-accent/40 hover:bg-sidebar-accent/70",
          fout && "border border-destructive/40",
        )}>

          {/* Afspeel/pauze-knop */}
          <button
            type="button"
            onClick={wisselAfspelen}
            className="shrink-0 h-6 w-6 flex items-center justify-center rounded hover:bg-sidebar-accent transition-colors"
            title={speelt ? "Pauzeren" : "Afspelen"}
          >
            {laden ? (
              <Radio className="h-3.5 w-3.5 text-primary animate-pulse" />
            ) : speelt ? (
              <Pause className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Play className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>

          {/* Zendernaam */}
          <button
            type="button"
            onClick={() => setInstellingenOpen(true)}
            className="flex-1 min-w-0 text-left"
            title="Zender kiezen"
          >
            <p className={cn(
              "text-[11px] font-medium truncate leading-tight",
              speelt ? "text-foreground" : "text-muted-foreground",
            )}>
              {actieveZender.naam}
            </p>
            <p className="text-[10px] text-muted-foreground/60 truncate leading-tight">
              {fout ? "Verbinding mislukt" : speelt ? "Live" : actieveZender.genre}
            </p>
          </button>

          {/* Volume-dempen */}
          <button
            type="button"
            onClick={() => setGedempt(g => !g)}
            className="shrink-0 h-6 w-6 flex items-center justify-center rounded hover:bg-sidebar-accent transition-colors"
            title={gedempt ? "Geluid aan" : "Dempen"}
          >
            {gedempt
              ? <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
              : <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
            }
          </button>

          {/* Instellingen-popover */}
          <Popover open={instellingenOpen} onOpenChange={setInstellingenOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="shrink-0 h-6 w-6 flex items-center justify-center rounded hover:bg-sidebar-accent transition-colors"
                title="Zender en volume"
              >
                <ChevronUp className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition-transform",
                  instellingenOpen && "rotate-180",
                )} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="end"
              className="w-72 p-0 shadow-xl"
              sideOffset={6}
            >
              <div className="p-3 border-b">
                <div className="flex items-center gap-2 mb-2">
                  <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">Radio-instellingen</span>
                </div>
                {/* Volume slider */}
                <div className="flex items-center gap-2">
                  <Volume2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={[gedempt ? 0 : volume]}
                    onValueChange={wisselVolume}
                    className="flex-1"
                  />
                  <span className="text-[10px] text-muted-foreground w-7 text-right tabular-nums">
                    {Math.round((gedempt ? 0 : volume) * 100)}%
                  </span>
                </div>
              </div>

              {/* Zenderlijst per genre */}
              <div className="max-h-72 overflow-y-auto">
                {Object.entries(genreGroepen).map(([genre, zenders]) => (
                  <div key={genre}>
                    <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {genre}
                    </p>
                    {zenders.map(zender => (
                      <button
                        key={zender.id}
                        type="button"
                        onClick={() => kiesZender(zender)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted/60 transition-colors",
                          actieveZender.id === zender.id && "bg-primary/10",
                        )}
                      >
                        {/* Favoriet-ster */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); wisselFavoriet(zender.id); }}
                          className="shrink-0 text-muted-foreground hover:text-amber-500 transition-colors"
                          title={favorieten.includes(zender.id) ? "Verwijder uit favorieten" : "Voeg toe aan favorieten"}
                        >
                          <span className={cn(
                            "text-sm",
                            favorieten.includes(zender.id) ? "text-amber-500" : "text-muted-foreground/30",
                          )}>★</span>
                        </button>
                        <span className={cn(
                          "flex-1 text-sm",
                          actieveZender.id === zender.id ? "font-semibold text-foreground" : "text-foreground/80",
                        )}>
                          {zender.naam}
                        </span>
                        {actieveZender.id === zender.id && speelt && (
                          <span className="shrink-0 flex gap-0.5 items-end h-3">
                            <span className="w-0.5 bg-primary animate-[equalizer_0.8s_ease-in-out_infinite]" style={{ height: "40%" }} />
                            <span className="w-0.5 bg-primary animate-[equalizer_0.8s_ease-in-out_0.2s_infinite]" style={{ height: "80%" }} />
                            <span className="w-0.5 bg-primary animate-[equalizer_0.8s_ease-in-out_0.4s_infinite]" style={{ height: "60%" }} />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              {/* Favorieten-hint */}
              <div className="px-3 py-2 border-t">
                <p className="text-[10px] text-muted-foreground/60">
                  Klik op ★ om een zender als favoriet te markeren
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </>
  );
}

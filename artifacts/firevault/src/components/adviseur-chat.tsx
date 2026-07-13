import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Bot, X, Send, Loader2, ChevronDown, RotateCcw } from "lucide-react";
import { useVraagAdviseur } from "@workspace/api-client-react";

interface Bericht {
  rol: "user" | "assistant";
  inhoud: string;
}

export function AdviseurChat({ verhoogd = false }: { verhoogd?: boolean }) {
  const [open, setOpen] = useState(false);
  // Op pagina's met de NieuwsTicker (beheerder) moet de knop hoger staan zodat
  // hij niet achter/over de balk onderaan valt.
  const positie = verhoogd ? "bottom-20 right-5" : "bottom-5 right-5";
  const [berichten, setBerichten] = useState<Bericht[]>([]);
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tekstRef = useRef<HTMLTextAreaElement>(null);
  const { mutateAsync: vraagAdviseur } = useVraagAdviseur();

  useEffect(() => {
    if (open && tekstRef.current) {
      setTimeout(() => tekstRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [berichten, bezig]);

  async function verstuur() {
    const vraag = invoer.trim();
    if (!vraag || bezig) return;

    const nieuweBerichten: Bericht[] = [...berichten, { rol: "user", inhoud: vraag }];
    setBerichten(nieuweBerichten);
    setInvoer("");
    setBezig(true);

    try {
      const result = await vraagAdviseur({
        data: {
          vraag,
          geschiedenis: berichten.slice(-10),
        },
      });
      setBerichten([...nieuweBerichten, { rol: "assistant", inhoud: result.antwoord }]);
    } catch {
      setBerichten([
        ...nieuweBerichten,
        {
          rol: "assistant",
          inhoud: "Er is een fout opgetreden. Probeer het opnieuw.",
        },
      ]);
    } finally {
      setBezig(false);
    }
  }

  function herstart() {
    setBerichten([]);
    setInvoer("");
    setTimeout(() => tekstRef.current?.focus(), 80);
  }

  function toetsIngedrukt(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      verstuur();
    }
  }

  return (
    <>
      {/* Zwevende knop */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-200",
          positie,
          "bg-[hsl(12,90%,50%)] text-white hover:bg-[hsl(12,90%,44%)]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(12,90%,50%)] focus-visible:ring-offset-2",
          open && "opacity-0 pointer-events-none",
        )}
        aria-label="FPS Bedrijfsadviseur openen"
        title="FPS Bedrijfsadviseur"
      >
        <Bot className="h-5 w-5" />
      </button>

      {/* Chat-paneel */}
      <div
        className={cn(
          "fixed z-50 flex flex-col rounded-2xl shadow-2xl border border-border bg-background",
          positie,
          "transition-all duration-200 origin-bottom-right",
          open
            ? "opacity-100 scale-100 w-[360px] h-[520px] max-h-[calc(100vh-88px)]"
            : "opacity-0 scale-90 w-[360px] h-[520px] pointer-events-none",
        )}
      >
        {/* Koptekst */}
        <div className="flex items-center gap-2 px-4 py-3 rounded-t-2xl bg-[hsl(12,90%,50%)] text-white shrink-0">
          <Bot className="h-4 w-4 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-none">FPS Bedrijfsadviseur</p>
            <p className="text-[11px] text-white/75 mt-0.5">Vragen over Connect, CAO, wetgeving &amp; FPS</p>
          </div>
          {berichten.length > 0 && (
            <button
              onClick={herstart}
              className="rounded p-1 hover:bg-white/20 transition-colors"
              title="Gesprek wissen"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 hover:bg-white/20 transition-colors"
            aria-label="Sluiten"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {/* Berichtenlijst */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 min-h-0"
        >
          {berichten.length === 0 && !bezig && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-sm text-center px-4">
              <Bot className="h-8 w-8 opacity-40" />
              <p>Stel een vraag over FPS Connect, de CAO, brandveiligheidswetgeving of interne processen.</p>
              <div className="flex flex-wrap gap-2 mt-1 justify-center">
                {[
                  "Hoe maak ik een spot aan?",
                  "Wat zijn ADV-rechten?",
                  "Hoe werkt opleverrapportage?",
                ].map((hint) => (
                  <button
                    key={hint}
                    onClick={() => { setInvoer(hint); tekstRef.current?.focus(); }}
                    className="text-xs px-2 py-1 rounded-full border border-border hover:bg-muted transition-colors"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          )}

          {berichten.map((b, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                b.rol === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                  b.rol === "user"
                    ? "bg-[hsl(12,90%,50%)] text-white rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm",
                )}
              >
                {b.inhoud}
              </div>
            </div>
          ))}

          {bezig && (
            <div className="flex justify-start">
              <div className="bg-muted text-muted-foreground rounded-2xl rounded-bl-sm px-3 py-2 text-sm flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Even denken&hellip;</span>
              </div>
            </div>
          )}
        </div>

        {/* Invoerveld */}
        <div className="px-3 pb-3 pt-2 border-t border-border shrink-0">
          <div className="flex items-end gap-2">
            <Textarea
              ref={tekstRef}
              value={invoer}
              onChange={(e) => setInvoer(e.target.value)}
              onKeyDown={toetsIngedrukt}
              placeholder="Stel een vraag... (Enter = verstuur)"
              className="flex-1 min-h-[40px] max-h-[120px] resize-none text-sm"
              disabled={bezig}
              rows={1}
            />
            <Button
              size="icon"
              onClick={verstuur}
              disabled={!invoer.trim() || bezig}
              className="h-9 w-9 shrink-0 bg-[hsl(12,90%,50%)] hover:bg-[hsl(12,90%,44%)] text-white"
            >
              {bezig ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 leading-none">
            AI kan fouten maken. Controleer bij twijfel de bron.
          </p>
        </div>
      </div>
    </>
  );
}

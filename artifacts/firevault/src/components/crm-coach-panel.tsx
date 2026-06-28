import { useState, useEffect, useCallback } from "react";
import { Sparkles, AlertCircle, Lightbulb, RefreshCw, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface CoachAntwoord {
  waarom: string;
  ontbreekt: string[];
  advies: string;
  effect: string | null;
  kennisblok: string | null;
}

interface CrmCoachPanelProps {
  scherm: string;
  klantId?: number;
  context?: Record<string, unknown>;
  autoLaden?: boolean;
}

export function CrmCoachPanel({ scherm, klantId, context, autoLaden = true }: CrmCoachPanelProps) {
  const [coaching, setCoaching] = useState<CoachAntwoord | null>(null);
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState(false);

  const laadCoaching = useCallback(async () => {
    setLaden(true);
    setFout(false);
    try {
      const resp = await fetch("/api/crm/ai-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scherm, klant_id: klantId ?? null, context }),
      });
      if (!resp.ok) throw new Error("AI niet beschikbaar");
      const data: CoachAntwoord = await resp.json();
      setCoaching(data);
    } catch {
      setFout(true);
    } finally {
      setLaden(false);
    }
  }, [scherm, klantId, context]);

  useEffect(() => {
    if (!autoLaden) return;
    setCoaching(null);
    setFout(false);
    const timer = setTimeout(laadCoaching, 1200);
    return () => clearTimeout(timer);
  }, [scherm, klantId, autoLaden, laadCoaching]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-sm font-semibold">AI Coach</span>
        </div>
        {!laden && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={laadCoaching}
            title="Coaching opnieuw laden"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </div>

      {laden && (
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-full" />
        </div>
      )}

      {!laden && fout && (
        <div className="rounded-md border border-dashed p-3 text-center">
          <p className="text-xs text-muted-foreground">Coaching tijdelijk niet beschikbaar.</p>
          {!autoLaden && (
            <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={laadCoaching}>
              Opnieuw proberen
            </Button>
          )}
        </div>
      )}

      {!laden && !coaching && !fout && autoLaden && (
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-full" />
        </div>
      )}

      {!laden && !autoLaden && !coaching && !fout && (
        <Button variant="outline" size="sm" className="w-full text-xs" onClick={laadCoaching}>
          <Sparkles className="h-3 w-3 mr-1.5" />
          Coaching aanvragen
        </Button>
      )}

      {coaching && !laden && (
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Waarom zie ik dit?
            </p>
            <p className="leading-relaxed text-foreground/80">{coaching.waarom}</p>
          </div>

          {coaching.ontbreekt.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                Wat ontbreekt nog?
              </p>
              <ul className="space-y-1.5">
                {coaching.ontbreekt.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                    <span className="text-amber-700 leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg bg-primary/8 border border-primary/15 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />
              <p className="text-[10px] font-semibold text-primary uppercase tracking-widest">
                Mijn advies
              </p>
            </div>
            <p className="leading-relaxed text-foreground/90">{coaching.advies}</p>
          </div>

          {coaching.effect && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                Verwacht effect
              </p>
              <p className="leading-relaxed text-muted-foreground">{coaching.effect}</p>
            </div>
          )}

          {coaching.kennisblok && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-widest">
                  Kennisblok
                </p>
              </div>
              <p className="leading-relaxed text-amber-900">{coaching.kennisblok}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

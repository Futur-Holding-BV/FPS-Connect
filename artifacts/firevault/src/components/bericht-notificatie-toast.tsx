import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { X, MessageSquare } from "lucide-react";
import {
  useListChatGesprekken,
  type ChatGesprek,
} from "@workspace/api-client-react";
import { useNavigatieBewaking } from "@/context/navigatie-bewaking";

interface ToastData {
  gesprekId: number;
  naam: string;
  afzender: string;
  tekst: string;
}

function gesprekNaam(g: ChatGesprek): string {
  if (g.naam) return g.naam;
  return g.deelnemers.map((d) => d.naam).join(", ") || "Nieuw bericht";
}

export function BerichtNotificatieToast() {
  const [location] = useLocation();
  const { requestNavigatie } = useNavigatieBewaking();
  const [toast, setToast] = useState<ToastData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vorigeOngelezen = useRef(new Map<number, number>());
  const geinitialiseerd = useRef(false);

  const { data: gesprekken, refetch } = useListChatGesprekken();

  useEffect(() => {
    const interval = setInterval(() => void refetch(), 15000);
    return () => clearInterval(interval);
  }, [refetch]);

  useEffect(() => {
    if (!gesprekken) return;

    if (!geinitialiseerd.current) {
      gesprekken.forEach((g) => vorigeOngelezen.current.set(g.id, g.ongelezen_aantal));
      geinitialiseerd.current = true;
      return;
    }

    if (location.startsWith("/berichten")) {
      gesprekken.forEach((g) => vorigeOngelezen.current.set(g.id, g.ongelezen_aantal));
      return;
    }

    for (const g of gesprekken) {
      const vorige = vorigeOngelezen.current.get(g.id) ?? 0;
      if (g.ongelezen_aantal > vorige) {
        const naam = gesprekNaam(g);
        const lb = g.laatste_bericht;
        setToast({
          gesprekId: g.id,
          naam,
          afzender: lb?.afzender_naam ?? "",
          tekst: lb?.inhoud ?? "Nieuw bericht ontvangen",
        });
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setToast(null), 5500);
        break;
      }
    }

    gesprekken.forEach((g) => vorigeOngelezen.current.set(g.id, g.ongelezen_aantal));
  }, [gesprekken, location]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!toast) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-[200] flex items-start gap-3 bg-card border border-border rounded-xl shadow-xl px-4 py-3 w-80 cursor-pointer animate-in slide-in-from-bottom-4 duration-300"
      onClick={() => {
        setToast(null);
        requestNavigatie(`/berichten?gesprek=${toast.gesprekId}`, {
          instroom: { label: "Berichten", pad: location },
        });
      }}
      role="alert"
      aria-live="polite"
    >
      <div className="mt-0.5 flex-shrink-0 rounded-full bg-primary/10 p-1.5">
        <MessageSquare className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{toast.naam}</p>
        {toast.afzender ? (
          <p className="text-xs text-muted-foreground">{toast.afzender}</p>
        ) : null}
        <p className="text-sm text-foreground/80 line-clamp-2 mt-0.5">{toast.tekst}</p>
      </div>
      <button
        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
        onClick={(e) => {
          e.stopPropagation();
          setToast(null);
        }}
        aria-label="Sluiten"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

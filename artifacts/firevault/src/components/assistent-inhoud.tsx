// ASSISTENT_01 — de Connect-assistent. Gebruikt het bestaande AiChatPanel
// (geen tweede chatonderdeel) en de bestaande adviseur-route via de AI-poort.
// Het paneel doet niets tot de gebruiker een vraag stelt.
import AiChatPanel from "@/components/ai-chat-panel";
import { useVraagAdviseur } from "@workspace/api-client-react";
import type { AiChatBericht, AiChatAntwoord } from "@workspace/api-client-react";
import { useAssistentContext } from "@/lib/assistent-context";
import { MapPin } from "lucide-react";

const SNELLE_ACTIES = [
  "Hoe werkt de keten van aanvraag tot factuur?",
  "Wat betekent dit scherm?",
  "Waar vind ik mijn openstaande taken?",
];

export function AssistentInhoud({ className }: { className?: string }) {
  const { mutateAsync: vraagAdviseur } = useVraagAdviseur();
  const ctx = useAssistentContext();

  async function onVerstuur(berichten: AiChatBericht[]): Promise<AiChatAntwoord> {
    const laatste = berichten[berichten.length - 1];
    const geschiedenis = berichten.slice(0, -1).slice(-10).map((b) => ({
      rol: (b.rol === "gebruiker" ? "user" : "assistant") as "user" | "assistant",
      inhoud: b.inhoud,
    }));
    const result = await vraagAdviseur({
      data: {
        vraag: laatste?.inhoud ?? "",
        geschiedenis,
        context: {
          scherm: ctx.scherm,
          ...(ctx.objectType && ctx.objectId
            ? { object_type: ctx.objectType, object_id: ctx.objectId }
            : {}),
        },
      },
    });
    return { antwoord: result.antwoord };
  }

  return (
    <div className={`flex flex-col h-full min-h-0 ${className ?? ""}`}>
      {/* ASSISTENT_01 §4: zichtbaar waarover de assistent nu praat */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground border-b border-border bg-muted/40"
        data-testid="assistent-context-label"
      >
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">Je kijkt naar: {ctx.label}</span>
      </div>
      <AiChatPanel
        // key op object: bij een ander open object start een nieuw gesprek,
        // zodat antwoorden nooit over het verkeerde object gaan
        key={ctx.objectType && ctx.objectId ? `${ctx.objectType}-${ctx.objectId}` : "algemeen"}
        onVerstuur={onVerstuur}
        snelleActies={SNELLE_ACTIES}
        placeholder="Stel een vraag over Connect of je werk…"
        className="flex-1 border-0 min-h-0"
      />
    </div>
  );
}

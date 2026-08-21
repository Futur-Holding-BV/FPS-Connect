import { useEffect, useRef } from "react";
import AiChatPanel, { AiChatPanelRef } from "@/components/ai-chat-panel";
import {
  getGetAdviseurGesprekQueryKey,
  useGetAdviseurGesprek,
  useVraagAdviseur,
} from "@workspace/api-client-react";
import type { AiChatBericht } from "@workspace/api-client-react";
import { useAssistentContext } from "@/lib/assistent-context";
import { useAssistentState } from "@/lib/assistent-state";
import { MapPin } from "lucide-react";

const SNELLE_ACTIES = [
  "Hoe werkt de keten van aanvraag tot factuur?",
  "Wat betekent dit scherm?",
  "Waar vind ik mijn openstaande taken?",
];

export function AssistentInhoud({ className }: { className?: string }) {
  const { mutateAsync: vraagAdviseur } = useVraagAdviseur();
  const ctx = useAssistentContext();
  const {
    contextKey,
    autorisatieContext, setAutorisatieContext,
    berichten, setBerichten,
    invoer, setInvoer,
    bezig, setBezig,
    signalen, setSignalen,
    registreerListener
  } = useAssistentState();

  const panelRef = useRef<AiChatPanelRef>(null);
  const contextKeyRef = useRef(contextKey);
  const gesprek = useGetAdviseurGesprek({
    query: {
      queryKey: [...getGetAdviseurGesprekQueryKey(), contextKey],
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      refetchInterval: 60_000,
    },
  });

  useEffect(() => {
    contextKeyRef.current = contextKey;
  }, [contextKey]);

  useEffect(() => {
    if (!gesprek.data || gesprek.isFetching || bezig) return;
    const geladen = gesprek.data.berichten.map((bericht) => ({
      rol: bericht.rol === "user" ? "gebruiker" as const : "assistent" as const,
      inhoud: bericht.inhoud,
      citaties: bericht.citaties.map((citatie) => ({
        label: citatie.label,
        bron: citatie.bron,
        entiteitstype: citatie.entiteitstype,
        entiteit_id: citatie.entiteit_id,
        href: citatie.href,
      })),
    }));
    if (contextKey !== contextKeyRef.current) return;
    const autorisatieGewijzigd =
      autorisatieContext !== null &&
      autorisatieContext !== gesprek.data.autorisatie_context;
    setAutorisatieContext(gesprek.data.autorisatie_context);
    if (autorisatieGewijzigd || berichten.length === 0) {
      setBerichten(geladen);
      if (autorisatieGewijzigd) setSignalen([]);
    }
  }, [
    gesprek.data,
    gesprek.isFetching,
    contextKey,
    bezig,
    berichten.length,
    autorisatieContext,
    setBerichten,
    setAutorisatieContext,
    setSignalen,
  ]);

  useEffect(() => {
    return registreerListener((vraag?: string) => {
      if (vraag && panelRef.current) {
        panelRef.current.verstuur(vraag, null);
      }
    });
  }, [registreerListener]);

  async function onVerstuur(nieuweBerichten: AiChatBericht[]) {
    const aanvraagContext = contextKey;
    const laatste = nieuweBerichten[nieuweBerichten.length - 1];
    const result = await vraagAdviseur({
      data: {
        vraag: laatste?.inhoud ?? "",
        context: {
          scherm: ctx.scherm,
          ...(ctx.objectType && ctx.objectId
            ? { object_type: ctx.objectType, object_id: ctx.objectId }
            : {}),
        },
      },
    });
    if (aanvraagContext !== contextKeyRef.current) return null;
    const autorisatieGewijzigd =
      autorisatieContext !== null &&
      autorisatieContext !== result.autorisatie_context;
    setAutorisatieContext(result.autorisatie_context);
    if (autorisatieGewijzigd) setSignalen([]);
    return { ...result, vervangGesprek: autorisatieGewijzigd };
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
        ref={panelRef}
        onVerstuur={onVerstuur}
        snelleActies={SNELLE_ACTIES}
        placeholder="Vraag iets over dit scherm..."
        className="flex-1 border-0 min-h-0"
        berichten={berichten}
        setBerichten={setBerichten}
        invoer={invoer}
        setInvoer={setInvoer}
        bezig={bezig}
        setBezig={setBezig}
        signalen={signalen}
        setSignalen={setSignalen}
        zonderAfbeeldingen={true}
      />
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import {
  useListChatGesprekken,
  useListChatBerichten,
  useCreateChatBericht,
  useMarkeerChatGelezen,
  useCreateChatGesprek,
  useListChatGebruikers,
  getListChatGesprekkenQueryKey,
  getListChatBerichtenQueryKey,
  type ChatGesprek,
  type ChatBericht,
  type ChatGebruiker,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/auth-context";
import { MessageSquare, Plus, Send, Users, Search, X } from "lucide-react";

function formatTijdstip(dt: string | Date) {
  const d = new Date(dt);
  const nu = new Date();
  const vandaag = nu.toDateString() === d.toDateString();
  if (vandaag) {
    return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function gesprekNaam(gesprek: ChatGesprek, mijnId: number): string {
  if (gesprek.naam) return gesprek.naam;
  if (gesprek.type === "direct") {
    const andere = gesprek.deelnemers.find((d) => d.gebruiker_id !== mijnId);
    return andere?.naam ?? "Onbekend";
  }
  return gesprek.deelnemers.map((d) => d.naam).join(", ");
}

function initialen(naam: string): string {
  return naam
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function AvatarRond({ naam, size = 36 }: { naam: string; size?: number }) {
  const kleuren = [
    "bg-orange-100 text-orange-700",
    "bg-blue-100 text-blue-700",
    "bg-green-100 text-green-700",
    "bg-purple-100 text-purple-700",
  ];
  const kleur = kleuren[naam.charCodeAt(0) % kleuren.length];
  return (
    <div
      className={`flex-shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${kleur}`}
      style={{ width: size, height: size, fontSize: size < 32 ? 10 : 12 }}
    >
      {initialen(naam)}
    </div>
  );
}

function BerichtBel({
  bericht,
  isEigen,
}: {
  bericht: ChatBericht;
  isEigen: boolean;
}) {
  return (
    <div className={`flex ${isEigen ? "justify-end" : "justify-start"} mb-1`}>
      <div
        className={`max-w-[72%] rounded-2xl px-3 py-2 text-sm ${
          isEigen
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        }`}
      >
        {!isEigen && bericht.afzender_naam && (
          <div className="text-[10px] font-semibold mb-0.5 opacity-70">
            {bericht.afzender_naam}
          </div>
        )}
        <p className="whitespace-pre-wrap break-words leading-relaxed">{bericht.inhoud}</p>
        <div
          className={`text-[10px] mt-0.5 ${
            isEigen ? "text-primary-foreground/70 text-right" : "text-muted-foreground"
          }`}
        >
          {formatTijdstip(bericht.aangemaakt_op)}
        </div>
      </div>
    </div>
  );
}

function GespreksPanel({
  gesprekId,
  mijnId,
  onTerug,
}: {
  gesprekId: number;
  mijnId: number;
  onTerug?: () => void;
}) {
  const queryClient = useQueryClient();
  const [inputText, setInputText] = useState("");
  const [verzending, setVerzending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: berichten, refetch } = useListChatBerichten(gesprekId);

  useEffect(() => {
    const t = setInterval(() => { void refetch(); }, 5000);
    return () => clearInterval(t);
  }, [refetch]);

  const stuurBericht = useCreateChatBericht();
  const markeerGelezen = useMarkeerChatGelezen();

  // Scroll to bottom when messages load/change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [berichten]);

  // Mark as read on mount and when messages arrive
  useEffect(() => {
    markeerGelezen.mutate({ id: gesprekId });
    void queryClient.invalidateQueries({ queryKey: getListChatGesprekkenQueryKey() });
  }, [gesprekId, berichten?.length]);

  async function verzend() {
    if (!inputText.trim() || verzending) return;
    setVerzending(true);
    try {
      await stuurBericht.mutateAsync({
        id: gesprekId,
        data: { inhoud: inputText.trim() },
      });
      setInputText("");
      await refetch();
      await queryClient.invalidateQueries({ queryKey: getListChatGesprekkenQueryKey() });
    } finally {
      setVerzending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void verzend();
    }
  }

  const gesorteerdeBerichten = [...(berichten ?? [])].reverse();

  return (
    <div className="flex flex-col h-full">
      {onTerug && (
        <div className="flex items-center gap-2 p-3 border-b">
          <button onClick={onTerug} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {gesorteerdeBerichten.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <MessageSquare size={32} />
            <p className="text-sm">Nog geen berichten. Stuur als eerste een bericht.</p>
          </div>
        )}
        {gesorteerdeBerichten.map((b) => (
          <BerichtBel key={b.id} bericht={b} isEigen={b.afzender_id === mijnId} />
        ))}
      </div>
      <div className="border-t p-3 flex gap-2">
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Typ een bericht..."
          disabled={verzending}
          className="flex-1"
        />
        <Button
          onClick={() => void verzend()}
          disabled={!inputText.trim() || verzending}
          size="icon"
          variant="default"
        >
          <Send size={16} />
        </Button>
      </div>
    </div>
  );
}

function GebruikerKiezerDialog({
  open,
  onOpenChange,
  onGesprekAangemaakt,
  mijnId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onGesprekAangemaakt: (id: number) => void;
  mijnId: number;
}) {
  const [zoek, setZoek] = useState("");
  const [geselecteerd, setGeselecteerd] = useState<number[]>([]);
  const [groepNaam, setGroepNaam] = useState("");
  const [bezig, setBezig] = useState(false);

  const { data: gebruikers } = useListChatGebruikers();
  const maakGesprek = useCreateChatGesprek();

  const gefilterd = (gebruikers ?? []).filter(
    (g) =>
      g.id !== mijnId &&
      (g.naam.toLowerCase().includes(zoek.toLowerCase()) ||
        g.email.toLowerCase().includes(zoek.toLowerCase())),
  );

  function toggleGebruiker(id: number) {
    setGeselecteerd((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }

  async function aanmaken() {
    if (geselecteerd.length === 0 || bezig) return;
    setBezig(true);
    try {
      const type = geselecteerd.length > 1 ? "groep" : "direct";
      const result = await maakGesprek.mutateAsync({
        data: {
          type,
          naam: type === "groep" ? (groepNaam || undefined) : undefined,
          deelnemer_ids: geselecteerd,
        },
      });
      onGesprekAangemaakt(result.id);
      onOpenChange(false);
      setGeselecteerd([]);
      setZoek("");
      setGroepNaam("");
    } finally {
      setBezig(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuw gesprek starten</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 border rounded-md px-3">
            <Search size={14} className="text-muted-foreground" />
            <input
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              placeholder="Zoek medewerker..."
              className="flex-1 py-2 text-sm outline-none bg-transparent"
            />
          </div>
          {geselecteerd.length > 1 && (
            <Input
              value={groepNaam}
              onChange={(e) => setGroepNaam(e.target.value)}
              placeholder="Naam van de groep (optioneel)"
            />
          )}
          <div className="max-h-64 overflow-y-auto space-y-1">
            {gefilterd.map((g) => (
              <button
                key={g.id}
                onClick={() => toggleGebruiker(g.id)}
                className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
                  geselecteerd.includes(g.id)
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
                }`}
              >
                <AvatarRond naam={g.naam} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{g.naam}</div>
                  <div className="text-xs text-muted-foreground truncate">{g.email}</div>
                </div>
                {geselecteerd.includes(g.id) && (
                  <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-[10px] text-white font-bold">✓</span>
                  </div>
                )}
              </button>
            ))}
            {gefilterd.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Geen medewerkers gevonden
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuleren
            </Button>
            <Button
              onClick={() => void aanmaken()}
              disabled={geselecteerd.length === 0 || bezig}
            >
              {geselecteerd.length > 1 ? "Groepsgesprek starten" : "Starten"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BerichtenPagina() {
  const { gebruiker } = useAuth();
  const mijnId = gebruiker?.id ?? 0;
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [zoekterm, setZoekterm] = useState("");
  const [pickOpen, setPickOpen] = useState(false);

  const { data: gesprekken, refetch: refetchGesprekken } = useListChatGesprekken();

  useEffect(() => {
    const t = setInterval(() => { void refetchGesprekken(); }, 10000);
    return () => clearInterval(t);
  }, [refetchGesprekken]);

  const gefilterd = (gesprekken ?? []).filter((g) => {
    if (!zoekterm) return true;
    const naam = gesprekNaam(g, mijnId).toLowerCase();
    return naam.includes(zoekterm.toLowerCase());
  });

  const geselecteerdGesprek = gesprekken?.find((g) => g.id === selectedId);

  function selecteer(id: number) {
    setSelectedId(id);
  }

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Linkerpaneel: gesprekkenlijst */}
      <div className="w-80 flex flex-col border-r flex-shrink-0">
        <div className="p-3 border-b flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 border rounded-md px-2.5 py-1.5 bg-muted/40">
            <Search size={13} className="text-muted-foreground" />
            <input
              value={zoekterm}
              onChange={(e) => setZoekterm(e.target.value)}
              placeholder="Zoeken..."
              className="flex-1 text-sm outline-none bg-transparent"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPickOpen(true)}
            title="Nieuw gesprek"
          >
            <Plus size={18} />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {gefilterd.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground px-4">
              <MessageSquare size={28} />
              <p className="text-sm text-center">
                {zoekterm ? "Geen gesprekken gevonden" : "Nog geen gesprekken. Klik + om te starten."}
              </p>
            </div>
          )}
          {gefilterd.map((g) => {
            const naam = gesprekNaam(g, mijnId);
            const isActief = g.id === selectedId;
            return (
              <button
                key={g.id}
                onClick={() => selecteer(g.id)}
                className={`w-full flex items-start gap-3 p-3 border-b text-left transition-colors ${
                  isActief ? "bg-primary/8 border-l-2 border-l-primary" : "hover:bg-muted/50"
                }`}
              >
                {g.type === "groep" ? (
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                    <Users size={16} className="text-blue-700" />
                  </div>
                ) : (
                  <AvatarRond naam={naam} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className={`text-sm truncate ${g.ongelezen_aantal > 0 ? "font-semibold" : "font-medium"}`}>
                      {naam}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {g.laatste_bericht ? formatTijdstip(g.laatste_bericht.aangemaakt_op) : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs text-muted-foreground truncate">
                      {g.laatste_bericht
                        ? (g.laatste_bericht.afzender_id === mijnId ? "Jij: " : "") +
                          g.laatste_bericht.inhoud
                        : "Nog geen berichten"}
                    </p>
                    {g.ongelezen_aantal > 0 && (
                      <Badge className="text-[10px] px-1.5 py-0 min-w-5 flex-shrink-0 h-4 bg-primary">
                        {g.ongelezen_aantal}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </ScrollArea>
      </div>

      {/* Rechterpaneel: chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedId && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <MessageSquare size={40} />
            <p className="text-base font-medium">Selecteer een gesprek</p>
            <p className="text-sm">of</p>
            <Button variant="outline" onClick={() => setPickOpen(true)}>
              <Plus size={14} className="mr-1.5" />
              Nieuw gesprek starten
            </Button>
          </div>
        )}

        {selectedId && geselecteerdGesprek && (
          <>
            {/* Koptekst gesprek */}
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              {geselecteerdGesprek.type === "groep" ? (
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users size={14} className="text-blue-700" />
                </div>
              ) : (
                <AvatarRond naam={gesprekNaam(geselecteerdGesprek, mijnId)} size={32} />
              )}
              <div>
                <div className="text-sm font-semibold">
                  {gesprekNaam(geselecteerdGesprek, mijnId)}
                </div>
                {geselecteerdGesprek.type === "groep" && (
                  <div className="text-xs text-muted-foreground">
                    {geselecteerdGesprek.deelnemers.length} deelnemers
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <GespreksPanel gesprekId={selectedId} mijnId={mijnId} />
            </div>
          </>
        )}
      </div>

      <GebruikerKiezerDialog
        open={pickOpen}
        onOpenChange={setPickOpen}
        mijnId={mijnId}
        onGesprekAangemaakt={(id) => {
          void queryClient.invalidateQueries({ queryKey: getListChatGesprekkenQueryKey() });
          setSelectedId(id);
        }}
      />
    </div>
  );
}

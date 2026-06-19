import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  useListChatGesprekken,
  useListChatBerichten,
  useCreateChatBericht,
  useMarkeerChatGelezen,
  useCreateChatGesprek,
  useListChatGebruikers,
  getListChatGesprekkenQueryKey,
  type ChatGesprek,
  type ChatBericht,
  type ChatGebruiker,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/auth-context";
import { useUpload } from "@workspace/object-storage-web";
import {
  MessageSquare,
  Plus,
  Send,
  Users,
  Search,
  X,
  Paperclip,
  FileText,
  RotateCcw,
  Video,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function bijlageUrlNaarApi(pad: string | null | undefined): string | null {
  if (!pad) return null;
  return pad.startsWith("/objects/")
    ? `/api/storage/objects/${pad.slice("/objects/".length)}`
    : pad;
}

function detecteerType(file: File): "foto" | "video" | "bestand" {
  if (file.type.startsWith("image/")) return "foto";
  if (file.type.startsWith("video/")) return "video";
  return "bestand";
}

// ─── AvatarRond ───────────────────────────────────────────────────────────────

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

// ─── BerichtBel ───────────────────────────────────────────────────────────────

function BerichtBel({ bericht, isEigen }: { bericht: ChatBericht; isEigen: boolean }) {
  const [vergroot, setVergroot] = useState(false);
  const apiUrl = bijlageUrlNaarApi(bericht.bijlage_url);
  const isAfbeelding = bericht.bijlage_type === "foto";
  const isVideo = bericht.bijlage_type === "video";
  const isBijlage = !!bericht.bijlage_url && !isAfbeelding && !isVideo;

  const bubbleBase = isEigen
    ? "bg-primary text-primary-foreground rounded-br-sm"
    : "bg-muted text-foreground rounded-bl-sm";

  const tijdstipKlasse = `text-[10px] mt-0.5 ${
    isEigen ? "text-primary-foreground/70 text-right" : "text-muted-foreground"
  }`;

  if (isAfbeelding && apiUrl) {
    return (
      <div className={`flex ${isEigen ? "justify-end" : "justify-start"} mb-1`}>
        <div className={`max-w-[72%] rounded-2xl overflow-hidden text-sm ${bubbleBase}`}>
          {!isEigen && bericht.afzender_naam && (
            <div className="text-[10px] font-semibold px-3 pt-2 opacity-70">
              {bericht.afzender_naam}
            </div>
          )}
          <img
            src={apiUrl}
            alt=""
            loading="lazy"
            className="max-w-full max-h-60 object-cover cursor-pointer block"
            onClick={() => setVergroot(true)}
          />
          {bericht.inhoud ? (
            <div className="px-3 pt-1.5">
              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                {bericht.inhoud}
              </p>
            </div>
          ) : null}
          <div className={`${tijdstipKlasse} px-3 pb-2`}>{formatTijdstip(bericht.aangemaakt_op)}</div>
        </div>
        {vergroot &&
          createPortal(
            <div
              className="fixed inset-0 z-[100] bg-black/92 flex items-center justify-center p-4"
              onClick={() => setVergroot(false)}
            >
              <img src={apiUrl} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
            </div>,
            document.body,
          )}
      </div>
    );
  }

  if (isVideo && apiUrl) {
    return (
      <div className={`flex ${isEigen ? "justify-end" : "justify-start"} mb-1`}>
        <div className={`max-w-[72%] rounded-2xl overflow-hidden text-sm ${bubbleBase}`}>
          {!isEigen && bericht.afzender_naam && (
            <div className="text-[10px] font-semibold px-3 pt-2 opacity-70">
              {bericht.afzender_naam}
            </div>
          )}
          <video src={apiUrl} controls className="max-w-full max-h-48 block" />
          <div className={`${tijdstipKlasse} px-3 pb-2`}>{formatTijdstip(bericht.aangemaakt_op)}</div>
        </div>
      </div>
    );
  }

  if (isBijlage && apiUrl) {
    return (
      <div className={`flex ${isEigen ? "justify-end" : "justify-start"} mb-1`}>
        <div className={`max-w-[72%] rounded-2xl px-3 py-2 text-sm ${bubbleBase}`}>
          {!isEigen && bericht.afzender_naam && (
            <div className="text-[10px] font-semibold mb-1 opacity-70">{bericht.afzender_naam}</div>
          )}
          <a
            href={apiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 rounded-lg px-3 py-2 mb-1 transition ${
              isEigen ? "bg-white/20 hover:bg-white/30" : "bg-black/10 hover:bg-black/15"
            }`}
          >
            <FileText size={16} className="flex-shrink-0" />
            <span className="text-xs truncate">{bericht.inhoud || "Bestand"}</span>
          </a>
          <div className={tijdstipKlasse}>{formatTijdstip(bericht.aangemaakt_op)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isEigen ? "justify-end" : "justify-start"} mb-1`}>
      <div
        className={`max-w-[72%] rounded-2xl px-3 py-2 text-sm ${bubbleBase}`}
      >
        {!isEigen && bericht.afzender_naam && (
          <div className="text-[10px] font-semibold mb-0.5 opacity-70">
            {bericht.afzender_naam}
          </div>
        )}
        <p className="whitespace-pre-wrap break-words leading-relaxed">{bericht.inhoud}</p>
        <div className={tijdstipKlasse}>{formatTijdstip(bericht.aangemaakt_op)}</div>
      </div>
    </div>
  );
}

// ─── FotoBewerker ─────────────────────────────────────────────────────────────

function FotoBewerker({
  afbeelding,
  onBevestig,
  onAnnuleer,
}: {
  afbeelding: File;
  onBevestig: (geannoteerd: File) => void;
  onAnnuleer: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [kleur, setKleur] = useState("#ef4444");
  const [dikte, setDikte] = useState(4);
  const [isTekenen, setIsTekenen] = useState(false);
  const [geschiedenis, setGeschiedenis] = useState<ImageData[]>([]);
  const [geladen, setGeladen] = useState(false);
  const prevPosRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(afbeelding);
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      setGeladen(true);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [afbeelding]);

  function schaalPos(e: React.MouseEvent<HTMLCanvasElement>): [number, number] {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [
      (e.clientX - rect.left) * (canvas.width / rect.width),
      (e.clientY - rect.top) * (canvas.height / rect.height),
    ];
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    setGeschiedenis((prev) => [
      ...prev,
      ctx.getImageData(0, 0, canvas.width, canvas.height),
    ]);
    const pos = schaalPos(e);
    prevPosRef.current = pos;
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], dikte / 2, 0, Math.PI * 2);
    ctx.fillStyle = kleur;
    ctx.fill();
    setIsTekenen(true);
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isTekenen || !prevPosRef.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = schaalPos(e);
    ctx.beginPath();
    ctx.moveTo(prevPosRef.current[0], prevPosRef.current[1]);
    ctx.lineTo(pos[0], pos[1]);
    ctx.strokeStyle = kleur;
    ctx.lineWidth = dikte;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    prevPosRef.current = pos;
  }

  function onMouseUp() {
    setIsTekenen(false);
    prevPosRef.current = null;
  }

  function ongedaanMaken() {
    if (geschiedenis.length === 0) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(geschiedenis[geschiedenis.length - 1], 0, 0);
    setGeschiedenis((prev) => prev.slice(0, -1));
  }

  function bevestig() {
    const canvas = canvasRef.current!;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const naam = afbeelding.name.replace(/\.[^.]+$/, ".jpg");
        onBevestig(new File([blob], naam, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }

  const kleuren = ["#ef4444", "#000000", "#f59e0b", "#3b82f6", "#22c55e", "#ffffff"];

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col select-none">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <Button
          variant="ghost"
          size="icon"
          onClick={onAnnuleer}
          className="text-white/70 hover:text-white hover:bg-white/10"
        >
          <X size={18} />
        </Button>
        <span className="text-white font-medium flex-1 text-sm">Foto bewerken</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={ongedaanMaken}
          disabled={geschiedenis.length === 0}
          className="text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30"
        >
          <RotateCcw size={16} />
        </Button>
        <Button
          size="sm"
          onClick={bevestig}
          disabled={!geladen}
          className="bg-primary hover:bg-primary/90 text-white rounded-full px-5"
        >
          Versturen
        </Button>
      </div>

      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10">
        {kleuren.map((k) => (
          <button
            key={k}
            onClick={() => setKleur(k)}
            className="rounded-full border-2 transition-all flex-shrink-0"
            style={{
              width: 24,
              height: 24,
              backgroundColor: k,
              borderColor: kleur === k ? "#fff" : "transparent",
              transform: kleur === k ? "scale(1.35)" : "scale(1)",
            }}
          />
        ))}
        <div className="w-px h-5 bg-white/20 mx-1" />
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-white/50 flex-shrink-0" />
          <input
            type="range"
            min={2}
            max={16}
            value={dikte}
            onChange={(e) => setDikte(parseInt(e.target.value, 10))}
            className="w-24 accent-primary"
          />
          <div className="w-4 h-4 rounded-full bg-white/50 flex-shrink-0" />
        </div>
      </div>

      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        {!geladen && <p className="text-white/40 text-sm">Laden...</p>}
        <canvas
          ref={canvasRef}
          className={`max-w-full max-h-full rounded-lg cursor-crosshair ${!geladen ? "hidden" : ""}`}
          style={{ touchAction: "none" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />
      </div>
    </div>,
    document.body,
  );
}

// ─── BijlageVoorbeeldBalk ─────────────────────────────────────────────────────

function BijlageVoorbeeldBalk({
  bestand,
  type,
  preview,
  bezig,
  onVerwijder,
  onBewerken,
}: {
  bestand: File;
  type: "foto" | "video" | "bestand";
  preview: string | null;
  bezig: boolean;
  onVerwijder: () => void;
  onBewerken?: () => void;
}) {
  return (
    <div className="border-t px-3 pt-2 pb-1 bg-muted/30 flex items-center gap-3">
      {type === "foto" && preview ? (
        <img
          src={preview}
          alt=""
          className="w-14 h-14 object-cover rounded-lg flex-shrink-0"
        />
      ) : type === "video" ? (
        <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <Video size={22} className="text-muted-foreground" />
        </div>
      ) : (
        <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <FileText size={22} className="text-muted-foreground" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{bestand.name}</p>
        <p className="text-xs text-muted-foreground">
          {bezig ? "Uploaden..." : `${(bestand.size / 1024).toFixed(0)} KB`}
        </p>
      </div>

      {type === "foto" && onBewerken && !bezig && (
        <Button
          variant="outline"
          size="sm"
          onClick={onBewerken}
          className="text-xs flex-shrink-0"
        >
          Bewerken
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={onVerwijder}
        disabled={bezig}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X size={16} />
      </Button>
    </div>
  );
}

// ─── GespreksPanel ─────────────────────────────────────────────────────────────

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
  const [bijlageBestand, setBijlageBestand] = useState<File | null>(null);
  const [bijlageType, setBijlageType] = useState<"foto" | "video" | "bestand" | null>(null);
  const [bijlagePreview, setBijlagePreview] = useState<string | null>(null);
  const [toonBewerker, setToonBewerker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bestandInputRef = useRef<HTMLInputElement>(null);

  const { uploadFile, isUploading } = useUpload({ bestand_type: "bijlage" });
  const { data: berichten, refetch } = useListChatBerichten(gesprekId);
  const stuurBericht = useCreateChatBericht();
  const markeerGelezen = useMarkeerChatGelezen();

  useEffect(() => {
    const t = setInterval(() => {
      void refetch();
    }, 5000);
    return () => clearInterval(t);
  }, [refetch]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [berichten]);

  useEffect(() => {
    markeerGelezen.mutate({ id: gesprekId });
    void queryClient.invalidateQueries({ queryKey: getListChatGesprekkenQueryKey() });
  }, [gesprekId, berichten?.length]);

  function onBestandGekozen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const type = detecteerType(file);
    setBijlageBestand(file);
    setBijlageType(type);
    if (type === "foto" || type === "video") {
      setBijlagePreview(URL.createObjectURL(file));
    } else {
      setBijlagePreview(null);
    }
  }

  function verwijderBijlage() {
    if (bijlagePreview) URL.revokeObjectURL(bijlagePreview);
    setBijlageBestand(null);
    setBijlageType(null);
    setBijlagePreview(null);
  }

  function onFotoBewerkt(geannoteerd: File) {
    if (bijlagePreview) URL.revokeObjectURL(bijlagePreview);
    setBijlageBestand(geannoteerd);
    setBijlagePreview(URL.createObjectURL(geannoteerd));
    setToonBewerker(false);
  }

  async function verzend() {
    if ((!inputText.trim() && !bijlageBestand) || verzending) return;
    setVerzending(true);
    try {
      let objectPath: string | null = null;
      let berichtInhoud = inputText.trim();

      if (bijlageBestand) {
        const result = await uploadFile(bijlageBestand);
        if (!result) return;
        objectPath = result.objectPath;
        if (bijlageType === "bestand" && !berichtInhoud) {
          berichtInhoud = bijlageBestand.name;
        }
      }

      await stuurBericht.mutateAsync({
        id: gesprekId,
        data: {
          inhoud: berichtInhoud,
          bijlage_url: objectPath ?? undefined,
          bijlage_type: bijlageType ?? undefined,
        },
      });

      setInputText("");
      verwijderBijlage();
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
  const kanVerzenden = (!!inputText.trim() || !!bijlageBestand) && !verzending;

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

      {bijlageBestand && bijlageType && (
        <BijlageVoorbeeldBalk
          bestand={bijlageBestand}
          type={bijlageType}
          preview={bijlagePreview}
          bezig={isUploading || verzending}
          onVerwijder={verwijderBijlage}
          onBewerken={bijlageType === "foto" ? () => setToonBewerker(true) : undefined}
        />
      )}

      <div className="border-t p-3 flex gap-2 items-center">
        <input
          ref={bestandInputRef}
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx,.xlsx,.xls,.txt,.zip,.rar"
          className="hidden"
          onChange={onBestandGekozen}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => bestandInputRef.current?.click()}
          disabled={verzending}
          title="Bijlage toevoegen"
          className="text-muted-foreground hover:text-foreground flex-shrink-0"
        >
          <Paperclip size={18} />
        </Button>
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={bijlageBestand ? "Bijschrift toevoegen (optioneel)..." : "Typ een bericht..."}
          disabled={verzending}
          className="flex-1"
        />
        <Button
          onClick={() => void verzend()}
          disabled={!kanVerzenden}
          size="icon"
          variant="default"
          className="flex-shrink-0"
        >
          {isUploading || verzending ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </Button>
      </div>

      {toonBewerker && bijlageBestand && bijlageType === "foto" && (
        <FotoBewerker
          afbeelding={bijlageBestand}
          onBevestig={onFotoBewerkt}
          onAnnuleer={() => setToonBewerker(false)}
        />
      )}
    </div>
  );
}

// ─── GebruikerKiezerDialog ────────────────────────────────────────────────────

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

// ─── BerichtenPagina ──────────────────────────────────────────────────────────

export default function BerichtenPagina() {
  const { gebruiker } = useAuth();
  const mijnId = gebruiker?.id ?? 0;
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [zoekterm, setZoekterm] = useState("");
  const [pickOpen, setPickOpen] = useState(false);

  const { data: gesprekken, refetch: refetchGesprekken } = useListChatGesprekken();

  useEffect(() => {
    const t = setInterval(() => {
      void refetchGesprekken();
    }, 10000);
    return () => clearInterval(t);
  }, [refetchGesprekken]);

  const gefilterd = (gesprekken ?? []).filter((g) => {
    if (!zoekterm) return true;
    const naam = gesprekNaam(g, mijnId).toLowerCase();
    return naam.includes(zoekterm.toLowerCase());
  });

  const geselecteerdGesprek = gesprekken?.find((g) => g.id === selectedId);

  return (
    <div className="flex h-[calc(100vh-64px)]">
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
                {zoekterm
                  ? "Geen gesprekken gevonden"
                  : "Nog geen gesprekken. Klik + om te starten."}
              </p>
            </div>
          )}
          {gefilterd.map((g) => {
            const naam = gesprekNaam(g, mijnId);
            const isActief = g.id === selectedId;
            return (
              <button
                key={g.id}
                onClick={() => setSelectedId(g.id)}
                className={`w-full flex items-start gap-3 p-3 border-b text-left transition-colors ${
                  isActief
                    ? "bg-primary/8 border-l-2 border-l-primary"
                    : "hover:bg-muted/50"
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
                    <span
                      className={`text-sm truncate ${
                        g.ongelezen_aantal > 0 ? "font-semibold" : "font-medium"
                      }`}
                    >
                      {naam}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {g.laatste_bericht
                        ? formatTijdstip(g.laatste_bericht.aangemaakt_op)
                        : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs text-muted-foreground truncate">
                      {g.laatste_bericht
                        ? (g.laatste_bericht.bijlage_type === "foto"
                            ? "Foto"
                            : g.laatste_bericht.bijlage_type === "video"
                              ? "Video"
                              : g.laatste_bericht.bijlage_type === "bestand"
                                ? "Bestand"
                                : (g.laatste_bericht.afzender_id === mijnId
                                    ? "Jij: "
                                    : "") + g.laatste_bericht.inhoud)
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
              <GespreksPanel
                gesprekId={selectedId}
                mijnId={mijnId}
              />
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

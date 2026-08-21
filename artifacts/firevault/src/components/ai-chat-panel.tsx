import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Send, ImagePlus, X, Sparkles, Loader2, Bot, User, AlertTriangle, ExternalLink
} from "lucide-react";
import type { AiChatBericht } from "@workspace/api-client-react";
import { Link } from "wouter";

export interface AssistentCitatie {
  label: string;
  bron: string;
  entiteitstype?: string | null;
  entiteit_id?: number | null;
  href?: string | null;
}

export interface Bericht {
  rol: "gebruiker" | "assistent";
  inhoud: string;
  citaties?: AssistentCitatie[];
}

export interface AiChatAntwoordExtended {
  antwoord: string;
  signalen?: string[];
  citaties?: AssistentCitatie[];
  vervangGesprek?: boolean;
}

interface AiChatPanelProps {
  onVerstuur: (
    berichten: AiChatBericht[],
    afbeelding_base64?: string | null,
  ) => Promise<AiChatAntwoordExtended | null>;
  isLaden?: boolean;
  snelleActies?: string[];
  placeholder?: string;
  className?: string;
  berichten?: Bericht[];
  setBerichten?: React.Dispatch<React.SetStateAction<Bericht[]>>;
  invoer?: string;
  setInvoer?: React.Dispatch<React.SetStateAction<string>>;
  bezig?: boolean;
  setBezig?: React.Dispatch<React.SetStateAction<boolean>>;
  signalen?: string[];
  setSignalen?: React.Dispatch<React.SetStateAction<string[]>>;
  zonderAfbeeldingen?: boolean;
}

export interface AiChatPanelRef {
  verstuur: (tekst: string, afb?: string | null) => void;
}

function renderTextMetCitaties(tekst: string, citaties?: AssistentCitatie[]) {
  if (!citaties || citaties.length === 0) {
    return tekst.split("\n").map((regel, j) => (
      <span key={j}>
        {regel}
        {j < tekst.split("\n").length - 1 && <br />}
      </span>
    ));
  }

  return (
    <div className="space-y-2">
      <div>
        {tekst.split("\n").map((regel, j) => (
          <span key={j}>
            {regel}
            {j < tekst.split("\n").length - 1 && <br />}
          </span>
        ))}
      </div>
      <div className="pt-2 mt-2 border-t border-border/50 flex flex-col gap-1.5" data-testid="assistent-citaties">
        <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Bronnen:</span>
        <div className="flex flex-wrap gap-1.5">
          {citaties.map((cit, i) => {
            const magLinken = cit.href && cit.href.startsWith("/") && !cit.href.startsWith("//");
            const content = (
              <span className="inline-flex items-center gap-1 bg-background border border-border rounded px-1.5 py-0.5 text-xs text-foreground hover:bg-muted transition-colors max-w-full">
                <span className="font-semibold shrink-0">[{i + 1}]</span>
                <span className="truncate" title={`${cit.bron}: ${cit.label}`}>{cit.bron}</span>
                {magLinken && <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50" />}
              </span>
            );
            if (magLinken) {
              return <Link key={i} href={cit.href!} data-testid="assistent-citatie-link">{content}</Link>;
            }
            return <span key={i} title={cit.label} data-testid="assistent-citatie-text">{content}</span>;
          })}
        </div>
      </div>
    </div>
  );
}

const AiChatPanel = forwardRef<AiChatPanelRef, AiChatPanelProps>(({
  onVerstuur,
  isLaden = false,
  snelleActies = [
    "Controleer volledigheid van de regels",
    "Controleer of de eenheden kloppen",
    "Ontbreken er posten voor dit type project?",
    "Zijn de tarieven realistisch voor brandpreventie?",
  ],
  placeholder = "Stel een vraag over de technische uitvoering, eenheden of volledigheid...",
  className,
  berichten: propBerichten,
  setBerichten: propSetBerichten,
  invoer: propInvoer,
  setInvoer: propSetInvoer,
  bezig: propBezig,
  setBezig: propSetBezig,
  signalen: propSignalen,
  setSignalen: propSetSignalen,
  zonderAfbeeldingen = false,
}, ref) => {
  const [lokaleBerichten, setLokaleBerichten] = useState<Bericht[]>([]);
  const [lokaleInvoer, setLokaleInvoer] = useState("");
  const [lokaalBezig, setLokaleBezig] = useState(false);
  const [lokaleSignalen, setLokaleSignalen] = useState<string[]>([]);

  const berichten = propBerichten ?? lokaleBerichten;
  const setBerichten = propSetBerichten ?? setLokaleBerichten;
  const invoer = propInvoer ?? lokaleInvoer;
  const setInvoer = propSetInvoer ?? setLokaleInvoer;
  const bezig = propBezig ?? lokaalBezig;
  const setBezig = propSetBezig ?? setLokaleBezig;
  const signalen = propSignalen ?? lokaleSignalen;
  const setSignalen = propSetSignalen ?? setLokaleSignalen;

  const [afbeeldingBase64, setAfbeeldingBase64] = useState<string | null>(null);
  const [afbeeldingNaam, setAfbeeldingNaam] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [berichten, bezig]);

  const verstuur = useCallback(async (tekst: string, afb?: string | null) => {
    const bijgesneden = tekst.trim();
    if (!bijgesneden && !afb) return;
    if (bezig) return;

    const gebruikerBericht: Bericht = { rol: "gebruiker", inhoud: bijgesneden || "(schets bijgevoegd)" };
    const nieuweBerichten = [...berichten, gebruikerBericht];
    setBerichten(nieuweBerichten);
    setInvoer("");
    setAfbeeldingBase64(null);
    setAfbeeldingNaam(null);
    setBezig(true);

    try {
      const apiInput: AiChatBericht[] = nieuweBerichten.map(b => ({
        rol: b.rol,
        inhoud: b.inhoud,
      }));
      const resultaat = await onVerstuur(apiInput, afb ?? null);
      if (!resultaat) return;
      const antwoordBericht: Bericht = {
        rol: "assistent",
        inhoud: resultaat.antwoord,
        citaties: resultaat.citaties
      };
      setBerichten(prev => resultaat.vervangGesprek
        ? [gebruikerBericht, antwoordBericht]
        : [...prev, antwoordBericht]);
      if (resultaat.signalen && resultaat.signalen.length > 0) {
        setSignalen(resultaat.signalen);
      }
    } catch {
      setBerichten(prev => [...prev, {
        rol: "assistent",
        inhoud: "Er is een fout opgetreden. Probeer het opnieuw.",
      }]);
    } finally {
      setBezig(false);
    }
  }, [berichten, bezig, onVerstuur, setBerichten, setInvoer, setBezig, setSignalen]);

  useImperativeHandle(ref, () => ({
    verstuur
  }), [verstuur]);

  const handleSnelleActie = (actie: string) => {
    verstuur(actie);
  };

  const handleAfbeeldingKiezen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      const base64 = result.split(",")[1] ?? "";
      setAfbeeldingBase64(base64);
      setAfbeeldingNaam(bestand.name);
    };
    reader.readAsDataURL(bestand);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      verstuur(invoer, afbeeldingBase64);
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-background border-l", className)}>
      {/* Paneel-kop */}
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30 shrink-0">
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">AI-assistent</p>
          <p className="text-xs text-muted-foreground">Ondersteuning voor Connect</p>
        </div>
      </div>

      {/* Signalen */}
      {signalen.length > 0 && (
        <div className="px-4 py-2 border-b bg-amber-50 shrink-0">
          {signalen.map((s, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-amber-800">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* Berichtenlijst */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0"
      >
        {berichten.length === 0 && !bezig && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex-1 bg-muted/40 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                Hallo! Ik help je bij het beoordelen van gegevens en beantwoord vragen over je werk. Stel een vraag of kies een snelle actie hieronder.
              </div>
            </div>

            <div className="space-y-1.5 pl-9">
              <p className="text-xs text-muted-foreground font-medium">Snelle acties</p>
              {snelleActies.map((actie) => (
                <button
                  key={actie}
                  type="button"
                  onClick={() => handleSnelleActie(actie)}
                  className="w-full text-left text-xs px-3 py-2 rounded-md border border-border hover:bg-muted/60 transition-colors text-foreground"
                >
                  {actie}
                </button>
              ))}
            </div>
          </div>
        )}

        {berichten.map((b, i) => (
          <div
            key={i}
            className={cn("flex items-start gap-2.5", b.rol === "gebruiker" && "flex-row-reverse")}
          >
            <div className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
              b.rol === "assistent" ? "bg-primary/10" : "bg-muted"
            )}>
              {b.rol === "assistent"
                ? <Bot className="h-3.5 w-3.5 text-primary" />
                : <User className="h-3.5 w-3.5 text-muted-foreground" />
              }
            </div>
            <div className={cn(
              "max-w-[85%] rounded-lg px-3 py-2 text-sm",
              b.rol === "assistent"
                ? "bg-muted/40 text-foreground"
                : "bg-primary text-primary-foreground"
            )}>
              {b.rol === "assistent"
                ? renderTextMetCitaties(b.inhoud, b.citaties)
                : b.inhoud.split("\n").map((regel, j) => (
                  <span key={j}>
                    {regel}
                    {j < b.inhoud.split("\n").length - 1 && <br />}
                  </span>
                ))
              }
            </div>
          </div>
        ))}

        {bezig && (
          <div className="flex items-start gap-2.5">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="bg-muted/40 rounded-lg px-3 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Invoergebied */}
      <div className="px-4 py-3 border-t bg-background shrink-0 space-y-2">
        {afbeeldingNaam && !zonderAfbeeldingen && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-md border text-xs">
            <ImagePlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate text-muted-foreground">{afbeeldingNaam}</span>
            <button
              type="button"
              onClick={() => { setAfbeeldingBase64(null); setAfbeeldingNaam(null); }}
              className="hover:text-foreground text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex gap-2 items-end">
          <Textarea
            value={invoer}
            onChange={e => setInvoer(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={2}
            className="resize-none text-sm flex-1 min-h-0"
            disabled={bezig || isLaden}
          />
          <div className="flex flex-col gap-1.5">
            {!zonderAfbeeldingen && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAfbeeldingKiezen}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={bezig || isLaden}
                  title="Schets of tekening uploaden"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            <Button
              type="button"
              size="icon"
              className={cn("w-8", zonderAfbeeldingen ? "h-10" : "h-8")}
              onClick={() => verstuur(invoer, afbeeldingBase64)}
              disabled={bezig || isLaden || (!invoer.trim() && !afbeeldingBase64)}
            >
              {bezig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Enter = verzenden  ·  Shift+Enter = nieuwe regel
          {!zonderAfbeeldingen && "  ·  Uploaden voor schetsen en tekeningen"}
        </p>
      </div>
    </div>
  );
});

AiChatPanel.displayName = "AiChatPanel";
export default AiChatPanel;

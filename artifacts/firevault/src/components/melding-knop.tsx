import { useState, useRef, useCallback } from "react";
import { Bug, Camera, ChevronDown, X } from "lucide-react";
import { useCreateMelding } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";

type Stap = "formulier" | "bevestigd";

const TYPE_LABELS: Record<string, string> = {
  bug: "Bug melden",
  vraag: "Vraag stellen",
  verbetering: "Verbetersuggestie",
};

const URGENTIE_LABELS: Record<string, string> = {
  laag: "Laag",
  normaal: "Normaal",
  hoog: "Hoog",
  blokkerend: "Blokkerend — kan niet verder werken",
};

function leesActueleRol(): string {
  try {
    const match = document.cookie.match(/fps_rol=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

export function MeldingKnop() {
  // APP_01 §5.3 — bugmeldingen horen bij wie het systeem bewaakt, niet in de
  // topbalk van iedere gebruiker. Zichtbaar met de module `systeem` (niveau 1+).
  const { heeftNiveau } = useBevoegdheid();
  const magMelden = heeftNiveau("systeem", 1);
  const [open, setOpen] = useState(false);
  const [stap, setStap] = useState<Stap>("formulier");
  const [type, setType] = useState("bug");
  const [urgentie, setUrgentie] = useState("normaal");
  const [omschrijving, setOmschrijving] = useState("");
  const [techToestemming, setTechToestemming] = useState(false);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [aiReactie, setAiReactie] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [location] = useLocation();
  const { toast } = useToast();

  const melding = useCreateMelding();

  function reset() {
    setStap("formulier");
    setType("bug");
    setUrgentie("normaal");
    setOmschrijving("");
    setTechToestemming(false);
    setScreenshotPreview(null);
    setScreenshotData(null);
    setAiReactie(null);
  }

  function sluit() {
    setOpen(false);
    setTimeout(reset, 300);
  }

  function leesScreenshot(bestand: File) {
    if (bestand.size > 2_000_000) {
      toast({ title: "Screenshot te groot", description: "Maximaal 2 MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result as string;
      setScreenshotData(data);
      setScreenshotPreview(data);
    };
    reader.readAsDataURL(bestand);
  }

  const verwerkBestand = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const bestand = e.target.files?.[0];
    if (bestand) leesScreenshot(bestand);
    e.target.value = "";
  }, []);

  const verwijderScreenshot = useCallback(() => {
    setScreenshotData(null);
    setScreenshotPreview(null);
  }, []);

  async function dien() {
    if (!omschrijving.trim()) {
      toast({ title: "Omschrijving ontbreekt", variant: "destructive" });
      return;
    }

    const browserInfo = `${navigator.userAgent} | ${window.innerWidth}x${window.innerHeight}`;
    const techContext = techToestemming
      ? JSON.stringify({
          url: window.location.href,
          userAgent: navigator.userAgent,
          venster: `${window.innerWidth}x${window.innerHeight}`,
          platform: navigator.platform,
          taal: navigator.language,
          tijdstip: new Date().toISOString(),
        })
      : undefined;

    try {
      const resultaat = await melding.mutateAsync({
        data: {
          type: type as "bug" | "vraag" | "verbetering",
          omschrijving: omschrijving.trim(),
          urgentie: urgentie as "laag" | "normaal" | "hoog" | "blokkerend",
          pagina: location,
          browser_info: browserInfo,
          screenshot_data: screenshotData ?? undefined,
          tech_context_toestemming: techToestemming,
          tech_context: techContext,
        },
      });

      // Poll kort voor AI-reactie (max 8s)
      let reactie: string | null = null;
      const meldingId = (resultaat as { id?: number }).id;
      if (meldingId) {
        for (let i = 0; i < 4; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const resp = await fetch(`/api/meldingen/${meldingId}`, { credentials: "include" });
            if (resp.ok) {
              const data = await resp.json();
              if (data.ai_reactie) { reactie = data.ai_reactie; break; }
            }
          } catch { break; }
        }
      }

      setAiReactie(reactie);
      setStap("bevestigd");
    } catch {
      toast({ title: "Melding kon niet worden ingediend", description: "Probeer het opnieuw.", variant: "destructive" });
    }
  }

  if (!magMelden) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-destructive"
        title="Bug of vraag melden"
        aria-label="Bug of vraag melden"
      >
        <Bug className="h-3.5 w-3.5" />
        <span>Melden</span>
      </button>

      {open && (
        <Dialog open={open} onOpenChange={(v) => { if (!v) sluit(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-destructive" />
                Bug of vraag melden
              </DialogTitle>
            </DialogHeader>

            {stap === "formulier" ? (
              <div className="space-y-4">
                {/* Type */}
                <div className="space-y-1.5">
                  <Label>Type melding</Label>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() => setType(k)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          type === k
                            ? "border-destructive bg-destructive text-destructive-foreground"
                            : "border-muted bg-muted/40 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Urgentie */}
                <div className="space-y-1.5">
                  <Label>Urgentie</Label>
                  <Select value={urgentie} onValueChange={setUrgentie}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(URGENTIE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Omschrijving */}
                <div className="space-y-1.5">
                  <Label>Omschrijving <span className="text-destructive">*</span></Label>
                  <Textarea
                    placeholder={
                      type === "bug"
                        ? "Wat ging er mis? Wat deed je op het moment van de fout?"
                        : type === "vraag"
                        ? "Wat wil je weten of wat lukt je niet?"
                        : "Wat zou beter kunnen en waarom?"
                    }
                    value={omschrijving}
                    onChange={(e) => setOmschrijving(e.target.value)}
                    rows={3}
                    className="resize-none text-sm"
                  />
                </div>

                {/* Screenshot */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Screenshot (optioneel, max 2 MB)</Label>
                  {screenshotPreview ? (
                    <div className="relative">
                      <img
                        src={screenshotPreview}
                        alt="Screenshot"
                        className="max-h-28 w-full rounded border object-contain bg-muted"
                      />
                      <button
                        onClick={verwijderScreenshot}
                        className="absolute right-1 top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                        title="Screenshot verwijderen"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded border border-dashed border-muted px-3 py-2 text-xs text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/40 transition-colors"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Screenshot toevoegen
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={verwerkBestand}
                  />
                </div>

                {/* Tech context */}
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="tech-context"
                    checked={techToestemming}
                    onCheckedChange={(v) => setTechToestemming(Boolean(v))}
                    className="mt-0.5"
                  />
                  <label htmlFor="tech-context" className="text-xs text-muted-foreground leading-snug cursor-pointer">
                    Technische context meesturen (browser, schermgrootte, URL) om het probleem sneller te reproduceren
                  </label>
                </div>

                {/* Automatisch gevulde context (informatief) */}
                <div className="rounded bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                  <p className="font-medium text-foreground/70">Automatisch vastgelegd</p>
                  <p>Pagina: {location}</p>
                  <p>Tijdstip: {new Date().toLocaleString("nl-NL")}</p>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={sluit}>Annuleren</Button>
                  <Button
                    size="sm"
                    onClick={dien}
                    disabled={melding.isPending || !omschrijving.trim()}
                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  >
                    {melding.isPending ? "Bezig..." : "Melding indienen"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                  Uw melding is ontvangen. Bedankt voor uw terugkoppeling.
                </div>

                {aiReactie ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Eerste reactie</p>
                    <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-foreground whitespace-pre-line">
                      {aiReactie}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Dit is een automatische eerste reactie. Een beheerder kan de melding verder opvolgen.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Een beheerder bekijkt de melding zo snel mogelijk.
                  </p>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { reset(); }}>
                    Nog een melding
                  </Button>
                  <Button size="sm" onClick={sluit}>Sluiten</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

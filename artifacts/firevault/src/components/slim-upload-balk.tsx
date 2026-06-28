import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Upload,
  Sparkles,
  X,
  ChevronRight,
  Settings,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  BookOpen,
  Receipt,
  Users,
  PenLine,
  BarChart3,
  FolderOpen,
  Zap,
  ZapOff,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Categorie = "bibliotheek" | "offerte" | "factuur" | "hrm" | "tekening" | "rapport" | "algemeen";
type Vertrouwen = "laag" | "midden" | "hoog";

interface Suggestie {
  categorie: Categorie;
  voorstel_naam: string;
  redenering: string;
  vertrouwen: Vertrouwen;
  ai_beschikbaar: boolean;
}

interface AutomatiseringsRegel {
  id: string;
  extensie: string;
  categorie: Categorie;
  bevestigingen: number;
  geautomatiseerd: boolean;
  aangemaakt: string;
}

// ── Categorie-metadata ────────────────────────────────────────────────────────

const CATEGORIE_INFO: Record<Categorie, { label: string; icoon: React.ReactNode; pad: string; kleur: string }> = {
  bibliotheek: { label: "Documentenbibliotheek", icoon: <BookOpen className="h-4 w-4" />, pad: "/documenten", kleur: "bg-blue-50 text-blue-700 border-blue-200" },
  offerte:     { label: "Offertes",              icoon: <FileText className="h-4 w-4" />, pad: "/offertes",  kleur: "bg-amber-50 text-amber-700 border-amber-200" },
  factuur:     { label: "Facturen",              icoon: <Receipt className="h-4 w-4" />, pad: "/facturen",  kleur: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  hrm:         { label: "Personeel / HRM",       icoon: <Users className="h-4 w-4" />,   pad: "/personeel", kleur: "bg-purple-50 text-purple-700 border-purple-200" },
  tekening:    { label: "Tekeningen",            icoon: <PenLine className="h-4 w-4" />, pad: "/documenten",kleur: "bg-sky-50 text-sky-700 border-sky-200" },
  rapport:     { label: "Rapporten",             icoon: <BarChart3 className="h-4 w-4" />,pad: "/rapporten", kleur: "bg-orange-50 text-orange-700 border-orange-200" },
  algemeen:    { label: "Documenten (algemeen)", icoon: <FolderOpen className="h-4 w-4" />,pad: "/documenten",kleur: "bg-gray-50 text-gray-700 border-gray-200" },
};

const VERTROUWEN_KLEUR: Record<Vertrouwen, string> = {
  hoog:  "text-emerald-600",
  midden:"text-amber-600",
  laag:  "text-gray-500",
};

const VERTROUWEN_LABEL: Record<Vertrouwen, string> = {
  hoog:  "Hoge zekerheid",
  midden:"Gemiddelde zekerheid",
  laag:  "Lage zekerheid",
};

// ── LocalStorage helpers ──────────────────────────────────────────────────────

const LS_KEY = "fps_slim_upload_regels";
const DREMPEL_AUTOMATISEREN = 3;

function laadRegels(): AutomatiseringsRegel[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as AutomatiseringsRegel[];
  } catch {
    return [];
  }
}

function slaRegelsOp(regels: AutomatiseringsRegel[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(regels));
}

function haalExtensie(bestandsnaam: string): string {
  const dot = bestandsnaam.lastIndexOf(".");
  return dot >= 0 ? bestandsnaam.slice(dot).toLowerCase() : "";
}

function zoekRegel(regels: AutomatiseringsRegel[], extensie: string, categorie: Categorie): AutomatiseringsRegel | undefined {
  return regels.find((r) => r.extensie === extensie && r.categorie === categorie);
}

function registreerBevestiging(extensie: string, categorie: Categorie): {
  regel: AutomatiseringsRegel;
  vraagAutomatiseren: boolean;
} {
  const regels = laadRegels();
  const bestaand = zoekRegel(regels, extensie, categorie);

  if (bestaand) {
    bestaand.bevestigingen += 1;
    slaRegelsOp(regels);
    const vraagAutomatiseren =
      bestaand.bevestigingen === DREMPEL_AUTOMATISEREN && !bestaand.geautomatiseerd;
    return { regel: bestaand, vraagAutomatiseren };
  }

  const nieuw: AutomatiseringsRegel = {
    id: crypto.randomUUID(),
    extensie,
    categorie,
    bevestigingen: 1,
    geautomatiseerd: false,
    aangemaakt: new Date().toISOString().slice(0, 10),
  };
  slaRegelsOp([...regels, nieuw]);
  return { regel: nieuw, vraagAutomatiseren: false };
}

function activeerAutomatisering(id: string) {
  const regels = laadRegels();
  const r = regels.find((x) => x.id === id);
  if (r) { r.geautomatiseerd = true; slaRegelsOp(regels); }
}

function verwijderRegel(id: string) {
  slaRegelsOp(laadRegels().filter((r) => r.id !== id));
}

// ── Hoofd-component ───────────────────────────────────────────────────────────

export function SlimUploadBalk() {
  const [, navigate] = useLocation();
  const [sleepActief, setSleepActief] = useState(false);
  const [analyseert, setAnalyseert] = useState(false);
  const [suggestie, setSuggestie] = useState<Suggestie | null>(null);
  const [gedroptBestand, setGedroptBestand] = useState<File | null>(null);
  const [toonDialoog, setToonDialoog] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [toonAutomatiseren, setToonAutomatiseren] = useState<AutomatiseringsRegel | null>(null);
  const [toonInstellingen, setToonInstellingen] = useState(false);
  const [regels, setRegels] = useState<AutomatiseringsRegel[]>([]);

  const sleepTeller = useRef(0);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const herlaadRegels = useCallback(() => setRegels(laadRegels()), []);
  useEffect(() => { herlaadRegels(); }, [herlaadRegels]);

  // ── Globale drag-listeners ─────────────────────────────────────────────────

  useEffect(() => {
    function opDragEnter(e: DragEvent) {
      if (!e.dataTransfer?.types.includes("Files")) return;
      sleepTeller.current += 1;
      setSleepActief(true);
    }

    function opDragLeave() {
      sleepTeller.current -= 1;
      if (sleepTeller.current <= 0) {
        sleepTeller.current = 0;
        setSleepActief(false);
      }
    }

    function opDragOver(e: DragEvent) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }

    function opDrop(e: DragEvent) {
      e.preventDefault();
      sleepTeller.current = 0;
      setSleepActief(false);
      const bestand = e.dataTransfer?.files?.[0];
      if (bestand) verwerkBestand(bestand);
    }

    document.addEventListener("dragenter", opDragEnter);
    document.addEventListener("dragleave", opDragLeave);
    document.addEventListener("dragover", opDragOver);
    document.addEventListener("drop", opDrop);

    return () => {
      document.removeEventListener("dragenter", opDragEnter);
      document.removeEventListener("dragleave", opDragLeave);
      document.removeEventListener("dragover", opDragOver);
      document.removeEventListener("drop", opDrop);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Bestand verwerken ──────────────────────────────────────────────────────

  async function verwerkBestand(bestand: File) {
    setGedroptBestand(bestand);
    setFout(null);
    setSuggestie(null);

    const extensie = haalExtensie(bestand.name);
    const regelsHuidig = laadRegels();

    // Controleer of er een actieve automatiseringsregel is
    const actieveRegel = regelsHuidig.find((r) => r.extensie === extensie && r.geautomatiseerd);
    if (actieveRegel) {
      const info = CATEGORIE_INFO[actieveRegel.categorie];
      navigate(info.pad);
      return;
    }

    setAnalyseert(true);
    setToonDialoog(true);

    try {
      const formData = new FormData();
      formData.append("bestand", bestand);

      const res = await fetch("/api/slim-upload/analyseer", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as Suggestie;
      setSuggestie(data);
    } catch {
      setFout("De analyse kon niet worden uitgevoerd. Kies hieronder handmatig waar het bestand thuishoort.");
    } finally {
      setAnalyseert(false);
    }
  }

  function opBevestigen() {
    if (!suggestie || !gedroptBestand) return;

    const extensie = haalExtensie(gedroptBestand.name);
    const { regel, vraagAutomatiseren } = registreerBevestiging(extensie, suggestie.categorie);

    setToonDialoog(false);
    setSuggestie(null);
    setGedroptBestand(null);

    const info = CATEGORIE_INFO[suggestie.categorie];
    navigate(info.pad);

    if (vraagAutomatiseren) {
      setTimeout(() => { setToonAutomatiseren(regel); herlaadRegels(); }, 400);
    }
  }

  function opAnnuleren() {
    setToonDialoog(false);
    setSuggestie(null);
    setGedroptBestand(null);
    setFout(null);
  }

  function opAutomatiseerBevestigen() {
    if (toonAutomatiseren) {
      activeerAutomatisering(toonAutomatiseren.id);
      herlaadRegels();
    }
    setToonAutomatiseren(null);
  }

  function opRegelVerwijderen(id: string) {
    verwijderRegel(id);
    herlaadRegels();
  }

  const actieveAutomatiseringen = regels.filter((r) => r.geautomatiseerd);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Balk */}
      <div
        ref={dropZoneRef}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-40 transition-all duration-300 ease-in-out",
          "border-t bg-background/95 backdrop-blur-sm",
          sleepActief
            ? "border-primary shadow-2xl"
            : "border-border/60",
        )}
        style={{ left: "var(--sidebar-width, 0px)" }}
      >
        {/* Sleep-overlay */}
        <div
          className={cn(
            "transition-all duration-300 ease-in-out overflow-hidden",
            sleepActief ? "max-h-40 opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
            <div
              className={cn(
                "rounded-full p-4 transition-all duration-300",
                sleepActief ? "bg-primary/10 scale-110" : "bg-muted scale-100",
              )}
            >
              <Upload className={cn("h-8 w-8 transition-colors duration-300", sleepActief ? "text-primary" : "text-muted-foreground")} />
            </div>
            <p className="text-sm font-medium text-foreground">Laat los om te analyseren</p>
            <p className="text-xs text-muted-foreground">AI bepaalt waar het bestand thuishoort</p>
          </div>
        </div>

        {/* Rusttoestand */}
        <div
          className={cn(
            "flex items-center gap-2 px-4 py-2 transition-all duration-300",
            sleepActief ? "opacity-0 h-0 py-0 overflow-hidden" : "opacity-100 h-auto",
          )}
        >
          <Upload className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">
            Slim uploadpunt — sleep een bestand hierheen
          </span>
          {actieveAutomatiseringen.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
              <Zap className="h-2.5 w-2.5 mr-0.5" />
              {actieveAutomatiseringen.length} automatisch
            </Badge>
          )}
          <div className="ml-auto">
            <Popover open={toonInstellingen} onOpenChange={setToonInstellingen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Settings className="h-3 w-3 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="p-3 border-b">
                  <p className="text-sm font-semibold">Automatiseringsregels</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Regels worden aangemaakt zodra u meerdere keren hetzelfde type bestand op dezelfde plek plaatst.
                  </p>
                </div>
                {regels.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Nog geen regels aangemaakt.</p>
                  </div>
                ) : (
                  <ul className="divide-y max-h-64 overflow-y-auto">
                    {regels.map((r) => {
                      const info = CATEGORIE_INFO[r.categorie];
                      return (
                        <li key={r.id} className="flex items-center gap-2 px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">
                              {r.extensie || "(geen extensie)"} → {info.label}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {r.bevestigingen}x bevestigd &bull; {r.aangemaakt}
                            </p>
                          </div>
                          {r.geautomatiseerd ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                              <Zap className="h-2.5 w-2.5 mr-0.5" /> Auto
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 text-muted-foreground">
                              Handmatig
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => opRegelVerwijderen(r.id)}
                            title="Regel verwijderen"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* AI-analyse dialoog */}
      <Dialog open={toonDialoog} onOpenChange={(open) => { if (!open) opAnnuleren(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Slim uploadpunt
            </DialogTitle>
          </DialogHeader>

          {analyseert && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="relative">
                <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground">
                AI analyseert{" "}
                <span className="font-medium text-foreground">{gedroptBestand?.name}</span>…
              </p>
            </div>
          )}

          {!analyseert && fout && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{fout}</p>
              </div>
              <p className="text-xs text-muted-foreground">Kies zelf waar u het bestand wilt opslaan:</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(CATEGORIE_INFO) as [Categorie, typeof CATEGORIE_INFO[Categorie]][]).map(([cat, info]) => (
                  <Button
                    key={cat}
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2 text-xs h-8"
                    onClick={() => { setSuggestie({ categorie: cat, voorstel_naam: gedroptBestand?.name.replace(/\.[^.]+$/, "") ?? "", redenering: "Handmatig gekozen.", vertrouwen: "laag", ai_beschikbaar: false }); setFout(null); }}
                  >
                    {info.icoon}
                    {info.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {!analyseert && suggestie && (
            <div className="space-y-4">
              <div className={cn("rounded-lg border p-4 space-y-3", CATEGORIE_INFO[suggestie.categorie].kleur)}>
                <div className="flex items-center gap-2">
                  {CATEGORIE_INFO[suggestie.categorie].icoon}
                  <span className="font-semibold text-sm">{CATEGORIE_INFO[suggestie.categorie].label}</span>
                  <span className={cn("ml-auto text-xs font-medium", VERTROUWEN_KLEUR[suggestie.vertrouwen])}>
                    {VERTROUWEN_LABEL[suggestie.vertrouwen]}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide font-semibold opacity-60 mb-0.5">Voorgestelde naam</p>
                  <p className="text-sm font-medium">{suggestie.voorstel_naam}</p>
                </div>
                {suggestie.redenering && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide font-semibold opacity-60 mb-0.5">Redenering</p>
                    <p className="text-xs opacity-80">{suggestie.redenering}</p>
                  </div>
                )}
                {!suggestie.ai_beschikbaar && (
                  <p className="text-[10px] opacity-60 italic">Geclassificeerd op basis van bestandsnaam (AI niet actief)</p>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Niet wat u verwacht? Kies een andere bestemming:
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.entries(CATEGORIE_INFO) as [Categorie, typeof CATEGORIE_INFO[Categorie]][])
                  .filter(([cat]) => cat !== suggestie.categorie)
                  .map(([cat, info]) => (
                    <Button
                      key={cat}
                      variant="ghost"
                      size="sm"
                      className="justify-start gap-1.5 text-xs h-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setSuggestie({ ...suggestie, categorie: cat, vertrouwen: "laag", redenering: "Handmatig gewijzigd." })}
                    >
                      {info.icoon}
                      {info.label}
                    </Button>
                  ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={opAnnuleren}>
              Annuleren
            </Button>
            {suggestie && (
              <Button size="sm" onClick={opBevestigen} className="gap-1.5">
                <ChevronRight className="h-4 w-4" />
                Ga naar {CATEGORIE_INFO[suggestie.categorie].label}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Automatiseer-dialoog */}
      <Dialog open={!!toonAutomatiseren} onOpenChange={(open) => { if (!open) setToonAutomatiseren(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Automatiseren?
            </DialogTitle>
          </DialogHeader>
          {toonAutomatiseren && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                U heeft{" "}
                <span className="font-medium text-foreground">{DREMPEL_AUTOMATISEREN} keer</span>{" "}
                een{" "}
                <span className="font-medium text-foreground">
                  {toonAutomatiseren.extensie || "bestand"}-bestand
                </span>{" "}
                naar{" "}
                <span className="font-medium text-foreground">
                  {CATEGORIE_INFO[toonAutomatiseren.categorie].label}
                </span>{" "}
                gestuurd.
              </p>
              <p className="text-sm text-muted-foreground">
                Mag dit voortaan automatisch worden toegepast zonder vragen?
              </p>
              <div className="rounded-md bg-muted/50 p-3 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  U kunt dit altijd terugdraaien via het tandwiel-icoon in de uploadbalk.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setToonAutomatiseren(null)} className="gap-1.5">
              <ZapOff className="h-3.5 w-3.5" />
              Nee, blijf vragen
            </Button>
            <Button size="sm" onClick={opAutomatiseerBevestigen} className="gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Ja, automatiseer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

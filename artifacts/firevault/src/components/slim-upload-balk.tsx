import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Upload,
  Sparkles,
  X,
  ChevronRight,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  BookOpen,
  Receipt,
  Users,
  PenLine,
  Archive,
  FolderOpen,
  Zap,
  ZapOff,
  Settings,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Categorie = "bibliotheek" | "offerte" | "factuur" | "hrm" | "tekening" | "snagstream" | "algemeen";
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
  bibliotheek: { label: "Documentenbibliotheek", icoon: <BookOpen className="h-4 w-4" />, pad: "/documenten",  kleur: "bg-blue-50 text-blue-700 border-blue-200" },
  offerte:     { label: "Offertes",              icoon: <FileText className="h-4 w-4" />, pad: "/offertes",   kleur: "bg-amber-50 text-amber-700 border-amber-200" },
  factuur:     { label: "Facturen",              icoon: <Receipt className="h-4 w-4" />, pad: "/facturen",   kleur: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  hrm:         { label: "Personeel / HRM",       icoon: <Users className="h-4 w-4" />,   pad: "/personeel",  kleur: "bg-purple-50 text-purple-700 border-purple-200" },
  tekening:    { label: "Tekeningen",            icoon: <PenLine className="h-4 w-4" />,  pad: "/documenten",  kleur: "bg-sky-50 text-sky-700 border-sky-200" },
  snagstream:  { label: "Snagstream archief",    icoon: <Archive className="h-4 w-4" />,  pad: "/snagstream",  kleur: "bg-orange-50 text-orange-700 border-orange-200" },
  algemeen:    { label: "Documenten (algemeen)", icoon: <FolderOpen className="h-4 w-4" />, pad: "/documenten", kleur: "bg-gray-50 text-gray-700 border-gray-200" },
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
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as AutomatiseringsRegel[]; }
  catch { return []; }
}

function slaRegelsOp(regels: AutomatiseringsRegel[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(regels));
}

function haalExtensie(bestandsnaam: string): string {
  const dot = bestandsnaam.lastIndexOf(".");
  return dot >= 0 ? bestandsnaam.slice(dot).toLowerCase() : "";
}

function zoekRegel(regels: AutomatiseringsRegel[], extensie: string, categorie: Categorie) {
  return regels.find((r) => r.extensie === extensie && r.categorie === categorie);
}

function registreerBevestiging(extensie: string, categorie: Categorie): {
  regel: AutomatiseringsRegel; vraagAutomatiseren: boolean;
} {
  const regels = laadRegels();
  const bestaand = zoekRegel(regels, extensie, categorie);
  if (bestaand) {
    bestaand.bevestigingen += 1;
    slaRegelsOp(regels);
    return { regel: bestaand, vraagAutomatiseren: bestaand.bevestigingen === DREMPEL_AUTOMATISEREN && !bestaand.geautomatiseerd };
  }
  const nieuw: AutomatiseringsRegel = {
    id: crypto.randomUUID(), extensie, categorie, bevestigingen: 1,
    geautomatiseerd: false, aangemaakt: new Date().toISOString().slice(0, 10),
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

// ── Slim-upload knop (snelkoppeling in de taakbalk) ───────────────────────────

function SlimUploadKnop({ onClick, actieveAutomatiseringen }: {
  onClick: () => void;
  actieveAutomatiseringen: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium",
        "bg-white/10 hover:bg-white/20 text-white/90 hover:text-white",
        "border border-white/15 hover:border-white/30",
        "transition-all duration-150 cursor-pointer select-none",
      )}
      title="Slim uploaden — sleep of klik om een bestand te analyseren"
    >
      <Upload className="h-3.5 w-3.5 shrink-0" />
      <span>Slim uploaden</span>
      {actieveAutomatiseringen > 0 && (
        <span className="ml-0.5 flex items-center gap-0.5 bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded px-1 text-[10px]">
          <Zap className="h-2.5 w-2.5" />
          {actieveAutomatiseringen}
        </span>
      )}
    </button>
  );
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sleepTeller = useRef(0);

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
      if (sleepTeller.current <= 0) { sleepTeller.current = 0; setSleepActief(false); }
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
    const actieveRegel = regelsHuidig.find((r) => r.extensie === extensie && r.geautomatiseerd);
    if (actieveRegel) {
      navigate(CATEGORIE_INFO[actieveRegel.categorie].pad);
      return;
    }

    setAnalyseert(true);
    setToonDialoog(true);

    try {
      const formData = new FormData();
      formData.append("bestand", bestand);
      const res = await fetch("/api/slim-upload/analyseer", {
        method: "POST", body: formData, credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuggestie((await res.json()) as Suggestie);
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
    navigate(CATEGORIE_INFO[suggestie.categorie].pad);
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
    if (toonAutomatiseren) { activeerAutomatisering(toonAutomatiseren.id); herlaadRegels(); }
    setToonAutomatiseren(null);
  }

  const actieveAutomatiseringen = regels.filter((r) => r.geautomatiseerd);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Taakbalk ────────────────────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 right-0 z-40 flex items-center"
        style={{ left: "var(--sidebar-width, 0px)" }}
      >
        {/* Gekleurde balk */}
        <div
          className={cn(
            "flex items-center gap-2 px-4 w-full transition-all duration-300",
            "border-t",
            sleepActief
              ? "bg-primary border-primary/80 py-6"
              : "bg-[#1e2535] border-[#2d3548] py-2",
          )}
        >
          {sleepActief ? (
            /* Sleep-staat: grote drop-zone hint */
            <div className="flex items-center gap-3 w-full justify-center">
              <div className="rounded-full p-2 bg-white/15">
                <Upload className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Laat los om te analyseren</p>
                <p className="text-xs text-white/70">AI bepaalt automatisch waar het bestand thuishoort</p>
              </div>
            </div>
          ) : (
            /* Rusttoestand: taakbalk met snelkoppelingen */
            <>
              {/* Label */}
              <span className="text-[11px] text-white/40 font-medium uppercase tracking-wider shrink-0 select-none">
                Snelkoppelingen
              </span>

              <div className="w-px h-4 bg-white/15 shrink-0" />

              {/* Slim uploaden knop */}
              <SlimUploadKnop
                onClick={() => fileInputRef.current?.click()}
                actieveAutomatiseringen={actieveAutomatiseringen.length}
              />

              {/* Ruimte voor toekomstige snelkoppelingen */}
              {/* <NogEenKnop /> */}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Instellingen tandwiel */}
              <Popover open={toonInstellingen} onOpenChange={setToonInstellingen}>
                <PopoverTrigger asChild>
                  <button
                    className="flex items-center justify-center h-6 w-6 rounded text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
                    title="Automatiseringsregels"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" side="top" className="w-80 p-0 mb-2">
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
                            <button
                              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors shrink-0"
                              onClick={() => { verwijderRegel(r.id); herlaadRegels(); }}
                              title="Regel verwijderen"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </PopoverContent>
              </Popover>
            </>
          )}
        </div>
      </div>

      {/* Verborgen file-input voor klik-upload */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const bestand = e.target.files?.[0];
          if (bestand) verwerkBestand(bestand);
          e.target.value = "";
        }}
      />

      {/* ── AI-analyse dialoog ───────────────────────────────────────────────── */}
      <Dialog open={toonDialoog} onOpenChange={(open) => { if (!open) opAnnuleren(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Slim uploaden
            </DialogTitle>
          </DialogHeader>

          {analyseert && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Sparkles className="h-8 w-8 text-primary animate-pulse" />
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
                  <Button key={cat} variant="outline" size="sm" className="justify-start gap-2 text-xs h-8"
                    onClick={() => setSuggestie({ categorie: cat, voorstel_naam: gedroptBestand?.name.replace(/\.[^.]+$/, "") ?? "", redenering: "Handmatig gekozen.", vertrouwen: "laag", ai_beschikbaar: false })}>
                    {info.icoon}{info.label}
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
                  <p className="text-[10px] opacity-60 italic">Geclassificeerd op bestandsnaam (AI niet actief)</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Niet wat u verwacht? Kies een andere bestemming:</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.entries(CATEGORIE_INFO) as [Categorie, typeof CATEGORIE_INFO[Categorie]][])
                  .filter(([cat]) => cat !== suggestie.categorie)
                  .map(([cat, info]) => (
                    <Button key={cat} variant="ghost" size="sm" className="justify-start gap-1.5 text-xs h-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setSuggestie({ ...suggestie, categorie: cat, vertrouwen: "laag", redenering: "Handmatig gewijzigd." })}>
                      {info.icoon}{info.label}
                    </Button>
                  ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={opAnnuleren}>Annuleren</Button>
            {suggestie && (
              <Button size="sm" onClick={opBevestigen} className="gap-1.5">
                <ChevronRight className="h-4 w-4" />
                Ga naar {CATEGORIE_INFO[suggestie.categorie].label}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Automatiseer-dialoog ─────────────────────────────────────────────── */}
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
                  U kunt dit altijd terugdraaien via het tandwiel-icoon in de taakbalk.
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

import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Upload, Sparkles, X, ChevronRight, ChevronLeft, Trash2, CheckCircle2, AlertCircle,
  FileText, BookOpen, Receipt, Users, Archive, FolderOpen,
  Zap, ZapOff, Settings, AlertTriangle, ShieldAlert, HelpCircle,
  ClipboardList, BadgeCheck, FileCheck, Ruler, Package, LayoutTemplate,
  RotateCcw, Clock, History, Shield, UserPlus, CalendarClock, Inbox,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useListMedewerkers } from "@workspace/api-client-react";
import type { CvAnalyseResultaat } from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";
import { slaCvOnboardingOp } from "@/lib/cv-onboarding-stash";

// ── Types ─────────────────────────────────────────────────────────────────────

type CategorieUitgebreid =
  | "aanvraag" | "tekening" | "offerte" | "factuur"
  | "productdocument" | "testrapport" | "certificaat" | "eta" | "dop"
  | "personeelsdocument" | "verzekering" | "snagstream" | "jaarrekening" | "contract"
  | "bibliotheek" | "document_sjabloon" | "algemeen" | "onbekend";

type Vertrouwen = "laag" | "midden" | "hoog";

interface BewijsStap {
  stap: string;
  resultaat: string;
  detail?: string;
}

interface SlimUploadSuggestie {
  categorie: CategorieUitgebreid;
  subtype?: string | null;
  voorstel_naam: string;
  redenering: string;
  vertrouwen: Vertrouwen;
  ai_beschikbaar: boolean;
  vision_gebruikt: boolean;
  gevonden_gegevens: Record<string, string>;
  alternatieven: CategorieUitgebreid[];
  organisatie?: string | null;
  jaar?: number | null;
  opslaglocatie?: string;
  bewijs?: BewijsStap[];
  impact_niveau: "geen" | "laag" | "midden" | "hoog";
  impact_omschrijving: string;
  vereist_bevestiging: boolean;
  directe_actie_beschrijving: string;
  mag_uploaden: boolean;
  beperkingen: string[];
}

interface LogActieData {
  bestandsnaam: string;
  categorie: string;
  actie: string;
  impactNiveau: string;
  bevestigd: boolean;
  geweigerd: boolean;
  opmerking?: string;
}

async function logUploadActie(data: LogActieData): Promise<void> {
  await fetch("/api/slim-upload/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bestandsnaam: data.bestandsnaam,
      categorie: data.categorie,
      actie: data.actie,
      impactNiveau: data.impactNiveau,
      bevestigd: data.bevestigd,
      geweigerd: data.geweigerd,
      opmerking: data.opmerking,
    }),
    credentials: "include",
  }).catch(() => {});
}

interface UploadItem {
  id: string;
  bestand: File;
  status: "wacht" | "analyseert" | "klaar" | "fout";
  suggestie: SlimUploadSuggestie | null;
  fout: string | null;
  actieGenomen: boolean;
  gekozenCategorie: CategorieUitgebreid | null;
  toelichting: string;
  geconsolideerd_override?: boolean;
  regelCategorie?: CategorieUitgebreid;
}

interface AutomatiseringsRegel {
  id: string;
  extensie: string;
  categorie: CategorieUitgebreid;
  bevestigingen: number;
  geautomatiseerd: boolean;
  aangemaakt: string;
}

// ── Recente uploads (15-minuten notificatiepaneel) ────────────────────────────

interface RecentUpload {
  id: string;
  bestandsnaam: string;
  categorie: CategorieUitgebreid;
  label: string;
  pad: string;
  tijdstip: number;
  herkomstPad: string;
}

const RECENT_KEY = "fps_recent_uploads";
const RECENT_TTL = 15 * 60 * 1000;

function laadRecenteUploads(): RecentUpload[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const items: RecentUpload[] = JSON.parse(raw);
    const nu = Date.now();
    return items.filter((i) => nu - i.tijdstip < RECENT_TTL);
  } catch {
    return [];
  }
}

function slaRecenteUploadsOp(items: RecentUpload[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(items)); } catch { /* quota */ }
}

function voegRecentToe(upload: RecentUpload) {
  const huidig = laadRecenteUploads();
  slaRecenteUploadsOp([upload, ...huidig].slice(0, 20));
}

function restTijdLabel(tijdstip: number): string {
  const rest = Math.max(0, RECENT_TTL - (Date.now() - tijdstip));
  if (rest === 0) return "verlopen";
  const min = Math.floor(rest / 60000);
  const sec = Math.floor((rest % 60000) / 1000);
  if (min > 0) return `nog ${min}m${sec > 0 ? ` ${sec}s` : ""}`;
  return `nog ${sec}s`;
}

function RecentUploadPanel({
  uploads,
  onVerwijder,
  onVerwijderAlles,
  onOngedaanMaken,
}: {
  uploads: RecentUpload[];
  onVerwijder: (id: string) => void;
  onVerwijderAlles: () => void;
  onOngedaanMaken: (upload: RecentUpload) => void;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  void tick;

  if (uploads.length === 0) return null;

  return (
    <div
      className="fixed right-4 z-50 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
      style={{ bottom: "calc(var(--upload-bar-h, 44px) + 12px)" }}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b bg-slate-50">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">Recente uploads</span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{uploads.length}</Badge>
        </div>
        <button
          onClick={onVerwijderAlles}
          className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
        >
          Alles wissen
        </button>
      </div>
      <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
        {uploads.map((u) => {
          const info = CATEGORIE_INFO[u.categorie];
          const verstrekenMin = Math.floor((Date.now() - u.tijdstip) / 60000);
          return (
            <li key={u.id} className="px-3 py-2.5 hover:bg-slate-50 transition-colors">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate text-slate-800" title={u.bestandsnaam}>
                    {u.bestandsnaam}
                  </p>
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border mt-1",
                    info.kleur,
                  )}>
                    {info.icoon}
                    {u.label}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5 shrink-0" />
                    {verstrekenMin === 0 ? "Zojuist" : `${verstrekenMin}m geleden`}
                    <span className="text-slate-300">·</span>
                    {restTijdLabel(u.tijdstip)}
                  </p>
                </div>
                <button
                  onClick={() => onVerwijder(u.id)}
                  className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors mt-0.5"
                  title="Verwijder uit lijst"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => onOngedaanMaken(u)}
                  className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                >
                  <RotateCcw className="h-3 w-3" />
                  Ongedaan maken
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Categorie-configuratie ────────────────────────────────────────────────────

const CATEGORIE_INFO: Record<CategorieUitgebreid, {
  label: string;
  icoon: React.ReactNode;
  pad: string;
  kleur: string;
  omschrijving: string;
}> = {
  aanvraag:          { label: "Nieuwe aanvraag / project",     icoon: <ClipboardList className="h-4 w-4" />, pad: "/gebouwen",   kleur: "bg-violet-50 text-violet-700 border-violet-200",  omschrijving: "Aanvraag, offerteaanvraag of opdrachtverzoek" },
  tekening:          { label: "Tekeningen",                    icoon: <Ruler className="h-4 w-4" />,        pad: "/documenten",  kleur: "bg-sky-50 text-sky-700 border-sky-200",           omschrijving: "Bouw- of installatietekening, plattegrond" },
  offerte:           { label: "Offertes",                      icoon: <FileText className="h-4 w-4" />,     pad: "/offertes",    kleur: "bg-amber-50 text-amber-700 border-amber-200",     omschrijving: "Prijsopgave of offerte richting klant" },
  factuur:           { label: "Facturen",                      icoon: <Receipt className="h-4 w-4" />,      pad: "/facturen",    kleur: "bg-emerald-50 text-emerald-700 border-emerald-200", omschrijving: "Factuur, creditnota of betaalbewijs" },
  productdocument:   { label: "Productdocumenten",             icoon: <Package className="h-4 w-4" />,      pad: "/documenten",  kleur: "bg-teal-50 text-teal-700 border-teal-200",        omschrijving: "Productblad, TDS, verwerkingsvoorschrift" },
  testrapport:       { label: "Testrapporten",                 icoon: <FileCheck className="h-4 w-4" />,    pad: "/documenten",  kleur: "bg-orange-50 text-orange-700 border-orange-200",  omschrijving: "Brandproef, classificatierapport" },
  certificaat:       { label: "Certificaten",                  icoon: <BadgeCheck className="h-4 w-4" />,   pad: "/documenten",  kleur: "bg-blue-50 text-blue-700 border-blue-200",        omschrijving: "KOMO, KIWA, BRL, CE-markering" },
  eta:               { label: "ETA — Technische beoordeling",  icoon: <BadgeCheck className="h-4 w-4" />,   pad: "/documenten",  kleur: "bg-indigo-50 text-indigo-700 border-indigo-200",  omschrijving: "European Technical Assessment / ETB / EOTA" },
  dop:               { label: "Prestatieverklaring (DoP)",     icoon: <BadgeCheck className="h-4 w-4" />,   pad: "/documenten",  kleur: "bg-cyan-50 text-cyan-700 border-cyan-200",        omschrijving: "Declaration of Performance, Reg. 305/2011" },
  personeelsdocument:{ label: "Personeel / HRM",               icoon: <Users className="h-4 w-4" />,        pad: "/personeel",   kleur: "bg-purple-50 text-purple-700 border-purple-200",  omschrijving: "Arbeidscontract, diploma, VOG, VCA" },
  verzekering:       { label: "Verzekeringen",                 icoon: <Shield className="h-4 w-4" />,       pad: "/documenten",  kleur: "bg-blue-50 text-blue-700 border-blue-200",        omschrijving: "Verzekeringspolis, aansprakelijkheid, assurantie" },
  snagstream:        { label: "Snagstream archief",            icoon: <Archive className="h-4 w-4" />,      pad: "/snagstream",  kleur: "bg-rose-50 text-rose-700 border-rose-200",        omschrijving: "Opleverrapport, inspectieverslag, punchlijst" },
  jaarrekening:      { label: "Jaarrekeningen (archief)",      icoon: <Archive className="h-4 w-4" />,      pad: "/documenten",  kleur: "bg-slate-50 text-slate-700 border-slate-200",     omschrijving: "Jaarrekening, jaarverslag of accountantsverklaring" },
  contract:          { label: "Contracten",                    icoon: <FileText className="h-4 w-4" />,     pad: "/documenten",  kleur: "bg-lime-50 text-lime-700 border-lime-200",        omschrijving: "Commerciële overeenkomst met klant of leverancier" },
  bibliotheek:       { label: "Documentenbibliotheek",         icoon: <BookOpen className="h-4 w-4" />,        pad: "/documenten",           kleur: "bg-blue-50 text-blue-700 border-blue-200",        omschrijving: "Technisch brandveiligheidsdocument" },
  document_sjabloon: { label: "Document Studio — sjabloon",    icoon: <LayoutTemplate className="h-4 w-4" />, pad: "/organisatie/studio", kleur: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", omschrijving: "Briefpapier, onderlegger of huisstijl-sjabloon" },
  algemeen:          { label: "Documenten (algemeen)",         icoon: <FolderOpen className="h-4 w-4" />,    pad: "/documenten",           kleur: "bg-gray-50 text-gray-700 border-gray-200",        omschrijving: "Overige bedrijfsdocumenten" },
  onbekend:          { label: "Onbekend — handmatig kiezen",   icoon: <HelpCircle className="h-4 w-4" />,    pad: "/documenten",           kleur: "bg-gray-50 text-gray-600 border-gray-200",        omschrijving: "AI kon het type niet vaststellen" },
};



// ── LocalStorage helpers ──────────────────────────────────────────────────────

const LS_KEY = "fps_slim_upload_regels";
const DREMPEL_AUTOMATISEREN = 3;

function haalExtensie(naam: string): string {
  const dot = naam.lastIndexOf(".");
  return dot >= 0 ? naam.slice(dot).toLowerCase() : "";
}

function laadRegels(): AutomatiseringsRegel[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as AutomatiseringsRegel[]; }
  catch { return []; }
}

function slaRegelsOp(regels: AutomatiseringsRegel[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(regels));
}

function registreerBevestiging(extensie: string, categorie: CategorieUitgebreid): {
  regel: AutomatiseringsRegel; vraagAutomatiseren: boolean;
} {
  const regels = laadRegels();
  const bestaand = regels.find((r) => r.extensie === extensie && r.categorie === categorie);
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

// ── Upload knop ───────────────────────────────────────────────────────────────

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
      title="Slim uploaden — sleep of klik om bestanden te analyseren"
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

// ── Beslisscherm per file ─────────────────────────────────────────────────────

const PERSONEEL_DOC_TYPEN: { value: string; label: string }[] = [
  { value: "identiteitsbewijs", label: "Identiteitsbewijs" },
  { value: "paspoort", label: "Paspoort" },
  { value: "verblijfsvergunning", label: "Verblijfsvergunning" },
  { value: "arbeidscontract", label: "Arbeidscontract" },
  { value: "diploma", label: "Diploma" },
  { value: "vca_certificaat", label: "VCA-certificaat" },
  { value: "bhv_certificaat", label: "BHV-certificaat" },
  { value: "ehbo_certificaat", label: "EHBO-certificaat" },
  { value: "rijbewijs", label: "Rijbewijs" },
  { value: "vog", label: "VOG" },
  { value: "cv", label: "CV" },
  { value: "loonstrook", label: "Loonstrook" },
  { value: "naw_formulier", label: "NAW-formulier" },
  { value: "geheimhoudingsverklaring", label: "Geheimhoudingsverklaring" },
  { value: "overig", label: "Overig personeelsdocument" },
];

const IMPACT_KLEUR: Record<string, string> = {
  geen:   "",
  laag:   "bg-slate-50 border-slate-200 text-slate-700",
  midden: "bg-amber-50 border-amber-200 text-amber-800",
  hoog:   "bg-red-50 border-red-200 text-red-800",
};

const IMPACT_LABEL: Record<string, string> = {
  geen:   "",
  laag:   "Laag",
  midden: "Middelmatig — bevestiging vereist",
  hoog:   "Hoog — bevestiging vereist",
};

function BeslisScherm({
  item,
  onBevestigen,
  onWijzigCategorie,
  onBevestigenPersoneel,
  onNavigeer,
  onLogActie,
  onGeconsolideerd,
}: {
  item: UploadItem;
  onBevestigen: (cat: CategorieUitgebreid) => void;
  onWijzigCategorie: (cat: CategorieUitgebreid) => void;
  onBevestigenPersoneel?: (medewerkerId: number, docType: string) => void;
  onNavigeer?: (pad: string) => void;
  onLogActie?: (data: LogActieData) => void;
  onGeconsolideerd?: (val: boolean) => void;
}) {
  const [bevestigdAkkoord, setBevestigdAkkoord] = useState(false);
  const [gekozenMedewerker, setGekozenMedewerker] = useState("");
  const [gekozenDocType, setGekozenDocType] = useState("");
  const [cvBezig, setCvBezig] = useState(false);
  const { data: medewerkerLijst } = useListMedewerkers();
  const { toast } = useToast();
  const { heeftNiveau } = useBevoegdheid();
  const magOnboarden = heeftNiveau("personeel", 2);

  const { suggestie, fout, status } = item;
  const effectiefeCat = item.gekozenCategorie ?? suggestie?.categorie ?? "algemeen";
  const catInfo = CATEGORIE_INFO[effectiefeCat];

  // Zonder schrijfrecht personeel (niveau 2) valt een CV terug op de standaard
  // personeelsdocument-flow; de onboardingvraag verschijnt dan niet.
  const isCV =
    magOnboarden &&
    effectiefeCat === "personeelsdocument" && (
      suggestie?.subtype === "cv" ||
      suggestie?.gevonden_gegevens?.document_subtype === "cv" ||
      ["cv", "curriculum", "vitae", "resume", "sollicitatie"].some((k) =>
        item.bestand.name.toLowerCase().includes(k)
      )
    );

  const impactNiveau = (suggestie?.impact_niveau ?? "laag") as "geen" | "laag" | "midden" | "hoog";
  const vereistBevestiging = suggestie?.vereist_bevestiging ?? (impactNiveau === "midden" || impactNiveau === "hoog");
  const magUploaden = suggestie?.mag_uploaden !== false;
  const beperkingen = suggestie?.beperkingen ?? [];

  function voerActieUit() {
    onLogActie?.({
      bestandsnaam: item.bestand.name,
      categorie: effectiefeCat,
      actie: "direct_gestart",
      impactNiveau,
      bevestigd: vereistBevestiging ? bevestigdAkkoord : true,
      geweigerd: false,
    });

    if (effectiefeCat === "personeelsdocument" && !isCV && gekozenMedewerker && gekozenDocType) {
      onBevestigenPersoneel?.(Number(gekozenMedewerker), gekozenDocType);
      return;
    }
    if (effectiefeCat === "snagstream") {
      onBevestigen(effectiefeCat);
      setTimeout(() => onNavigeer?.("/snagstream"), 300);
      return;
    }
    if (effectiefeCat === "document_sjabloon") {
      onBevestigen(effectiefeCat);
      setTimeout(() => onNavigeer?.("/organisatie/studio"), 300);
      return;
    }
    if (catInfo.pad) {
      onBevestigen(effectiefeCat);
      setTimeout(() => onNavigeer?.(catInfo.pad), 300);
      return;
    }
    onBevestigen(effectiefeCat);
  }

  // CV herkend: expliciete vraag — AI stelt voor, de mens bevestigt in het formulier
  async function startCvOnboarding() {
    if (cvBezig) return;
    setCvBezig(true);
    onLogActie?.({
      bestandsnaam: item.bestand.name,
      categorie: effectiefeCat,
      actie: "cv_onboarding_gestart",
      impactNiveau,
      bevestigd: true,
      geweigerd: false,
    });
    onBevestigen(effectiefeCat);
    try {
      const fd = new FormData();
      fd.append("cv", item.bestand);
      const res = await fetch("/api/medewerkers/ai-cv-analyse", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (res.ok) {
        const voorstel = (await res.json()) as CvAnalyseResultaat;
        slaCvOnboardingOp({ bestandsnaam: item.bestand.name, bron: "slim-upload", voorstel });
      } else {
        toast({
          title: "CV-analyse niet beschikbaar",
          description: "Het onboardingformulier opent zonder vooraf ingevulde gegevens.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "CV-analyse niet beschikbaar",
        description: "Het onboardingformulier opent zonder vooraf ingevulde gegevens.",
        variant: "destructive",
      });
    } finally {
      setCvBezig(false);
      onNavigeer?.("/personeel/onboarden");
    }
  }

  function bewaarCvZonderOnboarding() {
    onLogActie?.({
      bestandsnaam: item.bestand.name,
      categorie: effectiefeCat,
      actie: "cv_bewaard_zonder_onboarding",
      impactNiveau,
      bevestigd: true,
      geweigerd: false,
    });
    onBevestigen(effectiefeCat);
  }

  if (status === "fout" || fout) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Analyse tijdelijk niet beschikbaar</p>
            <p className="text-xs text-muted-foreground mt-0.5">Kies handmatig waar dit bestand thuishoort.</p>
          </div>
        </div>
        <HandmatigKiezen huidig={effectiefeCat} onKiezen={onWijzigCategorie} />
        <Button size="sm" className="w-full gap-1.5" onClick={() => onBevestigen(effectiefeCat)}>
          <ChevronRight className="h-4 w-4" />
          Ga naar {catInfo.label}
        </Button>
      </div>
    );
  }

  if (!suggestie) return null;

  const aiOverschreeftRegel =
    suggestie.ai_beschikbaar &&
    item.regelCategorie &&
    item.regelCategorie !== suggestie.categorie;

  return (
    <div className="space-y-4">
      {/* AI-herkenning wijkt af van automatiseringsregel */}
      {aiOverschreeftRegel && (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-3 flex items-start gap-2">
          <Sparkles className="h-3.5 w-3.5 text-sky-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-sky-800">AI herkende een andere categorie</p>
            <p className="text-xs text-sky-700 mt-0.5 leading-relaxed">
              De automatiseringsregel stelde{" "}
              <span className="font-medium">{CATEGORIE_INFO[item.regelCategorie!].label}</span>{" "}
              voor op basis van het bestandstype, maar de AI herkent de inhoud als{" "}
              <span className="font-medium">{catInfo.label}</span>. De AI-herkenning heeft voorrang.
            </p>
          </div>
        </div>
      )}

      {/* Hoofdvoorstel */}
      <div className={cn("rounded-lg border p-4 space-y-2", catInfo.kleur)}>
        <div className="flex items-center gap-2">
          <div className="shrink-0">{catInfo.icoon}</div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{catInfo.label}</p>
            <p className="text-[11px] opacity-70">{catInfo.omschrijving}</p>
          </div>
          {suggestie.ai_beschikbaar && (
            <Sparkles className="h-3.5 w-3.5 opacity-50 shrink-0" aria-label="AI-herkenning" />
          )}
        </div>
        {suggestie.voorstel_naam && (
          <p className="text-xs opacity-75 font-medium">{suggestie.voorstel_naam}</p>
        )}
        {suggestie.redenering && (
          <p className="text-xs opacity-60 leading-snug">{suggestie.redenering}</p>
        )}
      </div>

      {/* Impact-waarschuwing (alleen bij midden/hoog) */}
      {(impactNiveau === "midden" || impactNiveau === "hoog") && (
        <div className={cn("rounded-md border p-3 space-y-1", IMPACT_KLEUR[impactNiveau])}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <p className="text-xs font-semibold">{IMPACT_LABEL[impactNiveau]}</p>
          </div>
          {suggestie.impact_omschrijving && (
            <p className="text-xs leading-relaxed opacity-85">{suggestie.impact_omschrijving}</p>
          )}
        </div>
      )}

      {/* Toegangsbeperkingen */}
      {beperkingen.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-1">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
            <ShieldAlert className="h-3.5 w-3.5" />
            Toegangsbeperking
          </p>
          {beperkingen.map((b, i) => (
            <p key={i} className="text-xs text-amber-600">{b}</p>
          ))}
        </div>
      )}

      {/* Geen toestemming */}
      {!magUploaden && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs font-semibold text-destructive">Geen toestemming om dit bestand te uploaden</p>
          <p className="text-xs text-muted-foreground mt-0.5">Neem contact op met de hoofdbeheerder.</p>
        </div>
      )}

      {/* Jaarrekening subtype */}
      {effectiefeCat === "jaarrekening" && (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
          <span className="text-xs">Geconsolideerde jaarrekening</span>
          <Switch
            checked={item.geconsolideerd_override ?? suggestie.subtype === "geconsolideerd"}
            onCheckedChange={(val) => onGeconsolideerd?.(val)}
          />
        </div>
      )}

      {/* Personeelsdocument: medewerker + doctype selectors */}
      {effectiefeCat === "personeelsdocument" && !isCV && (
        <div className="space-y-2 rounded-lg border border-purple-200 bg-purple-50/40 p-3">
          <p className="text-xs font-semibold text-purple-700">Opslaan in personeelsdossier</p>
          <div>
            <Label className="text-xs">Medewerker <span className="text-destructive">*</span></Label>
            <Select value={gekozenMedewerker} onValueChange={setGekozenMedewerker}>
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue placeholder="Selecteer medewerker…" />
              </SelectTrigger>
              <SelectContent>
                {(medewerkerLijst as Array<{ id: number; naam: string }> | undefined)?.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Documenttype <span className="text-destructive">*</span></Label>
            <Select value={gekozenDocType} onValueChange={setGekozenDocType}>
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue placeholder="Selecteer type…" />
              </SelectTrigger>
              <SelectContent>
                {PERSONEEL_DOC_TYPEN.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* CV herkend: expliciete onboardingvraag */}
      {isCV && magUploaden && (
        <div className="space-y-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <UserPlus className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800">CV herkend — onboarding starten?</p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                De AI leest het CV en vult het onboardingformulier alvast in. U controleert en
                bevestigt alles zelf voordat er iets wordt aangemaakt.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="w-full gap-1.5"
            onClick={startCvOnboarding}
            disabled={cvBezig || (vereistBevestiging && !bevestigdAkkoord)}
          >
            {cvBezig ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                CV wordt gelezen…
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5" />
                Ja, onboarding starten
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={bewaarCvZonderOnboarding}
            disabled={cvBezig || (vereistBevestiging && !bevestigdAkkoord)}
          >
            Niet nu — alleen het document bewaren
          </Button>
        </div>
      )}

      {/* Bevestigingscheckbox (alleen bij midden/hoog impact) */}
      {vereistBevestiging && (
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={bevestigdAkkoord}
            onChange={(e) => setBevestigdAkkoord(e.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span className="text-xs text-muted-foreground leading-relaxed">
            Ik begrijp de gevolgen en wil doorgaan.
          </span>
        </label>
      )}

      {/* Andere bestemming kiezen */}
      <details className="group">
        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
          Andere bestemming kiezen
        </summary>
        <div className="mt-2">
          <HandmatigKiezen huidig={effectiefeCat} onKiezen={onWijzigCategorie} />
        </div>
      </details>

      {/* Bevestigknop */}
      {magUploaden && !isCV && (
        <Button
          size="sm"
          className="w-full gap-1.5"
          disabled={
            (vereistBevestiging && !bevestigdAkkoord) ||
            (effectiefeCat === "personeelsdocument" && !isCV && (!gekozenMedewerker || !gekozenDocType))
          }
          onClick={voerActieUit}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Bevestigen en opslaan
        </Button>
      )}
    </div>
  );
}

function HandmatigKiezen({
  huidig,
  onKiezen,
}: {
  huidig: CategorieUitgebreid;
  onKiezen: (cat: CategorieUitgebreid) => void;
}) {
  const alleCategorieen = Object.entries(CATEGORIE_INFO) as [CategorieUitgebreid, (typeof CATEGORIE_INFO)[CategorieUitgebreid]][];
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {alleCategorieen.filter(([c]) => c !== "onbekend").map(([cat, info]) => (
        <button
          key={cat}
          onClick={() => onKiezen(cat)}
          className={cn(
            "flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs text-left transition-colors",
            cat === huidig
              ? info.kleur + " font-semibold"
              : "border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground",
          )}
        >
          {info.icoon}
          <span className="truncate">{info.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Bestandsstatus badge ──────────────────────────────────────────────────────

function BestandsBadge({ status }: { status: UploadItem["status"] }) {
  if (status === "analyseert") return (
    <span className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  );
  if (status === "klaar")      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "fout")       return <AlertCircle className="h-4 w-4 text-destructive" />;
  return <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />;
}

// ── Upload wachtrij-kaart (per bestand in het zijpaneel) ─────────────────────

function WachtrijKaart({
  item,
  onToelichting,
  onAnalyseer,
  onBevestigen,
  onWijzigCategorie,
  onBevestigenPersoneel,
  onNavigeer,
  onLogActie,
  onGeconsolideerd,
}: {
  item: UploadItem;
  onToelichting: (tekst: string) => void;
  onAnalyseer: () => void;
  onBevestigen: (cat: CategorieUitgebreid) => void;
  onWijzigCategorie: (cat: CategorieUitgebreid) => void;
  onBevestigenPersoneel?: (medewerkerId: number, docType: string) => void;
  onNavigeer?: (pad: string) => void;
  onLogActie?: (data: LogActieData) => void;
  onGeconsolideerd?: (val: boolean) => void;
}) {
  const onAnalyseerRef = useRef(onAnalyseer);
  useEffect(() => { onAnalyseerRef.current = onAnalyseer; }, [onAnalyseer]);

  useEffect(() => {
    if (item.status === "wacht" && !item.actieGenomen) {
      onAnalyseerRef.current();
    }
    // Bewust geen deps — eénmalig uitvoeren bij mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-start gap-2">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate leading-tight" title={item.bestand.name}>
            {item.bestand.name}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {(item.bestand.size / 1024).toFixed(0)} KB
          </p>
        </div>
        <BestandsBadge status={item.actieGenomen ? "klaar" : item.status} />
      </div>

      {!item.actieGenomen ? (
        <>
          {(item.status === "wacht" || item.status === "analyseert") && (
            <div className="flex items-center gap-2 py-1 text-muted-foreground">
              <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
              <p className="text-xs">AI analyseert…</p>
            </div>
          )}

          {(item.status === "klaar" || item.status === "fout") && (
            <>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Toelichting (optioneel)</Label>
                <Textarea
                  placeholder="Voeg een opmerking of extra context toe…"
                  value={item.toelichting}
                  onChange={(e) => onToelichting(e.target.value)}
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>
              <BeslisScherm
                item={item}
                onBevestigen={onBevestigen}
                onWijzigCategorie={onWijzigCategorie}
                onBevestigenPersoneel={onBevestigenPersoneel}
                onNavigeer={onNavigeer}
                onLogActie={onLogActie}
                onGeconsolideerd={onGeconsolideerd}
              />
            </>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <p className="text-xs font-medium">
            {item.gekozenCategorie === "personeelsdocument"
              ? "Opgeslagen in personeelsdossier"
              : `Opgeslagen → ${CATEGORIE_INFO[item.gekozenCategorie ?? item.suggestie?.categorie ?? "algemeen"].label}`}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Bestand direct naar de documentbibliotheek aanleveren ────────────────────
// Het document komt binnen als "ter goedkeuring" en wordt door een beheerder
// beoordeeld in Documenten. Fail-loud: de servermelding wordt doorgegeven.

async function uploadNaarBibliotheek(
  bestand: File,
  categorie: string,
  toelichting?: string,
): Promise<{ ok: boolean; status: number; foutmelding: string | null }> {
  try {
    const form = new FormData();
    form.append("bestand", bestand);
    form.append("categorie", categorie);
    if (toelichting?.trim()) form.append("toelichting", toelichting.trim());
    const res = await fetch("/api/documenten/aanleveren", {
      method: "POST",
      body: form,
      credentials: "include",
    });
    let foutmelding: string | null = null;
    if (!res.ok) {
      try {
        const body = (await res.json()) as { error?: string };
        foutmelding = typeof body.error === "string" ? body.error : null;
      } catch { /* geen JSON-body */ }
    }
    return { ok: res.ok, status: res.status, foutmelding };
  } catch {
    return { ok: false, status: 0, foutmelding: null };
  }
}

// Jaarrekeningen gaan NIET naar de algemene inbox/archief, maar vertrouwelijk naar
// Financieel › Jaarrekeningen (subpad "Geconsolideerde jaarrekeningen" indien geconsolideerd).
// Gated op het recht financieel_vertrouwelijk (server-side fail-closed).
async function uploadNaarFinancieel(
  bestand: File,
  opties: { toelichting?: string; geconsolideerd?: boolean; boekjaar?: number | null; entiteit?: string | null },
): Promise<{ ok: boolean; status: number; foutmelding: string | null }> {
  try {
    const form = new FormData();
    form.append("bestand", bestand);
    form.append("subtype", opties.geconsolideerd ? "geconsolideerd" : "enkelvoudig");
    if (opties.toelichting?.trim()) form.append("opmerkingen", opties.toelichting.trim());
    if (opties.boekjaar != null) form.append("boekjaar", String(opties.boekjaar));
    if (opties.entiteit?.trim()) form.append("entiteit", opties.entiteit.trim());
    const res = await fetch("/api/financieel/jaarrekeningen", {
      method: "POST",
      body: form,
      credentials: "include",
    });
    let foutmelding: string | null = null;
    if (!res.ok) {
      try {
        const body = (await res.json()) as { error?: string };
        foutmelding = typeof body.error === "string" ? body.error : null;
      } catch { /* geen JSON-body */ }
    }
    return { ok: res.ok, status: res.status, foutmelding };
  } catch {
    return { ok: false, status: 0, foutmelding: null };
  }
}

// ── Hoofd-component ───────────────────────────────────────────────────────────

export function SlimUploadBalk() {
  const [huidigeLocatie, navigate] = useLocation();
  const { toast } = useToast();
  const [sleepActief, setSleepActief]         = useState(false);
  const [queue, setQueue]                     = useState<UploadItem[]>([]);
  const [huidigId, setHuidigId]               = useState<string | null>(null);
  const [toonDialoog, setToonDialoog]         = useState(false);
  const [toonAutomatiseren, setToonAutomatiseren] = useState<AutomatiseringsRegel | null>(null);
  const [toonInstellingen, setToonInstellingen] = useState(false);
  const [regels, setRegels]                   = useState<AutomatiseringsRegel[]>([]);
  const [recenteUploads, setRecenteUploads]   = useState<RecentUpload[]>(() => laadRecenteUploads());


  const fileInputRef = useRef<HTMLInputElement>(null);
  const sleepTeller  = useRef(0);
  const herkomstPadRef = useRef<string>("/");
  const verwerkBestandenRef = useRef<(bestanden: File[]) => Promise<void>>(async () => {});

  const herlaadRegels = useCallback(() => setRegels(laadRegels()), []);
  useEffect(() => { herlaadRegels(); }, [herlaadRegels]);

  const herlaadRecente = useCallback(() => setRecenteUploads(laadRecenteUploads()), []);
  useEffect(() => {
    const t = setInterval(herlaadRecente, 30_000);
    return () => clearInterval(t);
  }, [herlaadRecente]);


  // ── Drag-drop listeners ───────────────────────────────────────────────────

  useEffect(() => {
    function opDragEnter(e: DragEvent) {
      if (!e.dataTransfer?.types.includes("Files")) return;
      sleepTeller.current += 1;
      setSleepActief(true);
    }
    function resetSleep() {
      sleepTeller.current = 0;
      setSleepActief(false);
    }
    function opDragLeave(e: DragEvent) {
      // relatedTarget === null: cursor verlaat venster (Chrome/Edge)
      // clientX/Y buiten viewport: zelfde situatie op Firefox en sommige Edge-versies
      const buitenVenster =
        e.relatedTarget === null ||
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight;
      if (buitenVenster) { resetSleep(); return; }
      sleepTeller.current -= 1;
      if (sleepTeller.current <= 0) resetSleep();
    }
    function opEscape(e: KeyboardEvent) {
      if (e.key === "Escape") resetSleep();
    }
    function opDragOver(e: DragEvent) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }
    function opDrop(e: DragEvent) {
      e.preventDefault();
      resetSleep();
      const bestanden = Array.from(e.dataTransfer?.files ?? []);
      if (bestanden.length) void verwerkBestandenRef.current(bestanden);
    }
    // dragend valt terug voor browsers die relatedTarget niet correct vullen
    function opDragEnd() { resetSleep(); }
    document.addEventListener("dragenter", opDragEnter);
    document.addEventListener("dragleave", opDragLeave);
    document.addEventListener("dragover",  opDragOver);
    document.addEventListener("drop",      opDrop);
    document.addEventListener("dragend",   opDragEnd);
    document.addEventListener("keydown",   opEscape);
    return () => {
      document.removeEventListener("dragenter", opDragEnter);
      document.removeEventListener("dragleave", opDragLeave);
      document.removeEventListener("dragover",  opDragOver);
      document.removeEventListener("drop",      opDrop);
      document.removeEventListener("dragend",   opDragEnd);
      document.removeEventListener("keydown",   opEscape);
    };
  }, []);

  // ── Bestanden verwerken ───────────────────────────────────────────────────

  async function verwerkBestanden(bestanden: File[]) {
    const regelsHuidig = laadRegels();

    // Maak queue-items aan
    const nieuweItems: UploadItem[] = bestanden.map((b) => ({
      id: crypto.randomUUID(),
      bestand: b,
      status: "wacht" as const,
      suggestie: null,
      fout: null,
      actieGenomen: false,
      gekozenCategorie: null,
      toelichting: "",
    }));

    // Automatiseringsregels verwerken — sla de regel op als voorselectie-hint
    // maar laat de AI-analyse altijd draaien. De regel is alleen een terugval
    // wanneer de AI niets kan bepalen.
    const queueItems: UploadItem[] = [];
    for (const item of nieuweItems) {
      const ext    = haalExtensie(item.bestand.name);
      const actief = regelsHuidig.find((r) => r.extensie === ext && r.geautomatiseerd);
      if (actief) {
        queueItems.push({
          ...item,
          regelCategorie: actief.categorie,
        });
      } else {
        queueItems.push(item);
      }
    }

    // Dialoog altijd openen — ook als alles al auto-gerouteerd is
    setQueue(queueItems);
    setHuidigId(queueItems.find((i) => !i.actieGenomen)?.id ?? queueItems[0]?.id ?? null);
    setToonDialoog(true);
  }

  // Ref altijd actueel houden zodat de stale closure in de drop-listener
  // nooit een verouderde versie van verwerkBestanden aanroept.
  verwerkBestandenRef.current = verwerkBestanden;

  // ── Analyse starten (per item, parallel mogelijk) ────────────────────────

  function opToelichtingWijzigen(id: string, tekst: string) {
    setQueue((prev) => prev.map((i) => i.id === id ? { ...i, toelichting: tekst } : i));
  }

  async function startAnalyseVoorItem(id: string) {
    const item = queue.find((i) => i.id === id);
    if (!item || item.status !== "wacht") return;

    setQueue((prev) => prev.map((i) =>
      i.id === id ? { ...i, status: "analyseert" as const } : i,
    ));

    try {
      const form = new FormData();
      form.append("bestand", item.bestand);
      if (item.toelichting.trim()) {
        form.append("toelichting", item.toelichting.trim());
      }
      const res = await fetch("/api/slim-upload/analyseer", {
        method: "POST", body: form, credentials: "include",
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const suggestieBasis = (await res.json()) as SlimUploadSuggestie;

      // Regelterugval: als de AI-engine niets kon vaststellen (ai_beschikbaar: false)
      // maar er is een onthouden regel voor dit bestandstype, gebruik dan de regel
      // als categorie-terugval. Als de AI wél iets heeft bepaald, wint de AI altijd.
      const effectieveSuggestie: SlimUploadSuggestie =
        !suggestieBasis.ai_beschikbaar && item.regelCategorie
          ? {
              ...suggestieBasis,
              categorie: item.regelCategorie,
              redenering: suggestieBasis.redenering
                ? suggestieBasis.redenering
                : `AI niet beschikbaar — categorie op basis van eerdere bevestigingen voor ${haalExtensie(item.bestand.name)}-bestanden.`,
            }
          : suggestieBasis;

      setQueue((prev) => prev.map((i) =>
        i.id === id ? { ...i, status: "klaar" as const, suggestie: effectieveSuggestie } : i,
      ));
    } catch {
      setQueue((prev) => prev.map((i) =>
        i.id === id
          ? { ...i, status: "fout" as const, fout: "Verbindingsfout — kies handmatig de bestemming." }
          : i,
      ));
    }
  }

  function analyseerAlle() {
    queue.filter((i) => i.status === "wacht").forEach((item) => void startAnalyseVoorItem(item.id));
  }

  // ── Bevestigen ────────────────────────────────────────────────────────────

  function opBevestigen(itemId: string, cat: CategorieUitgebreid) {
    const item = queue.find((i) => i.id === itemId);
    if (!item) return;

    const bestand    = item.bestand;
    const ext        = haalExtensie(bestand.name);
    const { regel, vraagAutomatiseren } = registreerBevestiging(ext, cat);
    const info       = CATEGORIE_INFO[cat];

    const herkomst = huidigeLocatie;

    // Voeg toe aan 15-minuten paneel
    const recentItem: RecentUpload = {
      id: crypto.randomUUID(),
      bestandsnaam: bestand.name,
      categorie: cat,
      label: info.label,
      pad: info.pad,
      tijdstip: Date.now(),
      herkomstPad: herkomst,
    };
    voegRecentToe(recentItem);
    herlaadRecente();

    if (cat === "jaarrekening") {
      // Vertrouwelijke route: sla op onder Financieel › Jaarrekeningen (niet in het algemene archief).
      const geconsolideerd = item.geconsolideerd_override ?? item.suggestie?.subtype === "geconsolideerd";
      void uploadNaarFinancieel(bestand, {
        toelichting: item.toelichting,
        geconsolideerd,
        boekjaar: item.suggestie?.jaar ?? null,
        entiteit: item.suggestie?.organisatie ?? null,
      }).then(({ ok, status, foutmelding }) => {
        toast({
          title: ok ? "Opgeslagen bij Financieel" : "Opslaan mislukt",
          description: ok
            ? `${bestand.name} staat nu vertrouwelijk onder Financieel › ${geconsolideerd ? "Geconsolideerde jaarrekeningen" : "Jaarrekeningen"}.`
            : status === 401 || status === 403
              ? "Je hebt geen recht op vertrouwelijke financiële documenten. Neem contact op met de hoofdbeheerder."
              : foutmelding ?? `${bestand.name} kon niet worden opgeslagen. Probeer het opnieuw.`,
          variant: ok ? undefined : "destructive",
        });
      });
    } else {
      // Lever het bestand direct aan bij de documentbibliotheek (fire and forget)
      void uploadNaarBibliotheek(bestand, cat, item.toelichting).then(({ ok, status, foutmelding }) => {
        toast({
          title: ok ? "Opgeslagen in Documenten" : "Opslaan mislukt",
          description: ok
            ? `${bestand.name} (${info.label}) staat nu in Documenten, klaar ter goedkeuring.`
            : status === 401 || status === 403
              ? "Je hebt geen schrijfrecht op de documentbibliotheek. Neem contact op met de hoofdbeheerder."
              : foutmelding ?? `${bestand.name} kon niet worden opgeslagen. Probeer het opnieuw.`,
          variant: ok ? undefined : "destructive",
        });
      });
    }

    // Markeer als afgehandeld — wachtrij blijft open
    setQueue((prev) =>
      prev.map((i) => i.id === itemId ? { ...i, actieGenomen: true, gekozenCategorie: cat } : i),
    );

    if (vraagAutomatiseren) {
      setTimeout(() => { setToonAutomatiseren(regel); herlaadRegels(); }, 400);
    }
  }

  // ── Direct naar personeelsdossier uploaden ────────────────────────────────

  async function opBevestigenPersoneelFn(itemId: string, medewerkerId: number, docType: string) {
    const item = queue.find((i) => i.id === itemId);
    if (!item) return;

    const form = new FormData();
    form.append("bestand", item.bestand);
    form.append("type", docType);
    if (item.toelichting.trim()) form.append("label", item.toelichting.trim());

    try {
      const res = await fetch(`/api/medewerkers/${medewerkerId}/documenten`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (res.ok) {
        setQueue((prev) => prev.map((i) =>
          i.id === itemId ? { ...i, actieGenomen: true, gekozenCategorie: "personeelsdocument" as const } : i,
        ));
        toast({ title: "Opgeslagen in personeelsdossier", description: `${item.bestand.name} staat nu in het dossier.` });
      } else {
        toast({ title: "Opslaan mislukt", description: "Probeer het opnieuw of sla het document op via de documentbibliotheek.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Verbindingsfout", variant: "destructive" });
    }
  }

  // ── Recente uploads handlers ───────────────────────────────────────────────

  function opVerwijderRecent(id: string) {
    const bijgewerkt = laadRecenteUploads().filter((i) => i.id !== id);
    slaRecenteUploadsOp(bijgewerkt);
    setRecenteUploads(bijgewerkt);
  }

  function opVerwijderAlleRecent() {
    slaRecenteUploadsOp([]);
    setRecenteUploads([]);
  }

  function opOngedaanMaken(upload: RecentUpload) {
    opVerwijderRecent(upload.id);
    navigate(upload.herkomstPad);
  }

  function opWijzigCategorie(id: string, cat: CategorieUitgebreid) {
    setQueue((prev) => prev.map((i) => i.id === id ? { ...i, gekozenCategorie: cat } : i));
  }

  function opSluiten() {
    setToonDialoog(false);
    setQueue([]);
    setHuidigId(null);
  }

  const actieveAutomatiseringen = regels.filter((r) => r.geautomatiseerd);
  const aantalKlaar = queue.filter((i) => i.actieGenomen).length;
  const meerdere = queue.length > 1;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Recente uploads paneel ───────────────────────────────────────── */}
      <RecentUploadPanel
        uploads={recenteUploads}
        onVerwijder={opVerwijderRecent}
        onVerwijderAlles={opVerwijderAlleRecent}
        onOngedaanMaken={opOngedaanMaken}
      />

      {/* ── Dropzone overlay ──────────────────────────────────────────── */}
      {sleepActief && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-pointer"
            title="Klik om te annuleren"
            onClick={() => { sleepTeller.current = 0; setSleepActief(false); }}
          />
          <div className="relative flex flex-col items-center gap-5 rounded-2xl border-2 border-dashed border-primary bg-white shadow-2xl px-14 py-12 max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="rounded-full bg-primary/10 p-5 ring-8 ring-primary/5">
              <Upload className="h-10 w-10 text-primary" />
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-lg font-semibold text-foreground">Bestand loslaten om te uploaden</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                AI bepaalt automatisch waar elk bestand thuishoort
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground/70 bg-muted/40 rounded-full px-3 py-1.5">
              <Sparkles className="h-3 w-3 text-primary/60" />
              <span>Slimme categorisering actief</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Taakbalk ─────────────────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 right-0 z-40 flex items-center"
        style={{ left: "var(--sidebar-width, 0px)" }}
      >
        <div
          className="flex items-center gap-2 px-4 w-full border-t bg-[#1e2535] border-[#2d3548] py-2"
        >
          <span className="text-[11px] text-white/40 font-medium uppercase tracking-wider shrink-0 select-none">
            Snelkoppelingen
          </span>
          <div className="w-px h-4 bg-white/15 shrink-0" />
          <SlimUploadKnop
            onClick={() => fileInputRef.current?.click()}
            actieveAutomatiseringen={actieveAutomatiseringen.length}
          />
          <div className="flex-1" />
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
                      Regels slaan een voorkeurs-categorie op per bestandstype. De AI-analyse draait altijd en heeft voorrang op de regel.
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
        </div>
      </div>

      {/* Verborgen file-input — meerdere bestanden toegestaan */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const bestanden = Array.from(e.target.files ?? []);
          if (bestanden.length) verwerkBestanden(bestanden);
          e.target.value = "";
        }}
      />

      {/* ── Upload wachtrij (gecentreerd dialoogvenster) ──────────────────── */}
      <Dialog open={toonDialoog} onOpenChange={(open) => { if (!open) opSluiten(); }}>
        <DialogContent className="max-w-[500px] p-0 flex flex-col gap-0 max-h-[85vh] overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Upload wachtrij
              <Badge variant="secondary" className="ml-auto text-xs font-normal">
                {aantalKlaar}/{queue.length} verwerkt
              </Badge>
            </DialogTitle>
            {queue.some((i) => i.status === "wacht") && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full gap-1.5"
                onClick={analyseerAlle}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Analyseer alle wachtende bestanden ({queue.filter((i) => i.status === "wacht").length})
              </Button>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto divide-y">
            {queue.map((item) => (
              <WachtrijKaart
                key={item.id}
                item={item}
                onToelichting={(tekst) => opToelichtingWijzigen(item.id, tekst)}
                onAnalyseer={() => void startAnalyseVoorItem(item.id)}
                onBevestigen={(cat) => opBevestigen(item.id, cat)}
                onWijzigCategorie={(cat) => opWijzigCategorie(item.id, cat)}
                onBevestigenPersoneel={(mid, dt) => void opBevestigenPersoneelFn(item.id, mid, dt)}
                onNavigeer={(pad) => { navigate(pad); opSluiten(); }}
                onLogActie={logUploadActie}
                onGeconsolideerd={(val) => setQueue((prev) => prev.map((i) => i.id === item.id ? { ...i, geconsolideerd_override: val } : i))}
              />
            ))}

            {queue.length > 0 && queue.every((i) => i.actieGenomen) && (
              <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <div>
                  <p className="text-sm font-semibold">Alle bestanden opgeslagen</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    De bestanden staan nu op hun eindbestemming.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={opSluiten}>
                  Wachtrij sluiten
                </Button>
              </div>
            )}
          </div>

          {queue.some((i) => !i.actieGenomen) && (
            <div className="px-4 py-3 border-t shrink-0 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={opSluiten} className="gap-1.5">
                <X className="h-3.5 w-3.5" />
                Sluiten
              </Button>
              <p className="text-xs text-muted-foreground">
                {queue.filter((i) => !i.actieGenomen).length} te verwerken
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Automatiseer-dialoog ──────────────────────────────────────────── */}
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
                Mag dit bestandstype voortaan worden voorgeselecteerd als{" "}
                <span className="font-medium text-foreground">
                  {CATEGORIE_INFO[toonAutomatiseren.categorie].label}
                </span>?
                De AI-analyse draait altijd en kan de voorselectie nog overschrijven als de inhoud anders is.
              </p>
              <div className="rounded-md bg-muted/50 p-3 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  U kunt dit altijd terugdraaien via het tandwiel-icoon in de taakbalk.
                </p>
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setToonAutomatiseren(null)} className="gap-1.5">
              <ZapOff className="h-3.5 w-3.5" />
              Nee, blijf vragen
            </Button>
            <Button size="sm" onClick={() => {
              if (toonAutomatiseren) { activeerAutomatisering(toonAutomatiseren.id); herlaadRegels(); }
              setToonAutomatiseren(null);
            }} className="gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Ja, automatiseer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

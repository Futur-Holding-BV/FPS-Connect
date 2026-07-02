import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Upload, Sparkles, X, ChevronRight, Trash2, CheckCircle2, AlertCircle,
  FileText, BookOpen, Receipt, Users, PenLine, Archive, FolderOpen,
  Zap, ZapOff, Settings, AlertTriangle, ShieldAlert, HelpCircle,
  ClipboardList, BadgeCheck, FileCheck, Ruler, Package, LayoutTemplate,
  RotateCcw, Clock, History,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useListMedewerkers } from "@workspace/api-client-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type CategorieUitgebreid =
  | "aanvraag" | "tekening" | "offerte" | "factuur"
  | "productdocument" | "testrapport" | "certificaat" | "eta" | "dop"
  | "personeelsdocument" | "snagstream" | "bibliotheek" | "document_sjabloon" | "algemeen" | "onbekend";

type Vertrouwen = "laag" | "midden" | "hoog";

interface SlimUploadSuggestie {
  categorie: CategorieUitgebreid;
  voorstel_naam: string;
  redenering: string;
  vertrouwen: Vertrouwen;
  ai_beschikbaar: boolean;
  vision_gebruikt: boolean;
  gevonden_gegevens: Record<string, string>;
  alternatieven: CategorieUitgebreid[];
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
  snagstream:        { label: "Snagstream archief",            icoon: <Archive className="h-4 w-4" />,      pad: "/snagstream",  kleur: "bg-rose-50 text-rose-700 border-rose-200",        omschrijving: "Opleverrapport, inspectieverslag, punchlijst" },
  bibliotheek:       { label: "Documentenbibliotheek",         icoon: <BookOpen className="h-4 w-4" />,        pad: "/documenten",           kleur: "bg-blue-50 text-blue-700 border-blue-200",        omschrijving: "Technisch brandveiligheidsdocument" },
  document_sjabloon: { label: "Document Studio — sjabloon",    icoon: <LayoutTemplate className="h-4 w-4" />, pad: "/organisatie/studio", kleur: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", omschrijving: "Briefpapier, onderlegger of huisstijl-sjabloon" },
  algemeen:          { label: "Documenten (algemeen)",         icoon: <FolderOpen className="h-4 w-4" />,    pad: "/documenten",           kleur: "bg-gray-50 text-gray-700 border-gray-200",        omschrijving: "Overige bedrijfsdocumenten" },
  onbekend:          { label: "Onbekend — handmatig kiezen",   icoon: <HelpCircle className="h-4 w-4" />,    pad: "/documenten",           kleur: "bg-gray-50 text-gray-600 border-gray-200",        omschrijving: "AI kon het type niet vaststellen" },
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

const GEVONDEN_LABELS: Record<string, string> = {
  leverancier: "Leverancier", klant: "Klant", bedrag: "Bedrag",
  factuurnummer: "Factuurnummer", datum: "Datum", betalingstermijn: "Betalingstermijn",
  locatie: "Locatie", contactpersoon: "Contactpersoon", projectnaam: "Projectnaam",
  omschrijving: "Omschrijving", fabrikant: "Fabrikant", productnaam: "Productnaam",
  normen: "Normen", geldig_tot: "Geldig tot", classificatie: "Classificatie",
  naam_medewerker: "Medewerker", type_document: "Documenttype",
  project: "Project", schaal: "Schaal", revisie: "Revisie", referentie: "Referentie",
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

// ── Gevonden-gegevens kaart ───────────────────────────────────────────────────

function GevondenGegevens({ gegevens }: { gegevens: Record<string, string> }) {
  const items = Object.entries(gegevens).filter(([, v]) => v?.trim());
  if (items.length === 0) return null;
  return (
    <div className="rounded-md border bg-muted/30 divide-y text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="flex gap-2 px-3 py-1.5">
          <span className="text-muted-foreground text-xs min-w-[110px] shrink-0 pt-0.5">
            {GEVONDEN_LABELS[k] ?? k}
          </span>
          <span className="font-medium text-xs leading-relaxed">{v}</span>
        </div>
      ))}
    </div>
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

function BeslisScherm({
  item,
  onBevestigen,
  onWijzigCategorie,
  onBevestigenPersoneel,
}: {
  item: UploadItem;
  onBevestigen: (cat: CategorieUitgebreid) => void;
  onWijzigCategorie: (cat: CategorieUitgebreid) => void;
  onBevestigenPersoneel?: (medewerkerId: number, docType: string) => void;
}) {
  const [gekozenMedewerker, setGekozenMedewerker] = useState("");
  const [gekozenDocType, setGekozenDocType] = useState("");
  const { data: medewerkerLijst } = useListMedewerkers();

  const { suggestie, fout, status } = item;
  const effectiefeCat = item.gekozenCategorie ?? suggestie?.categorie ?? "algemeen";
  const catInfo = CATEGORIE_INFO[effectiefeCat];

  // Technische fout → handmatig kiezen
  if (status === "fout" || fout) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Analyse tijdelijk niet beschikbaar</p>
            <p className="text-xs text-muted-foreground mt-0.5">Kies handmatig waar dit bestand thuishoort. Het bestand wordt niet verloren.</p>
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

  const isOnzeker = suggestie.categorie === "onbekend" || suggestie.vertrouwen === "laag";

  const isAutoGerouteerd = !suggestie.ai_beschikbaar &&
    suggestie.redenering.startsWith("Automatisch herkend op basis van eerder bevestigde regelinstelling");

  return (
    <div className="space-y-4">
      {/* Banner: automatisch herkend via regel */}
      {isAutoGerouteerd && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <Zap className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-700">Automatisch herkend</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Dit bestandstype is eerder bevestigd als {CATEGORIE_INFO[effectiefeCat].label}.
              Controleer de bestemming en voeg eventueel een toelichting toe voor u opslaat.
            </p>
          </div>
        </div>
      )}

      {/* AVG-waarschuwing voor personeelsdocumenten */}
      {(effectiefeCat === "personeelsdocument" || suggestie.categorie === "personeelsdocument") && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-700">AVG — Privacygevoelig document</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Dit lijkt een personeelsdocument. Sla het op bij Personeel / HRM en maak het niet breed zichtbaar.
            </p>
          </div>
        </div>
      )}

      {/* Hoofdvoorstel */}
      <div className={cn("rounded-lg border p-4 space-y-3", catInfo.kleur)}>
        <div className="flex items-center gap-2">
          {catInfo.icoon}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight">{catInfo.label}</p>
            <p className="text-[11px] opacity-70">{catInfo.omschrijving}</p>
          </div>
          <span className={cn("text-xs font-medium shrink-0", VERTROUWEN_KLEUR[suggestie.vertrouwen])}>
            {VERTROUWEN_LABEL[suggestie.vertrouwen]}
          </span>
        </div>
        {suggestie.voorstel_naam && (
          <div>
            <p className="text-[10px] uppercase tracking-wide font-semibold opacity-60 mb-0.5">Voorgestelde naam</p>
            <p className="text-sm font-medium">{suggestie.voorstel_naam}</p>
          </div>
        )}
        {suggestie.redenering && (
          <p className="text-xs opacity-75 leading-relaxed">{suggestie.redenering}</p>
        )}
        {suggestie.ai_beschikbaar && suggestie.vision_gebruikt && (
          <p className="text-[10px] opacity-60 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            AI heeft de visuele lay-out geanalyseerd
          </p>
        )}
        {!suggestie.ai_beschikbaar && (
          <p className="text-[10px] opacity-50 italic">Geclassificeerd op bestandsnaam (AI niet actief)</p>
        )}
      </div>

      {/* Gevonden gegevens */}
      {Object.keys(suggestie.gevonden_gegevens ?? {}).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Herkende gegevens</p>
          <GevondenGegevens gegevens={suggestie.gevonden_gegevens ?? {}} />
        </div>
      )}

      {/* Bij document_sjabloon: Studio-actie tonen */}
      {effectiefeCat === "document_sjabloon" && (
        <div className="rounded-md border bg-fuchsia-50 border-fuchsia-200 p-3 space-y-2">
          <p className="text-xs font-semibold text-fuchsia-700">Dit lijkt een huisstijl-sjabloon of briefpapier</p>
          <p className="text-xs text-fuchsia-600">
            Klik op "Naar Document Studio" om naar de Studio te navigeren. Upload het bestand daar vervolgens handmatig bij het gewenste documenttype (bijv. Offerte of Brief) via de knop "Referentie uploaden".
          </p>
          <div className="flex flex-col gap-1.5 mt-1">
            <Button size="sm" variant="default" className="justify-start gap-2 text-xs"
              onClick={() => onBevestigen("document_sjabloon")}>
              <LayoutTemplate className="h-3.5 w-3.5" />
              Naar Document Studio
            </Button>
            <Button size="sm" variant="outline" className="justify-start gap-2 text-xs"
              onClick={() => onWijzigCategorie("bibliotheek")}>
              <BookOpen className="h-3.5 w-3.5" />
              Opslaan in documentenbibliotheek
            </Button>
          </div>
        </div>
      )}

      {/* Bij aanvraag: vervolgacties tonen */}
      {(effectiefeCat === "aanvraag") && (
        <div className="rounded-md border bg-violet-50 border-violet-200 p-3 space-y-2">
          <p className="text-xs font-semibold text-violet-700">Dit lijkt een nieuwe aanvraag</p>
          <div className="flex flex-col gap-1.5">
            <Button size="sm" variant="default" className="justify-start gap-2 text-xs"
              onClick={() => onBevestigen("aanvraag")}>
              <ChevronRight className="h-3.5 w-3.5" />
              Nieuw werk / project aanmaken
            </Button>
            <Button size="sm" variant="outline" className="justify-start gap-2 text-xs"
              onClick={() => onWijzigCategorie("bibliotheek")}>
              <BookOpen className="h-3.5 w-3.5" />
              Alleen opslaan in documentenbibliotheek
            </Button>
          </div>
        </div>
      )}

      {/* Onzeker / onbekend: top alternatieven */}
      {isOnzeker && (suggestie.alternatieven ?? []).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">
            {suggestie.categorie === "onbekend"
              ? "Kies de beste bestemming:"
              : "Niet wat u verwacht? Andere opties:"}
          </p>
          <div className="space-y-1.5">
            {suggestie.alternatieven.slice(0, 3).map((cat) => {
              const info = CATEGORIE_INFO[cat];
              return (
                <button
                  key={cat}
                  onClick={() => onWijzigCategorie(cat)}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-md border px-3 py-2 text-xs text-left transition-colors",
                    item.gekozenCategorie === cat
                      ? info.kleur + " font-semibold"
                      : "border-border bg-background hover:bg-muted/50",
                  )}
                >
                  {info.icoon}
                  <div className="flex-1">
                    <p className="font-medium">{info.label}</p>
                    <p className="text-muted-foreground text-[10px]">{info.omschrijving}</p>
                  </div>
                  {item.gekozenCategorie === cat && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Overige alternatieven / handmatig kiezen */}
      {effectiefeCat !== "aanvraag" && (
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
            Handmatig een andere bestemming kiezen
          </summary>
          <div className="mt-2">
            <HandmatigKiezen huidig={effectiefeCat} onKiezen={onWijzigCategorie} />
          </div>
        </details>
      )}

      {/* Actieknop */}
      {effectiefeCat !== "aanvraag" && effectiefeCat !== "personeelsdocument" && (
        <Button size="sm" className="w-full gap-1.5" onClick={() => onBevestigen(effectiefeCat)}>
          <ChevronRight className="h-4 w-4" />
          Ga naar {CATEGORIE_INFO[effectiefeCat].label}
        </Button>
      )}

      {/* Personeelsdocument → direct naar medewerker-dossier */}
      {effectiefeCat === "personeelsdocument" && (
        <div className="space-y-3 rounded-lg border border-purple-200 bg-purple-50/40 p-3">
          <p className="text-xs font-semibold text-purple-700">Direct opslaan in personeelsdossier</p>
          <div className="space-y-2">
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
          <Button
            size="sm"
            className="w-full gap-1.5"
            disabled={!gekozenMedewerker || !gekozenDocType}
            onClick={() => onBevestigenPersoneel?.(Number(gekozenMedewerker), gekozenDocType)}
          >
            <Users className="h-3.5 w-3.5" />
            Opslaan in dossier
          </Button>
          <button
            className="w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
            onClick={() => onBevestigen("personeelsdocument")}
          >
            Liever via inbox opslaan
          </button>
        </div>
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
}: {
  item: UploadItem;
  onToelichting: (tekst: string) => void;
  onAnalyseer: () => void;
  onBevestigen: (cat: CategorieUitgebreid) => void;
  onWijzigCategorie: (cat: CategorieUitgebreid) => void;
  onBevestigenPersoneel?: (medewerkerId: number, docType: string) => void;
}) {
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
          {item.status === "wacht" && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs font-medium">
                  Toelichting <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  placeholder="Beschrijf het document (bijv. arbeidscontract Jan de Vries, VCA-certificaat 2025, offerte project X)…"
                  value={item.toelichting}
                  onChange={(e) => onToelichting(e.target.value)}
                  rows={2}
                  className="text-xs resize-none"
                />
                <p className="text-[10px] text-muted-foreground">Verplicht — helpt de AI het document correct te routeren.</p>
              </div>
              <Button size="sm" className="w-full gap-1.5" onClick={onAnalyseer} disabled={!item.toelichting.trim()}>
                <Sparkles className="h-3.5 w-3.5" />
                Analyseren
              </Button>
            </div>
          )}

          {item.status === "analyseert" && (
            <div className="flex items-center gap-2 py-1 text-muted-foreground">
              <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
              <p className="text-xs">AI analyseert…</p>
            </div>
          )}

          {(item.status === "klaar" || item.status === "fout") && (
            <>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Toelichting</Label>
                <Textarea
                  placeholder="Optioneel — voeg een opmerking of context toe bij dit document…"
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
              : `Opgeslagen in inbox → ${CATEGORIE_INFO[item.gekozenCategorie ?? item.suggestie?.categorie ?? "algemeen"].label}`}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Bestand naar inbox uploaden ───────────────────────────────────────────────

async function uploadNaarInbox(bestand: File, toelichting?: string): Promise<boolean> {
  try {
    const form = new FormData();
    form.append("bestand", bestand);
    if (toelichting?.trim()) form.append("opmerkingen", toelichting.trim());
    const res = await fetch("/api/inbox/items", {
      method: "POST",
      body: form,
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
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

    // Automatiseringsregels verwerken — pre-fill de categorie maar altijd
    // bevestiging vragen zodat de gebruiker een toelichting kan toevoegen.
    const queueItems: UploadItem[] = [];
    for (const item of nieuweItems) {
      const ext    = haalExtensie(item.bestand.name);
      const actief = regelsHuidig.find((r) => r.extensie === ext && r.geautomatiseerd);
      const catInfo = actief ? CATEGORIE_INFO[actief.categorie] : undefined;
      if (actief && catInfo) {
        // Synthetische suggestie zodat de beslisscherm-UI normaal rendert
        const synthetischeSuggestie: SlimUploadSuggestie = {
          categorie: actief.categorie,
          voorstel_naam: item.bestand.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim(),
          redenering: `Automatisch herkend op basis van eerder bevestigde regelinstelling voor ${actief.extensie}-bestanden.`,
          vertrouwen: "hoog",
          ai_beschikbaar: false,
          vision_gebruikt: false,
          gevonden_gegevens: {},
          alternatieven: [],
        };
        queueItems.push({
          ...item,
          status: "klaar" as const,
          actieGenomen: false,
          gekozenCategorie: actief.categorie,
          suggestie: synthetischeSuggestie,
        });
      } else {
        queueItems.push(item);
      }
    }

    // Sheet altijd openen — ook als alles al auto-gerouteerd is
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

      const suggestie = (await res.json()) as SlimUploadSuggestie;

      setQueue((prev) => prev.map((i) =>
        i.id === id ? { ...i, status: "klaar" as const, suggestie } : i,
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
    queue.filter((i) => i.status === "wacht" && i.toelichting.trim()).forEach((item) => void startAnalyseVoorItem(item.id));
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

    // Upload het bestand naar de inbox (fire and forget)
    void uploadNaarInbox(bestand, item.toelichting).then((ok) => {
      toast({
        title: ok ? "Opgeslagen in inbox" : "Categorisering bevestigd",
        description: ok
          ? `${bestand.name} staat nu in Slim uploaden › Inbox.`
          : `${bestand.name} → ${info.label}. Opslaan mislukt — upload het bestand handmatig.`,
      });
    });

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
        toast({ title: "Opslaan mislukt", description: "Probeer het opnieuw of kies 'Liever via inbox opslaan'.", variant: "destructive" });
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

      {/* ── Upload wachtrij (zijpaneel) ───────────────────────────────────── */}
      <Sheet open={toonDialoog} onOpenChange={(open) => { if (!open) opSluiten(); }}>
        <SheetContent side="right" className="w-[440px] sm:max-w-[440px] p-0 flex flex-col gap-0">
          <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Upload wachtrij
              <Badge variant="secondary" className="ml-auto text-xs font-normal">
                {aantalKlaar}/{queue.length} verwerkt
              </Badge>
            </SheetTitle>
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
          </SheetHeader>

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
              />
            ))}

            {queue.length > 0 && queue.every((i) => i.actieGenomen) && (
              <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <div>
                  <p className="text-sm font-semibold">Alle bestanden opgeslagen</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    De bestanden staan nu in Slim uploaden › Inbox.
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
        </SheetContent>
      </Sheet>

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

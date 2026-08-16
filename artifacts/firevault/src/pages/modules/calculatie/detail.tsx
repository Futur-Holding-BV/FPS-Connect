import React, { useState, useCallback, useRef, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import {
  useGetModCalculatie,
  useUpdateModCalculatie,
  useDeleteModCalculatie,
  useDupliceerModCalculatie,
  useMaakOfferteVanCalculatie,
  useListOffertes,
  useCreateModCalcRegel,
  useUpdateModCalcRegel,
  useHerschikModCalcRegel,
  useDeleteModCalcRegel,
  useListModCalcNormtijden,
  useListModCalcTarieven,
  useAiModCalcRegels,
  useListModCalcInkoopItems,
  useCreateModCalcInkoopItem,
  useUpdateModCalcInkoopItem,
  useDeleteModCalcInkoopItem,
  useGenerateRfqConceptMail,
  getListModCalcInkoopItemsQueryKey,
  useAiChatCalculatie,
  useListOpnames,
  getListOpnamesQueryKey,
  useListModCalcEenheden,
  useCreateModCalcEenheid,
  useUpdateModCalcEenheid,
  useDeleteModCalcEenheid,
  getListModCalcEenhedenQueryKey,
  type ModCalcInkoopItem,
  type CalcEenheid,
  useListEenheidsprijzen,
  type EenheidsPrijs,
  useGetFieContextCalculatie,
  getGetFieContextCalculatieQueryKey,
  useListEnkBronbestanden,
  useListGekoppeldeDocumenten,
  getListGekoppeldeDocumentenQueryKey,
} from "@workspace/api-client-react";
import AiChatPanel from "@/components/ai-chat-panel";
import AiSeniorCalculatorPanel from "@/components/ai-senior-calculator-panel";
import { PlakInvoer } from "./plak-invoer";
import { AdviesInrichten } from "./advies-inrichten";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Plus, Pencil, Trash2, Copy, ChevronRight, FileText,
  LayoutList, Users, Eye, Sparkles, Wrench, CheckCircle2, X,
  Printer, History, Save, MoreHorizontal, MessageSquare, BrainCircuit,
  ChevronDown, ChevronUp, Building2, BookOpen, Search,
  TrendingUp, TrendingDown, Minus, AlertTriangle,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ProcesBalk } from "@/components/proces-balk";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";

// ─── Constanten ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  intern_akkoord: "Intern akkoord",
  aangeboden: "Aangeboden",
  gewonnen: "Gewonnen",
  verloren: "Verloren",
};

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-muted text-muted-foreground border-border",
  intern_akkoord: "bg-violet-100 text-violet-800 border-violet-200",
  aangeboden: "bg-amber-100 text-amber-800 border-amber-200",
  gewonnen: "bg-green-100 text-green-800 border-green-200",
  verloren: "bg-red-100 text-red-800 border-red-200",
};

/** Procesbalk-stappen (herbruikbaar patroon Projectaanpak): commercieel traject van een calculatie. */
const PROCES_STAPPEN = [
  { sleutel: "concept", label: "Concept" },
  { sleutel: "intern_akkoord", label: "Intern akkoord" },
  { sleutel: "aangeboden", label: "Offerte" },
  { sleutel: "gewonnen", label: "Opdracht" },
];

const STATUS_WORKFLOW: Record<string, string[]> = {
  concept: ["intern_akkoord", "verloren"],
  intern_akkoord: ["aangeboden", "verloren"],
  aangeboden: ["gewonnen", "verloren"],
  gewonnen: [],
  verloren: ["concept"],
};

const KOSTENSOORT_OPTIES = [
  { value: "arbeid",         label: "Arbeid" },
  { value: "materiaal",      label: "Materiaal" },
  { value: "materieel",      label: "Materieel" },
  { value: "onderaanneming", label: "Onderaanneming" },
  { value: "opslag",         label: "Opslag / toeslag" },
  { value: "stelpost",       label: "Stelpost" },
  { value: "regiepost",      label: "Regiepost" },
];

const CATEGORIE_LABEL: Record<string, string> = {
  arbeid: "Arbeid",
  materiaal: "Materiaal",
  onderaanneming: "Onderaanneming",
  materieel: "Materieel",
  opslag: "Opslag / toeslag",
  stelpost: "Stelpost",
  regiepost: "Regiepost",
  overig: "Overig",
};

const CATEGORIE_KLEUR: Record<string, string> = {
  arbeid:         "bg-muted text-muted-foreground",
  materiaal:      "bg-green-50 text-green-700",
  onderaanneming: "bg-purple-50 text-purple-700",
  materieel:      "bg-orange-50 text-orange-700",
  opslag:         "bg-amber-50 text-amber-700",
  stelpost:       "bg-amber-100 text-amber-800",
  regiepost:      "bg-pink-50 text-pink-700",
  overig:         "bg-muted/50 text-muted-foreground",
};

const EENHEDEN = ["st", "pst", "m1", "m2", "m3", "uur", "dag", "week", "lump_sum"];

const BTW_OPTIES = [
  { value: "21",      label: "21%" },
  { value: "9",       label: "9%" },
  { value: "verlegd", label: "Verlegd" },
  { value: "0",       label: "0%" },
];

const HOOFDSTUK_OPTIES = [
  "Brandwerende doorvoeringen",
  "Brandwerende deuren",
  "Brandwerende beglazing",
  "Bouwkundig herstel",
  "Sloopwerk",
  "Aftimmerwerk",
  "Schilderwerk",
  "Deuren en kozijnen",
  "Wanden en plafonds",
  "Schachten",
  "Onderhoud",
  "Applicaties",
  "Timmerwerk",
  "Glas",
  "Installaties",
  "Bouwplaatskosten / ABK",
  "Algemene kosten",
  "Overige werkzaamheden",
  "Algemeen niet projectgerelateerd",
];

// AI hint tabel (keyword → toepassing suggestie met normtijden)
const TOEPASSING_HINTS: Array<{ keyword: string; toepassing: string; mu: string; categorie: string; eenheid: string }> = [
  { keyword: "doorvoering",  toepassing: "Brandwerende doorvoering",  mu: "0.25", categorie: "arbeid",    eenheid: "st" },
  { keyword: "branddeur",    toepassing: "Brandwerende deur",          mu: "1.50", categorie: "arbeid",    eenheid: "st" },
  { keyword: "brandklep",    toepassing: "Brandklep",                  mu: "0.50", categorie: "arbeid",    eenheid: "st" },
  { keyword: "manchet",      toepassing: "Brandmanchet",               mu: "0.15", categorie: "arbeid",    eenheid: "st" },
  { keyword: "pvc",          toepassing: "PVC doorvoering",            mu: "0.25", categorie: "arbeid",    eenheid: "st" },
  { keyword: "coating",      toepassing: "Brandwerende coating",       mu: "0.08", categorie: "materiaal", eenheid: "m2" },
  { keyword: "kit",          toepassing: "Brandwerende kit",           mu: "0.06", categorie: "materiaal", eenheid: "m1" },
  { keyword: "beglazing",    toepassing: "Brandwerende beglazing",     mu: "2.00", categorie: "arbeid",    eenheid: "st" },
  { keyword: "inspectie",    toepassing: "Inspectie",                  mu: "0.50", categorie: "regiepost", eenheid: "st" },
  { keyword: "afdichting",   toepassing: "Brandwerende afdichting",    mu: "0.20", categorie: "arbeid",    eenheid: "st" },
  { keyword: "schuim",       toepassing: "Brandwerend schuim",         mu: "0.10", categorie: "materiaal", eenheid: "st" },
  { keyword: "plaat",        toepassing: "Brandwerende plaat",         mu: "0.30", categorie: "materiaal", eenheid: "m2" },
  { keyword: "stopverf",     toepassing: "Brandwerende stopverf",      mu: "0.12", categorie: "materiaal", eenheid: "st" },
  { keyword: "houder",       toepassing: "Kabelhouder brandwerend",    mu: "0.10", categorie: "arbeid",    eenheid: "st" },
];

// ─── Types ──────────────────────────────────────────────────────────────────

type Weergave = "intern" | "directie" | "klant" | "monteur";

type RegelRow = {
  id: number;
  calculatie_id: number;
  eenheid_id?: number | null;
  categorie: string;
  omschrijving: string;
  normtijd_id?: number | null;
  normtijd_code?: string | null;
  eenheid: string;
  hoeveelheid: number;
  tarief: number;
  totaal: number;
  volgorde: number;
  opmerkingen?: string | null;
  regelnummer?: string | null;
  mu_per_eenheid: number;
  arbeids_tarief: number;
  onderaanneming_bedrag: number;
  is_staartkosten: boolean;
  is_bouwplaatskosten: boolean;
  hoofdstuk: string;
  klanttekst?: string | null;
  materiaal_totaal: number;
  mu_totaal: number;
  arbeidsloon: number;
  btw_tarief?: string | null;
  wand_plafond?: string | null;
  toepassing_tekst?: string | null;
  soort?: string | null;
  optioneel?: boolean;
  ouder_regel_id?: number | null;
};

type LocalDraft = {
  eenheid_id: number | null;
  categorie: string;
  omschrijving: string;
  eenheid: string;
  hoeveelheid: string;
  tarief: string;
  mu_per_eenheid: string;
  arbeids_tarief: string;
  onderaanneming_bedrag: string;
  is_staartkosten: boolean;
  is_bouwplaatskosten: boolean;
  hoofdstuk: string;
  klanttekst: string;
  opmerkingen: string;
  regelnummer: string;
  btw_tarief: string;
  wand_plafond: string;
  toepassing_tekst: string;
  soort: string;
  optioneel: boolean;
  ouder_regel_id: number | null;
};

const LEEG_DRAFT: LocalDraft = {
  eenheid_id: null,
  categorie: "arbeid",
  omschrijving: "",
  eenheid: "st",
  hoeveelheid: "1",
  tarief: "0",
  mu_per_eenheid: "0",
  arbeids_tarief: "0",
  onderaanneming_bedrag: "0",
  is_staartkosten: false,
  is_bouwplaatskosten: false,
  hoofdstuk: "Overige werkzaamheden",
  klanttekst: "",
  opmerkingen: "",
  regelnummer: "",
  btw_tarief: "21",
  wand_plafond: "",
  toepassing_tekst: "",
  soort: "regel",
  optioneel: false,
  ouder_regel_id: null,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function regelToDraft(r: RegelRow): LocalDraft {
  return {
    eenheid_id: r.eenheid_id ?? null,
    categorie: r.categorie,
    omschrijving: r.omschrijving,
    eenheid: r.eenheid,
    hoeveelheid: String(r.hoeveelheid),
    tarief: String(r.tarief),
    mu_per_eenheid: String(r.mu_per_eenheid ?? 0),
    arbeids_tarief: String(r.arbeids_tarief ?? 0),
    onderaanneming_bedrag: String(r.onderaanneming_bedrag ?? 0),
    is_staartkosten: r.is_staartkosten ?? false,
    is_bouwplaatskosten: r.is_bouwplaatskosten ?? false,
    hoofdstuk: r.hoofdstuk ?? "Overige werkzaamheden",
    klanttekst: r.klanttekst ?? "",
    opmerkingen: r.opmerkingen ?? "",
    regelnummer: r.regelnummer ?? "",
    btw_tarief: r.btw_tarief ?? "21",
    wand_plafond: r.wand_plafond ?? "",
    toepassing_tekst: r.toepassing_tekst ?? "",
    soort: r.soort ?? "regel",
    optioneel: r.optioneel ?? false,
    ouder_regel_id: r.ouder_regel_id ?? null,
  };
}

function draftToPayload(d: LocalDraft) {
  return {
    eenheid_id: d.eenheid_id ?? null,
    categorie: d.categorie,
    omschrijving: d.omschrijving,
    eenheid: d.eenheid,
    hoeveelheid: parseFloat(d.hoeveelheid) || 0,
    tarief: parseFloat(d.tarief) || 0,
    mu_per_eenheid: parseFloat(d.mu_per_eenheid) || 0,
    arbeids_tarief: parseFloat(d.arbeids_tarief) || 0,
    onderaanneming_bedrag: parseFloat(d.onderaanneming_bedrag) || 0,
    is_staartkosten: d.is_staartkosten,
    is_bouwplaatskosten: d.is_bouwplaatskosten,
    hoofdstuk: d.hoofdstuk || "Overige werkzaamheden",
    klanttekst: d.klanttekst || null,
    opmerkingen: d.opmerkingen || null,
    regelnummer: d.regelnummer || null,
    btw_tarief: d.btw_tarief || "21",
    wand_plafond: d.wand_plafond || null,
    toepassing_tekst: d.toepassing_tekst || null,
    soort: d.soort || "regel",
    optioneel: d.optioneel,
    ouder_regel_id: d.ouder_regel_id ?? null,
  };
}

function formatBedrag(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

function formatBedragKort(n: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency", currency: "EUR",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function fmt2(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

function rnd(n: number) { return Math.round(n * 100) / 100; }

// ADVIES_01 §6: alleen 'regel' en 'materiaal' tellen mee in het totaal.
const MEETELLENDE_SOORTEN = new Set(["regel", "materiaal"]);
function teltMeeRegel(r: { soort?: string | null }): boolean {
  return MEETELLENDE_SOORTEN.has(r.soort ?? "regel");
}

// Ouderkeuze voor een materiaalregel: de gewone werkregels binnen dezelfde groep.
function ouderOptiesVoor(siblings: RegelRow[], eigenId: number): Array<{ id: number; omschrijving: string }> {
  return siblings
    .filter((x) => (x.soort ?? "regel") === "regel" && x.id !== eigenId)
    .map((x) => ({ id: x.id, omschrijving: x.omschrijving }));
}

// Herschik-weergave: materiaalkinderen visueel direct onder hun ouder tonen,
// ook wanneer hun 'volgorde' (nog) niet aansluitend is.
function ordenKinderenOnderOuder(rs: RegelRow[]): RegelRow[] {
  const ids = new Set(rs.map((r) => r.id));
  const kinderen = new Map<number, RegelRow[]>();
  const top: RegelRow[] = [];
  for (const r of rs) {
    if (r.ouder_regel_id != null && ids.has(r.ouder_regel_id)) {
      const lijst = kinderen.get(r.ouder_regel_id) ?? [];
      lijst.push(r);
      kinderen.set(r.ouder_regel_id, lijst);
    } else {
      top.push(r);
    }
  }
  return top.flatMap((p) => [p, ...(kinderen.get(p.id) ?? [])]);
}

const SOORT_OPTIES = [
  { value: "regel",     label: "Regel" },
  { value: "materiaal", label: "Materiaal (onder ouderregel)" },
  { value: "tekst",     label: "Tekst (geen bedrag)" },
  { value: "stelpost",  label: "Stelpost (telt niet mee)" },
  { value: "kop",       label: "Kop" },
];

function toepassingHintVoorOmschrijving(omschrijving: string) {
  const lower = omschrijving.toLowerCase();
  return TOEPASSING_HINTS.find((h) => lower.includes(h.keyword)) ?? null;
}

function detecteerWandPlafond(omschrijving: string): "wand" | "plafond" | "" {
  const lower = omschrijving.toLowerCase();
  if (lower.includes("wand") || lower.includes("muur")) return "wand";
  if (lower.includes("plafond") || lower.includes("vloer")) return "plafond";
  return "";
}

// ─── Tab-navigatie helper ────────────────────────────────────────────────────

function handleTabNavigatieInRij(
  e: React.KeyboardEvent,
  huidigeCelIndex: number,
  rowRef: React.RefObject<HTMLTableRowElement | null>,
  onLaatste: () => void
) {
  if (e.key !== "Tab") return;
  e.preventDefault();
  if (!rowRef.current) return;
  const cellen = Array.from(
    rowRef.current.querySelectorAll<HTMLElement>("[data-celindex]")
  ).sort((a, b) => Number(a.dataset.celindex) - Number(b.dataset.celindex));
  const huidig = cellen.findIndex((el) => Number(el.dataset.celindex) === huidigeCelIndex);
  const volgende = e.shiftKey ? huidig - 1 : huidig + 1;
  if (volgende >= 0 && volgende < cellen.length) {
    cellen[volgende].focus();
  } else if (!e.shiftKey && volgende >= cellen.length) {
    onLaatste();
  }
}

// ─── SpreadsheetRegelRij ─────────────────────────────────────────────────────

function SpreadsheetRegelRij({
  rij,
  weergave,
  onSave,
  onDelete,
  onDuplicate,
  onEnterNaRegel,
  bezig,
  toonOnderaanneming,
  tarieven,
  ouderOpties = [],
  kanOmhoog = false,
  kanOmlaag = false,
  onHerschik,
}: {
  rij: RegelRow;
  weergave: Weergave;
  onSave: (id: number, payload: ReturnType<typeof draftToPayload>) => void;
  onDelete: (id: number) => void;
  onDuplicate: (rij: RegelRow) => void;
  onEnterNaRegel: (hoofdstuk: string, isStaart: boolean, isBouwplaats: boolean) => void;
  bezig: boolean;
  toonOnderaanneming: boolean;
  tarieven: Array<{ id: number; naam: string; tarief: number; categorie: string }>;
  ouderOpties?: Array<{ id: number; omschrijving: string }>;
  kanOmhoog?: boolean;
  kanOmlaag?: boolean;
  onHerschik?: (richting: "omhoog" | "omlaag") => void;
}) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LocalDraft>(() => regelToDraft(rij));
  const [toepassingSuggestie, setToepassingSuggestie] = useState<typeof TOEPASSING_HINTS[0] | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(regelToDraft(rij));
  }, [rij, editing]);

  const upd = useCallback((updates: Partial<LocalDraft>) => {
    setDraft((d) => {
      const next = { ...d, ...updates };
      if ("omschrijving" in updates) {
        const wp = detecteerWandPlafond(next.omschrijving);
        if (wp && !next.wand_plafond) next.wand_plafond = wp;
        setToepassingSuggestie(toepassingHintVoorOmschrijving(next.omschrijving));
      }
      return next;
    });
  }, []);

  const doSave = useCallback(() => {
    if (savingRef.current) return;
    savingRef.current = true;
    setEditing(false);
    setToepassingSuggestie(null);
    const payload = draftToPayload(draft);
    if (payload.omschrijving.trim()) onSave(rij.id, payload);
    else setDraft(regelToDraft(rij));
    setTimeout(() => { savingRef.current = false; }, 500);
  }, [draft, rij, onSave]);

  const handleRowBlur = useCallback(() => {
    setTimeout(() => {
      if (!rowRef.current) return;
      if (rowRef.current.contains(document.activeElement)) return;
      if (editing) doSave();
    }, 0);
  }, [editing, doSave]);

  const hv = parseFloat(draft.hoeveelheid) || 0;
  const t  = parseFloat(draft.tarief) || 0;
  const mu = parseFloat(draft.mu_per_eenheid) || 0;
  const at = parseFloat(draft.arbeids_tarief) || 0;
  const ob = parseFloat(draft.onderaanneming_bedrag) || 0;
  const liveArb = rnd(hv * mu * at);
  const liveMat = rnd(hv * t);
  const liveTot = rnd(liveArb + liveMat + ob);
  const arbDisplay = editing ? liveArb : rij.arbeidsloon;
  const matDisplay = editing ? liveMat : rij.materiaal_totaal;
  const totDisplay = editing ? liveTot : rij.totaal;

  const arbTariefOpties = tarieven.filter((t) => t.categorie === "arbeid" || t.categorie === "materieel");

  const mkKD = (ci: number) => (e: React.KeyboardEvent) => {
    handleTabNavigatieInRij(e, ci, rowRef, () => { doSave(); onEnterNaRegel(draft.hoofdstuk, draft.is_staartkosten, draft.is_bouwplaatskosten); });
    if (e.key === "Enter") { e.preventDefault(); doSave(); onEnterNaRegel(draft.hoofdstuk, draft.is_staartkosten, draft.is_bouwplaatskosten); }
    if (e.key === "Escape") { setEditing(false); setDraft(regelToDraft(rij)); }
  };

  const invK = "w-full px-2 py-1.5 border-0 border-b border-primary/40 bg-transparent focus:border-primary focus:outline-none text-sm tabular-nums";

  return (
    <tr
      ref={rowRef}
      onFocus={() => setEditing(true)}
      onBlur={handleRowBlur}
      className={cn(
        "border-b border-border/40 group transition-colors",
        editing ? "bg-amber-50/20 outline outline-1 outline-primary/30" : "bg-muted/25 hover:bg-muted/40",
        bezig ? "opacity-50 pointer-events-none" : ""
      )}
    >
      {/* # */}
      <td className="px-2 py-1.5 text-xs text-muted-foreground/50 text-right w-8 cursor-pointer select-none shrink-0" onClick={() => setEditing(true)}>
        {rij.regelnummer || rij.volgorde}
      </td>

      {/* Omschrijving + categorie inline */}
      <td className="px-1 py-1 min-w-[220px]">
        {editing ? (
          <div className="flex flex-col gap-1 px-0.5">
            <div className="flex items-center gap-1.5">
              {/* ADVIES_01 §3: soort-keuze */}
              <select
                value={draft.soort}
                onChange={(e) => {
                  const s = e.target.value;
                  // tekst/kop hebben geen bedragvelden — leegmaken.
                  if (s === "tekst" || s === "kop") upd({ soort: s, hoeveelheid: "0", tarief: "0", mu_per_eenheid: "0", arbeids_tarief: "0", onderaanneming_bedrag: "0" });
                  else upd({ soort: s });
                }}
                className="text-[10px] h-[26px] border border-border/70 rounded px-1 focus:outline-none cursor-pointer shrink-0 font-medium bg-muted"
                style={{ maxWidth: 90 }}
                title="Regelsoort"
              >
                {SOORT_OPTIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {(draft.soort === "regel" || draft.soort === "materiaal") && (
                <select
                  value={draft.categorie}
                  onChange={(e) => {
                    const cat = e.target.value;
                    const btw = cat === "onderaanneming" ? "verlegd" : draft.btw_tarief === "verlegd" ? "21" : draft.btw_tarief;
                    upd({ categorie: cat, btw_tarief: btw });
                  }}
                  className={cn(
                    "text-[10px] h-[26px] border border-border/70 rounded px-1 focus:outline-none cursor-pointer shrink-0 font-medium",
                    CATEGORIE_KLEUR[draft.categorie] ?? "bg-muted text-muted-foreground"
                  )}
                  style={{ maxWidth: 78 }}
                >
                  {KOSTENSOORT_OPTIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
              <input
                type="text"
                data-celindex={1}
                value={draft.omschrijving}
                onChange={(e) => upd({ omschrijving: e.target.value })}
                onKeyDown={mkKD(1)}
                className="flex-1 min-w-0 px-1.5 py-1 border-0 border-b border-primary/40 bg-transparent focus:border-primary focus:outline-none text-sm font-medium"
                placeholder="Omschrijving werkzaamheid..."
                autoFocus
              />
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground pl-0.5">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={draft.optioneel} onChange={(e) => upd({ optioneel: e.target.checked })} />
                optioneel
              </label>
              {draft.soort === "materiaal" && ouderOpties.length > 0 && (
                <label className="flex items-center gap-1">
                  onder:
                  <select
                    value={draft.ouder_regel_id ?? ""}
                    onChange={(e) => upd({ ouder_regel_id: e.target.value ? Number(e.target.value) : null })}
                    className="border border-border/70 rounded px-1 py-0.5 max-w-[160px]"
                  >
                    <option value="">— geen ouder —</option>
                    {ouderOpties.map((o) => <option key={o.id} value={o.id}>{o.omschrijving.slice(0, 40)}</option>)}
                  </select>
                </label>
              )}
              {draft.soort === "stelpost" && <span className="text-amber-700">stelpost — telt niet mee</span>}
            </div>
          </div>
        ) : (
          <div onClick={() => setEditing(true)} className={cn("px-1.5 py-1.5 cursor-pointer flex items-center gap-2 min-w-0", rij.soort === "materiaal" && "pl-6")}>
            {rij.soort === "regel" && rij.categorie !== "arbeid" && (
              <span className={cn("text-[10px] px-1.5 py-px rounded-sm shrink-0 whitespace-nowrap font-medium", CATEGORIE_KLEUR[rij.categorie] ?? "bg-muted/50 text-muted-foreground")}>
                {CATEGORIE_LABEL[rij.categorie] ?? rij.categorie}
              </span>
            )}
            {rij.soort === "stelpost" && (
              <span className="text-[10px] px-1.5 py-px rounded-sm shrink-0 whitespace-nowrap font-medium bg-amber-100 text-amber-800">stelpost — telt niet mee</span>
            )}
            {rij.soort === "materiaal" && (
              <span className="text-[10px] px-1.5 py-px rounded-sm shrink-0 whitespace-nowrap font-medium bg-green-50 text-green-700">materiaal</span>
            )}
            {rij.optioneel && (
              <span className="text-[10px] px-1.5 py-px rounded-sm shrink-0 whitespace-nowrap font-medium bg-blue-50 text-blue-700">optioneel</span>
            )}
            <span className={cn(
              "text-sm truncate",
              rij.soort === "kop" ? "font-bold uppercase tracking-wide" : rij.soort === "tekst" ? "italic font-normal text-muted-foreground" : "font-medium",
            )}>
              {rij.omschrijving || <span className="text-muted-foreground/40 italic font-normal">klik om te bewerken</span>}
            </span>
          </div>
        )}
      </td>

      {/* Wand / Plafond */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-1 py-0 w-[68px] text-center">
          {editing ? (
            <div className="flex gap-0.5 justify-center py-[4px]">
              {(["wand", "plafond", ""] as const).map((v) => (
                <button
                  key={v || "geen"}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); upd({ wand_plafond: v }); }}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded border transition-colors leading-tight",
                    draft.wand_plafond === v
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/60"
                  )}
                >
                  {v === "wand" ? "W" : v === "plafond" ? "P" : "—"}
                </button>
              ))}
            </div>
          ) : (
            <div onClick={() => setEditing(true)} className="py-1.5 cursor-pointer text-center">
              {rij.wand_plafond === "wand" ? (
                <span className="text-xs px-1.5 py-px rounded bg-blue-50 text-blue-700 font-semibold">W</span>
              ) : rij.wand_plafond === "plafond" ? (
                <span className="text-xs px-1.5 py-px rounded bg-violet-50 text-violet-700 font-semibold">P</span>
              ) : (
                <span className="text-muted-foreground/30 text-xs">—</span>
              )}
            </div>
          )}
        </td>
      )}

      {/* Toepassing + AI suggestie */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-1 py-0 w-[148px] relative">
          {editing ? (
            <div className="relative">
              <input
                type="text"
                data-celindex={2}
                value={draft.toepassing_tekst}
                onChange={(e) => upd({ toepassing_tekst: e.target.value })}
                onKeyDown={mkKD(2)}
                className="w-full px-2 py-1.5 border-0 border-b border-primary/40 bg-transparent focus:border-primary focus:outline-none text-xs"
                placeholder="Toepassing..."
              />
              {toepassingSuggestie && !draft.toepassing_tekst && draft.omschrijving.length > 2 && (
                <div className="absolute top-full left-0 z-30 mt-0.5 flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] shadow-lg whitespace-nowrap">
                  <Sparkles className="h-2.5 w-2.5 text-amber-500 shrink-0" />
                  <span className="text-amber-800 max-w-[100px] truncate">{toepassingSuggestie.toepassing}</span>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      upd({
                        toepassing_tekst: toepassingSuggestie.toepassing,
                        mu_per_eenheid: toepassingSuggestie.mu,
                        categorie: toepassingSuggestie.categorie,
                        eenheid: toepassingSuggestie.eenheid,
                      });
                      setToepassingSuggestie(null);
                    }}
                    className="font-semibold text-amber-700 hover:text-amber-900 underline"
                  >
                    Ok
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); setToepassingSuggestie(null); }}
                    className="text-amber-400 hover:text-amber-600"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div onClick={() => setEditing(true)} className="px-2 py-1.5 text-xs text-muted-foreground cursor-pointer truncate">
              {rij.toepassing_tekst || rij.normtijd_code || <span className="text-muted-foreground/30">—</span>}
            </div>
          )}
        </td>
      )}

      {/* Aantal */}
      <td className="px-1 py-0 w-[72px]">
        {editing ? (
          <input type="number" step="0.01" min="0" data-celindex={3}
            value={draft.hoeveelheid}
            onChange={(e) => upd({ hoeveelheid: e.target.value })}
            onKeyDown={mkKD(3)}
            className={cn(invK, "text-right")} placeholder="1" />
        ) : (
          <div onClick={() => setEditing(true)} className="px-2 py-1.5 text-sm text-right tabular-nums cursor-pointer">
            {fmt2(rij.hoeveelheid)}
          </div>
        )}
      </td>

      {/* Eenheid */}
      <td className="px-1 py-0 w-[58px]">
        {editing ? (
          <select data-celindex={4} value={draft.eenheid} onChange={(e) => upd({ eenheid: e.target.value })} onKeyDown={mkKD(4)}
            className="w-full px-1 py-1.5 text-xs border-0 border-b border-primary/40 bg-transparent focus:border-primary focus:outline-none text-center">
            {EENHEDEN.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        ) : (
          <div onClick={() => setEditing(true)} className="px-1 py-1.5 text-xs text-muted-foreground text-center cursor-pointer">
            {rij.eenheid}
          </div>
        )}
      </td>

      {/* Materiaal inkoop/stk */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-1 py-0 w-[96px]">
          {editing ? (
            <input type="number" step="0.01" min="0" data-celindex={5}
              value={draft.tarief} onChange={(e) => upd({ tarief: e.target.value })} onKeyDown={mkKD(5)}
              className={cn(invK, "text-right")} placeholder="0,00" />
          ) : (
            <div onClick={() => setEditing(true)} className="px-2 py-1.5 text-sm text-right tabular-nums text-muted-foreground cursor-pointer">
              {rij.tarief > 0 ? formatBedrag(rij.tarief) : <span className="text-muted-foreground/30">—</span>}
            </div>
          )}
        </td>
      )}

      {/* Materiaal totaal (berekend) */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-2 py-1.5 w-[96px] text-right text-sm tabular-nums cursor-pointer" onClick={() => setEditing(true)}>
          {matDisplay > 0
            ? <span className="text-muted-foreground">{formatBedrag(matDisplay)}</span>
            : <span className="text-muted-foreground/30">—</span>}
        </td>
      )}

      {/* Normtijd u/stk */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-1 py-0 w-[80px]">
          {editing ? (
            <input type="number" step="0.01" min="0" data-celindex={6}
              value={draft.mu_per_eenheid} onChange={(e) => upd({ mu_per_eenheid: e.target.value })} onKeyDown={mkKD(6)}
              className={cn(invK, "text-right")} placeholder="0,00" />
          ) : (
            <div onClick={() => setEditing(true)} className="px-2 py-1.5 text-sm text-right tabular-nums text-muted-foreground cursor-pointer">
              {rij.mu_per_eenheid > 0 ? <span>{fmt2(rij.mu_per_eenheid)} <span className="text-[10px]">u</span></span> : <span className="text-muted-foreground/30">—</span>}
            </div>
          )}
        </td>
      )}

      {/* Arbeidstarief €/u */}
      {weergave === "intern" && (
        <td className="px-1 py-0 w-[92px]">
          {editing ? (
            arbTariefOpties.length > 0 ? (
              <select data-celindex={7}
                value={draft.arbeids_tarief}
                onChange={(e) => upd({ arbeids_tarief: e.target.value })}
                onKeyDown={mkKD(7)}
                className="w-full px-1 py-1.5 text-xs border-0 border-b border-primary/40 bg-transparent focus:border-primary focus:outline-none">
                <option value="0">— geen —</option>
                {arbTariefOpties.map((tr) => (
                  <option key={tr.id} value={String(tr.tarief)}>{tr.naam} — €{tr.tarief}</option>
                ))}
              </select>
            ) : (
              <input type="number" step="0.01" min="0" data-celindex={7}
                value={draft.arbeids_tarief} onChange={(e) => upd({ arbeids_tarief: e.target.value })} onKeyDown={mkKD(7)}
                className={cn(invK, "text-right")} placeholder="0,00" />
            )
          ) : (
            <div onClick={() => setEditing(true)} className="px-2 py-1.5 text-xs text-right tabular-nums text-muted-foreground cursor-pointer">
              {rij.arbeids_tarief > 0 ? `€\u00a0${rij.arbeids_tarief}` : <span className="text-muted-foreground/30">—</span>}
            </div>
          )}
        </td>
      )}

      {/* Arbeid totaal (berekend) */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-2 py-1.5 w-[96px] text-right text-sm tabular-nums cursor-pointer" onClick={() => setEditing(true)}>
          {arbDisplay > 0
            ? <span className="text-muted-foreground">{formatBedrag(arbDisplay)}</span>
            : <span className="text-muted-foreground/30">—</span>}
        </td>
      )}

      {/* Onderaanneming (conditioneel) */}
      {toonOnderaanneming && (weergave === "intern" || weergave === "directie") && (
        <td className="px-1 py-0 w-[96px]">
          {editing ? (
            <input type="number" step="0.01" min="0" data-celindex={8}
              value={draft.onderaanneming_bedrag} onChange={(e) => upd({ onderaanneming_bedrag: e.target.value })} onKeyDown={mkKD(8)}
              className={cn(invK, "text-right")} placeholder="0,00" />
          ) : (
            <div onClick={() => setEditing(true)} className="px-2 py-1.5 text-sm text-right tabular-nums text-muted-foreground cursor-pointer">
              {rij.onderaanneming_bedrag > 0 ? formatBedrag(rij.onderaanneming_bedrag) : <span className="text-muted-foreground/30">—</span>}
            </div>
          )}
        </td>
      )}

      {/* Totaal */}
      <td className="px-2 py-1.5 w-[104px] text-right text-sm tabular-nums font-semibold cursor-pointer" onClick={() => setEditing(true)}>
        {totDisplay !== 0 ? formatBedrag(totDisplay) : <span className="text-muted-foreground/30">—</span>}
      </td>

      {/* Acties */}
      {weergave === "intern" && (
        <td className="px-1 py-0 w-12 text-center">
          <div className="flex items-center gap-0 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {onHerschik && (
              <>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-20"
                  title="Omhoog verplaatsen" tabIndex={-1} disabled={!kanOmhoog || bezig}
                  data-testid={`knop-regel-omhoog-${rij.id}`}
                  onClick={(e) => { e.stopPropagation(); onHerschik("omhoog"); }}>
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-20"
                  title="Omlaag verplaatsen" tabIndex={-1} disabled={!kanOmlaag || bezig}
                  data-testid={`knop-regel-omlaag-${rij.id}`}
                  onClick={(e) => { e.stopPropagation(); onHerschik("omlaag"); }}>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
              title="Dupliceren" tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onDuplicate(rij); }}>
              <Copy className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
              title="Verwijderen" tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onDelete(rij.id); }}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </td>
      )}
    </tr>
  );
}

// ─── NieuweRegelRij ──────────────────────────────────────────────────────────

function NieuweRegelRij({
  initialDraft,
  weergave,
  onSave,
  onCancel,
  bezig,
  toonOnderaanneming,
  tarieven,
  ouderOpties = [],
}: {
  initialDraft: LocalDraft;
  weergave: Weergave;
  onSave: (payload: ReturnType<typeof draftToPayload>) => void;
  onCancel: () => void;
  bezig: boolean;
  toonOnderaanneming: boolean;
  tarieven: Array<{ id: number; naam: string; tarief: number; categorie: string }>;
  ouderOpties?: Array<{ id: number; omschrijving: string }>;
}) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [draft, setDraft] = useState<LocalDraft>(initialDraft);
  const [toepassingSuggestie, setToepassingSuggestie] = useState<typeof TOEPASSING_HINTS[0] | null>(null);

  const upd = (updates: Partial<LocalDraft>) => {
    setDraft((d) => {
      const next = { ...d, ...updates };
      if ("omschrijving" in updates) {
        const wp = detecteerWandPlafond(next.omschrijving);
        if (wp && !next.wand_plafond) next.wand_plafond = wp;
        setToepassingSuggestie(toepassingHintVoorOmschrijving(next.omschrijving));
      }
      return next;
    });
  };

  const doSave = useCallback(() => {
    const p = draftToPayload(draft);
    if (p.omschrijving.trim()) onSave(p);
    else onCancel();
  }, [draft, onSave, onCancel]);

  const handleRowBlur = useCallback(() => {
    setTimeout(() => {
      if (!rowRef.current) return;
      if (rowRef.current.contains(document.activeElement)) return;
      doSave();
    }, 0);
  }, [doSave]);

  const hv = parseFloat(draft.hoeveelheid) || 0;
  const t  = parseFloat(draft.tarief) || 0;
  const mu = parseFloat(draft.mu_per_eenheid) || 0;
  const at = parseFloat(draft.arbeids_tarief) || 0;
  const ob = parseFloat(draft.onderaanneming_bedrag) || 0;
  const liveArb = rnd(hv * mu * at);
  const liveMat = rnd(hv * t);
  const liveTot = rnd(liveArb + liveMat + ob);

  const arbTariefOpties = tarieven.filter((tr) => tr.categorie === "arbeid" || tr.categorie === "materieel");

  const invK = "w-full px-2 py-1.5 border-0 border-b border-primary/60 bg-transparent focus:border-primary focus:outline-none text-sm tabular-nums";

  const mkKD = (ci: number) => (e: React.KeyboardEvent) => {
    handleTabNavigatieInRij(e, ci, rowRef, doSave);
    if (e.key === "Enter") { e.preventDefault(); doSave(); }
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  };

  return (
    <tr
      ref={rowRef}
      onBlur={handleRowBlur}
      className={cn(
        "border-b border-primary/30 bg-primary/5 outline outline-1 outline-primary/30",
        bezig ? "opacity-60" : ""
      )}
    >
      {/* # */}
      <td className="px-2 py-1.5 text-xs text-muted-foreground/40 text-right w-8 shrink-0">+</td>

      {/* Omschrijving + categorie inline */}
      <td className="px-1 py-1 min-w-[220px]">
        <div className="flex flex-col gap-1 px-0.5">
          <div className="flex items-center gap-1.5">
            <select
              value={draft.soort}
              onChange={(e) => {
                const s = e.target.value;
                if (s === "tekst" || s === "kop") upd({ soort: s, hoeveelheid: "0", tarief: "0", mu_per_eenheid: "0", arbeids_tarief: "0", onderaanneming_bedrag: "0" });
                else upd({ soort: s });
              }}
              className="text-[10px] h-[26px] border border-border/70 rounded px-1 focus:outline-none cursor-pointer shrink-0 font-medium bg-muted"
              style={{ maxWidth: 90 }}
              title="Regelsoort"
            >
              {SOORT_OPTIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {(draft.soort === "regel" || draft.soort === "materiaal") && (
              <select
                value={draft.categorie}
                onChange={(e) => {
                  const cat = e.target.value;
                  const btw = cat === "onderaanneming" ? "verlegd" : draft.btw_tarief === "verlegd" ? "21" : draft.btw_tarief;
                  upd({ categorie: cat, btw_tarief: btw });
                }}
                className={cn(
                  "text-[10px] h-[26px] border border-border/70 rounded px-1 focus:outline-none cursor-pointer shrink-0 font-medium",
                  CATEGORIE_KLEUR[draft.categorie] ?? "bg-muted text-muted-foreground"
                )}
                style={{ maxWidth: 78 }}
              >
                {KOSTENSOORT_OPTIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            <input
              type="text"
              value={draft.omschrijving}
              data-celindex={1}
              onChange={(e) => upd({ omschrijving: e.target.value })}
              onKeyDown={mkKD(1)}
              className="flex-1 min-w-0 px-1.5 py-1 border-0 border-b border-primary bg-transparent focus:outline-none text-sm font-medium"
              placeholder="Omschrijving werkzaamheid..."
              autoFocus
            />
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground pl-0.5">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={draft.optioneel} onChange={(e) => upd({ optioneel: e.target.checked })} />
              optioneel
            </label>
            {draft.soort === "materiaal" && ouderOpties.length > 0 && (
              <label className="flex items-center gap-1">
                onder:
                <select
                  value={draft.ouder_regel_id ?? ""}
                  onChange={(e) => upd({ ouder_regel_id: e.target.value ? Number(e.target.value) : null })}
                  className="border border-border/70 rounded px-1 py-0.5 max-w-[160px]"
                >
                  <option value="">— geen ouder —</option>
                  {ouderOpties.map((o) => <option key={o.id} value={o.id}>{o.omschrijving.slice(0, 40)}</option>)}
                </select>
              </label>
            )}
            {draft.soort === "stelpost" && <span className="text-amber-700">stelpost — telt niet mee</span>}
          </div>
        </div>
      </td>

      {/* Wand / Plafond */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-1 py-0 w-[68px] text-center">
          <div className="flex gap-0.5 justify-center py-[4px]">
            {(["wand", "plafond", ""] as const).map((v) => (
              <button
                key={v || "geen"}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); upd({ wand_plafond: v }); }}
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded border transition-colors leading-tight",
                  draft.wand_plafond === v
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/60"
                )}
              >
                {v === "wand" ? "W" : v === "plafond" ? "P" : "—"}
              </button>
            ))}
          </div>
        </td>
      )}

      {/* Toepassing + AI */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-1 py-0 w-[148px] relative">
          <input
            type="text"
            data-celindex={2}
            value={draft.toepassing_tekst}
            onChange={(e) => upd({ toepassing_tekst: e.target.value })}
            onKeyDown={mkKD(2)}
            className="w-full px-2 py-1.5 border-0 border-b border-primary/60 bg-transparent focus:border-primary focus:outline-none text-xs"
            placeholder="Toepassing..."
          />
          {toepassingSuggestie && !draft.toepassing_tekst && draft.omschrijving.length > 2 && (
            <div className="absolute top-full left-0 z-30 mt-0.5 flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] shadow-lg whitespace-nowrap">
              <Sparkles className="h-2.5 w-2.5 text-amber-500 shrink-0" />
              <span className="text-amber-800 max-w-[100px] truncate">{toepassingSuggestie.toepassing}</span>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  upd({
                    toepassing_tekst: toepassingSuggestie.toepassing,
                    mu_per_eenheid: toepassingSuggestie.mu,
                    categorie: toepassingSuggestie.categorie,
                    eenheid: toepassingSuggestie.eenheid,
                  });
                  setToepassingSuggestie(null);
                }}
                className="font-semibold text-amber-700 hover:text-amber-900 underline"
              >
                Ok
              </button>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setToepassingSuggestie(null); }}
                className="text-amber-400 hover:text-amber-600"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
        </td>
      )}

      {/* Aantal */}
      <td className="px-1 py-0 w-[72px]">
        <input type="number" step="0.01" min="0" data-celindex={3}
          value={draft.hoeveelheid} onChange={(e) => upd({ hoeveelheid: e.target.value })} onKeyDown={mkKD(3)}
          className={cn(invK, "text-right")} placeholder="1" />
      </td>

      {/* Eenheid */}
      <td className="px-1 py-0 w-[58px]">
        <select data-celindex={4} value={draft.eenheid} onChange={(e) => upd({ eenheid: e.target.value })} onKeyDown={mkKD(4)}
          className="w-full px-1 py-1.5 text-xs border-0 border-b border-primary/60 bg-transparent focus:border-primary focus:outline-none text-center">
          {EENHEDEN.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </td>

      {/* Mat. inkoop/stk */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-1 py-0 w-[96px]">
          <input type="number" step="0.01" min="0" data-celindex={5}
            value={draft.tarief} onChange={(e) => upd({ tarief: e.target.value })} onKeyDown={mkKD(5)}
            className={cn(invK, "text-right")} placeholder="0,00" />
        </td>
      )}

      {/* Mat. totaal */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-2 py-1.5 w-[96px] text-right text-sm tabular-nums text-muted-foreground/60">
          {liveMat > 0 ? formatBedrag(liveMat) : "—"}
        </td>
      )}

      {/* Norm u/stk */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-1 py-0 w-[80px]">
          <input type="number" step="0.01" min="0" data-celindex={6}
            value={draft.mu_per_eenheid} onChange={(e) => upd({ mu_per_eenheid: e.target.value })} onKeyDown={mkKD(6)}
            className={cn(invK, "text-right")} placeholder="0,00" />
        </td>
      )}

      {/* Arbeidstarief */}
      {weergave === "intern" && (
        <td className="px-1 py-0 w-[92px]">
          {arbTariefOpties.length > 0 ? (
            <select data-celindex={7}
              value={draft.arbeids_tarief} onChange={(e) => upd({ arbeids_tarief: e.target.value })} onKeyDown={mkKD(7)}
              className="w-full px-1 py-1.5 text-xs border-0 border-b border-primary/60 bg-transparent focus:border-primary focus:outline-none">
              <option value="0">— geen —</option>
              {arbTariefOpties.map((tr) => (
                <option key={tr.id} value={String(tr.tarief)}>{tr.naam} — €{tr.tarief}</option>
              ))}
            </select>
          ) : (
            <input type="number" step="0.01" min="0" data-celindex={7}
              value={draft.arbeids_tarief} onChange={(e) => upd({ arbeids_tarief: e.target.value })} onKeyDown={mkKD(7)}
              className={cn(invK, "text-right")} placeholder="0,00" />
          )}
        </td>
      )}

      {/* Arbeid totaal */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-2 py-1.5 w-[96px] text-right text-sm tabular-nums text-muted-foreground/60">
          {liveArb > 0 ? formatBedrag(liveArb) : "—"}
        </td>
      )}

      {/* Onderaanneming (conditioneel) */}
      {toonOnderaanneming && (weergave === "intern" || weergave === "directie") && (
        <td className="px-1 py-0 w-[96px]">
          <input type="number" step="0.01" min="0" data-celindex={8}
            value={draft.onderaanneming_bedrag} onChange={(e) => upd({ onderaanneming_bedrag: e.target.value })} onKeyDown={mkKD(8)}
            className={cn(invK, "text-right")} placeholder="0,00" />
        </td>
      )}

      {/* Totaal */}
      <td className="px-2 py-1.5 w-[104px] text-right text-sm tabular-nums font-semibold">
        {liveTot > 0 ? formatBedrag(liveTot) : "—"}
      </td>

      {/* Acties */}
      {weergave === "intern" && (
        <td className="px-1 py-0 w-12 text-center">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" tabIndex={-1} onClick={onCancel}>
            <X className="h-3 w-3" />
          </Button>
        </td>
      )}
    </tr>
  );
}

// ─── HoofdstukBalk ───────────────────────────────────────────────────────────

function HoofdstukBalk({
  naam,
  aantalKolommen,
  onToevoegen,
  weergave,
}: {
  naam: string;
  aantalKolommen: number;
  onToevoegen: () => void;
  weergave: Weergave;
}) {
  return (
    <tr className="border-b border-border bg-muted/50 group/hs">
      <td
        colSpan={aantalKolommen}
        className="px-3 py-1.5"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{naam}</span>
          {weergave === "intern" && (
            <Button
              variant="ghost" size="sm"
              className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover/hs:opacity-100 transition-opacity"
              onClick={onToevoegen}
            >
              <Plus className="h-3 w-3 mr-0.5" />
              Regel
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── EenheidBalk ─────────────────────────────────────────────────────────────

const EENHEID_TYPE_LABEL: Record<string, string> = {
  woning: "Woning",
  appartement: "Appartement",
  kamer: "Kamer",
  ruimte: "Ruimte",
  verdieping: "Verdieping",
  compartiment: "Compartiment",
  schacht: "Schacht",
  bouwdeel: "Bouwdeel",
  gevel: "Gevel",
  installatiezone: "Installatiezone",
  vrije_projecteenheid: "Vrije eenheid",
};

function EenheidBalk({
  eenheid,
  aantalKolommen,
  weergave,
  ingeklapt,
  totaalMat,
  totaalArb,
  totaalOa,
  totaalKosten,
  onToggle,
  onBewerken,
  onVerwijderen,
  onRegelToevoegen,
}: {
  eenheid: CalcEenheid;
  aantalKolommen: number;
  weergave: Weergave;
  ingeklapt: boolean;
  totaalMat: number;
  totaalArb: number;
  totaalOa: number;
  totaalKosten: number;
  onToggle: () => void;
  onBewerken: () => void;
  onVerwijderen: () => void;
  onRegelToevoegen: () => void;
}) {
  const typeLabel = EENHEID_TYPE_LABEL[eenheid.type] ?? eenheid.type;
  return (
    <tr className="border-b border-primary/20 bg-primary/5 group/eb">
      <td colSpan={aantalKolommen} className="px-3 py-2">
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onToggle}
              className="flex items-center gap-1.5 hover:text-foreground text-foreground/80 transition-colors shrink-0"
            >
              {ingeklapt
                ? <ChevronDown className="h-4 w-4 text-primary" />
                : <ChevronUp className="h-4 w-4 text-primary" />}
            </button>
            <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-sm font-semibold text-foreground truncate">{eenheid.naam}</span>
            <span className="text-xs text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5 shrink-0">{typeLabel}</span>
          </div>
          <div className="flex items-center gap-4">
            {weergave === "intern" && totaalKosten > 0 && (
              <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
                {totaalMat > 0 && <span>Mat: <span className="font-medium text-foreground tabular-nums">{formatBedragKort(totaalMat)}</span></span>}
                {totaalArb > 0 && <span>Arb: <span className="font-medium text-foreground tabular-nums">{formatBedragKort(totaalArb)}</span></span>}
                {totaalOa > 0 && <span>OA: <span className="font-medium text-foreground tabular-nums">{formatBedragKort(totaalOa)}</span></span>}
                <span className="font-semibold text-foreground tabular-nums border-l border-border pl-3">{formatBedragKort(totaalKosten)}</span>
              </div>
            )}
            {weergave === "intern" && (
              <div className="flex items-center gap-1 opacity-0 group-hover/eb:opacity-100 transition-opacity">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-primary/70 hover:text-primary" onClick={onRegelToevoegen}>
                  <Plus className="h-3 w-3" />
                  Regel
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" onClick={onBewerken}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={onVerwijderen}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Tabelkop helper ─────────────────────────────────────────────────────────

function Th({ children, align = "left", className }: { children?: React.ReactNode; align?: "left" | "right" | "center"; className?: string }) {
  return (
    <th className={cn(
      "px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 whitespace-nowrap border-b border-border bg-muted/40",
      align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
      className
    )}>
      {children}
    </th>
  );
}

// ─── Directie overzicht (read-only) ─────────────────────────────────────────

function DirectieView({
  directeRegels, bouwplaatsRegels, staartRegels,
  matSubtotaal, matOpslagBedrag, opslagMateriaal,
  arbSubtotaal, arbOpslagBedrag, opslagArbeid,
  oaSubtotaal, bouwplaatsSubtotaal, staartSubtotaal,
  subtotaal, akBedrag, abkBedrag, risicoBedrag, basisWinst, winstBedrag,
  kortingBedrag, totaal, marge, optioneelSubtotaal = 0,
  opslagAk, opslagAbk, opslagRisico, opslagWinst, korting,
  akIsVast, abkIsVast, risicoIsVast, winstIsVast,
}: {
  directeRegels: RegelRow[]; bouwplaatsRegels: RegelRow[]; staartRegels: RegelRow[];
  matSubtotaal: number; matOpslagBedrag: number; opslagMateriaal: number;
  arbSubtotaal: number; arbOpslagBedrag: number; opslagArbeid: number;
  oaSubtotaal: number; bouwplaatsSubtotaal: number; staartSubtotaal: number;
  subtotaal: number; akBedrag: number; abkBedrag: number; risicoBedrag: number;
  basisWinst: number; winstBedrag: number; kortingBedrag: number; totaal: number; marge: number;
  optioneelSubtotaal?: number;
  opslagAk: number; opslagAbk: number; opslagRisico: number; opslagWinst: number; korting: number;
  akIsVast: boolean; abkIsVast: boolean; risicoIsVast: boolean; winstIsVast: boolean;
}) {
  // ADVIES_01 §6: alleen meetellende, niet-optionele regels in de kostprijssom.
  const groepenPerCat = Object.entries(CATEGORIE_LABEL)
    .map(([cat, label]) => ({ cat, label, regels: directeRegels.filter((r) => r.categorie === cat && teltMeeRegel(r) && !r.optioneel) }))
    .filter((g) => g.regels.length > 0);

  return (
    <div className="p-5 space-y-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Kostprijsoverzicht — vertrouwelijk
      </p>
      <table className="w-full text-sm">
        <tbody className="divide-y">
          {groepenPerCat.map(({ cat, label, regels }) => {
            const mu  = regels.reduce((s, r) => s + (r.mu_totaal ?? 0), 0);
            const mat = regels.reduce((s, r) => s + (r.materiaal_totaal ?? 0), 0);
            const arb = regels.reduce((s, r) => s + (r.arbeidsloon ?? 0), 0);
            const ond = regels.reduce((s, r) => s + (r.onderaanneming_bedrag ?? 0), 0);
            const tot = regels.reduce((s, r) => s + r.totaal, 0);
            return (
              <tr key={cat} className="hover:bg-muted/40">
                <td className="py-2 font-medium text-foreground w-1/3">{label}</td>
                <td className="py-2 text-right text-xs text-muted-foreground tabular-nums">
                  {mu > 0 ? `${fmt2(mu)} MU` : ""}
                </td>
                <td className="py-2 text-right text-xs text-muted-foreground tabular-nums">
                  {mat > 0 ? `mat ${formatBedrag(mat)}` : ""}
                </td>
                <td className="py-2 text-right text-xs text-muted-foreground tabular-nums">
                  {arb > 0 ? `arb ${formatBedrag(arb)}` : ""}
                </td>
                <td className="py-2 text-right text-xs text-muted-foreground tabular-nums">
                  {ond > 0 ? `ond ${formatBedrag(ond)}` : ""}
                </td>
                <td className="py-2 pl-4 text-right tabular-nums font-medium">{formatBedrag(tot)}</td>
              </tr>
            );
          })}
          {opslagMateriaal > 0 && matSubtotaal > 0 && (
            <tr className="text-muted-foreground bg-muted/30">
              <td className="py-1 pl-4 text-xs">+ Opslag materiaal ({opslagMateriaal}%)</td>
              <td colSpan={4} />
              <td className="py-1 pl-4 text-right text-xs tabular-nums">{formatBedrag(matOpslagBedrag)}</td>
            </tr>
          )}
          {opslagArbeid > 0 && arbSubtotaal > 0 && (
            <tr className="text-muted-foreground bg-muted/30">
              <td className="py-1 pl-4 text-xs">+ Opslag arbeid ({opslagArbeid}%)</td>
              <td colSpan={4} />
              <td className="py-1 pl-4 text-right text-xs tabular-nums">{formatBedrag(arbOpslagBedrag)}</td>
            </tr>
          )}
          {bouwplaatsSubtotaal > 0 && (
            <tr className="hover:bg-amber-50/50">
              <td className="py-2 font-medium text-foreground">Bouwplaatskosten</td>
              <td colSpan={4} className="py-2 text-right text-xs text-muted-foreground">{bouwplaatsRegels.length} post{bouwplaatsRegels.length !== 1 ? "en" : ""}</td>
              <td className="py-2 pl-4 text-right tabular-nums font-medium">{formatBedrag(bouwplaatsSubtotaal)}</td>
            </tr>
          )}
          {staartSubtotaal > 0 && (
            <tr className="hover:bg-muted/40">
              <td className="py-2 font-medium text-foreground">Staartkosten</td>
              <td colSpan={4} className="py-2 text-right text-xs text-muted-foreground">{staartRegels.length} post{staartRegels.length !== 1 ? "en" : ""}</td>
              <td className="py-2 pl-4 text-right tabular-nums font-medium">{formatBedrag(staartSubtotaal)}</td>
            </tr>
          )}
          <tr className="font-semibold border-t-2">
            <td className="py-2 text-foreground">Subtotaal</td>
            <td colSpan={4} />
            <td className="py-2 pl-4 text-right tabular-nums">{formatBedrag(subtotaal)}</td>
          </tr>
          <tr className="text-muted-foreground">
            <td className="py-1.5 pl-3">+ AK {akIsVast ? "(€ vast)" : `(${opslagAk}%)`}</td>
            <td colSpan={4} /><td className="py-1.5 pl-4 text-right tabular-nums">{formatBedrag(akBedrag)}</td>
          </tr>
          {(opslagAbk > 0 || abkIsVast) && (
            <tr className="text-muted-foreground">
              <td className="py-1.5 pl-3">+ ABK {abkIsVast ? "(€ vast)" : `(${opslagAbk}%)`}</td>
              <td colSpan={4} /><td className="py-1.5 pl-4 text-right tabular-nums">{formatBedrag(abkBedrag)}</td>
            </tr>
          )}
          {opslagRisico > 0 && (
            <tr className="text-muted-foreground">
              <td className="py-1.5 pl-3">+ Risico {risicoIsVast ? "(€ vast)" : `(${opslagRisico}%)`}</td>
              <td colSpan={4} /><td className="py-1.5 pl-4 text-right tabular-nums">{formatBedrag(risicoBedrag)}</td>
            </tr>
          )}
          <tr className="text-muted-foreground text-xs border-t">
            <td className="py-1.5 pl-3">Basis voor winst</td>
            <td colSpan={4} /><td className="py-1.5 pl-4 text-right tabular-nums">{formatBedrag(basisWinst)}</td>
          </tr>
          <tr className="text-muted-foreground">
            <td className="py-1.5 pl-3">+ Winst {winstIsVast ? "(€ vast)" : `(${opslagWinst}%)`}</td>
            <td colSpan={4} /><td className="py-1.5 pl-4 text-right tabular-nums">{formatBedrag(winstBedrag)}</td>
          </tr>
          {korting > 0 && (
            <tr className="text-green-700">
              <td className="py-1.5 pl-3">- Korting ({korting}%)</td>
              <td colSpan={4} /><td className="py-1.5 pl-4 text-right tabular-nums">- {formatBedrag(kortingBedrag)}</td>
            </tr>
          )}
          <tr className="font-bold text-base border-t-2">
            <td className="py-3">Verkoopprijs excl. BTW</td>
            <td colSpan={4} />
            <td className="py-3 pl-4 text-right tabular-nums text-primary">{formatBedrag(totaal)}</td>
          </tr>
          {optioneelSubtotaal > 0 && (
            <tr className="text-blue-700 border-t">
              <td className="py-2 pl-3">
                <span className="inline-flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[9px] border-blue-300 text-blue-700">optioneel</Badge>
                  Optioneel (niet in aanneemsom)
                </span>
              </td>
              <td colSpan={4} />
              <td className="py-2 pl-4 text-right tabular-nums font-medium">{formatBedrag(optioneelSubtotaal)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex justify-end">
        <div className="rounded-md bg-muted/40 border px-5 py-3 text-sm">
          <span className="text-muted-foreground">Marge: </span>
          <span className="font-semibold">{marge}%</span>
        </div>
      </div>
    </div>
  );
}

// ─── Klant view ──────────────────────────────────────────────────────────────

function KlantView({ regels, totaal, totaalBtw, optioneelTotaal = 0 }: { regels: RegelRow[]; totaal: number; totaalBtw: number; optioneelTotaal?: number }) {
  // ADVIES_01 §6: tekst/stelpost/kop tellen niet mee in het aangeboden bedrag;
  // optioneel telt niet mee maar wordt apart getoond.
  const zichtbaar = regels.filter((r) => !r.is_staartkosten && !r.is_bouwplaatskosten && !r.optioneel);
  const optioneleRegels = regels.filter((r) => !r.is_staartkosten && !r.is_bouwplaatskosten && r.optioneel);
  const aangeboden = zichtbaar.filter((r) => teltMeeRegel(r)).reduce((s, r) => s + r.totaal, 0);
  const bedragCel = (r: RegelRow) => {
    if (r.soort === "tekst" || r.soort === "kop") return <span className="text-muted-foreground/40">—</span>;
    if (r.soort === "stelpost") return <span className="tabular-nums">{formatBedrag(r.totaal)} <span className="text-[10px] text-amber-700">stelpost</span></span>;
    return <span className="tabular-nums font-medium">{formatBedrag(r.totaal)}</span>;
  };
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-6 py-2 text-left font-normal">Omschrijving</th>
            <th className="px-3 py-2 text-center font-normal">Eenheid</th>
            <th className="px-3 py-2 text-right font-normal">Aantal</th>
            <th className="px-3 py-2 text-right font-normal">Bedrag</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {zichtbaar.map((r) => {
            if (r.soort === "kop") {
              return (
                <tr key={r.id} className="bg-muted/30">
                  <td colSpan={4} className="px-6 py-2 font-bold uppercase tracking-wide text-xs text-foreground">{r.klanttekst || r.omschrijving}</td>
                </tr>
              );
            }
            const tekstRegel = r.soort === "tekst";
            return (
              <tr key={r.id} className="hover:bg-muted/40">
                <td className="px-6 py-2.5">
                  <p className={cn("font-medium text-foreground", tekstRegel && "italic font-normal text-muted-foreground")}>{r.klanttekst || r.omschrijving}</p>
                  {r.regelnummer && <p className="text-xs text-muted-foreground">{r.regelnummer}</p>}
                </td>
                <td className="px-3 py-2.5 text-center text-muted-foreground">{tekstRegel ? "" : r.eenheid}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{tekstRegel ? "" : r.hoeveelheid}</td>
                <td className="px-3 py-2.5 text-right">{bedragCel(r)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t px-6 py-4 space-y-1.5 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotaal werkzaamheden</span>
          <span className="tabular-nums">{formatBedrag(aangeboden)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Opslagen en beheerkosten</span>
          <span className="tabular-nums">{formatBedrag(totaal - aangeboden)}</span>
        </div>
        <Separator className="my-1" />
        <div className="flex justify-between font-semibold">
          <span>Totaal excl. BTW</span>
          <span className="tabular-nums">{formatBedrag(totaal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>BTW (21%)</span>
          <span className="tabular-nums">{formatBedrag(totaalBtw - totaal)}</span>
        </div>
        <div className="flex justify-between font-bold text-base">
          <span>Totaal incl. BTW</span>
          <span className="tabular-nums">{formatBedrag(totaalBtw)}</span>
        </div>
      </div>
      {optioneleRegels.length > 0 && (
        <div className="border-t px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Optioneel — apart aangeboden, telt niet mee in bovenstaand totaal</p>
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {optioneleRegels.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="py-2 pr-3">
                    <span className="font-medium text-foreground">{r.klanttekst || r.omschrijving}</span>
                    <Badge variant="outline" className="ml-2 text-[10px]">optioneel</Badge>
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">{formatBedrag(r.totaal)}</td>
                </tr>
              ))}
              <tr className="border-t font-semibold">
                <td className="py-2">Optioneel subtotaal</td>
                <td className="py-2 text-right tabular-nums">{formatBedrag(optioneelTotaal || optioneleRegels.filter(teltMeeRegel).reduce((s, r) => s + r.totaal, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Monteur view ────────────────────────────────────────────────────────────

function MonteurView({ regels }: { regels: RegelRow[] }) {
  const directe = regels.filter((r) => !r.is_staartkosten && !r.is_bouwplaatskosten);
  return (
    <div>
      {HOOFDSTUK_OPTIES.map((h) => {
        const rijen = directe.filter((r) => (r.hoofdstuk ?? "Overige werkzaamheden") === h);
        if (!rijen.length) return null;
        return (
          <div key={h}>
            <div className="px-4 py-1.5 bg-muted border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</div>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {rijen.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2.5 font-medium">{r.omschrijving}</td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground w-16">{r.eenheid}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums w-20">{r.hoeveelheid}</td>
                    <td className="px-3 py-2.5 text-sm text-muted-foreground w-56">{r.opmerkingen || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ─── Inkoopregels kaart ───────────────────────────────────────────────────────

const INKOOP_STATUS_LABEL: Record<string, string> = {
  concept:               "Concept",
  te_versturen:          "Te versturen",
  verstuurd:             "Verstuurd",
  wacht_op_leverancier:  "Wacht op leverancier",
  herinnering_nodig:     "Herinnering nodig",
  ontvangen:             "Ontvangen",
  intern_te_verwerken:   "Intern te verwerken",
  verwerkt:              "Verwerkt",
  gekozen:               "Gekozen",
  afgewezen:             "Afgewezen",
  vervallen:             "Vervallen",
  // legacy
  akkoord:               "Akkoord",
};
const INKOOP_STATUS_KLEUR: Record<string, string> = {
  concept:               "bg-muted text-muted-foreground border-border",
  te_versturen:          "bg-muted text-muted-foreground border-border",
  verstuurd:             "bg-blue-100 text-blue-800 border-blue-200",
  wacht_op_leverancier:  "bg-blue-100 text-blue-700 border-blue-200",
  herinnering_nodig:     "bg-orange-100 text-orange-800 border-orange-200",
  ontvangen:             "bg-amber-100 text-amber-800 border-amber-200",
  intern_te_verwerken:   "bg-amber-100 text-amber-700 border-amber-200",
  verwerkt:              "bg-teal-100 text-teal-800 border-teal-200",
  gekozen:               "bg-green-100 text-green-800 border-green-200",
  afgewezen:             "bg-red-100 text-red-700 border-red-200",
  vervallen:             "bg-gray-100 text-gray-500 border-gray-200",
  akkoord:               "bg-green-100 text-green-800 border-green-200",
};
const INKOOP_STATUS_VOLGEND: Record<string, string | null> = {
  concept:               "te_versturen",
  te_versturen:          "verstuurd",
  verstuurd:             "wacht_op_leverancier",
  wacht_op_leverancier:  "ontvangen",
  herinnering_nodig:     "ontvangen",
  ontvangen:             "intern_te_verwerken",
  intern_te_verwerken:   "verwerkt",
  verwerkt:              "gekozen",
  gekozen:               null,
  afgewezen:             null,
  vervallen:             null,
  akkoord:               null,
};
const INKOOP_TYPE_LABEL: Record<string, string> = {
  materiaal:       "Materiaal",
  onderaanneming:  "Onderaanneming",
};

type InkoopForm = {
  type: string;
  omschrijving: string;
  artikel: string;
  leverancier: string;
  leverancier_email: string;
  gekozen_leverancier: string;
  aantal: string;
  eenheid: string;
  prijs: string;
  offerte_ontvangen: boolean;
  levertijd: string;
  reactiedatum: string;
  beslisdatum: string;
  leverdatum: string;
  toelichting: string;
  status: string;
  bedrag: string;
  notities: string;
};

function InkoopregelsKaart({
  calculatieId, items, nieuwOpen, setNieuwOpen, form, setForm, bewerken, setBewerken,
  onAanmaken, onStatusWijzigen, onOpslaan, onVerwijderen,
}: {
  calculatieId: number;
  items: ModCalcInkoopItem[];
  nieuwOpen: boolean;
  setNieuwOpen: (v: boolean) => void;
  form: InkoopForm;
  setForm: (fn: (f: InkoopForm) => InkoopForm) => void;
  bewerken: ModCalcInkoopItem | null;
  setBewerken: (v: ModCalcInkoopItem | null) => void;
  onAanmaken: (d: Record<string, unknown>) => void;
  onStatusWijzigen: (itemId: number, status: string) => void;
  onOpslaan: (itemId: number, d: Record<string, unknown>) => void;
  onVerwijderen: (itemId: number) => void;
}) {
  const [uitgebreidId, setUitgebreidId] = useState<number | null>(null);
  const [conceptMail, setConceptMail] = useState<string>("");
  const [conceptMailItemId, setConceptMailItemId] = useState<number | null>(null);
  const [conceptMailLaden, setConceptMailLaden] = useState(false);
  const conceptMailMut = useGenerateRfqConceptMail();

  const groepen: { type: string; items: ModCalcInkoopItem[] }[] = [
    { type: "materiaal",      items: items.filter((i) => i.type === "materiaal") },
    { type: "onderaanneming", items: items.filter((i) => i.type === "onderaanneming") },
  ].filter((g) => g.items.length > 0 || nieuwOpen);

  const geenGekozen = items.filter((i) => i.status === "gekozen").length;
  const totaalGekozen = items
    .filter((i) => i.status === "gekozen")
    .reduce((s, i) => s + (i.bedrag ?? 0), 0);

  function handleAanmaken() {
    if (!form.omschrijving.trim()) return;
    onAanmaken({
      type: form.type,
      omschrijving: form.omschrijving.trim(),
      artikel: form.artikel || undefined,
      leverancier: form.leverancier || undefined,
      leverancier_email: form.leverancier_email || undefined,
      gekozen_leverancier: form.gekozen_leverancier || undefined,
      aantal: form.aantal ? parseFloat(form.aantal) : undefined,
      eenheid: form.eenheid || undefined,
      prijs: form.prijs ? parseFloat(form.prijs) : undefined,
      offerte_ontvangen: form.offerte_ontvangen || undefined,
      levertijd: form.levertijd || undefined,
      reactiedatum: form.reactiedatum || undefined,
      beslisdatum: form.beslisdatum || undefined,
      leverdatum: form.leverdatum || undefined,
      toelichting: form.toelichting || undefined,
      status: form.status,
      bedrag: form.bedrag ? parseFloat(form.bedrag) : undefined,
      notities: form.notities || undefined,
    });
  }

  function handleOpslaan() {
    if (!bewerken || !form.omschrijving.trim()) return;
    onOpslaan(bewerken.id, {
      omschrijving: form.omschrijving.trim(),
      artikel: form.artikel || null,
      leverancier: form.leverancier || null,
      leverancier_email: form.leverancier_email || null,
      gekozen_leverancier: form.gekozen_leverancier || null,
      aantal: form.aantal ? parseFloat(form.aantal) : null,
      eenheid: form.eenheid || null,
      prijs: form.prijs ? parseFloat(form.prijs) : null,
      offerte_ontvangen: form.offerte_ontvangen,
      levertijd: form.levertijd || null,
      reactiedatum: form.reactiedatum || null,
      beslisdatum: form.beslisdatum || null,
      leverdatum: form.leverdatum || null,
      toelichting: form.toelichting || null,
      status: form.status,
      bedrag: form.bedrag ? parseFloat(form.bedrag) : null,
      notities: form.notities || null,
    });
  }

  function openBewerken(item: ModCalcInkoopItem) {
    setBewerken(item);
    setForm(() => ({
      type: item.type,
      omschrijving: item.omschrijving,
      artikel: (item as any).artikel ?? "",
      leverancier: item.leverancier ?? "",
      leverancier_email: (item as any).leverancier_email ?? "",
      gekozen_leverancier: (item as any).gekozen_leverancier ?? "",
      aantal: (item as any).aantal != null ? String((item as any).aantal) : "",
      eenheid: (item as any).eenheid ?? "st",
      prijs: (item as any).prijs != null ? String((item as any).prijs) : "",
      offerte_ontvangen: (item as any).offerte_ontvangen ?? false,
      levertijd: (item as any).levertijd ?? "",
      reactiedatum: (item as any).reactiedatum ?? "",
      beslisdatum: (item as any).beslisdatum ?? "",
      leverdatum: (item as any).leverdatum ?? "",
      toelichting: (item as any).toelichting ?? "",
      status: item.status,
      bedrag: item.bedrag != null ? String(item.bedrag) : "",
      notities: item.notities ?? "",
    }));
  }

  function handleGenereerConceptMail(itemId: number) {
    setConceptMailItemId(itemId);
    setConceptMail("");
    setConceptMailLaden(true);
    conceptMailMut.mutate(
      { id: calculatieId, itemId },
      {
        onSuccess: (data: any) => {
          setConceptMail(data?.concept_mail ?? "");
          setConceptMailLaden(false);
        },
        onError: () => {
          setConceptMail("Kon geen conceptmail genereren. Controleer de gegevens en probeer opnieuw.");
          setConceptMailLaden(false);
        },
      }
    );
  }

  const fmt = (v: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
  const fmtDatum = (d: string | null | undefined) => {
    if (!d) return null;
    try { return new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }); }
    catch { return d; }
  };
  const isVerlopen = (d: string | null | undefined) => {
    if (!d) return false;
    return new Date(d) < new Date();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          Inkoopregels
          {items.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              ({geenGekozen}/{items.length} gekozen{geenGekozen > 0 ? ` · ${fmt(totaalGekozen)}` : ""})
            </span>
          )}
        </h2>
        <Button size="sm" variant="outline" onClick={() => {
          setNieuwOpen(true);
          setBewerken(null);
          setForm(() => ({
            type: "materiaal", omschrijving: "", artikel: "", leverancier: "",
            leverancier_email: "", gekozen_leverancier: "", aantal: "", eenheid: "st",
            prijs: "", offerte_ontvangen: false, levertijd: "",
            reactiedatum: "", beslisdatum: "", leverdatum: "", toelichting: "",
            status: "concept", bedrag: "", notities: "",
          }));
        }}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Toevoegen
        </Button>
      </div>

      {items.length === 0 && !nieuwOpen && (
        <p className="text-sm text-muted-foreground py-2">Nog geen inkoopregels. Voeg offerteaanvragen voor materialen of onderaannemers toe.</p>
      )}

      {groepen.map(({ type, items: groepItems }) => (
        <div key={type} className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{INKOOP_TYPE_LABEL[type] ?? type}</p>
          <div className="border rounded-md divide-y">
            {groepItems.map((item) => (
              bewerken?.id === item.id ? (
                <div key={item.id} className="p-3 space-y-3 bg-muted/30">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Omschrijving</Label>
                      <Input value={form.omschrijving} onChange={(e) => setForm((f) => ({ ...f, omschrijving: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Artikelnummer / code</Label>
                      <Input value={form.artikel} onChange={(e) => setForm((f) => ({ ...f, artikel: e.target.value }))} className="h-8 text-sm" placeholder="Optioneel" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Leverancier / onderaannemer</Label>
                      <Input value={form.leverancier} onChange={(e) => setForm((f) => ({ ...f, leverancier: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">E-mailadres leverancier</Label>
                      <Input type="email" value={form.leverancier_email} onChange={(e) => setForm((f) => ({ ...f, leverancier_email: e.target.value }))} className="h-8 text-sm" placeholder="offertes@leverancier.nl" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Aantal</Label>
                      <Input type="number" value={form.aantal} onChange={(e) => setForm((f) => ({ ...f, aantal: e.target.value }))} className="h-8 text-sm" placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Eenheid</Label>
                      <Input value={form.eenheid} onChange={(e) => setForm((f) => ({ ...f, eenheid: e.target.value }))} className="h-8 text-sm" placeholder="st" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Prijs per eenheid</Label>
                      <Input type="number" value={form.prijs} onChange={(e) => setForm((f) => ({ ...f, prijs: e.target.value }))} className="h-8 text-sm" placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Bedrag (excl. BTW)</Label>
                      <Input type="number" value={form.bedrag} onChange={(e) => setForm((f) => ({ ...f, bedrag: e.target.value }))} className="h-8 text-sm" placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Reactiedatum</Label>
                      <Input type="date" value={form.reactiedatum} onChange={(e) => setForm((f) => ({ ...f, reactiedatum: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Beslisdatum</Label>
                      <Input type="date" value={form.beslisdatum} onChange={(e) => setForm((f) => ({ ...f, beslisdatum: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Leverdatum</Label>
                      <Input type="date" value={form.leverdatum} onChange={(e) => setForm((f) => ({ ...f, leverdatum: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Levertijd</Label>
                      <Input value={form.levertijd} onChange={(e) => setForm((f) => ({ ...f, levertijd: e.target.value }))} className="h-8 text-sm" placeholder="Bijv. 3 weken" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Gekozen leverancier</Label>
                      <Input value={form.gekozen_leverancier} onChange={(e) => setForm((f) => ({ ...f, gekozen_leverancier: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Status</Label>
                      <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(INKOOP_STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Toelichting</Label>
                      <Textarea value={form.toelichting} onChange={(e) => setForm((f) => ({ ...f, toelichting: e.target.value }))} className="text-sm min-h-[60px]" placeholder="Optionele toelichting voor de leverancier" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Interne notities</Label>
                      <Textarea value={form.notities} onChange={(e) => setForm((f) => ({ ...f, notities: e.target.value }))} className="text-sm min-h-[60px]" placeholder="Interne aantekeningen (niet zichtbaar voor leverancier)" />
                    </div>
                    <div className="col-span-2 flex items-center gap-2">
                      <input type="checkbox" id={`offerte-${item.id}`} checked={form.offerte_ontvangen} onChange={(e) => setForm((f) => ({ ...f, offerte_ontvangen: e.target.checked }))} className="h-4 w-4" />
                      <Label htmlFor={`offerte-${item.id}`} className="text-xs cursor-pointer">Offerte ontvangen</Label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleOpslaan}>Opslaan</Button>
                    <Button size="sm" variant="outline" onClick={() => setBewerken(null)}>Annuleren</Button>
                  </div>
                </div>
              ) : (
                <div key={item.id} className="space-y-0">
                  <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{item.omschrijving}</span>
                        {item.leverancier && <span className="text-xs text-muted-foreground">{item.leverancier}</span>}
                        {item.bedrag != null && <span className="text-xs font-medium tabular-nums">{fmt(item.bedrag)}</span>}
                        {(item as any).reactiedatum && (
                          <span className={`text-xs tabular-nums ${isVerlopen((item as any).reactiedatum) && !["gekozen","afgewezen","vervallen"].includes(item.status) ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                            reactie {fmtDatum((item as any).reactiedatum)}
                            {isVerlopen((item as any).reactiedatum) && !["gekozen","afgewezen","vervallen"].includes(item.status) && " (verlopen)"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-xs border cursor-pointer select-none ${INKOOP_STATUS_KLEUR[item.status] ?? ""}`}
                        onClick={() => {
                          const volgend = INKOOP_STATUS_VOLGEND[item.status];
                          if (volgend) onStatusWijzigen(item.id, volgend);
                        }}
                        title={INKOOP_STATUS_VOLGEND[item.status] ? `Klik om naar "${INKOOP_STATUS_LABEL[INKOOP_STATUS_VOLGEND[item.status]!]}" te zetten` : undefined}
                      >
                        {INKOOP_STATUS_LABEL[item.status] ?? item.status}
                      </Badge>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        title="Uitklappen / conceptmail"
                        onClick={() => setUitgebreidId(uitgebreidId === item.id ? null : item.id)}
                      >
                        <ChevronDown className={`h-3 w-3 transition-transform ${uitgebreidId === item.id ? "rotate-180" : ""}`} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openBewerken(item)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onVerwijderen(item.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {uitgebreidId === item.id && (
                    <div className="px-3 pb-3 pt-1 bg-muted/20 border-t space-y-3">
                      <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
                        {(item as any).leverancier_email && (
                          <div className="col-span-3"><span className="text-muted-foreground">E-mail: </span><span className="font-medium">{(item as any).leverancier_email}</span></div>
                        )}
                        {(item as any).reactiedatum && (
                          <div><span className="text-muted-foreground">Reactie: </span><span className={`font-medium ${isVerlopen((item as any).reactiedatum) && !["gekozen","afgewezen","vervallen"].includes(item.status) ? "text-red-600" : ""}`}>{fmtDatum((item as any).reactiedatum)}</span></div>
                        )}
                        {(item as any).beslisdatum && (
                          <div><span className="text-muted-foreground">Beslissing: </span><span className="font-medium">{fmtDatum((item as any).beslisdatum)}</span></div>
                        )}
                        {(item as any).leverdatum && (
                          <div><span className="text-muted-foreground">Levering: </span><span className="font-medium">{fmtDatum((item as any).leverdatum)}</span></div>
                        )}
                        {(item as any).toelichting && (
                          <div className="col-span-3"><span className="text-muted-foreground">Toelichting: </span><span>{(item as any).toelichting}</span></div>
                        )}
                        {(item as any).notities && (
                          <div className="col-span-3"><span className="text-muted-foreground">Notities: </span><span>{(item as any).notities}</span></div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Button
                          size="sm" variant="outline"
                          disabled={conceptMailLaden && conceptMailItemId === item.id}
                          onClick={() => handleGenereerConceptMail(item.id)}
                          className="h-7 text-xs gap-1.5"
                        >
                          <Sparkles className="h-3 w-3" />
                          {conceptMailLaden && conceptMailItemId === item.id ? "Genereren..." : "AI conceptmail"}
                        </Button>
                        {conceptMailItemId === item.id && conceptMail && (
                          <Textarea
                            value={conceptMail}
                            onChange={(e) => setConceptMail(e.target.value)}
                            className="text-xs min-h-[140px] font-mono"
                            placeholder="Conceptmail verschijnt hier..."
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            ))}
          </div>
        </div>
      ))}

      {nieuwOpen && (
        <div className="border rounded-md p-3 space-y-3 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground">Nieuw inkoopitem</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="materiaal">Materiaal</SelectItem>
                  <SelectItem value="onderaanneming">Onderaanneming</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Omschrijving</Label>
              <Input value={form.omschrijving} onChange={(e) => setForm((f) => ({ ...f, omschrijving: e.target.value }))} className="h-8 text-sm" placeholder="Bijv. Brandwerende beplating leverancier X" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Leverancier / onderaannemer</Label>
              <Input value={form.leverancier} onChange={(e) => setForm((f) => ({ ...f, leverancier: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">E-mailadres leverancier</Label>
              <Input type="email" value={form.leverancier_email} onChange={(e) => setForm((f) => ({ ...f, leverancier_email: e.target.value }))} className="h-8 text-sm" placeholder="offertes@leverancier.nl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Aantal</Label>
              <Input type="number" value={form.aantal} onChange={(e) => setForm((f) => ({ ...f, aantal: e.target.value }))} className="h-8 text-sm" placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Eenheid</Label>
              <Input value={form.eenheid} onChange={(e) => setForm((f) => ({ ...f, eenheid: e.target.value }))} className="h-8 text-sm" placeholder="st" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reactiedatum</Label>
              <Input type="date" value={form.reactiedatum} onChange={(e) => setForm((f) => ({ ...f, reactiedatum: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bedrag (excl. BTW)</Label>
              <Input type="number" value={form.bedrag} onChange={(e) => setForm((f) => ({ ...f, bedrag: e.target.value }))} className="h-8 text-sm" placeholder="0" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAanmaken} disabled={!form.omschrijving.trim()}>Toevoegen</Button>
            <Button size="sm" variant="outline" onClick={() => setNieuwOpen(false)}>Annuleren</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FIE Bedrijfskompas contextblok ──────────────────────────────────────────

function FieContextBlok({ calculatieId }: { calculatieId: number }) {
  const { data, isLoading } = useGetFieContextCalculatie(calculatieId);

  if (isLoading) {
    return (
      <div className="p-4 border-t space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  }

  if (!data) return null;

  const {
    heeft_begroting, advies_status, advies_tekst,
    doel_marge_pct, verwachte_marge_pct, verwachte_marge_abs,
    ak_bijdrage, ak_per_uur, totaal_mu,
    totaal_incl_opslag, totaal_excl_opslag,
    totaal_arbeid, totaal_materiaal,
    correctie_factor, gecorrigeerde_arbeid, gecorrigeerde_materiaal,
  } = data;

  const heeftLeereffect =
    correctie_factor != null && correctie_factor !== 1.0;

  const adviesKleur: Record<string, string> = {
    goed:           "bg-green-50 border-green-200 text-green-800",
    neutraal:       "bg-muted border-border text-muted-foreground",
    laag:           "bg-amber-50 border-amber-200 text-amber-800",
    leeg:           "bg-muted border-border text-muted-foreground",
    geen_begroting: "bg-slate-50 border-slate-200 text-slate-500",
  };

  const AdviesIcoon = () => {
    if (advies_status === "goed") return <TrendingUp className="h-3.5 w-3.5 text-green-600 shrink-0" />;
    if (advies_status === "laag") return <TrendingDown className="h-3.5 w-3.5 text-amber-600 shrink-0" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  };

  function fmtPct(n: number | null | undefined) {
    if (n == null) return "—";
    return `${n.toFixed(1)}%`;
  }

  function fmtEur(n: number | null | undefined) {
    if (n == null) return "—";
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }

  const heeftRegels = totaal_incl_opslag > 0;

  return (
    <div className="p-4 border-t space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
        <TrendingUp className="h-3.5 w-3.5" />
        Bedrijfskompas
      </h3>

      {heeftRegels ? (
        <>
          {/* Adviesbadge */}
          <div className={cn("rounded-md border p-2.5 text-xs flex items-start gap-2", adviesKleur[advies_status ?? ""] ?? adviesKleur.neutraal)}>
            <AdviesIcoon />
            <span className="leading-snug">{advies_tekst}</span>
          </div>

          {/* Projectomzet / kostprijs / brutowinst */}
          <div className="space-y-1 text-xs border-t pt-2">
            <div className="flex justify-between text-muted-foreground">
              <span>Projectomzet</span>
              <span className="tabular-nums font-semibold text-foreground">{fmtEur(totaal_incl_opslag)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Kostprijs (dir. kosten)</span>
              <span className="tabular-nums">{fmtEur(totaal_excl_opslag)}</span>
            </div>
            {ak_bijdrage != null && (
              <div className="flex justify-between text-muted-foreground">
                <span>AK-bijdrage ({totaal_mu != null ? `${Math.round(totaal_mu)} MU` : "—"})</span>
                <span className="tabular-nums">{fmtEur(ak_bijdrage)}</span>
              </div>
            )}
            {verwachte_marge_abs != null && (
              <div className="flex justify-between font-medium border-t pt-1 mt-1">
                <span>Brutowinst</span>
                <span className={cn("tabular-nums", advies_status === "goed" ? "text-green-700" : advies_status === "laag" ? "text-amber-700" : "text-foreground")}>
                  {fmtEur(verwachte_marge_abs)}
                </span>
              </div>
            )}
          </div>

          {/* Leereffect-correctie: gecorrigeerde arbeid- en materiaalindicatoren */}
          {heeftLeereffect && (gecorrigeerde_arbeid != null || gecorrigeerde_materiaal != null) && (
            <div className="space-y-1.5 text-xs border-t pt-2">
              <div className="flex items-center gap-1.5 text-amber-700 font-semibold">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>Leereffect-correctie</span>
                <span className="ml-auto inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-1.5 py-px text-[10px] font-bold text-amber-800 tabular-nums">
                  &times;{correctie_factor!.toFixed(2)}
                </span>
              </div>
              {totaal_arbeid != null && gecorrigeerde_arbeid != null && (
                <div className="flex justify-between text-muted-foreground pl-4">
                  <span>
                    Arbeid origineel
                  </span>
                  <span className="tabular-nums line-through decoration-amber-400">{fmtEur(totaal_arbeid)}</span>
                </div>
              )}
              {gecorrigeerde_arbeid != null && (
                <div className="flex justify-between pl-4 font-medium text-amber-800">
                  <span>Gecorrigeerde arbeid</span>
                  <span className="tabular-nums">{fmtEur(gecorrigeerde_arbeid)}</span>
                </div>
              )}
              {totaal_materiaal != null && gecorrigeerde_materiaal != null && (
                <div className="flex justify-between text-muted-foreground pl-4">
                  <span>Materiaal origineel</span>
                  <span className="tabular-nums line-through decoration-amber-400">{fmtEur(totaal_materiaal)}</span>
                </div>
              )}
              {gecorrigeerde_materiaal != null && (
                <div className="flex justify-between pl-4 font-medium text-amber-800">
                  <span>Gecorrigeerd materiaal</span>
                  <span className="tabular-nums">{fmtEur(gecorrigeerde_materiaal)}</span>
                </div>
              )}
            </div>
          )}

          {/* Margepercentages + doelmarge */}
          {heeft_begroting && verwachte_marge_pct != null && (
            <div className="space-y-1 text-xs border-t pt-2">
              <div className="flex justify-between text-muted-foreground">
                <span>Brutomarge</span>
                <span className={cn("tabular-nums font-semibold", advies_status === "goed" ? "text-green-700" : advies_status === "laag" ? "text-amber-700" : "text-foreground")}>
                  {fmtPct(verwachte_marge_pct)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Doelmarge</span>
                <span className="tabular-nums font-medium">{fmtPct(doel_marge_pct)}</span>
              </div>
              {ak_per_uur != null && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Norm AK/uur</span>
                  <span className="tabular-nums">{fmtEur(ak_per_uur)}</span>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="rounded-md border border-dashed border-border p-3 text-center">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Voeg regels toe om het margeadvies te activeren
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Hoofdcomponent ──────────────────────────────────────────────────────────

export default function ModulesCalculatieDetail() {
  const [, params] = useRoute("/modules/calculatie/:id");
  const [, navigate] = useLocation();
  const id = params?.id ? parseInt(params.id, 10) : 0;

  // ADVIES_01 §4.1: open het inleespaneel automatisch als de pagina met
  // ?adviesrapport=<document_id> geopend wordt (vanuit Slim Upload / index).
  const [adviesDocumentId, setAdviesDocumentId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("adviesrapport");
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
  });
  const ruimAdviesParamOp = useCallback(() => {
    setAdviesDocumentId(null);
    if (typeof window !== "undefined" && window.location.search.includes("adviesrapport")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("adviesrapport");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["mod-calculatie", id] });
    // FIE-context herberekenen na elke wijziging aan regels/header (live margeadvies).
    queryClient.invalidateQueries({ queryKey: getGetFieContextCalculatieQueryKey(id) });
  }, [queryClient, id]);

  const { data, isLoading } = useGetModCalculatie(id, {
    query: { queryKey: ["mod-calculatie", id], enabled: id > 0 },
  });
  const { data: normtijden = [] } = useListModCalcNormtijden({ query: { queryKey: ["mod-calc-normtijden"] } });
  const { data: tarieven = [] } = useListModCalcTarieven({ query: { queryKey: ["mod-calc-tarieven"] } });
  const { data: inkoopItems = [] } = useListModCalcInkoopItems(id, { query: { queryKey: getListModCalcInkoopItemsQueryKey(id), enabled: id > 0 } });
  const { data: eenheden = [] } = useListModCalcEenheden(id, { query: { queryKey: getListModCalcEenhedenQueryKey(id), enabled: id > 0 } });
  const { data: offertes = [] } = (useListOffertes as any)({ calculatie_id: id }, { query: { enabled: id > 0 } });
  const { data: bronbestanden = [] } = useListEnkBronbestanden(
    { calculatie_id: id },
    { query: { queryKey: ["enk-bronbestanden-calc", id], enabled: id > 0 } },
  );
  const bronbestand = bronbestanden[0];
  // ADVIES_01 §4.5: gekoppelde adviesrapporten (bronrapporten) klikbaar tonen.
  const gekoppeldeDocParams = { doel_type: "calculatie" as const, doel_id: id };
  const { data: gekoppeldeDocumenten = [] } = useListGekoppeldeDocumenten(gekoppeldeDocParams, {
    query: { queryKey: getListGekoppeldeDocumentenQueryKey(gekoppeldeDocParams), enabled: id > 0 },
  });
  const adviesBronnen = (Array.isArray(gekoppeldeDocumenten) ? gekoppeldeDocumenten : [])
    .filter((d: any) => d?.ai_metadata?.categorie === "adviesrapport");
  const maakEenheidMut    = useCreateModCalcEenheid({ mutation: { onSuccess: invalidate } });
  const updateEenheidMut  = useUpdateModCalcEenheid({ mutation: { onSuccess: invalidate } });
  const verwijderEenheidMut = useDeleteModCalcEenheid({ mutation: { onSuccess: invalidate } });
  const maakInkoopItemMut    = useCreateModCalcInkoopItem();
  const updateInkoopItemMut  = useUpdateModCalcInkoopItem();
  const verwijderInkoopItemMut = useDeleteModCalcInkoopItem();

  const updateMut   = useUpdateModCalculatie({ mutation: { onSuccess: invalidate } });
  const deleteMut   = useDeleteModCalculatie({ mutation: { onSuccess: () => navigate("/modules/calculatie") } });
  const dupliceerMut = useDupliceerModCalculatie({
    mutation: {
      onSuccess: (d) => {
        queryClient.invalidateQueries({ queryKey: ["mod-calculaties"] });
        navigate(`/modules/calculatie/${d.id}`);
      },
    },
  });
  const maakOfferteMut = useMaakOfferteVanCalculatie({
    mutation: {
      onSuccess: (d) => { navigate(`/offertes/${d.offerte_id}`); },
      onError: () => toast({ title: "Offerte aanmaken mislukt", variant: "destructive" }),
    },
  });
  const createRegelMut = useCreateModCalcRegel({ mutation: { onSuccess: invalidate } });
  const updateRegelMut = useUpdateModCalcRegel({ mutation: { onSuccess: invalidate } });
  const deleteRegelMut = useDeleteModCalcRegel({ mutation: { onSuccess: invalidate } });
  const herschikRegelMut = useHerschikModCalcRegel({
    mutation: {
      onSuccess: invalidate,
      onError: () => toast({ title: "Verplaatsen mislukt", variant: "destructive" }),
    },
  });
  const aiMut = useAiModCalcRegels({
    mutation: {
      onSuccess: (d) => {
        const regels = (d.regels ?? []).map((r) => ({
          categorie: r.categorie ?? "materiaal",
          omschrijving: r.omschrijving ?? "",
          normtijd_id: "",
          eenheid: r.eenheid ?? "st",
          hoeveelheid: String(r.hoeveelheid ?? 1),
          tarief: String(r.tarief ?? 0),
          mu_per_eenheid: String((r as any).mu_per_eenheid ?? 0),
          arbeids_tarief: String((r as any).arbeids_tarief ?? 0),
          onderaanneming_bedrag: String((r as any).onderaanneming_bedrag ?? 0),
          is_staartkosten: (r as any).is_staartkosten ?? false,
          is_bouwplaatskosten: (r as any).is_bouwplaatskosten ?? false,
          opmerkingen: "",
          regelnummer: "",
          hoofdstuk: (r as any).hoofdstuk ?? "Overige werkzaamheden",
          klanttekst: r.klanttekst ?? "",
          btw_tarief: "21",
          wand_plafond: "",
          toepassing_tekst: "",
        }));
        setAiVoorstellen(regels);
        setAiWaarschuwingen((d.waarschuwingen ?? []) as string[]);
        setAiPaneel(true);
      },
    },
  });

  const aiChatMut = useAiChatCalculatie();

  // Rechten-gating (conventie: 2=schrijven, 4=verwijderen); alleen-lezen krijgt geen mutatieknoppen.
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("calculaties", 2);
  const kanVerwijderen = heeftNiveau("calculaties", 4);

  const [weergave, setWeergave] = useState<Weergave>("intern");
  const [teVerwijderen, setTeVerwijderen]       = useState(false);
  const [bewerkenDialoog, setBewerkenDialoog]   = useState(false);
  const [aiPaneel, setAiPaneel]                 = useState(false);
  const [aiVoorstellen, setAiVoorstellen]       = useState<any[]>([]);
  const [aiWaarschuwingen, setAiWaarschuwingen] = useState<string[]>([]);
  const [versieDialoog, setVersieDialoog]       = useState(false);
  const [versieOpslaanDialoog, setVersieOpslaanDialoog] = useState(false);
  const [versieLabel, setVersieLabel]           = useState("");
  const [versieOpslaanBezig, setVersieOpslaanBezig] = useState(false);
  const [inkoopNieuwOpen, setInkoopNieuwOpen] = useState(false);
  const leegInkoopForm: InkoopForm = { type: "materiaal", omschrijving: "", artikel: "", leverancier: "", leverancier_email: "", gekozen_leverancier: "", aantal: "", eenheid: "st", prijs: "", offerte_ontvangen: false, levertijd: "", reactiedatum: "", beslisdatum: "", leverdatum: "", toelichting: "", status: "concept", bedrag: "", notities: "" };
  const [inkoopForm, setInkoopForm] = useState<InkoopForm>(leegInkoopForm);
  const [inkoopBewerken, setInkoopBewerken] = useState<ModCalcInkoopItem | null>(null);

  // Calculatie-eenheden state
  const [eenheidDialoogOpen, setEenheidDialoogOpen] = useState(false);
  const [eenheidBewerken, setEenheidBewerken] = useState<CalcEenheid | null>(null);
  const [eenheidNaam, setEenheidNaam] = useState("");
  const [eenheidType, setEenheidType] = useState("vrije_projecteenheid");
  const [ingeklapteEenheden, setIngeklapteEenheden] = useState<Set<number>>(new Set());

  // Eenheidsprijzenbibliotheek picker
  const [bibliotheekOpen, setBibliotheekOpen] = useState(false);
  const [bibliotheekZoek, setBibliotheekZoek] = useState("");
  const [bibliotheekCategorie, setBibliotheekCategorie] = useState("__alle__");
  const { data: bibliotheekPrijzenRaw = [] } = useListEenheidsprijzen(
    { actief: "true", ...(bibliotheekZoek ? { zoek: bibliotheekZoek } : {}), ...(bibliotheekCategorie !== "__alle__" ? { categorie: bibliotheekCategorie } : {}) },
  );
  const bibliotheekPrijzen = bibliotheekOpen ? bibliotheekPrijzenRaw : [];

  function nieuweRegelUitBibliotheek(ep: EenheidsPrijs) {
    setNieuwDraft({
      ...LEEG_DRAFT,
      omschrijving: ep.omschrijving,
      eenheid: ep.eenheid,
      tarief: String(ep.verkoopprijs),
      mu_per_eenheid: ep.normtijd > 0 ? String(ep.normtijd) : "0",
      hoofdstuk: "Overige werkzaamheden",
    });
    setBibliotheekOpen(false);
    setBibliotheekZoek("");
  }

  // Nieuw rij invoerrij (null = verborgen)
  const [nieuwDraft, setNieuwDraft] = useState<LocalDraft | null>(null);
  const [toonOnderaanneming, setToonOnderaanneming] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [seniorOpen, setSeniorOpen] = useState(false);

  const [headerForm, setHeaderForm] = useState({
    naam: "", referentie: "", klant_naam: "", project_naam: "",
    werknummer: "", opname_id: null as number | null,
    status: "", omschrijving: "", opmerkingen: "",
    opslag_materiaal: 0, opslag_arbeid: 0,
    opslag_ak: 15, opslag_abk: 10, opslag_risico: 5, opslag_winst: 10, korting: 0,
    ak_is_vast: false, abk_is_vast: false, risico_is_vast: false, winst_is_vast: false,
  });

  const gebouwIdVoorOpnames = data?.gebouw_id ?? undefined;
  const { data: opnamesVoorBewerken } = useListOpnames(
    gebouwIdVoorOpnames ? { gebouw_id: gebouwIdVoorOpnames } : undefined,
    { query: { queryKey: getListOpnamesQueryKey(gebouwIdVoorOpnames ? { gebouw_id: gebouwIdVoorOpnames } : undefined), enabled: !!gebouwIdVoorOpnames && bewerkenDialoog } },
  );

  const { data: versieData, refetch: versiesHerladen } = useQuery<{ id: number; versienummer: number; label: string | null; aangemaakt_op: string }[]>({
    queryKey: ["calc-versies", id],
    queryFn: () => fetch(`/api/modules/calculaties/${id}/versies`).then((r) => r.json()),
    enabled: versieDialoog,
  });

  async function handleVersieOpslaan() {
    setVersieOpslaanBezig(true);
    try {
      await fetch(`/api/modules/calculaties/${id}/versie-opslaan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: versieLabel.trim() || undefined }),
      });
      setVersieOpslaanDialoog(false);
      setVersieLabel("");
      versiesHerladen();
    } finally {
      setVersieOpslaanBezig(false);
    }
  }

  function openBewerkenHeader() {
    if (!data) return;
    setHeaderForm({
      naam: data.naam,
      referentie: data.referentie ?? "",
      klant_naam: data.klant_naam ?? "",
      project_naam: data.project_naam ?? "",
      werknummer: (data as any).werknummer ?? "",
      opname_id: (data as any).opname_id ?? null,
      status: data.status,
      omschrijving: data.omschrijving ?? "",
      opmerkingen: data.opmerkingen ?? "",
      opslag_materiaal: data.opslag_materiaal ?? 0,
      opslag_arbeid: data.opslag_arbeid ?? 0,
      opslag_ak: data.opslag_ak,
      opslag_abk: (data as any).opslag_abk ?? 10,
      opslag_risico: data.opslag_risico,
      opslag_winst: data.opslag_winst,
      korting: data.korting,
      ak_is_vast: (data as any).ak_is_vast ?? false,
      abk_is_vast: (data as any).abk_is_vast ?? false,
      risico_is_vast: (data as any).risico_is_vast ?? false,
      winst_is_vast: (data as any).winst_is_vast ?? false,
    });
    setBewerkenDialoog(true);
  }

  function handleHeaderOpslaan() {
    updateMut.mutate({ id, data: {
      naam: headerForm.naam,
      referentie: headerForm.referentie || null,
      klant_naam: headerForm.klant_naam || null,
      project_naam: headerForm.project_naam || null,
      werknummer: headerForm.werknummer || null,
      opname_id: headerForm.opname_id ?? null,
      status: headerForm.status,
      omschrijving: headerForm.omschrijving || null,
      opmerkingen: headerForm.opmerkingen || null,
      opslag_materiaal: headerForm.opslag_materiaal,
      opslag_arbeid: headerForm.opslag_arbeid,
      opslag_ak: headerForm.opslag_ak,
      opslag_abk: headerForm.opslag_abk,
      opslag_risico: headerForm.opslag_risico,
      opslag_winst: headerForm.opslag_winst,
      korting: headerForm.korting,
      ak_is_vast: headerForm.ak_is_vast,
      abk_is_vast: headerForm.abk_is_vast,
      risico_is_vast: headerForm.risico_is_vast,
      winst_is_vast: headerForm.winst_is_vast,
    } as any });
    setBewerkenDialoog(false);
  }

  function handleStatusWijzigen(nieuweStatus: string) {
    if (!data) return;
    updateMut.mutate({ id, data: { naam: data.naam, status: nieuweStatus } });
  }

  function nieuweRegel(opts: { hoofdstuk?: string; is_staartkosten?: boolean; is_bouwplaatskosten?: boolean; eenheid_id?: number | null }) {
    setNieuwDraft({
      ...LEEG_DRAFT,
      eenheid_id: opts.eenheid_id ?? null,
      hoofdstuk: opts.hoofdstuk ?? "Overige werkzaamheden",
      is_staartkosten: opts.is_staartkosten ?? false,
      is_bouwplaatskosten: opts.is_bouwplaatskosten ?? false,
    });
  }

  function openEenheidAanmaken() {
    setEenheidBewerken(null);
    setEenheidNaam("");
    setEenheidType("vrije_projecteenheid");
    setEenheidDialoogOpen(true);
  }

  function openEenheidBewerken(e: CalcEenheid) {
    setEenheidBewerken(e);
    setEenheidNaam(e.naam);
    setEenheidType(e.type);
    setEenheidDialoogOpen(true);
  }

  function slaEenheidOp() {
    if (!eenheidNaam.trim()) return;
    if (eenheidBewerken) {
      updateEenheidMut.mutate(
        { id, eenheidId: eenheidBewerken.id, data: { naam: eenheidNaam.trim(), type: eenheidType, volgorde: eenheidBewerken.volgorde } },
        { onSuccess: () => setEenheidDialoogOpen(false) },
      );
    } else {
      maakEenheidMut.mutate(
        { id, data: { naam: eenheidNaam.trim(), type: eenheidType, volgorde: eenheden.length } },
        { onSuccess: () => setEenheidDialoogOpen(false) },
      );
    }
  }

  function toggleEenheidIngeklapt(eid: number) {
    setIngeklapteEenheden((prev) => {
      const next = new Set(prev);
      if (next.has(eid)) next.delete(eid);
      else next.add(eid);
      return next;
    });
  }

  function bewaarNieuweRegel(payload: ReturnType<typeof draftToPayload>) {
    createRegelMut.mutate({ id, data: payload as any }, {
      onSettled: () => setNieuwDraft(null),
    });
  }

  function bewaarBestaandeRegel(regelId: number, payload: ReturnType<typeof draftToPayload>) {
    updateRegelMut.mutate({ id, regelId, data: payload as any });
  }

  function dupliceerRegel(rij: RegelRow) {
    createRegelMut.mutate({ id, data: draftToPayload(regelToDraft(rij)) as any });
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-[1500px] mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-center text-muted-foreground">Calculatie niet gevonden.</div>;
  }

  const regels: RegelRow[] = (data.regels ?? []) as RegelRow[];
  // ADVIES_01 §6: tekst/stelpost/kop tellen NOOIT mee; optioneel telt niet mee in
  // het aangeboden totaal maar wordt apart gesommeerd. Alle weergave-groepen tonen
  // alle regels; alleen de bedrag-sommeringen filteren op meetellende regels.
  const directeRegels    = regels.filter((r) => !r.is_staartkosten && !r.is_bouwplaatskosten).sort((a, b) => a.volgorde - b.volgorde);
  const bouwplaatsRegels = regels.filter((r) => r.is_bouwplaatskosten).sort((a, b) => a.volgorde - b.volgorde);
  const staartRegels     = regels.filter((r) => r.is_staartkosten).sort((a, b) => a.volgorde - b.volgorde);

  const directeMeetellend    = directeRegels.filter(teltMeeRegel).filter((r) => !r.optioneel);
  const bouwplaatsMeetellend = bouwplaatsRegels.filter(teltMeeRegel).filter((r) => !r.optioneel);
  const staartMeetellend     = staartRegels.filter(teltMeeRegel).filter((r) => !r.optioneel);
  const optioneelSubtotaal   = rnd(regels.filter((r) => teltMeeRegel(r) && r.optioneel).reduce((s, r) => s + r.totaal, 0));

  const matSubtotaal        = rnd(directeMeetellend.reduce((s, r) => s + r.materiaal_totaal, 0));
  const arbSubtotaal        = rnd(directeMeetellend.reduce((s, r) => s + r.arbeidsloon, 0));
  const oaSubtotaal         = rnd(directeMeetellend.reduce((s, r) => s + r.onderaanneming_bedrag, 0));
  const bouwplaatsSubtotaal = rnd(bouwplaatsMeetellend.reduce((s, r) => s + r.totaal, 0));
  const staartSubtotaal     = rnd(staartMeetellend.reduce((s, r) => s + r.totaal, 0));
  const opslagMateriaal     = data.opslag_materiaal ?? 0;
  const opslagArbeid        = data.opslag_arbeid ?? 0;
  const opslagAk            = data.opslag_ak;
  const opslagAbk           = (data as any).opslag_abk ?? 10;
  const opslagRisico        = data.opslag_risico;
  const opslagWinst         = data.opslag_winst;
  const akIsVast            = (data as any).ak_is_vast ?? false;
  const abkIsVast           = (data as any).abk_is_vast ?? false;
  const risicoIsVast        = (data as any).risico_is_vast ?? false;
  const winstIsVast         = (data as any).winst_is_vast ?? false;
  const matOpslagBedrag     = rnd(matSubtotaal * opslagMateriaal / 100);
  const arbOpslagBedrag     = rnd(arbSubtotaal * opslagArbeid / 100);
  const subtotaal           = rnd(matSubtotaal + matOpslagBedrag + arbSubtotaal + arbOpslagBedrag + oaSubtotaal + bouwplaatsSubtotaal + staartSubtotaal);
  const akBedrag            = akIsVast     ? rnd(opslagAk)    : rnd(subtotaal * opslagAk / 100);
  const abkBedrag           = abkIsVast    ? rnd(opslagAbk)   : rnd(subtotaal * opslagAbk / 100);
  const risicoBedrag        = risicoIsVast ? rnd(opslagRisico): rnd(subtotaal * opslagRisico / 100);
  const basisWinst          = rnd(subtotaal + akBedrag + abkBedrag + risicoBedrag);
  const winstBedrag         = winstIsVast  ? rnd(opslagWinst) : rnd(basisWinst * opslagWinst / 100);
  const aanneemsom          = rnd(basisWinst + winstBedrag);
  const kortingBedrag       = rnd(aanneemsom * data.korting / 100);
  const totaal              = rnd(aanneemsom - kortingBedrag);
  const totaalBtw           = rnd(totaal * 1.21);
  const rawKosten           = matSubtotaal + arbSubtotaal + oaSubtotaal + bouwplaatsSubtotaal + staartSubtotaal;
  const marge               = totaal > 0 ? Math.round(((totaal - rawKosten) / totaal) * 100 * 10) / 10 : 0;

  const volgendStatussen = STATUS_WORKFLOW[data.status] ?? [];

  // Herschikken: knoppen verplaatsen een regel binnen zijn hoofdstuk-groep;
  // de server verplaatst materiaalkinderen mee en hertelt 'volgorde'.
  const herschikProps = (groep: RegelRow[], r: RegelRow) => {
    const ids = new Set(groep.map((g) => g.id));
    const isKind = r.ouder_regel_id != null && ids.has(r.ouder_regel_id);
    const peers = isKind
      ? groep.filter((g) => g.ouder_regel_id === r.ouder_regel_id)
      : groep.filter((g) => !(g.ouder_regel_id != null && ids.has(g.ouder_regel_id)));
    const idx = peers.findIndex((g) => g.id === r.id);
    return {
      kanOmhoog: idx > 0,
      kanOmlaag: idx >= 0 && idx < peers.length - 1,
      onHerschik: (richting: "omhoog" | "omlaag") =>
        herschikRegelMut.mutate({ id, regelId: r.id, data: { richting } }),
    };
  };

  // Groepeer directe regels per hoofdstuk (in volgorde van HOOFDSTUK_OPTIES)
  const regelsByHoofdstuk = HOOFDSTUK_OPTIES
    .map((h) => ({ hoofdstuk: h, regels: ordenKinderenOnderOuder(directeRegels.filter((r) => (r.hoofdstuk ?? "Overige werkzaamheden") === h)) }))
    .filter((g) => g.regels.length > 0);

  // Groepeer directe regels per calculatie-eenheid
  const regelsByEenheid = eenheden.map((e) => {
    const eRegels = directeRegels.filter((r) => r.eenheid_id === e.id);
    const regelsPerHoofdstuk = HOOFDSTUK_OPTIES
      .map((h) => ({ hoofdstuk: h, regels: ordenKinderenOnderOuder(eRegels.filter((r) => (r.hoofdstuk ?? "Overige werkzaamheden") === h)) }))
      .filter((g) => g.regels.length > 0);
    const overigeRegels = ordenKinderenOnderOuder(eRegels.filter((r) => !HOOFDSTUK_OPTIES.includes(r.hoofdstuk ?? "")));
    const totaalMat  = rnd(eRegels.reduce((s, r) => s + r.materiaal_totaal, 0));
    const totaalArb  = rnd(eRegels.reduce((s, r) => s + r.arbeidsloon, 0));
    const totaalOa   = rnd(eRegels.reduce((s, r) => s + r.onderaanneming_bedrag, 0));
    const totaalKosten = rnd(totaalMat + totaalArb + totaalOa);
    return { eenheid: e, regels: eRegels, regelsPerHoofdstuk, overigeRegels, totaalMat, totaalArb, totaalOa, totaalKosten };
  });

  // Regels zonder eenheid (backward compat)
  const regelsZonderEenheid = directeRegels.filter((r) => !r.eenheid_id);
  const regelsZonderEenheidByHoofdstuk = HOOFDSTUK_OPTIES
    .map((h) => ({ hoofdstuk: h, regels: ordenKinderenOnderOuder(regelsZonderEenheid.filter((r) => (r.hoofdstuk ?? "Overige werkzaamheden") === h)) }))
    .filter((g) => g.regels.length > 0);
  const regelsZonderEenheidOverig = ordenKinderenOnderOuder(regelsZonderEenheid.filter((r) => !HOOFDSTUK_OPTIES.includes(r.hoofdstuk ?? "")));
  const bouwplaatsWeergave = ordenKinderenOnderOuder(bouwplaatsRegels);
  const staartWeergave = ordenKinderenOnderOuder(staartRegels);

  // Aantal kolommen voor HoofdstukBalk colSpan
  // intern: # + omschrijving + W/P + toepassing + aantal + eenh + mat/stk + mat.tot + norm + arb.tarief + arb.tot + [OA?] + totaal + acties
  const aantalKolommen = weergave === "intern" ? (toonOnderaanneming ? 14 : 13)
    : weergave === "directie" ? (toonOnderaanneming ? 11 : 10)
    : weergave === "klant" ? 4
    : 3; // monteur

  return (
    <div className="flex flex-col min-h-0" style={{ padding: "0" }}>
      {/* Koptekst */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/modules/calculatie")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {data.gebouw_id && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/gebouwen/${data.gebouw_id}`)}>
              <Building2 className="h-4 w-4 mr-1.5" />
              Terug naar project
            </Button>
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {data.referentie && (
                <span className="font-mono text-xs font-semibold tracking-wide text-muted-foreground bg-muted border border-border rounded px-2 py-0.5 select-all">
                  {data.referentie}
                </span>
              )}
              <h1 className="text-xl font-semibold text-foreground">{data.naam}</h1>
              {(data as any).kenmerk && (
                <span
                  className="font-mono text-xs font-semibold tracking-wide text-muted-foreground bg-muted border border-border rounded px-2 py-0.5 select-all"
                  title="Kenmerk (automatisch berekend, niet bewerkbaar)"
                >
                  {(data as any).kenmerk}
                </span>
              )}
              <Badge className={`text-xs border ${STATUS_KLEUR[data.status] ?? STATUS_KLEUR.concept}`}>
                {STATUS_LABEL[data.status] ?? data.status}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Procesbalk: proces in plaats van knoppen (herbruikbaar patroon) */}
          <ProcesBalk
            stappen={PROCES_STAPPEN}
            huidige={data.status === "gewonnen" ? "gewonnen" : data.status}
            eindtoestand={data.status === "verloren" ? "Verloren" : null}
          />
          {/* Eén knop voor de eerstvolgende stap (alleen met schrijfrecht) */}
          {kanSchrijven && data.status === "concept" && (
            <Button size="sm" onClick={() => handleStatusWijzigen("intern_akkoord")} data-testid="knop-volgende-stap">
              Intern akkoord
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
          {kanSchrijven && data.status === "intern_akkoord" && (offertes.length === 0 ? (
            <Button size="sm" onClick={() => maakOfferteMut.mutate({ id })} disabled={maakOfferteMut.isPending} data-testid="knop-volgende-stap">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              {maakOfferteMut.isPending ? "Bezig..." : "Maak offerte"}
            </Button>
          ) : (
            <Button size="sm" onClick={() => handleStatusWijzigen("aangeboden")} data-testid="knop-volgende-stap">
              Aangeboden
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          ))}
          {kanSchrijven && data.status === "aangeboden" && (
            <Button size="sm" onClick={() => handleStatusWijzigen("gewonnen")} data-testid="knop-volgende-stap">
              Gewonnen
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
          {kanSchrijven && data.status === "verloren" && (
            <Button variant="outline" size="sm" onClick={() => handleStatusWijzigen("concept")} data-testid="knop-volgende-stap">
              Heropenen als concept
            </Button>
          )}
          {/* Alle documentacties achter drie puntjes */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Meer acties" data-testid="knop-meer-acties">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {kanSchrijven && (
                <>
                  <DropdownMenuItem onClick={openBewerkenHeader}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Bewerken
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => dupliceerMut.mutate({ id })}>
                    <Copy className="h-3.5 w-3.5 mr-2" /> Dupliceren
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setVersieOpslaanDialoog(true)}>
                    <Save className="h-3.5 w-3.5 mr-2" /> Versie opslaan
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={() => setVersieDialoog(true)}>
                <History className="h-3.5 w-3.5 mr-2" /> Versies
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(`/modules/calculatie/${id}/print`, "_blank")}>
                <Printer className="h-3.5 w-3.5 mr-2" /> Afdrukken
              </DropdownMenuItem>
              {kanSchrijven && data.status !== "verloren" && data.status !== "gewonnen" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleStatusWijzigen("verloren")}>
                    <X className="h-3.5 w-3.5 mr-2" /> Markeer als verloren
                  </DropdownMenuItem>
                </>
              )}
              {kanVerwijderen && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setTeVerwijderen(true)}
                    data-testid="menu-verwijderen"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Verwijderen
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Projectgegevens strip */}
      {(data.referentie || (data as any).werknummer || data.klant_naam || data.project_naam || data.gebouw_naam || (data as any).opname_naam || data.aangemaakt_door_naam || bronbestand) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-2.5 border-b bg-muted/40 text-sm">
          {data.referentie && (
            <div className="flex gap-1.5 items-center">
              <span className="text-muted-foreground text-xs">Ref:</span>
              <span className="font-mono text-xs font-semibold text-foreground select-all">{data.referentie}</span>
            </div>
          )}
          {(data as any).werknummer && (
            <div className="flex gap-1.5 items-center">
              <span className="text-muted-foreground text-xs">Werknr:</span>
              <span className="font-mono text-xs font-semibold text-foreground select-all">{(data as any).werknummer}</span>
            </div>
          )}
          {data.klant_naam && (
            <div className="flex gap-1.5 items-center">
              <span className="text-muted-foreground text-xs">Klant:</span>
              <span className="font-medium">{data.klant_naam}</span>
            </div>
          )}
          {offertes.length > 0 && (
            <div className="flex gap-1.5 items-center">
              <span className="text-muted-foreground text-xs">Offerte aangemaakt:</span>
              {offertes.map((o: any) => (
                <Link key={o.id} href={`/offertes/${o.id}`} className="font-medium text-blue-600 hover:underline">
                  {o.offertenummer || `#${o.id}`}
                </Link>
              ))}
            </div>
          )}
          {data.project_naam && (
            <div className="flex gap-1.5 items-center">
              <span className="text-muted-foreground text-xs">Project:</span>
              <span className="font-medium">{data.project_naam}</span>
            </div>
          )}
          {data.gebouw_naam && (
            <div className="flex gap-1.5 items-center">
              <span className="text-muted-foreground text-xs">Gebouw:</span>
              <span className="font-medium">{data.gebouw_naam}</span>
            </div>
          )}
          {(data as any).opname_naam && (
            <div className="flex gap-1.5 items-center">
              <span className="text-muted-foreground text-xs">Opname:</span>
              <span className="font-medium">{(data as any).opname_naam}</span>
            </div>
          )}
          {adviesBronnen.map((doc: any) => (
            <div key={doc.id} className="flex gap-1.5 items-center">
              <span className="text-muted-foreground text-xs">Bron: adviesrapport</span>
              <Link href={`/documenten/${doc.id}`} className="font-medium text-blue-600 hover:underline" title="Open het adviesrapport in de bibliotheek">
                {doc.naam}
              </Link>
            </div>
          ))}
          {bronbestand && (
            <div className="flex gap-1.5 items-center">
              <span className="text-muted-foreground text-xs">Geïmporteerd uit:</span>
              <Link href="/modules/calculatie/import" className="font-medium text-blue-600 hover:underline" title="Naar bronbestanden-bibliotheek">
                {bronbestand.bestandsnaam}
              </Link>
              {bronbestand.calculatienummer && (
                <span className="font-mono text-xs text-muted-foreground">({bronbestand.calculatienummer})</span>
              )}
            </div>
          )}
          {data.aangemaakt_door_naam && (
            <div className="flex gap-1.5 items-center ml-auto">
              <span className="text-muted-foreground text-xs">Calculator:</span>
              <span className="font-medium">{data.aangemaakt_door_naam}</span>
            </div>
          )}
        </div>
      )}

      {/* Hoofd lay-out: spreadsheet links, zijpaneel rechts */}
      <div className="flex flex-1 min-h-0 gap-0">

        {/* === Spreadsheet === */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 p-3">
          {/* Rekenblad in eigen omkaderd vlak met lichte achtergrondtint;
              alle handelingen op het blad horen binnen dit kader. */}
          <div className="flex flex-col flex-1 min-h-0 rounded-lg border bg-muted/20 overflow-hidden" data-testid="rekenblad-kader">

          {/* Spreadsheet toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b bg-background/60 gap-3 shrink-0">
            {/* Weergave tabs */}
            <div className="flex rounded-md border overflow-hidden text-xs">
              {(["intern", "directie", "klant", "monteur"] as Weergave[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setWeergave(v)}
                  className={cn(
                    "px-3 py-1.5 flex items-center gap-1.5 transition-colors",
                    weergave === v ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  {v === "intern" && <LayoutList className="h-3 w-3" />}
                  {v === "directie" && <Eye className="h-3 w-3" />}
                  {v === "klant" && <Users className="h-3 w-3" />}
                  {v === "monteur" && <Wrench className="h-3 w-3" />}
                  {v === "intern" ? "Intern" : v === "directie" ? "Directie" : v === "klant" ? "Klant" : "Monteur"}
                </button>
              ))}
            </div>
            {weergave === "intern" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setToonOnderaanneming((v) => !v)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded border transition-colors",
                    toonOnderaanneming
                      ? "bg-primary/10 text-primary border-primary/30 font-medium"
                      : "bg-background text-muted-foreground border-border hover:border-muted-foreground/40"
                  )}
                >
                  Onderaanneming
                </button>
                <span className="text-xs text-muted-foreground hidden sm:block">Klik op een cel om te bewerken &bull; Enter bevestigt</span>
                <Button variant="outline" size="sm" onClick={openEenheidAanmaken}>
                  <Building2 className="h-3.5 w-3.5 mr-1.5" />
                  Eenheid
                </Button>
                <Button size="sm" onClick={() => nieuweRegel({})}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Regel toevoegen
                </Button>
              </div>
            )}
          </div>

          {/* Spreadsheet tabel of andere weergave */}
          {(weergave === "intern" || weergave === "directie") ? (
            <div className="overflow-auto flex-1 min-h-0 pb-14">
              <table className="w-full text-sm border-collapse" style={{ minWidth: weergave === "intern" ? 1300 : 900 }}>
                <thead className="sticky top-0 z-10">
                  <tr>
                    <Th className="w-8 text-right">#</Th>
                    <Th className="min-w-[220px]">Omschrijving</Th>
                    {(weergave === "intern" || weergave === "directie") && <Th className="w-[68px] text-center">W / P</Th>}
                    {(weergave === "intern" || weergave === "directie") && <Th className="w-[148px]">Toepassing</Th>}
                    <Th className="w-[72px] text-right">Aantal</Th>
                    <Th className="w-[58px] text-center">Eenh</Th>
                    {(weergave === "intern" || weergave === "directie") && <Th className="w-[96px] text-right">Mat. / stk</Th>}
                    {(weergave === "intern" || weergave === "directie") && <Th className="w-[96px] text-right">Mat. totaal</Th>}
                    {(weergave === "intern" || weergave === "directie") && <Th className="w-[80px] text-right">Norm u/stk</Th>}
                    {weergave === "intern" && <Th className="w-[92px] text-right">Arb. tarief</Th>}
                    {(weergave === "intern" || weergave === "directie") && <Th className="w-[96px] text-right">Arb. totaal</Th>}
                    {toonOnderaanneming && (weergave === "intern" || weergave === "directie") && <Th className="w-[96px] text-right">Onderaann.</Th>}
                    <Th className="w-[104px] text-right">Totaal</Th>
                    {weergave === "intern" && <Th className="w-12"></Th>}
                  </tr>
                </thead>
                <tbody>
                  {regels.length === 0 && !nieuwDraft ? (
                    <tr>
                      <td colSpan={aantalKolommen} className="px-6 py-16 text-center text-muted-foreground">
                        <p className="text-sm mb-3">Nog geen regels. Klik op Regel toevoegen om te beginnen.</p>
                        {weergave === "intern" && (
                          <Button size="sm" variant="outline" onClick={() => nieuweRegel({})}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            Eerste regel toevoegen
                          </Button>
                        )}
                      </td>
                    </tr>
                  ) : null}

                  {/* Calculatie-eenheden met hun regels */}
                  {regelsByEenheid.map(({ eenheid: e, regelsPerHoofdstuk, overigeRegels, totaalMat, totaalArb, totaalOa, totaalKosten }) => (
                    <React.Fragment key={`eenheid-${e.id}`}>
                      <EenheidBalk
                        eenheid={e}
                        aantalKolommen={aantalKolommen}
                        weergave={weergave}
                        ingeklapt={ingeklapteEenheden.has(e.id)}
                        totaalMat={totaalMat}
                        totaalArb={totaalArb}
                        totaalOa={totaalOa}
                        totaalKosten={totaalKosten}
                        onToggle={() => toggleEenheidIngeklapt(e.id)}
                        onBewerken={() => openEenheidBewerken(e)}
                        onVerwijderen={() => verwijderEenheidMut.mutate({ id, eenheidId: e.id })}
                        onRegelToevoegen={() => nieuweRegel({ eenheid_id: e.id })}
                      />
                      {!ingeklapteEenheden.has(e.id) && (
                        <>
                          {regelsPerHoofdstuk.map(({ hoofdstuk, regels: hRegels }) => (
                            <React.Fragment key={`e${e.id}-hst-${hoofdstuk}`}>
                              <HoofdstukBalk
                                naam={hoofdstuk}
                                aantalKolommen={aantalKolommen}
                                weergave={weergave}
                                onToevoegen={() => nieuweRegel({ hoofdstuk, eenheid_id: e.id })}
                              />
                              {hRegels.map((r) => (
                                <SpreadsheetRegelRij
                                  key={r.id}
                                  rij={r}
                                  weergave={weergave}
                                  onSave={bewaarBestaandeRegel}
                                  onDelete={(rid) => deleteRegelMut.mutate({ id, regelId: rid })}
                                  onDuplicate={dupliceerRegel}
                                  onEnterNaRegel={(hs, isSt, isBp) => nieuweRegel({ hoofdstuk: hs, is_staartkosten: isSt, is_bouwplaatskosten: isBp, eenheid_id: e.id })}
                                  bezig={updateRegelMut.isPending || deleteRegelMut.isPending}
                                  toonOnderaanneming={toonOnderaanneming}
                                  tarieven={[]}
                                  ouderOpties={ouderOptiesVoor(hRegels, r.id)}
                                  {...herschikProps(hRegels, r)}
                                />
                              ))}
                            </React.Fragment>
                          ))}
                          {overigeRegels.length > 0 && (
                            <>
                              <HoofdstukBalk
                                naam="Overige werkzaamheden"
                                aantalKolommen={aantalKolommen}
                                weergave={weergave}
                                onToevoegen={() => nieuweRegel({ hoofdstuk: "Overige werkzaamheden", eenheid_id: e.id })}
                              />
                              {overigeRegels.map((r) => (
                                <SpreadsheetRegelRij
                                  key={r.id}
                                  rij={r}
                                  weergave={weergave}
                                  onSave={bewaarBestaandeRegel}
                                  onDelete={(rid) => deleteRegelMut.mutate({ id, regelId: rid })}
                                  onDuplicate={dupliceerRegel}
                                  onEnterNaRegel={(hs, isSt, isBp) => nieuweRegel({ hoofdstuk: hs, is_staartkosten: isSt, is_bouwplaatskosten: isBp, eenheid_id: e.id })}
                                  bezig={updateRegelMut.isPending || deleteRegelMut.isPending}
                                  toonOnderaanneming={toonOnderaanneming}
                                  tarieven={[]}
                                  ouderOpties={ouderOptiesVoor(overigeRegels, r.id)}
                                  {...herschikProps(overigeRegels, r)}
                                />
                              ))}
                            </>
                          )}
                        </>
                      )}
                    </React.Fragment>
                  ))}

                  {/* Regels zonder eenheid (backward compat of als er geen eenheden zijn) */}
                  {(eenheden.length === 0 ? regelsByHoofdstuk : regelsZonderEenheidByHoofdstuk).map(({ hoofdstuk, regels: hRegels }) => (
                    <React.Fragment key={`hst-${hoofdstuk}`}>
                      <HoofdstukBalk
                        naam={hoofdstuk}
                        aantalKolommen={aantalKolommen}
                        weergave={weergave}
                        onToevoegen={() => nieuweRegel({ hoofdstuk })}
                      />
                      {hRegels.map((r) => (
                        <SpreadsheetRegelRij
                          key={r.id}
                          rij={r}
                          weergave={weergave}
                          onSave={bewaarBestaandeRegel}
                          onDelete={(rid) => deleteRegelMut.mutate({ id, regelId: rid })}
                          onDuplicate={dupliceerRegel}
                          onEnterNaRegel={(hs, isSt, isBp) => nieuweRegel({ hoofdstuk: hs, is_staartkosten: isSt, is_bouwplaatskosten: isBp })}
                          bezig={updateRegelMut.isPending || deleteRegelMut.isPending}
                          toonOnderaanneming={toonOnderaanneming}
                          tarieven={[]}
                          ouderOpties={ouderOptiesVoor(hRegels, r.id)}
                          {...herschikProps(hRegels, r)}
                        />
                      ))}
                    </React.Fragment>
                  ))}

                  {/* Overige directe regels zonder hoofdstuk en zonder eenheid */}
                  {(eenheden.length === 0
                    ? ordenKinderenOnderOuder(directeRegels.filter((r) => !HOOFDSTUK_OPTIES.includes(r.hoofdstuk ?? "")))
                    : regelsZonderEenheidOverig
                  ).length > 0 && (
                    <>
                      <HoofdstukBalk
                        naam="Overige werkzaamheden"
                        aantalKolommen={aantalKolommen}
                        weergave={weergave}
                        onToevoegen={() => nieuweRegel({ hoofdstuk: "Overige werkzaamheden" })}
                      />
                      {(eenheden.length === 0
                        ? ordenKinderenOnderOuder(directeRegels.filter((r) => !HOOFDSTUK_OPTIES.includes(r.hoofdstuk ?? "")))
                        : regelsZonderEenheidOverig
                      ).map((r) => (
                        <SpreadsheetRegelRij
                          key={r.id}
                          rij={r}
                          weergave={weergave}
                          onSave={bewaarBestaandeRegel}
                          onDelete={(rid) => deleteRegelMut.mutate({ id, regelId: rid })}
                          onDuplicate={dupliceerRegel}
                          onEnterNaRegel={(hs, isSt, isBp) => nieuweRegel({ hoofdstuk: hs, is_staartkosten: isSt, is_bouwplaatskosten: isBp })}
                          bezig={updateRegelMut.isPending || deleteRegelMut.isPending}
                          toonOnderaanneming={toonOnderaanneming}
                          tarieven={[]}
                          ouderOpties={ouderOptiesVoor(directeRegels, r.id)}
                          {...herschikProps(
                            eenheden.length === 0
                              ? directeRegels.filter((x) => !HOOFDSTUK_OPTIES.includes(x.hoofdstuk ?? ""))
                              : regelsZonderEenheidOverig,
                            r
                          )}
                        />
                      ))}
                    </>
                  )}

                  {/* Bouwplaatskosten */}
                  {bouwplaatsRegels.length > 0 && (
                    <>
                      <HoofdstukBalk
                        naam="Bouwplaatskosten"
                        aantalKolommen={aantalKolommen}
                        weergave={weergave}
                        onToevoegen={() => nieuweRegel({ is_bouwplaatskosten: true })}
                      />
                      {bouwplaatsWeergave.map((r) => (
                        <SpreadsheetRegelRij
                          key={r.id}
                          rij={r}
                          weergave={weergave}
                          onSave={bewaarBestaandeRegel}
                          onDelete={(rid) => deleteRegelMut.mutate({ id, regelId: rid })}
                          onDuplicate={dupliceerRegel}
                          onEnterNaRegel={(_hs, _isSt, _isBp) => nieuweRegel({ is_bouwplaatskosten: true })}
                          bezig={updateRegelMut.isPending || deleteRegelMut.isPending}
                          toonOnderaanneming={toonOnderaanneming}
                          tarieven={[]}
                          ouderOpties={ouderOptiesVoor(bouwplaatsRegels, r.id)}
                          {...herschikProps(bouwplaatsWeergave, r)}
                        />
                      ))}
                    </>
                  )}

                  {/* Staartkosten */}
                  {staartRegels.length > 0 && (
                    <>
                      <HoofdstukBalk
                        naam="Staartkosten"
                        aantalKolommen={aantalKolommen}
                        weergave={weergave}
                        onToevoegen={() => nieuweRegel({ is_staartkosten: true })}
                      />
                      {staartWeergave.map((r) => (
                        <SpreadsheetRegelRij
                          key={r.id}
                          rij={r}
                          weergave={weergave}
                          onSave={bewaarBestaandeRegel}
                          onDelete={(rid) => deleteRegelMut.mutate({ id, regelId: rid })}
                          onDuplicate={dupliceerRegel}
                          onEnterNaRegel={(_hs, _isSt, _isBp) => nieuweRegel({ is_staartkosten: true })}
                          bezig={updateRegelMut.isPending || deleteRegelMut.isPending}
                          toonOnderaanneming={toonOnderaanneming}
                          tarieven={[]}
                          ouderOpties={ouderOptiesVoor(staartRegels, r.id)}
                          {...herschikProps(staartWeergave, r)}
                        />
                      ))}
                    </>
                  )}

                  {/* Nieuw rij invoer */}
                  {nieuwDraft && (
                    <NieuweRegelRij
                      initialDraft={nieuwDraft}
                      weergave={weergave}
                      onSave={bewaarNieuweRegel}
                      onCancel={() => setNieuwDraft(null)}
                      bezig={createRegelMut.isPending}
                      toonOnderaanneming={toonOnderaanneming}
                      tarieven={[]}
                      ouderOpties={ouderOptiesVoor(directeRegels, -1)}
                    />
                  )}

                  {/* Regel toevoegen rij */}
                  {weergave === "intern" && (
                    <tr className="border-t border-border/60 bg-muted/30">
                      <td colSpan={aantalKolommen} className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50 mr-1">Toevoegen</span>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary/80 hover:text-primary hover:bg-primary/5 font-medium" onClick={() => nieuweRegel({})}>
                            <Plus className="h-3 w-3" />
                            Directe regel
                          </Button>
                          <span className="text-border/60 select-none">|</span>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={() => nieuweRegel({ is_bouwplaatskosten: true })}>
                            <Plus className="h-3 w-3" />
                            Bouwplaatskosten
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={() => nieuweRegel({ is_staartkosten: true })}>
                            <Plus className="h-3 w-3" />
                            Staartkosten
                          </Button>
                          <span className="text-border/60 select-none">|</span>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary/70 hover:text-primary hover:bg-primary/5" onClick={() => setBibliotheekOpen(true)}>
                            <BookOpen className="h-3 w-3" />
                            Uit bibliotheek
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Directie kostoverzicht tabel als extra */}
              {weergave === "directie" && (
                <div className="border-t">
                  <DirectieView
                    directeRegels={directeRegels}
                    bouwplaatsRegels={bouwplaatsRegels}
                    staartRegels={staartRegels}
                    matSubtotaal={matSubtotaal}
                    matOpslagBedrag={matOpslagBedrag}
                    opslagMateriaal={opslagMateriaal}
                    arbSubtotaal={arbSubtotaal}
                    arbOpslagBedrag={arbOpslagBedrag}
                    opslagArbeid={opslagArbeid}
                    oaSubtotaal={oaSubtotaal}
                    bouwplaatsSubtotaal={bouwplaatsSubtotaal}
                    staartSubtotaal={staartSubtotaal}
                    subtotaal={subtotaal}
                    akBedrag={akBedrag}
                    abkBedrag={abkBedrag}
                    risicoBedrag={risicoBedrag}
                    basisWinst={basisWinst}
                    winstBedrag={winstBedrag}
                    kortingBedrag={kortingBedrag}
                    totaal={totaal}
                    marge={marge}
                    optioneelSubtotaal={optioneelSubtotaal}
                    opslagAk={opslagAk}
                    opslagAbk={opslagAbk}
                    opslagRisico={opslagRisico}
                    opslagWinst={opslagWinst}
                    korting={data.korting}
                    akIsVast={akIsVast}
                    abkIsVast={abkIsVast}
                    risicoIsVast={risicoIsVast}
                    winstIsVast={winstIsVast}
                  />
                </div>
              )}
            </div>
          ) : weergave === "klant" ? (
            <KlantView regels={regels} totaal={totaal} totaalBtw={totaalBtw} optioneelTotaal={optioneelSubtotaal} />
          ) : (
            <MonteurView regels={regels} />
          )}
          </div>
        </div>

        {/* === Zijpaneel: twee kaarten (Financieel + AI-hulp) === */}
        <div className="w-72 shrink-0 border-l bg-muted/20 flex flex-col gap-3 overflow-y-auto pb-14 p-3">

          {/* Kaart Financieel — accent in de kleur van hoofdstuk Financieel (NAV_01) */}
          <div
            className="rounded-lg border bg-background shadow-sm overflow-hidden"
            style={{ borderTop: "3px solid hsl(var(--hoofdstuk-financieel))" }}
            data-testid="kaart-financieel"
          >
            <div className="px-4 pt-3 pb-2 flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: "hsl(var(--hoofdstuk-financieel))" }} />
              <h3 className="text-sm font-semibold">Financieel</h3>
            </div>
            {/* Totaal incl. btw = grootste element; marge = tweede signaal */}
            <div className="px-4 pb-3">
              <p className="text-xs text-muted-foreground">Totaal incl. BTW</p>
              <p className="text-2xl font-bold tabular-nums" data-testid="totaal-incl-btw">{formatBedragKort(totaalBtw)}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Marge <span className="font-semibold text-foreground">{marge}%</span>
              </p>
            </div>

            {/* Kostopbouw */}
            <div className="px-4 py-3 border-t space-y-1.5 text-sm">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Kostopbouw</h4>
            <div className="flex justify-between text-muted-foreground">
              <span>Materiaal</span>
              <span className="tabular-nums">{formatBedrag(matSubtotaal)}</span>
            </div>
            {opslagMateriaal > 0 && (
              <div className="flex justify-between text-muted-foreground pl-3 text-xs">
                <span>+ Opslag ({opslagMateriaal}%)</span>
                <span className="tabular-nums">{formatBedrag(matOpslagBedrag)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Arbeid</span>
              <span className="tabular-nums">{formatBedrag(arbSubtotaal)}</span>
            </div>
            {opslagArbeid > 0 && (
              <div className="flex justify-between text-muted-foreground pl-3 text-xs">
                <span>+ Opslag ({opslagArbeid}%)</span>
                <span className="tabular-nums">{formatBedrag(arbOpslagBedrag)}</span>
              </div>
            )}
            {oaSubtotaal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Onderaanneming</span>
                <span className="tabular-nums">{formatBedrag(oaSubtotaal)}</span>
              </div>
            )}
            {bouwplaatsSubtotaal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Bouwplaatskosten</span>
                <span className="tabular-nums">{formatBedrag(bouwplaatsSubtotaal)}</span>
              </div>
            )}
            {staartSubtotaal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Staartkosten</span>
                <span className="tabular-nums">{formatBedrag(staartSubtotaal)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-medium">
              <span>Subtotaal</span>
              <span className="tabular-nums">{formatBedrag(subtotaal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>AK ({opslagAk}%)</span>
              <span className="tabular-nums">{formatBedrag(akBedrag)}</span>
            </div>
            {(opslagAbk > 0 || abkIsVast) && (
              <div className="flex justify-between text-muted-foreground">
                <span>ABK ({opslagAbk}%)</span>
                <span className="tabular-nums">{formatBedrag(abkBedrag)}</span>
              </div>
            )}
            {opslagRisico > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Risico ({opslagRisico}%)</span>
                <span className="tabular-nums">{formatBedrag(risicoBedrag)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-muted-foreground border-t pt-1">
              <span>Basis voor winst</span>
              <span className="tabular-nums">{formatBedrag(basisWinst)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Winst ({opslagWinst}%)</span>
              <span className="tabular-nums">{formatBedrag(winstBedrag)}</span>
            </div>
            {data.korting > 0 && (
              <div className="flex justify-between text-green-700 dark:text-green-400">
                <span>Korting ({data.korting}%)</span>
                <span className="tabular-nums">- {formatBedrag(kortingBedrag)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-medium">
              <span>Totaal excl. BTW</span>
              <span className="tabular-nums">{formatBedrag(totaal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>BTW (21%)</span>
              <span className="tabular-nums">{formatBedrag(totaalBtw - totaal)}</span>
            </div>
            {optioneelSubtotaal > 0 && (
              <div className="flex justify-between items-center text-xs pt-1 border-t">
                <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                  <Badge variant="outline" className="text-[9px] border-blue-300 text-blue-700 dark:text-blue-400">optioneel</Badge>
                  Niet in aanneemsom
                </span>
                <span className="tabular-nums font-medium text-blue-700 dark:text-blue-400">{formatBedrag(optioneelSubtotaal)}</span>
              </div>
            )}
            </div>

            {/* Bedrijfskompas hoort in de kaart Financieel */}
            <div className="border-t">
              <FieContextBlok calculatieId={id} />
            </div>
          </div>

          {/* Kaart AI-hulp — één hoofdactie, inleesacties als kleinere regels */}
          <div className="rounded-lg border bg-background shadow-sm" data-testid="kaart-ai-hulp">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-500" />
                AI-hulp
              </h3>
              {aiPaneel && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAiPaneel(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {!aiPaneel ? (
              <Button variant="outline" className="w-full" size="sm"
                onClick={() => aiMut.mutate({ id })} disabled={aiMut.isPending}>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {aiMut.isPending ? "Analyseren..." : "Genereer AI-voorstel"}
              </Button>
            ) : (
              <div className="space-y-2">
                {aiWaarschuwingen.length > 0 && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-xs space-y-1">
                    {aiWaarschuwingen.map((w, i) => (
                      <p key={i} className="text-amber-700">{w}</p>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{aiVoorstellen.length} regels</p>
                  <Button variant="outline" size="sm" className="h-6 text-xs px-2"
                    disabled={createRegelMut.isPending}
                    onClick={() => {
                      aiVoorstellen.forEach((r) => createRegelMut.mutate({ id, data: {
                        categorie: r.categorie, omschrijving: r.omschrijving, eenheid: r.eenheid,
                        hoeveelheid: parseFloat(r.hoeveelheid) || 1, tarief: parseFloat(r.tarief) || 0,
                        mu_per_eenheid: parseFloat(r.mu_per_eenheid) || 0,
                        arbeids_tarief: parseFloat(r.arbeids_tarief) || 0,
                        onderaanneming_bedrag: parseFloat(r.onderaanneming_bedrag) || 0,
                        is_staartkosten: r.is_staartkosten, is_bouwplaatskosten: r.is_bouwplaatskosten,
                        hoofdstuk: r.hoofdstuk, klanttekst: r.klanttekst || null,
                      } as any }));
                    }}>
                    Voeg alles toe
                  </Button>
                </div>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {aiVoorstellen.map((r, i) => (
                    <div key={i} className="flex items-start gap-1.5 p-1.5 rounded border text-xs hover:bg-muted/40 group/ai">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground leading-tight truncate">{r.omschrijving}</p>
                        <p className="text-muted-foreground text-[10px]">{r.hoeveelheid} {r.eenheid} &bull; {CATEGORIE_LABEL[r.categorie] ?? r.categorie}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 text-green-600 opacity-0 group-hover/ai:opacity-100"
                        onClick={() => createRegelMut.mutate({ id, data: {
                          categorie: r.categorie, omschrijving: r.omschrijving, eenheid: r.eenheid,
                          hoeveelheid: parseFloat(r.hoeveelheid) || 1, tarief: parseFloat(r.tarief) || 0,
                          mu_per_eenheid: parseFloat(r.mu_per_eenheid) || 0,
                          arbeids_tarief: parseFloat(r.arbeids_tarief) || 0,
                          onderaanneming_bedrag: parseFloat(r.onderaanneming_bedrag) || 0,
                          is_staartkosten: r.is_staartkosten, is_bouwplaatskosten: r.is_bouwplaatskosten,
                          hoofdstuk: r.hoofdstuk, klanttekst: r.klanttekst || null,
                        } as any })}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="w-full text-xs"
                  onClick={() => aiMut.mutate({ id })} disabled={aiMut.isPending}>
                  <Sparkles className="h-3 w-3 mr-1" />
                  Opnieuw genereren
                </Button>
              </div>
            )}
            {/* Inleesacties als kleinere regels onder de hoofdactie */}
            {/* CALC_INVOER_01 — plakken van leverancier */}
            <PlakInvoer calculatieId={id} onOvergenomen={invalidate} />
            {/* ADVIES_01 — adviesrapport uitlezen en per punt inrichten */}
            <AdviesInrichten
              calculatieId={id}
              openDocumentId={adviesDocumentId}
              onAfgehandeld={ruimAdviesParamOp}
              onOvergenomen={invalidate}
            />
            {/* Panelen: Senior-calculator en AI-chat als kleine regels */}
            <div className="mt-3 pt-3 border-t space-y-1">
              <button
                type="button"
                onClick={() => setSeniorOpen((v) => !v)}
                className={cn(
                  "w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors text-left",
                  seniorOpen ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <BrainCircuit className="h-3.5 w-3.5 shrink-0" />
                Senior-calculator {seniorOpen ? "sluiten" : "openen"}
              </button>
              <button
                type="button"
                onClick={() => setChatOpen((v) => !v)}
                className={cn(
                  "w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors text-left",
                  chatOpen ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                AI-chat {chatOpen ? "sluiten" : "openen"}
              </button>
            </div>
          </div>
          </div>

          {data.opmerkingen && (
            <div className="rounded-lg border bg-background shadow-sm p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Opmerkingen</p>
              <p className="text-xs text-muted-foreground">{data.opmerkingen}</p>
            </div>
          )}
        </div>

        {/* === AI Senior Calculator paneel === */}
        {seniorOpen && (
          <div className="w-[360px] shrink-0 border-l bg-background flex flex-col min-h-0 overflow-hidden">
            <AiSeniorCalculatorPanel calculatieId={id} />
          </div>
        )}

        {/* === AI-chatpaneel === */}
        {chatOpen && (
          <div className="w-[400px] shrink-0 flex flex-col min-h-0 overflow-hidden">
            <AiChatPanel
              onVerstuur={async (berichten, afbeelding_base64) =>
                aiChatMut.mutateAsync({ id, data: { berichten, afbeelding_base64: afbeelding_base64 ?? undefined } })
              }
              className="flex-1"
              snelleActies={[
                "Is deze calculatie volledig voor dit type project?",
                "Kloppen de eenheden en hoeveelheden?",
                "Zijn de urennormen realistisch?",
                "Ontbreken er materiaal- of arbeidsregels?",
                "Wat zijn de risico's op meerwerk?",
              ]}
              placeholder="Stel een vraag over volledigheid, eenheden, arbeids- of materiaalnormen..."
            />
          </div>
        )}
      </div>

      {/* ── Inkoopregels ────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-t">
        <InkoopregelsKaart
          calculatieId={id}
          items={inkoopItems as ModCalcInkoopItem[]}
          nieuwOpen={inkoopNieuwOpen}
          setNieuwOpen={setInkoopNieuwOpen}
          form={inkoopForm}
          setForm={setInkoopForm}
          bewerken={inkoopBewerken}
          setBewerken={setInkoopBewerken}
          onAanmaken={(d) => maakInkoopItemMut.mutate(
            { id, data: d as any },
            { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListModCalcInkoopItemsQueryKey(id) }); setInkoopNieuwOpen(false); setInkoopForm(leegInkoopForm); } }
          )}
          onStatusWijzigen={(itemId, status) => updateInkoopItemMut.mutate(
            { id, itemId, data: { status } },
            { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListModCalcInkoopItemsQueryKey(id) }) }
          )}
          onOpslaan={(itemId, d) => updateInkoopItemMut.mutate(
            { id, itemId, data: d },
            { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListModCalcInkoopItemsQueryKey(id) }); setInkoopBewerken(null); } }
          )}
          onVerwijderen={(itemId) => verwijderInkoopItemMut.mutate(
            { id, itemId },
            { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListModCalcInkoopItemsQueryKey(id) }) }
          )}
        />
      </div>

      {/* ── Dialogen ─────────────────────────────────────────────────────────── */}

      {/* Calculatie bewerken */}
      <Dialog open={bewerkenDialoog} onOpenChange={setBewerkenDialoog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Calculatie bewerken</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Naam</Label>
                <Input value={headerForm.naam} onChange={(e) => setHeaderForm((f) => ({ ...f, naam: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Referentie</Label>
                <Input value={headerForm.referentie} onChange={(e) => setHeaderForm((f) => ({ ...f, referentie: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Werknummer</Label>
                <Input value={headerForm.werknummer} placeholder="Bijv. W-2024-001" onChange={(e) => setHeaderForm((f) => ({ ...f, werknummer: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Klant</Label>
                <Input value={headerForm.klant_naam} onChange={(e) => setHeaderForm((f) => ({ ...f, klant_naam: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Input value={headerForm.project_naam} onChange={(e) => setHeaderForm((f) => ({ ...f, project_naam: e.target.value }))} />
              </div>
              {gebouwIdVoorOpnames && (
                <div className="space-y-1.5 col-span-2">
                  <Label>Opname koppelen (optioneel)</Label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={headerForm.opname_id ?? ""}
                    onChange={(e) => setHeaderForm((f) => ({ ...f, opname_id: e.target.value ? Number(e.target.value) : null }))}
                  >
                    <option value="">Geen opname gekoppeld</option>
                    {(opnamesVoorBewerken ?? []).map((o) => (
                      <option key={o.id} value={o.id}>{o.naam}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Textarea value={headerForm.omschrijving} onChange={(e) => setHeaderForm((f) => ({ ...f, omschrijving: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Opmerkingen (intern)</Label>
              <Textarea value={headerForm.opmerkingen} onChange={(e) => setHeaderForm((f) => ({ ...f, opmerkingen: e.target.value }))} rows={2} />
            </div>
            <Separator />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Opslagen</p>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {[
                { label: "AK (%)",    field: "opslag_ak" as const,    vastField: "ak_is_vast" as const },
                { label: "ABK (%)",   field: "opslag_abk" as const,   vastField: "abk_is_vast" as const },
                { label: "Risico (%)",field: "opslag_risico" as const, vastField: "risico_is_vast" as const },
                { label: "Winst (%)", field: "opslag_winst" as const,  vastField: "winst_is_vast" as const },
                { label: "Mat opslag (%)", field: "opslag_materiaal" as const, vastField: null },
                { label: "Arb opslag (%)", field: "opslag_arbeid" as const, vastField: null },
                { label: "Korting (%)",    field: "korting" as const,         vastField: null },
              ].map(({ label, field, vastField }) => (
                <div key={field} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number" step="0.1"
                    value={headerForm[field]}
                    onChange={(e) => setHeaderForm((f) => ({ ...f, [field]: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBewerkenDialoog(false)}>Annuleren</Button>
            <Button onClick={handleHeaderOpslaan}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Versie opslaan */}
      <Dialog open={versieOpslaanDialoog} onOpenChange={setVersieOpslaanDialoog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Versie opslaan</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Versielabel (optioneel)</Label>
            <Input
              value={versieLabel}
              onChange={(e) => setVersieLabel(e.target.value)}
              placeholder="bijv. Na klantbespreking v2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVersieOpslaanDialoog(false)}>Annuleren</Button>
            <Button onClick={handleVersieOpslaan} disabled={versieOpslaanBezig}>
              {versieOpslaanBezig ? "Opslaan..." : "Versie opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Versiegeschiedenis */}
      <Dialog open={versieDialoog} onOpenChange={setVersieDialoog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Versiegeschiedenis</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto py-2">
            {!versieData ? (
              <p className="text-sm text-muted-foreground text-center py-4">Laden...</p>
            ) : versieData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nog geen versies opgeslagen.</p>
            ) : (
              versieData.map((v) => (
                <div key={v.id} className="flex items-center gap-3 p-3 rounded-md border hover:bg-muted/40">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">Versie {v.versienummer}{v.label && ` — ${v.label}`}</p>
                    <p className="text-xs text-muted-foreground">{new Date(v.aangemaakt_op).toLocaleString("nl-NL")}</p>
                  </div>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => fetch(`/api/modules/calculaties/${id}/versie-terugzetten`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ versie_id: v.id }),
                    }).then(() => { invalidate(); setVersieDialoog(false); })}
                  >
                    Terugzetten
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Eenheid aanmaken / bewerken */}
      <Dialog open={eenheidDialoogOpen} onOpenChange={setEenheidDialoogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{eenheidBewerken ? "Eenheid bewerken" : "Eenheid toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Naam</label>
              <input
                type="text"
                value={eenheidNaam}
                onChange={(e) => setEenheidNaam(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") slaEenheidOp(); }}
                placeholder="bijv. Woning A"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <Select value={eenheidType} onValueChange={setEenheidType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EENHEID_TYPE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEenheidDialoogOpen(false)}>Annuleren</Button>
            <Button onClick={slaEenheidOp} disabled={!eenheidNaam.trim() || maakEenheidMut.isPending || updateEenheidMut.isPending}>
              {eenheidBewerken ? "Opslaan" : "Toevoegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verwijderen */}
      <AlertDialog open={teVerwijderen} onOpenChange={setTeVerwijderen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Calculatie verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle regels en versies van deze calculatie worden permanent verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMut.mutate({ id })}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Eenheidsprijzenbibliotheek picker */}
      <Dialog open={bibliotheekOpen} onOpenChange={(o) => { setBibliotheekOpen(o); if (!o) { setBibliotheekZoek(""); } }}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Kies uit eenheidsprijzenbibliotheek
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={bibliotheekZoek}
                onChange={(e) => setBibliotheekZoek(e.target.value)}
                placeholder="Zoeken op code of omschrijving..."
                className="w-full pl-8 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>
            <select
              value={bibliotheekCategorie}
              onChange={(e) => setBibliotheekCategorie(e.target.value)}
              className="text-sm border rounded-md px-2 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="__alle__">Alle categorieen</option>
              <option value="brandpreventie">Brandpreventie</option>
              <option value="deuren_kozijnen">Deuren & kozijnen</option>
              <option value="elektrotechniek">Elektrotechniek</option>
              <option value="glas">Glas</option>
              <option value="magazijn_kleinmateriaal">Magazijn / kleinmateriaal</option>
              <option value="schilderwerk">Schilderwerk</option>
              <option value="timmerwerk">Timmerwerk</option>
              <option value="werktuigbouwkundig">Werktuigbouwkundig</option>
              <option value="algemeen_arbeid">Algemeen arbeid</option>
              <option value="overig">Overig</option>
            </select>
          </div>
          <div className="flex-1 overflow-y-auto border rounded-md">
            {bibliotheekPrijzen.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                {bibliotheekZoek ? "Geen eenheidsprijzen gevonden voor deze zoekopdracht." : "Geen eenheidsprijzen beschikbaar. Voeg ze toe via Leveranciers & artikelen."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-[90px]">Code</th>
                    <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Omschrijving</th>
                    <th className="text-center px-2 py-2 font-medium text-xs text-muted-foreground w-[60px]">Eenh.</th>
                    <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-[80px]">Prijs</th>
                    <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-[70px]">Normtijd</th>
                  </tr>
                </thead>
                <tbody>
                  {bibliotheekPrijzen.map((ep) => (
                    <tr
                      key={ep.id}
                      className="border-b last:border-0 hover:bg-primary/5 cursor-pointer transition-colors"
                      onClick={() => nieuweRegelUitBibliotheek(ep)}
                    >
                      <td className="px-3 py-2 font-mono text-xs font-medium text-muted-foreground">{ep.code}</td>
                      <td className="px-3 py-2 font-medium">{ep.omschrijving}</td>
                      <td className="px-2 py-2 text-center">
                        <span className="text-xs bg-muted rounded px-1.5 py-0.5 font-mono">{ep.eenheid}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(ep.verkoopprijs)}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground text-xs">
                        {ep.normtijd > 0 ? `${ep.normtijd.toFixed(2)} u` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex justify-between items-center pt-2 text-xs text-muted-foreground">
            <span>{bibliotheekPrijzen.length} eenheidsprijzen</span>
            <Button variant="outline" size="sm" onClick={() => setBibliotheekOpen(false)}>Sluiten</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useCallback, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetModCalculatie,
  useUpdateModCalculatie,
  useDeleteModCalculatie,
  useDupliceerModCalculatie,
  useMaakOfferteVanCalculatie,
  useCreateModCalcRegel,
  useUpdateModCalcRegel,
  useDeleteModCalcRegel,
  useListModCalcNormtijden,
  useListModCalcTarieven,
  useAiModCalcRegels,
} from "@workspace/api-client-react";
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
  Printer, History, Save, MoreHorizontal,
} from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Constanten ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  intern_akkoord: "Intern akkoord",
  aangeboden: "Aangeboden",
  gewonnen: "Gewonnen",
  verloren: "Verloren",
};

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-slate-100 text-slate-700 border-slate-200",
  intern_akkoord: "bg-blue-100 text-blue-800 border-blue-200",
  aangeboden: "bg-amber-100 text-amber-800 border-amber-200",
  gewonnen: "bg-green-100 text-green-800 border-green-200",
  verloren: "bg-red-100 text-red-800 border-red-200",
};

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
  arbeid:         "bg-blue-50 text-blue-700",
  materiaal:      "bg-green-50 text-green-700",
  onderaanneming: "bg-purple-50 text-purple-700",
  materieel:      "bg-orange-50 text-orange-700",
  opslag:         "bg-amber-50 text-amber-700",
  stelpost:       "bg-cyan-50 text-cyan-700",
  regiepost:      "bg-pink-50 text-pink-700",
  overig:         "bg-slate-50 text-slate-600",
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
  "Overige werkzaamheden",
];

// AI hint tabel (keyword → normtijd suggestie)
const AI_HINTS: Array<{ keyword: string; mu: string; categorie: string; eenheid: string }> = [
  { keyword: "doorvoering",  mu: "0.25", categorie: "arbeid",    eenheid: "st" },
  { keyword: "branddeur",    mu: "1.50", categorie: "arbeid",    eenheid: "st" },
  { keyword: "brandklep",    mu: "0.50", categorie: "arbeid",    eenheid: "st" },
  { keyword: "manchet",      mu: "0.15", categorie: "arbeid",    eenheid: "st" },
  { keyword: "coating",      mu: "0.08", categorie: "materiaal", eenheid: "m2" },
  { keyword: "kit",          mu: "0.06", categorie: "materiaal", eenheid: "m1" },
  { keyword: "beglazing",    mu: "2.00", categorie: "arbeid",    eenheid: "st" },
  { keyword: "inspectie",    mu: "0.50", categorie: "regiepost", eenheid: "st" },
  { keyword: "afdichting",   mu: "0.20", categorie: "arbeid",    eenheid: "st" },
  { keyword: "schuim",       mu: "0.10", categorie: "materiaal", eenheid: "st" },
];

// ─── Types ──────────────────────────────────────────────────────────────────

type Weergave = "intern" | "directie" | "klant" | "monteur";

type RegelRow = {
  id: number;
  calculatie_id: number;
  categorie: string;
  omschrijving: string;
  normtijd_id?: number | null;
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
};

type LocalDraft = {
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
};

const LEEG_DRAFT: LocalDraft = {
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
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function regelToDraft(r: RegelRow): LocalDraft {
  return {
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
    btw_tarief: (r as any).btw_tarief ?? "21",
  };
}

function draftToPayload(d: LocalDraft) {
  return {
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

function aiHintVoorOmschrijving(omschrijving: string) {
  const lower = omschrijving.toLowerCase();
  return AI_HINTS.find((h) => lower.includes(h.keyword)) ?? null;
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
}: {
  rij: RegelRow;
  weergave: Weergave;
  onSave: (id: number, payload: ReturnType<typeof draftToPayload>) => void;
  onDelete: (id: number) => void;
  onDuplicate: (rij: RegelRow) => void;
  onEnterNaRegel: (hoofdstuk: string, isStaart: boolean, isBouwplaats: boolean) => void;
  bezig: boolean;
}) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LocalDraft>(() => regelToDraft(rij));
  const [showAiHint, setShowAiHint] = useState(false);
  const savingRef = useRef(false);

  // Sync draft wanneer serverdata verandert (na bewaar)
  useEffect(() => {
    if (!editing) {
      setDraft(regelToDraft(rij));
    }
  }, [rij, editing]);

  const upd = useCallback((updates: Partial<LocalDraft>) => {
    setDraft((d) => ({ ...d, ...updates }));
    if ("omschrijving" in updates) {
      setShowAiHint(true);
    }
  }, []);

  const doSave = useCallback(() => {
    if (savingRef.current) return;
    savingRef.current = true;
    setEditing(false);
    setShowAiHint(false);
    const payload = draftToPayload(draft);
    if (payload.omschrijving.trim()) {
      onSave(rij.id, payload);
    } else {
      setDraft(regelToDraft(rij));
    }
    setTimeout(() => { savingRef.current = false; }, 500);
  }, [draft, rij, onSave]);

  const handleRowBlur = useCallback(() => {
    setTimeout(() => {
      if (!rowRef.current) return;
      if (rowRef.current.contains(document.activeElement)) return;
      if (editing) doSave();
    }, 0);
  }, [editing, doSave]);

  // Live berekening van regeltotalen op basis van draft
  const hv = parseFloat(draft.hoeveelheid) || 0;
  const t  = parseFloat(draft.tarief) || 0;
  const mu = parseFloat(draft.mu_per_eenheid) || 0;
  const at = parseFloat(draft.arbeids_tarief) || 0;
  const ob = parseFloat(draft.onderaanneming_bedrag) || 0;
  const liveArb  = rnd(hv * mu * at);
  const liveMat  = rnd(hv * t);
  const liveTot  = rnd(liveArb + liveMat + ob);

  const arbDisplay = editing ? liveArb  : rij.arbeidsloon;
  const matDisplay = editing ? liveMat  : rij.materiaal_totaal;
  const totDisplay = editing ? liveTot  : rij.totaal;

  const aiHint  = showAiHint ? aiHintVoorOmschrijving(draft.omschrijving) : null;
  const isArb   = draft.categorie === "arbeid" || draft.categorie === "regiepost";
  const isMat   = draft.categorie === "materiaal" || draft.categorie === "materieel"
    || draft.categorie === "opslag" || draft.categorie === "stelpost";
  const isOa    = draft.categorie === "onderaanneming";

  const celKlasse = "px-1 py-0 text-sm";
  const invoerKlasse =
    "w-full h-full px-2 py-[5px] border-0 border-b border-primary/40 bg-transparent focus:border-primary focus:outline-none text-sm tabular-nums";

  // Invoercel helper
  function NumCel({
    waarde,
    field,
    actief,
    align = "right",
    placeholder = "0",
    breedte,
  }: {
    waarde: number | string;
    field: keyof LocalDraft;
    actief: boolean;
    align?: "left" | "right" | "center";
    placeholder?: string;
    breedte: number;
  }) {
    if (!editing || !actief) {
      const val = typeof waarde === "number"
        ? (waarde !== 0 ? (field === "hoeveelheid" ? fmt2(waarde) : formatBedrag(waarde)) : "—")
        : (waarde || "—");
      return (
        <td
          style={{ width: breedte }}
          className={cn(celKlasse, editing ? "bg-slate-50/40" : "cursor-pointer hover:bg-slate-50")}
          onClick={() => { if (!editing) setEditing(true); }}
        >
          <div className={cn("px-2 py-[5px] tabular-nums text-muted-foreground", `text-${align}`)}>
            {val}
          </div>
        </td>
      );
    }
    return (
      <td style={{ width: breedte }} className={cn(celKlasse, "bg-blue-50/20")}>
        <input
          type="number"
          step="0.01"
          min="0"
          value={draft[field] as string}
          onChange={(e) => upd({ [field]: e.target.value } as Partial<LocalDraft>)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); doSave(); onEnterNaRegel(draft.hoofdstuk, draft.is_staartkosten, draft.is_bouwplaatskosten); }
            if (e.key === "Escape") { setEditing(false); setDraft(regelToDraft(rij)); }
          }}
          className={cn(invoerKlasse, `text-${align}`)}
          placeholder={placeholder}
        />
      </td>
    );
  }

  return (
    <tr
      ref={rowRef}
      onFocus={() => setEditing(true)}
      onBlur={handleRowBlur}
      className={cn(
        "border-b border-slate-100 group transition-colors relative",
        editing ? "bg-amber-50/20 outline outline-1 outline-primary/30" : "hover:bg-slate-50/60",
        bezig ? "opacity-50 pointer-events-none" : ""
      )}
    >
      {/* # */}
      <td
        className="px-2 py-[5px] text-xs text-muted-foreground/60 text-right w-10 cursor-pointer select-none"
        onClick={() => setEditing(true)}
      >
        {rij.regelnummer || rij.volgorde}
      </td>

      {/* Omschrijving */}
      <td className="px-1 py-0 min-w-[200px] max-w-[300px] relative">
        {editing ? (
          <div className="relative">
            <input
              type="text"
              value={draft.omschrijving}
              onChange={(e) => upd({ omschrijving: e.target.value })}
              onFocus={() => setShowAiHint(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); doSave(); onEnterNaRegel(draft.hoofdstuk, draft.is_staartkosten, draft.is_bouwplaatskosten); }
                if (e.key === "Escape") { setEditing(false); setDraft(regelToDraft(rij)); }
              }}
              className="w-full px-2 py-[5px] border-0 border-b border-primary/40 bg-transparent focus:border-primary focus:outline-none text-sm font-medium"
              placeholder="Omschrijving werkzaamheid..."
              autoFocus
            />
            {aiHint && draft.omschrijving.length > 2 && (
              <div className="absolute top-full left-0 z-20 mt-0.5 flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs shadow-md whitespace-nowrap">
                <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                <span className="text-amber-800">
                  AI: {aiHint.mu} MU &bull; {CATEGORIE_LABEL[aiHint.categorie]} &bull; {aiHint.eenheid}
                </span>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    upd({ mu_per_eenheid: aiHint.mu, categorie: aiHint.categorie, eenheid: aiHint.eenheid });
                    setShowAiHint(false);
                  }}
                  className="ml-1 font-semibold text-amber-700 hover:text-amber-900 underline"
                >
                  Overnemen
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setShowAiHint(false); }}
                  className="text-amber-400 hover:text-amber-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={() => setEditing(true)}
            className="px-2 py-[5px] text-sm font-medium cursor-pointer truncate"
          >
            {rij.omschrijving || (
              <span className="text-muted-foreground/40 italic font-normal">klik om te bewerken</span>
            )}
          </div>
        )}
      </td>

      {/* Kostensoort — intern + directie */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-1 py-0 w-[124px]">
          {editing ? (
            <select
              value={draft.categorie}
              onChange={(e) => {
                const cat = e.target.value;
                const btw = cat === "onderaanneming" ? "verlegd"
                  : draft.btw_tarief === "verlegd" ? "21" : draft.btw_tarief;
                upd({ categorie: cat, btw_tarief: btw });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); doSave(); }
                if (e.key === "Escape") { setEditing(false); setDraft(regelToDraft(rij)); }
              }}
              className="w-full px-1 py-[5px] text-xs border-0 border-b border-primary/40 bg-transparent focus:border-primary focus:outline-none"
            >
              {KOSTENSOORT_OPTIES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <div onClick={() => setEditing(true)} className="px-2 py-[5px] cursor-pointer">
              <span className={cn(
                "text-xs rounded-sm px-1.5 py-0.5 font-medium",
                CATEGORIE_KLEUR[rij.categorie] ?? "bg-slate-50 text-slate-600"
              )}>
                {CATEGORIE_LABEL[rij.categorie] ?? rij.categorie}
              </span>
            </div>
          )}
        </td>
      )}

      {/* Eenheid */}
      <td className="px-1 py-0 w-[68px] text-center">
        {editing ? (
          <select
            value={draft.eenheid}
            onChange={(e) => upd({ eenheid: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); doSave(); }
              if (e.key === "Escape") { setEditing(false); setDraft(regelToDraft(rij)); }
            }}
            className="w-full px-1 py-[5px] text-xs border-0 border-b border-primary/40 bg-transparent focus:border-primary focus:outline-none text-center"
          >
            {EENHEDEN.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        ) : (
          <div onClick={() => setEditing(true)} className="px-1 py-[5px] text-xs text-muted-foreground text-center cursor-pointer">
            {rij.eenheid}
          </div>
        )}
      </td>

      {/* Hoeveelheid */}
      <NumCel waarde={rij.hoeveelheid} field="hoeveelheid" actief={true} breedte={76} placeholder="1" />

      {/* MU/eenh — intern + directie */}
      {(weergave === "intern" || weergave === "directie") && (
        <NumCel waarde={rij.mu_per_eenheid} field="mu_per_eenheid" actief={isArb} breedte={76} placeholder="0.00" />
      )}

      {/* Arbeidstarief — intern + directie */}
      {(weergave === "intern" || weergave === "directie") && (
        <NumCel waarde={rij.arbeids_tarief} field="arbeids_tarief" actief={isArb} breedte={88} placeholder="0.00" />
      )}

      {/* Arbeidskosten (berekend) — intern + directie */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-2 py-[5px] w-[96px] text-right text-sm tabular-nums text-slate-500 cursor-pointer" onClick={() => setEditing(true)}>
          {arbDisplay > 0 ? formatBedrag(arbDisplay) : "—"}
        </td>
      )}

      {/* Prijs/eenh — intern + directie */}
      {(weergave === "intern" || weergave === "directie") && (
        <NumCel waarde={rij.tarief} field="tarief" actief={isMat} breedte={88} placeholder="0.00" />
      )}

      {/* Materiaal totaal (berekend) — intern + directie */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-2 py-[5px] w-[96px] text-right text-sm tabular-nums text-slate-500 cursor-pointer" onClick={() => setEditing(true)}>
          {matDisplay > 0 ? formatBedrag(matDisplay) : "—"}
        </td>
      )}

      {/* Onderaanneming — intern + directie */}
      {(weergave === "intern" || weergave === "directie") && (
        <NumCel waarde={rij.onderaanneming_bedrag} field="onderaanneming_bedrag" actief={isOa} breedte={96} placeholder="0.00" />
      )}

      {/* BTW — intern only */}
      {weergave === "intern" && (
        <td className="px-1 py-0 w-[72px] text-center">
          {editing ? (
            <select
              value={draft.btw_tarief}
              onChange={(e) => upd({ btw_tarief: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); doSave(); }
                if (e.key === "Escape") { setEditing(false); setDraft(regelToDraft(rij)); }
              }}
              className="w-full px-1 py-[5px] text-xs border-0 border-b border-primary/40 bg-transparent focus:border-primary focus:outline-none"
            >
              {BTW_OPTIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <div onClick={() => setEditing(true)} className="px-1 py-[5px] text-xs text-muted-foreground text-center cursor-pointer">
              {(rij as any).btw_tarief === "verlegd" ? "Verlegd" : `${(rij as any).btw_tarief ?? 21}%`}
            </div>
          )}
        </td>
      )}

      {/* Interne notitie — intern + monteur */}
      {(weergave === "intern" || weergave === "monteur") && (
        <td className="px-1 py-0 w-[140px]">
          {editing ? (
            <input
              type="text"
              value={draft.opmerkingen}
              onChange={(e) => upd({ opmerkingen: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); doSave(); }
                if (e.key === "Escape") { setEditing(false); setDraft(regelToDraft(rij)); }
              }}
              className="w-full px-2 py-[5px] text-xs border-0 border-b border-primary/40 bg-transparent focus:border-primary focus:outline-none"
              placeholder="Intern..."
            />
          ) : (
            <div onClick={() => setEditing(true)} className="px-2 py-[5px] text-xs text-muted-foreground cursor-pointer truncate">
              {rij.opmerkingen || "—"}
            </div>
          )}
        </td>
      )}

      {/* Klanttekst offerte — intern + klant */}
      {(weergave === "intern" || weergave === "klant") && (
        <td className="px-1 py-0 w-[140px]">
          {editing ? (
            <input
              type="text"
              value={draft.klanttekst}
              onChange={(e) => upd({ klanttekst: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); doSave(); }
                if (e.key === "Escape") { setEditing(false); setDraft(regelToDraft(rij)); }
              }}
              className="w-full px-2 py-[5px] text-xs border-0 border-b border-primary/40 bg-transparent focus:border-primary focus:outline-none"
              placeholder="Op offerte..."
            />
          ) : (
            <div onClick={() => setEditing(true)} className="px-2 py-[5px] text-xs text-muted-foreground cursor-pointer truncate">
              {rij.klanttekst || "—"}
            </div>
          )}
        </td>
      )}

      {/* Totaal (berekend) */}
      <td className="px-2 py-[5px] w-[100px] text-right text-sm tabular-nums font-semibold cursor-pointer" onClick={() => setEditing(true)}>
        {formatBedrag(totDisplay)}
      </td>

      {/* Acties — intern only */}
      {weergave === "intern" && (
        <td className="px-1 py-0 w-14 text-center">
          <div className="flex items-center gap-0 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-slate-700"
              title="Dupliceren"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onDuplicate(rij); }}
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-destructive"
              title="Verwijderen"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onDelete(rij.id); }}
            >
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
}: {
  initialDraft: LocalDraft;
  weergave: Weergave;
  onSave: (payload: ReturnType<typeof draftToPayload>) => void;
  onCancel: () => void;
  bezig: boolean;
}) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [draft, setDraft] = useState<LocalDraft>(initialDraft);
  const [showAiHint, setShowAiHint] = useState(false);
  const upd = (updates: Partial<LocalDraft>) => setDraft((d) => ({ ...d, ...updates }));

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
  const aiHint  = showAiHint ? aiHintVoorOmschrijving(draft.omschrijving) : null;
  const isArb   = draft.categorie === "arbeid" || draft.categorie === "regiepost";
  const isMat   = draft.categorie === "materiaal" || draft.categorie === "materieel"
    || draft.categorie === "opslag" || draft.categorie === "stelpost";
  const isOa    = draft.categorie === "onderaanneming";

  const invoerKlasse =
    "w-full h-full px-2 py-[5px] border-0 border-b border-primary/60 bg-transparent focus:border-primary focus:outline-none text-sm tabular-nums";

  const onKD = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); doSave(); }
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  };

  const numInvoer = (field: keyof LocalDraft, breedte: number, actief: boolean) =>
    actief ? (
      <td style={{ width: breedte }} className="px-1 py-0 bg-primary/5">
        <input type="number" step="0.01" min="0"
          value={draft[field] as string}
          onChange={(e) => upd({ [field]: e.target.value } as Partial<LocalDraft>)}
          onKeyDown={onKD}
          className={cn(invoerKlasse, "text-right")}
          placeholder="0"
        />
      </td>
    ) : (
      <td style={{ width: breedte }} className="px-2 py-[5px] text-muted-foreground/40 text-right text-sm">—</td>
    );

  return (
    <tr
      ref={rowRef}
      onBlur={handleRowBlur}
      className={cn(
        "border-b border-primary/30 bg-primary/5 outline outline-1 outline-primary/30",
        bezig ? "opacity-60" : ""
      )}
    >
      <td className="px-2 py-[5px] text-xs text-muted-foreground/40 text-right w-10">+</td>

      {/* Omschrijving */}
      <td className="px-1 py-0 min-w-[200px] max-w-[300px] relative">
        <input
          type="text"
          value={draft.omschrijving}
          onChange={(e) => { upd({ omschrijving: e.target.value }); setShowAiHint(true); }}
          onKeyDown={onKD}
          className="w-full px-2 py-[5px] border-0 border-b border-primary bg-transparent focus:outline-none text-sm font-medium"
          placeholder="Omschrijving werkzaamheid..."
          autoFocus
        />
        {aiHint && draft.omschrijving.length > 2 && (
          <div className="absolute top-full left-0 z-20 mt-0.5 flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs shadow-md whitespace-nowrap">
            <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
            <span className="text-amber-800">
              AI: {aiHint.mu} MU &bull; {CATEGORIE_LABEL[aiHint.categorie]} &bull; {aiHint.eenheid}
            </span>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                upd({ mu_per_eenheid: aiHint.mu, categorie: aiHint.categorie, eenheid: aiHint.eenheid });
                setShowAiHint(false);
              }}
              className="ml-1 font-semibold text-amber-700 hover:text-amber-900 underline"
            >
              Overnemen
            </button>
          </div>
        )}
      </td>

      {/* Kostensoort */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-1 py-0 w-[124px]">
          <select
            value={draft.categorie}
            onChange={(e) => {
              const cat = e.target.value;
              const btw = cat === "onderaanneming" ? "verlegd"
                : draft.btw_tarief === "verlegd" ? "21" : draft.btw_tarief;
              upd({ categorie: cat, btw_tarief: btw });
            }}
            onKeyDown={onKD}
            className="w-full px-1 py-[5px] text-xs border-0 border-b border-primary bg-transparent focus:outline-none"
          >
            {KOSTENSOORT_OPTIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </td>
      )}

      {/* Eenheid */}
      <td className="px-1 py-0 w-[68px]">
        <select
          value={draft.eenheid}
          onChange={(e) => upd({ eenheid: e.target.value })}
          onKeyDown={onKD}
          className="w-full px-1 py-[5px] text-xs border-0 border-b border-primary bg-transparent focus:outline-none text-center"
        >
          {EENHEDEN.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </td>

      {/* Hoeveelheid */}
      {numInvoer("hoeveelheid", 76, true)}

      {/* MU */}
      {(weergave === "intern" || weergave === "directie") && numInvoer("mu_per_eenheid", 76, isArb)}
      {/* Arb tarief */}
      {(weergave === "intern" || weergave === "directie") && numInvoer("arbeids_tarief", 88, isArb)}
      {/* Arbeid totaal */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-2 py-[5px] w-[96px] text-right text-sm tabular-nums text-slate-400">
          {liveArb > 0 ? formatBedrag(liveArb) : "—"}
        </td>
      )}
      {/* Prijs/eenh */}
      {(weergave === "intern" || weergave === "directie") && numInvoer("tarief", 88, isMat)}
      {/* Materiaal totaal */}
      {(weergave === "intern" || weergave === "directie") && (
        <td className="px-2 py-[5px] w-[96px] text-right text-sm tabular-nums text-slate-400">
          {liveMat > 0 ? formatBedrag(liveMat) : "—"}
        </td>
      )}
      {/* Onderaanneming */}
      {(weergave === "intern" || weergave === "directie") && numInvoer("onderaanneming_bedrag", 96, isOa)}
      {/* BTW */}
      {weergave === "intern" && (
        <td className="px-1 py-0 w-[72px]">
          <select
            value={draft.btw_tarief}
            onChange={(e) => upd({ btw_tarief: e.target.value })}
            onKeyDown={onKD}
            className="w-full px-1 py-[5px] text-xs border-0 border-b border-primary bg-transparent focus:outline-none"
          >
            {BTW_OPTIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </td>
      )}
      {/* Notitie */}
      {(weergave === "intern" || weergave === "monteur") && (
        <td className="px-1 py-0 w-[140px]">
          <input
            type="text"
            value={draft.opmerkingen}
            onChange={(e) => upd({ opmerkingen: e.target.value })}
            onKeyDown={onKD}
            className="w-full px-2 py-[5px] text-xs border-0 border-b border-primary bg-transparent focus:outline-none"
            placeholder="Intern..."
          />
        </td>
      )}
      {/* Klanttekst */}
      {(weergave === "intern" || weergave === "klant") && (
        <td className="px-1 py-0 w-[140px]">
          <input
            type="text"
            value={draft.klanttekst}
            onChange={(e) => upd({ klanttekst: e.target.value })}
            onKeyDown={onKD}
            className="w-full px-2 py-[5px] text-xs border-0 border-b border-primary bg-transparent focus:outline-none"
            placeholder="Op offerte..."
          />
        </td>
      )}
      {/* Totaal */}
      <td className="px-2 py-[5px] w-[100px] text-right text-sm tabular-nums font-semibold">
        {liveTot > 0 ? formatBedrag(liveTot) : "—"}
      </td>
      {/* Acties */}
      {weergave === "intern" && (
        <td className="px-1 py-0 w-14 text-center">
          <div className="flex gap-0.5 justify-center">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400" tabIndex={-1} onClick={onCancel}>
              <X className="h-3 w-3" />
            </Button>
          </div>
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
    <tr className="border-b border-slate-200 bg-slate-100/80 group/hs">
      <td
        colSpan={aantalKolommen}
        className="px-3 py-1.5"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{naam}</span>
          {weergave === "intern" && (
            <Button
              variant="ghost" size="sm"
              className="h-5 px-1.5 text-xs text-slate-500 hover:text-slate-900 opacity-0 group-hover/hs:opacity-100 transition-opacity"
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

// ─── Tabelkop helper ─────────────────────────────────────────────────────────

function Th({ children, align = "left", className }: { children?: React.ReactNode; align?: "left" | "right" | "center"; className?: string }) {
  return (
    <th className={cn(
      "px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 whitespace-nowrap border-b border-slate-200 bg-slate-50",
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
  kortingBedrag, totaal, marge,
  opslagAk, opslagAbk, opslagRisico, opslagWinst, korting,
  akIsVast, abkIsVast, risicoIsVast, winstIsVast,
}: {
  directeRegels: RegelRow[]; bouwplaatsRegels: RegelRow[]; staartRegels: RegelRow[];
  matSubtotaal: number; matOpslagBedrag: number; opslagMateriaal: number;
  arbSubtotaal: number; arbOpslagBedrag: number; opslagArbeid: number;
  oaSubtotaal: number; bouwplaatsSubtotaal: number; staartSubtotaal: number;
  subtotaal: number; akBedrag: number; abkBedrag: number; risicoBedrag: number;
  basisWinst: number; winstBedrag: number; kortingBedrag: number; totaal: number; marge: number;
  opslagAk: number; opslagAbk: number; opslagRisico: number; opslagWinst: number; korting: number;
  akIsVast: boolean; abkIsVast: boolean; risicoIsVast: boolean; winstIsVast: boolean;
}) {
  const groepenPerCat = Object.entries(CATEGORIE_LABEL)
    .map(([cat, label]) => ({ cat, label, regels: directeRegels.filter((r) => r.categorie === cat) }))
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
              <tr key={cat} className="hover:bg-slate-50">
                <td className="py-2 font-medium text-slate-700 w-1/3">{label}</td>
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
            <tr className="text-muted-foreground bg-slate-50/50">
              <td className="py-1 pl-4 text-xs">+ Opslag materiaal ({opslagMateriaal}%)</td>
              <td colSpan={4} />
              <td className="py-1 pl-4 text-right text-xs tabular-nums">{formatBedrag(matOpslagBedrag)}</td>
            </tr>
          )}
          {opslagArbeid > 0 && arbSubtotaal > 0 && (
            <tr className="text-muted-foreground bg-slate-50/50">
              <td className="py-1 pl-4 text-xs">+ Opslag arbeid ({opslagArbeid}%)</td>
              <td colSpan={4} />
              <td className="py-1 pl-4 text-right text-xs tabular-nums">{formatBedrag(arbOpslagBedrag)}</td>
            </tr>
          )}
          {bouwplaatsSubtotaal > 0 && (
            <tr className="hover:bg-amber-50/50">
              <td className="py-2 font-medium text-slate-700">Bouwplaatskosten</td>
              <td colSpan={4} className="py-2 text-right text-xs text-muted-foreground">{bouwplaatsRegels.length} post{bouwplaatsRegels.length !== 1 ? "en" : ""}</td>
              <td className="py-2 pl-4 text-right tabular-nums font-medium">{formatBedrag(bouwplaatsSubtotaal)}</td>
            </tr>
          )}
          {staartSubtotaal > 0 && (
            <tr className="hover:bg-slate-50">
              <td className="py-2 font-medium text-slate-700">Staartkosten</td>
              <td colSpan={4} className="py-2 text-right text-xs text-muted-foreground">{staartRegels.length} post{staartRegels.length !== 1 ? "en" : ""}</td>
              <td className="py-2 pl-4 text-right tabular-nums font-medium">{formatBedrag(staartSubtotaal)}</td>
            </tr>
          )}
          <tr className="font-semibold border-t-2">
            <td className="py-2 text-slate-900">Subtotaal</td>
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
        </tbody>
      </table>
      <div className="flex justify-end">
        <div className="rounded-md bg-slate-50 border px-5 py-3 text-sm">
          <span className="text-muted-foreground">Marge: </span>
          <span className="font-semibold">{marge}%</span>
        </div>
      </div>
    </div>
  );
}

// ─── Klant view ──────────────────────────────────────────────────────────────

function KlantView({ regels, totaal, totaalBtw }: { regels: RegelRow[]; totaal: number; totaalBtw: number }) {
  const zichtbaar = regels.filter((r) => !r.is_staartkosten && !r.is_bouwplaatskosten);
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
          {zichtbaar.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-6 py-2.5">
                <p className="font-medium text-slate-800">{r.klanttekst || r.omschrijving}</p>
                {r.regelnummer && <p className="text-xs text-muted-foreground">{r.regelnummer}</p>}
              </td>
              <td className="px-3 py-2.5 text-center text-muted-foreground">{r.eenheid}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.hoeveelheid}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatBedrag(r.totaal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t px-6 py-4 space-y-1.5 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotaal werkzaamheden</span>
          <span className="tabular-nums">{formatBedrag(zichtbaar.reduce((s, r) => s + r.totaal, 0))}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Opslagen en beheerkosten</span>
          <span className="tabular-nums">{formatBedrag(totaal - zichtbaar.reduce((s, r) => s + r.totaal, 0))}</span>
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
            <div className="px-4 py-1.5 bg-slate-100 border-b text-xs font-semibold uppercase tracking-wide text-slate-600">{h}</div>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {rijen.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
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

// ─── Hoofdcomponent ──────────────────────────────────────────────────────────

export default function ModulesCalculatieDetail() {
  const [, params] = useRoute("/modules/calculatie/:id");
  const [, navigate] = useLocation();
  const id = params?.id ? parseInt(params.id, 10) : 0;

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["mod-calculatie", id] });
  }, [queryClient, id]);

  const { data, isLoading } = useGetModCalculatie(id, {
    query: { queryKey: ["mod-calculatie", id], enabled: id > 0 },
  });
  const { data: normtijden = [] } = useListModCalcNormtijden({ query: { queryKey: ["mod-calc-normtijden"] } });
  const { data: tarieven = [] } = useListModCalcTarieven({ query: { queryKey: ["mod-calc-tarieven"] } });

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
        }));
        setAiVoorstellen(regels);
        setAiWaarschuwingen((d.waarschuwingen ?? []) as string[]);
        setAiPaneel(true);
      },
    },
  });

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

  // Nieuw rij invoerrij (null = verborgen)
  const [nieuwDraft, setNieuwDraft] = useState<LocalDraft | null>(null);

  const [headerForm, setHeaderForm] = useState({
    naam: "", referentie: "", klant_naam: "", project_naam: "",
    status: "", omschrijving: "", opmerkingen: "",
    opslag_materiaal: 0, opslag_arbeid: 0,
    opslag_ak: 15, opslag_abk: 10, opslag_risico: 5, opslag_winst: 10, korting: 0,
    ak_is_vast: false, abk_is_vast: false, risico_is_vast: false, winst_is_vast: false,
  });

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

  function nieuweRegel(opts: { hoofdstuk?: string; is_staartkosten?: boolean; is_bouwplaatskosten?: boolean }) {
    setNieuwDraft({
      ...LEEG_DRAFT,
      hoofdstuk: opts.hoofdstuk ?? "Overige werkzaamheden",
      is_staartkosten: opts.is_staartkosten ?? false,
      is_bouwplaatskosten: opts.is_bouwplaatskosten ?? false,
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
  const directeRegels    = regels.filter((r) => !r.is_staartkosten && !r.is_bouwplaatskosten).sort((a, b) => a.volgorde - b.volgorde);
  const bouwplaatsRegels = regels.filter((r) => r.is_bouwplaatskosten).sort((a, b) => a.volgorde - b.volgorde);
  const staartRegels     = regels.filter((r) => r.is_staartkosten).sort((a, b) => a.volgorde - b.volgorde);

  const matSubtotaal        = rnd(directeRegels.reduce((s, r) => s + r.materiaal_totaal, 0));
  const arbSubtotaal        = rnd(directeRegels.reduce((s, r) => s + r.arbeidsloon, 0));
  const oaSubtotaal         = rnd(directeRegels.reduce((s, r) => s + r.onderaanneming_bedrag, 0));
  const bouwplaatsSubtotaal = rnd(bouwplaatsRegels.reduce((s, r) => s + r.totaal, 0));
  const staartSubtotaal     = rnd(staartRegels.reduce((s, r) => s + r.totaal, 0));
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

  // Groepeer directe regels per hoofdstuk (in volgorde van HOOFDSTUK_OPTIES)
  const regelsByHoofdstuk = HOOFDSTUK_OPTIES
    .map((h) => ({ hoofdstuk: h, regels: directeRegels.filter((r) => (r.hoofdstuk ?? "Overige werkzaamheden") === h) }))
    .filter((g) => g.regels.length > 0);

  // Aantal kolommen voor HoofdstukBalk colSpan
  const aantalKolommen = weergave === "intern" ? 16
    : weergave === "directie" ? 12
    : weergave === "klant" ? 6
    : 5; // monteur

  return (
    <div className="flex flex-col min-h-0" style={{ padding: "0" }}>
      {/* Koptekst */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/modules/calculatie")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">{data.naam}</h1>
              <Badge className={`text-xs border ${STATUS_KLEUR[data.status] ?? STATUS_KLEUR.concept}`}>
                {STATUS_LABEL[data.status] ?? data.status}
              </Badge>
            </div>
            {data.referentie && <p className="text-xs text-muted-foreground">{data.referentie}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {volgendStatussen.map((s) => (
            <Button key={s} variant={s === "verloren" ? "outline" : "default"} size="sm" onClick={() => handleStatusWijzigen(s)}>
              {STATUS_LABEL[s]}
              {s !== "verloren" && <ChevronRight className="h-3.5 w-3.5 ml-1" />}
            </Button>
          ))}
          <Button size="sm" onClick={() => maakOfferteMut.mutate({ id })} disabled={maakOfferteMut.isPending}>
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            {maakOfferteMut.isPending ? "Bezig..." : "Maak offerte"}
          </Button>
          <Button variant="outline" size="sm" onClick={openBewerkenHeader}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Bewerken
          </Button>
          <Button variant="outline" size="sm" onClick={() => dupliceerMut.mutate({ id })}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Dupliceren
          </Button>
          <Button variant="outline" size="sm" onClick={() => setVersieOpslaanDialoog(true)}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Versie opslaan
          </Button>
          <Button variant="outline" size="sm" onClick={() => setVersieDialoog(true)}>
            <History className="h-3.5 w-3.5 mr-1.5" />
            Versies
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/modules/calculatie/${id}/print`, "_blank")}>
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Afdrukken
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setTeVerwijderen(true)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Projectgegevens strip */}
      {(data.klant_naam || data.project_naam || data.gebouw_naam || data.aangemaakt_door_naam) && (
        <div className="flex items-center gap-6 px-6 py-2.5 border-b bg-slate-50/60 text-sm">
          {data.klant_naam && (
            <div className="flex gap-1.5 items-center">
              <span className="text-muted-foreground text-xs">Klant:</span>
              <span className="font-medium">{data.klant_naam}</span>
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
        <div className="flex-1 min-w-0 flex flex-col">

          {/* Spreadsheet toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b bg-white gap-3 sticky top-[69px] z-10">
            {/* Weergave tabs */}
            <div className="flex rounded-md border overflow-hidden text-xs">
              {(["intern", "directie", "klant", "monteur"] as Weergave[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setWeergave(v)}
                  className={cn(
                    "px-3 py-1.5 flex items-center gap-1.5 transition-colors",
                    weergave === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
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
                <span className="text-xs text-muted-foreground hidden sm:block">Klik op een cel om te bewerken &bull; Enter bevestigt</span>
                <Button size="sm" onClick={() => nieuweRegel({})}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Regel toevoegen
                </Button>
              </div>
            )}
          </div>

          {/* Spreadsheet tabel of andere weergave */}
          {(weergave === "intern" || weergave === "directie") ? (
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-sm border-collapse" style={{ minWidth: weergave === "intern" ? 1300 : 900 }}>
                <thead className="sticky top-[109px] z-10">
                  <tr>
                    <Th className="w-10 text-right">#</Th>
                    <Th className="min-w-[200px]">Omschrijving</Th>
                    {(weergave === "intern" || weergave === "directie") && <Th className="w-[124px]">Soort</Th>}
                    <Th className="w-[68px] text-center">Eenh</Th>
                    <Th className="w-[76px] text-right">Aantal</Th>
                    {(weergave === "intern" || weergave === "directie") && <Th className="w-[76px] text-right">MU/eenh</Th>}
                    {(weergave === "intern" || weergave === "directie") && <Th className="w-[88px] text-right">Arb.tarief</Th>}
                    {(weergave === "intern" || weergave === "directie") && <Th className="w-[96px] text-right">Arbeidskosten</Th>}
                    {(weergave === "intern" || weergave === "directie") && <Th className="w-[88px] text-right">Prijs/eenh</Th>}
                    {(weergave === "intern" || weergave === "directie") && <Th className="w-[96px] text-right">Materiaal</Th>}
                    {(weergave === "intern" || weergave === "directie") && <Th className="w-[96px] text-right">Onderaann.</Th>}
                    {weergave === "intern" && <Th className="w-[72px] text-center">BTW</Th>}
                    {weergave === "intern" && <Th className="w-[140px]">Notitie</Th>}
                    {weergave === "intern" && <Th className="w-[140px]">Klanttekst</Th>}
                    <Th className="w-[100px] text-right">Totaal</Th>
                    {weergave === "intern" && <Th className="w-14"></Th>}
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

                  {/* Directe regels per hoofdstuk */}
                  {regelsByHoofdstuk.map(({ hoofdstuk, regels: hRegels }) => (
                    <>
                      <HoofdstukBalk
                        key={`hst-${hoofdstuk}`}
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
                        />
                      ))}
                    </>
                  ))}

                  {/* Overige directe regels zonder hoofdstuk in regelsByHoofdstuk */}
                  {directeRegels.filter((r) => !HOOFDSTUK_OPTIES.includes(r.hoofdstuk ?? "")).length > 0 && (
                    <>
                      <HoofdstukBalk
                        naam="Overige werkzaamheden"
                        aantalKolommen={aantalKolommen}
                        weergave={weergave}
                        onToevoegen={() => nieuweRegel({ hoofdstuk: "Overige werkzaamheden" })}
                      />
                      {directeRegels
                        .filter((r) => !HOOFDSTUK_OPTIES.includes(r.hoofdstuk ?? ""))
                        .map((r) => (
                          <SpreadsheetRegelRij
                            key={r.id}
                            rij={r}
                            weergave={weergave}
                            onSave={bewaarBestaandeRegel}
                            onDelete={(rid) => deleteRegelMut.mutate({ id, regelId: rid })}
                            onDuplicate={dupliceerRegel}
                            onEnterNaRegel={(hs, isSt, isBp) => nieuweRegel({ hoofdstuk: hs, is_staartkosten: isSt, is_bouwplaatskosten: isBp })}
                            bezig={updateRegelMut.isPending || deleteRegelMut.isPending}
                          />
                        ))
                      }
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
                      {bouwplaatsRegels.map((r) => (
                        <SpreadsheetRegelRij
                          key={r.id}
                          rij={r}
                          weergave={weergave}
                          onSave={bewaarBestaandeRegel}
                          onDelete={(rid) => deleteRegelMut.mutate({ id, regelId: rid })}
                          onDuplicate={dupliceerRegel}
                          onEnterNaRegel={(_hs, _isSt, _isBp) => nieuweRegel({ is_bouwplaatskosten: true })}
                          bezig={updateRegelMut.isPending || deleteRegelMut.isPending}
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
                      {staartRegels.map((r) => (
                        <SpreadsheetRegelRij
                          key={r.id}
                          rij={r}
                          weergave={weergave}
                          onSave={bewaarBestaandeRegel}
                          onDelete={(rid) => deleteRegelMut.mutate({ id, regelId: rid })}
                          onDuplicate={dupliceerRegel}
                          onEnterNaRegel={(_hs, _isSt, _isBp) => nieuweRegel({ is_staartkosten: true })}
                          bezig={updateRegelMut.isPending || deleteRegelMut.isPending}
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
                    />
                  )}

                  {/* Bouwplaats/staart toevoegen knoppen als er nog geen zijn */}
                  {weergave === "intern" && (
                    <tr>
                      <td colSpan={aantalKolommen} className="px-3 py-2 border-t border-slate-100">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500" onClick={() => nieuweRegel({})}>
                            <Plus className="h-3 w-3 mr-1" />
                            Directe regel
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500" onClick={() => nieuweRegel({ is_bouwplaatskosten: true })}>
                            <Plus className="h-3 w-3 mr-1" />
                            Bouwplaatskost
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500" onClick={() => nieuweRegel({ is_staartkosten: true })}>
                            <Plus className="h-3 w-3 mr-1" />
                            Staartkost
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
            <KlantView regels={regels} totaal={totaal} totaalBtw={totaalBtw} />
          ) : (
            <MonteurView regels={regels} />
          )}
        </div>

        {/* === Zijpaneel === */}
        <div className="w-72 shrink-0 border-l bg-slate-50/40 flex flex-col gap-0 overflow-y-auto">

          {/* AI-voorstel */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-500" />
                AI-voorstel
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
                    <div key={i} className="flex items-start gap-1.5 p-1.5 rounded border text-xs hover:bg-slate-50 group/ai">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 leading-tight truncate">{r.omschrijving}</p>
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
          </div>

          {/* Kostopbouw */}
          <div className="p-4 border-b space-y-1.5 text-sm">
            <h3 className="text-sm font-semibold mb-3">Kostopbouw</h3>
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
              <div className="flex justify-between text-green-700">
                <span>Korting ({data.korting}%)</span>
                <span className="tabular-nums">- {formatBedrag(kortingBedrag)}</span>
              </div>
            )}
          </div>

          {/* Totaalpaneel */}
          <div className="p-4 space-y-1.5 text-sm">
            <div className="flex justify-between font-semibold text-base">
              <span>Totaal excl. BTW</span>
              <span className="tabular-nums">{formatBedrag(totaal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>BTW (21%)</span>
              <span className="tabular-nums">{formatBedrag(totaalBtw - totaal)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold text-primary">
              <span>Totaal incl. BTW</span>
              <span className="tabular-nums">{formatBedragKort(totaalBtw)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
              <span>Marge</span>
              <span>{marge}%</span>
            </div>
          </div>

          {data.opmerkingen && (
            <div className="p-4 border-t">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Opmerkingen</p>
              <p className="text-xs text-muted-foreground">{data.opmerkingen}</p>
            </div>
          )}
        </div>
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
                <Label>Klant</Label>
                <Input value={headerForm.klant_naam} onChange={(e) => setHeaderForm((f) => ({ ...f, klant_naam: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Input value={headerForm.project_naam} onChange={(e) => setHeaderForm((f) => ({ ...f, project_naam: e.target.value }))} />
              </div>
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
                <div key={v.id} className="flex items-center gap-3 p-3 rounded-md border hover:bg-slate-50">
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
    </div>
  );
}

import { useState, useMemo, useEffect, useRef } from "react";
import { useWerkmaatschappijen } from "@/lib/werkmaatschappijen";
import { Link } from "wouter";
import {
  useListPlanningItems,
  useListPlanningMedewerkers,
  useListPlanningAfwezigheid,
  useCreatePlanningItem,
  useUpdatePlanningItem,
  useDeletePlanningItem,
  useListGebouwen,
  useGetPlanningDiagnose,
  usePostPlanningReistijdSchatting,
  useListOpdrachten,
  useListPlanningGeslotenDagen,
  useListBedrijfssluitingen,
  useCreateBedrijfsSluiting,
  useDeleteBedrijfsSluiting,
  useListPlanningMeerwerk,
  useUpdatePlanningMeerwerk,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronLeft, ChevronRight, Plus, AlertTriangle, Users,
  Briefcase, Clock, RefreshCw, X,
  CalendarDays, ChevronDown, Lock, Trash2, MapPin, LayoutGrid,
  CheckCircle2, XCircle, Wrench, Car, AlertCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// ── Constanten ─────────────────────────────────────────────────────────────

const WERKDAGEN = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag"];
const WERKDAGEN_KORT = ["Ma", "Di", "Wo", "Do", "Vr"];

// Werkdag: 07:30–16:00 met 30 min pauze (netto 8 uur)
const DAGDELEN = [
  { key: "ochtend",    label: "Ochtend",    sub: "07:30–12:00",  tijd_start: "07:30", tijd_eind: "12:00", uren: 4.5 },
  { key: "middag",     label: "Middag",     sub: "12:30–16:00",  tijd_start: "12:30", tijd_eind: "16:00", uren: 3.5 },
  { key: "volledig",   label: "Volledig",   sub: "07:30–16:00",  tijd_start: "07:30", tijd_eind: "16:00", uren: 8 },
  { key: "tijdsloten", label: "Tijdsloten", sub: "16 × 30 min",  tijd_start: "",      tijd_eind: "",      uren: 0 },
  { key: "specifiek",  label: "Specifiek",  sub: "eigen tijden", tijd_start: "",      tijd_eind: "",      uren: 0 },
] as const;

type DagdeelKey = "ochtend" | "middag" | "volledig" | "tijdsloten" | "specifiek";

// 16 productieve halve-uren: 07:30–12:00 + 12:30–15:30 (pauze 12:00–12:30 uitgesloten)
const HALVE_UREN: string[] = [
  "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
];

function slotsTijden(slots: string[]): { tijd_start: string; tijd_eind: string; uren: number } {
  if (slots.length === 0) return { tijd_start: "07:30", tijd_eind: "07:30", uren: 0 };
  const sorted = [...slots].sort();
  const last = sorted[sorted.length - 1]!;
  const [lh, lm] = last.split(":").map(Number) as [number, number];
  const endMin = lh * 60 + lm + 30;
  return {
    tijd_start: sorted[0]!,
    tijd_eind: `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`,
    uren: slots.length * 0.5,
  };
}

const STATUS_KLEUR: Record<string, string> = {
  concept:     "bg-slate-100 border-slate-300 text-slate-600",
  ingepland:   "bg-blue-50 border-blue-300 text-blue-800",
  bevestigd:   "bg-green-50 border-green-300 text-green-800",
  uitgevoerd:  "bg-emerald-50 border-emerald-300 text-emerald-800",
  geannuleerd: "bg-red-50 border-red-200 text-red-600 opacity-60",
};

const DAGDEEL_KLEUR: Record<string, string> = {
  ochtend:  "bg-amber-50 text-amber-700 border-amber-200",
  middag:   "bg-sky-50 text-sky-700 border-sky-200",
  volledig: "bg-violet-50 text-violet-700 border-violet-200",
};

const DIENSTVERBAND_KLEUR: Record<string, string> = {
  inhuur:        "bg-orange-50 text-orange-700 border-orange-200",
  onderaannemer: "bg-purple-50 text-purple-700 border-purple-200",
  uitzend:       "bg-amber-50 text-amber-700 border-amber-200",
};

// ── Weergave-modi ───────────────────────────────────────────────────────────

type WeergaveModus = "week" | "2weken" | "4weken" | "maand";

const WEERGAVE_MODI: { key: WeergaveModus; label: string }[] = [
  { key: "week",   label: "Week" },
  { key: "2weken", label: "2 Weken" },
  { key: "4weken", label: "4 Weken" },
  { key: "maand",  label: "Maand" },
];

// ── Proportionele werkdag-helpers ────────────────────────────────────────────

const WERKDAG_START_MIN  = 7 * 60 + 30; // 07:30 = 450 min
const WERKDAG_EIND_MIN   = 16 * 60;     // 16:00 = 960 min
const WERKDAG_TOTAAL_MIN = WERKDAG_EIND_MIN - WERKDAG_START_MIN; // 510 min

function tijdNaarMin(t: string): number {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

type ReistijdResult = { minuten: number; beschrijving: string; onzeker: boolean };

type DagSegment =
  | { type: "item";     item: PlanItem; duurMin: number }
  | { type: "gap";      duurMin: number }
  | { type: "reistijd"; duurMin: number; beschrijving: string; onzeker: boolean };

function bouwDagSegmenten(
  dagItems: PlanItem[],
  reistijdenMap: Map<string, ReistijdResult>,
): DagSegment[] {
  if (dagItems.length === 0) {
    return [{ type: "gap", duurMin: WERKDAG_TOTAAL_MIN }];
  }
  const seg: DagSegment[] = [];
  let cursor = WERKDAG_START_MIN;

  for (let i = 0; i < dagItems.length; i++) {
    const item = dagItems[i]!;
    const itemStart = item.tijd_start ? tijdNaarMin(item.tijd_start) : cursor;
    const itemDuur  = Math.round(item.uren * 60);

    if (itemStart > cursor) {
      const gapMin  = itemStart - cursor;
      const vorige  = i > 0 ? dagItems[i - 1]! : null;
      const rtKey   = vorige?.gebouw_naam && item.gebouw_naam && vorige.gebouw_naam !== item.gebouw_naam
        ? `${vorige.gebouw_naam}|${item.gebouw_naam}`
        : null;
      const rt = rtKey ? reistijdenMap.get(rtKey) : null;
      if (rt && rt.minuten > 0) {
        const rtMin = Math.min(rt.minuten, gapMin);
        seg.push({ type: "reistijd", duurMin: rtMin, beschrijving: rt.beschrijving, onzeker: rt.onzeker });
        if (gapMin - rtMin >= 1) seg.push({ type: "gap", duurMin: gapMin - rtMin });
      } else {
        seg.push({ type: "gap", duurMin: gapMin });
      }
    }

    seg.push({ type: "item", item, duurMin: itemDuur });
    cursor = itemStart + itemDuur;
  }

  if (cursor < WERKDAG_EIND_MIN) {
    seg.push({ type: "gap", duurMin: WERKDAG_EIND_MIN - cursor });
  }
  return seg;
}

// ── Hulpfuncties ────────────────────────────────────────────────────────────

function maandagVanWeek(datum: Date): Date {
  const d = new Date(datum);
  const dag = d.getDay();
  const diff = dag === 0 ? -6 : 1 - dag;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function datumNaarStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekNummer(d: Date): number {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7);
}

function berekenWeken(referentie: Date, modus: WeergaveModus): Date[] {
  const maandag = maandagVanWeek(referentie);
  if (modus === "week") return [maandag];
  if (modus === "2weken") return [maandag, new Date(maandag.getTime() + 7 * 86400000)];
  if (modus === "4weken") return Array.from({ length: 4 }, (_, i) => new Date(maandag.getTime() + i * 7 * 86400000));
  // maand: alle werkweken die de kalendermaand overlappen
  const eersteVanMaand = new Date(referentie.getFullYear(), referentie.getMonth(), 1);
  const maandagEerste = maandagVanWeek(eersteVanMaand);
  const weken: Date[] = [];
  let cursor = new Date(maandagEerste);
  while (true) {
    weken.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + 7 * 86400000);
    if (cursor.getMonth() > referentie.getMonth() && cursor.getFullYear() >= referentie.getFullYear()) break;
    if (weken.length > 8) break; // veiligheidsklep
  }
  return weken;
}

function dagdeelUitTijd(tijdStart?: string | null, tijdEind?: string | null): DagdeelKey {
  if (!tijdStart) return "volledig";
  if (tijdStart === "07:30" && tijdEind === "12:00") return "ochtend";
  if (tijdStart === "12:30" && tijdEind === "16:00") return "middag";
  if (tijdStart === "07:30" && tijdEind === "16:00") return "volledig";
  if (tijdStart === "08:00" && tijdEind === "12:00") return "ochtend";
  if (tijdStart === "13:00" && tijdEind === "17:00") return "middag";
  if (tijdStart === "08:00" && tijdEind === "17:00") return "volledig";
  return "specifiek";
}

function dagdeelLabel(tijdStart?: string | null, tijdEind?: string | null): string {
  if (!tijdStart) return "";
  if (tijdStart === "07:30" && tijdEind === "12:00") return "07:30–12";
  if (tijdStart === "12:30" && tijdEind === "16:00") return "12:30–16";
  if (tijdStart === "07:30" && tijdEind === "16:00") return "07:30–16";
  if (tijdStart === "08:00" && tijdEind === "12:00") return "08–12";
  if (tijdStart === "13:00" && tijdEind === "17:00") return "13–17";
  if (tijdStart === "08:00" && tijdEind === "17:00") return "08–17";
  return tijdStart.slice(0, 5) + "–" + (tijdEind?.slice(0, 5) ?? "");
}

// ── Types ───────────────────────────────────────────────────────────────────

type PlanItem = {
  id: number;
  titel: string;
  medewerker_id?: number | null;
  medewerker_naam?: string | null;
  gebouw_id?: number | null;
  gebouw_naam?: string | null;
  project_naam?: string | null;
  datum_start: string;
  datum_eind: string;
  tijd_start?: string | null;
  tijd_eind?: string | null;
  uren: number;
  status: string;
  type: string;
  notities?: string | null;
};

type Medewerker = {
  id: number;
  naam: string;
  functie?: string | null;
  functie_uitvoerend?: boolean | null;
  contracturen_per_week?: number | null;
  dienstverband?: string | null;
  werkmaatschappij?: string | null;
  bedrijf_uitzendbureau?: string | null;
};

type Gebouw = {
  id: number;
  naam: string;
  projectnummer?: string | null;
  adres?: string | null;
  stad?: string | null;
};

type DialooglItem = {
  geselecteerdeMedewerkers: number[];
  gebouw_id: number | null;
  datum: string;
  dagdeel: DagdeelKey;
  geselecteerdeTijdsloten: string[];
  tijd_start: string;
  tijd_eind: string;
  titel: string;
  uren: string;
  status: string;
  type: string;
  project_naam: string;
  notities: string;
};

// ── Lege staat ──────────────────────────────────────────────────────────────

function PlanningLegeStaat({
  onVernieuwen,
  filterActief,
  onWisFilter,
}: {
  onVernieuwen: () => void;
  filterActief?: boolean;
  onWisFilter?: () => void;
}) {
  const { data: diagnose, isLoading } = useGetPlanningDiagnose({
    query: { queryKey: ["planning-diagnose"] },
  });

  const heeftMedewerkersInHrm = diagnose && diagnose.totaal_in_hrm > 0;

  return (
    <CardContent className="py-14 text-center text-muted-foreground">
      <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
      <p className="text-sm font-medium text-slate-700">Geen medewerkers zichtbaar</p>

      {/* Filter verbergt medewerkers */}
      {filterActief && heeftMedewerkersInHrm ? (
        <div className="mt-4 max-w-xs mx-auto">
          <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-left">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <span className="text-amber-800">
              Het filter <span className="font-semibold">Alleen uitvoerend</span> is actief.
              Er {diagnose.totaal_in_hrm === 1 ? "staat" : "staan"}{" "}
              <span className="font-semibold">{diagnose.totaal_in_hrm}</span>{" "}
              medewerker{diagnose.totaal_in_hrm !== 1 ? "s" : ""} in HRM, maar geen enkele heeft een uitvoerende functie.
              Zet in het functiehuis (Personeel) de functie op <span className="font-semibold">Uitvoerend</span>, of wis het filter.
            </span>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs mt-1 text-muted-foreground">
            Controleer of medewerkers actief zijn in HRM / Personeel.
          </p>
          {isLoading ? (
            <div className="mt-5 space-y-2 max-w-xs mx-auto">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-4/5 mx-auto" />
            </div>
          ) : diagnose && diagnose.totaal_in_hrm === 0 ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Er zijn nog geen medewerkers aangemaakt in HRM / Personeel.
            </p>
          ) : diagnose && (diagnose.oorzaken ?? []).length > 0 ? (
            <div className="mt-5 space-y-2 max-w-xs mx-auto text-left">
              {(diagnose.oorzaken ?? []).map((o) => (
                <div key={o.reden} className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <span className="text-amber-800">
                    <span className="font-semibold">{o.aantal}</span>{" "}
                    {o.omschrijving.charAt(0).toLowerCase() + o.omschrijving.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {filterActief && heeftMedewerkersInHrm && onWisFilter && (
          <Button size="sm" onClick={onWisFilter}>
            Wis filter — toon alle medewerkers
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onVernieuwen}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Vernieuwen
        </Button>
        <Button variant={filterActief && heeftMedewerkersInHrm ? "outline" : "default"} size="sm" asChild>
          <Link href="/personeel">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Medewerker toevoegen in HRM
          </Link>
        </Button>
      </div>
    </CardContent>
  );
}

// ── Maand-view (project × week matrix) ──────────────────────────────────────

type MaandViewProps = {
  items: PlanItem[];
  weken: Date[];
  vandaagStr: string;
  onNieuw: (datum: string, gebouwId?: number) => void;
};

function MaandView({ items, weken, vandaagStr, onNieuw }: MaandViewProps) {
  const projectenInMaand = useMemo(() => {
    const map = new Map<string, { naam: string; gebouw_id: number | null; items: PlanItem[] }>();
    for (const item of items) {
      const sleutel = item.gebouw_id ? `g:${item.gebouw_id}` : `p:${item.project_naam ?? item.titel}`;
      const naam = item.gebouw_naam ?? item.project_naam ?? item.titel;
      if (!map.has(sleutel)) map.set(sleutel, { naam, gebouw_id: item.gebouw_id ?? null, items: [] });
      map.get(sleutel)!.items.push(item);
    }
    return Array.from(map.values()).sort((a, b) => a.naam.localeCompare(b.naam));
  }, [items]);

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Geen projecten gepland deze maand.</p>
          <Button size="sm" className="mt-4" onClick={() => onNieuw(datumNaarStr(weken[0] ?? new Date()))}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Inplannen
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <colgroup>
            <col style={{ width: 200 }} />
            {weken.map((_, i) => <col key={i} />)}
          </colgroup>
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide border-r">
                Project / Gebouw
              </th>
              {weken.map((maa) => {
                const vrijdag = new Date(maa.getTime() + 4 * 86400000);
                const weekDatums = WERKDAGEN.map((_, i) => {
                  const d = new Date(maa); d.setDate(maa.getDate() + i); return datumNaarStr(d);
                });
                const isVandaagInWeek = weekDatums.includes(vandaagStr);
                return (
                  <th
                    key={datumNaarStr(maa)}
                    className={`px-2 py-3 text-center text-xs font-medium border-l ${isVandaagInWeek ? "bg-primary/5 text-primary" : "text-muted-foreground"}`}
                  >
                    <div className="font-semibold">W{weekNummer(maa)}</div>
                    <div className="text-[10px] opacity-70">
                      {maa.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}–{vrijdag.toLocaleDateString("nl-NL", { day: "numeric" })}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y">
            {projectenInMaand.map((project) => (
              <tr key={project.naam} className="hover:bg-slate-50/40">
                <td className="px-4 py-2.5 border-r bg-white">
                  <p className="text-sm font-medium text-slate-800 truncate max-w-[180px]">{project.naam}</p>
                  <p className="text-xs text-muted-foreground">
                    {project.items.reduce((s, i) => s + i.uren, 0)}u gepland
                  </p>
                </td>
                {weken.map((maa) => {
                  const weekDatums = WERKDAGEN.map((_, i) => {
                    const d = new Date(maa); d.setDate(maa.getDate() + i); return datumNaarStr(d);
                  });
                  const weekItems = project.items.filter((it) =>
                    weekDatums.some((dag) => it.datum_start <= dag && it.datum_eind >= dag)
                  );
                  const totaalUren = weekItems.reduce((s, i) => s + i.uren, 0);
                  const isVandaagInWeek = weekDatums.includes(vandaagStr);
                  return (
                    <td key={datumNaarStr(maa)} className={`px-2 py-2 text-center border-l ${isVandaagInWeek ? "bg-primary/5" : ""}`}>
                      {weekItems.length > 0 ? (
                        <button
                          className="w-full rounded bg-primary/10 border border-primary/20 px-1.5 py-1.5 hover:bg-primary/20 transition-colors"
                          onClick={() => onNieuw(weekDatums[0]!, project.gebouw_id ?? undefined)}
                        >
                          <p className="text-xs font-semibold text-primary">{totaalUren}u</p>
                          <p className="text-[9px] text-primary/70">{weekItems.length} item{weekItems.length !== 1 ? "s" : ""}</p>
                        </button>
                      ) : (
                        <button
                          className="w-full h-9 rounded border border-dashed border-slate-200 text-[10px] text-transparent hover:text-muted-foreground hover:border-primary/30 hover:bg-primary/5 transition-colors"
                          onClick={() => onNieuw(weekDatums[0]!, project.gebouw_id ?? undefined)}
                        >
                          <Plus className="h-3 w-3 inline" />
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Opdrachten-paneel ────────────────────────────────────────────────────────

type OpdrachtenPaneelProps = {
  opdrachten: unknown[];
  ingeplandUrenPerGebouw: Map<number, number>;
  onInplannen: (gebouwId: number, gebouwNaam: string) => void;
};

const OPDRACHT_TYPE_LABEL: Record<string, string> = {
  vast: "Aangenomen",
  aangenomen: "Aangenomen",
  regie: "Regie",
  onderhoud: "Onderhoud",
  service: "Service",
  combinatie: "Combinatie",
  overig: "Overig",
};

const BEGROTING_STATUS_KLEUR: Record<string, string> = {
  concept:     "bg-amber-100 text-amber-700 border-amber-200",
  vastgesteld: "bg-emerald-100 text-emerald-700 border-emerald-200",
  afgerond:    "bg-slate-100 text-slate-600 border-slate-200",
};

function OpdrachtenPaneel({ opdrachten, ingeplandUrenPerGebouw, onInplannen }: OpdrachtenPaneelProps) {
  const [uitgeklapt, setUitgeklapt] = useState(false);

  if (opdrachten.length === 0) return null;

  const metBegroting   = opdrachten.filter(o => (o as Record<string, unknown>).begroting_status === "vastgesteld").length;
  const zonderBegroting = opdrachten.length - metBegroting;

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
        onClick={() => setUitgeklapt((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-slate-800">Opdrachten — in te plannen</span>
          <Badge variant="secondary" className="text-xs">{opdrachten.length}</Badge>
          {zonderBegroting > 0 && (
            <span className="text-xs text-amber-600 font-medium">{zonderBegroting} zonder begroting</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${uitgeklapt ? "rotate-180" : ""}`} />
      </button>

      {uitgeklapt && (
        <div className="border-t">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-slate-50 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <th className="px-4 py-2.5 text-left">Opdracht / Locatie</th>
                  <th className="px-3 py-2.5 text-left">Type</th>
                  <th className="px-3 py-2.5 text-left">Begroting</th>
                  <th className="px-3 py-2.5 text-right">Begroot</th>
                  <th className="px-3 py-2.5 text-right">Ingepland</th>
                  <th className="px-3 py-2.5 text-right">Resterend</th>
                  <th className="px-3 py-2.5 text-center">Actie</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {opdrachten.map((o) => {
                  const r = o as Record<string, unknown>;
                  const id = r.id as number;
                  const titel        = (r.titel as string) ?? "Onbekend";
                  const werknummer   = r.werknummer as string | null;
                  const opdrachtgever = r.opdrachtgever as string | null;
                  const gebouwId     = r.gebouw_id as number | null;
                  const gebouwNaam   = r.gebouw_naam as string | null;
                  const gebouwAdres  = r.gebouw_adres as string | null;
                  const gebouwStad   = r.gebouw_stad as string | null;
                  const type         = (r.type as string | null) ?? "vast";
                  const begStatus    = (r.begroting_status as string | null) ?? "concept";
                  const begroot      = Number(r.begroting_totaal_arbeid_uren ?? 0);
                  const ingepland    = gebouwId ? (ingeplandUrenPerGebouw.get(gebouwId) ?? 0) : 0;
                  const resterend    = Math.max(0, begroot - ingepland);
                  const pct          = begroot > 0 ? Math.min(100, (ingepland / begroot) * 100) : 0;
                  const overplanning = ingepland > begroot;
                  const kanInplannen = gebouwId !== null;

                  return (
                    <tr key={id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Opdracht + locatie */}
                      <td className="px-4 py-3 min-w-56">
                        <Link href={`/opdrachten/${id}`}>
                          <p className="text-sm font-medium text-slate-800 hover:text-primary hover:underline truncate max-w-72">{titel}</p>
                        </Link>
                        {werknummer && (
                          <p className="text-xs text-muted-foreground mt-0.5">{werknummer}</p>
                        )}
                        {opdrachtgever && (
                          <p className="text-xs text-muted-foreground">{opdrachtgever}</p>
                        )}
                        {gebouwNaam && (
                          <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="truncate">{gebouwNaam}</span>
                          </p>
                        )}
                        {(gebouwAdres || gebouwStad) && (
                          <p className="text-xs text-muted-foreground pl-4">
                            {[gebouwAdres, gebouwStad].filter(Boolean).join(", ")}
                          </p>
                        )}
                        {begroot > 0 && (
                          <div className="mt-1.5 h-1 w-full max-w-48 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-1 rounded-full transition-all ${overplanning ? "bg-red-400" : pct >= 90 ? "bg-amber-400" : "bg-primary"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </td>
                      {/* Type */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-xs text-slate-600">{OPDRACHT_TYPE_LABEL[type] ?? type}</span>
                      </td>
                      {/* Begroting status */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${BEGROTING_STATUS_KLEUR[begStatus] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                          {begStatus === "vastgesteld" ? "Vastgesteld" : begStatus === "concept" ? "Concept" : begStatus}
                        </span>
                      </td>
                      {/* Begroot uren */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {begroot > 0
                          ? <span className="text-sm text-slate-700">{begroot}u</span>
                          : <span className="text-xs text-muted-foreground">—</span>
                        }
                      </td>
                      {/* Ingepland */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span className={`text-sm font-medium ${overplanning ? "text-red-600" : "text-slate-700"}`}>
                          {ingepland > 0 ? `${ingepland}u` : <span className="text-muted-foreground text-xs">0u</span>}
                        </span>
                      </td>
                      {/* Resterend */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {begroot > 0
                          ? <span className={`text-sm font-medium ${resterend === 0 && !overplanning ? "text-emerald-600" : overplanning ? "text-red-600" : resterend < begroot * 0.1 ? "text-amber-600" : "text-slate-700"}`}>
                              {overplanning ? `+${ingepland - begroot}u` : `${resterend}u`}
                            </span>
                          : <span className="text-xs text-muted-foreground">—</span>
                        }
                      </td>
                      {/* Actie */}
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {kanInplannen ? (
                          <Button
                            size="sm"
                            variant={begStatus === "vastgesteld" ? "default" : "outline"}
                            className="h-7 text-xs"
                            onClick={() => onInplannen(gebouwId!, gebouwNaam ?? titel)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Inplannen
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Geen gebouw</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hoofdcomponent ──────────────────────────────────────────────────────────

export default function ModulesPlanning() {
  const [referentieDatum, setReferentieDatum] = useState(() => maandagVanWeek(new Date()));
  const [weergaveModus, setWeergaveModus] = useState<WeergaveModus>("week");
  const [activeTab, setActiveTab] = useState<"medewerkers" | "projecten" | "bezetting" | "dag" | "meerwerk">("medewerkers");
  const [geselecteerdeDag, setGeselecteerdeDag] = useState<string>(() => datumNaarStr(new Date()));
  const [dialoog, setDialoog] = useState<DialooglItem | null>(null);
  const [bewerkenId, setBewerkenId] = useState<number | null>(null);
  const [opslaan, setOpslaan] = useState(false);
  const [reistijdSchatting, setReistijdSchatting] = useState<{ minuten: number; beschrijving: string; onzeker?: boolean | null } | null>(null);
  const [filterWerkmaatschappij, setFilterWerkmaatschappij] = useState<string>("alle");
  // Werkmaatschappij-filter live uit de werkgevers-API (nieuwe BV's direct zichtbaar).
  const { namen: wmNamen } = useWerkmaatschappijen();
  const [filterAlleenUitvoerend, setFilterAlleenUitvoerend] = useState(true);
  const [reistijden, setReistijden] = useState<Map<string, ReistijdResult>>(new Map());
  const reistijdFetched = useRef(new Set<string>());

  // ── Gesloten-dag override flow ────────────────────────────────────────────
  const [overrideDialoog, setOverrideDialoog] = useState<{
    datum: string; naam: string; bron: string;
    medewerkerId?: number; gebouwId?: number;
  } | null>(null);
  const [overrideCode, setOverrideCode] = useState("");
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideBevestigd, setOverrideBevestigd] = useState(false);

  // ── Bedrijfssluitingen beheer dialoog ────────────────────────────────────
  const [sluitingenDialoog, setSluitingenDialoog] = useState(false);
  const [nieuweSluitingNaam, setNieuweSluitingNaam] = useState("");
  const [nieuweSluitingVan, setNieuweSluitingVan] = useState("");
  const [nieuweSluitingTot, setNieuweSluitingTot] = useState("");
  const [nieuweSluitingType, setNieuweSluitingType] = useState("bedrijfssluiting");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Datum bereik ─────────────────────────────────────────────────────────

  const weken = useMemo(() => berekenWeken(referentieDatum, weergaveModus), [referentieDatum, weergaveModus]);

  const datumStringsPerWeek = useMemo(() =>
    weken.map((maandag) =>
      WERKDAGEN.map((_, i) => {
        const d = new Date(maandag);
        d.setDate(maandag.getDate() + i);
        return datumNaarStr(d);
      })
    ), [weken]);

  const alleDatumStrings = useMemo(() => datumStringsPerWeek.flat(), [datumStringsPerWeek]);
  const van = alleDatumStrings[0]!;
  const tot = alleDatumStrings[alleDatumStrings.length - 1]!;
  const vandaagStr = datumNaarStr(new Date());

  // ── Data ─────────────────────────────────────────────────────────────────

  const { data: items = [], isLoading: itemsLoading } = useListPlanningItems(
    { van, tot },
    { query: { queryKey: ["planning-items", van, tot] } }
  );

  // ── Reistijd achtergrond-fetch ────────────────────────────────────────────
  useEffect(() => {
    if (items.length === 0) return;
    const groepen = new Map<string, PlanItem[]>();
    for (const it of items as PlanItem[]) {
      const sleutel = `${it.medewerker_id}_${it.datum_start}`;
      if (!groepen.has(sleutel)) groepen.set(sleutel, []);
      groepen.get(sleutel)!.push(it);
    }
    for (const dagItems of groepen.values()) {
      const gesorteerd = [...dagItems].sort((a, b) => (a.tijd_start ?? "").localeCompare(b.tijd_start ?? ""));
      for (let i = 0; i < gesorteerd.length - 1; i++) {
        const vanItem = gesorteerd[i]!;
        const naarItem = gesorteerd[i + 1]!;
        if (vanItem.gebouw_naam && naarItem.gebouw_naam && vanItem.gebouw_naam !== naarItem.gebouw_naam) {
          const key = `${vanItem.gebouw_naam}|${naarItem.gebouw_naam}`;
          if (reistijdFetched.current.has(key)) continue;
          reistijdFetched.current.add(key);
          fetch("/api/modules/planning/reistijd-schatting", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locatie_a: vanItem.gebouw_naam, locatie_b: naarItem.gebouw_naam }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((data: ReistijdResult | null) => {
              if (data) setReistijden((prev) => new Map(prev).set(key, data));
            })
            .catch(() => undefined);
        }
      }
    }
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const medewerkersParams = {
    ...(filterAlleenUitvoerend ? { alleen_uitvoerend: true } : {}),
    ...(filterWerkmaatschappij !== "alle" ? { werkmaatschappij: filterWerkmaatschappij } : {}),
  };
  const { data: medewerkers = [], isLoading: medewerkersLoading, refetch: refetchMedewerkers } = useListPlanningMedewerkers(
    medewerkersParams,
    { query: { queryKey: ["planning-medewerkers", filterAlleenUitvoerend, filterWerkmaatschappij] } }
  );
  const { data: afwezigheid = [] } = useListPlanningAfwezigheid(
    {},
    { query: { queryKey: ["planning-afwezigheid"] } }
  );
  const { data: alleMeerwerk = [], refetch: refetchMeerwerk } = useListPlanningMeerwerk(
    {},
    { query: { queryKey: ["planning-meerwerk-alle"] } }
  );
  const beoordeelMeerwerk = useUpdatePlanningMeerwerk();
  const { data: gebouwen = [] } = useListGebouwen(
    {},
    { query: { queryKey: ["gebouwen-planning"] } }
  );
  const { data: actieveOpdrachten = [] } = useListOpdrachten(
    { status: "actief" } as Parameters<typeof useListOpdrachten>[0],
    { query: { queryKey: ["opdrachten-actief"] } }
  );

  // Gesloten dagen ophalen (feestdagen + bedrijfssluitingen) voor zichtbaar bereik
  const { data: geslotenDagen = [] } = useListPlanningGeslotenDagen(
    { van, tot },
    { query: { queryKey: ["planning-gesloten-dagen", van, tot] } }
  );

  // Bedrijfssluitingen voor beheer
  const { data: bedrijfssluitingen = [], refetch: refetchSluitingen } = useListBedrijfssluitingen(
    {},
    { query: { queryKey: ["bedrijfssluitingen"] } }
  );

  const geslotenDagenMap = useMemo(() => {
    const m = new Map<string, { naam: string; bron: string; type: string | null }>();
    for (const g of geslotenDagen as Array<{ datum: string; naam: string; bron: string; type: string | null }>) {
      m.set(g.datum, { naam: g.naam, bron: g.bron, type: g.type });
    }
    return m;
  }, [geslotenDagen]);

  const ingePlannenOpdrachten = useMemo(() =>
    actieveOpdrachten.filter((o) => {
      const r = (o as unknown) as Record<string, unknown>;
      return r.status === "actief";
    }), [actieveOpdrachten]);

  // ── Mutations ────────────────────────────────────────────────────────────

  const createMut = useCreatePlanningItem({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["planning-items"] }) },
  });
  const updateMut = useUpdatePlanningItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["planning-items"] });
        sluitDialoog();
      },
    },
  });
  const deleteMut = useDeletePlanningItem({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["planning-items"] }) },
  });
  const reistijdMut = usePostPlanningReistijdSchatting({
    mutation: { onSuccess: (data) => setReistijdSchatting(data) },
  });
  const createSluitingMut = useCreateBedrijfsSluiting({
    mutation: { onSuccess: () => { void refetchSluitingen(); queryClient.invalidateQueries({ queryKey: ["planning-gesloten-dagen"] }); } },
  });
  const deleteSluitingMut = useDeleteBedrijfsSluiting({
    mutation: { onSuccess: () => { void refetchSluitingen(); queryClient.invalidateQueries({ queryKey: ["planning-gesloten-dagen"] }); } },
  });

  // ── Navigatie ─────────────────────────────────────────────────────────────

  function stap(richting: 1 | -1) {
    setReferentieDatum((r) => {
      const d = new Date(r);
      if (weergaveModus === "week")   d.setDate(d.getDate() + richting * 7);
      else if (weergaveModus === "2weken") d.setDate(d.getDate() + richting * 14);
      else if (weergaveModus === "4weken") d.setDate(d.getDate() + richting * 28);
      else { d.setMonth(d.getMonth() + richting); d.setDate(1); }
      return maandagVanWeek(d);
    });
  }
  function vandaag() { setReferentieDatum(maandagVanWeek(new Date())); }

  // ── Dialoog helpers ──────────────────────────────────────────────────────

  function sluitDialoog() {
    setDialoog(null);
    setBewerkenId(null);
    setOpslaan(false);
    setReistijdSchatting(null);
    setOverrideBevestigd(false);
  }

  // Interceptor: als de dag gesloten is, toon override-dialoog; anders direct openNieuw
  function handleDagKlik(medewerkerId?: number, datum?: string, gebouwId?: number) {
    if (!datum) { openNieuw(medewerkerId, datum, gebouwId); return; }
    const info = geslotenDagenMap.get(datum);
    if (info) {
      setOverrideDialoog({ datum, naam: info.naam, bron: info.bron, medewerkerId, gebouwId });
      setOverrideCode("");
      setOverrideError(null);
    } else {
      openNieuw(medewerkerId, datum, gebouwId);
    }
  }

  function bevestigOverride() {
    if (overrideCode !== "5604") {
      setOverrideError("Onjuiste code. Vraag de hoofdbeheerder.");
      return;
    }
    if (!overrideDialoog) return;
    setOverrideBevestigd(true);
    const { medewerkerId, datum, gebouwId } = overrideDialoog;
    setOverrideDialoog(null);
    setOverrideCode("");
    setOverrideError(null);
    openNieuw(medewerkerId, datum, gebouwId);
  }

  async function voegSluitingToe() {
    if (!nieuweSluitingNaam || !nieuweSluitingVan || !nieuweSluitingTot) return;
    await createSluitingMut.mutateAsync({
      data: {
        naam: nieuweSluitingNaam,
        datum_start: nieuweSluitingVan,
        datum_eind: nieuweSluitingTot,
        type: nieuweSluitingType,
      },
    });
    setNieuweSluitingNaam("");
    setNieuweSluitingVan("");
    setNieuweSluitingTot("");
  }

  function openNieuw(medewerkerId?: number, datum?: string, gebouwId?: number) {
    setBewerkenId(null);
    const gebouw = gebouwId ? (gebouwen as Gebouw[]).find((g) => g.id === gebouwId) : null;
    setDialoog({
      geselecteerdeMedewerkers: medewerkerId ? [medewerkerId] : [],
      gebouw_id: gebouwId ?? null,
      datum: datum ?? alleDatumStrings[0]!,
      dagdeel: "volledig",
      geselecteerdeTijdsloten: [],
      tijd_start: "07:30",
      tijd_eind: "16:00",
      titel: gebouw?.naam ?? "",
      uren: "8",
      status: "ingepland",
      type: "project",
      project_naam: gebouw?.naam ?? "",
      notities: "",
    });
  }

  function openBewerken(item: PlanItem) {
    const dd = dagdeelUitTijd(item.tijd_start, item.tijd_eind);
    const dagdeelDef = DAGDELEN.find((d) => d.key === dd);
    setBewerkenId(item.id);
    setDialoog({
      geselecteerdeMedewerkers: item.medewerker_id ? [item.medewerker_id] : [],
      gebouw_id: item.gebouw_id ?? null,
      datum: item.datum_start,
      dagdeel: dd,
      geselecteerdeTijdsloten: [],
      tijd_start: item.tijd_start ?? dagdeelDef?.tijd_start ?? "07:30",
      tijd_eind: item.tijd_eind ?? dagdeelDef?.tijd_eind ?? "16:00",
      titel: item.titel,
      uren: String(item.uren),
      status: item.status,
      type: item.type,
      project_naam: item.project_naam ?? "",
      notities: item.notities ?? "",
    });
  }

  function kiesDagdeel(key: DagdeelKey) {
    const def = DAGDELEN.find((d) => d.key === key)!;
    setDialoog((d) => {
      if (!d) return d;
      if (key === "tijdsloten") return { ...d, dagdeel: key };
      return { ...d, dagdeel: key, tijd_start: def.tijd_start, tijd_eind: def.tijd_eind, uren: def.uren ? String(def.uren) : d.uren };
    });
  }

  function toggleTijdslot(slot: string) {
    setDialoog((d) => {
      if (!d) return d;
      const set = new Set(d.geselecteerdeTijdsloten);
      if (set.has(slot)) set.delete(slot); else set.add(slot);
      const slots = Array.from(set);
      const { tijd_start, tijd_eind, uren } = slotsTijden(slots);
      return { ...d, geselecteerdeTijdsloten: slots, tijd_start, tijd_eind, uren: String(uren) };
    });
  }

  function kiesGebouw(id: string) {
    const gebouw = (gebouwen as Gebouw[]).find((g) => g.id === parseInt(id, 10));
    setDialoog((d) => d ? {
      ...d,
      gebouw_id: gebouw?.id ?? null,
      titel: d.titel || gebouw?.naam || "",
      project_naam: gebouw?.naam ?? d.project_naam,
    } : d);
  }

  function toggleMedewerker(id: number) {
    if (bewerkenId) return;
    setDialoog((d) => {
      if (!d) return d;
      const set = new Set(d.geselecteerdeMedewerkers);
      if (set.has(id)) set.delete(id); else set.add(id);
      return { ...d, geselecteerdeMedewerkers: Array.from(set) };
    });
  }

  async function handleOpslaan() {
    if (!dialoog || !dialoog.datum || !dialoog.titel) return;
    setOpslaan(true);
    const tijdenPayload = (() => {
      if (dialoog.dagdeel === "tijdsloten") {
        const { tijd_start, tijd_eind, uren } = slotsTijden(dialoog.geselecteerdeTijdsloten);
        return { tijd_start: tijd_start || null, tijd_eind: tijd_eind || null, uren: uren || 0 };
      }
      return { tijd_start: dialoog.tijd_start || null, tijd_eind: dialoog.tijd_eind || null, uren: parseFloat(dialoog.uren) || 8 };
    })();
    const payload = {
      titel: dialoog.titel,
      datum_start: dialoog.datum,
      datum_eind: dialoog.datum,
      ...tijdenPayload,
      status: dialoog.status,
      type: dialoog.type,
      gebouw_id: dialoog.gebouw_id ?? undefined,
      project_naam: dialoog.project_naam || undefined,
      notities: dialoog.notities || undefined,
      ...(overrideBevestigd ? { override_bevestigd: true } : {}),
    };
    try {
      if (bewerkenId) {
        const medewerker_id = dialoog.geselecteerdeMedewerkers[0] ?? undefined;
        const bijgewerkt = await updateMut.mutateAsync({ id: bewerkenId, data: { ...payload, medewerker_id } });
        const jwUpd = (bijgewerkt as unknown as Record<string, unknown>).jonge_werknemer as { leeftijd: number; beperkingen?: Array<{ omschrijving: string }>; schendingen?: Array<{ omschrijving: string }> } | undefined;
        if (jwUpd) {
          const jwUpdDesc = jwUpd.schendingen && jwUpd.schendingen.length > 0
            ? jwUpd.schendingen.map(s => s.omschrijving).join(" | ")
            : (jwUpd.beperkingen?.[0]?.omschrijving ?? "ATW-beperkingen zijn van toepassing.");
          toast({ title: `Let op: medewerker is ${jwUpd.leeftijd} jaar (minderjarig)`, description: jwUpdDesc });
        }
      } else {
        const ids = dialoog.geselecteerdeMedewerkers.length ? dialoog.geselecteerdeMedewerkers : [undefined];
        for (const mid of ids) {
          const aangemaakt = await createMut.mutateAsync({ data: { ...payload, medewerker_id: mid ?? null } });
          const jwCrt = (aangemaakt as unknown as Record<string, unknown>).jonge_werknemer as { leeftijd: number; beperkingen?: Array<{ omschrijving: string }>; schendingen?: Array<{ omschrijving: string }> } | undefined;
          if (jwCrt) {
            const jwCrtDesc = jwCrt.schendingen && jwCrt.schendingen.length > 0
              ? jwCrt.schendingen.map(s => s.omschrijving).join(" | ")
              : (jwCrt.beperkingen?.[0]?.omschrijving ?? "ATW-beperkingen zijn van toepassing.");
            toast({ title: `Let op: medewerker is ${jwCrt.leeftijd} jaar (minderjarig)`, description: jwCrtDesc });
          }
        }
        queryClient.invalidateQueries({ queryKey: ["planning-items"] });
        sluitDialoog();
      }
    } finally {
      setOpslaan(false);
    }
  }

  // ── Berekeningen ─────────────────────────────────────────────────────────

  const bereikUrenPerMedewerker = useMemo(() => {
    const kaart = new Map<number, number>();
    for (const item of items as PlanItem[]) {
      if (!item.medewerker_id) continue;
      kaart.set(item.medewerker_id, (kaart.get(item.medewerker_id) ?? 0) + item.uren);
    }
    return kaart;
  }, [items]);

  const afwezigheidDagen = useMemo(() => {
    const kaart = new Set<string>();
    for (const af of afwezigheid) {
      if (af.status === "afgewezen") continue;
      for (const dag of alleDatumStrings) {
        if (dag >= af.datum_start && dag <= af.datum_eind) kaart.add(`${af.medewerker_id}_${dag}`);
      }
    }
    return kaart;
  }, [afwezigheid, alleDatumStrings]);

  // Telt per dag hoeveel medewerkers ≥ 120 min niet ingepland hebben (AI-bewaking)
  const onvolledeDagenMap = useMemo(() => {
    const kaart = new Map<string, number>();
    for (const dag of alleDatumStrings) {
      if (geslotenDagenMap.has(dag)) continue;
      let aantalOnvolledig = 0;
      for (const med of medewerkers as Medewerker[]) {
        if (afwezigheidDagen.has(`${med.id}_${dag}`)) continue;
        const dagItems = (items as PlanItem[])
          .filter((it) => it.medewerker_id === med.id && it.datum_start <= dag && it.datum_eind >= dag)
          .sort((a, b) => (a.tijd_start ?? "00:00").localeCompare(b.tijd_start ?? "00:00"));
        const segmenten = bouwDagSegmenten(dagItems, reistijden);
        const ongeplandeMin = segmenten.filter((s) => s.type === "gap").reduce((s, g) => s + g.duurMin, 0);
        if (ongeplandeMin >= 120) aantalOnvolledig++;
      }
      if (aantalOnvolledig > 0) kaart.set(dag, aantalOnvolledig);
    }
    return kaart;
  }, [items, medewerkers, afwezigheidDagen, geslotenDagenMap, alleDatumStrings, reistijden]);

  const projectGroepen = useMemo(() => {
    const map = new Map<string, { sleutel: string; naam: string; gebouw_id?: number | null; items: PlanItem[] }>();
    for (const item of items as PlanItem[]) {
      const sleutel = item.gebouw_id ? `g:${item.gebouw_id}` : `p:${item.project_naam ?? item.titel}`;
      const naam = item.gebouw_naam ?? item.project_naam ?? item.titel;
      if (!map.has(sleutel)) map.set(sleutel, { sleutel, naam, gebouw_id: item.gebouw_id, items: [] });
      map.get(sleutel)!.items.push(item);
    }
    return Array.from(map.values()).sort((a, b) => a.naam.localeCompare(b.naam));
  }, [items]);

  const ingeplandUrenPerGebouw = useMemo(() => {
    const kaart = new Map<number, number>();
    for (const item of items as PlanItem[]) {
      if (!item.gebouw_id) continue;
      kaart.set(item.gebouw_id, (kaart.get(item.gebouw_id) ?? 0) + item.uren);
    }
    return kaart;
  }, [items]);

  const isLoading = itemsLoading || medewerkersLoading;

  // ── Header label ─────────────────────────────────────────────────────────

  const headerLabel = useMemo(() => {
    if (weergaveModus === "week") {
      const maa = weken[0]!;
      const vrij = new Date(maa.getTime() + 4 * 86400000);
      const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
      return `Week ${weekNummer(maa)} — ${maa.toLocaleDateString("nl-NL", opts)} – ${vrij.toLocaleDateString("nl-NL", opts)}`;
    }
    if (weergaveModus === "maand") {
      return referentieDatum.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
    }
    return `Week ${weekNummer(weken[0]!)} – ${weekNummer(weken[weken.length - 1]!)}`;
  }, [weergaveModus, weken, referentieDatum]);

  // ── Dag-cel inhoud (proporti­onele tijdlijn) ─────────────────────────────

  function renderDagCelInhoud(med: Medewerker, dag: string) {
    const dagItems = (items as PlanItem[])
      .filter((it) => it.medewerker_id === med.id && it.datum_start <= dag && it.datum_eind >= dag)
      .sort((a, b) => (a.tijd_start ?? "00:00").localeCompare(b.tijd_start ?? "00:00"));
    const isAfwezig  = afwezigheidDagen.has(`${med.id}_${dag}`);
    const geslotenInfo = geslotenDagenMap.get(dag);

    // Speciale statussen zonder proporti­onele tijdlijn
    if (isAfwezig && dagItems.length === 0) {
      return (
        <div
          className="flex items-center justify-center rounded border border-orange-200 bg-orange-50 text-[10px] text-orange-700"
          style={{ height: 128 }}
        >
          Afwezig
        </div>
      );
    }
    if (geslotenInfo && dagItems.length === 0) {
      return (
        <div
          className="flex items-center justify-center gap-1 rounded border border-slate-200 bg-slate-50 text-[10px] text-slate-500"
          style={{ height: 128 }}
        >
          <Lock className="h-2.5 w-2.5" />
          <span className="truncate max-w-[70px]">{geslotenInfo.naam}</span>
        </div>
      );
    }

    const segmenten = bouwDagSegmenten(dagItems, reistijden);
    const ongeplandeMin = segmenten
      .filter((s) => s.type === "gap")
      .reduce((sum, s) => sum + s.duurMin, 0);

    return (
      <div
        className="flex flex-col overflow-hidden rounded relative group cursor-pointer"
        style={{ height: 128 }}
        onClick={() => handleDagKlik(med.id, dag)}
      >
        {segmenten.map((seg, idx) => {
          // ── Niet-ingepland (rood) ──────────────────────────────────────
          if (seg.type === "gap") {
            const label = seg.duurMin >= 60
              ? `${Math.round(seg.duurMin / 60 * 10) / 10}u vrij`
              : seg.duurMin >= 30
                ? `${seg.duurMin}m vrij`
                : null;
            return (
              <div
                key={idx}
                className="border-l-2 border-red-300 bg-red-50/80 flex items-start pl-1 overflow-hidden"
                style={{ flex: seg.duurMin }}
                title={`${seg.duurMin >= 60 ? (Math.round(seg.duurMin / 60 * 10) / 10) + "u" : seg.duurMin + "m"} niet ingepland`}
              >
                {label && (
                  <span className="text-[8px] text-red-400 leading-tight mt-0.5 select-none">
                    {label}
                  </span>
                )}
              </div>
            );
          }

          // ── Reistijd (amber) ───────────────────────────────────────────
          if (seg.type === "reistijd") {
            return (
              <div
                key={idx}
                className="border-l-2 border-amber-400 bg-amber-50 flex items-center gap-0.5 pl-1 overflow-hidden"
                style={{ flex: seg.duurMin }}
                title={seg.beschrijving}
              >
                <Car className="h-2 w-2 text-amber-600 shrink-0" />
                {seg.duurMin >= 25 && (
                  <span className="text-[8px] text-amber-700 leading-none select-none">
                    ~{seg.duurMin}m{seg.onzeker ? "?" : ""}
                  </span>
                )}
              </div>
            );
          }

          // ── Ingepland item ────────────────────────────────────────────
          const item = seg.item;
          const ddLabel = dagdeelLabel(item.tijd_start, item.tijd_eind);
          const dd = dagdeelUitTijd(item.tijd_start, item.tijd_eind);
          const projectLabel = item.gebouw_naam ?? item.project_naam ?? item.titel;
          const isOpGeslotenDag = (item as unknown as Record<string, unknown>).op_gesloten_dag === true;
          const toonDetails = seg.duurMin >= 55;

          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  className={`w-full border-l-2 px-1 py-0.5 text-left transition-all hover:opacity-80 overflow-hidden flex-shrink-0 ${STATUS_KLEUR[item.status] ?? STATUS_KLEUR["concept"]}`}
                  style={{ flex: seg.duurMin }}
                  onClick={(e) => { e.stopPropagation(); openBewerken(item); }}
                >
                  {toonDetails && (
                    <div className="flex items-center gap-0.5 flex-wrap mb-0.5">
                      {isOpGeslotenDag && <Lock className="h-2.5 w-2.5 text-amber-600 shrink-0" />}
                      {ddLabel && (
                        <span className={`rounded px-0.5 text-[8px] font-mono border ${DAGDEEL_KLEUR[dd] ?? "bg-slate-50 text-slate-500 border-slate-200"}`}>
                          {ddLabel}
                        </span>
                      )}
                    </div>
                  )}
                  <span className={`font-medium truncate block leading-tight ${toonDetails ? "text-[10px]" : "text-[8px]"}`}>
                    {isOpGeslotenDag && !toonDetails && <Lock className="h-2 w-2 inline mr-0.5 text-amber-600" />}
                    {projectLabel}
                  </span>
                  {toonDetails && (
                    <span className="text-[8px] text-current opacity-60">{item.uren}u</span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">{item.titel}</p>
                {item.gebouw_naam && <p className="text-xs">{item.gebouw_naam}</p>}
                {item.project_naam && item.project_naam !== item.gebouw_naam && (
                  <p className="text-xs opacity-70">{item.project_naam}</p>
                )}
                <p className="text-xs">{item.uren} uur · {item.status}</p>
                {isOpGeslotenDag && <p className="text-xs text-amber-600">Ingepland op gesloten dag (override)</p>}
                {item.notities && <p className="text-xs opacity-70">{item.notities}</p>}
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* Inplan-knop bij niet-gesloten dag (hover) */}
        {!geslotenInfo && ongeplandeMin > 0 && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <Plus className="h-3 w-3 text-slate-400" />
          </div>
        )}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const aantalWeken = weken.length;

  return (
    <TooltipProvider>
      <div className="flex min-h-full">

        {/* ═══ HOOFD-INHOUD ═══ */}
        <div className="flex-1 min-w-0 p-6 space-y-5">

          {/* Koptekst */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 data-paginatitel className="text-2xl font-semibold text-slate-900">Planning</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{headerLabel}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Weergave-modus toggle */}
              <div className="flex rounded-md border bg-slate-50 p-0.5 gap-0.5">
                {WEERGAVE_MODI.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setWeergaveModus(m.key)}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${weergaveModus === m.key ? "bg-white shadow-sm font-medium text-slate-800" : "text-muted-foreground hover:text-slate-700"}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <Link href="/modules/planning/afwezigheid">
                <Button variant="outline" size="sm">
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  Afwezigheid
                </Button>
              </Link>
              <Link href="/modules/planning/medewerkers">
                <Button variant="outline" size="sm">
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  Medewerkers
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={() => setSluitingenDialoog(true)}>
                <Lock className="h-3.5 w-3.5 mr-1.5" />
                Gesloten dagen
              </Button>
              <Button size="sm" onClick={() => openNieuw()}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Inplannen
              </Button>
              <Button variant="outline" size="sm" onClick={vandaag}>Vandaag</Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => stap(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => stap(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Tabs (niet in maand-view) */}
          {weergaveModus !== "maand" && (
            <div className="flex gap-1 border-b">
              <button
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === "medewerkers" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-slate-700"}`}
                onClick={() => setActiveTab("medewerkers")}
              >
                <Users className="h-3.5 w-3.5 inline mr-1.5" />
                Medewerkers
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === "projecten" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-slate-700"}`}
                onClick={() => setActiveTab("projecten")}
              >
                <Briefcase className="h-3.5 w-3.5 inline mr-1.5" />
                Projecten
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === "bezetting" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-slate-700"}`}
                onClick={() => setActiveTab("bezetting")}
              >
                <LayoutGrid className="h-3.5 w-3.5 inline mr-1.5" />
                Bezetting
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === "dag" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-slate-700"}`}
                onClick={() => setActiveTab("dag")}
              >
                <CalendarDays className="h-3.5 w-3.5 inline mr-1.5" />
                Per dag
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === "meerwerk" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-slate-700"}`}
                onClick={() => setActiveTab("meerwerk")}
              >
                <Wrench className="h-3.5 w-3.5 inline mr-1.5" />
                Meerwerk
              </button>
            </div>
          )}

          {/* ── MAAND-VIEW ─────────────────────────────────────────────── */}
          {weergaveModus === "maand" && (
            <MaandView
              items={items as PlanItem[]}
              weken={weken}
              vandaagStr={vandaagStr}
              onNieuw={(datum, gebouwId) => openNieuw(undefined, datum, gebouwId)}
            />
          )}

          {/* ── FILTERBAR (medewerkers-tab) ──────────────────────────── */}
          {weergaveModus !== "maand" && activeTab === "medewerkers" && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-slate-50/60 px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground shrink-0">Filter:</span>
              <Select value={filterWerkmaatschappij} onValueChange={setFilterWerkmaatschappij}>
                <SelectTrigger className="h-8 text-xs w-48">
                  <SelectValue placeholder="Werkmaatschappij" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle werkmaatschappijen</SelectItem>
                  {wmNamen.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
              <button
                className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition-colors ${filterAlleenUitvoerend ? "border-primary bg-primary/10 text-primary font-medium" : "border-slate-200 bg-white text-muted-foreground hover:border-slate-300"}`}
                onClick={() => setFilterAlleenUitvoerend((v) => !v)}
                type="button"
              >
                Alleen uitvoerend
              </button>
              {(filterWerkmaatschappij !== "alle" || filterAlleenUitvoerend) && (
                <button
                  className="text-xs text-muted-foreground underline hover:text-slate-700"
                  onClick={() => { setFilterWerkmaatschappij("alle"); setFilterAlleenUitvoerend(false); }}
                  type="button"
                >
                  Wis filters
                </button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {(medewerkers as Medewerker[]).length} medewerker{(medewerkers as Medewerker[]).length !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* ── TAB: MEDEWERKERS ─────────────────────────────────────── */}
          {weergaveModus !== "maand" && activeTab === "medewerkers" && (
            <Card className="overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : (medewerkers as Medewerker[]).length === 0 ? (
                <PlanningLegeStaat
                  onVernieuwen={() => { void refetchMedewerkers(); }}
                  filterActief={filterAlleenUitvoerend}
                  onWisFilter={() => { setFilterAlleenUitvoerend(false); setFilterWerkmaatschappij("alle"); }}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table
                    className="w-full border-collapse"
                    style={{ tableLayout: "fixed", minWidth: aantalWeken > 1 ? aantalWeken * 5 * 100 + 192 : "auto" }}
                  >
                    <colgroup>
                      <col style={{ width: 192 }} />
                      {datumStringsPerWeek.flatMap((weekDatums, wi) =>
                        weekDatums.map((_, di) => <col key={`${wi}-${di}`} />)
                      )}
                    </colgroup>
                    <thead>
                      {/* Weekgroep-rij (alleen bij meerweken) */}
                      {aantalWeken > 1 && (
                        <tr className="border-b bg-slate-100">
                          <th className="px-4 py-2 border-r" />
                          {weken.map((maa) => {
                            const vrij = new Date(maa.getTime() + 4 * 86400000);
                            return (
                              <th
                                key={datumNaarStr(maa)}
                                colSpan={5}
                                className="px-2 py-2 text-center text-[11px] font-semibold text-slate-600 border-l-2 border-l-slate-300"
                              >
                                Week {weekNummer(maa)} · {maa.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} – {vrij.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                              </th>
                            );
                          })}
                        </tr>
                      )}
                      {/* Dag-rij */}
                      <tr className="border-b bg-slate-50">
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide border-r">
                          Medewerker
                        </th>
                        {datumStringsPerWeek.flatMap((weekDatums, wi) =>
                          weekDatums.map((dag, di) => (
                            <th
                              key={dag}
                              className={`px-1 py-2 text-center text-xs font-medium uppercase tracking-wide ${dag === vandaagStr ? "bg-primary/5 text-primary" : geslotenDagenMap.has(dag) ? "bg-slate-100 text-slate-400" : "text-muted-foreground"} ${di === 0 && wi > 0 ? "border-l-2 border-l-slate-300" : "border-l border-l-slate-100"}`}
                            >
                              <div className="flex items-center justify-center gap-0.5">
                                {geslotenDagenMap.has(dag) && <Lock className="h-2.5 w-2.5 text-slate-400" />}
                                <span>{WERKDAGEN_KORT[di]}</span>
                              </div>
                              <div className={`text-sm font-semibold mt-0.5 ${dag === vandaagStr ? "text-primary" : geslotenDagenMap.has(dag) ? "text-slate-400 line-through" : "text-slate-800"}`}>
                                {new Date(dag + "T00:00:00").getDate()}
                              </div>
                              {geslotenDagenMap.has(dag) && (
                                <div className="text-[8px] font-normal normal-case text-slate-400 truncate max-w-[80px] leading-tight mt-0.5">
                                  {geslotenDagenMap.get(dag)!.naam}
                                </div>
                              )}
                              {onvolledeDagenMap.has(dag) && !geslotenDagenMap.has(dag) && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center justify-center gap-0.5 mt-0.5 cursor-default">
                                      <AlertCircle className="h-2.5 w-2.5 text-red-400" />
                                      <span className="text-[8px] font-normal normal-case text-red-400">
                                        {onvolledeDagenMap.get(dag)}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">
                                      {onvolledeDagenMap.get(dag)} medewerker{(onvolledeDagenMap.get(dag) ?? 0) !== 1 ? "s" : ""} heeft onvolledige dag (&gt;2u vrij)
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </th>
                          ))
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(medewerkers as Medewerker[]).map((med) => {
                        const bereikUren = bereikUrenPerMedewerker.get(med.id) ?? 0;
                        const contractUren = (med.contracturen_per_week ?? 40) * aantalWeken;
                        const overGepland = bereikUren > contractUren;
                        return (
                          <tr key={med.id} className="hover:bg-slate-50/40 transition-colors">
                            {/* Medewerker-kolom */}
                            <td className="px-4 py-2 border-r bg-white">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-slate-800">{med.naam}</p>
                                  {med.functie && <p className="text-xs text-muted-foreground">{med.functie}</p>}
                                  {med.dienstverband && med.dienstverband !== "vast" && (
                                    <Badge variant="outline" className={`mt-0.5 text-[10px] px-1 py-0 h-4 ${DIENSTVERBAND_KLEUR[med.dienstverband] ?? ""}`}>
                                      {med.dienstverband}
                                      {med.bedrijf_uitzendbureau ? ` · ${med.bedrijf_uitzendbureau}` : ""}
                                    </Badge>
                                  )}
                                </div>
                                {overGepland && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Overplanning: {bereikUren}u gepland, {contractUren}u contract
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                              <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <span className={overGepland ? "text-amber-600 font-medium" : ""}>{bereikUren}u</span>
                                <span>/</span>
                                <span>{contractUren}u</span>
                              </div>
                              <div className="mt-1 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-1 rounded-full transition-all ${overGepland ? "bg-amber-400" : "bg-primary"}`}
                                  style={{ width: `${Math.min(100, (bereikUren / contractUren) * 100)}%` }}
                                />
                              </div>
                            </td>
                            {/* Dag-cellen */}
                            {datumStringsPerWeek.flatMap((weekDatums, wi) =>
                              weekDatums.map((dag, di) => (
                                <td
                                  key={dag}
                                  className={`px-1 py-1 align-top cursor-pointer hover:bg-slate-50 transition-colors ${dag === vandaagStr ? "bg-primary/5 hover:bg-primary/10" : ""} ${geslotenDagenMap.has(dag) ? "bg-slate-50/70" : ""} ${di === 0 && wi > 0 ? "border-l-2 border-l-slate-300" : "border-l border-l-slate-100"}`}
                                  style={{ height: 128, verticalAlign: "top", minWidth: 90, padding: 2 }}
                                  onClick={() => handleDagKlik(med.id, dag)}
                                >
                                  {renderDagCelInhoud(med, dag)}
                                </td>
                              ))
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* ── TAB: PROJECTEN ───────────────────────────────────────── */}
          {weergaveModus !== "maand" && activeTab === "projecten" && (
            <div className="space-y-3">
              {itemsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
                </div>
              ) : projectGroepen.length === 0 ? (
                <Card>
                  <CardContent className="py-16 text-center text-muted-foreground">
                    <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Geen projecten gepland in dit bereik.</p>
                    <p className="text-xs mt-1">Klik op Inplannen om een project in te roosteren.</p>
                  </CardContent>
                </Card>
              ) : (
                projectGroepen.map((groep) => {
                  const projectItems = groep.items;
                  const uniekeMedewerkers = Array.from(
                    new Map(projectItems.filter((it) => it.medewerker_id).map((it) => [it.medewerker_id, it.medewerker_naam])).entries()
                  );
                  const totalUren = projectItems.reduce((s, it) => s + it.uren, 0);
                  const statusVerdeling = projectItems.reduce((acc: Record<string, number>, it) => {
                    acc[it.status] = (acc[it.status] ?? 0) + 1;
                    return acc;
                  }, {});
                  return (
                    <Card key={groep.sleutel} className="overflow-hidden">
                      <div className="px-5 py-4 border-b bg-slate-50/60 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">{groep.naam}</p>
                            <p className="text-xs text-muted-foreground">
                              {totalUren} uur gepland · {uniekeMedewerkers.length} medewerker{uniekeMedewerkers.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {Object.entries(statusVerdeling).map(([s, n]) => (
                            <Badge key={s} variant="outline" className={`text-[11px] ${STATUS_KLEUR[s] ?? ""}`}>
                              {n} {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="px-5 py-4 grid grid-cols-3 gap-6">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Medewerkers</p>
                          <div className="flex flex-wrap gap-1.5">
                            {uniekeMedewerkers.length === 0 ? (
                              <span className="text-xs text-muted-foreground">Niet toegewezen</span>
                            ) : uniekeMedewerkers.map(([id, naam]) => (
                              <Badge key={id} variant="secondary" className="text-xs">{naam ?? `#${id}`}</Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Geplande dagen</p>
                          <div className="flex flex-wrap gap-1">
                            {alleDatumStrings.map((dag) => {
                              const dagItemsProj = projectItems.filter((it) => it.datum_start <= dag && it.datum_eind >= dag);
                              const heeftItems = dagItemsProj.length > 0;
                              return heeftItems ? (
                                <Tooltip key={dag}>
                                  <TooltipTrigger asChild>
                                    <div className="w-7 h-7 rounded flex items-center justify-center text-[10px] font-medium border bg-primary text-white border-primary">
                                      {new Date(dag + "T00:00:00").getDate()}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {new Date(dag + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "short" })}
                                    {dagItemsProj.map((it) => (
                                      <p key={it.id} className="text-xs">{it.medewerker_naam ?? "Onbekend"} · {dagdeelLabel(it.tijd_start, it.tijd_eind) || `${it.uren}u`}</p>
                                    ))}
                                  </TooltipContent>
                                </Tooltip>
                              ) : null;
                            })}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Tijdslots</p>
                          <div className="space-y-1">
                            {projectItems.slice(0, 4).map((it) => (
                              <div key={it.id} className="flex items-center gap-2 text-xs">
                                <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="text-slate-500">
                                  {new Date(it.datum_start + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric" })}
                                </span>
                                {it.tijd_start && <span className="font-mono text-slate-600">{dagdeelLabel(it.tijd_start, it.tijd_eind)}</span>}
                                <span className="text-muted-foreground truncate">{it.medewerker_naam}</span>
                              </div>
                            ))}
                            {projectItems.length > 4 && <p className="text-xs text-muted-foreground">+{projectItems.length - 4} meer</p>}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {/* ── TAB: BEZETTING ───────────────────────────────────────── */}
          {weergaveModus !== "maand" && activeTab === "bezetting" && (
            <Card className="overflow-hidden">
              {(medewerkers as Medewerker[]).length === 0 ? (
                <PlanningLegeStaat
                  onVernieuwen={() => { void refetchMedewerkers(); }}
                  filterActief={filterAlleenUitvoerend}
                  onWisFilter={() => { setFilterAlleenUitvoerend(false); setFilterWerkmaatschappij("alle"); }}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: aantalWeken > 1 ? aantalWeken * 5 * 80 + 192 : "auto" }}>
                    <colgroup>
                      <col style={{ width: 192 }} />
                      {alleDatumStrings.map((_, i) => <col key={i} style={{ minWidth: 72 }} />)}
                    </colgroup>
                    <thead>
                      {aantalWeken > 1 && (
                        <tr className="border-b bg-slate-100">
                          <th className="px-4 py-2 border-r" />
                          {weken.map((maa) => {
                            const vrij = new Date(maa.getTime() + 4 * 86400000);
                            return (
                              <th key={datumNaarStr(maa)} colSpan={5} className="px-2 py-2 text-center text-[11px] font-semibold text-slate-600 border-l-2 border-l-slate-300">
                                Week {weekNummer(maa)} · {maa.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} – {vrij.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                              </th>
                            );
                          })}
                        </tr>
                      )}
                      <tr className="border-b bg-slate-50">
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide border-r">Medewerker</th>
                        {datumStringsPerWeek.flatMap((weekDatums, wi) =>
                          weekDatums.map((dag, di) => (
                            <th key={dag} className={`px-1 py-2 text-center text-xs font-medium uppercase tracking-wide ${dag === vandaagStr ? "bg-primary/5 text-primary" : geslotenDagenMap.has(dag) ? "bg-slate-100 text-slate-400" : "text-muted-foreground"} ${di === 0 && wi > 0 ? "border-l-2 border-l-slate-300" : "border-l border-l-slate-100"}`}>
                              <div>{WERKDAGEN_KORT[di]}</div>
                              <div className={`text-sm font-semibold mt-0.5 ${dag === vandaagStr ? "text-primary" : geslotenDagenMap.has(dag) ? "text-slate-400 line-through" : "text-slate-800"}`}>
                                {new Date(dag + "T00:00:00").getDate()}
                              </div>
                            </th>
                          ))
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(medewerkers as Medewerker[]).map((med) => {
                        const dagCapaciteit = (med.contracturen_per_week ?? 40) / 5;
                        return (
                          <tr key={med.id} className="hover:bg-slate-50/40">
                            <td className="px-4 py-2 border-r bg-white">
                              <p className="text-sm font-medium text-slate-800">{med.naam}</p>
                              {med.functie && <p className="text-xs text-muted-foreground">{med.functie}</p>}
                            </td>
                            {datumStringsPerWeek.flatMap((weekDatums, wi) =>
                              weekDatums.map((dag, di) => {
                                const dagItemsMed = (items as PlanItem[]).filter(
                                  (it) => it.medewerker_id === med.id && it.datum_start <= dag && it.datum_eind >= dag && it.status !== "geannuleerd"
                                );
                                const geplandUren = dagItemsMed.reduce((s, it) => s + it.uren, 0);
                                const pct = dagCapaciteit > 0 ? geplandUren / dagCapaciteit : 0;
                                const gesloten = geslotenDagenMap.has(dag);
                                let knopKleur = "";
                                if (!gesloten && geplandUren > 0) {
                                  knopKleur = pct > 1 ? "bg-rose-100 text-rose-700 border border-rose-200" : pct > 0.7 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200";
                                }
                                return (
                                  <td
                                    key={dag}
                                    className={`px-1 py-1.5 text-center ${di === 0 && wi > 0 ? "border-l-2 border-l-slate-300" : "border-l border-l-slate-100"} ${dag === vandaagStr && !gesloten ? "ring-1 ring-inset ring-primary/20" : ""}`}
                                    title={dagItemsMed.length > 0 ? `${geplandUren}u / ${dagCapaciteit}u — ${dagItemsMed.map((it) => it.titel).join(", ")}` : undefined}
                                  >
                                    {gesloten ? (
                                      <div className="mx-auto w-10 h-10 rounded flex items-center justify-center bg-slate-100">
                                        <Lock className="h-3 w-3 text-slate-400" />
                                      </div>
                                    ) : (
                                      <button
                                        className={`mx-auto w-10 h-10 rounded flex flex-col items-center justify-center transition-all hover:opacity-80 ${geplandUren > 0 ? knopKleur : "border border-dashed border-slate-200 hover:border-primary/30 hover:bg-primary/5"}`}
                                        onClick={() => handleDagKlik(med.id, dag)}
                                      >
                                        {geplandUren > 0 ? (
                                          <>
                                            <span className="text-[12px] font-bold leading-none">{geplandUren}</span>
                                            <span className="text-[9px] leading-none opacity-60">u</span>
                                          </>
                                        ) : (
                                          <Plus className="h-3 w-3 text-slate-300" />
                                        )}
                                      </button>
                                    )}
                                  </td>
                                );
                              })
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="flex items-center gap-4 px-4 py-3 border-t bg-slate-50/60">
                    <span className="text-xs text-muted-foreground">Bezettingsgraad per dag:</span>
                    {[
                      { kleur: "bg-emerald-100 border-emerald-200", label: "≤70%" },
                      { kleur: "bg-amber-100 border-amber-200", label: "70–100%" },
                      { kleur: "bg-rose-100 border-rose-200", label: ">100% (overplanning)" },
                    ].map((l) => (
                      <div key={l.label} className="flex items-center gap-1.5">
                        <div className={`w-4 h-4 rounded border ${l.kleur}`} />
                        <span className="text-xs text-muted-foreground">{l.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ── TAB: PER DAG ─────────────────────────────────────────── */}
          {weergaveModus !== "maand" && activeTab === "dag" && (() => {
            const effectieveDag = alleDatumStrings.includes(geselecteerdeDag) ? geselecteerdeDag : (alleDatumStrings[0] ?? vandaagStr);
            const dagIndex = alleDatumStrings.indexOf(effectieveDag);
            const dagItemsAlle = (items as PlanItem[]).filter((it) => it.datum_start <= effectieveDag && it.datum_eind >= effectieveDag && it.status !== "geannuleerd");
            const dagGesloten = geslotenDagenMap.get(effectieveDag);

            const TIJDAS_START = 450;
            const TIJDAS_EIND = 960;
            const TIJDAS_DUUR = TIJDAS_EIND - TIJDAS_START;

            function tijdNaarPct(t?: string | null) {
              if (!t) return 0;
              const [h, m] = t.split(":").map(Number) as [number, number];
              return Math.max(0, Math.min(100, ((h * 60 + m) - TIJDAS_START) / TIJDAS_DUUR * 100));
            }
            function duurNaarPct(s?: string | null, e?: string | null) {
              if (!s || !e) return 100;
              const [sh, sm] = s.split(":").map(Number) as [number, number];
              const [eh, em] = e.split(":").map(Number) as [number, number];
              return Math.max(5, ((eh * 60 + em) - (sh * 60 + sm)) / TIJDAS_DUUR * 100);
            }

            const tijdlabels = ["07:30", "08:30", "09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:30"];

            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { const p = alleDatumStrings[Math.max(0, dagIndex - 1)]; if (p) setGeselecteerdeDag(p); }} disabled={dagIndex <= 0}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <p className="text-sm font-semibold text-slate-800 min-w-56 text-center capitalize">
                    {new Date(effectieveDag + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}
                    {effectieveDag === vandaagStr && <Badge variant="outline" className="ml-2 text-[10px] text-primary border-primary/30 bg-primary/5">Vandaag</Badge>}
                    {dagGesloten && <Badge variant="outline" className="ml-2 text-[10px] text-amber-600 border-amber-200 bg-amber-50"><Lock className="h-2.5 w-2.5 inline mr-0.5" />{dagGesloten.naam}</Badge>}
                  </p>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { const n = alleDatumStrings[Math.min(alleDatumStrings.length - 1, dagIndex + 1)]; if (n) setGeselecteerdeDag(n); }} disabled={dagIndex >= alleDatumStrings.length - 1}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <div className="flex gap-1 ml-1">
                    {alleDatumStrings.map((d) => (
                      <button
                        key={d}
                        onClick={() => setGeselecteerdeDag(d)}
                        className={`w-7 h-7 rounded text-[11px] font-medium transition-colors ${d === effectieveDag ? "bg-primary text-white" : d === vandaagStr ? "bg-primary/10 text-primary" : geslotenDagenMap.has(d) ? "text-slate-400 bg-slate-100" : "text-slate-600 hover:bg-slate-100"}`}
                      >
                        {new Date(d + "T00:00:00").getDate()}
                      </button>
                    ))}
                  </div>
                </div>

                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: 680 }}>
                      <div className="flex pl-48 border-b bg-slate-50">
                        <div className="flex-1 relative" style={{ height: 32 }}>
                          {tijdlabels.map((t) => (
                            <div key={t} className="absolute top-0 h-full flex items-end pb-1" style={{ left: `${tijdNaarPct(t)}%` }}>
                              <div className="absolute top-0 h-full w-px bg-slate-200" />
                              <span className="text-[9px] text-muted-foreground ml-1 select-none">{t}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {(medewerkers as Medewerker[]).length === 0 ? (
                        <div className="py-12 text-center text-sm text-muted-foreground">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                          Geen medewerkers beschikbaar.
                        </div>
                      ) : (
                        <div className="divide-y">
                          {(medewerkers as Medewerker[]).map((med) => {
                            const medItems = dagItemsAlle.filter((it) => it.medewerker_id === med.id);
                            return (
                              <div key={med.id} className="flex hover:bg-slate-50/40 transition-colors" style={{ minHeight: 52 }}>
                                <div className="w-48 shrink-0 px-4 py-2 border-r bg-white flex flex-col justify-center">
                                  <p className="text-sm font-medium text-slate-800 truncate">{med.naam}</p>
                                  {med.functie && <p className="text-xs text-muted-foreground truncate">{med.functie}</p>}
                                  {medItems.length === 0 && !dagGesloten && (
                                    <button className="text-[10px] text-muted-foreground hover:text-primary transition-colors mt-0.5 text-left" onClick={() => handleDagKlik(med.id, effectieveDag)}>
                                      <Plus className="h-2.5 w-2.5 inline" /> Inplannen
                                    </button>
                                  )}
                                </div>
                                <div className="flex-1 relative py-2 px-1" style={{ minHeight: 52 }}>
                                  {dagGesloten ? (
                                    <div className="absolute inset-2 rounded bg-slate-100 flex items-center px-3">
                                      <Lock className="h-3 w-3 text-slate-400 mr-1.5" />
                                      <span className="text-xs text-slate-400">{dagGesloten.naam}</span>
                                    </div>
                                  ) : medItems.length === 0 ? (
                                    <button className="absolute inset-2 rounded border border-dashed border-slate-200 hover:border-primary/30 hover:bg-primary/5 transition-colors" onClick={() => handleDagKlik(med.id, effectieveDag)} />
                                  ) : (
                                    medItems.map((it) => {
                                      const links = tijdNaarPct(it.tijd_start);
                                      const breedte = duurNaarPct(it.tijd_start, it.tijd_eind);
                                      const dd = dagdeelUitTijd(it.tijd_start, it.tijd_eind);
                                      const kleur = dd !== "specifiek" ? (DAGDEEL_KLEUR[dd] ?? "bg-blue-50 text-blue-700 border-blue-200") : (STATUS_KLEUR[it.status] ?? STATUS_KLEUR["concept"]);
                                      return (
                                        <button
                                          key={it.id}
                                          className={`absolute top-2 bottom-2 rounded border px-1.5 text-left overflow-hidden hover:opacity-80 transition-opacity ${kleur}`}
                                          style={{ left: `calc(${links}% + 2px)`, width: `calc(${Math.min(breedte, 100 - links)}% - 4px)` }}
                                          onClick={(e) => { e.stopPropagation(); openBewerken(it); }}
                                          title={`${it.titel} · ${dagdeelLabel(it.tijd_start, it.tijd_eind) || `${it.uren}u`}`}
                                        >
                                          <p className="text-[10px] font-medium truncate leading-tight">{it.titel}</p>
                                          {it.tijd_start && <p className="text-[9px] opacity-70 font-mono">{dagdeelLabel(it.tijd_start, it.tijd_eind)}</p>}
                                        </button>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            );
          })()}

          {/* ── MEERWERK-TAB ──────────────────────────────────────────── */}
          {weergaveModus !== "maand" && activeTab === "meerwerk" && (() => {
            const ingediend = alleMeerwerk.filter((m) => m.status === "ingediend");
            const afgehandeld = alleMeerwerk.filter((m) => m.status !== "ingediend");

            function beoordeel(id: number, planningItemId: number, nieuweStatus: "goedgekeurd" | "afgewezen") {
              beoordeelMeerwerk.mutate(
                { id, data: { planning_item_id: planningItemId, status: nieuweStatus } },
                { onSuccess: () => void refetchMeerwerk() }
              );
            }

            return (
              <div className="space-y-4">
                {alleMeerwerk.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <Wrench className="h-8 w-8 text-muted-foreground opacity-30" />
                    <p className="text-sm text-muted-foreground">Geen meerwerk aanvragen.</p>
                  </div>
                ) : (
                  <>
                    {ingediend.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          <h3 className="text-sm font-semibold text-amber-800">
                            In behandeling ({ingediend.length})
                          </h3>
                        </div>
                        <div className="space-y-2">
                          {ingediend.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-lg border border-amber-200 bg-amber-50/40 px-4 py-3 flex items-start justify-between gap-4"
                            >
                              <div className="flex-1 min-w-0">
                                {item.meerwerk_nummer && (
                                  <p className="text-[10px] font-mono text-muted-foreground mb-0.5">#{item.meerwerk_nummer}</p>
                                )}
                                <p className="text-sm text-slate-800">{item.omschrijving ?? "Geen omschrijving"}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Planning-item #{item.planning_item_id}</p>
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <button
                                  onClick={() => beoordeel(item.id, item.planning_item_id, "afgewezen")}
                                  className="flex items-center gap-1 rounded border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors"
                                  title="Afwijzen"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  Afwijzen
                                </button>
                                <button
                                  onClick={() => beoordeel(item.id, item.planning_item_id, "goedgekeurd")}
                                  className="flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                                  title="Goedkeuren"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Goedkeuren
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {afgehandeld.length > 0 && (
                      <div>
                        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Afgehandeld ({afgehandeld.length})
                        </h3>
                        <div className="space-y-1.5">
                          {afgehandeld.map((item) => {
                            const goedgekeurd = item.status === "goedgekeurd";
                            return (
                              <div
                                key={item.id}
                                className={`rounded-lg border px-4 py-2.5 flex items-center gap-3 ${goedgekeurd ? "border-emerald-100 bg-emerald-50/30" : "border-slate-100 bg-slate-50/50"}`}
                              >
                                {goedgekeurd
                                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                  : <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                                }
                                <p className="text-sm text-slate-700 flex-1 min-w-0 truncate">{item.omschrijving ?? "Geen omschrijving"}</p>
                                <Badge variant="outline" className={`text-[10px] shrink-0 ${goedgekeurd ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-rose-200 text-rose-600 bg-rose-50"}`}>
                                  {goedgekeurd ? "Goedgekeurd" : "Afgewezen"}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* ── LEGENDA ──────────────────────────────────────────────── */}
          {weergaveModus !== "maand" && activeTab === "medewerkers" && (
            <div className="flex items-center flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="font-medium text-slate-600">Dagdeel:</span>
              {[
                { key: "ochtend",  label: "Ochtend 07:30–12" },
                { key: "middag",   label: "Middag 12:30–16" },
                { key: "volledig", label: "Volledig 07:30–16" },
              ].map(({ key, label }) => (
                <span key={key} className="flex items-center gap-1">
                  <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono ${DAGDEEL_KLEUR[key] ?? ""}`}>{label}</span>
                </span>
              ))}
              <span className="ml-2 font-medium text-slate-600">Status:</span>
              {Object.entries({ ingepland: "Ingepland", bevestigd: "Bevestigd", uitgevoerd: "Uitgevoerd", concept: "Concept" }).map(([k, v]) => (
                <span key={k} className={`rounded px-1.5 py-0.5 border ${STATUS_KLEUR[k]}`}>{v}</span>
              ))}
            </div>
          )}

          {/* ── OPDRACHTEN-PANEEL ────────────────────────────────────── */}
          <OpdrachtenPaneel
            opdrachten={ingePlannenOpdrachten}
            ingeplandUrenPerGebouw={ingeplandUrenPerGebouw}
            onInplannen={(gebouwId, gebouwNaam) => {
              openNieuw(undefined, alleDatumStrings[0], gebouwId);
              void gebouwNaam;
            }}
          />

        </div>

        {/* ═══ INLINE ZIJPANEEL ═══ */}
        {dialoog && (
          <aside className="w-[400px] shrink-0 border-l bg-white flex flex-col" style={{ position: "sticky", top: "2.25rem", height: "calc(100vh - 2.25rem)", overflow: "hidden" }}>
            {/* Paneel-kop */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-slate-50/80">
              <h2 className="text-sm font-semibold text-slate-800">
                {bewerkenId ? "Planningitem bewerken" : "Inplannen"}
              </h2>
              <button
                type="button"
                onClick={sluitDialoog}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Formulier */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* Project / Gebouw */}
              <div className="space-y-1.5">
                <Label>Project / Gebouw</Label>
                <Select
                  value={dialoog.gebouw_id ? String(dialoog.gebouw_id) : "__geen__"}
                  onValueChange={(v) => v === "__geen__" ? setDialoog((d) => d ? { ...d, gebouw_id: null } : d) : kiesGebouw(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kies een gebouw/project..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__geen__">Geen gebouw (vrije invoer)</SelectItem>
                    {(gebouwen as Gebouw[]).map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.naam}{g.stad ? ` — ${g.stad}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!dialoog.gebouw_id && (
                  <Input
                    value={dialoog.project_naam}
                    onChange={(e) => setDialoog((d) => d ? { ...d, project_naam: e.target.value, titel: d.titel || e.target.value } : d)}
                    placeholder="Naam van het project of de werkzaamheid"
                  />
                )}
              </div>

              {/* Werkzaamheid */}
              <div className="space-y-1.5">
                <Label>Werkzaamheid *</Label>
                <Input
                  value={dialoog.titel}
                  onChange={(e) => setDialoog((d) => d ? { ...d, titel: e.target.value } : d)}
                  placeholder="Bijv. Branddeur plaatsing, Inspectie, Overleg"
                />
              </div>

              {/* Datum + Status */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Datum</Label>
                  <DatePicker
                    value={dialoog.datum}
                    onChange={(v) => setDialoog((d) => d ? { ...d, datum: v } : d)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={dialoog.status} onValueChange={(v) => setDialoog((d) => d ? { ...d, status: v } : d)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="concept">Concept</SelectItem>
                      <SelectItem value="ingepland">Ingepland</SelectItem>
                      <SelectItem value="bevestigd">Bevestigd</SelectItem>
                      <SelectItem value="uitgevoerd">Uitgevoerd</SelectItem>
                      <SelectItem value="geannuleerd">Geannuleerd</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Dagdeel */}
              <div className="space-y-1.5">
                <Label>Dagdeel</Label>
                <div className="grid grid-cols-5 gap-1.5">
                  {DAGDELEN.map((dd) => (
                    <button
                      key={dd.key}
                      type="button"
                      onClick={() => kiesDagdeel(dd.key)}
                      className={`rounded border px-1.5 py-2 text-xs text-center transition-all ${dialoog.dagdeel === dd.key ? "border-primary bg-primary/10 text-primary font-medium" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
                    >
                      <p className="font-medium">{dd.label}</p>
                      <p className="text-[9px] opacity-70 leading-tight">{dd.sub}</p>
                    </button>
                  ))}
                </div>

                {/* Tijdsloten-picker */}
                {dialoog.dagdeel === "tijdsloten" && (
                  <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-600">Selecteer blokken (07:30–16:00, pauze 12:00–12:30)</p>
                      {dialoog.geselecteerdeTijdsloten.length > 0 && (
                        <p className="text-xs text-primary font-medium">
                          {dialoog.geselecteerdeTijdsloten.length * 0.5}u · {dialoog.tijd_start}–{dialoog.tijd_eind}
                        </p>
                      )}
                    </div>
                    {[HALVE_UREN.slice(0, 9), HALVE_UREN.slice(9, 16)].map((rij, ri) => (
                      <div key={ri} className={`grid gap-1 ${ri === 0 ? "grid-cols-9" : "grid-cols-7"}`}>
                        {rij.map((slot) => {
                          const actief = dialoog.geselecteerdeTijdsloten.includes(slot);
                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => toggleTijdslot(slot)}
                              className={`rounded text-[9px] font-mono py-1.5 border transition-all select-none ${actief ? "bg-primary text-white border-primary font-semibold" : "bg-white text-slate-500 border-slate-200 hover:border-primary/40 hover:bg-primary/5"}`}
                            >
                              {slot}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                    {dialoog.geselecteerdeTijdsloten.length === 0 && (
                      <p className="text-[10px] text-muted-foreground text-center pt-0.5">Geen blokken geselecteerd</p>
                    )}
                  </div>
                )}

                {/* Specifiek */}
                {dialoog.dagdeel === "specifiek" && (
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Starttijd</Label>
                      <Input type="time" value={dialoog.tijd_start} onChange={(e) => setDialoog((d) => d ? { ...d, tijd_start: e.target.value } : d)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Eindtijd</Label>
                      <Input type="time" value={dialoog.tijd_eind} onChange={(e) => setDialoog((d) => d ? { ...d, tijd_eind: e.target.value } : d)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Uren</Label>
                      <Input type="number" step="0.5" min="0.5" max="12" value={dialoog.uren} onChange={(e) => setDialoog((d) => d ? { ...d, uren: e.target.value } : d)} />
                    </div>
                  </div>
                )}
              </div>

              {/* Medewerkers */}
              <div className="space-y-1.5">
                <Label>{bewerkenId ? "Medewerker" : "Medewerkers (meerdere mogelijk)"}</Label>
                <div className="max-h-44 overflow-y-auto rounded border divide-y">
                  {(medewerkers as Medewerker[]).length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3">Geen medewerkers gevonden.</p>
                  ) : (medewerkers as Medewerker[]).map((m) => {
                    const geselecteerd = dialoog.geselecteerdeMedewerkers.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors ${geselecteerd ? "bg-primary/5" : ""}`}
                      >
                        <Checkbox
                          checked={geselecteerd}
                          onCheckedChange={() => toggleMedewerker(m.id)}
                          disabled={bewerkenId !== null && !geselecteerd}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">{m.naam}</p>
                          {m.functie && <p className="text-xs text-muted-foreground">{m.functie}</p>}
                        </div>
                      </label>
                    );
                  })}
                </div>
                {!bewerkenId && dialoog.geselecteerdeMedewerkers.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    {dialoog.geselecteerdeMedewerkers.length} medewerkers geselecteerd — er worden {dialoog.geselecteerdeMedewerkers.length} afzonderlijke planningitems aangemaakt.
                  </p>
                )}
              </div>

              {/* Notities */}
              <div className="space-y-1.5">
                <Label>Notities</Label>
                <Textarea
                  rows={2}
                  value={dialoog.notities}
                  onChange={(e) => setDialoog((d) => d ? { ...d, notities: e.target.value } : d)}
                  placeholder="Aanvullende opmerkingen..."
                />
              </div>

              {/* AI Reistijd */}
              {(() => {
                if (!dialoog.gebouw_id || !dialoog.datum || dialoog.geselecteerdeMedewerkers.length !== 1) return null;
                const medId = dialoog.geselecteerdeMedewerkers[0]!;
                const andereItems = (items as PlanItem[]).filter(
                  (it) => it.medewerker_id === medId &&
                          it.datum_start === dialoog.datum &&
                          it.gebouw_id && it.gebouw_id !== dialoog.gebouw_id &&
                          (!bewerkenId || it.id !== bewerkenId),
                );
                if (andereItems.length === 0) return null;
                const huidigGebouw = (gebouwen as Gebouw[]).find((g) => g.id === dialoog.gebouw_id);
                const eersteAnder = andereItems[0]!;
                const anderGebouw = (gebouwen as Gebouw[]).find((g) => g.id === eersteAnder.gebouw_id);
                const locatieA = anderGebouw
                  ? [anderGebouw.naam, anderGebouw.adres, anderGebouw.stad].filter(Boolean).join(", ")
                  : (eersteAnder.gebouw_naam ?? eersteAnder.titel);
                const locatieB = huidigGebouw
                  ? [huidigGebouw.naam, huidigGebouw.adres, huidigGebouw.stad].filter(Boolean).join(", ")
                  : dialoog.titel;
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-blue-500" />
                        Reistijd (AI)
                      </Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={reistijdMut.isPending}
                        onClick={() => reistijdMut.mutate({ data: { locatie_a: locatieA, locatie_b: locatieB } })}
                      >
                        {reistijdMut.isPending ? "Berekenen..." : reistijdSchatting ? "Opnieuw" : "Bereken"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Monteur heeft ook {eersteAnder.gebouw_naam ?? eersteAnder.titel} op deze dag.
                    </p>
                    {reistijdMut.isPending && (
                      <div className="rounded-md border bg-blue-50 p-3 text-xs text-blue-700">AI berekent reistijd...</div>
                    )}
                    {reistijdSchatting && !reistijdMut.isPending && (
                      <div className="rounded-md border bg-blue-50 p-3 space-y-0.5">
                        <p className="text-sm font-medium text-blue-900">
                          ~{reistijdSchatting.minuten} minuten reistijd
                          {reistijdSchatting.onzeker && <span className="text-xs text-blue-600 ml-1">(schatting)</span>}
                        </p>
                        <p className="text-xs text-blue-700">{reistijdSchatting.beschrijving}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Paneel-footer */}
            <div className="shrink-0 px-5 py-4 border-t bg-slate-50/80 flex items-center gap-2">
              {bewerkenId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => { deleteMut.mutate({ id: bewerkenId }); sluitDialoog(); }}
                >
                  Verwijderen
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={sluitDialoog}>Annuleren</Button>
              <Button
                size="sm"
                onClick={handleOpslaan}
                disabled={!dialoog.titel || !dialoog.datum || opslaan}
              >
                {opslaan ? "Bezig..." : bewerkenId ? "Opslaan" : dialoog.geselecteerdeMedewerkers.length > 1 ? `${dialoog.geselecteerdeMedewerkers.length} items toevoegen` : "Toevoegen"}
              </Button>
            </div>
          </aside>
        )}

      </div>

      {/* ── Override-dialoog: inplannen op gesloten dag ─────────────── */}
      {overrideDialoog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[380px] space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-100 p-2">
                <Lock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Gesloten dag</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(overrideDialoog.datum + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-700">
              <span className="font-medium">{overrideDialoog.naam}</span> is een gesloten dag
              {overrideDialoog.bron === "feestdag" ? " (feestdag)" : " (bedrijfssluiting)"}.
              Inplannen op deze dag is niet standaard toegestaan.
            </p>
            <p className="text-xs text-muted-foreground">
              Voer de override-code in om toch in te plannen. Alleen hoofdbeheerders kennen deze code.
            </p>
            <div className="space-y-1.5">
              <Input
                type="password"
                placeholder="Override-code"
                value={overrideCode}
                onChange={(e) => { setOverrideCode(e.target.value); setOverrideError(null); }}
                onKeyDown={(e) => e.key === "Enter" && bevestigOverride()}
                autoFocus
              />
              {overrideError && <p className="text-xs text-destructive">{overrideError}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => { setOverrideDialoog(null); setOverrideCode(""); setOverrideError(null); }}>
                Annuleren
              </Button>
              <Button size="sm" onClick={bevestigOverride}>
                Doorgaan
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bedrijfssluitingen beheer-dialoog ───────────────────────── */}
      {sluitingenDialoog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-sm font-semibold">Gesloten dagen beheren</h2>
              <button onClick={() => setSluitingenDialoog(false)} className="rounded-md p-1.5 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Nieuwe sluiting toevoegen */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nieuwe bedrijfssluiting toevoegen</h3>
                <div className="space-y-2">
                  <Input
                    placeholder="Naam (bijv. Kerstvakantie, Bouwvak)"
                    value={nieuweSluitingNaam}
                    onChange={(e) => setNieuweSluitingNaam(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Van</Label>
                      <Input type="date" value={nieuweSluitingVan} onChange={(e) => setNieuweSluitingVan(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Tot en met</Label>
                      <Input type="date" value={nieuweSluitingTot} onChange={(e) => setNieuweSluitingTot(e.target.value)} />
                    </div>
                  </div>
                  <Select value={nieuweSluitingType} onValueChange={setNieuweSluitingType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bedrijfssluiting">Bedrijfssluiting</SelectItem>
                      <SelectItem value="bouwvak">Bouwvak</SelectItem>
                      <SelectItem value="vakantie">Vakantie</SelectItem>
                      <SelectItem value="overig">Overig</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={voegSluitingToe}
                    disabled={!nieuweSluitingNaam || !nieuweSluitingVan || !nieuweSluitingTot || createSluitingMut.isPending}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Toevoegen
                  </Button>
                </div>
              </div>

              {/* Bestaande sluitingen */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Bestaande bedrijfssluitingen ({(bedrijfssluitingen as Array<{ id: number; naam: string; datum_start: string; datum_eind: string; type: string | null }>).length})
                </h3>
                {(bedrijfssluitingen as Array<{ id: number; naam: string; datum_start: string; datum_eind: string; type: string | null }>).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Geen bedrijfssluitingen geregistreerd.</p>
                ) : (
                  <div className="divide-y rounded border">
                    {(bedrijfssluitingen as Array<{ id: number; naam: string; datum_start: string; datum_eind: string; type: string | null }>).map((s) => (
                      <div key={s.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-slate-50">
                        <div>
                          <p className="text-sm font-medium">{s.naam}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(s.datum_start + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                            {" — "}
                            {new Date(s.datum_eind + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                            {s.type && <span className="ml-2 opacity-60">({s.type})</span>}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteSluitingMut.mutate({ id: s.id })}
                          className="rounded p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Verwijderen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground bg-slate-50 rounded p-3">
                Feestdagen worden automatisch bepaald via de feestdagenkalender en hoeven hier niet ingevoerd te worden.
                Override-code voor het inplannen op een gesloten dag: vraag dit bij de systeembeheerder op.
              </p>
            </div>
          </div>
        </div>
      )}

    </TooltipProvider>
  );
}

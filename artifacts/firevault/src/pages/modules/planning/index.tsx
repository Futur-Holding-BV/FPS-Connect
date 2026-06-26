import { useState, useMemo } from "react";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronLeft, ChevronRight, Plus, AlertTriangle, Users, CalendarCheck,
  Briefcase, Clock, RefreshCw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

// ── Constanten ─────────────────────────────────────────────────────────────

const WERKDAGEN = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag"];
const WERKDAGEN_KORT = ["Ma", "Di", "Wo", "Do", "Vr"];

const DAGDELEN = [
  { key: "ochtend", label: "Ochtend", sub: "08:00–12:00", tijd_start: "08:00", tijd_eind: "12:00", uren: 4 },
  { key: "middag", label: "Middag", sub: "13:00–17:00", tijd_start: "13:00", tijd_eind: "17:00", uren: 4 },
  { key: "volledig", label: "Volledig", sub: "08:00–17:00", tijd_start: "08:00", tijd_eind: "17:00", uren: 8 },
  { key: "specifiek", label: "Specifiek", sub: "eigen tijden", tijd_start: "", tijd_eind: "", uren: 0 },
] as const;

type DagdeelKey = "ochtend" | "middag" | "volledig" | "specifiek";

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-slate-100 border-slate-300 text-slate-600",
  ingepland: "bg-blue-50 border-blue-300 text-blue-800",
  bevestigd: "bg-green-50 border-green-300 text-green-800",
  uitgevoerd: "bg-emerald-50 border-emerald-300 text-emerald-800",
  geannuleerd: "bg-red-50 border-red-200 text-red-600 opacity-60",
};

const DAGDEEL_KLEUR: Record<string, string> = {
  ochtend: "bg-amber-50 text-amber-700 border-amber-200",
  middag: "bg-sky-50 text-sky-700 border-sky-200",
  volledig: "bg-violet-50 text-violet-700 border-violet-200",
};

const DIENSTVERBAND_KLEUR: Record<string, string> = {
  inhuur: "bg-orange-50 text-orange-700 border-orange-200",
  onderaannemer: "bg-purple-50 text-purple-700 border-purple-200",
  uitzend: "bg-amber-50 text-amber-700 border-amber-200",
};

// ── Hulpfuncties ───────────────────────────────────────────────────────────

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

function weekLabel(maandag: Date): string {
  const vrijdag = new Date(maandag);
  vrijdag.setDate(maandag.getDate() + 4);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  return `${maandag.toLocaleDateString("nl-NL", opts)} – ${vrijdag.toLocaleDateString("nl-NL", opts)}`;
}

function weekNummer(d: Date): number {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7);
}

function dagdeelUitTijd(tijdStart?: string | null, tijdEind?: string | null): DagdeelKey {
  if (!tijdStart) return "volledig";
  if (tijdStart === "08:00" && tijdEind === "12:00") return "ochtend";
  if (tijdStart === "13:00" && tijdEind === "17:00") return "middag";
  if (tijdStart === "08:00" && tijdEind === "17:00") return "volledig";
  return "specifiek";
}

function dagdeelLabel(tijdStart?: string | null, tijdEind?: string | null): string {
  if (!tijdStart) return "";
  if (tijdStart === "08:00" && tijdEind === "12:00") return "08-12";
  if (tijdStart === "13:00" && tijdEind === "17:00") return "13-17";
  if (tijdStart === "08:00" && tijdEind === "17:00") return "08-17";
  return tijdStart.slice(0, 5) + "–" + (tijdEind?.slice(0, 5) ?? "");
}

// ── Types ──────────────────────────────────────────────────────────────────

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
  stad?: string | null;
};

type DialooglItem = {
  geselecteerdeMedewerkers: number[];
  gebouw_id: number | null;
  datum: string;
  dagdeel: DagdeelKey;
  tijd_start: string;
  tijd_eind: string;
  titel: string;
  uren: string;
  status: string;
  type: string;
  project_naam: string;
  notities: string;
};

// ── Lege staat met diagnose ─────────────────────────────────────────────────
// Gemount als apart component zodat de hook onvoorwaardelijk draait (geen enabled-prop nodig).

function PlanningLegeStaat({ onVernieuwen }: { onVernieuwen: () => void }) {
  const { data: diagnose, isLoading } = useGetPlanningDiagnose({
    query: { queryKey: ["planning-diagnose"] },
  });

  return (
    <CardContent className="py-14 text-center text-muted-foreground">
      <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
      <p className="text-sm font-medium text-slate-700">Geen uitvoerende medewerkers zichtbaar</p>
      <p className="text-xs mt-1 text-muted-foreground">
        Alleen medewerkers met een uitvoerende functie verschijnen hier.
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
      ) : diagnose && diagnose.oorzaken.length > 0 ? (
        <div className="mt-5 space-y-2 max-w-xs mx-auto text-left">
          {diagnose.oorzaken.map((o) => (
            <div
              key={o.reden}
              className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-md px-3 py-2"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <span className="text-amber-800">
                <span className="font-semibold">{o.aantal}</span>{" "}
                {o.omschrijving.charAt(0).toLowerCase() + o.omschrijving.slice(1)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button variant="outline" size="sm" onClick={onVernieuwen}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Vernieuwen
        </Button>
        <Button size="sm" asChild>
          <Link href="/personeel">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Medewerker toevoegen in HRM
          </Link>
        </Button>
      </div>
    </CardContent>
  );
}

// ── Hoofdcomponent ─────────────────────────────────────────────────────────

export default function ModulesPlanning() {
  const [maandag, setMaandag] = useState(() => maandagVanWeek(new Date()));
  const [activeTab, setActiveTab] = useState<"medewerkers" | "projecten">("medewerkers");
  const [dialoog, setDialoog] = useState<DialooglItem | null>(null);
  const [bewerkenId, setBewerkenId] = useState<number | null>(null);
  const [opslaan, setOpslaan] = useState(false);
  const [filterWerkmaatschappij, setFilterWerkmaatschappij] = useState<string>("alle");
  const [filterDienstverband, setFilterDienstverband] = useState<string>("alle");
  const [filterAlleenUitvoerend, setFilterAlleenUitvoerend] = useState(false);

  const queryClient = useQueryClient();

  const datumStrings = WERKDAGEN.map((_, i) => {
    const d = new Date(maandag);
    d.setDate(maandag.getDate() + i);
    return datumNaarStr(d);
  });

  const van = datumStrings[0]!;
  const tot = datumStrings[4]!;
  const vandaagStr = datumNaarStr(new Date());

  const { data: items = [], isLoading: itemsLoading } = useListPlanningItems(
    { van, tot },
    { query: { queryKey: ["planning-items", van, tot] } }
  );
  const medewerkersParams = {
    ...(filterAlleenUitvoerend ? { alleen_uitvoerend: true } : {}),
    ...(filterWerkmaatschappij !== "alle" ? { werkmaatschappij: filterWerkmaatschappij } : {}),
    ...(filterDienstverband !== "alle" ? { dienstverband: filterDienstverband } : {}),
  };
  const { data: medewerkers = [], isLoading: medewerkersLoading, refetch: refetchMedewerkers } = useListPlanningMedewerkers(
    medewerkersParams,
    { query: { queryKey: ["planning-medewerkers", filterAlleenUitvoerend, filterWerkmaatschappij, filterDienstverband] } }
  );
  const { data: afwezigheid = [] } = useListPlanningAfwezigheid(
    {},
    { query: { queryKey: ["planning-afwezigheid"] } }
  );
  const { data: gebouwen = [] } = useListGebouwen(
    {},
    { query: { queryKey: ["gebouwen-planning"] } }
  );

  const createMut = useCreatePlanningItem({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["planning-items"] }),
    },
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
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["planning-items"] }),
    },
  });

  // ── Navigatie ───────────────────────────────────────────────────────────

  function vorigeWeek() {
    setMaandag((m) => { const n = new Date(m); n.setDate(n.getDate() - 7); return n; });
  }
  function volgendeWeek() {
    setMaandag((m) => { const n = new Date(m); n.setDate(n.getDate() + 7); return n; });
  }
  function vandaag() { setMaandag(maandagVanWeek(new Date())); }

  function sluitDialoog() {
    setDialoog(null);
    setBewerkenId(null);
    setOpslaan(false);
  }

  // ── Dialoog openen ─────────────────────────────────────────────────────

  function openNieuw(medewerkerId?: number, datum?: string) {
    setBewerkenId(null);
    setDialoog({
      geselecteerdeMedewerkers: medewerkerId ? [medewerkerId] : [],
      gebouw_id: null,
      datum: datum ?? datumStrings[0]!,
      dagdeel: "volledig",
      tijd_start: "08:00",
      tijd_eind: "17:00",
      titel: "",
      uren: "8",
      status: "ingepland",
      type: "project",
      project_naam: "",
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
      tijd_start: item.tijd_start ?? dagdeelDef?.tijd_start ?? "08:00",
      tijd_eind: item.tijd_eind ?? dagdeelDef?.tijd_eind ?? "17:00",
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
    setDialoog((d) => d ? {
      ...d,
      dagdeel: key,
      tijd_start: def.tijd_start,
      tijd_eind: def.tijd_eind,
      uren: def.uren ? String(def.uren) : d.uren,
    } : d);
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
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...d, geselecteerdeMedewerkers: Array.from(set) };
    });
  }

  async function handleOpslaan() {
    if (!dialoog || !dialoog.datum || !dialoog.titel) return;
    setOpslaan(true);

    const payload = {
      titel: dialoog.titel,
      datum_start: dialoog.datum,
      datum_eind: dialoog.datum,
      tijd_start: dialoog.dagdeel !== "specifiek" ? dialoog.tijd_start || null : dialoog.tijd_start || null,
      tijd_eind: dialoog.dagdeel !== "specifiek" ? dialoog.tijd_eind || null : dialoog.tijd_eind || null,
      uren: parseFloat(dialoog.uren) || 8,
      status: dialoog.status,
      type: dialoog.type,
      gebouw_id: dialoog.gebouw_id ?? undefined,
      project_naam: dialoog.project_naam || undefined,
      notities: dialoog.notities || undefined,
    };

    try {
      if (bewerkenId) {
        const medewerker_id = dialoog.geselecteerdeMedewerkers[0] ?? undefined;
        await updateMut.mutateAsync({ id: bewerkenId, data: { ...payload, medewerker_id } });
      } else {
        const medewerkers_ids = dialoog.geselecteerdeMedewerkers.length
          ? dialoog.geselecteerdeMedewerkers
          : [undefined];
        for (const mid of medewerkers_ids) {
          await createMut.mutateAsync({ data: { ...payload, medewerker_id: mid ?? null } });
        }
        queryClient.invalidateQueries({ queryKey: ["planning-items"] });
        sluitDialoog();
      }
    } finally {
      setOpslaan(false);
    }
  }

  // ── Berekeningen ────────────────────────────────────────────────────────

  const weekUrenPerMedewerker = useMemo(() => {
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
      for (const dag of datumStrings) {
        if (dag >= af.datum_start && dag <= af.datum_eind) kaart.add(`${af.medewerker_id}_${dag}`);
      }
    }
    return kaart;
  }, [afwezigheid, datumStrings]);

  // Projecten-view: groepeer items per gebouw/project
  const projectGroepen = useMemo(() => {
    const map = new Map<string, {
      sleutel: string;
      naam: string;
      gebouw_id?: number | null;
      items: PlanItem[];
    }>();
    for (const item of items as PlanItem[]) {
      const sleutel = item.gebouw_id ? `g:${item.gebouw_id}` : `p:${item.project_naam ?? item.titel}`;
      const naam = item.gebouw_naam ?? item.project_naam ?? item.titel;
      if (!map.has(sleutel)) map.set(sleutel, { sleutel, naam, gebouw_id: item.gebouw_id, items: [] });
      map.get(sleutel)!.items.push(item);
    }
    return Array.from(map.values()).sort((a, b) => a.naam.localeCompare(b.naam));
  }, [items]);

  const isLoading = itemsLoading || medewerkersLoading;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="p-6 space-y-5 max-w-full">

        {/* Koptekst */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Planning</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Week {weekNummer(maandag)} — {weekLabel(maandag)}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            <Button size="sm" onClick={() => openNieuw()}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Inplannen
            </Button>
            <Button variant="outline" size="sm" onClick={vandaag}>Vandaag</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={vorigeWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={volgendeWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
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
        </div>

        {/* Filterbar (medewerkers-tab) */}
        {activeTab === "medewerkers" && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-slate-50/60 px-4 py-3">
            <span className="text-xs font-medium text-muted-foreground shrink-0">Filter:</span>
            <Select value={filterWerkmaatschappij} onValueChange={setFilterWerkmaatschappij}>
              <SelectTrigger className="h-8 text-xs w-48">
                <SelectValue placeholder="Werkmaatschappij" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle werkmaatschappijen</SelectItem>
                <SelectItem value="FPS Brandpreventie">FPS Brandpreventie</SelectItem>
                <SelectItem value="FPS Bouw">FPS Bouw</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDienstverband} onValueChange={setFilterDienstverband}>
              <SelectTrigger className="h-8 text-xs w-40">
                <SelectValue placeholder="Dienstverband" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle dienstverbanden</SelectItem>
                <SelectItem value="vast">Vast</SelectItem>
                <SelectItem value="tijdelijk">Tijdelijk</SelectItem>
                <SelectItem value="zzp">ZZP</SelectItem>
                <SelectItem value="uitzend">Uitzend</SelectItem>
                <SelectItem value="inhuur">Inhuur</SelectItem>
                <SelectItem value="onderaannemer">Onderaannemer</SelectItem>
              </SelectContent>
            </Select>
            <button
              className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition-colors ${filterAlleenUitvoerend ? "border-primary bg-primary/10 text-primary font-medium" : "border-slate-200 bg-white text-muted-foreground hover:border-slate-300"}`}
              onClick={() => setFilterAlleenUitvoerend((v) => !v)}
              type="button"
            >
              Alleen uitvoerend
            </button>
            {(filterWerkmaatschappij !== "alle" || filterDienstverband !== "alle" || filterAlleenUitvoerend) && (
              <button
                className="text-xs text-muted-foreground underline hover:text-slate-700"
                onClick={() => { setFilterWerkmaatschappij("alle"); setFilterDienstverband("alle"); setFilterAlleenUitvoerend(false); }}
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

        {/* ── TAB: MEDEWERKERS ─────────────────────────────────────────────── */}
        {activeTab === "medewerkers" && (
          <Card className="overflow-hidden">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : (medewerkers as Medewerker[]).length === 0 ? (
              <PlanningLegeStaat onVernieuwen={() => { void refetchMedewerkers(); }} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-48" />
                    {WERKDAGEN.map((_, i) => <col key={i} />)}
                  </colgroup>
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Medewerker
                      </th>
                      {datumStrings.map((dag, i) => (
                        <th
                          key={dag}
                          className={`px-2 py-3 text-center text-xs font-medium uppercase tracking-wide ${dag === vandaagStr ? "bg-primary/5 text-primary" : "text-muted-foreground"}`}
                        >
                          <div>{WERKDAGEN_KORT[i]}</div>
                          <div className={`text-base font-semibold mt-0.5 ${dag === vandaagStr ? "text-primary" : "text-slate-800"}`}>
                            {new Date(dag + "T00:00:00").getDate()}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(medewerkers as Medewerker[]).map((med) => {
                      const weekUren = weekUrenPerMedewerker.get(med.id) ?? 0;
                      const contractUren = med.contracturen_per_week ?? 40;
                      const overGepland = weekUren > contractUren;
                      return (
                        <tr key={med.id} className="hover:bg-slate-50/40 transition-colors">
                          <td className="px-4 py-2 border-r bg-white">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-slate-800">{med.naam}</p>
                                {med.functie && (
                                  <p className="text-xs text-muted-foreground">{med.functie}</p>
                                )}
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
                                    Overplanning: {weekUren}u gepland, {contractUren}u contract
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <span className={overGepland ? "text-amber-600 font-medium" : ""}>{weekUren}u</span>
                              <span>/</span>
                              <span>{contractUren}u</span>
                            </div>
                            <div className="mt-1 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-1 rounded-full transition-all ${overGepland ? "bg-amber-400" : "bg-primary"}`}
                                style={{ width: `${Math.min(100, (weekUren / contractUren) * 100)}%` }}
                              />
                            </div>
                          </td>
                          {datumStrings.map((dag) => {
                            const dagItems = (items as PlanItem[])
                              .filter((it) => it.medewerker_id === med.id && it.datum_start <= dag && it.datum_eind >= dag)
                              .sort((a, b) => (a.tijd_start ?? "00:00").localeCompare(b.tijd_start ?? "00:00"));
                            const isAfwezig = afwezigheidDagen.has(`${med.id}_${dag}`);
                            const isVandaag = dag === vandaagStr;
                            return (
                              <td
                                key={dag}
                                className={`px-1.5 py-1.5 align-top border-l ${isVandaag ? "bg-primary/5" : ""}`}
                                style={{ minHeight: 80, verticalAlign: "top" }}
                              >
                                <div className="space-y-1">
                                  {isAfwezig && dagItems.length === 0 && (
                                    <div className="rounded border border-orange-200 bg-orange-50 px-1.5 py-1 text-xs text-orange-700">
                                      Afwezig
                                    </div>
                                  )}
                                  {dagItems.map((item) => {
                                    const ddLabel = dagdeelLabel(item.tijd_start, item.tijd_eind);
                                    const dd = dagdeelUitTijd(item.tijd_start, item.tijd_eind);
                                    const projectLabel = item.gebouw_naam ?? item.project_naam ?? item.titel;
                                    return (
                                      <Tooltip key={item.id}>
                                        <TooltipTrigger asChild>
                                          <button
                                            className={`w-full rounded border px-1.5 py-1 text-left text-xs transition-all hover:opacity-80 ${STATUS_KLEUR[item.status] ?? STATUS_KLEUR["concept"]}`}
                                            onClick={() => openBewerken(item)}
                                          >
                                            {ddLabel && (
                                              <span className={`inline-block rounded px-1 py-0 text-[10px] font-mono mr-1 border ${DAGDEEL_KLEUR[dd] ?? "bg-slate-50 text-slate-500 border-slate-200"}`}>
                                                {ddLabel}
                                              </span>
                                            )}
                                            <span className="font-medium truncate">{projectLabel}</span>
                                            <span className="block text-[10px] text-muted-foreground">{item.uren}u</span>
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="font-medium">{item.titel}</p>
                                          {item.gebouw_naam && <p className="text-xs">{item.gebouw_naam}</p>}
                                          {item.project_naam && item.project_naam !== item.gebouw_naam && (
                                            <p className="text-xs opacity-70">{item.project_naam}</p>
                                          )}
                                          <p className="text-xs">{item.uren} uur · {item.status}</p>
                                          {item.notities && <p className="text-xs opacity-70">{item.notities}</p>}
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  })}
                                  <button
                                    className="w-full rounded p-0.5 text-xs text-muted-foreground opacity-0 hover:opacity-100 hover:bg-slate-200 hover:text-slate-700 transition-all"
                                    onClick={() => openNieuw(med.id, dag)}
                                  >
                                    <Plus className="h-3 w-3 inline" />
                                  </button>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* ── TAB: PROJECTEN ───────────────────────────────────────────────── */}
        {activeTab === "projecten" && (
          <div className="space-y-3">
            {itemsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
              </div>
            ) : projectGroepen.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Geen projecten gepland deze week.</p>
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
                const geplandeD = [...new Set(projectItems.map((it) => it.datum_start))].sort();
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
                      {/* Medewerkers */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Medewerkers</p>
                        <div className="flex flex-wrap gap-1.5">
                          {uniekeMedewerkers.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Niet toegewezen</span>
                          ) : uniekeMedewerkers.map(([id, naam]) => (
                            <Badge key={id} variant="secondary" className="text-xs">
                              {naam ?? `#${id}`}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Geplande dagen */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Dagen deze week</p>
                        <div className="flex gap-1.5">
                          {datumStrings.map((dag, i) => {
                            const dagItemsProj = projectItems.filter((it) => it.datum_start <= dag && it.datum_eind >= dag);
                            const heeftItems = dagItemsProj.length > 0;
                            return (
                              <Tooltip key={dag}>
                                <TooltipTrigger asChild>
                                  <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-medium border transition-colors ${heeftItems ? "bg-primary text-white border-primary" : "bg-slate-50 text-muted-foreground border-slate-200"}`}>
                                    {WERKDAGEN_KORT[i]}
                                  </div>
                                </TooltipTrigger>
                                {heeftItems && (
                                  <TooltipContent>
                                    <p className="font-medium">{WERKDAGEN[i]}</p>
                                    {dagItemsProj.map((it) => (
                                      <p key={it.id} className="text-xs">{it.medewerker_naam ?? "Onbekend"} · {dagdeelLabel(it.tijd_start, it.tijd_eind) || `${it.uren}u`}</p>
                                    ))}
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>

                      {/* Tijdslots */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Tijdslots deze week</p>
                        <div className="space-y-1">
                          {projectItems.slice(0, 4).map((it) => (
                            <div key={it.id} className="flex items-center gap-2 text-xs">
                              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="text-slate-500">{new Date(it.datum_start + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric" })}</span>
                              {it.tijd_start && (
                                <span className="font-mono text-slate-600">{dagdeelLabel(it.tijd_start, it.tijd_eind)}</span>
                              )}
                              <span className="text-muted-foreground">{it.medewerker_naam}</span>
                            </div>
                          ))}
                          {projectItems.length > 4 && (
                            <p className="text-xs text-muted-foreground">+{projectItems.length - 4} meer</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* Legenda (medewerkers-tab) */}
        {activeTab === "medewerkers" && (
          <div className="flex items-center flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="font-medium text-slate-600">Dagdeel:</span>
            {[
              { key: "ochtend", label: "Ochtend 08-12" },
              { key: "middag", label: "Middag 13-17" },
              { key: "volledig", label: "Volledig 08-17" },
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

        {/* ── DIALOOG ───────────────────────────────────────────────────────── */}
        <Dialog open={dialoog !== null} onOpenChange={sluitDialoog}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{bewerkenId ? "Planningitem bewerken" : "Inplannen"}</DialogTitle>
            </DialogHeader>
            {dialoog && (
              <div className="space-y-4 py-1">

                {/* Gebouw */}
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

                {/* Omschrijving werkzaamheid */}
                <div className="space-y-1.5">
                  <Label>Werkzaamheid *</Label>
                  <Input
                    value={dialoog.titel}
                    onChange={(e) => setDialoog((d) => d ? { ...d, titel: e.target.value } : d)}
                    placeholder="Bijv. Branddeur plaatsing, Inspectie, Overleg"
                  />
                </div>

                {/* Datum + Dagdeel */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Datum</Label>
                    <DatePicker
                      value={dialoog.datum}
                      onChange={(v) => setDialoog((d) => d ? { ...d, datum: v } : d)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select
                      value={dialoog.status}
                      onValueChange={(v) => setDialoog((d) => d ? { ...d, status: v } : d)}
                    >
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
                  <div className="grid grid-cols-4 gap-2">
                    {DAGDELEN.map((dd) => (
                      <button
                        key={dd.key}
                        type="button"
                        onClick={() => kiesDagdeel(dd.key)}
                        className={`rounded border px-2 py-2 text-xs text-center transition-all ${dialoog.dagdeel === dd.key ? "border-primary bg-primary/10 text-primary font-medium" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
                      >
                        <p className="font-medium">{dd.label}</p>
                        <p className="text-[10px] opacity-70">{dd.sub}</p>
                      </button>
                    ))}
                  </div>
                  {dialoog.dagdeel === "specifiek" && (
                    <div className="grid grid-cols-3 gap-3 mt-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Starttijd</Label>
                        <Input
                          type="time"
                          value={dialoog.tijd_start}
                          onChange={(e) => setDialoog((d) => d ? { ...d, tijd_start: e.target.value } : d)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Eindtijd</Label>
                        <Input
                          type="time"
                          value={dialoog.tijd_eind}
                          onChange={(e) => setDialoog((d) => d ? { ...d, tijd_eind: e.target.value } : d)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Uren</Label>
                        <Input
                          type="number"
                          step="0.5"
                          min="0.5"
                          max="12"
                          value={dialoog.uren}
                          onChange={(e) => setDialoog((d) => d ? { ...d, uren: e.target.value } : d)}
                        />
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
              </div>
            )}
            <DialogFooter>
              {bewerkenId && (
                <Button
                  variant="outline"
                  className="mr-auto text-destructive hover:text-destructive"
                  onClick={() => { deleteMut.mutate({ id: bewerkenId }); sluitDialoog(); }}
                >
                  Verwijderen
                </Button>
              )}
              <Button variant="outline" onClick={sluitDialoog}>Annuleren</Button>
              <Button
                onClick={handleOpslaan}
                disabled={!dialoog?.titel || !dialoog?.datum || opslaan}
              >
                {opslaan ? "Bezig..." : bewerkenId ? "Opslaan" : dialoog?.geselecteerdeMedewerkers && dialoog.geselecteerdeMedewerkers.length > 1 ? `${dialoog.geselecteerdeMedewerkers.length} items toevoegen` : "Toevoegen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
  );
}

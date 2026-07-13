import { useState } from "react";
import { useLocation } from "wouter";
import {
  TrendingUp, TrendingDown, AlertTriangle, Info, ChevronLeft, ChevronRight,
  Target, Euro, BarChart3, Activity, Building2, RefreshCw, BookOpen, Pencil, Check, X,
  ChevronDown, ChevronRight as ChevronRightIcon, ExternalLink, Receipt,
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, BarChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  useGetFiePrognose,
  useGetFieObservaties,
  useListFieLeermomenten,
  useHerberekeenFieLeermomenten,
  useUpdateFieLeermoment,
  useDeleteFieLeermoment,
  useGetFieNacalculatiesVerouderdAantal,
  useListFieNacalculaties,
  getListFieNacalculatiesQueryKey,
  useHerberekeenVerouderdeNacalculaties,
  useGetFactuurAnalyse,
  type FieJaarprognose,
  type FieWerkmaatschappijPrognose,
  type FieLeermoment,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useRol } from "@/context/rol-context";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

const OBSERVATIE_KLEUR: Record<string, string> = {
  info:         "border-blue-200 bg-blue-50 text-blue-800",
  waarschuwing: "border-amber-200 bg-amber-50 text-amber-800",
  kritiek:      "border-red-200 bg-red-50 text-red-800",
};

const ERNST_BADGE: Record<string, string> = {
  info:         "bg-blue-100 text-blue-700",
  waarschuwing: "bg-amber-100 text-amber-700",
  kritiek:      "bg-red-100 text-red-700",
};

// ─── KPI Kaart ───────────────────────────────────────────────────────────────

function KpiKaart({
  label, waarde, sub, trend, highlighted, icon: Icon,
}: {
  label: string; waarde: string; sub?: string;
  trend?: "pos" | "neg" | "neutraal"; highlighted?: boolean;
  icon?: React.ElementType;
}) {
  return (
    <Card className={cn(highlighted && "border-primary/30 bg-primary/5")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground font-medium truncate">{label}</p>
            <p className={cn(
              "text-xl font-bold mt-0.5 leading-tight",
              trend === "pos" && "text-green-700",
              trend === "neg" && "text-red-600",
              highlighted && !trend && "text-primary",
            )}>
              {waarde}
            </p>
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          {Icon && (
            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
        </div>
        {trend === "pos" && <TrendingUp className="w-3 h-3 text-green-500 mt-1" />}
        {trend === "neg" && <TrendingDown className="w-3 h-3 text-red-500 mt-1" />}
      </CardContent>
    </Card>
  );
}

// ─── Bezettingsgraad-meter (SVG boogmeter) ────────────────────────────────────

function BezettingsgraadMeter({ p }: { p: FieJaarprognose }) {
  const raw = p.coverage_pct ?? 0;
  const capped = Math.min(120, Math.max(0, raw));
  const angle = (capped / 120) * 180;

  const cx = 80;
  const cy = 80;
  const r = 60;

  function polarToXY(deg: number): [number, number] {
    const rad = ((deg - 180) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  function arcPath(startDeg: number, endDeg: number): string {
    const [x1, y1] = polarToXY(startDeg);
    const [x2, y2] = polarToXY(endDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  }

  const kleur =
    raw < 80  ? "#ef4444"
    : raw < 95 ? "#f59e0b"
    : raw > 110 ? "#3b82f6"
    : "#22c55e";

  return (
    <Card>
      <CardHeader className="pb-0 pt-4 px-4">
        <CardTitle className="text-sm font-medium">Bezettingsgraad</CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex flex-col items-center">
        <svg width="160" height="96" viewBox="0 0 160 96" className="overflow-visible">
          <path d={arcPath(0, 180)} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" strokeLinecap="round" />
          {angle > 0 && (
            <path d={arcPath(0, angle)} fill="none" stroke={kleur} strokeWidth="10" strokeLinecap="round" />
          )}
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize="18" fontWeight="700" fill={kleur}>
            {raw.toFixed(0)}%
          </text>
          <text x={cx} y={cy + 18} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))">
            van omzetdoel
          </text>
          <text x="8" y="90" fontSize="8" fill="hsl(var(--muted-foreground))">0%</text>
          <text x="134" y="90" fontSize="8" fill="hsl(var(--muted-foreground))">120%+</text>
        </svg>
        <div className="text-center -mt-1">
          <p className="text-[10px] text-muted-foreground">
            {fmt(p.prognose_omzet)} van {fmt(p.omzet_doel)}
          </p>
          {p.gap_tot_doel != null && (
            <p className={cn(
              "text-[10px] font-medium mt-0.5",
              p.gap_tot_doel < 0 ? "text-green-600" : "text-red-600",
            )}>
              {p.gap_tot_doel < 0
                ? `+${fmt(Math.abs(p.gap_tot_doel))} voorsprong`
                : `${fmt(p.gap_tot_doel)} tekort`}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Break-even indicator ─────────────────────────────────────────────────────

function BreakEvenIndicator({ p }: { p: FieJaarprognose }) {
  if (p.break_even_omzet == null) return null;
  const bereikt = p.break_even_bereikt;
  return (
    <Card className={cn(
      "border",
      bereikt === true  && "border-green-200 bg-green-50",
      bereikt === false && "border-red-200 bg-red-50",
    )}>
      <CardContent className="p-4 flex items-center gap-3">
        <Target className={cn(
          "w-8 h-8 shrink-0",
          bereikt === true  && "text-green-600",
          bereikt === false && "text-red-500",
          bereikt == null   && "text-muted-foreground",
        )} />
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground font-medium">Break-even omzet</p>
          <p className="text-base font-bold">{fmt(p.break_even_omzet)}</p>
          <p className="text-[10px] text-muted-foreground">
            {p.doel_marge_pct != null ? `Bij doelmarge ${p.doel_marge_pct.toFixed(1)}%` : "Doelmarge onbekend"}
          </p>
        </div>
        <div className="ml-auto">
          {bereikt === true  && <Badge className="bg-green-100 text-green-700 border-0 text-xs">Bereikt</Badge>}
          {bereikt === false && <Badge className="bg-red-100 text-red-700 border-0 text-xs">Niet bereikt</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Kwartaalchart (prognose vs. begroting) ───────────────────────────────────

const KW_LABEL: Record<number, string> = { 1: "Q1", 2: "Q2", 3: "Q3", 4: "Q4" };

function KwartaalChart({ p }: { p: FieJaarprognose }) {
  const kwVerdeling = p.kwartaal_verdeling ?? [];
  const begrotingPerKw = p.begroting_per_kwartaal ?? [];
  if (kwVerdeling.length === 0) return null;

  const chartData = kwVerdeling.map(kw => {
    const bEntry = begrotingPerKw.find(b => b.kwartaal === kw.kwartaal);
    return {
      kwartaal: KW_LABEL[kw.kwartaal] ?? `Q${kw.kwartaal}`,
      bevestigd:  Math.round(kw.bevestigd / 1000),
      pipeline:   Math.round(kw.pipeline_gewogen / 1000),
      begroting:  bEntry ? Math.round(bEntry.begroting / 1000) : undefined,
    };
  });

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium">Kwartaalprognose vs. begroting (× €1.000)</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis dataKey="kwartaal" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} width={44} />
            <Tooltip
              formatter={(value: number) => [`€ ${(value * 1000).toLocaleString("nl-NL")}`, undefined]}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
            <Bar dataKey="bevestigd" name="Bevestigd" stackId="prognose" fill="#22c55e" radius={[0, 0, 2, 2]} />
            <Bar dataKey="pipeline" name="Pipeline" stackId="prognose" fill="#fbbf24" radius={[2, 2, 0, 0]} />
            {begrotingPerKw.length > 0 && (
              <Line
                dataKey="begroting"
                name="Begroting"
                type="monotone"
                stroke="hsl(12 90% 50%)"
                strokeWidth={2}
                dot={{ r: 4, fill: "hsl(12 90% 50%)" }}
                strokeDasharray="4 2"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Werkmaatschappij-vergelijking (staafdiagram per entiteit) ────────────────

function WerkmaatschappijChart({ verdeling }: { verdeling: FieWerkmaatschappijPrognose[] }) {
  const data = verdeling.map(v => ({
    werkmaatschappij: v.werkmaatschappij,
    bevestigd:        Math.round(v.bevestigd / 1000),
    pipeline:         Math.round(v.pipeline_gewogen / 1000),
    prognose:         Math.round(v.prognose / 1000),
  }));

  const totaal = verdeling.reduce((s, v) => s + v.prognose, 0);

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          <Building2 className="w-7 h-7 mx-auto mb-2 opacity-20" />
          Geen offertedata per werkmaatschappij beschikbaar voor dit boekjaar.
        </CardContent>
      </Card>
    );
  }

  const chartHeight = Math.max(120, data.length * 44);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">Werkmaatschappij-vergelijking (× €1.000)</CardTitle>
          <Badge variant="outline" className="text-[10px] gap-1">
            <Building2 className="w-3 h-3" />
            Totaal {fmt(totaal)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/50" />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="werkmaatschappij" tick={{ fontSize: 10 }} width={88} />
            <Tooltip
              formatter={(value: number) => [`€ ${(value * 1000).toLocaleString("nl-NL")}`, undefined]}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
            <Bar dataKey="bevestigd" name="Bevestigd" stackId="a" fill="#22c55e" />
            <Bar dataKey="pipeline"  name="Pipeline (gewogen)" stackId="a" fill="#fbbf24" radius={[0, 2, 2, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Observaties paneel ───────────────────────────────────────────────────────

function ObservatiesPaneel({ p, boekjaar }: { p: FieJaarprognose; boekjaar: number }) {
  const { data: obsResp } = useGetFieObservaties(boekjaar) as {
    data: { boekjaar: number; observaties: FieJaarprognose["observaties"] } | undefined;
  };
  const live = p.observaties ?? [];
  const persisteer = obsResp?.observaties ?? [];
  const lijst = live.length > 0 ? live : persisteer;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Signalen &amp; observaties</CardTitle>
          {lijst.length > 0 && (
            <Badge variant="outline" className="text-[10px]">{lijst.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2 max-h-72 overflow-y-auto">
        {lijst.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Activity className="w-7 h-7 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">Geen signalen voor dit boekjaar.</p>
          </div>
        ) : (
          lijst.map((obs, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2.5 text-xs",
                OBSERVATIE_KLEUR[obs.ernst] ?? "border-border bg-muted/20 text-muted-foreground",
              )}
            >
              {obs.ernst === "kritiek" || obs.ernst === "waarschuwing"
                ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                : <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <p className="leading-snug">{obs.omschrijving}</p>
                {obs.impact && (
                  <p className="text-[10px] font-medium mt-0.5 opacity-90">{obs.impact}</p>
                )}
                {obs.waarde != null && (
                  <p className="text-[10px] opacity-70 mt-0.5">
                    Waarde: {fmt(obs.waarde)}
                    {obs.drempelwaarde != null && ` · drempel: ${fmt(obs.drempelwaarde)}`}
                    {obs.afwijking_pct != null && ` · afwijking: ${obs.afwijking_pct.toFixed(1)}%`}
                  </p>
                )}
                {obs.advies && (
                  <p className="text-[10px] italic opacity-75 mt-0.5">Advies: {obs.advies}</p>
                )}
              </div>
              <span className={cn(
                "text-[9px] font-medium rounded px-1 py-0.5 leading-none whitespace-nowrap shrink-0",
                ERNST_BADGE[obs.ernst] ?? "bg-muted text-muted-foreground",
              )}>
                {obs.ernst}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ─── Orderportefeuille rij ────────────────────────────────────────────────────

function PortefeuilleRij({ p }: { p: FieJaarprognose }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="rounded-md border p-3">
        <p className="text-[10px] text-muted-foreground">Bevestigd (100%)</p>
        <p className="text-base font-semibold mt-0.5">{fmt(p.bevestigde_omzet)}</p>
        <p className="text-[10px] text-muted-foreground">
          {p.aantal_bevestigde_offertes} offerte{p.aantal_bevestigde_offertes !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="rounded-md border p-3">
        <p className="text-[10px] text-muted-foreground">Pipeline (gewogen)</p>
        <p className="text-base font-semibold mt-0.5">{fmt(p.gewogen_pipeline)}</p>
        <p className="text-[10px] text-muted-foreground">
          {p.aantal_pipeline_offertes} offerte{p.aantal_pipeline_offertes !== 1 ? "s" : ""}
          {p.pijplijn_bruto > 0 ? ` · bruto ${fmt(p.pijplijn_bruto)}` : ""}
        </p>
      </div>
      <div className="rounded-md border p-3">
        <p className="text-[10px] text-muted-foreground">OHW restwaarde</p>
        <p className="text-base font-semibold mt-0.5">{fmt(p.ohw_restwaarde)}</p>
        <p className="text-[10px] text-muted-foreground">
          {p.aantal_ohw_opdrachten} opdracht{p.aantal_ohw_opdrachten !== 1 ? "en" : ""}
        </p>
      </div>
      <div className="rounded-md border p-3">
        <p className="text-[10px] text-muted-foreground">AK-dekkingsgraad</p>
        <p className={cn(
          "text-base font-semibold mt-0.5",
          p.ak_dekkingsgraad_pct != null && p.ak_dekkingsgraad_pct >= 100 ? "text-green-700"
          : p.ak_dekkingsgraad_pct != null ? "text-red-600"
          : "",
        )}>
          {pct(p.ak_dekkingsgraad_pct)}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {p.totaal_ak > 0 ? `Totale AK: ${fmt(p.totaal_ak)}` : "Geen AK-posten"}
        </p>
      </div>
    </div>
  );
}

// ─── Leereffecten paneel ──────────────────────────────────────────────────────

function LeermomentRij({ lm, onSaved }: { lm: FieLeermoment; onSaved: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [bewerkModus, setBewerkModus] = useState(false);
  const [factorInput, setFactorInput] = useState(String(lm.correctie_factor));
  const [opmerkingenInput, setOpmerkingenInput] = useState(lm.opmerkingen ?? "");
  const [, setLocation] = useLocation();

  const { data: nacalculaties, isLoading: isLoadingNacalculaties } = useListFieNacalculaties(
    { werktype: lm.werktype },
    { query: { queryKey: getListFieNacalculatiesQueryKey({ werktype: lm.werktype }), enabled: isOpen } }
  );

  const patch = useUpdateFieLeermoment();
  const verwijder = useDeleteFieLeermoment();
  const { toast } = useToast();

  const verouderdAantal = useGetFieNacalculatiesVerouderdAantal();
  const herberekeenVerouderd = useHerberekeenVerouderdeNacalculaties();

  function startHerberekeenVerouderd() {
    herberekeenVerouderd.mutate(undefined, {
      onSuccess: (data: any) => {
        toast({ title: "Werktypes bijgewerkt", description: `${data.herberekend ?? 0} nacalculaties gecorrigeerd.` });
        onSaved();
      },
      onError: () => toast({ title: "Bijwerken mislukt", variant: "destructive" }),
    });
  }

  const factorGeldig = (() => {
    const f = Number(factorInput);
    return isFinite(f) && f >= 0.5 && f <= 3.0;
  })();

  function opslaan() {
    if (!factorGeldig) return;
    const factor = Number(factorInput);
    patch.mutate(
      { id: lm.id, data: { correctie_factor: factor, opmerkingen: opmerkingenInput || null } },
      {
        onSuccess: () => { setBewerkModus(false); onSaved(); },
        onError: () => toast({ title: "Opslaan mislukt", description: "Controleer de correctiefactor en probeer opnieuw.", variant: "destructive" }),
      },
    );
  }

  function afwijkingKleur(v: number | null | undefined) {
    if (v == null) return "text-muted-foreground";
    if (Math.abs(v) > 20) return v > 0 ? "text-red-600 font-semibold" : "text-green-700 font-semibold";
    if (Math.abs(v) > 10) return v > 0 ? "text-amber-600" : "text-green-600";
    return "text-foreground";
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <tr className="border-b last:border-0 text-sm hover:bg-muted/30">
        <td className="py-2 pr-3 pl-4">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-full justify-start font-medium capitalize px-1 gap-1">
              {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
              {lm.werktype}
            </Button>
          </CollapsibleTrigger>
        </td>
        <td className={cn("py-2 pr-3 text-right tabular-nums", afwijkingKleur(lm.afwijking_pct_arbeid))}>
          {lm.afwijking_pct_arbeid != null ? `${lm.afwijking_pct_arbeid > 0 ? "+" : ""}${lm.afwijking_pct_arbeid.toFixed(1)}%` : "—"}
        </td>
        <td className={cn("py-2 pr-3 text-right tabular-nums", afwijkingKleur(lm.afwijking_pct_materiaal))}>
          {lm.afwijking_pct_materiaal != null ? `${lm.afwijking_pct_materiaal > 0 ? "+" : ""}${lm.afwijking_pct_materiaal.toFixed(1)}%` : "—"}
        </td>
        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{lm.gebaseerd_op_n_projecten}</td>
        <td className="py-2 pr-3 text-right tabular-nums">
          {bewerkModus ? (
            <div className="flex flex-col items-end gap-0.5">
              <Input
                className={`h-7 w-20 text-xs text-right${!factorGeldig ? " border-red-500 focus-visible:ring-red-500" : ""}`}
                value={factorInput}
                onChange={e => setFactorInput(e.target.value)}
                type="number" step="0.01" min="0.5" max="3"
              />
              {!factorGeldig && (
                <span className="text-[10px] text-red-600 leading-tight text-right">0,5 – 3,0</span>
              )}
            </div>
          ) : (
            <span>{lm.correctie_factor.toFixed(2)}×</span>
          )}
        </td>
        <td className="py-2 pr-3 text-muted-foreground text-xs max-w-[160px] truncate">
          {bewerkModus ? (
            <Input
              className="h-7 text-xs"
              value={opmerkingenInput}
              onChange={e => setOpmerkingenInput(e.target.value)}
              placeholder="Toelichting..."
            />
          ) : (
            lm.opmerkingen ?? <span className="italic opacity-50">Geen toelichting</span>
          )}
        </td>
        <td className="py-2 text-right pr-2">
          {bewerkModus ? (
            <span className="flex justify-end gap-1">
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={opslaan} disabled={patch.isPending || !factorGeldig}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setBewerkModus(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </span>
          ) : (
            <span className="flex justify-end gap-1">
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setBewerkModus(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon" variant="ghost"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => { if (confirm(`Leermoment "${lm.werktype}" verwijderen?`)) verwijder.mutate({ id: lm.id }, { onSuccess: onSaved, onError: () => toast({ title: "Verwijderen mislukt", variant: "destructive" }) }); }}
                disabled={verwijder.isPending}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </span>
          )}
        </td>
      </tr>
      <tr>
        <td colSpan={7} className="p-0">
          <CollapsibleContent>
            <div className="bg-muted/20 px-4 py-3 border-b space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Gekoppelde opdrachten ({lm.werktype})</p>
              {isLoadingNacalculaties ? (
                <div className="flex items-center gap-2 py-2">
                  <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Opdrachten laden...</span>
                </div>
              ) : !nacalculaties || nacalculaties.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 italic">Geen opdrachten gevonden voor dit werktype.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {nacalculaties.map(n => (
                    <Button
                      key={n.id}
                      variant="outline"
                      size="sm"
                      className="h-auto py-1.5 px-2 justify-start text-left flex flex-col items-start gap-0.5"
                      onClick={() => setLocation(`/opdrachten/${n.opdracht_id}?tab=nacalculatie`)}
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="font-mono text-[10px] font-bold text-primary">{n.opdracht_nummer}</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <span className="text-[11px] truncate w-full">{n.opdracht_titel}</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </td>
      </tr>
    </Collapsible>
  );
}

function LeereffectenPaneel() {
  const { toast } = useToast();
  const { data: leermomenten, isLoading, refetch } = useListFieLeermomenten();
  const herbereken = useHerberekeenFieLeermomenten();
  const herberekeenVerouderd = useHerberekeenVerouderdeNacalculaties();
  const { data: verouderdAantalData, refetch: refetchVerouderdAantal } = useGetFieNacalculatiesVerouderdAantal();
  const [verouderdResultaat, setVerouderdResultaat] = useState<number | null>(null);

  const aantalVerouderd = verouderdAantalData?.aantal ?? 0;

  function startHerbereken() {
    herbereken.mutate(undefined, { 
      onSuccess: (data: any) => { 
        toast({ title: "Leermomenten herberekend", description: `${data.verwerkt ?? 0} werktypes bijgewerkt.` });
        void refetch(); 
      },
      onError: () => toast({ title: "Herberekening mislukt", variant: "destructive" }),
    });
  }

  function startHerberekeenVerouderd() {
    setVerouderdResultaat(null);
    herberekeenVerouderd.mutate(undefined, {
      onSuccess: (data: any) => {
        setVerouderdResultaat(data.herberekend);
        toast({ title: "Werktypes bijgewerkt", description: `${data.herberekend ?? 0} nacalculaties gecorrigeerd.` });
        void refetch();
        void refetchVerouderdAantal();
      },
      onError: () => toast({ title: "Bijwerken mislukt", variant: "destructive" }),
    });
  }

  return (
    <div className="space-y-4">
      {aantalVerouderd > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="text-xs">
            {aantalVerouderd === 1
              ? "1 nacalculatie heeft werktype \u201calgemeen\u201d maar het gebouw heeft inmiddels spots. Klik op \u201cWerktype bijwerken\u201d om dit te corrigeren."
              : `${aantalVerouderd} nacalculaties hebben werktype \u201calgemeen\u201d maar het gebouw heeft inmiddels spots. Klik op \u201cWerktype bijwerken\u201d om dit te corrigeren.`}
          </p>
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Leereffecten — nacalculatie-terugkoppeling</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gemiddelde afwijkingen per werktype over afgesloten projecten. Structurele afwijkingen worden meegewogen
            in nieuwe calculatieadviezen via de correctiefactor.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Button
            size="sm" variant="outline" className="gap-1.5"
            onClick={startHerbereken}
            disabled={herbereken.isPending}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", herbereken.isPending && "animate-spin")} />
            Herbereken
          </Button>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm" variant="outline" className="gap-1.5"
              onClick={startHerberekeenVerouderd}
              disabled={herberekeenVerouderd.isPending}
              title="Herbereken nacalculaties met werktype 'algemeen' waarbij het gebouw inmiddels spots heeft"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", herberekeenVerouderd.isPending && "animate-spin")} />
              Werktype bijwerken
            </Button>
            {aantalVerouderd > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 rounded-sm">
                {aantalVerouderd}
              </Badge>
            )}
          </div>
          {verouderdResultaat !== null && (
            <p className="text-xs text-muted-foreground">
              {verouderdResultaat === 0
                ? "Geen verouderde nacalculaties gevonden"
                : `${verouderdResultaat} nacalculatie${verouderdResultaat !== 1 ? "s" : ""} bijgewerkt`}
            </p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : !leermomenten || leermomenten.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm text-muted-foreground mb-1">Nog geen leereffecten beschikbaar</p>
            <p className="text-xs text-muted-foreground">
              Leermomenten worden dagelijks aangemaakt vanuit afgesloten projecten met een vastgestelde werkbegroting.
              Klik op "Herbereken" om direct te berekenen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b text-[11px] text-muted-foreground uppercase tracking-wide">
                  <th className="py-2 pr-3 text-left font-medium pl-4">Werktype</th>
                  <th className="py-2 pr-3 text-right font-medium">Afwijking arbeid</th>
                  <th className="py-2 pr-3 text-right font-medium">Afwijking materiaal</th>
                  <th className="py-2 pr-3 text-right font-medium">Projecten</th>
                  <th className="py-2 pr-3 text-right font-medium">Correctiefactor</th>
                  <th className="py-2 pr-3 font-medium">Toelichting</th>
                  <th className="py-2 text-right font-medium pr-2"></th>
                </tr>
              </thead>
              <tbody className="pl-4">
                {leermomenten.map(lm => (
                  <LeermomentRij key={lm.id} lm={lm} onSaved={() => void refetch()} />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="rounded-md border border-dashed p-3 bg-muted/20">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Afwijking arbeid = (werkelijk − begroot) / begroot × 100. Positief = meer uren dan begroot.
            Een correctiefactor van 1.10 voegt automatisch 10% toe aan het arbeidsadvies bij een nieuwe calculatie.
            Leermomenten worden dagelijks bijgewerkt (04:00).
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Geen toegang ─────────────────────────────────────────────────────────────

function GeenToegang() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
      <AlertTriangle className="w-10 h-10 text-muted-foreground/30" />
      <div>
        <p className="font-semibold">Geen toegang</p>
        <p className="text-sm text-muted-foreground mt-1">
          Het Bedrijfskompas is voorbehouden aan gebruikers met financieel niveau 2 of hoger.
        </p>
      </div>
    </div>
  );
}

// ─── Dashboard inhoud (hooks alleen renderen bij toegang) ─────────────────────

function FactuuranalyseTegel() {
  const [, setLocation] = useLocation();
  const { data } = useGetFactuurAnalyse({
    query: { queryKey: ["factuur-analyse"] },
  });
  const teBeoordelen = data?.te_beoordelen ?? 0;
  const afgekeurd = data?.afgekeurd ?? 0;
  const viaMailbox = data?.via_mailbox ?? 0;
  const ibanAfwijkingen = data?.iban_afwijkingen ?? 0;
  const openBedrag = data?.open_bedrag_incl_btw ?? null;
  const afkeurPerCategorie = data?.afkeur_per_categorie ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Receipt className="h-4 w-4 text-primary" />
            Factuuranalyse
          </CardTitle>
          <Button
            variant="ghost" size="sm" className="h-7 text-xs gap-1"
            onClick={() => setLocation("/facturen/controlebox")}
          >
            Naar controlebox
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-md border p-3">
            <p className="text-[11px] text-muted-foreground font-medium">Te beoordelen</p>
            <p className="text-xl font-bold mt-0.5 leading-tight">{teBeoordelen}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-[11px] text-muted-foreground font-medium">Afgekeurd</p>
            <p className={cn("text-xl font-bold mt-0.5 leading-tight", afgekeurd > 0 && "text-red-600")}>{afgekeurd}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-[11px] text-muted-foreground font-medium">Via postbus</p>
            <p className="text-xl font-bold mt-0.5 leading-tight">{viaMailbox}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-[11px] text-muted-foreground font-medium">IBAN-afwijkingen</p>
            <p className={cn("text-xl font-bold mt-0.5 leading-tight", ibanAfwijkingen > 0 && "text-amber-600")}>{ibanAfwijkingen}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>Openstaand (incl. btw): <strong className="text-foreground">{fmt(openBedrag != null ? Number(openBedrag) : null)}</strong></span>
          {afkeurPerCategorie.length > 0 && (
            <span className="flex flex-wrap items-center gap-2">
              Afkeur per reden:
              {afkeurPerCategorie.map((c, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] font-normal">
                  {(c.categorie ?? "Overig")}: {c.aantal ?? 0}
                </Badge>
              ))}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function KompasInhoud() {
  const [boekjaar, setBoekjaar] = useState(() => new Date().getFullYear());
  const [actieveTab, setActieveTab] = useState("prognose");

  const { data: p, isLoading } = useGetFiePrognose(boekjaar) as {
    data: FieJaarprognose | undefined;
    isLoading: boolean;
  };

  const { data: verouderdAantalData } = useGetFieNacalculatiesVerouderdAantal();
  const aantalVerouderd = verouderdAantalData?.aantal ?? 0;

  return (
    <div className="space-y-5 p-1">
      {/* Paginakop */}
      {aantalVerouderd > 0 && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p>
              Er zijn <strong>{aantalVerouderd}</strong> verouderde nacalculaties gedetecteerd (werktype 'algemeen' terwijl er spots zijn).
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="border-amber-300 hover:bg-amber-100 h-7 whitespace-nowrap"
            onClick={() => setActieveTab("leereffecten")}
          >
            Bekijken
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Bedrijfskompas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Realtime financieel directie-overzicht — prognose, bezettingsgraad en orderportefeuille
          </p>
        </div>
        {actieveTab === "prognose" && (
          <div className="flex items-center gap-1 border rounded-md px-2 py-1">
            <Button
              variant="ghost" size="icon" className="h-6 w-6"
              onClick={() => setBoekjaar(y => y - 1)}
              disabled={boekjaar <= 2020}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-sm font-semibold w-12 text-center">{boekjaar}</span>
            <Button
              variant="ghost" size="icon" className="h-6 w-6"
              onClick={() => setBoekjaar(y => y + 1)}
              disabled={boekjaar >= new Date().getFullYear() + 1}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <Tabs value={actieveTab} onValueChange={setActieveTab}>
        <TabsList className="h-8">
          <TabsTrigger value="prognose" className="text-xs">Prognose</TabsTrigger>
          <TabsTrigger value="leereffecten" className="text-xs gap-1.5">
            Leereffecten
            {aantalVerouderd > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-semibold leading-none min-w-[16px] h-4 px-1">
                {aantalVerouderd}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leereffecten" className="mt-4">
          <LeereffectenPaneel />
        </TabsContent>

        <TabsContent value="prognose" className="mt-4">

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-48 w-full" />)}
          </div>
          <Skeleton className="h-60 w-full" />
        </div>
      ) : !p ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-20" />
            Geen prognosedata beschikbaar voor {boekjaar}. Maak eerst een jaarbegroting aan in het FIE-beheer.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* 4 KPI-kaarten */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiKaart
              label="Prognose omzet"
              waarde={fmt(p.prognose_omzet)}
              sub={`Incl. OHW: ${fmt(p.prognose_inclusief_ohw)}`}
              highlighted
              icon={Euro}
            />
            <KpiKaart
              label="Prognose brutowinst"
              waarde={fmt(p.prognose_brutowinst)}
              sub={p.doel_marge_pct != null ? `${p.doel_marge_pct.toFixed(1)}% doelmarge` : "Doelmarge onbekend"}
              trend={p.prognose_brutowinst != null ? (p.prognose_brutowinst >= 0 ? "pos" : "neg") : undefined}
              icon={TrendingUp}
            />
            <KpiKaart
              label="Prognose nettoresultaat"
              waarde={fmt(p.prognose_nettoresultaat)}
              sub={p.totaal_ak > 0 ? `AK: ${fmt(p.totaal_ak)}` : "Geen AK-posten"}
              trend={p.prognose_nettoresultaat != null ? (p.prognose_nettoresultaat >= 0 ? "pos" : "neg") : undefined}
              icon={Activity}
            />
            <KpiKaart
              label="AK-dekkingsgraad"
              waarde={pct(p.ak_dekkingsgraad_pct)}
              sub={p.ak_dekkingsgraad_pct != null && p.ak_dekkingsgraad_pct < 100 ? "AK niet volledig gedekt" : "AK gedekt"}
              trend={p.ak_dekkingsgraad_pct != null ? (p.ak_dekkingsgraad_pct >= 100 ? "pos" : "neg") : undefined}
              icon={Target}
            />
          </div>

          {/* Factuuranalyse */}
          <FactuuranalyseTegel />

          {/* Bezettingsgraad + Break-even + Kwartaalchart */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {p.heeft_begroting && <BezettingsgraadMeter p={p} />}
            {p.heeft_begroting && <BreakEvenIndicator p={p} />}
            <KwartaalChart p={p} />
          </div>

          {/* Werkmaatschappij-vergelijking + Observaties */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WerkmaatschappijChart verdeling={p.werkmaatschappij_verdeling ?? []} />
            <ObservatiesPaneel p={p} boekjaar={boekjaar} />
          </div>

          {/* Orderportefeuille detail */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Orderportefeuille</p>
            <PortefeuilleRij p={p} />
          </div>

          {/* Toelichting */}
          <div className="rounded-md border border-dashed p-3 bg-muted/20">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Prognose = bevestigde offertes (100%) + gewogen pipeline (concept 20% / verzonden 40% / bekeken 60%) + OHW-restwaarde.
                Brutowinst = prognose × doelmarge. Nettoresultaat = brutowinst − totale AK.
                Bezettingsgraad = prognose-omzet als percentage van omzetdoel.
                Data wordt live herberekend bij elke opvraag.
              </p>
            </div>
          </div>
        </div>
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Hoofd component (access gate) ───────────────────────────────────────────

export default function DirectieKompasPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const { rol } = useRol();
  const heeftToegang = rol === "hoofdbeheerder" || heeftNiveau("financieel", 2);
  if (!heeftToegang) return <GeenToegang />;
  return <KompasInhoud />;
}

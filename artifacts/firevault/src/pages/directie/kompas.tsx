import { useState } from "react";
import {
  TrendingUp, TrendingDown, AlertTriangle, Info, ChevronLeft, ChevronRight,
  Target, Euro, BarChart3, Activity, Building2,
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, BarChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useGetFiePrognose,
  useGetFieObservaties,
  type FieJaarprognose,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useRol } from "@/context/rol-context";

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

// ─── Werkmaatschappij / Orderportefeuille vergelijking ────────────────────────
// Toont de samenstelling van de orderportefeuille als gestapeld staafdiagram.
// Per-werkmaatschappij uitsplitsing volgt zodra de FIE-engine per-entiteit
// begrotingen ondersteunt; voor nu: aggregaat per omzetcategorie.

function WerkmaatschappijChart({ p }: { p: FieJaarprognose }) {
  const data = [
    {
      label: "Orderportefeuille",
      bevestigd:  Math.round(p.bevestigde_omzet / 1000),
      pipeline:   Math.round(p.gewogen_pipeline / 1000),
      ohw:        Math.round(p.ohw_restwaarde / 1000),
    },
  ];

  const totaal = p.bevestigde_omzet + p.gewogen_pipeline + p.ohw_restwaarde;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">Orderportefeuille-samenstelling (× €1.000)</CardTitle>
          <Badge variant="outline" className="text-[10px] gap-1">
            <Building2 className="w-3 h-3" />
            Totaal {fmt(totaal)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/50" />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="label" tick={false} width={0} />
            <Tooltip
              formatter={(value: number) => [`€ ${(value * 1000).toLocaleString("nl-NL")}`, undefined]}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
            <Bar dataKey="bevestigd" name="Bevestigd" stackId="a" fill="#22c55e" />
            <Bar dataKey="pipeline"  name="Pipeline (gewogen)" stackId="a" fill="#fbbf24" />
            <Bar dataKey="ohw"       name="OHW restwaarde" stackId="a" fill="#60a5fa" radius={[0, 2, 2, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-muted-foreground px-2 mt-1">
          Per werkmaatschappij beschikbaar zodra entiteit-specifieke begrotingen zijn geconfigureerd.
        </p>
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
                {obs.waarde != null && (
                  <p className="text-[10px] opacity-70 mt-0.5">
                    Waarde: {fmt(obs.waarde)}
                    {obs.drempelwaarde != null && ` · drempel: ${fmt(obs.drempelwaarde)}`}
                    {obs.afwijking_pct != null && ` · afwijking: ${obs.afwijking_pct.toFixed(1)}%`}
                  </p>
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

// ─── Hoofd component ──────────────────────────────────────────────────────────

export default function DirectieKompasPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const { rol } = useRol();
  const isHoofdbeheerder = rol === "hoofdbeheerder";
  const heeftToegang = isHoofdbeheerder || heeftNiveau("financieel", 2);

  const [boekjaar, setBoekjaar] = useState(() => new Date().getFullYear());

  const { data: p, isLoading } = useGetFiePrognose(boekjaar) as {
    data: FieJaarprognose | undefined;
    isLoading: boolean;
  };

  if (!heeftToegang) return <GeenToegang />;

  return (
    <div className="space-y-5 p-1">
      {/* Paginakop */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Bedrijfskompas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Realtime financieel directie-overzicht — prognose, bezettingsgraad en orderportefeuille
          </p>
        </div>
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
      </div>

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

          {/* Bezettingsgraad + Break-even + Kwartaalchart */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {p.heeft_begroting && <BezettingsgraadMeter p={p} />}
            {p.heeft_begroting && <BreakEvenIndicator p={p} />}
            <KwartaalChart p={p} />
          </div>

          {/* Werkmaatschappij-vergelijking + Observaties */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WerkmaatschappijChart p={p} />
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
    </div>
  );
}

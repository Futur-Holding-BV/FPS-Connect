import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useGetDashboardStats,
  useGetRecenteActiviteit,
  useGetStatusVerdeling,
  useGetVervaldagen,
  useListAlleVerlofAanvragen,
  useGetZiekmeldingenStatistieken,
  useGetAiDrempelStatus,
  useGetHrmStats,
  useGetOfferteAnalytics,
  useGetCrmDashboard,
  useListFacturen,
  useGetOnderhoudscontractenStatistieken,
  useListFeedback,
  useGetInboxStats,
  useGetVeiligheidDashboard,
  useGetCapaciteitBezetting,
} from "@workspace/api-client-react";
import {
  Building, ShieldCheck, AlertTriangle, Calendar, TrendingUp, Clock,
  Users, HeartPulse, ChevronRight, TriangleAlert, BrainCircuit,
  LayoutDashboard, FolderOpen, FileText, Bug, Euro, BarChart3,
  CheckCircle2, XCircle, Inbox, Star, ArrowUpRight, HardHat,
  Activity, Percent, ShieldAlert, Wrench,
} from "lucide-react";
import { useRol } from "@/context/rol-context";
import { useAuth } from "@/context/auth-context";
import { Link } from "wouter";
import { PaginaHulp } from "@/components/pagina-hulp";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";

// ---------------------------------------------------------------------------
// Constanten
// ---------------------------------------------------------------------------

const STATUSKLEUR: Record<string, string> = {
  goedgekeurd:   "bg-green-100 text-green-800",
  afgekeurd:     "bg-red-100 text-red-800",
  in_onderhoud:  "bg-orange-100 text-orange-800",
  in_bewerking:  "bg-blue-100 text-blue-800",
  in_uitvoering: "bg-blue-100 text-blue-800",
  concept:       "bg-gray-100 text-gray-600",
};

const STATUSLABEL: Record<string, string> = {
  goedgekeurd:   "Goedgekeurd",
  afgekeurd:     "Afgekeurd",
  in_onderhoud:  "In onderhoud",
  in_bewerking:  "In bewerking",
  in_uitvoering: "In uitvoering",
  concept:       "Concept",
};

const MAAND_KORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

const PIE_KLEUREN = ["#e54a2e", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

// ---------------------------------------------------------------------------
// Dashboard-type
// ---------------------------------------------------------------------------

type DashboardWeergave =
  | "operationeel"
  | "spots"
  | "projecten"
  | "facturen"
  | "financieel"
  | "hrm"
  | "bugreports"
  | "kwartaal"
  | "maand";

const OPSLAG_SLEUTEL = "fps_dashboard_weergave";

interface DashboardDef {
  id: DashboardWeergave;
  label: string;
  icoon: typeof LayoutDashboard;
  gecombineerdMet?: string;
}

const DASHBOARD_DEFINITIES: DashboardDef[] = [
  { id: "operationeel", label: "Operationeel",        icoon: LayoutDashboard },
  { id: "spots",        label: "Spots",               icoon: ShieldCheck },
  { id: "projecten",    label: "Projecten & Offertes", icoon: FolderOpen, gecombineerdMet: "Projecten + Offerte-pipeline" },
  { id: "facturen",     label: "Facturen & Verkoop",  icoon: FileText, gecombineerdMet: "Facturen + Onderhoud" },
  { id: "financieel",   label: "Bedrijfsgezondheid",  icoon: Euro, gecombineerdMet: "Pijplijn + Contracten" },
  { id: "hrm",          label: "HRM",                 icoon: Users, gecombineerdMet: "Personeel + Verlof + Ziekte" },
  { id: "bugreports",   label: "Bugreports",          icoon: Bug, gecombineerdMet: "Feedback + Inbox + Veiligheid" },
  { id: "kwartaal",     label: "Kwartaaloverzicht",   icoon: BarChart3, gecombineerdMet: "Offertes + Facturen + HRM" },
  { id: "maand",        label: "Maandoverzicht",      icoon: Calendar, gecombineerdMet: "AI-kosten + Activiteit + Verlof" },
];

// ---------------------------------------------------------------------------
// Helper: mini KPI-kaart
// ---------------------------------------------------------------------------

function KpiKaart({
  label, waarde, icoon: Icoon, kleur, sub,
}: {
  label: string;
  waarde: string | number;
  icoon: typeof Building;
  kleur?: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icoon className={`h-4 w-4 ${kleur ?? "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{waarde}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DashboardKiezer — alleen voor hoofdbeheerder
// ---------------------------------------------------------------------------

function DashboardKiezer({
  actief,
  onChange,
}: {
  actief: DashboardWeergave;
  onChange: (v: DashboardWeergave) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {DASHBOARD_DEFINITIES.map(({ id, label, icoon: Icoon, gecombineerdMet }) => (
        <button
          key={id}
          type="button"
          title={gecombineerdMet ? `Gecombineerd: ${gecombineerdMet}` : label}
          onClick={() => onChange(id)}
          className={[
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
            actief === id
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
          ].join(" ")}
        >
          <Icoon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. OPERATIONEEL DASHBOARD (bestaande inhoud)
// ---------------------------------------------------------------------------

function OperationeelDashboard({
  magHrm,
  magVerlof,
  isHoofdBeheerder,
}: {
  magHrm: boolean;
  magVerlof: boolean;
  isHoofdBeheerder: boolean;
}) {
  const { data: stats }       = useGetDashboardStats();
  const { data: activiteit }  = useGetRecenteActiviteit();
  const { data: verdeling }   = useGetStatusVerdeling();
  const { data: vervaldagen } = useGetVervaldagen();
  const { data: verlofAanvragen } = useListAlleVerlofAanvragen({ status: "aangevraagd" });
  const { data: ziekStats }   = useGetZiekmeldingenStatistieken();
  const { data: drempelStatus } = useGetAiDrempelStatus({
    query: { queryKey: ["ai-drempel-status"] },
  });

  const statusTotalen = (verdeling ?? []).reduce(
    (acc, v) => {
      acc.goedgekeurd  += v.goedgekeurd;
      acc.afgekeurd    += v.afgekeurd;
      acc.in_bewerking += v.in_bewerking;
      acc.in_onderhoud += v.in_onderhoud;
      return acc;
    },
    { goedgekeurd: 0, afgekeurd: 0, in_bewerking: 0, in_onderhoud: 0 }
  );
  const verdelingRijen = [
    { status: "goedgekeurd",  aantal: statusTotalen.goedgekeurd },
    { status: "afgekeurd",    aantal: statusTotalen.afgekeurd },
    { status: "in_bewerking", aantal: statusTotalen.in_bewerking },
    { status: "in_onderhoud", aantal: statusTotalen.in_onderhoud },
  ];
  const totaalVerdeling = verdelingRijen.reduce((s, r) => s + r.aantal, 0);

  const kpiKaarten = [
    { label: "Gebouwen",             waarde: stats?.totaal_gebouwen ?? 0,       icoon: Building,      kleur: "text-primary" },
    { label: "Spots",                waarde: stats?.totaal_voorzieningen ?? 0,  icoon: ShieldCheck,   kleur: "text-blue-600" },
    { label: "Open onderhoud",       waarde: stats?.openstaande_onderhoud ?? 0, icoon: AlertTriangle, kleur: "text-orange-500" },
    { label: "Afgekeurde inspecties",waarde: stats?.vervallen_inspecties ?? 0,  icoon: Calendar,      kleur: "text-destructive" },
  ];

  const chartData = MAAND_KORT.map((naam, i) => {
    const maandNr   = i + 1;
    const eigen     = ziekStats?.maanden.find((m) => m.maand === maandNr);
    const nationaal = ziekStats?.nationaal.find((n) => n.maand === maandNr);
    return { naam, eigen: eigen?.percentage ?? null, nationaal: nationaal?.percentage ?? null };
  });

  const openVerlofAanvragen = verlofAanvragen ?? [];

  return (
    <div className="space-y-6">
      {/* AI-kosten sectie (alleen hoofdbeheerder) */}
      {isHoofdBeheerder && drempelStatus && (
        <div className="flex flex-col gap-2">
          {drempelStatus.overschreden && (
            <Link href="/beheer/ai-log">
              <div role="alert" className="flex items-center gap-3 px-4 py-3 rounded-lg bg-orange-50 border border-orange-300 text-orange-900 cursor-pointer hover:bg-orange-100 transition-colors">
                <TriangleAlert className="h-5 w-5 shrink-0 text-orange-600" />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-sm">Maandelijkse AI-kostendrempel overschreden</span>
                  <p className="text-xs text-orange-700 mt-0.5">Klik om naar Beheer &rsaquo; AI-aanroepen te gaan en de drempel aan te passen.</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-orange-600" />
              </div>
            </Link>
          )}
          {(() => {
            const kosten  = drempelStatus.huidig_maand_kosten_eur ?? 0;
            const drempel = drempelStatus.drempel_eur;
            const pct     = drempel != null && drempel > 0 ? Math.min(100, (kosten / drempel) * 100) : null;
            const balkKleur = pct == null ? "" : pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-primary/70";
            return (
              <Link href="/beheer/ai-aanroepen">
                <Card className="cursor-pointer hover:bg-muted/40 transition-colors border-dashed">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">AI-kosten deze maand</CardTitle>
                    <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <span className="text-2xl font-bold">{kosten.toLocaleString("nl-NL", { style: "currency", currency: "EUR" })}</span>
                        {drempel != null && (
                          <span className="text-sm text-muted-foreground ml-1">/ {drempel.toLocaleString("nl-NL", { style: "currency", currency: "EUR" })} drempel</span>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mb-0.5" />
                    </div>
                    {pct != null && (
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${balkKleur}`} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })()}
        </div>
      )}

      {/* KPI kaarten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiKaarten.map(({ label, waarde, icoon: Icoon, kleur }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icoon className={`h-4 w-4 ${kleur}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{waarde}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* HRM signaleringen */}
      {(magVerlof || magHrm) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {magVerlof && (
            <Card className={openVerlofAanvragen.length > 0 ? "border-amber-200" : ""}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-amber-600" /> Verlofaanvragen
                </CardTitle>
                {openVerlofAanvragen.length > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200">{openVerlofAanvragen.length} open</Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {openVerlofAanvragen.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Geen openstaande aanvragen.</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {openVerlofAanvragen.slice(0, 5).map((a) => (
                        <div key={a.id} className="flex items-center justify-between border-b pb-1.5 last:border-0">
                          <div>
                            <div className="text-sm font-medium">{a.medewerker_naam ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{a.start_datum} t/m {a.eind_datum}{a.verlofsoort_naam ? ` · ${a.verlofsoort_naam}` : ""}</div>
                          </div>
                          <Badge variant="outline" className="text-xs bg-amber-50 border-amber-200 text-amber-700 shrink-0">In behandeling</Badge>
                        </div>
                      ))}
                    </div>
                    {openVerlofAanvragen.length > 5 && <p className="text-xs text-muted-foreground">+{openVerlofAanvragen.length - 5} meer</p>}
                    <div className="pt-1">
                      <Link href="/personeel?tab=verlof">
                        <Button variant="outline" size="sm" className="gap-1 w-full text-xs">Beoordelen in Personeel <ChevronRight className="h-3 w-3" /></Button>
                      </Link>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
          {magHrm && ziekStats && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><HeartPulse className="h-4 w-4 text-red-500" /> Ziekteverzuim</CardTitle>
                <Badge className={(ziekStats.verzuimpercentage_huidig ?? 0) > 5 ? "bg-red-100 text-red-700 border-red-200" : "bg-green-100 text-green-700 border-green-200"}>
                  {ziekStats.verzuimpercentage_huidig}% nu
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><div className="text-2xl font-bold text-red-600">{ziekStats.huidig_ziek}</div><div className="text-xs text-muted-foreground">Nu ziek</div></div>
                  <div><div className="text-2xl font-bold">{ziekStats.verzuimpercentage_huidig}%</div><div className="text-xs text-muted-foreground">Huidig %</div></div>
                  <div><div className="text-2xl font-bold">{ziekStats.gemiddeld_dit_jaar}%</div><div className="text-xs text-muted-foreground">Gem. dit jaar</div></div>
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="naam" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} domain={[0, "auto"]} />
                      <Tooltip formatter={(v: number) => [`${v}%`]} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="eigen" name="FPS" stroke="#e54a2e" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="nationaal" name="Landelijk (bouw)" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground">Landelijke referentie: CBS bouwnijverheid &amp; techniek (meerjaarlijks gemiddelde).</p>
                <Link href="/personeel?tab=ziekmeldingen">
                  <Button variant="outline" size="sm" className="gap-1 w-full text-xs">Ziekmeldingen beheren <ChevronRight className="h-3 w-3" /></Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Statusverdeling */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4" /> Statusverdeling</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {verdelingRijen.map((v) => (
              <div key={v.status} className="flex items-center justify-between">
                <Badge variant="secondary" className={`text-xs ${STATUSKLEUR[v.status] ?? ""}`}>{STATUSLABEL[v.status] ?? v.status}</Badge>
                <div className="flex items-center gap-2">
                  <div className="h-2 bg-muted rounded-full w-24 overflow-hidden">
                    <div className="h-full bg-primary/70 rounded-full" style={{ width: `${Math.min(100, (v.aantal / (totaalVerdeling || 1)) * 100)}%` }} />
                  </div>
                  <span className="text-sm font-semibold w-6 text-right">{v.aantal}</span>
                </div>
              </div>
            ))}
            {totaalVerdeling === 0 && <p className="text-sm text-muted-foreground">Geen data.</p>}
          </CardContent>
        </Card>

        {/* Recente activiteit */}
        <Card>
          <CardHeader><CardTitle className="text-base">Recente Activiteit</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activiteit?.slice(0, 6).map((act) => {
                const offerteId = (act as { offerte_id?: number | null }).offerte_id;
                const content = (
                  <>
                    <div className="text-sm font-medium leading-snug">{act.omschrijving}</div>
                    <div className="text-xs text-muted-foreground">{new Date(act.tijdstip).toLocaleString("nl-NL")} — {act.gebruiker_naam}</div>
                  </>
                );
                return offerteId ? (
                  <a key={act.id} href={`/offertes/${offerteId}`} className="flex flex-col gap-0.5 border-b pb-2 last:border-0 hover:text-primary transition-colors cursor-pointer">{content}</a>
                ) : (
                  <div key={act.id} className="flex flex-col gap-0.5 border-b pb-2 last:border-0">{content}</div>
                );
              })}
              {!activiteit?.length && <p className="text-sm text-muted-foreground">Geen recente activiteit.</p>}
            </div>
          </CardContent>
        </Card>

        {/* Aankomende vervaldagen */}
        <Card>
          <CardHeader><CardTitle className="text-base">Aankomende Vervaldagen</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {vervaldagen?.slice(0, 6).map((v) => (
                <div key={v.id} className="flex justify-between items-start border-b pb-2 last:border-0">
                  <div>
                    <div className="text-sm font-medium">{v.voorziening_nummer}</div>
                    <div className="text-xs text-muted-foreground">{v.gebouw_naam} — {v.type}</div>
                  </div>
                  <div className="text-sm font-bold text-destructive whitespace-nowrap">{new Date(v.vervaldatum).toLocaleDateString("nl-NL")}</div>
                </div>
              ))}
              {!vervaldagen?.length && <p className="text-sm text-muted-foreground">Geen vervaldagen.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. SPOTS DASHBOARD
// ---------------------------------------------------------------------------

function SpotsDashboard() {
  const { data: stats }       = useGetDashboardStats();
  const { data: verdeling }   = useGetStatusVerdeling();
  const { data: vervaldagen } = useGetVervaldagen();

  const statusTotalen = (verdeling ?? []).reduce(
    (acc, v) => {
      acc.goedgekeurd  += v.goedgekeurd;
      acc.afgekeurd    += v.afgekeurd;
      acc.in_bewerking += v.in_bewerking;
      acc.in_onderhoud += v.in_onderhoud;
      return acc;
    },
    { goedgekeurd: 0, afgekeurd: 0, in_bewerking: 0, in_onderhoud: 0 }
  );

  const perTypeData = (stats?.voorzieningen_per_type ?? [])
    .sort((a, b) => b.aantal - a.aantal)
    .slice(0, 8);

  const totaalSpots = stats?.totaal_voorzieningen ?? 0;
  const goedgekeurdPct = totaalSpots > 0 ? Math.round((statusTotalen.goedgekeurd / totaalSpots) * 100) : 0;

  const urgentVervaldagen = (vervaldagen ?? []).filter((v) => {
    const dagen = Math.ceil((new Date(v.vervaldatum).getTime() - Date.now()) / 86400000);
    return dagen <= 30;
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiKaart label="Totaal spots"      waarde={totaalSpots}                          icoon={ShieldCheck}   kleur="text-blue-600" />
        <KpiKaart label="Goedgekeurd"       waarde={statusTotalen.goedgekeurd}            icoon={CheckCircle2}  kleur="text-green-600" sub={`${goedgekeurdPct}% van totaal`} />
        <KpiKaart label="Afgekeurd"         waarde={statusTotalen.afgekeurd}              icoon={XCircle}       kleur="text-destructive" />
        <KpiKaart label="Kritieke vervaldagen" waarde={urgentVervaldagen.length}          icoon={AlertTriangle} kleur="text-orange-500" sub="binnen 30 dagen" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Statusverdeling balk */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4" /> Statusverdeling</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { status: "goedgekeurd",  aantal: statusTotalen.goedgekeurd },
              { status: "afgekeurd",    aantal: statusTotalen.afgekeurd },
              { status: "in_bewerking", aantal: statusTotalen.in_bewerking },
              { status: "in_onderhoud", aantal: statusTotalen.in_onderhoud },
            ].map((v) => (
              <div key={v.status} className="flex items-center justify-between">
                <Badge variant="secondary" className={`text-xs ${STATUSKLEUR[v.status] ?? ""}`}>{STATUSLABEL[v.status] ?? v.status}</Badge>
                <div className="flex items-center gap-2">
                  <div className="h-2 bg-muted rounded-full w-32 overflow-hidden">
                    <div className="h-full bg-primary/70 rounded-full" style={{ width: `${Math.min(100, (v.aantal / (totaalSpots || 1)) * 100)}%` }} />
                  </div>
                  <span className="text-sm font-semibold w-6 text-right">{v.aantal}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Spots per type — staafdiagram */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4" /> Spots per type</CardTitle></CardHeader>
          <CardContent>
            {perTypeData.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perTypeData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="type" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="aantal" fill="#e54a2e" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Geen data.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Aankomende vervaldagen — uitgebreid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-destructive" /> Aankomende Vervaldagen
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(vervaldagen?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Geen aankomende vervaldagen.</p>
          ) : (
            <div className="divide-y">
              {vervaldagen?.slice(0, 10).map((v) => {
                const dagen = Math.ceil((new Date(v.vervaldatum).getTime() - Date.now()) / 86400000);
                return (
                  <div key={v.id} className="flex justify-between items-center py-2">
                    <div>
                      <div className="text-sm font-medium">{v.voorziening_nummer}</div>
                      <div className="text-xs text-muted-foreground">{v.gebouw_naam} — {v.type}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={dagen <= 7 ? "border-destructive text-destructive bg-red-50" : dagen <= 30 ? "border-orange-400 text-orange-700 bg-orange-50" : "text-muted-foreground"}>
                        {dagen <= 0 ? "Verlopen" : `${dagen}d`}
                      </Badge>
                      <span className="text-sm font-bold text-destructive whitespace-nowrap">{new Date(v.vervaldatum).toLocaleDateString("nl-NL")}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Link href="/voorzieningen">
          <Button variant="outline" size="sm" className="gap-1">Alle spots bekijken <ChevronRight className="h-3 w-3" /></Button>
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. PROJECTEN & OFFERTES DASHBOARD
// ---------------------------------------------------------------------------

function ProjectenDashboard() {
  const { data: analytics }   = useGetOfferteAnalytics();
  const { data: crmDashboard } = useGetCrmDashboard();

  const pieData = analytics ? [
    { name: "Concept",       value: analytics.concept },
    { name: "Verzonden",     value: analytics.verzonden },
    { name: "Bekeken",       value: analytics.bekeken },
    { name: "Ondertekend",   value: analytics.ondertekend },
    { name: "Afgewezen",     value: analytics.afgewezen },
    { name: "Vervallen",     value: analytics.vervallen },
  ].filter((d) => d.value > 0) : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiKaart label="Totaal offertes"    waarde={analytics?.totaal ?? 0}               icoon={FileText}     kleur="text-primary" />
        <KpiKaart label="Ondertekend"        waarde={analytics?.ondertekend ?? 0}           icoon={CheckCircle2} kleur="text-green-600" />
        <KpiKaart label="Conversie"          waarde={`${analytics?.conversie_procent ?? 0}%`} icoon={Percent}   kleur="text-blue-600" />
        <KpiKaart label="Gem. waarde"
          waarde={(analytics?.gemiddelde_waarde ?? 0).toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
          icoon={Euro} kleur="text-amber-600"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Offerte-status taartdiagram */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Offerte-statusverdeling</CardTitle></CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false} fontSize={11}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_KLEUREN[i % PIE_KLEUREN.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Geen offertedata beschikbaar.</p>
            )}
            {analytics && (
              <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-muted-foreground">
                <div>Gem. doorlooptijd: <span className="font-semibold text-foreground">{analytics.gemiddelde_doorlooptijd_dagen}d</span></div>
                <div>AI-acceptatiescore: <span className="font-semibold text-foreground">{analytics.ai_acceptatie_score}%</span></div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* CRM pijplijn */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ArrowUpRight className="h-4 w-4 text-green-600" /> Projectpijplijn</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {crmDashboard ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="text-xs text-muted-foreground">Open kansen</div>
                    <div className="text-2xl font-bold mt-1">{crmDashboard.open_kansen ?? 0}</div>
                  </div>
                  <div className="rounded-lg bg-green-50 p-3">
                    <div className="text-xs text-muted-foreground">Gewonnen dit jaar</div>
                    <div className="text-2xl font-bold text-green-700 mt-1">{crmDashboard.gewonnen_dit_jaar ?? 0}</div>
                  </div>
                  <div className="rounded-lg bg-red-50 p-3">
                    <div className="text-xs text-muted-foreground">Verloren dit jaar</div>
                    <div className="text-2xl font-bold text-red-700 mt-1">{crmDashboard.verloren_dit_jaar ?? 0}</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3">
                    <div className="text-xs text-muted-foreground">Pijplijn gewogen</div>
                    <div className="text-xl font-bold text-blue-700 mt-1">
                      {(crmDashboard.totaal_pijplijn_gewogen ?? 0).toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>
                {(crmDashboard.geen_contact_60_dagen ?? 0) > 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                    {crmDashboard.geen_contact_60_dagen} klanten meer dan 60 dagen zonder contact
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Geen CRM-data beschikbaar.</p>
            )}
            <Link href="/crm">
              <Button variant="outline" size="sm" className="gap-1 w-full text-xs mt-1">Naar CRM <ChevronRight className="h-3 w-3" /></Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recente offertes */}
      {(analytics?.recente_offertes?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recente Offertes</CardTitle></CardHeader>
          <CardContent>
            <div className="divide-y">
              {analytics!.recente_offertes.slice(0, 6).map((o) => (
                <div key={(o as { id?: number }).id ?? Math.random()} className="flex justify-between items-center py-2">
                  <div>
                    <div className="text-sm font-medium">{(o as { titel?: string }).titel ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{(o as { klant_naam?: string }).klant_naam ?? ""}</div>
                  </div>
                  <Badge variant="outline" className="text-xs">{(o as { status?: string }).status ?? "—"}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Link href="/offertes"><Button variant="outline" size="sm" className="gap-1">Offertes <ChevronRight className="h-3 w-3" /></Button></Link>
        <Link href="/opdrachten"><Button variant="outline" size="sm" className="gap-1">Opdrachten <ChevronRight className="h-3 w-3" /></Button></Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. FACTUREN & VERKOOP DASHBOARD
// ---------------------------------------------------------------------------

function FacturenDashboard() {
  const { data: facturen }         = useListFacturen();
  const { data: onderhoudsStats }  = useGetOnderhoudscontractenStatistieken();

  const alleFacturen = facturen ?? [];

  const stats = alleFacturen.reduce(
    (acc, f) => {
      const bedrag = parseFloat(f.bedrag_excl_btw ?? "0") || 0;
      acc.totaal++;
      acc.totaalBedrag += bedrag;
      if (f.type === "verkoop") { acc.verkoop++; acc.verkoopBedrag += bedrag; }
      if (f.type === "inkoop")  { acc.inkoop++;  acc.inkoopBedrag  += bedrag; }
      return acc;
    },
    { totaal: 0, totaalBedrag: 0, verkoop: 0, verkoopBedrag: 0, inkoop: 0, inkoopBedrag: 0 }
  );

  const recenteFacturen = [...alleFacturen]
    .sort((a, b) => new Date(b.factuurdatum ?? 0).getTime() - new Date(a.factuurdatum ?? 0).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiKaart label="Totaal facturen"  waarde={stats.totaal}                                   icoon={FileText} kleur="text-primary" />
        <KpiKaart
          label="Verkoopfacturen"
          waarde={stats.verkoop}
          icoon={ArrowUpRight}
          kleur="text-green-600"
          sub={stats.verkoopBedrag.toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
        />
        <KpiKaart
          label="Inkoopfacturen"
          waarde={stats.inkoop}
          icoon={HardHat}
          kleur="text-blue-600"
          sub={stats.inkoopBedrag.toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
        />
        <KpiKaart
          label="Onderhoudscontracten"
          waarde={onderhoudsStats?.totaal ?? "—"}
          icoon={Wrench}
          kleur="text-orange-500"
          sub={onderhoudsStats ? `${onderhoudsStats.actief ?? 0} actief` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Onderhoud stats */}
        {onderhoudsStats && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4 text-orange-500" /> Onderhoudscontracten</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-2xl font-bold">{onderhoudsStats.totaal}</div><div className="text-xs text-muted-foreground">Totaal</div></div>
                <div><div className="text-2xl font-bold text-green-600">{onderhoudsStats.actief ?? 0}</div><div className="text-xs text-muted-foreground">Actief</div></div>
                <div><div className="text-2xl font-bold text-amber-600">{onderhoudsStats.aflopend_30_dagen ?? 0}</div><div className="text-xs text-muted-foreground">Verloopt binnenkort</div></div>
              </div>
              <Link href="/onderhoud/contracten">
                <Button variant="outline" size="sm" className="gap-1 w-full text-xs">Contracten beheren <ChevronRight className="h-3 w-3" /></Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Recente facturen */}
        <Card className={onderhoudsStats ? "" : "md:col-span-2"}>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Recente Facturen</CardTitle></CardHeader>
          <CardContent>
            {recenteFacturen.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen facturen beschikbaar.</p>
            ) : (
              <div className="divide-y">
                {recenteFacturen.map((f) => (
                  <div key={f.id} className="flex justify-between items-center py-1.5">
                    <div>
                      <div className="text-sm font-medium">{f.factuurnummer ?? `Factuur #${f.id}`}</div>
                      <div className="text-xs text-muted-foreground">{f.relatienaam ?? "—"} · {f.factuurdatum ?? "—"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{f.type}</Badge>
                      <span className="text-sm font-semibold whitespace-nowrap">
                        {parseFloat(f.bedrag_excl_btw ?? "0").toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Link href="/facturen"><Button variant="outline" size="sm" className="gap-1">Alle facturen <ChevronRight className="h-3 w-3" /></Button></Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. FINANCIEEL BEDRIJFSGEZONDHEID DASHBOARD
// ---------------------------------------------------------------------------

function FinancieelDashboard() {
  const { data: crmDashboard }    = useGetCrmDashboard();
  const { data: onderhoudsStats } = useGetOnderhoudscontractenStatistieken();
  const { data: analytics }       = useGetOfferteAnalytics();
  const { data: drempelStatus }   = useGetAiDrempelStatus({ query: { queryKey: ["ai-drempel-fin"] } });

  const pijplijn = crmDashboard?.totaal_pijplijn_gewogen ?? 0;
  const gewonnen = crmDashboard?.gewonnen_dit_jaar ?? 0;
  const verloren = crmDashboard?.verloren_dit_jaar ?? 0;
  const winRatio = (gewonnen + verloren) > 0 ? Math.round((gewonnen / (gewonnen + verloren)) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiKaart
          label="Gewogen pijplijn"
          waarde={pijplijn.toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
          icoon={TrendingUp} kleur="text-blue-600"
        />
        <KpiKaart label="Winratio dit jaar" waarde={`${winRatio}%`}             icoon={Percent}      kleur="text-green-600" sub={`${gewonnen} gewonnen / ${verloren} verloren`} />
        <KpiKaart label="Offerte conversie" waarde={`${analytics?.conversie_procent ?? 0}%`} icoon={ArrowUpRight} kleur="text-primary" />
        <KpiKaart label="Actieve contracten" waarde={onderhoudsStats?.actief ?? "—"} icoon={Wrench} kleur="text-orange-500" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CRM gezondheid */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" /> Bedrijfsgezondheid CRM</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {crmDashboard ? (
              <>
                <div className="space-y-2">
                  {[
                    { label: "Open kansen",      waarde: crmDashboard.open_kansen ?? 0,       kleur: "text-foreground" },
                    { label: "Key accounts",     waarde: crmDashboard.key_accounts ?? 0,      kleur: "text-blue-700" },
                    { label: "Warme prospects",  waarde: crmDashboard.warme_prospects ?? 0,   kleur: "text-green-700" },
                    { label: "Geen contact >60d", waarde: crmDashboard.geen_contact_60_dagen ?? 0, kleur: "text-amber-700" },
                    { label: "Concurrenten",     waarde: crmDashboard.concurrenten_getraceerd ?? 0, kleur: "text-muted-foreground" },
                  ].map(({ label, waarde, kleur }) => (
                    <div key={label} className="flex justify-between items-center border-b pb-1 last:border-0">
                      <span className="text-sm text-muted-foreground">{label}</span>
                      <span className={`text-sm font-bold ${kleur}`}>{waarde}</span>
                    </div>
                  ))}
                </div>
                <Link href="/crm"><Button variant="outline" size="sm" className="gap-1 w-full text-xs">CRM openen <ChevronRight className="h-3 w-3" /></Button></Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Geen CRM-data beschikbaar.</p>
            )}
          </CardContent>
        </Card>

        {/* Offerte-financieel */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Euro className="h-4 w-4 text-amber-600" /> Offerte-financieel</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {analytics ? (
              <div className="space-y-2">
                {[
                  { label: "Totaal offertes",       waarde: analytics.totaal },
                  { label: "Gem. offertewaarde",    waarde: analytics.gemiddelde_waarde.toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) },
                  { label: "Gem. doorlooptijd",      waarde: `${analytics.gemiddelde_doorlooptijd_dagen} dagen` },
                  { label: "AI-acceptatiescore",     waarde: `${analytics.ai_acceptatie_score}%` },
                ].map(({ label, waarde }) => (
                  <div key={label} className="flex justify-between items-center border-b pb-1 last:border-0">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-bold">{waarde}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Geen offertedata beschikbaar.</p>
            )}
            {drempelStatus && (
              <div className="pt-2 border-t">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>AI-kosten deze maand</span>
                  <span className="font-semibold text-foreground">
                    {(drempelStatus.huidig_maand_kosten_eur ?? 0).toLocaleString("nl-NL", { style: "currency", currency: "EUR" })}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. HRM DASHBOARD
// ---------------------------------------------------------------------------

function HrmDashboardView() {
  const { data: hrmStats }         = useGetHrmStats();
  const { data: ziekStats }        = useGetZiekmeldingenStatistieken();
  const { data: verlofAanvragen }  = useListAlleVerlofAanvragen({ status: "aangevraagd" });
  const { data: capaciteit }       = useGetCapaciteitBezetting();

  const chartData = MAAND_KORT.map((naam, i) => {
    const maandNr   = i + 1;
    const eigen     = ziekStats?.maanden.find((m) => m.maand === maandNr);
    const nationaal = ziekStats?.nationaal.find((n) => n.maand === maandNr);
    return { naam, eigen: eigen?.percentage ?? null, nationaal: nationaal?.percentage ?? null };
  });

  const openVerlof = verlofAanvragen ?? [];
  const bezettingsDagen = capaciteit?.dagen ?? [];
  const gemBezetting = bezettingsDagen.length > 0
    ? Math.round(bezettingsDagen.reduce((s, d) => s + ((d as { bezetting_procent?: number }).bezetting_procent ?? 0), 0) / bezettingsDagen.length)
    : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiKaart label="Medewerkers"         waarde={hrmStats?.medewerkers ?? 0}          icoon={Users}        kleur="text-primary" sub={`${hrmStats?.actief ?? 0} actief`} />
        <KpiKaart label="Functies"             waarde={hrmStats?.functies ?? 0}             icoon={HardHat}      kleur="text-blue-600" />
        <KpiKaart label="Verlopen certificaten" waarde={hrmStats?.certificaten_verlopen_binnenkort ?? 0} icoon={AlertTriangle} kleur="text-orange-500" sub="binnenkort" />
        <KpiKaart label="Open verlofaanvragen" waarde={hrmStats?.openstaande_verlofaanvragen ?? openVerlof.length} icoon={Clock} kleur="text-amber-600" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Ziekteverzuim */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><HeartPulse className="h-4 w-4 text-red-500" /> Ziekteverzuim</CardTitle>
            {ziekStats && (
              <Badge className={(ziekStats.verzuimpercentage_huidig ?? 0) > 5 ? "bg-red-100 text-red-700 border-red-200" : "bg-green-100 text-green-700 border-green-200"}>
                {ziekStats.verzuimpercentage_huidig}% nu
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {ziekStats ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><div className="text-2xl font-bold text-red-600">{ziekStats.huidig_ziek}</div><div className="text-xs text-muted-foreground">Nu ziek</div></div>
                  <div><div className="text-2xl font-bold">{ziekStats.verzuimpercentage_huidig}%</div><div className="text-xs text-muted-foreground">Huidig %</div></div>
                  <div><div className="text-2xl font-bold">{ziekStats.gemiddeld_dit_jaar}%</div><div className="text-xs text-muted-foreground">Gem. dit jaar</div></div>
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="naam" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} domain={[0, "auto"]} />
                      <Tooltip formatter={(v: number) => [`${v}%`]} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="eigen" name="FPS" stroke="#e54a2e" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="nationaal" name="Landelijk (bouw)" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground">CBS referentie: bouwnijverheid &amp; techniek.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Geen ziekte-data beschikbaar.</p>
            )}
            <Link href="/personeel?tab=ziekmeldingen">
              <Button variant="outline" size="sm" className="gap-1 w-full text-xs">Ziekmeldingen beheren <ChevronRight className="h-3 w-3" /></Button>
            </Link>
          </CardContent>
        </Card>

        {/* Verlofaanvragen */}
        <Card className={openVerlof.length > 0 ? "border-amber-200" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4 text-amber-600" /> Verlofaanvragen</CardTitle>
            {openVerlof.length > 0 && <Badge className="bg-amber-100 text-amber-700 border-amber-200">{openVerlof.length} open</Badge>}
          </CardHeader>
          <CardContent className="space-y-2">
            {openVerlof.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen openstaande aanvragen.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {openVerlof.slice(0, 6).map((a) => (
                    <div key={a.id} className="flex items-center justify-between border-b pb-1.5 last:border-0">
                      <div>
                        <div className="text-sm font-medium">{a.medewerker_naam ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{a.start_datum} t/m {a.eind_datum}{a.verlofsoort_naam ? ` · ${a.verlofsoort_naam}` : ""}</div>
                      </div>
                      <Badge variant="outline" className="text-xs bg-amber-50 border-amber-200 text-amber-700 shrink-0">In behandeling</Badge>
                    </div>
                  ))}
                </div>
                {openVerlof.length > 6 && <p className="text-xs text-muted-foreground">+{openVerlof.length - 6} meer</p>}
              </>
            )}
            {gemBezetting !== null && (
              <div className="pt-2 border-t text-xs text-muted-foreground">
                Gem. capaciteitsbezetting deze week: <span className="font-semibold text-foreground">{gemBezetting}%</span>
              </div>
            )}
            <Link href="/personeel?tab=verlof">
              <Button variant="outline" size="sm" className="gap-1 w-full text-xs">Verlof beheren <ChevronRight className="h-3 w-3" /></Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Link href="/personeel"><Button variant="outline" size="sm" className="gap-1">Personeel <ChevronRight className="h-3 w-3" /></Button></Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. BUGREPORTS DASHBOARD
// ---------------------------------------------------------------------------

function BugreportsDashboard() {
  const { data: feedback }      = useListFeedback();
  const { data: inboxStats }    = useGetInboxStats();
  const { data: veiligheid }    = useGetVeiligheidDashboard();

  const alleFeedback = feedback ?? [];
  const bugCount  = alleFeedback.filter((f) => f.type === "bug").length;
  const ideeCount = alleFeedback.filter((f) => f.type === "idee" || f.type === "verbetering").length;

  const gemWaardering = alleFeedback.filter((f) => f.waardering != null).length > 0
    ? (alleFeedback.filter((f) => f.waardering != null).reduce((s, f) => s + (f.waardering ?? 0), 0) / alleFeedback.filter((f) => f.waardering != null).length).toFixed(1)
    : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiKaart label="Feedback totaal"  waarde={alleFeedback.length}          icoon={Star}        kleur="text-amber-500" />
        <KpiKaart label="Bugreports"       waarde={bugCount}                     icoon={Bug}         kleur="text-destructive" />
        <KpiKaart label="Ideen & verbeteringen" waarde={ideeCount}               icoon={Activity}    kleur="text-blue-600" />
        <KpiKaart label="Gem. waardering"  waarde={gemWaardering ?? "—"}         icoon={Star}        kleur="text-green-600" sub="van 5 sterren" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Feedback lijst */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bug className="h-4 w-4 text-destructive" /> Recente Feedback</CardTitle></CardHeader>
          <CardContent>
            {alleFeedback.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen feedback ontvangen.</p>
            ) : (
              <div className="divide-y">
                {[...alleFeedback].sort((a, b) => new Date(b.aangemaakt_op).getTime() - new Date(a.aangemaakt_op).getTime()).slice(0, 6).map((f) => (
                  <div key={f.id} className="py-2">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug line-clamp-2">{f.bericht}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{f.naam ?? "Anoniem"} · {f.pagina ?? "—"} · {new Date(f.aangemaakt_op).toLocaleDateString("nl-NL")}</p>
                      </div>
                      <Badge variant="outline" className={`text-xs shrink-0 ${f.type === "bug" ? "border-red-300 text-red-700 bg-red-50" : ""}`}>{f.type}</Badge>
                    </div>
                    {f.waardering != null && (
                      <div className="text-xs text-amber-600 mt-0.5">{"★".repeat(f.waardering)}{"☆".repeat(5 - f.waardering)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <Link href="/beheer/feedback">
              <Button variant="outline" size="sm" className="gap-1 w-full text-xs mt-2">Alle feedback <ChevronRight className="h-3 w-3" /></Button>
            </Link>
          </CardContent>
        </Card>

        {/* Inbox + veiligheid */}
        <div className="space-y-4">
          {inboxStats && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Inbox className="h-4 w-4" /> Inbox statistieken</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "Totaal",          waarde: inboxStats.totaal },
                  { label: "Nieuw",           waarde: inboxStats.nieuw,              kleur: "text-blue-600" },
                  { label: "Ter beoordeling", waarde: inboxStats.ter_beoordeling,   kleur: "text-amber-600" },
                  { label: "Goedgekeurd",     waarde: inboxStats.goedgekeurd,        kleur: "text-green-600" },
                  { label: "Afgewezen",       waarde: inboxStats.afgewezen,          kleur: "text-destructive" },
                ].map(({ label, waarde, kleur }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className={`text-sm font-bold ${kleur ?? ""}`}>{waarde}</span>
                  </div>
                ))}
                <Link href="/inbox">
                  <Button variant="outline" size="sm" className="gap-1 w-full text-xs mt-1">Inbox openen <ChevronRight className="h-3 w-3" /></Button>
                </Link>
              </CardContent>
            </Card>
          )}
          {veiligheid && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-4 w-4 text-orange-500" /> Veiligheid</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "Open meldingen",      waarde: veiligheid.meldingen_open,          kleur: veiligheid.meldingen_open > 0 ? "text-orange-600" : "" },
                  { label: "Kritieke meldingen",  waarde: veiligheid.meldingen_kritiek ?? 0,  kleur: (veiligheid.meldingen_kritiek ?? 0) > 0 ? "text-destructive" : "" },
                  { label: "Open acties",         waarde: veiligheid.acties_open,             kleur: "" },
                  { label: "Verlopen acties",     waarde: veiligheid.acties_verlopen ?? 0,    kleur: (veiligheid.acties_verlopen ?? 0) > 0 ? "text-destructive" : "" },
                  { label: "LMRA's deze week",    waarde: veiligheid.lmras_week ?? 0,         kleur: "" },
                ].map(({ label, waarde, kleur }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className={`text-sm font-bold ${kleur}`}>{waarde}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. KWARTAALOVERZICHT (gecombineerd: Offertes + Facturen + HRM)
// ---------------------------------------------------------------------------

function KwartaalDashboard() {
  const { data: analytics }        = useGetOfferteAnalytics();
  const { data: facturen }         = useListFacturen();
  const { data: hrmStats }         = useGetHrmStats();
  const { data: onderhoudsStats }  = useGetOnderhoudscontractenStatistieken();
  const { data: crmDashboard }     = useGetCrmDashboard();

  const huidigKwartaal = Math.ceil((new Date().getMonth() + 1) / 3);
  const jaar = new Date().getFullYear();

  const alleFacturen = facturen ?? [];
  const verkoopBedrag = alleFacturen
    .filter((f) => f.type === "verkoop")
    .reduce((s, f) => s + (parseFloat(f.bedrag_excl_btw ?? "0") || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-4 py-2">
        <BarChart3 className="h-4 w-4" />
        <span>Q{huidigKwartaal} {jaar} — gecombineerd overzicht: Offertes &middot; Facturen &middot; HRM</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiKaart label="Offerte-conversie"   waarde={`${analytics?.conversie_procent ?? 0}%`}  icoon={Percent}    kleur="text-primary" />
        <KpiKaart
          label="Verkoopomzet"
          waarde={verkoopBedrag.toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
          icoon={Euro} kleur="text-green-600"
        />
        <KpiKaart label="Medewerkers actief"  waarde={hrmStats?.actief ?? 0}                    icoon={Users}      kleur="text-blue-600" />
        <KpiKaart label="Open kansen CRM"     waarde={crmDashboard?.open_kansen ?? 0}           icoon={ArrowUpRight} kleur="text-amber-600" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Offertes samenvatting */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-primary" /> Offertes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {analytics ? (
              <>
                {[
                  { label: "Totaal", waarde: analytics.totaal },
                  { label: "Ondertekend", waarde: analytics.ondertekend, kleur: "text-green-600" },
                  { label: "Afgewezen", waarde: analytics.afgewezen, kleur: "text-destructive" },
                  { label: "Gem. waarde", waarde: analytics.gemiddelde_waarde.toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) },
                ].map(({ label, waarde, kleur }) => (
                  <div key={label} className="flex justify-between items-center border-b pb-1 last:border-0">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className={`text-sm font-bold ${kleur ?? ""}`}>{waarde}</span>
                  </div>
                ))}
              </>
            ) : <p className="text-sm text-muted-foreground">Geen data.</p>}
          </CardContent>
        </Card>

        {/* Facturen samenvatting */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Euro className="h-4 w-4 text-green-600" /> Facturen & Verkoop</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Totaal facturen", waarde: alleFacturen.length },
              { label: "Verkoopfacturen", waarde: alleFacturen.filter((f) => f.type === "verkoop").length, kleur: "text-green-600" },
              { label: "Inkoopfacturen", waarde: alleFacturen.filter((f) => f.type === "inkoop").length, kleur: "text-blue-600" },
              { label: "Actieve contracten", waarde: onderhoudsStats?.actief ?? "—" },
            ].map(({ label, waarde, kleur }) => (
              <div key={label} className="flex justify-between items-center border-b pb-1 last:border-0">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className={`text-sm font-bold ${kleur ?? ""}`}>{waarde}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* HRM samenvatting */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-blue-600" /> HRM</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {hrmStats ? (
              <>
                {[
                  { label: "Medewerkers", waarde: hrmStats.medewerkers },
                  { label: "Actief", waarde: hrmStats.actief, kleur: "text-green-600" },
                  { label: "Functies", waarde: hrmStats.functies },
                  { label: "Verlopen certs (binnenkort)", waarde: hrmStats.certificaten_verlopen_binnenkort, kleur: hrmStats.certificaten_verlopen_binnenkort > 0 ? "text-orange-600" : "" },
                  { label: "Open verlofaanvragen", waarde: hrmStats.openstaande_verlofaanvragen, kleur: hrmStats.openstaande_verlofaanvragen > 0 ? "text-amber-600" : "" },
                ].map(({ label, waarde, kleur }) => (
                  <div key={label} className="flex justify-between items-center border-b pb-1 last:border-0">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className={`text-sm font-bold ${kleur ?? ""}`}>{waarde}</span>
                  </div>
                ))}
              </>
            ) : <p className="text-sm text-muted-foreground">Geen data.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 9. MAANDOVERZICHT (gecombineerd: AI-kosten + Activiteit + Verlof + Spots)
// ---------------------------------------------------------------------------

function MaandDashboard() {
  const { data: drempelStatus }   = useGetAiDrempelStatus({ query: { queryKey: ["ai-drempel-maand"] } });
  const { data: activiteit }      = useGetRecenteActiviteit();
  const { data: verlofAanvragen } = useListAlleVerlofAanvragen({ status: "aangevraagd" });
  const { data: stats }           = useGetDashboardStats();
  const { data: hrmStats }        = useGetHrmStats();

  const maandNamen = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const huidigeMaand = maandNamen[new Date().getMonth()];
  const jaar = new Date().getFullYear();

  const openVerlof = verlofAanvragen ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-4 py-2">
        <Calendar className="h-4 w-4" />
        <span>{huidigeMaand.charAt(0).toUpperCase() + huidigeMaand.slice(1)} {jaar} — gecombineerd overzicht: AI-kosten &middot; Activiteit &middot; Verlof &middot; Spots</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiKaart
          label="AI-kosten deze maand"
          waarde={(drempelStatus?.huidig_maand_kosten_eur ?? 0).toLocaleString("nl-NL", { style: "currency", currency: "EUR" })}
          icoon={BrainCircuit}
          kleur={drempelStatus?.overschreden ? "text-destructive" : "text-muted-foreground"}
        />
        <KpiKaart label="Open onderhoud"       waarde={stats?.openstaande_onderhoud ?? 0}  icoon={AlertTriangle}  kleur="text-orange-500" />
        <KpiKaart label="Open verlofaanvragen" waarde={openVerlof.length}                  icoon={Clock}          kleur="text-amber-600" />
        <KpiKaart label="Actieve medewerkers"  waarde={hrmStats?.actief ?? 0}              icoon={Users}          kleur="text-blue-600" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* AI-kosten kaart */}
        {drempelStatus && (
          <Card className={drempelStatus.overschreden ? "border-orange-300" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><BrainCircuit className="h-4 w-4" /> AI-kosten {huidigeMaand}</CardTitle>
              {drempelStatus.overschreden && (
                <Badge className="bg-orange-100 text-orange-700 border-orange-300">Drempel overschreden</Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold">
                  {(drempelStatus.huidig_maand_kosten_eur ?? 0).toLocaleString("nl-NL", { style: "currency", currency: "EUR" })}
                </span>
                {drempelStatus.drempel_eur != null && (
                  <span className="text-sm text-muted-foreground mb-0.5">/ {drempelStatus.drempel_eur.toLocaleString("nl-NL", { style: "currency", currency: "EUR" })} drempel</span>
                )}
              </div>
              {drempelStatus.drempel_eur != null && drempelStatus.drempel_eur > 0 && (
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${drempelStatus.overschreden ? "bg-destructive" : "bg-primary/70"}`}
                    style={{ width: `${Math.min(100, ((drempelStatus.huidig_maand_kosten_eur ?? 0) / drempelStatus.drempel_eur) * 100)}%` }}
                  />
                </div>
              )}
              <Link href="/beheer/ai-aanroepen">
                <Button variant="outline" size="sm" className="gap-1 w-full text-xs">AI-aanroepen bekijken <ChevronRight className="h-3 w-3" /></Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Recente activiteit */}
        <Card>
          <CardHeader><CardTitle className="text-base">Activiteit deze maand</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activiteit?.slice(0, 6).map((act) => (
                <div key={act.id} className="flex flex-col gap-0.5 border-b pb-1.5 last:border-0">
                  <div className="text-sm leading-snug">{act.omschrijving}</div>
                  <div className="text-xs text-muted-foreground">{new Date(act.tijdstip).toLocaleString("nl-NL")} — {act.gebruiker_naam}</div>
                </div>
              ))}
              {!activiteit?.length && <p className="text-sm text-muted-foreground">Geen recente activiteit.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Open verlofaanvragen */}
      {openVerlof.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4 text-amber-600" /> Openstaande Verlofaanvragen</CardTitle>
            <Badge className="bg-amber-100 text-amber-700 border-amber-200">{openVerlof.length} open</Badge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {openVerlof.slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{a.medewerker_naam ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{a.start_datum} t/m {a.eind_datum}</div>
                  </div>
                  <Badge variant="outline" className="text-xs bg-amber-50 border-amber-200 text-amber-700 shrink-0">Open</Badge>
                </div>
              ))}
            </div>
            <Link href="/personeel?tab=verlof">
              <Button variant="outline" size="sm" className="gap-1 w-full text-xs mt-3">Verlof beoordelen <ChevronRight className="h-3 w-3" /></Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HOOFD-COMPONENT
// ---------------------------------------------------------------------------

export default function BeheerderDashboard() {
  const { t } = useTranslation();
  const { echteRol, bevoegdheden } = useRol();
  const { gebruiker } = useAuth();
  const functietitel = gebruiker?.functietitels?.[0] ?? null;

  const isHoofdBeheerder = echteRol === "hoofdbeheerder";
  const magHrm    = isHoofdBeheerder || (bevoegdheden.personeel ?? 0) >= 1;
  const magVerlof = magHrm || (bevoegdheden.planning ?? 0) >= 1;

  const [weergave, setWeergave] = useState<DashboardWeergave>(() => {
    try {
      const opgeslagen = localStorage.getItem(OPSLAG_SLEUTEL);
      const geldig: DashboardWeergave[] = ["operationeel", "spots", "projecten", "facturen", "financieel", "hrm", "bugreports", "kwartaal", "maand"];
      return geldig.includes(opgeslagen as DashboardWeergave) ? (opgeslagen as DashboardWeergave) : "operationeel";
    } catch {
      return "operationeel";
    }
  });

  useEffect(() => {
    try { localStorage.setItem(OPSLAG_SLEUTEL, weergave); } catch { /* ignore */ }
  }, [weergave]);

  const actieveDef = DASHBOARD_DEFINITIES.find((d) => d.id === weergave);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PaginaHulp pagina="dashboard-beheerder" />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("dashboard.titel")}{functietitel ? ` — ${functietitel}` : ""}
          </h1>
          <p className="text-muted-foreground mt-1">
            {actieveDef?.gecombineerdMet
              ? `Gecombineerd: ${actieveDef.gecombineerdMet}`
              : t("dashboard.ondertitel")}
          </p>
        </div>
      </div>

      {/* Dashboard kiezer — alleen hoofdbeheerder */}
      {isHoofdBeheerder && (
        <DashboardKiezer actief={weergave} onChange={setWeergave} />
      )}

      {/* Actieve dashboard-inhoud */}
      {weergave === "operationeel" && (
        <OperationeelDashboard magHrm={magHrm} magVerlof={magVerlof} isHoofdBeheerder={isHoofdBeheerder} />
      )}
      {weergave === "spots" && <SpotsDashboard />}
      {weergave === "projecten" && <ProjectenDashboard />}
      {weergave === "facturen" && <FacturenDashboard />}
      {weergave === "financieel" && <FinancieelDashboard />}
      {weergave === "hrm" && <HrmDashboardView />}
      {weergave === "bugreports" && <BugreportsDashboard />}
      {weergave === "kwartaal" && <KwartaalDashboard />}
      {weergave === "maand" && <MaandDashboard />}
    </div>
  );
}

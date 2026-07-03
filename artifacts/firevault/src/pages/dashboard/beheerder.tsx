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
} from "@workspace/api-client-react";
import {
  Building, ShieldCheck, AlertTriangle, Calendar, TrendingUp, Clock,
  Users, HeartPulse, ChevronRight, TriangleAlert,
} from "lucide-react";
import { useRol } from "@/context/rol-context";
import { useAuth } from "@/context/auth-context";
import { Link } from "wouter";
import { PaginaHulp } from "@/components/pagina-hulp";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

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

const ZIEKTE_STATUS_KLEUR: Record<string, string> = {
  gemeld:    "bg-orange-100 text-orange-700",
  langdurig: "bg-red-100 text-red-700",
  hersteld:  "bg-green-100 text-green-700",
};

export default function BeheerderDashboard() {
  const { t } = useTranslation();
  const { echteRol, bevoegdheden } = useRol();
  const { gebruiker } = useAuth();
  const functietitel = gebruiker?.functietitels?.[0] ?? null;

  const { data: stats } = useGetDashboardStats();
  const { data: activiteit } = useGetRecenteActiviteit();
  const { data: verdeling } = useGetStatusVerdeling();
  const { data: vervaldagen } = useGetVervaldagen();

  const magHrm = echteRol === "hoofdbeheerder" || (bevoegdheden.personeel ?? 0) >= 1;
  const magVerlof = magHrm || (bevoegdheden.planning ?? 0) >= 1;

  const { data: verlofAanvragen } = useListAlleVerlofAanvragen(
    { status: "aangevraagd" },
  );
  const { data: ziekStats } = useGetZiekmeldingenStatistieken();

  const { data: drempelStatus } = useGetAiDrempelStatus({
    query: { queryKey: ["ai-drempel-status"] },
  });

  const statusTotalen = (verdeling ?? []).reduce(
    (acc, v) => {
      acc.goedgekeurd += v.goedgekeurd;
      acc.afgekeurd += v.afgekeurd;
      acc.in_bewerking += v.in_bewerking;
      acc.in_onderhoud += v.in_onderhoud;
      return acc;
    },
    { goedgekeurd: 0, afgekeurd: 0, in_bewerking: 0, in_onderhoud: 0 }
  );
  const verdelingRijen: { status: string; aantal: number }[] = [
    { status: "goedgekeurd", aantal: statusTotalen.goedgekeurd },
    { status: "afgekeurd", aantal: statusTotalen.afgekeurd },
    { status: "in_bewerking", aantal: statusTotalen.in_bewerking },
    { status: "in_onderhoud", aantal: statusTotalen.in_onderhoud },
  ];
  const totaalVerdeling = verdelingRijen.reduce((s, r) => s + r.aantal, 0);

  const kpiKaarten: { label: string; waarde: number; icoon: typeof Building; kleur: string }[] = [
    { label: "Gebouwen",           waarde: stats?.totaal_gebouwen ?? 0,      icoon: Building,      kleur: "text-primary" },
    { label: "Spots",               waarde: stats?.totaal_voorzieningen ?? 0, icoon: ShieldCheck,   kleur: "text-blue-600" },
    { label: "Open onderhoud",      waarde: stats?.openstaande_onderhoud ?? 0,icoon: AlertTriangle, kleur: "text-orange-500" },
    { label: "Afgekeurde inspecties",waarde: stats?.vervallen_inspecties ?? 0, icoon: Calendar,      kleur: "text-destructive" },
  ];

  // Grafiekdata: combineer eigen maanden + nationaal benchmark
  const chartData = MAAND_KORT.map((naam, i) => {
    const maandNr = i + 1;
    const eigen = ziekStats?.maanden.find((m) => m.maand === maandNr);
    const nationaal = ziekStats?.nationaal.find((n) => n.maand === maandNr);
    return {
      naam,
      eigen: eigen?.percentage ?? null,
      nationaal: nationaal?.percentage ?? null,
    };
  });

  const openVerlofAanvragen = verlofAanvragen ?? [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PaginaHulp pagina="dashboard-beheerder" />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("dashboard.titel")}{functietitel ? ` — ${functietitel}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">{t("dashboard.ondertitel")}</p>
      </div>


      {/* AI-kostendrempel waarschuwing (alleen hoofdbeheerder) */}
      {echteRol === "hoofdbeheerder" && drempelStatus?.overschreden && (
        <Link href="/beheer/ai-log">
          <div
            role="alert"
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-orange-50 border border-orange-300 text-orange-900 cursor-pointer hover:bg-orange-100 transition-colors"
          >
            <TriangleAlert className="h-5 w-5 shrink-0 text-orange-600" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-sm">
                Maandelijkse AI-kostendrempel overschreden
              </span>
              <p className="text-xs text-orange-700 mt-0.5">
                Klik om naar Beheer &rsaquo; AI-aanroepen te gaan en de drempel aan te passen.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-orange-600" />
          </div>
        </Link>
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

      {/* HRM signaleringen (verlof + ziekte) */}
      {(magVerlof || magHrm) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Verlofaanvragen */}
          {magVerlof && (
            <Card className={openVerlofAanvragen.length > 0 ? "border-amber-200" : ""}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-amber-600" />
                  Verlofaanvragen
                </CardTitle>
                {openVerlofAanvragen.length > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                    {openVerlofAanvragen.length} open
                  </Badge>
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
                            <div className="text-xs text-muted-foreground">
                              {a.start_datum} t/m {a.eind_datum}
                              {a.verlofsoort_naam ? ` · ${a.verlofsoort_naam}` : ""}
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs bg-amber-50 border-amber-200 text-amber-700 shrink-0">
                            In behandeling
                          </Badge>
                        </div>
                      ))}
                    </div>
                    {openVerlofAanvragen.length > 5 && (
                      <p className="text-xs text-muted-foreground">
                        +{openVerlofAanvragen.length - 5} meer
                      </p>
                    )}
                    <div className="pt-1">
                      <Link href="/personeel?tab=verlof">
                        <Button variant="outline" size="sm" className="gap-1 w-full text-xs">
                          Beoordelen in Personeel <ChevronRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Ziekteverzuim */}
          {magHrm && ziekStats && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <HeartPulse className="h-4 w-4 text-red-500" />
                  Ziekteverzuim
                </CardTitle>
                <Badge
                  className={
                    (ziekStats.verzuimpercentage_huidig ?? 0) > 5
                      ? "bg-red-100 text-red-700 border-red-200"
                      : "bg-green-100 text-green-700 border-green-200"
                  }
                >
                  {ziekStats.verzuimpercentage_huidig}% nu
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-2xl font-bold text-red-600">{ziekStats.huidig_ziek}</div>
                    <div className="text-xs text-muted-foreground">Nu ziek</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{ziekStats.verzuimpercentage_huidig}%</div>
                    <div className="text-xs text-muted-foreground">Huidig %</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{ziekStats.gemiddeld_dit_jaar}%</div>
                    <div className="text-xs text-muted-foreground">Gem. dit jaar</div>
                  </div>
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="naam" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} domain={[0, "auto"]} />
                      <Tooltip formatter={(v: number) => [`${v}%`]} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Line
                        type="monotone"
                        dataKey="eigen"
                        name="FPS"
                        stroke="#e54a2e"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="nationaal"
                        name="Landelijk (bouw)"
                        stroke="#94a3b8"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground">
                  Landelijke referentie: CBS bouwnijverheid &amp; techniek (meerjaarlijks gemiddelde).
                </p>
                <Link href="/personeel?tab=ziekmeldingen">
                  <Button variant="outline" size="sm" className="gap-1 w-full text-xs">
                    Ziekmeldingen beheren <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Statusverdeling */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" /> Statusverdeling
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {verdelingRijen.map((v) => (
              <div key={v.status} className="flex items-center justify-between">
                <Badge variant="secondary" className={`text-xs ${STATUSKLEUR[v.status] ?? ""}`}>
                  {STATUSLABEL[v.status] ?? v.status}
                </Badge>
                <div className="flex items-center gap-2">
                  <div className="h-2 bg-muted rounded-full w-24 overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded-full"
                      style={{ width: `${Math.min(100, (v.aantal / (totaalVerdeling || 1)) * 100)}%` }}
                    />
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
          <CardHeader>
            <CardTitle className="text-base">Recente Activiteit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activiteit?.slice(0, 6).map((act) => (
                <div key={act.id} className="flex flex-col gap-0.5 border-b pb-2 last:border-0">
                  <div className="text-sm font-medium leading-snug">{act.omschrijving}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(act.tijdstip).toLocaleString("nl-NL")} — {act.gebruiker_naam}
                  </div>
                </div>
              ))}
              {!activiteit?.length && <p className="text-sm text-muted-foreground">Geen recente activiteit.</p>}
            </div>
          </CardContent>
        </Card>

        {/* Aankomende vervaldagen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aankomende Vervaldagen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {vervaldagen?.slice(0, 6).map((v) => (
                <div key={v.id} className="flex justify-between items-start border-b pb-2 last:border-0">
                  <div>
                    <div className="text-sm font-medium">{v.voorziening_nummer}</div>
                    <div className="text-xs text-muted-foreground">{v.gebouw_naam} — {v.type}</div>
                  </div>
                  <div className="text-sm font-bold text-destructive whitespace-nowrap">
                    {new Date(v.vervaldatum).toLocaleDateString("nl-NL")}
                  </div>
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

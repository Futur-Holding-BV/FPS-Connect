import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useGetDashboardStats,
  useGetRecenteActiviteit,
  useGetStatusVerdeling,
  useGetVervaldagen,
} from "@workspace/api-client-react";
import { Building, ShieldCheck, AlertTriangle, Calendar, TrendingUp, CheckCircle, XCircle, Clock } from "lucide-react";

const STATUSKLEUR: Record<string, string> = {
  goedgekeurd:   "bg-green-100 text-green-800",
  afgekeurd:     "bg-red-100 text-red-800",
  in_onderhoud:  "bg-orange-100 text-orange-800",
  in_uitvoering: "bg-blue-100 text-blue-800",
  concept:       "bg-gray-100 text-gray-600",
};

const STATUSLABEL: Record<string, string> = {
  goedgekeurd:   "Goedgekeurd",
  afgekeurd:     "Afgekeurd",
  in_onderhoud:  "In onderhoud",
  in_uitvoering: "In uitvoering",
  concept:       "Concept",
};

export default function BeheerderDashboard() {
  const { t } = useTranslation();
  const { data: stats } = useGetDashboardStats();
  const { data: activiteit } = useGetRecenteActiviteit();
  const { data: verdeling } = useGetStatusVerdeling();
  const { data: vervaldagen } = useGetVervaldagen();

  const kpiKaarten: { label: string; waarde: number; icoon: typeof Building; kleur: string }[] = [
    { label: "Gebouwen",            waarde: stats?.totaal_gebouwen ?? 0,      icoon: Building,      kleur: "text-primary" },
    { label: "Voorzieningen",       waarde: stats?.totaal_voorzieningen ?? 0, icoon: ShieldCheck,   kleur: "text-blue-600" },
    { label: "Open onderhoud",      waarde: stats?.openstaande_onderhoud ?? 0,icoon: AlertTriangle, kleur: "text-orange-500" },
    { label: "Vervallen inspecties",waarde: stats?.vervallen_inspecties ?? 0, icoon: Calendar,      kleur: "text-destructive" },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.titel")}</h1>
        <p className="text-muted-foreground mt-1">{t("dashboard.ondertitel")}</p>
      </div>

      {/* KPI kaarten */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Statusverdeling */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" /> Statusverdeling
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {verdeling?.map((v) => (
              <div key={v.status} className="flex items-center justify-between">
                <Badge variant="secondary" className={`text-xs ${STATUSKLEUR[v.status] ?? ""}`}>
                  {STATUSLABEL[v.status] ?? v.status}
                </Badge>
                <div className="flex items-center gap-2">
                  <div className="h-2 bg-muted rounded-full w-24 overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded-full"
                      style={{ width: `${Math.min(100, (v.aantal / (stats?.totaal_voorzieningen || 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold w-6 text-right">{v.aantal}</span>
                </div>
              </div>
            ))}
            {!verdeling?.length && <p className="text-sm text-muted-foreground">Geen data.</p>}
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

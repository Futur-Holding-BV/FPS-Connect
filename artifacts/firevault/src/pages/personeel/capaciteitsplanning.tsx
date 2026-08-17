import { useState } from "react";
import {
  useGetCapaciteitBezetting,
  useAnalyseerCapaciteit,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { ChevronLeft, ChevronRight, Sparkles, AlertTriangle, Info, TrendingDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const PRIORITEIT_KLEUR: Record<string, string> = {
  hoog: "bg-red-100 text-red-800 border-red-200",
  midden: "bg-amber-100 text-amber-800 border-amber-200",
  laag: "bg-blue-100 text-blue-800 border-blue-200",
};

const SIGNAAL_ICOON: Record<string, React.ReactNode> = {
  capaciteit_laag: <TrendingDown className="h-4 w-4" />,
  verlof_ophoping: <AlertTriangle className="h-4 w-4" />,
  saldo_verloopt: <AlertTriangle className="h-4 w-4" />,
  ziektetrend: <TrendingDown className="h-4 w-4" />,
};

function maandagVanDezeWeek(): string {
  const nu = new Date();
  const dag = nu.getDay() || 7;
  nu.setDate(nu.getDate() - dag + 1);
  return nu.toISOString().slice(0, 10);
}

function weekVoorwaarts(datum: string, stappen: number): string {
  const d = new Date(datum);
  d.setDate(d.getDate() + stappen * 7);
  return d.toISOString().slice(0, 10);
}

export default function CapaciteitsplanningPagina() {
  const [weekDatum, setWeekDatum] = useState(maandagVanDezeWeek());
  const [aiPeriodeStart, setAiPeriodeStart] = useState(new Date().toISOString().slice(0, 10));
  const [aiPeriodeEind, setAiPeriodeEind] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [aiSignalen, setAiSignalen] = useState<unknown[]>([]);
  const [aiGeladen, setAiGeladen] = useState(false);

  const { data: bezetting, isLoading } = useGetCapaciteitBezetting({ datum: weekDatum });
  const analyseer = useAnalyseerCapaciteit();

  const dagen = bezetting?.dagen ?? [];

  const grafiekData = dagen.map((d) => ({
    dag: d.dag,
    Beschikbaar: d.beschikbaar_uren,
    Verlof: d.verlof_uren,
    Ziek: d.ziek_uren,
  }));

  async function laadAiSignalen() {
    try {
      const res = await analyseer.mutateAsync({
        data: { periode_start: aiPeriodeStart, periode_eind: aiPeriodeEind },
      });
      setAiSignalen(res.signalen ?? []);
      setAiGeladen(true);
    } catch {
      toast({ title: "AI-analyse mislukt", variant: "destructive" });
    }
  }

  const bezettingsPct = bezetting
    ? Math.round(
        (dagen.reduce((s, d) => s + d.beschikbaar_uren, 0) /
          Math.max(0.1, dagen.reduce((s, d) => s + d.totaal_uren, 0))) *
          100,
      )
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 data-paginatitel className="text-2xl font-bold">Capaciteitsplanning</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Bezettingsgraad, verlof en ziektetrends per week
        </p>
      </div>

      {/* Week-navigatie */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekDatum(weekVoorwaarts(weekDatum, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-medium min-w-40 text-center">
          {bezetting ? `Week ${weekDatum} – ${bezetting.week_eind}` : weekDatum}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekDatum(weekVoorwaarts(weekDatum, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setWeekDatum(maandagVanDezeWeek())}>
          Deze week
        </Button>
      </div>

      {/* Samenvatting */}
      {bezetting && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Medewerkers</p>
              <p className="text-2xl font-bold mt-1">{bezetting.totaal_medewerkers}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Contract uren/week</p>
              <p className="text-2xl font-bold mt-1">{bezetting.totaal_contract_uren_per_week}u</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Bezettingsgraad</p>
              <p className={`text-2xl font-bold mt-1 ${bezettingsPct != null && bezettingsPct < 70 ? "text-red-600" : ""}`}>
                {bezettingsPct != null ? `${bezettingsPct}%` : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Verlof deze week</p>
              <p className="text-2xl font-bold mt-1 text-amber-600">
                {Math.round(dagen.reduce((s, d) => s + d.verlof_uren, 0) * 10) / 10}u
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Grafiek */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Uren per dag — week {weekDatum}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Laden...</div>
          ) : dagen.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Geen data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={grafiekData} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="dag" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${v}u`} />
                <Legend />
                <Bar dataKey="Beschikbaar" fill="#22c55e" stackId="a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Verlof" fill="#f97316" stackId="a" />
                <Bar dataKey="Ziek" fill="#ef4444" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Per-dag details */}
      {dagen.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {dagen.map((d) => (
            <Card key={d.datum} className={d.is_feestdag ? "border-blue-200 bg-blue-50" : ""}>
              <CardContent className="py-3 px-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{d.dag}</span>
                  {d.is_feestdag && (
                    <Badge variant="outline" className="text-xs text-blue-700 border-blue-300">
                      {d.feestdag_naam ?? "Feestdag"}
                    </Badge>
                  )}
                </div>
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Beschikbaar</span>
                    <span className="text-green-700 font-medium">{d.beschikbaar_uren}u</span>
                  </div>
                  {d.verlof_uren > 0 && (
                    <div className="flex justify-between">
                      <span>Verlof</span>
                      <span className="text-orange-600">{d.verlof_uren}u</span>
                    </div>
                  )}
                  {d.ziek_uren > 0 && (
                    <div className="flex justify-between">
                      <span>Ziek</span>
                      <span className="text-red-600">{d.ziek_uren}u</span>
                    </div>
                  )}
                </div>
                {(d.verlof_namen ?? []).length > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {(d.verlof_namen ?? []).map((n, i) => (
                      <div key={i} className="truncate">{n}</div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* AI-analyse */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-base">AI Capaciteitsanalyse</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Periode start</Label>
              <DatePicker
                className="h-8 text-sm"
                value={aiPeriodeStart}
                onChange={setAiPeriodeStart}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Periode eind</Label>
              <DatePicker
                className="h-8 text-sm"
                value={aiPeriodeEind}
                onChange={setAiPeriodeEind}
              />
            </div>
            <Button
              size="sm"
              onClick={laadAiSignalen}
              disabled={analyseer.isPending}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              {analyseer.isPending ? "Analyseren..." : "Analyseren"}
            </Button>
          </div>

          {aiGeladen && aiSignalen.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Info className="h-4 w-4" />
              Geen signalen gevonden voor deze periode — capaciteit ziet er goed uit.
            </div>
          )}

          {aiSignalen.length > 0 && (
            <div className="space-y-2">
              {(aiSignalen as { type?: string; prioriteit?: string; onderwerp?: string; toelichting?: string; aanbeveling?: string }[]).map((s, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${PRIORITEIT_KLEUR[s.prioriteit ?? "laag"] ?? "bg-gray-50 border-gray-200"}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5">{SIGNAAL_ICOON[s.type ?? ""] ?? <Info className="h-4 w-4" />}</span>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{s.onderwerp}</p>
                        {s.prioriteit && (
                          <Badge variant="outline" className="text-xs py-0">
                            {s.prioriteit}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs">{s.toelichting}</p>
                      {s.aanbeveling && (
                        <p className="text-xs opacity-75 italic">{s.aanbeveling}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

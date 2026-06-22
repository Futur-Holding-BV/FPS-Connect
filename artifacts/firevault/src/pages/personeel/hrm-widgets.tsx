import { useMemo } from "react";
import { useGetHrmStats, useListAlleVerlofAanvragen, useListMijnVerlofsaldi, useListZiekmeldingen } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Users, CalendarCheck, AlertTriangle, Clock, TrendingDown, UserCheck } from "lucide-react";

const HUIDIG_JAAR = new Date().getFullYear();

const KLEUREN = ["#F23B0D", "#f97316", "#fb923c", "#fdba74", "#fed7aa"];

interface StatCardProps {
  titel: string;
  waarde: string | number;
  icoon: React.ReactNode;
  sub?: string;
  klasse?: string;
}

function StatCard({ titel, waarde, icoon, sub, klasse }: StatCardProps) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{titel}</p>
            <p className={`text-2xl font-bold mt-1 ${klasse ?? ""}`}>{waarde}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="text-muted-foreground">{icoon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function HrmWidgets() {
  const { data: stats } = useGetHrmStats();
  const { data: verlofSaldi } = useListMijnVerlofsaldi();
  const { data: verlofAanvragen } = useListAlleVerlofAanvragen({ status: undefined });
  const { data: ziekmeldingen } = useListZiekmeldingen({ status: undefined });

  // Verlofaanvragen per status
  const aanvragenPerStatus = useMemo(() => {
    const alle = verlofAanvragen ?? [];
    const teller: Record<string, number> = {};
    for (const a of alle) {
      teller[a.status] = (teller[a.status] ?? 0) + 1;
    }
    return Object.entries(teller).map(([status, aantal]) => ({
      name: { concept: "Concept", aangevraagd: "Aangevraagd", goedgekeurd: "Goedgekeurd", afgewezen: "Afgewezen", ingetrokken: "Ingetrokken" }[status] ?? status,
      value: aantal,
    }));
  }, [verlofAanvragen]);

  // Saldo verdeling per verlofsoort
  const saldiPerSoort = useMemo(() => {
    const saldi = verlofSaldi ?? [];
    const teller: Record<string, number> = {};
    for (const s of saldi) {
      const naam = s.verlofsoort_naam ?? "Onbekend";
      teller[naam] = (teller[naam] ?? 0) + s.saldo_uren;
    }
    return Object.entries(teller)
      .map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [verlofSaldi]);

  // Top 5 verlof dit jaar (goedgekeurd + aangevraagd)
  const topVerlofMedewerkers = useMemo(() => {
    const aanvragen = (verlofAanvragen ?? []).filter((a) =>
      ["goedgekeurd", "aangevraagd"].includes(a.status)
    );
    const teller: Record<string, { naam: string; uren: number }> = {};
    for (const a of aanvragen) {
      const key = String(a.medewerker_id);
      if (!teller[key]) teller[key] = { naam: a.medewerker_naam ?? "?", uren: 0 };
      teller[key].uren += (a.aantal_uren ?? 0);
    }
    return Object.values(teller)
      .sort((a, b) => b.uren - a.uren)
      .slice(0, 5)
      .map((m) => ({ name: m.naam, uren: Math.round(m.uren * 10) / 10 }));
  }, [verlofAanvragen]);

  // Verlopende saldi
  const verlopend = useMemo(() => {
    const saldi = verlofSaldi ?? [];
    const nu = Date.now();
    const drieM = nu + 90 * 24 * 60 * 60 * 1000;
    return saldi.filter((s) => s.vervalt_op && new Date(s.vervalt_op).getTime() < drieM && s.saldo_uren > 0);
  }, [verlofSaldi]);

  // Actief ziek
  const actiefZiek = (ziekmeldingen ?? []).filter((z) => z.status !== "hersteld").length;

  // Aanvragen deze maand goedgekeurd
  const diezeMaand = new Date().toISOString().slice(0, 7);
  const goedgekeurdDezeMaand = (verlofAanvragen ?? []).filter(
    (a) => a.status === "goedgekeurd" && a.aangemaakt_op?.startsWith(diezeMaand)
  ).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          titel="Medewerkers"
          waarde={stats?.medewerkers ?? "—"}
          icoon={<Users className="h-5 w-5" />}
          sub={`${stats?.actief ?? 0} actief`}
        />
        <StatCard
          titel="Openstaand verlof"
          waarde={stats?.openstaande_verlofaanvragen ?? "—"}
          icoon={<Clock className="h-5 w-5" />}
          klasse={(stats?.openstaande_verlofaanvragen ?? 0) > 0 ? "text-amber-600" : ""}
        />
        <StatCard
          titel="Goedgekeurd (maand)"
          waarde={goedgekeurdDezeMaand}
          icoon={<CalendarCheck className="h-5 w-5" />}
        />
        <StatCard
          titel="Actief ziek"
          waarde={actiefZiek}
          icoon={<TrendingDown className="h-5 w-5" />}
          klasse={actiefZiek > 0 ? "text-red-600" : ""}
        />
        <StatCard
          titel="Saldo verloopt"
          waarde={verlopend.length}
          icoon={<AlertTriangle className="h-5 w-5" />}
          klasse={verlopend.length > 0 ? "text-amber-600" : ""}
          sub="binnen 90 dagen"
        />
        <StatCard
          titel="Functies"
          waarde={stats?.functies ?? "—"}
          icoon={<UserCheck className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Verlofaanvragen per status</CardTitle>
          </CardHeader>
          <CardContent>
            {aanvragenPerStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Geen aanvragen</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={aanvragenPerStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e) => `${e.name}: ${e.value}`} labelLine={false}>
                    {aanvragenPerStatus.map((_, i) => (
                      <Cell key={i} fill={KLEUREN[i % KLEUREN.length]} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Totaal verlofuren per medewerker (top 5)</CardTitle>
          </CardHeader>
          <CardContent>
            {topVerlofMedewerkers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Geen aanvragen</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={topVerlofMedewerkers} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`${v}u`, "Uren"]} />
                  <Bar dataKey="uren" fill="#F23B0D" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Verlofsaldi per soort ({HUIDIG_JAAR})</CardTitle>
          </CardHeader>
          <CardContent>
            {saldiPerSoort.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Geen saldi</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={saldiPerSoort} margin={{ left: 0, right: 16 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`${v}u`, "Uren"]} />
                  <Bar dataKey="value" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {verlopend.length > 0 && (
          <Card className="border-amber-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <CardTitle className="text-sm font-medium">Verlopende saldi (binnen 90 dagen)</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {verlopend.slice(0, 8).map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-muted-foreground text-xs">Medewerker {s.medewerker_id}</span>
                      <span className="text-muted-foreground ml-1.5 text-xs">{s.verlofsoort_naam}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-amber-700 border-amber-300">
                        {s.saldo_uren}u
                      </Badge>
                      <span className="text-xs text-muted-foreground">{s.vervalt_op}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

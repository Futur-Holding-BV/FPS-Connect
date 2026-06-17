import { Link } from "wouter";
import { useListPlanningMedewerkers, useListPlanningItems } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, Clock, Phone, Mail } from "lucide-react";

type Medewerker = {
  id: number;
  naam: string;
  functie?: string | null;
  contracturen_per_week?: number | null;
  telefoon?: string | null;
  email?: string | null;
  actief?: boolean;
};

type PlanItem = {
  id: number;
  medewerker_id?: number | null;
  uren: number;
  datum_start: string;
  datum_eind: string;
};

function huidigeMaand() {
  const nu = new Date();
  const van = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}-01`;
  const tot = new Date(nu.getFullYear(), nu.getMonth() + 1, 0);
  return { van, tot: `${tot.getFullYear()}-${String(tot.getMonth() + 1).padStart(2, "0")}-${String(tot.getDate()).padStart(2, "0")}` };
}

export default function PlanningMedewerkers() {
  const { van, tot } = huidigeMaand();
  const { data: medewerkers = [], isLoading } = useListPlanningMedewerkers({
    query: { queryKey: ["planning-medewerkers"] },
  });
  const { data: items = [] } = useListPlanningItems(
    { van, tot },
    { query: { queryKey: ["planning-items-maand", van, tot] } }
  );

  const urenPerMedewerker = new Map<number, number>();
  for (const item of items as PlanItem[]) {
    if (!item.medewerker_id) continue;
    urenPerMedewerker.set(item.medewerker_id, (urenPerMedewerker.get(item.medewerker_id) ?? 0) + item.uren);
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/modules/planning">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Medewerkers planning</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Overzicht van actieve medewerkers en hun beschikbaarheid
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Actieve medewerkers</p>
                <p className="text-2xl font-semibold">{(medewerkers as Medewerker[]).filter((m) => m.actief).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Totale capaciteit/week</p>
                <p className="text-2xl font-semibold">
                  {(medewerkers as Medewerker[]).reduce((s, m) => s + (m.contracturen_per_week ?? 40), 0)}u
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div>
              <p className="text-sm text-muted-foreground">Geplande uren deze maand</p>
              <p className="text-2xl font-semibold">
                {Array.from(urenPerMedewerker.values()).reduce((s, u) => s + u, 0)}u
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (medewerkers as Medewerker[]).length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Geen medewerkers gevonden.</p>
              <p className="text-xs mt-1">Voeg medewerkers toe via HRM / Personeel.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                  <th className="px-6 py-3 text-left font-medium">Naam</th>
                  <th className="px-4 py-3 text-left font-medium">Functie</th>
                  <th className="px-4 py-3 text-left font-medium">Contact</th>
                  <th className="px-4 py-3 text-center font-medium">Contract (u/week)</th>
                  <th className="px-4 py-3 text-center font-medium">Gepland deze maand</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(medewerkers as Medewerker[]).map((m) => {
                  const gepland = urenPerMedewerker.get(m.id) ?? 0;
                  const maandCapaciteit = (m.contracturen_per_week ?? 40) * 4.3;
                  const pct = Math.min(100, Math.round((gepland / maandCapaciteit) * 100));

                  return (
                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-slate-900">{m.naam}</p>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {m.functie ?? "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="space-y-0.5">
                          {m.email && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {m.email}
                            </div>
                          )}
                          {m.telefoon && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {m.telefoon}
                            </div>
                          )}
                          {!m.email && !m.telefoon && <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {m.contracturen_per_week ?? 40}u
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm font-medium">{gepland}u / {Math.round(maandCapaciteit)}u</span>
                          <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full ${pct > 90 ? "bg-amber-400" : "bg-primary"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge className={m.actief ? "bg-green-100 text-green-800 border-green-200" : "bg-slate-100 text-slate-600 border-slate-200"}>
                          {m.actief ? "Actief" : "Inactief"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

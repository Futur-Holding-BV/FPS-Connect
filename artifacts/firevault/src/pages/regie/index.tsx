import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  ClipboardList, Plus, Search, AlertTriangle, TrendingUp,
  Euro, Clock, Package, ChevronRight, Building2, Calendar,
} from "lucide-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RegieOpdracht {
  id: number;
  titel: string;
  werknummer: string | null;
  opdrachtgever: string | null;
  omschrijving: string | null;
  type: string;
  status: string;
  aangemaaktOp: string;
}

interface DashboardSignaal {
  opdrachtId: number;
  opdrachtTitel: string;
  type: string;
  boodschap: string;
  ernst: "waarschuwing" | "kritiek";
}

interface DashboardStat {
  opdrachtId: number;
  titel: string;
  werknummer: string | null;
  opdrachtgever: string | null;
  besteedUren: number;
  besteedMateriaal: number;
  maximaalBudget: number | null;
  meldgrens: number | null;
  budgetPercentage: number | null;
  signalen: DashboardSignaal[];
}

interface Dashboard {
  aantalActief: number;
  signalen: DashboardSignaal[];
  opdrachten: DashboardStat[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusKleur(status: string) {
  switch (status) {
    case "actief":     return "bg-green-100 text-green-800";
    case "afgerond":   return "bg-slate-100 text-slate-700";
    case "gepauzeerd": return "bg-amber-100 text-amber-800";
    case "geannuleerd": return "bg-red-100 text-red-700";
    default:           return "bg-slate-100 text-slate-600";
  }
}

function euroFormat(n: number | null) {
  if (n === null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

// ── Hoofd-component ───────────────────────────────────────────────────────────

export default function RegiePagina() {
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("offertes", 2);
  const [zoekterm, setZoekterm] = useState("");

  const { data: opdrachten = [], isLoading: laadOpdrachten } = useQuery<RegieOpdracht[]>({
    queryKey: ["regie-opdrachten"],
    queryFn: async () => {
      const r = await fetch("/api/regie/opdrachten");
      if (!r.ok) throw new Error("Kon regieprojecten niet laden.");
      return r.json();
    },
  });

  const { data: dashboard } = useQuery<Dashboard>({
    queryKey: ["regie-dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/regie/dashboard");
      if (!r.ok) throw new Error("Kon dashboard niet laden.");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const gefilterd = opdrachten.filter(o =>
    !zoekterm ||
    o.titel.toLowerCase().includes(zoekterm.toLowerCase()) ||
    o.opdrachtgever?.toLowerCase().includes(zoekterm.toLowerCase()) ||
    o.werknummer?.toLowerCase().includes(zoekterm.toLowerCase())
  );

  const kritiekSignalen  = dashboard?.signalen.filter(s => s.ernst === "kritiek") ?? [];
  const warnSignalen     = dashboard?.signalen.filter(s => s.ernst === "waarschuwing") ?? [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Regiewerk</h1>
            <p className="text-sm text-muted-foreground">Werkelijk bestede uren, materiaal en bewijsvoering</p>
          </div>
        </div>
        {kanSchrijven && (
          <Button asChild>
            <Link href="/werkvoorbereiding">
              <Plus className="h-4 w-4 mr-2" />
              Nieuw regieproject
            </Link>
          </Button>
        )}
      </div>

      {/* AI-signalering */}
      {kritiekSignalen.length > 0 && (
        <div className="space-y-2">
          {kritiekSignalen.map((s, i) => (
            <Alert key={i} className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 font-medium">
                <Link href={`/regie/${s.opdrachtId}`} className="hover:underline">
                  {s.opdrachtTitel}
                </Link>
                {" — "}{s.boodschap}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}
      {warnSignalen.length > 0 && (
        <div className="space-y-2">
          {warnSignalen.map((s, i) => (
            <Alert key={i} className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                <Link href={`/regie/${s.opdrachtId}`} className="hover:underline">
                  {s.opdrachtTitel}
                </Link>
                {" — "}{s.boodschap}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Dashboard kaarten */}
      {dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Actieve projecten
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{dashboard.aantalActief}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Signaleringen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{dashboard.signalen.length}</p>
              {dashboard.signalen.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {kritiekSignalen.length > 0 && <span className="text-red-600 font-medium">{kritiekSignalen.length} kritiek </span>}
                  {warnSignalen.length > 0 && <span className="text-amber-600">{warnSignalen.length} waarschuwing</span>}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Budget-bewaking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {dashboard.opdrachten.filter(o => o.budgetPercentage !== null && o.budgetPercentage >= 80).length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">projecten boven 80% budget</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Zoek */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Zoek op naam, nummer of opdrachtgever..."
          className="pl-9"
          value={zoekterm}
          onChange={e => setZoekterm(e.target.value)}
        />
      </div>

      {/* Lijst */}
      {laadOpdrachten ? (
        <p className="text-sm text-muted-foreground">Laden...</p>
      ) : gefilterd.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Geen regieprojecten gevonden</p>
          <p className="text-sm mt-1">Regieprojecten worden aangemaakt via Werkvoorbereiding — kies het type "Regiewerk".</p>
        </div>
      ) : (
        <div className="space-y-2">
          {gefilterd.map(o => {
            const stat = dashboard?.opdrachten.find(d => d.opdrachtId === o.id);
            return (
              <Link key={o.id} href={`/regie/${o.id}`}>
                <div className="border rounded-lg p-4 hover:bg-muted/40 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{o.titel}</span>
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold shrink-0">
                          REGIE
                        </Badge>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusKleur(o.status)}`}>
                          {o.status}
                        </span>
                      </div>
                      {o.opdrachtgever && (
                        <p className="text-sm text-muted-foreground mt-0.5">{o.opdrachtgever}</p>
                      )}
                      {o.werknummer && (
                        <p className="text-xs text-muted-foreground">{o.werknummer}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground shrink-0">
                      {stat && (
                        <>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{stat.besteedUren}u</span>
                          </div>
                          {stat.budgetPercentage !== null && (
                            <div className={`flex items-center gap-1 font-medium ${
                              stat.budgetPercentage >= 95 ? "text-red-600" :
                              stat.budgetPercentage >= 80 ? "text-amber-600" :
                              "text-muted-foreground"
                            }`}>
                              <Euro className="h-3.5 w-3.5" />
                              <span>{stat.budgetPercentage}%</span>
                            </div>
                          )}
                        </>
                      )}
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                  {stat && stat.signalen.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {stat.signalen.map((s, i) => (
                        <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${
                          s.ernst === "kritiek" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {s.boodschap}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useGetFinancieelDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Receipt, ArrowUpRight, XCircle, CheckCircle2, AlertTriangle,
  TrendingUp, ScrollText, Euro, Clock, Calendar,
} from "lucide-react";
import { PaginaHulp } from "@/components/pagina-hulp";

export default function FinancieelDashboardPagina() {
  const { data, isLoading, error } = useGetFinancieelDashboard();

  if (isLoading) {
    return (
      <div className="p-8 text-muted-foreground text-sm">Overzicht laden...</div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-8 text-destructive text-sm">Kon dashboard niet laden.</div>
    );
  }

  const stats = [
    {
      label: "Totaal facturen",
      value: data.facturen_totaal,
      icon: Receipt,
      sub: `${data.inkoop_totaal} inkoop · ${data.verkoop_totaal} verkoop`,
      href: "/facturen",
    },
    {
      label: "Klaar voor export",
      value: data.klaar_voor_export,
      icon: ArrowUpRight,
      sub: "Wachten op verzending naar AccountView",
      href: "/facturen/klaar-voor-export",
      accent: data.klaar_voor_export > 0 ? "amber" : "default",
    },
    {
      label: "Afgekeurd",
      value: data.afgekeurd,
      icon: XCircle,
      sub: "Teruggestuurd voor correctie",
      href: "/facturen?status=afgekeurd",
      accent: data.afgekeurd > 0 ? "red" : "default",
    },
    {
      label: "Betaald",
      value: data.betaald,
      icon: CheckCircle2,
      sub: "Betaalstatus teruggekoppeld",
      href: "/facturen?betaalstatus=betaald",
    },
    {
      label: "Open bedrag",
      value: formatBedrag(data.open_bedrag),
      icon: Euro,
      sub: "Nog niet betaald / verwerkt",
      isAmount: true,
    },
    {
      label: "Exportfouten open",
      value: data.export_fouten_open,
      icon: AlertTriangle,
      sub: "Facturen met fout bij verzending",
      href: "/facturen?status=fout_bij_verzending",
      accent: data.export_fouten_open > 0 ? "red" : "default",
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <PaginaHulp pagina="facturen-dashboard" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financieel overzicht</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Factuurverwerking en AccountView-koppeling
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/facturen/exportlog">
            <ScrollText className="h-4 w-4 mr-2" />
            Exportlog
          </Link>
        </Button>
      </div>

      {/* KPI kaarten */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          const card = (
            <Card className={`hover:shadow-sm transition-shadow ${s.href ? "cursor-pointer" : ""}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <Icon className={`h-4 w-4 ${s.accent === "red" ? "text-destructive" : s.accent === "amber" ? "text-amber-600" : "text-muted-foreground"}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${s.accent === "red" && Number(s.value) > 0 ? "text-destructive" : s.accent === "amber" && Number(s.value) > 0 ? "text-amber-700" : ""}`}>
                  {s.isAmount ? s.value : s.value}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
              </CardContent>
            </Card>
          );
          return s.href ? <Link key={s.label} href={s.href}>{card}</Link> : <div key={s.label}>{card}</div>;
        })}
      </div>

      {/* Exportactiviteit */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Exportactiviteit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Vandaag</span>
              </div>
              <span className="font-semibold">{data.exports_vandaag}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Deze maand</span>
              </div>
              <span className="font-semibold">{data.exports_deze_maand}</span>
            </div>
            {data.laatste_export_op && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Laatste export</span>
                <span className="text-sm">{formatDatum(data.laatste_export_op)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Acties
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button asChild variant="outline" className="justify-start">
              <Link href="/facturen">
                <Receipt className="h-4 w-4 mr-2" />
                Alle facturen bekijken
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href="/facturen/klaar-voor-export">
                <ArrowUpRight className="h-4 w-4 mr-2" />
                Klaar voor export ({data.klaar_voor_export})
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href="/facturen/exportlog">
                <ScrollText className="h-4 w-4 mr-2" />
                Exportlog bekijken
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href="/beheer/boekhouding">
                <ArrowUpRight className="h-4 w-4 mr-2" />
                AccountView-instellingen
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatBedrag(bedrag: string | number | null | undefined): string {
  if (!bedrag) return "€ 0,00";
  const num = parseFloat(String(bedrag));
  if (isNaN(num)) return "€ 0,00";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(num);
}

function formatDatum(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

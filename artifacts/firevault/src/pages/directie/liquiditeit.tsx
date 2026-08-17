import { useLocation } from "wouter";
import {
  Wallet, TrendingUp, TrendingDown, AlertTriangle, Info, ArrowDownCircle,
  ArrowUpCircle, Banknote, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useGetLiquiditeit,
  type LiquiditeitDashboard,
  type LiquiditeitAging,
  type LiquiditeitSignaal,
} from "@workspace/api-client-react";

function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

const OBSERVATIE_KLEUR: Record<string, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-800",
  waarschuwing: "border-amber-200 bg-amber-50 text-amber-800",
  kritiek: "border-red-200 bg-red-50 text-red-800",
};

const ERNST_BADGE: Record<string, string> = {
  info: "bg-blue-100 text-blue-700",
  waarschuwing: "bg-amber-100 text-amber-700",
  kritiek: "bg-red-100 text-red-700",
};

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
      </CardContent>
    </Card>
  );
}

function AgingTabel({ titel, aging }: { titel: string; aging: LiquiditeitAging }) {
  const rijen: { label: string; waarde: number; kleur: string }[] = [
    { label: "Niet vervallen", waarde: aging.niet_vervallen, kleur: "text-foreground" },
    { label: "1 – 30 dagen vervallen", waarde: aging.vervallen_1_30, kleur: "text-amber-700" },
    { label: "31 – 60 dagen vervallen", waarde: aging.vervallen_31_60, kleur: "text-orange-700" },
    { label: "60+ dagen vervallen", waarde: aging.vervallen_60_plus, kleur: "text-red-700" },
  ];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{titel}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="space-y-1.5">
          {rijen.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{r.label}</span>
              <span className={cn("font-medium tabular-nums", r.waarde > 0 && r.kleur)}>{fmt(r.waarde)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SignaalRegel({ s }: { s: LiquiditeitSignaal }) {
  const Icoon = s.ernst === "kritiek" ? AlertTriangle : s.ernst === "waarschuwing" ? AlertTriangle : Info;
  return (
    <div className={cn("rounded-lg border p-3", OBSERVATIE_KLEUR[s.ernst] ?? "border-border bg-muted/20")}>
      <div className="flex items-start gap-2">
        <Icoon className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn("text-[10px]", ERNST_BADGE[s.ernst] ?? "bg-muted text-muted-foreground")}>
              {s.ernst}
            </Badge>
          </div>
          <p className="text-sm mt-1">{s.omschrijving}</p>
          {s.advies && <p className="text-xs mt-1 opacity-80">Advies: {s.advies}</p>}
        </div>
      </div>
    </div>
  );
}

export default function LiquiditeitPagina() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, refetch, isFetching } = useGetLiquiditeit();
  const d = data as LiquiditeitDashboard | undefined;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 data-paginatitel className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" />
            Liquiditeit
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bank/kas, openstaande debiteuren en crediteuren, en de verwachte cashflow.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />
          Vernieuwen
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      )}

      {isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm text-red-800">
            Het liquiditeitsdashboard kon niet worden geladen.
          </CardContent>
        </Card>
      )}

      {d && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiKaart
              label="Netto liquiditeitspositie"
              waarde={d.netto_liquiditeit != null ? fmt(d.netto_liquiditeit) : fmt(d.werkkapitaal)}
              sub={d.netto_liquiditeit != null ? "Incl. banksaldo" : "Werkkapitaal (excl. banksaldo)"}
              trend={(d.netto_liquiditeit ?? d.werkkapitaal) < 0 ? "neg" : "pos"}
              highlighted
              icon={Wallet}
            />
            <KpiKaart
              label="Banksaldo (bank + kas)"
              waarde={d.banksaldo != null ? fmt(d.banksaldo) : "n.b."}
              sub={d.banksaldo == null ? (d.banksaldo_reden ?? "Niet beschikbaar") : "Via AccountView"}
              icon={Banknote}
            />
            <KpiKaart
              label="Openstaande debiteuren"
              waarde={fmt(d.openstaande_debiteuren)}
              sub={`${d.aantal_debiteuren} factuur/facturen`}
              trend="pos"
              icon={ArrowDownCircle}
            />
            <KpiKaart
              label="Openstaande crediteuren"
              waarde={fmt(d.openstaande_crediteuren)}
              sub={`${d.aantal_crediteuren} factuur/facturen`}
              trend="neg"
              icon={ArrowUpCircle}
            />
          </div>

          {d.banksaldo == null && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-3 text-xs text-blue-800 flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Banksaldo niet beschikbaar: {d.banksaldo_reden ?? "AccountView leverde geen saldo."}
                  {" "}De nettopositie toont daarom het werkkapitaal (debiteuren − crediteuren).
                </span>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Verwachte cashflow</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {d.cashflow.map((c) => (
                  <div key={c.horizon_dagen} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Over {c.horizon_dagen} dagen</p>
                    <p className={cn(
                      "text-lg font-bold mt-1 flex items-center gap-1",
                      c.netto < 0 ? "text-red-600" : "text-green-700",
                    )}>
                      {c.netto < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                      {fmt(c.netto)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      In {fmt(c.verwachte_inkomsten)} · uit {fmt(c.verwachte_uitgaven)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AgingTabel titel="Ouderdom debiteuren" aging={d.debiteuren_aging} />
            <AgingTabel titel="Ouderdom crediteuren" aging={d.crediteuren_aging} />
          </div>

          {d.signalen.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Signalen
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                {d.signalen.map((s, i) => <SignaalRegel key={i} s={s} />)}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/financieel/crediteuren")}>
              Naar crediteuren
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/directie/cockpit")}>
              Naar directiecockpit
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

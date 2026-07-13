import { useLocation } from "wouter";
import { LayoutDashboard, ChevronRight, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useGetDirectiecockpit,
  type DirectiecockpitResponse,
  type CockpitTegel,
} from "@workspace/api-client-react";

const KLEUR_STIJL: Record<string, { rand: string; achtergrond: string; waarde: string; accent: string }> = {
  rood: { rand: "border-red-200", achtergrond: "bg-red-50 hover:bg-red-100", waarde: "text-red-700", accent: "bg-red-500" },
  oranje: { rand: "border-amber-200", achtergrond: "bg-amber-50 hover:bg-amber-100", waarde: "text-amber-700", accent: "bg-amber-500" },
  groen: { rand: "border-green-200", achtergrond: "bg-green-50 hover:bg-green-100", waarde: "text-green-700", accent: "bg-green-500" },
  blauw: { rand: "border-blue-200", achtergrond: "bg-blue-50 hover:bg-blue-100", waarde: "text-blue-700", accent: "bg-blue-500" },
};

function Tegel({ t, onClick }: { t: CockpitTegel; onClick: () => void }) {
  const stijl = KLEUR_STIJL[t.kleur] ?? KLEUR_STIJL.blauw;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-xl border p-4 transition-colors relative overflow-hidden group",
        stijl.rand, stijl.achtergrond,
      )}
    >
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", stijl.accent)} />
      <div className="flex items-start justify-between gap-2 pl-1">
        <p className="text-xs font-medium text-muted-foreground">{t.titel}</p>
        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>
      <p className={cn("text-2xl font-bold mt-1 pl-1 leading-tight", stijl.waarde)}>{t.waarde}</p>
      {t.subtitel && <p className="text-[11px] text-muted-foreground mt-1 pl-1">{t.subtitel}</p>}
    </button>
  );
}

export default function DirectieCockpitPagina() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, refetch, isFetching } = useGetDirectiecockpit();
  const d = data as DirectiecockpitResponse | undefined;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-primary" />
            Directiecockpit
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Geconsolideerd overzicht van de belangrijkste stuurindicatoren{d ? ` — boekjaar ${d.boekjaar}` : ""}.
            Klik een tegel aan voor het volledige dashboard.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />
          Vernieuwen
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      )}

      {isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm text-red-800">
            De directiecockpit kon niet worden geladen.
          </CardContent>
        </Card>
      )}

      {d && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {d.tegels.map((t) => (
            <Tegel key={t.sleutel} t={t} onClick={() => navigate(t.pad)} />
          ))}
        </div>
      )}

      {d && d.tegels.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            Er zijn momenteel geen stuurindicatoren beschikbaar.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

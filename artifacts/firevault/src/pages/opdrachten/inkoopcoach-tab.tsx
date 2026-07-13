import { useGetInkoopcoach } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, AlertTriangle, Info, Package, Truck, Wallet } from "lucide-react";

const PRIJSBRON_LABELS: Record<string, string> = {
  jaarprijslijst: "Jaarprijslijst",
  leveranciersofferte: "Leveranciersofferte",
  vrij: "Vrije prijs",
  onbekend: "Bron onbekend",
};

const BON_STATUS_LABELS: Record<string, string> = {
  concept: "Concept",
  goedgekeurd: "Goedgekeurd",
  besteld: "Besteld",
  geleverd: "Geleverd",
};

function euro(bedrag: number | null | undefined): string {
  if (bedrag == null) return "-";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(bedrag);
}

export function InkoopcoachTab({ opdrachtId }: { opdrachtId: number }) {
  const { data, isLoading, isError } = useGetInkoopcoach(opdrachtId);

  if (isLoading) {
    return (
      <div className="mt-4 space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mt-4 text-sm text-muted-foreground">
        Het inkoopcoach-overzicht kon niet worden geladen.
      </div>
    );
  }

  const plan = data.inkoopplan;
  const bestellingen = data.bestellingen;

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            AI-inkoopcoach
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Overzicht van het inkooptraject voor deze opdracht. De coach signaleert
          aandachtspunten; u blijft zelf in controle over elke beslissing.
        </CardContent>
      </Card>

      {/* Aandachtspunten */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Aandachtspunten</CardTitle>
        </CardHeader>
        <CardContent>
          {data.aandachtspunten.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen aandachtspunten. Het inkooptraject loopt op schema.</p>
          ) : (
            <ul className="space-y-2">
              {data.aandachtspunten.map((punt, i) => {
                const waarschuwing = punt.niveau === "waarschuwing";
                return (
                  <li
                    key={i}
                    className={`flex items-start gap-2 rounded-md border p-2 text-sm ${
                      waarschuwing
                        ? "border-rose-200 bg-rose-50 text-rose-800"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }`}
                  >
                    {waarschuwing ? (
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    ) : (
                      <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    )}
                    <span>{punt.tekst}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Inkoopplan */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4" />
              Inkoopplanning
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!plan ? (
              <p className="text-muted-foreground">Er is nog geen inkoopplanning gegenereerd.</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline">{plan.status === "gereed" ? "Vastgesteld" : "Concept"}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Aantal regels</span>
                  <span className="font-medium">{plan.aantal_regels}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Wallet className="h-3.5 w-3.5" />
                    Verwachte besparing
                  </span>
                  <span className="font-medium">{euro(plan.totale_besparing)}</span>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Prijsbron-verdeling</p>
                  <div className="space-y-1">
                    {Object.entries(plan.prijsbron_verdeling ?? {})
                      .filter(([, aantal]) => (aantal as number) > 0)
                      .map(([bron, aantal]) => (
                        <div key={bron} className="flex items-center justify-between text-xs">
                          <span>{PRIJSBRON_LABELS[bron] ?? bron}</span>
                          <span className="font-medium">{aantal as number}</span>
                        </div>
                      ))}
                    {Object.values(plan.prijsbron_verdeling ?? {}).every((a) => (a as number) === 0) && (
                      <p className="text-xs text-muted-foreground">Geen regels.</p>
                    )}
                  </div>
                </div>
                {(plan.verlopen_prijzen ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {plan.verlopen_prijzen} regel{plan.verlopen_prijzen === 1 ? "" : "s"} met verlopen prijs
                  </div>
                )}
                {plan.ai_samenvatting && (
                  <div className="pt-2 border-t text-xs text-muted-foreground">{plan.ai_samenvatting}</div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Bestellingen / leverbewaking */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Truck className="h-4 w-4" />
              Bestellingen & leverbewaking
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Aantal bestellingen</span>
              <span className="font-medium">{bestellingen.aantal}</span>
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Statusverdeling</p>
              {Object.keys(bestellingen.status_verdeling ?? {}).length === 0 ? (
                <p className="text-xs text-muted-foreground">Nog geen bestellingen.</p>
              ) : (
                <div className="space-y-1">
                  {Object.entries(bestellingen.status_verdeling ?? {}).map(([status, aantal]) => (
                    <div key={status} className="flex items-center justify-between text-xs">
                      <span>{BON_STATUS_LABELS[status] ?? status}</span>
                      <span className="font-medium">{aantal as number}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {bestellingen.verlopen > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {bestellingen.verlopen} bestelling{bestellingen.verlopen === 1 ? "" : "en"} over de leverdatum
              </div>
            )}
            {bestellingen.aankomend > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700">
                <Info className="h-3.5 w-3.5" />
                {bestellingen.aankomend} bestelling{bestellingen.aankomend === 1 ? "" : "en"} met naderende leverdatum
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

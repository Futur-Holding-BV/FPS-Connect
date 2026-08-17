// Uitvoering — overzicht van opdrachten in de uitvoeringsfase.
// Voor wie op de bouw staat: per opdracht wie eraan werkt, hoe ver de
// stappen zijn en wat er aandacht vraagt (afwijkingen, materiaal, werkbak).
import { Link } from "wouter";
import {
  useGetUitvoeringOverzicht,
  getGetUitvoeringOverzichtQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  HardHat, Users, AlertTriangle, Package, Inbox, ChevronRight,
} from "lucide-react";

export default function UitvoeringOverzichtPagina() {
  const { data, isLoading, isError } = useGetUitvoeringOverzicht({
    query: { queryKey: getGetUitvoeringOverzichtQueryKey() },
  });
  const opdrachten = data?.opdrachten ?? [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <HardHat className="h-6 w-6 text-primary shrink-0" />
        <div>
          <h1 data-paginatitel className="text-xl md:text-2xl font-semibold">Uitvoering</h1>
          <p className="text-sm text-muted-foreground">
            Opdrachten die nu in uitvoering of oplevering zijn
          </p>
        </div>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Het uitvoeringsoverzicht kon niet worden geladen. Probeer het opnieuw.
          </AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {!isLoading && !isError && opdrachten.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Er zijn op dit moment geen opdrachten in uitvoering.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {opdrachten.map((o) => {
          const voortgang = o.stappen_totaal > 0
            ? Math.round((o.stappen_voltooid / o.stappen_totaal) * 100)
            : null;
          const aandacht =
            o.onbesliste_afwijkingen + o.wachtende_materiaal_aanvragen + o.open_werkbak_items;
          return (
            <Link key={o.id} href={`/uitvoering/${o.id}`}>
              <Card className="cursor-pointer hover:border-primary/50 transition-colors" data-testid={`uitvoering-opdracht-${o.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {o.werknummer ? `${o.werknummer} — ` : ""}{o.titel}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {o.opdrachtgever ?? "Opdrachtgever onbekend"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={o.fase === "oplevering" ? "secondary" : "default"}>
                        {o.fase === "oplevering" ? "Oplevering" : "In uitvoering"}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>

                  {voortgang !== null && (
                    <div className="flex items-center gap-3">
                      <Progress value={voortgang} className="h-2 flex-1" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {o.stappen_voltooid}/{o.stappen_totaal} stappen
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      {o.monteurs.length > 0 ? o.monteurs.join(", ") : "Nog niemand ingepland"}
                    </span>
                    {o.onbesliste_afwijkingen > 0 && (
                      <span className="flex items-center gap-1 text-destructive font-medium">
                        <AlertTriangle className="h-4 w-4" />
                        {o.onbesliste_afwijkingen} afwijking{o.onbesliste_afwijkingen === 1 ? "" : "en"} onbeslist
                      </span>
                    )}
                    {o.wachtende_materiaal_aanvragen > 0 && (
                      <span className="flex items-center gap-1 text-amber-700 font-medium">
                        <Package className="h-4 w-4" />
                        {o.wachtende_materiaal_aanvragen} materiaalaanvra{o.wachtende_materiaal_aanvragen === 1 ? "ag" : "gen"} wacht
                      </span>
                    )}
                    {o.open_werkbak_items > 0 && (
                      <span className="flex items-center gap-1 text-amber-700 font-medium">
                        <Inbox className="h-4 w-4" />
                        {o.open_werkbak_items} werkbaksigna{o.open_werkbak_items === 1 ? "al" : "len"}
                      </span>
                    )}
                    {aandacht === 0 && (
                      <span className="text-muted-foreground">Geen openstaande aandachtspunten</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

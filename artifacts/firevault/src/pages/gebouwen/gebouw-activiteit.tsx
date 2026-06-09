import { useEffect } from "react";
import { useGetRecenteActiviteit } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, Radio, User } from "lucide-react";

function tijdGeleden(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "zojuist";
  if (mins < 60) return `${mins} min geleden`;
  const uren = Math.floor(mins / 60);
  if (uren < 24) return `${uren} u geleden`;
  const dagen = Math.floor(uren / 24);
  return `${dagen} d geleden`;
}

const TYPE_LABELS: Record<string, string> = {
  voorziening_aangemaakt: "Voorziening aangemaakt",
  voorziening_bijgewerkt: "Voorziening bijgewerkt",
  status_gewijzigd:       "Status gewijzigd",
  inspectie_aangemaakt:   "Inspectie aangemaakt",
  inspectie_bijgewerkt:   "Inspectie bijgewerkt",
  onderhoud_aangemaakt:   "Onderhoud aangemaakt",
  onderhoud_bijgewerkt:   "Onderhoud bijgewerkt",
  gebouw_bijgewerkt:      "Gebouw bijgewerkt",
};

export default function GebouwActiviteit({
  gebouwNaam,
}: {
  gebouwNaam: string;
}) {
  const { data, refetch } = useGetRecenteActiviteit({ limit: 100 });

  useEffect(() => {
    const interval = setInterval(() => {
      void refetch();
    }, 30000);
    return () => clearInterval(interval);
  }, [refetch]);

  const activiteit = (data ?? []).filter(
    (a) => a.gebouw_naam === gebouwNaam,
  );

  const nu = Date.now();
  const dag = 24 * 3600 * 1000;

  const recentActief = [
    ...new Map(
      activiteit
        .filter(
          (a) =>
            a.gebruiker_naam &&
            nu - new Date(a.tijdstip).getTime() < dag,
        )
        .map((a) => [
          a.gebruiker_naam!,
          {
            naam: a.gebruiker_naam!,
            tijdstip: a.tijdstip,
          },
        ]),
    ).values(),
  ].slice(0, 6);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <CardTitle>Live meekijken</CardTitle>
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 ml-auto">
            <Radio className="h-3 w-3 animate-pulse" />
            Vernieuwd elke 30&nbsp;s
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Recente wijzigingen op dit project
        </p>

        {recentActief.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Recent actief (24 u)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {recentActief.map((u) => (
                <div
                  key={u.naam}
                  className="flex items-center gap-1.5 text-xs bg-muted rounded-full px-2.5 py-1"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{u.naam}</span>
                  <span className="text-muted-foreground">
                    {tijdGeleden(u.tijdstip)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-4 pb-4">
        {activiteit.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Clock className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Nog geen recente activiteit voor dit project.
            </p>
          </div>
        ) : (
          <ol className="relative border-l border-border space-y-0 ml-2">
            {activiteit.slice(0, 30).map((a) => (
              <li key={a.id} className="mb-4 ml-4">
                <span className="absolute -left-1.5 mt-1 flex h-3 w-3 items-center justify-center rounded-full border border-background bg-primary/30" />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground leading-snug">
                      {TYPE_LABELS[a.type] ?? a.type}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {a.omschrijving}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {a.gebruiker_naam && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          {a.gebruiker_naam}
                        </span>
                      )}
                      {a.voorziening_nummer && (
                        <Badge variant="outline" className="text-xs py-0 h-4">
                          {a.voorziening_nummer}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <time className="flex-shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                    {tijdGeleden(a.tijdstip)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

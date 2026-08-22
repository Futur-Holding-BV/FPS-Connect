import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useBulkToewijzingProjectleider,
  useListProjectenBeheerBacklog,
  useListProjectleiderKandidaten,
  type ErrorType,
} from "@workspace/api-client-react";
import { AlertCircle, CheckCircle2, Loader2, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAX_BATCH = 100;

export function ProjectleiderBacklogKaart() {
  const queryClient = useQueryClient();
  const {
    data: backlog,
    isLoading: backlogLaden,
    isError: backlogFout,
  } = useListProjectenBeheerBacklog();
  const {
    data: kandidaten = [],
    isLoading: kandidatenLaden,
    isError: kandidatenFout,
  } = useListProjectleiderKandidaten();
  const bulkToewijzing = useBulkToewijzingProjectleider();
  const [keuzes, setKeuzes] = useState<Record<number, string>>({});
  const [melding, setMelding] = useState<string | null>(null);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  const geselecteerdeRegels = useMemo(
    () => (backlog?.items ?? []).flatMap((project) => {
      const keuze = keuzes[project.id];
      return keuze
        ? [{
            project_id: project.id,
            projectleider_medewerker_id: Number(keuze),
          }]
        : [];
    }),
    [backlog?.items, keuzes],
  );

  function kies(projectId: number, medewerkerId: string) {
    setMelding(null);
    setFoutmelding(null);
    setKeuzes((huidig) => {
      if (!huidig[projectId] && Object.keys(huidig).length >= MAX_BATCH) {
        setFoutmelding(`Selecteer maximaal ${MAX_BATCH} projecten per bulktoewijzing.`);
        return huidig;
      }
      return { ...huidig, [projectId]: medewerkerId };
    });
  }

  async function toewijzen() {
    if (geselecteerdeRegels.length === 0) {
      setFoutmelding("Kies bij minimaal één project een projectleider.");
      return;
    }
    setMelding(null);
    setFoutmelding(null);
    try {
      const resultaat = await bulkToewijzing.mutateAsync({
        data: {
          toewijzingen: geselecteerdeRegels,
          reden: "Bulktoewijzing vanuit beheerachterstand",
        },
      });
      setKeuzes({});
      setMelding(
        `${resultaat.gewijzigd} project${resultaat.gewijzigd === 1 ? "" : "en"} toegewezen` +
        (resultaat.ongewijzigd > 0 ? `, ${resultaat.ongewijzigd} ongewijzigd` : "") +
        `. Nog ${resultaat.resterend_zonder_projectleider} zonder projectleider.`,
      );
      await queryClient.invalidateQueries();
    } catch (error) {
      const fout = error as ErrorType<{ error?: string }>;
      setFoutmelding(
        fout.data?.error ??
        "Geen projectleider is toegewezen. De volledige batch is teruggedraaid.",
      );
    }
  }

  return (
    <Card data-testid="projectleider-beheerachterstand">
      <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserCheck className="h-5 w-5 text-primary" />
            Projectleiders aanvullen
          </CardTitle>
          <CardDescription>
            Wijs ontbrekende projectleiders expliciet toe. De hele selectie wordt
            atomair opgeslagen of volledig teruggedraaid.
          </CardDescription>
        </div>
        <Badge variant={(backlog?.totaal ?? 0) > 0 ? "destructive" : "secondary"}>
          {backlog?.totaal ?? 0} open
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {backlogLaden || kandidatenLaden ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Beheerachterstand laden…
          </div>
        ) : backlogFout || kandidatenFout ? (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Projecten of geldige projectleiders konden niet worden geladen.
          </div>
        ) : kandidaten.length === 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Er is geen actieve medewerker met de exacte actieve functie
              Projectleider. Richt eerst de functie of aanstelling in.
            </p>
          </div>
        ) : (backlog?.items.length ?? 0) === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Alle projecten hebben een projectleider.
          </div>
        ) : (
          <>
            <div className="divide-y rounded-md border">
              {backlog!.items.map((project) => (
                <div
                  key={project.id}
                  className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{project.naam}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {project.gebouw_naam ?? "Geen gebouwnaam"} · {project.status}
                    </p>
                  </div>
                  <Select
                    value={keuzes[project.id] ?? ""}
                    onValueChange={(waarde) => kies(project.id, waarde)}
                  >
                    <SelectTrigger
                      aria-label={`Projectleider voor ${project.naam}`}
                      data-testid={`projectleider-keuze-${project.id}`}
                    >
                      <SelectValue placeholder="Kies projectleider" />
                    </SelectTrigger>
                    <SelectContent>
                      {kandidaten.map((kandidaat) => (
                        <SelectItem key={kandidaat.id} value={String(kandidaat.id)}>
                          {kandidaat.naam}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {geselecteerdeRegels.length} van maximaal {MAX_BATCH} geselecteerd
              </p>
              <Button
                onClick={toewijzen}
                disabled={bulkToewijzing.isPending || geselecteerdeRegels.length === 0}
                data-testid="projectleiders-bulk-opslaan"
              >
                {bulkToewijzing.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserCheck className="h-4 w-4" />
                )}
                Geselecteerde toewijzingen opslaan
              </Button>
            </div>
          </>
        )}

        {melding && (
          <div className="flex items-start gap-2 text-sm text-primary">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{melding}</p>
          </div>
        )}
        {foutmelding && (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{foutmelding}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
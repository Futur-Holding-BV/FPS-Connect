// WERKBAK_02 §7 — persoonlijke workflow. Eén lijst in de door de server
// bepaalde volgorde (ster > einddatum > gewicht > ouderdom). De client
// herordent NOOIT: elke plaats is uitgelegd via de "uitleg"-regel. Sterren zijn
// persoonlijk. AI-advies staat naast de lijst en verandert de volgorde niet.
import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetWorkflow,
  getGetWorkflowQueryKey,
  useZetWorkflowSter,
  useVraagWorkflowAiAdvies,
} from "@workspace/api-client-react";
import type {
  WorkflowRij,
  WorkflowAiAdvies,
  WorkflowSterInputDoelType,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Star, Sparkles, ExternalLink, Loader2, Info, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BRON_LABELS: Record<string, string> = {
  eigen: "Eigen taak",
  werk_inbox: "Mail",
  goedkeuringsaanvraag: "Goedkeuring",
  verlofaanvraag: "Verlof",
  factuur_goedkeuring: "Factuur",
  betaalbatch: "Betaalbatch",
  conceptantwoord: "Aanvraag",
  contractbesluit: "Contract",
  leverancier_beoordeling: "Leverancier",
  poortwachter: "Poortwachter",
  verloopdatum: "Verloopdatum",
};

function bronLabel(bron: string): string {
  return BRON_LABELS[bron] ?? bron;
}

/** Klik-door-de-sterren: 0 → 1 → 2 → 3 → 0. */
function volgendeSter(huidig: number): number {
  return (huidig + 1) % 4;
}

function SterKnoppen({ rij, onZet, bezig }: { rij: WorkflowRij; onZet: (sterren: number) => void; bezig: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={bezig}
          onClick={() => onZet(volgendeSter(rij.sterren))}
          className="flex items-center gap-0.5 disabled:opacity-50"
          aria-label={`Sterren: ${rij.sterren} van 3 (klik om te wijzigen)`}
          data-testid={`knop-ster-${rij.soort_rij}-${rij.sleutel}`}
        >
          {[1, 2, 3].map((n) => (
            <Star
              key={n}
              className={cn(
                "h-4 w-4 transition-colors",
                n <= rij.sterren ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
              )}
            />
          ))}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-56">
        Sterren zijn persoonlijk — collega&apos;s zien ze niet. Klik om 0–3 sterren te zetten; jouw ordening gaat voor.
      </TooltipContent>
    </Tooltip>
  );
}

function WorkflowRijKaart({
  rij,
  onNavigeer,
  onZetSter,
  sterBezig,
}: {
  rij: WorkflowRij;
  onNavigeer: (pad: string) => void;
  onZetSter: (rij: WorkflowRij, sterren: number) => void;
  sterBezig: boolean;
}) {
  const isMail = rij.soort_rij === "mail";
  return (
    <div
      className="rounded-md border border-border p-3 flex items-start gap-3"
      data-testid={`rij-workflow-${rij.soort_rij}-${rij.sleutel}`}
    >
      <div className="pt-0.5">
        <SterKnoppen rij={rij} onZet={(s) => onZetSter(rij, s)} bezig={sterBezig} />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start gap-2 flex-wrap">
          <p className="font-medium leading-snug flex-1 min-w-0">{rij.titel}</p>
          <Badge variant="secondary" className="text-[10px] shrink-0">{bronLabel(rij.bron)}</Badge>
          {rij.deadline && (
            <Badge variant="outline" className="text-[10px] shrink-0">Einddatum {rij.deadline}</Badge>
          )}
        </div>
        {rij.omschrijving && (
          <p className="text-xs text-muted-foreground leading-snug">{rij.omschrijving}</p>
        )}
        {/* Elke plaats in de lijst is uitgelegd (§7.2). */}
        <p className="text-[11px] text-muted-foreground/80 italic leading-snug">{rij.uitleg}</p>
      </div>
      {rij.actie_pad && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs shrink-0"
          onClick={() => onNavigeer(rij.actie_pad!)}
          data-testid={`knop-open-workflow-${rij.soort_rij}-${rij.sleutel}`}
        >
          <ExternalLink className="h-3 w-3 mr-1" /> {isMail ? "Naar mail" : "Openen"}
        </Button>
      )}
    </div>
  );
}

function AdviesGroep({ titel, redenen, sleutelTitels }: {
  titel: string;
  redenen: Array<{ sleutel: string; reden: string }>;
  sleutelTitels: Map<string, string>;
}) {
  if (redenen.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">{titel}</h3>
      <ul className="space-y-1.5">
        {redenen.map((r, i) => (
          <li key={`${r.sleutel}-${i}`} className="text-sm">
            <span className="font-medium">{sleutelTitels.get(r.sleutel) ?? r.sleutel}</span>
            <span className="text-muted-foreground"> — {r.reden}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function WorkflowPagina() {
  const [, navigeer] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, error } = useGetWorkflow({ query: { queryKey: getGetWorkflowQueryKey() } });
  const rijen = data?.rijen ?? [];

  const sterMutatie = useZetWorkflowSter({
    mutation: {
      onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetWorkflowQueryKey() }); },
      onError: () => toast({ title: "Ster zetten mislukt", variant: "destructive" }),
    },
  });

  const [adviesOpen, setAdviesOpen] = useState(false);
  const [advies, setAdvies] = useState<WorkflowAiAdvies | null>(null);
  const adviesMutatie = useVraagWorkflowAiAdvies({
    mutation: {
      onSuccess: (res) => { setAdvies(res); setAdviesOpen(true); },
      onError: () => toast({ title: "AI-advies mislukt", description: "Probeer het later opnieuw.", variant: "destructive" }),
    },
  });

  function zetSter(rij: WorkflowRij, sterren: number): void {
    const doelType: WorkflowSterInputDoelType = rij.soort_rij === "mail" ? "mail_conversatie" : "werkbak";
    sterMutatie.mutate({ data: { doel_type: doelType, doel_sleutel: rij.sleutel, sterren } });
  }

  const sleutelTitels = new Map(rijen.map((r) => [r.sleutel, r.titel]));
  const status = (error as { status?: number } | null)?.status;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 data-paginatitel className="text-2xl font-bold">Workflow</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Jouw werk in volgorde: sterren gaan voor, dan einddatum, dan gewicht, dan ouderdom.
            Elke plaats is uitgelegd. De volgorde staat vast — AI verandert die nooit.
          </p>
        </div>
        <Button
          onClick={() => adviesMutatie.mutate()}
          disabled={adviesMutatie.isPending || rijen.length === 0}
          data-testid="knop-ai-advies"
        >
          {adviesMutatie.isPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-1.5" />
          )}
          AI-advies
        </Button>
      </div>

      {status === 403 ? (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Geen toegang</AlertTitle>
          <AlertDescription>
            Je hebt geen toegang tot de workflow. Neem contact op met de beheerder als dit niet klopt.
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Workflow wordt geladen…
        </p>
      ) : rijen.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Niets te doen — je workflow is leeg.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="lijst-workflow">
          {rijen.map((rij) => (
            <WorkflowRijKaart
              key={`${rij.soort_rij}:${rij.sleutel}`}
              rij={rij}
              onNavigeer={navigeer}
              onZetSter={zetSter}
              sterBezig={sterMutatie.isPending}
            />
          ))}
        </div>
      )}

      {/* AI-advies zijkaart */}
      <Sheet open={adviesOpen} onOpenChange={setAdviesOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> AI-advies
            </SheetTitle>
            <SheetDescription>
              Dit advies verandert de volgorde van je lijst niet. Jij beslist.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-5">
            {advies && advies.groepen.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">Groepen</h3>
                <div className="space-y-2">
                  {advies.groepen.map((g, i) => (
                    <div key={`${g.naam}-${i}`} className="rounded-md border p-2.5">
                      <p className="text-sm font-medium">{g.naam}</p>
                      <ul className="mt-1 space-y-0.5">
                        {g.sleutels.map((s) => (
                          <li key={s} className="text-xs text-muted-foreground">
                            {sleutelTitels.get(s) ?? s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {advies && (
              <>
                <AdviesGroep titel="Wat ontbreekt" redenen={advies.ontbreekt} sleutelTitels={sleutelTitels} />
                <AdviesGroep titel="Kan wachten" redenen={advies.kan_wachten} sleutelTitels={sleutelTitels} />
                <AdviesGroep titel="Voorstellen" redenen={advies.voorstellen} sleutelTitels={sleutelTitels} />
              </>
            )}

            {advies &&
              advies.groepen.length === 0 &&
              advies.ontbreekt.length === 0 &&
              advies.kan_wachten.length === 0 &&
              advies.voorstellen.length === 0 && (
                <p className="text-sm text-muted-foreground">Geen adviespunten gevonden.</p>
              )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Voorstellen zijn suggesties met een reden uit de gegevens. De AI bepaalt niet wat belangrijk is
                en herordent je lijst niet.
              </AlertDescription>
            </Alert>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

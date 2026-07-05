// PIM Oplevering Tab — volledigheidscheck, dossier generatie en definitief maken
import { useState } from "react";
import {
  useControleerPimOplevering,
  useGenereerPimOplevering,
  useDefinieerPimOplevering,
  useGetPim,
  useGetOpdracht,
  getGetPimQueryKey,
  getGetOpdrachtQueryKey,
} from "@workspace/api-client-react";
import type { PimOpleveringControlerapport, PimOpleveringGenereerResultaat } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Sparkles,
  Download,
  ClipboardCheck,
  Loader2,
  ShieldCheck,
  FileCheck2,
} from "lucide-react";

interface Props {
  opdrachtId: number;
}

export default function PimOpleveringTab({ opdrachtId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [controlerapport, setControlerapport] = useState<PimOpleveringControlerapport | null>(null);
  const [gegenereerd, setGegenereerd] = useState<PimOpleveringGenereerResultaat | null>(null);
  const [definitiefDialoog, setDefinitiefDialoog] = useState(false);

  const { data: pim, isLoading: pimLaden } = useGetPim(opdrachtId);
  const { data: opdracht } = useGetOpdracht(opdrachtId);

  const controleerMutatie = useControleerPimOplevering({
    mutation: {
      onSuccess: (data) => {
        setControlerapport(data);
        void queryClient.invalidateQueries({ queryKey: getGetPimQueryKey(opdrachtId) });
        void queryClient.invalidateQueries({ queryKey: getGetOpdrachtQueryKey(opdrachtId) });
        if (data.volledig) {
          toast({ title: "Volledigheidscheck geslaagd", description: "Alle controles zijn groen — het dossier kan worden gegenereerd." });
        } else {
          toast({ title: "Ontbrekende punten", description: `${data.ontbrekende_punten.length} punt(en) vereisen actie.`, variant: "destructive" });
        }
      },
      onError: () => toast({ title: "Fout", description: "Volledigheidscheck mislukt.", variant: "destructive" }),
    },
  });

  const genereerMutatie = useGenereerPimOplevering({
    mutation: {
      onSuccess: (data) => {
        setGegenereerd(data);
        void queryClient.invalidateQueries({ queryKey: getGetPimQueryKey(opdrachtId) });
        toast({ title: "Dossier gegenereerd", description: `${data.documenten.length} document(en) aangemaakt.` });
      },
      onError: () => toast({ title: "Fout", description: "Documentgeneratie mislukt.", variant: "destructive" }),
    },
  });

  const definitiefMutatie = useDefinieerPimOplevering({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetPimQueryKey(opdrachtId) });
        void queryClient.invalidateQueries({ queryKey: getGetOpdrachtQueryKey(opdrachtId) });
        toast({ title: "Opdracht definitief opgeleverd", description: "De PIM-fase is ingesteld op 'Gereed'." });
      },
      onError: () => toast({ title: "Fout", description: "Definitief maken mislukt.", variant: "destructive" }),
    },
  });

  if (pimLaden) {
    return (
      <div className="mt-4 space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const aiFase = (opdracht as unknown as Record<string, unknown> | undefined)?.ai_fase as string | undefined;
  const opleverCtx = (pim?.oplevering_context as Record<string, unknown> | null | undefined) ?? null;
  const opgeslagenControlerapport = (opleverCtx?.controlerapport as Record<string, unknown> | null) ?? null;
  const opgeslagenDocIds = Array.isArray(opleverCtx?.document_ids) ? (opleverCtx.document_ids as number[]) : [];
  const isGereed = aiFase === "gereed";

  const toonControlerapport = controlerapport ?? (opgeslagenControlerapport ? mapOpgeslagenControlerapport(opgeslagenControlerapport) : null);

  return (
    <div className="mt-4 space-y-4">
      {/* Fase badge */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Huidige fase:</span>
        <FaseBadge fase={aiFase ?? "uitvoering"} />
      </div>

      {isGereed && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              Opdracht definitief opgeleverd
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 text-sm text-emerald-800">
            Deze opdracht is volledig afgerond en definitief opgeleverd. Het opleverdossier is aangemaakt in de documentbibliotheek.
          </CardContent>
        </Card>
      )}

      {/* Stap 1 — Volledigheidscheck */}
      {!isGereed && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                Stap 1 — Volledigheidscheck
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => controleerMutatie.mutate({ id: opdrachtId })}
                disabled={controleerMutatie.isPending}
              >
                {controleerMutatie.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Controleren...</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5 mr-1.5" />AI-controle uitvoeren</>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            {toonControlerapport ? (
              <ControlerapportWeergave rapport={toonControlerapport} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Klik op "AI-controle uitvoeren" om te controleren of alle stappen, fotos en afwijkingen zijn afgesloten.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stap 2 — Dossier genereren */}
      {!isGereed && (toonControlerapport?.volledig || opgeslagenDocIds.length > 0) && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Stap 2 — Dossier genereren
              </CardTitle>
              {opgeslagenDocIds.length === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => genereerMutatie.mutate({ id: opdrachtId })}
                  disabled={genereerMutatie.isPending}
                >
                  {genereerMutatie.isPending ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Genereren...</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Dossier genereren</>
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            {(gegenereerd?.documenten ?? []).length > 0 ? (
              <DocumentenLijst documenten={gegenereerd!.documenten} />
            ) : opgeslagenDocIds.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Eerder gegenereerde documenten ({opgeslagenDocIds.length}):</p>
                <div className="flex flex-wrap gap-2">
                  {opgeslagenDocIds.map((id) => (
                    <Badge key={id} variant="secondary" className="font-normal">
                      <FileCheck2 className="h-3 w-3 mr-1" />
                      Document #{id}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Klik op "Dossier genereren" om het opleverdossier en de overdrachtsnotitie aan te maken.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stap 3 — Definitief maken */}
      {!isGereed && (opgeslagenDocIds.length > 0 || (gegenereerd?.documenten ?? []).length > 0) && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Stap 3 — Definitief opleveren
              </CardTitle>
              <Button
                size="sm"
                onClick={() => setDefinitiefDialoog(true)}
                disabled={definitiefMutatie.isPending}
              >
                {definitiefMutatie.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Bezig...</>
                ) : (
                  <><FileCheck2 className="h-3.5 w-3.5 mr-1.5" />Definitief opleveren</>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-sm text-muted-foreground">
              Bevestig dat alle werkzaamheden zijn afgerond en het dossier compleet is. De PIM-fase wordt ingesteld op "Gereed".
            </p>
          </CardContent>
        </Card>
      )}

      {/* Bevestigingsdialoog */}
      <AlertDialog open={definitiefDialoog} onOpenChange={setDefinitiefDialoog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opdracht definitief opleveren</AlertDialogTitle>
            <AlertDialogDescription>
              Hiermee bevestigt u dat alle brandwerende werkzaamheden zijn uitgevoerd en gedocumenteerd. De opdracht wordt definitief afgesloten en de PIM-fase wordt ingesteld op "Gereed". Deze actie kan niet worden teruggedraaid.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDefinitiefDialoog(false);
                definitiefMutatie.mutate({ id: opdrachtId });
              }}
            >
              Definitief opleveren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Sub-componenten ────────────────────────────────────────────────────────────

function FaseBadge({ fase }: { fase: string }) {
  const FASE_KLEUR: Record<string, string> = {
    nieuw: "bg-slate-100 text-slate-700",
    advies: "bg-blue-100 text-blue-800",
    advies_gereed: "bg-indigo-100 text-indigo-800",
    werkvoorbereiding: "bg-violet-100 text-violet-800",
    inkoop: "bg-amber-100 text-amber-800",
    uitvoering: "bg-orange-100 text-orange-800",
    oplevering: "bg-emerald-100 text-emerald-800",
    gereed: "bg-green-100 text-green-800",
  };
  const FASE_LABEL: Record<string, string> = {
    nieuw: "Nieuw",
    advies: "Advies",
    advies_gereed: "Advies gereed",
    werkvoorbereiding: "Werkvoorbereiding",
    inkoop: "Inkoop",
    uitvoering: "Uitvoering",
    oplevering: "Oplevering",
    gereed: "Gereed",
  };
  return (
    <Badge className={`${FASE_KLEUR[fase] ?? "bg-slate-100 text-slate-700"} font-medium text-xs`}>
      {FASE_LABEL[fase] ?? fase}
    </Badge>
  );
}

interface ControlepuntType {
  label: string;
  ok: boolean;
  detail?: string | null;
}

interface ControlerapportType {
  volledig: boolean;
  controle_punten: ControlepuntType[];
  ontbrekende_punten: string[];
  aandachtspunten_oplevering: string[];
  ai_samenvatting?: string | null;
}

function ControlerapportWeergave({ rapport }: { rapport: ControlerapportType }) {
  return (
    <div className="space-y-3">
      {/* Samenvatting */}
      {rapport.ai_samenvatting && (
        <p className="text-sm text-muted-foreground italic">{rapport.ai_samenvatting}</p>
      )}

      <Separator />

      {/* Status banner */}
      <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${rapport.volledig ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
        {rapport.volledig ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0" />
        )}
        {rapport.volledig ? "Alle controles geslaagd — dossier kan worden gegenereerd" : `${rapport.ontbrekende_punten.length} punt(en) vereisen actie`}
      </div>

      {/* Controlepunten */}
      <div className="space-y-1.5">
        {rapport.controle_punten.map((punt, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            {punt.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
            )}
            <div>
              <span className={punt.ok ? "text-emerald-800" : "text-rose-800 font-medium"}>{punt.label}</span>
              {punt.detail && <p className="text-xs text-muted-foreground mt-0.5">{punt.detail}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Aandachtspunten */}
      {rapport.aandachtspunten_oplevering.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Aandachtspunten voor het dossier
          </p>
          <ul className="text-xs text-amber-800 space-y-0.5 pl-4">
            {rapport.aandachtspunten_oplevering.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DocumentenLijst({ documenten }: { documenten: { document_id: number; type: string; naam: string }[] }) {
  const TYPE_LABEL: Record<string, string> = {
    opleverdossier: "Opleverdossier",
    overdrachtsnotitie: "Overdrachtsnotitie onderhoud",
  };
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">De volgende documenten zijn aangemaakt in de documentbibliotheek:</p>
      {documenten.map((doc) => (
        <div key={doc.document_id} className="flex items-center gap-3 rounded-md border px-3 py-2">
          <FileText className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{doc.naam}</p>
            <p className="text-xs text-muted-foreground">{TYPE_LABEL[doc.type] ?? doc.type} — #{doc.document_id}</p>
          </div>
          <Download className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      ))}
    </div>
  );
}

function mapOpgeslagenControlerapport(ctx: Record<string, unknown>): ControlerapportType {
  return {
    volledig: Boolean(ctx.volledig),
    controle_punten: Array.isArray(ctx.controle_punten) ? (ctx.controle_punten as ControlepuntType[]) : [],
    ontbrekende_punten: Array.isArray(ctx.ontbrekende_punten) ? (ctx.ontbrekende_punten as string[]) : [],
    aandachtspunten_oplevering: Array.isArray(ctx.aandachtspunten_oplevering) ? (ctx.aandachtspunten_oplevering as string[]) : [],
    ai_samenvatting: typeof ctx.samenvatting === "string" ? ctx.samenvatting : null,
  };
}

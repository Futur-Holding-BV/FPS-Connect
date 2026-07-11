// Poortwachter-dossier sheet — toont de 7 WvP-mijlpalen met deadlines, statussen
// en afvinkfunctie. Opent vanuit de ziekmeldingen-tab in personeel/index.tsx.
// Het dossier wordt auto-aangemaakt door GET /hrm/ziekmeldingen/:id/poortwachter.

import { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, Circle, AlertTriangle, Clock, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  useGetPoortwachterDossier,
  usePatchPoortwachterMijlpaal,
  getGetPoortwachterDossierQueryKey,
} from "@workspace/api-client-react";
import type { PoortwachterMijlpaal } from "@workspace/api-client-react";

interface Props {
  ziekmeldingId: number | null;
  onOpenChange: (open: boolean) => void;
}

function fmtDatum(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function dagenTot(deadline: string): number {
  const nu = new Date(); nu.setHours(0, 0, 0, 0);
  return Math.floor((new Date(deadline).getTime() - nu.getTime()) / 86400000);
}

function StatusBadge({ status, deadline_datum }: { status: string; deadline_datum: string }) {
  if (status === "afgerond") return (
    <Badge className="bg-green-100 text-green-800 border-0 text-xs">Afgerond</Badge>
  );
  if (status === "buiten_termijn") return (
    <Badge className="bg-red-100 text-red-800 border-0 text-xs">Termijn verstreken</Badge>
  );
  if (status === "nadert") {
    const dagen = dagenTot(deadline_datum);
    return (
      <Badge className="bg-amber-100 text-amber-800 border-0 text-xs">
        {dagen === 0 ? "Vandaag" : `Nog ${dagen} dag${dagen === 1 ? "" : "en"}`}
      </Badge>
    );
  }
  const dagen = dagenTot(deadline_datum);
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">
      {dagen > 0 ? `Nog ${dagen} dagen` : "Vandaag"}
    </Badge>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "afgerond") return <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />;
  if (status === "buiten_termijn") return <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />;
  if (status === "nadert") return <Clock className="h-5 w-5 text-amber-600 shrink-0" />;
  return <Circle className="h-5 w-5 text-muted-foreground/50 shrink-0" />;
}

function MijlpaalRij({
  mijlpaal, dossierId, magSchrijven,
}: {
  mijlpaal: PoortwachterMijlpaal;
  dossierId: number;
  magSchrijven: boolean;
}) {
  const [uitgevouwen, setUitgevouwen] = useState(
    mijlpaal.status === "buiten_termijn" || mijlpaal.status === "nadert",
  );
  const [notitie, setNotitie] = useState(mijlpaal.notitie ?? "");
  const [notitieGewijzigd, setNotitieGewijzigd] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { mutate: patch, isPending } = usePatchPoortwachterMijlpaal({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetPoortwachterDossierQueryKey(dossierId) });
        setNotitieGewijzigd(false);
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    },
  });

  function toggleAfgerond() {
    patch({ dossierId, type: mijlpaal.type, data: { afgerond: mijlpaal.status !== "afgerond" } });
  }

  function slaNotitieOp() {
    patch({ dossierId, type: mijlpaal.type, data: { notitie } });
  }

  const ringKleur =
    mijlpaal.status === "afgerond" ? "border-l-green-400" :
    mijlpaal.status === "buiten_termijn" ? "border-l-red-400" :
    mijlpaal.status === "nadert" ? "border-l-amber-400" :
    "border-l-transparent";

  return (
    <div className={`border rounded-lg border-l-4 ${ringKleur} overflow-hidden`}>
      <button
        type="button"
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
        onClick={() => setUitgevouwen((v) => !v)}
      >
        <StatusIcon status={mijlpaal.status} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-tight">{mijlpaal.label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Deadline: {fmtDatum(mijlpaal.deadline_datum)}
          </div>
        </div>
        <StatusBadge status={mijlpaal.status} deadline_datum={mijlpaal.deadline_datum} />
        {uitgevouwen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {uitgevouwen && (
        <div className="px-4 pb-4 space-y-3 border-t bg-muted/20">
          <div className="pt-3 space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Notitie / documentatie
            </label>
            <Textarea
              value={notitie}
              onChange={(e) => { setNotitie(e.target.value); setNotitieGewijzigd(true); }}
              placeholder={
                mijlpaal.type === "probleemanalyse" ? "Bijv. rapport bedrijfsarts ontvangen op..." :
                mijlpaal.type === "plan_van_aanpak" ? "Bijv. PvA opgesteld en ondertekend door medewerker en leidinggevende..." :
                mijlpaal.type === "uwv_melding" ? "Bijv. UWV-melding ingediend via uwv.nl, ontvangstbevestiging..." :
                "Voeg hier notities toe over deze stap..."
              }
              className="text-sm min-h-[64px]"
              disabled={!magSchrijven || isPending}
            />
            {notitieGewijzigd && magSchrijven && (
              <Button size="sm" variant="outline" onClick={slaNotitieOp} disabled={isPending} className="text-xs">
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Notitie opslaan
              </Button>
            )}
            {mijlpaal.notitie && !notitieGewijzigd && (
              <p className="text-xs text-muted-foreground">
                Bijgewerkt{mijlpaal.bijgewerkt_door_naam ? ` door ${mijlpaal.bijgewerkt_door_naam}` : ""}
              </p>
            )}
          </div>

          {magSchrijven && (
            <div className="flex items-center gap-2 pt-1">
              {mijlpaal.status !== "afgerond" ? (
                <Button size="sm" onClick={toggleAfgerond} disabled={isPending} className="text-xs gap-1.5">
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Afgerond markeren
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={toggleAfgerond} disabled={isPending} className="text-xs gap-1.5 text-muted-foreground">
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Markering ongedaan maken
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PoortwachterSheet({ ziekmeldingId, onOpenChange }: Props) {
  const open = ziekmeldingId !== null;
  const { data: dossier, isLoading, isError } = useGetPoortwachterDossier(
    ziekmeldingId ?? 0,
    { query: { enabled: open, queryKey: getGetPoortwachterDossierQueryKey(ziekmeldingId ?? 0) } },
  );

  const afgerond = dossier?.mijlpalen.filter((m) => m.status === "afgerond").length ?? 0;
  const totaal = dossier?.mijlpalen.length ?? 7;
  const heeftProbleem = dossier?.mijlpalen.some(
    (m) => m.status === "buiten_termijn" || m.status === "nadert",
  ) ?? false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[560px] overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2 text-base">
            Poortwachter-dossier
            {dossier && (
              <span className="text-muted-foreground font-normal">— {dossier.medewerker_naam}</span>
            )}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="space-y-1">
              {dossier && (
                <p className="text-xs">
                  Ziek sinds {fmtDatum(dossier.start_datum)} ·{" "}
                  <span className={heeftProbleem ? "text-red-600 font-medium" : "text-muted-foreground"}>
                    {afgerond} van {totaal} mijlpalen afgerond
                  </span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Wet Verbetering Poortwachter — verplichte reintegratiemijlpalen.
                Gemiste deadlines kunnen leiden tot een UWV-sanctie (loonsanctie tot 52 weken).
              </p>
            </div>
          </SheetDescription>
        </SheetHeader>

        <Separator className="my-4" />

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <div className="text-sm text-destructive py-6 text-center">
            Dossier kon niet worden geladen.
          </div>
        )}

        {dossier && (
          <div className="space-y-3">
            {heeftProbleem && (
              <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Er zijn mijlpalen met naderende of verstreken deadlines.
                  Neem direct actie om een UWV-loonsanctie te voorkomen.
                </span>
              </div>
            )}
            {dossier.mijlpalen.map((m) => (
              <MijlpaalRij
                key={m.type}
                mijlpaal={m}
                dossierId={dossier.id}
                magSchrijven
              />
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

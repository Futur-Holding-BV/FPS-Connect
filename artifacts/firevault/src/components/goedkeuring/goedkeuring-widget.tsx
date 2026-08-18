// Herbruikbaar goedkeuringsstatuswidget — generiek voor elk document/object_type
// (inkoopbon, offerte, ...). Toont de laatste aanvraag + acties (goedkeuren/
// afwijzen/intrekken/indienen) op basis van de server-berekende `mag_goedkeuren`,
// plus een chronologische tijdlijn van alle stappen (wie deed wat en wanneer).
import { useState } from "react";
import {
  useGetGoedkeuringVoorObject,
  useDienGoedkeuringAanvraagIn,
  useGoedkeuringAanvraagGoedkeuren,
  useGoedkeuringAanvraagAfwijzen,
  useGoedkeuringAanvraagIntrekken,
  getGetGoedkeuringVoorObjectQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import type { GoedkeuringAanvraag, GoedkeuringStap } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Clock, Undo2, ShieldCheck, ChevronDown, ChevronUp, Send, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import { useRol } from "@/context/rol-context";
import { useQueryClient } from "@tanstack/react-query";

interface GoedkeuringWidgetProps {
  objectType: string;
  objectId: number;
  documentType?: string;
  bedrag?: number | null;
  omschrijving?: string | null;
  werkmaatschappijId?: number | null;
  toonIndienKnop?: boolean;
  /** Verberg alle muterende acties (goedkeuren/afwijzen/intrekken) voor alleen-lezen gebruikers */
  leesOnly?: boolean;
  onWijziging?: (aanvraag: GoedkeuringAanvraag) => void;
}

export const GOEDKEURING_STATUS_INFO: Record<string, { label: string; kleur: string; icon: typeof Clock }> = {
  ingediend: { label: "Wacht op goedkeuring", kleur: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock },
  goedgekeurd: { label: "Goedgekeurd", kleur: "bg-secondary text-muted-foreground border-transparent", icon: CheckCircle2 },
  afgewezen: { label: "Afgewezen", kleur: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
  ingetrokken: { label: "Ingetrokken", kleur: "bg-secondary text-muted-foreground border-transparent", icon: Undo2 },
  vervangen: { label: "Vervangen door nieuwe versie", kleur: "bg-secondary text-muted-foreground border-transparent", icon: Undo2 },
};

const STAP_ACTIE_INFO: Record<string, { label: string; kleur: string; icon: typeof Clock }> = {
  indienen: { label: "Ingediend", kleur: "text-amber-700", icon: Send },
  goedkeuren: { label: "Goedgekeurd", kleur: "text-green-700", icon: CheckCircle2 },
  afwijzen: { label: "Afgewezen", kleur: "text-red-700", icon: XCircle },
  intrekken: { label: "Ingetrokken", kleur: "text-muted-foreground", icon: Undo2 },
  vervangen: { label: "Vervangen", kleur: "text-muted-foreground", icon: AlertCircle },
};

function StapTijdlijn({ stappen }: { stappen: GoedkeuringStap[] }) {
  if (stappen.length === 0) return null;
  return (
    <ol className="mt-2 border-l-2 border-border pl-4 space-y-2">
      {stappen.map((stap) => {
        const info = STAP_ACTIE_INFO[stap.actie] ?? STAP_ACTIE_INFO.indienen;
        const Icon = info.icon;
        const datum = new Date(stap.aangemaakt_op).toLocaleString("nl-NL", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        });
        return (
          <li key={stap.id} className="relative -ml-[1.15rem] flex items-start gap-2">
            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-background border border-border ${info.kleur}`}>
              <Icon className="h-2.5 w-2.5" />
            </span>
            <div className="min-w-0">
              <span className={`text-xs font-medium ${info.kleur}`}>{info.label}</span>
              {stap.gebruiker_naam && (
                <span className="text-xs text-muted-foreground"> door {stap.gebruiker_naam}</span>
              )}
              <span className="block text-xs text-muted-foreground">{datum}</span>
              {stap.reden && (
                <span className="block text-xs text-foreground/70 italic mt-0.5">"{stap.reden}"</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function GoedkeuringWidget({
  objectType,
  objectId,
  documentType,
  bedrag = null,
  omschrijving = null,
  werkmaatschappijId = null,
  toonIndienKnop = false,
  leesOnly = false,
  onWijziging,
}: GoedkeuringWidgetProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { gebruiker } = useAuth();
  const { rol } = useRol();
  const [afwijzenOpen, setAfwijzenOpen] = useState(false);
  const [afwijzenReden, setAfwijzenReden] = useState("");
  const [tijdlijnOpen, setTijdlijnOpen] = useState(false);

  const { data: aanvraag, isLoading } = useGetGoedkeuringVoorObject(objectType, objectId);

  function verversen(nieuw?: GoedkeuringAanvraag) {
    qc.invalidateQueries({ queryKey: getGetGoedkeuringVoorObjectQueryKey(objectType, objectId) });
    if (nieuw) onWijziging?.(nieuw);
  }

  const dienIn = useDienGoedkeuringAanvraagIn({
    mutation: {
      onSuccess: (data) => {
        verversen(data);
        toast({ title: "Ter goedkeuring ingediend" });
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 422) {
          toast({ title: "Geen goedkeuringsbeleid van toepassing", description: "Er is geen beleidsregel gekoppeld aan dit document/bedrag." });
        } else {
          toast({ title: "Indienen mislukt", variant: "destructive" });
        }
      },
    },
  });

  const goedkeuren = useGoedkeuringAanvraagGoedkeuren({
    mutation: {
      onSuccess: (data) => {
        verversen(data);
        toast({ title: "Aanvraag goedgekeurd" });
      },
      onError: () => toast({ title: "Goedkeuren mislukt", variant: "destructive" }),
    },
  });

  const afwijzen = useGoedkeuringAanvraagAfwijzen({
    mutation: {
      onSuccess: (data) => {
        verversen(data);
        toast({ title: "Aanvraag afgewezen" });
        setAfwijzenOpen(false);
        setAfwijzenReden("");
      },
      onError: () => toast({ title: "Afwijzen mislukt", variant: "destructive" }),
    },
  });

  const intrekken = useGoedkeuringAanvraagIntrekken({
    mutation: {
      onSuccess: (data) => {
        verversen(data);
        toast({ title: "Aanvraag ingetrokken" });
      },
      onError: () => toast({ title: "Intrekken mislukt", variant: "destructive" }),
    },
  });

  if (isLoading) return <Skeleton className="h-6 w-40" />;

  if (!aanvraag) {
    if (!toonIndienKnop) return null;
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        disabled={dienIn.isPending}
        onClick={() =>
          dienIn.mutate({
            data: {
              object_type: objectType,
              object_id: objectId,
              document_type: documentType ?? objectType,
              omschrijving,
              bedrag,
              werkmaatschappij_id: werkmaatschappijId,
            },
          })
        }
      >
        <ShieldCheck className="h-3 w-3" />
        {dienIn.isPending ? "Bezig..." : "Ter goedkeuring indienen"}
      </Button>
    );
  }

  const info = GOEDKEURING_STATUS_INFO[aanvraag.status] ?? GOEDKEURING_STATUS_INFO.ingediend;
  const Icon = info.icon;
  const magIntrekken = aanvraag.status === "ingediend" && (rol === "hoofdbeheerder" || gebruiker?.id === aanvraag.ingediend_door_id);
  const stappen: GoedkeuringStap[] = aanvraag.stappen ?? [];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={`text-xs ${info.kleur}`}>
          <Icon className="h-3 w-3 mr-1" />
          {info.label}
        </Badge>
        {aanvraag.status === "ingediend" && aanvraag.vereiste_goedkeuringen > 1 && (
          <span className="text-xs text-muted-foreground">
            {aanvraag.ontvangen_goedkeuringen}/{aanvraag.vereiste_goedkeuringen} goedkeuringen
          </span>
        )}
        {aanvraag.ingediend_door_naam && (
          <span className="text-xs text-muted-foreground">door {aanvraag.ingediend_door_naam}</span>
        )}
        {stappen.length > 0 && (
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setTijdlijnOpen((v) => !v)}
          >
            {tijdlijnOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Tijdlijn ({stappen.length})
          </button>
        )}
      </div>
      {aanvraag.status === "afgewezen" && aanvraag.afwijzing_reden && (
        <p className="text-xs text-red-700">Reden: {aanvraag.afwijzing_reden}</p>
      )}
      {!leesOnly && aanvraag.status === "ingediend" && (
        <div className="flex items-center gap-1 flex-wrap">
          {aanvraag.mag_goedkeuren && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                disabled={goedkeuren.isPending}
                onClick={() => goedkeuren.mutate({ id: aanvraag.id })}
              >
                <CheckCircle2 className="h-3 w-3" />
                Goedkeuren
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs text-destructive"
                disabled={afwijzen.isPending}
                onClick={() => setAfwijzenOpen(true)}
              >
                <XCircle className="h-3 w-3" />
                Afwijzen
              </Button>
            </>
          )}
          {magIntrekken && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              disabled={intrekken.isPending}
              onClick={() => intrekken.mutate({ id: aanvraag.id })}
            >
              <Undo2 className="h-3 w-3" />
              Intrekken
            </Button>
          )}
        </div>
      )}

      {tijdlijnOpen && stappen.length > 0 && (
        <StapTijdlijn stappen={stappen} />
      )}

      <Dialog open={afwijzenOpen} onOpenChange={setAfwijzenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aanvraag afwijzen</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reden (verplicht)</Label>
            <Textarea
              value={afwijzenReden}
              onChange={(e) => setAfwijzenReden(e.target.value)}
              placeholder="Waarom wordt deze aanvraag afgewezen?"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAfwijzenOpen(false)} disabled={afwijzen.isPending}>
              Annuleren
            </Button>
            <Button
              variant="destructive"
              disabled={!afwijzenReden.trim() || afwijzen.isPending}
              onClick={() => afwijzen.mutate({ id: aanvraag.id, data: { reden: afwijzenReden.trim() } })}
            >
              {afwijzen.isPending ? "Bezig..." : "Afwijzen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

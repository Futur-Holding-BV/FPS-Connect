import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVeiligheidIncidenten,
  usePatchVeiligheidIncidentenId,
  useDeleteVeiligheidIncidentenId,
  getGetVeiligheidIncidentenQueryKey,
  type VeiligheidIncident,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import {
  AlertTriangle, Trash2, Loader2, CheckCircle2, Clock,
  MapPin, User, Briefcase, Calendar, Filter, ChevronRight,
  TriangleAlert, Shield,
} from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  bijna_ongeval: "Bijna-Ongeval",
  ongeval: "Arbeidsongeval",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_behandeling: "In behandeling",
  gesloten: "Gesloten",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "gesloten") return <Badge className="bg-green-100 text-green-800 border-green-300">Gesloten</Badge>;
  if (status === "in_behandeling") return <Badge className="bg-amber-100 text-amber-800 border-amber-300">In behandeling</Badge>;
  return <Badge variant="destructive">Open</Badge>;
}

function TypeBadge({ type }: { type: string }) {
  if (type === "ongeval") return (
    <Badge className="bg-red-100 text-red-800 border-red-300 flex items-center gap-1">
      <TriangleAlert className="w-3 h-3" />
      Arbeidsongeval
    </Badge>
  );
  return (
    <Badge className="bg-amber-100 text-amber-800 border-amber-300 flex items-center gap-1">
      <AlertTriangle className="w-3 h-3" />
      Bijna-Ongeval
    </Badge>
  );
}

export default function VeiligheidIncidentenPagina() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("toolbox", 3);
  const kanVerwijderen = heeftNiveau("toolbox", 4);

  const [typeFilter, setTypeFilter] = useState("alle");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [detailIncident, setDetailIncident] = useState<VeiligheidIncident | null>(null);
  const [verwijderDialoogId, setVerwijderDialoogId] = useState<number | null>(null);

  const { data: incidenten = [], isLoading } = useGetVeiligheidIncidenten();

  const bijwerkenMutatie = usePatchVeiligheidIncidentenId({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetVeiligheidIncidentenQueryKey() });
        toast({ title: "Status bijgewerkt" });
      },
    },
  });

  const verwijderenMutatie = useDeleteVeiligheidIncidentenId({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetVeiligheidIncidentenQueryKey() });
        setVerwijderDialoogId(null);
        toast({ title: "Incident verwijderd" });
      },
    },
  });

  const gefilterd = incidenten.filter(i => {
    if (typeFilter !== "alle" && i.type !== typeFilter) return false;
    if (statusFilter !== "alle" && i.status !== statusFilter) return false;
    return true;
  });

  const setStatus = (id: number, status: string) => {
    bijwerkenMutatie.mutate({ id, data: { status } as any });
  };

  const aantalOpen = incidenten.filter(i => i.status === "open").length;
  const aantalMeldplichtig = incidenten.filter(i => i.meldplichtig && !i.gemeld_bij_arbeidsinspectie).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TriangleAlert className="w-6 h-6 text-amber-600" />
            Incidenten
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Bijna-Ongevallen &amp; Arbeidsongevallen conform Arbeidsinspectie richtlijnen
          </p>
        </div>
        <div className="flex gap-2">
          {aantalMeldplichtig > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="w-3 h-3" />
              {aantalMeldplichtig} NLA-meldplichtig
            </Badge>
          )}
          {aantalOpen > 0 && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1">
              <Clock className="w-3 h-3" />
              {aantalOpen} open
            </Badge>
          )}
        </div>
      </div>

      {aantalMeldplichtig > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-red-800 text-sm">
                {aantalMeldplichtig} incident(en) zijn mogelijk meldplichtig bij de Nederlandse Arbeidsinspectie
              </p>
              <p className="text-red-700 text-xs mt-1">
                Arbeidsongevallen met ziekenhuisopname, blijvend letsel of dodelijk afloop moeten binnen 24 uur worden gemeld via de NLA-meldlijn: 0800-5151.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Alle typen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle typen</SelectItem>
              <SelectItem value="bijna_ongeval">Bijna-Ongeval</SelectItem>
              <SelectItem value="ongeval">Arbeidsongeval</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Alle statussen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_behandeling">In behandeling</SelectItem>
            <SelectItem value="gesloten">Gesloten</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : gefilterd.length === 0 ? (
        <Card>
          <CardContent className="p-12 flex flex-col items-center gap-3 text-muted-foreground">
            <Shield className="w-12 h-12" />
            <p className="font-medium">Geen incidenten gevonden</p>
            <p className="text-sm">Incidenten worden via de monteur-app (telefoon) geregistreerd.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {gefilterd.map(incident => (
            <Card
              key={incident.id}
              className="cursor-pointer hover:shadow-md transition-shadow border-l-4"
              style={{ borderLeftColor: incident.type === "ongeval" ? "rgb(239 68 68)" : "rgb(245 158 11)" }}
              onClick={() => setDetailIncident(incident)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <TypeBadge type={incident.type} />
                      <StatusBadge status={incident.status} />
                      {incident.meldplichtig && !incident.gemeld_bij_arbeidsinspectie && (
                        <Badge variant="destructive" className="gap-1 text-xs">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          NLA-meldplichtig
                        </Badge>
                      )}
                      {incident.ai_voorstel && (
                        <Badge variant="outline" className="text-xs text-purple-700 border-purple-300">AI-voorstel</Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground line-clamp-2 mb-2">
                      {incident.omschrijving}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {incident.locatie_omschrijving}
                      </span>
                      {incident.datum && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(incident.datum).toLocaleDateString("nl-NL")}
                          {incident.tijdstip ? ` om ${incident.tijdstip}` : ""}
                        </span>
                      )}
                      {incident.medewerker_naam && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {incident.medewerker_naam}
                        </span>
                      )}
                      {incident.opdracht_naam && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="w-3 h-3" />
                          {incident.opdracht_naam}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                </div>
                {kanSchrijven && incident.status !== "gesloten" && (
                  <div className="flex gap-2 mt-3 pt-3 border-t" onClick={e => e.stopPropagation()}>
                    {incident.status === "open" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStatus(incident.id, "in_behandeling")}
                        disabled={bijwerkenMutatie.isPending}
                        className="text-xs"
                      >
                        <Clock className="w-3 h-3 mr-1" />
                        In behandeling
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setStatus(incident.id, "gesloten")}
                      disabled={bijwerkenMutatie.isPending}
                      className="text-xs"
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Sluiten
                    </Button>
                    {incident.meldplichtig && !incident.gemeld_bij_arbeidsinspectie && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => bijwerkenMutatie.mutate({ id: incident.id, data: { gemeld_bij_arbeidsinspectie: true } as any })}
                        disabled={bijwerkenMutatie.isPending}
                        className="text-xs text-green-700 border-green-300 hover:bg-green-50"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Gemeld bij NLA
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!detailIncident} onOpenChange={() => setDetailIncident(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className={detailIncident?.type === "ongeval" ? "w-5 h-5 text-red-600" : "w-5 h-5 text-amber-600"} />
              {detailIncident ? TYPE_LABELS[detailIncident.type] ?? detailIncident.type : ""}
            </DialogTitle>
          </DialogHeader>
          {detailIncident && (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={detailIncident.status} />
                {detailIncident.meldplichtig && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    NLA-meldplichtig
                  </Badge>
                )}
                {detailIncident.gemeld_bij_arbeidsinspectie && (
                  <Badge className="bg-green-100 text-green-800 border-green-300 gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Gemeld bij NLA
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {detailIncident.datum && (
                  <div>
                    <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Datum en tijd</p>
                    <p>{new Date(detailIncident.datum).toLocaleDateString("nl-NL")}{detailIncident.tijdstip ? ` om ${detailIncident.tijdstip}` : ""}</p>
                  </div>
                )}
                <div>
                  <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Locatie</p>
                  <p>{detailIncident.locatie_omschrijving}</p>
                </div>
                {detailIncident.opdracht_naam && (
                  <div>
                    <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Opdracht</p>
                    <p>{detailIncident.opdracht_naam}</p>
                  </div>
                )}
                {detailIncident.medewerker_naam && (
                  <div>
                    <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Geregistreerd door</p>
                    <p>{detailIncident.medewerker_naam}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide mb-1">Omschrijving</p>
                <p className="whitespace-pre-wrap">{detailIncident.omschrijving}</p>
              </div>

              {detailIncident.oorzaak && (
                <div>
                  <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide mb-1">Oorzaak</p>
                  <p className="whitespace-pre-wrap">{detailIncident.oorzaak}</p>
                </div>
              )}

              {detailIncident.letsel_beschrijving && (
                <div>
                  <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide mb-1">Letsel</p>
                  <p>{detailIncident.letsel_beschrijving}</p>
                </div>
              )}

              <div className="flex gap-4">
                <div>
                  <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide mb-1">Eerste hulp</p>
                  <p>{detailIncident.eerste_hulp_verleend ? "Ja" : "Nee"}</p>
                  {detailIncident.eerste_hulp_beschrijving && <p className="text-xs text-muted-foreground mt-0.5">{detailIncident.eerste_hulp_beschrijving}</p>}
                </div>
              </div>

              {(detailIncident.getuigen ?? []).length > 0 && (
                <div>
                  <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide mb-1">Getuigen</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {(detailIncident.getuigen ?? []).map((g, i) => <li key={i}>{g}</li>)}
                  </ul>
                </div>
              )}

              {(detailIncident.genomen_maatregelen ?? []).length > 0 && (
                <div>
                  <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide mb-1">Genomen maatregelen</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {(detailIncident.genomen_maatregelen ?? []).map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}

              {kanSchrijven && detailIncident.status !== "gesloten" && (
                <div className="flex gap-2 pt-3 border-t">
                  {detailIncident.status === "open" && (
                    <Button size="sm" variant="outline" onClick={() => { setStatus(detailIncident.id, "in_behandeling"); setDetailIncident(d => d ? { ...d, status: "in_behandeling" } : null); }}>
                      <Clock className="w-3 h-3 mr-1" />
                      In behandeling
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => { setStatus(detailIncident.id, "gesloten"); setDetailIncident(d => d ? { ...d, status: "gesloten" } : null); }}>
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Sluiten
                  </Button>
                </div>
              )}

              {kanVerwijderen && (
                <div className="pt-3 border-t">
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setVerwijderDialoogId(detailIncident.id)}>
                    <Trash2 className="w-3 h-3 mr-1" />
                    Verwijderen
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={verwijderDialoogId !== null} onOpenChange={() => setVerwijderDialoogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Incident verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit verwijdert het incidentrapport definitief. Dit kan niet worden teruggedraaid.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => verwijderDialoogId && verwijderenMutatie.mutate({ id: verwijderDialoogId })}
              className="bg-destructive text-destructive-foreground"
            >
              {verwijderenMutatie.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

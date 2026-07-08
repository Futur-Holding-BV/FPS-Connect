import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useListGebouwRapporten,
  useCreateRapport,
  useDeleteRapport,
  useMaakRapportDefinitief,
  useMaakNieuweVersieRapport,
  type Rapport,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Loader2,
  FileText,
  Plus,
  Trash2,
  Lock,
  Clock,
  CheckCircle2,
  Archive,
  Printer,
  AlertCircle,
  PenLine,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getListGebouwRapportenQueryKey } from "@workspace/api-client-react";

const RAPPORT_TYPE_LABEL: Record<string, string> = {
  werkpakket_monteur: "Werkpakket monteur",
  voortgang: "Voortgangsrapportage",
  opleverrapport: "Opleverrapport brandveiligheid",
  opleverdossier: "Opleverdossier",
};

function dagToString(datum: string | null | undefined): string | null {
  if (!datum) return null;
  return new Date(datum).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function reactietermijnDagen(datum: string | null | undefined): number | null {
  if (!datum) return null;
  const diff = new Date(datum).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function StatusBadge({ rapport }: { rapport: Rapport }) {
  const os = rapport.opleverstatus;

  if (os === "concept") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200">
        Concept
      </Badge>
    );
  }

  if (os === "verzonden") {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200">
        <Send className="h-3 w-3 mr-1" />
        Verzonden
      </Badge>
    );
  }

  if (os === "reactietermijn_loopt") {
    const dagen = reactietermijnDagen(rapport.reactietermijn_datum);
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200">
        <Clock className="h-3 w-3 mr-1" />
        Reactietermijn loopt{dagen !== null ? ` — nog ${dagen} dag${dagen !== 1 ? "en" : ""}` : ""}
      </Badge>
    );
  }

  if (os === "verstreken") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200">
        <AlertCircle className="h-3 w-3 mr-1" />
        Termijn verstreken
      </Badge>
    );
  }

  if (os === "vervangen") {
    return (
      <Badge className="bg-neutral-100 text-neutral-500 border-neutral-200">
        <XCircle className="h-3 w-3 mr-1" />
        Vervangen
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="text-muted-foreground">
      <Archive className="h-3 w-3 mr-1" />
      Gearchiveerd
    </Badge>
  );
}

function StatusIcoon({ rapport }: { rapport: Rapport }) {
  const os = rapport.opleverstatus;
  if (os === "concept") return <FileText className="h-4 w-4 text-amber-500" />;
  if (os === "verzonden") return <Send className="h-4 w-4 text-blue-500" />;
  if (os === "reactietermijn_loopt") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (os === "verstreken") return <AlertCircle className="h-4 w-4 text-red-500" />;
  if (os === "vervangen") return <XCircle className="h-4 w-4 text-neutral-400" />;
  return <Archive className="h-4 w-4 text-muted-foreground" />;
}

export default function GebouwRapporten({ gebouwId, isBeheerder }: { gebouwId: number; isBeheerder: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: rapporten = [], isLoading } = useListGebouwRapporten(gebouwId);

  const maakNieuw = useCreateRapport();
  const definitiefMaken = useMaakRapportDefinitief();
  const nieuweVersie = useMaakNieuweVersieRapport();
  const verwijder = useDeleteRapport();

  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [nieuwType, setNieuwType] = useState<string>("opleverrapport");
  const [nieuwTitel, setNieuwTitel] = useState("");

  const [definitiefOpen, setDefinitiefOpen] = useState(false);
  const [definitiefRapport, setDefinitiefRapport] = useState<Rapport | null>(null);
  const [reactietermijnDagenInput, setReactietermijnDagenInput] = useState("30");

  const [verwijderOpen, setVerwijderOpen] = useState(false);
  const [verwijderRapportId, setVerwijderRapportId] = useState<number | null>(null);

  function invalideer() {
    qc.invalidateQueries({ queryKey: getListGebouwRapportenQueryKey(gebouwId) });
  }

  async function handleNieuw() {
    try {
      const nieuwRapport = await maakNieuw.mutateAsync({
        id: gebouwId,
        data: {
          rapport_type: nieuwType,
          titel: nieuwTitel.trim() || null,
        },
      });
      toast({ title: "Conceptrapport aangemaakt", description: "U wordt doorgestuurd naar de rapporteditor." });
      setNieuwOpen(false);
      setNieuwTitel("");
      setNieuwType("opleverrapport");
      invalideer();
      setLocation(`/gebouwen/${gebouwId}/print?rapport_id=${nieuwRapport.id}`);
    } catch {
      toast({ title: "Aanmaken mislukt", variant: "destructive" });
    }
  }

  async function handleDefinitief() {
    if (!definitiefRapport) return;
    const dagen = Number(reactietermijnDagenInput);
    if (isNaN(dagen) || dagen < 1 || dagen > 365) {
      toast({ title: "Voer een geldig aantal dagen in (1–365)", variant: "destructive" });
      return;
    }
    try {
      await definitiefMaken.mutateAsync({
        id: gebouwId,
        rapportId: definitiefRapport.id,
        data: { reactietermijn_dagen: dagen },
      });
      toast({ title: "Rapport definitief gemaakt", description: `Reactietermijn: ${dagen} dag${dagen !== 1 ? "en" : ""}` });
      setDefinitiefOpen(false);
      setDefinitiefRapport(null);
      invalideer();
    } catch {
      toast({ title: "Definitief maken mislukt", variant: "destructive" });
    }
  }

  async function handleNieuweVersie(rapport: Rapport) {
    try {
      const nieuwRapport = await nieuweVersie.mutateAsync({
        id: gebouwId,
        rapportId: rapport.id,
      });
      toast({
        title: "Nieuwe versie aangemaakt",
        description: `v${nieuwRapport.versie} staat klaar als concept. Het vorige rapport is gemarkeerd als vervangen.`,
      });
      invalideer();
      setLocation(`/gebouwen/${gebouwId}/print?rapport_id=${nieuwRapport.id}`);
    } catch {
      toast({ title: "Nieuwe versie aanmaken mislukt", variant: "destructive" });
    }
  }

  async function handleVerwijder() {
    if (verwijderRapportId === null) return;
    try {
      await verwijder.mutateAsync({ id: gebouwId, rapportId: verwijderRapportId });
      toast({ title: "Conceptrapport verwijderd" });
      setVerwijderOpen(false);
      setVerwijderRapportId(null);
      invalideer();
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  return (
    <>
      <Card className="border-primary/40 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Opleverrapporten
            </CardTitle>
            <div className="flex items-center gap-2">
              <Link href={`/gebouwen/${gebouwId}/print`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Printer className="h-4 w-4" />
                  Rapport opstellen
                </Button>
              </Link>
              {isBeheerder && (
                <Button size="sm" className="gap-1.5" onClick={() => setNieuwOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Nieuw conceptrapport
                </Button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Opgeslagen concept- en definitieve rapporten voor dit gebouw.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Rapporten laden...
            </div>
          ) : rapporten.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="font-medium">Geen rapporten gevonden</p>
              <p className="text-xs mt-1">
                Stel een rapport op via "Rapport opstellen" of maak een conceptrapport aan.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {rapporten.map((r) => {
                const os = r.opleverstatus;
                const isVervangen = os === "vervangen";
                return (
                  <div key={r.id} className={`flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0${isVervangen ? " opacity-60" : ""}`}>
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 shrink-0">
                        <StatusIcoon rapport={r} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {r.titel || RAPPORT_TYPE_LABEL[r.rapport_type] || r.rapport_type}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">v{r.versie}</span>
                          <StatusBadge rapport={r} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                          <div>{RAPPORT_TYPE_LABEL[r.rapport_type] || r.rapport_type}</div>
                          <div>
                            Aangemaakt:{" "}
                            {new Date(r.aangemaakt_op).toLocaleDateString("nl-NL", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                            {r.aangemaakt_door_naam && ` door ${r.aangemaakt_door_naam}`}
                          </div>
                          {r.status === "definitief" && r.reactietermijn_datum && (
                            <div>Reactietermijn tot: {dagToString(r.reactietermijn_datum)}</div>
                          )}
                          {r.status === "definitief" && r.bevroren_op && (
                            <div className="flex items-center gap-1 text-green-700">
                              <Lock className="h-3 w-3" />
                              Bevrozen op {dagToString(r.bevroren_op)}
                            </div>
                          )}
                          {isVervangen && r.vervangen_door_id && (
                            <div className="text-neutral-500">
                              Vervangen door versie{" "}
                              {rapporten.find(x => x.id === r.vervangen_door_id)?.versie ?? "nieuwer"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {r.status === "concept" && (
                        <Link href={`/gebouwen/${gebouwId}/print?rapport_id=${r.id}`}>
                          <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                            <PenLine className="h-3.5 w-3.5" />
                            Samenstellen
                          </Button>
                        </Link>
                      )}
                      {r.status === "definitief" && (
                        <Link href={`/gebouwen/${gebouwId}/print?rapport_id=${r.id}`}>
                          <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                            <Printer className="h-3.5 w-3.5" />
                            Bekijken
                          </Button>
                        </Link>
                      )}
                      {isBeheerder && (
                        <>
                          {r.status === "concept" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs"
                              onClick={() => {
                                setDefinitiefRapport(r);
                                setReactietermijnDagenInput("30");
                                setDefinitiefOpen(true);
                              }}
                            >
                              <Lock className="h-3.5 w-3.5" />
                              Definitief
                            </Button>
                          )}
                          {r.status === "definitief" && !isVervangen && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs"
                              onClick={() => handleNieuweVersie(r)}
                              disabled={nieuweVersie.isPending}
                            >
                              {nieuweVersie.isPending
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <RefreshCw className="h-3.5 w-3.5" />
                              }
                              Nieuwe versie
                            </Button>
                          )}
                          {r.status === "concept" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                              onClick={() => {
                                setVerwijderRapportId(r.id);
                                setVerwijderOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Nieuw conceptrapport dialog */}
      <Dialog open={nieuwOpen} onOpenChange={setNieuwOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nieuw conceptrapport aanmaken</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Rapporttype</Label>
              <Select value={nieuwType} onValueChange={setNieuwType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RAPPORT_TYPE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rapporttitel (optioneel)</Label>
              <Input
                placeholder={RAPPORT_TYPE_LABEL[nieuwType] ?? ""}
                value={nieuwTitel}
                onChange={(e) => setNieuwTitel(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNieuwOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={handleNieuw} disabled={maakNieuw.isPending}>
              {maakNieuw.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Aanmaken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Definitief maken dialog */}
      <Dialog open={definitiefOpen} onOpenChange={setDefinitiefOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rapport definitief maken</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Het rapport wordt definitief gemaakt en de documentrevisies worden bevroren.
              Stel de reactietermijn in (aantal dagen na vaststelling).
            </p>
            {definitiefRapport && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="font-medium">
                  {definitiefRapport.titel || RAPPORT_TYPE_LABEL[definitiefRapport.rapport_type] || definitiefRapport.rapport_type}
                </div>
                <div className="text-muted-foreground text-xs mt-0.5">v{definitiefRapport.versie}</div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Reactietermijn (dagen)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={reactietermijnDagenInput}
                onChange={(e) => setReactietermijnDagenInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Standaard 30 dagen. Wettelijk minimum varieert per type inspectie.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDefinitiefOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={handleDefinitief} disabled={definitiefMaken.isPending}>
              {definitiefMaken.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Definitief maken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verwijder bevestiging */}
      <AlertDialog open={verwijderOpen} onOpenChange={setVerwijderOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conceptrapport verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Dit conceptrapport wordt permanent verwijderd. Definitieve rapporten kunnen niet worden verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={handleVerwijder}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

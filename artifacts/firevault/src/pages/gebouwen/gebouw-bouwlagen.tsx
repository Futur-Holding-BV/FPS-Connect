import { useState } from "react";
import { Link } from "wouter";
import {
  useListGebouwTekeningen,
  useCreateVerdieping,
  useDeleteGebouwTekening,
  useDeleteVerdieping,
} from "@workspace/api-client-react";
import type { Verdieping, Tekening } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Layers, Map, FileText, Plus, Loader2, X, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TekeningViewer } from "./tekening-viewer";

const TEKENING_LABELS: Record<string, string> = {
  plattegrond: "Plattegrond",
  gevelaanzicht: "Gevelaanzicht",
  doorsnede: "Doorsnede",
  situatietekening: "Situatietekening",
  installatietekening: "Installatietekening",
  detailtekening: "Detailtekening",
  overig: "Overig",
};

function typeLabel(type: string): string {
  return TEKENING_LABELS[type] ?? type;
}

function TekeningRegels({
  items,
  isBeheerder,
}: {
  items: Tekening[];
  isBeheerder: boolean;
}) {
  const queryClient = useQueryClient();
  const verwijderTekening = useDeleteGebouwTekening();
  const [actief, setActief] = useState<Tekening | null>(null);

  async function verwijder(tekeningId: number) {
    await verwijderTekening.mutateAsync({ tekeningId });
    queryClient.invalidateQueries();
  }

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Nog geen tekeningen.</p>;
  }
  return (
    <>
      <ul className="space-y-1">
        {items.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm min-w-0">
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <button
              type="button"
              onClick={() => setActief(t)}
              className="hover:underline truncate text-left"
            >
              {t.naam}
            </button>
            <Badge variant="secondary" className="text-xs shrink-0">
              {typeLabel(t.type)}
            </Badge>
            {isBeheerder && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 ml-auto text-muted-foreground hover:text-destructive"
                onClick={() => verwijder(t.id)}
                disabled={verwijderTekening.isPending}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <TekeningViewer
        open={actief !== null}
        onOpenChange={(o) => {
          if (!o) setActief(null);
        }}
        url={actief?.url ?? ""}
        naam={actief?.naam ?? ""}
      />
    </>
  );
}

export default function GebouwBouwlagen({
  gebouwId,
  verdiepingen,
  isBeheerder,
}: {
  gebouwId: number;
  verdiepingen: Verdieping[];
  isBeheerder: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: tekeningen } = useListGebouwTekeningen(gebouwId);
  const maakVerdieping = useCreateVerdieping();
  const verwijderVerdieping = useDeleteVerdieping();

  const [formOpen, setFormOpen] = useState(false);
  const [naam, setNaam] = useState("");
  const [niveau, setNiveau] = useState("");
  const [teVerwijderen, setTeVerwijderen] = useState<Verdieping | null>(null);

  const lijst = tekeningen ?? [];
  const gesorteerd = [...verdiepingen].sort((a, b) => a.niveau - b.niveau);

  const tekeningenVoor = (verdiepingId: number | null) =>
    lijst.filter((t) => (t.verdieping_id ?? null) === verdiepingId);

  const algemeen = tekeningenVoor(null);

  async function bevestigVerwijderen() {
    if (!teVerwijderen) return;
    try {
      await verwijderVerdieping.mutateAsync({ id: teVerwijderen.id });
      toast({ title: "Bouwlaag verwijderd", description: `"${teVerwijderen.naam}" is verwijderd.` });
      setTeVerwijderen(null);
      queryClient.invalidateQueries();
    } catch {
      toast({
        variant: "destructive",
        title: "Verwijderen mislukt",
        description: "De bouwlaag kon niet worden verwijderd. Probeer het opnieuw.",
      });
    }
  }

  async function voegToe() {
    if (!naam.trim()) return;
    const niv = parseInt(niveau);
    await maakVerdieping.mutateAsync({
      id: gebouwId,
      data: {
        naam: naam.trim(),
        niveau: isFinite(niv) ? niv : gesorteerd.length,
      },
    });
    setNaam("");
    setNiveau("");
    setFormOpen(false);
    queryClient.invalidateQueries();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" /> Bouwlagen
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Verdeling van tekeningen en voorzieningen per bouwlaag.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {gesorteerd.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen bouwlagen. Voeg een bouwlaag toe om tekeningen te verdelen.
          </p>
        ) : (
          gesorteerd.map((v) => {
            const tk = tekeningenVoor(v.id);
            const overigeTekeningen = tk.filter((t) => t.type !== "plattegrond");
            const heeftPlattegrond =
              Boolean(v.plattegrond_url) || tk.some((t) => t.type === "plattegrond");
            const aantalTekeningen = (heeftPlattegrond ? 1 : 0) + overigeTekeningen.length;
            return (
              <div key={v.id} className="rounded-md border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{v.naam}</h3>
                      {heeftPlattegrond && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          Plattegrond aanwezig
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {v.totaal_voorzieningen || 0} spots ·{" "}
                      {aantalTekeningen}{" "}
                      {aantalTekeningen === 1 ? "tekening" : "tekeningen"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link href={`/gebouwen/${gebouwId}/plattegrond/${v.id}`}>
                      <Button variant="secondary" size="sm">
                        <Map className="h-4 w-4 mr-2" /> Plattegrond
                      </Button>
                    </Link>
                    {isBeheerder && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => setTeVerwijderen(v)}
                        title="Bouwlaag verwijderen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <TekeningRegels items={tk} isBeheerder={isBeheerder} />
              </div>
            );
          })
        )}

        {algemeen.length > 0 && (
          <div className="rounded-md border border-dashed p-4 space-y-3">
            <div>
              <h3 className="font-semibold">Algemeen (hele gebouw)</h3>
              <p className="text-sm text-muted-foreground">
                Tekeningen zonder specifieke bouwlaag.
              </p>
            </div>
            <TekeningRegels items={algemeen} isBeheerder={isBeheerder} />
          </div>
        )}

        {isBeheerder &&
          (formOpen ? (
            <div className="rounded-md border p-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Naam</Label>
                  <Input
                    value={naam}
                    onChange={(e) => setNaam(e.target.value)}
                    placeholder="bijv. Begane grond"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Niveau</Label>
                  <Input
                    inputMode="numeric"
                    value={niveau}
                    onChange={(e) => setNiveau(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={voegToe}
                  disabled={!naam.trim() || maakVerdieping.isPending}
                >
                  {maakVerdieping.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : null}
                  Opslaan
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFormOpen(false);
                    setNaam("");
                    setNiveau("");
                  }}
                >
                  Annuleren
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Bouwlaag toevoegen
            </Button>
          ))}
      </CardContent>

      <AlertDialog open={teVerwijderen !== null} onOpenChange={(o) => { if (!o) setTeVerwijderen(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bouwlaag verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {teVerwijderen && (
                <>
                  Weet u zeker dat u de bouwlaag &quot;{teVerwijderen.naam}&quot; wilt verwijderen?
                  {(teVerwijderen.totaal_voorzieningen || 0) > 0 && (
                    <> De {teVerwijderen.totaal_voorzieningen} voorziening(en) op deze bouwlaag blijven behouden, maar worden losgekoppeld van de bouwlaag.</>
                  )}
                  {" "}Eventuele scheidingslijnen op de plattegrond worden definitief verwijderd. Deze actie kan niet ongedaan worden gemaakt.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={verwijderVerdieping.isPending}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); bevestigVerwijderen(); }}
              disabled={verwijderVerdieping.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {verwijderVerdieping.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

import { useState } from "react";
import { Link } from "wouter";
import {
  useListDocumentsoorten,
  useCreateDocumentsoort,
  useUpdateDocumentsoort,
  useDeleteDocumentsoort,
  getListDocumentsoortenQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import type { Documentsoort } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Alert, AlertDescription,
} from "@/components/ui/alert";
import { ArrowLeft, FileText, Plus, Pencil, Trash2, ShieldAlert } from "lucide-react";
import { PaginaHulp } from "@/components/pagina-hulp";

const CONTEXT = "voertuig" as const;
const QUERY_KEY = getListDocumentsoortenQueryKey({ context: CONTEXT });

// ══════════════════════════════════════════════════════════
// Aanmaken / bewerken-dialoog
// ══════════════════════════════════════════════════════════

function SoortDialoog({
  open, onSluit, bestaand,
}: {
  open: boolean;
  onSluit: () => void;
  bestaand: Documentsoort | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const maakAan = useCreateDocumentsoort();
  const werkBij = useUpdateDocumentsoort();

  const [naam,             setNaam]             = useState(bestaand?.naam ?? "");
  const [heeftVervaldatum, setHeeftVervaldatum] = useState(bestaand?.heeft_vervaldatum ?? false);
  const [waarschuwing,     setWaarschuwing]     = useState(String(bestaand?.waarschuwing_dagen ?? 30));

  // Reset velden wanneer een andere soort geopend wordt.
  const [initKey, setInitKey] = useState<number | null>(null);
  const huidigeKey = bestaand?.id ?? -1;
  if (open && initKey !== huidigeKey) {
    setInitKey(huidigeKey);
    setNaam(bestaand?.naam ?? "");
    setHeeftVervaldatum(bestaand?.heeft_vervaldatum ?? false);
    setWaarschuwing(String(bestaand?.waarschuwing_dagen ?? 30));
  }

  const bezig = maakAan.isPending || werkBij.isPending;

  function foutmelding(err: unknown) {
    if (err instanceof ApiError && err.status === 409) {
      toast({
        title: "Naam bestaat al",
        description: "Er bestaat al een documentsoort met deze naam.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Opslaan mislukt",
      description: err instanceof Error ? err.message : "Onbekende fout.",
      variant: "destructive",
    });
  }

  function opslaan() {
    if (!naam.trim()) return;
    const data = {
      context: CONTEXT,
      naam: naam.trim(),
      heeft_vervaldatum: heeftVervaldatum,
      waarschuwing_dagen: Math.max(0, parseInt(waarschuwing, 10) || 0),
    };
    const opties = {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: QUERY_KEY });
        toast({ title: bestaand ? "Documentsoort bijgewerkt" : "Documentsoort aangemaakt" });
        onSluit();
      },
      onError: foutmelding,
    };
    if (bestaand) {
      werkBij.mutate({ id: bestaand.id, data }, opties);
    } else {
      maakAan.mutate({ data }, opties);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onSluit(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{bestaand ? "Documentsoort bewerken" : "Documentsoort toevoegen"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Naam</Label>
            <Input
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
              placeholder="Bijv. Verzekeringsbewijs"
              autoFocus
            />
          </div>
          <div className="flex items-center justify-between rounded border p-3">
            <div>
              <Label className="text-sm">Heeft vervaldatum</Label>
              <p className="text-xs text-muted-foreground">
                Documenten van deze soort krijgen een verplichte geldig-tot datum.
              </p>
            </div>
            <Switch checked={heeftVervaldatum} onCheckedChange={setHeeftVervaldatum} />
          </div>
          {heeftVervaldatum && (
            <div className="space-y-1">
              <Label>Waarschuwingstermijn (dagen)</Label>
              <Input
                type="number"
                min={0}
                value={waarschuwing}
                onChange={(e) => setWaarschuwing(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Aantal dagen vóór verval waarop een waarschuwing getoond wordt.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onSluit}>Annuleren</Button>
          <Button onClick={opslaan} disabled={!naam.trim() || bezig}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════
// Pagina
// ══════════════════════════════════════════════════════════

export default function WagenparkDocumentsoortenPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const magAanmaken = heeftNiveau("wagenpark", 3);

  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: soorten = [], isLoading } = useListDocumentsoorten({ context: CONTEXT });

  const [dialoogOpen,   setDialoogOpen]   = useState(false);
  const [teBewerken,    setTeBewerken]    = useState<Documentsoort | null>(null);
  const [teVerwijderen, setTeVerwijderen] = useState<Documentsoort | null>(null);

  const verwijder = useDeleteDocumentsoort();

  function verwijderBevestig() {
    if (!teVerwijderen) return;
    verwijder.mutate(
      { id: teVerwijderen.id },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: QUERY_KEY });
          toast({ title: "Documentsoort verwijderd" });
          setTeVerwijderen(null);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) {
            toast({
              title: "Soort in gebruik",
              description: "Deze documentsoort is nog gekoppeld aan documenten en kan niet worden verwijderd.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Verwijderen mislukt",
              description: err instanceof Error ? err.message : "Onbekende fout.",
              variant: "destructive",
            });
          }
          setTeVerwijderen(null);
        },
      },
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-screen-lg">
      <PaginaHulp pagina="wagenpark-documentsoorten" />
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/wagenpark">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Terug naar wagenpark
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <FileText className="h-7 w-7 text-primary" />
          <div>
            <h1 data-paginatitel className="text-2xl font-bold">Documentsoorten</h1>
            <p className="text-sm text-muted-foreground">
              Beheer de soorten voertuigdocumenten (bijv. verzekering, leasecontract).
            </p>
          </div>
        </div>
        {magAanmaken && (
          <Button size="sm" onClick={() => { setTeBewerken(null); setDialoogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Documentsoort toevoegen
          </Button>
        )}
      </div>

      {!magAanmaken && (
        <Alert className="border-blue-200 bg-blue-50">
          <ShieldAlert className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800 text-sm">
            U kunt de documentsoorten bekijken, maar niet aanpassen.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Vervaldatum</TableHead>
                <TableHead className="text-right">Waarschuwingstermijn</TableHead>
                <TableHead className="text-right">In gebruik</TableHead>
                {magAanmaken && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={magAanmaken ? 5 : 4} className="text-center py-8 text-muted-foreground">
                    Laden...
                  </TableCell>
                </TableRow>
              ) : soorten.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={magAanmaken ? 5 : 4} className="text-center py-10 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <div>Nog geen documentsoorten</div>
                  </TableCell>
                </TableRow>
              ) : (
                soorten.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.naam}</TableCell>
                    <TableCell>
                      {s.heeft_vervaldatum ? (
                        <Badge className="bg-green-100 text-green-800">Ja</Badge>
                      ) : (
                        <Badge variant="secondary">Nee</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.heeft_vervaldatum ? `${s.waarschuwing_dagen} dagen` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{s.in_gebruik}</TableCell>
                    {magAanmaken && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setTeBewerken(s); setDialoogOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setTeVerwijderen(s)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {magAanmaken && (
        <SoortDialoog
          open={dialoogOpen}
          onSluit={() => setDialoogOpen(false)}
          bestaand={teBewerken}
        />
      )}

      <AlertDialog open={!!teVerwijderen} onOpenChange={(o) => { if (!o) setTeVerwijderen(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Documentsoort verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet u zeker dat u &quot;{teVerwijderen?.naam}&quot; wilt verwijderen? Dit kan niet
              ongedaan worden gemaakt. Een soort die nog in gebruik is, kan niet worden verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={verwijderBevestig}
              disabled={verwijder.isPending}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

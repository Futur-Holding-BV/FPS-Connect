import { useState } from "react";
import {
  useListMagazijnLocaties,
  useCreateMagazijnLocatie,
  useUpdateMagazijnLocatie,
  useDeleteMagazijnLocatie,
  type MagazijnLocatie,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, MapPin, ChevronRight } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  rek: "Rek / stelling", bus: "Bus / voertuig", vak: "Vak / lade", ruimte: "Ruimte", extern: "Externe locatie",
};

interface LocatieFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  locaties: MagazijnLocatie[];
  initVals?: { naam: string; type: string; parent_id?: number | null; omschrijving: string };
  onSubmit: (vals: { naam: string; type: string; parent_id: number | null; omschrijving: string }) => void;
  bezig: boolean;
  titel: string;
}

function LocatieForm({ open, onOpenChange, locaties, initVals, onSubmit, bezig, titel }: LocatieFormProps) {
  const [naam, setNaam] = useState(initVals?.naam ?? "");
  const [type, setType] = useState(initVals?.type ?? "rek");
  const [parentId, setParentId] = useState<number | null>(initVals?.parent_id ?? null);
  const [omschrijving, setOmschrijving] = useState(initVals?.omschrijving ?? "");

  const reset = () => { setNaam(""); setType("rek"); setParentId(null); setOmschrijving(""); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!naam.trim()) return;
    onSubmit({ naam: naam.trim(), type, parent_id: parentId, omschrijving });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{titel}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Naam <span className="text-destructive">*</span></Label>
            <Input value={naam} onChange={e => setNaam(e.target.value)} placeholder="Bijv. Stelling A" required />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Bovenliggende locatie</Label>
            <Select value={String(parentId ?? "__geen__")} onValueChange={v => setParentId(v === "__geen__" ? null : Number(v))}>
              <SelectTrigger><SelectValue placeholder="Geen (hoofdlocatie)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__geen__">Geen (hoofdlocatie)</SelectItem>
                {locaties.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.naam}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Omschrijving</Label>
            <Input value={omschrijving} onChange={e => setOmschrijving(e.target.value)} placeholder="Optionele toelichting" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
            <Button type="submit" disabled={bezig || !naam.trim()}>Opslaan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function MagazijnLocatiesPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("magazijn", 3);
  const kanVerwijderen = heeftNiveau("magazijn", 4);

  const { data: locaties = [], isLoading, refetch } = useListMagazijnLocaties();
  const { mutate: create, isPending: cBezig } = useCreateMagazijnLocatie({ mutation: { onSuccess: () => void refetch() } });
  const { mutate: update, isPending: uBezig } = useUpdateMagazijnLocatie({ mutation: { onSuccess: () => void refetch() } });
  const { mutate: remove } = useDeleteMagazijnLocatie({ mutation: { onSuccess: () => void refetch() } });

  const [showNieuw, setShowNieuw] = useState(false);
  const [editItem, setEditItem] = useState<typeof locaties[0] | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Hiërarchisch sorteren
  const roots = locaties.filter(l => !l.parent_id);
  const kinderen = (parentId: number) => locaties.filter(l => l.parent_id === parentId);

  function LocatieRij({ locatie, diepte = 0 }: { locatie: typeof locaties[0]; diepte?: number }) {
    const kids = kinderen(locatie.id);
    return (
      <>
        <tr className="border-b hover:bg-muted/30 transition-colors">
          <td className="py-2.5 px-4">
            <div className="flex items-center gap-2" style={{ paddingLeft: `${diepte * 20}px` }}>
              {diepte > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm">{locatie.naam}</span>
            </div>
          </td>
          <td className="py-2.5 px-4 text-sm text-muted-foreground">{TYPE_LABELS[locatie.type] ?? locatie.type}</td>
          <td className="py-2.5 px-4 text-sm text-muted-foreground">{locatie.omschrijving ?? "—"}</td>
          <td className="py-2.5 px-4">
            <Badge variant={locatie.actief ? "default" : "secondary"} className="text-xs">
              {locatie.actief ? "Actief" : "Inactief"}
            </Badge>
          </td>
          <td className="py-2.5 px-4">
            <div className="flex items-center gap-1 justify-end">
              {kanSchrijven && (
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditItem(locatie)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              {kanVerwijderen && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(locatie.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </td>
        </tr>
        {kids.map(k => <LocatieRij key={k.id} locatie={k} diepte={diepte + 1} />)}
      </>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Locaties</h1>
        {kanSchrijven && (
          <Button size="sm" onClick={() => setShowNieuw(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nieuwe locatie
          </Button>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden bg-background">
        <table className="w-full">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left py-2.5 px-4">Naam</th>
              <th className="text-left py-2.5 px-4">Type</th>
              <th className="text-left py-2.5 px-4">Omschrijving</th>
              <th className="text-left py-2.5 px-4">Status</th>
              <th className="py-2.5 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="py-3 px-4" colSpan={5}><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))
            ) : locaties.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted-foreground text-sm">
                  Nog geen locaties. Maak er een aan via de knop rechtsbovenin.
                </td>
              </tr>
            ) : (
              roots.map(l => <LocatieRij key={l.id} locatie={l} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Nieuw */}
      <LocatieForm
        open={showNieuw}
        onOpenChange={setShowNieuw}
        locaties={locaties}
        bezig={cBezig}
        titel="Nieuwe locatie"
        onSubmit={(vals) => create({ data: vals }, { onSuccess: () => setShowNieuw(false) })}
      />

      {/* Bewerken */}
      {editItem && (
        <LocatieForm
          open={!!editItem}
          onOpenChange={(v) => { if (!v) setEditItem(null); }}
          locaties={locaties.filter(l => l.id !== editItem.id)}
          initVals={{ naam: editItem.naam, type: editItem.type, parent_id: editItem.parent_id, omschrijving: editItem.omschrijving ?? "" }}
          bezig={uBezig}
          titel="Locatie bewerken"
          onSubmit={(vals) => update({ id: editItem.id, data: vals }, { onSuccess: () => setEditItem(null) })}
        />
      )}

      {/* Verwijderen */}
      <AlertDialog open={deleteId !== null} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Locatie verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je deze locatie wilt verwijderen? Artikelen die aan deze locatie gekoppeld zijn worden ontkoppeld.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) remove({ id: deleteId }); setDeleteId(null); }}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

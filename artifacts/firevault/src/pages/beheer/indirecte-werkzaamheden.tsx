import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListIndirecteWerkzaamheden,
  useCreateIndirecteWerkzaamheid,
  useUpdateIndirecteWerkzaamheid,
  useDeleteIndirecteWerkzaamheid,
  ApiError,
} from "@workspace/api-client-react";
import type { IndirecteWerkzaamheid } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, ShieldCheck, Activity } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

export default function IndirecteWerkzaamhedenPagina() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bewerkItem, setBewerkItem] = useState<IndirecteWerkzaamheid | null>(null);

  const { data: werkzaamheden = [], isLoading } = useListIndirecteWerkzaamheden();

  const createItem = useCreateIndirecteWerkzaamheid();
  const updateItem = useUpdateIndirecteWerkzaamheid();
  const deleteItem = useDeleteIndirecteWerkzaamheid();

  const [form, setForm] = useState({
    naam: "",
    actief: true,
  });

  function openDialog(item?: IndirecteWerkzaamheid) {
    if (item) {
      setBewerkItem(item);
      setForm({
        naam: item.naam,
        actief: item.actief,
      });
    } else {
      setBewerkItem(null);
      setForm({
        naam: "",
        actief: true,
      });
    }
    setDialogOpen(true);
  }

  async function bewaar() {
    if (!form.naam.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    try {
      if (bewerkItem) {
        await updateItem.mutateAsync({ id: bewerkItem.id, data: form });
      } else {
        await createItem.mutateAsync({ data: form });
      }
      toast({ title: "Indirecte werkzaamheid opgeslagen" });
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["listIndirecteWerkzaamheden"] });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function verwijder(item: IndirecteWerkzaamheid) {
    if (!confirm(`Weet je zeker dat je "${item.naam}" wilt verwijderen?`)) return;
    try {
      await deleteItem.mutateAsync({ id: item.id });
      qc.invalidateQueries({ queryKey: ["listIndirecteWerkzaamheden"] });
      toast({ title: "Indirecte werkzaamheid verwijderd" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast({
          title: "In gebruik",
          description: "Deze werkzaamheid is al gebruikt in urenregistraties en wordt inactief gezet.",
        });
        qc.invalidateQueries({ queryKey: ["listIndirecteWerkzaamheden"] });
      } else {
        toast({ title: "Verwijderen mislukt", variant: "destructive" });
      }
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 data-paginatitel className="text-2xl font-bold">Indirecte werkzaamheden</h1>
          <p className="text-muted-foreground text-sm mt-1">Beheer de lijst met indirecte urencodes voor opdrachten.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Werkzaamheden
            </CardTitle>
            <Button size="sm" onClick={() => openDialog()}>
              <Plus className="h-4 w-4 mr-1.5" />
              Toevoegen
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
             <div className="p-8 text-center text-muted-foreground text-sm">Laden...</div>
          ) : werkzaamheden.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center gap-2 text-muted-foreground text-sm">
              <ShieldCheck className="h-8 w-8 opacity-20" />
              <span>Geen indirecte werkzaamheden gevonden. Klik op Toevoegen om te beginnen.</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Naam</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {werkzaamheden.map((item) => (
                  <TableRow key={item.id} className={item.actief ? "" : "opacity-60 bg-muted/30"}>
                    <TableCell className="font-medium">{item.naam}</TableCell>
                    <TableCell>
                      {item.actief ? (
                        <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">Actief</Badge>
                      ) : (
                        <Badge variant="secondary">Inactief</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openDialog(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600" onClick={() => verwijder(item)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bewerkItem ? "Werkzaamheid bewerken" : "Werkzaamheid toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Naam</Label>
              <Input
                placeholder="Bijv. Reistijd of Overleg"
                value={form.naam}
                onChange={(e) => setForm({ ...form, naam: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Checkbox
                id="actief"
                checked={form.actief}
                onCheckedChange={(v) => setForm({ ...form, actief: Boolean(v) })}
              />
              <Label htmlFor="actief" className="font-normal cursor-pointer">
                Deze werkzaamheid is actief en kan gekozen worden
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button onClick={bewaar} disabled={createItem.isPending || updateItem.isPending}>
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

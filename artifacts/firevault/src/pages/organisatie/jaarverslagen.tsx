import { useState } from "react";
import {
  useListOrgJaarverslagen,
  useCreateOrgJaarverslag,
  useUpdateOrgJaarverslag,
  useDeleteOrgJaarverslag,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, BookOpen, Plus, Pencil, Trash2, CheckCircle2, Clock } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  jaarrekening: "Jaarrekening",
  jaarverslag: "Jaarverslag",
  accountantsverklaring: "Accountantsverklaring",
  tussentijds: "Tussentijdse rapportage",
  kwartaalrapportage: "Kwartaalrapportage",
  overig: "Overig",
};

const leegForm = {
  boekjaar: String(new Date().getFullYear() - 1),
  type: "jaarrekening",
  omschrijving: "",
  accountant: "",
  definitief: false,
  vastgesteld_op: "",
};

type Jaarverslag = {
  id: number;
  boekjaar: number;
  type: string;
  omschrijving?: string | null;
  accountant?: string | null;
  definitief: boolean;
  vastgesteld_op?: string | null;
  document_id?: number | null;
};

export default function JaarverslagenPagina() {
  const { data: verslagen = [], isLoading } = useListOrgJaarverslagen();
  const createVerslag = useCreateOrgJaarverslag();
  const updateVerslag = useUpdateOrgJaarverslag();
  const deleteVerslag = useDeleteOrgJaarverslag();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...leegForm });
  const [verwijderBevestiging, setVerwijderBevestiging] = useState<number | null>(null);

  const setFormVeld = (k: string, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  const openNieuw = () => {
    setBewerkId(null);
    setForm({ ...leegForm });
    setDialoogOpen(true);
  };

  const openBewerken = (v: Jaarverslag) => {
    setBewerkId(v.id);
    setForm({
      boekjaar: String(v.boekjaar),
      type: v.type ?? "jaarrekening",
      omschrijving: v.omschrijving ?? "",
      accountant: v.accountant ?? "",
      definitief: v.definitief,
      vastgesteld_op: v.vastgesteld_op ?? "",
    });
    setDialoogOpen(true);
  };

  const slaOp = async () => {
    if (!form.boekjaar || !form.type) {
      toast({ title: "Boekjaar en type zijn verplicht", variant: "destructive" });
      return;
    }
    const payload = {
      boekjaar: parseInt(form.boekjaar, 10),
      type: form.type,
      omschrijving: form.omschrijving || undefined,
      accountant: form.accountant || undefined,
      definitief: form.definitief,
      vastgesteld_op: form.vastgesteld_op || undefined,
    };
    try {
      if (bewerkId) {
        await updateVerslag.mutateAsync({ id: bewerkId, data: payload });
        toast({ title: "Jaarverslag bijgewerkt" });
      } else {
        await createVerslag.mutateAsync({ data: payload });
        toast({ title: "Jaarverslag geregistreerd" });
      }
      queryClient.invalidateQueries({ queryKey: ["listOrgJaarverslagen"] });
      setDialoogOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  };

  const verwijder = async (id: number) => {
    try {
      await deleteVerslag.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ["listOrgJaarverslagen"] });
      setVerwijderBevestiging(null);
      toast({ title: "Verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  };

  // Groepeer per boekjaar
  const perBoekjaar = verslagen.reduce<Record<number, Jaarverslag[]>>((acc, v) => {
    if (!acc[v.boekjaar]) acc[v.boekjaar] = [];
    acc[v.boekjaar].push(v);
    return acc;
  }, {});
  const boekjaren = Object.keys(perBoekjaar).map(Number).sort((a, b) => b - a);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 data-paginatitel className="text-2xl font-bold tracking-tight">Jaarverslagen &amp; Rekeningen</h1>
          <p className="text-muted-foreground mt-1">Jaarrekeningen, jaarverslagen en financiële rapportages per boekjaar.</p>
        </div>
        <Button onClick={openNieuw}>
          <Plus className="h-4 w-4 mr-2" />
          Registreren
        </Button>
      </div>

      {verslagen.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="p-4 rounded-full bg-muted">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Nog geen jaarverslagen geregistreerd</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Voeg jaarrekeningen, jaarverslagen en accountantsverklaringen toe per boekjaar.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={openNieuw}>
              <Plus className="h-4 w-4 mr-1" />
              Eerste verslag registreren
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {boekjaren.map((jaar) => (
            <Card key={jaar}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Boekjaar {jaar}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {perBoekjaar[jaar].map((v) => (
                    <div key={v.id} className="py-3 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{TYPE_LABELS[v.type] ?? v.type}</span>
                          {v.definitief ? (
                            <Badge className="bg-green-100 text-green-700" variant="outline">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Definitief
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700" variant="outline">
                              <Clock className="h-3 w-3 mr-1" />
                              Concept
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                          {v.accountant && (
                            <span className="text-xs text-muted-foreground">Accountant: {v.accountant}</span>
                          )}
                          {v.vastgesteld_op && (
                            <span className="text-xs text-muted-foreground">Vastgesteld: {v.vastgesteld_op}</span>
                          )}
                          {v.omschrijving && (
                            <span className="text-xs text-muted-foreground">{v.omschrijving}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openBewerken(v)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setVerwijderBevestiging(v.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialoogOpen} onOpenChange={setDialoogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{bewerkId ? "Bewerken" : "Jaarverslag registreren"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Boekjaar</Label>
                <Input
                  type="number"
                  value={form.boekjaar}
                  onChange={(e) => setFormVeld("boekjaar", e.target.value)}
                  min={2000}
                  max={2100}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setFormVeld("type", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Accountant / Samensteller</Label>
                <Input value={form.accountant} onChange={(e) => setFormVeld("accountant", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Vastgesteld op</Label>
                <Input type="date" value={form.vastgesteld_op} onChange={(e) => setFormVeld("vastgesteld_op", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.definitief ? "definitief" : "concept"} onValueChange={(v) => setFormVeld("definitief", v === "definitief")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concept">Concept</SelectItem>
                    <SelectItem value="definitief">Definitief</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Opmerkingen</Label>
                <Textarea value={form.omschrijving} onChange={(e) => setFormVeld("omschrijving", e.target.value)} rows={2} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialoogOpen(false)}>Annuleren</Button>
            <Button onClick={slaOp} disabled={createVerslag.isPending || updateVerslag.isPending}>
              {(createVerslag.isPending || updateVerslag.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {bewerkId ? "Opslaan" : "Registreren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={verwijderBevestiging !== null} onOpenChange={() => setVerwijderBevestiging(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Jaarverslag verwijderen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Weet u zeker dat u dit jaarverslag wilt verwijderen?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerwijderBevestiging(null)}>Annuleren</Button>
            <Button
              variant="destructive"
              onClick={() => verwijderBevestiging && verwijder(verwijderBevestiging)}
              disabled={deleteVerslag.isPending}
            >
              Verwijderen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDossiers,
  useCreateDossier,
  useDossierDefinitiefMaken,
  useDossierArchiveren,
  useListGebouwen,
  getListDossiersQueryKey,
} from "@workspace/api-client-react";
import type { DossierInput } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { FolderOpen, Plus, Search, Lock, Archive } from "lucide-react";

const TYPES = ["algemeen", "project", "gebouw", "kwaliteit", "incident"] as const;

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-amber-100 text-amber-800 border-amber-200",
  definitief: "bg-emerald-100 text-emerald-800 border-emerald-200",
  gearchiveerd: "bg-muted text-muted-foreground border-border",
};

const LEEG: DossierInput = {
  naam: "",
  type: "algemeen",
  omschrijving: "",
};

export default function DossiersPagina() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: dossiers, isLoading } = useListDossiers();
  const { data: gebouwen } = useListGebouwen();
  const maakDossier = useCreateDossier();
  const definitiefMaken = useDossierDefinitiefMaken();
  const archiveren = useDossierArchiveren();

  const [zoek, setZoek] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DossierInput>(LEEG);

  const gefilterd = (dossiers ?? []).filter((d) => {
    const t = zoek.trim().toLowerCase();
    if (!t) return true;
    return d.naam.toLowerCase().includes(t) || (d.gebouw_naam ?? "").toLowerCase().includes(t);
  });

  async function herlaad() {
    await queryClient.invalidateQueries({ queryKey: getListDossiersQueryKey() });
  }

  async function opslaan() {
    if (!form.naam.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    try {
      const schoon: DossierInput = {
        naam: form.naam.trim(),
        type: form.type,
        omschrijving: form.omschrijving?.trim() || undefined,
        gebouw_id: form.gebouw_id ?? undefined,
      };
      await maakDossier.mutateAsync({ data: schoon });
      await herlaad();
      toast({ title: "Dossier aangemaakt" });
      setForm(LEEG);
      setOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function maakDefinitief(id: number) {
    try {
      await definitiefMaken.mutateAsync({ id });
      await herlaad();
      toast({ title: "Dossier is definitief gemaakt" });
    } catch {
      toast({ title: "Actie mislukt", variant: "destructive" });
    }
  }

  async function archiveer(id: number) {
    try {
      await archiveren.mutateAsync({ id });
      await herlaad();
      toast({ title: "Dossier gearchiveerd" });
    } catch {
      toast({ title: "Actie mislukt", variant: "destructive" });
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dossiers</h1>
          <p className="text-sm text-muted-foreground">
            Centrale dossiers met statussturing en documentbevriezing.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nieuw dossier
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Zoek op naam of gebouw…" value={zoek} onChange={(e) => setZoek(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : gefilterd.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Geen dossiers gevonden.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {gefilterd.map((d) => (
            <Card key={d.id} className="h-full">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-primary/10 text-primary rounded p-2 flex-shrink-0">
                      <FolderOpen className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{d.naam}</div>
                      <div className="text-xs text-muted-foreground">{d.type}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className={STATUS_KLEUR[d.status] ?? ""}>{d.status}</Badge>
                </div>
                {d.gebouw_naam && <div className="text-xs text-muted-foreground">Gebouw: {d.gebouw_naam}</div>}
                {d.omschrijving && <p className="text-xs text-muted-foreground line-clamp-2">{d.omschrijving}</p>}
                {d.status === "concept" && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => maakDefinitief(d.id)} disabled={definitiefMaken.isPending}>
                      <Lock className="h-3.5 w-3.5" /> Definitief
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => archiveer(d.id)} disabled={archiveren.isPending}>
                      <Archive className="h-3.5 w-3.5" /> Archiveren
                    </Button>
                  </div>
                )}
                {d.status === "definitief" && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="ghost" onClick={() => archiveer(d.id)} disabled={archiveren.isPending}>
                      <Archive className="h-3.5 w-3.5" /> Archiveren
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nieuw dossier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <Input value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Gebouw (optioneel)</Label>
              <Select
                value={form.gebouw_id ? String(form.gebouw_id) : undefined}
                onValueChange={(v) => setForm({ ...form, gebouw_id: Number(v) })}
              >
                <SelectTrigger><SelectValue placeholder="Geen koppeling" /></SelectTrigger>
                <SelectContent>
                  {(gebouwen ?? []).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Textarea value={form.omschrijving ?? ""} onChange={(e) => setForm({ ...form, omschrijving: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button onClick={opslaan} disabled={maakDossier.isPending}>
              {maakDossier.isPending ? "Bezig…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

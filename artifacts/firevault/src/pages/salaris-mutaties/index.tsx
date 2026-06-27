import { useState } from "react";
import { useGetSalarisMutaties, usePostSalarisMutaties, usePatchSalarisMutatiesId } from "@workspace/api-client-react";
import { useListWerkgevers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Check, X, ClipboardList } from "lucide-react";

const HUIDIG_JAAR = new Date().getFullYear();
const HUIDIG_MAAND = new Date().getMonth() + 1;

const MAAND_NAMEN = [
  "januari","februari","maart","april","mei","juni",
  "juli","augustus","september","oktober","november","december",
];

const MUTATIE_TYPEN = [
  "Loonsverhoging", "Verloning nieuwe medewerker", "Uitdiensttreding",
  "Functiewijziging", "Uren aanpassing", "Bonus/gratificatie",
  "Vaste vergoeding", "Kilometervergoeding", "Overuren", "Ziektemelding",
  "Re-integratie", "Overig",
];

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  concept: { label: "Concept", variant: "secondary" },
  geaccordeerd: { label: "Geaccordeerd", variant: "default" },
  afgekeurd: { label: "Afgekeurd", variant: "destructive" },
  verwerkt: { label: "Verwerkt", variant: "outline" },
};

export default function SalarisMutatiesPage() {
  const [jaar, setJaar] = useState(HUIDIG_JAAR);
  const [maand, setMaand] = useState(HUIDIG_MAAND);
  const [werkmaatschappijFilter, setWerkmaatschappijFilter] = useState<string>("alle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const params: Record<string, unknown> = { jaar, maand };
  if (werkmaatschappijFilter !== "alle") params.werkmaatschappij = werkmaatschappijFilter;

  const { data: mutaties = [], refetch } = useGetSalarisMutaties(params);
  const { data: werkgevers = [] } = useListWerkgevers();
  const postMutatie = usePostSalarisMutaties();
  const patchMutatie = usePatchSalarisMutatiesId();

  const [form, setForm] = useState({
    medewerker_naam_vrij: "",
    werkmaatschappij: "",
    periode_jaar: HUIDIG_JAAR,
    periode_maand: HUIDIG_MAAND,
    type: "",
    omschrijving: "",
    ingangsdatum: "",
    notities: "",
  });

  const detailMutatie = detailId ? mutaties.find((m) => m.id === detailId) : null;

  function openNieuw() {
    setForm({
      medewerker_naam_vrij: "",
      werkmaatschappij: werkgevers[0]?.naam ?? "",
      periode_jaar: jaar,
      periode_maand: maand,
      type: "",
      omschrijving: "",
      ingangsdatum: "",
      notities: "",
    });
    setDialogOpen(true);
  }

  async function opslaanMutatie() {
    await postMutatie.mutateAsync({
      data: {
        werkmaatschappij: form.werkmaatschappij,
        periode_jaar: form.periode_jaar,
        periode_maand: form.periode_maand,
        type: form.type,
        omschrijving: form.omschrijving || undefined,
        ingangsdatum: form.ingangsdatum || undefined,
        bron: "handmatig",
        notities: form.notities || undefined,
      },
    });
    setDialogOpen(false);
    refetch();
  }

  async function accorderen(id: number, akkoord: boolean) {
    await patchMutatie.mutateAsync({ id, data: { akkoord } });
    refetch();
  }

  const jaren = [HUIDIG_JAAR, HUIDIG_JAAR - 1, HUIDIG_JAAR - 2];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="text-primary" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Salarismutaties</h1>
            <p className="text-sm text-muted-foreground">Mutaties per loonperiode verzamelen en accorderen</p>
          </div>
        </div>
        <Button onClick={openNieuw}>
          <Plus size={16} className="mr-2" />
          Mutatie toevoegen
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={String(jaar)} onValueChange={(v) => setJaar(Number(v))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {jaren.map((j) => (
              <SelectItem key={j} value={String(j)}>{j}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(maand)} onValueChange={(v) => setMaand(Number(v))}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MAAND_NAMEN.map((naam, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{naam}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={werkmaatschappijFilter} onValueChange={setWerkmaatschappijFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Alle werkmaatschappijen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle werkmaatschappijen</SelectItem>
            {werkgevers.map((wg) => (
              <SelectItem key={wg.id} value={wg.naam}>{wg.naam}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {mutaties.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Geen mutaties voor {MAAND_NAMEN[maand - 1]} {jaar}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {mutaties.map((m) => {
            const statusInfo = STATUS_LABELS[m.status] ?? { label: m.status, variant: "secondary" as const };
            return (
              <Card key={m.id} className="cursor-pointer hover:shadow-sm transition-shadow"
                onClick={() => setDetailId(m.id === detailId ? null : m.id)}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {m.medewerker_naam ?? "Onbekende medewerker"}
                        </span>
                        <Badge variant="outline" className="text-xs">{m.werkmaatschappij}</Badge>
                        <Badge variant={statusInfo.variant} className="text-xs">{statusInfo.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{m.type}</p>
                      {m.omschrijving && (
                        <p className="text-xs text-muted-foreground mt-0.5">{m.omschrijving}</p>
                      )}
                      {m.ingangsdatum && (
                        <p className="text-xs text-muted-foreground">Ingangsdatum: {m.ingangsdatum}</p>
                      )}
                    </div>
                    {m.status === "concept" && (
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="h-7 text-green-700 border-green-300 hover:bg-green-50"
                          onClick={(e) => { e.stopPropagation(); accorderen(m.id, true); }}>
                          <Check size={14} className="mr-1" /> Akkoord
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-red-700 border-red-300 hover:bg-red-50"
                          onClick={(e) => { e.stopPropagation(); accorderen(m.id, false); }}>
                          <X size={14} className="mr-1" /> Afkeuren
                        </Button>
                      </div>
                    )}
                  </div>

                  {detailId === m.id && m.notities && (
                    <div className="mt-3 p-3 bg-muted/50 rounded text-sm">
                      <span className="font-medium">Notitie: </span>{m.notities}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Salarismutatie toevoegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Jaar</Label>
                <Select value={String(form.periode_jaar)} onValueChange={(v) => setForm((f) => ({ ...f, periode_jaar: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {jaren.map((j) => <SelectItem key={j} value={String(j)}>{j}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Maand</Label>
                <Select value={String(form.periode_maand)} onValueChange={(v) => setForm((f) => ({ ...f, periode_maand: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MAAND_NAMEN.map((nm, i) => <SelectItem key={i + 1} value={String(i + 1)}>{nm}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Werkmaatschappij</Label>
              <Select value={form.werkmaatschappij} onValueChange={(v) => setForm((f) => ({ ...f, werkmaatschappij: v }))}>
                <SelectTrigger><SelectValue placeholder="Kies werkmaatschappij" /></SelectTrigger>
                <SelectContent>
                  {werkgevers.map((wg) => <SelectItem key={wg.id} value={wg.naam}>{wg.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Type mutatie</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue placeholder="Kies type" /></SelectTrigger>
                <SelectContent>
                  {MUTATIE_TYPEN.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Input placeholder="Toelichting op de mutatie"
                value={form.omschrijving}
                onChange={(e) => setForm((f) => ({ ...f, omschrijving: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>Ingangsdatum</Label>
              <Input type="date" value={form.ingangsdatum}
                onChange={(e) => setForm((f) => ({ ...f, ingangsdatum: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>Notities</Label>
              <Textarea rows={2} placeholder="Interne opmerkingen"
                value={form.notities}
                onChange={(e) => setForm((f) => ({ ...f, notities: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button onClick={opslaanMutatie}
              disabled={!form.werkmaatschappij || !form.type || postMutatie.isPending}>
              {postMutatie.isPending ? "Opslaan..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

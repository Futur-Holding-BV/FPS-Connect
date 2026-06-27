import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVeiligheidMeldingen,
  usePostVeiligheidMeldingen,
  usePatchVeiligheidMeldingenId,
  useDeleteVeiligheidMeldingenId,
  useGetVeiligheidMeldingenIdActies,
  usePostVeiligheidMeldingenIdActies,
  usePatchVeiligheidMeldingenIdActiesActieId,
  getGetVeiligheidMeldingenQueryKey,
  getGetVeiligheidMeldingenIdActiesQueryKey,
  type VeiligheidMelding,
  type VeiligheidMeldingInput,
  type VeiligheidMeldingActie,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import {
  AlertTriangle, Plus, Trash2, Loader2, Pencil, CheckCircle2,
  Clock, MessageSquarePlus, ArrowRight, ChevronRight, Filter,
} from "lucide-react";

const MELDING_TYPEN = [
  { waarde: "onveilige_situatie", label: "Onveilige situatie" },
  { waarde: "bijna_ongeval", label: "Bijna-ongeval" },
  { waarde: "incident", label: "Incident" },
  { waarde: "idee", label: "Verbeteringsidee" },
];

const PRIORITEITEN = [
  { waarde: "laag", label: "Laag" },
  { waarde: "middel", label: "Middel" },
  { waarde: "hoog", label: "Hoog" },
  { waarde: "kritiek", label: "Kritiek" },
];

const STATUSSEN = [
  { waarde: "open", label: "Open" },
  { waarde: "in_behandeling", label: "In behandeling" },
  { waarde: "afgehandeld", label: "Afgehandeld" },
];

function meldingTypeBadge(type: string) {
  const kleur: Record<string, string> = {
    onveilige_situatie: "bg-orange-100 text-orange-800 border-orange-300",
    bijna_ongeval: "bg-red-100 text-red-800 border-red-300",
    incident: "bg-red-200 text-red-900 border-red-400",
    idee: "bg-blue-100 text-blue-800 border-blue-300",
  };
  const label = MELDING_TYPEN.find((t) => t.waarde === type)?.label ?? type;
  return <Badge className={`text-xs font-medium border ${kleur[type] ?? "bg-muted"}`}>{label}</Badge>;
}

function prioriteitBadge(prioriteit: string) {
  const kleur: Record<string, string> = {
    laag: "bg-gray-100 text-gray-700",
    middel: "bg-yellow-100 text-yellow-800",
    hoog: "bg-orange-100 text-orange-800",
    kritiek: "bg-red-100 text-red-800",
  };
  const label = PRIORITEITEN.find((p) => p.waarde === prioriteit)?.label ?? prioriteit;
  return <Badge className={`text-xs ${kleur[prioriteit] ?? "bg-muted"}`}>{label}</Badge>;
}

function statusBadge(status: string) {
  const kleur: Record<string, string> = {
    open: "bg-yellow-100 text-yellow-800 border-yellow-300",
    in_behandeling: "bg-blue-100 text-blue-800 border-blue-300",
    afgehandeld: "bg-green-100 text-green-800 border-green-300",
  };
  const label = STATUSSEN.find((s) => s.waarde === status)?.label ?? status;
  return <Badge className={`text-xs border ${kleur[status] ?? "bg-muted"}`}>{label}</Badge>;
}

type MeldingForm = {
  type: string;
  omschrijving: string;
  locatie: string;
  project_naam: string;
  prioriteit: string;
};

const leegMeldingForm = (): MeldingForm => ({
  type: "onveilige_situatie",
  omschrijving: "",
  locatie: "",
  project_naam: "",
  prioriteit: "middel",
});

function ActiePaneel({ melding }: { melding: VeiligheidMelding }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven = heeftNiveau("toolbox", 3);

  const [actieOmschrijving, setActieOmschrijving] = useState("");
  const [actieDeadline, setActieDeadline] = useState("");

  const { data: acties, isLoading } = useGetVeiligheidMeldingenIdActies(melding.id);

  const toevoegenMutatie = usePostVeiligheidMeldingenIdActies({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetVeiligheidMeldingenIdActiesQueryKey(melding.id) });
        setActieOmschrijving("");
        setActieDeadline("");
        toast({ title: "Actie toegevoegd" });
      },
    },
  });

  const bijwerkenMutatie = usePatchVeiligheidMeldingenIdActiesActieId({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetVeiligheidMeldingenIdActiesQueryKey(melding.id) });
        toast({ title: "Actie bijgewerkt" });
      },
    },
  });

  const actieToevoegen = () => {
    if (!actieOmschrijving.trim()) return;
    toevoegenMutatie.mutate({
      id: melding.id,
      data: {
        omschrijving: actieOmschrijving,
        deadline: actieDeadline || null,
      },
    });
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Skeleton className="h-16 rounded" />
      ) : (acties ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nog geen correctieve acties.</p>
      ) : (
        <ul className="space-y-2">
          {(acties ?? []).map((actie) => (
            <li key={actie.id} className="rounded-lg border px-3 py-2 text-sm flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p>{actie.omschrijving}</p>
                <div className="flex items-center gap-2 mt-1">
                  {actie.deadline && (
                    <span className="text-xs text-muted-foreground">
                      Deadline: {new Date(actie.deadline).toLocaleDateString("nl-NL")}
                    </span>
                  )}
                  {actie.eigenaar_naam && (
                    <span className="text-xs text-muted-foreground">{actie.eigenaar_naam}</span>
                  )}
                  {statusBadge(actie.status)}
                </div>
              </div>
              {magSchrijven && actie.status === "open" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 text-green-700 border-green-300 hover:bg-green-50"
                  onClick={() =>
                    bijwerkenMutatie.mutate({ id: melding.id, actieId: actie.id, data: { omschrijving: actie.omschrijving, status: "afgehandeld" } })
                  }
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Afhandelen
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {magSchrijven && (
        <div className="space-y-2 pt-2 border-t">
          <p className="text-sm font-medium">Actie toevoegen</p>
          <Textarea
            rows={2}
            value={actieOmschrijving}
            onChange={(e) => setActieOmschrijving(e.target.value)}
            placeholder="Beschrijf de corrigerende maatregel"
          />
          <div className="flex gap-2">
            <Input
              type="date"
              value={actieDeadline}
              onChange={(e) => setActieDeadline(e.target.value)}
              className="w-40"
            />
            <Button
              size="sm"
              onClick={actieToevoegen}
              disabled={!actieOmschrijving.trim() || toevoegenMutatie.isPending}
            >
              {toevoegenMutatie.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Toevoegen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VeiligheidMeldingenPagina() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven = heeftNiveau("toolbox", 3);
  const magVerwijderen = heeftNiveau("toolbox", 4);

  const [zoekterm, setZoekterm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [prioriteitFilter, setPrioriteitFilter] = useState<string>("alle");
  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [detailMelding, setDetailMelding] = useState<VeiligheidMelding | null>(null);
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [formulier, setFormulier] = useState<MeldingForm>(leegMeldingForm());
  const [verwijderDialoogId, setVerwijderDialoogId] = useState<number | null>(null);

  const { data: meldingen, isLoading } = useGetVeiligheidMeldingen();

  const aanmakenMutatie = usePostVeiligheidMeldingen({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetVeiligheidMeldingenQueryKey() });
        setDialoogOpen(false);
        toast({ title: "Melding ingediend" });
      },
      onError: () => toast({ title: "Fout bij opslaan", variant: "destructive" }),
    },
  });

  const bijwerkenMutatie = usePatchVeiligheidMeldingenId({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getGetVeiligheidMeldingenQueryKey() });
        setDialoogOpen(false);
        setDetailMelding(data);
        toast({ title: "Melding bijgewerkt" });
      },
      onError: () => toast({ title: "Fout bij opslaan", variant: "destructive" }),
    },
  });

  const verwijderenMutatie = useDeleteVeiligheidMeldingenId({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetVeiligheidMeldingenQueryKey() });
        setVerwijderDialoogId(null);
        setDetailMelding(null);
        toast({ title: "Melding verwijderd" });
      },
      onError: () => toast({ title: "Fout bij verwijderen", variant: "destructive" }),
    },
  });

  const openNieuw = () => {
    setBewerkId(null);
    setFormulier(leegMeldingForm());
    setDialoogOpen(true);
  };

  const opslaan = () => {
    if (!formulier.omschrijving.trim()) {
      toast({ title: "Omschrijving is verplicht", variant: "destructive" });
      return;
    }
    const invoer: VeiligheidMeldingInput = {
      type: formulier.type,
      omschrijving: formulier.omschrijving,
      locatie: formulier.locatie || null,
      project_naam: formulier.project_naam || null,
      prioriteit: formulier.prioriteit,
      foto_paden: [],
    };
    if (bewerkId) {
      bijwerkenMutatie.mutate({ id: bewerkId, data: invoer });
    } else {
      aanmakenMutatie.mutate({ data: invoer });
    }
  };

  const statusWijzigen = (melding: VeiligheidMelding, nieuweStatus: string) => {
    bijwerkenMutatie.mutate({ id: melding.id, data: { status: nieuweStatus } as any });
  };

  const gefilterd = (meldingen ?? []).filter((m) => {
    const matchZoek =
      m.omschrijving.toLowerCase().includes(zoekterm.toLowerCase()) ||
      (m.locatie ?? "").toLowerCase().includes(zoekterm.toLowerCase()) ||
      (m.melder_naam ?? "").toLowerCase().includes(zoekterm.toLowerCase());
    const matchStatus = statusFilter === "alle" || m.status === statusFilter;
    const matchPrioriteit = prioriteitFilter === "alle" || m.prioriteit === prioriteitFilter;
    return matchZoek && matchStatus && matchPrioriteit;
  });

  const isBezigOpslaan = aanmakenMutatie.isPending || bijwerkenMutatie.isPending;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-orange-600" />
            Veiligheidsmeldingen
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Meld onveilige situaties, bijna-ongevallen, incidenten en verbeteringsideen
          </p>
        </div>
        <Button onClick={openNieuw}>
          <Plus className="w-4 h-4 mr-2" />
          Nieuwe melding
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Zoeken..."
          value={zoekterm}
          onChange={(e) => setZoekterm(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            {STATUSSEN.map((s) => <SelectItem key={s.waarde} value={s.waarde}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={prioriteitFilter} onValueChange={setPrioriteitFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Prioriteit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle prioriteiten</SelectItem>
            {PRIORITEITEN.map((p) => <SelectItem key={p.waarde} value={p.waarde}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Telrij */}
      {(meldingen ?? []).length > 0 && (
        <div className="flex gap-4 text-sm">
          {[
            { label: "Open", status: "open", kleur: "text-yellow-700" },
            { label: "In behandeling", status: "in_behandeling", kleur: "text-blue-700" },
            { label: "Afgehandeld", status: "afgehandeld", kleur: "text-green-700" },
          ].map(({ label, status, kleur }) => (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? "alle" : status)}
              className={`font-medium hover:underline ${kleur}`}
            >
              {label}: {(meldingen ?? []).filter((m) => m.status === status).length}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : gefilterd.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-40" />
            <p className="text-muted-foreground">
              {zoekterm || statusFilter !== "alle" || prioriteitFilter !== "alle"
                ? "Geen meldingen gevonden."
                : "Nog geen veiligheidsmeldingen."}
            </p>
            {!zoekterm && statusFilter === "alle" && (
              <Button className="mt-4" onClick={openNieuw}>
                <Plus className="w-4 h-4 mr-2" />
                Eerste melding doen
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {gefilterd.map((melding) => (
            <Card
              key={melding.id}
              className="cursor-pointer hover:shadow-sm transition-shadow"
              onClick={() => setDetailMelding(melding)}
            >
              <CardContent className="py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    {meldingTypeBadge(melding.type)}
                    {prioriteitBadge(melding.prioriteit)}
                    {statusBadge(melding.status)}
                  </div>
                  <p className="text-sm font-medium line-clamp-2">{melding.omschrijving}</p>
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                    {melding.locatie && <span>{melding.locatie}</span>}
                    {melding.melder_naam && <span>{melding.melder_naam}</span>}
                    <span>
                      {new Date(melding.aangemaakt_op).toLocaleDateString("nl-NL", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail dialoog */}
      <Dialog open={!!detailMelding} onOpenChange={(o) => !o && setDetailMelding(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Melding detail
            </DialogTitle>
          </DialogHeader>
          {detailMelding && (
            <Tabs defaultValue="detail">
              <TabsList className="w-full">
                <TabsTrigger value="detail" className="flex-1">Details</TabsTrigger>
                <TabsTrigger value="acties" className="flex-1">Corrigerende acties</TabsTrigger>
              </TabsList>
              <TabsContent value="detail" className="space-y-4 pt-2">
                <div className="flex flex-wrap gap-2">
                  {meldingTypeBadge(detailMelding.type)}
                  {prioriteitBadge(detailMelding.prioriteit)}
                  {statusBadge(detailMelding.status)}
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Omschrijving</p>
                  <p className="text-sm mt-1">{detailMelding.omschrijving}</p>
                </div>
                {detailMelding.locatie && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Locatie</p>
                    <p className="text-sm mt-1">{detailMelding.locatie}</p>
                  </div>
                )}
                {detailMelding.project_naam && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Project</p>
                    <p className="text-sm mt-1">{detailMelding.project_naam}</p>
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t">
                  {detailMelding.melder_naam && <span>Gemeld door: {detailMelding.melder_naam}</span>}
                  <span>{new Date(detailMelding.aangemaakt_op).toLocaleDateString("nl-NL", {
                    day: "2-digit", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}</span>
                </div>
                {magSchrijven && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {STATUSSEN.filter((s) => s.waarde !== detailMelding.status).map((s) => (
                      <Button
                        key={s.waarde}
                        size="sm"
                        variant="outline"
                        onClick={() => statusWijzigen(detailMelding, s.waarde)}
                        disabled={bijwerkenMutatie.isPending}
                      >
                        <ArrowRight className="w-3.5 h-3.5 mr-1" />
                        Zet op {s.label}
                      </Button>
                    ))}
                    {magVerwijderen && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/5"
                        onClick={() => setVerwijderDialoogId(detailMelding.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Verwijderen
                      </Button>
                    )}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="acties" className="pt-2">
                <ActiePaneel melding={detailMelding} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Aanmaken dialoog */}
      <Dialog open={dialoogOpen} onOpenChange={(o) => !o && setDialoogOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {bewerkId ? "Melding bewerken" : "Nieuwe veiligheidsmelding"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Type melding</Label>
              <Select value={formulier.type} onValueChange={(v) => setFormulier((f) => ({ ...f, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MELDING_TYPEN.map((t) => (
                    <SelectItem key={t.waarde} value={t.waarde}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Omschrijving <span className="text-destructive">*</span></Label>
              <Textarea
                rows={4}
                value={formulier.omschrijving}
                onChange={(e) => setFormulier((f) => ({ ...f, omschrijving: e.target.value }))}
                placeholder="Beschrijf wat er is gebeurd of gesignaleerd"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Locatie</Label>
                <Input
                  value={formulier.locatie}
                  onChange={(e) => setFormulier((f) => ({ ...f, locatie: e.target.value }))}
                  placeholder="Waar was dit?"
                />
              </div>
              <div className="space-y-1">
                <Label>Project</Label>
                <Input
                  value={formulier.project_naam}
                  onChange={(e) => setFormulier((f) => ({ ...f, project_naam: e.target.value }))}
                  placeholder="Optioneel"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Prioriteit</Label>
              <Select value={formulier.prioriteit} onValueChange={(v) => setFormulier((f) => ({ ...f, prioriteit: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITEITEN.map((p) => (
                    <SelectItem key={p.waarde} value={p.waarde}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialoogOpen(false)}>Annuleren</Button>
            <Button onClick={opslaan} disabled={isBezigOpslaan}>
              {isBezigOpslaan && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {bewerkId ? "Opslaan" : "Melding indienen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verwijder bevestiging */}
      <AlertDialog open={verwijderDialoogId !== null} onOpenChange={(o) => !o && setVerwijderDialoogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Melding verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>Deze actie kan niet ongedaan worden gemaakt.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => verwijderDialoogId && verwijderenMutatie.mutate({ id: verwijderDialoogId })}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

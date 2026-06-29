// Inkoopplanning tab — per-artikel classificatie, levertijden, leveranciers, inkoopbonnen
import { useState } from "react";
import {
  useGetInkoopplanning,
  useGenereerInkoopplanning,
  useVaststellenInkoopplanning,
  usePatchInkoopplanRegel,
  useListInkoopbonnen,
  useCreateInkoopbon,
  usePatchInkoopbon,
  useDeleteInkoopbon,
  getGetInkoopplanningQueryKey,
  getListInkoopbonnenQueryKey,
} from "@workspace/api-client-react";
import type { InkoopplanRegel, Inkoopbon } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Sparkles, Check, Package, Truck, Clock, AlertTriangle, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

function euro(n: number | null | undefined) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n ?? 0);
}

const TYPE_LABELS: Record<string, { label: string; kleur: string; omschrijving: string }> = {
  voorraad: { label: "Uit voorraad", kleur: "bg-emerald-50 text-emerald-800 border-emerald-200", omschrijving: "Direct leverbaar" },
  standaard: { label: "Standaard", kleur: "bg-blue-50 text-blue-800 border-blue-200", omschrijving: "1-2 weken" },
  project: { label: "Projectmateriaal", kleur: "bg-amber-50 text-amber-800 border-amber-200", omschrijving: "2-4 weken" },
  maatwerk: { label: "Maatwerk", kleur: "bg-rose-50 text-rose-800 border-rose-200", omschrijving: ">4 weken" },
};

const STATUS_LABELS: Record<string, { label: string; kleur: string }> = {
  open: { label: "Open", kleur: "bg-slate-100 text-slate-700 border-slate-200" },
  uit_voorraad: { label: "Uit voorraad", kleur: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  besteld: { label: "Besteld", kleur: "bg-blue-50 text-blue-700 border-blue-200" },
  geleverd: { label: "Geleverd", kleur: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

const BON_STATUS_LABELS: Record<string, { label: string; kleur: string }> = {
  concept: { label: "Concept", kleur: "bg-amber-50 text-amber-800 border-amber-200" },
  goedgekeurd: { label: "Goedgekeurd", kleur: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  besteld: { label: "Besteld", kleur: "bg-blue-50 text-blue-800 border-blue-200" },
  geleverd: { label: "Geleverd", kleur: "bg-emerald-100 text-emerald-900 border-emerald-300" },
};

interface InkoopRegelRijProps {
  regel: InkoopplanRegel;
  opdrachtId: number;
  planId: number;
}

function InkoopRegelRij({ regel, opdrachtId, planId }: InkoopRegelRijProps) {
  const [open, setOpen] = useState(false);
  const [leverancier, setLeverancier] = useState(regel.leverancier ?? "");
  const [inkoopprijs, setInkoopprijs] = useState(
    regel.inkoopprijs != null ? String(regel.inkoopprijs) : regel.inkoopprijs_verwacht != null ? String(regel.inkoopprijs_verwacht) : ""
  );
  const [type, setType] = useState<string>(regel.type);
  const [status, setStatus] = useState<string>(regel.status);
  const [datum, setDatum] = useState(regel.gewenste_leverdatum ?? "");
  const [opslaan, setOpslaan] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const patchMutatie = usePatchInkoopplanRegel({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetInkoopplanningQueryKey(opdrachtId) });
        setOpslaan(false);
        toast({ title: "Regel bijgewerkt" });
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    },
  });

  const typeInfo = TYPE_LABELS[type] ?? TYPE_LABELS.standaard;
  const statusInfo = STATUS_LABELS[status] ?? STATUS_LABELS.open;
  const besparing = regel.besparing ?? 0;

  function bewaar() {
    setOpslaan(true);
    patchMutatie.mutate({
      id: opdrachtId,
      regelId: regel.id,
      data: {
        leverancier: leverancier || undefined,
        inkoopprijs: inkoopprijs ? parseFloat(inkoopprijs) : undefined,
        type,
        status,
        gewenste_leverdatum: datum || undefined,
      },
    });
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{regel.omschrijving}</span>
            <Badge variant="outline" className={`text-xs ${typeInfo.kleur}`}>{typeInfo.label}</Badge>
            <Badge variant="outline" className={`text-xs ${statusInfo.kleur}`}>{statusInfo.label}</Badge>
            {regel.ai_motivatie && (
              <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            <span>{regel.hoeveelheid} {regel.eenheid}</span>
            {regel.calc_prijs != null && <span>Calc: {euro(regel.calc_prijs)}</span>}
            {(regel.inkoopprijs ?? regel.inkoopprijs_verwacht) != null && (
              <span className="text-blue-700">Inkoop: {euro(regel.inkoopprijs ?? regel.inkoopprijs_verwacht)}</span>
            )}
            {besparing > 0 && <span className="text-emerald-700">-{euro(besparing)}</span>}
            {regel.levertijd_weken != null && (
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {regel.levertijd_weken}w</span>
            )}
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </div>

      {open && (
        <div className="border-t bg-muted/20 p-3 space-y-3">
          {regel.ai_motivatie && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-2 text-xs text-amber-800">
              <Sparkles className="h-3 w-3 inline mr-1" />
              {regel.ai_motivatie}
            </div>
          )}
          {regel.aanbevolen_leverancier && (
            <p className="text-xs text-muted-foreground">
              AI aanbeveling: <span className="font-medium text-foreground">{regel.aanbevolen_leverancier}</span>
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Leverancier</label>
              <Input
                value={leverancier}
                onChange={e => setLeverancier(e.target.value)}
                placeholder={regel.aanbevolen_leverancier ?? "Leverancier"}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Inkoopprijs</label>
              <Input
                type="number"
                value={inkoopprijs}
                onChange={e => setInkoopprijs(e.target.value)}
                placeholder={regel.inkoopprijs_verwacht != null ? String(regel.inkoopprijs_verwacht) : "0,00"}
                className="h-8 text-sm"
                step="0.01"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Leverdatum</label>
              <Input
                type="date"
                value={datum}
                onChange={e => setDatum(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="voorraad">Uit voorraad</SelectItem>
                  <SelectItem value="standaard">Standaard (1-2w)</SelectItem>
                  <SelectItem value="project">Projectmateriaal (2-4w)</SelectItem>
                  <SelectItem value="maatwerk">Maatwerk (&gt;4w)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="uit_voorraad">Uit voorraad</SelectItem>
                  <SelectItem value="besteld">Besteld</SelectItem>
                  <SelectItem value="geleverd">Geleverd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={bewaar} disabled={opslaan || patchMutatie.isPending}>
              {patchMutatie.isPending ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>

          {/* Plan regel niet bij planId check — planId is already passed */}
          {planId > 0 && null}
        </div>
      )}
    </div>
  );
}

interface NieuweInkoopbonDialoogProps {
  opdrachtId: number;
  planId: number | null;
  regels: InkoopplanRegel[];
  open: boolean;
  onClose: () => void;
}

function NieuweInkoopbonDialoog({ opdrachtId, planId, regels, open, onClose }: NieuweInkoopbonDialoogProps) {
  const [leverancier, setLeverancier] = useState("");
  const [datum, setDatum] = useState("");
  const [geselecteerd, setGeselecteerd] = useState<number[]>([]);
  const { toast } = useToast();
  const qc = useQueryClient();
  void planId;

  const createMutatie = useCreateInkoopbon({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInkoopbonnenQueryKey(opdrachtId) });
        toast({ title: "Inkoopbon aangemaakt" });
        onClose();
        setLeverancier("");
        setDatum("");
        setGeselecteerd([]);
      },
      onError: () => toast({ title: "Aanmaken mislukt", variant: "destructive" }),
    },
  });

  const geselecteerdeRegels = regels.filter(r => geselecteerd.includes(r.id));

  function toggleRegel(id: number) {
    setGeselecteerd(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function aanmaken() {
    if (!leverancier.trim()) {
      toast({ title: "Leverancier verplicht", variant: "destructive" }); return;
    }
    createMutatie.mutate({
      id: opdrachtId,
      data: {
        leverancier,
        gewenste_leverdatum: datum || undefined,
        regels: geselecteerdeRegels.map(r => ({
          inkoopplan_regel_id: r.id,
          omschrijving: r.omschrijving,
          hoeveelheid: r.hoeveelheid,
          eenheid: r.eenheid,
          prijs: r.inkoopprijs ?? r.inkoopprijs_verwacht ?? undefined,
        })),
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nieuwe inkoopbon</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Leverancier</label>
            <Input value={leverancier} onChange={e => setLeverancier(e.target.value)} placeholder="Naam leverancier" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Gewenste leverdatum</label>
            <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} className="mt-1" />
          </div>
          {regels.length > 0 && (
            <div>
              <label className="text-sm font-medium">Artikelen toevoegen (optioneel)</label>
              <div className="mt-1 border rounded-md divide-y max-h-48 overflow-y-auto">
                {regels.map(r => (
                  <label key={r.id} className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/30 text-sm">
                    <input
                      type="checkbox"
                      checked={geselecteerd.includes(r.id)}
                      onChange={() => toggleRegel(r.id)}
                      className="rounded"
                    />
                    <span className="flex-1">{r.omschrijving}</span>
                    <span className="text-muted-foreground">{r.hoeveelheid} {r.eenheid}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={aanmaken} disabled={createMutatie.isPending}>
            {createMutatie.isPending ? "Aanmaken..." : "Aanmaken"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface InkoopbonKaartProps {
  bon: Inkoopbon;
  opdrachtId: number;
}

function InkoopbonKaart({ bon, opdrachtId }: InkoopbonKaartProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const statusInfo = BON_STATUS_LABELS[bon.status] ?? BON_STATUS_LABELS.concept;

  const patchMutatie = usePatchInkoopbon({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInkoopbonnenQueryKey(opdrachtId) });
        toast({ title: "Inkoopbon bijgewerkt" });
      },
      onError: () => toast({ title: "Bijwerken mislukt", variant: "destructive" }),
    },
  });

  const deleteMutatie = useDeleteInkoopbon({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInkoopbonnenQueryKey(opdrachtId) });
        toast({ title: "Inkoopbon verwijderd" });
      },
      onError: () => toast({ title: "Verwijderen mislukt", variant: "destructive" }),
    },
  });

  const volgendeStatus: Record<string, string> = {
    concept: "goedgekeurd",
    goedgekeurd: "besteld",
    besteld: "geleverd",
  };

  const volgendeStatusLabel: Record<string, string> = {
    concept: "Goedkeuren",
    goedgekeurd: "Markeer besteld",
    besteld: "Markeer geleverd",
  };

  return (
    <Card>
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">{bon.leverancier}</CardTitle>
              {bon.bon_nummer && <span className="text-xs text-muted-foreground">{bon.bon_nummer}</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className={`text-xs ${statusInfo.kleur}`}>{statusInfo.label}</Badge>
              {bon.gewenste_leverdatum && (
                <span className="text-xs text-muted-foreground">
                  Leverdatum: {new Date(bon.gewenste_leverdatum).toLocaleDateString("nl-NL")}
                </span>
              )}
              {bon.totaal_bedrag != null && (
                <span className="text-xs font-medium">{euro(bon.totaal_bedrag)}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {volgendeStatus[bon.status] && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={patchMutatie.isPending}
                onClick={() => patchMutatie.mutate({ id: opdrachtId, bonId: bon.id, data: { status: volgendeStatus[bon.status] } })}
              >
                <Check className="h-3 w-3" />
                {volgendeStatusLabel[bon.status]}
              </Button>
            )}
            {bon.status === "concept" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                disabled={deleteMutatie.isPending}
                onClick={() => deleteMutatie.mutate({ id: opdrachtId, bonId: bon.id })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {(bon.regels ?? []).length > 0 && (
        <CardContent className="pb-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-left pb-1 font-normal">Artikel</th>
                <th className="text-right pb-1 font-normal">Hoev.</th>
                <th className="text-right pb-1 font-normal">Prijs</th>
                <th className="text-right pb-1 font-normal">Totaal</th>
              </tr>
            </thead>
            <tbody>
              {(bon.regels ?? []).map((r, i) => (
                <tr key={i} className="border-b border-dashed last:border-0">
                  <td className="py-1">{r.omschrijving}</td>
                  <td className="text-right py-1 tabular-nums">{r.hoeveelheid} {r.eenheid}</td>
                  <td className="text-right py-1 tabular-nums">{r.prijs != null ? euro(r.prijs) : "—"}</td>
                  <td className="text-right py-1 tabular-nums">{r.totaal != null ? euro(r.totaal) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      )}
    </Card>
  );
}

interface InkoopplanningTabProps {
  opdrachtId: number;
}

export default function InkoopplanningTab({ opdrachtId }: InkoopplanningTabProps) {
  const [bonDialoog, setBonDialoog] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: plan, isLoading, error } = useGetInkoopplanning(opdrachtId);
  const { data: bonnen } = useListInkoopbonnen(opdrachtId);

  const genereerMutatie = useGenereerInkoopplanning({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetInkoopplanningQueryKey(opdrachtId) });
        toast({ title: "Inkoopplanning gegenereerd" });
      },
      onError: () => toast({ title: "Genereren mislukt", variant: "destructive" }),
    },
  });

  const vaststellenMutatie = useVaststellenInkoopplanning({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetInkoopplanningQueryKey(opdrachtId) });
        toast({ title: "Inkoopplanning gereedgemeld" });
      },
      onError: () => toast({ title: "Gereedmelden mislukt", variant: "destructive" }),
    },
  });

  const isGereed = plan?.status === "gereed";

  // Groepeer per type voor overzicht
  const regels = plan?.regels ?? [];
  const langeLevering = regels.filter(r => r.type === "maatwerk" || (r.levertijd_weken ?? 0) >= 4);
  const totaalBesparing = plan?.totale_besparing ?? regels.reduce((a, r) => a + (r.besparing ?? 0), 0);

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="mt-4">
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Package className="h-10 w-10 mx-auto opacity-30" />
            <p className="text-muted-foreground">Nog geen inkoopplanning voor deze opdracht.</p>
            <p className="text-sm text-muted-foreground">
              AI analyseert de materiaalregels uit de werkbegroting en maakt een inkoopplanning.
            </p>
            <Button
              onClick={() => genereerMutatie.mutate({ id: opdrachtId })}
              disabled={genereerMutatie.isPending}
            >
              <Sparkles className="h-4 w-4" />
              {genereerMutatie.isPending ? "Genereren..." : "AI Inkoopplanning genereren"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Header + acties */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {plan.ai_gegenereerd && (
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              AI gegenereerd
            </Badge>
          )}
          <Badge variant="outline" className={`text-xs ${isGereed ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200"}`}>
            {isGereed ? "Gereed" : "Concept"}
          </Badge>
          {totaalBesparing > 0 && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-xs">
              -{euro(totaalBesparing)} bespaarpotentieel
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => genereerMutatie.mutate({ id: opdrachtId })}
            disabled={genereerMutatie.isPending || isGereed}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {genereerMutatie.isPending ? "Genereren..." : "Opnieuw genereren"}
          </Button>
          {!isGereed && (
            <Button
              size="sm"
              onClick={() => vaststellenMutatie.mutate({ id: opdrachtId })}
              disabled={vaststellenMutatie.isPending}
            >
              <Check className="h-3.5 w-3.5" /> Gereedmelden
            </Button>
          )}
        </div>
      </div>

      {/* AI samenvatting */}
      {plan.ai_samenvatting && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900">
          <Sparkles className="h-4 w-4 inline mr-1.5 text-amber-600" />
          {plan.ai_samenvatting}
        </div>
      )}

      {/* Aandacht: lange levertijden */}
      {langeLevering.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-md p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-rose-800 mb-1">
            <AlertTriangle className="h-4 w-4" />
            Lange levertijden — vroeg bestellen
          </div>
          <ul className="space-y-0.5">
            {langeLevering.map(r => (
              <li key={r.id} className="text-xs text-rose-700">
                {r.omschrijving} — {r.levertijd_weken != null ? `${r.levertijd_weken} weken` : "maatwerk"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Artikelen */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Inkoop-artikelen ({regels.length})</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {["voorraad", "standaard", "project", "maatwerk"].map(t => {
              const count = regels.filter(r => r.type === t).length;
              if (count === 0) return null;
              const info = TYPE_LABELS[t];
              return (
                <Badge key={t} variant="outline" className={`text-xs ${info.kleur}`}>
                  {count}x {info.label}
                </Badge>
              );
            })}
          </div>
        </div>
        <div className="space-y-2">
          {regels.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Geen materiaalregels in de werkbegroting.
              </CardContent>
            </Card>
          ) : (
            regels.map(r => (
              <InkoopRegelRij key={r.id} regel={r} opdrachtId={opdrachtId} planId={plan.id} />
            ))
          )}
        </div>
      </div>

      {/* Inkoopbonnen */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Inkoopbonnen</h3>
            {(bonnen ?? []).length > 0 && (
              <Badge variant="outline" className="text-xs">{(bonnen ?? []).length}</Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBonDialoog(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Nieuwe inkoopbon
          </Button>
        </div>

        {(bonnen ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              <Truck className="h-6 w-6 mx-auto mb-2 opacity-30" />
              Nog geen inkoopbonnen aangemaakt.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {(bonnen ?? []).map(bon => (
              <InkoopbonKaart key={bon.id} bon={bon} opdrachtId={opdrachtId} />
            ))}
          </div>
        )}
      </div>

      <NieuweInkoopbonDialoog
        opdrachtId={opdrachtId}
        planId={plan.id}
        regels={regels}
        open={bonDialoog}
        onClose={() => setBonDialoog(false)}
      />
    </div>
  );
}

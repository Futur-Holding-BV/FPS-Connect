// Inkoopplanning tab — per-artikel classificatie, levertijden, leveranciers, inkoopbonnen
import { useState } from "react";
import {
  useGetInkoopplanning,
  useGenereerInkoopplanning,
  useVaststellenInkoopplanning,
  usePatchInkoopplanRegel,
  useCreateInkoopplanRegel,
  useDeleteInkoopplanRegel,
  useListInkoopbonnen,
  useCreateInkoopbon,
  usePatchInkoopbon,
  useDeleteInkoopbon,
  useGenereerInkoopbonAiSuggesties,
  useVerzendInkoopbon,
  getGetInkoopplanningQueryKey,
  getListInkoopbonnenQueryKey,
  useListLeveranciers,
  useCorrectieVoorraad,
  useListArtikelen,
  useTerGoedkeuringIndienenInkoopbon,
  ApiError,
} from "@workspace/api-client-react";
import type { InkoopplanRegel, Inkoopbon, InkoopbonAiSuggestieResultaat } from "@workspace/api-client-react";
import { GoedkeuringWidget } from "@/components/goedkeuring/goedkeuring-widget";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sparkles, Check, Package, Truck, Clock, AlertTriangle,
  Plus, Trash2, ChevronDown, ChevronUp, Mail, Send, Bot, PenLine, Warehouse,
} from "lucide-react";
import { Label } from "@/components/ui/label";
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

const PRIJS_BRON_LABELS: Record<string, { label: string; kleur: string }> = {
  jaarprijslijst: { label: "Jaarprijslijst", kleur: "bg-slate-100 text-slate-700 border-slate-200" },
  inkoophistorie: { label: "Eigen inkoophistorie", kleur: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  leveranciersofferte: { label: "Leveranciersofferte", kleur: "bg-slate-100 text-slate-700 border-slate-200" },
  vrij: { label: "Vrije prijs", kleur: "bg-amber-50 text-amber-800 border-amber-200" },
  onbekend: { label: "Bron onbekend", kleur: "bg-slate-50 text-slate-500 border-slate-200" },
};

function prijsGeldigVerlopen(datum: string | null | undefined): boolean {
  if (!datum) return false;
  const d = new Date(datum);
  if (isNaN(d.getTime())) return false;
  d.setHours(23, 59, 59, 999);
  return d.getTime() < Date.now();
}

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
  const [prijsBron, setPrijsBron] = useState<string>((regel as { prijs_bron?: string }).prijs_bron ?? "onbekend");
  const [prijsGeldigTot, setPrijsGeldigTot] = useState((regel as { prijs_geldig_tot?: string | null }).prijs_geldig_tot ?? "");
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
  void planId;

  const deleteMutatie = useDeleteInkoopplanRegel({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetInkoopplanningQueryKey(opdrachtId) });
        toast({ title: "Regel verwijderd" });
      },
      onError: () => toast({ title: "Verwijderen mislukt", variant: "destructive" }),
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
        prijs_bron: (prijsBron || undefined) as "onbekend" | "jaarprijslijst" | "inkoophistorie" | "leveranciersofferte" | "vrij" | undefined,
        prijs_geldig_tot: prijsGeldigTot || undefined,
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
            {regel.werkpakket_sleutel && (
              <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200">
                {regel.werkpakket_sleutel}
              </Badge>
            )}
            <Badge variant="outline" className={`text-xs ${typeInfo.kleur}`}>{typeInfo.label}</Badge>
            {(regel as { bron?: string }).bron === "vrij" && (
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                <PenLine className="h-2.5 w-2.5 mr-1" />
                Handmatig
              </Badge>
            )}
            <Badge variant="outline" className={`text-xs ${statusInfo.kleur}`}>{statusInfo.label}</Badge>
            {(() => {
              const pb = (regel as { prijs_bron?: string }).prijs_bron ?? "onbekend";
              if (pb === "onbekend") return null;
              const info = PRIJS_BRON_LABELS[pb] ?? PRIJS_BRON_LABELS.onbekend;
              return <Badge variant="outline" className={`text-xs ${info.kleur}`}>{info.label}</Badge>;
            })()}
            {prijsGeldigVerlopen((regel as { prijs_geldig_tot?: string | null }).prijs_geldig_tot) && (
              <Badge variant="outline" className="text-xs bg-rose-50 text-rose-700 border-rose-200">
                <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                Prijs verlopen
              </Badge>
            )}
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
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          {(regel as { bron?: string }).bron === "vrij" && (
            <Button
              size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => deleteMutatie.mutate({ id: opdrachtId, regelId: regel.id })}
              disabled={deleteMutatie.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
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

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prijsbron</label>
              <Select value={prijsBron} onValueChange={setPrijsBron}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jaarprijslijst">Jaarprijslijst</SelectItem>
                  <SelectItem value="inkoophistorie">Eigen inkoophistorie</SelectItem>
                  <SelectItem value="leveranciersofferte">Leveranciersofferte</SelectItem>
                  <SelectItem value="vrij">Vrije prijs</SelectItem>
                  <SelectItem value="onbekend">Bron onbekend</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prijs geldig tot</label>
              <Input
                type="date"
                value={prijsGeldigTot}
                onChange={e => setPrijsGeldigTot(e.target.value)}
                className="h-8 text-sm"
              />
              {prijsGeldigVerlopen(prijsGeldigTot) && (
                <p className="text-xs text-rose-600 mt-1">Deze prijs is verlopen; opnieuw opvragen.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={bewaar} disabled={opslaan || patchMutatie.isPending}>
              {patchMutatie.isPending ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>

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
  const [leverancierId, setLeverancierId] = useState<number | null>(null);
  const [datum, setDatum] = useState("");
  const [geselecteerd, setGeselecteerd] = useState<number[]>([]);
  const { toast } = useToast();
  const qc = useQueryClient();
  void planId;
  const { data: leveranciersList = [] } = useListLeveranciers();

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
    const leverancierNaam = leverancierId
      ? (leveranciersList.find((l) => l.id === leverancierId)?.naam ?? leverancier)
      : leverancier;
    if (!leverancierNaam.trim()) {
      toast({ title: "Leverancier verplicht", variant: "destructive" }); return;
    }
    createMutatie.mutate({
      id: opdrachtId,
      data: {
        leverancier: leverancierNaam,
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
            {leveranciersList.length > 0 ? (
              <select
                value={leverancierId ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") {
                    setLeverancierId(null);
                    setLeverancier("");
                  } else {
                    const id = parseInt(val);
                    setLeverancierId(id);
                    setLeverancier(leveranciersList.find((l) => l.id === id)?.naam ?? "");
                  }
                }}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">— Kies een leverancier of typ handmatig —</option>
                {leveranciersList.map((l) => (
                  <option key={l.id} value={l.id}>{l.naam}</option>
                ))}
              </select>
            ) : null}
            {leverancierId === null && (
              <Input
                value={leverancier}
                onChange={(e) => setLeverancier(e.target.value)}
                placeholder="Naam leverancier"
                className="mt-1"
              />
            )}
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

interface VerzendDialoogProps {
  bon: Inkoopbon;
  opdrachtId: number;
  open: boolean;
  onClose: () => void;
  defaultEmail?: string;
}

function VerzendDialoog({ bon, opdrachtId, open, onClose, defaultEmail }: VerzendDialoogProps) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [bericht, setBericht] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const verzendMutatie = useVerzendInkoopbon({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInkoopbonnenQueryKey(opdrachtId) });
        toast({ title: "Inkoopbon verzonden", description: `Verstuurd naar ${email}` });
        onClose();
      },
      onError: () => toast({ title: "Verzenden mislukt", variant: "destructive" }),
    },
  });

  function verstuur() {
    if (!email.trim()) {
      toast({ title: "E-mailadres verplicht", variant: "destructive" }); return;
    }
    verzendMutatie.mutate({
      id: opdrachtId,
      bonId: bon.id,
      data: { email: email.trim(), bericht: bericht.trim() || undefined },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Mail className="h-4 w-4 inline mr-2 text-primary" />
            Inkoopbon verzenden
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted/30 rounded-md p-3 text-sm">
            <p className="font-medium">{bon.leverancier}</p>
            {bon.bon_nummer && <p className="text-xs text-muted-foreground">{bon.bon_nummer}</p>}
            {bon.totaal_bedrag != null && (
              <p className="text-xs text-muted-foreground">Totaal: {euro(bon.totaal_bedrag)}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">E-mailadres leverancier</label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="inkoop@leverancier.nl"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">
              Aanvullend bericht <span className="text-muted-foreground font-normal">(optioneel)</span>
            </label>
            <Textarea
              value={bericht}
              onChange={e => setBericht(e.target.value)}
              placeholder="Bijzonderheden, afspraken of toelichting..."
              className="mt-1 min-h-[80px]"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            De inkoopbon wordt als e-mail met artikeloverzicht verstuurd. Na verzenden wordt de status naar
            <strong> Besteld</strong> gezet.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={verstuur} disabled={verzendMutatie.isPending}>
            <Send className="h-4 w-4" />
            {verzendMutatie.isPending ? "Verzenden..." : "Versturen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AiSuggestieDialoogProps {
  opdrachtId: number;
  suggesties: InkoopbonAiSuggestieResultaat;
  open: boolean;
  onClose: () => void;
}

function AiSuggestieDialoog({ opdrachtId, suggesties, open, onClose }: AiSuggestieDialoogProps) {
  const [geaccepteerd, setGeaccepteerd] = useState<number[]>([]);
  const { toast } = useToast();
  const qc = useQueryClient();

  const createMutatie = useCreateInkoopbon({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInkoopbonnenQueryKey(opdrachtId) });
      },
      onError: () => toast({ title: "Aanmaken mislukt", variant: "destructive" }),
    },
  });

  async function accepteer() {
    const indices = suggesties.bonnen.map((_, i) => i).filter(i => !geaccepteerd.includes(i) || geaccepteerd.includes(i));
    const teAccepteren = suggesties.bonnen.filter((_, i) => geaccepteerd.includes(i));
    if (teAccepteren.length === 0) {
      toast({ title: "Geen bonnen geselecteerd", variant: "destructive" }); return;
    }
    for (const bon of teAccepteren) {
      createMutatie.mutate({
        id: opdrachtId,
        data: {
          leverancier: bon.leverancier,
          gewenste_leverdatum: bon.gewenste_leverdatum ?? undefined,
          regels: bon.regels.map(r => ({
            inkoopplan_regel_id: r.inkoopplan_regel_id ?? undefined,
            omschrijving: r.omschrijving,
            hoeveelheid: r.hoeveelheid,
            eenheid: r.eenheid,
            prijs: r.prijs ?? undefined,
          })),
        },
      });
    }
    void indices;
    toast({ title: `${teAccepteren.length} inkoopbo${teAccepteren.length === 1 ? "n" : "nnen"} aangemaakt` });
    onClose();
  }

  function toggleBon(i: number) {
    setGeaccepteerd(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <Bot className="h-4 w-4 inline mr-2 text-amber-600" />
            AI-voorstel inkoopbonnen
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          AI heeft de inkoopplanregels gegroepeerd per leverancier. Selecteer de bonnen die u wilt aanmaken.
        </p>
        <div className="space-y-3">
          {suggesties.bonnen.map((bon, i) => (
            <div
              key={i}
              className={`border rounded-md p-3 cursor-pointer transition-colors ${
                geaccepteerd.includes(i)
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-muted hover:border-muted-foreground/40"
              }`}
              onClick={() => toggleBon(i)}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={geaccepteerd.includes(i)}
                  onChange={() => toggleBon(i)}
                  onClick={e => e.stopPropagation()}
                  className="rounded"
                />
                <span className="font-medium text-sm">{bon.leverancier}</span>
                {bon.gewenste_leverdatum && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    Leverdatum: {new Date(bon.gewenste_leverdatum).toLocaleDateString("nl-NL")}
                  </span>
                )}
              </div>
              {bon.ai_motivatie && (
                <p className="text-xs text-amber-700 mt-1 ml-6">
                  <Sparkles className="h-3 w-3 inline mr-1" />
                  {bon.ai_motivatie}
                </p>
              )}
              <div className="mt-2 ml-6 space-y-1">
                {bon.regels.map((r, j) => (
                  <div key={j} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{r.omschrijving}</span>
                    <span className="tabular-nums">
                      {r.hoeveelheid} {r.eenheid}
                      {r.prijs != null && ` — ${euro(r.prijs)}/st`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button
            onClick={accepteer}
            disabled={geaccepteerd.length === 0 || createMutatie.isPending}
          >
            <Check className="h-4 w-4" />
            {geaccepteerd.length > 0
              ? `${geaccepteerd.length} bon${geaccepteerd.length === 1 ? "" : "nen"} aanmaken`
              : "Selecteer bonnen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface InkoopbonKaartProps {
  bon: Inkoopbon;
  opdrachtId: number;
  leverancierEmail?: string | null;
}

function OntvangstDialog({
  open, onClose, bon, opdrachtId,
}: {
  open: boolean;
  onClose: () => void;
  bon: Inkoopbon;
  opdrachtId: number;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: artikelen } = useListArtikelen({});

  type RegelOntvangst = { ontvangen: string; artikel_id: string };
  const [regels, setRegels] = useState<RegelOntvangst[]>(
    () => (bon.regels ?? []).map((r) => ({ ontvangen: String(r.hoeveelheid), artikel_id: "" }))
  );

  const patchMutatie = usePatchInkoopbon({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInkoopbonnenQueryKey(opdrachtId) });
        toast({ title: "Inkoopbon gemarkeerd als geleverd" });
        onClose();
      },
      onError: () => toast({ title: "Bijwerken mislukt", variant: "destructive" }),
    },
  });
  const correctieMutatie = useCorrectieVoorraad();

  async function bevestig() {
    const bonRegels = bon.regels ?? [];
    for (let i = 0; i < bonRegels.length; i++) {
      const artikelId = parseInt(regels[i]?.artikel_id ?? "");
      const delta = parseFloat(regels[i]?.ontvangen ?? "0");
      if (artikelId > 0 && delta > 0) {
        await correctieMutatie.mutateAsync({
          data: {
            artikel_id: artikelId,
            delta,
            type: "ontvangst_inkoop",
            omschrijving: `Ontvangst inkoop: ${bon.bon_nummer ?? bon.leverancier} — ${bonRegels[i].omschrijving}`,
          },
        });
      }
    }
    patchMutatie.mutate({ id: opdrachtId, bonId: bon.id, data: { status: "geleverd" } });
  }

  const bezig = patchMutatie.isPending || correctieMutatie.isPending;
  const bonRegels = bon.regels ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ontvangst registreren</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-sm text-muted-foreground">
            Controleer de ontvangen hoeveelheden. Koppel optioneel een magazijnartikel om de voorraad automatisch bij te werken.
          </p>
          {bonRegels.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Geen regels op deze inkoopbon.</p>
          ) : (
            <div className="space-y-3">
              {bonRegels.map((regel, i) => (
                <div key={regel.id} className="border rounded-md p-3 space-y-2">
                  <div className="font-medium text-sm">{regel.omschrijving}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Ontvangen ({regel.eenheid})</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.001"
                        value={regels[i]?.ontvangen ?? ""}
                        onChange={(e) => setRegels((prev) => prev.map((r, j) => j === i ? { ...r, ontvangen: e.target.value } : r))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Magazijnartikel (optioneel)</Label>
                      <Select
                        value={regels[i]?.artikel_id ?? ""}
                        onValueChange={(v) => setRegels((prev) => prev.map((r, j) => j === i ? { ...r, artikel_id: v } : r))}
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="Kies artikel..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Niet koppelen</SelectItem>
                          {(artikelen ?? []).map((a) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              {a.naam}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={bezig}>Annuleren</Button>
          <Button onClick={bevestig} disabled={bezig}>
            <Warehouse className="h-4 w-4 mr-1" />
            {bezig ? "Bezig..." : "Bevestigen als geleverd"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InkoopbonKaart({ bon, opdrachtId, leverancierEmail }: InkoopbonKaartProps) {
  const [verzendOpen, setVerzendOpen] = useState(false);
  const [ontvangenOpen, setOntvangenOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const statusInfo = BON_STATUS_LABELS[bon.status] ?? BON_STATUS_LABELS.concept;

  const terGoedkeuringIndienen = useTerGoedkeuringIndienenInkoopbon({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInkoopbonnenQueryKey(opdrachtId) });
        toast({ title: "Ter goedkeuring ingediend" });
      },
      onError: () => toast({ title: "Indienen mislukt", variant: "destructive" }),
    },
  });

  const patchMutatie = usePatchInkoopbon({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInkoopbonnenQueryKey(opdrachtId) });
        toast({ title: "Inkoopbon bijgewerkt" });
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 422) {
          toast({
            title: "Formele goedkeuring vereist",
            description: "Volgens het geldende goedkeuringsbeleid moet deze inkoopbon eerst ter goedkeuring worden ingediend.",
            action: (
              <ToastAction
                altText="Ter goedkeuring indienen"
                onClick={() =>
                  terGoedkeuringIndienen.mutate({ id: opdrachtId, bonId: bon.id })
                }
              >
                Indienen
              </ToastAction>
            ),
          });
        } else {
          toast({ title: "Bijwerken mislukt", variant: "destructive" });
        }
      },
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

  const isVerzonden = bon.verzonden_op != null;
  const kanVerzenden = bon.status === "concept" || bon.status === "goedgekeurd" || bon.status === "besteld";

  return (
    <>
      <Card>
        <CardHeader className="pb-2 pt-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-sm">{bon.leverancier}</CardTitle>
                {bon.bon_nummer && <span className="text-xs text-muted-foreground">{bon.bon_nummer}</span>}
                {bon.ai_suggestie && (
                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-800 border-amber-200">
                    <Bot className="h-2.5 w-2.5 mr-1" />
                    AI
                  </Badge>
                )}
                {isVerzonden && (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-800 border-blue-200">
                    <Mail className="h-2.5 w-2.5 mr-1" />
                    Verzonden
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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
              <div className="mt-1">
                <GoedkeuringWidget
                  objectType="inkoopbon"
                  objectId={bon.id}
                  documentType="inkoopbon"
                  bedrag={bon.totaal_bedrag}
                  omschrijving={`Inkoopbon${bon.bon_nummer ? ` ${bon.bon_nummer}` : ""} — ${bon.leverancier}`}
                  toonIndienKnop={bon.status === "concept"}
                />
              </div>
              {isVerzonden && bon.verzonden_naar && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Verstuurd naar {bon.verzonden_naar}
                  {bon.verzonden_op && ` op ${new Date(bon.verzonden_op).toLocaleDateString("nl-NL")}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap justify-end">
              {kanVerzenden && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setVerzendOpen(true)}
                >
                  <Mail className="h-3 w-3" />
                  {isVerzonden ? "Opnieuw verzenden" : "Verzenden"}
                </Button>
              )}
              {volgendeStatus[bon.status] && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={patchMutatie.isPending}
                  onClick={() => {
                    if (bon.status === "besteld") {
                      setOntvangenOpen(true);
                    } else {
                      patchMutatie.mutate({ id: opdrachtId, bonId: bon.id, data: { status: volgendeStatus[bon.status] } });
                    }
                  }}
                >
                  {bon.status === "besteld" ? <Warehouse className="h-3 w-3" /> : <Check className="h-3 w-3" />}
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
        {bon.ai_motivatie && (
          <CardContent className="pb-2 pt-0">
            <div className="bg-amber-50 border border-amber-200 rounded-md p-2 text-xs text-amber-800">
              <Sparkles className="h-3 w-3 inline mr-1" />
              {bon.ai_motivatie}
            </div>
          </CardContent>
        )}
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

      {verzendOpen && (
        <VerzendDialoog
          bon={bon}
          opdrachtId={opdrachtId}
          open={verzendOpen}
          onClose={() => setVerzendOpen(false)}
          defaultEmail={leverancierEmail ?? bon.verzonden_naar ?? ""}
        />
      )}
      {ontvangenOpen && (
        <OntvangstDialog
          open={ontvangenOpen}
          onClose={() => setOntvangenOpen(false)}
          bon={bon}
          opdrachtId={opdrachtId}
        />
      )}
    </>
  );
}

interface InkoopplanningTabProps {
  opdrachtId: number;
}

interface VrijeRegelFormState {
  omschrijving: string;
  hoeveelheid: string;
  eenheid: string;
  leverancier: string;
  inkoopprijs: string;
}

function VrijeRegelDialoog({ open, onClose, opdrachtId }: { open: boolean; onClose: () => void; opdrachtId: number }) {
  const [form, setForm] = useState<VrijeRegelFormState>({ omschrijving: "", hoeveelheid: "1", eenheid: "st", leverancier: "", inkoopprijs: "" });
  const { toast } = useToast();
  const qc = useQueryClient();

  const maakAan = useCreateInkoopplanRegel({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetInkoopplanningQueryKey(opdrachtId) });
        toast({ title: "Regel toegevoegd" });
        onClose();
      },
      onError: () => toast({ title: "Toevoegen mislukt", variant: "destructive" }),
    },
  });

  function set(k: keyof VrijeRegelFormState, v: string) { setForm(prev => ({ ...prev, [k]: v })); }

  function bewaar() {
    if (!form.omschrijving.trim()) return;
    maakAan.mutate({
      id: opdrachtId,
      data: {
        omschrijving: form.omschrijving.trim(),
        hoeveelheid: form.hoeveelheid ? parseFloat(form.hoeveelheid) : 1,
        eenheid: form.eenheid || "st",
        leverancier: form.leverancier || undefined,
        inkoopprijs: form.inkoopprijs ? parseFloat(form.inkoopprijs) : undefined,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Materiaalregel handmatig toevoegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Omschrijving *</label>
            <Input placeholder="Bijv. Brandwerend kit 750ml" value={form.omschrijving} onChange={e => set("omschrijving", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Hoeveelheid</label>
              <Input type="number" min={0} step="0.01" value={form.hoeveelheid} onChange={e => set("hoeveelheid", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Eenheid</label>
              <Input placeholder="st, m, m2..." value={form.eenheid} onChange={e => set("eenheid", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Leverancier</label>
            <Input placeholder="Optioneel" value={form.leverancier} onChange={e => set("leverancier", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Inkoopprijs (excl. BTW)</label>
            <Input type="number" min={0} step="0.01" placeholder="0,00" value={form.inkoopprijs} onChange={e => set("inkoopprijs", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={bewaar} disabled={!form.omschrijving.trim() || maakAan.isPending}>
            {maakAan.isPending ? "Toevoegen..." : "Toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InkoopplanningTab({ opdrachtId }: InkoopplanningTabProps) {
  const [bonDialoog, setBonDialoog] = useState(false);
  const [aiDialoogOpen, setAiDialoogOpen] = useState(false);
  const [aiSuggesties, setAiSuggesties] = useState<InkoopbonAiSuggestieResultaat | null>(null);
  const [handmatigOpen, setHandmatigOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: plan, isLoading, error } = useGetInkoopplanning(opdrachtId);
  const { data: bonnen } = useListInkoopbonnen(opdrachtId);
  const { data: leveranciersList = [] } = useListLeveranciers();

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

  const aiSuggestiesMutatie = useGenereerInkoopbonAiSuggesties({
    mutation: {
      onSuccess: (data) => {
        if (!data.bonnen || data.bonnen.length === 0) {
          toast({ title: "Geen suggesties beschikbaar", description: "Zorg dat de inkoopplanning regels bevat met een open status." });
          return;
        }
        setAiSuggesties(data);
        setAiDialoogOpen(true);
      },
      onError: () => toast({ title: "AI-suggesties mislukt", variant: "destructive" }),
    },
  });

  const isGereed = plan?.status === "gereed";

  const regels = plan?.regels ?? [];
  const langeLevering = regels.filter(r => r.type === "maatwerk" || (r.levertijd_weken ?? 0) >= 4);
  const totaalBesparing = plan?.totale_besparing ?? regels.reduce((a, r) => a + (r.besparing ?? 0), 0);

  function getLeverancierEmail(bon: Inkoopbon): string | null {
    if (!bon.leverancier_id) return null;
    const lev = leveranciersList.find(l => l.id === bon.leverancier_id);
    return lev?.email ?? null;
  }

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
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHandmatigOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Handmatig toevoegen
          </Button>
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

      {plan.ai_samenvatting && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900">
          <Sparkles className="h-4 w-4 inline mr-1.5 text-amber-600" />
          {plan.ai_samenvatting}
        </div>
      )}

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

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Inkoopbonnen</h3>
            {(bonnen ?? []).length > 0 && (
              <Badge variant="outline" className="text-xs">{(bonnen ?? []).length}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => aiSuggestiesMutatie.mutate({ id: opdrachtId })}
              disabled={aiSuggestiesMutatie.isPending}
            >
              <Bot className="h-3.5 w-3.5" />
              {aiSuggestiesMutatie.isPending ? "Analyseren..." : "AI-voorstel"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBonDialoog(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Nieuwe bon
            </Button>
          </div>
        </div>

        {(bonnen ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center space-y-2">
              <Truck className="h-6 w-6 mx-auto mb-2 opacity-30" />
              <p className="text-sm text-muted-foreground">Nog geen inkoopbonnen aangemaakt.</p>
              <p className="text-xs text-muted-foreground">
                Gebruik <strong>AI-voorstel</strong> om automatisch bonnen per leverancier te laten voorstellen,
                of maak handmatig een nieuwe bon aan.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {(bonnen ?? []).map(bon => (
              <InkoopbonKaart
                key={bon.id}
                bon={bon}
                opdrachtId={opdrachtId}
                leverancierEmail={getLeverancierEmail(bon)}
              />
            ))}
          </div>
        )}
      </div>

      <VrijeRegelDialoog
        open={handmatigOpen}
        onClose={() => setHandmatigOpen(false)}
        opdrachtId={opdrachtId}
      />

      <NieuweInkoopbonDialoog
        opdrachtId={opdrachtId}
        planId={plan.id}
        regels={regels}
        open={bonDialoog}
        onClose={() => setBonDialoog(false)}
      />

      {aiSuggesties && (
        <AiSuggestieDialoog
          opdrachtId={opdrachtId}
          suggesties={aiSuggesties}
          open={aiDialoogOpen}
          onClose={() => {
            setAiDialoogOpen(false);
            setAiSuggesties(null);
          }}
        />
      )}
    </div>
  );
}

// Onderaanneming tab — onderaannemer-orders per opdracht
import { useState } from "react";
import {
  useListOnderaannemeOrders,
  useCreateOnderaannemeOrder,
  usePatchOnderaannemeOrder,
  useDeleteOnderaannemeOrder,
  getListOnderaannemeOrdersQueryKey,
} from "@workspace/api-client-react";
import type { OnderaannemerOrder } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Building2, User, Calendar, Euro } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

function euro(n: number | null | undefined) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n ?? 0);
}

function formDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("nl-NL");
}

const STATUS_CONFIG: Record<string, { label: string; kleur: string }> = {
  concept:     { label: "Concept",     kleur: "bg-amber-50 text-amber-800 border-amber-200" },
  uitbesteed:  { label: "Uitbesteed",  kleur: "bg-blue-50 text-blue-800 border-blue-200" },
  uitgevoerd:  { label: "Uitgevoerd",  kleur: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  betaald:     { label: "Betaald",     kleur: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  geannuleerd: { label: "Geannuleerd", kleur: "bg-rose-50 text-rose-800 border-rose-200" },
};

interface OrderFormState {
  omschrijving: string;
  bedrijf: string;
  contactpersoon: string;
  werkzaamheden: string;
  bedrag_excl_btw: string;
  btw_percentage: string;
  gewenste_startdatum: string;
  gewenste_einddatum: string;
  opmerkingen: string;
}

const leegForm = (): OrderFormState => ({
  omschrijving: "",
  bedrijf: "",
  contactpersoon: "",
  werkzaamheden: "",
  bedrag_excl_btw: "",
  btw_percentage: "21",
  gewenste_startdatum: "",
  gewenste_einddatum: "",
  opmerkingen: "",
});

interface OrderDialoogProps {
  open: boolean;
  onClose: () => void;
  opdrachtId: number;
  bewerken?: OnderaannemerOrder;
}

function OrderDialoog({ open, onClose, opdrachtId, bewerken }: OrderDialoogProps) {
  const [form, setForm] = useState<OrderFormState>(() =>
    bewerken ? {
      omschrijving: bewerken.omschrijving,
      bedrijf: bewerken.bedrijf ?? "",
      contactpersoon: bewerken.contactpersoon ?? "",
      werkzaamheden: bewerken.werkzaamheden ?? "",
      bedrag_excl_btw: bewerken.bedrag_excl_btw != null ? String(bewerken.bedrag_excl_btw) : "",
      btw_percentage: String(bewerken.btw_percentage),
      gewenste_startdatum: bewerken.gewenste_startdatum ?? "",
      gewenste_einddatum: bewerken.gewenste_einddatum ?? "",
      opmerkingen: bewerken.opmerkingen ?? "",
    } : leegForm()
  );
  const { toast } = useToast();
  const qc = useQueryClient();

  const onSuccessHandler = () => {
    qc.invalidateQueries({ queryKey: getListOnderaannemeOrdersQueryKey(opdrachtId) });
    toast({ title: bewerken ? "Order bijgewerkt" : "Order aangemaakt" });
    onClose();
  };
  const onErrorHandler = () => toast({ title: "Opslaan mislukt", variant: "destructive" });

  const createMutatie = useCreateOnderaannemeOrder({
    mutation: { onSuccess: onSuccessHandler, onError: onErrorHandler },
  });
  const patchMutatie = usePatchOnderaannemeOrder({
    mutation: { onSuccess: onSuccessHandler, onError: onErrorHandler },
  });

  function set(k: keyof OrderFormState, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function bewaar() {
    if (!form.omschrijving.trim()) return;
    const payload = {
      omschrijving: form.omschrijving.trim(),
      bedrijf: form.bedrijf || undefined,
      contactpersoon: form.contactpersoon || undefined,
      werkzaamheden: form.werkzaamheden || undefined,
      bedrag_excl_btw: form.bedrag_excl_btw ? parseFloat(form.bedrag_excl_btw) : undefined,
      btw_percentage: parseFloat(form.btw_percentage) || 21,
      gewenste_startdatum: form.gewenste_startdatum || undefined,
      gewenste_einddatum: form.gewenste_einddatum || undefined,
      opmerkingen: form.opmerkingen || undefined,
    };
    if (bewerken) {
      patchMutatie.mutate({ id: opdrachtId, orderId: bewerken.id, data: payload });
    } else {
      createMutatie.mutate({ id: opdrachtId, data: payload });
    }
  }

  const isPending = createMutatie.isPending || patchMutatie.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bewerken ? "Order bewerken" : "Onderaannemer order aanmaken"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Omschrijving *</label>
            <Input
              placeholder="Bijv. Branddeuren plaatsen bouwlaag 1-3"
              value={form.omschrijving}
              onChange={e => set("omschrijving", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Bedrijf</label>
              <Input
                placeholder="Naam onderaannemer"
                value={form.bedrijf}
                onChange={e => set("bedrijf", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Contactpersoon</label>
              <Input
                placeholder="Naam contactpersoon"
                value={form.contactpersoon}
                onChange={e => set("contactpersoon", e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Werkzaamheden</label>
            <Textarea
              placeholder="Omschrijf de uit te besteden werkzaamheden..."
              rows={3}
              value={form.werkzaamheden}
              onChange={e => set("werkzaamheden", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Bedrag excl. BTW</label>
              <Input
                type="number"
                placeholder="0,00"
                min={0}
                step={0.01}
                value={form.bedrag_excl_btw}
                onChange={e => set("bedrag_excl_btw", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">BTW %</label>
              <Select value={form.btw_percentage} onValueChange={v => set("btw_percentage", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0%</SelectItem>
                  <SelectItem value="9">9%</SelectItem>
                  <SelectItem value="21">21%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Gewenste startdatum</label>
              <Input
                type="date"
                value={form.gewenste_startdatum}
                onChange={e => set("gewenste_startdatum", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Gewenste einddatum</label>
              <Input
                type="date"
                value={form.gewenste_einddatum}
                onChange={e => set("gewenste_einddatum", e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Opmerkingen</label>
            <Textarea
              placeholder="Interne opmerkingen..."
              rows={2}
              value={form.opmerkingen}
              onChange={e => set("opmerkingen", e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={bewaar} disabled={!form.omschrijving.trim() || isPending}>
            {isPending ? "Opslaan..." : (bewerken ? "Bijwerken" : "Aanmaken")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface OrderKaartProps {
  order: OnderaannemerOrder;
  opdrachtId: number;
}

function OrderKaart({ order, opdrachtId }: OrderKaartProps) {
  const [bewerkOpen, setBewerkOpen] = useState(false);
  const [verwijderOpen, setVerwijderOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const patchMutatie = usePatchOnderaannemeOrder({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListOnderaannemeOrdersQueryKey(opdrachtId) });
      },
      onError: () => toast({ title: "Status wijzigen mislukt", variant: "destructive" }),
    },
  });

  const deleteMutatie = useDeleteOnderaannemeOrder({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListOnderaannemeOrdersQueryKey(opdrachtId) });
        toast({ title: "Order verwijderd" });
      },
      onError: () => toast({ title: "Verwijderen mislukt", variant: "destructive" }),
    },
  });

  const statusInfo = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.concept;
  const bedragInclBtw = order.bedrag_excl_btw != null
    ? order.bedrag_excl_btw * (1 + order.btw_percentage / 100)
    : null;

  return (
    <>
      <Card>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-sm font-semibold">{order.omschrijving}</CardTitle>
                <Badge variant="outline" className={`text-xs ${statusInfo.kleur}`}>
                  {statusInfo.label}
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                {order.bedrijf && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {order.bedrijf}
                  </span>
                )}
                {order.contactpersoon && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {order.contactpersoon}
                  </span>
                )}
                {order.bedrag_excl_btw != null && (
                  <span className="flex items-center gap-1">
                    <Euro className="h-3 w-3" />
                    {euro(order.bedrag_excl_btw)} excl. BTW
                    {bedragInclBtw != null && (
                      <span className="text-muted-foreground/60"> ({euro(bedragInclBtw)} incl.)</span>
                    )}
                  </span>
                )}
                {(order.gewenste_startdatum || order.gewenste_einddatum) && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formDate(order.gewenste_startdatum)}
                    {order.gewenste_startdatum && order.gewenste_einddatum && " – "}
                    {formDate(order.gewenste_einddatum)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="icon" variant="ghost"
                className="h-7 w-7"
                onClick={() => setBewerkOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon" variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => setVerwijderOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        {(order.werkzaamheden || order.opmerkingen) && (
          <CardContent className="pb-3 pt-0 space-y-1">
            {order.werkzaamheden && (
              <p className="text-xs text-muted-foreground">{order.werkzaamheden}</p>
            )}
            {order.opmerkingen && (
              <p className="text-xs text-muted-foreground italic">{order.opmerkingen}</p>
            )}
          </CardContent>
        )}
        <CardContent className="pb-3 pt-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Status:</span>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => {
                  if (key !== order.status) {
                    patchMutatie.mutate({ id: opdrachtId, orderId: order.id, data: { status: key } });
                  }
                }}
                className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                  key === order.status
                    ? cfg.kleur + " font-medium"
                    : "bg-transparent text-muted-foreground border-transparent hover:border-muted-foreground/30"
                }`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {bewerkOpen && (
        <OrderDialoog
          open={bewerkOpen}
          onClose={() => setBewerkOpen(false)}
          opdrachtId={opdrachtId}
          bewerken={order}
        />
      )}

      <AlertDialog open={verwijderOpen} onOpenChange={setVerwijderOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Order verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              "{order.omschrijving}" wordt definitief verwijderd. Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMutatie.mutate({ id: opdrachtId, orderId: order.id })}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface OnderaannemeringTabProps {
  opdrachtId: number;
  onNaarMaterialen?: () => void;
}

export default function OnderaannemeringTab({ opdrachtId, onNaarMaterialen }: OnderaannemeringTabProps) {
  const [aanmakenOpen, setAanmakenOpen] = useState(false);
  const { data: orders = [], isLoading } = useListOnderaannemeOrders(opdrachtId);

  const totaalExcl = orders.reduce((a, o) => a + (o.bedrag_excl_btw ?? 0), 0);
  const totaalIncl = orders.reduce((a, o) => {
    const bedrag = o.bedrag_excl_btw ?? 0;
    return a + bedrag * (1 + o.btw_percentage / 100);
  }, 0);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{orders.length} order{orders.length !== 1 ? "s" : ""}</span>
          {orders.length > 0 && (
            <>
              <span>|</span>
              <span>Excl. BTW: <strong>{euro(totaalExcl)}</strong></span>
              <span>Incl. BTW: <strong>{euro(totaalIncl)}</strong></span>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {onNaarMaterialen && (
            <Button size="sm" variant="outline" onClick={onNaarMaterialen}>
              Naar materialen inkoop
            </Button>
          )}
          <Button size="sm" onClick={() => setAanmakenOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Onderaannemer order
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <Building2 className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nog geen onderaannemer-orders.</p>
            <p className="text-xs text-muted-foreground">
              Voeg een order toe om werk uit te besteden aan een onderaannemer.
            </p>
            <Button size="sm" className="mt-2" onClick={() => setAanmakenOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Eerste order aanmaken
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <OrderKaart key={order.id} order={order} opdrachtId={opdrachtId} />
          ))}
        </div>
      )}

      {aanmakenOpen && (
        <OrderDialoog
          open={aanmakenOpen}
          onClose={() => setAanmakenOpen(false)}
          opdrachtId={opdrachtId}
        />
      )}
    </div>
  );
}

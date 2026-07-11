// Governance & Approval Engine — centraal goedkeuringsdashboard.
// Toont alle open, verlopen en recent afgehandelde aanvragen met
// escalatiestatus. Zichtbaar voor iedereen met goedkeuring-bevoegdheid niveau 1.
import { useMemo, useState } from "react";
import {
  useListGoedkeuringDashboard,
  useGoedkeuringAanvraagGoedkeuren,
  useGoedkeuringAanvraagAfwijzen,
  getListGoedkeuringDashboardQueryKey,
} from "@workspace/api-client-react";
import type { GoedkeuringDashboardItem, ListGoedkeuringDashboardParams } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, Bell, ChevronRight, LayoutDashboard,
} from "lucide-react";
import { GOEDKEURING_STATUS_INFO } from "@/components/goedkeuring/goedkeuring-widget";

// ── Label-helpers ──────────────────────────────────────────────────────────────

function euro(bedrag?: number | null) {
  if (bedrag == null) return null;
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(bedrag);
}

function datumKort(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function datumDuur(iso?: string | null) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const uren = Math.floor(ms / 3_600_000);
  if (uren < 24) return `${uren} uur`;
  const dagen = Math.floor(uren / 24);
  return `${dagen} ${dagen === 1 ? "dag" : "dagen"}`;
}

const ESCALATIE_TYPE_INFO: Record<string, { label: string; kleur: string }> = {
  herinnering: { label: "Herinnering", kleur: "bg-amber-100 text-amber-800 border-amber-200" },
  escalatie_1: { label: "Escalatie 1", kleur: "bg-orange-100 text-orange-800 border-orange-200" },
  escalatie_2: { label: "Escalatie 2", kleur: "bg-red-100 text-red-800 border-red-200" },
  max_doorlooptijd: { label: "Max. doorlooptijd", kleur: "bg-destructive/10 text-destructive border-destructive/20" },
};

// ── Statistiekenkaarten ────────────────────────────────────────────────────────

function StatKaarten({ items }: { items: GoedkeuringDashboardItem[] }) {
  const open = items.filter((i) => i.status === "ingediend").length;
  const verlopen = items.filter((i) => i.is_verlopen).length;
  const afgewezen = items.filter((i) => i.status === "afgewezen").length;
  const metEscalatie = items.filter((i) => i.escalaties.length > 0).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { label: "Open aanvragen", waarde: open, icoon: Clock, kleur: "text-blue-600" },
        { label: "Reactietermijn verlopen", waarde: verlopen, icoon: AlertTriangle, kleur: "text-amber-600" },
        { label: "Afgewezen (zichtbaar)", waarde: afgewezen, icoon: XCircle, kleur: "text-destructive" },
        { label: "Met escalatie", waarde: metEscalatie, icoon: Bell, kleur: "text-orange-600" },
      ].map(({ label, waarde, icoon: Icon, kleur }) => (
        <Card key={label}>
          <CardContent className="p-4 flex items-center gap-3">
            <Icon className={`h-7 w-7 shrink-0 ${kleur}`} />
            <div>
              <p className="text-2xl font-bold">{waarde}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Escalatiebadges ────────────────────────────────────────────────────────────

function EscalatieBadges({ item }: { item: GoedkeuringDashboardItem }) {
  if (item.escalaties.length === 0 && !item.is_verlopen) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {item.is_verlopen && (
        <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 border-amber-200">
          <AlertTriangle className="h-3 w-3" />
          Verlopen
        </span>
      )}
      {item.escalaties.map((e) => {
        const info = ESCALATIE_TYPE_INFO[e.type] ?? ESCALATIE_TYPE_INFO.herinnering;
        return (
          <TooltipProvider key={e.id} delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${info.kleur}`}>
                  <Bell className="h-3 w-3" />
                  {info.label}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-xs">
                <p>{e.bericht}</p>
                <p className="mt-1 text-muted-foreground">{datumKort(e.aangemaakt_op)}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

// ── Afwijzen-dialog ────────────────────────────────────────────────────────────

function AfwijzenDialog({
  aanvraag,
  open,
  onClose,
  onBevestig,
  isPending,
}: {
  aanvraag: GoedkeuringDashboardItem | null;
  open: boolean;
  onClose: () => void;
  onBevestig: (reden: string) => void;
  isPending: boolean;
}) {
  const [reden, setReden] = useState("");

  function handleBevestig() {
    onBevestig(reden.trim());
    setReden("");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aanvraag afwijzen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {aanvraag && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">{aanvraag.document_type} #{aanvraag.id}</span>
              {aanvraag.omschrijving ? ` — ${aanvraag.omschrijving}` : ""}
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Reden (optioneel)</Label>
            <Textarea
              value={reden}
              onChange={(e) => setReden(e.target.value)}
              placeholder="Motiveer de afwijzing..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button
            variant="destructive"
            onClick={handleBevestig}
            disabled={isPending}
          >
            {isPending ? "Bezig..." : "Afwijzen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Hoofdpagina ────────────────────────────────────────────────────────────────

export default function GoedkeuringenDashboard() {
  const { heeftNiveau } = useBevoegdheid();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [alleenVerlopen, setAlleenVerlopen] = useState(false);
  const [venster, setVenster] = useState<string>("7");
  const [afwijzenAanvraag, setAfwijzenAanvraag] = useState<GoedkeuringDashboardItem | null>(null);

  const magGoedkeuren = heeftNiveau("goedkeuring", 3);

  const params = useMemo((): ListGoedkeuringDashboardParams | undefined => {
    const p: ListGoedkeuringDashboardParams = {};
    if (statusFilter !== "alle") {
      p.status = statusFilter as ListGoedkeuringDashboardParams["status"];
    }
    if (alleenVerlopen) {
      p.alleen_verlopen = "true" as ListGoedkeuringDashboardParams["alleen_verlopen"];
    }
    // Stuur venster alleen mee als er geen expliciete statusfilter is
    // (backend negeert venster toch al bij expliciete status).
    if (statusFilter === "alle" && venster !== "7") {
      p.venster = parseInt(venster, 10);
    }
    return Object.keys(p).length > 0 ? p : undefined;
  }, [statusFilter, alleenVerlopen, venster]);

  const { data: items, isLoading } = useListGoedkeuringDashboard(params, {
    query: { queryKey: getListGoedkeuringDashboardQueryKey(params) },
  });

  function verversen() {
    qc.invalidateQueries({ queryKey: getListGoedkeuringDashboardQueryKey() });
  }

  const goedkeurenMutation = useGoedkeuringAanvraagGoedkeuren({
    mutation: {
      onSuccess: () => { verversen(); toast({ title: "Aanvraag goedgekeurd" }); },
      onError: () => toast({ title: "Goedkeuren mislukt", variant: "destructive" }),
    },
  });

  const afwijzenMutation = useGoedkeuringAanvraagAfwijzen({
    mutation: {
      onSuccess: () => {
        verversen();
        toast({ title: "Aanvraag afgewezen" });
        setAfwijzenAanvraag(null);
      },
      onError: () => toast({ title: "Afwijzen mislukt", variant: "destructive" }),
    },
  });

  if (!heeftNiveau("goedkeuring", 1)) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        U heeft geen toegang tot het goedkeuringsdashboard.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <LayoutDashboard className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Goedkeuringen — dashboard</h1>
      </div>

      {/* Statistieken */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (
        <StatKaarten items={items ?? []} />
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); }}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle (open + afgehandeld)</SelectItem>
            <SelectItem value="ingediend">Open — wacht op beslissing</SelectItem>
            <SelectItem value="goedgekeurd">Goedgekeurd — volledig archief</SelectItem>
            <SelectItem value="afgewezen">Afgewezen — volledig archief</SelectItem>
            <SelectItem value="ingetrokken">Ingetrokken</SelectItem>
          </SelectContent>
        </Select>
        {statusFilter === "alle" && (
          <Select value={venster} onValueChange={setVenster}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Afgehandeld: laatste 7 dagen</SelectItem>
              <SelectItem value="30">Afgehandeld: laatste 30 dagen</SelectItem>
              <SelectItem value="90">Afgehandeld: laatste 90 dagen</SelectItem>
              <SelectItem value="0">Afgehandeld: volledig archief</SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2">
          <Switch
            id="alleen-verlopen"
            checked={alleenVerlopen}
            onCheckedChange={setAlleenVerlopen}
          />
          <Label htmlFor="alleen-verlopen" className="text-sm cursor-pointer">
            Alleen verlopen reactietermijn
          </Label>
        </div>
      </div>

      {/* Tabel */}
      {isLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {(items ?? []).length} {(items ?? []).length === 1 ? "aanvraag" : "aanvragen"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Documenttype</TableHead>
                  <TableHead>Omschrijving</TableHead>
                  <TableHead>Bedrag</TableHead>
                  <TableHead>Ingediend door</TableHead>
                  <TableHead>Ingediend op</TableHead>
                  <TableHead>Openstaand</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Escalatie / bewaking</TableHead>
                  {magGoedkeuren && <TableHead className="w-36" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(items ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={magGoedkeuren ? 10 : 9} className="text-center text-sm text-muted-foreground py-8">
                      Geen aanvragen gevonden.
                    </TableCell>
                  </TableRow>
                )}
                {(items ?? []).map((item) => {
                  const info = GOEDKEURING_STATUS_INFO[item.status] ?? GOEDKEURING_STATUS_INFO.ingediend;
                  const StatusIcoon = info.icon;
                  return (
                    <TableRow key={item.id} className={item.is_verlopen ? "bg-amber-50/50" : undefined}>
                      <TableCell className="font-mono text-xs text-muted-foreground">#{item.id}</TableCell>
                      <TableCell className="font-medium">{item.document_type}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                        {item.omschrijving ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {euro(item.bedrag) ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">{item.ingediend_door_naam ?? "—"}</TableCell>
                      <TableCell className="text-sm">{datumKort(item.ingediend_op)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.status === "ingediend" ? datumDuur(item.ingediend_op) : "—"}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1">
                          <StatusIcoon className={`h-3.5 w-3.5 ${info.kleur}`} />
                          <span className="text-xs">{info.label}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <EscalatieBadges item={item} />
                      </TableCell>
                      {magGoedkeuren && (
                        <TableCell>
                          {item.status === "ingediend" && item.mag_goedkeuren && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-green-700 hover:text-green-800 hover:bg-green-50"
                                disabled={goedkeurenMutation.isPending}
                                onClick={() => goedkeurenMutation.mutate({ id: item.id, data: {} })}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Goedkeuren
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setAfwijzenAanvraag(item)}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Afwijzen
                              </Button>
                            </div>
                          )}
                          {item.status === "ingediend" && !item.mag_goedkeuren && (
                            <span className="text-xs text-muted-foreground">Wacht op andere goedkeurder</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Afwijzen-dialog */}
      <AfwijzenDialog
        aanvraag={afwijzenAanvraag}
        open={afwijzenAanvraag !== null}
        onClose={() => setAfwijzenAanvraag(null)}
        onBevestig={(reden) =>
          afwijzenAanvraag &&
          afwijzenMutation.mutate({ id: afwijzenAanvraag.id, data: { reden: reden || "" } })
        }
        isPending={afwijzenMutation.isPending}
      />
    </div>
  );
}

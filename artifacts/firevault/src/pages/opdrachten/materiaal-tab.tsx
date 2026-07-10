// Materiaal-tab — reserveringen + uitgiftes per opdracht, uitgifte/retour registreren
import { useState } from "react";
import {
  useGetOpdrachtMateriaal,
  useCreateUitgifte,
  useCreateRetour,
  useAnnuleerReservering,
  useListVoorraadTotaal,
  getGetOpdrachtMateriaalQueryKey,
} from "@workspace/api-client-react";
import type { OpdrachtMateriaalRegel } from "@workspace/api-client-react";
import { ArtikelPicker } from "@/components/artikel-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Package, ArrowDownToLine, ArrowUpFromLine, X, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { cn } from "@/lib/utils";

function euro(n: number | null | undefined) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n ?? 0);
}

function datumKort(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

const RESERVERING_STATUS: Record<string, { label: string; kleur: string }> = {
  open:        { label: "Open",        kleur: "bg-blue-50 text-blue-700 border-blue-200" },
  gedeeltelijk: { label: "Gedeeltelijk", kleur: "bg-amber-50 text-amber-700 border-amber-200" },
  volledig:    { label: "Volledig",    kleur: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  geannuleerd: { label: "Geannuleerd", kleur: "bg-slate-100 text-slate-500 border-slate-200" },
};

const UITGIFTE_TYPE: Record<string, { label: string; kleur: string }> = {
  uitgifte: { label: "Uitgifte", kleur: "bg-rose-50 text-rose-700 border-rose-200" },
  retour:   { label: "Retour",   kleur: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

// ── Uitgifte dialoog ────────────────────────────────────────────────────────

interface UitgifteDialoogProps {
  opdrachtId: number;
  openReserveringen: OpdrachtMateriaalRegel[];
  open: boolean;
  onClose: () => void;
}

function UitgifteDialoog({ opdrachtId, openReserveringen, open, onClose }: UitgifteDialoogProps) {
  const [modus, setModus] = useState<"via_reservering" | "direct">("via_reservering");
  const [reserveringId, setReserveringId] = useState("");
  const [artikelId, setArtikelId] = useState<number | null>(null);
  const [artikelEenheid, setArtikelEenheid] = useState("st");
  const [hoeveelheid, setHoeveelheid] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: voorraadTotaal = [] } = useListVoorraadTotaal();

  const gekozenReservering = openReserveringen.find(r => r.reservering_id === Number(reserveringId));
  const vrijeVoorraadDirect = artikelId != null ? voorraadTotaal.find(v => v.artikel_id === artikelId)?.vrij ?? 0 : null;

  const mutatie = useCreateUitgifte({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetOpdrachtMateriaalQueryKey(opdrachtId) });
        toast({ title: "Uitgifte geregistreerd" });
        reset();
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Uitgifte mislukt";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  function reset() {
    setModus("via_reservering");
    setReserveringId("");
    setArtikelId(null);
    setArtikelEenheid("st");
    setHoeveelheid("");
  }

  const verplichtOpdrachtGekozen = !!opdrachtId;

  function verstuur() {
    const h = parseFloat(hoeveelheid);
    if (!h || h <= 0) { toast({ title: "Voer een geldige hoeveelheid in", variant: "destructive" }); return; }
    if (!opdrachtId) { toast({ title: "Opdracht is verplicht", variant: "destructive" }); return; }

    if (modus === "via_reservering") {
      if (!reserveringId) { toast({ title: "Kies een reservering", variant: "destructive" }); return; }
      mutatie.mutate({
        data: {
          opdracht_id: opdrachtId,
          regels: [{ artikel_id: gekozenReservering!.artikel_id, hoeveelheid: h, reservering_id: Number(reserveringId) }],
        },
      });
    } else {
      if (!artikelId) { toast({ title: "Kies een artikel", variant: "destructive" }); return; }
      if (vrijeVoorraadDirect != null && h > vrijeVoorraadDirect) {
        toast({ title: `Onvoldoende vrije voorraad (${vrijeVoorraadDirect} ${artikelEenheid} beschikbaar)`, variant: "destructive" });
        return;
      }
      mutatie.mutate({
        data: {
          opdracht_id: opdrachtId,
          regels: [{ artikel_id: artikelId, hoeveelheid: h }],
        },
      });
    }
  }

  const heeftOpenReserveringen = openReserveringen.length > 0;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Uitgifte registreren</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {heeftOpenReserveringen && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={modus === "via_reservering" ? "default" : "outline"}
                onClick={() => setModus("via_reservering")}
              >
                Via reservering
              </Button>
              <Button
                size="sm"
                variant={modus === "direct" ? "default" : "outline"}
                onClick={() => setModus("direct")}
              >
                Direct
              </Button>
            </div>
          )}

          {modus === "via_reservering" && heeftOpenReserveringen ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Reservering</Label>
                <Select value={reserveringId} onValueChange={setReserveringId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kies reservering..." />
                  </SelectTrigger>
                  <SelectContent>
                    {openReserveringen.map(r => (
                      <SelectItem key={r.id} value={String(r.reservering_id ?? r.id)}>
                        {r.artikel_naam ?? `Artikel ${r.artikel_id}`} — {r.hoeveelheid} {r.eenheid} (Vrij: {r.vrij_voorraad ?? 0})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {gekozenReservering && (
                <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
                  Beschikbaar: {gekozenReservering.hoeveelheid} {gekozenReservering.eenheid}
                  {gekozenReservering.inkoopprijs != null && (
                    <span> &middot; Inkoopprijs: {euro(gekozenReservering.inkoopprijs)}/{gekozenReservering.eenheid}</span>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Hoeveelheid</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={gekozenReservering?.hoeveelheid}
                  value={hoeveelheid}
                  onChange={e => setHoeveelheid(e.target.value)}
                  placeholder={`max. ${gekozenReservering?.hoeveelheid ?? ""} ${gekozenReservering?.eenheid ?? ""}`}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Artikel</Label>
                <ArtikelPicker
                  value={artikelId}
                  onValueChange={(id, artikel) => { setArtikelId(id); setArtikelEenheid(artikel.eenheid); }}
                />
                {vrijeVoorraadDirect != null && (
                  <p className={`text-xs ${vrijeVoorraadDirect <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    Vrije voorraad: {vrijeVoorraadDirect} {artikelEenheid}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Hoeveelheid</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={vrijeVoorraadDirect ?? undefined}
                  value={hoeveelheid}
                  onChange={e => setHoeveelheid(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Annuleren</Button>
          <Button onClick={verstuur} disabled={mutatie.isPending}>
            {mutatie.isPending ? "Bezig..." : "Uitgifte registreren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Retour dialoog ──────────────────────────────────────────────────────────

interface RetourDialoogProps {
  opdrachtId: number;
  open: boolean;
  onClose: () => void;
}

function RetourDialoog({ opdrachtId, open, onClose }: RetourDialoogProps) {
  const [artikelId, setArtikelId] = useState<number | null>(null);
  const [artikelEenheid, setArtikelEenheid] = useState("st");
  const [hoeveelheid, setHoeveelheid] = useState("");
  const [conditie, setConditie] = useState<"goed" | "defect" | "afval">("goed");
  const { toast } = useToast();
  const qc = useQueryClient();

  const mutatie = useCreateRetour({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetOpdrachtMateriaalQueryKey(opdrachtId) });
        toast({ title: "Retour geregistreerd" });
        reset();
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Retour mislukt";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  function reset() {
    setArtikelId(null);
    setArtikelEenheid("st");
    setHoeveelheid("");
    setConditie("goed");
  }

  function verstuur() {
    const h = parseFloat(hoeveelheid);
    if (!artikelId) { toast({ title: "Kies een artikel", variant: "destructive" }); return; }
    if (!h || h <= 0) { toast({ title: "Voer een geldige hoeveelheid in", variant: "destructive" }); return; }
    mutatie.mutate({
      data: {
        opdracht_id: opdrachtId,
        regels: [{ artikel_id: artikelId, hoeveelheid: h, conditie }],
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Retour registreren</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Artikel</Label>
            <ArtikelPicker
              value={artikelId}
              onValueChange={(id, artikel) => { setArtikelId(id); setArtikelEenheid(artikel.eenheid); }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Hoeveelheid</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={hoeveelheid}
              onChange={e => setHoeveelheid(e.target.value)}
            />
            {artikelId != null && <p className="text-xs text-muted-foreground">In {artikelEenheid}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Conditie</Label>
            <Select value={conditie} onValueChange={v => setConditie(v as "goed" | "defect" | "afval")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="goed">Goed — terug in voorraad</SelectItem>
                <SelectItem value="defect">Defect — alleen loggen</SelectItem>
                <SelectItem value="afval">Afval — alleen loggen</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Annuleren</Button>
          <Button onClick={verstuur} disabled={mutatie.isPending}>
            {mutatie.isPending ? "Bezig..." : "Retour registreren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Annuleer reservering bevestiging ────────────────────────────────────────

interface AnnuleerBevestigingProps {
  reserveringId: number | null;
  opdrachtId: number;
  onClose: () => void;
}

function AnnuleerBevestiging({ reserveringId, opdrachtId, onClose }: AnnuleerBevestigingProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const mutatie = useAnnuleerReservering({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetOpdrachtMateriaalQueryKey(opdrachtId) });
        toast({ title: "Reservering geannuleerd" });
        onClose();
      },
      onError: () => toast({ title: "Annuleren mislukt", variant: "destructive" }),
    },
  });

  return (
    <AlertDialog open={reserveringId !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reservering annuleren</AlertDialogTitle>
          <AlertDialogDescription>
            De gereserveerde voorraad wordt vrijgegeven. Deze actie kan niet ongedaan worden gemaakt.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Terug</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => reserveringId && mutatie.mutate({ id: reserveringId })}
            disabled={mutatie.isPending}
          >
            {mutatie.isPending ? "Bezig..." : "Annuleren"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Materiaal tab ────────────────────────────────────────────────────────────

interface MateriaaltabProps {
  opdrachtId: number;
}

export default function MateriaaltabTab({ opdrachtId }: MateriaaltabProps) {
  const { heeftNiveau } = useBevoegdheid();
  const isBeheerder = heeftNiveau("magazijn", 3);

  const [uitgifteOpen, setUitgifteOpen] = useState(false);
  const [retourOpen, setRetourOpen] = useState(false);
  const [annuleerReserveringId, setAnnuleerReserveringId] = useState<number | null>(null);

  const { data, isLoading } = useGetOpdrachtMateriaal(opdrachtId);

  if (isLoading) {
    return (
      <div className="space-y-3 mt-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const reserveringen = data?.reserveringen ?? [];
  const uitgiftes = data?.uitgiftes ?? [];

  const openReserveringen = reserveringen.filter(r => r.status === "open" || r.status === "gedeeltelijk");
  const actieveReserveringen = reserveringen.filter(r => r.status !== "geannuleerd");
  const geannuleerdeReserveringen = reserveringen.filter(r => r.status === "geannuleerd");

  const totaalReserveringen = data?.totaal_kosten_reserveringen ?? 0;
  const totaalUitgiftes = data?.totaal_kosten_uitgiftes ?? 0;

  const artikelenOnvoldoendeVoorraad = openReserveringen.filter(r => (r.vrij_voorraad ?? 0) < r.hoeveelheid);

  return (
    <div className="space-y-4 mt-4">
      {artikelenOnvoldoendeVoorraad.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-3 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="font-medium">
            Let op: er zijn {artikelenOnvoldoendeVoorraad.length} gereserveerde artikelen met onvoldoende vrije voorraad in het magazijn.
          </p>
        </div>
      )}

      {/* Kostenoverzicht */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Open reserveringen (indicatie)</p>
            <p className="text-xl font-semibold">{euro(totaalReserveringen)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{openReserveringen.length} openstaand</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Uitgegeven (indicatie)</p>
            <p className="text-xl font-semibold">{euro(totaalUitgiftes)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{uitgiftes.filter(u => u.type === "uitgifte").length} uitgiftes</p>
          </CardContent>
        </Card>
        {isBeheerder && (
          <div className="flex gap-2 items-center md:justify-end col-span-2 md:col-span-1">
            <Button size="sm" variant="outline" onClick={() => setUitgifteOpen(true)}>
              <ArrowDownToLine className="h-3.5 w-3.5" />
              Uitgifte
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRetourOpen(true)}>
              <ArrowUpFromLine className="h-3.5 w-3.5" />
              Retour
            </Button>
          </div>
        )}
      </div>

      {/* Reserveringen */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              Reserveringen
            </CardTitle>
            {actieveReserveringen.length > 0 && (
              <Badge variant="outline">{actieveReserveringen.length}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pb-3">
          {reserveringen.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nog geen materiaal gereserveerd voor deze opdracht.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left pb-1 font-normal">Artikel</th>
                  <th className="text-right pb-1 font-normal">Hoev.</th>
                  <th className="text-right pb-1 font-normal">Prijs/e.</th>
                  <th className="text-right pb-1 font-normal">Totaal</th>
                  <th className="text-right pb-1 font-normal">Vrij</th>
                  <th className="text-right pb-1 font-normal">Status</th>
                  <th className="text-right pb-1 font-normal">Datum</th>
                  {isBeheerder && <th className="w-6"></th>}
                </tr>
              </thead>
              <tbody>
                {reserveringen.map(r => {
                  const st = RESERVERING_STATUS[r.status ?? "open"] ?? { label: r.status ?? "", kleur: "" };
                  return (
                    <tr key={r.id} className={`border-b border-dashed last:border-0 ${r.status === "geannuleerd" ? "opacity-50" : ""}`}>
                      <td className="py-1.5 pr-2">
                        <span className="font-medium">{r.artikel_naam ?? `Artikel ${r.artikel_id}`}</span>
                        {r.artikel_code && <span className="text-xs text-muted-foreground ml-1">({r.artikel_code})</span>}
                      </td>
                      <td className="text-right py-1.5 tabular-nums">{r.hoeveelheid} {r.eenheid}</td>
                      <td className="text-right py-1.5 tabular-nums text-muted-foreground">
                        {r.inkoopprijs != null ? euro(r.inkoopprijs) : "—"}
                      </td>
                      <td className="text-right py-1.5 tabular-nums font-medium">
                        {r.totaal_kosten != null ? euro(r.totaal_kosten) : "—"}
                      </td>
                      <td className="text-right py-1.5 tabular-nums">
                        <span className={cn(
                          "text-xs",
                          (r.vrij_voorraad ?? 0) < r.hoeveelheid ? "text-destructive font-semibold" : "text-muted-foreground"
                        )}>
                          {r.vrij_voorraad ?? 0}
                        </span>
                      </td>
                      <td className="text-right py-1.5">
                        <Badge variant="outline" className={`text-xs ${st.kleur}`}>{st.label}</Badge>
                      </td>
                      <td className="text-right py-1.5 text-muted-foreground text-xs">{datumKort(r.datum)}</td>
                      {isBeheerder && (
                        <td className="text-right py-1.5 pl-1">
                          {(r.status === "open" || r.status === "gedeeltelijk") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-rose-600"
                              title="Reservering annuleren"
                              onClick={() => setAnnuleerReserveringId(r.reservering_id ?? r.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Uitgiftes & retouren */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
              Uitgiftes en retouren
            </CardTitle>
            {uitgiftes.length > 0 && (
              <Badge variant="outline">{uitgiftes.length}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pb-3">
          {uitgiftes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nog geen materiaal uitgegeven of geretourneerd voor deze opdracht.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left pb-1 font-normal">Artikel</th>
                  <th className="text-right pb-1 font-normal">Hoev.</th>
                  <th className="text-right pb-1 font-normal">Prijs/e.</th>
                  <th className="text-right pb-1 font-normal">Kosten</th>
                  <th className="text-right pb-1 font-normal">Type</th>
                  <th className="text-right pb-1 font-normal">Datum</th>
                </tr>
              </thead>
              <tbody>
                {uitgiftes.map(u => {
                  const tp = UITGIFTE_TYPE[u.type] ?? { label: u.type, kleur: "" };
                  return (
                    <tr key={u.id} className="border-b border-dashed last:border-0">
                      <td className="py-1.5 pr-2">
                        <span className="font-medium">{u.artikel_naam ?? `Artikel ${u.artikel_id}`}</span>
                        {u.artikel_code && <span className="text-xs text-muted-foreground ml-1">({u.artikel_code})</span>}
                      </td>
                      <td className="text-right py-1.5 tabular-nums">{u.hoeveelheid} {u.eenheid}</td>
                      <td className="text-right py-1.5 tabular-nums text-muted-foreground">
                        {u.inkoopprijs != null ? euro(u.inkoopprijs) : "—"}
                      </td>
                      <td className="text-right py-1.5 tabular-nums font-medium">
                        {u.type === "uitgifte" && u.totaal_kosten != null ? euro(u.totaal_kosten) : "—"}
                      </td>
                      <td className="text-right py-1.5">
                        <Badge variant="outline" className={`text-xs ${tp.kleur}`}>{tp.label}</Badge>
                      </td>
                      <td className="text-right py-1.5 text-muted-foreground text-xs">{datumKort(u.datum)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {uitgiftes.filter(u => u.type === "uitgifte").length > 1 && (
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={3} className="pt-2 text-xs text-muted-foreground font-medium">Totaal uitgegeven (indicatie)</td>
                    <td className="pt-2 text-right font-semibold tabular-nums">{euro(totaalUitgiftes)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </CardContent>
      </Card>

      {/* Dialogen */}
      {isBeheerder && (
        <>
          <UitgifteDialoog
            opdrachtId={opdrachtId}
            openReserveringen={openReserveringen}
            open={uitgifteOpen}
            onClose={() => setUitgifteOpen(false)}
          />
          <RetourDialoog
            opdrachtId={opdrachtId}
            open={retourOpen}
            onClose={() => setRetourOpen(false)}
          />
          <AnnuleerBevestiging
            reserveringId={annuleerReserveringId}
            opdrachtId={opdrachtId}
            onClose={() => setAnnuleerReserveringId(null)}
          />
        </>
      )}
    </div>
  );
}

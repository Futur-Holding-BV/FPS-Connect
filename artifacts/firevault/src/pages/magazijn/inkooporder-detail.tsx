import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetMagazijnInkooporder,
  useVerstuurMagazijnInkooporder,
  useOntvangMagazijnInkooporder,
  useUpdateMagazijnInkooporder,
  type MagazijnInkooporderRegel,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Send, PackageCheck, AlertCircle } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  concept: "Concept",
  verstuurd: "Verstuurd",
  bevestigd: "Bevestigd",
  gedeeltelijk_ontvangen: "Deels ontvangen",
  volledig_ontvangen: "Volledig ontvangen",
  geannuleerd: "Geannuleerd",
};

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-gray-100 text-gray-700",
  verstuurd: "bg-blue-100 text-blue-700",
  bevestigd: "bg-indigo-100 text-indigo-700",
  gedeeltelijk_ontvangen: "bg-amber-100 text-amber-700",
  volledig_ontvangen: "bg-green-100 text-green-700",
  geannuleerd: "bg-red-100 text-red-700",
};

function formatDatum(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatBedrag(n: number | null | undefined) {
  if (n == null) return "—";
  return `€ ${n.toFixed(2).replace(".", ",")}`;
}

export default function InkooporderDetailPagina() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("magazijn", 2);

  const orderId = Number(id);
  const {
    data: order,
    isLoading,
    refetch,
    error,
  } = useGetMagazijnInkooporder(orderId, {
    query: { queryKey: ["magazijn-inkooporder", orderId] },
  });

  const { mutate: verstuur, isPending: verstuurBezig } = useVerstuurMagazijnInkooporder({
    mutation: { onSuccess: () => void refetch() },
  });
  const { mutate: ontvang, isPending: ontvangBezig } = useOntvangMagazijnInkooporder({
    mutation: {
      onSuccess: () => {
        void refetch();
        setShowOntvangst(false);
      },
    },
  });
  const { mutate: update } = useUpdateMagazijnInkooporder({
    mutation: { onSuccess: () => void refetch() },
  });

  const [showVerstuur, setShowVerstuur] = useState(false);
  const [showOntvangst, setShowOntvangst] = useState(false);
  const [ontvangstRegels, setOntvangstRegels] = useState<Record<number, string>>({});
  const [ontvangstDatum, setOntvangstDatum] = useState("");

  const [editReferentie, setEditReferentie] = useState(false);
  const [referentieWaarde, setReferentieWaarde] = useState("");

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-6 flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" />
        <p className="font-medium">Inkooporder niet gevonden</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/magazijn/inkooporders")}>
          Terug naar overzicht
        </Button>
      </div>
    );
  }

  const regels: MagazijnInkooporderRegel[] =
    ((order as unknown as { regels?: MagazijnInkooporderRegel[] }).regels) ?? [];

  const kanVersturen = order.status === "concept" && !!order.leverancier_email && regels.length > 0;
  const kanOntvangen = ["verstuurd", "bevestigd", "gedeeltelijk_ontvangen"].includes(order.status);

  function handleOntvangst() {
    const inkomend = regels
      .filter((r) => ontvangstRegels[r.id] && Number(ontvangstRegels[r.id]) > 0)
      .map((r) => ({ regel_id: r.id, ontvangen_hoeveelheid: Number(ontvangstRegels[r.id]) }));
    if (inkomend.length === 0) return;
    ontvang({
      id: orderId,
      data: {
        werkelijke_leverdatum: ontvangstDatum || null,
        regels: inkomend,
      },
    });
  }

  function handleReferentieOpslaan() {
    update({ id: orderId, data: { referentie: referentieWaarde || null } });
    setEditReferentie(false);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/magazijn/inkooporders")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 data-paginatitel className="text-xl font-semibold">{order.nummer ?? `Inkooporder #${order.id}`}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={STATUS_KLEUR[order.status] ?? "bg-gray-100 text-gray-700"}>
              {STATUS_LABELS[order.status] ?? order.status}
            </Badge>
            {order.leverancier_naam && (
              <span className="text-sm text-muted-foreground">{order.leverancier_naam}</span>
            )}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {kanSchrijven && kanVersturen && (
            <Button variant="outline" onClick={() => setShowVerstuur(true)}>
              <Send className="h-4 w-4 mr-2" />
              Verstuur naar leverancier
            </Button>
          )}
          {kanSchrijven && kanOntvangen && (
            <Button onClick={() => {
              setOntvangstRegels({});
              setOntvangstDatum("");
              setShowOntvangst(true);
            }}>
              <PackageCheck className="h-4 w-4 mr-2" />
              Ontvangst registreren
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg border">
        <div>
          <p className="text-xs text-muted-foreground">Leverancier</p>
          <p className="text-sm font-medium">{order.leverancier_naam ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Verwachte levering</p>
          <p className="text-sm font-medium">{formatDatum(order.verwachte_leverdatum)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Werkelijke levering</p>
          <p className="text-sm font-medium">{formatDatum(order.werkelijke_leverdatum)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Leverancier referentie</p>
          {editReferentie ? (
            <div className="flex gap-1 mt-1">
              <Input
                value={referentieWaarde}
                onChange={(e) => setReferentieWaarde(e.target.value)}
                className="h-7 text-xs"
                placeholder="Ordernummer leverancier"
              />
              <Button size="sm" className="h-7 px-2 text-xs" onClick={handleReferentieOpslaan}>Ok</Button>
            </div>
          ) : (
            <p
              className="text-sm font-medium cursor-pointer hover:underline"
              onClick={() => { setReferentieWaarde(order.referentie ?? ""); setEditReferentie(true); }}
            >
              {order.referentie ?? <span className="text-muted-foreground italic">klik om in te vullen</span>}
            </p>
          )}
        </div>
      </div>

      {order.notities && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
          <strong>Notities:</strong> {order.notities}
        </div>
      )}

      <div>
        <h2 className="text-base font-medium mb-3">Regeloverzicht</h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artikel</TableHead>
                <TableHead className="text-right">Besteld</TableHead>
                <TableHead className="text-right">Ontvangen</TableHead>
                <TableHead className="text-right">Prijs/eenheid</TableHead>
                <TableHead className="text-right">Totaal excl. btw</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                    Geen regels toegevoegd
                  </TableCell>
                </TableRow>
              ) : (
                regels.map((r) => {
                  const voortgang = r.gevraagd_hoeveelheid > 0
                    ? (r.ontvangen_hoeveelheid / r.gevraagd_hoeveelheid) * 100
                    : 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{r.artikel_naam ?? `Artikel #${r.id}`}</p>
                        {r.omschrijving && (
                          <p className="text-xs text-muted-foreground">{r.omschrijving}</p>
                        )}
                        {r.ontvangen_hoeveelheid > 0 && (
                          <div className="mt-1 h-1.5 w-24 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${Math.min(100, voortgang)}%` }}
                            />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.gevraagd_hoeveelheid} {r.artikel_eenheid ?? ""}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <span className={r.ontvangen_hoeveelheid >= r.gevraagd_hoeveelheid ? "text-green-700 font-medium" : "text-muted-foreground"}>
                          {r.ontvangen_hoeveelheid} {r.artikel_eenheid ?? ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatBedrag(r.eenheidsprijs)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {r.eenheidsprijs != null
                          ? formatBedrag(r.eenheidsprijs * r.gevraagd_hoeveelheid)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="text-xs text-muted-foreground border-t pt-3 flex gap-6">
        <span>Aangemaakt: {formatDatum(order.aangemaakt_op)}{order.aangemaakt_door_naam ? ` door ${order.aangemaakt_door_naam}` : ""}</span>
        {order.verstuurd_op && <span>Verstuurd: {formatDatum(order.verstuurd_op)}</span>}
        {order.ontvangen_op && <span>Volledig ontvangen: {formatDatum(order.ontvangen_op)}</span>}
      </div>

      <Dialog open={showVerstuur} onOpenChange={setShowVerstuur}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inkooporder versturen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            De inkooporder wordt per e-mail verstuurd naar{" "}
            <strong>{order.leverancier_email}</strong>.
            De status wijzigt naar <em>Verstuurd</em>.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVerstuur(false)}>Annuleren</Button>
            <Button
              onClick={() => { verstuur({ id: orderId }); setShowVerstuur(false); }}
              disabled={verstuurBezig}
            >
              <Send className="h-4 w-4 mr-2" />
              {verstuurBezig ? "Versturen..." : "Versturen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showOntvangst} onOpenChange={setShowOntvangst}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ontvangst registreren</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Werkelijke leverdatum</Label>
              <Input type="date" value={ontvangstDatum} onChange={(e) => setOntvangstDatum(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Ontvangen hoeveelheden</Label>
              {regels.map((r) => {
                const nog = r.gevraagd_hoeveelheid - r.ontvangen_hoeveelheid;
                return (
                  <div key={r.id} className="grid grid-cols-[1fr_120px] gap-3 items-center">
                    <div>
                      <p className="text-sm font-medium">{r.artikel_naam ?? `Artikel #${r.id}`}</p>
                      <p className="text-xs text-muted-foreground">
                        Nog verwacht: {nog} {r.artikel_eenheid ?? ""}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      max={nog}
                      step="any"
                      placeholder={String(nog)}
                      value={ontvangstRegels[r.id] ?? ""}
                      onChange={(e) => setOntvangstRegels((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOntvangst(false)}>Annuleren</Button>
            <Button onClick={handleOntvangst} disabled={ontvangBezig}>
              <PackageCheck className="h-4 w-4 mr-2" />
              {ontvangBezig ? "Verwerken..." : "Ontvangst bevestigen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

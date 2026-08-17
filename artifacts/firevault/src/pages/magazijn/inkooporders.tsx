import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListMagazijnInkooporders,
  useCreateMagazijnInkooporder,
  useDeleteMagazijnInkooporder,
  useListLeveranciers,
  useListArtikelen,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, ExternalLink, ShoppingCart } from "lucide-react";

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
    month: "2-digit",
    year: "numeric",
  });
}

type Artikel = { id: number; naam: string; eenheid?: string | null; code?: string | null };

function ArtikelRegel({
  artikelen,
  onVerwijder,
  index,
  regel,
  onChange,
}: {
  artikelen: Artikel[];
  onVerwijder: () => void;
  index: number;
  regel: { artikel_id: string; hoeveelheid: string; prijs: string };
  onChange: (veld: "artikel_id" | "hoeveelheid" | "prijs", waarde: string) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_100px_100px_32px] gap-2 items-end">
      <div>
        {index === 0 && <Label className="text-xs mb-1 block">Artikel</Label>}
        <Select value={regel.artikel_id} onValueChange={(v) => onChange("artikel_id", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Kies artikel" />
          </SelectTrigger>
          <SelectContent>
            {artikelen.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.naam}{a.code ? ` (${a.code})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        {index === 0 && <Label className="text-xs mb-1 block">Aantal</Label>}
        <Input
          type="number"
          min="0.01"
          step="any"
          placeholder="0"
          value={regel.hoeveelheid}
          onChange={(e) => onChange("hoeveelheid", e.target.value)}
        />
      </div>
      <div>
        {index === 0 && <Label className="text-xs mb-1 block">Prijs/eenheid</Label>}
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="—"
          value={regel.prijs}
          onChange={(e) => onChange("prijs", e.target.value)}
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onVerwijder}
        className={index === 0 ? "mt-5" : ""}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

export default function MagazijnInkoopordersPagina() {
  const [, navigate] = useLocation();
  const { heeftNiveau } = useBevoegdheid();
  const kanAanmaken = heeftNiveau("magazijn", 3);
  const kanBeheren = heeftNiveau("magazijn", 4);

  const [filterStatus, setFilterStatus] = useState("");
  const { data: orders = [], isLoading, refetch } = useListMagazijnInkooporders({
    status: filterStatus || undefined,
  });
  const { data: leveranciersData } = useListLeveranciers();
  const { data: artikelenData } = useListArtikelen();
  const leveranciers = leveranciersData ?? [];
  const artikelen: Artikel[] = (artikelenData ?? []).map((a: { id: number; naam: string; eenheid?: string | null; code?: string | null }) => ({
    id: a.id,
    naam: a.naam,
    eenheid: a.eenheid ?? null,
    code: a.code ?? null,
  }));

  const { mutate: create, isPending: cBezig } = useCreateMagazijnInkooporder({
    mutation: {
      onSuccess: () => {
        void refetch();
        setShowNieuw(false);
        resetFormulier();
      },
    },
  });
  const { mutate: verwijder } = useDeleteMagazijnInkooporder({
    mutation: { onSuccess: () => void refetch() },
  });

  const [showNieuw, setShowNieuw] = useState(false);
  const [nLeverancierId, setNLeverancierId] = useState("");
  const [nDatum, setNDatum] = useState("");
  const [nNotities, setNNotities] = useState("");
  const [nRegels, setNRegels] = useState([{ artikel_id: "", hoeveelheid: "", prijs: "" }]);

  function resetFormulier() {
    setNLeverancierId("");
    setNDatum("");
    setNNotities("");
    setNRegels([{ artikel_id: "", hoeveelheid: "", prijs: "" }]);
  }

  function regelWijzigen(index: number, veld: "artikel_id" | "hoeveelheid" | "prijs", waarde: string) {
    setNRegels((prev) => prev.map((r, i) => i === index ? { ...r, [veld]: waarde } : r));
  }

  function regelToevoegen() {
    setNRegels((prev) => [...prev, { artikel_id: "", hoeveelheid: "", prijs: "" }]);
  }

  function regelVerwijderen(index: number) {
    setNRegels((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAanmaken() {
    const geldigeRegels = nRegels.filter((r) => r.artikel_id && Number(r.hoeveelheid) > 0);
    if (geldigeRegels.length === 0) return;
    create({
      data: {
        leverancier_id: nLeverancierId ? Number(nLeverancierId) : null,
        verwachte_leverdatum: nDatum || null,
        notities: nNotities || null,
        regels: geldigeRegels.map((r) => ({
          artikel_id: Number(r.artikel_id),
          gevraagd_hoeveelheid: Number(r.hoeveelheid),
          eenheidsprijs: r.prijs ? Number(r.prijs) : null,
          btw_percentage: 21,
        })),
      },
    });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 data-paginatitel className="text-2xl font-semibold">Inkooporders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bestelworkflow voor magazijnvulling — van concept tot ontvangst
          </p>
        </div>
        <div className="flex items-center gap-3">
          {kanAanmaken && (
            <Button onClick={() => setShowNieuw(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nieuwe inkooporder
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Alle statussen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Alle statussen</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ShoppingCart className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">Geen inkooporders gevonden</p>
          <p className="text-sm text-muted-foreground mt-1">
            {filterStatus ? "Pas het filter aan of " : ""}Maak een nieuwe inkooporder aan om materialen te bestellen.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nummer</TableHead>
                <TableHead>Leverancier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Regels</TableHead>
                <TableHead>Verwachte levering</TableHead>
                <TableHead>Aangemaakt op</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow
                  key={o.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/magazijn/inkooporders/${o.id}`)}
                >
                  <TableCell className="font-mono text-sm font-medium">
                    {(o as any).kenmerk ?? o.nummer ?? `#${o.id}`}
                  </TableCell>
                  <TableCell>{o.leverancier_naam ?? <span className="text-muted-foreground text-sm">Onbekend</span>}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_KLEUR[o.status] ?? "bg-gray-100 text-gray-700"}>
                      {STATUS_LABELS[o.status] ?? o.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{o.totaal_regels} {o.totaal_regels === 1 ? "artikel" : "artikelen"}</TableCell>
                  <TableCell className="text-sm">{formatDatum(o.verwachte_leverdatum)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDatum(o.aangemaakt_op)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(`/magazijn/inkooporders/${o.id}`)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      {kanBeheren && o.status === "concept" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Inkooporder ${o.nummer ?? `#${o.id}`} verwijderen?`)) {
                              verwijder({ id: o.id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={showNieuw} onOpenChange={(o) => { if (!o) resetFormulier(); setShowNieuw(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nieuwe inkooporder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Leverancier</Label>
                <Select value={nLeverancierId} onValueChange={setNLeverancierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kies leverancier (optioneel)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Geen</SelectItem>
                    {leveranciers.map((l: { id: number; naam: string }) => (
                      <SelectItem key={l.id} value={String(l.id)}>{l.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Gewenste leverdatum</Label>
                <Input
                  type="date"
                  value={nDatum}
                  onChange={(e) => setNDatum(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notities</Label>
              <Input
                placeholder="Bijzondere instructies voor de leverancier"
                value={nNotities}
                onChange={(e) => setNNotities(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Artikelen</Label>
              {nRegels.map((r, i) => (
                <ArtikelRegel
                  key={i}
                  index={i}
                  regel={r}
                  artikelen={artikelen}
                  onVerwijder={() => regelVerwijderen(i)}
                  onChange={(veld, waarde) => regelWijzigen(i, veld, waarde)}
                />
              ))}
              <Button variant="outline" size="sm" onClick={regelToevoegen} className="mt-1">
                <Plus className="h-4 w-4 mr-1" />
                Regel toevoegen
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetFormulier(); setShowNieuw(false); }}>
              Annuleren
            </Button>
            <Button
              onClick={handleAanmaken}
              disabled={cBezig || nRegels.filter((r) => r.artikel_id && Number(r.hoeveelheid) > 0).length === 0}
            >
              {cBezig ? "Aanmaken..." : "Aanmaken"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

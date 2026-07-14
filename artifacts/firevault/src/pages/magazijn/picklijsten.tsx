import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListMagazijnPicklijsten,
  useCreateMagazijnPicklijst,
  useListOpdrachten,
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
import { Plus, Trash2, ExternalLink, ClipboardList } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  concept: "Concept",
  in_uitvoering: "In uitvoering",
  voltooid: "Voltooid",
  deels_voltooid: "Deels voltooid",
  geannuleerd: "Geannuleerd",
};

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-gray-100 text-gray-700",
  in_uitvoering: "bg-blue-100 text-blue-700",
  voltooid: "bg-green-100 text-green-700",
  deels_voltooid: "bg-amber-100 text-amber-700",
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

function RegelRij({
  index,
  artikelen,
  regel,
  onChange,
  onVerwijder,
}: {
  index: number;
  artikelen: Artikel[];
  regel: { artikel_id: string; hoeveelheid: string };
  onChange: (veld: "artikel_id" | "hoeveelheid", waarde: string) => void;
  onVerwijder: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_120px_32px] gap-2 items-end">
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
        {index === 0 && <Label className="text-xs mb-1 block">Hoeveelheid</Label>}
        <Input
          type="number"
          min="0.01"
          step="any"
          placeholder="0"
          value={regel.hoeveelheid}
          onChange={(e) => onChange("hoeveelheid", e.target.value)}
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

export default function MagazijnPicklijstenPagina() {
  const [, navigate] = useLocation();
  const { heeftNiveau } = useBevoegdheid();
  const kanAanmaken = heeftNiveau("magazijn", 3);

  const [filterStatus, setFilterStatus] = useState("");
  const { data: lijsten = [], isLoading, refetch } = useListMagazijnPicklijsten({
    status: filterStatus || undefined,
  });
  const { data: opdrachtenData } = useListOpdrachten();
  const { data: artikelenData } = useListArtikelen();
  const opdrachten = (opdrachtenData ?? []) as unknown as Array<{ id: number; naam: string }>;
  const artikelen: Artikel[] = (artikelenData ?? []).map((a: { id: number; naam: string; eenheid?: string | null; code?: string | null }) => ({
    id: a.id,
    naam: a.naam,
    eenheid: a.eenheid ?? null,
    code: a.code ?? null,
  }));

  const { mutate: create, isPending: cBezig } = useCreateMagazijnPicklijst({
    mutation: {
      onSuccess: (data) => {
        void refetch();
        setShowNieuw(false);
        resetFormulier();
        if (data?.id) navigate(`/magazijn/picklijsten/${data.id}`);
      },
    },
  });

  const [showNieuw, setShowNieuw] = useState(false);
  const [nOpdrachtId, setNOpdrachtId] = useState("");
  const [nDatum, setNDatum] = useState("");
  const [nNotities, setNNotities] = useState("");
  const [nRegels, setNRegels] = useState([{ artikel_id: "", hoeveelheid: "" }]);

  function resetFormulier() {
    setNOpdrachtId("");
    setNDatum("");
    setNNotities("");
    setNRegels([{ artikel_id: "", hoeveelheid: "" }]);
  }

  function regelWijzigen(index: number, veld: "artikel_id" | "hoeveelheid", waarde: string) {
    setNRegels((prev) => prev.map((r, i) => i === index ? { ...r, [veld]: waarde } : r));
  }

  function handleAanmaken() {
    const geldigeRegels = nRegels.filter((r) => r.artikel_id && Number(r.hoeveelheid) > 0);
    if (geldigeRegels.length === 0) return;
    create({
      data: {
        opdracht_id: nOpdrachtId ? Number(nOpdrachtId) : null,
        geplande_uitgifte_op: nDatum || null,
        notities: nNotities || null,
        regels: geldigeRegels.map((r) => ({
          artikel_id: Number(r.artikel_id),
          gevraagd_hoeveelheid: Number(r.hoeveelheid),
        })),
      },
    });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Picklijsten</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Materiaalvoorbereiding per project — van concept tot uitgifte
          </p>
        </div>
        <div className="flex items-center gap-3">
          {kanAanmaken && (
            <Button onClick={() => setShowNieuw(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nieuwe picklijst
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
      ) : lijsten.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">Geen picklijsten gevonden</p>
          <p className="text-sm text-muted-foreground mt-1">
            Maak een picklijst aan om materiaal klaar te zetten voor een project.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Voortgang</TableHead>
                <TableHead>Geplande uitgifte</TableHead>
                <TableHead>Aangemaakt</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lijsten.map((l) => {
                const pct = l.totaal_regels > 0
                  ? Math.round((l.gepickt_regels / l.totaal_regels) * 100)
                  : 0;
                return (
                  <TableRow
                    key={l.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/magazijn/picklijsten/${l.id}`)}
                  >
                    <TableCell>
                      <p className="font-medium text-sm">{l.opdracht_titel ?? <span className="text-muted-foreground italic text-sm">Geen project</span>}</p>
                      <p className="text-xs text-muted-foreground">Picklijst #{l.id}</p>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_KLEUR[l.status] ?? "bg-gray-100 text-gray-700"}>
                        {STATUS_LABELS[l.status] ?? l.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {l.gepickt_regels}/{l.totaal_regels}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{formatDatum(l.geplande_uitgifte_op)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDatum(l.aangemaakt_op)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); navigate(`/magazijn/picklijsten/${l.id}`); }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={showNieuw} onOpenChange={(o) => { if (!o) resetFormulier(); setShowNieuw(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nieuwe picklijst</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Project (optioneel)</Label>
                <Select value={nOpdrachtId} onValueChange={setNOpdrachtId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Geen project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Geen project</SelectItem>
                    {opdrachten.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Geplande uitgiftedatum</Label>
                <Input type="date" value={nDatum} onChange={(e) => setNDatum(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notities</Label>
              <Input
                placeholder="Bijzonderheden voor de magazijnmedewerker"
                value={nNotities}
                onChange={(e) => setNNotities(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Benodigde artikelen</Label>
              {nRegels.map((r, i) => (
                <RegelRij
                  key={i}
                  index={i}
                  regel={r}
                  artikelen={artikelen}
                  onVerwijder={() => setNRegels((prev) => prev.filter((_, j) => j !== i))}
                  onChange={(veld, waarde) => regelWijzigen(i, veld, waarde)}
                />
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNRegels((prev) => [...prev, { artikel_id: "", hoeveelheid: "" }])}
              >
                <Plus className="h-4 w-4 mr-1" />
                Artikel toevoegen
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
              {cBezig ? "Aanmaken..." : "Picklijst aanmaken"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

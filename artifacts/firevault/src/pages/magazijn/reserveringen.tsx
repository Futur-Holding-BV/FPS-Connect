import { useState } from "react";
import {
  useListReserveringen,
  useCreateReservering,
  useAnnuleerReservering,
  useListArtikelen,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PaginaHulp } from "@/components/pagina-hulp";

const STATUS_LABELS: Record<string, string> = {
  open: "Open", gedeeltelijk: "Gedeeltelijk", volledig: "Volledig", geannuleerd: "Geannuleerd",
};
const STATUS_KLEUR: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  gedeeltelijk: "bg-amber-100 text-amber-800",
  volledig: "bg-green-100 text-green-800",
  geannuleerd: "bg-gray-100 text-gray-600",
};

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function MagazijnReserveringenPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("magazijn", 3);

  const [filterStatus, setFilterStatus] = useState("");
  const { data: reserveringen = [], isLoading, refetch } = useListReserveringen({
    status: filterStatus || undefined,
  });
  const { data: artikelenData } = useListArtikelen();
  const artikelen = artikelenData ?? [];

  const { mutate: create, isPending: cBezig } = useCreateReservering({ mutation: { onSuccess: () => { void refetch(); setShowNieuw(false); } } });
  const { mutate: annuleer } = useAnnuleerReservering({ mutation: { onSuccess: () => void refetch() } });

  const [showNieuw, setShowNieuw] = useState(false);
  const [nArtikelId, setNArtikelId] = useState("");
  const [nHoeveelheid, setNHoeveelheid] = useState("");
  const [nOmschrijving, setNOmschrijving] = useState("");

  return (
    <div className="p-6 space-y-4">
      <PaginaHulp pagina="magazijn-reserveringen" />
      <div className="flex items-center justify-between">
        <h1 data-paginatitel className="text-2xl font-bold">Reserveringen</h1>
        {kanSchrijven && (
          <Button size="sm" onClick={() => setShowNieuw(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nieuwe reservering
          </Button>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={filterStatus || "__alle__"} onValueChange={v => setFilterStatus(v === "__alle__" ? "" : v)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Alle statussen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__alle__">Alle statussen</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-hidden bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left py-2.5 px-4">Datum</th>
              <th className="text-left py-2.5 px-4">Artikel</th>
              <th className="text-right py-2.5 px-4">Hoeveelheid</th>
              <th className="text-left py-2.5 px-4">Opdracht</th>
              <th className="text-left py-2.5 px-4">Status</th>
              <th className="py-2.5 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="py-3 px-4" colSpan={6}><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))
            ) : reserveringen.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground">
                  Geen reserveringen gevonden.
                </td>
              </tr>
            ) : (
              reserveringen.map(r => (
                <tr key={r.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 px-4 text-muted-foreground text-xs">{formatDatum(r.gereserveerd_op)}</td>
                  <td className="py-2.5 px-4 font-medium">{r.artikel_naam ?? `Artikel #${r.artikel_id}`}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{r.hoeveelheid}</td>
                  <td className="py-2.5 px-4 text-muted-foreground">{r.opdracht_titel ?? "—"}</td>
                  <td className="py-2.5 px-4">
                    <Badge className={cn("text-xs", STATUS_KLEUR[r.status] ?? "bg-gray-100")}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-4">
                    {kanSchrijven && r.status === "open" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Annuleren"
                        onClick={() => annuleer({ id: r.id })}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Nieuwe reservering */}
      <Dialog open={showNieuw} onOpenChange={setShowNieuw}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nieuwe reservering</DialogTitle></DialogHeader>
          <form onSubmit={e => {
            e.preventDefault();
            if (!nArtikelId || !nHoeveelheid) return;
            create({ data: { artikel_id: Number(nArtikelId), hoeveelheid: Number(nHoeveelheid), omschrijving: nOmschrijving } });
          }} className="space-y-4">
            <div className="space-y-1">
              <Label>Artikel <span className="text-destructive">*</span></Label>
              <Select value={nArtikelId} onValueChange={setNArtikelId}>
                <SelectTrigger><SelectValue placeholder="Kies artikel" /></SelectTrigger>
                <SelectContent>
                  {artikelen.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Hoeveelheid <span className="text-destructive">*</span></Label>
              <Input type="number" min="0.01" step="0.01" value={nHoeveelheid} onChange={e => setNHoeveelheid(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Omschrijving</Label>
              <Input value={nOmschrijving} onChange={e => setNOmschrijving(e.target.value)} placeholder="Optionele toelichting" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNieuw(false)}>Annuleren</Button>
              <Button type="submit" disabled={cBezig || !nArtikelId || !nHoeveelheid}>Reserveren</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

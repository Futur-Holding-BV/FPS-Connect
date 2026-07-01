import { useState } from "react";
import { useListVoorraadTotaal, useListMagazijnLocaties, useCorrectieVoorraad, useListArtikelen } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MagazijnVoorraadPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("magazijn", 3);

  const { data: voorraad = [], isLoading, refetch } = useListVoorraadTotaal();
  const { data: locaties = [] } = useListMagazijnLocaties();
  const { data: artikelenData } = useListArtikelen();
  const { mutate: correctie, isPending: cBezig } = useCorrectieVoorraad({ mutation: { onSuccess: () => { void refetch(); setShowCorrectie(false); } } });

  const [zoek, setZoek] = useState("");
  const [alleenKritiek, setAlleenKritiek] = useState(false);
  const [showCorrectie, setShowCorrectie] = useState(false);
  const [cArtikelId, setCArtikelId] = useState("");
  const [cDelta, setCDelta] = useState("");
  const [cLocatieId, setCLocatieId] = useState("");
  const [cType, setCType] = useState("inkoop");
  const [cOmschrijving, setCOmschrijving] = useState("");

  const gefilterd = voorraad.filter(v => {
    const matchZoek = !zoek || (v.artikel_naam ?? "").toLowerCase().includes(zoek.toLowerCase());
    const matchKritiek = !alleenKritiek || v.onder_minimum;
    return matchZoek && matchKritiek;
  });

  const artikelen = artikelenData ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Voorraad</h1>
        {kanSchrijven && (
          <Button size="sm" onClick={() => setShowCorrectie(true)}>
            <Plus className="h-4 w-4 mr-1" /> Correctie boeken
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={zoek} onChange={e => setZoek(e.target.value)} placeholder="Artikel zoeken..." className="pl-9" />
        </div>
        <Button
          variant={alleenKritiek ? "default" : "outline"}
          size="sm"
          onClick={() => setAlleenKritiek(v => !v)}
          className="gap-1.5"
        >
          <AlertTriangle className="h-4 w-4" />
          Alleen kritiek
        </Button>
      </div>

      {/* Tabel */}
      <div className="border rounded-lg overflow-hidden bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left py-2.5 px-4">Artikel</th>
              <th className="text-right py-2.5 px-4">Actueel</th>
              <th className="text-right py-2.5 px-4">Gereserveerd</th>
              <th className="text-right py-2.5 px-4">Vrij</th>
              <th className="text-right py-2.5 px-4">Besteld</th>
              <th className="text-right py-2.5 px-4">Minimum</th>
              <th className="text-left py-2.5 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="py-3 px-4" colSpan={7}><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))
            ) : gefilterd.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted-foreground">
                  {zoek || alleenKritiek ? "Geen artikelen gevonden." : "Nog geen voorraad geregistreerd."}
                </td>
              </tr>
            ) : (
              gefilterd.map(v => (
                <tr key={v.artikel_id} className={cn("border-b hover:bg-muted/20 transition-colors", v.onder_minimum && "bg-red-50 hover:bg-red-50")}>
                  <td className="py-2.5 px-4 font-medium">{v.artikel_naam ?? `Artikel #${v.artikel_id}`}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{v.hoeveelheid} {v.eenheid}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-amber-700">{v.gereserveerd}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums font-semibold">{v.vrij}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-blue-700">{v.besteld}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">{v.minimum_voorraad ?? "—"}</td>
                  <td className="py-2.5 px-4">
                    {v.onder_minimum ? (
                      <Badge variant="destructive" className="text-xs">Onder minimum</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">OK</Badge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Correctie dialog */}
      <Dialog open={showCorrectie} onOpenChange={setShowCorrectie}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Voorraad boeken</DialogTitle></DialogHeader>
          <form onSubmit={e => {
            e.preventDefault();
            if (!cArtikelId || !cDelta) return;
            correctie({ data: {
              artikel_id: Number(cArtikelId),
              delta: Number(cDelta),
              locatie_id: cLocatieId ? Number(cLocatieId) : null,
              type: cType,
              omschrijving: cOmschrijving,
            }});
          }} className="space-y-4">
            <div className="space-y-1">
              <Label>Artikel <span className="text-destructive">*</span></Label>
              <Select value={cArtikelId} onValueChange={setCArtikelId}>
                <SelectTrigger><SelectValue placeholder="Kies artikel" /></SelectTrigger>
                <SelectContent>
                  {artikelen.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Type boeking</Label>
              <Select value={cType} onValueChange={setCType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inkoop">Inkoop (ontvangst)</SelectItem>
                  <SelectItem value="correctie">Correctie</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Hoeveelheid <span className="text-destructive">*</span></Label>
              <Input type="number" value={cDelta} onChange={e => setCDelta(e.target.value)} placeholder="Bijv. 10 of -5" step="0.01" required />
              <p className="text-xs text-muted-foreground">Positief = toename, negatief = afname</p>
            </div>
            <div className="space-y-1">
              <Label>Locatie</Label>
              <Select value={cLocatieId || "__geen__"} onValueChange={v => setCLocatieId(v === "__geen__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Geen locatie" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__geen__">Geen locatie</SelectItem>
                  {locaties.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Omschrijving</Label>
              <Input value={cOmschrijving} onChange={e => setCOmschrijving(e.target.value)} placeholder="Optionele toelichting" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCorrectie(false)}>Annuleren</Button>
              <Button type="submit" disabled={cBezig || !cArtikelId || !cDelta}>Boeken</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

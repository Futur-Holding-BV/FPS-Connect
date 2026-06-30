import { useState } from "react";
import { useCreateUitgifte, useListArtikelen, useListMagazijnLocaties, useListReserveringen } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, PackageCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UitgifteRegel {
  artikel_id: number;
  artikel_naam: string;
  hoeveelheid: number;
  locatie_id: number | null;
  reservering_id: number | null;
}

export default function MagazijnUitgiftesPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("magazijn", 3);

  const { data: artikelenData } = useListArtikelen();
  const { data: locaties = [] } = useListMagazijnLocaties();
  const { data: reserveringen = [] } = useListReserveringen({ status: "open" });
  const artikelen = artikelenData ?? [];

  const { mutate: uitgifte, isPending } = useCreateUitgifte();
  const { toast } = useToast();

  const [opdrachtId, setOpdrachtId] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [regels, setRegels] = useState<UitgifteRegel[]>([]);
  const [nArtikelId, setNArtikelId] = useState("");
  const [nHoeveelheid, setNHoeveelheid] = useState("1");
  const [nLocatieId, setNLocatieId] = useState("");
  const [nReserveringId, setNReserveringId] = useState("");
  const [voltooid, setVoltooid] = useState(false);

  function voegToe() {
    const artikel = artikelen.find(a => a.id === Number(nArtikelId));
    if (!artikel) return;
    setRegels(prev => [...prev, {
      artikel_id: Number(nArtikelId),
      artikel_naam: artikel.naam,
      hoeveelheid: Number(nHoeveelheid),
      locatie_id: nLocatieId ? Number(nLocatieId) : null,
      reservering_id: nReserveringId ? Number(nReserveringId) : null,
    }]);
    setNArtikelId(""); setNHoeveelheid("1"); setNLocatieId(""); setNReserveringId("");
  }

  function verwijderRegel(idx: number) {
    setRegels(prev => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!regels.length) return;
    uitgifte({
      data: {
        opdracht_id: opdrachtId ? Number(opdrachtId) : null,
        omschrijving,
        regels,
      },
    }, {
      onSuccess: () => {
        setVoltooid(true);
        toast({ title: "Uitgifte geregistreerd", description: `${regels.length} artikel(en) uitgegeven.` });
      },
      onError: () => toast({ title: "Fout bij uitgifte", variant: "destructive" }),
    });
  }

  if (!kanSchrijven) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Je hebt geen toegang tot deze functie.</p>
      </div>
    );
  }

  if (voltooid) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64 gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <PackageCheck className="h-8 w-8 text-green-700" />
        </div>
        <div>
          <p className="text-xl font-semibold">Uitgifte geregistreerd</p>
          <p className="text-muted-foreground text-sm mt-1">De voorraad is bijgewerkt en de mutaties zijn gelogd.</p>
        </div>
        <Button onClick={() => { setRegels([]); setOpdrachtId(""); setOmschrijving(""); setVoltooid(false); }}>
          Nieuwe uitgifte
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Uitgifte</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Metadata */}
        <Card>
          <CardHeader><CardTitle className="text-base">Opdracht</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Opdracht ID (optioneel)</Label>
              <Input value={opdrachtId} onChange={e => setOpdrachtId(e.target.value)} placeholder="Bijv. 42" type="number" />
            </div>
            <div className="space-y-1">
              <Label>Omschrijving</Label>
              <Input value={omschrijving} onChange={e => setOmschrijving(e.target.value)} placeholder="Bijv. Uitgifte project Brandweerkazerne Almelo" />
            </div>
          </CardContent>
        </Card>

        {/* Artikelen toevoegen */}
        <Card>
          <CardHeader><CardTitle className="text-base">Artikelen selecteren</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 bg-muted/30 rounded-lg">
              <div className="space-y-1">
                <Label className="text-xs">Artikel</Label>
                <Select value={nArtikelId} onValueChange={setNArtikelId}>
                  <SelectTrigger><SelectValue placeholder="Kies artikel" /></SelectTrigger>
                  <SelectContent>
                    {artikelen.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hoeveelheid</Label>
                <Input type="number" min="0.01" step="0.01" value={nHoeveelheid} onChange={e => setNHoeveelheid(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Locatie</Label>
                <Select value={nLocatieId} onValueChange={setNLocatieId}>
                  <SelectTrigger><SelectValue placeholder="Geen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Geen locatie</SelectItem>
                    {locaties.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Koppel reservering</Label>
                <Select value={nReserveringId} onValueChange={setNReserveringId}>
                  <SelectTrigger><SelectValue placeholder="Geen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Geen reservering</SelectItem>
                    {reserveringen
                      .filter(r => !nArtikelId || r.artikel_id === Number(nArtikelId))
                      .map(r => <SelectItem key={r.id} value={String(r.id)}>#{r.id} — {r.artikel_naam ?? ""} ({r.hoeveelheid})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={voegToe} disabled={!nArtikelId || !nHoeveelheid}>
              <Plus className="h-4 w-4 mr-1" /> Toevoegen
            </Button>

            {/* Regellijst */}
            {regels.length > 0 && (
              <div className="space-y-2 mt-2">
                {regels.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-background border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{r.artikel_naam}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.hoeveelheid} st
                        {r.locatie_id && ` · Locatie #${r.locatie_id}`}
                        {r.reservering_id && (
                          <Badge variant="outline" className="ml-1 text-xs">Reservering #{r.reservering_id}</Badge>
                        )}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => verwijderRegel(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={!regels.length || isPending} className="gap-2">
            <PackageCheck className="h-4 w-4" />
            Uitgifte bevestigen ({regels.length} artikel{regels.length !== 1 ? "en" : ""})
          </Button>
        </div>
      </form>
    </div>
  );
}

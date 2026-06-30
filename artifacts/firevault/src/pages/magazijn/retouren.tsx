import { useState } from "react";
import { useCreateRetour, useListArtikelen, useListMagazijnLocaties } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ArchiveRestore } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const CONDITIE_LABELS: Record<string, string> = {
  goed: "Goed — terugplaatsen",
  defect: "Defect — niet terugplaatsen",
  afval: "Afval — vernietigen",
};
const CONDITIE_KLEUR: Record<string, string> = {
  goed: "bg-green-100 text-green-800",
  defect: "bg-red-100 text-red-800",
  afval: "bg-gray-100 text-gray-700",
};

interface RetourRegel {
  artikel_id: number;
  artikel_naam: string;
  hoeveelheid: number;
  locatie_id: number | null;
  conditie: "goed" | "defect" | "afval";
}

export default function MagazijnRetourenPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("magazijn", 3);

  const { data: artikelenData } = useListArtikelen();
  const { data: locaties = [] } = useListMagazijnLocaties();
  const artikelen = artikelenData ?? [];

  const { mutate: retour, isPending } = useCreateRetour();
  const { toast } = useToast();

  const [opdrachtId, setOpdrachtId] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [regels, setRegels] = useState<RetourRegel[]>([]);
  const [nArtikelId, setNArtikelId] = useState("");
  const [nHoeveelheid, setNHoeveelheid] = useState("1");
  const [nLocatieId, setNLocatieId] = useState("");
  const [nConditie, setNConditie] = useState<"goed" | "defect" | "afval">("goed");
  const [voltooid, setVoltooid] = useState(false);

  function voegToe() {
    const artikel = artikelen.find(a => a.id === Number(nArtikelId));
    if (!artikel) return;
    setRegels(prev => [...prev, {
      artikel_id: Number(nArtikelId),
      artikel_naam: artikel.naam,
      hoeveelheid: Number(nHoeveelheid),
      locatie_id: nLocatieId ? Number(nLocatieId) : null,
      conditie: nConditie,
    }]);
    setNArtikelId(""); setNHoeveelheid("1"); setNLocatieId(""); setNConditie("goed");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!regels.length) return;
    retour({
      data: {
        opdracht_id: opdrachtId ? Number(opdrachtId) : null,
        omschrijving,
        regels,
      },
    }, {
      onSuccess: () => {
        setVoltooid(true);
        toast({ title: "Retour verwerkt", description: `${regels.length} artikel(en) teruggeboekt.` });
      },
      onError: () => toast({ title: "Fout bij retour", variant: "destructive" }),
    });
  }

  if (!kanSchrijven) {
    return <div className="p-6"><p className="text-muted-foreground">Je hebt geen toegang tot deze functie.</p></div>;
  }

  if (voltooid) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64 gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
          <ArchiveRestore className="h-8 w-8 text-blue-700" />
        </div>
        <div>
          <p className="text-xl font-semibold">Retour verwerkt</p>
          <p className="text-muted-foreground text-sm mt-1">Goede artikelen zijn teruggeboekt in de voorraad.</p>
        </div>
        <Button onClick={() => { setRegels([]); setOpdrachtId(""); setOmschrijving(""); setVoltooid(false); }}>
          Nieuwe retour
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Retour</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Opdracht</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Opdracht ID (optioneel)</Label>
              <Input value={opdrachtId} onChange={e => setOpdrachtId(e.target.value)} placeholder="Bijv. 42" type="number" />
            </div>
            <div className="space-y-1">
              <Label>Omschrijving</Label>
              <Input value={omschrijving} onChange={e => setOmschrijving(e.target.value)} placeholder="Toelichting retour" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Teruggebrachte artikelen</CardTitle></CardHeader>
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
                <Label className="text-xs">Terugplaatsen op locatie</Label>
                <Select value={nLocatieId} onValueChange={setNLocatieId}>
                  <SelectTrigger><SelectValue placeholder="Geen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Geen locatie</SelectItem>
                    {locaties.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Conditie</Label>
                <Select value={nConditie} onValueChange={v => setNConditie(v as typeof nConditie)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONDITIE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={voegToe} disabled={!nArtikelId || !nHoeveelheid}>
              <Plus className="h-4 w-4 mr-1" /> Toevoegen
            </Button>

            {regels.length > 0 && (
              <div className="space-y-2 mt-2">
                {regels.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-background border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{r.artikel_naam}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        {r.hoeveelheid} st
                        <Badge className={cn("text-xs", CONDITIE_KLEUR[r.conditie])}>
                          {r.conditie}
                        </Badge>
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setRegels(prev => prev.filter((_, j) => j !== i))}>
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
            <ArchiveRestore className="h-4 w-4" />
            Retour verwerken ({regels.length} artikel{regels.length !== 1 ? "en" : ""})
          </Button>
        </div>
      </form>
    </div>
  );
}

import { useState } from "react";
import { CalendarCheck2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  useListMijnVerlofsaldi,
  getListMijnVerlofsaldiQueryKey,
  useListMijnVerlofaanvragen,
  getListMijnVerlofaanvragenQueryKey,
  useListMijnVerlofsoorten,
  getListMijnVerlofsoortenQueryKey,
  useCreateMijnVerlofaanvraag,
} from "@workspace/api-client-react";

// Basislaag eigen gegevens: eigen verlofsaldi en -aanvragen voor iedere
// ingelogde medewerker, ongeacht modulerechten. Backend: /mijn/verlofsaldi,
// /mijn/verlofaanvragen, /mijn/verlofsoorten (alleen-inloggen, sessie-medewerker).

function statusBadge(status: string) {
  switch (status) {
    case "aangevraagd": return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Aangevraagd</Badge>;
    case "goedgekeurd": return <Badge className="bg-green-100 text-green-800 border-green-200">Goedgekeurd</Badge>;
    case "afgewezen":   return <Badge className="bg-red-100 text-red-800 border-red-200">Afgewezen</Badge>;
    case "ingetrokken": return <Badge variant="outline">Ingetrokken</Badge>;
    default:            return <Badge variant="outline">{status}</Badge>;
  }
}

function fmtDatum(d: string) {
  return new Date(d).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
}

function NieuweAanvraagDialog({ open, onSluit }: { open: boolean; onSluit: () => void }) {
  const queryClient = useQueryClient();
  const { data: soorten = [] } = useListMijnVerlofsoorten({
    query: { queryKey: getListMijnVerlofsoortenQueryKey(), enabled: open },
  });
  const { mutateAsync, isPending } = useCreateMijnVerlofaanvraag();
  const [soortId, setSoortId] = useState<string>("");
  const [startDatum, setStartDatum] = useState("");
  const [eindDatum, setEindDatum] = useState("");
  const [uren, setUren] = useState("");
  const [reden, setReden] = useState("");

  async function opslaan() {
    if (!soortId || !startDatum || !eindDatum) return;
    const aantalUren = uren ? parseFloat(uren.replace(",", ".")) : undefined;
    try {
      await mutateAsync({
        data: {
          verlofsoort_id: Number(soortId),
          start_datum: startDatum,
          eind_datum: eindDatum,
          ...(aantalUren && !isNaN(aantalUren) ? { aantal_uren: aantalUren } : {}),
          ...(reden.trim() ? { reden: reden.trim() } : {}),
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListMijnVerlofaanvragenQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListMijnVerlofsaldiQueryKey() }),
      ]);
      toast({ title: "Verlofaanvraag ingediend" });
      setSoortId(""); setStartDatum(""); setEindDatum(""); setUren(""); setReden("");
      onSluit();
    } catch {
      toast({ title: "Aanvraag indienen mislukt", description: "Controleer de invoer en probeer opnieuw.", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onSluit(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuwe verlofaanvraag</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Verlofsoort</Label>
            <Select value={soortId} onValueChange={setSoortId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Kies verlofsoort" />
              </SelectTrigger>
              <SelectContent>
                {soorten.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.naam}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Startdatum</Label>
              <Input className="mt-1" type="date" value={startDatum} onChange={(e) => setStartDatum(e.target.value)} />
            </div>
            <div>
              <Label>Einddatum</Label>
              <Input className="mt-1" type="date" value={eindDatum} onChange={(e) => setEindDatum(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Aantal uren (optioneel)</Label>
            <Input className="mt-1" value={uren} onChange={(e) => setUren(e.target.value)} placeholder="bv. 8" inputMode="decimal" />
          </div>
          <div>
            <Label>Reden (optioneel)</Label>
            <Textarea className="mt-1" rows={2} value={reden} onChange={(e) => setReden(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onSluit} disabled={isPending}>Annuleren</Button>
          <Button onClick={opslaan} disabled={isPending || !soortId || !startDatum || !eindDatum}>
            {isPending ? "Indienen..." : "Aanvraag indienen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MijnVerlofPagina() {
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const { data: saldi = [], isLoading: saldiLaden } = useListMijnVerlofsaldi({
    query: { queryKey: getListMijnVerlofsaldiQueryKey() },
  });
  const { data: aanvragen = [], isLoading: aanvragenLaden } = useListMijnVerlofaanvragen({
    query: { queryKey: getListMijnVerlofaanvragenQueryKey() },
  });

  const huidigJaar = new Date().getFullYear();
  const saldiHuidig = saldi.filter((s) => s.jaar === huidigJaar);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarCheck2 className="h-6 w-6" />
            Mijn verlof
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Uw verlofsaldo en verlofaanvragen
          </p>
        </div>
        <Button onClick={() => setNieuwOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Verlof aanvragen
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saldo {huidigJaar}</CardTitle>
        </CardHeader>
        <CardContent>
          {saldiLaden ? (
            <p className="text-sm text-muted-foreground">Laden...</p>
          ) : saldiHuidig.length === 0 ? (
            <p className="text-sm text-muted-foreground">Er is nog geen verlofsaldo voor u vastgelegd.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {saldiHuidig.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm">{s.verlofsoort_naam ?? `Verlofsoort ${s.verlofsoort_id}`}</span>
                  <span className="font-semibold text-sm">{s.saldo_uren} uur</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aanvragen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {aanvragenLaden ? (
            <p className="text-sm text-muted-foreground">Laden...</p>
          ) : aanvragen.length === 0 ? (
            <p className="text-sm text-muted-foreground">U heeft nog geen verlofaanvragen.</p>
          ) : (
            aanvragen.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{a.verlofsoort_naam ?? `Verlofsoort ${a.verlofsoort_id}`}</span>
                    {statusBadge(a.status)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmtDatum(a.start_datum)} t/m {fmtDatum(a.eind_datum)}
                    {a.aantal_uren ? ` · ${a.aantal_uren} uur` : ""}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <NieuweAanvraagDialog open={nieuwOpen} onSluit={() => setNieuwOpen(false)} />
    </div>
  );
}

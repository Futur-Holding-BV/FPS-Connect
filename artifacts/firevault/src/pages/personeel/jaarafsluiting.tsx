import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListJaarAfsluitingRegels,
  useCreateJaarAfsluitingRegel,
  useUpdateJaarAfsluitingRegel,
  useDeleteJaarAfsluitingRegel,
  useVoerJaarAfsluitingUit,
  useListVerlofsoorten,
  useListWerkgevers,
} from "@workspace/api-client-react";
import type { JaarAfsluitingRegel } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, Pencil, Trash2, Play, Eye, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const HUIDIG_JAAR = new Date().getFullYear();

export default function JaarAfsluitingPagina() {
  const qc = useQueryClient();
  const [jaar, setJaar] = useState(HUIDIG_JAAR - 1);
  const [regelDialog, setRegelDialog] = useState(false);
  const [bewerkRegel, setBewerkRegel] = useState<JaarAfsluitingRegel | null>(null);
  const [droogloopResultaat, setDroogloopResultaat] = useState<unknown>(null);
  const [verwerkDialog, setVerwerkDialog] = useState(false);
  const [bevestigingTekst, setBevestigingTekst] = useState("");

  const { data: regels = [] } = useListJaarAfsluitingRegels({ jaar });
  const { data: verlofsoorten = [] } = useListVerlofsoorten();
  const { data: werkgevers = [] } = useListWerkgevers();

  const createRegel = useCreateJaarAfsluitingRegel();
  const updateRegel = useUpdateJaarAfsluitingRegel();
  const deleteRegel = useDeleteJaarAfsluitingRegel();
  const voerUit = useVoerJaarAfsluitingUit();

  // Formulier
  const leegForm = () => ({
    werkgever_id: "",
    jaar: String(jaar),
    verlofsoort_id: "",
    max_overdracht_uren: "",
    overdracht_verval_datum: "",
    opmerking: "",
  });
  const [form, setForm] = useState(leegForm());

  function openRegelDialog(regel?: JaarAfsluitingRegel) {
    if (regel) {
      setBewerkRegel(regel);
      setForm({
        werkgever_id: regel.werkgever_id != null ? String(regel.werkgever_id) : "",
        jaar: String(regel.jaar),
        verlofsoort_id: regel.verlofsoort_id != null ? String(regel.verlofsoort_id) : "",
        max_overdracht_uren: regel.max_overdracht_uren != null ? String(regel.max_overdracht_uren) : "",
        overdracht_verval_datum: regel.overdracht_verval_datum ?? "",
        opmerking: regel.opmerking ?? "",
      });
    } else {
      setBewerkRegel(null);
      setForm({ ...leegForm(), jaar: String(jaar) });
    }
    setRegelDialog(true);
  }

  async function bewaarRegel() {
    const body = {
      werkgever_id: form.werkgever_id ? Number(form.werkgever_id) : null,
      jaar: Number(form.jaar) || jaar,
      verlofsoort_id: form.verlofsoort_id ? Number(form.verlofsoort_id) : null,
      max_overdracht_uren: form.max_overdracht_uren ? Number(form.max_overdracht_uren) : null,
      overdracht_verval_datum: form.overdracht_verval_datum || null,
      opmerking: form.opmerking || null,
    };
    try {
      if (bewerkRegel) {
        await updateRegel.mutateAsync({ id: bewerkRegel.id, data: body });
      } else {
        await createRegel.mutateAsync({ data: body });
      }
      toast({ title: "Regel opgeslagen" });
      setRegelDialog(false);
      qc.invalidateQueries({ queryKey: ["listJaarAfsluitingRegels"] });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function verwijderRegel(id: number) {
    if (!confirm("Regel verwijderen?")) return;
    try {
      await deleteRegel.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: ["listJaarAfsluitingRegels"] });
      toast({ title: "Regel verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  async function droogloop() {
    try {
      const res = await voerUit.mutateAsync({ data: { jaar, droogloop: true } });
      setDroogloopResultaat(res);
    } catch {
      toast({ title: "Droogloop mislukt", variant: "destructive" });
    }
  }

  async function verwerk() {
    if (bevestigingTekst !== `AFSLUITEN ${jaar}`) {
      toast({ title: "Bevestigingstekst onjuist", variant: "destructive" });
      return;
    }
    try {
      const res = await voerUit.mutateAsync({ data: { jaar, droogloop: false } });
      setVerwerkDialog(false);
      setBevestigingTekst("");
      setDroogloopResultaat(res);
      toast({ title: `Jaarafsluiting ${jaar} uitgevoerd` });
      qc.invalidateQueries({ queryKey: ["listJaarAfsluitingRegels"] });
    } catch {
      toast({ title: "Verwerking mislukt", variant: "destructive" });
    }
  }

  const uitgevoerd = regels.some((r) => r.uitgevoerd_op != null);
  const resultaat = droogloopResultaat as {
    jaar?: number;
    volgend_jaar?: number;
    droogloop?: boolean;
    overdrachten?: { medewerker_naam: string | null; verlofsoort_naam: string | null; saldo_uren: number; over_te_dragen_uren: number; verval_datum: string | null }[];
    totaal_medewerkers?: number;
    totaal_uren?: number;
    uitgevoerd_op?: string;
  } | null;

  const JAREN = [HUIDIG_JAAR - 2, HUIDIG_JAAR - 1, HUIDIG_JAAR];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jaarafsluiting verlof</h1>
          <p className="text-muted-foreground text-sm mt-1">Overdrachtregels configureren en saldo's overdragen naar het volgende jaar</p>
        </div>
        <Select value={String(jaar)} onValueChange={(v) => setJaar(Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {JAREN.map((j) => (
              <SelectItem key={j} value={String(j)}>{j}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {uitgevoerd && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Jaarafsluiting {jaar} is uitgevoerd</AlertTitle>
          <AlertDescription className="text-green-700 text-sm">
            De saldo's zijn overgedragen naar {jaar + 1}. De regels zijn afgesloten op {regels.find((r) => r.uitgevoerd_op)?.uitgevoerd_op?.slice(0, 10)}.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Overdrachtregels — {jaar}</CardTitle>
            <Button size="sm" onClick={() => openRegelDialog()}>
              <Plus className="h-4 w-4 mr-1.5" />
              Regel toevoegen
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {regels.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Geen regels voor {jaar} — standaard alles overdragen zonder limiet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Werkgever</TableHead>
                  <TableHead>Verlofsoort</TableHead>
                  <TableHead className="text-right">Max. overdracht (uren)</TableHead>
                  <TableHead>Vervaldatum overdracht</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regels.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.werkgever_id
                        ? (werkgevers.find((w) => w.id === r.werkgever_id)?.naam ?? `Werkgever ${r.werkgever_id}`)
                        : <span className="text-muted-foreground italic">Alle werkgevers</span>}
                    </TableCell>
                    <TableCell>
                      {r.verlofsoort_id
                        ? (verlofsoorten.find((v) => v.id === r.verlofsoort_id)?.naam ?? `Soort ${r.verlofsoort_id}`)
                        : <span className="text-muted-foreground italic">Alle soorten</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.max_overdracht_uren != null ? `${r.max_overdracht_uren}u` : "Geen limiet"}
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {r.overdracht_verval_datum ?? "—"}
                    </TableCell>
                    <TableCell>
                      {r.uitgevoerd_op
                        ? <Badge className="bg-green-100 text-green-800 border-green-200">Uitgevoerd</Badge>
                        : <Badge variant="outline">Openstaand</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openRegelDialog(r)} disabled={!!r.uitgevoerd_op}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => verwijderRegel(r.id)} disabled={!!r.uitgevoerd_op}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={droogloop} disabled={voerUit.isPending}>
          <Eye className="h-4 w-4 mr-2" />
          Droogloop (preview)
        </Button>
        <Button
          onClick={() => setVerwerkDialog(true)}
          disabled={uitgevoerd || voerUit.isPending}
          className="bg-primary hover:bg-primary/90"
        >
          <Play className="h-4 w-4 mr-2" />
          Jaarafsluiting uitvoeren
        </Button>
      </div>

      {resultaat && (
        <Card className={resultaat.droogloop ? "border-blue-200 bg-blue-50" : "border-green-200 bg-green-50"}>
          <CardHeader>
            <div className="flex items-center gap-2">
              {resultaat.droogloop
                ? <Eye className="h-4 w-4 text-blue-600" />
                : <CheckCircle2 className="h-4 w-4 text-green-600" />}
              <CardTitle className={`text-base ${resultaat.droogloop ? "text-blue-800" : "text-green-800"}`}>
                {resultaat.droogloop ? `Preview — ${jaar} → ${resultaat.volgend_jaar}` : `Uitgevoerd — ${jaar} → ${resultaat.volgend_jaar}`}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold">{resultaat.totaal_medewerkers}</p>
                <p className="text-sm text-muted-foreground">Medewerkers</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{resultaat.totaal_uren}u</p>
                <p className="text-sm text-muted-foreground">Totaal over te dragen</p>
              </div>
            </div>
            {(resultaat.overdrachten ?? []).length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medewerker</TableHead>
                    <TableHead>Verlofsoort</TableHead>
                    <TableHead className="text-right">Huidig saldo</TableHead>
                    <TableHead className="text-right">Over te dragen</TableHead>
                    <TableHead>Verval</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(resultaat.overdrachten ?? []).map((o, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{o.medewerker_naam ?? "?"}</TableCell>
                      <TableCell>{o.verlofsoort_naam ?? "?"}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.saldo_uren}u</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{o.over_te_dragen_uren}u</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{o.verval_datum ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Regel dialoog */}
      <Dialog open={regelDialog} onOpenChange={setRegelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bewerkRegel ? "Regel bewerken" : "Overdrachtregel toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Jaar af te sluiten</Label>
                <Input type="number" value={form.jaar} onChange={(e) => setForm((f) => ({ ...f, jaar: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Werkgever (leeg = alle)</Label>
                <Select value={form.werkgever_id || "alle"} onValueChange={(v) => setForm((f) => ({ ...f, werkgever_id: v === "alle" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Alle werkgevers" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle werkgevers</SelectItem>
                    {werkgevers.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Verlofsoort (leeg = alle soorten)</Label>
              <Select value={form.verlofsoort_id || "alle"} onValueChange={(v) => setForm((f) => ({ ...f, verlofsoort_id: v === "alle" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Alle verlofsoorten" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle verlofsoorten</SelectItem>
                  {verlofsoorten.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Max. overdracht (uren)</Label>
                <Input type="number" placeholder="Geen limiet" value={form.max_overdracht_uren} onChange={(e) => setForm((f) => ({ ...f, max_overdracht_uren: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Vervaldatum overgedragen uren</Label>
                <DatePicker value={form.overdracht_verval_datum} onChange={(v) => setForm((f) => ({ ...f, overdracht_verval_datum: v }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Opmerking</Label>
              <Textarea value={form.opmerking} onChange={(e) => setForm((f) => ({ ...f, opmerking: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegelDialog(false)}>Annuleren</Button>
            <Button onClick={bewaarRegel} disabled={createRegel.isPending || updateRegel.isPending}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verwerking bevestigingsdialoog */}
      <Dialog open={verwerkDialog} onOpenChange={setVerwerkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Jaarafsluiting {jaar} uitvoeren</DialogTitle>
            <DialogDescription>
              Deze actie verwerkt de verlofoverdracht van {jaar} naar {jaar + 1} voor alle medewerkers. Dit is niet te herstellen.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Onomkeerbare actie</AlertTitle>
            <AlertDescription>
              Voer eerst een droogloop uit om te controleren wat er wordt overgedragen.
              Type <strong>AFSLUITEN {jaar}</strong> ter bevestiging.
            </AlertDescription>
          </Alert>
          <Input
            placeholder={`AFSLUITEN ${jaar}`}
            value={bevestigingTekst}
            onChange={(e) => setBevestigingTekst(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerwerkDialog(false)}>Annuleren</Button>
            <Button
              variant="destructive"
              onClick={verwerk}
              disabled={bevestigingTekst !== `AFSLUITEN ${jaar}` || voerUit.isPending}
            >
              Definitief uitvoeren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { useGetVerlofOverzicht, useListAlleVerlofAanvragen, useUpdateVerlofAanvraag } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, Search, Calendar, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const HUIDIG_JAAR = new Date().getFullYear();
const JAREN = [HUIDIG_JAAR - 1, HUIDIG_JAAR, HUIDIG_JAAR + 1];

const STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  aangevraagd: "Aangevraagd",
  goedgekeurd: "Goedgekeurd",
  afgewezen: "Afgewezen",
  ingetrokken: "Ingetrokken",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  concept: "outline",
  aangevraagd: "secondary",
  goedgekeurd: "default",
  afgewezen: "destructive",
  ingetrokken: "outline",
};

export default function VerlofOverzichtPagina() {
  const qc = useQueryClient();
  const [jaar, setJaar] = useState(HUIDIG_JAAR);
  const [zoek, setZoek] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [geselecteerdeAanvraag, setGeselecteerdeAanvraag] = useState<number | null>(null);
  const [opmerkingInput, setOpmerkingInput] = useState("");

  const { data: overzicht, isLoading } = useGetVerlofOverzicht({ jaar });
  const { data: aanvragenData } = useListAlleVerlofAanvragen({ status: statusFilter !== "alle" ? statusFilter : undefined });
  const updateAanvraag = useUpdateVerlofAanvraag();

  const aanvragen = overzicht?.aanvragen ?? [];
  const saldi = overzicht?.saldi ?? [];

  const gefilterd = aanvragen.filter((a) => {
    const naamMatch = a.medewerker_naam?.toLowerCase().includes(zoek.toLowerCase()) ?? false;
    const statusMatch = statusFilter === "alle" || a.status === statusFilter;
    return naamMatch && statusMatch;
  });

  // Groepeer saldi per medewerker
  const saldiPerMedewerker = saldi.reduce<Record<number, typeof saldi>>((acc, s) => {
    if (!acc[s.medewerker_id]) acc[s.medewerker_id] = [];
    acc[s.medewerker_id].push(s);
    return acc;
  }, {});

  const medewerkerNamen = [...new Set(saldi.map((s) => s.medewerker_naam).filter(Boolean))];

  const verlopendeSaldi = saldi.filter((s) => {
    if (!s.vervalt_op) return false;
    const vervalMs = new Date(s.vervalt_op).getTime();
    const drieManenDag = Date.now() + 90 * 24 * 60 * 60 * 1000;
    return vervalMs < drieManenDag && s.saldo_uren > 0;
  });

  async function beoordeel(aanvraagId: number, nieuweStatus: "goedgekeurd" | "afgewezen") {
    const aanvraag = aanvragen.find((a) => a.id === aanvraagId);
    if (!aanvraag) return;
    try {
      await updateAanvraag.mutateAsync({
        id: aanvraagId,
        data: {
          verlofsoort_id: aanvraag.verlofsoort_id,
          start_datum: aanvraag.start_datum,
          eind_datum: aanvraag.eind_datum,
          status: nieuweStatus,
          opmerking: opmerkingInput || undefined,
        },
      });
      toast({ title: nieuweStatus === "goedgekeurd" ? "Verlofaanvraag goedgekeurd" : "Verlofaanvraag afgewezen" });
      setGeselecteerdeAanvraag(null);
      setOpmerkingInput("");
      qc.invalidateQueries({ queryKey: ["getVerlofOverzicht"] });
    } catch {
      toast({ title: "Fout bij beoordelen", variant: "destructive" });
    }
  }

  const geselecteerd = geselecteerdeAanvraag != null
    ? aanvragen.find((a) => a.id === geselecteerdeAanvraag)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Verlofoverzicht</h1>
          <p className="text-muted-foreground text-sm mt-1">Centraal overzicht verlofaanvragen en saldi — {jaar}</p>
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

      {verlopendeSaldi.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">Verlofuren verlopen binnenkort</p>
                <ul className="mt-1 space-y-0.5">
                  {verlopendeSaldi.map((s) => (
                    <li key={s.id} className="text-xs text-amber-700">
                      {s.medewerker_naam} — {s.verlofsoort_naam}: {s.saldo_uren}u verloopt {s.vervalt_op}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Medewerkers met saldo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{medewerkerNamen.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Openstaande aanvragen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{aanvragen.filter((a) => a.status === "aangevraagd").length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Goedgekeurd {jaar}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{aanvragen.filter((a) => a.status === "goedgekeurd").length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Verlofaanvragen</CardTitle>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Zoek medewerker..."
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle statussen</SelectItem>
                <SelectItem value="concept">Concept</SelectItem>
                <SelectItem value="aangevraagd">Aangevraagd</SelectItem>
                <SelectItem value="goedgekeurd">Goedgekeurd</SelectItem>
                <SelectItem value="afgewezen">Afgewezen</SelectItem>
                <SelectItem value="ingetrokken">Ingetrokken</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Laden...</div>
          ) : gefilterd.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Geen verlofaanvragen gevonden
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medewerker</TableHead>
                  <TableHead>Soort</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead className="text-right">Uren</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gefilterd.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.medewerker_naam ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{a.verlofsoort_naam ?? "—"}</TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {a.start_datum} – {a.eind_datum}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.aantal_uren}u</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[a.status] ?? "outline"}>
                        {STATUS_LABEL[a.status] ?? a.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {a.status === "aangevraagd" && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                            onClick={() => { setGeselecteerdeAanvraag(a.id); setOpmerkingInput(""); }}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                            onClick={async () => {
                              if (confirm("Verlofaanvraag afwijzen?")) {
                                await beoordeel(a.id, "afgewezen");
                              }
                            }}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {saldi.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Verlofsaldi per medewerker — {jaar}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medewerker</TableHead>
                  <TableHead>Verlofsoort</TableHead>
                  <TableHead className="text-right">Beginsaldo</TableHead>
                  <TableHead className="text-right">Opgebouwd</TableHead>
                  <TableHead className="text-right">Opgenomen</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Vervalt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saldi.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.medewerker_naam ?? "—"}</TableCell>
                    <TableCell>
                      <span className="text-sm">{s.verlofsoort_naam ?? "—"}</span>
                      {s.verlofsoort_categorie && (
                        <span className="ml-1.5 text-xs text-muted-foreground">({s.verlofsoort_categorie})</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.beginsaldo_uren}u</TableCell>
                    <TableCell className="text-right tabular-nums">{s.opgebouwd_uren}u</TableCell>
                    <TableCell className="text-right tabular-nums text-red-600">{s.opgenomen_uren}u</TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${s.saldo_uren < 0 ? "text-red-600" : ""}`}>
                      {s.saldo_uren}u
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.vervalt_op ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={geselecteerdeAanvraag != null} onOpenChange={() => setGeselecteerdeAanvraag(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verlofaanvraag goedkeuren</DialogTitle>
          </DialogHeader>
          {geselecteerd && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Medewerker</span>
                  <span className="font-medium">{geselecteerd.medewerker_naam}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Verlofsoort</span>
                  <span>{geselecteerd.verlofsoort_naam ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Periode</span>
                  <span className="tabular-nums">{geselecteerd.start_datum} – {geselecteerd.eind_datum}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uren</span>
                  <span className="tabular-nums font-semibold">{geselecteerd.aantal_uren}u</span>
                </div>
                {geselecteerd.reden && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reden</span>
                    <span className="text-right max-w-40">{geselecteerd.reden}</span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Opmerking (optioneel)</label>
                <Input
                  placeholder="Bijv. gecontroleerd met planning"
                  value={opmerkingInput}
                  onChange={(e) => setOpmerkingInput(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => beoordeel(geselecteerd.id, "goedgekeurd")}
                  disabled={updateAanvraag.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Goedkeuren
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => beoordeel(geselecteerd.id, "afgewezen")}
                  disabled={updateAanvraag.isPending}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Afwijzen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import {
  useGetVerlofOverzicht,
  useListAlleVerlofAanvragen,
  useUpdateVerlofAanvraag,
  useGetVerlofVervalsignalen,
  useCreateSaldoCorrectie,
  useListVerlofsoorten,
  useListVerlofCorrectiesVanMedewerker,
  getListVerlofCorrectiesVanMedewerkerQueryKey,
  getListAlleVerlofAanvragenQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CheckCircle, XCircle, Clock, Search, Calendar, AlertTriangle, Users, SlidersHorizontal, History } from "lucide-react";
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

// Genereer de 52 ISO-weken van een jaar als array van { week, start, eind }
function wekenVanJaar(jaar: number) {
  const weken: { week: number; start: Date; eind: Date }[] = [];
  const d = new Date(jaar, 0, 1);
  // Stap naar maandag van de eerste week
  const dag = d.getDay();
  d.setDate(d.getDate() - (dag === 0 ? 6 : dag - 1));
  for (let w = 1; w <= 53; w++) {
    const start = new Date(d);
    const eind = new Date(d);
    eind.setDate(eind.getDate() + 6);
    if (start.getFullYear() > jaar) break;
    weken.push({ week: w, start, eind });
    d.setDate(d.getDate() + 7);
  }
  return weken;
}

function datumTussenIn(datum: string, start: Date, eind: Date) {
  const d = new Date(datum);
  return d >= start && d <= eind;
}

function isoWeek(d: Date): number {
  const dag = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  dag.setUTCDate(dag.getUTCDate() + 4 - (dag.getUTCDay() || 7));
  const nieuwjaar = new Date(Date.UTC(dag.getUTCFullYear(), 0, 1));
  return Math.ceil(((dag.getTime() - nieuwjaar.getTime()) / 86400000 + 1) / 7);
}

export default function VerlofOverzichtPagina() {
  const qc = useQueryClient();
  const [jaar, setJaar] = useState(HUIDIG_JAAR);
  const [zoek, setZoek] = useState("");
  const [statusFilter, setStatusFilter] = useState("aangevraagd");
  const [geselecteerdeIds, setGeselecteerdeIds] = useState<Set<number>>(new Set());
  const [dialogActie, setDialogActie] = useState<"goedkeuren" | "afwijzen" | "bulk-goedkeuren" | "bulk-afwijzen" | null>(null);
  const [dialogAanvraagId, setDialogAanvraagId] = useState<number | null>(null);
  const [redenInput, setRedenInput] = useState("");
  const [opmerkingInput, setOpmerkingInput] = useState("");
  const [bezettingWaarschuwing, setBezettingWaarschuwing] = useState<{ bericht: string; ids: number[] } | null>(null);
  const [mijnTeamFilter, setMijnTeamFilter] = useState(false);

  const [correctieDialog, setCorrectieDialog] = useState<{
    medewerkerId: number;
    verlofsoortId: number;
    medewerkerNaam: string;
    verlofsoortNaam: string;
  } | null>(null);
  const [correctieDeltaUren, setCorrectieJaarField] = useState<string>("");
  const [correctieJaar, setCorrectieJaar] = useState<string>(String(HUIDIG_JAAR));
  const [correctieReden, setCorrectieReden] = useState<string>("");
  const correctieMutatie = useCreateSaldoCorrectie();

  const [historiekDialog, setHistoriekDialog] = useState<{ medewerkerId: number; naam: string } | null>(null);
  const { data: historiekData = [] } = useListVerlofCorrectiesVanMedewerker(
    historiekDialog?.medewerkerId ?? 0,
    {
      query: {
        enabled: historiekDialog != null,
        queryKey: getListVerlofCorrectiesVanMedewerkerQueryKey(historiekDialog?.medewerkerId ?? 0),
      },
    }
  );

  const { data: verlofsoorten = [] } = useListVerlofsoorten();

  const { data: overzicht, isLoading } = useGetVerlofOverzicht({ jaar });
  const { data: alleAanvragenData } = useListAlleVerlofAanvragen(
    undefined,
    { query: { queryKey: getListAlleVerlofAanvragenQueryKey() } }
  );
  const { data: mijnTeamAanvragen } = useListAlleVerlofAanvragen(
    { mijn_team: true },
    { query: { queryKey: getListAlleVerlofAanvragenQueryKey({ mijn_team: true }) } }
  );
  const updateAanvraag = useUpdateVerlofAanvraag();
  const { data: vervalsignalen = [] } = useGetVerlofVervalsignalen();

  const overzichtAanvragen = overzicht?.aanvragen ?? [];
  const aanvragen = mijnTeamFilter
    ? overzichtAanvragen.filter((a) => (mijnTeamAanvragen ?? []).some((m) => m.id === a.id))
    : overzichtAanvragen;
  const saldi = overzicht?.saldi ?? [];

  const gefilterd = aanvragen.filter((a) => {
    const naamMatch = a.medewerker_naam?.toLowerCase().includes(zoek.toLowerCase()) ?? false;
    const statusMatch = statusFilter === "alle" || a.status === statusFilter;
    return naamMatch && statusMatch;
  });

  const aangevraagd = gefilterd.filter((a) => a.status === "aangevraagd");
  const alleGeselecteerdAangevraagd = aangevraagd.length > 0 && aangevraagd.every((a) => geselecteerdeIds.has(a.id));

  const kritiekSignalen = vervalsignalen.filter((s) => s.urgentie === "kritiek");
  const waarschuwingSignalen = vervalsignalen.filter((s) => s.urgentie === "waarschuwing");
  const infoSignalen = vervalsignalen.filter((s) => s.urgentie === "info");

  function toggleSelecteer(id: number) {
    setGeselecteerdeIds((prev) => {
      const volgende = new Set(prev);
      if (volgende.has(id)) volgende.delete(id);
      else volgende.add(id);
      return volgende;
    });
  }

  function toggleAlles() {
    if (alleGeselecteerdAangevraagd) {
      setGeselecteerdeIds((prev) => {
        const volgende = new Set(prev);
        aangevraagd.forEach((a) => volgende.delete(a.id));
        return volgende;
      });
    } else {
      setGeselecteerdeIds((prev) => {
        const volgende = new Set(prev);
        aangevraagd.forEach((a) => volgende.add(a.id));
        return volgende;
      });
    }
  }

  function openDialog(actie: "goedkeuren" | "afwijzen", aanvraagId: number) {
    setDialogActie(actie);
    setDialogAanvraagId(aanvraagId);
    setRedenInput("");
    setOpmerkingInput("");
    setBezettingWaarschuwing(null);
  }

  function openBulkDialog(actie: "bulk-goedkeuren" | "bulk-afwijzen") {
    setDialogActie(actie);
    setDialogAanvraagId(null);
    setRedenInput("");
    setOpmerkingInput("");
    setBezettingWaarschuwing(null);
  }

  function sluitDialog() {
    setDialogActie(null);
    setDialogAanvraagId(null);
    setBezettingWaarschuwing(null);
  }

  async function voerDialogUit(negeerBezetting = false) {
    if (!dialogActie) return;
    const isAfwijzen = dialogActie === "afwijzen" || dialogActie === "bulk-afwijzen";
    if (isAfwijzen && !redenInput.trim()) {
      toast({ title: "Reden is verplicht bij afwijzen", variant: "destructive" });
      return;
    }
    const nieuweStatus = isAfwijzen ? "afgewezen" : "goedgekeurd";

    try {
      if (dialogActie === "goedkeuren" || dialogActie === "afwijzen") {
        if (!dialogAanvraagId) return;
        const aanvraag = overzichtAanvragen.find((a) => a.id === dialogAanvraagId);
        if (!aanvraag) return;
        await updateAanvraag.mutateAsync({
          id: dialogAanvraagId,
          data: {
            verlofsoort_id: aanvraag.verlofsoort_id,
            start_datum: aanvraag.start_datum,
            eind_datum: aanvraag.eind_datum,
            status: nieuweStatus,
            reden: isAfwijzen ? redenInput : undefined,
            opmerking: opmerkingInput || undefined,
            negeer_bezetting: negeerBezetting || undefined,
          },
        });
        toast({ title: nieuweStatus === "goedgekeurd" ? "Verlofaanvraag goedgekeurd" : "Verlofaanvraag afgewezen" });
      } else {
        // Bulk
        const ids = [...geselecteerdeIds];
        const mislukt: number[] = [];
        let bezettingBericht = "";
        await Promise.all(
          ids.map(async (id) => {
            const aanvraag = overzichtAanvragen.find((a) => a.id === id);
            if (!aanvraag) return;
            try {
              await updateAanvraag.mutateAsync({
                id,
                data: {
                  verlofsoort_id: aanvraag.verlofsoort_id,
                  start_datum: aanvraag.start_datum,
                  eind_datum: aanvraag.eind_datum,
                  status: nieuweStatus,
                  reden: isAfwijzen ? redenInput : undefined,
                  opmerking: opmerkingInput || undefined,
                  negeer_bezetting: negeerBezetting || undefined,
                },
              });
            } catch (err) {
              const e = err as { status?: number; data?: { bericht?: string } };
              if (e?.status === 422 && e?.data?.bericht?.includes("bezetting")) {
                mislukt.push(id);
                bezettingBericht = e.data?.bericht ?? "Minimale bezetting niet gehaald";
              }
            }
          }),
        );
        const verwerkt = ids.length - mislukt.length;
        if (verwerkt > 0) {
          toast({ title: `${verwerkt} aanvra${verwerkt === 1 ? "ag" : "gen"} ${nieuweStatus === "goedgekeurd" ? "goedgekeurd" : "afgewezen"}` });
        }
        if (mislukt.length > 0) {
          setBezettingWaarschuwing({ bericht: bezettingBericht, ids: mislukt });
          return;
        }
        setGeselecteerdeIds(new Set());
      }
      sluitDialog();
      qc.invalidateQueries({ queryKey: ["getVerlofOverzicht"] });
      qc.invalidateQueries({ queryKey: ["listAlleVerlofAanvragen"] });
    } catch (err) {
      const e = err as { status?: number; data?: { bericht?: string } };
      if (e?.status === 422 && e?.data?.bericht?.includes("bezetting")) {
        setBezettingWaarschuwing({ bericht: e.data?.bericht ?? "Minimale bezetting niet gehaald", ids: dialogAanvraagId ? [dialogAanvraagId] : [] });
        return;
      }
      toast({ title: "Fout bij verwerken", variant: "destructive" });
    }
  }

  // Teamkalender: goedgekeurde aanvragen per week
  const goedgekeurdAanvragen = (alleAanvragenData ?? aanvragen).filter((a) => a.status === "goedgekeurd");
  const weken = wekenVanJaar(jaar).slice(0, 26); // eerste helft als voorbeeld, uitbreidbaar

  function aanvragenInWeek(week: { start: Date; eind: Date }) {
    return goedgekeurdAanvragen.filter((a) =>
      datumTussenIn(a.start_datum, week.start, week.eind) ||
      datumTussenIn(a.eind_datum, week.start, week.eind) ||
      (new Date(a.start_datum) <= week.start && new Date(a.eind_datum) >= week.eind),
    );
  }

  const medewerkerNamen = [...new Set(saldi.map((s) => s.medewerker_naam).filter(Boolean))];

  const isAfwijsDialog = dialogActie === "afwijzen" || dialogActie === "bulk-afwijzen";
  const isBulkDialog = dialogActie === "bulk-goedkeuren" || dialogActie === "bulk-afwijzen";
  const geselecteerdeAanvraag = dialogAanvraagId != null ? aanvragen.find((a) => a.id === dialogAanvraagId) : null;

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

      {kritiekSignalen.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">Verlofuren vervallen binnen 14 dagen</p>
                <ul className="mt-1 space-y-0.5">
                  {kritiekSignalen.map((s) => (
                    <li key={s.saldo_id} className="text-xs text-red-700">
                      {s.medewerker_naam} — {s.verlofsoort_naam}: {s.saldo_uren}u — vervalt {s.vervalt_op} ({s.dagen_tot_verval} dag{s.dagen_tot_verval === 1 ? "" : "en"})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {waarschuwingSignalen.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">Verlofuren verlopen binnen 30 dagen</p>
                <ul className="mt-1 space-y-0.5">
                  {waarschuwingSignalen.map((s) => (
                    <li key={s.saldo_id} className="text-xs text-amber-700">
                      {s.medewerker_naam} — {s.verlofsoort_naam}: {s.saldo_uren}u — vervalt {s.vervalt_op} ({s.dagen_tot_verval} dagen)
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {infoSignalen.length > 0 && (
        <Card className="border-blue-100 bg-blue-50">
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-800">Verlofuren verlopen de komende 90 dagen</p>
                <ul className="mt-1 space-y-0.5">
                  {infoSignalen.map((s) => (
                    <li key={s.saldo_id} className="text-xs text-blue-700">
                      {s.medewerker_naam} — {s.verlofsoort_naam}: {s.saldo_uren}u — vervalt {s.vervalt_op} ({s.dagen_tot_verval} dagen)
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
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Openstaande aanvragen
            </CardTitle>
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

      <Tabs defaultValue="aanvragen">
        <TabsList>
          <TabsTrigger value="aanvragen">Aanvragen</TabsTrigger>
          <TabsTrigger value="saldi">Saldi</TabsTrigger>
          <TabsTrigger value="teamkalender">Teamkalender</TabsTrigger>
        </TabsList>

        <TabsContent value="aanvragen" className="mt-4 space-y-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Verlofaanvragen</CardTitle>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Zoek medewerker..."
                    value={zoek}
                    onChange={(e) => setZoek(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setGeselecteerdeIds(new Set()); }}>
                  <SelectTrigger className="w-44">
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
                <Button
                  size="sm"
                  variant={mijnTeamFilter ? "default" : "outline"}
                  onClick={() => { setMijnTeamFilter((v) => !v); setGeselecteerdeIds(new Set()); }}
                  className="gap-1.5"
                >
                  <Users className="h-3.5 w-3.5" />
                  Mijn team
                </Button>
                {geselecteerdeIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{geselecteerdeIds.size} geselecteerd</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-700 border-green-200 hover:bg-green-50"
                      onClick={() => openBulkDialog("bulk-goedkeuren")}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                      Goedkeuren
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => openBulkDialog("bulk-afwijzen")}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1.5" />
                      Afwijzen
                    </Button>
                  </div>
                )}
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
                      {statusFilter === "aangevraagd" && (
                        <TableHead className="w-10">
                          <Checkbox
                            checked={alleGeselecteerdAangevraagd}
                            onCheckedChange={toggleAlles}
                          />
                        </TableHead>
                      )}
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
                      <TableRow key={a.id} className={geselecteerdeIds.has(a.id) ? "bg-muted/40" : ""}>
                        {statusFilter === "aangevraagd" && (
                          <TableCell>
                            {a.status === "aangevraagd" && (
                              <Checkbox
                                checked={geselecteerdeIds.has(a.id)}
                                onCheckedChange={() => toggleSelecteer(a.id)}
                              />
                            )}
                          </TableCell>
                        )}
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
                                onClick={() => openDialog("goedkeuren", a.id)}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                                onClick={() => openDialog("afwijzen", a.id)}
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
        </TabsContent>

        <TabsContent value="saldi" className="mt-4">
          {saldi.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                Geen verlofsaldi gevonden voor {jaar}
              </CardContent>
            </Card>
          ) : (
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
                      <TableHead></TableHead>
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
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Saldo corrigeren"
                              onClick={() => {
                                setCorrectieDialog({
                                  medewerkerId: s.medewerker_id,
                                  verlofsoortId: s.verlofsoort_id,
                                  medewerkerNaam: s.medewerker_naam ?? "—",
                                  verlofsoortNaam: s.verlofsoort_naam ?? "—",
                                });
                                setCorrectieJaarField("");
                                setCorrectieJaar(String(jaar));
                                setCorrectieReden("");
                              }}
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground"
                              title="Correctiehistoriek"
                              onClick={() => setHistoriekDialog({ medewerkerId: s.medewerker_id, naam: s.medewerker_naam ?? "—" })}
                            >
                              <History className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="teamkalender" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Teamkalender — goedgekeurd verlof {jaar}</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">Weken met goedgekeurd verlof per medewerker. Geeft inzicht in teambezetting.</p>
            </CardHeader>
            <CardContent className="p-0">
              {goedgekeurdAanvragen.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Geen goedgekeurd verlof gevonden voor {jaar}</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">Week</TableHead>
                        <TableHead>Periode</TableHead>
                        <TableHead className="text-right">Medewerkers op verlof</TableHead>
                        <TableHead>Namen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {weken
                        .map((w) => ({ ...w, aanvragenInWeek: aanvragenInWeek(w) }))
                        .filter((w) => w.aanvragenInWeek.length > 0)
                        .map((w) => {
                          const uniekeMedewerkers = [
                            ...new Map(w.aanvragenInWeek.map((a) => [a.medewerker_id, a.medewerker_naam])).entries(),
                          ];
                          const bezetting = uniekeMedewerkers.length;
                          const kleur = bezetting >= 3 ? "text-red-600 font-semibold" : bezetting >= 2 ? "text-amber-600 font-medium" : "";
                          return (
                            <TableRow key={w.week}>
                              <TableCell className="text-center font-mono text-sm">{w.week}</TableCell>
                              <TableCell className="text-sm tabular-nums text-muted-foreground">
                                {w.start.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} –{" "}
                                {w.eind.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                              </TableCell>
                              <TableCell className={`text-right tabular-nums ${kleur}`}>{bezetting}</TableCell>
                              <TableCell className="text-sm">
                                {uniekeMedewerkers.map(([, naam]) => naam ?? "—").join(", ")}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Saldo-correctie dialog */}
      {correctieDialog && (
        <Dialog open onOpenChange={() => setCorrectieDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Saldo corrigeren</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-3 text-sm space-y-1 bg-muted/40">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Medewerker</span>
                  <span className="font-medium">{correctieDialog.medewerkerNaam}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Verlofsoort</span>
                  <span>{correctieDialog.verlofsoortNaam}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Verlofsoort</Label>
                  <Select
                    value={String(correctieDialog.verlofsoortId)}
                    onValueChange={(v) => setCorrectieDialog((d) => d ? { ...d, verlofsoortId: Number(v) } : null)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {verlofsoorten.map((vs) => (
                        <SelectItem key={vs.id} value={String(vs.id)}>{vs.naam}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Jaar</Label>
                  <Select value={correctieJaar} onValueChange={setCorrectieJaar}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {JAREN.map((j) => <SelectItem key={j} value={String(j)}>{j}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Aanpassing in uren{" "}
                  <span className="text-muted-foreground font-normal">(positief = extra verlof, negatief = intrekking)</span>
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="Bijv. 8 of -4"
                  value={correctieDeltaUren}
                  onChange={(e) => setCorrectieJaarField(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reden <span className="text-red-500">*</span></Label>
                <Textarea
                  placeholder="Verplicht: beschrijf de reden voor de correctie"
                  value={correctieReden}
                  onChange={(e) => setCorrectieReden(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setCorrectieDialog(null)}>Annuleren</Button>
              <Button
                disabled={!correctieDeltaUren || !correctieReden.trim() || correctieMutatie.isPending}
                onClick={async () => {
                  if (!correctieDialog) return;
                  try {
                    await correctieMutatie.mutateAsync({
                      id: correctieDialog.medewerkerId,
                      data: {
                        verlofsoort_id: correctieDialog.verlofsoortId,
                        jaar: Number(correctieJaar),
                        delta_uren: Number(correctieDeltaUren),
                        reden: correctieReden.trim(),
                      },
                    });
                    toast({ title: "Correctie opgeslagen" });
                    qc.invalidateQueries({ queryKey: ["getVerlofOverzicht"] });
                    setCorrectieDialog(null);
                  } catch {
                    toast({ title: "Opslaan mislukt", variant: "destructive" });
                  }
                }}
              >
                Opslaan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Correctie-historiek dialog */}
      {historiekDialog && (
        <Dialog open onOpenChange={() => setHistoriekDialog(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Correctiehistoriek — {historiekDialog.naam}</DialogTitle>
            </DialogHeader>
            {historiekData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Geen correcties geregistreerd</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Verlofsoort</TableHead>
                    <TableHead>Jaar</TableHead>
                    <TableHead className="text-right">Aanpassing</TableHead>
                    <TableHead>Reden</TableHead>
                    <TableHead>Door</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historiekData.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {new Date(c.aangemaakt_op).toLocaleDateString("nl-NL")}
                      </TableCell>
                      <TableCell className="text-sm">{c.verlofsoort_naam ?? "—"}</TableCell>
                      <TableCell className="text-sm tabular-nums">{c.jaar}</TableCell>
                      <TableCell className={`text-right tabular-nums font-semibold ${c.delta_uren < 0 ? "text-red-600" : "text-green-700"}`}>
                        {c.delta_uren > 0 ? "+" : ""}{c.delta_uren}u
                      </TableCell>
                      <TableCell className="text-sm max-w-48 truncate" title={c.reden}>{c.reden}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.uitgevoerd_door_naam ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setHistoriekDialog(null)}>Sluiten</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={dialogActie !== null} onOpenChange={(open) => { if (!open) sluitDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isAfwijsDialog ? "Verlofaanvraag afwijzen" : "Verlofaanvraag goedkeuren"}
              {isBulkDialog && ` (${geselecteerdeIds.size} aanvragen)`}
            </DialogTitle>
          </DialogHeader>

          {!isBulkDialog && geselecteerdeAanvraag && (
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Medewerker</span>
                <span className="font-medium">{geselecteerdeAanvraag.medewerker_naam}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Verlofsoort</span>
                <span>{geselecteerdeAanvraag.verlofsoort_naam ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Periode</span>
                <span className="tabular-nums">{geselecteerdeAanvraag.start_datum} – {geselecteerdeAanvraag.eind_datum}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uren</span>
                <span className="tabular-nums font-semibold">{geselecteerdeAanvraag.aantal_uren}u</span>
              </div>
              {geselecteerdeAanvraag.reden && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reden aanvrager</span>
                  <span className="text-right max-w-48">{geselecteerdeAanvraag.reden}</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {isAfwijsDialog && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Reden afwijzing <span className="text-red-500">*</span>
                </label>
                <Textarea
                  placeholder="Verplicht: geef een reden op voor de afwijzing"
                  value={redenInput}
                  onChange={(e) => setRedenInput(e.target.value)}
                  rows={3}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Opmerking (optioneel)</label>
              <Input
                placeholder="Bijv. gecontroleerd met planning"
                value={opmerkingInput}
                onChange={(e) => setOpmerkingInput(e.target.value)}
              />
            </div>
            {bezettingWaarschuwing && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-800">Minimale bezetting</p>
                    <p className="text-xs text-amber-700">{bezettingWaarschuwing.bericht}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-amber-300 text-amber-800 hover:bg-amber-100"
                  onClick={() => voerDialogUit(true)}
                  disabled={updateAanvraag.isPending}
                >
                  Toch goedkeuren (bezetting overschrijven)
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={sluitDialog}>
              Annuleren
            </Button>
            <Button
              variant={isAfwijsDialog ? "destructive" : "default"}
              onClick={() => voerDialogUit()}
              disabled={updateAanvraag.isPending || (isAfwijsDialog && !redenInput.trim())}
            >
              {isAfwijsDialog ? (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  {isBulkDialog ? `${geselecteerdeIds.size} afwijzen` : "Afwijzen"}
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {isBulkDialog ? `${geselecteerdeIds.size} goedkeuren` : "Goedkeuren"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

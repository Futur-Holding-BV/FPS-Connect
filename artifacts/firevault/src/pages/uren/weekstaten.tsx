import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWeekStaten,
  useWeekStaatGoedkeuren,
  useWeekStaatAfwijzen,
  useVergrendelWeekStaat,
  useOntgrendelWeekStaat,
  useListMedewerkers,
  useGetWeekStaat,
  useCreateTijdVoorTijdAanvraag,
  getGetWeekStaatQueryKey,
} from "@workspace/api-client-react";
import type { WeekStaat } from "@workspace/api-client-react";
import {
  Card, CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CheckCircle2, XCircle, Eye, ChevronLeft, ChevronRight, CalendarDays, Lock, Unlock, Clock } from "lucide-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

function isoWeek(datum: Date): number {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const jaarStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - jaarStart.getTime()) / 86400000 + 1) / 7);
}

const STATUS_LABELS: Record<string, string> = {
  concept: "Concept",
  ingediend: "Ter goedkeuring",
  goedgekeurd: "Goedgekeurd",
  afgewezen: "Afgewezen",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  concept: "secondary",
  ingediend: "outline",
  goedgekeurd: "default",
  afgewezen: "destructive",
};

function formatUren(u: number | null | undefined): string {
  if (u == null) return "—";
  const h = Math.floor(u);
  const m = Math.round((u - h) * 60);
  return m > 0 ? `${h}u ${m}m` : `${h}u`;
}

// ── Weekstaat detail-dialog ────────────────────────────────────────────────────

export function TijdVoorTijdAanvraagDialog({
  open,
  onClose,
  onAangevraagd,
}: {
  open: boolean;
  onClose: () => void;
  onAangevraagd: () => void;
}) {
  const [startDatum, setStartDatum] = useState("");
  const [eindDatum, setEindDatum] = useState("");
  const [aantalUren, setAantalUren] = useState("8");
  const [reden, setReden] = useState("");
  const aanvragen = useCreateTijdVoorTijdAanvraag();

  async function bewaar() {
    if (!startDatum || !eindDatum || !aantalUren) {
      toast({ title: "Vul startdatum, einddatum en aantal uren in", variant: "destructive" });
      return;
    }
    try {
      await aanvragen.mutateAsync({
        data: {
          start_datum: startDatum,
          eind_datum: eindDatum,
          aantal_uren: Number(aantalUren),
          reden: reden || undefined,
        },
      });
      toast({ title: "Tijd-voor-tijd aangevraagd" });
      setStartDatum("");
      setEindDatum("");
      setAantalUren("8");
      setReden("");
      onAangevraagd();
      onClose();
    } catch {
      toast({ title: "Aanvragen mislukt", description: "Controleer of er een tijd-voor-tijd verlofsoort is ingesteld.", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Tijd-voor-tijd aanvragen</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Dit legt rechtstreeks een verlofaanvraag vast (geen dubbele invoer in uren) — deze verschijnt daarna in uw weekstaat.
          </p>
          <div className="space-y-1.5">
            <Label>Startdatum</Label>
            <DatePicker value={startDatum} onChange={setStartDatum} />
          </div>
          <div className="space-y-1.5">
            <Label>Einddatum</Label>
            <DatePicker value={eindDatum} onChange={setEindDatum} />
          </div>
          <div className="space-y-1.5">
            <Label>Aantal uren</Label>
            <input
              type="number"
              min={0}
              step="0.25"
              value={aantalUren}
              onChange={(e) => setAantalUren(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Toelichting</Label>
            <Textarea value={reden} onChange={(e) => setReden(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={bewaar} disabled={aanvragen.isPending}>
            {aanvragen.isPending ? "Bezig…" : "Aanvragen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WeekStaatDetailDialog({
  id,
  open,
  onClose,
}: {
  id: number;
  open: boolean;
  onClose: () => void;
}) {
  const { data: ws } = useGetWeekStaat(id);
  const { heeftNiveau } = useBevoegdheid();
  const isManager = heeftNiveau("uren", 2);
  const queryClient = useQueryClient();

  const goedkeuren = useWeekStaatGoedkeuren();
  const afwijzen = useWeekStaatAfwijzen();
  const vergrendelen = useVergrendelWeekStaat();
  const ontgrendelen = useOntgrendelWeekStaat();
  const [afwijzingReden, setAfwijzingReden] = useState("");
  const [toontAfwijzingForm, setToontAfwijzingForm] = useState(false);
  const [toontTijdVoorTijdForm, setToontTijdVoorTijdForm] = useState(false);

  if (!ws) return null;

  const dagen = Array.from({ length: 7 }, (_, i) => {
    const ma = new Date((ws as any).datum_van + "T00:00:00");
    const dag = new Date(ma);
    dag.setDate(ma.getDate() + i);
    return dag.toISOString().slice(0, 10);
  });

  const urenPerDag = (datum: string) =>
    ((ws as any).uren ?? []).filter((u: any) => u.datum === datum);

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Weekstaat — Week {ws.week_nummer} {ws.jaar} — {ws.medewerker_naam}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Status: </span>
              <Badge variant={STATUS_VARIANT[ws.status] ?? "secondary"}>
                {STATUS_LABELS[ws.status] ?? ws.status}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Totaal: </span>
              <span className="font-semibold">{formatUren(ws.totaal_uren)}</span>
            </div>
            {(ws.adv_uren ?? 0) > 0 && (
              <div>
                <span className="text-muted-foreground">ADV opgebouwd: </span>
                <span className="font-semibold">{formatUren(ws.adv_uren)}</span>
              </div>
            )}
          </div>

          {ws.afwijzing_reden && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Afwijzingsreden: {ws.afwijzing_reden}
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dag</TableHead>
                <TableHead>Project / Gebouw</TableHead>
                <TableHead>Tijd</TableHead>
                <TableHead className="text-right">Uren</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dagen.map((d) => {
                const dagUren = urenPerDag(d);
                if (dagUren.length === 0) {
                  return (
                    <TableRow key={d}>
                      <TableCell className="text-sm">
                        {new Date(d + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" })}
                      </TableCell>
                      <TableCell colSpan={3} className="text-muted-foreground text-sm">Geen uren</TableCell>
                    </TableRow>
                  );
                }
                return dagUren.map((u: any, i: number) => (
                  <TableRow key={u.id}>
                    {i === 0 && (
                      <TableCell className="text-sm" rowSpan={dagUren.length}>
                        {new Date(d + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" })}
                      </TableCell>
                    )}
                    <TableCell className="text-sm">{u.gebouw_naam ?? u.project_naam ?? "—"}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{u.begin_tijd} – {u.eind_tijd}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatUren(u.netto_uren)}</TableCell>
                  </TableRow>
                ));
              })}
              <TableRow>
                <TableCell colSpan={3} className="font-semibold text-right">Totaal</TableCell>
                <TableCell className="text-right font-bold font-mono">{formatUren(ws.totaal_uren)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Verlof in deze week
              </h3>
              {!isManager && (
                <Button variant="outline" size="sm" onClick={() => setToontTijdVoorTijdForm(true)}>
                  <Clock className="h-3.5 w-3.5 mr-1" /> Tijd-voor-tijd aanvragen
                </Button>
              )}
            </div>
            {(ws.verlof ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen verlof in deze week.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Soort</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead className="text-right">Uren</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(ws.verlof ?? []).map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="text-sm">{v.verlofsoort_naam}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(v.start_datum + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                        {" – "}
                        {new Date(v.eind_datum + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatUren(v.aantal_uren)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{v.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {isManager && ws.status === "ingediend" && (
            <div className="space-y-2">
              {toontAfwijzingForm ? (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Reden voor afwijzing..."
                    value={afwijzingReden}
                    onChange={(e) => setAfwijzingReden(e.target.value)}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!afwijzingReden.trim() || afwijzen.isPending}
                      onClick={() =>
                        afwijzen.mutate(
                          { id: ws.id, data: { reden: afwijzingReden } },
                          { onSuccess: onClose }
                        )
                      }
                    >
                      Afwijzen bevestigen
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setToontAfwijzingForm(false)}>
                      Annuleren
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      goedkeuren.mutate(
                        { id: ws.id },
                        { onSuccess: onClose }
                      )
                    }
                    disabled={goedkeuren.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Goedkeuren
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setToontAfwijzingForm(true)}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Afwijzen
                  </Button>
                </div>
              )}
            </div>
          )}

          {isManager && (
            <div className="pt-2 border-t">
              {(ws as any).vergrendeld ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-amber-700">
                    <Lock className="h-4 w-4" />
                    <span>
                      Vergrendeld{(ws as any).vergrendeld_door_naam ? ` door ${(ws as any).vergrendeld_door_naam}` : ""}
                      {(ws as any).vergrendeld_op
                        ? ` op ${new Date((ws as any).vergrendeld_op).toLocaleDateString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                        : ""}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => ontgrendelen.mutate({ id: ws.id }, { onSuccess: onClose })}
                    disabled={ontgrendelen.isPending}
                  >
                    <Unlock className="h-4 w-4 mr-1" />
                    Ontgrendelen
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => vergrendelen.mutate({ id: ws.id }, { onSuccess: onClose })}
                  disabled={vergrendelen.isPending}
                >
                  <Lock className="h-4 w-4 mr-1" />
                  Week vergrendelen
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Sluiten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <TijdVoorTijdAanvraagDialog
      open={toontTijdVoorTijdForm}
      onClose={() => setToontTijdVoorTijdForm(false)}
      onAangevraagd={() => queryClient.invalidateQueries({ queryKey: getGetWeekStaatQueryKey(id) })}
    />
    </>
  );
}

// ── Weekstaten pagina ─────────────────────────────────────────────────────────

export default function WeekstatenPagina({ inline = false }: { inline?: boolean }) {
  const nu = new Date();
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [statusFilter, setStatusFilter] = useState("alle");
  const [medewerkerId, setMedewerkerId] = useState("alle");
  const [gekozenId, setGekozenId] = useState<number | null>(null);

  const { data: medewerkers = [] } = useListMedewerkers();
  const { data: weekstaten = [], isLoading } = useListWeekStaten({
    jaar,
    status: statusFilter !== "alle" ? statusFilter : undefined,
    medewerker_id: medewerkerId !== "alle" ? Number(medewerkerId) : undefined,
  } as Parameters<typeof useListWeekStaten>[0]);

  const ingediend = weekstaten.filter((w) => w.status === "ingediend").length;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setJaar((j) => j - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium w-14 text-center">{jaar}</span>
          <Button variant="outline" size="icon" onClick={() => setJaar((j) => j + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Select value={medewerkerId} onValueChange={setMedewerkerId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Alle medewerkers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle medewerkers</SelectItem>
            {medewerkers.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Alle statussen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            <SelectItem value="concept">Concept</SelectItem>
            <SelectItem value="ingediend">Ter goedkeuring</SelectItem>
            <SelectItem value="goedgekeurd">Goedgekeurd</SelectItem>
            <SelectItem value="afgewezen">Afgewezen</SelectItem>
          </SelectContent>
        </Select>
        {ingediend > 0 && (
          <Badge variant="outline" className="border-orange-500 text-orange-600">
            {ingediend} ter goedkeuring
          </Badge>
        )}
      </div>

      {/* Tabel */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center h-40 text-muted-foreground text-sm">Laden...</div>
          ) : weekstaten.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <CalendarDays className="h-8 w-8 opacity-30" />
              <p className="text-sm">Geen weekstaten gevonden</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead>Medewerker</TableHead>
                  <TableHead className="text-right">Totaal</TableHead>
                  <TableHead className="text-right">ADV</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ingediend</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {weekstaten.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {(w as any).vergrendeld && <Lock className="h-3.5 w-3.5 text-amber-600" />}
                        W{w.week_nummer} {w.jaar}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{w.medewerker_naam ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatUren(w.totaal_uren)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {(w.adv_uren ?? 0) > 0 ? formatUren(w.adv_uren) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[w.status] ?? "secondary"}>
                        {STATUS_LABELS[w.status] ?? w.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {w.ingediend_op
                        ? new Date(w.ingediend_op).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setGekozenId(w.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {gekozenId !== null && (
        <WeekStaatDetailDialog
          id={gekozenId}
          open={gekozenId !== null}
          onClose={() => setGekozenId(null)}
        />
      )}
    </div>
  );
}

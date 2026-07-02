import { useState } from "react";
import { useListUren, useListWeekStaten, useListMedewerkers } from "@workspace/api-client-react";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Clock, CalendarDays, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import WeekstatenPagina from "./weekstaten";

// ── Helpers ────────────────────────────────────────────────────────────────────

function isoWeek(datum: Date): number {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const jaarStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - jaarStart.getTime()) / 86400000 + 1) / 7);
}

function weekGrenzen(jaar: number, week: number): { van: string; tot: string } {
  const jan4 = new Date(Date.UTC(jaar, 0, 4));
  const dag = jan4.getUTCDay() || 7;
  const ma = new Date(jan4);
  ma.setUTCDate(jan4.getUTCDate() - dag + 1 + (week - 1) * 7);
  const zo = new Date(ma);
  zo.setUTCDate(ma.getUTCDate() + 6);
  return {
    van: ma.toISOString().slice(0, 10),
    tot: zo.toISOString().slice(0, 10),
  };
}

const DAG_NAMEN = ["ma", "di", "wo", "do", "vr", "za", "zo"];

const STATUS_LABELS: Record<string, string> = {
  concept: "Concept",
  ingediend: "Ingediend",
  goedgekeurd: "Goedgekeurd",
  afgewezen: "Afgewezen",
};

const WERKZAAMHEID_CATEGORIEEN = [
  "Branddeuren",
  "Brandwerend glas",
  "Doorvoeringen",
  "Brandkleppen",
  "Manchetten",
  "Coating",
  "Applicaties",
  "Inspectie",
  "Herstelwerkzaamheden",
  "Overleg",
  "Transport / materiaal",
  "Cursus / opleiding",
  "Magazijn",
  "Reistijd",
  "Kantoor",
  "Overig",
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  concept: "secondary",
  ingediend: "outline",
  goedgekeurd: "default",
  afgewezen: "destructive",
};

function formatUren(u: number): string {
  const h = Math.floor(u);
  const m = Math.round((u - h) * 60);
  return m > 0 ? `${h}u ${m}m` : `${h}u`;
}

function formatDatum(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

// ── Weeknavigatie ──────────────────────────────────────────────────────────────

function WeekNavigator({
  jaar,
  week,
  onChange,
}: {
  jaar: number;
  week: number;
  onChange: (j: number, w: number) => void;
}) {
  const { van, tot } = weekGrenzen(jaar, week);

  function vorige() {
    let nw = week - 1;
    let nj = jaar;
    if (nw < 1) { nj -= 1; nw = isoWeek(new Date(nj, 11, 28)); }
    onChange(nj, nw);
  }

  function volgende() {
    const maxWeek = isoWeek(new Date(jaar, 11, 28));
    let nw = week + 1;
    let nj = jaar;
    if (nw > maxWeek) { nj += 1; nw = 1; }
    onChange(nj, nw);
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={vorige}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium min-w-[160px] text-center">
        Week {week} &mdash; {new Date(van + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} t/m {new Date(tot + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
      </span>
      <Button variant="outline" size="icon" onClick={volgende}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ── Overzicht urenregistraties ─────────────────────────────────────────────────

function UrenOverzichtTab() {
  const nu = new Date();
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [week, setWeek] = useState(isoWeek(nu));
  const [medewerkerId, setMedewerkerId] = useState<string>("alle");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [categorieFilter, setCategorieFilter] = useState<string>("alle");

  const { van, tot } = weekGrenzen(jaar, week);

  const { data: medewerkers = [] } = useListMedewerkers();
  const { data: urenRaw = [], isLoading } = useListUren({
    datum_van: van,
    datum_tot: tot,
    medewerker_id: medewerkerId !== "alle" ? Number(medewerkerId) : undefined,
    status: statusFilter !== "alle" ? statusFilter : undefined,
  } as Parameters<typeof useListUren>[0]);

  const uren = categorieFilter === "alle"
    ? urenRaw
    : urenRaw.filter((u) => u.werkzaamheid_categorie === categorieFilter);

  const totaalUren = uren.reduce((acc, u) => acc + u.netto_uren, 0);
  const goedgekeurd = uren.filter((u) => u.status === "goedgekeurd").reduce((acc, u) => acc + u.netto_uren, 0);
  const openstaand = uren.filter((u) => u.status === "concept" || u.status === "ingediend").length;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <WeekNavigator jaar={jaar} week={week} onChange={(j, w) => { setJaar(j); setWeek(w); }} />
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
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Alle statussen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            <SelectItem value="concept">Concept</SelectItem>
            <SelectItem value="ingediend">Ingediend</SelectItem>
            <SelectItem value="goedgekeurd">Goedgekeurd</SelectItem>
            <SelectItem value="afgewezen">Afgewezen</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categorieFilter} onValueChange={setCategorieFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Alle categorieen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle categorieen</SelectItem>
            {WERKZAAMHEID_CATEGORIEEN.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI-kaarten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Totaal gewerkt</p>
            <p className="text-2xl font-bold">{formatUren(totaalUren)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Goedgekeurd</p>
            <p className="text-2xl font-bold text-green-600">{formatUren(goedgekeurd)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Registraties</p>
            <p className="text-2xl font-bold">{uren.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Open / ter goedkeuring</p>
            <p className="text-2xl font-bold text-orange-600">{openstaand}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabel */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center h-40 text-muted-foreground text-sm">Laden...</div>
          ) : uren.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Clock className="h-8 w-8 opacity-30" />
              <p className="text-sm">Geen urenregistraties in deze week</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Medewerker</TableHead>
                  <TableHead>Project / Gebouw</TableHead>
                  <TableHead>Categorie</TableHead>
                  <TableHead>Tijd</TableHead>
                  <TableHead className="text-right">Uren</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uren.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDatum(u.datum)}</TableCell>
                    <TableCell className="text-sm">{u.medewerker_naam ?? "—"}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {u.gebouw_naam ?? u.project_naam ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-col gap-1">
                        {u.werkzaamheid_categorie && (
                          <Badge variant="outline" className="w-fit text-xs">{u.werkzaamheid_categorie}</Badge>
                        )}
                        {u.ruimte && (
                          <span className="text-xs text-muted-foreground">{u.ruimte}</span>
                        )}
                        {!u.werkzaamheid_categorie && (u.werkzaamheden ?? "—")}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {u.begin_tijd} – {u.eind_tijd}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatUren(u.netto_uren)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[u.status] ?? "secondary"}>
                        {STATUS_LABELS[u.status] ?? u.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Hoofd-pagina ──────────────────────────────────────────────────────────────

export default function UrenPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const isManager = heeftNiveau("uren", 1);

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Urenregistratie</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overzicht van geregistreerde uren en weekstaten
          </p>
        </div>
      </div>

      {isManager ? (
        <Tabs defaultValue="uren">
          <TabsList>
            <TabsTrigger value="uren">
              <Clock className="h-4 w-4 mr-2" />
              Uren
            </TabsTrigger>
            <TabsTrigger value="weekstaten">
              <CalendarDays className="h-4 w-4 mr-2" />
              Weekstaten
            </TabsTrigger>
          </TabsList>
          <TabsContent value="uren" className="mt-4">
            <UrenOverzichtTab />
          </TabsContent>
          <TabsContent value="weekstaten" className="mt-4">
            <WeekstatenPagina inline />
          </TabsContent>
        </Tabs>
      ) : (
        <UrenOverzichtTab />
      )}
    </div>
  );
}

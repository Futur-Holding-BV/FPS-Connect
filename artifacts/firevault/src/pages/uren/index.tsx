import { useState, useRef } from "react";
import {
  useListUren, useListMedewerkers, useCreateUrenRegistratie,
  useListOpdrachten, useGetMijnWerk,
} from "@workspace/api-client-react";
import type { Opdracht } from "@workspace/api-client-react";
import {
  Card, CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Clock, CalendarDays, ChevronLeft, ChevronRight, Plus, ChevronsUpDown,
  CheckIcon, Building2, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import WeekstatenPagina, { TijdVoorTijdAanvraagDialog } from "./weekstaten";

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
  "Meerwerk",
  "Overleg",
  "Transport / materiaal",
  "Cursus / opleiding",
  "Magazijn",
  "Reistijd",
  "Kantoor",
  "Overig",
];

const STATUS_LABELS: Record<string, string> = {
  concept: "Concept",
  ingediend: "Ingediend",
  goedgekeurd: "Goedgekeurd",
  afgewezen: "Afgewezen",
};

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

function vandaagStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Weeknavigatie ──────────────────────────────────────────────────────────────

function WeekNavigator({
  jaar, week, onChange,
}: {
  jaar: number; week: number; onChange: (j: number, w: number) => void;
}) {
  const { van, tot } = weekGrenzen(jaar, week);
  function vorige() {
    let nw = week - 1; let nj = jaar;
    if (nw < 1) { nj -= 1; nw = isoWeek(new Date(nj, 11, 28)); }
    onChange(nj, nw);
  }
  function volgende() {
    const maxWeek = isoWeek(new Date(jaar, 11, 28));
    let nw = week + 1; let nj = jaar;
    if (nw > maxWeek) { nj += 1; nw = 1; }
    onChange(nj, nw);
  }
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={vorige}><ChevronLeft className="h-4 w-4" /></Button>
      <span className="text-sm font-medium min-w-[160px] text-center">
        Week {week} &mdash;{" "}
        {new Date(van + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} t/m{" "}
        {new Date(tot + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
      </span>
      <Button variant="outline" size="icon" onClick={volgende}><ChevronRight className="h-4 w-4" /></Button>
    </div>
  );
}

// ── Opdracht combobox ──────────────────────────────────────────────────────────

function OpdrachtCombobox({
  value, onChange,
}: {
  value: Opdracht | null;
  onChange: (o: Opdracht | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState("");
  const { data: opdrachten = [] } = useListOpdrachten({ per_pagina: 200 } as Parameters<typeof useListOpdrachten>[0]);

  const gefilterd = opdrachten.filter((o) => {
    const q = zoek.toLowerCase();
    return (
      o.titel.toLowerCase().includes(q) ||
      (o.werknummer ?? "").toLowerCase().includes(q) ||
      (o.gebouw_naam ?? "").toLowerCase().includes(q)
    );
  }).slice(0, 50);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          {value ? (
            <span className="truncate">
              {value.werknummer ? `${value.werknummer} — ` : ""}{value.titel}
            </span>
          ) : (
            <span className="text-muted-foreground">Kies een opdracht (optioneel)</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Zoek op titel, werknummer of gebouw..."
            value={zoek}
            onValueChange={setZoek}
          />
          <CommandList>
            <CommandEmpty>Geen opdrachten gevonden</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value=""
                onSelect={() => { onChange(null); setOpen(false); setZoek(""); }}
              >
                <CheckIcon className={cn("mr-2 h-4 w-4", value === null ? "opacity-100" : "opacity-0")} />
                <span className="text-muted-foreground">Geen koppeling</span>
              </CommandItem>
              {gefilterd.map((o) => (
                <CommandItem
                  key={o.id}
                  value={String(o.id)}
                  onSelect={() => { onChange(o); setOpen(false); setZoek(""); }}
                >
                  <CheckIcon className={cn("mr-2 h-4 w-4", value?.id === o.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-sm">
                      {o.werknummer ? <span className="text-muted-foreground mr-1">{o.werknummer}</span> : null}
                      {o.titel}
                    </span>
                    {o.gebouw_naam && (
                      <span className="text-xs text-muted-foreground truncate">{o.gebouw_naam}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Uren invoer dialog ─────────────────────────────────────────────────────────

const LEEG_FORM = {
  datum: vandaagStr(),
  begin_tijd: "08:00",
  eind_tijd: "17:00",
  pauze_minuten: "30",
  werkzaamheid_categorie: "",
  werkzaamheden: "",
  opmerkingen: "",
};

function UrenInvoerDialog({
  open, onClose, onOpgeslagen,
}: {
  open: boolean;
  onClose: () => void;
  onOpgeslagen: () => void;
}) {
  const [form, setForm] = useState(LEEG_FORM);
  const [opdracht, setOpdracht] = useState<Opdracht | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const aanmaken = useCreateUrenRegistratie();

  function set(k: keyof typeof LEEG_FORM, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function bereken(): number {
    const [bh, bm] = form.begin_tijd.split(":").map(Number);
    const [eh, em] = form.eind_tijd.split(":").map(Number);
    const totaal = (eh * 60 + em) - (bh * 60 + bm) - (parseInt(form.pauze_minuten) || 0);
    return Math.max(0, totaal) / 60;
  }

  async function opslaan() {
    setFout(null);
    if (!form.datum || !form.begin_tijd || !form.eind_tijd) {
      setFout("Datum, begintijd en eindtijd zijn verplicht.");
      return;
    }
    if (bereken() <= 0) {
      setFout("Eindtijd moet na begintijd liggen (na pauze).");
      return;
    }
    try {
      await aanmaken.mutateAsync({
        data: {
          datum: form.datum,
          begin_tijd: form.begin_tijd,
          eind_tijd: form.eind_tijd,
          pauze_minuten: parseInt(form.pauze_minuten) || 0,
          werkzaamheid_categorie: form.werkzaamheid_categorie || null,
          werkzaamheden: form.werkzaamheden || null,
          opmerkingen: form.opmerkingen || null,
          gebouw_id: opdracht?.gebouw_id ?? null,
          project_id: opdracht?.project_id ?? null,
          project_naam: opdracht?.titel ?? null,
        },
      });
      setForm(LEEG_FORM);
      setOpdracht(null);
      onOpgeslagen();
      onClose();
    } catch {
      setFout("Opslaan mislukt. Probeer het opnieuw.");
    }
  }

  const nettoUren = bereken();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Uren registreren</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Datum</Label>
              <Input type="date" value={form.datum} onChange={(e) => set("datum", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Pauze (min)</Label>
              <Input
                type="number" min={0} step={5}
                value={form.pauze_minuten}
                onChange={(e) => set("pauze_minuten", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Begintijd</Label>
              <Input type="time" value={form.begin_tijd} onChange={(e) => set("begin_tijd", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Eindtijd</Label>
              <Input type="time" value={form.eind_tijd} onChange={(e) => set("eind_tijd", e.target.value)} />
            </div>
          </div>

          {nettoUren > 0 && (
            <p className="text-sm text-muted-foreground -mt-1">
              Netto: <strong>{formatUren(nettoUren)}</strong>
            </p>
          )}

          <div className="grid gap-1.5">
            <Label>Opdracht</Label>
            <OpdrachtCombobox value={opdracht} onChange={setOpdracht} />
          </div>

          <div className="grid gap-1.5">
            <Label>Categorie</Label>
            <Select value={form.werkzaamheid_categorie} onValueChange={(v) => set("werkzaamheid_categorie", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Kies een categorie (optioneel)" />
              </SelectTrigger>
              <SelectContent>
                {WERKZAAMHEID_CATEGORIEEN.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Werkzaamheden</Label>
            <Textarea
              placeholder="Korte omschrijving van de werkzaamheden..."
              value={form.werkzaamheden}
              onChange={(e) => set("werkzaamheden", e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Opmerkingen</Label>
            <Textarea
              placeholder="Optionele toelichting..."
              value={form.opmerkingen}
              onChange={(e) => set("opmerkingen", e.target.value)}
              rows={2}
            />
          </div>

          {fout && <p className="text-sm text-destructive">{fout}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={opslaan} disabled={aanmaken.isPending}>
            {aanmaken.isPending ? "Opslaan..." : "Registreren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Vandaag — planning items ───────────────────────────────────────────────────

function VandaagTab() {
  const { data: gebouwen = [], isLoading } = useGetMijnWerk();

  const totaalSpots = gebouwen.reduce((acc, g) => acc + (g.spots?.length ?? 0), 0);

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex justify-center items-center h-40 text-muted-foreground text-sm">Laden...</div>
      ) : gebouwen.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
          <Briefcase className="h-8 w-8 opacity-30" />
          <p className="text-sm">Geen actieve werkitems voor vandaag</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {gebouwen.length} {gebouwen.length === 1 ? "gebouw" : "gebouwen"} — {totaalSpots} spots
          </p>
          {gebouwen.map((g) => (
            <Card key={g.gebouw_id}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-medium text-sm">{g.gebouw_naam}</p>
                    <p className="text-xs text-muted-foreground">{g.adres}, {g.stad}</p>
                  </div>
                </div>
                {g.spots && g.spots.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {g.spots.map((s: { id: number; objectnummer?: string; type?: string; status?: string }) => (
                      <Badge key={s.id} variant="outline" className="text-xs">
                        {s.objectnummer ?? `Spot ${s.id}`}
                        {s.type ? ` — ${s.type}` : ""}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Overzicht urenregistraties ─────────────────────────────────────────────────

function UrenOverzichtTab({ onNieuw }: { onNieuw: () => void }) {
  const nu = new Date();
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [week, setWeek] = useState(isoWeek(nu));
  const [medewerkerId, setMedewerkerId] = useState<string>("alle");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [categorieFilter, setCategorieFilter] = useState<string>("alle");

  const { van, tot } = weekGrenzen(jaar, week);

  const { data: medewerkers = [] } = useListMedewerkers();
  const { data: urenRaw = [], isLoading, refetch } = useListUren({
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

  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <WeekNavigator jaar={jaar} week={week} onChange={(j, w) => { setJaar(j); setWeek(w); }} />
          <Select value={medewerkerId} onValueChange={setMedewerkerId}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Alle medewerkers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle medewerkers</SelectItem>
              {medewerkers.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Alle statussen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle statussen</SelectItem>
              <SelectItem value="concept">Concept</SelectItem>
              <SelectItem value="ingediend">Ingediend</SelectItem>
              <SelectItem value="goedgekeurd">Goedgekeurd</SelectItem>
              <SelectItem value="afgewezen">Afgewezen</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categorieFilter} onValueChange={setCategorieFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Alle categorieen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle categorieen</SelectItem>
              {WERKZAAMHEID_CATEGORIEEN.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={onNieuw}>
          <Plus className="h-4 w-4 mr-1" />
          Registreren
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Totaal gewerkt</p>
          <p className="text-2xl font-bold">{formatUren(totaalUren)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Goedgekeurd</p>
          <p className="text-2xl font-bold text-green-600">{formatUren(goedgekeurd)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Registraties</p>
          <p className="text-2xl font-bold">{uren.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Open / ter goedkeuring</p>
          <p className="text-2xl font-bold text-orange-600">{openstaand}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center h-40 text-muted-foreground text-sm">Laden...</div>
          ) : uren.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Clock className="h-8 w-8 opacity-30" />
              <p className="text-sm">Geen urenregistraties in deze week</p>
              <Button size="sm" variant="outline" onClick={onNieuw}>
                <Plus className="h-4 w-4 mr-1" />
                Uren registreren
              </Button>
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
  const [invoerOpen, setInvoerOpen] = useState(false);
  const [tijdVoorTijdOpen, setTijdVoorTijdOpen] = useState(false);
  const [refreshTeller, setRefreshTeller] = useState(0);

  function handleOpgeslagen() {
    setRefreshTeller((t) => t + 1);
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Urenregistratie</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overzicht van geregistreerde uren en weekstaten
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setTijdVoorTijdOpen(true)}>
            <Clock className="h-4 w-4 mr-1" />
            Tijd-voor-tijd aanvragen
          </Button>
          <Button onClick={() => setInvoerOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Uren registreren
          </Button>
        </div>
      </div>

      <UrenInvoerDialog
        open={invoerOpen}
        onClose={() => setInvoerOpen(false)}
        onOpgeslagen={handleOpgeslagen}
      />

      <TijdVoorTijdAanvraagDialog
        open={tijdVoorTijdOpen}
        onClose={() => setTijdVoorTijdOpen(false)}
        onAangevraagd={handleOpgeslagen}
      />

      {isManager ? (
        <Tabs defaultValue="uren">
          <TabsList>
            <TabsTrigger value="vandaag">
              <Briefcase className="h-4 w-4 mr-2" />
              Vandaag
            </TabsTrigger>
            <TabsTrigger value="uren">
              <Clock className="h-4 w-4 mr-2" />
              Uren
            </TabsTrigger>
            <TabsTrigger value="weekstaten">
              <CalendarDays className="h-4 w-4 mr-2" />
              Weekstaten
            </TabsTrigger>
          </TabsList>
          <TabsContent value="vandaag" className="mt-4">
            <VandaagTab />
          </TabsContent>
          <TabsContent value="uren" className="mt-4">
            <UrenOverzichtTab key={refreshTeller} onNieuw={() => setInvoerOpen(true)} />
          </TabsContent>
          <TabsContent value="weekstaten" className="mt-4">
            <WeekstatenPagina inline />
          </TabsContent>
        </Tabs>
      ) : (
        <Tabs defaultValue="vandaag">
          <TabsList>
            <TabsTrigger value="vandaag">
              <Briefcase className="h-4 w-4 mr-2" />
              Vandaag
            </TabsTrigger>
            <TabsTrigger value="uren">
              <Clock className="h-4 w-4 mr-2" />
              Mijn uren
            </TabsTrigger>
          </TabsList>
          <TabsContent value="vandaag" className="mt-4">
            <VandaagTab />
          </TabsContent>
          <TabsContent value="uren" className="mt-4">
            <UrenOverzichtTab key={refreshTeller} onNieuw={() => setInvoerOpen(true)} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

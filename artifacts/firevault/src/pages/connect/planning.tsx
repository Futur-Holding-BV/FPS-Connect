import { useState, useMemo, useCallback } from "react";
import {
  useListPlanningMedewerkers,
  useListPlanningItems,
  useListPlanningAfwezigheid,
  useCreatePlanningItem,
  useUpdatePlanningItem,
  useDeletePlanningItem,
  useListGebouwen,
  useListProjectBegrotingen,
  useCreateProjectBegroting,
  useUpdateProjectBegroting,
  useDeleteProjectBegroting,
  useGetPlanningNacalculatie,
  type PlanningItem,
  type PlanningMedewerker,
  type ProjectBegroting,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, CalendarDays,
  AlertTriangle, Users, FolderOpen, BarChart3, Clock,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Datum-hulpfuncties ─────────────────────────────────────────────────────

const DAGNAMES_KORT = ["Ma", "Di", "Wo", "Do", "Vr"];
const DAGNAMES_LANG = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag"];

function getISOWeekMonday(jaar: number, week: number): Date {
  const jan4 = new Date(jaar, 0, 4);
  const dag  = jan4.getDay() || 7;
  const ma   = new Date(jan4);
  ma.setDate(jan4.getDate() - (dag - 1) + (week - 1) * 7);
  return ma;
}

function getISOWeek(d: Date): { week: number; jaar: number } {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
  const week1 = new Date(dt.getFullYear(), 0, 4);
  const week  =
    1 +
    Math.round(
      ((dt.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    );
  return { week, jaar: dt.getFullYear() };
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatKorteDatum(d: Date): string {
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "numeric" });
}

function weekDagen(jaar: number, week: number): Date[] {
  const ma = getISOWeekMonday(jaar, week);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(ma);
    d.setDate(ma.getDate() + i);
    return d;
  });
}

// ── Status / kleur ─────────────────────────────────────────────────────────

const STATUS_KLEUR: Record<string, string> = {
  concept:    "bg-slate-100 border-slate-300 text-slate-700",
  ingepland:  "bg-blue-100  border-blue-300  text-blue-800",
  bevestigd:  "bg-amber-100 border-amber-300 text-amber-800",
  uitgevoerd: "bg-green-100 border-green-300 text-green-800",
};

const STATUS_LABEL: Record<string, string> = {
  concept:    "Concept",
  ingepland:  "Ingepland",
  bevestigd:  "Bevestigd",
  uitgevoerd: "Uitgevoerd",
};

const OPDRACHT_KLEUR: Record<string, string> = {
  hoofdopdracht: "bg-primary/10 text-primary border-primary/30",
  meerwerk:      "bg-purple-100 text-purple-700 border-purple-300",
};

// ── Planning blok kaartje ──────────────────────────────────────────────────

function PlanningBlokKaart({
  item,
  onClick,
}: {
  item: PlanningItem;
  onClick: () => void;
}) {
  const kleur = STATUS_KLEUR[item.status] ?? STATUS_KLEUR.concept;
  const project = item.gebouw_naam ?? item.project_naam ?? item.titel;
  const locaties = item.locaties ? (() => {
    try { return (JSON.parse(item.locaties) as string[]).join(", "); }
    catch { return item.locaties; }
  })() : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded border px-2 py-1.5 text-xs mb-1 transition-opacity hover:opacity-80",
        kleur,
      )}
    >
      <div className="font-semibold truncate">{project}</div>
      {item.werknummer && (
        <div className="text-[10px] opacity-70">{item.werknummer}</div>
      )}
      {item.opdracht_type && (
        <span className={cn("inline-block text-[10px] px-1 rounded border mt-0.5", OPDRACHT_KLEUR[item.opdracht_type] ?? "")}>
          {item.opdracht_type === "meerwerk" ? "Meerwerk" : "Hoofd"}
        </span>
      )}
      {item.omschrijving && (
        <div className="truncate opacity-70 mt-0.5">{item.omschrijving}</div>
      )}
      {locaties && (
        <div className="truncate opacity-70">{locaties}</div>
      )}
      <div className="mt-0.5 opacity-80">
        {item.tijd_start && item.tijd_eind
          ? `${item.tijd_start}–${item.tijd_eind} · ${item.uren}u`
          : `${item.uren}u`}
      </div>
    </button>
  );
}

// ── Verlofblok ─────────────────────────────────────────────────────────────

function VerlofBlok({ type }: { type: string }) {
  return (
    <div className="w-full rounded border bg-amber-200 border-amber-400 px-2 py-1.5 text-xs text-amber-900 font-semibold mb-1">
      {type === "vakantie" ? "Verlof" : type === "ziekte" ? "Ziek" : type === "adv" ? "ADV" : type}
    </div>
  );
}

// ── Planning blok aanmaken / bewerken dialog ───────────────────────────────

interface BlokDialogProps {
  open: boolean;
  onClose: () => void;
  medewerkers: PlanningMedewerker[];
  gebouwen: { id: number; naam: string }[];
  defaultMedewerkerId?: number | null;
  defaultDatum?: string;
  editItem?: PlanningItem | null;
}

function PlanningBlokDialog({
  open, onClose, medewerkers, gebouwen, defaultMedewerkerId, defaultDatum, editItem,
}: BlokDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!editItem;

  const [medewerkerId, setMedewerkerId] = useState(String(editItem?.medewerker_id ?? defaultMedewerkerId ?? ""));
  const [datum,        setDatum]        = useState(editItem?.datum_start ?? defaultDatum ?? "");
  const [gebouwId,     setGebouwId]     = useState(String(editItem?.gebouw_id ?? ""));
  const [projectNaam,  setProjectNaam]  = useState(editItem?.project_naam ?? "");
  const [werknummer,   setWerknummer]   = useState(editItem?.werknummer ?? "");
  const [opdrachtType, setOpdrachtType] = useState(editItem?.opdracht_type ?? "hoofdopdracht");
  const [omschrijving, setOmschrijving] = useState(editItem?.omschrijving ?? "");
  const [locatiesRaw,  setLocatiesRaw]  = useState(() => {
    if (!editItem?.locaties) return "";
    try { return (JSON.parse(editItem.locaties) as string[]).join(", "); }
    catch { return editItem.locaties; }
  });
  const [tijdStart,    setTijdStart]    = useState(editItem?.tijd_start ?? "07:00");
  const [tijdEind,     setTijdEind]     = useState(editItem?.tijd_eind  ?? "17:00");
  const [uren,         setUren]         = useState(String(editItem?.uren ?? 8));
  const [status,       setStatus]       = useState(editItem?.status ?? "concept");
  const [notities,     setNotities]     = useState(editItem?.notities ?? "");

  const maakAan   = useCreatePlanningItem();
  const bijwerken = useUpdatePlanningItem();
  const verwijder = useDeletePlanningItem();

  const gesGebouw = gebouwen.find((g) => String(g.id) === gebouwId);

  const parseLocaties = (raw: string): string => {
    const arr = raw.split(",").map((s) => s.trim()).filter(Boolean);
    return arr.length ? JSON.stringify(arr) : "";
  };

  async function opslaan() {
    if (!datum) return;
    const titelStr = projectNaam || gesGebouw?.naam || "Werk";
    const payload = {
      titel: titelStr,
      medewerker_id: medewerkerId ? Number(medewerkerId) : undefined,
      gebouw_id:     gebouwId     ? Number(gebouwId)     : undefined,
      project_naam:  projectNaam  || undefined,
      werknummer:    werknummer   || undefined,
      opdracht_type: opdrachtType || undefined,
      omschrijving:  omschrijving || undefined,
      locaties:      parseLocaties(locatiesRaw) || undefined,
      datum_start: datum,
      datum_eind:  datum,
      tijd_start:  tijdStart || undefined,
      tijd_eind:   tijdEind  || undefined,
      uren: parseFloat(uren) || 8,
      status,
      type: "uitvoering",
      notities: notities || undefined,
    };
    try {
      if (isEdit && editItem) {
        await bijwerken.mutateAsync({ id: editItem.id, data: payload as any });
      } else {
        await maakAan.mutateAsync({ data: payload as any });
      }
      await qc.invalidateQueries({ queryKey: ["listPlanningItems"] });
      onClose();
    } catch {
      toast({ title: "Fout bij opslaan", variant: "destructive" });
    }
  }

  async function verwijderen() {
    if (!editItem) return;
    try {
      await verwijder.mutateAsync({ id: editItem.id });
      await qc.invalidateQueries({ queryKey: ["listPlanningItems"] });
      onClose();
    } catch {
      toast({ title: "Fout bij verwijderen", variant: "destructive" });
    }
  }

  const bezig = maakAan.isPending || bijwerken.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Planningsblok bewerken" : "Planningsblok toevoegen"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Uitvoerder</Label>
              <Select value={medewerkerId} onValueChange={setMedewerkerId}>
                <SelectTrigger><SelectValue placeholder="Kies medewerker" /></SelectTrigger>
                <SelectContent>
                  {medewerkers.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.naam}{m.functie ? ` — ${m.functie}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Datum</Label>
              <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Gebouw / project</Label>
              <Select value={gebouwId} onValueChange={setGebouwId}>
                <SelectTrigger><SelectValue placeholder="Kies gebouw" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— geen koppeling —</SelectItem>
                  {gebouwen.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Werknummer</Label>
              <Input
                placeholder="bijv. 2025-147"
                value={werknummer}
                onChange={(e) => setWerknummer(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Projectnaam (vrij)</Label>
              <Input
                placeholder={gesGebouw?.naam ?? "bijv. Fazant"}
                value={projectNaam}
                onChange={(e) => setProjectNaam(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Opdracht type</Label>
              <Select value={opdrachtType} onValueChange={setOpdrachtType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoofdopdracht">Hoofdopdracht</SelectItem>
                  <SelectItem value="meerwerk">Meerwerk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Werkomschrijving</Label>
              <Input
                placeholder="bijv. brandwerende doorvoeringen begane grond"
                value={omschrijving}
                onChange={(e) => setOmschrijving(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Woningnummers / bouwnummers / locaties</Label>
              <Input
                placeholder="bijv. 47, 48, hal, gang A (komma-gescheiden)"
                value={locatiesRaw}
                onChange={(e) => setLocatiesRaw(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Starttijd</Label>
              <Input type="time" value={tijdStart} onChange={(e) => setTijdStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Eindtijd</Label>
              <Input type="time" value={tijdEind} onChange={(e) => setTijdEind(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Geplande uren</Label>
              <Input
                type="number"
                min={0.5}
                step={0.5}
                value={uren}
                onChange={(e) => setUren(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="concept">Concept</SelectItem>
                  <SelectItem value="ingepland">Ingepland</SelectItem>
                  <SelectItem value="bevestigd">Bevestigd</SelectItem>
                  <SelectItem value="uitgevoerd">Uitgevoerd</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Opmerkingen</Label>
              <Textarea
                placeholder="Aanvullende informatie..."
                rows={2}
                value={notities}
                onChange={(e) => setNotities(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {isEdit && (
            <Button variant="destructive" size="sm" onClick={verwijderen} disabled={bezig}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Verwijderen
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={opslaan} disabled={!datum || bezig}>
            {bezig ? "Bezig..." : isEdit ? "Opslaan" : "Toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Week-navigator ──────────────────────────────────────────────────────────

function WeekNavigator({
  jaar, week,
  onVorige, onVolgende, onHeden,
}: {
  jaar: number; week: number;
  onVorige: () => void; onVolgende: () => void; onHeden: () => void;
}) {
  const ma = getISOWeekMonday(jaar, week);
  const vr = new Date(ma); vr.setDate(ma.getDate() + 4);
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={onVorige}><ChevronLeft className="w-4 h-4" /></Button>
      <div className="text-sm font-medium min-w-[180px] text-center">
        Week {week} · {formatKorteDatum(ma)} – {formatKorteDatum(vr)} {jaar}
      </div>
      <Button variant="outline" size="icon" onClick={onVolgende}><ChevronRight className="w-4 h-4" /></Button>
      <Button variant="outline" size="sm" onClick={onHeden}>
        <CalendarDays className="w-3.5 h-3.5 mr-1" />
        Heden
      </Button>
    </div>
  );
}

// ── Filtertbalk ─────────────────────────────────────────────────────────────

function Filterbalk({
  wmFilter, setWmFilter,
  dvFilter, setDvFilter,
  projectFilter, setProjectFilter,
  statusFilter, setStatusFilter,
  opdrachtFilter, setOpdrachtFilter,
  medewerkers,
  gebouwen,
}: {
  wmFilter: string; setWmFilter: (v: string) => void;
  dvFilter: string; setDvFilter: (v: string) => void;
  projectFilter: string; setProjectFilter: (v: string) => void;
  statusFilter: string; setStatusFilter: (v: string) => void;
  opdrachtFilter: string; setOpdrachtFilter: (v: string) => void;
  medewerkers: PlanningMedewerker[];
  gebouwen: { id: number; naam: string }[];
}) {
  const werkmaatschappijen = [...new Set(medewerkers.map((m) => m.werkmaatschappij).filter(Boolean))];
  const dienstverbanden    = [...new Set(medewerkers.map((m) => m.dienstverband).filter(Boolean))];

  return (
    <div className="flex flex-wrap gap-2">
      <Select value={wmFilter} onValueChange={setWmFilter}>
        <SelectTrigger className="w-44 h-8 text-xs">
          <SelectValue placeholder="Alle werkmaatschappijen" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Alle werkmaatschappijen</SelectItem>
          {werkmaatschappijen.map((w) => (
            <SelectItem key={w!} value={w!}>{w}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={dvFilter} onValueChange={setDvFilter}>
        <SelectTrigger className="w-40 h-8 text-xs">
          <SelectValue placeholder="Dienstverband" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Alle dienstverbanden</SelectItem>
          {dienstverbanden.map((d) => (
            <SelectItem key={d!} value={d!}>{d}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={projectFilter} onValueChange={setProjectFilter}>
        <SelectTrigger className="w-48 h-8 text-xs">
          <SelectValue placeholder="Alle projecten" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Alle projecten</SelectItem>
          {gebouwen.map((g) => (
            <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-36 h-8 text-xs">
          <SelectValue placeholder="Alle statussen" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Alle statussen</SelectItem>
          <SelectItem value="concept">Concept</SelectItem>
          <SelectItem value="ingepland">Ingepland</SelectItem>
          <SelectItem value="bevestigd">Bevestigd</SelectItem>
          <SelectItem value="uitgevoerd">Uitgevoerd</SelectItem>
        </SelectContent>
      </Select>

      <Select value={opdrachtFilter} onValueChange={setOpdrachtFilter}>
        <SelectTrigger className="w-40 h-8 text-xs">
          <SelectValue placeholder="Hoofd / meerwerk" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Hoofd- en meerwerk</SelectItem>
          <SelectItem value="hoofdopdracht">Alleen hoofdopdracht</SelectItem>
          <SelectItem value="meerwerk">Alleen meerwerk</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Tab 1: Medewerkers ─────────────────────────────────────────────────────

function MedewerkersTab({
  medewerkers, items, afwezigheid, dagen, isLoadingItems,
  statusFilter, opdrachtFilter, projectFilter,
  onBlokKlik, onNieuwBlok,
}: {
  medewerkers: PlanningMedewerker[];
  items: PlanningItem[];
  afwezigheid: { medewerker_id: number; type: string; datum_start: string; datum_eind: string }[];
  dagen: Date[];
  isLoadingItems: boolean;
  statusFilter: string; opdrachtFilter: string; projectFilter: string;
  onBlokKlik: (item: PlanningItem) => void;
  onNieuwBlok: (medewerkerId: number, datum: string) => void;
}) {
  const gefilterdeMedwerkers = useMemo(() => medewerkers, [medewerkers]);

  if (isLoadingItems) {
    return (
      <div className="space-y-3 mt-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  if (gefilterdeMedwerkers.length === 0) {
    return (
      <Card className="mt-6">
        <CardContent className="py-16 text-center text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Geen uitvoerend personeel gevonden</p>
          <p className="text-sm mt-1">
            Voeg medewerkers toe met een uitvoerende functie (monteur, timmerman, zzp, uitzendkracht)
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left p-2 bg-muted/50 border border-border rounded-tl font-medium text-xs w-48 sticky left-0 z-10">
              Medewerker
            </th>
            {dagen.map((d, i) => (
              <th key={i} className="p-2 bg-muted/50 border border-border text-center text-xs font-medium min-w-[140px]">
                <div>{DAGNAMES_KORT[i]}</div>
                <div className="text-muted-foreground font-normal">{formatKorteDatum(d)}</div>
              </th>
            ))}
            <th className="p-2 bg-muted/50 border border-border text-center text-xs font-medium w-20 rounded-tr">
              Totaal
            </th>
          </tr>
        </thead>
        <tbody>
          {gefilterdeMedwerkers.map((med) => {
            const medItems = items.filter((it) => {
              if (it.medewerker_id !== med.id) return false;
              if (statusFilter   && it.status       !== statusFilter)   return false;
              if (opdrachtFilter && it.opdracht_type !== opdrachtFilter) return false;
              if (projectFilter  && String(it.gebouw_id) !== projectFilter) return false;
              return true;
            });
            const geplandUren = medItems.reduce((s, it) => s + it.uren, 0);
            const contractUren = med.contracturenPerWeek ?? 40;
            const resterend = contractUren - geplandUren;
            const overgepland = geplandUren > contractUren;

            return (
              <tr key={med.id} className="hover:bg-muted/20 transition-colors">
                {/* Medewerker info */}
                <td className="p-2 border border-border align-top sticky left-0 bg-background z-10">
                  <div className="font-semibold text-xs">{med.naam}</div>
                  {med.functie && <div className="text-[10px] text-muted-foreground">{med.functie}</div>}
                  {med.dienstverband && <div className="text-[10px] text-muted-foreground">{med.dienstverband}</div>}
                  <div className="mt-1 text-[10px] space-y-0.5">
                    <div className="text-muted-foreground">{contractUren}u contract</div>
                    <div className={cn("font-medium", overgepland ? "text-red-600" : "text-green-700")}>
                      {geplandUren.toFixed(1)}u gepland
                    </div>
                    <div className={cn("text-[10px]", resterend < 0 ? "text-red-500" : "text-muted-foreground")}>
                      {resterend < 0 ? `${Math.abs(resterend).toFixed(1)}u over` : `${resterend.toFixed(1)}u vrij`}
                    </div>
                    {overgepland && (
                      <div className="flex items-center gap-0.5 text-red-600">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        <span>Overgepland</span>
                      </div>
                    )}
                  </div>
                </td>

                {/* Dag-cellen */}
                {dagen.map((dag, i) => {
                  const dagStr = toISODate(dag);
                  const dagItems = medItems.filter((it) => it.datum_start === dagStr || (it.datum_start <= dagStr && it.datum_eind >= dagStr));
                  const isVerlof = afwezigheid.some(
                    (af) => af.medewerker_id === med.id && af.datum_start <= dagStr && af.datum_eind >= dagStr,
                  );
                  const afwObj = isVerlof ? afwezigheid.find(
                    (af) => af.medewerker_id === med.id && af.datum_start <= dagStr && af.datum_eind >= dagStr,
                  ) : null;

                  return (
                    <td key={i} className="p-1.5 border border-border align-top">
                      {isVerlof && afwObj && <VerlofBlok type={afwObj.type} />}
                      {dagItems.map((it) => (
                        <PlanningBlokKaart key={it.id} item={it} onClick={() => onBlokKlik(it)} />
                      ))}
                      {!isVerlof && (
                        <button
                          onClick={() => onNieuwBlok(med.id, dagStr)}
                          className="w-full h-6 rounded border border-dashed border-muted-foreground/30 text-muted-foreground/50 hover:border-primary/50 hover:text-primary/60 transition-colors flex items-center justify-center"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  );
                })}

                {/* Totaal */}
                <td className="p-2 border border-border text-center align-top">
                  <div className={cn("text-xs font-bold", overgepland ? "text-red-600" : "")}>
                    {geplandUren.toFixed(1)}u
                  </div>
                  <div className="text-[10px] text-muted-foreground">{contractUren}u</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab 2: Projecten ────────────────────────────────────────────────────────

function ProjectenTab({
  items, medewerkers, begrotingen, dagen, isLoadingItems,
  statusFilter, opdrachtFilter,
  onBlokKlik, onNieuwBlok,
}: {
  items: PlanningItem[];
  medewerkers: PlanningMedewerker[];
  begrotingen: ProjectBegroting[];
  dagen: Date[];
  isLoadingItems: boolean;
  statusFilter: string; opdrachtFilter: string;
  onBlokKlik: (item: PlanningItem) => void;
  onNieuwBlok: (gebouwId: number | null, datum: string) => void;
}) {
  const projecten = useMemo(() => {
    const map: Record<string, {
      gebouwId: number | null;
      naam: string;
      werknummer: string | null;
      items: PlanningItem[];
    }> = {};

    for (const it of items) {
      const key = it.gebouw_id ? `g-${it.gebouw_id}` : `p-${it.project_naam ?? "onbekend"}`;
      if (!map[key]) {
        map[key] = {
          gebouwId: it.gebouw_id ?? null,
          naam: it.gebouw_naam ?? it.project_naam ?? it.titel ?? "Onbekend project",
          werknummer: it.werknummer ?? null,
          items: [],
        };
      }
      if (!statusFilter   || it.status        === statusFilter)
      if (!opdrachtFilter || it.opdracht_type  === opdrachtFilter)
        map[key].items.push(it);
    }
    return Object.values(map);
  }, [items, statusFilter, opdrachtFilter]);

  if (isLoadingItems) {
    return (
      <div className="space-y-3 mt-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  if (projecten.length === 0) {
    return (
      <Card className="mt-6">
        <CardContent className="py-16 text-center text-muted-foreground">
          <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Geen projecten gepland deze week</p>
          <p className="text-sm mt-1">Voeg planningsblokken toe in het Medewerkers-tabblad</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {projecten.map((proj) => {
        const begroting = begrotingen.find((b) => b.gebouw_id === proj.gebouwId);
        const hoofdGepland  = proj.items.filter((i) => i.opdracht_type !== "meerwerk").reduce((s, i) => s + i.uren, 0);
        const meerwerkGepland = proj.items.filter((i) => i.opdracht_type === "meerwerk").reduce((s, i) => s + i.uren, 0);
        const totaalGepland = hoofdGepland + meerwerkGepland;
        const hoofdBegroot  = begroting?.hoofd_uren_begroot    ?? 0;
        const meerwerkBegroot = begroting?.meerwerk_uren_begroot ?? 0;
        const totaalBegroot = hoofdBegroot + meerwerkBegroot;
        const overbezet = totaalGepland > totaalBegroot && totaalBegroot > 0;
        const onderbezet = totaalBegroot > 0 && totaalGepland < totaalBegroot * 0.7;

        return (
          <Card key={proj.naam} className={cn(overbezet ? "border-red-300" : onderbezet ? "border-amber-300" : "")}>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{proj.naam}</CardTitle>
                  {proj.werknummer && (
                    <p className="text-xs text-muted-foreground mt-0.5">{proj.werknummer}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="text-right">
                    <div className="text-muted-foreground">Begroot</div>
                    <div className="font-semibold">{totaalBegroot.toFixed(1)}u</div>
                  </div>
                  <div className="text-right">
                    <div className="text-muted-foreground">Gepland</div>
                    <div className={cn("font-semibold", overbezet ? "text-red-600" : "text-blue-700")}>
                      {totaalGepland.toFixed(1)}u
                    </div>
                  </div>
                  {(overbezet || onderbezet) && (
                    <Badge variant="outline" className={cn("text-[10px]", overbezet ? "border-red-300 text-red-600" : "border-amber-300 text-amber-700")}>
                      {overbezet ? "Overbezet" : "Onderbezet"}
                    </Badge>
                  )}
                </div>
              </div>
              {begroting && (
                <div className="flex gap-4 text-[11px] text-muted-foreground mt-1">
                  <span>Hoofd: {hoofdBegroot.toFixed(0)}u begroot · {hoofdGepland.toFixed(1)}u gepland</span>
                  <span>Meerwerk: {meerwerkBegroot.toFixed(0)}u begroot · {meerwerkGepland.toFixed(1)}u gepland</span>
                </div>
              )}
            </CardHeader>

            <div className="overflow-x-auto border-t">
              <table className="w-full min-w-[700px] text-xs border-collapse">
                <thead>
                  <tr>
                    {dagen.map((d, i) => (
                      <th key={i} className="p-2 text-center bg-muted/30 border-r border-border font-medium min-w-[120px]">
                        {DAGNAMES_KORT[i]} {formatKorteDatum(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {dagen.map((dag, i) => {
                      const dagStr  = toISODate(dag);
                      const dagItems = proj.items.filter((it) =>
                        it.datum_start === dagStr || (it.datum_start <= dagStr && it.datum_eind >= dagStr),
                      );
                      const dagMedewerkers = [...new Set(dagItems.map((it) => it.medewerker_id))];

                      return (
                        <td key={i} className="p-1.5 align-top border-r border-border">
                          {dagItems.map((it) => {
                            const med = medewerkers.find((m) => m.id === it.medewerker_id);
                            return (
                              <button
                                key={it.id}
                                onClick={() => onBlokKlik(it)}
                                className={cn(
                                  "w-full text-left rounded border px-2 py-1.5 text-[11px] mb-1 hover:opacity-80",
                                  STATUS_KLEUR[it.status] ?? STATUS_KLEUR.concept,
                                )}
                              >
                                <div className="font-medium">{med?.naam ?? "—"}</div>
                                {it.omschrijving && <div className="opacity-70 truncate">{it.omschrijving}</div>}
                                <div className="opacity-70">{it.uren}u</div>
                              </button>
                            );
                          })}
                          {dagMedewerkers.length === 0 && (
                            <button
                              onClick={() => onNieuwBlok(proj.gebouwId, dagStr)}
                              className="w-full h-6 rounded border border-dashed border-muted-foreground/30 text-muted-foreground/50 hover:border-primary/50 hover:text-primary/60 transition-colors flex items-center justify-center"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── Tab 3: Capaciteit ───────────────────────────────────────────────────────

function CapaciteitTab({
  medewerkers, items, afwezigheid, nacalculatie, isLoading,
}: {
  medewerkers: PlanningMedewerker[];
  items: PlanningItem[];
  afwezigheid: { medewerker_id: number; datum_start: string; datum_eind: string; type: string }[];
  nacalculatie: { gebouw_id: number; gebouw_naam: string | null; werknummer: string | null;
    hoofd_uren_begroot: number; meerwerk_uren_begroot: number;
    hoofd_uren_gepland: number; meerwerk_uren_gepland: number; totaal_uren_werkelijk: number }[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3 mt-4">
        {[1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    );
  }

  const werkmaatschappijen = [...new Set(medewerkers.map((m) => m.werkmaatschappij).filter(Boolean) as string[])];

  const medewerkersMetUren = medewerkers.map((med) => {
    const gepland  = items.filter((it) => it.medewerker_id === med.id).reduce((s, it) => s + it.uren, 0);
    const contract = med.contracturenPerWeek ?? 40;
    const verlofDagen = afwezigheid.filter((af) => af.medewerker_id === med.id).length;
    return { ...med, gepland, contract, vrij: contract - gepland, verlofDagen };
  });

  const afwijkingen: string[] = [];
  for (const med of medewerkersMetUren) {
    if (med.gepland < med.contract * 0.5) afwijkingen.push(`${med.naam}: minder dan de helft van contracturen gepland`);
    if (med.gepland > med.contract)       afwijkingen.push(`${med.naam}: overgepland (${med.gepland.toFixed(1)}u / ${med.contract}u)`);
  }
  for (const n of nacalculatie) {
    const begroot = n.hoofd_uren_begroot + n.meerwerk_uren_begroot;
    const gepland = n.hoofd_uren_gepland + n.meerwerk_uren_gepland;
    if (begroot > 0 && gepland > begroot) afwijkingen.push(`${n.gebouw_naam ?? "project"}: boven begrote uren (${gepland.toFixed(1)}u / ${begroot.toFixed(1)}u)`);
  }
  const meerwerkZonderMarkering = items.filter((it) => !it.opdracht_type).length;
  if (meerwerkZonderMarkering > 0) {
    afwijkingen.push(`${meerwerkZonderMarkering} blok(ken) zonder hoofd-/meerwerkmarkering`);
  }

  return (
    <div className="mt-4 space-y-5">
      {/* Afwijkingssignalen */}
      {afwijkingen.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Afwijkingen ({afwijkingen.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-4">
            <ul className="space-y-1">
              {afwijkingen.map((a, i) => (
                <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0">•</span>
                  {a}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Per werkmaatschappij */}
      {werkmaatschappijen.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Capaciteit per werkmaatschappij</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-4">
            <div className="space-y-3">
              {werkmaatschappijen.map((wm) => {
                const wmMeds = medewerkersMetUren.filter((m) => m.werkmaatschappij === wm);
                const beschikbaar = wmMeds.reduce((s, m) => s + m.contract, 0);
                const gepland     = wmMeds.reduce((s, m) => s + m.gepland, 0);
                const vrij        = beschikbaar - gepland;
                const bezetting   = beschikbaar > 0 ? Math.round((gepland / beschikbaar) * 100) : 0;
                return (
                  <div key={wm} className="flex items-center gap-4 text-sm">
                    <div className="w-40 font-medium text-xs">{wm}</div>
                    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", gepland > beschikbaar ? "bg-red-500" : "bg-blue-500")}
                        style={{ width: `${Math.min(100, bezetting)}%` }}
                      />
                    </div>
                    <div className="text-xs text-right w-48 text-muted-foreground">
                      {gepland.toFixed(1)}u gepland · {vrij.toFixed(1)}u vrij · {bezetting}%
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per medewerker */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Capaciteit per medewerker</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          {medewerkersMetUren.length === 0 ? (
            <p className="text-xs text-muted-foreground">Geen uitvoerend personeel gevonden</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5 font-medium">Medewerker</th>
                  <th className="text-right py-1.5 font-medium">Contract</th>
                  <th className="text-right py-1.5 font-medium">Gepland</th>
                  <th className="text-right py-1.5 font-medium">Vrij</th>
                  <th className="text-center py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {medewerkersMetUren.map((med) => {
                  const overpland = med.gepland > med.contract;
                  const laag      = med.gepland < med.contract * 0.5;
                  return (
                    <tr key={med.id} className="border-b border-border/50">
                      <td className="py-1.5">
                        <div>{med.naam}</div>
                        {med.functie && <div className="text-muted-foreground text-[10px]">{med.functie}</div>}
                      </td>
                      <td className="text-right py-1.5">{med.contract}u</td>
                      <td className={cn("text-right py-1.5 font-medium", overpland ? "text-red-600" : "")}>{med.gepland.toFixed(1)}u</td>
                      <td className={cn("text-right py-1.5", med.vrij < 0 ? "text-red-600" : "text-muted-foreground")}>
                        {med.vrij < 0 ? `+${Math.abs(med.vrij).toFixed(1)}u` : `${med.vrij.toFixed(1)}u`}
                      </td>
                      <td className="text-center py-1.5">
                        {overpland  ? <TrendingUp  className="w-3.5 h-3.5 text-red-500 mx-auto" /> :
                         laag       ? <TrendingDown className="w-3.5 h-3.5 text-amber-500 mx-auto" /> :
                                      <Minus        className="w-3.5 h-3.5 text-green-500 mx-auto" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Nacalculatie per project */}
      {nacalculatie.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Arbeidsnacalculatie per project</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5 font-medium">Project</th>
                  <th className="text-right py-1.5 font-medium">Hoofd begroot</th>
                  <th className="text-right py-1.5 font-medium">Meerwerk begroot</th>
                  <th className="text-right py-1.5 font-medium">Gepland</th>
                  <th className="text-right py-1.5 font-medium">Werkelijk</th>
                  <th className="text-right py-1.5 font-medium">Verschil</th>
                </tr>
              </thead>
              <tbody>
                {nacalculatie.map((n) => {
                  const totaalBegroot = n.hoofd_uren_begroot + n.meerwerk_uren_begroot;
                  const totaalGepland = n.hoofd_uren_gepland + n.meerwerk_uren_gepland;
                  const verschil = n.totaal_uren_werkelijk - totaalBegroot;
                  return (
                    <tr key={n.gebouw_id} className="border-b border-border/50">
                      <td className="py-1.5">
                        <div>{n.gebouw_naam ?? "Onbekend"}</div>
                        {n.werknummer && <div className="text-muted-foreground text-[10px]">{n.werknummer}</div>}
                      </td>
                      <td className="text-right py-1.5">{n.hoofd_uren_begroot.toFixed(1)}u</td>
                      <td className="text-right py-1.5">{n.meerwerk_uren_begroot.toFixed(1)}u</td>
                      <td className="text-right py-1.5 text-blue-700 font-medium">{totaalGepland.toFixed(1)}u</td>
                      <td className="text-right py-1.5">{n.totaal_uren_werkelijk.toFixed(1)}u</td>
                      <td className={cn("text-right py-1.5 font-medium", verschil > 0 ? "text-red-600" : "text-green-700")}>
                        {verschil > 0 ? "+" : ""}{verschil.toFixed(1)}u
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Hoofd component ─────────────────────────────────────────────────────────

export default function ConnectPlanning() {
  const vandaag = new Date();
  const { week: startWeek, jaar: startJaar } = getISOWeek(vandaag);

  const [jaar,   setJaar]   = useState(startJaar);
  const [week,   setWeek]   = useState(startWeek);
  const [tab,    setTab]    = useState("medewerkers");

  // Filters
  const [wmFilter,       setWmFilter]       = useState("");
  const [dvFilter,       setDvFilter]       = useState("");
  const [projectFilter,  setProjectFilter]  = useState("");
  const [statusFilter,   setStatusFilter]   = useState("");
  const [opdrachtFilter, setOpdrachtFilter] = useState("");

  // Dialog state
  const [blokDialog, setBlokDialog] = useState<{
    open: boolean;
    editItem?: PlanningItem | null;
    defaultMedewerkerId?: number | null;
    defaultGebouwId?: number | null;
    defaultDatum?: string;
  }>({ open: false });

  const dagen = useMemo(() => weekDagen(jaar, week), [jaar, week]);
  const vanStr = useMemo(() => toISODate(dagen[0]), [dagen]);
  const totStr = useMemo(() => toISODate(dagen[4]), [dagen]);

  function vorige()  { if (week === 1)  { setJaar(j => j - 1); setWeek(52); } else { setWeek(w => w - 1); } }
  function volgende(){ const { week: mw, jaar: mj } = getISOWeek(new Date(jaar, 11, 28)); if (week === mw && jaar === mj) { setJaar(j => j + 1); setWeek(1); } else { setWeek(w => w + 1); } }
  function heden()   { setWeek(startWeek); setJaar(startJaar); }

  // Data
  const { data: medewerkers = [], isLoading: isLoadingMed } = useListPlanningMedewerkers(
    { werkmaatschappij: wmFilter || undefined, dienstverband: dvFilter || undefined },
  );
  const { data: gebouwen = [] } = useListGebouwen();
  const { data: items = [], isLoading: isLoadingItems } = useListPlanningItems({ van: vanStr, tot: totStr });
  const { data: afwezigheidAll = [] } = useListPlanningAfwezigheid();
  const afwezigheid = useMemo(
    () => afwezigheidAll.filter((af) => af.datum_start <= totStr && af.datum_eind >= vanStr),
    [afwezigheidAll, vanStr, totStr],
  );
  const { data: begrotingen = [] } = useListProjectBegrotingen();
  const { data: nacalculatieRaw = [] } = useGetPlanningNacalculatie({ van: vanStr, tot: totStr });

  const nacalculatie = nacalculatieRaw as {
    gebouw_id: number; gebouw_naam: string | null; werknummer: string | null;
    hoofd_uren_begroot: number; meerwerk_uren_begroot: number;
    hoofd_uren_gepland: number; meerwerk_uren_gepland: number; totaal_uren_werkelijk: number;
  }[];

  const gefilterdMedewerkers = useMemo(() => {
    if (!wmFilter && !dvFilter) return medewerkers;
    return medewerkers.filter((m) => {
      if (wmFilter && m.werkmaatschappij !== wmFilter) return false;
      if (dvFilter && m.dienstverband    !== dvFilter) return false;
      return true;
    });
  }, [medewerkers, wmFilter, dvFilter]);

  const gefilterdItems = useMemo(() => {
    return items.filter((it) => {
      if (projectFilter  && String(it.gebouw_id) !== projectFilter)  return false;
      if (statusFilter   && it.status            !== statusFilter)   return false;
      if (opdrachtFilter && it.opdracht_type     !== opdrachtFilter) return false;
      return true;
    });
  }, [items, projectFilter, statusFilter, opdrachtFilter]);

  function openNieuwBlok(medewerkerId: number | null, datum: string, gebouwId?: number | null) {
    setBlokDialog({
      open: true,
      editItem: null,
      defaultMedewerkerId: medewerkerId,
      defaultGebouwId: gebouwId ?? (projectFilter ? Number(projectFilter) : null),
      defaultDatum: datum,
    });
  }

  function openEditBlok(item: PlanningItem) {
    setBlokDialog({ open: true, editItem: item });
  }

  function sluitDialog() {
    setBlokDialog({ open: false });
  }

  // Samenvatting-statistieken boven de tabs
  const totaalGepland  = gefilterdItems.reduce((s, it) => s + it.uren, 0);
  const totaalContract = gefilterdMedewerkers.reduce((s, m) => s + (m.contracturenPerWeek ?? 40), 0);
  const totaalBezetting = totaalContract > 0 ? Math.round((totaalGepland / totaalContract) * 100) : 0;

  return (
    <div className="p-5 max-w-[1400px] mx-auto">
      {/* Koptekst */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Uitvoeringsplanning</h1>
          <p className="text-sm text-muted-foreground">Alleen uitvoerend personeel — monteurs, timmermannen, zzp en uitzendkrachten</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <WeekNavigator jaar={jaar} week={week} onVorige={vorige} onVolgende={volgende} onHeden={heden} />
          <Button onClick={() => openNieuwBlok(null, vanStr)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Blok toevoegen
          </Button>
        </div>
      </div>

      {/* Statistieken balk */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm">
          <div className="text-xs text-muted-foreground">Uitvoerders</div>
          <div className="font-bold text-lg">{gefilterdMedewerkers.length}</div>
        </div>
        <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm">
          <div className="text-xs text-muted-foreground">Geplande uren</div>
          <div className="font-bold text-lg">{totaalGepland.toFixed(1)}</div>
        </div>
        <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm">
          <div className="text-xs text-muted-foreground">Bezettingsgraad</div>
          <div className={cn("font-bold text-lg", totaalBezetting > 100 ? "text-red-600" : totaalBezetting < 60 ? "text-amber-600" : "")}>
            {totaalBezetting}%
          </div>
        </div>
        <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm">
          <div className="text-xs text-muted-foreground">Projecten deze week</div>
          <div className="font-bold text-lg">
            {new Set(gefilterdItems.map((it) => it.gebouw_id ?? it.project_naam).filter(Boolean)).size}
          </div>
        </div>
      </div>

      {/* Filters */}
      <Filterbalk
        wmFilter={wmFilter} setWmFilter={setWmFilter}
        dvFilter={dvFilter} setDvFilter={setDvFilter}
        projectFilter={projectFilter} setProjectFilter={setProjectFilter}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        opdrachtFilter={opdrachtFilter} setOpdrachtFilter={setOpdrachtFilter}
        medewerkers={medewerkers}
        gebouwen={gebouwen}
      />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList>
          <TabsTrigger value="medewerkers" className="gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Medewerkers
          </TabsTrigger>
          <TabsTrigger value="projecten" className="gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" />
            Projecten
          </TabsTrigger>
          <TabsTrigger value="capaciteit" className="gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Capaciteit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="medewerkers" forceMount hidden={tab !== "medewerkers"}>
          <MedewerkersTab
            medewerkers={gefilterdMedewerkers}
            items={gefilterdItems}
            afwezigheid={afwezigheid}
            dagen={dagen}
            isLoadingItems={isLoadingItems || isLoadingMed}
            statusFilter={statusFilter}
            opdrachtFilter={opdrachtFilter}
            projectFilter={projectFilter}
            onBlokKlik={openEditBlok}
            onNieuwBlok={(mid, datum) => openNieuwBlok(mid, datum)}
          />
        </TabsContent>

        <TabsContent value="projecten" forceMount hidden={tab !== "projecten"}>
          <ProjectenTab
            items={gefilterdItems}
            medewerkers={medewerkers}
            begrotingen={begrotingen}
            dagen={dagen}
            isLoadingItems={isLoadingItems}
            statusFilter={statusFilter}
            opdrachtFilter={opdrachtFilter}
            onBlokKlik={openEditBlok}
            onNieuwBlok={(gebouwId, datum) => openNieuwBlok(null, datum, gebouwId)}
          />
        </TabsContent>

        <TabsContent value="capaciteit" forceMount hidden={tab !== "capaciteit"}>
          <CapaciteitTab
            medewerkers={gefilterdMedewerkers}
            items={gefilterdItems}
            afwezigheid={afwezigheid}
            nacalculatie={nacalculatie}
            isLoading={isLoadingItems || isLoadingMed}
          />
        </TabsContent>
      </Tabs>

      {/* Dialog */}
      {blokDialog.open && (
        <PlanningBlokDialog
          open={blokDialog.open}
          onClose={sluitDialog}
          medewerkers={gefilterdMedewerkers}
          gebouwen={gebouwen}
          defaultMedewerkerId={blokDialog.defaultMedewerkerId}
          defaultDatum={blokDialog.defaultDatum}
          editItem={blokDialog.editItem}
        />
      )}
    </div>
  );
}

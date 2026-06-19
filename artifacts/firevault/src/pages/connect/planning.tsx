import { useState, useMemo, useCallback } from "react";
import {
  useListPlanningMedewerkers,
  useListPlanningItems,
  useListPlanningAfwezigheid,
  useCreatePlanningItem,
  useUpdatePlanningItem,
  useDeletePlanningItem,
  useListGebouwen,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Plus, Trash2, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const TIJDSLOTEN_OCHTEND = ["07:30", "08:30", "09:30", "10:30"] as const;
const TIJDSLOTEN_MIDDAG = ["13:00", "14:00", "15:00", "16:00"] as const;
const DAGNAMES = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag"];

type TijdslotMap = Record<string, string>;

function parseTijdsloten(raw: string | null | undefined): TijdslotMap {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as TijdslotMap;
  } catch {
    return {};
  }
}

function serializeTijdsloten(map: TijdslotMap): string | undefined {
  return Object.keys(map).length > 0 ? JSON.stringify(map) : undefined;
}

function getISOWeekMonday(jaar: number, week: number): Date {
  const jan4 = new Date(jaar, 0, 4);
  const dag = jan4.getDay() || 7;
  const maandag = new Date(jan4);
  maandag.setDate(jan4.getDate() - (dag - 1) + (week - 1) * 7);
  return maandag;
}

function getISOWeek(d: Date): { week: number; jaar: number } {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
  const week1 = new Date(dt.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((dt.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    );
  return { week, jaar: dt.getFullYear() };
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatKorteDatum(d: Date): string {
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "numeric" });
}

// ── Tijdslot cel ──────────────────────────────────────────────────────────

function TijdslotCel({
  waarde,
  verlof,
}: {
  waarde: string | undefined;
  verlof: boolean;
}) {
  if (verlof) {
    return (
      <td className="w-10 h-7 bg-amber-300 border border-amber-400 text-center text-xs font-semibold text-amber-900">
        V
      </td>
    );
  }
  if (waarde === undefined) {
    return <td className="w-10 h-7 bg-slate-50 border border-slate-200" />;
  }
  return (
    <td className="w-10 h-7 bg-green-500 border border-green-600 text-center text-xs font-semibold text-white leading-7">
      {waarde}
    </td>
  );
}

// ── Tijdsloten editor ─────────────────────────────────────────────────────

function TijdslotEditor({
  slots,
  onChange,
}: {
  slots: TijdslotMap;
  onChange: (slots: TijdslotMap) => void;
}) {
  const toggle = (slot: string) => {
    const next = { ...slots };
    if (slot in next) {
      delete next[slot];
    } else {
      next[slot] = "";
    }
    onChange(next);
  };

  const setWaarde = (slot: string, val: string) => {
    onChange({ ...slots, [slot]: val });
  };

  const renderGroep = (groep: readonly string[], label: string) => (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      <div className="flex gap-2 flex-wrap">
        {groep.map((slot) => {
          const actief = slot in slots;
          return (
            <div key={slot} className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => toggle(slot)}
                className={cn(
                  "w-16 h-8 rounded text-xs font-semibold border transition-colors",
                  actief
                    ? "bg-green-500 text-white border-green-600"
                    : "bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200"
                )}
              >
                {slot}
              </button>
              {actief && (
                <Input
                  className="w-16 h-6 text-xs text-center px-1"
                  placeholder="hnr."
                  value={slots[slot] ?? ""}
                  onChange={(e) => setWaarde(slot, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Klik op een tijdslot om het in te plannen. Vul optioneel een huisnummer in
        — leeg laten voor utiliteitsgebouwen en gangen.
      </p>
      {renderGroep(TIJDSLOTEN_OCHTEND, "Ochtend")}
      {renderGroep(TIJDSLOTEN_MIDDAG, "Middag")}
    </div>
  );
}

// ── PlanningItemDialog ────────────────────────────────────────────────────

interface EditItem {
  id: number;
  medewerker_id?: number | null;
  gebouw_id?: number | null;
  project_naam?: string | null;
  werknummer?: string | null;
  omschrijving?: string | null;
  datum_start: string;
  tijdsloten?: string | null;
  dag_notities?: string | null;
  notities?: string | null;
  uren?: number;
  status?: string;
  type?: string;
}

interface PlanningDialogProps {
  open: boolean;
  onClose: () => void;
  medewerkers: { id: number; naam: string; functie?: string | null }[];
  gebouwen: { id: number; naam: string }[];
  defaultMedewerkerId?: number;
  defaultDatum?: string;
  editItem?: EditItem;
}

function PlanningItemDialog({
  open,
  onClose,
  medewerkers,
  gebouwen,
  defaultMedewerkerId,
  defaultDatum,
  editItem,
}: PlanningDialogProps) {
  const isEdit = !!editItem;

  const [medewerkerId, setMedewerkerId] = useState<string>(
    String(editItem?.medewerker_id ?? defaultMedewerkerId ?? "")
  );
  const [datum, setDatum] = useState<string>(
    editItem?.datum_start ?? defaultDatum ?? ""
  );
  const [gebouwId, setGebouwId] = useState<string>(
    String(editItem?.gebouw_id ?? "")
  );
  const [projectNaam, setProjectNaam] = useState<string>(
    editItem?.project_naam ?? ""
  );
  const [werknummer, setWerknummer] = useState<string>(
    editItem?.werknummer ?? ""
  );
  const [omschrijving, setOmschrijving] = useState<string>(
    editItem?.omschrijving ?? ""
  );
  const [dagNotities, setDagNotities] = useState<string>(
    editItem?.dag_notities ?? ""
  );
  const [notities, setNotities] = useState<string>(editItem?.notities ?? "");
  const [slots, setSlots] = useState<TijdslotMap>(
    parseTijdsloten(editItem?.tijdsloten)
  );

  const maakAan = useCreatePlanningItem();
  const bijwerken = useUpdatePlanningItem();
  const verwijderen = useDeletePlanningItem();

  const geselecteerdGebouw = gebouwen.find((g) => String(g.id) === gebouwId);

  const handleOpslaan = async () => {
    if (!medewerkerId || !datum) return;
    const titel = projectNaam || geselecteerdGebouw?.naam || "Werk";
    const payload = {
      titel,
      omschrijving: omschrijving || undefined,
      medewerker_id: Number(medewerkerId),
      gebouw_id: gebouwId ? Number(gebouwId) : undefined,
      project_naam: projectNaam || undefined,
      werknummer: werknummer || undefined,
      tijdsloten: serializeTijdsloten(slots),
      dag_notities: dagNotities || undefined,
      notities: notities || undefined,
      datum_start: datum,
      datum_eind: datum,
      uren: editItem?.uren ?? 8,
      status: editItem?.status ?? "gepland",
      type: editItem?.type ?? "uitvoering",
    };

    if (isEdit && editItem) {
      await bijwerken.mutateAsync({ id: editItem.id, data: payload as any });
    } else {
      await maakAan.mutateAsync({ data: payload as any });
    }
    onClose();
  };

  const handleVerwijderen = async () => {
    if (!editItem) return;
    await verwijderen.mutateAsync({ id: editItem.id });
    onClose();
  };

  const bezig = maakAan.isPending || bijwerken.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Planning bewerken" : "Planning toevoegen"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Monteur</Label>
              <Select value={medewerkerId} onValueChange={setMedewerkerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Kies monteur" />
                </SelectTrigger>
                <SelectContent>
                  {medewerkers.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Datum</Label>
              <Input
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
              />
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
              <Label>Gebouw / project</Label>
              <Select value={gebouwId} onValueChange={setGebouwId}>
                <SelectTrigger>
                  <SelectValue placeholder="Kies gebouw" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— geen koppeling —</SelectItem>
                  {gebouwen.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Projectnaam</Label>
              <Input
                placeholder={geselecteerdGebouw?.naam ?? "bijv. Fazant"}
                value={projectNaam}
                onChange={(e) => setProjectNaam(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Werkomschrijving</Label>
              <Input
                placeholder="bijv. deuren, gangen, keukens"
                value={omschrijving}
                onChange={(e) => setOmschrijving(e.target.value)}
              />
            </div>
          </div>

          <div className="border rounded-lg p-4 space-y-3">
            <Label>Tijdsloten</Label>
            <TijdslotEditor slots={slots} onChange={setSlots} />
          </div>

          <div className="space-y-1.5">
            <Label>Opmerkingen rij</Label>
            <Input
              placeholder="bijv. 2 woningen samen met Fernando; materiaal aanwezig"
              value={dagNotities}
              onChange={(e) => setDagNotities(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Aanvullende notities</Label>
            <Textarea
              placeholder="Interne opmerkingen..."
              rows={2}
              value={notities}
              onChange={(e) => setNotities(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          {isEdit && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleVerwijderen}
              disabled={verwijderen.isPending}
              className="mr-auto"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Verwijderen
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Annuleren
          </Button>
          <Button
            onClick={handleOpslaan}
            disabled={bezig || !medewerkerId || !datum}
          >
            {bezig ? "Opslaan..." : isEdit ? "Opslaan" : "Toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Hoofd component ───────────────────────────────────────────────────────

export default function ConnectPlanning() {
  const vandaag = new Date();
  const { week: huidigWeek, jaar: huidigJaar } = getISOWeek(vandaag);
  const [weekNr, setWeekNr] = useState(huidigWeek);
  const [jaar, setJaar] = useState(huidigJaar);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultMedewerkerId, setDefaultMedewerkerId] = useState<
    number | undefined
  >();
  const [defaultDatum, setDefaultDatum] = useState<string | undefined>();
  const [editItem, setEditItem] = useState<EditItem | undefined>();

  const maandag = useMemo(
    () => getISOWeekMonday(jaar, weekNr),
    [jaar, weekNr]
  );
  const weekDagen = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => {
        const d = new Date(maandag);
        d.setDate(maandag.getDate() + i);
        return d;
      }),
    [maandag]
  );

  const van = toISODate(weekDagen[0]);
  const tot = toISODate(weekDagen[4]);

  const weekLabel = useMemo(
    () =>
      `Week ${weekNr} \u2014 ${formatKorteDatum(weekDagen[0])} t/m ${formatKorteDatum(weekDagen[4])} ${jaar}`,
    [weekNr, jaar, weekDagen]
  );

  const { data: medewerkers = [], isLoading: ladenM } =
    useListPlanningMedewerkers({ alleen_uitvoerend: "true" } as any);
  const {
    data: items = [],
    isLoading: ladenI,
    refetch: refetchItems,
  } = useListPlanningItems({ van, tot });
  const {
    data: afwezigheid = [],
    isLoading: ladenA,
    refetch: refetchAfwezigheid,
  } = useListPlanningAfwezigheid();
  const { data: gebouwen = [] } = useListGebouwen();

  const laden = ladenM || ladenI || ladenA;

  const naarVorigeWeek = useCallback(() => {
    if (weekNr === 1) {
      setJaar((y) => y - 1);
      setWeekNr(52);
    } else {
      setWeekNr((w) => w - 1);
    }
  }, [weekNr]);

  const naarVolgendeWeek = useCallback(() => {
    if (weekNr === 52) {
      setJaar((y) => y + 1);
      setWeekNr(1);
    } else {
      setWeekNr((w) => w + 1);
    }
  }, [weekNr]);

  const naarVandaag = useCallback(() => {
    const { week, jaar: j } = getISOWeek(new Date());
    setWeekNr(week);
    setJaar(j);
  }, []);

  const isAfwezig = useCallback(
    (medewerkerId: number, datum: string): boolean =>
      afwezigheid.some(
        (a) =>
          a.medewerker_id === medewerkerId &&
          datum >= a.datum_start &&
          datum <= a.datum_eind
      ),
    [afwezigheid]
  );

  const itemsPerMedewerkerPerDag = useMemo(() => {
    const map = new Map<number, Map<string, typeof items>>();
    for (const item of items) {
      if (!item.medewerker_id) continue;
      if (!map.has(item.medewerker_id))
        map.set(item.medewerker_id, new Map());
      const dagMap = map.get(item.medewerker_id)!;
      const dag = item.datum_start;
      if (!dagMap.has(dag)) dagMap.set(dag, []);
      dagMap.get(dag)!.push(item);
    }
    return map;
  }, [items]);

  const openToevoegen = (mid: number, datum: string) => {
    setEditItem(undefined);
    setDefaultMedewerkerId(mid);
    setDefaultDatum(datum);
    setDialogOpen(true);
  };

  const openBewerken = (item: EditItem) => {
    setEditItem(item);
    setDefaultMedewerkerId(item.medewerker_id ?? undefined);
    setDefaultDatum(item.datum_start);
    setDialogOpen(true);
  };

  const sluitDialog = useCallback(() => {
    setDialogOpen(false);
    void refetchItems();
    void refetchAfwezigheid();
  }, [refetchItems, refetchAfwezigheid]);

  return (
    <div className="space-y-6">
      {/* Paginakop */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planning</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Weekrooster per monteur
          </p>
        </div>
        <Badge variant="outline" className="text-xs px-2 py-1">
          <CalendarDays className="h-3 w-3 mr-1" />
          FPS Connect
        </Badge>
      </div>

      {/* Week navigatie */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={naarVorigeWeek}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-base font-semibold min-w-72 text-center">
          {weekLabel}
        </span>
        <Button variant="outline" size="icon" onClick={naarVolgendeWeek}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={naarVandaag}>
          Vandaag
        </Button>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-green-500 border border-green-600" />
          <span>Ingepland (geen huisnummer)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-4 rounded bg-green-500 border border-green-600 flex items-center justify-center">
            <span className="text-[8px] text-white font-bold">47</span>
          </div>
          <span>Ingepland met huisnummer</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-4 rounded bg-amber-300 border border-amber-400 flex items-center justify-center">
            <span className="text-[8px] text-amber-900 font-bold">V</span>
          </div>
          <span>Verlof / afwezig</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-slate-50 border border-slate-200" />
          <span>Niet gepland</span>
        </div>
      </div>

      {/* Laden */}
      {laden && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border bg-card overflow-hidden">
              <div className="bg-slate-100 border-b px-4 py-2">
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="p-4">
                <Skeleton className="h-28 w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Leeg */}
      {!laden && medewerkers.length === 0 && (
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
          <CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Geen uitvoerende medewerkers gevonden</p>
          <p className="text-sm mt-1">
            Voeg uitvoerende medewerkers toe via Personeel.
          </p>
        </div>
      )}

      {/* Medewerker blokken */}
      {!laden &&
        (medewerkers as { id: number; naam: string; functie?: string | null }[]).map(
          (medewerker) => {
            const dagMap =
              itemsPerMedewerkerPerDag.get(medewerker.id) ??
              new Map<string, typeof items>();

            return (
              <div
                key={medewerker.id}
                className="rounded-lg border bg-card overflow-hidden"
              >
                {/* Naam kop */}
                <div className="bg-slate-100 border-b px-4 py-2 flex items-center justify-between">
                  <span className="font-semibold text-sm">
                    {medewerker.naam}
                  </span>
                  {medewerker.functie && (
                    <span className="text-xs text-muted-foreground">
                      {medewerker.functie}
                    </span>
                  )}
                </div>

                {/* Rooster */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b">
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-22">
                          Dag
                        </th>
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-16">
                          Datum
                        </th>
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-24">
                          Werknummer
                        </th>
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-36">
                          Project
                        </th>
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-36">
                          Omschrijving
                        </th>
                        <th
                          colSpan={4}
                          className="text-center py-1 font-medium text-muted-foreground border-l-2 border-slate-300 bg-green-50/50"
                        >
                          Ochtend
                        </th>
                        <th className="w-2 bg-slate-200" />
                        <th
                          colSpan={4}
                          className="text-center py-1 font-medium text-muted-foreground border-r-2 border-slate-300 bg-green-50/50"
                        >
                          Middag
                        </th>
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">
                          Opmerkingen
                        </th>
                        <th className="w-8" />
                      </tr>
                      <tr className="bg-slate-50 border-b text-[10px] text-muted-foreground font-normal">
                        <th colSpan={5} />
                        {TIJDSLOTEN_OCHTEND.map((slot) => (
                          <th
                            key={slot}
                            className="w-10 text-center border-l border-slate-200 py-0.5"
                          >
                            {slot}
                          </th>
                        ))}
                        <th className="w-2 bg-slate-200" />
                        {TIJDSLOTEN_MIDDAG.map((slot) => (
                          <th
                            key={slot}
                            className="w-10 text-center border-l border-slate-200 py-0.5"
                          >
                            {slot}
                          </th>
                        ))}
                        <th colSpan={2} />
                      </tr>
                    </thead>
                    <tbody>
                      {weekDagen.map((dag, dagIdx) => {
                        const dagStr = toISODate(dag);
                        const dagItems = dagMap.get(dagStr) ?? [];
                        const afwez = isAfwezig(medewerker.id, dagStr);
                        const dagNaam = DAGNAMES[dagIdx];
                        const korteDatum = formatKorteDatum(dag);

                        if (afwez) {
                          return (
                            <tr
                              key={dagStr}
                              className="border-b border-slate-100"
                            >
                              <td className="px-2 py-1.5 font-medium text-slate-600 capitalize">
                                {dagNaam}
                              </td>
                              <td className="px-2 py-1.5 text-muted-foreground">
                                {korteDatum}
                              </td>
                              <td
                                colSpan={3}
                                className="px-2 py-1.5 text-amber-700 italic"
                              >
                                Afwezig / verlof
                              </td>
                              {TIJDSLOTEN_OCHTEND.map((slot) => (
                                <td
                                  key={slot}
                                  className="w-10 h-7 bg-amber-300 border border-amber-400"
                                />
                              ))}
                              <td className="w-2 bg-slate-200" />
                              {TIJDSLOTEN_MIDDAG.map((slot) => (
                                <td
                                  key={slot}
                                  className="w-10 h-7 bg-amber-300 border border-amber-400"
                                />
                              ))}
                              <td colSpan={2} />
                            </tr>
                          );
                        }

                        if (dagItems.length === 0) {
                          return (
                            <tr
                              key={dagStr}
                              className="border-b border-slate-100 hover:bg-slate-50/50"
                            >
                              <td className="px-2 py-1.5 font-medium text-slate-600 capitalize">
                                {dagNaam}
                              </td>
                              <td className="px-2 py-1.5 text-muted-foreground">
                                {korteDatum}
                              </td>
                              <td
                                colSpan={3}
                                className="px-2 py-1.5 text-slate-300 italic"
                              >
                                Niet ingepland
                              </td>
                              {TIJDSLOTEN_OCHTEND.map((slot) => (
                                <td
                                  key={slot}
                                  className="w-10 h-7 bg-slate-50 border border-slate-100"
                                />
                              ))}
                              <td className="w-2 bg-slate-200" />
                              {TIJDSLOTEN_MIDDAG.map((slot) => (
                                <td
                                  key={slot}
                                  className="w-10 h-7 bg-slate-50 border border-slate-100"
                                />
                              ))}
                              <td />
                              <td className="px-1 py-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() =>
                                    openToevoegen(medewerker.id, dagStr)
                                  }
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          );
                        }

                        return dagItems.map((item, itemIdx) => {
                          const slotMap = parseTijdsloten(
                            (item as any).tijdsloten ?? null
                          );
                          const isEerste = itemIdx === 0;
                          const isLaatste = itemIdx === dagItems.length - 1;

                          return (
                            <tr
                              key={item.id}
                              className={cn(
                                "border-b border-slate-100 hover:bg-green-50/30 cursor-pointer transition-colors",
                                isLaatste && "border-b-2 border-slate-200"
                              )}
                              onClick={() => openBewerken(item as EditItem)}
                            >
                              <td className="px-2 py-1.5 font-medium text-slate-700 capitalize">
                                {isEerste ? dagNaam : ""}
                              </td>
                              <td className="px-2 py-1.5 text-muted-foreground">
                                {isEerste ? korteDatum : ""}
                              </td>
                              <td className="px-2 py-1.5 text-slate-600">
                                {(item as any).werknummer ?? ""}
                              </td>
                              <td className="px-2 py-1.5 font-medium text-slate-800 w-36">
                                <span className="block truncate">
                                  {item.project_naam ?? item.gebouw_naam ?? ""}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-slate-600 w-36">
                                <span className="block truncate">
                                  {item.omschrijving ?? ""}
                                </span>
                              </td>
                              {TIJDSLOTEN_OCHTEND.map((slot) => (
                                <TijdslotCel
                                  key={slot}
                                  waarde={
                                    slot in slotMap
                                      ? (slotMap[slot] ?? "")
                                      : undefined
                                  }
                                  verlof={false}
                                />
                              ))}
                              <td className="w-2 bg-slate-200" />
                              {TIJDSLOTEN_MIDDAG.map((slot) => (
                                <TijdslotCel
                                  key={slot}
                                  waarde={
                                    slot in slotMap
                                      ? (slotMap[slot] ?? "")
                                      : undefined
                                  }
                                  verlof={false}
                                />
                              ))}
                              <td className="px-2 py-1.5 text-slate-500 max-w-48">
                                <span className="block truncate">
                                  {(item as any).dag_notities ?? ""}
                                </span>
                              </td>
                              <td className="px-1 py-1">
                                {isLaatste && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openToevoegen(medewerker.id, dagStr);
                                    }}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }
        )}

      {/* Dialog */}
      {dialogOpen && (
        <PlanningItemDialog
          open={dialogOpen}
          onClose={sluitDialog}
          medewerkers={
            medewerkers as { id: number; naam: string; functie?: string | null }[]
          }
          gebouwen={gebouwen as { id: number; naam: string }[]}
          defaultMedewerkerId={defaultMedewerkerId}
          defaultDatum={defaultDatum}
          editItem={editItem}
        />
      )}
    </div>
  );
}

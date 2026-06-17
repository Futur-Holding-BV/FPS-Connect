import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  useListPlanningItems,
  useListPlanningMedewerkers,
  useListPlanningAfwezigheid,
  useCreatePlanningItem,
  useUpdatePlanningItem,
  useDeletePlanningItem,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft, ChevronRight, Plus, AlertTriangle, Users, CalendarCheck,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const DAGEN = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag"];
const DAGEN_KORT = ["Ma", "Di", "Wo", "Do", "Vr"];

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-slate-100 border-slate-300 text-slate-700",
  ingepland: "bg-blue-100 border-blue-300 text-blue-800",
  bevestigd: "bg-green-100 border-green-300 text-green-800",
  uitgevoerd: "bg-emerald-100 border-emerald-300 text-emerald-800",
  geannuleerd: "bg-red-50 border-red-200 text-red-700 line-through opacity-60",
};

const TYPE_KLEUR: Record<string, string> = {
  project: "border-l-primary",
  intern: "border-l-slate-400",
  afwezig: "border-l-orange-400",
};

function maandagVanWeek(datum: Date): Date {
  const d = new Date(datum);
  const dag = d.getDay();
  const diff = dag === 0 ? -6 : 1 - dag;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function datumNaarStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekLabel(maandag: Date): string {
  const vrijdag = new Date(maandag);
  vrijdag.setDate(maandag.getDate() + 4);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  return `${maandag.toLocaleDateString("nl-NL", opts)} – ${vrijdag.toLocaleDateString("nl-NL", opts)}`;
}

function weekNummer(d: Date): number {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7);
}

type PlanItem = {
  id: number;
  titel: string;
  medewerker_id?: number | null;
  medewerker_naam?: string | null;
  datum_start: string;
  datum_eind: string;
  uren: number;
  status: string;
  type: string;
  project_naam?: string | null;
  notities?: string | null;
};

type Medewerker = {
  id: number;
  naam: string;
  functie?: string | null;
  contracturen_per_week?: number | null;
};

type LegePlanItem = {
  medewerker_id: number;
  datum: string;
  titel: string;
  uren: string;
  status: string;
  type: string;
  project_naam: string;
  notities: string;
};

export default function ModulesPlanning() {
  const [maandag, setMaandag] = useState(() => maandagVanWeek(new Date()));
  const [dialoog, setDialoog] = useState<Partial<LegePlanItem> | null>(null);
  const [bewerkenId, setBewerkenId] = useState<number | null>(null);

  const queryClient = useQueryClient();

  const datumStrings = DAGEN.map((_, i) => {
    const d = new Date(maandag);
    d.setDate(maandag.getDate() + i);
    return datumNaarStr(d);
  });

  const van = datumStrings[0];
  const tot = datumStrings[4];

  const { data: items = [], isLoading: itemsLoading } = useListPlanningItems(
    { van, tot },
    { query: { queryKey: ["planning-items", van, tot] } }
  );
  const { data: medewerkers = [], isLoading: medewerkersLoading } = useListPlanningMedewerkers(
    { query: { queryKey: ["planning-medewerkers"] } }
  );
  const { data: afwezigheid = [] } = useListPlanningAfwezigheid(
    {},
    { query: { queryKey: ["planning-afwezigheid"] } }
  );

  const createMut = useCreatePlanningItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["planning-items"] });
        setDialoog(null);
        setBewerkenId(null);
      },
    },
  });
  const updateMut = useUpdatePlanningItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["planning-items"] });
        setDialoog(null);
        setBewerkenId(null);
      },
    },
  });
  const deleteMut = useDeletePlanningItem({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["planning-items"] }),
    },
  });

  function vorigeWeek() {
    const n = new Date(maandag);
    n.setDate(n.getDate() - 7);
    setMaandag(n);
  }

  function volgendeWeek() {
    const n = new Date(maandag);
    n.setDate(n.getDate() + 7);
    setMaandag(n);
  }

  function vandaag() {
    setMaandag(maandagVanWeek(new Date()));
  }

  function openNieuwPlanItem(medewerkerId: number, datum: string) {
    setBewerkenId(null);
    setDialoog({ medewerker_id: medewerkerId, datum, status: "ingepland", type: "project", uren: "8", titel: "", project_naam: "", notities: "" });
  }

  function openBewerken(item: PlanItem) {
    setBewerkenId(item.id);
    setDialoog({
      medewerker_id: item.medewerker_id ?? undefined,
      datum: item.datum_start,
      titel: item.titel,
      uren: String(item.uren),
      status: item.status,
      type: item.type,
      project_naam: item.project_naam ?? "",
      notities: item.notities ?? "",
    });
  }

  function handleOpslaan() {
    if (!dialoog?.medewerker_id || !dialoog.datum || !dialoog.titel) return;
    const payload = {
      titel: dialoog.titel ?? "",
      medewerker_id: dialoog.medewerker_id,
      datum_start: dialoog.datum ?? "",
      datum_eind: dialoog.datum ?? "",
      uren: parseFloat(dialoog.uren ?? "8") || 8,
      status: dialoog.status ?? "ingepland",
      type: dialoog.type ?? "project",
      project_naam: dialoog.project_naam || undefined,
      notities: dialoog.notities || undefined,
    };
    if (bewerkenId) {
      updateMut.mutate({ id: bewerkenId, data: payload });
    } else {
      createMut.mutate({ data: payload });
    }
  }

  // Bereken geplande uren per medewerker per dag
  const urenPerMedewerkerPerDag = useMemo(() => {
    const kaart = new Map<string, number>();
    for (const item of items as PlanItem[]) {
      if (!item.medewerker_id) continue;
      const sleutel = `${item.medewerker_id}_${item.datum_start}`;
      kaart.set(sleutel, (kaart.get(sleutel) ?? 0) + item.uren);
    }
    return kaart;
  }, [items]);

  // Capaciteit per medewerker per week
  const weekUrenPerMedewerker = useMemo(() => {
    const kaart = new Map<number, number>();
    for (const item of items as PlanItem[]) {
      if (!item.medewerker_id) continue;
      kaart.set(item.medewerker_id, (kaart.get(item.medewerker_id) ?? 0) + item.uren);
    }
    return kaart;
  }, [items]);

  // Afwezigheid per medewerker per dag
  const afwezigheidDagen = useMemo(() => {
    const kaart = new Set<string>();
    for (const af of afwezigheid) {
      if (af.status === "afgewezen") continue;
      for (const dag of datumStrings) {
        if (dag >= af.datum_start && dag <= af.datum_eind) {
          kaart.add(`${af.medewerker_id}_${dag}`);
        }
      }
    }
    return kaart;
  }, [afwezigheid, datumStrings]);

  const isLoading = itemsLoading || medewerkersLoading;
  const vandaagStr = datumNaarStr(new Date());

  return (
    <TooltipProvider>
      <div className="p-6 space-y-5 max-w-full">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Planning</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Week {weekNummer(maandag)} — {weekLabel(maandag)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/modules/planning/afwezigheid">
              <Button variant="outline" size="sm">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Afwezigheid
              </Button>
            </Link>
            <Link href="/modules/planning/medewerkers">
              <Button variant="outline" size="sm">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Medewerkers
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={vandaag}>Vandaag</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={vorigeWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={volgendeWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Samenvattingskaarten */}
        <div className="grid grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Medewerkers gepland</p>
              <p className="text-xl font-semibold">{weekUrenPerMedewerker.size}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Planningitems deze week</p>
              <p className="text-xl font-semibold">{(items as PlanItem[]).length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Totaal geplande uren</p>
              <p className="text-xl font-semibold">
                {Array.from(weekUrenPerMedewerker.values()).reduce((s, u) => s + u, 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Afwezigheid deze week</p>
              <p className="text-xl font-semibold">{afwezigheid.filter((a) => datumStrings.some((d) => d >= a.datum_start && d <= a.datum_eind)).length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Weekgrid */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : medewerkers.length === 0 ? (
            <CardContent className="py-16 text-center text-muted-foreground">
              <CalendarCheck className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Geen actieve medewerkers gevonden.</p>
              <p className="text-xs mt-1">Voeg eerst medewerkers toe via HRM / Personeel.</p>
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-44" />
                  {DAGEN.map((_, i) => <col key={i} />)}
                </colgroup>
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Medewerker
                    </th>
                    {datumStrings.map((dag, i) => (
                      <th
                        key={dag}
                        className={`px-3 py-3 text-center text-xs font-medium uppercase tracking-wide ${dag === vandaagStr ? "bg-primary/5 text-primary" : "text-muted-foreground"}`}
                      >
                        <div>{DAGEN_KORT[i]}</div>
                        <div className={`text-base font-semibold mt-0.5 ${dag === vandaagStr ? "text-primary" : "text-slate-800"}`}>
                          {new Date(dag + "T00:00:00").getDate()}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(medewerkers as Medewerker[]).map((med) => {
                    const weekUren = weekUrenPerMedewerker.get(med.id) ?? 0;
                    const contractUren = med.contracturen_per_week ?? 40;
                    const overGepland = weekUren > contractUren;

                    return (
                      <tr key={med.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2 border-r bg-white">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-slate-800">{med.naam}</p>
                              {med.functie && (
                                <p className="text-xs text-muted-foreground">{med.functie}</p>
                              )}
                            </div>
                            {overGepland && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  Overplanning: {weekUren}u gepland, {contractUren}u contract
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <div className="mt-1">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span className={overGepland ? "text-amber-600 font-medium" : ""}>{weekUren}u</span>
                              <span>/</span>
                              <span>{contractUren}u</span>
                            </div>
                            <div className="mt-1 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-1 rounded-full transition-all ${overGepland ? "bg-amber-400" : "bg-primary"}`}
                                style={{ width: `${Math.min(100, (weekUren / contractUren) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        {datumStrings.map((dag) => {
                          const dagItems = (items as PlanItem[]).filter(
                            (it) => it.medewerker_id === med.id && it.datum_start <= dag && it.datum_eind >= dag
                          );
                          const isAfwezig = afwezigheidDagen.has(`${med.id}_${dag}`);
                          const isVandaag = dag === vandaagStr;

                          return (
                            <td
                              key={dag}
                              className={`px-2 py-1.5 align-top min-h-[80px] border-l ${isVandaag ? "bg-primary/5" : ""} ${isAfwezig && dagItems.length === 0 ? "bg-orange-50" : ""}`}
                              style={{ verticalAlign: "top" }}
                            >
                              <div className="space-y-1">
                                {isAfwezig && dagItems.length === 0 && (
                                  <div className="rounded border border-orange-200 bg-orange-100 px-1.5 py-1 text-xs text-orange-700">
                                    Afwezig
                                  </div>
                                )}
                                {dagItems.map((item) => (
                                  <Tooltip key={item.id}>
                                    <TooltipTrigger asChild>
                                      <button
                                        className={`w-full rounded border-l-2 px-1.5 py-1 text-left text-xs transition-all hover:opacity-80 ${STATUS_KLEUR[item.status] ?? STATUS_KLEUR.concept} ${TYPE_KLEUR[item.type] ?? ""}`}
                                        onClick={() => openBewerken(item)}
                                      >
                                        <p className="font-medium truncate">{item.titel}</p>
                                        {item.project_naam && (
                                          <p className="truncate opacity-70">{item.project_naam}</p>
                                        )}
                                        <p className="opacity-60">{item.uren}u</p>
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="font-medium">{item.titel}</p>
                                      {item.project_naam && <p>{item.project_naam}</p>}
                                      <p>{item.uren} uur — {item.status}</p>
                                      {item.notities && <p className="text-xs opacity-70">{item.notities}</p>}
                                    </TooltipContent>
                                  </Tooltip>
                                ))}
                                <button
                                  className="w-full rounded p-0.5 text-xs text-muted-foreground hover:bg-slate-200 hover:text-slate-700 transition-colors opacity-0 hover:opacity-100 group-hover:opacity-100"
                                  style={{ opacity: undefined }}
                                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "")}
                                  onClick={() => openNieuwPlanItem(med.id, dag)}
                                >
                                  <Plus className="h-3 w-3 inline" />
                                </button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Legenda */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="font-medium text-slate-600">Type:</span>
          {[
            { kleur: "border-l-primary", label: "Project" },
            { kleur: "border-l-slate-400", label: "Intern" },
            { kleur: "border-l-orange-400", label: "Afwezig" },
          ].map(({ kleur, label }) => (
            <span key={label} className="flex items-center gap-1">
              <span className={`inline-block w-3 h-3 rounded border-l-2 bg-slate-100 ${kleur}`} />
              {label}
            </span>
          ))}
          <span className="ml-4 font-medium text-slate-600">Status:</span>
          {Object.entries({ concept: "Concept", ingepland: "Ingepland", bevestigd: "Bevestigd", uitgevoerd: "Uitgevoerd" }).map(([k, v]) => (
            <span key={k} className={`rounded px-1.5 py-0.5 ${STATUS_KLEUR[k]}`}>{v}</span>
          ))}
        </div>

        {/* Plan item dialoog */}
        <Dialog open={dialoog !== null} onOpenChange={() => setDialoog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{bewerkenId ? "Planningitem bewerken" : "Planningitem toevoegen"}</DialogTitle>
            </DialogHeader>
            {dialoog && (
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label>Medewerker</Label>
                  <Select
                    value={dialoog.medewerker_id ? String(dialoog.medewerker_id) : ""}
                    onValueChange={(v) => setDialoog((d) => d ? { ...d, medewerker_id: parseInt(v, 10) } : d)}
                  >
                    <SelectTrigger><SelectValue placeholder="Kies medewerker..." /></SelectTrigger>
                    <SelectContent>
                      {(medewerkers as Medewerker[]).map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Titel *</Label>
                  <Input
                    value={dialoog.titel ?? ""}
                    onChange={(e) => setDialoog((d) => d ? { ...d, titel: e.target.value } : d)}
                    placeholder="Omschrijving van de werkzaamheid"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Datum</Label>
                    <Input
                      type="date"
                      value={dialoog.datum ?? ""}
                      onChange={(e) => setDialoog((d) => d ? { ...d, datum: e.target.value } : d)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Uren</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="12"
                      value={dialoog.uren ?? "8"}
                      onChange={(e) => setDialoog((d) => d ? { ...d, uren: e.target.value } : d)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select
                      value={dialoog.type ?? "project"}
                      onValueChange={(v) => setDialoog((d) => d ? { ...d, type: v } : d)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="project">Project</SelectItem>
                        <SelectItem value="intern">Intern</SelectItem>
                        <SelectItem value="afwezig">Afwezig</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select
                      value={dialoog.status ?? "ingepland"}
                      onValueChange={(v) => setDialoog((d) => d ? { ...d, status: v } : d)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="concept">Concept</SelectItem>
                        <SelectItem value="ingepland">Ingepland</SelectItem>
                        <SelectItem value="bevestigd">Bevestigd</SelectItem>
                        <SelectItem value="uitgevoerd">Uitgevoerd</SelectItem>
                        <SelectItem value="geannuleerd">Geannuleerd</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Project / Gebouw</Label>
                  <Input
                    value={dialoog.project_naam ?? ""}
                    onChange={(e) => setDialoog((d) => d ? { ...d, project_naam: e.target.value } : d)}
                    placeholder="Projectnaam of gebouwnaam"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notities</Label>
                  <Textarea
                    rows={2}
                    value={dialoog.notities ?? ""}
                    onChange={(e) => setDialoog((d) => d ? { ...d, notities: e.target.value } : d)}
                    placeholder="Aanvullende opmerkingen..."
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              {bewerkenId && (
                <Button
                  variant="outline"
                  className="mr-auto text-destructive hover:text-destructive"
                  onClick={() => {
                    deleteMut.mutate({ id: bewerkenId });
                    setDialoog(null);
                  }}
                >
                  Verwijderen
                </Button>
              )}
              <Button variant="outline" onClick={() => setDialoog(null)}>Annuleren</Button>
              <Button
                onClick={handleOpslaan}
                disabled={!dialoog?.titel || !dialoog?.medewerker_id || createMut.isPending || updateMut.isPending}
              >
                {bewerkenId ? "Opslaan" : "Toevoegen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

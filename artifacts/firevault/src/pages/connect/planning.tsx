import { useState, useMemo } from "react";
import { useListOnderhoud, useListInspecties, useListGebouwen } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarDays, Wrench, Search, AlertTriangle, Building, ChevronLeft, ChevronRight,
} from "lucide-react";

type PlanningItem = {
  id: number;
  soort: "onderhoud" | "inspectie";
  titel: string;
  gebouw_id: number | null;
  gebouw_naam: string | null;
  datum: string | null;
  status: string;
  prioriteit?: string;
  type?: string;
};

const PRIORITEIT_KLEUR: Record<string, string> = {
  kritiek: "bg-red-100 text-red-800 border-red-200",
  hoog: "bg-orange-100 text-orange-800 border-orange-200",
  normaal: "bg-blue-100 text-blue-800 border-blue-200",
  laag: "bg-slate-100 text-slate-700 border-slate-200",
};

const STATUS_KLEUR: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  in_behandeling: "bg-blue-100 text-blue-800",
  voltooid: "bg-green-100 text-green-800",
  gepland: "bg-violet-100 text-violet-800",
  afgerond: "bg-green-100 text-green-800",
};

function formatDatum(d: string) {
  return new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function weekNummer(d: Date) {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7);
}

function weekLabel(d: Date) {
  const wk = weekNummer(d);
  const jaar = d.getFullYear();
  const ma = new Date(d);
  ma.setDate(d.getDate() - d.getDay() + 1);
  const vr = new Date(ma);
  vr.setDate(ma.getDate() + 4);
  const fmt = (dt: Date) => dt.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  return `Week ${wk} — ${fmt(ma)} t/m ${fmt(vr)} ${jaar}`;
}

export default function ConnectPlanning() {
  const [gebouwFilter, setGebouwFilter] = useState<string>("alle");
  const [soortFilter, setSoortFilter] = useState<string>("alle");

  const { data: onderhoudData, isLoading: ladenO } = useListOnderhoud();
  const { data: inspectiesData, isLoading: ladenI } = useListInspecties();
  const { data: gebouwenData } = useListGebouwen();

  const gebouwen = gebouwenData ?? [];
  const laden = ladenO || ladenI;

  const items = useMemo<PlanningItem[]>(() => {
    const list: PlanningItem[] = [];
    for (const o of onderhoudData ?? []) {
      if (!o.deadline) continue;
      list.push({
        id: o.id,
        soort: "onderhoud",
        titel: o.titel,
        gebouw_id: o.gebouw_id ?? null,
        gebouw_naam: (o as { gebouw_naam?: string | null }).gebouw_naam ?? null,
        datum: o.deadline,
        status: o.status,
        prioriteit: o.prioriteit,
      });
    }
    for (const i of inspectiesData ?? []) {
      const datum = (i as { datum?: string | null }).datum;
      if (!datum) continue;
      list.push({
        id: i.id,
        soort: "inspectie",
        titel: `Inspectie — ${(i as { type?: string }).type ?? i.id}`,
        gebouw_id: (i as { gebouw_id?: number | null }).gebouw_id ?? null,
        gebouw_naam: (i as { gebouw_naam?: string | null }).gebouw_naam ?? null,
        datum,
        status: i.status,
        type: (i as { type?: string }).type,
      });
    }
    return list;
  }, [onderhoudData, inspectiesData]);

  const gefilterd = useMemo(() => {
    return items
      .filter((it) => {
        if (gebouwFilter !== "alle" && String(it.gebouw_id) !== gebouwFilter) return false;
        if (soortFilter !== "alle" && it.soort !== soortFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (!a.datum) return 1;
        if (!b.datum) return -1;
        return new Date(a.datum).getTime() - new Date(b.datum).getTime();
      });
  }, [items, gebouwFilter, soortFilter]);

  const groepen = useMemo(() => {
    const map = new Map<string, { label: string; items: PlanningItem[] }>();
    for (const it of gefilterd) {
      const d = new Date(it.datum!);
      const key = `${d.getFullYear()}-W${weekNummer(d).toString().padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, { label: weekLabel(d), items: [] });
      map.get(key)!.items.push(it);
    }
    return Array.from(map.entries()).map(([k, v]) => ({ key: k, ...v }));
  }, [gefilterd]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planning</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Overzicht van werkorders en inspecties op deadline
          </p>
        </div>
        <Badge variant="outline" className="text-xs px-2 py-1">
          <CalendarDays className="h-3 w-3 mr-1" />
          FPS Connect
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={soortFilter} onValueChange={setSoortFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Alle typen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle typen</SelectItem>
            <SelectItem value="onderhoud">Werkorders</SelectItem>
            <SelectItem value="inspectie">Inspecties</SelectItem>
          </SelectContent>
        </Select>

        <Select value={gebouwFilter} onValueChange={setGebouwFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Alle gebouwen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle gebouwen</SelectItem>
            {gebouwen.map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>
                {g.naam}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto text-sm text-muted-foreground flex items-center gap-1">
          <CalendarDays className="h-4 w-4" />
          {gefilterd.length} item{gefilterd.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Timeline */}
      {laden ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : groepen.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Geen gepland werk gevonden</p>
            <p className="text-sm mt-1">
              Werkorders met deadline en geplande inspecties verschijnen hier.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groepen.map((groep) => (
            <Card key={groep.key}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {groep.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {groep.items.map((item) => (
                  <div
                    key={`${item.soort}-${item.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
                  >
                    <div className="shrink-0">
                      {item.soort === "onderhoud" ? (
                        <Wrench className="h-4 w-4 text-orange-600" />
                      ) : (
                        <Search className="h-4 w-4 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.titel}</p>
                      {item.gebouw_naam && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Building className="h-3 w-3" />
                          {item.gebouw_naam}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.prioriteit && item.prioriteit !== "normaal" && (
                        <Badge variant="outline" className={`text-xs ${PRIORITEIT_KLEUR[item.prioriteit] ?? ""}`}>
                          {item.prioriteit === "kritiek" && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
                          {item.prioriteit}
                        </Badge>
                      )}
                      <Badge className={`text-xs capitalize ${STATUS_KLEUR[item.status] ?? "bg-slate-100 text-slate-700"}`}>
                        {item.status.replace("_", " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDatum(item.datum!)}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  useListWerkbonnen,
  useListToewijsbareGebruikers,
  useListOnderhoudscontracten,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Building,
  User,
  Filter,
  X,
  Wrench,
} from "lucide-react";

const statusKleur: Record<string, string> = {
  gepland: "bg-blue-100 text-blue-800 border-blue-200",
  in_uitvoering: "bg-orange-100 text-orange-800 border-orange-200",
  voltooid: "bg-green-100 text-green-800 border-green-200",
  geannuleerd: "bg-gray-100 text-gray-700 border-gray-200",
};

const statusLabel: Record<string, string> = {
  gepland: "Gepland",
  in_uitvoering: "In uitvoering",
  voltooid: "Voltooid",
  geannuleerd: "Geannuleerd",
};

const typeLabel: Record<string, string> = {
  preventief: "Preventief",
  correctief: "Correctief",
  inspectie: "Inspectie",
  storing: "Storing",
  opname: "Opname",
};

export default function OnderhoudPlanning() {
  const [, navigate] = useLocation();
  const [datum, setDatum] = useState(new Date());
  const [view, setView] = useState<"maand" | "kwartaal">("maand");
  
  // Filters
  const [monteurFilter, setMonteurFilter] = useState("all");
  const [contractTypeFilter, setContractTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: monteurs } = useListToewijsbareGebruikers();
  
  // Bereken bereik
  const startBereik = useMemo(() => {
    const d = new Date(datum.getFullYear(), datum.getMonth(), 1);
    if (view === "kwartaal") {
      const q = Math.floor(d.getMonth() / 3);
      d.setMonth(q * 3);
    }
    return d;
  }, [datum, view]);

  const eindBereik = useMemo(() => {
    const d = new Date(startBereik);
    if (view === "maand") {
      d.setMonth(d.getMonth() + 1);
    } else {
      d.setMonth(d.getMonth() + 3);
    }
    d.setDate(d.getDate() - 1);
    return d;
  }, [startBereik, view]);

  const { data: werkbonnen, isLoading } = useListWerkbonnen({
    start_datum: startBereik.toISOString().split("T")[0],
    eind_datum: eindBereik.toISOString().split("T")[0],
  });

  const gefilterdeWerkbonnen = useMemo(() => {
    return werkbonnen?.filter((w) => {
      const matchMonteur = monteurFilter === "all" || w.monteur_id === parseInt(monteurFilter);
      const matchStatus = statusFilter === "all" || w.status === statusFilter;
      const matchType = contractTypeFilter === "all" || w.type === contractTypeFilter;
      return matchMonteur && matchStatus && matchType;
    }) ?? [];
  }, [werkbonnen, monteurFilter, statusFilter, contractTypeFilter]);

  const dagen = useMemo(() => {
    const result = [];
    const curr = new Date(startBereik);
    // Voor maandweergave willen we de kalendergrid vullen
    if (view === "maand") {
      const startDay = curr.getDay(); // 0 = zon, 1 = maa
      const offset = startDay === 0 ? 6 : startDay - 1;
      curr.setDate(curr.getDate() - offset);
      
      for (let i = 0; i < 42; i++) {
        result.push(new Date(curr));
        curr.setDate(curr.getDate() + 1);
      }
    } else {
      // Kwartaalweergave: per week?
      const end = new Date(eindBereik);
      while (curr <= end) {
        result.push(new Date(curr));
        curr.setDate(curr.getDate() + 1);
      }
    }
    return result;
  }, [startBereik, eindBereik, view]);

  const navigateMonth = (offset: number) => {
    const newDate = new Date(datum);
    if (view === "maand") {
      newDate.setMonth(newDate.getMonth() + offset);
    } else {
      newDate.setMonth(newDate.getMonth() + offset * 3);
    }
    setDatum(newDate);
  };

  const resetFilters = () => {
    setMonteurFilter("all");
    setContractTypeFilter("all");
    setStatusFilter("all");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-lg font-semibold min-w-[150px] text-center">
            {view === "maand" 
              ? datum.toLocaleDateString("nl-NL", { month: "long", year: "numeric" })
              : `Kwartaal ${Math.floor(datum.getMonth() / 3) + 1}, ${datum.getFullYear()}`
            }
          </div>
          <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={() => setDatum(new Date())} className="ml-2">
            Vandaag
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={monteurFilter} onValueChange={setMonteurFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Monteur" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle monteurs</SelectItem>
              {monteurs?.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={contractTypeFilter} onValueChange={setContractTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle types</SelectItem>
              {Object.entries(typeLabel).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statussen</SelectItem>
              {Object.entries(statusLabel).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(monteurFilter !== "all" || contractTypeFilter !== "all" || statusFilter !== "all") && (
            <Button variant="ghost" size="icon" onClick={resetFilters} title="Filters wissen">
              <X className="h-4 w-4" />
            </Button>
          )}

          <div className="h-8 w-px bg-border mx-2" />
          
          <div className="flex bg-muted rounded-lg p-1">
            <Button 
              variant={view === "maand" ? "secondary" : "ghost"} 
              size="sm" 
              onClick={() => setView("maand")}
              className="px-3"
            >
              Maand
            </Button>
            <Button 
              variant={view === "kwartaal" ? "secondary" : "ghost"} 
              size="sm" 
              onClick={() => setView("kwartaal")}
              className="px-3"
            >
              Kwartaal
            </Button>
          </div>
        </div>
      </div>

      {view === "maand" ? (
        <Card className="shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b bg-muted/50">
            {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((d) => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-[120px]">
            {dagen.map((d, i) => {
              const dStr = d.toISOString().split("T")[0];
              const dagWerkbonnen = gefilterdeWerkbonnen.filter(w => w.geplande_datum === dStr);
              const isAndereMaand = d.getMonth() !== startBereik.getMonth();
              const isVandaag = dStr === new Date().toISOString().split("T")[0];
              
              return (
                <div 
                  key={i} 
                  className={`border-r border-b p-1.5 overflow-hidden flex flex-col gap-1 transition-colors hover:bg-muted/10 ${isAndereMaand ? "bg-muted/30" : "bg-card"}`}
                >
                  <div className={`text-right text-xs font-medium mb-1 ${isVandaag ? "text-primary font-bold" : isAndereMaand ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                    {d.getDate()}
                  </div>
                  <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar pr-0.5">
                    {dagWerkbonnen.map((w) => (
                      <button
                        key={w.id}
                        onClick={() => navigate(`/onderhoud/werkbonnen/${w.id}`)}
                        className={`text-[10px] text-left px-1.5 py-1 rounded border shadow-sm transition-transform active:scale-95 truncate hover:brightness-95 ${statusKleur[w.status] || "bg-slate-100"}`}
                        title={`${w.werkbonnummer}: ${w.titel}`}
                      >
                        <div className="font-semibold truncate">{w.titel}</div>
                        <div className="opacity-70 flex items-center gap-1">
                          <Building className="h-2 w-2" /> {w.gebouw_naam || "Geen gebouw"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {[0, 1, 2].map((monthOffset) => {
            const m = new Date(startBereik);
            m.setMonth(m.getMonth() + monthOffset);
            const mStr = m.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
            
            const mStart = new Date(m.getFullYear(), m.getMonth(), 1);
            const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
            
            const monthWerkbonnen = gefilterdeWerkbonnen.filter(w => {
              if (!w.geplande_datum) return false;
              const wd = new Date(w.geplande_datum);
              return wd >= mStart && wd <= mEnd;
            });

            return (
              <Card key={monthOffset} className="shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/20">
                  <CardTitle className="text-sm font-semibold">{mStr}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {monthWerkbonnen.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      Geen werkbonnen gepland in deze maand.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {monthWerkbonnen.sort((a,b) => (a.geplande_datum || "").localeCompare(b.geplande_datum || "")).map((w) => (
                        <div 
                          key={w.id}
                          className="flex items-center gap-4 px-4 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => navigate(`/onderhoud/werkbonnen/${w.id}`)}
                        >
                          <div className="w-12 text-center shrink-0">
                            <div className="text-xs font-bold">{new Date(w.geplande_datum!).getDate()}</div>
                            <div className="text-[10px] text-muted-foreground uppercase">{new Date(w.geplande_datum!).toLocaleDateString("nl-NL", { weekday: "short" })}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate">{w.titel}</div>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-1"><Building className="h-2.5 w-2.5" /> {w.gebouw_naam || "-"}</span>
                              <span className="flex items-center gap-1"><User className="h-2.5 w-2.5" /> {w.monteur_naam || "Geen monteur"}</span>
                              <span className="font-mono">{w.werkbonnummer}</span>
                            </div>
                          </div>
                          <Badge variant="outline" className={`text-[10px] py-0 h-5 ${statusKleur[w.status]}`}>
                            {statusLabel[w.status] || w.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 bg-white/50 flex items-center justify-center z-50">
          <div className="bg-card p-4 rounded-xl shadow-lg border flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
            <span className="text-sm font-medium">Laden...</span>
          </div>
        </div>
      )}
    </div>
  );
}

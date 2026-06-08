import { useListInspecties, useListGebouwen } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, Clock, FileText, Download, Filter } from "lucide-react";
import { useState } from "react";

const STATUS_INFO: Record<string, { kleur: string; label: string; icoon: typeof CheckCircle }> = {
  goedgekeurd: { kleur: "bg-green-100 text-green-800 border-green-200", label: "Goedgekeurd", icoon: CheckCircle },
  afgekeurd:   { kleur: "bg-red-100 text-red-800 border-red-200",       label: "Afgekeurd",   icoon: XCircle },
  gepland:     { kleur: "bg-blue-100 text-blue-800 border-blue-200",    label: "Gepland",     icoon: Clock },
  in_progress: { kleur: "bg-orange-100 text-orange-800 border-orange-200", label: "In uitvoering", icoon: Clock },
};

const TYPE_LABEL: Record<string, string> = {
  oplevering:  "Opleveringsrapport",
  periodiek:   "Periodieke inspectie",
  jaarlijks:   "Jaarlijkse inspectie",
  herstel:     "Herstelcontrole",
};

export default function KlantRapportages() {
  const { data: inspecties } = useListInspecties();
  const { data: gebouwen } = useListGebouwen();
  const [filterGebouw, setFilterGebouw] = useState("alle");
  const [filterStatus, setFilterStatus] = useState("alle");

  const gefilterd = (inspecties ?? []).filter((i: any) => {
    if (filterGebouw !== "alle" && String(i.gebouw_id) !== filterGebouw) return false;
    if (filterStatus !== "alle" && i.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rapportages</h1>
          <p className="text-muted-foreground mt-1">
            Overzicht van alle inspectie- en opleveringsrapporten voor uw gebouwen.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterGebouw} onValueChange={setFilterGebouw}>
          <SelectTrigger className="w-48 h-8 text-sm">
            <SelectValue placeholder="Alle gebouwen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle gebouwen</SelectItem>
            {gebouwen?.map((g: any) => (
              <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue placeholder="Alle statussen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            <SelectItem value="goedgekeurd">Goedgekeurd</SelectItem>
            <SelectItem value="afgekeurd">Afgekeurd</SelectItem>
            <SelectItem value="gepland">Gepland</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{gefilterd.length} rapportage{gefilterd.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Rapportages lijst */}
      <div className="space-y-3">
        {gefilterd.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p>Geen rapportages gevonden voor de huidige filters.</p>
            </CardContent>
          </Card>
        )}

        {gefilterd.map((i: any) => {
          const info = STATUS_INFO[i.status] ?? { kleur: "bg-gray-100 text-gray-600", label: i.status, icoon: Clock };
          const Icoon = info.icoon;
          return (
            <Card key={i.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${i.status === "goedgekeurd" ? "bg-green-100" : i.status === "afgekeurd" ? "bg-red-100" : "bg-blue-100"}`}>
                    <Icoon className={`h-5 w-5 ${i.status === "goedgekeurd" ? "text-green-600" : i.status === "afgekeurd" ? "text-red-600" : "text-blue-600"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{TYPE_LABEL[i.type] ?? i.type}</span>
                      <Badge variant="outline" className={`text-xs ${info.kleur}`}>{info.label}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      Object: <span className="font-medium text-foreground">{i.voorziening_nummer ?? `Voorziening ${i.voorziening_id}`}</span>
                      {i.gebouw_naam && <span> — {i.gebouw_naam}</span>}
                    </div>
                    {i.datum && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Inspectiedatum: {new Date(i.datum).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
                      </div>
                    )}
                    {i.bevindingen && (
                      <div className="mt-2 text-xs bg-muted/50 rounded p-2 text-muted-foreground">
                        {i.bevindingen}
                      </div>
                    )}
                  </div>
                  <Button variant="outline" size="sm" className="flex-shrink-0 h-8 text-xs" disabled>
                    <Download className="h-3.5 w-3.5 mr-1" /> PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

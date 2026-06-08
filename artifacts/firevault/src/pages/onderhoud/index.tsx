import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useListOnderhoud } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench, Building, Calendar, AlertTriangle, CheckCircle, Clock } from "lucide-react";

const prioriteitKleur: Record<string, string> = {
  laag: "bg-gray-100 text-gray-700 border-gray-200",
  normaal: "bg-blue-100 text-blue-800 border-blue-200",
  hoog: "bg-orange-100 text-orange-800 border-orange-200",
  kritiek: "bg-red-100 text-red-800 border-red-200",
};

const statusKleur: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800 border-yellow-200",
  in_uitvoering: "bg-blue-100 text-blue-800 border-blue-200",
  voltooid: "bg-green-100 text-green-800 border-green-200",
  geannuleerd: "bg-gray-100 text-gray-700 border-gray-200",
};

const statusIcon = (status: string) => {
  if (status === "voltooid") return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (status === "in_uitvoering") return <Clock className="h-4 w-4 text-blue-600" />;
  if (status === "open") return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
  return <Wrench className="h-4 w-4 text-muted-foreground" />;
};

export default function Onderhoud() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState("all");
  const [prioriteitFilter, setPrioriteitFilter] = useState("all");

  const { data: taken, isLoading } = useListOnderhoud({
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const filtered = taken?.filter((t) =>
    prioriteitFilter === "all" ? true : t.prioriteit === prioriteitFilter
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("onderhoud.titel")}</h1>
          <p className="text-muted-foreground mt-1">{t("onderhoud.ondertitel")}</p>
        </div>
        <Button>+ {t("onderhoud.nieuweTaak")}</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t("onderhoud.openstaand"), status: "open", kleur: "text-yellow-600", count: taken?.filter((t) => t.status === "open").length ?? 0 },
          { label: t("onderhoud.inUitvoering"), status: "in_uitvoering", kleur: "text-blue-600", count: taken?.filter((t) => t.status === "in_uitvoering").length ?? 0 },
          { label: t("onderhoud.voltooid"), status: "voltooid", kleur: "text-green-600", count: taken?.filter((t) => t.status === "voltooid").length ?? 0 },
          { label: t("onderhoud.kritiek"), status: "kritiek", kleur: "text-destructive", count: taken?.filter((t) => t.prioriteit === "kritiek").length ?? 0 },
        ].map((s) => (
          <Card key={s.label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter(s.status === "kritiek" ? "all" : s.status)}>
            <CardContent className="pt-4 pb-3">
              <div className={`text-2xl font-bold ${s.kleur}`}>{s.count}</div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status filteren" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="open">Openstaand</SelectItem>
            <SelectItem value="in_uitvoering">In uitvoering</SelectItem>
            <SelectItem value="voltooid">Voltooid</SelectItem>
            <SelectItem value="geannuleerd">Geannuleerd</SelectItem>
          </SelectContent>
        </Select>
        <Select value={prioriteitFilter} onValueChange={setPrioriteitFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Prioriteit filteren" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle prioriteiten</SelectItem>
            <SelectItem value="laag">Laag</SelectItem>
            <SelectItem value="normaal">Normaal</SelectItem>
            <SelectItem value="hoog">Hoog</SelectItem>
            <SelectItem value="kritiek">Kritiek</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
        </div>
      )}

      {!isLoading && (
        <div className="space-y-3">
          {filtered?.map((taak) => (
            <Card key={taak.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-muted rounded-md">
                      {statusIcon(taak.status ?? "")}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{taak.titel}</span>
                        <Badge variant="outline" className={statusKleur[taak.status ?? ""]}>
                          {taak.status === "open" ? "Openstaand" : taak.status === "in_uitvoering" ? "In uitvoering" : taak.status === "voltooid" ? "Voltooid" : taak.status}
                        </Badge>
                        <Badge variant="outline" className={prioriteitKleur[taak.prioriteit ?? "normaal"]}>
                          {taak.prioriteit ?? "normaal"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        {taak.gebouw_naam && (
                          <span className="flex items-center gap-1">
                            <Building className="h-3 w-3" />
                            {taak.gebouw_naam}
                          </span>
                        )}
                        {taak.deadline && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Deadline: {new Date(taak.deadline).toLocaleDateString("nl-NL")}
                          </span>
                        )}
                        {taak.toegewezen_aan_naam && (
                          <span>Toegewezen: {taak.toegewezen_aan_naam}</span>
                        )}
                      </div>
                      {taak.omschrijving && (
                        <p className="text-sm text-muted-foreground mt-1 max-w-xl truncate">{taak.omschrijving}</p>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/onderhoud/${taak.id}`}>Details</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!filtered?.length && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Geen onderhoudstaken gevonden.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useListInspecties } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Building, CheckCircle, Clock, AlertCircle, FileText, X, ClipboardList, ChevronUp, ChevronDown } from "lucide-react";
import { LegeStatus } from "@/components/lege-status";
import { DemoBanner } from "@/components/ui/demo-banner";
import { demoInspecties } from "@/lib/demo-data";
import { useVoorkeur } from "@/hooks/use-voorkeur";
import { PaginaHulp } from "@/components/pagina-hulp";

const statusKleur: Record<string, string> = {
  gepland: "bg-blue-100 text-blue-800 border-blue-200",
  in_uitvoering: "bg-yellow-100 text-yellow-800 border-yellow-200",
  afgerond: "bg-green-100 text-green-800 border-green-200",
  afgekeurd: "bg-red-100 text-red-800 border-red-200",
};

const statusLabel: Record<string, string> = {
  gepland: "Gepland",
  in_uitvoering: "In uitvoering",
  afgerond: "Afgerond",
  afgekeurd: "Afgekeurd",
};

const typeLabel: Record<string, string> = {
  oplevering: "Oplevering",
  periodiek: "Periodiek",
  jaarlijks: "Jaarlijks",
  herstel: "Herstel",
};

export default function Inspecties() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useVoorkeur("inspecties_status", "all");
  const [typeFilter, setTypeFilter] = useVoorkeur("inspecties_type", "all");
  const [sorteerKolom, setSorteerKolom] = useVoorkeur("inspecties_sort_col", "geplande_datum");
  const [sorteerRichting, setSorteerRichting] = useVoorkeur("inspecties_sort_dir", "desc");
  const filterActief = statusFilter !== "all" || typeFilter !== "all";

  const { data: inspecties, isLoading } = useListInspecties({
    status: statusFilter !== "all" ? statusFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
  });

  const gesorteerdeInspecties = inspecties ? [...inspecties].sort((a, b) => {
    const valA = a[sorteerKolom as keyof typeof a];
    const valB = b[sorteerKolom as keyof typeof b];
    if (valA === valB) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;
    const factor = sorteerRichting === "asc" ? 1 : -1;
    return valA < valB ? -factor : factor;
  }) : [];

  const statusIcon = (status: string) => {
    if (status === "afgerond") return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (status === "afgekeurd") return <AlertCircle className="h-4 w-4 text-destructive" />;
    if (status === "in_uitvoering") return <Clock className="h-4 w-4 text-yellow-600" />;
    return <Calendar className="h-4 w-4 text-blue-600" />;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PaginaHulp pagina="inspecties" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("inspecties.titel")}</h1>
          <p className="text-muted-foreground mt-1">{t("inspecties.ondertitel")}</p>
        </div>
        <Button asChild>
          <Link href="/inspecties/nieuw">+ {t("inspecties.nieuw")}</Link>
        </Button>
      </div>

      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status filteren" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="gepland">Gepland</SelectItem>
            <SelectItem value="in_uitvoering">In uitvoering</SelectItem>
            <SelectItem value="afgerond">Afgerond</SelectItem>
            <SelectItem value="afgekeurd">Afgekeurd</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Type filteren" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle types</SelectItem>
            <SelectItem value="oplevering">Oplevering</SelectItem>
            <SelectItem value="periodiek">Periodiek</SelectItem>
            <SelectItem value="jaarlijks">Jaarlijks</SelectItem>
            <SelectItem value="herstel">Herstel</SelectItem>
          </SelectContent>
        </Select>

        {filterActief && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter("all");
              setTypeFilter("all");
            }}
          >
            <X className="h-4 w-4 mr-1" /> Filter wissen
          </Button>
        )}

        <div className="ml-auto flex gap-2">
          <Select value={sorteerKolom} onValueChange={setSorteerKolom}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Sorteren op" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="geplande_datum">Gepland op</SelectItem>
              <SelectItem value="gebouw_naam">Gebouw</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="type">Type</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setSorteerRichting(sorteerRichting === "asc" ? "desc" : "asc")}
            title={sorteerRichting === "asc" ? "Oplopend" : "Aflopend"}
          >
            {sorteerRichting === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="space-y-3">
          {gesorteerdeInspecties.map((inspectie) => (
            <Card key={inspectie.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-muted rounded-md">
                      {statusIcon(inspectie.status ?? "")}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {typeLabel[inspectie.type ?? ""] ?? inspectie.type}
                        </span>
                        <Badge variant="outline" className={statusKleur[inspectie.status ?? ""]}>
                          {statusLabel[inspectie.status ?? ""] ?? inspectie.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building className="h-3 w-3" />
                          {inspectie.gebouw_naam ?? "Onbekend gebouw"}
                        </span>
                        {inspectie.geplande_datum && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Gepland: {new Date(inspectie.geplande_datum).toLocaleDateString("nl-NL")}
                          </span>
                        )}
                        {inspectie.inspecteur_naam && (
                          <span>Inspecteur: {inspectie.inspecteur_naam}</span>
                        )}
                      </div>
                      {inspectie.bevindingen && (
                        <p className="text-sm text-muted-foreground mt-1 max-w-xl truncate">
                          {inspectie.bevindingen}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/inspecties/${inspectie.id}`}>
                      <FileText className="h-4 w-4 mr-1" /> Details
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!inspecties?.length && !filterActief && (
            <div className="space-y-4">
              <DemoBanner />
              {demoInspecties.map((inspectie) => (
                <Card key={inspectie.id} className="opacity-80">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-muted rounded-md">
                          {statusIcon(inspectie.status)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{typeLabel[inspectie.type] ?? inspectie.type}</span>
                            <Badge variant="outline" className={statusKleur[inspectie.status]}>
                              {statusLabel[inspectie.status] ?? inspectie.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1"><Building className="h-3 w-3" />{inspectie.gebouw_naam}</span>
                            {inspectie.geplande_datum && (
                              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Gepland: {new Date(inspectie.geplande_datum).toLocaleDateString("nl-NL")}</span>
                            )}
                            {inspectie.inspecteur_naam && <span>Inspecteur: {inspectie.inspecteur_naam}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {!inspecties?.length && filterActief && (
            <LegeStatus
              icoon={ClipboardList}
              titel="Geen inspecties gevonden"
              beschrijving="Er zijn nog geen inspecties aangemaakt of de huidige filters geven geen resultaten."
              variant="kaart"
            />
          )}
        </div>
      )}
    </div>
  );
}

import { useLocation } from "wouter";
import { Link } from "wouter";
import {
  useGetOnderhoudscontractenStatistieken,
  useListOnderhoudscontracten,
  useListWerkbonnen,
  useListRapporten,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText, AlertTriangle, CheckCircle, Clock, TrendingUp,
  CalendarDays, Wrench, Euro, ArrowRight, Building, AlertCircle, Building2,
  CheckCircle2, Lock,
} from "lucide-react";

function formatEuro(bedrag: number | null | undefined): string {
  if (bedrag == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(bedrag);
}

const statusBadge: Record<string, { label: string; className: string }> = {
  gepland: { label: "Gepland", className: "bg-blue-100 text-blue-800 border-blue-200" },
  in_uitvoering: { label: "In uitvoering", className: "bg-orange-100 text-orange-800 border-orange-200" },
  voltooid: { label: "Voltooid", className: "bg-green-100 text-green-800 border-green-200" },
  geannuleerd: { label: "Geannuleerd", className: "bg-gray-100 text-gray-700 border-gray-200" },
};

const RAPPORT_TYPE_LABEL: Record<string, string> = {
  werkpakket_monteur: "Werkpakket monteur",
  voortgang:          "Voortgangsrapportage",
  opleverrapport:     "Opleverrapport brandveiligheid",
  opleverdossier:     "Opleverdossier",
  klant_beknopt:      "Klantrapport — Beknopt",
  klant_uitgebreid:   "Klantrapport — Uitgebreid",
  intern_controle:    "Interne controle",
  beheeradvies:       "Beheeradvies",
};

export default function OnderhoudDashboard() {
  const [, navigate] = useLocation();
  const { data: stats, isLoading: statsLoading } = useGetOnderhoudscontractenStatistieken();
  const { data: contracten } = useListOnderhoudscontracten();
  const { data: werkbonnen } = useListWerkbonnen();
  const { data: alleRapporten } = useListRapporten({ status: "definitief" });
  const definitieveRapporten = alleRapporten ?? [];

  const verlopen = (alleRapporten ?? []).filter(
    (r) => (r.opleverstatus ?? r.status) === "verstreken",
  );

  const aflopend = contracten?.filter((c) => {
    if (!c.einddatum) return false;
    const eind = new Date(c.einddatum);
    const over60 = new Date();
    over60.setDate(over60.getDate() + 60);
    return c.status === "actief" && eind <= over60;
  }) ?? [];

  const openWerkbonnen = werkbonnen?.filter(
    (w) => w.status === "gepland" || w.status === "in_uitvoering",
  ) ?? [];

  const recentVoltooid = werkbonnen
    ?.filter((w) => w.status === "voltooid")
    .slice(0, 5) ?? [];

  return (
    <div className="space-y-6">
      {statsLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate("/onderhoud/contracten")}
            >
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <span className="text-sm text-muted-foreground">Actieve contracten</span>
                </div>
                <div className="text-3xl font-bold mt-1">{stats?.actief ?? 0}</div>
                <div className="text-xs text-muted-foreground">
                  {stats?.totaal ?? 0} totaal
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <Euro className="h-5 w-5 text-green-600" />
                  <span className="text-sm text-muted-foreground">Contractwaarde</span>
                </div>
                <div className="text-3xl font-bold mt-1">
                  {formatEuro(stats?.contractwaarde_totaal)}
                </div>
                <div className="text-xs text-muted-foreground">totaal portfolio</div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate("/onderhoud/werkbonnen")}
            >
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-orange-500" />
                  <span className="text-sm text-muted-foreground">Open werkbonnen</span>
                </div>
                <div className="text-3xl font-bold mt-1 text-orange-600">
                  {stats?.werkbonnen_open ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">gepland + in uitvoering</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-blue-500" />
                  <span className="text-sm text-muted-foreground">Onderhoud deze maand</span>
                </div>
                <div className="text-3xl font-bold mt-1 text-blue-600">
                  {stats?.onderhoud_deze_maand ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">gepland bezoek</div>
              </CardContent>
            </Card>
          </div>

          {(stats?.aflopend_30_dagen ?? 0) > 0 || (stats?.achterstallig ?? 0) > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(stats?.aflopend_30_dagen ?? 0) > 0 && (
                <Card className="border-orange-200 bg-orange-50">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-orange-600" />
                      <span className="font-medium text-orange-800">
                        {stats?.aflopend_30_dagen} contract{(stats?.aflopend_30_dagen ?? 0) !== 1 ? "en" : ""} verloopt binnenkort
                      </span>
                    </div>
                    <p className="text-sm text-orange-700 mt-1">
                      Einddatum binnen 30 dagen — actie vereist
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 border-orange-300 text-orange-700 hover:bg-orange-100"
                      onClick={() => navigate("/onderhoud/contracten")}
                    >
                      Bekijken <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </CardContent>
                </Card>
              )}
              {(stats?.achterstallig ?? 0) > 0 && (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                      <span className="font-medium text-red-800">
                        {stats?.achterstallig} achterstallig onderhoud
                      </span>
                    </div>
                    <p className="text-sm text-red-700 mt-1">
                      Geplande datum verstreken zonder uitvoering
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 border-red-300 text-red-700 hover:bg-red-100"
                      onClick={() => navigate("/onderhoud/werkbonnen")}
                    >
                      Werkbonnen <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </>
      )}

      {verlopen.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-red-800">
              <AlertCircle className="h-5 w-5 text-red-600" />
              {verlopen.length} rapport{verlopen.length !== 1 ? "en" : ""} met verlopen reactietermijn
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-red-700 mb-3">
              De reactietermijn van onderstaande rapporten is verstreken. Overweeg een werkbon aan te maken of contact op te nemen met de klant.
            </p>
            <div className="space-y-2">
              {verlopen.slice(0, 5).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 p-2.5 rounded-md bg-white border border-red-100"
                >
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-red-900 truncate">
                      {r.titel || r.rapport_type}
                    </div>
                    <div className="text-xs text-red-700 flex items-center gap-1 mt-0.5">
                      {r.gebouw_naam && (
                        <span className="flex items-center gap-0.5">
                          <Building2 className="h-3 w-3" />
                          {r.gebouw_naam}
                        </span>
                      )}
                      {r.reactietermijn_datum && (
                        <span>
                          {r.gebouw_naam ? " — " : ""}
                          Verlopen op{" "}
                          {new Date(r.reactietermijn_datum).toLocaleDateString("nl-NL", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  {r.gebouw_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 border-red-200 text-red-700 hover:bg-red-50 shrink-0"
                      onClick={() => navigate(`/gebouwen/${r.gebouw_id}?tab=rapporten`)}
                    >
                      Rapport <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {verlopen.length > 5 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 border-red-300 text-red-700 hover:bg-red-100 w-full"
                onClick={() => navigate("/rapporten")}
              >
                Alle {verlopen.length} rapporten bekijken <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            )}
            {verlopen.length <= 5 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-1 border-red-300 text-red-700 hover:bg-red-100"
                onClick={() => navigate("/rapporten")}
              >
                Naar rapportenbibliotheek <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Open werkbonnen
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/onderhoud/werkbonnen")}
              >
                Alle <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {openWerkbonnen.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-50" />
                Geen openstaande werkbonnen
              </div>
            ) : (
              <div className="space-y-2">
                {openWerkbonnen.slice(0, 6).map((wb) => (
                  <div
                    key={wb.id}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/onderhoud/werkbonnen/${wb.id}`)}
                    onKeyDown={(e) => { if (e.key === "Enter") navigate(`/onderhoud/werkbonnen/${wb.id}`); }}
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${wb.status === "in_uitvoering" ? "bg-orange-500" : "bg-blue-400"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{wb.titel}</div>
                      <div className="text-xs text-muted-foreground">
                        {wb.werkbonnummer}
                        {wb.gebouw_naam ? ` · ${wb.gebouw_naam}` : ""}
                        {wb.geplande_datum ? ` · ${new Date(wb.geplande_datum).toLocaleDateString("nl-NL")}` : ""}
                        {wb.geplande_kwartaal ? ` · ${wb.geplande_kwartaal}` : ""}
                      </div>
                    </div>
                    <Badge variant="outline" className={statusBadge[wb.status]?.className ?? ""}>
                      {statusBadge[wb.status]?.label ?? wb.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Contracten die aandacht vragen
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/onderhoud/contracten")}
              >
                Alle <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aflopend.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-50" />
                Geen contracten die binnenkort verlopen
              </div>
            ) : (
              <div className="space-y-2">
                {aflopend.slice(0, 6).map((c) => {
                  const dagenOver = c.einddatum
                    ? Math.ceil(
                        (new Date(c.einddatum).getTime() - Date.now()) / 86400000,
                      )
                    : null;
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/onderhoud/contracten/${c.id}`)}
                      onKeyDown={(e) => { if (e.key === "Enter") navigate(`/onderhoud/contracten/${c.id}`); }}
                    >
                      <Building className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{c.contractnummer}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.gebouw_naam ?? c.opdrachtgever ?? "Onbekend gebouw"}
                        </div>
                      </div>
                      {dagenOver !== null && (
                        <span className={`text-xs font-medium ${dagenOver <= 14 ? "text-red-600" : "text-orange-600"}`}>
                          {dagenOver <= 0 ? "Verlopen" : `${dagenOver}d`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {stats?.concept !== undefined && stats.concept > 0 && (
        <Card className="border-dashed border-muted-foreground/30">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <span className="font-medium">{stats.concept} concept-contract{stats.concept !== 1 ? "en" : ""}</span>
                <span className="text-sm text-muted-foreground ml-2">staan nog niet op actief</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => navigate("/onderhoud/contracten")}
              >
                Bekijken
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Recente definitieve rapporten
            </span>
            <Link href="/rapporten">
              <Button variant="ghost" size="sm">
                Alle <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {definitieveRapporten.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Nog geen definitieve rapporten
            </div>
          ) : (
            <div className="space-y-2">
              {definitieveRapporten.slice(0, 6).map((r) => {
                const titel = r.titel || RAPPORT_TYPE_LABEL[r.rapport_type] || r.rapport_type;
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => r.gebouw_id && navigate(`/gebouwen/${r.gebouw_id}/print?rapport_id=${r.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && r.gebouw_id)
                        navigate(`/gebouwen/${r.gebouw_id}/print?rapport_id=${r.id}`);
                    }}
                  >
                    <Lock className="h-4 w-4 text-green-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{titel}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.gebouw_naam ?? "Onbekend gebouw"}
                        {r.bevroren_op
                          ? ` · ${new Date(r.bevroren_op).toLocaleDateString("nl-NL")}`
                          : ""}
                        {r.werkbon_nummer ? ` · ${r.werkbon_nummer}` : ""}
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-xs shrink-0">
                      Definitief
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

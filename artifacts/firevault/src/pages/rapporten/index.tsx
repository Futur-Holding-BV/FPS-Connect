import { useState } from "react";
import { Link } from "wouter";
import { useListRapporten, type Rapport } from "@workspace/api-client-react";
import { useAuth } from "@/context/auth-context";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  FileText,
  CheckCircle2,
  Archive,
  Clock,
  AlertCircle,
  Building2,
  Lock,
} from "lucide-react";

const RAPPORT_TYPE_LABEL: Record<string, string> = {
  werkpakket_monteur: "Werkpakket monteur",
  voortgang: "Voortgangsrapportage",
  opleverrapport: "Opleverrapport brandveiligheid",
  opleverdossier: "Opleverdossier",
};

function reactietermijnDagen(datum: string | null | undefined): number | null {
  if (!datum) return null;
  return Math.ceil((new Date(datum).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function StatusBadge({ rapport }: { rapport: Rapport }) {
  if (rapport.status === "concept") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200">Concept</Badge>
    );
  }
  if (rapport.status === "definitief") {
    const dagen = reactietermijnDagen(rapport.reactietermijn_datum);
    if (dagen === null) {
      return <Badge className="bg-green-100 text-green-700 border-green-200">Definitief</Badge>;
    }
    if (dagen >= 0) {
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          <Clock className="h-3 w-3 mr-1" />
          Definitief — {dagen}d resterend
        </Badge>
      );
    }
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200">
        <AlertCircle className="h-3 w-3 mr-1" />
        Definitief — verlopen
      </Badge>
    );
  }
  return <Badge variant="secondary">Gearchiveerd</Badge>;
}

function StatusIcoon({ status }: { status: string }) {
  if (status === "concept") return <FileText className="h-4 w-4 text-amber-500" />;
  if (status === "definitief") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  return <Archive className="h-4 w-4 text-muted-foreground" />;
}

function useProjectOpenenHref(gebouwId: number): string {
  const { gebruiker } = useAuth();
  const { heeftNiveau } = useBevoegdheid();
  const rol = gebruiker?.rol ?? "";

  if (rol === "klant") return `/klant/rapportages?gebouw=${gebouwId}`;
  if (rol === "hoofdbeheerder") return `/gebouwen/${gebouwId}`;
  if (heeftNiveau("gebouwen", 2)) return `/gebouwen/${gebouwId}`;
  return `/gebouwen/${gebouwId}?tab=uitvoering`;
}

function ProjectOpenenKnop({ gebouwId }: { gebouwId: number }) {
  const href = useProjectOpenenHref(gebouwId);
  return (
    <Link href={href}>
      <Button variant="outline" size="sm" className="text-xs shrink-0">
        Project openen
      </Button>
    </Link>
  );
}

export default function RapportenPagina() {
  const [statusFilter, setStatusFilter] = useState<string>("alle");

  const { data: rapporten = [], isLoading } = useListRapporten(
    statusFilter !== "alle" ? { status: statusFilter as "concept" | "definitief" | "gearchiveerd" } : {},
  );

  const conceptAantal = rapporten.filter((r) => r.status === "concept").length;
  const definitiefAantal = rapporten.filter((r) => r.status === "definitief").length;
  const verlopenAantal = rapporten.filter(
    (r) => r.status === "definitief" && (reactietermijnDagen(r.reactietermijn_datum) ?? 1) < 0,
  ).length;

  return (
    <div className="space-y-6">
      {/* Paginakop */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rapportenbibliotheek</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Overzicht van alle concept- en definitieve opleverrapporten.
        </p>
      </div>

      {/* Statistieken */}
      {!isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">{rapporten.length}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Totaal rapporten</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold text-amber-600">{conceptAantal}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Concept</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold text-green-600">{definitiefAantal}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Definitief</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold text-red-600">{verlopenAantal}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Termijn verlopen</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter + lijst */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Rapporten
            </CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle statussen</SelectItem>
                <SelectItem value="concept">Concept</SelectItem>
                <SelectItem value="definitief">Definitief</SelectItem>
                <SelectItem value="gearchiveerd">Gearchiveerd</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Rapporten laden...
            </div>
          ) : rapporten.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="font-medium">Geen rapporten gevonden</p>
              {statusFilter !== "alle" && (
                <p className="text-xs mt-1">Probeer een andere statusfilter.</p>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {rapporten.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      <StatusIcoon status={r.status} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {r.titel || RAPPORT_TYPE_LABEL[r.rapport_type] || r.rapport_type}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">v{r.versie}</span>
                        <StatusBadge rapport={r} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>{RAPPORT_TYPE_LABEL[r.rapport_type] || r.rapport_type}</span>
                        {r.gebouw_naam && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {r.gebouw_naam}
                          </span>
                        )}
                        <span>
                          {new Date(r.aangemaakt_op).toLocaleDateString("nl-NL", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        {r.status === "definitief" && r.bevroren_op && (
                          <span className="flex items-center gap-1 text-green-700">
                            <Lock className="h-3 w-3" />
                            Bevrozen
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {r.gebouw_id && (
                    <ProjectOpenenKnop gebouwId={r.gebouw_id} />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

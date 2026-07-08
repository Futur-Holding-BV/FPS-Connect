import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListRapporten, type Rapport } from "@workspace/api-client-react";
import { useAuth } from "@/context/auth-context";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Search,
  Download,
  Eye,
  X,
  RefreshCw,
} from "lucide-react";

const RAPPORT_TYPE_LABEL: Record<string, string> = {
  werkpakket_monteur: "Werkpakket monteur",
  voortgang: "Voortgangsrapportage",
  opleverrapport: "Opleverrapport brandveiligheid",
  opleverdossier: "Opleverdossier",
  klant_beknopt: "Klantrapport — Beknopt",
  klant_uitgebreid: "Klantrapport — Uitgebreid",
  intern_controle: "Interne controle",
  beheeradvies: "Beheeradvies",
};

function reactietermijnDagen(datum: string | null | undefined): number | null {
  if (!datum) return null;
  return Math.ceil((new Date(datum).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function StatusBadge({ rapport }: { rapport: Rapport }) {
  const status = rapport.weergave_status ?? rapport.status;
  if (status === "concept") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200">Concept</Badge>
    );
  }
  if (status === "definitief_verzonden") {
    return <Badge className="bg-green-100 text-green-700 border-green-200">Definitief verzonden</Badge>;
  }
  if (status === "reactietermijn_loopt") {
    const dagen = reactietermijnDagen(rapport.reactietermijn_datum);
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200">
        <Clock className="h-3 w-3 mr-1" />
        Reactietermijn loopt{dagen !== null ? ` — ${dagen}d resterend` : ""}
      </Badge>
    );
  }
  if (status === "termijn_verstreken") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200">
        <AlertCircle className="h-3 w-3 mr-1" />
        Termijn verstreken
      </Badge>
    );
  }
  if (status === "vervangen") {
    return (
      <Badge variant="secondary" className="text-muted-foreground">
        <RefreshCw className="h-3 w-3 mr-1" />
        Vervangen door nieuwe versie
      </Badge>
    );
  }
  return <Badge variant="secondary">Gearchiveerd</Badge>;
}

function StatusIcoon({ status }: { status: string }) {
  if (status === "concept") return <FileText className="h-4 w-4 text-amber-500" />;
  if (status === "definitief_verzonden" || status === "reactietermijn_loopt") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === "termijn_verstreken") return <AlertCircle className="h-4 w-4 text-red-600" />;
  if (status === "vervangen") return <RefreshCw className="h-4 w-4 text-muted-foreground" />;
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

function BekijkenKnop({ gebouwId, rapportId }: { gebouwId: number; rapportId: number }) {
  return (
    <Link href={`/gebouwen/${gebouwId}/print?rapport_id=${rapportId}`}>
      <Button variant="outline" size="sm" className="text-xs shrink-0 gap-1">
        <Eye className="h-3.5 w-3.5" />
        Bekijken
      </Button>
    </Link>
  );
}

function DownloadKnop({ gebouwId, rapportId, titel }: { gebouwId: number; rapportId: number; titel: string }) {
  const { toast } = useToast();
  const [bezig, setBezig] = useState(false);

  async function download() {
    setBezig(true);
    try {
      const res = await fetch(
        `/api/gebouwen/${gebouwId}/rapporten/${rapportId}/bijlagenbundel`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(String(data.error ?? "Genereren mislukt"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bijlagenbundel-${titel}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast({
        title: "Downloaden mislukt",
        description: e instanceof Error ? e.message : "Onbekende fout",
        variant: "destructive",
      });
    } finally {
      setBezig(false);
    }
  }

  return (
    <Button variant="outline" size="sm" className="text-xs shrink-0 gap-1" onClick={download} disabled={bezig}>
      {bezig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      Downloaden
    </Button>
  );
}

const ALLE_GEBOUWEN = "alle_gebouwen";
const ALLE_TYPES = "alle_types";

export default function RapportenPagina() {
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [zoekterm, setZoekterm] = useState("");
  const [gebouwFilter, setGebouwFilter] = useState<string>(ALLE_GEBOUWEN);
  const [typeFilter, setTypeFilter] = useState<string>(ALLE_TYPES);
  const [vanafDatum, setVanafDatum] = useState("");
  const [totDatum, setTotDatum] = useState("");

  const { data: rapporten = [], isLoading } = useListRapporten(
    statusFilter !== "alle" ? { status: statusFilter as "concept" | "definitief" | "vervangen" | "gearchiveerd" } : {},
  );

  const gebouwOpties = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rapporten) {
      if (r.gebouw_id && r.gebouw_naam) map.set(r.gebouw_id, r.gebouw_naam);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rapporten]);

  const typeOpties = useMemo(() => {
    const set = new Set<string>();
    for (const r of rapporten) set.add(r.rapport_type);
    return Array.from(set).sort();
  }, [rapporten]);

  const gefilterdeRapporten = useMemo(() => {
    const term = zoekterm.trim().toLowerCase();
    const van = vanafDatum ? new Date(vanafDatum).getTime() : null;
    const tot = totDatum ? new Date(totDatum).getTime() + 24 * 60 * 60 * 1000 - 1 : null;

    const gefilterd = rapporten.filter((r) => {
      if (gebouwFilter !== ALLE_GEBOUWEN && String(r.gebouw_id) !== gebouwFilter) return false;
      if (typeFilter !== ALLE_TYPES && r.rapport_type !== typeFilter) return false;

      if (term) {
        const label = (RAPPORT_TYPE_LABEL[r.rapport_type] ?? r.rapport_type).toLowerCase();
        const hooiberg = [r.titel ?? "", label, r.gebouw_naam ?? "", r.aangemaakt_door_naam ?? ""]
          .join(" ")
          .toLowerCase();
        if (!hooiberg.includes(term)) return false;
      }

      if (van !== null || tot !== null) {
        const peildatum = new Date(r.bevroren_op ?? r.aangemaakt_op).getTime();
        if (van !== null && peildatum < van) return false;
        if (tot !== null && peildatum > tot) return false;
      }

      return true;
    });

    if (!term) return gefilterd;

    function relevantiScore(r: Rapport): number {
      const titel = (r.titel ?? "").toLowerCase();
      const label = (RAPPORT_TYPE_LABEL[r.rapport_type] ?? r.rapport_type).toLowerCase();
      const gebouw = (r.gebouw_naam ?? "").toLowerCase();
      if (titel === term) return 0;
      if (titel.startsWith(term)) return 1;
      if (titel.includes(term)) return 2;
      if (gebouw === term) return 3;
      if (gebouw.startsWith(term)) return 4;
      if (gebouw.includes(term)) return 5;
      if (label.includes(term)) return 6;
      return 7;
    }

    return [...gefilterd].sort((a, b) => relevantiScore(a) - relevantiScore(b));
  }, [rapporten, gebouwFilter, typeFilter, zoekterm, vanafDatum, totDatum]);

  const conceptAantal = rapporten.filter((r) => r.status === "concept").length;
  const definitiefAantal = rapporten.filter((r) => r.status === "definitief").length;
  const verlopenAantal = rapporten.filter((r) => r.weergave_status === "termijn_verstreken").length;

  const filtersActief =
    zoekterm.trim() !== "" ||
    gebouwFilter !== ALLE_GEBOUWEN ||
    typeFilter !== ALLE_TYPES ||
    vanafDatum !== "" ||
    totDatum !== "";

  function wisFilters() {
    setZoekterm("");
    setGebouwFilter(ALLE_GEBOUWEN);
    setTypeFilter(ALLE_TYPES);
    setVanafDatum("");
    setTotDatum("");
  }

  return (
    <div className="space-y-6">
      {/* Paginakop */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rapportenbibliotheek</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Centraal overzicht van alle concept- en definitieve opleverrapporten, over alle gebouwen heen.
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
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Rapporten
            </CardTitle>
            {filtersActief && (
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={wisFilters}>
                <X className="h-3.5 w-3.5" />
                Filters wissen
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="lg:col-span-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground mb-1 block">Zoeken</Label>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={zoekterm}
                  onChange={(e) => setZoekterm(e.target.value)}
                  placeholder="Titel, gebouw, opsteller..."
                  className="pl-8 h-9"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Gebouw</Label>
              <Select value={gebouwFilter} onValueChange={setGebouwFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALLE_GEBOUWEN}>Alle gebouwen</SelectItem>
                  {gebouwOpties.map(([id, naam]) => (
                    <SelectItem key={id} value={String(id)}>{naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Rapporttype</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALLE_TYPES}>Alle types</SelectItem>
                  {typeOpties.map((t) => (
                    <SelectItem key={t} value={t}>{RAPPORT_TYPE_LABEL[t] ?? t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle statussen</SelectItem>
                  <SelectItem value="concept">Concept</SelectItem>
                  <SelectItem value="definitief">Definitief</SelectItem>
                  <SelectItem value="vervangen">Vervangen</SelectItem>
                  <SelectItem value="gearchiveerd">Gearchiveerd</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2 lg:col-span-2 grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Vanaf</Label>
                <Input
                  type="date"
                  value={vanafDatum}
                  onChange={(e) => setVanafDatum(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Tot en met</Label>
                <Input
                  type="date"
                  value={totDatum}
                  onChange={(e) => setTotDatum(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Rapporten laden...
            </div>
          ) : gefilterdeRapporten.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="font-medium">Geen rapporten gevonden</p>
              {(filtersActief || statusFilter !== "alle") && (
                <p className="text-xs mt-1">Probeer andere zoek- of filtercriteria.</p>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {gefilterdeRapporten.map((r) => {
                const titel = r.titel || RAPPORT_TYPE_LABEL[r.rapport_type] || r.rapport_type;
                const veiligeTitel = titel.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
                return (
                  <div
                    key={r.id}
                    className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0 flex-wrap"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 shrink-0">
                        <StatusIcoon status={r.weergave_status ?? r.status} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{titel}</span>
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
                              Bevroren
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.gebouw_id && (
                        <BekijkenKnop gebouwId={r.gebouw_id} rapportId={r.id} />
                      )}
                      {r.gebouw_id && r.status === "definitief" && (
                        <DownloadKnop gebouwId={r.gebouw_id} rapportId={r.id} titel={veiligeTitel} />
                      )}
                      {r.gebouw_id && (
                        <ProjectOpenenKnop gebouwId={r.gebouw_id} />
                      )}
                    </div>
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

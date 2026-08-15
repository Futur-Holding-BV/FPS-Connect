import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
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
  Send,
  XCircle,
} from "lucide-react";
import { GoedkeuringWidget } from "@/components/goedkeuring/goedkeuring-widget";

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
  const os = rapport.opleverstatus;

  if (os === "concept") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200">Concept</Badge>
    );
  }

  if (os === "verzonden") {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200">
        <Send className="h-3 w-3 mr-1" />
        Verzonden
      </Badge>
    );
  }

  if (os === "reactietermijn_loopt") {
    const dagen = reactietermijnDagen(rapport.reactietermijn_datum);
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200">
        <Clock className="h-3 w-3 mr-1" />
        Reactietermijn loopt{dagen !== null ? ` — ${dagen}d resterend` : ""}
      </Badge>
    );
  }

  if (os === "verstreken") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200">
        <AlertCircle className="h-3 w-3 mr-1" />
        Termijn verstreken
      </Badge>
    );
  }

  if (os === "vervangen") {
    return (
      <Badge className="bg-neutral-100 text-neutral-500 border-neutral-200">
        <XCircle className="h-3 w-3 mr-1" />
        Vervangen
      </Badge>
    );
  }

  return <Badge variant="secondary">Gearchiveerd</Badge>;
}

function StatusIcoon({ rapport }: { rapport: Rapport }) {
  const os = rapport.opleverstatus;
  if (os === "concept") return <FileText className="h-4 w-4 text-amber-500" />;
  if (os === "verzonden") return <Send className="h-4 w-4 text-blue-500" />;
  if (os === "reactietermijn_loopt") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (os === "verstreken") return <AlertCircle className="h-4 w-4 text-red-500" />;
  if (os === "vervangen") return <XCircle className="h-4 w-4 text-neutral-400" />;
  return <Archive className="h-4 w-4 text-muted-foreground" />;
}

function useProjectOpenenHref(gebouwId: number): string {
  const { gebruiker } = useAuth();
  const { heeftNiveau } = useBevoegdheid();
  const rol = gebruiker?.rol ?? "";

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
const ALLE_STATUSSEN = "alle";
const FILTER_STORAGE_KEY = "fps_rapporten_filters";

const GELDIGE_OPLEVERSTATUS_WAARDEN = new Set([
  "alle", "concept", "verzonden", "reactietermijn_loopt", "verstreken", "vervangen", "gearchiveerd",
]);

interface RapportenFilterState {
  opleverstatusFilter: string;
  zoekterm: string;
  gebouwFilter: string;
  typeFilter: string;
  vanafDatum: string;
  totDatum: string;
}

function leesFilterState(): RapportenFilterState {
  try {
    const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RapportenFilterState>;
      const opleverstatusFilter =
        typeof parsed.opleverstatusFilter === "string" && GELDIGE_OPLEVERSTATUS_WAARDEN.has(parsed.opleverstatusFilter)
          ? parsed.opleverstatusFilter
          : ALLE_STATUSSEN;
      return {
        opleverstatusFilter,
        zoekterm: typeof parsed.zoekterm === "string" ? parsed.zoekterm : "",
        gebouwFilter: typeof parsed.gebouwFilter === "string" ? parsed.gebouwFilter : ALLE_GEBOUWEN,
        typeFilter: typeof parsed.typeFilter === "string" ? parsed.typeFilter : ALLE_TYPES,
        vanafDatum: typeof parsed.vanafDatum === "string" ? parsed.vanafDatum : "",
        totDatum: typeof parsed.totDatum === "string" ? parsed.totDatum : "",
      };
    }
  } catch {
  }
  return {
    opleverstatusFilter: ALLE_STATUSSEN,
    zoekterm: "",
    gebouwFilter: ALLE_GEBOUWEN,
    typeFilter: ALLE_TYPES,
    vanafDatum: "",
    totDatum: "",
  };
}

export default function RapportenPagina() {
  const zoekString = useSearch();

  const initieleStatus = (() => {
    const params = new URLSearchParams(zoekString);
    const statusParam = params.get("status") ?? "";
    if (GELDIGE_OPLEVERSTATUS_WAARDEN.has(statusParam)) return statusParam;
    return leesFilterState().opleverstatusFilter;
  })();

  const [opleverstatusFilter, setOpleverstatusFilter] = useState<string>(initieleStatus);
  const [zoekterm, setZoekterm] = useState(() => leesFilterState().zoekterm);
  const [gebouwFilter, setGebouwFilter] = useState<string>(() => leesFilterState().gebouwFilter);
  const [typeFilter, setTypeFilter] = useState<string>(() => leesFilterState().typeFilter);
  const [vanafDatum, setVanafDatum] = useState(() => leesFilterState().vanafDatum);
  const [totDatum, setTotDatum] = useState(() => leesFilterState().totDatum);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({ opleverstatusFilter, zoekterm, gebouwFilter, typeFilter, vanafDatum, totDatum }),
      );
    } catch {
    }
  }, [opleverstatusFilter, zoekterm, gebouwFilter, typeFilter, vanafDatum, totDatum]);

  // Map opleverstatus to underlying DB status for API-side pre-filtering
  const apiStatusFilter = useMemo((): { status?: "concept" | "definitief" | "gearchiveerd" } => {
    if (opleverstatusFilter === "concept") return { status: "concept" };
    if (opleverstatusFilter === "gearchiveerd") return { status: "gearchiveerd" };
    if (["verzonden", "reactietermijn_loopt", "verstreken", "vervangen"].includes(opleverstatusFilter)) {
      return { status: "definitief" };
    }
    return {};
  }, [opleverstatusFilter]);

  const { data: rapporten = [], isLoading } = useListRapporten(apiStatusFilter);

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

      // Client-side opleverstatus sub-filter (for detailed definitief sub-states)
      if (opleverstatusFilter !== ALLE_STATUSSEN && r.opleverstatus !== opleverstatusFilter) return false;

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
  }, [rapporten, gebouwFilter, typeFilter, zoekterm, vanafDatum, totDatum, opleverstatusFilter]);

  const conceptAantal = rapporten.filter((r) => r.opleverstatus === "concept").length;
  const lopendAantal = rapporten.filter(
    (r) => r.opleverstatus === "reactietermijn_loopt" || r.opleverstatus === "verzonden",
  ).length;
  const verstrokenAantal = rapporten.filter((r) => r.opleverstatus === "verstreken").length;

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
              <div className="text-2xl font-bold text-green-600">{lopendAantal}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Reactietermijn loopt</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold text-red-600">{verstrokenAantal}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Termijn verstreken</div>
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
              <Select value={opleverstatusFilter} onValueChange={setOpleverstatusFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALLE_STATUSSEN}>Alle statussen</SelectItem>
                  <SelectItem value="concept">Concept</SelectItem>
                  <SelectItem value="verzonden">Verzonden</SelectItem>
                  <SelectItem value="reactietermijn_loopt">Reactietermijn loopt</SelectItem>
                  <SelectItem value="verstreken">Termijn verstreken</SelectItem>
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
            rapporten.length === 0 && !filtersActief && opleverstatusFilter === ALLE_STATUSSEN ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="font-medium">Nog geen rapporten</p>
                <p className="text-xs mt-1">Er zijn nog geen rapporten aangemaakt.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="font-medium">Geen rapporten gevonden</p>
                <p className="text-xs mt-1">Probeer andere zoek- of filtercriteria.</p>
              </div>
            )
          ) : (
            <div className="divide-y">
              {gefilterdeRapporten.map((r) => {
                const titel = r.titel || RAPPORT_TYPE_LABEL[r.rapport_type] || r.rapport_type;
                const veiligeTitel = titel.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
                const isVervangen = r.opleverstatus === "vervangen";
                return (
                  <div
                    key={r.id}
                    className={`flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0 flex-wrap${isVervangen ? " opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 shrink-0">
                        <StatusIcoon rapport={r} />
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
                          {r.opleverstatus === "reactietermijn_loopt" && r.reactietermijn_datum && (
                            <span className="flex items-center gap-1 text-green-700">
                              <Clock className="h-3 w-3" />
                              Tot {new Date(r.reactietermijn_datum).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          )}
                          {r.opleverstatus === "verstreken" && r.reactietermijn_datum && (
                            <span className="flex items-center gap-1 text-red-600">
                              <AlertCircle className="h-3 w-3" />
                              Verstreken {new Date(r.reactietermijn_datum).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          )}
                          {r.klant_reactie_op && (
                            <span className="flex items-center gap-1 text-green-700 font-medium">
                              <CheckCircle2 className="h-3 w-3" />
                              Klant bevestigd {new Date(r.klant_reactie_op).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          )}
                          {isVervangen && r.vervangen_door_id && (
                            <span className="text-neutral-500">
                              Vervangen door v{
                                rapporten.find(x => x.id === r.vervangen_door_id)?.versie ?? "nieuwer"
                              }
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-2">
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
                      <GoedkeuringWidget
                        objectType="opleverrapport"
                        objectId={r.id}
                        documentType="opleverrapport"
                        omschrijving={`${titel}${r.gebouw_naam ? ` — ${r.gebouw_naam}` : ""}`}
                        toonIndienKnop={r.status === "concept"}
                      />
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

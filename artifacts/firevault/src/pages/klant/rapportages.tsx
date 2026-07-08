import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  useListGebouwen,
  useListGebouwRapporten,
  type Rapport,
} from "@workspace/api-client-react";
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
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Download,
  Filter,
  Loader2,
  Lock,
  Eye,
  Building2,
  RefreshCw,
  Archive,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

function reactietermijnDagen(datum: string | null | undefined): number | null {
  if (!datum) return null;
  return Math.ceil((new Date(datum).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function StatusBadge({ rapport }: { rapport: Rapport }) {
  const status = rapport.weergave_status ?? rapport.status;
  if (status === "concept") {
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Concept</Badge>;
  }
  if (status === "definitief_verzonden") {
    return <Badge className="bg-green-100 text-green-700 border-green-200">Definitief verzonden</Badge>;
  }
  if (status === "reactietermijn_loopt") {
    const dagen = reactietermijnDagen(rapport.reactietermijn_datum);
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200">
        <Clock className="h-3 w-3 mr-1" />
        Reactietermijn loopt{dagen !== null ? ` — nog ${dagen} dag${dagen !== 1 ? "en" : ""}` : ""}
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

function datumKort(d: string | null | undefined): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function DownloadKnop({
  gebouwId,
  rapportId,
  titel,
}: {
  gebouwId: number;
  rapportId: number;
  titel: string;
}) {
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
    <Button
      variant="outline"
      size="sm"
      className="flex-shrink-0 h-8 text-xs gap-1"
      onClick={download}
      disabled={bezig}
    >
      {bezig ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      Bijlagen
    </Button>
  );
}

function GebouwRapportenBlok({
  gebouwId,
  gebouwNaam,
  filterStatus,
}: {
  gebouwId: number;
  gebouwNaam: string;
  filterStatus: string;
}) {
  const { data: rapporten = [], isLoading } = useListGebouwRapporten(gebouwId);

  const zichtbaar = useMemo(() => {
    return rapporten.filter((r) => {
      if (r.status === "concept") return false;
      if (filterStatus === "alle") return true;
      return (r.weergave_status ?? r.status) === filterStatus;
    });
  }, [rapporten, filterStatus]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3 pl-1">
        <Loader2 className="h-4 w-4 animate-spin" />
        Laden...
      </div>
    );
  }

  if (zichtbaar.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium py-1.5 pl-1 border-b mb-1">
        <Building2 className="h-3.5 w-3.5" />
        {gebouwNaam}
      </div>
      <div className="divide-y">
        {zichtbaar.map((r) => {
          const weergave = r.weergave_status ?? r.status;
          const isVerlopen = weergave === "termijn_verstreken";
          const veiligeTitel = (r.titel || RAPPORT_TYPE_LABEL[r.rapport_type] || r.rapport_type)
            .replace(/[^a-z0-9]+/gi, "-")
            .toLowerCase();

          return (
            <div
              key={r.id}
              className={`flex items-start gap-3 py-3 first:pt-1 last:pb-1 ${isVerlopen ? "bg-red-50/40 -mx-3 px-3 rounded" : ""}`}
            >
              <div className="mt-0.5 shrink-0">
                <StatusIcoon status={weergave} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">
                    {r.titel || RAPPORT_TYPE_LABEL[r.rapport_type] || r.rapport_type}
                  </span>
                  <span className="text-xs text-muted-foreground">v{r.versie}</span>
                  <StatusBadge rapport={r} />
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                  <span>{RAPPORT_TYPE_LABEL[r.rapport_type] || r.rapport_type}</span>
                  {r.bevroren_op && (
                    <div className="flex items-center gap-1 text-green-700 mt-0.5">
                      <Lock className="h-3 w-3" />
                      Definitief vastgesteld op {datumKort(r.bevroren_op)}
                    </div>
                  )}
                  {r.reactietermijn_datum && weergave === "reactietermijn_loopt" && (
                    <div className="text-green-700 mt-0.5">
                      Reageer voor: {datumKort(r.reactietermijn_datum)}
                    </div>
                  )}
                  {r.reactietermijn_datum && weergave === "termijn_verstreken" && (
                    <div className="text-red-600 font-medium mt-0.5">
                      Reactietermijn verstreken op {datumKort(r.reactietermijn_datum)} — neem contact op met FPS Brandpreventie.
                    </div>
                  )}
                  {weergave === "vervangen" && r.vervangen_op && (
                    <div className="text-muted-foreground mt-0.5">
                      Vervangen op {datumKort(r.vervangen_op)}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <Link href={`/gebouwen/${gebouwId}/print?rapport_id=${r.id}`}>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      Bekijken
                    </Button>
                  </Link>
                  {r.status === "definitief" && (r.bijlagen_ids?.length ?? 0) > 0 && (
                    <DownloadKnop
                      gebouwId={gebouwId}
                      rapportId={r.id}
                      titel={veiligeTitel}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function KlantRapportages() {
  const { data: gebouwen, isLoading: gebouwenLoading } = useListGebouwen();
  const [filterGebouw, setFilterGebouw] = useState("alle");
  const [filterStatus, setFilterStatus] = useState("alle");

  const gefilterdeGebouwen = useMemo(() => {
    if (!gebouwen) return [];
    if (filterGebouw === "alle") return gebouwen as { id: number; naam: string }[];
    return (gebouwen as { id: number; naam: string }[]).filter((g) => String(g.id) === filterGebouw);
  }, [gebouwen, filterGebouw]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rapportages</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Overzicht van alle definitieve opleverrapporten voor uw gebouwen, inclusief reactietermijnstatus.
        </p>
      </div>

      {/* Uitleg reactietermijn */}
      <div className="rounded-lg border bg-blue-50/50 border-blue-100 p-4 text-sm text-blue-800 space-y-1.5">
        <div className="font-semibold flex items-center gap-1.5">
          <Clock className="h-4 w-4" /> Over de reactietermijn
        </div>
        <ul className="space-y-1 text-blue-700 text-xs pl-1">
          <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" /> <span><strong>Reactietermijn loopt</strong> — u heeft nog tijd om te reageren op het rapport.</span></li>
          <li className="flex items-center gap-1.5"><AlertCircle className="h-3 w-3 text-red-500 shrink-0" /> <span><strong>Termijn verstreken</strong> — de reactietermijn is verstreken. Neem contact op met FPS Brandpreventie.</span></li>
          <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" /> <span><strong>Definitief verzonden</strong> — het rapport is definitief vastgesteld (zonder reactietermijn).</span></li>
          <li className="flex items-center gap-1.5"><RefreshCw className="h-3 w-3 text-muted-foreground shrink-0" /> <span><strong>Vervangen</strong> — er is een nieuwere versie van dit rapport.</span></li>
        </ul>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterGebouw} onValueChange={setFilterGebouw}>
          <SelectTrigger className="w-52 h-8 text-sm">
            <SelectValue placeholder="Alle gebouwen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle gebouwen</SelectItem>
            {(gebouwen as { id: number; naam: string }[] ?? []).map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-52 h-8 text-sm">
            <SelectValue placeholder="Alle statussen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            <SelectItem value="definitief_verzonden">Definitief verzonden</SelectItem>
            <SelectItem value="reactietermijn_loopt">Reactietermijn loopt</SelectItem>
            <SelectItem value="termijn_verstreken">Termijn verstreken</SelectItem>
            <SelectItem value="vervangen">Vervangen</SelectItem>
          </SelectContent>
        </Select>
        {filterStatus !== "alle" && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilterStatus("alle")}>
            Filter wissen
          </Button>
        )}
      </div>

      {/* Rapporten per gebouw */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            Opleverrapporten
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gebouwenLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Laden...
            </div>
          ) : !gebouwen?.length ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="font-medium">Geen gebouwen gevonden</p>
            </div>
          ) : (
            <div className="space-y-4">
              {gefilterdeGebouwen.map((g) => (
                <GebouwRapportenBlok
                  key={g.id}
                  gebouwId={g.id}
                  gebouwNaam={g.naam}
                  filterStatus={filterStatus}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contact-blok */}
      <div className="rounded-lg border p-4 flex items-start gap-3 bg-muted/30">
        <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <div className="font-medium text-sm">Vragen over een rapport?</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Neem contact op met uw contactpersoon bij FPS Brandpreventie, of dien een melding in via uw portaal.
          </p>
          <Button variant="outline" size="sm" className="mt-2 text-xs h-7 gap-1" asChild>
            <a href="/">
              Naar portaal <ChevronRight className="h-3 w-3" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

    </div>
  );
}

export default function KlantRapportages() {
  const { data: gebouwen, isLoading: gebouwenLoading } = useListGebouwen();
  const [filterGebouw, setFilterGebouw] = useState("alle");
  const [filterStatus, setFilterStatus] = useState("alle");

  const gefilterdeGebouwen = useMemo(() => {
    if (!gebouwen) return [];
    if (filterGebouw === "alle") return gebouwen as { id: number; naam: string }[];
    return (gebouwen as { id: number; naam: string }[]).filter((g) => String(g.id) === filterGebouw);
  }, [gebouwen, filterGebouw]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rapportages</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Overzicht van alle definitieve opleverrapporten voor uw gebouwen, inclusief reactietermijnstatus.
        </p>
      </div>

      {/* Uitleg reactietermijn */}
      <div className="rounded-lg border bg-blue-50/50 border-blue-100 p-4 text-sm text-blue-800 space-y-1.5">
        <div className="font-semibold flex items-center gap-1.5">
          <Clock className="h-4 w-4" /> Over de reactietermijn
        </div>
        <ul className="space-y-1 text-blue-700 text-xs pl-1">
          <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" /> <span><strong>Reactietermijn loopt</strong> — u heeft nog tijd om te reageren op het rapport.</span></li>
          <li className="flex items-center gap-1.5"><AlertCircle className="h-3 w-3 text-red-500 shrink-0" /> <span><strong>Termijn verstreken</strong> — de reactietermijn is verstreken. Neem contact op met FPS Brandpreventie.</span></li>
          <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" /> <span><strong>Definitief verzonden</strong> — het rapport is definitief vastgesteld (zonder reactietermijn).</span></li>
          <li className="flex items-center gap-1.5"><RefreshCw className="h-3 w-3 text-muted-foreground shrink-0" /> <span><strong>Vervangen</strong> — er is een nieuwere versie van dit rapport.</span></li>
        </ul>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterGebouw} onValueChange={setFilterGebouw}>
          <SelectTrigger className="w-52 h-8 text-sm">
            <SelectValue placeholder="Alle gebouwen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle gebouwen</SelectItem>
            {(gebouwen as { id: number; naam: string }[] ?? []).map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-52 h-8 text-sm">
            <SelectValue placeholder="Alle statussen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            <SelectItem value="definitief_verzonden">Definitief verzonden</SelectItem>
            <SelectItem value="reactietermijn_loopt">Reactietermijn loopt</SelectItem>
            <SelectItem value="termijn_verstreken">Termijn verstreken</SelectItem>
            <SelectItem value="vervangen">Vervangen</SelectItem>
          </SelectContent>
        </Select>
        {filterStatus !== "alle" && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilterStatus("alle")}>
            Filter wissen
          </Button>
        )}
      </div>

      {/* Rapporten per gebouw */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            Opleverrapporten
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gebouwenLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Laden...
            </div>
          ) : !gebouwen?.length ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="font-medium">Geen gebouwen gevonden</p>
            </div>
          ) : (
            <div className="space-y-4">
              {gefilterdeGebouwen.map((g) => (
                <GebouwRapportenBlok
                  key={g.id}
                  gebouwId={g.id}
                  gebouwNaam={g.naam}
                  filterStatus={filterStatus}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contact-blok */}
      <div className="rounded-lg border p-4 flex items-start gap-3 bg-muted/30">
        <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <div className="font-medium text-sm">Vragen over een rapport?</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Neem contact op met uw contactpersoon bij FPS Brandpreventie, of dien een melding in via uw portaal.
          </p>
          <Button variant="outline" size="sm" className="mt-2 text-xs h-7 gap-1" asChild>
            <a href="/">
              Naar portaal <ChevronRight className="h-3 w-3" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

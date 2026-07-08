import { useState } from "react";
import { Link } from "wouter";
import {
  useListGebouwen,
  useListGebouwRapporten,
  type Rapport,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const RAPPORT_TYPE_LABEL: Record<string, string> = {
  werkpakket_monteur:  "Werkpakket monteur",
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

function ReactietermijnBadge({ rapport }: { rapport: Rapport }) {
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
      Definitief — termijn verlopen
    </Badge>
  );
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

function RapportRij({ rapport, gebouwId }: { rapport: Rapport; gebouwId: number }) {
  const titel = rapport.titel || RAPPORT_TYPE_LABEL[rapport.rapport_type] || rapport.rapport_type;
  const veiligeTitel = titel.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="p-2 rounded-lg flex-shrink-0 bg-green-100">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{titel}</span>
              <span className="text-xs text-muted-foreground">v{rapport.versie}</span>
              <ReactietermijnBadge rapport={rapport} />
            </div>
            <div className="text-sm text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
              <span>{RAPPORT_TYPE_LABEL[rapport.rapport_type] || rapport.rapport_type}</span>
              {rapport.gebouw_naam && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {rapport.gebouw_naam}
                </span>
              )}
            </div>
            {rapport.bevroren_op && (
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Lock className="h-3 w-3 text-green-600" />
                Vastgesteld op{" "}
                {new Date(rapport.bevroren_op).toLocaleDateString("nl-NL", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            )}
            {rapport.reactietermijn_datum && (
              <div className="text-xs text-muted-foreground mt-0.5">
                Reactietermijn tot:{" "}
                {new Date(rapport.reactietermijn_datum).toLocaleDateString("nl-NL", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href={`/gebouwen/${gebouwId}/print?rapport_id=${rapport.id}`}>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                <Eye className="h-3.5 w-3.5" />
                Bekijken
              </Button>
            </Link>
            {(rapport.bijlagen_ids?.length ?? 0) > 0 && (
              <DownloadKnop
                gebouwId={gebouwId}
                rapportId={rapport.id}
                titel={veiligeTitel}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GebouwRapportenBlok({
  gebouwId,
  zichtbaar,
}: {
  gebouwId: number;
  zichtbaar: boolean;
}) {
  const { data: alle = [], isLoading } = useListGebouwRapporten(gebouwId);
  const definitief = alle.filter((r) => r.status === "definitief");

  if (isLoading || !zichtbaar || definitief.length === 0) return null;

  return (
    <>
      {definitief.map((r) => (
        <RapportRij key={r.id} rapport={r} gebouwId={gebouwId} />
      ))}
    </>
  );
}

function EenGebouwLegeState({ gebouwId }: { gebouwId: number }) {
  const { data: alle = [], isLoading } = useListGebouwRapporten(gebouwId);
  if (isLoading || alle.filter((r) => r.status === "definitief").length > 0) return null;
  return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p>Er zijn nog geen definitieve rapporten beschikbaar voor dit gebouw.</p>
      </CardContent>
    </Card>
  );
}

export default function KlantRapportages() {
  const { data: gebouwen = [], isLoading: gebouwenLoading } = useListGebouwen();
  const [filterGebouw, setFilterGebouw] = useState("alle");

  const enkeleGebouwId =
    filterGebouw !== "alle"
      ? (gebouwen.find((g) => String(g.id) === filterGebouw)?.id ?? null)
      : null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rapportages</h1>
        <p className="text-muted-foreground mt-1">
          Definitieve opleverrapporten voor uw gebouwen.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterGebouw} onValueChange={setFilterGebouw}>
          <SelectTrigger className="w-52 h-8 text-sm">
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
      </div>

      {gebouwenLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laden...
        </div>
      ) : gebouwen.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p>Er zijn nog geen gebouwen aan uw account gekoppeld.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {gebouwen.map((g) => (
            <GebouwRapportenBlok
              key={g.id}
              gebouwId={g.id}
              zichtbaar={filterGebouw === "alle" || String(g.id) === filterGebouw}
            />
          ))}
          {enkeleGebouwId !== null && (
            <EenGebouwLegeState gebouwId={enkeleGebouwId} />
          )}
        </div>
      )}
    </div>
  );
}

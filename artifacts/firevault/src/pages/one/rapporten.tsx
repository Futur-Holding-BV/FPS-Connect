import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { useListRapporten, type Rapport } from "@workspace/api-client-react";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  FileText,
  CheckCircle2,
  Archive,
  Clock,
  AlertCircle,
  Building2,
  Lock,
  Download,
  Eye,
  Send,
  XCircle,
  BarChart3,
  FileBadge,
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

function StatusBadge({ rapport }: { rapport: Rapport }) {
  const os = rapport.opleverstatus;
  if (os === "verzonden") {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200">
        <Send className="h-3 w-3 mr-1" />
        Verzonden
      </Badge>
    );
  }
  if (os === "reactietermijn_loopt") {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200">
        <Clock className="h-3 w-3 mr-1" />
        Reactietermijn loopt
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

export default function OneRapporten() {
  const { data: rapporten = [], isLoading } = useListRapporten({ status: "definitief" });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-12 px-6">
      <div className="mb-12">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 mb-2">Rapporten</h1>
        <p className="text-zinc-500">Inzicht in de veiligheidsstatus van uw vastgoed.</p>
      </div>

      <div className="grid gap-6">
        {rapporten.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-20 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-zinc-300" />
              <p className="text-zinc-500">Nog geen definitieve rapportages beschikbaar.</p>
            </CardContent>
          </Card>
        ) : (
          rapporten.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{r.titel || RAPPORT_TYPE_LABEL[r.rapport_type] || r.rapport_type}</h3>
                      <StatusBadge rapport={r} />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-4 w-4" />
                        {r.gebouw_naam}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {new Date(r.bevroren_op || r.aangemaakt_op).toLocaleDateString("nl-NL")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/gebouwen/${r.gebouw_id}/print?rapport_id=${r.id}`}>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Eye className="h-4 w-4" />
                        Bekijken
                      </Button>
                    </Link>
                    {r.gebouw_id && (
                      <DownloadKnop
                        gebouwId={r.gebouw_id}
                        rapportId={r.id}
                        titel={(r.titel || r.rapport_type).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

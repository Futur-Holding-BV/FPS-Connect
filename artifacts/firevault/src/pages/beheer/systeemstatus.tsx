import { useGetVersie, useGetVersieStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useRol } from "@/context/rol-context";
import {
  CheckCircle2, XCircle, HelpCircle, RefreshCw, GitCommit,
  Calendar, Server, Database, HardDrive, Mail, BrainCircuit,
  ExternalLink,
} from "lucide-react";

const GITHUB_REPO = "https://github.com/Futur-Holding-BV/FPS-Connect";

type StatusWaarde = "ok" | "fout" | "niet_geconfigureerd" | undefined;

function StatusBol({ status, label }: { status: StatusWaarde; label: string }) {
  if (status === "ok") {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        <span className="text-sm font-medium text-emerald-800">{label}</span>
        <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-xs">
          bereikbaar
        </Badge>
      </div>
    );
  }
  if (status === "fout") {
    return (
      <div className="flex items-center gap-2">
        <XCircle className="h-5 w-5 text-red-600 shrink-0" />
        <span className="text-sm font-medium text-red-800">{label}</span>
        <Badge variant="destructive" className="text-xs">
          fout
        </Badge>
      </div>
    );
  }
  if (status === "niet_geconfigureerd") {
    return (
      <div className="flex items-center gap-2">
        <HelpCircle className="h-5 w-5 text-amber-500 shrink-0" />
        <span className="text-sm font-medium text-amber-800">{label}</span>
        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-xs">
          niet geconfigureerd
        </Badge>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function formatGebouwdOp(iso: string | undefined): string {
  if (!iso) return "onbekend (dev)";
  try {
    return new Date(iso).toLocaleString("nl-NL", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Amsterdam",
    });
  } catch {
    return iso;
  }
}

export default function SysteemstatusBeheer() {
  const { rol } = useRol();

  const {
    data: versie,
    isLoading: versieLoading,
    refetch: refetchVersie,
  } = useGetVersie();

  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus,
    dataUpdatedAt,
  } = useGetVersieStatus();

  const isHoofdbeheerder = rol === "hoofdbeheerder";

  if (!isHoofdbeheerder) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Alleen de hoofdbeheerder kan de systeemstatus bekijken.
        </p>
      </div>
    );
  }

  const isLaden = versieLoading || statusLoading;
  const commitUrl = versie?.commit
    ? `${GITHUB_REPO}/commit/${versie.commit}`
    : null;

  const handleVernieuwen = () => {
    void refetchVersie();
    void refetchStatus();
  };

  const meetTijdstip = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Systeemstatus</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Actuele versie-informatie en verbindingsstatus van de productieomgeving.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleVernieuwen}
          disabled={isLaden}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLaden ? "animate-spin" : ""}`} />
          Vernieuwen
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-muted-foreground" />
            Versie-informatie
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Actieve commit
              </p>
              {versieLoading ? (
                <div className="h-6 w-32 animate-pulse rounded bg-muted" />
              ) : versie?.commit ? (
                <div className="flex items-center gap-2">
                  <GitCommit className="h-4 w-4 text-muted-foreground shrink-0" />
                  <code className="text-sm font-mono">{versie.commit}</code>
                  {commitUrl && (
                    <a
                      href={commitUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">onbekend</span>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Versienummer
              </p>
              {versieLoading ? (
                <div className="h-6 w-40 animate-pulse rounded bg-muted" />
              ) : (
                <code className="text-sm font-mono">{versie?.versie ?? "onbekend"}</code>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Gebouwd op
              </p>
              {versieLoading ? (
                <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              ) : (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{formatGebouwdOp(versie?.gebouwd_op)}</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Status gemeten om
              </p>
              <span className="text-sm">
                {meetTijdstip ?? (statusLoading ? "meten..." : "onbekend")}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            Verbindingsstatus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">Database (PostgreSQL)</p>
                  <p className="text-xs text-muted-foreground">Primaire gegevensopslag</p>
                </div>
              </div>
              <StatusBol
                status={statusLoading ? undefined : (status?.db as StatusWaarde)}
                label={status?.db ?? (statusLoading ? "laden..." : "onbekend")}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <HardDrive className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">Objectopslag (MinIO/S3)</p>
                  <p className="text-xs text-muted-foreground">Foto's, documenten en rapporten</p>
                </div>
              </div>
              <StatusBol
                status={statusLoading ? undefined : (status?.opslag as StatusWaarde)}
                label={status?.opslag ?? (statusLoading ? "laden..." : "onbekend")}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">Mail (Microsoft 365)</p>
                  <p className="text-xs text-muted-foreground">Uitnodigingen en notificaties</p>
                </div>
              </div>
              <StatusBol
                status={statusLoading ? undefined : (status?.mail as StatusWaarde)}
                label={status?.mail ?? (statusLoading ? "laden..." : "onbekend")}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <BrainCircuit className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">AI (OpenAI)</p>
                  <p className="text-xs text-muted-foreground">Formulierinvullen, analyse en samenvatting</p>
                </div>
              </div>
              <StatusBol
                status={statusLoading ? undefined : (status?.ai as StatusWaarde)}
                label={status?.ai ?? (statusLoading ? "laden..." : "onbekend")}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-muted-foreground" />
            Snelle controles
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Versie-API (publiek, geen login vereist):
            <a
              href="https://connect.fps-one.nl/api/versie"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-primary hover:underline inline-flex items-center gap-1"
            >
              /api/versie <ExternalLink className="h-3 w-3" />
            </a>
          </p>
          <p>
            Systeemstatus-API (publiek):
            <a
              href="https://connect.fps-one.nl/api/versie/status"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-primary hover:underline inline-flex items-center gap-1"
            >
              /api/versie/status <ExternalLink className="h-3 w-3" />
            </a>
          </p>
          <p>
            GitHub repository:
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-primary hover:underline inline-flex items-center gap-1"
            >
              fps-one <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

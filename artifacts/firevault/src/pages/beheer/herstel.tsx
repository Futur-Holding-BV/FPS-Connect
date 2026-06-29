import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import {
  CheckCircle2, AlertTriangle, XCircle, Circle,
  RefreshCw, Database, Server, HardDrive, Cpu,
  Cloud, Mail, Archive, ShieldCheck, GitBranch, Key,
  Activity, Link2, Loader2, ClipboardList, PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceStatus {
  naam: string;
  status: "ok" | "waarschuwing" | "fout" | "onbekend";
  detail?: string | null;
  nagekeken_op: string;
}

interface ReadinessControle {
  naam: string;
  ok: boolean;
  detail?: string | null;
}

interface SysteemStatus {
  services: ServiceStatus[];
  score: number;
  controlepunten: ReadinessControle[];
  waarschuwingen: string[];
  gegenereerd_op: string;
}

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

function statusKleur(status: ServiceStatus["status"]): string {
  if (status === "ok") return "text-green-600";
  if (status === "waarschuwing") return "text-amber-600";
  if (status === "fout") return "text-red-600";
  return "text-gray-400";
}

function statusBadgeVariant(status: ServiceStatus["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ok") return "default";
  if (status === "waarschuwing") return "outline";
  if (status === "fout") return "destructive";
  return "secondary";
}

function statusLabel(status: ServiceStatus["status"]): string {
  if (status === "ok") return "Operationeel";
  if (status === "waarschuwing") return "Waarschuwing";
  if (status === "fout") return "Fout";
  return "Onbekend";
}

function ServiceIcon({ naam }: { naam: string }) {
  const cls = "h-4 w-4 shrink-0";
  if (naam.includes("PostgreSQL") || naam.includes("Database")) return <Database className={cls} />;
  if (naam.includes("API")) return <Server className={cls} />;
  if (naam.includes("Opslag")) return <HardDrive className={cls} />;
  if (naam.includes("AI")) return <Cpu className={cls} />;
  if (naam.includes("Azure")) return <Cloud className={cls} />;
  if (naam.includes("E-mail") || naam.includes("Mail")) return <Mail className={cls} />;
  if (naam.includes("Back-up")) return <Archive className={cls} />;
  if (naam.includes("HTTPS")) return <ShieldCheck className={cls} />;
  if (naam.includes("Workflow")) return <GitBranch className={cls} />;
  if (naam.includes("DATABASE_URL")) return <Key className={cls} />;
  return <Activity className={cls} />;
}

function StatusIcon({ status }: { status: ServiceStatus["status"] }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "waarschuwing") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (status === "fout") return <XCircle className="h-4 w-4 text-red-500" />;
  return <Circle className="h-4 w-4 text-gray-400" />;
}

function formatTijdstip(iso: string): string {
  try {
    return format(parseISO(iso), "dd MMM yyyy 'om' HH:mm:ss", { locale: nl });
  } catch {
    return "—";
  }
}

// ─── Readiness Gauge ──────────────────────────────────────────────────────────

function ReadinessGauge({ score }: { score: number }) {
  const kleur = score >= 90 ? "#16a34a" : score >= 70 ? "#d97706" : "#dc2626";
  const straal = 44;
  const omtrek = 2 * Math.PI * straal;
  const dashOffset = omtrek * (1 - score / 100);

  return (
    <div className="relative flex items-center justify-center">
      <svg width="120" height="120" className="-rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={straal} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={straal} fill="none"
          stroke={kleur} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={omtrek} strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute text-center select-none">
        <span className="text-2xl font-bold tabular-nums" style={{ color: kleur }}>{score}%</span>
      </div>
    </div>
  );
}

// ─── DR Test Rapport Dialoog ──────────────────────────────────────────────────

function DrTestRapport({ open, onClose, status }: { open: boolean; onClose: () => void; status: SysteemStatus | null }) {
  if (!status) return null;
  const geslaagd = status.controlepunten.filter((c) => c.ok);
  const mislukt = status.controlepunten.filter((c) => !c.ok);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-orange-500" />
            DR-test rapport
          </DialogTitle>
          <DialogDescription>
            Gegenereerd op {formatTijdstip(status.gegenereerd_op)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Score */}
          <div className="flex items-center gap-4 rounded-lg border p-4">
            <ReadinessGauge score={status.score} />
            <div>
              <p className="text-sm font-medium text-gray-900">Recovery Readiness Score</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {geslaagd.length} van {status.controlepunten.length} controlepunten geslaagd
              </p>
              {status.waarschuwingen.length > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  {status.waarschuwingen.length} waarschuwing{status.waarschuwingen.length !== 1 ? "en" : ""}
                </p>
              )}
            </div>
          </div>

          {/* Geslaagd */}
          {geslaagd.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Geslaagd ({geslaagd.length})</p>
              {geslaagd.map((c) => (
                <div key={c.naam} className="flex items-start gap-2 rounded-md bg-green-50 border border-green-100 px-3 py-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-green-900">{c.naam}</p>
                    {c.detail && <p className="text-xs text-green-700 mt-0.5">{c.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Mislukt */}
          {mislukt.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Aandachtspunten ({mislukt.length})</p>
              {mislukt.map((c) => (
                <div key={c.naam} className="flex items-start gap-2 rounded-md bg-red-50 border border-red-100 px-3 py-2">
                  <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-red-900">{c.naam}</p>
                    {c.detail && <p className="text-xs text-red-700 mt-0.5">{c.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Adviezen */}
          {status.waarschuwingen.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Adviezen</p>
              {status.waarschuwingen.map((w, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-100 px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-900">{w}</p>
                </div>
              ))}
            </div>
          )}

          <Button onClick={onClose} className="w-full" variant="outline" size="sm">
            Sluiten
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Hoofdpagina ──────────────────────────────────────────────────────────────

export default function HerstelDashboard() {
  const { toast } = useToast();
  const { heeftNiveau } = useBevoegdheid();
  const kanBeheren = heeftNiveau("systeem", 1);

  const [drTestOpen, setDrTestOpen] = useState(false);
  const [drTestLoading, setDrTestLoading] = useState(false);
  const [drTestResultaat, setDrTestResultaat] = useState<SysteemStatus | null>(null);

  const { data: status, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["/api/beheer/systeem-status"],
    queryFn: async () => {
      const res = await fetch("/api/beheer/systeem-status");
      if (!res.ok) throw new Error("Ophalen mislukt");
      return res.json() as Promise<SysteemStatus>;
    },
    staleTime: 60_000,
  });

  async function voerDrTestUit() {
    setDrTestLoading(true);
    try {
      const res = await fetch("/api/beheer/systeem-status");
      if (!res.ok) throw new Error("DR-test mislukt");
      const resultaat = await res.json() as SysteemStatus;
      setDrTestResultaat(resultaat);
      setDrTestOpen(true);
    } catch {
      toast({ title: "DR-test mislukt", description: "Kon systeem niet bereiken", variant: "destructive" });
    } finally {
      setDrTestLoading(false);
    }
  }

  if (!kanBeheren) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">Geen toegang</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="p-8">
        <Alert variant="destructive" className="max-w-lg">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Systeemstatus niet beschikbaar</AlertTitle>
          <AlertDescription>
            Kon de systeem-status niet ophalen. Controleer of de API-server draait.
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Opnieuw proberen
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const aantalFouten = status.services.filter((s) => s.status === "fout").length;
  const aantalWaarschuwingen = status.services.filter((s) => s.status === "waarschuwing").length;

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      <DrTestRapport
        open={drTestOpen}
        onClose={() => setDrTestOpen(false)}
        status={drTestResultaat}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Systeemstatus & Herstel</h1>
          <p className="text-sm text-gray-500 mt-1">
            Recovery Readiness Dashboard — {formatTijdstip(status.gegenereerd_op)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Vernieuwen
          </Button>
          <Button
            size="sm"
            onClick={voerDrTestUit}
            disabled={drTestLoading}
            className="gap-1.5 bg-orange-600 hover:bg-orange-700"
          >
            {drTestLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <PlayCircle className="h-3.5 w-3.5" />
            }
            DR-test uitvoeren
          </Button>
        </div>
      </div>

      {/* Samenvattingsbalk */}
      {(aantalFouten > 0 || aantalWaarschuwingen > 0) && (
        <Alert variant={aantalFouten > 0 ? "destructive" : "default"} className={aantalFouten === 0 ? "border-amber-200 bg-amber-50" : ""}>
          <AlertTriangle className={`h-4 w-4 ${aantalFouten === 0 ? "text-amber-600" : ""}`} />
          <AlertTitle className={aantalFouten === 0 ? "text-amber-800" : ""}>
            {aantalFouten > 0
              ? `${aantalFouten} service${aantalFouten !== 1 ? "s" : ""} met fouten`
              : `${aantalWaarschuwingen} waarschuwing${aantalWaarschuwingen !== 1 ? "en" : ""}`}
          </AlertTitle>
          <AlertDescription className={aantalFouten === 0 ? "text-amber-700" : ""}>
            {status.waarschuwingen.slice(0, 2).map((w, i) => <span key={i} className="block">{w}</span>)}
            {status.waarschuwingen.length > 2 && (
              <span className="block mt-1 font-medium">+{status.waarschuwingen.length - 2} meer...</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Score + services grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Recovery Readiness Score */}
        <Card className="lg:col-span-1 flex flex-col items-center justify-center py-6">
          <CardHeader className="pb-2 text-center">
            <CardTitle className="text-sm font-medium text-gray-600">Recovery Readiness</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <ReadinessGauge score={status.score} />
            <div className="text-center">
              <Badge
                variant={status.score >= 90 ? "default" : status.score >= 70 ? "outline" : "destructive"}
                className="text-xs"
              >
                {status.score >= 90 ? "Gereed" : status.score >= 70 ? "Aandacht vereist" : "Kritiek"}
              </Badge>
              <p className="text-xs text-gray-500 mt-2">
                {status.controlepunten.filter((c) => c.ok).length}/{status.controlepunten.length} controlepunten OK
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Service status grid */}
        <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {status.services.map((service) => (
            <div
              key={service.naam}
              className={`rounded-xl border p-3.5 space-y-2 transition-colors ${
                service.status === "ok" ? "border-green-100 bg-green-50/60" :
                service.status === "waarschuwing" ? "border-amber-100 bg-amber-50/60" :
                service.status === "fout" ? "border-red-100 bg-red-50/60" :
                "border-gray-100 bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-1.5 ${statusKleur(service.status)}`}>
                  <ServiceIcon naam={service.naam} />
                  <span className="text-xs font-semibold text-gray-800">{service.naam}</span>
                </div>
                <StatusIcon status={service.status} />
              </div>
              <Badge
                variant={statusBadgeVariant(service.status)}
                className={`text-[10px] py-0 ${
                  service.status === "ok" ? "bg-green-100 text-green-800 border-green-200" :
                  service.status === "waarschuwing" ? "bg-amber-100 text-amber-800 border-amber-200" :
                  ""
                }`}
              >
                {statusLabel(service.status)}
              </Badge>
              {service.detail && (
                <p className="text-[11px] text-gray-500 leading-snug">{service.detail}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Controlepunten */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Herstel Controlepunten</CardTitle>
          <CardDescription>Punten die bijdragen aan de Recovery Readiness Score</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {status.controlepunten.map((punt) => (
              <div key={punt.naam} className="flex items-center gap-3 py-3">
                {punt.ok
                  ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  : <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${punt.ok ? "text-gray-800" : "text-gray-600"}`}>
                    {punt.naam}
                  </p>
                  {punt.detail && (
                    <p className="text-xs text-gray-500 mt-0.5">{punt.detail}</p>
                  )}
                </div>
                <Badge
                  variant={punt.ok ? "default" : "outline"}
                  className={`text-xs shrink-0 ${punt.ok ? "bg-green-100 text-green-800 border-green-200" : "text-red-600 border-red-200"}`}
                >
                  {punt.ok ? "OK" : "Actie vereist"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Waarschuwingen */}
      {status.waarschuwingen.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Waarschuwingen ({status.waarschuwingen.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {status.waarschuwingen.map((w, i) => (
              <Alert key={i} className="border-amber-200 bg-amber-50 py-2.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                <AlertDescription className="text-sm text-amber-900">{w}</AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Acties */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/beheer/backup">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Archive className="h-3.5 w-3.5" />
            Naar Back-up & Herstel
          </Button>
        </Link>
        <Link href="/workflow">
          <Button variant="outline" size="sm" className="gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />
            Naar Workflow Designer
          </Button>
        </Link>
        <Link2 className="h-3.5 w-3.5 text-gray-300" />
        <p className="text-xs text-gray-400">
          Configureer ontbrekende instellingen via Beheer
        </p>
      </div>
    </div>
  );
}

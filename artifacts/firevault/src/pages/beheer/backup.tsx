import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format, parseISO, differenceInDays } from "date-fns";
import { nl } from "date-fns/locale";
import {
  HardDrive, RefreshCw, Download, ShieldCheck, Trash2,
  AlertTriangle, CheckCircle, Clock, XCircle, Loader2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useRol } from "@/context/rol-context";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BackupRecord {
  id: number;
  slug: string;
  soort: string;
  omgeving: string;
  gitCommit: string | null;
  versieApp: string | null;
  status: string;
  aangemaaktOp: string;
  voltooidOp: string | null;
  grootteDatabaseBytes: number | null;
  grootteConfigBytes: number | null;
  checksumDatabase: string | null;
  foutTekst: string | null;
}

interface OffsiteStatus {
  geconfigureerd: boolean;
  staffel?: {
    laatste_run?: string;
    uitkomst?: string;
    set?: string;
    omvang_bytes?: number;
    aantal_dagelijks?: number;
    aantal_wekelijks?: number;
    aantal_maandelijks?: number;
  } | null;
  staffel_uur_geleden?: number | null;
  staffel_te_oud?: boolean;
  nas_laatste_pull?: string | null;
  nas_pull_uur_geleden?: number | null;
  nas_pull_te_oud?: boolean;
  max_uur?: number;
}

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDatum(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd MMM yyyy HH:mm", { locale: nl });
  } catch {
    return "—";
  }
}

function geleden(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: nl });
  } catch {
    return "—";
  }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "geverifieerd":
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          Geverifieerd
        </Badge>
      );
    case "klaar":
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          Klaar
        </Badge>
      );
    case "bezig":
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Bezig
        </Badge>
      );
    case "fout":
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Fout
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

// ─── Herstel-bevestigings-dialoog ─────────────────────────────────────────────

interface HerstelDialoogProps {
  backup: BackupRecord | null;
  onSluiten: () => void;
}

function HerstelDialoog({ backup, onSluiten }: HerstelDialoogProps) {
  const [bevestiging, setBevestiging] = useState("");
  const [stap, setStap] = useState<1 | 2>(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const herstelMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/backups/${id}/herstel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ bevestiging }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { fout?: string }).fout ?? "Herstel mislukt");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast({ title: "Database hersteld", description: "De database is succesvol teruggezet." });
      onSluiten();
    },
    onError: (err: Error) => {
      toast({ title: "Herstel mislukt", description: err.message, variant: "destructive" });
    },
  });

  if (!backup) return null;

  return (
    <Dialog open={!!backup} onOpenChange={() => onSluiten()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Database herstellen
          </DialogTitle>
          <DialogDescription>
            Dit overschrijft ALLE huidige gegevens onomkeerbaar.
          </DialogDescription>
        </DialogHeader>

        {stap === 1 && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Waarschuwing — onomkeerbare actie</AlertTitle>
              <AlertDescription>
                Herstel vervangt de volledige huidige database door back-up{" "}
                <strong>{backup.slug.slice(0, 8)}</strong> van{" "}
                {formatDatum(backup.aangemaaktOp)}. Alle wijzigingen na die datum gaan verloren.
              </AlertDescription>
            </Alert>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Alle gebruikersgegevens worden teruggezet naar de back-updatum</li>
              <li>Gebouwen, spots, documenten en inspecties worden overschreven</li>
              <li>De actie kan niet ongedaan worden gemaakt</li>
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={onSluiten}>Annuleren</Button>
              <Button variant="destructive" onClick={() => setStap(2)}>
                Ik begrijp het — doorgaan
              </Button>
            </DialogFooter>
          </div>
        )}

        {stap === 2 && (
          <div className="space-y-4">
            <p className="text-sm">
              Typ <strong>HERSTEL BEVESTIGEN</strong> om door te gaan:
            </p>
            <Input
              value={bevestiging}
              onChange={(e) => setBevestiging(e.target.value)}
              placeholder="HERSTEL BEVESTIGEN"
              className="font-mono"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setStap(1)}>Terug</Button>
              <Button
                variant="destructive"
                disabled={bevestiging !== "HERSTEL BEVESTIGEN" || herstelMutation.isPending}
                onClick={() => herstelMutation.mutate(backup.id)}
              >
                {herstelMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Bezig met herstellen...</>
                ) : (
                  "Database herstellen"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Hoofdpagina ──────────────────────────────────────────────────────────────

export default function BackupBeheer() {
  const { heeftNiveau } = useBevoegdheid();
  const { rol } = useRol();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [herstelBackup, setHerstelBackup] = useState<BackupRecord | null>(null);
  const isHoofdbeheerder = rol === "hoofdbeheerder";
  const kanSchrijven = heeftNiveau("systeem", 2);

  // ── Data ophalen ───────────────────────────────────────────────────────────

  const { data: backups = [], isLoading, refetch } = useQuery<BackupRecord[]>({
    queryKey: ["backups"],
    queryFn: async () => {
      const res = await fetch("/api/backups", { credentials: "include" });
      if (!res.ok) throw new Error("Kon back-ups niet ophalen");
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data as BackupRecord[] | undefined;
      const heeftBezig = data?.some((b) => b.status === "bezig");
      return heeftBezig ? 3000 : false;
    },
  });

  // ── Laatste geslaagde back-up ──────────────────────────────────────────────

  const succesvol = backups.filter((b) => b.status === "klaar" || b.status === "geverifieerd");
  const meestRecent = succesvol[0] ?? null;
  const dagenSindsBackup = meestRecent
    ? differenceInDays(new Date(), parseISO(meestRecent.aangemaaktOp))
    : null;
  const toonWaarschuwing = dagenSindsBackup === null || dagenSindsBackup >= 7;

  // ── Mutaties ───────────────────────────────────────────────────────────────

  const maakBackupMutation = useMutation({
    mutationFn: async (soort: "handmatig" | "pre-deploy") => {
      const res = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ soort }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { fout?: string }).fout ?? "Aanmaken mislukt");
      }
      return res.json();
    },
    onSuccess: (_, soort) => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast({
        title: "Back-up aangemaakt",
        description: soort === "pre-deploy"
          ? "Pre-deploy back-up wordt aangemaakt. Pagina ververst automatisch."
          : "Back-up wordt aangemaakt. Pagina ververst automatisch.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Back-up mislukt", description: err.message, variant: "destructive" });
    },
  });

  const controleerMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/backups/${id}/controleer`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { fout?: string }).fout ?? "Controle mislukt");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast({ title: "Integriteit bevestigd", description: "Back-up is geldig en intact." });
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast({ title: "Controle mislukt", description: err.message, variant: "destructive" });
    },
  });

  const verwijderMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/backups/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { fout?: string }).fout ?? "Verwijderen mislukt");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast({ title: "Back-up verwijderd" });
    },
    onError: (err: Error) => {
      toast({ title: "Verwijderen mislukt", description: err.message, variant: "destructive" });
    },
  });

  const downloadBackup = (backup: BackupRecord, bestand: "db" | "config") => {
    window.open(`/api/backups/${backup.id}/download?bestand=${bestand}`, "_blank");
  };

  // ── Stats ─────────────────────────────────────────────────────────────────

  const geverifieerd = backups.filter((b) => b.status === "geverifieerd").length;
  const totalGrootte = backups.reduce((s, b) => s + (b.grootteDatabaseBytes ?? 0), 0);

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HardDrive className="h-6 w-6 text-muted-foreground" />
            <div>
              <h1 data-paginatitel className="text-xl font-semibold">Back-up &amp; Herstel</h1>
              <p className="text-sm text-muted-foreground">
                Beheer databaseback-ups en herstel de omgeving indien nodig
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Verversen
            </Button>
            {kanSchrijven && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => maakBackupMutation.mutate("pre-deploy")}
                  disabled={maakBackupMutation.isPending}
                >
                  Pre-deploy back-up
                </Button>
                <Button
                  size="sm"
                  onClick={() => maakBackupMutation.mutate("handmatig")}
                  disabled={maakBackupMutation.isPending}
                >
                  {maakBackupMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Bezig...</>
                  ) : (
                    "Nu back-up maken"
                  )}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Waarschuwing: geen recente back-up */}
        {toonWaarschuwing && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {dagenSindsBackup === null
                ? "Geen back-up aanwezig"
                : `Laatste back-up is ${dagenSindsBackup} dagen geleden`}
            </AlertTitle>
            <AlertDescription>
              {dagenSindsBackup === null
                ? "Er is nog geen succesvolle back-up gemaakt. Maak een back-up voordat u wijzigingen doorvoert of naar productie deployt."
                : "Maak een nieuwe back-up voordat u wijzigingen doorvoert of naar productie deployt."}
            </AlertDescription>
          </Alert>
        )}

        {/* Stats-kaarten */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Totaal back-ups</CardDescription>
              <CardTitle className="text-2xl">{backups.length}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {geverifieerd} geverifieerd &bull; totaal {formatBytes(totalGrootte)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Laatste back-up</CardDescription>
              <CardTitle className="text-lg">
                {meestRecent ? geleden(meestRecent.aangemaaktOp) : "Nooit"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {meestRecent ? formatDatum(meestRecent.aangemaaktOp) : "Maak een eerste back-up aan"}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Automatische back-up</CardDescription>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Dagelijks 03:00
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Dagelijkse automatische back-up actief
            </CardContent>
          </Card>
        </div>

        {/* Externe kopie (BACKUP_01) */}
        <OffsiteStatusKaart />

        {/* Tabel */}
        <Card>
          <CardHeader>
            <CardTitle>Back-upoverzicht</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Laden...
              </div>
            ) : backups.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <HardDrive className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>Nog geen back-ups aangemaakt.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Soort</TableHead>
                    <TableHead>Omgeving</TableHead>
                    <TableHead>Database</TableHead>
                    <TableHead>Aangemaakt</TableHead>
                    <TableHead>Versie</TableHead>
                    <TableHead className="text-right">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {backup.slug.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={backup.status} />
                      </TableCell>
                      <TableCell className="text-sm capitalize">{backup.soort}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {backup.omgeving}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatBytes(backup.grootteDatabaseBytes)}
                      </TableCell>
                      <TableCell className="text-sm">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default">
                              {geleden(backup.aangemaaktOp)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {formatDatum(backup.aangemaaktOp)}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {backup.gitCommit ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {/* Download DB dump */}
                          {backup.status !== "bezig" && backup.status !== "fout" && kanSchrijven && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => downloadBackup(backup, "db")}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Dump downloaden</TooltipContent>
                            </Tooltip>
                          )}

                          {/* Integriteitscontrole */}
                          {backup.status !== "bezig" && backup.status !== "fout" && kanSchrijven && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={controleerMutation.isPending}
                                  onClick={() => controleerMutation.mutate(backup.id)}
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Integriteit controleren</TooltipContent>
                            </Tooltip>
                          )}

                          {/* Herstel */}
                          {backup.status !== "bezig" && backup.status !== "fout" && isHoofdbeheerder && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setHerstelBackup(backup)}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Database herstellen</TooltipContent>
                            </Tooltip>
                          )}

                          {/* Verwijder */}
                          {isHoofdbeheerder && backup.status !== "bezig" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  disabled={verwijderMutation.isPending}
                                  onClick={() => {
                                    if (window.confirm(`Back-up ${backup.slug.slice(0, 8)} verwijderen? Dit kan niet ongedaan worden gemaakt.`)) {
                                      verwijderMutation.mutate(backup.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Back-up verwijderen</TooltipContent>
                            </Tooltip>
                          )}
                        </div>

                        {/* Foutmelding */}
                        {backup.status === "fout" && backup.foutTekst && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-xs text-destructive mt-1 cursor-help max-w-[180px] truncate">
                                {backup.foutTekst}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{backup.foutTekst}</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Herstel-informatie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Procedure voor handmatig herstel</CardTitle>
            <CardDescription>
              Bij een volledige restore via de downloadknop
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <ol className="list-decimal list-inside space-y-1">
              <li>Download de databasedump via de downloadknop (db.sql.gz)</li>
              <li>
                Decommprimeer: <code className="bg-muted px-1 rounded">gunzip fps-backup-*-db.sql.gz</code>
              </li>
              <li>
                Herstel via psql:{" "}
                <code className="bg-muted px-1 rounded">psql $DATABASE_URL &lt; fps-backup-*-db.sql</code>
              </li>
            </ol>
            <p className="text-xs">
              Gebruik de knop "Database herstellen" voor een geautomatiseerd herstel (alleen hoofdbeheerder).
              Dit overschrijft alle huidige gegevens.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Herstel dialoog */}
      <HerstelDialoog backup={herstelBackup} onSluiten={() => setHerstelBackup(null)} />
    </TooltipProvider>
  );
}

// ─── Externe kopie (BACKUP_01) ────────────────────────────────────────────────

function OffsiteStatusKaart() {
  const { data: offsite } = useQuery<OffsiteStatus>({
    queryKey: ["/api/backups/offsite/status"],
    queryFn: async () => {
      const res = await fetch("/api/backups/offsite/status", { credentials: "include" });
      if (!res.ok) throw new Error("Kon status van de externe kopie niet ophalen");
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });

  if (!offsite) return null;

  if (!offsite.geconfigureerd) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Externe kopie (NAS)</CardDescription>
          <CardTitle className="text-lg">Niet geconfigureerd in deze omgeving</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          De externe back-upkopie is alleen actief op de productieserver.
        </CardContent>
      </Card>
    );
  }

  const staffelOk = !offsite.staffel_te_oud && offsite.staffel?.uitkomst === "geslaagd";
  const nasOoit = Boolean(offsite.nas_laatste_pull);
  const nasOk = nasOoit && !offsite.nas_pull_te_oud;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Externe kopie: klaargezette back-upset</CardDescription>
          <CardTitle className="text-lg flex items-center gap-2">
            {staffelOk ? (
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
            {offsite.staffel?.laatste_run
              ? `${offsite.staffel_uur_geleden ?? "?"} uur geleden`
              : "Nog nooit gebouwd"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <div>
            Set {offsite.staffel?.set ?? "—"} &bull; {formatBytes(offsite.staffel?.omvang_bytes ?? null)}
          </div>
          <div>
            Staffel: {offsite.staffel?.aantal_dagelijks ?? 0} dagelijks &bull;{" "}
            {offsite.staffel?.aantal_wekelijks ?? 0} wekelijks &bull;{" "}
            {offsite.staffel?.aantal_maandelijks ?? 0} maandelijks
          </div>
          {!staffelOk && (
            <div className="text-destructive">
              Laatste bouw is ouder dan {offsite.max_uur ?? 36} uur of niet geslaagd.
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Externe kopie: laatste NAS-ophaling</CardDescription>
          <CardTitle className="text-lg flex items-center gap-2">
            {nasOk ? (
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
            {nasOoit ? `${offsite.nas_pull_uur_geleden ?? "?"} uur geleden` : "Nog nooit opgehaald"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <div>{nasOoit ? formatDatum(offsite.nas_laatste_pull ?? null) : "De NAS heeft zich nog niet gemeld."}</div>
          {!nasOk && (
            <div className="text-destructive">
              {nasOoit
                ? `Laatste ophaling is ouder dan ${offsite.max_uur ?? 36} uur.`
                : "Sluit de NAS aan volgens deploy/NAS_KOPPELING.md."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

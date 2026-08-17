import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { toast } from "@/hooks/use-toast";
import { Shield, ShieldAlert, ShieldCheck, ShieldX, Play, RefreshCw, CheckCircle, XCircle, AlertTriangle, Clock, BarChart3, ListChecks, Lock, Unlock } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScanRun {
  id: number;
  gestarttOp: string;
  voltooidOp: string | null;
  status: string;
  versieLabel: string | null;
  totaalTests: number;
  geslaagd: number;
  mislukt: number;
  waarschuwingen: number;
  overgeslagen: number;
  kritiekMislukt: number;
  scoreTotaal: number | null;
  releaseGeblokkeerd: boolean;
  releaseBlokkedeReden: string | null;
  scoreInfrastructuur: number | null;
  scoreAuthenticatie: number | null;
  scoreAutorisatie: number | null;
  scoreApiBeveiliging: number | null;
  scoreUploadBeveiliging: number | null;
  scoreMalware: number | null;
  scoreAiBeveiliging: number | null;
  scoreGovernance: number | null;
  scoreBusinessLogica: number | null;
  scoreLogging: number | null;
  scoreEmailBeveiliging: number | null;
  scoreMobielBeveiliging: number | null;
  samenvatting: Record<string, unknown> | null;
}

interface TestResultaat {
  id: number;
  testId: string;
  categorie: string;
  subcategorie: string | null;
  naam: string;
  ernst: string;
  uitkomst: string;
  bericht: string | null;
  details: string | null;
  aanbeveling: string | null;
  duurMs: number | null;
}

interface Release {
  id: number;
  scanRunId: number;
  versieLabel: string | null;
  status: string;
  scoreTotaal: number | null;
  kritiekMislukt: number;
  geblokkeerd: boolean;
  blokkedeReden: string | null;
  goedgekeurdDoor: string | null;
  goedgekeurdOp: string | null;
  afgewezenDoor: string | null;
  afgewezenOp: string | null;
  opmerking: string | null;
  aangemaaktOp: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreKleur(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 95) return "text-green-600";
  if (score >= 80) return "text-amber-600";
  return "text-red-600";
}

function scoreBadge(score: number | null) {
  if (score === null) return <Badge variant="secondary">—</Badge>;
  if (score >= 95) return <Badge className="bg-green-100 text-green-800">{score.toFixed(1)}%</Badge>;
  if (score >= 80) return <Badge className="bg-amber-100 text-amber-800">{score.toFixed(1)}%</Badge>;
  return <Badge className="bg-red-100 text-red-800">{score.toFixed(1)}%</Badge>;
}

function uitkomstBadge(uitkomst: string) {
  if (uitkomst === "geslaagd") return <Badge className="bg-green-100 text-green-800">Geslaagd</Badge>;
  if (uitkomst === "mislukt") return <Badge className="bg-red-100 text-red-800">Mislukt</Badge>;
  if (uitkomst === "waarschuwing") return <Badge className="bg-amber-100 text-amber-800">Waarschuwing</Badge>;
  return <Badge variant="secondary">Overgeslagen</Badge>;
}

function ernstBadge(ernst: string) {
  if (ernst === "kritiek") return <Badge className="bg-red-600 text-white">Kritiek</Badge>;
  if (ernst === "hoog") return <Badge className="bg-red-100 text-red-800">Hoog</Badge>;
  if (ernst === "middel") return <Badge className="bg-amber-100 text-amber-800">Middel</Badge>;
  if (ernst === "laag") return <Badge className="bg-blue-100 text-blue-800">Laag</Badge>;
  return <Badge variant="secondary">Info</Badge>;
}

function statusIcon(status: string) {
  if (status === "voltooid") return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (status === "lopend") return <Clock className="h-4 w-4 text-amber-600 animate-spin" />;
  if (status === "fout") return <XCircle className="h-4 w-4 text-red-600" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}

const CATEGORIE_LABELS: Record<string, string> = {
  infrastructuur: "Infrastructuur",
  authenticatie: "Authenticatie",
  autorisatie: "Autorisatie",
  "api-beveiliging": "API-beveiliging",
  "upload-beveiliging": "Upload",
  malware: "Malware",
  "ai-beveiliging": "AI-beveiliging",
  governance: "Governance",
  "business-logica": "Business-logica",
  logging: "Logging",
  "email-beveiliging": "E-mailbeveiliging",
  "mobiel-beveiliging": "Mobiel",
};

// ── Score-kaart ───────────────────────────────────────────────────────────────

function ScoreKaart({ label, score }: { label: string; score: number | null }) {
  return (
    <div className="flex flex-col gap-1 p-3 border rounded-lg bg-muted/30">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xl font-bold ${scoreKleur(score)}`}>
        {score !== null ? `${score.toFixed(1)}%` : "—"}
      </span>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${score !== null && score >= 95 ? "bg-green-500" : score !== null && score >= 80 ? "bg-amber-500" : "bg-red-500"}`}
          style={{ width: `${score ?? 0}%` }}
        />
      </div>
    </div>
  );
}

// ── Dashboard-tab ─────────────────────────────────────────────────────────────

function DashboardTab() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["security-validation-dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/security-validation/dashboard");
      if (!r.ok) throw new Error("Laden mislukt");
      return r.json() as Promise<{
        totaalScenarios: number;
        perCategorie: Array<{ categorie: string; aantal: number }>;
        laasteScan: ScanRun | null;
        recenteScans: ScanRun[];
      }>;
    },
    refetchInterval: 15000,
  });

  if (isLoading) return <div className="text-muted-foreground p-4">Laden...</div>;

  const scan = dashboard?.laasteScan;

  return (
    <div className="space-y-6">
      {scan ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Laatste voltooide scan</h3>
              <p className="text-sm text-muted-foreground">
                {new Date(scan.voltooidOp ?? scan.gestarttOp).toLocaleString("nl-NL")}
                {scan.versieLabel ? ` — ${scan.versieLabel}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {scan.releaseGeblokkeerd ? (
                <Badge className="bg-red-100 text-red-800 flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Release geblokkeerd
                </Badge>
              ) : (
                <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
                  <Unlock className="h-3 w-3" /> Release toegestaan
                </Badge>
              )}
              {scoreBadge(scan.scoreTotaal)}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 border rounded-lg bg-green-50 text-center">
              <div className="text-2xl font-bold text-green-700">{scan.geslaagd}</div>
              <div className="text-xs text-green-600">Geslaagd</div>
            </div>
            <div className="p-3 border rounded-lg bg-red-50 text-center">
              <div className="text-2xl font-bold text-red-700">{scan.mislukt}</div>
              <div className="text-xs text-red-600">Mislukt</div>
            </div>
            <div className="p-3 border rounded-lg bg-amber-50 text-center">
              <div className="text-2xl font-bold text-amber-700">{scan.waarschuwingen}</div>
              <div className="text-xs text-amber-600">Waarschuwingen</div>
            </div>
            <div className="p-3 border rounded-lg bg-gray-50 text-center">
              <div className="text-2xl font-bold text-gray-700">{scan.kritiekMislukt}</div>
              <div className="text-xs text-gray-600">Kritiek</div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-3">Score per categorie</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <ScoreKaart label="AI-beveiliging" score={scan.scoreAiBeveiliging} />
              <ScoreKaart label="Autorisatie" score={scan.scoreAutorisatie} />
              <ScoreKaart label="Authenticatie" score={scan.scoreAuthenticatie} />
              <ScoreKaart label="API-beveiliging" score={scan.scoreApiBeveiliging} />
              <ScoreKaart label="Governance" score={scan.scoreGovernance} />
              <ScoreKaart label="Upload" score={scan.scoreUploadBeveiliging} />
              <ScoreKaart label="Malware" score={scan.scoreMalware} />
              <ScoreKaart label="Business-logica" score={scan.scoreBusinessLogica} />
              <ScoreKaart label="Logging" score={scan.scoreLogging} />
              <ScoreKaart label="Infrastructuur" score={scan.scoreInfrastructuur} />
              <ScoreKaart label="E-mailbeveiliging" score={scan.scoreEmailBeveiliging} />
              <ScoreKaart label="Mobiel" score={scan.scoreMobielBeveiliging} />
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Shield className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Nog geen scan uitgevoerd. Start een nieuwe scan om de beveiligingsstatus te bepalen.</p>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium mb-2">Testbibliotheek</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {dashboard?.perCategorie.map((c) => (
            <div key={c.categorie} className="flex items-center justify-between p-2 border rounded text-sm">
              <span>{CATEGORIE_LABELS[c.categorie] ?? c.categorie}</span>
              <Badge variant="outline">{c.aantal}</Badge>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Totaal: {dashboard?.totaalScenarios ?? "—"} geautomatiseerde beveiligingstests
        </p>
      </div>
    </div>
  );
}

// ── Scan-tab ──────────────────────────────────────────────────────────────────

function ScansTab() {
  const qc = useQueryClient();
  const [versieLabel, setVersieLabel] = useState("");
  const [geselecteerdeRun, setGeselecteerdeRun] = useState<number | null>(null);
  const [categorieFilter, setCategorieFilter] = useState("alle");
  const [uitkomstFilter, setUitkomstFilter] = useState("alle");
  const [pagina, setPagina] = useState(1);

  const { data: scans, isLoading } = useQuery({
    queryKey: ["security-validation-scans"],
    queryFn: async () => {
      const r = await fetch("/api/security-validation/scans");
      if (!r.ok) throw new Error("Laden mislukt");
      return r.json() as Promise<{ runs: ScanRun[]; totaal: number }>;
    },
    refetchInterval: 10000,
  });

  const { data: runDetail } = useQuery({
    queryKey: ["security-validation-run", geselecteerdeRun],
    queryFn: async () => {
      if (!geselecteerdeRun) return null;
      const r = await fetch(`/api/security-validation/scans/${geselecteerdeRun}`);
      if (!r.ok) throw new Error("Laden mislukt");
      return r.json() as Promise<ScanRun>;
    },
    enabled: geselecteerdeRun !== null,
    refetchInterval: geselecteerdeRun ? 5000 : false,
  });

  const { data: resultaten } = useQuery({
    queryKey: ["security-validation-resultaten", geselecteerdeRun, categorieFilter, uitkomstFilter, pagina],
    queryFn: async () => {
      if (!geselecteerdeRun) return null;
      const params = new URLSearchParams({ pagina: String(pagina) });
      if (categorieFilter !== "alle") params.set("categorie", categorieFilter);
      if (uitkomstFilter !== "alle") params.set("uitkomst", uitkomstFilter);
      const r = await fetch(`/api/security-validation/scans/${geselecteerdeRun}/resultaten?${params}`);
      if (!r.ok) throw new Error("Laden mislukt");
      return r.json() as Promise<{ resultaten: TestResultaat[]; totaal: number; totaalPaginas: number }>;
    },
    enabled: geselecteerdeRun !== null,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/security-validation/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versieLabel: versieLabel || undefined }),
      });
      if (!r.ok) throw new Error("Start mislukt");
      return r.json() as Promise<{ runId: number }>;
    },
    onSuccess: (data) => {
      toast({ title: "Scan gestart", description: `Scan-run #${data.runId} loopt` });
      setGeselecteerdeRun(data.runId);
      qc.invalidateQueries({ queryKey: ["security-validation-scans"] });
      qc.invalidateQueries({ queryKey: ["security-validation-dashboard"] });
    },
    onError: () => toast({ title: "Fout", description: "Kon scan niet starten", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Input
            placeholder="Versielabel (optioneel, bijv. v1.4.2)"
            value={versieLabel}
            onChange={(e) => setVersieLabel(e.target.value)}
          />
        </div>
        <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
          <Play className="h-4 w-4 mr-2" />
          {startMutation.isPending ? "Starten..." : "Nieuwe scan starten"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-medium mb-2">Scan-runs</h4>
          {isLoading ? (
            <div className="text-muted-foreground text-sm">Laden...</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(scans?.runs ?? []).map((run) => (
                <button
                  key={run.id}
                  onClick={() => { setGeselecteerdeRun(run.id); setPagina(1); }}
                  className={`w-full text-left p-3 border rounded-lg hover:bg-muted/50 transition-colors ${geselecteerdeRun === run.id ? "border-primary bg-primary/5" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {statusIcon(run.status)}
                      <span className="text-sm font-medium">Run #{run.id}</span>
                      {run.versieLabel && <span className="text-xs text-muted-foreground">{run.versieLabel}</span>}
                    </div>
                    {scoreBadge(run.scoreTotaal)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(run.gestarttOp).toLocaleString("nl-NL")} — {run.totaalTests} tests
                  </div>
                  {run.releaseGeblokkeerd && (
                    <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                      <ShieldX className="h-3 w-3" /> Release geblokkeerd
                    </div>
                  )}
                </button>
              ))}
              {!scans?.runs.length && (
                <div className="text-sm text-muted-foreground py-4 text-center">Nog geen scans uitgevoerd</div>
              )}
            </div>
          )}
        </div>

        <div>
          {geselecteerdeRun && runDetail ? (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Run #{runDetail.id} — Details</h4>
              {runDetail.status === "lopend" && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />
                  Scan loopt... automatisch verversen
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <Select value={categorieFilter} onValueChange={setCategorieFilter}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle categorieën</SelectItem>
                    {Object.entries(CATEGORIE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={uitkomstFilter} onValueChange={setUitkomstFilter}>
                  <SelectTrigger className="w-36 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle uitkomsten</SelectItem>
                    <SelectItem value="geslaagd">Geslaagd</SelectItem>
                    <SelectItem value="mislukt">Mislukt</SelectItem>
                    <SelectItem value="waarschuwing">Waarschuwing</SelectItem>
                    <SelectItem value="overgeslagen">Overgeslagen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {(resultaten?.resultaten ?? []).map((r) => (
                  <div key={r.id} className="p-2 border rounded text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-muted-foreground">{r.testId}</span>
                      <div className="flex items-center gap-1">
                        {ernstBadge(r.ernst)}
                        {uitkomstBadge(r.uitkomst)}
                      </div>
                    </div>
                    <div className="mt-1">{r.naam}</div>
                    {r.bericht && <div className="text-muted-foreground mt-0.5">{r.bericht}</div>}
                    {r.aanbeveling && (
                      <div className="text-amber-700 mt-0.5 italic">{r.aanbeveling}</div>
                    )}
                  </div>
                ))}
              </div>
              {resultaten && resultaten.totaalPaginas > 1 && (
                <div className="flex gap-2 items-center text-sm">
                  <Button variant="outline" size="sm" onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina <= 1}>Vorige</Button>
                  <span className="text-muted-foreground">{pagina} / {resultaten.totaalPaginas}</span>
                  <Button variant="outline" size="sm" onClick={() => setPagina(p => p + 1)} disabled={pagina >= resultaten.totaalPaginas}>Volgende</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-8">
              Selecteer een scan-run voor details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Releases-tab ──────────────────────────────────────────────────────────────

function ReleasesTab() {
  const qc = useQueryClient();
  const [beoordeelDialog, setBeoordeelDialog] = useState<Release | null>(null);
  const [beslissing, setBeslissing] = useState<"goedgekeurd" | "afgewezen">("goedgekeurd");
  const [opmerking, setOpmerking] = useState("");

  const { data: releases, isLoading } = useQuery({
    queryKey: ["security-validation-releases"],
    queryFn: async () => {
      const r = await fetch("/api/security-validation/releases");
      if (!r.ok) throw new Error("Laden mislukt");
      return r.json() as Promise<{ releases: Release[] }>;
    },
  });

  const beoordeelMutation = useMutation({
    mutationFn: async () => {
      if (!beoordeelDialog) return;
      const r = await fetch(`/api/security-validation/releases/${beoordeelDialog.id}/beoordelen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beslissing, opmerking }),
      });
      if (!r.ok) {
        const d = await r.json() as { fout?: string };
        throw new Error(d.fout ?? "Beoordeling mislukt");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: beslissing === "goedgekeurd" ? "Release goedgekeurd" : "Release afgewezen" });
      setBeoordeelDialog(null);
      setOpmerking("");
      qc.invalidateQueries({ queryKey: ["security-validation-releases"] });
    },
    onError: (err) => toast({ title: "Fout", description: String(err), variant: "destructive" }),
  });

  const releaseStatusBadge = (release: Release) => {
    if (release.status === "goedgekeurd") return <Badge className="bg-green-100 text-green-800">Goedgekeurd</Badge>;
    if (release.status === "afgewezen") return <Badge className="bg-red-100 text-red-800">Afgewezen</Badge>;
    if (release.geblokkeerd) return <Badge className="bg-red-100 text-red-800 flex items-center gap-1"><Lock className="h-3 w-3" /> Geblokkeerd</Badge>;
    return <Badge className="bg-amber-100 text-amber-800">Wacht op goedkeuring</Badge>;
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Een release mag uitsluitend naar productie wanneer geen kritieke bevindingen aanwezig zijn, alle verplichte beveiligingstests zijn uitgevoerd en de security-score boven 95% ligt.
      </p>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Laden...</div>
      ) : (
        <div className="space-y-3">
          {(releases?.releases ?? []).map((release) => (
            <div key={release.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">
                    Release #{release.id}
                    {release.versieLabel && <span className="text-muted-foreground ml-2 font-normal">{release.versieLabel}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(release.aangemaaktOp).toLocaleString("nl-NL")} — Scan #{release.scanRunId}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {scoreBadge(release.scoreTotaal)}
                  {releaseStatusBadge(release)}
                </div>
              </div>

              {release.kritiekMislukt > 0 && (
                <div className="mt-2 text-xs text-red-700 bg-red-50 rounded p-2">
                  {release.kritiekMislukt} kritieke bevinding(en) — release automatisch geblokkeerd
                </div>
              )}
              {release.blokkedeReden && !release.kritiekMislukt && (
                <div className="mt-2 text-xs text-amber-700 bg-amber-50 rounded p-2">
                  {release.blokkedeReden}
                </div>
              )}
              {release.opmerking && (
                <div className="mt-2 text-xs text-muted-foreground italic">{release.opmerking}</div>
              )}

              {release.status === "wacht" && !release.geblokkeerd && (
                <div className="mt-3">
                  <Button size="sm" variant="outline" onClick={() => { setBeoordeelDialog(release); setBeslissing("goedgekeurd"); setOpmerking(""); }}>
                    Beoordelen
                  </Button>
                </div>
              )}
            </div>
          ))}
          {!releases?.releases.length && (
            <div className="text-sm text-muted-foreground text-center py-8">
              Nog geen releases aangemaakt. Start een scan om een release-gate te maken.
            </div>
          )}
        </div>
      )}

      <Dialog open={beoordeelDialog !== null} onOpenChange={(o) => { if (!o) setBeoordeelDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release beoordelen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={beslissing === "goedgekeurd" ? "default" : "outline"}
                size="sm"
                onClick={() => setBeslissing("goedgekeurd")}
                className={beslissing === "goedgekeurd" ? "bg-green-600 hover:bg-green-700" : ""}
              >
                <ShieldCheck className="h-4 w-4 mr-1" /> Goedkeuren
              </Button>
              <Button
                variant={beslissing === "afgewezen" ? "default" : "outline"}
                size="sm"
                onClick={() => setBeslissing("afgewezen")}
                className={beslissing === "afgewezen" ? "bg-red-600 hover:bg-red-700" : ""}
              >
                <ShieldX className="h-4 w-4 mr-1" /> Afwijzen
              </Button>
            </div>
            <Textarea
              placeholder="Opmerking (optioneel)"
              value={opmerking}
              onChange={(e) => setOpmerking(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBeoordeelDialog(null)}>Annuleren</Button>
            <Button onClick={() => beoordeelMutation.mutate()} disabled={beoordeelMutation.isPending}>
              {beoordeelMutation.isPending ? "Bezig..." : "Bevestigen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Testbibliotheek-tab ───────────────────────────────────────────────────────

function BibliotheekTab() {
  const { data } = useQuery({
    queryKey: ["security-validation-bibliotheek"],
    queryFn: async () => {
      const r = await fetch("/api/security-validation/bibliotheek");
      if (!r.ok) throw new Error("Laden mislukt");
      return r.json() as Promise<{ totaalScenarios: number; perCategorie: Array<{ categorie: string; aantal: number }> }>;
    },
  });

  const CATEGORIE_DETAIL: Record<string, { beschrijving: string; subcategorieen: string[] }> = {
    "ai-beveiliging": {
      beschrijving: "Aanvallen op het AI-systeem: jailbreaks, privilege-escalatie, systeemprompt-extractie, data-exfiltratie, indirecte injectie en verboden operaties.",
      subcategorieen: ["Jailbreak (50)", "Privilege-escalatie (40)", "Systeemprompt-extractie (30)", "Data-exfiltratie (30)", "Code-uitvoering (30)", "Indirecte injectie (20)", "Rol-verwarring (25)", "Verboden operaties (25)"],
    },
    "upload-beveiliging": {
      beschrijving: "Upload-aanvallen inclusief corrupte bestanden, dubbele extensies, MIME-spoofing, archiefbomben en grootteaanvallen.",
      subcategorieen: ["Corrupte bestanden (30)", "Dubbele extensies (30)", "MIME-spoofing (30)", "Archiefaanvallen (20)", "Speciale bestanden (20)", "Grootteaanvallen (20)", "Auth-tests (2)"],
    },
    autorisatie: {
      beschrijving: "Ongeauthenticeerde toegang, IDOR, privilege-escalatie en verborgen functies.",
      subcategorieen: ["Ongeauthenticeerde routes (50)", "IDOR object-level (30)", "Privilege-escalatie (20)", "Verborgen functies (30)"],
    },
    "api-beveiliging": {
      beschrijving: "SQL-injectie, path-traversal, command injection, CORS, headers, rate-limiting en SSRF.",
      subcategorieen: ["SQL-injectie (30)", "Path-traversal (20)", "Command-injectie (20)", "Header-tests (20)", "Rate-limiting (15)", "SSRF (15)", "Parametervalidatie (10)"],
    },
    authenticatie: { beschrijving: "Sessiecookies, MFA, wachtwoordbeleid, brute-force en token-beveiliging.", subcategorieen: ["Sessie-cookie (3)", "MFA/TOTP (2)", "Inlogbeveiliging (2)", "Sessie-expiratie (1)", "Overig (92)"] },
    governance: { beschrijving: "AI Change Governance Engine, auditlogging, goedkeuringsworkflows en versiebeheer.", subcategorieen: ["AI-governance (8)", "Goedkeuringsworkflow (92)"] },
    "business-logica": { beschrijving: "Status-machines, goedkeuringsflows en data-integriteitscontroles.", subcategorieen: ["Status-machine (5)", "Goedkeuring (95)"] },
    malware: { beschrijving: "Bestandsscanning, macrodetectie, scriptdetectie en payload-detectie.", subcategorieen: ["EICAR (1)", "Macrodetectie (1)", "Scriptdetectie (1)", "Overig (97)"] },
    logging: { beschrijving: "Volledigheid, integriteit en tijdstempels van auditlogs.", subcategorieen: ["Volledigheid (1)", "Integriteit (1)", "AI-logging (1)", "Tijdstempels (1)", "Overig (96)"] },
    infrastructuur: { beschrijving: "TLS, secrets, database en back-up configuratie.", subcategorieen: ["TLS (1)", "Secrets (1)", "Database (1)", "Back-up (1)", "Dependencies (1)", "Overig (95)"] },
    "email-beveiliging": { beschrijving: "E-mailconfiguratie, phishing, spoofing en bijlagebescherming.", subcategorieen: ["Configuratie (2)", "Phishing/Spoofing (98)"] },
    "mobiel-beveiliging": { beschrijving: "Token-opslag, API-verkeer, app-lock en offline-beveiliging.", subcategorieen: ["Tokenopslag (1)", "API-verkeer (1)", "App-lock (1)", "Bearer (1)", "Overig (96)"] },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ListChecks className="h-5 w-5" />
        <span className="font-medium">Totaal: {data?.totaalScenarios ?? "—"} beveiligingstests</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(data?.perCategorie ?? []).map((c) => {
          const detail = CATEGORIE_DETAIL[c.categorie];
          return (
            <div key={c.categorie} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{CATEGORIE_LABELS[c.categorie] ?? c.categorie}</span>
                <Badge variant="outline">{c.aantal} tests</Badge>
              </div>
              {detail && (
                <>
                  <p className="text-xs text-muted-foreground">{detail.beschrijving}</p>
                  <div className="flex flex-wrap gap-1">
                    {detail.subcategorieen.map((s) => (
                      <span key={s} className="text-xs bg-muted px-2 py-0.5 rounded">{s}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Hoofdpagina ───────────────────────────────────────────────────────────────

export default function SecurityValidation() {
  const { gebruiker } = useAuth();

  if (gebruiker?.rol !== "hoofdbeheerder") {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Alleen toegankelijk voor de hoofdbeheerder.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-primary" />
        <div>
          <h1 data-paginatitel className="text-2xl font-bold">Security Validation Platform</h1>
          <p className="text-sm text-muted-foreground">
            Continu geautomatiseerd beveiligingstesten voor FPS Connect en FPS One
          </p>
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">
            <BarChart3 className="h-4 w-4 mr-1" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="scans">
            <Play className="h-4 w-4 mr-1" /> Scans
          </TabsTrigger>
          <TabsTrigger value="releases">
            <ShieldCheck className="h-4 w-4 mr-1" /> Release-gate
          </TabsTrigger>
          <TabsTrigger value="bibliotheek">
            <ListChecks className="h-4 w-4 mr-1" /> Testbibliotheek
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Beveiligingsstatus</CardTitle>
              <CardDescription>Overzicht van de laatste beveiligingsscan en scores per categorie</CardDescription>
            </CardHeader>
            <CardContent>
              <DashboardTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scans" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Beveiligingsscans</CardTitle>
              <CardDescription>Start een nieuwe scan of bekijk eerdere resultaten</CardDescription>
            </CardHeader>
            <CardContent>
              <ScansTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="releases" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Release-gate</CardTitle>
              <CardDescription>
                Releases worden automatisch geblokkeerd bij kritieke bevindingen of een score onder 95%
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReleasesTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bibliotheek" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Testbibliotheek</CardTitle>
              <CardDescription>Overzicht van alle geautomatiseerde beveiligingstests per categorie</CardDescription>
            </CardHeader>
            <CardContent>
              <BibliotheekTab />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

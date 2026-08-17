import { useState, useEffect, useCallback } from "react";
import {
  Award, RefreshCw, Play, AlertTriangle, CheckCircle, XCircle,
  ShieldAlert, Cloud, ChevronDown, ChevronUp, BarChart3, Loader2,
  TrendingUp, TrendingDown, Minus, Clock, Star,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRol } from "@/context/rol-context";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReleaseStatus = "niet_gereed" | "verbeteringen_nodig" | "gereed_acceptatie" | "gereed_productie";
type CqoStatus = "lopend" | "voltooid" | "mislukt";
type Ernst = "info" | "laag" | "gemiddeld" | "hoog" | "kritiek";
type Urgentie = "laag" | "gemiddeld" | "hoog" | "kritiek";
type AzureStatus = "actief" | "niet_actief" | "fallback";

interface CqoRun {
  id: number;
  gestarttOp: string;
  voltooidOp: string | null;
  status: CqoStatus;
  versieLabel: string | null;
  gestarttDoorNaam: string;
  totaalScore: string | null;
  releaseStatus: ReleaseStatus | null;
  releaseGeblokkeerd: boolean;
  blokkeringReden: string | null;
  categorieScores: Record<string, number> | null;
  aantalBevindingen: number | null;
  aantalKritiek: number | null;
  aantalHoog: number | null;
  aantalVerbeterpunten: number | null;
}

interface Bevinding {
  id: number;
  specialist: string;
  categorie: string;
  ernst: Ernst;
  titel: string;
  bevinding: string;
  impact: string | null;
  oplossing: string | null;
  positief: boolean;
}

interface Verbeterpunt {
  id: number;
  specialist: string;
  categorie: string;
  urgentie: Urgentie;
  titel: string;
  probleem: string;
  oplossing: string;
  verwachteVerbetering: string | null;
}

interface AzureFeature {
  id: string;
  naam: string;
  module: string;
  beschrijving: string;
  status: AzureStatus;
  statusLabel: string;
  opmerking: string;
  fallbackActief: boolean;
}

interface DashboardData {
  run: CqoRun | null;
  bevindingen: Bevinding[];
  verbeterpunten: Verbeterpunt[];
}

// ── Labels & kleuren ──────────────────────────────────────────────────────────

const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  niet_gereed: "Niet gereed",
  verbeteringen_nodig: "Gereed na verbeteringen",
  gereed_acceptatie: "Gereed voor acceptatie",
  gereed_productie: "Gereed voor productie",
};

const RELEASE_STATUS_KLEUR: Record<ReleaseStatus, string> = {
  niet_gereed: "bg-red-100 text-red-800 border-red-200",
  verbeteringen_nodig: "bg-amber-100 text-amber-800 border-amber-200",
  gereed_acceptatie: "bg-blue-100 text-blue-800 border-blue-200",
  gereed_productie: "bg-green-100 text-green-800 border-green-200",
};

const ERNST_KLEUR: Record<Ernst, string> = {
  info: "bg-gray-100 text-gray-700",
  laag: "bg-blue-50 text-blue-700",
  gemiddeld: "bg-amber-50 text-amber-700",
  hoog: "bg-orange-100 text-orange-700",
  kritiek: "bg-red-100 text-red-800",
};

const URGENTIE_KLEUR: Record<Urgentie, string> = {
  laag: "border-l-blue-400",
  gemiddeld: "border-l-amber-400",
  hoog: "border-l-orange-500",
  kritiek: "border-l-red-600",
};

const CATEGORIE_LABELS: Record<string, string> = {
  functionaliteit: "Functionaliteit",
  werkbaarheid: "Werkbaarheid",
  compleetheid: "Compleetheid",
  logica: "Logica",
  leesbaarheid: "Leesbaarheid",
  gebruiksvriendelijkheid: "Gebruiksvriendelijkheid",
  esthetiek: "Esthetiek",
  commercieel: "Commercieel",
  veiligheid: "Veiligheid",
  privacy: "Privacy",
  automatisering: "Automatisering",
  performance: "Performance",
  mobiel: "Mobiel",
  rapportages: "Rapportages",
  integraties: "Integraties",
};

const SPECIALIST_LABELS: Record<string, string> = {
  softwarearchitect: "Softwarearchitect",
  "erp-consultant": "ERP-consultant",
  procesanalist: "Procesanalist",
  kwaliteitsmanager: "Kwaliteitsmanager",
  "technisch-schrijver": "Technisch schrijver",
  "ux-specialist": "UX-specialist",
  "ui-designer": "UI-designer",
  "commercieel-adviseur": "Commercieel adviseur",
  "security-auditor": "Security-auditor",
  "privacy-officer": "Privacy officer",
  "ai-auditor": "AI-auditor",
  "performance-engineer": "Performance engineer",
  beheerder: "Beheerder",
  tester: "Tester",
  eindgebruiker: "Eindgebruiker",
};

// ── Score-hulpfuncties ────────────────────────────────────────────────────────

function scoreKleur(score: number): string {
  if (score >= 90) return "text-green-600";
  if (score >= 80) return "text-blue-600";
  if (score >= 70) return "text-amber-600";
  if (score >= 60) return "text-orange-600";
  return "text-red-600";
}

function scoreRingKleur(score: number): string {
  if (score >= 90) return "#16a34a";
  if (score >= 80) return "#2563eb";
  if (score >= 70) return "#d97706";
  if (score >= 60) return "#ea580c";
  return "#dc2626";
}

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const radius = (size - 16) / 2;
  const omtrek = 2 * Math.PI * radius;
  const dash = (score / 100) * omtrek;
  const kleur = scoreRingKleur(score);
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={10} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={kleur} strokeWidth={10}
        strokeDasharray={`${dash} ${omtrek}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </svg>
  );
}

function ScoreKaart({ label, score }: { label: string; score: number | undefined }) {
  if (score === undefined) return (
    <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-gray-50 border border-gray-200">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold text-gray-400">—</span>
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-gray-50 border border-gray-200">
      <span className="text-xs text-muted-foreground text-center leading-tight">{label}</span>
      <span className={`text-xl font-bold ${scoreKleur(score)}`}>{score.toFixed(0)}</span>
      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, backgroundColor: scoreRingKleur(score) }}
        />
      </div>
    </div>
  );
}

// ── Hoofdcomponent ────────────────────────────────────────────────────────────

export default function ReleaseReadiness() {
  const { echteRol } = useRol();
  const isHoofdbeheerder = echteRol === "hoofdbeheerder";
  const [actieveTab, setActieveTab] = useState<"overzicht" | "bevindingen" | "verbeterpunten" | "azure" | "geschiedenis">("overzicht");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [runs, setRuns] = useState<CqoRun[]>([]);
  const [azureData, setAzureData] = useState<{ features: AzureFeature[]; actief: number; niet_actief: number; fallback: number } | null>(null);
  const [geselecteerdeRunId, setGeselecteerdeRunId] = useState<number | null>(null);
  const [runBevindingen, setRunBevindingen] = useState<Bevinding[]>([]);
  const [runVerbeterpunten, setRunVerbeterpunten] = useState<Verbeterpunt[]>([]);
  const [ernstFilter, setErnstFilter] = useState("alle");
  const [catFilter, setCatFilter] = useState("alle");
  const [positiefFilter, setPositiefFilter] = useState("alle");
  const [ladenDashboard, setLadenDashboard] = useState(true);
  const [ladenRuns, setLadenRuns] = useState(false);
  const [nieuweScanDialog, setNieuweScanDialog] = useState(false);
  const [versieLabel, setVersieLabel] = useState("");
  const [scanLoopt, setScanLoopt] = useState(false);
  const [uitklappenId, setUitklappenId] = useState<number | null>(null);

  const laadDashboard = useCallback(async () => {
    setLadenDashboard(true);
    try {
      const r = await fetch("/api/cqo/dashboard");
      if (r.ok) setDashboard(await r.json());
    } finally {
      setLadenDashboard(false);
    }
  }, []);

  const laadRuns = useCallback(async () => {
    setLadenRuns(true);
    try {
      const r = await fetch("/api/cqo/beoordelingen");
      if (r.ok) {
        const data = await r.json();
        setRuns(data.runs ?? []);
        // Poll als er een lopende scan is
        if ((data.runs ?? []).some((r: CqoRun) => r.status === "lopend")) {
          setTimeout(laadRuns, 5000);
        } else {
          setScanLoopt(false);
          laadDashboard();
        }
      }
    } finally {
      setLadenRuns(false);
    }
  }, [laadDashboard]);

  const laadAzure = useCallback(async () => {
    const r = await fetch("/api/cqo/azure-status");
    if (r.ok) setAzureData(await r.json());
  }, []);

  const laadRunDetail = useCallback(async (runId: number) => {
    setGeselecteerdeRunId(runId);
    const [bResp, vResp] = await Promise.all([
      fetch(`/api/cqo/beoordelingen/${runId}/bevindingen`),
      fetch(`/api/cqo/beoordelingen/${runId}/verbeterpunten`),
    ]);
    if (bResp.ok) setRunBevindingen(await bResp.json());
    if (vResp.ok) setRunVerbeterpunten(await vResp.json());
  }, []);

  useEffect(() => {
    laadDashboard();
    laadAzure();
  }, [laadDashboard, laadAzure]);

  useEffect(() => {
    if (actieveTab === "geschiedenis") laadRuns();
    if (actieveTab === "bevindingen" || actieveTab === "verbeterpunten") {
      if (dashboard?.run && !geselecteerdeRunId) {
        laadRunDetail(dashboard.run.id);
      }
    }
  }, [actieveTab, dashboard, geselecteerdeRunId, laadRuns, laadRunDetail]);

  const startNieuweScan = async () => {
    setScanLoopt(true);
    setNieuweScanDialog(false);
    const r = await fetch("/api/cqo/beoordeling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versieLabel: versieLabel.trim() || undefined }),
    });
    setVersieLabel("");
    if (r.ok) {
      await laadRuns();
    } else {
      setScanLoopt(false);
    }
  };

  // Gefilterde bevindingen
  const gefilterdeBevindingen = (geselecteerdeRunId ? runBevindingen : dashboard?.bevindingen ?? []).filter((b) => {
    if (ernstFilter !== "alle" && b.ernst !== ernstFilter) return false;
    if (catFilter !== "alle" && b.categorie !== catFilter) return false;
    if (positiefFilter === "positief" && !b.positief) return false;
    if (positiefFilter === "negatief" && b.positief) return false;
    return true;
  });

  const gefilterdePunten = (geselecteerdeRunId ? runVerbeterpunten : dashboard?.verbeterpunten ?? []);

  if (!isHoofdbeheerder) {
    return <div className="p-8 text-muted-foreground">Alleen toegankelijk voor de hoofdbeheerder.</div>;
  }

  const run = dashboard?.run;
  const score = run?.totaalScore ? parseFloat(run.totaalScore) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 data-paginatitel className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Award className="h-6 w-6 text-primary" />
            Release Readiness
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            AI Chief Quality Officer — continue kwaliteitsbewaking van FPS Connect
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={laadDashboard} disabled={ladenDashboard}>
            <RefreshCw className={`h-4 w-4 mr-1 ${ladenDashboard ? "animate-spin" : ""}`} />
            Vernieuwen
          </Button>
          <Button size="sm" onClick={() => setNieuweScanDialog(true)} disabled={scanLoopt}>
            {scanLoopt ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Scan loopt...</>
            ) : (
              <><Play className="h-4 w-4 mr-1" /> Nieuwe beoordeling</>
            )}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[
          { id: "overzicht", label: "Overzicht" },
          { id: "bevindingen", label: `Bevindingen${run ? ` (${run.aantalBevindingen ?? 0})` : ""}` },
          { id: "verbeterpunten", label: `Verbeterpunten${run ? ` (${run.aantalVerbeterpunten ?? 0})` : ""}` },
          { id: "azure", label: "Azure-status" },
          { id: "geschiedenis", label: "Geschiedenis" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActieveTab(tab.id as typeof actieveTab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              actieveTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overzicht ── */}
      {actieveTab === "overzicht" && (
        <div className="space-y-6">
          {ladenDashboard && !run && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Laden...
            </div>
          )}

          {!ladenDashboard && !run && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="font-medium">Nog geen beoordeling uitgevoerd.</p>
                <p className="text-sm mt-1">Start een nieuwe beoordeling om de release-gereedheid te analyseren.</p>
                <Button className="mt-4" onClick={() => setNieuweScanDialog(true)}>
                  <Play className="h-4 w-4 mr-1" /> Eerste beoordeling starten
                </Button>
              </CardContent>
            </Card>
          )}

          {run && score !== null && (
            <>
              {/* Totaalscore + release-status */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="md:col-span-1 flex flex-col items-center justify-center py-6">
                  <CardHeader className="pb-2 text-center">
                    <CardTitle className="text-base">Totale gereedheid</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center gap-2">
                    <div className="relative">
                      <ScoreRing score={score} size={140} />
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-3xl font-bold ${scoreKleur(score)}`}>
                          {score.toFixed(0)}
                        </span>
                        <span className="text-xs text-muted-foreground">/ 100</span>
                      </div>
                    </div>
                    {run.releaseStatus && (
                      <Badge className={`mt-2 text-xs px-3 py-1 border ${RELEASE_STATUS_KLEUR[run.releaseStatus]}`}>
                        {RELEASE_STATUS_LABELS[run.releaseStatus]}
                      </Badge>
                    )}
                    {run.releaseGeblokkeerd && run.blokkeringReden && (
                      <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 text-center">
                        Geblokkeerd: {run.blokkeringReden}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Bevindingen overzicht</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {[
                        { label: "Kritiek", waarde: run.aantalKritiek ?? 0, kleur: "text-red-700 bg-red-50 border-red-200" },
                        { label: "Hoog", waarde: run.aantalHoog ?? 0, kleur: "text-orange-700 bg-orange-50 border-orange-200" },
                        { label: "Totaal bevindingen", waarde: run.aantalBevindingen ?? 0, kleur: "text-gray-700 bg-gray-50 border-gray-200" },
                        { label: "Verbeterpunten", waarde: run.aantalVerbeterpunten ?? 0, kleur: "text-blue-700 bg-blue-50 border-blue-200" },
                      ].map((item) => (
                        <div key={item.label} className={`p-3 rounded-lg border ${item.kleur} text-center`}>
                          <div className="text-2xl font-bold">{item.waarde}</div>
                          <div className="text-xs mt-0.5">{item.label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Beoordeeld op {new Date(run.gestarttOp).toLocaleString("nl-NL")}
                      {run.versieLabel && ` · Versie: ${run.versieLabel}`}
                      {" · "}door {run.gestarttDoorNaam}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Categoryscores raster */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Scores per categorie</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                    {Object.entries(CATEGORIE_LABELS).map(([key, label]) => (
                      <ScoreKaart
                        key={key}
                        label={label}
                        score={run.categorieScores?.[key]}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Top-3 kritieke verbeterpunten */}
              {dashboard && dashboard.verbeterpunten.filter(v => v.urgentie === "kritiek" || v.urgentie === "hoog").length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      Hoogste prioriteit
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {dashboard.verbeterpunten
                      .filter(v => v.urgentie === "kritiek" || v.urgentie === "hoog")
                      .slice(0, 3)
                      .map((v) => (
                        <div key={v.id} className={`border-l-4 ${URGENTIE_KLEUR[v.urgentie]} pl-3 py-1`}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs capitalize">{v.urgentie}</Badge>
                            <span className="text-sm font-medium">{v.titel}</span>
                            <span className="text-xs text-muted-foreground ml-auto">{CATEGORIE_LABELS[v.categorie] ?? v.categorie}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{v.probleem}</p>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Bevindingen ── */}
      {actieveTab === "bevindingen" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={ernstFilter} onValueChange={setErnstFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Ernst" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle ernst</SelectItem>
                {["kritiek","hoog","gemiddeld","laag","info"].map(e => (
                  <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Categorie" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle categorieën</SelectItem>
                {Object.entries(CATEGORIE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={positiefFilter} onValueChange={setPositiefFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle types</SelectItem>
                <SelectItem value="positief">Sterk punt</SelectItem>
                <SelectItem value="negatief">Aandachtspunt</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground ml-auto">
              {gefilterdeBevindingen.length} bevinding(en)
            </span>
          </div>

          <div className="space-y-2">
            {gefilterdeBevindingen.length === 0 && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">
                Geen bevindingen gevonden met de huidige filters.
              </CardContent></Card>
            )}
            {gefilterdeBevindingen.map((b) => (
              <Card key={b.id} className={`border-l-4 ${b.positief ? "border-l-green-400" : b.ernst === "kritiek" ? "border-l-red-500" : b.ernst === "hoog" ? "border-l-orange-500" : "border-l-gray-300"}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-2 flex-wrap">
                    {b.positief ? (
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium text-sm">{b.titel}</span>
                        <Badge className={`text-xs ${ERNST_KLEUR[b.ernst]}`}>{b.ernst}</Badge>
                        <Badge variant="outline" className="text-xs">{CATEGORIE_LABELS[b.categorie] ?? b.categorie}</Badge>
                        <span className="text-xs text-muted-foreground">{SPECIALIST_LABELS[b.specialist] ?? b.specialist}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{b.bevinding}</p>
                      {b.impact && <p className="text-xs text-muted-foreground mt-1"><span className="font-medium">Impact:</span> {b.impact}</p>}
                      {b.oplossing && !b.positief && (
                        <button
                          onClick={() => setUitklappenId(uitklappenId === b.id ? null : b.id)}
                          className="text-xs text-primary mt-1 flex items-center gap-1"
                        >
                          Aanbeveling {uitklappenId === b.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      )}
                      {uitklappenId === b.id && b.oplossing && (
                        <p className="text-xs mt-1 p-2 bg-muted rounded">{b.oplossing}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Verbeterpunten ── */}
      {actieveTab === "verbeterpunten" && (
        <div className="space-y-3">
          {gefilterdePunten.length === 0 && (
            <Card><CardContent className="py-8 text-center text-muted-foreground">
              Geen verbeterpunten beschikbaar. Start een beoordeling om aanbevelingen te genereren.
            </CardContent></Card>
          )}
          {gefilterdePunten.map((v) => (
            <Card key={v.id} className={`border-l-4 ${URGENTIE_KLEUR[v.urgentie]}`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  {v.urgentie === "kritiek" ? <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" /> :
                   v.urgentie === "hoog" ? <TrendingUp className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" /> :
                   v.urgentie === "gemiddeld" ? <Minus className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" /> :
                   <TrendingDown className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-sm">{v.titel}</span>
                      <Badge variant="outline" className="text-xs capitalize">{v.urgentie}</Badge>
                      <Badge variant="outline" className="text-xs">{CATEGORIE_LABELS[v.categorie] ?? v.categorie}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">{SPECIALIST_LABELS[v.specialist] ?? v.specialist}</span>
                    </div>
                    <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Probleem:</span> {v.probleem}</p>
                    <p className="text-sm mt-1"><span className="font-medium">Oplossing:</span> {v.oplossing}</p>
                    {v.verwachteVerbetering && (
                      <p className="text-xs text-muted-foreground mt-1"><span className="font-medium">Verwachte verbetering:</span> {v.verwachteVerbetering}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Tab: Azure-status ── */}
      {actieveTab === "azure" && (
        <div className="space-y-4">
          {azureData && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Actief", waarde: azureData.actief, kleur: "text-green-700 bg-green-50 border-green-200" },
                { label: "Fallback", waarde: azureData.fallback, kleur: "text-amber-700 bg-amber-50 border-amber-200" },
                { label: "Niet actief", waarde: azureData.niet_actief, kleur: "text-gray-700 bg-gray-50 border-gray-200" },
              ].map((item) => (
                <Card key={item.label} className={`border ${item.kleur}`}>
                  <CardContent className="py-4 text-center">
                    <div className="text-2xl font-bold">{item.waarde}</div>
                    <div className="text-xs mt-0.5">{item.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <div className="space-y-3">
            {(azureData?.features ?? []).map((f) => (
              <Card key={f.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <Cloud className={`h-5 w-5 mt-0.5 shrink-0 ${f.status === "actief" ? "text-green-600" : f.status === "fallback" ? "text-amber-500" : "text-gray-400"}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium text-sm">{f.naam}</span>
                        <Badge variant="outline" className="text-xs">{f.module}</Badge>
                        <Badge className={`text-xs ml-auto ${f.status === "actief" ? "bg-green-100 text-green-800" : f.status === "fallback" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>
                          {f.statusLabel}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{f.beschrijving}</p>
                      <p className="text-xs mt-1">{f.opmerking}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Geschiedenis ── */}
      {actieveTab === "geschiedenis" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Alle beoordelingsruns</p>
            <Button variant="outline" size="sm" onClick={laadRuns} disabled={ladenRuns}>
              <RefreshCw className={`h-4 w-4 mr-1 ${ladenRuns ? "animate-spin" : ""}`} />
              Vernieuwen
            </Button>
          </div>
          {runs.length === 0 && !ladenRuns && (
            <Card><CardContent className="py-8 text-center text-muted-foreground">
              Nog geen beoordelingen uitgevoerd.
            </CardContent></Card>
          )}
          {runs.map((r) => {
            const s = r.totaalScore ? parseFloat(r.totaalScore) : null;
            return (
              <Card key={r.id}
                className={`cursor-pointer transition-colors hover:bg-muted/30 ${geselecteerdeRunId === r.id ? "ring-1 ring-primary" : ""}`}
                onClick={() => {
                  if (r.status === "voltooid") {
                    laadRunDetail(r.id);
                    setActieveTab("bevindingen");
                  }
                }}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      {r.status === "lopend" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                      {r.status === "voltooid" && <CheckCircle className="h-4 w-4 text-green-600" />}
                      {r.status === "mislukt" && <XCircle className="h-4 w-4 text-red-600" />}
                      <span className="text-sm font-medium">
                        Beoordeling #{r.id}
                        {r.versieLabel && <span className="text-muted-foreground"> · {r.versieLabel}</span>}
                      </span>
                    </div>
                    {s !== null && (
                      <span className={`font-bold text-sm ${scoreKleur(s)}`}>{s.toFixed(0)}/100</span>
                    )}
                    {r.releaseStatus && (
                      <Badge className={`text-xs border ${RELEASE_STATUS_KLEUR[r.releaseStatus]}`}>
                        {RELEASE_STATUS_LABELS[r.releaseStatus]}
                      </Badge>
                    )}
                    {r.releaseGeblokkeerd && (
                      <ShieldAlert className="h-4 w-4 text-red-600" />
                    )}
                    <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(r.gestarttOp).toLocaleString("nl-NL")}
                    </span>
                    <span className="text-xs text-muted-foreground">{r.gestarttDoorNaam}</span>
                  </div>
                  {r.blokkeringReden && (
                    <p className="text-xs text-red-700 mt-1 pl-6">{r.blokkeringReden}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Dialoog: Nieuwe scan ── */}
      <Dialog open={nieuweScanDialog} onOpenChange={setNieuweScanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              Nieuwe CQO-beoordeling starten
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              De AI Chief Quality Officer voert een volledige beoordeling uit vanuit 15 expertperspectieven.
              Dit duurt gemiddeld 3-5 minuten.
            </p>
            <div>
              <label className="text-sm font-medium">Versielabel (optioneel)</label>
              <Input
                className="mt-1"
                placeholder="Bijv. v1.4-rc1 of 2026-07-release"
                value={versieLabel}
                onChange={(e) => setVersieLabel(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNieuweScanDialog(false)}>Annuleren</Button>
            <Button onClick={startNieuweScan}>
              <Play className="h-4 w-4 mr-1" /> Beoordeling starten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

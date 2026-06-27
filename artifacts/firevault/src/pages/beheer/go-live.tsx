import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBeheerGoLiveDashboard,
  useGetBeheerGoLiveFasen,
  usePatchBeheerGoLiveFasenId,
  useGetBeheerGoLiveReadiness,
  useGetBeheerGoLiveAdviezen,
  usePostBeheerGoLiveAdviezenGenereer,
  usePatchBeheerGoLiveAdviezenId,
  useGetBeheerGoLiveMijnActies,
  useGetBeheerGoLiveTestdata,
  usePostBeheerGoLiveLessen,
  getGetBeheerGoLiveDashboardQueryKey,
  getGetBeheerGoLiveFasenQueryKey,
  getGetBeheerGoLiveAdviezenQueryKey,
} from "@workspace/api-client-react";
import type {
  GoLiveFase,
  GoLiveAdvies,
  GoLiveReadinessItem,
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, AlertCircle, XCircle, Sparkles, ChevronDown, ChevronUp,
  Clock, Target, Zap, CheckSquare, Square, ExternalLink, RefreshCw,
  TriangleAlert, ShieldCheck, Database,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

// ── Helpers ────────────────────────────────────────────────────────────────────

const FASE_STATUS_LABELS: Record<string, string> = {
  gepland: "Gepland",
  bezig: "In uitvoering",
  gereed: "Gereed",
  geblokkeerd: "Geblokkeerd",
};

const FASE_STATUS_KLEUREN: Record<string, string> = {
  gepland: "secondary",
  bezig: "default",
  gereed: "outline",
  geblokkeerd: "destructive",
};

function ReadinessBadge({ status }: { status: string }) {
  if (status === "groen") return <Badge variant="outline" className="text-green-700 border-green-400 bg-green-50"><CheckCircle2 className="w-3 h-3 mr-1" />Gereed</Badge>;
  if (status === "oranje") return <Badge variant="outline" className="text-amber-700 border-amber-400 bg-amber-50"><AlertCircle className="w-3 h-3 mr-1" />Aandacht</Badge>;
  return <Badge variant="outline" className="text-red-700 border-red-400 bg-red-50"><XCircle className="w-3 h-3 mr-1" />Blokkade</Badge>;
}

function ReadinessIcoon({ status }: { status: string }) {
  if (status === "groen") return <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />;
  if (status === "oranje") return <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />;
  return <XCircle className="w-5 h-5 text-red-600 shrink-0" />;
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────

function DashboardTab() {
  const { data: dashboard, isLoading } = useGetBeheerGoLiveDashboard();
  const { data: adviezen, isLoading: advLoading } = useGetBeheerGoLiveAdviezen();
  const genereer = usePostBeheerGoLiveAdviezenGenereer();
  const patchAdvies = usePatchBeheerGoLiveAdviezenId();
  const qc = useQueryClient();

  const openAdvies = adviezen?.find((a) => a.status === "open");

  function handleGenereer() {
    genereer.mutate(undefined, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetBeheerGoLiveAdviezenQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetBeheerGoLiveDashboardQueryKey() });
      },
    });
  }

  function handleAdviesStatus(id: number, status: string) {
    patchAdvies.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getGetBeheerGoLiveAdviezenQueryKey() });
          void qc.invalidateQueries({ queryKey: getGetBeheerGoLiveDashboardQueryKey() });
        },
      }
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="text-3xl font-bold">{dashboard?.voortgang_pct ?? 0}%</div>
                <div className="text-sm text-muted-foreground mt-1">Totale voortgang</div>
                <Progress value={dashboard?.voortgang_pct ?? 0} className="mt-2 h-1.5" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-3xl font-bold text-green-600">{dashboard?.fasen_gereed ?? 0}</div>
                <div className="text-sm text-muted-foreground mt-1">Fasen gereed</div>
                <div className="text-xs text-muted-foreground">van {dashboard?.fasen_totaal ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-3xl font-bold text-red-600">{dashboard?.kritieke_blokkades ?? 0}</div>
                <div className="text-sm text-muted-foreground mt-1">Kritieke blokkades</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-3xl font-bold">{dashboard?.open_acties ?? 0}</div>
                <div className="text-sm text-muted-foreground mt-1">Open acties</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* AI advieskaart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-amber-500" />
              AI Implementatiecoach
            </CardTitle>
            <CardDescription>Gepersonaliseerd advies op basis van uw huidige status</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenereer}
            disabled={genereer.isPending}
            className="gap-1.5"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", genereer.isPending && "animate-spin")} />
            Nieuw advies
          </Button>
        </CardHeader>
        <CardContent>
          {advLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ) : openAdvies ? (
            <div className="space-y-4">
              <div>
                <div className="font-semibold text-sm">{openAdvies.titel}</div>
                <div className="text-sm text-muted-foreground mt-1">{openAdvies.inhoud}</div>
              </div>
              {(openAdvies.reden || openAdvies.impact || openAdvies.risico) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {openAdvies.reden && (
                    <div className="rounded-md bg-muted/50 p-3">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Reden</div>
                      <div className="text-sm">{openAdvies.reden}</div>
                    </div>
                  )}
                  {openAdvies.impact && (
                    <div className="rounded-md bg-green-50 p-3">
                      <div className="text-xs font-medium text-green-700 uppercase tracking-wide mb-1">Impact</div>
                      <div className="text-sm text-green-800">{openAdvies.impact}</div>
                    </div>
                  )}
                  {openAdvies.risico && (
                    <div className="rounded-md bg-red-50 p-3">
                      <div className="text-xs font-medium text-red-700 uppercase tracking-wide mb-1">Risico bij niets doen</div>
                      <div className="text-sm text-red-800">{openAdvies.risico}</div>
                    </div>
                  )}
                </div>
              )}
              {openAdvies.tijdwinst_uur != null && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  Geschatte tijdwinst: <span className="font-medium text-foreground">{openAdvies.tijdwinst_uur} uur</span>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={() => handleAdviesStatus(openAdvies.id, "geaccepteerd")} disabled={patchAdvies.isPending}>
                  Accepteren
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleAdviesStatus(openAdvies.id, "uitgesteld")} disabled={patchAdvies.isPending}>
                  Uitstellen
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => handleAdviesStatus(openAdvies.id, "genegeerd")} disabled={patchAdvies.isPending}>
                  Negeren
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-2">
              Klik op &quot;Nieuw advies&quot; om een gepersonaliseerde aanbeveling te genereren.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Eerdere adviezen */}
      {adviezen && adviezen.filter((a) => a.status !== "open").length > 0 && (
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">Eerder gegeven adviezen</div>
          <div className="space-y-2">
            {adviezen.filter((a) => a.status !== "open").slice(0, 3).map((a) => (
              <div key={a.id} className="flex items-start justify-between rounded-md border px-3 py-2 gap-3">
                <div className="text-sm">{a.titel}</div>
                <Badge variant="secondary" className="shrink-0 text-xs">{a.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fasen tab ─────────────────────────────────────────────────────────────────

function FasenTab() {
  const { data: fasen, isLoading } = useGetBeheerGoLiveFasen();
  const patch = usePatchBeheerGoLiveFasenId();
  const qc = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const [vorm, setVorm] = useState<Record<number, { status: string; voortgang_pct: number; opmerkingen: string; verantwoordelijke: string }>>({});

  function toggle(id: number, fase: GoLiveFase) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (!vorm[id]) {
      setVorm((v) => ({
        ...v,
        [id]: {
          status: fase.status,
          voortgang_pct: fase.voortgang_pct ?? 0,
          opmerkingen: fase.opmerkingen ?? "",
          verantwoordelijke: fase.verantwoordelijke ?? "",
        },
      }));
    }
  }

  function slaOp(id: number) {
    const v = vorm[id];
    if (!v) return;
    patch.mutate(
      { id, data: { status: v.status, voortgang_pct: v.voortgang_pct, opmerkingen: v.opmerkingen || undefined, verantwoordelijke: v.verantwoordelijke || undefined } },
      { onSuccess: () => void qc.invalidateQueries({ queryKey: getGetBeheerGoLiveFasenQueryKey() }) }
    );
  }

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>;

  return (
    <div className="space-y-2">
      {fasen?.map((fase) => {
        const isOpen = open === fase.id;
        const v = vorm[fase.id];
        return (
          <Card key={fase.id} className="overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              onClick={() => toggle(fase.id, fase)}
            >
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                {fase.volgorde}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{fase.naam}</span>
                  <Badge variant={FASE_STATUS_KLEUREN[fase.status] as "secondary" | "default" | "outline" | "destructive" | null | undefined}>
                    {FASE_STATUS_LABELS[fase.status] ?? fase.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{fase.beschrijving}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden sm:flex items-center gap-1.5">
                  <Progress value={fase.voortgang_pct ?? 0} className="w-20 h-1.5" />
                  <span className="text-xs text-muted-foreground w-8">{fase.voortgang_pct ?? 0}%</span>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>
            {isOpen && (
              <div className="border-t px-4 py-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="font-medium text-muted-foreground mb-1">Doel</div>
                    <div>{fase.doel}</div>
                  </div>
                  {fase.risico && (
                    <div>
                      <div className="font-medium text-muted-foreground mb-1 flex items-center gap-1"><TriangleAlert className="w-3.5 h-3.5 text-amber-500" />Risico</div>
                      <div className="text-amber-700">{fase.risico}</div>
                    </div>
                  )}
                  {fase.afhankelijkheden && fase.afhankelijkheden.length > 0 && (
                    <div>
                      <div className="font-medium text-muted-foreground mb-1">Afhankelijkheden</div>
                      <div className="flex gap-1 flex-wrap">
                        {fase.afhankelijkheden.map((dep) => (
                          <Badge key={dep} variant="secondary" className="text-xs">{dep}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {fase.geschatte_uren && (
                    <div>
                      <div className="font-medium text-muted-foreground mb-1">Geschatte uren</div>
                      <div>{fase.geschatte_uren} uur</div>
                    </div>
                  )}
                </div>
                {v && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor={`status-${fase.id}`}>Status</Label>
                        <Select value={v.status} onValueChange={(val) => setVorm((prev) => ({ ...prev, [fase.id]: { ...prev[fase.id], status: val } }))}>
                          <SelectTrigger id={`status-${fase.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(FASE_STATUS_LABELS).map(([k, lbl]) => (
                              <SelectItem key={k} value={k}>{lbl}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`vrtg-${fase.id}`}>Voortgang ({v.voortgang_pct}%)</Label>
                        <Input
                          id={`vrtg-${fase.id}`}
                          type="range"
                          min={0} max={100} step={5}
                          value={v.voortgang_pct}
                          onChange={(e) => setVorm((prev) => ({ ...prev, [fase.id]: { ...prev[fase.id], voortgang_pct: Number(e.target.value) } }))}
                          className="cursor-pointer"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`verant-${fase.id}`}>Verantwoordelijke</Label>
                        <Input
                          id={`verant-${fase.id}`}
                          placeholder="Naam of rol"
                          value={v.verantwoordelijke}
                          onChange={(e) => setVorm((prev) => ({ ...prev, [fase.id]: { ...prev[fase.id], verantwoordelijke: e.target.value } }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`opm-${fase.id}`}>Opmerkingen</Label>
                        <Textarea
                          id={`opm-${fase.id}`}
                          rows={2}
                          placeholder="Interne notities..."
                          value={v.opmerkingen}
                          onChange={(e) => setVorm((prev) => ({ ...prev, [fase.id]: { ...prev[fase.id], opmerkingen: e.target.value } }))}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => slaOp(fase.id)} disabled={patch.isPending}>
                        Opslaan
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Readiness tab ─────────────────────────────────────────────────────────────

function ReadinessTab() {
  const { data: items, isLoading, refetch } = useGetBeheerGoLiveReadiness();

  const categorien = items
    ? [...new Set(items.map((i) => i.categorie))]
    : [];

  const rood = items?.filter((i) => i.status === "rood").length ?? 0;
  const oranje = items?.filter((i) => i.status === "oranje").length ?? 0;
  const groen = items?.filter((i) => i.status === "groen").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-green-700"><CheckCircle2 className="w-4 h-4" />{groen} gereed</span>
          <span className="flex items-center gap-1.5 text-amber-600"><AlertCircle className="w-4 h-4" />{oranje} aandacht</span>
          <span className="flex items-center gap-1.5 text-red-600"><XCircle className="w-4 h-4" />{rood} blokkade</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refetch()} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Herhalen
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      ) : (
        categorien.map((cat) => (
          <div key={cat}>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{cat}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {items?.filter((i) => i.categorie === cat).map((item) => (
                <div
                  key={item.sleutel}
                  className={cn(
                    "flex items-start gap-3 rounded-md border p-3",
                    item.status === "groen" && "bg-green-50/50 border-green-200",
                    item.status === "oranje" && "bg-amber-50/50 border-amber-200",
                    item.status === "rood" && "bg-red-50/50 border-red-200"
                  )}
                >
                  <ReadinessIcoon status={item.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{item.label}</div>
                    {item.waarde && <div className="text-xs text-muted-foreground mt-0.5">{item.waarde}</div>}
                    {item.detail && <div className="text-xs text-amber-700 mt-0.5">{item.detail}</div>}
                  </div>
                  <ReadinessBadge status={item.status} />
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Mijn plan tab ─────────────────────────────────────────────────────────────

function MijnPlanTab() {
  const { data: acties, isLoading } = useGetBeheerGoLiveMijnActies();
  const [gedaan, setGedaan] = useState<Set<string>>(new Set());

  const categorien = acties ? [...new Set(acties.map((a) => a.categorie))] : [];
  const totaal = acties?.length ?? 0;
  const afgerond = gedaan.size;

  function toggleGedaan(id: string) {
    setGedaan((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Progress value={totaal > 0 ? Math.round((afgerond / totaal) * 100) : 0} className="flex-1 h-2" />
        <span className="text-sm text-muted-foreground shrink-0">{afgerond}/{totaal}</span>
      </div>
      {categorien.map((cat) => (
        <div key={cat}>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{cat}</div>
          <div className="space-y-1">
            {acties?.filter((a) => a.categorie === cat).map((actie) => {
              const isDone = gedaan.has(actie.id);
              return (
                <div
                  key={actie.id}
                  className={cn(
                    "flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors",
                    isDone && "opacity-60 bg-muted/20"
                  )}
                  onClick={() => toggleGedaan(actie.id)}
                >
                  {isDone
                    ? <CheckSquare className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                    : <Square className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className={cn("text-sm font-medium", isDone && "line-through text-muted-foreground")}>{actie.titel}</div>
                    {actie.beschrijving && <div className="text-xs text-muted-foreground mt-0.5">{actie.beschrijving}</div>}
                  </div>
                  {actie.link && !isDone && (
                    <Link href={actie.link} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground shrink-0 mt-0.5" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {totaal === 0 && (
        <div className="text-sm text-muted-foreground text-center py-6">
          Geen acties gevonden voor uw rol en bevoegdheden.
        </div>
      )}
    </div>
  );
}

// ── Testdata tab ──────────────────────────────────────────────────────────────

function TestdataTab() {
  const { data: testdata, isLoading } = useGetBeheerGoLiveTestdata();

  const items = testdata
    ? [
        { label: "Gebruikers", waarde: testdata.gebruikers, icoon: <ShieldCheck className="w-4 h-4" /> },
        { label: "Gebouwen", waarde: testdata.gebouwen, icoon: <Database className="w-4 h-4" /> },
        { label: "Spots", waarde: testdata.spots, icoon: <Target className="w-4 h-4" /> },
        { label: "Medewerkers", waarde: testdata.medewerkers, icoon: <Database className="w-4 h-4" /> },
        { label: "Projecten", waarde: testdata.projecten, icoon: <Database className="w-4 h-4" /> },
        { label: "Facturen", waarde: testdata.facturen, icoon: <Database className="w-4 h-4" /> },
      ]
    : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Databaseoverzicht</CardTitle>
          <CardDescription>Huidige aantallen in de database. Controleer of dit productiedata of testdata is voordat u live gaat.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {items.map((item) => (
                <div key={item.label} className="rounded-md border p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">{item.icoon}<span className="text-xs">{item.label}</span></div>
                  <div className="text-2xl font-bold">{item.waarde}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TriangleAlert className="w-4 h-4 text-amber-600" />
            Testdata-wizard
          </CardTitle>
          <CardDescription className="text-amber-700">
            Gebruik deze wizard om testdata in bulk aan te maken of op te schonen. Voer dit alleen uit op een testomgeving — nooit op productie.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-white/70 border border-amber-200 p-4 space-y-3">
            <div className="text-sm font-medium">Testdata aanmaken</div>
            <div className="text-sm text-muted-foreground">Maak realistische testgebruikers, -gebouwen en -spots aan voor de testfase.</div>
            <Button variant="outline" size="sm" disabled className="gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              Testset aanmaken (beschikbaar in V1.5)
            </Button>
          </div>
          <div className="rounded-md bg-white/70 border border-amber-200 p-4 space-y-3">
            <div className="text-sm font-medium">Testdata opschonen</div>
            <div className="text-sm text-muted-foreground">Verwijder alle testdata veilig voor u live gaat. Maak eerst een back-up.</div>
            <Button variant="outline" size="sm" disabled className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5">
              <TriangleAlert className="w-3.5 h-3.5" />
              Testdata verwijderen (beschikbaar in V1.5)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Productie tab ─────────────────────────────────────────────────────────────

function ProductieTab() {
  const { data: items, isLoading } = useGetBeheerGoLiveReadiness();
  const { data: fasen } = useGetBeheerGoLiveFasen();
  const logLes = usePostBeheerGoLiveLessen();
  const [lesForm, setLesForm] = useState({ fase_sleutel: "", omschrijving: "", tijd_koste_uur: "" });
  const [lesIngediend, setLesIngediend] = useState(false);

  const alleGroen = items?.every((i) => i.status === "groen") ?? false;
  const roodItems = items?.filter((i) => i.status === "rood") ?? [];
  const oranjeItems = items?.filter((i) => i.status === "oranje") ?? [];
  const fasenGereed = fasen?.filter((f) => f.status === "gereed").length ?? 0;
  const fasenTotaal = fasen?.length ?? 0;
  const alleeFasenGereed = fasenGereed === fasenTotaal && fasenTotaal > 0;

  function handleLesIndienen() {
    if (!lesForm.fase_sleutel || !lesForm.omschrijving) return;
    logLes.mutate(
      {
        data: {
          fase_sleutel: lesForm.fase_sleutel,
          omschrijving: lesForm.omschrijving,
          tijd_koste_uur: lesForm.tijd_koste_uur ? Number(lesForm.tijd_koste_uur) : undefined,
        },
      },
      { onSuccess: () => { setLesIngediend(true); setLesForm({ fase_sleutel: "", omschrijving: "", tijd_koste_uur: "" }); } }
    );
  }

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>;

  return (
    <div className="space-y-6">
      {/* Go-live gereedheidskaart */}
      <Card className={cn(alleGroen && alleeFasenGereed ? "border-green-400 bg-green-50" : "border-amber-300 bg-amber-50")}>
        <CardContent className="pt-6 pb-5">
          <div className="flex items-center gap-4">
            {alleGroen && alleeFasenGereed ? (
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertCircle className="w-7 h-7 text-amber-600" />
              </div>
            )}
            <div>
              <div className="text-lg font-semibold">
                {alleGroen && alleeFasenGereed ? "FPS Connect is gereed voor productie" : "Nog niet gereed voor productie"}
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {alleGroen && alleeFasenGereed
                  ? "Alle readiness-checks slagen en alle fasen zijn afgerond."
                  : `${roodItems.length} blokkade(s), ${oranjeItems.length} aandachtspunt(en), ${fasenTotaal - fasenGereed} fase(n) nog niet gereed.`}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Checklist */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Definitieve productiechecklist</div>
        {items?.map((item) => (
          <div
            key={item.sleutel}
            className={cn(
              "flex items-start gap-3 rounded-md border px-3 py-2.5",
              item.status === "groen" && "border-green-200 bg-green-50/40",
              item.status === "oranje" && "border-amber-200 bg-amber-50/40",
              item.status === "rood" && "border-red-200 bg-red-50/40"
            )}
          >
            <ReadinessIcoon status={item.status} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{item.label}</div>
              {item.detail && <div className="text-xs text-muted-foreground mt-0.5">{item.detail}</div>}
            </div>
            <ReadinessBadge status={item.status} />
          </div>
        ))}
        <div className={cn("flex items-start gap-3 rounded-md border px-3 py-2.5", alleeFasenGereed ? "border-green-200 bg-green-50/40" : "border-amber-200 bg-amber-50/40")}>
          {alleeFasenGereed ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Implementatiefasen afgerond</div>
            <div className="text-xs text-muted-foreground mt-0.5">{fasenGereed} van {fasenTotaal} fasen gereed</div>
          </div>
          {alleeFasenGereed
            ? <Badge variant="outline" className="text-green-700 border-green-400 bg-green-50"><CheckCircle2 className="w-3 h-3 mr-1" />Gereed</Badge>
            : <Badge variant="outline" className="text-amber-700 border-amber-400 bg-amber-50"><AlertCircle className="w-3 h-3 mr-1" />Aandacht</Badge>}
        </div>
      </div>

      {/* Lessons learned */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Les vastleggen</CardTitle>
          <CardDescription>Wat hebt u geleerd tijdens de implementatie? Dit helpt toekomstige go-lives te verbeteren.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lesIngediend && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
              Les opgeslagen.
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="les-fase">Fase</Label>
            <Select value={lesForm.fase_sleutel} onValueChange={(v) => setLesForm((p) => ({ ...p, fase_sleutel: v }))}>
              <SelectTrigger id="les-fase"><SelectValue placeholder="Kies fase..." /></SelectTrigger>
              <SelectContent>
                {fasen?.map((f) => <SelectItem key={f.sleutel} value={f.sleutel}>{f.naam}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="les-omschr">Omschrijving</Label>
            <Textarea
              id="les-omschr"
              rows={3}
              placeholder="Wat hebt u geleerd of wat kan beter?"
              value={lesForm.omschrijving}
              onChange={(e) => setLesForm((p) => ({ ...p, omschrijving: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="les-uren">Uren die dit heeft gekost (optioneel)</Label>
            <Input
              id="les-uren"
              type="number"
              min={0}
              step={0.5}
              placeholder="bijv. 3.5"
              value={lesForm.tijd_koste_uur}
              onChange={(e) => setLesForm((p) => ({ ...p, tijd_koste_uur: e.target.value }))}
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleLesIndienen}
              disabled={logLes.isPending || !lesForm.fase_sleutel || !lesForm.omschrijving}
            >
              Les opslaan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Pagina ────────────────────────────────────────────────────────────────────

export default function GoLivePagina() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target className="w-6 h-6" />
          Go-Live Manager
        </h1>
        <p className="text-muted-foreground mt-1">
          AI-gestuurde implementatiecoach — van voorbereiding tot productie go-live.
        </p>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="fasen">Fasen</TabsTrigger>
          <TabsTrigger value="readiness">Readiness</TabsTrigger>
          <TabsTrigger value="mijn-plan">Mijn plan</TabsTrigger>
          <TabsTrigger value="testdata">Testdata</TabsTrigger>
          <TabsTrigger value="productie">Productie</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6"><DashboardTab /></TabsContent>
        <TabsContent value="fasen" className="mt-6"><FasenTab /></TabsContent>
        <TabsContent value="readiness" className="mt-6"><ReadinessTab /></TabsContent>
        <TabsContent value="mijn-plan" className="mt-6"><MijnPlanTab /></TabsContent>
        <TabsContent value="testdata" className="mt-6"><TestdataTab /></TabsContent>
        <TabsContent value="productie" className="mt-6"><ProductieTab /></TabsContent>
      </Tabs>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Shield, ShieldAlert, ShieldCheck, ShieldX, FileWarning, ClipboardList, BarChart3, CheckCircle, XCircle, Clock } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { toast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PromptScan {
  id: number;
  gebruikerId: number | null;
  gebruikerNaam: string | null;
  rol: string | null;
  module: string;
  functie: string | null;
  promptSamenvatting: string | null;
  classificatie: string;
  risicoScore: number;
  injectieGedetecteerd: boolean;
  injectieSignalen: string[] | null;
  beslissing: string;
  motivatie: string | null;
  aangemaaktOp: string;
}

interface Wijzigingsvoorstel {
  id: number;
  gebruikerId: number | null;
  gebruikerNaam: string | null;
  rol: string | null;
  titel: string;
  beschrijving: string;
  impactanalyse: string | null;
  betrokkenModules: string[] | null;
  risicoNiveau: string;
  status: string;
  goedgekeurdDoorNaam: string | null;
  opmerking: string | null;
  afgehandeldOp: string | null;
  aangemaaktOp: string;
}

interface PromptStatistieken {
  perClassificatie: Record<string, number>;
  injectiesVandaag: number;
  geblokkeerdeVandaag: number;
  voorstellenOpen: number;
}

// ── Hulpfuncties ──────────────────────────────────────────────────────────────

function classificatieBadge(classificatie: string) {
  switch (classificatie) {
    case "rood": return <Badge className="bg-red-100 text-red-800 border-red-200"><ShieldX className="w-3 h-3 mr-1" />Rood</Badge>;
    case "oranje": return <Badge className="bg-orange-100 text-orange-800 border-orange-200"><ShieldAlert className="w-3 h-3 mr-1" />Oranje</Badge>;
    case "geel": return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><Shield className="w-3 h-3 mr-1" />Geel</Badge>;
    default: return <Badge className="bg-green-100 text-green-800 border-green-200"><ShieldCheck className="w-3 h-3 mr-1" />Groen</Badge>;
  }
}

function beslissingBadge(beslissing: string) {
  switch (beslissing) {
    case "geblokkeerd": return <Badge variant="destructive">Geblokkeerd</Badge>;
    case "voorstel": return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Voorstel</Badge>;
    default: return <Badge variant="outline">Toegestaan</Badge>;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "goedgekeurd": return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Goedgekeurd</Badge>;
    case "afgewezen": return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Afgewezen</Badge>;
    default: return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />In afwachting</Badge>;
  }
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────

function DashboardTab() {
  const { data: stats } = useQuery<PromptStatistieken>({
    queryKey: ["/api/governance/ai-prompt-scans/statistieken"],
    queryFn: () => fetch("/api/governance/ai-prompt-scans/statistieken").then(r => r.json()),
    refetchInterval: 30000,
  });

  const kaarten = [
    { label: "Groen (toegestaan)", waarde: stats?.perClassificatie?.groen ?? 0, kleur: "text-green-700", bg: "bg-green-50 border-green-200", icon: <ShieldCheck className="w-5 h-5 text-green-600" /> },
    { label: "Geel (binnen rechten)", waarde: stats?.perClassificatie?.geel ?? 0, kleur: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200", icon: <Shield className="w-5 h-5 text-yellow-600" /> },
    { label: "Oranje (voorstellen)", waarde: stats?.perClassificatie?.oranje ?? 0, kleur: "text-orange-700", bg: "bg-orange-50 border-orange-200", icon: <ShieldAlert className="w-5 h-5 text-orange-600" /> },
    { label: "Rood (geblokkeerd)", waarde: stats?.perClassificatie?.rood ?? 0, kleur: "text-red-700", bg: "bg-red-50 border-red-200", icon: <ShieldX className="w-5 h-5 text-red-600" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kaarten.map((k) => (
          <Card key={k.label} className={`border ${k.bg}`}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-1">
                {k.icon}
                <span className={`text-2xl font-bold ${k.kleur}`}>{k.waarde}</span>
              </div>
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-xs text-muted-foreground">afgelopen 7 dagen</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <FileWarning className="w-4 h-4 text-red-600" />
              <span className="text-sm font-medium text-red-800">Injectie-aanvallen vandaag</span>
            </div>
            <p className="text-3xl font-bold text-red-700">{stats?.injectiesVandaag ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldX className="w-4 h-4 text-red-600" />
              <span className="text-sm font-medium text-red-800">Geblokkeerde aanroepen vandaag</span>
            </div>
            <p className="text-3xl font-bold text-red-700">{stats?.geblokkeerdeVandaag ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-orange-600" />
              <span className="text-sm font-medium text-orange-800">Voorstellen in afwachting</span>
            </div>
            <p className="text-3xl font-bold text-orange-700">{stats?.voorstellenOpen ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="w-4 h-4" />
            AI Change Governance — Uitleg classificaties
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded border border-green-200 bg-green-50 p-3">
              <p className="font-medium text-green-800 text-sm mb-1">Groen — Altijd toegestaan</p>
              <p className="text-xs text-green-700">Informatieve opdrachten: samenvatten, analyseren, adviseren, vragen beantwoorden.</p>
            </div>
            <div className="rounded border border-yellow-200 bg-yellow-50 p-3">
              <p className="font-medium text-yellow-800 text-sm mb-1">Geel — Binnen gebruikersrechten</p>
              <p className="text-xs text-yellow-700">E-mails schrijven, rapporten genereren, offertes opstellen, documenten vergelijken.</p>
            </div>
            <div className="rounded border border-orange-200 bg-orange-50 p-3">
              <p className="font-medium text-orange-800 text-sm mb-1">Oranje — Alleen als voorstel</p>
              <p className="text-xs text-orange-700">Workflow/configuratiewijzigingen: opgeslagen als voorstel, vereist goedkeuring hoofdbeheerder.</p>
            </div>
            <div className="rounded border border-red-200 bg-red-50 p-3">
              <p className="font-medium text-red-800 text-sm mb-1">Rood — Altijd geblokkeerd</p>
              <p className="text-xs text-red-700">DB-wijzigingen, rechten verhogen, beveiliging uitschakelen, prompt injection, broncode wijzigen.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Prompt-log tab ────────────────────────────────────────────────────────────

function PromptLogTab() {
  const [classificatieFilter, setClassificatieFilter] = useState("alle");
  const [beslissingFilter, setBeslissingFilter] = useState("alle");
  const [pagina, setPagina] = useState(1);

  const params = new URLSearchParams({ pagina: String(pagina), classificatie: classificatieFilter, beslissing: beslissingFilter });
  const { data } = useQuery<{ scans: PromptScan[]; totaal: number; totaalPaginas: number }>({
    queryKey: ["/api/governance/ai-prompt-scans", classificatieFilter, beslissingFilter, pagina],
    queryFn: () => fetch(`/api/governance/ai-prompt-scans?${params}`).then(r => r.json()),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <Select value={classificatieFilter} onValueChange={(v) => { setClassificatieFilter(v); setPagina(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Classificatie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle</SelectItem>
            <SelectItem value="groen">Groen</SelectItem>
            <SelectItem value="geel">Geel</SelectItem>
            <SelectItem value="oranje">Oranje</SelectItem>
            <SelectItem value="rood">Rood</SelectItem>
          </SelectContent>
        </Select>
        <Select value={beslissingFilter} onValueChange={(v) => { setBeslissingFilter(v); setPagina(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Beslissing" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle beslissingen</SelectItem>
            <SelectItem value="toegestaan">Toegestaan</SelectItem>
            <SelectItem value="voorstel">Voorstel</SelectItem>
            <SelectItem value="geblokkeerd">Geblokkeerd</SelectItem>
          </SelectContent>
        </Select>
        {data && <span className="text-sm text-muted-foreground self-center">{data.totaal} records</span>}
      </div>

      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left p-2 font-medium">Datum</th>
              <th className="text-left p-2 font-medium">Module</th>
              <th className="text-left p-2 font-medium">Classificatie</th>
              <th className="text-left p-2 font-medium">Beslissing</th>
              <th className="text-left p-2 font-medium">Score</th>
              <th className="text-left p-2 font-medium">Prompt (samenvatting)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(data?.scans ?? []).map((s) => (
              <tr key={s.id} className={s.beslissing === "geblokkeerd" ? "bg-red-50" : s.beslissing === "voorstel" ? "bg-orange-50" : ""}>
                <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">{formatDatum(s.aangemaaktOp)}</td>
                <td className="p-2 whitespace-nowrap"><span className="font-mono text-xs">{s.module}{s.functie ? ` / ${s.functie}` : ""}</span></td>
                <td className="p-2">{classificatieBadge(s.classificatie)}</td>
                <td className="p-2">{beslissingBadge(s.beslissing)}</td>
                <td className="p-2 text-right tabular-nums text-xs">{s.risicoScore}</td>
                <td className="p-2">
                  <div className="max-w-xs truncate text-xs text-muted-foreground">{s.promptSamenvatting ?? "—"}</div>
                  {s.injectieGedetecteerd && (
                    <div className="flex gap-1 flex-wrap mt-1">
                      {(s.injectieSignalen ?? []).map((sig) => (
                        <span key={sig} className="text-xs bg-red-100 text-red-700 rounded px-1">{sig}</span>
                      ))}
                    </div>
                  )}
                  {s.motivatie && <div className="text-xs text-muted-foreground mt-1 italic">{s.motivatie}</div>}
                </td>
              </tr>
            ))}
            {(data?.scans ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">Geen prompt-scans gevonden.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.totaalPaginas > 1 && (
        <div className="flex gap-2 justify-center">
          <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Vorige</Button>
          <span className="self-center text-sm text-muted-foreground">Pagina {pagina} / {data.totaalPaginas}</span>
          <Button variant="outline" size="sm" disabled={pagina >= data.totaalPaginas} onClick={() => setPagina(p => p + 1)}>Volgende</Button>
        </div>
      )}
    </div>
  );
}

// ── Wijzigingsvoorstellen tab ─────────────────────────────────────────────────

function WijzigingsvoorstellenTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("wacht");
  const [geselecteerd, setGeselecteerd] = useState<Wijzigingsvoorstel | null>(null);
  const [opmerking, setOpmerking] = useState("");

  const { data: voorstellen = [] } = useQuery<Wijzigingsvoorstel[]>({
    queryKey: ["/api/governance/ai-wijzigingsvoorstellen", statusFilter],
    queryFn: () => fetch(`/api/governance/ai-wijzigingsvoorstellen?status=${statusFilter}`).then(r => r.json()),
  });

  const beoordeelMutation = useMutation({
    mutationFn: ({ id, beslissing, opm }: { id: number; beslissing: string; opm: string }) =>
      fetch(`/api/governance/ai-wijzigingsvoorstellen/${id}/beoordelen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beslissing, opmerking: opm }),
      }).then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.fout ?? "Fout bij beoordelen.");
        return d;
      }),
    onSuccess: (_, { beslissing }) => {
      toast({ title: beslissing === "goedgekeurd" ? "Voorstel goedgekeurd" : "Voorstel afgewezen" });
      setGeselecteerd(null);
      setOpmerking("");
      qc.invalidateQueries({ queryKey: ["/api/governance/ai-wijzigingsvoorstellen"] });
      qc.invalidateQueries({ queryKey: ["/api/governance/ai-prompt-scans/statistieken"] });
    },
    onError: (e: Error) => toast({ title: "Fout", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="wacht">In afwachting</SelectItem>
            <SelectItem value="goedgekeurd">Goedgekeurd</SelectItem>
            <SelectItem value="afgewezen">Afgewezen</SelectItem>
            <SelectItem value="alle">Alle</SelectItem>
          </SelectContent>
        </Select>
        <span className="self-center text-sm text-muted-foreground">{voorstellen.length} voorstellen</span>
      </div>

      {statusFilter === "wacht" && voorstellen.length > 0 && (
        <div className="rounded border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          Er zijn {voorstellen.length} wijzigingsvoorstel(len) in afwachting van uw beoordeling. AI kan deze verzoeken nooit zelfstandig uitvoeren.
        </div>
      )}

      <div className="space-y-3">
        {voorstellen.map((v) => (
          <Card key={v.id} className={v.status === "wacht" ? "border-orange-200" : ""}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {statusBadge(v.status)}
                    <Badge variant="outline" className="text-xs">{v.risicoNiveau}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDatum(v.aangemaaktOp)}</span>
                  </div>
                  <h3 className="font-medium text-sm mb-1">{v.titel}</h3>
                  <p className="text-xs text-muted-foreground mb-2">{v.beschrijving.slice(0, 200)}{v.beschrijving.length > 200 ? "…" : ""}</p>
                  {v.betrokkenModules && (
                    <div className="flex gap-1 flex-wrap">
                      {(v.betrokkenModules as unknown as string[]).map((m) => (
                        <span key={m} className="text-xs bg-muted text-muted-foreground rounded px-1">{m}</span>
                      ))}
                    </div>
                  )}
                  {v.status !== "wacht" && v.goedgekeurdDoorNaam && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {v.status === "goedgekeurd" ? "Goedgekeurd" : "Afgewezen"} door {v.goedgekeurdDoorNaam}
                      {v.opmerking ? ` — "${v.opmerking}"` : ""}
                    </p>
                  )}
                </div>
                {v.status === "wacht" && (
                  <Button size="sm" variant="outline" onClick={() => { setGeselecteerd(v); setOpmerking(""); }}>
                    Beoordelen
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {voorstellen.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">Geen wijzigingsvoorstellen gevonden.</div>
        )}
      </div>

      <Dialog open={!!geselecteerd} onOpenChange={(o) => { if (!o) setGeselecteerd(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Wijzigingsvoorstel beoordelen</DialogTitle>
          </DialogHeader>
          {geselecteerd && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium mb-1">Verzoek</p>
                <p className="text-sm text-muted-foreground bg-muted rounded p-2">{geselecteerd.beschrijving.slice(0, 500)}</p>
              </div>
              {geselecteerd.impactanalyse && (
                <div>
                  <p className="text-sm font-medium mb-1">Impactanalyse</p>
                  <pre className="text-xs text-muted-foreground bg-muted rounded p-2 whitespace-pre-wrap">{geselecteerd.impactanalyse}</pre>
                </div>
              )}
              <div>
                <p className="text-sm font-medium mb-1">Opmerking (optioneel)</p>
                <Textarea value={opmerking} onChange={(e) => setOpmerking(e.target.value)} placeholder="Toelichting op uw beslissing..." rows={2} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setGeselecteerd(null)}>Annuleren</Button>
            <Button
              variant="destructive"
              onClick={() => geselecteerd && beoordeelMutation.mutate({ id: geselecteerd.id, beslissing: "afgewezen", opm: opmerking })}
              disabled={beoordeelMutation.isPending}
            >
              Afwijzen
            </Button>
            <Button
              onClick={() => geselecteerd && beoordeelMutation.mutate({ id: geselecteerd.id, beslissing: "goedgekeurd", opm: opmerking })}
              disabled={beoordeelMutation.isPending}
            >
              Goedkeuren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Hoofdpagina ───────────────────────────────────────────────────────────────

export default function AiPromptGovernance() {
  const { gebruiker } = useAuth();

  if (gebruiker?.rol !== "hoofdbeheerder") {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Alleen de hoofdbeheerder heeft toegang tot AI-governance.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Shield className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">AI Change Governance</h1>
          <p className="text-sm text-muted-foreground">Centrale beveiligingslaag voor alle AI-aanroepen — prompt-classificatie, injectie-detectie en wijzigingsbeheer.</p>
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard"><BarChart3 className="w-4 h-4 mr-1" />Dashboard</TabsTrigger>
          <TabsTrigger value="prompt-log"><ClipboardList className="w-4 h-4 mr-1" />Prompt-log</TabsTrigger>
          <TabsTrigger value="voorstellen"><FileWarning className="w-4 h-4 mr-1" />Wijzigingsvoorstellen</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab />
        </TabsContent>

        <TabsContent value="prompt-log" className="mt-4">
          <PromptLogTab />
        </TabsContent>

        <TabsContent value="voorstellen" className="mt-4">
          <WijzigingsvoorstellenTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

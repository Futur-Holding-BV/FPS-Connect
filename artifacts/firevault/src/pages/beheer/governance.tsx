import { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert, ShieldCheck, AlertTriangle, Clock, Loader2,
  CheckCircle, XCircle, RefreshCw, Filter, Search, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useRol } from "@/context/rol-context";
import { useLocation } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────

type RisicoNiveau = "groen" | "geel" | "oranje" | "rood" | "kritiek";

interface GovernanceCheck {
  id: number;
  gebruikerNaam: string | null;
  rol: string | null;
  methode: string;
  route: string;
  module: string | null;
  risicoNiveau: RisicoNiveau;
  risicoScore: number;
  motivatie: string | null;
  afhandeling: string;
  geblokkeerd: boolean;
  statuscode: number | null;
  ipAdres: string | null;
  aangemaaktOp: string;
}

interface WachtrijItem {
  id: number;
  checkId: number;
  vereistRol: string;
  aangevraagdVanRol: string | null;
  status: string;
  goedgekeurdDoorNaam: string | null;
  opmerking: string | null;
  afgehandeldOp: string | null;
  aangemaaktOp: string;
  checkMethode: string;
  checkRoute: string;
  checkModule: string | null;
  checkNiveau: RisicoNiveau;
  checkScore: number;
  checkMotivatie: string | null;
  checkGebruikerNaam: string | null;
  checkRol: string | null;
}

interface Dashboard {
  totaalVandaag: number;
  perNiveau: Record<RisicoNiveau, number>;
  geblokkeerd: number;
  wachtrijOpen: number;
  recenteChecks: GovernanceCheck[];
}

// ── Constanten ────────────────────────────────────────────────────────────────

const NIVEAU_KLEUR: Record<RisicoNiveau, string> = {
  groen:   "bg-green-100 text-green-800 border-green-200",
  geel:    "bg-yellow-100 text-yellow-800 border-yellow-200",
  oranje:  "bg-orange-100 text-orange-800 border-orange-200",
  rood:    "bg-red-100 text-red-800 border-red-200",
  kritiek: "bg-red-900 text-white border-red-900",
};

const NIVEAU_LABEL: Record<RisicoNiveau, string> = {
  groen:   "Groen",
  geel:    "Geel",
  oranje:  "Oranje",
  rood:    "Rood",
  kritiek: "Kritiek",
};

const METHODE_KLEUR: Record<string, string> = {
  POST:   "bg-blue-100 text-blue-800",
  PATCH:  "bg-slate-100 text-slate-700",
  PUT:    "bg-slate-100 text-slate-700",
  DELETE: "bg-red-100 text-red-800",
};

function formatDatum(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Niveau-badge ──────────────────────────────────────────────────────────────

function NiveauBadge({ niveau }: { niveau: RisicoNiveau }) {
  return (
    <Badge variant="outline" className={`text-[11px] font-medium border ${NIVEAU_KLEUR[niveau]}`}>
      {NIVEAU_LABEL[niveau]}
    </Badge>
  );
}

// ── Tab: Dashboard ────────────────────────────────────────────────────────────

function DashboardTab({ data, laden, opVervers }: {
  data: Dashboard | null;
  laden: boolean;
  opVervers: () => void;
}) {
  if (laden) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Laden…</span>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground py-8">Geen data beschikbaar.</p>;

  const NIVEAUS: RisicoNiveau[] = ["groen", "geel", "oranje", "rood", "kritiek"];

  return (
    <div className="space-y-6">
      {/* Samenvattingskaarten */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {NIVEAUS.map((n) => (
          <Card key={n}>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground mb-1">
                {NIVEAU_LABEL[n]}
              </p>
              <p className="text-2xl font-bold">{data.perNiveau[n] ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">vandaag</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Geblokkeerd vandaag</p>
              <p className="text-xl font-bold">{data.geblokkeerd}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-orange-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Wachtrij open</p>
              <p className="text-xl font-bold">{data.wachtrijOpen}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Totaal verwerkt vandaag</p>
              <p className="text-xl font-bold">{data.totaalVandaag}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recente checks */}
      <Card>
        <CardHeader className="py-3 px-4 flex-row items-center justify-between">
          <CardTitle className="text-sm">Recente activiteit</CardTitle>
          <Button size="sm" variant="ghost" onClick={opVervers}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <RecenteChecksTable checks={data.recenteChecks} />
        </CardContent>
      </Card>
    </div>
  );
}

// ── Herbruikbare checks-tabel ─────────────────────────────────────────────────

function RecenteChecksTable({ checks }: { checks: GovernanceCheck[] }) {
  if (checks.length === 0) {
    return <p className="text-xs text-muted-foreground px-4 py-6 text-center">Nog geen activiteit geregistreerd.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs py-2">Tijdstip</TableHead>
            <TableHead className="text-xs py-2">Gebruiker</TableHead>
            <TableHead className="text-xs py-2">Methode</TableHead>
            <TableHead className="text-xs py-2">Route</TableHead>
            <TableHead className="text-xs py-2">Risico</TableHead>
            <TableHead className="text-xs py-2">Score</TableHead>
            <TableHead className="text-xs py-2">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {checks.map((c) => (
            <TableRow key={c.id} className={c.geblokkeerd ? "bg-red-50" : undefined}>
              <TableCell className="text-xs py-2 whitespace-nowrap">{formatDatum(c.aangemaaktOp)}</TableCell>
              <TableCell className="text-xs py-2">{c.gebruikerNaam ?? "—"}</TableCell>
              <TableCell className="text-xs py-2">
                <Badge variant="secondary" className={`text-[10px] ${METHODE_KLEUR[c.methode] ?? ""}`}>
                  {c.methode}
                </Badge>
              </TableCell>
              <TableCell className="text-xs py-2 max-w-[200px] truncate font-mono" title={c.route}>
                {c.route}
              </TableCell>
              <TableCell className="text-xs py-2">
                <NiveauBadge niveau={c.risicoNiveau} />
              </TableCell>
              <TableCell className="text-xs py-2 tabular-nums">{c.risicoScore}</TableCell>
              <TableCell className="text-xs py-2">
                {c.geblokkeerd
                  ? <Badge variant="destructive" className="text-[10px]">Geblokkeerd</Badge>
                  : <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">Verwerkt</Badge>
                }
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Tab: Goedkeuringswachtrij ─────────────────────────────────────────────────

function WachtrijTab() {
  const [items, setItems] = useState<WachtrijItem[]>([]);
  const [laden, setLaden] = useState(false);
  const [statusFilter, setStatusFilter] = useState("wacht");
  const [actief, setActief] = useState<WachtrijItem | null>(null);
  const [actie, setActie] = useState<"goedkeuren" | "afwijzen" | null>(null);
  const [opmerking, setOpmerking] = useState("");
  const [verwerken, setVerwerken] = useState(false);

  const laadItems = useCallback(() => {
    setLaden(true);
    fetch(`/api/governance/wachtrij?status=${statusFilter}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d: WachtrijItem[]) => setItems(d))
      .catch(() => {})
      .finally(() => setLaden(false));
  }, [statusFilter]);

  useEffect(() => { laadItems(); }, [laadItems]);

  async function voerActieUit() {
    if (!actief || !actie) return;
    setVerwerken(true);
    try {
      const r = await fetch(`/api/governance/wachtrij/${actief.id}/${actie}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opmerking }),
      });
      if (r.ok) {
        setActief(null);
        setActie(null);
        setOpmerking("");
        laadItems();
      }
    } finally {
      setVerwerken(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="wacht">In afwachting</SelectItem>
            <SelectItem value="ter_beoordeling">Ter beoordeling</SelectItem>
            <SelectItem value="goedgekeurd">Goedgekeurd</SelectItem>
            <SelectItem value="afgewezen">Afgewezen</SelectItem>
            <SelectItem value="alle">Alle</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={laadItems}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {laden && (
        <div className="flex items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Laden…</span>
        </div>
      )}

      {!laden && items.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Geen items in de wachtrij.
        </p>
      )}

      {!laden && items.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs py-2">Tijdstip</TableHead>
                <TableHead className="text-xs py-2">Aanvrager</TableHead>
                <TableHead className="text-xs py-2">Methode</TableHead>
                <TableHead className="text-xs py-2">Route</TableHead>
                <TableHead className="text-xs py-2">Risico</TableHead>
                <TableHead className="text-xs py-2">Toelichting</TableHead>
                <TableHead className="text-xs py-2">Status</TableHead>
                <TableHead className="text-xs py-2"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className={item.status === "wacht" ? "bg-red-50" : undefined}>
                  <TableCell className="text-xs py-2 whitespace-nowrap">{formatDatum(item.aangemaaktOp)}</TableCell>
                  <TableCell className="text-xs py-2">{item.checkGebruikerNaam ?? "—"}</TableCell>
                  <TableCell className="text-xs py-2">
                    <Badge variant="secondary" className={`text-[10px] ${METHODE_KLEUR[item.checkMethode] ?? ""}`}>
                      {item.checkMethode}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs py-2 max-w-[180px] truncate font-mono" title={item.checkRoute}>
                    {item.checkRoute}
                  </TableCell>
                  <TableCell className="text-xs py-2">
                    <NiveauBadge niveau={item.checkNiveau} />
                  </TableCell>
                  <TableCell className="text-xs py-2 max-w-[220px]">
                    <span className="text-muted-foreground line-clamp-2">{item.checkMotivatie ?? "—"}</span>
                  </TableCell>
                  <TableCell className="text-xs py-2">
                    {item.status === "wacht" && (
                      <Badge variant="destructive" className="text-[10px]">Geblokkeerd</Badge>
                    )}
                    {item.status === "ter_beoordeling" && (
                      <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700">Ter beoordeling</Badge>
                    )}
                    {item.status === "goedgekeurd" && (
                      <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">Goedgekeurd</Badge>
                    )}
                    {item.status === "afgewezen" && (
                      <Badge variant="outline" className="text-[10px] border-red-300 text-red-700">Afgewezen</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs py-2">
                    {(item.status === "wacht" || item.status === "ter_beoordeling") && (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] text-green-700 border-green-300 hover:bg-green-50"
                          onClick={() => { setActief(item); setActie("goedkeuren"); }}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Akkoord
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] text-red-700 border-red-300 hover:bg-red-50"
                          onClick={() => { setActief(item); setActie("afwijzen"); }}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Afwijzen
                        </Button>
                      </div>
                    )}
                    {item.goedgekeurdDoorNaam && (
                      <span className="text-[10px] text-muted-foreground">{item.goedgekeurdDoorNaam}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Bevestigingsdialoog */}
      <Dialog open={!!actief} onOpenChange={() => { setActief(null); setActie(null); setOpmerking(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actie === "goedkeuren" ? "Actie goedkeuren" : "Actie afwijzen"}
            </DialogTitle>
          </DialogHeader>
          {actief && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted p-3 text-xs space-y-1.5">
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Aanvrager:</span>
                  <span>{actief.checkGebruikerNaam ?? "Onbekend"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Actie:</span>
                  <span className="font-mono">{actief.checkMethode} {actief.checkRoute}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Risico:</span>
                  <NiveauBadge niveau={actief.checkNiveau} />
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Toelichting:</span>
                  <span>{actief.checkMotivatie ?? "—"}</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Opmerking (optioneel)</label>
                <Textarea
                  value={opmerking}
                  onChange={(e) => setOpmerking(e.target.value)}
                  placeholder="Reden voor goedkeuring of afwijzing…"
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setActief(null); setActie(null); setOpmerking(""); }}>
              Annuleren
            </Button>
            <Button
              size="sm"
              variant={actie === "afwijzen" ? "destructive" : "default"}
              disabled={verwerken}
              onClick={() => void voerActieUit()}
            >
              {verwerken ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {actie === "goedkeuren" ? "Goedkeuren" : "Afwijzen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Tab: Audit-log ────────────────────────────────────────────────────────────

function AuditTab() {
  const [checks, setChecks] = useState<GovernanceCheck[]>([]);
  const [laden, setLaden] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [totaalPaginas, setTotaalPaginas] = useState(1);
  const [niveau, setNiveau] = useState("alle");
  const [zoek, setZoek] = useState("");
  const [zoekInvoer, setZoekInvoer] = useState("");

  const laad = useCallback(() => {
    setLaden(true);
    const params = new URLSearchParams({
      pagina: String(pagina),
      ...(niveau !== "alle" && { niveau }),
      ...(zoek && { zoek }),
    });
    fetch(`/api/governance/checks?${params}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d: { checks: GovernanceCheck[]; totaalPaginas: number }) => {
        setChecks(d.checks);
        setTotaalPaginas(d.totaalPaginas);
      })
      .catch(() => {})
      .finally(() => setLaden(false));
  }, [pagina, niveau, zoek]);

  useEffect(() => { laad(); }, [laad]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={niveau} onValueChange={(v) => { setNiveau(v); setPagina(1); }}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Niveau" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle niveaus</SelectItem>
            <SelectItem value="groen">Groen</SelectItem>
            <SelectItem value="geel">Geel</SelectItem>
            <SelectItem value="oranje">Oranje</SelectItem>
            <SelectItem value="rood">Rood</SelectItem>
            <SelectItem value="kritiek">Kritiek</SelectItem>
          </SelectContent>
        </Select>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => { e.preventDefault(); setZoek(zoekInvoer); setPagina(1); }}
        >
          <Input
            value={zoekInvoer}
            onChange={(e) => setZoekInvoer(e.target.value)}
            placeholder="Zoek op route…"
            className="h-8 text-xs w-52"
          />
          <Button type="submit" size="sm" variant="outline">
            <Search className="h-3.5 w-3.5" />
          </Button>
        </form>
        <Button size="sm" variant="ghost" onClick={laad}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {laden ? (
        <div className="flex items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Laden…</span>
        </div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <RecenteChecksTable checks={checks} />
          </div>
          {/* Paginering */}
          {totaalPaginas > 1 && (
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-muted-foreground">Pagina {pagina} van {totaalPaginas}</span>
              <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" disabled={pagina >= totaalPaginas} onClick={() => setPagina((p) => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Hoofdpagina ───────────────────────────────────────────────────────────────

type Tab = "dashboard" | "wachtrij" | "audit";

export default function GovernancePagina() {
  const { rol } = useRol();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [ladenDashboard, setLadenDashboard] = useState(false);

  const laadDashboard = useCallback(() => {
    setLadenDashboard(true);
    fetch("/api/governance/dashboard", { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d: Dashboard) => setDashboard(d))
      .catch(() => {})
      .finally(() => setLadenDashboard(false));
  }, []);

  useEffect(() => {
    if (activeTab === "dashboard") laadDashboard();
  }, [activeTab, laadDashboard]);

  if (rol !== "hoofdbeheerder") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm">Alleen toegankelijk voor de hoofdbeheerder.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/beheer")}>
          Terug
        </Button>
      </div>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "wachtrij", label: dashboard?.wachtrijOpen ? `Wachtrij (${dashboard.wachtrijOpen})` : "Wachtrij" },
    { id: "audit", label: "Audit-log" },
  ];

  return (
    <div className="space-y-5 px-1">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <h1 className="text-lg font-semibold">Governance & Risk Engine</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Centrale risicobeoordeling van iedere schrijfactie in het platform. Kritieke acties worden geblokkeerd en staan ter beoordeling in de wachtrij.
          </p>
        </div>
      </div>

      {/* Tab-navigatie */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab-inhoud */}
      {activeTab === "dashboard" && (
        <DashboardTab data={dashboard} laden={ladenDashboard} opVervers={laadDashboard} />
      )}
      {activeTab === "wachtrij" && <WachtrijTab />}
      {activeTab === "audit" && <AuditTab />}
    </div>
  );
}

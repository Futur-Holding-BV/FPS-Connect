import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ShieldCheck, AlertTriangle, Plus, Wrench, HardHat,
  CheckCircle, XCircle, Clock, ChevronRight, Eye,
  BarChart2, Package, Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useQuery as useListMedewerkers } from "@tanstack/react-query";

// ── Types ───────────────────────────────────────────────────────────────────

interface PbmItem {
  id: number;
  medewerkerId: number | null;
  medewerkerNaam: string | null;
  type: string;
  merk: string | null;
  model: string | null;
  maat: string | null;
  serienummer: string | null;
  uitgifteDatum: string | null;
  vervangingsDatum: string | null;
  garantietermijn: string | null;
  fabrikant: string | null;
  keuringsIntervalMaanden: number | null;
  laatsteControle: string | null;
  status: string;
  fotoPaden: string[];
  opmerkingen: string | null;
  qrCode: string | null;
}

interface Veiligheidsmiddel {
  id: number;
  type: string;
  naam: string;
  merk: string | null;
  serienummer: string | null;
  locatie: string | null;
  eigenaarNaam: string | null;
  keuringsIntervalMaanden: number | null;
  vervangingsDatum: string | null;
  status: string;
  opmerkingen: string | null;
  qrCode: string | null;
}

interface PbmDashboard {
  statistieken: {
    totalePbm: number;
    afgekeurde: number;
    vervangingNodig: number;
    openInspecties: number;
    totalMiddelen: number;
    afgekeurdeMiddelen: number;
  };
  binnenkortVervangen: PbmItem[];
  openInspectiesLijst: unknown[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PBM_TYPES = [
  "veiligheidsschoenen", "helm", "veiligheidsbril", "handschoenen",
  "gehoorbescherming", "adembescherming", "werkkleding",
  "harnas", "vallijn", "positioneringslijn", "overig",
];

const MIDDEL_TYPES = [
  "ladder", "trap", "rolsteiger", "elektrisch gereedschap", "verlengkabel",
  "haspel", "stofzuiger", "laser", "brandblusser", "EHBO-koffer",
  "gasmeetapparaat", "acculader", "hijsmiddel", "overig",
];

const STATUS_CONFIG: Record<string, { label: string; kleur: string }> = {
  actief:        { label: "Actief",     kleur: "bg-green-100 text-green-800" },
  afgekeurd:     { label: "Afgekeurd",  kleur: "bg-red-100 text-red-800" },
  ingenomen:     { label: "Ingenomen",  kleur: "bg-gray-100 text-gray-600" },
  verloren:      { label: "Verloren",   kleur: "bg-orange-100 text-orange-800" },
  in_onderhoud:  { label: "Onderhoud",  kleur: "bg-blue-100 text-blue-800" },
  afgestoten:    { label: "Afgestoten", kleur: "bg-gray-100 text-gray-500" },
};

const SLIJTAGE_CONFIG: Record<string, { label: string; kleur: string }> = {
  geen:    { label: "Geen",   kleur: "bg-green-100 text-green-800" },
  licht:   { label: "Licht",  kleur: "bg-yellow-100 text-yellow-800" },
  matig:   { label: "Matig",  kleur: "bg-orange-100 text-orange-800" },
  ernstig: { label: "Ernstig",kleur: "bg-red-100 text-red-800" },
};

function formatDatum(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function isVervangingBinnenkort(d: string | null | undefined): boolean {
  if (!d) return false;
  return new Date(d) <= new Date(Date.now() + 60 * 86400000);
}

// ── Hoofd-component ──────────────────────────────────────────────────────────

export default function PbmPagina() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("toolbox", 2);

  const [actieveTab, setActieveTab] = useState("dashboard");
  const [zoekterm, setZoekterm] = useState("");
  const [geselecteerdItem, setGeselecteerdItem] = useState<PbmItem | null>(null);
  const [geselecteerdMiddel, setGeselecteerdMiddel] = useState<Veiligheidsmiddel | null>(null);
  const [toonNieuwPbm, setToonNieuwPbm] = useState(false);
  const [toonNieuwMiddel, setToonNieuwMiddel] = useState(false);

  const { data: dashboard } = useQuery<PbmDashboard>({
    queryKey: ["pbm-dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/pbm/dashboard", { credentials: "include" });
      if (!r.ok) return { statistieken: { totalePbm:0, afgekeurde:0, vervangingNodig:0, openInspecties:0, totalMiddelen:0, afgekeurdeMiddelen:0 }, binnenkortVervangen:[], openInspectiesLijst:[] };
      return r.json();
    },
    refetchInterval: 60000,
  });

  const { data: items = [] } = useQuery<PbmItem[]>({
    queryKey: ["pbm-items"],
    queryFn: async () => {
      const r = await fetch("/api/pbm/items", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: middelen = [] } = useQuery<Veiligheidsmiddel[]>({
    queryKey: ["pbm-middelen"],
    queryFn: async () => {
      const r = await fetch("/api/pbm/middelen", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const gefilterdItems = items.filter(i =>
    !zoekterm ||
    i.type.toLowerCase().includes(zoekterm.toLowerCase()) ||
    (i.medewerkerNaam ?? "").toLowerCase().includes(zoekterm.toLowerCase()) ||
    (i.serienummer ?? "").toLowerCase().includes(zoekterm.toLowerCase())
  );

  const gefilterdMiddelen = middelen.filter(m =>
    !zoekterm ||
    m.naam.toLowerCase().includes(zoekterm.toLowerCase()) ||
    m.type.toLowerCase().includes(zoekterm.toLowerCase()) ||
    (m.serienummer ?? "").toLowerCase().includes(zoekterm.toLowerCase())
  );

  const stats = dashboard?.statistieken;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PBM & Veiligheidsbeheer</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Persoonlijke beschermingsmiddelen en veiligheidskritische bedrijfsmiddelen
          </p>
        </div>
        {kanSchrijven && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setToonNieuwMiddel(true)}>
              <Package className="h-4 w-4 mr-1.5" />
              Bedrijfsmiddel
            </Button>
            <Button size="sm" onClick={() => setToonNieuwPbm(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              PBM uitgeven
            </Button>
          </div>
        )}
      </div>

      <Tabs value={actieveTab} onValueChange={setActieveTab}>
        <TabsList>
          <TabsTrigger value="dashboard">
            <BarChart2 className="h-4 w-4 mr-1.5" />
            Dashboard
            {(stats?.afgekeurde ?? 0) + (stats?.vervangingNodig ?? 0) > 0 && (
              <Badge className="ml-2 bg-red-100 text-red-800 text-xs border-0">
                {(stats?.afgekeurde ?? 0) + (stats?.vervangingNodig ?? 0)}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pbm">
            <HardHat className="h-4 w-4 mr-1.5" />
            PBM-items
            <Badge className="ml-2 bg-muted text-muted-foreground text-xs border-0">{items.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="middelen">
            <Package className="h-4 w-4 mr-1.5" />
            Bedrijfsmiddelen
            <Badge className="ml-2 bg-muted text-muted-foreground text-xs border-0">{middelen.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── Dashboard ── */}
        <TabsContent value="dashboard" className="space-y-5 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Totaal PBM", waarde: stats?.totalePbm ?? 0, icoon: HardHat, kleur: "text-muted-foreground" },
              { label: "Afgekeurd",  waarde: stats?.afgekeurde ?? 0, icoon: XCircle, kleur: stats?.afgekeurde ? "text-red-600" : "text-muted-foreground" },
              { label: "Vervanging nodig", waarde: stats?.vervangingNodig ?? 0, icoon: AlertTriangle, kleur: stats?.vervangingNodig ? "text-orange-600" : "text-muted-foreground" },
              { label: "Open inspecties", waarde: stats?.openInspecties ?? 0, icoon: Clock, kleur: stats?.openInspecties ? "text-blue-600" : "text-muted-foreground" },
              { label: "Bedrijfsmiddelen", waarde: stats?.totalMiddelen ?? 0, icoon: Package, kleur: "text-muted-foreground" },
              { label: "Middelen afgekeurd", waarde: stats?.afgekeurdeMiddelen ?? 0, icoon: XCircle, kleur: stats?.afgekeurdeMiddelen ? "text-red-600" : "text-muted-foreground" },
            ].map(({ label, waarde, icoon: Icoon, kleur }) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">{label}</div>
                  <div className={`text-2xl font-bold ${kleur}`}>{waarde}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {(dashboard?.binnenkortVervangen?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Binnenkort vervangen (binnen 60 dagen)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PBM</TableHead>
                      <TableHead>Medewerker</TableHead>
                      <TableHead>Serienummer</TableHead>
                      <TableHead>Vervangingsdatum</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard!.binnenkortVervangen.map(item => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => { setGeselecteerdItem(item); setActieveTab("pbm"); }}
                      >
                        <TableCell className="capitalize font-medium">{item.type}</TableCell>
                        <TableCell>{item.medewerkerNaam ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.serienummer ?? "—"}</TableCell>
                        <TableCell>
                          <span className="text-orange-600 font-medium">{formatDatum(item.vervangingsDatum)}</span>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs border-0 ${STATUS_CONFIG[item.status]?.kleur ?? "bg-muted"}`}>
                            {STATUS_CONFIG[item.status]?.label ?? item.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {stats && stats.totalePbm === 0 && stats.totalMiddelen === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nog geen PBM-items of bedrijfsmiddelen geregistreerd.</p>
              {kanSchrijven && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setToonNieuwPbm(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Eerste PBM uitgeven
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── PBM-items ── */}
        <TabsContent value="pbm" className="space-y-3 mt-4">
          <div className="flex gap-2">
            <Input
              placeholder="Zoek op type, medewerker, serienummer..."
              value={zoekterm}
              onChange={e => setZoekterm(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {gefilterdItems.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {zoekterm ? "Geen resultaten gevonden." : "Nog geen PBM-items."}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Merk / Model</TableHead>
                      <TableHead>Medewerker</TableHead>
                      <TableHead>Uitgiftedatum</TableHead>
                      <TableHead>Vervanging</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gefilterdItems.map(item => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setGeselecteerdItem(item)}
                      >
                        <TableCell className="font-medium capitalize">{item.type}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {[item.merk, item.model].filter(Boolean).join(" ") || "—"}
                        </TableCell>
                        <TableCell>{item.medewerkerNaam ?? "—"}</TableCell>
                        <TableCell className="text-sm">{formatDatum(item.uitgifteDatum)}</TableCell>
                        <TableCell>
                          {item.vervangingsDatum ? (
                            <span className={isVervangingBinnenkort(item.vervangingsDatum) ? "text-orange-600 font-medium" : ""}>
                              {formatDatum(item.vervangingsDatum)}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs border-0 ${STATUS_CONFIG[item.status]?.kleur ?? "bg-muted"}`}>
                            {STATUS_CONFIG[item.status]?.label ?? item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Bedrijfsmiddelen ── */}
        <TabsContent value="middelen" className="space-y-3 mt-4">
          <div className="flex gap-2">
            <Input
              placeholder="Zoek op naam, type, serienummer..."
              value={zoekterm}
              onChange={e => setZoekterm(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {gefilterdMiddelen.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {zoekterm ? "Geen resultaten gevonden." : "Nog geen bedrijfsmiddelen."}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Naam</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Serienummer</TableHead>
                      <TableHead>Locatie</TableHead>
                      <TableHead>Vervanging</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gefilterdMiddelen.map(m => (
                      <TableRow
                        key={m.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setGeselecteerdMiddel(m)}
                      >
                        <TableCell className="font-medium">{m.naam}</TableCell>
                        <TableCell className="text-sm text-muted-foreground capitalize">{m.type}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.serienummer ?? "—"}</TableCell>
                        <TableCell className="text-sm">{m.locatie ?? "—"}</TableCell>
                        <TableCell>
                          {m.vervangingsDatum ? (
                            <span className={isVervangingBinnenkort(m.vervangingsDatum) ? "text-orange-600 font-medium" : ""}>
                              {formatDatum(m.vervangingsDatum)}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs border-0 ${STATUS_CONFIG[m.status]?.kleur ?? "bg-muted"}`}>
                            {STATUS_CONFIG[m.status]?.label ?? m.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Detail PBM-item ── */}
      <Sheet open={!!geselecteerdItem} onOpenChange={o => { if (!o) setGeselecteerdItem(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {geselecteerdItem && (
            <PbmItemDetail
              item={geselecteerdItem}
              kanSchrijven={kanSchrijven}
              onBijgewerkt={() => {
                void qc.invalidateQueries({ queryKey: ["pbm-items"] });
                void qc.invalidateQueries({ queryKey: ["pbm-dashboard"] });
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ── Detail bedrijfsmiddel ── */}
      <Sheet open={!!geselecteerdMiddel} onOpenChange={o => { if (!o) setGeselecteerdMiddel(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {geselecteerdMiddel && (
            <MiddelDetail
              middel={geselecteerdMiddel}
              kanSchrijven={kanSchrijven}
              onBijgewerkt={() => {
                void qc.invalidateQueries({ queryKey: ["pbm-middelen"] });
                void qc.invalidateQueries({ queryKey: ["pbm-dashboard"] });
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ── Nieuw PBM-item ── */}
      <NieuwPbmSheet
        open={toonNieuwPbm}
        onSluit={() => setToonNieuwPbm(false)}
        onAangemaakt={() => {
          void qc.invalidateQueries({ queryKey: ["pbm-items"] });
          void qc.invalidateQueries({ queryKey: ["pbm-dashboard"] });
          setToonNieuwPbm(false);
          toast({ title: "PBM uitgegeven" });
        }}
      />

      {/* ── Nieuw bedrijfsmiddel ── */}
      <NieuwMiddelSheet
        open={toonNieuwMiddel}
        onSluit={() => setToonNieuwMiddel(false)}
        onAangemaakt={() => {
          void qc.invalidateQueries({ queryKey: ["pbm-middelen"] });
          void qc.invalidateQueries({ queryKey: ["pbm-dashboard"] });
          setToonNieuwMiddel(false);
          toast({ title: "Bedrijfsmiddel toegevoegd" });
        }}
      />
    </div>
  );
}

// ── PBM Item Detail ────────────────────────────────────────────────────────

interface PbmItemDetailProps {
  item: PbmItem;
  kanSchrijven: boolean;
  onBijgewerkt: () => void;
}

function PbmItemDetail({ item, kanSchrijven, onBijgewerkt }: PbmItemDetailProps) {
  const { toast } = useToast();
  const [bewerkStatus, setBewerkStatus] = useState(item.status);
  const [bewerkOpm, setBewerkOpm] = useState(item.opmerkingen ?? "");
  const [opslaan, setOpslaan] = useState(false);

  async function slaOp() {
    setOpslaan(true);
    try {
      const r = await fetch(`/api/pbm/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: bewerkStatus, opmerkingen: bewerkOpm }),
      });
      if (!r.ok) throw new Error("Opslaan mislukt");
      toast({ title: "PBM bijgewerkt" });
      onBijgewerkt();
    } catch {
      toast({ title: "Fout bij opslaan", variant: "destructive" });
    } finally {
      setOpslaan(false);
    }
  }

  const ri = [
    ["Type", item.type],
    ["Merk", item.merk],
    ["Model", item.model],
    ["Maat", item.maat],
    ["Serienummer", item.serienummer],
    ["Fabrikant", item.fabrikant],
    ["Uitgifte", formatDatum(item.uitgifteDatum)],
    ["Vervanging", formatDatum(item.vervangingsDatum)],
    ["Garantie", item.garantietermijn],
    ["Keuring elke", item.keuringsIntervalMaanden ? `${item.keuringsIntervalMaanden} maanden` : null],
    ["Laatste controle", formatDatum(item.laatsteControle)],
  ].filter(([, v]) => v && v !== "—");

  return (
    <>
      <SheetHeader className="mb-4">
        <SheetTitle className="capitalize flex items-center gap-2">
          <HardHat className="h-5 w-5" />
          {item.type}
        </SheetTitle>
        <p className="text-sm text-muted-foreground">{item.medewerkerNaam ?? "Niet gekoppeld"}</p>
      </SheetHeader>

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {ri.map(([k, v]) => (
            <div key={k as string}>
              <div className="text-xs text-muted-foreground">{k as string}</div>
              <div className="text-sm font-medium capitalize">{v as string}</div>
            </div>
          ))}
        </div>

        {item.qrCode && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">QR-code</div>
            <code className="text-xs bg-muted px-2 py-1 rounded">{item.qrCode}</code>
          </div>
        )}

        {kanSchrijven && (
          <div className="space-y-3 border-t pt-4">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={bewerkStatus} onValueChange={setBewerkStatus}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Opmerkingen</Label>
              <Textarea
                value={bewerkOpm}
                onChange={e => setBewerkOpm(e.target.value)}
                className="text-sm min-h-16"
              />
            </div>
            <Button size="sm" className="w-full" onClick={() => void slaOp()} disabled={opslaan}>
              {opslaan ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Middel Detail ──────────────────────────────────────────────────────────

interface MiddelDetailProps {
  middel: Veiligheidsmiddel;
  kanSchrijven: boolean;
  onBijgewerkt: () => void;
}

function MiddelDetail({ middel, kanSchrijven, onBijgewerkt }: MiddelDetailProps) {
  const { toast } = useToast();
  const [bewerkStatus, setBewerkStatus] = useState(middel.status);
  const [bewerkOpm, setBewerkOpm] = useState(middel.opmerkingen ?? "");
  const [opslaan, setOpslaan] = useState(false);

  async function slaOp() {
    setOpslaan(true);
    try {
      const r = await fetch(`/api/pbm/middelen/${middel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: bewerkStatus, opmerkingen: bewerkOpm }),
      });
      if (!r.ok) throw new Error("Opslaan mislukt");
      toast({ title: "Bedrijfsmiddel bijgewerkt" });
      onBijgewerkt();
    } catch {
      toast({ title: "Fout bij opslaan", variant: "destructive" });
    } finally {
      setOpslaan(false);
    }
  }

  return (
    <>
      <SheetHeader className="mb-4">
        <SheetTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          {middel.naam}
        </SheetTitle>
        <p className="text-sm text-muted-foreground capitalize">{middel.type}</p>
      </SheetHeader>

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {[
            ["Merk", middel.merk],
            ["Serienummer", middel.serienummer],
            ["Locatie", middel.locatie],
            ["Eigenaar", middel.eigenaarNaam],
            ["Keuring elke", middel.keuringsIntervalMaanden ? `${middel.keuringsIntervalMaanden} mnd` : null],
            ["Vervanging", formatDatum(middel.vervangingsDatum)],
          ].filter(([, v]) => v && v !== "—").map(([k, v]) => (
            <div key={k as string}>
              <div className="text-xs text-muted-foreground">{k as string}</div>
              <div className="text-sm font-medium">{v as string}</div>
            </div>
          ))}
        </div>

        {middel.qrCode && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">QR-code</div>
            <code className="text-xs bg-muted px-2 py-1 rounded">{middel.qrCode}</code>
          </div>
        )}

        {kanSchrijven && (
          <div className="space-y-3 border-t pt-4">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={bewerkStatus} onValueChange={setBewerkStatus}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Opmerkingen</Label>
              <Textarea value={bewerkOpm} onChange={e => setBewerkOpm(e.target.value)} className="text-sm min-h-16" />
            </div>
            <Button size="sm" className="w-full" onClick={() => void slaOp()} disabled={opslaan}>
              {opslaan ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Nieuw PBM Sheet ────────────────────────────────────────────────────────

interface NieuwPbmSheetProps { open: boolean; onSluit: () => void; onAangemaakt: () => void; }

function NieuwPbmSheet({ open, onSluit, onAangemaakt }: NieuwPbmSheetProps) {
  const [type, setType] = useState("");
  const [merk, setMerk] = useState("");
  const [model, setModel] = useState("");
  const [maat, setMaat] = useState("");
  const [serienummer, setSerienummer] = useState("");
  const [medewerkerNaam, setMedewerkerNaam] = useState("");
  const [uitgifteDatum, setUitgifteDatum] = useState(new Date().toISOString().slice(0, 10));
  const [vervangingsDatum, setVervangingsDatum] = useState("");
  const [keuringsInterval, setKeuringsInterval] = useState("");
  const [opmerkingen, setOpmerkingen] = useState("");
  const [bezig, setBezig] = useState(false);
  const { toast } = useToast();

  async function aanmaken() {
    if (!type) { toast({ title: "Type is verplicht", variant: "destructive" }); return; }
    setBezig(true);
    try {
      const r = await fetch("/api/pbm/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type, merk, model, maat, serienummer, medewerkerNaam,
          uitgifteDatum: uitgifteDatum || undefined,
          vervangingsDatum: vervangingsDatum || undefined,
          keuringsIntervalMaanden: keuringsInterval ? Number(keuringsInterval) : undefined,
          opmerkingen,
        }),
      });
      if (!r.ok) throw new Error("Aanmaken mislukt");
      onAangemaakt();
    } catch {
      toast({ title: "Fout bij aanmaken", variant: "destructive" });
    } finally {
      setBezig(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onSluit(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>PBM uitgeven</SheetTitle></SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-1">
            <Label>Type PBM *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="Selecteer type..." /></SelectTrigger>
              <SelectContent>
                {PBM_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Merk</Label><Input value={merk} onChange={e => setMerk(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Model</Label><Input value={model} onChange={e => setModel(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Maat</Label><Input value={maat} onChange={e => setMaat(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Serienummer</Label><Input value={serienummer} onChange={e => setSerienummer(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Medewerker (naam)</Label><Input value={medewerkerNaam} onChange={e => setMedewerkerNaam(e.target.value)} placeholder="Voornaam Achternaam" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Uitgiftedatum</Label><Input type="date" value={uitgifteDatum} onChange={e => setUitgifteDatum(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Vervangingsdatum</Label><Input type="date" value={vervangingsDatum} onChange={e => setVervangingsDatum(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Keuringsinterval (maanden)</Label><Input type="number" value={keuringsInterval} onChange={e => setKeuringsInterval(e.target.value)} placeholder="bijv. 12" /></div>
          <div className="space-y-1"><Label className="text-xs">Opmerkingen</Label><Textarea value={opmerkingen} onChange={e => setOpmerkingen(e.target.value)} className="min-h-16 text-sm" /></div>
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onSluit}>Annuleren</Button>
          <Button onClick={() => void aanmaken()} disabled={bezig}>{bezig ? "Bezig..." : "Uitgeven"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Nieuw Bedrijfsmiddel Sheet ─────────────────────────────────────────────

interface NieuwMiddelSheetProps { open: boolean; onSluit: () => void; onAangemaakt: () => void; }

function NieuwMiddelSheet({ open, onSluit, onAangemaakt }: NieuwMiddelSheetProps) {
  const [type, setType] = useState("");
  const [naam, setNaam] = useState("");
  const [merk, setMerk] = useState("");
  const [serienummer, setSerienummer] = useState("");
  const [locatie, setLocatie] = useState("");
  const [vervangingsDatum, setVervangingsDatum] = useState("");
  const [keuringsInterval, setKeuringsInterval] = useState("");
  const [opmerkingen, setOpmerkingen] = useState("");
  const [bezig, setBezig] = useState(false);
  const { toast } = useToast();

  async function aanmaken() {
    if (!type || !naam) { toast({ title: "Type en naam zijn verplicht", variant: "destructive" }); return; }
    setBezig(true);
    try {
      const r = await fetch("/api/pbm/middelen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type, naam, merk, serienummer, locatie, opmerkingen,
          vervangingsDatum: vervangingsDatum || undefined,
          keuringsIntervalMaanden: keuringsInterval ? Number(keuringsInterval) : undefined,
        }),
      });
      if (!r.ok) throw new Error("Aanmaken mislukt");
      onAangemaakt();
    } catch {
      toast({ title: "Fout bij aanmaken", variant: "destructive" });
    } finally {
      setBezig(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onSluit(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>Bedrijfsmiddel toevoegen</SheetTitle></SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-1">
            <Label>Type *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="Selecteer type..." /></SelectTrigger>
              <SelectContent>
                {MIDDEL_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Naam *</Label><Input value={naam} onChange={e => setNaam(e.target.value)} placeholder="bijv. Ladder 3-delig 6m" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Merk</Label><Input value={merk} onChange={e => setMerk(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Serienummer</Label><Input value={serienummer} onChange={e => setSerienummer(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Locatie / opslag</Label><Input value={locatie} onChange={e => setLocatie(e.target.value)} placeholder="bijv. Magazijn A, rek 3" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Vervangingsdatum</Label><Input type="date" value={vervangingsDatum} onChange={e => setVervangingsDatum(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Keuringsinterval (mnd)</Label><Input type="number" value={keuringsInterval} onChange={e => setKeuringsInterval(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Opmerkingen</Label><Textarea value={opmerkingen} onChange={e => setOpmerkingen(e.target.value)} className="min-h-16 text-sm" /></div>
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onSluit}>Annuleren</Button>
          <Button onClick={() => void aanmaken()} disabled={bezig}>{bezig ? "Bezig..." : "Toevoegen"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

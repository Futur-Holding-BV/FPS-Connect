import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Lock,
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  FileX,
  Link,
  Bot,
  Eye,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScanRecord {
  id: number;
  gebruikerId: number | null;
  gebruikerNaam: string | null;
  uploadBron: string;
  bestandsnaam: string | null;
  bestandsgrootte: number | null;
  mimeTypeClaim: string | null;
  mimeTypeWerkelijk: string | null;
  objectPad: string | null;
  documentId: number | null;
  emailOnderwerp: string | null;
  extensieStatus: string;
  mimeStatus: string;
  structuurStatus: string;
  archiefStatus: string;
  linkStatus: string;
  aiStatus: string;
  clamavStatus: string;
  yaraStatus: string;
  risicoNiveau: string;
  risicoBevindingen: Array<{ categorie: string; beschrijving: string; ernst: string }> | null;
  linksGeanalyseerd: Array<{ url: string; risicoScore: number; risicoNiveau: string; bevindingen: string[] }> | null;
  aiSamenvatting: string | null;
  actie: string;
  blokkeerReden: string | null;
  inQuarantaine: boolean;
  quarantaineReden: string | null;
  beoordeeldDoorNaam: string | null;
  beoordelingOpmerking: string | null;
  beoordeeldOp: string | null;
  aangemaaktOp: string;
}

interface DashboardData {
  vandaag: Record<string, number>;
  quarantainePending: number;
  totaalGeblokkeerd: number;
  recente: ScanRecord[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function niveauKleur(niveau: string) {
  switch (niveau) {
    case "groen": return "bg-green-100 text-green-800 border-green-200";
    case "geel": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "oranje": return "bg-orange-100 text-orange-800 border-orange-200";
    case "rood": return "bg-red-100 text-red-800 border-red-200";
    case "kritiek":
    case "geblokkeerd": return "bg-red-200 text-red-900 border-red-300 font-semibold";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function niveauLabel(niveau: string) {
  const labels: Record<string, string> = {
    groen: "Veilig",
    geel: "Laag risico",
    oranje: "Middel risico",
    rood: "Hoog risico",
    kritiek: "Kritiek",
    geblokkeerd: "Geblokkeerd",
    niet_gescand: "Niet gescand",
    niet_beschikbaar: "Niet beschikbaar",
    quarantaine: "Quarantaine",
    toegestaan: "Toegestaan",
  };
  return labels[niveau] ?? niveau;
}

function actieKleur(actie: string) {
  switch (actie) {
    case "toegestaan": return "bg-green-100 text-green-800";
    case "waarschuwing": return "bg-yellow-100 text-yellow-800";
    case "quarantaine": return "bg-orange-100 text-orange-800";
    case "geblokkeerd": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-700";
  }
}

function ernstKleur(ernst: string) {
  switch (ernst) {
    case "kritiek": return "text-red-700 font-semibold";
    case "hoog": return "text-orange-700 font-medium";
    case "midden": return "text-yellow-700";
    case "laag": return "text-blue-700";
    default: return "text-gray-600";
  }
}

function bronLabel(bron: string) {
  const labels: Record<string, string> = {
    document: "Document",
    email: "E-mail",
    mobiel: "Mobiel",
    api: "API",
    inbox: "Inbox",
    snagstream: "Spotfoto",
  };
  return labels[bron] ?? bron;
}

function formatDatumTijd(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function bestandsgrootte(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Niveau-kaart ──────────────────────────────────────────────────────────────

function NiveauKaart({ label, aantal, niveau, icoon }: {
  label: string;
  aantal: number;
  niveau: string;
  icoon: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-4 flex items-center gap-3 ${niveauKleur(niveau)}`}>
      <div className="text-2xl">{icoon}</div>
      <div>
        <div className="text-2xl font-bold">{aantal}</div>
        <div className="text-sm">{label}</div>
      </div>
    </div>
  );
}

// ── Scan-rij ──────────────────────────────────────────────────────────────────

function ScanRij({ scan, onDetail }: { scan: ScanRecord; onDetail: (s: ScanRecord) => void }) {
  return (
    <tr className="border-b hover:bg-muted/30 text-sm">
      <td className="px-3 py-2 text-muted-foreground">{formatDatumTijd(scan.aangemaaktOp)}</td>
      <td className="px-3 py-2 max-w-[180px] truncate" title={scan.bestandsnaam ?? ""}>
        {scan.bestandsnaam ?? "—"}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{bronLabel(scan.uploadBron)}</td>
      <td className="px-3 py-2 text-muted-foreground">{scan.gebruikerNaam ?? "—"}</td>
      <td className="px-3 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full border ${niveauKleur(scan.risicoNiveau)}`}>
          {niveauLabel(scan.risicoNiveau)}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${actieKleur(scan.actie)}`}>
          {niveauLabel(scan.actie)}
        </span>
      </td>
      <td className="px-3 py-2">
        <button
          onClick={() => onDetail(scan)}
          className="text-primary hover:underline flex items-center gap-1"
        >
          <Eye className="h-3 w-3" />
          Detail
        </button>
      </td>
    </tr>
  );
}

// ── Quarantaine-rij ───────────────────────────────────────────────────────────

function QuarantaineRij({
  item,
  onVrijgeven,
  onWeigeren,
}: {
  item: ScanRecord;
  onVrijgeven: (id: number) => void;
  onWeigeren: (id: number) => void;
}) {
  const isPending = item.inQuarantaine && !item.beoordeeldOp;

  return (
    <tr className="border-b hover:bg-muted/30 text-sm">
      <td className="px-3 py-2 text-muted-foreground">{formatDatumTijd(item.aangemaaktOp)}</td>
      <td className="px-3 py-2 max-w-[180px] truncate font-medium" title={item.bestandsnaam ?? ""}>
        {item.bestandsnaam ?? "—"}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{bronLabel(item.uploadBron)}</td>
      <td className="px-3 py-2 max-w-[200px] truncate text-muted-foreground" title={item.quarantaineReden ?? item.blokkeerReden ?? ""}>
        {item.quarantaineReden ?? item.blokkeerReden ?? "—"}
      </td>
      <td className="px-3 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full border ${niveauKleur(item.risicoNiveau)}`}>
          {niveauLabel(item.risicoNiveau)}
        </span>
      </td>
      <td className="px-3 py-2">
        {isPending ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-green-700 border-green-300 hover:bg-green-50" onClick={() => onVrijgeven(item.id)}>
              <CheckCircle className="h-3 w-3 mr-1" /> Vrijgeven
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-red-700 border-red-300 hover:bg-red-50" onClick={() => onWeigeren(item.id)}>
              <XCircle className="h-3 w-3 mr-1" /> Weigeren
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {item.actie === "toegestaan" ? "Vrijgegeven" : "Geweigerd"} door {item.beoordeeldDoorNaam ?? "?"}
          </span>
        )}
      </td>
    </tr>
  );
}

// ── Detail-dialoog ────────────────────────────────────────────────────────────

function ScanDetailDialoog({ scan, open, onClose }: {
  scan: ScanRecord | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!scan) return null;

  const statusItems = [
    { label: "Extensie", status: scan.extensieStatus, icoon: <FileX className="h-4 w-4" /> },
    { label: "MIME-inhoud", status: scan.mimeStatus, icoon: <Shield className="h-4 w-4" /> },
    { label: "Archief", status: scan.archiefStatus ?? "niet_gescand", icoon: <ShieldAlert className="h-4 w-4" /> },
    { label: "Structuur", status: scan.structuurStatus, icoon: <ShieldAlert className="h-4 w-4" /> },
    { label: "YARA-patronen", status: scan.yaraStatus ?? "niet_gescand", icoon: <ShieldCheck className="h-4 w-4" /> },
    { label: "Antivirus (ClamAV)", status: scan.clamavStatus, icoon: <ShieldCheck className="h-4 w-4" /> },
    { label: "Links", status: scan.linkStatus, icoon: <Link className="h-4 w-4" /> },
    { label: "AI-analyse", status: scan.aiStatus, icoon: <Bot className="h-4 w-4" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Scandetail — {scan.bestandsnaam ?? "onbekend bestand"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Tijdstip:</span> {formatDatumTijd(scan.aangemaaktOp)}</div>
            <div><span className="text-muted-foreground">Bron:</span> {bronLabel(scan.uploadBron)}</div>
            <div><span className="text-muted-foreground">Gebruiker:</span> {scan.gebruikerNaam ?? "—"}</div>
            <div><span className="text-muted-foreground">Grootte:</span> {bestandsgrootte(scan.bestandsgrootte)}</div>
            <div><span className="text-muted-foreground">MIME claim:</span> {scan.mimeTypeClaim ?? "—"}</div>
            <div><span className="text-muted-foreground">MIME gemeten:</span> {scan.mimeTypeWerkelijk ?? "—"}</div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <span className={`px-3 py-1 rounded-full text-sm border font-medium ${niveauKleur(scan.risicoNiveau)}`}>
              {niveauLabel(scan.risicoNiveau)}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm ${actieKleur(scan.actie)}`}>
              Actie: {niveauLabel(scan.actie)}
            </span>
          </div>

          {scan.blokkeerReden && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              <strong>Reden blokkade:</strong> {scan.blokkeerReden}
            </div>
          )}
          {scan.quarantaineReden && scan.actie !== "geblokkeerd" && (
            <div className="rounded-md bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800">
              <strong>Reden quarantaine:</strong> {scan.quarantaineReden}
            </div>
          )}

          <div>
            <div className="text-sm font-medium mb-2">Scanresultaten per categorie</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {statusItems.map((item) => (
                <div key={item.label} className={`rounded-md p-2 text-xs flex items-center gap-2 border ${niveauKleur(item.status)}`}>
                  {item.icoon}
                  <div>
                    <div className="font-medium">{item.label}</div>
                    <div>{niveauLabel(item.status)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {scan.risicoBevindingen && scan.risicoBevindingen.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2">Bevindingen</div>
              <div className="space-y-1">
                {scan.risicoBevindingen.map((b, i) => (
                  <div key={i} className="text-xs flex gap-2 items-start rounded bg-muted/50 px-2 py-1">
                    <AlertTriangle className={`h-3 w-3 mt-0.5 flex-shrink-0 ${ernstKleur(b.ernst)}`} />
                    <div>
                      <span className={`font-medium ${ernstKleur(b.ernst)}`}>[{b.categorie}]</span>{" "}
                      {b.beschrijving}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scan.aiSamenvatting && (
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm">
              <div className="flex items-center gap-1 font-medium text-blue-800 mb-1">
                <Bot className="h-4 w-4" /> AI-inhoudsanalyse
              </div>
              <div className="text-blue-700">{scan.aiSamenvatting}</div>
            </div>
          )}

          {scan.linksGeanalyseerd && scan.linksGeanalyseerd.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2">Geanalyseerde links ({scan.linksGeanalyseerd.length})</div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {scan.linksGeanalyseerd.slice(0, 20).map((l, i) => (
                  <div key={i} className={`text-xs flex items-start gap-2 rounded px-2 py-1 border ${niveauKleur(l.risicoNiveau)}`}>
                    <Link className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate font-mono">{l.url.slice(0, 80)}</div>
                      {l.bevindingen.length > 0 && (
                        <div className="text-muted-foreground">{l.bevindingen.join("; ")}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scan.beoordeeldOp && (
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <strong>Beoordeeld</strong> door {scan.beoordeeldDoorNaam} op {formatDatumTijd(scan.beoordeeldOp)}
              {scan.beoordelingOpmerking && <div className="mt-1 text-muted-foreground">{scan.beoordelingOpmerking}</div>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Sluiten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bevestigingsdialoog ───────────────────────────────────────────────────────

function BevestigingDialoog({
  open,
  titel,
  beschrijving,
  bevestigLabel,
  variant,
  onBevestig,
  onAnnuleer,
}: {
  open: boolean;
  titel: string;
  beschrijving: string;
  bevestigLabel: string;
  variant: "destructive" | "default";
  onBevestig: (opmerking: string) => void;
  onAnnuleer: () => void;
}) {
  const [opmerking, setOpmerking] = useState("");
  return (
    <Dialog open={open} onOpenChange={onAnnuleer}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titel}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{beschrijving}</p>
        <div>
          <Label className="text-sm">Opmerking (optioneel)</Label>
          <Textarea
            value={opmerking}
            onChange={(e) => setOpmerking(e.target.value)}
            placeholder="Reden voor beslissing..."
            className="mt-1"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onAnnuleer}>Annuleren</Button>
          <Button variant={variant} onClick={() => { onBevestig(opmerking); setOpmerking(""); }}>
            {bevestigLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Hoofdpagina ───────────────────────────────────────────────────────────────

export default function SecurityIntakePagina() {
  const queryClient = useQueryClient();
  const [detailScan, setDetailScan] = useState<ScanRecord | null>(null);
  const [vrijgevenId, setVrijgevenId] = useState<number | null>(null);
  const [weigerenId, setWeigerenId] = useState<number | null>(null);
  const [scanZoek, setScanZoek] = useState("");
  const [scanNiveau, setScanNiveau] = useState("");
  const [scanPagina, setScanPagina] = useState(1);
  const [quarantaineStatus, setQuarantaineStatus] = useState("pending");

  const { data: dashboard, refetch: herlaadDashboard } = useQuery<DashboardData>({
    queryKey: ["security-dashboard"],
    queryFn: () => fetch("/api/security/dashboard").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const { data: scansData, refetch: herlaadScans } = useQuery({
    queryKey: ["security-scans", scanZoek, scanNiveau, scanPagina],
    queryFn: () => {
      const params = new URLSearchParams({
        pagina: String(scanPagina),
        ...(scanZoek && { zoek: scanZoek }),
        ...(scanNiveau && { niveau: scanNiveau }),
      });
      return fetch(`/api/security/scans?${params}`).then((r) => r.json()) as Promise<{
        scans: ScanRecord[];
        totaal: number;
        pagina: number;
        perPagina: number;
      }>;
    },
  });

  const { data: quarantaineData, refetch: herlaadQuarantaine } = useQuery({
    queryKey: ["security-quarantaine", quarantaineStatus],
    queryFn: () =>
      fetch(`/api/security/quarantaine?status=${quarantaineStatus}`)
        .then((r) => r.json()) as Promise<{ items: ScanRecord[] }>,
  });

  const vrijgevenMut = useMutation({
    mutationFn: ({ id, opmerking }: { id: number; opmerking: string }) =>
      fetch(`/api/security/quarantaine/${id}/vrijgeven`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opmerking }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-quarantaine"] });
      queryClient.invalidateQueries({ queryKey: ["security-dashboard"] });
      setVrijgevenId(null);
    },
  });

  const weigerenMut = useMutation({
    mutationFn: ({ id, opmerking }: { id: number; opmerking: string }) =>
      fetch(`/api/security/quarantaine/${id}/weigeren`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opmerking }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-quarantaine"] });
      queryClient.invalidateQueries({ queryKey: ["security-dashboard"] });
      setWeigerenId(null);
    },
  });

  const vandaag = dashboard?.vandaag ?? {};
  const totaalVandaag = Object.values(vandaag).reduce((s, n) => s + n, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Beveiliging & Intake
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Centrale beveiligingslaag voor bestanden, e-mails en documentuploads
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { herlaadDashboard(); herlaadScans(); herlaadQuarantaine(); }}>
          <RefreshCw className="h-4 w-4 mr-1" /> Vernieuwen
        </Button>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="quarantaine">
            Quarantaine
            {(dashboard?.quarantainePending ?? 0) > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 min-w-5 px-1 text-xs">
                {dashboard!.quarantainePending}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="audit">Auditlog</TabsTrigger>
          <TabsTrigger value="instellingen">Instellingen</TabsTrigger>
        </TabsList>

        {/* ── Dashboard ── */}
        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <NiveauKaart label="Veilig vandaag" aantal={vandaag.groen ?? 0} niveau="groen" icoon={<ShieldCheck className="h-5 w-5" />} />
            <NiveauKaart label="Laag/middel risico" aantal={(vandaag.geel ?? 0) + (vandaag.oranje ?? 0)} niveau="geel" icoon={<AlertTriangle className="h-5 w-5" />} />
            <NiveauKaart label="Hoog/kritiek risico" aantal={(vandaag.rood ?? 0) + (vandaag.kritiek ?? 0)} niveau="rood" icoon={<ShieldAlert className="h-5 w-5" />} />
            <NiveauKaart label="Geblokkeerd totaal" aantal={dashboard?.totaalGeblokkeerd ?? 0} niveau="geblokkeerd" icoon={<ShieldX className="h-5 w-5" />} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border p-4">
              <div className="text-sm font-medium mb-1 flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-500" /> Quarantaine — wacht op beoordeling
              </div>
              <div className="text-3xl font-bold text-orange-600">{dashboard?.quarantainePending ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Bestanden die handmatige beoordeling vereisen</p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm font-medium mb-1">Totaal gescand vandaag</div>
              <div className="text-3xl font-bold">{totaalVandaag}</div>
              <p className="text-xs text-muted-foreground mt-1">Bestanden, e-mails en documenten</p>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Recente scanactiviteit</div>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Tijdstip</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Bestand</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Bron</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Gebruiker</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Niveau</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Actie</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.recente ?? []).map((s) => (
                    <ScanRij key={s.id} scan={s} onDetail={setDetailScan} />
                  ))}
                  {(dashboard?.recente ?? []).length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nog geen scans vandaag</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── Quarantaine ── */}
        <TabsContent value="quarantaine" className="space-y-4">
          <div className="flex gap-2 items-center">
            <Select value={quarantaineStatus} onValueChange={setQuarantaineStatus}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Wacht op beoordeling</SelectItem>
                <SelectItem value="vrijgegeven">Vrijgegeven</SelectItem>
                <SelectItem value="geweigerd">Geweigerd</SelectItem>
                <SelectItem value="alle">Alle</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Datum</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Bestand</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Bron</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Reden</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Niveau</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Actie</th>
                </tr>
              </thead>
              <tbody>
                {(quarantaineData?.items ?? []).map((item) => (
                  <QuarantaineRij
                    key={item.id}
                    item={item}
                    onVrijgeven={setVrijgevenId}
                    onWeigeren={setWeigerenId}
                  />
                ))}
                {(quarantaineData?.items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                      <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      Geen quarantaine-items in deze categorie
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-md bg-muted/50 border p-3 text-sm text-muted-foreground flex items-start gap-2">
            <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              Vrijgeven kan door beheerders en hoofdbeheerders. Definitief weigeren vereist een hoofdbeheerder.
              Gebruikers zien quarantaine-bestanden niet en kunnen ze niet openen of downloaden.
            </span>
          </div>
        </TabsContent>

        {/* ── Auditlog ── */}
        <TabsContent value="audit" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoek op bestandsnaam, gebruiker..."
                value={scanZoek}
                onChange={(e) => { setScanZoek(e.target.value); setScanPagina(1); }}
                className="pl-8"
              />
            </div>
            <Select value={scanNiveau || "alle"} onValueChange={(v) => { setScanNiveau(v === "alle" ? "" : v); setScanPagina(1); }}>
              <SelectTrigger className="w-40">
                <Filter className="h-4 w-4 mr-1" />
                <SelectValue placeholder="Niveau" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle niveaus</SelectItem>
                <SelectItem value="groen">Veilig</SelectItem>
                <SelectItem value="geel">Laag risico</SelectItem>
                <SelectItem value="oranje">Middel risico</SelectItem>
                <SelectItem value="rood">Hoog risico</SelectItem>
                <SelectItem value="kritiek">Kritiek</SelectItem>
                <SelectItem value="geblokkeerd">Geblokkeerd</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Tijdstip</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Bestand</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Bron</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Gebruiker</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Niveau</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Actie</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(scansData?.scans ?? []).map((s) => (
                  <ScanRij key={s.id} scan={s} onDetail={setDetailScan} />
                ))}
                {(scansData?.scans ?? []).length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Geen scans gevonden</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {scansData && scansData.totaal > scansData.perPagina && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{scansData.totaal} resultaten</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={scanPagina <= 1} onClick={() => setScanPagina((p) => p - 1)}>Vorige</Button>
                <span className="px-2 py-1">Pagina {scanPagina}</span>
                <Button variant="outline" size="sm" disabled={scanPagina * scansData.perPagina >= scansData.totaal} onClick={() => setScanPagina((p) => p + 1)}>Volgende</Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Instellingen ── */}
        <TabsContent value="instellingen" className="space-y-4">
          <div className="rounded-lg border p-4">
            <div className="font-medium mb-3">Beveiligingsmodules</div>
            <div className="space-y-2">
              {[
                { naam: "Extensie-blacklist", status: "actief", beschrijving: "Blokkeert uitvoerbare bestanden (.exe, .bat, .ps1, etc.)" },
                { naam: "Dubbele extensie-detectie", status: "actief", beschrijving: "Detecteert bestanden zoals 'factuur.pdf.exe'" },
                { naam: "MIME-type verificatie", status: "actief", beschrijving: "Controleert magic bytes vs. geclaimd bestandstype" },
                { naam: "PDF-structuuranalyse", status: "actief", beschrijving: "Detecteert embedded JavaScript en Launch-acties in PDF" },
                { naam: "Office macro-detectie", status: "actief", beschrijving: "Detecteert VBA-macro's in Office-documenten" },
                { naam: "Link-analyse", status: "actief", beschrijving: "Analyseert URLs op phishing, URL-verkorters en gevaarlijke downloads" },
                { naam: "AI-inhoudsanalyse", status: "actief", beschrijving: "Analyseert documenttekst op social engineering en verdachte instructies" },
                { naam: "ClamAV antivirus", status: "niet-geconfigureerd", beschrijving: "Optioneel — configureer via CLAMAV_HOST en CLAMAV_PORT omgevingsvariabelen" },
              ].map((module) => (
                <div key={module.naam} className="flex items-start gap-3 py-2 border-b last:border-0">
                  {module.status === "actief"
                    ? <ShieldCheck className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    : <ShieldX className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />}
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2">
                      {module.naam}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${module.status === "actief" ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
                        {module.status === "actief" ? "Actief" : "Niet geconfigureerd"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{module.beschrijving}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md bg-muted/50 border p-3 text-sm text-muted-foreground">
            <div className="font-medium text-foreground mb-1">Microsoft 365 als eerste verdedigingslaag</div>
            FPS Connect heeft altijd een eigen beveiligingslaag, ook wanneer Microsoft 365-filters zijn ingeschakeld.
            Elk bestand, elke e-mail en elk document wordt standaard als onveilig beschouwd totdat het aantoonbaar veilig is bevonden.
          </div>
        </TabsContent>
      </Tabs>

      <ScanDetailDialoog
        scan={detailScan}
        open={detailScan !== null}
        onClose={() => setDetailScan(null)}
      />

      <BevestigingDialoog
        open={vrijgevenId !== null}
        titel="Item vrijgeven"
        beschrijving="Weet je zeker dat dit bestand veilig is en vrijgegeven mag worden? Het bestand wordt daarna zichtbaar en downloadbaar voor bevoegde gebruikers."
        bevestigLabel="Ja, vrijgeven"
        variant="default"
        onBevestig={(opmerking) => vrijgevenId !== null && vrijgevenMut.mutate({ id: vrijgevenId, opmerking })}
        onAnnuleer={() => setVrijgevenId(null)}
      />

      <BevestigingDialoog
        open={weigerenId !== null}
        titel="Item definitief weigeren"
        beschrijving="Het bestand wordt definitief geblokkeerd en verwijderd uit de quarantaine-wachtrij. Deze actie is onomkeerbaar."
        bevestigLabel="Definitief weigeren"
        variant="destructive"
        onBevestig={(opmerking) => weigerenId !== null && weigerenMut.mutate({ id: weigerenId, opmerking })}
        onAnnuleer={() => setWeigerenId(null)}
      />
    </div>
  );
}

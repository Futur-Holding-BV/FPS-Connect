import { useState } from "react";
import { Link } from "wouter";
import {
  useListVoertuigen,
  useListWagenparkAiAdvies,
  useListWagenparkSyncLogs,
  useTriggerWagenparkSync,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Alert, AlertDescription,
} from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Truck, AlertTriangle, Wrench, CheckCircle, RefreshCw,
  ShieldAlert, Sparkles, Search, Plus, Eye, FileInput,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  actief:        "Actief",
  in_onderhoud:  "In onderhoud",
  beschadigd:    "Beschadigd",
  afgestoten:    "Afgestoten",
  gereserveerd:  "Gereserveerd",
};

const STATUS_KLEUR: Record<string, string> = {
  actief:        "bg-green-100 text-green-800",
  in_onderhoud:  "bg-orange-100 text-orange-800",
  beschadigd:    "bg-red-100 text-red-800",
  afgestoten:    "bg-gray-100 text-gray-600",
  gereserveerd:  "bg-blue-100 text-blue-800",
};

const PRIO_KLEUR: Record<string, string> = {
  urgent:  "bg-red-100 text-red-800",
  hoog:    "bg-orange-100 text-orange-800",
  normaal: "bg-yellow-100 text-yellow-800",
  laag:    "bg-gray-100 text-gray-600",
};

function formatDatum(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ══════════════════════════════════════════════════════════
// Pagina
// ══════════════════════════════════════════════════════════

export default function WagenparkPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven  = heeftNiveau("wagenpark", 2);
  const magAanmaken   = heeftNiveau("wagenpark", 3);

  const [zoek,          setZoek]          = useState("");
  const [statusFilter,  setStatusFilter]  = useState<string>("alle");
  const [toonAdvies,    setToonAdvies]    = useState(true);

  const { data: voertuigen = [], isLoading: ladenVoertuigen } = useListVoertuigen(
    { gearchiveerd: false },
  );

  // Gate enabled op UI-niveau — { query: { enabled } } geeft TS2741 (pre-existing)
  const { data: aiAdvies = [] }   = useListWagenparkAiAdvies();
  const { data: syncLogs = [] }   = useListWagenparkSyncLogs({ limit: 1 });
  const sync = useTriggerWagenparkSync();

  // Filters
  const gefilterd = voertuigen.filter((v) => {
    const zoekMatch = !zoek || [v.kenteken, v.merk, v.type].some(
      (s) => s?.toLowerCase().includes(zoek.toLowerCase()),
    );
    const statusMatch = statusFilter === "alle" || v.status === statusFilter;
    return zoekMatch && statusMatch;
  });

  // Stats
  const totaal        = voertuigen.length;
  const aandachtNodig = voertuigen.filter((v) => v.aandacht_nodig).length;
  const inOnderhoud   = voertuigen.filter((v) => v.status === "in_onderhoud").length;
  const actief        = voertuigen.filter((v) => v.status === "actief").length;

  const laatsteSyncLog = syncLogs[0];
  const syncStatus     = laatsteSyncLog?.status ?? null;

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      {/* Privacytekst — altijd zichtbaar */}
      <Alert className="border-blue-200 bg-blue-50">
        <ShieldAlert className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-sm">
          Deze module gebruikt voertuigdata voor wagenparkbeheer, onderhoud, veiligheid, planning
          en administratie. De data is niet bedoeld voor continue personeelscontrole of beoordeling
          van individuele medewerkers.
        </AlertDescription>
      </Alert>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Truck className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Wagenpark</h1>
            <p className="text-sm text-muted-foreground">
              Voertuigen, onderhoud, kosten en Traxgo-koppeling
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {magSchrijven && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => sync.mutate(undefined)}
              disabled={sync.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${sync.isPending ? "animate-spin" : ""}`} />
              Synchroniseren
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/wagenpark/brandstof-import">
              <FileInput className="h-4 w-4 mr-2" />
              Brandstof importeren
            </Link>
          </Button>
          {magAanmaken && (
            <Button asChild size="sm">
              <Link href="/wagenpark/nieuw">
                <Plus className="h-4 w-4 mr-2" />
                Voertuig toevoegen
              </Link>
            </Button>
          )}
        </div>
      </div>

      {sync.isSuccess && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 text-sm">
            Synchronisatie gestart — de data wordt op de achtergrond bijgewerkt.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{totaal}</div>
            <div className="text-sm text-muted-foreground">Voertuigen totaal</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className={`text-2xl font-bold ${actief > 0 ? "text-green-600" : ""}`}>{actief}</div>
            <div className="text-sm text-muted-foreground">Actief</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className={`text-2xl font-bold ${aandachtNodig > 0 ? "text-orange-600" : ""}`}>
              {aandachtNodig}
            </div>
            <div className="text-sm text-muted-foreground">Aandacht nodig</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className={`text-2xl font-bold ${inOnderhoud > 0 ? "text-blue-600" : ""}`}>
              {inOnderhoud}
            </div>
            <div className="text-sm text-muted-foreground">In onderhoud</div>
          </CardContent>
        </Card>
      </div>

      {/* AI-advies — alleen tonen als gebruiker mag schrijven (data al opgehaald) */}
      {magSchrijven && aiAdvies.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-600" />
                <CardTitle className="text-base text-amber-800">
                  AI-conceptadviezen ({aiAdvies.length})
                </CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setToonAdvies(!toonAdvies)}
                className="text-amber-700"
              >
                {toonAdvies ? "Inklappen" : "Uitklappen"}
              </Button>
            </div>
            <p className="text-xs text-amber-700">
              Automatisch gegenereerde voorstellen — een medewerker accordeert altijd.
            </p>
          </CardHeader>
          {toonAdvies && (
            <CardContent className="space-y-2">
              {aiAdvies.slice(0, 8).map((a, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between p-2 rounded bg-amber-50 border border-amber-100"
                >
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="font-medium text-sm">{a.kenteken}</span>
                      <span className="text-muted-foreground text-sm mx-2">—</span>
                      <span className="text-sm">{a.advies}</span>
                      {a.reden && (
                        <div className="text-xs text-muted-foreground mt-0.5">{a.reden}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <Badge className={PRIO_KLEUR[a.prioriteit] ?? ""}>{a.prioriteit}</Badge>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/wagenpark/${a.voertuig_id}`}>
                        <Eye className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
              {aiAdvies.length > 8 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{aiAdvies.length - 8} meer adviezen — bekijk voertuigdetails
                </p>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Zoek op kenteken, merk of type..."
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            <SelectItem value="actief">Actief</SelectItem>
            <SelectItem value="in_onderhoud">In onderhoud</SelectItem>
            <SelectItem value="beschadigd">Beschadigd</SelectItem>
            <SelectItem value="gereserveerd">Gereserveerd</SelectItem>
            <SelectItem value="afgestoten">Afgestoten</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabel */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kenteken</TableHead>
                <TableHead>Voertuig</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Km-stand</TableHead>
                <TableHead>APK</TableHead>
                <TableHead>Verzekering</TableHead>
                <TableHead>Lease eindigt</TableHead>
                <TableHead>Eigendom</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ladenVoertuigen ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Laden...
                  </TableCell>
                </TableRow>
              ) : gefilterd.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <Truck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <div>Geen voertuigen gevonden</div>
                    {magAanmaken && (
                      <Button asChild variant="outline" size="sm" className="mt-3">
                        <Link href="/wagenpark/nieuw">
                          <Plus className="h-4 w-4 mr-2" />
                          Eerste voertuig toevoegen
                        </Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                gefilterd.map((v) => (
                  <TableRow
                    key={v.id}
                    className={v.aandacht_nodig ? "bg-orange-50/40" : ""}
                  >
                    <TableCell className="font-mono font-semibold">
                      <div className="flex items-center gap-2">
                        {v.aandacht_nodig && (
                          <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                        )}
                        {v.kenteken}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{v.merk} {v.type}</div>
                      {v.bouwjaar && (
                        <div className="text-xs text-muted-foreground">{v.bouwjaar}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_KLEUR[v.status] ?? "bg-gray-100 text-gray-700"}>
                        {STATUS_LABELS[v.status] ?? v.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {v.km_stand.toLocaleString("nl-NL")} km
                    </TableCell>
                    <TableCell>
                      {v.apk_datum ? (
                        <span className={
                          new Date(v.apk_datum) < new Date(Date.now() + 30 * 86_400_000)
                            ? "text-orange-600 font-medium"
                            : ""
                        }>
                          {formatDatum(v.apk_datum)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {v.verzekering_verval_dat ? (
                        <span className={
                          new Date(v.verzekering_verval_dat) < new Date(Date.now() + 60 * 86_400_000)
                            ? "text-orange-600 font-medium"
                            : ""
                        }>
                          {formatDatum(v.verzekering_verval_dat)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {v.lease_eind_datum ? (
                        <span className={
                          new Date(v.lease_eind_datum) < new Date(Date.now() + 60 * 86_400_000)
                            ? "text-orange-600 font-medium"
                            : ""
                        }>
                          {formatDatum(v.lease_eind_datum)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="capitalize text-sm text-muted-foreground">
                      {v.eigendoms_type}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/wagenpark/${v.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sync-info */}
      {magSchrijven && (
        <div className="text-xs text-muted-foreground text-right">
          {laatsteSyncLog ? (
            <>
              Laatste sync ({laatsteSyncLog.provider}): {formatDatum(laatsteSyncLog.gestart_op)}
              {" — "}
              <span className={
                syncStatus === "voltooid" ? "text-green-600"
                  : syncStatus === "fout" ? "text-red-600" : ""
              }>
                {syncStatus === "voltooid" ? "Geslaagd"
                  : syncStatus === "fout" ? "Mislukt"
                    : syncStatus ?? "onbekend"}
              </span>
            </>
          ) : (
            "Nog geen synchronisatie uitgevoerd"
          )}
        </div>
      )}
    </div>
  );
}

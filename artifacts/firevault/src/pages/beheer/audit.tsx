import { useState, useEffect, useCallback } from "react";
import { ScrollText, Download, Loader2, ChevronDown, ChevronRight, Search, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface AuditRegel {
  id: number;
  tijdstip: string;
  gebruiker_id: number | null;
  gebruiker_naam: string | null;
  ip_adres: string | null;
  sessie_id: string | null;
  module: string;
  actie: string;
  entiteit: string;
  entiteit_id: number | null;
  entiteit_naam: string | null;
  oude_waarde: Record<string, unknown> | null;
  nieuwe_waarde: Record<string, unknown> | null;
  workflow_status: string | null;
  gebouw_id: number | null;
  medewerker_id: number | null;
  document_id: number | null;
  meta: Record<string, unknown> | null;
}

const LIMIET = 50;

const ACTIE_OPTIES = [
  { waarde: "aanmaken", label: "Aanmaken" },
  { waarde: "bijwerken", label: "Bijwerken" },
  { waarde: "verwijderen", label: "Verwijderen" },
  { waarde: "status_wijzigen", label: "Status wijzigen" },
  { waarde: "inloggen", label: "Inloggen" },
  { waarde: "uitloggen", label: "Uitloggen" },
  { waarde: "exporteren", label: "Exporteren" },
];

function tijdstipLabel(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function actieKleur(actie: string): string {
  switch (actie) {
    case "aanmaken": return "bg-green-100 text-green-800 border-green-200";
    case "verwijderen": return "bg-red-100 text-red-800 border-red-200";
    case "bijwerken": return "bg-blue-100 text-blue-800 border-blue-200";
    case "status_wijzigen": return "bg-amber-100 text-amber-800 border-amber-200";
    case "inloggen": return "bg-purple-100 text-purple-800 border-purple-200";
    case "uitloggen": return "bg-slate-100 text-slate-700 border-slate-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function JsonWeergave({ waarde, label }: { waarde: Record<string, unknown> | null; label: string }) {
  if (!waarde) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <pre className="text-xs bg-muted/50 rounded p-2 overflow-auto max-h-40 border">
        {JSON.stringify(waarde, null, 2)}
      </pre>
    </div>
  );
}

export default function AuditTrailPagina() {
  const [zoek, setZoek] = useState("");
  const [zoekInvoer, setZoekInvoer] = useState("");
  const [module, setModule] = useState("alles");
  const [actie, setActie] = useState("alles");
  const [vanDatum, setVanDatum] = useState("");
  const [totDatum, setTotDatum] = useState("");
  const [pagina, setPagina] = useState(0);
  const [regels, setRegels] = useState<AuditRegel[]>([]);
  const [totaal, setTotaal] = useState(0);
  const [laden, setLaden] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [modules, setModules] = useState<string[]>([]);

  const laadRegels = useCallback(async () => {
    setLaden(true);
    try {
      const params = new URLSearchParams({
        limiet: String(LIMIET),
        offset: String(pagina * LIMIET),
      });
      if (zoek) params.set("zoek", zoek);
      if (module && module !== "alles") params.set("module", module);
      if (actie && actie !== "alles") params.set("actie", actie);
      if (vanDatum) params.set("van_datum", vanDatum);
      if (totDatum) params.set("tot_datum", totDatum);

      const r = await fetch(`/api/audit?${params}`);
      const data = await r.json() as { regels: AuditRegel[]; totaal: number };
      setRegels(data.regels ?? []);
      setTotaal(data.totaal ?? 0);

      const uniekModules = Array.from(new Set(data.regels.map((r) => r.module))).sort();
      setModules((prev) => Array.from(new Set([...prev, ...uniekModules])).sort());
    } catch {
      setRegels([]);
      setTotaal(0);
    } finally {
      setLaden(false);
    }
  }, [zoek, module, actie, vanDatum, totDatum, pagina]);

  useEffect(() => {
    laadRegels();
  }, [laadRegels]);

  function zoekSubmit(e: React.FormEvent) {
    e.preventDefault();
    setZoek(zoekInvoer);
    setPagina(0);
  }

  function filterWijzig(setter: (v: string) => void) {
    return (v: string) => {
      setter(v);
      setPagina(0);
    };
  }

  const aantalPaginas = Math.ceil(totaal / LIMIET);

  const exportUrl = (() => {
    const params = new URLSearchParams();
    if (zoek) params.set("zoek", zoek);
    if (module && module !== "alles") params.set("module", module);
    if (actie && actie !== "alles") params.set("actie", actie);
    if (vanDatum) params.set("van_datum", vanDatum);
    if (totDatum) params.set("tot_datum", totDatum);
    return `/api/audit/export?${params}`;
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary p-2 rounded-lg">
          <ScrollText className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit trail</h1>
          <p className="text-sm text-muted-foreground">
            Volledige geschiedenis van alle wijzigingen — {totaal.toLocaleString("nl-NL")} regels
          </p>
        </div>
        <div className="ml-auto">
          <Button variant="outline" size="sm" asChild>
            <a href={exportUrl} download>
              <Download className="h-4 w-4 mr-2" />
              Exporteren
            </a>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <form onSubmit={zoekSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Zoek op gebruiker, module of entiteit..."
                value={zoekInvoer}
                onChange={(e) => setZoekInvoer(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary" size="default">
              <Filter className="h-4 w-4 mr-2" />
              Zoeken
            </Button>
          </form>

          <div className="flex flex-wrap gap-2">
            <Select value={module} onValueChange={filterWijzig(setModule)}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="Alle modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alles">Alle modules</SelectItem>
                {modules.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={actie} onValueChange={filterWijzig(setActie)}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="Alle acties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alles">Alle acties</SelectItem>
                {ACTIE_OPTIES.map((o) => (
                  <SelectItem key={o.waarde} value={o.waarde}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Van</span>
              <Input
                type="date"
                className="w-36 h-8 text-sm"
                value={vanDatum}
                onChange={(e) => { setVanDatum(e.target.value); setPagina(0); }}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Tot</span>
              <Input
                type="date"
                className="w-36 h-8 text-sm"
                value={totDatum}
                onChange={(e) => { setTotDatum(e.target.value); setPagina(0); }}
              />
            </div>

            {(zoek || (module && module !== "alles") || (actie && actie !== "alles") || vanDatum || totDatum) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-muted-foreground"
                onClick={() => {
                  setZoek(""); setZoekInvoer(""); setModule("alles");
                  setActie("alles"); setVanDatum(""); setTotDatum(""); setPagina(0);
                }}
              >
                Wissen
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {laden ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : regels.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Geen audit-regels gevonden voor deze filters
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-4" />
                  <TableHead>Tijdstip</TableHead>
                  <TableHead>Gebruiker</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Actie</TableHead>
                  <TableHead>Entiteit</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regels.map((r) => {
                  const open = expandedId === r.id;
                  const heeftDetails = r.oude_waarde || r.nieuwe_waarde || r.workflow_status || r.meta;
                  return (
                    <>
                      <TableRow
                        key={r.id}
                        className={heeftDetails ? "cursor-pointer hover:bg-muted/40" : ""}
                        onClick={() => heeftDetails && setExpandedId(open ? null : r.id)}
                      >
                        <TableCell className="pr-0">
                          {heeftDetails ? (
                            open
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap font-mono">
                          {tijdstipLabel(r.tijdstip)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.gebruiker_naam ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs bg-secondary px-1.5 py-0.5 rounded font-mono">
                            {r.module}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs border px-1.5 py-0.5 rounded font-medium ${actieKleur(r.actie)}`}>
                            {r.actie}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.entiteit_naam ?? r.entiteit}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {r.entiteit_id ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {r.ip_adres ?? "—"}
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow key={`${r.id}-detail`} className="bg-muted/20">
                          <TableCell />
                          <TableCell colSpan={7} className="py-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <JsonWeergave waarde={r.oude_waarde} label="Oude waarde" />
                              <JsonWeergave waarde={r.nieuwe_waarde} label="Nieuwe waarde" />
                              {r.workflow_status && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Workflow status</p>
                                  <Badge variant="outline">{r.workflow_status}</Badge>
                                </div>
                              )}
                              {r.meta && (
                                <JsonWeergave waarde={r.meta} label="Metadata" />
                              )}
                              {(r.gebouw_id || r.medewerker_id || r.document_id) && (
                                <div className="flex gap-2 flex-wrap">
                                  {r.gebouw_id && (
                                    <span className="text-xs text-muted-foreground">
                                      Gebouw: <span className="font-mono">{r.gebouw_id}</span>
                                    </span>
                                  )}
                                  {r.medewerker_id && (
                                    <span className="text-xs text-muted-foreground">
                                      Medewerker: <span className="font-mono">{r.medewerker_id}</span>
                                    </span>
                                  )}
                                  {r.document_id && (
                                    <span className="text-xs text-muted-foreground">
                                      Document: <span className="font-mono">{r.document_id}</span>
                                    </span>
                                  )}
                                </div>
                              )}
                              {r.sessie_id && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Sessie</p>
                                  <span className="text-xs font-mono text-muted-foreground">{r.sessie_id}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {aantalPaginas > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {pagina + 1} van {aantalPaginas} ({totaal.toLocaleString("nl-NL")} regels)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina === 0}
              onClick={() => setPagina((p) => p - 1)}
            >
              Vorige
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina >= aantalPaginas - 1}
              onClick={() => setPagina((p) => p + 1)}
            >
              Volgende
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import {
  Bot, Loader2, Filter, Euro, Zap, Clock, CheckCircle2, XCircle,
  ShieldAlert, ChevronDown, ChevronUp, FileText, Info,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useListAiAanroepen } from "@workspace/api-client-react";
import type { AiAanroepLog } from "@workspace/api-client-react";

const STATUS_OPTIES = [
  { waarde: "ok", label: "Geslaagd" },
  { waarde: "fout", label: "Mislukt" },
  { waarde: "timeout", label: "Time-out" },
];

const MODULE_OPTIES = [
  "document",
  "factuur",
  "gebouw",
  "bibliotheek",
  "offerte",
  "personeel",
  "spot",
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

function kostenLabel(kosten: string | null | undefined): string {
  if (!kosten) return "—";
  const num = parseFloat(kosten);
  if (isNaN(num)) return "—";
  return `\u20ac ${num.toFixed(4)}`;
}

function tokensLabel(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("nl-NL");
}

function duurLabel(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="h-3 w-3" />
        Geslaagd
      </span>
    );
  }
  if (status === "timeout") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
        <Clock className="h-3 w-3" />
        Time-out
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
      <XCircle className="h-3 w-3" />
      Mislukt
    </span>
  );
}

function vandaagMin30Dagen(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function vandaag(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Context-weergave ──────────────────────────────────────────────────────────

const CONTEXT_LABELS: Record<string, string> = {
  workflow_type:    "Workflow",
  workflow_status:  "Status",
  gebouw_id:        "Gebouw-ID",
  project_id:       "Project-ID",
  klant_id:         "Klant-ID",
  offerte_id:       "Offerte-ID",
  calculatie_id:    "Calculatie-ID",
  document_id:      "Document-ID",
  voorziening_id:   "Spot-ID",
  medewerker_id:    "Medewerker-ID",
  planning_item_id: "Werkorder-ID",
};

const CONTEXTBRON_TYPE_LABELS: Record<string, string> = {
  workflow:        "Workflow",
  document:        "Document",
  rag:             "Kennisbase",
  kennisbron:      "Kennisbron",
  auditlog:        "Audittrail",
  gebruikersinput: "Gebruikersinvoer",
};

function ContextWeergave({ contextJson }: { contextJson: Record<string, unknown> | null | undefined }) {
  if (!contextJson) {
    return <p className="text-sm text-muted-foreground">Geen context opgeslagen.</p>;
  }

  const businessvelden = Object.entries(contextJson).filter(
    ([k]) => k !== "contextBronnen" && contextJson[k] != null,
  );
  const contextBronnen = Array.isArray(contextJson.contextBronnen)
    ? (contextJson.contextBronnen as Array<{ type: string; label?: string }>)
    : [];

  if (businessvelden.length === 0 && contextBronnen.length === 0) {
    return <p className="text-sm text-muted-foreground">Context is leeg.</p>;
  }

  return (
    <div className="space-y-4">
      {businessvelden.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Gekoppelde entiteiten
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {businessvelden.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-xs text-muted-foreground">{CONTEXT_LABELS[k] ?? k}</dt>
                <dd className="text-xs font-mono">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {contextBronnen.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Contextbronnen ({contextBronnen.length})
          </p>
          <ul className="space-y-1">
            {contextBronnen.map((bron, i) => (
              <li key={i} className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-normal shrink-0">
                  {CONTEXTBRON_TYPE_LABELS[bron.type] ?? bron.type}
                </Badge>
                {bron.label && (
                  <span className="text-xs text-muted-foreground truncate">{bron.label}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Voorstel-weergave ─────────────────────────────────────────────────────────

function VoorstelWeergave({ tekst }: { tekst: string | null | undefined }) {
  const [uitgevouwen, setUitgevouwen] = useState(false);

  if (!tekst) {
    return <p className="text-sm text-muted-foreground">Geen voorstel opgeslagen (aanroep vóór logging-update of mislukt).</p>;
  }

  const drempel = 600;
  const ingekort = !uitgevouwen && tekst.length > drempel;
  const weergave = ingekort ? tekst.slice(0, drempel) + "…" : tekst;

  return (
    <div>
      <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/50 rounded-md p-3 border max-h-96 overflow-y-auto">
        {weergave}
      </pre>
      {tekst.length > drempel && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-7 text-xs text-muted-foreground"
          onClick={() => setUitgevouwen((v) => !v)}
        >
          {uitgevouwen
            ? <><ChevronUp className="h-3 w-3 mr-1" />Minder tonen</>
            : <><ChevronDown className="h-3 w-3 mr-1" />Meer tonen ({tekst.length.toLocaleString("nl-NL")} tekens)</>
          }
        </Button>
      )}
    </div>
  );
}

// ── Detail-drawer ─────────────────────────────────────────────────────────────

function AanroepDetail({ item, open, onClose }: {
  item: AiAanroepLog | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {item && (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                AI-aanroep detail
              </SheetTitle>
            </SheetHeader>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="text-muted-foreground">Tijdstip</div>
                <div className="font-mono text-xs">{tijdstipLabel(item.aangemaakt_op)}</div>

                <div className="text-muted-foreground">Module</div>
                <div>
                  <Badge variant="secondary" className="font-mono text-xs">{item.module}</Badge>
                </div>

                <div className="text-muted-foreground">Functie</div>
                <div className="text-xs">{item.functie ?? "—"}</div>

                <div className="text-muted-foreground">Model</div>
                <div className="font-mono text-xs">{item.model_naam}</div>

                <div className="text-muted-foreground">Tokens</div>
                <div className="font-mono text-xs">
                  {tokensLabel(item.total_tokens)}
                  {item.prompt_tokens != null && item.completion_tokens != null && (
                    <span className="text-muted-foreground ml-1">
                      ({tokensLabel(item.prompt_tokens)} in / {tokensLabel(item.completion_tokens)} uit)
                    </span>
                  )}
                </div>

                <div className="text-muted-foreground">Kosten</div>
                <div className="font-mono text-xs">{kostenLabel(item.geschatte_kosten_eur)}</div>

                <div className="text-muted-foreground">Duur</div>
                <div className="font-mono text-xs">{duurLabel(item.duur_ms)}</div>

                <div className="text-muted-foreground">Status</div>
                <div><StatusBadge status={item.status} /></div>

                {item.foutmelding && (
                  <>
                    <div className="text-muted-foreground">Foutmelding</div>
                    <div className="text-xs text-red-600 font-mono break-all">{item.foutmelding}</div>
                  </>
                )}

                {item.prompt_naam && (
                  <>
                    <div className="text-muted-foreground">Prompt</div>
                    <div className="text-xs font-mono">
                      {item.prompt_naam}
                      {item.prompt_versie && <span className="text-muted-foreground ml-1">v{item.prompt_versie}</span>}
                    </div>
                  </>
                )}
              </div>

              <hr />

              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Gebruikte context</span>
                </div>
                <ContextWeergave contextJson={item.context_json as Record<string, unknown> | null} />
              </div>

              <hr />

              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">AI-voorstel (ruwe uitvoer)</span>
                </div>
                <VoorstelWeergave tekst={item.uitvoer_tekst} />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Hoofdpagina ───────────────────────────────────────────────────────────────

export default function AiAanroepenPagina() {
  const { gebruiker } = useAuth();
  const isHoofdBeheerder = gebruiker?.rol === "hoofdbeheerder";

  const [pagina, setPagina] = useState(1);
  const [module, setModule] = useState("alles");
  const [status, setStatus] = useState("alles");
  const [vanDatum, setVanDatum] = useState(vandaagMin30Dagen());
  const [totDatum, setTotDatum] = useState(vandaag());
  const [geselecteerd, setGeselecteerd] = useState<AiAanroepLog | null>(null);

  const params = {
    pagina,
    per_pagina: 50,
    ...(module !== "alles" ? { module } : {}),
    ...(status !== "alles" ? { status } : {}),
    ...(vanDatum ? { van_datum: vanDatum } : {}),
    ...(totDatum ? { tot_datum: totDatum } : {}),
  };

  const { data, isLoading } = useListAiAanroepen(params);

  const items = data?.items ?? [];
  const totaal = data?.totaal ?? 0;
  const totaleKosten = data?.totale_kosten_eur;
  const aantalPaginas = Math.ceil(totaal / 50);

  function filterWijzig(setter: (v: string) => void) {
    return (v: string) => {
      setter(v);
      setPagina(1);
    };
  }

  function resetFilters() {
    setModule("alles");
    setStatus("alles");
    setVanDatum(vandaagMin30Dagen());
    setTotDatum(vandaag());
    setPagina(1);
  }

  const heeftActieveFilters =
    module !== "alles" ||
    status !== "alles" ||
    vanDatum !== vandaagMin30Dagen() ||
    totDatum !== vandaag();

  const totaleKostenNum = totaleKosten ? parseFloat(totaleKosten) : null;

  if (!isHoofdBeheerder) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">
          Alleen beschikbaar voor hoofdbeheerders.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary p-2 rounded-lg">
          <Bot className="h-6 w-6" />
        </div>
        <div>
          <h1 data-paginatitel className="text-2xl font-bold tracking-tight">AI-aanroeplogging</h1>
          <p className="text-sm text-muted-foreground">
            Overzicht van AI-aanroepen, gebruikte context en voorstellen
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-primary/10 text-primary p-2 rounded-lg shrink-0">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Aanroepen (gefilterd)</p>
              <p className="text-2xl font-bold">{totaal.toLocaleString("nl-NL")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-amber-100 text-amber-700 p-2 rounded-lg shrink-0">
              <Euro className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Geschatte kosten (gefilterd)</p>
              <p className="text-2xl font-bold">
                {totaleKostenNum != null
                  ? `\u20ac ${totaleKostenNum.toFixed(4)}`
                  : isLoading ? "..." : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-blue-100 text-blue-700 p-2 rounded-lg shrink-0">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gem. duur (huidige pagina)</p>
              <p className="text-2xl font-bold">
                {items.length > 0 && items.some((i) => i.duur_ms != null)
                  ? (() => {
                      const metDuur = items.filter((i) => i.duur_ms != null);
                      const gem = metDuur.reduce((s, i) => s + (i.duur_ms ?? 0), 0) / metDuur.length;
                      return gem < 1000 ? `${Math.round(gem)} ms` : `${(gem / 1000).toFixed(1)} s`;
                    })()
                  : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={module} onValueChange={filterWijzig(setModule)}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="Alle modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alles">Alle modules</SelectItem>
                {MODULE_OPTIES.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={filterWijzig(setStatus)}>
              <SelectTrigger className="w-40 h-8 text-sm">
                <SelectValue placeholder="Alle statussen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alles">Alle statussen</SelectItem>
                {STATUS_OPTIES.map((o) => (
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
                onChange={(e) => { setVanDatum(e.target.value); setPagina(1); }}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Tot</span>
              <Input
                type="date"
                className="w-36 h-8 text-sm"
                value={totDatum}
                onChange={(e) => { setTotDatum(e.target.value); setPagina(1); }}
              />
            </div>

            {heeftActieveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-muted-foreground"
                onClick={resetFilters}
              >
                Wissen
              </Button>
            )}

            <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Filter className="h-3 w-3" />
              {totaal.toLocaleString("nl-NL")} resultaten
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Geen AI-aanroepen gevonden voor deze filters
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Tijdstip</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Functie</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Kosten (EUR)</TableHead>
                    <TableHead className="text-right">Duur</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Context</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => {
                    const heeftContext = !!r.context_json;
                    const heeftVoorstel = !!r.uitvoer_tekst;
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setGeselecteerd(r)}
                        title="Klik voor context en voorstel"
                      >
                        <TableCell className="text-xs whitespace-nowrap font-mono">
                          {tijdstipLabel(r.aangemaakt_op)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-xs">
                            {r.module}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.functie ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {r.model_naam}
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">
                          {tokensLabel(r.total_tokens)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">
                          {kostenLabel(r.geschatte_kosten_eur)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">
                          {duurLabel(r.duur_ms)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1">
                            {heeftContext && (
                              <span
                                className="inline-flex items-center text-xs text-blue-600"
                                title="Context beschikbaar"
                              >
                                <Info className="h-3 w-3" />
                              </span>
                            )}
                            {heeftVoorstel && (
                              <span
                                className="inline-flex items-center text-xs text-green-600"
                                title="Voorstel beschikbaar"
                              >
                                <FileText className="h-3 w-3" />
                              </span>
                            )}
                            {!heeftContext && !heeftVoorstel && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {aantalPaginas > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {pagina} van {aantalPaginas} ({totaal.toLocaleString("nl-NL")} aanroepen)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina === 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              Vorige
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina >= aantalPaginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Volgende
            </Button>
          </div>
        </div>
      )}

      <AanroepDetail
        item={geselecteerd}
        open={!!geselecteerd}
        onClose={() => setGeselecteerd(null)}
      />
    </div>
  );
}

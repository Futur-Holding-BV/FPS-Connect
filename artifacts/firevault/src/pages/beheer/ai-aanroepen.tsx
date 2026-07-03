import { useState } from "react";
import { Bot, Loader2, Filter, Euro, Zap, Clock, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
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
import { useListAiAanroepen } from "@workspace/api-client-react";

const STATUS_OPTIES = [
  { waarde: "ok", label: "Geslaagd" },
  { waarde: "error", label: "Mislukt" },
];

const MODULE_OPTIES = [
  "gebouw",
  "spot",
  "document",
  "bibliotheek",
  "offerte",
  "personeel",
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
  return `€ ${num.toFixed(4)}`;
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

export default function AiAanroepenPagina() {
  const { gebruiker } = useAuth();
  const isHoofdBeheerder = gebruiker?.rol === "hoofdbeheerder";

  const [pagina, setPagina] = useState(1);
  const [module, setModule] = useState("alles");
  const [status, setStatus] = useState("alles");
  const [vanDatum, setVanDatum] = useState(vandaagMin30Dagen());
  const [totDatum, setTotDatum] = useState(vandaag());

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
          <h1 className="text-2xl font-bold tracking-tight">AI-aanroeplogging</h1>
          <p className="text-sm text-muted-foreground">
            Overzicht van AI-aanroepen, tokenverbruik en geschatte kosten
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
                  ? `€ ${totaleKostenNum.toFixed(4)}`
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id} title={r.foutmelding ?? undefined}>
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
                    </TableRow>
                  ))}
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
    </div>
  );
}

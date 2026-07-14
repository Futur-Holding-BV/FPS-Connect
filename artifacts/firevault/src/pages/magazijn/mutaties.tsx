import { useState } from "react";
import { useListVoorraadMutaties, useListArtikelen, useListOpdrachten, useExporteerMagazijnMutatie, useBatchExportMagazijnMutaties } from "@workspace/api-client-react";
import type { VoorraadMutatie } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Minus, Upload, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { PaginaHulp } from "@/components/pagina-hulp";
import { getListVoorraadMutatiesQueryKey } from "@workspace/api-client-react";

const TYPE_LABELS: Record<string, string> = {
  inkoop: "Inkoop",
  uitgifte: "Uitgifte",
  retour: "Retour",
  correctie: "Correctie",
  reservering: "Reservering",
  vrijgave: "Vrijgave",
};

const TYPE_KLEUR: Record<string, string> = {
  inkoop: "bg-green-100 text-green-800",
  uitgifte: "bg-red-100 text-red-800",
  retour: "bg-blue-100 text-blue-800",
  correctie: "bg-amber-100 text-amber-800",
  reservering: "bg-purple-100 text-purple-800",
  vrijgave: "bg-gray-100 text-gray-700",
};

function formatDatum(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatDatumKort(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function vandaagISO() {
  return new Date().toISOString().slice(0, 10);
}

function dertigDagenTerugISO() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default function MagazijnMutatiesPagina() {
  const queryClient = useQueryClient();
  const [filterArtikel, setFilterArtikel] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterOpdracht, setFilterOpdracht] = useState("");
  const [batchVan, setBatchVan] = useState(dertigDagenTerugISO);
  const [batchTot, setBatchTot] = useState(vandaagISO);
  const [batchResultaat, setBatchResultaat] = useState<null | { geslaagd: number; mislukt: number; overgeslagen: number; totaal: number; regels: Array<{ mutatie_id: number; geslaagd: boolean; foutmelding?: string | null }> }>(null);
  const [batchFout, setBatchFout] = useState<string | null>(null);
  const [exportFouten, setExportFouten] = useState<Record<number, string>>({});

  const { data: artikelenData } = useListArtikelen();
  const artikelen = artikelenData ?? [];

  const { data: opdrachtenData } = useListOpdrachten();
  const opdrachten = opdrachtenData ?? [];

  const queryParams = {
    artikel_id: filterArtikel ? Number(filterArtikel) : undefined,
    type: filterType || undefined,
    opdracht_id: filterOpdracht ? Number(filterOpdracht) : undefined,
    limit: 200,
  };

  const { data: mutaties = [], isLoading } = useListVoorraadMutaties(queryParams, {
    query: { queryKey: getListVoorraadMutatiesQueryKey(queryParams) },
  });

  const exportMut = useExporteerMagazijnMutatie({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListVoorraadMutatiesQueryKey(queryParams) }),
    },
  });

  const batchMut = useBatchExportMagazijnMutaties({
    mutation: {
      onSuccess: (data) => {
        setBatchResultaat({ geslaagd: data.geslaagd, mislukt: data.mislukt, overgeslagen: data.overgeslagen, totaal: data.totaal, regels: data.regels });
        setBatchFout(null);
        queryClient.invalidateQueries({ queryKey: getListVoorraadMutatiesQueryKey(queryParams) });
      },
      onError: (err) => {
        setBatchFout((err as Error).message ?? "Batch-export mislukt");
        setBatchResultaat(null);
      },
    },
  });

  async function exporteerEnkelvoudig(mutatieId: number) {
    setExportFouten((f) => { const n = { ...f }; delete n[mutatieId]; return n; });
    try {
      await exportMut.mutateAsync({ id: mutatieId });
    } catch (err) {
      const msg = (err as Record<string, unknown>)?.message as string ?? "Export mislukt";
      setExportFouten((f) => ({ ...f, [mutatieId]: msg }));
    }
  }

  function startBatchExport() {
    setBatchResultaat(null);
    setBatchFout(null);
    batchMut.mutate({ data: { van_datum: batchVan, tot_datum: batchTot } });
  }

  return (
    <div className="p-6 space-y-4">
      <PaginaHulp pagina="magazijn-mutaties" />
      <h1 className="text-2xl font-bold">Mutaties</h1>

      {/* Batch-export blok */}
      <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-3">
        <p className="text-sm font-medium">Batch-export naar AccountView</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Van datum</Label>
            <Input
              type="date"
              className="w-36 text-sm"
              value={batchVan}
              onChange={(e) => setBatchVan(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tot datum</Label>
            <Input
              type="date"
              className="w-36 text-sm"
              value={batchTot}
              onChange={(e) => setBatchTot(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={startBatchExport}
            disabled={batchMut.isPending}
          >
            {batchMut.isPending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Bezig...</>
              : <><Upload className="h-3.5 w-3.5 mr-1.5" />Batch exporteren</>
            }
          </Button>
        </div>
        {batchResultaat && (
          <div className="space-y-2">
            <div className={cn("flex items-center gap-2 text-sm", batchResultaat.mislukt > 0 ? "text-amber-700" : "text-green-700")}>
              {batchResultaat.mislukt > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {batchResultaat.totaal === 0
                ? "Geen nieuwe mutaties om te exporteren."
                : `${batchResultaat.geslaagd} van ${batchResultaat.totaal} mutaties geëxporteerd${batchResultaat.mislukt > 0 ? `, ${batchResultaat.mislukt} mislukt` : ""}${batchResultaat.overgeslagen > 0 ? `, ${batchResultaat.overgeslagen} overgeslagen` : ""}.`
              }
            </div>
            {batchResultaat.regels.filter(r => !r.geslaagd && r.foutmelding).map(r => (
              <div key={r.mutatie_id} className="flex items-start gap-1.5 text-xs text-red-700 pl-1">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span><span className="font-medium">Mutatie #{r.mutatie_id}:</span> {r.foutmelding}</span>
              </div>
            ))}
          </div>
        )}
        {batchFout && (
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" />
            {batchFout}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterArtikel || "__alle__"} onValueChange={v => setFilterArtikel(v === "__alle__" ? "" : v)}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Alle artikelen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__alle__">Alle artikelen</SelectItem>
            {artikelen.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.naam}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType || "__alle__"} onValueChange={v => setFilterType(v === "__alle__" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Alle types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__alle__">Alle types</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterOpdracht || "__alle__"} onValueChange={v => setFilterOpdracht(v === "__alle__" ? "" : v)}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Alle opdrachten" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__alle__">Alle opdrachten</SelectItem>
            {opdrachten.map(o => (
              <SelectItem key={o.id} value={String(o.id)}>
                {o.titel}{o.werknummer ? ` (${o.werknummer})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-hidden bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left py-2.5 px-4">Datum</th>
              <th className="text-left py-2.5 px-4">Type</th>
              <th className="text-left py-2.5 px-4">Artikel</th>
              <th className="text-right py-2.5 px-4">Hoeveelheid</th>
              <th className="text-right py-2.5 px-4">Delta</th>
              <th className="text-left py-2.5 px-4">Opdracht</th>
              <th className="text-left py-2.5 px-4">Omschrijving</th>
              <th className="text-center py-2.5 px-4">AccountView</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="py-3 px-4" colSpan={8}><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))
            ) : mutaties.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-muted-foreground">
                  Geen mutaties gevonden.
                </td>
              </tr>
            ) : (
              mutaties.map(m => {
                const isExporting = exportMut.isPending && exportMut.variables?.id === m.id;
                const exportFout = exportFouten[m.id];
                const geexporteerd = !!(m as VoorraadMutatie & { accountview_export_op?: string | null }).accountview_export_op;
                return (
                  <tr key={m.id} className="border-b hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-4 text-muted-foreground text-xs">{formatDatum(m.aangemaakt_op)}</td>
                    <td className="py-2.5 px-4">
                      <Badge className={cn("text-xs", TYPE_KLEUR[m.type] ?? "bg-gray-100")}>
                        {TYPE_LABELS[m.type] ?? m.type}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-4 font-medium">{m.artikel_naam ?? `#${m.artikel_id}`}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{m.hoeveelheid}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      <span className={cn("flex items-center justify-end gap-1", m.delta > 0 ? "text-green-700" : m.delta < 0 ? "text-red-700" : "text-muted-foreground")}>
                        {m.delta > 0 ? <ArrowUp className="h-3 w-3" /> : m.delta < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                        {m.delta > 0 ? "+" : ""}{m.delta}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-muted-foreground">
                      {m.opdracht_titel ?? (m.opdracht_id ? `#${m.opdracht_id}` : "—")}
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground text-xs">{m.omschrijving ?? "—"}</td>
                    <td className="py-2.5 px-4 text-center">
                      {geexporteerd ? (
                        <span className="flex flex-col items-center gap-0.5">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="text-[10px] text-muted-foreground">
                            {formatDatumKort((m as VoorraadMutatie & { accountview_export_op?: string | null }).accountview_export_op ?? "")}
                          </span>
                        </span>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-2"
                            disabled={isExporting}
                            onClick={() => exporteerEnkelvoudig(m.id)}
                          >
                            {isExporting
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <><Upload className="h-3 w-3 mr-1" />Sturen</>
                            }
                          </Button>
                          {exportFout && (
                            <span className="text-[10px] text-red-600 max-w-32 text-center leading-tight break-words" title={exportFout}>
                              <AlertTriangle className="inline h-3 w-3 mr-0.5" />{exportFout.length > 60 ? exportFout.slice(0, 57) + "…" : exportFout}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

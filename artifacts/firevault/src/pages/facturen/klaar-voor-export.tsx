import { useState } from "react";
import { Link } from "wouter";
import {
  useListFacturenKlaarVoorExport,
  useExportAccountviewFactuur,
  useBlokkerenFactuur,
  useBatchExportFacturen,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft, ArrowUpRight, CheckCircle2, XCircle, AlertTriangle,
  Ban, Loader2, Eye, Info, Layers,
} from "lucide-react";
import type { Factuur, AccountviewExportResultaat, BatchExportResultaat } from "@workspace/api-client-react";

function euro(v?: string | null) {
  if (!v) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(parseFloat(v));
}

export default function KlaarVoorExportPagina() {
  const queryClient = useQueryClient();
  const [exportBezig, setExportBezig] = useState<number | null>(null);
  const [batchBezig, setBatchBezig] = useState(false);
  const [blokkerenOpen, setBlokkerenOpen] = useState(false);
  const [blokkerenFactuurId, setBlokkerenFactuurId] = useState<number | null>(null);
  const [blokkeringReden, setBlokkeringReden] = useState("");
  const [geselecteerd, setGeselecteerd] = useState<Set<number>>(new Set());
  const [exportResultaat, setExportResultaat] = useState<{ id: number; result: AccountviewExportResultaat } | null>(null);
  const [batchResultaat, setBatchResultaat] = useState<BatchExportResultaat | null>(null);

  const { data: facturen = [], isLoading } = useListFacturenKlaarVoorExport({
    query: { queryKey: ["facturen-klaar-voor-export"] },
  });

  const exportMut = useExportAccountviewFactuur({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["facturen-klaar-voor-export"] });
        queryClient.invalidateQueries({ queryKey: ["facturen"] });
      },
    },
  });

  const batchMut = useBatchExportFacturen({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["facturen-klaar-voor-export"] });
        queryClient.invalidateQueries({ queryKey: ["facturen"] });
      },
    },
  });

  const blokkerenMut = useBlokkerenFactuur({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["facturen-klaar-voor-export"] });
        setBlokkerenOpen(false);
      },
    },
  });

  async function handleExport(id: number) {
    setExportBezig(id);
    try {
      const result = await exportMut.mutateAsync({ id });
      setExportResultaat({ id, result: result as AccountviewExportResultaat });
    } finally {
      setExportBezig(null);
    }
  }

  async function handleBatchExport() {
    if (geselecteerd.size === 0) return;
    setBatchBezig(true);
    try {
      const result = await batchMut.mutateAsync({ data: { factuur_ids: Array.from(geselecteerd) } });
      setBatchResultaat(result as BatchExportResultaat);
      setGeselecteerd(new Set());
    } finally {
      setBatchBezig(false);
    }
  }

  const lijst = facturen as Factuur[];

  const exporteerbare = lijst.filter((f) => !!f.btw_code && !!f.grootboekrekening && !!f.factuurnummer);

  function toggleAlles() {
    if (geselecteerd.size === exporteerbare.length && exporteerbare.length > 0) {
      setGeselecteerd(new Set());
    } else {
      setGeselecteerd(new Set(exporteerbare.map((f) => f.id)));
    }
  }

  function toggleFactuur(id: number) {
    setGeselecteerd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const alleGeselecteerd = exporteerbare.length > 0 && geselecteerd.size === exporteerbare.length;
  const gedeeltelijkGeselecteerd = geselecteerd.size > 0 && geselecteerd.size < exporteerbare.length;

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Navigatie */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/facturen">
          <button className="flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            Factuurverwerking
          </button>
        </Link>
        <span>&rsaquo;</span>
        <span className="text-foreground">Klaar voor AccountView</span>
      </div>

      {/* Koptekst */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <ArrowUpRight className="h-6 w-6 text-primary" />
            Klaar voor AccountView
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Geaccordeerde facturen die nog niet naar AccountView zijn verzonden.
            Selecteer meerdere facturen voor batchexport, of verzend per stuk.
          </p>
        </div>
        {geselecteerd.size > 0 && (
          <Button
            onClick={handleBatchExport}
            disabled={batchBezig}
            className="shrink-0"
          >
            {batchBezig
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Exporteren...</>
              : <><Layers className="h-4 w-4 mr-2" />{geselecteerd.size} exporteren</>}
          </Button>
        )}
      </div>

      {/* Info */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800 flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          Elke factuur wordt slechts <strong>één keer</strong> verzonden. Dubbele export is geblokkeerd.
          Facturen met ontbrekende BTW-code of grootboekrekening kunnen niet worden geselecteerd.
        </div>
      </div>

      {/* Tabel */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-10">
          <Loader2 className="h-4 w-4 animate-spin" /> Laden...
        </div>
      ) : lijst.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-60" />
            <p className="text-sm font-medium">Alles verwerkt</p>
            <p className="text-xs mt-1">Er zijn geen facturen klaar voor export naar AccountView.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-2.5 w-10">
                  <Checkbox
                    checked={alleGeselecteerd}
                    data-state={gedeeltelijkGeselecteerd ? "indeterminate" : alleGeselecteerd ? "checked" : "unchecked"}
                    onCheckedChange={toggleAlles}
                    aria-label="Alles selecteren"
                  />
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Factuur</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Relatie</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Datum</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">BTW-code</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Grootboek</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-600">Incl. BTW</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-600">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lijst.map((f) => {
                const fouten = [];
                if (!f.btw_code) fouten.push("BTW-code ontbreekt");
                if (!f.grootboekrekening) fouten.push("Grootboekrekening ontbreekt");
                if (!f.factuurnummer) fouten.push("Factuurnummer ontbreekt");
                const exporteerbaar = fouten.length === 0;
                const isGeselecteerd = geselecteerd.has(f.id);
                return (
                  <tr key={f.id} className={`hover:bg-slate-50/50 ${isGeselecteerd ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={isGeselecteerd}
                        disabled={!exporteerbaar}
                        onCheckedChange={() => exporteerbaar && toggleFactuur(f.id)}
                        aria-label={`Factuur ${f.factuurnummer ?? f.id} selecteren`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${f.type === "inkoop" ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-600"}`}>
                          {f.type === "inkoop" ? "INK" : "VRK"}
                        </span>
                        <div>
                          <p className="font-medium">{f.factuurnummer ?? `#${f.id}`}</p>
                          {f.bestandsnaam && <p className="text-xs text-muted-foreground">{f.bestandsnaam}</p>}
                        </div>
                      </div>
                      {fouten.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {fouten.map((fout) => (
                            <span key={fout} className="inline-flex items-center gap-0.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                              <AlertTriangle className="h-2.5 w-2.5" />{fout}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{f.relatienaam ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{f.factuurdatum ?? "—"}</td>
                    <td className="px-4 py-3">
                      {f.btw_code
                        ? <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{f.btw_code}</span>
                        : <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Ontbreekt</span>}
                    </td>
                    <td className="px-4 py-3">
                      {f.grootboekrekening
                        ? <span className="font-mono text-xs">{f.grootboekrekening}</span>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium">{euro(f.bedrag_incl_btw)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Link href={`/facturen/${f.id}`}>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-slate-500"
                          title="Blokkeren"
                          onClick={() => { setBlokkerenFactuurId(f.id); setBlokkerenOpen(true); }}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={exportBezig === f.id || fouten.length > 0}
                          title={fouten.length > 0 ? fouten.join(", ") : "Verzenden naar AccountView"}
                          onClick={() => handleExport(f.id)}
                        >
                          {exportBezig === f.id
                            ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Bezig...</>
                            : <><ArrowUpRight className="h-3 w-3 mr-1" />Verzenden</>}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Exportresultaat dialog (enkelvoudig) */}
      {exportResultaat && (
        <Dialog open onOpenChange={() => setExportResultaat(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Exportresultaat</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {exportResultaat.result.status === "geslaagd" ? (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-green-800">Factuur succesvol verzonden</p>
                    {exportResultaat.result.boeking_id && (
                      <p className="text-sm text-green-700 mt-0.5">AccountView boekingId: <span className="font-mono">{exportResultaat.result.boeking_id}</span></p>
                    )}
                    {exportResultaat.result.testmodus && (
                      <p className="text-xs text-amber-700 mt-1">(Testmodus — niet daadwerkelijk verzonden)</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
                  <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-red-800">Export mislukt</p>
                    <p className="text-sm text-red-700 mt-0.5">{exportResultaat.result.foutmelding}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      De factuur staat nog in de exportwachtrij. Corrigeer de fout en probeer opnieuw.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setExportResultaat(null)}>Sluiten</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Batchexport resultaat dialog */}
      {batchResultaat && (
        <Dialog open onOpenChange={() => setBatchResultaat(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Batchexport resultaat</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-slate-50 border p-3">
                  <p className="text-2xl font-semibold text-slate-800">{batchResultaat.totaal}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Totaal</p>
                </div>
                <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                  <p className="text-2xl font-semibold text-green-700">{batchResultaat.geslaagd}</p>
                  <p className="text-xs text-green-600 mt-0.5">Geslaagd</p>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-2xl font-semibold text-red-700">{batchResultaat.mislukt}</p>
                  <p className="text-xs text-red-600 mt-0.5">Mislukt</p>
                </div>
              </div>
              {batchResultaat.resultaten && batchResultaat.resultaten.filter((r) => r.status === "mislukt").length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-slate-700">Mislukte facturen</p>
                  {batchResultaat.resultaten.filter((r) => r.status === "mislukt").map((r) => (
                    <div key={r.factuur_id} className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      <span className="font-mono font-medium">#{r.factuur_id}</span>
                      {r.foutmelding && <span className="ml-2">{r.foutmelding}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setBatchResultaat(null)}>Sluiten</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Blokkeren dialog */}
      <Dialog open={blokkerenOpen} onOpenChange={setBlokkerenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Factuur blokkeren</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Een geblokkeerde factuur wordt niet meer aangeboden voor export naar AccountView.
              U kunt de blokkering later opheffen via het factuurdetail.
            </p>
            <div>
              <Label>Reden (optioneel)</Label>
              <Input
                className="mt-1"
                placeholder="Bijv. in behandeling bij accountant"
                value={blokkeringReden}
                onChange={(e) => setBlokkeringReden(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlokkerenOpen(false)}>Annuleren</Button>
            <Button
              variant="destructive"
              disabled={blokkerenMut.isPending}
              onClick={() => {
                if (blokkerenFactuurId) {
                  blokkerenMut.mutate({ id: blokkerenFactuurId, data: { geblokkeerd: true, reden: blokkeringReden || null } });
                }
              }}
            >
              Blokkeren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

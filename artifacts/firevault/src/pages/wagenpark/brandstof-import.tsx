import { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import { ArrowLeft, Upload, FileText, AlertTriangle, CheckCircle, RefreshCw, Trash2, Play, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useListBrandstofImporten,
  useUploadBrandstofFactuur,
  useGetBrandstofImport,
  usePatchBrandstofRegel,
  useLaadBrandstofImport,
  useDeleteBrandstofImport,
  useListVoertuigen,
  getListBrandstofImportenQueryKey,
  getGetBrandstofImportQueryKey,
  BrandstofFactuurUploadInput,
  BrandstofImport,
  BrandstofRegel,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PaginaHulp } from "@/components/pagina-hulp";

// ── Helpers ────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case "wacht_op_controle":
      return <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-50">Wacht op controle</Badge>;
    case "geaccordeerd":
      return <Badge variant="outline" className="border-green-600 text-green-700 bg-green-50">Geaccordeerd</Badge>;
    case "gearchiveerd":
      return <Badge variant="outline" className="text-muted-foreground">Gearchiveerd</Badge>;
    default:
      return <Badge variant="outline" className="border-blue-500 text-blue-700 bg-blue-50">Verwerkt</Badge>;
  }
}

function koppelingBadge(status: string) {
  switch (status) {
    case "automatisch":
      return <Badge variant="outline" className="border-green-600 text-green-700 text-xs">Automatisch</Badge>;
    case "handmatig":
      return <Badge variant="outline" className="border-blue-500 text-blue-700 text-xs">Handmatig</Badge>;
    case "onzeker":
      return <Badge variant="outline" className="border-amber-500 text-amber-700 text-xs">Onzeker</Badge>;
    default:
      return <Badge variant="outline" className="text-muted-foreground text-xs">Niet gevonden</Badge>;
  }
}

function formatDatum(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatBedrag(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

type AiSignaal = { type: string; omschrijving: string; kenteken?: string | null };

// ── Upload zone ────────────────────────────────────────────────────────────

function UploadZone({ onSuccess }: { onSuccess: () => void }) {
  const [sleep, setSleep] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadBrandstofFactuur();

  const verwerk = useCallback(
    (file: File) => {
      setFout(null);
      const formData = new FormData();
      formData.append("bestand", file);
      upload.mutate(
        { data: formData as unknown as BrandstofFactuurUploadInput },
        {
          onSuccess: () => { onSuccess(); setSleep(false); },
          onError: (err: unknown) => {
            const msg =
              (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
              "Upload mislukt.";
            setFout(msg);
            setSleep(false);
          },
        },
      );
    },
    [upload, onSuccess],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setSleep(false);
      const file = e.dataTransfer.files[0];
      if (file) verwerk(file);
    },
    [verwerk],
  );

  return (
    <div
      onDragOver={e => { e.preventDefault(); setSleep(true); }}
      onDragLeave={() => setSleep(false)}
      onDrop={onDrop}
      className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
        sleep ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.xml,.ubl,.eml,message/rfc822,application/pdf,application/xml"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) verwerk(f); }}
      />
      <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
      <p className="font-medium text-sm mb-1">Sleep een bestand hierheen of klik om te uploaden</p>
      <p className="text-xs text-muted-foreground mb-4">
        Ondersteund: PDF-factuur &middot; UBL/Peppol XML &middot; e-mailbijlage (.eml)
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={upload.isPending}
        onClick={() => inputRef.current?.click()}
      >
        {upload.isPending ? "Verwerken..." : "Bestand kiezen"}
      </Button>
      {fout && (
        <Alert variant="destructive" className="mt-4 text-left">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{fout}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ── Importdetail ───────────────────────────────────────────────────────────

function ImportDetailPaneel({ importId, onSluit }: { importId: number; onSluit: () => void }) {
  const { data: detail, isLoading } = useGetBrandstofImport(importId);
  const { data: voertuigenData } = useListVoertuigen();
  const voertuigen = voertuigenData ?? [];
  const patchRegel = usePatchBrandstofRegel();
  const laadImport = useLaadBrandstofImport();
  const deleteImport = useDeleteBrandstofImport();
  const qc = useQueryClient();
  const [laadFout, setLaadFout] = useState<string | null>(null);
  const [verwijderOpen, setVerwijderOpen] = useState(false);

  const invalideer = () => {
    qc.invalidateQueries({ queryKey: getGetBrandstofImportQueryKey(importId) });
    qc.invalidateQueries({ queryKey: getListBrandstofImportenQueryKey() });
  };

  const koppelVoertuig = (regelId: number, voertuigId: number | null) => {
    patchRegel.mutate(
      {
        id: importId,
        regelId,
        data: {
          voertuig_id: voertuigId,
          koppeling_status: voertuigId ? "handmatig" : "niet_gevonden",
        },
      },
      { onSuccess: invalideer },
    );
  };

  const laden = () => {
    setLaadFout(null);
    laadImport.mutate(
      { id: importId },
      {
        onSuccess: () => invalideer(),
        onError: (err: unknown) => {
          const msg =
            (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
            "Laden mislukt.";
          setLaadFout(msg);
        },
      },
    );
  };

  const verwijder = () => {
    deleteImport.mutate(
      { id: importId },
      {
        onSuccess: () => {
          onSluit();
          qc.invalidateQueries({ queryKey: getListBrandstofImportenQueryKey() });
        },
      },
    );
  };

  if (isLoading || !detail) {
    return <div className="p-6 text-muted-foreground text-sm">Laden...</div>;
  }

  const regels: BrandstofRegel[] = detail.regels ?? [];
  const onzeker = regels.filter((r: BrandstofRegel) => r.koppeling_status === "onzeker");
  const kanLaden = !detail.geladen && onzeker.length === 0 && regels.length > 0;
  const signalen: AiSignaal[] = (detail.ai_signalen as AiSignaal[] | null) ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">{detail.bestandsnaam}</h3>
          <p className="text-xs text-muted-foreground">
            {detail.aantal_regels} regels &middot; {formatDatum(detail.periode_van)} – {formatDatum(detail.periode_tot)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge(detail.status)}
          {!detail.geladen && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setVerwijderOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Statistieken */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Regels",        value: detail.aantal_regels,     kleur: "" },
          { label: "Gekoppeld",     value: detail.aantal_gekoppeld,  kleur: "text-green-700" },
          { label: "Onzeker",       value: detail.aantal_onzeker,    kleur: "text-amber-700" },
          { label: "Niet gevonden", value: detail.aantal_ontkoppeld, kleur: "text-destructive" },
        ].map(s => (
          <div key={s.label} className="border rounded p-2 text-center">
            <p className={`text-lg font-bold ${s.kleur}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Totalen */}
      {(detail.totaal_bedrag != null || detail.totaal_btw != null) && (
        <div className="flex gap-4 text-sm">
          {detail.totaal_bedrag != null && (
            <span>Totaal: <strong>{formatBedrag(detail.totaal_bedrag)}</strong></span>
          )}
          {detail.totaal_btw != null && (
            <span className="text-muted-foreground">BTW: {formatBedrag(detail.totaal_btw)}</span>
          )}
        </div>
      )}

      {/* AI-signalen */}
      {signalen.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            AI-signalen (voertuiggericht — uitsluitend voor wagenparkbeheer)
          </p>
          {signalen.map((s: AiSignaal, i: number) => (
            <Alert key={i} className="py-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              <AlertDescription className="text-xs">{s.omschrijving}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Onzekere koppelingen */}
      {onzeker.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-xs">
            {onzeker.length} {onzeker.length === 1 ? "regel is" : "regels zijn"} onzeker gekoppeld.
            Koppel ze handmatig hieronder voordat u laadt.
          </AlertDescription>
        </Alert>
      )}

      {/* Laad-fout */}
      {laadFout && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">{laadFout}</AlertDescription>
        </Alert>
      )}

      {/* Laden-knop */}
      {!detail.geladen && (
        <Button
          size="sm"
          disabled={!kanLaden || laadImport.isPending}
          onClick={laden}
          className="gap-1.5"
        >
          <Play className="h-3.5 w-3.5" />
          {laadImport.isPending ? "Kostenregels aanmaken..." : "Laden als kosten in wagenpark"}
        </Button>
      )}
      {detail.geladen && (
        <div className="flex items-center gap-2 text-sm text-green-700">
          <CheckCircle className="h-4 w-4" />
          <span>Geladen op {formatDatum(detail.geladen_op)} — kosten zijn aangemaakt per voertuig.</span>
        </div>
      )}

      {/* Regeltabel */}
      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Datum</TableHead>
              <TableHead className="text-xs">Kenteken</TableHead>
              <TableHead className="text-xs">Product / Volume</TableHead>
              <TableHead className="text-xs">Bedrag</TableHead>
              <TableHead className="text-xs">Koppeling</TableHead>
              <TableHead className="text-xs">Voertuig</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {regels.map((r: BrandstofRegel) => (
              <TableRow key={r.id} className={r.koppeling_status === "onzeker" ? "bg-amber-50/60" : ""}>
                <TableCell className="text-xs">{formatDatum(r.datum)}</TableCell>
                <TableCell className="text-xs font-mono">{r.kenteken ?? "—"}</TableCell>
                <TableCell className="text-xs">
                  {r.product ?? "—"}
                  {r.hoeveelheid != null && (
                    <span className="text-muted-foreground ml-1">
                      {r.hoeveelheid.toFixed(1)} {r.eenheid ?? ""}
                    </span>
                  )}
                  {r.km_stand != null && (
                    <span className="block text-muted-foreground text-xs">
                      {r.km_stand.toLocaleString("nl-NL")} km
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs">{formatBedrag(r.bedrag_incl_btw)}</TableCell>
                <TableCell className="text-xs">{koppelingBadge(r.koppeling_status)}</TableCell>
                <TableCell className="text-xs min-w-[160px]">
                  {detail.geladen ? (
                    <span className="text-muted-foreground">
                      {r.kenteken_voertuig ?? r.kenteken ?? "—"}
                    </span>
                  ) : (
                    <Select
                      value={r.voertuig_id?.toString() ?? "geen"}
                      onValueChange={val =>
                        koppelVoertuig(r.id, val === "geen" ? null : parseInt(val, 10))
                      }
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="Kies voertuig" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="geen">Niet koppelen</SelectItem>
                        {voertuigen.map(v => (
                          <SelectItem key={v.id} value={v.id.toString()}>
                            {v.kenteken} — {v.merk} {v.type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Verwijder-dialog */}
      <Dialog open={verwijderOpen} onOpenChange={setVerwijderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import verwijderen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Weet u zeker dat u deze import wilt verwijderen? De transactieregels worden verwijderd.
            Eventueel al aangemaakte kosten in het wagenpark blijven staan.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerwijderOpen(false)}>Annuleren</Button>
            <Button
              variant="destructive"
              disabled={deleteImport.isPending}
              onClick={verwijder}
            >
              Verwijderen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Hoofdpagina ────────────────────────────────────────────────────────────

export default function BrandstofImportPage() {
  const { data: importen, isLoading, refetch } = useListBrandstofImporten();
  const [geselecteerdId, setGeselecteerdId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const qc = useQueryClient();

  const onUploadSuccess = () => {
    refetch();
    qc.invalidateQueries({ queryKey: getListBrandstofImportenQueryKey() });
  };

  const gefilterd = (importen ?? []).filter((i: BrandstofImport) =>
    statusFilter === "alle" ? true : i.status === statusFilter,
  );

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <PaginaHulp pagina="wagenpark-brandstof-import" />
      {/* Navigatie */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/wagenpark" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          Wagenpark
        </Link>
        <span>/</span>
        <span className="text-foreground">MKB Brandstof import</span>
      </div>

      {/* Koptekst */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">MKB Brandstof import</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Importeer brandstof- en laadkosten vanuit MKB Brandstof facturen (PDF, UBL/Peppol of e-mail).
          Regels worden automatisch aan voertuigen gekoppeld. Onzekere koppelingen controleert u handmatig
          voordat u de kosten laadt.
        </p>
      </div>

      {/* Privacy */}
      <Alert className="border-blue-200 bg-blue-50">
        <Truck className="h-4 w-4 text-blue-700" />
        <AlertDescription className="text-blue-800 text-xs">
          AI-signalering is uitsluitend voertuiggericht (brandstofverbruik, kosten, ontbrekende kilometerstanden).
          Gegevens worden niet gebruikt voor beoordeling van individuele medewerkers.
        </AlertDescription>
      </Alert>

      {/* Upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Nieuwe factuur importeren</CardTitle>
        </CardHeader>
        <CardContent>
          <UploadZone onSuccess={onUploadSuccess} />
        </CardContent>
      </Card>

      {/* Lijst + detail */}
      <div className={`grid gap-4 ${geselecteerdId ? "grid-cols-2" : "grid-cols-1"}`}>
        {/* Importlijst */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Importhistorie</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-7 w-44 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle statussen</SelectItem>
                    <SelectItem value="wacht_op_controle">Wacht op controle</SelectItem>
                    <SelectItem value="verwerkt">Verwerkt</SelectItem>
                    <SelectItem value="geaccordeerd">Geaccordeerd</SelectItem>
                    <SelectItem value="gearchiveerd">Gearchiveerd</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && (
              <div className="p-6 text-sm text-muted-foreground">Laden...</div>
            )}
            {!isLoading && gefilterd.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <FileText className="mx-auto h-8 w-8 mb-2 opacity-40" />
                Nog geen imports gevonden.
              </div>
            )}
            {gefilterd.length > 0 && (
              <div className="divide-y">
                {gefilterd.map((imp: BrandstofImport) => (
                  <button
                    key={imp.id}
                    onClick={() => setGeselecteerdId(geselecteerdId === imp.id ? null : imp.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
                      geselecteerdId === imp.id ? "bg-muted/60" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{imp.bestandsnaam}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDatum(imp.aangemaakt_op)} &middot; {imp.aantal_regels} regels
                          {imp.totaal_bedrag != null && ` \u00b7 ${formatBedrag(imp.totaal_bedrag)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {imp.aantal_onzeker > 0 && (
                          <span className="flex items-center gap-1 text-xs text-amber-700">
                            <AlertTriangle className="h-3 w-3" />
                            {imp.aantal_onzeker}
                          </span>
                        )}
                        {imp.geladen && <CheckCircle className="h-3.5 w-3.5 text-green-600" />}
                        {statusBadge(imp.status)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detailpaneel */}
        {geselecteerdId && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Importdetail</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setGeselecteerdId(null)}
                >
                  Sluiten
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ImportDetailPaneel
                importId={geselecteerdId}
                onSluit={() => setGeselecteerdId(null)}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

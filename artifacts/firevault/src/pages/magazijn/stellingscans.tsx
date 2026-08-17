import { useState, useRef } from "react";
import {
  useListMagazijnStellingscans,
  useGetMagazijnStellingsscanUploadUrl,
  useCreateMagazijnStellingsscan,
  useKeurMagazijnStellingsscanGoed,
  getListMagazijnStellingscansQueryKey,
  useListOpdrachten,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ScanSearch,
  Upload,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  RotateCcw,
  MapPin,
} from "lucide-react";
import { PaginaHulp } from "@/components/pagina-hulp";

type Suggestie = {
  artikel_id: number;
  code: string | null;
  naam: string;
  eenheid: string | null;
  huidige_voorraad: number | null;
  minimum_voorraad: number | null;
  advies_hoeveelheid: number;
  reden: string;
  prioriteit: string;
  aanbevolen_locatie_id: number | null;
  aanbevolen_locatie_naam: string | null;
};

type Scan = {
  id: number;
  scan_type: string;
  foto_pad: string;
  locatie_id: number | null;
  status: string;
  aangemaakt_op: string;
  goedgekeurd_op: string | null;
  retour_project_id: number | null;
  retour_omschrijving: string | null;
  ai_suggesties: Suggestie[];
};

type GoedkeuringsState = {
  geselecteerd: Record<number, boolean>;
  hoeveelheden: Record<number, number>;
};

function initialiseerGoedkeuring(suggesties: Suggestie[]): GoedkeuringsState {
  const geselecteerd: Record<number, boolean> = {};
  const hoeveelheden: Record<number, number> = {};
  for (const s of suggesties) {
    geselecteerd[s.artikel_id] = true;
    hoeveelheden[s.artikel_id] = s.advies_hoeveelheid;
  }
  return { geselecteerd, hoeveelheden };
}

function statusBadge(status: string) {
  if (status === "goedgekeurd")
    return <Badge className="bg-green-100 text-green-700 border-green-200">Goedgekeurd</Badge>;
  if (status === "gereed")
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Wacht op beoordeling</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Analyseren...</Badge>;
}

function scanTypeBadge(scanType: string) {
  if (scanType === "retour")
    return (
      <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50 flex items-center gap-1">
        <RotateCcw className="h-3 w-3" />
        Retour
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground flex items-center gap-1">
      <ScanSearch className="h-3 w-3" />
      Voorraadcontrole
    </Badge>
  );
}

function prioriteitLabel(p: string) {
  if (p === "hoog") return <span className="text-xs font-medium text-red-600">Hoog</span>;
  if (p === "middel") return <span className="text-xs font-medium text-amber-600">Middel</span>;
  return <span className="text-xs font-medium text-muted-foreground">Laag</span>;
}

function ScanItem({ scan, projectNamen }: { scan: Scan; projectNamen: Record<number, string> }) {
  const [open, setOpen] = useState(scan.status === "gereed");
  const [goedkeuring, setGoedkeuring] = useState<GoedkeuringsState>(() =>
    initialiseerGoedkeuring(scan.ai_suggesties)
  );
  const queryClient = useQueryClient();
  const keurGoed = useKeurMagazijnStellingsscanGoed();

  const isRetour = scan.scan_type === "retour";
  const geselecteerdAantal = Object.values(goedkeuring.geselecteerd).filter(Boolean).length;

  async function handleGoedkeuren() {
    const artikelen = scan.ai_suggesties
      .filter((s) => goedkeuring.geselecteerd[s.artikel_id])
      .map((s) => ({
        artikel_id: s.artikel_id,
        hoeveelheid: goedkeuring.hoeveelheden[s.artikel_id] ?? s.advies_hoeveelheid,
        ...(isRetour && s.aanbevolen_locatie_id
          ? { locatie_id: s.aanbevolen_locatie_id }
          : {}),
      }));
    if (artikelen.length === 0) return;
    await keurGoed.mutateAsync({ id: scan.id, data: { artikelen } });
    await queryClient.invalidateQueries({ queryKey: getListMagazijnStellingscansQueryKey() });
  }

  const datum = new Date(scan.aangemaakt_op).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const projectNaam = scan.retour_project_id ? projectNamen[scan.retour_project_id] : null;

  return (
    <Card className="overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open
          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">{datum}</span>
          {isRetour && (projectNaam || scan.retour_omschrijving) && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {projectNaam ? `Project: ${projectNaam}` : ""}
              {projectNaam && scan.retour_omschrijving ? " · " : ""}
              {scan.retour_omschrijving ?? ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {scanTypeBadge(scan.scan_type)}
          {statusBadge(scan.status)}
          {scan.status === "gereed" && (
            <span className="text-xs text-muted-foreground">
              {scan.ai_suggesties.length} suggestie{scan.ai_suggesties.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          {/* Retour-context details */}
          {isRetour && (projectNaam || scan.retour_omschrijving) && (
            <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2.5">
              <RotateCcw className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <span className="font-medium">Retourscan</span>
                {projectNaam && <span> · {projectNaam}</span>}
                {scan.retour_omschrijving && (
                  <p className="text-xs text-blue-700 mt-0.5">{scan.retour_omschrijving}</p>
                )}
              </div>
            </div>
          )}

          {scan.status === "analyseren" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>AI-analyse bezig...</span>
            </div>
          )}

          {(scan.status === "gereed" || scan.status === "goedgekeurd") && scan.ai_suggesties.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              {isRetour
                ? "De AI heeft geen artikelen herkend op de retoursfoto."
                : "De AI heeft geen artikelen herkend die bijbesteld moeten worden."}
            </p>
          )}

          {scan.ai_suggesties.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {isRetour ? "Plaatsadviezen" : "Besteladviezen"}
              </p>
              <div className="divide-y rounded-md border">
                {scan.ai_suggesties.map((s) => (
                  <div
                    key={s.artikel_id}
                    className={`flex items-start gap-3 px-3 py-2.5 ${scan.status === "goedgekeurd" ? "opacity-60" : ""}`}
                  >
                    {scan.status === "gereed" && (
                      <Checkbox
                        checked={goedkeuring.geselecteerd[s.artikel_id] ?? false}
                        onCheckedChange={(v) =>
                          setGoedkeuring((prev) => ({
                            ...prev,
                            geselecteerd: { ...prev.geselecteerd, [s.artikel_id]: Boolean(v) },
                          }))
                        }
                        className="mt-0.5 shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{s.naam}</span>
                        {s.code && (
                          <span className="text-xs text-muted-foreground font-mono">{s.code}</span>
                        )}
                        {!isRetour && prioriteitLabel(s.prioriteit)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.reden}</p>
                      {/* Locatieadvies voor retour */}
                      {isRetour && s.aanbevolen_locatie_naam && (
                        <p className="text-xs text-blue-700 mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          Locatie: {s.aanbevolen_locatie_naam}
                        </p>
                      )}
                      {!isRetour && (s.huidige_voorraad !== null || s.minimum_voorraad !== null) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.huidige_voorraad !== null && (
                            <span>Huidig: {s.huidige_voorraad} {s.eenheid ?? "st"}</span>
                          )}
                          {s.huidige_voorraad !== null && s.minimum_voorraad !== null && " · "}
                          {s.minimum_voorraad !== null && (
                            <span>Minimum: {s.minimum_voorraad} {s.eenheid ?? "st"}</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {scan.status === "gereed" ? (
                        <Input
                          type="number"
                          min={1}
                          value={goedkeuring.hoeveelheden[s.artikel_id] ?? s.advies_hoeveelheid}
                          onChange={(e) =>
                            setGoedkeuring((prev) => ({
                              ...prev,
                              hoeveelheden: {
                                ...prev.hoeveelheden,
                                [s.artikel_id]: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-20 h-8 text-sm"
                        />
                      ) : (
                        <span className="text-sm font-medium w-20 text-right">
                          {goedkeuring.hoeveelheden[s.artikel_id] ?? s.advies_hoeveelheid}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground w-6">{s.eenheid ?? "st"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scan.status === "gereed" && scan.ai_suggesties.length > 0 && (
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                {geselecteerdAantal} van {scan.ai_suggesties.length} geselecteerd
              </p>
              <Button
                size="sm"
                onClick={handleGoedkeuren}
                disabled={geselecteerdAantal === 0 || keurGoed.isPending}
              >
                {keurGoed.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                {isRetour ? "Bevestigen en terugplaatsen" : "Goedkeuren en bestellen"}
              </Button>
            </div>
          )}

          {scan.status === "goedgekeurd" && scan.goedgekeurd_op && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              {isRetour ? "Teruggeplaatst op" : "Goedgekeurd op"}{" "}
              {new Date(scan.goedgekeurd_op).toLocaleDateString("nl-NL", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export default function MagazijnStellingsscansPagina() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  // Scan type keuze
  const [scanType, setScanType] = useState<"voorraadcontrole" | "retour">("voorraadcontrole");
  const [retourProjectId, setRetourProjectId] = useState<string>("");
  const [retourOmschrijving, setRetourOmschrijving] = useState("");

  const { data: scans, isLoading } = useListMagazijnStellingscans();
  const { data: opdrachten } = useListOpdrachten();
  const getUploadUrl = useGetMagazijnStellingsscanUploadUrl();
  const aanmaken = useCreateMagazijnStellingsscan();

  // Map van project id → naam voor weergave in scankaarten
  const projectNamen: Record<number, string> = {};
  if (opdrachten) {
    for (const o of opdrachten) {
      const label = [o.werknummer, (o as { omschrijving?: string | null }).omschrijving]
        .filter(Boolean)
        .join(" — ");
      projectNamen[o.id] = label || `Opdracht #${o.id}`;
    }
  }

  async function handleFotoSelectie(e: React.ChangeEvent<HTMLInputElement>) {
    const bestand = e.target.files?.[0];
    if (!bestand) return;

    if (scanType === "retour" && !retourProjectId) {
      setFout("Selecteer eerst een project voordat je een retoursfoto uploadt.");
      return;
    }

    setFout(null);
    setBezig(true);

    try {
      const urlData = await getUploadUrl.mutateAsync();
      const { upload_url, object_path } = urlData as { upload_url: string; object_path: string };

      const uploadResp = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": bestand.type || "image/jpeg" },
        body: bestand,
      });
      if (!uploadResp.ok) throw new Error("Foto uploaden mislukt");

      await aanmaken.mutateAsync({
        data: {
          foto_pad: object_path,
          scan_type: scanType,
          ...(scanType === "retour" && retourProjectId
            ? { retour_project_id: Number(retourProjectId) }
            : {}),
          ...(scanType === "retour" && retourOmschrijving
            ? { retour_omschrijving: retourOmschrijving }
            : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListMagazijnStellingscansQueryKey() });

      // Reset retour-velden na succesvolle upload
      if (scanType === "retour") {
        setRetourProjectId("");
        setRetourOmschrijving("");
      }
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Er is een fout opgetreden");
    } finally {
      setBezig(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const voorraadScans = (scans ?? []).filter((s) => (s as Scan).scan_type !== "retour");
  const retourScans = (scans ?? []).filter((s) => (s as Scan).scan_type === "retour");

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <PaginaHulp pagina="magazijn-stellingscans" />
      {/* Paginakop */}
      <div className="flex items-center gap-3">
        <ScanSearch className="h-6 w-6 text-primary" />
        <div>
          <h1 data-paginatitel className="text-xl font-semibold">Stellingscans</h1>
          <p className="text-sm text-muted-foreground">
            AI-gestuurde voorraadcontrole en retourverwerking via foto
          </p>
        </div>
      </div>

      {/* Nieuwe scan — type toggle + velden + upload */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setScanType("voorraadcontrole")}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                scanType === "voorraadcontrole"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <ScanSearch className="h-4 w-4" />
              Voorraadcontrole
            </button>
            <button
              type="button"
              onClick={() => setScanType("retour")}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                scanType === "retour"
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-border text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <RotateCcw className="h-4 w-4" />
              Retour artikelen
            </button>
          </div>

          {scanType === "retour" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="retour-project">Project (verplicht)</Label>
                <Select value={retourProjectId} onValueChange={setRetourProjectId}>
                  <SelectTrigger id="retour-project">
                    <SelectValue placeholder="Kies het project waaruit de artikelen retour komen" />
                  </SelectTrigger>
                  <SelectContent>
                    {(opdrachten ?? []).map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {[
                          o.werknummer,
                          (o as { omschrijving?: string | null }).omschrijving,
                        ]
                          .filter(Boolean)
                          .join(" — ") || `Opdracht #${o.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="retour-omschrijving">Toelichting (optioneel)</Label>
                <Textarea
                  id="retour-omschrijving"
                  placeholder="Bijv. bus RJ-234, einde project Schiphol, surplus materiaal..."
                  value={retourOmschrijving}
                  onChange={(e) => setRetourOmschrijving(e.target.value)}
                  className="resize-none h-20"
                />
              </div>
            </div>
          )}

          <Button
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={bezig || (scanType === "retour" && !retourProjectId)}
          >
            {bezig ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {scanType === "retour" ? "Retourscan analyseren..." : "Stellingfoto analyseren..."}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                {scanType === "retour" ? "Retoursfoto uploaden" : "Stellingfoto uploaden"}
              </>
            )}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFotoSelectie}
          />
        </CardContent>
      </Card>

      {bezig && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Foto wordt geanalyseerd</p>
              <p className="text-xs text-amber-700">
                {scanType === "retour"
                  ? "GPT-4o identificeert de artikelen en stelt een opberglocatie voor."
                  : "GPT-4o vergelijkt de foto met de artikelcatalogus."}
                {" "}Dit duurt enkele seconden.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {fout && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{fout}</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Scans ophalen...</span>
        </div>
      ) : !scans || scans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <ScanSearch className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium">Nog geen scans</p>
              <p className="text-xs text-muted-foreground mt-1">
                Upload een stellingfoto of retoursfoto om te beginnen
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {retourScans.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-blue-700 uppercase tracking-wide">
                <RotateCcw className="h-3.5 w-3.5" />
                Retourscans ({retourScans.length})
              </div>
              {retourScans.map((scan) => (
                <ScanItem key={scan.id} scan={scan as Scan} projectNamen={projectNamen} />
              ))}
            </div>
          )}

          {voorraadScans.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Clock className="h-3.5 w-3.5" />
                Voorraadcontroles ({voorraadScans.length})
              </div>
              {voorraadScans.map((scan) => (
                <ScanItem key={scan.id} scan={scan as Scan} projectNamen={projectNamen} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

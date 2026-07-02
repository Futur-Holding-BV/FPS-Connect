import { useState, useRef } from "react";
import {
  useListMagazijnStellingscans,
  useGetMagazijnStellingsscanUploadUrl,
  useCreateMagazijnStellingsscan,
  useKeurMagazijnStellingsscanGoed,
  getListMagazijnStellingscansQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ScanSearch, Upload, ChevronDown, ChevronRight, CheckCircle2, Clock, Loader2, AlertCircle,
} from "lucide-react";

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
};

type Scan = {
  id: number;
  foto_pad: string;
  locatie_id: number | null;
  status: string;
  aangemaakt_op: string;
  goedgekeurd_op: string | null;
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
    geselecteerd[s.artikel_id] = s.prioriteit === "hoog" || s.prioriteit === "middel";
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

function prioriteitLabel(p: string) {
  if (p === "hoog") return <span className="text-xs font-medium text-red-600">Hoog</span>;
  if (p === "middel") return <span className="text-xs font-medium text-amber-600">Middel</span>;
  return <span className="text-xs font-medium text-muted-foreground">Laag</span>;
}

function ScanItem({ scan }: { scan: Scan }) {
  const [open, setOpen] = useState(scan.status === "gereed");
  const [goedkeuring, setGoedkeuring] = useState<GoedkeuringsState>(() =>
    initialiseerGoedkeuring(scan.ai_suggesties)
  );
  const queryClient = useQueryClient();
  const keurGoed = useKeurMagazijnStellingsscanGoed();

  const geselecteerdAantal = Object.values(goedkeuring.geselecteerd).filter(Boolean).length;

  async function handleGoedkeuren() {
    const artikelen = scan.ai_suggesties
      .filter((s) => goedkeuring.geselecteerd[s.artikel_id])
      .map((s) => ({
        artikel_id: s.artikel_id,
        hoeveelheid: goedkeuring.hoeveelheden[s.artikel_id] ?? s.advies_hoeveelheid,
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

  return (
    <Card className="overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        <span className="text-sm font-medium flex-1">{datum}</span>
        {statusBadge(scan.status)}
        {scan.status === "gereed" && (
          <span className="text-xs text-muted-foreground">
            {scan.ai_suggesties.length} suggestie{scan.ai_suggesties.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          {scan.status === "analyseren" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>AI-analyse bezig...</span>
            </div>
          )}

          {(scan.status === "gereed" || scan.status === "goedgekeurd") && scan.ai_suggesties.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              De AI heeft geen artikelen herkend die bijbesteld moeten worden.
            </p>
          )}

          {scan.ai_suggesties.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Besteladviezen
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
                        {prioriteitLabel(s.prioriteit)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.reden}</p>
                      {s.huidige_voorraad !== null || s.minimum_voorraad !== null ? (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.huidige_voorraad !== null && (
                            <span>Huidig: {s.huidige_voorraad} {s.eenheid ?? "st"}</span>
                          )}
                          {s.huidige_voorraad !== null && s.minimum_voorraad !== null && " · "}
                          {s.minimum_voorraad !== null && (
                            <span>Minimum: {s.minimum_voorraad} {s.eenheid ?? "st"}</span>
                          )}
                        </p>
                      ) : null}
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
                Goedkeuren en verwerken
              </Button>
            </div>
          )}

          {scan.status === "goedgekeurd" && scan.goedgekeurd_op && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              Goedgekeurd op{" "}
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

  const { data: scans, isLoading } = useListMagazijnStellingscans();
  const getUploadUrl = useGetMagazijnStellingsscanUploadUrl();
  const aanmaken = useCreateMagazijnStellingsscan();

  async function handleFotoSelectie(e: React.ChangeEvent<HTMLInputElement>) {
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    setFout(null);
    setBezig(true);

    try {
      // 1. Upload-URL ophalen
      const urlData = await getUploadUrl.mutateAsync();
      const { upload_url, object_path } = urlData as { upload_url: string; object_path: string };

      // 2. Foto uploaden naar storage
      const uploadResp = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": bestand.type || "image/jpeg" },
        body: bestand,
      });
      if (!uploadResp.ok) {
        throw new Error("Foto uploaden mislukt");
      }

      // 3. Scan aanmaken + AI-analyse (synchrone call, duurt 3-10s)
      await aanmaken.mutateAsync({ data: { foto_pad: object_path } });
      await queryClient.invalidateQueries({ queryKey: getListMagazijnStellingscansQueryKey() });
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Er is een fout opgetreden");
    } finally {
      setBezig(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScanSearch className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Stellingscans</h1>
            <p className="text-sm text-muted-foreground">
              Foto een stelling, laat AI besteladviezen genereren
            </p>
          </div>
        </div>
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={bezig}
        >
          {bezig ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Analyseren...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Foto uploaden
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
      </div>

      {bezig && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Foto wordt geanalyseerd</p>
              <p className="text-xs text-amber-700">
                GPT-4o vergelijkt de foto met de artikelcatalogus. Dit duurt enkele seconden.
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
              <p className="text-sm font-medium">Nog geen stellingscans</p>
              <p className="text-xs text-muted-foreground mt-1">
                Klik op "Foto uploaden" om een eerste stellingfoto te analyseren
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{scans.length} scan{scans.length !== 1 ? "s" : ""} in totaal</span>
          </div>
          {scans.map((scan) => (
            <ScanItem key={scan.id} scan={scan as Scan} />
          ))}
        </div>
      )}
    </div>
  );
}

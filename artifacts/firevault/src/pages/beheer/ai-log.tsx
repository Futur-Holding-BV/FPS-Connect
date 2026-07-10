import { useState, useEffect } from "react";
import { Bot, TrendingUp, AlertCircle, Clock, Loader2, Filter, RefreshCw, Download, TriangleAlert, Settings2, Check, Trash2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useListAiAanroepen, useGetAiAanroepenAggregaat, useGetAiDrempelStatus, useGetInfoInstellingen, useUpdateInfoInstellingen } from "@workspace/api-client-react";
import { useRol } from "@/context/rol-context";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

const MODULE_OPTIES = [
  "bibliotheek",
  "crm",
  "document",
  "email",
  "gebouw",
  "hrm",
  "offerte",
  "snagstream",
  "spot",
  "systeem",
];

const STATUS_OPTIES = [
  { waarde: "ok", label: "OK" },
  { waarde: "fout", label: "Fout" },
  { waarde: "timeout", label: "Timeout" },
];

function statusKleur(status: string): string {
  switch (status) {
    case "ok": return "bg-green-100 text-green-800 border-green-200";
    case "fout": return "bg-red-100 text-red-800 border-red-200";
    case "timeout": return "bg-orange-100 text-orange-800 border-orange-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function formatDatum(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatKosten(val: string | number | null | undefined): string {
  if (val == null) return "—";
  const n = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(n)) return "—";
  if (n === 0) return "€ 0,00";
  if (n < 0.001) return `€ ${n.toFixed(6)}`;
  return `€ ${n.toFixed(4)}`;
}

function formatDuur(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function DrempelInstellingKaart() {
  const queryClient = useQueryClient();
  const { data: instelling } = useGetInfoInstellingen();
  const { data: drempelStatus } = useGetAiDrempelStatus({
    query: { queryKey: ["ai-drempel-status"] },
  });

  const bestaandeDrempel = instelling?.ai_kostendrempel_eur ?? null;
  const [invoer, setInvoer] = useState<string>("");
  const [bewerken, setBewerken] = useState(false);
  const [opslaan, setOpslaan] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const updateMutatie = useUpdateInfoInstellingen();

  function startBewerken() {
    setInvoer(bestaandeDrempel != null ? String(bestaandeDrempel) : "");
    setFout(null);
    setBewerken(true);
  }

  function annuleren() {
    setBewerken(false);
    setInvoer("");
    setFout(null);
  }

  const [aiMaandelijkseExportDag, setAiMaandelijkseExportDag] = useState<string>("");
  const [aiMaandelijkseExportEmail, setAiMaandelijkseExportEmail] = useState<string>("");

  useEffect(() => {
    if (instelling) {
      setAiMaandelijkseExportDag(instelling.ai_maandelijkse_export_dag != null ? String(instelling.ai_maandelijkse_export_dag) : "");
      setAiMaandelijkseExportEmail(instelling.ai_maandelijkse_export_email ?? "");
    }
  }, [instelling]);

  async function opslaan_handler() {
    const waarde = invoer.trim();
    let numVal: number | null = null;

    if (waarde !== "") {
      numVal = parseFloat(waarde.replace(",", "."));
      if (isNaN(numVal) || numVal < 0) {
        setFout("Voer een geldig bedrag in (bijv. 10 of 25.50).");
        return;
      }
    }

    const dagNum = aiMaandelijkseExportDag === "" ? null : parseInt(aiMaandelijkseExportDag, 10);
    if (dagNum !== null && (isNaN(dagNum) || dagNum < 1 || dagNum > 28)) {
      setFout("De exportdag moet tussen 1 en 28 liggen.");
      return;
    }

    setOpslaan(true);
    setFout(null);
    try {
      await updateMutatie.mutateAsync({
        data: {
          ...( instelling ? {
            support_email: instelling.support_email ?? undefined,
            support_telefoon: instelling.support_telefoon ?? undefined,
            support_website: instelling.support_website ?? undefined,
            extra_disclaimer: instelling.extra_disclaimer ?? undefined,
            opdrachtbevestiging_auto_verzenden: instelling.opdrachtbevestiging_auto_verzenden,
            moments_verjaardag_ingeschakeld: instelling.moments_verjaardag_ingeschakeld,
          } : {}),
          ai_kostendrempel_eur: numVal,
          ai_maandelijkse_export_dag: dagNum,
          ai_maandelijkse_export_email: aiMaandelijkseExportEmail || null,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ai-drempel-status"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/info/instellingen"] }),
      ]);
      setBewerken(false);
      setInvoer("");
    } catch {
      setFout("Opslaan mislukt. Probeer opnieuw.");
    } finally {
      setOpslaan(false);
    }
  }

  const voortgang = drempelStatus && bestaandeDrempel != null && bestaandeDrempel > 0
    ? Math.min(100, (drempelStatus.huidig_maand_kosten_eur / bestaandeDrempel) * 100)
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Maandelijkse kostendrempel
          </CardTitle>
          {!bewerken && (
            <Button variant="ghost" size="sm" onClick={startBewerken}>
              {bestaandeDrempel != null ? "Wijzigen" : "Instellen"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!bewerken ? (
          <div className="space-y-3">
            {bestaandeDrempel != null ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold">
                    {formatKosten(bestaandeDrempel)}
                  </span>
                  <span className="text-sm text-muted-foreground">per maand</span>
                </div>
                {drempelStatus && voortgang != null && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        Huidig: {formatKosten(drempelStatus.huidig_maand_kosten_eur)}
                      </span>
                      <span>{voortgang.toFixed(0)}% van drempel</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          voortgang >= 100
                            ? "bg-red-500"
                            : voortgang >= 80
                            ? "bg-orange-500"
                            : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(100, voortgang)}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Geen drempel ingesteld. Klik op "Instellen" om een maandelijks kostenplafond in te stellen.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Kostenplafond in euro per maand (leeg = geen drempel)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">€</span>
                <Input
                  className="h-8 text-sm w-36"
                  placeholder="bijv. 10.00"
                  value={invoer}
                  onChange={(e) => setInvoer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void opslaan_handler();
                    if (e.key === "Escape") annuleren();
                  }}
                  autoFocus
                />
              </div>
            {fout && <p className="text-xs text-red-600 mt-1">{fout}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Maandelijkse exportdag (1-28)
                </label>
                <Input
                  className="h-8 text-sm"
                  type="number"
                  min="1"
                  max="28"
                  value={aiMaandelijkseExportDag}
                  onChange={(e) => setAiMaandelijkseExportDag(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  E-mailadres voor maandelijkse export
                </label>
                <Input
                  className="h-8 text-sm"
                  type="email"
                  placeholder="beheer@voorbeeld.nl"
                  value={aiMaandelijkseExportEmail}
                  onChange={(e) => setAiMaandelijkseExportEmail(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              De drempelmelding wordt eenmalig per maand verstuurd. Als je de drempel verlaagt, wordt de melding direct opnieuw ingeschakeld.
            </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => void opslaan_handler()}
                disabled={opslaan}
              >
                {opslaan ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Check className="h-3.5 w-3.5 mr-1" />
                )}
                Opslaan
              </Button>
              <Button size="sm" variant="ghost" onClick={annuleren} disabled={opslaan}>
                Annuleren
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DrempelBanner() {
  const [verborgen, setVerborgen] = useState(false);
  const { data: drempelStatus } = useGetAiDrempelStatus({
    query: { queryKey: ["ai-drempel-status"] },
  });

  if (!drempelStatus?.overschreden || verborgen) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-3 rounded-lg bg-orange-50 border border-orange-300 text-orange-900"
    >
      <TriangleAlert className="h-5 w-5 shrink-0 text-orange-600" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm">
          Maandelijkse kostendrempel overschreden
        </span>
        <p className="text-xs text-orange-700 mt-0.5">
          De AI-kosten deze maand ({formatKosten(drempelStatus.huidig_maand_kosten_eur)}) zijn
          hoger dan het ingestelde plafond ({formatKosten(drempelStatus.drempel_eur)}).
          Pas de drempel aan via de instelling hieronder.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setVerborgen(true)}
        className="shrink-0 text-orange-600 hover:text-orange-800 text-xs underline"
      >
        Sluiten
      </button>
    </div>
  );
}

interface UploadLogRegel {
  id: number;
  gebruikerNaam: string | null;
  bestandsnaam: string;
  categorie: string;
  actie: string;
  impactNiveau: string;
  bevestigd: boolean;
  geweigerd: boolean;
  opmerking: string | null;
  aangemaaktOp: string;
}

function impactKleur(niveau: string): string {
  switch (niveau) {
    case "hoog":   return "bg-red-100 text-red-800 border-red-200";
    case "midden": return "bg-orange-100 text-orange-800 border-orange-200";
    case "laag":   return "bg-slate-100 text-slate-700 border-slate-200";
    default:       return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

function UploadLogSectie() {
  const [logRegels, setLogRegels] = useState<UploadLogRegel[]>([]);
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLaden(true);
    setFout(null);
    fetch("/api/slim-upload/log", { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: UploadLogRegel[]) => setLogRegels(data))
      .catch(() => setFout("Laden mislukt."))
      .finally(() => setLaden(false));
  }, [open]);

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Upload acties-log
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
            {open ? "Verbergen" : "Tonen"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Alle upload-acties via Slim uploaden — inclusief categorie, impact en of bevestiging vereist was.
        </p>
      </CardHeader>
      {open && (
        <CardContent className="p-0">
          {laden && (
            <div className="flex items-center gap-2 px-4 py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Laden…</span>
            </div>
          )}
          {fout && <p className="px-4 py-4 text-xs text-destructive">{fout}</p>}
          {!laden && !fout && logRegels.length === 0 && (
            <p className="px-4 py-6 text-xs text-muted-foreground text-center">Nog geen upload-acties geregistreerd.</p>
          )}
          {!laden && logRegels.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs py-2">Tijdstip</TableHead>
                    <TableHead className="text-xs py-2">Gebruiker</TableHead>
                    <TableHead className="text-xs py-2">Bestand</TableHead>
                    <TableHead className="text-xs py-2">Categorie</TableHead>
                    <TableHead className="text-xs py-2">Actie</TableHead>
                    <TableHead className="text-xs py-2">Impact</TableHead>
                    <TableHead className="text-xs py-2">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logRegels.slice(0, 100).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs py-2 whitespace-nowrap">
                        {new Date(r.aangemaaktOp).toLocaleString("nl-NL", {
                          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-xs py-2">{r.gebruikerNaam ?? "—"}</TableCell>
                      <TableCell className="text-xs py-2 max-w-[160px] truncate" title={r.bestandsnaam}>
                        {r.bestandsnaam}
                      </TableCell>
                      <TableCell className="text-xs py-2">{r.categorie}</TableCell>
                      <TableCell className="text-xs py-2">{r.actie.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-xs py-2">
                        <Badge className={`text-[10px] border ${impactKleur(r.impactNiveau)}`} variant="outline">
                          {r.impactNiveau}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {r.geweigerd
                          ? <Badge variant="destructive" className="text-[10px]">Geweigerd</Badge>
                          : r.bevestigd
                            ? <Badge className="text-[10px] bg-green-100 text-green-800 border-green-200" variant="outline">Bevestigd</Badge>
                            : <Badge variant="secondary" className="text-[10px]">Klaargezet</Badge>
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function AiVoorstellenSectie() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [voorstellen, setVoorstellen] = useState<any[]>([]);
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function laadVoorstellen() {
    setLaden(true);
    setFout(null);
    try {
      const r = await fetch("/api/beheer/ai-voorstellen");
      if (!r.ok) throw new Error("Laden mislukt");
      const data = await r.json();
      setVoorstellen(data);
    } catch {
      setFout("Laden mislukt.");
    } finally {
      setLaden(false);
    }
  }

  useEffect(() => {
    if (open) void laadVoorstellen();
  }, [open]);

  async function handleVerwijder(id: number) {
    if (!confirm("Weet u zeker dat u deze correctie wilt verwijderen?")) return;
    try {
      const r = await fetch(`/api/beheer/ai-voorstellen/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Verwijderen mislukt");
      toast({ title: "Verwijderd", description: "De AI-correctie is verwijderd." });
      void laadVoorstellen();
    } catch {
      toast({ title: "Fout", description: "Verwijderen mislukt.", variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            AI-correcties (leerset)
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
            {open ? "Verbergen" : "Tonen"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Opgeslagen AI-correcties van monteurs voor herkenning-optimalisatie.
        </p>
      </CardHeader>
      {open && (
        <CardContent className="p-0">
          {laden && (
            <div className="flex items-center gap-2 px-4 py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Laden…</span>
            </div>
          )}
          {fout && <p className="px-4 py-4 text-xs text-destructive">{fout}</p>}
          {!laden && !fout && voorstellen.length === 0 && (
            <p className="px-4 py-6 text-xs text-muted-foreground text-center">Nog geen AI-correcties geregistreerd.</p>
          )}
          {!laden && voorstellen.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs py-2">Datum</TableHead>
                    <TableHead className="text-xs py-2">Gebouw</TableHead>
                    <TableHead className="text-xs py-2">Spot ID</TableHead>
                    <TableHead className="text-xs py-2">Herkomst</TableHead>
                    <TableHead className="text-xs py-2">Status</TableHead>
                    <TableHead className="text-xs py-2 text-right">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {voorstellen.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs py-2 whitespace-nowrap">
                        {new Date(r.aangemaakt_op).toLocaleDateString("nl-NL")}
                      </TableCell>
                      <TableCell className="text-xs py-2">{r.gebouw_naam ?? "—"}</TableCell>
                      <TableCell className="text-xs py-2">{r.voorziening_id}</TableCell>
                      <TableCell className="text-xs py-2">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {r.herkomst}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {r.bevestigd ? (
                          <Badge className="text-[10px] bg-green-100 text-green-800 border-green-200" variant="outline">Geverifieerd</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Wachtend</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.open(`/gebouwen/${r.gebouw_id}/plattegrond?spot=${r.voorziening_id}`)}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleVerwijder(r.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function AiLogPagina() {
  const { rol } = useRol();
  const [, navigate] = useLocation();
  const rolStr = rol as string;

  const [module, setModule] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [gebouwNaam, setGebouwNaam] = useState<string>("");
  const [offerteId, setOfferteId] = useState<string>("");
  const [datumVan, setDatumVan] = useState<string>("");
  const [datumTot, setDatumTot] = useState<string>("");
  const [pagina, setPagina] = useState(1);

  const listParams = {
    pagina,
    per_pagina: 50,
    ...(module ? { module } : {}),
    ...(status ? { status } : {}),
    ...(gebouwNaam.trim() ? { gebouw_naam: gebouwNaam.trim() } : {}),
    ...(offerteId && !isNaN(parseInt(offerteId)) ? { offerte_id: parseInt(offerteId) } : {}),
    ...(datumVan ? { datum_van: datumVan } : {}),
    ...(datumTot ? { datum_tot: datumTot } : {}),
  };

  const aggParams = {
    ...(module ? { module } : {}),
    ...(datumVan ? { datum_van: datumVan } : {}),
    ...(datumTot ? { datum_tot: datumTot } : {}),
  };

  const { data: lijst, isLoading: lijstLaden, refetch } = useListAiAanroepen(listParams, {
    query: { queryKey: ["ai-aanroepen-lijst", listParams] },
  });

  const { data: agg, isLoading: aggLaden } = useGetAiAanroepenAggregaat(aggParams, {
    query: { queryKey: ["ai-aanroepen-agg", aggParams] },
  });

  if (rolStr !== "hoofdbeheerder") {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Geen toegang tot deze pagina.
      </div>
    );
  }

  function handleExportCsv() {
    const params = new URLSearchParams();
    if (module) params.set("module", module);
    if (status) params.set("status", status);
    if (gebouwNaam) params.set("gebouw_naam", gebouwNaam);
    if (offerteId && !isNaN(parseInt(offerteId))) params.set("offerte_id", offerteId);
    if (datumVan) params.set("datum_van", datumVan);
    if (datumTot) params.set("datum_tot", datumTot);
    const query = params.toString();
    const url = `/api/beheer/ai-aanroepen/export${query ? `?${query}` : ""}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function resetFilters() {
    setModule("");
    setStatus("");
    setGebouwNaam("");
    setOfferteId("");
    setDatumVan("");
    setDatumTot("");
    setPagina(1);
  }

  function handleFilterWijzig() {
    setPagina(1);
  }

  const totaalPaginas = lijst ? Math.ceil(lijst.totaal / 50) : 1;
  const heeftFilters = module || status || gebouwNaam || offerteId || datumVan || datumTot;

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <Bot className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">AI-aanroepen</h1>
          <p className="text-sm text-muted-foreground">
            Inzicht in alle AI-aanroepen per module, entiteit en periode
          </p>
        </div>
      </div>

      <DrempelBanner />

      {/* Aggregaat kaarten */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Totaal aanroepen
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aggLaden ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-2xl font-bold">{agg?.totaal_aanroepen ?? 0}</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Geschatte kosten
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aggLaden ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-2xl font-bold">
                {formatKosten(agg?.totaal_kosten_eur)}
              </span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Totaal tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aggLaden ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-2xl font-bold">
                {agg?.totaal_tokens != null
                  ? agg.totaal_tokens >= 1000000
                    ? `${(agg.totaal_tokens / 1000000).toFixed(2)}M`
                    : agg.totaal_tokens >= 1000
                    ? `${(agg.totaal_tokens / 1000).toFixed(1)}k`
                    : String(agg.totaal_tokens)
                  : "0"}
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Drempel instelling */}
      <DrempelInstellingKaart />

      {/* Kosten per module */}
      {agg && agg.per_module.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Kosten per module</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {agg.per_module.map((r) => (
                <div
                  key={r.module}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/40 text-sm"
                >
                  <span className="font-medium capitalize">{r.module}</span>
                  <span className="text-muted-foreground">
                    {r.aanroepen}x &middot; {formatKosten(r.kosten_eur)} &middot; {formatTokens(r.tokens)} tokens
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
            {heeftFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Wis filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Module</label>
              <Select
                value={module || "alle"}
                onValueChange={(v) => { setModule(v === "alle" ? "" : v); handleFilterWijzig(); }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Alle modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle modules</SelectItem>
                  {MODULE_OPTIES.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status</label>
              <Select
                value={status || "alle"}
                onValueChange={(v) => { setStatus(v === "alle" ? "" : v); handleFilterWijzig(); }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Alle statussen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle statussen</SelectItem>
                  {STATUS_OPTIES.map((s) => (
                    <SelectItem key={s.waarde} value={s.waarde}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Gebouw-naam</label>
              <Input
                className="h-8 text-sm"
                placeholder="bijv. Kantoor"
                value={gebouwNaam}
                onChange={(e) => { setGebouwNaam(e.target.value); handleFilterWijzig(); }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Offerte-ID</label>
              <Input
                className="h-8 text-sm"
                placeholder="bijv. 7"
                value={offerteId}
                onChange={(e) => { setOfferteId(e.target.value); handleFilterWijzig(); }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Datum van</label>
              <Input
                className="h-8 text-sm"
                type="date"
                value={datumVan}
                onChange={(e) => { setDatumVan(e.target.value); handleFilterWijzig(); }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Datum tot</label>
              <Input
                className="h-8 text-sm"
                type="date"
                value={datumTot}
                onChange={(e) => { setDatumTot(e.target.value); handleFilterWijzig(); }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabel */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Aanroepen
              {lijst && (
                <span className="ml-2 font-normal text-muted-foreground text-xs">
                  ({lijst.totaal} gevonden)
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleExportCsv}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Exporteren
              </Button>
              <Button variant="ghost" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Verversen
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {lijstLaden ? (
            <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Laden...</span>
            </div>
          ) : !lijst || lijst.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <AlertCircle className="h-6 w-6" />
              <span className="text-sm">Geen aanroepen gevonden</span>
              {heeftFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Wis filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Tijdstip</TableHead>
                    <TableHead className="text-xs">Module</TableHead>
                    <TableHead className="text-xs">Functie</TableHead>
                    <TableHead className="text-xs">Model</TableHead>
                    <TableHead className="text-xs">Versie</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Tokens</TableHead>
                    <TableHead className="text-xs text-right">Kosten</TableHead>
                    <TableHead className="text-xs text-right">Duur</TableHead>
                    <TableHead className="text-xs">Context</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lijst.items.map((r) => (
                    <TableRow key={r.id} className="text-xs">
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDatum(r.aangemaakt_op)}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium capitalize">{r.module}</span>
                        {r.entiteitstype && (
                          <span className="text-muted-foreground ml-1">/ {r.entiteitstype}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.functie ?? "—"}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-[11px]">{r.model_naam}</span>
                        <span className="ml-1 text-muted-foreground">({r.model_slot})</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.prompt_versie ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${statusKleur(r.status)}`}
                        >
                          {r.status}
                        </Badge>
                        {r.foutmelding && (
                          <span
                            className="ml-1 text-[10px] text-red-600 truncate max-w-[120px] inline-block align-middle"
                            title={r.foutmelding}
                          >
                            {r.foutmelding}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTokens(r.total_tokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatKosten(r.geschatte_kosten_eur)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatDuur(r.duur_ms)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[11px]">
                        {r.gebouw_id != null && (
                          <button
                            className="underline decoration-dotted hover:text-foreground"
                            onClick={() => navigate(`/gebouwen/${r.gebouw_id}`)}
                          >
                            {r.gebouw_naam ?? `Gebouw ${r.gebouw_id}`}
                          </button>
                        )}
                        {r.offerte_id != null && (
                          <button
                            className="underline decoration-dotted hover:text-foreground ml-2"
                            onClick={() => navigate(`/offertes`)}
                          >
                            {r.offerte_referentie ?? `Offerte ${r.offerte_id}`}
                          </button>
                        )}
                        {r.project_id != null && (
                          <span className="ml-2">Project {r.project_id}</span>
                        )}
                        {r.gebouw_id == null && r.offerte_id == null && r.project_id == null && "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginering */}
      {totaalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Pagina {pagina} van {totaalPaginas}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              Vorige
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina >= totaalPaginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Volgende
            </Button>
          </div>
        </div>
      )}

      <AiVoorstellenSectie />
      <UploadLogSectie />
    </div>
  );
}

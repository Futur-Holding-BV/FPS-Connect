import { useState } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetFactuur,
  useUpdateFactuur,
  useAiUitlezenFactuur,
  useAccorderenFactuur,
  useBlokkerenFactuur,
  useExportAccountviewFactuur,
  useListFactuurExportLogs,
  useAfkeurenFactuur,
  useForceerHerexportFactuur,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Sparkles, CheckCircle2, AlertTriangle, XCircle,
  ArrowUpRight, Ban, Loader2, ChevronRight, Receipt, Shield,
  Info, Clock, RotateCcw, Eye,
} from "lucide-react";
import type { Factuur, AccountviewExportLog } from "@workspace/api-client-react";

const STATUS_LABEL: Record<string, string> = {
  ontvangen: "Ontvangen",
  ai_gelezen: "AI gelezen",
  controle_nodig: "Controle nodig",
  klaar_voor_boeking: "Klaar voor boeking",
  klaar_voor_accountview: "Klaar voor AccountView",
  verzonden_naar_accountview: "Verzonden naar AccountView",
  fout_bij_verzending: "Fout bij verzending",
  verwerkt: "Verwerkt",
  afgekeurd: "Afgekeurd",
};
const STATUS_KLEUR: Record<string, string> = {
  ontvangen: "bg-slate-100 text-slate-700",
  ai_gelezen: "bg-blue-100 text-blue-700",
  controle_nodig: "bg-amber-100 text-amber-700",
  klaar_voor_boeking: "bg-violet-100 text-violet-700",
  klaar_voor_accountview: "bg-emerald-100 text-emerald-700",
  verzonden_naar_accountview: "bg-green-100 text-green-700",
  fout_bij_verzending: "bg-red-100 text-red-700",
  verwerkt: "bg-green-100 text-green-700",
  afgekeurd: "bg-red-100 text-red-700",
};

function euro(v?: string | null) {
  if (!v) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(parseFloat(v));
}

function Veld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <div className="text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}

export default function FactuurDetailPagina() {
  const [, params] = useRoute("/facturen/:id");
  const id = parseInt(params?.id ?? "0", 10);
  const queryClient = useQueryClient();

  const [bewerkOpen, setBewerkOpen] = useState(false);
  const [blokkerenOpen, setBlokkerenOpen] = useState(false);
  const [blokkeringReden, setBlokkeringReden] = useState("");
  const [afkeurenOpen, setAfkeurenOpen] = useState(false);
  const [afkeurReden, setAfkeurReden] = useState("");
  const [herexportOpen, setHerexportOpen] = useState(false);
  const [herexportReden, setHerexportReden] = useState("");
  const [herexportBezig, setHerexportBezig] = useState(false);
  const [exportResultaat, setExportResultaat] = useState<{ geslaagd: boolean; boekingId?: string | null; fout?: string | null; testmodus?: boolean } | null>(null);
  const [aiBezig, setAiBezig] = useState(false);
  const [exportBezig, setExportBezig] = useState(false);

  const invalideer = () => {
    queryClient.invalidateQueries({ queryKey: ["factuur", id] });
    queryClient.invalidateQueries({ queryKey: ["facturen"] });
  };

  const { data: factuur, isLoading } = useGetFactuur(
    id,
    { query: { queryKey: ["factuur", id], enabled: id > 0 } },
  );
  const { data: exportLogs = [] } = useListFactuurExportLogs(
    id,
    { query: { queryKey: ["factuur-logs", id], enabled: id > 0 } },
  );

  const updateMut = useUpdateFactuur({ mutation: { onSuccess: invalideer } });
  const aiMut = useAiUitlezenFactuur({ mutation: { onSuccess: invalideer } });
  const accorderenMut = useAccorderenFactuur({ mutation: { onSuccess: invalideer } });
  const blokkerenMut = useBlokkerenFactuur({ mutation: { onSuccess: () => { invalideer(); setBlokkerenOpen(false); } } });
  const afkeurenMut = useAfkeurenFactuur({
    mutation: {
      onSuccess: () => { invalideer(); queryClient.invalidateQueries({ queryKey: ["factuur-logs", id] }); setAfkeurenOpen(false); setAfkeurReden(""); },
    },
  });
  const herexportMut = useForceerHerexportFactuur({
    mutation: {
      onSuccess: (data) => {
        invalideer();
        queryClient.invalidateQueries({ queryKey: ["factuur-logs", id] });
        const r = data as { status: string; boeking_id?: string | null; foutmelding?: string | null; testmodus: boolean };
        setExportResultaat({ geslaagd: r.status === "geslaagd", boekingId: r.boeking_id, fout: r.foutmelding, testmodus: r.testmodus });
        setHerexportOpen(false);
      },
    },
  });
  const exportMut = useExportAccountviewFactuur({
    mutation: {
      onSuccess: (data) => {
        invalideer();
        queryClient.invalidateQueries({ queryKey: ["factuur-logs", id] });
        const r = data as { status: string; boeking_id?: string | null; foutmelding?: string | null; testmodus: boolean };
        setExportResultaat({ geslaagd: r.status === "geslaagd", boekingId: r.boeking_id, fout: r.foutmelding, testmodus: r.testmodus });
      },
    },
  });

  const [bewerkVelden, setBewerkVelden] = useState<Record<string, string>>({});
  function bewerkVeld(k: string, v: string) { setBewerkVelden((f) => ({ ...f, [k]: v })); }

  function openBewerk(f: Factuur) {
    setBewerkVelden({
      factuurnummer: f.factuurnummer ?? "",
      factuurdatum: f.factuurdatum ?? "",
      vervaldatum: f.vervaldatum ?? "",
      relatienaam: f.relatienaam ?? "",
      relatie_code: f.relatie_code ?? "",
      relatie_adres: f.relatie_adres ?? "",
      omschrijving: f.omschrijving ?? "",
      bedrag_excl_btw: f.bedrag_excl_btw ?? "",
      btw_bedrag: f.btw_bedrag ?? "",
      bedrag_incl_btw: f.bedrag_incl_btw ?? "",
      btw_code: f.btw_code ?? "",
      grootboekrekening: f.grootboekrekening ?? "",
      kostenplaats: f.kostenplaats ?? "",
      dagboek: f.dagboek ?? "",
      project_code: f.project_code ?? "",
    });
    setBewerkOpen(true);
  }

  async function opslaan() {
    const data: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(bewerkVelden)) {
      data[k] = v || null;
    }
    await updateMut.mutateAsync({ id, data: data as Parameters<typeof updateMut.mutateAsync>[0]["data"] });
    setBewerkOpen(false);
  }

  if (isLoading) {
    return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Laden...</div>;
  }

  const f = factuur as Factuur | undefined;
  if (!f) return <div className="p-6 text-muted-foreground">Factuur niet gevonden.</div>;

  const logs = exportLogs as AccountviewExportLog[];
  const kanAi = (f.status === "ontvangen" || f.status === "controle_nodig") && !!f.pdf_url;
  const kanAccorderen = (f.status === "klaar_voor_boeking" || f.status === "ai_gelezen" || f.status === "controle_nodig") && !f.geblokkeerd && !f.geaccordeerd;
  const kanExporteren = f.status === "klaar_voor_accountview" && !f.geblokkeerd;
  const kanAfkeuren = f.status !== "verwerkt" && f.status !== "afgekeurd";
  const kanHerexport = f.status === "verwerkt" || f.status === "fout_bij_verzending";
  const isVerwerkt = f.status === "verwerkt";
  const heeftFout = f.status === "fout_bij_verzending";
  const isAfgekeurd = f.status === "afgekeurd";

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Navigatie */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/facturen">
          <button className="flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />Factuurverwerking
          </button>
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground truncate max-w-xs">{f.factuurnummer ?? f.bestandsnaam ?? `Factuur #${f.id}`}</span>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <Receipt className="h-8 w-8 text-primary mt-0.5 shrink-0" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-semibold text-slate-900">
                    {f.factuurnummer ?? f.bestandsnaam ?? `Factuur #${f.id}`}
                  </h1>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${f.type === "inkoop" ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-600"}`}>
                    {f.type === "inkoop" ? "Inkoopfactuur" : "Verkoopfactuur"}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${STATUS_KLEUR[f.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {STATUS_LABEL[f.status] ?? f.status}
                  </span>
                  {f.geblokkeerd && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                      <Ban className="h-3 w-3" />Geblokkeerd{f.blokkering_reden ? `: ${f.blokkering_reden}` : ""}
                    </span>
                  )}
                  {f.geaccordeerd && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
                      <Shield className="h-3 w-3" />Geaccordeerd {f.geaccordeerd_door_naam ? `door ${f.geaccordeerd_door_naam}` : ""}
                    </span>
                  )}
                  {isVerwerkt && f.accountview_boeking_id && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
                      <CheckCircle2 className="h-3 w-3" />AccountView {f.accountview_boeking_id}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {kanAi && (
                <Button size="sm" variant="outline" disabled={aiBezig} onClick={async () => { setAiBezig(true); await aiMut.mutateAsync({ id }); setAiBezig(false); }}>
                  {aiBezig ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />AI bezig...</> : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />AI uitlezen</>}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => openBewerk(f)}>Bewerken</Button>
              {kanAccorderen && (
                <Button size="sm" disabled={accorderenMut.isPending} onClick={() => accorderenMut.mutate({ id })}>
                  {accorderenMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                  Accorderen
                </Button>
              )}
              {kanExporteren && (
                <Button size="sm" disabled={exportBezig} onClick={async () => { setExportBezig(true); await exportMut.mutateAsync({ id }); setExportBezig(false); }}>
                  {exportBezig ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Verzenden...</> : <><ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />Verzenden naar AccountView</>}
                </Button>
              )}
              {heeftFout && (
                <Button size="sm" variant="outline" disabled={exportBezig} onClick={async () => { setExportBezig(true); await exportMut.mutateAsync({ id }); setExportBezig(false); }}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Opnieuw proberen
                </Button>
              )}
              {kanHerexport && (
                <Button size="sm" variant="outline" onClick={() => { setHerexportReden(""); setHerexportOpen(true); }}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Herexport
                </Button>
              )}
              {kanAfkeuren && (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { setAfkeurReden(""); setAfkeurenOpen(true); }}>
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />Afkeuren
                </Button>
              )}
              <Button
                size="sm"
                variant={f.geblokkeerd ? "outline" : "ghost"}
                className={f.geblokkeerd ? "" : "text-muted-foreground"}
                onClick={() => {
                  if (f.geblokkeerd) {
                    blokkerenMut.mutate({ id, data: { geblokkeerd: false } });
                  } else {
                    setBlokkeringReden("");
                    setBlokkerenOpen(true);
                  }
                }}
              >
                <Ban className="h-3.5 w-3.5 mr-1.5" />
                {f.geblokkeerd ? "Deblokkeren" : "Blokkeren"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Afgekeurd banner */}
      {isAfgekeurd && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Factuur afgekeurd</p>
            {!!(f as unknown as Record<string, unknown>)["afkeuring_reden"] && (
              <p className="mt-0.5">{String((f as unknown as Record<string, unknown>)["afkeuring_reden"])}</p>
            )}
            {!!(f as unknown as Record<string, unknown>)["afgekeurd_op"] && (
              <p className="text-xs mt-1 text-red-600">
                Afgekeurd op {new Date(String((f as unknown as Record<string, unknown>)["afgekeurd_op"])).toLocaleString("nl-NL")}
                {(f as unknown as Record<string, unknown>)["afgekeurd_door_naam"] ? ` door ${String((f as unknown as Record<string, unknown>)["afgekeurd_door_naam"])}` : ""}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Betaalstatus banner */}
      {(f as unknown as Record<string, unknown>)["betaalstatus"] === "betaald" && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <p>Betaald{(f as unknown as Record<string, unknown>)["betaaldatum"] ? ` op ${String((f as unknown as Record<string, unknown>)["betaaldatum"])}` : ""}</p>
        </div>
      )}
      {(f as unknown as Record<string, unknown>)["betaalstatus"] === "deels_betaald" && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>Gedeeltelijk betaald</p>
        </div>
      )}

      {/* Fout banner */}
      {heeftFout && f.accountview_fout && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Fout bij verzending naar AccountView</p>
            <p className="mt-0.5">{f.accountview_fout}</p>
            <p className="text-xs mt-1">Corrigeer de gegevens en klik op &ldquo;Opnieuw proberen&rdquo;.</p>
          </div>
        </div>
      )}

      {/* Gegevens */}
      <div className="grid grid-cols-2 gap-4">
        {/* Partijen & basinfo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Factuurgegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Veld label="Factuurnummer">{f.factuurnummer ?? "—"}</Veld>
              <Veld label="Type">{f.type === "inkoop" ? "Inkoopfactuur" : "Verkoopfactuur"}</Veld>
              <Veld label="Factuurdatum">{f.factuurdatum ?? "—"}</Veld>
              <Veld label="Vervaldatum">{f.vervaldatum ?? "—"}</Veld>
            </div>
            <Separator />
            <Veld label={f.type === "inkoop" ? "Crediteur" : "Debiteur"}>
              {f.relatienaam ?? "—"}
              {f.relatie_code && <span className="ml-2 font-mono text-xs text-muted-foreground">({f.relatie_code})</span>}
            </Veld>
            {f.relatie_adres && <Veld label="Adres">{f.relatie_adres}</Veld>}
            <Veld label="Omschrijving">{f.omschrijving ?? "—"}</Veld>
            {f.gebouw_naam && <Veld label="Gekoppeld gebouw">{f.gebouw_naam}</Veld>}
          </CardContent>
        </Card>

        {/* Bedragen & boekhoudkundige velden */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Financiële gegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Veld label="Bedrag excl. BTW">
                <span className="font-mono">{euro(f.bedrag_excl_btw)}</span>
              </Veld>
              <Veld label="BTW-bedrag">
                <span className="font-mono">{euro(f.btw_bedrag)}</span>
              </Veld>
              <div className="col-span-2">
                <Veld label="Bedrag incl. BTW">
                  <span className="font-mono text-base font-semibold">{euro(f.bedrag_incl_btw)}</span>
                </Veld>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <Veld label="BTW-code">
                {f.btw_code
                  ? <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-xs">{f.btw_code}</span>
                  : <span className="text-amber-600 flex items-center gap-1 text-xs"><AlertTriangle className="h-3 w-3" />Niet ingesteld</span>}
              </Veld>
              <Veld label="Dagboek">
                <span className="font-mono">{f.dagboek ?? "—"}</span>
              </Veld>
              <Veld label="Grootboekrekening">
                <span className="font-mono">{f.grootboekrekening ?? "—"}</span>
              </Veld>
              <Veld label="Kostenplaats">
                <span className="font-mono">{f.kostenplaats ?? "—"}</span>
              </Veld>
              {f.project_code && <Veld label="Projectcode"><span className="font-mono">{f.project_code}</span></Veld>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI metadata */}
      {f.ai_metadata && Object.keys(f.ai_metadata).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              AI-herkende gegevens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {Object.entries(f.ai_metadata as Record<string, unknown>)
                .filter(([k]) => !["controle_nodig", "controle_reden", "confidence", "type"].includes(k))
                .map(([k, v]) => (
                  <div key={k}>
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">{k.replace(/_/g, " ")}</span>
                    <p className="font-medium text-slate-700 mt-0.5 text-sm">{String(v ?? "—")}</p>
                  </div>
                ))}
            </div>
            {!!(f.ai_metadata as Record<string, unknown>)["controle_reden"] && (
              <div className="mt-3 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {String((f.ai_metadata as Record<string, unknown>)["controle_reden"])}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* PDF preview link */}
      {f.pdf_url && (
        <div className="flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <a
            href={`/api/storage/files?path=${encodeURIComponent(f.pdf_url)}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            PDF bekijken ({f.bestandsnaam ?? "factuur.pdf"})
          </a>
        </div>
      )}

      {/* Export logs */}
      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Exporthistorie ({logs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {logs.map((l) => (
                <div key={l.id} className={`rounded-lg border px-3 py-2 text-xs ${l.status === "geslaagd" ? "border-green-200 bg-green-50" : l.status === "mislukt" ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {l.status === "geslaagd" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : l.status === "mislukt" ? <XCircle className="h-3.5 w-3.5 text-red-600" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span className="font-medium capitalize">{l.status}</span>
                      {l.testmodus && <span className="text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Testmodus</span>}
                      {l.accountview_boeking_id && <span className="font-mono text-green-700">Boeking: {l.accountview_boeking_id}</span>}
                    </div>
                    <span className="text-muted-foreground">
                      {new Date(l.export_op).toLocaleString("nl-NL")}
                    </span>
                  </div>
                  {l.foutmelding && <p className="mt-1 text-red-700">{l.foutmelding}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bewerken dialog */}
      <Dialog open={bewerkOpen} onOpenChange={setBewerkOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Factuurgegevens bewerken</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Factuurnummer</Label>
                <Input className="mt-1" value={bewerkVelden["factuurnummer"] ?? ""} onChange={(e) => bewerkVeld("factuurnummer", e.target.value)} />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={f.type} disabled><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inkoop">Inkoopfactuur</SelectItem><SelectItem value="verkoop">Verkoopfactuur</SelectItem></SelectContent></Select>
              </div>
              <div>
                <Label>Factuurdatum</Label>
                <Input className="mt-1" type="date" value={bewerkVelden["factuurdatum"] ?? ""} onChange={(e) => bewerkVeld("factuurdatum", e.target.value)} />
              </div>
              <div>
                <Label>Vervaldatum</Label>
                <Input className="mt-1" type="date" value={bewerkVelden["vervaldatum"] ?? ""} onChange={(e) => bewerkVeld("vervaldatum", e.target.value)} />
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{f.type === "inkoop" ? "Crediteur" : "Debiteur"}</Label>
                <Input className="mt-1" value={bewerkVelden["relatienaam"] ?? ""} onChange={(e) => bewerkVeld("relatienaam", e.target.value)} />
              </div>
              <div>
                <Label>Relatiecode (AccountView)</Label>
                <Input className="mt-1 font-mono" placeholder="bijv. LEV001" value={bewerkVelden["relatie_code"] ?? ""} onChange={(e) => bewerkVeld("relatie_code", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Omschrijving</Label>
                <Input className="mt-1" value={bewerkVelden["omschrijving"] ?? ""} onChange={(e) => bewerkVeld("omschrijving", e.target.value)} />
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Bedrag excl. BTW</Label>
                <Input className="mt-1 font-mono" placeholder="0.00" value={bewerkVelden["bedrag_excl_btw"] ?? ""} onChange={(e) => bewerkVeld("bedrag_excl_btw", e.target.value)} />
              </div>
              <div>
                <Label>BTW-bedrag</Label>
                <Input className="mt-1 font-mono" placeholder="0.00" value={bewerkVelden["btw_bedrag"] ?? ""} onChange={(e) => bewerkVeld("btw_bedrag", e.target.value)} />
              </div>
              <div>
                <Label>Bedrag incl. BTW</Label>
                <Input className="mt-1 font-mono" placeholder="0.00" value={bewerkVelden["bedrag_incl_btw"] ?? ""} onChange={(e) => bewerkVeld("bedrag_incl_btw", e.target.value)} />
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>BTW-code</Label>
                <Input className="mt-1 font-mono" placeholder="bijv. H, L, V" value={bewerkVelden["btw_code"] ?? ""} onChange={(e) => bewerkVeld("btw_code", e.target.value)} />
              </div>
              <div>
                <Label>Dagboek</Label>
                <Input className="mt-1 font-mono" placeholder="INK / VRK" value={bewerkVelden["dagboek"] ?? ""} onChange={(e) => bewerkVeld("dagboek", e.target.value)} />
              </div>
              <div>
                <Label>Grootboekrekening</Label>
                <Input className="mt-1 font-mono" placeholder="4000" value={bewerkVelden["grootboekrekening"] ?? ""} onChange={(e) => bewerkVeld("grootboekrekening", e.target.value)} />
              </div>
              <div>
                <Label>Kostenplaats</Label>
                <Input className="mt-1 font-mono" value={bewerkVelden["kostenplaats"] ?? ""} onChange={(e) => bewerkVeld("kostenplaats", e.target.value)} />
              </div>
              <div>
                <Label>Projectcode</Label>
                <Input className="mt-1 font-mono" value={bewerkVelden["project_code"] ?? ""} onChange={(e) => bewerkVeld("project_code", e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBewerkOpen(false)}>Annuleren</Button>
            <Button disabled={updateMut.isPending} onClick={opslaan}>
              {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blokkeren dialog */}
      <Dialog open={blokkerenOpen} onOpenChange={setBlokkerenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Factuur blokkeren</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">De factuur wordt niet meer aangeboden voor export. U kunt de blokkering later opheffen.</p>
            <div>
              <Label>Reden (optioneel)</Label>
              <Input className="mt-1" placeholder="Bijv. in behandeling bij accountant" value={blokkeringReden} onChange={(e) => setBlokkeringReden(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlokkerenOpen(false)}>Annuleren</Button>
            <Button variant="destructive" disabled={blokkerenMut.isPending} onClick={() => blokkerenMut.mutate({ id, data: { geblokkeerd: true, reden: blokkeringReden || null } })}>
              Blokkeren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Afkeuren dialog */}
      <Dialog open={afkeurenOpen} onOpenChange={setAfkeurenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Factuur afkeuren</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              De factuur wordt teruggezet naar afgekeurd en kan niet meer worden geexporteerd totdat de status wordt gecorrigeerd.
            </p>
            <div>
              <Label>Reden (verplicht)</Label>
              <Input
                className="mt-1"
                placeholder="Bijv. onjuist BTW-tarief"
                value={afkeurReden}
                onChange={(e) => setAfkeurReden(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAfkeurenOpen(false)}>Annuleren</Button>
            <Button
              variant="destructive"
              disabled={afkeurenMut.isPending || !afkeurReden.trim()}
              onClick={() => afkeurenMut.mutate({ id, data: { reden: afkeurReden.trim() } })}
            >
              {afkeurenMut.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Afkeuren...</> : "Afkeuren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Herexport dialog */}
      <Dialog open={herexportOpen} onOpenChange={setHerexportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Herexport naar AccountView</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              De factuur wordt opnieuw verzonden naar AccountView, ook als deze al eerder is verwerkt.
            </p>
            <div>
              <Label>Reden (optioneel)</Label>
              <Input
                className="mt-1"
                placeholder="Bijv. gecorrigeerd na terugmelding"
                value={herexportReden}
                onChange={(e) => setHerexportReden(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHerexportOpen(false)}>Annuleren</Button>
            <Button
              disabled={herexportMut.isPending || herexportBezig}
              onClick={async () => {
                setHerexportBezig(true);
                await herexportMut.mutateAsync({ id, data: { reden: herexportReden || undefined } });
                setHerexportBezig(false);
              }}
            >
              {herexportMut.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Verzenden...</> : <><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Herexport starten</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export resultaat dialog */}
      {exportResultaat && (
        <Dialog open onOpenChange={() => setExportResultaat(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>AccountView export</DialogTitle></DialogHeader>
            {exportResultaat.geslaagd ? (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-green-800">Succesvol verzonden naar AccountView</p>
                  {exportResultaat.boekingId && <p className="text-sm text-green-700 mt-0.5">Boekingsnummer: <span className="font-mono">{exportResultaat.boekingId}</span></p>}
                  {exportResultaat.testmodus && <p className="text-xs text-amber-700 mt-1">(Testmodus — niet daadwerkelijk geboekt)</p>}
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
                <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-red-800">Export mislukt</p>
                  <p className="text-sm text-red-700 mt-0.5">{exportResultaat.fout}</p>
                </div>
              </div>
            )}
            <DialogFooter><Button onClick={() => setExportResultaat(null)}>Sluiten</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

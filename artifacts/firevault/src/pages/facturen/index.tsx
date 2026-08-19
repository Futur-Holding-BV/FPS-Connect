import { useState } from "react";
import { Link } from "wouter";
import {
  useListFacturen,
  useCreateFactuur,
  useDeleteFactuur,
  useAiUitlezenFactuur,
  useListGebouwen,
  useGetFactuurPrijscontroleMaandtotaal,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Receipt, Upload, Sparkles, Eye, Trash2, Loader2, Plus, AlertCircle,
  CheckCircle2, Clock, ArrowUpRight, XCircle, Ban, ChevronRight, FileDown, Archive, Gavel,
} from "lucide-react";
import type { Factuur } from "@workspace/api-client-react";
import { PaginaHulp } from "@/components/pagina-hulp";
import { GoedkeuringLabel } from "@/components/goedkeuring/goedkeuring-label";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";

const STATUS_LABEL: Record<string, string> = {
  ontvangen: "Ontvangen",
  ai_gelezen: "AI gelezen",
  controle_nodig: "Controle nodig",
  klaar_voor_boeking: "Klaar voor boeking",
  klaar_voor_accountview: "Klaar voor AccountView",
  verzonden_naar_accountview: "Verzonden",
  fout_bij_verzending: "Fout",
  verwerkt: "Verwerkt",
  geblokkeerd: "Geblokkeerd",
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
};

const STATUS_ICOON: Record<string, React.ReactNode> = {
  ontvangen: <Clock className="h-3 w-3" />,
  ai_gelezen: <Sparkles className="h-3 w-3" />,
  controle_nodig: <AlertCircle className="h-3 w-3" />,
  klaar_voor_boeking: <CheckCircle2 className="h-3 w-3" />,
  klaar_voor_accountview: <ArrowUpRight className="h-3 w-3" />,
  fout_bij_verzending: <XCircle className="h-3 w-3" />,
  verwerkt: <CheckCircle2 className="h-3 w-3" />,
};

const GEEN_GEBOUW = "__geen_gebouw__";

function euro(v?: string | null) {
  if (!v) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(parseFloat(v));
}

// PRIJS_01 §6 — rustige maandkaart met het totaal "te veel betaald" t.o.v. de
// afgesproken jaarprijzen. Toont niets als er geen afwijkingen zijn.
function PrijsafwijkingMaandkaart() {
  const now = new Date();
  const maand = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { data } = useGetFactuurPrijscontroleMaandtotaal(
    { maand },
    { query: { queryKey: ["factuur-prijscontrole-maandtotaal", maand] } },
  );
  if (!data || data.aantal_afwijkingen === 0) return null;
  const bedrag = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(data.totaal_meer_betaald);
  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="py-3 px-4 flex items-center gap-3">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
        <div className="text-sm text-amber-900">
          <span className="font-medium">{bedrag} boven de jaarprijzen deze maand</span>
          <span className="text-amber-700"> — {data.aantal_afwijkingen} factuurregel{data.aantal_afwijkingen !== 1 ? "s" : ""} boven de afgesproken prijs. Een signaal, geen fout.</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FacturenPagina() {
  const queryClient = useQueryClient();
  const { heeftNiveau } = useBevoegdheid();
  const magMuteren = heeftNiveau("financieel", 2);
  const [tab, setTab] = useState<string>("alle");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bestand, setBestand] = useState<File | null>(null);
  const [type] = useState("verkoop");
  const [gebouwId, setGebouwId] = useState("");
  const [uploadBezig, setUploadBezig] = useState(false);
  const [aiBezig, setAiBezig] = useState<number | null>(null);

  const isHistorischTab = tab === "historisch";
  const isIncassoTab = tab === "incasso";
  const statusFilter = (tab === "alle" || isHistorischTab || isIncassoTab) ? undefined : tab;
  const { data: facturenRaw = [], isLoading } = useListFacturen(
    { ...(statusFilter ? { status: statusFilter } : {}) },
    { query: { queryKey: ["facturen", tab] } },
  );
  const facturen = isIncassoTab
    ? (facturenRaw as Factuur[]).filter((f) => (f as Factuur & { betaalstatus?: string }).betaalstatus === "incasso")
    : facturenRaw;
  const { data: gebouwen = [] } = useListGebouwen({}, { query: { queryKey: ["gebouwen-facturen"] } });

  const deleteMut = useDeleteFactuur({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["facturen"] }) } });
  const aiMut = useAiUitlezenFactuur({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["facturen"] }) } });
  const createMut = useCreateFactuur({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["facturen"] }) } });
  const { uploadFile, isUploading } = useUpload({ bestand_type: "factuur" });

  async function handleUpload() {
    if (!bestand) return;
    setUploadBezig(true);
    try {
      const result = await uploadFile(bestand);
      if (!result) return;
      await createMut.mutateAsync({
        data: {
          type,
          bestandsnaam: bestand.name,
          pdf_url: result.objectPath,
          gebouw_id: gebouwId ? parseInt(gebouwId, 10) : undefined,
        },
      });
      setUploadOpen(false);
      setBestand(null);
      setGebouwId("");
    } finally {
      setUploadBezig(false);
    }
  }

  const lijst = facturen as (Factuur & { betaalstatus?: string })[];

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <PaginaHulp pagina="facturen" />
      {/* Koptekst */}
      <div className="flex items-center justify-between">
        <div>
          <h1 data-paginatitel className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            Factuurverwerking
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ontvang, lees uit met AI, accordeer en exporteer facturen naar AccountView.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/facturen/klaar-voor-export">
            <Button size="sm" variant="outline">
              <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />
              Klaar voor export
            </Button>
          </Link>
          {magMuteren && (
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Verkoopfactuur uploaden
            </Button>
          )}
        </div>
      </div>

      {/* PRIJS_01 §6 — maandtotaal prijsafwijkingen t.o.v. de jaarprijzen */}
      <PrijsafwijkingMaandkaart />

      {/* Status-tabs */}
      <div className="flex items-center justify-between gap-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="alle">Alle</TabsTrigger>
            <TabsTrigger value="ontvangen">Ontvangen</TabsTrigger>
            <TabsTrigger value="controle_nodig">Controle nodig</TabsTrigger>
            <TabsTrigger value="klaar_voor_boeking">Klaar voor boeking</TabsTrigger>
            <TabsTrigger value="klaar_voor_accountview">Exportklaar</TabsTrigger>
            <TabsTrigger value="verwerkt">Verwerkt</TabsTrigger>
            <TabsTrigger value="fout_bij_verzending">Fouten</TabsTrigger>
            <TabsTrigger value="incasso" className="gap-1.5">
              <Gavel className="h-3.5 w-3.5" />
              Incasso
            </TabsTrigger>
            <TabsTrigger value="historisch" className="gap-1.5">
              <Archive className="h-3.5 w-3.5" />
              Historisch archief
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {isHistorischTab && magMuteren && (
          <a href="/api/facturen/historisch-archief/excel" download>
            <Button size="sm" variant="outline">
              <FileDown className="h-3.5 w-3.5 mr-1.5" />
              Exporteren als Excel
            </Button>
          </a>
        )}
      </div>

      {/* Tabel */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-10">
          <Loader2 className="h-4 w-4 animate-spin" /> Laden...
        </div>
      ) : lijst.length === 0 ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="font-medium">Nog geen facturen</p>
            <p className="text-xs mt-1">Inkoopfacturen komen automatisch binnen via de factuurmailbox; verkoopfacturen kun je hier uploaden.</p>
          </div>
          {magMuteren && (
            <div className="text-center pt-2">
              <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Eerste verkoopfactuur uploaden
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Factuur</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Relatie</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Datum</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-600">Bedrag incl.</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-600">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lijst.map((f) => (
                <tr key={f.id} className={`hover:bg-slate-50/50 ${f.geblokkeerd ? "opacity-60" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${f.type === "inkoop" ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-600"}`}>
                        {f.type === "inkoop" ? "INK" : "VRK"}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {f.kenmerk && (
                            <span
                              className="font-mono text-xs font-semibold tracking-wide text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5 select-all"
                              title="Kenmerk (automatisch berekend, niet bewerkbaar)"
                            >
                              {f.kenmerk}
                            </span>
                          )}
                          <p className="font-medium text-slate-900 truncate max-w-48">
                            {f.factuurnummer ?? f.bestandsnaam ?? `Factuur #${f.id}`}
                          </p>
                        </div>
                        {f.factuurnummer && f.bestandsnaam && (
                          <p className="text-xs text-muted-foreground truncate max-w-48">{f.bestandsnaam}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-36">
                    {f.relatienaam ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {f.factuurdatum ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm">
                    {euro(f.bedrag_incl_btw)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        {f.geblokkeerd && <Ban className="h-3.5 w-3.5 text-slate-500" />}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${STATUS_KLEUR[f.status] ?? "bg-slate-100 text-slate-600"}`}>
                          {STATUS_ICOON[f.status]}
                          {STATUS_LABEL[f.status] ?? f.status}
                        </span>
                      </div>
                      {(() => {
                        const fx = f as Factuur & { subtype?: string | null };
                        const docType = fx.subtype === "creditnota" ? "creditnota"
                          : fx.subtype === "prijsafwijking" ? "prijsafwijking"
                          : f.type === "inkoop" ? "inkoop_factuur" : "verkoop_factuur";
                        return (
                          <GoedkeuringLabel
                            objectType={docType}
                            objectId={f.id}
                            koppeling={`/facturen/${f.id}`}
                          />
                        );
                      })()}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {magMuteren && (f.status === "ontvangen" || f.status === "controle_nodig") && f.pdf_url && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={aiBezig === f.id}
                          onClick={() => {
                            setAiBezig(f.id);
                            aiMut.mutate({ id: f.id }, { onSettled: () => setAiBezig(null) });
                          }}
                        >
                          {aiBezig === f.id
                            ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            : <Sparkles className="h-3 w-3 mr-1" />}
                          AI
                        </Button>
                      )}
                      <Link href={`/facturen/${f.id}`}>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      {magMuteren && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => { if (confirm("Factuur verwijderen?")) deleteMut.mutate({ id: f.id }); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verkoopfactuur uploaden</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Inkoopfacturen komen uitsluitend binnen via de factuurmailbox en worden
              automatisch door de factuurstroom verwerkt. Handmatig uploaden is alleen
              mogelijk voor verkoopfacturen.
            </div>
            <div>
              <Label>PDF-bestand</Label>
              <Input type="file" accept=".pdf" className="mt-1" onChange={(e) => setBestand(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <Label>Koppelen aan gebouw (optioneel)</Label>
              <Select
                value={gebouwId || GEEN_GEBOUW}
                onValueChange={(value) => setGebouwId(value === GEEN_GEBOUW ? "" : value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Kies een gebouw..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GEEN_GEBOUW}>Niet koppelen</SelectItem>
                  {(gebouwen as Array<{ id: number; naam: string }>).map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Annuleren</Button>
            <Button disabled={!bestand || uploadBezig || isUploading} onClick={handleUpload}>
              {(uploadBezig || isUploading) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Uploaden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

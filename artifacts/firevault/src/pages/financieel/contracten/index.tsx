import { useState, useMemo } from "react";
import {
  useListFinancieleContracten,
  useCreateFinancieelContract,
  useUpdateFinancieelContract,
  useDeleteFinancieelContract,
  useGetFinancieleBesparingskansen,
  useListFinancieleContractSignaleringen,
  useBewaakFinancieleContracten,
  getListFinancieleContractenQueryKey,
  getGetFinancieleBesparingskansenQueryKey,
  getListFinancieleContractSignaleringenQueryKey,
} from "@workspace/api-client-react";
import type {
  FinancieelContract,
  FinancieelContractInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ScrollText, Plus, Search, Lightbulb, Bell, Pencil, Trash2, RefreshCw,
} from "lucide-react";
import { ContractDetailDialog } from "./detail";

const eur = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const CATEGORIEEN = [
  { waarde: "verzekering", label: "Verzekering" },
  { waarde: "lease", label: "Lease" },
  { waarde: "onderhoud", label: "Onderhoud" },
  { waarde: "software", label: "Software" },
  { waarde: "telecom", label: "Telecom" },
  { waarde: "abonnement", label: "Abonnement" },
  { waarde: "overig", label: "Overig" },
];

const STATUS_KLEUR: Record<string, string> = {
  actief: "bg-emerald-100 text-emerald-700 border-emerald-200",
  concept: "bg-slate-100 text-slate-700 border-slate-200",
  opgezegd: "bg-rose-100 text-rose-700 border-rose-200",
  verlopen: "bg-amber-100 text-amber-700 border-amber-200",
};

const PERIODE_LABEL: Record<string, string> = { maand: "per maand", jaar: "per jaar", eenmalig: "eenmalig" };
const ERNST_KLEUR: Record<string, string> = {
  kritiek: "bg-rose-100 text-rose-700 border-rose-200",
  waarschuwing: "bg-amber-100 text-amber-700 border-amber-200",
  info: "bg-sky-100 text-sky-700 border-sky-200",
};

function categorieLabel(w: string): string {
  return CATEGORIEEN.find((c) => c.waarde === w)?.label ?? w;
}

function jaarlijks(c: FinancieelContract): number | null {
  if (c.kosten_bedrag == null) return null;
  if (c.kosten_periode === "maand") return c.kosten_bedrag * 12;
  if (c.kosten_periode === "eenmalig") return 0;
  return c.kosten_bedrag;
}

const LEEG_FORM: FinancieelContractInput = {
  naam: "",
  categorie: "verzekering",
  leverancier: "",
  kosten_bedrag: null,
  kosten_periode: "jaar",
  status: "actief",
  einddatum: "",
  opzegtermijn_maanden: null,
  indexering_percentage: null,
  notities: "",
};

export default function ContractenPagina() {
  const queryClient = useQueryClient();
  const { data: contracten, isLoading } = useListFinancieleContracten();
  const { data: besparingen } = useGetFinancieleBesparingskansen();
  const { data: signaleringen } = useListFinancieleContractSignaleringen();

  const [zoek, setZoek] = useState("");
  const [categorieFilter, setCategorieFilter] = useState<string>("alle");
  const [formOpen, setFormOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [form, setForm] = useState<FinancieelContractInput>(LEEG_FORM);
  const [detailId, setDetailId] = useState<number | null>(null);

  const invalideerAlles = () => {
    queryClient.invalidateQueries({ queryKey: getListFinancieleContractenQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetFinancieleBesparingskansenQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListFinancieleContractSignaleringenQueryKey() });
  };

  const aanmaken = useCreateFinancieelContract({ mutation: { onSuccess: invalideerAlles } });
  const bijwerken = useUpdateFinancieelContract({ mutation: { onSuccess: invalideerAlles } });
  const verwijderen = useDeleteFinancieelContract({ mutation: { onSuccess: invalideerAlles } });
  const bewaken = useBewaakFinancieleContracten({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListFinancieleContractSignaleringenQueryKey() }) },
  });

  const gefilterd = useMemo(() => {
    const lijst = contracten ?? [];
    const zt = zoek.trim().toLowerCase();
    return lijst.filter((c) => {
      if (categorieFilter !== "alle" && c.categorie !== categorieFilter) return false;
      if (!zt) return true;
      return (
        c.naam.toLowerCase().includes(zt) ||
        (c.leverancier ?? "").toLowerCase().includes(zt) ||
        (c.contractnummer ?? "").toLowerCase().includes(zt)
      );
    });
  }, [contracten, zoek, categorieFilter]);

  const totaalJaar = useMemo(
    () => (contracten ?? []).filter((c) => c.status === "actief").reduce((s, c) => s + (jaarlijks(c) ?? 0), 0),
    [contracten],
  );

  const openNieuw = () => {
    setBewerkId(null);
    setForm(LEEG_FORM);
    setFormOpen(true);
  };
  const openBewerk = (c: FinancieelContract) => {
    setBewerkId(c.id);
    setForm({
      naam: c.naam,
      categorie: c.categorie,
      leverancier: c.leverancier ?? "",
      contractnummer: c.contractnummer ?? "",
      werkgever_id: c.werkgever_id ?? null,
      ingangsdatum: c.ingangsdatum ?? "",
      einddatum: c.einddatum ?? "",
      opzegtermijn_maanden: c.opzegtermijn_maanden ?? null,
      kosten_bedrag: c.kosten_bedrag ?? null,
      kosten_periode: c.kosten_periode,
      indexering_percentage: c.indexering_percentage ?? null,
      indexering_maand: c.indexering_maand ?? null,
      contractwaarde: c.contractwaarde ?? null,
      automatische_verlenging: c.automatische_verlenging,
      aantal_licenties: c.aantal_licenties ?? null,
      aantal_in_gebruik: c.aantal_in_gebruik ?? null,
      status: c.status,
      document_id: c.document_id ?? null,
      notities: c.notities ?? "",
    });
    setFormOpen(true);
  };

  const opslaan = async () => {
    if (!form.naam.trim()) return;
    const payload: FinancieelContractInput = {
      ...form,
      leverancier: form.leverancier || null,
      einddatum: form.einddatum || null,
      ingangsdatum: form.ingangsdatum || null,
      notities: form.notities || null,
    };
    if (bewerkId != null) {
      await bijwerken.mutateAsync({ id: bewerkId, data: payload });
    } else {
      await aanmaken.mutateAsync({ data: payload });
    }
    setFormOpen(false);
  };

  const openSignaleringen = (signaleringen ?? []).filter((s) => s.status !== "afgehandeld");

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-primary" />
            Contracten &amp; polissen
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Beheer verzekeringen, lease, onderhoud, software, telecom en abonnementen. AI helpt bij polisanalyse en besparingsadvies; u beslist.
          </p>
        </div>
        <Button onClick={openNieuw}>
          <Plus className="w-4 h-4 mr-1" /> Nieuw contract
        </Button>
      </div>

      {/* Overzichtstegels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium">Actieve jaarlast</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{eur(totaalJaar)}</p>
            <p className="text-xs text-muted-foreground mt-1">{(contracten ?? []).filter((c) => c.status === "actief").length} actieve contracten</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-700 font-medium flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4" /> Besparingskansen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-amber-700">{eur(besparingen?.totaal_geschatte_besparing)}</p>
            <p className="text-xs text-muted-foreground mt-1">{besparingen?.aantal ?? 0} kansen gevonden (geschat per jaar)</p>
          </CardContent>
        </Card>
        <Card className="border-sky-200">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm text-sky-700 font-medium flex items-center gap-1.5">
              <Bell className="w-4 h-4" /> Signaleringen
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => bewaken.mutate()} disabled={bewaken.isPending}>
              <RefreshCw className={`w-3.5 h-3.5 ${bewaken.isPending ? "animate-spin" : ""}`} />
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-sky-700">{openSignaleringen.length}</p>
            <p className="text-xs text-muted-foreground mt-1">openstaand (aflopend, opzegtermijn, indexering)</p>
          </CardContent>
        </Card>
      </div>

      {/* Besparingskansen-lijst */}
      {besparingen && besparingen.kansen.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800">
              <Lightbulb className="w-4 h-4" /> Besparingsadvies
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {besparingen.kansen.map((k, i) => (
              <div key={i} className="flex items-start justify-between gap-3 rounded-md bg-white border border-amber-100 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button className="font-medium text-sm hover:underline text-left" onClick={() => setDetailId(k.contractId)}>
                      {k.contractNaam}
                    </button>
                    <Badge variant="outline" className="text-[10px]">{k.type}</Badge>
                    <Badge variant="outline" className="text-[10px]">zekerheid: {k.zekerheid}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{k.boodschap}</p>
                  <p className="text-[11px] text-muted-foreground/80 mt-1">Basis: {k.bron}</p>
                </div>
                {k.bedrag != null && <span className="text-sm font-semibold text-amber-700 whitespace-nowrap">{eur(k.bedrag)}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Signaleringen-lijst */}
      {openSignaleringen.length > 0 && (
        <Card className="border-sky-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-sky-600" /> Openstaande signaleringen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {openSignaleringen.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button className="font-medium text-sm hover:underline text-left" onClick={() => setDetailId(s.contract_id)}>
                      {s.contract_naam ?? "Contract"}
                    </button>
                    <Badge variant="outline" className={`text-[10px] ${ERNST_KLEUR[s.ernst] ?? ""}`}>{s.ernst}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{s.boodschap}</p>
                </div>
                {s.bedrag != null && <span className="text-sm font-medium whitespace-nowrap">{eur(s.bedrag)}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Zoek op naam, leverancier of contractnummer" value={zoek} onChange={(e) => setZoek(e.target.value)} className="pl-8" />
        </div>
        <Select value={categorieFilter} onValueChange={setCategorieFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle categorieën</SelectItem>
            {CATEGORIEEN.map((c) => <SelectItem key={c.waarde} value={c.waarde}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Contractentabel */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : gefilterd.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              Geen contracten gevonden. Maak een eerste contract aan.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Naam</TableHead>
                  <TableHead>Categorie</TableHead>
                  <TableHead>Leverancier</TableHead>
                  <TableHead className="text-right">Kosten/jaar</TableHead>
                  <TableHead>Einddatum</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gefilterd.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetailId(c.id)}>
                    <TableCell className="font-medium">{c.naam}</TableCell>
                    <TableCell><Badge variant="secondary" className="font-normal">{categorieLabel(c.categorie)}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{c.leverancier ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {eur(jaarlijks(c))}
                      <span className="text-[10px] text-muted-foreground block">{PERIODE_LABEL[c.kosten_periode]}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.einddatum ?? "Doorlopend"}</TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_KLEUR[c.status] ?? ""}>{c.status}</Badge></TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => openBewerk(c)}><Pencil className="w-4 h-4" /></Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { if (confirm(`Contract "${c.naam}" verwijderen?`)) verwijderen.mutate({ id: c.id }); }}
                      >
                        <Trash2 className="w-4 h-4 text-rose-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Aanmaak/bewerk-dialoog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{bewerkId != null ? "Contract bewerken" : "Nieuw contract"}</DialogTitle>
            <DialogDescription>Vul de contractgegevens in. Koppel later een document voor AI-polisanalyse.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Naam *</Label>
              <Input value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} placeholder="bijv. Bedrijfsaansprakelijkheid" />
            </div>
            <div>
              <Label>Categorie</Label>
              <Select value={form.categorie} onValueChange={(v) => setForm({ ...form, categorie: v as FinancieelContractInput["categorie"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIEEN.map((c) => <SelectItem key={c.waarde} value={c.waarde}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status ?? "actief"} onValueChange={(v) => setForm({ ...form, status: v as FinancieelContractInput["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="actief">Actief</SelectItem>
                  <SelectItem value="concept">Concept</SelectItem>
                  <SelectItem value="opgezegd">Opgezegd</SelectItem>
                  <SelectItem value="verlopen">Verlopen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Leverancier</Label>
              <Input value={form.leverancier ?? ""} onChange={(e) => setForm({ ...form, leverancier: e.target.value })} />
            </div>
            <div>
              <Label>Contractnummer</Label>
              <Input value={form.contractnummer ?? ""} onChange={(e) => setForm({ ...form, contractnummer: e.target.value })} />
            </div>
            <div>
              <Label>Kosten (bedrag)</Label>
              <Input type="number" value={form.kosten_bedrag ?? ""} onChange={(e) => setForm({ ...form, kosten_bedrag: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div>
              <Label>Periode</Label>
              <Select value={form.kosten_periode ?? "jaar"} onValueChange={(v) => setForm({ ...form, kosten_periode: v as FinancieelContractInput["kosten_periode"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="jaar">Per jaar</SelectItem>
                  <SelectItem value="maand">Per maand</SelectItem>
                  <SelectItem value="eenmalig">Eenmalig</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ingangsdatum</Label>
              <Input type="date" value={form.ingangsdatum ?? ""} onChange={(e) => setForm({ ...form, ingangsdatum: e.target.value })} />
            </div>
            <div>
              <Label>Einddatum</Label>
              <Input type="date" value={form.einddatum ?? ""} onChange={(e) => setForm({ ...form, einddatum: e.target.value })} />
            </div>
            <div>
              <Label>Opzegtermijn (maanden)</Label>
              <Input type="number" value={form.opzegtermijn_maanden ?? ""} onChange={(e) => setForm({ ...form, opzegtermijn_maanden: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div>
              <Label>Indexering (%)</Label>
              <Input type="number" step="0.1" value={form.indexering_percentage ?? ""} onChange={(e) => setForm({ ...form, indexering_percentage: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div>
              <Label>Indexeringsmaand (1-12)</Label>
              <Input type="number" min="1" max="12" value={form.indexering_maand ?? ""} onChange={(e) => setForm({ ...form, indexering_maand: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div>
              <Label>Aantal licenties</Label>
              <Input type="number" value={form.aantal_licenties ?? ""} onChange={(e) => setForm({ ...form, aantal_licenties: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div>
              <Label>Aantal in gebruik</Label>
              <Input type="number" value={form.aantal_in_gebruik ?? ""} onChange={(e) => setForm({ ...form, aantal_in_gebruik: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div className="md:col-span-2">
              <Label>Notities</Label>
              <Textarea value={form.notities ?? ""} onChange={(e) => setForm({ ...form, notities: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Annuleren</Button>
            <Button onClick={opslaan} disabled={aanmaken.isPending || bijwerken.isPending || !form.naam.trim()}>
              {bewerkId != null ? "Opslaan" : "Aanmaken"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detailId != null && (
        <ContractDetailDialog contractId={detailId} onClose={() => setDetailId(null)} onGewijzigd={invalideerAlles} />
      )}
    </div>
  );
}

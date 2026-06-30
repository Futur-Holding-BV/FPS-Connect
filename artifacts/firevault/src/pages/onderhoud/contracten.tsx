import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListOnderhoudscontracten,
  useCreateOnderhoudscontract,
  useListGebouwen,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Building, Calendar, Euro, FileText, Plus, Search, X, Wrench,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListOnderhoudscontractenQueryKey } from "@workspace/api-client-react";

const statusKleur: Record<string, string> = {
  concept: "bg-gray-100 text-gray-700 border-gray-200",
  actief: "bg-green-100 text-green-800 border-green-200",
  aflopend: "bg-orange-100 text-orange-800 border-orange-200",
  verlopen: "bg-red-100 text-red-800 border-red-200",
  opgezegd: "bg-slate-100 text-slate-700 border-slate-200",
};

const contracttypeLabel: Record<string, string> = {
  preventief: "Preventief",
  correctief: "Correctief",
  inspectie: "Inspectie",
  volledig: "Volledig",
  storing_only: "Storingen",
};

const frequentieLabel: Record<string, string> = {
  maandelijks: "Maandelijks",
  kwartaal: "Per kwartaal",
  halfjaarlijks: "Halfjaarlijks",
  jaarlijks: "Jaarlijks",
  "2x_per_jaar": "2x per jaar",
};

function formatEuro(bedrag: number | null | undefined): string {
  if (bedrag == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(bedrag);
}

function NieuwContractDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: gebouwen } = useListGebouwen();
  const create = useCreateOnderhoudscontract();

  const [form, setForm] = useState({
    gebouw_id: "" as string,
    opdrachtgever: "",
    contracttype: "preventief",
    ingangsdatum: "",
    einddatum: "",
    looptijd_maanden: "" as string,
    contractwaarde: "" as string,
    facturatie_frequentie: "jaarlijks_vooraf",
    onderhouds_frequentie: "jaarlijks",
    indexering: "geen",
    automatische_verlenging: false,
    status: "concept",
    notities: "",
  });

  function handleChange(k: keyof typeof form, v: string | boolean) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit() {
    await create.mutateAsync({
      data: {
        gebouw_id: form.gebouw_id ? parseInt(form.gebouw_id) : null,
        opdrachtgever: form.opdrachtgever || null,
        contracttype: form.contracttype,
        ingangsdatum: form.ingangsdatum || null,
        einddatum: form.einddatum || null,
        looptijd_maanden: form.looptijd_maanden ? parseInt(form.looptijd_maanden) : null,
        contractwaarde: form.contractwaarde ? parseFloat(form.contractwaarde) : null,
        facturatie_frequentie: form.facturatie_frequentie,
        onderhouds_frequentie: form.onderhouds_frequentie,
        indexering: form.indexering,
        automatische_verlenging: form.automatische_verlenging,
        status: form.status,
        notities: form.notities || null,
      },
    });
    await qc.invalidateQueries({ queryKey: getListOnderhoudscontractenQueryKey() });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuw onderhoudscontract</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Gebouw</Label>
              <Select value={form.gebouw_id} onValueChange={(v) => handleChange("gebouw_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Kies gebouw..." />
                </SelectTrigger>
                <SelectContent>
                  {gebouwen?.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Opdrachtgever</Label>
              <Input
                value={form.opdrachtgever}
                onChange={(e) => handleChange("opdrachtgever", e.target.value)}
                placeholder="Naam opdrachtgever"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Contracttype</Label>
              <Select value={form.contracttype} onValueChange={(v) => handleChange("contracttype", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(contracttypeLabel).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => handleChange("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="concept">Concept</SelectItem>
                  <SelectItem value="actief">Actief</SelectItem>
                  <SelectItem value="verlopen">Verlopen</SelectItem>
                  <SelectItem value="opgezegd">Opgezegd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Ingangsdatum</Label>
              <Input
                type="date"
                value={form.ingangsdatum}
                onChange={(e) => handleChange("ingangsdatum", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Einddatum</Label>
              <Input
                type="date"
                value={form.einddatum}
                onChange={(e) => handleChange("einddatum", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Onderhoudsfrequentie</Label>
              <Select value={form.onderhouds_frequentie} onValueChange={(v) => handleChange("onderhouds_frequentie", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(frequentieLabel).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Facturatiefrequentie</Label>
              <Select value={form.facturatie_frequentie} onValueChange={(v) => handleChange("facturatie_frequentie", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="maandelijks">Maandelijks</SelectItem>
                  <SelectItem value="kwartaal">Per kwartaal</SelectItem>
                  <SelectItem value="halfjaarlijks">Halfjaarlijks</SelectItem>
                  <SelectItem value="jaarlijks_vooraf">Jaarlijks vooraf</SelectItem>
                  <SelectItem value="jaarlijks_achteraf">Jaarlijks achteraf</SelectItem>
                  <SelectItem value="na_onderhoud">Na uitvoering</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Contractwaarde (excl. BTW)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.contractwaarde}
                onChange={(e) => handleChange("contractwaarde", e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Indexering</Label>
              <Select value={form.indexering} onValueChange={(v) => handleChange("indexering", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geen">Geen</SelectItem>
                  <SelectItem value="cbs">CBS-index</SelectItem>
                  <SelectItem value="cpi">CPI</SelectItem>
                  <SelectItem value="vast">Vast percentage</SelectItem>
                  <SelectItem value="handmatig">Handmatig</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notities</Label>
            <Textarea
              value={form.notities}
              onChange={(e) => handleChange("notities", e.target.value)}
              rows={2}
              placeholder="Aanvullende opmerkingen..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? "Bezig..." : "Contract aanmaken"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ContractenLijst() {
  const [, navigate] = useLocation();
  const [zoek, setZoek] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [nieuwOpen, setNieuwOpen] = useState(false);

  const { data: contracten, isLoading } = useListOnderhoudscontracten();

  const gefilterd = contracten?.filter((c) => {
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    const matchZoek =
      !zoek ||
      c.contractnummer.toLowerCase().includes(zoek.toLowerCase()) ||
      (c.gebouw_naam ?? "").toLowerCase().includes(zoek.toLowerCase()) ||
      (c.opdrachtgever ?? "").toLowerCase().includes(zoek.toLowerCase());
    return matchStatus && matchZoek;
  }) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Zoek op contractnummer, gebouw of opdrachtgever..."
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="concept">Concept</SelectItem>
            <SelectItem value="actief">Actief</SelectItem>
            <SelectItem value="aflopend">Aflopend</SelectItem>
            <SelectItem value="verlopen">Verlopen</SelectItem>
            <SelectItem value="opgezegd">Opgezegd</SelectItem>
          </SelectContent>
        </Select>
        {(zoek || statusFilter !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setZoek(""); setStatusFilter("all"); }}>
            <X className="h-4 w-4 mr-1" /> Wissen
          </Button>
        )}
        <Button onClick={() => setNieuwOpen(true)} className="ml-auto">
          <Plus className="h-4 w-4 mr-1" /> Nieuw contract
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : gefilterd.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          {contracten?.length === 0
            ? "Nog geen onderhoudscontracten. Maak het eerste aan."
            : "Geen contracten gevonden voor deze zoekopdracht."}
        </div>
      ) : (
        <div className="space-y-2">
          {gefilterd.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/onderhoud/contracten/${c.id}`)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/onderhoud/contracten/${c.id}`); } }}
              className="group flex items-center gap-4 rounded-xl border bg-card px-5 py-4 cursor-pointer shadow-sm hover:shadow-md hover:-translate-y-px hover:bg-muted/30 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="p-2 bg-muted rounded-md shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{c.contractnummer}</span>
                  <Badge variant="outline" className={statusKleur[c.status] ?? ""}>
                    {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </Badge>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    {contracttypeLabel[c.contracttype] ?? c.contracttype}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                  {c.gebouw_naam && (
                    <span className="flex items-center gap-1">
                      <Building className="h-3 w-3" /> {c.gebouw_naam}
                    </span>
                  )}
                  {c.opdrachtgever && (
                    <span>{c.opdrachtgever}</span>
                  )}
                  {c.einddatum && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      t/m {new Date(c.einddatum).toLocaleDateString("nl-NL")}
                    </span>
                  )}
                  {c.contractwaarde != null && (
                    <span className="flex items-center gap-1">
                      <Euro className="h-3 w-3" />
                      {formatEuro(c.contractwaarde)}/jaar
                    </span>
                  )}
                  {(c.werkbonnen_telling ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <Wrench className="h-3 w-3" />
                      {c.werkbonnen_telling} werkbon{(c.werkbonnen_telling ?? 0) !== 1 ? "nen" : ""}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-sm text-muted-foreground">
                {frequentieLabel[c.onderhouds_frequentie] ?? c.onderhouds_frequentie}
              </div>
            </div>
          ))}
        </div>
      )}

      <NieuwContractDialog open={nieuwOpen} onClose={() => setNieuwOpen(false)} />
    </div>
  );
}

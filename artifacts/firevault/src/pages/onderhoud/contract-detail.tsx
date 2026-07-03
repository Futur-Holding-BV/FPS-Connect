import { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetOnderhoudscontract,
  useUpdateOnderhoudscontract,
  useDeleteOnderhoudscontract,
  useListWerkbonnen,
  useCreateWerkbon,
  useListToewijsbareGebruikers,
  useListGebouwen,
  useListOnderhoudscontracten,
  useGenereerWerkbonnenVoorContract,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Building, Calendar, ClipboardList, Edit, Euro,
  FileText, Plus, RefreshCw, Trash2, User, Wrench, Check, X, Wand2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetOnderhoudscontractQueryKey,
  getListWerkbonnenQueryKey,
} from "@workspace/api-client-react";

const statusKleur: Record<string, string> = {
  concept: "bg-gray-100 text-gray-700 border-gray-200",
  actief: "bg-green-100 text-green-800 border-green-200",
  aflopend: "bg-orange-100 text-orange-800 border-orange-200",
  verlopen: "bg-red-100 text-red-800 border-red-200",
  opgezegd: "bg-slate-100 text-slate-700 border-slate-200",
};

const werkbonStatusKleur: Record<string, string> = {
  gepland: "bg-blue-100 text-blue-800 border-blue-200",
  in_uitvoering: "bg-orange-100 text-orange-800 border-orange-200",
  voltooid: "bg-green-100 text-green-800 border-green-200",
  geannuleerd: "bg-gray-100 text-gray-700 border-gray-200",
};

const statusLabel: Record<string, string> = {
  gepland: "Gepland", in_uitvoering: "In uitvoering",
  voltooid: "Voltooid", geannuleerd: "Geannuleerd",
};

const typeLabel: Record<string, string> = {
  preventief: "Preventief", correctief: "Correctief",
  inspectie: "Inspectie", storing: "Storing", opname: "Opname",
};

const contracttypeLabel: Record<string, string> = {
  preventief: "Preventief", correctief: "Correctief",
  inspectie: "Inspectie", volledig: "Volledig", storing_only: "Storingen",
};

const frequentieLabel: Record<string, string> = {
  maandelijks: "Maandelijks", kwartaal: "Per kwartaal",
  halfjaarlijks: "Halfjaarlijks", jaarlijks: "Jaarlijks", "2x_per_jaar": "2x per jaar",
};

const facturatieLabel: Record<string, string> = {
  maandelijks: "Maandelijks", kwartaal: "Per kwartaal",
  halfjaarlijks: "Halfjaarlijks", jaarlijks_vooraf: "Jaarlijks vooraf",
  jaarlijks_achteraf: "Jaarlijks achteraf", na_onderhoud: "Na uitvoering",
};

const indexeringLabel: Record<string, string> = {
  geen: "Geen", cbs: "CBS-index", cpi: "CPI",
  vast: "Vast percentage", handmatig: "Handmatig",
};

function formatEuro(bedrag: number | null | undefined): string {
  if (bedrag == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(bedrag);
}

function InfoRij({ label, waarde }: { label: string; waarde: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground shrink-0 w-40">{label}</span>
      <span className="font-medium">{waarde ?? "—"}</span>
    </div>
  );
}

function NieuweWerkbonDialog({
  open, onClose, contractId, gebouwId,
}: {
  open: boolean; onClose: () => void; contractId: number; gebouwId?: number | null;
}) {
  const qc = useQueryClient();
  const { data: monteurs } = useListToewijsbareGebruikers();
  const create = useCreateWerkbon();

  const [form, setForm] = useState({
    titel: "", omschrijving: "", type: "preventief",
    geplande_kwartaal: "", geplande_datum: "", monteur_id: "", status: "gepland",
  });

  function set(k: keyof typeof form, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit() {
    if (!form.titel) return;
    await create.mutateAsync({
      data: {
        contract_id: contractId,
        gebouw_id: gebouwId ?? null,
        titel: form.titel,
        omschrijving: form.omschrijving || null,
        type: form.type,
        geplande_kwartaal: form.geplande_kwartaal || null,
        geplande_datum: form.geplande_datum || null,
        monteur_id: form.monteur_id ? parseInt(form.monteur_id) : null,
        status: form.status,
      },
    });
    await qc.invalidateQueries({ queryKey: getListWerkbonnenQueryKey({ contract_id: contractId }) });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Werkbon toevoegen aan contract</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Titel <span className="text-destructive">*</span></Label>
            <Input value={form.titel} onChange={(e) => set("titel", e.target.value)} placeholder="Werkzaamheden" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(typeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gepland">Gepland</SelectItem>
                  <SelectItem value="in_uitvoering">In uitvoering</SelectItem>
                  <SelectItem value="voltooid">Voltooid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Kwartaal</Label>
              <Select value={form.geplande_kwartaal} onValueChange={(v) => set("geplande_kwartaal", v)}>
                <SelectTrigger><SelectValue placeholder="Kies..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Q1">Q1</SelectItem>
                  <SelectItem value="Q2">Q2</SelectItem>
                  <SelectItem value="Q3">Q3</SelectItem>
                  <SelectItem value="Q4">Q4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Datum (optioneel)</Label>
              <Input type="date" value={form.geplande_datum} onChange={(e) => set("geplande_datum", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Monteur</Label>
            <Select value={form.monteur_id} onValueChange={(v) => set("monteur_id", v)}>
              <SelectTrigger><SelectValue placeholder="Toewijzen..." /></SelectTrigger>
              <SelectContent>
                {monteurs?.map((m: { id: number; naam: string }) => <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Omschrijving</Label>
            <Textarea value={form.omschrijving} onChange={(e) => set("omschrijving", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={handleSubmit} disabled={create.isPending || !form.titel}>
            {create.isPending ? "Bezig..." : "Werkbon aanmaken"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ContractDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const id = parseInt(params.id ?? "0");

  const { data: contract, isLoading } = useGetOnderhoudscontract(id);
  const { data: werkbonnen } = useListWerkbonnen({ contract_id: id });
  const update = useUpdateOnderhoudscontract();
  const remove = useDeleteOnderhoudscontract();

  const genereer = useGenereerWerkbonnenVoorContract();

  const [bewerkOpen, setBewerkOpen] = useState(false);
  const [werkbonOpen, setWerkbonOpen] = useState(false);
  const [verwijderOpen, setVerwijderOpen] = useState(false);
  const [genereerOpen, setGenereerOpen] = useState(false);
  const [genereerJaar, setGenereerJaar] = useState(new Date().getFullYear().toString());
  const [genereerResultaat, setGenereerResultaat] = useState<{ aangemaakt: number; overgeslagen: number; totaal: number } | null>(null);

  const [editForm, setEditForm] = useState<Record<string, string | boolean>>({});
  const [bewerkActief, setBewerkActief] = useState(false);

  function startBewerken() {
    if (!contract) return;
    setEditForm({
      gebouw_id: String(contract.gebouw_id ?? ""),
      opdrachtgever: contract.opdrachtgever ?? "",
      contracttype: contract.contracttype,
      ingangsdatum: contract.ingangsdatum ?? "",
      einddatum: contract.einddatum ?? "",
      contractwaarde: contract.contractwaarde != null ? String(contract.contractwaarde) : "",
      facturatie_frequentie: contract.facturatie_frequentie,
      onderhouds_frequentie: contract.onderhouds_frequentie,
      indexering: contract.indexering,
      status: contract.status,
      eerstvolgende_onderhoud: contract.eerstvolgende_onderhoud ?? "",
      notities: contract.notities ?? "",
      automatische_verlenging: contract.automatische_verlenging,
    });
    setBewerkActief(true);
  }

  async function slaOpBewerken() {
    await update.mutateAsync({
      id,
      data: {
        contracttype: editForm.contracttype as string,
        facturatie_frequentie: editForm.facturatie_frequentie as string,
        onderhouds_frequentie: editForm.onderhouds_frequentie as string,
        indexering: editForm.indexering as string,
        status: editForm.status as string,
        opdrachtgever: (editForm.opdrachtgever as string) || null,
        ingangsdatum: (editForm.ingangsdatum as string) || null,
        einddatum: (editForm.einddatum as string) || null,
        contractwaarde: editForm.contractwaarde ? parseFloat(editForm.contractwaarde as string) : null,
        eerstvolgende_onderhoud: (editForm.eerstvolgende_onderhoud as string) || null,
        notities: (editForm.notities as string) || null,
        automatische_verlenging: editForm.automatische_verlenging as boolean,
      },
    });
    await qc.invalidateQueries({ queryKey: getGetOnderhoudscontractQueryKey(id) });
    setBewerkActief(false);
  }

  async function handleVerwijder() {
    await remove.mutateAsync({ id });
    navigate("/onderhoud/contracten");
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto py-6">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Contract niet gevonden.
        <Button variant="link" onClick={() => navigate("/onderhoud/contracten")}>Terug</Button>
      </div>
    );
  }

  const openWerkbonnen = werkbonnen?.filter((w) => w.status === "gepland" || w.status === "in_uitvoering") ?? [];
  const voltooideWerkbonnen = werkbonnen?.filter((w) => w.status === "voltooid") ?? [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/onderhoud/contracten")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Contracten
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{contract.contractnummer}</h1>
            <Badge variant="outline" className={statusKleur[contract.status] ?? ""}>
              {contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}
            </Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              {contracttypeLabel[contract.contracttype] ?? contract.contracttype}
            </Badge>
          </div>
          {contract.gebouw_naam && (
            <div className="flex items-center gap-1 text-muted-foreground mt-1">
              <Building className="h-4 w-4" />
              <span>{contract.gebouw_naam}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {bewerkActief ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setBewerkActief(false)}>
                <X className="h-4 w-4 mr-1" /> Annuleren
              </Button>
              <Button size="sm" onClick={slaOpBewerken} disabled={update.isPending}>
                <Check className="h-4 w-4 mr-1" /> Opslaan
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => { setGenereerResultaat(null); setGenereerOpen(true); }}>
                <Wand2 className="h-4 w-4 mr-1" /> Werkbonnen genereren
              </Button>
              <Button variant="outline" size="sm" onClick={startBewerken}>
                <Edit className="h-4 w-4 mr-1" /> Bewerken
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setVerwijderOpen(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Contractgegevens
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {bewerkActief ? (
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select value={editForm.status as string} onValueChange={(v) => setEditForm((p) => ({ ...p, status: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="concept">Concept</SelectItem>
                          <SelectItem value="actief">Actief</SelectItem>
                          <SelectItem value="aflopend">Aflopend</SelectItem>
                          <SelectItem value="verlopen">Verlopen</SelectItem>
                          <SelectItem value="opgezegd">Opgezegd</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Contracttype</Label>
                      <Select value={editForm.contracttype as string} onValueChange={(v) => setEditForm((p) => ({ ...p, contracttype: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(contracttypeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Opdrachtgever</Label>
                    <Input value={editForm.opdrachtgever as string} onChange={(e) => setEditForm((p) => ({ ...p, opdrachtgever: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Ingangsdatum</Label>
                      <Input type="date" value={editForm.ingangsdatum as string} onChange={(e) => setEditForm((p) => ({ ...p, ingangsdatum: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Einddatum</Label>
                      <Input type="date" value={editForm.einddatum as string} onChange={(e) => setEditForm((p) => ({ ...p, einddatum: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Onderhoudsfrequentie</Label>
                      <Select value={editForm.onderhouds_frequentie as string} onValueChange={(v) => setEditForm((p) => ({ ...p, onderhouds_frequentie: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(frequentieLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Facturatiefrequentie</Label>
                      <Select value={editForm.facturatie_frequentie as string} onValueChange={(v) => setEditForm((p) => ({ ...p, facturatie_frequentie: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(facturatieLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Contractwaarde</Label>
                      <Input type="number" value={editForm.contractwaarde as string} onChange={(e) => setEditForm((p) => ({ ...p, contractwaarde: e.target.value }))} placeholder="0,00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Indexering</Label>
                      <Select value={editForm.indexering as string} onValueChange={(v) => setEditForm((p) => ({ ...p, indexering: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(indexeringLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Eerstvolgende onderhoudsdatum</Label>
                    <Input type="date" value={editForm.eerstvolgende_onderhoud as string} onChange={(e) => setEditForm((p) => ({ ...p, eerstvolgende_onderhoud: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notities</Label>
                    <Textarea value={editForm.notities as string} onChange={(e) => setEditForm((p) => ({ ...p, notities: e.target.value }))} rows={2} />
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <InfoRij label="Opdrachtgever" waarde={contract.opdrachtgever} />
                  <InfoRij label="Contracttype" waarde={contracttypeLabel[contract.contracttype] ?? contract.contracttype} />
                  <InfoRij label="Ingangsdatum" waarde={contract.ingangsdatum ? new Date(contract.ingangsdatum).toLocaleDateString("nl-NL") : null} />
                  <InfoRij label="Einddatum" waarde={contract.einddatum ? new Date(contract.einddatum).toLocaleDateString("nl-NL") : null} />
                  <InfoRij label="Looptijd" waarde={contract.looptijd_maanden ? `${contract.looptijd_maanden} maanden` : null} />
                  <InfoRij label="Aut. verlenging" waarde={contract.automatische_verlenging ? "Ja" : "Nee"} />
                  <InfoRij label="Opzegtermijn" waarde={contract.opzegtermijn_maanden ? `${contract.opzegtermijn_maanden} maanden` : null} />
                  <Separator />
                  <InfoRij label="Onderhoudsfrequentie" waarde={frequentieLabel[contract.onderhouds_frequentie] ?? contract.onderhouds_frequentie} />
                  <InfoRij label="Eerstvolgende onderhoud" waarde={contract.eerstvolgende_onderhoud ? new Date(contract.eerstvolgende_onderhoud).toLocaleDateString("nl-NL") : null} />
                  <InfoRij label="Laatste onderhoud" waarde={contract.laatste_onderhoud ? new Date(contract.laatste_onderhoud).toLocaleDateString("nl-NL") : null} />
                  <Separator />
                  <InfoRij label="Contractwaarde" waarde={formatEuro(contract.contractwaarde)} />
                  <InfoRij label="Facturatie" waarde={facturatieLabel[contract.facturatie_frequentie] ?? contract.facturatie_frequentie} />
                  <InfoRij label="Indexering" waarde={indexeringLabel[contract.indexering] ?? contract.indexering} />
                  {contract.notities && (
                    <>
                      <Separator />
                      <div className="text-sm text-muted-foreground">{contract.notities}</div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 pb-3 space-y-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Snel overzicht</div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Werkbonnen open</span>
                <span className="font-bold text-orange-600">{openWerkbonnen.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Voltooid</span>
                <span className="font-bold text-green-600">{voltooideWerkbonnen.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Totaal werkbonnen</span>
                <span className="font-bold">{werkbonnen?.length ?? 0}</span>
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full"
            onClick={() => setWerkbonOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" /> Werkbon toevoegen
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Werkbonnen
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!werkbonnen?.length ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <Wrench className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Nog geen werkbonnen voor dit contract.
            </div>
          ) : (
            <div className="space-y-2">
              {werkbonnen.map((w) => (
                <div
                  key={w.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/onderhoud/werkbonnen/${w.id}`)}
                  onKeyDown={(e) => { if (e.key === "Enter") navigate(`/onderhoud/werkbonnen/${w.id}`); }}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted cursor-pointer transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{w.titel}</span>
                      <Badge variant="outline" className={werkbonStatusKleur[w.status] ?? ""}>
                        {statusLabel[w.status] ?? w.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{typeLabel[w.type] ?? w.type}</span>
                    </div>
                    <div className="text-xs text-muted-foreground flex gap-3 mt-0.5">
                      <span>{w.werkbonnummer}</span>
                      {w.monteur_naam && <span><User className="h-3 w-3 inline mr-0.5" />{w.monteur_naam}</span>}
                      {w.geplande_datum && <span><Calendar className="h-3 w-3 inline mr-0.5" />{new Date(w.geplande_datum).toLocaleDateString("nl-NL")}</span>}
                      {w.geplande_kwartaal && !w.geplande_datum && <span>{w.geplande_kwartaal}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <NieuweWerkbonDialog
        open={werkbonOpen}
        onClose={() => setWerkbonOpen(false)}
        contractId={id}
        gebouwId={contract.gebouw_id}
      />

      <Dialog open={genereerOpen} onOpenChange={(o) => { setGenereerOpen(o); if (!o) setGenereerResultaat(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Werkbonnen automatisch genereren</DialogTitle>
          </DialogHeader>
          {genereerResultaat ? (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                  <div className="text-2xl font-bold text-green-700">{genereerResultaat.aangemaakt}</div>
                  <div className="text-xs text-green-600 mt-1">Aangemaakt</div>
                </div>
                <div className="rounded-lg bg-gray-50 border p-4">
                  <div className="text-2xl font-bold text-gray-600">{genereerResultaat.overgeslagen}</div>
                  <div className="text-xs text-muted-foreground mt-1">Al bestaand</div>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                  <div className="text-2xl font-bold text-blue-700">{genereerResultaat.totaal}</div>
                  <div className="text-xs text-blue-600 mt-1">Totaal gepland</div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                De werkbonnen zijn aangemaakt op basis van de onderhoudsfrequentie van dit contract.
              </p>
              <DialogFooter>
                <Button onClick={() => setGenereerOpen(false)}>Sluiten</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Genereer werkbonnen voor jaar <strong>{genereerJaar}</strong> op basis van de
                onderhoudsfrequentie <em>{contract.onderhouds_frequentie}</em>. Al bestaande
                werkbonnen voor dezelfde datum worden overgeslagen.
              </p>
              <div className="space-y-1.5">
                <Label>Jaar</Label>
                <Input
                  type="number"
                  value={genereerJaar}
                  min={2020}
                  max={2040}
                  onChange={(e) => setGenereerJaar(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGenereerOpen(false)}>Annuleren</Button>
                <Button
                  onClick={async () => {
                    const res = await genereer.mutateAsync({ id, data: { jaar: parseInt(genereerJaar) } });
                    setGenereerResultaat(res);
                    await qc.invalidateQueries({ queryKey: ["werkbonnen"] });
                  }}
                  disabled={genereer.isPending}
                >
                  <Wand2 className="h-4 w-4 mr-1" />
                  {genereer.isPending ? "Bezig..." : "Genereren"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={verwijderOpen} onOpenChange={setVerwijderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contract verwijderen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Weet u zeker dat u contract <strong>{contract.contractnummer}</strong> wilt verwijderen?
            De gekoppelde werkbonnen blijven bestaan maar raken los van dit contract.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerwijderOpen(false)}>Annuleren</Button>
            <Button variant="destructive" onClick={handleVerwijder} disabled={remove.isPending}>
              {remove.isPending ? "Bezig..." : "Verwijderen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

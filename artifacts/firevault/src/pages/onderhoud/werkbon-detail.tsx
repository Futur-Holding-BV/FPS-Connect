import { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetWerkbon,
  useUpdateWerkbon,
  useDeleteWerkbon,
  useListToewijsbareGebruikers,
  useListOnderhoudscontracten,
  useListGebouwen,
  useListRapporten,
  getListRapportenQueryKey,
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
  ArrowLeft, Building, Check, Edit, FileText,
  Lock, Trash2, User, Wrench, X, CheckCircle2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetWerkbonQueryKey } from "@workspace/api-client-react";

const RAPPORT_TYPE_LABEL: Record<string, string> = {
  werkpakket_monteur: "Werkpakket monteur",
  voortgang:          "Voortgangsrapportage",
  opleverrapport:     "Opleverrapport brandveiligheid",
  opleverdossier:     "Opleverdossier",
  klant_beknopt:      "Klantrapport — Beknopt",
  klant_uitgebreid:   "Klantrapport — Uitgebreid",
  intern_controle:    "Interne controle",
  beheeradvies:       "Beheeradvies",
};

const statusKleur: Record<string, string> = {
  gepland: "bg-blue-100 text-blue-800 border-blue-200",
  in_uitvoering: "bg-orange-100 text-orange-800 border-orange-200",
  voltooid: "bg-green-100 text-green-800 border-green-200",
  geannuleerd: "bg-gray-100 text-gray-700 border-gray-200",
};

const statusLabel: Record<string, string> = {
  gepland: "Gepland",
  in_uitvoering: "In uitvoering",
  voltooid: "Voltooid",
  geannuleerd: "Geannuleerd",
};

const typeLabel: Record<string, string> = {
  preventief: "Preventief",
  correctief: "Correctief",
  inspectie: "Inspectie",
  storing: "Storing",
  opname: "Opname",
};

function InfoRij({ label, waarde }: { label: string; waarde: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground shrink-0 w-40">{label}</span>
      <span className="font-medium">{waarde ?? "—"}</span>
    </div>
  );
}

export default function WerkbonDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const id = parseInt(params.id ?? "0");

  const { data: werkbon, isLoading } = useGetWerkbon(id);
  const { data: monteurs } = useListToewijsbareGebruikers();
  const { data: contracten } = useListOnderhoudscontracten();
  const { data: gebouwen } = useListGebouwen();
  const { data: gekoppeldeRapporten = [] } = useListRapporten(
    { werkbon_id: id, status: "definitief" },
    { query: { queryKey: getListRapportenQueryKey({ werkbon_id: id, status: "definitief" }), enabled: id > 0 } },
  );
  const update = useUpdateWerkbon();
  const remove = useDeleteWerkbon();

  const [bewerkActief, setBewerkActief] = useState(false);
  const [verwijderOpen, setVerwijderOpen] = useState(false);

  const [editForm, setEditForm] = useState<Record<string, string | null>>({});

  function startBewerken() {
    if (!werkbon) return;
    setEditForm({
      titel: werkbon.titel,
      omschrijving: werkbon.omschrijving ?? "",
      type: werkbon.type,
      status: werkbon.status,
      contract_id: werkbon.contract_id != null ? String(werkbon.contract_id) : "",
      gebouw_id: werkbon.gebouw_id != null ? String(werkbon.gebouw_id) : "",
      geplande_kwartaal: werkbon.geplande_kwartaal ?? "",
      geplande_datum: werkbon.geplande_datum ?? "",
      uitvoer_datum: werkbon.uitvoer_datum ?? "",
      monteur_id: werkbon.monteur_id != null ? String(werkbon.monteur_id) : "",
      duur_uren: werkbon.duur_uren != null ? String(werkbon.duur_uren) : "",
      opmerkingen: werkbon.opmerkingen ?? "",
      resultaat: werkbon.resultaat ?? "",
    });
    setBewerkActief(true);
  }

  function set(k: string, v: string) {
    setEditForm((p) => ({ ...p, [k]: v }));
  }

  async function slaOp() {
    await update.mutateAsync({
      id,
      data: {
        titel: editForm.titel!,
        omschrijving: editForm.omschrijving || null,
        type: editForm.type!,
        status: editForm.status!,
        contract_id: editForm.contract_id ? parseInt(editForm.contract_id) : null,
        gebouw_id: editForm.gebouw_id ? parseInt(editForm.gebouw_id) : null,
        geplande_kwartaal: editForm.geplande_kwartaal || null,
        geplande_datum: editForm.geplande_datum || null,
        uitvoer_datum: editForm.uitvoer_datum || null,
        monteur_id: editForm.monteur_id ? parseInt(editForm.monteur_id) : null,
        duur_uren: editForm.duur_uren ? parseFloat(editForm.duur_uren) : null,
        opmerkingen: editForm.opmerkingen || null,
        resultaat: editForm.resultaat || null,
      },
    });
    await qc.invalidateQueries({ queryKey: getGetWerkbonQueryKey(id) });
    setBewerkActief(false);
  }

  async function setStatus(nieuwStatus: string) {
    await update.mutateAsync({ id, data: { status: nieuwStatus } });
    await qc.invalidateQueries({ queryKey: getGetWerkbonQueryKey(id) });
  }

  async function handleVerwijder() {
    await remove.mutateAsync({ id });
    navigate("/onderhoud/werkbonnen");
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto py-6">
        {[1, 2].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
      </div>
    );
  }

  if (!werkbon) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Werkbon niet gevonden.
        <Button variant="link" onClick={() => navigate("/onderhoud/werkbonnen")}>Terug</Button>
      </div>
    );
  }

  const terugPad = werkbon.contract_id
    ? `/onderhoud/contracten/${werkbon.contract_id}`
    : "/onderhoud/werkbonnen";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(terugPad)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          {werkbon.contractnummer ? `Contract ${werkbon.contractnummer}` : "Werkbonnen"}
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 data-paginatitel className="text-2xl font-bold">{werkbon.titel}</h1>
            <Badge variant="outline" className={statusKleur[werkbon.status] ?? ""}>
              {statusLabel[werkbon.status] ?? werkbon.status}
            </Badge>
            <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
              {typeLabel[werkbon.type] ?? werkbon.type}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground mt-1 font-mono">{werkbon.werkbonnummer}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {werkbon.status === "gepland" && (
            <Button variant="outline" size="sm" onClick={() => setStatus("in_uitvoering")}>
              <Wrench className="h-4 w-4 mr-1" /> Start uitvoering
            </Button>
          )}
          {werkbon.status === "in_uitvoering" && (
            <Button variant="outline" size="sm" className="border-green-300 text-green-700 hover:bg-green-50" onClick={() => setStatus("voltooid")}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Voltooien
            </Button>
          )}
          {bewerkActief ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setBewerkActief(false)}>
                <X className="h-4 w-4 mr-1" /> Annuleren
              </Button>
              <Button size="sm" onClick={slaOp} disabled={update.isPending}>
                <Check className="h-4 w-4 mr-1" /> Opslaan
              </Button>
            </>
          ) : (
            <>
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
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Werkbongegevens
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bewerkActief ? (
                <div className="grid gap-4">
                  <div className="space-y-1.5">
                    <Label>Titel <span className="text-destructive">*</span></Label>
                    <Input value={editForm.titel ?? ""} onChange={(e) => set("titel", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Type</Label>
                      <Select value={editForm.type ?? ""} onValueChange={(v) => set("type", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(typeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select value={editForm.status ?? ""} onValueChange={(v) => set("status", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gepland">Gepland</SelectItem>
                          <SelectItem value="in_uitvoering">In uitvoering</SelectItem>
                          <SelectItem value="voltooid">Voltooid</SelectItem>
                          <SelectItem value="geannuleerd">Geannuleerd</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Contract (optioneel)</Label>
                      <Select value={editForm.contract_id ?? ""} onValueChange={(v) => set("contract_id", v)}>
                        <SelectTrigger><SelectValue placeholder="Kies contract..." /></SelectTrigger>
                        <SelectContent>
                          {contracten?.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.contractnummer}{c.gebouw_naam ? ` — ${c.gebouw_naam}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Gebouw (optioneel)</Label>
                      <Select value={editForm.gebouw_id ?? ""} onValueChange={(v) => set("gebouw_id", v)}>
                        <SelectTrigger><SelectValue placeholder="Kies gebouw..." /></SelectTrigger>
                        <SelectContent>
                          {gebouwen?.map((g) => (
                            <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Kwartaal</Label>
                      <Select value={editForm.geplande_kwartaal ?? ""} onValueChange={(v) => set("geplande_kwartaal", v)}>
                        <SelectTrigger><SelectValue placeholder="Kies kwartaal..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Q1">Q1</SelectItem>
                          <SelectItem value="Q2">Q2</SelectItem>
                          <SelectItem value="Q3">Q3</SelectItem>
                          <SelectItem value="Q4">Q4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Geplande datum</Label>
                      <Input type="date" value={editForm.geplande_datum ?? ""} onChange={(e) => set("geplande_datum", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Uitvoerdatum</Label>
                      <Input type="date" value={editForm.uitvoer_datum ?? ""} onChange={(e) => set("uitvoer_datum", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Duur (uren)</Label>
                      <Input type="number" min="0" step="0.5" value={editForm.duur_uren ?? ""} onChange={(e) => set("duur_uren", e.target.value)} placeholder="0.0" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Monteur</Label>
                    <Select value={editForm.monteur_id ?? ""} onValueChange={(v) => set("monteur_id", v)}>
                      <SelectTrigger><SelectValue placeholder="Toewijzen aan..." /></SelectTrigger>
                      <SelectContent>
                        {monteurs?.map((m: { id: number; naam: string }) => <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Omschrijving / instructies</Label>
                    <Textarea value={editForm.omschrijving ?? ""} onChange={(e) => set("omschrijving", e.target.value)} rows={2} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Resultaat / bevindingen</Label>
                    <Textarea value={editForm.resultaat ?? ""} onChange={(e) => set("resultaat", e.target.value)} rows={2} placeholder="Wat is uitgevoerd, aangetroffen, vervangen..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Opmerkingen</Label>
                    <Textarea value={editForm.opmerkingen ?? ""} onChange={(e) => set("opmerkingen", e.target.value)} rows={2} />
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <InfoRij label="Type" waarde={typeLabel[werkbon.type] ?? werkbon.type} />
                  {werkbon.gebouw_naam && (
                    <InfoRij label="Gebouw" waarde={
                      <span className="flex items-center gap-1">
                        <Building className="h-3 w-3" /> {werkbon.gebouw_naam}
                      </span>
                    } />
                  )}
                  {werkbon.contractnummer && (
                    <InfoRij label="Contract" waarde={
                      <button
                        className="flex items-center gap-1 text-primary hover:underline"
                        onClick={() => navigate(`/onderhoud/contracten/${werkbon.contract_id}`)}
                      >
                        <FileText className="h-3 w-3" /> {werkbon.contractnummer}
                      </button>
                    } />
                  )}
                  <Separator />
                  <InfoRij label="Kwartaal" waarde={werkbon.geplande_kwartaal} />
                  <InfoRij label="Geplande datum" waarde={werkbon.geplande_datum ? new Date(werkbon.geplande_datum).toLocaleDateString("nl-NL") : null} />
                  <InfoRij label="Uitvoerdatum" waarde={werkbon.uitvoer_datum ? new Date(werkbon.uitvoer_datum).toLocaleDateString("nl-NL") : null} />
                  <InfoRij label="Duur" waarde={werkbon.duur_uren != null ? `${werkbon.duur_uren} uur` : null} />
                  <InfoRij label="Monteur" waarde={werkbon.monteur_naam ? (
                    <span className="flex items-center gap-1"><User className="h-3 w-3" /> {werkbon.monteur_naam}</span>
                  ) : null} />
                  {werkbon.omschrijving && (
                    <>
                      <Separator />
                      <div>
                        <div className="text-xs text-muted-foreground font-medium mb-1">Instructies</div>
                        <div className="text-sm">{werkbon.omschrijving}</div>
                      </div>
                    </>
                  )}
                  {werkbon.resultaat && (
                    <>
                      <Separator />
                      <div>
                        <div className="text-xs text-muted-foreground font-medium mb-1">Resultaat / bevindingen</div>
                        <div className="text-sm">{werkbon.resultaat}</div>
                      </div>
                    </>
                  )}
                  {werkbon.opmerkingen && (
                    <>
                      <Separator />
                      <div>
                        <div className="text-xs text-muted-foreground font-medium mb-1">Opmerkingen</div>
                        <div className="text-sm">{werkbon.opmerkingen}</div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Gekoppelde rapporten
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {gekoppeldeRapporten.length === 0 ? (
                <p className="text-xs text-muted-foreground">Geen rapporten gekoppeld aan deze werkbon.</p>
              ) : (
                <div className="space-y-2">
                  {gekoppeldeRapporten.map((r) => {
                    const titel = r.titel || RAPPORT_TYPE_LABEL[r.rapport_type] || r.rapport_type;
                    return (
                      <div
                        key={r.id}
                        className="flex items-start gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                        role="button"
                        tabIndex={0}
                        onClick={() => r.gebouw_id && navigate(`/gebouwen/${r.gebouw_id}/print?rapport_id=${r.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && r.gebouw_id)
                            navigate(`/gebouwen/${r.gebouw_id}/print?rapport_id=${r.id}`);
                        }}
                      >
                        <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-600" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{titel}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.bevroren_op
                              ? new Date(r.bevroren_op).toLocaleDateString("nl-NL")
                              : "—"}
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-xs">
                          Definitief
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3 space-y-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Statuswijziging</div>
              {["gepland", "in_uitvoering", "voltooid", "geannuleerd"].map((s) => (
                <button
                  key={s}
                  onClick={() => s !== werkbon.status && setStatus(s)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    s === werkbon.status
                      ? "font-semibold bg-muted"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    s === "gepland" ? "bg-blue-400" :
                    s === "in_uitvoering" ? "bg-orange-500" :
                    s === "voltooid" ? "bg-green-500" : "bg-gray-400"
                  }`} />
                  {statusLabel[s]}
                  {s === werkbon.status && <Check className="h-3 w-3 ml-auto text-muted-foreground" />}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Administratie</div>
              <div className="text-xs text-muted-foreground">
                Aangemaakt: {new Date(werkbon.aangemaakt_op).toLocaleDateString("nl-NL")}
              </div>
              <div className="text-xs text-muted-foreground">
                Bijgewerkt: {werkbon.bijgewerkt_op ? new Date(werkbon.bijgewerkt_op).toLocaleDateString("nl-NL") : "—"}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={verwijderOpen} onOpenChange={setVerwijderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Werkbon verwijderen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Weet u zeker dat u werkbon <strong>{werkbon.werkbonnummer}</strong> (<em>{werkbon.titel}</em>) wilt verwijderen?
            Deze actie kan niet ongedaan worden gemaakt.
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

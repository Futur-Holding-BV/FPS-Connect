import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListWerkbonnen,
  useCreateWerkbon,
  useListOnderhoudscontracten,
  useListGebouwen,
  useListToewijsbareGebruikers,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardList, Plus, Search, X, Building, Calendar, User, Wrench } from "lucide-react";
import { DemoBanner } from "@/components/ui/demo-banner";
import { demoWerkbonnen } from "@/lib/demo-data";
import { useQueryClient } from "@tanstack/react-query";
import { getListWerkbonnenQueryKey } from "@workspace/api-client-react";

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

function NieuweWerkbonDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: contracten } = useListOnderhoudscontracten();
  const { data: gebouwen } = useListGebouwen();
  const { data: monteurs } = useListToewijsbareGebruikers();
  const create = useCreateWerkbon();

  const [form, setForm] = useState({
    contract_id: "" as string,
    gebouw_id: "" as string,
    titel: "",
    omschrijving: "",
    type: "preventief",
    geplande_kwartaal: "" as string,
    geplande_datum: "",
    monteur_id: "" as string,
    status: "gepland",
    opmerkingen: "",
  });

  function set(k: keyof typeof form, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit() {
    if (!form.titel || !form.type) return;
    await create.mutateAsync({
      data: {
        contract_id: form.contract_id ? parseInt(form.contract_id) : null,
        gebouw_id: form.gebouw_id ? parseInt(form.gebouw_id) : null,
        titel: form.titel,
        omschrijving: form.omschrijving || null,
        type: form.type,
        geplande_kwartaal: form.geplande_kwartaal || null,
        geplande_datum: form.geplande_datum || null,
        monteur_id: form.monteur_id ? parseInt(form.monteur_id) : null,
        status: form.status,
        opmerkingen: form.opmerkingen || null,
      },
    });
    await qc.invalidateQueries({ queryKey: getListWerkbonnenQueryKey() });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nieuwe werkbon</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Titel <span className="text-destructive">*</span></Label>
            <Input
              value={form.titel}
              onChange={(e) => set("titel", e.target.value)}
              placeholder="Beschrijving werkzaamheden"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type <span className="text-destructive">*</span></Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(typeLabel).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
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
                  <SelectItem value="geannuleerd">Geannuleerd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Contract (optioneel)</Label>
              <Select value={form.contract_id} onValueChange={(v) => set("contract_id", v)}>
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
              <Select value={form.gebouw_id} onValueChange={(v) => set("gebouw_id", v)}>
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
              <Select value={form.geplande_kwartaal} onValueChange={(v) => set("geplande_kwartaal", v)}>
                <SelectTrigger><SelectValue placeholder="Kies kwartaal..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Q1">Q1 (jan–mrt)</SelectItem>
                  <SelectItem value="Q2">Q2 (apr–jun)</SelectItem>
                  <SelectItem value="Q3">Q3 (jul–sep)</SelectItem>
                  <SelectItem value="Q4">Q4 (okt–dec)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Datum (optioneel)</Label>
              <Input
                type="date"
                value={form.geplande_datum}
                onChange={(e) => set("geplande_datum", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Monteur (optioneel)</Label>
            <Select value={form.monteur_id} onValueChange={(v) => set("monteur_id", v)}>
              <SelectTrigger><SelectValue placeholder="Toewijzen aan..." /></SelectTrigger>
              <SelectContent>
                {monteurs?.map((m: { id: number; naam: string }) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Omschrijving / instructies</Label>
            <Textarea
              value={form.omschrijving}
              onChange={(e) => set("omschrijving", e.target.value)}
              rows={2}
              placeholder="Werkzaamheden, materialen, aandachtspunten..."
            />
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

export default function WerkbonnenLijst() {
  const [, navigate] = useLocation();
  const [zoek, setZoek] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [nieuwOpen, setNieuwOpen] = useState(false);

  const { data: werkbonnen, isLoading } = useListWerkbonnen();

  const gefilterd = werkbonnen?.filter((w) => {
    const matchStatus = statusFilter === "all" || w.status === statusFilter;
    const matchType = typeFilter === "all" || w.type === typeFilter;
    const matchZoek =
      !zoek ||
      w.werkbonnummer.toLowerCase().includes(zoek.toLowerCase()) ||
      w.titel.toLowerCase().includes(zoek.toLowerCase()) ||
      (w.gebouw_naam ?? "").toLowerCase().includes(zoek.toLowerCase()) ||
      (w.contractnummer ?? "").toLowerCase().includes(zoek.toLowerCase());
    return matchStatus && matchType && matchZoek;
  }) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Zoek op nummer, titel, gebouw of contract..."
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
            <SelectItem value="gepland">Gepland</SelectItem>
            <SelectItem value="in_uitvoering">In uitvoering</SelectItem>
            <SelectItem value="voltooid">Voltooid</SelectItem>
            <SelectItem value="geannuleerd">Geannuleerd</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle types</SelectItem>
            {Object.entries(typeLabel).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(zoek || statusFilter !== "all" || typeFilter !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setZoek(""); setStatusFilter("all"); setTypeFilter("all"); }}>
            <X className="h-4 w-4 mr-1" /> Wissen
          </Button>
        )}
        <Button onClick={() => setNieuwOpen(true)} className="ml-auto">
          <Plus className="h-4 w-4 mr-1" /> Nieuwe werkbon
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : gefilterd.length === 0 ? (
        werkbonnen?.length === 0 && !zoek && statusFilter === "all" && typeFilter === "all" ? (
          <div className="space-y-4">
            <DemoBanner />
            <div className="space-y-2">
              {demoWerkbonnen.map((w) => (
                <div key={w.id} className="group flex items-center gap-4 rounded-xl border bg-card px-5 py-4 opacity-80 shadow-sm">
                  <div className="p-2 bg-muted rounded-md shrink-0">
                    <Wrench className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{w.titel}</span>
                      <Badge variant="outline" className={statusKleur[w.status] ?? ""}>{statusLabel[w.status] ?? w.status}</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                      <span className="font-mono text-xs">{w.nummer}</span>
                      <span className="flex items-center gap-1"><Building className="h-3 w-3" />{w.gebouw_naam}</span>
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{w.toegewezen_aan}</span>
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{w.deadline}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center pt-1">
              <Button onClick={() => setNieuwOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Eerste werkbon aanmaken
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-20 text-center text-muted-foreground">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
            Geen werkbonnen gevonden voor deze filters.
          </div>
        )
      ) : (
        <div className="space-y-2">
          {gefilterd.map((w) => (
            <div
              key={w.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/onderhoud/werkbonnen/${w.id}`)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/onderhoud/werkbonnen/${w.id}`); } }}
              className="group flex items-center gap-4 rounded-xl border bg-card px-5 py-4 cursor-pointer shadow-sm hover:shadow-md hover:-translate-y-px hover:bg-muted/30 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="p-2 bg-muted rounded-md shrink-0">
                <Wrench className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{w.titel}</span>
                  <Badge variant="outline" className={statusKleur[w.status] ?? ""}>
                    {statusLabel[w.status] ?? w.status}
                  </Badge>
                  <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                    {typeLabel[w.type] ?? w.type}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                  <span className="font-mono text-xs">{w.werkbonnummer}</span>
                  {w.gebouw_naam && (
                    <span className="flex items-center gap-1">
                      <Building className="h-3 w-3" /> {w.gebouw_naam}
                    </span>
                  )}
                  {w.contractnummer && (
                    <span className="text-xs">{w.contractnummer}</span>
                  )}
                  {w.monteur_naam && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" /> {w.monteur_naam}
                    </span>
                  )}
                  {w.geplande_datum && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(w.geplande_datum).toLocaleDateString("nl-NL")}
                    </span>
                  )}
                  {w.geplande_kwartaal && !w.geplande_datum && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {w.geplande_kwartaal}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <NieuweWerkbonDialog open={nieuwOpen} onClose={() => setNieuwOpen(false)} />
    </div>
  );
}

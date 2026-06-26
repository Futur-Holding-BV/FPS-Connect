import { useState } from "react";
import { Link } from "wouter";
import {
  useListPlanningAfwezigheid,
  useCreatePlanningAfwezigheid,
  useUpdatePlanningAfwezigheid,
  useDeletePlanningAfwezigheid,
  useListPlanningMedewerkers,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus, Pencil, Trash2, CalendarX } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const TYPE_LABEL: Record<string, string> = {
  vakantie: "Vakantie",
  ziekte: "Ziekte",
  opleiding: "Opleiding",
  verlof: "Bijzonder verlof",
  anders: "Anders",
};

const TYPE_KLEUR: Record<string, string> = {
  vakantie: "bg-blue-100 text-blue-800 border-blue-200",
  ziekte: "bg-red-100 text-red-800 border-red-200",
  opleiding: "bg-purple-100 text-purple-800 border-purple-200",
  verlof: "bg-amber-100 text-amber-800 border-amber-200",
  anders: "bg-slate-100 text-slate-700 border-slate-200",
};

const STATUS_LABEL: Record<string, string> = {
  aangevraagd: "Aangevraagd",
  goedgekeurd: "Goedgekeurd",
  afgewezen: "Afgewezen",
};

const STATUS_KLEUR: Record<string, string> = {
  aangevraagd: "bg-amber-50 text-amber-700 border-amber-200",
  goedgekeurd: "bg-green-100 text-green-800 border-green-200",
  afgewezen: "bg-red-50 text-red-700 border-red-200",
};

function formatDatum(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function dagTelling(van: string, tot: string) {
  const v = new Date(van + "T00:00:00");
  const t = new Date(tot + "T00:00:00");
  return Math.round((t.getTime() - v.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

type AfwezigheidRij = {
  id: number;
  medewerker_id: number;
  medewerker_naam?: string | null;
  type: string;
  datum_start: string;
  datum_eind: string;
  omschrijving?: string | null;
  status: string;
};

type Medewerker = {
  id: number;
  naam: string;
};

type Form = {
  medewerker_id: string;
  type: string;
  datum_start: string;
  datum_eind: string;
  omschrijving: string;
  status: string;
};

const LEEG_FORM: Form = {
  medewerker_id: "",
  type: "vakantie",
  datum_start: "",
  datum_eind: "",
  omschrijving: "",
  status: "aangevraagd",
};

export default function PlanningAfwezigheid() {
  const queryClient = useQueryClient();
  const [dialoog, setDialoog] = useState<Form | null>(null);
  const [bewerkenId, setBewerkenId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("alle");

  const { data: afwezigheid = [], isLoading } = useListPlanningAfwezigheid(
    {},
    { query: { queryKey: ["planning-afwezigheid"] } }
  );
  const { data: medewerkers = [] } = useListPlanningMedewerkers(
    {},
    { query: { queryKey: ["planning-medewerkers"] } }
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["planning-afwezigheid"] });
  const createMut = useCreatePlanningAfwezigheid({ mutation: { onSuccess: () => { invalidate(); setDialoog(null); } } });
  const updateMut = useUpdatePlanningAfwezigheid({ mutation: { onSuccess: () => { invalidate(); setDialoog(null); setBewerkenId(null); } } });
  const deleteMut = useDeletePlanningAfwezigheid({ mutation: { onSuccess: invalidate } });

  function openNieuw() {
    setBewerkenId(null);
    setDialoog({ ...LEEG_FORM });
  }

  function openBewerken(rij: AfwezigheidRij) {
    setBewerkenId(rij.id);
    setDialoog({
      medewerker_id: String(rij.medewerker_id),
      type: rij.type,
      datum_start: rij.datum_start,
      datum_eind: rij.datum_eind,
      omschrijving: rij.omschrijving ?? "",
      status: rij.status,
    });
  }

  function handleOpslaan() {
    if (!dialoog || !dialoog.medewerker_id || !dialoog.datum_start || !dialoog.datum_eind) return;
    const payload = {
      medewerker_id: parseInt(dialoog.medewerker_id, 10),
      type: dialoog.type,
      datum_start: dialoog.datum_start,
      datum_eind: dialoog.datum_eind,
      omschrijving: dialoog.omschrijving || undefined,
      status: dialoog.status,
    };
    if (bewerkenId) {
      updateMut.mutate({ id: bewerkenId, data: payload });
    } else {
      createMut.mutate({ data: payload });
    }
  }

  const gefilterd = (afwezigheid as AfwezigheidRij[]).filter(
    (a) => statusFilter === "alle" || a.status === statusFilter
  );

  const aantalGoedgekeurd = (afwezigheid as AfwezigheidRij[]).filter((a) => a.status === "goedgekeurd").length;
  const aantalAangevraagd = (afwezigheid as AfwezigheidRij[]).filter((a) => a.status === "aangevraagd").length;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/modules/planning">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Afwezigheid</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Vakantie, ziekte, verlof en opleidingen beheren
            </p>
          </div>
        </div>
        <Button onClick={openNieuw}>
          <Plus className="h-4 w-4 mr-2" />
          Afwezigheid registreren
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Aangevraagd</p>
            <p className="text-2xl font-semibold text-amber-600">{aantalAangevraagd}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Goedgekeurd</p>
            <p className="text-2xl font-semibold text-green-600">{aantalGoedgekeurd}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Totaal geregistreerd</p>
            <p className="text-2xl font-semibold">{(afwezigheid as AfwezigheidRij[]).length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Afwezigheidsregistraties</CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle statussen</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : gefilterd.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground">
              <CalendarX className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Geen afwezigheidsregistraties gevonden</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                  <th className="px-6 py-3 text-left font-medium">Medewerker</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Periode</th>
                  <th className="px-4 py-3 text-center font-medium">Dagen</th>
                  <th className="px-4 py-3 text-left font-medium">Omschrijving</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {gefilterd.map((rij) => (
                  <tr key={rij.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium">{rij.medewerker_naam ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs border ${TYPE_KLEUR[rij.type] ?? TYPE_KLEUR.anders}`}>
                        {TYPE_LABEL[rij.type] ?? rij.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDatum(rij.datum_start)}
                      {rij.datum_start !== rij.datum_eind && (
                        <span> — {formatDatum(rij.datum_eind)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {dagTelling(rij.datum_start, rij.datum_eind)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                      {rij.omschrijving ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs border ${STATUS_KLEUR[rij.status] ?? ""}`}>
                        {STATUS_LABEL[rij.status] ?? rij.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        {rij.status === "aangevraagd" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50"
                            onClick={() => updateMut.mutate({ id: rij.id, data: { ...rij, status: "goedgekeurd" } })}
                          >
                            Goedkeuren
                          </Button>
                        )}
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => openBewerken(rij)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          onClick={() => deleteMut.mutate({ id: rij.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialoog !== null} onOpenChange={() => setDialoog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{bewerkenId ? "Afwezigheid bewerken" : "Afwezigheid registreren"}</DialogTitle>
          </DialogHeader>
          {dialoog && (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>Medewerker *</Label>
                <Select
                  value={dialoog.medewerker_id}
                  onValueChange={(v) => setDialoog((d) => d ? { ...d, medewerker_id: v } : d)}
                >
                  <SelectTrigger><SelectValue placeholder="Kies medewerker..." /></SelectTrigger>
                  <SelectContent>
                    {(medewerkers as Medewerker[]).map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Type afwezigheid</Label>
                  <Select value={dialoog.type} onValueChange={(v) => setDialoog((d) => d ? { ...d, type: v } : d)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={dialoog.status} onValueChange={(v) => setDialoog((d) => d ? { ...d, status: v } : d)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Van *</Label>
                  <DatePicker
                    value={dialoog.datum_start}
                    onChange={(v) => setDialoog((d) => d ? { ...d, datum_start: v } : d)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tot en met *</Label>
                  <DatePicker
                    value={dialoog.datum_eind}
                    min={dialoog.datum_start}
                    onChange={(v) => setDialoog((d) => d ? { ...d, datum_eind: v } : d)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Omschrijving</Label>
                <Textarea
                  rows={2}
                  value={dialoog.omschrijving}
                  onChange={(e) => setDialoog((d) => d ? { ...d, omschrijving: e.target.value } : d)}
                  placeholder="Toelichting..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialoog(null)}>Annuleren</Button>
            <Button
              onClick={handleOpslaan}
              disabled={!dialoog?.medewerker_id || !dialoog?.datum_start || !dialoog?.datum_eind}
            >
              {bewerkenId ? "Opslaan" : "Registreren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

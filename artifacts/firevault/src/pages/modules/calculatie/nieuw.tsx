import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateModCalculatie } from "@workspace/api-client-react";
import { useListGebouwen } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function ModulesCalculatieNieuw() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    naam: "",
    referentie: "",
    klant_naam: "",
    gebouw_id: "",
    project_naam: "",
    status: "concept",
    omschrijving: "",
    opslag_ak: 15,
    opslag_abk: 10,
    opslag_risico: 5,
    opslag_winst: 10,
    korting: 0,
  });

  const { data: gebouwen = [] } = useListGebouwen({}, { query: { queryKey: ["gebouwen-calc"] } });

  const createMut = useCreateModCalculatie({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ["mod-calculaties"] });
        navigate(`/modules/calculatie/${data.id}`);
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.naam.trim()) return;
    createMut.mutate({
      data: {
        naam: form.naam,
        referentie: form.referentie || undefined,
        klant_naam: form.klant_naam || undefined,
        gebouw_id: form.gebouw_id ? Number(form.gebouw_id) : undefined,
        project_naam: form.project_naam || undefined,
        status: form.status,
        omschrijving: form.omschrijving || undefined,
        opslag_ak: form.opslag_ak,
        opslag_abk: form.opslag_abk,
        opslag_risico: form.opslag_risico,
        opslag_winst: form.opslag_winst,
        korting: form.korting,
      },
    });
  }

  function setField(field: string, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/modules/calculatie")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Nieuwe calculatie</h1>
          <p className="text-sm text-muted-foreground">Vul de basisgegevens in om te beginnen</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basisgegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="naam">Naam calculatie *</Label>
                <Input
                  id="naam"
                  value={form.naam}
                  onChange={(e) => setField("naam", e.target.value)}
                  placeholder="Bijv. Brandwerende afdichting Project X"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="referentie">Referentienummer</Label>
                <Input
                  id="referentie"
                  value={form.referentie}
                  onChange={(e) => setField("referentie", e.target.value)}
                  placeholder="Bijv. CAL-2026-001"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concept">Concept</SelectItem>
                    <SelectItem value="intern_akkoord">Intern akkoord</SelectItem>
                    <SelectItem value="aangeboden">Aangeboden</SelectItem>
                    <SelectItem value="gewonnen">Gewonnen</SelectItem>
                    <SelectItem value="verloren">Verloren</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="klant_naam">Klantnaam</Label>
                <Input
                  id="klant_naam"
                  value={form.klant_naam}
                  onChange={(e) => setField("klant_naam", e.target.value)}
                  placeholder="Naam van de opdrachtgever"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project_naam">Projectnaam</Label>
                <Input
                  id="project_naam"
                  value={form.project_naam}
                  onChange={(e) => setField("project_naam", e.target.value)}
                  placeholder="Bijv. Renovatie Kantoorpand Y"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="gebouw">Gekoppeld gebouw (optioneel)</Label>
                <Select value={form.gebouw_id} onValueChange={(v) => setField("gebouw_id", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer gebouw..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Geen gebouw</SelectItem>
                    {gebouwen.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.naam} — {g.stad ?? g.adres}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="omschrijving">Omschrijving</Label>
                <Textarea
                  id="omschrijving"
                  value={form.omschrijving}
                  onChange={(e) => setField("omschrijving", e.target.value)}
                  placeholder="Toelichting op de opdracht of scope..."
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Opslagen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              {[
                { field: "opslag_ak", label: "Alg. kosten (%)" },
                { field: "opslag_risico", label: "Risico (%)" },
                { field: "opslag_winst", label: "Winst (%)" },
                { field: "korting", label: "Korting (%)" },
              ].map(({ field, label }) => (
                <div key={field} className="space-y-1.5">
                  <Label htmlFor={field}>{label}</Label>
                  <Input
                    id={field}
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={form[field as keyof typeof form]}
                    onChange={(e) => setField(field, parseFloat(e.target.value) || 0)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/modules/calculatie")}>
            Annuleren
          </Button>
          <Button type="submit" disabled={createMut.isPending || !form.naam.trim()}>
            {createMut.isPending ? "Aanmaken..." : "Calculatie aanmaken"}
          </Button>
        </div>
      </form>
    </div>
  );
}

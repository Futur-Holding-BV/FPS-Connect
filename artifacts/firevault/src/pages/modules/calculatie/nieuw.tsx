import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useCreateModCalculatie } from "@workspace/api-client-react";
import { useListGebouwen } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
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
  const search = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const vooringevuldGebouwId = new URLSearchParams(search).get("gebouw_id") ?? "__geen__";

  const [form, setForm] = useState({
    naam: "",
    klant_naam: "",
    gebouw_id: vooringevuldGebouwId,
    project_naam: "",
    status: "concept",
    omschrijving: "",
    opslag_materiaal: 0,
    opslag_arbeid: 0,
    opslag_ak: 15,
    opslag_risico: 5,
    opslag_winst: 10,
    korting: 0,
  });

  const [klantNaamHandmatig, setKlantNaamHandmatig]       = useState(false);
  const [projectNaamHandmatig, setProjectNaamHandmatig]   = useState(false);
  const [omschrijvingHandmatig, setOmschrijvingHandmatig] = useState(false);

  const { data: gebouwenData } = useListGebouwen();
  const gebouwen = Array.isArray(gebouwenData) ? gebouwenData : [];

  useEffect(() => {
    const lijst = Array.isArray(gebouwenData) ? gebouwenData : [];

    if (form.gebouw_id === "__geen__") {
      setForm((f) => ({
        ...f,
        klant_naam:  klantNaamHandmatig    ? f.klant_naam  : "",
        project_naam: projectNaamHandmatig ? f.project_naam : "",
        omschrijving: omschrijvingHandmatig ? f.omschrijving : "",
      }));
      return;
    }

    const gebouw = lijst.find((g) => String(g.id) === form.gebouw_id);
    if (!gebouw) return;

    // Opdrachtgever: direct veld eerst, daarna partijen-fallback
    if (!klantNaamHandmatig) {
      const directKlant = (gebouw as any).klant_naam as string | null | undefined;
      const partijen = (gebouw as any).partijen as { type: string; naam: string }[] | undefined;
      const viaPartij = partijen?.find((p) => p.type === "opdrachtgever")?.naam;
      const gevonden = directKlant || viaPartij || "";
      if (gevonden) {
        setForm((f) => ({ ...f, klant_naam: gevonden }));
      }
    }

    // Projectnaam: gebruik gebouwnaam als standaard
    if (!projectNaamHandmatig) {
      setForm((f) => ({ ...f, project_naam: gebouw.naam }));
    }

    // Omschrijving: gebouw-omschrijving als die er is
    if (!omschrijvingHandmatig) {
      const oms = (gebouw as any).omschrijving as string | null | undefined;
      if (oms) {
        setForm((f) => ({ ...f, omschrijving: oms }));
      }
    }
  }, [form.gebouw_id, gebouwenData, klantNaamHandmatig, projectNaamHandmatig, omschrijvingHandmatig]);

  const createMut = useCreateModCalculatie({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ["mod-calculaties"] });
        navigate(`/modules/calculatie/${data.id}`);
      },
      onError: () => {
        toast({
          title: "Fout bij aanmaken",
          description: "De calculatie kon niet worden aangemaakt. Probeer het opnieuw.",
          variant: "destructive",
        });
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.naam.trim()) return;
    createMut.mutate({
      data: {
        naam: form.naam,
        klant_naam: form.klant_naam || undefined,
        gebouw_id: form.gebouw_id && form.gebouw_id !== "__geen__" ? Number(form.gebouw_id) : undefined,
        project_naam: form.project_naam || undefined,
        status: form.status,
        omschrijving: form.omschrijving || undefined,
        opslag_materiaal: form.opslag_materiaal,
        opslag_arbeid: form.opslag_arbeid,
        opslag_ak: form.opslag_ak,
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
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="gebouw">Gekoppeld gebouw (optioneel)</Label>
                <Select
                  value={form.gebouw_id}
                  onValueChange={(v) => {
                    setKlantNaamHandmatig(false);
                    setProjectNaamHandmatig(false);
                    setOmschrijvingHandmatig(false);
                    setField("gebouw_id", v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer gebouw..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__geen__">Geen gebouw</SelectItem>
                    {gebouwen.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.naam} — {(g as any).stad ?? (g as any).adres}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="klant_naam">
                  Opdrachtgever
                  {!klantNaamHandmatig && form.gebouw_id !== "__geen__" && form.klant_naam && (
                    <span className="ml-1.5 text-xs text-muted-foreground">(uit gebouw)</span>
                  )}
                </Label>
                <Input
                  id="klant_naam"
                  value={form.klant_naam}
                  onChange={(e) => {
                    setKlantNaamHandmatig(true);
                    setField("klant_naam", e.target.value);
                  }}
                  placeholder="Naam van de opdrachtgever"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project_naam">
                  Projectnaam
                  {!projectNaamHandmatig && form.gebouw_id !== "__geen__" && form.project_naam && (
                    <span className="ml-1.5 text-xs text-muted-foreground">(uit gebouw)</span>
                  )}
                </Label>
                <Input
                  id="project_naam"
                  value={form.project_naam}
                  onChange={(e) => {
                    setProjectNaamHandmatig(true);
                    setField("project_naam", e.target.value);
                  }}
                  placeholder="Bijv. Renovatie Kantoorpand Y"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="omschrijving">
                  Omschrijving
                  {!omschrijvingHandmatig && form.gebouw_id !== "__geen__" && form.omschrijving && (
                    <span className="ml-1.5 text-xs text-muted-foreground">(uit gebouw)</span>
                  )}
                </Label>
                <Textarea
                  id="omschrijving"
                  value={form.omschrijving}
                  onChange={(e) => {
                    setOmschrijvingHandmatig(true);
                    setField("omschrijving", e.target.value);
                  }}
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
            <div className="grid grid-cols-3 gap-4">
              {[
                { field: "opslag_materiaal", label: "Opslag materiaal (%)" },
                { field: "opslag_arbeid",    label: "Opslag arbeid (%)" },
                { field: "opslag_ak",        label: "AK (%)" },
                { field: "opslag_risico",    label: "Risico (%)" },
                { field: "opslag_winst",     label: "Winst (%)" },
                { field: "korting",          label: "Korting (%)" },
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

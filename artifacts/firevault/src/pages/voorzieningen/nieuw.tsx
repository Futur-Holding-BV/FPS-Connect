import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useCreateLabel,
  useListVoorzieningTypes,
  getListLabelsQueryKey,
} from "@workspace/api-client-react";
import type { VoorzieningType } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, BookOpen, CheckCircle, Info } from "lucide-react";

const WERENDHEID_OPTIES = [
  { waarde: "WRD30", label: "WRD 30 — rookwerend 30 min" },
  { waarde: "EW20", label: "EW 20 — brandwerend WBDBO 20 min" },
  { waarde: "EW30", label: "EW 30 — brandwerend WBDBO 30 min" },
  { waarde: "EW60", label: "EW 60 — brandwerend WBDBO 60 min" },
  { waarde: "EI30", label: "EI 30 — brandwerend 30 min" },
  { waarde: "EI60", label: "EI 60 — brandwerend 60 min" },
];

const GEEN_TYPE = "__geen__";
const GEEN_WERENDHEID = "__geen__";

export default function VoorzieningNieuw() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [geslaagd, setGeslaagd] = useState(false);
  const [form, setForm] = useState({
    type_code: "",
    naam: "",
    werendheid: GEEN_WERENDHEID,
    fabrikant: "",
  });

  const { data: typen = [] } = useListVoorzieningTypes();
  const maakLabel = useCreateLabel();

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  }

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    if (!form.type_code || !form.naam.trim()) return;
    await maakLabel.mutateAsync({
      data: {
        type_code: form.type_code,
        naam: form.naam.trim(),
        testnorm: form.werendheid !== GEEN_WERENDHEID ? form.werendheid : undefined,
        fabrikant: form.fabrikant.trim() || undefined,
      },
    });
    await queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
    setGeslaagd(true);
  }

  function reset() {
    setGeslaagd(false);
    setForm({ type_code: "", naam: "", werendheid: GEEN_WERENDHEID, fabrikant: "" });
  }

  if (geslaagd) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <CheckCircle className="h-14 w-14 text-green-600 mx-auto" />
        <h2 className="text-2xl font-bold">Toepassing toegevoegd</h2>
        <p className="text-muted-foreground">
          De toepassing is opgeslagen in de bibliotheek en is voortaan beschikbaar als keuze
          bij het aanmaken van een concrete spot in een gebouw.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Button variant="outline" asChild>
            <Link href="/beheer/bibliotheek">Naar bibliotheek</Link>
          </Button>
          <Button onClick={reset}>Nog een toepassing toevoegen</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/beheer/bibliotheek">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nieuwe toepassing</h1>
          <p className="text-muted-foreground text-sm">
            Voeg een productsoort of product toe aan de centrale bibliotheek.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
        <span>
          Toepassingen in de bibliotheek zijn <strong>niet gebouwgebonden</strong>. Bij het
          aanmaken of bewerken van een concrete spot in een gebouw kiest de monteur de
          applicatie (type) en vervolgens de toepassing (product) uit deze bibliotheek.
          Concrete spots worden aangemaakt via de plattegrond van een gebouw.
        </span>
      </div>

      <form onSubmit={verstuur} className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              Applicatie-type
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Type *</Label>
              <Select
                value={form.type_code || GEEN_TYPE}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, type_code: v === GEEN_TYPE ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies een applicatie-type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GEEN_TYPE} disabled>
                    Kies een applicatie-type...
                  </SelectItem>
                  {(typen as VoorzieningType[])
                    .filter((t) => t.actief)
                    .map((t) => (
                      <SelectItem key={t.code} value={t.code}>
                        <span className="font-mono text-xs mr-2 text-muted-foreground">
                          {t.code}
                        </span>
                        {t.naam}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Kies het applicatie-type waaronder deze toepassing valt (bijv. 1.6 kabel).
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Product / productsoort</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="naam">Naam of omschrijving *</Label>
              <Input
                id="naam"
                value={form.naam}
                onChange={set("naam")}
                placeholder="Bijv. Schakelmanchet Multicollar Slim"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Gebruik de productnaam zoals vermeld op de fabrikantwebsite of het productblad.
              </p>
            </div>

            <div>
              <Label>Werendheid</Label>
              <Select
                value={form.werendheid}
                onValueChange={(v) => setForm((f) => ({ ...f, werendheid: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies werendheid (optioneel)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GEEN_WERENDHEID}>Niet opgegeven</SelectItem>
                  {WERENDHEID_OPTIES.map((w) => (
                    <SelectItem key={w.waarde} value={w.waarde}>
                      <span className="font-mono text-xs mr-2">{w.waarde}</span>
                      {w.label.split(" — ")[1]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Kies "Brandwerendheid WBDBO" voor EW-waarden, "Rookwerendheid" voor WRD,
                of "Brandwerendheid" voor EI-waarden.
              </p>
            </div>

            <div>
              <Label htmlFor="fabrikant">Fabrikant</Label>
              <Input
                id="fabrikant"
                value={form.fabrikant}
                onChange={set("fabrikant")}
                placeholder="Bijv. Hilti (optioneel)"
                autoComplete="off"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href="/beheer/bibliotheek">Annuleren</Link>
          </Button>
          <Button
            type="submit"
            disabled={maakLabel.isPending || !form.type_code || !form.naam.trim()}
          >
            {maakLabel.isPending ? "Opslaan..." : "Toepassing toevoegen aan bibliotheek"}
          </Button>
        </div>
      </form>
    </div>
  );
}

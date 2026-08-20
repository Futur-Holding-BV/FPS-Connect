import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListLoonInkomstenverhoudingen,
  useListLoonAfspraken,
  useCreateLoonAfspraak,
  getListLoonAfsprakenQueryKey,
  LoonAfspraakInputLoonsoort,
  LoonAfspraakInputTabelkeuze,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Save } from "lucide-react";

type NieuwForm = {
  ingangsdatum: string;
  loonsoort: string;
  bedrag_euros: string;
  schaal: string;
  trede: string;
  loonheffingskorting: boolean;
  tabelkeuze: string;
  anoniementarief: boolean;
};

const LEEG: NieuwForm = {
  ingangsdatum: "",
  loonsoort: "maandloon",
  bedrag_euros: "",
  schaal: "",
  trede: "",
  loonheffingskorting: false,
  tabelkeuze: "wit",
  anoniementarief: false,
};

const BOOL_VELDEN: { key: keyof NieuwForm; label: string }[] = [
  { key: "loonheffingskorting", label: "Loonheffingskorting toepassen" },
  { key: "anoniementarief", label: "Anoniementarief" },
];

export function LoonafsprakenTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: verhoudingen = [] } = useListLoonInkomstenverhoudingen();
  const [geselecteerdeIV, setGeselecteerdeIV] = useState<number | null>(null);

  const afspraakParams = { inkomstenverhouding_id: geselecteerdeIV ?? 0 };
  const { data: afspraken = [], isLoading } = useListLoonAfspraken(afspraakParams, {
    query: {
      enabled: geselecteerdeIV !== null,
      queryKey: getListLoonAfsprakenQueryKey(afspraakParams),
    },
  });

  const [toonFormulier, setToonFormulier] = useState(false);
  const [nieuw, setNieuw] = useState<NieuwForm>(LEEG);
  function resetNieuw() { setNieuw(LEEG); }

  const createMutation = useCreateLoonAfspraak({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListLoonAfsprakenQueryKey() });
        toast({ title: "Loonafspraak toegevoegd" });
        setToonFormulier(false);
        resetNieuw();
      },
      onError: () => toast({ title: "Aanmaken mislukt", variant: "destructive" }),
    },
  });

  function submitNieuw() {
    if (!geselecteerdeIV || !nieuw.ingangsdatum || !nieuw.bedrag_euros) {
      toast({ title: "Vul ingangsdatum en bedrag in.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      data: {
        inkomstenverhouding_id: geselecteerdeIV,
        ingangsdatum: nieuw.ingangsdatum,
        loonsoort: nieuw.loonsoort as LoonAfspraakInputLoonsoort,
        bedrag_cents: Math.round(parseFloat(nieuw.bedrag_euros) * 100),
        schaal: nieuw.schaal || null,
        trede: nieuw.trede || null,
        vaste_toeslagen: [],
        loonheffingskorting: nieuw.loonheffingskorting,
        tabelkeuze: nieuw.tabelkeuze as LoonAfspraakInputTabelkeuze,
        anoniementarief: nieuw.anoniementarief,
      },
    });
  }

  const gekozenIV = verhoudingen.find((iv) => iv.id === geselecteerdeIV);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1 w-72">
          <Label>Inkomstenverhouding</Label>
          <Select
            value={geselecteerdeIV ? String(geselecteerdeIV) : ""}
            onValueChange={(v) => setGeselecteerdeIV(Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Kies een inkomstenverhouding" />
            </SelectTrigger>
            <SelectContent>
              {verhoudingen.map((iv) => (
                <SelectItem key={iv.id} value={String(iv.id)}>
                  {iv.medewerker_naam} — {iv.werkgever_naam} (#{iv.volgnummer})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {geselecteerdeIV && (
          <Button size="sm" onClick={() => setToonFormulier((v) => !v)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Loonafspraak toevoegen
          </Button>
        )}
      </div>

      {geselecteerdeIV && gekozenIV && (
        <div className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
          {gekozenIV.medewerker_naam} · {gekozenIV.werkgever_naam} · aanvang{" "}
          {gekozenIV.datum_aanvang}
        </div>
      )}

      {toonFormulier && geselecteerdeIV && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Historische loonafspraak toevoegen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Ingangsdatum</Label>
                <Input
                  type="date"
                  value={nieuw.ingangsdatum}
                  onChange={(e) =>
                    setNieuw((f) => ({ ...f, ingangsdatum: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Loonsoort</Label>
                <Select
                  value={nieuw.loonsoort}
                  onValueChange={(v) => setNieuw((f) => ({ ...f, loonsoort: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uurloon">Uurloon</SelectItem>
                    <SelectItem value="maandloon">Maandloon</SelectItem>
                    <SelectItem value="weekloon">Weekloon</SelectItem>
                    <SelectItem value="stukloon">Stukloon</SelectItem>
                    <SelectItem value="overig">Overig</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Bedrag (€)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="bijv. 2500.00"
                  value={nieuw.bedrag_euros}
                  onChange={(e) =>
                    setNieuw((f) => ({ ...f, bedrag_euros: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Loontabel</Label>
                <Select
                  value={nieuw.tabelkeuze}
                  onValueChange={(v) => setNieuw((f) => ({ ...f, tabelkeuze: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wit">Wit (regulier)</SelectItem>
                    <SelectItem value="groen">Groen (bijz. beloning)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Schaal (optioneel)</Label>
                <Input
                  placeholder="bijv. A"
                  value={nieuw.schaal}
                  onChange={(e) => setNieuw((f) => ({ ...f, schaal: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Trede (optioneel)</Label>
                <Input
                  placeholder="bijv. 3"
                  value={nieuw.trede}
                  onChange={(e) => setNieuw((f) => ({ ...f, trede: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              {BOOL_VELDEN.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    className="rounded border-input"
                    checked={nieuw[key] as boolean}
                    onChange={(e) =>
                      setNieuw((f) => ({ ...f, [key]: e.target.checked }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={submitNieuw} disabled={createMutation.isPending}>
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {createMutation.isPending ? "Opslaan…" : "Opslaan"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setToonFormulier(false); resetNieuw(); }}
              >
                Annuleren
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!geselecteerdeIV && (
        <div className="py-8 text-center text-muted-foreground text-sm">
          Kies een inkomstenverhouding om de loonafspraken te bekijken.
        </div>
      )}
      {geselecteerdeIV && isLoading && (
        <div className="py-8 text-center text-muted-foreground text-sm">Laden…</div>
      )}
      {geselecteerdeIV && !isLoading && afspraken.length === 0 && (
        <div className="py-6 text-center text-muted-foreground text-sm">
          Nog geen loonafspraken voor deze inkomstenverhouding.
        </div>
      )}

      {afspraken.map((af) => (
        <Card key={af.id}>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-sm">Ingangsdatum {af.ingangsdatum}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {af.loonsoort} · € {(af.bedrag_cents / 100).toFixed(2)}
                  {af.schaal ? ` · Schaal ${af.schaal}` : ""}
                  {af.trede ? ` · Trede ${af.trede}` : ""}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Badge variant="outline" className="text-[10px]">
                  {af.tabelkeuze === "wit" ? "Wit" : "Groen"}
                </Badge>
                {af.loonheffingskorting && (
                  <Badge variant="secondary" className="text-[10px]">LHK</Badge>
                )}
                {af.anoniementarief && (
                  <Badge variant="destructive" className="text-[10px]">Anoniem</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListLoonInkomstenverhoudingen,
  useCreateLoonInkomstenverhouding,
  useListLoonfundamentAanstellingen,
  useListWerkgevers,
  getListLoonInkomstenverhoudingenQueryKey,
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
  werkgever_id: string;
  aanstelling_id: string;
  volgnummer: string;
  datum_aanvang: string;
  datum_einde: string;
  code_aard_arbeidsverhouding: string;
  contract_onbepaalde_tijd: boolean;
  schriftelijke_arbeidsovereenkomst: boolean;
  oproepovereenkomst: boolean;
  verzekerd_zw: boolean;
  verzekerd_ww: boolean;
  verzekerd_wia: boolean;
  code_invloed_verzekeringsplicht: string;
};

const LEEG: NieuwForm = {
  werkgever_id: "",
  aanstelling_id: "",
  volgnummer: "1",
  datum_aanvang: "",
  datum_einde: "",
  code_aard_arbeidsverhouding: "",
  contract_onbepaalde_tijd: false,
  schriftelijke_arbeidsovereenkomst: false,
  oproepovereenkomst: false,
  verzekerd_zw: true,
  verzekerd_ww: true,
  verzekerd_wia: true,
  code_invloed_verzekeringsplicht: "",
};

const BOOL_VELDEN: { key: keyof NieuwForm; label: string }[] = [
  { key: "contract_onbepaalde_tijd", label: "Contract voor onbepaalde tijd" },
  { key: "schriftelijke_arbeidsovereenkomst", label: "Schriftelijke arbeidsovereenkomst" },
  { key: "oproepovereenkomst", label: "Oproepovereenkomst" },
  { key: "verzekerd_zw", label: "Verzekerd ZW" },
  { key: "verzekerd_ww", label: "Verzekerd WW" },
  { key: "verzekerd_wia", label: "Verzekerd WIA" },
];

export function InkomstenverhoudingenTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: werkgevers = [] } = useListWerkgevers();
  const { data: aanstellingen = [] } = useListLoonfundamentAanstellingen();

  const [filterWerkgever, setFilterWerkgever] = useState<string>("alle");
  const params =
    filterWerkgever !== "alle" ? { werkgever_id: Number(filterWerkgever) } : undefined;
  const { data: verhoudingen = [], isLoading } = useListLoonInkomstenverhoudingen(params);

  const [toonFormulier, setToonFormulier] = useState(false);
  const [nieuw, setNieuw] = useState<NieuwForm>(LEEG);
  function resetNieuw() { setNieuw(LEEG); }

  const createMutation = useCreateLoonInkomstenverhouding({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListLoonInkomstenverhoudingenQueryKey() });
        toast({ title: "Inkomstenverhouding aangemaakt" });
        setToonFormulier(false);
        resetNieuw();
      },
      onError: () => toast({ title: "Aanmaken mislukt", variant: "destructive" }),
    },
  });

  function submitNieuw() {
    if (!nieuw.werkgever_id || !nieuw.aanstelling_id || !nieuw.datum_aanvang) {
      toast({
        title: "Vul minimaal werkgever, aanstelling en aanvangsdatum in.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({
      data: {
        werkgever_id: Number(nieuw.werkgever_id),
        medewerker_id:
          aanstellingen.find((a) => a.id === Number(nieuw.aanstelling_id))
            ?.medewerker_id ?? 0,
        aanstelling_id: Number(nieuw.aanstelling_id),
        volgnummer: Number(nieuw.volgnummer),
        datum_aanvang: nieuw.datum_aanvang,
        datum_einde: nieuw.datum_einde || null,
        code_aard_arbeidsverhouding: nieuw.code_aard_arbeidsverhouding || null,
        contract_onbepaalde_tijd: nieuw.contract_onbepaalde_tijd,
        schriftelijke_arbeidsovereenkomst: nieuw.schriftelijke_arbeidsovereenkomst,
        oproepovereenkomst: nieuw.oproepovereenkomst,
        verzekerd_zw: nieuw.verzekerd_zw,
        verzekerd_ww: nieuw.verzekerd_ww,
        verzekerd_wia: nieuw.verzekerd_wia,
        code_invloed_verzekeringsplicht:
          nieuw.code_invloed_verzekeringsplicht || null,
      },
    });
  }

  const gefilterdAanstellingen = nieuw.werkgever_id
    ? aanstellingen.filter((a) => a.werkgever_id === Number(nieuw.werkgever_id))
    : aanstellingen;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Select value={filterWerkgever} onValueChange={setFilterWerkgever}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Alle werkgevers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle werkgevers</SelectItem>
            {werkgevers.map((wg) => (
              <SelectItem key={wg.id} value={String(wg.id)}>
                {wg.naam}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setToonFormulier((v) => !v)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Inkomstenverhouding toevoegen
        </Button>
      </div>

      {toonFormulier && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Nieuwe inkomstenverhouding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Werkgever</Label>
                <Select
                  value={nieuw.werkgever_id}
                  onValueChange={(v) =>
                    setNieuw((f) => ({ ...f, werkgever_id: v, aanstelling_id: "" }))
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Kies werkgever" /></SelectTrigger>
                  <SelectContent>
                    {werkgevers.map((wg) => (
                      <SelectItem key={wg.id} value={String(wg.id)}>
                        {wg.naam}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Aanstelling (medewerker)</Label>
                <Select
                  value={nieuw.aanstelling_id}
                  onValueChange={(v) =>
                    setNieuw((f) => ({ ...f, aanstelling_id: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kies aanstelling" />
                  </SelectTrigger>
                  <SelectContent>
                    {gefilterdAanstellingen.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.medewerker_naam}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Volgnummer</Label>
                <Input
                  type="number"
                  min={1}
                  value={nieuw.volgnummer}
                  onChange={(e) =>
                    setNieuw((f) => ({ ...f, volgnummer: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Code aard arbeidsverhouding</Label>
                <Input
                  placeholder="bijv. 11"
                  value={nieuw.code_aard_arbeidsverhouding}
                  onChange={(e) =>
                    setNieuw((f) => ({
                      ...f,
                      code_aard_arbeidsverhouding: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Datum aanvang</Label>
                <Input
                  type="date"
                  value={nieuw.datum_aanvang}
                  onChange={(e) =>
                    setNieuw((f) => ({ ...f, datum_aanvang: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Datum einde (optioneel)</Label>
                <Input
                  type="date"
                  value={nieuw.datum_einde}
                  onChange={(e) =>
                    setNieuw((f) => ({ ...f, datum_einde: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Code invloed verzekeringsplicht</Label>
                <Input
                  placeholder="optioneel"
                  value={nieuw.code_invloed_verzekeringsplicht}
                  onChange={(e) =>
                    setNieuw((f) => ({
                      ...f,
                      code_invloed_verzekeringsplicht: e.target.value,
                    }))
                  }
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
                {createMutation.isPending ? "Aanmaken…" : "Aanmaken"}
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

      {isLoading && (
        <div className="py-8 text-center text-muted-foreground text-sm">Laden…</div>
      )}
      {!isLoading && verhoudingen.length === 0 && (
        <div className="py-8 text-center text-muted-foreground text-sm">
          Geen inkomstenverhoudingen gevonden.
        </div>
      )}

      {verhoudingen.map((iv) => (
        <Card key={iv.id}>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-medium text-sm">{iv.medewerker_naam}</p>
                <p className="text-xs text-muted-foreground">
                  {iv.werkgever_naam} · Volgnummer {iv.volgnummer}
                </p>
              </div>
              <Badge
                variant={iv.actief ? "default" : "secondary"}
                className="text-[10px]"
              >
                {iv.actief ? "Actief" : "Inactief"}
              </Badge>
            </div>
            <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
              <div>
                <dt className="text-muted-foreground">Aanvang</dt>
                <dd>{iv.datum_aanvang}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Einde</dt>
                <dd>{iv.datum_einde ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Aard arbeidsverhouding</dt>
                <dd>{iv.code_aard_arbeidsverhouding ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Verzekeringen</dt>
                <dd className="flex gap-1 flex-wrap">
                  {iv.verzekerd_zw && (
                    <span className="bg-blue-100 text-blue-700 px-1 rounded">ZW</span>
                  )}
                  {iv.verzekerd_ww && (
                    <span className="bg-blue-100 text-blue-700 px-1 rounded">WW</span>
                  )}
                  {iv.verzekerd_wia && (
                    <span className="bg-blue-100 text-blue-700 px-1 rounded">WIA</span>
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

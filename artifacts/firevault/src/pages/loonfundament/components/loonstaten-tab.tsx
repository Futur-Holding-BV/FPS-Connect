import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListLoonStaten,
  useCreateLoonStaat,
  useListLoonInkomstenverhoudingen,
  getListLoonStatenQueryKey,
  LoonStaatInputTijdvak,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Save } from "lucide-react";
import { HUIDIG_JAAR } from "./helpers";

const TIJDVAK_LABEL: Record<string, string> = {
  maand: "Maand",
  vier_weken: "Vier weken",
};

type NieuwForm = {
  inkomstenverhouding_id: string;
  kalenderjaar: string;
  tijdvak: string;
};

const LEEG: NieuwForm = {
  inkomstenverhouding_id: "",
  kalenderjaar: String(HUIDIG_JAAR),
  tijdvak: "maand",
};

export function LoonstatenTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: verhoudingen = [] } = useListLoonInkomstenverhoudingen();

  const [filterJaar, setFilterJaar] = useState<string>("alle");
  const [filterIV, setFilterIV] = useState<string>("alle");
  const [toonFormulier, setToonFormulier] = useState(false);
  const [nieuw, setNieuw] = useState<NieuwForm>(LEEG);
  function resetNieuw() { setNieuw(LEEG); }

  const { data: alleLoonstaten = [], isLoading } = useListLoonStaten();
  const jaren = Array.from(
    new Set([HUIDIG_JAAR, ...alleLoonstaten.map((loonstaat) => loonstaat.kalenderjaar)]),
  ).sort((a, b) => b - a);
  const loonstaten = alleLoonstaten.filter(
    (loonstaat) =>
      (filterJaar === "alle" || loonstaat.kalenderjaar === Number(filterJaar)) &&
      (filterIV === "alle" || loonstaat.inkomstenverhouding_id === Number(filterIV)),
  );

  const createMutation = useCreateLoonStaat({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListLoonStatenQueryKey() });
        toast({ title: "Loonstaat aangemaakt" });
        setToonFormulier(false);
        resetNieuw();
      },
      onError: () =>
        toast({ title: "Aanmaken mislukt", variant: "destructive" }),
    },
  });

  function submitNieuw() {
    if (!nieuw.inkomstenverhouding_id) {
      toast({
        title: "Kies een inkomstenverhouding.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({
      data: {
        inkomstenverhouding_id: Number(nieuw.inkomstenverhouding_id),
        kalenderjaar: Number(nieuw.kalenderjaar),
        tijdvak: nieuw.tijdvak as LoonStaatInputTijdvak,
      },
    });
  }

  return (
    <div className="space-y-4">
      {/* Filters + toevoegen-knop */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-3 flex-wrap">
          <Select value={filterJaar} onValueChange={setFilterJaar}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Jaar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle jaren</SelectItem>
              {jaren.map((j) => (
                <SelectItem key={j} value={String(j)}>{j}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterIV} onValueChange={setFilterIV}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Alle inkomstenverhoudingen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle inkomstenverhoudingen</SelectItem>
              {verhoudingen.map((iv) => (
                <SelectItem key={iv.id} value={String(iv.id)}>
                  {iv.medewerker_naam} — {iv.werkgever_naam}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button size="sm" onClick={() => setToonFormulier((v) => !v)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Loonstaat toevoegen
        </Button>
      </div>

      {/* Aanmaakformulier */}
      {toonFormulier && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Nieuwe loonstaat aanmaken</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1 sm:col-span-1">
                <Label>Inkomstenverhouding</Label>
                <Select
                  value={nieuw.inkomstenverhouding_id}
                  onValueChange={(v) =>
                    setNieuw((f) => ({ ...f, inkomstenverhouding_id: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kies" />
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

              <div className="space-y-1">
                <Label>Kalenderjaar</Label>
                <Input
                  type="number"
                  value={nieuw.kalenderjaar}
                  onChange={(event) =>
                    setNieuw((f) => ({ ...f, kalenderjaar: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>Tijdvak</Label>
                <Select
                  value={nieuw.tijdvak}
                  onValueChange={(v) => setNieuw((f) => ({ ...f, tijdvak: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maand">Maand</SelectItem>
                    <SelectItem value="vier_weken">Vier weken</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={submitNieuw}
                disabled={createMutation.isPending}
              >
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
      {!isLoading && loonstaten.length === 0 && (
        <div className="py-8 text-center text-muted-foreground text-sm">
          Geen loonstaten gevonden.
        </div>
      )}

      {loonstaten.map((ls) => (
        <Card key={ls.id}>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-sm">{ls.medewerker_naam}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {ls.werkgever_naam} · {ls.kalenderjaar} ·{" "}
                  {TIJDVAK_LABEL[ls.tijdvak] ?? ls.tijdvak}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {ls.status === "gesloten" ? (
                  <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px]">
                    Gesloten
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">Concept</Badge>
                )}
                <Badge variant="secondary" className="text-[10px]">
                  {ls.tijdvakregels.length} tijdvakregel
                  {ls.tijdvakregels.length !== 1 ? "s" : ""}
                </Badge>
              </div>
            </div>

            {ls.tijdvakregels.length > 0 && (
              <div className="mt-3">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-1 pr-3">Tijdvak#</th>
                      <th className="text-left py-1 pr-3">Periode</th>
                      <th className="text-left py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ls.tijdvakregels.map((tr) => (
                      <tr key={tr.id} className="border-b border-border/40">
                        <td className="py-1 pr-3">{tr.tijdvaknummer}</td>
                        <td className="py-1 pr-3">
                          {tr.periode_start} – {tr.periode_einde}
                        </td>
                        <td className="py-1">
                          {tr.rekenstatus === "berekend" ? (
                            <span className="text-green-700">Berekend</span>
                          ) : (
                            <span className="text-amber-600">
                              Niet berekend
                              {tr.reden ? ` — ${tr.reden}` : ""}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Wat-als-scenario's (SCENARIO_01) — doorrekenen op de jaarbegroting.
// Harde regels uit de opdracht:
//  - een scenario is een kopie; de echte begroting wordt nooit geraakt;
//  - capaciteitswijziging zonder bezettingsaanname bestaat niet (server dwingt af);
//  - de uitkomst staat altijd bij 4 bezettingsniveaus naast elkaar + omslagpunt;
//  - aannames zijn altijd zichtbaar, inclusief hun bron (ingevoerd/afgeleid/standaard);
//  - maximaal 3 scenario's naast de actieve begroting (eerste kolom).
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListFieBegrotingen,
  useListFieScenarios,
  getListFieScenariosQueryKey,
  useCreateFieScenario,
  useDeleteFieScenario,
  useGetFieDoorrekening,
  getGetFieDoorrekeningQueryKey,
  useListFieAkPosten,
  getListFieAkPostenQueryKey,
  useUpdateFieAkPost,
  type FieScenario,
  type FieScenarioDoorrekening,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { GitCompareArrows, Plus, Trash2, AlertTriangle, Target } from "lucide-react";

const euro = (n: number | null | undefined) =>
  n == null ? "—" : `€ ${Math.round(n).toLocaleString("nl-NL")}`;
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(1)}%`);

function bronBadge(bron: string) {
  if (bron === "ingevoerd") return <Badge variant="outline" className="text-[10px]">ingevoerd</Badge>;
  if (bron === "standaard") return <Badge variant="secondary" className="text-[10px]">standaard</Badge>;
  return <Badge variant="secondary" className="text-[10px] text-muted-foreground">uit begroting</Badge>;
}

// AK-posten van de scenario-kopie aan/uit zetten — dit raakt uitsluitend de
// kopie; de posten van de echte begroting blijven onaangeroerd.
function ScenarioAkPosten({ begrotingId }: { begrotingId: number }) {
  const queryClient = useQueryClient();
  const posten = useListFieAkPosten(begrotingId);
  const bijwerken = useUpdateFieAkPost({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListFieAkPostenQueryKey(begrotingId) });
        void queryClient.invalidateQueries({ queryKey: getGetFieDoorrekeningQueryKey(begrotingId) });
      },
    },
  });
  const lijst = posten.data ?? [];
  if (lijst.length === 0) return null;
  return (
    <div className="space-y-1 pt-1 border-t">
      <p className="text-xs font-medium text-muted-foreground">AK-posten in dit scenario (aan/uit)</p>
      {lijst.map((p) => (
        <label key={p.id} className="flex items-center justify-between gap-2 text-xs cursor-pointer">
          <span className={`flex items-center gap-1.5 ${p.actief ? "" : "line-through text-muted-foreground"}`}>
            <input
              type="checkbox"
              checked={p.actief}
              disabled={bijwerken.isPending}
              onChange={() => bijwerken.mutate({ id: p.id, data: { actief: !p.actief } })}
              data-testid={`schakel-akpost-${p.id}`}
            />
            {p.omschrijving}
          </span>
          <span>{euro(p.bedrag_jaarbasis)}</span>
        </label>
      ))}
    </div>
  );
}

function DoorrekeningKolom({ begrotingId, titel, isBasis, onVerwijder }: {
  begrotingId: number;
  titel: string;
  isBasis?: boolean;
  onVerwijder?: () => void;
}) {
  const { data, isLoading } = useGetFieDoorrekening(begrotingId);
  const d = data as FieScenarioDoorrekening | undefined;
  return (
    <Card className={isBasis ? "border-primary/40" : ""} data-testid={`kolom-doorrekening-${begrotingId}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{titel}</CardTitle>
            <CardDescription>
              {isBasis ? "Actieve begroting" : "Scenario"} · boekjaar {d?.boekjaar ?? "…"}
            </CardDescription>
          </div>
          {onVerwijder && (
            <Button variant="ghost" size="icon" onClick={onVerwijder} data-testid={`knop-verwijder-${begrotingId}`}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading && <p className="text-muted-foreground">Doorrekenen…</p>}
        {d && (
          <>
            {d.meldingen.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 space-y-1">
                {d.meldingen.map((m, i) => (
                  <p key={i} className="text-xs text-amber-800 flex gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{m}
                  </p>
                ))}
              </div>
            )}
            {d.niveaus.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-1 font-medium">Bezetting</th>
                    <th className="text-right font-medium">Productie</th>
                    <th className="text-right font-medium">AK%</th>
                    <th className="text-right font-medium">Resultaat</th>
                  </tr>
                </thead>
                <tbody>
                  {d.niveaus.map((n) => (
                    <tr key={n.bezetting_pct} className="border-b last:border-0">
                      <td className="py-1">{n.bezetting_pct}%</td>
                      <td className="text-right">{euro(n.productie)}</td>
                      <td className="text-right">{pct(n.ak_pct_productie)}</td>
                      <td className={`text-right font-medium ${n.bedrijfsresultaat < 0 ? "text-destructive" : ""}`}>
                        {euro(n.bedrijfsresultaat)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {d.omslagpunt_toelichting && (
              <p className="text-xs flex gap-1.5 rounded-md bg-muted p-2">
                <Target className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span data-testid={`omslagpunt-${begrotingId}`}>{d.omslagpunt_toelichting}</span>
              </p>
            )}
            <div className="space-y-1 pt-1 border-t">
              <p className="text-xs font-medium text-muted-foreground">Aannames</p>
              {d.aannames.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{a.label}</span>
                  <span className="flex items-center gap-1.5 text-right">{a.waarde} {bronBadge(a.bron)}</span>
                </div>
              ))}
            </div>
            {!isBasis && <ScenarioAkPosten begrotingId={begrotingId} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function ScenariosPagina() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const begrotingen = useListFieBegrotingen();
  const scenarios = useListFieScenarios();

  const actieve = useMemo(
    () => (begrotingen.data ?? []).find((b) => b.status === "actief") ?? null,
    [begrotingen.data],
  );
  const lijst = (scenarios.data ?? []) as FieScenario[];
  const getoond = lijst.slice(0, 3);

  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [naam, setNaam] = useState("");
  const [velden, setVelden] = useState<Record<string, string>>({});
  const zet = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setVelden((v) => ({ ...v, [k]: e.target.value }));
  const num = (k: string): number | null => {
    const s = (velden[k] ?? "").replace(",", ".").trim();
    if (!s) return null;
    const n = Number(s);
    return isFinite(n) ? n : null;
  };

  const aanmaken = useCreateFieScenario({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListFieScenariosQueryKey() });
        setDialoogOpen(false);
        setNaam("");
        setVelden({});
        toast({ title: "Scenario aangemaakt", description: "De echte begroting is niet gewijzigd." });
      },
      onError: (e: unknown) => {
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Scenario aanmaken mislukt";
        toast({ title: "Niet aangemaakt", description: msg, variant: "destructive" });
      },
    },
  });
  const verwijderen = useDeleteFieScenario({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListFieScenariosQueryKey() });
        toast({ title: "Scenario verwijderd" });
      },
    },
  });

  const opslaan = () => {
    if (!actieve) return;
    aanmaken.mutate({
      id: actieve.id,
      data: {
        naam,
        aannames: {
          aantal_monteurs: num("aantal_monteurs"),
          uren_per_monteur: num("uren_per_monteur"),
          bezettingsgraad_pct: num("bezettingsgraad_pct"),
          uurtarief: num("uurtarief"),
          loonkosten_per_monteur: num("loonkosten_per_monteur"),
          variabele_kosten_pct: num("variabele_kosten_pct"),
          toelichting: velden["toelichting"]?.trim() || null,
        },
      },
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 data-paginatitel className="text-2xl font-semibold flex items-center gap-2">
            <GitCompareArrows className="h-6 w-6" /> Wat-als-scenario's
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            Reken beslissingen door op een kopie van de jaarbegroting — de echte begroting
            en de prognose worden nooit geraakt. Elke uitkomst staat bij vier bezettingsniveaus,
            want extra capaciteit is alleen gunstig als de uren ook verkocht worden.
          </p>
        </div>
        <Button onClick={() => setDialoogOpen(true)} disabled={!actieve} data-testid="knop-nieuw-scenario">
          <Plus className="h-4 w-4 mr-1" /> Nieuw scenario
        </Button>
      </div>

      {!actieve && !begrotingen.isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Er is nog geen actieve jaarbegroting. Maak die eerst aan onder FIE Begroting —
            een scenario is altijd een kopie van de actieve begroting.
          </CardContent>
        </Card>
      )}

      {lijst.length > 3 && (
        <p className="text-xs text-muted-foreground">
          Er zijn {lijst.length} scenario's; de 3 nieuwste worden naast de begroting getoond.
          Verwijder een scenario om een ouder scenario te zien.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {actieve && (
          <DoorrekeningKolom begrotingId={actieve.id} titel={`Begroting ${actieve.boekjaar}`} isBasis />
        )}
        {getoond.map((s) => (
          <DoorrekeningKolom
            key={s.id}
            begrotingId={s.id}
            titel={s.scenario_naam ?? `Scenario ${s.id}`}
            onVerwijder={() => verwijderen.mutate({ id: s.id })}
          />
        ))}
      </div>

      <Dialog open={dialoogOpen} onOpenChange={setDialoogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nieuw scenario</DialogTitle>
            <DialogDescription>
              Kopie van begroting {actieve?.boekjaar}. Laat een veld leeg om de waarde uit de
              begroting te gebruiken; elke aanname blijft zichtbaar in de uitkomst.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="sc-naam">Naam *</Label>
              <Input id="sc-naam" value={naam} onChange={(e) => setNaam(e.target.value)}
                placeholder="Bijv. 6 monteurs mét kantoorfuncties" data-testid="invoer-naam" />
            </div>
            <div>
              <Label htmlFor="sc-monteurs">Aantal monteurs</Label>
              <Input id="sc-monteurs" inputMode="decimal" value={velden["aantal_monteurs"] ?? ""}
                onChange={zet("aantal_monteurs")} data-testid="invoer-monteurs" />
            </div>
            <div>
              <Label htmlFor="sc-bezetting">Bezettingsgraad % {num("aantal_monteurs") != null ? "*" : ""}</Label>
              <Input id="sc-bezetting" inputMode="decimal" value={velden["bezettingsgraad_pct"] ?? ""}
                onChange={zet("bezettingsgraad_pct")} data-testid="invoer-bezetting" />
            </div>
            <div>
              <Label htmlFor="sc-tarief">Uurtarief €</Label>
              <Input id="sc-tarief" inputMode="decimal" value={velden["uurtarief"] ?? ""}
                onChange={zet("uurtarief")} data-testid="invoer-uurtarief" />
            </div>
            <div>
              <Label htmlFor="sc-loon">Loonkosten per monteur €/jaar {num("aantal_monteurs") != null ? "*" : ""}</Label>
              <Input id="sc-loon" inputMode="decimal" value={velden["loonkosten_per_monteur"] ?? ""}
                onChange={zet("loonkosten_per_monteur")} data-testid="invoer-loonkosten" />
            </div>
            <div>
              <Label htmlFor="sc-uren">Uren per monteur (standaard 1820)</Label>
              <Input id="sc-uren" inputMode="decimal" value={velden["uren_per_monteur"] ?? ""}
                onChange={zet("uren_per_monteur")} />
            </div>
            <div>
              <Label htmlFor="sc-var">Variabele kosten % van productie</Label>
              <Input id="sc-var" inputMode="decimal" value={velden["variabele_kosten_pct"] ?? ""}
                onChange={zet("variabele_kosten_pct")} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="sc-toelichting">Toelichting</Label>
              <Textarea id="sc-toelichting" rows={2} value={velden["toelichting"] ?? ""}
                onChange={zet("toelichting")} />
            </div>
          </div>
          {num("aantal_monteurs") != null && (num("bezettingsgraad_pct") == null || num("loonkosten_per_monteur") == null) && (
            <p className="text-xs text-amber-700 flex gap-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Bij een wijziging van het aantal monteurs zijn bezettingsgraad én loonkosten per
              monteur verplicht — anders lijkt extra capaciteit altijd gunstig en is er geen omslagpunt.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialoogOpen(false)}>Annuleren</Button>
            <Button onClick={opslaan} disabled={!naam.trim() || aanmaken.isPending} data-testid="knop-opslaan-scenario">
              {aanmaken.isPending ? "Bezig…" : "Scenario aanmaken"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

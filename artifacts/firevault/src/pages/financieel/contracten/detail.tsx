import { useState } from "react";
import {
  useGetFinancieelContract,
  useListFinancieelContractKosten,
  useUpsertFinancieelContractKosten,
  useAnalyseerFinancieelContract,
  useGetFinancieelContractCoach,
  getGetFinancieelContractQueryKey,
  getListFinancieelContractKostenQueryKey,
  getGetFinancieelContractCoachQueryKey,
} from "@workspace/api-client-react";
import type { FinancieelPolisAnalyse } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sparkles, Lightbulb, ShieldCheck, AlertTriangle, Info } from "lucide-react";

const eur = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Onderdeel({ label, waarde, bron, zekerheid }: { label: string; waarde: string; bron: string | null; zekerheid: number }) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Badge variant="outline" className="text-[10px]">zekerheid {pct(zekerheid)}</Badge>
      </div>
      <p className="text-sm mt-1">{waarde}</p>
      {bron && <p className="text-[11px] text-muted-foreground/80 mt-1 italic">Bron: “{bron}”</p>}
    </div>
  );
}

function PolisWeergave({ analyse }: { analyse: FinancieelPolisAnalyse }) {
  const eigenRisico = (analyse as { eigenRisico?: { waarde: string; bron: string | null; zekerheid: number } | null }).eigenRisico;
  const looptijd = (analyse as { looptijd?: { waarde: string; bron: string | null; zekerheid: number } | null }).looptijd;
  const premie = (analyse as { premie?: { waarde: string; bron: string | null; zekerheid: number } | null }).premie;
  return (
    <div className="space-y-3">
      {analyse.samenvatting && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs font-medium text-amber-700 flex items-center gap-1.5 mb-1"><Sparkles className="w-3.5 h-3.5" /> AI-samenvatting</p>
          <p className="text-sm">{analyse.samenvatting}</p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {eigenRisico && <Onderdeel label="Eigen risico" waarde={eigenRisico.waarde} bron={eigenRisico.bron} zekerheid={eigenRisico.zekerheid} />}
        {looptijd && <Onderdeel label="Looptijd" waarde={looptijd.waarde} bron={looptijd.bron} zekerheid={looptijd.zekerheid} />}
        {premie && <Onderdeel label="Premie" waarde={premie.waarde} bron={premie.bron} zekerheid={premie.zekerheid} />}
      </div>
      {analyse.dekking.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Dekking</p>
          <div className="space-y-1.5">
            {analyse.dekking.map((d, i) => <Onderdeel key={i} label="Gedekt" waarde={d.waarde} bron={d.bron ?? null} zekerheid={d.zekerheid} />)}
          </div>
        </div>
      )}
      {analyse.uitsluitingen.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Uitsluitingen</p>
          <div className="space-y-1.5">
            {analyse.uitsluitingen.map((d, i) => <Onderdeel key={i} label="Uitgesloten" waarde={d.waarde} bron={d.bron ?? null} zekerheid={d.zekerheid} />)}
          </div>
        </div>
      )}
      {analyse.clausules.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1.5">Bijzondere clausules</p>
          <div className="space-y-1.5">
            {analyse.clausules.map((d, i) => <Onderdeel key={i} label="Clausule" waarde={d.waarde} bron={d.bron ?? null} zekerheid={d.zekerheid} />)}
          </div>
        </div>
      )}
      {analyse.waarschuwing && (
        <p className="text-xs text-amber-700 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> {analyse.waarschuwing}</p>
      )}
    </div>
  );
}

export function ContractDetailDialog({ contractId, onClose, onGewijzigd }: { contractId: number; onClose: () => void; onGewijzigd: () => void }) {
  const queryClient = useQueryClient();
  const { data: contract, isLoading } = useGetFinancieelContract(contractId);
  const { data: kosten } = useListFinancieelContractKosten(contractId);
  const [jaar, setJaar] = useState<string>(String(new Date().getFullYear()));
  const [bedrag, setBedrag] = useState<string>("");
  const [analyse, setAnalyse] = useState<FinancieelPolisAnalyse | null>(null);

  const kostenInvalidatie = () => {
    queryClient.invalidateQueries({ queryKey: getListFinancieelContractKostenQueryKey(contractId) });
    queryClient.invalidateQueries({ queryKey: getGetFinancieelContractQueryKey(contractId) });
  };
  const kostenToevoegen = useUpsertFinancieelContractKosten({ mutation: { onSuccess: kostenInvalidatie } });
  const analyseren = useAnalyseerFinancieelContract({
    mutation: {
      onSuccess: (data) => {
        setAnalyse(data);
        queryClient.invalidateQueries({ queryKey: getGetFinancieelContractQueryKey(contractId) });
        onGewijzigd();
      },
    },
  });
  const { data: coach, isLoading: coachLaadt, refetch: coachRefetch, isFetching: coachFetching } = useGetFinancieelContractCoach(
    contractId,
    { query: { enabled: false, queryKey: getGetFinancieelContractCoachQueryKey(contractId) } },
  );

  const bestaandeAnalyse = analyse ?? (contract?.ai_analyse as FinancieelPolisAnalyse | null | undefined) ?? null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isLoading ? "Contract" : contract?.naam}</DialogTitle>
          <DialogDescription>
            {contract ? `${contract.categorie}${contract.leverancier ? ` · ${contract.leverancier}` : ""}` : "Details laden"}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !contract ? (
          <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : (
          <Tabs defaultValue="overzicht">
            <TabsList>
              <TabsTrigger value="overzicht">Overzicht</TabsTrigger>
              <TabsTrigger value="kosten">Kostenhistorie</TabsTrigger>
              <TabsTrigger value="polis">Polisanalyse</TabsTrigger>
              <TabsTrigger value="coach">Contractcoach</TabsTrigger>
            </TabsList>

            <TabsContent value="overzicht" className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Info2 label="Kosten" waarde={`${eur(contract.kosten_bedrag)} ${contract.kosten_periode}`} />
                <Info2 label="Status" waarde={contract.status} />
                <Info2 label="Ingangsdatum" waarde={contract.ingangsdatum ?? "—"} />
                <Info2 label="Einddatum" waarde={contract.einddatum ?? "Doorlopend"} />
                <Info2 label="Opzegtermijn" waarde={contract.opzegtermijn_maanden != null ? `${contract.opzegtermijn_maanden} mnd` : "—"} />
                <Info2 label="Indexering" waarde={contract.indexering_percentage != null ? `${contract.indexering_percentage}%` : "—"} />
                <Info2 label="Automatische verlenging" waarde={contract.automatische_verlenging ? "Ja" : "Nee"} />
                <Info2 label="Contractnummer" waarde={contract.contractnummer ?? "—"} />
                {contract.aantal_licenties != null && <Info2 label="Licenties" waarde={`${contract.aantal_in_gebruik ?? "?"} / ${contract.aantal_licenties} in gebruik`} />}
                {contract.document_naam && <Info2 label="Gekoppeld document" waarde={contract.document_naam} />}
              </div>
              {contract.notities && <div className="rounded-md border p-2.5 text-sm"><span className="text-xs text-muted-foreground">Notities</span><p className="mt-0.5">{contract.notities}</p></div>}
            </TabsContent>

            <TabsContent value="kosten" className="space-y-3 pt-2">
              <div className="flex items-end gap-2">
                <div><Label className="text-xs">Jaar</Label><Input type="number" value={jaar} onChange={(e) => setJaar(e.target.value)} className="w-28" /></div>
                <div><Label className="text-xs">Bedrag (€)</Label><Input type="number" value={bedrag} onChange={(e) => setBedrag(e.target.value)} className="w-40" /></div>
                <Button
                  size="sm"
                  disabled={!jaar || !bedrag || kostenToevoegen.isPending}
                  onClick={async () => {
                    await kostenToevoegen.mutateAsync({ id: contractId, data: { jaar: Number(jaar), bedrag: Number(bedrag) } });
                    setBedrag("");
                  }}
                >
                  Opslaan
                </Button>
              </div>
              {(kosten ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen kostensnapshots. Voeg jaarbedragen toe voor de kostenvergelijking.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Jaar</TableHead><TableHead className="text-right">Bedrag</TableHead><TableHead>Bron</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(kosten ?? []).map((k) => (
                      <TableRow key={k.id}><TableCell>{k.jaar}</TableCell><TableCell className="text-right tabular-nums">{eur(k.bedrag)}</TableCell><TableCell className="text-muted-foreground">{k.bron ?? "—"}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="polis" className="space-y-3 pt-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  AI leest het gekoppelde document en haalt dekking, uitsluitingen, eigen risico, looptijd, premie en clausules eruit — telkens met bron.
                </p>
                <Button size="sm" disabled={analyseren.isPending} onClick={() => analyseren.mutate({ id: contractId, data: {} })}>
                  <Sparkles className="w-4 h-4 mr-1" /> {analyseren.isPending ? "Analyseren…" : "AI-analyse"}
                </Button>
              </div>
              {bestaandeAnalyse ? (
                <PolisWeergave analyse={bestaandeAnalyse} />
              ) : (
                <p className="text-sm text-muted-foreground">Nog geen polisanalyse. Koppel een document aan het contract en start de AI-analyse.</p>
              )}
            </TabsContent>

            <TabsContent value="coach" className="space-y-3 pt-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Praktisch AI-advies over dit contract. AI adviseert, u beslist — er wordt niets opgezegd of gewijzigd.</p>
                <Button size="sm" variant="outline" disabled={coachFetching} onClick={() => coachRefetch()}>
                  <Lightbulb className="w-4 h-4 mr-1" /> {coachFetching ? "Advies ophalen…" : "Vraag advies"}
                </Button>
              </div>
              {coachLaadt || coachFetching ? (
                <Skeleton className="h-24 w-full" />
              ) : coach ? (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-amber-500" /> Advies</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p>{coach.advies}</p>
                    {coach.risicos.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mt-1">Aandachtspunten</p>
                        <ul className="list-disc pl-5 text-sm text-muted-foreground">{coach.risicos.map((r, i) => <li key={i}>{r}</li>)}</ul>
                      </div>
                    )}
                    {coach.besteOpzegmoment && <p><span className="text-xs font-semibold">Beste opzegmoment: </span>{coach.besteOpzegmoment}</p>}
                    {coach.financieleGevolgen && <p><span className="text-xs font-semibold">Financiële gevolgen: </span>{coach.financieleGevolgen}</p>}
                    <p className="text-[11px] text-muted-foreground/80 italic border-t pt-1.5">Basis: {coach.bron}</p>
                    {coach.waarschuwing && <p className="text-xs text-amber-700">{coach.waarschuwing}</p>}
                  </CardContent>
                </Card>
              ) : (
                <p className="text-sm text-muted-foreground">Klik op “Vraag advies” voor een AI-beoordeling van dit contract.</p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info2({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div className="rounded-md border p-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium mt-0.5 capitalize">{waarde}</p>
    </div>
  );
}

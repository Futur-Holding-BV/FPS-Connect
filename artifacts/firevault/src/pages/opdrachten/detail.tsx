// Opdracht detail — werkbegroting, nacalculatie, planning-uren, inkoopplanning, uitvoeringsplanning
import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetOpdracht,
  useGetWerkbegroting,
  useVaststellenWerkbegroting,
  useAiAnalyseWerkbegroting,
  useGetNacalculatie,
  useListOpdrachtPlanningUren,
  usePatchWerkbegrotingRegel,
  getGetWerkbegrotingQueryKey,
  getGetOpdrachtQueryKey,
  getGetNacalculatieQueryKey,
} from "@workspace/api-client-react";
import type { Werkbegroting } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Sparkles, Check, Clock, AlertTriangle, CalendarCheck,
  TrendingUp, TrendingDown, Edit2, Package, ShoppingCart, Building2, ShoppingBag,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import InkoopplanningTab from "./inkoopplanning-tab";
import UitvoeringsplanningTab from "./uitvoeringsplanning-tab";
import OnderaannemeringTab from "./onderaanneming-tab";
import MateriaaltabTab from "./materiaal-tab";

function euro(n: number | null | undefined) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n ?? 0);
}

function uren(n: number | null | undefined) {
  const v = n ?? 0;
  return `${v.toFixed(1)} u`;
}

const OPDRACHT_STATUS: Record<string, { label: string; kleur: string }> = {
  actief: { label: "Actief", kleur: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  gepauzeerd: { label: "Gepauzeerd", kleur: "bg-amber-100 text-amber-800 border-amber-200" },
  afgerond: { label: "Afgerond", kleur: "bg-slate-100 text-slate-700 border-slate-200" },
  geannuleerd: { label: "Geannuleerd", kleur: "bg-rose-100 text-rose-800 border-rose-200" },
};

const BEGROTING_STATUS: Record<string, { label: string; kleur: string }> = {
  concept: { label: "Concept", kleur: "bg-amber-100 text-amber-800 border-amber-200" },
  vastgesteld: { label: "Vastgesteld", kleur: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};

function groepeerOpHoofdstuk(werkbegroting: Werkbegroting) {
  const groepen: Record<string, typeof werkbegroting.regels> = {};
  for (const r of werkbegroting.regels ?? []) {
    const h = r.hoofdstuk ?? "Overige werkzaamheden";
    if (!groepen[h]) groepen[h] = [];
    groepen[h].push(r);
  }
  return groepen;
}

// ── Bewerkbare werkbegroting-regel ────────────────────────────────────────────
interface WerkbegrotingRegelRijProps {
  r: NonNullable<Werkbegroting["regels"]>[number];
  opdrachtId: number;
  isVastgesteld: boolean;
}

function WerkbegrotingRegelRij({ r, opdrachtId, isVastgesteld }: WerkbegrotingRegelRijProps) {
  const [bewerkModus, setBewerkModus] = useState(false);
  const [hoeveelheid, setHoeveelheid] = useState(r.hoeveelheid != null ? String(r.hoeveelheid) : "");
  const [tarief, setTarief] = useState(r.tarief != null ? String(r.tarief) : "");
  const [omschrijving, setOmschrijving] = useState(r.omschrijving ?? "");
  const { toast } = useToast();
  const qc = useQueryClient();

  const patchMutatie = usePatchWerkbegrotingRegel({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetWerkbegrotingQueryKey(opdrachtId) });
        setBewerkModus(false);
        toast({ title: "Regel bijgewerkt" });
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    },
  });

  function bewaar() {
    patchMutatie.mutate({
      id: opdrachtId,
      regelId: r.id,
      data: {
        omschrijving: omschrijving || undefined,
        hoeveelheid: hoeveelheid ? parseFloat(hoeveelheid) : undefined,
        tarief: tarief ? parseFloat(tarief) : undefined,
      },
    });
  }

  if (bewerkModus) {
    return (
      <tr className="border-b border-dashed bg-muted/20">
        <td className="py-1.5 pr-2">
          <Input
            value={omschrijving}
            onChange={e => setOmschrijving(e.target.value)}
            className="h-7 text-sm"
          />
        </td>
        <td className="text-right py-1.5">
          <Input
            type="number"
            value={hoeveelheid}
            onChange={e => setHoeveelheid(e.target.value)}
            className="h-7 text-sm text-right w-20 ml-auto"
            step="0.01"
          />
        </td>
        <td className="text-right py-1.5 text-muted-foreground">{r.eenheid}</td>
        <td className="text-right py-1.5">
          <Input
            type="number"
            value={tarief}
            onChange={e => setTarief(e.target.value)}
            className="h-7 text-sm text-right w-24 ml-auto"
            step="0.01"
          />
        </td>
        <td className="text-right py-1.5 tabular-nums font-medium">
          {euro((parseFloat(hoeveelheid) || 0) * (parseFloat(tarief) || 0))}
        </td>
        <td className="text-right py-1.5">
          <div className="flex gap-1 justify-end">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setBewerkModus(false)}>
              Annuleren
            </Button>
            <Button size="sm" className="h-6 px-2 text-xs" onClick={bewaar} disabled={patchMutatie.isPending}>
              {patchMutatie.isPending ? "..." : "Opslaan"}
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-dashed last:border-0 group">
      <td className="py-1.5 pr-2">
        {r.omschrijving}
        {r.categorie === "arbeid" && (
          <Badge variant="outline" className="ml-2 text-xs py-0 bg-blue-50 text-blue-700 border-blue-200">arbeid</Badge>
        )}
      </td>
      <td className="text-right py-1.5 tabular-nums">{r.hoeveelheid?.toFixed(2)}</td>
      <td className="text-right py-1.5 text-muted-foreground">{r.eenheid}</td>
      <td className="text-right py-1.5 tabular-nums">{euro(r.tarief)}</td>
      <td className="text-right py-1.5 tabular-nums font-medium">{euro(r.totaal)}</td>
      <td className="text-right py-1.5 w-8">
        {!isVastgesteld && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setBewerkModus(true)}
          >
            <Edit2 className="h-3 w-3 text-muted-foreground" />
          </Button>
        )}
      </td>
    </tr>
  );
}

// ── Hoofdpagina ────────────────────────────────────────────────────────────────
export default function OpdrachtDetailPagina() {
  const { id } = useParams<{ id: string }>();
  const opdrachtId = parseInt(id ?? "0", 10);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [vaststellenDialoog, setVaststellenDialoog] = useState(false);
  const [activeTab, setActiveTab] = useState("werkbegroting");

  const { data: opdracht, isLoading: opdrachtLoading } = useGetOpdracht(opdrachtId);
  const { data: werkbegroting, isLoading: wbLoading } = useGetWerkbegroting(opdrachtId);
  const { data: nacalculatie } = useGetNacalculatie(opdrachtId);
  const { data: planningUren } = useListOpdrachtPlanningUren(opdrachtId);

  const vaststellenMutatie = useVaststellenWerkbegroting({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetWerkbegrotingQueryKey(opdrachtId) });
        qc.invalidateQueries({ queryKey: getGetOpdrachtQueryKey(opdrachtId) });
        toast({ title: "Werkbegroting vastgesteld" });
        setVaststellenDialoog(false);
      },
      onError: () => toast({ title: "Vaststellen mislukt", variant: "destructive" }),
    },
  });

  const aiAnalyseMutatie = useAiAnalyseWerkbegroting({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetWerkbegrotingQueryKey(opdrachtId) });
        qc.invalidateQueries({ queryKey: getGetNacalculatieQueryKey(opdrachtId) });
        toast({ title: "AI-analyse gereed" });
      },
      onError: () => toast({ title: "AI-analyse mislukt", variant: "destructive" }),
    },
  });

  if (opdrachtLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!opdracht) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-muted-foreground">Opdracht niet gevonden.</p>
        <Link href="/offertes"><Button variant="outline" className="mt-4"><ArrowLeft className="h-4 w-4" /> Terug</Button></Link>
      </div>
    );
  }

  const opStatus = OPDRACHT_STATUS[opdracht.status] ?? { label: opdracht.status, kleur: "" };
  const wbStatus = werkbegroting ? (BEGROTING_STATUS[werkbegroting.status] ?? { label: werkbegroting.status, kleur: "" }) : null;
  const isVastgesteld = werkbegroting?.status === "vastgesteld";
  const groepen = werkbegroting ? groepeerOpHoofdstuk(werkbegroting) : {};
  const aiAnalyse = werkbegroting?.ai_analyse as Record<string, unknown> | null | undefined;

  const arbeidRegels = werkbegroting?.regels?.filter(r => r.categorie === "arbeid") ?? [];
  const materiaalRegels = werkbegroting?.regels?.filter(r => r.categorie === "materiaal") ?? [];
  const totaalArbeid = arbeidRegels.reduce((a, r) => a + (r.totaal ?? 0), 0);
  const totaalMateriaal = materiaalRegels.reduce((a, r) => a + (r.totaal ?? 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href={opdracht.offerte_id ? `/offertes/${opdracht.offerte_id}` : "/offertes"}>
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight">{opdracht.titel}</h1>
            <Badge variant="outline" className={opStatus.kleur}>{opStatus.label}</Badge>
            {wbStatus && (
              <Badge variant="outline" className={wbStatus.kleur}>Begroting: {wbStatus.label}</Badge>
            )}
          </div>
          {opdracht.werknummer && <p className="text-xs text-muted-foreground mt-0.5">{opdracht.werknummer}</p>}
        </div>
      </div>

      {/* Overzichtkaart */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Arbeid begroot</p>
            <p className="text-xl font-semibold">{uren(werkbegroting?.totaal_arbeid_uren)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Materiaal begroot</p>
            <p className="text-xl font-semibold">{euro(werkbegroting?.totaal_materiaal_bedrag)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Gepland</p>
            <p className="text-xl font-semibold">{uren(nacalculatie?.planning_uren)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Verbruikt</p>
            <p className="text-xl font-semibold">{uren(nacalculatie?.verbruikte_uren)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="werkbegroting">Werkbegroting</TabsTrigger>
          <TabsTrigger value="inkoopplanning">
            <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
            Inkoopplanning
          </TabsTrigger>
          <TabsTrigger value="onderaanneming">
            <Building2 className="h-3.5 w-3.5 mr-1.5" />
            Onderaanneming
          </TabsTrigger>
          <TabsTrigger value="uitvoeringsplanning">
            <CalendarCheck className="h-3.5 w-3.5 mr-1.5" />
            Uitvoeringsplanning
          </TabsTrigger>
          <TabsTrigger value="materiaal">
            <Package className="h-3.5 w-3.5 mr-1.5" />
            Materiaal
          </TabsTrigger>
          <TabsTrigger value="nacalculatie">Nacalculatie</TabsTrigger>
          <TabsTrigger value="planning">Planning-uren</TabsTrigger>
          {aiAnalyse && <TabsTrigger value="ai">AI-analyse</TabsTrigger>}
        </TabsList>

        {/* ── Werkbegroting ── */}
        <TabsContent value="werkbegroting" className="space-y-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-2 text-sm text-muted-foreground">
              <span>Arbeid: <strong>{euro(totaalArbeid)}</strong></span>
              <span>|</span>
              <span>Materiaal: <strong>{euro(totaalMateriaal)}</strong></span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm" variant="outline"
                onClick={() => setActiveTab("inkoopplanning")}
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                Materialen bestellen
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => setActiveTab("onderaanneming")}
              >
                <Building2 className="h-3.5 w-3.5" />
                Onderaannemer
              </Button>
              <Button
                size="sm" variant="outline"
                disabled={aiAnalyseMutatie.isPending}
                onClick={() => aiAnalyseMutatie.mutate({ id: opdrachtId })}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {aiAnalyseMutatie.isPending ? "Analyseren..." : "AI-analyse"}
              </Button>
              {!isVastgesteld && (
                <Button size="sm" onClick={() => setVaststellenDialoog(true)}>
                  <Check className="h-3.5 w-3.5" /> Vaststellen
                </Button>
              )}
              {isVastgesteld && (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1">
                  <Check className="h-3 w-3 mr-1" /> Vastgesteld
                </Badge>
              )}
            </div>
          </div>

          {!isVastgesteld && (
            <p className="text-xs text-muted-foreground">
              Regels zijn bewerkbaar tot het moment van vaststelling. Klik op het potlood-icoon om een regel te bewerken.
            </p>
          )}

          {wbLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : Object.keys(groepen).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Geen werkbegroting regels. Kies een calculatie bij het aanmaken van de opdracht.
              </CardContent>
            </Card>
          ) : (
            Object.entries(groepen).map(([hoofdstuk, regels]) => {
              const totaalHoofdstuk = regels.reduce((a, r) => a + (r.totaal ?? 0), 0);
              return (
                <Card key={hoofdstuk}>
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">{hoofdstuk}</CardTitle>
                      <span className="text-sm text-muted-foreground">{euro(totaalHoofdstuk)}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b">
                          <th className="text-left pb-1 font-normal">Omschrijving</th>
                          <th className="text-right pb-1 font-normal">Hoev.</th>
                          <th className="text-right pb-1 font-normal">Eenheid</th>
                          <th className="text-right pb-1 font-normal">Tarief</th>
                          <th className="text-right pb-1 font-normal">Totaal</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {regels.map((r) => (
                          <WerkbegrotingRegelRij
                            key={r.id}
                            r={r}
                            opdrachtId={opdrachtId}
                            isVastgesteld={isVastgesteld}
                          />
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ── Inkoopplanning ── */}
        <TabsContent value="inkoopplanning">
          <InkoopplanningTab opdrachtId={opdrachtId} />
        </TabsContent>

        {/* ── Onderaanneming ── */}
        <TabsContent value="onderaanneming">
          <OnderaannemeringTab
            opdrachtId={opdrachtId}
            onNaarMaterialen={() => setActiveTab("inkoopplanning")}
          />
        </TabsContent>

        {/* ── Uitvoeringsplanning ── */}
        <TabsContent value="uitvoeringsplanning">
          <UitvoeringsplanningTab opdrachtId={opdrachtId} />
        </TabsContent>

        {/* ── Materiaal ── */}
        <TabsContent value="materiaal">
          <MateriaaltabTab opdrachtId={opdrachtId} />
        </TabsContent>

        {/* ── Nacalculatie ── */}
        <TabsContent value="nacalculatie" className="mt-4">
          {!nacalculatie ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Nog geen nacalculatiegegevens beschikbaar.</CardContent></Card>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">Calculatie uren</p>
                    <p className="text-xl font-semibold">{uren(nacalculatie.calculatie_arbeid_uren)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">Begroting uren</p>
                    <p className="text-xl font-semibold">{uren(nacalculatie.begroting_arbeid_uren)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">Verschil (begr. - verbr.)</p>
                    <p className={`text-xl font-semibold ${(nacalculatie.verschil ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {(nacalculatie.verschil ?? 0) >= 0 ? <TrendingUp className="inline h-4 w-4 mr-1" /> : <TrendingDown className="inline h-4 w-4 mr-1" />}
                      {uren(nacalculatie.verschil)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {nacalculatie.regels && nacalculatie.regels.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm">Per categorie</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b">
                          <th className="text-left pb-1 font-normal">Categorie</th>
                          <th className="text-right pb-1 font-normal">Calc. uren</th>
                          <th className="text-right pb-1 font-normal">Begr. uren</th>
                          <th className="text-right pb-1 font-normal">Verbr. uren</th>
                          <th className="text-right pb-1 font-normal">Verschil</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nacalculatie.regels.map((r, i) => (
                          <tr key={i} className="border-b border-dashed last:border-0">
                            <td className="py-1.5 capitalize">{r.categorie}</td>
                            <td className="text-right py-1.5 tabular-nums">{uren(r.calculatie_uren)}</td>
                            <td className="text-right py-1.5 tabular-nums">{uren(r.begroting_uren)}</td>
                            <td className="text-right py-1.5 tabular-nums">{uren(r.verbruikte_uren)}</td>
                            <td className={`text-right py-1.5 tabular-nums font-medium ${(r.verschil_begroting_vs_verbruikt ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                              {uren(r.verschil_begroting_vs_verbruikt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Planning-uren ── */}
        <TabsContent value="planning" className="mt-4">
          {!planningUren || planningUren.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CalendarCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>Nog geen planning-items gekoppeld aan deze opdracht.</p>
                <p className="text-sm mt-1">Voeg planning-items toe via de Planning-module en koppel ze aan deze opdracht.</p>
                <Link href="/modules/planning">
                  <Button variant="outline" size="sm" className="mt-4">
                    <CalendarCheck className="h-3.5 w-3.5" /> Naar planning
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Ingeplande uren per persoon</CardTitle>
                  <Badge variant="outline">
                    {uren(planningUren.reduce((a, p) => a + (p.uren ?? 0), 0))} totaal
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left pb-1 font-normal">Medewerker</th>
                      <th className="text-left pb-1 font-normal">Datum</th>
                      <th className="text-right pb-1 font-normal">Uren</th>
                      <th className="text-right pb-1 font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planningUren.map((p, i) => (
                      <tr key={i} className="border-b border-dashed last:border-0">
                        <td className="py-1.5 pr-2">{p.medewerker_naam ?? "Onbekend"}</td>
                        <td className="py-1.5 text-muted-foreground">{p.datum ? new Date(p.datum).toLocaleDateString("nl-NL") : "—"}</td>
                        <td className="text-right py-1.5 tabular-nums">{uren(p.uren)}</td>
                        <td className="text-right py-1.5">
                          <Badge variant="outline" className="text-xs">{p.status ?? "—"}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── AI-analyse ── */}
        {aiAnalyse && (
          <TabsContent value="ai" className="mt-4 space-y-4">
            {(aiAnalyse.samenvatting as string) && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500" /> Samenvatting</CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <p className="text-sm">{aiAnalyse.samenvatting as string}</p>
                </CardContent>
              </Card>
            )}

            {Array.isArray(aiAnalyse.inkoop_voorstellen) && (aiAnalyse.inkoop_voorstellen as unknown[]).length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm">Inkoop-voorstellen</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 space-y-3">
                  {(aiAnalyse.inkoop_voorstellen as Array<{ post: string; voorstel: string; besparing: number }>).map((v, i) => (
                    <div key={i} className="border rounded-md p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{v.post}</p>
                        {v.besparing > 0 && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">-{euro(v.besparing)}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{v.voorstel}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {Array.isArray(aiAnalyse.arbeid_voorstellen) && (aiAnalyse.arbeid_voorstellen as unknown[]).length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm">Arbeid-voorstellen</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 space-y-3">
                  {(aiAnalyse.arbeid_voorstellen as Array<{ post: string; voorstel: string; besparing_uur: number }>).map((v, i) => (
                    <div key={i} className="border rounded-md p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{v.post}</p>
                        {v.besparing_uur > 0 && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">-{uren(v.besparing_uur)}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{v.voorstel}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {Array.isArray(aiAnalyse.risicos) && (aiAnalyse.risicos as unknown[]).length > 0 && (
              <Card className="border-amber-200">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Aandachtspunten
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <ul className="space-y-1">
                    {(aiAnalyse.risicos as string[]).map((r, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex gap-2">
                        <span className="text-amber-500 shrink-0">•</span>{r}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {typeof aiAnalyse.gegenereerd_op === "string" && (
              <p className="text-xs text-muted-foreground text-right">
                Analyse gegenereerd op {new Date(aiAnalyse.gegenereerd_op).toLocaleString("nl-NL")}
              </p>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Vaststellen bevestigingsdialoog */}
      <AlertDialog open={vaststellenDialoog} onOpenChange={setVaststellenDialoog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Werkbegroting vaststellen</AlertDialogTitle>
            <AlertDialogDescription>
              Na vaststelling dient de werkbegroting als basis voor planning en nacalculatie.
              De begroting kan daarna niet meer worden gewijzigd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => vaststellenMutatie.mutate({ id: opdrachtId })}
              disabled={vaststellenMutatie.isPending}
            >
              {vaststellenMutatie.isPending ? "Bezig..." : "Vaststellen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

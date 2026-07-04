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
  useAiChatWerkbegroting,
  useAiSeniorAnalyseWerkbegroting,
  useListWbAdviezen,
  useUpdateWbAdvies,
  getListWbAdviezenQueryKey,
  useGetPim,
  useAnalyseerPim,
  useBevestigPimAdvies,
  useMaakPimAdviesRapport,
  getGetPimQueryKey,
} from "@workspace/api-client-react";
import type { Werkbegroting, OpdrachtNacalculatie } from "@workspace/api-client-react";
import AiChatPanel from "@/components/ai-chat-panel";
import AiSeniorWerkvoorbereiderPanel from "@/components/ai-senior-werkvoorbereider-panel";
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
  TrendingUp, TrendingDown, Edit2, Package, ShoppingCart, Building2, ShoppingBag, MessageSquare, CheckCircle2, HardHat, Printer, Brain, FileCheck2, ShieldAlert,
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

// ── AI-projectcontroller signalen ─────────────────────────────────────────────

type SignaalStatus = "groen" | "oranje" | "rood";

const SIGNAAL_KLEUR: Record<SignaalStatus, string> = {
  groen: "bg-emerald-50 text-emerald-800 border-emerald-200",
  oranje: "bg-amber-50 text-amber-800 border-amber-200",
  rood: "bg-rose-50 text-rose-800 border-rose-200",
};

function berekenSignalen(
  nacalc: OpdrachtNacalculatie | null | undefined
): { label: string; status: SignaalStatus; waarde: string; toelichting: string }[] | null {
  if (!nacalc || !nacalc.begroting_arbeid_uren || nacalc.begroting_arbeid_uren <= 0) return null;

  const begroot = nacalc.begroting_arbeid_uren;
  const verbruikt = nacalc.verbruikte_uren ?? 0;
  const gepland = nacalc.planning_uren ?? 0;

  const urenPct = verbruikt / begroot;
  const urenStatus: SignaalStatus = urenPct > 1 ? "rood" : urenPct > 0.75 ? "oranje" : "groen";

  const prognose = verbruikt + gepland;
  const prognPct = prognose / begroot;
  const prognStatus: SignaalStatus = prognPct > 1.15 ? "rood" : prognPct > 1 ? "oranje" : "groen";

  const restant = Math.max(0, begroot - verbruikt);
  let dekkingStatus: SignaalStatus;
  let dekkingWaarde: string;
  let dekkingToelichting: string;
  if (restant <= 0) {
    dekkingStatus = "groen";
    dekkingWaarde = "Gereed";
    dekkingToelichting = "Alle begrote uren zijn verbruikt";
  } else {
    const pct = gepland / restant;
    dekkingStatus = pct >= 1 ? "groen" : pct >= 0.5 ? "oranje" : "rood";
    dekkingWaarde = `${Math.round(pct * 100)}% gedekt`;
    dekkingToelichting = `${uren(gepland)} gepland, ${uren(restant)} resteert`;
  }

  return [
    {
      label: "Urenstatus",
      status: urenStatus,
      waarde: `${Math.round(urenPct * 100)}%`,
      toelichting: `${uren(verbruikt)} van ${uren(begroot)} begroot verbruikt`,
    },
    {
      label: "Eindprognose",
      status: prognStatus,
      waarde: uren(prognose),
      toelichting: prognPct > 1
        ? `+${uren(prognose - begroot)} boven begroting`
        : `${uren(begroot - prognose)} restcapaciteit`,
    },
    {
      label: "Planningdekking",
      status: dekkingStatus,
      waarde: dekkingWaarde,
      toelichting: dekkingToelichting,
    },
  ];
}

function ProjectControllerSignalen({ nacalculatie }: { nacalculatie: OpdrachtNacalculatie | null | undefined }) {
  const signalen = berekenSignalen(nacalculatie);
  if (!signalen) return null;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">AI-projectcontroller</CardTitle>
          <span className="text-xs text-muted-foreground ml-auto">Bewaakt, blokkeert niets</span>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {signalen.map((s) => (
            <div
              key={s.label}
              className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${SIGNAAL_KLEUR[s.status]}`}
            >
              <div className="mt-0.5 shrink-0">
                {s.status === "groen"
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  : <AlertTriangle className={`h-4 w-4 ${s.status === "rood" ? "text-rose-600" : "text-amber-600"}`} />
                }
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide opacity-70">{s.label}</p>
                <p className="text-lg font-bold leading-tight">{s.waarde}</p>
                <p className="text-xs mt-0.5 opacity-80 leading-snug">{s.toelichting}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Nacalculatie gecombineerd totaal ──────────────────────────────────────────

function NacalculatieTotaal({
  nacalculatie,
  begrotingArbeidTotaal,
  begrotingArbeidUren,
}: {
  nacalculatie: OpdrachtNacalculatie;
  begrotingArbeidTotaal: number;
  begrotingArbeidUren: number;
}) {
  const gemiddeldTarief = begrotingArbeidTotaal > 0 && begrotingArbeidUren > 0
    ? begrotingArbeidTotaal / begrotingArbeidUren
    : 0;
  const werkelijkeArbeidTotaal = Math.round((nacalculatie.verbruikte_uren ?? 0) * gemiddeldTarief * 100) / 100;
  const verschilArbeid = Math.round((begrotingArbeidTotaal - werkelijkeArbeidTotaal) * 100) / 100;

  const begrotingMateriaal = nacalculatie.begroting_materiaal_bedrag ?? 0;
  const werkelijkMateriaal = nacalculatie.werkelijke_materiaal_bedrag ?? 0;
  const verschilMateriaal = nacalculatie.verschil_materiaal ?? 0;

  const begrotingTotaal = begrotingArbeidTotaal + begrotingMateriaal;
  const werkelijkTotaal = werkelijkeArbeidTotaal + werkelijkMateriaal;
  const verschilTotaal = Math.round((begrotingTotaal - werkelijkTotaal) * 100) / 100;

  return (
    <Card className="border-slate-300 bg-slate-50">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm font-semibold">Totaaloverzicht arbeid + materiaal</CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b">
              <th className="text-left pb-1 font-normal">Post</th>
              <th className="text-right pb-1 font-normal">Begroot</th>
              <th className="text-right pb-1 font-normal">Werkelijk</th>
              <th className="text-right pb-1 font-normal">Verschil</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-dashed">
              <td className="py-1.5">Arbeid</td>
              <td className="text-right py-1.5 tabular-nums">{euro(begrotingArbeidTotaal)}</td>
              <td className="text-right py-1.5 tabular-nums">{euro(werkelijkeArbeidTotaal)}</td>
              <td className={`text-right py-1.5 tabular-nums ${verschilArbeid >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {euro(verschilArbeid)}
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1.5">Materiaal</td>
              <td className="text-right py-1.5 tabular-nums">{euro(begrotingMateriaal)}</td>
              <td className="text-right py-1.5 tabular-nums">{euro(werkelijkMateriaal)}</td>
              <td className={`text-right py-1.5 tabular-nums ${verschilMateriaal >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {euro(verschilMateriaal)}
              </td>
            </tr>
            <tr className="font-semibold border-t-2 border-slate-300">
              <td className="py-2">Totaal</td>
              <td className="text-right py-2 tabular-nums">{euro(begrotingTotaal)}</td>
              <td className="text-right py-2 tabular-nums">{euro(werkelijkTotaal)}</td>
              <td className={`text-right py-2 tabular-nums ${verschilTotaal >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {euro(verschilTotaal)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground mt-2">
          Arbeid werkelijk = verbruikte uren &times; gemiddeld uurtarief uit werkbegroting. Verschil positief = onder begroting.
        </p>
      </CardContent>
    </Card>
  );
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
  const [chatOpen, setChatOpen] = useState(false);
  const [seniorOpen, setSeniorOpen] = useState(false);

  const { data: opdracht, isLoading: opdrachtLoading } = useGetOpdracht(opdrachtId);
  const { data: werkbegroting, isLoading: wbLoading } = useGetWerkbegroting(opdrachtId);
  const { data: nacalculatie } = useGetNacalculatie(opdrachtId);
  const { data: planningUren } = useListOpdrachtPlanningUren(opdrachtId);

  // ── PIM — AI Regisseur ────────────────────────────────────────────────────────
  const { data: pim, isLoading: pimLoading } = useGetPim(opdrachtId);

  const pimAnalyseerMut = useAnalyseerPim({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetPimQueryKey(opdrachtId) });
        qc.invalidateQueries({ queryKey: getGetOpdrachtQueryKey(opdrachtId) });
        toast({ title: "AI-adviesanalyse voltooid" });
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Onbekende fout";
        toast({ title: "Analyse mislukt", description: msg, variant: "destructive" });
      },
    },
  });

  const pimBevestigMut = useBevestigPimAdvies({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetPimQueryKey(opdrachtId) });
        qc.invalidateQueries({ queryKey: getGetOpdrachtQueryKey(opdrachtId) });
        toast({ title: "Advies goedgekeurd — fase: advies_gereed" });
      },
      onError: () => toast({ title: "Goedkeuren mislukt", variant: "destructive" }),
    },
  });

  const pimRapportMut = useMaakPimAdviesRapport({
    mutation: {
      onSuccess: () => {
        toast({ title: "Adviesrapport aangemaakt in DMS" });
      },
      onError: () => toast({ title: "Rapport aanmaken mislukt", variant: "destructive" }),
    },
  });

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

  const aiChatMut = useAiChatWerkbegroting();

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

      {/* AI-projectcontroller */}
      <ProjectControllerSignalen nacalculatie={nacalculatie} />

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
          <TabsTrigger value="ai-regisseur">
            <Brain className="h-3.5 w-3.5 mr-1.5" />
            AI Regisseur
          </TabsTrigger>
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
              <Button
                size="sm"
                variant={seniorOpen ? "default" : "outline"}
                onClick={() => setSeniorOpen(v => !v)}
                title="AI Senior Werkvoorbereider"
              >
                <HardHat className="h-3.5 w-3.5" />
                Senior
              </Button>
              <Button
                size="sm"
                variant={chatOpen ? "default" : "outline"}
                onClick={() => setChatOpen(v => !v)}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                AI-chat
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

          {/* AI Senior Werkvoorbereider */}
          {seniorOpen && (
            <AiSeniorWerkvoorbereiderPanel opdrachtId={opdrachtId} />
          )}

          {/* AI-chatpaneel */}
          {chatOpen && (
            <div className="border rounded-lg overflow-hidden" style={{ height: 520 }}>
              <AiChatPanel
                onVerstuur={async (berichten, afbeelding_base64) =>
                  aiChatMut.mutateAsync({ id: opdrachtId, data: { berichten, afbeelding_base64: afbeelding_base64 ?? undefined } })
                }
                className="h-full border-0"
                snelleActies={[
                  "Controleer volledigheid van de werkbegroting",
                  "Controleer of alle eenheden kloppen",
                  "Ontbreken er werkzaamheden voor dit type project?",
                  "Zijn de urennormen realistisch?",
                  "Wat zijn de risico's op meerwerk?",
                ]}
                placeholder="Stel een vraag over de technische uitvoering, planning of volledigheid van deze werkbegroting..."
              />
            </div>
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
              <div className="flex items-center justify-between">
                {nacalculatie.werktype ? (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">Werktype (afgeleid uit dominante spotsoort):</p>
                    <Badge variant="secondary" className="capitalize text-xs">{nacalculatie.werktype}</Badge>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Werktype nog niet bepaald — beschikbaar na eerste FIE-berekening.</p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.print()}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Afdrukken / PDF
                </Button>
              </div>
              {/* ── Arbeid ── */}
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-semibold">Arbeidskosten</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Begroting uren</p>
                      <p className="text-lg font-semibold">{uren(nacalculatie.begroting_arbeid_uren)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Verbruikt</p>
                      <p className="text-lg font-semibold">{uren(nacalculatie.verbruikte_uren)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Verschil</p>
                      <p className={`text-lg font-semibold ${(nacalculatie.verschil ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {(nacalculatie.verschil ?? 0) >= 0
                          ? <TrendingUp className="inline h-4 w-4 mr-1" />
                          : <TrendingDown className="inline h-4 w-4 mr-1" />}
                        {uren(nacalculatie.verschil)}
                      </p>
                    </div>
                  </div>

                  {nacalculatie.regels && nacalculatie.regels.length > 0 && (
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
                  )}
                </CardContent>
              </Card>

              {/* ── Materiaalkosten ── */}
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-semibold">Materiaalkosten</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pb-3 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Begroot</p>
                      <p className="text-lg font-semibold">{euro(nacalculatie.begroting_materiaal_bedrag)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Werkelijk</p>
                      <p className="text-lg font-semibold">{euro(nacalculatie.werkelijke_materiaal_bedrag)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Verschil</p>
                      <p className={`text-lg font-semibold ${(nacalculatie.verschil_materiaal ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {(nacalculatie.verschil_materiaal ?? 0) >= 0
                          ? <TrendingUp className="inline h-4 w-4 mr-1" />
                          : <TrendingDown className="inline h-4 w-4 mr-1" />}
                        {euro(nacalculatie.verschil_materiaal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">% van begroting</p>
                      {(() => {
                        const begroot = nacalculatie.begroting_materiaal_bedrag ?? 0;
                        const werkelijk = nacalculatie.werkelijke_materiaal_bedrag ?? 0;
                        if (begroot <= 0) return <p className="text-lg font-semibold text-muted-foreground">—</p>;
                        const pct = Math.round((werkelijk / begroot) * 100);
                        return (
                          <p className={`text-lg font-semibold ${pct > 100 ? "text-rose-700" : pct > 75 ? "text-amber-700" : "text-emerald-700"}`}>
                            {pct}%
                          </p>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Uitsplitsing bronnen */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b">
                        <th className="text-left pb-1 font-normal">Bron</th>
                        <th className="text-right pb-1 font-normal">Werkelijk</th>
                        <th className="text-right pb-1 font-normal">% van begroting</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-dashed">
                        <td className="py-1.5">Magazijn-uitgiftes</td>
                        <td className="text-right py-1.5 tabular-nums">{euro(nacalculatie.materiaal_uitgifte_kosten)}</td>
                        <td className="text-right py-1.5 tabular-nums text-muted-foreground">
                          {(nacalculatie.begroting_materiaal_bedrag ?? 0) > 0
                            ? `${Math.round(((nacalculatie.materiaal_uitgifte_kosten ?? 0) / (nacalculatie.begroting_materiaal_bedrag ?? 1)) * 100)}%`
                            : "—"}
                        </td>
                      </tr>
                      <tr className="border-b border-dashed last:border-0">
                        <td className="py-1.5">Inkoopregels (besteld/geleverd)</td>
                        <td className="text-right py-1.5 tabular-nums">{euro(nacalculatie.materiaal_inkoop_kosten)}</td>
                        <td className="text-right py-1.5 tabular-nums text-muted-foreground">
                          {(nacalculatie.begroting_materiaal_bedrag ?? 0) > 0
                            ? `${Math.round(((nacalculatie.materiaal_inkoop_kosten ?? 0) / (nacalculatie.begroting_materiaal_bedrag ?? 1)) * 100)}%`
                            : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {nacalculatie.werkelijke_materiaal_bedrag === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nog geen werkelijke materiaalkosten geregistreerd. Kosten verschijnen zodra er magazijn-uitgiftes zijn gedaan of inkoopregels de status &ldquo;besteld&rdquo; of &ldquo;geleverd&rdquo; hebben.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* ── Gecombineerd totaal ── */}
              <NacalculatieTotaal
                nacalculatie={nacalculatie}
                begrotingArbeidTotaal={totaalArbeid}
                begrotingArbeidUren={nacalculatie.begroting_arbeid_uren ?? 0}
              />
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

        {/* ── AI Regisseur ── */}
        <TabsContent value="ai-regisseur" className="mt-4 space-y-4">
          {pimLoading && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          )}

          {!pimLoading && (
            <>
              {/* Status + acties */}
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Brain className="h-4 w-4 text-primary" />
                      AI Regisseur — PIM status
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {pim ? (
                        <Badge variant="outline" className="font-mono text-xs">
                          {(opdracht as unknown as Record<string, unknown>)?.ai_fase as string ?? "nieuw"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Geen PIM
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-4 space-y-3">
                  {!pim && (
                    <p className="text-sm text-muted-foreground">
                      Er is nog geen PIM-model voor deze opdracht. Het wordt aangemaakt zodra een aanvraag via FPS One binnenkomt.
                    </p>
                  )}

                  {pim && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pimAnalyseerMut.isPending}
                        onClick={() => pimAnalyseerMut.mutate({ id: opdrachtId })}
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        {pimAnalyseerMut.isPending ? "Analyseren..." : "AI-analyse uitvoeren"}
                      </Button>

                      {((opdracht as unknown as Record<string, unknown>)?.ai_fase as string) === "advies" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          disabled={pimBevestigMut.isPending}
                          onClick={() => pimBevestigMut.mutate({ id: opdrachtId })}
                        >
                          <FileCheck2 className="h-3.5 w-3.5 mr-1.5" />
                          {pimBevestigMut.isPending ? "Bezig..." : "Advies goedkeuren"}
                        </Button>
                      )}

                      {((opdracht as unknown as Record<string, unknown>)?.ai_fase as string) === "advies_gereed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pimRapportMut.isPending}
                          onClick={() => pimRapportMut.mutate({ id: opdrachtId })}
                        >
                          <Printer className="h-3.5 w-3.5 mr-1.5" />
                          {pimRapportMut.isPending ? "Aanmaken..." : "Rapport in DMS opslaan"}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Adviescontext */}
              {pim?.advies_context && (() => {
                const ctx = pim.advies_context as Record<string, unknown>;
                return (
                  <div className="space-y-3">
                    {/* Aanbeveling */}
                    {Boolean(ctx.aanbeveling) && (
                      <Card className={
                        ctx.aanbeveling === "direct_uitvoeren"
                          ? "border-emerald-200 bg-emerald-50/40"
                          : ctx.aanbeveling === "meer_info_nodig"
                          ? "border-amber-200 bg-amber-50/40"
                          : "border-blue-200 bg-blue-50/40"
                      }>
                        <CardHeader className="pb-1 pt-4">
                          <CardTitle className="text-sm">Aanbeveling</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4 space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {String(ctx.aanbeveling).replace(/_/g, " ")}
                            </Badge>
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              betrouwbaarheid: {String(ctx.betrouwbaarheid ?? "—")}
                            </Badge>
                          </div>
                          {Boolean(ctx.aanbeveling_toelichting) && (
                            <p className="text-sm text-muted-foreground mt-2">{String(ctx.aanbeveling_toelichting)}</p>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Werkzaamheden */}
                    {Array.isArray(ctx.werkzaamheden) && ctx.werkzaamheden.length > 0 && (
                      <Card>
                        <CardHeader className="pb-1 pt-4">
                          <CardTitle className="text-sm">Verwachte werkzaamheden</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4">
                          <ul className="space-y-1">
                            {(ctx.werkzaamheden as string[]).map((w, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm">
                                <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                                {w}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}

                    {/* Locaties */}
                    {Array.isArray(ctx.locaties) && ctx.locaties.length > 0 && (
                      <Card>
                        <CardHeader className="pb-1 pt-4">
                          <CardTitle className="text-sm">Herkende locaties</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4">
                          <div className="flex flex-wrap gap-2">
                            {(ctx.locaties as string[]).map((l, i) => (
                              <Badge key={i} variant="secondary" className="text-xs font-normal">{l}</Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Risico's */}
                    {Array.isArray(ctx.risicos) && ctx.risicos.length > 0 && (
                      <Card className="border-amber-200">
                        <CardHeader className="pb-1 pt-4">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <ShieldAlert className="h-4 w-4 text-amber-500" />
                            Risico's &amp; aandachtspunten
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4">
                          <ul className="space-y-1">
                            {(ctx.risicos as string[]).map((r, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                                {r}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}

                    {/* Normen */}
                    {Array.isArray(ctx.normen) && ctx.normen.length > 0 && (
                      <Card>
                        <CardHeader className="pb-1 pt-4">
                          <CardTitle className="text-sm">Relevante normen</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4">
                          <div className="flex flex-wrap gap-2">
                            {(ctx.normen as string[]).map((n, i) => (
                              <Badge key={i} variant="outline" className="text-xs font-mono">{n}</Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Vragen */}
                    {Array.isArray(ctx.vragen) && ctx.vragen.length > 0 && (
                      <Card className="border-blue-200">
                        <CardHeader className="pb-1 pt-4">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-blue-500" />
                            Open vragen voor opdrachtgever
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4">
                          <ul className="space-y-1">
                            {(ctx.vragen as string[]).map((v, i) => (
                              <li key={i} className="text-sm text-blue-900">{i + 1}. {v}</li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}

                    {/* Ontbrekende info */}
                    {Array.isArray(ctx.ontbrekende_info) && ctx.ontbrekende_info.length > 0 && (
                      <Card>
                        <CardHeader className="pb-1 pt-4">
                          <CardTitle className="text-sm">Ontbrekende informatie</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4">
                          <ul className="space-y-1">
                            {(ctx.ontbrekende_info as string[]).map((o, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                {o}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}

                    {/* VOP vlag */}
                    {ctx.vop_aandachtspunt === true && (
                      <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex items-center gap-3">
                        <HardHat className="h-4 w-4 text-orange-600 shrink-0" />
                        <p className="text-sm text-orange-800 font-medium">
                          VOP-certificatieplichtige situatie te verwachten — controleer inzet VOP-gecertificeerd monteur.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </TabsContent>
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

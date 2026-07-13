// Opdracht detail — werkbegroting, nacalculatie, planning-uren, inkoopplanning, uitvoeringsplanning
import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetOpdracht,
  useGetWerkbegroting,
  useVaststellenWerkbegroting,
  useAiAnalyseWerkbegroting,
  useBeoordeelWerkbegrotingAiVoorstel,
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
  useGenereerPimWerkvoorbereiding,
  usePatchPimWerkvoorbereiding,
  useVaststellenPimWerkvoorbereiding,
  useBevestigPimAdvies,
  useAfwijzenPimAdvies,
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Sparkles, Check, Clock, AlertTriangle, CalendarCheck,
  TrendingUp, TrendingDown, Edit2, Package, ShoppingCart, Building2, ShoppingBag, MessageSquare, CheckCircle2, HardHat, Printer, Brain, FileCheck2, ShieldAlert, ShieldCheck,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { GoedkeuringWidget } from "@/components/goedkeuring/goedkeuring-widget";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import InkoopplanningTab from "./inkoopplanning-tab";
import { InkoopcoachTab } from "./inkoopcoach-tab";
import UitvoeringsplanningTab from "./uitvoeringsplanning-tab";
import OnderaannemeringTab from "./onderaanneming-tab";
import MateriaaltabTab from "./materiaal-tab";
import PimUitvoeringTab, { StappenOverzicht } from "./pim-uitvoering-tab";
import PimOpleveringTab from "./pim-oplevering-tab";

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

  const signalen: { label: string; status: SignaalStatus; waarde: string; toelichting: string }[] = [
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

  const begrotingMateriaal = nacalc.begroting_materiaal_bedrag ?? 0;
  if (begrotingMateriaal > 0) {
    const werkelijkMateriaal = nacalc.werkelijke_materiaal_bedrag ?? 0;
    const materiaalPct = werkelijkMateriaal / begrotingMateriaal;
    const materiaalStatus: SignaalStatus = materiaalPct > 1 ? "rood" : materiaalPct > 0.75 ? "oranje" : "groen";
    signalen.push({
      label: "Materiaalstatus",
      status: materiaalStatus,
      waarde: `${Math.round(materiaalPct * 100)}%`,
      toelichting: materiaalPct > 1
        ? `${euro(werkelijkMateriaal - begrotingMateriaal)} boven begroting`
        : `${euro(werkelijkMateriaal)} van ${euro(begrotingMateriaal)} begroot verbruikt`,
    });
  }

  return signalen;
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
  const [pimKaartIngeklapt, setPimKaartIngeklapt] = useState(false);
  const [wvBewerkModus, setWvBewerkModus] = useState(false);
  const [wvPlanningadviesEdit, setWvPlanningadviesEdit] = useState("");
  const [wvAandachtspuntenEdit, setWvAandachtspuntenEdit] = useState<string[]>([]);

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

  const pimAfwijzenMut = useAfwijzenPimAdvies({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetPimQueryKey(opdrachtId) });
        qc.invalidateQueries({ queryKey: getGetOpdrachtQueryKey(opdrachtId) });
        toast({ title: "Advies afgewezen — fase terug naar nieuw" });
      },
      onError: () => toast({ title: "Afwijzen mislukt", variant: "destructive" }),
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

  const pimVaststellenMut = useVaststellenPimWerkvoorbereiding({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetPimQueryKey(opdrachtId) });
        qc.invalidateQueries({ queryKey: getGetOpdrachtQueryKey(opdrachtId) });
        toast({ title: "Werkvoorbereiding vastgesteld — fase: inkoop" });
      },
      onError: () => toast({ title: "Vaststellen mislukt", variant: "destructive" }),
    },
  });

  const pimPatchMut = usePatchPimWerkvoorbereiding({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetPimQueryKey(opdrachtId) });
        setWvBewerkModus(false);
        toast({ title: "Aanpassingen opgeslagen" });
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    },
  });

  const pimGenereerMut = useGenereerPimWerkvoorbereiding({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetPimQueryKey(opdrachtId) });
        qc.invalidateQueries({ queryKey: getGetOpdrachtQueryKey(opdrachtId) });
        toast({ title: "AI-werkvoorbereiding gegenereerd" });
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Onbekende fout";
        toast({ title: "Werkvoorbereiding mislukt", description: msg, variant: "destructive" });
      },
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

  const beoordeelMutatie = useBeoordeelWerkbegrotingAiVoorstel({
    mutation: {
      onSuccess: (_data, vars) => {
        qc.invalidateQueries({ queryKey: getGetWerkbegrotingQueryKey(opdrachtId) });
        toast({
          title: vars.data.beslissing === "geaccepteerd"
            ? "AI-voorstel bevestigd"
            : "AI-voorstel genegeerd",
        });
      },
      onError: () => toast({ title: "Beoordelen mislukt", variant: "destructive" }),
    },
  });

  const aiChatMut = useAiChatWerkbegroting();

  const isGereed = opdracht?.status === "afgerond";

  function downloadNacalculatiePdf() {
    window.print();
  }

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
  const voorstelStatus = (aiAnalyse?.voorstel_status as string | undefined)
    ?? (aiAnalyse ? "voorstel" : undefined);
  const isVoorstel = !!aiAnalyse && voorstelStatus === "voorstel";
  const isVoorstelBevestigd = !!aiAnalyse && voorstelStatus === "geaccepteerd";
  const isVoorstelGenegeerd = !!aiAnalyse && voorstelStatus === "genegeerd";

  const arbeidRegels = werkbegroting?.regels?.filter(r => r.categorie === "arbeid") ?? [];
  const materiaalRegels = werkbegroting?.regels?.filter(r => r.categorie === "materiaal") ?? [];
  const totaalArbeid = arbeidRegels.reduce((a, r) => a + (r.totaal ?? 0), 0);
  const totaalMateriaal = materiaalRegels.reduce((a, r) => a + (r.totaal ?? 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap print:hidden">
        <Link href={opdracht.offerte_id ? `/offertes/${opdracht.offerte_id}` : "/offertes"}>
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        {opdracht.gebouw_id && (
          <Link href={`/gebouwen/${opdracht.gebouw_id}`}>
            <Button variant="outline" size="sm">
              <Building2 className="h-4 w-4 mr-1.5" />
              Terug naar project
            </Button>
          </Link>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight">{opdracht.titel}</h1>
            <Badge variant="outline" className={opStatus.kleur}>{opStatus.label}</Badge>
            {wbStatus && (
              <Badge variant="outline" className={wbStatus.kleur}>Begroting: {wbStatus.label}</Badge>
            )}
            <div className="flex-1" />
            <div className="flex gap-2 print:hidden">
              {isGereed && (
                <Button variant="outline" size="sm" onClick={downloadNacalculatiePdf}>
                  <Printer className="h-4 w-4 mr-1.5" />
                  Nacalculatie PDF
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setChatOpen(true)}>
                <MessageSquare className="h-4 w-4 mr-1.5" />
                AI-chat
              </Button>
            </div>
          </div>
          {opdracht.werknummer && <p className="text-xs text-muted-foreground mt-0.5">{opdracht.werknummer}</p>}
        </div>
      </div>

      {/* Goedkeuring projectafsluiting */}
      {isGereed && (
        <div className="print:hidden">
          <GoedkeuringWidget
            objectType="projectafsluiting"
            objectId={opdrachtId}
            documentType="projectafsluiting"
            omschrijving={`Projectafsluiting — ${opdracht.titel}${opdracht.werknummer ? ` (${opdracht.werknummer})` : ""}`}
            toonIndienKnop={true}
          />
        </div>
      )}

      {/* Overzichtkaart */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:hidden">
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
      <div className="print:hidden">
        <ProjectControllerSignalen nacalculatie={nacalculatie} />

      {/* Live Uitvoeringsvoortgang (Task #309) */}
      <StappenOverzicht opdrachtId={opdrachtId} />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1 print:hidden">
          <TabsTrigger value="werkbegroting">Werkbegroting</TabsTrigger>
          <TabsTrigger value="inkoopplanning">
            <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
            Inkoopplanning
          </TabsTrigger>
          <TabsTrigger value="inkoopcoach">
            <Brain className="h-3.5 w-3.5 mr-1.5" />
            AI-inkoopcoach
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
            Materiaal & uitgiftes
          </TabsTrigger>
          <TabsTrigger value="nacalculatie">Nacalculatie</TabsTrigger>
          <TabsTrigger value="planning">Planning-uren</TabsTrigger>
          {aiAnalyse && <TabsTrigger value="ai">AI-analyse</TabsTrigger>}
          <TabsTrigger value="ai-regisseur">
            <Brain className="h-3.5 w-3.5 mr-1.5" />
            AI Regisseur
          </TabsTrigger>
          <TabsTrigger value="uitvoering">
            <HardHat className="h-3.5 w-3.5 mr-1.5" />
            Uitvoering
          </TabsTrigger>
          <TabsTrigger value="oplevering">
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
            Oplevering
          </TabsTrigger>
        </TabsList>

        {/* ── Werkbegroting ── */}
        <TabsContent value="werkbegroting" className="space-y-4 mt-4">
          {/* ── AI-werkbegrotingvoorstel (nog te bevestigen) ── */}
          {isVoorstel && (
            <Card className="border-amber-200 bg-amber-50/60">
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-medium text-amber-800 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
                  AI-voorstel — nog te bevestigen
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3 space-y-3">
                {typeof aiAnalyse?.samenvatting === "string" && aiAnalyse.samenvatting && (
                  <p className="text-sm text-amber-900">{aiAnalyse.samenvatting as string}</p>
                )}
                <p className="text-xs text-amber-700">
                  De AI heeft deze werkbegroting automatisch geanalyseerd en doet voorstellen voor inkoop en arbeid.
                  Dit is een voorstel: beoordeel het en bevestig of negeer het.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={beoordeelMutatie.isPending}
                    onClick={() => beoordeelMutatie.mutate({ id: opdrachtId, data: { beslissing: "geaccepteerd" } })}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    {beoordeelMutatie.isPending ? "Bezig..." : "Voorstel bevestigen"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={beoordeelMutatie.isPending}
                    onClick={() => beoordeelMutatie.mutate({ id: opdrachtId, data: { beslissing: "genegeerd" } })}
                  >
                    Negeren
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-7 p-0 text-xs text-amber-700"
                    onClick={() => setActiveTab("ai")}
                  >
                    Volledig voorstel bekijken
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {isVoorstelBevestigd && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-muted-foreground">
                <Check className="h-3 w-3 mr-1" />
                AI-voorstel bevestigd
                {typeof aiAnalyse?.beoordeeld_op === "string" && (
                  <span className="ml-1">op {new Date(aiAnalyse.beoordeeld_op as string).toLocaleDateString("nl-NL")}</span>
                )}
              </Badge>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground"
                onClick={() => setActiveTab("ai")}
              >
                Bekijken
              </Button>
            </div>
          )}
          {/* ── Inklapbare PIM-analysekaart (fase B + C context) ─────────────────── */}
          {pim?.advies_context && (() => {
            const ctx = pim.advies_context as Record<string, unknown>;
            const wv = pim.werkvoorbereiding_context as Record<string, unknown> | null | undefined;
            const aiFase = (opdracht as unknown as Record<string, unknown>)?.ai_fase as string | undefined;
            const fasenMetPim = ["werkvoorbereiding", "inkoop", "uitvoering", "oplevering", "gereed"];
            if (!aiFase || !fasenMetPim.includes(aiFase)) return null;
            const volledigheid = wv ? String(wv.voorbereiding_volledigheid ?? "onvolledig") : null;
            const risicos = Array.isArray(ctx.risicos) ? (ctx.risicos as string[]) : [];
            const vragen = Array.isArray(ctx.vragen) ? (ctx.vragen as string[]) : [];
            const aandachtspunten = wv && Array.isArray(wv.aandachtspunten) ? (wv.aandachtspunten as string[]) : [];
            return (
              <Card className="border-indigo-200 bg-indigo-50/40">
                <CardHeader className="pb-2 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-indigo-600 shrink-0" />
                      <CardTitle className="text-sm font-medium text-indigo-900">
                        PIM-analyse
                        {wv && (
                          <span className="ml-2 font-normal text-xs text-indigo-700">
                            (werkvoorbereiding
                            {volledigheid && (
                              <span className={
                                volledigheid === "volledig"
                                  ? " text-emerald-700"
                                  : volledigheid === "voldoende"
                                  ? " text-blue-700"
                                  : " text-amber-700"
                              }>
                                {" "}— {volledigheid}
                              </span>
                            )}
                            )
                          </span>
                        )}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      {aiFase === "werkvoorbereiding" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          disabled={pimVaststellenMut.isPending}
                          onClick={() => pimVaststellenMut.mutate({ id: opdrachtId })}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {pimVaststellenMut.isPending ? "Bezig..." : "Vaststellen"}
                        </Button>
                      )}
                      {aiFase === "inkoop" && (
                        <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700 bg-emerald-50">
                          Vastgesteld
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-indigo-600"
                        onClick={() => setPimKaartIngeklapt(v => !v)}
                        title={pimKaartIngeklapt ? "Uitklappen" : "Inklappen"}
                      >
                        {pimKaartIngeklapt ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {!pimKaartIngeklapt && (
                  <CardContent className="pb-4 space-y-3">
                    {/* Risico's */}
                    {risicos.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-indigo-800 mb-1">Risico&apos;s</p>
                        <ul className="space-y-0.5">
                          {risicos.map((r, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-indigo-900">
                              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {/* Aandachtspunten werkvoorbereiding */}
                    {aandachtspunten.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-indigo-800 mb-1">Aandachtspunten werkvoorbereiding</p>
                        <ul className="space-y-0.5">
                          {aandachtspunten.map((a, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-indigo-900">
                              <HardHat className="h-3 w-3 mt-0.5 shrink-0 text-indigo-500" />
                              {a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {/* Open vragen */}
                    {vragen.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-indigo-800 mb-1">Open vragen voor opdrachtgever</p>
                        <ul className="space-y-0.5">
                          {vragen.map((v, i) => (
                            <li key={i} className="text-xs text-blue-800">
                              {i + 1}. {v}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {risicos.length === 0 && aandachtspunten.length === 0 && vragen.length === 0 && (
                      <p className="text-xs text-muted-foreground">Geen risico&apos;s of aandachtspunten geregistreerd.</p>
                    )}
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs text-indigo-600"
                      onClick={() => setActiveTab("ai-regisseur")}
                    >
                      Volledige PIM-analyse bekijken
                    </Button>
                  </CardContent>
                )}
              </Card>
            );
          })()}

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

        {/* ── AI-inkoopcoach ── */}
        <TabsContent value="inkoopcoach">
          <InkoopcoachTab opdrachtId={opdrachtId} />
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
              {/* Print-only kop: opdrachttitel, werknummer en datum */}
              <div className="hidden print:block mb-2">
                <h1 className="text-lg font-bold">{opdracht.titel}</h1>
                <p className="text-sm text-muted-foreground">
                  {opdracht.werknummer && <>Werknummer: {opdracht.werknummer} · </>}
                  Nacalculatie geëxporteerd op {new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              <div className="flex items-center justify-between">
                {nacalculatie.werktype ? (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">Werktype (afgeleid uit dominante spotsoort):</p>
                    {nacalculatie.werktype === "algemeen" && nacalculatie.werktype_bron === "fallback" ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="secondary" className="capitalize text-xs cursor-help border-amber-200 bg-amber-50 text-amber-800">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {nacalculatie.werktype}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Geen spots gevonden voor dit gebouw — werktype kon niet worden afgeleid.</p>
                          {opdracht.gebouw_id && (
                            <Link href={`/gebouwen/${opdracht.gebouw_id}`} className="block mt-2 font-semibold underline">
                              Ga naar gebouwpagina om spots te registreren
                            </Link>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Badge variant="secondary" className="capitalize text-xs">{nacalculatie.werktype}</Badge>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Werktype nog niet bepaald — beschikbaar na eerste FIE-berekening.</p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.print()}
                  className="print:hidden"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Exporteren als PDF
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
            {isVoorstel && (
              <Card className="border-amber-200 bg-amber-50/60">
                <CardContent className="py-3 flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Voorstel — nog te bevestigen
                  </Badge>
                  <p className="text-xs text-amber-700 flex-1 min-w-40">
                    Deze analyse is een AI-voorstel. Bevestig of negeer het voorstel.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={beoordeelMutatie.isPending}
                      onClick={() => beoordeelMutatie.mutate({ id: opdrachtId, data: { beslissing: "geaccepteerd" } })}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      {beoordeelMutatie.isPending ? "Bezig..." : "Bevestigen"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={beoordeelMutatie.isPending}
                      onClick={() => beoordeelMutatie.mutate({ id: opdrachtId, data: { beslissing: "genegeerd" } })}
                    >
                      Negeren
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {isVoorstelBevestigd && (
              <Badge variant="secondary" className="text-muted-foreground">
                <Check className="h-3 w-3 mr-1" />
                Voorstel bevestigd
                {typeof aiAnalyse.beoordeeld_op === "string" && (
                  <span className="ml-1">op {new Date(aiAnalyse.beoordeeld_op as string).toLocaleDateString("nl-NL")}</span>
                )}
              </Badge>
            )}
            {isVoorstelGenegeerd && (
              <p className="text-xs text-muted-foreground">
                Dit voorstel is genegeerd
                {typeof aiAnalyse.beoordeeld_op === "string" && (
                  <> op {new Date(aiAnalyse.beoordeeld_op as string).toLocaleDateString("nl-NL")}</>
                )}
                . Voer opnieuw een AI-analyse uit voor een nieuw voorstel.
              </p>
            )}
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
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            disabled={pimBevestigMut.isPending || pimAfwijzenMut.isPending}
                            onClick={() => pimBevestigMut.mutate({ id: opdrachtId })}
                          >
                            <FileCheck2 className="h-3.5 w-3.5 mr-1.5" />
                            {pimBevestigMut.isPending ? "Bezig..." : "Advies goedkeuren"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-destructive text-destructive hover:bg-destructive/10"
                            disabled={pimAfwijzenMut.isPending || pimBevestigMut.isPending}
                            onClick={() => pimAfwijzenMut.mutate({ id: opdrachtId })}
                          >
                            <FileCheck2 className="h-3.5 w-3.5 mr-1.5" />
                            {pimAfwijzenMut.isPending ? "Bezig..." : "Advies afwijzen"}
                          </Button>
                        </>
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

                      {((opdracht as unknown as Record<string, unknown>)?.ai_fase as string) === "advies_gereed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                          disabled={pimGenereerMut.isPending}
                          onClick={() => pimGenereerMut.mutate({ id: opdrachtId })}
                        >
                          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                          {pimGenereerMut.isPending ? "Analyseren..." : "Werkvoorbereiding genereren"}
                        </Button>
                      )}

                      {((opdracht as unknown as Record<string, unknown>)?.ai_fase as string) === "werkvoorbereiding" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                            disabled={pimGenereerMut.isPending}
                            onClick={() => pimGenereerMut.mutate({ id: opdrachtId })}
                          >
                            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                            {pimGenereerMut.isPending ? "Genereren..." : "Opnieuw genereren"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            disabled={pimVaststellenMut.isPending}
                            onClick={() => pimVaststellenMut.mutate({ id: opdrachtId })}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            {pimVaststellenMut.isPending ? "Bezig..." : "Werkvoorbereiding vaststellen"}
                          </Button>
                        </>
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

              {/* ── Werkvoorbereiding context ── */}
              {pim?.werkvoorbereiding_context && (() => {
                const wv = pim.werkvoorbereiding_context as Record<string, unknown>;
                const volledigheid = String(wv.voorbereiding_volledigheid ?? "onvolledig");
                return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pt-2 pb-1">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide px-2">
                        AI Werkvoorbereiding
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          volledigheid === "volledig"
                            ? "border-emerald-300 text-emerald-700 bg-emerald-50 text-xs"
                            : volledigheid === "voldoende"
                            ? "border-blue-300 text-blue-700 bg-blue-50 text-xs"
                            : "border-amber-300 text-amber-700 bg-amber-50 text-xs"
                        }
                      >
                        {volledigheid}
                      </Badge>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    {/* ── Bewerkknop (alleen fase werkvoorbereiding) ── */}
                    {((opdracht as unknown as Record<string, unknown>)?.ai_fase as string) === "werkvoorbereiding" && !wvBewerkModus && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => {
                            setWvPlanningadviesEdit(typeof wv.planningadvies === "string" ? wv.planningadvies : "");
                            setWvAandachtspuntenEdit(Array.isArray(wv.aandachtspunten) ? (wv.aandachtspunten as string[]).slice() : []);
                            setWvBewerkModus(true);
                          }}
                        >
                          <Edit2 className="h-3 w-3 mr-1" />
                          Aanpassen
                        </Button>
                      </div>
                    )}

                    {/* ── Inline bewerken form ── */}
                    {wvBewerkModus && (
                      <Card className="border-indigo-200">
                        <CardHeader className="pb-2 pt-3">
                          <CardTitle className="text-sm text-indigo-900">Aanpassingen werkvoorbereiding</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4 space-y-4">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1">Planningadvies</label>
                            <Textarea
                              value={wvPlanningadviesEdit}
                              onChange={(e) => setWvPlanningadviesEdit(e.target.value)}
                              rows={3}
                              className="text-sm"
                              placeholder="Planningadvies aanpassen..."
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1">Aandachtspunten</label>
                            <div className="space-y-2">
                              {wvAandachtspuntenEdit.map((ap, i) => (
                                <div key={i} className="flex gap-2">
                                  <Input
                                    value={ap}
                                    onChange={(e) => {
                                      const bijgewerkt = [...wvAandachtspuntenEdit];
                                      bijgewerkt[i] = e.target.value;
                                      setWvAandachtspuntenEdit(bijgewerkt);
                                    }}
                                    className="text-sm h-8"
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-2 text-muted-foreground hover:text-destructive"
                                    onClick={() => setWvAandachtspuntenEdit(wvAandachtspuntenEdit.filter((_, j) => j !== i))}
                                  >
                                    &times;
                                  </Button>
                                </div>
                              ))}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => setWvAandachtspuntenEdit([...wvAandachtspuntenEdit, ""])}
                              >
                                + Aandachtspunt toevoegen
                              </Button>
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              disabled={pimPatchMut.isPending}
                              onClick={() => {
                                const bijgewerkt = {
                                  ...wv,
                                  planningadvies: wvPlanningadviesEdit,
                                  aandachtspunten: wvAandachtspuntenEdit.filter(Boolean),
                                };
                                pimPatchMut.mutate({
                                  id: opdrachtId,
                                  data: { werkvoorbereiding_context: bijgewerkt },
                                });
                              }}
                            >
                              {pimPatchMut.isPending ? "Opslaan..." : "Bewaar aanpassingen"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pimPatchMut.isPending}
                              onClick={() => setWvBewerkModus(false)}
                            >
                              Annuleren
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Doorlooptijd + planningadvies */}
                    {(Boolean(wv.geschatte_doorlooptijd_dagen) || Boolean(wv.planningadvies)) && (
                      <Card className="border-indigo-100 bg-indigo-50/30">
                        <CardContent className="pt-4 pb-4 space-y-2">
                          {typeof wv.geschatte_doorlooptijd_dagen === "number" && (
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-indigo-500 shrink-0" />
                              <span className="text-sm font-medium text-indigo-900">
                                Geschatte doorlooptijd: {wv.geschatte_doorlooptijd_dagen} werkdag{wv.geschatte_doorlooptijd_dagen === 1 ? "" : "en"}
                              </span>
                            </div>
                          )}
                          {Boolean(wv.planningadvies) && (
                            <p className="text-sm text-indigo-800 ml-6">{String(wv.planningadvies)}</p>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Materiaallijst */}
                    {Array.isArray(wv.materiaallijst) && wv.materiaallijst.length > 0 && (
                      <Card>
                        <CardHeader className="pb-1 pt-4">
                          <CardTitle className="text-sm">Materiaallijst</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-muted-foreground text-xs">
                                  <th className="text-left pb-2 font-medium">Artikel</th>
                                  <th className="text-right pb-2 font-medium w-20">Aantal</th>
                                  <th className="text-left pb-2 font-medium w-20 pl-2">Eenheid</th>
                                  <th className="text-left pb-2 font-medium pl-2 hidden sm:table-cell">Opmerkingen</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(wv.materiaallijst as Array<{ artikel: string; hoeveelheid: number; eenheid: string; opmerkingen?: string }>).map((m, i) => (
                                  <tr key={i} className="border-b last:border-0">
                                    <td className="py-1.5 pr-2">{m.artikel}</td>
                                    <td className="py-1.5 text-right font-mono text-xs">{m.hoeveelheid}</td>
                                    <td className="py-1.5 pl-2 text-muted-foreground text-xs">{m.eenheid}</td>
                                    <td className="py-1.5 pl-2 text-muted-foreground hidden sm:table-cell">{m.opmerkingen ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Werkvolgorde */}
                    {Array.isArray(wv.werkvolgorde) && wv.werkvolgorde.length > 0 && (
                      <Card>
                        <CardHeader className="pb-1 pt-4">
                          <CardTitle className="text-sm">Uitvoeringsvolgorde</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4">
                          <ol className="space-y-1.5">
                            {(wv.werkvolgorde as string[]).map((stap, i) => (
                              <li key={i} className="flex items-start gap-2.5 text-sm">
                                <span className="shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold mt-0.5">
                                  {i + 1}
                                </span>
                                {stap.replace(/^\d+\.\s*/, "")}
                              </li>
                            ))}
                          </ol>
                        </CardContent>
                      </Card>
                    )}

                    {/* Competenties */}
                    {Array.isArray(wv.competenties_benodigd) && wv.competenties_benodigd.length > 0 && (
                      <Card>
                        <CardHeader className="pb-1 pt-4">
                          <CardTitle className="text-sm">Vereiste competenties &amp; certificaten</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4">
                          <div className="flex flex-wrap gap-2">
                            {(wv.competenties_benodigd as string[]).map((c, i) => (
                              <Badge key={i} variant="secondary" className="text-xs font-normal">{c}</Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Inkoopacties */}
                    {Array.isArray(wv.inkoopacties) && wv.inkoopacties.length > 0 && (
                      <Card>
                        <CardHeader className="pb-1 pt-4">
                          <CardTitle className="text-sm">Inkoopacties</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4">
                          <ul className="space-y-1">
                            {(wv.inkoopacties as string[]).map((a, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm">
                                <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                                {a}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}

                    {/* Aandachtspunten werkvoorbereiding */}
                    {Array.isArray(wv.aandachtspunten) && wv.aandachtspunten.length > 0 && (
                      <Card className="border-amber-200">
                        <CardHeader className="pb-1 pt-4">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <ShieldAlert className="h-4 w-4 text-amber-500" />
                            Aandachtspunten uitvoering
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4">
                          <ul className="space-y-1">
                            {(wv.aandachtspunten as string[]).map((a, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                                {a}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </TabsContent>

        {/* ── Uitvoering ── */}
        <TabsContent value="uitvoering">
          <PimUitvoeringTab opdrachtId={opdrachtId} />
        </TabsContent>

        {/* ── Oplevering ── */}
        <TabsContent value="oplevering">
          <PimOpleveringTab opdrachtId={opdrachtId} />
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

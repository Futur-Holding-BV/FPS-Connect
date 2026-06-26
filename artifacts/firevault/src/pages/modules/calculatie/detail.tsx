import { useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetModCalculatie,
  useUpdateModCalculatie,
  useDeleteModCalculatie,
  useDupliceerModCalculatie,
  useMaakOfferteVanCalculatie,
  useCreateModCalcRegel,
  useUpdateModCalcRegel,
  useDeleteModCalcRegel,
  useListModCalcNormtijden,
  useListModCalcTarieven,
  useAiModCalcRegels,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Plus, Pencil, Trash2, Copy, ChevronRight, FileText,
  LayoutList, Users, Eye, Sparkles, Wrench, CheckCircle2, X,
  Printer, History, Save,
} from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";

const STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  intern_akkoord: "Intern akkoord",
  aangeboden: "Aangeboden",
  gewonnen: "Gewonnen",
  verloren: "Verloren",
};

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-slate-100 text-slate-700 border-slate-200",
  intern_akkoord: "bg-blue-100 text-blue-800 border-blue-200",
  aangeboden: "bg-amber-100 text-amber-800 border-amber-200",
  gewonnen: "bg-green-100 text-green-800 border-green-200",
  verloren: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_WORKFLOW: Record<string, string[]> = {
  concept: ["intern_akkoord", "verloren"],
  intern_akkoord: ["aangeboden", "verloren"],
  aangeboden: ["gewonnen", "verloren"],
  gewonnen: [],
  verloren: ["concept"],
};

const CATEGORIE_LABEL: Record<string, string> = {
  arbeid: "Arbeid",
  materiaal: "Materiaal",
  onderaanneming: "Onderaanneming",
  materieel: "Materieel",
  overig: "Overig",
};

const CATEGORIE_KLEUR: Record<string, string> = {
  arbeid: "bg-blue-50 text-blue-700",
  materiaal: "bg-green-50 text-green-700",
  onderaanneming: "bg-purple-50 text-purple-700",
  materieel: "bg-orange-50 text-orange-700",
  overig: "bg-slate-50 text-slate-600",
};

const EENHEDEN = ["st", "pst", "m1", "m2", "m3", "uur", "dag", "week", "lump_sum"];

function formatBedrag(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

function formatBedragKort(n: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function fmt2(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const HOOFDSTUK_OPTIES = [
  "Brandwerende doorvoeringen",
  "Deuren en kozijnen",
  "Wanden en plafonds",
  "Schachten",
  "Onderhoud",
  "Overige werkzaamheden",
] as const;

type RegelRow = {
  id: number;
  calculatie_id: number;
  categorie: string;
  omschrijving: string;
  normtijd_id?: number | null;
  normtijd_code?: string | null;
  eenheid: string;
  hoeveelheid: number;
  tarief: number;
  totaal: number;
  volgorde: number;
  opmerkingen?: string | null;
  regelnummer?: string | null;
  mu_per_eenheid: number;
  arbeids_tarief: number;
  onderaanneming_bedrag: number;
  is_staartkosten: boolean;
  hoofdstuk: string;
  klanttekst?: string | null;
  materiaal_totaal: number;
  mu_totaal: number;
  arbeidsloon: number;
};

type RegelForm = {
  categorie: string;
  omschrijving: string;
  normtijd_id: string;
  eenheid: string;
  hoeveelheid: string;
  tarief: string;
  mu_per_eenheid: string;
  arbeids_tarief: string;
  onderaanneming_bedrag: string;
  is_staartkosten: boolean;
  opmerkingen: string;
  regelnummer: string;
  hoofdstuk: string;
  klanttekst: string;
};

const LEGE_REGEL: RegelForm = {
  categorie: "materiaal",
  omschrijving: "",
  normtijd_id: "",
  eenheid: "st",
  hoeveelheid: "1",
  tarief: "0",
  mu_per_eenheid: "0",
  arbeids_tarief: "0",
  onderaanneming_bedrag: "0",
  is_staartkosten: false,
  opmerkingen: "",
  regelnummer: "",
  hoofdstuk: "Overige werkzaamheden",
  klanttekst: "",
};

type Weergave = "intern" | "directie" | "klant" | "monteur";

export default function ModulesCalculatieDetail() {
  const [, params] = useRoute("/modules/calculatie/:id");
  const [, navigate] = useLocation();
  const id = params?.id ? parseInt(params.id, 10) : 0;

  const queryClient = useQueryClient();
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["mod-calculatie", id] });
  }, [queryClient, id]);

  const { data, isLoading } = useGetModCalculatie(id, {
    query: { queryKey: ["mod-calculatie", id], enabled: id > 0 },
  });
  const { data: normtijden = [] } = useListModCalcNormtijden({ query: { queryKey: ["mod-calc-normtijden"] } });
  const { data: tarieven = [] } = useListModCalcTarieven({ query: { queryKey: ["mod-calc-tarieven"] } });

  const updateMut = useUpdateModCalculatie({ mutation: { onSuccess: invalidate } });
  const deleteMut = useDeleteModCalculatie({ mutation: { onSuccess: () => navigate("/modules/calculatie") } });
  const dupliceerMut = useDupliceerModCalculatie({
    mutation: {
      onSuccess: (d) => {
        queryClient.invalidateQueries({ queryKey: ["mod-calculaties"] });
        navigate(`/modules/calculatie/${d.id}`);
      },
    },
  });
  const maakOfferteMut = useMaakOfferteVanCalculatie({
    mutation: {
      onSuccess: (d) => {
        navigate(`/offertes/${d.offerte_id}`);
      },
    },
  });

  const createRegelMut = useCreateModCalcRegel({ mutation: { onSuccess: invalidate } });
  const updateRegelMut = useUpdateModCalcRegel({ mutation: { onSuccess: invalidate } });
  const deleteRegelMut = useDeleteModCalcRegel({ mutation: { onSuccess: invalidate } });

  const [weergave, setWeergave] = useState<Weergave>("intern");
  const [teVerwijderen, setTeVerwijderen] = useState(false);
  const [regelDialoog, setRegelDialoog] = useState<"nieuw" | number | null>(null);
  const [regelForm, setRegelForm] = useState<RegelForm>(LEGE_REGEL);
  const [bewerkenDialoog, setBewerkenDialoog] = useState(false);
  const [aiPaneel, setAiPaneel] = useState(false);
  const [aiVoorstellen, setAiVoorstellen] = useState<RegelForm[]>([]);
  const [aiWaarschuwingen, setAiWaarschuwingen] = useState<string[]>([]);
  const [versieDialoog, setVersieDialoog] = useState(false);
  const [versieOpslaanDialoog, setVersieOpslaanDialoog] = useState(false);
  const [versieLabel, setVersieLabel] = useState("");
  const [versieOpslaanBezig, setVersieOpslaanBezig] = useState(false);

  const { data: versieData, refetch: versiesHerladen } = useQuery<{ id: number; versienummer: number; label: string | null; aangemaakt_op: string }[]>({
    queryKey: ["calc-versies", id],
    queryFn: () => fetch(`/api/modules/calculaties/${id}/versies`).then((r) => r.json()),
    enabled: versieDialoog,
  });

  async function handleVersieOpslaan() {
    setVersieOpslaanBezig(true);
    try {
      await fetch(`/api/modules/calculaties/${id}/versie-opslaan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: versieLabel.trim() || undefined }),
      });
      setVersieOpslaanDialoog(false);
      setVersieLabel("");
      versiesHerladen();
    } finally {
      setVersieOpslaanBezig(false);
    }
  }

  const aiMut = useAiModCalcRegels({
    mutation: {
      onSuccess: (d) => {
        const regels = (d.regels ?? []).map((r) => ({
          categorie: r.categorie ?? "materiaal",
          omschrijving: r.omschrijving ?? "",
          normtijd_id: "",
          eenheid: r.eenheid ?? "st",
          hoeveelheid: String(r.hoeveelheid ?? 1),
          tarief: String(r.tarief ?? 0),
          mu_per_eenheid: String(r.mu_per_eenheid ?? 0),
          arbeids_tarief: String(r.arbeids_tarief ?? 0),
          onderaanneming_bedrag: String(r.onderaanneming_bedrag ?? 0),
          is_staartkosten: r.is_staartkosten ?? false,
          opmerkingen: "",
          regelnummer: "",
          hoofdstuk: r.hoofdstuk ?? "Overige werkzaamheden",
          klanttekst: r.klanttekst ?? "",
        }));
        setAiVoorstellen(regels);
        setAiWaarschuwingen((d.waarschuwingen ?? []) as string[]);
        setAiPaneel(true);
      },
    },
  });
  const [headerForm, setHeaderForm] = useState({
    naam: "", referentie: "", klant_naam: "", project_naam: "",
    status: "", omschrijving: "", opmerkingen: "",
    opslag_ak: 15, opslag_abk: 10, opslag_risico: 5, opslag_winst: 10, korting: 0,
  });

  function openNieuweRegel(staartkosten = false) {
    setRegelForm({ ...LEGE_REGEL, is_staartkosten: staartkosten });
    setRegelDialoog("nieuw");
  }

  function openBewerkenRegel(r: RegelRow) {
    setRegelForm({
      categorie: r.categorie,
      omschrijving: r.omschrijving,
      normtijd_id: r.normtijd_id ? String(r.normtijd_id) : "",
      eenheid: r.eenheid,
      hoeveelheid: String(r.hoeveelheid),
      tarief: String(r.tarief),
      mu_per_eenheid: String(r.mu_per_eenheid ?? 0),
      arbeids_tarief: String(r.arbeids_tarief ?? 0),
      onderaanneming_bedrag: String(r.onderaanneming_bedrag ?? 0),
      is_staartkosten: r.is_staartkosten ?? false,
      opmerkingen: r.opmerkingen ?? "",
      regelnummer: r.regelnummer ?? "",
      hoofdstuk: r.hoofdstuk ?? "Overige werkzaamheden",
      klanttekst: r.klanttekst ?? "",
    });
    setRegelDialoog(r.id);
  }

  function openBewerkenHeader() {
    if (!data) return;
    setHeaderForm({
      naam: data.naam,
      referentie: data.referentie ?? "",
      klant_naam: data.klant_naam ?? "",
      project_naam: data.project_naam ?? "",
      status: data.status,
      omschrijving: data.omschrijving ?? "",
      opmerkingen: data.opmerkingen ?? "",
      opslag_ak: data.opslag_ak,
      opslag_abk: data.opslag_abk ?? 10,
      opslag_risico: data.opslag_risico,
      opslag_winst: data.opslag_winst,
      korting: data.korting,
    });
    setBewerkenDialoog(true);
  }

  function handleRegelOpslaan() {
    const hv = parseFloat(regelForm.hoeveelheid) || 0;
    const t  = parseFloat(regelForm.tarief) || 0;
    const mu = parseFloat(regelForm.mu_per_eenheid) || 0;
    const at = parseFloat(regelForm.arbeids_tarief) || 0;
    const ob = parseFloat(regelForm.onderaanneming_bedrag) || 0;
    const payload = {
      categorie: regelForm.categorie,
      omschrijving: regelForm.omschrijving,
      normtijd_id: regelForm.normtijd_id ? parseInt(regelForm.normtijd_id, 10) : null,
      eenheid: regelForm.eenheid,
      hoeveelheid: hv,
      tarief: t,
      mu_per_eenheid: mu,
      arbeids_tarief: at,
      onderaanneming_bedrag: ob,
      is_staartkosten: regelForm.is_staartkosten,
      opmerkingen: regelForm.opmerkingen || null,
      regelnummer: regelForm.regelnummer || null,
      hoofdstuk: regelForm.hoofdstuk || "Overige werkzaamheden",
      klanttekst: regelForm.klanttekst || null,
    };
    if (regelDialoog === "nieuw") {
      createRegelMut.mutate({ id, data: payload });
    } else if (typeof regelDialoog === "number") {
      updateRegelMut.mutate({ id, regelId: regelDialoog, data: payload });
    }
    setRegelDialoog(null);
  }

  function handleStatusWijzigen(nieuweStatus: string) {
    if (!data) return;
    updateMut.mutate({ id, data: { naam: data.naam, status: nieuweStatus } });
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Calculatie niet gevonden.
      </div>
    );
  }

  const regels: RegelRow[] = (data.regels ?? []) as RegelRow[];
  const directeRegels = regels.filter((r) => !r.is_staartkosten).sort((a, b) => a.volgorde - b.volgorde);
  const staartRegels  = regels.filter((r) => r.is_staartkosten).sort((a, b) => a.volgorde - b.volgorde);

  const subtotaalDirect = directeRegels.reduce((s, r) => s + r.totaal, 0);
  const subtotaalStaart = staartRegels.reduce((s, r) => s + r.totaal, 0);
  const subtotaal = subtotaalDirect + subtotaalStaart;

  const opslagAbk = data.opslag_abk ?? 10;
  const akBedrag     = subtotaal * (data.opslag_ak / 100);
  const abkBedrag    = subtotaal * (opslagAbk / 100);
  const risicoBedrag = subtotaal * (data.opslag_risico / 100);
  const winstBedrag  = subtotaal * (data.opslag_winst / 100);
  const voorKorting  = subtotaal + akBedrag + abkBedrag + risicoBedrag + winstBedrag;
  const kortingBedrag = voorKorting * (data.korting / 100);
  const totaal       = voorKorting - kortingBedrag;
  const totaalBtw    = totaal * 1.21;
  const marge        = totaal > 0 ? Math.round(((totaal - subtotaal) / totaal) * 100 * 10) / 10 : 0;

  const regelsByCategorie = Object.entries(CATEGORIE_LABEL).map(([cat, label]) => ({
    categorie: cat,
    label,
    regels: directeRegels.filter((r) => r.categorie === cat),
  })).filter((g) => g.regels.length > 0);

  const regelsByHoofdstuk = HOOFDSTUK_OPTIES.map((h) => ({
    hoofdstuk: h,
    regels: directeRegels.filter((r) => (r.hoofdstuk ?? "Overige werkzaamheden") === h),
  })).filter((g) => g.regels.length > 0);

  const volgendStatussen = STATUS_WORKFLOW[data.status] ?? [];

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Koptekst */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/modules/calculatie")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{data.naam}</h1>
              <Badge className={`text-xs border ${STATUS_KLEUR[data.status] ?? STATUS_KLEUR.concept}`}>
                {STATUS_LABEL[data.status] ?? data.status}
              </Badge>
            </div>
            {data.referentie && (
              <p className="text-sm text-muted-foreground">{data.referentie}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {volgendStatussen.map((s) => (
            <Button
              key={s}
              variant={s === "verloren" ? "outline" : "default"}
              size="sm"
              onClick={() => handleStatusWijzigen(s)}
            >
              {STATUS_LABEL[s]}
              {s !== "verloren" && <ChevronRight className="h-3.5 w-3.5 ml-1" />}
            </Button>
          ))}
          <Button
            size="sm"
            onClick={() => maakOfferteMut.mutate({ id })}
            disabled={maakOfferteMut.isPending}
          >
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            {maakOfferteMut.isPending ? "Bezig..." : "Maak offerte"}
          </Button>
          <Button variant="outline" size="sm" onClick={openBewerkenHeader}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Bewerken
          </Button>
          <Button variant="outline" size="sm" onClick={() => dupliceerMut.mutate({ id })}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Dupliceren
          </Button>
          <Button variant="outline" size="sm" onClick={() => setVersieOpslaanDialoog(true)}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Versie opslaan
          </Button>
          <Button variant="outline" size="sm" onClick={() => setVersieDialoog(true)}>
            <History className="h-3.5 w-3.5 mr-1.5" />
            Versies
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => window.open(`/modules/calculatie/${id}/print`, "_blank")}
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Afdrukken
          </Button>
          <Button
            variant="outline" size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setTeVerwijderen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-5">
        {/* Hoofdinhoud */}
        <div className="col-span-3 space-y-5">
          {/* Projectgegevens */}
          <Card>
            <CardContent className="pt-5">
              <div className="grid grid-cols-4 gap-4 text-sm">
                {data.klant_naam && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Klant</p>
                    <p className="font-medium">{data.klant_naam}</p>
                  </div>
                )}
                {data.project_naam && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Project</p>
                    <p className="font-medium">{data.project_naam}</p>
                  </div>
                )}
                {data.gebouw_naam && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Gebouw</p>
                    <p className="font-medium">{data.gebouw_naam}</p>
                  </div>
                )}
                {data.aangemaakt_door_naam && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Calculator</p>
                    <p className="font-medium">{data.aangemaakt_door_naam}</p>
                  </div>
                )}
              </div>
              {data.omschrijving && (
                <p className="text-sm text-muted-foreground mt-3 pt-3 border-t">{data.omschrijving}</p>
              )}
            </CardContent>
          </Card>

          {/* Calculatieregels */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Calculatieregels</CardTitle>
                <div className="flex items-center gap-3">
                  {/* Weergave toggle */}
                  <div className="flex rounded-md border overflow-hidden text-xs">
                    {(["intern", "directie", "klant", "monteur"] as Weergave[]).map((v) => (
                      <button
                        key={v}
                        onClick={() => setWeergave(v)}
                        className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
                          weergave === v
                            ? "bg-slate-900 text-white"
                            : "bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {v === "intern" && <LayoutList className="h-3 w-3" />}
                        {v === "directie" && <Eye className="h-3 w-3" />}
                        {v === "klant" && <Users className="h-3 w-3" />}
                        {v === "monteur" && <Wrench className="h-3 w-3" />}
                        {v === "intern" ? "Intern" : v === "directie" ? "Directie" : v === "klant" ? "Klant" : "Monteur"}
                      </button>
                    ))}
                  </div>
                  <Button size="sm" onClick={() => openNieuweRegel(false)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Regel toevoegen
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {regels.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <p className="text-sm">Nog geen regels toegevoegd.</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => openNieuweRegel(false)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Eerste regel toevoegen
                  </Button>
                </div>
              ) : weergave === "intern" ? (
                <InternView
                  regelsByHoofdstuk={regelsByHoofdstuk}
                  staartRegels={staartRegels}
                  onBewerken={openBewerkenRegel}
                  onVerwijderen={(r) => deleteRegelMut.mutate({ id, regelId: r.id })}
                  onNieuweStaart={() => openNieuweRegel(true)}
                />
              ) : weergave === "directie" ? (
                <DirectieView
                  regelsByCategorie={regelsByCategorie}
                  staartRegels={staartRegels}
                  subtotaal={subtotaal}
                  subtotaalStaart={subtotaalStaart}
                  akBedrag={akBedrag}
                  abkBedrag={abkBedrag}
                  risicoBedrag={risicoBedrag}
                  winstBedrag={winstBedrag}
                  kortingBedrag={kortingBedrag}
                  totaal={totaal}
                  marge={marge}
                  opslagAk={data.opslag_ak}
                  opslagAbk={opslagAbk}
                  opslagRisico={data.opslag_risico}
                  opslagWinst={data.opslag_winst}
                  korting={data.korting}
                />
              ) : weergave === "klant" ? (
                <KlantView
                  regels={regels}
                  totaal={totaal}
                  totaalBtw={totaalBtw}
                />
              ) : (
                <MonteurView regels={directeRegels} staartRegels={staartRegels} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Rechterpaneel */}
        <div className="space-y-4">

          {/* AI-voorstel paneel */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  AI-voorstel
                </CardTitle>
                {aiPaneel && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAiPaneel(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!aiPaneel ? (
                <Button variant="outline" className="w-full" size="sm"
                  onClick={() => aiMut.mutate({ id })} disabled={aiMut.isPending}>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  {aiMut.isPending ? "Analyseren..." : "Genereer AI-voorstel"}
                </Button>
              ) : (
                <div className="space-y-3">
                  {aiWaarschuwingen.length > 0 && (
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs space-y-1">
                      {aiWaarschuwingen.map((w, i) => (
                        <p key={i} className="text-amber-700">{w}</p>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">{aiVoorstellen.length} regels voorgesteld — klik op een regel om toe te voegen.</p>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {aiVoorstellen.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded border text-xs hover:bg-slate-50 group">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 leading-tight">{r.omschrijving}</p>
                          <p className="text-muted-foreground mt-0.5">{r.hoofdstuk}</p>
                          <p className="text-muted-foreground">{r.hoeveelheid} {r.eenheid} · {CATEGORIE_LABEL[r.categorie] ?? r.categorie}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Toevoegen aan calculatie"
                          onClick={() => createRegelMut.mutate({ id, data: {
                            categorie: r.categorie,
                            omschrijving: r.omschrijving,
                            eenheid: r.eenheid,
                            hoeveelheid: parseFloat(r.hoeveelheid) || 1,
                            tarief: parseFloat(r.tarief) || 0,
                            mu_per_eenheid: parseFloat(r.mu_per_eenheid) || 0,
                            arbeids_tarief: parseFloat(r.arbeids_tarief) || 0,
                            onderaanneming_bedrag: parseFloat(r.onderaanneming_bedrag) || 0,
                            is_staartkosten: r.is_staartkosten,
                            hoofdstuk: r.hoofdstuk,
                            klanttekst: r.klanttekst || null,
                          } })}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" className="w-full text-xs"
                    onClick={() => aiMut.mutate({ id })} disabled={aiMut.isPending}>
                    <Sparkles className="h-3 w-3 mr-1" />
                    Opnieuw genereren
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Opslagen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              {[
                { label: "AK", pct: data.opslag_ak, bedrag: akBedrag },
                { label: "ABK", pct: opslagAbk, bedrag: abkBedrag },
                { label: "Risico", pct: data.opslag_risico, bedrag: risicoBedrag },
                { label: "Winst", pct: data.opslag_winst, bedrag: winstBedrag },
              ].map(({ label, pct, bedrag }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-muted-foreground">{label} ({pct}%)</span>
                  <span className="tabular-nums">{formatBedrag(bedrag)}</span>
                </div>
              ))}
              {data.korting > 0 && (
                <div className="flex justify-between items-center text-green-700">
                  <span>Korting ({data.korting}%)</span>
                  <span className="tabular-nums">- {formatBedrag(kortingBedrag)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-300">
            <CardContent className="pt-5 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Directe kosten</span>
                <span className="tabular-nums">{formatBedrag(subtotaalDirect)}</span>
              </div>
              {subtotaalStaart > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Staartkosten</span>
                  <span className="tabular-nums">{formatBedrag(subtotaalStaart)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Opslagen</span>
                <span className="tabular-nums">{formatBedrag(akBedrag + abkBedrag + risicoBedrag + winstBedrag - kortingBedrag)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold text-base">
                <span>Totaal excl. BTW</span>
                <span className="tabular-nums">{formatBedrag(totaal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>BTW (21%)</span>
                <span className="tabular-nums">{formatBedrag(totaalBtw - totaal)}</span>
              </div>
              <div className="flex justify-between font-semibold text-primary">
                <span>Totaal incl. BTW</span>
                <span className="tabular-nums">{formatBedragKort(totaalBtw)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
                <span>Marge</span>
                <span>{marge}%</span>
              </div>
            </CardContent>
          </Card>

          {data.opmerkingen && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Opmerkingen</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{data.opmerkingen}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Regelsdialoog */}
      <Dialog open={regelDialoog !== null} onOpenChange={() => setRegelDialoog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {regelDialoog === "nieuw"
                ? regelForm.is_staartkosten ? "Staartkostenregel toevoegen" : "Calculatieregel toevoegen"
                : "Regel bewerken"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categorie</Label>
                <Select
                  value={regelForm.categorie}
                  onValueChange={(v) => setRegelForm((f) => ({ ...f, categorie: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIE_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Normtijd (optioneel)</Label>
                <Select value={regelForm.normtijd_id} onValueChange={(v) => {
                  if (!v || v === "__geen__") { setRegelForm((f) => ({ ...f, normtijd_id: "" })); return; }
                  const nt = normtijden.find((n) => String(n.id) === v);
                  if (nt) setRegelForm((f) => ({
                    ...f, normtijd_id: v,
                    omschrijving: f.omschrijving || nt.omschrijving,
                    eenheid: nt.eenheid,
                    mu_per_eenheid: String(nt.uren_per_eenheid),
                  }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Kies normtijd..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__geen__">Geen normtijd</SelectItem>
                    {normtijden.map((n) => (
                      <SelectItem key={n.id} value={String(n.id)}>
                        {n.code} — {n.omschrijving}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Omschrijving *</Label>
                <Input
                  value={regelForm.omschrijving}
                  onChange={(e) => setRegelForm((f) => ({ ...f, omschrijving: e.target.value }))}
                  placeholder="Beschrijving van de werkzaamheid of het materiaal"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Regelnummer</Label>
                <Input
                  value={regelForm.regelnummer}
                  onChange={(e) => setRegelForm((f) => ({ ...f, regelnummer: e.target.value }))}
                  placeholder="bijv. 1.17"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Eenheid</Label>
                <Select
                  value={regelForm.eenheid}
                  onValueChange={(v) => setRegelForm((f) => ({ ...f, eenheid: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EENHEDEN.map((e) => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Hoeveelheid</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={regelForm.hoeveelheid}
                  onChange={(e) => setRegelForm((f) => ({ ...f, hoeveelheid: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Materiaalprijs (€/eenheid)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={regelForm.tarief}
                  onChange={(e) => setRegelForm((f) => ({ ...f, tarief: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>MU per eenheid (uur)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={regelForm.mu_per_eenheid}
                  onChange={(e) => setRegelForm((f) => ({ ...f, mu_per_eenheid: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Arbeidstarief (€/uur)</Label>
                <Select
                  value=""
                  onValueChange={(v) => {
                    const tar = tarieven.find((t) => String(t.id) === v);
                    if (tar) setRegelForm((f) => ({ ...f, arbeids_tarief: String(tar.tarief) }));
                  }}
                >
                  <SelectTrigger className="mb-1"><SelectValue placeholder="Kies tarief..." /></SelectTrigger>
                  <SelectContent>
                    {tarieven.filter((t) => t.categorie === "arbeid").map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.naam} — {formatBedrag(t.tarief)}/{t.eenheid}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number" step="0.01" min="0"
                  value={regelForm.arbeids_tarief}
                  onChange={(e) => setRegelForm((f) => ({ ...f, arbeids_tarief: e.target.value }))}
                  placeholder="Handmatig invullen"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Onderaanneming (€)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={regelForm.onderaanneming_bedrag}
                  onChange={(e) => setRegelForm((f) => ({ ...f, onderaanneming_bedrag: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
            </div>

            {/* Live totaalberekening */}
            {(() => {
              const hv = parseFloat(regelForm.hoeveelheid) || 0;
              const t  = parseFloat(regelForm.tarief) || 0;
              const mu = parseFloat(regelForm.mu_per_eenheid) || 0;
              const at = parseFloat(regelForm.arbeids_tarief) || 0;
              const ob = parseFloat(regelForm.onderaanneming_bedrag) || 0;
              const matTotaal = hv * t;
              const muTot     = hv * mu;
              const arbeid    = muTot * at;
              const totaal    = matTotaal + arbeid + ob;
              if (totaal === 0) return null;
              return (
                <div className="rounded-md bg-slate-50 border px-4 py-3 text-sm grid grid-cols-4 gap-2">
                  {matTotaal > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Materiaal</p>
                      <p className="font-medium">{formatBedrag(matTotaal)}</p>
                    </div>
                  )}
                  {arbeid > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Arbeid ({fmt2(muTot)} MU)</p>
                      <p className="font-medium">{formatBedrag(arbeid)}</p>
                    </div>
                  )}
                  {ob > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Onderaanneming</p>
                      <p className="font-medium">{formatBedrag(ob)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Regeltotaal</p>
                    <p className="font-semibold text-base">{formatBedrag(totaal)}</p>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Hoofdstuk</Label>
                <Select
                  value={regelForm.hoofdstuk || "Overige werkzaamheden"}
                  onValueChange={(v) => setRegelForm((f) => ({ ...f, hoofdstuk: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HOOFDSTUK_OPTIES.map((h) => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Opmerkingen</Label>
                <Input
                  value={regelForm.opmerkingen}
                  onChange={(e) => setRegelForm((f) => ({ ...f, opmerkingen: e.target.value }))}
                  placeholder="Interne notitie bij deze regel"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Klanttekst</Label>
              <Input
                value={regelForm.klanttekst ?? ""}
                onChange={(e) => setRegelForm((f) => ({ ...f, klanttekst: e.target.value }))}
                placeholder="Tekst die zichtbaar is voor de klant in de offerte"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegelDialoog(null)}>Annuleren</Button>
            <Button
              onClick={handleRegelOpslaan}
              disabled={!regelForm.omschrijving.trim() || createRegelMut.isPending || updateRegelMut.isPending}
            >
              {regelDialoog === "nieuw" ? "Toevoegen" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bewerken header dialoog */}
      <Dialog open={bewerkenDialoog} onOpenChange={setBewerkenDialoog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Calculatie bewerken</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <Input value={headerForm.naam} onChange={(e) => setHeaderForm((f) => ({ ...f, naam: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Referentie</Label>
                <Input value={headerForm.referentie} onChange={(e) => setHeaderForm((f) => ({ ...f, referentie: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={headerForm.status} onValueChange={(v) => setHeaderForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Klant</Label>
                <Input value={headerForm.klant_naam} onChange={(e) => setHeaderForm((f) => ({ ...f, klant_naam: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Input value={headerForm.project_naam} onChange={(e) => setHeaderForm((f) => ({ ...f, project_naam: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Textarea rows={2} value={headerForm.omschrijving} onChange={(e) => setHeaderForm((f) => ({ ...f, omschrijving: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Opmerkingen (intern)</Label>
              <Textarea rows={2} value={headerForm.opmerkingen} onChange={(e) => setHeaderForm((f) => ({ ...f, opmerkingen: e.target.value }))} />
            </div>
            <p className="text-xs font-medium text-muted-foreground pt-1">Opslagen (%)</p>
            <div className="grid grid-cols-5 gap-2">
              {[
                { field: "opslag_ak",     label: "AK" },
                { field: "opslag_abk",    label: "ABK" },
                { field: "opslag_risico", label: "Risico" },
                { field: "opslag_winst",  label: "Winst" },
                { field: "korting",       label: "Korting" },
              ].map(({ field, label }) => (
                <div key={field} className="space-y-1.5">
                  <Label className="text-xs">{label} (%)</Label>
                  <Input
                    type="number" step="0.5" min="0" max="100"
                    value={headerForm[field as keyof typeof headerForm]}
                    onChange={(e) => setHeaderForm((f) => ({ ...f, [field]: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBewerkenDialoog(false)}>Annuleren</Button>
            <Button
              onClick={() => {
                updateMut.mutate({ id, data: { ...headerForm } });
                setBewerkenDialoog(false);
              }}
              disabled={!headerForm.naam.trim()}
            >
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verwijder bevestiging */}
      <AlertDialog open={teVerwijderen} onOpenChange={setTeVerwijderen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Calculatie verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet u zeker dat u deze calculatie en alle regels wilt verwijderen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMut.mutate({ id })}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Versie opslaan dialoog ── */}
      <Dialog open={versieOpslaanDialoog} onOpenChange={(o) => !o && setVersieOpslaanDialoog(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Versie opslaan</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Sla de huidige staat van de calculatie op als versie. U kunt later versies vergelijken.
            </p>
            <div className="space-y-1.5">
              <Label>Label (optioneel)</Label>
              <Input
                value={versieLabel}
                onChange={(e) => setVersieLabel(e.target.value)}
                placeholder="Bijv. Versie na klantoverleg"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVersieOpslaanDialoog(false)}>Annuleren</Button>
            <Button onClick={handleVersieOpslaan} disabled={versieOpslaanBezig}>
              <Save className="h-4 w-4 mr-1.5" />
              {versieOpslaanBezig ? "Opslaan..." : "Opslaan als versie"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Versiegeschiedenis dialoog ── */}
      <Dialog open={versieDialoog} onOpenChange={setVersieDialoog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Versiegeschiedenis</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {!versieData || versieData.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Nog geen versies opgeslagen. Klik op "Versie opslaan" om de huidige staat vast te leggen.
              </div>
            ) : (
              <div className="space-y-2">
                {versieData.map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-3 rounded-lg border bg-slate-50">
                    <div>
                      <p className="font-medium text-sm">{v.label ?? `Versie ${v.versienummer}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(v.aangemaakt_op).toLocaleString("nl-NL", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground bg-white border rounded px-2 py-0.5">
                        v{v.versienummer}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 pt-3 border-t">
              <Button size="sm" onClick={() => { setVersieDialoog(false); setVersieOpslaanDialoog(true); }}>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Nieuwe versie opslaan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Monteur view ─────────────────────────────────────────────────────────────

function MonteurView({ regels, staartRegels }: { regels: RegelRow[]; staartRegels: RegelRow[] }) {
  const alleRegels = [...regels, ...staartRegels];
  const byHoofdstuk = HOOFDSTUK_OPTIES.map((h) => ({
    hoofdstuk: h,
    regels: alleRegels.filter((r) => (r.hoofdstuk ?? "Overige werkzaamheden") === h),
  })).filter((g) => g.regels.length > 0);

  return (
    <div className="divide-y">
      {byHoofdstuk.map(({ hoofdstuk, regels: hRegels }) => {
        const totalMu = hRegels.reduce((s, r) => s + r.mu_totaal, 0);
        return (
          <div key={hoofdstuk}>
            <div className="px-4 py-2 bg-slate-50 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">{hoofdstuk}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{fmt2(totalMu)} MU</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-4 py-1.5 text-left font-normal">Omschrijving</th>
                    <th className="px-2 py-1.5 text-center font-normal w-[8%]">EH</th>
                    <th className="px-2 py-1.5 text-right font-normal w-[8%]">Aantal</th>
                    <th className="px-2 py-1.5 text-right font-normal w-[10%]">MU totaal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {hRegels.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <p className="font-medium text-slate-800">{r.omschrijving}</p>
                        {r.klanttekst && <p className="text-muted-foreground mt-0.5">{r.klanttekst}</p>}
                        {r.normtijd_code && <p className="text-muted-foreground">{r.normtijd_code}</p>}
                      </td>
                      <td className="px-2 py-2 text-center text-muted-foreground">{r.eenheid}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.hoeveelheid}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">{r.mu_totaal > 0 ? fmt2(r.mu_totaal) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {alleRegels.length === 0 && (
        <p className="text-xs text-muted-foreground px-4 py-6 text-center">Geen regels gevonden.</p>
      )}
    </div>
  );
}

// ── Intern view ─────────────────────────────────────────────────────────────

function InternView({
  regelsByHoofdstuk,
  staartRegels,
  onBewerken,
  onVerwijderen,
  onNieuweStaart,
}: {
  regelsByHoofdstuk: Array<{ hoofdstuk: string; regels: RegelRow[] }>;
  staartRegels: RegelRow[];
  onBewerken: (r: RegelRow) => void;
  onVerwijderen: (r: RegelRow) => void;
  onNieuweStaart: () => void;
}) {
  return (
    <div>
      {regelsByHoofdstuk.map(({ hoofdstuk, regels: hRegels }) => (
        <div key={hoofdstuk}>
          <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide bg-slate-100 text-slate-700">
            {hoofdstuk}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-4 py-1.5 text-left font-normal w-[22%]">Omschrijving</th>
                  <th className="px-2 py-1.5 text-center font-normal w-[5%]">EH</th>
                  <th className="px-2 py-1.5 text-right font-normal w-[6%]">Aantal</th>
                  <th className="px-2 py-1.5 text-right font-normal w-[8%]">Mat.prijs</th>
                  <th className="px-2 py-1.5 text-right font-normal w-[8%]">Materiaal</th>
                  <th className="px-2 py-1.5 text-right font-normal w-[7%]">MU/EH</th>
                  <th className="px-2 py-1.5 text-right font-normal w-[7%]">MU totaal</th>
                  <th className="px-2 py-1.5 text-right font-normal w-[8%]">Arbeid</th>
                  <th className="px-2 py-1.5 text-right font-normal w-[8%]">Ondernm.</th>
                  <th className="px-2 py-1.5 text-right font-normal w-[8%]">Totaal</th>
                  <th className="px-2 py-1.5 w-[8%]" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {hRegels.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 group">
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-800">{r.omschrijving}</p>
                      {r.regelnummer && <p className="text-muted-foreground">{r.regelnummer}</p>}
                      {r.normtijd_code && <p className="text-muted-foreground">{r.normtijd_code}</p>}
                    </td>
                    <td className="px-2 py-2 text-center text-muted-foreground">{r.eenheid}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.hoeveelheid}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.tarief > 0 ? formatBedrag(r.tarief) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.materiaal_totaal > 0 ? formatBedrag(r.materiaal_totaal) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.mu_per_eenheid > 0 ? fmt2(r.mu_per_eenheid) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.mu_totaal > 0 ? fmt2(r.mu_totaal) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.arbeidsloon > 0 ? formatBedrag(r.arbeidsloon) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.onderaanneming_bedrag > 0 ? formatBedrag(r.onderaanneming_bedrag) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">{formatBedrag(r.totaal)}</td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onBewerken(r)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onVerwijderen(r)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Staartkosten */}
      <div className="border-t mt-1">
        <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Staartkosten</span>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onNieuweStaart}>
            <Plus className="h-3 w-3 mr-1" />
            Staartkost toevoegen
          </Button>
        </div>
        {staartRegels.length === 0 ? (
          <p className="text-xs text-muted-foreground px-4 py-3">
            Geen staartkosten — projectleiding, transport, steiger, schaftwagen, enz.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <tbody className="divide-y">
                {staartRegels.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 group">
                    <td className="px-4 py-2 w-[22%]">
                      <p className="font-medium text-slate-800">{r.omschrijving}</p>
                      {r.regelnummer && <p className="text-muted-foreground">{r.regelnummer}</p>}
                    </td>
                    <td className="px-2 py-2 text-center text-muted-foreground w-[5%]">{r.eenheid}</td>
                    <td className="px-2 py-2 text-right tabular-nums w-[6%]">{r.hoeveelheid}</td>
                    <td className="px-2 py-2 text-right tabular-nums w-[8%]">{r.tarief > 0 ? formatBedrag(r.tarief) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums w-[8%]">{r.materiaal_totaal > 0 ? formatBedrag(r.materiaal_totaal) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums w-[7%]">{r.mu_per_eenheid > 0 ? fmt2(r.mu_per_eenheid) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums w-[7%]">{r.mu_totaal > 0 ? fmt2(r.mu_totaal) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums w-[8%]">{r.arbeidsloon > 0 ? formatBedrag(r.arbeidsloon) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums w-[8%]">{r.onderaanneming_bedrag > 0 ? formatBedrag(r.onderaanneming_bedrag) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium w-[8%]">{formatBedrag(r.totaal)}</td>
                    <td className="px-2 py-2 text-right w-[8%]">
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onBewerken(r)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onVerwijderen(r)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Directie view ────────────────────────────────────────────────────────────

function DirectieView({
  regelsByCategorie,
  staartRegels,
  subtotaal,
  subtotaalStaart,
  akBedrag, abkBedrag, risicoBedrag, winstBedrag, kortingBedrag,
  totaal, marge,
  opslagAk, opslagAbk, opslagRisico, opslagWinst, korting,
}: {
  regelsByCategorie: Array<{ categorie: string; label: string; regels: RegelRow[] }>;
  staartRegels: RegelRow[];
  subtotaal: number; subtotaalStaart: number;
  akBedrag: number; abkBedrag: number; risicoBedrag: number; winstBedrag: number; kortingBedrag: number;
  totaal: number; marge: number;
  opslagAk: number; opslagAbk: number; opslagRisico: number; opslagWinst: number; korting: number;
}) {
  return (
    <div className="p-5 space-y-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Kostprijsoverzicht — vertrouwelijk
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y">
          {regelsByCategorie.map(({ categorie, label, regels }) => {
            const cat_totaal = regels.reduce((s, r) => s + r.totaal, 0);
            const mat = regels.reduce((s, r) => s + (r.materiaal_totaal ?? 0), 0);
            const arb = regels.reduce((s, r) => s + (r.arbeidsloon ?? 0), 0);
            const ond = regels.reduce((s, r) => s + (r.onderaanneming_bedrag ?? 0), 0);
            const mu  = regels.reduce((s, r) => s + (r.mu_totaal ?? 0), 0);
            return (
              <tr key={categorie} className="hover:bg-slate-50">
                <td className="py-2 text-slate-700 font-medium w-1/3">{label}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground text-xs">
                  {mu > 0 && `${fmt2(mu)} MU`}
                </td>
                <td className="py-2 text-right tabular-nums text-muted-foreground text-xs">
                  {mat > 0 && `mat ${formatBedrag(mat)}`}
                </td>
                <td className="py-2 text-right tabular-nums text-muted-foreground text-xs">
                  {arb > 0 && `arb ${formatBedrag(arb)}`}
                </td>
                <td className="py-2 text-right tabular-nums text-muted-foreground text-xs">
                  {ond > 0 && `ond ${formatBedrag(ond)}`}
                </td>
                <td className="py-2 pl-4 text-right tabular-nums font-medium">{formatBedrag(cat_totaal)}</td>
              </tr>
            );
          })}
          {subtotaalStaart > 0 && (
            <tr className="hover:bg-slate-50">
              <td className="py-2 text-slate-700 font-medium">Staartkosten</td>
              <td colSpan={4} />
              <td className="py-2 pl-4 text-right tabular-nums font-medium">{formatBedrag(subtotaalStaart)}</td>
            </tr>
          )}
          <tr className="font-semibold">
            <td className="py-2 text-slate-900">Subtotaal directe kosten</td>
            <td colSpan={4} />
            <td className="py-2 pl-4 text-right tabular-nums">{formatBedrag(subtotaal)}</td>
          </tr>
          {[
            { label: `AK (${opslagAk}%)`, bedrag: akBedrag },
            { label: `ABK (${opslagAbk}%)`, bedrag: abkBedrag },
            { label: `Risico (${opslagRisico}%)`, bedrag: risicoBedrag },
            { label: `Winst (${opslagWinst}%)`, bedrag: winstBedrag },
          ].map(({ label, bedrag }) => (
            <tr key={label} className="text-muted-foreground">
              <td className="py-1.5 pl-3">+ {label}</td>
              <td colSpan={4} />
              <td className="py-1.5 pl-4 text-right tabular-nums">{formatBedrag(bedrag)}</td>
            </tr>
          ))}
          {korting > 0 && (
            <tr className="text-green-700">
              <td className="py-1.5 pl-3">- Korting ({korting}%)</td>
              <td colSpan={4} />
              <td className="py-1.5 pl-4 text-right tabular-nums">- {formatBedrag(kortingBedrag)}</td>
            </tr>
          )}
          <tr className="font-bold text-base border-t-2">
            <td className="py-3">Verkoopprijs excl. BTW</td>
            <td colSpan={4} />
            <td className="py-3 pl-4 text-right tabular-nums text-primary">{formatBedrag(totaal)}</td>
          </tr>
        </tbody>
      </table>
      <div className="flex justify-end">
        <div className="rounded-md bg-slate-50 border px-5 py-3 text-sm">
          <span className="text-muted-foreground">Marge: </span>
          <span className="font-semibold">{marge}%</span>
        </div>
      </div>
    </div>
  );
}

// ── Klant view ────────────────────────────────────────────────────────────────

function KlantView({
  regels,
  totaal,
  totaalBtw,
}: {
  regels: RegelRow[];
  totaal: number;
  totaalBtw: number;
}) {
  const zichtbaar = regels.filter((r) => !r.is_staartkosten);
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-6 py-2 text-left font-normal">Omschrijving</th>
            <th className="px-3 py-2 text-center font-normal">Eenheid</th>
            <th className="px-3 py-2 text-right font-normal">Aantal</th>
            <th className="px-3 py-2 text-right font-normal">Bedrag</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {zichtbaar.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-6 py-2.5">
                <p className="font-medium text-slate-800">{r.omschrijving}</p>
                {r.regelnummer && <p className="text-xs text-muted-foreground">{r.regelnummer}</p>}
              </td>
              <td className="px-3 py-2.5 text-center text-muted-foreground">{r.eenheid}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.hoeveelheid}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatBedrag(r.totaal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t px-6 py-4 space-y-1.5 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotaal werkzaamheden</span>
          <span className="tabular-nums">{formatBedrag(zichtbaar.reduce((s, r) => s + r.totaal, 0))}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Opslagen en beheerkosten</span>
          <span className="tabular-nums">{formatBedrag(totaal - zichtbaar.reduce((s, r) => s + r.totaal, 0))}</span>
        </div>
        <Separator className="my-1" />
        <div className="flex justify-between font-semibold">
          <span>Totaal excl. BTW</span>
          <span className="tabular-nums">{formatBedrag(totaal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>BTW (21%)</span>
          <span className="tabular-nums">{formatBedrag(totaalBtw - totaal)}</span>
        </div>
        <div className="flex justify-between font-bold text-base">
          <span>Totaal incl. BTW</span>
          <span className="tabular-nums">{formatBedrag(totaalBtw)}</span>
        </div>
      </div>
    </div>
  );
}

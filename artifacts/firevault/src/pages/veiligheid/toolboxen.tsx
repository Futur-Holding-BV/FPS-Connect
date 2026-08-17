import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVeiligheidToolboxen,
  usePostVeiligheidToolboxen,
  useGetVeiligheidToolboxenId,
  usePatchVeiligheidToolboxenId,
  useDeleteVeiligheidToolboxenId,
  usePostVeiligheidToolboxenIdPubliceren,
  usePostVeiligheidToolboxenIdAiAnalyse,
  useGetVeiligheidToolboxenIdAfrondingen,
  getGetVeiligheidToolboxenQueryKey,
  getGetVeiligheidToolboxenIdQueryKey,
  useListToolboxMaandopdrachten,
  useCreateToolboxMaandopdracht,
  useDeleteToolboxMaandopdracht,
  useGetToolboxMaandopdrachtVoortgang,
  getListToolboxMaandopdrachtenQueryKey,
  useAiBatchGenereerToolboxen,
  useReviewToolboxOnderwerpPatch,
  type VeiligheidToolbox,
  type VeiligheidToolboxInput,
  type VeiligheidToolboxDetail,
  type ToolboxMaandopdracht,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { PaginaHulp } from "@/components/pagina-hulp";
import {
  ShieldCheck, Plus, Trash2, Sparkles, Upload, FileText,
  CheckCircle, Clock, AlertTriangle, Loader2, ChevronRight,
  BookOpen, Send, Users, X, Play, ExternalLink, Calendar,
  BarChart2, Shield, Bot, ThumbsUp, ThumbsDown,
} from "lucide-react";

const CATEGORIEEN: { value: string; label: string }[] = [
  { value: "brandveiligheid", label: "Brandveiligheid" },
  { value: "werken_op_hoogte", label: "Werken op hoogte" },
  { value: "pbm", label: "PBM" },
  { value: "elektrisch", label: "Elektrisch" },
  { value: "bouwplaats", label: "Bouwplaats" },
  { value: "gezondheid", label: "Gezondheid" },
  { value: "milieu", label: "Milieu" },
  { value: "machines", label: "Machines" },
  { value: "overig", label: "Overig" },
];

const MOEILIJKHEID: { value: string; label: string }[] = [
  { value: "eenvoudig", label: "Eenvoudig" },
  { value: "gemiddeld", label: "Gemiddeld" },
  { value: "gevorderd", label: "Gevorderd" },
];

const STATUS_KLEUR: Record<string, string> = {
  gepubliceerd: "bg-emerald-100 text-emerald-800 border-emerald-200",
  concept: "bg-amber-100 text-amber-800 border-amber-200",
  verlopen: "bg-red-100 text-red-800 border-red-200",
};

const MAANDEN_LANG = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

const CATEGORIE_ACCENT: Record<string, string> = {
  brandveiligheid: "border-l-red-500",
  werken_op_hoogte: "border-l-yellow-500",
  pbm: "border-l-green-500",
  elektrisch: "border-l-yellow-400",
  bouwplaats: "border-l-orange-500",
  gezondheid: "border-l-emerald-500",
  milieu: "border-l-teal-500",
  machines: "border-l-slate-400",
  overig: "border-l-gray-300",
};

const MOEILIJKHEID_DOT: Record<string, string> = {
  eenvoudig: "bg-emerald-500",
  gemiddeld: "bg-amber-500",
  gevorderd: "bg-red-500",
};

function embedVideoUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

function categorieLabel(cat: string) {
  return CATEGORIEEN.find((c) => c.value === cat)?.label ?? cat;
}

const LEEG: VeiligheidToolboxInput = {
  titel: "",
  categorie: "overig",
  moeilijkheid: "gemiddeld",
  gepubliceerd: false,
  verplicht: false,
  doelgroep: "iedereen",
  min_score: 70,
  geldigheid_maanden: 12,
  tags: [],
};

// ── ToolboxKaart ──────────────────────────────────────────────────────────────

function ToolboxKaart({
  t,
  kanSchrijven,
  onDetail,
  onVerwijder,
}: {
  t: VeiligheidToolbox;
  kanSchrijven: boolean;
  onDetail: () => void;
  onVerwijder: () => void;
}) {
  const mijnAfronding = t.mijn_afronding;
  const geslaagd = mijnAfronding?.geslaagd === true;
  const afgerond = mijnAfronding != null;
  const accentKleur = CATEGORIE_ACCENT[t.categorie] ?? "border-l-gray-300";
  const dotKleur = MOEILIJKHEID_DOT[t.moeilijkheid] ?? "bg-gray-400";
  const moeilijkheidLabel = MOEILIJKHEID.find((m) => m.value === t.moeilijkheid)?.label ?? t.moeilijkheid;

  return (
    <Card
      className={`group cursor-pointer border-l-4 ${accentKleur} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}
      onClick={onDetail}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-1.5">

            {/* Rij 1: categorie + moeilijkheid */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">{categorieLabel(t.categorie)}</span>
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotKleur}`} />
              <span className="text-xs text-muted-foreground">{moeilijkheidLabel}</span>
            </div>

            {/* Rij 2: titel + status-badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold leading-snug">{t.titel}</span>
              <Badge variant="outline" className={t.gepubliceerd ? STATUS_KLEUR["gepubliceerd"] : STATUS_KLEUR["concept"]}>
                {t.gepubliceerd
                  ? <><CheckCircle className="h-3 w-3 mr-1" />Gepubliceerd</>
                  : <><Clock className="h-3 w-3 mr-1" />Concept</>}
              </Badge>
              {t.verplicht && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">
                  <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                  Verplicht
                </Badge>
              )}
              {afgerond && (
                <Badge variant="outline" className={geslaagd
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                  : "bg-orange-50 text-orange-700 border-orange-200 text-[10px]"}>
                  {geslaagd ? <><CheckCircle className="h-2.5 w-2.5 mr-1" />Afgerond</> : "Niet geslaagd"}
                </Badge>
              )}
            </div>

            {/* Rij 3: media + meta */}
            <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
              {t.heeft_pdf && (
                <span className="flex items-center gap-1 font-medium text-amber-700">
                  <FileText className="h-3 w-3" />
                  PDF
                </span>
              )}
              {t.heeft_video && (
                <span className="flex items-center gap-1 font-medium text-blue-700">
                  <Play className="h-3 w-3" />
                  Video
                </span>
              )}
              {t.geschatte_leestijd && (
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3 w-3" />
                  {t.geschatte_leestijd} min
                </span>
              )}
              {(t.afronding_count ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {t.afronding_count} afgerond
                </span>
              )}
              {t.ai_verwerkt_op && (
                <span className="flex items-center gap-1 text-amber-600">
                  <Sparkles className="h-3 w-3" />
                  AI
                </span>
              )}
            </div>

            {/* Rij 4: tags */}
            {(t.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {(t.tags as string[]).slice(0, 5).map((tag) => (
                  <span key={tag} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{tag}</span>
                ))}
              </div>
            )}
          </div>

          {/* Knoppen */}
          <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity duration-200">
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onDetail(); }} title="Bekijken">
              <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Button>
            {kanSchrijven && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); onVerwijder(); }}
                title="Verwijderen"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── QuizBouwer (in edit dialog) ───────────────────────────────────────────────

type VraagInput = { vraag: string; opties: { tekst: string; correct: boolean }[]; uitleg: string };

function QuizBouwer({
  vragen,
  onChange,
}: {
  vragen: VraagInput[];
  onChange: (v: VraagInput[]) => void;
}) {
  function voegVraagToe() {
    onChange([
      ...vragen,
      { vraag: "", opties: [{ tekst: "", correct: true }, { tekst: "", correct: false }, { tekst: "", correct: false }], uitleg: "" },
    ]);
  }

  function updateVraag(i: number, v: Partial<VraagInput>) {
    const kopie = [...vragen];
    kopie[i] = { ...kopie[i], ...v };
    onChange(kopie);
  }

  function updateOptie(vi: number, oi: number, tekst: string) {
    const kopie = [...vragen];
    kopie[vi].opties[oi] = { ...kopie[vi].opties[oi], tekst };
    onChange(kopie);
  }

  function setJuistAntwoord(vi: number, oi: number) {
    const kopie = [...vragen];
    kopie[vi].opties = kopie[vi].opties.map((o, i) => ({ ...o, correct: i === oi }));
    onChange(kopie);
  }

  function verwijderVraag(i: number) {
    onChange(vragen.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4">
      {vragen.map((v, vi) => (
        <div key={vi} className="border rounded-lg p-3 space-y-2 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Vraag {vi + 1}</span>
            <Button size="sm" variant="ghost" onClick={() => verwijderVraag(vi)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Input
            placeholder="Vraag stellen..."
            value={v.vraag}
            onChange={(e) => updateVraag(vi, { vraag: e.target.value })}
          />
          <div className="space-y-1.5">
            {v.opties.map((o, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setJuistAntwoord(vi, oi)}
                  className={`w-4 h-4 rounded-full border-2 shrink-0 ${o.correct ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground"}`}
                />
                <Input
                  className="h-7 text-sm"
                  placeholder={`Optie ${oi + 1}`}
                  value={o.tekst}
                  onChange={(e) => updateOptie(vi, oi, e.target.value)}
                />
              </div>
            ))}
          </div>
          <Input
            className="text-sm"
            placeholder="Toelichting (optioneel)"
            value={v.uitleg}
            onChange={(e) => updateVraag(vi, { uitleg: e.target.value })}
          />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={voegVraagToe}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        Vraag toevoegen
      </Button>
    </div>
  );
}

// ── Hoofd pagina ──────────────────────────────────────────────────────────────

export default function VeiligheidToolboxenPagina() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { heeftNiveau } = useBevoegdheid();

  const kanSchrijven = heeftNiveau("toolbox", 3);
  const kanVerwijderen = heeftNiveau("toolbox", 4);

  const { data: toolboxen, isLoading } = useGetVeiligheidToolboxen();

  const maakToolbox = usePostVeiligheidToolboxen();
  const updateToolbox = usePatchVeiligheidToolboxenId();
  const verwijderToolbox = useDeleteVeiligheidToolboxenId();
  const publicerenMut = usePostVeiligheidToolboxenIdPubliceren();
  const aiAnaliseMut = usePostVeiligheidToolboxenIdAiAnalyse();
  const aiBatchMut = useAiBatchGenereerToolboxen();
  const reviewMut = useReviewToolboxOnderwerpPatch();

  const [zoek, setZoek] = useState("");
  const [categorieFilter, setCategorieFilter] = useState<string>("alle");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [bewerkenId, setBewerkenId] = useState<number | null>(null);
  const [maakOpen, setMaakOpen] = useState(false);
  const [verwijderBevestigen, setVerwijderBevestigen] = useState<number | null>(null);
  const [bezig, setBezig] = useState(false);
  const [formulier, setFormulier] = useState<VeiligheidToolboxInput>(LEEG);
  const [vragen, setVragen] = useState<VraagInput[]>([]);
  const [uploadBezig, setUploadBezig] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchBezig, setBatchBezig] = useState(false);
  const [batchAantal, setBatchAantal] = useState(50);
  const [batchVoortgang, setBatchVoortgang] = useState(0);
  const [batchCats, setBatchCats] = useState<string[]>(["brandveiligheid"]);
  const [batchToelichting, setBatchToelichting] = useState("");
  const [reviewBezig, setReviewBezig] = useState<number | null>(null);

  const { data: detail, isLoading: detailLaden } = useGetVeiligheidToolboxenId(
    detailId ?? 0,
    { query: { enabled: detailId !== null } } as any
  );
  const { data: afrondingen } = useGetVeiligheidToolboxenIdAfrondingen(
    detailId ?? 0,
    { query: { enabled: detailId !== null && kanSchrijven } } as any
  );

  const { data: maandopdrachten = [], isLoading: maandLaden } = useListToolboxMaandopdrachten();
  const maakMaandopdrachtMut = useCreateToolboxMaandopdracht();
  const verwijderMaandopdrachtMut = useDeleteToolboxMaandopdracht();
  const [maandDialog, setMaandDialog] = useState(false);
  const [voortgangId, setVoortgangId] = useState<number | null>(null);
  const [maandFormulier, setMaandFormulier] = useState<{ toolbox_id: string; jaar: number; maand: number }>({
    toolbox_id: "",
    jaar: new Date().getFullYear(),
    maand: new Date().getMonth() + 1,
  });
  const { data: voortgang = [] } = useGetToolboxMaandopdrachtVoortgang(
    voortgangId ?? 0,
    { query: { enabled: voortgangId !== null } } as any
  );

  function invaliderenLijst() {
    queryClient.invalidateQueries({ queryKey: getGetVeiligheidToolboxenQueryKey() });
  }
  function invaliderenDetail(id: number) {
    queryClient.invalidateQueries({ queryKey: getGetVeiligheidToolboxenIdQueryKey(id) });
  }

  const gefilterd = (toolboxen ?? []).filter((t) => {
    const zoekMatch = !zoek || t.titel.toLowerCase().includes(zoek.toLowerCase());
    const catMatch = categorieFilter === "alle" || t.categorie === categorieFilter;
    return zoekMatch && catMatch;
  });

  function openMaak() {
    setFormulier(LEEG);
    setVragen([]);
    setBewerkenId(null);
    setMaakOpen(true);
  }

  function openBewerken(t: VeiligheidToolboxDetail) {
    setFormulier({
      titel: t.titel,
      categorie: t.categorie,
      moeilijkheid: t.moeilijkheid,
      geschatte_leestijd: t.geschatte_leestijd ?? undefined,
      intro: (t as any).intro ?? "",
      gepubliceerd: t.gepubliceerd,
      verplicht: t.verplicht,
      doelgroep: t.doelgroep,
      min_score: t.min_score,
      geldigheid_maanden: t.geldigheid_maanden,
      pdf_pad: (t as any).pdf_pad ?? undefined,
      video_url: (t as any).video_url ?? undefined,
      tags: t.tags ?? [],
    });
    setVragen(
      ((t as any).vragen ?? []).map((v: any) => ({
        vraag: v.vraag,
        opties: v.opties,
        uitleg: v.uitleg ?? "",
      }))
    );
    setBewerkenId(t.id);
    setMaakOpen(true);
  }

  async function uploadPdf(file: File) {
    setUploadBezig(true);
    try {
      const resp = await fetch("/api/veiligheid/toolboxen/upload-url");
      const { upload_url, object_path } = await resp.json();
      await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": "application/pdf" } });
      setFormulier((f) => ({ ...f, pdf_pad: object_path }));
      toast({ title: "PDF geupload" });
    } catch {
      toast({ title: "Upload mislukt", variant: "destructive" });
    } finally {
      setUploadBezig(false);
    }
  }

  async function slaOp() {
    if (!formulier.titel?.trim()) return;
    setBezig(true);
    try {
      const data: VeiligheidToolboxInput = {
        ...formulier,
        vragen: vragen.filter((v) => v.vraag.trim()),
      };
      if (bewerkenId !== null) {
        await updateToolbox.mutateAsync({ id: bewerkenId, data });
        invaliderenDetail(bewerkenId);
        toast({ title: "Toolbox bijgewerkt" });
      } else {
        await maakToolbox.mutateAsync({ data });
        toast({ title: "Toolbox aangemaakt" });
      }
      invaliderenLijst();
      setMaakOpen(false);
    } catch {
      toast({ title: "Fout bij opslaan", variant: "destructive" });
    } finally {
      setBezig(false);
    }
  }

  async function publiceer(id: number) {
    try {
      await publicerenMut.mutateAsync({ id });
      invaliderenLijst();
      invaliderenDetail(id);
      toast({ title: "Toolbox gepubliceerd" });
    } catch {
      toast({ title: "Fout bij publiceren", variant: "destructive" });
    }
  }

  async function startBatch() {
    setBatchBezig(true);
    setBatchVoortgang(0);
    let totaal = 0;
    try {
      // In stappen van 10 genereren: elk verzoek blijft kort en de wachtrij
      // vult zichtbaar aan terwijl de generatie loopt.
      while (totaal < batchAantal) {
        const stap = Math.min(10, batchAantal - totaal);
        const res = await aiBatchMut.mutateAsync({ data: { categorieen: batchCats, aantal: stap, toelichting: batchToelichting || undefined } });
        const aangemaakt = (res as any).aangemaakt ?? 0;
        totaal += aangemaakt;
        setBatchVoortgang(totaal);
        invaliderenLijst();
        if (aangemaakt === 0) break;
      }
      if (totaal === 0) {
        toast({ title: "Batch generatie mislukt", variant: "destructive" });
      } else {
        setBatchDialogOpen(false);
        setBatchToelichting("");
        toast({ title: `${totaal} toolbox-concepten aangemaakt voor review` });
      }
    } catch {
      if (totaal > 0) {
        toast({ title: `Generatie onderbroken: ${totaal} van ${batchAantal} concepten aangemaakt`, variant: "destructive" });
      } else {
        toast({ title: "Batch generatie mislukt", variant: "destructive" });
      }
    } finally {
      setBatchBezig(false);
      setBatchVoortgang(0);
    }
  }

  async function reviewToolbox(id: number, besluit: "goedkeuren" | "afwijzen") {
    setReviewBezig(id);
    try {
      await reviewMut.mutateAsync({ id, data: { besluit } });
      invaliderenLijst();
      toast({ title: besluit === "goedkeuren" ? "Toolbox gepubliceerd" : "Concept verwijderd" });
    } catch {
      toast({ title: "Review mislukt", variant: "destructive" });
    } finally {
      setReviewBezig(null);
    }
  }

  async function aiAnalyse(id: number) {
    try {
      toast({ title: "AI-analyse gestart..." });
      await aiAnaliseMut.mutateAsync({ id });
      invaliderenDetail(id);
      invaliderenLijst();
      toast({ title: "AI-analyse voltooid" });
    } catch {
      toast({ title: "AI-analyse mislukt", variant: "destructive" });
    }
  }

  async function verwijder(id: number) {
    try {
      await verwijderToolbox.mutateAsync({ id });
      invaliderenLijst();
      if (detailId === id) setDetailId(null);
      setVerwijderBevestigen(null);
      toast({ title: "Toolbox verwijderd" });
    } catch {
      toast({ title: "Fout bij verwijderen", variant: "destructive" });
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PaginaHulp pagina="veiligheid-toolboxen" />
      {/* Koptekst */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 data-paginatitel className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Toolbox Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            VCA-veiligheidstoolboxen met AI-samenvattingen, toetsvragen en digitale bevestiging.
          </p>
        </div>
        {kanSchrijven && (
          <Button onClick={openMaak}>
            <Plus className="h-4 w-4 mr-2" />
            Nieuwe toolbox
          </Button>
        )}
      </div>

      {/* Maandopdrachten */}
      {kanSchrijven && (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Maandopdrachten</span>
              <Badge variant="outline" className="text-[10px]">{(maandopdrachten as ToolboxMaandopdracht[]).length}</Badge>
            </div>
            <Button size="sm" onClick={() => setMaandDialog(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Nieuwe opdracht
            </Button>
          </div>
          {maandLaden ? (
            <div className="p-4 space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (maandopdrachten as ToolboxMaandopdracht[]).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nog geen maandopdrachten aangemaakt
            </div>
          ) : (
            <div className="divide-y">
              {(maandopdrachten as ToolboxMaandopdracht[]).map((o) => {
                const totaalVoltooid = (o as any).totaal_voltooid ?? 0;
                const totaalGebruikers = (o as any).totaal_gebruikers ?? 0;
                return (
                  <div key={o.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="shrink-0 w-14 text-center">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground">
                        {MAANDEN_LANG[o.maand - 1]?.slice(0, 3)}
                      </div>
                      <div className="text-lg font-bold leading-none">{o.jaar}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{o.toolbox_titel}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Users className="h-3 w-3" />
                        {totaalVoltooid} / {totaalGebruikers} voltooid
                      </div>
                      {totaalGebruikers > 0 && (
                        <div className="w-full bg-muted rounded-full h-1 mt-1.5">
                          <div
                            className="bg-emerald-500 h-1 rounded-full transition-all"
                            style={{ width: `${Math.round((totaalVoltooid / totaalGebruikers) * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setVoortgangId(o.id)} title="Voortgang bekijken">
                        <BarChart2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          verwijderMaandopdrachtMut.mutate({ id: o.id } as any, {
                            onSuccess: () => {
                              queryClient.invalidateQueries({ queryKey: getListToolboxMaandopdrachtenQueryKey() });
                              toast({ title: "Opdracht verwijderd" });
                            },
                          });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* AI-wachtrij */}
      {kanSchrijven && (() => {
        const wachtrij = (toolboxen ?? []).filter((t: VeiligheidToolbox) => (t as any).ai_gegenereerd === true && t.gepubliceerd === false);
        return (
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-amber-600" />
                <span className="font-semibold text-sm">AI-wachtrij</span>
                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                  {wachtrij.length} ter review
                </Badge>
              </div>
              <Button size="sm" variant="outline" onClick={() => setBatchDialogOpen(true)}>
                <Sparkles className="h-3.5 w-3.5 mr-1 text-amber-600" />
                Genereer batch
              </Button>
            </div>
            {wachtrij.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Geen AI-concepten in de wachtrij. Genereer een nieuwe batch om te starten.
              </div>
            ) : (
              <div className="divide-y">
                {wachtrij.slice(0, 10).map((t: VeiligheidToolbox) => (
                  <div key={t.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{t.titel}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {CATEGORIEEN.find(c => c.value === t.categorie)?.label ?? t.categorie}
                        {" · "}
                        {(t as any).moeilijkheid}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs gap-1 text-blue-600 hover:text-blue-700"
                        onClick={() => setDetailId(t.id)}
                      >
                        Bekijken
                      </Button>
                      <Button
                        size="sm"
                        className="text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                        disabled={reviewBezig === t.id}
                        onClick={() => void reviewToolbox(t.id, "goedkeuren")}
                      >
                        {reviewBezig === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
                        Goedkeuren
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                        disabled={reviewBezig === t.id}
                        onClick={() => void reviewToolbox(t.id, "afwijzen")}
                      >
                        <ThumbsDown className="h-3 w-3" />
                        Afwijzen
                      </Button>
                    </div>
                  </div>
                ))}
                {wachtrij.length > 10 && (
                  <div className="px-5 py-3 text-xs text-muted-foreground text-center">
                    + {wachtrij.length - 10} meer concepten — keur eerst de bovenstaande goed of af
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Zoek toolbox..."
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
          />
        </div>
        <Select value={categorieFilter} onValueChange={setCategorieFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle categorieën</SelectItem>
            {CATEGORIEEN.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lijst */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : gefilterd.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Geen toolboxen gevonden</p>
            {kanSchrijven && (
              <p className="text-sm mt-1">Maak een nieuwe toolbox aan via de knop rechtsboven.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {gefilterd.map((t) => (
            <ToolboxKaart
              key={t.id}
              t={t}
              kanSchrijven={kanSchrijven}
              onDetail={() => setDetailId(t.id)}
              onVerwijder={() => setVerwijderBevestigen(t.id)}
            />
          ))}
        </div>
      )}

      {/* ── Detail dialog ── */}
      <Dialog open={detailId !== null && !maakOpen} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {detail?.titel ?? "Toolbox"}
            </DialogTitle>
          </DialogHeader>

          {detailLaden ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : detail ? (
            <Tabs defaultValue="inhoud">
              <TabsList className="flex-wrap h-auto gap-1">
                <TabsTrigger value="inhoud">Inhoud</TabsTrigger>
                {(detail as any).pdf_pad && (
                  <TabsTrigger value="pdf" className="gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    PDF
                  </TabsTrigger>
                )}
                {(detail as any).video_url && (
                  <TabsTrigger value="video" className="gap-1.5">
                    <Play className="h-3.5 w-3.5" />
                    Video
                  </TabsTrigger>
                )}
                <TabsTrigger value="quiz">Vragen ({((detail as any).vragen ?? []).length})</TabsTrigger>
                {kanSchrijven && <TabsTrigger value="afrondingen">Afrondingen ({(afrondingen ?? []).length})</TabsTrigger>}
                {kanSchrijven && <TabsTrigger value="beheer">Beheer</TabsTrigger>}
              </TabsList>

              <TabsContent value="inhoud" className="space-y-4 mt-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{categorieLabel(detail.categorie)}</Badge>
                  <Badge variant="outline">{detail.moeilijkheid}</Badge>
                  {detail.geschatte_leestijd && (
                    <Badge variant="outline">{detail.geschatte_leestijd} min</Badge>
                  )}
                  <Badge variant="outline" className={detail.gepubliceerd ? STATUS_KLEUR["gepubliceerd"] : STATUS_KLEUR["concept"]}>
                    {detail.gepubliceerd ? "Gepubliceerd" : "Concept"}
                  </Badge>
                </div>

                {(detail as any).intro && (
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Introductie</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{(detail as any).intro}</p>
                  </div>
                )}

                {(detail as any).ai_samenvatting && (
                  <div className="rounded-lg border bg-amber-50/40 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-600" />
                      <h3 className="text-sm font-semibold">AI Samenvatting</h3>
                    </div>
                    <p className="text-sm">{(detail as any).ai_samenvatting}</p>

                    {((detail as any).ai_risicos ?? []).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-red-700 mb-1">Belangrijkste risico's</p>
                        <ul className="space-y-0.5">
                          {((detail as any).ai_risicos as string[]).map((r, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {((detail as any).ai_maatregelen ?? []).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-emerald-700 mb-1">Maatregelen</p>
                        <ul className="space-y-0.5">
                          {((detail as any).ai_maatregelen as string[]).map((m, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                              {m}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(detail as any).ai_stoppen && (
                      <div className="rounded bg-red-50 border border-red-200 px-3 py-2">
                        <p className="text-xs font-semibold text-red-700 mb-0.5">Wanneer direct stoppen</p>
                        <p className="text-sm text-red-800">{(detail as any).ai_stoppen}</p>
                      </div>
                    )}
                  </div>
                )}

                {(detail as any).pdf_pad && (
                  <div className="flex items-center gap-3 rounded-lg border bg-amber-50/50 border-amber-200 px-3 py-2.5">
                    <FileText className="h-5 w-5 text-amber-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-amber-900">PDF bijgevoegd</p>
                      <p className="text-xs text-amber-700">Bekijk via de PDF-tab of download het document</p>
                    </div>
                    <a
                      href={`/api/storage${(detail as any).pdf_pad}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-amber-700 hover:underline shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Downloaden
                    </a>
                  </div>
                )}

                {(detail as any).video_url && (
                  <div className="flex items-center gap-3 rounded-lg border bg-blue-50/50 border-blue-200 px-3 py-2.5">
                    <Play className="h-5 w-5 text-blue-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-900">Video bijgevoegd</p>
                      <p className="text-xs text-blue-700">Bekijk de instructievideo via de Video-tab</p>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ── PDF inline viewer ── */}
              {(detail as any).pdf_pad && (
                <TabsContent value="pdf" className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium">PDF Document</span>
                    </div>
                    <a
                      href={`/api/storage${(detail as any).pdf_pad}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Openen in nieuw tabblad
                    </a>
                  </div>
                  <div className="rounded-lg overflow-hidden border bg-muted/30">
                    <iframe
                      src={`/api/storage${(detail as any).pdf_pad}`}
                      className="w-full"
                      style={{ height: "520px" }}
                      title={`PDF: ${detail.titel}`}
                    />
                  </div>
                </TabsContent>
              )}

              {/* ── Video embed ── */}
              {(detail as any).video_url && (
                <TabsContent value="video" className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Play className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">Instructievideo</span>
                    </div>
                    <a
                      href={(detail as any).video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Openen in nieuw tabblad
                    </a>
                  </div>
                  {(() => {
                    const embed = embedVideoUrl((detail as any).video_url);
                    return embed ? (
                      <div className="rounded-lg overflow-hidden border aspect-video">
                        <iframe
                          src={embed}
                          className="w-full h-full"
                          title={`Video: ${detail.titel}`}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    ) : (
                      <div className="rounded-lg overflow-hidden border bg-black">
                        <video
                          src={(detail as any).video_url}
                          controls
                          className="w-full"
                          style={{ maxHeight: "480px" }}
                        >
                          Uw browser ondersteunt geen HTML5 video.
                        </video>
                      </div>
                    );
                  })()}
                </TabsContent>
              )}

              <TabsContent value="quiz" className="space-y-3 mt-4">
                {((detail as any).vragen ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Geen controlevragen.</p>
                ) : (
                  ((detail as any).vragen as any[]).map((v, i) => (
                    <div key={v.id} className="border rounded-lg p-3 space-y-2">
                      <p className="text-sm font-medium">{i + 1}. {v.vraag}</p>
                      <div className="space-y-1">
                        {(v.opties as any[]).map((o, oi) => (
                          <div key={oi} className={`flex items-center gap-2 text-sm px-2 py-1 rounded ${o.correct ? "bg-emerald-50 text-emerald-800" : "text-muted-foreground"}`}>
                            <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${o.correct ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground"}`} />
                            {o.tekst}
                          </div>
                        ))}
                      </div>
                      {v.uitleg && <p className="text-xs text-muted-foreground italic">{v.uitleg}</p>}
                    </div>
                  ))
                )}
              </TabsContent>

              {kanSchrijven && (
                <TabsContent value="afrondingen" className="mt-4">
                  {(afrondingen ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nog niemand heeft deze toolbox afgerond.</p>
                  ) : (
                    <div className="space-y-2">
                      {(afrondingen ?? []).map((a) => (
                        <div key={a.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                          <div>
                            <span className="font-medium">{(a as any).gebruiker_naam ?? "Onbekend"}</span>
                            <span className="text-muted-foreground ml-2 text-xs">
                              {new Date(a.bevestigd_op).toLocaleDateString("nl-NL")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${a.geslaagd ? "text-emerald-700" : "text-orange-600"}`}>
                              {a.score}/{a.max_score}
                            </span>
                            <Badge variant="outline" className={a.geslaagd ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]" : "bg-orange-50 text-orange-700 border-orange-200 text-[10px]"}>
                              {a.geslaagd ? "Geslaagd" : "Niet geslaagd"}
                            </Badge>
                            {a.geldig_tot && (
                              <span className="text-xs text-muted-foreground">
                                geldig t/m {new Date(a.geldig_tot).toLocaleDateString("nl-NL")}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              )}

              {kanSchrijven && (
                <TabsContent value="beheer" className="space-y-3 mt-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => aiAnalyse(detail.id)}
                      disabled={aiAnaliseMut.isPending}
                    >
                      {aiAnaliseMut.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        : <Sparkles className="h-4 w-4 mr-2" />}
                      AI-analyse uitvoeren
                    </Button>
                    {!detail.gepubliceerd && (
                      <Button onClick={() => publiceer(detail.id)} disabled={publicerenMut.isPending}>
                        <Send className="h-4 w-4 mr-2" />
                        Publiceren
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => { setDetailId(null); openBewerken(detail as unknown as VeiligheidToolboxDetail); }}>
                      Bewerken
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    AI-analyse extraheert automatisch samenvatting, risico's, maatregelen en controlevragen uit de gekoppelde PDF.
                  </p>
                </TabsContent>
              )}
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Aanmaken / Bewerken dialog ── */}
      <Dialog open={maakOpen} onOpenChange={(open) => { if (!bezig) setMaakOpen(open); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {bewerkenId !== null ? "Toolbox bewerken" : "Nieuwe toolbox"}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="info">
            <TabsList>
              <TabsTrigger value="info">Informatie</TabsTrigger>
              <TabsTrigger value="inhoud">Inhoud</TabsTrigger>
              <TabsTrigger value="quiz">Quiz ({vragen.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4 mt-4">
              <div>
                <Label>Titel *</Label>
                <Input
                  value={formulier.titel ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, titel: e.target.value }))}
                  placeholder="Bijv. Brandveilig werken"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Categorie</Label>
                  <Select value={formulier.categorie ?? "overig"} onValueChange={(v) => setFormulier((f) => ({ ...f, categorie: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIEEN.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Moeilijkheid</Label>
                  <Select value={formulier.moeilijkheid ?? "gemiddeld"} onValueChange={(v) => setFormulier((f) => ({ ...f, moeilijkheid: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MOEILIJKHEID.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Min. score (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={formulier.min_score ?? 70}
                    onChange={(e) => setFormulier((f) => ({ ...f, min_score: parseInt(e.target.value) || 70 }))}
                  />
                </div>
                <div>
                  <Label>Geldigheid (maanden)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={formulier.geldigheid_maanden ?? 12}
                    onChange={(e) => setFormulier((f) => ({ ...f, geldigheid_maanden: parseInt(e.target.value) || 12 }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formulier.verplicht ?? false}
                    onCheckedChange={(v) => setFormulier((f) => ({ ...f, verplicht: v }))}
                  />
                  <Label>Verplicht voor medewerkers</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="inhoud" className="space-y-4 mt-4">
              <div>
                <Label>Introductie</Label>
                <Textarea
                  rows={4}
                  value={(formulier as any).intro ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, intro: e.target.value } as any))}
                  placeholder="Waarom is dit toolbox-onderwerp belangrijk? Welke risico's lopen monteurs?"
                />
              </div>

              <div>
                <Label>PDF uploaden</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadPdf(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadBezig}
                  >
                    {uploadBezig ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    {(formulier as any).pdf_pad ? "PDF vervangen" : "PDF uploaden"}
                  </Button>
                  {(formulier as any).pdf_pad && (
                    <span className="text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5" />
                      PDF gekoppeld
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Na opslaan kunt u AI-analyse uitvoeren om automatisch samenvatting en vragen te genereren.
                </p>
              </div>

              <div>
                <Label>Video URL (optioneel)</Label>
                <Input
                  value={(formulier as any).video_url ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, video_url: e.target.value } as any))}
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>
            </TabsContent>

            <TabsContent value="quiz" className="mt-4">
              <p className="text-xs text-muted-foreground mb-3">
                Voeg handmatig vragen toe, of gebruik AI-analyse na het uploaden van een PDF.
                Klik op het gekleurde bolletje om het juiste antwoord te markeren.
              </p>
              <QuizBouwer vragen={vragen} onChange={setVragen} />
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setMaakOpen(false)} disabled={bezig}>
              Annuleren
            </Button>
            <Button onClick={slaOp} disabled={bezig || !formulier.titel?.trim()}>
              {bezig ? "Opslaan..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Verwijder bevestiging ── */}
      <Dialog open={verwijderBevestigen !== null} onOpenChange={(open) => { if (!open) setVerwijderBevestigen(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Toolbox verwijderen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Alle vragen en afrondingen worden ook verwijderd. Dit kan niet ongedaan worden gemaakt.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerwijderBevestigen(null)}>Annuleren</Button>
            <Button variant="destructive" onClick={() => verwijderBevestigen !== null && verwijder(verwijderBevestigen)}>
              Verwijderen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Maandopdracht aanmaken */}
      <Dialog open={maandDialog} onOpenChange={setMaandDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nieuwe maandopdracht</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Toolbox</Label>
              <Select
                value={maandFormulier.toolbox_id}
                onValueChange={v => setMaandFormulier(f => ({ ...f, toolbox_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer een toolbox..." />
                </SelectTrigger>
                <SelectContent>
                  {(toolboxen ?? []).filter(t => t.gepubliceerd).map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.titel}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Maand</Label>
                <Select
                  value={String(maandFormulier.maand)}
                  onValueChange={v => setMaandFormulier(f => ({ ...f, maand: Number(v) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MAANDEN_LANG.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Jaar</Label>
                <Input
                  type="number"
                  value={maandFormulier.jaar}
                  onChange={e => setMaandFormulier(f => ({ ...f, jaar: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaandDialog(false)}>Annuleren</Button>
            <Button
              disabled={!maandFormulier.toolbox_id || maakMaandopdrachtMut.isPending}
              onClick={async () => {
                try {
                  await maakMaandopdrachtMut.mutateAsync({
                    data: {
                      toolbox_id: Number(maandFormulier.toolbox_id),
                      jaar: maandFormulier.jaar,
                      maand: maandFormulier.maand,
                    }
                  });
                  queryClient.invalidateQueries({ queryKey: getListToolboxMaandopdrachtenQueryKey() });
                  setMaandDialog(false);
                  setMaandFormulier({ toolbox_id: "", jaar: new Date().getFullYear(), maand: new Date().getMonth() + 1 });
                  toast({ title: "Maandopdracht aangemaakt" });
                } catch (e: any) {
                  toast({ title: e?.message ?? "Er is een fout opgetreden", variant: "destructive" });
                }
              }}
            >
              {maakMaandopdrachtMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aanmaken"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Voortgang maandopdracht */}
      <Dialog open={voortgangId !== null} onOpenChange={v => !v && setVoortgangId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />
              Voortgang medewerkers
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {(voortgang as any[]).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nog niemand heeft de opdracht gezien
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 font-medium">Medewerker</th>
                    <th className="text-center py-2 font-medium">Status</th>
                    <th className="text-center py-2 font-medium">Uitgesteld</th>
                    <th className="text-left py-2 font-medium">Vraag</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(voortgang as any[]).map((r, i) => (
                    <tr key={i}>
                      <td className="py-2.5">{r.naam}</td>
                      <td className="py-2.5 text-center">
                        {r.voltooid
                          ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">Voltooid</Badge>
                          : <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">Open</Badge>}
                      </td>
                      <td className="py-2.5 text-center text-muted-foreground">{r.aantal_uitgesteld}x</td>
                      <td className="py-2.5 text-muted-foreground max-w-[200px] truncate">{r.vraag ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── AI Batch generatie dialog ── */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-amber-600" />
              AI-batch genereren
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Aantal onderwerpen</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={batchAantal}
                onChange={(e) => setBatchAantal(Math.min(50, Math.max(1, Number(e.target.value))))}
              />
              <p className="text-xs text-muted-foreground">Maximaal 50 per keer</p>
            </div>
            <div className="space-y-2">
              <Label>Categorieën</Label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIEEN.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setBatchCats((prev) =>
                      prev.includes(c.value) ? prev.filter((x) => x !== c.value) : [...prev, c.value]
                    )}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      batchCats.includes(c.value)
                        ? "bg-amber-100 text-amber-800 border-amber-300"
                        : "bg-muted text-muted-foreground border-border hover:border-amber-300"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {batchCats.length === 0 && (
                <p className="text-xs text-red-500">Selecteer minimaal een categorie</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Extra context (optioneel)</Label>
              <Textarea
                placeholder="Bijv. specifieke risico's, seizoensgebonden thema's, sector..."
                value={batchToelichting}
                onChange={(e) => setBatchToelichting(e.target.value)}
                rows={3}
              />
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
              <p className="font-medium">AI genereert concepten ter review</p>
              <p>De gegenereerde toolboxen komen in de AI-wachtrij. Je keurt elk onderwerp goed of af voordat het zichtbaar wordt voor medewerkers.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>Annuleren</Button>
            <Button
              disabled={batchBezig || batchCats.length === 0}
              onClick={() => void startBatch()}
              className="gap-1.5"
            >
              {batchBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {batchBezig ? `Genereren... (${batchVoortgang} van ${batchAantal})` : `${batchAantal} onderwerpen genereren`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

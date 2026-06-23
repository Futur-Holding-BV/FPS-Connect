import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOfferte,
  useListOfferteSecties,
  useCreateOfferteSectie,
  useUpdateOfferteSectie,
  useDeleteOfferteSectie,
  useListOfferteRegels,
  useUpdateOfferteRegel,
  useListOfferteUitgangspunten,
  useListOfferteVersies,
  useCreateOfferteVersie,
  useListOfferteBijlagen,
  useCreateOfferteBijlage,
  useDeleteOfferteBijlage,
  getGetOfferteQueryKey,
  getListOfferteVersiesQueryKey,
  getListOfferteBijlagenQueryKey,
  getListOfferteSectiesQueryKey,
  getListOfferteRegelsQueryKey,
  getListOfferteUitgangspuntenQueryKey,
} from "@workspace/api-client-react";
import type { OfferteSectie } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Sparkles, ChevronUp, ChevronDown, Eye, Printer, Plus,
  Trash2, BookOpen, Clock, Paperclip, Check, X, GripVertical, ToggleLeft, ToggleRight, Send,
} from "lucide-react";
import { VerzendTab } from "./verzend-tab";
import { useToast } from "@/hooks/use-toast";

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-amber-100 text-amber-800 border-amber-200",
  verzonden: "bg-blue-100 text-blue-800 border-blue-200",
  geaccepteerd: "bg-emerald-100 text-emerald-800 border-emerald-200",
  afgewezen: "bg-rose-100 text-rose-800 border-rose-200",
  vervallen: "bg-muted text-muted-foreground border-border",
};

const SECTIE_TYPEN = [
  { value: "aanbiedingsbrief", label: "Aanbiedingsbrief" },
  { value: "projectomschrijving", label: "Projectomschrijving" },
  { value: "aanpak", label: "Aanpak en methodiek" },
  { value: "team", label: "Team en organisatie" },
  { value: "planning", label: "Planning" },
  { value: "voorwaarden", label: "Algemene voorwaarden" },
  { value: "slotwoord", label: "Slotwoord" },
  { value: "vrij", label: "Vrije sectie" },
];

const BIJLAGE_TYPEN = [
  { value: "referentie", label: "Referentie" },
  { value: "certificaat", label: "Certificaat" },
  { value: "foto", label: "Foto" },
  { value: "tekening", label: "Tekening" },
  { value: "overig", label: "Overig" },
];

function euro(bedrag: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(bedrag ?? 0);
}

function datumNl(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function telWoorden(tekst: string) {
  return tekst.trim() ? tekst.trim().split(/\s+/).length : 0;
}

export default function ProposalStudio() {
  const { id } = useParams<{ id: string }>();
  const offerteId = parseInt(id ?? "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: offerte, isLoading: offerteLoading } = useGetOfferte(offerteId, {
    query: { queryKey: getGetOfferteQueryKey(offerteId), enabled: !!offerteId },
  });
  const { data: secties, isLoading: sectiesLoading } = useListOfferteSecties(offerteId, {
    query: { queryKey: getListOfferteSectiesQueryKey(offerteId), enabled: !!offerteId },
  });
  const { data: regels } = useListOfferteRegels(offerteId, {
    query: { queryKey: getListOfferteRegelsQueryKey(offerteId), enabled: !!offerteId },
  });
  const { data: uitgangspunten } = useListOfferteUitgangspunten(offerteId, {
    query: { queryKey: getListOfferteUitgangspuntenQueryKey(offerteId), enabled: !!offerteId },
  });
  const { data: versies } = useListOfferteVersies(offerteId, {
    query: { queryKey: getListOfferteVersiesQueryKey(offerteId), enabled: !!offerteId },
  });
  const { data: bijlagen } = useListOfferteBijlagen(offerteId, {
    query: { queryKey: getListOfferteBijlagenQueryKey(offerteId), enabled: !!offerteId },
  });

  const maakSectie = useCreateOfferteSectie();
  const werkSectie = useUpdateOfferteSectie();
  const verwijderSectie = useDeleteOfferteSectie();
  const werkRegel = useUpdateOfferteRegel();
  const maakVersie = useCreateOfferteVersie();
  const maakBijlage = useCreateOfferteBijlage();
  const verwijderBijlage = useDeleteOfferteBijlage();

  const [activeSectieId, setActiveSectieId] = useState<number | null>(null);
  const [localInhoud, setLocalInhoud] = useState("");
  const [localTitel, setLocalTitel] = useState("");
  const [heeftWijzigingen, setHeeftWijzigingen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiVoorstel, setAiVoorstel] = useState<string | null>(null);
  const [sectieDialoogOpen, setSectieDialoogOpen] = useState(false);
  const [nieuwSectieType, setNieuwSectieType] = useState("vrij");
  const [nieuwSectieNaam, setNieuwSectieNaam] = useState("");
  const [versieDialoogOpen, setVersieDialoogOpen] = useState(false);
  const [versieSamenvatting, setVersieSamenvatting] = useState("");
  const [bijlageDialoogOpen, setBijlageDialoogOpen] = useState(false);
  const [bijlageForm, setBijlageForm] = useState({ naam: "", bijlage_type: "overig", beschrijving: "", url: "" });
  const [bewerkRegelId, setBewerkRegelId] = useState<number | null>(null);
  const [bewerkPrijs, setBewerkPrijs] = useState("");
  const [initialiserend, setInitialiserend] = useState(false);

  const gesorteerdeSecties = [...(secties ?? [])].sort((a, b) => a.volgorde - b.volgorde);
  const activeSectie = gesorteerdeSecties.find((s) => s.id === activeSectieId) ?? null;

  useEffect(() => {
    if (gesorteerdeSecties.length > 0 && !activeSectieId) {
      const eerste = gesorteerdeSecties.find((s) => s.actief) ?? gesorteerdeSecties[0];
      if (eerste) setActiveSectieId(eerste.id);
    }
  }, [gesorteerdeSecties.length, activeSectieId]);

  useEffect(() => {
    if (activeSectie) {
      setLocalInhoud(activeSectie.inhoud ?? "");
      setLocalTitel(activeSectie.titel);
      setHeeftWijzigingen(false);
      setAiVoorstel(null);
    }
  }, [activeSectieId]);

  async function herlaad() {
    await queryClient.invalidateQueries({ queryKey: getListOfferteSectiesQueryKey(offerteId) });
    await queryClient.invalidateQueries({ queryKey: getListOfferteVersiesQueryKey(offerteId) });
    await queryClient.invalidateQueries({ queryKey: getListOfferteBijlagenQueryKey(offerteId) });
  }

  async function slaOp() {
    if (!activeSectieId) return;
    try {
      await werkSectie.mutateAsync({
        id: activeSectieId,
        data: { titel: localTitel, inhoud: localInhoud },
      });
      await herlaad();
      setHeeftWijzigingen(false);
      toast({ title: "Sectie opgeslagen" });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function toggleActief(s: OfferteSectie) {
    try {
      await werkSectie.mutateAsync({ id: s.id, data: { actief: !s.actief } });
      await herlaad();
    } catch {
      toast({ title: "Wijziging mislukt", variant: "destructive" });
    }
  }

  async function verschuif(s: OfferteSectie, richting: "omhoog" | "omlaag") {
    const idx = gesorteerdeSecties.findIndex((x) => x.id === s.id);
    const andere = richting === "omhoog" ? gesorteerdeSecties[idx - 1] : gesorteerdeSecties[idx + 1];
    if (!andere) return;
    try {
      await werkSectie.mutateAsync({ id: s.id, data: { volgorde: andere.volgorde } });
      await werkSectie.mutateAsync({ id: andere.id, data: { volgorde: s.volgorde } });
      await herlaad();
    } catch {
      toast({ title: "Volgorde wijzigen mislukt", variant: "destructive" });
    }
  }

  async function verwijderSectieActie(s: OfferteSectie) {
    try {
      await verwijderSectie.mutateAsync({ id: s.id });
      if (activeSectieId === s.id) setActiveSectieId(null);
      await herlaad();
      toast({ title: "Sectie verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  async function voegSectieToee() {
    try {
      const label = SECTIE_TYPEN.find((t) => t.value === nieuwSectieType)?.label ?? "Sectie";
      const s = await maakSectie.mutateAsync({
        id: offerteId,
        data: {
          sectie_type: nieuwSectieType,
          titel: nieuwSectieNaam || label,
          volgorde: gesorteerdeSecties.length,
        },
      });
      await herlaad();
      setSectieDialoogOpen(false);
      setNieuwSectieNaam("");
      setNieuwSectieType("vrij");
      setActiveSectieId(s.id);
      toast({ title: "Sectie toegevoegd" });
    } catch {
      toast({ title: "Toevoegen mislukt", variant: "destructive" });
    }
  }

  async function initialiseerSecties() {
    setInitialiserend(true);
    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${BASE}/api/offertes/${offerteId}/secties/initialiseren`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!resp.ok) throw new Error();
      await herlaad();
      toast({ title: "Standaardsecties aangemaakt" });
    } catch {
      toast({ title: "Initialiseren mislukt", variant: "destructive" });
    } finally {
      setInitialiserend(false);
    }
  }

  async function geneerAiTekst() {
    if (!activeSectieId) return;
    setAiLoading(true);
    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${BASE}/api/offerte-secties/${activeSectieId}/ai-schrijven`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!resp.ok) throw new Error("AI niet beschikbaar");
      const data = (await resp.json()) as { tekst: string };
      setAiVoorstel(data.tekst);
    } catch {
      toast({ title: "AI niet beschikbaar op dit moment", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  async function accepteerAi() {
    if (!aiVoorstel) return;
    setLocalInhoud(aiVoorstel);
    setHeeftWijzigingen(true);
    setAiVoorstel(null);
  }

  async function slaVersieOp() {
    try {
      await maakVersie.mutateAsync({ id: offerteId, data: { samenvatting: versieSamenvatting } });
      await herlaad();
      setVersieDialoogOpen(false);
      setVersieSamenvatting("");
      toast({ title: "Versie opgeslagen" });
    } catch {
      toast({ title: "Versie opslaan mislukt", variant: "destructive" });
    }
  }

  async function voegBijlageToe() {
    if (!bijlageForm.naam.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    try {
      await maakBijlage.mutateAsync({
        id: offerteId,
        data: {
          naam: bijlageForm.naam,
          bijlage_type: bijlageForm.bijlage_type,
          beschrijving: bijlageForm.beschrijving || undefined,
          url: bijlageForm.url || undefined,
          volgorde: (bijlagen ?? []).length,
        },
      });
      await herlaad();
      setBijlageDialoogOpen(false);
      setBijlageForm({ naam: "", bijlage_type: "overig", beschrijving: "", url: "" });
      toast({ title: "Bijlage toegevoegd" });
    } catch {
      toast({ title: "Bijlage toevoegen mislukt", variant: "destructive" });
    }
  }

  async function verwijderBijlageActie(bijlageId: number) {
    try {
      await verwijderBijlage.mutateAsync({ id: bijlageId });
      await herlaad();
      toast({ title: "Bijlage verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  async function slaRegelPrijsOp(regelId: number) {
    const prijs = parseFloat(bewerkPrijs.replace(",", "."));
    if (isNaN(prijs)) {
      toast({ title: "Ongeldige prijs", variant: "destructive" });
      return;
    }
    const huidig = (regels ?? []).find((r) => r.id === regelId);
    if (!huidig) return;
    try {
      await werkRegel.mutateAsync({
        id: regelId,
        data: {
          maatregel: huidig.maatregel,
          categorie: huidig.categorie ?? undefined,
          snag_referentie: huidig.snag_referentie ?? undefined,
          voorziening_id: huidig.voorziening_id ?? undefined,
          ruimte: huidig.ruimte ?? undefined,
          uitgangspunten: huidig.uitgangspunten ?? undefined,
          eenheid: huidig.eenheid ?? undefined,
          aantal: huidig.aantal ?? undefined,
          prijs_per_eenheid: prijs,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListOfferteRegelsQueryKey(offerteId) });
      setBewerkRegelId(null);
      toast({ title: "Prijs bijgewerkt" });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  if (offerteLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4 p-4">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-4">
          <Skeleton className="h-[600px] w-64 flex-shrink-0" />
          <Skeleton className="h-[600px] flex-1" />
        </div>
      </div>
    );
  }

  if (!offerte) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-muted-foreground">
        Offerte niet gevonden.
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          body > * { display: none !important; }
          #voorbeeld-print { display: block !important; position: fixed; top: 0; left: 0; width: 100%; z-index: 9999; background: white; }
          @page { margin: 2cm; size: A4; }
        }
        #voorbeeld-print { display: none; }
      `}</style>

      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/offertes">
              <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">{offerte.titel}</h1>
                <Badge variant="outline" className={STATUS_KLEUR[offerte.status] ?? ""}>{offerte.status}</Badge>
              </div>
              {offerte.offertenummer && (
                <p className="text-xs text-muted-foreground">{offerte.offertenummer}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setVersieDialoogOpen(true)}>
              <Clock className="h-3.5 w-3.5" /> Versie opslaan
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" /> PDF exporteren
            </Button>
          </div>
        </div>

        <div className="flex gap-4 items-start">
          <div className="w-64 flex-shrink-0 space-y-2">
            <div className="font-semibold text-sm text-muted-foreground uppercase tracking-wide px-1">Secties</div>

            {sectiesLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : gesorteerdeSecties.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-center space-y-3">
                  <BookOpen className="h-8 w-8 mx-auto text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">Nog geen secties</p>
                  <Button size="sm" className="w-full" onClick={initialiseerSecties} disabled={initialiserend}>
                    {initialiserend ? "Bezig..." : "Standaardsecties aanmaken"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-1">
                {gesorteerdeSecties.map((s, idx) => (
                  <div
                    key={s.id}
                    className={`group flex items-center gap-1 rounded-md px-2 py-2 cursor-pointer transition-colors text-sm ${
                      s.id === activeSectieId
                        ? "bg-primary text-primary-foreground"
                        : s.actief
                        ? "hover:bg-muted"
                        : "opacity-50 hover:bg-muted"
                    }`}
                    onClick={() => setActiveSectieId(s.id)}
                  >
                    <GripVertical className="h-3.5 w-3.5 flex-shrink-0 opacity-40" />
                    <span className="flex-1 truncate">{s.titel}</span>
                    <div className="hidden group-hover:flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="p-0.5 rounded hover:opacity-80"
                        onClick={() => toggleActief(s)}
                        title={s.actief ? "Verbergen" : "Tonen"}
                      >
                        {s.actief ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        className="p-0.5 rounded hover:opacity-80 disabled:opacity-30"
                        disabled={idx === 0}
                        onClick={() => verschuif(s, "omhoog")}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="p-0.5 rounded hover:opacity-80 disabled:opacity-30"
                        disabled={idx === gesorteerdeSecties.length - 1}
                        onClick={() => verschuif(s, "omlaag")}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="p-0.5 rounded hover:opacity-80 text-rose-500"
                        onClick={() => verwijderSectieActie(s)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button variant="outline" size="sm" className="w-full" onClick={() => setSectieDialoogOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Sectie toevoegen
            </Button>
          </div>

          <div className="flex-1 min-w-0">
            <Tabs defaultValue="studio">
              <TabsList className="mb-4">
                <TabsTrigger value="studio"><BookOpen className="h-3.5 w-3.5 mr-1.5" />Studio</TabsTrigger>
                <TabsTrigger value="prijzen"><span className="mr-1.5">&#8364;</span>Prijzen</TabsTrigger>
                <TabsTrigger value="voorbeeld"><Eye className="h-3.5 w-3.5 mr-1.5" />Voorbeeld</TabsTrigger>
                <TabsTrigger value="bijlagen"><Paperclip className="h-3.5 w-3.5 mr-1.5" />Bijlagen</TabsTrigger>
                <TabsTrigger value="versies"><Clock className="h-3.5 w-3.5 mr-1.5" />Versies</TabsTrigger>
                <TabsTrigger value="verzenden"><Send className="h-3.5 w-3.5 mr-1.5" />Verzenden</TabsTrigger>
              </TabsList>

              <TabsContent value="studio">
                {!activeSectie ? (
                  <Card>
                    <CardContent className="py-16 text-center text-muted-foreground">
                      Selecteer een sectie aan de linkerzijde om te beginnen.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <Input
                          value={localTitel}
                          onChange={(e) => { setLocalTitel(e.target.value); setHeeftWijzigingen(true); }}
                          className="text-lg font-semibold border-0 border-b rounded-none px-0 focus-visible:ring-0"
                          placeholder="Sectietitel"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        {heeftWijzigingen && (
                          <span className="text-xs text-amber-600">Niet opgeslagen</span>
                        )}
                        <Button size="sm" variant="outline" onClick={geneerAiTekst} disabled={aiLoading}>
                          <Sparkles className="h-3.5 w-3.5" />
                          {aiLoading ? "Bezig..." : "AI-tekst"}
                        </Button>
                        <Button size="sm" onClick={slaOp} disabled={werkSectie.isPending}>
                          {werkSectie.isPending ? "Opslaan..." : "Opslaan"}
                        </Button>
                      </div>
                    </div>

                    {aiVoorstel && (
                      <Card className="border-amber-200 bg-amber-50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
                            <Sparkles className="h-4 w-4" />
                            AI-voorstel
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <p className="text-sm text-amber-900 whitespace-pre-wrap">{aiVoorstel}</p>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={accepteerAi}>
                              <Check className="h-3.5 w-3.5" /> Overnemen
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setAiVoorstel(null)}>
                              <X className="h-3.5 w-3.5" /> Verwerpen
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <div className="space-y-1.5">
                      <Textarea
                        value={localInhoud}
                        onChange={(e) => { setLocalInhoud(e.target.value); setHeeftWijzigingen(true); }}
                        className="min-h-[400px] font-mono text-sm leading-relaxed resize-y"
                        placeholder="Schrijf de tekst voor deze sectie..."
                      />
                      <p className="text-xs text-muted-foreground text-right">
                        {telWoorden(localInhoud)} woorden
                      </p>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="prijzen">
                <PrijzenTab
                  regels={regels ?? []}
                  offerte={offerte}
                  bewerkRegelId={bewerkRegelId}
                  bewerkPrijs={bewerkPrijs}
                  setBewerkRegelId={(id, huidigePrijs) => {
                    setBewerkRegelId(id);
                    setBewerkPrijs(id !== null ? String(huidigePrijs ?? "") : "");
                  }}
                  setBewerkPrijs={setBewerkPrijs}
                  slaRegelPrijsOp={slaRegelPrijsOp}
                  werkRegelPending={werkRegel.isPending}
                />
              </TabsContent>

              <TabsContent value="voorbeeld">
                <div className="flex justify-end mb-3">
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer className="h-3.5 w-3.5" /> Afdrukken als PDF
                  </Button>
                </div>
                <OfferteVoorbeeldInline
                  offerte={offerte}
                  secties={gesorteerdeSecties.filter((s) => s.actief)}
                  regels={regels ?? []}
                  bijlagen={bijlagen ?? []}
                />
              </TabsContent>

              <TabsContent value="bijlagen">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold">Bijlagen en verwijzingen</h2>
                    <Button size="sm" onClick={() => setBijlageDialoogOpen(true)}>
                      <Plus className="h-3.5 w-3.5" /> Bijlage toevoegen
                    </Button>
                  </div>
                  {(bijlagen ?? []).length === 0 ? (
                    <Card>
                      <CardContent className="py-10 text-center text-muted-foreground">
                        Nog geen bijlagen toegevoegd.
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {(bijlagen ?? []).map((b) => (
                        <Card key={b.id}>
                          <CardContent className="p-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm">{b.naam}</div>
                              {b.beschrijving && (
                                <div className="text-xs text-muted-foreground">{b.beschrijving}</div>
                              )}
                              {b.url && (
                                <a
                                  href={b.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-primary hover:underline"
                                >
                                  {b.url}
                                </a>
                              )}
                            </div>
                            <Badge variant="outline" className="text-xs flex-shrink-0">{b.bijlage_type}</Badge>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-rose-500"
                              onClick={() => verwijderBijlageActie(b.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="versies">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold">Versiehistorie</h2>
                    <Button size="sm" onClick={() => setVersieDialoogOpen(true)}>
                      <Plus className="h-3.5 w-3.5" /> Versie opslaan
                    </Button>
                  </div>
                  {(versies ?? []).length === 0 ? (
                    <Card>
                      <CardContent className="py-10 text-center text-muted-foreground">
                        Nog geen versies opgeslagen. Sla een versie op om de voortgang bij te houden.
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {(versies ?? []).map((v) => (
                        <Card key={v.id}>
                          <CardContent className="p-3 flex items-start gap-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                              {v.versienummer}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm">
                                Versie {v.versienummer}
                                {v.samenvatting && ` — ${v.samenvatting}`}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {datumNl(v.aangemaakt_op)}
                                {v.aangemaakt_door_naam && ` door ${v.aangemaakt_door_naam}`}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="verzenden">
                <VerzendTab
                  offerteId={offerte.id}
                  opdrachtgever={offerte.opdrachtgever}
                  titel={offerte.titel}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <Dialog open={sectieDialoogOpen} onOpenChange={setSectieDialoogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Sectie toevoegen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={nieuwSectieType} onValueChange={(v) => { setNieuwSectieType(v); setNieuwSectieNaam(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SECTIE_TYPEN.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Naam (optioneel — leeg laat standaard toe)</Label>
              <Input
                value={nieuwSectieNaam}
                onChange={(e) => setNieuwSectieNaam(e.target.value)}
                placeholder={SECTIE_TYPEN.find((t) => t.value === nieuwSectieType)?.label ?? ""}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectieDialoogOpen(false)}>Annuleren</Button>
            <Button onClick={voegSectieToee} disabled={maakSectie.isPending}>
              {maakSectie.isPending ? "Bezig..." : "Toevoegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={versieDialoogOpen} onOpenChange={setVersieDialoogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Versie opslaan</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Omschrijving (optioneel)</Label>
              <Input
                value={versieSamenvatting}
                onChange={(e) => setVersieSamenvatting(e.target.value)}
                placeholder="Bijv. eerste concept na klantgesprek"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Er wordt een snapshot van de huidige offerte inclusief alle secties en regels opgeslagen.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVersieDialoogOpen(false)}>Annuleren</Button>
            <Button onClick={slaVersieOp} disabled={maakVersie.isPending}>
              {maakVersie.isPending ? "Bezig..." : "Versie opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bijlageDialoogOpen} onOpenChange={setBijlageDialoogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bijlage toevoegen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <Input
                value={bijlageForm.naam}
                onChange={(e) => setBijlageForm((f) => ({ ...f, naam: e.target.value }))}
                placeholder="Bijv. Referentielijst 2025"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={bijlageForm.bijlage_type}
                onValueChange={(v) => setBijlageForm((f) => ({ ...f, bijlage_type: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BIJLAGE_TYPEN.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Beschrijving</Label>
              <Input
                value={bijlageForm.beschrijving}
                onChange={(e) => setBijlageForm((f) => ({ ...f, beschrijving: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>URL (optioneel)</Label>
              <Input
                value={bijlageForm.url}
                onChange={(e) => setBijlageForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBijlageDialoogOpen(false)}>Annuleren</Button>
            <Button onClick={voegBijlageToe} disabled={maakBijlage.isPending}>
              {maakBijlage.isPending ? "Bezig..." : "Toevoegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OffertePrintView
        offerte={offerte}
        secties={gesorteerdeSecties.filter((s) => s.actief)}
        regels={regels ?? []}
        bijlagen={bijlagen ?? []}
      />
    </>
  );
}

function PrijzenTab({
  regels,
  offerte,
  bewerkRegelId,
  bewerkPrijs,
  setBewerkRegelId,
  setBewerkPrijs,
  slaRegelPrijsOp,
  werkRegelPending,
}: {
  regels: any[];
  offerte: any;
  bewerkRegelId: number | null;
  bewerkPrijs: string;
  setBewerkRegelId: (id: number | null, huidigePrijs?: number) => void;
  setBewerkPrijs: (v: string) => void;
  slaRegelPrijsOp: (id: number) => Promise<void>;
  werkRegelPending: boolean;
}) {
  const maatregelen = regels.filter((r) => r.categorie !== "algemene_kosten");
  const algemeenKosten = regels.filter((r) => r.categorie === "algemene_kosten");
  const subtotaalMaatregelen = maatregelen.reduce((s, r) => s + (r.kosten ?? 0), 0);
  const subtotaalAlgemeen = algemeenKosten.reduce((s, r) => s + (r.kosten ?? 0), 0);
  const totaal = subtotaalMaatregelen + subtotaalAlgemeen;
  const btw = totaal * ((offerte?.btw_percentage ?? 21) / 100);
  const inclBtw = totaal + btw;

  if (regels.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground space-y-2">
          <p>Nog geen begrotingsregels. Gebruik "Uit spots voorbereiden" op de offertenlijstpagina om regels automatisch aan te maken.</p>
        </CardContent>
      </Card>
    );
  }

  function RegelRij({ r }: { r: any }) {
    const isBewerken = bewerkRegelId === r.id;
    return (
      <tr className="border-b hover:bg-muted/30 transition-colors">
        <td className="py-2 px-3">
          <div className="font-medium text-sm">{r.maatregel}</div>
          {r.ruimte && <div className="text-xs text-muted-foreground">{r.ruimte}</div>}
          {r.snag_referentie && <div className="text-xs text-muted-foreground">{r.snag_referentie}</div>}
        </td>
        <td className="py-2 px-3 text-right text-sm text-muted-foreground whitespace-nowrap">{r.eenheid}</td>
        <td className="py-2 px-3 text-right text-sm">{r.aantal}</td>
        <td className="py-2 px-3 text-right">
          {isBewerken ? (
            <div className="flex items-center gap-1 justify-end">
              <Input
                className="w-24 h-7 text-right text-sm"
                value={bewerkPrijs}
                onChange={(e) => setBewerkPrijs(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") slaRegelPrijsOp(r.id);
                  if (e.key === "Escape") setBewerkRegelId(null);
                }}
                autoFocus
              />
              <Button size="icon" className="h-7 w-7" onClick={() => slaRegelPrijsOp(r.id)} disabled={werkRegelPending}>
                <Check className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setBewerkRegelId(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <button
              className="text-sm hover:underline hover:text-primary text-right w-full"
              onClick={() => setBewerkRegelId(r.id, r.prijs_per_eenheid)}
              title="Klik om prijs te bewerken"
            >
              {euro(r.prijs_per_eenheid)}
            </button>
          )}
        </td>
        <td className="py-2 px-3 text-right text-sm font-medium">{euro(r.kosten ?? 0)}</td>
      </tr>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Klik op een prijs om deze te bewerken.</p>
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="py-2 px-3 text-left font-semibold">Maatregel</th>
              <th className="py-2 px-3 text-right font-semibold">Eenheid</th>
              <th className="py-2 px-3 text-right font-semibold">Aantal</th>
              <th className="py-2 px-3 text-right font-semibold">Prijs/eenheid</th>
              <th className="py-2 px-3 text-right font-semibold">Totaal</th>
            </tr>
          </thead>
          <tbody>
            {maatregelen.length > 0 && (
              <>
                <tr className="bg-muted/20">
                  <td colSpan={5} className="py-1.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Maatregelen
                  </td>
                </tr>
                {maatregelen.map((r) => <RegelRij key={r.id} r={r} />)}
                <tr className="bg-muted/10">
                  <td colSpan={4} className="py-1.5 px-3 text-right text-xs text-muted-foreground">Subtotaal maatregelen</td>
                  <td className="py-1.5 px-3 text-right text-sm font-semibold">{euro(subtotaalMaatregelen)}</td>
                </tr>
              </>
            )}
            {algemeenKosten.length > 0 && (
              <>
                <tr className="bg-muted/20">
                  <td colSpan={5} className="py-1.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Algemene kosten
                  </td>
                </tr>
                {algemeenKosten.map((r) => <RegelRij key={r.id} r={r} />)}
                <tr className="bg-muted/10">
                  <td colSpan={4} className="py-1.5 px-3 text-right text-xs text-muted-foreground">Subtotaal algemene kosten</td>
                  <td className="py-1.5 px-3 text-right text-sm font-semibold">{euro(subtotaalAlgemeen)}</td>
                </tr>
              </>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2">
              <td colSpan={4} className="py-2 px-3 text-right text-sm font-semibold">Totaal excl. btw</td>
              <td className="py-2 px-3 text-right font-bold">{euro(totaal)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="py-1 px-3 text-right text-xs text-muted-foreground">Btw {offerte?.btw_percentage ?? 21}%</td>
              <td className="py-1 px-3 text-right text-sm">{euro(btw)}</td>
            </tr>
            <tr className="bg-primary text-primary-foreground">
              <td colSpan={4} className="py-2.5 px-3 text-right font-bold">Totaal incl. btw</td>
              <td className="py-2.5 px-3 text-right font-bold text-base">{euro(inclBtw)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function OfferteVoorbeeldInline({
  offerte,
  secties,
  regels,
  bijlagen,
}: {
  offerte: any;
  secties: any[];
  regels: any[];
  bijlagen: any[];
}) {
  const totaal = regels.reduce((som, r) => som + (r.kosten ?? 0), 0);
  const btw = totaal * ((offerte.btw_percentage ?? 21) / 100);
  const inclBtw = totaal + btw;

  return (
    <div
      className="bg-white border rounded-lg shadow-sm overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif", color: "#1e293b" }}
    >
      <div style={{ background: "#F23B0D", padding: "32px 40px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ color: "white", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
              FPS Brandpreventie
            </div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 2 }}>
              Brandwerende voorzieningen
            </div>
          </div>
          <div style={{ textAlign: "right", color: "white" }}>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Offertenummer</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{offerte.offertenummer ?? "—"}</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>Datum</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{offerte.datum ?? "—"}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "32px 40px", display: "flex", gap: 40, borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Aangeboden aan
          </div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{offerte.opdrachtgever || offerte.klant_naam || "—"}</div>
          {offerte.klant_naam && offerte.opdrachtgever && offerte.klant_naam !== offerte.opdrachtgever && (
            <div style={{ fontSize: 13, color: "#64748b" }}>{offerte.klant_naam}</div>
          )}
          {offerte.gebouw_naam && (
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Betreft: {offerte.gebouw_naam}</div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Offerte
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: "#475569" }}>
            <div><strong style={{ color: "#1e293b" }}>Titel:</strong> {offerte.titel}</div>
            <div><strong style={{ color: "#1e293b" }}>Geldigheid:</strong> {offerte.geldigheid_dagen} dagen</div>
            {offerte.ons_kenmerk && <div><strong style={{ color: "#1e293b" }}>Ons kenmerk:</strong> {offerte.ons_kenmerk}</div>}
            {offerte.uw_kenmerk && <div><strong style={{ color: "#1e293b" }}>Uw kenmerk:</strong> {offerte.uw_kenmerk}</div>}
          </div>
        </div>
      </div>

      <div style={{ padding: "32px 40px" }}>
        {secties.length === 0 && (
          <p style={{ color: "#94a3b8", fontStyle: "italic" }}>Geen actieve secties. Activeer secties in de Studio-tab.</p>
        )}
        {secties.map((s) => (
          <div key={s.id} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#F23B0D", borderBottom: "2px solid #F23B0D", paddingBottom: 6, marginBottom: 12 }}>
              {s.titel}
            </h2>
            {s.inhoud ? (
              <div style={{ fontSize: 14, lineHeight: 1.75, color: "#334155", whiteSpace: "pre-wrap" }}>
                {s.inhoud}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>Nog geen inhoud voor deze sectie.</p>
            )}
          </div>
        ))}

        {regels.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#F23B0D", borderBottom: "2px solid #F23B0D", paddingBottom: 6, marginBottom: 12 }}>
              Begroting
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>Omschrijving</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>Eenheid</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>Aantal</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>Prijs</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>Totaal</th>
                </tr>
              </thead>
              <tbody>
                {regels.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "7px 10px" }}>
                      <div style={{ fontWeight: 500 }}>{r.maatregel}</div>
                      {r.ruimte && <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.ruimte}</div>}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: "#64748b" }}>{r.eenheid}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>{r.aantal}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>{euro(r.prijs_per_eenheid)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 500 }}>{euro(r.kosten)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>Subtotaal excl. btw</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>{euro(totaal)}</td>
                </tr>
                <tr>
                  <td colSpan={4} style={{ padding: "4px 10px", textAlign: "right", color: "#64748b", fontSize: 12 }}>Btw {offerte.btw_percentage ?? 21}%</td>
                  <td style={{ padding: "4px 10px", textAlign: "right", color: "#64748b", fontSize: 12 }}>{euro(btw)}</td>
                </tr>
                <tr style={{ background: "#F23B0D" }}>
                  <td colSpan={4} style={{ padding: "10px 10px", textAlign: "right", fontWeight: 700, color: "white" }}>Totaal incl. btw</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 700, color: "white", fontSize: 15 }}>{euro(inclBtw)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {bijlagen.length > 0 && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#F23B0D", borderBottom: "2px solid #F23B0D", paddingBottom: 6, marginBottom: 12 }}>
              Bijlagen
            </h2>
            <ul style={{ paddingLeft: 20, fontSize: 13, color: "#334155", lineHeight: 1.8 }}>
              {bijlagen.map((b) => (
                <li key={b.id}>
                  {b.naam}
                  {b.beschrijving && ` — ${b.beschrijving}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div style={{ padding: "24px 40px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8" }}>
          <span>FPS Brandpreventie &mdash; Brandwerende voorzieningen</span>
          <span>Geldig tot {offerte.geldigheid_dagen ?? 30} dagen na dagtekening</span>
        </div>
      </div>
    </div>
  );
}

function OffertePrintView({
  offerte,
  secties,
  regels,
  bijlagen,
}: {
  offerte: any;
  secties: any[];
  regels: any[];
  bijlagen: any[];
}) {
  const totaal = regels.reduce((som, r) => som + (r.kosten ?? 0), 0);
  const btw = totaal * ((offerte.btw_percentage ?? 21) / 100);
  const inclBtw = totaal + btw;

  const euro = (bedrag: number) =>
    new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(bedrag ?? 0);

  return (
    <div id="voorbeeld-print" style={{ fontFamily: "Arial, sans-serif", color: "#1e293b", fontSize: 12 }}>
      <div style={{ background: "#F23B0D", padding: "24px 32px 20px", marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "white", fontSize: 20, fontWeight: 700 }}>FPS Brandpreventie</div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 11 }}>Brandwerende voorzieningen</div>
          </div>
          <div style={{ textAlign: "right", color: "white", fontSize: 11 }}>
            <div>Nr: {offerte.offertenummer ?? "—"}</div>
            <div>Datum: {offerte.datum ?? "—"}</div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <strong>Aangeboden aan:</strong> {offerte.opdrachtgever || offerte.klant_naam || "—"}
        {offerte.gebouw_naam && <span> | Betreft: {offerte.gebouw_naam}</span>}
      </div>

      {secties.map((s) => (
        <div key={s.id} style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#F23B0D", borderBottom: "1px solid #F23B0D", paddingBottom: 3, marginBottom: 8 }}>
            {s.titel}
          </div>
          {s.inhoud && (
            <div style={{ lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{s.inhoud}</div>
          )}
        </div>
      ))}

      {regels.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#F23B0D", borderBottom: "1px solid #F23B0D", paddingBottom: 3, marginBottom: 8 }}>
            Begroting
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                <th style={{ textAlign: "left", padding: "5px 6px", border: "1px solid #e2e8f0" }}>Omschrijving</th>
                <th style={{ textAlign: "right", padding: "5px 6px", border: "1px solid #e2e8f0" }}>Eenheid</th>
                <th style={{ textAlign: "right", padding: "5px 6px", border: "1px solid #e2e8f0" }}>Aantal</th>
                <th style={{ textAlign: "right", padding: "5px 6px", border: "1px solid #e2e8f0" }}>Prijs</th>
                <th style={{ textAlign: "right", padding: "5px 6px", border: "1px solid #e2e8f0" }}>Totaal</th>
              </tr>
            </thead>
            <tbody>
              {regels.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0" }}>{r.maatregel}</td>
                  <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", textAlign: "right" }}>{r.eenheid}</td>
                  <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", textAlign: "right" }}>{r.aantal}</td>
                  <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", textAlign: "right" }}>{euro(r.prijs_per_eenheid)}</td>
                  <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", textAlign: "right" }}>{euro(r.kosten)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700 }}>Totaal excl. btw</td>
                <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700 }}>{euro(totaal)}</td>
              </tr>
              <tr>
                <td colSpan={4} style={{ padding: "5px 6px", textAlign: "right" }}>Btw {offerte.btw_percentage ?? 21}%</td>
                <td style={{ padding: "5px 6px", textAlign: "right" }}>{euro(btw)}</td>
              </tr>
              <tr style={{ background: "#F23B0D" }}>
                <td colSpan={4} style={{ padding: "6px 6px", textAlign: "right", fontWeight: 700, color: "white" }}>Totaal incl. btw</td>
                <td style={{ padding: "6px 6px", textAlign: "right", fontWeight: 700, color: "white" }}>{euro(inclBtw)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

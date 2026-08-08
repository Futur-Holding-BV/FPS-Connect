import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useZetAssistentLabel } from "@/lib/assistent-context";
import {
  useGetOfferte,
  useUpdateOfferte,
  useListVoorwaardenSets,
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
  useListOfferteVragen,
  getGetOfferteQueryKey,
  getListOfferteVersiesQueryKey,
  getListOfferteBijlagenQueryKey,
  getListOfferteSectiesQueryKey,
  getListOfferteRegelsQueryKey,
  getListOfferteUitgangspuntenQueryKey,
  getListOfferteVragenQueryKey,
  useMaakOpdracht,
  useListOpdrachten,
  getListOpdrachtenQueryKey,
  useGetAiPresentatieNiveau,
  getListOffertesQueryKey,
  useListOfferteTransitieLog,
  getListOfferteTransitieLogQueryKey,
  useIntrekkenOfferte,
} from "@workspace/api-client-react";
import type { OfferteSectie, OfferteSectieFoto } from "@workspace/api-client-react";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft, Sparkles, ChevronUp, ChevronDown, Eye, Printer, Plus, AlertTriangle,
  Trash2, BookOpen, Clock, Paperclip, Check, X, GripVertical, ToggleLeft, ToggleRight, Send,
  FolderOpen, CreditCard, FileText, Hammer, Layers, FileDown, History, ArrowRight, User,
} from "lucide-react";
import { VerzendTab } from "./verzend-tab";
import { GoedkeuringWidget } from "@/components/goedkeuring/goedkeuring-widget";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { PaginaHulp } from "@/components/pagina-hulp";
import { cn } from "@/lib/utils";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-amber-100 text-amber-800 border-amber-200",
  verzonden: "bg-blue-100 text-blue-800 border-blue-200",
  bekeken: "bg-indigo-100 text-indigo-800 border-indigo-200",
  ondertekend: "bg-emerald-100 text-emerald-800 border-emerald-200",
  geaccepteerd: "bg-emerald-100 text-emerald-800 border-emerald-200",
  afgewezen: "bg-rose-100 text-rose-800 border-rose-200",
  vervallen: "bg-muted text-muted-foreground border-border",
  ingetrokken: "bg-slate-100 text-slate-700 border-slate-300",
};

const STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  verzonden: "Verzonden",
  bekeken: "In behandeling",
  ondertekend: "Geaccepteerd",
  geaccepteerd: "Geaccepteerd",
  afgewezen: "Afgewezen",
  vervallen: "Vervallen",
  ingetrokken: "Ingetrokken",
};

const VOLGENDE_STATUSSEN: Record<string, string[]> = {
  concept: ["verzonden", "afgewezen"],
  verzonden: ["bekeken", "ondertekend", "afgewezen"],
  bekeken: ["ondertekend", "afgewezen"],
  afgewezen: ["concept"],
  ondertekend: [],
  geaccepteerd: [],
  vervallen: [],
  ingetrokken: ["concept"],
};

// Overgangen naar deze statussen zijn (vrijwel) niet terug te draaien — vraag
// altijd expliciete bevestiging voordat de statuswijziging wordt doorgevoerd.
const IRREVERSIBELE_STATUSSEN = new Set(["ondertekend", "vervallen"]);

const SECTIE_TYPEN = [
  { value: "cover", label: "Cover" },
  { value: "aanbiedingsbrief", label: "Aanbiedingsbrief" },
  { value: "over_fps", label: "Over FPS Brandpreventie" },
  { value: "aanleiding", label: "Aanleiding" },
  { value: "huidige_situatie", label: "Huidige situatie" },
  { value: "inspectievindingen", label: "Inspectievindingen" },
  { value: "aanbevolen_oplossing", label: "Aanbevolen oplossing" },
  { value: "technische_toelichting", label: "Technische toelichting" },
  { value: "gebruikte_producten", label: "Gebruikte producten" },
  { value: "planning", label: "Planning" },
  { value: "uitvoeringsmethode", label: "Uitvoeringsmethode" },
  { value: "kwaliteitsborging", label: "Kwaliteitsborging" },
  { value: "certificaten", label: "Certificaten" },
  { value: "garantie", label: "Garantie" },
  { value: "onderhoudsadvies", label: "Onderhoudsadvies" },
  { value: "optioneel_werk", label: "Optioneel werk" },
  { value: "prijsoverzicht", label: "Prijsoverzicht" },
  { value: "bijlagen", label: "Bijlagen" },
  { value: "voorwaarden", label: "Algemene voorwaarden" },
  { value: "ondertekeningspagina", label: "Ondertekeningspagina" },
  { value: "projectomschrijving", label: "Projectomschrijving" },
  { value: "aanpak", label: "Aanpak en methodiek" },
  { value: "team", label: "Team en organisatie" },
  { value: "slotwoord", label: "Slotwoord" },
  { value: "vrij", label: "Vrije sectie" },
];

const BIJLAGE_TYPEN = [
  { value: "eta", label: "ETA (Europese Technische Beoordeling)" },
  { value: "dop", label: "DoP (Prestatieverklaring)" },
  { value: "certificaat", label: "Certificaat" },
  { value: "productblad", label: "Productblad" },
  { value: "foto", label: "Foto" },
  { value: "inspectierapport", label: "Inspectierapport" },
  { value: "tekening", label: "Tekening" },
  { value: "planning", label: "Planning" },
  { value: "garantie", label: "Garantiedocument" },
  { value: "referentieproject", label: "Referentieproject" },
  { value: "overig", label: "Overig" },
];

// Presentatieniveaus (deliverable 5) — drie herkenbare sjabloonnamen.
// Opgeslagen ints blijven 1/3/5; oudere waarden 2/4 blijven backward-compatible
// renderen (print.tsx). Compact=1, Standaard=3, Technisch Advies=5.
const PRESENTATIE_NIVEAUS = [
  { niveau: 1, naam: "Compact", omschrijving: "Alleen categoriesubtotalen en eindtotaal. Geen regelitems zichtbaar voor de klant." },
  { niveau: 3, naam: "Standaard", omschrijving: "Volledige begroting met omschrijvingen, aantallen, eenheidsprijzen en totalen. Dit is de standaardweergave." },
  { niveau: 5, naam: "Technisch Advies", omschrijving: "Volledige begroting inclusief technische onderbouwing en uitgangspunten per regel." },
] as const;

function niveauNaam(niveau: number): string {
  if (niveau <= 1) return "Compact";
  if (niveau >= 5) return "Technisch Advies";
  if (niveau === 2) return "Compact (omschrijvingen)";
  if (niveau === 4) return "Technisch Advies";
  return "Standaard";
}

// Geleide wizard (deliverable 1) — de primaire opbouw-/verzendflow in vaste
// volgorde met Vorige/Volgende. Ondersteunende schermen (versies, historie,
// goedkeuring) staan buiten de lineaire flow en blijven los bereikbaar.
const WIZARD_STAPPEN = [
  { id: "studio", label: "Opbouw" },
  { id: "prijzen", label: "Begroting" },
  { id: "bijlagen", label: "Bijlagen" },
  { id: "condities", label: "Condities" },
  { id: "weergave", label: "Weergave" },
  { id: "voorbeeld", label: "Controle" },
  { id: "verzenden", label: "Verzenden" },
] as const;

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
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("offertes", 2);
  const kanIntrekken = heeftNiveau("offertes", 3);

  const { data: offerte, isLoading: offerteLoading } = useGetOfferte(offerteId, {
    query: { queryKey: getGetOfferteQueryKey(offerteId), enabled: !!offerteId },
  });
  useZetAssistentLabel(offerte?.offertenummer ? `offerte ${offerte.offertenummer}` : null);
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
  const { data: vragen, isLoading: vragenLaden } = useListOfferteVragen(offerteId, {
    query: { queryKey: getListOfferteVragenQueryKey(offerteId), enabled: !!offerteId },
  });
  const { data: transitieLog } = useListOfferteTransitieLog(offerteId, {
    query: { queryKey: getListOfferteTransitieLogQueryKey(offerteId), enabled: !!offerteId },
  });

  const aantalOnbeantwoord = (vragen ?? []).filter((v) => v.antwoord === null || v.antwoord === undefined).length;

  const werkOfferte = useUpdateOfferte();
  const intrekkenMutatie = useIntrekkenOfferte();
  const { data: voorwaardenSets } = useListVoorwaardenSets();

  const maakSectie = useCreateOfferteSectie();
  const werkSectie = useUpdateOfferteSectie();
  const verwijderSectie = useDeleteOfferteSectie();
  const werkRegel = useUpdateOfferteRegel();
  const maakVersie = useCreateOfferteVersie();
  const maakBijlage = useCreateOfferteBijlage();
  const verwijderBijlage = useDeleteOfferteBijlage();

  const opdrachtenParams = { offerte_id: offerteId } as Record<string, unknown>;
  const { data: bestaandeOpdrachten } = useListOpdrachten(
    opdrachtenParams as Parameters<typeof useListOpdrachten>[0],
    { query: { queryKey: getListOpdrachtenQueryKey(opdrachtenParams as Parameters<typeof getListOpdrachtenQueryKey>[0]), enabled: !!offerteId && !!offerte } }
  );
  const bestaandeOpdracht = bestaandeOpdrachten?.[0] ?? null;

  const [maakOpdrachtDialoog, setMaakOpdrachtDialoog] = useState(false);

  const maakOpdrachtMutatie = useMaakOpdracht({
    mutation: {
      onSuccess: (data) => {
        void queryClient.invalidateQueries({ queryKey: getListOpdrachtenQueryKey(opdrachtenParams as Parameters<typeof getListOpdrachtenQueryKey>[0]) });
        toast({ title: "Opdracht aangemaakt" });
        setMaakOpdrachtDialoog(false);
        window.location.href = `/opdrachten/${data.id}`;
      },
      onError: (err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 409) {
          toast({ title: "Er bestaat al een opdracht voor deze offerte", variant: "destructive" });
        } else {
          toast({ title: "Aanmaken mislukt", variant: "destructive" });
        }
      },
    },
  });

  const [stap, setStap] = useState("studio");
  const [activeSectieId, setActiveSectieId] = useState<number | null>(null);
  const [localInhoud, setLocalInhoud] = useState("");
  const [localTitel, setLocalTitel] = useState("");
  const [heeftWijzigingen, setHeeftWijzigingen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiVoorstel, setAiVoorstel] = useState<string | null>(null);
  const [aiContextExtra, setAiContextExtra] = useState("");
  const [fotoLoading, setFotoLoading] = useState(false);
  const [fotoVoorstellen, setFotoVoorstellen] = useState<OfferteSectieFoto[] | null>(null);
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
  const [pdfExporting, setPdfExporting] = useState(false);
  const [vergelijkDialoogOpen, setVergelijkDialoogOpen] = useState(false);
  const [vergelijkVersieIds, setVergelijkVersieIds] = useState<[number | null, number | null]>([null, null]);
  const previewRef = useRef<HTMLDivElement>(null);

  const [conditiesForm, setConditiesForm] = useState({
    betalingstermijn_dagen: 30,
    betaalwijze: "",
    factuur_schema_tekst: "",
    voorwaarden_set_id: undefined as number | undefined,
    vrije_voorwaarden: "",
  });
  const [conditiesOpgeslagen, setConditiesOpgeslagen] = useState(false);
  const [statusWijzigenBusy, setStatusWijzigenBusy] = useState(false);
  const [bevestigStatus, setBevestigStatus] = useState<string | null>(null);
  const [intrekkenDialoogOpen, setIntrekkenDialoogOpen] = useState(false);
  const [intrekkenReden, setIntrekkenReden] = useState("");
  const [intrekkenBusy, setIntrekkenBusy] = useState(false);

  const VERVOLG_OPTIES_LABELS: Record<string, string> = {
    periodiek_onderhoud: "Periodiek onderhoud aanbieden",
    jaarlijkse_inspectie: "Jaarlijkse inspectie aanbieden",
    garantie: "Garantie-informatie opnemen",
    contactpersoon: "Vaste contactpersoon vermelden",
    bedankmail: "Bedankmail na uitvoering",
  };

  const [weergaveForm, setWeergaveForm] = useState({
    presentatie_niveau: 3 as number,
    klant_type: "" as string,
    vervolg_opties: [] as string[],
    vervolg_tekst: "" as string,
  });
  const [weergaveOpgeslagen, setWeergaveOpgeslagen] = useState(false);
  const [weergaveAiLoading, setWeergaveAiLoading] = useState(false);
  const [weergaveAiVoorstel, setWeergaveAiVoorstel] = useState<{ niveau: number; motivatie: string } | null>(null);

  const aiPresentatieNiveau = useGetAiPresentatieNiveau();

  const gesorteerdeSecties = [...(secties ?? [])].sort((a, b) => a.volgorde - b.volgorde);
  const activeSectie = gesorteerdeSecties.find((s) => s.id === activeSectieId) ?? null;

  useEffect(() => {
    if (offerte) {
      setConditiesForm({
        betalingstermijn_dagen: (offerte as any).betalingstermijn_dagen ?? 30,
        betaalwijze: (offerte as any).betaalwijze ?? "",
        factuur_schema_tekst: (offerte as any).factuur_schema ? JSON.stringify((offerte as any).factuur_schema, null, 2) : "",
        voorwaarden_set_id: (offerte as any).voorwaarden_set_id ?? undefined,
        vrije_voorwaarden: (offerte as any).voorwaarden ?? "",
      });
      setWeergaveForm({
        presentatie_niveau: (offerte as any).presentatie_niveau ?? 3,
        klant_type: (offerte as any).klant_type ?? "",
        vervolg_opties: (offerte as any).vervolg_opties ?? [],
        vervolg_tekst: (offerte as any).vervolg_tekst ?? "",
      });
    }
  }, [offerte?.id]);

  async function slaWeergaveOp() {
    try {
      await werkOfferte.mutateAsync({
        id: offerteId,
        data: {
          presentatie_niveau: weergaveForm.presentatie_niveau,
          klant_type: weergaveForm.klant_type || undefined,
          vervolg_opties: weergaveForm.vervolg_opties,
          vervolg_tekst: weergaveForm.vervolg_tekst || undefined,
        } as any,
      });
      await queryClient.invalidateQueries({ queryKey: getGetOfferteQueryKey(offerteId) });
      setWeergaveOpgeslagen(true);
      setTimeout(() => setWeergaveOpgeslagen(false), 2000);
      toast({ title: "Weergaveinstellingen opgeslagen" });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  const klantWeergave: BegrotingWeergave = { ...WEERGAVE_STANDAARD, ...(((offerte as any)?.begroting_weergave as Partial<BegrotingWeergave> | undefined) ?? {}) };

  function slaKlantWeergaveOp(wijziging: Partial<BegrotingWeergave>) {
    if (!offerte) return;
    const nieuw = { ...klantWeergave, ...wijziging };
    werkOfferte.mutate(
      { id: offerteId, data: { begroting_weergave: nieuw } as any },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetOfferteQueryKey(offerteId) }) },
    );
  }

  async function haalAiNiveauOp() {
    setWeergaveAiLoading(true);
    setWeergaveAiVoorstel(null);
    try {
      const res = await aiPresentatieNiveau.mutateAsync({ id: offerteId });
      setWeergaveAiVoorstel(res);
    } catch {
      toast({ title: "AI-voorstel mislukt", variant: "destructive" });
    } finally {
      setWeergaveAiLoading(false);
    }
  }

  function accepteerAiNiveau() {
    if (!weergaveAiVoorstel) return;
    setWeergaveForm((f) => ({ ...f, presentatie_niveau: weergaveAiVoorstel.niveau }));
    setWeergaveAiVoorstel(null);
  }

  async function slaRegelWeergaveOp(regelId: number, override: string | null) {
    try {
      await werkRegel.mutateAsync({ id: regelId, data: { weergave_override: override } as any });
      await queryClient.invalidateQueries({ queryKey: getListOfferteRegelsQueryKey(offerteId) });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function voerIntrekkenUit() {
    if (!intrekkenReden.trim()) return;
    setIntrekkenBusy(true);
    try {
      await intrekkenMutatie.mutateAsync({ id: offerteId, data: { reden: intrekkenReden.trim() } });
      await queryClient.invalidateQueries({ queryKey: getGetOfferteQueryKey(offerteId) });
      await queryClient.invalidateQueries({ queryKey: getListOffertesQueryKey() });
      toast({ title: "Offerte ingetrokken" });
      setIntrekkenDialoogOpen(false);
      setIntrekkenReden("");
    } catch {
      toast({ title: "Intrekken mislukt", variant: "destructive" });
    } finally {
      setIntrekkenBusy(false);
    }
  }

  async function wijzigStatus(nieuweStatus: string) {
    setStatusWijzigenBusy(true);
    try {
      await werkOfferte.mutateAsync({ id: offerteId, data: { status: nieuweStatus } as any });
      await queryClient.invalidateQueries({ queryKey: getGetOfferteQueryKey(offerteId) });
      await queryClient.invalidateQueries({ queryKey: getListOffertesQueryKey() });
      toast({ title: `Status gewijzigd naar "${STATUS_LABEL[nieuweStatus] ?? nieuweStatus}"` });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        toast({ title: "Statuswijziging niet toegestaan", description: "Deze overgang is niet mogelijk vanuit de huidige status.", variant: "destructive" });
      } else {
        toast({ title: "Status wijzigen mislukt", variant: "destructive" });
      }
    } finally {
      setStatusWijzigenBusy(false);
    }
  }

  async function exporteerPdf() {
    const el = previewRef.current;
    if (!el) {
      toast({ title: "Preview niet gevonden — scroll naar de inline voorvertoning", variant: "destructive" });
      return;
    }
    setPdfExporting(true);
    try {
      const canvas = await html2canvas(el, { useCORS: true, scale: 2, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * pageW) / canvas.width;
      let yOffset = 0;
      let remaining = imgH;
      while (remaining > 0) {
        pdf.addImage(imgData, "JPEG", 0, -yOffset, imgW, imgH);
        remaining -= pageH;
        yOffset += pageH;
        if (remaining > 0) pdf.addPage();
      }
      const bestandsnaam = `Offerte-${offerte?.offertenummer ?? offerteId}.pdf`;
      pdf.save(bestandsnaam);
      toast({ title: "PDF opgeslagen" });
    } catch {
      toast({ title: "PDF genereren mislukt", variant: "destructive" });
    } finally {
      setPdfExporting(false);
    }
  }

  async function slaConditiesOp() {
    try {
      let factuurSchema: object | undefined;
      if (conditiesForm.factuur_schema_tekst.trim()) {
        try { factuurSchema = JSON.parse(conditiesForm.factuur_schema_tekst); } catch { /* negeer parse-fout */ }
      }
      await werkOfferte.mutateAsync({
        id: offerteId,
        data: {
          betalingstermijn_dagen: conditiesForm.betalingstermijn_dagen,
          betaalwijze: conditiesForm.betaalwijze || undefined,
          factuur_schema: factuurSchema,
          voorwaarden_set_id: conditiesForm.voorwaarden_set_id ?? null,
          voorwaarden: conditiesForm.vrije_voorwaarden || undefined,
        } as any,
      });
      await queryClient.invalidateQueries({ queryKey: getGetOfferteQueryKey(offerteId) });
      setConditiesOpgeslagen(true);
      setTimeout(() => setConditiesOpgeslagen(false), 2000);
      toast({ title: "Betaalcondities opgeslagen" });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

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
        body: JSON.stringify(aiContextExtra.trim() ? { context_extra: aiContextExtra.trim() } : {}),
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

  async function geneerAiFotos() {
    if (!activeSectieId) return;
    setFotoLoading(true);
    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${BASE}/api/offerte-secties/${activeSectieId}/ai-fotos-voorstel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!resp.ok) throw new Error("AI niet beschikbaar");
      const data = (await resp.json()) as { voorstellen: OfferteSectieFoto[]; boodschap?: string | null };
      const reedsGekozen = new Set((activeSectie?.fotos ?? []).map((f) => f.visual_id));
      const nieuwe = (data.voorstellen ?? []).filter((v) => !reedsGekozen.has(v.visual_id));
      setFotoVoorstellen(nieuwe);
      if (nieuwe.length === 0) {
        toast({ title: data.boodschap ?? "Geen nieuwe foto's gevonden voor dit hoofdstuk" });
      }
    } catch {
      toast({ title: "AI-fotoselectie niet beschikbaar op dit moment", variant: "destructive" });
    } finally {
      setFotoLoading(false);
    }
  }

  async function bewaarSectieFotos(fotos: OfferteSectieFoto[]) {
    if (!activeSectieId) return;
    try {
      await werkSectie.mutateAsync({ id: activeSectieId, data: { fotos } });
      await herlaad();
    } catch {
      toast({ title: "Foto's opslaan mislukt", variant: "destructive" });
    }
  }

  async function accepteerFoto(foto: OfferteSectieFoto) {
    const huidige = activeSectie?.fotos ?? [];
    if (huidige.some((f) => f.visual_id === foto.visual_id)) return;
    await bewaarSectieFotos([...huidige, foto]);
    setFotoVoorstellen((prev) => (prev ? prev.filter((v) => v.visual_id !== foto.visual_id) : prev));
  }

  function verwerpFoto(foto: OfferteSectieFoto) {
    setFotoVoorstellen((prev) => (prev ? prev.filter((v) => v.visual_id !== foto.visual_id) : prev));
  }

  async function verwijderSectieFoto(foto: OfferteSectieFoto) {
    const huidige = activeSectie?.fotos ?? [];
    await bewaarSectieFotos(huidige.filter((f) => f.visual_id !== foto.visual_id));
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

  async function toggleRegelOptioneel(regelId: number, huidig: boolean) {
    try {
      await werkRegel.mutateAsync({
        id: regelId,
        data: { is_optioneel: !huidig } as any,
      });
      await queryClient.invalidateQueries({ queryKey: getListOfferteRegelsQueryKey(offerteId) });
      toast({ title: !huidig ? "Gemarkeerd als optioneel" : "Optioneel ongedaan gemaakt" });
    } catch {
      toast({ title: "Wijzigen mislukt", variant: "destructive" });
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
        <PaginaHulp pagina="offerte-studio" />
        {offerte.gebouw_id && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <FolderOpen className="h-5 w-5 text-emerald-600 shrink-0" />
            <div className="flex-1">
              <span className="text-sm font-medium text-emerald-800">
                {offerte.auto_project_id ? "Project geopend" : "Gekoppeld aan project"}
              </span>
              <span className="text-sm text-emerald-700">
                {offerte.auto_project_id
                  ? " — deze offerte is omgezet naar een project."
                  : " — deze offerte hoort bij een gebouwdossier."}
              </span>
            </div>
            <Link href={`/gebouwen/${offerte.gebouw_id}`}>
              <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 shrink-0">
                Terug naar project
              </Button>
            </Link>
          </div>
        )}

        {bestaandeOpdracht ? (
          <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <Hammer className="h-5 w-5 text-blue-600 shrink-0" />
            <div className="flex-1">
              <span className="text-sm font-medium text-blue-800">Opdracht aangemaakt</span>
              <span className="text-sm text-blue-700"> — werkbegroting en planningskoppeling zijn beschikbaar.</span>
            </div>
            <Link href={`/opdrachten/${bestaandeOpdracht.id}`}>
              <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100 shrink-0">
                Ga naar opdracht
              </Button>
            </Link>
          </div>
        ) : (offerte as unknown as Record<string, unknown>).portaal_status && ["akkoord", "ondertekend"].includes(String((offerte as unknown as Record<string, unknown>).portaal_status)) ? (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <Hammer className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <span className="text-sm font-medium text-amber-800">Offerte geaccepteerd</span>
              <span className="text-sm text-amber-700"> — zet om naar een uitvoeropdracht met werkbegroting.</span>
            </div>
            <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 shrink-0" onClick={() => setMaakOpdrachtDialoog(true)}>
              <Hammer className="h-3.5 w-3.5" /> Maak opdracht
            </Button>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/offertes">
              <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight">{offerte.titel}</h1>
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge variant="outline" className={STATUS_KLEUR[offerte.status] ?? ""}>
                    {STATUS_LABEL[offerte.status] ?? offerte.status}
                  </Badge>
                  {offerte.calculatie_id && (
                    <Badge variant="outline" className="px-3 py-1 text-sm font-normal bg-blue-50 text-blue-700 border-blue-200">
                      <Hammer className="h-3 w-3 mr-1.5" />
                      Op basis van calculatie:{" "}
                      <Link href={`/modules/calculaties/${offerte.calculatie_id}`} className="ml-1 font-semibold hover:underline text-blue-700">
                        {offerte.calculatie_naam || `#${offerte.calculatie_id}`}
                      </Link>
                    </Badge>
                  )}
                </div>
                {kanSchrijven && (VOLGENDE_STATUSSEN[offerte.status] ?? []).length > 0 && (
                  <Select
                    value=""
                    onValueChange={(v) => {
                      if (!v) return;
                      if (IRREVERSIBELE_STATUSSEN.has(v)) { setBevestigStatus(v); return; }
                      void wijzigStatus(v);
                    }}
                    disabled={statusWijzigenBusy}
                  >
                    <SelectTrigger className="h-7 text-xs px-2.5 w-auto gap-1">
                      <SelectValue placeholder={statusWijzigenBusy ? "Bezig…" : "Status wijzigen"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(VOLGENDE_STATUSSEN[offerte.status] ?? []).map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABEL[s] ?? s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <AlertDialog open={bevestigStatus !== null} onOpenChange={(open) => { if (!open) setBevestigStatus(null); }}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Status wijzigen naar &quot;{bevestigStatus ? (STATUS_LABEL[bevestigStatus] ?? bevestigStatus) : ""}&quot;?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Deze statuswijziging is niet terug te draaien. Weet je zeker dat je wilt doorgaan?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setBevestigStatus(null)}>Annuleren</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          const doel = bevestigStatus;
                          setBevestigStatus(null);
                          if (doel) void wijzigStatus(doel);
                        }}
                      >
                        Bevestigen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {kanIntrekken && (offerte.status === "verzonden" || offerte.status === "bekeken") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5"
                    onClick={() => { setIntrekkenReden(""); setIntrekkenDialoogOpen(true); }}
                  >
                    Intrekken
                  </Button>
                )}
                <Dialog open={intrekkenDialoogOpen} onOpenChange={(open) => { if (!open) setIntrekkenDialoogOpen(false); }}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Offerte intrekken</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                      De offerte wordt formeel ingetrokken. De klant kan daarna niet meer ondertekenen. Geef een reden op voor de audittrail.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="intrekken-reden">Reden (verplicht)</Label>
                      <Textarea
                        id="intrekken-reden"
                        value={intrekkenReden}
                        onChange={(e) => setIntrekkenReden(e.target.value)}
                        placeholder="Geef een reden op voor het intrekken van deze offerte…"
                        rows={3}
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIntrekkenDialoogOpen(false)} disabled={intrekkenBusy}>Annuleren</Button>
                      <Button
                        variant="destructive"
                        onClick={() => void voerIntrekkenUit()}
                        disabled={intrekkenBusy || !intrekkenReden.trim()}
                      >
                        {intrekkenBusy ? "Bezig…" : "Offerte intrekken"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
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
            <a
              href={`/api/offertes/${offerteId}/pdf`}
              download
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <FileDown className="h-3.5 w-3.5" /> PDF downloaden
            </a>
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
            <Tabs value={stap} onValueChange={setStap}>
              {(() => {
                const huidigeIndex = WIZARD_STAPPEN.findIndex((w) => w.id === stap);
                const inWizard = huidigeIndex >= 0;
                return (
                  <div className="mb-4 space-y-3">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {WIZARD_STAPPEN.map((w, i) => {
                        const actief = w.id === stap;
                        const voltooid = inWizard && i < huidigeIndex;
                        return (
                          <div key={w.id} className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setStap(w.id)}
                              className={
                                "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors " +
                                (actief
                                  ? "bg-primary text-primary-foreground"
                                  : voltooid
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground hover:bg-muted/70")
                              }
                            >
                              <span
                                className={
                                  "flex h-5 w-5 items-center justify-center rounded-full text-[11px] " +
                                  (actief ? "bg-primary-foreground/20" : voltooid ? "bg-primary/20" : "bg-background")
                                }
                              >
                                {voltooid ? <Check className="h-3 w-3" /> : i + 1}
                              </span>
                              {w.label}
                              {w.id === "verzenden" && aantalOnbeantwoord > 0 && (
                                <span className="inline-flex items-center justify-center rounded-full bg-rose-600 text-white text-[10px] font-bold leading-none h-4 min-w-4 px-1">
                                  {aantalOnbeantwoord}
                                </span>
                              )}
                            </button>
                            {i < WIZARD_STAPPEN.length - 1 && (
                              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Extra:</span>
                      <button type="button" onClick={() => setStap("versies")} className={"inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-muted " + (stap === "versies" ? "text-primary font-medium" : "")}>
                        <Clock className="h-3.5 w-3.5" />Versies
                      </button>
                      <button type="button" onClick={() => setStap("historie")} className={"inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-muted " + (stap === "historie" ? "text-primary font-medium" : "")}>
                        <History className="h-3.5 w-3.5" />Historie
                      </button>
                      <button type="button" onClick={() => setStap("goedkeuring")} className={"inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-muted " + (stap === "goedkeuring" ? "text-primary font-medium" : "")}>
                        <Check className="h-3.5 w-3.5" />Goedkeuring
                      </button>
                    </div>
                  </div>
                );
              })()}

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

                    <Input
                      value={aiContextExtra}
                      onChange={(e) => setAiContextExtra(e.target.value)}
                      className="text-xs h-8"
                      placeholder="Extra context voor AI-tekst (optioneel)"
                    />

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

                    <Card>
                      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 space-y-0">
                        <div>
                          <CardTitle className="text-sm">Foto's bij dit hoofdstuk</CardTitle>
                          <p className="text-xs text-muted-foreground mt-1">
                            Referentiefoto's uit de Beeldbibliotheek. Zichtbaar in het klantdocument wanneer "Foto's tonen" aanstaat.
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={geneerAiFotos} disabled={fotoLoading}>
                          <Sparkles className="h-3.5 w-3.5" />
                          {fotoLoading ? "Bezig..." : "AI-fotoselectie"}
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {(activeSectie.fotos ?? []).length === 0 ? (
                          <p className="text-xs text-muted-foreground">Nog geen foto's gekoppeld.</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {(activeSectie.fotos ?? []).map((foto) => (
                              <div key={foto.visual_id} className="rounded-md border overflow-hidden">
                                <img
                                  src={foto.thumbnail_url ?? foto.url}
                                  alt={foto.naam}
                                  className="h-28 w-full object-cover bg-muted"
                                />
                                <div className="p-2 space-y-1">
                                  <p className="text-xs font-medium truncate" title={foto.naam}>{foto.naam}</p>
                                  {foto.privacy_waarschuwing && (
                                    <p className="text-[11px] text-amber-700 flex items-start gap-1">
                                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                      {foto.privacy_waarschuwing}
                                    </p>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-full text-destructive"
                                    onClick={() => verwijderSectieFoto(foto)}
                                  >
                                    <X className="h-3.5 w-3.5" /> Verwijderen
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {fotoVoorstellen && fotoVoorstellen.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
                              <Sparkles className="h-3.5 w-3.5" /> AI-voorstellen — beoordeel per foto
                            </p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              {fotoVoorstellen.map((foto) => (
                                <div key={foto.visual_id} className="rounded-md border border-amber-200 bg-amber-50 overflow-hidden">
                                  <img
                                    src={foto.thumbnail_url ?? foto.url}
                                    alt={foto.naam}
                                    className="h-32 w-full object-cover bg-muted"
                                  />
                                  <div className="p-2 space-y-1.5">
                                    <p className="text-xs font-medium truncate" title={foto.naam}>{foto.naam}</p>
                                    {foto.motivatie && (
                                      <p className="text-[11px] text-amber-900">{foto.motivatie}</p>
                                    )}
                                    {foto.privacy_waarschuwing && (
                                      <p className="text-[11px] text-red-700 flex items-start gap-1">
                                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                        {foto.privacy_waarschuwing}
                                      </p>
                                    )}
                                    <div className="flex gap-2 pt-0.5">
                                      <Button size="sm" className="h-7 flex-1" onClick={() => accepteerFoto(foto)}>
                                        <Check className="h-3.5 w-3.5" /> Overnemen
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-7 flex-1" onClick={() => verwerpFoto(foto)}>
                                        <X className="h-3.5 w-3.5" /> Verwerpen
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
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
                  toggleOptioneel={toggleRegelOptioneel}
                />
              </TabsContent>

              <TabsContent value="condities">
                <div className="space-y-5">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CreditCard className="h-4 w-4" /> Betaalcondities
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>Betalingstermijn (dagen)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={conditiesForm.betalingstermijn_dagen}
                            onChange={(e) => setConditiesForm((f) => ({ ...f, betalingstermijn_dagen: Number(e.target.value) }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Betaalwijze</Label>
                          <Select
                            value={conditiesForm.betaalwijze || "geen"}
                            onValueChange={(v) => setConditiesForm((f) => ({ ...f, betaalwijze: v === "geen" ? "" : v }))}
                          >
                            <SelectTrigger><SelectValue placeholder="Kies..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="geen">Niet opgegeven</SelectItem>
                              <SelectItem value="overboeking">Overboeking</SelectItem>
                              <SelectItem value="incasso">Automatische incasso</SelectItem>
                              <SelectItem value="contant">Contant</SelectItem>
                              <SelectItem value="pin">Pinbetaling</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          Factuurschema
                          <span className="text-xs text-muted-foreground font-normal">(JSON — bijv. termijnen)</span>
                        </Label>
                        <Textarea
                          value={conditiesForm.factuur_schema_tekst}
                          onChange={(e) => setConditiesForm((f) => ({ ...f, factuur_schema_tekst: e.target.value }))}
                          placeholder={'{\n  "termijnen": [\n    { "beschrijving": "Bij opdracht", "percentage": 30 },\n    { "beschrijving": "Bij oplevering", "percentage": 70 }\n  ]\n}'}
                          className="font-mono text-xs min-h-[100px]"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4" /> Algemene voorwaarden
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {(voorwaardenSets ?? []).length > 0 && (
                        <div className="space-y-1.5">
                          <Label>Kies uit de bibliotheek</Label>
                          <Select
                            value={conditiesForm.voorwaarden_set_id ? String(conditiesForm.voorwaarden_set_id) : "geen"}
                            onValueChange={(v) => {
                              const id = v === "geen" ? undefined : Number(v);
                              const set = (voorwaardenSets ?? []).find((s) => s.id === id);
                              setConditiesForm((f) => ({
                                ...f,
                                voorwaarden_set_id: id,
                                vrije_voorwaarden: set ? set.tekst : f.vrije_voorwaarden,
                              }));
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder="Geen voorwaardenset" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="geen">Vrije tekst (geen set)</SelectItem>
                              {(voorwaardenSets ?? []).filter((s) => s.actief).map((s) => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                  {s.naam} {s.versie ? `(v${s.versie})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {conditiesForm.voorwaarden_set_id && (
                            <p className="text-xs text-muted-foreground">
                              Bij verzenden wordt de tekst van de geselecteerde set vastgelegd als onveranderbare snapshot.
                            </p>
                          )}
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <Label>{conditiesForm.voorwaarden_set_id ? "Voorwaardentekst (preview uit set)" : "Vrije voorwaardentekst"}</Label>
                        <Textarea
                          value={conditiesForm.vrije_voorwaarden}
                          onChange={(e) => setConditiesForm((f) => ({ ...f, vrije_voorwaarden: e.target.value, voorwaarden_set_id: undefined }))}
                          placeholder="Bijv. Op al onze leveringen zijn de Algemene Voorwaarden van FPS Brandpreventie van toepassing..."
                          className="min-h-[160px]"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end">
                    <Button onClick={slaConditiesOp} disabled={werkOfferte.isPending}>
                      {conditiesOpgeslagen ? <><Check className="h-3.5 w-3.5" /> Opgeslagen</> : werkOfferte.isPending ? "Bezig..." : "Condities opslaan"}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="weergave">
                <div className="space-y-5">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Layers className="h-4 w-4" /> Presentatieniveau
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-xs text-muted-foreground">
                        Bepaal hoeveel budgetdetail de klant ziet in de offerte-PDF. Standaard is de gebruikelijke weergave.
                      </p>

                      {weergaveAiVoorstel && (
                        <Card className="border-amber-200 bg-amber-50">
                          <CardContent className="py-3 space-y-2">
                            <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                              <Sparkles className="h-4 w-4" />
                              AI-voorstel: {niveauNaam(weergaveAiVoorstel.niveau)}
                            </div>
                            <p className="text-xs text-amber-900">{weergaveAiVoorstel.motivatie}</p>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={accepteerAiNiveau}>
                                <Check className="h-3.5 w-3.5" /> Overnemen
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setWeergaveAiVoorstel(null)}>
                                <X className="h-3.5 w-3.5" /> Verwerpen
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      <div className="space-y-2">
                        {PRESENTATIE_NIVEAUS.map(({ niveau, naam, omschrijving }) => {
                          const actief = weergaveForm.presentatie_niveau === niveau
                            || (niveau === 1 && weergaveForm.presentatie_niveau === 2)
                            || (niveau === 5 && weergaveForm.presentatie_niveau === 4);
                          return (
                            <label
                              key={niveau}
                              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${actief ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
                            >
                              <input
                                type="radio"
                                name="presentatie_niveau"
                                value={niveau}
                                checked={actief}
                                onChange={() => setWeergaveForm((f) => ({ ...f, presentatie_niveau: niveau }))}
                                className="mt-0.5 accent-primary"
                              />
                              <div>
                                <div className="text-sm font-medium">{naam}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{omschrijving}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>Klanttype</Label>
                          <Select
                            value={weergaveForm.klant_type || "geen"}
                            onValueChange={(v) => setWeergaveForm((f) => ({ ...f, klant_type: v === "geen" ? "" : v }))}
                          >
                            <SelectTrigger><SelectValue placeholder="Kies klanttype..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="geen">Niet opgegeven</SelectItem>
                              <SelectItem value="woningcorporatie">Woningcorporatie</SelectItem>
                              <SelectItem value="VvE">VvE</SelectItem>
                              <SelectItem value="gemeente">Gemeente</SelectItem>
                              <SelectItem value="school">School / onderwijsinstelling</SelectItem>
                              <SelectItem value="zorginstelling">Zorginstelling</SelectItem>
                              <SelectItem value="architect">Architect / adviseur</SelectItem>
                              <SelectItem value="aannemer">Aannemer</SelectItem>
                              <SelectItem value="installateur">Installateur</SelectItem>
                              <SelectItem value="gebouweigenaar">Gebouweigenaar</SelectItem>
                              <SelectItem value="bedrijf">Bedrijf (overig)</SelectItem>
                              <SelectItem value="particulier">Particulier</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={haalAiNiveauOp}
                            disabled={weergaveAiLoading}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            {weergaveAiLoading ? "Bezig..." : "AI-voorstel"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Eye className="h-4 w-4" /> Klantweergave — wat de klant ziet
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-xs text-muted-foreground">
                        Fijnafstelling bovenop het presentatieniveau. Schakel per onderdeel aan of uit wat in de klant-PDF verschijnt.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            { key: "toon_hoofdstukken" as const, label: "Hoofdstukken (teksten)" },
                            { key: "toon_regelomschrijving" as const, label: "Regelomschrijvingen" },
                            { key: "toon_ruimte" as const, label: "Locatie / ruimte" },
                            { key: "toon_spotnummer" as const, label: "Spotnummer / referentie" },
                            { key: "toon_fotos" as const, label: "Referentiefoto's" },
                            { key: "toon_aantal" as const, label: "Aantallen" },
                            { key: "toon_eenheid" as const, label: "Eenheden" },
                          ] as const
                        ).map(({ key, label }) => (
                          <button
                            key={key}
                            onClick={() => slaKlantWeergaveOp({ [key]: !klantWeergave[key] })}
                            disabled={werkOfferte.isPending}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                              klantWeergave[key]
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground border-border hover:border-primary/50"
                            }`}
                          >
                            {klantWeergave[key] ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="space-y-1.5 max-w-xs">
                        <Label className="text-xs">Regels samenvoegen / groeperen</Label>
                        <Select
                          value={klantWeergave.groepering}
                          onValueChange={(v) => slaKlantWeergaveOp({ groepering: v as BegrotingWeergave["groepering"] })}
                          disabled={werkOfferte.isPending}
                        >
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="categorie">Per categorie (Maatregelen / Algemene kosten)</SelectItem>
                            <SelectItem value="geen">Geen groepering — alles in volgorde</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Deze instellingen worden direct opgeslagen en gelden alleen voor deze offerte.
                      </p>
                    </CardContent>
                  </Card>

                  {(regels ?? []).length > 0 && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <FileText className="h-4 w-4" /> Regeloverschrijvingen
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-muted-foreground mb-3">
                          Overschrijf per regel of deze altijd of nooit wordt getoond, ongeacht het ingestelde niveau.
                        </p>
                        <div className="divide-y">
                          {(regels ?? []).map((r) => (
                            <div key={r.id} className="flex items-center justify-between py-2 gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm truncate">{r.maatregel || "(naamloos)"}</div>
                                {r.categorie && <div className="text-xs text-muted-foreground">{r.categorie}</div>}
                              </div>
                              <Select
                                value={(r as any).weergave_override ?? "niveau"}
                                onValueChange={(v) => slaRegelWeergaveOp(r.id, v === "niveau" ? null : v)}
                              >
                                <SelectTrigger className="w-36 h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="niveau">Volg niveau</SelectItem>
                                  <SelectItem value="altijd">Altijd tonen</SelectItem>
                                  <SelectItem value="nooit">Nooit tonen</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Hammer className="h-4 w-4" /> Na uitvoering
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-xs text-muted-foreground">
                        Selecteer welke vervolgopties in de offerte worden opgenomen als commercieel slot.
                      </p>
                      <div className="space-y-2">
                        {Object.entries(VERVOLG_OPTIES_LABELS).map(([sleutel, label]) => (
                          <label key={sleutel} className="flex items-center gap-2.5 cursor-pointer">
                            <Checkbox
                              checked={weergaveForm.vervolg_opties.includes(sleutel)}
                              onCheckedChange={(checked) =>
                                setWeergaveForm((f) => ({
                                  ...f,
                                  vervolg_opties: checked
                                    ? [...f.vervolg_opties, sleutel]
                                    : f.vervolg_opties.filter((o) => o !== sleutel),
                                }))
                              }
                            />
                            <span className="text-sm">{label}</span>
                          </label>
                        ))}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Aanvullende tekst (optioneel)</Label>
                        <Textarea
                          value={weergaveForm.vervolg_tekst}
                          onChange={(e) => setWeergaveForm((f) => ({ ...f, vervolg_tekst: e.target.value }))}
                          placeholder="Bijv. Voor vragen over onderhoud en garantie kunt u contact opnemen met..."
                          className="min-h-[100px] text-sm"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end">
                    <Button onClick={slaWeergaveOp} disabled={werkOfferte.isPending}>
                      {weergaveOpgeslagen ? <><Check className="h-3.5 w-3.5" /> Opgeslagen</> : werkOfferte.isPending ? "Bezig..." : "Weergave opslaan"}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="voorbeeld">
                {(() => {
                  const actieveSecties = gesorteerdeSecties.filter((s) => s.actief);
                  const legeSecties = actieveSecties.filter((s) => !(s.inhoud ?? "").trim());
                  const punten: { ok: boolean; label: string }[] = [
                    { ok: !!(offerte.opdrachtgever || (offerte as any).klant_naam), label: "Opdrachtgever ingevuld" },
                    { ok: actieveSecties.length > 0, label: "Minstens één hoofdstuk actief" },
                    { ok: legeSecties.length === 0, label: legeSecties.length === 0 ? "Alle actieve hoofdstukken hebben tekst" : `Hoofdstuk zonder tekst: ${legeSecties.map((s) => s.titel).join(", ")}` },
                    { ok: (regels ?? []).length > 0, label: "Minstens één begrotingsregel" },
                    { ok: !!conditiesForm.betalingstermijn_dagen || !!conditiesForm.betaalwijze, label: "Betaalconditie ingesteld" },
                    { ok: !!conditiesForm.voorwaarden_set_id || !!conditiesForm.vrije_voorwaarden.trim(), label: "Algemene voorwaarden gekozen" },
                  ];
                  const ontbreekt = punten.filter((p) => !p.ok);
                  return (
                    <Card className={"mb-4 " + (ontbreekt.length === 0 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}>
                      <CardHeader className="pb-2">
                        <CardTitle className={"text-sm flex items-center gap-2 " + (ontbreekt.length === 0 ? "text-emerald-800" : "text-amber-800")}>
                          {ontbreekt.length === 0 ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                          {ontbreekt.length === 0
                            ? "Volledigheidscontrole: alles compleet"
                            : `Volledigheidscontrole: ${ontbreekt.length} aandachtspunt${ontbreekt.length === 1 ? "" : "en"}`}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-1.5">
                          {punten.map((p, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              {p.ok ? (
                                <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                              ) : (
                                <X className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                              )}
                              <span className={p.ok ? "text-muted-foreground" : "text-amber-900 font-medium"}>{p.label}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  );
                })()}

                <div className="flex justify-end mb-3 gap-2 flex-wrap">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => void exporteerPdf()}
                    disabled={pdfExporting}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    {pdfExporting ? "Bezig…" : "PDF opslaan"}
                  </Button>
                  <a
                    href={`/offertes/${offerteId}/print`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <Printer className="h-3.5 w-3.5" /> DDS afdrukken
                  </a>
                  <Button variant="ghost" size="sm" onClick={() => window.print()}>
                    <Printer className="h-3.5 w-3.5" /> Eenvoudig afdrukken
                  </Button>
                </div>

                <div className="mb-4 rounded-lg border overflow-hidden bg-muted/30">
                  <div className="flex items-center gap-2 border-b bg-background px-3 py-2 text-xs font-medium text-muted-foreground">
                    <Eye className="h-3.5 w-3.5" /> Live PDF-voorvertoning (definitieve opmaak)
                  </div>
                  <iframe
                    key={stap === "voorbeeld" ? "actief" : "inactief"}
                    src={`/offertes/${offerteId}/print`}
                    title="Live PDF-voorvertoning"
                    className="w-full bg-white"
                    style={{ height: 720, border: "none" }}
                  />
                </div>

                <div ref={previewRef}>
                  <OfferteVoorbeeldInline
                    offerte={offerte}
                    secties={gesorteerdeSecties.filter((s) => s.actief)}
                    regels={regels ?? []}
                    bijlagen={bijlagen ?? []}
                  />
                </div>
              </TabsContent>

              <TabsContent value="bijlagen">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold">Verwijzingen</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Certificaten, referenties en documenten die als bijlagelijst in de offerte worden opgenomen.</p>
                    </div>
                    <Button size="sm" onClick={() => setBijlageDialoogOpen(true)}>
                      <Plus className="h-3.5 w-3.5" /> Verwijzing toevoegen
                    </Button>
                  </div>
                  {(bijlagen ?? []).length === 0 ? (
                    <Card>
                      <CardContent className="py-10 text-center text-muted-foreground">
                        Nog geen verwijzingen toegevoegd. Voeg bijvoorbeeld uw VCA-certificaat, een referentieproject of algemene voorwaarden toe.
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
                    <div className="flex gap-2">
                      {(versies ?? []).length >= 2 && (
                        <Button size="sm" variant="outline" onClick={() => {
                          const vs = versies ?? [];
                          setVergelijkVersieIds([vs[vs.length - 1].id, vs[vs.length - 2].id]);
                          setVergelijkDialoogOpen(true);
                        }}>
                          <History className="h-3.5 w-3.5" /> Vergelijk
                        </Button>
                      )}
                      <Button size="sm" onClick={() => setVersieDialoogOpen(true)}>
                        <Plus className="h-3.5 w-3.5" /> Versie opslaan
                      </Button>
                    </div>
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
                            {(versies ?? []).length >= 2 && (
                              <button
                                className="text-xs text-muted-foreground hover:text-primary underline shrink-0"
                                onClick={() => {
                                  const vs = versies ?? [];
                                  const ander = vs.find((x) => x.id !== v.id);
                                  if (ander) {
                                    setVergelijkVersieIds([v.id, ander.id]);
                                    setVergelijkDialoogOpen(true);
                                  }
                                }}
                              >
                                Vergelijk
                              </button>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="goedkeuring">
                <div className="space-y-4">
                  <h2 className="font-semibold">Goedkeuring</h2>
                  <Card>
                    <CardContent className="pt-5 space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Als het goedkeuringsbeleid een formele aanvraag vereist voor het offertebedrag, dient u de
                        offerte hier in. Na goedkeuring door de bevoegde persoon(en) kan de offerte worden verzonden.
                        Een materiële wijziging (bedragaanpassing) na goedkeuring maakt de aanvraag automatisch
                        ongeldig.
                      </p>
                      <GoedkeuringWidget
                        objectType="offerte"
                        objectId={offerte.id}
                        documentType="offerte"
                        bedrag={offerte.bedrag_incl_btw}
                        omschrijving={[offerte.offertenummer && `Offerte ${offerte.offertenummer}`, offerte.titel].filter(Boolean).join(" — ") || `Offerte #${offerte.id}`}
                        toonIndienKnop={offerte.status === "concept"}
                      />
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="historie">
                <div className="space-y-4">
                  <h2 className="font-semibold">Statushistorie</h2>
                  {(!transitieLog || transitieLog.length === 0) ? (
                    <Card>
                      <CardContent className="py-10 text-center text-muted-foreground">
                        Nog geen statusovergangen geregistreerd.
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="relative space-y-4 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                      {transitieLog.map((log) => (
                        <div key={log.id} className="relative flex items-start gap-4 pl-10">
                          <div className="absolute left-0 mt-1.5 flex h-10 w-10 items-center justify-center rounded-full border bg-background shadow-sm">
                            <div className={cn("h-2 w-2 rounded-full", STATUS_KLEUR[log.naar_status] ?? "bg-slate-400")} />
                          </div>
                          <div className="flex flex-1 flex-col gap-1 rounded-lg border bg-card p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted border">
                                  {STATUS_LABEL[log.van_status] || log.van_status}
                                </span>
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", STATUS_KLEUR[log.naar_status] || "bg-muted")}>
                                  {STATUS_LABEL[log.naar_status] || log.naar_status}
                                </span>
                              </div>
                              <time className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {datumNl(log.aangemaakt_op)}
                              </time>
                            </div>
                            <div className="text-sm text-foreground">
                              Status gewijzigd naar <span className="font-medium">{STATUS_LABEL[log.naar_status] || log.naar_status}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <User className="h-3 w-3" />
                              <span>{log.gebruiker_naam || "Systeem"}</span>
                              {log.reden && (
                                <>
                                  <span className="text-muted-foreground/30">•</span>
                                  <span>Reden: {log.reden}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
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
                  vragen={vragen}
                  vragenLaden={vragenLaden}
                  secties={gesorteerdeSecties}
                  regels={regels ?? []}
                  bijlagenAantal={(bijlagen ?? []).length}
                  verzendType={(offerte as unknown as Record<string, string>).verzend_type ?? "ondertekening"}
                />
              </TabsContent>

              {(() => {
                const huidigeIndex = WIZARD_STAPPEN.findIndex((w) => w.id === stap);
                if (huidigeIndex < 0) return null;
                const vorige = WIZARD_STAPPEN[huidigeIndex - 1];
                const volgende = WIZARD_STAPPEN[huidigeIndex + 1];
                return (
                  <div className="mt-6 flex items-center justify-between border-t pt-4">
                    <Button
                      variant="outline"
                      disabled={!vorige}
                      onClick={() => vorige && setStap(vorige.id)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      {vorige ? `Vorige: ${vorige.label}` : "Vorige"}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Stap {huidigeIndex + 1} van {WIZARD_STAPPEN.length}
                    </span>
                    <Button
                      disabled={!volgende}
                      onClick={() => volgende && setStap(volgende.id)}
                    >
                      {volgende ? `Volgende: ${volgende.label}` : "Laatste stap"}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })()}
            </Tabs>
          </div>
        </div>
      </div>

      <Dialog open={vergelijkDialoogOpen} onOpenChange={setVergelijkDialoogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Versies vergelijken</DialogTitle>
          </DialogHeader>
          {(() => {
            const vs = versies ?? [];
            const v1 = vs.find((v) => v.id === vergelijkVersieIds[0]);
            const v2 = vs.find((v) => v.id === vergelijkVersieIds[1]);
            if (!v1 || !v2) return null;
            const snap1 = (v1 as unknown as Record<string, unknown>).snapshot_json as Record<string, unknown> | null | undefined;
            const snap2 = (v2 as unknown as Record<string, unknown>).snapshot_json as Record<string, unknown> | null | undefined;
            const secties1: Array<{titel: string; inhoud?: string}> = Array.isArray((snap1 as Record<string, unknown> | null | undefined)?.secties) ? ((snap1 as Record<string, unknown>).secties as Array<{titel: string; inhoud?: string}>) : [];
            const secties2: Array<{titel: string; inhoud?: string}> = Array.isArray((snap2 as Record<string, unknown> | null | undefined)?.secties) ? ((snap2 as Record<string, unknown>).secties as Array<{titel: string; inhoud?: string}>) : [];
            const heeftSnapshot = secties1.length > 0 || secties2.length > 0;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 mb-2">
                  {[{v: v1, ids: [0, 1] as [number, number]}, {v: v2, ids: [1, 0] as [number, number]}].map(({v, ids}) => (
                    <div key={v.id} className="rounded-md border p-3 space-y-1.5">
                      <div className="font-semibold text-sm">Versie {v.versienummer}</div>
                      {v.samenvatting && <div className="text-xs text-muted-foreground">{v.samenvatting}</div>}
                      <div className="text-xs text-muted-foreground">{datumNl(v.aangemaakt_op)}{v.aangemaakt_door_naam ? ` — ${v.aangemaakt_door_naam}` : ""}</div>
                      <div className="flex flex-col gap-1 mt-2">
                        {(vs.filter((x) => x.id !== v.id)).map((ander) => (
                          <button
                            key={ander.id}
                            className="text-xs text-primary hover:underline text-left"
                            onClick={() => setVergelijkVersieIds((prev) => {
                              const copy: [number | null, number | null] = [...prev];
                              copy[ids[0]] = ander.id;
                              return copy;
                            })}
                          >
                            Vervang door versie {ander.versienummer}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {heeftSnapshot ? (
                  <div className="space-y-3">
                    {(() => {
                      const alleTitels = Array.from(new Set([...secties1.map((s) => s.titel), ...secties2.map((s) => s.titel)]));
                      return alleTitels.map((titel) => {
                        const s1 = secties1.find((s) => s.titel === titel);
                        const s2 = secties2.find((s) => s.titel === titel);
                        const tekst1 = s1?.inhoud ?? "";
                        const tekst2 = s2?.inhoud ?? "";
                        const gewijzigd = tekst1 !== tekst2;
                        return (
                          <div key={titel} className={`rounded-md border p-3 ${gewijzigd ? "border-amber-300 bg-amber-50" : ""}`}>
                            <div className="font-medium text-sm mb-2 flex items-center gap-2">
                              {titel}
                              {gewijzigd && <span className="text-xs text-amber-700 font-normal">(gewijzigd)</span>}
                              {!s1 && <span className="text-xs text-emerald-600 font-normal">(nieuw in v{v2?.versienummer})</span>}
                              {!s2 && <span className="text-xs text-rose-600 font-normal">(verwijderd na v{v1?.versienummer})</span>}
                            </div>
                            {gewijzigd && (
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-rose-50 rounded p-2 border border-rose-200">
                                  <div className="text-rose-700 font-medium mb-1">v{v1.versienummer}</div>
                                  <div className="whitespace-pre-wrap text-muted-foreground">{tekst1 || <em>(leeg)</em>}</div>
                                </div>
                                <div className="bg-emerald-50 rounded p-2 border border-emerald-200">
                                  <div className="text-emerald-700 font-medium mb-1">v{v2.versienummer}</div>
                                  <div className="whitespace-pre-wrap text-muted-foreground">{tekst2 || <em>(leeg)</em>}</div>
                                </div>
                              </div>
                            )}
                            {!gewijzigd && (
                              <div className="text-xs text-muted-foreground whitespace-pre-wrap">{tekst1 || <em>(leeg in beide versies)</em>}</div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <div className="rounded-md border p-4 space-y-2">
                    <div className="font-medium text-sm">Samenvattingen</div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <div className="bg-muted/40 rounded p-2">
                        <span className="font-medium text-foreground">v{v1.versienummer}: </span>{v1.samenvatting || "(geen samenvatting)"}
                      </div>
                      <div className="bg-muted/40 rounded p-2">
                        <span className="font-medium text-foreground">v{v2.versienummer}: </span>{v2.samenvatting || "(geen samenvatting)"}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Gedetailleerde sectie-inhoud is beschikbaar voor versies die zijn opgeslagen nadat de snapshotfunctie werd ingeschakeld.</p>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVergelijkDialoogOpen(false)}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={maakOpdrachtDialoog} onOpenChange={setMaakOpdrachtDialoog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Opdracht aanmaken</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Hiermee wordt een uitvoeropdracht aangemaakt op basis van deze offerte.
              De werkbegroting wordt automatisch gevuld vanuit de calculatie (zonder opslagen/winst).
            </p>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{offerte.titel}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaakOpdrachtDialoog(false)}>Annuleren</Button>
            <Button
              disabled={maakOpdrachtMutatie.isPending}
              onClick={() => maakOpdrachtMutatie.mutate({ id: offerteId })}
            >
              <Hammer className="h-3.5 w-3.5" />
              {maakOpdrachtMutatie.isPending ? "Aanmaken..." : "Aanmaken"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <DialogHeader>
            <DialogTitle>Verwijzing toevoegen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">
            Voeg een verwijzing toe die in de offerte wordt opgenomen — bijvoorbeeld een certificaat, referentieproject of technisch document. De naam en eventuele link worden afgedrukt als bijlagelijst aan het einde van de offerte.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <Input
                value={bijlageForm.naam}
                onChange={(e) => setBijlageForm((f) => ({ ...f, naam: e.target.value }))}
                placeholder="Bijv. VCA-certificaat FPS, Referentieproject Gemeente Utrecht"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">De naam zoals die in de offerte verschijnt.</p>
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
              <Label>Toelichting <span className="text-muted-foreground font-normal">(optioneel)</span></Label>
              <Input
                value={bijlageForm.beschrijving}
                onChange={(e) => setBijlageForm((f) => ({ ...f, beschrijving: e.target.value }))}
                placeholder="Bijv. Geldig t/m december 2026, beschikbaar op aanvraag"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Link naar document <span className="text-muted-foreground font-normal">(optioneel)</span></Label>
              <Input
                value={bijlageForm.url}
                onChange={(e) => setBijlageForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://..."
              />
              <p className="text-xs text-muted-foreground">Vul een weblink in als het document online staat. Laat leeg als u het document apart meestuurt of op aanvraag beschikbaar stelt.</p>
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

type BegrotingWeergave = {
  toon_aantal: boolean;
  toon_eenheid: boolean;
  toon_prijs_per_eenheid: boolean;
  toon_ruimte: boolean;
  toon_subtotalen: boolean;
  toon_subtotaal_excl: boolean;
  toon_btw: boolean;
  toon_totaal_incl: boolean;
  groepering: "categorie" | "geen";
  optionele_posten: "altijd" | "samengevat" | "verbergen";
  alleen_totaal: boolean;
  titel: string;
  // Granulaire klantweergave (deliverable 2) — verfijning bovenop het presentatieniveau.
  toon_hoofdstukken: boolean;
  toon_regelomschrijving: boolean;
  toon_spotnummer: boolean;
  toon_fotos: boolean;
};

const WEERGAVE_STANDAARD: BegrotingWeergave = {
  toon_aantal: true,
  toon_eenheid: true,
  toon_prijs_per_eenheid: true,
  toon_ruimte: true,
  toon_subtotalen: true,
  toon_subtotaal_excl: true,
  toon_btw: true,
  toon_totaal_incl: true,
  groepering: "categorie",
  optionele_posten: "altijd",
  alleen_totaal: false,
  titel: "Begroting",
  toon_hoofdstukken: true,
  toon_regelomschrijving: true,
  toon_spotnummer: false,
  toon_fotos: false,
};

function PrijzenTab({
  regels,
  offerte,
  bewerkRegelId,
  bewerkPrijs,
  setBewerkRegelId,
  setBewerkPrijs,
  slaRegelPrijsOp,
  werkRegelPending,
  toggleOptioneel,
}: {
  regels: any[];
  offerte: any;
  bewerkRegelId: number | null;
  bewerkPrijs: string;
  setBewerkRegelId: (id: number | null, huidigePrijs?: number) => void;
  setBewerkPrijs: (v: string) => void;
  slaRegelPrijsOp: (id: number) => Promise<void>;
  werkRegelPending: boolean;
  toggleOptioneel: (id: number, huidig: boolean) => Promise<void>;
}) {
  const { toast } = useToast();
  const weergave: BegrotingWeergave = { ...WEERGAVE_STANDAARD, ...(offerte?.begroting_weergave ?? {}) };

  const { mutate: patchOfferte, isPending: slaatWeergaveOp } = useUpdateOfferte({
    mutation: {
      onSuccess: () => toast({ title: "Weergave-instellingen opgeslagen" }),
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    },
  });

  function slaWeergaveOp(wijziging: Partial<BegrotingWeergave>) {
    const nieuw = { ...weergave, ...wijziging };
    patchOfferte({ id: offerte.id, data: { begroting_weergave: nieuw } as any });
  }

  const maatregelen = regels.filter((r) => r.categorie !== "algemene_kosten");
  const algemeenKosten = regels.filter((r) => r.categorie === "algemene_kosten");

  const zichtbareRegelsMaatregelen = weergave.optionele_posten === "verbergen"
    ? maatregelen.filter((r) => !r.is_optioneel)
    : maatregelen;
  const zichtbareRegelsAlgemeen = weergave.optionele_posten === "verbergen"
    ? algemeenKosten.filter((r) => !r.is_optioneel)
    : algemeenKosten;

  const subtotaalMaatregelen = maatregelen.reduce((s, r) => s + (r.kosten ?? 0), 0);
  const subtotaalAlgemeen = algemeenKosten.reduce((s, r) => s + (r.kosten ?? 0), 0);
  const totaal = subtotaalMaatregelen + subtotaalAlgemeen;
  const btw = totaal * ((offerte?.btw_percentage ?? 21) / 100);
  const inclBtw = totaal + btw;

  const aantalKolommen = 1
    + (weergave.toon_eenheid ? 1 : 0)
    + (weergave.toon_aantal ? 1 : 0)
    + (weergave.toon_prijs_per_eenheid ? 1 : 0)
    + 1; // totaal-kolom altijd

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
      <tr className={`border-b hover:bg-muted/30 transition-colors${r.is_optioneel ? " bg-amber-50/40" : ""}`}>
        <td className="py-2 px-3">
          <div className="flex items-start gap-2">
            <button
              title={r.is_optioneel ? "Optioneel — klik om verplicht te maken" : "Klik om optioneel te maken"}
              className={`mt-0.5 flex-shrink-0 h-4 w-4 rounded border transition-colors ${r.is_optioneel ? "bg-amber-400 border-amber-500 text-white" : "border-muted-foreground/40 hover:border-amber-400"}`}
              onClick={() => toggleOptioneel(r.id, !!r.is_optioneel)}
            >
              {r.is_optioneel && <Check className="h-3 w-3" />}
            </button>
            <div>
              <div className="font-medium text-sm">{r.maatregel}</div>
              {r.is_optioneel && <div className="text-xs text-amber-700">Optioneel</div>}
              {weergave.toon_ruimte && r.ruimte && <div className="text-xs text-muted-foreground">{r.ruimte}</div>}
              {r.snag_referentie && <div className="text-xs text-muted-foreground">{r.snag_referentie}</div>}
            </div>
          </div>
        </td>
        {weergave.toon_eenheid && <td className="py-2 px-3 text-right text-sm text-muted-foreground whitespace-nowrap">{r.eenheid}</td>}
        {weergave.toon_aantal && <td className="py-2 px-3 text-right text-sm">{r.aantal}</td>}
        {weergave.toon_prijs_per_eenheid && (
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
        )}
        {!weergave.toon_prijs_per_eenheid && isBewerken && (
          <td className="py-2 px-3 text-right">
            <div className="flex items-center gap-1 justify-end">
              <Input className="w-24 h-7 text-right text-sm" value={bewerkPrijs} onChange={(e) => setBewerkPrijs(e.target.value)} autoFocus />
              <Button size="icon" className="h-7 w-7" onClick={() => slaRegelPrijsOp(r.id)} disabled={werkRegelPending}><Check className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setBewerkRegelId(null)}><X className="h-3 w-3" /></Button>
            </div>
          </td>
        )}
        <td className="py-2 px-3 text-right text-sm font-medium">{euro(r.kosten ?? 0)}</td>
      </tr>
    );
  }

  return (
    <div className="space-y-4">
      {/* Weergave-instellingen */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4" /> Weergave-instellingen begrotingstabel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Begrotingstitel */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Begrotingstitel</Label>
              <Input
                value={weergave.titel}
                onChange={(e) => slaWeergaveOp({ titel: e.target.value })}
                placeholder="Begroting"
                className="h-8 text-sm"
                disabled={slaatWeergaveOp}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Groepering</Label>
              <Select value={weergave.groepering} onValueChange={(v) => slaWeergaveOp({ groepering: v as BegrotingWeergave["groepering"] })} disabled={slaatWeergaveOp}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="categorie">Per categorie (Maatregelen / Algemene kosten)</SelectItem>
                  <SelectItem value="geen">Geen groepering — alles in volgorde</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Kolommen */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Kolommen tonen</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "toon_aantal" as const, label: "Aantal" },
                  { key: "toon_eenheid" as const, label: "Eenheid" },
                  { key: "toon_prijs_per_eenheid" as const, label: "Prijs / eenheid" },
                  { key: "toon_ruimte" as const, label: "Ruimte / locatie" },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => slaWeergaveOp({ [key]: !weergave[key] })}
                  disabled={slaatWeergaveOp}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                    weergave[key]
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {weergave[key] ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Totaalrijen */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Totaalrijen tonen</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "toon_subtotalen" as const, label: "Subtotalen per groep" },
                  { key: "toon_subtotaal_excl" as const, label: "Subtotaal excl. btw" },
                  { key: "toon_btw" as const, label: "Btw-rij" },
                  { key: "toon_totaal_incl" as const, label: "Totaal incl. btw" },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => slaWeergaveOp({ [key]: !weergave[key] })}
                  disabled={slaatWeergaveOp}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                    weergave[key]
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {weergave[key] ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Optionele posten + alleen totaal */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Optionele posten</Label>
              <Select value={weergave.optionele_posten} onValueChange={(v) => slaWeergaveOp({ optionele_posten: v as BegrotingWeergave["optionele_posten"] })} disabled={slaatWeergaveOp}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="altijd">Altijd tonen (met keuzeoptie)</SelectItem>
                  <SelectItem value="samengevat">Samengevat tonen (geen regeldetail)</SelectItem>
                  <SelectItem value="verbergen">Verbergen (niet zichtbaar voor klant)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Regeldetail</Label>
              <button
                onClick={() => slaWeergaveOp({ alleen_totaal: !weergave.alleen_totaal })}
                disabled={slaatWeergaveOp}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors h-8 ${
                  weergave.alleen_totaal
                    ? "bg-amber-50 text-amber-800 border-amber-300"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                }`}
              >
                {weergave.alleen_totaal ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                Alleen eindtotaal tonen (geen regeldetail)
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">Klik op een prijs om deze te bewerken. Gebruik het vakje links van een regel om hem als optioneel te markeren — optionele posten zijn zichtbaar in het klantportaal met een keuzeoptie.</p>

      {weergave.alleen_totaal ? (
        <Card>
          <CardContent className="py-6">
            <div className="flex justify-between items-center font-bold text-lg">
              <span>{weergave.titel || "Begroting"}</span>
              <span className="text-primary">{euro(inclBtw)}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Klant ziet alleen het eindtotaal — geen regeldetail.</p>
          </CardContent>
        </Card>
      ) : (
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="py-2 px-3 text-left font-semibold">{weergave.titel || "Maatregel"}</th>
              {weergave.toon_eenheid && <th className="py-2 px-3 text-right font-semibold">Eenheid</th>}
              {weergave.toon_aantal && <th className="py-2 px-3 text-right font-semibold">Aantal</th>}
              {weergave.toon_prijs_per_eenheid && <th className="py-2 px-3 text-right font-semibold">Prijs/eenheid</th>}
              <th className="py-2 px-3 text-right font-semibold">Totaal</th>
            </tr>
          </thead>
          <tbody>
            {weergave.groepering === "categorie" ? (
              <>
                {maatregelen.length > 0 && (
                  <>
                    <tr className="bg-muted/20">
                      <td colSpan={aantalKolommen} className="py-1.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Maatregelen
                      </td>
                    </tr>
                    {weergave.optionele_posten === "samengevat" ? (
                      <>
                        {maatregelen.filter((r) => !r.is_optioneel).map((r) => <RegelRij key={r.id} r={r} />)}
                        {maatregelen.some((r) => r.is_optioneel) && (
                          <tr className="border-b bg-amber-50/30">
                            <td colSpan={aantalKolommen} className="py-2 px-3 text-xs text-amber-700 italic">
                              + {maatregelen.filter((r) => r.is_optioneel).length} optionele post(en) — op verzoek beschikbaar
                            </td>
                          </tr>
                        )}
                      </>
                    ) : (
                      zichtbareRegelsMaatregelen.map((r) => <RegelRij key={r.id} r={r} />)
                    )}
                    {weergave.toon_subtotalen && (
                      <tr className="bg-muted/10">
                        <td colSpan={aantalKolommen - 1} className="py-1.5 px-3 text-right text-xs text-muted-foreground">Subtotaal maatregelen</td>
                        <td className="py-1.5 px-3 text-right text-sm font-semibold">{euro(subtotaalMaatregelen)}</td>
                      </tr>
                    )}
                  </>
                )}
                {algemeenKosten.length > 0 && (
                  <>
                    <tr className="bg-muted/20">
                      <td colSpan={aantalKolommen} className="py-1.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Algemene kosten
                      </td>
                    </tr>
                    {weergave.optionele_posten === "samengevat" ? (
                      <>
                        {algemeenKosten.filter((r) => !r.is_optioneel).map((r) => <RegelRij key={r.id} r={r} />)}
                        {algemeenKosten.some((r) => r.is_optioneel) && (
                          <tr className="border-b bg-amber-50/30">
                            <td colSpan={aantalKolommen} className="py-2 px-3 text-xs text-amber-700 italic">
                              + {algemeenKosten.filter((r) => r.is_optioneel).length} optionele post(en) — op verzoek beschikbaar
                            </td>
                          </tr>
                        )}
                      </>
                    ) : (
                      zichtbareRegelsAlgemeen.map((r) => <RegelRij key={r.id} r={r} />)
                    )}
                    {weergave.toon_subtotalen && (
                      <tr className="bg-muted/10">
                        <td colSpan={aantalKolommen - 1} className="py-1.5 px-3 text-right text-xs text-muted-foreground">Subtotaal algemene kosten</td>
                        <td className="py-1.5 px-3 text-right text-sm font-semibold">{euro(subtotaalAlgemeen)}</td>
                      </tr>
                    )}
                  </>
                )}
              </>
            ) : (
              regels.map((r) => <RegelRij key={r.id} r={r} />)
            )}
          </tbody>
          <tfoot>
            {weergave.toon_subtotaal_excl && (
            <tr className="border-t-2">
              <td colSpan={aantalKolommen - 1} className="py-2 px-3 text-right text-sm font-semibold">Totaal excl. btw</td>
              <td className="py-2 px-3 text-right font-bold">{euro(totaal)}</td>
            </tr>
            )}
            {weergave.toon_btw && (
            <tr>
              <td colSpan={aantalKolommen - 1} className="py-1 px-3 text-right text-xs text-muted-foreground">Btw {offerte?.btw_percentage ?? 21}%</td>
              <td className="py-1 px-3 text-right text-sm">{euro(btw)}</td>
            </tr>
            )}
            {weergave.toon_totaal_incl && (
            <tr className="bg-primary text-primary-foreground">
              <td colSpan={aantalKolommen - 1} className="py-2.5 px-3 text-right font-bold">Totaal incl. btw</td>
              <td className="py-2.5 px-3 text-right font-bold text-base">{euro(inclBtw)}</td>
            </tr>
            )}
          </tfoot>
        </table>
      </div>
      )}
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

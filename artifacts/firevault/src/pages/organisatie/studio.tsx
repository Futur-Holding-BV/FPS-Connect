import { useState, useRef, useCallback } from "react";
import {
  useListStudioWerkgevers,
  useListDocumentStudioModellen,
  useUpsertDocumentStudioModel,
  useUploadDocumentStudioReferentie,
  useGenereerStudioTemplate,
  useBijstuurStudioTemplate,
  useGoedkeurenStudioTemplate,
  useAnalyseerStudioHuisstijl,
  useGenereerOntbrekendeStudioModellen,
  useUpdateWerkgever,
  getListDocumentStudioModellenQueryKey,
  getListStudioWerkgeversQueryKey,
  getListWerkgeversQueryKey,
} from "@workspace/api-client-react";
import type {
  DocumentStudioModel,
  DocumentStudioModelInput,
  StudioHuisstijlAnalyseResponse,
  StudioHuisstijlVoorstel,
  WerkgeverInput,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import {
  Loader2,
  FileText,
  Mail,
  Package,
  Receipt,
  Calculator,
  ClipboardCheck,
  Hammer,
  LayoutTemplate,
  Upload,
  CheckCircle2,
  AlertCircle,
  ImageIcon,
  Building2,
  Sparkles,
  RefreshCw,
  ThumbsUp,
  ChevronRight,
  History,
  Wand2,
  Check,
  X,
  ShoppingCart,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import StudioTemplatePreview from "@/components/documentopmaak/StudioTemplatePreview";

const DOCUMENT_TYPEN: {
  type: string;
  label: string;
  icoon: typeof FileText;
  omschrijving: string;
}[] = [
  { type: "offerte",        label: "Offerte",        icoon: FileText,       omschrijving: "Offertesjabloon richting klant" },
  { type: "opleverrapport", label: "Opleverrapport", icoon: Building2,      omschrijving: "Opleverrapport brandpreventieve voorzieningen" },
  { type: "brief",          label: "Brief",           icoon: FileText,       omschrijving: "Formele correspondentiebrief" },
  { type: "email",          label: "E-mail",          icoon: Mail,           omschrijving: "Standaard e-mailsjabloon" },
  { type: "lmra",           label: "LMRA",            icoon: ClipboardCheck, omschrijving: "Laatste Minuut Risico Analyse" },
  { type: "toolbox",        label: "Toolbox",         icoon: Hammer,         omschrijving: "Toolbox-meeting document" },
  { type: "inkoopbon",      label: "Inkoopbon",       icoon: Package,        omschrijving: "Interne inkoopbon" },
  { type: "factuur",        label: "Factuur",         icoon: Receipt,        omschrijving: "Factuursjabloon" },
  { type: "calculatie",     label: "Calculatie",      icoon: Calculator,     omschrijving: "Calculatie-werkblad" },
  { type: "bestelbon",      label: "Bestelbon",       icoon: ShoppingCart,   omschrijving: "Bestelbon richting leverancier" },
  { type: "mandagstaat",    label: "Mandagstaat",     icoon: ClipboardList,  omschrijving: "Mandagstaat / werkbon uitgevoerde uren" },
];

const STATUS_CONFIG: Record<string, { label: string; klasse: string; beschrijving: string }> = {
  geen:         { label: "Geen model",          klasse: "bg-gray-100 text-gray-600",    beschrijving: "Er is nog geen referentie of model voor dit documenttype." },
  referentie:   { label: "Referentie ge-upload",klasse: "bg-amber-100 text-amber-700", beschrijving: "Referentiedocument aanwezig. Klaar voor AI-generatie." },
  concept:      { label: "Concept",             klasse: "bg-blue-100 text-blue-700",   beschrijving: "AI heeft een concept gegenereerd. Beoordeling vereist." },
  genererend:   { label: "AI genereert...",     klasse: "bg-amber-100 text-amber-700", beschrijving: "De AI is bezig met het genereren van een concept voor dit documenttype." },
  goedgekeurd:  { label: "Model 0 goedgekeurd", klasse: "bg-green-100 text-green-700", beschrijving: "Dit model is goedgekeurd als officieel Connect-template." },
  gearchiveerd: { label: "Gearchiveerd",        klasse: "bg-gray-100 text-gray-500",   beschrijving: "Deze versie is niet meer actief, maar blijft bewaard in de geschiedenis." },
};

const TOEGESTANE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

const DOCUMENT_TYPE_MODULES: Record<string, string[]> = {
  offerte:        ["Offertes"],
  opleverrapport: ["Opleverrapporten"],
  factuur:        ["Facturen"],
  calculatie:     ["Calculatie intern"],
};

type HuisstijlVeld = Exclude<keyof StudioHuisstijlVoorstel, "redenering">;

const HUISSTIJL_VELDEN: { key: HuisstijlVeld; label: string }[] = [
  { key: "adres",             label: "Adres" },
  { key: "postcode",          label: "Postcode" },
  { key: "plaats",            label: "Plaats" },
  { key: "kvk",                label: "KVK-nummer" },
  { key: "btw",                label: "BTW-nummer" },
  { key: "iban",               label: "IBAN" },
  { key: "email",              label: "E-mail" },
  { key: "telefoon",          label: "Telefoon" },
  { key: "website",           label: "Website" },
  { key: "voettekst",         label: "Voettekst" },
  { key: "primaire_kleur",    label: "Merkkleur (hex)" },
  { key: "koptekst_positie",  label: "Koptekst-positie" },
  { key: "voettekst_positie", label: "Voettekst-positie" },
  { key: "marge_boven",       label: "Marge boven (mm)" },
  { key: "marge_onder",       label: "Marge onder (mm)" },
  { key: "marge_links",       label: "Marge links (mm)" },
  { key: "marge_rechts",      label: "Marge rechts (mm)" },
];

type HuisstijlActie = "voorgesteld" | "geaccepteerd" | "verworpen";
type HuisstijlBeslissingen = Partial<Record<HuisstijlVeld, { actie: HuisstijlActie; waarde: string | number | null }>>;

export default function DocumentStudioPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven = heeftNiveau("organisatie", 2);
  const { data: werkgevers = [], isLoading: laadtWerkgevers } = useListStudioWerkgevers();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [geselecteerdeWerkgeverId, setGeselecteerdeWerkgeverId] = useState<number | null>(null);

  // Upload dialoog
  const [uploadDialoogOpen, setUploadDialoogOpen] = useState(false);
  const [uploadType, setUploadType] = useState<string | null>(null);
  const [uploadModelId, setUploadModelId] = useState<number | null>(null);
  const [sleepActief, setSleepActief] = useState(false);
  const [uploadBezig, setUploadBezig] = useState(false);
  const bestandInputRef = useRef<HTMLInputElement>(null);

  // AI genereer dialoog
  const [aiDialoogOpen, setAiDialoogOpen] = useState(false);
  const [aiModelId, setAiModelId] = useState<number | null>(null);
  const [aiInstructie, setAiInstructie] = useState("");
  const [aiIteraties, setAiIteraties] = useState<string[]>([]);
  const [goedkeurBevestigOpen, setGoedkeurBevestigOpen] = useState(false);

  // Huisstijl-analyse dialoog (AI-voorstel uit referentiedocument)
  const [huisstijlDialoogOpen, setHuisstijlDialoogOpen] = useState(false);
  const [huisstijlModelId, setHuisstijlModelId] = useState<number | null>(null);
  const [huisstijlVoorstel, setHuisstijlVoorstel] = useState<StudioHuisstijlAnalyseResponse | null>(null);
  const [huisstijlBeslissingen, setHuisstijlBeslissingen] = useState<HuisstijlBeslissingen>({});

  // Versiegeschiedenis-dialoog (bekijken + terugzetten van eerdere versies)
  const [versiesDialoogOpen, setVersiesDialoogOpen] = useState(false);
  const [versiesType, setVersiesType] = useState<string | null>(null);
  const [terugzettenId, setTerugzettenId] = useState<number | null>(null);

  const werkgeverId = geselecteerdeWerkgeverId ?? (werkgevers[0]?.id ?? null);

  const { data: modellen = [], isLoading: laadtModellen } = useListDocumentStudioModellen(
    werkgeverId ? { werkgever_id: werkgeverId } : undefined,
  );

  const upsert           = useUpsertDocumentStudioModel();
  const upload           = useUploadDocumentStudioReferentie();
  const genereer         = useGenereerStudioTemplate();
  const bijstuur         = useBijstuurStudioTemplate();
  const goedkeur         = useGoedkeurenStudioTemplate();
  const analyseerHuisstijl = useAnalyseerStudioHuisstijl();
  const bulkGenereer       = useGenereerOntbrekendeStudioModellen();
  const updateWerkgever    = useUpdateWerkgever();

  const geselecteerdeWerkgever = werkgevers.find((w) => w.id === werkgeverId);
  const aiModel = aiModelId ? modellen.find((m) => m.id === aiModelId) : null;
  const huisstijlModel = huisstijlModelId ? modellen.find((m) => m.id === huisstijlModelId) : null;

  /** Alle rijen (alle versies, incl. gearchiveerd) voor een documenttype, nieuwste eerst. */
  function versiesVoorType(type: string): DocumentStudioModel[] {
    return modellen.filter((m) => m.document_type === type);
  }

  /**
   * Het model dat op de kaart getoond wordt: bij voorkeur het actieve
   * ('goedgekeurd') model — dat bepaalt immers wat er nu echt gebruikt wordt.
   * Zonder actief model valt terug op de nieuwste conceptversie.
   */
  function modelVoorType(type: string): DocumentStudioModel | undefined {
    const versies = versiesVoorType(type);
    return versies.find((m) => m.status === "goedgekeurd") ?? versies[0];
  }

  /** Nieuwste concept/referentie-versie die nog wacht op beoordeling naast een reeds actief model. */
  function conceptInBeoordelingVoorType(type: string): DocumentStudioModel | undefined {
    const versies = versiesVoorType(type);
    const actief = versies.find((m) => m.status === "goedgekeurd");
    if (!actief) return undefined;
    return versies.find((m) => m.id !== actief.id && (m.status === "concept" || m.status === "referentie"));
  }

  const invalideer = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: getListDocumentStudioModellenQueryKey({ werkgever_id: werkgeverId ?? undefined }),
    });
  }, [queryClient, werkgeverId]);

  // ── Upload ────────────────────────────────────────────────────────────────

  const openUploadDialoog = async (type: string) => {
    if (!werkgeverId) return;
    setUploadType(type);
    // Altijd via upsert: de server hergebruikt alleen een bestaand concept/
    // referentie/leeg model en maakt juist een NIEUW conceptmodel aan zodra
    // het huidige model voor dit type al 'goedgekeurd' (actief) is — zo blijft
    // het actieve model onaangeroerd totdat het nieuwe concept expliciet
    // wordt goedgekeurd.
    try {
      const model = await upsert.mutateAsync({ data: { werkgever_id: werkgeverId, document_type: type as DocumentStudioModelInput["document_type"] } });
      setUploadModelId(model.id);
      invalideer();
    } catch {
      toast({ title: "Kon model niet aanmaken", variant: "destructive" });
      return;
    }
    setUploadDialoogOpen(true);
  };

  const sluitUploadDialoog = () => {
    setUploadDialoogOpen(false);
    setUploadType(null);
    setUploadModelId(null);
  };

  const verwerkBestand = useCallback(async (bestand: File) => {
    if (!uploadModelId) return;
    if (!TOEGESTANE_TYPES.includes(bestand.type)) {
      toast({ title: "Bestandstype niet ondersteund", description: "Upload een PDF of afbeelding (JPG/PNG/WEBP).", variant: "destructive" });
      return;
    }
    if (bestand.size > 10 * 1024 * 1024) {
      toast({ title: "Bestand te groot", description: "Maximum bestandsgrootte is 10 MB.", variant: "destructive" });
      return;
    }
    setUploadBezig(true);
    try {
      await upload.mutateAsync({ id: uploadModelId, data: { bestand } });
      invalideer();
      toast({ title: "Bestand gekoppeld", description: "Het referentiedocument is succesvol gekoppeld aan de registratie." });
      sluitUploadDialoog();
    } catch {
      toast({ title: "Upload mislukt", description: "Probeer het opnieuw.", variant: "destructive" });
    } finally {
      setUploadBezig(false);
    }
  }, [uploadModelId, toast, upload, invalideer]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setSleepActief(false);
    const bestand = e.dataTransfer.files[0];
    if (bestand) void verwerkBestand(bestand);
  }, [verwerkBestand]);

  // ── AI Genereer ───────────────────────────────────────────────────────────

  const openAiDialoog = async (type: string, modelId?: number) => {
    if (!werkgeverId) return;
    let model = modelId ? modellen.find((m) => m.id === modelId) : modelVoorType(type);
    if (!model) {
      try {
        model = await upsert.mutateAsync({ data: { werkgever_id: werkgeverId, document_type: type as DocumentStudioModelInput["document_type"] } });
        invalideer();
      } catch {
        toast({ title: "Kon model niet aanmaken", variant: "destructive" });
        return;
      }
    }
    setAiModelId(model.id);
    setAiInstructie("");
    setAiIteraties([]);
    setAiDialoogOpen(true);

    // Als er nog geen concept is, direct genereren — een referentie is
    // optioneel: zonder referentie genereert de AI op basis van de huisstijl.
    if (!model.connect_template_json) {
      void triggerGenereer(model.id, null);
    }
  };

  // ── Bulk genereer — alle ontbrekende documenttypes in één keer ─────────────

  const ontbrekendeTypes = DOCUMENT_TYPEN.filter(({ type }) =>
    !versiesVoorType(type).some((m) => m.status === "concept" || m.status === "goedgekeurd"),
  );

  const triggerBulkGenereer = async () => {
    if (!werkgeverId) return;
    try {
      const resultaat = await bulkGenereer.mutateAsync({ werkgeverId });
      invalideer();
      const mislukt = resultaat.resultaten.filter((r) => !r.ok).map((r) => r.document_type);
      toast({
        title: `${resultaat.geslaagd} van ${resultaat.totaal_ontbrekend} concepten gegenereerd`,
        description: mislukt.length
          ? `Mislukt: ${mislukt.join(", ")} — probeer deze los opnieuw.`
          : "Beoordeel de concepten per kaart en keur ze goed als Model 0.",
        variant: mislukt.length ? "destructive" : undefined,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Onbekende fout";
      toast({ title: "Bulk-generatie mislukt", description: msg, variant: "destructive" });
    }
  };

  const triggerGenereer = async (id: number, instructie: string | null): Promise<void> => {
    try {
      await genereer.mutateAsync({ id, data: { instructie: instructie ?? undefined } });
      invalideer();
      if (instructie) {
        setAiIteraties((prev) => [...prev, instructie]);
        setAiInstructie("");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Onbekende fout";
      toast({ title: "Generatie mislukt", description: msg, variant: "destructive" });
    }
  };

  const triggerBijstuur = async () => {
    if (!aiModelId || !aiInstructie.trim()) return;
    try {
      await bijstuur.mutateAsync({ id: aiModelId, data: { instructie: aiInstructie.trim() } });
      setAiIteraties((prev) => [...prev, aiInstructie.trim()]);
      setAiInstructie("");
      invalideer();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Onbekende fout";
      toast({ title: "Verfijning mislukt", description: msg, variant: "destructive" });
    }
  };

  const triggerGoedkeuren = async () => {
    if (!aiModelId) return;
    try {
      await goedkeur.mutateAsync({ id: aiModelId });
      invalideer();
      setGoedkeurBevestigOpen(false);
      setAiDialoogOpen(false);
      toast({ title: "Model 0 goedgekeurd", description: "Het Connect-template is vastgesteld als Model 0." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Onbekende fout";
      toast({ title: "Goedkeuren mislukt", description: msg, variant: "destructive" });
    }
  };

  // ── Versiegeschiedenis ────────────────────────────────────────────────────

  const openVersiesDialoog = (type: string) => {
    setVersiesType(type);
    setVersiesDialoogOpen(true);
  };

  const sluitVersiesDialoog = () => {
    setVersiesDialoogOpen(false);
    setVersiesType(null);
  };

  /**
   * Terugzetten van een eerdere (gearchiveerde) versie: dezelfde
   * goedkeuren-actie als een concept goedkeuren — de server archiveert het
   * huidige actieve model en maakt deze versie opnieuw actief onder een
   * nieuw, hoger versienummer. Niets wordt overschreven of verwijderd.
   */
  const terugzettenNaarVersie = async (model: DocumentStudioModel) => {
    setTerugzettenId(model.id);
    try {
      await goedkeur.mutateAsync({ id: model.id });
      invalideer();
      toast({ title: "Versie teruggezet", description: `Versie ${model.versie} is opnieuw het actieve model.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Onbekende fout";
      toast({ title: "Terugzetten mislukt", description: msg, variant: "destructive" });
    } finally {
      setTerugzettenId(null);
    }
  };

  // ── Huisstijl-analyse (AI-voorstel, nooit direct opgeslagen) ────────────────

  const openHuisstijlDialoog = async (id: number) => {
    setHuisstijlModelId(id);
    setHuisstijlVoorstel(null);
    setHuisstijlBeslissingen({});
    setHuisstijlDialoogOpen(true);
    try {
      const resultaat = await analyseerHuisstijl.mutateAsync({ id });
      setHuisstijlVoorstel(resultaat);
      const initieel: HuisstijlBeslissingen = {};
      for (const { key } of HUISSTIJL_VELDEN) {
        const voorgesteldeWaarde = resultaat.voorstel[key];
        if (voorgesteldeWaarde === null || voorgesteldeWaarde === undefined) continue;
        initieel[key] = { actie: "voorgesteld", waarde: voorgesteldeWaarde };
      }
      setHuisstijlBeslissingen(initieel);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Onbekende fout";
      toast({ title: "Huisstijl-analyse mislukt", description: msg, variant: "destructive" });
      setHuisstijlDialoogOpen(false);
    }
  };

  const zetHuisstijlActie = (veld: HuisstijlVeld, actie: HuisstijlActie) => {
    setHuisstijlBeslissingen((prev) => {
      const huidig = prev[veld];
      if (!huidig) return prev;
      return { ...prev, [veld]: { ...huidig, actie } };
    });
  };

  const zetHuisstijlWaarde = (veld: HuisstijlVeld, waarde: string) => {
    setHuisstijlBeslissingen((prev) => {
      const huidig = prev[veld];
      if (!huidig) return prev;
      return { ...prev, [veld]: { ...huidig, waarde } };
    });
  };

  const accepteerAlleHuisstijl = () => {
    setHuisstijlBeslissingen((prev) => {
      const volgende: HuisstijlBeslissingen = {};
      for (const [veld, beslissing] of Object.entries(prev)) {
        volgende[veld as HuisstijlVeld] = { ...beslissing, actie: "geaccepteerd" };
      }
      return volgende;
    });
  };

  const geaccepteerdeHuisstijlVelden = Object.entries(huisstijlBeslissingen).filter(
    ([, b]) => b.actie === "geaccepteerd",
  );

  const toepassenHuisstijl = async () => {
    if (!geselecteerdeWerkgever || geaccepteerdeHuisstijlVelden.length === 0) return;
    const payload: Partial<WerkgeverInput> = { naam: geselecteerdeWerkgever.naam };
    for (const [veld, beslissing] of geaccepteerdeHuisstijlVelden) {
      const waarde = beslissing.waarde;
      if (veld === "marge_boven" || veld === "marge_onder" || veld === "marge_links" || veld === "marge_rechts") {
        const numeriek = typeof waarde === "number" ? waarde : Number(waarde);
        if (!Number.isNaN(numeriek)) (payload as Record<string, unknown>)[veld] = numeriek;
      } else {
        (payload as Record<string, unknown>)[veld] = waarde;
      }
    }
    try {
      await updateWerkgever.mutateAsync({ id: geselecteerdeWerkgever.id, data: payload as WerkgeverInput });
      void queryClient.invalidateQueries({ queryKey: getListStudioWerkgeversQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListWerkgeversQueryKey() });
      toast({
        title: "Huisstijl bijgewerkt",
        description: `${geaccepteerdeHuisstijlVelden.length} veld(en) overgenomen uit het referentiedocument.`,
      });
      setHuisstijlDialoogOpen(false);
      setHuisstijlVoorstel(null);
      setHuisstijlBeslissingen({});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Onbekende fout";
      toast({ title: "Bijwerken mislukt", description: msg, variant: "destructive" });
    }
  };

  const aiBezig = genereer.isPending || bijstuur.isPending;

  const typeLabel = DOCUMENT_TYPEN.find((t) => t.type === uploadType)?.label ?? uploadType;
  const aiTypeLabel = DOCUMENT_TYPEN.find((t) => t.type === aiModel?.document_type)?.label ?? aiModel?.document_type;
  const versiesTypeLabel = DOCUMENT_TYPEN.find((t) => t.type === versiesType)?.label ?? versiesType;
  const versiesLijst = versiesType
    ? [...versiesVoorType(versiesType)].sort((a, b) => {
        if (a.status === "goedgekeurd" && b.status !== "goedgekeurd") return -1;
        if (b.status === "goedgekeurd" && a.status !== "goedgekeurd") return 1;
        return b.id - a.id;
      })
    : [];

  if (laadtWerkgevers) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Paginaheader */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Document Studio</h1>
          <p className="text-muted-foreground mt-1">
            Beheer referentiemodellen en Connect-templates per documenttype, per werkmaatschappij.
          </p>
        </div>
        {magSchrijven && werkgeverId != null && !laadtModellen && ontbrekendeTypes.length > 0 && (
          <Button
            onClick={() => void triggerBulkGenereer()}
            disabled={bulkGenereer.isPending || aiBezig}
          >
            {bulkGenereer.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1.5" />
            )}
            {bulkGenereer.isPending
              ? "Bezig met genereren..."
              : `Genereer ${ontbrekendeTypes.length} ontbrekende ${ontbrekendeTypes.length === 1 ? "model" : "modellen"}`}
          </Button>
        )}
      </div>

      {werkgevers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="p-4 rounded-full bg-muted">
              <Building2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Geen werkmaatschappijen geconfigureerd</p>
              <p className="text-sm text-muted-foreground mt-1">
                Voeg eerst een werkgever toe via Personeel &rsaquo; Werkgevers.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Werkmaatschappij-selector */}
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-xs">
              <Select
                value={String(werkgeverId ?? "")}
                onValueChange={(v) => setGeselecteerdeWerkgeverId(parseInt(v, 10))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies werkmaatschappij" />
                </SelectTrigger>
                <SelectContent>
                  {werkgevers.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(geselecteerdeWerkgever?.primaire_kleur || geselecteerdeWerkgever?.logo_url || geselecteerdeWerkgever?.voettekst) && (
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                {geselecteerdeWerkgever.primaire_kleur && (
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-4 h-4 rounded-full border border-border shrink-0"
                      style={{ backgroundColor: geselecteerdeWerkgever.primaire_kleur }}
                    />
                    <span>Merkkleur: {geselecteerdeWerkgever.primaire_kleur}</span>
                  </div>
                )}
                {geselecteerdeWerkgever.logo_url && (
                  <div className="flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4 shrink-0" />
                    <span>Logo geconfigureerd</span>
                  </div>
                )}
                {geselecteerdeWerkgever.voettekst && (
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate max-w-[200px]" title={geselecteerdeWerkgever.voettekst}>
                      Voettekst: {geselecteerdeWerkgever.voettekst}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status-samenvatting */}
          {!laadtModellen && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(STATUS_CONFIG).filter(([sleutel]) => sleutel !== "gearchiveerd" && sleutel !== "genererend").map(([sleutel, cfg]) => {
                const aantal = sleutel === "geen"
                  ? DOCUMENT_TYPEN.length - modellen.filter((m) => m.status !== "geen").length
                  : modellen.filter((m) => m.status === sleutel).length;
                return (
                  <div key={sleutel} className={cn("rounded-lg border px-3 py-2", sleutel === "goedgekeurd" ? "border-green-200 bg-green-50" : "")}>
                    <Badge className={cn("text-xs mb-1", cfg.klasse)} variant="outline">
                      {cfg.label}
                    </Badge>
                    <p className="text-2xl font-bold">{sleutel === "geen" ? Math.max(0, aantal) : aantal}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Documenttype-kaartgrid */}
          {laadtModellen ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {DOCUMENT_TYPEN.map(({ type, label, icoon: Icoon, omschrijving }) => {
                const model = modelVoorType(type);
                const status = model?.status ?? "geen";
                const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.geen;
                const heeftReferentie = Boolean(model?.referentie_bestand_pad);
                const heeftConcept   = Boolean(model?.connect_template_json);
                const conceptInBeoordeling = conceptInBeoordelingVoorType(type);
                const aantalVersies = versiesVoorType(type).length;

                return (
                  <Card
                    key={type}
                    className={cn(
                      "flex flex-col transition-all",
                      status === "goedgekeurd" ? "border-green-500 shadow-sm shadow-green-100" : ""
                    )}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className={cn("p-2 rounded-md", status === "goedgekeurd" ? "bg-green-100" : "bg-muted")}>
                            <Icoon className={cn("h-4 w-4", status === "goedgekeurd" ? "text-green-700" : "text-muted-foreground")} />
                          </div>
                          <CardTitle className="text-sm font-semibold">{label}</CardTitle>
                        </div>
                        {status === "goedgekeurd" && (
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                        )}
                        {status === "concept" && (
                          <AlertCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 flex-1">
                      <p className="text-xs text-muted-foreground">{omschrijving}</p>
                      <Badge className={cn("self-start text-xs", cfg.klasse)} variant="outline">
                        {cfg.label}
                      </Badge>
                      <p className="text-xs text-muted-foreground flex-1">{cfg.beschrijving}</p>
                      
                      {model?.referentie_bestand_pad && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <ImageIcon className="h-3 w-3" />
                            <span>Referentie aanwezig</span>
                          </div>
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs"
                            onClick={() => window.open(`/api/storage${model.referentie_bestand_pad}`, "_blank")}
                          >
                            Bekijk
                          </Button>
                        </div>
                      )}

                      {model?.goedgekeurd_op && (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Goedgekeurd op {new Date(model.goedgekeurd_op).toLocaleDateString("nl-NL")}</span>
                        </div>
                      )}
                      {status === "goedgekeurd" && (DOCUMENT_TYPE_MODULES[type]?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-xs text-muted-foreground">Actief in:</span>
                          {(DOCUMENT_TYPE_MODULES[type] ?? []).map((module) => (
                            <Badge key={module} className="text-xs bg-primary/10 text-primary border-primary/20" variant="outline">
                              {module}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {conceptInBeoordeling && (
                        <div className="flex flex-col gap-1.5 mt-2">
                          <button
                            type="button"
                            className="flex items-center gap-1.5 text-xs rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-blue-700 text-left hover:bg-blue-100 transition-colors"
                            onClick={() => void openAiDialoog(type, conceptInBeoordeling.id)}
                          >
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            <span>Nieuw concept wacht op beoordeling naast het actieve model</span>
                          </button>
                          <div className="flex items-center gap-2 px-1">
                            <Button
                              size="sm"
                              variant="link"
                              className="h-auto p-0 text-[10px] text-blue-600"
                              onClick={() => window.open(`/api/studio/modellen/${conceptInBeoordeling.id}/referentie`, "_blank")}
                            >
                              Bekijk referentie
                            </Button>
                          </div>
                        </div>
                      )}
                      {magSchrijven && (
                        <div className="flex flex-col gap-2 mt-auto">
                          {/* Genereer/bekijk knop — referentie is optioneel (AI valt terug op huisstijl) */}
                          <Button
                            size="sm"
                            variant={heeftConcept || status === "goedgekeurd" ? "outline" : "default"}
                            className="w-full"
                            onClick={() => void openAiDialoog(type)}
                            disabled={aiBezig}
                          >
                            <Sparkles className="h-3.5 w-3.5 mr-1" />
                            {status === "goedgekeurd" ? "Template bekijken" : heeftConcept ? "Template verfijnen" : "Genereer met AI"}
                          </Button>
                          {/* Goedkeuren knop voor concepten */}
                          {status === "concept" && heeftConcept && (
                            <Button
                              size="sm"
                              className="w-full"
                              variant="default"
                              onClick={() => {
                                setAiModelId(model?.id ?? null);
                                setGoedkeurBevestigOpen(true);
                              }}
                              disabled={goedkeur.isPending}
                            >
                              <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                              Goedkeuren als Model 0
                            </Button>
                          )}
                          {/* Huisstijl-analyse knop — leidt een voorstel af, past nooit direct iets toe */}
                          {heeftReferentie && model && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full text-muted-foreground"
                              onClick={() => void openHuisstijlDialoog(model.id)}
                            >
                              <Wand2 className="h-3.5 w-3.5 mr-1" />
                              Huisstijl uit document overnemen
                            </Button>
                          )}
                          {/* Upload knop */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full text-muted-foreground"
                            onClick={() => void openUploadDialoog(type)}
                            disabled={upsert.isPending}
                          >
                            <Upload className="h-3.5 w-3.5 mr-1" />
                            {status === "geen" ? "Referentie uploaden" : "Referentie vervangen"}
                          </Button>
                        </div>
                      )}
                      {aantalVersies > 0 && (
                        <Button
                          size="sm"
                          variant="link"
                          className="w-full h-auto py-0 text-xs text-muted-foreground justify-start px-0"
                          onClick={() => openVersiesDialoog(type)}
                        >
                          <History className="h-3 w-3 mr-1" />
                          Versiegeschiedenis {aantalVersies > 1 ? `(${aantalVersies})` : ""}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Upload-dialoog ─────────────────────────────────────────────────── */}
      <Dialog open={uploadDialoogOpen} onOpenChange={(o) => { if (!o) sluitUploadDialoog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Referentie uploaden — {typeLabel}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload een bestaand document als referentie voor de huisstijl van{" "}
              <strong>{geselecteerdeWerkgever?.naam}</strong>. Ondersteunde formaten: PDF, JPG, PNG, WEBP (max 10 MB).
            </p>

            <div
              onDragOver={(e) => { e.preventDefault(); setSleepActief(true); }}
              onDragLeave={() => setSleepActief(false)}
              onDrop={onDrop}
              onClick={() => bestandInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                sleepActief
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/30",
              )}
            >
              {uploadBezig ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Uploaden...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <LayoutTemplate className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Sleep bestand hierheen of klik om te bladeren</p>
                  <p className="text-xs text-muted-foreground">PDF, JPG, PNG of WEBP, max 10 MB</p>
                </div>
              )}
            </div>

            <input
              ref={bestandInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => {
                const bestand = e.target.files?.[0];
                if (bestand) void verwerkBestand(bestand);
                e.target.value = "";
              }}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={sluitUploadDialoog} disabled={uploadBezig}>
              Annuleren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AI Generatie-dialoog ───────────────────────────────────────────── */}
      <Dialog open={aiDialoogOpen} onOpenChange={(o) => { if (!o) { setAiDialoogOpen(false); setGoedkeurBevestigOpen(false); } }}>
        <DialogContent className="max-w-5xl w-full max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              AI Template Generatie — {aiTypeLabel}
            </DialogTitle>
            <DialogDescription>
              De AI genereert een Connect-template op basis van het referentiebestand en de huisstijl van{" "}
              <strong>{geselecteerdeWerkgever?.naam}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-6 flex-1 min-h-0 overflow-hidden">
            {/* Links: preview */}
            <div className="flex-1 overflow-y-auto border rounded-lg bg-gray-50 p-4 pb-14">
              {aiBezig && !aiModel?.connect_template_json ? (
                <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">AI genereert template...</p>
                </div>
              ) : aiModel?.connect_template_json ? (
                <StudioTemplatePreview
                  templateJson={aiModel.connect_template_json}
                  logoUrl={geselecteerdeWerkgever?.logo_url}
                  werkgeverNaam={geselecteerdeWerkgever?.naam ?? "Werkmaatschappij"}
                />
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-center">
                  <Sparkles className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">Nog geen template gegenereerd</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {aiModel?.referentie_bestand_pad
                        ? "Klik op 'Genereer' om te starten."
                        : "Upload eerst een referentiebestand, dan kan de AI een template genereren."}
                    </p>
                  </div>
                  {aiModel?.referentie_bestand_pad && (
                    <Button
                      onClick={() => void triggerGenereer(aiModel.id, null)}
                      disabled={aiBezig}
                    >
                      {aiBezig ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                      Genereer template
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Rechts: bijstuur-paneel */}
            <div className="w-72 shrink-0 flex flex-col gap-4">
              {/* Status badge */}
              {aiModel && (
                <div>
                  <Badge
                    className={cn("text-xs", STATUS_CONFIG[aiModel.status]?.klasse ?? STATUS_CONFIG.geen.klasse)}
                    variant="outline"
                  >
                    {STATUS_CONFIG[aiModel.status]?.label ?? "Onbekend"}
                  </Badge>
                  {aiModel.status === "goedgekeurd" && aiModel.goedgekeurd_op && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Goedgekeurd op {new Date(aiModel.goedgekeurd_op).toLocaleDateString("nl-NL")}
                    </p>
                  )}
                </div>
              )}

              {/* Bijstuur */}
              {aiModel?.connect_template_json && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-foreground">Bijstuur-instructie</p>
                  <Textarea
                    value={aiInstructie}
                    onChange={(e) => setAiInstructie(e.target.value)}
                    placeholder="bv. &quot;Verklein het logo&quot;, &quot;voeg een ondertekeningsvak toe&quot;, &quot;gebruik een lichtere achtergrond&quot;..."
                    className="text-xs min-h-[100px] resize-none"
                    disabled={aiBezig || aiModel.status === "goedgekeurd"}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!aiInstructie.trim() || aiBezig || aiModel.status === "goedgekeurd"}
                    onClick={() => void triggerBijstuur()}
                    className="w-full"
                  >
                    {bijstuur.isPending
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Verfijnen...</>
                      : <><RefreshCw className="h-3.5 w-3.5 mr-1" />Verfijnen</>
                    }
                  </Button>
                </div>
              )}

              {/* Opnieuw genereren */}
              {aiModel?.referentie_bestand_pad && aiModel.connect_template_json && aiModel.status !== "goedgekeurd" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  disabled={aiBezig}
                  onClick={() => void triggerGenereer(aiModel.id, null)}
                >
                  {genereer.isPending
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Opnieuw genereren...</>
                    : <><Sparkles className="h-3.5 w-3.5 mr-1" />Opnieuw genereren</>
                  }
                </Button>
              )}

              {/* Iteratiegeschiedenis */}
              {aiIteraties.length > 0 && (
                <div className="border rounded-lg p-3 bg-muted/40">
                  <div className="flex items-center gap-1.5 mb-2">
                    <History className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground">Bijstuur-geschiedenis</p>
                  </div>
                  <ul className="space-y-1.5">
                    {aiIteraties.map((it, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <ChevronRight className="h-3 w-3 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Goedkeuren */}
              {aiModel?.connect_template_json && aiModel.status !== "goedgekeurd" && (
                <div className="mt-auto pt-2 border-t">
                  <Button
                    className="w-full"
                    disabled={aiBezig || goedkeur.isPending}
                    onClick={() => setGoedkeurBevestigOpen(true)}
                  >
                    <ThumbsUp className="h-4 w-4 mr-2" />
                    Goedkeuren als Model 0
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Dit stelt het template definitief vast als officieel Connect-sjabloon.
                  </p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Goedkeur-bevestigingsdialoog ──────────────────────────────────── */}
      <Dialog open={goedkeurBevestigOpen} onOpenChange={setGoedkeurBevestigOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Model 0 goedkeuren</DialogTitle>
            <DialogDescription>
              Weet u zeker dat u dit Connect-template wilt goedkeuren als Model 0 voor{" "}
              <strong>{geselecteerdeWerkgever?.naam}</strong>? Na goedkeuring wordt het template Connect-breed
              gebruikt voor dit documenttype.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setGoedkeurBevestigOpen(false)} disabled={goedkeur.isPending}>
              Annuleren
            </Button>
            <Button onClick={() => void triggerGoedkeuren()} disabled={goedkeur.isPending}>
              {goedkeur.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Goedkeuren...</>
                : <><ThumbsUp className="h-4 w-4 mr-2" />Goedkeuren</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Huisstijl-voorstel dialoog (AI-analyse van referentiedocument) ──── */}
      <Dialog
        open={huisstijlDialoogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setHuisstijlDialoogOpen(false);
            setHuisstijlVoorstel(null);
            setHuisstijlBeslissingen({});
          }
        }}
      >
        <DialogContent className="max-w-2xl w-full max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-amber-500" />
              Huisstijl-voorstel uit referentiedocument
            </DialogTitle>
            <DialogDescription>
              De AI leidt huisstijlgegevens af uit het referentiebestand van{" "}
              <strong>{geselecteerdeWerkgever?.naam}</strong>. Niets wordt automatisch overgenomen — beoordeel elk
              veld en accepteer, bewerk of verwerp het voorstel voordat het wordt toegepast.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-1 px-1 pb-14">
            {analyseerHuisstijl.isPending ? (
              <div className="flex flex-col items-center justify-center min-h-[200px] gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">AI analyseert het referentiedocument...</p>
              </div>
            ) : huisstijlVoorstel ? (
              Object.keys(huisstijlBeslissingen).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  De AI kon geen huisstijlgegevens afleiden uit dit document.
                </p>
              ) : (
                <div className="space-y-1">
                  {huisstijlVoorstel.voorstel.redenering && (
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2 mb-2">
                      {huisstijlVoorstel.voorstel.redenering}
                    </p>
                  )}
                  {!huisstijlVoorstel.vision_gebruikt && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-md p-2 mb-2">
                      Alleen de tekstlaag van het document kon worden gelezen; visuele kenmerken (zoals kleur of
                      lay-out) zijn mogelijk niet meegenomen.
                    </p>
                  )}
                  {HUISSTIJL_VELDEN.map(({ key, label }) => {
                    const beslissing = huisstijlBeslissingen[key];
                    if (!beslissing) return null;
                    const huidigeWaarde = huisstijlVoorstel.huidig[key];
                    const isPositieVeld = key === "koptekst_positie" || key === "voettekst_positie";
                    const nogNietZichtbaar = key === "koptekst_positie" || key === "marge_boven";
                    return (
                      <div key={key} className="flex items-start gap-3 py-2 border-b last:border-0">
                        <div className="w-32 shrink-0 pt-2">
                          <p className="text-xs font-medium">{label}</p>
                          {huidigeWaarde !== null && huidigeWaarde !== undefined && String(huidigeWaarde) !== "" && (
                            <p className="text-[11px] text-muted-foreground truncate" title={String(huidigeWaarde)}>
                              Huidig: {String(huidigeWaarde)}
                            </p>
                          )}
                          {nogNietZichtbaar && (
                            <p className="text-[10px] text-muted-foreground italic">
                              Wordt opgeslagen, nog niet zichtbaar in preview
                            </p>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {beslissing.actie === "verworpen" ? (
                            <p className="text-xs text-muted-foreground italic pt-2">Verworpen</p>
                          ) : isPositieVeld ? (
                            <Select
                              value={String(beslissing.waarde ?? "")}
                              onValueChange={(v) => zetHuisstijlWaarde(key, v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="links">Links</SelectItem>
                                <SelectItem value="midden">Midden</SelectItem>
                                <SelectItem value="rechts">Rechts</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={String(beslissing.waarde ?? "")}
                              onChange={(e) => zetHuisstijlWaarde(key, e.target.value)}
                              className={cn("h-8 text-xs", beslissing.actie === "geaccepteerd" && "border-green-400")}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 pt-0.5">
                          <Button
                            size="icon"
                            variant={beslissing.actie === "geaccepteerd" ? "default" : "outline"}
                            className="h-7 w-7"
                            onClick={() => zetHuisstijlActie(key, "geaccepteerd")}
                            title="Accepteren"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant={beslissing.actie === "verworpen" ? "destructive" : "outline"}
                            className="h-7 w-7"
                            onClick={() => zetHuisstijlActie(key, "verworpen")}
                            title="Verwerpen"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[200px] gap-3 text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Geen voorstel beschikbaar.</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 shrink-0 border-t pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={accepteerAlleHuisstijl}
              disabled={!huisstijlVoorstel || Object.keys(huisstijlBeslissingen).length === 0}
              className="mr-auto"
            >
              Alles accepteren
            </Button>
            <Button variant="outline" onClick={() => setHuisstijlDialoogOpen(false)}>
              Annuleren
            </Button>
            <Button
              onClick={() => void toepassenHuisstijl()}
              disabled={geaccepteerdeHuisstijlVelden.length === 0 || updateWerkgever.isPending}
            >
              {updateWerkgever.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Toepassen...
                </>
              ) : (
                <>Toepassen ({geaccepteerdeHuisstijlVelden.length})</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Versiegeschiedenis-dialoog ─────────────────────────────────────── */}
      <Dialog open={versiesDialoogOpen} onOpenChange={(o) => { if (!o) sluitVersiesDialoog(); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              Versiegeschiedenis — {versiesTypeLabel}
            </DialogTitle>
            <DialogDescription>
              Alle versies blijven bewaard. Terugzetten archiveert het huidige actieve model en maakt de
              gekozen versie opnieuw actief onder een nieuw versienummer — er wordt niets verwijderd.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pb-14">
            {versiesLijst.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Nog geen versies voor dit documenttype.</p>
            )}
            {versiesLijst.map((v) => {
              const cfg = STATUS_CONFIG[v.status] ?? STATUS_CONFIG.geen;
              const kanTerugzetten = magSchrijven && v.status === "gearchiveerd" && Boolean(v.connect_template_json);
              return (
                <div
                  key={v.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border px-3 py-2",
                    v.status === "goedgekeurd" ? "border-green-200 bg-green-50" : "",
                  )}
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Versie {v.versie}</span>
                      <Badge className={cn("text-xs", cfg.klasse)} variant="outline">{cfg.label}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {v.goedgekeurd_op && (
                        <p>Actief geworden op {new Date(v.goedgekeurd_op).toLocaleString("nl-NL")}</p>
                      )}
                      {v.gearchiveerd_op && (
                        <p>Gearchiveerd op {new Date(v.gearchiveerd_op).toLocaleString("nl-NL")}</p>
                      )}
                      {!v.goedgekeurd_op && !v.gearchiveerd_op && (
                        <p>Aangemaakt op {new Date(v.aangemaakt_op).toLocaleString("nl-NL")}</p>
                      )}
                    </div>
                  </div>
                  {kanTerugzetten && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={terugzettenId !== null}
                      onClick={() => void terugzettenNaarVersie(v)}
                    >
                      {terugzettenId === v.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          Terugzetten
                        </>
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={sluitVersiesDialoog}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

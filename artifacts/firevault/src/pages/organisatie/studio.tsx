import { useState, useRef, useCallback } from "react";
import {
  useListStudioWerkgevers,
  useListDocumentStudioModellen,
  useUpsertDocumentStudioModel,
  useUploadDocumentStudioReferentie,
  useGenereerStudioTemplate,
  useBijstuurStudioTemplate,
  useGoedkeurenStudioTemplate,
  getListDocumentStudioModellenQueryKey,
} from "@workspace/api-client-react";
import type { DocumentStudioModel } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import StudioTemplatePreview from "@/components/documentopmaak/StudioTemplatePreview";

const DOCUMENT_TYPEN: {
  type: string;
  label: string;
  icoon: typeof FileText;
  omschrijving: string;
}[] = [
  { type: "offerte",    label: "Offerte",      icoon: FileText,       omschrijving: "Offertesjabloon richting klant" },
  { type: "brief",      label: "Brief",         icoon: FileText,       omschrijving: "Formele correspondentiebrief" },
  { type: "email",      label: "E-mail",        icoon: Mail,           omschrijving: "Standaard e-mailsjabloon" },
  { type: "lmra",       label: "LMRA",          icoon: ClipboardCheck, omschrijving: "Laatste Minuut Risico Analyse" },
  { type: "toolbox",    label: "Toolbox",       icoon: Hammer,         omschrijving: "Toolbox-meeting document" },
  { type: "inkoopbon",  label: "Inkoopbon",     icoon: Package,        omschrijving: "Interne inkoopbon" },
  { type: "factuur",    label: "Factuur",       icoon: Receipt,        omschrijving: "Factuursjabloon" },
  { type: "calculatie", label: "Calculatie",    icoon: Calculator,     omschrijving: "Calculatie-werkblad" },
];

const STATUS_CONFIG: Record<string, { label: string; klasse: string; beschrijving: string }> = {
  geen:         { label: "Geen model",          klasse: "bg-gray-100 text-gray-600",    beschrijving: "Er is nog geen referentie of model voor dit documenttype." },
  referentie:   { label: "Referentie ge-upload",klasse: "bg-amber-100 text-amber-700", beschrijving: "Referentiedocument aanwezig. Klaar voor AI-generatie." },
  concept:      { label: "Concept",             klasse: "bg-blue-100 text-blue-700",   beschrijving: "AI heeft een concept gegenereerd. Beoordeling vereist." },
  goedgekeurd:  { label: "Model 0 goedgekeurd", klasse: "bg-green-100 text-green-700", beschrijving: "Dit model is goedgekeurd als officieel Connect-template." },
};

const TOEGESTANE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

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

  const werkgeverId = geselecteerdeWerkgeverId ?? (werkgevers[0]?.id ?? null);

  const { data: modellen = [], isLoading: laadtModellen } = useListDocumentStudioModellen(
    werkgeverId ? { werkgever_id: werkgeverId } : undefined,
  );

  const upsert   = useUpsertDocumentStudioModel();
  const upload   = useUploadDocumentStudioReferentie();
  const genereer = useGenereerStudioTemplate();
  const bijstuur = useBijstuurStudioTemplate();
  const goedkeur = useGoedkeurenStudioTemplate();

  const geselecteerdeWerkgever = werkgevers.find((w) => w.id === werkgeverId);
  const aiModel = aiModelId ? modellen.find((m) => m.id === aiModelId) : null;

  function modelVoorType(type: string): DocumentStudioModel | undefined {
    return modellen.find((m) => m.document_type === type);
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
    const bestaand = modelVoorType(type);
    if (bestaand) {
      setUploadModelId(bestaand.id);
    } else {
      try {
        const nieuw = await upsert.mutateAsync({ data: { werkgever_id: werkgeverId, document_type: type } });
        setUploadModelId(nieuw.id);
        invalideer();
      } catch {
        toast({ title: "Kon model niet aanmaken", variant: "destructive" });
        return;
      }
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
      toast({ title: "Referentie ge-upload", description: "Het referentiedocument is opgeslagen." });
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

  const openAiDialoog = async (type: string) => {
    if (!werkgeverId) return;
    let model = modelVoorType(type);
    if (!model) {
      try {
        model = await upsert.mutateAsync({ data: { werkgever_id: werkgeverId, document_type: type } });
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

    // Als er nog geen concept is maar wel een referentie, direct genereren
    if (!model.connect_template_json && model.referentie_bestand_pad) {
      void triggerGenereer(model.id, null);
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

  const aiBezig = genereer.isPending || bijstuur.isPending;

  const typeLabel = DOCUMENT_TYPEN.find((t) => t.type === uploadType)?.label ?? uploadType;
  const aiTypeLabel = DOCUMENT_TYPEN.find((t) => t.type === aiModel?.document_type)?.label ?? aiModel?.document_type;

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
              {Object.entries(STATUS_CONFIG).map(([sleutel, cfg]) => {
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

                return (
                  <Card key={type} className="flex flex-col">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-md bg-muted">
                            <Icoon className="h-4 w-4 text-muted-foreground" />
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
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ImageIcon className="h-3 w-3" />
                          <span>Referentie aanwezig</span>
                        </div>
                      )}
                      {model?.goedgekeurd_op && (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Goedgekeurd op {new Date(model.goedgekeurd_op).toLocaleDateString("nl-NL")}</span>
                        </div>
                      )}
                      {magSchrijven && (
                        <div className="flex flex-col gap-2 mt-auto">
                          {/* Genereer/bekijk knop — beschikbaar als referentie aanwezig is */}
                          {heeftReferentie && (
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
            <div className="flex-1 overflow-y-auto border rounded-lg bg-gray-50 p-4">
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
    </div>
  );
}

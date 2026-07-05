import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVisuals,
  useCreateBeheerVisual,
  useUpdateVisual,
  useDeleteVisual,
  useRequestUploadUrl,
  getListVisualsQueryKey,
  ListVisualsActief,
} from "@workspace/api-client-react";
import type { Visual } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Plus, Pencil, Trash2, ImageIcon, CheckCircle2, XCircle, Upload, FileJson, FileImage, Loader2, TriangleAlert } from "lucide-react";

const VISUAL_TYPES = [
  { waarde: "detailtekening",           label: "Detailtekening" },
  { waarde: "projecttekening_uitsnede", label: "Projecttekening uitsnede" },
  { waarde: "referentiefoto",           label: "Referentiefoto" },
  { waarde: "exploded_view",            label: "Exploded view" },
  { waarde: "animatie",                 label: "Animatie (Lottie)" },
  { waarde: "checklist",                label: "Checklist" },
  { waarde: "productblad",              label: "Productblad" },
  { waarde: "montagevoorschrift",       label: "Montagevoorschrift" },
  { waarde: "schema",                   label: "Schema" },
  { waarde: "3d_weergave",              label: "3D-weergave" },
] as const;

const BRON_TYPES = [
  { waarde: "projecttekening",    label: "Projecttekening" },
  { waarde: "ETA",                label: "ETA (Europese Technische Beoordeling)" },
  { waarde: "DoP",                label: "DoP (Prestatieverklaring)" },
  { waarde: "montagevoorschrift", label: "Montagevoorschrift" },
  { waarde: "fps_standaard",      label: "FPS Standaard" },
  { waarde: "praktijkfoto",       label: "Praktijkfoto" },
  { waarde: "productblad",        label: "Productblad" },
] as const;

const SPOT_TYPES = [
  "branddeur",
  "doorvoering",
  "brandklep",
  "manchet",
  "coating",
  "brandwerende afdichting",
  "brandwerende glasconstructie",
  "brandwerende dakdoorvoer",
  "rookscherm",
  "branddamper",
] as const;

const TOEGESTANE_TYPEN: Record<string, string> = {
  "image/jpeg":       "afbeelding (.jpg)",
  "image/png":        "afbeelding (.png)",
  "image/webp":       "afbeelding (.webp)",
  "image/gif":        "afbeelding (.gif)",
  "image/svg+xml":    "afbeelding (.svg)",
  "application/json": "Lottie animatie (.json)",
  "application/pdf":  "PDF-document (.pdf)",
};

function isAfbeelding(contentType: string) {
  return contentType.startsWith("image/");
}

const GROOT_BESTAND_GRENS = 10 * 1024 * 1024;

function formateerGrootte(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function visualTypeLabel(waarde: string) {
  return VISUAL_TYPES.find((v) => v.waarde === waarde)?.label ?? waarde;
}

function bronTypeLabel(waarde: string) {
  return BRON_TYPES.find((b) => b.waarde === waarde)?.label ?? waarde;
}

const LEEG_FORMULIER = {
  naam: "",
  visual_type: "" as string,
  bron_type: "" as string,
  bron_referentie: "",
  object_path: "",
  thumbnail_path: "",
  spot_type: [] as string[],
  taal: "nl",
};

export default function VisualLibraryBeheer() {
  const queryClient = useQueryClient();

  const [filterActief, setFilterActief] = useState<"alle" | "actief" | "concept">("alle");
  const [filterVisualType, setFilterVisualType] = useState<string>("__alle__");
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [bewerkItem, setBewerkItem] = useState<Visual | null>(null);
  const [verwijderItem, setVerwijderItem] = useState<Visual | null>(null);
  const [formulier, setFormulier] = useState({ ...LEEG_FORMULIER });
  const [bewaarFout, setBewaarFout] = useState("");
  const [bewaarBezig, setBewaarBezig] = useState(false);

  const [uploadBezig, setUploadBezig] = useState(false);
  const [uploadFout, setUploadFout] = useState("");
  const [uploadPoging, setUploadPoging] = useState(0);
  const [geuploadBestand, setGeuploadBestand] = useState<string>("");
  const [bestandGrootte, setBestandGrootte] = useState<number | null>(null);
  const [sleepActief, setSleepActief] = useState(false);

  const bestandInputRef = useRef<HTMLInputElement>(null);
  const huidigBestandRef = useRef<File | null>(null);
  const requestUploadUrl = useRequestUploadUrl();

  const queryParams = {
    actief: filterActief === "actief"
      ? ListVisualsActief.true
      : filterActief === "concept"
        ? ListVisualsActief.false
        : undefined,
    visual_type: filterVisualType !== "__alle__" ? filterVisualType : undefined,
  };

  const { data: visuals = [], isLoading } = useListVisuals(queryParams);
  const maakVisual = useCreateBeheerVisual();
  const wijzigVisual = useUpdateVisual();
  const verwijderVisual = useDeleteVisual();

  function openNieuw() {
    setFormulier({ ...LEEG_FORMULIER });
    setBewaarFout("");
    setUploadFout("");
    setGeuploadBestand("");
    setBestandGrootte(null);
    setNieuwOpen(true);
  }

  function openBewerk(v: Visual) {
    setFormulier({
      naam: v.naam,
      visual_type: v.visual_type,
      bron_type: v.bron_type,
      bron_referentie: v.bron_referentie ?? "",
      object_path: v.object_path,
      thumbnail_path: v.thumbnail_path ?? "",
      spot_type: v.spot_type ?? [],
      taal: v.taal,
    });
    setBewaarFout("");
    setUploadFout("");
    setGeuploadBestand(v.object_path ? `Huidig: ${v.object_path.split("/").pop() ?? v.object_path}` : "");
    setBewerkItem(v);
  }

  function sluitDialogen() {
    setNieuwOpen(false);
    setBewerkItem(null);
    setBewaarFout("");
    setBewaarBezig(false);
    setUploadFout("");
    setUploadPoging(0);
    setGeuploadBestand("");
    setBestandGrootte(null);
    setSleepActief(false);
    huidigBestandRef.current = null;
  }

  function toggleSpotType(type: string) {
    setFormulier((f) => ({
      ...f,
      spot_type: f.spot_type.includes(type)
        ? f.spot_type.filter((s) => s !== type)
        : [...f.spot_type, type],
    }));
  }

  async function uploadBestand(bestand: File) {
    setUploadFout("");
    setUploadBezig(true);
    setUploadPoging(0);
    setGeuploadBestand("");
    huidigBestandRef.current = bestand;
    setBestandGrootte(bestand.size);

    const contentType = bestand.type || "application/octet-stream";

    if (!TOEGESTANE_TYPEN[contentType]) {
      setUploadFout(`Bestandstype niet ondersteund. Gebruik: ${Object.values(TOEGESTANE_TYPEN).join(", ")}.`);
      setUploadBezig(false);
      huidigBestandRef.current = null;
      return;
    }

    const bestandType = isAfbeelding(contentType) ? "foto" : "algemeen";

    let uploadURL: string;
    let objectPath: string;

    try {
      const result = await requestUploadUrl.mutateAsync({
        data: {
          name: bestand.name,
          size: bestand.size,
          contentType,
          bestand_type: bestandType,
        },
      });
      uploadURL = result.uploadURL;
      objectPath = result.objectPath;
    } catch (err) {
      const bericht = err instanceof Error ? err.message : "Onbekende fout";
      setUploadFout(`Upload voorbereiden mislukt: ${bericht}`);
      setUploadBezig(false);
      return;
    }

    const MAX_POGINGEN = 3;
    const BACKOFF_MS = [500, 1000, 1500];
    let lastErr: Error | null = null;

    for (let poging = 1; poging <= MAX_POGINGEN; poging++) {
      setUploadPoging(poging);
      try {
        const uploadResp = await fetch(uploadURL, {
          method: "PUT",
          body: bestand,
          headers: { "Content-Type": contentType },
        });

        if (!uploadResp.ok) {
          if (uploadResp.status === 403) {
            // Presigned URL is mogelijk verlopen — haal een verse op en probeer opnieuw.
            if (poging < MAX_POGINGEN) {
              try {
                const verversResult = await requestUploadUrl.mutateAsync({
                  data: {
                    name: bestand.name,
                    size: bestand.size,
                    contentType,
                    bestand_type: bestandType,
                  },
                });
                uploadURL = verversResult.uploadURL;
                objectPath = verversResult.objectPath;
              } catch {
                // Nieuwe URL ophalen mislukt — backoff en probeer met oude URL.
              }
              await new Promise<void>((resolve) => setTimeout(resolve, BACKOFF_MS[poging - 1]));
              continue;
            }
            setUploadFout(
              `Upload geweigerd na ${MAX_POGINGEN} pogingen (toegang geweigerd). Sluit het dialoog en probeer opnieuw.`
            );
            setUploadBezig(false);
            setUploadPoging(0);
            return;
          }
          if (uploadResp.status >= 400 && uploadResp.status < 500) {
            setUploadFout(
              `Bestand geweigerd door de opslag (HTTP ${uploadResp.status}). Controleer het bestandstype of de bestandsinhoud.`
            );
            setUploadBezig(false);
            setUploadPoging(0);
            return;
          }
          throw new Error(`HTTP ${uploadResp.status}`);
        }

        setFormulier((f) => ({
          ...f,
          object_path: objectPath,
          thumbnail_path: isAfbeelding(contentType) ? objectPath : f.thumbnail_path,
        }));
        setGeuploadBestand(bestand.name);
        setUploadBezig(false);
        setUploadPoging(0);
        return;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error("Onbekende fout");
        if (poging < MAX_POGINGEN) {
          await new Promise<void>((resolve) => setTimeout(resolve, BACKOFF_MS[poging - 1]));
        }
      }
    }

    const isNetwerkFout =
      lastErr instanceof TypeError ||
      lastErr?.message === "Failed to fetch" ||
      lastErr?.message === "NetworkError when attempting to fetch resource.";

    if (isNetwerkFout) {
      setUploadFout(
        `Verbinding tijdelijk weggevallen na ${MAX_POGINGEN} pogingen. Controleer uw netwerk en klik op "Opnieuw proberen".`
      );
    } else {
      setUploadFout(
        `Upload definitief mislukt na ${MAX_POGINGEN} pogingen (${lastErr?.message ?? "onbekende fout"}). Klik op "Opnieuw proberen".`
      );
    }
    setUploadBezig(false);
    setUploadPoging(0);
  }

  const handleBestandKiezen = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const bestand = e.target.files?.[0];
    if (bestand) void uploadBestand(bestand);
    if (bestandInputRef.current) bestandInputRef.current.value = "";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSleepActief(false);
    const bestand = e.dataTransfer.files?.[0];
    if (bestand) void uploadBestand(bestand);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSleepActief(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setSleepActief(false);
  }, []);

  async function bewaar() {
    if (!formulier.naam.trim()) { setBewaarFout("Naam is verplicht"); return; }
    if (!formulier.visual_type) { setBewaarFout("Visual type is verplicht"); return; }
    if (!formulier.bron_type)   { setBewaarFout("Bron type is verplicht"); return; }
    if (!formulier.object_path.trim()) { setBewaarFout("Upload een bestand of voer een object pad in"); return; }

    setBewaarBezig(true);
    setBewaarFout("");
    try {
      const payload = {
        naam: formulier.naam.trim(),
        visual_type: formulier.visual_type,
        bron_type: formulier.bron_type,
        bron_referentie: formulier.bron_referentie.trim() || undefined,
        object_path: formulier.object_path.trim(),
        thumbnail_path: formulier.thumbnail_path.trim() || undefined,
        spot_type: formulier.spot_type,
        taal: formulier.taal || "nl",
      };

      if (bewerkItem) {
        await wijzigVisual.mutateAsync({ id: bewerkItem.id, data: payload });
      } else {
        await maakVisual.mutateAsync({ data: payload });
      }

      await queryClient.invalidateQueries({ queryKey: getListVisualsQueryKey() });
      sluitDialogen();
    } catch {
      setBewaarFout("Opslaan mislukt. Controleer alle velden en probeer opnieuw.");
    } finally {
      setBewaarBezig(false);
    }
  }

  async function toggleActief(v: Visual) {
    try {
      await wijzigVisual.mutateAsync({ id: v.id, data: { actief: !v.actief } });
      await queryClient.invalidateQueries({ queryKey: getListVisualsQueryKey() });
    } catch {
      // Stille fout — gebruiker kan opnieuw proberen
    }
  }

  async function verwijder() {
    if (!verwijderItem) return;
    try {
      await verwijderVisual.mutateAsync({ id: verwijderItem.id });
      await queryClient.invalidateQueries({ queryKey: getListVisualsQueryKey() });
      setVerwijderItem(null);
    } catch {
      // Stille fout
    }
  }

  const isOpen = nieuwOpen || !!bewerkItem;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Visual Library</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Goedgekeurde visuals voor de AI Visual Guidance Engine — tekeningen, referentiefoto's en animaties.
          </p>
        </div>
        <Button onClick={openNieuw}>
          <Plus className="h-4 w-4 mr-2" />
          Nieuwe visual
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {(["alle", "actief", "concept"] as const).map((f) => (
            <Button
              key={f}
              variant={filterActief === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterActief(f)}
            >
              {f === "alle" ? "Alle" : f === "actief" ? "Actief" : "Concept"}
            </Button>
          ))}
        </div>
        <Select
          value={filterVisualType}
          onValueChange={setFilterVisualType}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Alle typen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__alle__">Alle typen</SelectItem>
            {VISUAL_TYPES.map((vt) => (
              <SelectItem key={vt.waarde} value={vt.waarde}>{vt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {visuals.length} visual{visuals.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Lijst */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm py-8 text-center">Laden...</div>
      ) : visuals.length === 0 ? (
        <div className="text-muted-foreground text-sm py-12 text-center">
          Geen visuals gevonden. Klik op "Nieuwe visual" om te beginnen.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visuals.map((v) => (
            <Card key={v.id} className="flex flex-col">
              {/* Thumbnail */}
              <div className="relative bg-muted rounded-t-lg overflow-hidden h-40 flex items-center justify-center">
                {v.thumbnail_path ? (
                  <img
                    src={`/api/storage/object?path=${encodeURIComponent(v.thumbnail_path)}`}
                    alt={v.naam}
                    className="object-contain w-full h-full"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                      (e.currentTarget.nextElementSibling as HTMLElement | null)?.removeAttribute("hidden");
                    }}
                  />
                ) : null}
                <div className={`flex flex-col items-center gap-1 text-muted-foreground ${v.thumbnail_path ? "hidden" : ""}`}>
                  <ImageIcon className="h-8 w-8" />
                  <span className="text-xs">Geen thumbnail</span>
                </div>
                <div className="absolute top-2 right-2">
                  <Switch
                    checked={v.actief}
                    onCheckedChange={() => void toggleActief(v)}
                    title={v.actief ? "Deactiveren" : "Activeren"}
                  />
                </div>
              </div>

              <CardHeader className="pb-2 pt-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold leading-tight">{v.naam}</CardTitle>
                  {v.actief ? (
                    <Badge className="shrink-0 text-[10px] px-1.5 py-0 bg-green-100 text-green-800 border-green-200">
                      <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                      Actief
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-muted-foreground">
                      <XCircle className="h-2.5 w-2.5 mr-0.5" />
                      Concept
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex-1 pb-3 space-y-2">
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {visualTypeLabel(v.visual_type)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {bronTypeLabel(v.bron_type)}
                  </Badge>
                </div>

                {v.spot_type && v.spot_type.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {v.spot_type.slice(0, 3).map((s) => (
                      <span key={s} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                    {v.spot_type.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{v.spot_type.length - 3}</span>
                    )}
                  </div>
                )}

                {v.bron_referentie && (
                  <p className="text-[11px] text-muted-foreground truncate" title={v.bron_referentie}>
                    Ref: {v.bron_referentie}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    onClick={() => openBewerk(v)}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Bewerken
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => setVerwijderItem(v)}
                    title="Verwijderen"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Aanmaken / Bewerken dialoog */}
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) sluitDialogen(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{bewerkItem ? "Visual bewerken" : "Nieuwe visual"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="vl-naam">Naam <span className="text-destructive">*</span></Label>
              <Input
                id="vl-naam"
                placeholder="Bijv. Brandklep montageschema type A"
                value={formulier.naam}
                onChange={(e) => setFormulier((f) => ({ ...f, naam: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="vl-visual-type">Visual type <span className="text-destructive">*</span></Label>
                <Select
                  value={formulier.visual_type}
                  onValueChange={(v) => setFormulier((f) => ({ ...f, visual_type: v }))}
                >
                  <SelectTrigger id="vl-visual-type">
                    <SelectValue placeholder="Kies type" />
                  </SelectTrigger>
                  <SelectContent>
                    {VISUAL_TYPES.map((vt) => (
                      <SelectItem key={vt.waarde} value={vt.waarde}>{vt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="vl-bron-type">Bron type <span className="text-destructive">*</span></Label>
                <Select
                  value={formulier.bron_type}
                  onValueChange={(v) => setFormulier((f) => ({ ...f, bron_type: v }))}
                >
                  <SelectTrigger id="vl-bron-type">
                    <SelectValue placeholder="Kies bron" />
                  </SelectTrigger>
                  <SelectContent>
                    {BRON_TYPES.map((bt) => (
                      <SelectItem key={bt.waarde} value={bt.waarde}>{bt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vl-bron-ref">Bronreferentie</Label>
              <Input
                id="vl-bron-ref"
                placeholder="Bijv. ETA-14/0222, FPS-STD-023"
                value={formulier.bron_referentie}
                onChange={(e) => setFormulier((f) => ({ ...f, bron_referentie: e.target.value }))}
              />
            </div>

            {/* Upload zone */}
            <div className="space-y-1.5">
              <Label>
                Bestand <span className="text-destructive">*</span>
              </Label>
              <div
                role="button"
                tabIndex={0}
                className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
                  ${sleepActief
                    ? "border-primary bg-primary/5"
                    : geuploadBestand && !uploadFout
                      ? "border-green-400 bg-green-50"
                      : "border-muted-foreground/25 hover:border-muted-foreground/50 bg-muted/30"
                  }
                  ${uploadBezig ? "pointer-events-none" : ""}
                `}
                onClick={() => !uploadBezig && bestandInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") bestandInputRef.current?.click(); }}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <input
                  ref={bestandInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.gif,.svg,.json,.pdf,image/*,application/json,application/pdf"
                  className="hidden"
                  onChange={handleBestandKiezen}
                />

                {uploadBezig ? (
                  <div className="flex flex-col items-center gap-2 py-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-sm">
                      {uploadPoging > 1
                        ? `Opnieuw proberen (poging ${uploadPoging} van 3)...`
                        : "Uploaden..."}
                    </span>
                  </div>
                ) : geuploadBestand && !uploadFout ? (
                  <div className="flex flex-col items-center gap-1.5 py-1">
                    {formulier.object_path.endsWith(".json")
                      ? <FileJson className="h-6 w-6 text-green-600" />
                      : <FileImage className="h-6 w-6 text-green-600" />
                    }
                    <span className="text-sm font-medium text-green-700 truncate max-w-full px-2">
                      {geuploadBestand}
                    </span>
                    {bestandGrootte !== null && (
                      <span className="text-[11px] text-muted-foreground">
                        {formateerGrootte(bestandGrootte)}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      Klik of sleep een nieuw bestand om te vervangen
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-2 text-muted-foreground">
                    <Upload className="h-6 w-6" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Klik om te uploaden of sleep hier een bestand</p>
                      <p className="text-[11px]">Afbeeldingen (JPG, PNG, WebP, SVG), Lottie JSON, PDF</p>
                    </div>
                  </div>
                )}
              </div>

              {bestandGrootte !== null && bestandGrootte > GROOT_BESTAND_GRENS && !uploadFout && (
                <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                  <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                  <span>Groot bestand ({formateerGrootte(bestandGrootte)}) — overweeg een geoptimaliseerde versie</span>
                </div>
              )}

              {uploadFout && (
                <div className="space-y-1.5">
                  <p className="text-sm text-destructive">{uploadFout}</p>
                  {huidigBestandRef.current && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground truncate max-w-xs">
                        {huidigBestandRef.current.name}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs shrink-0"
                        onClick={() => {
                          if (huidigBestandRef.current) void uploadBestand(huidigBestandRef.current);
                        }}
                      >
                        Opnieuw proberen
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Handmatig pad — altijd beschikbaar als fallback */}
              <details className="mt-1">
                <summary className="text-[11px] text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
                  Handmatig pad invoeren
                </summary>
                <div className="mt-2 space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="vl-object-path" className="text-xs">Object pad (storage)</Label>
                    <Input
                      id="vl-object-path"
                      placeholder="visuals/brandklep/montageschema-a.pdf"
                      value={formulier.object_path}
                      onChange={(e) => setFormulier((f) => ({ ...f, object_path: e.target.value }))}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="vl-thumb" className="text-xs">Thumbnail pad</Label>
                    <Input
                      id="vl-thumb"
                      placeholder="visuals/brandklep/montageschema-a-thumb.jpg"
                      value={formulier.thumbnail_path}
                      onChange={(e) => setFormulier((f) => ({ ...f, thumbnail_path: e.target.value }))}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              </details>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Spot-types <span className="text-muted-foreground font-normal text-xs">(koppeling voor VGE-selectie)</span></Label>
              <ScrollArea className="h-36 border rounded-md p-3">
                <div className="space-y-2">
                  {SPOT_TYPES.map((st) => (
                    <div key={st} className="flex items-center gap-2">
                      <Checkbox
                        id={`st-${st}`}
                        checked={formulier.spot_type.includes(st)}
                        onCheckedChange={() => toggleSpotType(st)}
                      />
                      <label
                        htmlFor={`st-${st}`}
                        className="text-sm cursor-pointer"
                      >
                        {st.charAt(0).toUpperCase() + st.slice(1)}
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              {formulier.spot_type.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Geselecteerd: {formulier.spot_type.join(", ")}
                </p>
              )}
            </div>

            {bewaarFout && (
              <p className="text-sm text-destructive">{bewaarFout}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={sluitDialogen} disabled={bewaarBezig || uploadBezig}>
              Annuleren
            </Button>
            <Button onClick={() => void bewaar()} disabled={bewaarBezig || uploadBezig}>
              {bewaarBezig ? "Opslaan..." : bewerkItem ? "Wijzigingen opslaan" : "Visual aanmaken"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verwijder bevestiging */}
      <AlertDialog open={!!verwijderItem} onOpenChange={(open) => { if (!open) setVerwijderItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Visual verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet u zeker dat u <strong>{verwijderItem?.naam}</strong> wilt verwijderen?
              Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void verwijder()}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

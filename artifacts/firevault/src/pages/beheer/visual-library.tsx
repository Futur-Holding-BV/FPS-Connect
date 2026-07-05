import { useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  Image,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Loader2,
  ImageOff,
  X,
  ScanSearch,
  Search,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Circle,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import {
  useListBeheerVisuals,
  useCreateBeheerVisual,
  useUpdateBeheerVisual,
  useDeleteBeheerVisual,
  getListBeheerVisualsQueryKey,
  type BeheerVisual,
  useListVisualLibrary,
  getListVisualLibraryQueryKey,
  type FpsVisualItem,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";

// ─── Constanten ───────────────────────────────────────────────────────────────

const VISUAL_TYPES = [
  { waarde: "detailtekening",           label: "Detailtekening" },
  { waarde: "referentiefoto",           label: "Referentiefoto" },
  { waarde: "exploded_view",            label: "Exploded view" },
  { waarde: "montagevoorschrift",       label: "Montagevoorschrift" },
  { waarde: "checklist",                label: "Checklist" },
  { waarde: "productblad",              label: "Productblad" },
  { waarde: "schema",                   label: "Schema" },
  { waarde: "animatie",                 label: "Animatie" },
  { waarde: "3d_weergave",              label: "3D-weergave" },
  { waarde: "projecttekening_uitsnede", label: "Projecttekening uitsnede" },
];

const BRON_TYPES = [
  { waarde: "projecttekening",    label: "Projecttekening" },
  { waarde: "ETA",                label: "ETA" },
  { waarde: "DoP",                label: "DoP" },
  { waarde: "montagevoorschrift", label: "Montagevoorschrift" },
  { waarde: "fps_standaard",      label: "FPS Standaard" },
  { waarde: "praktijkfoto",       label: "Praktijkfoto" },
  { waarde: "productblad",        label: "Productblad" },
];

const SPOT_TYPES = [
  "branddeur",
  "doorvoering",
  "brandklep",
  "manchet",
  "coating",
  "luik",
  "dakdoorvoer",
  "overig",
];

const VISUAL_TYPE_LABELS: Record<string, string> = {
  detailtekening: "Detailtekening",
  projecttekening_uitsnede: "Projecttekening",
  referentiefoto: "Referentiefoto",
  exploded_view: "Exploded view",
  animatie: "Animatie",
  checklist: "Checklist",
  productblad: "Productblad",
  montagevoorschrift: "Montagevoorschrift",
  schema: "Schema",
  "3d_weergave": "3D-weergave",
};

// ─── localStorage-state hook ───────────────────────────────────────────────────

function useLocalStorage<T>(sleutel: string, standaard: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [waarde, setWaarde] = useState<T>(() => {
    try {
      const opgeslagen = localStorage.getItem(sleutel);
      if (opgeslagen !== null) return JSON.parse(opgeslagen) as T;
    } catch {
      // kapotte waarde negeren
    }
    return standaard;
  });

  const stelIn = useCallback(
    (v: T | ((prev: T) => T)) => {
      setWaarde((prev) => {
        const nieuw = typeof v === "function" ? (v as (prev: T) => T)(prev) : v;
        try {
          localStorage.setItem(sleutel, JSON.stringify(nieuw));
        } catch {
          // quota-overschrijding negeren
        }
        return nieuw;
      });
    },
    [sleutel],
  );

  return [waarde, stelIn];
}

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

function storageUrl(pad: string): string {
  if (!pad) return "";
  if (/^https?:\/\//i.test(pad)) return pad;
  return `/api/storage/files?path=${encodeURIComponent(pad)}`;
}

function visualTypeLabel(waarde: string): string {
  return VISUAL_TYPES.find((t) => t.waarde === waarde)?.label ?? waarde;
}

function bronTypeLabel(waarde: string): string {
  return BRON_TYPES.find((t) => t.waarde === waarde)?.label ?? waarde;
}

function ScoreBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) {
    return (
      <Badge variant="outline" className="text-muted-foreground gap-1">
        <Circle className="h-3 w-3" />
        Geen data
      </Badge>
    );
  }
  if (pct >= 80) {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        {pct}%
      </Badge>
    );
  }
  if (pct >= 50) {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1">
        <AlertTriangle className="h-3 w-3" />
        {pct}%
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-800 border-red-200 gap-1">
      <AlertTriangle className="h-3 w-3" />
      {pct}%
    </Badge>
  );
}

// ─── Formulier lege staat ──────────────────────────────────────────────────────

interface FormulierData {
  naam: string;
  visual_type: string;
  bron_type: string;
  bron_referentie: string;
  spot_type: string[];
}

const LEEG_FORMULIER: FormulierData = {
  naam: "",
  visual_type: "",
  bron_type: "",
  bron_referentie: "",
  spot_type: [],
};

// ─── Component: Visuele preview-tegel ─────────────────────────────────────────

function VisualTegel({
  visual,
  onToggle,
  onVerwijder,
  onBewerk,
  isToggling,
  isVerwijdering,
  kanSchrijven,
}: {
  visual: BeheerVisual;
  onToggle: (v: BeheerVisual) => void;
  onVerwijder: (v: BeheerVisual) => void;
  onBewerk: (v: BeheerVisual) => void;
  isToggling: boolean;
  isVerwijdering: boolean;
  kanSchrijven: boolean;
}) {
  const previewUrl = visual.thumbnail_path
    ? storageUrl(visual.thumbnail_path)
    : visual.object_path
      ? storageUrl(visual.object_path)
      : null;

  return (
    <Card className="overflow-hidden">
      <div className="relative bg-muted h-40 flex items-center justify-center">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={visual.naam}
            className="h-full w-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <ImageOff className="h-10 w-10 text-muted-foreground" />
        )}
        <Badge
          className="absolute top-2 right-2"
          variant={visual.actief ? "default" : "secondary"}
        >
          {visual.actief ? "Actief" : "Inactief"}
        </Badge>
      </div>
      <CardContent className="p-3 space-y-2">
        <p className="font-medium text-sm leading-tight line-clamp-2">{visual.naam}</p>
        <div className="flex gap-1 flex-wrap">
          <Badge variant="outline" className="text-xs">
            {visualTypeLabel(visual.visual_type)}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {bronTypeLabel(visual.bron_type)}
          </Badge>
        </div>
        {visual.spot_type.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {visual.spot_type.slice(0, 3).map((s) => (
              <span key={s} className="text-xs text-muted-foreground">
                {s}
              </span>
            ))}
            {visual.spot_type.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{visual.spot_type.length - 3}
              </span>
            )}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant={visual.actief ? "outline" : "default"}
            className="flex-1 text-xs h-7"
            onClick={() => onToggle(visual)}
            disabled={isToggling || isVerwijdering}
          >
            {isToggling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : visual.actief ? (
              <>
                <EyeOff className="h-3 w-3 mr-1" />
                Deactiveren
              </>
            ) : (
              <>
                <Eye className="h-3 w-3 mr-1" />
                Activeren
              </>
            )}
          </Button>
          {kanSchrijven && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => onBewerk(visual)}
              disabled={isToggling || isVerwijdering}
              title="Bewerken"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={() => onVerwijder(visual)}
            disabled={isToggling || isVerwijdering}
          >
            {isVerwijdering ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function VisualRij({ visual }: { visual: FpsVisualItem }) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      <td className="py-3 px-4">
        <div className="font-medium text-sm">{visual.naam}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {VISUAL_TYPE_LABELS[visual.visual_type] ?? visual.visual_type}
        </div>
      </td>
      <td className="py-3 px-4 hidden sm:table-cell">
        <Badge variant="outline" className="text-xs">
          {visual.bron_type}
        </Badge>
      </td>
      <td className="py-3 px-4 hidden md:table-cell">
        <div className="flex flex-wrap gap-1">
          {visual.spot_type.length === 0 ? (
            <span className="text-xs text-muted-foreground">Alle types</span>
          ) : (
            visual.spot_type.slice(0, 3).map((st) => (
              <Badge key={st} variant="secondary" className="text-xs">
                {st}
              </Badge>
            ))
          )}
          {visual.spot_type.length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{visual.spot_type.length - 3}
            </Badge>
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        <Badge
          variant={visual.actief ? "default" : "outline"}
          className={visual.actief ? "bg-primary/10 text-primary border-primary/20" : "text-muted-foreground"}
        >
          {visual.actief ? "Actief" : "Inactief"}
        </Badge>
      </td>
      <td className="py-3 px-4 text-center">
        <span className={`text-sm font-medium ${visual.n_getoond === 0 ? "text-muted-foreground" : ""}`}>
          {visual.n_getoond}
        </span>
      </td>
      <td className="py-3 px-4 text-center">
        <ScoreBadge pct={visual.pct_zonder_herstelwerk} />
      </td>
      <td className="py-3 px-4 text-center hidden lg:table-cell">
        {visual.gem_stap_duur != null ? (
          <span className="text-sm">{Math.round(visual.gem_stap_duur)}s</span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

// ─── Hoofdcomponent ────────────────────────────────────────────────────────────

export default function VisualLibraryBeheer() {
  const { heeftNiveau } = useBevoegdheid();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialoogOpen, setDialoogOpen]         = useState(false);
  const [verwijderVisual, setVerwijderVisual] = useState<BeheerVisual | null>(null);
  const [form, setForm]                       = useState<FormulierData>(LEEG_FORMULIER);
  const [bestand, setBestand]                 = useState<File | null>(null);
  const [thumbnail, setThumbnail]             = useState<File | null>(null);
  const [togglingId, setTogglingId]           = useState<number | null>(null);
  const [verwijderingId, setVerwijderingId]   = useState<number | null>(null);
  const [bewerkVisual, setBewerkVisual]       = useState<BeheerVisual | null>(null);
  const [bewerkForm, setBewerkForm]           = useState<FormulierData>(LEEG_FORMULIER);

  const bestandRef   = useRef<HTMLInputElement>(null);
  const thumbnailRef = useRef<HTMLInputElement>(null);

  const { uploadFile: uploadBestand, isUploading: uploadt }      = useUpload({ bestand_type: "algemeen" });
  const { uploadFile: uploadThumb, isUploading: uploadtThumb }   = useUpload({ bestand_type: "algemeen" });

  const { data: beheerVisuals = [], isLoading: beheerLoading } = useListBeheerVisuals();
  
  const { data: statsVisuals, isLoading: statsLoading } = useListVisualLibrary({
    query: { queryKey: getListVisualLibraryQueryKey() },
  });

  // ── Filters: hoofdraster (beheer) ────────────────────────────────────────────
  const [zoekBeheer, setZoekBeheer]                         = useLocalStorage<string>("fps_vl_zoek_beheer", "");
  const [filterVisualTypeBeheer, setFilterVisualTypeBeheer] = useLocalStorage<string>("fps_vl_filter_visual_type_beheer", "alle");
  const [filterBronTypeBeheer, setFilterBronTypeBeheer]     = useLocalStorage<string>("fps_vl_filter_bron_type_beheer", "alle");
  const [filterSpotTypesBeheer, setFilterSpotTypesBeheer]   = useLocalStorage<string[]>("fps_vl_filter_spot_types_beheer", []);
  const [filterActiefBeheer, setFilterActiefBeheer]         = useLocalStorage<string>("fps_vl_filter_actief_beheer", "alle");

  function toggleSpotTypeBeheer(type: string) {
    setFilterSpotTypesBeheer((prev) =>
      prev.includes(type) ? prev.filter((s) => s !== type) : [...prev, type]
    );
  }

  const gefilterdVisuals: BeheerVisual[] = (beheerVisuals).filter((v: BeheerVisual) => {
    if (zoekBeheer && !v.naam.toLowerCase().includes(zoekBeheer.toLowerCase())) return false;
    if (filterVisualTypeBeheer !== "alle" && v.visual_type !== filterVisualTypeBeheer) return false;
    if (filterBronTypeBeheer !== "alle" && v.bron_type !== filterBronTypeBeheer) return false;
    if (filterSpotTypesBeheer.length > 0 && !filterSpotTypesBeheer.some((s) => v.spot_type.includes(s))) return false;
    if (filterActiefBeheer === "actief" && !v.actief) return false;
    if (filterActiefBeheer === "inactief" && v.actief) return false;
    return true;
  });

  const heeftBeheerFilter =
    zoekBeheer !== "" ||
    filterVisualTypeBeheer !== "alle" ||
    filterBronTypeBeheer !== "alle" ||
    filterSpotTypesBeheer.length > 0 ||
    filterActiefBeheer !== "alle";

  function resetBeheerFilters() {
    setZoekBeheer("");
    setFilterVisualTypeBeheer("alle");
    setFilterBronTypeBeheer("alle");
    setFilterSpotTypesBeheer([]);
    setFilterActiefBeheer("alle");
  }

  // ── Filters: statistiekentabel ────────────────────────────────────────────────
  const [zoek, setZoek]                       = useLocalStorage<string>("fps_vl_zoek_stats", "");
  const [filterType, setFilterType]           = useLocalStorage<string>("fps_vl_filter_type_stats", "alle");
  const [filterBronType, setFilterBronType]   = useLocalStorage<string>("fps_vl_filter_bron_type_stats", "alle");
  const [filterSpotTypes, setFilterSpotTypes] = useLocalStorage<string[]>("fps_vl_filter_spot_types_stats", []);
  const [filterActief, setFilterActief]       = useLocalStorage<string>("fps_vl_filter_actief_stats", "alle");
  const [sortering, setSortering]             = useLocalStorage<string>("fps_vl_sortering_stats", "naam");

  function toggleSpotTypeStats(type: string) {
    setFilterSpotTypes((prev) =>
      prev.includes(type) ? prev.filter((s) => s !== type) : [...prev, type]
    );
  }

  const gefilterdStats: FpsVisualItem[] = (statsVisuals ?? [])
    .filter((v: FpsVisualItem) => {
      if (zoek && !v.naam.toLowerCase().includes(zoek.toLowerCase()) && !v.visual_type.toLowerCase().includes(zoek.toLowerCase())) return false;
      if (filterType !== "alle" && v.visual_type !== filterType) return false;
      if (filterBronType !== "alle" && v.bron_type !== filterBronType) return false;
      if (filterSpotTypes.length > 0 && !filterSpotTypes.some((s) => v.spot_type.includes(s))) return false;
      if (filterActief === "actief" && !v.actief) return false;
      if (filterActief === "inactief" && v.actief) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortering === "naam") return a.naam.localeCompare(b.naam);
      if (sortering === "score_desc") {
        const sa = a.pct_zonder_herstelwerk ?? -1;
        const sb = b.pct_zonder_herstelwerk ?? -1;
        return sb - sa;
      }
      if (sortering === "score_asc") {
        const sa = a.pct_zonder_herstelwerk ?? 101;
        const sb = b.pct_zonder_herstelwerk ?? 101;
        return sa - sb;
      }
      if (sortering === "getoond_desc") return b.n_getoond - a.n_getoond;
      return 0;
    });

  const statsLijst: FpsVisualItem[] = statsVisuals ?? [];
  const totaalGetoond = statsLijst.reduce((s: number, v: FpsVisualItem) => s + v.n_getoond, 0);
  const metData = statsLijst.filter((v: FpsVisualItem) => v.n_getoond > 0);
  const gemScore =
    metData.length > 0
      ? Math.round(metData.reduce((s: number, v: FpsVisualItem) => s + (v.pct_zonder_herstelwerk ?? 0), 0) / metData.length)
      : null;

  const uniqueTypes: string[] = Array.from(new Set(statsLijst.map((v: FpsVisualItem) => v.visual_type))).sort();

  const vernieuw = () => {
    qc.invalidateQueries({ queryKey: getListBeheerVisualsQueryKey() });
    qc.invalidateQueries({ queryKey: getListVisualLibraryQueryKey() });
  };

  const aanmaken = useCreateBeheerVisual({
    mutation: {
      onSuccess: () => {
        vernieuw();
        setDialoogOpen(false);
        setForm(LEEG_FORMULIER);
        setBestand(null);
        setThumbnail(null);
        toast({ title: "Visual toegevoegd" });
      },
      onError: () => {
        toast({ title: "Aanmaken mislukt", variant: "destructive" });
      },
    },
  });

  const bijwerken = useUpdateBeheerVisual({
    mutation: {
      onSuccess: () => {
        vernieuw();
        setTogglingId(null);
      },
      onError: () => {
        setTogglingId(null);
        toast({ title: "Bijwerken mislukt", variant: "destructive" });
      },
    },
  });

  const bewerkOpslaan = useUpdateBeheerVisual({
    mutation: {
      onSuccess: () => {
        vernieuw();
        setBewerkVisual(null);
        toast({ title: "Visual bijgewerkt" });
      },
      onError: () => {
        toast({ title: "Opslaan mislukt", variant: "destructive" });
      },
    },
  });

  const verwijderen = useDeleteBeheerVisual({
    mutation: {
      onSuccess: () => {
        vernieuw();
        setVerwijderingId(null);
        setVerwijderVisual(null);
        toast({ title: "Visual verwijderd" });
      },
      onError: () => {
        setVerwijderingId(null);
        toast({ title: "Verwijderen mislukt", variant: "destructive" });
      },
    },
  });

  const kanSchrijven = heeftNiveau("systeem", 2);

  const visuals = beheerVisuals;
  const isLoading = beheerLoading;

  if (!heeftNiveau("systeem", 1)) {
    return (
      <div className="p-6 text-muted-foreground text-sm">
        Visual Library is onderdeel van het systeembeheer. Vraag een beheerder om toegang tot de systeemmodule.
      </div>
    );
  }

  function toggleSpotType(type: string) {
    setForm((prev) => ({
      ...prev,
      spot_type: prev.spot_type.includes(type)
        ? prev.spot_type.filter((s) => s !== type)
        : [...prev.spot_type, type],
    }));
  }

  async function handleOpslaan() {
    if (!form.naam || !form.visual_type || !form.bron_type || !bestand) {
      toast({
        title: "Vul alle verplichte velden in en selecteer een bestand",
        variant: "destructive",
      });
      return;
    }

    const bestandResult = await uploadBestand(bestand);
    if (!bestandResult) {
      toast({ title: "Uploadfout — probeer opnieuw", variant: "destructive" });
      return;
    }

    let thumbnailPath: string | undefined;
    if (thumbnail) {
      const tp = await uploadThumb(thumbnail);
      thumbnailPath = tp?.objectPath ?? undefined;
    }

    aanmaken.mutate({
      data: {
        naam:            form.naam,
        visual_type:     form.visual_type,
        bron_type:       form.bron_type,
        bron_referentie: form.bron_referentie || undefined,
        object_path:     bestandResult.objectPath,
        thumbnail_path:  thumbnailPath,
        spot_type:       form.spot_type.length > 0 ? form.spot_type : undefined,
        taal:            "nl",
      },
    });
  }

  function handleToggle(visual: BeheerVisual) {
    setTogglingId(visual.id);
    bijwerken.mutate({ id: visual.id, data: { actief: !visual.actief } });
  }

  function handleVerwijderBevestigd(visual: BeheerVisual) {
    setVerwijderingId(visual.id);
    setVerwijderVisual(null);
    verwijderen.mutate({ id: visual.id });
  }

  function handleBewerk(visual: BeheerVisual) {
    setBewerkForm({
      naam:            visual.naam,
      visual_type:     visual.visual_type,
      bron_type:       visual.bron_type,
      bron_referentie: visual.bron_referentie ?? "",
      spot_type:       visual.spot_type ?? [],
    });
    setBewerkVisual(visual);
  }

  function handleBewerkOpslaan() {
    if (!bewerkVisual) return;
    if (!bewerkForm.naam || !bewerkForm.visual_type || !bewerkForm.bron_type) {
      toast({ title: "Vul alle verplichte velden in", variant: "destructive" });
      return;
    }
    bewerkOpslaan.mutate({
      id: bewerkVisual.id,
      data: {
        naam:            bewerkForm.naam,
        visual_type:     bewerkForm.visual_type,
        bron_type:       bewerkForm.bron_type,
        bron_referentie: bewerkForm.bron_referentie || undefined,
        spot_type:       bewerkForm.spot_type,
      },
    });
  }

  function toggleBewerkSpotType(type: string) {
    setBewerkForm((prev) => ({
      ...prev,
      spot_type: prev.spot_type.includes(type)
        ? prev.spot_type.filter((s) => s !== type)
        : [...prev.spot_type, type],
    }));
  }

  const bezig = uploadt || uploadtThumb || aanmaken.isPending;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Visual Library</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Beheer goedgekeurde visuals voor de Visual Guidance Engine (VGE).
            Alleen actieve visuals worden aan monteurs getoond.
          </p>
        </div>
        {kanSchrijven && (
          <Button onClick={() => setDialoogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Visual toevoegen
          </Button>
        )}
      </div>

      {/* Inhoud */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-12">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laden...
        </div>
      ) : visuals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Image className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-base font-medium">Geen visuals</p>
          <p className="text-sm text-muted-foreground mt-1">
            Upload een visual om de VGE in te schakelen.
          </p>
          {kanSchrijven && (
            <Button className="mt-4" onClick={() => setDialoogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Eerste visual toevoegen
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Filterbalk boven het raster */}
          <div className="space-y-3 bg-muted/30 border rounded-lg p-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Zoek op naam..."
                  value={zoekBeheer}
                  onChange={(e) => setZoekBeheer(e.target.value)}
                  className="pl-9 bg-background"
                />
              </div>
              <Select value={filterVisualTypeBeheer} onValueChange={setFilterVisualTypeBeheer}>
                <SelectTrigger className="w-52 bg-background">
                  <SelectValue placeholder="Alle visualtypes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle visualtypes</SelectItem>
                  {VISUAL_TYPES.map((t) => (
                    <SelectItem key={t.waarde} value={t.waarde}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterBronTypeBeheer} onValueChange={setFilterBronTypeBeheer}>
                <SelectTrigger className="w-48 bg-background">
                  <SelectValue placeholder="Alle brontypes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle brontypes</SelectItem>
                  {BRON_TYPES.map((t) => (
                    <SelectItem key={t.waarde} value={t.waarde}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterActiefBeheer} onValueChange={setFilterActiefBeheer}>
                <SelectTrigger className="w-40 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle statussen</SelectItem>
                  <SelectItem value="actief">Alleen actief</SelectItem>
                  <SelectItem value="inactief">Alleen inactief</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Spot-type chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Spot-type:</span>
              {SPOT_TYPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSpotTypeBeheer(s)}
                  className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                    filterSpotTypesBeheer.includes(s)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Resultaatteller + wis-knop */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {gefilterdVisuals.length} van {visuals.length} visual{visuals.length !== 1 ? "s" : ""}
                {gefilterdVisuals.filter((v) => v.actief).length !== gefilterdVisuals.length && (
                  <> &mdash; {gefilterdVisuals.filter((v) => v.actief).length} actief</>
                )}
              </span>
              {heeftBeheerFilter && (
                <button
                  type="button"
                  onClick={resetBeheerFilters}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <X className="h-3 w-3" />
                  Filters wissen
                </button>
              )}
            </div>
          </div>

          {gefilterdVisuals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ScanSearch className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Geen visuals gevonden</p>
              <p className="text-xs text-muted-foreground mt-1">
                Pas de zoekterm of filters aan.
              </p>
              <button
                type="button"
                onClick={resetBeheerFilters}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Filters wissen
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {gefilterdVisuals.map((visual) => (
                <VisualTegel
                  key={visual.id}
                  visual={visual}
                  onToggle={handleToggle}
                  onVerwijder={(v) => setVerwijderVisual(v)}
                  onBewerk={handleBewerk}
                  isToggling={togglingId === visual.id}
                  isVerwijdering={verwijderingId === visual.id}
                  kanSchrijven={kanSchrijven}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Upload-dialoog */}
      <Dialog open={dialoogOpen} onOpenChange={setDialoogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Visual toevoegen</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Naam */}
            <div className="space-y-1.5">
              <Label>
                Naam <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.naam}
                onChange={(e) => setForm((p) => ({ ...p, naam: e.target.value }))}
                placeholder="Bijv. Branddeur detail afdichting"
                disabled={bezig}
              />
            </div>

            {/* Visual type */}
            <div className="space-y-1.5">
              <Label>
                Visualtype <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.visual_type}
                onValueChange={(v) => setForm((p) => ({ ...p, visual_type: v }))}
                disabled={bezig}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies visualtype" />
                </SelectTrigger>
                <SelectContent>
                  {VISUAL_TYPES.map((t) => (
                    <SelectItem key={t.waarde} value={t.waarde}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bron type */}
            <div className="space-y-1.5">
              <Label>
                Brontype <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.bron_type}
                onValueChange={(v) => setForm((p) => ({ ...p, bron_type: v }))}
                disabled={bezig}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies brontype" />
                </SelectTrigger>
                <SelectContent>
                  {BRON_TYPES.map((t) => (
                    <SelectItem key={t.waarde} value={t.waarde}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bron referentie */}
            <div className="space-y-1.5">
              <Label>Bronreferentie</Label>
              <Input
                value={form.bron_referentie}
                onChange={(e) =>
                  setForm((p) => ({ ...p, bron_referentie: e.target.value }))
                }
                placeholder="Bijv. ETA-2024-001 of tekening REV3"
                disabled={bezig}
              />
            </div>

            {/* Spot types */}
            <div className="space-y-1.5">
              <Label>Toepasselijke spot-types</Label>
              <div className="flex flex-wrap gap-2">
                {SPOT_TYPES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSpotType(s)}
                    disabled={bezig}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      form.spot_type.includes(s)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Bestandsupload */}
            <div className="space-y-1.5">
              <Label>
                Visual-bestand <span className="text-destructive">*</span>
              </Label>
              <div
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => bestandRef.current?.click()}
              >
                {bestand ? (
                  <div className="flex items-center justify-center gap-2">
                    <Upload className="h-4 w-4 text-primary" />
                    <span className="text-sm">{bestand.name}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBestand(null);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Klik om een afbeelding of PDF te kiezen
                    </p>
                  </>
                )}
              </div>
              <input
                ref={bestandRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setBestand(e.target.files?.[0] ?? null)}
              />
            </div>

            {/* Thumbnail (optioneel) */}
            <div className="space-y-1.5">
              <Label>Thumbnail (optioneel)</Label>
              <div
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => thumbnailRef.current?.click()}
              >
                {thumbnail ? (
                  <div className="flex items-center justify-center gap-2">
                    <Image className="h-4 w-4 text-primary" />
                    <span className="text-sm">{thumbnail.name}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setThumbnail(null);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Image className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Kies een thumbnail-afbeelding
                    </p>
                  </>
                )}
              </div>
              <input
                ref={thumbnailRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setThumbnail(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialoogOpen(false)}
              disabled={bezig}
            >
              Annuleren
            </Button>
            <Button onClick={handleOpslaan} disabled={bezig}>
              {bezig ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploaden...
                </>
              ) : (
                "Opslaan"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bewerk-dialoog */}
      {bewerkVisual && (
        <Dialog open={!!bewerkVisual} onOpenChange={(open) => { if (!open) setBewerkVisual(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Visual bewerken</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Naam */}
              <div className="space-y-1.5">
                <Label>
                  Naam <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={bewerkForm.naam}
                  onChange={(e) => setBewerkForm((p) => ({ ...p, naam: e.target.value }))}
                  placeholder="Bijv. Branddeur detail afdichting"
                  disabled={bewerkOpslaan.isPending}
                />
              </div>

              {/* Visual type */}
              <div className="space-y-1.5">
                <Label>
                  Visualtype <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={bewerkForm.visual_type}
                  onValueChange={(v) => setBewerkForm((p) => ({ ...p, visual_type: v }))}
                  disabled={bewerkOpslaan.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kies visualtype" />
                  </SelectTrigger>
                  <SelectContent>
                    {VISUAL_TYPES.map((t) => (
                      <SelectItem key={t.waarde} value={t.waarde}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Bron type */}
              <div className="space-y-1.5">
                <Label>
                  Brontype <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={bewerkForm.bron_type}
                  onValueChange={(v) => setBewerkForm((p) => ({ ...p, bron_type: v }))}
                  disabled={bewerkOpslaan.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kies brontype" />
                  </SelectTrigger>
                  <SelectContent>
                    {BRON_TYPES.map((t) => (
                      <SelectItem key={t.waarde} value={t.waarde}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Bron referentie */}
              <div className="space-y-1.5">
                <Label>Bronreferentie</Label>
                <Input
                  value={bewerkForm.bron_referentie}
                  onChange={(e) => setBewerkForm((p) => ({ ...p, bron_referentie: e.target.value }))}
                  placeholder="Bijv. ETA-2024-001 of tekening REV3"
                  disabled={bewerkOpslaan.isPending}
                />
              </div>

              {/* Spot types */}
              <div className="space-y-1.5">
                <Label>Toepasselijke spot-types</Label>
                <div className="flex flex-wrap gap-2">
                  {SPOT_TYPES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleBewerkSpotType(s)}
                      disabled={bewerkOpslaan.isPending}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        bewerkForm.spot_type.includes(s)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-muted"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Geen selectie = zichtbaar voor alle spot-types
                </p>
              </div>

              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                Het bestand zelf is niet vervangbaar via dit formulier.
              </p>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setBewerkVisual(null)}
                disabled={bewerkOpslaan.isPending}
              >
                Annuleren
              </Button>
              <Button onClick={handleBewerkOpslaan} disabled={bewerkOpslaan.isPending}>
                {bewerkOpslaan.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Opslaan...
                  </>
                ) : (
                  "Opslaan"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Verwijder-bevestiging */}
      <AlertDialog
        open={!!verwijderVisual}
        onOpenChange={(open) => {
          if (!open) setVerwijderVisual(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Visual verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {verwijderVisual?.naam} wordt permanent verwijderd. Deze actie
              kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                verwijderVisual && handleVerwijderBevestigd(verwijderVisual)
              }
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="pt-8 border-t">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-primary/10 text-primary p-2 rounded-lg">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Effectiviteit Statistieken</h2>
            <p className="text-sm text-muted-foreground">
              Prestaties van visuals in de praktijk (VGE)
            </p>
          </div>
        </div>

        {statsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !statsVisuals || statsVisuals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nog geen statistieken beschikbaar
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Totaal visuals</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{statsVisuals.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {statsLijst.filter((v: FpsVisualItem) => v.actief).length} actief
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Keer getoond</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totaalGetoond}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {metData.length} visuals met data
                  </div>
                </CardContent>
              </Card>
              <Card className="col-span-2 sm:col-span-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Gem. score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {gemScore != null ? (
                    <>
                      <div className="text-2xl font-bold">{gemScore}%</div>
                      <div className="text-xs text-muted-foreground mt-1">zonder herstelwerk</div>
                    </>
                  ) : (
                    <div className="text-2xl font-bold text-muted-foreground">—</div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="pt-5 pb-3">
                <div className="space-y-3 mb-4">
                  <div className="flex flex-wrap gap-3">
                    <div className="relative flex-1 min-w-48">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Zoek op naam of type..."
                        value={zoek}
                        onChange={(e) => setZoek(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="w-52">
                        <SelectValue placeholder="Alle visualtypes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alle">Alle visualtypes</SelectItem>
                        {uniqueTypes.map((t) => (
                          <SelectItem key={t} value={t}>
                            {VISUAL_TYPE_LABELS[t] ?? t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filterBronType} onValueChange={setFilterBronType}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Alle brontypes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alle">Alle brontypes</SelectItem>
                        {BRON_TYPES.map((t) => (
                          <SelectItem key={t.waarde} value={t.waarde}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filterActief} onValueChange={setFilterActief}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alle">Alle statussen</SelectItem>
                        <SelectItem value="actief">Alleen actief</SelectItem>
                        <SelectItem value="inactief">Alleen inactief</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={sortering} onValueChange={setSortering}>
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="naam">Sorteren: naam</SelectItem>
                        <SelectItem value="score_desc">Score: hoog naar laag</SelectItem>
                        <SelectItem value="score_asc">Score: laag naar hoog</SelectItem>
                        <SelectItem value="getoond_desc">Meest getoond</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Spot-type chips voor statistieken */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Spot-type:</span>
                    {SPOT_TYPES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSpotTypeStats(s)}
                        className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                          filterSpotTypes.includes(s)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                    {filterSpotTypes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilterSpotTypes([])}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                      >
                        <X className="h-3 w-3" />
                        Wissen
                      </button>
                    )}
                  </div>
                </div>

                {gefilterdStats.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Geen visuals gevonden
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b">
                          <th className="py-2 px-4 text-left font-medium">Visual</th>
                          <th className="py-2 px-4 text-left font-medium hidden sm:table-cell">Bron</th>
                          <th className="py-2 px-4 text-left font-medium hidden md:table-cell">Spot-types</th>
                          <th className="py-2 px-4 text-left font-medium">Status</th>
                          <th className="py-2 px-4 text-center font-medium">Getoond</th>
                          <th className="py-2 px-4 text-center font-medium">Zonder herstelwerk</th>
                          <th className="py-2 px-4 text-center font-medium hidden lg:table-cell">Gem. stap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gefilterdStats.map((v) => (
                          <VisualRij key={v.id} visual={v} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-3 text-xs text-muted-foreground text-right">
                  {gefilterdStats.length} van {statsVisuals.length} visuals
                </div>
              </CardContent>
            </Card>

            <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
              <strong>Toelichting scores:</strong> "Zonder herstelwerk" toont het percentage stappen waarbij de visual
              getoond was en géén herstelwerk nodig bleek. Groen = 80%+, oranje = 50–79%, rood = onder 50%.
              Data wordt bijgehouden bij elke stap-voltooiing waarbij VGE-begeleiding actief was.
            </div>
          </>
        )}
      </div>

    </div>
  );
}

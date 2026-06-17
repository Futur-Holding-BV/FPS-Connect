import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { useParams, Link } from "wouter";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  useGetVerdieping,
  useUpdateVerdieping,
  getGetVerdiepingQueryKey,
  useGetGebouw,
  useListVoorzieningenOpVerdieping,
  useListVerdiepingen,
  useCreateVoorziening,
  useGetVolgendSpotnummer,
  useListToewijsbareGebruikers,
  useGetVoorziening,
  useUpdateVoorziening,
  useUpdateVoorzieningStatus,
  useArchiveerVoorziening,
  useListVoorzieningen,
  useAddFoto,
  useDeleteFoto,
  useListScheidingen,
  useCreateScheiding,
  useDeleteScheiding,
  useListLabels,
  useListDocumenten,
  useListClusters,
  useCreateCluster,
  useUpdateCluster,
  useDeleteCluster,
  useAssignClusterMonteur,
  useAiSpotvoorstel,
  useBewaarSpotAiVoorstel,
} from "@workspace/api-client-react";
import type { SpotAiVoorstelResultaat } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, X, ZoomIn, ZoomOut, RotateCcw, Map, FileText, Trash2, Image as ImageIcon, Loader2, Spline, Check, Move, Archive, ArchiveRestore, Boxes, Pencil, Layers, UserCheck, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { ApplicatiePicker } from "@/components/applicatie-picker";
import { ToepassingMultiSelect } from "@/components/toepassing-multi-select";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useRol } from "@/context/rol-context";

const BEHEERDER_ROLLEN = ["beheerder", "hoofdbeheerder"];
// Rollen die de plattegrond mogen bewerken (spots plaatsen/verplaatsen, status,
// foto's, scheidingen). Klant en controleur mogen uitsluitend inzien —
// controleur is alleen actief bij onderhoudscontracten, niet in de projectfase.
const BEWERKER_ROLLEN = ["monteur", "beheerder", "hoofdbeheerder"];

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ---- Kleuren en labels per type ----
const TYPEN: Record<string, { kleur: string; label: string; ring: string }> = {
  branddeur:       { kleur: "#ef4444", ring: "#b91c1c", label: "Branddeur" },
  doorvoering:     { kleur: "#f97316", ring: "#c2410c", label: "Doorvoering" },
  brandklep:       { kleur: "#eab308", ring: "#a16207", label: "Brandklep" },
  kitvoeg:         { kleur: "#84cc16", ring: "#4d7c0f", label: "Kitvoeg" },
  manchet:         { kleur: "#10b981", ring: "#065f46", label: "Manchet" },
  brandwerend_glas:{ kleur: "#3b82f6", ring: "#1d4ed8", label: "Brandwerend Glas" },
  coating:         { kleur: "#8b5cf6", ring: "#5b21b6", label: "Coating" },
  luik:            { kleur: "#ec4899", ring: "#9d174d", label: "Luik" },
  plaatconstructie:{ kleur: "#78716c", ring: "#44403c", label: "Plaatconstructie" },
  schuifdeur:      { kleur: "#dc2626", ring: "#991b1b", label: "Schuifdeur" },
  puiconstructie:  { kleur: "#6366f1", ring: "#3730a3", label: "Puiconstructie" },
  dakdoorvoer:     { kleur: "#14b8a6", ring: "#0f766e", label: "Dakdoorvoer" },
};

const SCHEIDING_TYPEN: Record<string, { kleur: string; label: string }> = {
  brand: { kleur: "#dc2626", label: "Brandscheiding" },
  rook:  { kleur: "#2563eb", label: "Rookscheiding" },
};

// ---- Logische clusters (schacht, strook, …) ----
const CLUSTER_TYPEN: Record<string, string> = {
  schacht: "Schacht",
  strook: "Strook",
  zone: "Zone",
  overig: "Overig",
};

// Standaard palet voor nieuwe clusters; gebruiker kan een eigen kleur opslaan.
const CLUSTER_KLEUREN = ["#6366f1", "#0ea5e9", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6"];

const STANDAARD_CLUSTERKLEUR = "#6366f1";

// Schermafstand (px) waarbinnen twee spots visueel samengevoegd worden tot één
// telbubbel. Wordt gedeeld door view.zoom om naar tekening-coördinaten te gaan.
const VISUEEL_CLUSTER_PX = 42;

const STATUSKLEUREN: Record<string, string> = {
  concept:       "#94a3b8",
  voorbereid:    "#cbd5e1",
  in_uitvoering: "#3b82f6",
  wacht_op_akkoord:    "#f59e0b",
  meerwerk_financieel: "#8b5cf6",
  opgeleverd:    "#14b8a6",
  goedgekeurd:   "#22c55e",
  afgekeurd:     "#ef4444",
  in_onderhoud:  "#f97316",
  vervallen:     "#6b7280",
};

const STATUSLABEL: Record<string, string> = {
  concept:       "Concept",
  voorbereid:    "Voorbereid",
  in_uitvoering: "In uitvoering",
  wacht_op_akkoord:    "Niet gereed - wachten op akkoord",
  meerwerk_financieel: "Meerwerk - financieel afronden",
  opgeleverd:    "Opgeleverd",
  goedgekeurd:   "Gereed",
  afgekeurd:     "Afgekeurd",
  in_onderhoud:  "In onderhoud",
  vervallen:     "Vervallen",
};

const WBDBO_OPTIES = ["20", "30", "60", "90", "120"];
const SCHEIDING_CLASSIFICATIES = ["WRD", "EW", "EI", "E", "R", "Sa"];
const WAND_PLAFOND_OPTIES = ["wand", "plafond"];

const RUIMTE_STANDAARD = [
  "entree", "keuken", "badkamer", "toilet", "slaapkamer", "woonkamer",
  "trappenhuis", "gang", "meterkast", "zolder", "berging", "kelder",
  "parkeergarage", "buitenruimte",
];

const GEEN_RUIMTE_VAL = "__geen__";
const GEEN_WAND_PLAFOND_VAL = "__geen__";

function getRuimteVolgorde(): string[] {
  try {
    const raw = localStorage.getItem("fps_ruimte_gebruik");
    if (!raw) return RUIMTE_STANDAARD;
    const counts: Record<string, number> = JSON.parse(raw);
    return [...RUIMTE_STANDAARD].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  } catch { return RUIMTE_STANDAARD; }
}

function registreerRuimteGebruik(ruimte: string) {
  if (!RUIMTE_STANDAARD.includes(ruimte)) return;
  try {
    const raw = localStorage.getItem("fps_ruimte_gebruik");
    const counts: Record<string, number> = raw ? JSON.parse(raw) : {};
    counts[ruimte] = (counts[ruimte] ?? 0) + 1;
    localStorage.setItem("fps_ruimte_gebruik", JSON.stringify(counts));
  } catch { /* ignore */ }
}

const CANVAS_W = 1200;
const CANVAS_H = 800;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;

type Punt = { x: number; y: number };

function puntOpAfstand(punten: Punt[], segLengtes: number[], d: number): Punt {
  if (d <= 0) return { ...punten[0]! };
  let rest = d;
  for (let i = 0; i < segLengtes.length; i++) {
    const len = segLengtes[i]!;
    if (rest <= len || i === segLengtes.length - 1) {
      const t = len === 0 ? 0 : Math.min(1, rest / len);
      const a = punten[i]!;
      const b = punten[i + 1]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    rest -= len;
  }
  return { ...punten[punten.length - 1]! };
}

function markerPosities(punten: Punt[], stap: number): Punt[] {
  if (punten.length < 2) return punten.slice();
  const segLengtes: number[] = [];
  let totaal = 0;
  for (let i = 1; i < punten.length; i++) {
    const len = Math.hypot(punten[i]!.x - punten[i - 1]!.x, punten[i]!.y - punten[i - 1]!.y);
    segLengtes.push(len);
    totaal += len;
  }
  if (totaal === 0) return [{ ...punten[0]! }];
  const tussen = Math.min(8, Math.max(1, Math.round(totaal / stap)));
  const afstanden = [0];
  for (let i = 1; i <= tussen; i++) afstanden.push((totaal * i) / (tussen + 1));
  afstanden.push(totaal);
  return afstanden.map((d) => puntOpAfstand(punten, segLengtes, d));
}

type SVGVoorziening = {
  id: number;
  objectnummer: string;
  type: string;
  status: string;
  classificatie?: string;
  ruimte?: string;
  wand_of_plafond?: string;
  ai_te_controleren?: boolean;
  cluster_id?: number | null;
  locatie_x: number;
  locatie_y: number;
};

type ViewState = { x: number; y: number; zoom: number };

// Greedy visuele clustering: spots die binnen drempelImg (tekening-coördinaten)
// van elkaar liggen worden tot één groep samengevoegd. Eén pass per ankerspot.
function maakVisueleGroepen(spots: SVGVoorziening[], drempelImg: number): SVGVoorziening[][] {
  const groepen: SVGVoorziening[][] = [];
  const gebruikt = new Set<number>();
  for (const s of spots) {
    if (gebruikt.has(s.id)) continue;
    const groep = [s];
    gebruikt.add(s.id);
    for (const o of spots) {
      if (gebruikt.has(o.id)) continue;
      if (Math.hypot(o.locatie_x - s.locatie_x, o.locatie_y - s.locatie_y) < drempelImg) {
        groep.push(o);
        gebruikt.add(o.id);
      }
    }
    groepen.push(groep);
  }
  return groepen;
}

function groepCentroid(groep: SVGVoorziening[]): { x: number; y: number } {
  const x = groep.reduce((s, g) => s + g.locatie_x, 0) / groep.length;
  const y = groep.reduce((s, g) => s + g.locatie_y, 0) / groep.length;
  return { x, y };
}

// Telbubbel voor een visuele groep (>1 spot). Klik zoomt in zodat de groep splitst.
function ClusterBubble({
  groep,
  zoom,
  onClick,
}: {
  groep: SVGVoorziening[];
  zoom: number;
  onClick: () => void;
}) {
  const c = groepCentroid(groep);
  const r = 22;
  const heeftControle = groep.some((g) => g.ai_te_controleren);
  return (
    <g
      transform={`translate(${c.x}, ${c.y})`}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ cursor: "zoom-in" }}
    >
      <circle r={r + 6} fill="#1e293b" opacity={0.18} />
      {heeftControle && (
        <circle r={r + 9} fill="none" stroke="#dc2626" strokeWidth={2.5 / zoom} strokeDasharray="4 2" />
      )}
      <circle r={r} fill="#1e293b" stroke="#fff" strokeWidth={2.5} />
      <text textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight="800" fill="#fff"
        style={{ pointerEvents: "none", userSelect: "none" }}>
        {groep.length}
      </text>
    </g>
  );
}

// Omhullende (bounding box) achter de spots van een logisch cluster + naamlabel.
// Onder het naamlabel staat een statusregel met de toegewezen monteur en het
// aantal nog "voorbereide" spots, zodat de planning dit direct op de plattegrond ziet.
function ClusterOmhulling({
  spots,
  naam,
  kleur,
  monteurNaam,
  voorbereidAantal,
  zoom,
}: {
  spots: SVGVoorziening[];
  naam: string;
  kleur: string;
  monteurNaam: string | null;
  voorbereidAantal: number;
  zoom: number;
}) {
  if (spots.length === 0) return null;
  const pad = 30;
  const xs = spots.map((s) => s.locatie_x);
  const ys = spots.map((s) => s.locatie_y);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  const w = maxX - minX;
  const h = maxY - minY;
  const labelH = 22 / zoom;
  const fontSize = 13 / zoom;
  const padX = 8 / zoom;
  const labelW = Math.max(naam.length * fontSize * 0.62 + padX * 2, 40 / zoom);
  // Statusregel: "monteurnaam" of "Niet toegewezen", plus "n voorbereid".
  const monteurTekst = monteurNaam ?? "Niet toegewezen";
  const statusTekst =
    voorbereidAantal > 0 ? `${monteurTekst} · ${voorbereidAantal} voorbereid` : monteurTekst;
  const statusH = 18 / zoom;
  const statusFont = 11 / zoom;
  const statusW = Math.max(statusTekst.length * statusFont * 0.58 + padX * 2, 40 / zoom);
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={minX} y={minY} width={w} height={h} rx={16}
        fill={kleur} fillOpacity={0.07}
        stroke={kleur} strokeWidth={2 / zoom} strokeDasharray={`${8 / zoom} ${5 / zoom}`} />
      <g transform={`translate(${minX}, ${minY - labelH - statusH - 5 / zoom})`}>
        <rect x={0} y={0} width={labelW} height={labelH} rx={labelH / 2} fill={kleur} />
        <text x={padX} y={labelH / 2} dominantBaseline="central" fontSize={fontSize}
          fontWeight="700" fill="#fff">{naam}</text>
        <g transform={`translate(0, ${labelH + 2 / zoom})`}>
          <rect x={0} y={0} width={statusW} height={statusH} rx={statusH / 2}
            fill="#fff" stroke={kleur} strokeWidth={1 / zoom} />
          <text x={padX} y={statusH / 2} dominantBaseline="central" fontSize={statusFont}
            fontWeight="600" fill={monteurNaam ? "#1e293b" : "#64748b"}>{statusTekst}</text>
        </g>
      </g>
    </g>
  );
}

function VoorzieningIcoon({
  v,
  geselecteerd,
  onClick,
}: {
  v: SVGVoorziening;
  geselecteerd: boolean;
  onClick: () => void;
}) {
  const stijl = TYPEN[v.type] ?? { kleur: "#94a3b8", ring: "#475569", label: v.type };
  const r = 16;
  const isVoorbereid = v.status === "voorbereid";
  const volgnummer = spotVolgnummer(v.objectnummer);
  const isPlafond = v.wand_of_plafond === "plafond";
  return (
    <g
      transform={`translate(${v.locatie_x}, ${v.locatie_y})`}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ cursor: "pointer" }}
    >
      <circle r={r + 5} fill={stijl.kleur} opacity={0.25} />
      {v.ai_te_controleren && (
        <circle r={r + 8} fill="none" stroke="#dc2626" strokeWidth={2.5} strokeDasharray="4 2" />
      )}
      <circle
        r={r}
        fill={STATUSKLEUREN[v.status] ?? "#94a3b8"}
        stroke={geselecteerd ? "#fff" : isVoorbereid ? "#475569" : stijl.ring}
        strokeWidth={geselecteerd ? 3 : isVoorbereid ? 2 : 1.5}
        strokeDasharray={isVoorbereid && !geselecteerd ? "4 3" : undefined}
      />
      {isPlafond && (
        <g style={{ pointerEvents: "none" }}>
          <path d="M 7,4 A 9,9 0 1,1 7,-4" fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" />
          <path d="M 7,4 A 9,9 0 1,1 7,-4" fill="none" stroke="#1e293b" strokeWidth={2} strokeLinecap="round" />
          <polygon points="7,-4 4,-5 8,-7" fill="#1e293b" stroke="#fff" strokeWidth={0.8} strokeLinejoin="round" />
        </g>
      )}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={volgnummer.length > 2 ? 8 : 10}
        fontWeight="700"
        fill={isVoorbereid ? "#1e293b" : "#fff"}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {volgnummer}
      </text>
      <text
        y={r + 13}
        textAnchor="middle"
        fontSize={9}
        fill="#1e293b"
        fontWeight="500"
        style={{ pointerEvents: "none", userSelect: "none", paintOrder: "stroke" }}
        stroke="#fff"
        strokeWidth={2.5}
      >
        {v.objectnummer}
      </text>
    </g>
  );
}

function GridAchtergrond({ w, h }: { w: number; h: number }) {
  const stapKlein = 40;
  const stapGroot = 200;
  return (
    <g>
      <defs>
        <pattern id="grid-klein" width={stapKlein} height={stapKlein} patternUnits="userSpaceOnUse">
          <path d={`M ${stapKlein} 0 L 0 0 0 ${stapKlein}`} fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
        </pattern>
        <pattern id="grid-groot" width={stapGroot} height={stapGroot} patternUnits="userSpaceOnUse">
          <rect width={stapGroot} height={stapGroot} fill="url(#grid-klein)" />
          <path d={`M ${stapGroot} 0 L 0 0 0 ${stapGroot}`} fill="none" stroke="#cbd5e1" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={w} height={h} fill="url(#grid-groot)" />
      <rect x={20} y={20} width={w - 40} height={h - 40}
        fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6 3" rx="4" />
    </g>
  );
}

// Herbruikbare foto-upload knop (presigned URL flow)
function FotoUploader({
  label,
  onUploaded,
}: {
  label: string;
  onUploaded: (objectPath: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (res) => onUploaded(res.objectPath),
  });

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await uploadFile(file);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ImageIcon className="h-4 w-4 mr-1" />}
        {label}
      </Button>
    </>
  );
}

// AI-voorstel markering (geel/amber) tot de gebruiker het veld bevestigt of aanpast.
function AiBadge() {
  return (
    <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-700">
      <Sparkles className="h-3 w-3" /> AI-voorstel
    </Badge>
  );
}

function spotVolgnummer(objectnummer: string): string {
  const m = objectnummer?.match(/(\d+)$/);
  return m ? m[1] : (objectnummer ?? "");
}

const LEEG_FORM = {
  objectnummer: "",
  type: "",
  wand_of_plafond: "",
  ruimte: "",
  huisnummer: "",
  opmerkingen: "",
  installatie_datum: "",
  status: "in_uitvoering",
  monteur_id: "",
};

export default function Plattegrond() {
  const { id, verdiepingId } = useParams<{ id: string; verdiepingId: string }>();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<ViewState>({ x: 0, y: 0, zoom: 1 });
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState({ mx: 0, my: 0, vx: 0, vy: 0 });
  const [geselecteerdId, setGeselecteerdId] = useState<number | null>(null);
  const [plaatsenModus, setPlaatsenModus] = useState(false);
  const [nieuwDialoog, setNieuwDialoog] = useState(false);
  const [nieuwLocatie, setNieuwLocatie] = useState({ x: 400, y: 300 });
  const [nieuwForm, setNieuwForm] = useState({ ...LEEG_FORM });
  const [nieuwLabelIds, setNieuwLabelIds] = useState<number[]>([]);
  const [voorFotos, setVoorFotos] = useState<string[]>([]);
  const [naFotos, setNaFotos] = useState<string[]>([]);
  const [aiVoorstel, setAiVoorstel] = useState<SpotAiVoorstelResultaat | null>(null);
  const [aiVelden, setAiVelden] = useState<Set<string>>(new Set());
  const [aiFout, setAiFout] = useState<string | null>(null);
  const [ruimteOpties] = useState(() => getRuimteVolgorde());

  // ---- Serie plaatsen: meerdere voorbereide spots achter elkaar met hetzelfde
  // sjabloon (applicatie/toepassing/ruimte/wand-plafond/status/monteur/cluster).
  const [serieDialoog, setSerieDialoog] = useState(false);
  const [serieModus, setSerieModus] = useState(false);
  const [serieForm, setSerieForm] = useState({
    type: "",
    wand_of_plafond: "",
    ruimte: "",
    status: "voorbereid",
    monteur_id: "",
    cluster_id: "",
  });
  const [serieLabelIds, setSerieLabelIds] = useState<number[]>([]);
  const [serieTeller, setSerieTeller] = useState(0);
  // Plaatsmethode binnen de serie: "klik" = één spot per klik, "lijn" = een
  // lijn trekken (twee klikken) waarna N spots gelijkmatig verdeeld worden,
  // "rechthoek" = een strook/rechthoek trekken (twee klikken) waarna een
  // raster van rijen x kolommen spots gelijkmatig verdeeld wordt geplaatst.
  const [serieMethode, setSerieMethode] = useState<"klik" | "lijn" | "rechthoek">("klik");
  const [serieAantal, setSerieAantal] = useState(5);
  const [serieRijen, setSerieRijen] = useState(3);
  const [serieKolommen, setSerieKolommen] = useState(3);
  // Begin-punt van de getrokken lijn/rechthoek (eerste klik); null = nog geen begin.
  const [serieLijnStart, setSerieLijnStart] = useState<{ x: number; y: number } | null>(null);
  // Huidige muispositie in SVG-coördinaten voor de live preview.
  const [serieMuis, setSerieMuis] = useState<{ x: number; y: number } | null>(null);
  const serieFormRef = useRef(serieForm);
  const serieLabelIdsRef = useRef(serieLabelIds);
  useEffect(() => { serieFormRef.current = serieForm; }, [serieForm]);
  useEffect(() => { serieLabelIdsRef.current = serieLabelIds; }, [serieLabelIds]);

  const [pdfBeeld, setPdfBeeld] = useState<string | null>(null);
  const [pdfDims, setPdfDims] = useState<{ w: number; h: number } | null>(null);
  const [pdfLaden, setPdfLaden] = useState(false);

  const [tekenModus, setTekenModus] = useState(false);
  const [huidigePunten, setHuidigePunten] = useState<{ x: number; y: number }[]>([]);
  const [scheidingDialoog, setScheidingDialoog] = useState(false);
  const [scheidingForm, setScheidingForm] = useState({ type: "brand", classificatie: "EW", waarde: "60" });
  const [scheidingSelectie, setScheidingSelectie] = useState<number | null>(null);
  const [verplaatsModus, setVerplaatsModus] = useState(false);

  // Logo op de plattegrond — beheerder kan het verslepen en schalen (desktop).
  const [logoBox, setLogoBox] = useState<{ x: number; y: number; b: number } | null>(null);
  const logoBoxRef = useRef<{ x: number; y: number; b: number } | null>(null);
  const [logoSleep, setLogoSleep] = useState<
    | null
    | { modus: "verplaats"; offsetX: number; offsetY: number }
    | { modus: "schaal"; ankerX: number; ankerY: number }
  >(null);
  useEffect(() => { logoBoxRef.current = logoBox; }, [logoBox]);

  const { gebruiker } = useAuth();
  // Bewerkrechten volgen de EFFECTIEVE rol zodat "bekijken als" een teamlid exact
  // toont wat dat teamlid mag. Backend dwingt schrijven op de echte rol af.
  const { rol: effectieveRol } = useRol();
  const isBeheerder = BEHEERDER_ROLLEN.includes(effectieveRol as string);
  const magBewerken = BEWERKER_ROLLEN.includes(effectieveRol as string);

  const queryClient = useQueryClient();
  const { data: verdieping } = useGetVerdieping(Number(verdiepingId));
  const { data: gebouw } = useGetGebouw(Number(id));
  const { data: alleVerdiepingen } = useListVerdiepingen(Number(id));
  const { data: voorzieningen, refetch } = useListVoorzieningenOpVerdieping(Number(verdiepingId));
  const { data: gebruikers } = useListToewijsbareGebruikers();
  const maakVoorziening = useCreateVoorziening();
  const updateVoorziening = useUpdateVoorziening();
  const updateVerdieping = useUpdateVerdieping();
  const { data: volgendSpot, refetch: refetchSpotnummer } = useGetVolgendSpotnummer(Number(id));
  const addFoto = useAddFoto();
  const aiSpotvoorstel = useAiSpotvoorstel();
  const bewaarAiVoorstel = useBewaarSpotAiVoorstel();

  const { data: scheidingen, refetch: refetchScheidingen } = useListScheidingen(Number(verdiepingId));
  const maakScheiding = useCreateScheiding();
  const verwijderScheiding = useDeleteScheiding();

  // Logische clusters van dit gebouw (over alle verdiepingen; filtering op weergave
  // gebeurt impliciet doordat alleen spots van deze verdieping worden getekend).
  const { data: clusters, refetch: refetchClusters } = useListClusters(Number(id));
  const [clusterBeheerOpen, setClusterBeheerOpen] = useState(false);
  // De toegewezen monteur (monteur_id/monteur_naam) en het voorbereid-aantal komen
  // server-side mee in de cluster-respons (afgeleid over alle verdiepingen). De
  // GET /gebouwen/:id/clusters-route gebruikt effectieveContext, dus dit werkt
  // consistent met de "Bekijken als"-impersonatie.
  // Visuele clustering (telbubbels bij overlappende spots) — standaard aan.
  const [visueelClusterAan, setVisueelClusterAan] = useState(true);

  // "Monteur uitvoering" = wie de spot daadwerkelijk uitvoert. De oude rol
  // "monteur" bestaat niet meer (rollen zijn hoofdbeheerder/gebruiker/klant);
  // toon daarom alle toewijsbare interne personen behalve de hoofdbeheerder.
  // Klanten zijn al uitgesloten door het /toewijsbare-gebruikers-endpoint.
  const monteurs = (gebruikers ?? []).filter(
    (g: any) => g.rol !== "hoofdbeheerder",
  );

  const { data: nieuwLabelData = [] } = useListLabels(
    nieuwForm.type ? { type_code: nieuwForm.type } : {},
  );

  const nieuwFabrikanten = useMemo(() => {
    if (!nieuwLabelIds.length) return [];
    const geselecteerd = (nieuwLabelData as any[]).filter(
      (l) => nieuwLabelIds.includes(l.id) && l.fabrikant,
    );
    return [...new Set(geselecteerd.map((l) => l.fabrikant as string))];
  }, [nieuwLabelData, nieuwLabelIds]);

  // Voorselectie wand/plafond uit de gekoppelde toepassing(en): wordt de keuze
  // afgeleid uit het 'getest voor'-veld van de actuele documenten die aan de
  // geselecteerde toepassingen hangen. Zodra de monteur zelf kiest, blijft die
  // keuze staan (handmatige keuze wint).
  const { data: alleDocumenten = [] } = useListDocumenten();
  const wandPlafondHandmatigRef = useRef(false);
  // Sessie-token voor AI-spotherkenning: stijgt bij dialoog open/sluiten en bij elke
  // fotowijziging, zodat een laat binnenkomend AI-resultaat van een vorige sessie
  // wordt genegeerd (geen stale voorstel in een nieuwe spot).
  const aiSessieRef = useRef(0);

  const afgeleidWandPlafond = useMemo(() => {
    if (!nieuwLabelIds.length) return "";
    const vlakken = new Set<string>();
    for (const d of alleDocumenten as any[]) {
      if (d.gearchiveerd || d.status !== "actueel") continue;
      if (d.getest_voor !== "wand" && d.getest_voor !== "plafond") continue;
      const toep = (d.toepassing_ids ?? []) as number[];
      if (!toep.some((tid) => nieuwLabelIds.includes(tid))) continue;
      vlakken.add(d.getest_voor);
    }
    return vlakken.size === 1 ? [...vlakken][0] : "";
  }, [alleDocumenten, nieuwLabelIds]);

  useEffect(() => {
    if (wandPlafondHandmatigRef.current) return;
    setNieuwForm((f) =>
      f.wand_of_plafond === afgeleidWandPlafond
        ? f
        : { ...f, wand_of_plafond: afgeleidWandPlafond },
    );
  }, [afgeleidWandPlafond]);

  const W = pdfDims?.w ?? CANVAS_W;
  const H = pdfDims?.h ?? CANVAS_H;

  // ---- Logo-positie initialiseren uit verdieping (standaard rechtsboven op de tekening) ----
  useEffect(() => {
    if (!verdieping) return;
    if (logoSleep) return; // niet overschrijven tijdens slepen/schalen
    const v = verdieping as any;
    const pad = Math.max(W, H) * 0.02;
    const minB = Math.max(W, H) * 0.05;
    let b = v.logo_breedte ?? Math.max(W, H) * 0.16;
    b = Math.max(minB, Math.min(b, W - pad * 2));
    const h = b / 2.59;
    let x = v.logo_x ?? W - b - pad;
    let y = v.logo_y ?? pad;
    x = Math.max(0, Math.min(x, W - b));
    y = Math.max(0, Math.min(y, H - h));
    setLogoBox({ x, y, b });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdieping, W, H]);

  // ---- Logo verslepen/schalen (beheerder, desktop) ----
  useEffect(() => {
    if (!logoSleep) return;
    const clientNaarBeeld = (cx: number, cy: number) => {
      const rect = svgRef.current!.getBoundingClientRect();
      return {
        x: (cx - rect.left - view.x) / view.zoom,
        y: (cy - rect.top - view.y) / view.zoom,
      };
    };
    const minB = Math.max(W, H) * 0.05;
    const maxB = Math.max(W, H) * 0.6;
    const onMove = (e: MouseEvent) => {
      const p = clientNaarBeeld(e.clientX, e.clientY);
      setLogoBox((prev) => {
        if (!prev) return prev;
        if (logoSleep.modus === "verplaats") {
          let nx = p.x - logoSleep.offsetX;
          let ny = p.y - logoSleep.offsetY;
          const h = prev.b / 2.59;
          nx = Math.max(0, Math.min(nx, W - prev.b));
          ny = Math.max(0, Math.min(ny, H - h));
          return { ...prev, x: nx, y: ny };
        }
        const maxByRight = W - logoSleep.ankerX;
        const maxByBottom = (H - logoSleep.ankerY) * 2.59;
        const grens = Math.min(maxB, maxByRight, maxByBottom);
        const nb = Math.max(minB, Math.min(grens, p.x - logoSleep.ankerX));
        return { ...prev, b: nb };
      });
    };
    const onUp = () => {
      setLogoSleep(null);
      const box = logoBoxRef.current;
      if (box) {
        updateVerdieping.mutate(
          { id: Number(verdiepingId), data: { logo_x: box.x, logo_y: box.y, logo_breedte: box.b } },
          { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetVerdiepingQueryKey(Number(verdiepingId)) }) },
        );
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoSleep, view, W, H, verdiepingId]);

  const startLogoVerplaats = (e: React.MouseEvent) => {
    if (!isBeheerder || !logoBox || plaatsenModus || tekenModus || verplaatsModus) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = (e.clientX - rect.left - view.x) / view.zoom;
    const my = (e.clientY - rect.top - view.y) / view.zoom;
    setLogoSleep({ modus: "verplaats", offsetX: mx - logoBox.x, offsetY: my - logoBox.y });
  };

  const startLogoSchaal = (e: React.MouseEvent) => {
    if (!isBeheerder || !logoBox || plaatsenModus || tekenModus || verplaatsModus) return;
    e.stopPropagation();
    e.preventDefault();
    setLogoSleep({ modus: "schaal", ankerX: logoBox.x, ankerY: logoBox.y });
  };

  // ---- PDF-plattegrond renderen ----
  useEffect(() => {
    const url = (verdieping as any)?.plattegrond_url as string | undefined | null;
    if (!url) {
      setPdfBeeld(null);
      setPdfDims(null);
      return;
    }
    let geannuleerd = false;
    (async () => {
      setPdfLaden(true);
      try {
        let dataUrl: string;
        let dims: { w: number; h: number };
        try {
          const taak = pdfjsLib.getDocument({ url: `/api/storage${url}` });
          const pdf = await taak.promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Geen canvas context");
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          dataUrl = canvas.toDataURL("image/png");
          dims = { w: canvas.width, h: canvas.height };
        } catch {
          // Val terug op een afbeeldingsplattegrond (PNG/JPG)
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error("Afbeelding laden mislukt"));
            i.src = `/api/storage${url}`;
          });
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Geen canvas context");
          ctx.drawImage(img, 0, 0);
          dataUrl = canvas.toDataURL("image/png");
          dims = { w: canvas.width, h: canvas.height };
        }
        if (geannuleerd) return;
        setPdfBeeld(dataUrl);
        setPdfDims(dims);
      } catch {
        if (!geannuleerd) {
          setPdfBeeld(null);
          setPdfDims(null);
        }
      } finally {
        if (!geannuleerd) setPdfLaden(false);
      }
    })();
    return () => { geannuleerd = true; };
  }, [(verdieping as any)?.plattegrond_url]);

  // Normaliseer voorzieningen naar SVGVoorziening
  const geplaatst: SVGVoorziening[] = (voorzieningen ?? [])
    .filter((v: any) => v.locatie_x != null && v.locatie_y != null)
    .map((v: any) => ({
      id: v.id,
      objectnummer: v.objectnummer,
      type: v.type,
      status: v.status,
      classificatie: v.classificatie,
      ruimte: v.ruimte,
      wand_of_plafond: v.wand_of_plafond,
      ai_te_controleren: v.ai_te_controleren,
      cluster_id: v.cluster_id,
      locatie_x: Number(v.locatie_x),
      locatie_y: Number(v.locatie_y),
    }));

  const nietGeplaatst = (voorzieningen ?? []).filter((v: any) => v.locatie_x == null || v.locatie_y == null);

  // ---- Clustering (visueel + logisch) ----
  // Visuele groepen: bij de huidige zoom samengevoegde, overlappende spots.
  const drempelImg = VISUEEL_CLUSTER_PX / Math.max(view.zoom, 0.0001);
  const visueleGroepen: SVGVoorziening[][] = visueelClusterAan
    ? maakVisueleGroepen(geplaatst, drempelImg)
    : geplaatst.map((v) => [v]);

  // Logische omhullingen: per cluster de spots op deze verdieping (alleen tonen
  // als er minstens één spot van dit cluster op de huidige verdieping staat). De
  // toegewezen monteur en het voorbereid-aantal komen uit de cluster-respons
  // (server-side afgeleid over alle verdiepingen), zodat dit gebouwbreed klopt.
  const logischeOmhullingen = (clusters ?? [])
    .map((c: any) => ({ cluster: c, spots: geplaatst.filter((v) => v.cluster_id === c.id) }))
    .filter((o: { spots: SVGVoorziening[] }) => o.spots.length > 0);

  // Klik op telbubbel → inzoomen en centreren zodat de groep uiteenvalt.
  const zoomNaarGroep = useCallback((groep: SVGVoorziening[]) => {
    const cont = containerRef.current;
    if (!cont) return;
    const cw = cont.clientWidth;
    const ch = cont.clientHeight;
    const c = groepCentroid(groep);
    setView((v) => {
      const nz = Math.min(MAX_ZOOM, v.zoom * 2.2);
      return { zoom: nz, x: cw / 2 - c.x * nz, y: ch / 2 - c.y * nz };
    });
  }, []);

  // ---- Pan & Zoom handlers ----
  const opCanvasKlik = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const svgX = (e.clientX - rect.left - view.x) / view.zoom;
    const svgY = (e.clientY - rect.top - view.y) / view.zoom;
    if (tekenModus) {
      setHuidigePunten((p) => [...p, { x: Math.round(svgX), y: Math.round(svgY) }]);
      return;
    }
    if (verplaatsModus && geselecteerdId != null) {
      const klemX = Math.min(W, Math.max(0, svgX));
      const klemY = Math.min(H, Math.max(0, svgY));
      void verplaatsSpot(geselecteerdId, Math.round(klemX), Math.round(klemY));
      return;
    }
    if (serieModus) {
      const klemX = Math.round(Math.min(W, Math.max(0, svgX)));
      const klemY = Math.round(Math.min(H, Math.max(0, svgY)));
      if (serieMethode === "lijn") {
        if (!serieLijnStart) {
          setSerieLijnStart({ x: klemX, y: klemY });
        } else {
          void plaatsSerieLijn(serieLijnStart, { x: klemX, y: klemY }, serieAantal);
          setSerieLijnStart(null);
          setSerieMuis(null);
        }
        return;
      }
      if (serieMethode === "rechthoek") {
        if (!serieLijnStart) {
          setSerieLijnStart({ x: klemX, y: klemY });
        } else {
          void plaatsSerieRechthoek(serieLijnStart, { x: klemX, y: klemY }, serieRijen, serieKolommen);
          setSerieLijnStart(null);
          setSerieMuis(null);
        }
        return;
      }
      void plaatsSerieSpot(klemX, klemY);
      return;
    }
    if (!plaatsenModus) return;
    const klemX = Math.min(W, Math.max(0, svgX));
    const klemY = Math.min(H, Math.max(0, svgY));
    setNieuwLocatie({ x: Math.round(klemX), y: Math.round(klemY) });
    const nu = new Date();
    const vandaag = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}-${String(nu.getDate()).padStart(2, "0")}`;
    const huidigeIsMonteur = monteurs.some(
      (m: any) => String(m.id) === String(gebruiker?.id),
    );
    setNieuwForm({
      ...LEEG_FORM,
      objectnummer: volgendSpot?.spotnummer ?? "",
      installatie_datum: vandaag,
      monteur_id: huidigeIsMonteur && gebruiker?.id != null ? String(gebruiker.id) : "",
    });
    setNieuwLabelIds([]);
    setVoorFotos([]);
    setNaFotos([]);
    setAiVoorstel(null);
    setAiVelden(new Set());
    setAiFout(null);
    aiSessieRef.current += 1;
    wandPlafondHandmatigRef.current = false;
    setNieuwDialoog(true);
  }, [plaatsenModus, serieModus, serieMethode, serieLijnStart, serieAantal, serieRijen, serieKolommen, tekenModus, verplaatsModus, geselecteerdId, view, W, H, volgendSpot, gebruiker, monteurs]);

  // Bouwt de POST-payload voor één serie-spot uit het actuele sjabloon. Het
  // objectnummer blijft leeg zodat de server het genereert (geen botsing bij
  // snel opeenvolgende inserts).
  const bouwSerieSpotData = useCallback((x: number, y: number) => {
    const sjabloon = serieFormRef.current;
    const labels = serieLabelIdsRef.current;
    const nu = new Date();
    const vandaag = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}-${String(nu.getDate()).padStart(2, "0")}`;
    return {
      objectnummer: "",
      type: sjabloon.type,
      status: sjabloon.status || "voorbereid",
      classificatie: "60",
      wand_of_plafond: sjabloon.wand_of_plafond || undefined,
      ruimte: sjabloon.ruimte && sjabloon.ruimte !== GEEN_RUIMTE_VAL ? sjabloon.ruimte : undefined,
      installatie_datum: vandaag,
      label_ids: labels,
      monteur_id: sjabloon.monteur_id ? Number(sjabloon.monteur_id) : undefined,
      cluster_id: sjabloon.cluster_id ? Number(sjabloon.cluster_id) : undefined,
      maker_monteur_id: gebruiker?.id != null ? Number(gebruiker.id) : undefined,
      locatie_x: x,
      locatie_y: y,
      gebouw_id: Number(id),
      verdieping_id: Number(verdiepingId),
    };
  }, [gebruiker, id, verdiepingId]);

  const plaatsSerieSpot = useCallback(async (x: number, y: number) => {
    const sjabloon = serieFormRef.current;
    if (!sjabloon.type) return;
    if (sjabloon.ruimte && sjabloon.ruimte !== GEEN_RUIMTE_VAL) {
      registreerRuimteGebruik(sjabloon.ruimte);
    }
    try {
      await maakVoorziening.mutateAsync({ data: bouwSerieSpotData(x, y) });
      setSerieTeller((n) => n + 1);
      refetch();
      refetchClusters();
    } catch {
      /* fout wordt door de mutatie-status getoond; modus blijft actief */
    }
  }, [maakVoorziening, bouwSerieSpotData, refetch, refetchClusters]);

  // Plaatst een hele serie spots gelijkmatig verdeeld op de lijn van A naar B.
  // Bij N=1 komt de spot op het midden; bij N>=2 liggen begin en eind precies
  // op de uiteinden. Inserts gaan serieel zodat de server-spotnummers oplopen
  // zonder botsing.
  const plaatsSerieLijn = useCallback(async (
    start: { x: number; y: number },
    eind: { x: number; y: number },
    aantal: number,
  ) => {
    const sjabloon = serieFormRef.current;
    if (!sjabloon.type) return;
    const n = Math.max(1, Math.min(50, Math.round(aantal)));
    if (sjabloon.ruimte && sjabloon.ruimte !== GEEN_RUIMTE_VAL) {
      registreerRuimteGebruik(sjabloon.ruimte);
    }
    const posities: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      posities.push({
        x: Math.round(Math.min(W, Math.max(0, start.x + (eind.x - start.x) * t))),
        y: Math.round(Math.min(H, Math.max(0, start.y + (eind.y - start.y) * t))),
      });
    }
    let geplaatst = 0;
    for (const p of posities) {
      try {
        await maakVoorziening.mutateAsync({ data: bouwSerieSpotData(p.x, p.y) });
        geplaatst++;
        setSerieTeller((t) => t + 1);
      } catch {
        /* fout wordt door de mutatie-status getoond; stop de reeks */
        break;
      }
    }
    if (geplaatst > 0) {
      refetch();
      refetchClusters();
    }
  }, [maakVoorziening, bouwSerieSpotData, refetch, refetchClusters, W, H]);

  // Berekent een raster van rijen x kolommen posities binnen de rechthoek die
  // wordt opgespannen door de twee hoekpunten. Begin- en eindkant liggen op de
  // randen; bij 1 rij/kolom wordt die as op het midden geplaatst.
  const rasterPosities = useCallback((
    hoek1: { x: number; y: number },
    hoek2: { x: number; y: number },
    rijen: number,
    kolommen: number,
  ) => {
    const r = Math.max(1, Math.min(20, Math.round(rijen)));
    const k = Math.max(1, Math.min(20, Math.round(kolommen)));
    const minX = Math.min(hoek1.x, hoek2.x);
    const maxX = Math.max(hoek1.x, hoek2.x);
    const minY = Math.min(hoek1.y, hoek2.y);
    const maxY = Math.max(hoek1.y, hoek2.y);
    const posities: { x: number; y: number }[] = [];
    for (let ri = 0; ri < r; ri++) {
      const ty = r === 1 ? 0.5 : ri / (r - 1);
      for (let ci = 0; ci < k; ci++) {
        const tx = k === 1 ? 0.5 : ci / (k - 1);
        posities.push({
          x: Math.round(Math.min(W, Math.max(0, minX + (maxX - minX) * tx))),
          y: Math.round(Math.min(H, Math.max(0, minY + (maxY - minY) * ty))),
        });
      }
    }
    return posities;
  }, [W, H]);

  // Plaatst een raster van spots binnen de getrokken rechthoek/strook. Inserts
  // gaan serieel zodat de server-spotnummers oplopen zonder botsing.
  const plaatsSerieRechthoek = useCallback(async (
    hoek1: { x: number; y: number },
    hoek2: { x: number; y: number },
    rijen: number,
    kolommen: number,
  ) => {
    const sjabloon = serieFormRef.current;
    if (!sjabloon.type) return;
    if (sjabloon.ruimte && sjabloon.ruimte !== GEEN_RUIMTE_VAL) {
      registreerRuimteGebruik(sjabloon.ruimte);
    }
    const posities = rasterPosities(hoek1, hoek2, rijen, kolommen);
    let geplaatst = 0;
    for (const p of posities) {
      try {
        await maakVoorziening.mutateAsync({ data: bouwSerieSpotData(p.x, p.y) });
        geplaatst++;
        setSerieTeller((t) => t + 1);
      } catch {
        /* fout wordt door de mutatie-status getoond; stop de reeks */
        break;
      }
    }
    if (geplaatst > 0) {
      refetch();
      refetchClusters();
    }
  }, [maakVoorziening, bouwSerieSpotData, rasterPosities, refetch, refetchClusters]);

  const verplaatsSpot = useCallback(async (spotId: number, x: number, y: number) => {
    await updateVoorziening.mutateAsync({ id: spotId, data: { locatie_x: x, locatie_y: y } });
    setVerplaatsModus(false);
    refetch();
  }, [updateVoorziening, refetch]);

  const startTekenen = useCallback(() => {
    setPlaatsenModus(false);
    setGeselecteerdId(null);
    setScheidingSelectie(null);
    setHuidigePunten([]);
    setTekenModus(true);
  }, []);

  const annuleerTekenen = useCallback(() => {
    setTekenModus(false);
    setHuidigePunten([]);
  }, []);

  const bewaarScheiding = useCallback(async () => {
    if (huidigePunten.length < 2) return;
    const kleur = SCHEIDING_TYPEN[scheidingForm.type]?.kleur ?? "#dc2626";
    const code = scheidingForm.waarde
      ? `${scheidingForm.classificatie}${scheidingForm.waarde}`
      : undefined;
    await maakScheiding.mutateAsync({
      id: Number(verdiepingId),
      data: {
        type: scheidingForm.type,
        waarde: code,
        kleur,
        punten: JSON.stringify(huidigePunten),
      },
    });
    setScheidingDialoog(false);
    setTekenModus(false);
    setHuidigePunten([]);
    refetchScheidingen();
  }, [huidigePunten, scheidingForm, verdiepingId, maakScheiding, refetchScheidingen]);

  const wisScheiding = useCallback(async (scheidingId: number) => {
    await verwijderScheiding.mutateAsync({ scheidingId });
    setScheidingSelectie(null);
    refetchScheidingen();
  }, [verwijderScheiding, refetchScheidingen]);

  const opMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (plaatsenModus || tekenModus || verplaatsModus) return;
    setPanning(true);
    setPanStart({ mx: e.clientX, my: e.clientY, vx: view.x, vy: view.y });
  }, [plaatsenModus, tekenModus, verplaatsModus, view.x, view.y]);

  const opMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Live preview: volg de muis zodra in serie-lijn-/rechthoekmodus een
    // beginpunt is gezet, zodat de gebruiker ziet waar de spots komen voordat
    // hij klikt.
    if (serieModus && (serieMethode === "lijn" || serieMethode === "rechthoek") && serieLijnStart) {
      const rect = svgRef.current!.getBoundingClientRect();
      const svgX = (e.clientX - rect.left - view.x) / view.zoom;
      const svgY = (e.clientY - rect.top - view.y) / view.zoom;
      setSerieMuis({
        x: Math.round(Math.min(W, Math.max(0, svgX))),
        y: Math.round(Math.min(H, Math.max(0, svgY))),
      });
    }
    if (!panning) return;
    setView((v) => ({
      ...v,
      x: panStart.vx + (e.clientX - panStart.mx),
      y: panStart.vy + (e.clientY - panStart.my),
    }));
  }, [panning, panStart, serieModus, serieMethode, serieLijnStart, view.x, view.y, view.zoom, W, H]);

  const opMouseUp = useCallback(() => setPanning(false), []);

  const opScroll = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setView((v) => {
      const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      return {
        zoom: nz,
        x: mx - (mx - v.x) * (nz / v.zoom),
        y: my - (my - v.y) * (nz / v.zoom),
      };
    });
  }, []);

  // Plattegrond passend en gecentreerd in beeld zetten
  const fitToView = useCallback(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const cw = cont.clientWidth;
    const ch = cont.clientHeight;
    const iw = W;
    const ih = H;
    if (!cw || !ch || !iw || !ih) return;
    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min(cw / iw, ch / ih) * 0.95),
    );
    setView({ x: (cw - iw * zoom) / 2, y: (ch - ih * zoom) / 2, zoom });
  }, [W, H]);

  // Automatisch passend maken zodra de plattegrond (of het canvas) bekend is
  useEffect(() => {
    fitToView();
  }, [fitToView]);

  const resetView = () => fitToView();
  const zoomIn = () => setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, v.zoom * 1.25) }));
  const zoomOut = () => setView((v) => ({ ...v, zoom: Math.max(MIN_ZOOM, v.zoom * 0.8) }));

  // Een veld is "AI" (amber) zolang het de AI-suggestie houdt en niet is aangeraakt.
  function isAi(veld: string) {
    return aiVelden.has(veld);
  }
  function raakAanAi(veld: string) {
    setAiVelden((s) => {
      if (!s.has(veld)) return s;
      const n = new Set(s);
      n.delete(veld);
      return n;
    });
  }
  // Het AI-voorstel hoort bij specifieke foto's; zodra de foto's wijzigen is het
  // voorstel niet meer geldig. Ook een eventueel lopend AI-verzoek wordt geïnvalideerd.
  function wisAiVoorstel() {
    aiSessieRef.current += 1;
    setAiVoorstel(null);
    setAiVelden(new Set());
    setAiFout(null);
  }

  // AI-spotherkenning: analyseert de geüploade foto ná (vergelijkt met foto vóór)
  // en stelt applicatie/toepassing/wand-of-plafond + document voor. De mens bevestigt;
  // de AI keurt nooit zelfstandig goed.
  async function analyseerMetAi() {
    if (naFotos.length === 0) return;
    setAiFout(null);
    const sessie = aiSessieRef.current;
    try {
      const res = await aiSpotvoorstel.mutateAsync({
        data: {
          gebouw_id: Number(id),
          foto_voor_url: voorFotos[0] ?? null,
          foto_na_url: naFotos[0],
        },
      });
      // Negeer een laat resultaat als de dialoog inmiddels is gesloten/heropend of
      // de foto's zijn gewijzigd (anders schrijft het naar een andere spot).
      if (aiSessieRef.current !== sessie) return;
      setAiVoorstel(res);
      const nieuw = new Set<string>();
      setNieuwForm((f) => {
        const next = { ...f };
        if (res.type_code) {
          next.type = res.type_code;
          nieuw.add("type");
        }
        if (res.wand_of_plafond) {
          next.wand_of_plafond = res.wand_of_plafond;
          nieuw.add("wand_of_plafond");
          // Voorkom dat de afgeleide wand/plafond-keuze het AI-voorstel overschrijft.
          wandPlafondHandmatigRef.current = true;
        }
        return next;
      });
      // Toepassing alleen automatisch invullen bij een betrouwbare suggestie (score > 0);
      // applicatie-gekoppelde opties (score 0) tonen we alleen als hint.
      const top = res.toepassing_suggesties?.[0];
      if (top && top.score > 0) {
        setNieuwLabelIds([top.label_id]);
        nieuw.add("toepassing");
      } else {
        setNieuwLabelIds([]);
      }
      setAiVelden(nieuw);
    } catch (err) {
      if (aiSessieRef.current !== sessie) return;
      setAiFout(err instanceof Error ? err.message : "AI-analyse mislukt");
    }
  }

  // ---- Voorziening aanmaken ----
  async function maakNieuw(e: React.FormEvent) {
    e.preventDefault();
    if (!nieuwForm.objectnummer || !nieuwForm.type) return;

    if (nieuwForm.ruimte && nieuwForm.ruimte !== GEEN_RUIMTE_VAL) {
      registreerRuimteGebruik(nieuwForm.ruimte);
    }
    const aangemaakt: any = await maakVoorziening.mutateAsync({
      data: {
        objectnummer: nieuwForm.objectnummer,
        type: nieuwForm.type,
        status: nieuwForm.status || "in_uitvoering",
        classificatie: "60",
        wand_of_plafond: nieuwForm.wand_of_plafond || undefined,
        ruimte: nieuwForm.ruimte && nieuwForm.ruimte !== GEEN_RUIMTE_VAL ? nieuwForm.ruimte : undefined,
        huisnummer: nieuwForm.huisnummer.trim() || undefined,
        opmerkingen: nieuwForm.opmerkingen.trim() || undefined,
        installatie_datum: nieuwForm.installatie_datum || undefined,
        label_ids: nieuwLabelIds,
        monteur_id: nieuwForm.monteur_id ? Number(nieuwForm.monteur_id) : undefined,
        maker_monteur_id: gebruiker?.id != null ? Number(gebruiker.id) : undefined,
        locatie_x: nieuwLocatie.x,
        locatie_y: nieuwLocatie.y,
        gebouw_id: Number(id),
        verdieping_id: Number(verdiepingId),
      },
    });

    const nieuwId = aangemaakt?.id as number | undefined;
    if (nieuwId) {
      for (const url of voorFotos) {
        await addFoto.mutateAsync({ id: nieuwId, data: { fase: "voor", url } });
      }
      for (const url of naFotos) {
        await addFoto.mutateAsync({ id: nieuwId, data: { fase: "na", url } });
      }
      // Leerset: bewaar het AI-voorstel + de uiteindelijke keuze. De server
      // berekent de afwijking en markeert de spot eventueel voor beheerder-controle.
      if (aiVoorstel) {
        try {
          await bewaarAiVoorstel.mutateAsync({
            id: nieuwId,
            data: {
              foto_voor_url: voorFotos[0] ?? null,
              foto_na_url: naFotos[0] ?? null,
              voorstel: aiVoorstel,
              gekozen: {
                wand_of_plafond: nieuwForm.wand_of_plafond || null,
                type_code: nieuwForm.type || null,
                label_ids: nieuwLabelIds,
              },
            },
          });
        } catch (err) {
          // Het opslaan van de leerset is niet kritiek voor het aanmaken van de spot.
          console.warn("AI-leerset opslaan mislukt", err);
        }
      }
    }

    setNieuwDialoog(false);
    setPlaatsenModus(false);
    setNieuwForm({ ...LEEG_FORM });
    setNieuwLabelIds([]);
    setVoorFotos([]);
    setNaFotos([]);
    setAiVoorstel(null);
    setAiVelden(new Set());
    setAiFout(null);
    wandPlafondHandmatigRef.current = false;
    refetch();
    refetchSpotnummer();
  }

  function sluitDialoog(open: boolean) {
    setNieuwDialoog(open);
    if (!open) {
      setPlaatsenModus(false);
      setNieuwLabelIds([]);
      setVoorFotos([]);
      setNaFotos([]);
      setAiVoorstel(null);
      setAiVelden(new Set());
      setAiFout(null);
      aiSessieRef.current += 1;
      wandPlafondHandmatigRef.current = false;
    }
  }

  // ---- Serie plaatsen ----
  function openSerie() {
    setPlaatsenModus(false);
    setGeselecteerdId(null);
    if (tekenModus) annuleerTekenen();
    setSerieForm({
      type: "",
      wand_of_plafond: "",
      ruimte: "",
      status: "voorbereid",
      monteur_id: "",
      cluster_id: "",
    });
    setSerieLabelIds([]);
    setSerieMethode("klik");
    setSerieAantal(5);
    setSerieRijen(3);
    setSerieKolommen(3);
    setSerieLijnStart(null);
    setSerieMuis(null);
    setSerieDialoog(true);
  }

  function startSerie() {
    if (!serieForm.type) return;
    setSerieTeller(0);
    setSerieLijnStart(null);
    setSerieMuis(null);
    setSerieModus(true);
    setSerieDialoog(false);
  }

  function stopSerie() {
    setSerieModus(false);
    setSerieLijnStart(null);
    setSerieMuis(null);
  }

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/gebouwen/${id}`}>
            <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{verdieping?.naam ?? "Plattegrond"}</h1>
              <Badge variant="outline" className="text-xs">{gebouw?.naam}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {geplaatst.length} voorziening{geplaatst.length !== 1 ? "en" : ""} op kaart
              {nietGeplaatst.length > 0 && ` • ${nietGeplaatst.length} niet geplaatst`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {alleVerdiepingen && alleVerdiepingen.length > 1 && (
            <Select
              value={verdiepingId}
              onValueChange={(v) => window.location.assign(`/gebouwen/${id}/plattegrond/${v}`)}
            >
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {alleVerdiepingen.map((vrd: any) => (
                  <SelectItem key={vrd.id} value={String(vrd.id)}>
                    {vrd.naam}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" size="icon" className="h-8 w-8" onClick={zoomOut}><ZoomOut className="h-3.5 w-3.5" /></Button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(view.zoom * 100)}%</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={zoomIn}><ZoomIn className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={resetView}><RotateCcw className="h-3.5 w-3.5" /></Button>

          <Button
            variant={visueelClusterAan ? "default" : "outline"}
            size="sm"
            className="h-8"
            onClick={() => setVisueelClusterAan((a) => !a)}
            title="Overlappende spots samenvoegen tot telbubbels"
          >
            <Boxes className="h-4 w-4 mr-1" />
            {visueelClusterAan ? "Clusteren aan" : "Clusteren uit"}
          </Button>

          {magBewerken && (
            <Button variant="outline" size="sm" className="h-8" onClick={() => setClusterBeheerOpen(true)}>
              <Boxes className="h-4 w-4 mr-1" />Clusters
            </Button>
          )}

          {magBewerken && (
            <>
              <Button
                variant={plaatsenModus ? "destructive" : "default"}
                size="sm"
                onClick={() => { setPlaatsenModus(!plaatsenModus); setSerieModus(false); setGeselecteerdId(null); if (tekenModus) annuleerTekenen(); }}
              >
                {plaatsenModus ? (<><X className="h-4 w-4 mr-1" />Annuleren</>) : (<><Plus className="h-4 w-4 mr-1" />Plaatsen</>)}
              </Button>

              {serieModus ? (
                <Button variant="destructive" size="sm" onClick={stopSerie}>
                  <X className="h-4 w-4 mr-1" />Serie stoppen
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={openSerie}>
                  <Layers className="h-4 w-4 mr-1" />Serie plaatsen
                </Button>
              )}

              {tekenModus ? (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    disabled={huidigePunten.length < 2}
                    onClick={() => setScheidingDialoog(true)}
                  >
                    <Check className="h-4 w-4 mr-1" />Voltooien
                  </Button>
                  <Button variant="destructive" size="sm" onClick={annuleerTekenen}>
                    <X className="h-4 w-4 mr-1" />Annuleren
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={startTekenen}>
                  <Spline className="h-4 w-4 mr-1" />Scheiding tekenen
                </Button>
              )}
            </>
          )}

          {isBeheerder && (
            <GearchiveerdSectie
              gebouwId={Number(id)}
              verdiepingId={Number(verdiepingId)}
              onWijziging={() => { refetch(); refetchSpotnummer(); }}
            />
          )}
        </div>
      </div>

      {/* Plaatsen hint */}
      {plaatsenModus && (
        <div className="bg-primary/10 border border-primary/30 rounded-md px-3 py-2 mb-2 text-sm text-primary font-medium flex-shrink-0">
          Klik op de plattegrond om een nieuwe spot te plaatsen.
        </div>
      )}

      {/* Serie plaatsen hint */}
      {serieModus && (
        <div className="bg-primary/10 border border-primary/30 rounded-md px-3 py-2 mb-2 text-sm text-primary font-medium flex items-center justify-between flex-shrink-0">
          <span>
            {serieMethode === "lijn" ? (
              <>
                Serie langs lijn actief —{" "}
                {serieLijnStart
                  ? `klik op het eindpunt; er komen ${serieAantal} ${STATUSLABEL[serieForm.status]?.toLowerCase() ?? serieForm.status} spots (${TYPEN[serieForm.type]?.label ?? serieForm.type}) gelijkmatig verdeeld.`
                  : `klik op het beginpunt van de lijn (${serieAantal} spots per lijn).`}
              </>
            ) : serieMethode === "rechthoek" ? (
              <>
                Serie in rechthoek actief —{" "}
                {serieLijnStart
                  ? `klik op de tegenoverliggende hoek; er komen ${serieRijen * serieKolommen} ${STATUSLABEL[serieForm.status]?.toLowerCase() ?? serieForm.status} spots (${TYPEN[serieForm.type]?.label ?? serieForm.type}) in een raster van ${serieRijen} x ${serieKolommen}.`
                  : `klik op de eerste hoek van de strook/rechthoek (${serieRijen} x ${serieKolommen} = ${serieRijen * serieKolommen} spots).`}
              </>
            ) : (
              <>
                Serie plaatsen actief — klik op de plattegrond om telkens een{" "}
                {STATUSLABEL[serieForm.status]?.toLowerCase() ?? serieForm.status} spot
                ({TYPEN[serieForm.type]?.label ?? serieForm.type}) toe te voegen.
              </>
            )}
            {serieTeller > 0 && ` ${serieTeller} geplaatst.`}
            {maakVoorziening.isPending && " Bezig met opslaan…"}
          </span>
          <Button size="sm" variant="default" onClick={stopSerie}>
            <Check className="h-4 w-4 mr-1" />Klaar ({serieTeller})
          </Button>
        </div>
      )}

      {/* Verplaats hint */}
      {verplaatsModus && (
        <div className="bg-primary/10 border border-primary/30 rounded-md px-3 py-2 mb-2 text-sm text-primary font-medium flex items-center justify-between flex-shrink-0">
          <span>Klik op de plattegrond om de geselecteerde voorziening te verplaatsen.</span>
          <Button variant="destructive" size="sm" onClick={() => setVerplaatsModus(false)}>
            <X className="h-4 w-4 mr-1" />Annuleren
          </Button>
        </div>
      )}

      {/* Teken hint */}
      {tekenModus && (
        <div className="bg-primary/10 border border-primary/30 rounded-md px-3 py-2 mb-2 text-sm text-primary font-medium flex-shrink-0">
          Klik om punten te plaatsen voor de scheidingslijn. Klik op &quot;Voltooien&quot; om op te slaan ({huidigePunten.length} {huidigePunten.length === 1 ? "punt" : "punten"}).
        </div>
      )}

      {/* Hoofd canvas + zijpaneel */}
      <div className="flex flex-1 gap-3 min-h-0">
        {/* SVG Canvas */}
        <div
          ref={containerRef}
          className={`flex-1 rounded-lg border overflow-hidden bg-slate-100 relative ${plaatsenModus || tekenModus || verplaatsModus ? "cursor-crosshair" : panning ? "cursor-grabbing" : "cursor-grab"}`}
        >
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            onClick={opCanvasKlik}
            onMouseDown={opMouseDown}
            onMouseMove={opMouseMove}
            onMouseUp={opMouseUp}
            onMouseLeave={opMouseUp}
            onWheel={opScroll}
            style={{ display: "block" }}
          >
            <g transform={`translate(${view.x}, ${view.y}) scale(${view.zoom})`}>
              {pdfBeeld ? (
                <>
                  <image href={pdfBeeld} x={0} y={0} width={W} height={H} />
                </>
              ) : (
                <GridAchtergrond w={W} h={H} />
              )}

              {/* Scheidingen */}
              {(scheidingen ?? []).map((s: any) => {
                let punten: { x: number; y: number }[] = [];
                try { punten = JSON.parse(s.punten); } catch { punten = []; }
                if (punten.length < 2) return null;
                const kleur = s.kleur || SCHEIDING_TYPEN[s.type]?.kleur || "#dc2626";
                const geselecteerd = scheidingSelectie === s.id;
                const markers = markerPosities(punten, Math.max(W, H) / 4.6);
                const puntenStr = punten.map((p) => `${p.x},${p.y}`).join(" ");
                return (
                  <g key={`s${s.id}`}
                     pointerEvents={plaatsenModus ? "none" : undefined}
                     style={{ cursor: tekenModus ? "crosshair" : "pointer" }}
                     onClick={(e) => { if (tekenModus || plaatsenModus) return; e.stopPropagation(); setScheidingSelectie(geselecteerd ? null : s.id); }}>
                    <polyline points={puntenStr} fill="none" stroke={kleur}
                      strokeWidth={geselecteerd ? 7 : 4}
                      strokeDasharray={s.type === "rook" ? "12 8" : undefined}
                      strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
                    {s.waarde && markers.map((m, mi) => {
                      const codeWeergave = s.type === "rook" && !String(s.waarde).startsWith("WRD") ? `WRD${s.waarde}` : String(s.waarde);
                      return (
                        <g key={mi} transform={`translate(${m.x}, ${m.y})`}>
                          <circle r={18} fill="#fff" stroke={kleur} strokeWidth={geselecteerd ? 4 : 3} />
                          <text x={0} y={0} textAnchor="middle" dominantBaseline="central"
                            fontSize={codeWeergave.length >= 6 ? 8 : codeWeergave.length >= 5 ? 9.5 : 11} fontWeight={800} fill={kleur}>{codeWeergave}</text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Scheiding in aanmaak */}
              {tekenModus && huidigePunten.length > 0 && (
                <g pointerEvents="none">
                  {huidigePunten.length >= 2 && (
                    <polyline
                      points={huidigePunten.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke={SCHEIDING_TYPEN[scheidingForm.type]?.kleur ?? "#dc2626"}
                      strokeWidth={4} strokeDasharray="8 6" strokeLinecap="round" strokeLinejoin="round" />
                  )}
                  {huidigePunten.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={5}
                      fill="#fff" stroke={SCHEIDING_TYPEN[scheidingForm.type]?.kleur ?? "#dc2626"} strokeWidth={3} />
                  ))}
                </g>
              )}

              {/* Serie-lijn preview: dunne lijn + voorbeeldspots op de plekken
                  waar straks de echte spots komen. */}
              {serieModus && serieMethode === "lijn" && serieLijnStart && serieMuis && (() => {
                const n = Math.max(1, Math.min(50, Math.round(serieAantal)));
                const punten: { x: number; y: number }[] = [];
                for (let i = 0; i < n; i++) {
                  const t = n === 1 ? 0.5 : i / (n - 1);
                  punten.push({
                    x: serieLijnStart.x + (serieMuis.x - serieLijnStart.x) * t,
                    y: serieLijnStart.y + (serieMuis.y - serieLijnStart.y) * t,
                  });
                }
                return (
                  <g pointerEvents="none">
                    <line
                      x1={serieLijnStart.x} y1={serieLijnStart.y}
                      x2={serieMuis.x} y2={serieMuis.y}
                      stroke="hsl(12 90% 50%)" strokeWidth={3}
                      strokeDasharray="8 6" strokeLinecap="round" />
                    {punten.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r={9}
                        fill="hsl(12 90% 50%)" fillOpacity={0.85}
                        stroke="#fff" strokeWidth={2.5} />
                    ))}
                  </g>
                );
              })()}

              {/* Serie-rechthoek preview: omtrek + voorbeeldspots in het raster. */}
              {serieModus && serieMethode === "rechthoek" && serieLijnStart && serieMuis && (() => {
                const punten = rasterPosities(serieLijnStart, serieMuis, serieRijen, serieKolommen);
                const x = Math.min(serieLijnStart.x, serieMuis.x);
                const y = Math.min(serieLijnStart.y, serieMuis.y);
                const breedte = Math.abs(serieMuis.x - serieLijnStart.x);
                const hoogte = Math.abs(serieMuis.y - serieLijnStart.y);
                return (
                  <g pointerEvents="none">
                    <rect
                      x={x} y={y} width={breedte} height={hoogte}
                      fill="hsl(12 90% 50%)" fillOpacity={0.08}
                      stroke="hsl(12 90% 50%)" strokeWidth={3}
                      strokeDasharray="8 6" />
                    {punten.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r={9}
                        fill="hsl(12 90% 50%)" fillOpacity={0.85}
                        stroke="#fff" strokeWidth={2.5} />
                    ))}
                  </g>
                );
              })()}

              {/* Logische cluster-omhullingen (achter de spots) */}
              {logischeOmhullingen.map((o: { cluster: any; spots: SVGVoorziening[] }) => (
                <ClusterOmhulling
                  key={`cl${o.cluster.id}`}
                  spots={o.spots}
                  naam={o.cluster.naam}
                  kleur={o.cluster.kleur || STANDAARD_CLUSTERKLEUR}
                  monteurNaam={o.cluster.monteur_naam ?? null}
                  voorbereidAantal={o.cluster.voorbereid_aantal ?? 0}
                  zoom={view.zoom}
                />
              ))}

              {/* Voorzieningen — visueel geclusterd in telbubbels of los getekend */}
              {visueleGroepen.map((groep) =>
                groep.length === 1 ? (
                  <VoorzieningIcoon
                    key={groep[0].id}
                    v={groep[0]}
                    geselecteerd={geselecteerdId === groep[0].id}
                    onClick={() => setGeselecteerdId(geselecteerdId === groep[0].id ? null : groep[0].id)}
                  />
                ) : (
                  <ClusterBubble
                    key={`vg${groep[0].id}`}
                    groep={groep}
                    zoom={view.zoom}
                    onClick={() => zoomNaarGroep(groep)}
                  />
                ),
              )}

              {/* Logo — als laatste getekend zodat het bovenop spots/lijnen ligt en versleepbaar blijft */}
              {pdfBeeld && logoBox && (() => {
                const logoH = logoBox.b / 2.59;
                const handle = Math.max(W, H) * 0.02;
                const sleepBezig = logoSleep != null;
                return (
                  <g>
                    <image
                      href="/logo-fps.png"
                      x={logoBox.x}
                      y={logoBox.y}
                      width={logoBox.b}
                      height={logoH}
                      preserveAspectRatio="xMidYMid meet"
                      style={{
                        pointerEvents: isBeheerder && !plaatsenModus && !tekenModus && !verplaatsModus ? "auto" : "none",
                        cursor: isBeheerder ? "move" : "default",
                      }}
                      onMouseDown={isBeheerder ? startLogoVerplaats : undefined}
                    />
                    {isBeheerder && (
                      <>
                        <rect
                          x={logoBox.x}
                          y={logoBox.y}
                          width={logoBox.b}
                          height={logoH}
                          fill="none"
                          stroke="#F23B0D"
                          strokeWidth={1.5 / view.zoom}
                          strokeDasharray={`${6 / view.zoom} ${4 / view.zoom}`}
                          opacity={sleepBezig ? 0.9 : 0.5}
                          style={{ pointerEvents: "none" }}
                        />
                        <rect
                          x={logoBox.x + logoBox.b - handle / 2}
                          y={logoBox.y + logoH - handle / 2}
                          width={handle}
                          height={handle}
                          rx={handle * 0.18}
                          fill="#F23B0D"
                          stroke="#fff"
                          strokeWidth={1.5 / view.zoom}
                          style={{ cursor: "nwse-resize" }}
                          onMouseDown={startLogoSchaal}
                        />
                      </>
                    )}
                  </g>
                );
              })()}
            </g>
          </svg>

          {/* Legende onderin */}
          <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm border rounded-md px-3 py-2 flex flex-wrap gap-x-4 gap-y-1.5 max-w-lg shadow-sm">
            {Object.entries(STATUSKLEUREN).map(([status, kleur]) => {
              const n = geplaatst.filter((v) => v.status === status).length;
              if (n === 0) return null;
              return (
                <div key={status} className="flex items-center gap-1.5 text-xs">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: kleur }} />
                  <span className="text-slate-600">{STATUSLABEL[status] ?? status}</span>
                  <span className="text-slate-400 font-medium">({n})</span>
                </div>
              );
            })}
            {Object.entries(SCHEIDING_TYPEN).map(([type, stijl]) => {
              const n = (scheidingen ?? []).filter((s: any) => s.type === type).length;
              if (n === 0) return null;
              return (
                <div key={`s-${type}`} className="flex items-center gap-1.5 text-xs">
                  <span className="w-4 h-0 border-t-2 flex-shrink-0" style={{ borderColor: stijl.kleur, borderStyle: type === "rook" ? "dashed" : "solid" }} />
                  <span className="text-slate-600">{stijl.label}</span>
                  <span className="text-slate-400 font-medium">({n})</span>
                </div>
              );
            })}
          </div>

          {/* Geselecteerde scheiding verwijderen */}
          {scheidingSelectie != null && !tekenModus && (() => {
            const s = (scheidingen ?? []).find((x: any) => x.id === scheidingSelectie);
            if (!s) return null;
            return (
              <div className="absolute top-3 right-3 bg-white border rounded-md shadow-md px-3 py-2 flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-0 border-t-2" style={{ borderColor: s.kleur || SCHEIDING_TYPEN[s.type]?.kleur, borderStyle: s.type === "rook" ? "dashed" : "solid" }} />
                  <span className="font-medium">{SCHEIDING_TYPEN[s.type]?.label ?? s.type}</span>
                  {s.waarde && <span className="text-muted-foreground">{s.waarde}</span>}
                </span>
                {magBewerken && (
                  <Button variant="destructive" size="sm" disabled={verwijderScheiding.isPending} onClick={() => wisScheiding(s.id)}>
                    <Trash2 className="h-4 w-4 mr-1" />Verwijderen
                  </Button>
                )}
              </div>
            );
          })()}

          {/* PDF aan het laden */}
          {pdfLaden && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 pointer-events-none">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {/* Geen plattegrond */}
          {!pdfBeeld && !pdfLaden && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/90 border rounded-md px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              <FileText className="h-3.5 w-3.5" />
              Nog geen plattegrond — voeg er één toe via de sectie Plattegronden op de gebouwpagina.
            </div>
          )}

          {/* Geen data */}
          {geplaatst.length === 0 && !plaatsenModus && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <Map className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground font-medium">Geen spots op kaart</p>
              <p className="text-xs text-muted-foreground mt-1">Klik op "Plaatsen" om objecten toe te voegen</p>
            </div>
          )}
        </div>

        {/* Zijpaneel: detail geselecteerde voorziening */}
        {geselecteerdId != null && (
          <SpotDetail
            id={geselecteerdId}
            magBewerken={magBewerken}
            clusters={(clusters ?? []) as any[]}
            onClose={() => { setGeselecteerdId(null); setVerplaatsModus(false); }}
            onWijziging={() => { refetch(); refetchClusters(); }}
            verplaatsModus={verplaatsModus}
            onVerplaats={() => setVerplaatsModus(true)}
            onVerplaatsAnnuleer={() => setVerplaatsModus(false)}
          />
        )}

        {/* Niet-geplaatste voorzieningen */}
        {nietGeplaatst.length > 0 && geselecteerdId == null && (
          <div className="w-64 flex-shrink-0 border rounded-lg bg-white p-3 overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Niet geplaatst ({nietGeplaatst.length})
            </p>
            <div className="space-y-1">
              {nietGeplaatst.map((v: any) => (
                <div
                  key={v.id}
                  className="flex items-center gap-2 p-2 rounded border hover:bg-muted/50 text-sm cursor-pointer"
                  onClick={() => setGeselecteerdId(v.id)}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: TYPEN[v.type]?.kleur ?? "#94a3b8" }}
                  />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{v.objectnummer}</div>
                    <div className="text-xs text-muted-foreground">{TYPEN[v.type]?.label ?? v.type}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dialoog: nieuwe voorziening plaatsen */}
      <Dialog open={nieuwDialoog} onOpenChange={sluitDialoog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Spot plaatsen</DialogTitle>
          </DialogHeader>
          <form onSubmit={maakNieuw} className="space-y-4 py-1">

            {/* Spotnummer (auto) */}
            <div>
              <Label htmlFor="nw-nr">Spotnummer</Label>
              <Input
                id="nw-nr"
                value={nieuwForm.objectnummer}
                readOnly
                className="bg-muted"
                placeholder="Wordt automatisch toegekend"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Automatisch toegekend op basis van het gebouw.
              </p>
            </div>

            {/* Foto's vóór en ná — bij een spot eerst de foto's, dan AI-herkenning,
                daarna de overige velden. Op desktop is alleen uploaden mogelijk (geen camera). */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Foto's vóór</Label>
                  <FotoUploader label="Uploaden" onUploaded={(p) => { setVoorFotos((a) => [...a, p]); wisAiVoorstel(); }} />
                </div>
                <FotoStrip paths={voorFotos} onVerwijder={(i) => { setVoorFotos((a) => a.filter((_, idx) => idx !== i)); wisAiVoorstel(); }} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Foto's ná</Label>
                  <FotoUploader label="Uploaden" onUploaded={(p) => { setNaFotos((a) => [...a, p]); wisAiVoorstel(); }} />
                </div>
                <FotoStrip paths={naFotos} onVerwijder={(i) => { setNaFotos((a) => a.filter((_, idx) => idx !== i)); wisAiVoorstel(); }} />
              </div>
            </div>

            {/* AI-spotherkenning op de geüploade foto ná (vergelijkt met foto vóór).
                De AI stelt voor; de mens bevestigt; de AI keurt nooit zelf goed. */}
            <div className="space-y-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium">AI-spotherkenning</span>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={naFotos.length === 0 || aiSpotvoorstel.isPending}
                onClick={analyseerMetAi}
                className="w-full border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900"
              >
                {aiSpotvoorstel.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    AI analyseert de foto...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {aiVoorstel ? "Opnieuw analyseren met AI" : "Analyseer geüploade foto met AI"}
                  </>
                )}
              </Button>
              {naFotos.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Upload eerst een foto ná de afwerking. De AI vergelijkt die met de foto vóór en
                  stelt applicatie, toepassing, wand of plafond en het bijbehorende document voor.
                </p>
              )}
              {aiFout && (
                <p className="text-xs text-destructive">AI-analyse mislukt: {aiFout}</p>
              )}
              {aiVoorstel && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-800">AI-voorstel</span>
                    {!!aiVoorstel.betrouwbaarheid && (
                      <span className="text-xs font-medium text-amber-700">
                        Betrouwbaarheid: {aiVoorstel.betrouwbaarheid}
                      </span>
                    )}
                  </div>
                  {!!aiVoorstel.observaties && (
                    <p className="text-xs text-amber-900">{aiVoorstel.observaties}</p>
                  )}
                  {!!aiVoorstel.toelichting && (
                    <p className="text-xs text-amber-900">{aiVoorstel.toelichting}</p>
                  )}
                  {aiVoorstel.toepassing_suggesties && aiVoorstel.toepassing_suggesties.length > 0 && (
                    <p className="text-xs text-amber-900">
                      <span className="font-medium">AI stelt voor:</span>{" "}
                      {aiVoorstel.toepassing_suggesties.map((s) => s.naam).join(", ")}
                    </p>
                  )}
                  {!!aiVoorstel.document_naam && (
                    <p className="text-xs font-medium text-amber-800">
                      Voorgesteld document: {aiVoorstel.document_naam}
                    </p>
                  )}
                  <p className="text-xs text-amber-700 pt-0.5">
                    Controleer en pas aan waar nodig. De AI keurt niets zelf goed.
                  </p>
                </div>
              )}
            </div>

            {/* Applicatie */}
            <div>
              <div className="flex items-center gap-2">
                <Label>Applicatie *</Label>
                {isAi("type") && <AiBadge />}
              </div>
              <div className={isAi("type") ? "rounded-md ring-1 ring-amber-300" : undefined}>
                <ApplicatiePicker
                  value={nieuwForm.type}
                  onValueChange={(v) => {
                    setNieuwForm((f) => ({ ...f, type: v }));
                    setNieuwLabelIds([]);
                    raakAanAi("type");
                    raakAanAi("toepassing");
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Kies de applicatie uit de centrale bibliotheek.
              </p>
            </div>

            {/* Toepassing (alleen als applicatie gekozen) */}
            {nieuwForm.type && (
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Toepassing</p>
                  {isAi("toepassing") && <AiBadge />}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selecteer de gebruikte producten of systemen bij deze spot.
                </p>
                <ToepassingMultiSelect
                  typeCode={nieuwForm.type}
                  selectedIds={nieuwLabelIds}
                  onSelectionChange={(ids) => {
                    setNieuwLabelIds(ids);
                    raakAanAi("toepassing");
                  }}
                  magLabelsAanmaken={isBeheerder}
                />
                {nieuwFabrikanten.length > 0 && (
                  <p className="text-xs text-muted-foreground pt-1 border-t">
                    <span className="font-medium">Fabrikant(en):</span>{" "}
                    {nieuwFabrikanten.join(", ")}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {/* Wand of plafond */}
              <div>
                <div className="flex items-center gap-2">
                  <Label>Wand of plafond</Label>
                  {isAi("wand_of_plafond") && <AiBadge />}
                </div>
                <Select
                  value={nieuwForm.wand_of_plafond || GEEN_WAND_PLAFOND_VAL}
                  onValueChange={(v) => {
                    wandPlafondHandmatigRef.current = true;
                    raakAanAi("wand_of_plafond");
                    setNieuwForm((f) => ({ ...f, wand_of_plafond: v === GEEN_WAND_PLAFOND_VAL ? "" : v }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Kies plaatsing..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GEEN_WAND_PLAFOND_VAL}>Niet opgegeven</SelectItem>
                    {WAND_PLAFOND_OPTIES.map((w) => (
                      <SelectItem key={w} value={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ruimte */}
              <div>
                <Label>Ruimte</Label>
                <Select
                  value={nieuwForm.ruimte || GEEN_RUIMTE_VAL}
                  onValueChange={(v) => setNieuwForm((f) => ({ ...f, ruimte: v === GEEN_RUIMTE_VAL ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Kies ruimte..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GEEN_RUIMTE_VAL}>Niet opgegeven</SelectItem>
                    {ruimteOpties.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Huisnummer */}
              <div>
                <Label htmlFor="nw-huisnummer">Huisnummer (optioneel)</Label>
                <Input
                  id="nw-huisnummer"
                  value={nieuwForm.huisnummer}
                  onChange={(e) => setNieuwForm((f) => ({ ...f, huisnummer: e.target.value }))}
                  placeholder="Bijv. 12 of 4B"
                />
              </div>

              {/* Installatiedatum */}
              <div>
                <Label htmlFor="nw-datum">Installatiedatum</Label>
                <Input
                  id="nw-datum"
                  type="date"
                  value={nieuwForm.installatie_datum}
                  onChange={(e) => setNieuwForm((f) => ({ ...f, installatie_datum: e.target.value }))}
                />
              </div>

              {/* Status */}
              <div>
                <Label>Status</Label>
                <Select
                  value={nieuwForm.status}
                  onValueChange={(v) => setNieuwForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUSLABEL).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Aanmaker (leesbaar) */}
              <div>
                <Label>Geplaatst door</Label>
                <Input value={gebruiker?.naam ?? ""} readOnly className="bg-muted" />
              </div>

              {/* Monteur uitvoering — wie de spot daadwerkelijk uitvoert.
                  Standaard de aanmaker zelf; aanpasbaar wanneer een andere
                  monteur enkel de spot aanmaakt. */}
              <div>
                <Label>Monteur uitvoering</Label>
                <Select
                  value={nieuwForm.monteur_id || "geen"}
                  onValueChange={(v) => setNieuwForm((f) => ({ ...f, monteur_id: v === "geen" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Kies monteur" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geen">Niet ingevuld</SelectItem>
                    {monteurs.map((m: any) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Opmerkingen */}
              <div className="col-span-2">
                <Label htmlFor="nw-opm">Opmerking</Label>
                <Textarea
                  id="nw-opm"
                  value={nieuwForm.opmerkingen}
                  onChange={(e) => setNieuwForm((f) => ({ ...f, opmerkingen: e.target.value }))}
                  placeholder="Optionele opmerking..."
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => sluitDialoog(false)}>
                Annuleren
              </Button>
              <Button type="submit" disabled={!nieuwForm.type || maakVoorziening.isPending || addFoto.isPending || aiSpotvoorstel.isPending}>
                {maakVoorziening.isPending || addFoto.isPending ? "Opslaan..." : "Spot plaatsen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Scheiding opslaan dialoog */}
      <Dialog open={scheidingDialoog} onOpenChange={setScheidingDialoog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scheiding vastleggen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Type scheiding</Label>
              <Select value={scheidingForm.type} onValueChange={(v) => setScheidingForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SCHEIDING_TYPEN).map(([type, stijl]) => (
                    <SelectItem key={type} value={type}>{stijl.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Classificatie</Label>
                <Select value={scheidingForm.classificatie} onValueChange={(v) => setScheidingForm((f) => ({ ...f, classificatie: v }))}>
                  <SelectTrigger><SelectValue placeholder="Kies code" /></SelectTrigger>
                  <SelectContent>
                    {SCHEIDING_CLASSIFICATIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>WBDBO-waarde (minuten)</Label>
                <Select value={scheidingForm.waarde} onValueChange={(v) => setScheidingForm((f) => ({ ...f, waarde: v }))}>
                  <SelectTrigger><SelectValue placeholder="Kies waarde" /></SelectTrigger>
                  <SelectContent>
                    {WBDBO_OPTIES.map((w) => (
                      <SelectItem key={w} value={w}>{w} minuten</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {scheidingForm.waarde && (
              <p className="text-sm text-muted-foreground">
                Code op de lijn: <span className="font-semibold text-foreground">{scheidingForm.classificatie}{scheidingForm.waarde}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheidingDialoog(false)}>Annuleren</Button>
            <Button disabled={maakScheiding.isPending || huidigePunten.length < 2} onClick={bewaarScheiding}>
              {maakScheiding.isPending ? "Opslaan..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Serie voorbereiden: sjabloon instellen voor snel achter elkaar plaatsen */}
      <Dialog open={serieDialoog} onOpenChange={setSerieDialoog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Serie voorbereiden</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              Stel hier het sjabloon in. Daarna plaatst u op de plattegrond een
              reeks spots met dezelfde gegevens — per klik, of in één keer
              gelijkmatig verdeeld langs een getrokken lijn of in een rechthoek.
            </p>

            {/* Plaatsmethode */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={serieMethode === "klik" ? "default" : "outline"}
                  onClick={() => setSerieMethode("klik")}
                >
                  Per klik
                </Button>
                <Button
                  type="button"
                  variant={serieMethode === "lijn" ? "default" : "outline"}
                  onClick={() => setSerieMethode("lijn")}
                >
                  <Spline className="h-4 w-4 mr-1" />Langs een lijn
                </Button>
                <Button
                  type="button"
                  variant={serieMethode === "rechthoek" ? "default" : "outline"}
                  onClick={() => setSerieMethode("rechthoek")}
                >
                  <Layers className="h-4 w-4 mr-1" />Rechthoek
                </Button>
              </div>
              {serieMethode === "lijn" ? (
                <div>
                  <Label htmlFor="serie-aantal">Aantal spots per lijn</Label>
                  <Input
                    id="serie-aantal"
                    type="number"
                    min={1}
                    max={50}
                    value={serieAantal}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setSerieAantal(Number.isFinite(n) ? Math.max(1, Math.min(50, Math.round(n))) : 1);
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Klik straks op het begin- en eindpunt; de spots worden
                    gelijkmatig over de lijn verdeeld (begin en eind inbegrepen).
                  </p>
                </div>
              ) : serieMethode === "rechthoek" ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="serie-rijen">Rijen</Label>
                      <Input
                        id="serie-rijen"
                        type="number"
                        min={1}
                        max={20}
                        value={serieRijen}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setSerieRijen(Number.isFinite(n) ? Math.max(1, Math.min(20, Math.round(n))) : 1);
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="serie-kolommen">Kolommen</Label>
                      <Input
                        id="serie-kolommen"
                        type="number"
                        min={1}
                        max={20}
                        value={serieKolommen}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setSerieKolommen(Number.isFinite(n) ? Math.max(1, Math.min(20, Math.round(n))) : 1);
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Klik straks op twee tegenoverliggende hoeken; er worden{" "}
                    {serieRijen * serieKolommen} spots in een raster van{" "}
                    {serieRijen} x {serieKolommen} gelijkmatig binnen de rechthoek
                    geplaatst (randen inbegrepen).
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Klik straks telkens op de plattegrond om één spot toe te voegen.
                </p>
              )}
            </div>

            {/* Applicatie */}
            <div>
              <Label>Applicatie *</Label>
              <ApplicatiePicker
                value={serieForm.type}
                onValueChange={(v) => {
                  setSerieForm((f) => ({ ...f, type: v }));
                  setSerieLabelIds([]);
                }}
              />
            </div>

            {/* Toepassing */}
            {serieForm.type && (
              <div className="border rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">Toepassing</p>
                <p className="text-xs text-muted-foreground">
                  Selecteer de gebruikte producten of systemen voor deze reeks.
                </p>
                <ToepassingMultiSelect
                  typeCode={serieForm.type}
                  selectedIds={serieLabelIds}
                  onSelectionChange={setSerieLabelIds}
                  magLabelsAanmaken={isBeheerder}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {/* Wand of plafond */}
              <div>
                <Label>Wand of plafond</Label>
                <Select
                  value={serieForm.wand_of_plafond || GEEN_WAND_PLAFOND_VAL}
                  onValueChange={(v) => setSerieForm((f) => ({ ...f, wand_of_plafond: v === GEEN_WAND_PLAFOND_VAL ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Kies plaatsing..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GEEN_WAND_PLAFOND_VAL}>Niet opgegeven</SelectItem>
                    {WAND_PLAFOND_OPTIES.map((w) => (
                      <SelectItem key={w} value={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ruimte */}
              <div>
                <Label>Ruimte</Label>
                <Select
                  value={serieForm.ruimte || GEEN_RUIMTE_VAL}
                  onValueChange={(v) => setSerieForm((f) => ({ ...f, ruimte: v === GEEN_RUIMTE_VAL ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Kies ruimte..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GEEN_RUIMTE_VAL}>Niet opgegeven</SelectItem>
                    {ruimteOpties.map((r) => (
                      <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div>
                <Label>Status</Label>
                <Select
                  value={serieForm.status}
                  onValueChange={(v) => setSerieForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUSLABEL).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Monteur uitvoering */}
              <div>
                <Label>Monteur uitvoering</Label>
                <Select
                  value={serieForm.monteur_id || "geen"}
                  onValueChange={(v) => setSerieForm((f) => ({ ...f, monteur_id: v === "geen" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Kies monteur" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geen">Niet ingevuld</SelectItem>
                    {monteurs.map((m: any) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cluster */}
              <div className="col-span-2">
                <Label>Cluster</Label>
                <Select
                  value={serieForm.cluster_id || "geen"}
                  onValueChange={(v) => setSerieForm((f) => ({ ...f, cluster_id: v === "geen" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Geen cluster" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geen">Geen cluster</SelectItem>
                    {(clusters ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.kleur || STANDAARD_CLUSTERKLEUR }} />
                          {c.naam}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Geplaatste spots worden meteen aan dit cluster gekoppeld.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setSerieDialoog(false)}>
              Annuleren
            </Button>
            <Button type="button" disabled={!serieForm.type} onClick={startSerie}>
              <Layers className="h-4 w-4 mr-1" />Serie starten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clusters beheren */}
      <ClusterBeheerDialog
        open={clusterBeheerOpen}
        onOpenChange={setClusterBeheerOpen}
        gebouwId={Number(id)}
        verdiepingId={Number(verdiepingId)}
        clusters={(clusters ?? []) as any[]}
        monteurs={monteurs as any[]}
        onWijziging={() => { refetchClusters(); refetch(); }}
      />

    </div>
  );
}

// Clusters van een gebouw aanmaken, hernoemen en verwijderen (niveau 2).
function ClusterBeheerDialog({
  open,
  onOpenChange,
  gebouwId,
  verdiepingId,
  clusters,
  monteurs,
  onWijziging,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gebouwId: number;
  verdiepingId: number;
  clusters: any[];
  monteurs: any[];
  onWijziging: () => void;
}) {
  const maakCluster = useCreateCluster();
  const wijzigCluster = useUpdateCluster();
  const verwijderCluster = useDeleteCluster();
  const wijsClusterMonteurToe = useAssignClusterMonteur();
  const [nieuwNaam, setNieuwNaam] = useState("");
  const [nieuwType, setNieuwType] = useState("schacht");
  const [nieuwKleur, setNieuwKleur] = useState(STANDAARD_CLUSTERKLEUR);
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [bewerkNaam, setBewerkNaam] = useState("");
  const [bezigMonteurClusterId, setBezigMonteurClusterId] = useState<number | null>(null);

  async function wijsMonteurToe(clusterId: number, waarde: string) {
    setBezigMonteurClusterId(clusterId);
    try {
      await wijsClusterMonteurToe.mutateAsync({
        clusterId,
        data: { monteur_id: waarde === "geen" ? null : Number(waarde) },
      });
      onWijziging();
    } finally {
      setBezigMonteurClusterId(null);
    }
  }

  async function voegToe() {
    if (!nieuwNaam.trim()) return;
    await maakCluster.mutateAsync({
      id: gebouwId,
      data: { naam: nieuwNaam.trim(), type: nieuwType, kleur: nieuwKleur, verdieping_id: verdiepingId },
    });
    setNieuwNaam("");
    setNieuwType("schacht");
    setNieuwKleur(STANDAARD_CLUSTERKLEUR);
    onWijziging();
  }

  async function bewaarNaam(clusterId: number) {
    if (!bewerkNaam.trim()) { setBewerkId(null); return; }
    await wijzigCluster.mutateAsync({ clusterId, data: { naam: bewerkNaam.trim() } });
    setBewerkId(null);
    onWijziging();
  }

  async function wijzigKleur(clusterId: number, kleur: string) {
    await wijzigCluster.mutateAsync({ clusterId, data: { kleur } });
    onWijziging();
  }

  async function verwijder(clusterId: number) {
    await verwijderCluster.mutateAsync({ clusterId });
    onWijziging();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Clusters beheren</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Een cluster groepeert bij elkaar horende spots (bijv. een schacht of strook).
            Koppel spots aan een cluster via het zijpaneel van een spot.
          </p>

          {/* Bestaande clusters */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {clusters.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Nog geen clusters.</p>
            )}
            {clusters.map((c) => (
              <div key={c.id} className="flex items-center gap-2 border rounded-md p-2">
                <input
                  type="color"
                  value={c.kleur || STANDAARD_CLUSTERKLEUR}
                  onChange={(e) => wijzigKleur(c.id, e.target.value)}
                  className="h-6 w-6 rounded cursor-pointer border-0 bg-transparent p-0"
                  title="Kleur"
                />
                {bewerkId === c.id ? (
                  <Input
                    autoFocus
                    value={bewerkNaam}
                    onChange={(e) => setBewerkNaam(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") bewaarNaam(c.id); }}
                    onBlur={() => bewaarNaam(c.id)}
                    className="h-8 flex-1"
                  />
                ) : (
                  <span className="flex-1 text-sm font-medium truncate">{c.naam}</span>
                )}
                <Badge variant="secondary" className="text-xs">{c.voorziening_aantal} spots</Badge>
                {(c.voorbereid_aantal ?? 0) > 0 && (
                  <Badge variant="outline" className="text-xs">{c.voorbereid_aantal} voorbereid</Badge>
                )}
                {c.type && <Badge variant="outline" className="text-xs">{CLUSTER_TYPEN[c.type] ?? c.type}</Badge>}
                <Select
                  value={c.monteur_id != null ? String(c.monteur_id) : "geen"}
                  onValueChange={(v) => wijsMonteurToe(c.id, v)}
                  disabled={bezigMonteurClusterId === c.id}
                >
                  <SelectTrigger className="h-7 w-36 text-xs" title="Cluster aan monteur toewijzen">
                    <UserCheck className="h-3.5 w-3.5 mr-1 shrink-0" />
                    <SelectValue placeholder="Toewijzen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geen">Niet toegewezen</SelectItem>
                    {monteurs.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => { setBewerkId(c.id); setBewerkNaam(c.naam); }}
                  title="Hernoemen"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                  onClick={() => verwijder(c.id)}
                  disabled={verwijderCluster.isPending}
                  title="Verwijderen (spots blijven bestaan)"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Nieuw cluster */}
          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Nieuw cluster</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={nieuwKleur}
                onChange={(e) => setNieuwKleur(e.target.value)}
                className="h-9 w-9 rounded cursor-pointer border-0 bg-transparent p-0"
                title="Kleur"
              />
              <Input
                placeholder="Naam (bijv. Schacht A)"
                value={nieuwNaam}
                onChange={(e) => setNieuwNaam(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") voegToe(); }}
                className="h-9 flex-1"
              />
              <Select value={nieuwType} onValueChange={setNieuwType}>
                <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CLUSTER_TYPEN).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1">
              {CLUSTER_KLEUREN.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setNieuwKleur(k)}
                  className="h-5 w-5 rounded-full border-2"
                  style={{ backgroundColor: k, borderColor: nieuwKleur === k ? "#1e293b" : "transparent" }}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Sluiten</Button>
          <Button onClick={voegToe} disabled={!nieuwNaam.trim() || maakCluster.isPending}>
            {maakCluster.isPending ? "Toevoegen..." : "Cluster toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Gearchiveerde voorzieningen beheren (alleen beheerder) — knop + dialoog.
// Hooks draaien uitsluitend wanneer deze component gemonteerd is (beheerder).
function GearchiveerdSectie({
  gebouwId,
  verdiepingId,
  onWijziging,
}: {
  gebouwId: number;
  verdiepingId: number;
  onWijziging: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { data, refetch } = useListVoorzieningen({
    gebouw_id: gebouwId,
    verdieping_id: verdiepingId,
    gearchiveerd: true,
    per_pagina: 200,
  });
  const archiveer = useArchiveerVoorziening();
  const gearchiveerde = data?.items ?? [];

  async function terugPlaatsen(spotId: number) {
    await archiveer.mutateAsync({ id: spotId, data: { gearchiveerd: false } });
    refetch();
    onWijziging();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Archive className="h-4 w-4 mr-1" />Gearchiveerd
        {gearchiveerde.length > 0 && (
          <Badge variant="secondary" className="ml-1.5">{gearchiveerde.length}</Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gearchiveerde voorzieningen</DialogTitle>
          </DialogHeader>
          {gearchiveerde.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Geen gearchiveerde voorzieningen op deze verdieping.
            </p>
          ) : (
            <div className="space-y-2 py-1">
              {gearchiveerde.map((v: any) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 p-2.5 rounded border text-sm"
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: TYPEN[v.type]?.kleur ?? "#94a3b8" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{v.objectnummer}</div>
                    <div className="text-xs text-muted-foreground">
                      {TYPEN[v.type]?.label ?? v.type}
                      {v.gearchiveerd_op ? ` — gearchiveerd op ${String(v.gearchiveerd_op).slice(0, 10)}` : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={archiveer.isPending}
                    onClick={() => terugPlaatsen(v.id)}
                  >
                    <ArchiveRestore className="h-4 w-4 mr-1" />Terug plaatsen
                  </Button>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Strip van geüploade foto-thumbnails (nieuwe voorziening)
function FotoStrip({ paths, onVerwijder }: { paths: string[]; onVerwijder: (i: number) => void }) {
  if (paths.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Nog geen foto's</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {paths.map((p, i) => (
        <div key={i} className="relative group">
          <img
            src={`/api/storage${p}`}
            alt={`Foto ${i + 1}`}
            className="h-16 w-16 object-cover rounded border"
          />
          <button
            type="button"
            onClick={() => onVerwijder(i)}
            className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full p-0.5 opacity-90 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

// Detail zijpaneel met alle velden + foto's voor/na
function SpotDetail({
  id,
  magBewerken,
  clusters,
  onClose,
  onWijziging,
  verplaatsModus,
  onVerplaats,
  onVerplaatsAnnuleer,
}: {
  id: number;
  magBewerken: boolean;
  clusters: any[];
  onClose: () => void;
  onWijziging: () => void;
  verplaatsModus: boolean;
  onVerplaats: () => void;
  onVerplaatsAnnuleer: () => void;
}) {
  const { data: v, isLoading, refetch } = useGetVoorziening(id);
  const addFoto = useAddFoto();
  const delFoto = useDeleteFoto();
  const updateStatus = useUpdateVoorzieningStatus();
  const updateVoorziening = useUpdateVoorziening();

  const GEEN_CLUSTER = "__geen__";
  async function wijzigCluster(waarde: string) {
    const cluster_id = waarde === GEEN_CLUSTER ? null : Number(waarde);
    await updateVoorziening.mutateAsync({ id, data: { cluster_id } });
    await refetch();
    onWijziging();
  }

  async function wijzigStatus(status: string) {
    await updateStatus.mutateAsync({ id, data: { status } });
    await refetch();
    onWijziging();
  }

  const fotos = ((v as any)?.fotos ?? []) as any[];
  const voor = fotos.filter((f) => f.fase === "voor");
  const na = fotos.filter((f) => f.fase === "na");

  async function voegToe(fase: "voor" | "na", url: string) {
    await addFoto.mutateAsync({ id, data: { fase, url } });
    refetch();
  }

  async function verwijder(fotoId: number) {
    await delFoto.mutateAsync({ id, fotoId });
    refetch();
  }

  const stijl = v ? (TYPEN[(v as any).type] ?? { kleur: "#94a3b8", label: (v as any).type }) : null;

  return (
    <div className="w-80 flex-shrink-0 border rounded-lg bg-white p-4 flex flex-col gap-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {stijl && (
            <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: stijl.kleur }} />
          )}
          <span className="font-semibold text-sm">{(v as any)?.objectnummer ?? "…"}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isLoading || !v ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-muted-foreground">Type</span>
            <span className="font-medium">{TYPEN[(v as any).type]?.label ?? (v as any).type}</span>

            <span className="text-muted-foreground self-center">Status</span>
            {magBewerken ? (
            <Select
              value={(v as any).status}
              onValueChange={wijzigStatus}
              disabled={updateStatus.isPending}
            >
              <SelectTrigger className="h-8 w-fit min-w-[140px] text-xs">
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{ color: STATUSKLEUREN[(v as any).status] }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: STATUSKLEUREN[(v as any).status] ?? "#94a3b8" }}
                  />
                  {STATUSLABEL[(v as any).status] ?? (v as any).status}
                </span>
              </SelectTrigger>
              <SelectContent>
                {Object.keys(STATUSLABEL).map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: STATUSKLEUREN[s] }}
                      />
                      {STATUSLABEL[s]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 text-sm font-medium"
                style={{ color: STATUSKLEUREN[(v as any).status] }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: STATUSKLEUREN[(v as any).status] ?? "#94a3b8" }}
                />
                {STATUSLABEL[(v as any).status] ?? (v as any).status}
              </span>
            )}

            <span className="text-muted-foreground">Wand/plafond</span>
            <span className="font-medium capitalize">{(v as any).wand_of_plafond ?? "—"}</span>

            <span className="text-muted-foreground self-center">Cluster</span>
            {magBewerken ? (
              <Select
                value={(v as any).cluster_id != null ? String((v as any).cluster_id) : GEEN_CLUSTER}
                onValueChange={wijzigCluster}
                disabled={updateVoorziening.isPending}
              >
                <SelectTrigger className="h-8 w-fit min-w-[140px] text-xs">
                  <SelectValue placeholder="Geen cluster" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GEEN_CLUSTER}>Geen cluster</SelectItem>
                  {clusters.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.kleur || STANDAARD_CLUSTERKLEUR }} />
                        {c.naam}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="font-medium">{(v as any).cluster_naam ?? "—"}</span>
            )}

            <span className="text-muted-foreground">Datum</span>
            <span className="font-medium">{(v as any).installatie_datum ? String((v as any).installatie_datum).slice(0, 10) : "—"}</span>

            <span className="text-muted-foreground">Monteur uitvoering</span>
            <span className="font-medium">{(v as any).monteur_naam ?? "—"}</span>

            <span className="text-muted-foreground">Monteur maker</span>
            <span className="font-medium">{(v as any).maker_monteur_naam ?? "—"}</span>

            {(v as any).ruimte && (
              <>
                <span className="text-muted-foreground">Ruimte</span>
                <span className="font-medium">{(v as any).ruimte}</span>
              </>
            )}

            {(v as any).locatie_omschrijving && (
              <>
                <span className="text-muted-foreground">Locatie</span>
                <span className="font-medium">{(v as any).locatie_omschrijving}</span>
              </>
            )}
          </div>

          {/* Foto's voor */}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Foto's voor</span>
              {magBewerken && <FotoUploader label="Toevoegen" onUploaded={(p) => voegToe("voor", p)} />}
            </div>
            <FotoGalerij fotos={voor} onVerwijder={magBewerken ? verwijder : undefined} />
          </div>

          {/* Foto's na */}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Foto's na</span>
              {magBewerken && <FotoUploader label="Toevoegen" onUploaded={(p) => voegToe("na", p)} />}
            </div>
            <FotoGalerij fotos={na} onVerwijder={magBewerken ? verwijder : undefined} />
          </div>

          <div className="flex flex-col gap-2 mt-auto pt-3 border-t">
            {magBewerken && (verplaatsModus ? (
              <Button size="sm" variant="destructive" onClick={onVerplaatsAnnuleer}>
                <X className="h-4 w-4 mr-1" />Verplaatsen annuleren
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={onVerplaats}>
                <Move className="h-4 w-4 mr-1" />Verplaatsen
              </Button>
            ))}
            <Button size="sm" variant="default" asChild>
              <Link href={`/voorzieningen/${id}`} onClick={() => onWijziging()}>Volledige details</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// Galerij met bestaande foto's (uit DB) + verwijderknop
function FotoGalerij({ fotos, onVerwijder }: { fotos: any[]; onVerwijder?: (fotoId: number) => void }) {
  if (fotos.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Nog geen foto's</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {fotos.map((f) => (
        <div key={f.id} className="relative group">
          <a href={`/api/storage${f.url}`} target="_blank" rel="noreferrer">
            <img
              src={`/api/storage${f.url}`}
              alt={f.beschrijving ?? "Foto"}
              className="h-16 w-16 object-cover rounded border"
            />
          </a>
          {onVerwijder && (
            <button
              type="button"
              onClick={() => onVerwijder(f.id)}
              className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full p-0.5 opacity-90 hover:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

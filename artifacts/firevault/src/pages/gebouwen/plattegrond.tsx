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
  useListGebruikers,
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
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, X, ZoomIn, ZoomOut, RotateCcw, Map, FileText, Trash2, Image as ImageIcon, Loader2, Spline, Check, Move, Archive, ArchiveRestore } from "lucide-react";
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

const STATUSKLEUREN: Record<string, string> = {
  concept:       "#94a3b8",
  in_uitvoering: "#3b82f6",
  opgeleverd:    "#14b8a6",
  goedgekeurd:   "#22c55e",
  afgekeurd:     "#ef4444",
  in_onderhoud:  "#f97316",
  vervallen:     "#6b7280",
};

const STATUSLABEL: Record<string, string> = {
  concept:       "Concept",
  in_uitvoering: "In uitvoering",
  opgeleverd:    "Opgeleverd",
  goedgekeurd:   "Goedgekeurd",
  afgekeurd:     "Afgekeurd",
  in_onderhoud:  "In onderhoud",
  vervallen:     "Vervallen",
};

const WBDBO_OPTIES = ["20", "30", "60", "90", "120"];
const SCHEIDING_CLASSIFICATIES = ["WRD", "EW", "EI", "E", "R", "Sa"];
const WRD_OPTIES = ["30"];
const WAND_PLAFOND_OPTIES = ["wand", "plafond"];

const WERENDHEID_OPTIES = [
  { waarde: "WRD30", label: "WRD 30 — rookwerend 30 min" },
  { waarde: "EW20",  label: "EW 20 — brandwerend WBDBO 20 min" },
  { waarde: "EW30",  label: "EW 30 — brandwerend WBDBO 30 min" },
  { waarde: "EW60",  label: "EW 60 — brandwerend WBDBO 60 min" },
  { waarde: "EI30",  label: "EI 30 — brandwerend 30 min" },
  { waarde: "EI60",  label: "EI 60 — brandwerend 60 min" },
];

const RUIMTE_STANDAARD = [
  "entree", "keuken", "badkamer", "toilet", "slaapkamer", "woonkamer",
  "trappenhuis", "gang", "meterkast", "zolder", "berging", "kelder",
  "parkeergarage", "buitenruimte",
];

const GEEN_RUIMTE_VAL = "__geen__";
const GEEN_WERENDHEID_VAL = "__geen__";

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

function fromWerendheid(w: string): { classificatie: string; wbdbo?: string; wrd?: string } {
  if (!w || w === GEEN_WERENDHEID_VAL) return { classificatie: "60" };
  if (w.startsWith("WRD")) return { classificatie: "60", wrd: w.slice(3) };
  if (w.startsWith("EW"))  return { classificatie: "60", wbdbo: w.slice(2) };
  if (w.startsWith("EI"))  return { classificatie: w.slice(2) };
  return { classificatie: "60" };
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
  locatie_x: number;
  locatie_y: number;
};

type ViewState = { x: number; y: number; zoom: number };

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
  const volgnummer = spotVolgnummer(v.objectnummer);
  const isPlafond = v.wand_of_plafond === "plafond";
  const L = r + 11;

  return (
    <g
      transform={`translate(${v.locatie_x}, ${v.locatie_y})`}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ cursor: "pointer" }}
    >
      <circle r={r + 5} fill={stijl.kleur} opacity={0.25} />
      <circle r={r} fill={STATUSKLEUREN[v.status] ?? "#94a3b8"} stroke={geselecteerd ? "#fff" : stijl.ring} strokeWidth={geselecteerd ? 3 : 1.5} />
      {isPlafond && (
        <g style={{ pointerEvents: "none" }}>
          <line x1={0} y1={-L} x2={0} y2={L} stroke="#fff" strokeWidth={5} strokeLinecap="round" />
          <line x1={0} y1={-L} x2={0} y2={L} stroke="#1e293b" strokeWidth={2.5} strokeLinecap="round" />
          <polygon points={`0,${-L - 3} -6,${-L + 8} 6,${-L + 8}`} fill="#1e293b" stroke="#fff" strokeWidth={1.2} strokeLinejoin="round" />
          <polygon points={`0,${L + 3} -6,${L - 8} 6,${L - 8}`} fill="#1e293b" stroke="#fff" strokeWidth={1.2} strokeLinejoin="round" />
        </g>
      )}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={volgnummer.length > 2 ? 8 : 10}
        fontWeight="700"
        fill="#fff"
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

function spotVolgnummer(objectnummer: string): string {
  const m = objectnummer?.match(/(\d+)$/);
  return m ? m[1] : (objectnummer ?? "");
}

const LEEG_FORM = {
  objectnummer: "",
  type: "",
  werendheid: "",
  ruimte: "",
  huisnummer: "",
  opmerkingen: "",
  installatie_datum: "",
  status: "in_uitvoering",
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
  const [ruimteOpties] = useState(() => getRuimteVolgorde());

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
  const { data: gebruikers } = useListGebruikers();
  const maakVoorziening = useCreateVoorziening();
  const updateVoorziening = useUpdateVoorziening();
  const updateVerdieping = useUpdateVerdieping();
  const { data: volgendSpot, refetch: refetchSpotnummer } = useGetVolgendSpotnummer(Number(id));
  const addFoto = useAddFoto();

  const { data: scheidingen, refetch: refetchScheidingen } = useListScheidingen(Number(verdiepingId));
  const maakScheiding = useCreateScheiding();
  const verwijderScheiding = useDeleteScheiding();

  const monteurs = (gebruikers ?? []).filter((g: any) => g.rol === "monteur");

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
      locatie_x: Number(v.locatie_x),
      locatie_y: Number(v.locatie_y),
    }));

  const nietGeplaatst = (voorzieningen ?? []).filter((v: any) => v.locatie_x == null || v.locatie_y == null);

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
    if (!plaatsenModus) return;
    const klemX = Math.min(W, Math.max(0, svgX));
    const klemY = Math.min(H, Math.max(0, svgY));
    setNieuwLocatie({ x: Math.round(klemX), y: Math.round(klemY) });
    const nu = new Date();
    const vandaag = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}-${String(nu.getDate()).padStart(2, "0")}`;
    setNieuwForm({
      ...LEEG_FORM,
      objectnummer: volgendSpot?.spotnummer ?? "",
      installatie_datum: vandaag,
    });
    setNieuwDialoog(true);
  }, [plaatsenModus, tekenModus, verplaatsModus, geselecteerdId, view, W, H, volgendSpot, gebruiker, monteurs]);

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
    if (!panning) return;
    setView((v) => ({
      ...v,
      x: panStart.vx + (e.clientX - panStart.mx),
      y: panStart.vy + (e.clientY - panStart.my),
    }));
  }, [panning, panStart]);

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

  // ---- Voorziening aanmaken ----
  async function maakNieuw(e: React.FormEvent) {
    e.preventDefault();
    if (!nieuwForm.objectnummer || !nieuwForm.type) return;

    if (nieuwForm.ruimte && nieuwForm.ruimte !== GEEN_RUIMTE_VAL) {
      registreerRuimteGebruik(nieuwForm.ruimte);
    }
    const wv = fromWerendheid(nieuwForm.werendheid);

    const aangemaakt: any = await maakVoorziening.mutateAsync({
      data: {
        objectnummer: nieuwForm.objectnummer,
        type: nieuwForm.type,
        status: nieuwForm.status || "in_uitvoering",
        classificatie: wv.classificatie,
        wbdbo: wv.wbdbo,
        wrd: wv.wrd,
        ruimte: nieuwForm.ruimte && nieuwForm.ruimte !== GEEN_RUIMTE_VAL ? nieuwForm.ruimte : undefined,
        huisnummer: nieuwForm.huisnummer.trim() || undefined,
        opmerkingen: nieuwForm.opmerkingen.trim() || undefined,
        installatie_datum: nieuwForm.installatie_datum || undefined,
        label_ids: nieuwLabelIds,
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
    }

    setNieuwDialoog(false);
    setPlaatsenModus(false);
    setNieuwForm({ ...LEEG_FORM });
    setNieuwLabelIds([]);
    setVoorFotos([]);
    setNaFotos([]);
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
    }
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

          {magBewerken && (
            <>
              <Button
                variant={plaatsenModus ? "destructive" : "default"}
                size="sm"
                onClick={() => { setPlaatsenModus(!plaatsenModus); setGeselecteerdId(null); if (tekenModus) annuleerTekenen(); }}
              >
                {plaatsenModus ? (<><X className="h-4 w-4 mr-1" />Annuleren</>) : (<><Plus className="h-4 w-4 mr-1" />Plaatsen</>)}
              </Button>

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
          Klik op de plattegrond om een nieuwe voorziening te plaatsen.
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
                    {s.waarde && markers.map((m, mi) => (
                      <g key={mi} transform={`translate(${m.x}, ${m.y})`}>
                        <circle r={18} fill="#fff" stroke={kleur} strokeWidth={geselecteerd ? 4 : 3} />
                        <text x={0} y={0} textAnchor="middle" dominantBaseline="central"
                          fontSize={String(s.waarde).length >= 6 ? 8 : String(s.waarde).length >= 5 ? 9.5 : 11} fontWeight={800} fill={kleur}>{s.waarde}</text>
                      </g>
                    ))}
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

              {/* Voorzieningen */}
              {geplaatst.map((v) => (
                <VoorzieningIcoon
                  key={v.id}
                  v={v}
                  geselecteerd={geselecteerdId === v.id}
                  onClick={() => setGeselecteerdId(geselecteerdId === v.id ? null : v.id)}
                />
              ))}

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
              <p className="text-muted-foreground font-medium">Geen voorzieningen op kaart</p>
              <p className="text-xs text-muted-foreground mt-1">Klik op "Plaatsen" om objecten toe te voegen</p>
            </div>
          )}
        </div>

        {/* Zijpaneel: detail geselecteerde voorziening */}
        {geselecteerdId != null && (
          <SpotDetail
            id={geselecteerdId}
            magBewerken={magBewerken}
            onClose={() => { setGeselecteerdId(null); setVerplaatsModus(false); }}
            onWijziging={() => refetch()}
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

            {/* Applicatie */}
            <div>
              <Label>Applicatie *</Label>
              <ApplicatiePicker
                value={nieuwForm.type}
                onValueChange={(v) => {
                  setNieuwForm((f) => ({ ...f, type: v }));
                  setNieuwLabelIds([]);
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Kies de applicatie uit de centrale bibliotheek.
              </p>
            </div>

            {/* Toepassing (alleen als applicatie gekozen) */}
            {nieuwForm.type && (
              <div className="border rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">Toepassing</p>
                <p className="text-xs text-muted-foreground">
                  Selecteer de gebruikte producten of systemen bij deze spot.
                </p>
                <ToepassingMultiSelect
                  typeCode={nieuwForm.type}
                  selectedIds={nieuwLabelIds}
                  onSelectionChange={setNieuwLabelIds}
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
              {/* Brand- of rookwerendheid */}
              <div className="col-span-2">
                <Label>Brand- of rookwerendheid</Label>
                <Select
                  value={nieuwForm.werendheid || GEEN_WERENDHEID_VAL}
                  onValueChange={(v) => setNieuwForm((f) => ({ ...f, werendheid: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Kies werendheid..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GEEN_WERENDHEID_VAL}>Niet opgegeven</SelectItem>
                    {WERENDHEID_OPTIES.map((w) => (
                      <SelectItem key={w.waarde} value={w.waarde}>
                        <span className="font-mono text-xs mr-2">{w.waarde}</span>
                        {w.label.split(" — ")[1]}
                      </SelectItem>
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

              {/* Aanmaker (leesbaar) + beheerder-only: monteur toewijzen */}
              <div>
                <Label>Geplaatst door</Label>
                <Input value={gebruiker?.naam ?? ""} readOnly className="bg-muted" />
              </div>

              {isBeheerder && (
                <div className="col-span-2">
                  <Label>Monteur toewijzen (optioneel)</Label>
                  <Select
                    value={(nieuwForm as any).monteur_id || "geen"}
                    onValueChange={(v) => setNieuwForm((f) => ({ ...f, monteur_id: v === "geen" ? "" : v } as any))}
                  >
                    <SelectTrigger><SelectValue placeholder="Kies monteur" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="geen">Niet toegewezen</SelectItem>
                      {monteurs.map((m: any) => (
                        <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

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

            {/* Foto's voor / na */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Foto's voor</Label>
                  <FotoUploader label="Toevoegen" onUploaded={(p) => setVoorFotos((a) => [...a, p])} />
                </div>
                <FotoStrip paths={voorFotos} onVerwijder={(i) => setVoorFotos((a) => a.filter((_, idx) => idx !== i))} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Foto's na</Label>
                  <FotoUploader label="Toevoegen" onUploaded={(p) => setNaFotos((a) => [...a, p])} />
                </div>
                <FotoStrip paths={naFotos} onVerwijder={(i) => setNaFotos((a) => a.filter((_, idx) => idx !== i))} />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => sluitDialoog(false)}>
                Annuleren
              </Button>
              <Button type="submit" disabled={!nieuwForm.type || maakVoorziening.isPending || addFoto.isPending}>
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

    </div>
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
  onClose,
  onWijziging,
  verplaatsModus,
  onVerplaats,
  onVerplaatsAnnuleer,
}: {
  id: number;
  magBewerken: boolean;
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

            <span className="text-muted-foreground">WBDBO</span>
            <span className="font-medium">{(v as any).wbdbo ? `${(v as any).wbdbo} min` : "—"}</span>

            <span className="text-muted-foreground">WRD</span>
            <span className="font-medium">{(v as any).wrd ? `${(v as any).wrd} min` : "—"}</span>

            <span className="text-muted-foreground">Wand/plafond</span>
            <span className="font-medium capitalize">{(v as any).wand_of_plafond ?? "—"}</span>

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

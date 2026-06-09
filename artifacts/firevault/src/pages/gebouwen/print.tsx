import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  useGetGebouw,
  useListGebouwPartijen,
  useListGebouwToewijzingen,
  useListOnderhoud,
  useListInspecties,
  useListVoorzieningenOpVerdieping,
  useListScheidingen,
  type Verdieping,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ─── Constanten ─────────────────────────────────────────────────────────────

const TYPEN: Record<string, { kleur: string; ring: string; label: string }> = {
  branddeur:        { kleur: "#ef4444", ring: "#b91c1c", label: "Branddeur" },
  doorvoering:      { kleur: "#f97316", ring: "#c2410c", label: "Doorvoering" },
  brandklep:        { kleur: "#eab308", ring: "#a16207", label: "Brandklep" },
  kitvoeg:          { kleur: "#84cc16", ring: "#4d7c0f", label: "Kitvoeg" },
  manchet:          { kleur: "#10b981", ring: "#065f46", label: "Manchet" },
  brandwerend_glas: { kleur: "#3b82f6", ring: "#1d4ed8", label: "Brandwerend Glas" },
  coating:          { kleur: "#8b5cf6", ring: "#5b21b6", label: "Coating" },
  luik:             { kleur: "#ec4899", ring: "#9d174d", label: "Luik" },
  plaatconstructie: { kleur: "#78716c", ring: "#44403c", label: "Plaatconstructie" },
  schuifdeur:       { kleur: "#dc2626", ring: "#991b1b", label: "Schuifdeur" },
  puiconstructie:   { kleur: "#6366f1", ring: "#3730a3", label: "Puiconstructie" },
  dakdoorvoer:      { kleur: "#14b8a6", ring: "#0f766e", label: "Dakdoorvoer" },
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

const ONDERHOUD_STATUSLABEL: Record<string, string> = {
  open:         "Open",
  in_uitvoering:"In uitvoering",
  voltooid:     "Voltooid",
  geannuleerd:  "Geannuleerd",
};

const PRIORITEIT_LABEL: Record<string, string> = {
  laag:    "Laag",
  normaal: "Normaal",
  hoog:    "Hoog",
  kritiek: "Kritiek",
};

const INSPECTIE_TYPELABEL: Record<string, string> = {
  oplevering: "Oplevering",
  periodiek:  "Periodiek",
  jaarlijks:  "Jaarlijks",
  herstel:    "Herstel",
};

const INSPECTIE_STATUSLABEL: Record<string, string> = {
  gepland:       "Gepland",
  in_uitvoering: "In uitvoering",
  afgerond:      "Afgerond",
  geannuleerd:   "Geannuleerd",
};

const PARTIJ_TYPELABEL: Record<string, string> = {
  eigenaar:       "Eigenaar",
  gebruiker:      "Gebruiker",
  opdrachtgever:  "Opdrachtgever",
  aanvrager:      "Aanvrager",
};

const CANVAS_W = 1200;
const CANVAS_H = 800;

// Raster-tegels: vaste vakgrootte in SVG-coördinaten
const RASTER_B = 1200;
const RASTER_H = 1200;

// Clusters: spot-groepering
const CLUSTER_RADIUS = 260;   // max afstand om spots samen te voegen
const MIN_CLUSTER    = 3;     // minimaal aantal spots per cluster
const CLUSTER_MARGE  = 200;   // padding rondom cluster-bbox

// ─── Types ───────────────────────────────────────────────────────────────────

type Punt = { x: number; y: number };

type SVGVoorziening = {
  id: number;
  objectnummer: string;
  type: string;
  status: string;
  wand_of_plafond?: string;
  locatie_x: number;
  locatie_y: number;
};

type Tegel = {
  col: number; rij: number; code: string;
  x: number; y: number; w: number; h: number;
};

type Cluster = {
  idx: number; spots: SVGVoorziening[];
  x: number; y: number; w: number; h: number;
};

// ─── Hulpfuncties ────────────────────────────────────────────────────────────

function kolomLabel(col: number): string {
  let label = "";
  let n = col;
  for (;;) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    if (n < 26) break;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

function berekenRasterTegels(W: number, H: number): Tegel[] {
  const cols  = Math.max(1, Math.ceil(W / RASTER_B));
  const rijen = Math.max(1, Math.ceil(H / RASTER_H));
  const tegels: Tegel[] = [];
  for (let r = 0; r < rijen; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * RASTER_B, y = r * RASTER_H;
      const w = Math.min(RASTER_B, W - x), h = Math.min(RASTER_H, H - y);
      if (w > 0 && h > 0)
        tegels.push({ col: c, rij: r, code: `${kolomLabel(c)}${r + 1}`, x, y, w, h });
    }
  }
  return tegels;
}

function detecteerClusters(spots: SVGVoorziening[], W: number, H: number): Cluster[] {
  if (spots.length < MIN_CLUSTER) return [];
  const bezoekt = new Set<number>();
  const groepen: SVGVoorziening[][] = [];

  for (const spot of spots) {
    if (bezoekt.has(spot.id)) continue;
    const groep: SVGVoorziening[] = [];
    const wachtrij: SVGVoorziening[] = [spot];
    bezoekt.add(spot.id);
    while (wachtrij.length > 0) {
      const huidig = wachtrij.shift()!;
      groep.push(huidig);
      for (const andere of spots) {
        if (bezoekt.has(andere.id)) continue;
        if (Math.hypot(andere.locatie_x - huidig.locatie_x, andere.locatie_y - huidig.locatie_y) <= CLUSTER_RADIUS) {
          bezoekt.add(andere.id);
          wachtrij.push(andere);
        }
      }
    }
    if (groep.length >= MIN_CLUSTER) groepen.push(groep);
  }

  // Alleen clusters die aanzienlijk kleiner zijn dan een raster-tile (anders dekt raster al af)
  const maxOpp = RASTER_B * RASTER_H * 0.55;

  return groepen
    .map((groep, idx) => {
      const minX = Math.min(...groep.map(s => s.locatie_x));
      const maxX = Math.max(...groep.map(s => s.locatie_x));
      const minY = Math.min(...groep.map(s => s.locatie_y));
      const maxY = Math.max(...groep.map(s => s.locatie_y));
      const x = Math.max(0, minX - CLUSTER_MARGE);
      const y = Math.max(0, minY - CLUSTER_MARGE);
      const w = Math.min(maxX - minX + 2 * CLUSTER_MARGE, W - x);
      const h = Math.min(maxY - minY + 2 * CLUSTER_MARGE, H - y);
      return { idx: idx + 1, spots: groep, x, y, w, h };
    })
    .filter(c => c.w > 0 && c.h > 0 && c.w * c.h < maxOpp);
}

function spotVolgnummer(objectnummer: string): string {
  const m = objectnummer?.match(/(\d+)$/);
  return m ? m[1] : objectnummer ?? "";
}

function datumNL(waarde?: string | null): string {
  if (!waarde) return "—";
  const d = new Date(waarde);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("nl-NL");
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
  return afstanden.map((d) => {
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
  });
}

// ─── Basiscomponenten ────────────────────────────────────────────────────────

function GridAchtergrond({ w, h }: { w: number; h: number }) {
  const stapKlein = 40, stapGroot = 200;
  return (
    <g>
      <defs>
        <pattern id="prt-grid-klein" width={stapKlein} height={stapKlein} patternUnits="userSpaceOnUse">
          <path d={`M ${stapKlein} 0 L 0 0 0 ${stapKlein}`} fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
        </pattern>
        <pattern id="prt-grid-groot" width={stapGroot} height={stapGroot} patternUnits="userSpaceOnUse">
          <rect width={stapGroot} height={stapGroot} fill="url(#prt-grid-klein)" />
          <path d={`M ${stapGroot} 0 L 0 0 0 ${stapGroot}`} fill="none" stroke="#cbd5e1" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={w} height={h} fill="url(#prt-grid-groot)" />
      <rect x={20} y={20} width={w - 40} height={h - 40} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6 3" rx="4" />
    </g>
  );
}

function SpotIcoon({ v }: { v: SVGVoorziening }) {
  const stijl = TYPEN[v.type] ?? { kleur: "#94a3b8", ring: "#475569", label: v.type };
  const r = 16;
  const volgnummer = spotVolgnummer(v.objectnummer);
  const isPlafond = v.wand_of_plafond === "plafond";
  const L = r + 11;
  return (
    <g transform={`translate(${v.locatie_x}, ${v.locatie_y})`}>
      <circle r={r + 5} fill={stijl.kleur} opacity={0.25} />
      <circle r={r} fill={STATUSKLEUREN[v.status] ?? "#94a3b8"} stroke={stijl.ring} strokeWidth={1.5} />
      {isPlafond && (
        <g>
          <line x1={0} y1={-L} x2={0} y2={L} stroke="#fff" strokeWidth={5} strokeLinecap="round" />
          <line x1={0} y1={-L} x2={0} y2={L} stroke="#1e293b" strokeWidth={2.5} strokeLinecap="round" />
        </g>
      )}
      <text textAnchor="middle" dominantBaseline="central" fontSize={volgnummer.length > 2 ? 8 : 10} fontWeight="700" fill="#fff">
        {volgnummer}
      </text>
      <text y={r + 13} textAnchor="middle" fontSize={9} fill="#1e293b" fontWeight="500" stroke="#fff" strokeWidth={2.5} style={{ paintOrder: "stroke" }}>
        {v.objectnummer}
      </text>
    </g>
  );
}

function Minimap({
  W, H, x, y, w, h, label,
}: { W: number; H: number; x: number; y: number; w: number; h: number; label: string }) {
  const MM_B = 88, MM_H = 66;
  const schaal = Math.min(MM_B / W, MM_H / H);
  const tw = W * schaal, th = H * schaal;
  const rx = x * schaal, ry = y * schaal, rw = w * schaal, rh = h * schaal;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
      <svg width={tw} height={th} style={{ display: "block", border: "1px solid #e2e8f0", borderRadius: 3 }}>
        <rect x={0} y={0} width={tw} height={th} fill="#f8fafc" />
        <rect x={rx} y={ry} width={rw} height={rh} fill="rgba(242,59,13,0.18)" stroke="#F23B0D" strokeWidth={1.5} />
      </svg>
      <span style={{ fontSize: 9, fontWeight: 700, color: "#F23B0D" }}>{label}</span>
    </div>
  );
}

// Raster-overlay voor de overzichtsplattegrond
function RasterOverlay({ tegels, W, H }: { tegels: Tegel[]; W: number; H: number }) {
  const cols = Math.max(1, Math.ceil(W / RASTER_B));
  const rijen = Math.max(1, Math.ceil(H / RASTER_H));
  const labelGrootte = Math.min(W, H) * 0.035;
  const elementen: React.ReactNode[] = [];

  // Verticale lijnen
  for (let c = 1; c < cols; c++) {
    const lx = c * RASTER_B;
    elementen.push(<line key={`vl${c}`} x1={lx} y1={0} x2={lx} y2={H} stroke="#64748b" strokeWidth={2} strokeDasharray="10 6" opacity={0.6} />);
  }
  // Horizontale lijnen
  for (let r = 1; r < rijen; r++) {
    const ly = r * RASTER_H;
    elementen.push(<line key={`hl${r}`} x1={0} y1={ly} x2={W} y2={ly} stroke="#64748b" strokeWidth={2} strokeDasharray="10 6" opacity={0.6} />);
  }
  // Kolomlabels bovenaan
  for (let c = 0; c < cols; c++) {
    const cx = c * RASTER_B + Math.min(RASTER_B, W - c * RASTER_B) / 2;
    elementen.push(
      <text key={`cl${c}`} x={cx} y={labelGrootte * 1.2} textAnchor="middle" fontSize={labelGrootte}
        fontWeight={700} fill="#F23B0D" opacity={0.85}>{kolomLabel(c)}</text>
    );
  }
  // Rijlabels links
  for (let r = 0; r < rijen; r++) {
    const cy = r * RASTER_H + Math.min(RASTER_H, H - r * RASTER_H) / 2;
    elementen.push(
      <text key={`rl${r}`} x={labelGrootte * 0.6} y={cy} textAnchor="middle" dominantBaseline="central"
        fontSize={labelGrootte} fontWeight={700} fill="#F23B0D" opacity={0.85}>{r + 1}</text>
    );
  }
  // Vak-codes in elke cel (klein, subtiel)
  for (const t of tegels) {
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    elementen.push(
      <text key={`vc${t.code}`} x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fontSize={labelGrootte * 1.8} fontWeight={800} fill="#F23B0D" opacity={0.07}>
        {t.code}
      </text>
    );
  }
  return <g style={{ pointerEvents: "none" }}>{elementen}</g>;
}

// Logo in de rechterbovenhoek van een tegel-viewBox
function LogoOpTegel({ x, y, w, h, logoSrc }: { x: number; y: number; w: number; h: number; logoSrc: string }) {
  const logoB  = Math.max(w, h) * 0.13;
  const logoH  = logoB / 2.59;
  const logoPad = Math.max(w, h) * 0.025;
  return (
    <image
      href={logoSrc}
      x={x + w - logoB - logoPad}
      y={y + logoPad}
      width={logoB}
      height={logoH}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

// Rendert scheidingen als SVG-groepen
function renderScheidingen(scheidingen: any[] | undefined, W: number, H: number): React.ReactNode {
  return (scheidingen ?? []).map((s: any) => {
    let punten: Punt[] = [];
    try { punten = JSON.parse(s.punten); } catch { punten = []; }
    if (punten.length < 2) return null;
    const kleur = s.kleur || SCHEIDING_TYPEN[s.type]?.kleur || "#dc2626";
    const markers = markerPosities(punten, Math.max(W, H) / 4.6);
    const puntenStr = punten.map((p) => `${p.x},${p.y}`).join(" ");
    return (
      <g key={`s${s.id}`}>
        <polyline points={puntenStr} fill="none" stroke={kleur} strokeWidth={4}
          strokeDasharray={s.type === "rook" ? "12 8" : undefined}
          strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
        {s.waarde && markers.map((m, mi) => (
          <g key={mi} transform={`translate(${m.x}, ${m.y})`}>
            <circle r={18} fill="#fff" stroke={kleur} strokeWidth={3} />
            <text x={0} y={0} textAnchor="middle" dominantBaseline="central"
              fontSize={String(s.waarde).length >= 6 ? 8 : String(s.waarde).length >= 5 ? 9.5 : 11}
              fontWeight={800} fill={kleur}>{s.waarde}</text>
          </g>
        ))}
      </g>
    );
  });
}

// ─── PrintVerdieping ─────────────────────────────────────────────────────────

function PrintVerdieping({
  verdieping,
  onGereed,
  gebouwNaam,
  exportDatum,
  logoSrc,
  toonOverzicht,
  toonRaster,
  toonClusters,
}: {
  verdieping: Verdieping;
  onGereed: () => void;
  gebouwNaam: string;
  exportDatum: string;
  logoSrc: string;
  toonOverzicht: boolean;
  toonRaster: boolean;
  toonClusters: boolean;
}) {
  const [pdfBeeld, setPdfBeeld]   = useState<string | null>(null);
  const [pdfDims, setPdfDims]     = useState<{ w: number; h: number } | null>(null);
  const [beeldKlaar, setBeeldKlaar] = useState(false);
  const gereedGemeld = useRef(false);

  const plattegrondUrl = verdieping.plattegrond_url;
  const { data: voorzieningen } = useListVoorzieningenOpVerdieping(verdieping.id);
  const { data: scheidingen }   = useListScheidingen(verdieping.id);
  const dataKlaar = voorzieningen !== undefined;

  useEffect(() => {
    if (!plattegrondUrl) {
      setPdfBeeld(null); setPdfDims(null); setBeeldKlaar(true); return;
    }
    setBeeldKlaar(false);
    let geannuleerd = false;
    let laadTaak: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    (async () => {
      try {
        let dataUrl: string, dims: { w: number; h: number };
        try {
          laadTaak = pdfjsLib.getDocument({ url: `/api/storage${plattegrondUrl}` });
          const pdf = await laadTaak.promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width  = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          dataUrl = canvas.toDataURL("image/png");
          dims = { w: canvas.width, h: canvas.height };
        } catch {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error("Afbeelding laden mislukt"));
            i.src = `/api/storage${plattegrondUrl}`;
          });
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          dataUrl = canvas.toDataURL("image/png");
          dims = { w: canvas.width, h: canvas.height };
        }
        if (geannuleerd) return;
        setPdfBeeld(dataUrl); setPdfDims(dims); setBeeldKlaar(true);
      } catch {
        if (!geannuleerd) { setPdfBeeld(null); setPdfDims(null); setBeeldKlaar(true); }
      }
    })();
    return () => { geannuleerd = true; laadTaak?.destroy().catch(() => undefined); };
  }, [plattegrondUrl]);

  useEffect(() => {
    if (beeldKlaar && dataKlaar && !gereedGemeld.current) {
      gereedGemeld.current = true;
      onGereed();
    }
  }, [beeldKlaar, dataKlaar, onGereed]);

  const W = pdfDims?.w ?? CANVAS_W;
  const H = pdfDims?.h ?? CANVAS_H;

  const geplaatst: SVGVoorziening[] = (voorzieningen ?? [])
    .filter((v: any) => v.locatie_x != null && v.locatie_y != null)
    .map((v: any) => ({
      id: v.id,
      objectnummer: v.objectnummer,
      type: v.type,
      status: v.status,
      wand_of_plafond: v.wand_of_plafond,
      locatie_x: Number(v.locatie_x),
      locatie_y: Number(v.locatie_y),
    }));

  const alleVoorzieningen = (voorzieningen ?? []) as any[];

  // Raster en clusters
  const tegels   = berekenRasterTegels(W, H);
  const clusters = detecteerClusters(geplaatst, W, H);

  // Logo-positie op overzichtsplattegrond (uit verdieping of standaard rechtsboven)
  const vd = verdieping as any;
  const logoPad = Math.max(W, H) * 0.015;
  const logoB   = vd.logo_breedte ?? Math.max(W, H) * 0.16;
  const logoHH  = logoB / 2.59;
  const logoX   = vd.logo_x != null ? Number(vd.logo_x) : W - logoB - logoPad;
  const logoY   = vd.logo_y != null ? Number(vd.logo_y) : logoPad;

  // Helper: legenda voor spots in een bepaalde regio
  function tegelLegende(spots: SVGVoorziening[]) {
    const statussen = [...new Set(spots.map(v => v.status))];
    if (statussen.length === 0) return null;
    return (
      <div className="prt-tegel-legende">
        {statussen.map(s => (
          <span key={s} className="prt-tegel-status">
            <span className="prt-stip" style={{ backgroundColor: STATUSKLEUREN[s] ?? "#94a3b8" }} />
            {STATUSLABEL[s] ?? s}
            {" "}({spots.filter(v => v.status === s).length})
          </span>
        ))}
      </div>
    );
  }

  // Spots in een rechthoekig gebied
  function spotsIn(x: number, y: number, w: number, h: number) {
    return geplaatst.filter(v =>
      v.locatie_x >= x && v.locatie_x <= x + w &&
      v.locatie_y >= y && v.locatie_y <= y + h
    );
  }

  const heeftSpots = geplaatst.length > 0;
  const toonRasterWerkelijk  = toonRaster  && heeftSpots && tegels.length > 1;
  const toonClustersWerkelijk = toonClusters && heeftSpots && clusters.length > 0;

  return (
    <div className="prt-verdieping">
      <h3 className="prt-subtitel">
        {verdieping.naam}
        <span className="prt-subtitel-meta">
          {alleVoorzieningen.length} {alleVoorzieningen.length === 1 ? "voorziening" : "voorzieningen"}
          {geplaatst.length > 0 ? ` · ${geplaatst.length} op plattegrond` : ""}
          {toonRasterWerkelijk ? ` · ${tegels.length} vakken` : ""}
          {toonClustersWerkelijk ? ` · ${clusters.length} cluster${clusters.length !== 1 ? "s" : ""}` : ""}
        </span>
      </h3>

      {/* ── Overzichtsplattegrond ── */}
      {(toonOverzicht || toonRasterWerkelijk) && (
        <div className="prt-verdieping-blok">
          {toonRasterWerkelijk && (
            <div className="prt-tegel-koplabel">Overzichtsplattegrond met vakindeling</div>
          )}
          <div className="prt-plattegrond">
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
              {pdfBeeld
                ? <image href={pdfBeeld} x={0} y={0} width={W} height={H} />
                : <GridAchtergrond w={W} h={H} />}
              {renderScheidingen(scheidingen, W, H)}
              {geplaatst.map(v => <SpotIcoon key={v.id} v={v} />)}
              {/* Raster-overlay (zichtbaar als raster-modus actief) */}
              {toonRasterWerkelijk && <RasterOverlay tegels={tegels} W={W} H={H} />}
              {/* Logo rechtsboven op de tekening */}
              {pdfBeeld && (
                <image href={logoSrc} x={logoX} y={logoY} width={logoB} height={logoHH}
                  preserveAspectRatio="xMidYMid meet" />
              )}
            </svg>
          </div>
        </div>
      )}

      {/* ── Raster-uitsneden ── */}
      {toonRasterWerkelijk && tegels.map((tegel) => {
        const tegelSpots = spotsIn(tegel.x, tegel.y, tegel.w, tegel.h);
        return (
          <div key={`r-${tegel.code}`} className="prt-tegel-blok">
            <div className="prt-tegel-kop">
              <div className="prt-tegel-kop-info">
                <div className="prt-tegel-titel">
                  Vak {tegel.code} — {verdieping.naam}
                </div>
                <div className="prt-tegel-meta">
                  {gebouwNaam} · Export: {exportDatum}
                </div>
                <div className="prt-tegel-meta" style={{ marginTop: 1 }}>
                  {tegelSpots.length} spot{tegelSpots.length !== 1 ? "s" : ""} in dit vak
                </div>
                {tegelLegende(tegelSpots)}
              </div>
              <Minimap W={W} H={H} x={tegel.x} y={tegel.y} w={tegel.w} h={tegel.h} label={`Vak ${tegel.code}`} />
            </div>
            <div className="prt-plattegrond">
              <svg width="100%" viewBox={`${tegel.x} ${tegel.y} ${tegel.w} ${tegel.h}`}
                preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
                {pdfBeeld
                  ? <image href={pdfBeeld} x={0} y={0} width={W} height={H} />
                  : <GridAchtergrond w={W} h={H} />}
                {renderScheidingen(scheidingen, W, H)}
                {geplaatst.map(v => <SpotIcoon key={v.id} v={v} />)}
                {/* Vak-code badge linksboven */}
                <g>
                  <rect x={tegel.x + 8} y={tegel.y + 8} width={tegel.w * 0.08 + 16} height={tegel.h * 0.06 + 12}
                    rx={6} fill="white" fillOpacity={0.9} />
                  <text x={tegel.x + 16} y={tegel.y + 8 + (tegel.h * 0.06 + 12) / 2}
                    dominantBaseline="central" fontSize={Math.min(tegel.w, tegel.h) * 0.055}
                    fontWeight={800} fill="#F23B0D">{tegel.code}</text>
                </g>
                {/* Logo rechtsboven */}
                <LogoOpTegel x={tegel.x} y={tegel.y} w={tegel.w} h={tegel.h} logoSrc={logoSrc} />
              </svg>
            </div>
          </div>
        );
      })}

      {/* ── Cluster-uitsneden ── */}
      {toonClustersWerkelijk && clusters.map((cluster) => {
        const clusterSpots = cluster.spots;
        const typen = [...new Set(clusterSpots.map(v => v.type))];
        return (
          <div key={`c-${cluster.idx}`} className="prt-tegel-blok">
            <div className="prt-tegel-kop">
              <div className="prt-tegel-kop-info">
                <div className="prt-tegel-titel">
                  Spotcluster {cluster.idx} — {verdieping.naam}
                </div>
                <div className="prt-tegel-meta">
                  {gebouwNaam} · Export: {exportDatum}
                </div>
                <div className="prt-tegel-meta" style={{ marginTop: 1 }}>
                  {clusterSpots.length} spots
                  {typen.length <= 3 ? ` · ${typen.map(t => TYPEN[t]?.label ?? t).join(", ")}` : ""}
                </div>
                {tegelLegende(clusterSpots)}
              </div>
              <Minimap W={W} H={H} x={cluster.x} y={cluster.y} w={cluster.w} h={cluster.h}
                label={`Cluster ${cluster.idx}`} />
            </div>
            <div className="prt-plattegrond">
              <svg width="100%" viewBox={`${cluster.x} ${cluster.y} ${cluster.w} ${cluster.h}`}
                preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
                {pdfBeeld
                  ? <image href={pdfBeeld} x={0} y={0} width={W} height={H} />
                  : <GridAchtergrond w={W} h={H} />}
                {renderScheidingen(scheidingen, W, H)}
                {geplaatst.map(v => <SpotIcoon key={v.id} v={v} />)}
                {/* Cluster-badge */}
                <g>
                  <rect x={cluster.x + 8} y={cluster.y + 8}
                    width={cluster.w * 0.14 + 20} height={cluster.h * 0.07 + 14}
                    rx={6} fill="white" fillOpacity={0.9} />
                  <text x={cluster.x + 18} y={cluster.y + 8 + (cluster.h * 0.07 + 14) / 2}
                    dominantBaseline="central" fontSize={Math.min(cluster.w, cluster.h) * 0.055}
                    fontWeight={800} fill="#F23B0D">
                    Cluster {cluster.idx}
                  </text>
                </g>
                {/* Logo rechtsboven */}
                <LogoOpTegel x={cluster.x} y={cluster.y} w={cluster.w} h={cluster.h} logoSrc={logoSrc} />
              </svg>
            </div>
          </div>
        );
      })}

      {/* ── Voorzieningenlijst ── */}
      {alleVoorzieningen.length > 0 && (
        <table className="prt-tabel">
          <thead>
            <tr>
              <th>Objectnummer</th>
              <th>Type</th>
              <th>Status</th>
              <th>Op plattegrond</th>
            </tr>
          </thead>
          <tbody>
            {alleVoorzieningen.map((v) => (
              <tr key={v.id}>
                <td>{v.objectnummer}</td>
                <td>{TYPEN[v.type]?.label ?? v.type}</td>
                <td>
                  <span className="prt-stip" style={{ backgroundColor: STATUSKLEUREN[v.status] ?? "#94a3b8" }} />
                  {STATUSLABEL[v.status] ?? v.status}
                </td>
                <td>{v.locatie_x != null && v.locatie_y != null ? "Ja" : "Nee"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── GebouwPrint ─────────────────────────────────────────────────────────────

export default function GebouwPrint() {
  const { id } = useParams<{ id: string }>();
  const gebouwId = Number(id);
  const { gebruiker } = useAuth();

  const { data: gebouw, isLoading }      = useGetGebouw(gebouwId);
  const { data: partijen, isLoading: partijenLaden }          = useListGebouwPartijen(gebouwId);
  const { data: toewijzingen, isLoading: toewijzingenLaden }  = useListGebouwToewijzingen(gebouwId);
  const { data: onderhoud, isLoading: onderhoudLaden }        = useListOnderhoud({ gebouw_id: gebouwId });
  const { data: inspecties, isLoading: inspectiesLaden }      = useListInspecties({ gebouw_id: gebouwId });

  const [gereedFloors, setGereedFloors] = useState(0);
  const gedrukt = useRef(false);

  // Moduskeuze
  const [toonOverzicht, setToonOverzicht] = useState(true);
  const [toonRaster,    setToonRaster]    = useState(true);
  const [toonClusters,  setToonClusters]  = useState(true);

  const verdiepingen = [...((gebouw?.verdiepingen ?? []) as Verdieping[])].sort(
    (a, b) => (a.niveau ?? 0) - (b.niveau ?? 0),
  );
  const aantalFloors = verdiepingen.length;
  const allesGereed =
    !isLoading && !!gebouw &&
    !partijenLaden && !toewijzingenLaden &&
    !onderhoudLaden && !inspectiesLaden &&
    gereedFloors >= aantalFloors;

  useEffect(() => {
    if (allesGereed && !gedrukt.current) {
      gedrukt.current = true;
      const t = setTimeout(() => window.print(), 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [allesGereed]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!gebouw) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white">
        <p className="text-muted-foreground">Gebouw niet gevonden.</p>
        <Link href="/gebouwen"><Button variant="outline"><ArrowLeft className="h-4 w-4" /> Terug</Button></Link>
      </div>
    );
  }

  const titel = gebouw.projectnummer ? `${gebouw.projectnummer} - ${gebouw.naam}` : gebouw.naam;
  const nu = new Date();
  const exportDatum = `${nu.toLocaleDateString("nl-NL")} ${nu.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`;
  const logoSrc = `${import.meta.env.BASE_URL}logo-fps.png`;

  const teamleden = Object.values(
    (toewijzingen ?? []).reduce<Record<number, { id: number; naam: string; rol: string; rollen: string[] }>>((acc, t) => {
      if (!acc[t.gebruiker_id])
        acc[t.gebruiker_id] = { id: t.gebruiker_id, naam: t.naam, rol: t.rol ?? "", rollen: [] };
      if (t.project_rol) acc[t.gebruiker_id].rollen.push(t.project_rol);
      return acc;
    }, {}),
  );

  const stats = gebouw.stats;
  const totaalSpots = stats?.totaal ?? 0;

  // Voortgang per status
  const voortgangStatussen: Array<{ status: string; label: string; aantal: number; kleur: string }> = [
    { status: "goedgekeurd",   label: "Goedgekeurd",   aantal: stats?.goedgekeurd  ?? 0, kleur: "#22c55e" },
    { status: "in_uitvoering", label: "In uitvoering", aantal: stats?.in_bewerking ?? 0, kleur: "#3b82f6" },
    { status: "in_onderhoud",  label: "In onderhoud",  aantal: stats?.in_onderhoud ?? 0, kleur: "#f97316" },
    { status: "afgekeurd",     label: "Afgekeurd",     aantal: stats?.afgekeurd    ?? 0, kleur: "#ef4444" },
  ].filter(s => s.aantal > 0);

  const heeftGegevens =
    gebouw.gebouw_type != null || gebouw.aantal_verdiepingen != null ||
    gebouw.hoogte != null || gebouw.oppervlakte != null ||
    (gebouw.breedte != null && gebouw.diepte != null);

  const opdrachtgevers = (partijen ?? []).filter(p => p.type === "opdrachtgever" || p.type === "eigenaar");

  return (
    <div className="prt-root bg-white text-slate-900">
      <style>{`
        .prt-root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
        .prt-doc { max-width: 960px; margin: 0 auto; padding: 24px; }

        /* Koptekst */
        .prt-kop { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 3px solid hsl(12 90% 50%); padding-bottom: 16px; margin-bottom: 24px; }
        .prt-kop img { height: 52px; width: auto; }
        .prt-titel { font-size: 22px; font-weight: 800; line-height: 1.2; margin: 0; }
        .prt-adres { color: #475569; font-size: 14px; margin-top: 2px; }
        .prt-meta { text-align: right; font-size: 12px; color: #475569; line-height: 1.6; }
        .prt-meta strong { color: #0f172a; }

        /* Secties */
        .prt-sectie { margin-bottom: 22px; break-inside: avoid; }
        .prt-sectie-titel { font-size: 15px; font-weight: 700; color: hsl(12 90% 45%); border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 10px; }
        .prt-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 18px; }
        .prt-grid .lbl { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .03em; }
        .prt-grid .val { font-size: 14px; font-weight: 600; }

        /* Tabellen */
        .prt-tabel { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
        .prt-tabel th { text-align: left; background: #f1f5f9; color: #334155; font-weight: 600; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
        .prt-tabel td { padding: 6px 8px; border-bottom: 1px solid #eef2f6; vertical-align: top; }
        .prt-stip { display: inline-block; width: 9px; height: 9px; border-radius: 9999px; margin-right: 6px; vertical-align: middle; }

        /* Kaarten */
        .prt-kaart { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
        .prt-kaart + .prt-kaart { margin-top: 8px; }
        .prt-kaart .naam { font-weight: 700; font-size: 13px; }
        .prt-kaart .sub { color: #64748b; font-size: 12px; }
        .prt-kaart .regel { font-size: 12px; color: #334155; margin-top: 2px; }
        .prt-badge { display: inline-block; font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 9999px; background: hsl(12 90% 50% / .12); color: hsl(12 90% 40%); margin-left: 6px; }

        /* Voortgangsbalk */
        .prt-voortgang { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
        .prt-voortgang-rij { display: flex; align-items: center; gap: 8px; }
        .prt-voortgang-label { font-size: 11px; color: #475569; width: 110px; flex-shrink: 0; }
        .prt-voortgang-balk-wrap { flex: 1; height: 10px; background: #f1f5f9; border-radius: 5px; overflow: hidden; }
        .prt-voortgang-balk { height: 100%; border-radius: 5px; }
        .prt-voortgang-getal { font-size: 11px; font-weight: 600; color: #0f172a; width: 28px; text-align: right; flex-shrink: 0; }

        /* Verdiepingen */
        .prt-verdieping { margin-bottom: 18px; }
        .prt-verdieping-blok { break-inside: avoid; margin-bottom: 12px; }
        .prt-subtitel { font-size: 13px; font-weight: 700; margin: 0 0 6px; display: flex; align-items: baseline; gap: 8px; }
        .prt-subtitel-meta { font-size: 11px; font-weight: 500; color: #64748b; }
        .prt-plattegrond { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #f8fafc; }

        /* Tegels (raster / clusters) */
        .prt-tegel-blok { break-before: page; break-inside: avoid; margin-bottom: 18px; }
        .prt-tegel-kop { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
        .prt-tegel-kop-info { flex: 1; min-width: 0; }
        .prt-tegel-titel { font-size: 13px; font-weight: 700; color: #0f172a; }
        .prt-tegel-meta { font-size: 11px; color: #64748b; margin-top: 2px; }
        .prt-tegel-koplabel { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 4px; }
        .prt-tegel-legende { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px; }
        .prt-tegel-status { font-size: 10px; color: #475569; display: flex; align-items: center; gap: 3px; }

        /* Toolbar */
        .prt-toolbar { position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; padding: 10px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
        .prt-toolbar-links { display: flex; gap: 8px; align-items: center; }
        .prt-modus-label { font-size: 12px; font-weight: 600; color: #334155; margin-right: 4px; }
        .prt-modus-checkboxen { display: flex; gap: 16px; flex-wrap: wrap; }
        .prt-modus-opt { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #334155; cursor: pointer; user-select: none; }
        .prt-modus-opt input { accent-color: hsl(12 90% 50%); width: 14px; height: 14px; cursor: pointer; }

        /* Footer */
        .prt-leeg { font-size: 13px; color: #64748b; }
        .prt-voet { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }

        @media print {
          .no-print { display: none !important; }
          .prt-doc { max-width: none; padding: 0; }
          @page { margin: 14mm; }
        }
        @media screen {
          .prt-root { background: #f1f5f9; min-height: 100vh; }
          .prt-doc { background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.1); margin: 24px auto; }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="prt-toolbar no-print">
        <div className="prt-toolbar-links">
          <Link href={`/gebouwen/${gebouwId}`}>
            <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4" /> Terug</Button>
          </Link>
          <span className="prt-modus-label">Inhoud:</span>
          <div className="prt-modus-checkboxen">
            <label className="prt-modus-opt">
              <input type="checkbox" checked={toonOverzicht} onChange={e => setToonOverzicht(e.target.checked)} />
              Overzichtsplattegrond
            </label>
            <label className="prt-modus-opt">
              <input type="checkbox" checked={toonRaster} onChange={e => setToonRaster(e.target.checked)} />
              Raster-uitsneden (A1, B2…)
            </label>
            <label className="prt-modus-opt">
              <input type="checkbox" checked={toonClusters} onChange={e => setToonClusters(e.target.checked)} />
              Automatische clusteruitsneden
            </label>
          </div>
        </div>
        <Button size="sm" onClick={() => window.print()} disabled={!allesGereed}>
          {allesGereed ? <Printer className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
          {allesGereed ? "Afdrukken / Opslaan als PDF" : "Voorbereiden…"}
        </Button>
      </div>

      <div className="prt-doc">

        {/* ── Pagina 1: Projectgegevens ── */}
        <div className="prt-kop">
          <div className="flex items-start gap-4">
            <img src={logoSrc} alt="FPS Brandpreventie" />
            <div>
              <h1 className="prt-titel">{titel}</h1>
              <p className="prt-adres">
                {gebouw.adres}{gebouw.stad ? `, ${gebouw.stad}` : ""}
              </p>
              {gebouw.werknummer && <p className="prt-adres">Werknummer: {gebouw.werknummer}</p>}
            </div>
          </div>
          <div className="prt-meta">
            <div>FPS Brandpreventie</div>
            <div>Geëxporteerd op <strong>{exportDatum}</strong></div>
            <div>Door <strong>{gebruiker?.naam ?? "—"}</strong></div>
            {gebouw.gereed_op && <div>Gereedgemeld op {datumNL(gebouw.gereed_op)}</div>}
          </div>
        </div>

        {/* Opdrachtgever (prominent, bovenaan) */}
        {opdrachtgevers.length > 0 && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">Opdrachtgever</h2>
            {opdrachtgevers.map(p => (
              <div key={p.id} className="prt-kaart">
                <div className="naam">{p.naam}<span className="prt-badge">{PARTIJ_TYPELABEL[p.type] ?? p.type}</span></div>
                {p.organisatie && <div className="sub">{p.organisatie}</div>}
                {p.email    && <div className="regel">E-mail: {p.email}</div>}
                {p.telefoon && <div className="regel">Telefoon: {p.telefoon}</div>}
                {(p.adres || p.postcode || p.plaats) && (
                  <div className="regel">
                    {[p.adres, [p.postcode, p.plaats].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Gebouwgegevens */}
        {heeftGegevens && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">Gebouwgegevens</h2>
            <div className="prt-grid">
              {gebouw.gebouw_type != null && (
                <div><div className="lbl">Type</div><div className="val" style={{ textTransform: "capitalize" }}>{gebouw.gebouw_type}</div></div>
              )}
              {gebouw.aantal_verdiepingen != null && (
                <div><div className="lbl">Verdiepingen</div><div className="val">{gebouw.aantal_verdiepingen}</div></div>
              )}
              {gebouw.hoogte != null && (
                <div><div className="lbl">Hoogte</div><div className="val">{gebouw.hoogte} m</div></div>
              )}
              {gebouw.oppervlakte != null && (
                <div><div className="lbl">Oppervlakte</div><div className="val">{gebouw.oppervlakte} m²</div></div>
              )}
              {gebouw.breedte != null && gebouw.diepte != null && (
                <div><div className="lbl">Afmeting</div><div className="val">{gebouw.breedte} × {gebouw.diepte} m</div></div>
              )}
              {verdiepingen.length > 0 && (
                <div><div className="lbl">Bouwlagen</div><div className="val">{verdiepingen.map(v => v.naam).join(", ")}</div></div>
              )}
            </div>
          </section>
        )}

        {/* Samenvatting spots + voortgangsbalken */}
        {totaalSpots > 0 && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">Spotsamenvatting en voortgang</h2>
            <div className="prt-grid" style={{ marginBottom: 14 }}>
              <div><div className="lbl">Totaal spots</div><div className="val">{totaalSpots}</div></div>
              <div>
                <div className="lbl">Goedgekeurd</div>
                <div className="val" style={{ color: "#16a34a" }}>
                  {stats?.goedgekeurd ?? 0}
                  {totaalSpots > 0 && <span style={{ fontSize: 11, fontWeight: 500, color: "#64748b", marginLeft: 5 }}>
                    ({Math.round(((stats?.goedgekeurd ?? 0) / totaalSpots) * 100)}%)
                  </span>}
                </div>
              </div>
              <div>
                <div className="lbl">Afgekeurd</div>
                <div className="val" style={{ color: "#dc2626" }}>
                  {stats?.afgekeurd ?? 0}
                  {totaalSpots > 0 && (stats?.afgekeurd ?? 0) > 0 && <span style={{ fontSize: 11, fontWeight: 500, color: "#64748b", marginLeft: 5 }}>
                    ({Math.round(((stats?.afgekeurd ?? 0) / totaalSpots) * 100)}%)
                  </span>}
                </div>
              </div>
            </div>
            <div className="prt-voortgang">
              {voortgangStatussen.map(s => (
                <div key={s.status} className="prt-voortgang-rij">
                  <div className="prt-voortgang-label">
                    <span className="prt-stip" style={{ backgroundColor: s.kleur }} />
                    {s.label}
                  </div>
                  <div className="prt-voortgang-balk-wrap">
                    <div className="prt-voortgang-balk" style={{
                      width: `${Math.round((s.aantal / totaalSpots) * 100)}%`,
                      backgroundColor: s.kleur,
                    }} />
                  </div>
                  <div className="prt-voortgang-getal">{s.aantal}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Overige partijen */}
        {(partijen ?? []).filter(p => p.type !== "opdrachtgever" && p.type !== "eigenaar").length > 0 && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">Overige contacten</h2>
            {(partijen ?? []).filter(p => p.type !== "opdrachtgever" && p.type !== "eigenaar").map(p => (
              <div key={p.id} className="prt-kaart">
                <div className="naam">{p.naam}<span className="prt-badge">{PARTIJ_TYPELABEL[p.type] ?? p.type}</span></div>
                {p.organisatie && <div className="sub">{p.organisatie}</div>}
                {p.email    && <div className="regel">E-mail: {p.email}</div>}
                {p.telefoon && <div className="regel">Telefoon: {p.telefoon}</div>}
              </div>
            ))}
          </section>
        )}

        {/* Projectteam */}
        {teamleden.length > 0 && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">Projectteam</h2>
            <table className="prt-tabel">
              <thead>
                <tr><th>Naam</th><th>Rol</th><th>Projectfunctie</th></tr>
              </thead>
              <tbody>
                {teamleden.map(t => (
                  <tr key={t.id}>
                    <td>{t.naam}</td>
                    <td style={{ textTransform: "capitalize" }}>{t.rol}</td>
                    <td>{t.rollen.length > 0 ? t.rollen.join(" | ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ── Plattegronden per verdieping ── */}
        <section className="prt-sectie">
          <h2 className="prt-sectie-titel">Plattegronden met spots</h2>
          {verdiepingen.length === 0 ? (
            <p className="prt-leeg">Nog geen bouwlagen aangemaakt.</p>
          ) : (
            verdiepingen.map(v => (
              <PrintVerdieping
                key={v.id}
                verdieping={v}
                onGereed={() => setGereedFloors(n => n + 1)}
                gebouwNaam={titel}
                exportDatum={exportDatum}
                logoSrc={logoSrc}
                toonOverzicht={toonOverzicht}
                toonRaster={toonRaster}
                toonClusters={toonClusters}
              />
            ))
          )}
        </section>

        {/* ── Onderhoud ── */}
        {(onderhoud ?? []).length > 0 && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">Onderhoud</h2>
            <table className="prt-tabel">
              <thead>
                <tr><th>Titel</th><th>Prioriteit</th><th>Status</th><th>Deadline</th><th>Toegewezen aan</th></tr>
              </thead>
              <tbody>
                {(onderhoud ?? []).map(o => (
                  <tr key={o.id}>
                    <td>{o.titel}</td>
                    <td>{PRIORITEIT_LABEL[o.prioriteit] ?? o.prioriteit}</td>
                    <td>{ONDERHOUD_STATUSLABEL[o.status] ?? o.status}</td>
                    <td>{datumNL(o.deadline)}</td>
                    <td>{o.toegewezen_aan_naam ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ── Inspecties ── */}
        {(inspecties ?? []).length > 0 && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">Inspecties</h2>
            <table className="prt-tabel">
              <thead>
                <tr><th>Type</th><th>Status</th><th>Gepland</th><th>Uitgevoerd</th><th>Inspecteur</th></tr>
              </thead>
              <tbody>
                {(inspecties ?? []).map(i => (
                  <tr key={i.id}>
                    <td>{INSPECTIE_TYPELABEL[i.type] ?? i.type}</td>
                    <td>{INSPECTIE_STATUSLABEL[i.status] ?? i.status}</td>
                    <td>{datumNL(i.geplande_datum)}</td>
                    <td>{datumNL(i.uitgevoerd_datum)}</td>
                    <td>{i.inspecteur_naam ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <div className="prt-voet">
          <span>FPS Brandpreventie — {titel}</span>
          <span>Geëxporteerd {exportDatum}</span>
        </div>
      </div>
    </div>
  );
}

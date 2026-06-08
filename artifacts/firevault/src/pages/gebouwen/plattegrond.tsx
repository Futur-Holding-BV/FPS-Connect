import { useRef, useState, useCallback, useEffect } from "react";
import { useParams, Link } from "wouter";
import {
  useGetVerdieping,
  useGetGebouw,
  useListVoorzieningenOpVerdieping,
  useListVerdiepingen,
  useCreateVoorziening,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, X, ZoomIn, ZoomOut, RotateCcw, Map } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

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

const STATUSKLEUREN: Record<string, string> = {
  goedgekeurd:   "#22c55e",
  afgekeurd:     "#ef4444",
  in_onderhoud:  "#f97316",
  in_uitvoering: "#3b82f6",
  concept:       "#94a3b8",
};

const STATUSLABEL: Record<string, string> = {
  goedgekeurd:   "Goedgekeurd",
  afgekeurd:     "Afgekeurd",
  in_onderhoud:  "In onderhoud",
  in_uitvoering: "In uitvoering",
  concept:       "Concept",
};

const CANVAS_W = 1200;
const CANVAS_H = 800;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;

type SVGVoorziening = {
  id: number;
  objectnummer: string;
  type: string;
  status: string;
  classificatie?: string;
  ruimte?: string;
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

  return (
    <g
      transform={`translate(${v.locatie_x}, ${v.locatie_y})`}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ cursor: "pointer" }}
    >
      {/* Statusring buiten */}
      <circle r={r + 5} fill={STATUSKLEUREN[v.status] ?? "#94a3b8"} opacity={0.25} />
      {/* Achtergrond cirkel */}
      <circle r={r} fill={stijl.kleur} stroke={geselecteerd ? "#fff" : stijl.ring} strokeWidth={geselecteerd ? 3 : 1.5} />
      {/* Label */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        fontWeight="600"
        fill="#fff"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {v.type.slice(0, 2).toUpperCase()}
      </text>
      {/* Objectnummer tooltip label */}
      <text
        y={r + 13}
        textAnchor="middle"
        fontSize={9}
        fill="#1e293b"
        fontWeight="500"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {v.objectnummer}
      </text>
    </g>
  );
}

function GridAchtergrond() {
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
      <rect width={CANVAS_W} height={CANVAS_H} fill="url(#grid-groot)" />
      {/* Buitenrand */}
      <rect x={20} y={20} width={CANVAS_W - 40} height={CANVAS_H - 40}
        fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6 3" rx="4" />
    </g>
  );
}

export default function Plattegrond() {
  const { id, verdiepingId } = useParams<{ id: string; verdiepingId: string }>();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<ViewState>({ x: 0, y: 0, zoom: 1 });
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState({ mx: 0, my: 0, vx: 0, vy: 0 });
  const [geselecteerd, setGeselecteerd] = useState<SVGVoorziening | null>(null);
  const [plaatsenModus, setPlaatsenModus] = useState(false);
  const [nieuwDialoog, setNieuwDialoog] = useState(false);
  const [nieuwLocatie, setNieuwLocatie] = useState({ x: 400, y: 300 });
  const [nieuwForm, setNieuwForm] = useState({
    objectnummer: "", type: "branddeur", classificatie: "60",
    ruimte: "", locatie_omschrijving: "",
  });

  const queryClient = useQueryClient();
  const { data: verdieping } = useGetVerdieping(Number(verdiepingId));
  const { data: gebouw } = useGetGebouw(Number(id));
  const { data: alleVerdiepingen } = useListVerdiepingen(Number(id));
  const { data: voorzieningen, refetch } = useListVoorzieningenOpVerdieping(Number(verdiepingId));
  const maakVoorziening = useCreateVoorziening();

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
      locatie_x: Number(v.locatie_x),
      locatie_y: Number(v.locatie_y),
    }));

  const nietGeplaatst = (voorzieningen ?? []).filter((v: any) => v.locatie_x == null || v.locatie_y == null);

  // ---- Pan & Zoom handlers ----
  const opCanvasKlik = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!plaatsenModus) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const svgX = (e.clientX - rect.left - view.x) / view.zoom;
    const svgY = (e.clientY - rect.top - view.y) / view.zoom;
    setNieuwLocatie({ x: Math.round(svgX), y: Math.round(svgY) });
    setNieuwDialoog(true);
  }, [plaatsenModus, view]);

  const opMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (plaatsenModus) return;
    setPanning(true);
    setPanStart({ mx: e.clientX, my: e.clientY, vx: view.x, vy: view.y });
  }, [plaatsenModus, view.x, view.y]);

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

  const resetView = () => setView({ x: 0, y: 0, zoom: 1 });
  const zoomIn = () => setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, v.zoom * 1.25) }));
  const zoomOut = () => setView((v) => ({ ...v, zoom: Math.max(MIN_ZOOM, v.zoom * 0.8) }));

  // ---- Voorziening aanmaken ----
  async function maakNieuw(e: React.FormEvent) {
    e.preventDefault();
    if (!nieuwForm.objectnummer || !nieuwForm.type) return;
    await maakVoorziening.mutateAsync({
      data: {
        objectnummer: nieuwForm.objectnummer,
        type: nieuwForm.type,
        classificatie: nieuwForm.classificatie,
        ruimte: nieuwForm.ruimte || undefined,
        locatie_omschrijving: nieuwForm.locatie_omschrijving || undefined,
        locatie_x: nieuwLocatie.x,
        locatie_y: nieuwLocatie.y,
        gebouw_id: Number(id),
        verdieping_id: Number(verdiepingId),
      },
    });
    setNieuwDialoog(false);
    setPlaatsenModus(false);
    setNieuwForm({ objectnummer: "", type: "branddeur", classificatie: "60", ruimte: "", locatie_omschrijving: "" });
    refetch();
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
          {/* Verdieping switcher */}
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

          {/* Zoom controls */}
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={zoomOut}><ZoomOut className="h-3.5 w-3.5" /></Button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(view.zoom * 100)}%</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={zoomIn}><ZoomIn className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={resetView}><RotateCcw className="h-3.5 w-3.5" /></Button>

          <Button
            variant={plaatsenModus ? "destructive" : "default"}
            size="sm"
            onClick={() => { setPlaatsenModus(!plaatsenModus); setGeselecteerd(null); }}
          >
            {plaatsenModus ? (<><X className="h-4 w-4 mr-1" />Annuleren</>) : (<><Plus className="h-4 w-4 mr-1" />Plaatsen</>)}
          </Button>
        </div>
      </div>

      {/* Plaatsen hint */}
      {plaatsenModus && (
        <div className="bg-primary/10 border border-primary/30 rounded-md px-3 py-2 mb-2 text-sm text-primary font-medium flex-shrink-0">
          Klik op de plattegrond om een nieuwe voorziening te plaatsen.
        </div>
      )}

      {/* Hoofd canvas + zijpaneel */}
      <div className="flex flex-1 gap-3 min-h-0">
        {/* SVG Canvas */}
        <div
          ref={containerRef}
          className={`flex-1 rounded-lg border overflow-hidden bg-white relative ${plaatsenModus ? "cursor-crosshair" : panning ? "cursor-grabbing" : "cursor-grab"}`}
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
              <GridAchtergrond />

              {/* Ruimtelabels (decoratief) */}
              <text x={40} y={45} fontSize={11} fill="#94a3b8" fontWeight="500">Ruimte A</text>
              <text x={CANVAS_W / 2} y={45} fontSize={11} fill="#94a3b8" fontWeight="500">Ruimte B</text>
              <text x={40} y={CANVAS_H / 2 + 15} fontSize={11} fill="#94a3b8" fontWeight="500">Ruimte C</text>
              <text x={CANVAS_W / 2} y={CANVAS_H / 2 + 15} fontSize={11} fill="#94a3b8" fontWeight="500">Ruimte D</text>
              {/* Middenlijn horizontaal */}
              <line x1={20} y1={CANVAS_H / 2} x2={CANVAS_W - 20} y2={CANVAS_H / 2} stroke="#e2e8f0" strokeWidth="1.5" />
              {/* Middenlijn verticaal */}
              <line x1={CANVAS_W / 2} y1={20} x2={CANVAS_W / 2} y2={CANVAS_H - 20} stroke="#e2e8f0" strokeWidth="1.5" />

              {/* Voorzieningen */}
              {geplaatst.map((v) => (
                <VoorzieningIcoon
                  key={v.id}
                  v={v}
                  geselecteerd={geselecteerd?.id === v.id}
                  onClick={() => setGeselecteerd(geselecteerd?.id === v.id ? null : v)}
                />
              ))}
            </g>
          </svg>

          {/* Legende onderin */}
          <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm border rounded-md px-3 py-2 flex flex-wrap gap-x-4 gap-y-1.5 max-w-lg shadow-sm">
            {Object.entries(TYPEN).map(([type, stijl]) => {
              const n = geplaatst.filter((v) => v.type === type).length;
              if (n === 0) return null;
              return (
                <div key={type} className="flex items-center gap-1.5 text-xs">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stijl.kleur }} />
                  <span className="text-slate-600">{stijl.label}</span>
                  <span className="text-slate-400 font-medium">({n})</span>
                </div>
              );
            })}
          </div>

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
        {geselecteerd && (
          <div className="w-72 flex-shrink-0 border rounded-lg bg-white p-4 flex flex-col gap-3 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: TYPEN[geselecteerd.type]?.kleur ?? "#94a3b8" }}
                />
                <span className="font-semibold text-sm">{geselecteerd.objectnummer}</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setGeselecteerd(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-y-2">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium">{TYPEN[geselecteerd.type]?.label ?? geselecteerd.type}</span>

                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline" className="text-xs w-fit" style={{ borderColor: STATUSKLEUREN[geselecteerd.status], color: STATUSKLEUREN[geselecteerd.status] }}>
                  {STATUSLABEL[geselecteerd.status] ?? geselecteerd.status}
                </Badge>

                <span className="text-muted-foreground">Classificatie</span>
                <span className="font-medium">EI {geselecteerd.classificatie ?? "—"}</span>

                {geselecteerd.ruimte && (
                  <>
                    <span className="text-muted-foreground">Ruimte</span>
                    <span className="font-medium">{geselecteerd.ruimte}</span>
                  </>
                )}

                <span className="text-muted-foreground">Positie</span>
                <span className="font-mono text-xs">{geselecteerd.locatie_x}, {geselecteerd.locatie_y}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-auto pt-3 border-t">
              <Button size="sm" variant="default" asChild>
                <Link href={`/voorzieningen/${geselecteerd.id}`}>Details openen</Link>
              </Button>
              <Button size="sm" variant="outline">Status bijwerken</Button>
            </div>
          </div>
        )}

        {/* Niet-geplaatste voorzieningen */}
        {nietGeplaatst.length > 0 && !geselecteerd && (
          <div className="w-64 flex-shrink-0 border rounded-lg bg-white p-3 overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Niet geplaatst ({nietGeplaatst.length})
            </p>
            <div className="space-y-1">
              {nietGeplaatst.map((v: any) => (
                <div key={v.id} className="flex items-center gap-2 p-2 rounded border hover:bg-muted/50 text-sm">
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
      <Dialog open={nieuwDialoog} onOpenChange={(o) => { setNieuwDialoog(o); if (!o) setPlaatsenModus(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nieuwe voorziening plaatsen</DialogTitle>
          </DialogHeader>
          <form onSubmit={maakNieuw} className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="nw-nr">Objectnummer *</Label>
                <Input
                  id="nw-nr"
                  value={nieuwForm.objectnummer}
                  onChange={(e) => setNieuwForm((f) => ({ ...f, objectnummer: e.target.value }))}
                  placeholder="BV-2024-011"
                  required
                />
              </div>

              <div>
                <Label>Type *</Label>
                <Select value={nieuwForm.type} onValueChange={(v) => setNieuwForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPEN).map(([k, s]) => (
                      <SelectItem key={k} value={k}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Classificatie (EI)</Label>
                <Select value={nieuwForm.classificatie} onValueChange={(v) => setNieuwForm((f) => ({ ...f, classificatie: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["30", "60", "90", "120"].map((v) => (
                      <SelectItem key={v} value={v}>EI {v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="nw-ruimte">Ruimte</Label>
                <Input
                  id="nw-ruimte"
                  value={nieuwForm.ruimte}
                  onChange={(e) => setNieuwForm((f) => ({ ...f, ruimte: e.target.value }))}
                  placeholder="Bijv. Trappenhal A"
                />
              </div>

              <div>
                <Label>Positie (X, Y)</Label>
                <div className="flex gap-1">
                  <Input
                    type="number"
                    value={nieuwLocatie.x}
                    onChange={(e) => setNieuwLocatie((l) => ({ ...l, x: Number(e.target.value) }))}
                    className="w-20"
                  />
                  <Input
                    type="number"
                    value={nieuwLocatie.y}
                    onChange={(e) => setNieuwLocatie((l) => ({ ...l, y: Number(e.target.value) }))}
                    className="w-20"
                  />
                </div>
              </div>

              <div className="col-span-2">
                <Label htmlFor="nw-loc">Locatieomschrijving</Label>
                <Input
                  id="nw-loc"
                  value={nieuwForm.locatie_omschrijving}
                  onChange={(e) => setNieuwForm((f) => ({ ...f, locatie_omschrijving: e.target.value }))}
                  placeholder="Bijv. Bij kabelgoot oost"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => { setNieuwDialoog(false); setPlaatsenModus(false); }}>
                Annuleren
              </Button>
              <Button type="submit" disabled={maakVoorziening.isPending}>
                {maakVoorziening.isPending ? "Opslaan..." : "Plaatsen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

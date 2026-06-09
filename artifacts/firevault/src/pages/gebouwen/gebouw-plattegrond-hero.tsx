import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  useListVoorzieningenOpVerdieping,
  useListScheidingen,
} from "@workspace/api-client-react";
import type { Verdieping } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, Layers, Loader2, Map, Radio } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const TYPEN: Record<string, { kleur: string; label: string; ring: string }> = {
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
  goedgekeurd:   "Gereed",
  afgekeurd:     "Afgekeurd",
  in_onderhoud:  "In onderhoud",
  vervallen:     "Vervallen",
};

const CANVAS_W = 1200;
const CANVAS_H = 800;

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

function spotVolgnummer(objectnummer: string): string {
  const m = objectnummer?.match(/(\d+)$/);
  return m ? m[1] : (objectnummer ?? "");
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

function GridAchtergrond({ w, h }: { w: number; h: number }) {
  const stapKlein = 40;
  const stapGroot = 200;
  return (
    <g>
      <defs>
        <pattern id="pvw-grid-klein" width={stapKlein} height={stapKlein} patternUnits="userSpaceOnUse">
          <path d={`M ${stapKlein} 0 L 0 0 0 ${stapKlein}`} fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
        </pattern>
        <pattern id="pvw-grid-groot" width={stapGroot} height={stapGroot} patternUnits="userSpaceOnUse">
          <rect width={stapGroot} height={stapGroot} fill="url(#pvw-grid-klein)" />
          <path d={`M ${stapGroot} 0 L 0 0 0 ${stapGroot}`} fill="none" stroke="#cbd5e1" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={w} height={h} fill="url(#pvw-grid-groot)" />
      <rect x={20} y={20} width={w - 40} height={h - 40}
        fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6 3" rx="4" />
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
    <g transform={`translate(${v.locatie_x}, ${v.locatie_y})`} style={{ pointerEvents: "none" }}>
      <circle r={r + 5} fill={stijl.kleur} opacity={0.25} />
      <circle r={r} fill={STATUSKLEUREN[v.status] ?? "#94a3b8"} stroke={stijl.ring} strokeWidth={1.5} />
      {isPlafond && (
        <g>
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
        style={{ userSelect: "none" }}
      >
        {volgnummer}
      </text>
      <text
        y={r + 13}
        textAnchor="middle"
        fontSize={9}
        fill="#1e293b"
        fontWeight="500"
        stroke="#fff"
        strokeWidth={2.5}
        style={{ userSelect: "none", paintOrder: "stroke" }}
      >
        {v.objectnummer}
      </text>
    </g>
  );
}

function PlattegrondCanvas({
  plattegrondUrl,
  verdiepingId,
}: {
  plattegrondUrl?: string | null;
  verdiepingId: number;
}) {
  const [pdfBeeld, setPdfBeeld] = useState<string | null>(null);
  const [pdfDims, setPdfDims] = useState<{ w: number; h: number } | null>(null);
  const [pdfLaden, setPdfLaden] = useState(false);

  const { data: voorzieningen } = useListVoorzieningenOpVerdieping(verdiepingId);
  const { data: scheidingen } = useListScheidingen(verdiepingId);

  useEffect(() => {
    if (!plattegrondUrl) {
      setPdfBeeld(null);
      setPdfDims(null);
      return;
    }
    let geannuleerd = false;
    let laadTaak: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    (async () => {
      setPdfLaden(true);
      try {
        let dataUrl: string;
        let dims: { w: number; h: number };
        try {
          laadTaak = pdfjsLib.getDocument({ url: `/api/storage${plattegrondUrl}` });
          const pdf = await laadTaak.promise;
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
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error("Afbeelding laden mislukt"));
            i.src = `/api/storage${plattegrondUrl}`;
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
    return () => {
      geannuleerd = true;
      laadTaak?.destroy().catch(() => undefined);
    };
  }, [plattegrondUrl]);

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

  return (
    <div className="relative w-full h-full bg-slate-100 rounded-md overflow-hidden">
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block" }}
      >
        {pdfBeeld ? (
          <image href={pdfBeeld} x={0} y={0} width={W} height={H} />
        ) : (
          <GridAchtergrond w={W} h={H} />
        )}

        {(scheidingen ?? []).map((s: any) => {
          let punten: Punt[] = [];
          try { punten = JSON.parse(s.punten); } catch { punten = []; }
          if (punten.length < 2) return null;
          const kleur = s.kleur || SCHEIDING_TYPEN[s.type]?.kleur || "#dc2626";
          const markers = markerPosities(punten, Math.max(W, H) / 4.6);
          const puntenStr = punten.map((p) => `${p.x},${p.y}`).join(" ");
          return (
            <g key={`s${s.id}`} style={{ pointerEvents: "none" }}>
              <polyline
                points={puntenStr}
                fill="none"
                stroke={kleur}
                strokeWidth={4}
                strokeDasharray={s.type === "rook" ? "12 8" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.9}
              />
              {s.waarde && markers.map((m, mi) => (
                <g key={mi} transform={`translate(${m.x}, ${m.y})`}>
                  <circle r={18} fill="#fff" stroke={kleur} strokeWidth={3} />
                  <text
                    x={0} y={0}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={String(s.waarde).length >= 6 ? 8 : String(s.waarde).length >= 5 ? 9.5 : 11}
                    fontWeight={800}
                    fill={kleur}
                  >
                    {s.waarde}
                  </text>
                </g>
              ))}
            </g>
          );
        })}

        {geplaatst.map((v) => (
          <SpotIcoon key={v.id} v={v} />
        ))}
      </svg>

      {pdfLaden && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 pointer-events-none">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {!pdfBeeld && !pdfLaden && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/90 border rounded-md px-3 py-1.5 text-xs text-muted-foreground shadow-sm whitespace-nowrap">
          Nog geen plattegrond — voeg er een toe via de sectie Plattegronden.
        </div>
      )}

      {geplaatst.length === 0 && !pdfLaden && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <Map className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Geen voorzieningen op kaart</p>
        </div>
      )}

      {geplaatst.length > 0 && (
        <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm border rounded px-2 py-1.5 flex flex-wrap gap-x-3 gap-y-1 max-w-sm shadow-sm">
          {Object.entries(STATUSKLEUREN).map(([status, kleur]) => {
            const n = geplaatst.filter((v) => v.status === status).length;
            if (n === 0) return null;
            return (
              <div key={status} className="flex items-center gap-1 text-xs">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: kleur }} />
                <span className="text-slate-600">{STATUSLABEL[status] ?? status}</span>
                <span className="text-slate-400">({n})</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function GebouwPlattegrondHero({
  gebouwId,
  verdiepingen,
}: {
  gebouwId: number;
  verdiepingen: Verdieping[];
}) {
  const gesorteerd = [...verdiepingen].sort((a, b) => (a.niveau ?? 0) - (b.niveau ?? 0));
  const [geselecteerdId, setGeselecteerdId] = useState<number>(
    gesorteerd[0]?.id ?? 0,
  );

  const geselecteerdeVerdieping = gesorteerd.find((v) => v.id === geselecteerdId) ?? gesorteerd[0];

  const { data: voorzieningen } = useListVoorzieningenOpVerdieping(
    geselecteerdId > 0 ? geselecteerdId : 0,
  );

  const statusCounts = (voorzieningen ?? []).reduce<Record<string, number>>((acc, v: any) => {
    if (v.status) acc[v.status] = (acc[v.status] ?? 0) + 1;
    return acc;
  }, {});

  if (gesorteerd.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" /> Plattegrond
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Nog geen bouwlagen aangemaakt voor dit gebouw.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <CardTitle>Plattegrond</CardTitle>
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
              <Radio className="h-3 w-3 animate-pulse" />
              Live
            </span>
          </div>

          {geselecteerdId > 0 && (
            <Link href={`/gebouwen/${gebouwId}/plattegrond/${geselecteerdId}`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                Plattegrond openen
              </Button>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-1">
          {gesorteerd.map((v) => (
            <button
              key={v.id}
              onClick={() => setGeselecteerdId(v.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors border ${
                geselecteerdId === v.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {v.naam}
              {(v.totaal_voorzieningen ?? 0) > 0 && (
                <span className={`text-xs rounded-full px-1.5 py-0 leading-5 font-semibold ${
                  geselecteerdId === v.id
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {v.totaal_voorzieningen}
                </span>
              )}
            </button>
          ))}
        </div>

        {Object.keys(statusCounts).length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
            {Object.entries(STATUSKLEUREN).map(([status, kleur]) => {
              const n = statusCounts[status] ?? 0;
              if (n === 0) return null;
              return (
                <div key={status} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: kleur }} />
                  <span className="text-muted-foreground">{STATUSLABEL[status] ?? status}</span>
                  <span className="font-semibold">{n}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <div className="h-[440px] w-full">
          {geselecteerdId > 0 && (
            <PlattegrondCanvas
              key={geselecteerdId}
              plattegrondUrl={geselecteerdeVerdieping?.plattegrond_url}
              verdiepingId={geselecteerdId}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

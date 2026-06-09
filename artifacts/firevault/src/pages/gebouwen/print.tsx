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

const TYPEN: Record<string, { kleur: string; ring: string; label: string }> = {
  branddeur: { kleur: "#ef4444", ring: "#b91c1c", label: "Branddeur" },
  doorvoering: { kleur: "#f97316", ring: "#c2410c", label: "Doorvoering" },
  brandklep: { kleur: "#eab308", ring: "#a16207", label: "Brandklep" },
  kitvoeg: { kleur: "#84cc16", ring: "#4d7c0f", label: "Kitvoeg" },
  manchet: { kleur: "#10b981", ring: "#065f46", label: "Manchet" },
  brandwerend_glas: { kleur: "#3b82f6", ring: "#1d4ed8", label: "Brandwerend Glas" },
  coating: { kleur: "#8b5cf6", ring: "#5b21b6", label: "Coating" },
  luik: { kleur: "#ec4899", ring: "#9d174d", label: "Luik" },
  plaatconstructie: { kleur: "#78716c", ring: "#44403c", label: "Plaatconstructie" },
  schuifdeur: { kleur: "#dc2626", ring: "#991b1b", label: "Schuifdeur" },
  puiconstructie: { kleur: "#6366f1", ring: "#3730a3", label: "Puiconstructie" },
  dakdoorvoer: { kleur: "#14b8a6", ring: "#0f766e", label: "Dakdoorvoer" },
};

const SCHEIDING_TYPEN: Record<string, { kleur: string; label: string }> = {
  brand: { kleur: "#dc2626", label: "Brandscheiding" },
  rook: { kleur: "#2563eb", label: "Rookscheiding" },
};

const STATUSKLEUREN: Record<string, string> = {
  concept: "#94a3b8",
  in_uitvoering: "#3b82f6",
  opgeleverd: "#14b8a6",
  goedgekeurd: "#22c55e",
  afgekeurd: "#ef4444",
  in_onderhoud: "#f97316",
  vervallen: "#6b7280",
};

const STATUSLABEL: Record<string, string> = {
  concept: "Concept",
  in_uitvoering: "In uitvoering",
  opgeleverd: "Opgeleverd",
  goedgekeurd: "Goedgekeurd",
  afgekeurd: "Afgekeurd",
  in_onderhoud: "In onderhoud",
  vervallen: "Vervallen",
};

const ONDERHOUD_STATUSLABEL: Record<string, string> = {
  open: "Open",
  in_uitvoering: "In uitvoering",
  voltooid: "Voltooid",
  geannuleerd: "Geannuleerd",
};

const PRIORITEIT_LABEL: Record<string, string> = {
  laag: "Laag",
  normaal: "Normaal",
  hoog: "Hoog",
  kritiek: "Kritiek",
};

const INSPECTIE_TYPELABEL: Record<string, string> = {
  oplevering: "Oplevering",
  periodiek: "Periodiek",
  jaarlijks: "Jaarlijks",
  herstel: "Herstel",
};

const INSPECTIE_STATUSLABEL: Record<string, string> = {
  gepland: "Gepland",
  in_uitvoering: "In uitvoering",
  afgerond: "Afgerond",
  geannuleerd: "Geannuleerd",
};

const PARTIJ_TYPELABEL: Record<string, string> = {
  eigenaar: "Eigenaar",
  gebruiker: "Gebruiker",
  opdrachtgever: "Opdrachtgever",
  aanvrager: "Aanvrager",
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

function GridAchtergrond({ w, h }: { w: number; h: number }) {
  const stapKlein = 40;
  const stapGroot = 200;
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

function PrintVerdieping({
  verdieping,
  onGereed,
}: {
  verdieping: Verdieping;
  onGereed: () => void;
}) {
  const [pdfBeeld, setPdfBeeld] = useState<string | null>(null);
  const [pdfDims, setPdfDims] = useState<{ w: number; h: number } | null>(null);
  const [beeldKlaar, setBeeldKlaar] = useState(false);
  const gereedGemeld = useRef(false);

  const plattegrondUrl = verdieping.plattegrond_url;
  const { data: voorzieningen } = useListVoorzieningenOpVerdieping(verdieping.id);
  const { data: scheidingen } = useListScheidingen(verdieping.id);

  const dataKlaar = voorzieningen !== undefined;

  useEffect(() => {
    if (!plattegrondUrl) {
      setPdfBeeld(null);
      setPdfDims(null);
      setBeeldKlaar(true);
      return;
    }
    setBeeldKlaar(false);
    let geannuleerd = false;
    let laadTaak: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    (async () => {
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
        setBeeldKlaar(true);
      } catch {
        if (!geannuleerd) {
          setPdfBeeld(null);
          setPdfDims(null);
          setBeeldKlaar(true);
        }
      }
    })();
    return () => {
      geannuleerd = true;
      laadTaak?.destroy().catch(() => undefined);
    };
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

  return (
    <div className="prt-verdieping">
      <h3 className="prt-subtitel">
        {verdieping.naam}
        <span className="prt-subtitel-meta">
          {alleVoorzieningen.length} {alleVoorzieningen.length === 1 ? "voorziening" : "voorzieningen"}
          {geplaatst.length > 0 ? ` · ${geplaatst.length} op plattegrond` : ""}
        </span>
      </h3>

      <div className="prt-plattegrond">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
          {pdfBeeld ? (
            <image href={pdfBeeld} x={0} y={0} width={W} height={H} />
          ) : (
            <GridAchtergrond w={W} h={H} />
          )}

          {(scheidingen ?? []).map((s: any) => {
            let punten: Punt[] = [];
            try {
              punten = JSON.parse(s.punten);
            } catch {
              punten = [];
            }
            if (punten.length < 2) return null;
            const kleur = s.kleur || SCHEIDING_TYPEN[s.type]?.kleur || "#dc2626";
            const markers = markerPosities(punten, Math.max(W, H) / 4.6);
            const puntenStr = punten.map((p) => `${p.x},${p.y}`).join(" ");
            return (
              <g key={`s${s.id}`}>
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
                {s.waarde &&
                  markers.map((m, mi) => (
                    <g key={mi} transform={`translate(${m.x}, ${m.y})`}>
                      <circle r={18} fill="#fff" stroke={kleur} strokeWidth={3} />
                      <text
                        x={0}
                        y={0}
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
      </div>

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

export default function GebouwPrint() {
  const { id } = useParams<{ id: string }>();
  const gebouwId = Number(id);
  const { gebruiker } = useAuth();

  const { data: gebouw, isLoading } = useGetGebouw(gebouwId);
  const { data: partijen, isLoading: partijenLaden } = useListGebouwPartijen(gebouwId);
  const { data: toewijzingen, isLoading: toewijzingenLaden } = useListGebouwToewijzingen(gebouwId);
  const { data: onderhoud, isLoading: onderhoudLaden } = useListOnderhoud({ gebouw_id: gebouwId });
  const { data: inspecties, isLoading: inspectiesLaden } = useListInspecties({ gebouw_id: gebouwId });

  const [gereedFloors, setGereedFloors] = useState(0);
  const gedrukt = useRef(false);

  const verdiepingen = [...((gebouw?.verdiepingen ?? []) as Verdieping[])].sort(
    (a, b) => (a.niveau ?? 0) - (b.niveau ?? 0),
  );
  const aantalFloors = verdiepingen.length;
  const allesGereed =
    !isLoading &&
    !!gebouw &&
    !partijenLaden &&
    !toewijzingenLaden &&
    !onderhoudLaden &&
    !inspectiesLaden &&
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
        <Link href={`/gebouwen`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Terug
          </Button>
        </Link>
      </div>
    );
  }

  const titel = gebouw.projectnummer ? `${gebouw.projectnummer} - ${gebouw.naam}` : gebouw.naam;
  const nu = new Date();
  const exportMoment = `${nu.toLocaleDateString("nl-NL")} ${nu.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`;
  const logoSrc = `${import.meta.env.BASE_URL}logo-fps.png`;

  const teamleden = Object.values(
    (toewijzingen ?? []).reduce<Record<number, { id: number; naam: string; rol: string; rollen: string[] }>>((acc, t) => {
      if (!acc[t.gebruiker_id]) {
        acc[t.gebruiker_id] = { id: t.gebruiker_id, naam: t.naam, rol: t.rol ?? "", rollen: [] };
      }
      if (t.project_rol) acc[t.gebruiker_id].rollen.push(t.project_rol);
      return acc;
    }, {}),
  );

  const heeftGegevens =
    gebouw.gebouw_type != null ||
    gebouw.aantal_verdiepingen != null ||
    gebouw.hoogte != null ||
    gebouw.oppervlakte != null ||
    (gebouw.breedte != null && gebouw.diepte != null);

  const stats = gebouw.stats;

  return (
    <div className="prt-root bg-white text-slate-900">
      <style>{`
        .prt-root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
        .prt-doc { max-width: 920px; margin: 0 auto; padding: 24px; }
        .prt-kop { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 3px solid hsl(12 90% 50%); padding-bottom: 16px; margin-bottom: 24px; }
        .prt-kop img { height: 52px; width: auto; }
        .prt-titel { font-size: 22px; font-weight: 800; line-height: 1.2; margin: 0; }
        .prt-adres { color: #475569; font-size: 14px; margin-top: 2px; }
        .prt-meta { text-align: right; font-size: 12px; color: #475569; line-height: 1.6; }
        .prt-meta strong { color: #0f172a; }
        .prt-sectie { margin-bottom: 22px; break-inside: avoid; }
        .prt-sectie-titel { font-size: 15px; font-weight: 700; color: hsl(12 90% 45%); border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 10px; }
        .prt-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 18px; }
        .prt-grid .lbl { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .03em; }
        .prt-grid .val { font-size: 14px; font-weight: 600; }
        .prt-tabel { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
        .prt-tabel th { text-align: left; background: #f1f5f9; color: #334155; font-weight: 600; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
        .prt-tabel td { padding: 6px 8px; border-bottom: 1px solid #eef2f6; vertical-align: top; }
        .prt-stip { display: inline-block; width: 9px; height: 9px; border-radius: 9999px; margin-right: 6px; vertical-align: middle; }
        .prt-kaart { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
        .prt-kaart + .prt-kaart { margin-top: 8px; }
        .prt-kaart .naam { font-weight: 700; font-size: 13px; }
        .prt-kaart .sub { color: #64748b; font-size: 12px; }
        .prt-kaart .regel { font-size: 12px; color: #334155; margin-top: 2px; }
        .prt-badge { display: inline-block; font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 9999px; background: hsl(12 90% 50% / .12); color: hsl(12 90% 40%); margin-left: 6px; }
        .prt-verdieping { margin-bottom: 18px; break-inside: avoid; }
        .prt-subtitel { font-size: 13px; font-weight: 700; margin: 0 0 6px; display: flex; align-items: baseline; gap: 8px; }
        .prt-subtitel-meta { font-size: 11px; font-weight: 500; color: #64748b; }
        .prt-plattegrond { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #f8fafc; }
        .prt-leeg { font-size: 13px; color: #64748b; }
        .prt-toolbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 8px; justify-content: flex-end; padding: 12px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
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

      <div className="prt-toolbar no-print">
        <Link href={`/gebouwen/${gebouwId}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" /> Terug
          </Button>
        </Link>
        <Button size="sm" onClick={() => window.print()} disabled={!allesGereed}>
          {allesGereed ? <Printer className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
          {allesGereed ? "Afdrukken / Opslaan als PDF" : "Voorbereiden…"}
        </Button>
      </div>

      <div className="prt-doc">
        <div className="prt-kop">
          <div className="flex items-start gap-4">
            <img src={logoSrc} alt="FPS Brandpreventie" />
            <div>
              <h1 className="prt-titel">{titel}</h1>
              <p className="prt-adres">
                {gebouw.adres}
                {gebouw.stad ? `, ${gebouw.stad}` : ""}
              </p>
              {gebouw.werknummer && <p className="prt-adres">Werknummer: {gebouw.werknummer}</p>}
            </div>
          </div>
          <div className="prt-meta">
            <div>FPS Brandpreventie</div>
            <div>
              Geëxporteerd op <strong>{exportMoment}</strong>
            </div>
            <div>
              Door <strong>{gebruiker?.naam ?? "—"}</strong>
            </div>
            {gebouw.gereed_op && <div>Gereedgemeld op {datumNL(gebouw.gereed_op)}</div>}
          </div>
        </div>

        {heeftGegevens && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">Gebouwgegevens</h2>
            <div className="prt-grid">
              {gebouw.gebouw_type != null && (
                <div>
                  <div className="lbl">Type</div>
                  <div className="val" style={{ textTransform: "capitalize" }}>
                    {gebouw.gebouw_type}
                  </div>
                </div>
              )}
              {gebouw.aantal_verdiepingen != null && (
                <div>
                  <div className="lbl">Verdiepingen</div>
                  <div className="val">{gebouw.aantal_verdiepingen}</div>
                </div>
              )}
              {gebouw.hoogte != null && (
                <div>
                  <div className="lbl">Hoogte</div>
                  <div className="val">{gebouw.hoogte} m</div>
                </div>
              )}
              {gebouw.oppervlakte != null && (
                <div>
                  <div className="lbl">Oppervlakte</div>
                  <div className="val">{gebouw.oppervlakte} m²</div>
                </div>
              )}
              {gebouw.breedte != null && gebouw.diepte != null && (
                <div>
                  <div className="lbl">Afmeting</div>
                  <div className="val">
                    {gebouw.breedte} × {gebouw.diepte} m
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="prt-sectie">
          <h2 className="prt-sectie-titel">Spot-statistieken</h2>
          <div className="prt-grid">
            <div>
              <div className="lbl">Totaal spots</div>
              <div className="val">{stats?.totaal ?? 0}</div>
            </div>
            <div>
              <div className="lbl">Goedgekeurd</div>
              <div className="val" style={{ color: "#16a34a" }}>
                {stats?.goedgekeurd ?? 0}
              </div>
            </div>
            <div>
              <div className="lbl">Afgekeurd</div>
              <div className="val" style={{ color: "#dc2626" }}>
                {stats?.afgekeurd ?? 0}
              </div>
            </div>
            {(stats?.in_bewerking ?? 0) > 0 && (
              <div>
                <div className="lbl">In uitvoering</div>
                <div className="val" style={{ color: "#d97706" }}>
                  {stats?.in_bewerking ?? 0}
                </div>
              </div>
            )}
            {(stats?.in_onderhoud ?? 0) > 0 && (
              <div>
                <div className="lbl">In onderhoud</div>
                <div className="val" style={{ color: "#ea580c" }}>
                  {stats?.in_onderhoud ?? 0}
                </div>
              </div>
            )}
          </div>
        </section>

        {(partijen ?? []).length > 0 && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">Opdrachtgevers &amp; contactgegevens</h2>
            {(partijen ?? []).map((p) => (
              <div key={p.id} className="prt-kaart">
                <div className="naam">
                  {p.naam}
                  <span className="prt-badge">{PARTIJ_TYPELABEL[p.type] ?? p.type}</span>
                </div>
                {p.organisatie && <div className="sub">{p.organisatie}</div>}
                {p.email && <div className="regel">E-mail: {p.email}</div>}
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

        {teamleden.length > 0 && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">Toegewezen gebruikers</h2>
            <table className="prt-tabel">
              <thead>
                <tr>
                  <th>Naam</th>
                  <th>Rol</th>
                  <th>Projectfunctie</th>
                </tr>
              </thead>
              <tbody>
                {teamleden.map((t) => (
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

        <section className="prt-sectie">
          <h2 className="prt-sectie-titel">Plattegronden met spots</h2>
          {verdiepingen.length === 0 ? (
            <p className="prt-leeg">Nog geen bouwlagen aangemaakt voor dit gebouw.</p>
          ) : (
            verdiepingen.map((v) => (
              <PrintVerdieping key={v.id} verdieping={v} onGereed={() => setGereedFloors((n) => n + 1)} />
            ))
          )}
        </section>

        {(onderhoud ?? []).length > 0 && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">Onderhoud</h2>
            <table className="prt-tabel">
              <thead>
                <tr>
                  <th>Titel</th>
                  <th>Prioriteit</th>
                  <th>Status</th>
                  <th>Deadline</th>
                  <th>Toegewezen aan</th>
                </tr>
              </thead>
              <tbody>
                {(onderhoud ?? []).map((o) => (
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

        {(inspecties ?? []).length > 0 && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">Inspecties</h2>
            <table className="prt-tabel">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Gepland</th>
                  <th>Uitgevoerd</th>
                  <th>Inspecteur</th>
                </tr>
              </thead>
              <tbody>
                {(inspecties ?? []).map((i) => (
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
          <span>Geëxporteerd {exportMoment}</span>
        </div>
      </div>
    </div>
  );
}

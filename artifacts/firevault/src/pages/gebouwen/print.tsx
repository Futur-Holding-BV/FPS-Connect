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
  useGetVoorziening,
  useListGebouwTekeningen,
  useListGebouwEmails,
  useGetGebouwEmailSamenvatting,
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
  goedgekeurd:   "Gereed",
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

const TEKENING_TYPELABEL: Record<string, string> = {
  plattegrond:        "Plattegrond",
  gevelaanzicht:      "Gevelaanzicht",
  doorsnede:          "Doorsnede",
  situatietekening:   "Situatietekening",
  installatietekening:"Installatietekening",
  detailtekening:     "Detailtekening",
  overig:             "Overig",
};

const REPORT_TITEL = "Opleverrapport brandveiligheid";

const CANVAS_W = 1200;
const CANVAS_H = 800;

const SPOT_CROP = 600;

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

// ─── Hulpfuncties ────────────────────────────────────────────────────────────

function weergeefWerendheid(wbdbo?: string | null, wrd?: string | null, classificatie?: string | null): string {
  if (wrd)   return `WRD ${wrd} min (rookwerend)`;
  if (wbdbo) return `EW ${wbdbo} min (WBDBO brandwerend)`;
  if (classificatie && classificatie !== "60") return `EI ${classificatie} min`;
  return "—";
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
  return (
    <g transform={`translate(${v.locatie_x}, ${v.locatie_y})`}>
      <circle r={r + 5} fill={stijl.kleur} opacity={0.25} />
      <circle r={r} fill={STATUSKLEUREN[v.status] ?? "#94a3b8"} stroke={stijl.ring} strokeWidth={1.5} />
      {isPlafond && (
        <g>
          <path d="M 7,4 A 9,9 0 1,1 7,-4" fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" />
          <path d="M 7,4 A 9,9 0 1,1 7,-4" fill="none" stroke="#1e293b" strokeWidth={2} strokeLinecap="round" />
          <polygon points="7,-4 4,-5 8,-7" fill="#1e293b" stroke="#fff" strokeWidth={0.8} strokeLinejoin="round" />
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

// ─── SpotDetailBlok ──────────────────────────────────────────────────────────

function SpotDetailBlok({
  spot,
  pdfBeeld,
  W,
  H,
  scheidingen,
  gebouwNaam,
  bouwlaag,
  exportDatum,
  logoSrc,
  onGereed,
}: {
  spot: SVGVoorziening;
  pdfBeeld: string | null;
  W: number;
  H: number;
  scheidingen: any[] | undefined;
  gebouwNaam: string;
  bouwlaag: string;
  exportDatum: string;
  logoSrc: string;
  onGereed: () => void;
}) {
  const { data: detail } = useGetVoorziening(spot.id);
  const gereedGemeld = useRef(false);

  useEffect(() => {
    if (detail && !gereedGemeld.current) {
      gereedGemeld.current = true;
      onGereed();
    }
  }, [detail, onGereed]);

  const half = SPOT_CROP / 2;
  const vbX = Math.max(0, spot.locatie_x - half);
  const vbY = Math.max(0, spot.locatie_y - half);
  const vbW = Math.min(SPOT_CROP, W - vbX);
  const vbH = Math.min(SPOT_CROP, H - vbY);

  const fotos    = (detail as any)?.fotos  as any[] | undefined ?? [];
  const labels   = (detail as any)?.labels as any[] | undefined ?? [];
  const voorFotos = fotos.filter((f: any) => f.fase === "voor");
  const naFotos   = fotos.filter((f: any) => f.fase === "na");

  const d = detail as any;
  const applicatieLabel = TYPEN[spot.type]?.label ?? spot.type;
  const werendheidLabel = weergeefWerendheid(d?.wbdbo, d?.wrd, d?.classificatie);

  const heeftTestinfo = labels.some((l: any) => l.testnorm || l.fabrikant);

  return (
    <div className="prt-spot-detail">
      <div className="prt-spot-kop">
        <div className="prt-spot-kop-links">
          <img src={logoSrc} alt="FPS Brandpreventie" className="prt-spot-logo" />
          <div>
            <div className="prt-spot-gebouw">{gebouwNaam}</div>
            <div className="prt-spot-bouwlaag">{bouwlaag}</div>
          </div>
        </div>
        <div className="prt-spot-kop-rechts">
          <div className="prt-spot-nr">{spot.objectnummer}</div>
          <div className="prt-spot-datum">Rapportdatum: {exportDatum}</div>
        </div>
      </div>

      <div className="prt-spot-body">
        <div className="prt-spot-tekening">
          <svg
            viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: "block", width: "100%", height: "100%" }}
          >
            {pdfBeeld
              ? <image href={pdfBeeld} x={0} y={0} width={W} height={H} />
              : <GridAchtergrond w={W} h={H} />}
            {renderScheidingen(scheidingen, W, H)}
            <SpotIcoon v={spot} />
            <circle
              cx={spot.locatie_x}
              cy={spot.locatie_y}
              r={40}
              fill="none"
              stroke="#F23B0D"
              strokeWidth={4}
              strokeDasharray="12 6"
              opacity={0.9}
            />
          </svg>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, width: 120 }}>
          <Minimap W={W} H={H} x={vbX} y={vbY} w={vbW} h={vbH} label={spot.objectnummer} />
          <div style={{ fontSize: 10, color: "#64748b", textAlign: "center", lineHeight: 1.4 }}>
            Locatie op plattegrond
          </div>
        </div>
      </div>

      <div className="prt-spot-info">
        <div className="prt-spot-info-rij">
          <span className="prt-spot-lbl">Applicatiecode</span>
          <span className="prt-spot-val">{spot.objectnummer}</span>
        </div>
        <div className="prt-spot-info-rij">
          <span className="prt-spot-lbl">Applicatieomschrijving</span>
          <span className="prt-spot-val">{applicatieLabel}</span>
        </div>
        <div className="prt-spot-info-rij">
          <span className="prt-spot-lbl">Toepassing</span>
          <span className="prt-spot-val">
            {labels.length > 0
              ? labels.map((l: any) => l.naam).join(", ")
              : <em style={{ color: "#94a3b8" }}>Geen toepassing</em>}
          </span>
        </div>
        <div className="prt-spot-info-rij">
          <span className="prt-spot-lbl">Status</span>
          <span className="prt-spot-val">
            <span className="prt-stip" style={{ backgroundColor: STATUSKLEUREN[spot.status] ?? "#94a3b8" }} />
            {STATUSLABEL[spot.status] ?? spot.status}
          </span>
        </div>
        <div className="prt-spot-info-rij">
          <span className="prt-spot-lbl">Brand- of rookwerendheid</span>
          <span className="prt-spot-val">{werendheidLabel}</span>
        </div>
        {d?.ruimte && (
          <div className="prt-spot-info-rij">
            <span className="prt-spot-lbl">Ruimte</span>
            <span className="prt-spot-val">{d.ruimte}</span>
          </div>
        )}
        {d?.huisnummer && (
          <div className="prt-spot-info-rij">
            <span className="prt-spot-lbl">Huisnummer</span>
            <span className="prt-spot-val">{d.huisnummer}</span>
          </div>
        )}
        {d?.installatie_datum && (
          <div className="prt-spot-info-rij">
            <span className="prt-spot-lbl">Installatiedatum</span>
            <span className="prt-spot-val">{datumNL(d.installatie_datum)}</span>
          </div>
        )}
        {d?.opmerkingen && (
          <div className="prt-spot-info-rij">
            <span className="prt-spot-lbl">Opmerking</span>
            <span className="prt-spot-val">{d.opmerkingen}</span>
          </div>
        )}
      </div>

      <div className="prt-spot-testinfo">
        <div className="prt-spot-testinfo-titel">Productcertificaten / ETA's</div>
        {heeftTestinfo ? (
          labels.filter((l: any) => l.testnorm || l.fabrikant).map((l: any) => (
            <div key={l.id} className="prt-spot-testitem">
              <span className="prt-spot-testitem-naam">{l.naam}</span>
              {l.fabrikant && <span className="prt-spot-testitem-meta">Fabrikant: {l.fabrikant}</span>}
              {l.testnorm  && <span className="prt-spot-testitem-meta">Testnorm: {l.testnorm}</span>}
            </div>
          ))
        ) : (
          <div className="prt-spot-testitem">
            <span className="prt-spot-testitem-naam" style={{ color: "#94a3b8", fontStyle: "italic" }}>Geen gekoppeld document</span>
          </div>
        )}
      </div>

      {(voorFotos.length > 0 || naFotos.length > 0) && (
        <div className="prt-spot-fotos">
          {voorFotos.length > 0 && (
            <div>
              <div className="prt-spot-foto-label">Foto's voor</div>
              <div className="prt-spot-foto-rij">
                {voorFotos.map((f: any) => (
                  <img key={f.id} src={`/api/storage${f.url}`} alt="Foto voor" className="prt-spot-foto" />
                ))}
              </div>
            </div>
          )}
          {naFotos.length > 0 && (
            <div>
              <div className="prt-spot-foto-label">Foto's na</div>
              <div className="prt-spot-foto-rij">
                {naFotos.map((f: any) => (
                  <img key={f.id} src={`/api/storage${f.url}`} alt="Foto na" className="prt-spot-foto" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
        {s.waarde && markers.map((m, mi) => {
          const codeWeergave = s.type === "rook" && !String(s.waarde).startsWith("WRD") ? `WRD${s.waarde}` : String(s.waarde);
          return (
            <g key={mi} transform={`translate(${m.x}, ${m.y})`}>
              <circle r={18} fill="#fff" stroke={kleur} strokeWidth={3} />
              <text x={0} y={0} textAnchor="middle" dominantBaseline="central"
                fontSize={codeWeergave.length >= 6 ? 8 : codeWeergave.length >= 5 ? 9.5 : 11}
                fontWeight={800} fill={kleur}>{codeWeergave}</text>
            </g>
          );
        })}
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
  toonSpotDetails,
}: {
  verdieping: Verdieping;
  onGereed: () => void;
  gebouwNaam: string;
  exportDatum: string;
  logoSrc: string;
  toonOverzicht: boolean;
  toonSpotDetails: boolean;
}) {
  const [pdfBeeld, setPdfBeeld]     = useState<string | null>(null);
  const [pdfDims, setPdfDims]       = useState<{ w: number; h: number } | null>(null);
  const [beeldKlaar, setBeeldKlaar] = useState(false);
  const [spotsGereed, setSpotsGereed] = useState(0);
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
  const aantalSpots = toonSpotDetails ? geplaatst.length : 0;
  const alleSpotsGereed = spotsGereed >= aantalSpots;

  useEffect(() => {
    if (beeldKlaar && dataKlaar && alleSpotsGereed && !gereedGemeld.current) {
      gereedGemeld.current = true;
      onGereed();
    }
  }, [beeldKlaar, dataKlaar, alleSpotsGereed, onGereed]);

  const vd = verdieping as any;
  const logoPad = Math.max(W, H) * 0.015;
  const logoB   = vd.logo_breedte ?? Math.max(W, H) * 0.16;
  const logoHH  = logoB / 2.59;
  const logoX   = vd.logo_x != null ? Number(vd.logo_x) : logoPad;
  const logoY   = vd.logo_y != null ? Number(vd.logo_y) : logoPad;

  return (
    <div className="prt-verdieping">
      <h3 className="prt-subtitel">
        {verdieping.naam}
        <span className="prt-subtitel-meta">
          {alleVoorzieningen.length} {alleVoorzieningen.length === 1 ? "voorziening" : "voorzieningen"}
          {geplaatst.length > 0 ? ` · ${geplaatst.length} op plattegrond` : ""}
        </span>
      </h3>

      {toonOverzicht && (
        <div className="prt-overzicht-blok">
          <div className="prt-spot-kop">
            <div className="prt-spot-kop-links">
              <img src={logoSrc} alt="FPS Brandpreventie" className="prt-spot-logo" />
              <div>
                <div className="prt-spot-gebouw">{gebouwNaam}</div>
                <div className="prt-spot-bouwlaag">Overzichtsplattegrond · {verdieping.naam}</div>
              </div>
            </div>
            <div className="prt-spot-kop-rechts">
              <div className="prt-spot-datum">Rapportdatum: {exportDatum}</div>
            </div>
          </div>
          <div className="prt-plattegrond">
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
              {pdfBeeld
                ? <image href={pdfBeeld} x={0} y={0} width={W} height={H} />
                : <GridAchtergrond w={W} h={H} />}
              {renderScheidingen(scheidingen, W, H)}
              {geplaatst.map(v => <SpotIcoon key={v.id} v={v} />)}
              {pdfBeeld && (
                <image href={logoSrc} x={logoX} y={logoY} width={logoB} height={logoHH}
                  preserveAspectRatio="xMidYMid meet" />
              )}
            </svg>
          </div>
        </div>
      )}

      {toonSpotDetails && geplaatst.map(spot => (
        <SpotDetailBlok
          key={spot.id}
          spot={spot}
          pdfBeeld={pdfBeeld}
          W={W}
          H={H}
          scheidingen={scheidingen}
          gebouwNaam={gebouwNaam}
          bouwlaag={verdieping.naam}
          exportDatum={exportDatum}
          logoSrc={logoSrc}
          onGereed={() => setSpotsGereed(n => n + 1)}
        />
      ))}

      {!toonSpotDetails && alleVoorzieningen.length > 0 && (
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
  const { data: tekeningen, isLoading: tekeningenLaden }      = useListGebouwTekeningen(gebouwId);
  const { data: emails, isLoading: emailsLaden }              = useListGebouwEmails(gebouwId);
  const { data: samenvatting }                                = useGetGebouwEmailSamenvatting(gebouwId);

  const [gereedFloors, setGereedFloors] = useState(0);
  const gedrukt = useRef(false);

  const [toonOverzicht,   setToonOverzicht]   = useState(true);
  const [toonSpotDetails, setToonSpotDetails] = useState(true);

  const verdiepingen = [...((gebouw?.verdiepingen ?? []) as Verdieping[])].sort(
    (a, b) => (a.niveau ?? 0) - (b.niveau ?? 0),
  );
  const aantalFloors = verdiepingen.length;
  const allesGereed =
    !isLoading && !!gebouw &&
    !partijenLaden && !toewijzingenLaden &&
    !onderhoudLaden && !inspectiesLaden &&
    !tekeningenLaden && !emailsLaden &&
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

  const rapportDatum   = nu.toLocaleDateString("nl-NL");
  const rapportVersie  = "1.0";
  const documentnummer = `OPL-${gebouw.projectnummer ?? gebouw.werknummer ?? gebouwId}`;
  const opsteller      = gebruiker?.naam ?? "—";

  const projectOmschrijving =
    (samenvatting?.opdrachtomschrijving?.trim() || (gebouw as { omschrijving?: string | null }).omschrijving?.trim()) ?? "";

  const projectTekeningen = (tekeningen ?? []);
  const projectEmails     = (emails ?? []);
  const heeftDocumenten   = projectTekeningen.length > 0 || projectEmails.length > 0;

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

  const voortgangStatussen: Array<{ status: string; label: string; aantal: number; kleur: string }> = [
    { status: "goedgekeurd",   label: "Gereed",         aantal: stats?.goedgekeurd  ?? 0, kleur: "#22c55e" },
    { status: "in_uitvoering", label: "In uitvoering", aantal: stats?.in_bewerking ?? 0, kleur: "#3b82f6" },
    { status: "in_onderhoud",  label: "In onderhoud",  aantal: stats?.in_onderhoud ?? 0, kleur: "#f97316" },
    { status: "afgekeurd",     label: "Afgekeurd",     aantal: stats?.afgekeurd    ?? 0, kleur: "#ef4444" },
  ].filter(s => s.aantal > 0);

  const opdrachtgevers = (partijen ?? []).filter(p => p.type === "opdrachtgever" || p.type === "eigenaar");

  return (
    <div className="prt-root bg-white text-slate-900">
      <style>{`
        .prt-root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }

        /* ── Voorblad (pagina 1) ── */
        .prt-voorblad {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: #fff;
        }
        .prt-cover-top { padding: 48px 56px 0; }
        .prt-cover-logo { height: 48px; width: auto; }
        .prt-cover-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 56px;
        }
        .prt-cover-accentlijn {
          width: 56px;
          height: 4px;
          background: #F23B0D;
          border-radius: 2px;
          margin-bottom: 20px;
        }
        .prt-cover-type {
          font-size: 11px;
          font-weight: 700;
          color: #F23B0D;
          text-transform: uppercase;
          letter-spacing: .1em;
          margin-bottom: 14px;
        }
        .prt-cover-naam {
          font-size: 36px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.1;
          margin-bottom: 10px;
        }
        .prt-cover-adres {
          font-size: 16px;
          color: #475569;
          margin-bottom: 40px;
        }
        .prt-cover-meta { display: flex; flex-direction: column; gap: 6px; }
        .prt-cover-meta-rij { display: flex; gap: 12px; font-size: 13px; color: #475569; }
        .prt-cover-meta-lbl { font-weight: 600; color: #334155; min-width: 148px; flex-shrink: 0; }
        .prt-cover-voet {
          background: #212631;
          color: #fff;
          padding: 28px 56px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .prt-cover-voet-merk { font-size: 16px; font-weight: 700; }
        .prt-cover-voet-tagline { font-size: 11px; color: #94a3b8; margin-top: 3px; }
        .prt-cover-voet-rechts { text-align: right; font-size: 11px; color: #94a3b8; line-height: 1.8; }
        .prt-cover-voet-waarde { color: #fff; font-weight: 600; }

        /* ── Pagina-container (pagina's 2+) ── */
        .prt-pagina { max-width: 960px; margin: 0 auto; padding: 32px; }
        .prt-pagina-kop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2px solid #F23B0D;
          padding-bottom: 12px;
          margin-bottom: 28px;
        }
        .prt-pagina-kop img { height: 30px; width: auto; }
        .prt-pagina-kop-info { text-align: right; font-size: 11px; color: #64748b; line-height: 1.6; }
        .prt-pagina-kop-info strong { color: #0f172a; font-size: 12px; }

        /* ── Secties ── */
        .prt-sectie { margin-bottom: 22px; break-inside: avoid; }
        .prt-sectie-titel { font-size: 15px; font-weight: 700; color: hsl(12 90% 45%); border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 10px; }
        .prt-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 18px; }
        .prt-grid .lbl { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .03em; }
        .prt-grid .val { font-size: 14px; font-weight: 600; }

        /* ── Tabellen ── */
        .prt-tabel { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
        .prt-tabel th { text-align: left; background: #f1f5f9; color: #334155; font-weight: 600; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
        .prt-tabel td { padding: 6px 8px; border-bottom: 1px solid #eef2f6; vertical-align: top; }
        .prt-stip { display: inline-block; width: 9px; height: 9px; border-radius: 9999px; margin-right: 6px; vertical-align: middle; }

        /* ── Kaarten ── */
        .prt-kaart { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
        .prt-kaart + .prt-kaart { margin-top: 8px; }
        .prt-kaart .naam { font-weight: 700; font-size: 13px; }
        .prt-kaart .sub { color: #64748b; font-size: 12px; }
        .prt-kaart .regel { font-size: 12px; color: #334155; margin-top: 2px; }
        .prt-badge { display: inline-block; font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 9999px; background: hsl(12 90% 50% / .12); color: hsl(12 90% 40%); margin-left: 6px; }

        /* ── Voortgang ── */
        .prt-voortgang { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
        .prt-voortgang-rij { display: flex; align-items: center; gap: 8px; }
        .prt-voortgang-label { font-size: 11px; color: #475569; width: 110px; flex-shrink: 0; }
        .prt-voortgang-balk-wrap { flex: 1; height: 10px; background: #f1f5f9; border-radius: 5px; overflow: hidden; }
        .prt-voortgang-balk { height: 100%; border-radius: 5px; }
        .prt-voortgang-getal { font-size: 11px; font-weight: 600; color: #0f172a; width: 28px; text-align: right; flex-shrink: 0; }

        /* ── Juridisch ── */
        .prt-juridisch { line-height: 1.65; }
        .prt-juridisch h3 { font-size: 12px; font-weight: 700; color: #334155; margin: 16px 0 5px; }
        .prt-juridisch p { font-size: 12px; color: #475569; margin-bottom: 8px; }
        .prt-juridisch ul { font-size: 12px; color: #475569; padding-left: 20px; margin-bottom: 8px; list-style: disc; }
        .prt-juridisch li { margin-bottom: 4px; }

        /* ── Verdiepingen ── */
        .prt-verdieping { break-before: page; margin-bottom: 18px; }
        .prt-verdieping-blok { break-inside: avoid; margin-bottom: 12px; }
        .prt-overzicht-blok { break-inside: avoid; margin-bottom: 18px; }
        .prt-subtitel { font-size: 13px; font-weight: 700; margin: 0 0 6px; display: flex; align-items: baseline; gap: 8px; }
        .prt-subtitel-meta { font-size: 11px; font-weight: 500; color: #64748b; }
        .prt-plattegrond { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #f8fafc; }

        /* ── Tegel ── */
        .prt-tegel-blok { break-before: page; break-inside: avoid; margin-bottom: 18px; }
        .prt-tegel-kop { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
        .prt-tegel-kop-info { flex: 1; min-width: 0; }
        .prt-tegel-titel { font-size: 13px; font-weight: 700; color: #0f172a; }
        .prt-tegel-meta { font-size: 11px; color: #64748b; margin-top: 2px; }
        .prt-tegel-koplabel { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 4px; }
        .prt-tegel-legende { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px; }
        .prt-tegel-status { font-size: 10px; color: #475569; display: flex; align-items: center; gap: 3px; }

        /* ── Spot-detail ── */
        .prt-spot-detail { break-before: page; break-inside: avoid; margin-bottom: 0; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #fff; }
        .prt-spot-kop { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid #F23B0D; padding-bottom: 10px; margin-bottom: 12px; }
        .prt-spot-kop-links { display: flex; align-items: center; gap: 12px; }
        .prt-spot-logo { height: 28px; width: auto; }
        .prt-spot-gebouw { font-size: 13px; font-weight: 700; color: #0f172a; }
        .prt-spot-bouwlaag { font-size: 11px; color: #64748b; margin-top: 1px; }
        .prt-spot-kop-rechts { text-align: right; }
        .prt-spot-nr { font-size: 20px; font-weight: 800; color: #F23B0D; }
        .prt-spot-datum { font-size: 10px; color: #94a3b8; margin-top: 2px; }
        .prt-spot-body { display: flex; gap: 16px; margin-bottom: 12px; align-items: flex-start; }
        .prt-spot-tekening { flex: 1; min-width: 0; height: 210px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #f8fafc; }
        .prt-spot-info { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin-bottom: 12px; }
        .prt-spot-info-rij { display: contents; }
        .prt-spot-lbl { font-size: 10px; font-weight: 600; color: #64748b; padding: 3px 0; }
        .prt-spot-val { font-size: 11px; color: #0f172a; padding: 3px 0; display: flex; align-items: center; gap: 4px; }
        .prt-spot-testinfo { background: #f1f5f9; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; }
        .prt-spot-testinfo-titel { font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 6px; }
        .prt-spot-testitem { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; margin-bottom: 4px; }
        .prt-spot-testitem-naam { font-size: 11px; font-weight: 600; color: #0f172a; }
        .prt-spot-testitem-meta { font-size: 10px; color: #64748b; }
        .prt-spot-fotos { margin-top: 4px; display: flex; gap: 16px; flex-wrap: wrap; }
        .prt-spot-fotos > div { flex: 1; min-width: 0; }
        .prt-spot-foto-label { font-size: 10px; font-weight: 600; color: #64748b; margin-bottom: 6px; margin-top: 4px; }
        .prt-spot-foto-rij { display: flex; flex-wrap: wrap; gap: 6px; }
        .prt-spot-foto { width: 150px; height: 112px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0; }

        /* ── Toolbar ── */
        .prt-toolbar { position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; padding: 10px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
        .prt-toolbar-links { display: flex; gap: 8px; align-items: center; }
        .prt-modus-label { font-size: 12px; font-weight: 600; color: #334155; margin-right: 4px; }
        .prt-modus-checkboxen { display: flex; gap: 16px; flex-wrap: wrap; }
        .prt-modus-opt { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #334155; cursor: pointer; user-select: none; }
        .prt-modus-opt input { accent-color: hsl(12 90% 50%); width: 14px; height: 14px; cursor: pointer; }

        /* ── Footer ── */
        .prt-leeg { font-size: 13px; color: #64748b; }
        .prt-voet { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }

        @media print {
          .no-print { display: none !important; }
          .prt-voorblad { break-after: page; min-height: 0; }
          .prt-pagina { max-width: none; padding: 0; break-before: page; }
          @page { margin: 14mm; }
        }
        @media screen {
          .prt-root { background: #f1f5f9; min-height: 100vh; }
          .prt-voorblad { max-width: 960px; box-shadow: 0 1px 3px rgba(0,0,0,.1); margin: 24px auto; min-height: 860px; }
          .prt-pagina { background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.1); margin: 24px auto; }
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
              <input type="checkbox" checked={toonSpotDetails} onChange={e => setToonSpotDetails(e.target.checked)} />
              Spot-detailpagina's
            </label>
          </div>
        </div>
        <Button size="sm" onClick={() => window.print()} disabled={!allesGereed}>
          {allesGereed ? <Printer className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
          {allesGereed ? "Afdrukken / Opslaan als PDF" : "Voorbereiden…"}
        </Button>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          PAGINA 1 — VOORBLAD
      ════════════════════════════════════════════════════════════════ */}
      <div className="prt-voorblad">
        <div className="prt-cover-top">
          <img src={logoSrc} alt="FPS Brandpreventie" className="prt-cover-logo" />
        </div>

        <div className="prt-cover-main">
          <div className="prt-cover-accentlijn" />
          <div className="prt-cover-type">{REPORT_TITEL}</div>
          <div className="prt-cover-naam">{gebouw.naam}</div>
          {(gebouw.adres || gebouw.stad) && (
            <div className="prt-cover-adres">
              {[gebouw.adres, gebouw.stad].filter(Boolean).join(", ")}
            </div>
          )}
          <div className="prt-cover-meta">
            {gebouw.projectnummer && (
              <div className="prt-cover-meta-rij">
                <span className="prt-cover-meta-lbl">Projectnummer</span>
                <span>{gebouw.projectnummer}</span>
              </div>
            )}
            {gebouw.werknummer && (
              <div className="prt-cover-meta-rij">
                <span className="prt-cover-meta-lbl">Werknummer</span>
                <span>{gebouw.werknummer}</span>
              </div>
            )}
            {opdrachtgevers.length > 0 && (
              <div className="prt-cover-meta-rij">
                <span className="prt-cover-meta-lbl">Opdrachtgever</span>
                <span>{opdrachtgevers[0].naam}</span>
              </div>
            )}
            {gebouw.gereed_op && (
              <div className="prt-cover-meta-rij">
                <span className="prt-cover-meta-lbl">Gereedgemeld op</span>
                <span>{datumNL(gebouw.gereed_op)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="prt-cover-voet">
          <div>
            <div className="prt-cover-voet-merk">FPS Brandpreventie</div>
            <div className="prt-cover-voet-tagline">Brandveiligheid door vakmanschap</div>
          </div>
          <div className="prt-cover-voet-rechts">
            <div>Documentnummer: <span className="prt-cover-voet-waarde">{documentnummer}</span></div>
            <div>Rapportdatum: <span className="prt-cover-voet-waarde">{rapportDatum}</span></div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          PAGINA 2 — RAPPORTGEGEVENS
      ════════════════════════════════════════════════════════════════ */}
      <div className="prt-pagina">
        <div className="prt-pagina-kop">
          <img src={logoSrc} alt="FPS Brandpreventie" />
          <div className="prt-pagina-kop-info">
            <div><strong>{titel}</strong></div>
            <div>Rapportgegevens</div>
          </div>
        </div>

        <section className="prt-sectie">
          <h2 className="prt-sectie-titel">Rapportgegevens</h2>
          <div className="prt-grid">
            <div><div className="lbl">Rapporttitel</div><div className="val">{REPORT_TITEL}</div></div>
            <div><div className="lbl">Project</div><div className="val">{titel}</div></div>
            <div><div className="lbl">Documentnummer</div><div className="val">{documentnummer}</div></div>
            <div><div className="lbl">Rapportversie</div><div className="val">{rapportVersie}</div></div>
            <div><div className="lbl">Rapportdatum</div><div className="val">{rapportDatum}</div></div>
            <div><div className="lbl">Opgesteld door</div><div className="val">{opsteller}</div></div>
            <div><div className="lbl">Gegenereerd op</div><div className="val">{exportDatum}</div></div>
            {gebouw.gereed_op && (
              <div><div className="lbl">Gereedgemeld op</div><div className="val">{datumNL(gebouw.gereed_op)}</div></div>
            )}
            {gebouw.gereed_door && (
              <div><div className="lbl">Gereedgemeld door</div><div className="val">{gebouw.gereed_door}</div></div>
            )}
          </div>
        </section>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          PAGINA 3 — PROJECTINFORMATIE
      ════════════════════════════════════════════════════════════════ */}
      <div className="prt-pagina">
        <div className="prt-pagina-kop">
          <img src={logoSrc} alt="FPS Brandpreventie" />
          <div className="prt-pagina-kop-info">
            <div><strong>{titel}</strong></div>
            <div>Projectinformatie</div>
          </div>
        </div>

        {projectOmschrijving && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">Projectomschrijving</h2>
            <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.65, whiteSpace: "pre-line" }}>
              {projectOmschrijving}
            </p>
          </section>
        )}

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

        {heeftDocumenten && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">Projectkaders en documenten</h2>

            {projectTekeningen.length > 0 && (
              <>
                <div className="prt-tegel-koplabel" style={{ marginTop: 4 }}>Tekeningen</div>
                <table className="prt-tabel">
                  <thead>
                    <tr>
                      <th>Naam</th>
                      <th>Type</th>
                      <th>Schaal</th>
                      <th>Datum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectTekeningen.map(t => (
                      <tr key={t.id}>
                        <td>{t.naam}</td>
                        <td>{TEKENING_TYPELABEL[t.type] ?? t.type}</td>
                        <td>{t.schaal || "—"}</td>
                        <td>{datumNL(t.aangemaakt_op)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {projectEmails.length > 0 && (
              <>
                <div className="prt-tegel-koplabel" style={{ marginTop: 12 }}>Correspondentie en e-mails</div>
                <table className="prt-tabel">
                  <thead>
                    <tr>
                      <th>Onderwerp</th>
                      <th>Afzender</th>
                      <th>Datum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectEmails.map(e => (
                      <tr key={e.id}>
                        <td>{e.onderwerp || e.bestandsnaam}</td>
                        <td>{e.afzender || "—"}</td>
                        <td>{e.datum ? datumNL(e.datum) : datumNL(e.aangemaakt_op)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        )}

        {totaalSpots > 0 && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">Spotsamenvatting en voortgang</h2>
            <div className="prt-grid" style={{ marginBottom: 14 }}>
              <div><div className="lbl">Totaal spots</div><div className="val">{totaalSpots}</div></div>
              <div>
                <div className="lbl">Gereed</div>
                <div className="val" style={{ color: "#16a34a" }}>
                  {stats?.goedgekeurd ?? 0}
                  {totaalSpots > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#64748b", marginLeft: 5 }}>
                      ({Math.round(((stats?.goedgekeurd ?? 0) / totaalSpots) * 100)}%)
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="lbl">Afgekeurd</div>
                <div className="val" style={{ color: "#dc2626" }}>
                  {stats?.afgekeurd ?? 0}
                  {totaalSpots > 0 && (stats?.afgekeurd ?? 0) > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#64748b", marginLeft: 5 }}>
                      ({Math.round(((stats?.afgekeurd ?? 0) / totaalSpots) * 100)}%)
                    </span>
                  )}
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

        {teamleden.length > 0 && (
          <section className="prt-sectie">
            <h2 className="prt-sectie-titel">FPS Projectteam</h2>
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
      </div>

      {/* ════════════════════════════════════════════════════════════════
          PAGINA 3 — UITGANGSPUNTEN EN JURIDISCHE TOELICHTING
      ════════════════════════════════════════════════════════════════ */}
      <div className="prt-pagina">
        <div className="prt-pagina-kop">
          <img src={logoSrc} alt="FPS Brandpreventie" />
          <div className="prt-pagina-kop-info">
            <div><strong>{titel}</strong></div>
            <div>Uitgangspunten en juridische toelichting</div>
          </div>
        </div>

        <section className="prt-sectie">
          <h2 className="prt-sectie-titel">Doel en reikwijdte</h2>
          <div className="prt-juridisch">
            <p>
              Dit rapport beschrijft de status van de geregistreerde brandpreventieve voorzieningen
              in het genoemde gebouw, samengesteld door FPS Brandpreventie op basis van de gegevens
              die op de rapportdatum beschikbaar waren in het digitale beheersysteem. Het rapport is
              bestemd voor de opdrachtgever en de betrokken installerende, controlerende en
              beherende partijen.
            </p>
            <p>
              De inhoud omvat een overzicht van alle geregistreerde spots (brandwerende
              voorzieningen), inclusief locatieaanduidingen op bouwlaagniveau, statusinformatie,
              gekoppelde productcertificaten en ETA's en — indien van toepassing — foto-documentatie.
            </p>
          </div>
        </section>

        <section className="prt-sectie">
          <h2 className="prt-sectie-titel">Toepasselijke normen en regelgeving</h2>
          <div className="prt-juridisch">
            <p>
              De geregistreerde voorzieningen zijn, afhankelijk van het type, beoordeeld op basis
              van de volgende normen en regelgeving:
            </p>
            <ul>
              <li>
                <strong>Besluit bouwwerken leefomgeving (Bbl)</strong> — wettelijke eisen voor
                brandveiligheid in bouwwerken onder de Omgevingswet (sinds 1 januari 2024, als
                opvolger van het Bouwbesluit 2012), inclusief vereiste WBDBO en rookwerendheid per
                gebruiksfunctie.
              </li>
              <li>
                <strong>NEN 6068</strong> — bepalingsmethode voor de bijdrage tot branduitbreiding
                via straling en vliegvuur.
              </li>
              <li>
                <strong>NEN 6069</strong> — beproevingsmethode brandwerendheid van bouwdelen.
              </li>
              <li>
                <strong>EN 1634-1</strong> — beproevingsmethode brandwerendheid van deuren, luiken
                en openingen (integriteit en isolatie).
              </li>
              <li>
                <strong>EN 1366-3</strong> — brandwerendheidsbeproeving van
                installatieproducten — doorvoeringen.
              </li>
              <li>
                <strong>EN 1366-4</strong> — brandwerendheidsbeproeving van
                installatieproducten — brandkleppen en brandgaskleppen.
              </li>
              <li>
                <strong>EN 13501-1</strong> — brandclassificatie van bouwproducten en bouwdelen
                op basis van reactie op brand.
              </li>
              <li>
                <strong>CPR-verordening (EU 305/2011)</strong> — verplichting tot opstellen van
                een prestatieverklaring (DoP) en CE-markering voor bouwproducten die vallen onder
                een geharmoniseerde Europese norm.
              </li>
            </ul>
          </div>
        </section>

        <section className="prt-sectie">
          <h2 className="prt-sectie-titel">Werkwijze en uitgangspunten</h2>
          <div className="prt-juridisch">
            <h3>Registratie en locatiebepaling</h3>
            <p>
              Alle voorzieningslocaties zijn digitaal vastgelegd op de beschikbare bouwkundige
              plattegrond per bouwlaag. Coördinaten worden opgeslagen op een vaste
              renderingsschaal zodat locaties consistent worden weergegeven in alle rapportages
              en op de mobiele inspectiehulp.
            </p>
            <h3>Status en beoordeling</h3>
            <p>
              De status van een voorziening wordt beheerd door monteurs en controleurs
              en doorloopt een vaste cyclus:{" "}
              <em>Concept &rarr; In uitvoering &rarr; Opgeleverd &rarr; Gereed</em>. Alleen
              voorzieningen met de status Gereed zijn definitief geaccordeerd binnen het
              beheersysteem.
            </p>
            <h3>Productdocumentatie en toepassingen</h3>
            <p>
              Aan elke spot kunnen toepassingen (labels) worden gekoppeld uit de centrale
              productbibliotheek. Een toepassing verwijst naar een fabrikantspecifiek product
              met bijbehorende testnorm en/of prestatieverklaring. De verantwoordelijkheid voor
              de juistheid van de fabrikantdocumentatie berust bij de betreffende fabrikant.
            </p>
          </div>
        </section>

        <section className="prt-sectie">
          <h2 className="prt-sectie-titel">Gereedmelding en oplevering</h2>
          <div className="prt-juridisch">
            <p>
              Bij het ontbreken van een afzonderlijk proces-verbaal van oplevering geldt dit
              opleverrapport als het opleverdocument van het project.
            </p>
            <p>
              Indien de opdrachtgever niet binnen veertien (14) dagen na verzending van dit rapport
              schriftelijk en gemotiveerd reageert, wordt de opdracht als juridisch gereedgemeld
              beschouwd en geldt dit rapport als definitief.
            </p>
            <p>
              Na het verstrijken van deze termijn wordt het definitieve rapport niet meer gewijzigd.
              Opmerkingen of beoordelingen van externe partijen die na deze termijn worden ontvangen,
              hebben geen invloed op de status van dit document, behoudens aantoonbaar onjuiste
              uitvoering, verborgen gebreken of vergelijkbare uitzonderingen die op grond van de wet
              of de overeenkomst voor rekening van FPS Brandpreventie komen.
            </p>
          </div>
        </section>

        <section className="prt-sectie">
          <h2 className="prt-sectie-titel">Disclaimer en aansprakelijkheid</h2>
          <div className="prt-juridisch">
            <p>
              Dit rapport is samengesteld op basis van de op het moment van opstellen beschikbare
              gegevens in het beheersysteem van FPS Brandpreventie. FPS Brandpreventie staat in
              voor een zorgvuldige registratie, maar aanvaardt geen aansprakelijkheid voor
              onjuistheden die het gevolg zijn van:
            </p>
            <ul>
              <li>onvolledige of onjuiste aanlevering van informatie door opdrachtgever of derden;</li>
              <li>wijzigingen in het gebouw of de installaties na de registratiedatum;</li>
              <li>afwijkingen in de door de fabrikant verstrekte productdocumentatie.</li>
            </ul>
            <p>
              Uitsluitend de meest recent bijgewerkte versie van dit rapport, gegenereerd vanuit het
              beheersysteem, geldt als geldig document, met inachtneming van het bepaalde onder
              &ldquo;Gereedmelding en oplevering&rdquo;.
            </p>
            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 16, fontStyle: "italic" }}>
              FPS Brandpreventie — Brandveiligheid door vakmanschap
            </p>
          </div>
        </section>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          PAGINA 4+ — RAPPORTINHOUD
      ════════════════════════════════════════════════════════════════ */}
      <div className="prt-pagina">
        <div className="prt-pagina-kop">
          <img src={logoSrc} alt="FPS Brandpreventie" />
          <div className="prt-pagina-kop-info">
            <div><strong>{titel}</strong></div>
            <div>Rapportinhoud — plattegronden en voorzieningen</div>
          </div>
        </div>

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
                toonSpotDetails={toonSpotDetails}
              />
            ))
          )}
        </section>

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

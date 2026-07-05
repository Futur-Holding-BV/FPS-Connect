// Visual Guidance Engine (VGE) — selectiepijplijn
// Ontwerp: docs/ai-visual-guidance-framework.md §6
//
// Harde regels:
//  - selecteert UITSLUITEND uit fps_visuals waar actief=true EN bron_type geldig
//  - verzint nooit technische specificaties
//  - max. 3 visuals per stap (VisualSet)
//  - fallback bij lege library: aandachtspunten als tekst, geen foutmelding

import { db, fpsVisualsTable, vgeEffectiviteitslogTable } from "@workspace/db";
import type { FpsVisual } from "@workspace/db";
import { eq, and, sql, avg, inArray } from "drizzle-orm";
import { logger } from "./logger";

// ── Typen ─────────────────────────────────────────────────────────────────────

export type StapType = "voorbereiding" | "montage" | "controle" | "foto";

export interface StapContext {
  stapId: number;
  spotType: string | null;
  stapType: StapType;
  toepassingId?: number | null;
  klantId?: number | null;
}

export interface VisualAsset {
  id: number;
  naam: string;
  visualType: string;
  bronType: string;
  // Raw object storage path (e.g. /visuals/12/thumb.jpg). Mobile app constructs
  // the absolute URL: https://${DOMAIN}/api/storage${objectPath} + bearer header.
  objectPath: string;
  effectiviteitsScore?: number;
}

export interface VisualSet {
  watZieJeNu: VisualAsset | null;
  watIsEindresultaat: VisualAsset | null;
  hoeDoejeDit: VisualAsset | null;
  aandachtspunten: string[];
  veiligheidsrisicos: string[];
  maxVisualsGetoond: number;
  gegenereersdOp: string;
  vgeVersie: string;
}

// ── Visual-types per stap-type ────────────────────────────────────────────────

const VISUAL_TYPES_PER_STAPTYPE: Record<StapType, string[]> = {
  voorbereiding: [
    "projecttekening_uitsnede",
    "productblad",
    "exploded_view",
    "3d_weergave",
  ],
  montage: [
    "detailtekening",
    "animatie",
    "montagevoorschrift",
    "schema",
    "referentiefoto",
  ],
  controle: ["checklist", "referentiefoto", "detailtekening"],
  foto: ["referentiefoto"],
};

// Prioriteitsvolgorde binnen een stap — instructie > referentie > checklist
const PRIORITEIT_VOLGORDE: Record<string, number> = {
  montagevoorschrift: 1,
  animatie: 2,
  detailtekening: 3,
  exploded_view: 4,
  schema: 5,
  projecttekening_uitsnede: 6,
  productblad: 7,
  referentiefoto: 8,
  checklist: 9,
  "3d_weergave": 10,
};

// Geldige bron-types (HARD CONSTRAINT — zie framework §2.3)
const GELDIGE_BRON_TYPES = [
  "projecttekening",
  "ETA",
  "DoP",
  "montagevoorschrift",
  "fps_standaard",
  "praktijkfoto",
  "productblad",
];

// ── Ruwe opslagpad ophalen (geen /api/storage/ prefix) ────────────────────────
// De mobile app bouwt de volledige URL: https://${DOMAIN}/api/storage${pad}
// met Bearer-auth header — zie plattegrond/[verdiepingId].tsx als referentie.

function getRawStoragePath(visual: FpsVisual): string {
  const pad = visual.thumbnailPath ?? visual.objectPath;
  // Zorg dat het pad altijd met / begint en GEEN /api/storage/ prefix heeft.
  const normalized = pad.startsWith("/") ? pad : `/${pad}`;
  return normalized;
}

// ── Effectiviteitsscores ophalen ──────────────────────────────────────────────

async function haalEffectiviteitsScores(
  visualIds: number[],
  spotType: string,
  stapType: string,
): Promise<Map<number, number>> {
  if (visualIds.length === 0) return new Map();

  try {
    const rows = await db
      .select({
        visualId: vgeEffectiviteitslogTable.visualId,
        score: avg(
          sql<number>`CASE WHEN ${vgeEffectiviteitslogTable.herstelwerkNodig} THEN 0 ELSE 1 END`,
        ),
      })
      .from(vgeEffectiviteitslogTable)
      .where(
        and(
          eq(vgeEffectiviteitslogTable.spotType, spotType),
          eq(vgeEffectiviteitslogTable.stapType, stapType),
        ),
      )
      .groupBy(vgeEffectiviteitslogTable.visualId);

    const scores = new Map<number, number>();
    for (const row of rows) {
      const s = typeof row.score === "string" ? parseFloat(row.score) : (row.score ?? 0.5);
      scores.set(row.visualId, isNaN(s) ? 0.5 : s);
    }
    return scores;
  } catch (err) {
    logger.warn({ err }, "vgeService: effectiviteitsscores ophalen mislukt");
    return new Map();
  }
}

// ── Stap 1+2: kandidaten ophalen en filteren op staptype ─────────────────────

async function haalKandidaten(
  spotType: string | null,
  stapType: StapType,
): Promise<FpsVisual[]> {
  const toegestaneTypes = VISUAL_TYPES_PER_STAPTYPE[stapType];

  if (spotType) {
    // Gebruik SQL array-overlap operator && voor GIN-index.
    // spotType als parameterized waarde ($1) — geen sql.raw zodat SQL-injectie
    // structureel onmogelijk is, ongeacht de waarde in de database.
    const rows = await db
      .select()
      .from(fpsVisualsTable)
      .where(
        and(
          eq(fpsVisualsTable.actief, true),
          inArray(fpsVisualsTable.bronType, GELDIGE_BRON_TYPES),
          sql`${fpsVisualsTable.spotType} && ARRAY[${spotType}]::text[]`,
          inArray(fpsVisualsTable.visualType, toegestaneTypes),
        ),
      );
    return rows;
  } else {
    // Geen spot_type bekend — filteer alleen op stap_type en actief/bron
    const rows = await db
      .select()
      .from(fpsVisualsTable)
      .where(
        and(
          eq(fpsVisualsTable.actief, true),
          inArray(fpsVisualsTable.bronType, GELDIGE_BRON_TYPES),
          inArray(fpsVisualsTable.visualType, toegestaneTypes),
        ),
      );
    return rows;
  }
}

// ── Stap 3+4: sorteren en max 3 kiezen ───────────────────────────────────────

function sorteerEnKies(
  kandidaten: FpsVisual[],
  scores: Map<number, number>,
): FpsVisual[] {
  return [...kandidaten]
    .sort((a, b) => {
      // Primair: hoger gerangschikte visual-types
      const prioriteitA = PRIORITEIT_VOLGORDE[a.visualType] ?? 99;
      const prioriteitB = PRIORITEIT_VOLGORDE[b.visualType] ?? 99;
      if (prioriteitA !== prioriteitB) return prioriteitA - prioriteitB;

      // Secundair: KB-koppeling (bedrijfsstandaard of artikel)
      const kbA = a.bedrijfsstandaardId ? 1 : a.artikelId ? 1 : 0;
      const kbB = b.bedrijfsstandaardId ? 1 : b.artikelId ? 1 : 0;
      if (kbA !== kbB) return kbB - kbA;

      // Tertiair: effectiviteitsscore DESC
      const scoreA = scores.get(a.id) ?? 0.5;
      const scoreB = scores.get(b.id) ?? 0.5;
      if (scoreA !== scoreB) return scoreB - scoreA;

      // Quaternair: nieuwste eerst
      return (b.aangemaaktOp?.getTime() ?? 0) - (a.aangemaaktOp?.getTime() ?? 0);
    })
    .slice(0, 3);
}

// ── VisualSet samenstellen uit gekozen visuals ────────────────────────────────

function bouwVisualSet(
  gekozen: FpsVisual[],
  scores: Map<number, number>,
  stapType: StapType,
): VisualSet {
  // Slot 1: "Wat zie je nu" (voorbereiding/controle) of "Hoe doe je dit" (montage/foto)
  // Slot 2: "Wat is het eindresultaat" (referentiefoto bij voorkeur)
  // Slot 3: "Hoe doe je dit" (instructie/tekening)

  let watZieJeNu: VisualAsset | null = null;
  let watIsEindresultaat: VisualAsset | null = null;
  let hoeDoejeDit: VisualAsset | null = null;

  const referenties = gekozen.filter((v) => v.visualType === "referentiefoto");
  const instructies = gekozen.filter((v) =>
    ["montagevoorschrift", "animatie", "detailtekening", "schema", "checklist"].includes(v.visualType),
  );
  const overige = gekozen.filter(
    (v) => !referenties.includes(v) && !instructies.includes(v),
  );

  if (stapType === "voorbereiding") {
    // Slot 1: overzichtstekening of productblad
    const overzicht = overige[0] ?? instructies[0] ?? null;
    watZieJeNu = overzicht ? toVisualAsset(overzicht, scores) : null;
    watIsEindresultaat = referenties[0] ? toVisualAsset(referenties[0], scores) : null;
    hoeDoejeDit = instructies[0] && instructies[0] !== overzicht
      ? toVisualAsset(instructies[0], scores)
      : null;
  } else if (stapType === "controle") {
    watZieJeNu = referenties[0] ? toVisualAsset(referenties[0], scores) : null;
    hoeDoejeDit = instructies[0] ? toVisualAsset(instructies[0], scores) : null;
    watIsEindresultaat = referenties[1] ? toVisualAsset(referenties[1], scores) : null;
  } else {
    // montage | foto
    hoeDoejeDit = instructies[0] ? toVisualAsset(instructies[0], scores) : null;
    watIsEindresultaat = referenties[0] ? toVisualAsset(referenties[0], scores) : null;
    const rest = gekozen.find(
      (v) => v !== instructies[0] && v !== referenties[0],
    );
    watZieJeNu = rest ? toVisualAsset(rest, scores) : null;
  }

  const getoondAantal = [watZieJeNu, watIsEindresultaat, hoeDoejeDit].filter(Boolean).length;

  return {
    watZieJeNu,
    watIsEindresultaat,
    hoeDoejeDit,
    aandachtspunten: [],
    veiligheidsrisicos: [],
    maxVisualsGetoond: getoondAantal,
    gegenereersdOp: new Date().toISOString(),
    vgeVersie: "1.0",
  };
}

function toVisualAsset(visual: FpsVisual, scores: Map<number, number>): VisualAsset {
  return {
    id: visual.id,
    naam: visual.naam,
    visualType: visual.visualType,
    bronType: visual.bronType,
    objectPath: getRawStoragePath(visual),
    effectiviteitsScore: scores.get(visual.id),
  };
}

// ── Hoofdfunctie ─────────────────────────────────────────────────────────────

export async function selectVisuals(ctx: StapContext): Promise<VisualSet> {
  const legeSet: VisualSet = {
    watZieJeNu: null,
    watIsEindresultaat: null,
    hoeDoejeDit: null,
    aandachtspunten: [],
    veiligheidsrisicos: [],
    maxVisualsGetoond: 0,
    gegenereersdOp: new Date().toISOString(),
    vgeVersie: "1.0",
  };

  try {
    // Stap 1+2: kandidaten ophalen
    const kandidaten = await haalKandidaten(ctx.spotType, ctx.stapType);
    if (kandidaten.length === 0) return legeSet;

    // Stap 3: effectiviteitsscores
    const kandidaatIds = kandidaten.map((v) => v.id);
    const scores = ctx.spotType
      ? await haalEffectiviteitsScores(kandidaatIds, ctx.spotType, ctx.stapType)
      : new Map<number, number>();

    // Stap 4: sorteren en max 3 kiezen
    const gekozen = sorteerEnKies(kandidaten, scores);
    if (gekozen.length === 0) return legeSet;

    return bouwVisualSet(gekozen, scores, ctx.stapType);
  } catch (err) {
    logger.warn({ err }, "vgeService.selectVisuals: fout, lege set teruggeven");
    return legeSet;
  }
}

// ── Stap-type afleiden uit instructie_json ────────────────────────────────────
// Gebruikt wanneer de stap geen expliciete stap_type heeft.

export function afleidenStapType(
  instructieJson: Record<string, unknown> | null,
  volgorde: number,
): StapType {
  if (!instructieJson) return volgorde === 1 ? "voorbereiding" : "montage";

  // Als de stap een expliciete stap_type heeft (AI kan dit opgeven)
  const explicit = instructieJson.stap_type;
  if (
    explicit === "voorbereiding" ||
    explicit === "montage" ||
    explicit === "controle" ||
    explicit === "foto"
  ) {
    return explicit;
  }

  // Heuristiek: fotostap als foto_opdracht aanwezig is én weinig andere inhoud
  const heeftFoto = Boolean(instructieJson.foto_opdracht);
  const heeftHandeling = Boolean(instructieJson.handeling);
  const heeftControlevraag = Boolean(instructieJson.controlevraag);

  if (heeftFoto && !heeftHandeling && !heeftControlevraag) return "foto";
  if (heeftControlevraag && !heeftHandeling) return "controle";
  if (volgorde === 1) return "voorbereiding";
  return "montage";
}

// ── VisualSet serialiseren naar JSONB-formaat (§4.4) ─────────────────────────

export function serializeVisualSet(set: VisualSet): Record<string, unknown> {
  const slotNaarJson = (asset: VisualAsset | null) => {
    if (!asset) return null;
    return {
      visual_id: asset.id,
      naam: asset.naam,
      type: asset.visualType,
      bron_type: asset.bronType,
      object_path: asset.objectPath,
      effectiviteits_score: asset.effectiviteitsScore ?? null,
    };
  };

  return {
    wat_zie_je_nu: slotNaarJson(set.watZieJeNu),
    wat_is_eindresultaat: slotNaarJson(set.watIsEindresultaat),
    hoe_doe_je_dit: slotNaarJson(set.hoeDoejeDit),
    aandachtspunten: set.aandachtspunten,
    veiligheidsrisicos: set.veiligheidsrisicos,
    max_visuals_getoond: set.maxVisualsGetoond,
    gegenereerd_op: set.gegenereersdOp,
    vge_versie: set.vgeVersie,
  };
}

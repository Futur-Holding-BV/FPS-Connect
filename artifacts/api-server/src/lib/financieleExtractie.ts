// Financiele extractie-engine — haalt kerncijfers uit (geconsolideerde) jaarrekeningen.
//
// Twee paden, net als de Document Intelligence-engine:
//   1. AI-pad via de gedeelde aiGateway (wanneer beschikbaar);
//   2. heuristisch pad (regex/labelherkenning) dat ALTIJD werkt, ook zonder AI-gateway.
//
// Voor ELK cijfer wordt bronbewijs vastgelegd (pagina, tabel/sectie, oorspronkelijke
// tekst, methode, confidence) zodat een kerncijfer nooit zonder herkomst definitief
// kan worden. Deze module raakt de database NIET; de route bepaalt persistentie en
// koppelt document_id aan elk cijfer.
import { aiGateway, heeftGateway } from "./aiGateway";
import { logger } from "./logger";

export type Eenheid = "euro" | "aantal" | "percentage" | "ratio";
export type ExtractieMethode = "ai" | "heuristiek" | "berekend";

export interface GeextraheerdKerncijfer {
  sleutel: string;
  label: string;
  waarde: number | null;
  eenheid: Eenheid;
  isBerekend: boolean;
  bronPagina: number | null;
  bronTabel: string | null;
  bronTekst: string | null;
  extractieMethode: ExtractieMethode;
  confidence: number; // 0..1
}

export interface ExtractieBewijsStap {
  stap: string;
  resultaat: string;
  detail?: string;
}

export interface FinancieleExtractieResultaat {
  methode: "ai" | "heuristiek";
  aiBeschikbaar: boolean;
  cijfers: GeextraheerdKerncijfer[];
  bewijs: ExtractieBewijsStap[];
}

// ── Canonieke kerncijfer-catalogus ────────────────────────────────────────────
// Elk kerncijfer heeft een stabiele sleutel (losgekoppeld van het label), een
// Nederlands label, een eenheid, de logische sectie (bron_tabel) en labelpatronen
// voor het heuristische pad. De AI krijgt dezelfde sleutels aangereikt zodat beide
// paden dezelfde meerjaren-vergelijkbare dataset opleveren.
interface CatalogusItem {
  sleutel: string;
  label: string;
  eenheid: Eenheid;
  sectie: string;
  patronen: RegExp[];
}

const WV = "Winst-en-verliesrekening";
const BALANS = "Balans";
const KENGETAL = "Kengetallen";

export const KERNCIJFER_CATALOGUS: CatalogusItem[] = [
  { sleutel: "netto_omzet", label: "Netto-omzet", eenheid: "euro", sectie: WV,
    patronen: [/\bnetto[-\s]?omzet\b/i, /\bomzet\b/i, /\bopbrengsten\b/i] },
  { sleutel: "brutomarge", label: "Brutomarge", eenheid: "euro", sectie: WV,
    patronen: [/\bbruto[-\s]?marge\b/i, /\bbrutowinst\b/i] },
  { sleutel: "bedrijfsresultaat", label: "Bedrijfsresultaat", eenheid: "euro", sectie: WV,
    patronen: [/\bbedrijfsresultaat\b/i, /\bresultaat uit gewone bedrijfsuitoefening\b/i, /\bebit\b/i] },
  { sleutel: "resultaat_voor_belasting", label: "Resultaat voor belasting", eenheid: "euro", sectie: WV,
    patronen: [/\bresultaat voor belasting(en)?\b/i, /\bresultaat v[oó][oó]r belasting(en)?\b/i] },
  { sleutel: "netto_resultaat", label: "Netto-resultaat", eenheid: "euro", sectie: WV,
    patronen: [/\bnetto[-\s]?resultaat\b/i, /\bresultaat na belasting(en)?\b/i, /\bnettowinst\b/i, /\bjaarresultaat\b/i] },
  { sleutel: "balanstotaal", label: "Balanstotaal", eenheid: "euro", sectie: BALANS,
    patronen: [/\bbalanstotaal\b/i, /\btotaal activa\b/i, /\btotaal van de activa\b/i] },
  { sleutel: "eigen_vermogen", label: "Eigen vermogen", eenheid: "euro", sectie: BALANS,
    patronen: [/\beigen vermogen\b/i, /\bgroepsvermogen\b/i] },
  { sleutel: "vlottende_activa", label: "Vlottende activa", eenheid: "euro", sectie: BALANS,
    patronen: [/\bvlottende activa\b/i] },
  { sleutel: "kortlopende_schulden", label: "Kortlopende schulden", eenheid: "euro", sectie: BALANS,
    patronen: [/\bkortlopende schulden\b/i, /\bschulden op korte termijn\b/i] },
  { sleutel: "liquide_middelen", label: "Liquide middelen", eenheid: "euro", sectie: BALANS,
    patronen: [/\bliquide middelen\b/i, /\bgeldmiddelen\b/i] },
  { sleutel: "personeelskosten", label: "Personeelskosten", eenheid: "euro", sectie: WV,
    patronen: [/\bpersoneelskosten\b/i, /\blonen en salarissen\b/i] },
  { sleutel: "gemiddeld_aantal_fte", label: "Gemiddeld aantal FTE", eenheid: "aantal", sectie: KENGETAL,
    patronen: [/\bgemiddeld aantal (fte|werknemers|medewerkers)\b/i, /\baantal fte\b/i] },
];

const CATALOGUS_OP_SLEUTEL = new Map(KERNCIJFER_CATALOGUS.map((c) => [c.sleutel, c]));

// ── Getalparser (Nederlands financieel formaat) ──────────────────────────────
// Punt = duizendtalscheiding, komma = decimaal. Haakjes of een leidend minteken
// duiden een negatief bedrag aan. Retourneert null als er geen plausibel getal is.
export function parseNederlandsGetal(ruw: string): number | null {
  if (!ruw) return null;
  let s = ruw.trim();
  let negatief = false;
  // Haakjes rond het bedrag = negatief (boekhoudkundige conventie).
  if (/^\(.*\)$/.test(s)) {
    negatief = true;
    s = s.slice(1, -1);
  }
  // Verwijder valuta- en spatietekens.
  s = s.replace(/[€$\s\u00a0]/g, "");
  if (/^-/.test(s)) {
    negatief = true;
    s = s.replace(/^-/, "");
  }
  // Alleen cijfers, punten en komma's toegestaan.
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  // Punt = duizendtal, komma = decimaal.
  s = s.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negatief ? -n : n;
}

// Vindt alle getaltokens in een tekstregel (met hun ruwe vorm), meest links eerst.
function vindGetallenInRegel(regel: string): string[] {
  const treffers = regel.match(/\(?-?\s*€?\s*\d[\d.]*(?:,\d+)?\)?/g);
  if (!treffers) return [];
  return treffers.map((t) => t.trim()).filter((t) => /\d/.test(t));
}

// ── Pagina-opdeling ───────────────────────────────────────────────────────────
// pdf-parse voegt tussen pagina's vaak een form feed (\f) toe. We splitsen daarop
// zodat we per treffer de bronpagina kunnen bepalen. Zonder \f is de pagina null.
function splitsPaginas(tekst: string): string[] | null {
  if (tekst.includes("\f")) {
    return tekst.split("\f");
  }
  return null;
}

function bepaalPagina(paginas: string[] | null, regel: string): number | null {
  if (!paginas) return null;
  for (let i = 0; i < paginas.length; i++) {
    if (paginas[i].includes(regel)) return i + 1;
  }
  return null;
}

// ── Schaalfactor (×1.000-notatie) ─────────────────────────────────────────────
// Nederlandse jaarrekeningen vermelden vaak "bedragen in duizenden euro's",
// "alle bedragen × € 1.000" of "EUR '000". Zonder correctie zijn heuristisch
// gevonden eurobedragen dan een factor 1.000 te laag. Detectie alleen bij een
// expliciete vermelding in de tekst; nooit gokken.
const SCHAAL_PATRONEN: RegExp[] = [
  /bedragen\s+(?:zijn\s+)?(?:vermeld\s+|weergegeven\s+|uitgedrukt\s+)?in\s+(?:€\s*)?duizenden/i,
  /in\s+duizenden\s+euro/i,
  /[x×]\s*€?\s*1\.000\b/i,
  /\(\s*€?\s*1\.000\s*\)/i,
  /\beur\s*['’]000\b/i,
  /€\s*['’]000\b/i,
];

export function bepaalSchaalfactor(tekst: string): 1 | 1000 {
  return SCHAAL_PATRONEN.some((p) => p.test(tekst)) ? 1000 : 1;
}

// ── Heuristisch pad ───────────────────────────────────────────────────────────
export function extraheerKerncijfersHeuristisch(tekst: string): GeextraheerdKerncijfer[] {
  const cijfers: GeextraheerdKerncijfer[] = [];
  if (!tekst || tekst.trim().length === 0) return cijfers;
  const paginas = splitsPaginas(tekst);
  const regels = tekst.split(/\r?\n/).map((r) => r.trim()).filter((r) => r.length > 0);
  const schaalfactor = bepaalSchaalfactor(tekst);

  for (const item of KERNCIJFER_CATALOGUS) {
    let gevonden: GeextraheerdKerncijfer | null = null;
    for (const regel of regels) {
      if (!item.patronen.some((p) => p.test(regel))) continue;
      const getallen = vindGetallenInRegel(regel);
      if (getallen.length === 0) continue;
      // Eerste getal ná het label = huidig boekjaar (kolom links); prior jaar staat rechts.
      const waarde = parseNederlandsGetal(getallen[0]);
      if (waarde === null) continue;
      // Schaal alleen eurobedragen; percentages, ratio's en aantallen (FTE) nooit.
      const schalen = item.eenheid === "euro" && schaalfactor !== 1;
      // Confidence: meer signalen (meerdere kolommen = duidelijke tabelregel) = hoger.
      const confidence = Math.min(0.55 + (getallen.length >= 2 ? 0.15 : 0) + 0.1, 0.8);
      gevonden = {
        sleutel: item.sleutel,
        label: item.label,
        waarde: schalen ? waarde * schaalfactor : waarde,
        eenheid: item.eenheid,
        isBerekend: false,
        bronPagina: bepaalPagina(paginas, regel),
        bronTabel: item.sectie,
        bronTekst: schalen
          ? `${regel.slice(0, 250)} [×1.000-notatie in document toegepast]`
          : regel.slice(0, 300),
        extractieMethode: "heuristiek",
        confidence,
      };
      break; // eerste plausibele treffer wint
    }
    if (gevonden) cijfers.push(gevonden);
  }
  return cijfers;
}

// ── Afgeleide kengetallen ─────────────────────────────────────────────────────
// Berekende cijfers (solvabiliteit, current ratio) worden expliciet als isBerekend
// gemarkeerd met een bronTekst die de berekening beschrijft — geen "gevonden" cijfer.
export function berekenAfgeleideKengetallen(cijfers: GeextraheerdKerncijfer[]): GeextraheerdKerncijfer[] {
  const kaart = new Map(cijfers.map((c) => [c.sleutel, c]));
  const heeft = (s: string) => kaart.has(s) && typeof kaart.get(s)!.waarde === "number";
  const waardeVan = (s: string) => kaart.get(s)!.waarde as number;
  const afgeleid: GeextraheerdKerncijfer[] = [];

  if (!kaart.has("solvabiliteit") && heeft("eigen_vermogen") && heeft("balanstotaal") && waardeVan("balanstotaal") !== 0) {
    const pct = (waardeVan("eigen_vermogen") / waardeVan("balanstotaal")) * 100;
    afgeleid.push({
      sleutel: "solvabiliteit", label: "Solvabiliteit", waarde: Math.round(pct * 10) / 10, eenheid: "percentage",
      isBerekend: true, bronPagina: null, bronTabel: KENGETAL,
      bronTekst: "Berekend: eigen vermogen / balanstotaal × 100", extractieMethode: "berekend", confidence: 0.9,
    });
  }
  if (!kaart.has("current_ratio") && heeft("vlottende_activa") && heeft("kortlopende_schulden") && waardeVan("kortlopende_schulden") !== 0) {
    const ratio = waardeVan("vlottende_activa") / waardeVan("kortlopende_schulden");
    afgeleid.push({
      sleutel: "current_ratio", label: "Current ratio", waarde: Math.round(ratio * 100) / 100, eenheid: "ratio",
      isBerekend: true, bronPagina: null, bronTabel: KENGETAL,
      bronTekst: "Berekend: vlottende activa / kortlopende schulden", extractieMethode: "berekend", confidence: 0.9,
    });
  }
  if (!kaart.has("werkkapitaal") && heeft("vlottende_activa") && heeft("kortlopende_schulden")) {
    const wk = waardeVan("vlottende_activa") - waardeVan("kortlopende_schulden");
    afgeleid.push({
      sleutel: "werkkapitaal", label: "Werkkapitaal", waarde: wk, eenheid: "euro",
      isBerekend: true, bronPagina: null, bronTabel: KENGETAL,
      bronTekst: "Berekend: vlottende activa − kortlopende schulden", extractieMethode: "berekend", confidence: 0.9,
    });
  }
  return afgeleid;
}

// ── AI-pad ────────────────────────────────────────────────────────────────────
const AI_SYSTEEM_PROMPT = `Je bent een financieel analist die kerncijfers uit een Nederlandse (geconsolideerde) jaarrekening haalt.
Geef UITSLUITEND geldig JSON terug in de vorm: {"cijfers":[{...}]}.
Elk cijfer-object heeft:
- "sleutel": exact één van de toegestane sleutels (zie lijst).
- "waarde": het bedrag als GEHEEL getal in euro's (of aantal bij FTE), zonder duizendscheiding; negatief bij verlies.
- "eenheid": "euro" | "aantal".
- "bron_pagina": paginanummer (integer) of null.
- "bron_tabel": de sectie waarin het cijfer staat (bijv. "Winst-en-verliesrekening", "Balans").
- "bron_tekst": de LETTERLIJKE bronregel waaruit je het cijfer haalt (max 200 tekens).
- "confidence": zekerheid tussen 0 en 1.
Neem alleen cijfers op die daadwerkelijk in de tekst staan. Verzin niets. Bij twijfel laat je het cijfer weg.
Gebruik het HUIDIGE boekjaar (meestal de eerste/linker kolom), niet het vergelijkende voorgaande jaar.`;

interface AiCijfer {
  sleutel?: unknown;
  waarde?: unknown;
  eenheid?: unknown;
  bron_pagina?: unknown;
  bron_tabel?: unknown;
  bron_tekst?: unknown;
  confidence?: unknown;
}

async function extraheerViaAi(tekst: string, gebruikerId: number | null): Promise<GeextraheerdKerncijfer[] | null> {
  if (!heeftGateway()) return null;
  const sleutelLijst = KERNCIJFER_CATALOGUS.map((c) => `${c.sleutel} (${c.label})`).join(", ");
  const bericht = [
    `Toegestane sleutels: ${sleutelLijst}.`,
    "",
    `Jaarrekening-tekst (${tekst.trim().length} tekens):`,
    tekst.trim().slice(0, 12000),
  ].join("\n");

  const resultaat = await aiGateway.chat(
    "reasoning",
    {
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
      messages: [
        { role: "system", content: AI_SYSTEEM_PROMPT },
        { role: "user", content: bericht },
      ],
    },
    undefined,
    { module: "financiele-extractie", functie: "extraheer-kerncijfers", gebruikerId: gebruikerId ?? undefined },
  );

  if (!resultaat.ok || !resultaat.inhoud) return null;
  let parsed: { cijfers?: unknown };
  try {
    parsed = JSON.parse(resultaat.inhoud);
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.cijfers)) return null;

  const cijfers: GeextraheerdKerncijfer[] = [];
  for (const ruw of parsed.cijfers as AiCijfer[]) {
    const sleutel = typeof ruw.sleutel === "string" ? ruw.sleutel : null;
    if (!sleutel) continue;
    const item = CATALOGUS_OP_SLEUTEL.get(sleutel);
    if (!item) continue; // onbekende sleutel → negeren (AI mag niets verzinnen)
    const waarde = typeof ruw.waarde === "number" && Number.isFinite(ruw.waarde)
      ? ruw.waarde
      : (typeof ruw.waarde === "string" ? parseNederlandsGetal(ruw.waarde) : null);
    if (waarde === null) continue;
    const conf = typeof ruw.confidence === "number" ? Math.max(0, Math.min(1, ruw.confidence)) : 0.75;
    cijfers.push({
      sleutel: item.sleutel,
      label: item.label,
      waarde,
      eenheid: item.eenheid,
      isBerekend: false,
      bronPagina: typeof ruw.bron_pagina === "number" ? ruw.bron_pagina : null,
      bronTabel: typeof ruw.bron_tabel === "string" ? ruw.bron_tabel.slice(0, 120) : item.sectie,
      bronTekst: typeof ruw.bron_tekst === "string" ? ruw.bron_tekst.slice(0, 300) : null,
      extractieMethode: "ai",
      confidence: conf,
    });
  }
  // Ontdubbel op sleutel (eerste wint).
  const gezien = new Set<string>();
  return cijfers.filter((c) => (gezien.has(c.sleutel) ? false : (gezien.add(c.sleutel), true)));
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
export async function extraheerKerncijfers(opts: {
  tekst: string | null;
  gebruikerId?: number | null;
}): Promise<FinancieleExtractieResultaat> {
  const bewijs: ExtractieBewijsStap[] = [];
  const tekst = opts.tekst ?? "";
  const aiBeschikbaar = heeftGateway();

  let cijfers: GeextraheerdKerncijfer[] = [];
  let methode: "ai" | "heuristiek" = "heuristiek";

  if (aiBeschikbaar && tekst.trim().length > 0) {
    try {
      const aiCijfers = await extraheerViaAi(tekst, opts.gebruikerId ?? null);
      if (aiCijfers && aiCijfers.length > 0) {
        cijfers = aiCijfers;
        methode = "ai";
        bewijs.push({ stap: "ai_extractie", resultaat: "voltooid", detail: `${aiCijfers.length} cijfers via AI` });
      } else {
        bewijs.push({ stap: "ai_extractie", resultaat: "geen_resultaat", detail: "AI leverde geen bruikbare cijfers; heuristiek gebruikt" });
      }
    } catch (err) {
      logger.warn({ err }, "AI-extractie kerncijfers mislukt, heuristische fallback");
      bewijs.push({ stap: "ai_extractie", resultaat: "mislukt", detail: "fallback naar heuristiek" });
    }
  } else {
    bewijs.push({ stap: "ai_extractie", resultaat: "overgeslagen", detail: aiBeschikbaar ? "geen tekst" : "AI-gateway niet beschikbaar" });
  }

  if (cijfers.length === 0) {
    cijfers = extraheerKerncijfersHeuristisch(tekst);
    methode = "heuristiek";
    bewijs.push({ stap: "heuristische_extractie", resultaat: "voltooid", detail: `${cijfers.length} cijfers via heuristiek` });
  }

  const afgeleid = berekenAfgeleideKengetallen(cijfers);
  if (afgeleid.length > 0) {
    cijfers = [...cijfers, ...afgeleid];
    bewijs.push({ stap: "afgeleide_kengetallen", resultaat: "berekend", detail: `${afgeleid.length} afgeleide kengetallen` });
  }

  bewijs.push({ stap: "extractie_totaal", resultaat: `${cijfers.length} kerncijfers`, detail: `primaire methode: ${methode}` });

  return { methode, aiBeschikbaar, cijfers, bewijs };
}

// Puur-functionele exports voor unit tests (geen DB/AI-netwerkcall nodig).
export const _test = {
  parseNederlandsGetal,
  extraheerKerncijfersHeuristisch,
  berekenAfgeleideKengetallen,
  bepaalSchaalfactor,
  KERNCIJFER_CATALOGUS,
};

// Contract-intelligentie — Task #524 (AI Financieel Adviseur & Contractenbibliotheek).
//
// Leunt op dezelfde pijplijn als de rest van het platform: de gedeelde aiGateway
// (met governance, timeouts en logging) en de PDF-tekstextractie (pdfTekst). Er
// wordt GEEN tweede classificatie-engine gebouwd; dit is een gespecialiseerde
// analyselaag boven de bestaande infrastructuur.
//
// Drie functies:
//   1. analyseerPolisDocument()  — AI-samenvatting + gestructureerde polisanalyse
//      (dekking, uitsluitingen, eigen risico, looptijd, premie, clausules) met per
//      onderdeel een bron en een zekerheidsniveau.
//   2. berekenBesparingskansen() — DETERMINISTISCHE kostenvergelijking en
//      besparingsadviezen (prijsstijging, ongebruikte abonnementen, overlappende
//      dekking). Bewust regelgebaseerd zodat elk advies exact herleidbaar is.
//   3. contractCoach()           — AI-advies per contract (risico's, beste
//      opzegmoment, financiele gevolgen in gewone taal) met bronvermelding.
//
// Kernprincipe: AI adviseert en signaleert, een mens beslist. Geen enkele functie
// zegt zelf een contract op of wijzigt het.
import { aiGateway, heeftGateway } from "./aiGateway";
import { logger } from "./logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PolisOnderdeel {
  waarde: string;
  bron: string | null; // waar in het document dit vandaan komt
  zekerheid: number; // 0..1
}

export interface PolisAnalyse {
  methode: "ai" | "geen-ai";
  aiBeschikbaar: boolean;
  samenvatting: string;
  dekking: PolisOnderdeel[];
  uitsluitingen: PolisOnderdeel[];
  eigenRisico: PolisOnderdeel | null;
  looptijd: PolisOnderdeel | null;
  premie: PolisOnderdeel | null;
  clausules: PolisOnderdeel[];
  waarschuwing: string | null;
}

export type BesparingType = "prijsstijging" | "ongebruikt" | "overlap" | "indexering";

export interface Besparingskans {
  type: BesparingType;
  contractId: number;
  contractNaam: string;
  leverancier: string | null;
  boodschap: string;
  // Geschatte jaarlijkse impact in euro (positief = potentiele besparing).
  bedrag: number | null;
  zekerheid: "hoog" | "middel" | "laag";
  // Bewijsvoering: exact welke gegevens tot dit advies leidden.
  bron: string;
  documentId: number | null;
}

export interface ContractCoachAdvies {
  methode: "ai" | "geen-ai";
  aiBeschikbaar: boolean;
  advies: string;
  risicos: string[];
  besteOpzegmoment: string | null;
  financieleGevolgen: string | null;
  bron: string;
  waarschuwing: string | null;
}

// Invoer voor de deterministische analyses. Bewust een smalle vorm zodat de route
// alleen de nodige velden hoeft te mappen.
export interface ContractInvoer {
  id: number;
  naam: string;
  categorie: string;
  leverancier: string | null;
  status: string;
  kostenBedrag: number | null;
  kostenPeriode: string; // maand | jaar | eenmalig
  indexeringPercentage: number | null;
  aantalLicenties: number | null;
  aantalInGebruik: number | null;
  laatstGebruiktOp: string | null; // ISO date
  einddatum: string | null;
  documentId: number | null;
}

export interface KostenSnapshot {
  contractId: number;
  jaar: number;
  bedrag: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// Zet kosten om naar een genormaliseerd jaarbedrag zodat contracten met
// verschillende periodes vergelijkbaar zijn.
export function jaarlijkseKosten(bedrag: number | null, periode: string): number | null {
  if (bedrag === null || !Number.isFinite(bedrag)) return null;
  if (periode === "maand") return bedrag * 12;
  if (periode === "eenmalig") return 0; // geen terugkerende last
  return bedrag; // jaar
}

function euro(bedrag: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(bedrag);
}

// ── 1. Polisanalyse (AI) ─────────────────────────────────────────────────────

const POLIS_SYSTEEM_PROMPT = [
  "Je bent een Nederlandse verzekerings- en contractanalist voor een brandpreventiebedrijf.",
  "Analyseer de aangeleverde contract-/polistekst en geef UITSLUITEND geldige JSON terug.",
  "Verzin niets: laat een veld leeg wanneer het niet in de tekst staat. Citeer per onderdeel",
  "een kort tekstfragment als 'bron' zodat een mens het kan controleren. Geef per onderdeel",
  "een 'zekerheid' tussen 0 en 1. Antwoord in het Nederlands.",
  "",
  "JSON-vorm:",
  "{",
  '  "samenvatting": "korte samenvatting in gewone taal",',
  '  "dekking": [{"waarde": "...", "bron": "...", "zekerheid": 0.0}],',
  '  "uitsluitingen": [{"waarde": "...", "bron": "...", "zekerheid": 0.0}],',
  '  "eigen_risico": {"waarde": "...", "bron": "...", "zekerheid": 0.0},',
  '  "looptijd": {"waarde": "...", "bron": "...", "zekerheid": 0.0},',
  '  "premie": {"waarde": "...", "bron": "...", "zekerheid": 0.0},',
  '  "clausules": [{"waarde": "...", "bron": "...", "zekerheid": 0.0}]',
  "}",
].join("\n");

interface RuwOnderdeel {
  waarde?: unknown;
  bron?: unknown;
  zekerheid?: unknown;
}

function mapOnderdeel(ruw: RuwOnderdeel | null | undefined): PolisOnderdeel | null {
  if (!ruw || typeof ruw.waarde !== "string" || ruw.waarde.trim() === "") return null;
  const zekerheid = typeof ruw.zekerheid === "number" ? Math.max(0, Math.min(1, ruw.zekerheid)) : 0.7;
  return {
    waarde: ruw.waarde.trim().slice(0, 500),
    bron: typeof ruw.bron === "string" ? ruw.bron.trim().slice(0, 300) : null,
    zekerheid,
  };
}

function mapLijst(ruw: unknown): PolisOnderdeel[] {
  if (!Array.isArray(ruw)) return [];
  const out: PolisOnderdeel[] = [];
  for (const r of ruw) {
    const m = mapOnderdeel(r as RuwOnderdeel);
    if (m) out.push(m);
  }
  return out;
}

export async function analyseerPolisDocument(
  tekst: string,
  opties: { categorie?: string; gebruikerId?: number | null; contractId?: number | null } = {},
): Promise<PolisAnalyse> {
  const leeg: PolisAnalyse = {
    methode: "geen-ai",
    aiBeschikbaar: false,
    samenvatting: "",
    dekking: [],
    uitsluitingen: [],
    eigenRisico: null,
    looptijd: null,
    premie: null,
    clausules: [],
    waarschuwing: null,
  };

  const schoon = (tekst ?? "").trim();
  if (schoon.length < 40) {
    return { ...leeg, waarschuwing: "Onvoldoende tekst in het brondocument om een polisanalyse te maken." };
  }
  if (!heeftGateway()) {
    return { ...leeg, waarschuwing: "AI-gateway niet beschikbaar. Voeg het brondocument toe en probeer opnieuw wanneer AI actief is." };
  }

  const bericht = [
    opties.categorie ? `Categorie: ${opties.categorie}.` : "",
    `Contract-/polistekst (${schoon.length} tekens):`,
    schoon.slice(0, 14000),
  ].filter(Boolean).join("\n");

  const resultaat = await aiGateway.chat(
    "reasoning",
    {
      response_format: { type: "json_object" },
      max_completion_tokens: 2200,
      messages: [
        { role: "system", content: POLIS_SYSTEEM_PROMPT },
        { role: "user", content: bericht },
      ],
    },
    undefined,
    {
      module: "contract-intelligentie",
      functie: "polisanalyse",
      gebruikerId: opties.gebruikerId ?? undefined,
      entiteitstype: "financieel-contract",
      entiteitId: opties.contractId ?? undefined,
      promptNaam: "contract-polisanalyse",
      promptVersie: "1.0.0",
    },
  );

  if (!resultaat.ok) {
    return { ...leeg, aiBeschikbaar: true, waarschuwing: resultaat.fout ?? "De AI gaf geen bruikbaar antwoord." };
  }
  if (!resultaat.inhoud) {
    return { ...leeg, aiBeschikbaar: true, waarschuwing: "De AI gaf geen bruikbaar antwoord." };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(resultaat.inhoud);
  } catch {
    return { ...leeg, aiBeschikbaar: true, waarschuwing: "Het AI-antwoord kon niet worden gelezen." };
  }

  return {
    methode: "ai",
    aiBeschikbaar: true,
    samenvatting: typeof parsed.samenvatting === "string" ? parsed.samenvatting.trim().slice(0, 2000) : "",
    dekking: mapLijst(parsed.dekking),
    uitsluitingen: mapLijst(parsed.uitsluitingen),
    eigenRisico: mapOnderdeel(parsed.eigen_risico as RuwOnderdeel),
    looptijd: mapOnderdeel(parsed.looptijd as RuwOnderdeel),
    premie: mapOnderdeel(parsed.premie as RuwOnderdeel),
    clausules: mapLijst(parsed.clausules),
    waarschuwing: null,
  };
}

// ── 2. Besparingskansen (deterministisch) ────────────────────────────────────

// Regelgebaseerde analyse: elke kans is exact herleidbaar naar de onderliggende
// gegevens (geen AI-gok). De 'bron' beschrijft welke cijfers tot het advies leidden.
export function berekenBesparingskansen(
  contracten: ContractInvoer[],
  kostenHistorie: KostenSnapshot[],
): Besparingskans[] {
  const kansen: Besparingskans[] = [];
  const nu = new Date();
  const kostenPerContract = new Map<number, KostenSnapshot[]>();
  for (const k of kostenHistorie) {
    const lijst = kostenPerContract.get(k.contractId) ?? [];
    lijst.push(k);
    kostenPerContract.set(k.contractId, lijst);
  }

  for (const c of contracten) {
    if (c.status === "opgezegd" || c.status === "verlopen") continue;

    // (a) Prijsstijging: vergelijk de twee meest recente jaarsnapshots.
    const snapshots = (kostenPerContract.get(c.id) ?? []).slice().sort((a, b) => b.jaar - a.jaar);
    if (snapshots.length >= 2) {
      const [nieuw, oud] = snapshots;
      if (oud.bedrag > 0 && nieuw.bedrag > oud.bedrag) {
        const stijging = nieuw.bedrag - oud.bedrag;
        const pct = (stijging / oud.bedrag) * 100;
        if (pct >= 5) {
          kansen.push({
            type: "prijsstijging",
            contractId: c.id,
            contractNaam: c.naam,
            leverancier: c.leverancier,
            boodschap: `Kosten stegen met ${pct.toFixed(0)}% (van ${euro(oud.bedrag)} in ${oud.jaar} naar ${euro(nieuw.bedrag)} in ${nieuw.jaar}). Overweeg heronderhandeling of een offertevergelijking.`,
            bedrag: Math.round(stijging),
            zekerheid: pct >= 15 ? "hoog" : "middel",
            bron: `Kostensnapshots ${oud.jaar}: ${euro(oud.bedrag)} en ${nieuw.jaar}: ${euro(nieuw.bedrag)}.`,
            documentId: c.documentId,
          });
        }
      }
    }

    // (b) Ongebruikte licenties/abonnementen.
    if (c.aantalLicenties && c.aantalLicenties > 0 && c.aantalInGebruik !== null) {
      const ongebruikt = c.aantalLicenties - c.aantalInGebruik;
      if (ongebruikt > 0) {
        const jaarbedrag = jaarlijkseKosten(c.kostenBedrag, c.kostenPeriode);
        const perLicentie = jaarbedrag ? jaarbedrag / c.aantalLicenties : null;
        const besparing = perLicentie ? Math.round(perLicentie * ongebruikt) : null;
        kansen.push({
          type: "ongebruikt",
          contractId: c.id,
          contractNaam: c.naam,
          leverancier: c.leverancier,
          boodschap: `${ongebruikt} van ${c.aantalLicenties} licenties/plaatsen zijn niet in gebruik. Afschalen kan kosten besparen.`,
          bedrag: besparing,
          zekerheid: besparing ? "hoog" : "middel",
          bron: `Aantal licenties ${c.aantalLicenties}, in gebruik ${c.aantalInGebruik}${jaarbedrag ? `, jaarkosten ${euro(jaarbedrag)}` : ""}.`,
          documentId: c.documentId,
        });
      }
    }

    // (c) Abonnement langdurig ongebruikt.
    if (c.categorie === "abonnement" && c.laatstGebruiktOp) {
      const laatst = new Date(c.laatstGebruiktOp);
      if (!Number.isNaN(laatst.getTime())) {
        const maandenGeleden = (nu.getTime() - laatst.getTime()) / (1000 * 60 * 60 * 24 * 30);
        if (maandenGeleden >= 6) {
          const jaarbedrag = jaarlijkseKosten(c.kostenBedrag, c.kostenPeriode);
          kansen.push({
            type: "ongebruikt",
            contractId: c.id,
            contractNaam: c.naam,
            leverancier: c.leverancier,
            boodschap: `Abonnement is al ${Math.floor(maandenGeleden)} maanden niet gebruikt. Beoordeel of het nog nodig is.`,
            bedrag: jaarbedrag ? Math.round(jaarbedrag) : null,
            zekerheid: "middel",
            bron: `Laatst gebruikt op ${c.laatstGebruiktOp}${jaarbedrag ? `, jaarkosten ${euro(jaarbedrag)}` : ""}.`,
            documentId: c.documentId,
          });
        }
      }
    }
  }

  // (d) Overlappende dekking: meerdere actieve contracten van dezelfde categorie
  // bij dezelfde categorie-groep (verzekering/telecom/software) kunnen dubbelen.
  const overlapCategorieen = new Set(["verzekering", "telecom", "software"]);
  const perCategorie = new Map<string, ContractInvoer[]>();
  for (const c of contracten) {
    if (c.status === "opgezegd" || c.status === "verlopen") continue;
    if (!overlapCategorieen.has(c.categorie)) continue;
    const lijst = perCategorie.get(c.categorie) ?? [];
    lijst.push(c);
    perCategorie.set(c.categorie, lijst);
  }
  for (const [categorie, lijst] of perCategorie) {
    if (lijst.length < 2) continue;
    // Signaleer alleen wanneer verschillende leveranciers dezelfde categorie leveren.
    const leveranciers = new Set(lijst.map((c) => (c.leverancier ?? "").toLowerCase()).filter(Boolean));
    if (leveranciers.size < 2) continue;
    const totaal = lijst.reduce((s, c) => s + (jaarlijkseKosten(c.kostenBedrag, c.kostenPeriode) ?? 0), 0);
    // Koppel de kans aan het duurste contract in de groep.
    const duurste = lijst.slice().sort(
      (a, b) => (jaarlijkseKosten(b.kostenBedrag, b.kostenPeriode) ?? 0) - (jaarlijkseKosten(a.kostenBedrag, a.kostenPeriode) ?? 0),
    )[0];
    kansen.push({
      type: "overlap",
      contractId: duurste.id,
      contractNaam: duurste.naam,
      leverancier: duurste.leverancier,
      boodschap: `${lijst.length} actieve ${categorie}-contracten bij ${leveranciers.size} leveranciers (samen ${euro(totaal)}/jaar). Controleer op overlappende dekking of dubbele diensten.`,
      bedrag: null,
      zekerheid: "laag",
      bron: `Contracten: ${lijst.map((c) => c.naam).join(", ")}.`,
      documentId: duurste.documentId,
    });
  }

  // Sorteer op geschatte impact (bekend bedrag eerst, hoog naar laag).
  kansen.sort((a, b) => (b.bedrag ?? -1) - (a.bedrag ?? -1));
  return kansen;
}

// ── 3. Contractcoach (AI, met deterministische fallback) ──────────────────────

const COACH_SYSTEEM_PROMPT = [
  "Je bent een nuchtere Nederlandse contractadviseur voor een brandpreventiebedrijf.",
  "Geef praktisch advies over EEN contract op basis van de aangeleverde gegevens en",
  "eventuele polisanalyse. Je zegt NOOIT zelf een contract op en wijzigt niets — je",
  "adviseert en de mens beslist. Geef UITSLUITEND geldige JSON terug in het Nederlands:",
  "{",
  '  "advies": "kort, concreet advies in gewone taal",',
  '  "risicos": ["..."],',
  '  "beste_opzegmoment": "... of leeg",',
  '  "financiele_gevolgen": "... of leeg"',
  "}",
  "Baseer je alleen op de aangeleverde gegevens; verzin geen bedragen of data.",
].join("\n");

export async function contractCoach(
  contract: ContractInvoer & { opzegtermijnMaanden?: number | null; polisAnalyse?: PolisAnalyse | null },
  kostenHistorie: KostenSnapshot[],
  opties: { gebruikerId?: number | null } = {},
): Promise<ContractCoachAdvies> {
  const jaarbedrag = jaarlijkseKosten(contract.kostenBedrag, contract.kostenPeriode);
  const snapshots = kostenHistorie
    .filter((k) => k.contractId === contract.id)
    .slice()
    .sort((a, b) => a.jaar - b.jaar);
  const bronDelen = [
    `Categorie: ${contract.categorie}`,
    contract.leverancier ? `Leverancier: ${contract.leverancier}` : null,
    contract.einddatum ? `Einddatum: ${contract.einddatum}` : "Doorlopend",
    contract.opzegtermijnMaanden ? `Opzegtermijn: ${contract.opzegtermijnMaanden} maanden` : null,
    jaarbedrag !== null ? `Jaarkosten: ${euro(jaarbedrag)}` : null,
    contract.indexeringPercentage ? `Indexering: ${contract.indexeringPercentage}%` : null,
    snapshots.length ? `Kostenhistorie: ${snapshots.map((s) => `${s.jaar}=${euro(s.bedrag)}`).join(", ")}` : null,
  ].filter(Boolean);
  const bron = bronDelen.join("; ");

  if (!heeftGateway()) {
    // Deterministische fallback zodat de coach altijd iets zinvols toont.
    const risicos: string[] = [];
    if (contract.opzegtermijnMaanden) risicos.push(`Houd rekening met een opzegtermijn van ${contract.opzegtermijnMaanden} maanden.`);
    if (contract.indexeringPercentage) risicos.push(`Jaarlijkse indexering van ${contract.indexeringPercentage}% verhoogt de kosten.`);
    if (snapshots.length >= 2 && snapshots[snapshots.length - 1].bedrag > snapshots[0].bedrag) {
      risicos.push("De kosten zijn de afgelopen jaren gestegen.");
    }
    return {
      methode: "geen-ai",
      aiBeschikbaar: false,
      advies: "AI-advies is niet beschikbaar. Beoordeel het contract handmatig aan de hand van onderstaande gegevens.",
      risicos,
      besteOpzegmoment: null,
      financieleGevolgen: jaarbedrag !== null ? `Jaarlijkse last: ${euro(jaarbedrag)}.` : null,
      bron,
      waarschuwing: "AI-gateway niet beschikbaar; dit is een regelgebaseerde samenvatting.",
    };
  }

  const polisDeel = contract.polisAnalyse?.samenvatting
    ? `\nPolisanalyse-samenvatting: ${contract.polisAnalyse.samenvatting}`
    : "";
  const bericht = `Gegevens van het contract "${contract.naam}":\n${bron}${polisDeel}`;

  const resultaat = await aiGateway.chat(
    "reasoning",
    {
      response_format: { type: "json_object" },
      max_completion_tokens: 1400,
      messages: [
        { role: "system", content: COACH_SYSTEEM_PROMPT },
        { role: "user", content: bericht },
      ],
    },
    undefined,
    {
      module: "contract-intelligentie",
      functie: "contractcoach",
      gebruikerId: opties.gebruikerId ?? undefined,
      entiteitstype: "financieel-contract",
      entiteitId: contract.id,
      promptNaam: "contract-coach",
      promptVersie: "1.0.0",
    },
  );

  if (!resultaat.ok || !resultaat.inhoud) {
    return {
      methode: "geen-ai",
      aiBeschikbaar: true,
      advies: "De AI gaf geen bruikbaar advies. Beoordeel het contract handmatig.",
      risicos: [],
      besteOpzegmoment: null,
      financieleGevolgen: jaarbedrag !== null ? `Jaarlijkse last: ${euro(jaarbedrag)}.` : null,
      bron,
      waarschuwing: resultaat.ok ? null : resultaat.fout,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(resultaat.inhoud);
  } catch {
    logger.warn("contractCoach: AI-antwoord niet leesbaar");
    return {
      methode: "geen-ai",
      aiBeschikbaar: true,
      advies: "Het AI-antwoord kon niet worden gelezen.",
      risicos: [],
      besteOpzegmoment: null,
      financieleGevolgen: null,
      bron,
      waarschuwing: "AI-antwoord onleesbaar.",
    };
  }

  const risicos = Array.isArray(parsed.risicos)
    ? (parsed.risicos as unknown[]).filter((r): r is string => typeof r === "string").map((r) => r.slice(0, 400))
    : [];

  return {
    methode: "ai",
    aiBeschikbaar: true,
    advies: typeof parsed.advies === "string" ? parsed.advies.trim().slice(0, 2000) : "",
    risicos,
    besteOpzegmoment: typeof parsed.beste_opzegmoment === "string" && parsed.beste_opzegmoment.trim() ? parsed.beste_opzegmoment.trim().slice(0, 400) : null,
    financieleGevolgen: typeof parsed.financiele_gevolgen === "string" && parsed.financiele_gevolgen.trim() ? parsed.financiele_gevolgen.trim().slice(0, 600) : null,
    bron,
    waarschuwing: null,
  };
}

// ── 4. Bewaking / signaleringen (deterministisch) ─────────────────────────────

export interface ContractSignaal {
  contractId: number;
  type: "einddatum" | "opzegtermijn" | "indexering" | "verlenging";
  ernst: "info" | "waarschuwing" | "kritiek";
  boodschap: string;
  bedrag: number | null;
  zekerheid: "hoog" | "middel" | "laag";
  dedupeSleutel: string;
}

// Genereer signalen voor aflopende contracten, naderende opzegtermijnen en
// indexeringsmomenten. Puur deterministisch — de route persisteert en ontdubbelt
// via dedupeSleutel.
export function bewaakContracten(
  contracten: Array<ContractInvoer & { opzegtermijnMaanden?: number | null; automatischeVerlenging?: boolean; indexeringMaand?: number | null }>,
  peildatum: Date = new Date(),
): ContractSignaal[] {
  const signalen: ContractSignaal[] = [];
  const msPerDag = 1000 * 60 * 60 * 24;

  for (const c of contracten) {
    if (c.status === "opgezegd" || c.status === "verlopen") continue;

    if (c.einddatum) {
      const eind = new Date(c.einddatum);
      if (!Number.isNaN(eind.getTime())) {
        const dagenTotEind = Math.ceil((eind.getTime() - peildatum.getTime()) / msPerDag);
        const opzegDagen = (c.opzegtermijnMaanden ?? 0) * 30;
        // Laatste moment om nog binnen de opzegtermijn te handelen.
        const dagenTotOpzegDeadline = dagenTotEind - opzegDagen;

        if (dagenTotEind < 0) {
          signalen.push({
            contractId: c.id,
            type: "einddatum",
            ernst: "kritiek",
            boodschap: `Contract "${c.naam}" is verlopen op ${c.einddatum}.`,
            bedrag: null,
            zekerheid: "hoog",
            dedupeSleutel: `einddatum-verlopen-${c.id}-${c.einddatum}`,
          });
        } else if (c.opzegtermijnMaanden && dagenTotOpzegDeadline <= 30 && dagenTotOpzegDeadline >= 0) {
          signalen.push({
            contractId: c.id,
            type: "opzegtermijn",
            ernst: "kritiek",
            boodschap: `Opzegtermijn van "${c.naam}" verloopt over ${dagenTotOpzegDeadline} dagen (opzeggen vóór ${opzegDagen} dagen voor einddatum ${c.einddatum}).`,
            bedrag: null,
            zekerheid: "hoog",
            dedupeSleutel: `opzegtermijn-${c.id}-${c.einddatum}`,
          });
        } else if (dagenTotEind <= 90) {
          signalen.push({
            contractId: c.id,
            type: c.automatischeVerlenging === false ? "einddatum" : "verlenging",
            ernst: dagenTotEind <= 30 ? "waarschuwing" : "info",
            boodschap: c.automatischeVerlenging === false
              ? `Contract "${c.naam}" loopt af over ${dagenTotEind} dagen (${c.einddatum}) en verlengt NIET automatisch.`
              : `Contract "${c.naam}" verlengt automatisch over ${dagenTotEind} dagen (${c.einddatum}). Beoordeel of dit gewenst is.`,
            bedrag: null,
            zekerheid: "hoog",
            dedupeSleutel: `verlenging-${c.id}-${c.einddatum}`,
          });
        }
      }
    }

    // Indexeringsmoment: waarschuw in de maand vóór de indexeringsmaand.
    if (c.indexeringPercentage && c.indexeringMaand && c.indexeringMaand >= 1 && c.indexeringMaand <= 12) {
      const huidigeMaand = peildatum.getMonth() + 1;
      const maandVoor = c.indexeringMaand === 1 ? 12 : c.indexeringMaand - 1;
      if (huidigeMaand === maandVoor) {
        const jaarbedrag = jaarlijkseKosten(c.kostenBedrag, c.kostenPeriode);
        const impact = jaarbedrag !== null ? Math.round((jaarbedrag * c.indexeringPercentage) / 100) : null;
        signalen.push({
          contractId: c.id,
          type: "indexering",
          ernst: "info",
          boodschap: `Contract "${c.naam}" wordt volgende maand geïndexeerd met ${c.indexeringPercentage}%${impact !== null ? ` (ca. ${euro(impact)} extra per jaar)` : ""}.`,
          bedrag: impact,
          zekerheid: "middel",
          dedupeSleutel: `indexering-${c.id}-${peildatum.getFullYear()}-${c.indexeringMaand}`,
        });
      }
    }
  }

  return signalen;
}

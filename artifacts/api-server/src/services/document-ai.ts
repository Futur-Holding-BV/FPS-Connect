import { logger } from "../lib/logger";
import { aiGateway, type LogContext } from "../lib/aiGateway";
import { DOCUMENT_ANALYSE_PROMPT } from "../lib/aiPrompts";
import {
  isDocumentType,
  type DocumentType,
  isGetestVoor,
  type GetestVoor,
} from "../lib/documenten";

export interface DocumentAnalyse {
  naam: string | null;
  fabrikant: string | null;
  product: string | null;
  documenttype: DocumentType | null;
  en_norm: string | null;
  rapportnummer: string | null;
  revisie: string | null;
  datum: string | null;
  getest_voor: GetestVoor | null;
  toelichting: string | null;
  betrouwbaarheid: string | null;
}

function strOfNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function leegResultaat(toelichting: string): DocumentAnalyse {
  return {
    naam: null,
    fabrikant: null,
    product: null,
    documenttype: null,
    en_norm: null,
    rapportnummer: null,
    revisie: null,
    datum: null,
    getest_voor: null,
    toelichting,
    betrouwbaarheid: "laag",
  };
}

// Tekst wordt afgekapt zodat we ruim binnen het tokenbudget van het model blijven;
// documentmetadata staat vrijwel altijd op de eerste pagina's (kop, titelblok).
const MAX_TEKST_LENGTE = 12000;

export async function analyseerDocumentTekst(
  tekst: string,
  bestandsnaam?: string | null,
  logCtx?: Partial<LogContext>,
): Promise<DocumentAnalyse> {
  const schoon = (tekst ?? "").trim();
  if (!schoon) {
    return leegResultaat(
      "Geen leesbare tekst in het document gevonden (mogelijk een gescand document zonder tekstlaag). Vul de velden handmatig in.",
    );
  }

  const ingekort = schoon.slice(0, MAX_TEKST_LENGTE);
  const userTekst = bestandsnaam
    ? `Bestandsnaam: ${bestandsnaam}\n\nDocumenttekst:\n${ingekort}`
    : `Documenttekst:\n${ingekort}`;

  const resultaat = await aiGateway.chat("fast", {
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
    messages: [
      { role: "system", content: DOCUMENT_ANALYSE_PROMPT.tekst },
      { role: "user", content: userTekst },
    ],
  }, undefined, {
    module: "bibliotheek",
    functie: "document-analyse",
    promptNaam: DOCUMENT_ANALYSE_PROMPT.naam,
    promptVersie: DOCUMENT_ANALYSE_PROMPT.versie,
    ...logCtx,
  });
  if (!resultaat.ok) {
    logger.error({ fout: resultaat.fout }, "Document AI-analyse mislukte");
    return leegResultaat("De AI-analyse kon niet worden uitgevoerd. Vul de velden handmatig in.");
  }
  const antwoord = resultaat.inhoud;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(antwoord);
  } catch {
    logger.error({ antwoord }, "Kon document AI-JSON niet parsen");
    return leegResultaat("Het AI-antwoord kon niet worden verwerkt. Vul de velden handmatig in.");
  }

  const ruwType = strOfNull(parsed.documenttype)?.toLowerCase() ?? null;
  const documenttype = ruwType && isDocumentType(ruwType) ? ruwType : null;

  const ruwGetest = strOfNull(parsed.getest_voor)?.toLowerCase() ?? null;
  const getestVoor = ruwGetest && isGetestVoor(ruwGetest) ? ruwGetest : null;

  return {
    naam: strOfNull(parsed.naam),
    fabrikant: strOfNull(parsed.fabrikant),
    product: strOfNull(parsed.product),
    documenttype,
    en_norm: strOfNull(parsed.en_norm),
    rapportnummer: strOfNull(parsed.rapportnummer),
    revisie: strOfNull(parsed.revisie),
    datum: strOfNull(parsed.datum),
    getest_voor: getestVoor,
    toelichting: strOfNull(parsed.toelichting),
    betrouwbaarheid: strOfNull(parsed.betrouwbaarheid) ?? "midden",
  };
}

// ── Toepassing-suggesties op basis van herkende terminologie ─────────────────
// Deterministische matcher: vergelijkt de door de AI herkende fabrikant, product
// en norm met de bestaande toepassingen (labels). Geen extra LLM-aanroep, dus
// voorspelbaar en uitlegbaar. De suggesties zijn voorstellen; een mens bevestigt.

export interface ToepassingKandidaat {
  id: number;
  naam: string;
  fabrikant: string | null;
  testnorm: string | null;
}

export interface ToepassingSuggestie {
  label_id: number;
  naam: string;
  score: number;
  reden: string;
}

const STOPWOORDEN = new Set([
  "voor",
  "een",
  "het",
  "van",
  "met",
  "systeem",
  "type",
  "the",
  "and",
  "for",
]);

function normaliseerTekst(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function woordenVan(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    normaliseerTekst(s)
      .split(" ")
      .filter((t) => t.length >= 3 && !STOPWOORDEN.has(t)),
  );
}

function normNorm(s: string | null | undefined): string {
  return s ? s.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

function fabrikantKomtOvereen(a: string | null, b: string | null): boolean {
  const na = normaliseerTekst(a ?? "");
  const nb = normaliseerTekst(b ?? "");
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const wa = woordenVan(a);
  for (const w of woordenVan(b)) if (wa.has(w)) return true;
  return false;
}

export function stelToepassingenVoor(
  analyse: Pick<DocumentAnalyse, "fabrikant" | "product" | "en_norm" | "naam">,
  kandidaten: ToepassingKandidaat[],
): ToepassingSuggestie[] {
  // Productterminologie uit product + voorgestelde naam (naam bevat vaak fabrikant + product).
  const docProductWoorden = new Set<string>([
    ...woordenVan(analyse.product),
    ...woordenVan(analyse.naam),
  ]);
  const docNorm = normNorm(analyse.en_norm);

  const suggesties: ToepassingSuggestie[] = [];
  for (const k of kandidaten) {
    let score = 0;
    const signalen: string[] = [];

    if (fabrikantKomtOvereen(analyse.fabrikant, k.fabrikant)) {
      score += 40;
      signalen.push("fabrikant");
    }

    const fabWoorden = woordenVan(k.fabrikant);
    const kandWoorden = woordenVan(k.naam);
    let overlap = 0;
    for (const w of docProductWoorden) {
      if (kandWoorden.has(w) && !fabWoorden.has(w)) overlap++;
    }
    if (overlap > 0) {
      score += Math.min(overlap * 25, 60);
      signalen.push("productnaam");
    }

    if (docNorm && k.testnorm) {
      const kNorm = normNorm(k.testnorm);
      if (
        kNorm &&
        (kNorm.includes(docNorm) || docNorm.includes(kNorm)) &&
        Math.min(kNorm.length, docNorm.length) >= 4
      ) {
        score += 20;
        signalen.push("norm");
      }
    }

    if (score >= 50 && signalen.length > 0) {
      suggesties.push({
        label_id: k.id,
        naam: k.naam,
        score,
        reden: "Komt overeen op: " + signalen.join(", "),
      });
    }
  }

  return suggesties.sort((a, b) => b.score - a.score).slice(0, 5);
}

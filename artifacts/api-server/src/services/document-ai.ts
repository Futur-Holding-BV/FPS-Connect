import { logger } from "../lib/logger";
import { maakOpenAiClient } from "../lib/openai";
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

const SYSTEM_PROMPT = `Je bent een expert in brandveiligheidsdocumentatie. Je analyseert de tekst van een geüpload bibliotheekdocument (bijvoorbeeld een ETA, classificatierapport, testrapport, productcertificaat, DoP of verwerkingsvoorschrift) en haalt de kerngegevens eruit.
Haal alleen gegevens op die EXPLICIET in de tekst staan. Verzin niets; laat onbekende velden op null.
Geef uitsluitend geldige JSON terug met deze velden:
- naam (tekst of null): een nette, leesbare documentnaam in het Nederlands (bijv. "ETA Mulcol Multicollar Slim" of "Classificatierapport Hilti CFS-C P"). Combineer fabrikant + product + documenttype indien zinvol.
- fabrikant (tekst of null): de fabrikant/producent (bijv. "Mulcol", "Hilti", "Rockwool", "Nullifire").
- product (tekst of null): de productnaam of het systeem.
- documenttype (tekst of null): kies exact één uit: eta, classificatierapport, testrapport, productcertificaat, dop, verwerkingsvoorschrift. Een "Declaration of Performance" is "dop". Een "European Technical Assessment" is "eta".
- en_norm (tekst of null): de relevante EN-norm of testnorm, inclusief nummer (bijv. "EN 1366-3", "EN 13501-2", "ETAG 026").
- rapportnummer (tekst of null): het rapport-, certificaat- of ETA-nummer (bijv. "ETA-11/0429", "WFRGENT 21-001").
- revisie (tekst of null): de revisie- of versieaanduiding indien vermeld.
- datum (tekst of null): de uitgifte- of revisiedatum in formaat JJJJ-MM-DD indien af te leiden, anders zoals vermeld.
- getest_voor (tekst of null): kies exact één uit: wand, plafond, beide. Geeft aan voor welke scheidingsconstructie het document is getest of gecertificeerd. Kies "wand" bij een wandopstelling (flexibele of rigide wand), "plafond" bij een vloer/plafond-opstelling, en "beide" als het document expliciet zowel wand als vloer/plafond dekt. Laat op null als dit niet uit de tekst blijkt.
- toelichting (korte Nederlandse tekst): waar je de gegevens vandaan haalde.
- betrouwbaarheid (tekst): "laag", "midden" of "hoog".
Antwoord in het Nederlands. Alleen JSON, geen extra tekst.`;

export async function analyseerDocumentTekst(
  tekst: string,
  bestandsnaam?: string | null,
): Promise<DocumentAnalyse> {
  const schoon = (tekst ?? "").trim();
  if (!schoon) {
    return leegResultaat(
      "Geen leesbare tekst in het document gevonden (mogelijk een gescand document zonder tekstlaag). Vul de velden handmatig in.",
    );
  }

  const client = maakOpenAiClient();
  const ingekort = schoon.slice(0, MAX_TEKST_LENGTE);
  const userTekst = bestandsnaam
    ? `Bestandsnaam: ${bestandsnaam}\n\nDocumenttekst:\n${ingekort}`
    : `Documenttekst:\n${ingekort}`;

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: 600,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userTekst },
      ],
    });
  } catch (err) {
    logger.error({ err }, "Document AI-analyse mislukte");
    return leegResultaat("De AI-analyse kon niet worden uitgevoerd. Vul de velden handmatig in.");
  }

  const antwoord = completion.choices[0]?.message?.content;
  if (!antwoord) return leegResultaat("De AI gaf geen bruikbaar antwoord. Vul de velden handmatig in.");

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

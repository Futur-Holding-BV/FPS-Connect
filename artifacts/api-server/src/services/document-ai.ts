import { logger } from "../lib/logger";
import { maakOpenAiClient } from "../lib/openai";
import { isDocumentType, type DocumentType } from "../lib/documenten";

export interface DocumentAnalyse {
  naam: string | null;
  fabrikant: string | null;
  product: string | null;
  documenttype: DocumentType | null;
  en_norm: string | null;
  rapportnummer: string | null;
  revisie: string | null;
  datum: string | null;
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

  return {
    naam: strOfNull(parsed.naam),
    fabrikant: strOfNull(parsed.fabrikant),
    product: strOfNull(parsed.product),
    documenttype,
    en_norm: strOfNull(parsed.en_norm),
    rapportnummer: strOfNull(parsed.rapportnummer),
    revisie: strOfNull(parsed.revisie),
    datum: strOfNull(parsed.datum),
    toelichting: strOfNull(parsed.toelichting),
    betrouwbaarheid: strOfNull(parsed.betrouwbaarheid) ?? "midden",
  };
}

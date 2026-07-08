// Document Intelligence — gedeelde classificatie-engine voor Inbox en Slim Upload.
//
// Eén staged pipeline die door beide routes wordt gebruikt:
//   1. bestandstype herkennen (mime/extensie)
//   2. tekstextractie (PDF via pdf-parse, DOCX via mammoth, platte tekst)
//   3. AI-vision fallback wanneer er geen/weinig machineleesbare tekst is
//   4. AI content-analyse (categorie, gevonden gegevens, samenvatting)
//   5. organisatie herkennen (matcht tegen werkgeversTable + gevonden gegevens)
//   6. jaar herkennen (uit gevonden gegevens, tekst, of — als laatste redmiddel — bestandsnaam)
//   7. module/bestemming bepalen
//   8. opslaglocatie voorstellen
//   9. betrouwbaarheid berekenen op basis van de echte signalen die hierboven zijn verzameld
//
// Elke stap voegt een item toe aan `bewijs` — de traceerbare bewijsvoering die zichtbaar
// wordt in het Inbox-detailscherm/auditlog en de Slim Upload-bevestiging.
import { db, werkgeversTable } from "@workspace/db";
import { aiGateway, heeftGateway } from "./aiGateway";
import { renderPdfPagina, haalPdfTekst, resizeAfbeelding } from "./pdfVisie";
import { logger } from "./logger";

// ── Canonieke categorie-taxonomie ─────────────────────────────────────────────
// Superset gebruikt door de engine zelf; elke route mapt dit naar zijn eigen
// bestaande enum (SLIM_UPLOAD_CATEGORIEEN resp. INBOX_CATEGORIEEN) voor
// backwards-compatibiliteit met bestaande frontend-schermen.
export const DOC_CATEGORIEEN = [
  "aanvraag",
  "tekening",
  "offerte",
  "factuur",
  "productdocument",
  "testrapport",
  "certificaat",
  "eta",
  "dop",
  "personeelsdocument",
  "verzekering",
  "snagstream",
  "jaarrekening",
  "contract",
  "bibliotheek",
  "document_sjabloon",
  "algemeen",
  "onbekend",
] as const;

export type DocCategorie = (typeof DOC_CATEGORIEEN)[number];

function isDocCategorie(v: unknown): v is DocCategorie {
  return typeof v === "string" && (DOC_CATEGORIEEN as readonly string[]).includes(v);
}

export interface BewijsStap {
  stap: string;
  resultaat: string;
  detail?: string;
}

export interface DocumentIntelligenceResultaat {
  categorie: DocCategorie;
  subtype: string | null; // bv. "geconsolideerd" voor jaarrekening, "cv" voor personeelsdocument
  voorstel_naam: string;
  redenering: string;
  vertrouwen: "laag" | "midden" | "hoog";
  vertrouwen_score: number; // 0-8, som van echte signalen — grondslag voor het label hierboven
  ai_beschikbaar: boolean;
  vision_gebruikt: boolean;
  tekst_gevonden: boolean;
  gevonden_gegevens: Record<string, string>;
  alternatieven: DocCategorie[];
  organisatie: string | null;
  jaar: number | null;
  module_bestemming: string;
  opslaglocatie: string;
  impact_niveau: "geen" | "laag" | "midden" | "hoog";
  impact_omschrijving: string;
  vereist_bevestiging: boolean;
  directe_actie_beschrijving: string;
  bewijs: BewijsStap[];
}

// ── Stap 1+2: bestandstype herkennen + tekstextractie ─────────────────────────

export interface ExtractieResultaat {
  tekst: string | null;
  bron: "tekstlaag" | "docx" | "platte_tekst" | "geen";
  paginaAantal: number | null;
}

async function extraheerTekst(buffer: Buffer, mime: string, bestandsnaam: string): Promise<ExtractieResultaat> {
  const naam = bestandsnaam.toLowerCase();
  if (mime === "application/pdf") {
    try {
      const pdfParse = ((await import("pdf-parse")) as unknown as {
        default: (b: Buffer) => Promise<{ text: string; numpages?: number }>;
      }).default;
      const result = await pdfParse(buffer);
      const tekst = result.text?.trim() || null;
      return { tekst, bron: tekst ? "tekstlaag" : "geen", paginaAantal: result.numpages ?? null };
    } catch (err) {
      logger.warn({ err }, "documentIntelligence: PDF-tekstextractie mislukt");
      return { tekst: null, bron: "geen", paginaAantal: null };
    }
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    naam.endsWith(".docx")
  ) {
    try {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer });
      const tekst = result.value?.trim() || null;
      return { tekst, bron: tekst ? "docx" : "geen", paginaAantal: null };
    } catch (err) {
      logger.warn({ err }, "documentIntelligence: DOCX-tekstextractie mislukt");
      return { tekst: null, bron: "geen", paginaAantal: null };
    }
  }
  if (mime.startsWith("text/") || mime === "message/rfc822") {
    return { tekst: buffer.toString("utf8").slice(0, 8000), bron: "platte_tekst", paginaAantal: null };
  }
  return { tekst: null, bron: "geen", paginaAantal: null };
}

// ── Stap 6: jaar herkennen ─────────────────────────────────────────────────────

export function herkenJaarUitTekst(tekst: string | null): number | null {
  if (!tekst) return null;
  const huidigJaar = new Date().getFullYear();
  const matches = [...tekst.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => parseInt(m[0], 10));
  const plausibel = matches.filter((j) => j >= 1990 && j <= huidigJaar + 1);
  if (plausibel.length === 0) return null;
  // Meest voorkomende jaartal (boekjaren komen vaak meerdere keren voor: "boekjaar 2024", "over 2024").
  const telling = new Map<number, number>();
  for (const j of plausibel) telling.set(j, (telling.get(j) ?? 0) + 1);
  return [...telling.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function herkenJaarUitBestandsnaam(bestandsnaam: string): number | null {
  const huidigJaar = new Date().getFullYear();
  const matches = [...bestandsnaam.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => parseInt(m[0], 10));
  const plausibel = matches.filter((j) => j >= 1990 && j <= huidigJaar + 1);
  return plausibel[0] ?? null;
}

// ── Stap 5: organisatie herkennen ──────────────────────────────────────────────

async function herkenOrganisatie(
  tekst: string | null,
  gevonden: Record<string, string>,
): Promise<string | null> {
  // Directe AI-hint heeft voorrang (klant/leverancier/opdrachtgever/bedrijf).
  const directeVelden = ["organisatie", "klant", "opdrachtgever", "leverancier", "bedrijf", "verzekeraar", "accountant"];
  for (const veld of directeVelden) {
    const w = gevonden[veld];
    if (w && w.trim().length > 1) return w.trim();
  }
  if (!tekst) return null;
  try {
    const werkgevers = await db.select({ naam: werkgeversTable.naam }).from(werkgeversTable);
    const tekstLower = tekst.toLowerCase();
    for (const w of werkgevers) {
      if (w.naam && w.naam.trim().length > 2 && tekstLower.includes(w.naam.toLowerCase())) {
        return w.naam;
      }
    }
  } catch (err) {
    logger.warn({ err }, "documentIntelligence: organisatie-matching tegen werkgevers mislukt");
  }
  return null;
}

// ── Stap 7+8: module/bestemming + opslaglocatie ───────────────────────────────

export const CATEGORIE_MODULE: Record<DocCategorie, string> = {
  aanvraag: "Projecten",
  tekening: "Gebouwen",
  offerte: "Offertes",
  factuur: "Financieel",
  productdocument: "Productbibliotheek",
  testrapport: "Certificaten",
  certificaat: "Certificaten",
  eta: "Certificaten",
  dop: "Certificaten",
  personeelsdocument: "HRM",
  verzekering: "Financieel",
  snagstream: "Snagstream",
  jaarrekening: "Archief",
  contract: "CRM",
  bibliotheek: "Productbibliotheek",
  document_sjabloon: "DMS",
  algemeen: "DMS",
  onbekend: "Onbekend",
};

function bepaalOpslaglocatie(
  categorie: DocCategorie,
  module: string,
  jaar: number | null,
  subtype: string | null,
  organisatie: string | null,
): string {
  if (categorie === "jaarrekening") {
    const type = subtype === "geconsolideerd" ? "Geconsolideerde jaarrekeningen" : "Jaarrekeningen";
    return jaar ? `${module} → ${type} → ${jaar}` : `${module} → ${type} → jaar onbekend`;
  }
  if (categorie === "verzekering") {
    return jaar ? `${module} → Verzekeringen → ${jaar}` : `${module} → Verzekeringen`;
  }
  if (organisatie) {
    return `${module} → ${organisatie}`;
  }
  return module;
}

// ── Stap 3: AI-vision voorbereiden ────────────────────────────────────────────

async function haalAfbeelding(buffer: Buffer, mime: string): Promise<string | null> {
  if (!heeftGateway()) return null;
  if (mime === "application/pdf") return renderPdfPagina(buffer);
  if (mime.startsWith("image/") && !["image/svg+xml", "image/tiff", "image/bmp"].includes(mime)) {
    return resizeAfbeelding(buffer);
  }
  return null;
}

// ── Stap 4: AI content-analyse ────────────────────────────────────────────────

const SYSTEEM_PROMPT = `Je bent de Document Intelligence-engine van FPS Connect, een brandpreventieplatform.
Je analyseert een geüpload document via bestandsnaam, MIME-type, geëxtraheerde tekst ÉN — indien beschikbaar — een
visuele weergave van de eerste pagina. Baseer je oordeel UITSLUITEND op de daadwerkelijke inhoud, nooit alleen op
de bestandsnaam: een misleidende bestandsnaam mag de classificatie niet omleiden als de inhoud iets anders toont.

CATEGORIEËN:
"aanvraag"           — Aanvraag, offerteaanvraag of opdrachtverzoek.
"tekening"           — Bouw- of installatietekening, plattegrond, situatietekening.
"offerte"            — Financiële offerte of prijsopgave van FPS richting klant.
"factuur"            — Factuur, creditnota, rekening.
"productdocument"    — Productblad, verwerkingsvoorschrift, technisch datasheet.
"testrapport"        — Brandproef, classificatierapport, fire test rapport.
"certificaat"        — KOMO, KIWA, BRL, CE-markering, kwaliteitscertificaat.
"eta"                — European Technical Assessment / ETB / EOTA.
"dop"                — Declaration of Performance / Prestatieverklaring.
"personeelsdocument" — Arbeidscontract/arbeidsovereenkomst, diploma, VCA, loonstrook, VOG of CV/sollicitatie.
"verzekering"        — Verzekeringspolis, assurantiepolis, bedrijfsverzekering.
"snagstream"         — Opleverrapport, inspectieverslag, onderhoudsrapport, punchlijst.
"jaarrekening"       — Jaarrekening, jaarverslag, balans, winst-en-verliesrekening, accountantsverklaring van een
                        onderneming. Zet subtype "geconsolideerd" als het over een groep/holding met dochters gaat
                        (bijv. "geconsolideerde jaarrekening", "groepsmaatschappijen").
"contract"           — Commerciële overeenkomst met een klant of leverancier (geen personeelscontract).
"bibliotheek"         — Overige technische brandveiligheidsdocumenten.
"document_sjabloon"  — Lege/visuele PDF met bedrijfslogo of huisstijl, bedoeld als briefpapier of onderlegger.
"algemeen"           — Correspondentie, notulen, presentaties, interne memo's.
"onbekend"           — Gebruik ALLEEN als het echt niet te classificeren is na grondige analyse.

REGELS:
1. Gebruik bestandsnaam, MIME-type, tekst én (indien aanwezig) visuele lay-out samen — inhoud weegt zwaarder dan bestandsnaam.
2. Vertrouwen "hoog": meerdere duidelijke inhoudelijke signalen. "midden": één sterke aanwijzing. "laag": weinig info.
3. Geef altijd 2–3 alternatieven.
4. Extraheer in "gevonden_gegevens" relevante velden, en ALTIJD als aanwezig: organisatie (naam van de betrokken
   onderneming/klant/leverancier/opdrachtgever) en jaar (viercijferig boekjaar/rapportagejaar/geldigheidsjaar).
   - jaarrekening: organisatie, jaar (boekjaar), subtype ("geconsolideerd" of leeg), accountant
   - factuur: organisatie (leverancier), bedrag, factuurnummer, jaar
   - aanvraag: organisatie (klant), locatie, projectnaam
   - testrapport/eta/dop/certificaat: organisatie (fabrikant), productnaam, normen, jaar
   - personeelsdocument (CV): document_subtype="cv", naam_medewerker, gewenste_functie (GEEN BSN/salaris)
   - verzekering: organisatie (verzekeraar), polisnummer, jaar
   - snagstream: organisatie (opdrachtgever), locatie, jaar
5. Bij "onbekend": geef 3 zinvolle alternatieven.

IMPACT — verplicht meegeven:
- "impact_niveau": "geen" (algemeen archief), "laag" (specifieke module, vervangt niets), "midden" (personeelsdossier/
  workflow start/vervangt document), "hoog" (salarisgegevens of overschrijft actuele polis/jaarrekening).
- "impact_omschrijving": max 200 tekens, leeg bij "geen"/"laag".
- "vereist_bevestiging": true bij "midden"/"hoog".
- "directe_actie_beschrijving": max 150 tekens, aanbevolen vervolgactie.

Geef uitsluitend geldige JSON:
{
  "categorie": "<één van de categorieën hierboven>",
  "subtype": "<of null>",
  "voorstel_naam": "<max 80 tekens>",
  "redenering": "<max 250 tekens, beschrijf de INHOUDELIJKE aanwijzingen die je gebruikte>",
  "vertrouwen": "laag|midden|hoog",
  "gevonden_gegevens": { "<sleutel>": "<waarde>" },
  "alternatieven": ["<cat1>", "<cat2>"],
  "impact_niveau": "geen|laag|midden|hoog",
  "impact_omschrijving": "<max 200 tekens>",
  "vereist_bevestiging": true,
  "directe_actie_beschrijving": "<max 150 tekens>"
}
Alleen JSON, geen extra tekst.`;

async function aiContentAnalyse(
  bestandsnaam: string,
  mime: string,
  tekst: string | null,
  afbeeldingBase64: string | null,
  toelichting: string | null | undefined,
  bewijs: BewijsStap[],
): Promise<{
  categorie: DocCategorie;
  subtype: string | null;
  voorstel_naam: string;
  redenering: string;
  vertrouwen: "laag" | "midden" | "hoog";
  gevonden_gegevens: Record<string, string>;
  alternatieven: DocCategorie[];
  impact_niveau: "geen" | "laag" | "midden" | "hoog";
  impact_omschrijving: string;
  vereist_bevestiging: boolean;
  directe_actie_beschrijving: string;
  ai_beschikbaar: boolean;
} | null> {
  if (!heeftGateway()) {
    bewijs.push({ stap: "ai_content_analyse", resultaat: "overgeslagen", detail: "AI-gateway niet beschikbaar" });
    return null;
  }

  const tekstInfo = tekst && tekst.trim().length > 0
    ? `Geëxtraheerde tekst (${tekst.trim().length} tekens):\n${tekst.trim().slice(0, 6000)}`
    : "Geëxtraheerde tekst: GEEN — het bestand bevat geen machine-leesbare tekst.";
  const toelichtingInfo = toelichting && toelichting.trim().length > 0
    ? `\nGebruikerscontext: ${toelichting.trim().slice(0, 500)}`
    : "";
  const bericht = [`Bestandsnaam: ${bestandsnaam}`, `MIME-type: ${mime}`, tekstInfo, toelichtingInfo].filter(Boolean).join("\n");

  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "low" } };
  const content: ContentBlock[] = [{ type: "text", text: bericht }];
  if (afbeeldingBase64) {
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${afbeeldingBase64}`, detail: "low" } });
  }

  const resultaat = await aiGateway.chat(
    "fast",
    {
      response_format: { type: "json_object" },
      max_tokens: 900,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "system", content: SYSTEEM_PROMPT }, { role: "user", content } as any],
    },
    undefined,
    { module: "document-intelligence", functie: "classificeer" },
  );

  if (!resultaat.ok || !resultaat.inhoud) {
    bewijs.push({ stap: "ai_content_analyse", resultaat: "mislukt", detail: resultaat.ok ? "leeg antwoord" : resultaat.fout });
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(resultaat.inhoud);
  } catch {
    bewijs.push({ stap: "ai_content_analyse", resultaat: "mislukt", detail: "AI-antwoord niet parseerbaar als JSON" });
    return null;
  }

  const cat = typeof parsed.categorie === "string" ? parsed.categorie.toLowerCase() : null;
  const vertr = typeof parsed.vertrouwen === "string" ? parsed.vertrouwen.toLowerCase() : "midden";
  const alt = Array.isArray(parsed.alternatieven)
    ? (parsed.alternatieven as unknown[]).filter((a): a is DocCategorie => isDocCategorie(a)).slice(0, 3)
    : (["bibliotheek", "algemeen"] as DocCategorie[]);
  const gevonden = typeof parsed.gevonden_gegevens === "object" && parsed.gevonden_gegevens !== null
    ? Object.fromEntries(
        Object.entries(parsed.gevonden_gegevens as Record<string, unknown>)
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => [k, (v as string).slice(0, 200)]),
      )
    : {};
  const impactRaw = typeof parsed.impact_niveau === "string" ? parsed.impact_niveau.toLowerCase() : "laag";
  const impactNiveau = (["geen", "laag", "midden", "hoog"].includes(impactRaw) ? impactRaw : "laag") as
    "geen" | "laag" | "midden" | "hoog";

  bewijs.push({
    stap: "ai_content_analyse",
    resultaat: "voltooid",
    detail: `AI stelt categorie "${cat ?? "onbekend"}" voor (vertrouwen ${vertr})`,
  });

  return {
    categorie: isDocCategorie(cat) ? cat : "algemeen",
    subtype: typeof parsed.subtype === "string" && parsed.subtype.trim() ? parsed.subtype.trim().toLowerCase() : null,
    voorstel_naam: typeof parsed.voorstel_naam === "string" && parsed.voorstel_naam.trim()
      ? parsed.voorstel_naam.trim().slice(0, 80)
      : bestandsnaam.replace(/\.[^.]+$/, ""),
    redenering: typeof parsed.redenering === "string" ? parsed.redenering.trim().slice(0, 300) : "",
    vertrouwen: vertr === "hoog" ? "hoog" : vertr === "laag" ? "laag" : "midden",
    gevonden_gegevens: gevonden,
    alternatieven: alt,
    impact_niveau: impactNiveau,
    impact_omschrijving: typeof parsed.impact_omschrijving === "string" ? parsed.impact_omschrijving.trim().slice(0, 300) : "",
    vereist_bevestiging: typeof parsed.vereist_bevestiging === "boolean" ? parsed.vereist_bevestiging : impactNiveau === "midden" || impactNiveau === "hoog",
    directe_actie_beschrijving: typeof parsed.directe_actie_beschrijving === "string" ? parsed.directe_actie_beschrijving.trim().slice(0, 200) : "",
    ai_beschikbaar: true,
  };
}

// ── Heuristische inhoud-gedreven fallback (geen AI beschikbaar) ──────────────
// Gebruikt bestandsnaam ÉN geëxtraheerde tekst-sleutelwoorden — niet uitsluitend
// de bestandsnaam — zodat een misleidende naam niet blindelings gevolgd wordt.

const SLEUTELWOORDEN: Array<{ categorie: DocCategorie; woorden: string[] }> = [
  { categorie: "jaarrekening", woorden: ["jaarrekening", "jaarverslag", "balans per", "winst-en-verliesrekening", "winst en verliesrekening", "accountantsverklaring", "geconsolideerde jaarrekening"] },
  { categorie: "eta", woorden: ["eta ", "european technical assessment"] },
  { categorie: "dop", woorden: ["prestatieverklaring", "declaration of performance", " dop "] },
  { categorie: "testrapport", woorden: ["testrapport", "classificatierapport", "brandproef", "fire test"] },
  { categorie: "certificaat", woorden: ["certificaat", "komo", "kiwa", "brl "] },
  { categorie: "productdocument", woorden: ["productblad", "verwerkingsvoorschrift", "technical data sheet"] },
  { categorie: "offerte", woorden: ["offerte", "aanbieding", "prijsopgave", "quotation", "geldig tot"] },
  { categorie: "factuur", woorden: ["factuur", "invoice", "creditnota", "btw-bedrag", "betalingstermijn"] },
  { categorie: "aanvraag", woorden: ["offerteaanvraag", "rfq", "bestek", "aanvraag"] },
  { categorie: "personeelsdocument", woorden: ["curriculum vitae", "arbeidsovereenkomst", "arbeidscontract", "loonstrook", "diploma", "vog "] },
  { categorie: "verzekering", woorden: ["polisnummer", "verzekeringspolis", "assurantie", "premie", "dekking"] },
  { categorie: "snagstream", woorden: ["opleverrapport", "inspectierapport", "onderhoudsrapport", "punchlijst", "snagstream", "bevindingen"] },
  { categorie: "tekening", woorden: ["schaal 1:", "noordpijl", "plattegrond", "situatietekening"] },
  { categorie: "contract", woorden: ["contract", "overeenkomst", "sla "] },
];

function heuristischClassificeerInhoud(
  bestandsnaam: string,
  mime: string,
  tekst: string | null,
): { categorie: DocCategorie; redenering: string; vertrouwen: "laag" | "midden"; gevonden_gegevens: Record<string, string>; alternatieven: DocCategorie[] } {
  const naam = bestandsnaam.toLowerCase();
  const tekstLower = (tekst ?? "").toLowerCase();
  const heeftTekst = tekstLower.trim().length > 80;

  // Inhoud weegt zwaarder dan bestandsnaam: eerst op tekst zoeken.
  if (heeftTekst) {
    for (const { categorie, woorden } of SLEUTELWOORDEN) {
      if (woorden.some((w) => tekstLower.includes(w))) {
        return {
          categorie,
          redenering: `Sleutelwoord uit de inhoud gevonden dat wijst op "${categorie}" (AI niet beschikbaar — inhoudsgedreven heuristiek).`,
          vertrouwen: "midden",
          gevonden_gegevens: {},
          alternatieven: ["bibliotheek", "algemeen"],
        };
      }
    }
  }

  // Geen bruikbare tekst gevonden — terugvallen op bestandsnaam, met lager vertrouwen.
  for (const { categorie, woorden } of SLEUTELWOORDEN) {
    if (woorden.some((w) => naam.includes(w.trim()))) {
      return {
        categorie,
        redenering: `Geen leesbare inhoud beschikbaar; classificatie gebaseerd op bestandsnaam ("${categorie}") — lage betrouwbaarheid.`,
        vertrouwen: "laag",
        gevonden_gegevens: {},
        alternatieven: ["bibliotheek", "algemeen"],
      };
    }
  }

  if (mime.startsWith("image/")) {
    return { categorie: "tekening", redenering: "Afbeelding zonder herkenbare tekst of sleutelwoorden.", vertrouwen: "laag", gevonden_gegevens: {}, alternatieven: ["document_sjabloon", "algemeen"] };
  }

  return { categorie: "algemeen", redenering: "Geen inhoudelijke of bestandsnaam-signalen gevonden.", vertrouwen: "laag", gevonden_gegevens: {}, alternatieven: ["bibliotheek", "onbekend"] };
}

// ── Stap 9: betrouwbaarheid op echte signalen ─────────────────────────────────

function berekenVertrouwen(input: {
  aiBeschikbaar: boolean;
  aiVertrouwen: "laag" | "midden" | "hoog" | null;
  tekstGevonden: boolean;
  visionGebruikt: boolean;
  organisatieGevonden: boolean;
  jaarGevonden: boolean;
  jaarUitBestandsnaam: boolean;
}): { label: "laag" | "midden" | "hoog"; score: number } {
  let score = 0;
  if (input.tekstGevonden) score += 2;
  if (input.visionGebruikt) score += 1;
  if (input.aiBeschikbaar) {
    score += 2;
    if (input.aiVertrouwen === "hoog") score += 1;
    if (input.aiVertrouwen === "laag") score -= 1;
  }
  if (input.organisatieGevonden) score += 1;
  if (input.jaarGevonden && !input.jaarUitBestandsnaam) score += 1;
  score = Math.max(0, Math.min(8, score));
  const label = score >= 5 ? "hoog" : score >= 3 ? "midden" : "laag";
  return { label, score };
}

// ── Hoofdfunctie ───────────────────────────────────────────────────────────────

export async function classificeerDocument(input: {
  buffer: Buffer | null;
  bestandsnaam: string;
  mime: string;
  toelichting?: string | null;
}): Promise<DocumentIntelligenceResultaat> {
  const bewijs: BewijsStap[] = [];
  const { bestandsnaam } = input;
  const mime = input.mime || "application/octet-stream";

  bewijs.push({
    stap: "bestand_geopend",
    resultaat: input.buffer ? "gelukt" : "geen bestand ontvangen",
    detail: input.buffer ? `${input.buffer.length} bytes` : "alleen metadata aangeleverd",
  });
  bewijs.push({ stap: "bestandstype_herkend", resultaat: mime, detail: bestandsnaam });

  let extractie: ExtractieResultaat = { tekst: null, bron: "geen", paginaAantal: null };
  if (input.buffer) {
    extractie = await extraheerTekst(input.buffer, mime, bestandsnaam);
    bewijs.push({
      stap: "tekstextractie",
      resultaat: extractie.tekst ? `gelukt via ${extractie.bron}` : "geen leesbare tekst",
      detail: extractie.tekst
        ? `${extractie.tekst.length} tekens${extractie.paginaAantal ? `, ${extractie.paginaAantal} pagina('s)` : ""}`
        : undefined,
    });
  } else {
    bewijs.push({ stap: "tekstextractie", resultaat: "overgeslagen", detail: "geen bestandsbuffer beschikbaar" });
  }

  let afbeeldingBase64: string | null = null;
  const tekstTeKort = !extractie.tekst || extractie.tekst.trim().length < 80;
  if (input.buffer && tekstTeKort) {
    afbeeldingBase64 = await haalAfbeelding(input.buffer, mime);
    bewijs.push({
      stap: "vision_fallback",
      resultaat: afbeeldingBase64 ? "beeld gerenderd" : "niet toegepast",
      detail: afbeeldingBase64 ? "eerste pagina omgezet naar afbeelding voor AI-vision" : undefined,
    });
  }

  const aiAnalyse = await aiContentAnalyse(bestandsnaam, mime, extractie.tekst, afbeeldingBase64, input.toelichting, bewijs);

  const basis = aiAnalyse ?? {
    ...heuristischClassificeerInhoud(bestandsnaam, mime, extractie.tekst),
    subtype: null,
    voorstel_naam: bestandsnaam.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim(),
    impact_niveau: "laag" as const,
    impact_omschrijving: "",
    vereist_bevestiging: false,
    directe_actie_beschrijving: "",
    ai_beschikbaar: false,
  };
  if (!aiAnalyse) {
    bewijs.push({ stap: "heuristische_classificatie", resultaat: basis.categorie, detail: basis.redenering });
  }

  const organisatie = await herkenOrganisatie(extractie.tekst, basis.gevonden_gegevens);
  bewijs.push({
    stap: "organisatie_herkend",
    resultaat: organisatie ?? "niet gevonden",
    detail: organisatie ? "gematcht op gevonden gegevens of werkgeversregister" : undefined,
  });

  let jaar = basis.gevonden_gegevens.jaar ? parseInt(basis.gevonden_gegevens.jaar, 10) : null;
  if (jaar && Number.isNaN(jaar)) jaar = null;
  let jaarUitBestandsnaam = false;
  if (!jaar) jaar = herkenJaarUitTekst(extractie.tekst);
  if (!jaar) {
    jaar = herkenJaarUitBestandsnaam(bestandsnaam);
    jaarUitBestandsnaam = jaar !== null;
  }
  bewijs.push({
    stap: "jaar_herkend",
    resultaat: jaar ? String(jaar) : "niet gevonden",
    detail: jaarUitBestandsnaam ? "afgeleid uit bestandsnaam (minder betrouwbaar)" : undefined,
  });

  const subtype = basis.subtype ?? (basis.gevonden_gegevens.document_subtype ?? null);
  const module = CATEGORIE_MODULE[basis.categorie];
  bewijs.push({ stap: "module_bepaald", resultaat: module });

  const opslaglocatie = bepaalOpslaglocatie(basis.categorie, module, jaar, subtype, organisatie);
  bewijs.push({ stap: "opslaglocatie_voorgesteld", resultaat: opslaglocatie });

  const vertrouwen = berekenVertrouwen({
    aiBeschikbaar: basis.ai_beschikbaar,
    aiVertrouwen: aiAnalyse ? aiAnalyse.vertrouwen : null,
    tekstGevonden: !!extractie.tekst,
    visionGebruikt: !!afbeeldingBase64,
    organisatieGevonden: !!organisatie,
    jaarGevonden: !!jaar,
    jaarUitBestandsnaam,
  });
  bewijs.push({
    stap: "betrouwbaarheid_bepaald",
    resultaat: vertrouwen.label,
    detail: `score ${vertrouwen.score}/8 op basis van tekst, AI, organisatie en jaar`,
  });

  return {
    categorie: basis.categorie,
    subtype,
    voorstel_naam: basis.voorstel_naam,
    redenering: basis.redenering,
    vertrouwen: vertrouwen.label,
    vertrouwen_score: vertrouwen.score,
    ai_beschikbaar: basis.ai_beschikbaar,
    vision_gebruikt: !!afbeeldingBase64,
    tekst_gevonden: !!extractie.tekst,
    gevonden_gegevens: basis.gevonden_gegevens,
    alternatieven: basis.alternatieven,
    organisatie,
    jaar,
    module_bestemming: module,
    opslaglocatie,
    impact_niveau: basis.impact_niveau,
    impact_omschrijving: basis.impact_omschrijving,
    vereist_bevestiging: basis.vereist_bevestiging,
    directe_actie_beschrijving: basis.directe_actie_beschrijving,
    bewijs,
  };
}

// Puur-functionele exports voor unit tests (geen DB/AI-netwerkcall nodig).
export const _test = { heuristischClassificeerInhoud, herkenJaarUitTekst, herkenJaarUitBestandsnaam, bepaalOpslaglocatie, berekenVertrouwen };

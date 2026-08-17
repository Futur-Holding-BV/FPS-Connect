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
import { db, werkgeversTable, documentStudioModellenTable, documentClassificatieCorrectiesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { aiGateway, heeftGateway } from "./aiGateway";
import { renderPdfPagina, renderPdfPaginas, renderPdfPaginasMetStatus, haalPdfTekst, resizeAfbeelding, VISION_RENDER_DPI, VISION_MAX_PIXELS, VISION_JPEG_KWALITEIT } from "./pdfVisie";
import { extraheerPdfTekst } from "./pdfTekst";
import { inspecteerDocument } from "./documentInspectie";
import { logger } from "./logger";
import * as XLSX from "xlsx";
import { PRIJSLIJST_VOORSTEL_PROMPT, PRIJSLIJST_PDF_TABEL_PROMPT } from "./aiPrompts";

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
  "opdrachtbevestiging",
  "prijslijst",
  "adviesrapport",
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
  ai_model: string | null;
  gevonden_gegevens: Record<string, string>;
  alternatieven: DocCategorie[];
  organisatie: string | null;
  jaar: number | null;
  module_bestemming: string;
  opslaglocatie: string;
  // Vertrouwelijke financiele jaarstukken: markering + status van het jaarstuk zelf.
  beveiligingsprofiel: string | null;
  documentstatus: "definitief" | "concept" | "onbekend" | null;
  impact_niveau: "geen" | "laag" | "midden" | "hoog";
  impact_omschrijving: string;
  vereist_bevestiging: boolean;
  directe_actie_beschrijving: string;
  /**
   * Gevuld wanneer het document niet (volledig) gelezen kon worden: geen
   * tekstlaag én geen bruikbare paginaweergave. De classificatie is dan
   * fail-closed ("onbekend") en deze reden hoort zichtbaar te zijn bij het
   * document zelf — nooit een stil leeg resultaat of een verzonnen categorie.
   */
  lees_probleem: string | null;
  bewijs: BewijsStap[];
}

// Maximaal aantal pagina's dat voor vision gerenderd wordt. Arbeidscontracten
// en rapporten zijn vaak langer dan 5 pagina's; belangrijke bepalingen staan
// achterin, dus de laatste pagina wordt altijd meegenomen.
export const MAX_VISION_PAGINAS = 10;

/**
 * Kort lange documenttekst in voor een AI-prompt zónder het einde te verliezen:
 * kop + staart met een expliciete overslag-markering. Bepalingen achterin een
 * contract (opzegtermijn, concurrentiebeding, ondertekening) blijven zichtbaar.
 */
export function kortTekstInKopStaart(tekst: string, maxKop = 12000, maxStaart = 6000): string {
  const t = tekst.trim();
  if (t.length <= maxKop + maxStaart) return t;
  const overgeslagen = t.length - maxKop - maxStaart;
  return `${t.slice(0, maxKop)}\n\n[... ${overgeslagen} tekens overgeslagen (middendeel) ...]\n\n${t.slice(t.length - maxStaart)}`;
}

// ── Stap 1+2: bestandstype herkennen + tekstextractie ─────────────────────────

export interface ExtractieResultaat {
  tekst: string | null;
  bron: "tekstlaag" | "docx" | "platte_tekst" | "email" | "geen";
  paginaAantal: number | null;
  paginaTeksten: string[];
}

export async function extraheerTekst(buffer: Buffer, mime: string, bestandsnaam: string): Promise<ExtractieResultaat> {
  const naam = bestandsnaam.toLowerCase();
  if (mime === "application/pdf") {
    try {
      const result = await extraheerPdfTekst(buffer);
      return {
        tekst: result.tekst,
        bron: result.tekst ? "tekstlaag" : "geen",
        paginaAantal: result.paginaAantal,
        paginaTeksten: result.paginaTeksten,
      };
    } catch (err) {
      logger.warn({ err }, "documentIntelligence: PDF-tekstextractie mislukt");
      return { tekst: null, bron: "geen", paginaAantal: null, paginaTeksten: [] };
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
      return { tekst, bron: tekst ? "docx" : "geen", paginaAantal: null, paginaTeksten: [] };
    } catch (err) {
      logger.warn({ err }, "documentIntelligence: DOCX-tekstextractie mislukt");
      return { tekst: null, bron: "geen", paginaAantal: null, paginaTeksten: [] };
    }
  }
  // E-mailbestanden (.eml/.msg) écht parsen: de rauwe bytes beginnen met honderden
  // regels headers/DKIM-handtekeningen, waardoor de eerste 8000 tekens géén
  // onderwerp of inhoud bevatten en de classificatie op ruis draait.
  const isEmailBestand =
    mime === "message/rfc822" ||
    mime === "application/vnd.ms-outlook" ||
    naam.endsWith(".eml") ||
    naam.endsWith(".msg");
  if (isEmailBestand) {
    try {
      const { parseEmailBestand } = await import("../services/email-ai");
      const mail = await parseEmailBestand(bestandsnaam, buffer, mime);
      const delen: string[] = [];
      if (mail.onderwerp) delen.push(`Onderwerp: ${mail.onderwerp}`);
      if (mail.afzender) delen.push(`Van: ${mail.afzender}`);
      if (mail.ontvanger) delen.push(`Aan: ${mail.ontvanger}`);
      if (mail.datum) delen.push(`Datum: ${mail.datum}`);
      if (mail.bijlagen.length > 0) delen.push(`Bijlagen: ${mail.bijlagen.map((b) => b.bestandsnaam).join(", ")}`);
      if (mail.inhoudTekst) delen.push("", mail.inhoudTekst);
      const tekst = delen.join("\n").trim().slice(0, 8000) || null;
      return { tekst, bron: tekst ? "email" : "geen", paginaAantal: null, paginaTeksten: [] };
    } catch (err) {
      logger.warn({ err, bestandsnaam }, "documentIntelligence: e-mail parsen mislukt — val terug op platte tekst");
      return { tekst: buffer.toString("utf8").slice(0, 8000), bron: "platte_tekst", paginaAantal: null, paginaTeksten: [] };
    }
  }
  if (mime.startsWith("text/")) {
    return { tekst: buffer.toString("utf8").slice(0, 8000), bron: "platte_tekst", paginaAantal: null, paginaTeksten: [] };
  }
  return { tekst: null, bron: "geen", paginaAantal: null, paginaTeksten: [] };
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

// ── Documentstatus jaarrekening: definitief / concept / onbekend ─────────────
// Bepaalt of een financieel jaarstuk vastgesteld/definitief is dan wel concept.
// Werkt puur inhoudsgedreven (tekst + AI-hint), zonder AI-afhankelijkheid.
export function herkenFinancieleStatus(
  tekst: string | null,
  gevonden: Record<string, string>,
): "definitief" | "concept" | "onbekend" {
  const hint = (gevonden.status ?? gevonden.documentstatus ?? "").toLowerCase();
  if (hint.includes("concept") || hint.includes("voorlopig")) return "concept";
  if (hint.includes("definitief") || hint.includes("vastgesteld")) return "definitief";
  const t = (tekst ?? "").toLowerCase();
  if (!t.trim()) return "onbekend";
  const conceptWoorden = ["concept", "voorlopig", "voorlopige", "draft", "concept-jaarrekening", "nog niet vastgesteld"];
  const definitiefWoorden = [
    "vastgestelde jaarrekening", "vastgesteld door", "gedeponeerd", "definitieve jaarrekening",
    "controleverklaring", "samenstellingsverklaring", "accountantsverklaring", "ondertekend",
    "goedgekeurd door de algemene vergadering",
  ];
  if (conceptWoorden.some((w) => t.includes(w))) return "concept";
  if (definitiefWoorden.some((w) => t.includes(w))) return "definitief";
  return "onbekend";
}

// ── Stap 5: organisatie herkennen ──────────────────────────────────────────────

async function herkenOrganisatie(
  tekst: string | null,
  gevonden: Record<string, string>,
  werkmaatschappijNaam?: string | null,
): Promise<string | null> {
  // Directe AI-hint heeft voorrang (klant/leverancier/opdrachtgever/bedrijf).
  const directeVelden = ["organisatie", "klant", "opdrachtgever", "leverancier", "bedrijf", "verzekeraar", "accountant"];
  for (const veld of directeVelden) {
    const w = gevonden[veld];
    if (w && w.trim().length > 1) return w.trim();
  }
  if (tekst) {
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
  }
  // Fallback: gebruik de werkmaatschappij van de uploadende gebruiker.
  return werkmaatschappijNaam ?? null;
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
  jaarrekening: "Financieel",
  contract: "CRM",
  // AKKOORD_01 §5: opdrachtbevestigingen horen bij het project/de opdracht.
  opdrachtbevestiging: "Projecten",
  prijslijst: "Productbibliotheek",
  adviesrapport: "Calculaties",
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
  if (categorie === "prijslijst") {
    // Prijslijsten worden gearchiveerd in een eigen bibliotheek-map; de tabelinhoud
    // gaat via de importstroom naar prijsafspraken (PRIJS_01 §4).
    if (organisatie) {
      return jaar ? `${module} → Prijslijsten → ${organisatie} → ${jaar}` : `${module} → Prijslijsten → ${organisatie}`;
    }
    return jaar ? `${module} → Prijslijsten → ${jaar}` : `${module} → Prijslijsten`;
  }
  if (organisatie) {
    return `${module} → ${organisatie}`;
  }
  return module;
}

// ── Stap 3: AI-vision voorbereiden ────────────────────────────────────────────

async function haalAfbeeldingVoorAfbeeldingsbestand(buffer: Buffer, mime: string): Promise<string | null> {
  if (mime.startsWith("image/") && !["image/svg+xml", "image/tiff", "image/bmp"].includes(mime)) {
    return resizeAfbeelding(buffer);
  }
  return null;
}

// ── Stap 4: AI content-analyse ────────────────────────────────────────────────

const SYSTEEM_PROMPT = `Je bent de Document Intelligence-engine van FPS Connect, een brandpreventieplatform.
Je analyseert een geüpload document via bestandsnaam, MIME-type, geëxtraheerde tekst ÉN — indien beschikbaar — een
visuele weergave van de eerste pagina's. Baseer je oordeel UITSLUITEND op de daadwerkelijke inhoud, nooit alleen op
de bestandsnaam: een misleidende bestandsnaam mag de classificatie niet omleiden als de inhoud iets anders toont.
Neem in "gevonden_gegevens" NOOIT waarden over uit bestandsnaam of andere metadata — alleen wat op het document
zelf leesbaar is. Onleesbaar of afwezig = niet opnemen.

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
"opdrachtbevestiging" — Opdrachtbevestiging, inkooporder of schriftelijke opdracht VAN een opdrachtgever AAN FPS:
                        de klant bevestigt daarmee dat FPS het werk mag uitvoeren (vaak met opdrachtnummer, bedrag
                        en verwijzing naar een offerte). Onderscheid van "aanvraag" (verzoek om offerte, nog geen
                        opdracht) en "offerte" (prijsopgave van FPS zelf). Zet in gevonden_gegevens indien aanwezig:
                        organisatie (opdrachtgever), opdrachtnummer, offerte_referentie, bedrag, jaar.
"prijslijst"         — Jaarprijslijst, nettoprijslijst, bruto prijslijst of staffelprijslijst van een leverancier: een
                        tabel met artikelcodes, omschrijvingen, prijzen en eenheden. Zet in gevonden_gegevens indien
                        aanwezig: organisatie (leverancier), jaar, geldig_van, geldig_tot, valuta.
"adviesrapport"      — Adviesrapport, brandveiligheidsconsult, bouwkundig advies of inspectierapport-met-advies: een
                        rapport met genummerde bevindingen/tekortkomingen én geadviseerd herstel, waarvan een calculatie
                        opgesteld wordt. Onderscheid van "snagstream": een adviesrapport adviseert herstel (per genummerd
                        punt), een opleverrapport/punchlijst constateert louter gebreken. Zet in gevonden_gegevens indien
                        aanwezig: organisatie (opdrachtgever/adviseur), locatie, jaar.
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
   - jaarrekening: organisatie, jaar (boekjaar), subtype ("geconsolideerd" of leeg), accountant,
     status ("definitief" bij vastgestelde/gedeponeerde jaarrekening of accountants-/controleverklaring, "concept" bij voorlopig/concept, anders leeg)
   - factuur: organisatie (leverancier), bedrag, factuurnummer, jaar
   - aanvraag: organisatie (klant), locatie, projectnaam
   - testrapport/eta/dop/certificaat: organisatie (fabrikant), productnaam, normen, jaar
   - personeelsdocument (CV): document_subtype="cv", naam_medewerker, gewenste_functie (GEEN BSN/salaris)
   - personeelsdocument (arbeidsovereenkomst/arbeidscontract): document_subtype="arbeidscontract", naam_medewerker (de werknemer), organisatie (de werkgever) (GEEN BSN/salaris)
   - personeelsdocument (overige): geef ALTIJD een document_subtype uit precies deze lijst wanneer het document
     erbij past: "functiebeschrijving" (functieomschrijving/functieprofiel), "identiteitsbewijs", "paspoort",
     "verblijfsvergunning", "rijbewijs", "vca_certificaat", "bhv_certificaat", "ehbo_certificaat", "diploma",
     "loonstrook", "naw_formulier", "geheimhoudingsverklaring", "aow_verklaring". Past het nergens bij, laat
     document_subtype dan leeg. Altijd naam_medewerker meegeven indien vindbaar (GEEN BSN/salaris).
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
  afbeeldingen: Array<{ paginaNummer: number; base64: string }>,
  toelichting: string | null | undefined,
  bewijs: BewijsStap[],
  werkmaatschappijNaam?: string | null,
  studioContext?: string | null,
  correctieContext?: string | null,
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
  ai_model: string;
} | null> {
  if (!heeftGateway()) {
    bewijs.push({ stap: "ai_content_analyse", resultaat: "overgeslagen", detail: "AI-gateway niet beschikbaar" });
    return null;
  }

  const tekstInfo = tekst && tekst.trim().length > 0
    ? `Geëxtraheerde tekst (${tekst.trim().length} tekens):\n${kortTekstInKopStaart(tekst)}`
    : "Geëxtraheerde tekst: GEEN — het bestand bevat geen machine-leesbare tekst.";
  const toelichtingInfo = toelichting && toelichting.trim().length > 0
    ? `\nGebruikerscontext: ${toelichting.trim().slice(0, 500)}`
    : "";
  const werkmaatschappijInfo = werkmaatschappijNaam
    ? `\nOrganisatiecontext: dit document is geüpload door een medewerker van ${werkmaatschappijNaam}.`
    : "";
  const studioInfo = studioContext
    ? `\nDocument Studio referentiemodellen voor deze werkmaatschappij:\n${studioContext}`
    : "";
  const correctieInfo = correctieContext
    ? `\nEerdere handmatige correcties (leer van deze voorbeelden bij vergelijkbare documenten):\n${correctieContext}`
    : "";
  const bericht = [`Bestandsnaam: ${bestandsnaam}`, `MIME-type: ${mime}`, tekstInfo, toelichtingInfo, werkmaatschappijInfo, studioInfo, correctieInfo].filter(Boolean).join("\n");

  // DOCUMENT_01: detail "high" — met "low" werd elk beeld teruggebracht naar
  // ±512×512 px, waardoor bodytekst onleesbaar was en scans op "Unknown" strandden.
  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } };
  const content: ContentBlock[] = [{ type: "text", text: bericht }];
  for (const afb of afbeeldingen) {
    content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${afb.base64}`, detail: "high" },
    });
  }

  const slot = "fast" as const;
  const resultaat = await aiGateway.chat(
    slot,
    {
      response_format: { type: "json_object" },
      max_tokens: 900,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "system", content: SYSTEEM_PROMPT }, { role: "user", content } as any],
    },
    undefined,
    { module: "document-intelligence", functie: "classificeer", promptNaam: "document-classificatie", promptVersie: "1.0.0" },
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
    ai_model: "gpt-4o-mini",
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
  // prijslijst staat VÓÓR offerte: "nettoprijslijst"/"jaarprijzen" zijn sterker
  // dan het generieke "prijsopgave" dat ook bij een offerte hoort.
  { categorie: "prijslijst", woorden: ["prijslijst", "jaarprijzen", "nettoprijslijst", "bruto prijslijst", "price list", "staffel"] },
  { categorie: "offerte", woorden: ["offerte", "aanbieding", "prijsopgave", "quotation", "geldig tot"] },
  { categorie: "factuur", woorden: ["factuur", "invoice", "creditnota", "btw-bedrag", "betalingstermijn"] },
  { categorie: "aanvraag", woorden: ["offerteaanvraag", "rfq", "bestek", "aanvraag"] },
  // personeelsdocument staat bewust VÓÓR contract: "arbeidscontract" en
  // "onbepaalde/bepaalde tijd" zijn sterker dan het generieke woord "contract".
  { categorie: "personeelsdocument", woorden: [
    "curriculum vitae", "arbeidsovereenkomst", "arbeidscontract",
    "loonstrook", "diploma", "vog ",
    "onbepaalde tijd", "bepaalde tijd", "proeftijd", "arbeidsvoorwaarden",
    "dienstverband", "salaris", "functieomschrijving", "functie beschrijving",
  ] },
  { categorie: "verzekering", woorden: ["polisnummer", "verzekeringspolis", "assurantie", "premie", "dekking"] },
  // AKKOORD_01 §5: opdrachtbevestiging VÓÓR het generieke "contract" — de
  // sleutelwoorden zijn specifieker dan het losse woord "overeenkomst".
  { categorie: "opdrachtbevestiging", woorden: ["opdrachtbevestiging", "inkooporder", "purchase order", "wij bevestigen de opdracht", "opdracht verstrekt", "gunning"] },
  // adviesrapport staat VÓÓR snagstream: een adviesrapport adviseert herstel per
  // genummerd punt; de sleutelwoorden zijn specifieker dan het generieke
  // "inspectierapport"/"bevindingen" dat bij een opleverrapport hoort.
  { categorie: "adviesrapport", woorden: ["adviesrapport", "brandveiligheidsconsult", "bouwkundig advies", "inspectierapport advies", "geadviseerd herstel", "geadviseerde maatregelen", "tekortkomingen en advies"] },
  { categorie: "snagstream", woorden: ["opleverrapport", "inspectierapport", "onderhoudsrapport", "punchlijst", "snagstream", "bevindingen"] },
  { categorie: "tekening", woorden: ["schaal 1:", "noordpijl", "plattegrond", "situatietekening"] },
  // "contract" als generiek woord staat ACHTERAAN: alleen als geen
  // specifieker type matcht (zo wint "arbeidscontract" op "personeelsdocument").
  { categorie: "contract", woorden: ["overeenkomst", "sla "] },
];

// ── Typo-tolerante geconsolideerd-detectie ────────────────────────────────────
// Vergelijkt op "samengevouwen" letters (runs van dezelfde letter worden één
// letter), zodat tikfouten als "Geconsolideeerd" of "geconsollideerd" ook
// herkend worden. Matcht per woord op het voorvoegsel, zodat verbuigingen
// ("geconsolideerde") meetellen.
function vouwLetters(s: string): string {
  return s.toLowerCase().replace(/(.)\1+/g, "$1");
}

const GECONSOLIDEERD_GEVOUWEN = vouwLetters("geconsolideerd");

export function bevatGeconsolideerd(bron: string): boolean {
  if (!bron) return false;
  const woorden = bron.toLowerCase().split(/[^a-zà-ÿ]+/);
  return woorden.some((w) => vouwLetters(w).startsWith(GECONSOLIDEERD_GEVOUWEN));
}

function heuristischClassificeerInhoud(
  bestandsnaam: string,
  mime: string,
  tekst: string | null,
): { categorie: DocCategorie; redenering: string; vertrouwen: "laag" | "midden"; gevonden_gegevens: Record<string, string>; alternatieven: DocCategorie[] } {
  const naam = bestandsnaam.toLowerCase();
  const tekstLower = (tekst ?? "").toLowerCase();
  // Drempel verlaagd naar 20 tekens: zelfs korte tekst (koptekst, stempel)
  // is betrouwbaarder dan de bestandsnaam als classificatiebron.
  const heeftTekst = tekstLower.trim().length > 20;

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

  // Geen bruikbare tekst — terugvallen op bestandsnaam. Hier controleren we ook
  // op personeelsdocument-signalen in de naam die een generiek "contract" overschrijven.
  for (const { categorie, woorden } of SLEUTELWOORDEN) {
    if (woorden.some((w) => naam.includes(w.trim()))) {
      return {
        categorie,
        redenering: `Classificatie gebaseerd op bestandsnaam (AI niet beschikbaar) — controleer de bestemming voor opslaan.`,
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
  werkmaatschappijNaam?: string | null;
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

  let extractie: ExtractieResultaat = { tekst: null, bron: "geen", paginaAantal: null, paginaTeksten: [] };
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

  // ── Stap 3a: per-pagina inspectie → bepaal vision-strategie ─────────────────
  const inspectie = inspecteerDocument({
    mime,
    paginaAantal: extractie.paginaAantal,
    paginaTeksten: extractie.paginaTeksten,
    totaleTekst: extractie.tekst,
  });

  let afbeeldingen: Array<{ paginaNummer: number; base64: string }> = [];
  let leesProbleem: string | null = null;
  if (input.buffer && inspectie.vereistVisueleAnalyse) {
    if (mime === "application/pdf" && inspectie.visuelePrioriteitPaginas.length > 0) {
      // Multi-pagina vision: render de prioriteitspagina's (max MAX_VISION_PAGINAS,
      // DOCUMENT_01 §3.5) en neem altijd de laatste pagina mee — bepalingen
      // achterin (contracten!) mogen niet buiten beeld vallen.
      const teRenderen = inspectie.visuelePrioriteitPaginas.slice(0, MAX_VISION_PAGINAS);
      const totaal = inspectie.paginaAantal ?? teRenderen.length;
      if (totaal > 0 && !teRenderen.includes(totaal)) {
        if (teRenderen.length >= MAX_VISION_PAGINAS) teRenderen[teRenderen.length - 1] = totaal;
        else teRenderen.push(totaal);
      }
      try {
        const render = await renderPdfPaginasMetStatus(input.buffer, teRenderen);
        afbeeldingen = render.paginas;
        bewijs.push({
          stap: "vision_multi_pagina",
          resultaat: `${afbeeldingen.length} pagina('s) gerenderd`,
          detail: `pagina's ${teRenderen.join(", ")} op ${VISION_RENDER_DPI} DPI, max ${VISION_MAX_PIXELS}px, JPEG ${VISION_JPEG_KWALITEIT}, detail=high`
            + (totaal > MAX_VISION_PAGINAS ? ` — LET OP: document heeft ${totaal} pagina's, ${teRenderen.length} prioriteitspagina's (incl. laatste) zijn aangeboden` : "")
            + (render.fout ? ` — rendering mislukt: ${render.fout}` : ""),
        });
        if (render.fout && inspectie.isPixelBased) leesProbleem = render.fout;
      } catch (err) {
        logger.warn({ err }, "documentIntelligence: multi-pagina vision mislukt");
        bewijs.push({ stap: "vision_multi_pagina", resultaat: "mislukt", detail: "PDF-rendering niet beschikbaar" });
        if (inspectie.isPixelBased) leesProbleem = "PDF-rendering niet beschikbaar op deze server";
      }
    } else {
      // Afbeeldingsbestand of enkel-pagina fallback
      const base64 = await haalAfbeeldingVoorAfbeeldingsbestand(input.buffer, mime);
      if (base64) {
        afbeeldingen = [{ paginaNummer: 1, base64 }];
        bewijs.push({
          stap: "vision_afbeelding",
          resultaat: "beeld gerenderd",
          detail: `afbeeldingsbestand omgezet naar AI-vision invoer (max ${VISION_MAX_PIXELS}px, JPEG ${VISION_JPEG_KWALITEIT}, detail=high)`,
        });
      } else {
        bewijs.push({ stap: "vision_afbeelding", resultaat: "niet toegepast", detail: inspectie.isPixelBased ? "pixel-based maar rendering niet beschikbaar" : "tekst aanwezig, geen vision nodig" });
        if (inspectie.isPixelBased) leesProbleem = "Afbeelding kon niet worden omgezet naar leesbare AI-invoer (niet-ondersteund of beschadigd bestand)";
      }
    }
  } else if (input.buffer == null && inspectie.vereistVisueleAnalyse && inspectie.isPixelBased) {
    leesProbleem = "Geen bestandsinhoud beschikbaar voor visuele analyse";
  } else if (!inspectie.vereistVisueleAnalyse) {
    bewijs.push({
      stap: "vision_strategie",
      resultaat: "overgeslagen",
      detail: "voldoende tekst aanwezig voor tekstgebaseerde classificatie",
    });
  }

  // ── Stap 3b: Studio referentiemodellen ophalen ────────────────────────────
  let studioContext: string | null = null;
  if (input.werkmaatschappijNaam) {
    try {
      const werkgeverRij = await db
        .select({ id: werkgeversTable.id })
        .from(werkgeversTable)
        .where(eq(werkgeversTable.naam, input.werkmaatschappijNaam))
        .limit(1);
      if (werkgeverRij.length > 0) {
        const studioModellen = await db
          .select({
            documentType: documentStudioModellenTable.documentType,
            naam: documentStudioModellenTable.naam,
          })
          .from(documentStudioModellenTable)
          .where(
            and(
              eq(documentStudioModellenTable.werkgeverId, werkgeverRij[0].id),
              eq(documentStudioModellenTable.status, "goedgekeurd"),
            ),
          )
          .limit(10);
        if (studioModellen.length > 0) {
          studioContext = studioModellen
            .map((m) => `- ${m.documentType}: "${m.naam ?? "zonder naam"}"`)
            .join("\n");
          bewijs.push({
            stap: "studio_context",
            resultaat: `${studioModellen.length} referentiemodellen gevonden`,
            detail: studioModellen.map((m) => m.documentType).join(", "),
          });
        }
      }
    } catch (err) {
      logger.warn({ err }, "documentIntelligence: Studio-modellen ophalen mislukt");
    }
  }

  // ── Stap 3c: Eerdere correcties ophalen ──────────────────────────────────
  let correctieContext: string | null = null;
  try {
    const correcties = await db
      .select({
        origineleCategorie: documentClassificatieCorrectiesTable.origineleCategorie,
        gecorrigeerdeCategorie: documentClassificatieCorrectiesTable.gecorrigeerdeCategorie,
        werkmaatschappij: documentClassificatieCorrectiesTable.werkmaatschappij,
      })
      .from(documentClassificatieCorrectiesTable)
      .where(
        input.werkmaatschappijNaam
          ? eq(documentClassificatieCorrectiesTable.werkmaatschappij, input.werkmaatschappijNaam)
          : eq(documentClassificatieCorrectiesTable.id, 0), // geen match bij ontbrekende naam
      )
      .orderBy(desc(documentClassificatieCorrectiesTable.aangemaaktOp))
      .limit(10);
    if (correcties.length > 0) {
      correctieContext = correcties
        .map((c) => `- Was: ${c.origineleCategorie} → Gecorrigeerd naar: ${c.gecorrigeerdeCategorie}`)
        .join("\n");
      bewijs.push({
        stap: "correctie_context",
        resultaat: `${correcties.length} eerdere correcties gevonden`,
      });
    }
  } catch (err) {
    logger.warn({ err }, "documentIntelligence: Correcties ophalen mislukt");
  }

  // ── Fail-closed: niets leesbaars → géén AI-analyse, géén verzonnen categorie ──
  // Zonder tekstlaag én zonder gerenderde pagina's heeft de AI niets om op te
  // classificeren; elk antwoord zou fabulatie zijn. We geven "onbekend" terug
  // met een expliciete, zichtbare reden bij het document.
  // "Bruikbare tekst" is meer dan niet-leeg: een handvol rommeltekens uit een
  // scan is geen basis voor classificatie (minimum 40 tekens).
  const bruikbareTekst = !!extractie.tekst && extractie.tekst.trim().length >= 40;
  const heeftLeesbareInvoer = bruikbareTekst || afbeeldingen.length > 0;
  if (!heeftLeesbareInvoer) {
    if (!leesProbleem) {
      leesProbleem = extractie.tekst && extractie.tekst.trim().length > 0
        ? "Document bevat vrijwel geen leesbare tekst en kon niet als afbeelding worden gelezen"
        : "Document bevat geen machine-leesbare tekst en kon niet als afbeelding worden gelezen";
    }
    bewijs.push({ stap: "leesbaarheid", resultaat: "onleesbaar", detail: leesProbleem });
    return {
      categorie: "onbekend",
      subtype: null,
      voorstel_naam: bestandsnaam.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim(),
      redenering: `Document kon niet gelezen worden: ${leesProbleem}. Classificatie is daarom niet uitgevoerd — controleer het bestand of voer de gegevens handmatig in.`,
      vertrouwen: "laag",
      vertrouwen_score: 0,
      ai_beschikbaar: heeftGateway(),
      vision_gebruikt: false,
      tekst_gevonden: false,
      ai_model: null,
      gevonden_gegevens: {},
      alternatieven: [],
      organisatie: null,
      jaar: null,
      module_bestemming: CATEGORIE_MODULE["onbekend"],
      opslaglocatie: bepaalOpslaglocatie("onbekend", CATEGORIE_MODULE["onbekend"], null, null, null),
      beveiligingsprofiel: null,
      documentstatus: null,
      impact_niveau: "geen",
      impact_omschrijving: "",
      vereist_bevestiging: true,
      directe_actie_beschrijving: "",
      lees_probleem: leesProbleem,
      bewijs,
    };
  }

  const aiAnalyse = await aiContentAnalyse(
    bestandsnaam,
    mime,
    extractie.tekst,
    afbeeldingen,
    input.toelichting,
    bewijs,
    input.werkmaatschappijNaam,
    studioContext,
    correctieContext,
  );

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

  const organisatie = await herkenOrganisatie(extractie.tekst, basis.gevonden_gegevens, input.werkmaatschappijNaam);
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

  let subtype = basis.subtype ?? (basis.gevonden_gegevens.document_subtype ?? null);
  // Deterministische vangnet-stap: de AI vergeet soms document_subtype="cv" mee te
  // geven terwijl het document overduidelijk een CV is. De CV-onboardingflow hangt
  // op dit subtype, dus we leiden het zo nodig zelf af uit tekst/bestandsnaam.
  if (!subtype && basis.categorie === "personeelsdocument") {
    const tekstLower = (extractie.tekst ?? "").toLowerCase();
    const naamLower = bestandsnaam.toLowerCase();
    const isCv =
      tekstLower.includes("curriculum vitae") ||
      /\bcv\b/.test(naamLower.replace(/[-_.]/g, " ")) ||
      (tekstLower.includes("werkervaring") && tekstLower.includes("opleiding")) ||
      tekstLower.includes("solliciteer");
    if (isCv) {
      subtype = "cv";
      bewijs.push({
        stap: "subtype_afgeleid",
        resultaat: "cv",
        detail: "CV-kenmerken in tekst/bestandsnaam (vangnet: AI gaf geen subtype)",
      });
    } else {
      // Zelfde vangnet voor arbeidscontracten: de gerichte contract-flow
      // (medewerker- en documenttype-voorstel) hangt op dit subtype.
      const isContract =
        tekstLower.includes("arbeidsovereenkomst") ||
        tekstLower.includes("arbeidscontract") ||
        naamLower.includes("arbeidsovereenkomst") ||
        naamLower.includes("arbeidscontract") ||
        (tekstLower.includes("werkgever") && tekstLower.includes("werknemer") && tekstLower.includes("in dienst"));
      if (isContract) {
        subtype = "arbeidscontract";
        bewijs.push({
          stap: "subtype_afgeleid",
          resultaat: "arbeidscontract",
          detail: "Arbeidscontract-kenmerken in tekst/bestandsnaam (vangnet: AI gaf geen subtype)",
        });
      } else {
        // Vangnet voor functiebeschrijvingen: het dossiertype in het
        // personeelsdossier hangt op dit subtype.
        const isFunctiebeschrijving =
          tekstLower.includes("functiebeschrijving") ||
          tekstLower.includes("functieomschrijving") ||
          tekstLower.includes("functieprofiel") ||
          naamLower.includes("functiebeschrijving") ||
          naamLower.includes("functieomschrijving") ||
          /functie[ _-]?beschrijving/.test(naamLower);
        if (isFunctiebeschrijving) {
          subtype = "functiebeschrijving";
          bewijs.push({
            stap: "subtype_afgeleid",
            resultaat: "functiebeschrijving",
            detail: "Functiebeschrijving-kenmerken in tekst/bestandsnaam (vangnet: AI gaf geen subtype)",
          });
        }
      }
    }
  }
  // Deterministisch vangnet voor geconsolideerde jaarrekeningen: typo-tolerante
  // detectie op tekst én bestandsnaam (bijv. "Geconsolideeerd" met een extra e),
  // zodat het subtype ook zonder AI correct wordt gezet.
  if (basis.categorie === "jaarrekening" && subtype !== "geconsolideerd") {
    if (bevatGeconsolideerd(`${bestandsnaam} ${extractie.tekst ?? ""}`)) {
      subtype = "geconsolideerd";
      bewijs.push({
        stap: "subtype_afgeleid",
        resultaat: "geconsolideerd",
        detail: "Geconsolideerd-kenmerk in tekst/bestandsnaam (typo-tolerant vangnet)",
      });
    }
  }
  const module = CATEGORIE_MODULE[basis.categorie];
  bewijs.push({ stap: "module_bepaald", resultaat: module });

  const opslaglocatie = bepaalOpslaglocatie(basis.categorie, module, jaar, subtype, organisatie);
  bewijs.push({ stap: "opslaglocatie_voorgesteld", resultaat: opslaglocatie });

  let beveiligingsprofiel: string | null = null;
  let documentstatus: "definitief" | "concept" | "onbekend" | null = null;
  if (basis.categorie === "jaarrekening") {
    beveiligingsprofiel = "FINANCIAL_CONFIDENTIAL";
    documentstatus = herkenFinancieleStatus(extractie.tekst, basis.gevonden_gegevens);
    bewijs.push({
      stap: "financieel_profiel",
      resultaat: "FINANCIAL_CONFIDENTIAL",
      detail: `Vertrouwelijk financieel jaarstuk; documentstatus ${documentstatus}, ${subtype === "geconsolideerd" ? "geconsolideerd" : "enkelvoudig"}`,
    });
  }

  const visionGebruikt = afbeeldingen.length > 0;
  const vertrouwen = berekenVertrouwen({
    aiBeschikbaar: basis.ai_beschikbaar,
    aiVertrouwen: aiAnalyse ? aiAnalyse.vertrouwen : null,
    tekstGevonden: !!extractie.tekst,
    visionGebruikt,
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
    vision_gebruikt: visionGebruikt,
    tekst_gevonden: !!extractie.tekst,
    ai_model: aiAnalyse?.ai_model ?? null,
    gevonden_gegevens: basis.gevonden_gegevens,
    alternatieven: basis.alternatieven,
    organisatie,
    jaar,
    module_bestemming: module,
    opslaglocatie,
    beveiligingsprofiel,
    documentstatus,
    impact_niveau: basis.impact_niveau,
    impact_omschrijving: basis.impact_omschrijving,
    vereist_bevestiging: basis.vereist_bevestiging,
    directe_actie_beschrijving: basis.directe_actie_beschrijving,
    lees_probleem: leesProbleem,
    bewijs,
  };
}

// ── FACTUUR_02: diepe factuur-extractie voor de factuurstroom ─────────────────
// Hoort bewust hiér (de ene documentherkenner, §11) — nieuwe documentanalyses
// worden nooit per-route gebouwd.

export interface FactuurStroomVelden {
  leverancier_naam: string | null;
  factuurnummer: string | null;
  factuurdatum: string | null;       // YYYY-MM-DD
  vervaldatum: string | null;        // YYYY-MM-DD (evt. afgeleid uit betalingstermijn)
  betalingstermijn_dagen: number | null;
  bedrag_excl_btw: number | null;
  btw_bedrag: number | null;
  bedrag_incl_btw: number | null;
  iban: string | null;
  loondeel_bedrag: number | null;    // G-rekeningdeel zoals op de factuur vermeld
  loondeel_vermeld: boolean;         // staat er expliciet een G/loondeel-verdeling op?
  tenaamstelling: string | null;     // aan wie is de factuur gericht (BV-naam)
  verwijzing: string | null;         // opdracht-/project-/bonnummer op de factuur
  omschrijving: string | null;
  onzekere_velden: string[];         // veldnamen waarover de AI niet zeker is
}

export interface FactuurStroomAnalyse {
  ok: boolean;
  is_factuur: boolean;
  velden: FactuurStroomVelden | null;
  fout: string | null;
}

const FACTUUR_STROOM_PROMPT = `Je leest een Nederlandse inkoopfactuur voor een bouwbedrijf (FPS: FPS Bouw BV, FPS Brandpreventie BV, FPS Onderhoud BV).
Geef uitsluitend JSON met exact deze sleutels:
{"is_factuur":bool,"leverancier_naam":string|null,"factuurnummer":string|null,"factuurdatum":"YYYY-MM-DD"|null,"vervaldatum":"YYYY-MM-DD"|null,"betalingstermijn_dagen":number|null,"bedrag_excl_btw":number|null,"btw_bedrag":number|null,"bedrag_incl_btw":number|null,"iban":string|null,"loondeel_bedrag":number|null,"loondeel_vermeld":bool,"tenaamstelling":string|null,"verwijzing":string|null,"omschrijving":string|null,"onzekere_velden":[string]}
Regels:
- vervaldatum: indien niet vermeld maar wel een betalingstermijn ("30 dagen"), leid af uit factuurdatum + termijn.
- loondeel: alleen het op de factuur zelf vermelde G-rekening/loondeel-bedrag; nooit zelf schatten. Niet vermeld → loondeel_bedrag null en loondeel_vermeld false.
- tenaamstelling: de geadresseerde zoals op de factuur staat (bijv. "FPS Bouw B.V.").
- verwijzing: opdrachtnummer, projectnummer, inkoopbonnummer of referentie zoals vermeld.
- Bestandsnaam, mail-onderwerp en afzender zijn alleen achtergrondcontext: neem er NOOIT een gegevensveld
  (factuurnummer, bedrag, datum, IBAN, leverancier, loondeel) uit over. Alleen wat op het document zelf staat telt.
- Is een gegeven op het document niet leesbaar of niet aanwezig → null. Verzin niets.
- Twijfel je over een veld, vul je beste lezing in en zet de veldnaam in onzekere_velden. Verzin nooit gegevens.`;

export async function analyseerFactuurVoorStroom(input: {
  buffer: Buffer;
  bestandsnaam: string;
  mime: string;
  mailOnderwerp?: string | null;
  mailAfzender?: string | null;
}): Promise<FactuurStroomAnalyse> {
  if (!heeftGateway()) {
    return { ok: false, is_factuur: false, velden: null, fout: "AI-gateway niet beschikbaar" };
  }
  let tekst: string | null = null;
  let paginaAantal: number | null = null;
  try {
    const extractie = await extraheerTekst(input.buffer, input.mime, input.bestandsnaam);
    tekst = extractie.tekst;
    paginaAantal = extractie.paginaAantal;
  } catch {
    tekst = null;
  }

  const content: Array<Record<string, unknown>> = [];
  const context = `Bestandsnaam: ${input.bestandsnaam}\nMail-onderwerp: ${input.mailOnderwerp ?? "-"}\nAfzender: ${input.mailAfzender ?? "-"}`;
  if (tekst && tekst.trim().length > 80) {
    content.push({ type: "text", text: `${context}\n\nFactuurtekst:\n${tekst.slice(0, 12000)}` });
  } else if (input.mime === "application/pdf") {
    // Scan zonder tekstlaag → vision op de eerste pagina's (max 5, DOCUMENT_01 §3.5:
    // een specificatie op pagina twee of verder moet volledig gelezen worden)
    try {
      // Bij onbekend pagina-aantal proberen we gewoon 1..5: renderPdfPaginas
      // slaat niet-bestaande pagina's stil over.
      const aantal = Math.min(Math.max(paginaAantal ?? 5, 1), 5);
      const paginas = await renderPdfPaginas(input.buffer, Array.from({ length: aantal }, (_, i) => i + 1));
      if (paginas.length === 0) {
        return { ok: false, is_factuur: false, velden: null, fout: "geen leesbare tekst en rendering mislukt" };
      }
      content.push({ type: "text", text: context });
      for (const p of paginas) {
        content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${p.base64}`, detail: "high" } });
      }
    } catch {
      return { ok: false, is_factuur: false, velden: null, fout: "PDF-rendering niet beschikbaar" };
    }
  } else if (input.mime.startsWith("image/")) {
    // Zelfde verkleiningsroute als PDF's (max 2000px, JPEG 85) — nooit het rauwe
    // bestand doorsturen (grote/afwijkende formaten falen of kosten onnodig veel).
    const base64 = await resizeAfbeelding(input.buffer);
    if (!base64) {
      return { ok: false, is_factuur: false, velden: null, fout: "afbeelding niet leesbaar of niet ondersteund" };
    }
    content.push({ type: "text", text: context });
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "high" } });
  } else {
    return { ok: false, is_factuur: false, velden: null, fout: "geen leesbare inhoud gevonden" };
  }

  const slot = content.some((c) => c["type"] === "image_url") ? "vision" : "fast";
  const resultaat = await aiGateway.chat(
    slot,
    {
      response_format: { type: "json_object" },
      max_tokens: 1000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "system", content: FACTUUR_STROOM_PROMPT }, { role: "user", content } as any],
    },
    undefined,
    { module: "facturen", functie: "factuurstroom_extractie", promptNaam: "factuurstroom-extractie", promptVersie: "1.0.0" },
  );
  if (!resultaat.ok) {
    return { ok: false, is_factuur: false, velden: null, fout: resultaat.fout };
  }
  try {
    const json = JSON.parse(resultaat.inhoud) as Record<string, unknown>;
    const s = (k: string): string | null => (typeof json[k] === "string" && (json[k] as string).trim() !== "" ? (json[k] as string).trim() : null);
    const n = (k: string): number | null => (typeof json[k] === "number" && Number.isFinite(json[k] as number) ? (json[k] as number) : null);
    const velden: FactuurStroomVelden = {
      leverancier_naam: s("leverancier_naam"),
      factuurnummer: s("factuurnummer"),
      factuurdatum: s("factuurdatum"),
      vervaldatum: s("vervaldatum"),
      betalingstermijn_dagen: n("betalingstermijn_dagen"),
      bedrag_excl_btw: n("bedrag_excl_btw"),
      btw_bedrag: n("btw_bedrag"),
      bedrag_incl_btw: n("bedrag_incl_btw"),
      iban: s("iban")?.replace(/\s+/g, "") ?? null,
      loondeel_bedrag: n("loondeel_bedrag"),
      loondeel_vermeld: json["loondeel_vermeld"] === true,
      tenaamstelling: s("tenaamstelling"),
      verwijzing: s("verwijzing"),
      omschrijving: s("omschrijving"),
      onzekere_velden: Array.isArray(json["onzekere_velden"])
        ? (json["onzekere_velden"] as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
    };
    return { ok: true, is_factuur: json["is_factuur"] === true, velden, fout: null };
  } catch {
    return { ok: false, is_factuur: false, velden: null, fout: "AI-antwoord was geen geldige JSON" };
  }
}

// ── AKKOORD_01 §5: opdrachtbevestiging-extractie voor de akkoordpoort ─────────
// Zelfde model als de factuur-extractie: AI stelt voor mét vindplaats, de mens
// bevestigt. Hoort bewust hiér — geen per-route herkenner.

export interface OpdrachtbevestigingVelden {
  opdrachtgever: string | null;
  opdrachtnummer: string | null;
  offerte_referentie: string | null; // ons kenmerk / offertenummer waarnaar verwezen wordt
  bedrag: number | null;             // opdrachtbedrag zoals vermeld
  bedrag_incl_btw: boolean | null;   // staat er expliciet incl./excl. btw bij?
  datum: string | null;              // YYYY-MM-DD
  betaaltermijn_dagen: number | null;
  garantietermijn: string | null;
  meerwerk: string | null;           // afspraak over meer-/minderwerk zoals vermeld
  oplevering: string | null;         // opleverdatum of doorlooptijd zoals vermeld
  boete_korting: string | null;      // boete-/kortingsclausule zoals vermeld
  voorwaarden_tekst: string | null;  // van toepassing verklaarde voorwaarden (bv. "UAV 2012")
  vindplaatsen: Record<string, string>; // veldnaam → citaat/plek op het document
  onzekere_velden: string[];
}

export interface OpdrachtbevestigingAnalyse {
  ok: boolean;
  is_opdrachtbevestiging: boolean;
  velden: OpdrachtbevestigingVelden | null;
  fout: string | null;
}

const OPDRACHTBEVESTIGING_PROMPT = `Je leest een Nederlandse opdrachtbevestiging/inkooporder van een opdrachtgever aan een bouwbedrijf (FPS).
Geef uitsluitend JSON met exact deze sleutels:
{"is_opdrachtbevestiging":bool,"opdrachtgever":string|null,"opdrachtnummer":string|null,"offerte_referentie":string|null,"bedrag":number|null,"bedrag_incl_btw":bool|null,"datum":"YYYY-MM-DD"|null,"betaaltermijn_dagen":number|null,"garantietermijn":string|null,"meerwerk":string|null,"oplevering":string|null,"boete_korting":string|null,"voorwaarden_tekst":string|null,"vindplaatsen":{"veldnaam":"citaat of plek"},"onzekere_velden":[string]}
Regels:
- Alleen wat op het document zelf staat telt; bestandsnaam/mail-context is achtergrond, nooit gegevensbron.
- vindplaatsen: geef per ingevuld veld een kort citaat of de plek (bv. "onder 'Betaling': 30 dagen na factuurdatum").
- garantietermijn/meerwerk/oplevering/boete_korting/voorwaarden_tekst: letterlijke of kort samengevatte afspraak zoals vermeld; niet vermeld → null.
- Is een gegeven niet leesbaar of niet aanwezig → null. Verzin niets.
- Twijfel je over een veld, vul je beste lezing in en zet de veldnaam in onzekere_velden.`;

export async function analyseerOpdrachtbevestiging(input: {
  buffer: Buffer;
  bestandsnaam: string;
  mime: string;
}): Promise<OpdrachtbevestigingAnalyse> {
  if (!heeftGateway()) {
    return { ok: false, is_opdrachtbevestiging: false, velden: null, fout: "AI-gateway niet beschikbaar" };
  }
  let tekst: string | null = null;
  let paginaAantal: number | null = null;
  try {
    const extractie = await extraheerTekst(input.buffer, input.mime, input.bestandsnaam);
    tekst = extractie.tekst;
    paginaAantal = extractie.paginaAantal;
  } catch {
    tekst = null;
  }

  const content: Array<Record<string, unknown>> = [];
  const context = `Bestandsnaam: ${input.bestandsnaam}`;
  if (tekst && tekst.trim().length > 80) {
    content.push({ type: "text", text: `${context}\n\nDocumenttekst:\n${tekst.slice(0, 12000)}` });
  } else if (input.mime === "application/pdf") {
    try {
      const aantal = Math.min(Math.max(paginaAantal ?? 5, 1), 5);
      const paginas = await renderPdfPaginas(input.buffer, Array.from({ length: aantal }, (_, i) => i + 1));
      if (paginas.length === 0) {
        return { ok: false, is_opdrachtbevestiging: false, velden: null, fout: "geen leesbare tekst en rendering mislukt" };
      }
      content.push({ type: "text", text: context });
      for (const p of paginas) {
        content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${p.base64}`, detail: "high" } });
      }
    } catch {
      return { ok: false, is_opdrachtbevestiging: false, velden: null, fout: "PDF-rendering niet beschikbaar" };
    }
  } else if (input.mime.startsWith("image/")) {
    const base64 = await resizeAfbeelding(input.buffer);
    if (!base64) {
      return { ok: false, is_opdrachtbevestiging: false, velden: null, fout: "afbeelding niet leesbaar of niet ondersteund" };
    }
    content.push({ type: "text", text: context });
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "high" } });
  } else {
    return { ok: false, is_opdrachtbevestiging: false, velden: null, fout: "geen leesbare inhoud gevonden" };
  }

  const slot = content.some((c) => c["type"] === "image_url") ? "vision" : "fast";
  const resultaat = await aiGateway.chat(
    slot,
    {
      response_format: { type: "json_object" },
      max_tokens: 1200,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "system", content: OPDRACHTBEVESTIGING_PROMPT }, { role: "user", content } as any],
    },
    undefined,
    { module: "projecten", functie: "opdrachtbevestiging_extractie", promptNaam: "opdrachtbevestiging-extractie", promptVersie: "1.0.0" },
  );
  if (!resultaat.ok) {
    return { ok: false, is_opdrachtbevestiging: false, velden: null, fout: resultaat.fout };
  }
  try {
    const json = JSON.parse(resultaat.inhoud) as Record<string, unknown>;
    const s = (k: string): string | null => (typeof json[k] === "string" && (json[k] as string).trim() !== "" ? (json[k] as string).trim() : null);
    const n = (k: string): number | null => (typeof json[k] === "number" && Number.isFinite(json[k] as number) ? (json[k] as number) : null);
    const vindplaatsen: Record<string, string> = {};
    if (json["vindplaatsen"] && typeof json["vindplaatsen"] === "object") {
      for (const [k, v] of Object.entries(json["vindplaatsen"] as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim() !== "") vindplaatsen[k] = v.trim();
      }
    }
    const velden: OpdrachtbevestigingVelden = {
      opdrachtgever: s("opdrachtgever"),
      opdrachtnummer: s("opdrachtnummer"),
      offerte_referentie: s("offerte_referentie"),
      bedrag: n("bedrag"),
      bedrag_incl_btw: typeof json["bedrag_incl_btw"] === "boolean" ? (json["bedrag_incl_btw"] as boolean) : null,
      datum: s("datum"),
      betaaltermijn_dagen: n("betaaltermijn_dagen"),
      garantietermijn: s("garantietermijn"),
      meerwerk: s("meerwerk"),
      oplevering: s("oplevering"),
      boete_korting: s("boete_korting"),
      voorwaarden_tekst: s("voorwaarden_tekst"),
      vindplaatsen,
      onzekere_velden: Array.isArray(json["onzekere_velden"])
        ? (json["onzekere_velden"] as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
    };
    return { ok: true, is_opdrachtbevestiging: json["is_opdrachtbevestiging"] === true, velden, fout: null };
  } catch {
    return { ok: false, is_opdrachtbevestiging: false, velden: null, fout: "AI-antwoord was geen geldige JSON" };
  }
}

// ── AANVRAAG_01: prijsaanvraag-extractie voor de aanvraagstroom ───────────────
// Hoort bewust hiér (de ene documentherkenner) — hergebruikt de bestaande
// categorie "aanvraag"; er komt geen tweede herkenner.

export interface AanvraagStroomVelden {
  titel: string | null;              // korte werktitel afgeleid uit de aanvraag
  klant_naam: string | null;         // organisatienaam van de aanvrager
  contact_naam: string | null;
  gebouw_naam: string | null;        // naam/aanduiding van het pand
  gebouw_adres: string | null;
  gebouw_stad: string | null;
  bv: string | null;                 // FPS Bouw | FPS Brandpreventie | FPS Onderhoud
  werknummer_verwijzing: string | null; // werk-/projectnummer dat in de mail genoemd wordt
  ontbrekende_stukken: string[];     // wat er aantoonbaar ontbreekt om te kunnen calculeren
  samenvatting: string | null;
  onzekere_velden: string[];
}

export interface AanvraagStroomAnalyse {
  ok: boolean;
  is_aanvraag: boolean;
  velden: AanvraagStroomVelden | null;
  fout: string | null;
}

const AANVRAAG_STROOM_PROMPT = `Je leest een e-mail (met eventuele bijlagetekst) gericht aan een Nederlands bouw-/brandpreventiebedrijf (FPS: FPS Bouw, FPS Brandpreventie, FPS Onderhoud).
Bepaal of dit een prijsaanvraag is: een offerteaanvraag, RFQ, bestek of verzoek om werk uit te voeren/te calculeren. Een factuur, nieuwsbrief, bevestiging of interne mail is GEEN aanvraag.
Geef uitsluitend JSON met exact deze sleutels:
{"is_aanvraag":bool,"titel":string|null,"klant_naam":string|null,"contact_naam":string|null,"gebouw_naam":string|null,"gebouw_adres":string|null,"gebouw_stad":string|null,"bv":"FPS Bouw"|"FPS Brandpreventie"|"FPS Onderhoud"|null,"werknummer_verwijzing":string|null,"ontbrekende_stukken":[string],"samenvatting":string|null,"onzekere_velden":[string]}
Regels:
- titel: korte Nederlandse werktitel (bv. "Brandwerende doorvoeringen Zorgcentrum De Linde").
- bv: alleen invullen als het uit het ontvangende mailadres of de inhoud blijkt; anders null.
- werknummer_verwijzing: alleen een werk-/project-/opdrachtnummer dat LETTERLIJK in de tekst staat; nooit verzinnen.
- ontbrekende_stukken: alleen dingen die aantoonbaar nodig zijn om te calculeren en aantoonbaar ontbreken (bv. plattegronden, bestek, aantallen). Verzin nooit een ontbrekend stuk. Twijfel = leeg laten.
- Twijfel je over een veld, vul je beste lezing in en zet de veldnaam in onzekere_velden. Verzin nooit gegevens.`;

export async function analyseerAanvraagVoorStroom(input: {
  mailOnderwerp: string;
  mailAfzender: string;
  mailTekst: string;
  bijlageTeksten?: Array<{ naam: string; tekst: string }>;
}): Promise<AanvraagStroomAnalyse> {
  if (!heeftGateway()) {
    return { ok: false, is_aanvraag: false, velden: null, fout: "AI-gateway niet beschikbaar" };
  }
  let tekst = `Onderwerp: ${input.mailOnderwerp}\nAfzender: ${input.mailAfzender}\n\nMailtekst:\n${input.mailTekst.slice(0, 8000)}`;
  for (const b of input.bijlageTeksten ?? []) {
    tekst += `\n\nBijlage "${b.naam}":\n${b.tekst.slice(0, 4000)}`;
  }
  const resultaat = await aiGateway.chat(
    "fast",
    {
      response_format: { type: "json_object" },
      max_tokens: 800,
      messages: [{ role: "system", content: AANVRAAG_STROOM_PROMPT }, { role: "user", content: tekst }],
    },
    undefined,
    { module: "crm", functie: "aanvraagstroom_extractie", promptNaam: "aanvraagstroom-extractie", promptVersie: "1.0.0" },
  );
  if (!resultaat.ok) {
    return { ok: false, is_aanvraag: false, velden: null, fout: resultaat.fout };
  }
  try {
    const json = JSON.parse(resultaat.inhoud) as Record<string, unknown>;
    const s = (k: string): string | null => (typeof json[k] === "string" && (json[k] as string).trim() !== "" ? (json[k] as string).trim() : null);
    const lijst = (k: string): string[] => (Array.isArray(json[k]) ? (json[k] as unknown[]).filter((v): v is string => typeof v === "string") : []);
    const bvRuw = s("bv");
    const velden: AanvraagStroomVelden = {
      titel: s("titel"),
      klant_naam: s("klant_naam"),
      contact_naam: s("contact_naam"),
      gebouw_naam: s("gebouw_naam"),
      gebouw_adres: s("gebouw_adres"),
      gebouw_stad: s("gebouw_stad"),
      bv: bvRuw && ["FPS Bouw", "FPS Brandpreventie", "FPS Onderhoud"].includes(bvRuw) ? bvRuw : null,
      werknummer_verwijzing: s("werknummer_verwijzing"),
      ontbrekende_stukken: lijst("ontbrekende_stukken"),
      samenvatting: s("samenvatting"),
      onzekere_velden: lijst("onzekere_velden"),
    };
    return { ok: true, is_aanvraag: json["is_aanvraag"] === true, velden, fout: null };
  } catch {
    return { ok: false, is_aanvraag: false, velden: null, fout: "AI-antwoord was geen geldige JSON" };
  }
}

// ── CALC_INVOER_01: geplakt productmateriaal → tekst + vision-invoer ──────────
// Zet een geplakte schermafdruk (afbeelding) of een productblad (pdf) om naar
// leesbare tekst (indien aanwezig) én — als het beeldmateriaal is — naar
// base64-JPEG's voor een vision-aanroep. Hergebruikt de bestaande interne
// helpers (extraheerTekst / renderPdfPaginas / resizeAfbeelding); er wordt geen
// classificatielogica gedupliceerd. Haalt NOOIT externe URL's op.
export interface PlakInvoerResultaat {
  tekst: string | null;                                       // machineleesbare tekst uit pdf, of null
  afbeeldingen: Array<{ paginaNummer: number; base64: string }>; // vision-invoer (leeg bij platte tekst)
  bron: "afbeelding" | "pdf" | "geen";
}

export async function haalPlakInvoerBeeld(input: {
  buffer: Buffer;
  mime: string;
  bestandsnaam: string;
}): Promise<PlakInvoerResultaat> {
  const mime = input.mime || "application/octet-stream";
  // Afbeelding (geplakte schermafdruk): resize zoals documentIntelligence en
  // altijd via vision uitlezen — een screenshot heeft geen tekstlaag.
  if (mime.startsWith("image/") && !["image/svg+xml", "image/tiff", "image/bmp"].includes(mime)) {
    const base64 = await resizeAfbeelding(input.buffer);
    return base64
      ? { tekst: null, afbeeldingen: [{ paginaNummer: 1, base64 }], bron: "afbeelding" }
      : { tekst: null, afbeeldingen: [], bron: "geen" };
  }
  // Productblad (pdf): eerst de tekstlaag proberen; is die er niet of te dun,
  // dan de eerste pagina's renderen voor vision (max 5, zoals DOCUMENT_01 §3.5).
  if (mime === "application/pdf" || input.bestandsnaam.toLowerCase().endsWith(".pdf")) {
    const extractie = await extraheerTekst(input.buffer, "application/pdf", input.bestandsnaam);
    const heeftTekst = !!extractie.tekst && extractie.tekst.trim().length > 80;
    let afbeeldingen: Array<{ paginaNummer: number; base64: string }> = [];
    if (!heeftTekst) {
      try {
        const aantal = Math.min(Math.max(extractie.paginaAantal ?? 3, 1), 5);
        afbeeldingen = await renderPdfPaginas(input.buffer, Array.from({ length: aantal }, (_, i) => i + 1));
      } catch (err) {
        logger.warn({ err }, "documentIntelligence: plak-invoer PDF-rendering mislukt");
      }
    }
    return { tekst: heeftTekst ? extractie.tekst : null, afbeeldingen, bron: "pdf" };
  }
  return { tekst: null, afbeeldingen: [], bron: "geen" };
}

// ── PRIJS_01 §4: prijslijst → importstroom-voorstel ───────────────────────────
// Hoort bewust hiér (de ene documentherkenner). Leest een geüploade prijslijst
// (excel/csv/pdf), stelt leverancier/periode/valuta + kolomkoppeling voor en
// geeft proefregels terug. Vult NIETS in — de gebruiker bevestigt in de import-UI.
// Er wordt nooit gegokt: bij pdf worden onzeker-parsebare rijen weggelaten en
// geteld als 'niet leesbaar'.

// Doelvelden van het importtype 'prijsafspraken' (zie routes/import.ts TYPE_CONFIG).
export const PRIJSLIJST_DOELVELDEN = [
  "artikelcode",
  "omschrijving",
  "prijs",
  "eenheid",
  "geldig_van",
  "geldig_tot",
  "staffel_vanaf",
  "excl_btw",
] as const;

export type PrijslijstBestandssoort = "excel" | "csv" | "pdf";

export interface PrijslijstVoorstel {
  bestandssoort: PrijslijstBestandssoort;
  leverancier_voorstel: { naam: string | null; leverancier_id: number | null };
  periode_voorstel: { geldig_van: string | null; geldig_tot: string | null };
  valuta_voorstel: string | null;
  // map van kolomkop (excel/csv) of gedestilleerde kolomnaam (pdf) → doelveld.
  kolomkoppeling_voorstel: Record<string, string>;
  kolommen: string[];
  proefregels: Array<Record<string, string>>;
  niet_leesbaar: number;
  waarschuwing: string | null;
}

function bepaalBestandssoort(mime: string, bestandsnaam: string): PrijslijstBestandssoort {
  const naam = bestandsnaam.toLowerCase();
  if (mime === "application/pdf" || naam.endsWith(".pdf")) return "pdf";
  if (mime === "text/csv" || naam.endsWith(".csv")) return "csv";
  return "excel";
}

/**
 * Parseert een excel/csv-buffer naar koppen + rijen (dezelfde route als de
 * importstroom gebruikt via XLSX). Geeft de kolomkoppen en de eerste `max` rijen
 * als string-maps terug.
 */
function parseTabelBestand(buffer: Buffer, max: number): { kolommen: string[]; rijen: Array<Record<string, string>> } {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!sheet) return { kolommen: [], rijen: [] };
  const ruw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const rijen = ruw.map((rij) =>
    Object.fromEntries(Object.entries(rij).map(([k, v]) => [k.trim(), String(v ?? "").trim()])),
  );
  const kolommen = rijen.length > 0 ? Object.keys(rijen[0]!) : [];
  return { kolommen, rijen: rijen.slice(0, max) };
}

/** Deterministische kolomkoppeling op basis van kolomnaam (fallback zonder AI). */
function heuristischeKolomkoppeling(kolommen: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const kol of kolommen) {
    const k = kol.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/artikelcode|artcode|code|artikelnr|artikelnummer/.test(k)) map[kol] = "artikelcode";
    else if (/omschrijving|omschr|beschrijving|naam|artikel/.test(k)) map[kol] = "omschrijving";
    else if (/prijs|price|nettoprijs|bedrag/.test(k)) map[kol] = "prijs";
    else if (/eenheid|unit|verpakking/.test(k)) map[kol] = "eenheid";
    else if (/geldigvan|ingangsdatum|vanaf|startdatum/.test(k)) map[kol] = "geldig_van";
    else if (/geldigtot|einddatum|tot|vervaldatum/.test(k)) map[kol] = "geldig_tot";
    else if (/staffel|vanafaantal|minimumaantal/.test(k)) map[kol] = "staffel_vanaf";
    else if (/exclbtw|exbtw|exclusiefbtw|btw/.test(k)) map[kol] = "excl_btw";
  }
  return map;
}

/**
 * AI-voorstel voor leverancier/periode/valuta + kolomkoppeling op basis van de
 * koppen en de eerste rijen. Valt terug op de heuristiek als AI niet beschikbaar
 * is of faalt. Geeft NOOIT een reasoning-veld terug.
 */
async function aiPrijslijstKop(
  kolommen: string[],
  eersteRijen: Array<Record<string, string>>,
  toegestaneDoelvelden: readonly string[],
): Promise<{
  leverancier_naam: string | null;
  geldig_van: string | null;
  geldig_tot: string | null;
  valuta: string | null;
  kolomkoppeling: Record<string, string>;
}> {
  const heuristiek = heuristischeKolomkoppeling(kolommen);
  if (!heeftGateway()) {
    return { leverancier_naam: null, geldig_van: null, geldig_tot: null, valuta: null, kolomkoppeling: heuristiek };
  }
  const bericht =
    `Kolomkoppen: ${JSON.stringify(kolommen)}\n` +
    `Eerste rijen (max 5):\n${JSON.stringify(eersteRijen.slice(0, 5), null, 0)}\n` +
    `Toegestane doelvelden: ${JSON.stringify(toegestaneDoelvelden)}`;
  const resultaat = await aiGateway.chat(
    "fast",
    {
      response_format: { type: "json_object" },
      max_tokens: 800,
      messages: [
        { role: "system", content: PRIJSLIJST_VOORSTEL_PROMPT.tekst },
        { role: "user", content: bericht },
      ],
    },
    undefined,
    { module: "import", functie: "prijslijst_kop", promptNaam: PRIJSLIJST_VOORSTEL_PROMPT.naam, promptVersie: PRIJSLIJST_VOORSTEL_PROMPT.versie },
  );
  if (!resultaat.ok || !resultaat.inhoud) {
    return { leverancier_naam: null, geldig_van: null, geldig_tot: null, valuta: null, kolomkoppeling: heuristiek };
  }
  try {
    const json = JSON.parse(resultaat.inhoud) as Record<string, unknown>;
    const s = (k: string): string | null =>
      typeof json[k] === "string" && (json[k] as string).trim() !== "" ? (json[k] as string).trim() : null;
    const map: Record<string, string> = { ...heuristiek };
    if (Array.isArray(json.kolomkoppeling)) {
      for (const item of json.kolomkoppeling as unknown[]) {
        if (item && typeof item === "object") {
          const kol = (item as Record<string, unknown>).kolom;
          const doel = (item as Record<string, unknown>).doelveld;
          if (typeof kol === "string" && kolommen.includes(kol) && typeof doel === "string") {
            if (doel && (toegestaneDoelvelden as readonly string[]).includes(doel)) map[kol] = doel;
            else delete map[kol];
          }
        }
      }
    }
    return {
      leverancier_naam: s("leverancier_naam"),
      geldig_van: s("geldig_van"),
      geldig_tot: s("geldig_tot"),
      valuta: s("valuta"),
      kolomkoppeling: map,
    };
  } catch {
    return { leverancier_naam: null, geldig_van: null, geldig_tot: null, valuta: null, kolomkoppeling: heuristiek };
  }
}

/** Uit pdf-tekst betrouwbare tabelrijen destilleren; onzekere rijen worden geteld. */
async function aiPrijslijstPdfTabel(tekst: string): Promise<{
  kolommen: string[];
  rijen: Array<Record<string, string>>;
  niet_leesbaar: number;
}> {
  if (!heeftGateway()) {
    return { kolommen: [], rijen: [], niet_leesbaar: 0 };
  }
  const resultaat = await aiGateway.chat(
    "fast",
    {
      response_format: { type: "json_object" },
      max_tokens: 2500,
      messages: [
        { role: "system", content: PRIJSLIJST_PDF_TABEL_PROMPT.tekst },
        { role: "user", content: tekst.slice(0, 12000) },
      ],
    },
    undefined,
    { module: "import", functie: "prijslijst_pdf_tabel", promptNaam: PRIJSLIJST_PDF_TABEL_PROMPT.naam, promptVersie: PRIJSLIJST_PDF_TABEL_PROMPT.versie },
  );
  if (!resultaat.ok || !resultaat.inhoud) {
    return { kolommen: [], rijen: [], niet_leesbaar: 0 };
  }
  try {
    const json = JSON.parse(resultaat.inhoud) as Record<string, unknown>;
    const kolommen = Array.isArray(json.kolommen)
      ? (json.kolommen as unknown[]).filter((k): k is string => typeof k === "string")
      : ["artikelcode", "omschrijving", "prijs", "eenheid", "staffel_vanaf"];
    const rijen = Array.isArray(json.rijen)
      ? (json.rijen as unknown[])
          .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
          .map((r) =>
            Object.fromEntries(
              Object.entries(r).map(([k, v]) => [k, v == null ? "" : String(v).trim()]),
            ),
          )
      : [];
    const niet_leesbaar = typeof json.niet_leesbaar === "number" && Number.isFinite(json.niet_leesbaar)
      ? Math.max(0, Math.round(json.niet_leesbaar))
      : 0;
    return { kolommen, rijen, niet_leesbaar };
  } catch {
    return { kolommen: [], rijen: [], niet_leesbaar: 0 };
  }
}

/**
 * Hoofdfunctie voor POST /import/prijslijst-voorstel. `matchLeverancier` mapt de
 * voorgestelde leveranciersnaam naar een bestaand leverancier_id (of null) —
 * die DB-toegang blijft in de route zodat deze lib DB-onafhankelijk blijft voor
 * dit pad.
 */
export async function stelPrijslijstVoorstel(input: {
  buffer: Buffer;
  bestandsnaam: string;
  mime: string;
  matchLeverancier: (naam: string) => number | null;
}): Promise<PrijslijstVoorstel> {
  const bestandssoort = bepaalBestandssoort(input.mime, input.bestandsnaam);
  const MAX_PROEF = 20;

  let kolommen: string[] = [];
  let alleRijen: Array<Record<string, string>> = [];
  let niet_leesbaar = 0;
  let waarschuwing: string | null = null;

  if (bestandssoort === "pdf") {
    waarschuwing = "kolomherkenning bij pdf is foutgevoeliger";
    let tekst: string | null = null;
    try {
      const ext = await extraheerPdfTekst(input.buffer);
      tekst = ext.tekst;
    } catch (err) {
      logger.warn({ err }, "prijslijst-voorstel: PDF-tekstextractie mislukt");
    }
    if (tekst && tekst.trim().length > 0) {
      const tabel = await aiPrijslijstPdfTabel(tekst);
      kolommen = tabel.kolommen;
      alleRijen = tabel.rijen;
      niet_leesbaar = tabel.niet_leesbaar;
    }
  } else {
    const geparsed = parseTabelBestand(input.buffer, 1000);
    kolommen = geparsed.kolommen;
    alleRijen = geparsed.rijen;
  }

  const kop = await aiPrijslijstKop(kolommen, alleRijen.slice(0, 5), PRIJSLIJST_DOELVELDEN);

  // Voor pdf leveren we de gedestilleerde koppen (die zijn al de doelveldnamen);
  // laat de kolomkoppeling dan 1-op-1 zijn tenzij AI iets anders voorstelt.
  let kolomkoppeling = kop.kolomkoppeling;
  if (bestandssoort === "pdf" && Object.keys(kolomkoppeling).length === 0) {
    kolomkoppeling = {};
    for (const kol of kolommen) {
      if ((PRIJSLIJST_DOELVELDEN as readonly string[]).includes(kol)) kolomkoppeling[kol] = kol;
    }
  }

  const leverancierId = kop.leverancier_naam ? input.matchLeverancier(kop.leverancier_naam) : null;

  return {
    bestandssoort,
    leverancier_voorstel: { naam: kop.leverancier_naam, leverancier_id: leverancierId },
    periode_voorstel: { geldig_van: kop.geldig_van, geldig_tot: kop.geldig_tot },
    valuta_voorstel: kop.valuta ?? "EUR",
    kolomkoppeling_voorstel: kolomkoppeling,
    kolommen,
    proefregels: alleRijen.slice(0, MAX_PROEF),
    niet_leesbaar,
    waarschuwing,
  };
}

// Puur-functionele exports voor unit tests (geen DB/AI-netwerkcall nodig).
export const _test = { heuristischClassificeerInhoud, herkenJaarUitTekst, herkenJaarUitBestandsnaam, bepaalOpslaglocatie, berekenVertrouwen, herkenFinancieleStatus, bevatGeconsolideerd, heuristischeKolomkoppeling, bepaalBestandssoort, CATEGORIE_MODULE };

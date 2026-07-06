import { Router } from "express";
import multer from "multer";
import { execFile } from "node:child_process";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { requireAuth } from "../middlewares/auth";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { logger } from "../lib/logger";
import { db, gebruikersTable, slimUploadLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ── Categorieën ───────────────────────────────────────────────────────────────

export const SLIM_UPLOAD_CATEGORIEEN = [
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
  "bibliotheek",
  "document_sjabloon",
  "algemeen",
  "onbekend",
] as const;

export type SlimUploadCategorie = (typeof SLIM_UPLOAD_CATEGORIEEN)[number];

function isCategorie(v: unknown): v is SlimUploadCategorie {
  return typeof v === "string" && (SLIM_UPLOAD_CATEGORIEEN as readonly string[]).includes(v);
}

export interface SlimUploadSuggestie {
  categorie: SlimUploadCategorie;
  voorstel_naam: string;
  redenering: string;
  vertrouwen: "laag" | "midden" | "hoog";
  ai_beschikbaar: boolean;
  vision_gebruikt: boolean;
  gevonden_gegevens: Record<string, string>;
  alternatieven: SlimUploadCategorie[];
  // Impact & bevestiging (AI + backend gegenereerd)
  impact_niveau: "geen" | "laag" | "midden" | "hoog";
  impact_omschrijving: string;
  vereist_bevestiging: boolean;
  directe_actie_beschrijving: string;
  // Toegangscontrole (toegevoegd door route handler op basis van sessie)
  mag_uploaden: boolean;
  beperkingen: string[];
}

// ── Heuristische fallback ─────────────────────────────────────────────────────

function heuristischClassificeer(
  bestandsnaam: string,
  mime: string,
  tekstFragment?: string | null,
): SlimUploadSuggestie {
  const naam = bestandsnaam.toLowerCase();
  const ext = naam.includes(".") ? naam.split(".").pop() ?? "" : "";
  const tekstLeeg = !tekstFragment || tekstFragment.trim().length < 80;
  const isPdf = mime === "application/pdf";

  let categorie: SlimUploadCategorie = "algemeen";

  const sjabloonSleutelwoorden = ["model", "briefpapier", "briefhoofd", "sjabloon", "template",
    "huisstijl", "logo", "onderlegger", "letterhead", "header", "footer", "opmaak"];
  if (isPdf && tekstLeeg && sjabloonSleutelwoorden.some((k) => naam.includes(k))) {
    return {
      categorie: "document_sjabloon",
      voorstel_naam: bestandsnaam.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim(),
      redenering: "Lege PDF met huisstijl-sleutelwoord in naam — waarschijnlijk briefpapier of sjabloon.",
      vertrouwen: "hoog",
      ai_beschikbaar: false,
      vision_gebruikt: false,
      gevonden_gegevens: {},
      alternatieven: ["algemeen", "bibliotheek"],
      impact_niveau: "laag",
      impact_omschrijving: "",
      vereist_bevestiging: false,
      directe_actie_beschrijving: "Sjabloon opslaan in Document Studio.",
      mag_uploaden: true,
      beperkingen: [],
    };
  }
  if (isPdf && tekstLeeg) {
    return {
      categorie: "document_sjabloon",
      voorstel_naam: bestandsnaam.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim(),
      redenering: "PDF bevat geen leesbare tekst — waarschijnlijk een visueel document (sjabloon, scan of tekening).",
      vertrouwen: "laag",
      ai_beschikbaar: false,
      vision_gebruikt: false,
      gevonden_gegevens: {},
      alternatieven: ["tekening", "algemeen"],
      impact_niveau: "laag",
      impact_omschrijving: "",
      vereist_bevestiging: false,
      directe_actie_beschrijving: "",
      mag_uploaden: true,
      beperkingen: [],
    };
  }

  if (["eta", "european technical assessment"].some((k) => naam.includes(k))) {
    categorie = "eta";
  } else if (["dop", "prestatieverklaring", "declaration of performance"].some((k) => naam.includes(k))) {
    categorie = "dop";
  } else if (["testrapport", "classificatierapport", "brandproef", "fire test"].some((k) => naam.includes(k))) {
    categorie = "testrapport";
  } else if (["certificaat", "komo", "kiwa", "brl "].some((k) => naam.includes(k))) {
    categorie = "certificaat";
  } else if (["productblad", "productdocument", "verwerkingsvoorschrift", "tds ", "technical data"].some((k) => naam.includes(k))) {
    categorie = "productdocument";
  } else if (["offerte", "aanbieding", "prijsopgave", "quotation"].some((k) => naam.includes(k))) {
    categorie = "offerte";
  } else if (["factuur", "invoice", "creditnota"].some((k) => naam.includes(k))) {
    categorie = "factuur";
  } else if (["aanvraag", "rfq", "tender", "bestek"].some((k) => naam.includes(k))) {
    categorie = "aanvraag";
  } else if (["cv", "curriculum vitae", "curriculum_vitae", "resume", "sollicitatie"].some((k) => naam.includes(k))) {
    return {
      categorie: "personeelsdocument",
      voorstel_naam: bestandsnaam.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim(),
      redenering: "CV of sollicitatiedocument herkend op bestandsnaam — onboarding starten of klaarzetten?",
      vertrouwen: "hoog",
      ai_beschikbaar: false,
      vision_gebruikt: false,
      gevonden_gegevens: { document_subtype: "cv" },
      alternatieven: ["personeelsdocument", "algemeen"],
      impact_niveau: "midden",
      impact_omschrijving: "Uploaden van een CV kan leiden tot onboarding van een nieuwe medewerker. Controleer de gegevens zorgvuldig.",
      vereist_bevestiging: true,
      directe_actie_beschrijving: "CV opslaan en onboarding starten.",
      mag_uploaden: true,
      beperkingen: [],
    };
  } else if (["polis", "verzekering", "assurantie", "aansprakelijkheid", "wettelijkeaansprakelijkheid"].some((k) => naam.includes(k))) {
    return {
      categorie: "verzekering",
      voorstel_naam: bestandsnaam.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim(),
      redenering: "Verzekeringsdocument herkend op bestandsnaam — jaar bepaalt archief of actueel.",
      vertrouwen: "midden",
      ai_beschikbaar: false,
      vision_gebruikt: false,
      gevonden_gegevens: {},
      alternatieven: ["personeelsdocument", "bibliotheek", "algemeen"],
      impact_niveau: "midden",
      impact_omschrijving: "Het opslaan van een verzekeringspolis als actuele versie vervangt de vorige registratie.",
      vereist_bevestiging: true,
      directe_actie_beschrijving: "Verzekeringspolis registreren.",
      mag_uploaden: true,
      beperkingen: [],
    };
  } else if (["arbeidscontract", "arbeidsovereenkomst", "diploma", "vca", "vog", "personeelsdossier"].some((k) => naam.includes(k))) {
    categorie = "personeelsdocument";
  } else if (["tekening", "plattegrond", "situatie", "autocad"].some((k) => naam.includes(k)) || ext === "dwg") {
    categorie = "tekening";
  } else if (["rapport", "verslag", "oplevering", "inspectie", "snag"].some((k) => naam.includes(k))) {
    categorie = "snagstream";
  } else if (mime.startsWith("image/") && !["jpg", "jpeg", "png", "webp"].includes(ext)) {
    categorie = "tekening";
  }

  return {
    categorie,
    voorstel_naam: bestandsnaam.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim(),
    redenering: "Classificatie op basis van bestandsnaam en extensie (AI niet beschikbaar).",
    vertrouwen: "laag",
    ai_beschikbaar: false,
    vision_gebruikt: false,
    gevonden_gegevens: {},
    alternatieven: ["bibliotheek", "algemeen"],
    impact_niveau: "laag",
    impact_omschrijving: "",
    vereist_bevestiging: false,
    directe_actie_beschrijving: "",
    mag_uploaden: true,
    beperkingen: [],
  };
}

// ── Vision helpers ────────────────────────────────────────────────────────────

async function renderPdfPagina(buffer: Buffer): Promise<string | null> {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tmpIn     = path.join(tmpdir(), `fps_in_${id}.pdf`);
  const tmpPrefix = path.join(tmpdir(), `fps_out_${id}`);

  try {
    await writeFile(tmpIn, buffer);

    await new Promise<void>((resolve, reject) => {
      execFile(
        "pdftoppm",
        ["-jpeg", "-f", "1", "-l", "1", "-r", "120", tmpIn, tmpPrefix],
        { timeout: 15_000 },
        (err) => { if (err) reject(err); else resolve(); },
      );
    });

    let imgBuffer: Buffer | null = null;
    for (const candidate of [`${tmpPrefix}-01.jpg`, `${tmpPrefix}-1.jpg`]) {
      try {
        imgBuffer = await readFile(candidate);
        await unlink(candidate).catch(() => {});
        break;
      } catch { /* probeer volgende */ }
    }
    if (!imgBuffer) return null;

    const sharp = (await import("sharp")).default;
    return (await sharp(imgBuffer)
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer()).toString("base64");
  } catch (err) {
    logger.warn({ err }, "slim-upload: PDF→afbeelding mislukt, doorgaan zonder vision");
    return null;
  } finally {
    await unlink(tmpIn).catch(() => {});
  }
}

async function resizeAfbeelding(buffer: Buffer): Promise<string | null> {
  try {
    const sharp = (await import("sharp")).default;
    return (await sharp(buffer)
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer()).toString("base64");
  } catch (err) {
    logger.warn({ err }, "slim-upload: afbeelding resize mislukt");
    return null;
  }
}

// ── AI-classificatie met vision ───────────────────────────────────────────────

const SYSTEEM_PROMPT = `Je bent een slimme documentclassificator voor FPS Connect, een brandpreventieplatform.
Je analyseert uploads via bestandsnaam, MIME-type, tekst ÉN — indien beschikbaar — een visuele weergave van de eerste pagina.
Gebruik ALLE beschikbare informatie. De visuele lay-out is minstens zo bepalend als tekst.

VISUELE SIGNALEN (gebruik dit wanneer je een afbeelding ziet):
- Pagina met uitsluitend bedrijfslogo, adres en lege ruimte → "document_sjabloon" (briefpapier/onderlegger)
- Pagina met maatlijnen, schaalnotatie, north-arrow of plattegrond → "tekening"
- Pagina met tabel van regelposten, IBAN, BTW-bedragen, betalingstermijn → "factuur"
- Pagina met projectnaam, locatiebeschrijving en werkzaamheden → "aanvraag"
- Pagina met brandweerstand EI/EW, testnormen, fabrikantlogo → "testrapport" of "certificaat"
- Pagina met persoonsnaam, werkervaring, opleiding, vaardigheden → "personeelsdocument" met document_subtype "cv"
- Pagina met persoonsnaam, dienstverband, salarisgegevens → "personeelsdocument"
- Pagina met polisnummer, verzekeraar, dekking, premie, ingangsdatum → "verzekering"
- Pagina met prijstabel, "geldig tot", excl. BTW → "offerte"
- Pagina met bevindingen, herstelacties, inspectiedatum, punchlijst → "snagstream"

CATEGORIEËN:
"aanvraag"          — Aanvraag, offerteaanvraag of opdrachtverzoek.
"tekening"          — Bouw- of installatietekening, plattegrond, situatietekening, DWG.
"offerte"           — Financiële offerte of prijsopgave van FPS richting klant.
"factuur"           — Factuur, creditnota, rekening.
"productdocument"   — Productblad, verwerkingsvoorschrift, technisch datasheet.
"testrapport"       — Brandproef, classificatierapport, fire test rapport.
"certificaat"       — KOMO, KIWA, BRL, CE-markering, kwaliteitscertificaat.
"eta"               — European Technical Assessment / ETB / EOTA.
"dop"               — Declaration of Performance / Prestatieverklaring.
"personeelsdocument"— Arbeidscontract, diploma, VCA, loonstrook, VOG, of CV/sollicitatie.
"verzekering"       — Verzekeringspolis, assurantiepolis, aansprakelijkheids- of bedrijfsverzekering. Altijd "jaar" extracten.
"snagstream"        — Opleverrapport, inspectieverslag, punchlijst, Snagstream-export.
"bibliotheek"       — Overige technische brandveiligheidsdocumenten.
"document_sjabloon" — Lege/visuele PDF met bedrijfslogo of huisstijl, bedoeld als briefpapier of Studio-onderlegger.
"algemeen"          — Correspondentie, notulen, presentaties, interne memo's.
"onbekend"          — Gebruik ALLEEN als het echt niet te classificeren is na grondige analyse.

REGELS:
1. Gebruik bestandsnaam, MIME-type, tekst én visuele lay-out samen.
2. Vertrouwen "hoog": meerdere duidelijke signalen aanwezig. "midden": één sterke aanwijzing. "laag": weinig info.
3. Geef altijd 2–3 alternatieven.
4. Extraheer in "gevonden_gegevens" relevante velden per type:
   - factuur: leverancier, bedrag, factuurnummer, datum, betalingstermijn
   - aanvraag: klant, locatie, contactpersoon, projectnaam, omschrijving
   - testrapport/eta/dop/certificaat: fabrikant, productnaam, normen, geldig_tot, classificatie
   - personeelsdocument (CV/sollicitatie): document_subtype="cv", naam_medewerker, gewenste_functie, opleiding_niveau, jaren_ervaring (GEEN BSN/salaris)
   - personeelsdocument (overig): naam_medewerker, type_document (GEEN BSN/salaris)
   - verzekering: soort_verzekering, polisnummer, verzekeraar, geldig_van, geldig_tot, jaar (verplicht — haal jaar uit geldig_tot of geldig_van)
   - snagstream: projectnaam, locatie, inspectiedatum, rapporttype, opdrachtgever
   - offerte: klant, bedrag, referentie, datum
   - tekening: project, schaal, revisie
   - document_sjabloon: bedrijf, documenttype_sjabloon
   - overig: alleen wat duidelijk zichtbaar is
5. Bij "onbekend": geef 3 zinvolle alternatieven.
6. CV-herkenning: als het document een werkervaring-/opleidingsoverzicht is (curriculum vitae, resume, sollicitatie), gebruik categorie "personeelsdocument" EN zet document_subtype="cv" in gevonden_gegevens.
7. Verzekering-jaar: extraheer altijd het jaar (viercijerig getal) uit de geldigheidsdatum. Gebruik sleutel "jaar".

IMPACT BEOORDELING — verplicht meegeven:
- "impact_niveau": beoordeel de risico/onomkeerbaarheid van de aanbevolen actie:
  - "geen": opslaan in algemeen archief, geen bestaande data geraakt
  - "laag": opslaan in specifieke module, vervangt niets
  - "midden": opslaan in personeelsdossier, starten van een workflow, vervangen van een document
  - "hoog": document bevat salarisgegevens, overschrijft bestaande actuele verzekeringspolis, start onomkeerbaar proces
- "impact_omschrijving": korte toelichting voor de gebruiker wat er kan gebeuren (max 200 tekens; leeg als impact_niveau "geen" of "laag" is)
- "vereist_bevestiging": true als impact_niveau "midden" of "hoog" is, anders false
- "directe_actie_beschrijving": aanbevolen actie in klare taal (max 150 tekens, bijv. "CV van Jan de Vries opslaan en onboarding starten" of "Verzekeringspolis 2026 registreren als actuele versie")

Geef uitsluitend geldige JSON:
{
  "categorie": "<één van de 16>",
  "voorstel_naam": "<max 80 tekens>",
  "redenering": "<max 200 tekens, beschrijf visuele én tekstuele aanwijzingen>",
  "vertrouwen": "laag|midden|hoog",
  "gevonden_gegevens": { "<sleutel>": "<waarde>" },
  "alternatieven": ["<cat1>", "<cat2>"],
  "impact_niveau": "geen|laag|midden|hoog",
  "impact_omschrijving": "<max 200 tekens>",
  "vereist_bevestiging": true,
  "directe_actie_beschrijving": "<max 150 tekens>"
}
Alleen JSON, geen extra tekst.`;

async function aiClassificeer(
  bestandsnaam: string,
  mime: string,
  tekstFragment: string | null,
  afbeeldingBase64: string | null,
  toelichting?: string | null,
): Promise<SlimUploadSuggestie> {
  const tekstInfo = tekstFragment && tekstFragment.trim().length > 0
    ? `Geëxtraheerde tekst (${tekstFragment.trim().length} tekens):\n${tekstFragment.trim().slice(0, 5000)}`
    : "Geëxtraheerde tekst: GEEN — het bestand bevat geen machine-leesbare tekst (afbeelding, visuele lay-out of gescand document).";

  const toelichtingInfo = toelichting && toelichting.trim().length > 0
    ? `\nGebruikerscontext (gebruik dit als extra hint bij classificatie): ${toelichting.trim().slice(0, 500)}`
    : "";

  const tekstBericht = [
    `Bestandsnaam: ${bestandsnaam}`,
    `MIME-type: ${mime}`,
    tekstInfo,
    toelichtingInfo,
  ].filter(Boolean).join("\n");

  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "low" } };

  const content: ContentBlock[] = [{ type: "text", text: tekstBericht }];
  if (afbeeldingBase64) {
    content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${afbeeldingBase64}`, detail: "low" },
    });
  }

  const slimChatResultaat = await aiGateway.chat("fast", {
    response_format: { type: "json_object" },
    max_tokens: 800,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: [{ role: "system", content: SYSTEEM_PROMPT }, { role: "user", content } as any],
  });
  if (!slimChatResultaat.ok) {
    logger.warn({ fout: slimChatResultaat.fout }, "slim-upload: AI-aanroep mislukt, terugvallen op heuristiek");
    return { ...heuristischClassificeer(bestandsnaam, mime, tekstFragment), ai_beschikbaar: false };
  }

  const antwoord = slimChatResultaat.inhoud;
  if (!antwoord) return { ...heuristischClassificeer(bestandsnaam, mime, tekstFragment), ai_beschikbaar: true };

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(antwoord); }
  catch {
    logger.warn({ antwoord }, "slim-upload: AI-JSON niet parseerbaar");
    return { ...heuristischClassificeer(bestandsnaam, mime, tekstFragment), ai_beschikbaar: true };
  }

  const cat = typeof parsed.categorie === "string" ? parsed.categorie.toLowerCase() : null;
  const vertr = typeof parsed.vertrouwen === "string" ? parsed.vertrouwen.toLowerCase() : "midden";
  const alt = Array.isArray(parsed.alternatieven)
    ? (parsed.alternatieven as unknown[]).filter((a): a is SlimUploadCategorie => isCategorie(a)).slice(0, 3)
    : ["bibliotheek", "algemeen"] as SlimUploadCategorie[];
  const gevonden = typeof parsed.gevonden_gegevens === "object" && parsed.gevonden_gegevens !== null
    ? Object.fromEntries(
        Object.entries(parsed.gevonden_gegevens as Record<string, unknown>)
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => [k, (v as string).slice(0, 200)])
      )
    : {};

  // Impact-velden parsen
  const impactRaw = typeof parsed.impact_niveau === "string" ? parsed.impact_niveau.toLowerCase() : "laag";
  const impactNiveau = (["geen", "laag", "midden", "hoog"].includes(impactRaw)
    ? impactRaw
    : "laag") as "geen" | "laag" | "midden" | "hoog";
  const vereistBevestiging = typeof parsed.vereist_bevestiging === "boolean"
    ? parsed.vereist_bevestiging
    : impactNiveau === "midden" || impactNiveau === "hoog";
  const impactOmschrijving = typeof parsed.impact_omschrijving === "string"
    ? parsed.impact_omschrijving.trim().slice(0, 300)
    : "";
  const directeActieBeschrijving = typeof parsed.directe_actie_beschrijving === "string"
    ? parsed.directe_actie_beschrijving.trim().slice(0, 200)
    : "";

  return {
    categorie: isCategorie(cat) ? cat : "algemeen",
    voorstel_naam:
      typeof parsed.voorstel_naam === "string" && parsed.voorstel_naam.trim()
        ? parsed.voorstel_naam.trim().slice(0, 80)
        : bestandsnaam.replace(/\.[^.]+$/, ""),
    redenering:
      typeof parsed.redenering === "string" ? parsed.redenering.trim().slice(0, 250) : "",
    vertrouwen: vertr === "hoog" ? "hoog" : vertr === "laag" ? "laag" : "midden",
    ai_beschikbaar: true,
    vision_gebruikt: afbeeldingBase64 !== null,
    gevonden_gegevens: gevonden,
    alternatieven: alt,
    impact_niveau: impactNiveau,
    impact_omschrijving: impactOmschrijving,
    vereist_bevestiging: vereistBevestiging,
    directe_actie_beschrijving: directeActieBeschrijving,
    mag_uploaden: true,
    beperkingen: [],
  };
}

// ── Tekst uit PDF halen ───────────────────────────────────────────────────────

async function haalPdfTekst(buffer: Buffer): Promise<string | null> {
  try {
    const pdfParse = ((await import("pdf-parse")) as unknown as { default: (b: Buffer) => Promise<{ text: string }> }).default;
    const result = await pdfParse(buffer);
    return result.text?.trim() || null;
  } catch { return null; }
}

// ── Bestand classificeren (tekst + vision) ────────────────────────────────────

async function classificeerBestand(
  bestand: Express.Multer.File,
  toelichting?: string | null,
): Promise<SlimUploadSuggestie> {
  const bestandsnaam = bestand.originalname ?? "onbekend";
  const mime = bestand.mimetype ?? "application/octet-stream";

  let tekstFragment: string | null = null;
  if (mime === "application/pdf") {
    tekstFragment = await haalPdfTekst(bestand.buffer);
  } else if (mime.startsWith("text/") || mime === "message/rfc822") {
    tekstFragment = bestand.buffer.toString("utf8").slice(0, 6000);
  }

  let afbeeldingBase64: string | null = null;
  if (heeftGateway()) {
    if (mime === "application/pdf") {
      afbeeldingBase64 = await renderPdfPagina(bestand.buffer);
    } else if (
      mime.startsWith("image/") &&
      !["image/svg+xml", "image/tiff", "image/bmp"].includes(mime)
    ) {
      afbeeldingBase64 = await resizeAfbeelding(bestand.buffer);
    }
  }

  if (heeftGateway()) {
    return aiClassificeer(bestandsnaam, mime, tekstFragment, afbeeldingBase64, toelichting);
  }
  return heuristischClassificeer(bestandsnaam, mime, tekstFragment);
}

// ── Permissiecheck helper ─────────────────────────────────────────────────────

async function haalGebruikerBevoegdheden(userId: number): Promise<{
  bevoegdheden: Record<string, number>;
  rol: string;
}> {
  try {
    const [g] = await db
      .select({ bevoegdheden: gebruikersTable.bevoegdheden, rol: gebruikersTable.rol })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, userId));
    if (!g) return { bevoegdheden: {}, rol: "gebruiker" };
    return {
      bevoegdheden: (g.bevoegdheden as Record<string, number> | null) ?? {},
      rol: g.rol ?? "gebruiker",
    };
  } catch {
    return { bevoegdheden: {}, rol: "gebruiker" };
  }
}

function verrijkMetBevoegdheden(
  suggestie: SlimUploadSuggestie,
  bevoegdheden: Record<string, number>,
  isHoofdBeheerder: boolean,
): SlimUploadSuggestie {
  const beperkingen: string[] = [];

  const heeftniveau = (mod: string, min: number) =>
    isHoofdBeheerder || (bevoegdheden[mod] ?? 0) >= min;

  if (suggestie.categorie === "personeelsdocument") {
    if (!heeftniveau("personeel", 1)) {
      beperkingen.push(
        "U heeft geen toegang tot de Personeelsmodule. Alleen klaarzetten in de inbox is mogelijk.",
      );
    } else if (!heeftniveau("personeel", 2)) {
      beperkingen.push(
        "U heeft leestoegang tot Personeel. Opslaan in een personeelsdossier vereist schrijftoegang (niveau 2).",
      );
    }
    // Detecteer salarisgegevens in gevonden_gegevens
    const gev = suggestie.gevonden_gegevens ?? {};
    const salarisSloetels = ["salaris", "loon", "bruto", "netto", "jaarsalaris", "uurloon"];
    const bevatSalaris =
      Object.keys(gev).some((k) => salarisSloetels.some((s) => k.toLowerCase().includes(s))) ||
      Object.values(gev).some((v) => /\b(salaris|bruto|netto|loon)\b/i.test(v));
    if (bevatSalaris && !isHoofdBeheerder) {
      const verrijkt: SlimUploadSuggestie = {
        ...suggestie,
        impact_niveau: "hoog",
        vereist_bevestiging: true,
        impact_omschrijving:
          suggestie.impact_omschrijving ||
          "Dit document bevat mogelijke salarisgegevens. Uploaden kan bestaande personeelsinformatie overschrijven.",
      };
      if (!heeftniveau("personeel", 2)) {
        beperkingen.push(
          "Salarisgegevens gedetecteerd — direct opslaan in een personeelsdossier is niet toegestaan zonder schrijftoegang.",
        );
      }
      return { ...verrijkt, beperkingen, mag_uploaden: true };
    }
  } else if (suggestie.categorie === "factuur") {
    if (!heeftniveau("financieel", 1)) {
      beperkingen.push(
        "Geen toegang tot Financieel. Factuur kan alleen via de inbox worden doorgezet.",
      );
    }
  } else if (suggestie.categorie === "offerte") {
    if (!heeftniveau("offertes", 1)) {
      beperkingen.push(
        "Geen toegang tot Offertes. Bestand kan alleen via de inbox worden doorgezet.",
      );
    }
  }

  return { ...suggestie, beperkingen, mag_uploaden: true };
}

// ── Route: POST /slim-upload/analyseer ───────────────────────────────────────

router.post(
  "/slim-upload/analyseer",
  requireAuth,
  upload.any(),
  async (req, res): Promise<void> => {
    const bestanden = (req.files as Express.Multer.File[] | undefined) ?? [];

    if (bestanden.length === 0) {
      res.status(400).json({ error: "Geen bestand(en) meegestuurd." });
      return;
    }

    const toelichting = typeof req.body?.toelichting === "string" && req.body.toelichting.trim().length > 0
      ? req.body.toelichting.trim().slice(0, 500)
      : null;

    try {
      const resultaten = await Promise.all(bestanden.map((b) => classificeerBestand(b, toelichting)));

      // Permissiecheck op basis van sessie
      const userId = req.session.userId;
      let bevoegdheden: Record<string, number> = {};
      let isHoofdBeheerder = false;
      if (userId) {
        const info = await haalGebruikerBevoegdheden(userId);
        bevoegdheden = info.bevoegdheden;
        isHoofdBeheerder = info.rol === "hoofdbeheerder";
      }

      const verrijkteResultaten = resultaten.map((s) =>
        verrijkMetBevoegdheden(s, bevoegdheden, isHoofdBeheerder),
      );

      for (const [i, s] of verrijkteResultaten.entries()) {
        req.log.info(
          {
            bestandsnaam: bestanden[i]?.originalname,
            categorie: s.categorie,
            vertrouwen: s.vertrouwen,
            vision: s.vision_gebruikt,
            impact: s.impact_niveau,
          },
          "slim-upload: analyse gereed",
        );
      }

      res.json(verrijkteResultaten.length === 1 ? verrijkteResultaten[0] : verrijkteResultaten);
    } catch (err) {
      req.log.error(err, "slim-upload: interne fout");
      res.status(500).json({ error: "Analyse mislukt door interne fout." });
    }
  },
);

// ── Route: POST /slim-upload/log ──────────────────────────────────────────────

router.post(
  "/slim-upload/log",
  requireAuth,
  async (req, res): Promise<void> => {
    const { bestandsnaam, categorie, actie, impactNiveau, bevestigd, geweigerd, opmerking } =
      (req.body as Record<string, unknown>) ?? {};

    if (!bestandsnaam || !categorie || !actie) {
      res.status(400).json({ error: "Ontbrekende velden: bestandsnaam, categorie, actie." });
      return;
    }

    const geldigImpact = ["geen", "laag", "midden", "hoog"].includes(String(impactNiveau ?? ""))
      ? String(impactNiveau)
      : "laag";

    try {
      await db.insert(slimUploadLogTable).values({
        gebruikerId: req.session.userId ?? null,
        bestandsnaam: String(bestandsnaam).slice(0, 500),
        categorie: String(categorie).slice(0, 100),
        actie: String(actie).slice(0, 100),
        impactNiveau: geldigImpact,
        bevestigd: Boolean(bevestigd),
        geweigerd: Boolean(geweigerd),
        opmerking: opmerking ? String(opmerking).slice(0, 500) : null,
        ipAdres: req.ip ?? null,
      });
      res.json({ ok: true });
    } catch (err) {
      req.log.error(err, "slim-upload: log opslaan mislukt");
      res.status(500).json({ error: "Log opslaan mislukt." });
    }
  },
);

// ── Route: GET /slim-upload/log (alleen hoofdbeheerder) ───────────────────────

router.get(
  "/slim-upload/log",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.session.userId;
    if (!userId) {
      res.status(401).json({ error: "Niet ingelogd." });
      return;
    }

    const info = await haalGebruikerBevoegdheden(userId);
    if (info.rol !== "hoofdbeheerder") {
      res.status(403).json({ error: "Alleen de hoofdbeheerder kan het upload-log inzien." });
      return;
    }

    try {
      const logs = await db
        .select({
          id: slimUploadLogTable.id,
          gebruikerNaam: gebruikersTable.naam,
          bestandsnaam: slimUploadLogTable.bestandsnaam,
          categorie: slimUploadLogTable.categorie,
          actie: slimUploadLogTable.actie,
          impactNiveau: slimUploadLogTable.impactNiveau,
          bevestigd: slimUploadLogTable.bevestigd,
          geweigerd: slimUploadLogTable.geweigerd,
          opmerking: slimUploadLogTable.opmerking,
          aangemaaktOp: slimUploadLogTable.aangemaaktOp,
        })
        .from(slimUploadLogTable)
        .leftJoin(gebruikersTable, eq(slimUploadLogTable.gebruikerId, gebruikersTable.id))
        .orderBy(desc(slimUploadLogTable.aangemaaktOp))
        .limit(500);

      res.json(logs);
    } catch (err) {
      req.log.error(err, "slim-upload: log ophalen mislukt");
      res.status(500).json({ error: "Log ophalen mislukt." });
    }
  },
);

export default router;

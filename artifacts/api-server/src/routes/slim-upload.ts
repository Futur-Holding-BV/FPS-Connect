import { Router } from "express";
import multer from "multer";
import { execFile } from "node:child_process";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { requireAuth } from "../middlewares/auth";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { logger } from "../lib/logger";

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

  // Lege PDF: waarschijnlijk visueel document (logo, briefpapier, tekening, scan)
  const sjabloonSleutelwoorden = ["model", "briefpapier", "briefhoofd", "sjabloon", "template",
    "huisstijl", "logo", "onderlegger", "letterhead", "header", "footer", "opmaak"];
  if (isPdf && tekstLeeg && sjabloonSleutelwoorden.some((k) => naam.includes(k))) {
    return {
      categorie: "document_sjabloon",
      voorstel_naam: bestandsnaam.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim(),
      redenering: "Lege PDF met huisstijl-sleutelwoord in naam — waarschijnlijk briefpapier of sjabloon voor de Document Studio.",
      vertrouwen: "hoog",
      ai_beschikbaar: false,
      vision_gebruikt: false,
      gevonden_gegevens: {},
      alternatieven: ["algemeen", "bibliotheek"],
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
  };
}

// ── Vision helpers ────────────────────────────────────────────────────────────

// Eerste PDF-pagina naar JPEG via pdftoppm (poppler, beschikbaar op dit systeem)
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

    // pdftoppm legt af als prefix-01.jpg of prefix-1.jpg
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

// Afbeelding schalen + naar base64 voor vision
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
- Pagina met persoonsnaam, dienstverband, salarisgegevens → "personeelsdocument"
- Pagina met prijstabel, "geldig tot", excl. BTW → "offerte"
- Pagina met bevindingen, herstelacties, inspectiedatum → "snagstream"

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
"personeelsdocument"— Arbeidscontract, diploma, VCA, loonstrook, VOG.
"snagstream"        — Opleverrapport, inspectieverslag, punchlijst.
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
   - personeelsdocument: naam_medewerker, type_document (GEEN BSN/salaris)
   - offerte: klant, bedrag, referentie, datum
   - tekening: project, schaal, revisie
   - document_sjabloon: bedrijf, documenttype_sjabloon
   - overig: alleen wat duidelijk zichtbaar is
5. Bij "onbekend": geef 3 zinvolle alternatieven.

Geef uitsluitend geldige JSON:
{
  "categorie": "<één van de 15>",
  "voorstel_naam": "<max 80 tekens>",
  "redenering": "<max 200 tekens, beschrijf visuele én tekstuele aanwijzingen>",
  "vertrouwen": "laag|midden|hoog",
  "gevonden_gegevens": { "<sleutel>": "<waarde>" },
  "alternatieven": ["<cat1>", "<cat2>"]
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

  // Bouw het user-bericht op: tekst altijd, afbeelding indien beschikbaar
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
    max_tokens: 600,
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

  // 1. Tekst extraheren
  let tekstFragment: string | null = null;
  if (mime === "application/pdf") {
    tekstFragment = await haalPdfTekst(bestand.buffer);
  } else if (mime.startsWith("text/") || mime === "message/rfc822") {
    tekstFragment = bestand.buffer.toString("utf8").slice(0, 6000);
  }

  // 2. Vision-afbeelding voorbereiden (parallel aan tekst, indien AI beschikbaar)
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

  // 3. Classificeren
  if (heeftGateway()) {
    return aiClassificeer(bestandsnaam, mime, tekstFragment, afbeeldingBase64, toelichting);
  }
  return heuristischClassificeer(bestandsnaam, mime, tekstFragment);
}

// ── Route: POST /slim-upload/analyseer ───────────────────────────────────────

router.post(
  "/slim-upload/analyseer",
  requireAuth,
  upload.any(),
  async (req, res) => {
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

      for (const [i, s] of resultaten.entries()) {
        req.log.info(
          {
            bestandsnaam: bestanden[i]?.originalname,
            categorie: s.categorie,
            vertrouwen: s.vertrouwen,
            vision: s.vision_gebruikt,
          },
          "slim-upload: analyse gereed",
        );
      }

      // Stuur één object terug als er één bestand is (frontend verwacht geen array)
      res.json(resultaten.length === 1 ? resultaten[0] : resultaten);
    } catch (err) {
      req.log.error(err, "slim-upload: interne fout");
      res.status(500).json({ error: "Analyse mislukt door interne fout." });
    }
  },
);

export default router;

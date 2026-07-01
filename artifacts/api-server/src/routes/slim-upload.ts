import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middlewares/auth";
import { maakOpenAiClient, heeftOpenAi } from "../lib/openai";
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
  gevonden_gegevens: Record<string, string>;
  alternatieven: SlimUploadCategorie[];
}

// ── Heuristische fallback ─────────────────────────────────────────────────────

function heuristischClassificeer(bestandsnaam: string, mime: string): SlimUploadSuggestie {
  const naam = bestandsnaam.toLowerCase();
  const ext = naam.includes(".") ? naam.split(".").pop() ?? "" : "";

  let categorie: SlimUploadCategorie = "algemeen";

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
    gevonden_gegevens: {},
    alternatieven: ["bibliotheek", "algemeen"],
  };
}

// ── AI-classificatie ──────────────────────────────────────────────────────────

const SYSTEEM_PROMPT = `Je bent een slimme documentclassificator voor FPS Connect, een brandpreventieplatform.
Je analyseert uploads en herkent documenttype, inhoud en relevante gegevens.

CATEGORIEËN:
"aanvraag"        — Aanvraag/offerteaanvraag/opdrachtverzoek/e-mail met projectverzoek. Signalen: "aanvraag", "verzoek", "graag offerte", klant vraagt om iets.
"tekening"        — Bouw- of installatietekening, plattegrond, situatietekening. Signalen: schaal, DWG, AutoCAD, verdiepingsplan, doorsnede.
"offerte"         — Financiële offerte of prijsopgave van FPS richting klant. Signalen: offerte, aanbieding, excl. BTW, geldig tot.
"factuur"         — Factuur, creditnota, rekening. Signalen: factuur, invoice, IBAN, factuurnummer, betalingstermijn.
"productdocument" — Productblad, verwerkingsvoorschrift, technisch datasheet. Signalen: TDS, verwerkingsadvies, productomschrijving.
"testrapport"     — Brandproef, classificatierapport, fire test. Signalen: testrapport, classification report, EI/EW/EW, brandproef.
"certificaat"     — KOMO, KIWA, BRL, CE-markering, kwaliteitscertificaat. Signalen: certificaatnummer, geldig tot, certificeringsinstantie.
"eta"             — European Technical Assessment / Europese Technische Beoordeling. Signalen: ETA, ETB, EOTA.
"dop"             — Declaration of Performance / Prestatieverklaring. Signalen: DoP, prestatieverklaring, verordening 305/2011.
"personeelsdocument" — HR, arbeidscontract, diploma, VCA, loonstrook, VOG. Signalen: arbeidsovereenkomst, salaris, personeelsnummer.
"snagstream"      — Opleverrapport, inspectieverslag, punchlijst. Signalen: oplevering, inspectie, bevinding, herstel.
"bibliotheek"     — Overige technische brandveiligheidsdocumenten die niet in een specifieker type passen.
"algemeen"        — Correspondentie, notulen, presentaties, jaarverslagen, sjablonen, interne memo's.
"onbekend"        — Gebruik ALLEEN als het echt niet te classificeren is na grondige analyse.

REGELS:
1. Gebruik bestandsnaam, MIME-type én tekstfragment samen.
2. Vertrouwen "hoog": duidelijke signaalwoorden aanwezig. "midden": redelijk aanwijsbaar. "laag": weinig tekst of meerdere opties.
3. Geef altijd 2 alternatieven (op vertrouwensschaal na de hoofdkeuze).
4. Extraheer in "gevonden_gegevens" relevante velden afhankelijk van het type:
   - factuur: leverancier, bedrag, factuurnummer, datum, betalingstermijn
   - aanvraag: klant, locatie, contactpersoon, projectnaam, omschrijving
   - testrapport/eta/dop/certificaat: fabrikant, productnaam, normen, geldig_tot, classificatie
   - personeelsdocument: naam_medewerker, type_document (AVG-gevoelig — geen BSN/salaris)
   - offerte/factuur: klant, bedrag, referentie, datum
   - tekening: project, schaal, revisie
   - overig: alleen wat duidelijk zichtbaar is in de tekst
5. Bij "onbekend": geef 3 zinvolle alternatieven.

Geef uitsluitend geldige JSON:
{
  "categorie": "<één van de 14>",
  "voorstel_naam": "<max 80 tekens>",
  "redenering": "<max 150 tekens, nuttig ook bij laag vertrouwen>",
  "vertrouwen": "laag|midden|hoog",
  "gevonden_gegevens": { "<sleutel>": "<waarde>" },
  "alternatieven": ["<cat1>", "<cat2>"]
}
Alleen JSON, geen extra tekst.`;

async function aiClassificeer(
  bestandsnaam: string,
  mime: string,
  tekstFragment: string | null,
): Promise<SlimUploadSuggestie> {
  const client = maakOpenAiClient();

  const tekstInfo = tekstFragment && tekstFragment.trim().length > 0
    ? `Geëxtraheerde tekst (${tekstFragment.trim().length} tekens):`
    : "Geen leesbare tekst beschikbaar (mogelijk afbeelding, DWG of gescand document)";

  const gebruikersBericht = [
    `Bestandsnaam: ${bestandsnaam}`,
    `MIME-type: ${mime}`,
    tekstInfo,
    tekstFragment?.trim().length ? tekstFragment.trim().slice(0, 6000) : "",
  ].filter(Boolean).join("\n");

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: 600,
      messages: [
        { role: "system", content: SYSTEEM_PROMPT },
        { role: "user", content: gebruikersBericht },
      ],
    });
  } catch (err) {
    logger.warn({ err }, "slim-upload: AI-aanroep mislukt, terugvallen op heuristiek");
    return { ...heuristischClassificeer(bestandsnaam, mime), ai_beschikbaar: false };
  }

  const antwoord = completion.choices[0]?.message?.content;
  if (!antwoord) return { ...heuristischClassificeer(bestandsnaam, mime), ai_beschikbaar: true };

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(antwoord); }
  catch {
    logger.warn({ antwoord }, "slim-upload: AI-JSON niet parseerbaar");
    return { ...heuristischClassificeer(bestandsnaam, mime), ai_beschikbaar: true };
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
      typeof parsed.redenering === "string" ? parsed.redenering.trim().slice(0, 200) : "",
    vertrouwen: vertr === "hoog" ? "hoog" : vertr === "laag" ? "laag" : "midden",
    ai_beschikbaar: true,
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

async function classificeerBestand(bestand: Express.Multer.File): Promise<SlimUploadSuggestie> {
  const bestandsnaam = bestand.originalname ?? "onbekend";
  const mime = bestand.mimetype ?? "application/octet-stream";

  let tekstFragment: string | null = null;
  if (mime === "application/pdf") {
    tekstFragment = await haalPdfTekst(bestand.buffer);
  } else if (mime.startsWith("text/") || mime === "message/rfc822") {
    tekstFragment = bestand.buffer.toString("utf8").slice(0, 6000);
  }

  if (heeftOpenAi()) {
    return aiClassificeer(bestandsnaam, mime, tekstFragment);
  }
  return heuristischClassificeer(bestandsnaam, mime);
}

// ── Route: POST /slim-upload/analyseer ───────────────────────────────────────
// Accepteert: bestanden[] (meerdere) of bestand (enkelvoud, backwards compat)

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

    try {
      const resultaten = await Promise.all(bestanden.map(classificeerBestand));

      for (const [i, s] of resultaten.entries()) {
        req.log.info(
          { bestandsnaam: bestanden[i]?.originalname, categorie: s.categorie, vertrouwen: s.vertrouwen },
          "slim-upload: analyse gereed",
        );
      }

      res.json(resultaten);
    } catch (err) {
      req.log.error(err, "slim-upload: interne fout");
      res.status(500).json({ error: "Analyse mislukt door interne fout." });
    }
  },
);

export default router;

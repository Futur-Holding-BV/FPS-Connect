import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middlewares/auth";
import { maakOpenAiClient, heeftOpenAi } from "../lib/openai";
import { logger } from "../lib/logger";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ── Categorieën ───────────────────────────────────────────────────────────────

export const SLIM_UPLOAD_CATEGORIEEN = [
  "bibliotheek",
  "offerte",
  "factuur",
  "hrm",
  "tekening",
  "rapport",
  "algemeen",
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
}

// ── Heuristische fallback (zonder AI) ────────────────────────────────────────

function heuristischClassificeer(bestandsnaam: string, mime: string): SlimUploadSuggestie {
  const naam = bestandsnaam.toLowerCase();
  const ext = naam.includes(".") ? naam.split(".").pop() ?? "" : "";

  let categorie: SlimUploadCategorie = "algemeen";

  if (["eta", "testrapport", "classificatierapport", "dop", "productcertificaat", "verwerkingsvoorschrift", "productblad"].some((k) => naam.includes(k))) {
    categorie = "bibliotheek";
  } else if (["offerte", "aanbieding", "prijsopgave", "quotation"].some((k) => naam.includes(k))) {
    categorie = "offerte";
  } else if (["factuur", "invoice", "bon", "rekening", "creditnota"].some((k) => naam.includes(k))) {
    categorie = "factuur";
  } else if (["contract", "overeenkomst", "arbeidscontract", "dienstverband", "diploma", "certificaat"].some((k) => naam.includes(k))) {
    categorie = "hrm";
  } else if (["tekening", "plattegrond", "dwg", "autocad", "plan"].some((k) => naam.includes(k)) || ext === "dwg") {
    categorie = "tekening";
  } else if (["rapport", "verslag", "oplevering", "inspectie"].some((k) => naam.includes(k))) {
    categorie = "rapport";
  } else if (mime.startsWith("image/")) {
    categorie = "tekening";
  }

  const voorstelNaam = bestandsnaam.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim();

  return {
    categorie,
    voorstel_naam: voorstelNaam,
    redenering: "Classificatie op basis van bestandsnaam en extensie (AI niet beschikbaar).",
    vertrouwen: "laag",
    ai_beschikbaar: false,
  };
}

// ── AI-classificatie ──────────────────────────────────────────────────────────

const SYSTEEM_PROMPT = `Je bent een slimme bestandsclassificator voor FPS Connect, een platform voor brandpreventie-bedrijven.
Je krijgt de bestandsnaam, het MIME-type en optioneel een stuk tekstinhoud van een geüpload bestand.
Classificeer het bestand en geef een voorstel voor opslag en actie.

Mogelijke categorieën:
- "bibliotheek": Technische brandveiligheidsdocumenten — ETA, testrapport, classificatierapport, DoP, verwerkingsvoorschrift, productcertificaat, productblad
- "offerte": Offertes, prijsopgaven, aanbestedingen
- "factuur": Facturen, bonnen, creditnota's, rekeningen
- "hrm": HR-documenten — arbeidscontracten, diploma's, certificaten, opleidingsbewijzen, loonstroken
- "tekening": Tekeningen, plattegronden, CAD-bestanden, situatietekeningen
- "rapport": Opleverrapporten, inspectierapporten, auditverslagen
- "algemeen": Alles wat niet in bovenstaande past

Geef uitsluitend geldige JSON terug met deze velden:
- categorie (tekst): één van de categorieën hierboven
- voorstel_naam (tekst): een nette Nederlandse bestandsnaam zonder extensie, max 80 tekens
- redenering (tekst): korte Nederlandse uitleg waarom je deze keuze maakt, max 120 tekens
- vertrouwen (tekst): "laag", "midden" of "hoog"

Alleen JSON, geen extra tekst.`;

async function aiClassificeer(
  bestandsnaam: string,
  mime: string,
  tekstFragment: string | null,
): Promise<SlimUploadSuggestie> {
  const client = maakOpenAiClient();

  const gebruikersBericht = [
    `Bestandsnaam: ${bestandsnaam}`,
    `MIME-type: ${mime}`,
    tekstFragment ? `\nTekstfragment (eerste deel van bestand):\n${tekstFragment.slice(0, 6000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: 500,
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
  if (!antwoord) {
    return { ...heuristischClassificeer(bestandsnaam, mime), ai_beschikbaar: true };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(antwoord);
  } catch {
    logger.warn({ antwoord }, "slim-upload: AI-JSON niet parseerbaar");
    return { ...heuristischClassificeer(bestandsnaam, mime), ai_beschikbaar: true };
  }

  const cat = typeof parsed.categorie === "string" ? parsed.categorie.toLowerCase() : null;
  const vertr = typeof parsed.vertrouwen === "string" ? parsed.vertrouwen.toLowerCase() : "midden";

  return {
    categorie: isCategorie(cat) ? cat : "algemeen",
    voorstel_naam:
      typeof parsed.voorstel_naam === "string" && parsed.voorstel_naam.trim()
        ? parsed.voorstel_naam.trim().slice(0, 80)
        : bestandsnaam.replace(/\.[^.]+$/, ""),
    redenering:
      typeof parsed.redenering === "string" ? parsed.redenering.trim().slice(0, 150) : "",
    vertrouwen: vertr === "hoog" ? "hoog" : vertr === "laag" ? "laag" : "midden",
    ai_beschikbaar: true,
  };
}

// ── Tekst uit PDF halen ───────────────────────────────────────────────────────

async function haalPdfTekst(buffer: Buffer): Promise<string | null> {
  try {
    const pdfParse = ((await import("pdf-parse")) as { default: (b: Buffer) => Promise<{ text: string }> }).default;
    const result = await pdfParse(buffer);
    return result.text?.trim() || null;
  } catch {
    return null;
  }
}

// ── Route: POST /slim-upload/analyseer ───────────────────────────────────────

router.post(
  "/slim-upload/analyseer",
  requireAuth,
  upload.single("bestand"),
  async (req, res) => {
    const bestand = req.file;
    if (!bestand) {
      res.status(400).json({ error: "Geen bestand meegestuurd." });
      return;
    }

    const bestandsnaam = bestand.originalname ?? "onbekend";
    const mime = bestand.mimetype ?? "application/octet-stream";

    let tekstFragment: string | null = null;
    if (mime === "application/pdf") {
      tekstFragment = await haalPdfTekst(bestand.buffer);
    } else if (mime.startsWith("text/")) {
      tekstFragment = bestand.buffer.toString("utf8").slice(0, 6000);
    }

    let suggestie: SlimUploadSuggestie;
    if (heeftOpenAi()) {
      suggestie = await aiClassificeer(bestandsnaam, mime, tekstFragment);
    } else {
      suggestie = heuristischClassificeer(bestandsnaam, mime);
    }

    req.log.info(
      { bestandsnaam, mime, categorie: suggestie.categorie, vertrouwen: suggestie.vertrouwen },
      "slim-upload: analyse gereed",
    );

    res.json(suggestie);
  },
);

export default router;

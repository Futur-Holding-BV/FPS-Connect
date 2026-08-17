import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { db, gebruikersTable, slimUploadLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { classificeerDocument, DOC_CATEGORIEEN, type DocCategorie, type BewijsStap } from "../lib/documentIntelligence";
import { zoekMedewerkerOpNaam } from "../services/contractExtractie";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ── Categorieën ───────────────────────────────────────────────────────────────
// Slim Upload gebruikt dezelfde canonieke taxonomie als de Inbox — beide draaien
// op de gedeelde Document Intelligence-engine (../lib/documentIntelligence).

export const SLIM_UPLOAD_CATEGORIEEN = DOC_CATEGORIEEN;

export type SlimUploadCategorie = DocCategorie;

export interface SlimUploadSuggestie {
  categorie: SlimUploadCategorie;
  subtype: string | null;
  voorstel_naam: string;
  redenering: string;
  vertrouwen: "laag" | "midden" | "hoog";
  ai_beschikbaar: boolean;
  vision_gebruikt: boolean;
  tekst_gevonden: boolean;
  ai_model: string | null;
  gevonden_gegevens: Record<string, string>;
  alternatieven: SlimUploadCategorie[];
  organisatie: string | null;
  jaar: number | null;
  opslaglocatie: string;
  bewijs: BewijsStap[];
  // Impact & bevestiging (AI + backend gegenereerd)
  impact_niveau: "geen" | "laag" | "midden" | "hoog";
  impact_omschrijving: string;
  vereist_bevestiging: boolean;
  directe_actie_beschrijving: string;
  // Reden waarom het document niet gelezen kon worden (null = leesbaar)
  lees_probleem: string | null;
  // Toegangscontrole (toegevoegd door route handler op basis van sessie)
  mag_uploaden: boolean;
  beperkingen: string[];
  // Voorstellen voor personeelsdocumenten (AI stelt voor, mens bevestigt):
  // deterministische naam-match op de gelezen werknemersnaam; bij twijfel null.
  medewerker_voorstel: { id: number; naam: string } | null;
  document_type_voorstel: string | null;
}

// ── Bestand classificeren (gedeelde Document Intelligence-engine) ────────────
// heuristischClassificeer/aiClassificeer/SYSTEEM_PROMPT zijn vervangen door de
// gedeelde staged pipeline in ../lib/documentIntelligence (classificeerDocument),
// dezelfde die de Inbox-upload gebruikt.

async function classificeerBestand(
  bestand: Express.Multer.File,
  toelichting?: string | null,
): Promise<SlimUploadSuggestie> {
  const bestandsnaam = bestand.originalname ?? "onbekend";
  const mime = bestand.mimetype ?? "application/octet-stream";

  const analyse = await classificeerDocument({
    buffer: bestand.buffer ?? null,
    bestandsnaam,
    mime,
    toelichting,
  });

  return {
    categorie: analyse.categorie,
    subtype: analyse.subtype,
    voorstel_naam: analyse.voorstel_naam,
    redenering: analyse.redenering,
    vertrouwen: analyse.vertrouwen,
    ai_beschikbaar: analyse.ai_beschikbaar,
    vision_gebruikt: analyse.vision_gebruikt,
    tekst_gevonden: analyse.tekst_gevonden,
    ai_model: analyse.ai_model,
    gevonden_gegevens: analyse.gevonden_gegevens,
    alternatieven: analyse.alternatieven,
    organisatie: analyse.organisatie,
    jaar: analyse.jaar,
    opslaglocatie: analyse.opslaglocatie,
    bewijs: analyse.bewijs,
    impact_niveau: analyse.impact_niveau,
    impact_omschrijving: analyse.impact_omschrijving,
    vereist_bevestiging: analyse.vereist_bevestiging,
    directe_actie_beschrijving: analyse.directe_actie_beschrijving,
    lees_probleem: analyse.lees_probleem,
    mag_uploaden: true,
    beperkingen: [],
    medewerker_voorstel: null,
    document_type_voorstel: null,
  };
}

// ── Personeelsvoorstellen (medewerker + documenttype) ────────────────────────
// Op basis van de gelezen werknemersnaam wordt deterministisch één medewerker
// voorgesteld (bij 0 of >1 kandidaten: geen voorstel). Het documenttype volgt
// uit het herkende subtype. De gebruiker bevestigt altijd zelf.

const SUBTYPE_NAAR_DOC_TYPE: Record<string, string> = {
  cv: "cv",
  arbeidscontract: "arbeidscontract",
  arbeidsovereenkomst: "arbeidscontract",
};

async function verrijkMetPersoneelVoorstellen(
  s: SlimUploadSuggestie,
  magPersoneelLezen: boolean,
): Promise<SlimUploadSuggestie> {
  if (s.categorie !== "personeelsdocument") return s;
  // Autorisatie: medewerker-identiteit (id+naam) alleen teruggeven aan gebruikers
  // met leesrecht op Personeel — anders lekt een upload de personeelslijst.
  if (!magPersoneelLezen) return s;
  const documentTypeVoorstel = s.subtype ? (SUBTYPE_NAAR_DOC_TYPE[s.subtype] ?? null) : null;
  const gevondenNaam =
    s.gevonden_gegevens?.naam_medewerker ??
    s.gevonden_gegevens?.naam ??
    null;
  let medewerkerVoorstel: { id: number; naam: string } | null = null;
  try {
    medewerkerVoorstel = await zoekMedewerkerOpNaam(gevondenNaam);
  } catch (err) {
    logger.warn(err, "slim-upload: medewerker-match mislukt (voorstel overgeslagen)");
  }
  return { ...s, medewerker_voorstel: medewerkerVoorstel, document_type_voorstel: documentTypeVoorstel };
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

      const verrijkteResultaten = await Promise.all(
        resultaten
          .map((s) => verrijkMetBevoegdheden(s, bevoegdheden, isHoofdBeheerder))
          .map((s) => verrijkMetPersoneelVoorstellen(s, isHoofdBeheerder || (bevoegdheden.personeel ?? 0) >= 1)),
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

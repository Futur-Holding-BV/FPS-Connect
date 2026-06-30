// Organisatie-routes — bedrijfsgegevens, verzekeringen, bedrijfsdocumenten en jaarverslagen.
// AI-endpoints: ai-invullen (bedrijfsgegevens prefill), verzekeringen/ai-suggesties, ai-bedrijfsscan
// en bedrijfsdocumenten/analyseer (AI-extractie + dubbelingsdetectie op sha256-hash).
import { Router } from "express";
import { createHash } from "crypto";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import { createRequire } from "module";
import multer from "multer";
import { db, orgVerzekeringenTable, orgJaarverslagenTable, orgBedrijfsdocumentenTable, aiCategorieCorrectiesTable, aiVeldCorrectiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { maakOpenAiClient, heeftOpenAi } from "../lib/openai";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const _require = createRequire(import.meta.url);
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = _require("pdf-parse");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();

const lezen = requireBevoegdheid("organisatie", 1);
const schrijven = requireBevoegdheid("organisatie", 2);

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

function iso(d: Date) {
  return d.toISOString();
}

// ── Mappers ─────────────────────────────────────────────────────────────────

const mapVerzekering = (r: typeof orgVerzekeringenTable.$inferSelect) => ({
  id: r.id,
  type: r.type,
  omschrijving: r.omschrijving,
  maatschappij: r.maatschappij,
  polisnummer: r.polisnummer,
  premie: r.premie != null ? Number(r.premie) : null,
  premie_frequentie: r.premieFrequentie,
  ingangsdatum: r.ingangsdatum,
  vervaldatum: r.vervaldatum,
  eigen_risico: r.eigenRisico != null ? Number(r.eigenRisico) : null,
  status: r.status,
  opmerkingen: r.opmerkingen,
  aangemaakt_op: iso(r.aangemaaktOp),
  bijgewerkt_op: iso(r.bijgewerktOp),
});

const mapJaarverslag = (r: typeof orgJaarverslagenTable.$inferSelect) => ({
  id: r.id,
  boekjaar: r.boekjaar,
  type: r.type,
  omschrijving: r.omschrijving,
  accountant: r.accountant,
  definitief: r.definitief,
  vastgesteld_op: r.vastgesteldOp,
  document_id: r.documentId,
  aangemaakt_op: iso(r.aangemaaktOp),
  bijgewerkt_op: iso(r.bijgewerktOp),
});

const mapBedrijfsdocument = (r: typeof orgBedrijfsdocumentenTable.$inferSelect) => ({
  id: r.id,
  naam: r.naam,
  categorie: r.categorie,
  omschrijving: r.omschrijving,
  uitgever: r.uitgever,
  referentie: r.referentie,
  ingangsdatum: r.ingangsdatum,
  vervaldatum: r.vervaldatum,
  status: r.status,
  document_id: r.documentId,
  opmerkingen: r.opmerkingen,
  bestand_hash: r.bestandHash,
  bestand_pad: r.bestandPad,
  aangemaakt_op: iso(r.aangemaaktOp),
  bijgewerkt_op: iso(r.bijgewerktOp),
});

// ── Verzekeringen ────────────────────────────────────────────────────────────

router.get("/organisatie/verzekeringen", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select()
      .from(orgVerzekeringenTable)
      .orderBy(orgVerzekeringenTable.type);
    res.json(rijen.map(mapVerzekering));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/organisatie/verzekeringen", schrijven, async (req, res) => {
  try {
    const {
      type, omschrijving, maatschappij, polisnummer, premie, premie_frequentie,
      ingangsdatum, vervaldatum, eigen_risico, status, opmerkingen,
    } = req.body;
    if (!type || typeof type !== "string" || !type.trim()) {
      return res.status(400).json({ error: "type is verplicht" });
    }
    const [rij] = await db
      .insert(orgVerzekeringenTable)
      .values({
        type: type.trim(),
        omschrijving: omschrijving ?? null,
        maatschappij: maatschappij ?? null,
        polisnummer: polisnummer ?? null,
        premie: premie != null ? String(premie) : null,
        premieFrequentie: premie_frequentie ?? "jaarlijks",
        ingangsdatum: ingangsdatum ?? null,
        vervaldatum: vervaldatum ?? null,
        eigenRisico: eigen_risico != null ? String(eigen_risico) : null,
        status: status ?? "actief",
        opmerkingen: opmerkingen ?? null,
      })
      .returning();
    res.status(201).json(mapVerzekering(rij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/organisatie/verzekeringen/:id", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const {
      type, omschrijving, maatschappij, polisnummer, premie, premie_frequentie,
      ingangsdatum, vervaldatum, eigen_risico, status, opmerkingen,
    } = req.body;
    const [rij] = await db
      .update(orgVerzekeringenTable)
      .set({
        ...(type !== undefined ? { type: String(type).trim() } : {}),
        ...(omschrijving !== undefined ? { omschrijving } : {}),
        ...(maatschappij !== undefined ? { maatschappij } : {}),
        ...(polisnummer !== undefined ? { polisnummer } : {}),
        ...(premie !== undefined ? { premie: premie != null ? String(premie) : null } : {}),
        ...(premie_frequentie !== undefined ? { premieFrequentie: premie_frequentie } : {}),
        ...(ingangsdatum !== undefined ? { ingangsdatum } : {}),
        ...(vervaldatum !== undefined ? { vervaldatum } : {}),
        ...(eigen_risico !== undefined ? { eigenRisico: eigen_risico != null ? String(eigen_risico) : null } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(opmerkingen !== undefined ? { opmerkingen } : {}),
        bijgewerktOp: new Date(),
      })
      .where(eq(orgVerzekeringenTable.id, id))
      .returning();
    if (!rij) return res.status(404).json({ error: "Polis niet gevonden" });
    res.json(mapVerzekering(rij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/organisatie/verzekeringen/:id", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    await db.delete(orgVerzekeringenTable).where(eq(orgVerzekeringenTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Jaarverslagen ────────────────────────────────────────────────────────────

router.get("/organisatie/jaarverslagen", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select()
      .from(orgJaarverslagenTable)
      .orderBy(desc(orgJaarverslagenTable.boekjaar));
    res.json(rijen.map(mapJaarverslag));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/organisatie/jaarverslagen", schrijven, async (req, res) => {
  try {
    const { boekjaar, type, omschrijving, accountant, definitief, vastgesteld_op, document_id } = req.body;
    if (!boekjaar || !type) {
      return res.status(400).json({ error: "boekjaar en type zijn verplicht" });
    }
    const [rij] = await db
      .insert(orgJaarverslagenTable)
      .values({
        boekjaar: parseInt(String(boekjaar), 10),
        type: String(type),
        omschrijving: omschrijving ?? null,
        accountant: accountant ?? null,
        definitief: definitief ?? false,
        vastgesteldOp: vastgesteld_op ?? null,
        documentId: document_id ?? null,
      })
      .returning();
    res.status(201).json(mapJaarverslag(rij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/organisatie/jaarverslagen/:id", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { boekjaar, type, omschrijving, accountant, definitief, vastgesteld_op, document_id } = req.body;
    const [rij] = await db
      .update(orgJaarverslagenTable)
      .set({
        ...(boekjaar !== undefined ? { boekjaar: parseInt(String(boekjaar), 10) } : {}),
        ...(type !== undefined ? { type: String(type) } : {}),
        ...(omschrijving !== undefined ? { omschrijving } : {}),
        ...(accountant !== undefined ? { accountant } : {}),
        ...(definitief !== undefined ? { definitief: Boolean(definitief) } : {}),
        ...(vastgesteld_op !== undefined ? { vastgesteldOp: vastgesteld_op } : {}),
        ...(document_id !== undefined ? { documentId: document_id } : {}),
        bijgewerktOp: new Date(),
      })
      .where(eq(orgJaarverslagenTable.id, id))
      .returning();
    if (!rij) return res.status(404).json({ error: "Jaarverslag niet gevonden" });
    res.json(mapJaarverslag(rij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/organisatie/jaarverslagen/:id", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    await db.delete(orgJaarverslagenTable).where(eq(orgJaarverslagenTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Bedrijfsdocumenten ───────────────────────────────────────────────────────

router.get("/organisatie/bedrijfsdocumenten", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select()
      .from(orgBedrijfsdocumentenTable)
      .orderBy(orgBedrijfsdocumentenTable.categorie, orgBedrijfsdocumentenTable.naam);
    res.json(rijen.map(mapBedrijfsdocument));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/organisatie/bedrijfsdocumenten", schrijven, async (req, res) => {
  try {
    const { naam, categorie, omschrijving, uitgever, referentie, ingangsdatum, vervaldatum, status, document_id, opmerkingen, bestand_hash, bestand_pad } = req.body;
    if (!naam || !categorie) {
      return res.status(400).json({ error: "naam en categorie zijn verplicht" });
    }
    const [rij] = await db
      .insert(orgBedrijfsdocumentenTable)
      .values({
        naam: String(naam).trim(),
        categorie: String(categorie),
        omschrijving: omschrijving ?? null,
        uitgever: uitgever ?? null,
        referentie: referentie ?? null,
        ingangsdatum: ingangsdatum ?? null,
        vervaldatum: vervaldatum ?? null,
        status: status ?? "actief",
        documentId: document_id ?? null,
        opmerkingen: opmerkingen ?? null,
        bestandHash: bestand_hash ?? null,
        bestandPad: isGeldigBestandPad(bestand_pad) ? bestand_pad : null,
      })
      .returning();
    res.status(201).json(mapBedrijfsdocument(rij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/organisatie/bedrijfsdocumenten/:id", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { naam, categorie, omschrijving, uitgever, referentie, ingangsdatum, vervaldatum, status, document_id, opmerkingen, bestand_hash, bestand_pad } = req.body;
    const [rij] = await db
      .update(orgBedrijfsdocumentenTable)
      .set({
        ...(naam !== undefined ? { naam: String(naam).trim() } : {}),
        ...(categorie !== undefined ? { categorie } : {}),
        ...(omschrijving !== undefined ? { omschrijving } : {}),
        ...(uitgever !== undefined ? { uitgever } : {}),
        ...(referentie !== undefined ? { referentie } : {}),
        ...(ingangsdatum !== undefined ? { ingangsdatum } : {}),
        ...(vervaldatum !== undefined ? { vervaldatum } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(document_id !== undefined ? { documentId: document_id } : {}),
        ...(opmerkingen !== undefined ? { opmerkingen } : {}),
        ...(bestand_hash !== undefined ? { bestandHash: bestand_hash } : {}),
        ...(bestand_pad !== undefined ? { bestandPad: isGeldigBestandPad(bestand_pad) ? bestand_pad : null } : {}),
        bijgewerktOp: new Date(),
      })
      .where(eq(orgBedrijfsdocumentenTable.id, id))
      .returning();
    if (!rij) return res.status(404).json({ error: "Document niet gevonden" });
    res.json(mapBedrijfsdocument(rij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Bedrijfsdocumenten — AI analyseer ────────────────────────────────────────

const GELDIGE_CATEGORIEEN = ["contract", "vergunning", "certificaat", "kwaliteitshandboek", "overig"];

const BESTAND_PAD_PREFIX = "/objects/algemeen/bedrijfsdocumenten/";

function isGeldigBestandPad(pad: unknown): pad is string {
  return typeof pad === "string" && pad.startsWith(BESTAND_PAD_PREFIX);
}

const oss = new ObjectStorageService();

router.post(
  "/organisatie/bedrijfsdocumenten/analyseer",
  schrijven,
  upload.single("bestand"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Bestand ontbreekt" });
    }
    if (!heeftOpenAi()) {
      return res.status(503).json({ error: "AI niet geconfigureerd" });
    }

    try {
      const buffer = req.file.buffer;
      const hash = createHash("sha256").update(buffer).digest("hex");

      const bestaand = await db
        .select({ id: orgBedrijfsdocumentenTable.id, naam: orgBedrijfsdocumentenTable.naam })
        .from(orgBedrijfsdocumentenTable)
        .where(eq(orgBedrijfsdocumentenTable.bestandHash, hash))
        .limit(1);
      const dubbeling = bestaand.length > 0 ? { id: bestaand[0].id, naam: bestaand[0].naam } : null;

      let tekstBlok = "";
      const mime = req.file.mimetype;
      if (mime === "application/pdf" || req.file.originalname.endsWith(".pdf")) {
        try {
          const resultaat = await pdfParse(buffer);
          tekstBlok = (resultaat.text ?? "").slice(0, 8000);
        } catch {
          tekstBlok = "";
        }
      }

      // Laad recente correcties als few-shot voorbeelden (categorie + overige velden)
      const [catCorrecties, veldCorrecties] = await Promise.all([
        db
          .select()
          .from(aiCategorieCorrectiesTable)
          .orderBy(desc(aiCategorieCorrectiesTable.aangemaaktOp))
          .limit(10),
        db
          .select()
          .from(aiVeldCorrectiesTable)
          .orderBy(desc(aiVeldCorrectiesTable.aangemaaktOp))
          .limit(15),
      ]);

      let fewShotSectie = "";
      const voorbeeldenParts: string[] = [];

      if (catCorrecties.length > 0) {
        const catVoorbeelden = catCorrecties.map((c) => {
          const context = c.tekstFragment ? `Documentfragment: "${c.tekstFragment.slice(0, 200)}"` : "(geen tekst)";
          return `${context}\nVeld categorie — AI stelde voor: "${c.aiVoorstel}" — gebruiker corrigeerde naar: "${c.gekozen}"`;
        }).join("\n\n");
        voorbeeldenParts.push(catVoorbeelden);
      }

      if (veldCorrecties.length > 0) {
        const veldVoorbeelden = veldCorrecties.map((c) => {
          const context = c.tekstFragment ? `Documentfragment: "${c.tekstFragment.slice(0, 200)}"` : "(geen tekst)";
          return `${context}\nVeld ${c.veldNaam} — AI stelde voor: "${c.aiVoorstel}" — gebruiker corrigeerde naar: "${c.gekozen}"`;
        }).join("\n\n");
        voorbeeldenParts.push(veldVoorbeelden);
      }

      if (voorbeeldenParts.length > 0) {
        fewShotSectie =
          "\n\nLeer van deze eerdere correcties door gebruikers — pas je extractie hierop aan:\n" +
          voorbeeldenParts.join("\n\n");
      }

      const systeemPrompt =
        "Je bent een assistent die Nederlandse bedrijfsdocumenten analyseert. " +
        "Extraheer uit de documenttekst de volgende velden en geef een JSON-object terug: " +
        "naam (korte herkenbare naam van het document), " +
        `categorie (exact één van: ${GELDIGE_CATEGORIEEN.join(", ")}), ` +
        "omschrijving (een zin), " +
        "uitgever (de organisatie of instantie die het document heeft uitgegeven, of null), " +
        "referentie (referentienummer of kenmerk, of null), " +
        "ingangsdatum (JJJJ-MM-DD of null), " +
        "vervaldatum (JJJJ-MM-DD of null). " +
        "Als een waarde niet in de tekst staat, gebruik dan null. Geef altijd valide JSON terug." +
        fewShotSectie;

      const gebruikerTekst = tekstBlok.trim()
        ? `Documenttekst (eerste 8000 tekens):\n\n${tekstBlok}`
        : `Bestandsnaam: ${req.file.originalname}\nGeen leesbare tekst beschikbaar — probeer de velden te schatten op basis van de bestandsnaam.`;

      const client = maakOpenAiClient();
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 600,
        messages: [
          { role: "system", content: systeemPrompt },
          { role: "user", content: gebruikerTekst },
        ],
        response_format: { type: "json_object" },
      });

      let velden: Record<string, string | null> = {};
      try {
        velden = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
      } catch {
        velden = {};
      }

      const categorie = GELDIGE_CATEGORIEEN.includes(String(velden.categorie))
        ? String(velden.categorie)
        : "overig";

      // Sla het bestand op in object storage
      let bestandPad: string | null = null;
      try {
        const contentType = req.file.mimetype || "application/octet-stream";
        const ext = req.file.originalname.includes(".")
          ? "." + req.file.originalname.split(".").pop()
          : "";
        const subPath = `algemeen/bedrijfsdocumenten/${randomUUID()}${ext}`;
        bestandPad = await oss.uploadBestand(subPath, buffer, contentType);
      } catch (uploadErr) {
        req.log.warn({ err: uploadErr }, "Bestandsopslag mislukt — document wordt zonder bestand opgeslagen");
      }

      res.json({
        naam: typeof velden.naam === "string" && velden.naam ? velden.naam : req.file.originalname,
        categorie,
        omschrijving: velden.omschrijving ?? null,
        uitgever: velden.uitgever ?? null,
        referentie: velden.referentie ?? null,
        ingangsdatum: velden.ingangsdatum ?? null,
        vervaldatum: velden.vervaldatum ?? null,
        hash,
        bestand_pad: bestandPad,
        tekstFragment: tekstBlok.slice(0, 500),
        dubbeling,
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "AI-verzoek mislukt" });
    }
  }
);

// ── Bedrijfsdocumenten — AI categorie-correctie opslaan ──────────────────────

router.post("/organisatie/bedrijfsdocumenten/correctie", schrijven, async (req, res) => {
  try {
    const { ai_voorstel, gekozen, hash, tekst_fragment } = req.body;
    if (!ai_voorstel || !gekozen) {
      return res.status(400).json({ error: "ai_voorstel en gekozen zijn verplicht" });
    }
    if (!GELDIGE_CATEGORIEEN.includes(String(gekozen))) {
      return res.status(400).json({ error: "Ongeldige categorie" });
    }
    await db.insert(aiCategorieCorrectiesTable).values({
      hash: hash ?? null,
      tekstFragment: tekst_fragment ?? null,
      aiVoorstel: String(ai_voorstel),
      gekozen: String(gekozen),
    });
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Bedrijfsdocumenten — AI veld-correctie opslaan ───────────────────────────

const GELDIGE_VELDEN = ["naam", "uitgever", "referentie", "ingangsdatum", "vervaldatum", "omschrijving"] as const;

router.post("/organisatie/bedrijfsdocumenten/veld-correctie", schrijven, async (req, res) => {
  try {
    const { veld_naam, ai_voorstel, gekozen, hash, tekst_fragment } = req.body;
    if (!veld_naam || !ai_voorstel || gekozen === undefined || gekozen === null) {
      return res.status(400).json({ error: "veld_naam, ai_voorstel en gekozen zijn verplicht" });
    }
    if (!(GELDIGE_VELDEN as readonly string[]).includes(String(veld_naam))) {
      return res.status(400).json({ error: "Ongeldig veld" });
    }
    await db.insert(aiVeldCorrectiesTable).values({
      hash: hash ?? null,
      tekstFragment: tekst_fragment ?? null,
      veldNaam: String(veld_naam),
      aiVoorstel: String(ai_voorstel),
      gekozen: String(gekozen),
    });
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/organisatie/bedrijfsdocumenten/:id", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [doc] = await db
      .select({ bestandPad: orgBedrijfsdocumentenTable.bestandPad })
      .from(orgBedrijfsdocumentenTable)
      .where(eq(orgBedrijfsdocumentenTable.id, id))
      .limit(1);
    if (doc?.bestandPad) {
      try {
        await oss.deleteBestand(doc.bestandPad);
      } catch (opslagFout) {
        req.log.warn({ err: opslagFout }, "Bestand verwijderen uit opslag mislukt; DB-rij wordt toch verwijderd");
      }
    }
    await db.delete(orgBedrijfsdocumentenTable).where(eq(orgBedrijfsdocumentenTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Bedrijfsdocumenten — bestand downloaden ───────────────────────────────────

router.get("/organisatie/bedrijfsdocumenten/:id/download", lezen, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [doc] = await db
      .select()
      .from(orgBedrijfsdocumentenTable)
      .where(eq(orgBedrijfsdocumentenTable.id, id))
      .limit(1);
    if (!doc) return res.status(404).json({ error: "Document niet gevonden" });
    if (!doc.bestandPad) return res.status(404).json({ error: "Geen bestand beschikbaar voor dit document" });
    if (!isGeldigBestandPad(doc.bestandPad)) {
      req.log.error({ bestandPad: doc.bestandPad }, "Ongeldig bestand_pad in DB — download geweigerd");
      return res.status(403).json({ error: "Bestandstoegang geweigerd" });
    }

    const objectFile = await oss.getObjectEntityFile(doc.bestandPad);
    const response = await oss.downloadObject(objectFile);

    const veiligeNaam = doc.naam.replace(/[^a-zA-Z0-9\-_.]/g, "_");
    const ext = doc.bestandPad.includes(".") ? "." + doc.bestandPad.split(".").pop() : "";
    res.setHeader("Content-Disposition", `attachment; filename="${veiligeNaam}${ext}"`);
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "content-disposition") res.setHeader(key, value);
    });

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: "Bestand niet gevonden in opslag" });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── AI — Bedrijfsgegevens invullen ────────────────────────────────────────────

router.post("/organisatie/ai-invullen", schrijven, async (req, res) => {
  if (!heeftOpenAi()) {
    return res.status(503).json({ error: "AI niet geconfigureerd" });
  }
  try {
    const { bedrijfsnaam, sector } = req.body;
    const naam = (bedrijfsnaam ?? "FPS Brandpreventie").trim();
    const client = maakOpenAiClient();
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content:
            "Je bent een Nederlandse bedrijfsadviseur gespecialiseerd in bouw en brandpreventie. " +
            "Jij helpt bij het correct invullen van bedrijfsgegevens op basis van de bedrijfsnaam. " +
            "Geef altijd een JSON-object terug met de volgende velden (null als niet bekend): " +
            "kvk (KVK-nummer 8 cijfers), btw (BTW-nummer formaat NL999999999B01), " +
            "adres, postcode, plaats, telefoon, email, website, iban (IBAN-nummer). " +
            "Gebruik alleen feitelijk bekende gegevens. Vul niets in dat je niet weet — zet het dan op null.",
        },
        {
          role: "user",
          content: `Vul de bedrijfsgegevens in voor: ${naam}${sector ? ` (sector: ${sector})` : ""}`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const tekst = completion.choices[0]?.message?.content ?? "{}";
    let data: Record<string, string | null> = {};
    try {
      data = JSON.parse(tekst);
    } catch {
      data = {};
    }
    res.json({ velden: data });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "AI-verzoek mislukt" });
  }
});

// ── AI — Verzekeringen suggesties ──────────────────────────────────────────────

router.post("/organisatie/verzekeringen/ai-suggesties", schrijven, async (req, res) => {
  if (!heeftOpenAi()) {
    return res.status(503).json({ error: "AI niet geconfigureerd" });
  }
  try {
    const { bedrijfsnaam, sector } = req.body;
    const naam = (bedrijfsnaam ?? "FPS Brandpreventie").trim();
    const client = maakOpenAiClient();
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "Je bent een verzekeringsadviseur gespecialiseerd in de bouw en brandpreventiesector in Nederland. " +
            "Geef een JSON-array terug met standaard aanbevolen bedrijfsverzekeringen. " +
            "Elk object in de array heeft deze velden: " +
            "type (korte code, bv 'AVB'), omschrijving (volledige naam), toelichting (waarom nodig), " +
            "typische_premie_min (getal, euro per jaar), typische_premie_max (getal, euro per jaar), " +
            "prioriteit ('verplicht', 'sterk aanbevolen', 'aanbevolen'). " +
            "Geef minstens 8 relevante verzekeringen voor een middelgroot brandpreventiebedrijf.",
        },
        {
          role: "user",
          content: `Geef verzekeringssuggesties voor: ${naam}${sector ? ` (sector: ${sector})` : ", actief in brandpreventie en bouw in Nederland"}`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const tekst = completion.choices[0]?.message?.content ?? "{}";
    let data: { suggesties?: unknown[] } = {};
    try {
      const parsed = JSON.parse(tekst);
      if (Array.isArray(parsed)) {
        data = { suggesties: parsed };
      } else if (Array.isArray(parsed.suggesties)) {
        data = { suggesties: parsed.suggesties };
      } else {
        const eerste = Object.values(parsed).find(Array.isArray);
        data = { suggesties: eerste ?? [] };
      }
    } catch {
      data = { suggesties: [] };
    }
    res.json(data);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "AI-verzoek mislukt" });
  }
});

// ── AI — Bedrijfsscan ──────────────────────────────────────────────────────────

router.post("/organisatie/ai-bedrijfsscan", schrijven, async (req, res) => {
  if (!heeftOpenAi()) {
    return res.status(503).json({ error: "AI niet geconfigureerd" });
  }
  try {
    const polissen = await db.select().from(orgVerzekeringenTable);
    const polisOverzicht = polissen.map((p) => ({
      type: p.type,
      omschrijving: p.omschrijving,
      maatschappij: p.maatschappij,
      premie: p.premie,
      vervaldatum: p.vervaldatum,
      status: p.status,
    }));

    const client = maakOpenAiClient();
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1500,
      messages: [
        {
          role: "system",
          content:
            "Je bent een onafhankelijke verzekeringsadviseur gespecialiseerd in de bouw en brandpreventiesector in Nederland. " +
            "Analyseer het opgegeven verzekeringspakket en geef een JSON-object terug met: " +
            "samenvatting (string, beknopte beoordeling), " +
            "score (getal 1-10, algehele dekking), " +
            "adviezen (array van objecten met: titel, beschrijving, prioriteit ('hoog'/'middel'/'laag'), type ('besparing'/'dekking'/'risico')), " +
            "ontbrekend (array van strings, verzekeringstypes die ontbreken maar wel aanbevolen zijn), " +
            "besparing_indicatie (string, schatting mogelijk besparing per jaar of null). " +
            "Wees concreet en toepasbaar. Focus op risico's specifiek voor brandpreventie- en bouwbedrijven.",
        },
        {
          role: "user",
          content: `Analyseer dit verzekeringspakket van een brandpreventiebedrijf:\n${JSON.stringify(polisOverzicht, null, 2)}`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const tekst = completion.choices[0]?.message?.content ?? "{}";
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(tekst);
    } catch {
      data = { samenvatting: tekst, score: null, adviezen: [], ontbrekend: [], besparing_indicatie: null };
    }
    res.json(data);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "AI-verzoek mislukt" });
  }
});

export default router;

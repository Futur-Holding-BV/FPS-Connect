// Organisatie-routes — bedrijfsgegevens, verzekeringen, bedrijfsdocumenten en jaarverslagen.
// AI-endpoints: ai-invullen (bedrijfsgegevens prefill), verzekeringen/ai-suggesties en ai-bedrijfsscan.
import { Router } from "express";
import { db, orgVerzekeringenTable, orgJaarverslagenTable, orgBedrijfsdocumentenTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { maakOpenAiClient, heeftOpenAi } from "../lib/openai";

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
    const { naam, categorie, omschrijving, uitgever, referentie, ingangsdatum, vervaldatum, status, document_id, opmerkingen } = req.body;
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
    const { naam, categorie, omschrijving, uitgever, referentie, ingangsdatum, vervaldatum, status, document_id, opmerkingen } = req.body;
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

router.delete("/organisatie/bedrijfsdocumenten/:id", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    await db.delete(orgBedrijfsdocumentenTable).where(eq(orgBedrijfsdocumentenTable.id, id));
    res.status(204).end();
  } catch (err) {
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

import { Router } from "express";
import { db } from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  fpsBedrijfsstandaardenTable,
  leverancierPrestatiesdTable,
  opdrachtgeverVoorkeurenTable,
  leveranciersTable,
  crmKlantenTable,
} from "@workspace/db/schema";
import { requireBevoegdheid } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const inkoopLezen   = requireBevoegdheid("offertes", 1);
const inkoopSchrijven = requireBevoegdheid("offertes", 2);
const systeemSchrijven = requireBevoegdheid("systeem", 2);

// ── Bedrijfsstandaarden ────────────────────────────────────────────────────

/** GET /kb/bedrijfsstandaarden */
router.get("/kb/bedrijfsstandaarden", inkoopLezen, async (req, res): Promise<void> => {
  try {
    const { categorie, actief } = req.query as Record<string, string | undefined>;
    const filters = [];
    if (actief !== "alle") filters.push(eq(fpsBedrijfsstandaardenTable.actief, true));
    if (categorie) filters.push(eq(fpsBedrijfsstandaardenTable.categorie, categorie));

    const rijen = await db
      .select()
      .from(fpsBedrijfsstandaardenTable)
      .where(filters.length > 0 ? and(...filters as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]) : undefined)
      .orderBy(asc(fpsBedrijfsstandaardenTable.categorie), asc(fpsBedrijfsstandaardenTable.sleutel));

    res.json(rijen.map((r) => ({
      id: r.id,
      sleutel: r.sleutel,
      categorie: r.categorie,
      titel: r.titel,
      inhoud: r.inhoud,
      actief: r.actief,
      bijgewerkt_op: r.bijgewerktOp?.toISOString() ?? null,
    })));
  } catch (err) {
    logger.error({ err }, "KB bedrijfsstandaarden ophalen mislukt");
    res.status(500).json({ error: "Serverfout" });
  }
});

/** POST /kb/bedrijfsstandaarden */
router.post("/kb/bedrijfsstandaarden", systeemSchrijven, async (req, res): Promise<void> => {
  try {
    const { sleutel, categorie, titel, inhoud } = req.body as Record<string, string>;
    if (!sleutel || !categorie || !titel || !inhoud) {
      res.status(400).json({ error: "sleutel, categorie, titel en inhoud zijn verplicht" });
      return;
    }
    const nu = new Date();
    const [nieuw] = await db
      .insert(fpsBedrijfsstandaardenTable)
      .values({ sleutel, categorie, titel, inhoud, bijgewerktOp: nu })
      .returning();

    res.status(201).json({
      id: nieuw.id,
      sleutel: nieuw.sleutel,
      categorie: nieuw.categorie,
      titel: nieuw.titel,
      inhoud: nieuw.inhoud,
      actief: nieuw.actief,
      bijgewerkt_op: nieuw.bijgewerktOp?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err }, "KB bedrijfsstandaard aanmaken mislukt");
    res.status(500).json({ error: "Serverfout" });
  }
});

/** PATCH /kb/bedrijfsstandaarden/:id */
router.patch("/kb/bedrijfsstandaarden/:id", systeemSchrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  try {
    const { titel, inhoud, categorie, actief } = req.body as Record<string, unknown>;
    const nu = new Date();
    const delta: Partial<typeof fpsBedrijfsstandaardenTable.$inferInsert> = { bijgewerktOp: nu };
    if (typeof titel === "string") delta.titel = titel;
    if (typeof inhoud === "string") delta.inhoud = inhoud;
    if (typeof categorie === "string") delta.categorie = categorie;
    if (typeof actief === "boolean") delta.actief = actief;

    const [bijgewerkt] = await db
      .update(fpsBedrijfsstandaardenTable)
      .set(delta)
      .where(eq(fpsBedrijfsstandaardenTable.id, id))
      .returning();

    if (!bijgewerkt) { res.status(404).json({ error: "Standaard niet gevonden" }); return; }

    res.json({
      id: bijgewerkt.id,
      sleutel: bijgewerkt.sleutel,
      categorie: bijgewerkt.categorie,
      titel: bijgewerkt.titel,
      inhoud: bijgewerkt.inhoud,
      actief: bijgewerkt.actief,
      bijgewerkt_op: bijgewerkt.bijgewerktOp?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err }, "KB bedrijfsstandaard bijwerken mislukt");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── Leverancier prestaties ─────────────────────────────────────────────────

/** GET /leveranciers/:id/prestaties */
router.get("/leveranciers/:id/prestaties", inkoopLezen, async (req, res): Promise<void> => {
  const levId = parseInt(String(req.params.id), 10);
  if (isNaN(levId)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  try {
    const [leverancier] = await db
      .select({ id: leveranciersTable.id, naam: leveranciersTable.naam })
      .from(leveranciersTable)
      .where(eq(leveranciersTable.id, levId));
    if (!leverancier) { res.status(404).json({ error: "Leverancier niet gevonden" }); return; }

    const rijen = await db
      .select()
      .from(leverancierPrestatiesdTable)
      .where(eq(leverancierPrestatiesdTable.leverancierId, levId))
      .orderBy(desc(leverancierPrestatiesdTable.aangemaaktOp));

    res.json(rijen.map((r) => ({
      id: r.id,
      leverancier_id: r.leverancierId,
      project_ref: r.projectRef ?? null,
      periode: r.periode ?? null,
      leverbetrouwbaarheid: r.leverbetrouwbaarheid ?? null,
      levertijd_score: r.levertijdScore ?? null,
      kwaliteit_score: r.kwaliteitScore ?? null,
      garantieclaims: r.garantieclaims ?? 0,
      retourpercentage: r.retourpercentage ?? null,
      beschikbaarheid_score: r.beschikbaarheidScore ?? null,
      communicatie_score: r.communicatieScore ?? null,
      geschikt_spoed: r.geschiktSpoed ?? null,
      notities: r.notities ?? null,
      geregistreerd_door: r.geregistreerdDoor ?? null,
      aangemaakt_op: r.aangemaaktOp.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "Leverancier prestaties ophalen mislukt");
    res.status(500).json({ error: "Serverfout" });
  }
});

/** POST /leveranciers/:id/prestaties */
router.post("/leveranciers/:id/prestaties", inkoopSchrijven, async (req, res): Promise<void> => {
  const levId = parseInt(String(req.params.id), 10);
  if (isNaN(levId)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  const gebruikerId = req.session.userId ?? null;
  try {
    const [leverancier] = await db
      .select({ id: leveranciersTable.id })
      .from(leveranciersTable)
      .where(eq(leveranciersTable.id, levId));
    if (!leverancier) { res.status(404).json({ error: "Leverancier niet gevonden" }); return; }

    const body = req.body as Record<string, unknown>;
    const [nieuw] = await db
      .insert(leverancierPrestatiesdTable)
      .values({
        leverancierId: levId,
        projectRef: typeof body.project_ref === "string" ? body.project_ref : null,
        periode: typeof body.periode === "string" ? body.periode : null,
        leverbetrouwbaarheid: typeof body.leverbetrouwbaarheid === "number" ? body.leverbetrouwbaarheid : null,
        levertijdScore: typeof body.levertijd_score === "number" ? body.levertijd_score : null,
        kwaliteitScore: typeof body.kwaliteit_score === "number" ? body.kwaliteit_score : null,
        garantieclaims: typeof body.garantieclaims === "number" ? body.garantieclaims : 0,
        retourpercentage: typeof body.retourpercentage === "number" ? body.retourpercentage : null,
        beschikbaarheidScore: typeof body.beschikbaarheid_score === "number" ? body.beschikbaarheid_score : null,
        communicatieScore: typeof body.communicatie_score === "number" ? body.communicatie_score : null,
        geschiktSpoed: typeof body.geschikt_spoed === "boolean" ? body.geschikt_spoed : null,
        notities: typeof body.notities === "string" ? body.notities : null,
        geregistreerdDoor: gebruikerId ?? null,
      })
      .returning();

    res.status(201).json({
      id: nieuw.id,
      leverancier_id: nieuw.leverancierId,
      project_ref: nieuw.projectRef ?? null,
      periode: nieuw.periode ?? null,
      leverbetrouwbaarheid: nieuw.leverbetrouwbaarheid ?? null,
      levertijd_score: nieuw.levertijdScore ?? null,
      kwaliteit_score: nieuw.kwaliteitScore ?? null,
      garantieclaims: nieuw.garantieclaims ?? 0,
      retourpercentage: nieuw.retourpercentage ?? null,
      beschikbaarheid_score: nieuw.beschikbaarheidScore ?? null,
      communicatie_score: nieuw.communicatieScore ?? null,
      geschikt_spoed: nieuw.geschiktSpoed ?? null,
      notities: nieuw.notities ?? null,
      geregistreerd_door: nieuw.geregistreerdDoor ?? null,
      aangemaakt_op: nieuw.aangemaaktOp.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Leverancier prestatie registreren mislukt");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── Opdrachtgever-voorkeuren ───────────────────────────────────────────────

/** GET /kb/opdrachtgever-voorkeuren/:klantId */
router.get("/kb/opdrachtgever-voorkeuren/:klantId", inkoopLezen, async (req, res): Promise<void> => {
  const klantId = parseInt(String(req.params.klantId), 10);
  if (isNaN(klantId)) { res.status(400).json({ error: "Ongeldig klant_id" }); return; }
  try {
    const [klant] = await db
      .select({ id: crmKlantenTable.id })
      .from(crmKlantenTable)
      .where(eq(crmKlantenTable.id, klantId));
    if (!klant) { res.status(404).json({ error: "Klant niet gevonden" }); return; }

    const [voorkeur] = await db
      .select()
      .from(opdrachtgeverVoorkeurenTable)
      .where(eq(opdrachtgeverVoorkeurenTable.klantId, klantId));

    if (!voorkeur) {
      res.json({
        klant_id: klantId,
        verplichte_artikel_ids: [],
        verboden_artikel_ids: [],
        rapportage_eisen: null,
        documentvereisten: null,
        uitvoeringsdetails: null,
        keuringsvoorschriften: null,
        onderhoudsafspraken: null,
        kb_notities: null,
        bijgewerkt_op: null,
      });
      return;
    }

    res.json({
      id: voorkeur.id,
      klant_id: voorkeur.klantId,
      verplichte_artikel_ids: voorkeur.verplichtArtikelIds ?? [],
      verboden_artikel_ids: voorkeur.verbodenArtikelIds ?? [],
      rapportage_eisen: voorkeur.rapportageEisen ?? null,
      documentvereisten: voorkeur.documentvereisten ?? null,
      uitvoeringsdetails: voorkeur.uitvoeringsdetails ?? null,
      keuringsvoorschriften: voorkeur.keuringsvoorschriften ?? null,
      onderhoudsafspraken: voorkeur.onderhoudsafspraken ?? null,
      kb_notities: voorkeur.kbNotities ?? null,
      bijgewerkt_op: voorkeur.bijgewerktOp?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Opdrachtgever-voorkeuren ophalen mislukt");
    res.status(500).json({ error: "Serverfout" });
  }
});

/** PUT /kb/opdrachtgever-voorkeuren/:klantId */
router.put("/kb/opdrachtgever-voorkeuren/:klantId", inkoopSchrijven, async (req, res): Promise<void> => {
  const klantId = parseInt(String(req.params.klantId), 10);
  if (isNaN(klantId)) { res.status(400).json({ error: "Ongeldig klant_id" }); return; }
  try {
    const [klant] = await db
      .select({ id: crmKlantenTable.id })
      .from(crmKlantenTable)
      .where(eq(crmKlantenTable.id, klantId));
    if (!klant) { res.status(404).json({ error: "Klant niet gevonden" }); return; }

    const body = req.body as Record<string, unknown>;
    const nu = new Date();
    const waarden = {
      klantId,
      verplichtArtikelIds: Array.isArray(body.verplichte_artikel_ids) ? (body.verplichte_artikel_ids as number[]) : [],
      verbodenArtikelIds: Array.isArray(body.verboden_artikel_ids) ? (body.verboden_artikel_ids as number[]) : [],
      rapportageEisen: typeof body.rapportage_eisen === "string" ? body.rapportage_eisen : null,
      documentvereisten: typeof body.documentvereisten === "string" ? body.documentvereisten : null,
      uitvoeringsdetails: typeof body.uitvoeringsdetails === "string" ? body.uitvoeringsdetails : null,
      keuringsvoorschriften: typeof body.keuringsvoorschriften === "string" ? body.keuringsvoorschriften : null,
      onderhoudsafspraken: typeof body.onderhoudsafspraken === "string" ? body.onderhoudsafspraken : null,
      kbNotities: typeof body.kb_notities === "string" ? body.kb_notities : null,
      bijgewerktOp: nu,
    };

    const [upserted] = await db
      .insert(opdrachtgeverVoorkeurenTable)
      .values(waarden)
      .onConflictDoUpdate({ target: opdrachtgeverVoorkeurenTable.klantId, set: waarden })
      .returning();

    res.json({
      id: upserted.id,
      klant_id: upserted.klantId,
      verplichte_artikel_ids: upserted.verplichtArtikelIds ?? [],
      verboden_artikel_ids: upserted.verbodenArtikelIds ?? [],
      rapportage_eisen: upserted.rapportageEisen ?? null,
      documentvereisten: upserted.documentvereisten ?? null,
      uitvoeringsdetails: upserted.uitvoeringsdetails ?? null,
      keuringsvoorschriften: upserted.keuringsvoorschriften ?? null,
      onderhoudsafspraken: upserted.onderhoudsafspraken ?? null,
      kb_notities: upserted.kbNotities ?? null,
      bijgewerkt_op: upserted.bijgewerktOp?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Opdrachtgever-voorkeuren upsert mislukt");
    res.status(500).json({ error: "Serverfout" });
  }
});

export default router;

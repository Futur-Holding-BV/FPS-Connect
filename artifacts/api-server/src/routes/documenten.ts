import { Router } from "express";
import {
  db,
  documentenTable,
  documentToepassingenTable,
  documentApplicatiesTable,
  labelsTable,
  voorzieningTypesTable,
} from "@workspace/db";
import { eq, and, ne, asc, inArray, max } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import {
  mapDocument,
  syncDocumentToepassingen,
  syncDocumentApplicaties,
  isDocumentType,
  isDocumentStatus,
} from "../lib/documenten";
import { analyseerDocumentTekst } from "../services/document-ai";

const router = Router();

// POST /documenten/ai-analyse — AI-voorstel voor documentmetadata o.b.v. tekst (beheerder)
router.post("/documenten/ai-analyse", requireBevoegdheid("bibliotheek", 3), async (req, res) => {
  try {
    const tekst = typeof req.body?.tekst === "string" ? req.body.tekst : "";
    const bestandsnaam =
      typeof req.body?.bestandsnaam === "string" ? req.body.bestandsnaam : null;
    const resultaat = await analyseerDocumentTekst(tekst, bestandsnaam);
    return res.json(resultaat);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "AI-analyse mislukte" });
  }
});

// ── CENTRALE DOCUMENTBIBLIOTHEEK ────────────────────────────────────────────
// GET /documenten — lijst met filters
router.get("/documenten", async (req, res) => {
  try {
    const {
      documenttype,
      status,
      fabrikant,
      voorziening_type_code,
      label_id,
      alleen_actueel,
      inclusief_gearchiveerd,
    } = req.query;

    let rows = await db.select().from(documentenTable).orderBy(asc(documentenTable.naam));

    if (documenttype) rows = rows.filter((d) => d.documenttype === documenttype);
    if (status) rows = rows.filter((d) => d.status === status);
    if (fabrikant) {
      const q = String(fabrikant).toLowerCase();
      rows = rows.filter((d) => (d.fabrikant ?? "").toLowerCase().includes(q));
    }
    if (alleen_actueel === "true") rows = rows.filter((d) => d.status === "actueel");
    if (inclusief_gearchiveerd !== "true") rows = rows.filter((d) => !d.gearchiveerd);

    if (voorziening_type_code) {
      const koppel = await db
        .select({ documentId: documentApplicatiesTable.documentId })
        .from(documentApplicatiesTable)
        .where(eq(documentApplicatiesTable.voorzieningTypeCode, String(voorziening_type_code)));
      const ids = new Set(koppel.map((k) => k.documentId));
      rows = rows.filter((d) => ids.has(d.id));
    }
    if (label_id) {
      const lid = parseInt(String(label_id));
      const koppel = await db
        .select({ documentId: documentToepassingenTable.documentId })
        .from(documentToepassingenTable)
        .where(eq(documentToepassingenTable.labelId, lid));
      const ids = new Set(koppel.map((k) => k.documentId));
      rows = rows.filter((d) => ids.has(d.id));
    }

    res.json(await Promise.all(rows.map(mapDocument)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /documenten/:id — detail
router.get("/documenten/:id", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [d] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
    if (!d) return res.status(404).json({ error: "Document niet gevonden" });
    return res.json(await mapDocument(d));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /documenten/:id/revisies — revisiehistorie van de documentgroep
router.get("/documenten/:id/revisies", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [d] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
    if (!d) return res.status(404).json({ error: "Document niet gevonden" });
    const rows = await db
      .select()
      .from(documentenTable)
      .where(eq(documentenTable.groepId, d.groepId))
      .orderBy(asc(documentenTable.revisieNummer));
    return res.json(await Promise.all(rows.map(mapDocument)));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /documenten — nieuw document (beheerder)
router.post("/documenten", requireBevoegdheid("bibliotheek", 3), async (req, res) => {
  try {
    const b = req.body ?? {};
    if (!b.naam || !String(b.naam).trim()) {
      return res.status(400).json({ error: "naam is verplicht" });
    }
    if (b.documenttype !== undefined && !isDocumentType(b.documenttype)) {
      return res.status(400).json({ error: "Ongeldig documenttype" });
    }
    const [d] = await db
      .insert(documentenTable)
      .values({
        naam: String(b.naam).trim(),
        documenttype: b.documenttype ?? "testrapport",
        fabrikant: b.fabrikant ?? null,
        product: b.product ?? null,
        enNorm: b.en_norm ?? null,
        rapportnummer: b.rapportnummer ?? null,
        revisie: b.revisie ?? null,
        datum: b.datum ?? null,
        pdfUrl: b.pdf_url ?? null,
        aiGeanalyseerd: b.ai_geanalyseerd === true,
        aiMetadata: b.ai_metadata ?? null,
      })
      .returning();

    if (Array.isArray(b.toepassing_ids)) await syncDocumentToepassingen(d.id, b.toepassing_ids);
    if (Array.isArray(b.applicatie_codes)) await syncDocumentApplicaties(d.id, b.applicatie_codes);

    return res.status(201).json(await mapDocument(d));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /documenten/:id — alleen status/gearchiveerd (inhoud is onveranderlijk) (beheerder)
router.patch("/documenten/:id", requireBevoegdheid("bibliotheek", 2), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { status, gearchiveerd } = req.body ?? {};
    if (status !== undefined && !isDocumentStatus(status)) {
      return res.status(400).json({ error: "Ongeldige status" });
    }
    const [bestaand] = await db
      .select()
      .from(documentenTable)
      .where(eq(documentenTable.id, id));
    if (!bestaand) return res.status(404).json({ error: "Document niet gevonden" });

    // Onveranderlijkheid: slechts één 'actueel' revisie per groep. Een oudere
    // (vervangen) revisie mag niet opnieuw als actueel worden ingesteld.
    if (status === "actueel") {
      const [{ maxNum }] = await db
        .select({ maxNum: max(documentenTable.revisieNummer) })
        .from(documentenTable)
        .where(eq(documentenTable.groepId, bestaand.groepId));
      if ((maxNum ?? bestaand.revisieNummer) !== bestaand.revisieNummer) {
        return res.status(400).json({
          error: "Alleen de nieuwste revisie kan op 'actueel' worden gezet.",
        });
      }
    }

    const set: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (status !== undefined) set.status = status;
    if (gearchiveerd !== undefined) set.gearchiveerd = gearchiveerd === true;

    const [d] = await db
      .update(documentenTable)
      .set(set)
      .where(eq(documentenTable.id, id))
      .returning();
    if (!d) return res.status(404).json({ error: "Document niet gevonden" });
    return res.json(await mapDocument(d));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /documenten/:id/revisies — nieuwe revisie (copy-on-revision) (beheerder)
router.post("/documenten/:id/revisies", requireBevoegdheid("bibliotheek", 3), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const b = req.body ?? {};
    const [bron] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
    if (!bron) return res.status(404).json({ error: "Document niet gevonden" });
    if (b.documenttype !== undefined && !isDocumentType(b.documenttype)) {
      return res.status(400).json({ error: "Ongeldig documenttype" });
    }

    const nieuw = await db.transaction(async (tx) => {
      const [{ maxNum }] = await tx
        .select({ maxNum: max(documentenTable.revisieNummer) })
        .from(documentenTable)
        .where(eq(documentenTable.groepId, bron.groepId));
      const volgend = (maxNum ?? bron.revisieNummer) + 1;

      const [row] = await tx
        .insert(documentenTable)
        .values({
          // Een revisie is een nieuwe versie van hetzelfde document: ontbrekende
          // velden worden overgenomen van de bron, zodat o.a. de PDF en metadata
          // niet stil verloren gaan bij een metadata-only revisie.
          naam: b.naam ? String(b.naam).trim() : bron.naam,
          documenttype: b.documenttype ?? bron.documenttype,
          fabrikant: b.fabrikant ?? bron.fabrikant,
          product: b.product ?? bron.product,
          enNorm: b.en_norm ?? bron.enNorm,
          rapportnummer: b.rapportnummer ?? bron.rapportnummer,
          revisie: b.revisie ?? bron.revisie,
          datum: b.datum ?? bron.datum,
          pdfUrl: b.pdf_url ?? bron.pdfUrl,
          aiGeanalyseerd:
            b.ai_geanalyseerd === undefined
              ? bron.aiGeanalyseerd
              : b.ai_geanalyseerd === true,
          aiMetadata: b.ai_metadata ?? bron.aiMetadata,
          status: "actueel",
          groepId: bron.groepId,
          revisieNummer: volgend,
        })
        .returning();

      // Vorige actuele revisie(s) worden 'vervangen'; oude revisies blijven bewaard.
      await tx
        .update(documentenTable)
        .set({ status: "vervangen", bijgewerktOp: new Date() })
        .where(
          and(
            eq(documentenTable.groepId, bron.groepId),
            eq(documentenTable.status, "actueel"),
            ne(documentenTable.id, row.id),
          ),
        );

      // Koppelingen overnemen: body-override indien meegegeven, anders kopiëren van de bron.
      const labelIds: number[] = Array.isArray(b.toepassing_ids)
        ? b.toepassing_ids.filter((n: unknown) => Number.isInteger(n))
        : (
            await tx
              .select({ labelId: documentToepassingenTable.labelId })
              .from(documentToepassingenTable)
              .where(eq(documentToepassingenTable.documentId, bron.id))
          ).map((r) => r.labelId);
      const codes: string[] = Array.isArray(b.applicatie_codes)
        ? b.applicatie_codes.filter((c: unknown) => typeof c === "string")
        : (
            await tx
              .select({ code: documentApplicatiesTable.voorzieningTypeCode })
              .from(documentApplicatiesTable)
              .where(eq(documentApplicatiesTable.documentId, bron.id))
          ).map((r) => r.code);

      if (labelIds.length) {
        const geldig = (
          await tx.select({ id: labelsTable.id }).from(labelsTable).where(inArray(labelsTable.id, labelIds))
        ).map((x) => x.id);
        if (geldig.length) {
          await tx
            .insert(documentToepassingenTable)
            .values(geldig.map((labelId) => ({ documentId: row.id, labelId })))
            .onConflictDoNothing();
        }
      }
      if (codes.length) {
        const geldig = (
          await tx
            .select({ code: voorzieningTypesTable.code })
            .from(voorzieningTypesTable)
            .where(inArray(voorzieningTypesTable.code, codes))
        ).map((x) => x.code);
        if (geldig.length) {
          await tx
            .insert(documentApplicatiesTable)
            .values(geldig.map((voorzieningTypeCode) => ({ documentId: row.id, voorzieningTypeCode })))
            .onConflictDoNothing();
        }
      }

      return row;
    });

    return res.status(201).json(await mapDocument(nieuw));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// PUT /documenten/:id/toepassingen — gekoppelde toepassingen instellen (beheerder)
router.put("/documenten/:id/toepassingen", requireBevoegdheid("bibliotheek", 2), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [d] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
    if (!d) return res.status(404).json({ error: "Document niet gevonden" });
    const ids = Array.isArray(req.body?.label_ids) ? req.body.label_ids : [];
    await syncDocumentToepassingen(id, ids);
    return res.json(await mapDocument(d));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// PUT /documenten/:id/applicaties — gekoppelde applicaties instellen (beheerder)
router.put("/documenten/:id/applicaties", requireBevoegdheid("bibliotheek", 2), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [d] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
    if (!d) return res.status(404).json({ error: "Document niet gevonden" });
    const codes = Array.isArray(req.body?.voorziening_type_codes)
      ? req.body.voorziening_type_codes
      : [];
    await syncDocumentApplicaties(id, codes);
    return res.json(await mapDocument(d));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

import { Router } from "express";
import { db, voorzieningTypesTable, labelsTable, testrapportenTable, labelApplicatiesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import {
  mapLabel,
  mapTestrapport,
  syncLabelApplicaties,
  syncLabelDocumenten,
  syncApplicatieLabels,
  onbekendeApplicatieCodes,
} from "../lib/classificatie";

const router = Router();

// ── APPLICATIES (voorziening-types) ─────────────────────────────────────────
// GET /voorziening-types
router.get("/voorziening-types", async (req, res) => {
  try {
    const inclusiefInactief = req.query.inclusief_inactief === "true";
    let rows = await db
      .select()
      .from(voorzieningTypesTable)
      .orderBy(asc(voorzieningTypesTable.volgorde));
    if (!inclusiefInactief) rows = rows.filter((t) => t.actief);
    res.json(
      rows.map((t) => ({
        code: t.code,
        naam: t.naam,
        categorie: t.categorie,
        volgorde: t.volgorde,
        actief: t.actief,
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PUT /voorziening-types/:code/labels — gekoppelde toepassingen van een applicatie instellen (beheerder)
router.put(
  "/voorziening-types/:code/labels",
  requireBevoegdheid("bibliotheek", 2),
  async (req, res) => {
    try {
      const code = String(req.params.code);
      const [type] = await db
        .select()
        .from(voorzieningTypesTable)
        .where(eq(voorzieningTypesTable.code, code));
      if (!type) return res.status(404).json({ error: "Applicatie niet gevonden" });
      const ids = Array.isArray(req.body?.label_ids) ? req.body.label_ids : [];
      await syncApplicatieLabels(code, ids);
      return res.json({
        code: type.code,
        naam: type.naam,
        categorie: type.categorie,
        volgorde: type.volgorde,
        actief: type.actief,
      });
    } catch (err) {
      req.log.error(err);
      return res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// ── TOEPASSINGEN (labels) ───────────────────────────────────────────────────
// GET /labels
router.get("/labels", async (req, res) => {
  try {
    const { type_code, inclusief_gearchiveerd } = req.query;
    let rows = await db.select().from(labelsTable).orderBy(asc(labelsTable.naam));
    if (type_code) {
      const koppelingen = await db
        .select({ labelId: labelApplicatiesTable.labelId })
        .from(labelApplicatiesTable)
        .where(eq(labelApplicatiesTable.typeCode, String(type_code)));
      const labelIds = new Set(koppelingen.map((k) => k.labelId));
      rows = rows.filter((l) => labelIds.has(l.id));
    }
    if (inclusief_gearchiveerd !== "true") rows = rows.filter((l) => !l.gearchiveerd);
    res.json(await Promise.all(rows.map(mapLabel)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /labels (beheerder)
router.post("/labels", requireBevoegdheid("bibliotheek", 3), async (req, res) => {
  try {
    const { applicatie_codes, naam, fabrikant, testnorm, testrapport_id } = req.body;
    if (!naam || !String(naam).trim()) {
      return res.status(400).json({ error: "naam is verplicht" });
    }
    // applicatie_codes is optioneel: een toepassing mag zonder applicatie-koppeling
    // worden aangemaakt (bv. bulk-import zonder ingevulde codes) en later gekoppeld.
    const codes: string[] = Array.isArray(applicatie_codes) ? applicatie_codes : [];
    if (codes.length > 0) {
      const onbekend = await onbekendeApplicatieCodes(codes);
      if (onbekend.length > 0) {
        return res
          .status(400)
          .json({ error: `Onbekende applicatie-code(s): ${onbekend.join(", ")}` });
      }
    }
    const [l] = await db
      .insert(labelsTable)
      .values({
        naam: String(naam).trim(),
        fabrikant: fabrikant != null && String(fabrikant).trim() ? String(fabrikant).trim() : null,
        testnorm: testnorm != null && String(testnorm).trim() ? String(testnorm).trim() : null,
        testrapportId: testrapport_id ?? null,
      })
      .returning();
    await syncLabelApplicaties(l.id, codes);
    return res.status(201).json(await mapLabel(l));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /labels/:id (beheerder)
router.patch("/labels/:id", requireBevoegdheid("bibliotheek", 2), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { naam, fabrikant, testnorm, testrapport_id, gearchiveerd, applicatie_codes } = req.body;
    const set: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (naam !== undefined) set.naam = String(naam).trim();
    if (fabrikant !== undefined)
      set.fabrikant = fabrikant != null && String(fabrikant).trim() ? String(fabrikant).trim() : null;
    if (testnorm !== undefined)
      set.testnorm = testnorm != null && String(testnorm).trim() ? String(testnorm).trim() : null;
    if (testrapport_id !== undefined) set.testrapportId = testrapport_id;
    if (gearchiveerd !== undefined) set.gearchiveerd = gearchiveerd === true;

    if (Array.isArray(applicatie_codes)) {
      const onbekend = await onbekendeApplicatieCodes(applicatie_codes);
      if (onbekend.length > 0) {
        return res
          .status(400)
          .json({ error: `Onbekende applicatie-code(s): ${onbekend.join(", ")}` });
      }
    }

    const [l] = await db
      .update(labelsTable)
      .set(set)
      .where(eq(labelsTable.id, id))
      .returning();
    if (!l) return res.status(404).json({ error: "Toepassing niet gevonden" });
    if (Array.isArray(applicatie_codes)) await syncLabelApplicaties(id, applicatie_codes);
    return res.json(await mapLabel(l));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// PUT /labels/:id/documenten — gekoppelde documenten van een toepassing instellen (beheerder)
router.put("/labels/:id/documenten", requireBevoegdheid("bibliotheek", 2), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const ids = Array.isArray(req.body?.document_ids) ? req.body.document_ids : [];
    await syncLabelDocumenten(id, ids);
    const [l] = await db
      .update(labelsTable)
      .set({ bijgewerktOp: new Date() })
      .where(eq(labelsTable.id, id))
      .returning();
    if (!l) return res.status(404).json({ error: "Toepassing niet gevonden" });
    return res.json(await mapLabel(l));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── TESTRAPPORTEN (bibliotheek) ─────────────────────────────────────────────
// GET /testrapporten
router.get("/testrapporten", async (req, res) => {
  try {
    const inclusiefGearchiveerd = req.query.inclusief_gearchiveerd === "true";
    let rows = await db
      .select()
      .from(testrapportenTable)
      .orderBy(asc(testrapportenTable.naam));
    if (!inclusiefGearchiveerd) rows = rows.filter((t) => !t.gearchiveerd);
    res.json(rows.map(mapTestrapport));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /testrapporten (beheerder)
router.post("/testrapporten", requireBevoegdheid("bibliotheek", 3), async (req, res) => {
  try {
    const { naam, fabrikant, norm, rapportnummer, pdf_url } = req.body;
    if (!naam || !String(naam).trim()) {
      return res.status(400).json({ error: "naam is verplicht" });
    }
    const [t] = await db
      .insert(testrapportenTable)
      .values({
        naam: String(naam).trim(),
        fabrikant: fabrikant ?? null,
        norm: norm ?? null,
        rapportnummer: rapportnummer ?? null,
        pdfUrl: pdf_url ?? null,
      })
      .returning();
    return res.status(201).json(mapTestrapport(t));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /testrapporten/:id (beheerder)
router.patch("/testrapporten/:id", requireBevoegdheid("bibliotheek", 2), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { naam, fabrikant, norm, rapportnummer, pdf_url, gearchiveerd } = req.body;
    const set: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (naam !== undefined) set.naam = String(naam).trim();
    if (fabrikant !== undefined) set.fabrikant = fabrikant;
    if (norm !== undefined) set.norm = norm;
    if (rapportnummer !== undefined) set.rapportnummer = rapportnummer;
    if (pdf_url !== undefined) set.pdfUrl = pdf_url;
    if (gearchiveerd !== undefined) set.gearchiveerd = gearchiveerd === true;

    const [t] = await db
      .update(testrapportenTable)
      .set(set)
      .where(eq(testrapportenTable.id, id))
      .returning();
    if (!t) return res.status(404).json({ error: "Testrapport niet gevonden" });
    return res.json(mapTestrapport(t));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

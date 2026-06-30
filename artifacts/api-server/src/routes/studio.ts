// Document Studio — referentiebibliotheek per werkmaatschappij.
// Beheert modellen (geen|referentie|concept|goedgekeurd) per documenttype per werkgever.
import { Router } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import { db, documentStudioModellenTable, werkgeversTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const oss = new ObjectStorageService();

const lezen   = requireBevoegdheid("organisatie", 1);
const schrijven = requireBevoegdheid("organisatie", 2);

const GELDIGE_TYPES = [
  "offerte", "brief", "email", "lmra", "toolbox", "inkoopbon", "factuur", "calculatie",
] as const;

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function mapModel(
  r: typeof documentStudioModellenTable.$inferSelect,
  werkgeverNaam?: string | null,
) {
  return {
    id:                     r.id,
    werkgever_id:           r.werkgeverId,
    werkgever_naam:         werkgeverNaam ?? null,
    document_type:          r.documentType,
    naam:                   r.naam,
    status:                 r.status,
    referentie_bestand_pad: r.referentieBestandPad,
    connect_template_json:  r.connectTemplateJson,
    versie:                 r.versie,
    goedgekeurd_op:         iso(r.goedgekeurdOp),
    goedgekeurd_door:       r.goedgekeurdDoor,
    aangemaakt_op:          r.aangemaaktOp.toISOString(),
    bijgewerkt_op:          iso(r.bijgewerktOp),
  };
}

// ── List — optioneel gefilterd op werkgever_id ────────────────────────────────

router.get("/studio/modellen", lezen, async (req, res) => {
  try {
    const werkgeverId = req.query.werkgever_id
      ? parseInt(String(req.query.werkgever_id), 10)
      : null;

    const modellen = await db
      .select({
        model:   documentStudioModellenTable,
        naam:    werkgeversTable.naam,
      })
      .from(documentStudioModellenTable)
      .leftJoin(werkgeversTable, eq(documentStudioModellenTable.werkgeverId, werkgeversTable.id))
      .where(
        werkgeverId
          ? eq(documentStudioModellenTable.werkgeverId, werkgeverId)
          : undefined,
      )
      .orderBy(documentStudioModellenTable.documentType);

    res.json(modellen.map(({ model, naam }) => mapModel(model, naam)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Get by id ─────────────────────────────────────────────────────────────────

router.get("/studio/modellen/:id", lezen, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [rij] = await db
      .select({ model: documentStudioModellenTable, naam: werkgeversTable.naam })
      .from(documentStudioModellenTable)
      .leftJoin(werkgeversTable, eq(documentStudioModellenTable.werkgeverId, werkgeversTable.id))
      .where(eq(documentStudioModellenTable.id, id));
    if (!rij) return res.status(404).json({ error: "Model niet gevonden" });
    res.json(mapModel(rij.model, rij.naam));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Upsert — aanmaken of bijwerken op (werkgever_id, document_type) ───────────

router.post("/studio/modellen", schrijven, async (req, res) => {
  try {
    const { werkgever_id, document_type, naam, status } = req.body as {
      werkgever_id: number;
      document_type: string;
      naam?: string | null;
      status?: string;
    };

    if (!werkgever_id || typeof werkgever_id !== "number") {
      return res.status(400).json({ error: "werkgever_id is verplicht" });
    }
    if (!document_type || !GELDIGE_TYPES.includes(document_type as never)) {
      return res.status(400).json({ error: `document_type moet een van de volgende zijn: ${GELDIGE_TYPES.join(", ")}` });
    }

    // Zoek bestaand model voor deze werkgever + type
    const [bestaand] = await db
      .select()
      .from(documentStudioModellenTable)
      .where(
        and(
          eq(documentStudioModellenTable.werkgeverId, werkgever_id),
          eq(documentStudioModellenTable.documentType, document_type),
        ),
      );

    let model: typeof documentStudioModellenTable.$inferSelect;

    if (bestaand) {
      const [bijgewerkt] = await db
        .update(documentStudioModellenTable)
        .set({
          ...(naam !== undefined ? { naam } : {}),
          ...(status ? { status } : {}),
          bijgewerktOp: new Date(),
        })
        .where(eq(documentStudioModellenTable.id, bestaand.id))
        .returning();
      model = bijgewerkt;
    } else {
      const [nieuw] = await db
        .insert(documentStudioModellenTable)
        .values({
          werkgeverId:  werkgever_id,
          documentType: document_type,
          naam:         naam ?? null,
          status:       status ?? "geen",
        })
        .returning();
      model = nieuw;
    }

    // Naam werkgever ophalen voor response
    const [wg] = await db
      .select({ naam: werkgeversTable.naam })
      .from(werkgeversTable)
      .where(eq(werkgeversTable.id, werkgever_id));

    res.json(mapModel(model, wg?.naam ?? null));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Patch ─────────────────────────────────────────────────────────────────────

router.patch("/studio/modellen/:id", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { naam, status, connect_template_json, goedgekeurd_door } = req.body as {
      naam?: string | null;
      status?: string;
      connect_template_json?: string | null;
      goedgekeurd_door?: number | null;
    };

    const setObj: Partial<typeof documentStudioModellenTable.$inferInsert> & { bijgewerktOp: Date } = {
      bijgewerktOp: new Date(),
    };
    if (naam !== undefined)                   setObj.naam = naam;
    if (status !== undefined)                 setObj.status = status;
    if (connect_template_json !== undefined)  setObj.connectTemplateJson = connect_template_json;
    if (goedgekeurd_door !== undefined)       setObj.goedgekeurdDoor = goedgekeurd_door;

    const [rij] = await db
      .update(documentStudioModellenTable)
      .set(setObj)
      .where(eq(documentStudioModellenTable.id, id))
      .returning();
    if (!rij) return res.status(404).json({ error: "Model niet gevonden" });

    const [wg] = await db
      .select({ naam: werkgeversTable.naam })
      .from(werkgeversTable)
      .where(eq(werkgeversTable.id, rij.werkgeverId));

    res.json(mapModel(rij, wg?.naam ?? null));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Referentie upload ─────────────────────────────────────────────────────────

router.post(
  "/studio/modellen/:id/referentie-upload",
  schrijven,
  upload.single("bestand"),
  async (req, res) => {
    try {
      const id = parseId(req.params.id);

      if (!req.file) {
        return res.status(400).json({ error: "Geen bestand ontvangen" });
      }

      const bestand = req.file;
      const toegestaan = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
      ];
      if (!toegestaan.includes(bestand.mimetype)) {
        return res.status(400).json({ error: "Bestandstype niet ondersteund — upload een PDF of afbeelding" });
      }

      const [bestaand] = await db
        .select()
        .from(documentStudioModellenTable)
        .where(eq(documentStudioModellenTable.id, id));
      if (!bestaand) return res.status(404).json({ error: "Model niet gevonden" });

      // Upload naar object storage
      const ext = bestand.originalname.includes(".")
        ? "." + bestand.originalname.split(".").pop()
        : "";
      const subPath = `algemeen/studio/${randomUUID()}${ext}`;
      const bestandPad = await oss.uploadBestand(subPath, bestand.buffer, bestand.mimetype);

      // Status bijwerken naar referentie (als nog geen hoger model)
      const nieuweStatus = bestaand.status === "geen" ? "referentie" : bestaand.status;

      const [bijgewerkt] = await db
        .update(documentStudioModellenTable)
        .set({
          referentieBestandPad: bestandPad,
          status:               nieuweStatus,
          bijgewerktOp:         new Date(),
        })
        .where(eq(documentStudioModellenTable.id, id))
        .returning();

      const [wg] = await db
        .select({ naam: werkgeversTable.naam })
        .from(werkgeversTable)
        .where(eq(werkgeversTable.id, bijgewerkt.werkgeverId));

      res.json(mapModel(bijgewerkt, wg?.naam ?? null));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

export default router;

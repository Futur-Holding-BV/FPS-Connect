// PIM — Project Intelligence Model
// Routes: POST /aanvragen, GET /opdrachten/:id/pim, PATCH /opdrachten/:id/pim/fase
import { Router } from "express";
import {
  db,
  pimModellenTable,
  opdrachtenTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { logDocumentActie } from "../lib/document-logboek";

const router = Router();
const lezen = requireBevoegdheid("offertes", 1);
const schrijven = requireBevoegdheid("offertes", 2);

const GELDIGE_FASEN = [
  "nieuw",
  "advies",
  "werkvoorbereiding",
  "inkoop",
  "uitvoering",
  "oplevering",
  "gereed",
] as const;
type AiFase = (typeof GELDIGE_FASEN)[number];

function mapPim(m: typeof pimModellenTable.$inferSelect, isKlant: boolean) {
  const base = {
    id: m.id,
    opdracht_id: m.opdrachtId,
    aanvraag_via_one: m.aanvraagViaOne,
    aanvraag_context: (m.aanvraagContext as Record<string, unknown> | null) ?? null,
    advies_context: (m.adviesContext as Record<string, unknown> | null) ?? null,
    oplevering_context: (m.opleveringContext as Record<string, unknown> | null) ?? null,
    aangemaakt_op: m.aangemaaktOp.toISOString(),
    bijgewerkt_op: m.bijgewerktOp.toISOString(),
  };
  if (isKlant) return base;
  return {
    ...base,
    werkvoorbereiding_context: (m.werkvoorbereidingContext as Record<string, unknown> | null) ?? null,
    inkoop_context: (m.inkoopContext as Record<string, unknown> | null) ?? null,
    uitvoerings_log: (m.uitvoeringsLog as Record<string, unknown> | null) ?? null,
  };
}

// ── POST /aanvragen ──────────────────────────────────────────────────────────
// FPS One aanvraagstroom: maakt opdracht + PIM in één transactie aan.
router.post("/aanvragen", schrijven, async (req, res): Promise<void> => {
  try {
    const {
      titel,
      gebouw_id,
      omschrijving,
      aanvraag_via_one,
      aanvraag_context,
    } = req.body as {
      titel?: string;
      gebouw_id?: number;
      omschrijving?: string;
      aanvraag_via_one?: boolean;
      aanvraag_context?: Record<string, unknown>;
    };

    if (!titel) {
      res.status(400).json({ error: "Titel is verplicht" });
      return;
    }

    const { opdracht, pim } = await db.transaction(async (tx) => {
      const [opdracht] = await tx
        .insert(opdrachtenTable)
        .values({
          titel,
          gebouwId: gebouw_id ?? null,
          omschrijving: omschrijving ?? null,
          status: "actief",
          aiFase: "nieuw",
          aangemaaktDoorId: req.session.userId!,
          bijgewerktOp: new Date(),
        })
        .returning();

      const [pim] = await tx
        .insert(pimModellenTable)
        .values({
          opdrachtId: opdracht.id,
          aanvraagViaOne: aanvraag_via_one ?? false,
          aanvraagContext: aanvraag_context ?? null,
          bijgewerktOp: new Date(),
        })
        .returning();

      return { opdracht, pim };
    });

    res.status(201).json({
      opdracht_id: opdracht.id,
      pim_id: pim.id,
    });
  } catch (err) {
    logger.error({ err }, "aanvraag aanmaken mislukt");
    res.status(500).json({ error: "Serverfout bij aanmaken aanvraag" });
  }
});

// ── GET /opdrachten/:id/pim ──────────────────────────────────────────────────
router.get("/opdrachten/:id/pim", lezen, async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  if (isNaN(opdrachtId)) {
    res.status(400).json({ error: "Ongeldig id" });
    return;
  }

  try {
    const [pim] = await db
      .select()
      .from(pimModellenTable)
      .where(eq(pimModellenTable.opdrachtId, opdrachtId));

    if (!pim) {
      res.status(404).json({ error: "PIM niet gevonden voor deze opdracht" });
      return;
    }

    const isKlant = req.permissies?.isKlant ?? false;
    res.json(mapPim(pim, isKlant));
  } catch (err) {
    logger.error({ err }, "getPim fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── PATCH /opdrachten/:id/pim/fase ───────────────────────────────────────────
router.patch(
  "/opdrachten/:id/pim/fase",
  schrijven,
  async (req, res): Promise<void> => {
    const opdrachtId = parseInt(String(req.params.id), 10);
    if (isNaN(opdrachtId)) {
      res.status(400).json({ error: "Ongeldig id" });
      return;
    }

    try {
      const { fase } = req.body as { fase?: string };
      if (!fase || !GELDIGE_FASEN.includes(fase as AiFase)) {
        res
          .status(400)
          .json({
            error: `Ongeldige fase. Geldige waarden: ${GELDIGE_FASEN.join(", ")}`,
          });
        return;
      }

      const [opdracht] = await db
        .select({
          id: opdrachtenTable.id,
          aiFase: opdrachtenTable.aiFase,
          titel: opdrachtenTable.titel,
        })
        .from(opdrachtenTable)
        .where(eq(opdrachtenTable.id, opdrachtId));

      if (!opdracht) {
        res.status(404).json({ error: "Opdracht niet gevonden" });
        return;
      }

      const oudeFase = opdracht.aiFase;

      const [updated] = await db
        .update(opdrachtenTable)
        .set({ aiFase: fase, bijgewerktOp: new Date() })
        .where(eq(opdrachtenTable.id, opdrachtId))
        .returning();

      await logDocumentActie({
        gebruikerId: req.session.userId!,
        actie: "pim_fase_overgang",
        detail: `PIM fase: ${oudeFase ?? "—"} → ${fase} (opdracht: ${opdracht.titel})`,
      });

      res.json({ opdracht_id: opdrachtId, ai_fase: updated.aiFase });
    } catch (err) {
      logger.error({ err }, "pimFase patch fout");
      res.status(500).json({ error: "Serverfout" });
    }
  },
);

export default router;

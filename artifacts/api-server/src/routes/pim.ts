// PIM — Project Intelligence Model
// Routes: POST /aanvragen, GET /opdrachten/:id/pim, PATCH /opdrachten/:id/pim/fase
import { Router } from "express";
import {
  db,
  pimModellenTable,
  opdrachtenTable,
  documentLogboekTable,
  gebruikersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireBevoegdheid, requireBevoegdheidOfKlant } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();
const lezen = requireBevoegdheidOfKlant("offertes", 1);
const schrijven = requireBevoegdheid("offertes", 2);

// Geldige AI-fasen (volgorde is bepalend voor transitiematrix)
const FASEN = [
  "nieuw",
  "advies",
  "werkvoorbereiding",
  "inkoop",
  "uitvoering",
  "oplevering",
  "gereed",
] as const;
type AiFase = (typeof FASEN)[number];

const FASE_INDEX: Record<string, number> = Object.fromEntries(
  FASEN.map((f, i) => [f, i]),
);

/**
 * Bepaalt of een transitie van oudeFase naar nieuweFase geldig is.
 * - Van null/undefined mag je altijd naar "nieuw" gaan.
 * - Anders is alleen +1 stap voorwaarts toegestaan (strikte volgorde).
 * Returns { ok: true } of { ok: false, van, naar } voor de 409-response.
 */
function valideerTransitie(
  oudeFase: string | null | undefined,
  nieuweFase: AiFase,
): { ok: true } | { ok: false; van: string; naar: string } {
  if (!oudeFase) {
    if (nieuweFase === "nieuw") return { ok: true };
    return { ok: false, van: "—", naar: nieuweFase };
  }
  const oud = FASE_INDEX[oudeFase];
  const nieuw = FASE_INDEX[nieuweFase];
  if (oud === undefined) return { ok: true };
  if (nieuw === oud + 1) return { ok: true };
  return { ok: false, van: oudeFase, naar: nieuweFase };
}

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
// FPS One aanvraagstroom: maakt concept-opdracht + PIM in één transactie.
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
          // concept: aanvraag is nog niet bevestigd/actief
          status: "concept",
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
// Klantperspectief: werkvoorbereiding/inkoop/uitvoerings_log worden gemaskeerd.
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
// Strikte transitiematrix: alleen +1 stap voorwaarts (409 bij ongeldige overgang).
// Update en auditlogboek-insert lopen in één transactie.
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
      if (!fase || !FASE_INDEX.hasOwnProperty(fase)) {
        res.status(400).json({
          error: `Ongeldige fase. Geldige waarden: ${FASEN.join(", ")}`,
        });
        return;
      }
      const nieuweFase = fase as AiFase;

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

      const transitie = valideerTransitie(opdracht.aiFase, nieuweFase);
      if (!transitie.ok) {
        res.status(409).json({
          error: `Ongeldige fase-overgang: ${transitie.van} → ${transitie.naar}. Alleen de eerstvolgende stap is toegestaan.`,
          van: transitie.van,
          naar: transitie.naar,
        });
        return;
      }

      const oudeFase = opdracht.aiFase;
      const gebruikerId = req.session.userId!;

      // Update + auditlogboek in één transactie (atomair)
      const [updated] = await db.transaction(async (tx) => {
        const [upd] = await tx
          .update(opdrachtenTable)
          .set({ aiFase: nieuweFase, bijgewerktOp: new Date() })
          .where(eq(opdrachtenTable.id, opdrachtId))
          .returning();

        // Gebruikersnaam ophalen voor gedenormaliseerd logboek
        const [gebruiker] = await tx
          .select({ naam: gebruikersTable.naam })
          .from(gebruikersTable)
          .where(eq(gebruikersTable.id, gebruikerId));

        await tx.insert(documentLogboekTable).values({
          gebruikerId,
          gebruikerNaam: gebruiker?.naam ?? null,
          actie: "pim_fase_overgang",
          detail: `PIM fase: ${oudeFase ?? "—"} → ${nieuweFase} (opdracht: ${opdracht.titel})`,
        });

        return [upd];
      });

      res.json({ opdracht_id: opdrachtId, ai_fase: updated.aiFase });
    } catch (err) {
      logger.error({ err }, "pimFase patch fout");
      res.status(500).json({ error: "Serverfout" });
    }
  },
);

export default router;

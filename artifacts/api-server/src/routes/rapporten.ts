// Opleverrapporten (V1.5) — concept/definitief rapport per gebouw.
// Een rapport slaat selectie (secties, spots, bijlagen, tekeningen) op.
// Definitief maken bevriest de documentrevisies en start de reactietermijn.
import { Router, type Request } from "express";
import {
  db,
  opleverrapportenTable,
  gebouwenTable,
  gebruikersTable,
  documentenTable,
} from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { requireBevoegdheid, requireBevoegdheidOfKlant } from "../middlewares/auth";

const router = Router();

const lezenRapporten = requireBevoegdheid("rapportages", 1);
const lezenRapportenOfKlant = requireBevoegdheidOfKlant("rapportages", 1);
const schrijvenRapporten = requireBevoegdheid("rapportages", 2);
const aanmakenRapporten = requireBevoegdheid("rapportages", 3);
const verwijderenRapporten = requireBevoegdheid("rapportages", 4);

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

function mapRapport(
  r: typeof opleverrapportenTable.$inferSelect,
  extra?: { aangemaaktDoorNaam?: string | null; gebouwNaam?: string | null },
) {
  return {
    id: r.id,
    gebouw_id: r.gebouwId,
    rapport_type: r.rapportType,
    versie: r.versie,
    status: r.status,
    titel: r.titel,
    secties: r.secties ?? {},
    spot_selectie: r.spotSelectie ?? {},
    bijlagen_ids: Array.isArray(r.bijlagenIds) ? r.bijlagenIds : [],
    tekening_ids: Array.isArray(r.tekeningIds) ? r.tekeningIds : [],
    bevroren_op: iso(r.bevrorenOp),
    bevroren_document_revisies: r.bevrorenDocumentRevisies ?? null,
    reactietermijn_datum: iso(r.reactietermijnDatum),
    reactietermijn_gestart_op: iso(r.reactietermijnGestarteOp),
    aangemaakt_door: r.aangemaaktDoor,
    aangemaakt_door_naam: extra?.aangemaaktDoorNaam ?? null,
    gebouw_naam: extra?.gebouwNaam ?? null,
    aangemaakt_op: iso(r.aangemaaktOp)!,
    bijgewerkt_op: iso(r.bijgewerktOp)!,
  };
}

function userId(req: Request): number | null {
  return (req.session as { userId?: number }).userId ?? null;
}

// ── GET /rapporten (cross-gebouw) ─────────────────────────────────────────────
router.get("/rapporten", lezenRapporten, async (req, res) => {
  try {
    const statusFilter = req.query.status as string | undefined;
    const q = db
      .select({ r: opleverrapportenTable, naam: gebruikersTable.naam, gebouwNaam: gebouwenTable.naam })
      .from(opleverrapportenTable)
      .leftJoin(gebruikersTable, eq(opleverrapportenTable.aangemaaktDoor, gebruikersTable.id))
      .leftJoin(gebouwenTable, eq(opleverrapportenTable.gebouwId, gebouwenTable.id))
      .orderBy(desc(opleverrapportenTable.bijgewerktOp));

    const rijen = statusFilter
      ? await q.where(eq(opleverrapportenTable.status, statusFilter))
      : await q;
    res.json(rijen.map(r => mapRapport(r.r, { aangemaaktDoorNaam: r.naam, gebouwNaam: r.gebouwNaam })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /gebouwen/:id/rapporten ───────────────────────────────────────────────
router.get("/gebouwen/:id/rapporten", lezenRapportenOfKlant, async (req, res) => {
  try {
    const gebouwId = parseId(req.params.id);
    const rijen = await db
      .select({ r: opleverrapportenTable, naam: gebruikersTable.naam })
      .from(opleverrapportenTable)
      .leftJoin(gebruikersTable, eq(opleverrapportenTable.aangemaaktDoor, gebruikersTable.id))
      .where(eq(opleverrapportenTable.gebouwId, gebouwId))
      .orderBy(desc(opleverrapportenTable.bijgewerktOp));
    res.json(rijen.map(r => mapRapport(r.r, { aangemaaktDoorNaam: r.naam })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /gebouwen/:id/rapporten ──────────────────────────────────────────────
router.post("/gebouwen/:id/rapporten", aanmakenRapporten, async (req, res) => {
  try {
    const gebouwId = parseId(req.params.id);

    const [gebouw] = await db
      .select({ id: gebouwenTable.id })
      .from(gebouwenTable)
      .where(eq(gebouwenTable.id, gebouwId));
    if (!gebouw) { res.status(404).json({ error: "Gebouw niet gevonden" }); return; }

    const { rapport_type, titel, secties, spot_selectie, bijlagen_ids, tekening_ids, reactietermijn_datum } =
      req.body as {
        rapport_type?: string;
        titel?: string | null;
        secties?: Record<string, boolean>;
        spot_selectie?: Record<string, number[]>;
        bijlagen_ids?: number[];
        tekening_ids?: number[];
        reactietermijn_datum?: string | null;
      };

    const [nieuw] = await db
      .insert(opleverrapportenTable)
      .values({
        gebouwId,
        rapportType: rapport_type ?? "opleverrapport",
        status: "concept",
        titel: titel ?? null,
        secties: secties ?? {},
        spotSelectie: spot_selectie ?? {},
        bijlagenIds: bijlagen_ids ?? [],
        tekeningIds: tekening_ids ?? [],
        reactietermijnDatum: reactietermijn_datum ? new Date(reactietermijn_datum) : null,
        aangemaaktDoor: userId(req),
        bijgewerktOp: new Date(),
      })
      .returning();

    res.status(201).json(mapRapport(nieuw));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /gebouwen/:id/rapporten/:rapportId ────────────────────────────────────
router.get("/gebouwen/:id/rapporten/:rapportId", lezenRapportenOfKlant, async (req, res) => {
  try {
    const gebouwId = parseId(req.params.id);
    const rapportId = parseId(req.params.rapportId);

    const [rij] = await db
      .select({ r: opleverrapportenTable, naam: gebruikersTable.naam })
      .from(opleverrapportenTable)
      .leftJoin(gebruikersTable, eq(opleverrapportenTable.aangemaaktDoor, gebruikersTable.id))
      .where(
        and(
          eq(opleverrapportenTable.id, rapportId),
          eq(opleverrapportenTable.gebouwId, gebouwId),
        ),
      );
    if (!rij) { res.status(404).json({ error: "Rapport niet gevonden" }); return; }
    res.json(mapRapport(rij.r, { aangemaaktDoorNaam: rij.naam }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── PATCH /gebouwen/:id/rapporten/:rapportId ──────────────────────────────────
router.patch("/gebouwen/:id/rapporten/:rapportId", schrijvenRapporten, async (req, res) => {
  try {
    const gebouwId = parseId(req.params.id);
    const rapportId = parseId(req.params.rapportId);

    const [huidig] = await db
      .select()
      .from(opleverrapportenTable)
      .where(
        and(
          eq(opleverrapportenTable.id, rapportId),
          eq(opleverrapportenTable.gebouwId, gebouwId),
        ),
      );
    if (!huidig) { res.status(404).json({ error: "Rapport niet gevonden" }); return; }
    if (huidig.status !== "concept") {
      res.status(409).json({ error: "Alleen concept-rapporten kunnen worden bewerkt" });
      return;
    }

    const { titel, secties, spot_selectie, bijlagen_ids, tekening_ids, reactietermijn_datum } =
      req.body as {
        titel?: string | null;
        secties?: Record<string, boolean>;
        spot_selectie?: Record<string, number[]>;
        bijlagen_ids?: number[];
        tekening_ids?: number[];
        reactietermijn_datum?: string | null;
      };

    const [bijgewerkt] = await db
      .update(opleverrapportenTable)
      .set({
        ...(titel !== undefined ? { titel } : {}),
        ...(secties !== undefined ? { secties } : {}),
        ...(spot_selectie !== undefined ? { spotSelectie: spot_selectie } : {}),
        ...(bijlagen_ids !== undefined ? { bijlagenIds: bijlagen_ids } : {}),
        ...(tekening_ids !== undefined ? { tekeningIds: tekening_ids } : {}),
        ...(reactietermijn_datum !== undefined
          ? { reactietermijnDatum: reactietermijn_datum ? new Date(reactietermijn_datum) : null }
          : {}),
        bijgewerktOp: new Date(),
      })
      .where(eq(opleverrapportenTable.id, rapportId))
      .returning();

    res.json(mapRapport(bijgewerkt));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── DELETE /gebouwen/:id/rapporten/:rapportId ─────────────────────────────────
router.delete("/gebouwen/:id/rapporten/:rapportId", verwijderenRapporten, async (req, res) => {
  try {
    const gebouwId = parseId(req.params.id);
    const rapportId = parseId(req.params.rapportId);

    const [huidig] = await db
      .select()
      .from(opleverrapportenTable)
      .where(
        and(
          eq(opleverrapportenTable.id, rapportId),
          eq(opleverrapportenTable.gebouwId, gebouwId),
        ),
      );
    if (!huidig) { res.status(404).json({ error: "Rapport niet gevonden" }); return; }
    if (huidig.status !== "concept") {
      res.status(409).json({ error: "Definitieve rapporten kunnen niet worden verwijderd" });
      return;
    }

    await db.delete(opleverrapportenTable).where(eq(opleverrapportenTable.id, rapportId));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /gebouwen/:id/rapporten/:rapportId/definitief ────────────────────────
// Bevriest de documentrevisies en start de reactietermijn.
router.post("/gebouwen/:id/rapporten/:rapportId/definitief", aanmakenRapporten, async (req, res) => {
  try {
    const gebouwId = parseId(req.params.id);
    const rapportId = parseId(req.params.rapportId);

    const [huidig] = await db
      .select()
      .from(opleverrapportenTable)
      .where(
        and(
          eq(opleverrapportenTable.id, rapportId),
          eq(opleverrapportenTable.gebouwId, gebouwId),
        ),
      );
    if (!huidig) { res.status(404).json({ error: "Rapport niet gevonden" }); return; }
    if (huidig.status !== "concept") {
      res.status(409).json({ error: "Rapport is al definitief of gearchiveerd" });
      return;
    }

    const { reactietermijn_dagen } = req.body as { reactietermijn_dagen?: number };
    const dagen = Number(reactietermijn_dagen ?? 30);
    if (isNaN(dagen) || dagen < 1 || dagen > 365) {
      res.status(400).json({ error: "reactietermijn_dagen moet tussen 1 en 365 liggen" });
      return;
    }

    // Bevriezing: snapshot van bijlage-revisies ophalen (best-effort)
    const bijlagenIds = Array.isArray(huidig.bijlagenIds) ? (huidig.bijlagenIds as number[]) : [];
    let bevrorenRevisies: Record<string, { revisie_nummer: number | null; naam: string }> = {};
    if (bijlagenIds.length > 0) {
      try {
        const docs = await db
          .select({ id: documentenTable.id, revisieNummer: documentenTable.revisieNummer, naam: documentenTable.naam })
          .from(documentenTable)
          .where(inArray(documentenTable.id, bijlagenIds));
        for (const d of docs) {
          bevrorenRevisies[String(d.id)] = { revisie_nummer: d.revisieNummer ?? null, naam: d.naam };
        }
      } catch {
        // Bevriezing-details zijn best-effort; definitief maken gaat door
      }
    }

    const nu = new Date();
    const reactietermijnDatum = new Date(nu.getTime() + dagen * 24 * 60 * 60 * 1000);

    const [definitief] = await db
      .update(opleverrapportenTable)
      .set({
        status: "definitief",
        bevrorenOp: nu,
        bevrorenDocumentRevisies: bevrorenRevisies,
        reactietermijnDatum,
        reactietermijnGestarteOp: nu,
        bijgewerktOp: nu,
      })
      .where(eq(opleverrapportenTable.id, rapportId))
      .returning();

    res.json(mapRapport(definitief));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

export default router;

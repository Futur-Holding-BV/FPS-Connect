import { Router, Request, Response } from "express";
import {
  db,
  salarisMutatiesTable,
  medewerkersTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();

const lezen = requireBevoegdheid("salaris_mutaties", 1);
const schrijven = requireBevoegdheid("salaris_mutaties", 2);

function mapMutatie(m: typeof salarisMutatiesTable.$inferSelect) {
  return {
    id: m.id,
    medewerker_id: m.medewerkerId,
    medewerker_naam: m.medewerkerNaam,
    werkmaatschappij: m.werkmaatschappij,
    werkgever_id: m.werkgeverId,
    periode_jaar: m.periodeJaar,
    periode_maand: m.periodeMaand,
    type: m.type,
    omschrijving: m.omschrijving,
    ingangsdatum: m.ingangsdatum,
    bron: m.bron,
    bijlage_object_path: m.bijlageObjectPath,
    bijlage_naam: m.bijlageNaam,
    bijlage_grootte: m.bijlageGrootte,
    status: m.status,
    gecontroleerd: m.gecontroleerd,
    gecontroleerd_door_naam: m.gecontroleerdDoorNaam,
    gecontroleerd_op: m.gecontroleerdOp?.toISOString() ?? null,
    akkoord: m.akkoord,
    notities: m.notities,
    aangemaakt_door_naam: m.aangemaaktDoorNaam,
    aangemaakt_op: m.aangemaaktOp.toISOString(),
    bijgewerkt_op: m.bijgewerktOp.toISOString(),
  };
}

router.get("/salaris-mutaties", lezen, async (req: Request, res: Response) => {
  const { jaar, maand, werkmaatschappij, status, medewerker_id } = req.query;
  const filters = [];
  if (jaar) filters.push(eq(salarisMutatiesTable.periodeJaar, Number(jaar)));
  if (maand) filters.push(eq(salarisMutatiesTable.periodeMaand, Number(maand)));
  if (werkmaatschappij) filters.push(eq(salarisMutatiesTable.werkmaatschappij, String(werkmaatschappij)));
  if (status) filters.push(eq(salarisMutatiesTable.status, String(status)));
  if (medewerker_id) filters.push(eq(salarisMutatiesTable.medewerkerId, Number(medewerker_id)));

  const rows = await db
    .select()
    .from(salarisMutatiesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(salarisMutatiesTable.aangemaaktOp));

  return res.json(rows.map(mapMutatie));
});

router.post("/salaris-mutaties", schrijven, async (req: Request, res: Response) => {
  const {
    medewerker_id, werkmaatschappij, werkgever_id,
    periode_jaar, periode_maand, type, omschrijving,
    ingangsdatum, bron, notities,
  } = req.body;

  const sess = req.session as { userId?: number; gebruikerNaam?: string };
  const userId = sess.userId;
  const gebruikerNaam = sess.gebruikerNaam ?? null;

  let medewerkerNaam: string | null = null;
  if (medewerker_id) {
    const [med] = await db.select({ naam: medewerkersTable.naam })
      .from(medewerkersTable).where(eq(medewerkersTable.id, medewerker_id));
    medewerkerNaam = med?.naam ?? null;
  }

  const [mutatie] = await db.insert(salarisMutatiesTable).values({
    medewerkerId: medewerker_id ?? null,
    medewerkerNaam,
    werkmaatschappij,
    werkgeverId: werkgever_id ?? null,
    periodeJaar: periode_jaar,
    periodeMaand: periode_maand,
    type,
    omschrijving: omschrijving ?? null,
    ingangsdatum: ingangsdatum ?? null,
    bron: bron ?? "handmatig",
    notities: notities ?? null,
    aangemaaktDoorId: userId ?? null,
    aangemaaktDoorNaam: gebruikerNaam,
    status: "concept",
  }).returning();

  return res.status(201).json(mapMutatie(mutatie));
});

router.get("/salaris-mutaties/:id", lezen, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [mutatie] = await db.select().from(salarisMutatiesTable).where(eq(salarisMutatiesTable.id, id));
  if (!mutatie) return res.status(404).json({ message: "Niet gevonden" });
  return res.json(mapMutatie(mutatie));
});

router.patch("/salaris-mutaties/:id", schrijven, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { type, omschrijving, ingangsdatum, status, akkoord, notities } = req.body;
  const sess = req.session as { userId?: number; gebruikerNaam?: string };

  const updateData: Partial<typeof salarisMutatiesTable.$inferInsert> = {
    bijgewerktOp: new Date(),
  };
  if (type !== undefined) updateData.type = type;
  if (omschrijving !== undefined) updateData.omschrijving = omschrijving;
  if (ingangsdatum !== undefined) updateData.ingangsdatum = ingangsdatum;
  if (status !== undefined) updateData.status = status;
  if (notities !== undefined) updateData.notities = notities;

  if (akkoord !== undefined) {
    updateData.akkoord = akkoord;
    updateData.gecontroleerd = true;
    updateData.gecontroleerdDoorId = sess.userId ?? null;
    updateData.gecontroleerdDoorNaam = sess.gebruikerNaam ?? null;
    updateData.gecontroleerdOp = new Date();
    updateData.status = akkoord ? "geaccordeerd" : "afgekeurd";
  }

  const [updated] = await db
    .update(salarisMutatiesTable)
    .set(updateData)
    .where(eq(salarisMutatiesTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ message: "Niet gevonden" });
  return res.json(mapMutatie(updated));
});

export default router;

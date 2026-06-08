import { Router } from "express";
import { db } from "@workspace/db";
import { inspectiesTable, gebouwenTable, gebruikersTable, voorzieningenTable, activiteitenTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

async function mapInspectie(i: typeof inspectiesTable.$inferSelect) {
  const gebouw = i.gebouwId
    ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, i.gebouwId)).then((r) => r[0])
    : null;
  const inspecteur = i.inspecteurId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, i.inspecteurId)).then((r) => r[0])
    : null;

  return {
    id: i.id,
    voorziening_id: i.voorzieningId,
    gebouw_id: i.gebouwId,
    gebouw_naam: gebouw?.naam ?? null,
    type: i.type,
    status: i.status,
    inspecteur_id: i.inspecteurId,
    inspecteur_naam: inspecteur?.naam ?? null,
    geplande_datum: i.geplandeDatum,
    uitgevoerd_datum: i.uitgevoerdDatum,
    bevindingen: i.bevindingen,
    aanbevelingen: i.aanbevelingen,
    rapport_url: i.rapportUrl,
    aangemaakt_op: i.aangemaaktOp.toISOString(),
  };
}

// GET /inspecties
router.get("/inspecties", async (req, res) => {
  try {
    const { gebouw_id, voorziening_id, type, status } = req.query;
    let all = await db.select().from(inspectiesTable);

    if (gebouw_id) all = all.filter((i) => i.gebouwId === parseInt(gebouw_id as string));
    if (voorziening_id) all = all.filter((i) => i.voorzieningId === parseInt(voorziening_id as string));
    if (type) all = all.filter((i) => i.type === type);
    if (status) all = all.filter((i) => i.status === status);

    const result = await Promise.all(all.map(mapInspectie));
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /inspecties
router.post("/inspecties", async (req, res) => {
  try {
    const { type, gebouw_id, voorziening_id, inspecteur_id, geplande_datum, bevindingen } = req.body;
    if (!type || !gebouw_id) {
      return res.status(400).json({ error: "type en gebouw_id zijn verplicht" });
    }
    const [i] = await db
      .insert(inspectiesTable)
      .values({
        type,
        gebouwId: gebouw_id,
        voorzieningId: voorziening_id,
        inspecteurId: inspecteur_id,
        geplandeDatum: geplande_datum,
        bevindingen,
        status: "gepland",
      })
      .returning();

    await db.insert(activiteitenTable).values({
      type: "inspectie_aangemaakt",
      omschrijving: `Nieuwe ${type} inspectie ingepland`,
      gebouwId: gebouw_id,
    });

    res.status(201).json(await mapInspectie(i));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /inspecties/:id
router.get("/inspecties/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [i] = await db.select().from(inspectiesTable).where(eq(inspectiesTable.id, id));
    if (!i) return res.status(404).json({ error: "Inspectie niet gevonden" });

    const base = await mapInspectie(i);
    const voorzieningen = i.voorzieningId
      ? await db.select().from(voorzieningenTable).where(eq(voorzieningenTable.id, i.voorzieningId))
      : i.gebouwId
      ? await db.select().from(voorzieningenTable).where(eq(voorzieningenTable.gebouwId, i.gebouwId))
      : [];

    res.json({
      ...base,
      voorzieningen: voorzieningen.map((v) => ({
        id: v.id,
        objectnummer: v.objectnummer,
        type: v.type,
        status: v.status,
        classificatie: v.classificatie,
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /inspecties/:id
router.patch("/inspecties/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { type, status, inspecteur_id, geplande_datum, uitgevoerd_datum, bevindingen, aanbevelingen, rapport_url } = req.body;
    const [i] = await db
      .update(inspectiesTable)
      .set({
        type, status, inspecteurId: inspecteur_id,
        geplandeDatum: geplande_datum, uitgevoerdDatum: uitgevoerd_datum,
        bevindingen, aanbevelingen, rapportUrl: rapport_url,
        bijgewerktOp: new Date(),
      })
      .where(eq(inspectiesTable.id, id))
      .returning();
    if (!i) return res.status(404).json({ error: "Inspectie niet gevonden" });
    res.json(await mapInspectie(i));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /inspecties/:id/afronden
router.post("/inspecties/:id/afronden", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { bevindingen, aanbevelingen, goedgekeurd } = req.body;
    const [i] = await db
      .update(inspectiesTable)
      .set({
        status: goedgekeurd ? "afgerond" : "afgekeurd",
        bevindingen,
        aanbevelingen,
        goedgekeurd,
        uitgevoerdDatum: new Date().toISOString().split("T")[0],
        bijgewerktOp: new Date(),
      })
      .where(eq(inspectiesTable.id, id))
      .returning();
    if (!i) return res.status(404).json({ error: "Inspectie niet gevonden" });

    await db.insert(activiteitenTable).values({
      type: "inspectie_afgerond",
      omschrijving: `Inspectie ${goedgekeurd ? "goedgekeurd" : "afgekeurd"}`,
      gebouwId: i.gebouwId,
    });

    res.json(await mapInspectie(i));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

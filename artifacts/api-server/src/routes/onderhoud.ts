import { Router } from "express";
import { db } from "@workspace/db";
import { onderhoudTable, gebouwenTable, voorzieningenTable, gebruikersTable, activiteitenTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

async function mapOnderhoud(o: typeof onderhoudTable.$inferSelect) {
  const gebouw = o.gebouwId
    ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, o.gebouwId)).then((r) => r[0])
    : null;
  const voorziening = o.voorzieningId
    ? await db.select({ objectnummer: voorzieningenTable.objectnummer }).from(voorzieningenTable).where(eq(voorzieningenTable.id, o.voorzieningId)).then((r) => r[0])
    : null;
  const toegewezen = o.toegewezenAanId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, o.toegewezenAanId)).then((r) => r[0])
    : null;

  return {
    id: o.id,
    voorziening_id: o.voorzieningId,
    voorziening_nummer: voorziening?.objectnummer ?? null,
    gebouw_id: o.gebouwId,
    gebouw_naam: gebouw?.naam ?? null,
    titel: o.titel,
    omschrijving: o.omschrijving,
    prioriteit: o.prioriteit,
    status: o.status,
    toegewezen_aan_id: o.toegewezenAanId,
    toegewezen_aan_naam: toegewezen?.naam ?? null,
    deadline: o.deadline,
    voltooid_datum: o.voltooidDatum,
    resultaat: o.resultaat,
    aangemaakt_op: o.aangemaaktOp.toISOString(),
  };
}

// GET /onderhoud
router.get("/onderhoud", async (req, res) => {
  try {
    const { voorziening_id, gebouw_id, status } = req.query;
    let all = await db.select().from(onderhoudTable);

    if (voorziening_id) all = all.filter((o) => o.voorzieningId === parseInt(voorziening_id as string));
    if (gebouw_id) all = all.filter((o) => o.gebouwId === parseInt(gebouw_id as string));
    if (status) all = all.filter((o) => o.status === status);

    const result = await Promise.all(all.map(mapOnderhoud));
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /onderhoud
router.post("/onderhoud", async (req, res) => {
  try {
    const { voorziening_id, gebouw_id, titel, omschrijving, prioriteit, toegewezen_aan_id, deadline } = req.body;
    if (!titel || !prioriteit) {
      return res.status(400).json({ error: "titel en prioriteit zijn verplicht" });
    }
    const [o] = await db
      .insert(onderhoudTable)
      .values({
        voorzieningId: voorziening_id,
        gebouwId: gebouw_id,
        titel, omschrijving,
        prioriteit: prioriteit ?? "normaal",
        status: "open",
        toegewezenAanId: toegewezen_aan_id,
        deadline,
      })
      .returning();

    await db.insert(activiteitenTable).values({
      type: "onderhoud_aangemaakt",
      omschrijving: `Onderhoudstaak aangemaakt: ${titel}`,
      gebouwId: gebouw_id,
      voorzieningId: voorziening_id,
    });

    res.status(201).json(await mapOnderhoud(o));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /onderhoud/:id
router.get("/onderhoud/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [o] = await db.select().from(onderhoudTable).where(eq(onderhoudTable.id, id));
    if (!o) return res.status(404).json({ error: "Onderhoudstaak niet gevonden" });
    res.json(await mapOnderhoud(o));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /onderhoud/:id
router.patch("/onderhoud/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { titel, omschrijving, prioriteit, status, toegewezen_aan_id, deadline } = req.body;
    const [o] = await db
      .update(onderhoudTable)
      .set({
        titel, omschrijving, prioriteit, status,
        toegewezenAanId: toegewezen_aan_id,
        deadline, bijgewerktOp: new Date(),
      })
      .where(eq(onderhoudTable.id, id))
      .returning();
    if (!o) return res.status(404).json({ error: "Onderhoudstaak niet gevonden" });
    res.json(await mapOnderhoud(o));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /onderhoud/:id/voltooien
router.post("/onderhoud/:id/voltooien", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { resultaat, voltooid_datum } = req.body;
    const [o] = await db
      .update(onderhoudTable)
      .set({
        status: "voltooid",
        resultaat,
        voltooidDatum: voltooid_datum ?? new Date().toISOString().split("T")[0],
        bijgewerktOp: new Date(),
      })
      .where(eq(onderhoudTable.id, id))
      .returning();
    if (!o) return res.status(404).json({ error: "Onderhoudstaak niet gevonden" });

    await db.insert(activiteitenTable).values({
      type: "onderhoud_voltooid",
      omschrijving: `Onderhoudstaak voltooid: ${o.titel}`,
      gebouwId: o.gebouwId,
      voorzieningId: o.voorzieningId,
    });

    res.json(await mapOnderhoud(o));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import {
  onderhoudTable,
  gebouwenTable,
  voorzieningenTable,
  gebruikersTable,
  activiteitenTable,
  gebouwToewijzingenTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { effectieveContext } from "../utils/rol";

const router = Router();

const TOEGEWEZEN_ROLLEN = ["monteur", "controleur"];

async function toegewezenGebouwIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ gebouwId: gebouwToewijzingenTable.gebouwId })
    .from(gebouwToewijzingenTable)
    .where(eq(gebouwToewijzingenTable.gebruikerId, userId));
  return rows.map((r) => r.gebouwId);
}

// Echte sessie-rol (geen impersonatie): write-autorisatie blijft altijd op de
// werkelijke gebruiker gebaseerd.
async function echteRol(userId: number): Promise<string> {
  const [g] = await db
    .select({ rol: gebruikersTable.rol })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, userId));
  return g?.rol ?? "viewer";
}

// Leidt het gebouw af uit een voorziening (onderhoud kan aan een voorziening
// hangen zonder expliciet gebouw_id).
async function gebouwIdVanVoorziening(voorzieningId: number | null | undefined): Promise<number | null> {
  if (voorzieningId == null) return null;
  const [v] = await db
    .select({ gebouwId: voorzieningenTable.gebouwId })
    .from(voorzieningenTable)
    .where(eq(voorzieningenTable.id, voorzieningId));
  return v?.gebouwId ?? null;
}

// Object-level guard: monteur/controleur mogen alleen muteren bij hun toegewezen
// gebouwen. Beheerder/hoofdbeheerder zijn niet beperkt (rolafdwinging via requireRol).
async function magBijGebouw(userId: number, gebouwId: number | null): Promise<boolean> {
  if (!TOEGEWEZEN_ROLLEN.includes(await echteRol(userId))) return true;
  if (gebouwId == null) return false;
  return (await toegewezenGebouwIds(userId)).includes(gebouwId);
}

async function mapOnderhoud(o: typeof onderhoudTable.$inferSelect) {
  const gebouw = o.gebouwId
    ? await db
        .select({ naam: gebouwenTable.naam })
        .from(gebouwenTable)
        .where(eq(gebouwenTable.id, o.gebouwId))
        .then((r) => r[0])
    : null;
  const voorziening = o.voorzieningId
    ? await db
        .select({ objectnummer: voorzieningenTable.objectnummer })
        .from(voorzieningenTable)
        .where(eq(voorzieningenTable.id, o.voorzieningId))
        .then((r) => r[0])
    : null;
  const toegewezen = o.toegewezenAanId
    ? await db
        .select({ naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, o.toegewezenAanId))
        .then((r) => r[0])
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
    const { userId, rol: effectiefRol } = await effectieveContext(req);
    const { voorziening_id, gebouw_id, status } = req.query;

    let all = await db.select().from(onderhoudTable);

    // Monteur/controleur ziet alleen onderhoud dat:
    //   (a) direct aan hen is toegewezen (toegewezen_aan_id = userId), OF
    //   (b) hoort bij een gebouw dat aan hen is toegewezen
    if (TOEGEWEZEN_ROLLEN.includes(effectiefRol)) {
      const gebouwIds = await toegewezenGebouwIds(userId);
      all = all.filter(
        (o) =>
          o.toegewezenAanId === userId ||
          (o.gebouwId != null && gebouwIds.includes(o.gebouwId)),
      );
    }

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
router.post("/onderhoud", requireBevoegdheid("onderhoud", 3), async (req, res) => {
  try {
    const { voorziening_id, gebouw_id, titel, omschrijving, prioriteit, toegewezen_aan_id, deadline } = req.body;
    if (!titel || !prioriteit) {
      return res.status(400).json({ error: "titel en prioriteit zijn verplicht" });
    }
    // Cross-entity integriteit: als beide zijn opgegeven moet de voorziening bij
    // hetzelfde gebouw horen, zodat toegang tot gebouw A geen taak op een
    // voorziening uit gebouw B kan koppelen.
    const voorzieningGebouw =
      voorziening_id != null ? await gebouwIdVanVoorziening(voorziening_id) : null;
    if (voorziening_id != null && voorzieningGebouw == null) {
      return res.status(400).json({ error: "Voorziening niet gevonden" });
    }
    if (gebouw_id != null && voorzieningGebouw != null && gebouw_id !== voorzieningGebouw) {
      return res.status(400).json({ error: "Voorziening hoort niet bij dit gebouw" });
    }
    const doelGebouw = gebouw_id ?? voorzieningGebouw;
    if (!(await magBijGebouw(req.session.userId!, doelGebouw))) {
      return res.status(403).json({ error: "Geen toegang tot dit gebouw" });
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
    const id = parseInt(String(req.params.id));
    const { userId, rol: effectiefRolDetail } = await effectieveContext(req);

    const [o] = await db.select().from(onderhoudTable).where(eq(onderhoudTable.id, id));
    if (!o) return res.status(404).json({ error: "Onderhoudstaak niet gevonden" });

    // Toegangscontrole voor monteur/controleur
    if (TOEGEWEZEN_ROLLEN.includes(effectiefRolDetail)) {
      const gebouwIds = await toegewezenGebouwIds(userId);
      const toegang =
        o.toegewezenAanId === userId ||
        (o.gebouwId != null && gebouwIds.includes(o.gebouwId));
      if (!toegang) return res.status(403).json({ error: "Geen toegang tot deze taak" });
    }

    res.json(await mapOnderhoud(o));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /onderhoud/:id
router.patch("/onderhoud/:id", requireBevoegdheid("onderhoud", 2), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const {
      titel, omschrijving, prioriteit, status,
      toegewezen_aan_id, deadline, voltooid_datum, resultaat,
    } = req.body;

    const [bestaand] = await db
      .select({ gebouwId: onderhoudTable.gebouwId, voorzieningId: onderhoudTable.voorzieningId })
      .from(onderhoudTable)
      .where(eq(onderhoudTable.id, id));
    if (!bestaand) return res.status(404).json({ error: "Onderhoudstaak niet gevonden" });
    const doelGebouw = bestaand.gebouwId ?? (await gebouwIdVanVoorziening(bestaand.voorzieningId));
    if (!(await magBijGebouw(req.session.userId!, doelGebouw))) {
      return res.status(403).json({ error: "Geen toegang tot deze taak" });
    }

    const [o] = await db
      .update(onderhoudTable)
      .set({
        titel, omschrijving, prioriteit, status,
        toegewezenAanId: toegewezen_aan_id,
        deadline,
        voltooidDatum: voltooid_datum,
        resultaat,
        bijgewerktOp: new Date(),
      })
      .where(eq(onderhoudTable.id, id))
      .returning();

    if (!o) return res.status(404).json({ error: "Onderhoudstaak niet gevonden" });

    if (status === "voltooid") {
      await db.insert(activiteitenTable).values({
        type: "onderhoud_voltooid",
        omschrijving: `Onderhoudstaak voltooid: ${o.titel}`,
        gebouwId: o.gebouwId,
        voorzieningId: o.voorzieningId,
      });
    }

    res.json(await mapOnderhoud(o));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /onderhoud/:id
router.delete("/onderhoud/:id", requireBevoegdheid("onderhoud", 4), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(onderhoudTable).where(eq(onderhoudTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

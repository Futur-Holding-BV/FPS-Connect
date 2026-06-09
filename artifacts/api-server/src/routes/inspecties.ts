import { Router } from "express";
import { db } from "@workspace/db";
import {
  inspectiesTable,
  gebouwenTable,
  gebruikersTable,
  voorzieningenTable,
  activiteitenTable,
  gebouwToewijzingenTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireRol } from "../middlewares/auth";
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

// Object-level guard: monteur/controleur mogen alleen muteren bij hun toegewezen
// gebouwen. Beheerder/hoofdbeheerder zijn niet beperkt (rolafdwinging via requireRol).
async function magBijGebouw(userId: number, gebouwId: number | null): Promise<boolean> {
  if (!TOEGEWEZEN_ROLLEN.includes(await echteRol(userId))) return true;
  if (gebouwId == null) return false;
  return (await toegewezenGebouwIds(userId)).includes(gebouwId);
}

async function mapInspectie(i: typeof inspectiesTable.$inferSelect) {
  const gebouw = i.gebouwId
    ? await db
        .select({ naam: gebouwenTable.naam })
        .from(gebouwenTable)
        .where(eq(gebouwenTable.id, i.gebouwId))
        .then((r) => r[0])
    : null;
  const inspecteur = i.inspecteurId
    ? await db
        .select({ naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, i.inspecteurId))
        .then((r) => r[0])
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
    const { userId, rol: effectiefRol } = await effectieveContext(req);
    const { gebouw_id, voorziening_id, type, status } = req.query;

    let all = await db.select().from(inspectiesTable);

    // Monteur/controleur ziet alleen inspecties die:
    //   (a) direct aan hen zijn toegewezen (inspecteur_id = userId), OF
    //   (b) horen bij een gebouw dat aan hen is toegewezen
    if (TOEGEWEZEN_ROLLEN.includes(effectiefRol)) {
      const gebouwIds = await toegewezenGebouwIds(userId);
      all = all.filter(
        (i) =>
          i.inspecteurId === userId ||
          (i.gebouwId != null && gebouwIds.includes(i.gebouwId)),
      );
    }

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
router.post("/inspecties", requireRol("monteur", "controleur", "beheerder", "hoofdbeheerder"), async (req, res) => {
  try {
    const { type, gebouw_id, voorziening_id, inspecteur_id, geplande_datum, bevindingen } = req.body;
    if (!type || !gebouw_id) {
      return res.status(400).json({ error: "type en gebouw_id zijn verplicht" });
    }
    if (!(await magBijGebouw(req.session.userId!, gebouw_id))) {
      return res.status(403).json({ error: "Geen toegang tot dit gebouw" });
    }
    // Cross-entity integriteit: voorziening moet bij hetzelfde gebouw horen.
    if (voorziening_id != null) {
      const [vz] = await db
        .select({ gebouwId: voorzieningenTable.gebouwId })
        .from(voorzieningenTable)
        .where(eq(voorzieningenTable.id, voorziening_id));
      if (!vz) return res.status(400).json({ error: "Voorziening niet gevonden" });
      if (vz.gebouwId !== gebouw_id) {
        return res.status(400).json({ error: "Voorziening hoort niet bij dit gebouw" });
      }
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
    const { userId, rol: effectiefRolDetail } = await effectieveContext(req);

    const [i] = await db.select().from(inspectiesTable).where(eq(inspectiesTable.id, id));
    if (!i) return res.status(404).json({ error: "Inspectie niet gevonden" });

    // Toegangscontrole voor monteur/controleur
    if (TOEGEWEZEN_ROLLEN.includes(effectiefRolDetail)) {
      const gebouwIds = await toegewezenGebouwIds(userId);
      const toegang =
        i.inspecteurId === userId ||
        (i.gebouwId != null && gebouwIds.includes(i.gebouwId));
      if (!toegang) return res.status(403).json({ error: "Geen toegang tot deze inspectie" });
    }

    const voorzieningen = i.voorzieningId
      ? await db
          .select()
          .from(voorzieningenTable)
          .where(eq(voorzieningenTable.id, i.voorzieningId))
      : [];

    res.json({
      ...(await mapInspectie(i)),
      voorzieningen: voorzieningen.map((v) => ({
        id: v.id,
        objectnummer: v.objectnummer,
        type: v.type,
        status: v.status,
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /inspecties/:id
router.patch("/inspecties/:id", requireRol("monteur", "controleur", "beheerder", "hoofdbeheerder"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      type, status, inspecteur_id, geplande_datum, uitgevoerd_datum,
      bevindingen, aanbevelingen, rapport_url,
    } = req.body;

    const [bestaand] = await db
      .select({ gebouwId: inspectiesTable.gebouwId })
      .from(inspectiesTable)
      .where(eq(inspectiesTable.id, id));
    if (!bestaand) return res.status(404).json({ error: "Inspectie niet gevonden" });
    if (!(await magBijGebouw(req.session.userId!, bestaand.gebouwId))) {
      return res.status(403).json({ error: "Geen toegang tot deze inspectie" });
    }

    const [i] = await db
      .update(inspectiesTable)
      .set({
        type, status,
        inspecteurId: inspecteur_id,
        geplandeDatum: geplande_datum,
        uitgevoerdDatum: uitgevoerd_datum,
        bevindingen, aanbevelingen,
        rapportUrl: rapport_url,
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

// DELETE /inspecties/:id
router.delete("/inspecties/:id", requireRol("beheerder", "hoofdbeheerder"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(inspectiesTable).where(eq(inspectiesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

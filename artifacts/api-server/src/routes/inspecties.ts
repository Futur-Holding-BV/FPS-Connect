import { Router } from "express";
import { db } from "@workspace/db";
import {
  inspectiesTable,
  inspectieBevindingen,
  gebouwenTable,
  gebruikersTable,
  voorzieningenTable,
  onderhoudTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireBevoegdheid, requireBevoegdheidOfKlant } from "../middlewares/auth";
import { effectieveContext, toegewezenGebouwIds } from "../utils/rol";
import { logActiviteit } from "../lib/activiteit";

const router = Router();
const lezenInspecties = requireBevoegdheid("inspecties", 1);
const lezenInspectiesOfKlant = requireBevoegdheidOfKlant("inspecties", 1);

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

async function mapBevinding(b: typeof inspectieBevindingen.$inferSelect) {
  const vz = b.voorzieningId
    ? await db
        .select({ objectnummer: voorzieningenTable.objectnummer, type: voorzieningenTable.type })
        .from(voorzieningenTable)
        .where(eq(voorzieningenTable.id, b.voorzieningId))
        .then((r) => r[0])
    : null;

  let fotos: string[] = [];
  try { fotos = JSON.parse(b.fotoUrls); } catch { fotos = []; }

  return {
    id: b.id,
    inspectie_id: b.inspectieId,
    voorziening_id: b.voorzieningId,
    voorziening_objectnummer: vz?.objectnummer ?? null,
    voorziening_type: vz?.type ?? null,
    status: b.status,
    omschrijving: b.omschrijving,
    aanbeveling: b.aanbeveling,
    herstel_vereist: b.herstellVereist,
    herstel_werkbon_id: b.herstellWerkbonId,
    foto_urls: fotos,
    aangemaakt_op: b.aangemaaktOp.toISOString(),
  };
}

// GET /inspecties
router.get("/inspecties", lezenInspectiesOfKlant, async (req, res): Promise<void> => {
  try {
    const { userId, beperkt } = await effectieveContext(req);
    const { gebouw_id, voorziening_id, type, status } = req.query;

    let all = await db.select().from(inspectiesTable);

    if (beperkt) {
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
router.post("/inspecties", requireBevoegdheid("inspecties", 3), async (req, res): Promise<void> => {
  try {
    const { type, gebouw_id, voorziening_id, inspecteur_id, geplande_datum, bevindingen } = req.body;
    if (!type || !gebouw_id) {
      res.status(400).json({ error: "type en gebouw_id zijn verplicht" }); return;
    }
    if (!(req.permissies!.magBijGebouw(gebouw_id))) {
      res.status(403).json({ error: "Geen toegang tot dit gebouw" }); return;
    }
    if (voorziening_id != null) {
      const [vz] = await db
        .select({ gebouwId: voorzieningenTable.gebouwId })
        .from(voorzieningenTable)
        .where(eq(voorzieningenTable.id, voorziening_id));
      if (!vz) { res.status(400).json({ error: "Voorziening niet gevonden" }); return; }
      if (vz.gebouwId !== gebouw_id) {
        res.status(400).json({ error: "Voorziening hoort niet bij dit gebouw" }); return;
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

    await logActiviteit({
      type: "inspectie_aangemaakt",
      omschrijving: `Nieuwe ${type} inspectie ingepland`,
      gebouwId: gebouw_id,
      voorzieningId: voorziening_id,
      gebruikerId: req.session.userId,
    });

    res.status(201).json(await mapInspectie(i));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /inspecties/:id
router.get("/inspecties/:id", lezenInspectiesOfKlant, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

    const [i] = await db.select().from(inspectiesTable).where(eq(inspectiesTable.id, id));
    if (!i) { res.status(404).json({ error: "Inspectie niet gevonden" }); return; }
    const { userId: uid, beperkt } = await effectieveContext(req);
    if (beperkt) {
      const gids = await toegewezenGebouwIds(uid);
      const toegang = i.inspecteurId === uid || (i.gebouwId != null && gids.includes(i.gebouwId));
      if (!toegang) { res.status(403).json({ error: "Geen toegang tot deze inspectie" }); return; }
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
router.patch("/inspecties/:id", requireBevoegdheid("inspecties", 2), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
    const {
      type, status, inspecteur_id, geplande_datum, uitgevoerd_datum,
      bevindingen, aanbevelingen, rapport_url,
    } = req.body;

    const [bestaand] = await db
      .select({ gebouwId: inspectiesTable.gebouwId })
      .from(inspectiesTable)
      .where(eq(inspectiesTable.id, id));
    if (!bestaand) { res.status(404).json({ error: "Inspectie niet gevonden" }); return; }
    if (!(req.permissies!.magBijGebouw(bestaand.gebouwId))) {
      res.status(403).json({ error: "Geen toegang tot deze inspectie" }); return;
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

    if (!i) { res.status(404).json({ error: "Inspectie niet gevonden" }); return; }
    res.json(await mapInspectie(i));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /inspecties/:id
router.delete("/inspecties/:id", requireBevoegdheid("inspecties", 4), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(inspectiesTable).where(eq(inspectiesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── BEVINDINGEN ────────────────────────────────────────────────────────────────

// GET /inspecties/:id/bevindingen
router.get("/inspecties/:id/bevindingen", lezenInspectiesOfKlant, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

    const [inspectie] = await db.select().from(inspectiesTable).where(eq(inspectiesTable.id, id));
    if (!inspectie) { res.status(404).json({ error: "Inspectie niet gevonden" }); return; }
    const { userId: uid2, beperkt: beperkt2 } = await effectieveContext(req);
    if (beperkt2) {
      const gids2 = await toegewezenGebouwIds(uid2);
      const ok2 = inspectie.inspecteurId === uid2 || (inspectie.gebouwId != null && gids2.includes(inspectie.gebouwId));
      if (!ok2) { res.status(403).json({ error: "Geen toegang" }); return; }
    }

    const rows = await db.select().from(inspectieBevindingen).where(eq(inspectieBevindingen.inspectieId, id));
    const result = await Promise.all(rows.map(mapBevinding));
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /inspecties/:id/bevindingen
router.post("/inspecties/:id/bevindingen", requireBevoegdheid("inspecties", 2), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

    const [insp] = await db.select().from(inspectiesTable).where(eq(inspectiesTable.id, id));
    if (!insp) { res.status(404).json({ error: "Inspectie niet gevonden" }); return; }
    if (!(req.permissies!.magBijGebouw(insp.gebouwId))) {
      res.status(403).json({ error: "Geen toegang" }); return;
    }

    const { voorziening_id, status, omschrijving, aanbeveling, herstel_vereist } = req.body;
    if (!status) { res.status(400).json({ error: "status is verplicht" }); return; }

    const [b] = await db.insert(inspectieBevindingen).values({
      inspectieId: id,
      voorzieningId: voorziening_id ?? null,
      status: status ?? "goed",
      omschrijving: omschrijving ?? null,
      aanbeveling: aanbeveling ?? null,
      herstellVereist: herstel_vereist ?? false,
      fotoUrls: "[]",
    }).returning();

    res.status(201).json(await mapBevinding(b));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /inspecties/:id/bevindingen/:bevId
router.patch("/inspecties/:id/bevindingen/:bevId", requireBevoegdheid("inspecties", 2), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const bevId = parseInt(String(req.params.bevId));
    if (isNaN(id) || isNaN(bevId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

    const [insp] = await db.select().from(inspectiesTable).where(eq(inspectiesTable.id, id));
    if (!insp) { res.status(404).json({ error: "Inspectie niet gevonden" }); return; }
    if (!(req.permissies!.magBijGebouw(insp.gebouwId))) {
      res.status(403).json({ error: "Geen toegang" }); return;
    }

    const { status, omschrijving, aanbeveling, herstel_vereist } = req.body;
    const [b] = await db.update(inspectieBevindingen).set({
      ...(status !== undefined && { status }),
      ...(omschrijving !== undefined && { omschrijving }),
      ...(aanbeveling !== undefined && { aanbeveling }),
      ...(herstel_vereist !== undefined && { herstellVereist: herstel_vereist }),
      bijgewerktOp: new Date(),
    }).where(eq(inspectieBevindingen.id, bevId)).returning();

    if (!b) { res.status(404).json({ error: "Bevinding niet gevonden" }); return; }
    res.json(await mapBevinding(b));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /inspecties/:id/bevindingen/:bevId
router.delete("/inspecties/:id/bevindingen/:bevId", requireBevoegdheid("inspecties", 2), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const bevId = parseInt(String(req.params.bevId));
    if (isNaN(id) || isNaN(bevId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

    const [insp] = await db.select().from(inspectiesTable).where(eq(inspectiesTable.id, id));
    if (!insp) { res.status(404).json({ error: "Inspectie niet gevonden" }); return; }
    if (!(req.permissies!.magBijGebouw(insp.gebouwId))) {
      res.status(403).json({ error: "Geen toegang" }); return;
    }

    await db.delete(inspectieBevindingen).where(eq(inspectieBevindingen.id, bevId));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /inspecties/:id/bevindingen/:bevId/foto
router.post("/inspecties/:id/bevindingen/:bevId/foto", requireBevoegdheid("inspecties", 2), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const bevId = parseInt(String(req.params.bevId));
    if (isNaN(id) || isNaN(bevId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

    const { url } = req.body;
    if (!url) { res.status(400).json({ error: "url is verplicht" }); return; }

    const [bev] = await db.select().from(inspectieBevindingen).where(eq(inspectieBevindingen.id, bevId));
    if (!bev) { res.status(404).json({ error: "Bevinding niet gevonden" }); return; }

    let fotos: string[] = [];
    try { fotos = JSON.parse(bev.fotoUrls); } catch { fotos = []; }
    fotos.push(url);

    const [b] = await db.update(inspectieBevindingen).set({
      fotoUrls: JSON.stringify(fotos),
      bijgewerktOp: new Date(),
    }).where(eq(inspectieBevindingen.id, bevId)).returning();

    res.json(await mapBevinding(b));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /inspecties/:id/bevindingen/:bevId/foto
router.delete("/inspecties/:id/bevindingen/:bevId/foto", requireBevoegdheid("inspecties", 2), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const bevId = parseInt(String(req.params.bevId));
    if (isNaN(id) || isNaN(bevId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

    const { url } = req.body;
    if (!url) { res.status(400).json({ error: "url is verplicht" }); return; }

    const [bev] = await db.select().from(inspectieBevindingen).where(eq(inspectieBevindingen.id, bevId));
    if (!bev) { res.status(404).json({ error: "Bevinding niet gevonden" }); return; }

    let fotos: string[] = [];
    try { fotos = JSON.parse(bev.fotoUrls); } catch { fotos = []; }
    fotos = fotos.filter((f) => f !== url);

    const [b] = await db.update(inspectieBevindingen).set({
      fotoUrls: JSON.stringify(fotos),
      bijgewerktOp: new Date(),
    }).where(eq(inspectieBevindingen.id, bevId)).returning();

    res.json(await mapBevinding(b));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /inspecties/:id/bevindingen/:bevId/herstel
// Maakt een werkbon (onderhoud) aan vanuit de bevinding
router.post("/inspecties/:id/bevindingen/:bevId/herstel", requireBevoegdheid("inspecties", 2), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const bevId = parseInt(String(req.params.bevId));
    if (isNaN(id) || isNaN(bevId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

    const [insp] = await db.select().from(inspectiesTable).where(eq(inspectiesTable.id, id));
    if (!insp) { res.status(404).json({ error: "Inspectie niet gevonden" }); return; }
    if (!(req.permissies!.magBijGebouw(insp.gebouwId))) {
      res.status(403).json({ error: "Geen toegang" }); return;
    }

    const [bev] = await db.select().from(inspectieBevindingen).where(eq(inspectieBevindingen.id, bevId));
    if (!bev) { res.status(404).json({ error: "Bevinding niet gevonden" }); return; }

    const { titel, omschrijving, prioriteit, toegewezen_aan_id } = req.body;

    const [werkbon] = await db.insert(onderhoudTable).values({
      gebouwId: insp.gebouwId!,
      voorzieningId: bev.voorzieningId,
      titel: titel ?? `Herstelwerkzaamheid — inspectie #${id}`,
      omschrijving: omschrijving ?? bev.omschrijving ?? "",
      prioriteit: prioriteit ?? "normaal",
      status: "open",
      toegewezenAanId: toegewezen_aan_id ?? null,
    }).returning();

    await db.update(inspectieBevindingen).set({
      herstellWerkbonId: werkbon.id,
      herstellVereist: true,
      bijgewerktOp: new Date(),
    }).where(eq(inspectieBevindingen.id, bevId));

    await logActiviteit({
      type: "onderhoud_aangemaakt",
      omschrijving: `Herstelwerkbon aangemaakt vanuit inspectie #${id}`,
      gebouwId: insp.gebouwId!,
      voorzieningId: bev.voorzieningId,
      gebruikerId: req.session.userId,
    });

    res.status(201).json({ werkbon_id: werkbon.id, werkbon_titel: werkbon.titel });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /inspecties/:id/herinspectie
router.post("/inspecties/:id/herinspectie", requireBevoegdheid("inspecties", 3), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

    const [insp] = await db.select().from(inspectiesTable).where(eq(inspectiesTable.id, id));
    if (!insp) { res.status(404).json({ error: "Inspectie niet gevonden" }); return; }
    if (!(req.permissies!.magBijGebouw(insp.gebouwId))) {
      res.status(403).json({ error: "Geen toegang" }); return;
    }

    const { inspecteur_id, geplande_datum } = req.body;

    const [nieuw] = await db.insert(inspectiesTable).values({
      type: "herstel",
      gebouwId: insp.gebouwId,
      voorzieningId: insp.voorzieningId,
      inspecteurId: inspecteur_id ?? insp.inspecteurId,
      geplandeDatum: geplande_datum ?? null,
      status: "gepland",
    }).returning();

    await logActiviteit({
      type: "inspectie_aangemaakt",
      omschrijving: `Herinspectie ingepland op basis van inspectie #${id}`,
      gebouwId: insp.gebouwId!,
      gebruikerId: req.session.userId,
    });

    res.status(201).json(await mapInspectie(nieuw));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

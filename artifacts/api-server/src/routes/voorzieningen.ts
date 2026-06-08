import { Router } from "express";
import { db } from "@workspace/db";
import {
  voorzieningenTable,
  fotosTable,
  gebouwenTable,
  verdiepingenTable,
  gebruikersTable,
  inspectiesTable,
  onderhoudTable,
  activiteitenTable,
} from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";

const router = Router();

async function mapVoorziening(v: typeof voorzieningenTable.$inferSelect) {
  const gebouw = v.gebouwId
    ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, v.gebouwId)).then((r) => r[0])
    : null;
  const verdieping = v.verdiepingId
    ? await db.select({ naam: verdiepingenTable.naam }).from(verdiepingenTable).where(eq(verdiepingenTable.id, v.verdiepingId)).then((r) => r[0])
    : null;
  const monteur = v.monteurId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, v.monteurId)).then((r) => r[0])
    : null;
  const controleur = v.controleurId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, v.controleurId)).then((r) => r[0])
    : null;

  return {
    id: v.id,
    objectnummer: v.objectnummer,
    qr_code: v.qrCode,
    type: v.type,
    status: v.status,
    classificatie: v.classificatie,
    gebouw_id: v.gebouwId,
    gebouw_naam: gebouw?.naam ?? null,
    verdieping_id: v.verdiepingId,
    verdieping_naam: verdieping?.naam ?? null,
    ruimte: v.ruimte,
    locatie_omschrijving: v.locatieOmschrijving,
    locatie_x: v.locatieX,
    locatie_y: v.locatieY,
    materialen: v.materialen,
    opmerkingen: v.opmerkingen,
    monteur_id: v.monteurId,
    monteur_naam: monteur?.naam ?? null,
    controleur_id: v.controleurId,
    controleur_naam: controleur?.naam ?? null,
    installatie_datum: v.installatieDatum,
    volgende_inspectie: v.volgendeInspectie,
    aangemaakt_op: v.aangemaaktOp.toISOString(),
    bijgewerkt_op: v.bijgewerktOp.toISOString(),
  };
}

// GET /voorzieningen
router.get("/voorzieningen", async (req, res) => {
  try {
    const { gebouw_id, verdieping_id, type, status, classificatie, zoek, pagina, per_pagina } = req.query;
    let all = await db.select().from(voorzieningenTable);

    if (gebouw_id) all = all.filter((v) => v.gebouwId === parseInt(gebouw_id as string));
    if (verdieping_id) all = all.filter((v) => v.verdiepingId === parseInt(verdieping_id as string));
    if (type) all = all.filter((v) => v.type === type);
    if (status) all = all.filter((v) => v.status === status);
    if (classificatie) all = all.filter((v) => v.classificatie === classificatie);
    if (zoek) {
      const z = (zoek as string).toLowerCase();
      all = all.filter(
        (v) =>
          v.objectnummer.toLowerCase().includes(z) ||
          (v.ruimte ?? "").toLowerCase().includes(z) ||
          (v.materialen ?? "").toLowerCase().includes(z)
      );
    }

    const totaal = all.length;
    const p = parseInt((pagina as string) ?? "1");
    const pp = parseInt((per_pagina as string) ?? "50");
    const paged = all.slice((p - 1) * pp, p * pp);

    const items = await Promise.all(paged.map(mapVoorziening));

    res.json({ items, totaal, pagina: p, per_pagina: pp });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /voorzieningen
router.post("/voorzieningen", async (req, res) => {
  try {
    const {
      objectnummer, qr_code, type, status, classificatie, gebouw_id,
      verdieping_id, ruimte, locatie_omschrijving, locatie_x, locatie_y,
      materialen, opmerkingen, monteur_id, controleur_id,
      installatie_datum, volgende_inspectie,
    } = req.body;

    if (!objectnummer || !type || !gebouw_id) {
      return res.status(400).json({ error: "objectnummer, type en gebouw_id zijn verplicht" });
    }

    const [v] = await db
      .insert(voorzieningenTable)
      .values({
        objectnummer, qrCode: qr_code, type, status: status ?? "concept",
        classificatie: classificatie ?? "60", gebouwId: gebouw_id,
        verdiepingId: verdieping_id, ruimte, locatieOmschrijving: locatie_omschrijving,
        locatieX: locatie_x, locatieY: locatie_y, materialen, opmerkingen,
        monteurId: monteur_id, controleurId: controleur_id,
        installatieDatum: installatie_datum, volgendeInspectie: volgende_inspectie,
      })
      .returning();

    await db.insert(activiteitenTable).values({
      type: "voorziening_aangemaakt",
      omschrijving: `Voorziening ${objectnummer} aangemaakt`,
      gebouwId: gebouw_id,
      voorzieningId: v.id,
      voorzieningNummer: objectnummer,
    });

    res.status(201).json(await mapVoorziening(v));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /voorzieningen/:id
router.get("/voorzieningen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [v] = await db.select().from(voorzieningenTable).where(eq(voorzieningenTable.id, id));
    if (!v) return res.status(404).json({ error: "Voorziening niet gevonden" });

    const fotos = await db.select().from(fotosTable).where(eq(fotosTable.voorzieningId, id));
    const inspecties = await db.select().from(inspectiesTable).where(eq(inspectiesTable.voorzieningId, id));
    const onderhoud = await db.select().from(onderhoudTable).where(eq(onderhoudTable.voorzieningId, id));

    const base = await mapVoorziening(v);

    res.json({
      ...base,
      fotos: fotos.map((f) => ({
        id: f.id,
        voorziening_id: f.voorzieningId,
        fase: f.fase,
        url: f.url,
        beschrijving: f.beschrijving,
        aangemaakt_op: f.aangemaaktOp.toISOString(),
      })),
      inspecties: inspecties.map((i) => ({
        id: i.id,
        voorziening_id: i.voorzieningId,
        gebouw_id: i.gebouwId,
        type: i.type,
        status: i.status,
        geplande_datum: i.geplandeDatum,
        uitgevoerd_datum: i.uitgevoerdDatum,
        bevindingen: i.bevindingen,
        aanbevelingen: i.aanbevelingen,
        aangemaakt_op: i.aangemaaktOp.toISOString(),
      })),
      onderhoud: onderhoud.map((o) => ({
        id: o.id,
        titel: o.titel,
        prioriteit: o.prioriteit,
        status: o.status,
        deadline: o.deadline,
        aangemaakt_op: o.aangemaaktOp.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /voorzieningen/:id
router.patch("/voorzieningen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      objectnummer, qr_code, type, status, classificatie,
      verdieping_id, ruimte, locatie_omschrijving, locatie_x, locatie_y,
      materialen, opmerkingen, monteur_id, controleur_id,
      installatie_datum, volgende_inspectie,
    } = req.body;

    const [v] = await db
      .update(voorzieningenTable)
      .set({
        objectnummer, qrCode: qr_code, type, status, classificatie,
        verdiepingId: verdieping_id, ruimte, locatieOmschrijving: locatie_omschrijving,
        locatieX: locatie_x, locatieY: locatie_y, materialen, opmerkingen,
        monteurId: monteur_id, controleurId: controleur_id,
        installatieDatum: installatie_datum, volgendeInspectie: volgende_inspectie,
        bijgewerktOp: new Date(),
      })
      .where(eq(voorzieningenTable.id, id))
      .returning();

    if (!v) return res.status(404).json({ error: "Voorziening niet gevonden" });
    res.json(await mapVoorziening(v));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /voorzieningen/:id
router.delete("/voorzieningen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(voorzieningenTable).where(eq(voorzieningenTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /voorzieningen/:id/fotos
router.get("/voorzieningen/:id/fotos", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const fotos = await db.select().from(fotosTable).where(eq(fotosTable.voorzieningId, id));
    res.json(
      fotos.map((f) => ({
        id: f.id,
        voorziening_id: f.voorzieningId,
        fase: f.fase,
        url: f.url,
        beschrijving: f.beschrijving,
        aangemaakt_op: f.aangemaaktOp.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /voorzieningen/:id/fotos
router.post("/voorzieningen/:id/fotos", async (req, res) => {
  try {
    const voorzieningId = parseInt(req.params.id);
    const { fase, url, beschrijving } = req.body;
    const [f] = await db
      .insert(fotosTable)
      .values({ voorzieningId, fase, url, beschrijving })
      .returning();
    res.status(201).json({
      id: f.id,
      voorziening_id: f.voorzieningId,
      fase: f.fase,
      url: f.url,
      beschrijving: f.beschrijving,
      aangemaakt_op: f.aangemaaktOp.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /voorzieningen/:id/status
router.patch("/voorzieningen/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, opmerkingen } = req.body;
    const [v] = await db
      .update(voorzieningenTable)
      .set({ status, opmerkingen, bijgewerktOp: new Date() })
      .where(eq(voorzieningenTable.id, id))
      .returning();
    if (!v) return res.status(404).json({ error: "Voorziening niet gevonden" });

    await db.insert(activiteitenTable).values({
      type: "status_gewijzigd",
      omschrijving: `Status van ${v.objectnummer} gewijzigd naar ${status}`,
      gebouwId: v.gebouwId,
      voorzieningId: v.id,
      voorzieningNummer: v.objectnummer,
    });

    res.json(await mapVoorziening(v));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /verdiepingen/:id/voorzieningen
router.get("/verdiepingen/:id/voorzieningen", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const voorzieningen = await db
      .select()
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.verdiepingId, id));

    res.json(
      voorzieningen.map((v) => ({
        id: v.id,
        objectnummer: v.objectnummer,
        type: v.type,
        status: v.status,
        classificatie: v.classificatie,
        ruimte: v.ruimte,
        locatie_x: v.locatieX,
        locatie_y: v.locatieY,
      }))
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

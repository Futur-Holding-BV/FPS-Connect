import { Router } from "express";
import { db } from "@workspace/db";
import { gebouwenTable, verdiepingenTable, voorzieningenTable } from "@workspace/db";
import { eq, ilike, count, and, sql } from "drizzle-orm";

const router = Router();

// GET /gebouwen
router.get("/gebouwen", async (req, res) => {
  try {
    const { zoek, organisatie_id } = req.query;
    const gebouwen = await db.select().from(gebouwenTable);

    const filtered = zoek
      ? gebouwen.filter(
          (g) =>
            g.naam.toLowerCase().includes((zoek as string).toLowerCase()) ||
            g.adres.toLowerCase().includes((zoek as string).toLowerCase())
        )
      : gebouwen;

    const result = await Promise.all(
      filtered.map(async (g) => {
        const [totaal] = await db
          .select({ count: count() })
          .from(voorzieningenTable)
          .where(eq(voorzieningenTable.gebouwId, g.id));
        return {
          id: g.id,
          naam: g.naam,
          adres: g.adres,
          stad: g.stad,
          postcode: g.postcode,
          omschrijving: g.omschrijving,
          bouwjaar: g.bouwjaar,
          totaal_voorzieningen: Number(totaal?.count ?? 0),
          aangemaakt_op: g.aangemaaktOp.toISOString(),
        };
      })
    );

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen
router.post("/gebouwen", async (req, res) => {
  try {
    const { naam, adres, stad, postcode, omschrijving, bouwjaar } = req.body;
    if (!naam || !adres) {
      return res.status(400).json({ error: "naam en adres zijn verplicht" });
    }
    const [gebouw] = await db
      .insert(gebouwenTable)
      .values({ naam, adres, stad, postcode, omschrijving, bouwjaar })
      .returning();
    res.status(201).json({
      id: gebouw.id,
      naam: gebouw.naam,
      adres: gebouw.adres,
      stad: gebouw.stad,
      postcode: gebouw.postcode,
      omschrijving: gebouw.omschrijving,
      bouwjaar: gebouw.bouwjaar,
      totaal_voorzieningen: 0,
      aangemaakt_op: gebouw.aangemaaktOp.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /gebouwen/:id
router.get("/gebouwen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [gebouw] = await db.select().from(gebouwenTable).where(eq(gebouwenTable.id, id));
    if (!gebouw) return res.status(404).json({ error: "Gebouw niet gevonden" });

    const verdiepingen = await db.select().from(verdiepingenTable).where(eq(verdiepingenTable.gebouwId, id));

    const verdiepingenMet = await Promise.all(
      verdiepingen.map(async (v) => {
        const [totaal] = await db
          .select({ count: count() })
          .from(voorzieningenTable)
          .where(eq(voorzieningenTable.verdiepingId, v.id));
        return {
          id: v.id,
          gebouw_id: v.gebouwId,
          naam: v.naam,
          niveau: v.niveau,
          plattegrond_url: v.plattegrondUrl,
          breedte: v.breedte,
          hoogte: v.hoogte,
          totaal_voorzieningen: Number(totaal?.count ?? 0),
        };
      })
    );

    const alleVoorzieningen = await db
      .select({ status: voorzieningenTable.status })
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.gebouwId, id));

    const stats = {
      totaal: alleVoorzieningen.length,
      goedgekeurd: alleVoorzieningen.filter((v) => v.status === "goedgekeurd").length,
      afgekeurd: alleVoorzieningen.filter((v) => v.status === "afgekeurd").length,
      in_bewerking: alleVoorzieningen.filter((v) => v.status === "concept" || v.status === "in_uitvoering").length,
      in_onderhoud: alleVoorzieningen.filter((v) => v.status === "in_onderhoud").length,
    };

    res.json({
      id: gebouw.id,
      naam: gebouw.naam,
      adres: gebouw.adres,
      stad: gebouw.stad,
      postcode: gebouw.postcode,
      omschrijving: gebouw.omschrijving,
      bouwjaar: gebouw.bouwjaar,
      aangemaakt_op: gebouw.aangemaaktOp.toISOString(),
      verdiepingen: verdiepingenMet,
      stats,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /gebouwen/:id
router.patch("/gebouwen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { naam, adres, stad, postcode, omschrijving, bouwjaar } = req.body;
    const [gebouw] = await db
      .update(gebouwenTable)
      .set({ naam, adres, stad, postcode, omschrijving, bouwjaar, bijgewerktOp: new Date() })
      .where(eq(gebouwenTable.id, id))
      .returning();
    if (!gebouw) return res.status(404).json({ error: "Gebouw niet gevonden" });
    const [totaal] = await db
      .select({ count: count() })
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.gebouwId, id));
    res.json({
      id: gebouw.id,
      naam: gebouw.naam,
      adres: gebouw.adres,
      stad: gebouw.stad,
      postcode: gebouw.postcode,
      omschrijving: gebouw.omschrijving,
      bouwjaar: gebouw.bouwjaar,
      totaal_voorzieningen: Number(totaal?.count ?? 0),
      aangemaakt_op: gebouw.aangemaaktOp.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /gebouwen/:id
router.delete("/gebouwen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(gebouwenTable).where(eq(gebouwenTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /gebouwen/:id/verdiepingen
router.get("/gebouwen/:id/verdiepingen", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const verdiepingen = await db.select().from(verdiepingenTable).where(eq(verdiepingenTable.gebouwId, id));
    const result = await Promise.all(
      verdiepingen.map(async (v) => {
        const [totaal] = await db
          .select({ count: count() })
          .from(voorzieningenTable)
          .where(eq(voorzieningenTable.verdiepingId, v.id));
        return {
          id: v.id,
          gebouw_id: v.gebouwId,
          naam: v.naam,
          niveau: v.niveau,
          plattegrond_url: v.plattegrondUrl,
          breedte: v.breedte,
          hoogte: v.hoogte,
          totaal_voorzieningen: Number(totaal?.count ?? 0),
        };
      })
    );
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen/:id/verdiepingen
router.post("/gebouwen/:id/verdiepingen", async (req, res) => {
  try {
    const gebouwId = parseInt(req.params.id);
    const { naam, niveau, plattegrond_url, breedte, hoogte } = req.body;
    const [v] = await db
      .insert(verdiepingenTable)
      .values({ gebouwId, naam, niveau: niveau ?? 0, plattegrondUrl: plattegrond_url, breedte, hoogte })
      .returning();
    res.status(201).json({
      id: v.id,
      gebouw_id: v.gebouwId,
      naam: v.naam,
      niveau: v.niveau,
      plattegrond_url: v.plattegrondUrl,
      breedte: v.breedte,
      hoogte: v.hoogte,
      totaal_voorzieningen: 0,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /verdiepingen/:id
router.get("/verdiepingen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [v] = await db.select().from(verdiepingenTable).where(eq(verdiepingenTable.id, id));
    if (!v) return res.status(404).json({ error: "Verdieping niet gevonden" });
    const [totaal] = await db
      .select({ count: count() })
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.verdiepingId, id));
    res.json({
      id: v.id,
      gebouw_id: v.gebouwId,
      naam: v.naam,
      niveau: v.niveau,
      plattegrond_url: v.plattegrondUrl,
      breedte: v.breedte,
      hoogte: v.hoogte,
      totaal_voorzieningen: Number(totaal?.count ?? 0),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /verdiepingen/:id
router.patch("/verdiepingen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { naam, niveau, plattegrond_url, breedte, hoogte } = req.body;
    const [v] = await db
      .update(verdiepingenTable)
      .set({ naam, niveau, plattegrondUrl: plattegrond_url, breedte, hoogte })
      .where(eq(verdiepingenTable.id, id))
      .returning();
    if (!v) return res.status(404).json({ error: "Verdieping niet gevonden" });
    const [totaal] = await db
      .select({ count: count() })
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.verdiepingId, id));
    res.json({
      id: v.id,
      gebouw_id: v.gebouwId,
      naam: v.naam,
      niveau: v.niveau,
      plattegrond_url: v.plattegrondUrl,
      breedte: v.breedte,
      hoogte: v.hoogte,
      totaal_voorzieningen: Number(totaal?.count ?? 0),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /verdiepingen/:id
router.delete("/verdiepingen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(verdiepingenTable).where(eq(verdiepingenTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

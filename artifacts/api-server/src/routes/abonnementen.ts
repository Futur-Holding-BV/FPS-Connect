import { Router } from "express";
import { db } from "@workspace/db";
import { abonnementenTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const mapAbonnement = (a: typeof abonnementenTable.$inferSelect) => ({
  id: a.id,
  naam: a.naam,
  niveau: a.niveau,
  prijs_per_maand: a.prijsPerMaand,
  max_gebouwen: a.maxGebouwen,
  max_gebruikers: a.maxGebruikers,
  functies: a.functies ?? [],
  klant_naam: a.klantNaam,
  klant_email: a.klantEmail,
  start_datum: a.startDatum,
  eind_datum: a.eindDatum,
  actief: a.actief,
  aangemaakt_op: a.aangemaaktOp.toISOString(),
});

// GET /abonnementen
router.get("/abonnementen", async (req, res) => {
  try {
    const abonnementen = await db.select().from(abonnementenTable);
    res.json(abonnementen.map(mapAbonnement));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /abonnementen
router.post("/abonnementen", async (req, res) => {
  try {
    const { naam, niveau, prijs_per_maand, max_gebouwen, max_gebruikers, functies, klant_naam, klant_email, start_datum, eind_datum } = req.body;
    if (!naam || !niveau) {
      return res.status(400).json({ error: "naam en niveau zijn verplicht" });
    }
    const [a] = await db
      .insert(abonnementenTable)
      .values({
        naam,
        niveau,
        prijsPerMaand: prijs_per_maand ?? 0,
        maxGebouwen: max_gebouwen,
        maxGebruikers: max_gebruikers,
        functies,
        klantNaam: klant_naam,
        klantEmail: klant_email,
        startDatum: start_datum,
        eindDatum: eind_datum,
      })
      .returning();
    res.status(201).json(mapAbonnement(a));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /abonnementen/:id
router.get("/abonnementen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [a] = await db.select().from(abonnementenTable).where(eq(abonnementenTable.id, id));
    if (!a) return res.status(404).json({ error: "Abonnement niet gevonden" });
    res.json(mapAbonnement(a));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /abonnementen/:id
router.patch("/abonnementen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { naam, niveau, prijs_per_maand, max_gebouwen, max_gebruikers, functies, klant_naam, klant_email, start_datum, eind_datum, actief } = req.body;
    const [a] = await db
      .update(abonnementenTable)
      .set({
        naam,
        niveau,
        prijsPerMaand: prijs_per_maand,
        maxGebouwen: max_gebouwen,
        maxGebruikers: max_gebruikers,
        functies,
        klantNaam: klant_naam,
        klantEmail: klant_email,
        startDatum: start_datum,
        eindDatum: eind_datum,
        actief,
        bijgewerktOp: new Date(),
      })
      .where(eq(abonnementenTable.id, id))
      .returning();
    if (!a) return res.status(404).json({ error: "Abonnement niet gevonden" });
    res.json(mapAbonnement(a));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

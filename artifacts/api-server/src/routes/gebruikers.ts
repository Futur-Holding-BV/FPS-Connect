import { Router } from "express";
import { db } from "@workspace/db";
import { gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const mapGebruiker = (g: typeof gebruikersTable.$inferSelect) => ({
  id: g.id,
  naam: g.naam,
  email: g.email,
  rol: g.rol,
  telefoon: g.telefoon,
  bedrijf: g.bedrijf,
  actief: g.actief,
  aangemaakt_op: g.aangemaaktOp.toISOString(),
  laatste_online: g.laatstOnline ? g.laatstOnline.toISOString() : null,
});

// GET /gebruikers
router.get("/gebruikers", async (req, res) => {
  try {
    const gebruikers = await db.select().from(gebruikersTable);
    res.json(gebruikers.map(mapGebruiker));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebruikers
router.post("/gebruikers", async (req, res) => {
  try {
    const { naam, email, rol, telefoon, bedrijf, wachtwoord } = req.body;
    if (!naam || !email || !rol) {
      return res.status(400).json({ error: "naam, email en rol zijn verplicht" });
    }
    const [g] = await db
      .insert(gebruikersTable)
      .values({ naam, email, rol, telefoon, bedrijf, wachtwoord })
      .returning();
    res.status(201).json(mapGebruiker(g));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /gebruikers/:id
router.get("/gebruikers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [g] = await db.select().from(gebruikersTable).where(eq(gebruikersTable.id, id));
    if (!g) return res.status(404).json({ error: "Gebruiker niet gevonden" });
    res.json(mapGebruiker(g));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /gebruikers/:id
router.patch("/gebruikers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { naam, email, rol, telefoon, bedrijf, actief } = req.body;
    const [g] = await db
      .update(gebruikersTable)
      .set({ naam, email, rol, telefoon, bedrijf, actief })
      .where(eq(gebruikersTable.id, id))
      .returning();
    if (!g) return res.status(404).json({ error: "Gebruiker niet gevonden" });
    res.json(mapGebruiker(g));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /gebruikers/:id
router.delete("/gebruikers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(gebruikersTable).where(eq(gebruikersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

import { Router } from "express";
import bcrypt from "bcryptjs";
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
  avatar_url: g.avatarUrl,
  bedrijfslogo_url: g.bedrijfslogoUrl,
  bedrijfskleuren: g.bedrijfskleuren,
  uitnodiging_status: g.uitnodigingStatus,
  uitnodiging_verstuurd_op: g.uitnodigingVerstuurdOp
    ? g.uitnodigingVerstuurdOp.toISOString()
    : null,
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
    const {
      naam, email, rol, telefoon, bedrijf, wachtwoord,
      avatar_url, bedrijfslogo_url, bedrijfskleuren,
    } = req.body;
    if (!naam || !email || !rol) {
      return res.status(400).json({ error: "naam, email en rol zijn verplicht" });
    }
    const gehasht = wachtwoord ? await bcrypt.hash(String(wachtwoord), 10) : null;
    const [g] = await db
      .insert(gebruikersTable)
      .values({
        naam,
        email: String(email).trim().toLowerCase(),
        rol,
        telefoon,
        bedrijf,
        wachtwoord: gehasht,
        avatarUrl: avatar_url,
        bedrijfslogoUrl: bedrijfslogo_url,
        bedrijfskleuren,
        uitnodigingStatus: "niet_uitgenodigd",
      })
      .returning();
    res.status(201).json(mapGebruiker(g));
  } catch (err: any) {
    if (err?.cause?.code === "23505" || err?.message?.includes("gebruikers_email_unique")) {
      return res.status(409).json({ error: "Dit e-mailadres is al in gebruik bij een andere gebruiker." });
    }
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
    const {
      naam, email, rol, telefoon, bedrijf, actief, wachtwoord,
      avatar_url, bedrijfslogo_url, bedrijfskleuren, uitnodiging_status,
    } = req.body;
    const wijziging: Partial<typeof gebruikersTable.$inferInsert> = {
      naam,
      email: email ? String(email).trim().toLowerCase() : undefined,
      rol,
      telefoon,
      bedrijf,
      actief,
      avatarUrl: avatar_url,
      bedrijfslogoUrl: bedrijfslogo_url,
      bedrijfskleuren,
      uitnodigingStatus: uitnodiging_status,
    };
    if (wachtwoord) {
      wijziging.wachtwoord = await bcrypt.hash(String(wachtwoord), 10);
    }
    const [g] = await db
      .update(gebruikersTable)
      .set(wijziging)
      .where(eq(gebruikersTable.id, id))
      .returning();
    if (!g) return res.status(404).json({ error: "Gebruiker niet gevonden" });
    res.json(mapGebruiker(g));
  } catch (err: any) {
    if (err?.cause?.code === "23505" || err?.message?.includes("gebruikers_email_unique")) {
      return res.status(409).json({ error: "Dit e-mailadres is al in gebruik bij een andere gebruiker." });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebruikers/:id/uitnodigen
router.post("/gebruikers/:id/uitnodigen", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [g] = await db
      .update(gebruikersTable)
      .set({
        uitnodigingStatus: "uitgenodigd",
        uitnodigingVerstuurdOp: new Date(),
      })
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

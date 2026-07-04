import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const TALEN = ["nl", "en", "de", "fr", "ar", "tr"] as const;

// GET /uitnodiging/:token — token verifiëren en markeren als geopend (publiek)
router.get("/uitnodiging/:token", async (req, res): Promise<void> => {
  try {
    const { token } = req.params;
    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.uitnodigingToken, token));

    if (!g) {
      return void res.status(404).json({ error: "Uitnodiging niet gevonden" });
    }
    if (g.uitnodigingStatus === "geaccepteerd") {
      return void res.status(409).json({ error: "Account is al geactiveerd" });
    }
    if (g.uitnodigingVerlooptOp && g.uitnodigingVerlooptOp < new Date()) {
      return void res.status(410).json({ error: "Uitnodiging verlopen" });
    }

    if (!g.uitnodigingGeopendOp) {
      await db
        .update(gebruikersTable)
        .set({ uitnodigingGeopendOp: new Date() })
        .where(eq(gebruikersTable.id, g.id));
    }

    res.json({ id: g.id, naam: g.naam, email: g.email });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /uitnodiging/:token/activeren — wachtwoord + taal instellen, 2FA-setup starten (publiek)
router.post("/uitnodiging/:token/activeren", async (req, res): Promise<void> => {
  try {
    const { token } = req.params;
    const { wachtwoord, taal } = req.body ?? {};

    if (!wachtwoord || !taal) {
      return void res.status(400).json({ error: "Wachtwoord en taal zijn verplicht" });
    }
    if (String(wachtwoord).length < 8) {
      return void res.status(400).json({ error: "Wachtwoord moet minimaal 8 tekens bevatten" });
    }
    if (!TALEN.includes(taal as (typeof TALEN)[number])) {
      return void res.status(400).json({ error: "Ongeldige taalcode" });
    }

    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.uitnodigingToken, token));

    if (!g) return void res.status(404).json({ error: "Uitnodiging niet gevonden" });
    if (g.uitnodigingStatus === "geaccepteerd") {
      return void res.status(409).json({ error: "Account is al geactiveerd" });
    }
    if (g.uitnodigingVerlooptOp && g.uitnodigingVerlooptOp < new Date()) {
      return void res.status(410).json({ error: "Uitnodiging verlopen" });
    }

    const gehasht = await bcrypt.hash(String(wachtwoord), 10);

    await db
      .update(gebruikersTable)
      .set({
        wachtwoord: gehasht,
        taal,
        uitnodigingGeopendOp: g.uitnodigingGeopendOp ?? new Date(),
      })
      .where(eq(gebruikersTable.id, g.id));

    req.session.pendingUserId = g.id;
    delete req.session.userId;
    delete req.session.pendingSecret;

    res.json({ status: "setup_2fa" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

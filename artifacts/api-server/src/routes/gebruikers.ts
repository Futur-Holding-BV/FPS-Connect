import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { stuurUitnodigingsmail } from "../services/email";
import { requireRol } from "../middlewares/auth";

const router = Router();

const alleenBeheerder = requireRol("beheerder");

const mapGebruiker = (g: typeof gebruikersTable.$inferSelect) => ({
  id: g.id,
  naam: g.naam,
  email: g.email,
  rol: g.rol,
  functietitel: g.functietitel ?? null,
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
  uitnodiging_verloopt_op: g.uitnodigingVerlooptOp
    ? g.uitnodigingVerlooptOp.toISOString()
    : null,
  uitnodiging_geopend_op: g.uitnodigingGeopendOp
    ? g.uitnodigingGeopendOp.toISOString()
    : null,
  uitnodiging_opnieuw_verstuurd_op: g.uitnodigingOpnieuwVerstuurdOp
    ? g.uitnodigingOpnieuwVerstuurdOp.toISOString()
    : null,
  uitnodiging_geaccepteerd_op: g.uitnodigingGeaccepteerdOp
    ? g.uitnodigingGeaccepteerdOp.toISOString()
    : null,
  taal: g.taal ?? "nl",
});

// Veilige projectie zonder PII voor niet-beheerders: namen/rol blijven zichtbaar
// (nodig voor toewijzings- en naamweergave), maar e-mail, telefoon, bedrijf en
// uitnodigingsgegevens worden weggelaten.
const mapGebruikerPubliek = (g: typeof gebruikersTable.$inferSelect) => ({
  id: g.id,
  naam: g.naam,
  email: "",
  rol: g.rol,
  functietitel: g.functietitel ?? null,
  telefoon: null,
  bedrijf: null,
  actief: g.actief,
  aangemaakt_op: g.aangemaaktOp.toISOString(),
  laatste_online: null,
  avatar_url: g.avatarUrl,
  bedrijfslogo_url: null,
  bedrijfskleuren: null,
  uitnodiging_status: null,
  uitnodiging_verstuurd_op: null,
  uitnodiging_verloopt_op: null,
  uitnodiging_geopend_op: null,
  uitnodiging_opnieuw_verstuurd_op: null,
  uitnodiging_geaccepteerd_op: null,
  taal: g.taal ?? "nl",
});

async function isBeheerder(userId: number | undefined): Promise<boolean> {
  if (!userId) return false;
  const [g] = await db
    .select({ rol: gebruikersTable.rol })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, userId));
  return g?.rol === "beheerder" || g?.rol === "hoofdbeheerder";
}

function domein(): string {
  return (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim() || "localhost";
}

// GET /gebruikers
router.get("/gebruikers", async (req, res) => {
  try {
    const gebruikers = await db.select().from(gebruikersTable);
    const volledig = await isBeheerder(req.session.userId);
    const mapper = volledig ? mapGebruiker : mapGebruikerPubliek;
    res.json(gebruikers.map((g) => mapper(g)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebruikers
router.post("/gebruikers", alleenBeheerder, async (req, res) => {
  try {
    const {
      naam, email, rol, telefoon, bedrijf, wachtwoord,
      avatar_url, bedrijfslogo_url, bedrijfskleuren, taal,
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
        taal: taal || "nl",
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
    const id = parseInt(String(req.params.id), 10);
    const [g] = await db.select().from(gebruikersTable).where(eq(gebruikersTable.id, id));
    if (!g) return res.status(404).json({ error: "Gebruiker niet gevonden" });
    // Beheerders en het eigen account zien volledige gegevens; anderen alleen veilig.
    const volledig = id === req.session.userId || (await isBeheerder(req.session.userId));
    res.json(volledig ? mapGebruiker(g) : mapGebruikerPubliek(g));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /gebruikers/:id
router.patch("/gebruikers/:id", alleenBeheerder, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const {
      naam, email, rol, functietitel, telefoon, bedrijf, actief, wachtwoord,
      avatar_url, bedrijfslogo_url, bedrijfskleuren, uitnodiging_status, taal,
    } = req.body;
    const wijziging: Partial<typeof gebruikersTable.$inferInsert> = {
      naam,
      email: email ? String(email).trim().toLowerCase() : undefined,
      rol,
      functietitel,
      telefoon,
      bedrijf,
      actief,
      avatarUrl: avatar_url,
      bedrijfslogoUrl: bedrijfslogo_url,
      bedrijfskleuren,
      uitnodigingStatus: uitnodiging_status,
      taal,
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

// POST /gebruikers/:id/uitnodigen — eerste uitnodiging sturen
router.post("/gebruikers/:id/uitnodigen", alleenBeheerder, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [bestaande] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, id));
    if (!bestaande) return res.status(404).json({ error: "Gebruiker niet gevonden" });

    const token = crypto.randomBytes(32).toString("hex");
    const verlooptOp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const activatieLink = `https://${domein()}/uitnodiging/${token}`;

    // Eerst proberen te versturen; alleen bij een echte verzendfout afbreken
    // zodat de status niet ten onrechte op "uitgenodigd" komt te staan.
    try {
      await stuurUitnodigingsmail({
        naarEmail: bestaande.email,
        naarNaam: bestaande.naam,
        activatieLink,
      });
    } catch (mailErr) {
      req.log.error(mailErr, "Uitnodigingsmail mislukt");
      return res.status(502).json({
        error: "De uitnodiging kon niet worden verzonden. Probeer het later opnieuw.",
      });
    }

    const [g] = await db
      .update(gebruikersTable)
      .set({
        uitnodigingStatus: "uitgenodigd",
        uitnodigingVerstuurdOp: new Date(),
        uitnodigingToken: token,
        uitnodigingVerlooptOp: verlooptOp,
        uitnodigingGeopendOp: null,
        uitnodigingOpnieuwVerstuurdOp: null,
      })
      .where(eq(gebruikersTable.id, id))
      .returning();

    res.json(mapGebruiker(g));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebruikers/:id/uitnodigen/opnieuw — herinnering sturen
router.post("/gebruikers/:id/uitnodigen/opnieuw", alleenBeheerder, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [bestaande] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, id));
    if (!bestaande) return res.status(404).json({ error: "Gebruiker niet gevonden" });
    if (bestaande.uitnodigingStatus === "geaccepteerd") {
      return res.status(400).json({ error: "Gebruiker heeft de uitnodiging al geaccepteerd" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const verlooptOp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const activatieLink = `https://${domein()}/uitnodiging/${token}`;

    try {
      await stuurUitnodigingsmail({
        naarEmail: bestaande.email,
        naarNaam: bestaande.naam,
        activatieLink,
        isOpnieuw: true,
      });
    } catch (mailErr) {
      req.log.error(mailErr, "Uitnodigingsmail (opnieuw) mislukt");
      return res.status(502).json({
        error: "De herinnering kon niet worden verzonden. Probeer het later opnieuw.",
      });
    }

    const [g] = await db
      .update(gebruikersTable)
      .set({
        uitnodigingStatus: "uitgenodigd",
        uitnodigingOpnieuwVerstuurdOp: new Date(),
        uitnodigingToken: token,
        uitnodigingVerlooptOp: verlooptOp,
      })
      .where(eq(gebruikersTable.id, id))
      .returning();

    res.json(mapGebruiker(g));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /gebruikers/:id
router.delete("/gebruikers/:id", alleenBeheerder, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    await db.delete(gebruikersTable).where(eq(gebruikersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

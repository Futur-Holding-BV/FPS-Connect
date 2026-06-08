import { Router } from "express";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { db, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const ISSUER = "FPS Brandpreventie";

authenticator.options = { window: 1 };

const mapAuthGebruiker = (g: typeof gebruikersTable.$inferSelect) => ({
  id: g.id,
  naam: g.naam,
  email: g.email,
  rol: g.rol,
  avatar_url: g.avatarUrl ?? null,
  bedrijfskleuren: g.bedrijfskleuren ?? null,
});

const schoonCode = (code: unknown) => String(code ?? "").replace(/\s+/g, "");

// POST /auth/login — stap 1: e-mail + wachtwoord
router.post("/auth/login", async (req, res) => {
  try {
    const { email, wachtwoord } = req.body ?? {};
    if (!email || !wachtwoord) {
      return res.status(400).json({ error: "E-mail en wachtwoord zijn verplicht" });
    }
    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.email, String(email).trim().toLowerCase()));
    if (!g || !g.actief || !g.wachtwoord) {
      return res.status(401).json({ error: "Onjuiste inloggegevens" });
    }
    const ok = await bcrypt.compare(String(wachtwoord), g.wachtwoord);
    if (!ok) {
      return res.status(401).json({ error: "Onjuiste inloggegevens" });
    }
    req.session.pendingUserId = g.id;
    delete req.session.userId;
    delete req.session.pendingSecret;
    if (g.tweeFactorIngeschakeld && g.totpSecret) {
      return res.json({ status: "verify_2fa" });
    }
    return res.json({ status: "setup_2fa" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /auth/2fa/setup — genereer secret + QR voor eerste inrichting
router.post("/auth/2fa/setup", async (req, res) => {
  try {
    const pendingId = req.session.pendingUserId;
    if (!pendingId) {
      return res.status(401).json({ error: "Geen actieve inlogpoging" });
    }
    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, pendingId));
    if (!g) {
      return res.status(404).json({ error: "Gebruiker niet gevonden" });
    }
    const secret = authenticator.generateSecret();
    req.session.pendingSecret = secret;
    const otpauthUrl = authenticator.keyuri(g.email, ISSUER, secret);
    const qrCode = await QRCode.toDataURL(otpauthUrl);
    res.json({ secret, qr_code: qrCode, otpauth_url: otpauthUrl });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /auth/2fa/activeren — bevestig eerste code en schakel 2FA in
router.post("/auth/2fa/activeren", async (req, res) => {
  try {
    const pendingId = req.session.pendingUserId;
    const secret = req.session.pendingSecret;
    const code = schoonCode(req.body?.code);
    if (!pendingId || !secret) {
      return res.status(401).json({ error: "Geen actieve inrichting" });
    }
    if (!code) {
      return res.status(400).json({ error: "Code is verplicht" });
    }
    if (!authenticator.check(code, secret)) {
      return res.status(401).json({ error: "Onjuiste code, probeer opnieuw" });
    }
    const [g] = await db
      .update(gebruikersTable)
      .set({
        totpSecret: secret,
        tweeFactorIngeschakeld: true,
        laatstOnline: new Date(),
        uitnodigingStatus: "geaccepteerd",
      })
      .where(eq(gebruikersTable.id, pendingId))
      .returning();
    req.session.userId = pendingId;
    delete req.session.pendingUserId;
    delete req.session.pendingSecret;
    res.json(mapAuthGebruiker(g));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /auth/2fa/verify — stap 2 bij bestaande 2FA
router.post("/auth/2fa/verify", async (req, res) => {
  try {
    const pendingId = req.session.pendingUserId;
    const code = schoonCode(req.body?.code);
    if (!pendingId) {
      return res.status(401).json({ error: "Geen actieve inlogpoging" });
    }
    if (!code) {
      return res.status(400).json({ error: "Code is verplicht" });
    }
    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, pendingId));
    if (!g || !g.totpSecret) {
      return res.status(401).json({ error: "Tweestapsverificatie niet ingericht" });
    }
    if (!authenticator.check(code, g.totpSecret)) {
      return res.status(401).json({ error: "Onjuiste code, probeer opnieuw" });
    }
    await db
      .update(gebruikersTable)
      .set({ laatstOnline: new Date(), uitnodigingStatus: "geaccepteerd" })
      .where(eq(gebruikersTable.id, g.id));
    req.session.userId = g.id;
    delete req.session.pendingUserId;
    delete req.session.pendingSecret;
    res.json(mapAuthGebruiker(g));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /auth/logout
router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("fps.sid");
    res.status(204).send();
  });
});

// POST /auth/wachtwoord-wijzigen
router.post("/auth/wachtwoord-wijzigen", async (req, res) => {
  try {
    const id = req.session.userId;
    if (!id) {
      return res.status(401).json({ error: "Niet ingelogd" });
    }
    const { huidig_wachtwoord, nieuw_wachtwoord } = req.body ?? {};
    if (!huidig_wachtwoord || !nieuw_wachtwoord) {
      return res.status(400).json({ error: "Huidig en nieuw wachtwoord zijn verplicht" });
    }
    if (String(nieuw_wachtwoord).length < 8) {
      return res.status(400).json({ error: "Nieuw wachtwoord moet minimaal 8 tekens bevatten" });
    }
    const [g] = await db.select().from(gebruikersTable).where(eq(gebruikersTable.id, id));
    if (!g || !g.wachtwoord) {
      return res.status(404).json({ error: "Gebruiker niet gevonden" });
    }
    const klopt = await bcrypt.compare(String(huidig_wachtwoord), g.wachtwoord);
    if (!klopt) {
      return res.status(400).json({ error: "Huidig wachtwoord is onjuist" });
    }
    const gehasht = await bcrypt.hash(String(nieuw_wachtwoord), 10);
    await db
      .update(gebruikersTable)
      .set({ wachtwoord: gehasht })
      .where(eq(gebruikersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /auth/me
router.get("/auth/me", async (req, res) => {
  try {
    const id = req.session.userId;
    if (!id) {
      return res.status(401).json({ error: "Niet ingelogd" });
    }
    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, id));
    if (!g || !g.actief) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Niet ingelogd" });
    }
    res.json(mapAuthGebruiker(g));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

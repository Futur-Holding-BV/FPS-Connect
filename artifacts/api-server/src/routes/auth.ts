import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { db, gebruikersTable, wachtwoordResetTokensTable } from "@workspace/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import { maakToken } from "../lib/token";
import { legLoginPogingVast } from "./systeem";
import { verstuurWachtwoordResetMail } from "../services/email.js";

const router = Router();

function domein(): string {
  return (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim() || "localhost";
}

const ISSUER = "FPS Brandpreventie";

authenticator.options = { window: 1 };

const TALEN = ["nl", "en", "de", "fr", "ar", "tr"] as const;

const mapAuthGebruiker = (g: typeof gebruikersTable.$inferSelect) => ({
  id: g.id,
  naam: g.naam,
  email: g.email,
  rol: g.rol,
  avatar_url: g.avatarUrl ?? null,
  bedrijfskleuren: g.bedrijfskleuren ?? null,
  taal: g.taal ?? "nl",
  functietitels: g.functietitels ?? [],
  bevoegdheden: (g.bevoegdheden as Record<string, number>) ?? {},
  is_hoofdtester: g.isHoofdtester ?? false,
});

const schoonCode = (code: unknown) => String(code ?? "").replace(/\s+/g, "");

function verzoekIp(req: { ip?: string }): string | null {
  // De app draait achter de Replit-proxy met `trust proxy` = 1, dus Express
  // resolvet req.ip betrouwbaar uit de vertrouwde proxy-keten. Handmatige
  // X-Forwarded-For-parsing is bewust vermeden omdat die header spoofbaar is.
  return req.ip ?? null;
}
function verzoekUserAgent(req: { headers: Record<string, unknown> }): string | null {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua : null;
}

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
      await legLoginPogingVast({
        gebruikerId: g?.id ?? null,
        email: String(email).trim().toLowerCase(),
        ip: verzoekIp(req),
        userAgent: verzoekUserAgent(req),
        gelukt: false,
      });
      return res.status(401).json({ error: "Onjuiste inloggegevens" });
    }
    const ok = await bcrypt.compare(String(wachtwoord), g.wachtwoord);
    if (!ok) {
      await legLoginPogingVast({
        gebruikerId: g.id,
        email: g.email,
        ip: verzoekIp(req),
        userAgent: verzoekUserAgent(req),
        gelukt: false,
      });
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
        uitnodigingGeaccepteerdOp: new Date(),
      })
      .where(eq(gebruikersTable.id, pendingId))
      .returning();
    req.session.userId = pendingId;
    delete req.session.pendingUserId;
    delete req.session.pendingSecret;
    const risico = await legLoginPogingVast({
      gebruikerId: g!.id,
      email: g!.email,
      ip: verzoekIp(req),
      userAgent: verzoekUserAgent(req),
      gelukt: true,
    });
    res.json({ ...mapAuthGebruiker(g), nieuw_apparaat: risico.nieuwApparaat, nieuw_ip: risico.nieuwIp });
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
      await legLoginPogingVast({
        gebruikerId: g.id,
        email: g.email,
        ip: verzoekIp(req),
        userAgent: verzoekUserAgent(req),
        gelukt: false,
      });
      return res.status(401).json({ error: "Onjuiste code, probeer opnieuw" });
    }
    await db
      .update(gebruikersTable)
      .set({
        laatstOnline: new Date(),
        uitnodigingStatus: "geaccepteerd",
        uitnodigingGeaccepteerdOp: g.uitnodigingGeaccepteerdOp ?? new Date(),
      })
      .where(eq(gebruikersTable.id, g.id));
    req.session.userId = g.id;
    delete req.session.pendingUserId;
    delete req.session.pendingSecret;
    const risico = await legLoginPogingVast({
      gebruikerId: g.id,
      email: g.email,
      ip: verzoekIp(req),
      userAgent: verzoekUserAgent(req),
      gelukt: true,
    });
    res.json({ ...mapAuthGebruiker(g), nieuw_apparaat: risico.nieuwApparaat, nieuw_ip: risico.nieuwIp });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /auth/mobile/login — login in één stap voor de mobiele monteur-app
// (e-mail + wachtwoord + bestaande TOTP-code). Retourneert een bearer-token.
router.post("/auth/mobile/login", async (req, res) => {
  try {
    const { email, wachtwoord, code } = req.body ?? {};
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
    if (!g.tweeFactorIngeschakeld || !g.totpSecret) {
      return res.status(403).json({
        error:
          "Tweestapsverificatie is nog niet ingericht. Log eerst in via de webportal om dit te activeren.",
      });
    }
    const ingevoerdeCode = schoonCode(code);
    if (!ingevoerdeCode) {
      return res
        .status(401)
        .json({ error: "Authenticatiecode is verplicht", status: "verify_2fa" });
    }
    if (!authenticator.check(ingevoerdeCode, g.totpSecret)) {
      return res
        .status(401)
        .json({ error: "Onjuiste code, probeer opnieuw", status: "verify_2fa" });
    }
    await db
      .update(gebruikersTable)
      .set({ laatstOnline: new Date() })
      .where(eq(gebruikersTable.id, g.id));
    const token = maakToken(g.id);
    return res.json({ token, gebruiker: mapAuthGebruiker(g) });
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

// POST /auth/wachtwoord-vergeten — publiek; altijd 204 (geen e-mail-enumeratie)
router.post("/auth/wachtwoord-vergeten", async (req, res) => {
  try {
    const { email } = req.body ?? {};
    if (!email) return res.status(204).send();

    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.email, String(email).trim().toLowerCase()))
      .limit(1);

    if (!g || !g.actief) return res.status(204).send();

    // Genereer een cryptografisch veilige token (32 bytes = 64 hex-tekens)
    const token = crypto.randomBytes(32).toString("hex");
    const verlooptOp = new Date(Date.now() + 60 * 60 * 1000); // 1 uur

    await db.insert(wachtwoordResetTokensTable).values({
      gebruikerId: g.id,
      token,
      verlooptOp,
    });

    const resetLink = `https://${domein()}/wachtwoord-reset?token=${token}`;

    try {
      await verstuurWachtwoordResetMail({
        naarEmail: g.email,
        naarNaam: g.naam,
        resetLink,
      });
    } catch {
      // Mail kan niet geblokkeerd zijn — route geeft altijd 204 terug
      req.log.warn({ email: g.email }, "Wachtwoord-reset mail kon niet worden verstuurd");
    }

    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "POST /auth/wachtwoord-vergeten");
    return res.status(204).send();
  }
});

// POST /auth/wachtwoord-reset — publiek; token + nieuw wachtwoord
router.post("/auth/wachtwoord-reset", async (req, res) => {
  try {
    const { token, nieuw_wachtwoord } = req.body ?? {};
    if (!token || !nieuw_wachtwoord) {
      return res.status(400).json({ error: "Token en nieuw wachtwoord zijn verplicht" });
    }
    if (String(nieuw_wachtwoord).length < 8) {
      return res.status(400).json({ error: "Wachtwoord moet minimaal 8 tekens bevatten" });
    }

    const now = new Date();
    const [resetToken] = await db
      .select()
      .from(wachtwoordResetTokensTable)
      .where(
        and(
          eq(wachtwoordResetTokensTable.token, String(token)),
          gt(wachtwoordResetTokensTable.verlooptOp, now),
          isNull(wachtwoordResetTokensTable.gebruiktOp),
        ),
      )
      .limit(1);

    if (!resetToken) {
      return res.status(400).json({ error: "De resetlink is ongeldig of verlopen" });
    }

    const gehasht = await bcrypt.hash(String(nieuw_wachtwoord), 10);

    await db
      .update(gebruikersTable)
      .set({ wachtwoord: gehasht })
      .where(eq(gebruikersTable.id, resetToken.gebruikerId));

    await db
      .update(wachtwoordResetTokensTable)
      .set({ gebruiktOp: now })
      .where(eq(wachtwoordResetTokensTable.id, resetToken.id));

    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "POST /auth/wachtwoord-reset");
    return res.status(500).json({ error: "Onbekende fout" });
  }
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

// POST /auth/taal — eigen taalvoorkeur wijzigen
router.post("/auth/taal", async (req, res) => {
  try {
    const id = req.session.userId;
    if (!id) {
      return res.status(401).json({ error: "Niet ingelogd" });
    }
    const taal = String(req.body?.taal ?? "");
    if (!TALEN.includes(taal as (typeof TALEN)[number])) {
      return res.status(400).json({ error: "Ongeldige taalcode" });
    }
    const [g] = await db
      .update(gebruikersTable)
      .set({ taal })
      .where(eq(gebruikersTable.id, id))
      .returning();
    if (!g) {
      return res.status(404).json({ error: "Gebruiker niet gevonden" });
    }
    res.json(mapAuthGebruiker(g));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /auth/pwa-qr — QR-code afbeelding voor PWA-installatie (alleen ingelogd)
router.get("/auth/pwa-qr", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Niet ingelogd" });
    const domeinen = (process.env.REPLIT_DOMAINS ?? "").split(",").map((d) => d.trim()).filter(Boolean);
    const domein = domeinen[0] ?? req.get("host") ?? "";
    const url = domein ? `https://${domein}/connect/planning` : "/connect/planning";
    const qrBuffer = await QRCode.toBuffer(url, {
      type: "png",
      width: 360,
      margin: 2,
      color: { dark: "#212631", light: "#FFFFFF" },
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(qrBuffer);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /auth/pwa-url — geeft de PWA-URL als JSON terug
router.get("/auth/pwa-url", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Niet ingelogd" });
    const domeinen = (process.env.REPLIT_DOMAINS ?? "").split(",").map((d) => d.trim()).filter(Boolean);
    const domein = domeinen[0] ?? req.get("host") ?? "";
    const url = domein ? `https://${domein}/connect/planning` : "/connect/planning";
    res.json({ url });
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

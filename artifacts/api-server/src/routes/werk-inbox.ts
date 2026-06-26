import { Router } from "express";
import { db } from "@workspace/db";
import {
  werkInboxTokensTable,
  werkInboxMailboxenTable,
  werkInboxMailsTable,
  werkInboxNotitiesTable,
  werkInboxKoppelingenTable,
  WERK_INBOX_ENTITY_TYPES,
  type WerkInboxEntityType,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  isGeconfigureerd,
  bouwAuthUrl,
  maakOAuthState,
  verifyOAuthState,
  slaTokenOp,
  verwijderToken,
  haalMicrosoftEmail,
  syncMailboxen,
  haalVolledigeMail,
  markeerGelezen,
  GeenToegang,
  type TokenResponse,
} from "../services/werkInboxGraph";
import { logger } from "../lib/logger";

const router = Router();

function redirectUri(req: { protocol: string; get: (h: string) => string | undefined }): string {
  const env = process.env["AZURE_REDIRECT_URI"];
  if (env) return env;
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "localhost";
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  return `${proto}://${host}/api/werk-inbox/oauth/callback`;
}

function gebruikerId(req: import("express").Request): number {
  return (req.session as unknown as { userId: number }).userId;
}

// ─── OAuth start ──────────────────────────────────────────────────────────────
router.get("/werk-inbox/oauth/start", requireAuth, (req, res) => {
  if (!isGeconfigureerd()) {
    res.status(503).json({ error: "Microsoft 365 is niet geconfigureerd op deze omgeving." });
    return;
  }
  const state = maakOAuthState(gebruikerId(req));
  const url   = bouwAuthUrl(redirectUri(req), state);
  res.redirect(url);
});

// ─── OAuth callback ───────────────────────────────────────────────────────────
router.get("/werk-inbox/oauth/callback", async (req, res) => {
  const { code, state, error: msError } = req.query as Record<string, string>;

  if (msError) {
    req.log.warn({ msError }, "werk-inbox: OAuth geweigerd door gebruiker");
    res.redirect("/werk-inbox?ms_error=geweigerd");
    return;
  }

  if (!code || !state) {
    res.redirect("/werk-inbox?ms_error=ontbrekende_params");
    return;
  }

  const uid = verifyOAuthState(state);
  if (!uid) {
    res.redirect("/werk-inbox?ms_error=ongeldige_state");
    return;
  }

  if (!isGeconfigureerd()) {
    res.redirect("/werk-inbox?ms_error=niet_geconfigureerd");
    return;
  }

  try {
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${process.env["AZURE_TENANT_ID"]}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id:     process.env["AZURE_CLIENT_ID_NEW"]!,
          client_secret: process.env["AZURE_CLIENT_SECRET"]!,
          code,
          redirect_uri:  redirectUri(req),
          grant_type:    "authorization_code",
        }).toString(),
      },
    );

    if (!tokenRes.ok) {
      req.log.error({ status: tokenRes.status }, "werk-inbox: token exchange mislukt");
      res.redirect("/werk-inbox?ms_error=token_mislukt");
      return;
    }

    const tokens = (await tokenRes.json()) as TokenResponse;

    const email = await haalMicrosoftEmail(tokens.access_token);
    await slaTokenOp(uid, tokens, email);

    res.redirect("/werk-inbox?ms_gekoppeld=1");
  } catch (err) {
    req.log.error({ err }, "werk-inbox: OAuth callback fout");
    res.redirect("/werk-inbox?ms_error=onbekend");
  }
});

// ─── Status ───────────────────────────────────────────────────────────────────
router.get("/werk-inbox/oauth/status", requireAuth, async (req, res) => {
  const uid = gebruikerId(req);
  const [token] = await db.select({
    microsoftEmail: werkInboxTokensTable.microsoftEmail,
    verlooptOp:     werkInboxTokensTable.verlooptOp,
  })
    .from(werkInboxTokensTable)
    .where(eq(werkInboxTokensTable.gebruikerId, uid))
    .limit(1);

  if (!token) {
    res.json({ gekoppeld: false });
    return;
  }
  res.json({ gekoppeld: true, email: token.microsoftEmail, verlooptOp: token.verlooptOp });
});

// ─── Ontkoppelen ──────────────────────────────────────────────────────────────
router.delete("/werk-inbox/oauth/ontkoppel", requireAuth, async (req, res) => {
  await verwijderToken(gebruikerId(req));
  res.json({ ok: true });
});

// ─── Mailboxen ────────────────────────────────────────────────────────────────
router.get("/werk-inbox/mailboxen", requireAuth, async (req, res) => {
  const rijen = await db.select()
    .from(werkInboxMailboxenTable)
    .where(eq(werkInboxMailboxenTable.gebruikerId, gebruikerId(req)))
    .orderBy(werkInboxMailboxenTable.volgorde);
  res.json(rijen);
});

router.post("/werk-inbox/mailboxen", requireAuth, async (req, res) => {
  const uid = gebruikerId(req);
  const { emailAdres, label } = req.body as { emailAdres?: string; label?: string };
  if (!emailAdres || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAdres)) {
    res.status(400).json({ error: "Ongeldig e-mailadres." });
    return;
  }
  try {
    const [rij] = await db.insert(werkInboxMailboxenTable)
      .values({ gebruikerId: uid, emailAdres: emailAdres.toLowerCase(), label: label ?? null })
      .returning();
    res.status(201).json(rij);
  } catch {
    res.status(409).json({ error: "Deze mailbox is al toegevoegd." });
  }
});

router.patch("/werk-inbox/mailboxen/:id", requireAuth, async (req, res) => {
  const uid = gebruikerId(req);
  const id = Number(req.params["id"]);
  const { label, actief, volgorde } = req.body as { label?: string; actief?: boolean; volgorde?: number };
  const [rij] = await db.update(werkInboxMailboxenTable)
    .set({
      ...(label !== undefined && { label }),
      ...(actief !== undefined && { actief }),
      ...(volgorde !== undefined && { volgorde }),
    })
    .where(and(eq(werkInboxMailboxenTable.id, id), eq(werkInboxMailboxenTable.gebruikerId, uid)))
    .returning();
  if (!rij) { res.status(404).json({ error: "Niet gevonden." }); return; }
  res.json(rij);
});

router.delete("/werk-inbox/mailboxen/:id", requireAuth, async (req, res) => {
  const uid = gebruikerId(req);
  const id = Number(req.params["id"]);
  await db.delete(werkInboxMailboxenTable)
    .where(and(eq(werkInboxMailboxenTable.id, id), eq(werkInboxMailboxenTable.gebruikerId, uid)));
  res.json({ ok: true });
});

// ─── Sync ─────────────────────────────────────────────────────────────────────
router.post("/werk-inbox/sync", requireAuth, async (req, res) => {
  const uid = gebruikerId(req);
  try {
    const resultaat = await syncMailboxen(uid);
    res.json(resultaat);
  } catch (err) {
    if (err instanceof GeenToegang) {
      res.status(403).json({ error: `Geen toegang tot mailbox: ${err.mailbox}` });
      return;
    }
    req.log.error({ err }, "werk-inbox: sync fout");
    res.status(500).json({ error: "Synchronisatie mislukt." });
  }
});

// ─── Mails ophalen ────────────────────────────────────────────────────────────
router.get("/werk-inbox/mails", requireAuth, async (req, res) => {
  const uid = gebruikerId(req);
  const { mailbox, ongelezen, vandaag, bijlage } = req.query as Record<string, string>;

  const filters = [eq(werkInboxMailsTable.gebruikerId, uid)];

  if (mailbox) {
    filters.push(eq(werkInboxMailsTable.mailboxAdres, mailbox));
  }
  if (ongelezen === "true") {
    filters.push(eq(werkInboxMailsTable.isGelezenMs, false));
  }
  if (vandaag === "true") {
    const gisteren = new Date();
    gisteren.setHours(0, 0, 0, 0);
    filters.push(sql`${werkInboxMailsTable.ontvangenOp} >= ${gisteren.toISOString()}`);
  }
  if (bijlage === "true") {
    filters.push(eq(werkInboxMailsTable.heeftBijlage, true));
  }

  // Filter: niet verwerkt? Optioneel; we tonen alles maar geven verwerkt_op mee.
  const mails = await db.select()
    .from(werkInboxMailsTable)
    .where(and(...filters))
    .orderBy(desc(werkInboxMailsTable.ontvangenOp))
    .limit(200);

  // Notities en koppelingen aantallen meegeven
  const messageIds = mails.map((m) => m.messageId);
  if (messageIds.length === 0) {
    res.json(mails.map((m) => ({ ...m, notitie_aantal: 0, koppeling_aantal: 0 })));
    return;
  }

  const notitieAantallen = await db.select({
    messageId: werkInboxNotitiesTable.messageId,
    aantal:    sql<number>`count(*)::int`,
  })
    .from(werkInboxNotitiesTable)
    .where(eq(werkInboxNotitiesTable.gebruikerId, uid))
    .groupBy(werkInboxNotitiesTable.messageId);

  const koppelingAantallen = await db.select({
    messageId: werkInboxKoppelingenTable.messageId,
    aantal:    sql<number>`count(*)::int`,
  })
    .from(werkInboxKoppelingenTable)
    .where(eq(werkInboxKoppelingenTable.gebruikerId, uid))
    .groupBy(werkInboxKoppelingenTable.messageId);

  const notitieMap = Object.fromEntries(notitieAantallen.map((n) => [n.messageId, n.aantal]));
  const koppelingMap = Object.fromEntries(koppelingAantallen.map((k) => [k.messageId, k.aantal]));

  res.json(mails.map((m) => ({
    ...m,
    notitie_aantal:   notitieMap[m.messageId] ?? 0,
    koppeling_aantal: koppelingMap[m.messageId] ?? 0,
  })));
});

// ─── Volledige mail inhoud (on-demand van Graph) ──────────────────────────────
router.get("/werk-inbox/mails/:messageId", requireAuth, async (req, res) => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);

  // Zoek de mail in onze metadata om mailbox te weten
  const [meta] = await db.select()
    .from(werkInboxMailsTable)
    .where(and(
      eq(werkInboxMailsTable.gebruikerId, uid),
      eq(werkInboxMailsTable.messageId, messageId),
    ))
    .limit(1);

  if (!meta) {
    res.status(404).json({ error: "Mail niet gevonden." });
    return;
  }

  const [tokenRecord] = await db.select({ microsoftEmail: werkInboxTokensTable.microsoftEmail })
    .from(werkInboxTokensTable)
    .where(eq(werkInboxTokensTable.gebruikerId, uid))
    .limit(1);

  const isPersonlijk = !tokenRecord || meta.mailboxAdres === tokenRecord.microsoftEmail;

  const inhoud = await haalVolledigeMail(uid, meta.mailboxAdres, messageId, isPersonlijk);
  if (!inhoud) {
    res.status(502).json({ error: "Mail kon niet worden opgehaald van Microsoft 365." });
    return;
  }

  // Notities + koppelingen meegeven
  const notities    = await db.select().from(werkInboxNotitiesTable)
    .where(and(eq(werkInboxNotitiesTable.gebruikerId, uid), eq(werkInboxNotitiesTable.messageId, messageId)))
    .orderBy(desc(werkInboxNotitiesTable.aangemaaktOp));

  const koppelingen = await db.select().from(werkInboxKoppelingenTable)
    .where(and(eq(werkInboxKoppelingenTable.gebruikerId, uid), eq(werkInboxKoppelingenTable.messageId, messageId)))
    .orderBy(desc(werkInboxKoppelingenTable.aangemaaktOp));

  res.json({ meta, inhoud, notities, koppelingen });
});

// ─── Gelezen markeren ─────────────────────────────────────────────────────────
router.patch("/werk-inbox/mails/:messageId/gelezen", requireAuth, async (req, res) => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);
  const { isGelezen } = req.body as { isGelezen: boolean };

  const [meta] = await db.select()
    .from(werkInboxMailsTable)
    .where(and(eq(werkInboxMailsTable.gebruikerId, uid), eq(werkInboxMailsTable.messageId, messageId)))
    .limit(1);

  if (!meta) { res.status(404).json({ error: "Niet gevonden." }); return; }

  const [tokenRecord] = await db.select({ microsoftEmail: werkInboxTokensTable.microsoftEmail })
    .from(werkInboxTokensTable)
    .where(eq(werkInboxTokensTable.gebruikerId, uid))
    .limit(1);

  const isPersonlijk = !tokenRecord || meta.mailboxAdres === tokenRecord.microsoftEmail;

  // Update in Graph (best-effort)
  await markeerGelezen(uid, meta.mailboxAdres, messageId, isPersonlijk, isGelezen).catch((err) =>
    logger.warn({ err }, "werk-inbox: markeerGelezen Graph call mislukt"),
  );

  // Update lokaal
  await db.update(werkInboxMailsTable)
    .set({ isGelezenMs: isGelezen, bijgewerktOp: new Date() })
    .where(and(eq(werkInboxMailsTable.gebruikerId, uid), eq(werkInboxMailsTable.messageId, messageId)));

  res.json({ ok: true });
});

// ─── Verwerkt markeren ────────────────────────────────────────────────────────
router.patch("/werk-inbox/mails/:messageId/verwerkt", requireAuth, async (req, res) => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);
  const { verwerkt } = req.body as { verwerkt: boolean };

  const [rij] = await db.update(werkInboxMailsTable)
    .set({
      verwerktOp:   verwerkt ? new Date() : null,
      bijgewerktOp: new Date(),
    })
    .where(and(eq(werkInboxMailsTable.gebruikerId, uid), eq(werkInboxMailsTable.messageId, messageId)))
    .returning();

  if (!rij) { res.status(404).json({ error: "Niet gevonden." }); return; }
  res.json({ ok: true, verwerktOp: rij.verwerktOp });
});

// ─── Notities ────────────────────────────────────────────────────────────────
router.post("/werk-inbox/mails/:messageId/notities", requireAuth, async (req, res) => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);
  const { tekst } = req.body as { tekst?: string };

  if (!tekst?.trim()) {
    res.status(400).json({ error: "Tekst mag niet leeg zijn." });
    return;
  }

  const [rij] = await db.insert(werkInboxNotitiesTable)
    .values({ messageId, gebruikerId: uid, tekst: tekst.trim() })
    .returning();

  res.status(201).json(rij);
});

router.patch("/werk-inbox/notities/:id", requireAuth, async (req, res) => {
  const uid = gebruikerId(req);
  const id  = parseInt(String(req.params.id), 10);
  const { tekst } = req.body as { tekst?: string };

  if (!tekst?.trim()) { res.status(400).json({ error: "Tekst mag niet leeg zijn." }); return; }

  const [rij] = await db.update(werkInboxNotitiesTable)
    .set({ tekst: tekst.trim(), bijgewerktOp: new Date() })
    .where(and(eq(werkInboxNotitiesTable.id, id), eq(werkInboxNotitiesTable.gebruikerId, uid)))
    .returning();

  if (!rij) { res.status(404).json({ error: "Niet gevonden." }); return; }
  res.json(rij);
});

router.delete("/werk-inbox/notities/:id", requireAuth, async (req, res) => {
  const uid = gebruikerId(req);
  const id  = parseInt(String(req.params.id), 10);
  await db.delete(werkInboxNotitiesTable)
    .where(and(eq(werkInboxNotitiesTable.id, id), eq(werkInboxNotitiesTable.gebruikerId, uid)));
  res.json({ ok: true });
});

// ─── Koppelingen ──────────────────────────────────────────────────────────────
router.post("/werk-inbox/mails/:messageId/koppelingen", requireAuth, async (req, res) => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);
  const { entityType, entityId, entityLabel } = req.body as {
    entityType?: string;
    entityId?:   number;
    entityLabel?: string;
  };

  if (!entityType || !WERK_INBOX_ENTITY_TYPES.includes(entityType as WerkInboxEntityType)) {
    res.status(400).json({ error: `Ongeldig entity type. Kies uit: ${WERK_INBOX_ENTITY_TYPES.join(", ")}` });
    return;
  }
  if (!entityId || isNaN(entityId)) {
    res.status(400).json({ error: "entityId is verplicht." });
    return;
  }

  try {
    const [rij] = await db.insert(werkInboxKoppelingenTable)
      .values({ messageId, gebruikerId: uid, entityType, entityId, entityLabel: entityLabel ?? null })
      .returning();
    res.status(201).json(rij);
  } catch {
    res.status(409).json({ error: "Deze koppeling bestaat al." });
  }
});

router.delete("/werk-inbox/koppelingen/:id", requireAuth, async (req, res) => {
  const uid = gebruikerId(req);
  const id  = parseInt(String(req.params.id), 10);
  await db.delete(werkInboxKoppelingenTable)
    .where(and(eq(werkInboxKoppelingenTable.id, id), eq(werkInboxKoppelingenTable.gebruikerId, uid)));
  res.json({ ok: true });
});

export default router;

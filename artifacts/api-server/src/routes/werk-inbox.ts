// MAIL_01 — de mailomgeving als samenwerkomgeving.
//
// Twee lagen (opdracht §2):
//   Laag 1 (Exchange) — wie de mailbox technisch mag openen. Dat is Microsoft
//   365; Connect toont dit alleen (exchange-status), beheert het nooit.
//   Laag 2 (Connect)  — wie de mailbox in de werkinbox ziet en wat hij mag.
//   Dat staat in werk_inbox_mailbox_toegang (lezen < behandelen < beheren).
//
// Berichten, notities en koppelingen zijn gedeelde toestand per mailbox.
// Tokens blijven per gebruiker: elke gebruiker meldt zich zelf aan bij
// Microsoft (opdracht §3).

import { Router } from "express";
import { db } from "@workspace/db";
import {
  werkInboxTokensTable,
  werkInboxMailboxenTable,
  werkInboxMailboxToegangTable,
  werkInboxMailsTable,
  werkInboxNotitiesTable,
  werkInboxKoppelingenTable,
  gebruikersTable,
  WERK_INBOX_ENTITY_TYPES,
  WERK_INBOX_RECHTEN,
  WERK_INBOX_MODI,
  WERK_INBOX_STATUSSEN,
  type WerkInboxEntityType,
  type WerkInboxRecht,
  type WerkInboxModus,
  type WerkInboxStatus,
  crmContactpersonenTable,
  crmKlantenTable,
} from "@workspace/db";
import { eq, and, or, desc, sql, inArray, isNull, gte, lt, isNotNull } from "drizzle-orm";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
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
  verplaatsMail,
  archiveerMail,
  beantwoordMail,
  verstuurNieuwDelegatedMail,
  probeExchangeToegang,
  GeenToegang,
  type TokenResponse,
} from "../services/werkInboxGraph";
import {
  rechtDekt,
  isHoofdbeheerder,
  haalRecht,
  toegankelijkeMailboxen,
  rechtOpMailboxAdres,
  meldAanwezigheid,
  leesAanwezigheid,
} from "../services/werkInboxToegang";
import { logger } from "../lib/logger";
import { verwerkFactuurmails } from "../services/factuurstroomService";
import { verwerkAanvraagmails } from "../services/aanvraagstroomService";

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

async function gebruikersNaam(uid: number): Promise<string> {
  const [g] = await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable)
    .where(eq(gebruikersTable.id, uid)).limit(1);
  return g?.naam ?? `Gebruiker ${uid}`;
}

/**
 * Zoekt een bericht op messageId en bepaalt het effectieve recht van de
 * gebruiker via de mailbox van dat bericht. Fail-closed: geen mailbox of geen
 * toegang → null (naar buiten toe niet te onderscheiden van "bestaat niet").
 */
async function vindMailMetToegang(uid: number, messageId: string, vereist: WerkInboxRecht) {
  const kandidaten = await db.select().from(werkInboxMailsTable)
    .where(eq(werkInboxMailsTable.messageId, messageId));
  for (const mail of kandidaten) {
    const t = await rechtOpMailboxAdres(uid, mail.mailboxAdres);
    if (t && rechtDekt(t.recht, vereist)) return { mail, mailbox: t.mailbox, recht: t.recht };
  }
  return null;
}

/** Persoonlijke mailbox van een zojuist gekoppeld Microsoft-account als organisatiemailbox registreren. */
async function zorgPersoonlijkeMailbox(uid: number, email: string): Promise<void> {
  const adres = email.toLowerCase();
  const [bestaand] = await db.select({ id: werkInboxMailboxenTable.id }).from(werkInboxMailboxenTable)
    .where(eq(werkInboxMailboxenTable.emailAdres, adres)).limit(1);
  let mailboxId = bestaand?.id;
  if (!mailboxId) {
    const [rij] = await db.insert(werkInboxMailboxenTable)
      .values({ emailAdres: adres, label: "Persoonlijke mailbox", modus: "ondersteunen" })
      .onConflictDoNothing().returning();
    mailboxId = rij?.id;
  }
  if (mailboxId) {
    await db.insert(werkInboxMailboxToegangTable)
      .values({ mailboxId, gebruikerId: uid, recht: "beheren" })
      .onConflictDoNothing();
  }
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
router.get("/werk-inbox/oauth/callback", async (req, res): Promise<void> => {
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
    await zorgPersoonlijkeMailbox(uid, email);

    res.redirect("/werk-inbox?ms_gekoppeld=1");
  } catch (err) {
    req.log.error({ err }, "werk-inbox: OAuth callback fout");
    res.redirect("/werk-inbox?ms_error=onbekend");
  }
});

// ─── Status ───────────────────────────────────────────────────────────────────
router.get("/werk-inbox/oauth/status", requireAuth, async (req, res): Promise<void> => {
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
router.delete("/werk-inbox/oauth/ontkoppel", requireAuth, async (req, res): Promise<void> => {
  await verwijderToken(gebruikerId(req));
  res.json({ ok: true });
});

// ─── Mailboxen: wat mag ik zien ───────────────────────────────────────────────
router.get("/werk-inbox/mailboxen", requireAuth, async (req, res): Promise<void> => {
  const rijen = await toegankelijkeMailboxen(gebruikerId(req));
  res.json(rijen);
});

// ─── Mailbox toevoegen (beheerscherm; opdracht §6) ───────────────────────────
router.post("/werk-inbox/mailboxen", requireAuth, async (req, res): Promise<void> => {
  const uid = gebruikerId(req);
  if (!(await isHoofdbeheerder(uid))) {
    res.status(403).json({ error: "Alleen de hoofdbeheerder kan mailboxen toevoegen." });
    return;
  }
  const { emailAdres, label, modus } = req.body as { emailAdres?: string; label?: string; modus?: string };
  if (!emailAdres || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAdres)) {
    res.status(400).json({ error: "Ongeldig e-mailadres." });
    return;
  }
  if (modus !== undefined && !WERK_INBOX_MODI.includes(modus as WerkInboxModus)) {
    res.status(400).json({ error: `Ongeldige modus. Kies uit: ${WERK_INBOX_MODI.join(", ")}` });
    return;
  }
  try {
    const [rij] = await db.insert(werkInboxMailboxenTable)
      .values({ emailAdres: emailAdres.toLowerCase(), label: label ?? null, modus: (modus as WerkInboxModus | undefined) ?? "ondersteunen" })
      .returning();
    res.status(201).json(rij);
  } catch {
    res.status(409).json({ error: "Deze mailbox bestaat al." });
  }
});

router.patch("/werk-inbox/mailboxen/:id", requireAuth, async (req, res): Promise<void> => {
  const uid = gebruikerId(req);
  const id = Number(req.params["id"]);
  const recht = await haalRecht(uid, id);
  if (!rechtDekt(recht, "beheren")) {
    res.status(recht ? 403 : 404).json({ error: recht ? "Hiervoor is het recht Beheren op deze mailbox nodig." : "Niet gevonden." });
    return;
  }
  const { label, actief, volgorde, modus, isFactuurmailbox, isAanvraagmailbox } = req.body as {
    label?: string; actief?: boolean; volgorde?: number; modus?: string;
    isFactuurmailbox?: boolean; isAanvraagmailbox?: boolean;
  };
  if (modus !== undefined && !WERK_INBOX_MODI.includes(modus as WerkInboxModus)) {
    res.status(400).json({ error: `Ongeldige modus. Kies uit: ${WERK_INBOX_MODI.join(", ")}` });
    return;
  }
  const [rij] = await db.update(werkInboxMailboxenTable)
    .set({
      ...(label !== undefined && { label }),
      ...(actief !== undefined && { actief }),
      ...(volgorde !== undefined && { volgorde }),
      ...(modus !== undefined && { modus: modus as WerkInboxModus }),
      ...(isFactuurmailbox !== undefined && { isFactuurmailbox }),
      ...(isAanvraagmailbox !== undefined && { isAanvraagmailbox }),
    })
    .where(eq(werkInboxMailboxenTable.id, id))
    .returning();
  if (!rij) { res.status(404).json({ error: "Niet gevonden." }); return; }
  res.json(rij);
});

router.delete("/werk-inbox/mailboxen/:id", requireAuth, async (req, res): Promise<void> => {
  const uid = gebruikerId(req);
  if (!(await isHoofdbeheerder(uid))) {
    res.status(403).json({ error: "Alleen de hoofdbeheerder kan mailboxen verwijderen." });
    return;
  }
  await db.delete(werkInboxMailboxenTable).where(eq(werkInboxMailboxenTable.id, Number(req.params["id"])));
  res.json({ ok: true });
});

// ─── Toegang per mailbox (opdracht §3/§6) ────────────────────────────────────
router.get("/werk-inbox/mailboxen/:id/toegang", requireAuth, async (req, res): Promise<void> => {
  const uid = gebruikerId(req);
  const id = Number(req.params["id"]);
  const recht = await haalRecht(uid, id);
  if (!recht) { res.status(404).json({ error: "Niet gevonden." }); return; }
  const leden = await db.select({
    id:          werkInboxMailboxToegangTable.id,
    gebruikerId: werkInboxMailboxToegangTable.gebruikerId,
    recht:       werkInboxMailboxToegangTable.recht,
    naam:        gebruikersTable.naam,
    email:       gebruikersTable.email,
  })
    .from(werkInboxMailboxToegangTable)
    .innerJoin(gebruikersTable, eq(gebruikersTable.id, werkInboxMailboxToegangTable.gebruikerId))
    .where(eq(werkInboxMailboxToegangTable.mailboxId, id))
    .orderBy(gebruikersTable.naam);
  res.json(leden);
});

router.post("/werk-inbox/mailboxen/:id/toegang", requireAuth, async (req, res): Promise<void> => {
  const uid = gebruikerId(req);
  const id = Number(req.params["id"]);
  const mijnRecht = await haalRecht(uid, id);
  if (!rechtDekt(mijnRecht, "beheren")) {
    res.status(mijnRecht ? 403 : 404).json({ error: mijnRecht ? "Hiervoor is het recht Beheren op deze mailbox nodig." : "Niet gevonden." });
    return;
  }
  const { gebruikerId: doelUid, recht } = req.body as { gebruikerId?: number; recht?: string };
  if (!doelUid || !Number.isInteger(doelUid)) { res.status(400).json({ error: "gebruikerId is verplicht." }); return; }
  if (!recht || !WERK_INBOX_RECHTEN.includes(recht as WerkInboxRecht)) {
    res.status(400).json({ error: `Ongeldig recht. Kies uit: ${WERK_INBOX_RECHTEN.join(", ")}` });
    return;
  }
  const [gebruiker] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable)
    .where(eq(gebruikersTable.id, doelUid)).limit(1);
  if (!gebruiker) { res.status(404).json({ error: "Gebruiker niet gevonden." }); return; }
  const [rij] = await db.insert(werkInboxMailboxToegangTable)
    .values({ mailboxId: id, gebruikerId: doelUid, recht: recht as WerkInboxRecht })
    .onConflictDoUpdate({
      target: [werkInboxMailboxToegangTable.mailboxId, werkInboxMailboxToegangTable.gebruikerId],
      set: { recht: recht as WerkInboxRecht },
    })
    .returning();
  res.status(201).json(rij);
});

router.delete("/werk-inbox/mailboxen/:id/toegang/:gebruikerId", requireAuth, async (req, res): Promise<void> => {
  const uid = gebruikerId(req);
  const id = Number(req.params["id"]);
  const mijnRecht = await haalRecht(uid, id);
  if (!rechtDekt(mijnRecht, "beheren")) {
    res.status(mijnRecht ? 403 : 404).json({ error: mijnRecht ? "Hiervoor is het recht Beheren op deze mailbox nodig." : "Niet gevonden." });
    return;
  }
  await db.delete(werkInboxMailboxToegangTable).where(and(
    eq(werkInboxMailboxToegangTable.mailboxId, id),
    eq(werkInboxMailboxToegangTable.gebruikerId, Number(req.params["gebruikerId"])),
  ));
  res.json({ ok: true });
});

// ─── Exchange-toegang tonen, niet beheren (opdracht §2) ──────────────────────
router.get("/werk-inbox/mailboxen/:id/exchange-status", requireAuth, async (req, res): Promise<void> => {
  const uid = gebruikerId(req);
  const id = Number(req.params["id"]);
  const mijnRecht = await haalRecht(uid, id);
  if (!rechtDekt(mijnRecht, "beheren")) {
    res.status(mijnRecht ? 403 : 404).json({ error: mijnRecht ? "Hiervoor is het recht Beheren op deze mailbox nodig." : "Niet gevonden." });
    return;
  }
  const [mailbox] = await db.select().from(werkInboxMailboxenTable)
    .where(eq(werkInboxMailboxenTable.id, id)).limit(1);
  if (!mailbox) { res.status(404).json({ error: "Niet gevonden." }); return; }

  const leden = await db.select({
    gebruikerId: werkInboxMailboxToegangTable.gebruikerId,
    recht:       werkInboxMailboxToegangTable.recht,
    naam:        gebruikersTable.naam,
    microsoftEmail: werkInboxTokensTable.microsoftEmail,
  })
    .from(werkInboxMailboxToegangTable)
    .innerJoin(gebruikersTable, eq(gebruikersTable.id, werkInboxMailboxToegangTable.gebruikerId))
    .leftJoin(werkInboxTokensTable, eq(werkInboxTokensTable.gebruikerId, werkInboxMailboxToegangTable.gebruikerId))
    .where(eq(werkInboxMailboxToegangTable.mailboxId, id));

  const resultaten = [];
  for (const lid of leden) {
    if (!lid.microsoftEmail) {
      resultaten.push({ gebruikerId: lid.gebruikerId, naam: lid.naam, recht: lid.recht, exchange: "geen_koppeling" as const });
      continue;
    }
    const isPersonlijk = lid.microsoftEmail.toLowerCase() === mailbox.emailAdres;
    const status = await probeExchangeToegang(lid.gebruikerId, mailbox.emailAdres, isPersonlijk);
    resultaten.push({ gebruikerId: lid.gebruikerId, naam: lid.naam, recht: lid.recht, exchange: status });
  }
  res.json({ mailbox: mailbox.emailAdres, leden: resultaten });
});

// ─── Reactietijd per mailbox (opdracht §5.5) ─────────────────────────────────
router.get("/werk-inbox/mailboxen/:id/reactietijd", requireAuth, async (req, res): Promise<void> => {
  const uid = gebruikerId(req);
  const id = Number(req.params["id"]);
  const recht = await haalRecht(uid, id);
  if (!recht) { res.status(404).json({ error: "Niet gevonden." }); return; }
  const [mailbox] = await db.select().from(werkInboxMailboxenTable)
    .where(eq(werkInboxMailboxenTable.id, id)).limit(1);
  if (!mailbox) { res.status(404).json({ error: "Niet gevonden." }); return; }

  const dertigDagen = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [gemiddelde] = await db.select({
    gemiddeldeUren: sql<number | null>`avg(extract(epoch from (${werkInboxMailsTable.beantwoordOp} - ${werkInboxMailsTable.ontvangenOp})) / 3600.0)`,
    aantalBeantwoord: sql<number>`count(*)::int`,
  })
    .from(werkInboxMailsTable)
    .where(and(
      eq(werkInboxMailsTable.mailboxAdres, mailbox.emailAdres),
      isNotNull(werkInboxMailsTable.beantwoordOp),
      gte(werkInboxMailsTable.ontvangenOp, dertigDagen),
    ));

  const teLangGrens = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const teLang = await db.select({
    messageId:   werkInboxMailsTable.messageId,
    onderwerp:   werkInboxMailsTable.onderwerp,
    afzenderEmail: werkInboxMailsTable.afzenderEmail,
    ontvangenOp: werkInboxMailsTable.ontvangenOp,
    samenwerkStatus: werkInboxMailsTable.samenwerkStatus,
  })
    .from(werkInboxMailsTable)
    .where(and(
      eq(werkInboxMailsTable.mailboxAdres, mailbox.emailAdres),
      inArray(werkInboxMailsTable.samenwerkStatus, ["open", "toegewezen"]),
      lt(werkInboxMailsTable.ontvangenOp, teLangGrens),
    ))
    .orderBy(werkInboxMailsTable.ontvangenOp)
    .limit(10);

  res.json({
    mailbox: mailbox.emailAdres,
    gemiddeldeReactieUren: gemiddelde?.gemiddeldeUren != null ? Math.round(Number(gemiddelde.gemiddeldeUren) * 10) / 10 : null,
    aantalBeantwoord30d: gemiddelde?.aantalBeantwoord ?? 0,
    ligtTeLang: teLang,
  });
});

// ─── Sync ─────────────────────────────────────────────────────────────────────
router.post("/werk-inbox/sync", requireAuth, async (req, res): Promise<void> => {
  const uid = gebruikerId(req);
  try {
    const resultaat = await syncMailboxen(uid);
    // FACTUUR_02 §1: de factuurpijplijn draait automatisch mee met elke sync —
    // niemand hoeft per mail op "analyseer" te klikken.
    verwerkFactuurmails(uid).catch((err) => req.log.error({ err }, "factuurstroom: pijplijn na sync mislukt"));
    // AANVRAAG_01: de aanvraagpijplijn draait automatisch mee — zelfde intake-mechanisme.
    verwerkAanvraagmails(uid).catch((err) => req.log.error({ err }, "aanvraagstroom: pijplijn na sync mislukt"));
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
router.get("/werk-inbox/mails", requireAuth, async (req, res): Promise<void> => {
  const uid = gebruikerId(req);
  const { mailbox, ongelezen, vandaag, bijlage, status, toegewezen } = req.query as Record<string, string>;

  // Alleen mailboxen waar deze gebruiker toegang toe heeft (acceptatie 2).
  const toegankelijk = await toegankelijkeMailboxen(uid);
  const adressen = toegankelijk.map((m) => m.emailAdres);
  if (adressen.length === 0) { res.json([]); return; }

  const filters = [inArray(werkInboxMailsTable.mailboxAdres, adressen)];

  if (mailbox) {
    const gevraagd = mailbox.toLowerCase();
    if (!adressen.includes(gevraagd)) { res.json([]); return; }
    filters.push(eq(werkInboxMailsTable.mailboxAdres, gevraagd));
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
  if (status && WERK_INBOX_STATUSSEN.includes(status as WerkInboxStatus)) {
    filters.push(eq(werkInboxMailsTable.samenwerkStatus, status));
  }
  if (toegewezen === "mij") {
    filters.push(eq(werkInboxMailsTable.toegewezenAan, uid));
  }

  const mails = await db.select({
    mail: werkInboxMailsTable,
    toegewezenNaam: gebruikersTable.naam,
  })
    .from(werkInboxMailsTable)
    .leftJoin(gebruikersTable, eq(gebruikersTable.id, werkInboxMailsTable.toegewezenAan))
    .where(and(...filters))
    .orderBy(desc(werkInboxMailsTable.ontvangenOp))
    .limit(200);

  const messageIds = mails.map((m) => m.mail.messageId);
  if (messageIds.length === 0) { res.json([]); return; }

  // Gedeelde notitie-/koppeling-aantallen per bericht (niet per gebruiker).
  // Mailbox-scoping (migratie 0010): tel alleen rijen van dezelfde mailbox als
  // het bericht (NULL = legacy-rij van vóór de backfill, telt overal mee).
  const mailboxAdressen = [...new Set(mails.map((m) => m.mail.mailboxAdres))];
  const scopeNotitie = or(
    inArray(werkInboxNotitiesTable.mailboxAdres, mailboxAdressen),
    isNull(werkInboxNotitiesTable.mailboxAdres),
  );
  const scopeKoppeling = or(
    inArray(werkInboxKoppelingenTable.mailboxAdres, mailboxAdressen),
    isNull(werkInboxKoppelingenTable.mailboxAdres),
  );

  const notitieAantallen = await db.select({
    messageId: werkInboxNotitiesTable.messageId,
    aantal:    sql<number>`count(*)::int`,
  })
    .from(werkInboxNotitiesTable)
    .where(and(inArray(werkInboxNotitiesTable.messageId, messageIds), scopeNotitie))
    .groupBy(werkInboxNotitiesTable.messageId);

  const koppelingAantallen = await db.select({
    messageId: werkInboxKoppelingenTable.messageId,
    aantal:    sql<number>`count(*)::int`,
  })
    .from(werkInboxKoppelingenTable)
    .where(and(inArray(werkInboxKoppelingenTable.messageId, messageIds), scopeKoppeling))
    .groupBy(werkInboxKoppelingenTable.messageId);

  const notitieMap = Object.fromEntries(notitieAantallen.map((n) => [n.messageId, n.aantal]));
  const koppelingMap = Object.fromEntries(koppelingAantallen.map((k) => [k.messageId, k.aantal]));

  res.json(mails.map(({ mail: m, toegewezenNaam }) => ({
    ...m,
    toegewezen_naam:  toegewezenNaam,
    notitie_aantal:   notitieMap[m.messageId] ?? 0,
    koppeling_aantal: koppelingMap[m.messageId] ?? 0,
  })));
});

/** Bepaal met wiens token we Graph benaderen: eigen token als dat er is, anders dat van de synchroniserende collega. */
async function graphContext(uid: number, mail: { gebruikerId: number; mailboxAdres: string }) {
  const [eigenToken] = await db.select({ microsoftEmail: werkInboxTokensTable.microsoftEmail })
    .from(werkInboxTokensTable).where(eq(werkInboxTokensTable.gebruikerId, uid)).limit(1);
  const viaUid = eigenToken ? uid : mail.gebruikerId;
  const [tokenRecord] = eigenToken
    ? [eigenToken]
    : await db.select({ microsoftEmail: werkInboxTokensTable.microsoftEmail })
        .from(werkInboxTokensTable).where(eq(werkInboxTokensTable.gebruikerId, viaUid)).limit(1);
  const isPersonlijk = tokenRecord?.microsoftEmail?.toLowerCase() === mail.mailboxAdres;
  return { viaUid, isPersonlijk };
}

// ─── Volledige mail inhoud (on-demand van Graph) ──────────────────────────────
router.get("/werk-inbox/mails/:messageId", requireAuth, async (req, res): Promise<void> => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);

  const gevonden = await vindMailMetToegang(uid, messageId, "lezen");
  if (!gevonden) { res.status(404).json({ error: "Mail niet gevonden." }); return; }
  const meta = gevonden.mail;

  // Inhoud is best-effort: als Graph faalt (geen token / geen Exchange-toegang)
  // blijven meta, samenwerking en interne opmerkingen gewoon bruikbaar — de
  // samenwerkomgeving mag niet onbereikbaar worden door een Microsoft-storing.
  const { viaUid, isPersonlijk } = await graphContext(uid, meta);
  const inhoud = await haalVolledigeMail(viaUid, meta.mailboxAdres, messageId, isPersonlijk);
  const inhoudWaarschuwing = inhoud
    ? null
    : "Mailinhoud kon niet worden opgehaald van Microsoft 365. Controleer of uw account Exchange-toegang tot deze mailbox heeft.";

  // Gedeelde notities + koppelingen, met auteursnaam.
  const notities = await db.select({
    id: werkInboxNotitiesTable.id,
    messageId: werkInboxNotitiesTable.messageId,
    gebruikerId: werkInboxNotitiesTable.gebruikerId,
    tekst: werkInboxNotitiesTable.tekst,
    aangemaaktOp: werkInboxNotitiesTable.aangemaaktOp,
    bijgewerktOp: werkInboxNotitiesTable.bijgewerktOp,
    auteurNaam: gebruikersTable.naam,
  })
    .from(werkInboxNotitiesTable)
    .leftJoin(gebruikersTable, eq(gebruikersTable.id, werkInboxNotitiesTable.gebruikerId))
    .where(and(
      eq(werkInboxNotitiesTable.messageId, messageId),
      or(eq(werkInboxNotitiesTable.mailboxAdres, meta.mailboxAdres), isNull(werkInboxNotitiesTable.mailboxAdres)),
    ))
    .orderBy(desc(werkInboxNotitiesTable.aangemaaktOp));

  const koppelingen = await db.select().from(werkInboxKoppelingenTable)
    .where(and(
      eq(werkInboxKoppelingenTable.messageId, messageId),
      or(eq(werkInboxKoppelingenTable.mailboxAdres, meta.mailboxAdres), isNull(werkInboxKoppelingenTable.mailboxAdres)),
    ))
    .orderBy(desc(werkInboxKoppelingenTable.aangemaaktOp));

  // Aanwezigheid: dit bericht staat nu open bij deze gebruiker (opdracht §5.2).
  meldAanwezigheid(messageId, uid, await gebruikersNaam(uid), "bekijkt");
  const anderen = leesAanwezigheid(messageId, uid);

  res.json({
    meta,
    inhoud: inhoud ?? {},
    inhoud_waarschuwing: inhoudWaarschuwing,
    notities,
    koppelingen,
    aanwezigheid: anderen,
    mijn_recht: gevonden.recht,
    mailbox_modus: gevonden.mailbox.modus,
  });
});

// ─── Aanwezigheid (opdracht §5.2) ────────────────────────────────────────────
router.post("/werk-inbox/mails/:messageId/aanwezigheid", requireAuth, async (req, res): Promise<void> => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);
  const { activiteit } = req.body as { activiteit?: string };
  if (!activiteit || !["bekijkt", "typt", "weg"].includes(activiteit)) {
    res.status(400).json({ error: "activiteit moet 'bekijkt', 'typt' of 'weg' zijn." });
    return;
  }
  const gevonden = await vindMailMetToegang(uid, messageId, "lezen");
  if (!gevonden) { res.status(404).json({ error: "Mail niet gevonden." }); return; }
  meldAanwezigheid(messageId, uid, await gebruikersNaam(uid), activiteit as "bekijkt" | "typt" | "weg");
  res.json({ aanwezigheid: leesAanwezigheid(messageId, uid) });
});

// ─── Toewijzen (opdracht §5.1) ───────────────────────────────────────────────
router.patch("/werk-inbox/mails/:messageId/toewijzen", requireAuth, async (req, res): Promise<void> => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);
  const { gebruikerId: doelUid, verwachtToegewezenAan } = req.body as {
    gebruikerId?: number | null;
    /** Optioneel: wie de client dénkt dat nu toegewezen is. Bij mismatch → 409 (review MAIL_01: geen stille last-write-wins tussen behandelaren). */
    verwachtToegewezenAan?: number | null;
  };

  const gevonden = await vindMailMetToegang(uid, messageId, "behandelen");
  if (!gevonden) { res.status(404).json({ error: "Mail niet gevonden." }); return; }

  if (verwachtToegewezenAan !== undefined && (gevonden.mail.toegewezenAan ?? null) !== verwachtToegewezenAan) {
    res.status(409).json({
      error: "Een collega heeft de toewijzing zojuist gewijzigd. De actuele stand is opnieuw geladen.",
      toegewezenAan: gevonden.mail.toegewezenAan,
      samenwerkStatus: gevonden.mail.samenwerkStatus,
    });
    return;
  }

  if (doelUid != null) {
    // Toewijzen kan alleen aan iemand die de mailbox ook echt kan behandelen.
    const doelRecht = await haalRecht(doelUid, gevonden.mailbox.id);
    if (!rechtDekt(doelRecht, "behandelen")) {
      res.status(422).json({ error: "Deze gebruiker heeft geen behandelrecht op deze mailbox." });
      return;
    }
  }

  const [rij] = await db.update(werkInboxMailsTable)
    .set({
      toegewezenAan: doelUid ?? null,
      samenwerkStatus: doelUid != null
        ? "toegewezen"
        : (gevonden.mail.samenwerkStatus === "toegewezen" ? "open" : gevonden.mail.samenwerkStatus),
      bijgewerktOp: new Date(),
    })
    .where(and(
      eq(werkInboxMailsTable.mailboxAdres, gevonden.mail.mailboxAdres),
      eq(werkInboxMailsTable.messageId, messageId),
    ))
    .returning();
  res.json({ ok: true, toegewezenAan: rij?.toegewezenAan ?? null, samenwerkStatus: rij?.samenwerkStatus });
});

// ─── Gezamenlijke status (opdracht §5.4) ─────────────────────────────────────
router.patch("/werk-inbox/mails/:messageId/status", requireAuth, async (req, res): Promise<void> => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);
  const { status, verwachteStatus } = req.body as {
    status?: string;
    /** Optioneel: de status die de client nu toont. Bij mismatch → 409 (review MAIL_01). */
    verwachteStatus?: string;
  };
  if (!status || !WERK_INBOX_STATUSSEN.includes(status as WerkInboxStatus)) {
    res.status(400).json({ error: `Ongeldige status. Kies uit: ${WERK_INBOX_STATUSSEN.join(", ")}` });
    return;
  }
  const gevonden = await vindMailMetToegang(uid, messageId, "behandelen");
  if (!gevonden) { res.status(404).json({ error: "Mail niet gevonden." }); return; }

  if (verwachteStatus !== undefined && gevonden.mail.samenwerkStatus !== verwachteStatus) {
    res.status(409).json({
      error: "Een collega heeft de status zojuist gewijzigd. De actuele stand is opnieuw geladen.",
      toegewezenAan: gevonden.mail.toegewezenAan,
      samenwerkStatus: gevonden.mail.samenwerkStatus,
    });
    return;
  }

  const [rij] = await db.update(werkInboxMailsTable)
    .set({
      samenwerkStatus: status as WerkInboxStatus,
      afgehandeldOp: status === "afgehandeld" ? new Date() : null,
      ...(status === "open" && { toegewezenAan: null }),
      bijgewerktOp: new Date(),
    })
    .where(and(
      eq(werkInboxMailsTable.mailboxAdres, gevonden.mail.mailboxAdres),
      eq(werkInboxMailsTable.messageId, messageId),
    ))
    .returning();
  res.json({ ok: true, samenwerkStatus: rij?.samenwerkStatus });
});

// ─── Gelezen markeren ─────────────────────────────────────────────────────────
router.patch("/werk-inbox/mails/:messageId/gelezen", requireAuth, async (req, res): Promise<void> => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);
  const { isGelezen } = req.body as { isGelezen: boolean };

  const gevonden = await vindMailMetToegang(uid, messageId, "behandelen");
  if (!gevonden) { res.status(404).json({ error: "Niet gevonden." }); return; }
  const meta = gevonden.mail;

  const { viaUid, isPersonlijk } = await graphContext(uid, meta);
  await markeerGelezen(viaUid, meta.mailboxAdres, messageId, isPersonlijk, isGelezen).catch((err) =>
    logger.warn({ err }, "werk-inbox: markeerGelezen Graph call mislukt"),
  );

  await db.update(werkInboxMailsTable)
    .set({ isGelezenMs: isGelezen, bijgewerktOp: new Date() })
    .where(and(eq(werkInboxMailsTable.mailboxAdres, meta.mailboxAdres), eq(werkInboxMailsTable.messageId, messageId)));

  res.json({ ok: true });
});

// ─── Verwerkt markeren ────────────────────────────────────────────────────────
router.patch("/werk-inbox/mails/:messageId/verwerkt", requireAuth, async (req, res): Promise<void> => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);
  const { verwerkt } = req.body as { verwerkt: boolean };

  const gevonden = await vindMailMetToegang(uid, messageId, "behandelen");
  if (!gevonden) { res.status(404).json({ error: "Niet gevonden." }); return; }

  const [rij] = await db.update(werkInboxMailsTable)
    .set({ verwerktOp: verwerkt ? new Date() : null, bijgewerktOp: new Date() })
    .where(and(
      eq(werkInboxMailsTable.mailboxAdres, gevonden.mail.mailboxAdres),
      eq(werkInboxMailsTable.messageId, messageId),
    ))
    .returning();
  res.json({ ok: true, verwerktOp: rij?.verwerktOp ?? null });
});

// ─── Interne opmerkingen (opdracht §5.3) ─────────────────────────────────────
// Gedeeld per bericht, met auteur. Gaan NOOIT naar buiten: er is geen enkel
// pad van dit veld naar een Graph-verzendroute.
router.post("/werk-inbox/mails/:messageId/notities", requireAuth, async (req, res): Promise<void> => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);
  const { tekst } = req.body as { tekst?: string };

  if (!tekst?.trim()) {
    res.status(400).json({ error: "Tekst mag niet leeg zijn." });
    return;
  }
  const gevonden = await vindMailMetToegang(uid, messageId, "behandelen");
  if (!gevonden) { res.status(404).json({ error: "Mail niet gevonden." }); return; }

  const [rij] = await db.insert(werkInboxNotitiesTable)
    .values({ messageId, mailboxAdres: gevonden.mail.mailboxAdres, gebruikerId: uid, tekst: tekst.trim() })
    .returning();

  res.status(201).json({ ...rij, auteurNaam: await gebruikersNaam(uid) });
});

router.patch("/werk-inbox/notities/:id", requireAuth, async (req, res): Promise<void> => {
  const uid = gebruikerId(req);
  const id  = parseInt(String(req.params.id), 10);
  const { tekst } = req.body as { tekst?: string };
  if (!tekst?.trim()) { res.status(400).json({ error: "Tekst mag niet leeg zijn." }); return; }

  // Alleen de auteur wijzigt zijn eigen opmerking.
  const [rij] = await db.update(werkInboxNotitiesTable)
    .set({ tekst: tekst.trim(), bijgewerktOp: new Date() })
    .where(and(eq(werkInboxNotitiesTable.id, id), eq(werkInboxNotitiesTable.gebruikerId, uid)))
    .returning();
  if (!rij) { res.status(404).json({ error: "Niet gevonden." }); return; }
  res.json(rij);
});

router.delete("/werk-inbox/notities/:id", requireAuth, async (req, res): Promise<void> => {
  const uid = gebruikerId(req);
  const id  = parseInt(String(req.params.id), 10);
  const [notitie] = await db.select().from(werkInboxNotitiesTable)
    .where(eq(werkInboxNotitiesTable.id, id)).limit(1);
  if (!notitie) { res.json({ ok: true }); return; }
  // Auteur zelf, of iemand met beheren-recht op de mailbox van het bericht.
  if (notitie.gebruikerId !== uid) {
    const gevonden = await vindMailMetToegang(uid, notitie.messageId, "beheren");
    if (!gevonden) { res.status(403).json({ error: "Alleen de auteur of een beheerder kan deze opmerking verwijderen." }); return; }
  }
  await db.delete(werkInboxNotitiesTable).where(eq(werkInboxNotitiesTable.id, id));
  res.json({ ok: true });
});

// ─── Koppelingen ──────────────────────────────────────────────────────────────
router.post("/werk-inbox/mails/:messageId/koppelingen", requireAuth, async (req, res): Promise<void> => {
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
  const gevonden = await vindMailMetToegang(uid, messageId, "behandelen");
  if (!gevonden) { res.status(404).json({ error: "Mail niet gevonden." }); return; }

  try {
    const [rij] = await db.insert(werkInboxKoppelingenTable)
      .values({ messageId, mailboxAdres: gevonden.mail.mailboxAdres, gebruikerId: uid, entityType, entityId, entityLabel: entityLabel ?? null })
      .returning();
    res.status(201).json(rij);
  } catch {
    res.status(409).json({ error: "Deze koppeling bestaat al." });
  }
});

router.delete("/werk-inbox/koppelingen/:id", requireAuth, async (req, res): Promise<void> => {
  const uid = gebruikerId(req);
  const id  = parseInt(String(req.params.id), 10);
  const [koppeling] = await db.select().from(werkInboxKoppelingenTable)
    .where(eq(werkInboxKoppelingenTable.id, id)).limit(1);
  if (!koppeling) { res.json({ ok: true }); return; }
  const gevonden = await vindMailMetToegang(uid, koppeling.messageId, "behandelen");
  if (!gevonden) { res.status(403).json({ error: "Hiervoor is behandelrecht op de mailbox nodig." }); return; }
  await db.delete(werkInboxKoppelingenTable).where(eq(werkInboxKoppelingenTable.id, id));
  res.json({ ok: true });
});

// ─── Afgehandeld markeren ─────────────────────────────────────────────────────
router.patch("/werk-inbox/mails/:messageId/afgehandeld", requireAuth, async (req, res): Promise<void> => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);
  const { afgehandeld } = req.body as { afgehandeld: boolean };

  const gevonden = await vindMailMetToegang(uid, messageId, "behandelen");
  if (!gevonden) { res.status(404).json({ error: "Niet gevonden." }); return; }

  const [rij] = await db.update(werkInboxMailsTable)
    .set({
      afgehandeldOp: afgehandeld ? new Date() : null,
      samenwerkStatus: afgehandeld
        ? "afgehandeld"
        : (gevonden.mail.toegewezenAan != null ? "toegewezen" : "open"),
      bijgewerktOp:  new Date(),
    })
    .where(and(
      eq(werkInboxMailsTable.mailboxAdres, gevonden.mail.mailboxAdres),
      eq(werkInboxMailsTable.messageId, messageId),
    ))
    .returning();
  res.json({ ok: true, afgehandeldOp: rij?.afgehandeldOp ?? null });
});

// ─── Actie vereist markeren ───────────────────────────────────────────────────
router.patch("/werk-inbox/mails/:messageId/actie-vereist", requireAuth, async (req, res): Promise<void> => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);
  const { actieVereist, reden } = req.body as { actieVereist: boolean; reden?: string };

  const gevonden = await vindMailMetToegang(uid, messageId, "behandelen");
  if (!gevonden) { res.status(404).json({ error: "Niet gevonden." }); return; }

  await db.update(werkInboxMailsTable)
    .set({
      actieVereist,
      actieVereistReden: actieVereist ? (reden ?? null) : null,
      bijgewerktOp: new Date(),
    })
    .where(and(
      eq(werkInboxMailsTable.mailboxAdres, gevonden.mail.mailboxAdres),
      eq(werkInboxMailsTable.messageId, messageId),
    ));
  res.json({ ok: true });
});

// ─── Relatie opzoeken via e-mailadres (CRM) ──────────────────────────────────
router.get("/werk-inbox/relatie/:emailAdres", requireAuth, async (req, res): Promise<void> => {
  const emailAdres = String(req.params.emailAdres).toLowerCase().trim();
  if (!emailAdres || !emailAdres.includes("@")) {
    res.json({ gevonden: false });
    return;
  }

  const [contact] = await db.select({
    id:              crmContactpersonenTable.id,
    naam:            crmContactpersonenTable.naam,
    functie:         crmContactpersonenTable.functie,
    relatiesterkte:  crmContactpersonenTable.relatiesterkte,
    klantId:         crmContactpersonenTable.klantId,
    lastContact:     crmContactpersonenTable.laatste_contact_datum,
  })
    .from(crmContactpersonenTable)
    .where(sql`lower(${crmContactpersonenTable.email}) = ${emailAdres}`)
    .limit(1);

  let organisatie: { id: number; naam: string; type: string | null; status: string } | null = null;

  if (contact?.klantId) {
    const [org] = await db.select({
      id:     crmKlantenTable.id,
      naam:   crmKlantenTable.naam,
      type:   crmKlantenTable.type,
      status: crmKlantenTable.status,
    })
      .from(crmKlantenTable)
      .where(eq(crmKlantenTable.id, contact.klantId))
      .limit(1);
    if (org) organisatie = org;
  }

  if (contact) {
    res.json({
      gevonden: true,
      contactpersoon: {
        naam:           contact.naam,
        functie:        contact.functie,
        relatiesterkte: contact.relatiesterkte ?? "onbekend",
        lastContact:    contact.lastContact,
      },
      organisatie,
    });
    return;
  }

  const [org] = await db.select({
    id:     crmKlantenTable.id,
    naam:   crmKlantenTable.naam,
    type:   crmKlantenTable.type,
    status: crmKlantenTable.status,
  })
    .from(crmKlantenTable)
    .where(sql`lower(${crmKlantenTable.email}) = ${emailAdres}`)
    .limit(1);

  if (org) {
    res.json({ gevonden: true, contactpersoon: null, organisatie: org });
    return;
  }

  res.json({ gevonden: false });
});

// ─── Verplaatsen ──────────────────────────────────────────────────────────────
router.post("/werk-inbox/mails/:messageId/verplaats", requireAuth, async (req, res): Promise<void> => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);
  const { doelMap } = req.body as { doelMap?: string };

  if (!doelMap || typeof doelMap !== "string" || doelMap.trim() === "") {
    res.status(400).json({ error: "doelMap is verplicht (bijv. 'archive', 'deleteditems', 'inbox')." });
    return;
  }

  const gevonden = await vindMailMetToegang(uid, messageId, "behandelen");
  if (!gevonden) { res.status(404).json({ error: "Mail niet gevonden." }); return; }

  const { viaUid, isPersonlijk } = await graphContext(uid, gevonden.mail);
  const ok = await verplaatsMail(viaUid, gevonden.mail.mailboxAdres, messageId, isPersonlijk, doelMap.trim());
  if (!ok) { res.status(502).json({ error: "Verplaatsen via Microsoft Graph mislukt. Controleer uw mailkoppeling." }); return; }

  res.json({ ok: true });
});

// ─── Archiveren ───────────────────────────────────────────────────────────────
router.post("/werk-inbox/mails/:messageId/archiveer", requireAuth, async (req, res): Promise<void> => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);

  const gevonden = await vindMailMetToegang(uid, messageId, "behandelen");
  if (!gevonden) { res.status(404).json({ error: "Mail niet gevonden." }); return; }

  const { viaUid, isPersonlijk } = await graphContext(uid, gevonden.mail);
  const ok = await archiveerMail(viaUid, gevonden.mail.mailboxAdres, messageId, isPersonlijk);
  if (!ok) { res.status(502).json({ error: "Archiveren via Microsoft Graph mislukt. Controleer uw mailkoppeling." }); return; }

  res.json({ ok: true });
});

// ─── Beantwoorden ─────────────────────────────────────────────────────────────
router.post("/werk-inbox/mails/:messageId/beantwoord", requireAuth, async (req, res): Promise<void> => {
  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);
  const { htmlBody, extraOntvangers } = req.body as {
    htmlBody?: string;
    extraOntvangers?: Array<{ emailAddress: { address: string; name?: string } }>;
  };

  if (!htmlBody || typeof htmlBody !== "string" || htmlBody.trim() === "") {
    res.status(400).json({ error: "htmlBody is verplicht." });
    return;
  }

  const gevonden = await vindMailMetToegang(uid, messageId, "behandelen");
  if (!gevonden) { res.status(404).json({ error: "Mail niet gevonden." }); return; }

  const { viaUid, isPersonlijk } = await graphContext(uid, gevonden.mail);
  const resultaat = await beantwoordMail(viaUid, gevonden.mail.mailboxAdres, messageId, isPersonlijk, {
    htmlBody: htmlBody.trim(),
    extraOntvangers,
  });

  if (!resultaat.ok) {
    res.status(502).json({ error: resultaat.fout ?? "Beantwoorden via Microsoft Graph mislukt." });
    return;
  }

  // Reactietijd (opdracht §5.5) + gezamenlijke status: beantwoord = wacht op antwoord.
  await db.update(werkInboxMailsTable)
    .set({
      beantwoordOp: gevonden.mail.beantwoordOp ?? new Date(),
      ...(gevonden.mail.samenwerkStatus !== "afgehandeld" && { samenwerkStatus: "wacht_op_antwoord" }),
      bijgewerktOp: new Date(),
    })
    .where(and(
      eq(werkInboxMailsTable.mailboxAdres, gevonden.mail.mailboxAdres),
      eq(werkInboxMailsTable.messageId, messageId),
    ));
  meldAanwezigheid(messageId, uid, await gebruikersNaam(uid), "bekijkt");

  res.json({ ok: true });
});

// ─── Nieuw bericht versturen ──────────────────────────────────────────────────
router.post("/werk-inbox/mails/nieuw", requireAuth, async (req, res): Promise<void> => {
  const uid = gebruikerId(req);
  const { naarEmail, naarNaam, onderwerp, htmlBody, mailboxAdres } = req.body as {
    naarEmail?: string;
    naarNaam?: string;
    onderwerp?: string;
    htmlBody?: string;
    mailboxAdres?: string;
  };

  if (!naarEmail || !onderwerp || !htmlBody) {
    res.status(400).json({ error: "naarEmail, onderwerp en htmlBody zijn verplicht." });
    return;
  }

  const [tokenRec] = await db.select({ microsoftEmail: werkInboxTokensTable.microsoftEmail })
    .from(werkInboxTokensTable)
    .where(eq(werkInboxTokensTable.gebruikerId, uid))
    .limit(1);

  if (!tokenRec) {
    res.status(400).json({ error: "Geen Microsoft-account gekoppeld." });
    return;
  }

  const effectiefMailbox = (mailboxAdres ?? tokenRec.microsoftEmail).toLowerCase();
  const isPersonlijk     = effectiefMailbox === tokenRec.microsoftEmail.toLowerCase();

  // Versturen vanuit een gedeelde mailbox vereist behandelrecht in Connect.
  if (!isPersonlijk) {
    const t = await rechtOpMailboxAdres(uid, effectiefMailbox);
    if (!t || !rechtDekt(t.recht, "behandelen")) {
      res.status(403).json({ error: "Geen behandelrecht op deze mailbox." });
      return;
    }
  }

  const resultaat = await verstuurNieuwDelegatedMail(uid, {
    naarEmail,
    naarNaam,
    onderwerp,
    htmlBody,
    mailboxAdres: effectiefMailbox,
    isPersonlijk,
  });

  if (!resultaat.ok) {
    res.status(502).json({ error: resultaat.fout ?? "Versturen via Microsoft Graph mislukt." });
    return;
  }
  res.json({ ok: true });
});

// ─── AI-analyse per mail ──────────────────────────────────────────────────────
router.post("/werk-inbox/mails/:messageId/analyseer", requireAuth, async (req, res): Promise<void> => {
  if (!heeftGateway()) {
    res.status(503).json({ error: "AI niet beschikbaar." });
    return;
  }

  const uid       = gebruikerId(req);
  const messageId = String(req.params.messageId);

  const gevonden = await vindMailMetToegang(uid, messageId, "behandelen");
  if (!gevonden) { res.status(404).json({ error: "Mail niet gevonden." }); return; }
  const mail = gevonden.mail;

  // Modus 'Alleen registreren' = geen AI-bemoeienis, ook niet op verzoek
  // (opdracht §4). In 'Ondersteunen' draait AI uitsluitend op verzoek zoals
  // hier — nooit automatisch, nooit blokkerend.
  if (gevonden.mailbox.modus === "registreren") {
    res.status(422).json({ error: "Deze mailbox staat op 'Alleen registreren' — AI-analyse is hier uitgeschakeld." });
    return;
  }

  const prompt = `Je bent AI-assistent voor FPS Brandpreventie, specialist in brandpreventieve gebouwvoorzieningen.

Analyseer de volgende e-mail en geef een gestructureerd oordeel in JSON.

Onderwerp: ${mail.onderwerp}
Afzender: ${mail.afzenderNaam ?? "Onbekend"} <${mail.afzenderEmail}>
Samenvatting: ${mail.snippet ?? "(geen preview)"}

Antwoord uitsluitend als geldige JSON (geen tekst eromheen):
{
  "categorie": "opdrachtgever" | "leverancier" | "onderaannemer" | "adviseur" | "administratief" | "intern" | "onbekend",
  "actie_vereist": boolean,
  "actie_vereist_reden": string | null,
  "samenvatting": "max 2 regels NL",
  "voorstellen": [
    {
      "type": "koppel_project" | "maak_taak" | "conceptantwoord" | "factuur_herkennen" | "offerte_koppelen" | "document_opslaan" | "onderhoudscontract" | "administratief_verwerken",
      "omschrijving": "concrete actie in 1 zin NL",
      "zekerheid": 0-100
    }
  ]
}

Regels:
- Geef 0–3 voorstellen, meest relevant eerst.
- Administratieve mails (facturen, orderbevestigingen, notificaties): actie_vereist=false, 1 voorstel "administratief_verwerken" met zekerheid 90+.
- Relatie-mails van klanten/leveranciers/partners: stel passende actie voor, actie_vereist=true als context onduidelijk is.
- Nieuwsbrieven/marketingmails: 0 voorstellen, actie_vereist=false.`;

  try {
    const werkInboxResultaat = await aiGateway.chat("default", {
      max_completion_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = werkInboxResultaat.ok ? werkInboxResultaat.inhoud : "{}";
    let analyse: {
      categorie?: string;
      actie_vereist?: boolean;
      actie_vereist_reden?: string | null;
      samenvatting?: string;
      voorstellen?: { type: string; omschrijving: string; zekerheid: number }[];
    };

    try {
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      analyse = JSON.parse(cleaned) as typeof analyse;
    } catch {
      req.log.warn({ raw }, "werk-inbox: AI analyse JSON parse mislukt");
      res.status(502).json({ error: "AI gaf geen geldig antwoord." });
      return;
    }

    let logboek: { actie: string; uitgevoerdOp: string; samenvatting?: string; categorie?: string }[] = [];
    try { logboek = JSON.parse(mail.aiLogboekJson ?? "[]") as typeof logboek; } catch { /* ignore */ }
    logboek.unshift({
      actie:        "AI-analyse uitgevoerd",
      uitgevoerdOp: new Date().toISOString(),
      samenvatting: analyse.samenvatting,
      categorie:    analyse.categorie,
    });

    const [bijgewerkt] = await db.update(werkInboxMailsTable)
      .set({
        aiVoorstelJson:    JSON.stringify(analyse.voorstellen ?? []),
        aiLogboekJson:     JSON.stringify(logboek.slice(0, 20)),
        relatieCategorieAi: analyse.categorie ?? null,
        actieVereist:      analyse.actie_vereist ?? false,
        actieVereistReden: analyse.actie_vereist_reden ?? null,
        bijgewerktOp:      new Date(),
      })
      .where(and(
        eq(werkInboxMailsTable.mailboxAdres, mail.mailboxAdres),
        eq(werkInboxMailsTable.messageId, messageId),
      ))
      .returning();

    res.json({ ok: true, analyse, mail: bijgewerkt });
  } catch (err) {
    req.log.error({ err }, "werk-inbox: AI analyse mislukt");
    res.status(500).json({ error: "AI analyse mislukt." });
  }
});

export default router;

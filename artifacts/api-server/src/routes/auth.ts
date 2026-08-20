import { Router } from "express";
import { publiekeAppUrl } from "../lib/publiekeUrl";
import { rateLimit, ipKeyGenerator, MemoryStore } from "express-rate-limit";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { db, gebruikersTable, wachtwoordResetTokensTable, externeAdviseursTable } from "@workspace/db";
import { eq, and, gt, isNull, ne, or, sql } from "drizzle-orm";
import { maakToken } from "../lib/token";
import { heeftLoonfundamentIdentiteit, requireAuth } from "../middlewares/auth";
import { legLoginPogingVast } from "./systeem";
import { verstuurWachtwoordResetMail } from "../services/email.js";
import {
  isVergrendeld,
  verwerkMislukteInlogpoging,
  resetMislukteInlogpogingen,
} from "../lib/lockout";
import { beeindigSessiesVanGebruiker } from "../lib/session";
import { berekenEffectieveBevoegdheden } from "../lib/effectieve-bevoegdheden";
import { berekenIsUitvoerendVeld as berekenIsUitvoerendVeldViaDb } from "../lib/is-uitvoerend-veld";
import { haalActieveFunctieNamen } from "../lib/functieNamen";
import { logger } from "../lib/logger";

const router = Router();

// ── In-memory rate-limiter voor login-endpoints ───────────────────────────────
// Beschermt /auth/login, /auth/2fa/verify en /auth/mobile/login tegen
// brute-force aanvallen. Per IP maximaal RL_MAX pogingen per 15 minuten
// (zie de toelichting bij RL_MAX hieronder). Bij overschrijding: 429 +
// Retry-After header.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const loginRateMap = new Map<string, RateLimitEntry>();
// 50 mislukte pogingen per 15 min per IP. Bewust ruim: een heel kantoor deelt
// vaak één IP-adres, dus een te lage limiet blokkeert legitieme gebruikers met
// een juist wachtwoord (429 leek dan op "onjuiste inloggegevens"). De echte
// brute-force-bescherming per account blijft de lockout na 5 mislukte pogingen.
const RL_MAX = 50;
const RL_VENSTER_MS = 15 * 60 * 1000;

function checkLoginRateLimit(req: import("express").Request, res: import("express").Response): boolean {
  const ip = req.ip ?? "onbekend";
  const nu = Date.now();
  const entry = loginRateMap.get(ip);
  if (!entry || nu > entry.resetAt) {
    loginRateMap.set(ip, { count: 1, resetAt: nu + RL_VENSTER_MS });
    return true;
  }
  entry.count++;
  if (entry.count > RL_MAX) {
    const wachtSec = Math.ceil((entry.resetAt - nu) / 1000);
    // Punt 24: geblokkeerde pogingen zichtbaar maken in het log.
    logger.warn({ ip, pogingen: entry.count, route: req.path }, "Login geblokkeerd door IP-rate-limiter");
    res.setHeader("Retry-After", String(wachtSec));
    res.status(429).json({ error: "Te veel pogingen, probeer het later opnieuw" });
    return false;
  }
  return true;
}

// Succesvolle pogingen tellen niet mee voor het brute-force-budget (standaard
// "skip successful requests"-patroon): na een geslaagde stap wordt de telling
// voor dit IP teruggegeven. Alleen mislukte pogingen verbruiken het limiet,
// zodat legitiem verkeer (bv. meerdere gebruikers achter één IP, e2e-suites)
// het venster niet uitput terwijl brute-force (mislukkingen) geblokkeerd blijft.
function verlaagLoginRateTeller(req: import("express").Request): void {
  const entry = loginRateMap.get(req.ip ?? "onbekend");
  if (entry && entry.count > 0) entry.count--;
}

// Ruim verlopen entries op elke 30 minuten om geheugenlek te voorkomen
setInterval(() => {
  const nu = Date.now();
  for (const [ip, entry] of loginRateMap.entries()) {
    if (nu > entry.resetAt) loginRateMap.delete(ip);
  }
}, 30 * 60 * 1000).unref();

// ── Strikte limiters (express-rate-limit) op de auth-routes ──────────────────
// Aanvullend op de ruime per-IP-limiter hierboven (die legitiem kantoorverkeer
// achter één gedeeld IP beschermt) geldt hieronder een strikte limiet per
// IP + account: brute-force op één account wordt zo na 5 pogingen per
// 15 minuten geblokkeerd, zonder dat andere gebruikers achter hetzelfde IP
// geraakt worden. Succesvolle verzoeken tellen niet mee, zodat normale
// login/2FA-flows nooit tegen deze limiet aanlopen.

const TE_VEEL_POGINGEN = "Te veel pogingen. Probeer het later opnieuw.";

// Sleutel = IP + account. Voor login/mobile-login is het account het
// (genormaliseerde) e-mailadres uit de body; voor de 2FA-stappen UITSLUITEND
// de pendingUserId uit de sessie — nooit body-invoer, anders kan een aanvaller
// de sleutel roteren door een wisselend e-mailveld mee te sturen.
function loginSleutel(req: import("express").Request): string {
  const ip = ipKeyGenerator(req.ip ?? "onbekend");
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "-";
  return `${ip}|${email}`;
}
function tfaSleutel(req: import("express").Request): string {
  const ip = ipKeyGenerator(req.ip ?? "onbekend");
  return `${ip}|uid:${req.session?.pendingUserId ?? "-"}`;
}

// Punt 24 (SCHULD_01): elke blokkade wordt gelogd zodat zichtbaar is dát er
// geprobeerd wordt — een stille 429 verbergt een lopende brute-force-poging.
function logBlokkade(label: string) {
  return (req: import("express").Request, res: import("express").Response) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : undefined;
    logger.warn({ ip: req.ip, email, route: req.path, limiter: label }, "Auth-verzoek geblokkeerd door rate limiter");
    res.status(429).json({ error: TE_VEEL_POGINGEN });
  };
}

const strikteLimiterOpties = {
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true as const,
  legacyHeaders: false,
  message: { error: TE_VEEL_POGINGEN },
};
const strikteLoginStore = new MemoryStore();
const strikteLoginLimiter = rateLimit({
  ...strikteLimiterOpties,
  store: strikteLoginStore,
  keyGenerator: loginSleutel,
  handler: logBlokkade("login"),
});
const strikteTfaStore = new MemoryStore();
const strikteTfaLimiter = rateLimit({
  ...strikteLimiterOpties,
  store: strikteTfaStore,
  keyGenerator: tfaSleutel,
  handler: logBlokkade("2fa"),
});

// Wachtwoordroutes: 3 pogingen per uur per IP, elk endpoint zijn eigen budget
// zodat een legitieme "vergeten → reset"-flow elkaar niet uitput.
const wachtwoordLimiterOpties = {
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true as const,
  legacyHeaders: false,
  message: { error: TE_VEEL_POGINGEN },
  keyGenerator: (req: import("express").Request) => ipKeyGenerator(req.ip ?? "onbekend"),
};
const wachtwoordVergetenStore = new MemoryStore();
const wachtwoordVergetenLimiter = rateLimit({ ...wachtwoordLimiterOpties, store: wachtwoordVergetenStore, handler: logBlokkade("wachtwoord-vergeten") });
const wachtwoordResetStore = new MemoryStore();
const wachtwoordResetLimiter = rateLimit({ ...wachtwoordLimiterOpties, store: wachtwoordResetStore, handler: logBlokkade("wachtwoord-reset") });

function domein(): string {
  return publiekeAppUrl()?.replace(/^https?:\/\//, "") || "localhost";
}

const ISSUER = "FPS Brandpreventie";

authenticator.options = { window: 1 };

const TALEN = ["nl", "en", "de", "fr", "ar", "tr"] as const;

// GEBRUIKERS_01 v2: is_uitvoerend_veld wordt centraal berekend in
// ../lib/is-uitvoerend-veld (berekenIsUitvoerendVeldViaDb = single-variant).
// Zo delen auth-routes en GET /gebruikers exact dezelfde fail-closed-logica.

const mapAuthGebruiker = (
  g: typeof gebruikersTable.$inferSelect,
  effectieveBev?: Record<string, number>,
  isUitvoerendVeld?: boolean,
  actueleFunctienamen: string[] = [],
  heeftLoonfundamentToegang = false,
) => ({
  id: g.id,
  naam: g.naam,
  initialen: g.initialen ?? null,
  email: g.email,
  rol: g.rol,
  avatar_url: g.avatarUrl ?? null,
  bedrijfskleuren: g.bedrijfskleuren ?? null,
  taal: g.taal ?? "nl",
  functietitels: actueleFunctienamen,
  bevoegdheden: effectieveBev ?? (g.bevoegdheden as Record<string, number>) ?? {},
  is_hoofdtester: g.isHoofdtester ?? false,
  moet_wachtwoord_wijzigen: g.moetWachtwoordWijzigen ?? false,
  /** Server-berekende vlag via functies.uitvoerend op actuele aanstellingen (GEBRUIKERS_01 v2). */
  is_uitvoerend_veld: isUitvoerendVeld ?? false,
  /** LOON_02A: niet afgeleid uit een los recht, maar uit hoofdbeheerder/profielidentiteit. */
  heeft_loonfundament_toegang: heeftLoonfundamentToegang,
});

function vergrendeldRespons(vergrendeldTot: Date) {
  return {
    error: "Account tijdelijk vergrendeld wegens te veel mislukte inlogpogingen. Probeer het later opnieuw of neem contact op met de hoofdbeheerder.",
    code: "ACCOUNT_VERGRENDELD",
    vergrendeld_tot: vergrendeldTot.toISOString(),
  };
}

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

// GEBRUIKERS_01 externe adviseur: is dit account een externe adviseur met een
// verstreken toegang_tot-datum, dan wordt inloggen fail-closed geblokkeerd.
// Datumvergelijking op tekst (JJJJ-MM-DD) tegen de kalenderdatum in NL-tijd,
// zodat de laatste toegangsdag volledig geldig blijft.
async function adviseurToegangVerlopen(gebruikerId: number): Promise<string | null> {
  const [a] = await db
    .select({ toegangTot: externeAdviseursTable.toegangTot })
    .from(externeAdviseursTable)
    .where(eq(externeAdviseursTable.gebruikerId, gebruikerId))
    .limit(1);
  if (!a) return null;
  const vandaag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());
  return a.toegangTot < vandaag ? a.toegangTot : null;
}

function adviseurVerlopenRespons(toegangTot: string) {
  return {
    error: `De toegang van dit externe-adviseursaccount is verlopen op ${toegangTot}. Neem contact op met de beheerder om de toegang te verlengen.`,
    code: "ADVISEUR_TOEGANG_VERLOPEN",
  };
}

// POST /auth/login — stap 1: e-mail + wachtwoord
router.post("/auth/login", strikteLoginLimiter, async (req, res): Promise<void> => {
  if (!checkLoginRateLimit(req, res)) return;
  try {
    const { email, wachtwoord } = req.body ?? {};
    if (!email || !wachtwoord) {
      return void res.status(400).json({ error: "E-mail en wachtwoord zijn verplicht" });
    }
    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.email, String(email).trim().toLowerCase()));

    if (g?.geanonimiseerd) {
      return void res.status(403).json({ error: "Dit account is geanonimiseerd en kan niet meer worden gebruikt." });
    }

    if (!g || !g.actief || !g.wachtwoord) {
      await legLoginPogingVast({
        gebruikerId: g?.id ?? null,
        email: String(email).trim().toLowerCase(),
        ip: verzoekIp(req),
        userAgent: verzoekUserAgent(req),
        gelukt: false,
      });
      return void res.status(401).json({ error: "Onjuiste inloggegevens" });
    }
    // #261: Fail-closed blokkering van geanonimiseerde accounts
    if (g.geanonimiseerd) {
      return void res.status(401).json({ error: "Onjuiste inloggegevens" });
    }
    if (isVergrendeld(g.vergrendeldTot)) {
      return void res.status(423).json(vergrendeldRespons(g.vergrendeldTot!));
    }
    const ok = await bcrypt.compare(String(wachtwoord), g.wachtwoord);
    if (!ok) {
      await verwerkMislukteInlogpoging(g.id, g.misluktePogingen);
      await legLoginPogingVast({
        gebruikerId: g.id,
        email: g.email,
        ip: verzoekIp(req),
        userAgent: verzoekUserAgent(req),
        gelukt: false,
      });
      return void res.status(401).json({ error: "Onjuiste inloggegevens" });
    }
    const adviseurVerlopen = await adviseurToegangVerlopen(g.id);
    if (adviseurVerlopen) {
      return void res.status(403).json(adviseurVerlopenRespons(adviseurVerlopen));
    }
    req.session.pendingUserId = g.id;
    delete req.session.userId;
    delete req.session.pendingSecret;
    // Stale activatie-gegevens uit een eerdere (afgebroken) uitnodigingsflow
    // mogen een normale login nooit beïnvloeden.
    delete req.session.pendingWachtwoordHash;
    delete req.session.pendingTaal;
    delete req.session.pendingActivatieToken;
    verlaagLoginRateTeller(req);
    // Smoketest-serviceaccount: expliciet vrijgesteld van 2FA (vlag alleen
    // via lib/db/scripts/smoketest-account.mjs te zetten). Volledige sessie
    // direct, met dezelfde boekhouding als na een geslaagde 2FA-stap.
    if (g.tweeFactorVrijgesteld) {
      req.session.userId = g.id;
      req.session.rol = g.rol;
      delete req.session.pendingUserId;
      await db
        .update(gebruikersTable)
        .set({ laatstOnline: new Date() })
        .where(eq(gebruikersTable.id, g.id));
      await resetMislukteInlogpogingen(g.id);
      await legLoginPogingVast({
        gebruikerId: g.id,
        email: g.email,
        ip: verzoekIp(req),
        userAgent: verzoekUserAgent(req),
        gelukt: true,
      });
      return void res.json({ status: "ingelogd" });
    }
    if (g.tweeFactorIngeschakeld && g.totpSecret) {
      return void res.json({ status: "verify_2fa" });
    }
    return void res.json({ status: "setup_2fa" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /auth/2fa/setup — genereer secret + QR voor eerste inrichting
router.post("/auth/2fa/setup", async (req, res): Promise<void> => {
  try {
    const pendingId = req.session.pendingUserId;
    if (!pendingId) {
      return void res.status(401).json({ error: "Geen actieve inlogpoging" });
    }
    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, pendingId));
    if (!g) {
      return void res.status(404).json({ error: "Gebruiker niet gevonden" });
    }
    if (g.geanonimiseerd) {
      return void res.status(403).json({ error: "Dit account is geanonimiseerd." });
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
router.post("/auth/2fa/activeren", strikteTfaLimiter, async (req, res): Promise<void> => {
  try {
    const pendingId = req.session.pendingUserId;
    const secret = req.session.pendingSecret;
    const code = schoonCode(req.body?.code);
    if (!pendingId || !secret) {
      return void res.status(401).json({ error: "Geen actieve inrichting" });
    }
    if (!code) {
      return void res.status(400).json({ error: "Code is verplicht" });
    }
    if (!authenticator.check(code, secret)) {
      return void res.status(401).json({ error: "Onjuiste code, probeer opnieuw" });
    }
    // Bij activatie via uitnodiging staat het gekozen wachtwoord tijdelijk in
    // de sessie; pas nu (na geslaagde 2FA-bevestiging) wordt het definitief.
    const pendingHash = req.session.pendingWachtwoordHash;
    const pendingTaal = req.session.pendingTaal;
    const pendingToken = req.session.pendingActivatieToken;
    let g: typeof gebruikersTable.$inferSelect | undefined;
    if (pendingHash) {
      // Uitnodigings-activatie: schrijf atomair en ALLEEN als de uitnodiging
      // nog geldig en onverbruikt is (zelfde token, niet geaccepteerd, niet
      // verlopen). Zo kan een stale sessie de activatie van een inmiddels
      // afgerond account nooit alsnog overschrijven.
      const nu = new Date();
      const [rij] = await db
        .update(gebruikersTable)
        .set({
          totpSecret: secret,
          tweeFactorIngeschakeld: true,
          laatstOnline: nu,
          uitnodigingStatus: "geaccepteerd",
          uitnodigingGeaccepteerdOp: nu,
          wachtwoord: pendingHash,
          // De gebruiker koos hier zelf een wachtwoord; de vlag "moet
          // wachtwoord wijzigen" is daarmee vervuld.
          moetWachtwoordWijzigen: false,
          ...(pendingTaal ? { taal: pendingTaal } : {}),
        })
        .where(
          and(
            eq(gebruikersTable.id, pendingId),
            eq(gebruikersTable.uitnodigingToken, pendingToken ?? ""),
            ne(gebruikersTable.uitnodigingStatus, "geaccepteerd"),
            or(
              isNull(gebruikersTable.uitnodigingVerlooptOp),
              gt(gebruikersTable.uitnodigingVerlooptOp, nu),
            ),
          ),
        )
        .returning();
      if (!rij) {
        // Uitnodiging inmiddels verbruikt/verlopen: pending state opruimen en
        // niets aan het account wijzigen.
        delete req.session.pendingUserId;
        delete req.session.pendingSecret;
        delete req.session.pendingWachtwoordHash;
        delete req.session.pendingTaal;
        delete req.session.pendingActivatieToken;
        return void res
          .status(409)
          .json({ error: "Deze uitnodiging is niet meer geldig. Log in met uw bestaande gegevens." });
      }
      g = rij;
    } else {
      const [rij] = await db
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
      g = rij;
    }
    req.session.userId = pendingId;
    // Rol in de sessie zetten: de governance-middleware leest req.session.rol
    // en blokkeert kritieke acties anders ook voor hoofdbeheerders (rol=null).
    req.session.rol = g!.rol;
    delete req.session.pendingUserId;
    delete req.session.pendingSecret;
    delete req.session.pendingWachtwoordHash;
    delete req.session.pendingTaal;
    delete req.session.pendingActivatieToken;
    await resetMislukteInlogpogingen(g!.id);
    const risico = await legLoginPogingVast({
      gebruikerId: g!.id,
      email: g!.email,
      ip: verzoekIp(req),
      userAgent: verzoekUserAgent(req),
      gelukt: true,
    });
    const [bev, uitvoerend, loonfundamentToegang] = await Promise.all([
      berekenEffectieveBevoegdheden(g!.id),
      berekenIsUitvoerendVeldViaDb(g!.id, g!.rol),
      heeftLoonfundamentIdentiteit(g!.id),
    ]);
    res.json({ ...mapAuthGebruiker(g, bev, uitvoerend, [...(await haalActieveFunctieNamen(g.id))], loonfundamentToegang), nieuw_apparaat: risico.nieuwApparaat, nieuw_ip: risico.nieuwIp });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /auth/2fa/verify — stap 2 bij bestaande 2FA
router.post("/auth/2fa/verify", strikteTfaLimiter, async (req, res): Promise<void> => {
  if (!checkLoginRateLimit(req, res)) return;
  try {
    const pendingId = req.session.pendingUserId;
    const code = schoonCode(req.body?.code);
    if (!pendingId) {
      return void res.status(401).json({ error: "Geen actieve inlogpoging" });
    }
    if (!code) {
      return void res.status(400).json({ error: "Code is verplicht" });
    }
    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, pendingId));
    if (!g || !g.totpSecret) {
      return void res.status(401).json({ error: "Tweestapsverificatie niet ingericht" });
    }
    // GEBRUIKERS_01: hercontrole vlak vóór sessie-uitgifte — wie op de laatste
    // geldige dag stap 1 passeerde, mag na de NL-datumgrens geen sessie meer
    // krijgen via de 2FA-stap.
    const adviseurVerlopen2fa = await adviseurToegangVerlopen(g.id);
    if (adviseurVerlopen2fa) {
      return void res.status(403).json(adviseurVerlopenRespons(adviseurVerlopen2fa));
    }
    if (isVergrendeld(g.vergrendeldTot)) {
      return void res.status(423).json(vergrendeldRespons(g.vergrendeldTot!));
    }
    if (!authenticator.check(code, g.totpSecret)) {
      await verwerkMislukteInlogpoging(g.id, g.misluktePogingen);
      await legLoginPogingVast({
        gebruikerId: g.id,
        email: g.email,
        ip: verzoekIp(req),
        userAgent: verzoekUserAgent(req),
        gelukt: false,
      });
      return void res.status(401).json({ error: "Onjuiste code, probeer opnieuw" });
    }
    verlaagLoginRateTeller(req);
    await db
      .update(gebruikersTable)
      .set({
        laatstOnline: new Date(),
        uitnodigingStatus: "geaccepteerd",
        uitnodigingGeaccepteerdOp: g.uitnodigingGeaccepteerdOp ?? new Date(),
      })
      .where(eq(gebruikersTable.id, g.id));
    req.session.userId = g.id;
    // Rol in de sessie zetten: de governance-middleware leest req.session.rol
    // en blokkeert kritieke acties anders ook voor hoofdbeheerders (rol=null).
    req.session.rol = g.rol;
    delete req.session.pendingUserId;
    delete req.session.pendingSecret;
    await resetMislukteInlogpogingen(g.id);
    const risico = await legLoginPogingVast({
      gebruikerId: g.id,
      email: g.email,
      ip: verzoekIp(req),
      userAgent: verzoekUserAgent(req),
      gelukt: true,
    });
    // Auth-routes worden bewust NIET geauditlogd — wachtwoorden, tokens en
    // TOTP-secrets mogen nooit in audit_log terechtkomen.
    const [bev2fa, uitvoerend2fa, loonfundamentToegang] = await Promise.all([
      berekenEffectieveBevoegdheden(g.id),
      berekenIsUitvoerendVeldViaDb(g.id, g.rol),
      heeftLoonfundamentIdentiteit(g.id),
    ]);
    res.json({ ...mapAuthGebruiker(g, bev2fa, uitvoerend2fa, [...(await haalActieveFunctieNamen(g.id))], loonfundamentToegang), nieuw_apparaat: risico.nieuwApparaat, nieuw_ip: risico.nieuwIp });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /auth/mobile/login — login in één stap voor de mobiele monteur-app
// (e-mail + wachtwoord + bestaande TOTP-code). Retourneert een bearer-token.
router.post("/auth/mobile/login", strikteLoginLimiter, async (req, res): Promise<void> => {
  if (!checkLoginRateLimit(req, res)) return;
  try {
    const { email, wachtwoord, code } = req.body ?? {};
    if (!email || !wachtwoord) {
      return void res.status(400).json({ error: "E-mail en wachtwoord zijn verplicht" });
    }
    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.email, String(email).trim().toLowerCase()));

    if (g?.geanonimiseerd) {
      return void res.status(403).json({ error: "Dit account is geanonimiseerd en kan niet meer worden gebruikt." });
    }

    if (!g || !g.actief || !g.wachtwoord) {
      return void res.status(401).json({ error: "Onjuiste inloggegevens" });
    }
    if (isVergrendeld(g.vergrendeldTot)) {
      return void res.status(423).json(vergrendeldRespons(g.vergrendeldTot!));
    }
    const ok = await bcrypt.compare(String(wachtwoord), g.wachtwoord);
    if (!ok) {
      await verwerkMislukteInlogpoging(g.id, g.misluktePogingen);
      return void res.status(401).json({ error: "Onjuiste inloggegevens" });
    }
    const adviseurVerlopenMobiel = await adviseurToegangVerlopen(g.id);
    if (adviseurVerlopenMobiel) {
      return void res.status(403).json(adviseurVerlopenRespons(adviseurVerlopenMobiel));
    }
    if (!g.tweeFactorIngeschakeld || !g.totpSecret) {
      return void res.status(403).json({
        error:
          "Tweestapsverificatie is nog niet ingericht. Log eerst in via de webportal om dit te activeren.",
      });
    }
    const ingevoerdeCode = schoonCode(code);
    if (!ingevoerdeCode) {
      return void res
        .status(401)
        .json({ error: "Authenticatiecode is verplicht", status: "verify_2fa" });
    }
    if (!authenticator.check(ingevoerdeCode, g.totpSecret)) {
      await verwerkMislukteInlogpoging(g.id, g.misluktePogingen);
      return void res
        .status(401)
        .json({ error: "Onjuiste code, probeer opnieuw", status: "verify_2fa" });
    }
    verlaagLoginRateTeller(req);
    await resetMislukteInlogpogingen(g.id);
    await db
      .update(gebruikersTable)
      .set({ laatstOnline: new Date() })
      .where(eq(gebruikersTable.id, g.id));
    const token = maakToken(g.id, g.tokenVersie);
    const [bevMobiel, uitvoerendMobiel, loonfundamentToegang] = await Promise.all([
      berekenEffectieveBevoegdheden(g.id),
      berekenIsUitvoerendVeldViaDb(g.id, g.rol),
      heeftLoonfundamentIdentiteit(g.id),
    ]);
    return void res.json({
      token,
      gebruiker: mapAuthGebruiker(g, bevMobiel, uitvoerendMobiel, [...(await haalActieveFunctieNamen(g.id))], loonfundamentToegang),
    });
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
router.post("/auth/wachtwoord-vergeten", wachtwoordVergetenLimiter, async (req, res): Promise<void> => {
  try {
    const { email } = req.body ?? {};
    if (!email) return void res.status(204).send();

    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.email, String(email).trim().toLowerCase()))
      .limit(1);

    if (!g || !g.actief) return void res.status(204).send();

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

    return void res.status(204).send();
  } catch (err) {
    req.log.error(err, "POST /auth/wachtwoord-vergeten");
    return void res.status(204).send();
  }
});

// POST /auth/wachtwoord-reset — publiek; token + nieuw wachtwoord
router.post("/auth/wachtwoord-reset", wachtwoordResetLimiter, async (req, res): Promise<void> => {
  try {
    const { token, nieuw_wachtwoord } = req.body ?? {};
    if (!token || !nieuw_wachtwoord) {
      return void res.status(400).json({ error: "Token en nieuw wachtwoord zijn verplicht" });
    }
    if (String(nieuw_wachtwoord).length < 8) {
      return void res.status(400).json({ error: "Wachtwoord moet minimaal 8 tekens bevatten" });
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
      return void res.status(400).json({ error: "De resetlink is ongeldig of verlopen" });
    }

    const gehasht = await bcrypt.hash(String(nieuw_wachtwoord), 10);

    await db
      .update(gebruikersTable)
      .set({
        wachtwoord: gehasht,
        moetWachtwoordWijzigen: false,
        misluktePogingen: 0,
        vergrendeldTot: null,
        tokenVersie: sql`${gebruikersTable.tokenVersie} + 1`,
      })
      .where(eq(gebruikersTable.id, resetToken.gebruikerId));

    await db
      .update(wachtwoordResetTokensTable)
      .set({ gebruiktOp: now })
      .where(eq(wachtwoordResetTokensTable.id, resetToken.id));

    // Een nieuw wachtwoord maakt alle bestaande sessies en mobiele tokens
    // ongeldig — de gebruiker moet opnieuw inloggen met het nieuwe wachtwoord.
    await beeindigSessiesVanGebruiker(resetToken.gebruikerId);

    return void res.status(204).send();
  } catch (err) {
    req.log.error(err, "POST /auth/wachtwoord-reset");
    return void res.status(500).json({ error: "Onbekende fout" });
  }
});

// POST /auth/wachtwoord-wijzigen
router.post("/auth/wachtwoord-wijzigen", async (req, res): Promise<void> => {
  try {
    const id = req.session.userId;
    if (!id) {
      return void res.status(401).json({ error: "Niet ingelogd" });
    }
    const { huidig_wachtwoord, nieuw_wachtwoord } = req.body ?? {};
    if (!huidig_wachtwoord || !nieuw_wachtwoord) {
      return void res.status(400).json({ error: "Huidig en nieuw wachtwoord zijn verplicht" });
    }
    if (String(nieuw_wachtwoord).length < 8) {
      return void res.status(400).json({ error: "Nieuw wachtwoord moet minimaal 8 tekens bevatten" });
    }
    const [g] = await db.select().from(gebruikersTable).where(eq(gebruikersTable.id, id));
    if (!g || !g.wachtwoord) {
      return void res.status(404).json({ error: "Gebruiker niet gevonden" });
    }
    const klopt = await bcrypt.compare(String(huidig_wachtwoord), g.wachtwoord);
    if (!klopt) {
      return void res.status(400).json({ error: "Huidig wachtwoord is onjuist" });
    }
    const gehasht = await bcrypt.hash(String(nieuw_wachtwoord), 10);
    await db
      .update(gebruikersTable)
      .set({
        wachtwoord: gehasht,
        moetWachtwoordWijzigen: false,
        tokenVersie: sql`${gebruikersTable.tokenVersie} + 1`,
      })
      .where(eq(gebruikersTable.id, id));
    // Overige sessies/mobiele tokens intrekken, behalve de sessie die net het
    // wachtwoord wijzigde — anders logt de gebruiker zichzelf meteen uit.
    await beeindigSessiesVanGebruiker(id, req.sessionID);
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /auth/taal — eigen taalvoorkeur wijzigen
router.post("/auth/taal", async (req, res): Promise<void> => {
  try {
    const id = req.session.userId;
    if (!id) {
      return void res.status(401).json({ error: "Niet ingelogd" });
    }
    const taal = String(req.body?.taal ?? "");
    if (!TALEN.includes(taal as (typeof TALEN)[number])) {
      return void res.status(400).json({ error: "Ongeldige taalcode" });
    }
    const [g] = await db
      .update(gebruikersTable)
      .set({ taal })
      .where(eq(gebruikersTable.id, id))
      .returning();
    if (!g) {
      return void res.status(404).json({ error: "Gebruiker niet gevonden" });
    }
    const [bevTaal, uitvoerendTaal, loonfundamentToegang] = await Promise.all([
      berekenEffectieveBevoegdheden(g.id),
      berekenIsUitvoerendVeldViaDb(g.id, g.rol),
      heeftLoonfundamentIdentiteit(g.id),
    ]);
    res.json(mapAuthGebruiker(g, bevTaal, uitvoerendTaal, [...(await haalActieveFunctieNamen(g.id))], loonfundamentToegang));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /auth/pwa-qr — QR-code afbeelding voor PWA-installatie (alleen ingelogd)
router.get("/auth/pwa-qr", async (req, res): Promise<void> => {
  try {
    if (!req.session.userId) return void res.status(401).json({ error: "Niet ingelogd" });
    const domein = publiekeAppUrl()?.replace(/^https?:\/\//, "") ?? req.get("host") ?? "";
    // Installatie hoort op /app/ te gebeuren: daar geldt het manifest van de
    // monteuromgeving (scope /app/). Op Connect-pagina's wint het desktop-manifest.
    const url = domein ? `https://${domein}/app/` : "/app/";
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

// Bron van waarheid voor de installatielinks van de monteur-app.
function appStoreUrl(): string {
  return (process.env.MONTEUR_APP_STORE_URL ?? "").trim();
}
function playStoreUrl(): string {
  return (process.env.MONTEUR_PLAY_STORE_URL ?? "").trim();
}
function bepaalAppInstallatieUrl(): string {
  // Voorkeursvolgorde zonder expliciet platform: App Store, dan Google Play,
  // dan het Expo-dev-domein (alleen in ontwikkeling), dan de publieke /app-pagina.
  const ios = appStoreUrl();
  if (ios) return ios;
  const android = playStoreUrl();
  if (android) return android;
  const expoDomain = process.env.REPLIT_EXPO_DEV_DOMAIN ?? "";
  if (expoDomain) return `exp://${expoDomain}`;
  const basis = publiekeAppUrl();
  return basis ? `${basis}/app` : "";
}

// GET /auth/app-installatie-info — publieke info voor de installatiepagina /app.
// Bewust zonder login: de pagina wordt per WhatsApp naar medewerkers gestuurd
// die nog geen account hebben. Bevat uitsluitend de (publieke) store-link.
router.get("/auth/app-installatie-info", async (req, res): Promise<void> => {
  try {
    res.json({
      store_url: appStoreUrl() || null,
      play_store_url: playStoreUrl() || null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /auth/app-qr — QR-code afbeelding voor FPS Monteur-app via Expo Go (alleen ingelogd)
router.get("/auth/app-qr", async (req, res): Promise<void> => {
  try {
    if (!req.session.userId) return void res.status(401).json({ error: "Niet ingelogd" });
    // Optioneel ?platform=ios|android voor een platform-specifieke QR.
    // Zonder platform: voorkeursvolgorde uit bepaalAppInstallatieUrl()
    // (App Store → Google Play → Expo-dev-domein → publieke /app-pagina).
    const platform = typeof req.query.platform === "string" ? req.query.platform : "";
    let url: string;
    if (platform === "ios") {
      url = appStoreUrl();
    } else if (platform === "android") {
      url = playStoreUrl();
    } else if (platform) {
      return void res.status(400).json({ error: "Ongeldig platform; gebruik ios of android." });
    } else {
      url = bepaalAppInstallatieUrl();
    }
    if (!url) return void res.status(404).json({ error: "Er is nog geen installatielink beschikbaar." });
    const qrBuffer = await QRCode.toBuffer(url, {
      type: "png",
      width: 360,
      margin: 2,
      color: { dark: "#212631", light: "#FFFFFF" },
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.end(qrBuffer);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /auth/pwa-url — geeft de PWA-URL als JSON terug
router.get("/auth/pwa-url", async (req, res): Promise<void> => {
  try {
    if (!req.session.userId) return void res.status(401).json({ error: "Niet ingelogd" });
    const domein = publiekeAppUrl()?.replace(/^https?:\/\//, "") ?? req.get("host") ?? "";
    // Installatie hoort op /app/ te gebeuren: daar geldt het manifest van de
    // monteuromgeving (scope /app/). Op Connect-pagina's wint het desktop-manifest.
    const url = domein ? `https://${domein}/app/` : "/app/";
    res.json({ url });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /auth/e2e-rate-reset — wist de in-memory login-rate-limiter.
// Alleen beschikbaar in development; geeft 404 in productie.
// Bedoeld voor de e2e-web-runner zodat de limiter leeg is vóór de testsuite
// zonder dat de server herstart hoeft te worden (waardoor sessies verloren gaan).
router.delete("/auth/e2e-rate-reset", (req, res): void => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Niet gevonden" });
    return;
  }
  loginRateMap.clear();
  strikteLoginStore.resetAll();
  strikteTfaStore.resetAll();
  wachtwoordVergetenStore.resetAll();
  wachtwoordResetStore.resetAll();
  req.log.info("e2e-rate-reset: loginRateMap + strikte limiters gewist");
  res.status(204).end();
});

// GET /auth/me — via requireAuth zodat ook de mobiele app (bearer-token) hier
// haar gebruiker + effectieve bevoegdheden kan verversen bij het openen
// (APP_01 acceptatie 6). Voor web verandert er niets: zonder sessie blijft
// het antwoord 401.
router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  try {
    const id = req.session.userId;
    if (!id) {
      return void res.status(401).json({ error: "Niet ingelogd" });
    }
    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, id));
    if (!g || !g.actief) {
      req.session.destroy(() => {});
      return void res.status(401).json({ error: "Niet ingelogd" });
    }
    const [bevMe, uitvoerendMe, loonfundamentToegang] = await Promise.all([
      berekenEffectieveBevoegdheden(g.id),
      berekenIsUitvoerendVeldViaDb(g.id, g.rol),
      heeftLoonfundamentIdentiteit(g.id),
    ]);
    res.json(mapAuthGebruiker(g, bevMe, uitvoerendMe, [...(await haalActieveFunctieNamen(g.id))], loonfundamentToegang));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

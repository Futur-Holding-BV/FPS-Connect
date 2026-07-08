// Eerste-installatie bootstrap: zolang de gebruikerstabel leeg is, mag hierlangs
// éénmalig de eerste hoofdbeheerder aangemaakt worden (publiek, geen sessie
// nodig). Zodra er één gebruiker bestaat, is dit pad permanent en fail-closed
// dicht (403) — ook bij gelijktijdige verzoeken (pg_advisory_xact_lock +
// hertelling binnen de transactie).
import { Router } from "express";
import { db, gebruikersTable } from "@workspace/db";
import { count, sql } from "drizzle-orm";
import { maakGebruikerAan, isEmailConflictFout } from "../lib/gebruiker-aanmaken";

const router = Router();

// Willekeurige, vaste 64-bit sleutel voor de advisory lock — uniek voor dit
// bootstrap-endpoint zodat het geen andere pg_advisory_xact_lock-gebruikers
// (die er momenteel niet zijn) kan raken.
const BOOTSTRAP_LOCK_KEY = 7_193_042_615_887n;

// ── In-memory rate-limiter, zelfde patroon als /auth/login maar strenger:
// dit endpoint mag na de eerste succesvolle installatie sowieso nooit meer
// slagen, maar blijft zo ook beschermd tegen aftasten vóór dat moment.
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const rateMap = new Map<string, RateLimitEntry>();
const RL_MAX = 5;
const RL_VENSTER_MS = 15 * 60 * 1000;

function checkInstallatieRateLimit(req: import("express").Request, res: import("express").Response): boolean {
  const ip = req.ip ?? "onbekend";
  const nu = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || nu > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: nu + RL_VENSTER_MS });
    return true;
  }
  entry.count++;
  if (entry.count > RL_MAX) {
    const wachtSec = Math.ceil((entry.resetAt - nu) / 1000);
    res.setHeader("Retry-After", String(wachtSec));
    res.status(429).json({ error: "Te veel pogingen, probeer het later opnieuw" });
    return false;
  }
  return true;
}

setInterval(() => {
  const nu = Date.now();
  for (const [ip, entry] of rateMap.entries()) {
    if (nu > entry.resetAt) rateMap.delete(ip);
  }
}, 30 * 60 * 1000).unref();

async function isBootstrapBeschikbaar(): Promise<boolean> {
  const [{ aantal }] = await db.select({ aantal: count() }).from(gebruikersTable);
  return aantal === 0;
}

// GET /installatie/status — publiek, alleen een boolean, geen andere info
router.get("/installatie/status", async (req, res): Promise<void> => {
  try {
    res.json({ bootstrap_beschikbaar: await isBootstrapBeschikbaar() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /installatie — eerste hoofdbeheerder aanmaken (publiek, eenmalig)
router.post("/installatie", async (req, res): Promise<void> => {
  if (!checkInstallatieRateLimit(req, res)) return;
  try {
    // Snelle fail-closed check vóór de transactie: voorkomt onnodig
    // transactie/lock-overhead in het overgrote-meerderheid-geval dat de
    // installatie al voltooid is.
    if (!(await isBootstrapBeschikbaar())) {
      return void res.status(403).json({ error: "Installatie is al voltooid" });
    }

    const { naam, bedrijfsnaam, email, wachtwoord } = req.body ?? {};
    if (!naam || !bedrijfsnaam || !email || !wachtwoord) {
      return void res
        .status(400)
        .json({ error: "naam, bedrijfsnaam, email en wachtwoord zijn verplicht" });
    }
    if (String(wachtwoord).length < 8) {
      return void res.status(400).json({ error: "Wachtwoord moet minimaal 8 tekens bevatten" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return void res.status(400).json({ error: "Ongeldig e-mailadres" });
    }

    const gebruiker = await db.transaction(async (tx) => {
      // Advisory lock voor de duur van de transactie: seriali­seert gelijktijdige
      // bootstrap-pogingen zodat de hertelling hieronder betrouwbaar is.
      await tx.execute(sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`);

      const [{ aantal }] = await tx.select({ aantal: count() }).from(gebruikersTable);
      if (aantal > 0) {
        // Iemand anders won de race — geef een herkenbaar signaal terug.
        throw new Error("BOOTSTRAP_AL_VOLTOOID");
      }

      return maakGebruikerAan(tx, {
        naam: String(naam),
        email: String(email),
        rol: "hoofdbeheerder",
        wachtwoord: String(wachtwoord),
        bedrijf: String(bedrijfsnaam),
        taal: "nl",
        uitnodigingStatus: "geaccepteerd",
      });
    });

    req.log.info("First installation completed");
    req.session.pendingUserId = gebruiker.id;
    delete req.session.userId;
    delete req.session.pendingSecret;
    res.status(201).json({ status: "setup_2fa" });
  } catch (err: any) {
    if (err?.message === "BOOTSTRAP_AL_VOLTOOID") {
      return void res.status(403).json({ error: "Installatie is al voltooid" });
    }
    if (isEmailConflictFout(err)) {
      return void res.status(409).json({ error: "Dit e-mailadres is al in gebruik" });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;

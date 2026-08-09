import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { RequestHandler } from "express";
import { pool } from "@workspace/db";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    rol?: string;
    pendingUserId?: number;
    pendingSecret?: string;
    // Activatie via uitnodiging: het gekozen wachtwoord wordt pas definitief
    // opgeslagen ná geslaagde 2FA-bevestiging (zie /auth/2fa/activeren).
    pendingWachtwoordHash?: string;
    pendingTaal?: string;
    // Bindt de pending activatie aan de gebruikte uitnodigingstoken zodat een
    // stale sessie na consumptie van de uitnodiging niets meer kan schrijven.
    pendingActivatieToken?: string;
  }
}

const secret = process.env["SESSION_SECRET"];

if (!secret) {
  throw new Error(
    "SESSION_SECRET environment variable is required but was not provided.",
  );
}

const PgStore = connectPgSimple(session);

const store = new PgStore({
  pool,
  tableName: "session",
  createTableIfMissing: false,
});

export const sessionMiddleware: RequestHandler = session({
  store,
  secret,
  name: "fps.sid",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 60 * 12,
  },
});

/**
 * Niet-persisterende sessie voor bearer-geauthenticeerde verzoeken (mobiele
 * app). Bearer-auth is stateless en heeft de sessie-store niet nodig. Door deze
 * stub op `req.session` te zetten draait de connect-pg-simple store niet mee:
 * er wordt geen rij in de session-tabel geschreven en geen cookie gezet. De
 * stub ondersteunt het lezen/schrijven van velden (userId, rol) en biedt no-op
 * lifecycle-methodes zodat handlers die bv. `destroy()` aanroepen niet crashen.
 */
export function maakStatelozeSessie(): session.Session & Partial<session.SessionData> {
  const stub: Record<string, unknown> = {
    id: "",
    cookie: {},
  };
  const zelf = stub as unknown as session.Session & Partial<session.SessionData>;
  const noop = (cb?: (err?: unknown) => void): session.Session => {
    if (typeof cb === "function") cb();
    return zelf;
  };
  stub["regenerate"] = noop;
  stub["destroy"] = noop;
  stub["reload"] = noop;
  stub["save"] = noop;
  stub["touch"] = (): session.Session => zelf;
  stub["resetMaxAge"] = (): session.Session => zelf;
  return zelf;
}

/**
 * Beëindigt alle actieve web-sessies van een gebruiker (bv. na een
 * admin-wachtwoordreset of de expliciete "sessies beëindigen"-actie).
 * `sess` is een json-kolom die o.a. `userId` bevat — geen aparte index nodig
 * gezien de beperkte tabelgrootte (12u maxAge, mobiel gebruikt geen sessierij).
 * `behalveSid` voorkomt dat de hoofdbeheerder zichzelf uitlogt wanneer die
 * zijn eigen wachtwoord reset.
 */
export async function beeindigSessiesVanGebruiker(
  gebruikerId: number,
  behalveSid?: string,
): Promise<number> {
  const result = await pool.query(
    `DELETE FROM "session" WHERE (sess->>'userId')::int = $1 AND sid IS DISTINCT FROM $2`,
    [gebruikerId, behalveSid ?? null],
  );
  return result.rowCount ?? 0;
}

export async function ensureSessionTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`,
  );
}

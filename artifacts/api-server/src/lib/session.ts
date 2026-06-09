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

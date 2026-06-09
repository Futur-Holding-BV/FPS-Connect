import type { Request, Response, NextFunction, RequestHandler } from "express";
import { db, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { leesToken } from "../lib/token";

declare module "express-session" {
  interface SessionData {
    rol?: string;
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.session.userId) {
    next();
    return;
  }
  // Mobiele app: bearer-token in plaats van sessie-cookie.
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const uid = leesToken(header.slice(7));
    if (uid) {
      try {
        // Verifieer dat het account nog bestaat én actief is; een eerder
        // uitgegeven token mag niet bruikbaar blijven na deactivatie.
        const [g] = await db
          .select({ actief: gebruikersTable.actief, rol: gebruikersTable.rol })
          .from(gebruikersTable)
          .where(eq(gebruikersTable.id, uid));
        if (g && g.actief) {
          req.session.userId = uid;
          req.session.rol = g.rol;
          next();
          return;
        }
      } catch (err) {
        req.log.error(err);
        res.status(500).json({ error: "Interne serverfout" });
        return;
      }
    }
  }
  res.status(401).json({ error: "Niet ingelogd" });
}

export function requireRol(...toegestaneRollen: string[]): RequestHandler {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const id = req.session.userId;
    if (!id) {
      res.status(401).json({ error: "Niet ingelogd" });
      return;
    }
    try {
      const [g] = await db
        .select({ rol: gebruikersTable.rol })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, id));
      // De hoofdbeheerder heeft volledige rechten en passeert elke rolcontrole.
      if (!g || (g.rol !== "hoofdbeheerder" && !toegestaneRollen.includes(g.rol))) {
        res.status(403).json({ error: "Geen toegang" });
        return;
      }
      next();
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  };
}

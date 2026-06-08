import type { Request, Response, NextFunction, RequestHandler } from "express";
import { db, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session.userId) {
    res.status(401).json({ error: "Niet ingelogd" });
    return;
  }
  next();
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
      if (!g || !toegestaneRollen.includes(g.rol)) {
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

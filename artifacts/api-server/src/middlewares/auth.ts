import type { Request, Response, NextFunction, RequestHandler } from "express";
import { db, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { leesToken } from "../lib/token";
import {
  heeftNiveau,
  type ModuleId,
} from "@workspace/permissies";

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

export function requireBevoegdheid(module: ModuleId, minNiveau: number): RequestHandler {
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
        .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, id));
      if (!g) {
        res.status(403).json({ error: "Geen toegang" });
        return;
      }
      // Hoofdbeheerder bypasses de matrix volledig.
      if (g.rol === "hoofdbeheerder") {
        next();
        return;
      }
      // Klant heeft geen toegang tot interne modules.
      if (g.rol === "klant") {
        res.status(403).json({ error: "Geen toegang" });
        return;
      }
      // Toegang komt puur uit de bevoegdheden-matrix.
      const bev = (g.bevoegdheden as Record<string, number> | null) ?? {};
      if (!heeftNiveau(bev, module, minNiveau)) {
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

/**
 * Variant van requireBevoegdheid die klanten doorlaat voor lees-endpoints.
 * Object-level scope (klant ziet alleen eigen gebouwen) wordt geregeld in de
 * handler via de toewijzingsbeperking (beperkt) + toegewezenGebouwIds.
 * Gebruik voor GET-routes die zowel interne gebruikers als klanten nodig hebben.
 */
export function requireBevoegdheidOfKlant(module: ModuleId, minNiveau: number): RequestHandler {
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
        .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, id));
      if (!g) {
        res.status(403).json({ error: "Geen toegang" });
        return;
      }
      if (g.rol === "hoofdbeheerder") {
        next();
        return;
      }
      // Klant heeft via het klantportaal leestoegang; scope-filtering vindt
      // plaats in de handler (toewijzingsbeperking / toegewezenGebouwIds).
      if (g.rol === "klant") {
        next();
        return;
      }
      // Toegang komt puur uit de bevoegdheden-matrix.
      const bev = (g.bevoegdheden as Record<string, number> | null) ?? {};
      if (!heeftNiveau(bev, module, minNiveau)) {
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

/**
 * Laat door zodra de gebruiker aan TEN MINSTE EEN van de opgegeven
 * (module, niveau)-eisen voldoet. Voor endpoints die door meerdere modules
 * worden gedeeld — bijvoorbeeld een minimale lijst met toewijsbare personen
 * die zowel bij gebouwteams, spot-uitvoering als onderhoud nodig is — zodat een
 * gebruiker met gebouw- of voorzieningenrechten kan toewijzen zonder de
 * volledige gebruikersbevoegdheid te hebben. Hoofdbeheerder mag altijd; klant
 * nooit.
 */
export function requireEnigeBevoegdheid(
  eisen: Array<[ModuleId, number]>,
): RequestHandler {
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
        .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, id));
      if (!g) {
        res.status(403).json({ error: "Geen toegang" });
        return;
      }
      if (g.rol === "hoofdbeheerder") {
        next();
        return;
      }
      if (g.rol === "klant") {
        res.status(403).json({ error: "Geen toegang" });
        return;
      }
      const bev = (g.bevoegdheden as Record<string, number> | null) ?? {};
      if (eisen.some(([module, minNiveau]) => heeftNiveau(bev, module, minNiveau))) {
        next();
        return;
      }
      res.status(403).json({ error: "Geen toegang" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  };
}

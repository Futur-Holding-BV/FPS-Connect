import type { Request, Response, NextFunction, RequestHandler } from "express";
import { db, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { leesToken } from "../lib/token";
import {
  heeftNiveau,
  type ModuleId,
} from "@workspace/permissies";
import { PermissieService } from "../lib/permissie-service";
import { effectieveContext } from "../utils/rol";

declare module "express-session" {
  interface SessionData {
    rol?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      permissies?: PermissieService;
    }
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
    const payload = leesToken(header.slice(7));
    if (payload) {
      try {
        const [g] = await db
          .select({
            actief: gebruikersTable.actief,
            rol: gebruikersTable.rol,
            tokenVersie: gebruikersTable.tokenVersie,
          })
          .from(gebruikersTable)
          .where(eq(gebruikersTable.id, payload.uid));
        // tokenVersie moet exact overeenkomen — een admin-wachtwoordreset of
        // "sessies beëindigen" hoogt de kolom op en trekt zo alle eerder
        // uitgegeven tokens in, zonder blocklist.
        if (g && g.actief && g.tokenVersie === payload.tv) {
          req.session.userId = payload.uid;
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

/**
 * Blokkeert alle data-routes zolang de gebruiker een verplichte
 * wachtwoordwijziging openstaand heeft (na een admin-reset of tijdelijk
 * wachtwoord). Fail-closed op de server — de frontend toont een blokkerende
 * modal, maar de daadwerkelijke afdwinging gebeurt hier, ongeacht wat de
 * client stuurt. `/auth/*` routes staan hier bewust buiten: die router is
 * vóór requireAuth geregistreerd en blijft dus altijd bereikbaar, zodat de
 * gebruiker zelf via POST /auth/wachtwoord-wijzigen (of de resetlink) weer
 * verder kan. Werkt op de ECHTE sessie-gebruiker, nooit op een impersonatie.
 */
export async function blokkeerBijWachtwoordWijzigenVereist(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const id = req.session.userId;
  if (!id) {
    next();
    return;
  }
  try {
    const [g] = await db
      .select({ moetWachtwoordWijzigen: gebruikersTable.moetWachtwoordWijzigen })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, id));
    if (g?.moetWachtwoordWijzigen) {
      res.status(403).json({
        error: "Wachtwoord wijzigen is verplicht voordat u verdergaat",
        code: "WACHTWOORD_WIJZIGEN_VEREIST",
      });
      return;
    }
    next();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
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
    // Als laadPermissies al heeft gedraaid, gebruik de gecachte service — geen extra DB-ronde.
    if (req.permissies) {
      if (req.permissies.isHoofdbeheerder) { next(); return; }
      if (req.permissies.isKlant) { res.status(403).json({ error: "Geen toegang" }); return; }
      if (req.permissies.heeftModuleRecht(module, minNiveau)) { next(); return; }
      res.status(403).json({ error: "Geen toegang" });
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
    // Als laadPermissies al heeft gedraaid, gebruik de gecachte service — geen extra DB-ronde.
    if (req.permissies) {
      if (req.permissies.isHoofdbeheerder || req.permissies.isKlant) { next(); return; }
      if (req.permissies.heeftModuleRecht(module, minNiveau)) { next(); return; }
      res.status(403).json({ error: "Geen toegang" });
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
/**
 * Laadt de PermissieService voor de effectieve gebruiker (incl. impersonatie)
 * en koppelt hem als req.permissies. Altijd na requireAuth plaatsen.
 */
export async function laadPermissies(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const id = req.session.userId;
  if (!id) {
    next();
    return;
  }
  try {
    const ctx = await effectieveContext(req);
    const svc = new PermissieService(ctx.userId);
    await svc.laad();
    req.permissies = svc;
    next();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
}

/**
 * Factory die een RequestHandler maakt die controleert of de gebruiker een
 * actief object-recht heeft op het object waarvan het id uit een route-parameter
 * komt. Valt terug op module-recht als dat voldoende is (heeftToegang).
 *
 * Gebruik: router.get("/:id/detail", requireObjectRecht("gebouw", "id"), handler)
 */
export function requireObjectRecht(
  objectType: string,
  idParam: string,
  module: string,
  minNiveau = 1,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawParam = req.params[idParam];
    const objectId = parseInt(typeof rawParam === "string" ? rawParam : "", 10);
    if (isNaN(objectId)) {
      res.status(400).json({ error: "Ongeldig object-id" });
      return;
    }
    const permissies = req.permissies;
    if (!permissies) {
      res.status(401).json({ error: "Niet ingelogd" });
      return;
    }
    if (!permissies.heeftToegang(objectType, objectId, module, minNiveau)) {
      res.status(403).json({ error: "Geen toegang" });
      return;
    }
    next();
  };
}

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

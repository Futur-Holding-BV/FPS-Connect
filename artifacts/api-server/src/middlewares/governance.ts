import type { Request, Response, NextFunction } from "express";
import {
  beoordeelRisico,
  isGovernanceUitgesloten,
  logGovernanceCheck,
  type GovernanceContext,
} from "../services/governance-engine";
import { getSessionGebruikerNaam } from "./auth";

const SCHRIJF_METHODES = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function governanceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!SCHRIJF_METHODES.has(req.method)) return next();
  if (isGovernanceUitgesloten(req.path)) return next();

  // Naam-opzoek is asynchroon (DB-opzoek); de beoordeling zelf verloopt op
  // userId + rol (altijd synchroon beschikbaar). De naam is alleen voor logging.
  getSessionGebruikerNaam(req)
    .then((naam) => {
      const ctx: GovernanceContext = {
        gebruikerId: req.session.userId ?? null,
        gebruikerNaam: naam,
        rol: req.session.rol ?? null,
        methode: req.method,
        route: req.path,
        ipAdres: req.ip ?? null,
        userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      };

      const beoordeling = beoordeelRisico(ctx);

      // Kritiek + geen hoofdbeheerder → blokkeer
      if (beoordeling.niveau === "kritiek" && ctx.rol !== "hoofdbeheerder") {
        logGovernanceCheck({ ...ctx, ...beoordeling, geblokkeerd: true }).catch(() => {});
        res.status(403).json({
          fout: "Deze actie vereist goedkeuring van de hoofdbeheerder.",
          code: "GOVERNANCE_GEBLOKKEERD",
          risico_niveau: "kritiek",
          motivatie: beoordeling.motivatie,
        });
        return;
      }

      // Alle andere niveaus: doorsturen + log na afloop van request
      const origJson = res.json.bind(res);
      res.json = function (body: unknown) {
        const result = origJson(body);
        // Alleen loggen bij succesvolle responses
        if (res.statusCode < 400) {
          logGovernanceCheck({
            ...ctx,
            ...beoordeling,
            geblokkeerd: false,
            statuscode: res.statusCode,
          }).catch(() => {});
        }
        return result;
      };

      next();
    })
    .catch((err) => {
      // Naam-opzoek mislukt → doorgaan zonder naam (niet-blokkerend)
      req.log?.warn({ err }, "governance: naam-opzoek mislukt, doorgaan zonder naam");
      const ctx: GovernanceContext = {
        gebruikerId: req.session.userId ?? null,
        gebruikerNaam: null,
        rol: req.session.rol ?? null,
        methode: req.method,
        route: req.path,
        ipAdres: req.ip ?? null,
        userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      };

      const beoordeling = beoordeelRisico(ctx);

      if (beoordeling.niveau === "kritiek" && ctx.rol !== "hoofdbeheerder") {
        logGovernanceCheck({ ...ctx, ...beoordeling, geblokkeerd: true }).catch(() => {});
        res.status(403).json({
          fout: "Deze actie vereist goedkeuring van de hoofdbeheerder.",
          code: "GOVERNANCE_GEBLOKKEERD",
          risico_niveau: "kritiek",
          motivatie: beoordeling.motivatie,
        });
        return;
      }

      const origJson = res.json.bind(res);
      res.json = function (body: unknown) {
        const result = origJson(body);
        if (res.statusCode < 400) {
          logGovernanceCheck({
            ...ctx,
            ...beoordeling,
            geblokkeerd: false,
            statuscode: res.statusCode,
          }).catch(() => {});
        }
        return result;
      };

      next();
    });
}

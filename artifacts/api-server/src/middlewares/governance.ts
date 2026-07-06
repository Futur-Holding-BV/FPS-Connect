import type { Request, Response, NextFunction } from "express";
import {
  beoordeelRisico,
  isGovernanceUitgesloten,
  logGovernanceCheck,
  type GovernanceContext,
} from "../services/governance-engine";

const SCHRIJF_METHODES = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function governanceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!SCHRIJF_METHODES.has(req.method)) return next();
  if (isGovernanceUitgesloten(req.path)) return next();

  const sessie = req.session as unknown as Record<string, unknown> | undefined;
  const ctx: GovernanceContext = {
    gebruikerId: (sessie?.userId as number | null | undefined) ?? null,
    gebruikerNaam:
      (sessie?.naam as string | null | undefined) ??
      (sessie?.gebruikerNaam as string | null | undefined) ??
      null,
    rol: (sessie?.rol as string | null | undefined) ?? null,
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
}

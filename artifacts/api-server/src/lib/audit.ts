import type { Request, Response, NextFunction } from "express";
import { db, auditLogTable } from "@workspace/db";
import type { AuditLogInvoer } from "@workspace/db";

// ── Types ──────────────────────────────────────────────────────────────────────

export type AuditParams = Omit<AuditLogInvoer, "id" | "tijdstip">;

// ── Kern: logAudit() ───────────────────────────────────────────────────────────
// Fire-and-forget: audit logging mag nooit de hoofdflow blokkeren of laten crashen.

export function logAudit(params: AuditParams): void {
  db.insert(auditLogTable)
    .values({
      ...params,
      tijdstip: new Date(),
    })
    .catch(() => {});
}

// ── Middleware ─────────────────────────────────────────────────────────────────
// Onderschept alle muterende requests (POST/PATCH/PUT/DELETE) automatisch en
// schrijft een audit-regel op basis van route + methode + response.
// Biedt: gebruiker, tijdstip, IP, sessie, module, actie, entiteit, entiteitId,
//        nieuwe waarde (response body).
// Biedt NIET: oude waarde (vereist expliciete logAudit()-aanroep vanuit route).

const METHODE_NAAR_ACTIE: Record<string, string> = {
  POST: "aanmaken",
  PUT: "bijwerken",
  PATCH: "bijwerken",
  DELETE: "verwijderen",
};

const SLA_OVER = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/totp-verify",
  "/api/muis-gebeurtenissen",
  "/api/mijn/online",
]);

function routeNaarInfo(req: Request): {
  module: string;
  entiteit: string;
  entiteitId: number | null;
} | null {
  const actie = METHODE_NAAR_ACTIE[req.method];
  if (!actie) return null;
  if (SLA_OVER.has(req.path)) return null;

  const routePath: string =
    (req.route?.path as string | undefined) ?? req.path ?? "";

  const segmenten = routePath
    .replace(/^\//, "")
    .split("/")
    .filter((s) => !s.startsWith(":"));

  if (segmenten.length === 0) return null;

  const module = segmenten.join("/");
  const entiteit = segmenten[segmenten.length - 1] ?? segmenten[0] ?? "onbekend";

  const entiteitIdRaw =
    (req.params as Record<string, string>).id ??
    (req.params as Record<string, string>).bonId ??
    (req.params as Record<string, string>).itemId ??
    null;
  const entiteitId = entiteitIdRaw ? parseInt(entiteitIdRaw, 10) : null;

  return { module, entiteit, entiteitId: isNaN(entiteitId ?? NaN) ? null : entiteitId };
}

export function maakAuditMiddleware() {
  return function auditMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (!METHODE_NAAR_ACTIE[req.method]) {
      return next();
    }

    const origJson = res.json.bind(res);

    res.json = function (body: unknown) {
      const result = origJson(body);

      if (res.statusCode < 400) {
        const info = routeNaarInfo(req);
        if (info) {
          const gebruikerId =
            (req.session as unknown as Record<string, unknown> | undefined)?.userId as
              | number
              | null
              | undefined;

          const nieuweWaarde =
            typeof body === "object" && body !== null
              ? (body as Record<string, unknown>)
              : null;

          logAudit({
            gebruikerId: gebruikerId ?? null,
            gebruikerNaam: null,
            ipAdres: req.ip ?? null,
            sessieId: (req as unknown as { sessionID?: string }).sessionID ?? null,
            module: info.module,
            actie: METHODE_NAAR_ACTIE[req.method] ?? "bijwerken",
            entiteit: info.entiteit,
            entiteitId: info.entiteitId,
            entiteitNaam: null,
            oudeWaarde: null,
            nieuweWaarde,
            workflowStatus: null,
            gebouwId: null,
            medewerkerId: null,
            documentId: null,
            meta: {
              methode: req.method,
              pad: req.path,
              statuscode: res.statusCode,
            } as Record<string, unknown>,
          });
        }
      }

      return result;
    };

    next();
  };
}

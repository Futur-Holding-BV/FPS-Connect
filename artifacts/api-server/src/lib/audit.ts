import type { Request, Response, NextFunction } from "express";
import { db, auditLogTable } from "@workspace/db";
import type { AuditLogInvoer } from "@workspace/db";
import { logger } from "./logger";
import { getSessionGebruikerNaam } from "../middlewares/auth";

// ── Types ──────────────────────────────────────────────────────────────────────

export type AuditParams = Omit<AuditLogInvoer, "id" | "tijdstip">;

// ── Gevoelige velden — worden altijd verwijderd (laatste vangnet) ───────────────

const GEVOELIGE_VELDEN = new Set([
  "wachtwoord",
  "password",
  "wachtwoord_hash",
  "hash",
  "totpSecret",
  "totp_secret",
  "secret",
  "token",
  "bearer",
  "authorization",
  "cookie",
  "sessie_id",
  "sessieId",
  "sessionId",
  "session_id",
  "bsn",
  "iban",
  "salaris",
  "salary",
  "loon",
  "creditcard",
  "credit_card",
  "cvv",
  "pin",
  "nieuw_wachtwoord",
  "huidig_wachtwoord",
  "nieuwWachtwoord",
  "huidigWachtwoord",
  "resetToken",
  "reset_token",
  "apiKey",
  "api_key",
  "privateKey",
  "private_key",
  "tijdelijk_wachtwoord",
  "tijdelijkWachtwoord",
  "reset_link",
  "resetLink",
]);

// ── Whitelist per entiteit ──────────────────────────────────────────────────────
// Exporteer zodat route-handlers uitbreidingen kunnen meegeven

export const AUDIT_WHITELIST_BASIS: ReadonlySet<string> = new Set([
  "id",
  "status",
  "workflowStatus",
  "workflow_status",
  "documentnummer",
  "projectnummer",
  "gebouwId",
  "gebouw_id",
  "module",
  "actie",
  "gebruikerId",
  "gebruiker_id",
  "tijdstip",
  "naam",
  "entiteit",
  "entiteitId",
  "entiteit_id",
  "entiteitNaam",
  "entiteit_naam",
  "actief",
  "rol",
  "module_sleutel",
  "type",
  "categorie",
  "prioriteit",
  "datum",
  "vervaldatum",
  "aangemaakt_op",
  "bijgewerkt_op",
  "aanmaakdatum",
]);

export const AUDIT_WHITELIST_PER_ENTITEIT: Record<string, ReadonlySet<string>> = {
  gebouwen: new Set(["adres", "stad", "postcode", "bouwjaar", "gebouwType"]),
  voorzieningen: new Set(["objectnummer", "locatie", "verdieping", "ruimte", "clusterId"]),
  documenten: new Set(["bestandsnaam", "versie", "goedgekeurd", "documentType"]),
  inspecties: new Set(["inspectieType", "resultaat", "inspecteur"]),
  onderhoud: new Set(["omschrijving", "deadline", "toegewezeneId"]),
  medewerkers: new Set(["functieId", "werkmaatschappij", "startdatum", "einddatum"]),
  offertes: new Set(["offerteNummer", "bedrag", "klantId", "geldigTot"]),
  opdrachten: new Set(["opdrachtNummer", "werkmaatschappij", "startdatum", "einddatum"]),
};

// ── Payload-sanitiser ──────────────────────────────────────────────────────────

const MAX_PAYLOAD_BYTES = 10 * 1024; // 10 KB
const MAX_NESTING = 3;
const MAX_ARRAY_ITEMS = 20;

export function saniteerPayload(
  body: unknown,
  entiteit?: string,
  _huidigeNesting = 0,
): Record<string, unknown> | null {
  if (body === null || body === undefined) return null;
  if (typeof body !== "object") return null;

  const whitelist: Set<string> = new Set([
    ...AUDIT_WHITELIST_BASIS,
    ...(entiteit && AUDIT_WHITELIST_PER_ENTITEIT[entiteit]
      ? AUDIT_WHITELIST_PER_ENTITEIT[entiteit]
      : []),
  ]);

  const gesaneerd = _saniteerDiepte(body as Record<string, unknown>, whitelist, 0);

  if (!gesaneerd || Object.keys(gesaneerd).length === 0) {
    return { __gesaneerd: true };
  }

  const geserialiseerd = JSON.stringify(gesaneerd);
  if (geserialiseerd.length > MAX_PAYLOAD_BYTES) {
    return { __afgekapt: true, __reden: "payload_te_groot" };
  }

  return gesaneerd;
}

function _saniteerDiepte(
  obj: Record<string, unknown>,
  whitelist: Set<string>,
  diepte: number,
): Record<string, unknown> {
  if (diepte >= MAX_NESTING) {
    return { __afgekapt: true };
  }

  const resultaat: Record<string, unknown> = {};

  for (const [sleutel, waarde] of Object.entries(obj)) {
    // Verwijder altijd gevoelige velden
    if (GEVOELIGE_VELDEN.has(sleutel)) continue;
    // Verwijder velden buiten de whitelist
    if (!whitelist.has(sleutel)) continue;

    if (Array.isArray(waarde)) {
      const afgekapt = waarde.length > MAX_ARRAY_ITEMS;
      const items = waarde.slice(0, MAX_ARRAY_ITEMS).map((item) => {
        if (typeof item === "object" && item !== null) {
          return _saniteerDiepte(item as Record<string, unknown>, whitelist, diepte + 1);
        }
        return item;
      });
      resultaat[sleutel] = afgekapt ? [...items, { __afgekapt: true }] : items;
    } else if (typeof waarde === "object" && waarde !== null) {
      resultaat[sleutel] = _saniteerDiepte(
        waarde as Record<string, unknown>,
        whitelist,
        diepte + 1,
      );
    } else {
      resultaat[sleutel] = waarde;
    }
  }

  return resultaat;
}

// ── Retry-teller (in-memory, voor diagnostics) ──────────────────────────────────

interface RetryStats {
  misluktTotaal: number;
  laatstefout: string | null;
  laatstefoutTijdstip: Date | null;
}

const _retryStats: RetryStats = {
  misluktTotaal: 0,
  laatstefout: null,
  laatstefoutTijdstip: null,
};

export function getAuditDiagnostics(): RetryStats & { omschrijving: string } {
  return {
    ..._retryStats,
    omschrijving: "In-memory teller voor definitief mislukte audit-inserts",
  };
}

// ── Kern: logAudit() ───────────────────────────────────────────────────────────
// Fire-and-forget met retry: max 2 herhaalpogingen, 500 ms backoff.
// Bij definitief falen: logger.warn + in-memory teller ophogen.

export function logAudit(params: AuditParams): void {
  // Centraal veiligheidsnet: saniteer oudeWaarde en nieuweWaarde ongeacht
  // waar de aanroep vandaan komt. Zo kunnen handmatige logAudit()-aanroepen
  // nooit gevoelige data in audit_log schrijven.
  const gesaneerdeParams: AuditParams = {
    ...params,
    oudeWaarde: params.oudeWaarde
      ? saniteerPayload(params.oudeWaarde as Record<string, unknown>, params.entiteit ?? undefined)
      : null,
    nieuweWaarde: params.nieuweWaarde
      ? saniteerPayload(params.nieuweWaarde as Record<string, unknown>, params.entiteit ?? undefined)
      : null,
    // sessieId wordt nooit opgeslagen — altijd op null zetten
    sessieId: null,
  };
  _logMetRetry(gesaneerdeParams, 0);
}

function _logMetRetry(params: AuditParams, poging: number): void {
  db.insert(auditLogTable)
    .values({
      ...params,
      tijdstip: new Date(),
    })
    .catch((err: unknown) => {
      if (poging < 2) {
        setTimeout(() => _logMetRetry(params, poging + 1), 500);
      } else {
        _retryStats.misluktTotaal += 1;
        _retryStats.laatstefout =
          err instanceof Error ? err.message : String(err);
        _retryStats.laatstefoutTijdstip = new Date();
        logger.warn(
          {
            fout: _retryStats.laatstefout,
            module: params.module,
            actie: params.actie,
            gebruikerId: params.gebruikerId,
          },
          "Audit-insert definitief mislukt na 3 pogingen",
        );
      }
    });
}

// ── Middleware ─────────────────────────────────────────────────────────────────
// Onderschept alle muterende requests (POST/PATCH/PUT/DELETE) automatisch en
// schrijft een audit-regel op basis van route + methode + response.
// Auth-routes zijn volledig uitgesloten — wachtwoorden, tokens en secrets
// mogen nooit in audit_log terechtkomen.
// Biedt: gebruiker, tijdstip, IP, sessie, module, actie, entiteit, entiteitId,
//        nieuwe waarde (gesaneerde response body).
// Biedt NIET: oude waarde (vereist expliciete logAudit()-aanroep vanuit route).

const METHODE_NAAR_ACTIE: Record<string, string> = {
  POST: "aanmaken",
  PUT: "bijwerken",
  PATCH: "bijwerken",
  DELETE: "verwijderen",
};

const SLA_OVER_EXACT = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/totp-verify",
  "/api/muis-gebeurtenissen",
  "/api/mijn/online",
]);

// Routes die zelf een gerichte logAudit()-aanroep doen met een specifieke
// actie/meta (bv. wachtwoordbeheer): de generieke auto-audit zou hier alleen
// een ruisig, ongenuanceerd tweede regel toevoegen. Matcht op het Express
// route-patroon (met :param), niet op het opgeloste pad met echte id's.
const SLA_OVER_ROUTE_PATROON = new Set([
  "/gebruikers/:id/wachtwoord-resetten",
  "/gebruikers/:id/sessies-beeindigen",
  "/gebruikers/:id/ontgrendelen",
]);

function isAuditUitgesloten(path: string, routePatroon?: string): boolean {
  // Alle /auth/* routes volledig uitsluiten — wachtwoorden, TOTP-secrets,
  // bearer-tokens en reset-tokens mogen nooit in de audit-log belanden.
  // Zowel /auth/ als /api/auth/ worden geblokkeerd (defensief voor eventuele
  // wijzigingen in middleware-volgorde of proxy-configuratie).
  if (path.startsWith("/auth/") || path === "/auth") return true;
  if (path.startsWith("/api/auth/") || path === "/api/auth") return true;
  if (SLA_OVER_EXACT.has(path)) return true;
  if (routePatroon && SLA_OVER_ROUTE_PATROON.has(routePatroon)) return true;
  return false;
}

function routeNaarInfo(req: Request): {
  module: string;
  entiteit: string;
  entiteitId: number | null;
} | null {
  const actie = METHODE_NAAR_ACTIE[req.method];
  if (!actie) return null;
  const routePatroon = req.route?.path as string | undefined;
  if (isAuditUitgesloten(req.path, routePatroon)) return null;

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
          // Naam wordt asynchroon opgezocht (DB-opzoek) en daarna pas gelogd;
          // de response is al verstuurd dus dit is fire-and-forget.
          const gebruikerId = req.session.userId ?? null;
          const rol = req.session.rol ?? null;
          const statuscode = res.statusCode;
          const methode = req.method;
          const pad = req.path;

          const gesaneerdBody =
            typeof body === "object" && body !== null
              ? saniteerPayload(body as Record<string, unknown>, info.entiteit)
              : null;

          // Naam asynchroon ophalen; bij fout → null, maar logAudit wordt ALTIJD
          // aangeroepen. De .catch(() => null) staat vóór .then() zodat een
          // mislukte naam-opzoek nooit de audit-insert zelf blokkeert.
          getSessionGebruikerNaam(req)
            .catch(() => null)
            .then((gebruikerNaam) => {
              logAudit({
                gebruikerId,
                gebruikerNaam,
                ipAdres: req.ip ?? null,
                sessieId: null,
                module: info.module,
                actie: METHODE_NAAR_ACTIE[methode] ?? "bijwerken",
                entiteit: info.entiteit,
                entiteitId: info.entiteitId,
                entiteitNaam: null,
                oudeWaarde: null,
                nieuweWaarde: gesaneerdBody,
                workflowStatus: null,
                gebouwId: null,
                medewerkerId: null,
                documentId: null,
                meta: {
                  methode,
                  pad,
                  statuscode,
                  rol: rol ?? undefined,
                } as Record<string, unknown>,
              });
            })
            .catch(() => {
              /* logAudit-fouten nooit naar request laten lekken */
            });
        }
      }

      return result;
    };

    next();
  };
}

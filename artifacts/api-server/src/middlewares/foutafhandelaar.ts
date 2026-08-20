/**
 * Centrale foutafhandelaar (SCHULD_01 punten 21 + 36).
 *
 * Elke onverwachte fout die een route via throw of next(err) laat ontsnappen
 * komt hier terecht. De volledige fout wordt server-side gelogd onder een
 * verwijzingscode; naar buiten gaat uitsluitend een neutrale melding met die
 * code. Zo lekt er nooit een tabel-, kolom- of constraintnaam naar de browser,
 * en kan een gebruiker de code doorgeven zodat de fout in het log terug te
 * vinden is.
 */
import type { Request, Response, NextFunction } from "express";
import { createHmac, randomBytes } from "node:crypto";
import * as Sentry from "@sentry/node";
import { normaliseerMonitoringPad } from "@workspace/foutmonitoring";
import { logger } from "../lib/logger";

export function maakVeiligHandelingslabel(req: Request): {
  handeling: string;
  pad: string;
} {
  const routePad =
    typeof req.route?.path === "string" ? req.route.path : undefined;
  const sjabloon =
    routePad && /^[a-zA-Z0-9_./:-]{1,160}$/.test(routePad)
      ? `${req.baseUrl}${routePad}`.replace(/\/{2,}/g, "/")
      : undefined;
  const pad =
    sjabloon && /^\/[a-zA-Z0-9_./:-]{1,180}$/.test(sjabloon)
      ? sjabloon
      : (normaliseerMonitoringPad(req.originalUrl ?? req.path) ?? "/onbekend");
  return {
    handeling: `${req.method.toUpperCase()}:${pad}`,
    pad,
  };
}

export function maakRoutingBewijs(
  verwijzingscode: string,
  handeling: string,
): string | undefined {
  const geheim = process.env["SENTRY_ROUTING_SIGNING_SECRET"];
  if (!geheim || geheim.length < 32) return undefined;
  return createHmac("sha256", geheim)
    .update(`${verwijzingscode}:${handeling}`)
    .digest("hex");
}

export function maakVerwijzingscode(): string {
  return `FPS-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/** Patronen die verraden dat een foutmelding databank-interne details bevat. */
const DB_DETAIL_PATRONEN =
  /\b(column|relation|constraint|duplicate key|violates|syntax error|null value|foreign key|unique|pg_|drizzle|invalid input syntax)\b/i;

/**
 * Geef een foutmelding terug die veilig aan de client getoond kan worden.
 * Curated (Nederlandstalige) meldingen blijven staan; alles wat op een
 * database- of driverfout lijkt wordt vervangen door een neutrale tekst.
 */
export function veiligeFoutmelding(err: unknown, standaard = "Er is een fout opgetreden"): string {
  const melding = err instanceof Error ? err.message : String(err);
  if (!melding || DB_DETAIL_PATRONEN.test(melding)) return standaard;
  return melding.slice(0, 300);
}

export function foutafhandelaar(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  // Body-parse-fouten (kapotte JSON) zijn een clientfout, geen serverfout.
  if (err instanceof SyntaxError && "body" in (err as object)) {
    res.status(400).json({ error: "Ongeldig verzoek: de meegestuurde gegevens zijn geen geldige JSON" });
    return;
  }

  // CORS-weigering uit de origin-callback.
  if (err instanceof Error && err.message.startsWith("CORS:")) {
    res.status(403).json({ error: "Niet toegestaan vanaf deze herkomst" });
    return;
  }

  const code = maakVerwijzingscode();
  const { handeling, pad } = maakVeiligHandelingslabel(req);
  const routingBewijs = maakRoutingBewijs(code, handeling);
  const gebruikerId = req.session?.userId;
  const rol = req.session?.rol;
  // SENTRY_01 §2.4: alleen de onverwachte 500 gaat naar Sentry, met de
  // verwijzingscode als tag — de code die een gebruiker voorleest is zo de
  // zoeksleutel in Sentry. Zonder SENTRY_DSN is dit een no-op.
  Sentry.captureException(err, {
    user: typeof gebruikerId === "number" ? { id: String(gebruikerId) } : undefined,
    tags: {
      component: "api",
      verwijzingscode: code,
      handeling,
      ...(routingBewijs ? { routing_bewijs: routingBewijs } : {}),
      ...(typeof rol === "string" ? { rol } : {}),
    },
    contexts: {
      verzoek: {
        methode: req.method,
        pad,
        status: 500,
        handeling,
      },
    },
  });
  logger.error(
    { verwijzingscode: code, method: req.method, pad: req.originalUrl?.split("?")[0], err },
    "Onverwachte fout afgevangen door centrale foutafhandelaar",
  );
  res.status(500).json({
    error: `Er is een onverwachte fout opgetreden. Neem contact op met de beheerder en vermeld verwijzingscode ${code}.`,
    verwijzingscode: code,
  });
}

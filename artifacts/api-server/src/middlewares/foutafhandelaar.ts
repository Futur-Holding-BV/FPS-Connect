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
import { randomBytes } from "crypto";
import { logger } from "../lib/logger";

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
  logger.error(
    { verwijzingscode: code, method: req.method, pad: req.originalUrl?.split("?")[0], err },
    "Onverwachte fout afgevangen door centrale foutafhandelaar",
  );
  res.status(500).json({
    error: `Er is een onverwachte fout opgetreden. Neem contact op met de beheerder en vermeld verwijzingscode ${code}.`,
    verwijzingscode: code,
  });
}

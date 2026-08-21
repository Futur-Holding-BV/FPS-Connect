const AANVRAAG_UPLOAD_UNIEK_CONSTRAINT = "aanvraag_voorstellen_mail_uq";

/**
 * Geeft alleen 409 terug voor de databasepoort die dubbele aanvraagbronnen
 * tegenhoudt. Andere unieke-conflicten blijven echte serverfouten.
 */
export function statusVoorAanvraagUploadConflict(error: unknown): 409 | null {
  let huidig: unknown = error;
  for (let diepte = 0; diepte < 4 && huidig; diepte += 1) {
    const postgresFout = huidig as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (
      postgresFout.code === "23505"
      && postgresFout.constraint === AANVRAAG_UPLOAD_UNIEK_CONSTRAINT
    ) {
      return 409;
    }
    huidig = postgresFout.cause;
  }
  return null;
}
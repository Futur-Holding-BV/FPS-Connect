import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

// Logboek van uitgaande mail (test, uitnodiging, wachtwoord-reset). Bewust een
// platte, additieve tabel: dient als audittrail en als bron voor het overzicht
// "laatste 100 berichten" op de mailinstellingen-pagina. Bevat nooit de
// berichtinhoud, alleen metadata en — bij mislukken — een foutcategorie.
export const mailLogboekTable = pgTable("mail_logboek", {
  id: serial("id").primaryKey(),
  naarEmail: text("naar_email").notNull(),
  naarNaam: text("naar_naam"),
  onderwerp: text("onderwerp").notNull(),
  // "test" | "uitnodiging" | "wachtwoord_reset"
  soort: text("soort").notNull(),
  // "verzonden" | "mislukt"
  status: text("status").notNull(),
  // Bij mislukken: "niet_geconfigureerd" | "token_verlopen" |
  // "mailbox_onbereikbaar" | "rate_limit" | "verzendfout"
  foutCategorie: text("fout_categorie"),
  foutdetail: text("foutdetail"),
  // Gebruiker die de verzending startte (sessie); null bij systeemverzending.
  verstuurdDoorId: integer("verstuurd_door_id"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export type MailLogboek = typeof mailLogboekTable.$inferSelect;

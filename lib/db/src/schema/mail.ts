import { pgTable, serial, text, integer, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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

// Mail-wachtrij: alle systeem-/notificatiemails komen hier eerst in terecht en
// worden pas verzonden na een expliciete menselijke handeling (beheerder klikt
// "Versturen" of "Afwijzen"). Alleen account-mails (uitnodiging, wachtwoord-
// reset, testmail) en mails die een medewerker zelf expliciet met een
// verstuur-knop verstuurt (offerte, factuur, bestelbon) gaan direct.
// De partiële unieke index voorkomt dat dezelfde mail (zelfde adres+onderwerp)
// meerdere keren tegelijk in de wachtrij staat — nooit herhalende mails.
export const mailWachtrijTable = pgTable(
  "mail_wachtrij",
  {
    id: serial("id").primaryKey(),
    naarEmail: text("naar_email").notNull(),
    naarNaam: text("naar_naam"),
    onderwerp: text("onderwerp").notNull(),
    html: text("html").notNull(),
    soort: text("soort").notNull(),
    // Een domein-specifieke, permanente sleutel voor systeemmails. Anders dan
    // de bestaande partiële adres+onderwerp-index blijft deze ook bestaan na
    // verzenden, afwijzen of mislukken en voorkomt hij herhaling bij een
    // dagelijkse bewakingsloop.
    deduplicatieSleutel: text("deduplicatie_sleutel"),
    // Bijlagen als [{ naam, contentType, inhoudBase64 }]; null = geen bijlagen.
    bijlagen: jsonb("bijlagen"),
    // "wachtend" | "verzonden" | "afgewezen" | "mislukt"
    status: text("status").notNull().default("wachtend"),
    foutdetail: text("foutdetail"),
    // Gebruiker wiens actie de mail veroorzaakte (indien bekend).
    aangevraagdDoorId: integer("aangevraagd_door_id"),
    // Beheerder die de wachtrij-beslissing nam (versturen/afwijzen).
    verwerktDoorId: integer("verwerkt_door_id"),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
    verwerktOp: timestamp("verwerkt_op"),
    // MARKETING_01: koppeling naar marketing_campagne_ontvangers zodat de
    // daadwerkelijke verzending terugschrijft naar de campagne (FK in SQL).
    campagneOntvangerId: integer("campagne_ontvanger_id"),
  },
  (t) => [
    uniqueIndex("mail_wachtrij_dedupe_idx")
      .on(t.naarEmail, t.onderwerp)
      .where(sql`${t.status} = 'wachtend'`),
    uniqueIndex("mail_wachtrij_deduplicatie_sleutel_uniek")
      .on(t.deduplicatieSleutel)
      .where(sql`${t.deduplicatieSleutel} IS NOT NULL`),
  ],
);

export type MailWachtrijItem = typeof mailWachtrijTable.$inferSelect;

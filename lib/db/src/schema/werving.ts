import { pgTable, serial, text, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { functiesTable } from "./hrm";

// ── WERVING_01 — Wervingsmodule ───────────────────────────────────────────────
//
// Lichte wervingsregistratie: kandidaten, cv-toetsing (AI bereidt voor,
// oordeelt nooit), gespreksvragenlijst en uitkomst. Geen sollicitatieportaal.
//
// Juridisch kader (EU AI-verordening): de AI geeft nooit een score, cijfer,
// rangschikking of geschiktheidsoordeel. De kolom `toetsing` bevat uitsluitend
// per functie-eis de stand (aantoonbaar aanwezig / niet genoemd / onduidelijk)
// met vindplaats in het cv — nooit een oordeel.

// Kandidaten die op een functie reageren. AVG: na afronding van de procedure
// (status afgewezen/aangenomen → procedure_afgerond_op) worden rij én
// cv-bestand automatisch verwijderd: 4 weken zonder toestemming, 1 jaar met
// uitdrukkelijke toestemming (toestemming_bewaring).
export const wervingKandidatenTable = pgTable("werving_kandidaten", {
  id: serial("id").primaryKey(),
  functieId: integer("functie_id").notNull().references(() => functiesTable.id),
  naam: text("naam").notNull(),
  email: text("email"),
  telefoon: text("telefoon"),
  // Via welk kanaal de kandidaat binnenkwam (vrij tekstveld, bv. "Indeed",
  // "eigen netwerk", "open sollicitatie") — voor het kanalenoverzicht.
  kanaal: text("kanaal").notNull().default("onbekend"),
  // ontvangen · uitgenodigd · gesproken · afgewezen · aangenomen
  status: text("status").notNull().default("ontvangen"),
  // AVG: uitdrukkelijke toestemming om gegevens 1 jaar te bewaren (anders 4 weken).
  toestemmingBewaring: boolean("toestemming_bewaring").notNull().default(false),
  // Gezet zodra status afgewezen of aangenomen wordt; startpunt bewaartermijn.
  procedureAfgerondOp: timestamp("procedure_afgerond_op"),
  cvObjectPath: text("cv_object_path"),
  cvBestandsnaam: text("cv_bestandsnaam"),
  cvMime: text("cv_mime"),
  // AI-voorbereiding: per functie-eis { categorie, eis, stand, vindplaats }.
  // Nooit een score of oordeel.
  toetsing: jsonb("toetsing"),
  toetsingOp: timestamp("toetsing_op"),
  // Eindconclusie in eigen woorden — door de mens vastgelegd, nooit door AI.
  eindconclusie: text("eindconclusie"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  index("werving_kandidaten_functie_idx").on(t.functieId),
]);

// Vaste kernvragen per functie — identiek voor elke kandidaat op dezelfde
// functie (vergelijkbaarheid). Bewerkbaar door de beheerder; AI kan een
// voorstel doen maar de mens bevestigt en bewaart.
export const functieKernvragenTable = pgTable("functie_kernvragen", {
  id: serial("id").primaryKey(),
  functieId: integer("functie_id").notNull().references(() => functiesTable.id, { onDelete: "cascade" }),
  volgorde: integer("volgorde").notNull().default(0),
  vraag: text("vraag").notNull(),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  index("functie_kernvragen_functie_idx").on(t.functieId),
]);

// Gespreksvragenlijst per kandidaat: kopie van de kernvragen (bron "kern")
// plus cv-specifieke vragen (bron "cv") plus handmatig toegevoegde vragen
// (bron "handmatig"). Volledig bewerkbaar. Aantekening per vraag wordt na het
// gesprek door de mens ingevuld.
export const wervingVragenTable = pgTable("werving_vragen", {
  id: serial("id").primaryKey(),
  kandidaatId: integer("kandidaat_id").notNull().references(() => wervingKandidatenTable.id, { onDelete: "cascade" }),
  volgorde: integer("volgorde").notNull().default(0),
  // kern · cv · handmatig
  bron: text("bron").notNull().default("handmatig"),
  vraag: text("vraag").notNull(),
  aantekening: text("aantekening"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  index("werving_vragen_kandidaat_idx").on(t.kandidaatId),
]);

export type WervingKandidaat = typeof wervingKandidatenTable.$inferSelect;
export type FunctieKernvraag = typeof functieKernvragenTable.$inferSelect;
export type WervingVraag = typeof wervingVragenTable.$inferSelect;

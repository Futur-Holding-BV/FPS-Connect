import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const leveranciersTable = pgTable("leveranciers", {
  id: serial("id").primaryKey(),

  // Identificatie
  code: text("code"),                                    // interne of ENK-code
  naam: text("naam").notNull(),

  // Adres
  adres: text("adres"),
  huisnummer: text("huisnummer"),
  postcode: text("postcode"),
  stad: text("stad"),
  provincie: text("provincie"),
  land: text("land").notNull().default("Nederland"),

  // Contactpersoon
  contactpersoon: text("contactpersoon"),
  contactFunctie: text("contact_functie"),
  contactEmail: text("contact_email"),
  contactTelefoon: text("contact_telefoon"),
  contactMobiel: text("contact_mobiel"),

  // Algemene contactgegevens
  email: text("email"),
  telefoon: text("telefoon"),
  website: text("website"),

  // Juridisch / fiscaal
  kvkNummer: text("kvk_nummer"),
  btwNummer: text("btw_nummer"),

  // Bankgegevens
  iban: text("iban"),
  bic: text("bic"),
  bankNaam: text("bank_naam"),
  tNamVan: text("t_nam_van"),                            // tenaamstelling bankrekening

  // Inkoopvoorwaarden
  betalingstermijnDagen: integer("betalingstermijn_dagen").notNull().default(30),
  kortingspercentage: integer("kortingspercentage"),    // procentpunten (optioneel)

  // Classificatie
  categorie: text("categorie"),                          // bijv. "Branddeuren", "Doorvoeringen"
  productcategorieen: text("productcategorieen"),        // vrij tekstveld of kommalijst

  // Meta
  notities: text("notities"),
  actief: boolean("actief").notNull().default(true),
  bron: text("bron").notNull().default("handmatig"),     // "handmatig" | "import"

  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

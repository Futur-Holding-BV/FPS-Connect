import { pgTable, serial, text, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";

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

  // Boekhoud-instellingen (presets — worden automatisch overgenomen bij AI-uitlezing)
  grootboekrekening: text("grootboekrekening"),         // standaard grootboekrekening voor inkoopfacturen
  kostenplaats: text("kostenplaats"),                   // standaard kostenplaats
  btwCodeDefault: text("btw_code_default"),             // standaard BTW-code (H/L/V/0)
  relatiecode: text("relatiecode"),                     // relatiecode in AccountView (crediteur/debiteurnummer)

  // G-rekening (wettelijke verplichting bouwsector)
  // Wanneer een leverancier een onderbouwer is met G-rekening-verplichting,
  // worden inkomende facturen automatisch gesignaleerd voor splitsing.
  gRekeningVanToepassing: boolean("g_rekening_van_toepassing").notNull().default(false),
  gRekeningIban: text("g_rekening_iban"),                 // IBAN van de G-rekening
  gRekeningPercentage: real("g_rekening_percentage"),     // % van loonsom dat naar G-rekening gaat

  // Automatische factuurclassificatie (bekende leveranciers zoals Yelloebrick)
  // Wanneer een inkomende factuur gematcht wordt aan deze leverancier, wordt
  // factuur.categorie automatisch ingesteld op factuurCategorie.
  factuurCategorie: text("factuur_categorie"),
  // Drempelbedrag (in centen) waaronder facturen van deze leverancier automatisch
  // worden goedgekeurd (status → klaar_voor_boeking, geen handmatige controle).
  autoAkkoordDrempelCents: integer("auto_akkoord_drempel_cents"),

  // Meta
  notities: text("notities"),
  actief: boolean("actief").notNull().default(true),
  bron: text("bron").notNull().default("handmatig"),     // "handmatig" | "import"
  importId: integer("import_id"),                        // IMPORT_01: verwijzing naar import_logs.id

  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),

  // KB-velden (additief — kennislaag voor AI-modules)
  levertijdDagen: integer("levertijd_dagen"),
  leveringsgebied: text("leveringsgebied"),
  minOrdergrootte: text("min_ordergrootte"),
  heeftRaamovereenkomst: boolean("heeft_raamovereenkomst").notNull().default(false),
  geschiktVoorSpoed: boolean("geschikt_voor_spoed").notNull().default(false),
  prijsniveau: text("prijsniveau"),                      // 'laag' | 'midden' | 'hoog'
  certificeringen: text("certificeringen").array(),
  kbNotities: text("kb_notities"),                       // interne KB-context voor AI
});

import { pgTable, serial, text, integer, boolean, timestamp, real, index } from "drizzle-orm/pg-core";
import { leveranciersTable } from "./leveranciers";
import { gebruikersTable } from "./gebruikers";
import { crmKlantenTable } from "./crm";

export const leverancierPrestatiesdTable = pgTable(
  "leverancier_prestaties",
  {
    id: serial("id").primaryKey(),
    leverancierId: integer("leverancier_id")
      .notNull()
      .references(() => leveranciersTable.id, { onDelete: "cascade" }),
    projectRef: text("project_ref"),
    periode: text("periode"),
    leverbetrouwbaarheid: integer("leverbetrouwbaarheid"),
    levertijdScore: integer("levertijd_score"),
    kwaliteitScore: integer("kwaliteit_score"),
    garantieclaims: integer("garantieclaims").default(0),
    retourpercentage: real("retourpercentage"),
    beschikbaarheidScore: integer("beschikbaarheid_score"),
    communicatieScore: integer("communicatie_score"),
    geschiktSpoed: boolean("geschikt_spoed"),
    notities: text("notities"),
    geregistreerdDoor: integer("geregistreerd_door").references(
      () => gebruikersTable.id,
      { onDelete: "set null" },
    ),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  },
  (t) => [index("idx_lev_prestaties_leverancier").on(t.leverancierId)],
);

export const fpsBedrijfsstandaardenTable = pgTable("fps_bedrijfsstandaarden", {
  id: serial("id").primaryKey(),
  sleutel: text("sleutel").notNull().unique(),
  categorie: text("categorie").notNull(),
  titel: text("titel").notNull(),
  inhoud: text("inhoud").notNull(),
  actief: boolean("actief").notNull().default(true),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const opdrachtgeverVoorkeurenTable = pgTable(
  "opdrachtgever_voorkeuren",
  {
    id: serial("id").primaryKey(),
    klantId: integer("klant_id")
      .notNull()
      .references(() => crmKlantenTable.id, { onDelete: "cascade" })
      .unique(),
    verplichtArtikelIds: integer("verplichte_artikel_ids").array(),
    verbodenArtikelIds: integer("verboden_artikel_ids").array(),
    rapportageEisen: text("rapportage_eisen"),
    documentvereisten: text("documentvereisten"),
    uitvoeringsdetails: text("uitvoeringsdetails"),
    keuringsvoorschriften: text("keuringsvoorschriften"),
    onderhoudsafspraken: text("onderhoudsafspraken"),
    kbNotities: text("kb_notities"),
    bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  },
);

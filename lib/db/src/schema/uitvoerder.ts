import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";
import { planningItemsTable } from "./planning";
import { opdrachtenTable } from "./opdrachten";

// Uitvoerder sessie — AI-consult per monteur per werkdag
export const uitvoerderSessiesTable = pgTable("uitvoerder_sessies", {
  id: serial("id").primaryKey(),
  werkdagId: integer("werkdag_id").references(() => planningItemsTable.id, { onDelete: "set null" }),
  opdrachtId: integer("opdracht_id").references(() => opdrachtenTable.id, { onDelete: "set null" }),
  monteurId: integer("monteur_id").notNull().references(() => gebruikersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("actief"),
  gekozenAanpak: text("gekozen_aanpak"),
  gekozenAanpakOp: timestamp("gekozen_aanpak_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Uitvoerder berichten — gesprek in een sessie (monteur ↔ AI)
export const uitvoerderBerichtenTable = pgTable("uitvoerder_berichten", {
  id: serial("id").primaryKey(),
  sessieId: integer("sessie_id").notNull().references(() => uitvoerderSessiesTable.id, { onDelete: "cascade" }),
  rol: text("rol").notNull(),
  inhoud: text("inhoud").notNull(),
  fotoPad: text("foto_pad"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

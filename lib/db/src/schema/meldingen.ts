import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

// ── Gebruikersmeldingen — livegang supportfunctie ──────────────────────────────
// Lichte supportfunctie: bug / vraag / verbetersuggestie met automatische
// context-opname en AI eerste-reactie. Geen extern ticketsysteem.

export const gebruikersMeldingenTable = pgTable("gebruikers_meldingen", {
  id: serial("id").primaryKey(),

  // Melding-inhoud
  type: text("type").notNull(),               // bug / vraag / verbetering
  omschrijving: text("omschrijving").notNull(),
  urgentie: text("urgentie").notNull().default("normaal"),  // laag / normaal / hoog / blokkerend
  status: text("status").notNull().default("nieuw"),        // nieuw / in_behandeling / opgelost / afgewezen

  // Auto-opgenomen context
  gebruikerId: integer("gebruiker_id"),
  gebruikerNaam: text("gebruiker_naam"),
  gebruikerRol: text("gebruiker_rol"),
  pagina: text("pagina"),
  browserInfo: text("browser_info"),

  // Screenshot (base64 data-URL, optioneel, max ~2MB)
  screenshotData: text("screenshot_data"),

  // Technische context (met toestemming)
  techContextToestemming: boolean("tech_context_toestemming").notNull().default(false),
  techContext: text("tech_context"),

  // AI eerste-reactie
  aiReactie: text("ai_reactie"),
  aiClassificatie: text("ai_classificatie"),  // bijv. "ui-bug" / "workflow" / "feature-request"
  aiWorkaround: text("ai_workaround"),

  // Beheer
  interneNotitie: text("interne_notitie"),
  behandeldDoor: integer("behandeld_door"),

  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op"),
});

export type GebruikersMelding = typeof gebruikersMeldingenTable.$inferSelect;
export type GebruikersMeldingInsert = typeof gebruikersMeldingenTable.$inferInsert;

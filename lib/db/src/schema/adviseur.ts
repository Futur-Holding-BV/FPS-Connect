import { pgTable, serial, integer, text, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";

// ADVISEUR_PERSIST_01/02 (task-1202) — server-eigen persistentie + audit voor de
// FPS Bedrijfsadviseur. Zie migraties 0128/0129.
//
// De assistent-conversatie is nadrukkelijk server-eigendom: de historie komt
// uit deze tabellen (nooit van de client) en is geïsoleerd per actor,
// effectieve gebruiker en effectieve rol.
// Dit staat los van de gewone menselijke chat (chat.ts) en raakt die niet aan.

// Gesprekscontainer — één per actor + effectieve gebruiker + effectieve rol
// + actuele autorisatiesnapshot. Ingetrokken rechten maken oude historie
// daardoor onbereikbaar zonder achteraf inhoudelijk te hoeven filteren.
export const adviseurGesprekkenTable = pgTable(
  "adviseur_gesprekken",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id")
      .notNull()
      .references(() => gebruikersTable.id, { onDelete: "cascade" }),
    gebruikerId: integer("gebruiker_id")
      .notNull()
      .references(() => gebruikersTable.id, { onDelete: "cascade" }),
    effectieveRol: text("effectieve_rol").notNull(),
    autorisatieHash: text("autorisatie_hash").notNull(),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
    bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
  },
  (t) => [
    // UNIQUE garandeert één gesprek per actor+effectieve gebruiker+rol+snapshot.
    // Race-veilige insert via ON CONFLICT DO NOTHING + re-select.
    unique("adviseur_gesprekken_actor_gebruiker_rol_auth_uniq").on(
      t.actorId,
      t.gebruikerId,
      t.effectieveRol,
      t.autorisatieHash,
    ),
  ],
);

// Server-eigen conversatiegeschiedenis — bron voor de begrensde historie.
export const adviseurBerichtenTable = pgTable(
  "adviseur_berichten",
  {
    id: serial("id").primaryKey(),
    gesprekId: integer("gesprek_id")
      .notNull()
      .references(() => adviseurGesprekkenTable.id, { onDelete: "cascade" }),
    rol: text("rol").notNull(), // "user" | "assistant"
    inhoud: text("inhoud").notNull(),
    // Alleen bij assistentberichten gevuld. Hierdoor blijven klikbare bronnen
    // ook na navigatie, remount en herladen controleerbaar.
    citaties: jsonb("citaties"),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  },
  (t) => [
    index("adviseur_berichten_gesprek_aangemaakt_idx").on(t.gesprekId, t.aangemaaktOp),
  ],
);

// Volledige audittrail per vraag.
// gebruikerId = effectieve gebruiker (wie "bekeken wordt" bij impersonatie).
// actorId = echte ingelogde gebruiker (bij normale sessie gelijk aan gebruikerId).
export const adviseurAuditTable = pgTable(
  "adviseur_audit",
  {
    id: serial("id").primaryKey(),
    gesprekId: integer("gesprek_id").references(() => adviseurGesprekkenTable.id, {
      onDelete: "set null",
    }),
    gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, {
      onDelete: "set null",
    }),
    // actorId: de echte ingelogde gebruiker. Bij impersonatie ≠ gebruikerId.
    actorId: integer("actor_id").references(() => gebruikersTable.id, {
      onDelete: "set null",
    }),
    effectieveRol: text("effectieve_rol").notNull(),
    autorisatieHash: text("autorisatie_hash"),
    vraag: text("vraag").notNull(),
    antwoord: text("antwoord"),
    contextGebruikt: jsonb("context_gebruikt"),
    toolAutorisaties: jsonb("tool_autorisaties"),
    geweigerdeTools: jsonb("geweigerde_tools"),
    citaties: jsonb("citaties"),
    bronbewijs: jsonb("bronbewijs"),
    uitkomst: text("uitkomst").notNull(),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  },
  (t) => [
    index("adviseur_audit_gebruiker_idx").on(t.gebruikerId, t.aangemaaktOp),
    index("adviseur_audit_actor_idx").on(t.actorId, t.aangemaaktOp),
    index("adviseur_audit_gesprek_idx").on(t.gesprekId),
    index("adviseur_audit_uitkomst_idx").on(t.uitkomst),
  ],
);

export type AdviseurGesprek = typeof adviseurGesprekkenTable.$inferSelect;
export type AdviseurBericht = typeof adviseurBerichtenTable.$inferSelect;
export type AdviseurAudit = typeof adviseurAuditTable.$inferSelect;
export type AdviseurAuditInvoer = typeof adviseurAuditTable.$inferInsert;

import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const auditLogTable = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    tijdstip: timestamp("tijdstip").notNull().defaultNow(),
    gebruikerId: integer("gebruiker_id"),
    gebruikerNaam: text("gebruiker_naam"),
    ipAdres: text("ip_adres"),
    sessieId: text("sessie_id"),
    module: text("module").notNull(),
    actie: text("actie").notNull(),
    entiteit: text("entiteit").notNull(),
    entiteitId: integer("entiteit_id"),
    entiteitNaam: text("entiteit_naam"),
    oudeWaarde: jsonb("oude_waarde"),
    nieuweWaarde: jsonb("nieuwe_waarde"),
    workflowStatus: text("workflow_status"),
    gebouwId: integer("gebouw_id"),
    medewerkerId: integer("medewerker_id"),
    documentId: integer("document_id"),
    meta: jsonb("meta"),
  },
  (t) => [
    index("audit_log_tijdstip_idx").on(t.tijdstip),
    index("audit_log_gebruiker_idx").on(t.gebruikerId),
    index("audit_log_module_idx").on(t.module),
    // Partial indexes voor sparse kolommen: alleen rijen met een waarde worden geïndexeerd
    index("audit_log_gebouw_idx").on(t.gebouwId).where(sql`${t.gebouwId} IS NOT NULL`),
    index("audit_log_medewerker_idx").on(t.medewerkerId).where(sql`${t.medewerkerId} IS NOT NULL`),
    index("audit_log_document_idx").on(t.documentId).where(sql`${t.documentId} IS NOT NULL`),
    index("audit_log_entiteit_idx").on(t.entiteit, t.entiteitId),
  ],
);

export type AuditLog = typeof auditLogTable.$inferSelect;
export type AuditLogInvoer = typeof auditLogTable.$inferInsert;

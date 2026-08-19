import { pgTable, serial, text, integer, real, boolean, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { medewerkersTable, werkgeversTable, functiesTable } from "./hrm";
import { gebruikersTable } from "./gebruikers";

// ── Arbeidsovereenkomsten ────────────────────────────────────────────────────
// Centrale contracthistorie per medewerker. Vormt de basis voor bewaking,
// signalering, ketenregeling-controle en besluitvorming.
// contracttype: bepaalde_tijd | onbepaalde_tijd | oproep | stage | leer_werk
// status:       concept | actief | verlopen | opgezegd | omgezet | beëindigd
export const arbeidsovereenkomstenTable = pgTable("arbeidsovereenkomsten", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  functieId: integer("functie_id").references(() => functiesTable.id, { onDelete: "set null" }),
  // Kernvelden
  contracttype: text("contracttype").notNull().default("bepaalde_tijd"),
  // bepaalde_tijd | onbepaalde_tijd | oproep | stage | leer_werk
  startDatum: text("start_datum").notNull(),                                    // "YYYY-MM-DD"
  eindDatum: text("eind_datum"),                                                 // null = onbepaalde tijd
  proeftijdDagen: integer("proeftijd_dagen"),                                    // 0, 30, 60
  // Arbeidsvoorwaarden
  functieOmschrijving: text("functie_omschrijving"),                             // eventueel afwijkend van functieId.naam
  cao: text("cao"),
  salarisBruto: real("salaris_bruto"),                                           // euro (eenheid in salarisEenheid; historisch: per maand)
  salarisEenheid: text("salaris_eenheid"),                                       // maand | 4-weken | week | uur | jaar (null = onbekend/maand)
  arbeidsduurPerWeek: real("arbeidsduur_per_week"),                              // uren
  urenMinPerWeek: real("uren_min_per_week"),                                     // min-max bandbreedte (nul-uren/oproep)
  urenMaxPerWeek: real("uren_max_per_week"),
  opzegtermijn: text("opzegtermijn"),                                            // zoals in het contract vermeld
  aanzegtermijn: text("aanzegtermijn"),                                          // zoals in het contract vermeld
  reiskostenvergoeding: text("reiskostenvergoeding"),                            // zoals in het contract vermeld
  concurrentiebeding: boolean("concurrentiebeding"),                             // null = niet vastgelegd
  relatiebeding: boolean("relatiebeding"),                                       // null = niet vastgelegd
  // Status
  status: text("status").notNull().default("actief"),
  // concept | actief | verlopen | opgezegd | omgezet | beëindigd
  // Relatie met voorgaand/opvolgend contract (ketenregeling tracking)
  voorgaandContractId: integer("voorgaand_contract_id"),                         // self-reference via FK in DB
  // Digitale ondertekening
  ondertekeningVereist: boolean("ondertekening_vereist").notNull().default(false),
  ondertekendDoorMedewerkerOp: text("ondertekend_door_medewerker_op"),
  ondertekendDoorHrOp: text("ondertekend_door_hr_op"),
  ondertekendDoorHrId: integer("ondertekend_door_hr_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  // Notities
  notities: text("notities"),
  ingebrachtDocumentId: integer("ingebracht_document_id"),                       // arbeidsovereenkomst PDF
  // Audit
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── Contract-signaleringen — bewakingslog ────────────────────────────────────
// Eén rij per signalering-moment per contract. Aangemaakt door bewakingscheck.
// type: 120_dagen | 90_dagen | 75_dagen | 60_dagen | 30_dagen | verlopen | ketenregel | aanzegtermijn
// status: nieuw | gezien | afgehandeld
export const contractSignaleringenTable = pgTable("contract_signaleringen", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => arbeidsovereenkomstenTable.id, { onDelete: "cascade" }),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  // 120_dagen | 90_dagen | 75_dagen | 60_dagen | 30_dagen | verlopen | ketenregel | aanzegtermijn
  ernst: text("ernst").notNull().default("info"),                                // info | waarschuwing | kritiek
  boodschap: text("boodschap").notNull(),
  aiAdvies: text("ai_advies"),                                                   // AI-aanbeveling (tekst)
  status: text("status").notNull().default("nieuw"),                             // nieuw | gezien | afgehandeld
  gezienDoorId: integer("gezien_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  gezienOp: timestamp("gezien_op"),
  // Geeft aan dat voor alle op dat moment bevoegde HRM-ontvangers een
  // aanzegmail-intentie in de wachtrij staat. De per-ontvanger unieke
  // wachtrijsleutel is de harde deduplicatiegrens; deze kolom is de
  // signaleringsaudit en voorkomt nodeloze dagelijkse pogingen.
  aanzegMailVerstuurdOp: timestamp("aanzeg_mail_verstuurd_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => [
  // Dedupe DB-geborgd: één signalering per contract per type (race-vrij).
  uniqueIndex("contract_signaleringen_contract_type_uniek").on(t.contractId, t.type),
]);

// ── Contract-besluiten — besluitvorming per contract ─────────────────────────
// Vastgelegd na gespreksvoorbereiding. Geeft de workflow-status van het besluit.
// besluit: verlengen | wijzigen | onbepaalde_tijd | beëindigen | geen_besluit
// status:  in_behandeling | documenten_op | wacht_handtekening | afgerond
export const contractBesluitenTable = pgTable("contract_besluiten", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => arbeidsovereenkomstenTable.id, { onDelete: "cascade" }),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  besluit: text("besluit").notNull().default("geen_besluit"),
  // verlengen | wijzigen | onbepaalde_tijd | beëindigen | geen_besluit
  // Parameters bij verlengen/wijzigen
  nieuwEindDatum: text("nieuw_eind_datum"),
  nieuwSalaris: real("nieuw_salaris"),
  nieuwArbeidsduur: real("nieuw_arbeidsduur"),
  toelichting: text("toelichting"),
  // Gespreksvoorbereiding (AI-gegenereerde samenvatting — uitsluitend advies)
  aiSamenvatting: text("ai_samenvatting"),
  aiAandachtspunten: jsonb("ai_aandachtspunten"),                                // string[]
  aiWettelijkeRisicos: jsonb("ai_wettelijke_risicos"),                           // string[]
  // Status
  status: text("status").notNull().default("in_behandeling"),
  // in_behandeling | documenten_op | wacht_handtekening | afgerond
  // Workflow
  beslotenDoorId: integer("besloten_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  beslotenOp: timestamp("besloten_op"),
  // Audittrail — JSON-array van { actie, doorId, doorNaam, op, notitie }
  audittrail: jsonb("audittrail").notNull().default([]),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Gereedschapregistratie — FPS Connect
// Centraal register voor machines en gereedschappen, bruikleenovereenkomsten
// en schade-/defectmeldingen per de FPS-spec (Opdracht Replit 2026).
import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { medewerkersTable } from "./hrm";
import { gebruikersTable } from "./gebruikers";

// ── Gereedschappenregister ────────────────────────────────────────────────────
// Één rij per machine of gereedschap. Het gegraveerde nummer is leidend voor
// identificatie in het veld; het volgnummer is intern en auto-gegenereerd.
export const gereedschappenTable = pgTable("gereedschappen", {
  id: serial("id").primaryKey(),
  volgnummer: text("volgnummer").notNull().unique(),
  gegraveerdNummer: text("gegraveerd_nummer"),
  omschrijving: text("omschrijving").notNull(),
  merk: text("merk"),
  type: text("type"),
  serienummer: text("serienummer"),
  // Categorie: vrij te kiezen (boormachine, slijptol, haakmat, zaag, meet, …)
  categorie: text("categorie").notNull().default("overig"),
  // Aandrijving: elektrisch | accu | handgereedschap | machine | overig
  aandrijving: text("aandrijving").notNull().default("handgereedschap"),
  metSnoer: boolean("met_snoer").notNull().default(false),
  accuInbegrepen: boolean("accu_inbegrepen").notNull().default(false),
  laderInbegrepen: boolean("lader_inbegrepen").notNull().default(false),
  kofferInbegrepen: boolean("koffer_inbegrepen").notNull().default(false),
  aankoopdatum: text("aankoopdatum"),
  aankoopprijs: real("aankoopprijs"),
  leverancier: text("leverancier"),
  garantietermijn: text("garantietermijn"),
  // Status: Beschikbaar | In bruikleen | Defect gemeld | Beschadigd |
  //         Ter keuring | Afgekeurd | In reparatie | Vermist | Afgeschreven
  status: text("status").notNull().default("Beschikbaar"),
  huidigeMedewerkerId: integer("huidige_medewerker_id").references(
    () => medewerkersTable.id, { onDelete: "set null" }
  ),
  locatie: text("locatie"),
  keuringsplichtig: boolean("keuringsplichtig").notNull().default(false),
  keuringNorm: text("keuring_norm"),             // bijv. "NEN3140", "CE", "NEN1010"
  keuringVervalDatum: timestamp("keuring_verval_datum"), // next inspection due date
  laatsteKeuring: text("laatste_keuring"),
  volgendeKeuring: text("volgende_keuring"),
  opmerkingen: text("opmerkingen"),
  fotoUrl: text("foto_url"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(
    () => gebruikersTable.id, { onDelete: "set null" }
  ),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── Bruikleenovereenkomsten ──────────────────────────────────────────────────
// Eén rij per uitgifte. Na digitale ondertekening is definitief=true en mag
// de rij niet meer stilzwijgend worden gewijzigd (nieuwe versie = nieuwe rij).
export const bruikleenOvereenkomstenTable = pgTable("bruikleen_overeenkomsten", {
  id: serial("id").primaryKey(),
  gereedschapId: integer("gereedschap_id").notNull().references(
    () => gereedschappenTable.id, { onDelete: "cascade" }
  ),
  medewerkerId: integer("medewerker_id").notNull().references(
    () => medewerkersTable.id, { onDelete: "restrict" }
  ),
  uitgegeverDoorId: integer("uitgegever_door_id").references(
    () => gebruikersTable.id, { onDelete: "set null" }
  ),
  datumUitgifte: text("datum_uitgifte").notNull(),
  datumInname: text("datum_inname"),
  staatBijUitgifte: text("staat_bij_uitgifte"),
  staatBijInname: text("staat_bij_inname"),
  accessoires: text("accessoires"),
  bruikleenVoorwaarden: text("bruikleen_voorwaarden"),
  handtekeningMedewerkerUrl: text("handtekening_medewerker_url"),
  handtekeningUitgeverUrl: text("handtekening_uitgever_url"),
  definitief: boolean("definitief").notNull().default(false),
  definitiefOp: timestamp("definitief_op"),
  pdfUrl: text("pdf_url"),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── Gereedschapsmeldingen ────────────────────────────────────────────────────
// Schade-, defect- en vermissingsmeldingen door monteurs of beheerders.
export const gereedschapMeldingenTable = pgTable("gereedschap_meldingen", {
  id: serial("id").primaryKey(),
  gereedschapId: integer("gereedschap_id").notNull().references(
    () => gereedschappenTable.id, { onDelete: "cascade" }
  ),
  gemeldDoorMedewerkerId: integer("gemeld_door_medewerker_id").references(
    () => medewerkersTable.id, { onDelete: "set null" }
  ),
  gemeldDoorGebruikerId: integer("gemeld_door_gebruiker_id").references(
    () => gebruikersTable.id, { onDelete: "set null" }
  ),
  soortMelding: text("soort_melding").notNull().default("defect"),
  omschrijving: text("omschrijving").notNull(),
  urgentie: text("urgentie").notNull().default("normaal"),
  kanNogVeiligGebruiktWorden: boolean("kan_nog_veilig_gebruikt_worden"),
  datumMelding: text("datum_melding").notNull(),
  status: text("status").notNull().default("nieuw"),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── Zod-schemas ──────────────────────────────────────────────────────────────
export const insertGereedschapSchema = createInsertSchema(gereedschappenTable).omit({
  id: true,
  volgnummer: true,
  aangemaaktDoorId: true,
  aangemaaktOp: true,
  bijgewerktOp: true,
});

export const insertBruikleenSchema = createInsertSchema(bruikleenOvereenkomstenTable).omit({
  id: true,
  definitief: true,
  definitiefOp: true,
  pdfUrl: true,
  aangemaaktOp: true,
  bijgewerktOp: true,
});

export const insertGereedschapMeldingSchema = createInsertSchema(gereedschapMeldingenTable).omit({
  id: true,
  aangemaaktOp: true,
  bijgewerktOp: true,
});

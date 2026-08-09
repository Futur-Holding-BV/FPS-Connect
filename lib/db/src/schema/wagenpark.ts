// Wagenparkmodule — voertuigen, onderhoud, kosten, ritten, Traxgo-sync en AVG-logboek.
// Privacy-by-design: alle data is voertuiggericht. Geen persoonsgerichte GPS-tijdlijn,
// geen gedragsscores en geen automatische werktijdcontrole.

import {
  pgTable, serial, text, integer, real, boolean, timestamp, jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebruikersTable } from "./gebruikers";
import { werkgeversTable } from "./hrm";
import { projectenTable } from "./projecten";

// ═══════════════════════════════════════════════════════════
// Voertuigen
// ═══════════════════════════════════════════════════════════

export const voertuigenTable = pgTable("voertuigen", {
  id:              serial("id").primaryKey(),

  // Basisgegevens
  kenteken:        text("kenteken").notNull(),
  merk:            text("merk").notNull(),
  type:            text("type").notNull(),                  // bijv. "Transit", "Sprinter"
  bouwjaar:        integer("bouwjaar"),
  kleur:           text("kleur"),
  chassisnummer:   text("chassisnummer"),

  // Kilometerstand (handmatig of via provider-sync)
  kmStand:         integer("km_stand").notNull().default(0),
  kmStandDatum:    timestamp("km_stand_datum"),

  // APK / Keuring
  apkDatum:        timestamp("apk_datum"),                  // vervaldatum APK

  // Onderhoud
  onderhoudsIntervalKm:   integer("onderhouds_interval_km"),
  onderhoudsIntervalDag:  integer("onderhouds_interval_dag"), // bijv. 365
  llaatstOnderhoudKm:     integer("llaatst_onderhoud_km"),
  llaatsteOnderhoudDatum: timestamp("llaatste_onderhoud_datum"),

  // Banden
  bandenwisselStatus: text("bandenwissels_status").notNull().default("geen_actie"),
  // "geen_actie" | "plannen" | "gepland" | "gewisseld"

  // Verzekering
  verzekeraarNaam:      text("verzekeraar_naam"),
  verzekeringPolisnr:   text("verzekering_polisnr"),
  verzekeringVervalDat: timestamp("verzekering_verval_dat"),

  // Lease / eigendom
  eigendomsType:       text("eigendoms_type").notNull().default("eigendom"),
  // "eigendom" | "lease" | "huur"
  leasemaatschappij:   text("leasemaatschappij"),
  leaseEindDatum:      timestamp("lease_eind_datum"),
  leaseKmJaarlijks:    integer("lease_km_jaarlijks"),

  // WAGENPARK_01: aandrijving (elektrische bus herkenbaar) + vaste garage + RDW-herkomst
  aandrijving:     text("aandrijving").notNull().default("diesel"),
  // "diesel" | "benzine" | "elektrisch" | "hybride"
  garageNaam:      text("garage_naam"),
  garageEmail:     text("garage_email"),
  rdwOpgehaaldOp:  timestamp("rdw_opgehaald_op"),   // wanneer RDW-gegevens als voorstel zijn overgenomen

  // Gekoppelde chauffeur/gebruiker (vaste toewijzing — optioneel)
  chauffeurId:     integer("chauffeur_id").references(() => gebruikersTable.id, { onDelete: "set null" }),

  // Fleet-provider koppeling
  providerVoertuigId: text("provider_voertuig_id"),         // extern ID (Traxgo etc.)
  fleetProvider:      text("fleet_provider"),               // "traxgo" | "webfleet" | null

  // Organisatie
  werkgeverId:     integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),

  // Status
  status:          text("status").notNull().default("actief"),
  // "actief" | "in_onderhoud" | "beschadigd" | "afgestoten" | "gereserveerd"
  opmerkingen:     text("opmerkingen"),
  gearchiveerd:    boolean("gearchiveerd").notNull().default(false),

  aangemaaktOp:   timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:   timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const voertuigInsertSchema = createInsertSchema(voertuigenTable, {
  kenteken:   z.string().min(1).max(20),
  merk:       z.string().min(1).max(80),
  type:       z.string().min(1).max(80),
  bouwjaar:   z.number().int().min(1950).max(2100).nullish(),
  eigendomsType: z.enum(["eigendom", "lease", "huur"]),
  status:        z.enum(["actief", "in_onderhoud", "beschadigd", "afgestoten", "gereserveerd"]),
  bandenwisselStatus: z.enum(["geen_actie", "plannen", "gepland", "gewisseld"]),
  aandrijving: z.enum(["diesel", "benzine", "elektrisch", "hybride"]),
  garageEmail: z.string().email().max(200).nullish(),
}).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });

export type VoertuigInsert = z.infer<typeof voertuigInsertSchema>;

// ═══════════════════════════════════════════════════════════
// Onderhoud per voertuig
// ═══════════════════════════════════════════════════════════

export const wagenparkOnderhoudTable = pgTable("wagenpark_onderhoud", {
  id:          serial("id").primaryKey(),
  voertuigId:  integer("voertuig_id").notNull().references(() => voertuigenTable.id, { onDelete: "cascade" }),

  type:        text("type").notNull(),
  // "periodiek" | "apk" | "bandenwissel" | "schade" | "reparatie" | "overig"
  omschrijving: text("omschrijving").notNull(),

  status:      text("status").notNull().default("open"),
  // "open" | "ingepland" | "in_uitvoering" | "afgerond" | "afgebroken"
  prioriteit:  text("prioriteit").notNull().default("normaal"),
  // "laag" | "normaal" | "hoog" | "urgent"

  kmStandBijMelding: integer("km_stand_bij_melding"),
  geplandDatum:      timestamp("gepland_datum"),
  afgerondDatum:     timestamp("afgerond_datum"),
  kosten:            real("kosten"),
  leverancier:       text("leverancier"),

  // AI-concepttaak (moet altijd door mens worden geaccordeerd)
  isAiVoorstel:   boolean("is_ai_voorstel").notNull().default(false),
  aiReden:        text("ai_reden"),
  geaccordeerd:   boolean("geaccordeerd").notNull().default(false),

  gemeldDoorId:   integer("gemeld_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),

  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const wagenparkOnderhoudInsertSchema = createInsertSchema(wagenparkOnderhoudTable, {
  type:        z.enum(["periodiek", "apk", "bandenwissel", "schade", "reparatie", "overig"]),
  status:      z.enum(["open", "ingepland", "in_uitvoering", "afgerond", "afgebroken"]),
  prioriteit:  z.enum(["laag", "normaal", "hoog", "urgent"]),
  omschrijving: z.string().min(1),
}).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });

export type WagenparkOnderhoudInsert = z.infer<typeof wagenparkOnderhoudInsertSchema>;

// ═══════════════════════════════════════════════════════════
// Kostenhistorie per voertuig
// ═══════════════════════════════════════════════════════════

export const wagenparkKostenTable = pgTable("wagenpark_kosten", {
  id:          serial("id").primaryKey(),
  voertuigId:  integer("voertuig_id").notNull().references(() => voertuigenTable.id, { onDelete: "cascade" }),

  categorie:   text("categorie").notNull(),
  // "onderhoud" | "brandstof" | "banden" | "verzekering" | "lease" | "schade" | "apk" | "overig"
  bedrag:      real("bedrag").notNull(),
  datum:       timestamp("datum").notNull(),
  omschrijving: text("omschrijving"),
  leverancier: text("leverancier"),
  factuurNummer: text("factuur_nummer"),
  factuurDocumentId: integer("factuur_document_id"),        // losse FK (geen import-cirkel)

  kmStand:     integer("km_stand"),
  projectId:   integer("project_id").references(() => projectenTable.id, { onDelete: "set null" }),

  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export const wagenparkKostenInsertSchema = createInsertSchema(wagenparkKostenTable, {
  categorie: z.enum(["onderhoud", "brandstof", "laden", "banden", "verzekering", "lease", "schade", "apk", "overig"]),
  bedrag:    z.number().positive(),
}).omit({ id: true, aangemaaktOp: true });

export type WagenparkKostenInsert = z.infer<typeof wagenparkKostenInsertSchema>;

// ═══════════════════════════════════════════════════════════
// Ritten per voertuig (voertuiggericht — geen persoons-GPS-tijdlijn)
// ═══════════════════════════════════════════════════════════

export const wagenparkRittenTable = pgTable("wagenpark_ritten", {
  id:          serial("id").primaryKey(),
  voertuigId:  integer("voertuig_id").notNull().references(() => voertuigenTable.id, { onDelete: "cascade" }),

  startDatum:  timestamp("start_datum").notNull(),
  eindDatum:   timestamp("eind_datum"),
  kmStart:     integer("km_start"),
  kmEind:      integer("km_eind"),
  afstandKm:   real("afstand_km"),

  vertrekAdres:     text("vertrek_adres"),
  bestemmingAdres:  text("bestemming_adres"),
  doel:             text("doel"),   // "werk" | "privé" | "onbekend" — voertuiggericht
  projectId:        integer("project_id").references(() => projectenTable.id, { onDelete: "set null" }),

  providerRitId:    text("provider_rit_id"),               // extern rit-ID (Traxgo)
  bron:             text("bron").notNull().default("handmatig"),
  // "handmatig" | "traxgo" | "webfleet"

  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════
// Sync-log (per provider-synchronisatie)
// ═══════════════════════════════════════════════════════════

export const wagenparkSyncLogTable = pgTable("wagenpark_sync_log", {
  id:            serial("id").primaryKey(),
  provider:      text("provider").notNull().default("traxgo"),
  status:        text("status").notNull(),
  // "gestart" | "voltooid" | "fout"
  aantalBijgewerkt: integer("aantal_bijgewerkt").notNull().default(0),
  aantalFouten:     integer("aantal_fouten").notNull().default(0),
  foutmelding:      text("foutmelding"),
  details:          jsonb("details"),                       // vrij veld voor provider-specifieke data

  gestartOp:    timestamp("gestart_op").notNull().defaultNow(),
  voltooIdOp:   timestamp("voltooid_op"),
  gestartDoorId: integer("gestart_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
});

// ═══════════════════════════════════════════════════════════
// MKB Brandstof import — batches
// ═══════════════════════════════════════════════════════════

export const brandstofImportenTable = pgTable("brandstof_importen", {
  id:           serial("id").primaryKey(),

  bestandsnaam: text("bestandsnaam").notNull(),
  brontype:     text("brontype").notNull(),
  // "pdf" | "ubl_xml" | "email_bijlage" | "handmatig"
  leverancier:  text("leverancier").notNull().default("mkb_brandstof"),
  status:       text("status").notNull().default("verwerkt"),
  // "verwerkt" | "wacht_op_controle" | "geaccordeerd" | "gearchiveerd"

  aantalRegels:      integer("aantal_regels").notNull().default(0),
  aantalGekoppeld:   integer("aantal_gekoppeld").notNull().default(0),
  aantalOnzeker:     integer("aantal_onzeker").notNull().default(0),
  aantalOntkoppeld:  integer("aantal_ontkoppeld").notNull().default(0),

  periodeVan:   timestamp("periode_van"),
  periodeTot:   timestamp("periode_tot"),

  factuurNummer: text("factuur_nummer"),
  totaalBedrag:  real("totaal_bedrag"),
  totaalBtw:     real("totaal_btw"),

  aiSignalen:   jsonb("ai_signalen"),   // array van { type, omschrijving, kenteken? }

  geladen:        boolean("geladen").notNull().default(false),  // kosten aangemaakt?
  geladenOp:      timestamp("geladen_op"),
  geladenDoorId:  integer("geladen_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),

  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  werkgeverId:      integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  aangemaaktOp:     timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:     timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type BrandstofImport = typeof brandstofImportenTable.$inferSelect;

// ═══════════════════════════════════════════════════════════
// MKB Brandstof import — individuele transactieregels
// ═══════════════════════════════════════════════════════════

export const brandstofRegelsTable = pgTable("brandstof_regels", {
  id:         serial("id").primaryKey(),
  importId:   integer("import_id").notNull().references(() => brandstofImportenTable.id, { onDelete: "cascade" }),

  // Geëxtraheerd uit factuur
  datum:      timestamp("datum"),
  kenteken:   text("kenteken"),                  // ruw kenteken uit factuur
  pasnummer:  text("pasnummer"),                 // brandstofpas-/laadpasnummer
  locatie:    text("locatie"),                   // tank-/laadlocatie omschrijving
  product:    text("product"),                   // bijv. "Euro 95", "Diesel B7", "Elektrisch"
  hoeveelheid: real("hoeveelheid"),              // liters of kWh
  eenheid:    text("eenheid"),                   // "ltr" | "kwh"
  bedragExBtw: real("bedrag_ex_btw"),
  btw:        real("btw"),
  bedragInclBtw: real("bedrag_incl_btw"),
  kmStand:    integer("km_stand"),               // indien aanwezig op factuur

  // Koppeling aan voertuig
  voertuigId:       integer("voertuig_id").references(() => voertuigenTable.id, { onDelete: "set null" }),
  koppelingStatus:  text("koppeling_status").notNull().default("onzeker"),
  // "automatisch" | "onzeker" | "handmatig" | "niet_gevonden"
  koppelingScore:   real("koppeling_score"),     // 0.0 – 1.0 zekerheid

  // Na verwerken: verwijzing naar aangemaakte kosten-rij
  kostenId:   integer("kosten_id"),              // losse FK (geen cirkel)

  opmerkingen: text("opmerkingen"),
});

export type BrandstofRegel = typeof brandstofRegelsTable.$inferSelect;

// ═══════════════════════════════════════════════════════════
// AVG-logboek — exporteerbaar privacyaudit-trail
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// Voertuig meldingen — monteur meldt storing of schade via app
// ═══════════════════════════════════════════════════════════

export const wagenparkMeldingenTable = pgTable("wagenpark_meldingen", {
  id:              serial("id").primaryKey(),
  voertuigId:      integer("voertuig_id").notNull().references(() => voertuigenTable.id, { onDelete: "cascade" }),
  gemeldDoorId:    integer("gemeld_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),

  type:            text("type").notNull().default("storing"),
  // "storing" | "schade" | "kwartaalcontrole" | "onderhoud" | "overige"

  omschrijving:    text("omschrijving").notNull(),
  fotoPaden:       text("foto_paden").array().notNull().default([]),

  // Schade-specifiek
  schadeLocatie:   text("schade_locatie"),
  // "voorzijde" | "achterzijde" | "links" | "rechts" | "interieur" | "laadruimte" | "ruit" | "band" | "velg"

  // Storing-specifiek
  storingType:     text("storing_type"),
  // "motor" | "verlichting" | "banden" | "remmen" | "accu" | "ruit" | "airco" | "onderhoudsmelding" | "overige"

  aiDiagnose:      text("ai_diagnose"),
  aiOplossing:     text("ai_oplossing"),
  aiKostenIndicatie: boolean("ai_kosten_indicatie").notNull().default(false),
  aiKostenTekst:   text("ai_kosten_tekst"),

  // AI-uitkomsten (kwartaalcontrole/schade/storing) — mens bevestigt altijd vóór verzenden
  aiFotokwaliteitOk:      boolean("ai_fotokwaliteit_ok"),
  aiGelezenKmStand:       integer("ai_gelezen_km_stand"),
  aiGelezenWaarschuwingen: jsonb("ai_gelezen_waarschuwingen"), // string[]
  aiErnstIndicatie:       text("ai_ernst_indicatie"),
  // "licht" | "matig" | "ernstig"
  aiMogelijkDuplicaatVanId: integer("ai_mogelijk_duplicaat_van_id"),
  // (geen self-FK-constraint i.v.m. eenvoud van cascades; wordt server-side gevalideerd)

  status:          text("status").notNull().default("nieuw"),
  // "nieuw" | "in_beoordeling" | "actie_nodig" | "ingepland" | "opgelost" | "afgewezen_duplicaat"

  toegewezenBeheerderId: integer("toegewezen_beheerder_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  onderhoudId:           integer("onderhoud_id").references(() => wagenparkOnderhoudTable.id, { onDelete: "set null" }),
  opvolgNotitie:         text("opvolg_notitie"),
  // Vrij tekstveld voor schadeherstel/verzekering/lease-opvolging (geen aparte entiteit)

  adminNotitie:    text("admin_notitie"),

  aangemaaktOp:    timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:    timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const wagenparkMeldingInsertSchema = createInsertSchema(wagenparkMeldingenTable, {
  type:     z.enum(["storing", "schade", "kwartaalcontrole", "onderhoud", "overige"]),
  status:   z.enum(["nieuw", "in_beoordeling", "actie_nodig", "ingepland", "doorgezet_garage", "opgelost", "afgewezen_duplicaat"]),
  omschrijving: z.string().min(1),
  schadeLocatie: z.enum([
    "voorzijde", "achterzijde", "links", "rechts", "interieur", "laadruimte", "ruit", "band", "velg",
  ]).nullish(),
  storingType: z.enum([
    "motor", "verlichting", "banden", "remmen", "accu", "ruit", "airco", "onderhoudsmelding", "overige",
  ]).nullish(),
  aiErnstIndicatie: z.enum(["licht", "matig", "ernstig"]).nullish(),
}).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });

export type WagenparkMeldingInsert = z.infer<typeof wagenparkMeldingInsertSchema>;
export type WagenparkMelding = typeof wagenparkMeldingenTable.$inferSelect;

// ═══════════════════════════════════════════════════════════
// Kwartaalcontrole-cyclus per voertuig (voor oplopend dringende pushmeldingen)
// ═══════════════════════════════════════════════════════════

export const wagenparkKwartaalcontroleTable = pgTable("wagenpark_kwartaalcontrole", {
  id:          serial("id").primaryKey(),
  voertuigId:  integer("voertuig_id").notNull().references(() => voertuigenTable.id, { onDelete: "cascade" }),

  periodeStart:   timestamp("periode_start").notNull(),   // start van het kwartaal
  deadline:       timestamp("deadline").notNull(),        // einde van het kwartaal

  status:      text("status").notNull().default("open"),
  // "open" | "voltooid" | "verlopen"
  meldingId:   integer("melding_id").references(() => wagenparkMeldingenTable.id, { onDelete: "set null" }),

  laatsteHerinneringOp: timestamp("laatste_herinnering_op"),
  aantalHerinneringen:  integer("aantal_herinneringen").notNull().default(0),

  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const wagenparkKwartaalcontroleInsertSchema = createInsertSchema(wagenparkKwartaalcontroleTable, {
  status: z.enum(["open", "voltooid", "verlopen"]),
}).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });

export type WagenparkKwartaalcontroleInsert = z.infer<typeof wagenparkKwartaalcontroleInsertSchema>;
export type WagenparkKwartaalcontrole = typeof wagenparkKwartaalcontroleTable.$inferSelect;

// ═══════════════════════════════════════════════════════════
// Expo-pushtokens per gebruiker/toestel
// ═══════════════════════════════════════════════════════════

export const pushTokensTable = pgTable("push_tokens", {
  id:            serial("id").primaryKey(),
  gebruikerId:   integer("gebruiker_id").notNull().references(() => gebruikersTable.id, { onDelete: "cascade" }),
  expoPushToken: text("expo_push_token").notNull(),
  platform:      text("platform").notNull().default("onbekend"),
  // "ios" | "android" | "onbekend"

  aangemaaktOp:      timestamp("aangemaakt_op").notNull().defaultNow(),
  laatstGebruiktOp:  timestamp("laatst_gebruikt_op").notNull().defaultNow(),
});

export const pushTokenInsertSchema = createInsertSchema(pushTokensTable, {
  expoPushToken: z.string().min(1),
  platform: z.enum(["ios", "android", "onbekend"]),
}).omit({ id: true, aangemaaktOp: true, laatstGebruiktOp: true });

export type PushTokenInsert = z.infer<typeof pushTokenInsertSchema>;
export type PushToken = typeof pushTokensTable.$inferSelect;

// ═══════════════════════════════════════════════════════════
// Werktijdvensters — configureerbaar per organisatie (voertuig_id NULL)
// of per voertuig. Voertuiggericht rapport van ritten buiten venster;
// bewust géén persoonsgerichte controle (privacy-by-design).
// ═══════════════════════════════════════════════════════════

export const wagenparkWerktijdvenstersTable = pgTable("wagenpark_werktijdvensters", {
  id:          serial("id").primaryKey(),
  // NULL = organisatiestandaard; anders voertuigspecifieke uitzondering.
  voertuigId:  integer("voertuig_id").references(() => voertuigenTable.id, { onDelete: "cascade" }),

  // Weekdagen waarop gewerkt wordt: 0=zondag … 6=zaterdag.
  werkdagen:   integer("werkdagen").array().notNull().default([1, 2, 3, 4, 5]),
  startTijd:   text("start_tijd").notNull().default("07:00"),   // "HH:MM" lokale tijd (Europe/Amsterdam)
  eindTijd:    text("eind_tijd").notNull().default("18:00"),
  actief:      boolean("actief").notNull().default(true),

  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type WagenparkWerktijdvenster = typeof wagenparkWerktijdvenstersTable.$inferSelect;

// ═══════════════════════════════════════════════════════════

export const wagenparkAvgLogboekTable = pgTable("wagenpark_avg_logboek", {
  id:          serial("id").primaryKey(),
  datum:       timestamp("datum").notNull().defaultNow(),
  actie:       text("actie").notNull(),
  // "inzage" | "export" | "sync" | "verwijdering" | "locatie_geraadpleegd"
  voertuigId:  integer("voertuig_id").references(() => voertuigenTable.id, { onDelete: "set null" }),
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  reden:       text("reden"),
  datatype:    text("datatype"),  // "locatie" | "ritten" | "kilometerstand" | "alle"
  bewaartermijn: text("bewaartermijn"),
  bijzonderheden: text("bijzonderheden"),
});

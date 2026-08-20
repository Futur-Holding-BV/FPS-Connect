import { pgTable, serial, text, integer, timestamp, boolean, numeric, jsonb, unique, uniqueIndex, real } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebouwenTable } from "./gebouwen";
import { gebruikersTable } from "./gebruikers";
import { opdrachtenTable } from "./opdrachten";
import { leveranciersTable } from "./leveranciers";
import { werkgeversTable } from "./hrm";

// ── AccountView instellingen (singleton per installatie) ──────────────────────
// NUMMER_01 §4.6 — fiscale factuurreeks per BV: teller onder slot, toegekend
// bij definitief maken (nooit bij concept), zodat een weggegooid concept geen
// nummer verbruikt en de reeks geen gaten krijgt.
export const factuurnummerTellersTable = pgTable("factuurnummer_tellers", {
  werkgeverId: integer("werkgever_id").primaryKey(), // FK in DB (migratie 0010)
  laatsteNummer: integer("laatste_nummer").notNull().default(0),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const accountviewInstellingenTable = pgTable("accountview_instellingen", {
  id: serial("id").primaryKey(),
  apiEndpoint: text("api_endpoint"),
  administratiecode: text("administratiecode"),
  apiGebruiker: text("api_gebruiker"),
  apiKey: text("api_key"),
  testmodus: boolean("testmodus").notNull().default(true),
  dagboekInkoop: text("dagboek_inkoop").default("INK"),
  dagboekVerkoop: text("dagboek_verkoop").default("VRK"),
  dagboekBank: text("dagboek_bank"),
  grootboekStandaard: text("grootboek_standaard"),
  btwCodes: jsonb("btw_codes").default("{}"),
  kostenplaatsen: jsonb("kostenplaatsen").default("{}"),
  debiteuerMapping: jsonb("debiteur_mapping").default("{}"),
  crediteurMapping: jsonb("crediteur_mapping").default("{}"),
  exportActief: boolean("export_actief").notNull().default(false),
  grootboekVoorraad: text("grootboek_voorraad"),
  grootboekInkoopKosten: text("grootboek_inkoop_kosten"),
  magazijnExportActief: boolean("magazijn_export_actief").notNull().default(false),
  // ADMINISTRATIE_01 fase 3: welke werkmaatschappij (BV) deze AccountView-
  // koppeling/administratie toebehoort. Boeken wordt fail-closed geweigerd
  // zolang dit leeg is of de factuur-BV afwijkt. Soft ref, FK in migratie 0082.
  werkgeverId: integer("werkgever_id"),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type AccountviewInstellingen = typeof accountviewInstellingenTable.$inferSelect;

// ── Facturen ──────────────────────────────────────────────────────────────────
// Status-lifecycle:
//   ontvangen → ai_gelezen → controle_nodig | klaar_voor_boeking | afgekeurd
//   → klaar_voor_accountview → verzonden_naar_accountview | fout_bij_verzending → verwerkt
//   Geblokkeerd kan op elk moment worden gezet.
export const facturenTable = pgTable("facturen", {
  id: serial("id").primaryKey(),

  // Type
  type: text("type").notNull().default("inkoop"), // inkoop | verkoop
  // Subtype voor bijzondere factuursoorten die een eigen goedkeuringsbeleid vereisen
  subtype: text("subtype"), // null | creditnota | prijsafwijking

  // Basisgegevens
  factuurnummer: text("factuurnummer"),
  factuurdatum: text("factuurdatum"),
  vervaldatum: text("vervaldatum"),
  omschrijving: text("omschrijving"),

  // Partijen
  relatienaam: text("relatienaam"),         // crediteur (inkoop) of debiteur (verkoop)
  relatieCode: text("relatie_code"),        // AccountView debiteuren/crediteurencode
  relatieAdres: text("relatie_adres"),

  // Bedragen
  bedragExclBtw: numeric("bedrag_excl_btw", { precision: 12, scale: 2 }),
  btwBedrag: numeric("btw_bedrag", { precision: 12, scale: 2 }),
  bedragInclBtw: numeric("bedrag_incl_btw", { precision: 12, scale: 2 }),

  // Boekhoudkundige velden
  btwCode: text("btw_code"),
  grootboekrekening: text("grootboekrekening"),
  kostenplaats: text("kostenplaats"),
  dagboek: text("dagboek"),
  projectCode: text("project_code"),

  // PDF-bestand
  pdfUrl: text("pdf_url"),
  bestandsnaam: text("bestandsnaam"),

  // Koppelingen
  gebouwId: integer("gebouw_id").references(() => gebouwenTable.id, { onDelete: "set null" }),
  // LEVERANCIER_01: wijst naar het leveranciersregister (inkooprelaties),
  // nooit naar crm_klanten (commerciële relaties). FK in DB via migratie 0025.
  leverancierId: integer("leverancier_id").references(() => leveranciersTable.id, { onDelete: "set null" }),
  projectId: integer("project_id"),

  // AI-uitgelezen metadata
  aiMetadata: jsonb("ai_metadata"),

  // Status
  status: text("status").notNull().default("ontvangen"),
  // ontvangen | ai_gelezen | controle_nodig | klaar_voor_boeking | afgekeurd
  // klaar_voor_accountview | verzonden_naar_accountview | fout_bij_verzending | verwerkt
  geblokkeerd: boolean("geblokkeerd").notNull().default(false),
  blokkeringReden: text("blokkering_reden"),

  // Afkeuring
  afgekeurdReden: text("afkeuring_reden"),
  afgekeurdOp: timestamp("afgekeurd_op"),
  afgekeurdDoor: integer("afgekeurd_door").references(() => gebruikersTable.id, { onDelete: "set null" }),

  // AccountView export
  accountviewBoekingId: text("accountview_boeking_id"),
  accountviewExportOp: timestamp("accountview_export_op"),
  accountviewStatus: text("accountview_status"),
  accountviewFout: text("accountview_fout"),
  payloadHash: text("payload_hash"),

  // Terugkoppeling betaalstatus
  betaalstatus: text("betaalstatus"),     // openstaand | betaald | deels_betaald
  betaaldatum: text("betaaldatum"),
  boekingsnummer: text("boekingsnummer"), // AccountView boekingsnummer
  terugkoppelingOp: timestamp("terugkoppeling_op"),

  // Herexport
  herexportOp: timestamp("herexport_op"),
  herexportDoor: integer("herexport_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  herexportReden: text("herexport_reden"),

  // AI verwerking
  aiGelezen: boolean("ai_gelezen").notNull().default(false),
  aiVertrouwen: real("ai_vertrouwen"),

  // Opmerkingen
  opmerkingen: text("opmerkingen"),

  // Accordering (gedetailleerde status — naast de boolean geaccordeerd)
  accorderingStatus: text("accordering_status"),
  accorderingDoorId: integer("accordering_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  accorderingOp: timestamp("accordering_op"),

  // Betaaldatum als timestamp (naast betaaldatum als tekst)
  betaaldOp: timestamp("betaald_op"),

  // Beheer
  uploaderId: integer("uploader_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  geaccordeerd: boolean("geaccordeerd").notNull().default(false),
  geaccordeerdOp: timestamp("geaccordeerd_op"),
  geaccordeerdDoor: integer("geaccordeerd_door").references(() => gebruikersTable.id, { onDelete: "set null" }),

  // Extra controle door medewerker (door projectleider toegewezen)
  beoordelaarId: integer("beoordelaar_id").references(() => gebruikersTable.id, { onDelete: "set null" }),

  // Opdracht/project-koppeling (voor verkoopfacturen en gelinkte inkoopfacturen)
  opdrachtId: integer("opdracht_id").references(() => opdrachtenTable.id, { onDelete: "set null" }),
  inkoopbonId: integer("inkoopbon_id"), // soft ref naar inkoopbonnen.id (geen FK — cross-schema dep)
  // Fiscale momentopname van de uitgevende BV. Vanaf definitief maken is dit
  // leidend voor creditering en AccountView; harde FK in migratie 0102.
  werkgeverId: integer("werkgever_id"),
  // Alleen een expliciete timestamp maakt werkgeverId een betrouwbare fiscale
  // snapshot. Legacy zonder deze marker faalt gesloten (migratie 0103).
  werkgeverVastgelegdOp: timestamp("werkgever_vastgelegd_op"),
  // GELDSTROOM_01 creditfactuur: blijvende verwijzing naar het fiscale
  // brondocument. Self-reference als harde FK in migratie 0101.
  oorspronkelijkeFactuurId: integer("oorspronkelijke_factuur_id"),
  // NUMMER_01 §4.6: kenmerkketen — verkoopfactuur hangt aan de offerte (O405/F002)
  offerteId: integer("offerte_id"), // FK in DB (migratie 0010); soft ref hier tegen circulaire import
  // NUMMER_01 §4.6: F-volgnummer per offerte vanaf 1 — uitdrukkelijk NIET het factuurnummer
  nummer: integer("nummer"),
  // NUMMER_01 §4.3: vastgevroren kenmerk-momentopname bij definitief maken
  kenmerk: text("kenmerk"),

  // Factuurcategorie (structureert inkoopfacturen)
  // projectmateriaal | onderaanneming | algemene_kosten | investering | wagenpark |
  // gereedschap | magazijn | representatie | software | verzekering | correctie
  categorie: text("categorie"),

  // Verkoopfactuurvoorstel — bron van het voorstel
  // oplevering | regie | meerwerk | termijn | weekstaat | onderhoud | handmatig
  voorstelBron: text("voorstel_bron"),
  voorstelBronId: integer("voorstel_bron_id"), // ID van de bronentiteit

  // G-rekening (wettelijke verplichting bouwsector bij specifieke projecttypen)
  gRekeningVanToepassing: boolean("g_rekening_van_toepassing").notNull().default(false),
  gRekeningBedrag: numeric("g_rekening_bedrag", { precision: 12, scale: 2 }),
  normaalBedrag: numeric("normaal_bedrag", { precision: 12, scale: 2 }), // bedrag incl. BTW minus G-rekening-deel

  // IBAN-verificatie: AI leest IBAN uit PDF — systeem vergelijkt met geregistreerd leveranciers-IBAN
  ibanUitgelezen: text("iban_uitgelezen"),
  ibanAfwijking: boolean("iban_afwijking").notNull().default(false),

  // Incasso
  incassoDatum: text("incasso_datum"),
  incassoReferentie: text("incasso_referentie"),

  // Herkomst van de factuur (hoe kwam de factuur binnen)
  bron: text("bron").notNull().default("handmatig"), // handmatig | upload | mailbox | import
  importId: integer("import_id"),                    // IMPORT_01: verwijzing naar import_logs.id

  // Afkeuring — gekozen categorie (naast de vrije reden)
  // verkeerde_prijs | verkeerd_aantal | levering_ontbreekt | verkeerde_leverancier |
  // dubbele_factuur | onbekende_kosten | project_klopt_niet | overig
  afkeurCategorie: text("afkeur_categorie"),

  // Koppeling aan een onderhoudscontract (soft ref — geen FK, cross-schema).
  // Wordt door de gebruiker gelegd; AI vergelijkt de factuur vervolgens met het contract.
  onderhoudscontractId: integer("onderhoudscontract_id"),

  // ── FACTUUR_02: de factuurstroom (mail → goedgekeurd of afgewezen) ──────────
  // Tenaamstelling bepaalt wélke BV betaalt (FPS Bouw BV | FPS Brandpreventie BV | FPS Onderhoud BV)
  tenaamstellingBv: text("tenaamstelling_bv"),
  // Gesloten afwijsredenlijst (§4): geen_opdracht | bedrag_wijkt_af | verkeerde_bv |
  // dubbel | onvoldoende_specificatie | niet_geleverd | uitzendbureau_zonder_g
  afwijsredenCode: text("afwijsreden_code"),
  // Inkoper die moet bevestigen dat de factuur klopt met de bestelling
  inkoperId: integer("inkoper_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  inkoperBevestigdOp: timestamp("inkoper_bevestigd_op"),
  // Velden die de AI niet met zekerheid kon bepalen (lijst van veldnamen).
  // Onzeker = gebeurtenis voor Jacqueline, nooit een stilzwijgende gok.
  onzekereVelden: jsonb("onzekere_velden"),
  // Wat de AI voorstelde bij binnenkomst (bevroren momentopname; §9 leren).
  aiVoorstelStroom: jsonb("ai_voorstel_stroom"),
  // Microsoft Graph gespreksdraad + oorspronkelijke mail (§8 reacties)
  conversationId: text("conversation_id"),
  mailMessageId: text("mail_message_id"),
  // Bij afwijzing: waar de factuur stond, zodat een nagestuurde aanvulling de
  // stroom hervat op het punt van afwijzing (§8) — niet opnieuw vooraan.
  statusVoorAfwijzing: text("status_voor_afwijzing"),

  // PRIJS_01 §6 — cache van het laatste toetsresultaat van de factuurregels
  // tegen de prijsafspraken. Puur informatief naast de factuur; de factuurregel
  // zelf wordt nooit gewijzigd (§9).
  prijscontrole: jsonb("prijscontrole"),

  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => [
  // FACTUUR_02 idempotentie: dezelfde mailbijlage mag nooit twee facturen
  // opleveren, ook niet na een crash-en-retry of parallelle verwerkingsruns.
  uniqueIndex("facturen_mailstroom_bijlage_uniek")
    .on(t.mailMessageId, t.bestandsnaam)
    .where(sql`${t.bron} = 'mailbox' AND ${t.mailMessageId} IS NOT NULL AND ${t.bestandsnaam} IS NOT NULL`),
]);

// FACTUUR_02 §4 — gesloten afwijsredenlijst. De AI kiest eruit; nooit vrije tekst.
export const FACTUUR_AFWIJSREDENEN = {
  geen_opdracht: "Geen opdracht of inkoop bekend",
  bedrag_wijkt_af: "Bedrag wijkt af van de opdracht",
  verkeerde_bv: "Verkeerde tenaamstelling of verkeerde BV",
  dubbel: "Dubbel ontvangen",
  onvoldoende_specificatie: "Onvoldoende gespecificeerd",
  niet_geleverd: "Werk niet geleverd of niet akkoord",
  uitzendbureau_zonder_g: "Uitzendbureaufactuur zonder G-verdeling",
} as const;
export type FactuurAfwijsredenCode = keyof typeof FACTUUR_AFWIJSREDENEN;

// FACTUUR_02 §6 — gebeurtenistypen voor het bewakingsdashboard (Jacqueline).
export const FACTUUR_SIGNAAL_TYPES = [
  "ai_onzeker",            // 1. leverancier, BV of bedrag niet met zekerheid bepaald
  "hangt_te_lang",         // 2. wacht al dagen bij de inkoper of bij René
  "bedrag_wijkt_af",       // 3. wijkt af van wat deze leverancier normaal factureert
  "mogelijk_dubbel",       // 4.
  "termijn_loopt_af",      // 5. betaaltermijn nadert vóór de eerstvolgende batch
  "uitgaand_onbetaald",    // 6. uitgaande factuur niet betaald
  "rekeningnummer_gewijzigd", // 7. fraude-indicator — mag nooit stil afgehandeld worden
  "loondeel_onzeker",      // 8. loondeel niet gevonden/onwaarschijnlijk bij uitzendbureau
  "onbekende_leverancier", // 9. nog niet in het leveranciersregister
  // AANVRAAG_01 — reactietijdbewaking van prijsaanvragen (zelfde mechanisme, geen tweede dashboard)
  "aanvraag_antwoord_te_laat",  // conceptantwoord nog niet verstuurd binnen de instelbare termijn
  "aanvraag_niet_opgepakt",     // projectkans staat na de instelbare termijn nog in fase 'signaal'
  // LOON_01 — SEPA-loonbestand per mail binnengekomen maar werkgever/periode onzeker
  "loon_sepa_onvolledig",
  // NP_INKOOP_01 — factuur gekoppeld aan algemene inkoop maar het bedrag wijkt
  // af van het verwachte bedrag; mag nooit stil geaccepteerd worden.
  "algemene_inkoop_bedrag_afwijkend",
  // INKOOP_BOEKING_01 — verplichte boekvelden (btw-code, factuurnummer, …) ontbreken
  // zodat automatisch boeken niet kan. Zodra de ontbrekende gegevens zijn ingevuld
  // en de factuur opnieuw geaccordeerd wordt, boekt hij alsnog automatisch.
  "ontbrekende_boekgegevens",
] as const;
export type FactuurSignaalType = typeof FACTUUR_SIGNAAL_TYPES[number];

// ── FACTUUR_02: signalen (gebeurtenissen, geen facturen) ──────────────────────
export const factuurSignalenTable = pgTable("factuur_signalen", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // FactuurSignaalType
  factuurId: integer("factuur_id").references(() => facturenTable.id, { onDelete: "cascade" }),
  mailMessageId: text("mail_message_id"),
  // AANVRAAG_01: signaal kan ook bij een projectkans horen (geen FK — cross-domein, bewust los).
  projectkansId: integer("projectkans_id"),
  omschrijving: text("omschrijving").notNull(), // gewone taal, voor het dashboard
  status: text("status").notNull().default("open"), // open | afgehandeld
  afgehandeldDoor: integer("afgehandeld_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  afgehandeldOp: timestamp("afgehandeld_op"),
  afhandelNotitie: text("afhandel_notitie"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => [
  // Maximaal één OPEN signaal per (type, factuur) — parallelle bewakingsruns
  // mogen geen dubbele open signalen opleveren.
  uniqueIndex("factuur_signalen_open_factuur_uq")
    .on(t.type, t.factuurId)
    .where(sql`${t.status} = 'open' AND ${t.factuurId} IS NOT NULL`),
  // Idem voor signalen bij een projectkans (AANVRAAG_01, zonder factuur).
  uniqueIndex("factuur_signalen_open_kans_uq")
    .on(t.type, t.projectkansId)
    .where(sql`${t.status} = 'open' AND ${t.factuurId} IS NULL AND ${t.projectkansId} IS NOT NULL`),
  // Idem voor signalen die alleen aan een mail hangen (geen factuur, geen kans).
  uniqueIndex("factuur_signalen_open_mail_uq")
    .on(t.type, t.mailMessageId)
    .where(sql`${t.status} = 'open' AND ${t.factuurId} IS NULL AND ${t.projectkansId} IS NULL AND ${t.mailMessageId} IS NOT NULL`),
]);
export type FactuurSignaal = typeof factuurSignalenTable.$inferSelect;

// ── FACTUUR_02: leesbare tijdlijn per factuur (§7 telefonische toelichting) ───
export const factuurTijdlijnTable = pgTable("factuur_tijdlijn", {
  id: serial("id").primaryKey(),
  factuurId: integer("factuur_id").notNull().references(() => facturenTable.id, { onDelete: "cascade" }),
  tekst: text("tekst").notNull(), // gewone taal, geen veldnamen of statuscodes
  gebeurdOp: timestamp("gebeurd_op").notNull().defaultNow(),
  gebruikerNaam: text("gebruiker_naam"), // wie handelde (null = het systeem)
});
export type FactuurTijdlijnRegel = typeof factuurTijdlijnTable.$inferSelect;

export const insertFactuurSchema = createInsertSchema(facturenTable).omit({
  id: true, aangemaaktOp: true, bijgewerktOp: true,
});
export type InsertFactuur = z.infer<typeof insertFactuurSchema>;
export type Factuur = typeof facturenTable.$inferSelect;

// ── Factuur opmerkingen (commentaarthreads per factuur) ───────────────────────
export const factuurOpmerkingenTable = pgTable("factuur_opmerkingen", {
  id: serial("id").primaryKey(),
  factuurId: integer("factuur_id").notNull().references(() => facturenTable.id, { onDelete: "cascade" }),
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  tekst: text("tekst").notNull(),
  replyOpId: integer("reply_op_id"),   // forward ref; self-ref constraints via ALTER
  afgehandeld: boolean("afgehandeld").notNull().default(false),
  afgehandeldOp: timestamp("afgehandeld_op"),
  afgehandeldDoor: integer("afgehandeld_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export type FactuurOpmerking = typeof factuurOpmerkingenTable.$inferSelect;

// ── Factuur herinneringen / aanmaningsflow ────────────────────────────────────
// type: eerste_herinnering | tweede_herinnering | aanmaning | ingebrekestelling
export const factuurHerinneringenTable = pgTable("factuur_herinneringen", {
  id: serial("id").primaryKey(),
  factuurId: integer("factuur_id").notNull().references(() => facturenTable.id, { onDelete: "cascade" }),
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  verstuurOp: timestamp("verstuurd_op"),
  ontvangerEmail: text("ontvanger_email"),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

export type FactuurHerinnering = typeof factuurHerinneringenTable.$inferSelect;

// ── AccountView export logs ───────────────────────────────────────────────────
// BANK_01: factuur_id is nullable zodat het log ook voor bankmutatie-exports
// kan worden gebruikt. bank_mutatie_id is gevuld bij een bankmutatie-export.
// Precies één van (factuur_id, bank_mutatie_id) moet gevuld zijn.
export const accountviewExportLogsTable = pgTable("accountview_export_logs", {
  id: serial("id").primaryKey(),
  // Nullable: BANK_01 maakt ook bank-mutatie-exports mogelijk.
  factuurId: integer("factuur_id").references(() => facturenTable.id, { onDelete: "cascade" }),
  // BANK_01: soft ref bank_mutaties.id (FK in migratie 0107 na aanmaken van die tabel)
  bankMutatieId: integer("bank_mutatie_id"),

  // Exportpoging
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  exportOp: timestamp("export_op").notNull().defaultNow(),
  testmodus: boolean("testmodus").notNull().default(true),
  actie: text("actie").notNull().default("export"), // export | herexport | sync | afkeuren | accorderen

  // Payload & response
  verzondenPayload: jsonb("verzonden_payload"),
  accountviewResponse: jsonb("accountview_response"),
  httpStatus: integer("http_status"),
  payloadHash: text("payload_hash"),

  // Uitkomst
  status: text("status").notNull().default("bezig"),  // bezig | geslaagd | mislukt
  accountviewBoekingId: text("accountview_boeking_id"),
  foutmelding: text("foutmelding"),
  aangemeldDoorGebruiker: text("aangemeld_door_gebruiker"),
});

export type AccountviewExportLog = typeof accountviewExportLogsTable.$inferSelect;

// ── AccountView relatie-mapping ───────────────────────────────────────────────
export const accountviewRelatieMappingTable = pgTable("accountview_relatie_mapping", {
  id: serial("id").primaryKey(),
  connectRelatienaam: text("connect_relatienaam").notNull(),
  accountviewCode: text("accountview_code").notNull(),
  type: text("type").notNull().default("crediteur"), // crediteur | debiteur
  opmerking: text("opmerking"),
  bestaatInAccountview: boolean("bestaat_in_accountview").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type AccountviewRelatieMapping = typeof accountviewRelatieMappingTable.$inferSelect;

// ── AccountView project/kostenplaats-mapping ──────────────────────────────────
export const accountviewProjectMappingTable = pgTable("accountview_project_mapping", {
  id: serial("id").primaryKey(),
  connectProjectCode: text("connect_project_code").notNull(),
  connectGebouwNaam: text("connect_gebouw_naam"),
  accountviewProjectcode: text("accountview_projectcode"),
  accountviewKostenplaats: text("accountview_kostenplaats"),
  opmerking: text("opmerking"),
  exportZonderMapping: boolean("export_zonder_mapping").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type AccountviewProjectMapping = typeof accountviewProjectMappingTable.$inferSelect;

// ── Factuurregels (gespecificeerde regellijnen per factuur) ───────────────────
// Elke factuur kan nul of meer regels bevatten. AI vult ze in op basis van
// PDF-extractie; administratie kan ze bewerken of handmatig toevoegen.
// Bron: ai | handmatig | inkooporder | regie | termijn | meerwerk
// Categorie (inkoopfactuur): projectmateriaal | onderaanneming | algemene_kosten |
//   investering | wagenpark | gereedschap | magazijn | representatie |
//   software | verzekering | correctie
export const factuurRegelsTable = pgTable("factuur_regels", {
  id: serial("id").primaryKey(),
  factuurId: integer("factuur_id").notNull().references(() => facturenTable.id, { onDelete: "cascade" }),

  regelnummer: integer("regelnummer").notNull().default(1),
  omschrijving: text("omschrijving").notNull(),
  hoeveelheid: real("hoeveelheid"),
  eenheid: text("eenheid"),                                // stuks | uur | m2 | m | kg | ...
  stukprijs: numeric("stukprijs", { precision: 12, scale: 2 }),
  bedragExclBtw: numeric("bedrag_excl_btw", { precision: 12, scale: 2 }),

  // BTW per regel — masteropdracht vereist meerdere BTW-tarieven op één factuur
  btwCode: text("btw_code"),                               // H (21%) | L (9%) | V (verlegd) | 0
  btwPercentage: real("btw_percentage"),                   // 0 | 9 | 21
  btwBedrag: numeric("btw_bedrag", { precision: 12, scale: 2 }),

  // Boekhoudkundige velden per regel
  grootboekrekening: text("grootboekrekening"),
  kostenplaats: text("kostenplaats"),
  categorie: text("categorie"),

  // Koppeling aan inkoopbon-regel voor 3-weg matching
  inkoopbonRegelId: integer("inkoopbon_regel_id"),         // soft ref — geen FK (cross-schema)
  // GELDSTROOM_01 creditfactuur: elke bronregel kan maximaal één keer worden
  // tegengeboekt. De harde FK + unieke partiële index staan in migratie 0101.
  oorspronkelijkeFactuurRegelId: integer("oorspronkelijke_factuur_regel_id"),

  // Herkomst van de regel
  bron: text("bron").notNull().default("handmatig"),       // ai | handmatig | inkooporder | regie | termijn | meerwerk
  aiVertrouwen: real("ai_vertrouwen"),                     // 0.0–1.0; null = handmatig

  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertFactuurRegelSchema = createInsertSchema(factuurRegelsTable).omit({
  id: true, aangemaaktOp: true, bijgewerktOp: true,
});
export type InsertFactuurRegel = z.infer<typeof insertFactuurRegelSchema>;
export type FactuurRegel = typeof factuurRegelsTable.$inferSelect;

// ── Factuur-termijnen (termijnschema per opdracht) ────────────────────────────
// Definieert het facturatieschema van een opdracht: bijv. 30% bij opdracht,
// 40% halverwege, 30% bij oplevering. Wanneer een termijn gefactureerd wordt,
// wordt factuurId gevuld en status gezet op "gefactureerd".
// Status: gepland | factureerbaar | gefactureerd
export const factuurTermijnenTable = pgTable("factuur_termijnen", {
  id: serial("id").primaryKey(),
  opdrachtId: integer("opdracht_id").notNull().references(() => opdrachtenTable.id, { onDelete: "cascade" }),

  volgnummer: integer("volgnummer").notNull(),
  omschrijving: text("omschrijving"),
  percentage: real("percentage"),                          // % van contractsom (0–100)
  bedrag: numeric("bedrag", { precision: 12, scale: 2 }), // berekend of handmatig ingevuld
  status: text("status").notNull().default("gepland"),     // gepland | factureerbaar | gefactureerd

  // Koppeling aan de gemaakte factuur (gezet zodra factuur is aangemaakt)
  factuurId: integer("factuur_id").references(() => facturenTable.id, { onDelete: "set null" }),

  vervaldatum: text("vervaldatum"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertFactuurTermijnSchema = createInsertSchema(factuurTermijnenTable).omit({
  id: true, aangemaaktOp: true, bijgewerktOp: true,
});
export type InsertFactuurTermijn = z.infer<typeof insertFactuurTermijnSchema>;
export type FactuurTermijn = typeof factuurTermijnenTable.$inferSelect;

// ── Factuur-correspondentie ───────────────────────────────────────────────────
// Legt correspondentie met de leverancier vast die aan een factuur hangt, in het
// bijzonder afkeur-mails. AI stelt een concept op (richting = uitgaand, status =
// concept); een mens controleert en verstuurt (status = verzonden). AI verstuurt
// nooit zelfstandig.
export const factuurCorrespondentieTable = pgTable("factuur_correspondentie", {
  id: serial("id").primaryKey(),
  factuurId: integer("factuur_id").notNull().references(() => facturenTable.id, { onDelete: "cascade" }),

  richting: text("richting").notNull().default("uitgaand"), // uitgaand | inkomend
  soort: text("soort").notNull().default("afkeur"),          // afkeur | vraag | overig
  status: text("status").notNull().default("concept"),       // concept | verzonden | mislukt

  ontvangerEmail: text("ontvanger_email"),
  ontvangerNaam: text("ontvanger_naam"),
  onderwerp: text("onderwerp").notNull(),
  bericht: text("bericht").notNull(),

  // Context waaruit het concept is opgesteld
  afkeurCategorie: text("afkeur_categorie"),
  aiGegenereerd: boolean("ai_gegenereerd").notNull().default(false),

  opgesteldDoor: integer("opgesteld_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  verzondenDoor: integer("verzonden_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  verzondenOp: timestamp("verzonden_op"),
  foutmelding: text("foutmelding"),

  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type FactuurCorrespondentie = typeof factuurCorrespondentieTable.$inferSelect;

// ── Zelflerende leverancierscategorisatie ─────────────────────────────────────
// Telt per leverancier hoe vaak een bepaalde combinatie van grootboekrekening,
// kostenplaats, categorie en BTW-code door mensen is bevestigd. De meest gekozen
// combinatie wordt door AI voorgesteld bij een volgende factuur van dezelfde
// leverancier. Puur leren op basis van menselijke bevestiging (geen autonome AI).
export const leverancierCategorisatieTable = pgTable("leverancier_categorisatie", {
  id: serial("id").primaryKey(),
  leverancierId: integer("leverancier_id").notNull(),

  grootboekrekening: text("grootboekrekening"),
  kostenplaats: text("kostenplaats"),
  categorie: text("categorie"),
  btwCode: text("btw_code"),

  aantal: integer("aantal").notNull().default(1),
  laatstBevestigdOp: timestamp("laatst_bevestigd_op").notNull().defaultNow(),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => ({
  uniekePatroon: unique().on(t.leverancierId, t.grootboekrekening, t.kostenplaats, t.categorie, t.btwCode),
}));

export type LeverancierCategorisatie = typeof leverancierCategorisatieTable.$inferSelect;

// ── Factuur-import instellingen (singleton) ───────────────────────────────────
// Configuratie van de automatische mailbox-import: welke financiële postbus wordt
// gepolld en of de import actief is.
export const factuurImportInstellingenTable = pgTable("factuur_import_instellingen", {
  id: serial("id").primaryKey(),
  actief: boolean("actief").notNull().default(false),
  mailboxAdres: text("mailbox_adres"),        // gedeelde postbus, bijv. facturen@...
  laatsteSyncOp: timestamp("laatste_sync_op"),
  laatsteSyncResultaat: text("laatste_sync_resultaat"),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export type FactuurImportInstellingen = typeof factuurImportInstellingenTable.$inferSelect;

// ── Factuur-import log (dedupe + audittrail mailbox-import) ────────────────────
// Elke verwerkte bijlage krijgt één regel. De unieke sleutel (messageId +
// bijlagenaam) voorkomt dat dezelfde bijlage twee keer een factuur aanmaakt.
export const factuurImportLogTable = pgTable("factuur_import_log", {
  id: serial("id").primaryKey(),
  messageId: text("message_id").notNull(),
  bijlageNaam: text("bijlage_naam").notNull(),
  bijlageHash: text("bijlage_hash"),
  formaat: text("formaat"),                    // pdf | ubl_xml | afbeelding | overig
  afzender: text("afzender"),
  onderwerp: text("onderwerp"),
  factuurId: integer("factuur_id").references(() => facturenTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("verwerkt"), // verwerkt | overgeslagen | mislukt
  foutmelding: text("foutmelding"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => ({
  uniekeBijlage: unique().on(t.messageId, t.bijlageNaam),
}));

export type FactuurImportLog = typeof factuurImportLogTable.$inferSelect;

// ── Rekeningschema per werkmaatschappij (ADMINISTRATIE_01) ─────────────────────
// Grootboekrekening was overal vrije tekst; dit schema is de enige keuzelijst.
// Gevuld via AccountView-sync of een ingelezen lijst. De exportservice weigert
// boeken op een nummer buiten het schema zodra het schema van die BV gevuld is.
export const grootboekrekeningenTable = pgTable("grootboekrekeningen", {
  id: serial("id").primaryKey(),
  werkgeverId: integer("werkgever_id").notNull(), // FK werkgevers in migratie 0088
  nummer: text("nummer").notNull(),
  omschrijving: text("omschrijving").notNull().default(""),
  soort: text("soort"),                       // bijv. kosten | opbrengsten | balans
  actief: boolean("actief").notNull().default(true),
  bron: text("bron").notNull().default("import"), // accountview | import
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => ({
  uniekNummerPerWerkgever: unique("grootboekrekeningen_wg_nummer_uniek").on(t.werkgeverId, t.nummer),
}));

export type Grootboekrekening = typeof grootboekrekeningenTable.$inferSelect;

// ── Btw-codes per administratie (ADMINISTRATIE_02 §1) ─────────────────────────
// Btw-code was overal vrije tekst; deze tabel is de enige keuzelijst.
// Gevuld via AccountView-sync of een ingelezen lijst. De exportservice weigert
// boeken met een code buiten het schema zodra het schema van die BV gevuld is.
// ── ADMINISTRATIE_02 §3: crediteuren-betaalbatch (SEPA pain.001) ─────────────
// Achter de akkoord-schakelaar app_instellingen.betaalbatch_actief (standaard
// uit) totdat de directie uitdrukkelijk akkoord geeft. Migratie 0090.
export const betaalbatchesTable = pgTable("betaalbatches", {
  id: serial("id").primaryKey(),
  werkgeverId: integer("werkgever_id").notNull().references(() => werkgeversTable.id, { onDelete: "cascade" }),
  // concept | bestand_aangemaakt | bevestigd | geannuleerd | uitgevoerd
  // BANK_01: 'uitgevoerd' wordt uitsluitend door bankbewijs (CAMT/MT940) gezet.
  status: text("status").notNull().default("concept"),
  uitvoerdatum: text("uitvoerdatum").notNull(),
  debiteurIban: text("debiteur_iban").notNull(),
  debiteurNaam: text("debiteur_naam").notNull(),
  totaalBedrag: numeric("totaal_bedrag", { precision: 12, scale: 2 }).notNull().default("0"),
  aantalBetalingen: integer("aantal_betalingen").notNull().default(0),
  bestandReferentie: text("bestand_referentie"),
  bestandAangemaaktOp: timestamp("bestand_aangemaakt_op"),
  bevestigdOp: timestamp("bevestigd_op"),
  bevestigdDoor: integer("bevestigd_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  // BANK_01: gezet zodra bankbewijs alle regels dekt.
  uitgevoerdOp: timestamp("uitgevoerd_op"),
  uitgevoerdImportId: integer("uitgevoerd_import_id"), // soft ref bank_imports.id
  aangemaaktDoor: integer("aangemaakt_door").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const betaalbatchRegelsTable = pgTable("betaalbatch_regels", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => betaalbatchesTable.id, { onDelete: "cascade" }),
  factuurId: integer("factuur_id").notNull().references(() => facturenTable.id, { onDelete: "cascade" }),
  crediteurNaam: text("crediteur_naam").notNull(),
  crediteurIban: text("crediteur_iban").notNull(),
  bedrag: numeric("bedrag", { precision: 12, scale: 2 }).notNull(),
  omschrijving: text("omschrijving").notNull(),
  // BANK_01: reconciliatiestatus en bankmutatiekoppeling per regel.
  // onbekend | gematcht | deels_gematcht | geen_kandidaat | meerdere_kandidaten | handmatig
  reconciliatieStatus: text("reconciliatie_status").notNull().default("onbekend"),
  bankMutatieId: integer("bank_mutatie_id"), // soft ref bank_mutaties.id (FK in migratie 0107)
  gematchBedrag: numeric("gematcht_bedrag", { precision: 14, scale: 2 }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
}, (t) => [uniqueIndex("betaalbatch_regels_factuur_uniek").on(t.factuurId)]);

export const btwCodesTable = pgTable("btw_codes", {
  id: serial("id").primaryKey(),
  werkgeverId: integer("werkgever_id").notNull(), // FK werkgevers in migratie 0089
  code: text("code").notNull(),
  omschrijving: text("omschrijving").notNull().default(""),
  percentage: real("percentage"),
  actief: boolean("actief").notNull().default(true),
  bron: text("bron").notNull().default("import"), // accountview | import
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
}, (t) => ({
  uniekeCodePerWerkgever: unique("btw_codes_wg_code_uniek").on(t.werkgeverId, t.code),
}));

export type BtwCode = typeof btwCodesTable.$inferSelect;

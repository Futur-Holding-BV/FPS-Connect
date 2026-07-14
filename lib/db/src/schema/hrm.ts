// HRM-module (Fase 1) — Parallel spoor, formeel akkoord gebruiker.
//
// Medewerkers, functiehuis, opleidingen/certificaten, bekwaamheidsmatrix en
// verlof (opbouw/opname/saldo, CAO-gebaseerd incl. juridische kaders en
// werknemerstoelichting) voor de volledige FPS Groep (FPS Bouw, FPS
// Brandpreventie, FPS Onderhoud, Fuegro). Fase 1 bevat BEWUST GEEN
// salarisadministratie.
import { pgTable, serial, text, integer, real, boolean, timestamp, date, numeric, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gebruikersTable, profielenTable } from "./gebruikers";
import { documentenTable } from "./documenten";

// Werkgever — hoofdentiteit binnen de FPS Groep. Elke werkmaatschappij is een
// eigen werkgever met eigen CAO, huisstijl (logo/briefpapier), personeelsbeleid,
// contractsjablonen en ondertekenaars. medewerkers/functies/verlofsoorten
// verwijzen hiernaar via werkgever_id; het bestaande tekstveld werkmaatschappij
// blijft als legacy/weergave-cache bestaan tot alle aanroepers zijn omgezet.
export const werkgeversTable = pgTable("werkgevers", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull().unique(),
  cao: text("cao").notNull().default("Metaal & Techniek"),
  logoDocumentId: integer("logo_document_id").references(() => documentenTable.id, { onDelete: "set null" }),
  briefpapierDocumentId: integer("briefpapier_document_id").references(() => documentenTable.id, { onDelete: "set null" }),
  personeelsbeleid: text("personeelsbeleid"),
  adres: text("adres"),
  postcode: text("postcode"),
  plaats: text("plaats"),
  kvk: text("kvk"),
  btw: text("btw"),
  telefoon: text("telefoon"),
  email: text("email"),
  website: text("website"),
  voettekst: text("voettekst"),
  handtekeningUrl: text("handtekening_url"),
  logoUrl: text("logo_url"),
  primaireKleur: text("primaire_kleur").default("#F23B0D"),
  iban: text("iban"),
  koptekstPositie: text("koptekst_positie"),
  voettekstPositie: text("voettekst_positie"),
  margeBoven: numeric("marge_boven", { precision: 6, scale: 2 }),
  margeOnder: numeric("marge_onder", { precision: 6, scale: 2 }),
  margeLinks: numeric("marge_links", { precision: 6, scale: 2 }),
  margeRechts: numeric("marge_rechts", { precision: 6, scale: 2 }),
  actief: boolean("actief").notNull().default(true),
  salarisverwerker: text("salarisverwerker"),
  boekhouderNaam: text("boekhouder_naam"),
  boekhouderEmail: text("boekhouder_email"),
  loonperiode: text("loonperiode").default("maandelijks"),
  internContactNaam: text("intern_contact_naam"),
  internContactEmail: text("intern_contact_email"),
  scabEmailAdres: text("scab_email_adres"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Functiehuis — per werkmaatschappij. Taken, verantwoordelijkheden, competenties,
// opleidingsvereisten en doorgroeipad. Staat los van rol/bevoegdheden: de functie
// beschrijft het werk, de bevoegdheden-matrix bepaalt de toegang.
export const functiesTable = pgTable("functies", {
  id: serial("id").primaryKey(),
  werkmaatschappij: text("werkmaatschappij").notNull().default("FPS Brandpreventie"),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  naam: text("naam").notNull(),
  omschrijving: text("omschrijving"),
  taken: text("taken"),
  verantwoordelijkheden: text("verantwoordelijkheden"),
  competenties: text("competenties"),
  opleidingsvereisten: text("opleidingsvereisten"),
  doorgroeipad: text("doorgroeipad"),
  // Standaard toegangsprofiel voor deze functie. Bij aanstelling worden de
  // bevoegdheden van dit profiel additief aan de medewerker toegekend
  // (increment 4: combineerBevoegdheden, hoogste niveau per module). null = geen
  // automatisch toegangsprofiel.
  profielId: integer("profiel_id").references(() => profielenTable.id, { onDelete: "set null" }),
  // uitvoerend = veldmedewerker (monteur, timmerman, voorman, leerling, ingehuurd uitvoerend).
  // true → medewerker verschijnt automatisch in de planning; kantoor-functies blijven verborgen.
  uitvoerend: boolean("uitvoerend").notNull().default(false),
  // Minimale bezetting — hoeveel medewerkers met deze functie (bij deze werkgever)
  // minimaal beschikbaar (niet met goedgekeurd verlof/ziek) moeten blijven op elke
  // dag. null = geen drempel ingesteld (geen bezettingscontrole bij goedkeuren verlof).
  minimaleBezetting: integer("minimale_bezetting"),
  actief: boolean("actief").notNull().default(true),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Medewerkers — kan, maar hoeft geen systeemaccount (gebruiker) te hebben.
// Persoons-/contactgegevens, werkmaatschappij, CAO en dienstverband.
export const medewerkersTable = pgTable("medewerkers", {
  id: serial("id").primaryKey(),
  gebruikerId: integer("gebruiker_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  naam: text("naam").notNull(),
  email: text("email"),
  telefoon: text("telefoon"),
  mobiel: text("mobiel"),
  werkmaatschappij: text("werkmaatschappij").notNull().default("FPS Brandpreventie"),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  functieId: integer("functie_id").references(() => functiesTable.id, { onDelete: "set null" }),
  // Leidinggevende — zelfreferentie naar medewerkers.id. Stuurt de goedkeuringsroute
  // voor verlofaanvragen: de leidinggevende mag het verlof van zijn/haar directe
  // teamleden beoordelen. Een hoofdbeheerder of iemand met personeel-schrijfrecht
  // kan altijd beoordelen als fallback/override, ook zonder leidinggevende-koppeling.
  leidinggevendeId: integer("leidinggevende_id").references((): AnyPgColumn => medewerkersTable.id, { onDelete: "set null" }),
  cao: text("cao"),
  dienstverband: text("dienstverband").notNull().default("vast"),
  // Naam uitzendbureau of onderaannemingsbedrijf (alleen relevant bij inhuur/onderaannemer).
  bedrijfUitzendbureau: text("bedrijf_uitzendbureau"),
  contracturenPerWeek: real("contracturen_per_week"),
  // Deeltijdpercentage (0-100); null = afgeleid uit contracturen/CAO-norm.
  deeltijdPercentage: real("deeltijd_percentage"),
  inDienstSinds: text("in_dienst_sinds"),
  uitDienstPer: text("uit_dienst_per"),
  noodcontactNaam: text("noodcontact_naam"),
  noodcontactTelefoon: text("noodcontact_telefoon"),
  // Persoonsgegevens
  geboortedatum: text("geboortedatum"),
  geboorteplaats: text("geboorteplaats"),
  // Woonadres
  adres: text("adres"),
  postcode: text("postcode"),
  woonplaats: text("woonplaats"),
  // Rijbewijs (comma-separated categorieën, bijv. "B, BE, C")
  rijbewijs: text("rijbewijs"),
  rijbewijsVervaldatum: text("rijbewijs_vervaldatum"),
  // Veiligheidscertificaten (vervaldatum, bijv. "2026-12-31")
  vcaVervaldatum: text("vca_vervaldatum"),
  ehboVervaldatum: text("ehbo_vervaldatum"),
  bhvVervaldatum: text("bhv_vervaldatum"),
  // CV / werkachtergrond (vrij tekstveld)
  cvTekst: text("cv_tekst"),
  // BSN — verplicht voor loonadministratie; strikt vertrouwelijk
  bsn: text("bsn"),
  // FPS Moments — opt-in: medewerker toont zijn/haar verjaardag aan collega's
  // (naam + foto, geen leeftijd/geboortejaar). Standaard uit; medewerker zet dit zelf aan.
  verjaardagZichtbaar: boolean("verjaardag_zichtbaar").notNull().default(false),
  actief: boolean("actief").notNull().default(true),
  opmerkingen: text("opmerkingen"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Opleidingen/certificeringen-catalogus. geldigheidMaanden = null betekent geen
// verloop; verplicht markeert opleidingen waarop het systeem moet signaleren.
//
// soort onderscheidt een volledige 'opleiding' (diplomagericht) van een 'cursus'
// (korte training/certificering). niveau/opleider/studieduur/studiebelasting/
// lesvorm en de kostenverdeling werkgever/werknemer zijn velden die de AI per
// functie kan voorstellen (een mens bevestigt; AI slaat nooit zelfstandig op).
export const opleidingenTable = pgTable("opleidingen", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  categorie: text("categorie").notNull().default("overig"),
  soort: text("soort").notNull().default("cursus"),
  omschrijving: text("omschrijving"),
  niveau: text("niveau"),
  opleider: text("opleider"),
  studieduur: text("studieduur"),
  studiebelasting: text("studiebelasting"),
  lesvorm: text("lesvorm"),
  kostenIndicatie: text("kosten_indicatie"),
  kostenWerkgeverPct: integer("kosten_werkgever_pct"),
  kostenWerknemerPct: integer("kosten_werknemer_pct"),
  geldigheidMaanden: integer("geldigheid_maanden"),
  verplicht: boolean("verplicht").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Koppeling functie <-> opleiding (veel-op-veel). Eén opleiding/cursus (bijv. VCA,
// BHV) kan bij meerdere functies horen; AI-voorstellen worden hier per functie
// vastgelegd zonder de catalogus te dupliceren.
export const functieOpleidingenTable = pgTable("functie_opleidingen", {
  id: serial("id").primaryKey(),
  functieId: integer("functie_id").notNull().references(() => functiesTable.id, { onDelete: "cascade" }),
  opleidingId: integer("opleiding_id").notNull().references(() => opleidingenTable.id, { onDelete: "cascade" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

// Behaalde opleidingen/certificaten per medewerker. Optionele koppeling naar het
// documentregister voor het bewijsstuk (certificaat).
export const medewerkerOpleidingenTable = pgTable("medewerker_opleidingen", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  opleidingId: integer("opleiding_id").notNull().references(() => opleidingenTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("behaald"),
  behaaldOp: text("behaald_op"),
  verlooptOp: text("verloopt_op"),
  certificaatDocumentId: integer("certificaat_document_id").references(() => documentenTable.id, { onDelete: "set null" }),
  opmerking: text("opmerking"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Bekwaamheidsmatrix — per medewerker welke werkzaamheden/producten/inspecties/
// projecten zijn toegestaan, met niveau (niet_bevoegd / onder_begeleiding /
// zelfstandig / specialist / trainer).
export const bekwaamhedenTable = pgTable("bekwaamheden", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  categorie: text("categorie").notNull().default("werkzaamheid"),
  onderwerp: text("onderwerp").notNull(),
  niveau: text("niveau").notNull().default("niet_bevoegd"),
  vastgesteldDoor: text("vastgesteld_door"),
  vastgesteldOp: text("vastgesteld_op"),
  opmerking: text("opmerking"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── Verlof (CAO-gebaseerd) ──────────────────────────────────────────────────
// Op verzoek toegevoegd: verlofopbouw/-opname/-saldo met juridische kaders en
// werknemerstoelichting (wanneer verlof opgenomen moet worden of vervalt).
//
// verlofsoorten = catalogus met regels per CAO (Metaal & Techniek, Bouw & Infra).
// categorie: wettelijk | bovenwettelijk | adv | collectief | bijzonder.
export const verlofsoortenTable = pgTable("verlofsoorten", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  categorie: text("categorie").notNull().default("wettelijk"),
  // Hoofdcategorie — vaste, herkenbare categorieën i.p.v. vrije tekst (server-side
  // afgedwongen, zie VERLOF_HOOFDCATEGORIEEN in routes/hrm.ts):
  // vakantie | adv_atv | tijd_voor_tijd | ziekte | bijzonder | onbetaald | overig.
  // Losstaand van het legacy `categorie`-veld (wettelijk/bovenwettelijk/adv/collectief/
  // bijzonder), dat blijft bestaan voor bestaande koppelingen/weergave.
  hoofdcategorie: text("hoofdcategorie").notNull().default("overig"),
  // true = deze verlofsoort representeert tijd-voor-tijd/compensatie-uren. Stuurt de
  // uren-module: hierlangs kan direct vanuit de weekstaat compensatieverlof worden
  // aangevraagd zonder losse (dubbele) urenregistratie.
  isTijdVoorTijd: boolean("is_tijd_voor_tijd").notNull().default(false),
  cao: text("cao"),
  werkmaatschappij: text("werkmaatschappij"),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  betaald: boolean("betaald").notNull().default(true),
  collectief: boolean("collectief").notNull().default(false),
  opbouwUrenPerJaar: real("opbouw_uren_per_jaar"),
  opbouwRegel: text("opbouw_regel"),
  vervalRegel: text("verval_regel"),
  juridischKader: text("juridisch_kader"),
  toelichting: text("toelichting"),
  actief: boolean("actief").notNull().default(true),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Verlofsaldo per medewerker, per soort, per jaar (in uren).
export const verlofSaldiTable = pgTable("verlof_saldi", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  verlofsoortId: integer("verlofsoort_id").notNull().references(() => verlofsoortenTable.id, { onDelete: "cascade" }),
  jaar: integer("jaar").notNull(),
  beginsaldoUren: real("beginsaldo_uren").notNull().default(0),
  opgebouwdUren: real("opgebouwd_uren").notNull().default(0),
  opgenomenUren: real("opgenomen_uren").notNull().default(0),
  saldoUren: real("saldo_uren").notNull().default(0),
  vervaltOp: text("vervalt_op"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Verlofaanvragen/-opname. status: concept | aangevraagd | goedgekeurd | afgewezen | ingetrokken.
export const verlofAanvragenTable = pgTable("verlofaanvragen", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  verlofsoortId: integer("verlofsoort_id").notNull().references(() => verlofsoortenTable.id, { onDelete: "cascade" }),
  startDatum: text("start_datum").notNull(),
  eindDatum: text("eind_datum").notNull(),
  aantalUren: real("aantal_uren").notNull().default(0),
  status: text("status").notNull().default("aangevraagd"),
  reden: text("reden"),
  opmerking: text("opmerking"),
  beoordeeldDoorId: integer("beoordeeld_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  beoordeeldOp: timestamp("beoordeeld_op"),
  // true = bij goedkeuren was de minimale bezetting (functie.minimaleBezetting) op één of
  // meer dagen onderschreden; een hoofdbeheerder/HRM heeft dit expliciet overruled.
  bezettingOverschreden: boolean("bezetting_overschreden").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Handmatige saldocorrecties door HRM. Append-only auditlog — niet wijzigen of verwijderen.
// Elke rij is zichtbaar voor de betrokken medewerker (via /mijn/verlof-correcties).
export const verlofCorrectiesTable = pgTable("verlof_correcties", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  verlofsoortId: integer("verlofsoort_id").notNull().references(() => verlofsoortenTable.id, { onDelete: "cascade" }),
  jaar: integer("jaar").notNull(),
  deltaUren: real("delta_uren").notNull(),
  reden: text("reden").notNull(),
  uitgevoerdDoorId: integer("uitgevoerd_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

// Audit-log voor alle statusovergangen en wijzigingen op verlofaanvragen.
// Onveranderlijk (geen UPDATE/DELETE): append-only. Schrijf altijd via logVerlofMutatie().
export const verlofAanvraagLogTable = pgTable("verlof_aanvraag_log", {
  id: serial("id").primaryKey(),
  verlofaanvraagId: integer("verlofaanvraag_id").notNull().references(() => verlofAanvragenTable.id, { onDelete: "cascade" }),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  uitgevoerdDoorId: integer("uitgevoerd_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  // actie: aangemaakt | goedgekeurd | afgewezen | ingetrokken | concept | gewijzigd | teruggedraaid
  actie: text("actie").notNull(),
  oudStatus: text("oud_status"),
  nieuwStatus: text("nieuw_status"),
  opmerking: text("opmerking"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

// Verlof-instellingen per werkgever per jaar. Stuurt het goedkeuringsproces,
// aanvraag-termijnen en overdrachtsregels voor het jaarrondeproces.
export const verlofInstellingenTable = pgTable("verlof_instellingen", {
  id: serial("id").primaryKey(),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  jaar: integer("jaar").notNull(),
  maxAaneengesloten: integer("max_aaneengesloten"),
  aanvraagTermijnDagen: integer("aanvraag_termijn_dagen"),
  goedkeuringAutomatisch: boolean("goedkeuring_automatisch").notNull().default(false),
  autoGoedkeuringDrempelUren: real("auto_goedkeuring_drempel_uren"),
  notificatieEmail: text("notificatie_email"),
  opmerking: text("opmerking"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Feestdagen — nationaal (werkgever_id = null) of per werkgever.
// Worden meegenomen bij berekening beschikbare capaciteit en in de bezettingsgraad.
export const feestdagenTable = pgTable("feestdagen", {
  id: serial("id").primaryKey(),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  jaar: integer("jaar").notNull(),
  datum: text("datum").notNull(),
  naam: text("naam").notNull(),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Jaarafsluiting-regels — definieert per werkgever en verlofsoort hoeveel uren
// mogen worden overgedragen naar het volgende jaar en wanneer ze vervallen.
// uitgevoerd_op wordt gezet zodra de POST /hrm/jaarafsluiting de verwerking heeft afgerond.
export const jaarAfsluitingRegelsTable = pgTable("jaarafsluiting_regels", {
  id: serial("id").primaryKey(),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  jaar: integer("jaar").notNull(),
  verlofsoortId: integer("verlofsoort_id").references(() => verlofsoortenTable.id, { onDelete: "set null" }),
  maxOverdrachtUren: real("max_overdracht_uren"),
  overdrachtVervalDatum: text("overdracht_verval_datum"),
  uitgevoerdOp: timestamp("uitgevoerd_op"),
  uitgevoerdDoorId: integer("uitgevoerd_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  opmerking: text("opmerking"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Ziekmeldingen — registratie van ziekteverzuim per medewerker.
// Kan worden ingediend door de medewerker zelf of door HRM/beheerder.
// status: gemeld | hersteld | langdurig (>6 weken aaneengesloten)
export const ziekmeldingenTable = pgTable("ziekmeldingen", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  startDatum: text("start_datum").notNull(),
  eindDatum: text("eind_datum"),
  reden: text("reden"), // griep | burn-out | operatie | privé | onbekend | overige
  omschrijving: text("omschrijving"),
  status: text("status").notNull().default("gemeld"),
  gemeldDoorId: integer("gemeld_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Persooonsdocumenten per medewerker — ID-bewijs, paspoort, CV, rijbewijs-scan,
// certificaten, arbeidscontract en overige personeelsdocumenten.
export const medewerkerDocumentenTable = pgTable("medewerker_documenten", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  // type: identiteitsbewijs | paspoort | verblijfsvergunning | rijbewijs | vca_certificaat |
  //        bhv_certificaat | ehbo_certificaat | contract | loonstrook | cv | diploma |
  //        naw_formulier | aow_verklaring | geheimhoudingsverklaring | overig
  type: text("type").notNull().default("overig"),
  label: text("label"),
  verloopdatum: date("verloopdatum"),
  bestandsnaam: text("bestandsnaam").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type"),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

// ZZP-overeenkomsten — overeenkomst van opdracht per ZZP-er per project.
// Vastlegt specifieke werkzaamheden, eigen verantwoordelijkheid en einddatum
// zoals vereist door de Belastingdienst (Wet DBA / WBBA).
export const zzpOvereenkomstenTable = pgTable("zzp_overeenkomsten", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  aangemaaktDoorId: integer("aangemaakt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  // Opdracht
  opdrachtOmschrijving: text("opdracht_omschrijving").notNull(),
  specifiekeTaken: text("specifieke_taken"),
  projectnummer: text("projectnummer"),
  // Tijdsduur — einddatum verplicht (vereiste Belastingdienst)
  startDatum: text("start_datum").notNull(),
  eindDatum: text("eind_datum").notNull(),
  // Financieel
  uurtarief: real("uurtarief"),
  vastePrijs: real("vaste_prijs"),
  betalingswijze: text("betalingswijze").notNull().default("factuur_achteraf"),
  // Gegevens opdrachtnemer
  zzpBedrijfsnaam: text("zzp_bedrijfsnaam"),
  zzpKvk: text("zzp_kvk"),
  zzpBtw: text("zzp_btw"),
  // Status: concept → te_ondertekenen → ondertekend | verlopen | opgezegd
  status: text("status").notNull().default("concept"),
  handtekeningFpsDatum: text("handtekening_fps_datum"),
  handtekeningZzpDatum: text("handtekening_zzp_datum"),
  ondertekendDoorId: integer("ondertekend_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  // AI
  aiIngevuld: boolean("ai_ingevuld").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Medewerker aanstellingen — één medewerker kan voor meerdere werkmaatschappijen
// werken, elk met een eigen functie en eventueel eigen CAO-context.
// isHoofd = de primaire aanstelling; CAO en contracturen worden hier vandaan
// gesynchroniseerd naar medewerkers.cao / medewerkers.werkmaatschappij.
export const medewerkerAanstellingenTable = pgTable("medewerker_aanstellingen", {
  id: serial("id").primaryKey(),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  werkmaatschappij: text("werkmaatschappij").notNull(),
  werkgeverId: integer("werkgever_id").references(() => werkgeversTable.id, { onDelete: "set null" }),
  functieId: integer("functie_id").references(() => functiesTable.id, { onDelete: "set null" }),
  cao: text("cao"),
  contracturenPerWeek: real("contracturen_per_week"),
  isHoofd: boolean("is_hoofd").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// ── CAO-keuzes per medewerker ─────────────────────────────────────────────────
// Registreert de jaarlijkse of structurele arbeidsvoorwaardenkeuzes die per CAO
// vereist zijn: vakantiegeld-uitkeringsvariant (Bouw 55%/100%), spaarfonds-naam
// en gereedschapsgeld-keuze (geld of natura). Beheerder legt vast, medewerker
// heeft inzagerecht via de app.
export const medewerkerCaoKeuzesTable = pgTable("medewerker_cao_keuzes", {
  id:            serial("id").primaryKey(),
  medewerkerId:  integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  type:          text("type").notNull(),         // vakantiegeld | gereedschapsgeld | spaarfonds
  jaar:          integer("jaar"),                // null = structureel/lopend
  keuze:         text("keuze").notNull(),        // vakantiegeld: 55_uitbetaald|100_spaarfonds|100_uitbetaald; gereedschapsgeld: geld|natura; spaarfonds: naam-tekst
  fondsNaam:     text("fonds_naam"),             // spaarfondstype: bijv. "Bouw & Infra Spaarfonds"
  bedragCents:   integer("bedrag_cents"),        // gereedschapsgeld: jaarlijks bedrag in centen
  toelichting:   text("toelichting"),
  aangemaaktOp:  timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp:  timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertZzpOvereenkomstSchema = createInsertSchema(zzpOvereenkomstenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertZzpOvereenkomst = z.infer<typeof insertZzpOvereenkomstSchema>;
export type ZzpOvereenkomst = typeof zzpOvereenkomstenTable.$inferSelect;

export const insertWerkgeverSchema = createInsertSchema(werkgeversTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertFunctieSchema = createInsertSchema(functiesTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertMedewerkerSchema = createInsertSchema(medewerkersTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertOpleidingSchema = createInsertSchema(opleidingenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertFunctieOpleidingSchema = createInsertSchema(functieOpleidingenTable).omit({ id: true, aangemaaktOp: true });
export const insertMedewerkerOpleidingSchema = createInsertSchema(medewerkerOpleidingenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertBekwaamheidSchema = createInsertSchema(bekwaamhedenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertVerlofsoortSchema = createInsertSchema(verlofsoortenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertVerlofSaldoSchema = createInsertSchema(verlofSaldiTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertVerlofAanvraagSchema = createInsertSchema(verlofAanvragenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
// ── Poortwachter (Wet Verbetering Poortwachter) ───────────────────────────────
// Reintegratiedossier per ziekmelding met de 7 verplichte WvP-mijlpalen.
// Gemiste deadlines → UWV-sanctie (max. 52 extra weken loondoorbetaling).
export const poortwachterDossiersTable = pgTable("poortwachter_dossiers", {
  id: serial("id").primaryKey(),
  ziekmeldingId: integer("ziekmelding_id").notNull().unique().references(() => ziekmeldingenTable.id, { onDelete: "cascade" }),
  medewerkerId: integer("medewerker_id").notNull().references(() => medewerkersTable.id, { onDelete: "cascade" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

// Eén rij per mijlpaaltype per dossier; deadline wordt berekend vanuit start_datum + dag_offset.
export const poortwachterMijlpalenTable = pgTable("poortwachter_mijlpalen", {
  id: serial("id").primaryKey(),
  dossierId: integer("dossier_id").notNull().references(() => poortwachterDossiersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  deadlineDatum: text("deadline_datum").notNull(),
  afgerondOp: timestamp("afgerond_op"),
  notitie: text("notitie"),
  bijgewerktDoorId: integer("bijgewerkt_door_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});

export const insertZiekmeldingenSchema = createInsertSchema(ziekmeldingenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertVerlofAanvraagLogSchema = createInsertSchema(verlofAanvraagLogTable).omit({ id: true, aangemaaktOp: true });
export const insertVerlofInstellingenSchema = createInsertSchema(verlofInstellingenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertFeestdagSchema = createInsertSchema(feestdagenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export const insertJaarAfsluitingRegelSchema = createInsertSchema(jaarAfsluitingRegelsTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });

export type InsertWerkgever = z.infer<typeof insertWerkgeverSchema>;
export type InsertFunctie = z.infer<typeof insertFunctieSchema>;
export type InsertMedewerker = z.infer<typeof insertMedewerkerSchema>;
export type InsertOpleiding = z.infer<typeof insertOpleidingSchema>;
export type InsertFunctieOpleiding = z.infer<typeof insertFunctieOpleidingSchema>;
export type InsertMedewerkerOpleiding = z.infer<typeof insertMedewerkerOpleidingSchema>;
export type InsertBekwaamheid = z.infer<typeof insertBekwaamheidSchema>;
export type InsertVerlofsoort = z.infer<typeof insertVerlofsoortSchema>;
export type InsertVerlofSaldo = z.infer<typeof insertVerlofSaldoSchema>;
export type InsertVerlofAanvraag = z.infer<typeof insertVerlofAanvraagSchema>;
export type InsertVerlofAanvraagLog = z.infer<typeof insertVerlofAanvraagLogSchema>;
export type InsertVerlofInstellingen = z.infer<typeof insertVerlofInstellingenSchema>;
export type InsertFeestdag = z.infer<typeof insertFeestdagSchema>;
export type InsertJaarAfsluitingRegel = z.infer<typeof insertJaarAfsluitingRegelSchema>;

export type Werkgever = typeof werkgeversTable.$inferSelect;
export type Functie = typeof functiesTable.$inferSelect;
export type Medewerker = typeof medewerkersTable.$inferSelect;
export type Opleiding = typeof opleidingenTable.$inferSelect;
export type FunctieOpleiding = typeof functieOpleidingenTable.$inferSelect;
export type MedewerkerOpleiding = typeof medewerkerOpleidingenTable.$inferSelect;
export type Bekwaamheid = typeof bekwaamhedenTable.$inferSelect;
export type Verlofsoort = typeof verlofsoortenTable.$inferSelect;
export type VerlofSaldo = typeof verlofSaldiTable.$inferSelect;
export type VerlofAanvraag = typeof verlofAanvragenTable.$inferSelect;
export type VerlofAanvraagLog = typeof verlofAanvraagLogTable.$inferSelect;
export const insertVerlofCorrectieSchema = createInsertSchema(verlofCorrectiesTable).omit({ id: true, aangemaaktOp: true });
export type InsertVerlofCorrectie = z.infer<typeof insertVerlofCorrectieSchema>;
export type VerlofCorrectie = typeof verlofCorrectiesTable.$inferSelect;
export type VerlofInstellingen = typeof verlofInstellingenTable.$inferSelect;
export type Feestdag = typeof feestdagenTable.$inferSelect;
export type JaarAfsluitingRegel = typeof jaarAfsluitingRegelsTable.$inferSelect;
export type InsertZiekmelding = z.infer<typeof insertZiekmeldingenSchema>;
export type Ziekmelding = typeof ziekmeldingenTable.$inferSelect;
export type PoortwachterDossier = typeof poortwachterDossiersTable.$inferSelect;
export type PoortwachterMijlpaal = typeof poortwachterMijlpalenTable.$inferSelect;
export type MedewerkerDocument = typeof medewerkerDocumentenTable.$inferSelect;
export const insertMedewerkerAanstellingSchema = createInsertSchema(medewerkerAanstellingenTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertMedewerkerAanstelling = z.infer<typeof insertMedewerkerAanstellingSchema>;
export type MedewerkerAanstelling = typeof medewerkerAanstellingenTable.$inferSelect;
export const insertMedewerkerCaoKeuzeSchema = createInsertSchema(medewerkerCaoKeuzesTable).omit({ id: true, aangemaaktOp: true, bijgewerktOp: true });
export type InsertMedewerkerCaoKeuze = z.infer<typeof insertMedewerkerCaoKeuzeSchema>;
export type MedewerkerCaoKeuze = typeof medewerkerCaoKeuzesTable.$inferSelect;

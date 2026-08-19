import { pgTable, serial, integer, text, boolean, timestamp, jsonb, index, uniqueIndex, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// GEBRUIKERS_01 v2 — afwijkingstabel per gebruiker/module.
// Baseline komt van functie→profiel; afwijkingen overrulen de baseline
// per module. Bewuste afwijkingen worden beschermd tegen stil profiel-toepassen.
// Append-only semantiek via de API: DELETE niet toegestaan zonder reden+actor.

export const gebruikersTable = pgTable("gebruikers", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  initialen: text("initialen"), // NOTITIE_01: zelf in te stellen; leeg = afgeleid uit naam
  email: text("email").notNull().unique(),
  rol: text("rol").notNull().default("gebruiker"),
  telefoon: text("telefoon"),
  bedrijf: text("bedrijf"),
  wachtwoord: text("wachtwoord"),
  totpSecret: text("totp_secret"),
  tweeFactorIngeschakeld: boolean("twee_factor_ingeschakeld").notNull().default(false),
  // Vrijstelling van verplichte 2FA — uitsluitend voor het smoketest-
  // serviceaccount (deploy.yml). Alleen te zetten via het beheerscript
  // lib/db/scripts/smoketest-account.mjs, nooit via UI of API.
  tweeFactorVrijgesteld: boolean("twee_factor_vrijgesteld").notNull().default(false),
  actief: boolean("actief").notNull().default(true),
  gearchiveerd: boolean("gearchiveerd").notNull().default(false),
  isHoofdtester: boolean("is_hoofdtester").notNull().default(false),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  laatstOnline: timestamp("laatst_online"),
  avatarUrl: text("avatar_url"),
  bedrijfslogoUrl: text("bedrijfslogo_url"),
  bedrijfskleuren: text("bedrijfskleuren"),
  uitnodigingStatus: text("uitnodiging_status").notNull().default("niet_uitgenodigd"),
  uitnodigingVerstuurdOp: timestamp("uitnodiging_verstuurd_op"),
  uitnodigingToken: text("uitnodiging_token").unique(),
  uitnodigingVerlooptOp: timestamp("uitnodiging_verloopt_op"),
  uitnodigingGeopendOp: timestamp("uitnodiging_geopend_op"),
  uitnodigingOpnieuwVerstuurdOp: timestamp("uitnodiging_opnieuw_verstuurd_op"),
  uitnodigingGeaccepteerdOp: timestamp("uitnodiging_geaccepteerd_op"),
  taal: text("taal").notNull().default("nl"),
  functietitels: text("functietitels").array().notNull().default([]),
  // Bevoegdheden-matrix: module-id -> niveau (0-4). Bron van toegang voor de
  // basisrol "gebruiker". Zie @workspace/permissies voor het model.
  bevoegdheden: jsonb("bevoegdheden").$type<Record<string, number>>().notNull().default({}),
  // Herkomst: het profiel (preset) dat als startpunt voor de bevoegdheden is
  // toegepast. Alleen administratieve koppeling; latere handmatige wijzigingen
  // aan de bevoegdheden veranderen dit veld niet. Wordt NULL bij verwijderen
  // van het profiel.
  herkomstProfielId: integer("herkomst_profiel_id").references(
    (): any => profielenTable.id,
    { onDelete: "set null" },
  ),
  // Geeft aan of de herkomst-koppeling automatisch is afgeleid (de bevoegdheden
  // kwamen exact en als enige overeen met dit profiel) in plaats van expliciet
  // door een beheerder gekozen. Een beheerder kan een automatische koppeling
  // bevestigen (zet dit op false) of verwijderen.
  herkomstAutomatisch: boolean("herkomst_automatisch").notNull().default(false),
  // Type dienstverband voor extern ingeleend personeel (zzp, uitzend, intern).
  dienstverband: text("dienstverband").notNull().default("intern"),
  // Naam-cache van het uitzendbureau/onderaannemersbedrijf. Bron van waarheid
  // is uitzendbureauId; de tekst blijft staan voor weergave en oude data en
  // wordt pas in een latere opdracht verwijderd (FACTUUR_01 §3).
  bedrijfUitzendbureau: text("bedrijf_uitzendbureau"),
  // Verwijzing naar de organisatie in crm_klanten (type uitzendbureau/inlener).
  // Bewust géén .references(): crm.ts importeert gebruikers.ts, een verwijzing
  // hier zou een importcyclus geven. De FK-constraint staat in
  // lib/db/sql/uitzendbureau-koppeling.sql.
  uitzendbureauId: integer("uitzendbureau_id"),
  // AVG: geanonimiseerd via een inzageverzoek-afhandelingsflow.
  geanonimiseerd: text("geanonimiseerd"),
  // Beheer wachtwoorden (alleen hoofdbeheerder): token-epoch voor het
  // intrekken van mobiele bearer-tokens. Wordt opgehoogd bij wachtwoord-reset
  // of "sessies beëindigen"; oudere tokens (embedden hun eigen tv) worden dan
  // afgewezen in requireAuth zonder extra DB-round-trip.
  tokenVersie: integer("token_versie").notNull().default(0),
  // Geforceerde wachtwoordwijziging: gezet bij een tijdelijk wachtwoord
  // (admin-reset), gewist zodra de gebruiker zelf een nieuw wachtwoord kiest.
  moetWachtwoordWijzigen: boolean("moet_wachtwoord_wijzigen").notNull().default(false),
  // Account-lockout na herhaalde mislukte inlogpogingen (wachtwoord of TOTP).
  misluktePogingen: integer("mislukte_pogingen").notNull().default(0),
  vergrendeldTot: timestamp("vergrendeld_tot"),
  // AVG: moment waarop het account inactief is gezet (actief: true -> false).
  // Wordt gewist zodra het account weer actief wordt. Gebruikt door de
  // automatische opschoonjob om na 2 jaar inactiviteit te anonimiseren.
  gedeactiveerdOp: timestamp("gedeactiveerd_op"),
});

// Standaardprofielen (presets) die de bevoegdheden-matrix als startpunt vullen.
// systeem=true zijn de meegeleverde profielen; die blijven bestaan na een seed.
export const profielenTable = pgTable("profielen", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull().unique(),
  bevoegdheden: jsonb("bevoegdheden").$type<Record<string, number>>().notNull().default({}),
  systeem: boolean("systeem").notNull().default(false),
  groep: text("groep"),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
});

// Koppeltabel gebruiker <-> profiel (P2: meerdere rollen per gebruiker).
// Een gebruiker kan 0..n profielen ("rollen") hebben; de effectieve
// bevoegdheden zijn per module het hoogste niveau over alle gekoppelde
// profielen (zie combineerBevoegdheden in @workspace/permissies).
// Increment 1: alleen de tabel — nog niet in gebruik door runtime-code.
//
// UNIQUE-constraint: staat nu wél in het Drizzle-schema (uniqueIndex) zodat
// drizzle-kit push de constraint als "aanwezig, geen actie nodig" beschouwt
// Drizzle genereert voor uniqueIndex(...) een CREATE UNIQUE INDEX (zichtbaar in
// pg_indexes). apply-additive.mjs draait vóór én na drizzle-kit push
// (Dockerfile.migrate) om dezelfde index idempotent aan te leggen, zodat push
// hem als bestaand herkent en niet dropt. schema-healthcheck.mjs verifieert
// de aanwezigheid via pg_indexes na afloop van de migrate-run.
export const gebruikerProfielenTable = pgTable(
  "gebruiker_profielen",
  {
    id: serial("id").primaryKey(),
    gebruikerId: integer("gebruiker_id")
      .notNull()
      .references(() => gebruikersTable.id, { onDelete: "cascade" }),
    profielId: integer("profiel_id")
      .notNull()
      .references(() => profielenTable.id, { onDelete: "cascade" }),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  },
  (t) => [
    index("gp_gebruiker_idx").on(t.gebruikerId),
    index("gp_profiel_idx").on(t.profielId),
    uniqueIndex("gebruiker_profielen_gebruiker_id_profiel_id_unique").on(t.gebruikerId, t.profielId),
  ],
);

// Tokens voor het resetten van een vergeten wachtwoord. Eenmalig gebruik,
// verlopen na 1 uur. De token is een willekeurige hex-string (32 bytes).
export const wachtwoordResetTokensTable = pgTable(
  "wachtwoord_reset_tokens",
  {
    id: serial("id").primaryKey(),
    gebruikerId: integer("gebruiker_id")
      .notNull()
      .references(() => gebruikersTable.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    verlooptOp: timestamp("verloopt_op").notNull(),
    gebruiktOp: timestamp("gebruikt_op"),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  },
  (t) => [index("wrt_token_idx").on(t.token)],
);

// Beveiligingsvelden expliciet uitgesloten: dit schema mag nooit als
// mass-assignment-ingang dienen voor 2FA-status/-vrijstelling, TOTP-secret
// of vergrendel-/tokenstate. Die velden worden uitsluitend door dedicated
// flows (2FA-setup, beheerscripts, lockout-logica) geschreven.
// GEBRUIKERS_01 aanvulling (aug 2026): externe adviseur / dienstverlener
// (bv. externe boekhouder, HRM-adviseur). Levert een dienst aan het bedrijf:
// wél een account met functie en rechten, GEEN medewerkerprofiel, aanstelling,
// contract, verlofopbouw of contractbewaking. De toegang_tot-datum wordt bij
// het inloggen fail-closed gecontroleerd (auth.ts).
export const externeAdviseursTable = pgTable("externe_adviseurs", {
  id: serial("id").primaryKey(),
  gebruikerId: integer("gebruiker_id")
    .notNull()
    .unique()
    .references(() => gebruikersTable.id, { onDelete: "cascade" }),
  bedrijf: text("bedrijf").notNull(),
  contactpersoon: text("contactpersoon"),
  ingeschakeldVoor: text("ingeschakeld_voor").notNull(),
  functietitel: text("functietitel"),
  toegangTot: date("toegang_tot").notNull(),
  aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  bijgewerktOp: timestamp("bijgewerkt_op").notNull().defaultNow(),
});
export type ExterneAdviseur = typeof externeAdviseursTable.$inferSelect;

// ── GEBRUIKERS_01 v2: Per-gebruiker/per-module afwijkingstabel ────────────────
// Overrulet de functie-profiel baseline per module. Append-only log staat apart.
export const gebruikerBevoegdheidAfwijkingenTable = pgTable(
  "gebruiker_bevoegdheid_afwijkingen",
  {
    id: serial("id").primaryKey(),
    gebruikerId: integer("gebruiker_id")
      .notNull()
      .references(() => gebruikersTable.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull(),
    niveau: integer("niveau").notNull(),
    reden: text("reden").notNull(),
    actorId: integer("actor_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
    actorNaam: text("actor_naam"),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gba_gebruiker_module_unique").on(t.gebruikerId, t.moduleId),
    index("gba_gebruiker_idx").on(t.gebruikerId),
    index("gba_module_idx").on(t.moduleId),
  ],
);

// ── GEBRUIKERS_01 v2: Append-only audit-log bevoegdheidswijzigingen ───────────
// Elke afwijking, functie-toepassing of reset wordt hier vastgelegd.
// Nooit updaten of verwijderen — append-only.
export const bevoegdheidAuditLogTable = pgTable(
  "bevoegdheid_audit_log",
  {
    id: serial("id").primaryKey(),
    gebruikerId: integer("gebruiker_id")
      .notNull()
      .references(() => gebruikersTable.id, { onDelete: "cascade" }),
    moduleId: text("module_id"),
    oudNiveau: integer("oud_niveau"),
    nieuwNiveau: integer("nieuw_niveau"),
    /** actie: afwijking_gezet | afwijking_verwijderd | functie_toegepast | reset */
    actie: text("actie").notNull(),
    reden: text("reden"),
    actorId: integer("actor_id").references(() => gebruikersTable.id, { onDelete: "set null" }),
    actorNaam: text("actor_naam"),
    tijdstip: timestamp("tijdstip").notNull().defaultNow(),
  },
  (t) => [
    index("bal_gebruiker_idx").on(t.gebruikerId),
    index("bal_tijdstip_idx").on(t.tijdstip),
  ],
);

export type GebruikerBevoegdheidAfwijking = typeof gebruikerBevoegdheidAfwijkingenTable.$inferSelect;
export type BevoegdheidAuditLog = typeof bevoegdheidAuditLogTable.$inferSelect;

// ── GEBRUIKERS_01 v2: Pre-migratie snapshot (additief, rollback-analyse) ──────
// Volledige JSON-snapshot van functies + medewerker/aanstellingverwijzingen
// vóór alle mutaties in migratie 0101. Nooit updaten of verwijderen.
export const gebruikers01V2SnapshotTable = pgTable(
  "gebruikers01_v2_snapshot",
  {
    id: serial("id").primaryKey(),
    objectType: text("object_type").notNull(),
    objectId: integer("object_id").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    vastgelegdOp: timestamp("vastgelegd_op").notNull().defaultNow(),
  },
  (t) => [
    index("g01v2snap_type_idx").on(t.objectType),
  ],
);
export type Gebruikers01V2Snapshot = typeof gebruikers01V2SnapshotTable.$inferSelect;

export const insertGebruikerSchema = createInsertSchema(gebruikersTable).omit({
  id: true,
  aangemaaktOp: true,
  tweeFactorVrijgesteld: true,
  tweeFactorIngeschakeld: true,
  totpSecret: true,
});
export type InsertGebruiker = z.infer<typeof insertGebruikerSchema>;
export type Gebruiker = typeof gebruikersTable.$inferSelect;
export type Profiel = typeof profielenTable.$inferSelect;
export type GebruikerProfiel = typeof gebruikerProfielenTable.$inferSelect;

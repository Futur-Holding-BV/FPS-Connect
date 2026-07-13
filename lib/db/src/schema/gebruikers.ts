import { pgTable, serial, integer, text, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gebruikersTable = pgTable("gebruikers", {
  id: serial("id").primaryKey(),
  naam: text("naam").notNull(),
  email: text("email").notNull().unique(),
  rol: text("rol").notNull().default("gebruiker"),
  telefoon: text("telefoon"),
  bedrijf: text("bedrijf"),
  wachtwoord: text("wachtwoord"),
  totpSecret: text("totp_secret"),
  tweeFactorIngeschakeld: boolean("twee_factor_ingeschakeld").notNull().default(false),
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
  bedrijfUitzendbureau: text("bedrijf_uitzendbureau"),
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

export const insertGebruikerSchema = createInsertSchema(gebruikersTable).omit({ id: true, aangemaaktOp: true });
export type InsertGebruiker = z.infer<typeof insertGebruikerSchema>;
export type Gebruiker = typeof gebruikersTable.$inferSelect;
export type Profiel = typeof profielenTable.$inferSelect;
export type GebruikerProfiel = typeof gebruikerProfielenTable.$inferSelect;

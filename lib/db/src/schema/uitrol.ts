import { bigint, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { gebruikersTable } from "./gebruikers";

// UITROL_BEWAKING_01 — terugmeldingen van de deploy-workflow (GitHub Actions).
// Na élke uitrol (geslaagd of mislukt) meldt de workflow hier welke commit er
// uitgerold had moeten zijn. De bewakingsloop vergelijkt dat met de commit die
// daadwerkelijk draait (GIT_COMMIT) en opent/sluit automatisch een actiepunt
// in de werkbak van de hoofdbeheerder.
export const uitrolRapportenTable = pgTable("uitrol_rapporten", {
  id: serial("id").primaryKey(),
  commitSha: text("commit_sha").notNull(),          // volledige 40-teken SHA van de run
  conclusie: text("conclusie").notNull(),           // success | failure
  // GitHub Actions run-id: monotoon oplopend, dus dé ordening om "de laatste
  // uitrol" deterministisch te kiezen — ook als een oude melding vertraagd
  // binnenkomt. Re-runs delen een run_id; dan wint de nieuwste rij (id).
  runId: bigint("run_id", { mode: "number" }),
  falendeStap: text("falende_stap"),                // bij failure: de stapnaam uit de workflow
  runUrl: text("run_url"),                          // link naar de Actions-run
  gemeldOp: timestamp("gemeld_op").notNull().defaultNow(),
});

// CI_SIGNAAL_01 — terugmeldingen van de CI-workflow (Typecheck & build) op main.
// Wordt de bouwcontrole op main rood, dan mag dat niet onopgemerkt blijven tot
// iemand toevallig in GitHub kijkt: de workflow meldt na élke main-run zijn
// conclusie, de bewakingsloop opent/sluit een actiepunt bij de hoofdbeheerder.
// Bijvangst: de nieuwste gemelde main-commit is ook dé referentie om te zien
// of productie achterloopt op main (versie-badge).
export const ciRapportenTable = pgTable("ci_rapporten", {
  id: serial("id").primaryKey(),
  commitSha: text("commit_sha").notNull(),          // volledige 40-teken SHA van de main-push
  conclusie: text("conclusie").notNull(),           // success | failure
  runId: bigint("run_id", { mode: "number" }),      // GitHub run-id: monotone ordening (zie uitrol_rapporten)
  runAttempt: bigint("run_attempt", { mode: "number" }), // re-runs delen een run_id; de hoogste poging wint
  gefaaldeTaak: text("gefaalde_taak"),              // bij failure: jobnaam + falende stap
  runUrl: text("run_url"),                          // link naar de Actions-run
  aanhoudendRoodMailOp: timestamp("aanhoudend_rood_mail_op"),
  aanhoudendRoodMailClaimOp: timestamp("aanhoudend_rood_mail_claim_op"),
  gemeldOp: timestamp("gemeld_op").notNull().defaultNow(),
});

export const ciRoodMailVerzendingenTable = pgTable(
  "ci_rood_mail_verzendingen",
  {
    id: serial("id").primaryKey(),
    ciRapportId: integer("ci_rapport_id").notNull().references(() => ciRapportenTable.id, { onDelete: "cascade" }),
    periode: integer("periode").notNull(),
    gebruikerId: integer("gebruiker_id").notNull().references(() => gebruikersTable.id),
    ontvangerEmail: text("ontvanger_email").notNull(),
    ontvangerNaam: text("ontvanger_naam"),
    status: text("status").notNull().default("wachtend"),
    claimOp: timestamp("claim_op"),
    pogingen: integer("pogingen").notNull().default(0),
    laatsteFout: text("laatste_fout"),
    verzondenOp: timestamp("verzonden_op"),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ci_rood_mail_periode_ontvanger_uniek").on(
      t.ciRapportId,
      t.periode,
      t.gebruikerId,
    ),
  ],
);

// CI_POORT_HERSTEL_01 — controleerbare, append-only historie van de bestaande
// workflow_dispatch-omweg. Gewone push-uitrollen schrijven hier nooit.
export const noodfixUitrolGebruikTable = pgTable(
  "noodfix_uitrol_gebruik",
  {
    id: serial("id").primaryKey(),
    commitSha: text("commit_sha").notNull(),
    actor: text("actor").notNull(),
    reden: text("reden").notNull(),
    runUrl: text("run_url").notNull(),
    runId: bigint("run_id", { mode: "number" }).notNull(),
    runAttempt: bigint("run_attempt", { mode: "number" }).notNull(),
    bypassSoort: text("bypass_soort").notNull().default("ci_en_predeploy"),
    aangemaaktOp: timestamp("aangemaakt_op").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noodfix_uitrol_run_poging_uniek").on(t.runId, t.runAttempt),
  ],
);

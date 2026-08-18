import { bigint, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

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
  gemeldOp: timestamp("gemeld_op").notNull().defaultNow(),
});

/**
 * GEBRUIKERS_01 v2 — dry-run van de HERSTELPROCEDURE (migratie 0101).
 *
 * Doel: bewijzen dat de inverse-herstelprocedure uit de snapshot-tabel
 * (`gebruikers01_v2_snapshot`) technisch uitvoerbaar is, ZONDER de database
 * blijvend te wijzigen. Alle herstel-statements draaien binnen één transactie
 * die ALTIJD wordt teruggedraaid (ROLLBACK), ook bij succes.
 *
 * Wat wordt hersteld (inverse van 0101):
 *   1. bestaande functies volledig terug uit snapshot voor de door 0101
 *      gewijzigde velden (globalisering, actief en profiel_id).
 *   2. uitsluitend door 0101 aangemaakte functies inactief maken.
 *   3. medewerkers.functie_id terug uit snapshot (medewerker_functie_ref).
 *   4. medewerker_aanstellingen.functie_id terug uit snapshot
 *      (aanstelling_functie_ref).
 *
 * Wat NIET wordt hersteld (bewust, want additief en veilig te laten staan):
 *   - de afwijkingstabel, audit-log en snapshot-tabel zelf (die mogen blijven);
 *   De volledige, definitieve procedure staat in
 *   docs/metingen/GEBRUIKERS_01-herstelprocedure.md.
 *
 * Deze dry-run:
 *   - opent één transactie op een dedicated client;
 *   - voert alle UPDATE-statements uit;
 *   - telt de geraakte rijen en vergelijkt met de snapshot-aantallen;
 *   - draait ALTIJD terug (ROLLBACK), zowel bij succes als bij fout;
 *   - verifieert daarna dat de live-data ongewijzigd is.
 *
 * Draaien: pnpm --filter @workspace/scripts run herstel-gebruikers01-v2-dryrun
 * Vereist: migratie 0101 is al uitgevoerd (snapshot-tabel gevuld).
 */
import "./lib/prodGuard";
import { pool } from "@workspace/db";

let geslaagd = 0;
let gefaald = 0;

function check(naam: string, conditie: boolean, detail?: string): void {
  if (conditie) {
    geslaagd++;
    console.log(`  \u2713 ${naam}`);
  } else {
    gefaald++;
    console.error(`  \u2717 ${naam}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  console.log("=== GEBRUIKERS_01 v2 HERSTEL dry-run (altijd ROLLBACK) ===\n");

  const client = await pool.connect();
  let transactieActief = false;
  try {
    // Voorwaarde: snapshot-tabel bestaat en is gevuld.
    const snapBestaat = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name='gebruikers01_v2_snapshot'`,
    );
    if (snapBestaat.rowCount === 0) {
      console.error(
        "Snapshot-tabel gebruikers01_v2_snapshot ontbreekt. Migratie 0101 lijkt niet uitgevoerd. Afbreken.",
      );
      process.exit(1);
    }

    // Snapshot-aantallen per type (verwachte hersteltellingen).
    const snapTellingen = await client.query<{ object_type: string; n: string }>(
      `SELECT object_type, COUNT(*)::text AS n
       FROM gebruikers01_v2_snapshot
       GROUP BY object_type`,
    );
    const verwacht = new Map<string, number>();
    for (const r of snapTellingen.rows) verwacht.set(r.object_type, Number(r.n));
    console.log("Snapshot-aantallen:", Object.fromEntries(verwacht), "\n");

    console.log("── Herstel binnen transactie (wordt teruggedraaid) ──");
    await client.query("BEGIN");
    transactieActief = true;

    // 1. Bestaande functies: werkgever_id, werkmaatschappij, actief én
    // profiel_id terug uit snapshot.
    const herstelFuncties = await client.query(
      `UPDATE functies f
       SET werkgever_id     = (s.snapshot ->> 'werkgever_id')::integer,
           werkmaatschappij = COALESCE(s.snapshot ->> 'werkmaatschappij', ''),
           actief           = (s.snapshot ->> 'actief')::boolean,
            profiel_id       = (s.snapshot ->> 'profiel_id')::integer,
           bijgewerkt_op    = NOW()
       FROM gebruikers01_v2_snapshot s
       WHERE s.object_type = 'functie'
         AND s.object_id   = f.id`,
    );
    check(
      "Functies hersteld uit snapshot",
      herstelFuncties.rowCount === (verwacht.get("functie") ?? -1),
      `hersteld=${herstelFuncties.rowCount}, verwacht=${verwacht.get("functie")}`,
    );

    // 2. Alleen de door migratie 0101 werkelijk ingevoegde functies inactiveren.
    const deactiveerNieuweFuncties = await client.query(
      `UPDATE functies f
       SET actief = false,
           bijgewerkt_op = NOW()
       FROM gebruikers01_v2_snapshot s
       WHERE s.object_type = 'nieuwe_functie'
         AND s.object_id   = f.id`,
    );
    check(
      "Door 0101 aangemaakte functies zouden inactief worden",
      deactiveerNieuweFuncties.rowCount === (verwacht.get("nieuwe_functie") ?? 0),
      `inactief=${deactiveerNieuweFuncties.rowCount}, verwacht=${verwacht.get("nieuwe_functie") ?? 0}`,
    );

    // 3. medewerkers.functie_id terug uit snapshot.
    const herstelMedewerkers = await client.query(
      `UPDATE medewerkers m
       SET functie_id = (s.snapshot ->> 'functie_id')::integer
       FROM gebruikers01_v2_snapshot s
       WHERE s.object_type = 'medewerker_functie_ref'
         AND s.object_id   = m.id`,
    );
    check(
      "medewerkers.functie_id hersteld uit snapshot",
      herstelMedewerkers.rowCount === (verwacht.get("medewerker_functie_ref") ?? 0),
      `hersteld=${herstelMedewerkers.rowCount}, verwacht=${verwacht.get("medewerker_functie_ref")}`,
    );

    // 4. medewerker_aanstellingen.functie_id terug uit snapshot.
    const herstelAanstellingen = await client.query(
      `UPDATE medewerker_aanstellingen ma
       SET functie_id = (s.snapshot ->> 'functie_id')::integer
       FROM gebruikers01_v2_snapshot s
       WHERE s.object_type = 'aanstelling_functie_ref'
         AND s.object_id   = ma.id`,
    );
    check(
      "medewerker_aanstellingen.functie_id hersteld uit snapshot",
      herstelAanstellingen.rowCount === (verwacht.get("aanstelling_functie_ref") ?? 0),
      `hersteld=${herstelAanstellingen.rowCount}, verwacht=${verwacht.get("aanstelling_functie_ref")}`,
    );

    // Binnen de transactie: bewijs dat functie 8/9 weer actief ZOUDEN zijn.
    const actief89 = await client.query<{ id: number; actief: boolean }>(
      `SELECT f.id, f.actief
       FROM functies f
       JOIN gebruikers01_v2_snapshot s
         ON s.object_type='functie' AND s.object_id=f.id
       WHERE f.id IN (8, 9)
         AND (s.snapshot ->> 'actief')::boolean = true`,
    );
    check(
      "Functies 8/9 zouden reactiveren indien snapshot ze actief had",
      actief89.rows.every((r) => r.actief === true),
      `binnen-transactie: ${JSON.stringify(actief89.rows)}`,
    );

    // ALTIJD terugdraaien — dit is een dry-run.
    await client.query("ROLLBACK");
    transactieActief = false;
    console.log("\n\u21B6 Transactie teruggedraaid (ROLLBACK) — geen blijvende wijziging.\n");

    // ── Verificatie: live-data ongewijzigd na rollback ────────────────────────
    console.log("── Verificatie: live-data ongewijzigd na rollback ──");
    // Na rollback moeten functies weer globaal zijn (werkmaatschappij='') en
    // functie 8/9 weer inactief, precies zoals de migratie ze achterliet.
    const naGlobaal = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM functies WHERE werkmaatschappij <> ''`,
    );
    check(
      "Live: alle functies nog globaal (werkmaatschappij leeg)",
      Number(naGlobaal.rows[0].n) === 0,
      `functies met werkmaatschappij: ${naGlobaal.rows[0].n}`,
    );

    const na89 = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM functies WHERE id IN (8,9) AND actief = true`,
    );
    check(
      "Live: functies 8/9 nog inactief na rollback",
      Number(na89.rows[0].n) === 0,
      `actieve van 8/9: ${na89.rows[0].n}`,
    );

    const naNieuweFuncties = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
       FROM functies f
       JOIN gebruikers01_v2_snapshot s
         ON s.object_type='nieuwe_functie' AND s.object_id=f.id
       WHERE f.actief = true`,
    );
    check(
      "Live: door 0101 aangemaakte functies nog actief na rollback",
      Number(naNieuweFuncties.rows[0].n) === (verwacht.get("nieuwe_functie") ?? 0),
      `actief=${naNieuweFuncties.rows[0].n}, verwacht=${verwacht.get("nieuwe_functie") ?? 0}`,
    );
  } catch (err) {
    // Bij welke fout dan ook: veilig terugdraaien.
    if (transactieActief) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* rollback op een dode verbinding negeren */
      }
    }
    console.error("Onverwachte fout tijdens dry-run:", err);
    gefaald++;
  } finally {
    client.release();
  }

  const totaal = geslaagd + gefaald;
  console.log(`\n════════════════════════════════`);
  console.log(`Resultaat: ${geslaagd}/${totaal} checks geslaagd`);
  if (gefaald > 0) {
    console.error(`GEFAALD: ${gefaald} check(s) mislukt — zie hierboven.`);
    process.exit(1);
  } else {
    console.log("Dry-run geslaagd ✓ — herstelprocedure is uitvoerbaar, niets gewijzigd.");
  }
  await pool.end();
}

main().catch((err) => {
  console.error("Onverwachte fout:", err);
  process.exit(1);
});

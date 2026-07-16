// Additieve schemaherstelstap — draait VOOR drizzle-kit push in de post-merge flow.
//
// Waarom: drizzle-kit push kan in een non-TTY omgeving (stdin gesloten) afbreken
// wanneer er nieuwe tabellen met FK-referenties of nieuwe kolommen zijn die het
// schema-diff triggeren. Door de ontbrekende tabellen en kolommen vooraf via
// idempotente SQL toe te voegen (CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN IF NOT EXISTS)
// is het drizzle-diff klein en veilig, en loopt push-force groen door zonder prompt.
//
// Veiligheidsprincipes:
// - Uitsluitend additief: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS.
// - Nooit DROP, TRUNCATE, ALTER TYPE of DELETE.
// - De 'session'-tabel (connect-pg-simple) wordt nimmer aangeraakt.
// - Idempotent: veilig om meerdere keren te draaien.

import pg from "pg";

const { Pool } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[apply-additive] DATABASE_URL ontbreekt; overslaan.");
  process.exit(0);
}

const pool = new Pool({ connectionString: url });

// Lijst van additieve SQL-statements, in volgorde van afhankelijkheid.
// Elk statement bevat een beschrijving voor logdoeleinden.
const stappen = [
  {
    beschrijving: "clusters tabel aanmaken (als die nog niet bestaat)",
    sql: `
      CREATE TABLE IF NOT EXISTS clusters (
        id            SERIAL PRIMARY KEY,
        gebouw_id     INTEGER NOT NULL REFERENCES gebouwen(id) ON DELETE CASCADE,
        verdieping_id INTEGER REFERENCES verdiepingen(id) ON DELETE SET NULL,
        naam          TEXT NOT NULL,
        type          TEXT,
        kleur         TEXT,
        aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT now(),
        bijgewerkt_op TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `,
  },
  {
    beschrijving: "fabrikanten.gearchiveerd toevoegen (als die kolom nog niet bestaat)",
    sql: `
      ALTER TABLE fabrikanten
        ADD COLUMN IF NOT EXISTS gearchiveerd BOOLEAN NOT NULL DEFAULT false;
    `,
  },
  {
    beschrijving: "labels.fabrikant_id toevoegen (als die kolom nog niet bestaat)",
    sql: `
      ALTER TABLE labels
        ADD COLUMN IF NOT EXISTS fabrikant_id INTEGER REFERENCES fabrikanten(id) ON DELETE SET NULL;
    `,
  },
  {
    beschrijving: "voorzieningen.cluster_id toevoegen (als die kolom nog niet bestaat)",
    sql: `
      ALTER TABLE voorzieningen
        ADD COLUMN IF NOT EXISTS cluster_id INTEGER;
    `,
  },
  {
    beschrijving: "medewerkers.contracturen_per_week toevoegen (als die kolom nog niet bestaat)",
    sql: `
      ALTER TABLE medewerkers
        ADD COLUMN IF NOT EXISTS contracturen_per_week REAL;
    `,
  },
  {
    beschrijving: "offertes.calculatie_id toevoegen (koppeling mod_calc_headers)",
    sql: `
      ALTER TABLE offertes
        ADD COLUMN IF NOT EXISTS calculatie_id INTEGER REFERENCES mod_calc_headers(id) ON DELETE SET NULL;
    `,
  },
  {
    beschrijving: "mod_calc_headers.opslag_abk toevoegen (ABK opslag V2.1)",
    sql: `
      ALTER TABLE mod_calc_headers
        ADD COLUMN IF NOT EXISTS opslag_abk REAL NOT NULL DEFAULT 10;
    `,
  },
  {
    beschrijving: "mod_calc_regels V2.1 velden toevoegen (MU, arbeid, onderaanneming, staartkosten, regelnummer)",
    sql: `
      ALTER TABLE mod_calc_regels ADD COLUMN IF NOT EXISTS regelnummer TEXT;
      ALTER TABLE mod_calc_regels ADD COLUMN IF NOT EXISTS mu_per_eenheid REAL NOT NULL DEFAULT 0;
      ALTER TABLE mod_calc_regels ADD COLUMN IF NOT EXISTS arbeids_tarief REAL NOT NULL DEFAULT 0;
      ALTER TABLE mod_calc_regels ADD COLUMN IF NOT EXISTS onderaanneming_bedrag REAL NOT NULL DEFAULT 0;
      ALTER TABLE mod_calc_regels ADD COLUMN IF NOT EXISTS is_staartkosten BOOLEAN NOT NULL DEFAULT false;
    `,
  },
  {
    beschrijving: "offerte_regels optioneel-werk kolommen toevoegen",
    sql: `
      ALTER TABLE offerte_regels ADD COLUMN IF NOT EXISTS is_optioneel BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE offerte_regels ADD COLUMN IF NOT EXISTS optioneel_geselecteerd BOOLEAN NOT NULL DEFAULT true;
    `,
  },
  {
    beschrijving: "voorraad_mutaties.opdracht_id toevoegen (koppeling uitgifte aan opdracht voor traceerbaarheid)",
    sql: `
      ALTER TABLE voorraad_mutaties
        ADD COLUMN IF NOT EXISTS opdracht_id INTEGER REFERENCES opdrachten(id) ON DELETE SET NULL;
    `,
  },
  {
    beschrijving: "opleverrapporten alle V1.4/V1.5-kolommen toevoegen (inclusief werkbon_id, reactietermijn, vervangings- en certificaatskolommen)",
    sql: `
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS werkbon_id INTEGER REFERENCES werkbonnen(id) ON DELETE SET NULL;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS reactietermijn_datum TIMESTAMPTZ;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS reactietermijn_gestart_op TIMESTAMPTZ;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS vervangen_door_rapport_id INTEGER;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS vervangen_op TIMESTAMPTZ;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS certificaat_geaccordeerd BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS certificaat_geaccordeerd_op TIMESTAMPTZ;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS certificaat_garantie_maanden INTEGER NOT NULL DEFAULT 12;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS reactietermijn_melding_verzond_op TIMESTAMPTZ;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS vervangen_door_id INTEGER;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS aangemaakt_door INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS klant_reactie_op TIMESTAMP;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS klant_reactie_type TEXT;
    `,
  },
  {
    beschrijving: "inbox_items AI-velden toevoegen (ai_geconsolideerd + ai_opslaglocatie)",
    sql: `
      ALTER TABLE inbox_items ADD COLUMN IF NOT EXISTS ai_geconsolideerd BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE inbox_items ADD COLUMN IF NOT EXISTS ai_opslaglocatie TEXT;
    `,
  },
  {
    beschrijving: "verlofaanvragen.bezetting_overschreden toevoegen (bezettingsdrempel-vlag)",
    sql: `
      ALTER TABLE verlofaanvragen ADD COLUMN IF NOT EXISTS bezetting_overschreden BOOLEAN NOT NULL DEFAULT false;
    `,
  },
  {
    beschrijving: "app_instellingen.moments_verjaardag_ingeschakeld toevoegen (verjaardagsnotificatie-vlag)",
    sql: `
      ALTER TABLE app_instellingen ADD COLUMN IF NOT EXISTS moments_verjaardag_ingeschakeld BOOLEAN NOT NULL DEFAULT true;
    `,
  },
  {
    beschrijving: "gebruiker_profielen koppeltabel aanmaken en indexen aanleggen (P2 meerdere rollen per gebruiker)",
    sql: `
      CREATE TABLE IF NOT EXISTS gebruiker_profielen (
        id            SERIAL PRIMARY KEY,
        gebruiker_id  INTEGER NOT NULL REFERENCES gebruikers(id) ON DELETE CASCADE,
        profiel_id    INTEGER NOT NULL REFERENCES profielen(id) ON DELETE CASCADE,
        aangemaakt_op TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS gp_gebruiker_idx ON gebruiker_profielen (gebruiker_id);
      CREATE INDEX IF NOT EXISTS gp_profiel_idx ON gebruiker_profielen (profiel_id);
    `,
  },
  {
    beschrijving: "document_classificatie_correcties tabel aanmaken (correctie-leerloop Document Intelligence)",
    sql: `
      CREATE TABLE IF NOT EXISTS document_classificatie_correcties (
        id                    SERIAL PRIMARY KEY,
        bestandshash          TEXT NOT NULL,
        originele_categorie   TEXT NOT NULL,
        gecorrigeerde_categorie TEXT NOT NULL,
        werkmaatschappij      TEXT NOT NULL,
        bewijs_signalen       JSONB,
        aangemaakt_op         TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS dcc_wm_datum_idx
        ON document_classificatie_correcties (werkmaatschappij, aangemaakt_op DESC);
    `,
  },
];

// Unieke-index-stappen die FATAAL falen (process.exit(1)) als ze mislukken.
// Drizzle-kit push genereert voor uniqueIndex(...) een CREATE UNIQUE INDEX —
// geen benoemde constraint in pg_constraint. apply-additive zorgt dat deze
// indexes ook vóór de eerste push bestaan (zodat push ze als bestaand herkent
// en niet dropt of wijzigt). Ná push loopt apply-additive opnieuw om eventuele
// drops te herstellen.
//
// Vóór aanleg wordt expliciet op dubbele rijen gecheckt; bij duplicaten stopt
// het script met exit 1 — nooit stil doorgaan met een schema zonder unieke index.
const uniekeIndexStappen = [
  {
    naam: "gebruiker_profielen_gebruiker_id_profiel_id_unique",
    tabel: "gebruiker_profielen",
    kolommen: ["gebruiker_id", "profiel_id"],
    beschrijving: "UNIQUE INDEX (gebruiker_id, profiel_id) op gebruiker_profielen",
  },
];

async function main() {
  // ── Reguliere additieve stappen (warning-level bij fout) ──────────────────
  let toegepast = 0;
  for (const stap of stappen) {
    try {
      await pool.query(stap.sql);
      console.log(`[apply-additive] OK: ${stap.beschrijving}`);
      toegepast++;
    } catch (err) {
      // Een fout hier mag de post-merge niet blokkeren: log en ga door.
      // Bij een echte blokkade zal drizzle-kit push daarna ook falen en de merge melden.
      console.error(`[apply-additive] Waarschuwing bij "${stap.beschrijving}": ${err.message}`);
    }
  }
  console.log(`[apply-additive] Klaar; ${toegepast}/${stappen.length} stappen uitgevoerd.`);

  // ── Unieke-index-stappen (fataal bij fout of bij aanwezige dubbele rijen) ──
  // Gecontroleerd via pg_indexes (niet pg_constraint): drizzle genereert
  // CREATE UNIQUE INDEX, dat registreert alleen in pg_indexes — niet in pg_constraint.
  // ADD CONSTRAINT zou een ANDERE naam aannemen én conflicteren met de
  // drizzle-index als die al bestaat; daarom gebruiken we CREATE UNIQUE INDEX.
  for (const idx of uniekeIndexStappen) {
    // 1. Index al aanwezig in pg_indexes? Dan niets te doen.
    const bestaatRes = await pool.query(
      "SELECT 1 FROM pg_indexes WHERE indexname = $1 AND tablename = $2",
      [idx.naam, idx.tabel],
    );
    if (bestaatRes.rowCount > 0) {
      console.log(`[apply-additive] OK (reeds aanwezig): ${idx.beschrijving}`);
      continue;
    }

    // 2. Controleer op dubbele rijen vóór we de index aanleggen.
    const kolommen = idx.kolommen.map((k) => `"${k}"`).join(", ");
    const dubbelsRes = await pool.query(
      `SELECT ${kolommen}, COUNT(*) AS aantal
         FROM "${idx.tabel}"
        GROUP BY ${kolommen}
       HAVING COUNT(*) > 1
        LIMIT 20`,
    );
    if (dubbelsRes.rowCount > 0) {
      console.error(
        `[apply-additive] FATALE FOUT: unieke index "${idx.naam}" kan niet worden aangelegd — ` +
        `er bestaan dubbele combinaties in "${idx.tabel}". ` +
        `Verwijder de duplicaten handmatig vóór de volgende deployment.`,
      );
      console.error("[apply-additive] Dubbele combinaties (max 20):");
      for (const rij of dubbelsRes.rows) {
        console.error("  ", JSON.stringify(rij));
      }
      await pool.end();
      process.exit(1);
    }

    // 3. Geen duplicaten — index aanleggen.
    try {
      await pool.query(
        `CREATE UNIQUE INDEX "${idx.naam}" ON "${idx.tabel}" (${kolommen})`,
      );
      console.log(`[apply-additive] OK (aangelegd): ${idx.beschrijving}`);
    } catch (err) {
      console.error(
        `[apply-additive] FATALE FOUT bij aanleggen unieke index "${idx.naam}": ${err.message}`,
      );
      await pool.end();
      process.exit(1);
    }
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[apply-additive] Onverwachte fout:", err.message);
    pool.end();
    process.exit(1);
  });

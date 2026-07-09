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
];

async function main() {
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
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[apply-additive] Onverwachte fout:", err.message);
    return pool.end();
  });

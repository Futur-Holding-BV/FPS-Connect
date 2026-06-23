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

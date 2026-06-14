// Reconcile Postgres' standaard '<tabel>_<kolom>_key' unique-constraintnamen naar
// de door Drizzle verwachte '<tabel>_<kolom>_unique'-conventie.
//
// Waarom: drizzle-kit push vergelijkt het schema (verwacht '_unique') met de database
// (Postgres maakt voor inline UNIQUE-kolommen '_key'-namen aan). Bij een naam-mismatch
// wil push de constraint droppen + opnieuw toevoegen en vraagt het defensief "truncate?".
// In een merge (non-TTY) is stdin gesloten, dus die prompt breekt de HELE push af en er
// wordt niets toegepast. Door vooraf te hernoemen verdwijnt de mismatch en loopt push groen.
//
// Puur metadata-hernoemen: niet-destructief, raakt geen rijen, kan geen data verliezen.
// De 'session'-tabel (connect-pg-simple) wordt overgeslagen, net als in drizzle.config.ts.

import pg from "pg";

const { Pool } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[reconcile-unique] DATABASE_URL ontbreekt; overslaan.");
  process.exit(0);
}

const pool = new Pool({ connectionString: url });

const FIND_KEY_CONSTRAINTS = `
  SELECT c.conname AS oldname,
         cl.relname AS tablename,
         (SELECT array_agg(a.attname ORDER BY x.ord)
            FROM unnest(c.conkey) WITH ORDINALITY AS x(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = x.attnum) AS cols
  FROM pg_constraint c
  JOIN pg_class cl ON cl.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE c.contype = 'u'
    AND n.nspname = 'public'
    AND c.conname LIKE '%\\_key'
    AND cl.relname <> 'session';
`;

function quoteIdent(id) {
  return '"' + String(id).replace(/"/g, '""') + '"';
}

async function main() {
  const { rows } = await pool.query(FIND_KEY_CONSTRAINTS);
  if (rows.length === 0) {
    console.log("[reconcile-unique] Geen '_key' unique-constraints gevonden; niets te doen.");
    return;
  }
  let renamed = 0;
  for (const r of rows) {
    const cols = r.cols || [];
    if (cols.length === 0) continue;
    const newname = `${r.tablename}_${cols.join("_")}_unique`;
    if (newname === r.oldname) continue;
    // Idempotent: sla over als de doelnaam al op deze tabel bestaat.
    const exists = await pool.query(
      `SELECT 1 FROM pg_constraint WHERE conname = $1 AND conrelid = $2::regclass`,
      [newname, quoteIdent(r.tablename)],
    );
    if (exists.rowCount > 0) continue;
    await pool.query(
      `ALTER TABLE ${quoteIdent(r.tablename)} RENAME CONSTRAINT ${quoteIdent(r.oldname)} TO ${quoteIdent(newname)}`,
    );
    console.log(`[reconcile-unique] ${r.tablename}: ${r.oldname} -> ${newname}`);
    renamed++;
  }
  console.log(`[reconcile-unique] Klaar; ${renamed} constraint(s) hernoemd.`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    // Best-effort voorstap: een fout hier mag de post-merge niet blokkeren; push volgt nog.
    console.error("[reconcile-unique] Waarschuwing, overgeslagen:", err.message);
    return pool.end();
  });

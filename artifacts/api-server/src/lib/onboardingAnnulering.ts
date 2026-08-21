import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

type QueryExecutor = Pick<typeof db, "execute">;
export type OnboardingHoofdtabel = "gebruikers" | "medewerkers";

interface ForeignKeyVerwijzing extends Record<string, unknown> {
  child_schema: string;
  child_table: string;
  child_column: string;
}

const TOEGESTANE_ONBOARDING_AFHANKELIJKHEDEN: Record<
  OnboardingHoofdtabel,
  ReadonlySet<string>
> = {
  gebruikers: new Set([
    "medewerkers",
    "wachtwoord_reset_tokens",
  ]),
  medewerkers: new Set([
    "hrm_ai_voorstellen",
    "medewerker_documenten",
  ]),
};

export function isToegestaneOnboardingAfhankelijkheid(
  hoofdtabel: OnboardingHoofdtabel,
  afhankelijkeTabel: string,
): boolean {
  return TOEGESTANE_ONBOARDING_AFHANKELIJKHEDEN[hoofdtabel].has(
    afhankelijkeTabel,
  );
}

function quoteIdentifier(waarde: string): string {
  return `"${waarde.replaceAll('"', '""')}"`;
}

export async function vindBlokkerendeOnboardingAfhankelijkheden(
  uitvoerder: QueryExecutor,
  hoofdtabel: OnboardingHoofdtabel,
  id: number,
): Promise<string[]> {
  const relaties = await uitvoerder.execute<ForeignKeyVerwijzing>(sql`
    SELECT
      child_namespace.nspname AS child_schema,
      child_table.relname AS child_table,
      child_column.attname AS child_column
    FROM pg_constraint constraint_row
    JOIN pg_class parent_table
      ON parent_table.oid = constraint_row.confrelid
    JOIN pg_namespace parent_namespace
      ON parent_namespace.oid = parent_table.relnamespace
    JOIN pg_class child_table
      ON child_table.oid = constraint_row.conrelid
    JOIN pg_namespace child_namespace
      ON child_namespace.oid = child_table.relnamespace
    JOIN LATERAL unnest(
      constraint_row.conkey,
      constraint_row.confkey
    ) WITH ORDINALITY AS keys(child_attnum, parent_attnum, positie)
      ON true
    JOIN pg_attribute child_column
      ON child_column.attrelid = constraint_row.conrelid
      AND child_column.attnum = keys.child_attnum
    JOIN pg_attribute parent_column
      ON parent_column.attrelid = constraint_row.confrelid
      AND parent_column.attnum = keys.parent_attnum
    WHERE constraint_row.contype = 'f'
      AND parent_namespace.nspname = 'public'
      AND parent_table.relname = ${hoofdtabel}
      AND parent_column.attname = 'id'
  `);

  const teControlerenRelaties = relaties.rows.filter(
    (relatie) =>
      !isToegestaneOnboardingAfhankelijkheid(
        hoofdtabel,
        relatie.child_table,
      ),
  );
  if (teControlerenRelaties.length === 0) return [];

  const controles = teControlerenRelaties.map((relatie) => {
    const tabel = `${quoteIdentifier(relatie.child_schema)}.${quoteIdentifier(relatie.child_table)}`;
    const kolom = quoteIdentifier(relatie.child_column);
    return sql`
      SELECT ${`${relatie.child_table}.${relatie.child_column}`} AS afhankelijkheid
      WHERE EXISTS (
        SELECT 1
        FROM ${sql.raw(tabel)}
        WHERE ${sql.raw(kolom)} = ${id}
      )
    `;
  });
  const resultaat = await uitvoerder.execute<{ afhankelijkheid: string }>(
    sql.join(controles, sql` UNION ALL `),
  );
  const blokkerend = resultaat.rows.map((rij) => rij.afhankelijkheid);
  if (blokkerend.some((waarde) => typeof waarde !== "string")) {
    throw new Error(
      "Afhankelijkhedencontrole gaf een onverwacht databaseantwoord",
    );
  }

  return [...new Set(blokkerend)].sort();
}
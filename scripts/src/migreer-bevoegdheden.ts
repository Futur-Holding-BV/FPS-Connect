// Migratie: bestaande accounts met legacy rollen (beheerder/monteur/controleur)
// omzetten naar de nieuwe bevoegdheden-matrix.
//
// T016 zette de standaardrol op "gebruiker" en bande "viewer" uit, maar
// bestaande accounts droegen nog de legacy rollen. Die werkten via de
// legacy-fallback in @workspace/permissies, maar verschenen niet in de
// "Gebruikers (matrix)"-kolom. Dit script trekt ze gelijk.
//
// Aanpak (idempotent):
//   - Selecteer alle accounts met rol in (beheerder, monteur, controleur).
//   - Bestaat er al een ingevulde matrix (door een beheerder via de UI gezet),
//     dan blijft die ONGEWIJZIGD bewaard; alleen accounts met een lege matrix
//     krijgen de matrix uit bevoegdhedenVoorLegacyRol().
//   - Zet rol op "gebruiker" zodat de toegang voortaan puur uit de matrix komt.
// Na de migratie heeft geen enkel account nog een legacy rol, dus opnieuw
// draaien is een no-op.
//
// Draaien: pnpm --filter @workspace/scripts run migreer-bevoegdheden
import { db, gebruikersTable, pool } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { bevoegdhedenVoorLegacyRol } from "@workspace/permissies";

const LEGACY_ROLLEN = ["beheerder", "monteur", "controleur"];

function heeftMatrix(b: Record<string, number> | null | undefined): boolean {
  return !!b && Object.keys(b).length > 0;
}

async function main() {
  const accounts = await db
    .select({
      id: gebruikersTable.id,
      naam: gebruikersTable.naam,
      rol: gebruikersTable.rol,
      bevoegdheden: gebruikersTable.bevoegdheden,
    })
    .from(gebruikersTable)
    .where(inArray(gebruikersTable.rol, LEGACY_ROLLEN));

  if (accounts.length === 0) {
    console.log("Niets te migreren: geen accounts met legacy rollen gevonden.");
    process.exit(0);
  }

  let omgezet = 0;
  let matrixGevuld = 0;
  let matrixBehouden = 0;

  for (const a of accounts) {
    const bestaande = a.bevoegdheden as Record<string, number> | null;
    let nieuweBevoegdheden: Record<string, number>;
    if (heeftMatrix(bestaande)) {
      nieuweBevoegdheden = bestaande!;
      matrixBehouden++;
    } else {
      nieuweBevoegdheden = bevoegdhedenVoorLegacyRol(a.rol);
      matrixGevuld++;
    }

    await db
      .update(gebruikersTable)
      .set({ rol: "gebruiker", bevoegdheden: nieuweBevoegdheden })
      .where(eq(gebruikersTable.id, a.id));

    omgezet++;
    const herkomst = heeftMatrix(bestaande) ? "bestaande matrix behouden" : `matrix uit legacy "${a.rol}"`;
    console.log(`  #${a.id} ${a.naam} (${a.rol} -> gebruiker) — ${herkomst}`);
  }

  console.log(
    `Migratie klaar: ${omgezet} account(s) omgezet naar rol "gebruiker" ` +
      `(${matrixGevuld} matrix gevuld, ${matrixBehouden} bestaande matrix behouden).`,
  );
  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool.end();
  } catch {
    // negeren
  }
  process.exit(1);
});

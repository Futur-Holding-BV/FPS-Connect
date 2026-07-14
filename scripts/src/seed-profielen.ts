// Seed van de standaard rechten-profielen (presets) die de bevoegdheden-matrix
// als startpunt vullen. Bron van waarheid: PRESETS uit @workspace/permissies.
//
// INSERT-ONLY en idempotent: ontbrekende systeem-presets worden aangemaakt,
// BESTAANDE presets worden NOOIT overschreven. Zo blijven handmatige
// aanpassingen door een hoofdbeheerder (via de UI) behouden. Wil je bestaande
// systeem-presets bijwerken naar de laatste definitie, gebruik dan bewust de
// knop "Standaardrollen synchroniseren" (POST /profielen/synchroniseer-standaard).
//
// Draaien: pnpm --filter @workspace/scripts run seed-profielen
import { db, profielenTable } from "@workspace/db";
import { PRESETS } from "@workspace/permissies";

async function main() {
  // ALLE profielnamen verzamelen (niet alleen systeem=true). profielen.naam is
  // UNIQUE: als er al een handmatig (niet-systeem) profiel met een preset-naam
  // bestaat, zou een insert een unique-violation geven en (via set -e) de hele
  // post-merge deploy afbreken. Door op naam over te slaan is de seed veilig.
  const bestaand = await db
    .select({ naam: profielenTable.naam })
    .from(profielenTable);
  const bestaandeNamen = new Set(bestaand.map((p) => p.naam));

  let aangemaakt = 0;
  let overgeslagen = 0;
  for (const preset of PRESETS) {
    if (bestaandeNamen.has(preset.naam)) {
      overgeslagen++;
      continue;
    }
    await db.insert(profielenTable).values({
      naam: preset.naam,
      bevoegdheden: preset.bevoegdheden,
      systeem: true,
    });
    aangemaakt++;
  }

  console.log(
    `Seed klaar: ${aangemaakt} profielen aangemaakt, ${overgeslagen} overgeslagen (reeds aanwezig).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

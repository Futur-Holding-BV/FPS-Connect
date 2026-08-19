// Bewijst dat een eerder open boekvelden-signaal na een geslaagde automatische
// boeking wordt afgehandeld, precies één leesbare tijdlijnregel toevoegt en bij
// een tweede trigger niets meer wijzigt.
//
// Aanroepen:
// VERIFICATIE_TOEGESTAAN=1 pnpm --filter @workspace/api-server exec tsx \
//   src/scripts/verificatie-automatische-boekvelden-afhandeling.ts

import { createRequire } from "node:module";
import {
  db,
  facturenTable,
  factuurSignalenTable,
  factuurTijdlijnTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

if (process.env.NODE_ENV === "production") {
  throw new Error("PRODUCTIEGUARD: dit verificatiescript mag niet op productie draaien.");
}
if (process.env.VERIFICATIE_TOEGESTAAN !== "1") {
  throw new Error("PRODUCTIEGUARD: stel VERIFICATIE_TOEGESTAAN=1 in voor deze dev-verificatie.");
}

// accountviewExportService importeert transitief opslagcode die CJS-require
// verwacht wanneer het script rechtstreeks via tsx draait.
(globalThis as { require?: NodeJS.Require }).require = createRequire(import.meta.url);

const { sluitOntbrekendeBoekgegevensSignaal } = await import("../services/accountviewExportService");

const MARKER = `VERIF-BOEKVELDEN-${Date.now()}`;
const TIJDLIJNTEKST = "Boekvelden waren eerder onvolledig — alsnog automatisch geboekt na aanvulling.";
let factuurId: number | null = null;

function eis(voorwaarde: unknown, melding: string): asserts voorwaarde {
  if (!voorwaarde) throw new Error(`VERIFICATIE MISLUKT: ${melding}`);
  console.log(`✓ ${melding}`);
}

async function main(): Promise<void> {
  try {
    const [factuur] = await db.insert(facturenTable).values({
      type: "inkoop",
      status: "verwerkt",
      factuurnummer: MARKER,
      relatienaam: "Verificatie boekvelden B.V.",
    }).returning({ id: facturenTable.id });
    factuurId = factuur!.id;

    await db.insert(factuurSignalenTable).values({
      type: "ontbrekende_boekgegevens",
      factuurId,
      omschrijving: `${MARKER}: verplichte boekvelden ontbreken.`,
    });

    await sluitOntbrekendeBoekgegevensSignaal(factuurId);

    const [signaal] = await db.select().from(factuurSignalenTable).where(and(
      eq(factuurSignalenTable.factuurId, factuurId),
      eq(factuurSignalenTable.type, "ontbrekende_boekgegevens"),
    ));
    eis(signaal?.status === "afgehandeld", "open boekvelden-signaal is automatisch afgehandeld");
    eis(signaal?.afgehandeldOp instanceof Date, "automatische afhandeling heeft een datum");

    const naEersteAfhandeling = await db.select().from(factuurTijdlijnTable).where(and(
      eq(factuurTijdlijnTable.factuurId, factuurId),
      eq(factuurTijdlijnTable.tekst, TIJDLIJNTEKST),
    ));
    eis(naEersteAfhandeling.length === 1, "tijdlijn bevat de verplichte herstelregel");

    await sluitOntbrekendeBoekgegevensSignaal(factuurId);

    const naTweedeAfhandeling = await db.select().from(factuurTijdlijnTable).where(and(
      eq(factuurTijdlijnTable.factuurId, factuurId),
      eq(factuurTijdlijnTable.tekst, TIJDLIJNTEKST),
    ));
    eis(naTweedeAfhandeling.length === 1, "tweede afsluitpoging is idempotent");

    console.log("ALLE CONTROLES GESLAAGD — boekvelden-signaal sluit automatisch na succesvolle boeking.");
  } finally {
    if (factuurId !== null) {
      await db.delete(facturenTable).where(eq(facturenTable.id, factuurId));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

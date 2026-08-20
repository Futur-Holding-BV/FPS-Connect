// LOON_02A — Runner voor loonfundament-bewijs modules.
//
// Maakt geïsoleerde testwerkgever/medewerker/aanstelling aan, roept bewijs-
// modules aan, en ruimt altijd op via de LIFO-stapel in harnas.ts.
//
// Aanroepen:
//   pnpm --filter @workspace/api-server exec tsx src/scripts/verificatie-loonfundament.ts

import { createRequire } from "node:module";
import { eq } from "drizzle-orm";
import {
  db, werkgeversTable, medewerkersTable, medewerkerAanstellingenTable,
} from "@workspace/db";

// CJS-shim voor transitieve imports (o.a. objectStorage.ts, xlsx)
(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url);

import {
  aantalGeslaagd, aantalMislukt, check, eis, registreerOpruimen, opruimen,
} from "./loonfundament-bewijs/harnas";
import {
  controleerCaoCatalogus, controleerMigratiebevinding, haalCaoOnbekendId, MARK,
} from "./loonfundament-bewijs/cao-migratie";
import {
  controleerAanstellingIkvInvariant,
  controleerInkomstenverhoudingen,
  controleerLoonafspraken,
} from "./loonfundament-bewijs/ikv-afspraken";
import { controleerImporterPuureFuncties } from "./loonfundament-bewijs/importer-puur";
import { controleerGereedheid, controleerTijdvakMaxima } from "./loonfundament-bewijs/gereedheid-tijdvak";
import { controleerLoonfundamentIdentiteit } from "./loonfundament-bewijs/autorisatie";

async function main(): Promise<void> {
  console.log(`\n${"═".repeat(62)}`);
  console.log("LOON_02A Verificatiescript — loonfundament");
  console.log(`${"═".repeat(62)}`);

  const caoOnbekendId = await haalCaoOnbekendId();
  const ts = Date.now();

  // Geïsoleerde testwerkgever
  const [wg] = await db
    .insert(werkgeversTable)
    .values({ naam: `${MARK}-WG-${ts}`, cao: `${MARK}-onbekend` })
    .returning();
  eis(!!wg, "testwerkgever aangemaakt");
  check("werkgevertrigger vult verplichte CAO fail-closed", wg!.caoId === caoOnbekendId);
  registreerOpruimen(() =>
    db.delete(werkgeversTable).where(eq(werkgeversTable.id, wg!.id)).then(() => {}),
  );
  const [wgAnders] = await db
    .insert(werkgeversTable)
    .values({ naam: `${MARK}-WG-ANDERS-${ts}`, cao: `${MARK}-onbekend` })
    .returning();
  eis(!!wgAnders, "tweede testwerkgever aangemaakt");
  registreerOpruimen(() =>
    db.delete(werkgeversTable).where(eq(werkgeversTable.id, wgAnders!.id)).then(() => {}),
  );

  // Geïsoleerde testmedewerker
  const [mw] = await db
    .insert(medewerkersTable)
    .values({ naam: `${MARK}-MW-${ts}`, email: `verif-${ts}@loonfundament.test` })
    .returning();
  eis(!!mw, "testmedewerker aangemaakt");
  registreerOpruimen(() =>
    db.delete(medewerkersTable).where(eq(medewerkersTable.id, mw!.id)).then(() => {}),
  );

  // Geïsoleerde testaanstelling
  const [aanstel] = await db
    .insert(medewerkerAanstellingenTable)
    .values({
      medewerkerId: mw!.id,
      werkgeverId: wg!.id,
      cao: `${MARK}-onbekend`,
      werkmaatschappij: `${MARK}-WM`,
    })
    .returning();
  eis(!!aanstel, "testaanstelling aangemaakt");
  check("aanstellingtrigger vult verplichte CAO fail-closed", aanstel!.caoId === caoOnbekendId);
  registreerOpruimen(() =>
    db.delete(medewerkerAanstellingenTable)
      .where(eq(medewerkerAanstellingenTable.id, aanstel!.id))
      .then(() => {}),
  );

  try {
    await controleerCaoCatalogus();
    await controleerMigratiebevinding(wg!.id);
    const { ikvId1 } = await controleerInkomstenverhoudingen(wg!.id, mw!.id, aanstel!.id);
    await controleerAanstellingIkvInvariant(aanstel!.id, wg!.id, wgAnders!.id);
    await controleerLoonafspraken(ikvId1);
    await controleerImporterPuureFuncties();
    await controleerGereedheid();
    await controleerTijdvakMaxima(ikvId1);
    await controleerLoonfundamentIdentiteit();
  } finally {
    console.log("\n── Opruimen ──");
    await opruimen();
    console.log("  Testdata verwijderd.");
  }

  console.log(`\n${"─".repeat(62)}`);
  console.log(`Resultaat: ${aantalGeslaagd} geslaagd, ${aantalMislukt} mislukt`);
  if (aantalMislukt > 0) {
    console.error("FAIL — niet alle controles geslaagd.");
    process.exit(1);
  } else {
    console.log("OK — alle LOON_02A controles geslaagd.");
    process.exit(0);
  }
}

void main();

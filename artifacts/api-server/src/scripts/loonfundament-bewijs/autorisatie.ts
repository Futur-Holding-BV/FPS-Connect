// LOON_02A — Echte databasecontrole van de niet-toekenbare identiteitspoort.

import { eq } from "drizzle-orm";
import { db, gebruikersTable, profielenTable } from "@workspace/db";
import { heeftLoonfundamentIdentiteit } from "../../middlewares/auth";
import { check, eis, registreerOpruimen } from "./harnas";
import { MARK } from "./cao-migratie";

export async function controleerLoonfundamentIdentiteit(): Promise<void> {
  console.log("\n── (8) Autorisatie-identiteit: alleen hoofdbeheerder / Externe boekhouder ──");

  const [externProfiel] = await db
    .select({ id: profielenTable.id })
    .from(profielenTable)
    .where(eq(profielenTable.naam, "Externe boekhouder"));
  eis(!!externProfiel, "systeemprofiel Externe boekhouder bestaat");

  const ts = Date.now();
  const [handmatigRecht] = await db
    .insert(gebruikersTable)
    .values({
      naam: `${MARK}-HANDMATIG-${ts}`,
      email: `handmatig-${ts}@loonfundament.test`,
      rol: "gebruiker",
      bevoegdheden: { loonfundament: 4 },
    })
    .returning();
  eis(!!handmatigRecht, "testgebruiker met alleen handmatig recht aangemaakt");
  registreerOpruimen(() =>
    db.delete(gebruikersTable).where(eq(gebruikersTable.id, handmatigRecht!.id)).then(() => {}),
  );

  const [externeBoekhouder] = await db
    .insert(gebruikersTable)
    .values({
      naam: `${MARK}-BOEKHOUDER-${ts}`,
      email: `boekhouder-${ts}@loonfundament.test`,
      rol: "gebruiker",
      herkomstProfielId: externProfiel!.id,
      bevoegdheden: { loonfundament: 4 },
    })
    .returning();
  eis(!!externeBoekhouder, "testgebruiker met Externe boekhouder-profiel aangemaakt");
  registreerOpruimen(() =>
    db.delete(gebruikersTable).where(eq(gebruikersTable.id, externeBoekhouder!.id)).then(() => {}),
  );

  const [hoofdbeheerder] = await db
    .insert(gebruikersTable)
    .values({
      naam: `${MARK}-HOOFDBEHEERDER-${ts}`,
      email: `hoofdbeheerder-${ts}@loonfundament.test`,
      rol: "hoofdbeheerder",
      bevoegdheden: {},
    })
    .returning();
  eis(!!hoofdbeheerder, "tijdelijke hoofdbeheerder aangemaakt");
  registreerOpruimen(() =>
    db.delete(gebruikersTable).where(eq(gebruikersTable.id, hoofdbeheerder!.id)).then(() => {}),
  );

  check(
    "handmatig loonfundament:4 zonder profiel blijft geweigerd",
    !(await heeftLoonfundamentIdentiteit(handmatigRecht!.id)),
  );
  check(
    "Externe boekhouder-profiel wordt toegelaten",
    await heeftLoonfundamentIdentiteit(externeBoekhouder!.id),
  );
  check(
    "hoofdbeheerder wordt toegelaten",
    await heeftLoonfundamentIdentiteit(hoofdbeheerder!.id),
  );
}
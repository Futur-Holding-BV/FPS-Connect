// Centrale medewerker/gebruiker-lookup helpers.
//
// Alle plekken die "welke medewerker hoort bij deze gebruiker?" of
// "wie is de leidinggevende van deze medewerker?" moeten opzoeken, gaan via
// deze module — niet via losse inline queries per route-bestand. Zo blijft er
// één plek om aan te passen wanneer er ooit een aparte Persoon-laag komt
// (los van het systeemaccount `gebruikers` en het HRM-record `medewerkers`).
// Er wordt nu bewust GEEN nieuwe tabel toegevoegd — alleen de toegangslaag
// wordt geïsoleerd.
import { db as defaultDb, medewerkersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type Db = typeof defaultDb;
type Medewerker = typeof medewerkersTable.$inferSelect;

/** Medewerker-id die bij dit gebruikersaccount hoort, of null als er geen koppeling is. */
export async function medewerkerIdVoorGebruiker(
  gebruikerId: number | null | undefined,
  db: Db = defaultDb,
): Promise<number | null> {
  if (!gebruikerId) return null;
  const [m] = await db
    .select({ id: medewerkersTable.id })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, gebruikerId))
    .limit(1);
  return m?.id ?? null;
}

/** Volledige medewerkersrij die bij dit gebruikersaccount hoort, of null. */
export async function medewerkerVoorGebruiker(
  gebruikerId: number | null | undefined,
  db: Db = defaultDb,
): Promise<Medewerker | null> {
  if (!gebruikerId) return null;
  const [m] = await db
    .select()
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, gebruikerId))
    .limit(1);
  return m ?? null;
}

/** Medewerkersrij op basis van medewerker-id, of null. */
export async function medewerkerVoorId(
  medewerkerId: number | null | undefined,
  db: Db = defaultDb,
): Promise<Medewerker | null> {
  if (medewerkerId == null) return null;
  const [m] = await db
    .select()
    .from(medewerkersTable)
    .where(eq(medewerkersTable.id, medewerkerId))
    .limit(1);
  return m ?? null;
}

/** Leidinggevende (medewerkersrij) van een medewerker, of null als niet gekoppeld. */
export async function leidinggevendeVoorMedewerker(
  medewerkerId: number | null | undefined,
  db: Db = defaultDb,
): Promise<Medewerker | null> {
  const medewerker = await medewerkerVoorId(medewerkerId, db);
  if (!medewerker?.leidinggevendeId) return null;
  return medewerkerVoorId(medewerker.leidinggevendeId, db);
}

/** True als het gebruikersaccount `gebruikerId` de leidinggevende is van `medewerkerId`. */
export async function isLeidinggevendeVan(
  gebruikerId: number | null | undefined,
  medewerkerId: number | null | undefined,
  db: Db = defaultDb,
): Promise<boolean> {
  if (!gebruikerId || medewerkerId == null) return false;
  const leidinggevende = await leidinggevendeVoorMedewerker(medewerkerId, db);
  return leidinggevende?.gebruikerId === gebruikerId;
}

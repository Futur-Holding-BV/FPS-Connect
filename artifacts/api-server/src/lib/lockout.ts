import { db, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Account-lockout na herhaalde mislukte inlogpogingen (wachtwoord of TOTP).
// Standaardwaarden — nog niet expliciet afgestemd met de gebruiker; bewust
// behoudend gekozen en eenvoudig aan te passen als dit later moet wijzigen.
export const MAX_MISLUKTE_POGINGEN = 5;
export const VERGRENDEL_MINUTEN = 15;

export function isVergrendeld(vergrendeldTot: Date | null): boolean {
  return !!vergrendeldTot && vergrendeldTot.getTime() > Date.now();
}

/**
 * Registreert een mislukte inlogpoging (verkeerd wachtwoord of TOTP-code).
 * Vergrendelt het account zodra de drempel bereikt is.
 */
export async function verwerkMislukteInlogpoging(
  gebruikerId: number,
  huidigeTeller: number,
): Promise<void> {
  const nieuweTeller = huidigeTeller + 1;
  const updates: { misluktePogingen: number; vergrendeldTot?: Date } = {
    misluktePogingen: nieuweTeller,
  };
  if (nieuweTeller >= MAX_MISLUKTE_POGINGEN) {
    updates.vergrendeldTot = new Date(Date.now() + VERGRENDEL_MINUTEN * 60 * 1000);
  }
  await db.update(gebruikersTable).set(updates).where(eq(gebruikersTable.id, gebruikerId));
}

/** Zet de teller terug na een volledig succesvolle login. */
export async function resetMislukteInlogpogingen(gebruikerId: number): Promise<void> {
  await db
    .update(gebruikersTable)
    .set({ misluktePogingen: 0, vergrendeldTot: null })
    .where(eq(gebruikersTable.id, gebruikerId));
}

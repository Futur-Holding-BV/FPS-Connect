import { eq } from "drizzle-orm";
import {
  db,
  activiteitenTable,
  gebouwenTable,
  gebruikersTable,
} from "@workspace/db";

type ActiviteitInvoer = {
  type: string;
  omschrijving: string;
  gebouwId?: number | null;
  voorzieningId?: number | null;
  voorzieningNummer?: string | null;
  gebruikerId?: number | null;
  offerteId?: number | null;
};

/**
 * Schrijft een activiteitregel weg en vult daarbij automatisch de afgeleide
 * tekstvelden `gebouwNaam` en `gebruikerNaam` aan. Deze velden zijn nodig voor
 * de "Live meekijken"-kaart (filtert op gebouwnaam) en de "Recent actief"-lijst
 * (toont gebruikersnamen). Zonder deze aanvulling blijven die weergaven leeg.
 */
export async function logActiviteit(invoer: ActiviteitInvoer): Promise<void> {
  const gebouwId = invoer.gebouwId ?? null;
  const gebruikerId = invoer.gebruikerId ?? null;

  let gebouwNaam: string | null = null;
  if (gebouwId != null) {
    const [g] = await db
      .select({ naam: gebouwenTable.naam })
      .from(gebouwenTable)
      .where(eq(gebouwenTable.id, gebouwId));
    gebouwNaam = g?.naam ?? null;
  }

  let gebruikerNaam: string | null = null;
  if (gebruikerId != null) {
    const [u] = await db
      .select({ naam: gebruikersTable.naam })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, gebruikerId));
    gebruikerNaam = u?.naam ?? null;
  }

  await db.insert(activiteitenTable).values({
    type: invoer.type,
    omschrijving: invoer.omschrijving,
    gebouwId,
    gebouwNaam,
    voorzieningId: invoer.voorzieningId ?? null,
    voorzieningNummer: invoer.voorzieningNummer ?? null,
    gebruikerId,
    gebruikerNaam,
    offerteId: invoer.offerteId ?? null,
  });
}

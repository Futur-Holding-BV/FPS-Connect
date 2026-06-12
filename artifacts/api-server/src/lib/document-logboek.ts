import { eq } from "drizzle-orm";
import {
  db,
  documentLogboekTable,
  documentenTable,
  gebruikersTable,
} from "@workspace/db";

type LogboekInvoer = {
  documentId?: number | null;
  documentNaam?: string | null;
  gebruikerId?: number | null;
  actie: string;
  detail?: string | null;
};

/**
 * Schrijft een regel naar het document-logboek (audittrail) en vult daarbij de
 * gedenormaliseerde velden `documentNaam` en `gebruikerNaam` aan, zodat de
 * globale audittrail leesbaar blijft ook nadat een document of gebruiker is
 * verwijderd. Wordt aangeroepen bij upload, revisie, koppeling, goedkeuring en
 * download — bewust NIET bij een gewone weergave.
 */
export async function logDocumentActie(invoer: LogboekInvoer): Promise<void> {
  const documentId = invoer.documentId ?? null;
  const gebruikerId = invoer.gebruikerId ?? null;

  let documentNaam = invoer.documentNaam ?? null;
  if (documentNaam == null && documentId != null) {
    const [d] = await db
      .select({ naam: documentenTable.naam })
      .from(documentenTable)
      .where(eq(documentenTable.id, documentId));
    documentNaam = d?.naam ?? null;
  }

  let gebruikerNaam: string | null = null;
  if (gebruikerId != null) {
    const [u] = await db
      .select({ naam: gebruikersTable.naam })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, gebruikerId));
    gebruikerNaam = u?.naam ?? null;
  }

  await db.insert(documentLogboekTable).values({
    documentId,
    documentNaam,
    gebruikerId,
    gebruikerNaam,
    actie: invoer.actie,
    detail: invoer.detail ?? null,
  });
}

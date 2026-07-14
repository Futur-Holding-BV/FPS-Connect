import {
  db,
  medewerkersTable,
  medewerkerAanstellingenTable,
  functiesTable,
  profielenTable,
} from "@workspace/db";
import { eq, inArray, and, isNotNull } from "drizzle-orm";
import type { Bevoegdheden } from "@workspace/permissies";

/**
 * Increment 4 — Haal alle bevoegdhedenmatrices op die voor een gebruiker
 * voortvloeien uit de aan hem/haar gekoppelde medewerker-functies.
 *
 * Bronnen (additief, max-per-module via combineerBevoegdheden door de aanroeper):
 *   1. medewerkersTable.functieId  — primaire functie
 *   2. medewerkerAanstellingenTable.functieId — alle nevenstellingen
 *
 * Geeft [] terug als er geen medewerker-koppeling is, of als geen enkele
 * functie een profielId heeft (null = geen automatisch toegangsprofiel).
 */
export async function haalFunctieBevoegdhedenVoorGebruiker(
  gebruikerId: number,
): Promise<Bevoegdheden[]> {
  const [medewerker] = await db
    .select({ id: medewerkersTable.id, functieId: medewerkersTable.functieId })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, gebruikerId));
  if (!medewerker) return [];

  const functieIdSet = new Set<number>();
  if (medewerker.functieId) functieIdSet.add(medewerker.functieId);

  const aanstellingen = await db
    .select({ functieId: medewerkerAanstellingenTable.functieId })
    .from(medewerkerAanstellingenTable)
    .where(
      and(
        eq(medewerkerAanstellingenTable.medewerkerId, medewerker.id),
        isNotNull(medewerkerAanstellingenTable.functieId),
      ),
    );
  for (const a of aanstellingen) {
    if (a.functieId) functieIdSet.add(a.functieId);
  }

  if (functieIdSet.size === 0) return [];

  const functies = await db
    .select({ profielId: functiesTable.profielId })
    .from(functiesTable)
    .where(
      and(
        inArray(functiesTable.id, [...functieIdSet]),
        isNotNull(functiesTable.profielId),
      ),
    );

  const profielIds = functies.map((f) => f.profielId!);
  if (profielIds.length === 0) return [];

  const profielen = await db
    .select({ bevoegdheden: profielenTable.bevoegdheden })
    .from(profielenTable)
    .where(inArray(profielenTable.id, profielIds));

  return profielen.map((p) => (p.bevoegdheden as Bevoegdheden) ?? {});
}

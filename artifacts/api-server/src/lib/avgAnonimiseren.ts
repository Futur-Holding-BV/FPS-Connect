import { db, gebruikersTable, medewerkersTable, avgInzageverzoekTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// ─── Gedeelde AVG-anonimiseringslogica ───────────────────────────────────────
// Gebruikt door zowel het handmatige beheerderspad (POST
// /avg/inzageverzoek/:id/anonimiseer) als de geautomatiseerde opschoonjob voor
// langdurig inactieve accounts (avgOpruiming.ts). Eén implementatie zodat
// beide paden identiek PII overschrijven.

/**
 * Overschrijft persoonsgegevens van een gebruiker (en gekoppeld
 * medewerkersdossier, indien aanwezig) met een pseudoniem, en markeert het
 * account als geanonimiseerd. Als verzoekId is meegegeven wordt het
 * bijbehorende AVG-verzoek ook als afgerond/geanonimiseerd gemarkeerd.
 */
export async function anonimiseerGebruiker(gebruikerId: number, verzoekId?: number): Promise<void> {
  const pseudoniem = `[geanonimiseerd-${gebruikerId}]`;
  const pseudoniemEmail = `anon-${gebruikerId}@verwijderd.fps`;
  const nu = new Date();
  const nuIso = nu.toISOString();

  await db.transaction(async (tx) => {
    await tx
      .update(gebruikersTable)
      .set({
        naam: pseudoniem,
        email: pseudoniemEmail,
        telefoon: null,
        bedrijf: null,
        avatarUrl: null,
        bedrijfslogoUrl: null,
        bedrijfskleuren: null,
        wachtwoord: null,
        totpSecret: null,
        tweeFactorIngeschakeld: false,
        actief: false,
        gedeactiveerdOp: nu,
        geanonimiseerd: nuIso,
      })
      .where(eq(gebruikersTable.id, gebruikerId));

    await tx
      .update(medewerkersTable)
      .set({
        naam: pseudoniem,
        email: null,
        telefoon: null,
        mobiel: null,
        bijgewerktOp: nu,
      })
      .where(eq(medewerkersTable.gebruikerId, gebruikerId));

    if (verzoekId !== undefined) {
      await tx
        .update(avgInzageverzoekTable)
        .set({
          status: "afgerond",
          geanonimiseerdOp: nu,
          afgerondOp: nu,
          bijgewerktOp: nu,
        })
        .where(eq(avgInzageverzoekTable.id, verzoekId));
    }
  });

  logger.info({ gebruikerId, verzoekId }, "AVG: gebruiker geanonimiseerd");
}

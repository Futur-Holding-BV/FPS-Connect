// WAGENPARK_01 §6.3 — gedeelde Traxgo-synchronisatie: handmatig via de route
// én dagelijks automatisch via de bewakingsloop. Eén implementatie, twee ingangen.
// gestartDoorId = null betekent: automatische draai (zichtbaar in de sync-log).

import { db } from "@workspace/db";
import {
  voertuigenTable,
  wagenparkRittenTable,
  wagenparkSyncLogTable,
  wagenparkAvgLogboekTable,
} from "@workspace/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { getFleetProvider } from "./fleet-provider/index.js";
import { logger } from "./logger";

function veiligeFout(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function voerWagenparkSyncUit(
  gestartDoorId: number | null,
  bestaandeLogId?: number,
): Promise<{
  logId: number;
  status: "voltooid" | "fout";
  aantalBijgewerkt: number;
  aantalFouten: number;
}> {
  const provider = getFleetProvider();

  let logRij: typeof wagenparkSyncLogTable.$inferSelect;
  if (bestaandeLogId !== undefined) {
    const [bestaand] = await db.select().from(wagenparkSyncLogTable)
      .where(eq(wagenparkSyncLogTable.id, bestaandeLogId));
    if (!bestaand) throw new Error(`Sync-log ${bestaandeLogId} niet gevonden`);
    logRij = bestaand;
  } else {
    const [nieuw] = await db.insert(wagenparkSyncLogTable).values({
      provider: provider.naam,
      status: "gestart",
      gestartDoorId,
    }).returning();
    logRij = nieuw;
  }

  let aantalBijgewerkt = 0;
  let aantalFouten = 0;
  const fouten: string[] = [];

  try {
    const voertuigen = await db
      .select()
      .from(voertuigenTable)
      .where(and(isNotNull(voertuigenTable.providerVoertuigId), eq(voertuigenTable.gearchiveerd, false)));

    for (const v of voertuigen) {
      if (!v.providerVoertuigId) continue;
      try {
        const data = await provider.haalVoertuigDataOp(v.providerVoertuigId);
        const gisteren = new Date(Date.now() - 86_400_000);
        const nu = new Date();
        const ritten = await provider.haalRittenOp(v.providerVoertuigId, gisteren, nu);

        await db.transaction(async (tx) => {
          if (data?.kmStand !== undefined) {
            await tx.update(voertuigenTable).set({
              kmStand: data.kmStand,
              kmStandDatum: data.kmStandDatum ?? new Date(),
              bijgewerktOp: new Date(),
            }).where(eq(voertuigenTable.id, v.id));
            aantalBijgewerkt++;
          }

          for (const rit of ritten) {
            // Dedupe race-vrij via de partiële unieke index op provider_rit_id
            // (migratie 0022) — parallelle syncs kunnen niet dubbel importeren.
            await tx.insert(wagenparkRittenTable).values({
              voertuigId: v.id,
              startDatum: rit.startDatum,
              eindDatum: rit.eindDatum,
              kmStart: rit.kmStart ?? null,
              kmEind: rit.kmEind ?? null,
              afstandKm: rit.afstandKm ?? null,
              vertrekAdres: rit.vertrekAdres ?? null,
              bestemmingAdres: rit.bestemmingAdres ?? null,
              providerRitId: rit.externalRitId,
              bron: provider.naam,
            });
          }
        });
      } catch (err) {
        aantalFouten++;
        fouten.push(`Voertuig ${v.kenteken}: ${veiligeFout(err).slice(0, 100)}`);
      }
    }

    await db.update(wagenparkSyncLogTable).set({
      status: "voltooid",
      aantalBijgewerkt,
      aantalFouten,
      foutmelding: fouten.length ? fouten.join("; ").slice(0, 500) : null,
      voltooIdOp: new Date(),
    }).where(eq(wagenparkSyncLogTable.id, logRij.id));

    await db.insert(wagenparkAvgLogboekTable).values({
      actie: "sync",
      voertuigId: null,
      gebruikerId: gestartDoorId,
      reden: gestartDoorId === null ? "Automatische dagelijkse Traxgo-synchronisatie" : "Traxgo synchronisatie uitgevoerd",
      datatype: "kilometerstand, ritten",
      bewaartermijn: "5 jaar (standaard wagenparkbeheer)",
    });

    return { logId: logRij.id, status: "voltooid", aantalBijgewerkt, aantalFouten };
  } catch (err) {
    logger.error({ err }, "wagenpark-sync mislukt");
    await db.update(wagenparkSyncLogTable).set({
      status: "fout",
      foutmelding: veiligeFout(err).slice(0, 500),
      voltooIdOp: new Date(),
    }).where(eq(wagenparkSyncLogTable.id, logRij.id));
    return { logId: logRij.id, status: "fout", aantalBijgewerkt, aantalFouten };
  }
}

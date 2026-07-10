import { db, activiteitenTable, gebruikersTable, avgOpschoonLogTable } from "@workspace/db";
import { lt, and, eq, isNotNull, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { anonimiseerGebruiker } from "./avgAnonimiseren";

// ─── Dagelijkse opruiming AVG: verlopen activiteitenlog + langdurig ──────────
// ─── inactieve accounts ───────────────────────────────────────────────────────

let _gepland = false;

/**
 * Verwijdert activiteiten-records ouder dan 365 dagen (configureerbaar via
 * AVG_ACTIVITEIT_BEWAARDAGEN) en anonimiseert accounts die langer dan 730
 * dagen (configureerbaar via AVG_ACCOUNT_BEWAARDAGEN) inactief zijn.
 * Plant zichzelf elke dag om 02:30. Veilig om meerdere keren aan te roepen —
 * plant slechts één timer.
 */
export function planDagelijkseAvgOpruiming(): void {
  if (_gepland) return;
  _gepland = true;

  const bewaardagenActiviteit = parseInt(process.env.AVG_ACTIVITEIT_BEWAARDAGEN ?? "365", 10) || 365;
  const bewaardagenAccount = parseInt(process.env.AVG_ACCOUNT_BEWAARDAGEN ?? "730", 10) || 730;

  function scheduleNext() {
    const nu = new Date();
    const volgende = new Date(nu);
    volgende.setHours(2, 30, 0, 0);
    if (volgende <= nu) volgende.setDate(volgende.getDate() + 1);
    const vertragingMs = volgende.getTime() - nu.getTime();
    const uren = Math.floor(vertragingMs / 3_600_000);
    const minuten = Math.floor((vertragingMs % 3_600_000) / 60_000);
    logger.info({ uren, minuten, bewaardagenActiviteit, bewaardagenAccount }, "Volgende AVG-opruiming gepland");

    setTimeout(async () => {
      let verwijderd = 0;
      let geanonimiseerd = 0;
      try {
        const grens = new Date();
        grens.setDate(grens.getDate() - bewaardagenActiviteit);
        const result = await db
          .delete(activiteitenTable)
          .where(lt(activiteitenTable.tijdstip, grens));
        verwijderd = (result as unknown as { rowCount?: number }).rowCount ?? 0;
        if (verwijderd > 0) {
          logger.info({ verwijderd, bewaardagenActiviteit }, "AVG: verlopen activiteiten-records verwijderd");
        }
      } catch (err) {
        logger.error({ err }, "AVG-opruiming activiteitenlog mislukt");
      }

      try {
        const accountGrens = new Date();
        accountGrens.setDate(accountGrens.getDate() - bewaardagenAccount);
        const teAnonimiseren = await db
          .select({ id: gebruikersTable.id })
          .from(gebruikersTable)
          .where(
            and(
              eq(gebruikersTable.actief, false),
              isNull(gebruikersTable.geanonimiseerd),
              isNotNull(gebruikersTable.gedeactiveerdOp),
              lt(gebruikersTable.gedeactiveerdOp, accountGrens),
            ),
          );
        for (const { id } of teAnonimiseren) {
          try {
            await anonimiseerGebruiker(id);
            geanonimiseerd++;
          } catch (err) {
            logger.error({ err, gebruikerId: id }, "AVG: automatische anonimisering van account mislukt");
          }
        }
        if (geanonimiseerd > 0) {
          logger.info({ geanonimiseerd, bewaardagenAccount }, "AVG: langdurig inactieve accounts geanonimiseerd");
        }
      } catch (err) {
        logger.error({ err }, "AVG-opruiming accountanonimisering mislukt");
      }

      try {
        await db.insert(avgOpschoonLogTable).values({
          activiteitenVerwijderd: verwijderd,
          accountsGeanonimiseerd: geanonimiseerd,
        });
      } catch (err) {
        logger.error({ err }, "AVG-opruiming: wegschrijven van logregel mislukt");
      }

      scheduleNext();
    }, vertragingMs).unref();
  }

  scheduleNext();
}

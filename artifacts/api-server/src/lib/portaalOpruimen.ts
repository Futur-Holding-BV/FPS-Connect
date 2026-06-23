import { db, offertePortaalTokensTable } from "@workspace/db";
import { lt } from "drizzle-orm";
import { logger } from "./logger";

// ─── Dagelijkse opruiming van verlopen portaaltokens ─────────────────────────

let _gepland = false;

/**
 * Verwijdert portaaltokens die meer dan 60 dagen geleden zijn verlopen.
 * Veilig om meerdere keren aan te roepen — plant slechts één timer.
 */
export function planDagelijksePortaalOpruiming(): void {
  if (_gepland) return;
  _gepland = true;

  function scheduleNext() {
    const now = new Date();
    const volgende = new Date(now);
    volgende.setHours(4, 0, 0, 0);
    if (volgende <= now) volgende.setDate(volgende.getDate() + 1);
    const vertragingMs = volgende.getTime() - now.getTime();
    const uren = Math.floor(vertragingMs / 3_600_000);
    const minuten = Math.floor((vertragingMs % 3_600_000) / 60_000);
    logger.info({ uren, minuten }, "Volgende portaal-opruiming gepland");

    setTimeout(async () => {
      try {
        const grens = new Date();
        grens.setDate(grens.getDate() - 60);
        const result = await db
          .delete(offertePortaalTokensTable)
          .where(lt(offertePortaalTokensTable.verlooptOp, grens));
        const verwijderd = (result as unknown as { rowCount?: number }).rowCount ?? 0;
        if (verwijderd > 0) {
          logger.info({ verwijderd }, "Verlopen portaaltokens verwijderd");
        }
      } catch (err) {
        logger.error({ err }, "Portaal-opruiming mislukt");
      }
      scheduleNext();
    }, vertragingMs).unref();
  }

  scheduleNext();
}

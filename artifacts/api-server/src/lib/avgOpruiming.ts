import { db, activiteitenTable } from "@workspace/db";
import { lt } from "drizzle-orm";
import { logger } from "./logger";

// ─── Dagelijkse opruiming AVG: verlopen activiteitenlog ──────────────────────

let _gepland = false;

/**
 * Verwijdert activiteiten-records ouder dan 365 dagen (configureerbaar via
 * AVG_ACTIVITEIT_BEWAARDAGEN). Plant zichzelf elke dag om 02:30.
 * Veilig om meerdere keren aan te roepen — plant slechts één timer.
 */
export function planDagelijkseAvgOpruiming(): void {
  if (_gepland) return;
  _gepland = true;

  const bewaardagen = parseInt(process.env.AVG_ACTIVITEIT_BEWAARDAGEN ?? "365", 10) || 365;

  function scheduleNext() {
    const nu = new Date();
    const volgende = new Date(nu);
    volgende.setHours(2, 30, 0, 0);
    if (volgende <= nu) volgende.setDate(volgende.getDate() + 1);
    const vertragingMs = volgende.getTime() - nu.getTime();
    const uren = Math.floor(vertragingMs / 3_600_000);
    const minuten = Math.floor((vertragingMs % 3_600_000) / 60_000);
    logger.info({ uren, minuten, bewaardagen }, "Volgende AVG-opruiming activiteitenlog gepland");

    setTimeout(async () => {
      try {
        const grens = new Date();
        grens.setDate(grens.getDate() - bewaardagen);
        const result = await db
          .delete(activiteitenTable)
          .where(lt(activiteitenTable.tijdstip, grens));
        const verwijderd = (result as unknown as { rowCount?: number }).rowCount ?? 0;
        if (verwijderd > 0) {
          logger.info({ verwijderd, bewaardagen }, "AVG: verlopen activiteiten-records verwijderd");
        }
      } catch (err) {
        logger.error({ err }, "AVG-opruiming activiteitenlog mislukt");
      }
      scheduleNext();
    }, vertragingMs).unref();
  }

  scheduleNext();
}

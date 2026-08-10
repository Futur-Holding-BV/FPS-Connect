import { db, activiteitenTable, gebruikersTable, avgOpschoonLogTable, wervingKandidatenTable } from "@workspace/db";
import { lt, and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { logger } from "./logger";
import { anonimiseerGebruiker } from "./avgAnonimiseren";
import { ObjectStorageService } from "./objectStorage";

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
/**
 * WERVING_01 §6: sollicitantengegevens mogen 4 weken na afronding van de
 * procedure bewaard worden, of 1 jaar met uitdrukkelijke toestemming.
 * Verwijdert de kandidaat-rij ÉN het cv-bestand (gespreksvragen cascaden mee).
 * Exported zodat de bewijsvoering dit direct kan aanroepen.
 */
export async function ruimVerlopenKandidatenOp(): Promise<number> {
  const bewaardagenKort = parseInt(process.env.AVG_KANDIDAAT_BEWAARDAGEN ?? "28", 10) || 28;
  const bewaardagenMetToestemming = parseInt(process.env.AVG_KANDIDAAT_BEWAARDAGEN_TOESTEMMING ?? "365", 10) || 365;

  const grensKort = new Date();
  grensKort.setDate(grensKort.getDate() - bewaardagenKort);
  const grensLang = new Date();
  grensLang.setDate(grensLang.getDate() - bewaardagenMetToestemming);

  const verlopen = await db
    .select({
      id: wervingKandidatenTable.id,
      cvObjectPath: wervingKandidatenTable.cvObjectPath,
    })
    .from(wervingKandidatenTable)
    .where(
      and(
        isNotNull(wervingKandidatenTable.procedureAfgerondOp),
        or(
          and(
            eq(wervingKandidatenTable.toestemmingBewaring, false),
            lt(wervingKandidatenTable.procedureAfgerondOp, grensKort),
          ),
          and(
            eq(wervingKandidatenTable.toestemmingBewaring, true),
            lt(wervingKandidatenTable.procedureAfgerondOp, grensLang),
          ),
        ),
      ),
    );

  if (verlopen.length === 0) return 0;
  const storage = new ObjectStorageService();
  let verwijderd = 0;
  for (const kandidaat of verlopen) {
    try {
      // Eerst het cv-bestand, dan de rij — verwijderen betekent ook het bestand.
      if (kandidaat.cvObjectPath) {
        await storage.deleteBestand(kandidaat.cvObjectPath);
      }
      await db.delete(wervingKandidatenTable).where(eq(wervingKandidatenTable.id, kandidaat.id));
      verwijderd++;
    } catch (err) {
      logger.error({ err, kandidaatId: kandidaat.id }, "AVG: verwijderen verlopen sollicitatiekandidaat mislukt");
    }
  }
  if (verwijderd > 0) {
    logger.info({ verwijderd, bewaardagenKort, bewaardagenMetToestemming }, "AVG: verlopen sollicitatiekandidaten verwijderd (incl. cv-bestand)");
  }
  return verwijderd;
}

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

      let kandidatenVerwijderd = 0;
      try {
        kandidatenVerwijderd = await ruimVerlopenKandidatenOp();
      } catch (err) {
        logger.error({ err }, "AVG-opruiming sollicitatiekandidaten mislukt");
      }

      try {
        await db.insert(avgOpschoonLogTable).values({
          activiteitenVerwijderd: verwijderd,
          accountsGeanonimiseerd: geanonimiseerd,
          kandidatenVerwijderd,
        });
      } catch (err) {
        logger.error({ err }, "AVG-opruiming: wegschrijven van logregel mislukt");
      }

      scheduleNext();
    }, vertragingMs).unref();
  }

  scheduleNext();
}

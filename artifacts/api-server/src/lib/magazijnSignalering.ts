// Dagelijkse minimumvoorraad-controle
// Detecteert artikelen onder minimumvoorraad en stuurt een e-mail naar alle
// gebruikers met magazijn:2+ bevoegdheid.
import { db, voorraadTable, artikelenTable, gebruikersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger";
import { stuurMagazijnSignalering } from "../services/email";

// ── Geaggregeerde voorraad per artikel ──────────────────────────────────────

async function haalKrtitiekeArtikelen(): Promise<
  Array<{ id: number; naam: string; eenheid: string; hoeveelheid: number; minimum_voorraad: number }>
> {
  const voorraad = await db
    .select({
      artikel_id: voorraadTable.artikelId,
      hoeveelheid: voorraadTable.hoeveelheid,
    })
    .from(voorraadTable);

  const artikelen = await db
    .select({
      id: artikelenTable.id,
      naam: artikelenTable.naam,
      eenheid: artikelenTable.eenheid,
      minimum_voorraad: sql<number | null>`${artikelenTable}.minimum_voorraad`,
    })
    .from(artikelenTable)
    .where(eq(artikelenTable.actief, true));

  const voorraadMap = new Map<number, number>();
  for (const v of voorraad) {
    voorraadMap.set(v.artikel_id, (voorraadMap.get(v.artikel_id) ?? 0) + (v.hoeveelheid ?? 0));
  }

  const kritiek: Array<{
    id: number;
    naam: string;
    eenheid: string;
    hoeveelheid: number;
    minimum_voorraad: number;
  }> = [];

  for (const artikel of artikelen) {
    const minVoorraad = (artikel as Record<string, unknown>).minimum_voorraad as number | null;
    if (minVoorraad == null) continue;
    const hoeveelheid = voorraadMap.get(artikel.id) ?? 0;
    if (hoeveelheid < minVoorraad) {
      kritiek.push({ id: artikel.id, naam: artikel.naam, eenheid: artikel.eenheid, hoeveelheid, minimum_voorraad: minVoorraad });
    }
  }

  return kritiek;
}

// ── Gebruikers met magazijn:2+ bevoegdheid ──────────────────────────────────

async function haalOntvangers(): Promise<Array<{ naam: string; email: string }>> {
  const gebruikers = await db
    .select({ naam: gebruikersTable.naam, email: gebruikersTable.email, bevoegdheden: gebruikersTable.bevoegdheden })
    .from(gebruikersTable)
    .where(and(eq(gebruikersTable.actief, true), eq(gebruikersTable.gearchiveerd, false)));

  return gebruikers.filter((g) => {
    const niveau = (g.bevoegdheden as Record<string, number> | null)?.["magazijn"] ?? 0;
    return niveau >= 2 && g.email;
  }) as Array<{ naam: string; email: string }>;
}

// ── Dagelijkse check ─────────────────────────────────────────────────────────

async function voerCheckUit(): Promise<void> {
  logger.info("Magazijn minimumvoorraad-check gestart");

  let kritiek: Awaited<ReturnType<typeof haalKrtitiekeArtikelen>>;
  try {
    kritiek = await haalKrtitiekeArtikelen();
  } catch (err) {
    logger.error({ err }, "Magazijn signalering: kritieke artikelen ophalen mislukt");
    return;
  }

  if (kritiek.length === 0) {
    logger.info("Magazijn signalering: geen artikelen onder minimumvoorraad");
    return;
  }

  logger.info({ aantal: kritiek.length }, "Magazijn signalering: kritieke artikelen gevonden");

  let ontvangers: Awaited<ReturnType<typeof haalOntvangers>>;
  try {
    ontvangers = await haalOntvangers();
  } catch (err) {
    logger.error({ err }, "Magazijn signalering: ontvangers ophalen mislukt");
    return;
  }

  if (ontvangers.length === 0) {
    logger.warn("Magazijn signalering: geen ontvangers met magazijn:2+ bevoegdheid");
    return;
  }

  for (const ontvanger of ontvangers) {
    try {
      await stuurMagazijnSignalering({ naarEmail: ontvanger.email, naarNaam: ontvanger.naam, kritiekeArtikelen: kritiek });
    } catch (err) {
      logger.error({ err, email: ontvanger.email }, "Magazijn signalering: verzenden mislukt");
    }
  }

  logger.info({ ontvangers: ontvangers.length, artikelen: kritiek.length }, "Magazijn signalering voltooid");
}

// ── Scheduler ────────────────────────────────────────────────────────────────

let _gepland = false;

/**
 * Plant de dagelijkse minimumvoorraad-controle op 07:00.
 * Veilig om meerdere keren aan te roepen — plant slechts één timer.
 */
export function planDagelijkseMagazijnSignalering(): void {
  if (_gepland) return;
  _gepland = true;

  function scheduleNext() {
    const now = new Date();
    const volgende = new Date(now);
    volgende.setHours(7, 0, 0, 0);
    if (volgende <= now) volgende.setDate(volgende.getDate() + 1);
    const vertragingMs = volgende.getTime() - now.getTime();
    const uren = Math.floor(vertragingMs / 3_600_000);
    const minuten = Math.floor((vertragingMs % 3_600_000) / 60_000);
    logger.info({ uren, minuten }, "Volgende magazijn signalering gepland");

    setTimeout(async () => {
      try {
        await voerCheckUit();
      } catch (err) {
        logger.error({ err }, "Magazijn signalering onverwacht mislukt");
      }
      scheduleNext();
    }, vertragingMs).unref();
  }

  scheduleNext();
}

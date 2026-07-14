// Dagelijkse minimumvoorraad-controle
// Detecteert artikelen onder minimumvoorraad (+ configureerbare marge) en stuurt
// een e-mail naar alle gebruikers met magazijn:2+ bevoegdheid. Tijdstip en marge
// zijn instelbaar via GET/PATCH /magazijn/instellingen (Beheer › Magazijn).
// Artikelen met een actieve snooze (GET/POST/DELETE /magazijn/artikelen/:id/snooze)
// worden overgeslagen zodat een al bekend tekort niet elke dag opnieuw mailt.
import { db, voorraadTable, artikelenTable, gebruikersTable, magazijnInstellingenTable, magazijnSnoozesTable } from "@workspace/db";
import { eq, and, sql, gt } from "drizzle-orm";
import { berekenEffectieveBevoegdhedenBatch } from "./effectieve-bevoegdheden";
import { logger } from "./logger";
import { stuurMagazijnSignalering } from "../services/email";

const STANDAARD_INSTELLINGEN = { signaleringUur: 7, signaleringMinuut: 0, signaleringMarge: 0 };

// ── Instellingen ─────────────────────────────────────────────────────────────

export async function haalMagazijnInstellingen(): Promise<{
  signaleringUur: number;
  signaleringMinuut: number;
  signaleringMarge: number;
}> {
  const [rij] = await db.select().from(magazijnInstellingenTable).where(eq(magazijnInstellingenTable.id, 1));
  if (!rij) return STANDAARD_INSTELLINGEN;
  return {
    signaleringUur: rij.signaleringUur,
    signaleringMinuut: rij.signaleringMinuut,
    signaleringMarge: rij.signaleringMarge,
  };
}

// ── Geaggregeerde voorraad per artikel ──────────────────────────────────────

async function haalKrtitiekeArtikelen(marge: number): Promise<
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

  const gesnoozedeIds = new Set(
    (
      await db
        .select({ artikelId: magazijnSnoozesTable.artikelId })
        .from(magazijnSnoozesTable)
        .where(gt(magazijnSnoozesTable.gesnoozedTot, new Date()))
    ).map((s) => s.artikelId)
  );

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
    if (gesnoozedeIds.has(artikel.id)) continue;
    const hoeveelheid = voorraadMap.get(artikel.id) ?? 0;
    if (hoeveelheid < minVoorraad + marge) {
      kritiek.push({ id: artikel.id, naam: artikel.naam, eenheid: artikel.eenheid, hoeveelheid, minimum_voorraad: minVoorraad });
    }
  }

  return kritiek;
}

// ── Gebruikers met magazijn:2+ bevoegdheid ──────────────────────────────────

async function haalOntvangers(): Promise<Array<{ naam: string; email: string }>> {
  const gebruikers = await db
    .select({
      id: gebruikersTable.id,
      naam: gebruikersTable.naam,
      email: gebruikersTable.email,
      rol: gebruikersTable.rol,
      bevoegdheden: gebruikersTable.bevoegdheden,
    })
    .from(gebruikersTable)
    .where(and(eq(gebruikersTable.actief, true), eq(gebruikersTable.gearchiveerd, false)));

  const effectief = await berekenEffectieveBevoegdhedenBatch(
    gebruikers.map((g) => ({ id: g.id, rol: g.rol, storedBevoegdheden: g.bevoegdheden })),
  );

  return gebruikers.filter((g) => {
    const niveau = (effectief.get(g.id) ?? {})["magazijn"] ?? 0;
    return niveau >= 2 && g.email;
  }) as Array<{ naam: string; email: string }>;
}

// ── Dagelijkse check ─────────────────────────────────────────────────────────

async function voerCheckUit(): Promise<void> {
  logger.info("Magazijn minimumvoorraad-check gestart");

  const instellingen = await haalMagazijnInstellingen().catch((err) => {
    logger.error({ err }, "Magazijn signalering: instellingen ophalen mislukt, standaardwaarden gebruikt");
    return STANDAARD_INSTELLINGEN;
  });

  let kritiek: Awaited<ReturnType<typeof haalKrtitiekeArtikelen>>;
  try {
    kritiek = await haalKrtitiekeArtikelen(instellingen.signaleringMarge);
  } catch (err) {
    logger.error({ err }, "Magazijn signalering: kritieke artikelen ophalen mislukt");
    return;
  }

  if (kritiek.length === 0) {
    logger.info("Magazijn signalering: geen artikelen onder minimumvoorraad (na marge/snooze-filter)");
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
let _huidigeTimer: ReturnType<typeof setTimeout> | null = null;

async function scheduleNext() {
  const instellingen = await haalMagazijnInstellingen().catch(() => STANDAARD_INSTELLINGEN);

  const now = new Date();
  const volgende = new Date(now);
  volgende.setHours(instellingen.signaleringUur, instellingen.signaleringMinuut, 0, 0);
  if (volgende <= now) volgende.setDate(volgende.getDate() + 1);
  const vertragingMs = volgende.getTime() - now.getTime();
  const uren = Math.floor(vertragingMs / 3_600_000);
  const minuten = Math.floor((vertragingMs % 3_600_000) / 60_000);
  logger.info({ uren, minuten, tijdstip: `${String(instellingen.signaleringUur).padStart(2, "0")}:${String(instellingen.signaleringMinuut).padStart(2, "0")}` }, "Volgende magazijn signalering gepland");

  if (_huidigeTimer) clearTimeout(_huidigeTimer);
  _huidigeTimer = setTimeout(async () => {
    try {
      await voerCheckUit();
    } catch (err) {
      logger.error({ err }, "Magazijn signalering onverwacht mislukt");
    }
    void scheduleNext();
  }, vertragingMs);
  _huidigeTimer.unref();
}

/**
 * Plant de dagelijkse minimumvoorraad-controle op het geconfigureerde tijdstip
 * (standaard 07:00). Veilig om meerdere keren aan te roepen — plant slechts één timer.
 */
export function planDagelijkseMagazijnSignalering(): void {
  if (_gepland) return;
  _gepland = true;
  void scheduleNext();
}

/**
 * Herplant de timer onmiddellijk op basis van de meest recente instellingen.
 * Aanroepen nadat PATCH /magazijn/instellingen het tijdstip heeft gewijzigd,
 * zodat een gebruiker niet tot de volgende herstart hoeft te wachten.
 */
export function herplanMagazijnSignalering(): void {
  if (!_gepland) return;
  void scheduleNext();
}

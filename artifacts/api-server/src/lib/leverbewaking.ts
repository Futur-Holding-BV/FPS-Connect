// Dagelijkse leverbewaking van bestellingen (inkoopbonnen met status "besteld").
// Detecteert bestellingen waarvan de gewenste leverdatum verstreken is
// (nog niet geleverd) of binnenkort verstrijkt, en stuurt een proactieve
// waarschuwing per e-mail naar alle gebruikers met offertes:2+ bevoegdheid.
// De verantwoordelijkheid blijft menselijk: dit signaleert alleen, de mens
// controleert bij de leverancier en werkt de status bij.
import { db, inkoopbonnenTable, opdrachtenTable, gebruikersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { berekenEffectieveBevoegdhedenBatch } from "./effectieve-bevoegdheden";
import { logger } from "./logger";
import { stuurLeverbewakingSignalering } from "../services/email";

// Aantal dagen vooruit waarvoor een naderende leverdatum al gemeld wordt.
const AANKOMEND_DREMPEL_DAGEN = 3;
// Standaard signaleringstijdstip (07:30, net na de magazijnsignalering).
const SIGNALERING_UUR = 7;
const SIGNALERING_MINUUT = 30;

type BonSignaal = {
  bonNummer: string | null;
  leverancier: string;
  opdrachtTitel: string;
  gewensteLeverdatum: string;
  dagenTe: number;
};

function dagVerschil(datum: Date, referentie: Date): number {
  const a = new Date(datum.getFullYear(), datum.getMonth(), datum.getDate());
  const b = new Date(referentie.getFullYear(), referentie.getMonth(), referentie.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

async function haalSignalen(): Promise<{ verlopen: BonSignaal[]; aankomend: BonSignaal[] }> {
  const rijen = await db
    .select({
      bonNummer: inkoopbonnenTable.bonNummer,
      leverancier: inkoopbonnenTable.leverancier,
      gewensteLeverdatum: inkoopbonnenTable.gewensteLeverdatum,
      opdrachtTitel: opdrachtenTable.titel,
    })
    .from(inkoopbonnenTable)
    .leftJoin(opdrachtenTable, eq(inkoopbonnenTable.opdrachtId, opdrachtenTable.id))
    .where(eq(inkoopbonnenTable.status, "besteld"));

  const nu = new Date();
  const verlopen: BonSignaal[] = [];
  const aankomend: BonSignaal[] = [];

  for (const r of rijen) {
    if (!r.gewensteLeverdatum) continue;
    const datum = new Date(r.gewensteLeverdatum);
    if (isNaN(datum.getTime())) continue;
    const verschil = dagVerschil(datum, nu);
    const signaal: BonSignaal = {
      bonNummer: r.bonNummer,
      leverancier: r.leverancier,
      opdrachtTitel: r.opdrachtTitel ?? "-",
      gewensteLeverdatum: r.gewensteLeverdatum,
      dagenTe: Math.abs(verschil),
    };
    if (verschil < 0) {
      verlopen.push(signaal);
    } else if (verschil <= AANKOMEND_DREMPEL_DAGEN) {
      aankomend.push(signaal);
    }
  }

  verlopen.sort((a, b) => b.dagenTe - a.dagenTe);
  aankomend.sort((a, b) => a.dagenTe - b.dagenTe);
  return { verlopen, aankomend };
}

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
    const niveau = (effectief.get(g.id) ?? {})["offertes"] ?? 0;
    return niveau >= 2 && g.email;
  }) as Array<{ naam: string; email: string }>;
}

async function voerCheckUit(): Promise<void> {
  logger.info("Leverbewaking-check gestart");

  let signalen: Awaited<ReturnType<typeof haalSignalen>>;
  try {
    signalen = await haalSignalen();
  } catch (err) {
    logger.error({ err }, "Leverbewaking: signalen ophalen mislukt");
    return;
  }

  if (signalen.verlopen.length === 0 && signalen.aankomend.length === 0) {
    logger.info("Leverbewaking: geen verlopen of naderende leverdatums");
    return;
  }

  logger.info(
    { verlopen: signalen.verlopen.length, aankomend: signalen.aankomend.length },
    "Leverbewaking: signalen gevonden",
  );

  let ontvangers: Awaited<ReturnType<typeof haalOntvangers>>;
  try {
    ontvangers = await haalOntvangers();
  } catch (err) {
    logger.error({ err }, "Leverbewaking: ontvangers ophalen mislukt");
    return;
  }

  if (ontvangers.length === 0) {
    logger.warn("Leverbewaking: geen ontvangers met offertes:2+ bevoegdheid");
    return;
  }

  for (const ontvanger of ontvangers) {
    try {
      await stuurLeverbewakingSignalering({
        naarEmail: ontvanger.email,
        naarNaam: ontvanger.naam,
        verlopen: signalen.verlopen,
        aankomend: signalen.aankomend,
      });
    } catch (err) {
      logger.error({ err, email: ontvanger.email }, "Leverbewaking: verzenden mislukt");
    }
  }

  logger.info(
    { ontvangers: ontvangers.length, verlopen: signalen.verlopen.length, aankomend: signalen.aankomend.length },
    "Leverbewaking voltooid",
  );
}

let _gepland = false;
let _huidigeTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleNext(): void {
  const now = new Date();
  const volgende = new Date(now);
  volgende.setHours(SIGNALERING_UUR, SIGNALERING_MINUUT, 0, 0);
  if (volgende <= now) volgende.setDate(volgende.getDate() + 1);
  const vertragingMs = volgende.getTime() - now.getTime();
  const uren = Math.floor(vertragingMs / 3_600_000);
  const minuten = Math.floor((vertragingMs % 3_600_000) / 60_000);
  logger.info(
    { uren, minuten, tijdstip: `${String(SIGNALERING_UUR).padStart(2, "0")}:${String(SIGNALERING_MINUUT).padStart(2, "0")}` },
    "Volgende leverbewaking gepland",
  );

  if (_huidigeTimer) clearTimeout(_huidigeTimer);
  _huidigeTimer = setTimeout(async () => {
    try {
      await voerCheckUit();
    } catch (err) {
      logger.error({ err }, "Leverbewaking onverwacht mislukt");
    }
    scheduleNext();
  }, vertragingMs);
  _huidigeTimer.unref();
}

/**
 * Plant de dagelijkse leverbewaking op het vaste tijdstip (07:30).
 * Veilig om meerdere keren aan te roepen — plant slechts één timer.
 */
export function planDagelijkseLeverbewaking(): void {
  if (_gepland) return;
  _gepland = true;
  scheduleNext();
}

// MARKETING_01 Deel A (vervolg) — gedoseerde campagne-verzender.
//
// Na de éénmalige expliciete goedkeuring van een campagne (POST
// /marketing/campagnes/:id/verzenden, crm niveau 4) staan alle campagnemails
// fail-closed in de mailwachtrij. Deze verzender verstuurt ze gespreid: één
// item per tussenpoos van (60 / tempo) seconden, zodat de mailserver nooit
// een spam-piek produceert. Het tempo (mails per minuut) is instelbaar via
// app_instellingen.campagne_verzendtempo_per_minuut.
//
// Veiligheidsmodel:
// - Alleen wachtrij-items van campagnes met status "verzendend" komen in
//   aanmerking; per-item goedkeuring blijft gelden voor alle overige mail.
// - De bestaande consent-poort (controleerCampagneItemVerzendbaar) draait in
//   verstuurMailWachtrijItem vlak vóór élke verzending — afmelden, intrekken
//   of stoppen werkt dus per direct, ook midden in een lopende verzending.
// - Stoppen (POST /marketing/campagnes/:id/stoppen) zet wachtende items
//   direct op "afgewezen"; een item dat op dat moment nét geclaimd is valt
//   alsnog op de consent-poort (campagne is niet meer "verzendend").
// - Dubbel verzenden kan niet: verstuurMailWachtrijItem claimt atomair.
import {
  db,
  appInstellingenTable,
  mailWachtrijTable,
  marketingCampagneOntvangersTable,
  marketingCampagnesTable,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { verstuurMailWachtrijItem, MailFout } from "./email";
import { markeerOntvangerOvergeslagen } from "./marketingService";

export const TEMPO_MIN = 1;
export const TEMPO_MAX = 60;
export const TEMPO_STANDAARD = 6;

/** Klemt een tempo-waarde binnen de toegestane grenzen (1–60 per minuut). */
export function klemTempo(waarde: number): number {
  if (!Number.isFinite(waarde)) return TEMPO_STANDAARD;
  return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(waarde)));
}

/** Leest het ingestelde verzendtempo (mails per minuut) uit app_instellingen. */
export async function haalCampagneVerzendtempo(): Promise<number> {
  const [instelling] = await db
    .select({ tempo: appInstellingenTable.campagneVerzendtempoPerMinuut })
    .from(appInstellingenTable)
    .orderBy(appInstellingenTable.id)
    .limit(1);
  return klemTempo(instelling?.tempo ?? TEMPO_STANDAARD);
}

export type VerzendStapUitkomst = "verzonden" | "geblokkeerd" | "mislukt" | "leeg";

/**
 * Verstuurt het oudste in-aanmerking-komende campagne-wachtrij-item (van een
 * campagne met status "verzendend"). Retourneert wat er gebeurde zodat de
 * verzendlus haar tussenpoos kan bepalen. Eén item per aanroep — de dosering
 * zit in de lus, niet hier.
 */
export async function verstuurVolgendCampagneItem(): Promise<VerzendStapUitkomst> {
  const [kandidaat] = await db
    .select({
      id: mailWachtrijTable.id,
      aangevraagdDoorId: mailWachtrijTable.aangevraagdDoorId,
      campagneId: marketingCampagnesTable.id,
      ontvangerId: marketingCampagneOntvangersTable.id,
    })
    .from(mailWachtrijTable)
    .innerJoin(
      marketingCampagneOntvangersTable,
      eq(marketingCampagneOntvangersTable.id, mailWachtrijTable.campagneOntvangerId),
    )
    .innerJoin(
      marketingCampagnesTable,
      eq(marketingCampagnesTable.id, marketingCampagneOntvangersTable.campagneId),
    )
    .where(
      and(
        eq(mailWachtrijTable.status, "wachtend"),
        eq(marketingCampagnesTable.status, "verzendend"),
      ),
    )
    .orderBy(asc(mailWachtrijTable.aangemaaktOp), asc(mailWachtrijTable.id))
    .limit(1);
  if (!kandidaat) return "leeg";
  try {
    await verstuurMailWachtrijItem(kandidaat.id, kandidaat.aangevraagdDoorId);
    return "verzonden";
  } catch (err) {
    if (err instanceof MailFout) {
      // Echte verzendfout — item staat op "mislukt" en wordt niet automatisch
      // opnieuw geprobeerd. Omdat handmatig versturen van campagne-items
      // bewust geblokkeerd is, moet de ontvanger hier terminal worden
      // (overgeslagen) — anders blijft de campagne eeuwig op "verzendend"
      // staan zonder herstelpad. De afrondingscontrole zit in de helper.
      logger.warn(
        { itemId: kandidaat.id, campagneId: kandidaat.campagneId, categorie: err.categorie },
        "Gedoseerde verzender: campagnemail mislukt — ontvanger overgeslagen",
      );
      await markeerOntvangerOvergeslagen(kandidaat.ontvangerId).catch((fout) =>
        logger.error({ fout, ontvangerId: kandidaat.ontvangerId }, "Ontvanger overslaan na mailfout mislukt"),
      );
      return "mislukt";
    }
    // Consent-poort of claim-race: item is afgewezen of al door een ander
    // verwerkt — geen mail de deur uit, de lus mag direct door.
    logger.info(
      { itemId: kandidaat.id, campagneId: kandidaat.campagneId, reden: err instanceof Error ? err.message : String(err) },
      "Gedoseerde verzender: item overgeslagen",
    );
    return "geblokkeerd";
  }
}

const IDLE_WACHT_MS = 5_000;
const GEBLOKKEERD_WACHT_MS = 1_000;

let lusGestart = false;

/**
 * Start de gedoseerde verzendlus: recursieve setTimeout (nooit overlappend),
 * één item per iteratie, tussenpoos 60/tempo seconden ná een echte
 * verzendpoging. Zonder werk kijkt de lus elke 5 seconden opnieuw.
 */
export function planCampagneVerzender(): void {
  if (lusGestart) return; // idempotent — nooit twee lussen in één proces
  lusGestart = true;
  const stap = async (): Promise<number> => {
    const tempo = await haalCampagneVerzendtempo();
    const uitkomst = await verstuurVolgendCampagneItem();
    if (uitkomst === "leeg") return IDLE_WACHT_MS;
    if (uitkomst === "geblokkeerd") return GEBLOKKEERD_WACHT_MS;
    // verzonden of mislukt: er is echt een verzendpoging naar de mailserver
    // gedaan — respecteer de volledige tussenpoos.
    return Math.max(1_000, Math.round(60_000 / tempo));
  };
  const lus = (): void => {
    void stap()
      .catch((err) => {
        logger.error({ err }, "Gedoseerde campagne-verzender: stap mislukt");
        return IDLE_WACHT_MS;
      })
      .then((wachtMs) => {
        setTimeout(lus, wachtMs);
      });
  };
  setTimeout(lus, IDLE_WACHT_MS);
  logger.info("Gedoseerde campagne-verzender gestart");
}

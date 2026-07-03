import { db, appInstellingenTable, aiAanroepenTable, gebruikersTable } from "@workspace/db";
import { gte, sql, eq } from "drizzle-orm";
import { logger } from "./logger";
import { verstuurMail, isGeconfigureerd as isMailGeconfigureerd } from "../services/email";

function huidigeJaarMaand(): string {
  const nu = new Date();
  const jaar = nu.getFullYear();
  const maand = String(nu.getMonth() + 1).padStart(2, "0");
  return `${jaar}-${maand}`;
}

async function controleerAiDrempel(): Promise<void> {
  const [instelling] = await db
    .select()
    .from(appInstellingenTable)
    .orderBy(appInstellingenTable.id)
    .limit(1);

  if (!instelling) return;

  const drempel = instelling.aiKostendrempelEur != null ? parseFloat(instelling.aiKostendrempelEur) : null;
  if (!drempel || drempel <= 0) return;

  const jaarMaand = huidigeJaarMaand();

  if (instelling.aiDrempelMeldingGestuurdMaand === jaarMaand) {
    return;
  }

  const nu = new Date();
  const maandStart = new Date(nu.getFullYear(), nu.getMonth(), 1);

  const [{ totaalKosten }] = await db
    .select({
      totaalKosten: sql<string>`COALESCE(SUM(${aiAanroepenTable.geschatteKostenEur}), '0')::text`,
    })
    .from(aiAanroepenTable)
    .where(gte(aiAanroepenTable.aangemaaktOp, maandStart));

  const kosten = parseFloat(totaalKosten);

  if (kosten <= drempel) return;

  logger.info(
    { kosten, drempel, jaarMaand },
    "AI kostendrempel overschreden — melding versturen",
  );

  const mailGeconfigureerd = isMailGeconfigureerd();

  if (!mailGeconfigureerd) {
    logger.warn("AI drempel overschreden maar mail niet geconfigureerd — maandmarkering gezet, geen mail");
    await db
      .update(appInstellingenTable)
      .set({ aiDrempelMeldingGestuurdMaand: jaarMaand, bijgewerktOp: new Date() })
      .where(eq(appInstellingenTable.id, instelling.id));
    return;
  }

  const hoofdbeheerders = await db
    .select({ naam: gebruikersTable.naam, email: gebruikersTable.email })
    .from(gebruikersTable)
    .where(
      sql`${gebruikersTable.rol} = 'hoofdbeheerder' AND ${gebruikersTable.actief} = true`,
    );

  const maandLabel = `${nu.toLocaleString("nl-NL", { month: "long" })} ${nu.getFullYear()}`;
  const kostenFormatted = `€ ${kosten.toFixed(2)}`;
  const drempelFormatted = `€ ${drempel.toFixed(2)}`;

  const html = `
<p>Beste beheerder,</p>
<p>
  De maandelijkse AI-kosten voor <strong>${maandLabel}</strong> hebben de ingestelde drempel overschreden.
</p>
<table style="border-collapse:collapse;margin:16px 0;">
  <tr>
    <td style="padding:4px 12px 4px 0;color:#666;">Huidige kosten</td>
    <td style="padding:4px 0;font-weight:600;">${kostenFormatted}</td>
  </tr>
  <tr>
    <td style="padding:4px 12px 4px 0;color:#666;">Ingestelde drempel</td>
    <td style="padding:4px 0;">${drempelFormatted}</td>
  </tr>
</table>
<p>
  Bekijk het volledige AI-logboek via <strong>Beheer › AI-aanroepen</strong>.
</p>
<p style="margin-top:24px;color:#999;font-size:12px;">
  Deze melding is eenmalig verstuurd voor ${maandLabel}. Pas de drempel aan via Beheer › AI-aanroepen.
</p>
`;

  let aantalVerzonden = 0;
  for (const gebruiker of hoofdbeheerders) {
    try {
      await verstuurMail({
        naarEmail: gebruiker.email,
        naarNaam: gebruiker.naam,
        onderwerp: `AI-kostendrempel overschreden: ${kostenFormatted} (drempel ${drempelFormatted})`,
        html,
        soort: "ai_drempel",
      });
      aantalVerzonden++;
    } catch (err) {
      logger.warn({ err, email: gebruiker.email }, "AI drempel mail versturen mislukt");
    }
  }

  if (aantalVerzonden > 0) {
    await db
      .update(appInstellingenTable)
      .set({ aiDrempelMeldingGestuurdMaand: jaarMaand, bijgewerktOp: new Date() })
      .where(eq(appInstellingenTable.id, instelling.id));
    logger.info({ aantalVerzonden, jaarMaand }, "AI drempel meldingen verzonden, maandmarkering gezet");
  } else {
    logger.warn({ jaarMaand }, "AI drempel: geen meldingen verzonden, maandmarkering NIET gezet — volgende uur nieuwe poging");
  }
}

let _gepland = false;

export function planUurlijkseAiDrempelCheck(): void {
  if (_gepland) return;
  _gepland = true;

  const INTERVAL_MS = 60 * 60 * 1000;

  function scheduleNext() {
    setTimeout(async () => {
      try {
        await controleerAiDrempel();
      } catch (err) {
        logger.error({ err }, "AI drempel check mislukt");
      }
      scheduleNext();
    }, INTERVAL_MS);
  }

  controleerAiDrempel().catch((err) => {
    logger.error({ err }, "AI drempel check (initieel) mislukt");
  });

  scheduleNext();
}

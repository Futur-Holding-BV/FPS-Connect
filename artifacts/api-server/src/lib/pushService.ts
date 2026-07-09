// Push-notificatie service (Expo Push API) — geen extra SDK nodig, alleen fetch
// Gebruikt voor: nieuwe meldingen (naar beheerders) en de kwartaalcontrole-cyclus
// (naar de monteur, oplopend dringend: week 1 vrijblijvend, daarna steeds dringender).

import { db, pushTokensTable, wagenparkKwartaalcontroleTable, voertuigenTable, gebruikersTable } from "@workspace/db";
import { eq, and, isNotNull, ne } from "drizzle-orm";
import { heeftNiveau } from "@workspace/permissies";
import { logger } from "./logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const DAG_MS = 24 * 60 * 60 * 1000;
const CONTROLE_TERMIJN_DAGEN = 30; // tijd om de kwartaalcontrole af te ronden

// ── Token-registratie ────────────────────────────────────────────────────────

export async function registreerPushToken(
  gebruikerId: number,
  expoPushToken: string,
  platform: "ios" | "android" | "onbekend",
): Promise<void> {
  const bestaand = await db
    .select()
    .from(pushTokensTable)
    .where(eq(pushTokensTable.expoPushToken, expoPushToken))
    .limit(1);

  if (bestaand[0]) {
    await db
      .update(pushTokensTable)
      .set({ gebruikerId, platform, laatstGebruiktOp: new Date() })
      .where(eq(pushTokensTable.id, bestaand[0].id));
    return;
  }

  await db.insert(pushTokensTable).values({ gebruikerId, expoPushToken, platform });
}

// ── Versturen ─────────────────────────────────────────────────────────────

export async function stuurPushNaarGebruiker(
  gebruikerId: number,
  titel: string,
  bericht: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const tokens = await db
    .select()
    .from(pushTokensTable)
    .where(eq(pushTokensTable.gebruikerId, gebruikerId));

  if (tokens.length === 0) return;

  const berichten = tokens.map((t) => ({
    to: t.expoPushToken,
    sound: "default",
    title: titel,
    body: bericht,
    data: data ?? {},
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(berichten),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, "Push-notificatie versturen mislukt");
    }
  } catch (err) {
    logger.warn({ err }, "Push-notificatie versturen mislukt (netwerk)");
  }
}

// ── Kwartaalcontrole-cyclus ──────────────────────────────────────────────────

function huidigKwartaalStart(nu: Date): Date {
  const kwartaal = Math.floor(nu.getMonth() / 3);
  return new Date(nu.getFullYear(), kwartaal * 3, 1);
}

/** Zorgt dat elk voertuig met een vaste chauffeur een open kwartaalcontrole-cyclus heeft. */
async function zorgVoorOpenCycli(): Promise<void> {
  const nu = new Date();
  const periodeStart = huidigKwartaalStart(nu);
  const deadline = new Date(periodeStart.getTime() + CONTROLE_TERMIJN_DAGEN * DAG_MS);

  const voertuigenMetChauffeur = await db
    .select()
    .from(voertuigenTable)
    .where(and(eq(voertuigenTable.gearchiveerd, false), isNotNull(voertuigenTable.chauffeurId)));

  for (const voertuig of voertuigenMetChauffeur) {
    const [open] = await db
      .select()
      .from(wagenparkKwartaalcontroleTable)
      .where(
        and(
          eq(wagenparkKwartaalcontroleTable.voertuigId, voertuig.id),
          eq(wagenparkKwartaalcontroleTable.status, "open"),
        ),
      )
      .limit(1);

    if (open) continue;

    // Al een voltooide/verlopen cyclus voor dit exacte kwartaal? Dan niet opnieuw aanmaken.
    const bestaandeVoorPeriode = await db
      .select()
      .from(wagenparkKwartaalcontroleTable)
      .where(
        and(
          eq(wagenparkKwartaalcontroleTable.voertuigId, voertuig.id),
          eq(wagenparkKwartaalcontroleTable.periodeStart, periodeStart),
        ),
      )
      .limit(1);
    if (bestaandeVoorPeriode[0]) continue;

    await db.insert(wagenparkKwartaalcontroleTable).values({
      voertuigId: voertuig.id,
      periodeStart,
      deadline,
      status: "open",
    });
  }
}

/** Bepaalt of er vandaag een herinnering moet, en met welke urgentie. */
function bepaalHerinnering(
  periodeStart: Date,
  deadline: Date,
  nu: Date,
  aantalHerinneringen: number,
  laatsteHerinneringOp: Date | null,
): { moetHerinneren: boolean; urgent: boolean } {
  const dagenSindsStart = Math.floor((nu.getTime() - periodeStart.getTime()) / DAG_MS);
  const dagenTotDeadline = Math.floor((deadline.getTime() - nu.getTime()) / DAG_MS);
  const dagenSindsLaatste = laatsteHerinneringOp
    ? Math.floor((nu.getTime() - laatsteHerinneringOp.getTime()) / DAG_MS)
    : Infinity;

  if (dagenSindsStart < 7) {
    // Week 1: vrijblijvend, één keer.
    return { moetHerinneren: aantalHerinneringen === 0, urgent: false };
  }
  if (dagenTotDeadline <= 3) {
    // Laatste dagen: dagelijks, urgent.
    return { moetHerinneren: dagenSindsLaatste >= 1, urgent: true };
  }
  // Week 2 en verder (buiten de laatste 3 dagen): elke 3 dagen, dringender toon.
  return { moetHerinneren: dagenSindsLaatste >= 3, urgent: false };
}

async function verwerkKwartaalcontroleCycli(): Promise<void> {
  await zorgVoorOpenCycli();

  const nu = new Date();
  const openCycli = await db
    .select()
    .from(wagenparkKwartaalcontroleTable)
    .where(eq(wagenparkKwartaalcontroleTable.status, "open"));

  for (const cyclus of openCycli) {
    if (nu > cyclus.deadline) {
      await db
        .update(wagenparkKwartaalcontroleTable)
        .set({ status: "verlopen", bijgewerktOp: new Date() })
        .where(eq(wagenparkKwartaalcontroleTable.id, cyclus.id));
      continue;
    }

    const [voertuig] = await db
      .select()
      .from(voertuigenTable)
      .where(eq(voertuigenTable.id, cyclus.voertuigId))
      .limit(1);
    if (!voertuig?.chauffeurId) continue;

    const { moetHerinneren, urgent } = bepaalHerinnering(
      cyclus.periodeStart,
      cyclus.deadline,
      nu,
      cyclus.aantalHerinneringen,
      cyclus.laatsteHerinneringOp,
    );
    if (!moetHerinneren) continue;

    const titel = urgent ? "Kwartaalcontrole vereist" : "Kwartaalcontrole voertuig";
    const bericht = urgent
      ? `De kwartaalcontrole voor ${voertuig.kenteken ?? "uw voertuig"} is nog niet afgerond. Doe dit zo snel mogelijk.`
      : `Tijd voor de kwartaalcontrole van ${voertuig.kenteken ?? "uw voertuig"}. Maak een dashboardfoto in de app.`;

    await stuurPushNaarGebruiker(voertuig.chauffeurId, titel, bericht, {
      type: "kwartaalcontrole",
      voertuigId: voertuig.id,
      kwartaalcontroleId: cyclus.id,
    });

    await db
      .update(wagenparkKwartaalcontroleTable)
      .set({
        laatsteHerinneringOp: nu,
        aantalHerinneringen: cyclus.aantalHerinneringen + 1,
        bijgewerktOp: new Date(),
      })
      .where(eq(wagenparkKwartaalcontroleTable.id, cyclus.id));
  }
}

let _dagelijksGepland = false;

/** Plan de dagelijkse kwartaalcontrole-taak om 07:30. Veilig om meerdere keren aan te roepen. */
export function planDagelijkseKwartaalcontrole(): void {
  if (_dagelijksGepland) return;
  _dagelijksGepland = true;

  function scheduleNext() {
    const now = new Date();
    const volgende = new Date(now);
    volgende.setHours(7, 30, 0, 0);
    if (volgende <= now) volgende.setDate(volgende.getDate() + 1);
    const vertragingMs = volgende.getTime() - now.getTime();
    const uren = Math.floor(vertragingMs / 3_600_000);
    const minuten = Math.floor((vertragingMs % 3_600_000) / 60_000);
    logger.info({ uren, minuten }, "Volgende kwartaalcontrole-taak gepland");

    setTimeout(async () => {
      try {
        logger.info("Kwartaalcontrole-taak starten");
        await verwerkKwartaalcontroleCycli();
      } catch (err) {
        logger.error({ err }, "Kwartaalcontrole-taak mislukt");
      }
      scheduleNext();
    }, vertragingMs).unref();
  }

  scheduleNext();
}

export async function meldNieuweMeldingAanBeheerders(
  titel: string,
  bericht: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const gebruikers = await db
    .select({ id: gebruikersTable.id, rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
    .from(gebruikersTable)
    .where(ne(gebruikersTable.actief, false));

  const beheerders = gebruikers.filter((g) => {
    if (g.rol === "hoofdbeheerder") return true;
    const bev = (g.bevoegdheden as Record<string, number> | null) ?? {};
    return heeftNiveau(bev, "wagenpark", 2);
  });

  for (const b of beheerders) {
    await stuurPushNaarGebruiker(b.id, titel, bericht, data);
  }
}

export { verwerkKwartaalcontroleCycli as _verwerkKwartaalcontroleCycliVoorTest };

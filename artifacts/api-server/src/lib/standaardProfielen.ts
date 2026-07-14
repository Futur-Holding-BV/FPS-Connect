import { db, profielenTable, functiesTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import { PRESETS } from "@workspace/permissies";
import { logger } from "./logger";

// Zaait ontbrekende standaard rechten-presets als systeem-profielen. Idempotent:
// bestaande profielen (op naam) blijven ongewijzigd — dit raakt nooit de
// bevoegdheden van reeds aangemaakte profielen, zodat draaiende omgevingen stabiel
// blijven. Bijwerken van afwijkende systeem-presets blijft de expliciete
// hoofdbeheerder-actie POST /profielen/synchroniseer-standaard.
export async function zaaiStandaardProfielen(): Promise<void> {
  try {
    const bestaand = await db
      .select({ naam: profielenTable.naam })
      .from(profielenTable);
    const bestaandeNamen = new Set(bestaand.map((p) => p.naam));
    const ontbrekend = PRESETS.filter((p) => !bestaandeNamen.has(p.naam));
    if (ontbrekend.length === 0) {
      logger.info("Standaard rechten-presets compleet, niets te zaaien");
      return;
    }
    await db.insert(profielenTable).values(
      ontbrekend.map((p) => ({
        naam: p.naam,
        bevoegdheden: p.bevoegdheden,
        systeem: true,
      })),
    );
    logger.info(
      { aangemaakt: ontbrekend.map((p) => p.naam) },
      "Standaard rechten-presets gezaaid",
    );
  } catch (err) {
    logger.error({ err }, "Zaaien van standaard rechten-presets mislukt");
  }
}

// Leidt een verstandige standaard-preset af uit een functienaam. Zuiver op naam;
// retourneert de preset-naam of null als er geen betrouwbare match is.
//
// Rangorde (hoogste eerst):
//  1. exacte naamgelijkheid — "Monteur" -> preset "Monteur";
//  2. functienaam bevat de preset-naam — de langste (specifiekste) preset wint,
//     zodat een functie "Hoofdmonteur BHV" op "Monteur" kan uitkomen;
//  3. preset-naam bevat de functienaam — de kortste (dichtstbijzijnde) preset
//     wint.
// De expliciete rangorde voorkomt dat een langere preset die de functienaam
// slechts bevat (bijv. "Onderhoudsmonteur") een exacte match ("Monteur")
// verdringt.
export function presetVoorFunctienaam(functienaam: string): string | null {
  const naam = functienaam.trim().toLowerCase();
  if (!naam) return null;
  const gescoord = PRESETS.map((preset) => {
    const p = preset.naam.toLowerCase();
    let rang: number;
    let lengte: number;
    if (p === naam) {
      rang = 3;
      lengte = 0;
    } else if (naam.includes(p)) {
      rang = 2;
      lengte = p.length; // langste preset wint
    } else if (p.includes(naam)) {
      rang = 1;
      lengte = -p.length; // kortste preset wint
    } else {
      rang = 0;
      lengte = 0;
    }
    return { naam: preset.naam, rang, lengte };
  })
    .filter((k) => k.rang > 0)
    .sort((a, b) => b.rang - a.rang || b.lengte - a.lengte);
  return gescoord[0]?.naam ?? null;
}

// Koppelt functies zonder rechten-preset (profiel_id IS NULL) aan een verstandige
// standaard-preset op basis van hun naam. Non-destructief: functies die al een
// preset hebben blijven ongemoeid. Een functie krijgt hiermee alleen een
// SJABLOON voor toegangsrechten; er worden nooit rechten aan een persoon
// toegekend zonder expliciete menselijke bevestiging bij accountaanmaak.
export async function koppelFunctiesAanPresets(): Promise<void> {
  try {
    const ongekoppeld = await db
      .select({ id: functiesTable.id, naam: functiesTable.naam })
      .from(functiesTable)
      .where(isNull(functiesTable.profielId));
    if (ongekoppeld.length === 0) return;

    const presets = await db
      .select({ id: profielenTable.id, naam: profielenTable.naam })
      .from(profielenTable);
    const presetOpNaam = new Map(presets.map((p) => [p.naam, p.id]));

    const gekoppeld: string[] = [];
    for (const functie of ongekoppeld) {
      const presetNaam = presetVoorFunctienaam(functie.naam);
      if (!presetNaam) continue;
      const profielId = presetOpNaam.get(presetNaam);
      if (!profielId) continue;
      await db
        .update(functiesTable)
        .set({ profielId })
        .where(eq(functiesTable.id, functie.id));
      gekoppeld.push(`${functie.naam} -> ${presetNaam}`);
    }
    if (gekoppeld.length > 0) {
      logger.info({ gekoppeld }, "Functies automatisch aan rechten-preset gekoppeld");
    }
  } catch (err) {
    logger.error({ err }, "Automatisch koppelen van functies aan presets mislukt");
  }
}

// Startup-hook: zaai presets, koppel daarna ongekoppelde functies. Blokkeert het
// opstarten niet (fire-and-forget met eigen foutafhandeling).
export function startStandaardProfielen(): void {
  void (async () => {
    await zaaiStandaardProfielen();
    await koppelFunctiesAanPresets();
  })();
}

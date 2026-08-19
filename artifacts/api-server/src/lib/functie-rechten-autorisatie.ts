import { db, functiesTable, profielenTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type { Bevoegdheden } from "@workspace/permissies";

export interface FunctieRechtenActor {
  isHoofdbeheerder: boolean;
  heeftModuleRecht(module: string, minNiveau: number): boolean;
}

export type FunctieRechtenControle =
  | { ok: true }
  | {
      ok: false;
      status: 400 | 403 | 404;
      body: {
        error: string;
        code: "ONGELDIGE_FUNCTIE" | "FUNCTIE_NIET_GEVONDEN" | "FUNCTIE_RECHTEN_ESCALATIE";
        modules?: string[];
      };
    };

/**
 * Een actor met volledig gebruikersbeheer mag iedere functie beheren.
 * Andere HRM-schrijvers mogen alleen matrices beheren waarvoor zij per module
 * minstens hetzelfde niveau bezitten. Zo kan personeel:2 nooit via het
 * functiehuis gebruikers:4 of een ander hoger recht uitdelen.
 */
export function controleerBevoegdhedenVoorActor(
  actor: FunctieRechtenActor | undefined,
  matrices: Bevoegdheden[],
): FunctieRechtenControle {
  if (!actor) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "Geen effectieve bevoegdheden beschikbaar.",
        code: "FUNCTIE_RECHTEN_ESCALATIE",
      },
    };
  }
  if (actor.isHoofdbeheerder || actor.heeftModuleRecht("gebruikers", 4)) {
    return { ok: true };
  }

  const nietToegestaan = new Set<string>();
  for (const matrix of matrices) {
    for (const [module, niveau] of Object.entries(matrix)) {
      if (
        typeof niveau === "number" &&
        niveau > 0 &&
        !actor.heeftModuleRecht(module, niveau)
      ) {
        nietToegestaan.add(module);
      }
    }
  }
  if (nietToegestaan.size === 0) return { ok: true };

  const modules = [...nietToegestaan].sort();
  return {
    ok: false,
    status: 403,
    body: {
      error:
        "Deze functie bevat rechten die u zelf niet mag beheren. " +
        "Vraag een beheerder met volledig gebruikersbeheer om deze wijziging uit te voeren.",
      code: "FUNCTIE_RECHTEN_ESCALATIE",
      modules,
    },
  };
}

/**
 * Controleert een functie-toewijzing als rechtenwijziging. Zowel de oude als
 * de nieuwe functie telt mee, zodat een beperkte HRM-schrijver ook geen hogere
 * rechten van iemand anders kan afnemen door een functie te wissen/vervangen.
 */
export async function controleerFunctieWisselVoorActor(
  actor: FunctieRechtenActor | undefined,
  oudeFunctieId: number | null,
  nieuweFunctieId: number | null,
): Promise<FunctieRechtenControle> {
  return controleerFunctiesVoorActor(actor, [oudeFunctieId, nieuweFunctieId]);
}

/**
 * Controleert een volledige set functie-id's die door één mutatie wordt
 * toegevoegd, verwijderd of naar een ander account verplaatst.
 */
export async function controleerFunctiesVoorActor(
  actor: FunctieRechtenActor | undefined,
  functieIds: Array<number | null>,
): Promise<FunctieRechtenControle> {
  const ids = [
    ...new Set(functieIds.filter((id): id is number => id != null)),
  ];
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    return {
      ok: false,
      status: 400,
      body: { error: "functie_id is ongeldig.", code: "ONGELDIGE_FUNCTIE" },
    };
  }
  if (ids.length === 0) return { ok: true };

  const functies = await db
    .select({
      id: functiesTable.id,
      bevoegdheden: profielenTable.bevoegdheden,
    })
    .from(functiesTable)
    .leftJoin(profielenTable, eq(functiesTable.profielId, profielenTable.id))
    .where(inArray(functiesTable.id, ids));

  const gevondenIds = new Set(functies.map((functie) => functie.id));
  const ontbrekend = ids.find((id) => !gevondenIds.has(id));
  if (ontbrekend != null) {
    return {
      ok: false,
      status: 404,
      body: {
        error: `Functie ${ontbrekend} is niet gevonden.`,
        code: "FUNCTIE_NIET_GEVONDEN",
      },
    };
  }

  return controleerBevoegdhedenVoorActor(
    actor,
    functies.map((functie) => (functie.bevoegdheden as Bevoegdheden | null) ?? {}),
  );
}
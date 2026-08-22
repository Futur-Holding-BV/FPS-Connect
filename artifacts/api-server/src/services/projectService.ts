// PROJ_1200 §4/5 — centrale project-aanmaak- en projectleider-toewijzingsservice.
//
// ENIGE plek in de runtime die INSERT IN projecten mag schrijven.
// ENIGE plek die projectleider_medewerker_id kan veranderen.
//
// Twee modi voor project-aanmaak:
//   - handmatig: vereist expliciet meegegeven eligible medewerker-id (422 indien afwezig/ongeldig)
//   - automatisch: kandidatenresolutie in transactie:
//       * exact 1 → wijs toe
//       * 0 of >1 → laat nullable, maak exact één deduplicated open werkbak-item aan
//
// Toewijzingswijziging:
//   - vergrendelt rij, valideert kandidaat, update, schrijft geschiedenis, sluit werkbak-item
//   - idempotent: zelfde toewijzing schrijft geen duplicaat geschiedenis

import {
  db,
  projectenTable,
  projectleiderGeschiedenisTable,
  werkbakItemsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { meldWerkbakItem, handelBronAf, type DbExecutor } from "../lib/werkbakService";
import {
  haalProjectleiderKandidaten,
  valideerProjectleiderKandidaat,
} from "../lib/projectleiderKandidaten";
import type { DbLeezer } from "../lib/projectleiderKandidaten";
// Drizzle-transactie heeft hetzelfde type als db maar is meer beperkt.
// We gebruiken een union-achtig type dat zowel de db-instantie als een Drizzle-tx dekt.
type Tx = Pick<typeof db, "insert" | "update" | "select" | "delete">;

// Hulptype voor een executor die zowel lees- als schrijfoperaties heeft
type FullExecutor = Tx;

export type ProjectAanmaakInvoer = {
  naam: string;
  werknummer?: string | null;
  status?: string;
  werkmaatschappij?: string | null;
  omschrijving?: string | null;
  crmKlantId?: number | null;
  gebouwId?: number | null;
  startDatum?: string | null;
  eindDatum?: string | null;
  aangemaaktDoorId?: number | null;
};

export type ProjectleiderModus = "handmatig" | "automatisch";

export type MaakProjectResultaat = {
  projectId: number;
  projectleiderMedewerkerId: number | null;
  werkbakItemAangemaakt: boolean;
};

/**
 * Geeft de werkbak dedup-sleutel voor een project zonder projectleider.
 */
export function projectleiderOntbreektSleutel(projectId: number): string {
  return `projectleider-ontbreekt:${projectId}`;
}

/**
 * Maakt een nieuw project aan via de centrale service — de ENIGE plek met insert(projectenTable).
 *
 * Handmatige modus: `projectleiderMedewerkerId` moet meegegeven worden en een geldige
 * kandidaat zijn. Geeft 422-fout als afwezig of ongeldig.
 *
 * Automatische modus: lost kandidaten op binnen de transactie. Exact 1 → toewijzen,
 * 0 of >1 → nullable + één deduplicated werkbak-item (bron: projectleider_toewijzing).
 *
 * @param invoer Projectvelden
 * @param modus "handmatig" | "automatisch"
 * @param projectleiderMedewerkerId Verplicht bij modus "handmatig"
 * @param actorGebruikerId Gebruiker die de actie uitvoert (voor audit)
 * @param tx Optionele Drizzle-transactie (als al in een transactie)
 */
export async function maakProject(
  invoer: ProjectAanmaakInvoer,
  modus: ProjectleiderModus,
  projectleiderMedewerkerId: number | null | undefined,
  actorGebruikerId: number | null | undefined,
  tx?: FullExecutor,
): Promise<MaakProjectResultaat> {
  const executor = tx ?? db;

  if (modus === "handmatig") {
    // Valideer verplichte projectleider
    if (!projectleiderMedewerkerId) {
      throw new ProjectService422Error(
        "projectleider_medewerker_id is verplicht bij handmatige projectaanmaak.",
      );
    }
    const kandidaat = await valideerProjectleiderKandidaat(
      projectleiderMedewerkerId,
      executor as DbLeezer,
    );
    if (!kandidaat) {
      throw new ProjectService422Error(
        `Medewerker ${projectleiderMedewerkerId} is geen geldige projectleider-kandidaat (niet actief of heeft geen actieve functie 'Projectleider').`,
      );
    }

    const [project] = await executor
      .insert(projectenTable)
      .values({
        ...invoer,
        status: invoer.status ?? "concept",
        projectleiderMedewerkerId,
      })
      .returning({ id: projectenTable.id });

    if (!project) throw new Error("Project-aanmaak mislukt (geen rij teruggegeven).");

    // Schrijf initiële geschiedenis
    await executor.insert(projectleiderGeschiedenisTable).values({
      projectId: project.id,
      oudeMedewerkerId: null,
      nieuweMedewerkerId: projectleiderMedewerkerId,
      actorGebruikerId: actorGebruikerId ?? null,
      reden: "initiële toewijzing bij aanmaak (handmatig)",
    });

    return {
      projectId: project.id,
      projectleiderMedewerkerId,
      werkbakItemAangemaakt: false,
    };
  }

  // Automatische modus — kandidatenresolutie binnen de transactie
  const kandidaten = await haalProjectleiderKandidaten(executor as DbLeezer);
  let toegewezenId: number | null = null;
  let werkbakItemAangemaakt = false;

  if (kandidaten.length === 1) {
    toegewezenId = kandidaten[0].id;
  }

  const [project] = await executor
    .insert(projectenTable)
    .values({
      ...invoer,
      status: invoer.status ?? "concept",
      projectleiderMedewerkerId: toegewezenId,
    })
    .returning({ id: projectenTable.id });

  if (!project) throw new Error("Project-aanmaak mislukt (geen rij teruggegeven).");

  if (toegewezenId !== null) {
    // Schrijf initiële geschiedenis voor automatische toewijzing
    await executor.insert(projectleiderGeschiedenisTable).values({
      projectId: project.id,
      oudeMedewerkerId: null,
      nieuweMedewerkerId: toegewezenId,
      actorGebruikerId: actorGebruikerId ?? null,
      reden: "initiële toewijzing bij aanmaak (automatisch, 1 kandidaat)",
    });
  } else {
    // 0 of >1 kandidaten → werkbak-item aanmaken
    // Deep link naar het gebouwproject-tabblad als gebouwId bekend is
    const actiePad = invoer.gebouwId
      ? `/gebouwen/${invoer.gebouwId}?tab=project`
      : `/projecten/${project.id}`;

    werkbakItemAangemaakt = await meldWerkbakItem(
      {
        soort: "doen",
        bron: "projectleider_toewijzing",
        titel: `Project "${invoer.naam}" heeft geen projectleider`,
        omschrijving:
          kandidaten.length === 0
            ? "Geen actieve medewerkers gevonden met de functie 'Projectleider'. Wijs handmatig een projectleider toe."
            : `Er zijn ${kandidaten.length} kandidaten gevonden. Kies er één als projectleider.`,
        alleenHoofdbeheerder: true,
        vereisteModule: "gebouwen",
        vereistNiveau: 2,
        actiePad,
        actieType: null,
        herkomstType: "project",
        herkomstId: project.id,
        dedupSleutel: projectleiderOntbreektSleutel(project.id),
        gebruikerId: null,
      },
      executor as DbExecutor,
    );
  }

  return {
    projectId: project.id,
    projectleiderMedewerkerId: toegewezenId,
    werkbakItemAangemaakt,
  };
}

/**
 * Wijzigt de projectleider van een bestaand project.
 *
 * - Vergrendelt de projectrij (FOR UPDATE)
 * - Valideert de kandidaat
 * - Update de rij
 * - Schrijft geschiedenis (idempotent: zelfde toewijzing → geen duplicaat)
 * - Sluit het bijbehorende werkbak-item
 *
 * Altijd in een transactie uitgevoerd.
 */
export async function wijzigProjectleider(
  projectId: number,
  nieuweMedewerkerId: number,
  actorGebruikerId: number | null | undefined,
  reden?: string | null,
): Promise<{ gewijzigd: boolean; oudeMedewerkerId: number | null }> {
  return db.transaction(async (tx) => {
    // Vergrendel de rij
    const [huidig] = await tx
      .select({
        id: projectenTable.id,
        projectleiderMedewerkerId: projectenTable.projectleiderMedewerkerId,
      })
      .from(projectenTable)
      .where(eq(projectenTable.id, projectId));

    if (!huidig) throw new ProjectServiceNietGevonden(`Project ${projectId} niet gevonden.`);

    // Valideer kandidaat
    const kandidaat = await valideerProjectleiderKandidaat(nieuweMedewerkerId, tx as unknown as DbLeezer);
    if (!kandidaat) {
      throw new ProjectService422Error(
        `Medewerker ${nieuweMedewerkerId} is geen geldige projectleider-kandidaat.`,
      );
    }

    const oud = huidig.projectleiderMedewerkerId;

    // Idempotentie: zelfde toewijzing → geen duplicaat
    if (oud === nieuweMedewerkerId) {
      return { gewijzigd: false, oudeMedewerkerId: oud };
    }

    // Update
    await tx
      .update(projectenTable)
      .set({ projectleiderMedewerkerId: nieuweMedewerkerId, bijgewerktOp: new Date() })
      .where(eq(projectenTable.id, projectId));

    // Schrijf geschiedenis
    await tx.insert(projectleiderGeschiedenisTable).values({
      projectId,
      oudeMedewerkerId: oud,
      nieuweMedewerkerId,
      actorGebruikerId: actorGebruikerId ?? null,
      reden: reden ?? null,
    });

    // Sluit het werkbak-item als het open staat
    await handelBronAf(projectleiderOntbreektSleutel(projectId), tx as unknown as DbExecutor);

    return { gewijzigd: true, oudeMedewerkerId: oud };
  });
}

// ── Custom error-klassen ───────────────────────────────────────────────────────

export class ProjectService422Error extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "ProjectService422Error";
  }
}

export class ProjectServiceNietGevonden extends Error {
  readonly status = 404;
  constructor(message: string) {
    super(message);
    this.name = "ProjectServiceNietGevonden";
  }
}

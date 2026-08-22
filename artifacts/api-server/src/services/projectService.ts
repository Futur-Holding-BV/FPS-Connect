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
import { eq, sql } from "drizzle-orm";
import { meldWerkbakItem, handelBronAf, type DbExecutor } from "../lib/werkbakService";
import {
  haalProjectleiderKandidaten,
  valideerProjectleiderKandidaat,
} from "../lib/projectleiderKandidaten";
import type { DbLeezer } from "../lib/projectleiderKandidaten";
type ProjectTransactie = Parameters<Parameters<typeof db.transaction>[0]>[0];
type FullExecutor = Pick<ProjectTransactie, "insert" | "update" | "select" | "delete" | "execute">;

// Dezelfde transactionele advisory lock wordt via migratie 0139 vóór iedere
// mutatie op medewerkers, functies en medewerker_aanstellingen genomen. Zo kan
// ook een nieuwe of opnieuw geactiveerde kandidaat niet als phantom tussen
// kandidaatresolutie en projectcommit verschijnen.
const PROJECTLEIDER_SLOT_NAMESPACE = 1200;
const PROJECTLEIDER_SLOT_SLEUTEL = 1;

async function vergrendelProjectleiderKandidaatset(
  executor: Pick<ProjectTransactie, "execute">,
): Promise<void> {
  await executor.execute(sql`
    SELECT pg_advisory_xact_lock(
      ${PROJECTLEIDER_SLOT_NAMESPACE},
      ${PROJECTLEIDER_SLOT_SLEUTEL}
    )
  `);
}

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

export type ProjectleiderToewijzing = {
  projectId: number;
  projectleiderMedewerkerId: number;
};

export type BulkToewijzingResultaat = {
  verwerkt: number;
  gewijzigd: number;
  ongewijzigd: number;
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
async function maakProjectInTransactie(
  invoer: ProjectAanmaakInvoer,
  modus: ProjectleiderModus,
  projectleiderMedewerkerId: number | null | undefined,
  actorGebruikerId: number | null | undefined,
  executor: FullExecutor,
): Promise<MaakProjectResultaat> {
  if (modus === "handmatig" && !projectleiderMedewerkerId) {
    throw new ProjectService422Error(
      "projectleider_medewerker_id is verplicht bij handmatige projectaanmaak.",
    );
  }

  await vergrendelProjectleiderKandidaatset(executor);

  if (modus === "handmatig") {
    const toegewezenId = projectleiderMedewerkerId as number;
    const kandidaat = await valideerProjectleiderKandidaat(
      toegewezenId,
      executor as DbLeezer,
      new Date(),
      { vergrendel: true },
    );
    if (!kandidaat) {
      throw new ProjectService422Error(
        `Medewerker ${toegewezenId} is geen geldige projectleider-kandidaat (niet actief of heeft geen actieve functie 'Projectleider').`,
      );
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

    // Schrijf initiële geschiedenis
    await executor.insert(projectleiderGeschiedenisTable).values({
      projectId: project.id,
      oudeMedewerkerId: null,
      nieuweMedewerkerId: toegewezenId,
      actorGebruikerId: actorGebruikerId ?? null,
      reden: "initiële toewijzing bij aanmaak (handmatig)",
    });

    return {
      projectId: project.id,
      projectleiderMedewerkerId: toegewezenId,
      werkbakItemAangemaakt: false,
    };
  }

  // Automatische modus — kandidatenresolutie binnen de transactie
  const kandidaten = await haalProjectleiderKandidaten(
    executor as DbLeezer,
    new Date(),
    { vergrendel: true },
  );
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

export async function maakProject(
  invoer: ProjectAanmaakInvoer,
  modus: ProjectleiderModus,
  projectleiderMedewerkerId: number | null | undefined,
  actorGebruikerId: number | null | undefined,
  tx?: ProjectTransactie,
): Promise<MaakProjectResultaat> {
  if (tx) {
    return maakProjectInTransactie(
      invoer,
      modus,
      projectleiderMedewerkerId,
      actorGebruikerId,
      tx,
    );
  }

  return db.transaction((nieuweTransactie) => maakProjectInTransactie(
    invoer,
    modus,
    projectleiderMedewerkerId,
    actorGebruikerId,
    nieuweTransactie,
  ));
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
async function wijzigProjectleiderInTransactie(
  tx: ProjectTransactie,
  projectId: number,
  nieuweMedewerkerId: number,
  actorGebruikerId: number | null | undefined,
  reden?: string | null,
  geldigeKandidaatIds?: ReadonlySet<number>,
): Promise<{ gewijzigd: boolean; oudeMedewerkerId: number | null }> {
  await vergrendelProjectleiderKandidaatset(tx);

  const [huidig] = await tx
    .select({
      id: projectenTable.id,
      projectleiderMedewerkerId: projectenTable.projectleiderMedewerkerId,
    })
    .from(projectenTable)
    .where(eq(projectenTable.id, projectId))
    .for("update")
    .limit(1);

  if (!huidig) throw new ProjectServiceNietGevonden(`Project ${projectId} niet gevonden.`);

  const kandidaatIsGeldig = geldigeKandidaatIds
    ? geldigeKandidaatIds.has(nieuweMedewerkerId)
    : Boolean(await valideerProjectleiderKandidaat(
      nieuweMedewerkerId,
      tx as unknown as DbLeezer,
      new Date(),
      { vergrendel: true },
    ));
  if (!kandidaatIsGeldig) {
    throw new ProjectService422Error(
      `Medewerker ${nieuweMedewerkerId} is geen geldige projectleider-kandidaat.`,
    );
  }

  const oud = huidig.projectleiderMedewerkerId;

  // Idempotentie: zelfde toewijzing schrijft geen duplicaat, maar ruimt een
  // eventueel achtergebleven werkbakitem wel op.
  if (oud === nieuweMedewerkerId) {
    await handelBronAf(projectleiderOntbreektSleutel(projectId), tx as unknown as DbExecutor);
    return { gewijzigd: false, oudeMedewerkerId: oud };
  }

  await tx
    .update(projectenTable)
    .set({ projectleiderMedewerkerId: nieuweMedewerkerId, bijgewerktOp: new Date() })
    .where(eq(projectenTable.id, projectId));

  await tx.insert(projectleiderGeschiedenisTable).values({
    projectId,
    oudeMedewerkerId: oud,
    nieuweMedewerkerId,
    actorGebruikerId: actorGebruikerId ?? null,
    reden: reden ?? null,
  });

  await handelBronAf(projectleiderOntbreektSleutel(projectId), tx as unknown as DbExecutor);

  return { gewijzigd: true, oudeMedewerkerId: oud };
}

export async function wijzigProjectleider(
  projectId: number,
  nieuweMedewerkerId: number,
  actorGebruikerId: number | null | undefined,
  reden?: string | null,
): Promise<{ gewijzigd: boolean; oudeMedewerkerId: number | null }> {
  return db.transaction((tx) => wijzigProjectleiderInTransactie(
    tx,
    projectId,
    nieuweMedewerkerId,
    actorGebruikerId,
    reden,
  ));
}

/**
 * Atomische bulktoewijzing via dezelfde centrale logica als de enkelvoudige
 * wijziging. Projectrijen worden in vaste volgorde vergrendeld, zodat
 * overlappende batches niet ieder een andere lockvolgorde kiezen.
 */
export async function wijzigProjectleidersBulk(
  toewijzingen: readonly ProjectleiderToewijzing[],
  actorGebruikerId: number | null | undefined,
  reden?: string | null,
): Promise<BulkToewijzingResultaat> {
  const gesorteerd = [...toewijzingen].sort((a, b) => a.projectId - b.projectId);

  return db.transaction(async (tx) => {
    await vergrendelProjectleiderKandidaatset(tx);
    const kandidaten = await haalProjectleiderKandidaten(
      tx as unknown as DbLeezer,
      new Date(),
      { vergrendel: true },
    );
    const geldigeKandidaatIds = new Set(kandidaten.map((kandidaat) => kandidaat.id));
    let gewijzigd = 0;

    for (const toewijzing of gesorteerd) {
      const resultaat = await wijzigProjectleiderInTransactie(
        tx,
        toewijzing.projectId,
        toewijzing.projectleiderMedewerkerId,
        actorGebruikerId,
        reden,
        geldigeKandidaatIds,
      );
      if (resultaat.gewijzigd) gewijzigd += 1;
    }

    return {
      verwerkt: gesorteerd.length,
      gewijzigd,
      ongewijzigd: gesorteerd.length - gewijzigd,
    };
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

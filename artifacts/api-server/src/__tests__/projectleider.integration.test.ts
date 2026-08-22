import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";

const testDatabaseUrl = process.env["PROJECTLEIDER_TEST_DATABASE_URL"];
if (!testDatabaseUrl) {
  throw new Error("PROJECTLEIDER_TEST_DATABASE_URL ontbreekt voor de projectleider-integratieproef.");
}
const databaseNaam = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
if (!/(?:ci|test)/i.test(databaseNaam)) {
  throw new Error(
    `Projectleider-integratieproef weigert niet-wegwerpbare database "${databaseNaam}".`,
  );
}
process.env.DATABASE_URL = testDatabaseUrl;

const {
  caoCatalogusTable,
  db,
  functiesTable,
  gebruikersTable,
  medewerkerAanstellingenTable,
  medewerkersTable,
  pool,
  projectenTable,
  projectleiderGeschiedenisTable,
  werkbakItemsTable,
} = await import("@workspace/db");
const {
  maakProject,
  ProjectService422Error,
  wijzigProjectleider,
  wijzigProjectleidersBulk,
} = await import("../services/projectService");
const { haalProjectleiderKandidaten } = await import("../lib/projectleiderKandidaten");

const marker = `projectleider-ci-${randomUUID()}`;
const projectIds: number[] = [];
const medewerkerIds: number[] = [];
const functieIds: number[] = [];
let actorId: number | null = null;
let ongeldigeMedewerkerId: number;
let kandidaatAId: number;
let kandidaatBId: number;
let bulkRaceProjectId: number;

async function maakFunctie(naam: string, actief = true): Promise<number> {
  const [functie] = await db
    .insert(functiesTable)
    .values({ naam, actief, werkmaatschappij: "FPS Brandpreventie" })
    .returning({ id: functiesTable.id });
  functieIds.push(functie!.id);
  return functie!.id;
}

async function maakMedewerker(
  naam: string,
  functieId: number | null,
  extra: Partial<typeof medewerkersTable.$inferInsert> = {},
): Promise<number> {
  const [medewerker] = await db
    .insert(medewerkersTable)
    .values({
      naam,
      email: `${naam.toLowerCase().replaceAll(" ", "-")}@example.invalid`,
      functieId,
      werkmaatschappij: "FPS Brandpreventie",
      actief: true,
      ...extra,
    })
    .returning({ id: medewerkersTable.id });
  medewerkerIds.push(medewerker!.id);
  return medewerker!.id;
}

async function maakAutomatischProject(naam: string): Promise<Awaited<ReturnType<typeof maakProject>>> {
  const resultaat = await maakProject(
    { naam: `${marker}-${naam}` },
    "automatisch",
    null,
    actorId,
  );
  projectIds.push(resultaat.projectId);
  return resultaat;
}

describe.sequential("projectleider — echte PostgreSQL-keten", () => {
  it("weigert handmatig ongeldig en maakt bij nul kandidaten één werkbakitem", async () => {
    const [actor] = await db
      .insert(gebruikersTable)
      .values({
        naam: `${marker}-actor`,
        email: `${marker}@example.invalid`,
        rol: "gebruiker",
      })
      .returning({ id: gebruikersTable.id });
    actorId = actor!.id;

    const bijnaFunctieId = await maakFunctie("Projectleider ");
    ongeldigeMedewerkerId = await maakMedewerker(
      `${marker} ongeldig`,
      bijnaFunctieId,
    );

    await expect(
      maakProject(
        { naam: `${marker}-handmatig-ongeldig` },
        "handmatig",
        ongeldigeMedewerkerId,
        actorId,
      ),
    ).rejects.toBeInstanceOf(ProjectService422Error);

    const [ongeldigeProjecten] = await db
      .select({ id: projectenTable.id })
      .from(projectenTable)
      .where(eq(projectenTable.naam, `${marker}-handmatig-ongeldig`));
    expect(ongeldigeProjecten).toBeUndefined();

    expect(await haalProjectleiderKandidaten()).toHaveLength(0);
    const zonderKandidaat = await maakAutomatischProject("zonder-kandidaat");
    expect(zonderKandidaat.projectleiderMedewerkerId).toBeNull();
    expect(zonderKandidaat.werkbakItemAangemaakt).toBe(true);

    const werkbak = await db
      .select()
      .from(werkbakItemsTable)
      .where(eq(werkbakItemsTable.herkomstId, zonderKandidaat.projectId));
    expect(werkbak).toHaveLength(1);
    expect(werkbak[0]).toMatchObject({
      bron: "projectleider_toewijzing",
      status: "open",
      dedupSleutel: `projectleider-ontbreekt:${zonderKandidaat.projectId}`,
    });

    const bulkRaceProject = await maakAutomatischProject("bulk-race-doel");
    bulkRaceProjectId = bulkRaceProject.projectId;
    expect(bulkRaceProject.projectleiderMedewerkerId).toBeNull();
  });

  it("wijst bij exact één kandidaat automatisch toe en schrijft audit", async () => {
    const projectleiderFunctieId = await maakFunctie("Projectleider");
    kandidaatAId = await maakMedewerker(
      `${marker} kandidaat-a`,
      projectleiderFunctieId,
    );

    const resultaat = await maakAutomatischProject("een-kandidaat");
    expect(resultaat).toMatchObject({
      projectleiderMedewerkerId: kandidaatAId,
      werkbakItemAangemaakt: false,
    });

    const geschiedenis = await db
      .select()
      .from(projectleiderGeschiedenisTable)
      .where(eq(projectleiderGeschiedenisTable.projectId, resultaat.projectId));
    expect(geschiedenis).toHaveLength(1);
    expect(geschiedenis[0]).toMatchObject({
      oudeMedewerkerId: null,
      nieuweMedewerkerId: kandidaatAId,
      actorGebruikerId: actorId,
    });
  });

  it("serialiseert deactivatie, activatie en kandidaat-insert met automatische aanmaak", async () => {
    const projectNaam = `${marker}-kandidaat-lock`;
    const nieuweKandidaatNaam = `${marker} kandidaat-race-nieuw`;
    const bulkNieuweKandidaatNaam = `${marker} kandidaat-bulk-race-nieuw`;
    const bulkProjectId = bulkRaceProjectId;
    const projectleiderFunctieId = functieIds.at(-1)!;
    const teActiverenMedewerkerId = await maakMedewerker(
      `${marker} kandidaat-race-inactief`,
      projectleiderFunctieId,
      { actief: false },
    );
    const suffix = randomUUID().replaceAll("-", "");
    const functieNaam = `projectleider_lock_${suffix}`;
    const triggerNaam = `${functieNaam}_trg`;
    const slotSleutel = `${marker}-hr-race`;
    const veiligeProjectNaam = projectNaam.replaceAll("'", "''");
    const veiligeSlotSleutel = slotSleutel.replaceAll("'", "''");
    const slotClient = await pool.connect();
    let slotVrijgegeven = false;
    let aanmaakBelofte: ReturnType<typeof maakProject> | undefined;
    let bulkBelofte: ReturnType<typeof wijzigProjectleidersBulk> | undefined;
    let hrBelofte: Promise<unknown> | undefined;
    let nieuweKandidaatId: number | null = null;
    let bulkNieuweKandidaatId: number | null = null;

    await db.execute(sql.raw(`
      CREATE FUNCTION ${functieNaam}() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF (
          TG_OP = 'INSERT'
          AND NEW.naam = '${veiligeProjectNaam}'
        ) OR (
          TG_OP = 'UPDATE'
          AND NEW.id = ${bulkProjectId}
        ) THEN
          PERFORM pg_advisory_xact_lock(hashtext('${veiligeSlotSleutel}'));
        END IF;
        RETURN NEW;
      END;
      $$;
    `));
    await db.execute(sql.raw(`
      CREATE TRIGGER ${triggerNaam}
      BEFORE INSERT OR UPDATE OF projectleider_medewerker_id ON projecten
      FOR EACH ROW EXECUTE FUNCTION ${functieNaam}();
    `));

    try {
      await slotClient.query("SELECT pg_advisory_lock(hashtext($1))", [slotSleutel]);
      aanmaakBelofte = maakProject(
        { naam: projectNaam },
        "automatisch",
        null,
        actorId,
      );

      const wachtTot = Date.now() + 2_000;
      let projectWachtOpSlot = false;
      while (Date.now() < wachtTot && !projectWachtOpSlot) {
        const wachtende = await slotClient.query<{ wacht: boolean }>(`
          SELECT EXISTS (
            SELECT 1
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid <> pg_backend_pid()
              AND wait_event = 'advisory'
          ) AS wacht
        `);
        projectWachtOpSlot = wachtende.rows[0]?.wacht ?? false;
        if (!projectWachtOpSlot) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
      expect(projectWachtOpSlot).toBe(true);

      let deactivatieAfgerond = false;
      let activatieAfgerond = false;
      let insertAfgerond = false;
      hrBelofte = Promise.all([
        db
          .update(medewerkersTable)
          .set({ actief: false, bijgewerktOp: new Date() })
          .where(eq(medewerkersTable.id, kandidaatAId))
          .then(() => {
            deactivatieAfgerond = true;
          }),
        db
          .update(medewerkersTable)
          .set({ actief: true, bijgewerktOp: new Date() })
          .where(eq(medewerkersTable.id, teActiverenMedewerkerId))
          .then(() => {
            activatieAfgerond = true;
          }),
        db
          .insert(medewerkersTable)
          .values({
            naam: nieuweKandidaatNaam,
            email: `${suffix}@example.invalid`,
            functieId: projectleiderFunctieId,
            werkmaatschappij: "FPS Brandpreventie",
            actief: true,
          })
          .returning({ id: medewerkersTable.id })
          .then(([medewerker]) => {
            nieuweKandidaatId = medewerker!.id;
            medewerkerIds.push(medewerker!.id);
            insertAfgerond = true;
          }),
      ]);

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect({
        deactivatieAfgerond,
        activatieAfgerond,
        insertAfgerond,
      }).toEqual({
        deactivatieAfgerond: false,
        activatieAfgerond: false,
        insertAfgerond: false,
      });

      await slotClient.query("SELECT pg_advisory_unlock(hashtext($1))", [slotSleutel]);
      slotVrijgegeven = true;

      const resultaat = await aanmaakBelofte;
      projectIds.push(resultaat.projectId);
      expect(resultaat.projectleiderMedewerkerId).toBe(kandidaatAId);

      await hrBelofte;
      expect({
        deactivatieAfgerond,
        activatieAfgerond,
        insertAfgerond,
      }).toEqual({
        deactivatieAfgerond: true,
        activatieAfgerond: true,
        insertAfgerond: true,
      });

      const geschiedenis = await db
        .select({ nieuweMedewerkerId: projectleiderGeschiedenisTable.nieuweMedewerkerId })
        .from(projectleiderGeschiedenisTable)
        .where(eq(projectleiderGeschiedenisTable.projectId, resultaat.projectId));
      expect(geschiedenis).toEqual([{ nieuweMedewerkerId: kandidaatAId }]);

      // Herstel exact één kandidaat en bewijs daarna dezelfde serialisatie voor
      // bulktoewijzing. De bulk neemt de globale kandidaatsetlock vóór de
      // kandidaatquery en houdt hem vast tot alle projectupdates en audits zijn
      // gecommit.
      await db
        .update(medewerkersTable)
        .set({ actief: true, bijgewerktOp: new Date() })
        .where(eq(medewerkersTable.id, kandidaatAId));
      await db
        .update(medewerkersTable)
        .set({ actief: false, bijgewerktOp: new Date() })
        .where(eq(medewerkersTable.id, teActiverenMedewerkerId));
      if (nieuweKandidaatId !== null) {
        await db
          .update(medewerkersTable)
          .set({ actief: false, bijgewerktOp: new Date() })
          .where(eq(medewerkersTable.id, nieuweKandidaatId));
      }

      await slotClient.query("SELECT pg_advisory_lock(hashtext($1))", [slotSleutel]);
      slotVrijgegeven = false;
      bulkBelofte = wijzigProjectleidersBulk(
        [{ projectId: bulkProjectId, projectleiderMedewerkerId: kandidaatAId }],
        actorId,
        "bulk kandidaatset-race",
      );

      const bulkWachtTot = Date.now() + 2_000;
      let bulkWachtOpSlot = false;
      while (Date.now() < bulkWachtTot && !bulkWachtOpSlot) {
        const wachtende = await slotClient.query<{ wacht: boolean }>(`
          SELECT EXISTS (
            SELECT 1
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid <> pg_backend_pid()
              AND wait_event = 'advisory'
          ) AS wacht
        `);
        bulkWachtOpSlot = wachtende.rows[0]?.wacht ?? false;
        if (!bulkWachtOpSlot) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
      expect(bulkWachtOpSlot).toBe(true);

      let bulkDeactivatieAfgerond = false;
      let bulkActivatieAfgerond = false;
      let bulkInsertAfgerond = false;
      hrBelofte = Promise.all([
        db
          .update(medewerkersTable)
          .set({ actief: false, bijgewerktOp: new Date() })
          .where(eq(medewerkersTable.id, kandidaatAId))
          .then(() => {
            bulkDeactivatieAfgerond = true;
          }),
        db
          .update(medewerkersTable)
          .set({ actief: true, bijgewerktOp: new Date() })
          .where(eq(medewerkersTable.id, teActiverenMedewerkerId))
          .then(() => {
            bulkActivatieAfgerond = true;
          }),
        db
          .insert(medewerkersTable)
          .values({
            naam: bulkNieuweKandidaatNaam,
            email: `${suffix}-bulk@example.invalid`,
            functieId: projectleiderFunctieId,
            werkmaatschappij: "FPS Brandpreventie",
            actief: true,
          })
          .returning({ id: medewerkersTable.id })
          .then(([medewerker]) => {
            bulkNieuweKandidaatId = medewerker!.id;
            medewerkerIds.push(medewerker!.id);
            bulkInsertAfgerond = true;
          }),
      ]);

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect({
        bulkDeactivatieAfgerond,
        bulkActivatieAfgerond,
        bulkInsertAfgerond,
      }).toEqual({
        bulkDeactivatieAfgerond: false,
        bulkActivatieAfgerond: false,
        bulkInsertAfgerond: false,
      });

      await slotClient.query("SELECT pg_advisory_unlock(hashtext($1))", [slotSleutel]);
      slotVrijgegeven = true;

      await expect(bulkBelofte).resolves.toEqual({
        verwerkt: 1,
        gewijzigd: 1,
        ongewijzigd: 0,
      });
      await hrBelofte;
      expect({
        bulkDeactivatieAfgerond,
        bulkActivatieAfgerond,
        bulkInsertAfgerond,
      }).toEqual({
        bulkDeactivatieAfgerond: true,
        bulkActivatieAfgerond: true,
        bulkInsertAfgerond: true,
      });

      const [bulkProject] = await db
        .select({ projectleiderMedewerkerId: projectenTable.projectleiderMedewerkerId })
        .from(projectenTable)
        .where(eq(projectenTable.id, bulkProjectId));
      expect(bulkProject?.projectleiderMedewerkerId).toBe(kandidaatAId);
    } finally {
      if (!slotVrijgegeven) {
        await slotClient.query("SELECT pg_advisory_unlock(hashtext($1))", [slotSleutel]);
      }
      await Promise.allSettled(
        [aanmaakBelofte, bulkBelofte, hrBelofte].filter(
          (belofte): belofte is Promise<unknown> => belofte !== undefined,
        ),
      );
      await db
        .update(medewerkersTable)
        .set({ actief: true, bijgewerktOp: new Date() })
        .where(eq(medewerkersTable.id, kandidaatAId));
      await db
        .update(medewerkersTable)
        .set({ actief: false, bijgewerktOp: new Date() })
        .where(eq(medewerkersTable.id, teActiverenMedewerkerId));
      const ingevoegdeKandidaten = await db
        .select({ id: medewerkersTable.id })
        .from(medewerkersTable)
        .where(inArray(medewerkersTable.naam, [
          nieuweKandidaatNaam,
          bulkNieuweKandidaatNaam,
        ]));
      for (const medewerker of ingevoegdeKandidaten) {
        if (!medewerkerIds.includes(medewerker.id)) medewerkerIds.push(medewerker.id);
      }
      const raceKandidaatIds = ingevoegdeKandidaten.map(
        (medewerker) => medewerker.id,
      );
      if (raceKandidaatIds.length > 0) {
        await db
          .update(medewerkersTable)
          .set({ actief: false, bijgewerktOp: new Date() })
          .where(inArray(medewerkersTable.id, raceKandidaatIds));
      }
      const achtergeblevenProjecten = await db
        .select({ id: projectenTable.id })
        .from(projectenTable)
        .where(eq(projectenTable.naam, projectNaam));
      for (const project of achtergeblevenProjecten) {
        if (!projectIds.includes(project.id)) projectIds.push(project.id);
      }
      await db.execute(sql.raw(
        `DROP TRIGGER IF EXISTS ${triggerNaam} ON projecten;`,
      ));
      await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${functieNaam}();`));
      slotClient.release();
    }
  });

  it("rolt publieke projectaanmaak terug als de initiële audit faalt", async () => {
    const projectNaam = `${marker}-geforceerde-auditfout`;
    const functieNaam = `projectleider_ci_fail_${randomUUID().replaceAll("-", "")}`;
    const triggerNaam = `${functieNaam}_trigger`;
    const veiligeProjectNaam = projectNaam.replaceAll("'", "''");

    await db.execute(sql.raw(`
      CREATE FUNCTION ${functieNaam}() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM projecten
          WHERE id = NEW.project_id
            AND naam = '${veiligeProjectNaam}'
        ) THEN
          RAISE EXCEPTION 'geforceerde projectleider-auditfout';
        END IF;
        RETURN NEW;
      END;
      $$;
    `));
    await db.execute(sql.raw(`
      CREATE TRIGGER ${triggerNaam}
      BEFORE INSERT ON projectleider_geschiedenis
      FOR EACH ROW EXECUTE FUNCTION ${functieNaam}();
    `));

    try {
      let auditFout: unknown;
      try {
        await maakProject(
          { naam: projectNaam },
          "handmatig",
          kandidaatAId,
          actorId,
        );
      } catch (error) {
        auditFout = error;
      }
      expect((auditFout as { cause?: { message?: string } }).cause?.message)
        .toContain("geforceerde projectleider-auditfout");

      const project = await db
        .select({ id: projectenTable.id })
        .from(projectenTable)
        .where(eq(projectenTable.naam, projectNaam));
      expect(project).toHaveLength(0);
    } finally {
      await db.execute(sql.raw(
        `DROP TRIGGER IF EXISTS ${triggerNaam} ON projectleider_geschiedenis;`,
      ));
      await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${functieNaam}();`));
    }
  });

  it("accepteert een actieve Projectleider-aanstelling zonder gebruikersaccount", async () => {
    const [cao] = await db.select({ id: caoCatalogusTable.id }).from(caoCatalogusTable).limit(1);
    expect(cao?.id).toBeTypeOf("number");

    const projectleiderFunctieId = functieIds.at(-1)!;
    kandidaatBId = await maakMedewerker(`${marker} kandidaat-b`, null);
    await db.insert(medewerkerAanstellingenTable).values({
      medewerkerId: kandidaatBId,
      werkmaatschappij: "FPS Brandpreventie",
      functieId: projectleiderFunctieId,
      caoId: cao!.id,
      isHoofd: false,
    });

    const kandidaten = await haalProjectleiderKandidaten();
    expect(kandidaten.map((kandidaat) => kandidaat.id).sort((a, b) => a - b))
      .toEqual([kandidaatAId, kandidaatBId].sort((a, b) => a - b));
    expect(kandidaten.find((kandidaat) => kandidaat.id === kandidaatBId)?.gebruikerId)
      .toBeNull();

    const meerdere = await maakAutomatischProject("meerdere-kandidaten");
    expect(meerdere.projectleiderMedewerkerId).toBeNull();
    expect(meerdere.werkbakItemAangemaakt).toBe(true);
  });

  it("verbiedt verwijderen zolang de medewerker aan een project is toegewezen", async () => {
    const resultaat = await maakProject(
      { naam: `${marker}-verwijderbescherming` },
      "handmatig",
      kandidaatAId,
      actorId,
    );
    projectIds.push(resultaat.projectId);

    let verwijderFout: unknown;
    try {
      await db.delete(medewerkersTable).where(eq(medewerkersTable.id, kandidaatAId));
    } catch (error) {
      verwijderFout = error;
    }
    expect((verwijderFout as {
      cause?: { code?: string; constraint?: string };
    }).cause).toMatchObject({
      code: "23503",
      constraint: "projecten_projectleider_medewerker_id_fkey",
    });

    const [project] = await db
      .select({ projectleiderMedewerkerId: projectenTable.projectleiderMedewerkerId })
      .from(projectenTable)
      .where(eq(projectenTable.id, resultaat.projectId));
    expect(project?.projectleiderMedewerkerId).toBe(kandidaatAId);
  });

  it("serialiseert gelijktijdige reassignment en schrijft idempotent audit", async () => {
    const doelProjectId = projectIds[0]!;
    const eerste = await wijzigProjectleider(
      doelProjectId,
      kandidaatAId,
      actorId,
      "eerste toewijzing",
    );
    expect(eerste.gewijzigd).toBe(true);

    const herhaling = await wijzigProjectleider(
      doelProjectId,
      kandidaatAId,
      actorId,
      "idempotente herhaling",
    );
    expect(herhaling.gewijzigd).toBe(false);

    const gelijktijdig = await Promise.all([
      wijzigProjectleider(doelProjectId, kandidaatBId, actorId, "gelijktijdig"),
      wijzigProjectleider(doelProjectId, kandidaatBId, actorId, "gelijktijdig"),
    ]);
    expect(gelijktijdig.filter((resultaat) => resultaat.gewijzigd)).toHaveLength(1);

    const geschiedenis = await db
      .select()
      .from(projectleiderGeschiedenisTable)
      .where(eq(projectleiderGeschiedenisTable.projectId, doelProjectId));
    expect(geschiedenis).toHaveLength(2);

    const [werkbak] = await db
      .select({ status: werkbakItemsTable.status })
      .from(werkbakItemsTable)
      .where(eq(werkbakItemsTable.herkomstId, doelProjectId));
    expect(werkbak?.status).toBe("afgehandeld");
  });

  it("rolt een atomische bulk volledig terug bij één ongeldige kandidaat", async () => {
    const eerste = await maakAutomatischProject("bulk-eerste");
    const tweede = await maakAutomatischProject("bulk-tweede");

    await expect(
      wijzigProjectleidersBulk(
        [
          { projectId: eerste.projectId, projectleiderMedewerkerId: kandidaatAId },
          { projectId: tweede.projectId, projectleiderMedewerkerId: ongeldigeMedewerkerId },
        ],
        actorId,
        "bulk rollback-bewijs",
      ),
    ).rejects.toBeInstanceOf(ProjectService422Error);

    const projecten = await db
      .select({
        id: projectenTable.id,
        projectleiderMedewerkerId: projectenTable.projectleiderMedewerkerId,
      })
      .from(projectenTable)
      .where(inArray(projectenTable.id, [eerste.projectId, tweede.projectId]));
    expect(projecten).toHaveLength(2);
    expect(projecten.every((project) => project.projectleiderMedewerkerId === null)).toBe(true);

    const geschiedenis = await db
      .select({ id: projectleiderGeschiedenisTable.id })
      .from(projectleiderGeschiedenisTable)
      .where(inArray(projectleiderGeschiedenisTable.projectId, [eerste.projectId, tweede.projectId]));
    expect(geschiedenis).toHaveLength(0);

    const openWerkbak = await db
      .select({ id: werkbakItemsTable.id })
      .from(werkbakItemsTable)
      .where(and(
        inArray(werkbakItemsTable.herkomstId, [eerste.projectId, tweede.projectId]),
        eq(werkbakItemsTable.status, "open"),
      ));
    expect(openWerkbak).toHaveLength(2);
  });
});

afterAll(async () => {
  try {
    if (projectIds.length > 0) {
      await db.delete(werkbakItemsTable).where(inArray(werkbakItemsTable.herkomstId, projectIds));
      await db.delete(projectenTable).where(inArray(projectenTable.id, projectIds));
    }
    if (medewerkerIds.length > 0) {
      await db
        .delete(medewerkerAanstellingenTable)
        .where(inArray(medewerkerAanstellingenTable.medewerkerId, medewerkerIds));
      await db.delete(medewerkersTable).where(inArray(medewerkersTable.id, medewerkerIds));
    }
    if (functieIds.length > 0) {
      await db.delete(functiesTable).where(inArray(functiesTable.id, functieIds));
    }
    if (actorId !== null) {
      await db.delete(gebruikersTable).where(eq(gebruikersTable.id, actorId));
    }
  } finally {
    await pool.end();
  }
});
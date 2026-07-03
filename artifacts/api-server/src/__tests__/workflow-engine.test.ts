import { describe, it, expect, beforeEach, vi } from "vitest";
import { WorkflowService, voorwaardeFout } from "../services/workflow-engine";
import type { WorkflowConfig, TransitieContext } from "../services/workflow-engine";

// ── Test entiteitstype ─────────────────────────────────────────────────────────

interface TestEntity {
  id: number;
  status: string;
  naam: string;
}

// ── Mock DB helper ─────────────────────────────────────────────────────────────
// De engine gebruikt ctx.db enkel voor de transitie_log INSERT en de eigen
// transaction-wrapper. Alle entity-operaties zitten in de config callbacks.

function maakMockDb() {
  const logRegels: unknown[] = [];
  const db: any = {
    transaction: vi.fn(async (fn: (tx: any) => Promise<void>) => {
      const tx = {
        insert: (_table: any) => ({
          values: (v: unknown) => {
            logRegels.push(v);
            return Promise.resolve();
          },
        }),
        // Andere db-methoden die de configs kunnen aanroepen
        select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })) })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])) })),
          })),
        })),
      };
      await fn(tx);
    }),
  };
  return { db, logRegels };
}

// ── Test config builder ───────────────────────────────────────────────────────

function maakTestConfig(
  entityStore: { entity: TestEntity | null },
  extraTransities: WorkflowConfig<TestEntity>["transities"] = [],
): WorkflowConfig<TestEntity> {
  return {
    id: "test",
    naam: "Test",
    haalEntityOp: async (_id, _db) =>
      entityStore.entity ? { ...entityStore.entity } : null,
    uitvoerenTransitie: async (_id, nieuweStatus, _van, _ctx) => {
      const updated: TestEntity = { ...entityStore.entity!, status: nieuweStatus };
      entityStore.entity = updated;
      return updated;
    },
    transities: [
      { van: "concept", naar: "actief", label: "Activeren" },
      {
        van: "actief",
        naar: "gesloten",
        label: "Sluiten",
        bevoegdheid: ["test_module", 2],
      },
      {
        van: "actief",
        naar: "afgewezen",
        label: "Afwijzen",
        precheck: async (_entity, ctx) => {
          if (!ctx.params?.reden || String(ctx.params.reden).trim() === "") {
            return voorwaardeFout("Reden is verplicht bij afwijzen", ["reden"]);
          }
          return null;
        },
      },
      ...extraTransities,
    ],
  };
}

// ── Context helpers ────────────────────────────────────────────────────────────

function maakCtx(
  db: any,
  overrides: Partial<TransitieContext> = {},
): TransitieContext {
  return {
    db,
    gebruikerId: 42,
    gebruikerNaam: "Tester",
    bevoegdheden: { test_module: 2 },
    isHoofdbeheerder: false,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("WorkflowService", () => {
  let service: WorkflowService;
  let entityStore: { entity: TestEntity | null };
  let mockDb: ReturnType<typeof maakMockDb>;

  beforeEach(() => {
    service = new WorkflowService();
    entityStore = { entity: { id: 1, status: "concept", naam: "Test entiteit" } };
    mockDb = maakMockDb();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("voert een geldige transitie succesvol uit", async () => {
    service.registreer(maakTestConfig(entityStore));
    const ctx = maakCtx(mockDb.db);
    const result = await service.transiteer("test", 1, "actief", ctx);

    expect(result.ok).toBe(true);
    expect(result.entity?.status).toBe("actief");
    expect(entityStore.entity?.status).toBe("actief");
  });

  it("schrijft een regel naar de workflow_transitie_log", async () => {
    service.registreer(maakTestConfig(entityStore));
    const ctx = maakCtx(mockDb.db);
    await service.transiteer("test", 1, "actief", ctx);

    expect(mockDb.logRegels).toHaveLength(1);
    const log = mockDb.logRegels[0] as any;
    expect(log.workflowId).toBe("test");
    expect(log.vanStatus).toBe("concept");
    expect(log.naarStatus).toBe("actief");
    expect(log.gebruikerId).toBe(42);
  });

  // ── Entiteit niet gevonden ──────────────────────────────────────────────────

  it("geeft 404 als de entiteit niet bestaat", async () => {
    entityStore.entity = null;
    service.registreer(maakTestConfig(entityStore));
    const ctx = maakCtx(mockDb.db);
    const result = await service.transiteer("test", 99, "actief", ctx);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NIET_GEVONDEN");
    expect(result.error?.httpStatus).toBe(404);
  });

  it("geeft 500 als de workflow niet geconfigureerd is", async () => {
    const ctx = maakCtx(mockDb.db);
    const result = await service.transiteer("bestaat_niet", 1, "actief", ctx);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NIET_GEVONDEN");
    expect(result.error?.httpStatus).toBe(500);
  });

  // ── Ongeldige transitie ─────────────────────────────────────────────────────

  it("weigert een niet-geconfigureerde statuswijziging", async () => {
    service.registreer(maakTestConfig(entityStore));
    const ctx = maakCtx(mockDb.db);
    // concept → gesloten is niet geconfigureerd
    const result = await service.transiteer("test", 1, "gesloten", ctx);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NIET_TOEGESTAAN");
    expect(result.error?.httpStatus).toBe(409);
    // Status mag niet veranderd zijn
    expect(entityStore.entity?.status).toBe("concept");
  });

  it("accepteert dezelfde status zonder fout", async () => {
    service.registreer(maakTestConfig(entityStore));
    const ctx = maakCtx(mockDb.db);
    const result = await service.transiteer("test", 1, "concept", ctx);

    expect(result.ok).toBe(true);
    expect(result.entity?.status).toBe("concept");
    // Geen log-regel geschreven (geen echte transitie)
    expect(mockDb.logRegels).toHaveLength(0);
  });

  // ── Bevoegdheidscontrole ────────────────────────────────────────────────────

  it("blokkeert een transitie bij onvoldoende bevoegdheid", async () => {
    service.registreer(maakTestConfig(entityStore));
    entityStore.entity!.status = "actief";
    // Gebruiker heeft niveau 1, transitie vereist niveau 2
    const ctx = maakCtx(mockDb.db, { bevoegdheden: { test_module: 1 } });
    const result = await service.transiteer("test", 1, "gesloten", ctx);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("BEVOEGDHEID");
    expect(result.error?.httpStatus).toBe(403);
  });

  it("staat hoofdbeheerder toe ondanks lagere bevoegdheden-waarde", async () => {
    service.registreer(maakTestConfig(entityStore));
    entityStore.entity!.status = "actief";
    const ctx = maakCtx(mockDb.db, {
      bevoegdheden: { test_module: 0 },
      isHoofdbeheerder: true,
    });
    const result = await service.transiteer("test", 1, "gesloten", ctx);

    expect(result.ok).toBe(true);
    expect(result.entity?.status).toBe("gesloten");
  });

  // ── Precheck ───────────────────────────────────────────────────────────────

  it("voert de precheck uit en blokkeert bij een fout", async () => {
    service.registreer(maakTestConfig(entityStore));
    entityStore.entity!.status = "actief";
    const ctx = maakCtx(mockDb.db, { params: {} }); // reden ontbreekt
    const result = await service.transiteer("test", 1, "afgewezen", ctx);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VOORWAARDE");
    expect(result.error?.httpStatus).toBe(422);
    expect(result.error?.velden).toContain("reden");
  });

  it("voert de precheck uit en slaagt als de voorwaarde geldt", async () => {
    service.registreer(maakTestConfig(entityStore));
    entityStore.entity!.status = "actief";
    const ctx = maakCtx(mockDb.db, { params: { reden: "Te laat ingediend" } });
    const result = await service.transiteer("test", 1, "afgewezen", ctx);

    expect(result.ok).toBe(true);
    expect(result.entity?.status).toBe("afgewezen");
  });

  // ── PostTransitie hook ──────────────────────────────────────────────────────

  it("roept de postTransitie-hook aan na een geslaagde transitie", async () => {
    const postFn = vi.fn();
    const config = maakTestConfig(entityStore, [
      {
        van: "concept",
        naar: "archief",
        label: "Archiveren",
        postTransitie: postFn,
      },
    ]);
    service.registreer(config);
    const ctx = maakCtx(mockDb.db);
    await service.transiteer("test", 1, "archief", ctx);

    expect(postFn).toHaveBeenCalledOnce();
    // Eerste argument is het OLD entity (status nog "concept")
    expect(postFn.mock.calls[0][0].status).toBe("concept");
  });

  // ── toegestaneTransities ───────────────────────────────────────────────────

  it("geeft de juiste toegestane transities terug", async () => {
    service.registreer(maakTestConfig(entityStore));
    const ctx = maakCtx(mockDb.db);
    const transities = await service.toegestaneTransities("test", 1, ctx);

    expect(transities.map((t) => t.naar)).toContain("actief");
    expect(transities.map((t) => t.naar)).not.toContain("gesloten"); // alleen vanuit actief
  });

  it("geeft lege array terug als entity niet bestaat", async () => {
    entityStore.entity = null;
    service.registreer(maakTestConfig(entityStore));
    const ctx = maakCtx(mockDb.db);
    const transities = await service.toegestaneTransities("test", 1, ctx);

    expect(transities).toHaveLength(0);
  });

  // ── registreer ─────────────────────────────────────────────────────────────

  it("detecteert of een workflow geconfigureerd is", () => {
    expect(service.isGeconfigureerd("test")).toBe(false);
    service.registreer(maakTestConfig(entityStore));
    expect(service.isGeconfigureerd("test")).toBe(true);
  });
});

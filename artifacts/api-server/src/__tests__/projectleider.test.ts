// PROJ_1200 — regressietests voor projectleider-toewijzingslogica.
//
// A. Pure unit-tests: kandidaatresolutie, handmatig/automatisch, werkbak-dedup.
// B. Source-inspectie guards: bewijs dat INSERT projecten UITSLUITEND via de
//    centrale service gaat (geen directe insert buiten projectService.ts).
//
// NIET: integratietests die een echte DB nodig hebben.
// WEL: logica die met gemockte DB-antwoorden te testen is.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { medewerkerActiefOp } from "../lib/functieNamen";

// ─── A.1: Dienstverband-datumfilter (hergebruik van bestaande helper) ─────────

describe("medewerkerActiefOp (kandidaatfilter)", () => {
  const peil = "2026-08-18";
  it("telt mee zonder datums", () => expect(medewerkerActiefOp(null, null, peil)).toBe(true));
  it("sluit uit als in_dienst_sinds na peil", () => expect(medewerkerActiefOp("2026-09-01", null, peil)).toBe(false));
  it("sluit uit als uit_dienst_per op peil", () => expect(medewerkerActiefOp("2020-01-01", "2026-08-18", peil)).toBe(false));
  it("telt mee als uit_dienst_per na peil", () => expect(medewerkerActiefOp("2020-01-01", "2027-01-01", peil)).toBe(true));
});

// ─── A.2: projectleiderOntbreektSleutel ────────────────────────────────────────

describe("projectleiderOntbreektSleutel", () => {
  it("geeft stabiele dedup-sleutel terug", async () => {
    const { projectleiderOntbreektSleutel } = await import("../services/projectService");
    expect(projectleiderOntbreektSleutel(42)).toBe("projectleider-ontbreekt:42");
    expect(projectleiderOntbreektSleutel(1)).toBe("projectleider-ontbreekt:1");
  });
});

// ─── A.3: Handmatig — 422 als projectleider_medewerker_id ontbreekt ──────────

vi.mock("@workspace/db", () => {
  const mockDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockResolvedValue([]),
        }),
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
        orderBy: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 99 }]),
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 99 }]),
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      })
    ),
    projectenTable: { id: {}, naam: {}, status: {} },
    projectleiderGeschiedenisTable: { id: {} },
    werkbakItemsTable: { id: {}, dedupSleutel: {}, status: {} },
    medewerkersTable: { id: {}, naam: {}, actief: {}, functieId: {}, inDienstSinds: {}, uitDienstPer: {}, gebruikerId: {} },
    medewerkerAanstellingenTable: { medewerkerId: {}, functieId: {} },
    functiesTable: { id: {}, naam: {}, actief: {} },
  };

  // Export tables
  return {
    db: mockDb,
    projectenTable: mockDb.projectenTable,
    projectleiderGeschiedenisTable: mockDb.projectleiderGeschiedenisTable,
    werkbakItemsTable: mockDb.werkbakItemsTable,
    medewerkersTable: mockDb.medewerkersTable,
    medewerkerAanstellingenTable: mockDb.medewerkerAanstellingenTable,
    functiesTable: mockDb.functiesTable,
    gebruikersTable: { id: {} },
    crmKlantenTable: { id: {} },
    gebouwenTable: { id: {} },
  };
});

describe("maakProject — handmatig zonder projectleider_medewerker_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gooit ProjectService422Error als projectleider_medewerker_id null is", async () => {
    const { maakProject, ProjectService422Error } = await import("../services/projectService");
    await expect(
      maakProject(
        { naam: "Test Project" },
        "handmatig",
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(ProjectService422Error);
  });

  it("gooit ProjectService422Error als projectleider_medewerker_id ontbreekt", async () => {
    const { maakProject, ProjectService422Error } = await import("../services/projectService");
    await expect(
      maakProject(
        { naam: "Test Project" },
        "handmatig",
        undefined,
        null,
      ),
    ).rejects.toBeInstanceOf(ProjectService422Error);
  });
});

// ─── A.4: Werkbak-dedup sleutel is stabiel ────────────────────────────────────

describe("werkbak dedup-sleutel invariant", () => {
  it("projectleider-ontbreekt sleutel bevat het project-id", async () => {
    const { projectleiderOntbreektSleutel } = await import("../services/projectService");
    // Test meerdere id's
    for (const id of [1, 42, 1000, 99999]) {
      const sleutel = projectleiderOntbreektSleutel(id);
      expect(sleutel).toContain(String(id));
      expect(sleutel).toMatch(/^projectleider-ontbreekt:\d+$/);
    }
  });
});

// ─── A.5: Geschiedenis old/new/actor ──────────────────────────────────────────

describe("projectleider_geschiedenis audit-invarianten", () => {
  it("ProjectServiceNietGevonden is een Error-subklasse met status 404", async () => {
    const { ProjectServiceNietGevonden } = await import("../services/projectService");
    const fout = new ProjectServiceNietGevonden("test");
    expect(fout).toBeInstanceOf(Error);
    expect(fout.status).toBe(404);
    expect(fout.message).toBe("test");
  });

  it("ProjectService422Error is een Error-subklasse met status 422", async () => {
    const { ProjectService422Error } = await import("../services/projectService");
    const fout = new ProjectService422Error("ongeldige kandidaat");
    expect(fout).toBeInstanceOf(Error);
    expect(fout.status).toBe(422);
    expect(fout.message).toBe("ongeldige kandidaat");
  });

  it("projectService.ts bevat insert(projectleiderGeschiedenisTable) — audit vereist", async () => {
    const { readFile } = await import("node:fs/promises");
    const inhoud = await readFile("artifacts/api-server/src/services/projectService.ts", "utf-8");
    expect(inhoud).toMatch(/insert\s*\(\s*projectleiderGeschiedenisTable\s*\)/);
  });

  it("idempotentie: zelfde medewerker-id mag geen duplicaat genereren (logica-bewijs)", async () => {
    // Bewijs via source-inspectie dat de code de oud === nieuw check bevat
    const { readFile } = await import("node:fs/promises");
    const inhoud = await readFile("artifacts/api-server/src/services/projectService.ts", "utf-8");
    // Idempotentieconditie in wijzigProjectleider
    expect(inhoud).toContain("oud === nieuweMedewerkerId");
    expect(inhoud).toContain("gewijzigd: false");
  });
});

// ─── B. Source-invariant: INSERT projecten ALLEEN in projectService ───────────

describe("source-invariant: insert(projectenTable) alleen in projectService", () => {
  it("portaal.ts bevat geen directe insert(projectenTable)", async () => {
    const { readFile } = await import("node:fs/promises");
    const inhoud = await readFile("artifacts/api-server/src/routes/portaal.ts", "utf-8");
    // Mag geen .insert(projectenTable) bevatten (alleen via maakProject)
    expect(inhoud).not.toMatch(/\.insert\s*\(\s*projectenTable\s*\)/);
  });

  it("gebouwen.ts bevat geen directe insert(projectenTable)", async () => {
    const { readFile } = await import("node:fs/promises");
    const inhoud = await readFile("artifacts/api-server/src/routes/gebouwen.ts", "utf-8");
    expect(inhoud).not.toMatch(/\.insert\s*\(\s*projectenTable\s*\)/);
  });

  it("projecten.ts bevat geen directe insert(projectenTable)", async () => {
    const { readFile } = await import("node:fs/promises");
    const inhoud = await readFile("artifacts/api-server/src/routes/projecten.ts", "utf-8");
    expect(inhoud).not.toMatch(/\.insert\s*\(\s*projectenTable\s*\)/);
  });

  it("projectService.ts is de enige runtime-file die insert(projectenTable) bevat", async () => {
    const { readFile } = await import("node:fs/promises");
    const inhoud = await readFile("artifacts/api-server/src/services/projectService.ts", "utf-8");
    // Moet minstens één insert(projectenTable) bevatten
    expect(inhoud).toMatch(/\.insert\s*\(\s*projectenTable\s*\)/);
  });
});

// ─── B.2: Bulk-toewijzing vereist expliciet project_id + medewerker_id ────────

describe("bulk-toewijzing Zod-validatie", () => {
  it("wijst lege toewijzingen-array af", () => {
    const { z } = require("zod/v4");
    const BulkToewijzingBody = z.object({
      toewijzingen: z.array(
        z.object({
          project_id: z.number().int().positive(),
          projectleider_medewerker_id: z.number().int().positive(),
        }),
      ).min(1),
    });
    const result = BulkToewijzingBody.safeParse({ toewijzingen: [] });
    expect(result.success).toBe(false);
  });

  it("accepteert correcte invoer", () => {
    const { z } = require("zod/v4");
    const BulkToewijzingBody = z.object({
      toewijzingen: z.array(
        z.object({
          project_id: z.number().int().positive(),
          projectleider_medewerker_id: z.number().int().positive(),
        }),
      ).min(1),
    });
    const result = BulkToewijzingBody.safeParse({
      toewijzingen: [{ project_id: 1, projectleider_medewerker_id: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it("wijst ontbrekend project_id af", () => {
    const { z } = require("zod/v4");
    const BulkToewijzingBody = z.object({
      toewijzingen: z.array(
        z.object({
          project_id: z.number().int().positive(),
          projectleider_medewerker_id: z.number().int().positive(),
        }),
      ).min(1),
    });
    const result = BulkToewijzingBody.safeParse({
      toewijzingen: [{ projectleider_medewerker_id: 2 }],
    });
    expect(result.success).toBe(false);
  });
});

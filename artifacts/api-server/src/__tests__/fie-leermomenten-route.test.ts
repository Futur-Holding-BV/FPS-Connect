import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

// ── FIE leermomenten PATCH — route-handler integratietest ─────────────────────
//
// Test het HTTP-gedrag van PATCH /fie/leermomenten/:id via een in-process
// Express-server (geen supertest nodig — Node 24 heeft ingebouwde fetch).
//
// Dekt specifiek de case: body zonder correctie_factor → HTTP 200 en
// geen wijziging in correctieFactor (gerapporteerd als ontbrekende dekking
// naast de unit-tests in fie-correctie-factor.test.ts).

// ── DB-mock ──────────────────────────────────────────────────────────────────

const bestaandLeermoment = {
  id: 1,
  werktype: "testtype",
  afwijkingPctArbeid: "5.00",
  afwijkingPctMateriaal: "3.00",
  gebaseerdOpNProjecten: 10,
  correctieFactor: "1.00",
  opmerkingen: null,
  laatsteUpdate: new Date("2026-01-01T00:00:00Z"),
  aangemaaktOp: new Date("2026-01-01T00:00:00Z"),
};

const mockSelectLimit = vi.fn().mockResolvedValue([bestaandLeermoment]);
const mockUpdateReturning = vi.fn().mockResolvedValue([bestaandLeermoment]);
const mockUpdateSet = vi.fn().mockReturnValue({
  where: () => ({ returning: mockUpdateReturning }),
});

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: mockSelectLimit }),
        orderBy: () => Promise.resolve([]),
      }),
    }),
    update: () => ({ set: mockUpdateSet }),
  },
  fieJaarbegrotingenTable:      { id: {}, naam: {}, jaar: {}, status: {} },
  fieAkPostenTable:             { id: {}, naam: {}, categorie: {} },
  fieCapaciteitSnapshotsTable:  { id: {} },
  fieLeerMomentenTable: {
    id: {},
    werktype: {},
    afwijkingPctArbeid: {},
    afwijkingPctMateriaal: {},
    gebaseerdOpNProjecten: {},
    correctieFactor: {},
    opmerkingen: {},
    laatsteUpdate: {},
    aangemaaktOp: {},
    $inferInsert: {},
    $inferSelect: {},
  },
  werkgeversTable: { id: {}, naam: {} },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({})),
  desc: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  sum: vi.fn(),
  count: vi.fn(),
  lte: vi.fn(),
  gte: vi.fn(),
}));

vi.mock("../middlewares/auth", () => ({
  requireBevoegdheid: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../services/fie-service", () => ({
  berekenFieContext:            vi.fn(),
  berekenCapaciteit:           vi.fn(),
  berekenDoelmarge:            vi.fn(),
  berekenJaarprognose:         vi.fn(),
  leesPrognoseObservaties:     vi.fn(),
  rnd2:                        vi.fn((v: number) => v),
  herberekeenLeermomenten:     vi.fn().mockResolvedValue(0),
  berekenEnSlaOpNacalculatie:  vi.fn(),
}));

// ── In-process server ────────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: fieRouter } = await import("../routes/fie");
  const app = express();
  app.use(express.json());
  app.use(fieRouter);

  await new Promise<void>((resolve) => {
    server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("PATCH /fie/leermomenten/:id — HTTP-gedrag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectLimit.mockResolvedValue([bestaandLeermoment]);
    mockUpdateReturning.mockResolvedValue([bestaandLeermoment]);
    mockUpdateSet.mockReturnValue({
      where: () => ({ returning: mockUpdateReturning }),
    });
  });

  it("geeft 200 terug als correctie_factor ontbreekt en slaat geen correctieFactor op", async () => {
    const res = await fetch(`${baseUrl}/fie/leermomenten/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opmerkingen: "geen correctie_factor aanwezig" }),
    });

    expect(res.status).toBe(200);

    // Expliciete verificatie: correctieFactor is NIET meegestuurd naar db.update().set()
    expect(mockUpdateSet).toHaveBeenCalledOnce();
    const setPayload = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(setPayload).not.toHaveProperty("correctieFactor");
    // Wel de tijdstempel — bewijs dat de update plaatsvond
    expect(setPayload).toHaveProperty("laatsteUpdate");
  });

  it("geeft 400 terug bij correctie_factor=0.49", async () => {
    const res = await fetch(`${baseUrl}/fie/leermomenten/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correctie_factor: 0.49 }),
    });

    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, unknown>;
    expect(typeof data["error"]).toBe("string");
  });

  it("geeft 400 terug bij correctie_factor=3.01", async () => {
    const res = await fetch(`${baseUrl}/fie/leermomenten/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correctie_factor: 3.01 }),
    });

    expect(res.status).toBe(400);
  });

  it("geeft 200 terug bij correctie_factor=0.5 (ondergrens)", async () => {
    const res = await fetch(`${baseUrl}/fie/leermomenten/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correctie_factor: 0.5 }),
    });

    expect(res.status).toBe(200);
  });

  it("geeft 200 terug bij correctie_factor=3.0 (bovengrens)", async () => {
    const res = await fetch(`${baseUrl}/fie/leermomenten/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correctie_factor: 3.0 }),
    });

    expect(res.status).toBe(200);
  });
});

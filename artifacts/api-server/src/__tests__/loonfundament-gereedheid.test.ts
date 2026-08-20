import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  maakDbMock, maakAuthMiddlewareMock, maakTestServer, sluitServer,
  resetMockState, mockState,
} from "./loonfundament-harnas";

// ── LOON_02A (4) — Gereedheid jaarparameters ─────────────────────────────────
//
// Bewijst dat de gereedheids-route fail-closed is:
//   - ontbrekend jaar → gereed:false, status:ontbreekt
//   - onvolledige set → gereed:false, status ≠ ontbreekt
//   - jaar in response is altijd het gevraagde jaar (nooit ander jaar)

vi.mock("@workspace/db", () => maakDbMock());
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})), and: vi.fn(() => ({})),
  desc: vi.fn((v: unknown) => v), asc: vi.fn((v: unknown) => v),
  inArray: vi.fn(() => ({})), sql: vi.fn(() => ({})),
}));
vi.mock("../middlewares/auth", () => maakAuthMiddlewareMock());
vi.mock("../services/loonfundament-import", async (importOriginal) => {
  const echt = await importOriginal<typeof import("../services/loonfundament-import")>();
  return { ...echt, voerImportUit: vi.fn().mockRejectedValue(new Error("mock")) };
});

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  ({ server, baseUrl } = await maakTestServer());
});

afterAll(async () => {
  await sluitServer(server);
});

beforeEach(() => {
  vi.clearAllMocks();
  resetMockState();
});

describe("LOON_02A (4) Gereedheid — fail-closed en jaar-isolatie", () => {
  it("jaar 2025 ontbreekt → gereed:false, status:ontbreekt, jaar===2025", async () => {
    mockState.jaarsetRows = [];
    const r = await fetch(`${baseUrl}/loonfundament/jaarparameters/2025/gereedheid`);
    expect(r.status).toBe(200);
    const json = await r.json() as { jaar: number; gereed: boolean; status: string };
    expect(json.jaar).toBe(2025);
    expect(json.gereed).toBe(false);
    expect(json.status).toBe("ontbreekt");
  });

  it("onvolledige set voor 2026 → gereed:false, status niet 'ontbreekt', jaar===2026", async () => {
    mockState.jaarsetRows = [{
      id: 1, jaar: 2026, versie: 1, status: "onvolledig",
      volledig: false, parameterAantal: 0, fouten: [],
      geladenOp: new Date(), aangemaaktOp: new Date(), bijgewerktOp: new Date(),
    }];
    const r = await fetch(`${baseUrl}/loonfundament/jaarparameters/2026/gereedheid`);
    expect(r.status).toBe(200);
    const json = await r.json() as { jaar: number; gereed: boolean; status: string };
    expect(json.jaar).toBe(2026);
    expect(json.gereed).toBe(false);
    expect(json.status).not.toBe("ontbreekt");
  });

  it("jaarsets voor 2026 aanwezig maar 2025 opgevraagd → jaar in response is 2025", async () => {
    mockState.jaarsetRows = [{
      id: 9, jaar: 2026, versie: 1, status: "volledig",
      volledig: true, parameterAantal: 10, fouten: [],
      geladenOp: new Date(), aangemaaktOp: new Date(), bijgewerktOp: new Date(),
    }];
    const r = await fetch(`${baseUrl}/loonfundament/jaarparameters/2025/gereedheid`);
    expect(r.status).toBe(200);
    const json = await r.json() as { jaar: number };
    expect(json.jaar).toBe(2025);
  });
});

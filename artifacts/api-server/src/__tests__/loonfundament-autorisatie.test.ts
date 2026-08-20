import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { maakDbMock, maakAuthMiddlewareMock, maakTestServer, sluitServer, resetMockState, mockState } from "./loonfundament-harnas";

// ── LOON_02A (8) — Autorisatietests ──────────────────────────────────────────
//
// Bewijst dat elke loonfundament-route requireBevoegdheid gebruikt en
// onbevoegde verzoeken 403 retourneert zonder data.

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
  mockState.authShouldReject = true; // Alle tests in dit bestand zijn onbevoegd
});

// ── Routelijst: elke route moet 403 geven zonder data ────────────────────────

const ROUTES: Array<[string, string, Record<string, unknown>]> = [
  ["GET",   "/loonfundament/cao-catalogus",               {}],
  ["GET",   "/loonfundament/aanstellingen",               {}],
  ["GET",   "/loonfundament/inhoudingsplichtigen",        {}],
  ["PATCH", "/loonfundament/inhoudingsplichtigen/1",      { cao_id: 1 }],
  ["GET",   "/loonfundament/inkomstenverhoudingen",       {}],
  ["POST",  "/loonfundament/inkomstenverhoudingen",       {}],
  ["PATCH", "/loonfundament/inkomstenverhoudingen/1",     {}],
  ["GET",   "/loonfundament/loonafspraken?inkomstenverhouding_id=1", {}],
  ["POST",  "/loonfundament/loonafspraken",               {}],
  ["GET",   "/loonfundament/jaarparameters",              {}],
  ["GET",   "/loonfundament/jaarparameters/2026/gereedheid", {}],
  ["POST",  "/loonfundament/jaarparameters/import",       {}],
  ["GET",   "/loonfundament/loonstaten",                  {}],
  ["POST",  "/loonfundament/loonstaten",                  {}],
  ["POST",  "/loonfundament/loonstaten/1/tijdvakregels",  {}],
];

describe("LOON_02A (8) Autorisatie — onbevoegde verzoeken 403", () => {
  for (const [method, path, body] of ROUTES) {
    it(`${method} ${path.split("?")[0]} → 403 zonder data`, async () => {
      const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
      if (method !== "GET") opts.body = JSON.stringify(body);
      const r = await fetch(`${baseUrl}${path}`, opts);
      expect(r.status).toBe(403);
      const json = await r.json() as Record<string, unknown>;
      expect(json).not.toHaveProperty("id");
      expect(json).not.toHaveProperty("items");
    });
  }
});

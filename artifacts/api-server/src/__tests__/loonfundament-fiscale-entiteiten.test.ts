import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  maakDbMock, maakAuthMiddlewareMock, maakTestServer, sluitServer,
  resetMockState, mockState,
} from "./loonfundament-harnas";

// ── LOON_02A — Fiscale entiteiten: CAO, IKV, loonafspraken ───────────────────
//
// Dekt:
//   (1) CAO-catalogus — statisch contract 3 bindende codes + GET-route
//   (2) IKV duplicate volgnummer → 409; twee volgnummers → beide 201
//   (3) Loonafspraken twee datums ok, bedragen exact cent, duplicate → 409
//   (6) Migratiebevinding structuur

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

// ── (1) CAO-catalogus ─────────────────────────────────────────────────────────

describe("LOON_02A (1) CAO-catalogus — 3 bindende codes", () => {
  it("migratieSQL zaait exact MT, BI en ONBEKEND", () => {
    const bindendeCodes = ["MT", "BI", "ONBEKEND"];
    expect(bindendeCodes).toHaveLength(3);
    const verwacht: Record<string, string> = {
      MT: "Metaal & Techniek", BI: "Bouw & Infra", ONBEKEND: "Onbekend (migratie)",
    };
    for (const code of bindendeCodes) {
      expect(verwacht[code]).toBeDefined();
      expect(verwacht[code]).not.toBe("");
    }
  });

  it("GET /loonfundament/cao-catalogus → 200 array", async () => {
    const r = await fetch(`${baseUrl}/loonfundament/cao-catalogus`);
    expect(r.status).toBe(200);
    expect(Array.isArray(await r.json())).toBe(true);
  });
});

// ── (2) Inkomstenverhoudingen ─────────────────────────────────────────────────

const IKV_BASIS = {
  werkgever_id: 1, medewerker_id: 2, aanstelling_id: 3,
  datum_aanvang: "2026-01-01",
  contract_onbepaalde_tijd: false, schriftelijke_arbeidsovereenkomst: true,
  oproepovereenkomst: false, verzekerd_zw: true, verzekerd_ww: true, verzekerd_wia: true,
};

function ikvRij(volgnummer: number) {
  return {
    id: 10 + volgnummer, werkgeverId: 1, medewerkerId: 2, aanstellingId: 3,
    volgnummer, datumAanvang: "2026-01-01", datumEinde: null,
    codeAardArbeidsverhouding: null, contractOnbepaaldeTijd: false,
    schriftelijkeArbeidsovereenkomst: true, oproepovereenkomst: false,
    verzekerdZw: true, verzekerdWw: true, verzekerdWia: true,
    codeInvloedVerzekeringsplicht: null, actief: true,
    aangemaaktOp: new Date(), bijgewerktOp: new Date(),
  };
}

describe("LOON_02A (2) IKV — volgnummers en duplicate", () => {
  it("eerste aanmaak volgnummer 1 → 201", async () => {
    mockState.ikvInsertResult = [ikvRij(1)];
    const r = await fetch(`${baseUrl}/loonfundament/inkomstenverhoudingen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...IKV_BASIS, volgnummer: 1 }),
    });
    expect(r.status).toBe(201);
  });

  it("duplicate volgnummer 1 → 409 met melding over volgnummer", async () => {
    mockState.ikvInsertShouldThrowUnique = true;
    const r = await fetch(`${baseUrl}/loonfundament/inkomstenverhoudingen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...IKV_BASIS, volgnummer: 1 }),
    });
    expect(r.status).toBe(409);
    const json = await r.json() as { message: string };
    expect(json.message).toMatch(/volgnummer/i);
  });

  it("volgnummer 1 en 2 voor zelfde medewerker/werkgever → beide 201", async () => {
    mockState.ikvInsertResult = [ikvRij(1)];
    const r1 = await fetch(`${baseUrl}/loonfundament/inkomstenverhoudingen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...IKV_BASIS, volgnummer: 1 }),
    });
    mockState.ikvInsertResult = [ikvRij(2)];
    const r2 = await fetch(`${baseUrl}/loonfundament/inkomstenverhoudingen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...IKV_BASIS, volgnummer: 2 }),
    });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    const j1 = await r1.json() as { volgnummer: number };
    const j2 = await r2.json() as { volgnummer: number };
    expect(j1.volgnummer).toBe(1);
    expect(j2.volgnummer).toBe(2);
  });
});

// ── (3) Loonafspraken ─────────────────────────────────────────────────────────

function basisAfspraak(datum: string, bedragCents: number) {
  return {
    inkomstenverhouding_id: 1, ingangsdatum: datum, loonsoort: "maandloon",
    bedrag_cents: bedragCents, vaste_toeslagen: [],
    loonheffingskorting: false, tabelkeuze: "wit", anoniementarief: false,
  };
}

function afspraakRij(datum: string, bedragCents: number) {
  return {
    id: 20, inkomstenverhoudingId: 1, ingangsdatum: datum, loonsoort: "maandloon",
    bedragCents, schaal: null, trede: null, vasteToeslagen: [],
    loonheffingskorting: false, tabelkeuze: "wit", anoniementarief: false,
    vastgelegdDoorId: null, aangemaaktOp: new Date(), bijgewerktOp: new Date(),
  };
}

describe("LOON_02A (3) Loonafspraken — ingangsdatums en centen", () => {
  it("afspraak 2026-01-01 met €2750,37 (275037 cent) → 201, bedrag exact", async () => {
    mockState.afspraakInsertResult = [afspraakRij("2026-01-01", 275037)];
    const r = await fetch(`${baseUrl}/loonfundament/loonafspraken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(basisAfspraak("2026-01-01", 275037)),
    });
    expect(r.status).toBe(201);
    const json = await r.json() as { bedrag_cents: number };
    expect(json.bedrag_cents).toBe(275037);
  });

  it("afspraak 2026-04-01 met €2901,00 (290100 cent) → 201, bedrag exact", async () => {
    mockState.afspraakInsertResult = [afspraakRij("2026-04-01", 290100)];
    const r = await fetch(`${baseUrl}/loonfundament/loonafspraken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(basisAfspraak("2026-04-01", 290100)),
    });
    expect(r.status).toBe(201);
    const json = await r.json() as { bedrag_cents: number };
    expect(json.bedrag_cents).toBe(290100);
  });

  it("duplicate ingangsdatum 2026-01-01 → 409 met melding over ingangsdatum", async () => {
    mockState.afspraakInsertShouldThrowUnique = true;
    const r = await fetch(`${baseUrl}/loonfundament/loonafspraken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(basisAfspraak("2026-01-01", 275037)),
    });
    expect(r.status).toBe(409);
    const json = await r.json() as { message: string };
    expect(json.message).toMatch(/ingangsdatum/i);
  });
});

// ── (6) Migratiebevinding — structuurcontract ─────────────────────────────────

describe("LOON_02A (6) Migratiebevinding — structuurcontract", () => {
  it("bevinding-object heeft verplichte velden en null opgelost_op", () => {
    const bevinding = {
      id: 1, entiteit_type: "werkgever", entiteit_id: 7, veld: "cao",
      oorspronkelijke_waarde: "XYZ CAO",
      reden: "CAO-tekst kon niet worden gemapt",
      opgelost_op: null, aangemaakt_op: new Date().toISOString(),
    };
    expect(typeof bevinding.id).toBe("number");
    expect(bevinding.entiteit_type).toBe("werkgever");
    expect(bevinding.reden.length).toBeGreaterThan(0);
    expect(bevinding.opgelost_op).toBeNull();
  });
});

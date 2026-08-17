import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

// ── Social campagne-koppeling — autorisatie-integratietest ───────────────────
//
// De social-routes zijn crm-gegate, maar het koppelen (of wijzigen) van een
// marketing-campagne aan een bericht is Marketing-terrein: campagne_id in
// POST/PATCH /social/berichten vereist marketing niveau 3, server-side.
// Deze test dekt: crm-only gebruiker → 403; marketing-gebruiker → doorgang;
// onbekende campagne → 404; ontkoppelen door crm-only → 403.

// ── Mocks ─────────────────────────────────────────────────────────────────────

const werkgeverRij = { id: 1, naam: "Testmaatschappij" };
const berichtRij = {
  id: 7, werkgeverId: 1, tekst: "t", mediaPad: null, mediaType: null,
  status: "concept", geplandOp: null, campagneId: 5, crmKlantId: null,
  gebouwId: null, makerId: 1, aangemaaktOp: new Date(), bijgewerktOp: new Date(),
};

const werkgeversTable = { id: {}, naam: {} } as Record<string, unknown>;
const gebruikersTable = { id: {}, rol: {}, bevoegdheden: {} } as Record<string, unknown>;
const marketingCampagnesTable = { id: {} } as Record<string, unknown>;
const socialBerichtenTable = { id: {}, werkgeverId: {}, $inferInsert: {} } as Record<string, unknown>;
const socialBerichtKanalenTable = { id: {}, berichtId: {}, kanaal: {} } as Record<string, unknown>;
const socialKoppelingenTable = { id: {} } as Record<string, unknown>;

// Bestaat campagne 5, niet 999.
let campagneRijen: Array<{ id: number }> = [{ id: 5 }];

function selectResultaatVoor(table: unknown): unknown[] {
  if (table === werkgeversTable) return [werkgeverRij];
  if (table === marketingCampagnesTable) return campagneRijen;
  if (table === socialBerichtenTable) return [berichtRij];
  if (table === socialBerichtKanalenTable) return [];
  return [];
}

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        const rows = selectResultaatVoor(table);
        const p = Promise.resolve(rows) as Promise<unknown[]> & { where: (..._a: unknown[]) => unknown; innerJoin: (..._a: unknown[]) => unknown };
        p.where = () => Promise.resolve(rows);
        p.innerJoin = () => ({ where: () => Promise.resolve(rows) });
        return p;
      },
    }),
    insert: () => ({ values: (v: unknown) => ({ returning: () => Promise.resolve(Array.isArray(v) ? (v as unknown[]).map((x, i) => ({ id: i + 1, ...(x as object) })) : [{ id: 99, ...(v as object) }]) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([berichtRij]) }) }) }),
    delete: () => ({ where: () => Promise.resolve() }),
  },
  werkgeversTable,
  gebruikersTable,
  marketingCampagnesTable,
  socialBerichtenTable,
  socialBerichtKanalenTable,
  socialKoppelingenTable,
  SOCIAL_KANALEN: ["linkedin", "facebook", "instagram"],
  KOPPELING_MODI: ["handmatig"],
}));

vi.mock("../middlewares/auth", () => ({
  requireBevoegdheid: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/socialKanalen", () => ({
  KANAAL_EISEN: {},
  valideerTegenKanaal: () => [],
}));

vi.mock("../services/socialService", () => ({
  telBerichtenOpDag: async () => 0,
}));

// Bevoegdheden van de "ingelogde" gebruiker, per test in te stellen.
let permissieStub = { isHoofdbeheerder: false, heeftModuleRecht: (_m: string, _n: number) => false };

let server: Server;
let basis: string;

beforeAll(async () => {
  const { default: socialRouter } = await import("../routes/social");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { session: { userId: number } }).session = { userId: 1 };
    (req as unknown as { permissies: typeof permissieStub }).permissies = permissieStub;
    next();
  });
  app.use(socialRouter);
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const adres = server.address();
  basis = `http://127.0.0.1:${typeof adres === "object" && adres ? adres.port : 0}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  campagneRijen = [{ id: 5 }];
  permissieStub = { isHoofdbeheerder: false, heeftModuleRecht: () => false };
});

const basisBody = { werkgever_id: 1, tekst: "test", kanalen: ["linkedin"] };

describe("campagne-koppeling autorisatie", () => {
  it("POST met campagne_id zonder marketing:3 → 403", async () => {
    const res = await fetch(`${basis}/social/berichten`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...basisBody, campagne_id: 5 }),
    });
    expect(res.status).toBe(403);
  });

  it("POST zonder campagne_id blijft mogelijk voor crm-only → 201", async () => {
    const res = await fetch(`${basis}/social/berichten`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(basisBody),
    });
    expect(res.status).toBe(201);
  });

  it("POST met campagne_id mét marketing:3 → 201", async () => {
    permissieStub = { isHoofdbeheerder: false, heeftModuleRecht: (m, n) => m === "marketing" && n <= 3 };
    const res = await fetch(`${basis}/social/berichten`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...basisBody, campagne_id: 5 }),
    });
    expect(res.status).toBe(201);
  });

  it("POST met onbekende campagne mét marketing:3 → 404", async () => {
    permissieStub = { isHoofdbeheerder: false, heeftModuleRecht: (m) => m === "marketing" };
    campagneRijen = [];
    const res = await fetch(`${basis}/social/berichten`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...basisBody, campagne_id: 999 }),
    });
    expect(res.status).toBe(404);
  });

  it("POST met ongeldige campagne_id → 400", async () => {
    permissieStub = { isHoofdbeheerder: true, heeftModuleRecht: () => true };
    const res = await fetch(`${basis}/social/berichten`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...basisBody, campagne_id: "abc" }),
    });
    expect(res.status).toBe(400);
  });

  it("PATCH die campagne wijzigt zonder marketing:3 → 403", async () => {
    const res = await fetch(`${basis}/social/berichten/7`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ campagne_id: 5 }),
    });
    expect(res.status).toBe(403);
  });

  it("PATCH die bestaande koppeling ontkoppelt zonder marketing:3 → 403", async () => {
    const res = await fetch(`${basis}/social/berichten/7`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ campagne_id: null }),
    });
    expect(res.status).toBe(403);
  });

  it("PATCH zonder campagne_id blijft mogelijk voor crm-only → 200", async () => {
    const res = await fetch(`${basis}/social/berichten/7`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tekst: "nieuw" }),
    });
    expect(res.status).toBe(200);
  });

  it("PATCH ontkoppelen mét marketing:3 → 200", async () => {
    permissieStub = { isHoofdbeheerder: false, heeftModuleRecht: (m) => m === "marketing" };
    const res = await fetch(`${basis}/social/berichten/7`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ campagne_id: null }),
    });
    expect(res.status).toBe(200);
  });
});

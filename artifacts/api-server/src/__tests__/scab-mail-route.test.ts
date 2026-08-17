import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

// ── SCAB-mail route integratietests ───────────────────────────────────────────
//
// Dekt HTTP-gedrag van PATCH /scab-mails/:id en GET /scab-mails/:id/mutaties.
// Mock-patroon: module-level const vi.fn() (zelfde als fie-leermomenten-route.test.ts).
// app.use(router) zonder prefix — de route registreert /scab-mails/:id zelf.

// ── Hulptype: thenable DB-result met optionele orderBy-keten ──────────────────
// Sommige routes awaiten .where() direct; andere koppelen .orderBy() erachter.
// Een gewone mockResolvedValue geeft een kale Promise terug zonder orderBy-methode.
// Deze helper geeft een object terug dat zowel als Promise werkt als orderBy accepteert.
type QueryResultRow = Record<string, unknown>;
function q(rows: QueryResultRow[]): Promise<QueryResultRow[]> & { orderBy: () => Promise<QueryResultRow[]> } {
  const p = Promise.resolve(rows) as Promise<QueryResultRow[]>;
  return Object.assign(p, { orderBy: () => p });
}

// ── Mock-functies op module-niveau ────────────────────────────────────────────
const mockSelectWhere     = vi.fn(() => q([]));
const mockSelectFrom      = vi.fn().mockReturnValue({ where: mockSelectWhere });

const mockUpdateReturning = vi.fn().mockResolvedValue([]);
const mockUpdateWhere     = vi.fn().mockReturnValue({ returning: mockUpdateReturning });
const mockUpdateSet       = vi.fn().mockReturnValue({ where: mockUpdateWhere });

// ── @workspace/db mock ────────────────────────────────────────────────────────
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({ from: mockSelectFrom }),
    update: () => ({ set: mockUpdateSet }),
    insert: vi.fn(),
    delete: vi.fn(() => ({ where: vi.fn() })),
  },
  scabMailsTable: {
    id: "id", werkmaatschappij: "wm", periodeJaar: "pj", periodeMaand: "pm",
    werkgeverId: "wgid", status: "status", onderwerp: "o", inhoud: "i",
    scabEmailAdres: "se", contactpersoon: "cp", aantalMutaties: "am",
    mutatieIds: "mi", aiContextJson: "ac", aangemaaktDoorId: "adi",
    aangemaaktDoorNaam: "adn", aangemaaktOp: "ao", bijgewerktOp: "bo",
    verzondOp: "vo", verzondDoorId: "vdi", verzondDoorNaam: "vdn",
    $inferSelect: {}, $inferInsert: {},
  },
  salarisMutatiesTable: {
    id: "id", werkmaatschappij: "wm", periodeJaar: "pj", periodeMaand: "pm",
    medewerkerNaam: "mn", medewerkerId: "mid", type: "t", omschrijving: "om",
    ingangsdatum: "ig", status: "status", declaratieId: "di",
    bijlageObjectPath: "bop", bijlageNaam: "bn", bijlageGrootte: "bg",
    gecontroleerd: "g", gecontroleerdDoorId: "gdi", gecontroleerdDoorNaam: "gdn",
    gecontroleerdOp: "go", akkoord: "a", notities: "n", aangemaaktDoorId: "adi",
    aangemaaktDoorNaam: "adn", aangemaaktOp: "ao", bijgewerktOp: "bo", bron: "b",
    $inferSelect: {},
  },
  werkgeversTable: {
    id: "id", naam: "naam", scabEmailAdres: "se", boekhouderNaam: "bn",
    boekhouderEmail: "be", internContactNaam: "icn", internContactEmail: "ice",
    $inferSelect: {},
  },
  scabMailBijlagenTable: { id: "id", $inferSelect: {} },
  declaratiesTable: { id: "id", status: "status", $inferSelect: {} },
  medewerkersTable: { id: "id", naam: "naam", $inferSelect: {} },
}));

vi.mock("drizzle-orm", () => ({
  eq:       vi.fn(() => ({})),
  and:      vi.fn(() => ({})),
  desc:     vi.fn((v: unknown) => v),
  asc:      vi.fn((v: unknown) => v),
  inArray:  vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
  ne:       vi.fn(() => ({})),
}));

vi.mock("multer", () => {
  const noop = (_: unknown, __: unknown, next: () => void) => next();
  const f = (_?: unknown) => ({ single: () => noop, array: () => noop, none: () => noop });
  f.memoryStorage = () => ({});
  f.diskStorage   = () => ({});
  return { default: f };
});

vi.mock("../middlewares/auth", () => ({
  requireBevoegdheid: () =>
    (req: express.Request, _: express.Response, next: express.NextFunction) => {
      (req as unknown as Record<string, unknown>).session = { userId: 99, gebruikerNaam: "Tester" };
      (req as unknown as Record<string, unknown>).log = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
      next();
    },
}));

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: function (this: Record<string, unknown>) {
    this.uploadBestand = vi.fn();
  },
}));

vi.mock("../lib/aiGateway", () => ({
  aiGateway: { chat: vi.fn() },
  heeftGateway: vi.fn(() => false),
}));

vi.mock("../lib/aiPrompts", () => ({
  SCAB_MAIL_GENERATIE_PROMPT: { naam: "t", versie: "1", tekst: "" },
}));

// ── Testdata ──────────────────────────────────────────────────────────────────

const MAIL_CONCEPT = {
  id: 42, status: "concept", werkmaatschappij: "FPS", periodeJaar: 2026,
  periodeMaand: 6, werkgeverId: null, onderwerp: "SCAB juni", inhoud: "Beste ...",
  scabEmailAdres: null, contactpersoon: null, aantalMutaties: 0, mutatieIds: [],
  aiContextJson: null, aangemaaktDoorId: 1, aangemaaktDoorNaam: "Tester",
  aangemaaktOp: new Date("2026-06-01T00:00:00Z"),
  bijgewerktOp: new Date("2026-06-01T00:00:00Z"),
  verzondOp: null, verzondDoorId: null, verzondDoorNaam: null,
};

const MAIL_VERZONDEN = {
  ...MAIL_CONCEPT, status: "verzonden",
  verzondOp: new Date("2026-06-15T10:00:00Z"),
};

async function patch(baseUrl: string, id: number, body: unknown) {
  return fetch(`${baseUrl}/scab-mails/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getMutaties(baseUrl: string, id: number) {
  return fetch(`${baseUrl}/scab-mails/${id}/mutaties`);
}

// ── In-process server ─────────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: router } = await import("../routes/scab-mail");
  const app = express();
  app.use(express.json());
  app.use(router); // Geen prefix — route registreert /scab-mails/:id zelf
  await new Promise<void>((resolve) => {
    server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectWhere.mockImplementation(() => q([]));
  mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  mockUpdateReturning.mockResolvedValue([]);
  mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
});

// ── PATCH /scab-mails/:id ─────────────────────────────────────────────────────

describe("PATCH /scab-mails/:id", () => {
  // ── Basisvalidatie ──────────────────────────────────────────────────────────

  it("404 als mail niet bestaat", async () => {
    // default: where → [] → bestaand undefined → 404
    const r = await patch(baseUrl, 99, { inhoud: "x" });
    expect(r.status).toBe(404);
  });

  it("409 als mail al verzonden is", async () => {
    mockSelectWhere.mockImplementationOnce(() => q([MAIL_VERZONDEN as unknown as QueryResultRow]));
    const r = await patch(baseUrl, 42, { inhoud: "x" });
    expect(r.status).toBe(409);
  });

  // ── Vrije tekstbewerking (geen mutatie_ids) ─────────────────────────────────

  it("200 bij vrije inhoud-update (geen mutatie_ids)", async () => {
    const updated = { ...MAIL_CONCEPT, inhoud: "Nieuwe tekst" };
    mockSelectWhere.mockImplementationOnce(() => q([MAIL_CONCEPT as unknown as QueryResultRow]));
    mockUpdateReturning.mockResolvedValueOnce([updated]);
    const r = await patch(baseUrl, 42, { inhoud: "Nieuwe tekst" });
    expect(r.status).toBe(200);
    const body = await r.json() as { inhoud: string };
    expect(body.inhoud).toBe("Nieuwe tekst");
  });

  // ── Fail-closed type-validatie van mutatie_ids ──────────────────────────────

  it("400 bij niet-array mutatie_ids (string)", async () => {
    mockSelectWhere.mockImplementationOnce(() => q([MAIL_CONCEPT as unknown as QueryResultRow]));
    const r = await patch(baseUrl, 42, { mutatie_ids: "niet-een-array" });
    expect(r.status).toBe(400);
    const body = await r.json() as { message: string };
    expect(body.message).toMatch(/array/);
  });

  it("400 bij niet-array mutatie_ids (getal)", async () => {
    mockSelectWhere.mockImplementationOnce(() => q([MAIL_CONCEPT as unknown as QueryResultRow]));
    const r = await patch(baseUrl, 42, { mutatie_ids: 5 });
    expect(r.status).toBe(400);
  });

  it("400 bij string-element in mutatie_ids", async () => {
    mockSelectWhere.mockImplementationOnce(() => q([MAIL_CONCEPT as unknown as QueryResultRow]));
    const r = await patch(baseUrl, 42, { mutatie_ids: [1, "tekst"] });
    expect(r.status).toBe(400);
    const body = await r.json() as { message: string };
    expect(body.message).toMatch(/geheel getal/);
  });

  it("400 bij float-element in mutatie_ids", async () => {
    mockSelectWhere.mockImplementationOnce(() => q([MAIL_CONCEPT as unknown as QueryResultRow]));
    const r = await patch(baseUrl, 42, { mutatie_ids: [1, 2.5] });
    expect(r.status).toBe(400);
  });

  it("400 bij null-element in mutatie_ids", async () => {
    mockSelectWhere.mockImplementationOnce(() => q([MAIL_CONCEPT as unknown as QueryResultRow]));
    const r = await patch(baseUrl, 42, { mutatie_ids: [1, null] });
    expect(r.status).toBe(400);
  });

  // ── Scope-validatie: buiten-scope IDs worden geweigerd ─────────────────────

  it("400 bij buiten-scope mutatie-ID", async () => {
    mockSelectWhere
      .mockImplementationOnce(() => q([MAIL_CONCEPT as unknown as QueryResultRow]))  // mail lookup
      .mockImplementationOnce(() => q([{ id: 1 }]));                                 // validatie: alleen id:1 bekend
    const r = await patch(baseUrl, 42, { mutatie_ids: [1, 99] });
    expect(r.status).toBe(400);
    const body = await r.json() as { message: string };
    expect(body.message).toMatch(/99/);
  });

  // ── Deduplicatie: dubbele IDs worden stilzwijgend samengevoegd ─────────────

  it("200 bij dubbele IDs — gedédupliceeerd vóór opslag", async () => {
    const mutatie = { id: 1, medewerkerNaam: "J. Doe", medewerkerId: 5, type: "loon", omschrijving: "bonus", ingangsdatum: "2026-06-01" };
    const updated = { ...MAIL_CONCEPT, mutatieIds: [1], aantalMutaties: 1 };
    mockSelectWhere
      .mockImplementationOnce(() => q([MAIL_CONCEPT as unknown as QueryResultRow]))
      .mockImplementationOnce(() => q([{ id: 1 }]))
      .mockImplementationOnce(() => q([mutatie as unknown as QueryResultRow]));
    mockUpdateReturning.mockResolvedValueOnce([updated]);
    const r = await patch(baseUrl, 42, { mutatie_ids: [1, 1] });
    expect(r.status).toBe(200);
    const updatePayload = mockUpdateSet.mock.calls[0][0] as { mutatieIds: number[] };
    expect(updatePayload.mutatieIds).toEqual([1]);
  });

  // ── Lege selectie: mutatie_ids:[] wist de snapshot ─────────────────────────

  it("200 bij lege selectie — snapshot wordt gewist", async () => {
    const updated = { ...MAIL_CONCEPT, mutatieIds: [], aantalMutaties: 0 };
    mockSelectWhere.mockImplementationOnce(() => q([MAIL_CONCEPT as unknown as QueryResultRow]));
    mockUpdateReturning.mockResolvedValueOnce([updated]);
    const r = await patch(baseUrl, 42, { mutatie_ids: [] });
    expect(r.status).toBe(200);
    const updatePayload = mockUpdateSet.mock.calls[0][0] as { mutatieIds: number[]; aantalMutaties: number };
    expect(updatePayload.mutatieIds).toEqual([]);
    expect(updatePayload.aantalMutaties).toBe(0);
  });

  // ── Geldige selectie: snapshot + body samen bijgewerkt ─────────────────────

  it("200 bij geldige selectie — inhoud server-gegenereerd, snapshot opgeslagen", async () => {
    const m1 = { id: 1, medewerkerNaam: "A. Jansen", medewerkerId: 3, type: "loon", omschrijving: "opslag", ingangsdatum: "2026-06-01" };
    const m2 = { id: 2, medewerkerNaam: "B. Pietersen", medewerkerId: 7, type: "toelage", omschrijving: null, ingangsdatum: null };
    const updated = { ...MAIL_CONCEPT, mutatieIds: [1, 2], aantalMutaties: 2 };
    mockSelectWhere
      .mockImplementationOnce(() => q([MAIL_CONCEPT as unknown as QueryResultRow]))
      .mockImplementationOnce(() => q([{ id: 1 }, { id: 2 }]))
      .mockImplementationOnce(() => q([m1 as unknown as QueryResultRow, m2 as unknown as QueryResultRow]));
    mockUpdateReturning.mockResolvedValueOnce([updated]);
    const r = await patch(baseUrl, 42, { mutatie_ids: [1, 2] });
    expect(r.status).toBe(200);
    const updatePayload = mockUpdateSet.mock.calls[0][0] as { mutatieIds: number[]; inhoud: string; aantalMutaties: number };
    expect(updatePayload.mutatieIds).toEqual([1, 2]);
    expect(updatePayload.aantalMutaties).toBe(2);
    expect(typeof updatePayload.inhoud).toBe("string");
    expect(updatePayload.inhoud.length).toBeGreaterThan(0);
  });

  // ── Stabiele volgorde: server hersorteert DB-resultaten naar input-volgorde ─

  it("200 bij niet-numerieke input-volgorde — mailtekst volgt input-volgorde", async () => {
    // DB retourneert in ID-volgorde [1,2]; input is [2,1] → inhoud moet Tweede vóór Eerste tonen
    const m1 = { id: 1, medewerkerNaam: "Eerste", medewerkerId: 1, type: "loon", omschrijving: null, ingangsdatum: null };
    const m2 = { id: 2, medewerkerNaam: "Tweede", medewerkerId: 2, type: "loon", omschrijving: null, ingangsdatum: null };
    const updated = { ...MAIL_CONCEPT, mutatieIds: [2, 1], aantalMutaties: 2 };
    mockSelectWhere
      .mockImplementationOnce(() => q([MAIL_CONCEPT as unknown as QueryResultRow]))
      .mockImplementationOnce(() => q([{ id: 2 }, { id: 1 }]))
      // DB retourneert in id-volgorde [id:1, id:2]; route moet hersorteren naar [id:2, id:1]
      .mockImplementationOnce(() => q([m1 as unknown as QueryResultRow, m2 as unknown as QueryResultRow]));
    mockUpdateReturning.mockResolvedValueOnce([updated]);

    const r = await patch(baseUrl, 42, { mutatie_ids: [2, 1] });
    expect(r.status).toBe(200);

    const updatePayload = mockUpdateSet.mock.calls[0][0] as { mutatieIds: number[]; inhoud: string };
    expect(updatePayload.mutatieIds).toEqual([2, 1]);
    // Inhoud: "Tweede" moet vóór "Eerste" staan (input-volgorde gerespecteerd)
    const posEerste = updatePayload.inhoud.indexOf("Eerste");
    const posTweede = updatePayload.inhoud.indexOf("Tweede");
    expect(posTweede).toBeGreaterThanOrEqual(0);
    expect(posEerste).toBeGreaterThanOrEqual(0);
    expect(posTweede).toBeLessThan(posEerste);
  });
});

// ── GET /scab-mails/:id/mutaties ──────────────────────────────────────────────

describe("GET /scab-mails/:id/mutaties", () => {
  it("404 als mail niet bestaat", async () => {
    const r = await getMutaties(baseUrl, 99);
    expect(r.status).toBe(404);
  });

  it("200 met in_snapshot-vlag per mutatie — id:1 in snapshot, id:2 niet", async () => {
    const mailMetSnapshot = { ...MAIL_CONCEPT, mutatieIds: [1] };
    const mutatie1 = { id: 1, medewerkerNaam: "A", type: "loon", omschrijving: null, ingangsdatum: null, status: "concept" };
    const mutatie2 = { id: 2, medewerkerNaam: "B", type: "toelage", omschrijving: null, ingangsdatum: null, status: "nieuw" };
    mockSelectWhere
      .mockImplementationOnce(() => q([mailMetSnapshot as unknown as QueryResultRow]))
      .mockImplementationOnce(() => q([mutatie1 as unknown as QueryResultRow, mutatie2 as unknown as QueryResultRow]));

    const r = await getMutaties(baseUrl, 42);
    expect(r.status).toBe(200);
    const items = await r.json() as Array<{ id: number; in_snapshot: boolean }>;
    expect(items).toHaveLength(2);
    expect(items.find((m) => m.id === 1)?.in_snapshot).toBe(true);
    expect(items.find((m) => m.id === 2)?.in_snapshot).toBe(false);
  });
});

// Integratietest: GET /werk-inbox/telling — mailboxtoegang-scoping
//
// Bewijst dat de teller:
//   1. 0 teruggeeft als de gebruiker geen toegang heeft tot een mailbox.
//   2. Mails uit niet-toegankelijke mailboxen nooit meerekent (de WHERE
//      filtert op de adressen die toegankelijkeMailboxen teruggeeft).
//   3. Alleen ongelezen (isGelezenMs=false) én niet-afgehandelde
//      (afgehandeldOp IS NULL) mails telt — de WHERE-clausule controle.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

// ── vi.hoisted: mock-objecten aanmaken vóór vi.mock-fabrieken draaien ─────────

const {
  mockSelectWhere,
  mockSelectFrom,
  mockSelectFields,
  mockToegang,
} = vi.hoisted(() => {
  // mockSelectWhere retourneert de DB-telrij
  const mockSelectWhere  = vi.fn<(..._a: unknown[]) => Promise<unknown[]>>().mockResolvedValue([{ aantal: 0 }]);
  const mockSelectFrom   = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelectFields = vi.fn().mockReturnValue({ from: mockSelectFrom });

  // mockToegang stelt voor elke test in welke mailboxen de gebruiker mag zien
  const mockToegang = vi.fn<() => Promise<{ emailAdres: string }[]>>().mockResolvedValue([]);

  return { mockSelectWhere, mockSelectFrom, mockSelectFields, mockToegang };
});

// ── @workspace/db mock ────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: {
    select:  mockSelectFields,
    insert:  vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })) })),
    update:  vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    delete:  vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
  },
  werkInboxMailsTable:        { mailboxAdres: "mailboxAdres", isGelezenMs: "isGelezenMs", afgehandeldOp: "afgehandeldOp" },
  werkInboxMailboxenTable:    { id: "id", emailAdres: "emailAdres" },
  werkInboxMailboxToegangTable: { id: "id", mailboxId: "mailboxId", gebruikerId: "gebruikerId", recht: "recht" },
  werkInboxTokensTable:       { id: "id" },
  werkInboxNotitiesTable:     { id: "id" },
  werkInboxKoppelingenTable:  { id: "id" },
  gebruikersTable:            { id: "id", naam: "naam" },
  crmContactpersonenTable:    { id: "id" },
  crmKlantenTable:            { id: "id" },
  WERK_INBOX_ENTITY_TYPES:    [],
  WERK_INBOX_RECHTEN:         ["lezen", "behandelen", "beheren"],
  WERK_INBOX_MODI:            ["verwerken", "ondersteunen", "registreren"],
  WERK_INBOX_STATUSSEN:       ["open", "toegewezen", "afgehandeld"],
}));

// ── drizzle-orm mock ──────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq:       vi.fn(() => ({ _tag: "eq" })),
  and:      vi.fn((..._a: unknown[]) => ({ _tag: "and" })),
  or:       vi.fn(() => ({ _tag: "or" })),
  desc:     vi.fn((v: unknown) => v),
  asc:      vi.fn((v: unknown) => v),
  inArray:  vi.fn(() => ({ _tag: "inArray" })),
  isNull:   vi.fn(() => ({ _tag: "isNull" })),
  isNotNull: vi.fn(() => ({ _tag: "isNotNull" })),
  gte:      vi.fn(() => ({ _tag: "gte" })),
  lt:       vi.fn(() => ({ _tag: "lt" })),
  sql:      Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}));

// ── Diensten mock ─────────────────────────────────────────────────────────────

vi.mock("../services/werkInboxToegang", () => ({
  toegankelijkeMailboxen: mockToegang,
  rechtDekt:              vi.fn(() => true),
  isHoofdbeheerder:       vi.fn(async () => false),
  haalRecht:              vi.fn(async () => null),
  rechtOpMailboxAdres:    vi.fn(async () => null),
  meldAanwezigheid:       vi.fn(async () => undefined),
  leesAanwezigheid:       vi.fn(async () => []),
}));

vi.mock("../services/werkInboxGraph", () => ({
  isGeconfigureerd:       vi.fn(() => false),
  bouwAuthUrl:            vi.fn(() => ""),
  maakOAuthState:         vi.fn(() => ""),
  verifyOAuthState:       vi.fn(() => null),
  slaTokenOp:             vi.fn(async () => undefined),
  verwijderToken:         vi.fn(async () => undefined),
  haalMicrosoftEmail:     vi.fn(async () => ""),
  syncMailboxen:          vi.fn(async () => undefined),
  haalVolledigeMail:      vi.fn(async () => null),
  markeerGelezen:         vi.fn(async () => undefined),
  verplaatsMail:          vi.fn(async () => undefined),
  archiveerMail:          vi.fn(async () => undefined),
  beantwoordMail:         vi.fn(async () => undefined),
  verstuurNieuwDelegatedMail: vi.fn(async () => undefined),
  probeExchangeToegang:   vi.fn(async () => ({ ok: false })),
  ontbrekendeScopes:      vi.fn(() => []),
  GeenToegang:            class extends Error {},
}));

vi.mock("../services/factuurstroomService", () => ({
  verwerkFactuurmails: vi.fn(async () => undefined),
}));

vi.mock("../services/aanvraagstroomService", () => ({
  verwerkAanvraagmails: vi.fn(async () => undefined),
}));

vi.mock("../lib/aiGateway", () => ({
  aiGateway:    { chat: vi.fn(), responses: vi.fn() },
  heeftGateway: vi.fn(() => false),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../middlewares/auth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as Record<string, unknown>).session = { userId: 7 };
    (req as unknown as Record<string, unknown>).log     = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    next();
  },
}));

// ── Express-server ────────────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: werkInboxRouter } = await import("../routes/werk-inbox");
  const app = express();
  app.use(express.json());
  app.use(werkInboxRouter);

  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, resolve);
  });
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => new Promise<void>((resolve, reject) =>
  server.close((err) => (err ? reject(err) : resolve()))
));

beforeEach(() => {
  vi.clearAllMocks();
  // Standaard: geen toegankelijke mailboxen
  mockToegang.mockResolvedValue([]);
  mockSelectFields.mockReturnValue({ from: mockSelectFrom });
  mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  mockSelectWhere.mockResolvedValue([{ aantal: 0 }]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /werk-inbox/telling — scoping op mailboxtoegang", () => {
  it("geeft 0 als de gebruiker geen toegang heeft tot een mailbox", async () => {
    // toegankelijkeMailboxen geeft [] → route returnt direct {aantal:0}
    mockToegang.mockResolvedValue([]);

    const res = await fetch(`${baseUrl}/werk-inbox/telling`);
    const body = await res.json() as { aantal: number };

    expect(res.status).toBe(200);
    expect(body.aantal).toBe(0);

    // DB-query mag NOOIT zijn aangeroepen: er zijn geen adressen om op te filteren
    expect(mockSelectFields).not.toHaveBeenCalled();
  });

  it("mails uit niet-toegankelijke mailboxen tellen niet mee", async () => {
    // Gebruiker mag alleen eigen@fps.nl zien, niet ander@fps.nl
    mockToegang.mockResolvedValue([{ emailAdres: "eigen@fps.nl" }]);

    // Stel DB zo in dat de count 2 mails teruggeeft (voor de toegankelijke mailbox)
    mockSelectWhere.mockResolvedValue([{ aantal: 2 }]);

    const res = await fetch(`${baseUrl}/werk-inbox/telling`);
    const body = await res.json() as { aantal: number };

    expect(res.status).toBe(200);
    expect(body.aantal).toBe(2);

    // Controleer dat inArray de scoped adressenlijst gebruikt (niet een lege of alle mailboxen)
    const { inArray } = await import("drizzle-orm");
    expect(inArray).toHaveBeenCalledWith(
      expect.anything(),
      ["eigen@fps.nl"],
    );
  });

  it("telt alleen ongelezen (isGelezenMs=false) én niet-afgehandelde (afgehandeldOp IS NULL) mails", async () => {
    mockToegang.mockResolvedValue([{ emailAdres: "inbox@fps.nl" }]);
    mockSelectWhere.mockResolvedValue([{ aantal: 5 }]);

    const res = await fetch(`${baseUrl}/werk-inbox/telling`);
    const body = await res.json() as { aantal: number };

    expect(res.status).toBe(200);
    expect(body.aantal).toBe(5);

    // Controleer dat de WHERE-clausule de juiste filters bevat
    const { eq, isNull, and } = await import("drizzle-orm");

    // isGelezenMs = false filter aanwezig
    expect(eq).toHaveBeenCalledWith(
      expect.anything(), // werkInboxMailsTable.isGelezenMs
      false,
    );
    // afgehandeldOp IS NULL filter aanwezig
    expect(isNull).toHaveBeenCalledWith(expect.anything()); // werkInboxMailsTable.afgehandeldOp

    // and() combineert alle drie condities (mailboxAdres IN, isGelezenMs, afgehandeldOp)
    expect(and).toHaveBeenCalled();
  });

  it("geeft het DB-aantal ongewijzigd door als de gebruiker toegang heeft", async () => {
    mockToegang.mockResolvedValue([
      { emailAdres: "a@fps.nl" },
      { emailAdres: "b@fps.nl" },
    ]);
    mockSelectWhere.mockResolvedValue([{ aantal: 13 }]);

    const res = await fetch(`${baseUrl}/werk-inbox/telling`);
    const body = await res.json() as { aantal: number };

    expect(res.status).toBe(200);
    expect(body.aantal).toBe(13);
  });

  it("retourneert 0 als de DB geen rij teruggeeft (defensive fallback)", async () => {
    mockToegang.mockResolvedValue([{ emailAdres: "leeg@fps.nl" }]);
    // DB geeft lege array (onverwacht scenario)
    mockSelectWhere.mockResolvedValue([]);

    const res = await fetch(`${baseUrl}/werk-inbox/telling`);
    const body = await res.json() as { aantal: number };

    expect(res.status).toBe(200);
    expect(body.aantal).toBe(0);
  });
});

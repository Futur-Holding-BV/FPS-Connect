// Route-niveau integratietests voor portaal e-mailvoorkeur (Task 960).
//
// Bewijst dat de drie portaal-notificaties (klantvraag, ondertekening, afwijzing)
// daadwerkelijk worden overgeslagen als de behandelaar e-mail heeft uitgeschakeld,
// én verstuurd worden als er geen voorkeur is (fail-open).
//
// Aanpak: in-process Express-server + Node fetch (Node 24).
// Notificatielogica = fire-and-forget IIFE na HTTP-respons; wacht na response.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "node:http";

// ── vi.hoisted: alle variabelen die vi.mock-fabrieken mogen lezen ─────────────

const {
  selectQueue,
  insertQueue,
  mockDb,
  maakProjectMock,
  magMailSturenMock,
  stuurKlantvraagNotificatieMock,
  stuurKlantvraagBevestigingMock,
  stuurOndertekeningNotificatieMock,
  stuurOpdrachtbevestigingMock,
  stuurAfwijzingNotificatieMock,
  stuurAfwijzingBevestigingMock,
} = vi.hoisted(() => {
  // ── Thenable helper: result die zowel await als .limit() spreekt ──
  function qResult(data: unknown[]) {
    const p = Promise.resolve(data) as Promise<unknown[]> & {
      limit: (n: number) => Promise<unknown[]>;
      orderBy: (..._a: unknown[]) => { limit: (_n: number) => Promise<unknown[]> };
      returning: () => Promise<unknown[]>;
    };
    p.limit    = () => Promise.resolve(data);
    p.orderBy  = () => ({ limit: () => Promise.resolve(data) });
    p.returning = () => Promise.resolve(data);
    return p;
  }

  // Queues per test ingesteld
  const selectQueue: unknown[][] = [];
  const insertQueue: unknown[][] = [];

  const mockDb = {
    select: (_fields?: unknown) => ({
      from: (_table: unknown) => ({
        where: (..._args: unknown[]) => qResult(selectQueue.shift() ?? []),
      }),
    }),
    insert: (_table: unknown) => ({
      values: (_data: unknown) => ({
        returning: () => Promise.resolve(insertQueue.shift() ?? []),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(insertQueue.shift() ?? []).then(resolve, reject),
      }),
    }),
    update: (_table: unknown) => ({
      set: (_data: unknown) => ({
        where: (..._args: unknown[]) => Promise.resolve([]),
      }),
    }),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: (_t: unknown) => ({
          set: (_d: unknown) => ({
            where: (..._a: unknown[]) => qResult([{ id: 5 }]),
            returning: () => Promise.resolve([{ id: 5 }]),
          }),
        }),
        select: (_f?: unknown) => ({
          from: (_t: unknown) => ({
            where: (..._a: unknown[]) => qResult(selectQueue.shift() ?? []),
            orderBy: (..._a: unknown[]) => ({ limit: () => Promise.resolve([{ versienummer: 1 }]) }),
          }),
        }),
        insert: (_t: unknown) => ({
          values: (_d: unknown) => ({
            returning: () => Promise.resolve(insertQueue.shift() ?? []),
            then: (r: (v: unknown) => unknown) => Promise.resolve([]).then(r),
          }),
        }),
      };
      return callback(tx);
    },
  };

  const maakProjectMock = vi.fn().mockResolvedValue({
    projectId: 7,
    projectleiderMedewerkerId: null,
    werkbakItemAangemaakt: true,
  });
  const magMailSturenMock             = vi.fn<(..._a: unknown[]) => Promise<boolean>>();
  const stuurKlantvraagNotificatieMock  = vi.fn<(..._a: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  const stuurKlantvraagBevestigingMock  = vi.fn<(..._a: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  const stuurOndertekeningNotificatieMock = vi.fn<(..._a: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  const stuurOpdrachtbevestigingMock    = vi.fn<(..._a: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  const stuurAfwijzingNotificatieMock   = vi.fn<(..._a: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  const stuurAfwijzingBevestigingMock   = vi.fn<(..._a: unknown[]) => Promise<void>>().mockResolvedValue(undefined);

  return {
    selectQueue,
    insertQueue,
    mockDb,
    maakProjectMock,
    magMailSturenMock,
    stuurKlantvraagNotificatieMock,
    stuurKlantvraagBevestigingMock,
    stuurOndertekeningNotificatieMock,
    stuurOpdrachtbevestigingMock,
    stuurAfwijzingNotificatieMock,
    stuurAfwijzingBevestigingMock,
  };
});

// ── Module-mocks ─────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: mockDb,
  offertesTable:             { id: {}, portaalStatus: {}, status: {}, behandeldDoorId: {}, gebouwId: {}, offertenummer: {}, titel: {}, klantId: {}, autoProjectId: {}, opdrachtgever: {}, bijgewerktOp: {} },
  offertePortaalTokensTable: { id: {}, token: {}, offerteId: {}, verlopen: {}, vervaltOp: {} },
  offerteVragenTable:        { id: {}, offerteId: {} },
  offerteTrackingTable:      { id: {}, offerteId: {} },
  offerteHandtekeningenTable:{ id: {}, offerteId: {} },
  offerteVersiesTable:       { id: {}, offerteId: {}, versienummer: {} },
  offerteSectiesTable:       { id: {} },
  offerteBijlagenTable:      { id: {} },
  offerteRegelsTable:        { id: {} },
  gebruikersTable:           { id: {}, email: {}, naam: {} },
  gebouwenTable:             { id: {} },
  projectenTable:            { id: {} },
  crmCommunicatieTable:      { id: {} },
  crmKlantenTable:           { id: {} },
  appInstellingenTable:      { id: {}, opdrachtbevestigingAutoVerzenden: {} },
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: () => ({}),
  or: () => ({}),
  ne: () => ({}),
  desc: () => ({}),
  isNull: () => ({}),
  gt: () => ({}),
}));

vi.mock("../services/email", () => ({
  stuurKlantvraagNotificatie:   (...a: unknown[]) => stuurKlantvraagNotificatieMock(...a),
  stuurKlantvraagBevestiging:   (...a: unknown[]) => stuurKlantvraagBevestigingMock(...a),
  stuurOndertekeningNotificatie: (...a: unknown[]) => stuurOndertekeningNotificatieMock(...a),
  stuurOpdrachtbevestiging:     (...a: unknown[]) => stuurOpdrachtbevestigingMock(...a),
  stuurAfwijzingNotificatie:    (...a: unknown[]) => stuurAfwijzingNotificatieMock(...a),
  stuurAfwijzingBevestiging:    (...a: unknown[]) => stuurAfwijzingBevestigingMock(...a),
}));

vi.mock("../services/projectService", () => ({
  maakProject: (...a: unknown[]) => maakProjectMock(...a),
}));

vi.mock("../lib/mailVoorkeuren", () => ({
  magMailSturen: (...a: unknown[]) => magMailSturenMock(...a),
}));

vi.mock("../lib/activiteit", () => ({
  logActiviteit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/publiekeUrl", () => ({
  publiekeAppUrl: () => "https://fps.test",
}));

vi.mock("../lib/aiGateway", () => ({
  aiGateway: { chat: vi.fn(), responses: vi.fn() },
  heeftGateway: false,
}));

// ── Express-app ───────────────────────────────────────────────────────────────

import portaalRouter from "../routes/portaal";

let server: Server;
let baseUrl: string;

function stubReqLog(req: Request, _res: Response, next: NextFunction) {
  (req as unknown as { log: Record<string, () => void> }).log = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
  next();
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(stubReqLog);
  app.use("/api", portaalRouter);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}/api`;
});

afterAll(() => {
  server.close();
});

// ── Wacht-helper ──────────────────────────────────────────────────────────────
// Geeft de fire-and-forget IIFE voldoende tijd om af te ronden.
async function wachtOpIife() {
  await new Promise<void>((r) => setTimeout(r, 40));
}

// ── Stub-data ─────────────────────────────────────────────────────────────────

const TEST_TOKEN = "tok-abc-123";

const tokenRecord = {
  id: 1,
  token: TEST_TOKEN,
  offerteId: 5,
  verlopen: false,
  vervaltOp: null,
};

const offerte = {
  id: 5,
  offertenummer: "OFF-2026-001",
  titel: "Testofferte",
  behandeldDoorId: 10,
  gebouwId: null,
  portaalStatus: null,
  status: "verzonden",
  klantId: null,
  autoProjectId: null,
  opdrachtgever: null,
  bijgewerktOp: new Date(),
};

const beheerder = { id: 10, email: "beheerder@fps.nl", naam: "Beheerder Test" };

function resetQueues(...selects: unknown[][]) {
  selectQueue.splice(0, selectQueue.length, ...selects);
  insertQueue.splice(0, insertQueue.length);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. POST /portaal/:token/vraag — klantvraag-notificatie
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /portaal/:token/vraag — e-mailvoorkeur notificatie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stuurKlantvraagNotificatieMock.mockResolvedValue(undefined);
    stuurKlantvraagBevestigingMock.mockResolvedValue(undefined);
  });

  it("opt-out: behandelaar e-mail uitgeschakeld → stuurKlantvraagNotificatie NIET aangeroepen", async () => {
    resetQueues([tokenRecord], [offerte], [beheerder]);
    insertQueue.push([{ id: 99 }]); // nieuw vraag-record

    magMailSturenMock.mockResolvedValue(false);

    const res = await fetch(`${baseUrl}/portaal/${TEST_TOKEN}/vraag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vraag: "Is de offerte nog geldig?" }),
    });

    expect(res.status).toBe(201);
    await wachtOpIife();

    expect(magMailSturenMock).toHaveBeenCalledWith(10, "email.portaal_klantvraag");
    expect(stuurKlantvraagNotificatieMock).not.toHaveBeenCalled();
  });

  it("fail-open: geen voorkeur ingesteld → stuurKlantvraagNotificatie WEL aangeroepen", async () => {
    resetQueues([tokenRecord], [offerte], [beheerder]);
    insertQueue.push([{ id: 100 }]);

    magMailSturenMock.mockResolvedValue(true);

    const res = await fetch(`${baseUrl}/portaal/${TEST_TOKEN}/vraag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vraag: "Welke materialen worden gebruikt?" }),
    });

    expect(res.status).toBe(201);
    await wachtOpIife();

    expect(magMailSturenMock).toHaveBeenCalledWith(10, "email.portaal_klantvraag");
    expect(stuurKlantvraagNotificatieMock).toHaveBeenCalledTimes(1);
    expect(stuurKlantvraagNotificatieMock).toHaveBeenCalledWith(
      expect.objectContaining({ naarEmail: "beheerder@fps.nl" }),
    );
  });

  it("geen behandelaar → fallback-adres, magMailSturen NIET aangeroepen, mail WEL verstuurd", async () => {
    const offerteZonderBehandelaar = { ...offerte, behandeldDoorId: null };
    resetQueues([tokenRecord], [offerteZonderBehandelaar]);
    // geen beheerder-lookup: behandeldDoorId is null
    insertQueue.push([{ id: 101 }]);

    magMailSturenMock.mockResolvedValue(true);

    const res = await fetch(`${baseUrl}/portaal/${TEST_TOKEN}/vraag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vraag: "Prijs klopt?" }),
    });

    expect(res.status).toBe(201);
    await wachtOpIife();

    // Short-circuit: magMailSturen nooit aangeroepen bij behandelaarId === null
    expect(magMailSturenMock).not.toHaveBeenCalled();
    expect(stuurKlantvraagNotificatieMock).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. POST /portaal/:token/ondertekenen — ondertekening-notificatie
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /portaal/:token/ondertekenen — e-mailvoorkeur notificatie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stuurOndertekeningNotificatieMock.mockResolvedValue(undefined);
    stuurOpdrachtbevestigingMock.mockResolvedValue(undefined);
  });

  it("opt-out: behandelaar e-mail uitgeschakeld → stuurOndertekeningNotificatie NIET aangeroepen", async () => {
    resetQueues(
      [tokenRecord],                               // valideerToken
      [offerte],                                   // main offerte-select
      [{ autoProjectId: null }],                   // tx: autoProjectId check
      [{ opdrachtbevestigingAutoVerzenden: false }], // appInstellingen (main)
      [beheerder],                                 // IIFE: beheerder
      [{ opdrachtbevestigingAutoVerzenden: false }], // IIFE: appInstellingen (optioneel)
    );
    magMailSturenMock.mockResolvedValue(false);

    const res = await fetch(`${baseUrl}/portaal/${TEST_TOKEN}/ondertekenen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        naam: "Jan Klant",
        handtekening_data_url: "data:image/png;base64,abc",
      }),
    });

    expect([200, 201]).toContain(res.status);
    await wachtOpIife();

    expect(magMailSturenMock).toHaveBeenCalledWith(10, "email.portaal_ondertekening");
    expect(stuurOndertekeningNotificatieMock).not.toHaveBeenCalled();
  });

  it("fail-open: geen voorkeur → stuurOndertekeningNotificatie WEL aangeroepen", async () => {
    resetQueues(
      [tokenRecord],
      [offerte],
      [{ autoProjectId: null }],
      [{ opdrachtbevestigingAutoVerzenden: false }],
      [beheerder],
      [{ opdrachtbevestigingAutoVerzenden: false }],
    );
    magMailSturenMock.mockResolvedValue(true);

    const res = await fetch(`${baseUrl}/portaal/${TEST_TOKEN}/ondertekenen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        naam: "Jan Klant",
        handtekening_data_url: "data:image/png;base64,abc",
      }),
    });

    expect([200, 201]).toContain(res.status);
    await wachtOpIife();

    expect(magMailSturenMock).toHaveBeenCalledWith(10, "email.portaal_ondertekening");
    expect(stuurOndertekeningNotificatieMock).toHaveBeenCalledTimes(1);
    expect(stuurOndertekeningNotificatieMock).toHaveBeenCalledWith(
      expect.objectContaining({ naarEmail: "beheerder@fps.nl" }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. POST /portaal/:token/afwijzen — afwijzing-notificatie
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /portaal/:token/afwijzen — e-mailvoorkeur notificatie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stuurAfwijzingNotificatieMock.mockResolvedValue(undefined);
    stuurAfwijzingBevestigingMock.mockResolvedValue(undefined);
  });

  it("opt-out: behandelaar e-mail uitgeschakeld → stuurAfwijzingNotificatie NIET aangeroepen", async () => {
    resetQueues(
      [tokenRecord],   // valideerToken
      [offerte],       // main body offerte-select
      [offerte],       // IIFE: offerte opnieuw
      [beheerder],     // IIFE: beheerder
    );

    magMailSturenMock.mockResolvedValue(false);

    const res = await fetch(`${baseUrl}/portaal/${TEST_TOKEN}/afwijzen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    await wachtOpIife();

    expect(magMailSturenMock).toHaveBeenCalledWith(10, "email.portaal_afwijzing");
    expect(stuurAfwijzingNotificatieMock).not.toHaveBeenCalled();
  });

  it("fail-open: geen voorkeur → stuurAfwijzingNotificatie WEL aangeroepen", async () => {
    resetQueues(
      [tokenRecord],
      [offerte],
      [offerte],
      [beheerder],
    );

    magMailSturenMock.mockResolvedValue(true);

    const res = await fetch(`${baseUrl}/portaal/${TEST_TOKEN}/afwijzen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    await wachtOpIife();

    expect(magMailSturenMock).toHaveBeenCalledWith(10, "email.portaal_afwijzing");
    expect(stuurAfwijzingNotificatieMock).toHaveBeenCalledTimes(1);
    expect(stuurAfwijzingNotificatieMock).toHaveBeenCalledWith(
      expect.objectContaining({ naarEmail: "beheerder@fps.nl" }),
    );
  });

  it("geen behandelaar → fallback-adres, magMailSturen NIET aangeroepen, mail WEL verstuurd", async () => {
    const offerteZonderBehandelaar = { ...offerte, behandeldDoorId: null };
    resetQueues(
      [tokenRecord],
      [offerteZonderBehandelaar],
      [offerteZonderBehandelaar],
      // geen beheerder-lookup
    );

    magMailSturenMock.mockResolvedValue(true);

    const res = await fetch(`${baseUrl}/portaal/${TEST_TOKEN}/afwijzen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    await wachtOpIife();

    expect(magMailSturenMock).not.toHaveBeenCalled();
    expect(stuurAfwijzingNotificatieMock).toHaveBeenCalledTimes(1);
  });
});

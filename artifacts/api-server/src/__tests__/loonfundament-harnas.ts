// LOON_02A — Gedeeld test-harnas voor loonfundament Vitest-suites.
//
// Exporteert:
//   - Row type
//   - q()  — chainable query-stub
//   - pgUniqueErr() — Postgres 23505 fout
//   - mockState — gedeelde mutatievariabelen (reset via resetMockState())
//   - vi.mock-aanroepen voor @workspace/db, drizzle-orm, auth, loonfundament-import
//
// Importeer dit bestand bovenaan elke loonfundament-*.test.ts (vóór andere imports).
// vi.mock()-aanroepen worden door Vitest automatisch gehoist naar de bovenkant
// van het testbestand, ook als ze in een geïmporteerd module staan — DUS dit
// bestand mag alleen re-export-vriendelijke mock-registraties bevatten via
// helpers die de afzonderlijke testbestanden aanroepen vanuit hun eigen
// vi.mock()-blokken.
//
// GEBRUIK: elke suite kopieert de vi.mock()-blokken en roept resetMockState()
// in beforeEach() aan. Dat patroon is consistent met scab-mail-route.test.ts.

import { vi } from "vitest";

// ── Hulptype ──────────────────────────────────────────────────────────────────

export type Row = Record<string, unknown>;

// ── Chainable query-stub ──────────────────────────────────────────────────────

export function q(
  rows: Row[],
): Promise<Row[]> & {
  orderBy: (...args: unknown[]) => Promise<Row[]>;
  limit: (n: number) => Promise<Row[]>;
} {
  const p = Promise.resolve(rows) as Promise<Row[]>;
  return Object.assign(p, {
    orderBy: (..._args: unknown[]) => Promise.resolve(rows),
    limit: (_n: number) => Promise.resolve(rows),
  });
}

// ── Postgres 23505 fout ───────────────────────────────────────────────────────

export function pgUniqueErr(): Error {
  const e = new Error("duplicate key value violates unique constraint");
  (e as unknown as Record<string, unknown>).code = "23505";
  return e;
}

// ── Gedeelde mock-state ───────────────────────────────────────────────────────

export const mockState = {
  // IKV
  ikvInsertShouldThrowUnique: false,
  ikvSelectRows: [] as Row[],
  ikvInsertResult: [] as Row[],
  // Loonafspraken
  afspraakInsertShouldThrowUnique: false,
  afspraakInsertResult: [] as Row[],
  // Jaarsets (gereedheid)
  jaarsetRows: [] as Row[],
  // Loonstaten/tijdvakregels
  staatSelectResult: [] as Row[],
  tijdvakregelInsertShouldThrowUnique: false,
  tijdvakregelInsertResult: [] as Row[],
  // Inhoudingsplichtigen
  werkgeverRows: [] as Row[],
  bevindingRows: [] as Row[],
  // Auth
  authShouldReject: false,
};

export function resetMockState(): void {
  mockState.ikvInsertShouldThrowUnique = false;
  mockState.ikvSelectRows = [];
  mockState.ikvInsertResult = [];
  mockState.afspraakInsertShouldThrowUnique = false;
  mockState.afspraakInsertResult = [];
  mockState.jaarsetRows = [];
  mockState.staatSelectResult = [];
  mockState.tijdvakregelInsertShouldThrowUnique = false;
  mockState.tijdvakregelInsertResult = [];
  mockState.werkgeverRows = [];
  mockState.bevindingRows = [];
  mockState.authShouldReject = false;
}

// ── Mock-fabriek voor @workspace/db ──────────────────────────────────────────

export function maakDbMock() {
  function tbl(kolommen: string[]) {
    return Object.fromEntries([
      ...kolommen.map((k) => [k, k]),
      ["$inferSelect", {}],
      ["$inferInsert", {}],
    ]);
  }

  const db = {
    select: (_fields?: unknown) => ({
      from: (tabel: unknown) => ({
        where: (_cond: unknown) => {
          if (tabel === "werkgevers_t") return q(mockState.werkgeverRows);
          if (tabel === "bevindingen_t") return q(mockState.bevindingRows);
          if (tabel === "jaarsets_t") {
            return {
              ...q(mockState.jaarsetRows),
              orderBy: (..._a: unknown[]) => Promise.resolve(mockState.jaarsetRows),
            };
          }
          if (tabel === "ikv_t") return q(mockState.ikvSelectRows);
          if (tabel === "staat_t") return q(mockState.staatSelectResult);
          return q([]);
        },
        leftJoin: (_t: unknown, _c: unknown) => ({
          where: (_cond: unknown) => q([]),
          orderBy: (..._a: unknown[]) => Promise.resolve([]),
        }),
        orderBy: (..._a: unknown[]) => Promise.resolve([]),
      }),
    }),
    insert: (tabel: unknown) => ({
      values: (_vals: unknown) => ({
        returning: () => {
          if (tabel === "ikv_t") {
            if (mockState.ikvInsertShouldThrowUnique) throw pgUniqueErr();
            return Promise.resolve(mockState.ikvInsertResult);
          }
          if (tabel === "afspraken_t") {
            if (mockState.afspraakInsertShouldThrowUnique) throw pgUniqueErr();
            return Promise.resolve(mockState.afspraakInsertResult);
          }
          if (tabel === "staat_t") {
            return Promise.resolve([{
              id: 55, inkomstenverhoudingId: 1, kalenderjaar: 2026, tijdvak: "maand",
              status: "concept", aangemaaktOp: new Date(), bijgewerktOp: new Date(),
            }]);
          }
          if (tabel === "tijdvakregel_t") {
            if (mockState.tijdvakregelInsertShouldThrowUnique) throw pgUniqueErr();
            return Promise.resolve(mockState.tijdvakregelInsertResult);
          }
          return Promise.resolve([]);
        },
      }),
    }),
    update: (_tabel: unknown) => ({
      set: (_vals: unknown) => ({
        where: (_cond: unknown) => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    }),
    delete: (_tabel: unknown) => ({ where: (_c: unknown) => Promise.resolve() }),
    execute: (_sql: unknown) => Promise.resolve(),
  };

  return {
    db,
    caoCatalogusTable:              tbl(["id", "code", "naam", "actief"]),
    werkgeversTable:                "werkgevers_t",
    medewerkersTable:               tbl(["id", "naam"]),
    medewerkerAanstellingenTable:   tbl(["id", "medewerkerId", "werkgeverId", "caoId"]),
    loonMigratiebevindingenTable:   "bevindingen_t",
    loonInkomstenverhoudingenTable: "ikv_t",
    loonAfsprakenTable:             "afspraken_t",
    loonJaarsetsTable:              "jaarsets_t",
    loonJaarbronnenTable:           tbl(["id", "jaarsetId", "bronsoort", "sha256", "officieleBestandsnaam"]),
    loonJaarparametersTable:        tbl(["id", "jaarsetId", "sleutel", "datatype", "rekenstatus", "vindplaats", "bronId"]),
    loonStatenTable:                "staat_t",
    loonStaatTijdvakregelsTable:    "tijdvakregel_t",
  };
}

// ── Auth-middleware mock-factory ──────────────────────────────────────────────

export function maakAuthMiddlewareMock() {
  const middleware =
    (_moduleOrNiveau: string | number, _niveau?: number) =>
      (req: { session?: unknown }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
        if (mockState.authShouldReject) {
          res.status(403).json({ message: "Geen toegang" });
          return;
        }
        (req as Record<string, unknown>).session = { userId: 1 };
        next();
      };
  return {
    requireBevoegdheid: middleware,
    requireLoonfundamentToegang: middleware,
  };
}

// ── Express-server helper ─────────────────────────────────────────────────────

import express from "express";
import { createServer, type Server } from "node:http";

export async function maakTestServer(): Promise<{ server: Server; baseUrl: string }> {
  const { default: router } = await import("../routes/loonfundament");
  const app = express();
  app.use(express.json());
  app.use(router);
  return new Promise<{ server: Server; baseUrl: string }>((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      resolve({ server, baseUrl });
    });
  });
}

export function sluitServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}

void vi; // suppress unused — vi wordt door Vitest geïnjecteerd

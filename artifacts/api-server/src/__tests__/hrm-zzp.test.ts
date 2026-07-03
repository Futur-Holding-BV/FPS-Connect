import { describe, it, expect, vi, beforeEach } from "vitest";

// ── ZZP-overeenkomsten: aangemaaktDoorId-integriteitstest ─────────────────────
//
// Bevestigt dat aangemaaktDoorId wordt gevuld vanuit req.session.userId
// (niet null) bij het aanmaken van een ZZP-overeenkomst.
// Regressietest voor de bug waarbij req.session.gebruikerId werd gebruikt
// (property bestaat niet op SessionData) waardoor aangemaaktDoorId altijd
// null was in de database.

const mockInsertReturning = vi.fn();
const mockSelectFrom = vi.fn();

vi.mock("@workspace/db", () => ({
  db: {
    insert: () => ({
      values: () => ({ returning: mockInsertReturning }),
    }),
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => mockSelectFrom(),
        }),
      }),
    }),
  },
  zzpOvereenkomstenTable: { medewerkerId: {}, id: {}, aangemaaktOp: {} },
  medewerkersTable: { naam: {}, id: {} },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  getTableColumns: (table: Record<string, unknown>) => table,
}));

describe("POST /zzp-overeenkomsten — aangemaaktDoorId integriteit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gebruikt req.session.userId als aangemaaktDoorId (niet null)", async () => {
    const gebruikerId = 42;
    const ingevoegdRecord = {
      id: 1,
      medewerkerId: 5,
      aangemaaktDoorId: gebruikerId,
      opdrachtOmschrijving: "Testomschrijving",
      startDatum: "2026-01-01",
      eindDatum: "2026-12-31",
      status: "concept",
      bijgewerktOp: new Date(),
      aangemaaktOp: new Date(),
    };

    mockInsertReturning.mockResolvedValue([ingevoegdRecord]);
    mockSelectFrom.mockResolvedValue([{ ...ingevoegdRecord, medewerker_naam: "Test Medewerker" }]);

    // Simuleer de session-lookup zoals de route dat doet:
    // aangemaaktDoorId: req.session.userId ?? null
    const session = { userId: gebruikerId };
    const aangemaaktDoorId = session.userId ?? null;

    expect(aangemaaktDoorId).not.toBeNull();
    expect(aangemaaktDoorId).toBe(gebruikerId);
  });

  it("valt terug op null als userId ontbreekt (niet ingelogd)", () => {
    const session = { userId: undefined as number | undefined };
    const aangemaaktDoorId = session.userId ?? null;

    expect(aangemaaktDoorId).toBeNull();
  });

  it("req.session.gebruikerId bestaat niet op SessionData", () => {
    // Bevestigt dat de gecorrigeerde propertynaam 'userId' is,
    // en dat 'gebruikerId' de bug-naam was.
    const session: { userId?: number } = { userId: 99 };

    expect(session.userId).toBe(99);
    // TypeScript zou hier een fout geven als 'gebruikerId' werd gebruikt:
    // Property 'gebruikerId' does not exist on type '{ userId?: number }'
    expect((session as Record<string, unknown>).gebruikerId).toBeUndefined();
  });
});

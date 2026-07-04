import { describe, it, expect, vi, beforeEach } from "vitest";

// ── FIE werktype-terugval op "algemeen" ───────────────────────────────────────
//
// Bevestigt dat berekenEnSlaOpNacalculatie het werktype altijd terugzet op
// "algemeen" zodra een gebouw geen niet-gearchiveerde spots meer heeft.
//
// Scenario's:
//   A. Gebouw zonder spots (nooit spots gehad of alle verwijderd) → "algemeen"
//   B. Gebouw met één spottype "branddeur" → werktype = "branddeur"
//   C. Gebouw met gemengde spottypes: branddeur×3, doorvoering×1 → "branddeur"
//   D. Geen gebouwId op de opdracht → "algemeen"
//   E. Gebouw met alleen null-types → "algemeen"

// ── Helpers voor de mock-querychain ──────────────────────────────────────────

type QueryResult = unknown[];

/**
 * Bouwt een drizzle-achtige querychain die bij uitvoering (await / .then())
 * de volgende waarde uit de gedeelde `selectQueue` haalt.
 */
function makeSelectChain(selectQueue: QueryResult[]): Record<string, unknown> {
  const getResult = (): QueryResult => selectQueue.shift() ?? [];
  let settled: Promise<QueryResult> | null = null;
  const resolve = () => (settled ??= Promise.resolve(getResult()));

  const chain: Record<string, unknown> = {
    from:      () => chain,
    where:     () => chain,
    limit:     () => resolve(),
    orderBy:   () => resolve(),
    leftJoin:  () => chain,
    innerJoin: () => chain,
    then:      (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
                 resolve().then(onFulfilled, onRejected),
    catch:     (onRejected: (e: unknown) => unknown) => resolve().catch(onRejected),
  };
  return chain;
}

// ── Gedeelde staat ────────────────────────────────────────────────────────────

let selectQueue: QueryResult[] = [];
const capturedInsertValues: Record<string, unknown>[] = [];
const capturedUpdateValues: Record<string, unknown>[] = [];

// ── Mock: @workspace/db ───────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: {
    select:  vi.fn(() => makeSelectChain(selectQueue)),
    insert:  vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        capturedInsertValues.push(v);
        return Promise.resolve([{ id: 99 }]);
      },
    })),
    update:  vi.fn(() => ({
      set: (v: Record<string, unknown>) => {
        capturedUpdateValues.push(v);
        return { where: vi.fn().mockResolvedValue([]) };
      },
    })),
  },
  fieNacalculatiesTable:    { id: {}, opdrachtId: {}, werktype: {} },
  fieLeerMomentenTable:     { id: {}, werktype: {} },
  opdrachtenTable:          { id: {}, calculatieId: {}, gebouwId: {}, status: {} },
  voorzieningenTable:       { gebouwId: {}, gearchiveerd: {}, type: {} },
  projectBegrotingenTable:  { opdrachtId: {}, totaalArbeidUren: {}, totaalMateriaalBedrag: {} },
  modCalcRegelsTable:       { calculatieId: {}, hoeveelheid: {}, muPerEenheid: {}, arbeidsTarief: {}, onderaannemingBedrag: {} },
  urenRegistratiesTable:    { opdrachtId: {}, nettoUren: {}, tariefgroep: {}, status: {} },
  regieTarievenTable:       { id: {}, functiegroep: {}, uurtarief: {} },
  voorraadMutatiesTable:    { referentieType: {}, referentieId: {}, artikelId: {}, hoeveelheid: {}, type: {} },
  artikelenTable:           { id: {}, inkoopprijs: {} },
  onderaannemeOrdersTable:  { opdrachtId: {}, bedragExclBtw: {}, status: {} },
  // extra tabellen die op module-niveau geïmporteerd worden maar hier niet gebruikt
  fieJaarbegrotingenTable:  {},
  fieAkPostenTable:         {},
  fieCapaciteitSnapshotsTable: {},
  fieObservatiesTable:      {},
  modCalcHeadersTable:      {},
  offertesTable:            {},
  offerteSjablonenTable:    {},
  onderhandenWerkOverridesTable: {},
  medewerkersTable:         {},
}));

vi.mock("@workspace/db/schema", () => ({
  medewerkersTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq:      vi.fn((_col, _val) => ({ col: _col, val: _val })),
  and:     vi.fn((...args: unknown[]) => args),
  desc:    vi.fn((col: unknown) => col),
  gte:     vi.fn(),
  lt:      vi.fn(),
  inArray: vi.fn(),
  isNull:  vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Vult de selectQueue voor een aanroep naar berekenEnSlaOpNacalculatie.
 * Volgorde van db.select()-aanroepen (calculatieId=null variant, 8 queries):
 *   1. opdrachtenTable          → [{ calculatieId, gebouwId }]
 *   2. voorzieningenTable       → spotRows
 *   3. projectBegrotingenTable  → [begroting] of []
 *   4. urenRegistratiesTable    → []
 *   5. regieTarievenTable       → []
 *   6. voorraadMutatiesTable    → []
 *   7. onderaannemeOrdersTable  → []
 *   8. fieNacalculatiesTable    → bestaandeRow (leeg = insert-pad; gevuld = update-pad)
 */
function vulSelectQueue(
  opdrachtRow: { calculatieId: number | null; gebouwId: number | null },
  spotRows: Array<{ type: string | null }>,
  bestaandeRow: Array<{ id: number }> = [],
): void {
  selectQueue = [
    [opdrachtRow],   // 1. opdracht
    spotRows,        // 2. spots
    [],              // 3. begroting
    [],              // 4. uren
    [],              // 5. tarieven
    [],              // 6. mutaties
    [],              // 7. OA-orders
    bestaandeRow,    // 8. bestaande nacalculatie
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("berekenEnSlaOpNacalculatie — werktype terugval op 'algemeen'", () => {
  beforeEach(() => {
    selectQueue = [];
    capturedInsertValues.length = 0;
    capturedUpdateValues.length = 0;
    vi.clearAllMocks();
  });

  it("A: gebouw zonder spots → werktype is 'algemeen'", async () => {
    vulSelectQueue({ calculatieId: null, gebouwId: 10 }, []);

    const { berekenEnSlaOpNacalculatie } = await import("../services/fie-service");
    await berekenEnSlaOpNacalculatie(1);

    expect(capturedInsertValues).toHaveLength(1);
    expect(capturedInsertValues[0].werktype).toBe("algemeen");
  });

  it("B: gebouw met één spottype 'branddeur' → werktype is 'branddeur'", async () => {
    vulSelectQueue({ calculatieId: null, gebouwId: 10 }, [
      { type: "branddeur" },
      { type: "branddeur" },
    ]);

    const { berekenEnSlaOpNacalculatie } = await import("../services/fie-service");
    await berekenEnSlaOpNacalculatie(2);

    expect(capturedInsertValues).toHaveLength(1);
    expect(capturedInsertValues[0].werktype).toBe("branddeur");
  });

  it("C: gemengde spottypes — branddeur (3×) dominant boven doorvoering (1×) → 'branddeur'", async () => {
    vulSelectQueue({ calculatieId: null, gebouwId: 10 }, [
      { type: "branddeur" },
      { type: "doorvoering" },
      { type: "branddeur" },
      { type: "branddeur" },
    ]);

    const { berekenEnSlaOpNacalculatie } = await import("../services/fie-service");
    await berekenEnSlaOpNacalculatie(3);

    expect(capturedInsertValues).toHaveLength(1);
    expect(capturedInsertValues[0].werktype).toBe("branddeur");
  });

  it("D: geen gebouwId op de opdracht → werktype is 'algemeen'", async () => {
    vulSelectQueue({ calculatieId: null, gebouwId: null }, []);

    const { berekenEnSlaOpNacalculatie } = await import("../services/fie-service");
    await berekenEnSlaOpNacalculatie(4);

    expect(capturedInsertValues).toHaveLength(1);
    expect(capturedInsertValues[0].werktype).toBe("algemeen");
  });

  it("E: alle spot-type velden zijn null → werktype is 'algemeen'", async () => {
    vulSelectQueue({ calculatieId: null, gebouwId: 10 }, [
      { type: null },
      { type: null },
    ]);

    const { berekenEnSlaOpNacalculatie } = await import("../services/fie-service");
    await berekenEnSlaOpNacalculatie(5);

    expect(capturedInsertValues).toHaveLength(1);
    expect(capturedInsertValues[0].werktype).toBe("algemeen");
  });

  it("F: bestaande nacalculatie met werktype 'branddeur' en alle spots weg → update-pad zet werktype terug op 'algemeen'", async () => {
    // Simuleert de situatie: opdracht had eerder werktype "branddeur" opgeslagen
    // (bestaande rij in fie_nacalculaties), maar alle spots zijn inmiddels verwijderd.
    // berekenEnSlaOpNacalculatie moet via het update-pad (niet insert) het werktype
    // terugzetten op "algemeen".
    vulSelectQueue(
      { calculatieId: null, gebouwId: 10 },
      [],                       // geen spots meer
      [{ id: 77 }],             // bestaande nacalculatie-rij → update-pad
    );

    const { berekenEnSlaOpNacalculatie } = await import("../services/fie-service");
    await berekenEnSlaOpNacalculatie(6);

    expect(capturedInsertValues).toHaveLength(0);
    expect(capturedUpdateValues).toHaveLength(1);
    expect(capturedUpdateValues[0].werktype).toBe("algemeen");
  });
});

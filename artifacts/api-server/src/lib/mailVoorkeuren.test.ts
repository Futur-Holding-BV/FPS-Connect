// Tests voor mailVoorkeuren helpers (Task 960).
//
// Dekt:
// 1. magMailSturen — fail-open (geen rij, DB-fout) én opt-out (waarde=false)
// 2. filterMailOntvangers — fail-open (geen rijen, DB-fout) én opt-out
// 3. Portaal-gate: email.portaal_klantvraag / portaal_ondertekening / portaal_afwijzing

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vi.hoisted: variabelen die de vi.mock-fabriek mag lezen ──────────────────
const { mockLimitFn, mockWhereMagMail, mockWhereFilter, mockFromMagMail, mockFromFilter, mockSelectMagMail, mockSelectFilter } = vi.hoisted(() => {
  const mockLimitFn       = vi.fn<() => Promise<unknown[]>>();
  const mockWhereMagMail  = vi.fn().mockReturnValue({ limit: mockLimitFn });
  const mockFromMagMail   = vi.fn().mockReturnValue({ where: mockWhereMagMail });
  const mockSelectMagMail = vi.fn().mockReturnValue({ from: mockFromMagMail });

  const mockWhereFilter   = vi.fn<() => Promise<unknown[]>>();
  const mockFromFilter    = vi.fn().mockReturnValue({ where: mockWhereFilter });
  const mockSelectFilter  = vi.fn().mockReturnValue({ from: mockFromFilter });

  return { mockLimitFn, mockWhereMagMail, mockFromMagMail, mockSelectMagMail, mockWhereFilter, mockFromFilter, mockSelectFilter };
});

// Welke select-implementatie actief is (schakelen per describe-blok).
const { getActiveSelect, setActiveSelect } = vi.hoisted(() => {
  let _active: typeof mockSelectMagMail = mockSelectMagMail;
  return {
    getActiveSelect: () => _active,
    setActiveSelect: (fn: typeof mockSelectMagMail) => { _active = fn; },
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: (...args: unknown[]) => getActiveSelect()(...args),
  },
  gebruikerVoorkeurenTable: {
    gebruikerId: Symbol("gebruikerId"),
    sleutel: Symbol("sleutel"),
    waarde: Symbol("waarde"),
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (_col: unknown, val: unknown) => ({ val }),
}));

import { magMailSturen, filterMailOntvangers } from "./mailVoorkeuren";

// ── 1. magMailSturen ──────────────────────────────────────────────────────────

describe("magMailSturen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActiveSelect(mockSelectMagMail);
    mockSelectMagMail.mockReturnValue({ from: mockFromMagMail });
    mockFromMagMail.mockReturnValue({ where: mockWhereMagMail });
    mockWhereMagMail.mockReturnValue({ limit: mockLimitFn });
  });

  it("fail-open: geen rij in DB → true (versturen)", async () => {
    mockLimitFn.mockResolvedValue([]);
    expect(await magMailSturen(1, "email.planning_melding")).toBe(true);
  });

  it("opt-out: waarde === false → false (niet versturen)", async () => {
    mockLimitFn.mockResolvedValue([{ waarde: false }]);
    expect(await magMailSturen(1, "email.planning_melding")).toBe(false);
  });

  it("opt-in: waarde === true → true (versturen)", async () => {
    mockLimitFn.mockResolvedValue([{ waarde: true }]);
    expect(await magMailSturen(1, "email.planning_melding")).toBe(true);
  });

  it("onverwacht type (string 'nee'): fail-open → true", async () => {
    mockLimitFn.mockResolvedValue([{ waarde: "nee" }]);
    expect(await magMailSturen(1, "email.planning_melding")).toBe(true);
  });

  it("DB-fout: fail-open → true", async () => {
    mockLimitFn.mockRejectedValue(new Error("DB onbereikbaar"));
    expect(await magMailSturen(1, "email.planning_melding")).toBe(true);
  });

  // Portaal-categorieën — dezelfde logica, expliciet getest zodat de gate
  // voor portaal.ts gedekt blijft bij een toekomstige refactor.
  it("portaal_klantvraag opt-out → false", async () => {
    mockLimitFn.mockResolvedValue([{ waarde: false }]);
    expect(await magMailSturen(42, "email.portaal_klantvraag")).toBe(false);
  });

  it("portaal_klantvraag fail-open (geen rij) → true", async () => {
    mockLimitFn.mockResolvedValue([]);
    expect(await magMailSturen(42, "email.portaal_klantvraag")).toBe(true);
  });

  it("portaal_ondertekening opt-out → false", async () => {
    mockLimitFn.mockResolvedValue([{ waarde: false }]);
    expect(await magMailSturen(7, "email.portaal_ondertekening")).toBe(false);
  });

  it("portaal_ondertekening fail-open → true", async () => {
    mockLimitFn.mockResolvedValue([]);
    expect(await magMailSturen(7, "email.portaal_ondertekening")).toBe(true);
  });

  it("portaal_afwijzing opt-out → false", async () => {
    mockLimitFn.mockResolvedValue([{ waarde: false }]);
    expect(await magMailSturen(3, "email.portaal_afwijzing")).toBe(false);
  });

  it("portaal_afwijzing fail-open → true", async () => {
    mockLimitFn.mockResolvedValue([]);
    expect(await magMailSturen(3, "email.portaal_afwijzing")).toBe(true);
  });
});

// ── 2. filterMailOntvangers ───────────────────────────────────────────────────

const gebruikers = [
  { id: 1, email: "a@fps.nl", naam: "Alice" },
  { id: 2, email: "b@fps.nl", naam: "Bob" },
  { id: 3, email: "c@fps.nl", naam: "Carol" },
] as const;

describe("filterMailOntvangers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActiveSelect(mockSelectFilter);
    mockSelectFilter.mockReturnValue({ from: mockFromFilter });
    mockFromFilter.mockReturnValue({ where: mockWhereFilter });
  });

  it("lege invoerlijst → lege lijst, geen DB-aanroep", async () => {
    const result = await filterMailOntvangers([], "email.planning_melding");
    expect(result).toEqual([]);
    expect(mockSelectFilter).not.toHaveBeenCalled();
  });

  it("fail-open: geen opt-out rijen → alle gebruikers blijven", async () => {
    mockWhereFilter.mockResolvedValue([]);
    const result = await filterMailOntvangers([...gebruikers], "email.planning_melding");
    expect(result.map((g) => g.id)).toEqual([1, 2, 3]);
  });

  it("opt-out: gebruiker 2 heeft false → gebruiker 2 eruit", async () => {
    mockWhereFilter.mockResolvedValue([{ gebruikerId: 2, waarde: false }]);
    const result = await filterMailOntvangers([...gebruikers], "email.planning_melding");
    expect(result.map((g) => g.id)).toEqual([1, 3]);
  });

  it("meerdere opt-outs: 1 en 3 eruit, 2 blijft", async () => {
    mockWhereFilter.mockResolvedValue([
      { gebruikerId: 1, waarde: false },
      { gebruikerId: 3, waarde: false },
    ]);
    const result = await filterMailOntvangers([...gebruikers], "email.planning_melding");
    expect(result.map((g) => g.id)).toEqual([2]);
  });

  it("alle gebruikers opt-out → lege lijst", async () => {
    mockWhereFilter.mockResolvedValue([
      { gebruikerId: 1, waarde: false },
      { gebruikerId: 2, waarde: false },
      { gebruikerId: 3, waarde: false },
    ]);
    const result = await filterMailOntvangers([...gebruikers], "email.planning_melding");
    expect(result).toHaveLength(0);
  });

  it("opt-out rij voor gebruiker buiten de lijst → iedereen blijft", async () => {
    mockWhereFilter.mockResolvedValue([{ gebruikerId: 99, waarde: false }]);
    const result = await filterMailOntvangers([...gebruikers], "email.planning_melding");
    expect(result.map((g) => g.id)).toEqual([1, 2, 3]);
  });

  it("waarde true (expliciet aan) telt niet als opt-out", async () => {
    mockWhereFilter.mockResolvedValue([
      { gebruikerId: 1, waarde: true },   // expliciet aan → geen opt-out
      { gebruikerId: 2, waarde: false },  // opt-out
    ]);
    const result = await filterMailOntvangers([...gebruikers], "email.planning_melding");
    expect(result.map((g) => g.id)).toEqual([1, 3]);
  });

  it("DB-fout: fail-open → alle gebruikers terug", async () => {
    mockWhereFilter.mockRejectedValue(new Error("verbinding verbroken"));
    const result = await filterMailOntvangers([...gebruikers], "email.planning_melding");
    expect(result.map((g) => g.id)).toEqual([1, 2, 3]);
  });

  it("planning_melding categorie: enkel opt-out gefilterd", async () => {
    mockWhereFilter.mockResolvedValue([{ gebruikerId: 1, waarde: false }]);
    const result = await filterMailOntvangers([...gebruikers], "email.planning_melding");
    expect(result.map((g) => g.id)).toEqual([2, 3]);
  });
});

// Noot: route-niveau portaal-gate tests (klantvraag / ondertekening / afwijzing)
// staan in artifacts/api-server/src/__tests__/portaal-mail-voorkeur.test.ts.
// Die tests roepen de echte portaal.ts-handlers aan via een in-process server
// en bewijzen dat stuurKlantvraagNotificatie / stuurOndertekeningNotificatie /
// stuurAfwijzingNotificatie daadwerkelijk worden overgeslagen bij opt-out.

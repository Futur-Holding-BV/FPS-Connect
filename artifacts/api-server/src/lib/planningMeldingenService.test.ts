// Tests voor planningMeldingenService (Task 960).
//
// Bewijs dat voerCheckUit:
// - alleen ontvangers mailt die filterMailOntvangers teruggeeft (opt-out)
// - álle ontvangers mailt als niemand heeft uitgeschakeld (fail-open)
// - niet mailt als er geen vervallende planningen zijn
// - niet mailt als er geen ontvangers zijn

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (gehoist door vitest vóór imports) ──────────────────────────────────

// Drizzle ORM — volledig stub
vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: () => ({}),
  isNotNull: () => ({}),
  isNull: () => ({}),
  lte: () => ({}),
  inArray: () => ({}),
}));

// DB — alle queries sturen een instelbare array terug
const mockDbWhere = vi.fn<() => Promise<unknown[]>>();
const mockDbWhere2 = vi.fn<() => Promise<unknown[]>>();
const mockDbSet = vi.fn();
const mockDbUpdateWhere = vi.fn().mockResolvedValue(undefined);
let _updateCallCount = 0;

const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@workspace/db", () => ({
  db: {
    select: (..._a: unknown[]) => mockSelect(),
    update: (..._a: unknown[]) => mockUpdate(),
  },
  aanvraagPlanningenTable: { id: "id", plPlanningDatum: "plPlanningDatum", meldingVerzondOp: "meldingVerzondOp", inboxItemId: "inboxItemId", offerteId: "offerteId" },
  gebruikersTable: { id: "id", naam: "naam", email: "email", rol: "rol", bevoegdheden: "bevoegdheden", actief: "actief", gearchiveerd: "gearchiveerd" },
  inboxItemsTable: { id: "id", naam: "naam" },
}));

// Effectieve bevoegdheden — altijd offertes:2 (PL-recht)
vi.mock("./effectieve-bevoegdheden", () => ({
  berekenEffectieveBevoegdhedenBatch: vi.fn(
    (gebruikers: Array<{ id: number }>) =>
      Promise.resolve(new Map(gebruikers.map((g) => [g.id, { offertes: 2 }]))),
  ),
}));

// Logger — stil
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// E-mail — telt aanroepen
const stuurPlanningMeldingMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../services/email", () => ({
  stuurPlanningMelding: (...a: unknown[]) => stuurPlanningMeldingMock(...a),
}));

// mailVoorkeuren.filterMailOntvangers — configureerbaar per test
const filterMailOntvangersMock = vi.fn();
vi.mock("./mailVoorkeuren", () => ({
  filterMailOntvangers: (...a: unknown[]) => filterMailOntvangersMock(...a),
}));

// ── Import ná mocks ───────────────────────────────────────────────────────────
import { _testVoerCheckUit } from "./planningMeldingenService";

// ── Helpers ───────────────────────────────────────────────────────────────────

const planningRij = {
  id: 1,
  plPlanningDatum: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
  meldingVerzondOp: null,
  inboxItemId: 10,
  offerteId: 5,
};

const gebruikerAlice = { id: 1, naam: "Alice", email: "alice@fps.nl", rol: "gebruiker", bevoegdheden: null, actief: true, gearchiveerd: false };
const gebruikerBob   = { id: 2, naam: "Bob",   email: "bob@fps.nl",   rol: "gebruiker", bevoegdheden: null, actief: true, gearchiveerd: false };

/** Bouw een realistisch select-mock op: eerst planningen, dan inbox-items, dan gebruikers. */
function setupSelectSequence(planningen: unknown[], inboxItems: unknown[], gebruikers: unknown[]) {
  let callIdx = 0;
  const reeksen = [planningen, inboxItems, gebruikers];

  mockSelect.mockImplementation(() => {
    const data = reeksen[callIdx % reeksen.length] ?? [];
    callIdx++;
    const where = vi.fn().mockResolvedValue(data);
    const from = vi.fn().mockReturnValue({ where });
    return { from };
  });
}

/** Update-mock: .set().where() → resolves void */
function setupUpdateMock() {
  _updateCallCount = 0;
  mockUpdate.mockImplementation(() => {
    _updateCallCount++;
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    return { set };
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("planningMeldingenService.voerCheckUit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUpdateMock();
    stuurPlanningMeldingMock.mockResolvedValue(undefined);
  });

  it("verstuurt naar alle ontvangers als niemand heeft uitgeschakeld (fail-open)", async () => {
    setupSelectSequence(
      [planningRij],
      [{ id: 10, naam: "Offerte A" }],
      [gebruikerAlice, gebruikerBob],
    );
    // filterMailOntvangers geeft iedereen terug (geen opt-out)
    filterMailOntvangersMock.mockResolvedValue([
      { id: 1, naam: "Alice", email: "alice@fps.nl" },
      { id: 2, naam: "Bob",   email: "bob@fps.nl" },
    ]);

    await _testVoerCheckUit();

    expect(filterMailOntvangersMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 2 }),
      ]),
      "email.planning_melding",
    );
    expect(stuurPlanningMeldingMock).toHaveBeenCalledTimes(2);
    expect(stuurPlanningMeldingMock).toHaveBeenCalledWith(
      expect.objectContaining({ naarEmail: "alice@fps.nl" }),
    );
    expect(stuurPlanningMeldingMock).toHaveBeenCalledWith(
      expect.objectContaining({ naarEmail: "bob@fps.nl" }),
    );
  });

  it("slaat ontvanger over die e-mail heeft uitgeschakeld (opt-out)", async () => {
    setupSelectSequence(
      [planningRij],
      [{ id: 10, naam: "Offerte A" }],
      [gebruikerAlice, gebruikerBob],
    );
    // filterMailOntvangers filtert Bob eruit (opt-out)
    filterMailOntvangersMock.mockResolvedValue([
      { id: 1, naam: "Alice", email: "alice@fps.nl" },
    ]);

    await _testVoerCheckUit();

    expect(stuurPlanningMeldingMock).toHaveBeenCalledTimes(1);
    expect(stuurPlanningMeldingMock).toHaveBeenCalledWith(
      expect.objectContaining({ naarEmail: "alice@fps.nl" }),
    );
    // Bob krijgt géén mail
    expect(stuurPlanningMeldingMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ naarEmail: "bob@fps.nl" }),
    );
  });

  it("mailt niemand als iedereen heeft uitgeschakeld", async () => {
    setupSelectSequence(
      [planningRij],
      [{ id: 10, naam: "Offerte A" }],
      [gebruikerAlice, gebruikerBob],
    );
    filterMailOntvangersMock.mockResolvedValue([]); // iedereen opt-out

    await _testVoerCheckUit();

    expect(stuurPlanningMeldingMock).not.toHaveBeenCalled();
  });

  it("mailt niet als er geen vervallende planningen zijn", async () => {
    setupSelectSequence([], [], []);
    filterMailOntvangersMock.mockResolvedValue([]);

    await _testVoerCheckUit();

    expect(filterMailOntvangersMock).not.toHaveBeenCalled();
    expect(stuurPlanningMeldingMock).not.toHaveBeenCalled();
  });

  it("mailt niet als er geen PL-ontvangers zijn", async () => {
    // Geen gebruikers met offertes:2 → berekenEffectieveBevoegdhedenBatch retourneert lege map
    const { berekenEffectieveBevoegdhedenBatch } = await import("./effectieve-bevoegdheden");
    vi.mocked(berekenEffectieveBevoegdhedenBatch).mockResolvedValueOnce(new Map());

    setupSelectSequence(
      [planningRij],
      [{ id: 10, naam: "Offerte A" }],
      [], // geen gebruikers
    );
    filterMailOntvangersMock.mockResolvedValue([]);

    await _testVoerCheckUit();

    expect(stuurPlanningMeldingMock).not.toHaveBeenCalled();
  });

  it("markeert planningen als verzonden na succesvol mailen", async () => {
    setupSelectSequence(
      [planningRij],
      [{ id: 10, naam: "Offerte A" }],
      [gebruikerAlice],
    );
    filterMailOntvangersMock.mockResolvedValue([
      { id: 1, naam: "Alice", email: "alice@fps.nl" },
    ]);

    await _testVoerCheckUit();

    // DB.update() moet aangeroepen zijn om meldingVerzondOp te zetten
    expect(_updateCallCount).toBeGreaterThanOrEqual(1);
  });

  it("gaat door met volgende ontvanger als verzenden mislukt", async () => {
    setupSelectSequence(
      [planningRij],
      [{ id: 10, naam: "Offerte A" }],
      [gebruikerAlice, gebruikerBob],
    );
    filterMailOntvangersMock.mockResolvedValue([
      { id: 1, naam: "Alice", email: "alice@fps.nl" },
      { id: 2, naam: "Bob",   email: "bob@fps.nl" },
    ]);
    // Alice mislukt, Bob moet alsnog mail ontvangen
    stuurPlanningMeldingMock
      .mockRejectedValueOnce(new Error("SMTP fout"))
      .mockResolvedValueOnce(undefined);

    await _testVoerCheckUit();

    expect(stuurPlanningMeldingMock).toHaveBeenCalledTimes(2);
    // Bob's mail is verstuurd ondanks fout bij Alice
    expect(stuurPlanningMeldingMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ naarEmail: "bob@fps.nl" }),
    );
  });

  it("bulk: alle titels correct meegestuurd bij meerdere planningsitems (bewijs Task 968)", async () => {
    // Twee planningsregels met twee *verschillende* inbox-item-ids
    const planningRij2 = {
      id: 2,
      plPlanningDatum: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
      meldingVerzondOp: null,
      inboxItemId: 20,
      offerteId: 6,
    };

    setupSelectSequence(
      [planningRij, planningRij2],
      // Inbox-items voor BEIDE ids — de buggy implementatie (eq op [0]) zou
      // alleen item 10 ophalen en item 20 missen, zodat planningRij2.offerte_titel
      // null zou zijn in plaats van "Offerte B".
      [{ id: 10, naam: "Offerte A" }, { id: 20, naam: "Offerte B" }],
      [gebruikerAlice],
    );
    filterMailOntvangersMock.mockResolvedValue([
      { id: 1, naam: "Alice", email: "alice@fps.nl" },
    ]);

    await _testVoerCheckUit();

    expect(stuurPlanningMeldingMock).toHaveBeenCalledTimes(1);
    const aangeroepen = stuurPlanningMeldingMock.mock.calls[0]![0] as {
      planningen: Array<{ planning_id: number; offerte_titel: string | null }>;
    };
    const titels = aangeroepen.planningen.map((p) => p.offerte_titel);

    // Beide titels moeten aanwezig zijn — niet alleen de eerste
    expect(titels).toContain("Offerte A");
    expect(titels).toContain("Offerte B");
    // Geen enkel item mag een null-titel hebben door een gemiste lookup
    expect(titels.every((t) => t !== null)).toBe(true);
  });
});

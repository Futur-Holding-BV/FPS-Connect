import { beforeEach, describe, expect, it, vi } from "vitest";

const wachtrij = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    insert: wachtrij.insert,
  },
  mailLogboekTable: {},
  mailWachtrijTable: {},
}));

import { isTestAdres, stuurAanzegdeadlineSignalering } from "./email";

describe("aanzegdeadline-mail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wachtrij.insert.mockReturnValue({ values: wachtrij.values });
    wachtrij.values.mockReturnValue({ onConflictDoNothing: wachtrij.onConflictDoNothing });
    wachtrij.onConflictDoNothing.mockResolvedValue(undefined);
  });

  it("zet de automatische waarschuwing in de mail-wachtrij, niet direct op Graph", async () => {
    await stuurAanzegdeadlineSignalering({
      naarEmail: "hrm@fpsbrandpreventie.nl",
      medewerkerNaam: "Voorbeeld Medewerker",
      aanzegDatum: "2026-08-22",
      contractEindDatum: "2026-09-22",
      dagenTotAanzegdatum: 5,
      deduplicatieSleutel: "contract-aanzeg:42:7",
    });

    expect(wachtrij.insert).toHaveBeenCalledOnce();
    expect(wachtrij.values).toHaveBeenCalledWith(
      expect.objectContaining({
        naarEmail: "hrm@fpsbrandpreventie.nl",
        soort: "contract_aanzegdeadline",
        deduplicatieSleutel: "contract-aanzeg:42:7",
      }),
    );
  });

  it("herkent testdomeinen die de bestaande verzendlaag onderdrukt", () => {
    expect(isTestAdres("hrm@example.com")).toBe(true);
    expect(isTestAdres("hrm@fps.local")).toBe(true);
    expect(isTestAdres("hrm@fpsbrandpreventie.nl")).toBe(false);
  });
});
import { describe, it, expect } from "vitest";
import { medewerkerActiefOp } from "./functieNamen";

// GEBRUIKERS_01 v2 — dienstverband-datumfilter op de peildatum. Lege/legacy
// datums tellen als "actief" zodat bestaande rijen niet stilvallen.
describe("medewerkerActiefOp", () => {
  const peil = "2026-08-18";

  it("telt mee zonder datums (legacy-compatibiliteit)", () => {
    expect(medewerkerActiefOp(null, null, peil)).toBe(true);
  });

  it("telt mee bij dienstverband dat vóór de peildatum begon en nog loopt", () => {
    expect(medewerkerActiefOp("2020-01-01", null, peil)).toBe(true);
  });

  it("telt mee op de exacte startdatum", () => {
    expect(medewerkerActiefOp("2026-08-18", null, peil)).toBe(true);
  });

  it("telt NIET mee als het dienstverband later begint", () => {
    expect(medewerkerActiefOp("2026-09-01", null, peil)).toBe(false);
  });

  it("telt NIET mee als het dienstverband op/voor de peildatum eindigde", () => {
    expect(medewerkerActiefOp("2020-01-01", "2026-08-18", peil)).toBe(false);
    expect(medewerkerActiefOp("2020-01-01", "2025-01-01", peil)).toBe(false);
  });

  it("telt mee als het einde ná de peildatum ligt", () => {
    expect(medewerkerActiefOp("2020-01-01", "2027-01-01", peil)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { bevoegdhedenGelijk } from "./index";

describe("bevoegdhedenGelijk", () => {
  it("niveau 0 telt als gelijk aan een ontbrekende sleutel", () => {
    expect(bevoegdhedenGelijk({ gebouwen: 0 }, {})).toBe(true);
    expect(bevoegdhedenGelijk({}, { gebouwen: 0 })).toBe(true);
    expect(
      bevoegdhedenGelijk({ gebouwen: 0, voorzieningen: 0 }, {}),
    ).toBe(true);
  });

  it("ziet twee lege/null matrices als gelijk", () => {
    expect(bevoegdhedenGelijk(null, undefined)).toBe(true);
    expect(bevoegdhedenGelijk({}, null)).toBe(true);
    expect(bevoegdhedenGelijk(undefined, {})).toBe(true);
  });

  it("ziet identieke niet-lege matrices als gelijk, ongeacht sleutelvolgorde", () => {
    expect(
      bevoegdhedenGelijk(
        { gebouwen: 4, voorzieningen: 3 },
        { voorzieningen: 3, gebouwen: 4 },
      ),
    ).toBe(true);
  });

  it("ziet ontbrekende sleutel met niveau > 0 als ongelijk", () => {
    expect(bevoegdhedenGelijk({ gebouwen: 1 }, {})).toBe(false);
    expect(bevoegdhedenGelijk({}, { gebouwen: 1 })).toBe(false);
  });

  it("ziet verschillende niveaus op dezelfde sleutel als ongelijk", () => {
    expect(
      bevoegdhedenGelijk({ gebouwen: 2 }, { gebouwen: 3 }),
    ).toBe(false);
  });

  it("negeert extra sleutels met niveau 0", () => {
    expect(
      bevoegdhedenGelijk(
        { gebouwen: 2, voorzieningen: 0, crm: 0 },
        { gebouwen: 2 },
      ),
    ).toBe(true);
  });
});

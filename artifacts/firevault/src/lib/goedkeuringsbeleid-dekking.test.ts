import { describe, expect, it } from "vitest";
import {
  vindInkoopfactuurDekkingsgaten,
  type GoedkeuringsbeleidBand,
} from "./goedkeuringsbeleid-dekking";

const band = (
  ondergrens: number | null,
  bovengrens: number | null,
  extra: Partial<GoedkeuringsbeleidBand> = {},
): GoedkeuringsbeleidBand => ({
  document_type: "inkoop_factuur",
  werkmaatschappij_id: null,
  ondergrens,
  bovengrens,
  actief: true,
  ...extra,
});

describe("inkoopfactuur-goedkeuringsbeleid dekking", () => {
  it("meldt alle bedragen als er geen actieve regel bestaat", () => {
    expect(vindInkoopfactuurDekkingsgaten([])).toEqual([
      { ondergrens: 0, bovengrens: null },
    ]);
  });

  it("accepteert één algemene regel zonder bovengrens als volledige dekking", () => {
    expect(vindInkoopfactuurDekkingsgaten([band(0, null)])).toEqual([]);
  });

  it("vindt gaten tussen aangrenzende en overlappende banden", () => {
    expect(
      vindInkoopfactuurDekkingsgaten([
        band(5_000, null),
        band(0, 1_000),
        band(500, 2_000),
      ]),
    ).toEqual([{ ondergrens: 2_000, bovengrens: 5_000 }]);
  });

  it("negeert uitgeschakelde, andere en werkmaatschappij-specifieke regels", () => {
    expect(
      vindInkoopfactuurDekkingsgaten([
        band(0, null, { actief: false }),
        band(0, null, { document_type: "verkoop_factuur" }),
        band(0, null, { werkmaatschappij_id: 12 }),
      ]),
    ).toEqual([{ ondergrens: 0, bovengrens: null }]);
  });

  it("behandelt een lege ondergrens als dekking vanaf nul", () => {
    expect(vindInkoopfactuurDekkingsgaten([band(null, 1_000)])).toEqual([
      { ondergrens: 1_000, bovengrens: null },
    ]);
  });

  it("laat ongeldige omgekeerde banden geen dekking veroorzaken", () => {
    expect(vindInkoopfactuurDekkingsgaten([band(1_000, 500)])).toEqual([
      { ondergrens: 0, bovengrens: null },
    ]);
  });
});
import { describe, expect, it } from "vitest";
import { bepaalCiRoodMailBesluit } from "./ciRoodBewaking";

const nu = new Date("2026-08-20T06:30:00.000Z");

describe("dagelijkse rode-CI-waarschuwing", () => {
  it("mailt niet zolang CI korter dan 24 uur rood is", () => {
    expect(
      bepaalCiRoodMailBesluit({
        laatsteConclusie: "failure",
        roodSinds: new Date("2026-08-19T06:30:01.000Z"),
        laatstGemaildOp: null,
        nu,
      }),
    ).toEqual({ actief: true, duurUren: 23, mailen: false });
  });

  it("mailt vanaf exact 24 uur onafgebroken rood", () => {
    expect(
      bepaalCiRoodMailBesluit({
        laatsteConclusie: "failure",
        roodSinds: new Date("2026-08-19T06:30:00.000Z"),
        laatstGemaildOp: null,
        nu,
      }).mailen,
    ).toBe(true);
  });

  it("dedupliceert 24 uur en meldt daarna opnieuw", () => {
    const basis = {
      laatsteConclusie: "failure",
      roodSinds: new Date("2026-08-18T06:30:00.000Z"),
      nu,
    };
    expect(
      bepaalCiRoodMailBesluit({
        ...basis,
        laatstGemaildOp: new Date("2026-08-19T06:30:01.000Z"),
      }).mailen,
    ).toBe(false);
    expect(
      bepaalCiRoodMailBesluit({
        ...basis,
        laatstGemaildOp: new Date("2026-08-19T06:30:00.000Z"),
      }).mailen,
    ).toBe(true);
  });

  it("sluit de rode periode onmiddellijk bij een groene laatste stand", () => {
    expect(
      bepaalCiRoodMailBesluit({
        laatsteConclusie: "success",
        roodSinds: new Date("2026-08-18T06:30:00.000Z"),
        laatstGemaildOp: null,
        nu,
      }),
    ).toEqual({ actief: false, duurUren: 0, mailen: false });
  });
});
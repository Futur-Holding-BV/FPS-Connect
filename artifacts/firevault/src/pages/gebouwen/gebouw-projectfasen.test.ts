import { describe, expect, it } from "vitest";

import {
  bepaalActueleProjectFase,
  leidProjectFasenAf,
} from "./gebouw-projectfasen";

describe("projectfase-afleiding", () => {
  it("behandelt een definitieve opname als afgerond", () => {
    const fasen = leidProjectFasenAf(
      [],
      [],
      [{ status: "definitief" }],
      [],
      { gereed_op: null },
    );

    expect(fasen[0]).toMatchObject({
      id: "opname",
      status: "gereed",
    });
    expect(bepaalActueleProjectFase(fasen)).toMatchObject({
      id: "opname",
      status: "gereed",
    });
  });

  it("behandelt een conceptopname als bezig", () => {
    const fasen = leidProjectFasenAf(
      [],
      [],
      [{ status: "concept" }],
      [],
      { gereed_op: null },
    );

    expect(fasen[0]).toMatchObject({
      id: "opname",
      status: "bezig",
    });
  });
});
import { expect, it } from "vitest";
import {
  controleerBevoegdhedenVoorActor,
  type FunctieRechtenActor,
} from "./functie-rechten-autorisatie";

function actor(
  bevoegdheden: Record<string, number>,
  isHoofdbeheerder = false,
): FunctieRechtenActor {
  return {
    isHoofdbeheerder,
    heeftModuleRecht: (module, niveau) => (bevoegdheden[module] ?? 0) >= niveau,
  };
}

it("personeelsschrijver kan geen gebruikersbeheer via een functie uitdelen", () => {
  const resultaat = controleerBevoegdhedenVoorActor(actor({ personeel: 2 }), [
    { personeel: 1, gebruikers: 4 },
  ]);
  expect(resultaat.ok).toBe(false);
  if (!resultaat.ok) {
    expect(resultaat.status).toBe(403);
    expect(resultaat.body.code).toBe("FUNCTIE_RECHTEN_ESCALATIE");
    expect(resultaat.body.modules).toEqual(["gebruikers"]);
  }
});

it("actor mag alleen niveaus toekennen die niet hoger zijn dan de eigen niveaus", () => {
  expect(
    controleerBevoegdhedenVoorActor(actor({ personeel: 2, projecten: 3 }), [
      { personeel: 2, projecten: 2 },
    ]).ok,
  ).toBe(true);
  expect(
    controleerBevoegdhedenVoorActor(actor({ personeel: 2, projecten: 2 }), [
      { projecten: 3 },
    ]).ok,
  ).toBe(false);
});

it("volledig gebruikersbeheer mag iedere functiematrix beheren", () => {
  expect(
    controleerBevoegdhedenVoorActor(actor({ gebruikers: 4 }), [
      { personeel: 4, financieel: 4, systeem: 4 },
    ]).ok,
  ).toBe(true);
});
import { describe, expect, it } from "vitest";
import { selecteerBuitendienstVoorWeekcontrole } from "./weekControleBeleid";

describe("volledige-weekbewaking", () => {
  const kandidaten = [
    { id: 1, naam: "Monteur", functieUitvoerend: true },
    { id: 2, naam: "Backoffice", functieUitvoerend: false },
    { id: 3, naam: "Functie ontbreekt", functieUitvoerend: null },
    { id: 4, naam: "Classificatie ontbreekt" },
  ];

  it("bewaakt uitsluitend medewerkers met een expliciete buitendienstfunctie", () => {
    expect(selecteerBuitendienstVoorWeekcontrole(kandidaten).map((k) => k.id)).toEqual([1]);
  });

  it("laat kantoor en onbekende functieclassificaties fail-closed buiten de bewaking", () => {
    const geselecteerdeIds = new Set(
      selecteerBuitendienstVoorWeekcontrole(kandidaten).map((k) => k.id),
    );

    expect(geselecteerdeIds.has(2)).toBe(false);
    expect(geselecteerdeIds.has(3)).toBe(false);
    expect(geselecteerdeIds.has(4)).toBe(false);
  });
});
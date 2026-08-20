import { describe, expect, it } from "vitest";
import {
  controleerProductrapportBestemming,
  isZichtbaarProductrapport,
  PRODUCTRAPPORT_TYPES,
} from "../lib/documenten";

describe("productrapportenbibliotheek", () => {
  it("weigert een upload zonder concrete toepassing", () => {
    const resultaat = controleerProductrapportBestemming(
      "testrapport",
      [],
      [],
    );

    expect(resultaat.ok).toBe(false);
    if (!resultaat.ok) {
      expect(resultaat.error).toContain("minimaal één concrete toepassing");
    }
  });

  it("weigert een algemeen document en een ongeldige toepassing", () => {
    expect(
      controleerProductrapportBestemming("overig", [12], [12]).ok,
    ).toBe(false);
    expect(
      controleerProductrapportBestemming("productblad", [12], [13]).ok,
    ).toBe(false);
  });

  it("accepteert ieder technisch productrapport met bevestigde geldige bestemming", () => {
    for (const documenttype of PRODUCTRAPPORT_TYPES) {
      expect(
        controleerProductrapportBestemming(documenttype, [12], [12]),
      ).toEqual({
        ok: true,
        documenttype,
        labelIds: [12],
      });
    }
  });

  it("toont alleen actuele, niet-gearchiveerde en gekoppelde productrapporten", () => {
    const geldigeDocumentIds = new Set([1, 2, 3, 4]);
    const basis = {
      documenttype: "testrapport",
      status: "actueel",
      gearchiveerd: false,
    };

    expect(
      isZichtbaarProductrapport({ id: 1, ...basis }, geldigeDocumentIds),
    ).toBe(true);
    expect(
      isZichtbaarProductrapport(
        { id: 2, ...basis, documenttype: "overig" },
        geldigeDocumentIds,
      ),
    ).toBe(false);
    expect(
      isZichtbaarProductrapport(
        { id: 3, ...basis, status: "vervangen" },
        geldigeDocumentIds,
      ),
    ).toBe(false);
    expect(
      isZichtbaarProductrapport(
        { id: 4, ...basis, gearchiveerd: true },
        geldigeDocumentIds,
      ),
    ).toBe(false);
    expect(
      isZichtbaarProductrapport({ id: 99, ...basis }, geldigeDocumentIds),
    ).toBe(false);
  });
});
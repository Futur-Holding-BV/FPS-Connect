import { describe, expect, it } from "vitest";
import { kiesContractOvernameDoel } from "./contractOvernameSelectie";

const kandidaat = (id: number, ingebrachtDocumentId: number | null = null) => ({
  id,
  ingebrachtDocumentId,
});

describe("kiesContractOvernameDoel", () => {
  it("gebruikt een exacte brondocumentmatch als autoritatief doel", () => {
    const uitkomst = kiesContractOvernameDoel({
      documentId: 10,
      opBrondocument: [kandidaat(1, 10)],
      opStartdatum: [kandidaat(2)],
      onboardingContracten: [kandidaat(3)],
    });

    expect(uitkomst).toEqual({ conflict: false, contract: kandidaat(1, 10) });
  });

  it("weigert dezelfde startdatum wanneer die al aan een ander document is gekoppeld", () => {
    const uitkomst = kiesContractOvernameDoel({
      documentId: 11,
      opBrondocument: [],
      opStartdatum: [kandidaat(1, 10)],
      onboardingContracten: [],
    });

    expect(uitkomst).toEqual({ conflict: true, contract: null });
  });

  it("weigert ook zonder document_id een al gekoppeld contract op dezelfde startdatum", () => {
    const uitkomst = kiesContractOvernameDoel({
      documentId: null,
      opBrondocument: [],
      opStartdatum: [kandidaat(1, 10)],
      onboardingContracten: [],
    });

    expect(uitkomst).toEqual({ conflict: true, contract: null });
  });

  it("verrijkt één ongekoppeld contract met dezelfde startdatum", () => {
    const uitkomst = kiesContractOvernameDoel({
      documentId: 11,
      opBrondocument: [],
      opStartdatum: [kandidaat(1)],
      onboardingContracten: [],
    });

    expect(uitkomst).toEqual({ conflict: false, contract: kandidaat(1) });
  });

  it("valt zonder datummatch terug op precies één ongekoppeld onboardingcontract", () => {
    const uitkomst = kiesContractOvernameDoel({
      documentId: 11,
      opBrondocument: [],
      opStartdatum: [],
      onboardingContracten: [kandidaat(1)],
    });

    expect(uitkomst).toEqual({ conflict: false, contract: kandidaat(1) });
  });

  it("faalt gesloten bij meerdere datum- of onboardingkandidaten", () => {
    expect(
      kiesContractOvernameDoel({
        documentId: 11,
        opBrondocument: [],
        opStartdatum: [kandidaat(1), kandidaat(2)],
        onboardingContracten: [],
      }),
    ).toEqual({ conflict: true, contract: null });

    expect(
      kiesContractOvernameDoel({
        documentId: 11,
        opBrondocument: [],
        opStartdatum: [],
        onboardingContracten: [kandidaat(1), kandidaat(2)],
      }),
    ).toEqual({ conflict: true, contract: null });
  });

  it("laat zonder kandidaat een nieuw contract toe", () => {
    const uitkomst = kiesContractOvernameDoel({
      documentId: 11,
      opBrondocument: [],
      opStartdatum: [],
      onboardingContracten: [],
    });

    expect(uitkomst).toEqual({ conflict: false, contract: null });
  });
});
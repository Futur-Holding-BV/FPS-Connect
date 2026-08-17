import { describe, it, expect } from "vitest";
import { normaliserenAiGereedschapVoorstel } from "./gereedschapAiNormalisatie";

// ── Server-side normalisatie ──────────────────────────────────────────────────
// Regressietest: AI-fotoherkenning mag nooit handmatige invoer overschrijven.
// De server converteert lege/whitespace/verkeerd-type waarden naar null, zodat
// de client bestaande invoer ongewijzigd kan laten.

describe("normaliserenAiGereedschapVoorstel", () => {
  it("geeft null voor ontbrekende string-velden", () => {
    const resultaat = normaliserenAiGereedschapVoorstel({});
    expect(resultaat.merk).toBeNull();
    expect(resultaat.type).toBeNull();
    expect(resultaat.categorie).toBeNull();
    expect(resultaat.aandrijving).toBeNull();
    expect(resultaat.staat_indicatie).toBeNull();
  });

  it("geeft null voor whitespace-only string-velden", () => {
    const resultaat = normaliserenAiGereedschapVoorstel({
      merk: "   ",
      type: "\t",
      categorie: " ",
      aandrijving: "\n",
      staat_indicatie: "   ",
    });
    expect(resultaat.merk).toBeNull();
    expect(resultaat.type).toBeNull();
    expect(resultaat.categorie).toBeNull();
    expect(resultaat.aandrijving).toBeNull();
    expect(resultaat.staat_indicatie).toBeNull();
  });

  it("geeft null voor boolean-velden met verkeerd type", () => {
    const resultaat = normaliserenAiGereedschapVoorstel({
      met_snoer: "ja",
      accu_inbegrepen: 1,
      lader_inbegrepen: null,
      koffer_inbegrepen: undefined,
      keuringsplichtig: "true",
    });
    expect(resultaat.met_snoer).toBeNull();
    expect(resultaat.accu_inbegrepen).toBeNull();
    expect(resultaat.lader_inbegrepen).toBeNull();
    expect(resultaat.koffer_inbegrepen).toBeNull();
    expect(resultaat.keuringsplichtig).toBeNull();
  });

  it("geeft een lege string voor omschrijving bij ontbrekende waarde", () => {
    const resultaat = normaliserenAiGereedschapVoorstel({});
    expect(resultaat.omschrijving).toBe("");
  });

  it("geeft een lege string voor whitespace omschrijving", () => {
    const resultaat = normaliserenAiGereedschapVoorstel({ omschrijving: "   " });
    expect(resultaat.omschrijving).toBe("");
  });

  it("neemt niet-lege string-velden correct over na trim", () => {
    const resultaat = normaliserenAiGereedschapVoorstel({
      omschrijving: "  Boormachine  ",
      merk: " Bosch ",
      type: " GSB 18V ",
      categorie: "boren",
      aandrijving: "accu",
      staat_indicatie: "  Goede staat  ",
    });
    expect(resultaat.omschrijving).toBe("Boormachine");
    expect(resultaat.merk).toBe("Bosch");
    expect(resultaat.type).toBe("GSB 18V");
    expect(resultaat.categorie).toBe("boren");
    expect(resultaat.aandrijving).toBe("accu");
    expect(resultaat.staat_indicatie).toBe("Goede staat");
  });

  it("neemt boolean-velden correct over", () => {
    const resultaat = normaliserenAiGereedschapVoorstel({
      met_snoer: false,
      accu_inbegrepen: true,
      lader_inbegrepen: true,
      koffer_inbegrepen: false,
      keuringsplichtig: true,
    });
    expect(resultaat.met_snoer).toBe(false);
    expect(resultaat.accu_inbegrepen).toBe(true);
    expect(resultaat.lader_inbegrepen).toBe(true);
    expect(resultaat.koffer_inbegrepen).toBe(false);
    expect(resultaat.keuringsplichtig).toBe(true);
  });

  it("gemengd: vult gevonden velden in en laat ontbrekende op null", () => {
    const resultaat = normaliserenAiGereedschapVoorstel({
      omschrijving: "Slijpschijf",
      merk: "Makita",
      // type ontbreekt
      met_snoer: true,
      // accu_inbegrepen ontbreekt
    });
    expect(resultaat.omschrijving).toBe("Slijpschijf");
    expect(resultaat.merk).toBe("Makita");
    expect(resultaat.type).toBeNull();
    expect(resultaat.met_snoer).toBe(true);
    expect(resultaat.accu_inbegrepen).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import {
  filterVgeKandidaten,
  GELDIGE_BRON_TYPES,
  STAP_TYPE_VISUAL_TYPES,
  type VgeVisual,
} from "../routes/visuals";

// ── VGE-guidance hardening — VGF-grondbeginsel 2.3 (Bron is verplicht) ────────
//
// Bevestigt dat filterVgeKandidaten NOOIT een inactieve of bron-loze visual
// doorlaat, ongeacht de samenstelling van de kandidatenlijst of de waarde van
// stap_type.
//
// Scenario's:
//   A. Inactieve visual (actief=false) wordt altijd gefilterd — zelfs met geldige bron
//   B. Visual met ongeldig bron_type wordt altijd gefilterd — zelfs als actief=true
//   C. Visual met actief=false EN ongeldig bron_type wordt gefilterd
//   D. Actieve visual met geldig bron_type komt wél door de filter
//   E. Maximaal 3 visuals in het resultaat (VGF §6.1 stap 4)
//   F. Stap-type filter beperkt de set correct (VGF §6.1 stap 2)
//   G. Onbekend stap_type geeft geen fout maar filtert niet op visual_type
//   H. Lege kandidatenlijst geeft lege set terug
//   I. GELDIGE_BRON_TYPES bevat precies de 7 VGF-waarden

// ── Testfixtures ──────────────────────────────────────────────────────────────

function maakVisual(overrides: Partial<VgeVisual> & { id: number }): VgeVisual {
  return {
    naam: `Visual ${overrides.id}`,
    visual_type: "referentiefoto",
    bron_type: "fps_standaard",
    bron_referentie: null,
    object_path: `/visuals/${overrides.id}/file.jpg`,
    thumbnail_path: null,
    spot_type: ["branddeur"],
    artikel_id: null,
    bedrijfsstandaard_id: null,
    taal: "nl",
    actief: true,
    aangemaakt_op: new Date().toISOString(),
    bijgewerkt_op: null,
    ...overrides,
  };
}

// ── Scenario A — inactieve visual wordt altijd gefilterd ──────────────────────

describe("filterVgeKandidaten — VGF §2.3: inactieve visuals worden nooit getoond", () => {
  it("filtert een inactieve visual met geldige bron_type", () => {
    const kandidaten: VgeVisual[] = [
      maakVisual({ id: 1, actief: false, bron_type: "fps_standaard" }),
    ];
    const resultaat = filterVgeKandidaten(kandidaten);
    expect(resultaat).toHaveLength(0);
  });

  it("filtert meerdere inactieve visuals", () => {
    const kandidaten: VgeVisual[] = [
      maakVisual({ id: 1, actief: false }),
      maakVisual({ id: 2, actief: false }),
      maakVisual({ id: 3, actief: false }),
    ];
    const resultaat = filterVgeKandidaten(kandidaten);
    expect(resultaat).toHaveLength(0);
  });

  it("laat actieve visual ongemoeid wanneer inactieve wordt gefilterd", () => {
    const kandidaten: VgeVisual[] = [
      maakVisual({ id: 1, actief: false }),
      maakVisual({ id: 2, actief: true }),
    ];
    const resultaat = filterVgeKandidaten(kandidaten);
    expect(resultaat).toHaveLength(1);
    expect(resultaat[0].id).toBe(2);
  });
});

// ── Scenario B — ongeldig bron_type wordt altijd gefilterd ───────────────────

describe("filterVgeKandidaten — VGF §2.3: visual zonder goedgekeurde bron wordt nooit getoond", () => {
  it("filtert een visual met ongeldig bron_type (actief=true)", () => {
    const kandidaten: VgeVisual[] = [
      maakVisual({ id: 1, actief: true, bron_type: "onbekend_bron" }),
    ];
    const resultaat = filterVgeKandidaten(kandidaten);
    expect(resultaat).toHaveLength(0);
  });

  it("filtert een visual met leeg bron_type", () => {
    const kandidaten: VgeVisual[] = [
      maakVisual({ id: 1, actief: true, bron_type: "" }),
    ];
    const resultaat = filterVgeKandidaten(kandidaten);
    expect(resultaat).toHaveLength(0);
  });

  it("filtert een visual met bron_type null (cast)", () => {
    const kandidaten: VgeVisual[] = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      maakVisual({ id: 1, actief: true, bron_type: null as any }),
    ];
    const resultaat = filterVgeKandidaten(kandidaten);
    expect(resultaat).toHaveLength(0);
  });
});

// ── Scenario C — actief=false + ongeldig bron_type ───────────────────────────

describe("filterVgeKandidaten — gecombineerde harde filters", () => {
  it("filtert visual met actief=false EN ongeldig bron_type", () => {
    const kandidaten: VgeVisual[] = [
      maakVisual({ id: 1, actief: false, bron_type: "willekeurig" }),
    ];
    const resultaat = filterVgeKandidaten(kandidaten);
    expect(resultaat).toHaveLength(0);
  });
});

// ── Scenario D — geldige visuals komen wél door ───────────────────────────────

describe("filterVgeKandidaten — geldige visuals worden doorgegeven", () => {
  it("laat actieve visual met elk geldig bron_type door", () => {
    for (const bronType of GELDIGE_BRON_TYPES) {
      const kandidaten: VgeVisual[] = [
        maakVisual({ id: 1, actief: true, bron_type: bronType }),
      ];
      const resultaat = filterVgeKandidaten(kandidaten);
      expect(resultaat).toHaveLength(1);
    }
  });
});

// ── Scenario E — maximaal 3 visuals ──────────────────────────────────────────

describe("filterVgeKandidaten — VGF §6.1 stap 4: maximaal 3 visuals", () => {
  it("beperkt de uitvoer tot 3 als er meer kandidaten zijn", () => {
    const kandidaten: VgeVisual[] = [1, 2, 3, 4, 5].map((id) =>
      maakVisual({ id, actief: true }),
    );
    const resultaat = filterVgeKandidaten(kandidaten);
    expect(resultaat).toHaveLength(3);
  });

  it("geeft minder dan 3 terug als er minder kandidaten zijn", () => {
    const kandidaten: VgeVisual[] = [
      maakVisual({ id: 1, actief: true }),
      maakVisual({ id: 2, actief: true }),
    ];
    const resultaat = filterVgeKandidaten(kandidaten);
    expect(resultaat).toHaveLength(2);
  });
});

// ── Scenario F — stap-type filter ────────────────────────────────────────────

describe("filterVgeKandidaten — VGF §6.1 stap 2: stap-type → visual-type filter", () => {
  it("behoudt alleen referentiefoto bij stap_type=foto", () => {
    const kandidaten: VgeVisual[] = [
      maakVisual({ id: 1, actief: true, visual_type: "referentiefoto" }),
      maakVisual({ id: 2, actief: true, visual_type: "detailtekening" }),
      maakVisual({ id: 3, actief: true, visual_type: "checklist" }),
    ];
    const resultaat = filterVgeKandidaten(kandidaten, "foto");
    expect(resultaat).toHaveLength(1);
    expect(resultaat[0].visual_type).toBe("referentiefoto");
  });

  it("behoudt detailtekening en referentiefoto bij stap_type=controle", () => {
    const toegestaan = STAP_TYPE_VISUAL_TYPES["controle"];
    const kandidaten: VgeVisual[] = [
      maakVisual({ id: 1, actief: true, visual_type: "detailtekening" }),
      maakVisual({ id: 2, actief: true, visual_type: "referentiefoto" }),
      maakVisual({ id: 3, actief: true, visual_type: "animatie" }),
    ];
    const resultaat = filterVgeKandidaten(kandidaten, "controle");
    expect(resultaat.every((v) => toegestaan.includes(v.visual_type))).toBe(true);
    expect(resultaat.some((v) => v.visual_type === "animatie")).toBe(false);
  });

  it("combineert inactief-filter met stap_type-filter", () => {
    const kandidaten: VgeVisual[] = [
      maakVisual({ id: 1, actief: false, visual_type: "referentiefoto" }),
      maakVisual({ id: 2, actief: true,  visual_type: "referentiefoto" }),
    ];
    const resultaat = filterVgeKandidaten(kandidaten, "foto");
    expect(resultaat).toHaveLength(1);
    expect(resultaat[0].id).toBe(2);
  });
});

// ── Scenario G — onbekend stap_type ─────────────────────────────────────────

describe("filterVgeKandidaten — onbekend stap_type geeft geen fout", () => {
  it("retourneert actieve geldige visuals onbeperkt op visual_type bij onbekend stap_type", () => {
    const kandidaten: VgeVisual[] = [
      maakVisual({ id: 1, actief: true, visual_type: "referentiefoto" }),
      maakVisual({ id: 2, actief: true, visual_type: "detailtekening" }),
    ];
    const resultaat = filterVgeKandidaten(kandidaten, "onbekend_stap_type");
    expect(resultaat).toHaveLength(2);
  });
});

// ── Scenario H — lege kandidatenlijst ────────────────────────────────────────

describe("filterVgeKandidaten — lege invoer", () => {
  it("retourneert een lege array bij een lege kandidatenlijst", () => {
    const resultaat = filterVgeKandidaten([]);
    expect(resultaat).toHaveLength(0);
  });
});

// ── Scenario I — GELDIGE_BRON_TYPES volledigheid ─────────────────────────────

describe("GELDIGE_BRON_TYPES — volledigheid conform VGF §2.3", () => {
  const verwacht = [
    "projecttekening",
    "ETA",
    "DoP",
    "montagevoorschrift",
    "fps_standaard",
    "praktijkfoto",
    "productblad",
  ];

  it("bevat precies 7 VGF-waarden", () => {
    expect(GELDIGE_BRON_TYPES).toHaveLength(7);
  });

  it("bevat alle verwachte waarden", () => {
    for (const waarde of verwacht) {
      expect(GELDIGE_BRON_TYPES).toContain(waarde);
    }
  });

  it("bevat geen onverwachte waarden", () => {
    for (const waarde of GELDIGE_BRON_TYPES) {
      expect(verwacht).toContain(waarde);
    }
  });
});

import { describe, it, expect } from "vitest";
import { bouwNieuweVersieWaarden } from "../lib/rapport-helpers";
import type { opleverrapportenTable } from "@workspace/db";

// ── Rapport melding-markering — invariant: nieuwe versie erft nooit de markering ──
//
// reactietermijn_melding_verzond_op behoort uitsluitend bij de versie waarop
// de reactietermijn verstrijkt. Een nieuwe conceptversie (nieuwe-versie route)
// mag deze waarde nooit erven, zodat de signalering de volgende keer dat de
// termijn verstrijkt opnieuw verstuurd wordt.
//
// Scenario's:
//   A. Nieuwe versie van een rapport zonder markering heeft de kolom niet ingevuld
//   B. Nieuwe versie van een rapport MET markering heeft de kolom eveneens niet ingevuld
//   C. Versienummer wordt correct verhoogd (kopie-integriteit)
//   D. Status van de nieuwe versie is altijd "concept"
//   E. Overige velden worden wél gekopieerd (inhoud-continuïteit)

type RapportRij = typeof opleverrapportenTable.$inferSelect;

function maakRapport(overrides: Partial<RapportRij> = {}): RapportRij {
  return {
    id: 1,
    gebouwId: 10,
    werkbonId: null,
    rapportType: "opleverrapport",
    versie: 3,
    status: "definitief",
    titel: "Testrapport",
    secties: { inleiding: true },
    spotSelectie: { verdieping_1: [42] },
    bijlagenIds: [7, 8],
    tekeningIds: [3],
    bevrorenOp: new Date("2025-01-01"),
    bevrorenDocumentRevisies: null,
    reactietermijnDatum: new Date("2025-02-01"),
    reactietermijnGestarteOp: new Date("2025-01-01"),
    vervangenDoorRapportId: null,
    vervangenOp: null,
    certificaatGeaccordeerd: false,
    certificaatGeaccordeerdOp: null,
    certificaatGarantieMaanden: 12,
    reactietermijnMeldingVerzondOp: null,
    vervangenDoorId: null,
    aangemaaktDoor: 5,
    aangemaaktOp: new Date("2025-01-01"),
    bijgewerktOp: new Date("2025-01-01"),
    ...overrides,
  };
}

// ── Scenario A — rapport zonder markering: kolom blijft NULL ──────────────────

describe("bouwNieuweVersieWaarden — rapport zonder markering", () => {
  it("bevat reactietermijnMeldingVerzondOp NIET in de insert-waarden", () => {
    const huidig = maakRapport({ reactietermijnMeldingVerzondOp: null });
    const waarden = bouwNieuweVersieWaarden(huidig, 5, new Date());
    expect("reactietermijnMeldingVerzondOp" in waarden).toBe(false);
  });
});

// ── Scenario B — rapport MÉT markering: kolom wordt NIET gekopieerd ──────────

describe("bouwNieuweVersieWaarden — rapport met eerder verstuurde melding", () => {
  it("kopieert reactietermijnMeldingVerzondOp NIET naar de nieuwe versie", () => {
    const huidig = maakRapport({
      reactietermijnMeldingVerzondOp: new Date("2025-01-15T07:30:00Z"),
    });
    const waarden = bouwNieuweVersieWaarden(huidig, 5, new Date());
    expect("reactietermijnMeldingVerzondOp" in waarden).toBe(false);
  });

  it("heeft undefined voor reactietermijnMeldingVerzondOp (geen expliciete waarde)", () => {
    const huidig = maakRapport({
      reactietermijnMeldingVerzondOp: new Date("2025-01-15T07:30:00Z"),
    });
    const waarden = bouwNieuweVersieWaarden(huidig, 5, new Date());
    expect(
      (waarden as Record<string, unknown>)["reactietermijnMeldingVerzondOp"],
    ).toBeUndefined();
  });
});

// ── Scenario C — versienummer ─────────────────────────────────────────────────

describe("bouwNieuweVersieWaarden — versienummer", () => {
  it("verhoogt het versienummer met 1", () => {
    const huidig = maakRapport({ versie: 3 });
    const waarden = bouwNieuweVersieWaarden(huidig, 5, new Date());
    expect(waarden.versie).toBe(4);
  });

  it("verhoogt versie 1 naar 2", () => {
    const huidig = maakRapport({ versie: 1 });
    const waarden = bouwNieuweVersieWaarden(huidig, 5, new Date());
    expect(waarden.versie).toBe(2);
  });
});

// ── Scenario D — status is altijd "concept" ───────────────────────────────────

describe("bouwNieuweVersieWaarden — status", () => {
  it('status van de nieuwe versie is altijd "concept"', () => {
    const huidig = maakRapport({ status: "definitief" });
    const waarden = bouwNieuweVersieWaarden(huidig, 5, new Date());
    expect(waarden.status).toBe("concept");
  });
});

// ── Scenario E — inhoud-continuïteit ─────────────────────────────────────────

describe("bouwNieuweVersieWaarden — inhoud wordt overgenomen", () => {
  it("kopieert gebouwId, rapportType en titel", () => {
    const huidig = maakRapport({
      gebouwId: 42,
      rapportType: "voortgangsrapportage",
      titel: "Mijn rapporttitel",
    });
    const waarden = bouwNieuweVersieWaarden(huidig, 5, new Date());
    expect(waarden.gebouwId).toBe(42);
    expect(waarden.rapportType).toBe("voortgangsrapportage");
    expect(waarden.titel).toBe("Mijn rapporttitel");
  });

  it("kopieert secties en spotSelectie als objecten", () => {
    const huidig = maakRapport({
      secties: { samenvatting: true, detail: false },
      spotSelectie: { v1: [1, 2, 3] },
    });
    const waarden = bouwNieuweVersieWaarden(huidig, 5, new Date());
    expect(waarden.secties).toEqual({ samenvatting: true, detail: false });
    expect(waarden.spotSelectie).toEqual({ v1: [1, 2, 3] });
  });

  it("gebruikt lege objecten als secties of spotSelectie null zijn", () => {
    const huidig = maakRapport({
      secties: null as unknown as Record<string, unknown>,
      spotSelectie: null as unknown as Record<string, unknown>,
    });
    const waarden = bouwNieuweVersieWaarden(huidig, 5, new Date());
    expect(waarden.secties).toEqual({});
    expect(waarden.spotSelectie).toEqual({});
  });

  it("bevroren velden worden NIET gekopieerd (nieuwe versie is concept)", () => {
    const huidig = maakRapport({
      bevrorenOp: new Date("2025-01-01"),
      bevrorenDocumentRevisies: { "7": { revisie_nummer: 2, naam: "ETA-brandklep.pdf" } },
    });
    const waarden = bouwNieuweVersieWaarden(huidig, 5, new Date());
    expect("bevrorenOp" in waarden).toBe(false);
    expect("bevrorenDocumentRevisies" in waarden).toBe(false);
  });

  it("reactietermijn-velden worden NIET gekopieerd", () => {
    const huidig = maakRapport({
      reactietermijnDatum: new Date("2025-02-01"),
      reactietermijnGestarteOp: new Date("2025-01-01"),
    });
    const waarden = bouwNieuweVersieWaarden(huidig, 5, new Date());
    expect("reactietermijnDatum" in waarden).toBe(false);
    expect("reactietermijnGestarteOp" in waarden).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  maandTerug,
  dagenTot,
  berekenContractCrucialeDatum,
  berekenZzpCrucialeDatum,
  URGENT_DAGEN,
  DBA_MAANDEN_GRENS,
} from "../routes/contract-bewaking";

// Vaste referentiedatum zodat alle berekeningen deterministisch zijn.
const NU = new Date("2026-08-17T00:00:00.000Z");

// ── Unit-tests: maandTerug ────────────────────────────────────────────────────

describe("maandTerug — kalenderveilige datumhelper", () => {
  it("31 mei → 30 april (doelmaand heeft 30 dagen)", () => {
    expect(maandTerug("2026-05-31")).toBe("2026-04-30");
  });

  it("31 maart → 28 februari (2025, geen schrikkeljaar)", () => {
    expect(maandTerug("2025-03-31")).toBe("2025-02-28");
  });

  it("31 maart → 29 februari (2024, schrikkeljaar)", () => {
    expect(maandTerug("2024-03-31")).toBe("2024-02-29");
  });

  it("29 maart → 29 februari (schrikkeljaar, dag bestaat in doelmaand)", () => {
    expect(maandTerug("2024-03-29")).toBe("2024-02-29");
  });

  it("30 maart → 28 februari (2025, geen schrikkeljaar, dag 30 bestaat niet in feb)", () => {
    expect(maandTerug("2025-03-30")).toBe("2025-02-28");
  });

  it("1 januari → 1 december vorig jaar (jaargrens)", () => {
    expect(maandTerug("2026-01-01")).toBe("2025-12-01");
  });

  it("31 januari → 31 december vorig jaar (jaargrens + maand-einde)", () => {
    expect(maandTerug("2026-01-31")).toBe("2025-12-31");
  });

  it("15 augustus → 15 juli (middenmaand, geen clamping nodig)", () => {
    expect(maandTerug("2026-08-15")).toBe("2026-07-15");
  });

  it("31 december → 30 november (doelmaand heeft 30 dagen, geen jaargrens)", () => {
    expect(maandTerug("2026-12-31")).toBe("2026-11-30");
  });
});

// ── Unit-tests: dagenTot ──────────────────────────────────────────────────────

describe("dagenTot — klok-injecteerbare dagenteller", () => {
  it("geeft 0 terug voor vandaag", () => {
    expect(dagenTot("2026-08-17", NU)).toBe(0);
  });

  it("geeft positief getal voor datum in de toekomst", () => {
    expect(dagenTot("2026-09-16", NU)).toBe(30);
  });

  it("geeft negatief getal voor datum in het verleden", () => {
    expect(dagenTot("2026-08-07", NU)).toBe(-10);
  });
});

// ── berekenContractCrucialeDatum ──────────────────────────────────────────────

describe("berekenContractCrucialeDatum — contract korter dan 6 maanden", () => {
  it("gebruikt de einddatum zelf als cruciale datum (geen aanzegtermijn)", () => {
    // 90-daags contract (<180 dagen)
    const result = berekenContractCrucialeDatum(
      { startDatum: "2026-06-01", eindDatum: "2026-08-29" },
      NU,
    );
    expect(result.datum).toBe("2026-08-29");
    expect(result.label).toBe("Contract loopt af");
  });

  it("urgent=false wanneer einde > 30 dagen weg", () => {
    const result = berekenContractCrucialeDatum(
      { startDatum: "2026-08-01", eindDatum: "2026-10-01" },
      NU,
    );
    expect(result.urgent).toBe(false);
    expect(result.dagen_tot).toBeGreaterThan(URGENT_DAGEN);
  });

  it("urgent=true wanneer einde <= 30 dagen weg", () => {
    // Contract loopt af over 10 dagen, duur 60 dagen
    const result = berekenContractCrucialeDatum(
      { startDatum: "2026-06-18", eindDatum: "2026-08-27" },
      NU,
    );
    expect(result.urgent).toBe(true);
    expect(result.dagen_tot).toBe(10);
  });

  it("urgent=true en dagen_tot<0 wanneer contract al verlopen is", () => {
    const result = berekenContractCrucialeDatum(
      { startDatum: "2026-01-01", eindDatum: "2026-03-31" },
      NU,
    );
    expect(result.dagen_tot).toBeLessThan(0);
    expect(result.urgent).toBe(true);
  });
});

describe("berekenContractCrucialeDatum — contract 6 maanden of langer (Wet Aanzegging)", () => {
  it("gebruikt maandTerug(einddatum) als cruciale datum", () => {
    // 200-daags contract (>= 180 dagen)
    const eindDatum = "2026-11-15";
    const result = berekenContractCrucialeDatum(
      { startDatum: "2026-01-01", eindDatum },
      NU,
    );
    expect(result.datum).toBe(maandTerug(eindDatum)); // "2026-10-15"
    expect(result.label).toBe("Uiterste aanzegdatum");
  });

  it("aanzegdatum = 31 oktober → 30 september (doelmaand 30 dagen)", () => {
    const result = berekenContractCrucialeDatum(
      { startDatum: "2026-01-01", eindDatum: "2026-10-31" },
      NU,
    );
    expect(result.datum).toBe("2026-09-30");
  });

  it("urgent=true wanneer aanzegdatum <=30 dagen weg", () => {
    // aanzegdatum = 2026-09-05 (20 dagen weg), einddatum = 2026-10-05
    const result = berekenContractCrucialeDatum(
      { startDatum: "2026-01-01", eindDatum: "2026-10-05" },
      NU,
    );
    expect(result.label).toBe("Uiterste aanzegdatum");
    expect(result.datum).toBe("2026-09-05");
    expect(result.dagen_tot).toBe(19); // 2026-09-05 is 19 dagen na 2026-08-17
    expect(result.urgent).toBe(true);
  });

  it("urgent=false wanneer aanzegdatum meer dan 30 dagen weg", () => {
    // einddatum 2026-12-31 → aanzegdatum 2026-11-30 (105 dagen weg)
    const result = berekenContractCrucialeDatum(
      { startDatum: "2026-01-01", eindDatum: "2026-12-31" },
      NU,
    );
    expect(result.label).toBe("Uiterste aanzegdatum");
    expect(result.urgent).toBe(false);
  });
});

// ── berekenZzpCrucialeDatum ───────────────────────────────────────────────────

describe("berekenZzpCrucialeDatum — ZZP-overeenkomsten (Wet DBA)", () => {
  it("< 9 maanden verband → geen DBA-risico, label loopt af", () => {
    // ~8 maanden verband (242 dagen)
    const result = berekenZzpCrucialeDatum(
      [{ startDatum: "2026-01-15", eindDatum: "2026-09-14" }],
      NU,
    );
    expect(result).not.toBeNull();
    expect(result!.dbaRisico).toBe(false);
    expect(result!.label).toBe("ZZP-overeenkomst loopt af");
    expect(result!.verbandMaanden).toBeLessThan(DBA_MAANDEN_GRENS);
  });

  it(">= 9 maanden verband → DBA-risico, urgent=true", () => {
    // Twee overeenkomsten samen 12 maanden
    const result = berekenZzpCrucialeDatum(
      [
        { startDatum: "2025-11-01", eindDatum: "2026-04-30" },
        { startDatum: "2026-05-01", eindDatum: "2026-10-31" },
      ],
      NU,
    );
    expect(result).not.toBeNull();
    expect(result!.dbaRisico).toBe(true);
    expect(result!.urgent).toBe(true);
    expect(result!.label).toBe("ZZP: DBA-risico");
    expect(result!.verbandMaanden).toBeGreaterThanOrEqual(DBA_MAANDEN_GRENS);
  });

  it("geen lopende overeenkomst (>90 dagen verlopen) → null", () => {
    const result = berekenZzpCrucialeDatum(
      [{ startDatum: "2025-01-01", eindDatum: "2025-04-01" }],
      NU,
    );
    expect(result).toBeNull();
  });

  it("urgent=true wanneer einddatum <=30 dagen weg (zonder DBA-risico)", () => {
    // Eindigt over 15 dagen, verband 3 maanden
    const result = berekenZzpCrucialeDatum(
      [{ startDatum: "2026-05-17", eindDatum: "2026-09-01" }],
      NU,
    );
    expect(result).not.toBeNull();
    expect(result!.dbaRisico).toBe(false);
    expect(result!.urgent).toBe(true);
    expect(result!.dagen_tot).toBe(15);
  });

  it("lopende overeenkomst wordt gekozen als er meerdere zijn (dichtstbijzijnde einddatum)", () => {
    const result = berekenZzpCrucialeDatum(
      [
        { startDatum: "2026-05-01", eindDatum: "2026-09-01" }, // dichtstbij
        { startDatum: "2026-05-01", eindDatum: "2026-12-31" },
      ],
      NU,
    );
    expect(result!.datum).toBe("2026-09-01");
  });
});

// ── Meest urgente wint: contract + ZZP samen ──────────────────────────────────
// Tests voor de selectielogica: de item met de laagste dagen_tot wint.

type CruciaalItem = {
  medewerker_id: number;
  datum: string;
  label: string;
  dagen_tot: number;
  urgent: boolean;
  reden: string;
  bron: "contract" | "zzp";
};

function zetAlsUrgenterTest(map: Map<number, CruciaalItem>, item: CruciaalItem) {
  const bestaand = map.get(item.medewerker_id);
  if (!bestaand || item.dagen_tot < bestaand.dagen_tot) map.set(item.medewerker_id, item);
}

describe("zetAlsUrgenter — meest urgente deadline wint (laagste dagen_tot)", () => {
  it("eerste item wint bij leeg overzicht", () => {
    const map = new Map<number, CruciaalItem>();
    const contractResult = berekenContractCrucialeDatum(
      { startDatum: "2026-07-01", eindDatum: "2026-10-01" },
      NU,
    );
    const item: CruciaalItem = { medewerker_id: 1, bron: "contract", ...contractResult };
    zetAlsUrgenterTest(map, item);
    expect(map.get(1)!.dagen_tot).toBe(contractResult.dagen_tot);
  });

  it("contract vervangt ZZP wanneer contract urgenter is", () => {
    const map = new Map<number, CruciaalItem>();
    // ZZP: eindigt over 45 dagen
    const zzpRes = berekenZzpCrucialeDatum(
      [{ startDatum: "2026-05-01", eindDatum: "2026-10-01" }],
      NU,
    )!;
    const zzpItem: CruciaalItem = {
      medewerker_id: 7, bron: "zzp",
      datum: zzpRes.datum, label: zzpRes.label,
      dagen_tot: zzpRes.dagen_tot, urgent: zzpRes.urgent, reden: zzpRes.reden,
    };
    // Contract (6+ mnd): aanzegdatum over 19 dagen
    const cRes = berekenContractCrucialeDatum(
      { startDatum: "2026-01-01", eindDatum: "2026-10-05" },
      NU,
    );
    const contractItem: CruciaalItem = { medewerker_id: 7, bron: "contract", ...cRes };

    zetAlsUrgenterTest(map, zzpItem);
    zetAlsUrgenterTest(map, contractItem);

    expect(map.get(7)!.bron).toBe("contract");
    expect(map.get(7)!.urgent).toBe(true);
  });

  it("ZZP wint wanneer ZZP urgenter is dan contract", () => {
    const map = new Map<number, CruciaalItem>();
    // Contract: einddatum over 60 dagen, kort (geen aanzegtermijn)
    const cRes = berekenContractCrucialeDatum(
      { startDatum: "2026-07-01", eindDatum: "2026-10-16" },
      NU,
    );
    const contractItem: CruciaalItem = { medewerker_id: 7, bron: "contract", ...cRes };

    // ZZP: eindigt over 15 dagen
    const zzpRes = berekenZzpCrucialeDatum(
      [{ startDatum: "2026-05-17", eindDatum: "2026-09-01" }],
      NU,
    )!;
    const zzpItem: CruciaalItem = {
      medewerker_id: 7, bron: "zzp",
      datum: zzpRes.datum, label: zzpRes.label,
      dagen_tot: zzpRes.dagen_tot, urgent: zzpRes.urgent, reden: zzpRes.reden,
    };

    zetAlsUrgenterTest(map, contractItem);
    zetAlsUrgenterTest(map, zzpItem);

    expect(map.get(7)!.bron).toBe("zzp");
    expect(map.get(7)!.urgent).toBe(true);
  });

  it("minder urgent item vervangt bestaand item niet", () => {
    const map = new Map<number, CruciaalItem>();
    const urgent = berekenContractCrucialeDatum(
      { startDatum: "2026-01-01", eindDatum: "2026-10-05" }, // aanzegdatum 19 dagen weg
      NU,
    );
    const minder = berekenContractCrucialeDatum(
      { startDatum: "2026-07-01", eindDatum: "2026-10-16" }, // einddatum 60 dagen weg
      NU,
    );
    zetAlsUrgenterTest(map, { medewerker_id: 3, bron: "contract", ...urgent });
    zetAlsUrgenterTest(map, { medewerker_id: 3, bron: "contract", ...minder });

    expect(map.get(3)!.dagen_tot).toBe(urgent.dagen_tot);
  });

  it("medewerker met contract (6+ mnd, aanzegdatum) én ZZP: meest urgente wint", () => {
    // Contract: aanzegdatum 19 dagen weg (urgent)
    // ZZP:      einddatum 45 dagen weg (niet urgent)
    const cRes = berekenContractCrucialeDatum(
      { startDatum: "2026-01-01", eindDatum: "2026-10-05" },
      NU,
    );
    const zzpRes = berekenZzpCrucialeDatum(
      [{ startDatum: "2026-06-01", eindDatum: "2026-10-01" }],
      NU,
    )!;

    const map = new Map<number, CruciaalItem>();
    zetAlsUrgenterTest(map, { medewerker_id: 99, bron: "contract", ...cRes });
    zetAlsUrgenterTest(map, {
      medewerker_id: 99, bron: "zzp",
      datum: zzpRes.datum, label: zzpRes.label,
      dagen_tot: zzpRes.dagen_tot, urgent: zzpRes.urgent, reden: zzpRes.reden,
    });

    const winnaar = map.get(99)!;
    expect(winnaar.bron).toBe("contract");
    expect(winnaar.dagen_tot).toBe(cRes.dagen_tot);
    expect(winnaar.urgent).toBe(true);
  });
});

// Urenverhouding per boekjaar (AK-dashboard): dekking en percentage worden op
// ONafgeronde uursommen bepaald — netto_uren is een real, dus fractionele
// registraties (0,25 uur) mogen nooit naar 0 wegronden en zo ten onrechte
// "geen uren geregistreerd" opleveren.
import { describe, expect, it, vi } from "vitest";

// DB-mock: één jaar met fractionele sommen zoals Postgres ze teruggeeft (strings).
const mockRijen: Array<{ boekjaar: string; productief: string; indirect: string }> = [];
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          groupBy: () => Promise.resolve(mockRijen),
        }),
      }),
    }),
  },
  facturenTable: {}, fieAkPostenTable: {}, fieJaarbegrotingenTable: {},
  fieJaarrealisatiesTable: {}, orgVerzekeringenTable: {},
  urenRegistratiesTable: { datum: {}, nettoUren: {}, projectId: {}, gebouwId: {} },
  werkgeversTable: {},
}));

import { berekenUrenSplitsingJaar, bouwUrenSplitsing, bouwUrenSplitsingPerJaar } from "./akEigenCijfers";

describe("berekenUrenSplitsingJaar", () => {
  it("fractionele uren tellen mee voor dekking (niet wegronden naar 0)", () => {
    const r = berekenUrenSplitsingJaar(2023, 0.25, 0.25);
    expect(r.dekkend).toBe(true);
    expect(r.indirectPct).toBe(50);
    expect(r.productief).toBe(0.3); // alleen weergave op 1 decimaal
    expect(r.indirect).toBe(0.3);
  });

  it("percentage komt uit de ruwe sommen, niet uit afgeronde waarden", () => {
    // ruw: 1000,44 productief / 0,26 indirect → pct op ruwe totalen
    const r = berekenUrenSplitsingJaar(2024, 1000.44, 0.26);
    expect(r.dekkend).toBe(true);
    expect(r.indirectPct).toBe(0); // 0,026% rondt op 1 decimaal af naar 0,0 — maar dekkend blijft true
    expect(r.indirect).toBe(0.3);
  });

  it("gemengd productief/indirect geeft de juiste verhouding", () => {
    const r = berekenUrenSplitsingJaar(2024, 6, 2);
    expect(r).toEqual({ boekjaar: 2024, productief: 6, indirect: 2, dekkend: true, indirectPct: 25 });
  });

  it("jaar zonder uren is expliciet niet dekkend en heeft geen percentage", () => {
    const r = berekenUrenSplitsingJaar(2025, 0, 0);
    expect(r).toEqual({ boekjaar: 2025, productief: 0, indirect: 0, dekkend: false, indirectPct: null });
  });

  it("alleen indirecte uren: 100% indirect", () => {
    const r = berekenUrenSplitsingJaar(2024, 0, 4);
    expect(r.indirectPct).toBe(100);
    expect(r.dekkend).toBe(true);
  });
});

describe("lopend jaar (bevinding) en per-jaar-rij spreken elkaar nooit tegen", () => {
  it("fractionele uren in het lopende jaar: dekkend in beide paden, dus géén 'geen uren'-bevinding", async () => {
    const jaar = new Date().getFullYear();
    mockRijen.length = 0;
    mockRijen.push({ boekjaar: String(jaar), productief: "0.25", indirect: "0.25" });

    // Pad dat de bevinding en uren_splitsing in de route voedt.
    const huidig = await bouwUrenSplitsing(jaar);
    // Pad dat de per-jaar-tabel voedt.
    const perJaar = await bouwUrenSplitsingPerJaar([jaar]);

    expect(huidig.dekkend).toBe(true); // vóór de fix rondde dit naar 0+0 → false
    expect(perJaar[0]).toEqual(huidig); // identieke berekening, geen tegenspraak
    expect(huidig.indirectPct).toBe(50);
  });

  it("echt lege registratie blijft in beide paden niet-dekkend", async () => {
    mockRijen.length = 0;
    const huidig = await bouwUrenSplitsing(2025);
    const perJaar = await bouwUrenSplitsingPerJaar([2025]);
    expect(huidig.dekkend).toBe(false);
    expect(huidig.indirectPct).toBeNull();
    expect(perJaar[0]).toEqual(huidig);
  });
});

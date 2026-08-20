import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import {
  maakDbMock, maakAuthMiddlewareMock, maakTestServer, sluitServer,
  resetMockState, mockState,
} from "./loonfundament-harnas";

// ── LOON_02A — Loonstaten, tijdvakregels en importer pure functies ────────────
//
// Dekt:
//   (5) Tijdvakregel-maxima: maand ≤ 12 ok/400; vier_weken ≤ 13 ok/400
//   (7) URL allowlist valideerBronUrl (puur, geen DB)
//   (7b) parseXlsxNaarParameters — cel-adressen en datatypes

vi.mock("@workspace/db", () => maakDbMock());
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})), and: vi.fn(() => ({})),
  desc: vi.fn((v: unknown) => v), asc: vi.fn((v: unknown) => v),
  inArray: vi.fn(() => ({})), sql: vi.fn(() => ({})),
}));
vi.mock("../middlewares/auth", () => maakAuthMiddlewareMock());
vi.mock("../services/loonfundament-import", async (importOriginal) => {
  const echt = await importOriginal<typeof import("../services/loonfundament-import")>();
  return { ...echt, voerImportUit: vi.fn().mockRejectedValue(new Error("mock")) };
});

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  ({ server, baseUrl } = await maakTestServer());
});

afterAll(async () => {
  await sluitServer(server);
});

beforeEach(() => {
  vi.clearAllMocks();
  resetMockState();
});

// ── (5) Tijdvakregel-maxima ───────────────────────────────────────────────────

function tijdvakregelBody(nr: number, periodeEinde = "2026-01-31") {
  return {
    tijdvaknummer: nr,
    periode_start: "2026-01-01",
    periode_einde: periodeEinde,
    rekenstatus: "niet_berekend",
    reden: "LOON_02B is nog niet uitgevoerd",
  };
}

function tv(id: number, staatId: number, nr: number) {
  return {
    id, loonstaatId: staatId, tijdvaknummer: nr,
    periodeStart: "2026-01-01", periodeEinde: "2026-01-31",
    rekenstatus: "niet_berekend", reden: null, vindplaats: null,
    tijdvakWaarden: {}, cumulatieven: {},
  };
}

describe("LOON_02A (5) Tijdvakregel-maxima", () => {
  it("maand tijdvaknummer 12 → 201", async () => {
    mockState.staatSelectResult = [{ id: 55, tijdvak: "maand", kalenderjaar: 2026 }];
    mockState.tijdvakregelInsertResult = [tv(1, 55, 12)];
    const r = await fetch(`${baseUrl}/loonfundament/loonstaten/55/tijdvakregels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tijdvakregelBody(12)),
    });
    expect(r.status).toBe(201);
  });

  it("maand tijdvaknummer 13 → 400 (max is 12)", async () => {
    mockState.staatSelectResult = [{ id: 55, tijdvak: "maand", kalenderjaar: 2026 }];
    const r = await fetch(`${baseUrl}/loonfundament/loonstaten/55/tijdvakregels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tijdvakregelBody(13)),
    });
    expect(r.status).toBe(400);
    const json = await r.json() as { message: string };
    expect(json.message).toMatch(/maand/i);
    expect(json.message).toMatch(/12/);
  });

  it("vier_weken tijdvaknummer 13 → 201", async () => {
    mockState.staatSelectResult = [{ id: 56, tijdvak: "vier_weken", kalenderjaar: 2026 }];
    mockState.tijdvakregelInsertResult = [tv(2, 56, 13)];
    const r = await fetch(`${baseUrl}/loonfundament/loonstaten/56/tijdvakregels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tijdvakregelBody(13, "2026-01-28")),
    });
    expect(r.status).toBe(201);
  });

  it("vier_weken tijdvaknummer 14 → 400 (max is 13)", async () => {
    mockState.staatSelectResult = [{ id: 56, tijdvak: "vier_weken", kalenderjaar: 2026 }];
    const r = await fetch(`${baseUrl}/loonfundament/loonstaten/56/tijdvakregels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tijdvakregelBody(14, "2026-01-28")),
    });
    expect(r.status).toBe(400);
    const json = await r.json() as { message: string };
    expect(json.message).toMatch(/vier_weken/i);
    expect(json.message).toMatch(/13/);
  });

  it("weigert clientgeschreven berekende waarden vóór LOON_02B", async () => {
    mockState.staatSelectResult = [{ id: 55, tijdvak: "maand", kalenderjaar: 2026 }];
    const r = await fetch(`${baseUrl}/loonfundament/loonstaten/55/tijdvakregels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...tijdvakregelBody(1),
        rekenstatus: "berekend",
        tijdvak_waarden: { netto: 1 },
        cumulatieven: { netto: 1 },
      }),
    });
    expect(r.status).toBe(422);
    expect(mockState.tijdvakregelInsertResult).toEqual([]);
  });
});

// ── (7) URL allowlist — valideerBronUrl ───────────────────────────────────────

describe("LOON_02A (7) Import URL allowlist — valideerBronUrl", () => {
  it("accepteert https://download.belastingdienst.nl/…", async () => {
    const { valideerBronUrl } = await import("../services/loonfundament-import");
    expect(() =>
      valideerBronUrl("https://download.belastingdienst.nl/belastingdienst/sites/default/files/tabel.xlsx"),
    ).not.toThrow();
  });

  it("accepteert https://belastingdienst.nl/…", async () => {
    const { valideerBronUrl } = await import("../services/loonfundament-import");
    expect(() =>
      valideerBronUrl("https://belastingdienst.nl/wps/wcm/connect/nl/loonheffingen.pdf"),
    ).not.toThrow();
  });

  it("weigert http:// (niet HTTPS)", async () => {
    const { valideerBronUrl } = await import("../services/loonfundament-import");
    expect(() =>
      valideerBronUrl("http://download.belastingdienst.nl/tabel.xlsx"),
    ).toThrow(/HTTPS/i);
  });

  it("weigert extern domein", async () => {
    const { valideerBronUrl } = await import("../services/loonfundament-import");
    expect(() =>
      valideerBronUrl("https://evil.example.com/tabel.xlsx"),
    ).toThrow(/allowlist/i);
  });

  it("weigert subdomein-spoof belastingdienst.nl.evil.com", async () => {
    const { valideerBronUrl } = await import("../services/loonfundament-import");
    expect(() =>
      valideerBronUrl("https://belastingdienst.nl.evil.com/tabel.xlsx"),
    ).toThrow(/allowlist/i);
  });

  it("weigert ongeldige URL", async () => {
    const { valideerBronUrl } = await import("../services/loonfundament-import");
    expect(() => valideerBronUrl("geen-url")).toThrow();
  });
});

// ── (7b) parseXlsxNaarParameters — fixture ───────────────────────────────────

describe("LOON_02A (7b) parseXlsxNaarParameters — cel-locaties en datatypes", () => {
  it("VEREISTE_BRONSOORTEN bevat exact 7 soorten", async () => {
    const svc = await import("../services/loonfundament-import");
    const bronsoorten = svc.VEREISTE_BRONSOORTEN as readonly string[];
    expect(bronsoorten).toHaveLength(7);
    expect(bronsoorten).toContain("primaire_xlsx");
    expect(bronsoorten).toContain("handboek");
    expect(bronsoorten).toContain("loonbelastingtabellen");
  });

  it("accepteert alleen het exact gepinde officiële manifest voor 2026", async () => {
    const { OFFICIELE_BRONMANIFESTEN, valideerBronmanifest } = await import("../services/loonfundament-import");
    const manifest = OFFICIELE_BRONMANIFESTEN[2026];
    expect(manifest).toHaveLength(7);
    expect(() => valideerBronmanifest(2026, manifest.map((bron) => ({ ...bron })))).not.toThrow();
  });

  it("weigert zelfverklaarde hash/metadata en jaren zonder gecontroleerd manifest", async () => {
    const { OFFICIELE_BRONMANIFESTEN, valideerBronmanifest } = await import("../services/loonfundament-import");
    const manifest = OFFICIELE_BRONMANIFESTEN[2026]!.map((bron) => ({ ...bron }));
    manifest[0]!.verwachte_sha256 = "0".repeat(64);
    expect(() => valideerBronmanifest(2026, manifest)).toThrow(/wijkt af/i);
    expect(() => valideerBronmanifest(2027, [])).toThrow(/geen gecontroleerd/i);
  });

  it("weigert gewijzigde officiële bytes bij een SHA-256-mismatch vóór databaseopslag", async () => {
    const { OFFICIELE_BRONMANIFESTEN, downloadEnValideerBronnen } = await vi.importActual<
      typeof import("../services/loonfundament-import")
    >("../services/loonfundament-import");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const response = new Response(Buffer.from("gewijzigde officiële bytes"), {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
      Object.defineProperty(response, "url", { value: String(input) });
      return response;
    }));
    try {
      await expect(
        downloadEnValideerBronnen(
          OFFICIELE_BRONMANIFESTEN[2026]!.map((bron) => ({ ...bron })),
        ),
      ).rejects.toThrow(/SHA-256 mismatch/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sleutel in Sheet!Cel-formaat, datatypes integer/decimal/boolean/tekst correct", async () => {
    const { parseXlsxNaarParameters } = await import("../services/loonfundament-import");
    const XLSX = await import("xlsx");

    // Fixture: 6 rijen (rij 4 = leeg, wordt overgeslagen als cel)
    // Rij index 0→A1/B1, 1→A2/B2, 2→A3/B3, 3→leeg, 4→A5/B5, 5→A6/B6
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Label",   "Waarde"],
      ["Schijf 1", 38441],
      ["Tarief",  0.0836],
      [null,      null],
      ["Actief",  true],
      ["Naam",    "IB2026"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Tarieven");
    const buf = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    const params = parseXlsxNaarParameters(buf, "primaire_xlsx");

    // Alle sleutels bevatten "Tarieven!"
    for (const p of params) {
      expect(p.sleutel).toMatch(/^Tarieven!/);
      expect(p.vindplaats).toMatch(/^Tarieven!/);
    }

    // B1 = "Waarde" (tekst)
    const b1 = params.find((p) => p.sleutel === "Tarieven!B1");
    expect(b1?.waarde).toBe("Waarde");
    expect(b1?.datatype).toBe("tekst");

    // B2 = 38441 (integer)
    const b2 = params.find((p) => p.sleutel === "Tarieven!B2");
    expect(b2?.waarde).toBe(38441);
    expect(b2?.datatype).toBe("integer");

    // B3 = 0.0836 (decimal)
    const b3 = params.find((p) => p.sleutel === "Tarieven!B3");
    expect(b3?.waarde).toBe(0.0836);
    expect(b3?.datatype).toBe("decimal");

    // Rij 4 leeg → geen A4/B4 in params
    expect(params.find((p) => p.sleutel === "Tarieven!A4")).toBeUndefined();
    expect(params.find((p) => p.sleutel === "Tarieven!B4")).toBeUndefined();

    // B5 = true (boolean)
    const b5 = params.find((p) => p.sleutel === "Tarieven!B5");
    expect(b5?.waarde).toBe(true);
    expect(b5?.datatype).toBe("boolean");

    // B6 of later = "IB2026" (tekst) — zoek op waarde voor XLSX-versie-robuustheid
    const naamParam = params.find((p) => p.waarde === "IB2026");
    expect(naamParam).toBeDefined();
    expect(naamParam?.datatype).toBe("tekst");
    expect(naamParam?.sleutel).toMatch(/^Tarieven!B/);
  });
});

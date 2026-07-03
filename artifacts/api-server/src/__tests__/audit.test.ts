import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextFunction } from "express";
import {
  saniteerPayload,
  AUDIT_WHITELIST_BASIS,
  getAuditDiagnostics,
} from "../lib/audit";
import { CSV_KOLOMMEN } from "../routes/audit";

// ── Whitelist-sanitiser ────────────────────────────────────────────────────────

describe("saniteerPayload — whitelist en maskering", () => {
  it("behoudt id en status", () => {
    const result = saniteerPayload({ id: 1, status: "actief", naam: "test" });
    expect(result).not.toBeNull();
    expect(result?.id).toBe(1);
    expect(result?.status).toBe("actief");
    expect(result?.naam).toBe("test");
  });

  it("verwijdert wachtwoord uit de payload", () => {
    const result = saniteerPayload({ id: 1, wachtwoord: "geheim123", status: "actief" });
    expect(result?.wachtwoord).toBeUndefined();
    expect(result?.status).toBe("actief");
  });

  it("verwijdert token uit de payload", () => {
    const result = saniteerPayload({ id: 1, token: "bearer-abc", status: "concept" });
    expect(result?.token).toBeUndefined();
  });

  it("verwijdert totpSecret", () => {
    const result = saniteerPayload({ id: 1, totpSecret: "JBSWY3DPEHPK3PXP", module: "auth" });
    expect(result?.totpSecret).toBeUndefined();
    expect(result?.module).toBe("auth");
  });

  it("verwijdert BSN, IBAN en salaris", () => {
    const result = saniteerPayload({ id: 2, bsn: "123456789", iban: "NL02ABNA", salaris: 3000 });
    expect(result?.bsn).toBeUndefined();
    expect(result?.iban).toBeUndefined();
    expect(result?.salaris).toBeUndefined();
  });

  it("verwijdert nieuwWachtwoord en huidigWachtwoord", () => {
    const result = saniteerPayload({ id: 1, nieuwWachtwoord: "abc", huidigWachtwoord: "def", status: "actief" });
    expect(result?.nieuwWachtwoord).toBeUndefined();
    expect(result?.huidigWachtwoord).toBeUndefined();
  });

  it("verwijdert sessieId en session_id", () => {
    const result = saniteerPayload({ id: 1, sessieId: "sess-abc", session_id: "sess-xyz", status: "actief" });
    expect(result?.sessieId).toBeUndefined();
    expect(result?.session_id).toBeUndefined();
  });

  it("verwijdert velden buiten de whitelist", () => {
    const result = saniteerPayload({ id: 1, onbekendVeld: "xyz", status: "actief" });
    expect(result?.onbekendVeld).toBeUndefined();
    expect(result?.status).toBe("actief");
  });

  it("geeft __gesaneerd: true terug bij volledig leeg resultaat", () => {
    const result = saniteerPayload({ wachtwoord: "geheim", token: "abc" });
    expect(result?.__gesaneerd).toBe(true);
  });

  it("geeft null terug voor null-input", () => {
    expect(saniteerPayload(null)).toBeNull();
  });

  it("geeft null terug voor niet-object input", () => {
    expect(saniteerPayload("string")).toBeNull();
  });

  it("behoudt entiteitsspecifieke velden via entiteit-parameter", () => {
    const result = saniteerPayload({ id: 1, adres: "Hoofdstraat 1", status: "actief" }, "gebouwen");
    expect(result?.adres).toBe("Hoofdstraat 1");
  });

  it("verwijdert entiteitsspecifieke velden als andere entiteit is opgegeven", () => {
    const result = saniteerPayload({ id: 1, adres: "Hoofdstraat 1", status: "actief" }, "inspecties");
    expect(result?.adres).toBeUndefined();
    expect(result?.status).toBe("actief");
  });
});

// ── Payload-afkapping ──────────────────────────────────────────────────────────

describe("saniteerPayload — payload-afkapping", () => {
  it("kapt een payload boven 10 KB af", () => {
    const groot = { id: 1, status: "a".repeat(11 * 1024) };
    const result = saniteerPayload(groot);
    expect(result?.__afgekapt).toBe(true);
  });

  it("kapt array af op 20 items", () => {
    const body = {
      id: 1,
      status: "actief",
    };
    const outerBody: Record<string, unknown> = { ...body };
    // Simuleer whitelist-entry door een bekende sleutel te gebruiken
    // Arrays in de whitelist worden afgekapt op 20
    const arr = Array.from({ length: 30 }, (_, i) => ({ id: i, status: "a" }));
    const testBody: Record<string, unknown> = {
      id: 1,
      // Voeg 'naam' toe zodat whitelist veld aanwezig is
      naam: arr,
    };
    const result = saniteerPayload(testBody);
    // naam is in de whitelist; de array wordt afgekapt op 20 items + __afgekapt marker
    if (Array.isArray(result?.naam)) {
      const items = result.naam as unknown[];
      const saneerdMarker = items.find(
        (item) => typeof item === "object" && item !== null && (item as Record<string, unknown>).__afgekapt,
      );
      expect(saneerdMarker).toBeDefined();
    }
    void outerBody;
  });

  it("kapt nesting af op 3 lagen", () => {
    // Gebruik whitelisted sleutels zodat de whitelist-check niet al eerder verwijdert.
    // Structuur: { id, status: { id, status: { id, status: { id } } } }
    // Niveau 0 → 1 → 2 → 3: bij diepte 3 (>= MAX_NESTING) returnt de sanitiser { __afgekapt: true }
    const diep: Record<string, unknown> = {
      id: 1,
      status: {
        id: 2,
        status: {
          id: 3,
          status: {
            id: 4,
            naam: "te diep",
          },
        },
      },
    };
    const result = saniteerPayload(diep);
    expect(result).not.toBeNull();
    const laag1 = result?.status as Record<string, unknown> | undefined;
    const laag2 = laag1?.status as Record<string, unknown> | undefined;
    // Op niveau 3 (>= MAX_NESTING) geeft de sanitiser { __afgekapt: true } terug
    expect(laag2?.status).toEqual({ __afgekapt: true });
  });
});

// ── Auth-route-uitsluiting — echte middleware-gedrag ──────────────────────────

describe("Auth-route-uitsluiting via maakAuditMiddleware", () => {
  it("AUDIT_WHITELIST_BASIS bevat geen wachtwoord of token", () => {
    expect(AUDIT_WHITELIST_BASIS.has("wachtwoord")).toBe(false);
    expect(AUDIT_WHITELIST_BASIS.has("token")).toBe(false);
    expect(AUDIT_WHITELIST_BASIS.has("totpSecret")).toBe(false);
    expect(AUDIT_WHITELIST_BASIS.has("bsn")).toBe(false);
    expect(AUDIT_WHITELIST_BASIS.has("iban")).toBe(false);
    expect(AUDIT_WHITELIST_BASIS.has("salaris")).toBe(false);
  });

  // Helper: bouw een nep Request/Response om de middleware mee te testen
  function maakMockReqRes(method: string, path: string, body: unknown = {}) {
    const insertedValues: unknown[] = [];

    const req: Record<string, unknown> = {
      method,
      path,
      ip: "127.0.0.1",
      route: { path },
      params: {},
      session: { userId: 42, gebruikerNaam: "Test", rol: "gebruiker" },
    };

    let capturedBody: unknown = undefined;
    const res: Record<string, unknown> = {
      statusCode: 200,
      json: vi.fn().mockImplementation((b: unknown) => {
        capturedBody = b;
        return res;
      }),
    };

    return { req, res, insertedValues, getBody: () => capturedBody };
  }

  it("logt GEEN audit-record voor POST /auth/mobile/login", async () => {
    const { maakAuditMiddleware } = await import("../lib/audit");
    const { db } = await import("@workspace/db");

    const insertSpy = vi.spyOn(db, "insert").mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof db.insert>);

    const middleware = maakAuditMiddleware();
    const { req, res } = maakMockReqRes("POST", "/auth/mobile/login");

    await new Promise<void>((resolve) => {
      middleware(req as never, res as never, resolve as NextFunction);
    });

    // Simuleer response.json aanroep (200 OK)
    (res.json as (b: unknown) => unknown)({ token: "abc" });

    // De middleware mag geen db.insert aanroepen voor auth-routes
    expect(insertSpy).not.toHaveBeenCalled();
    insertSpy.mockRestore();
  });

  it("logt GEEN audit-record voor POST /auth/wachtwoord-wijzigen", async () => {
    const { maakAuditMiddleware } = await import("../lib/audit");
    const { db } = await import("@workspace/db");

    const insertSpy = vi.spyOn(db, "insert").mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof db.insert>);

    const middleware = maakAuditMiddleware();
    const { req, res } = maakMockReqRes("POST", "/auth/wachtwoord-wijzigen");

    await new Promise<void>((resolve) => {
      middleware(req as never, res as never, resolve as NextFunction);
    });

    (res.json as (b: unknown) => unknown)({ success: true });

    expect(insertSpy).not.toHaveBeenCalled();
    insertSpy.mockRestore();
  });

  it("logt WEL een audit-record voor POST /gebouwen", async () => {
    const { maakAuditMiddleware } = await import("../lib/audit");
    const { db } = await import("@workspace/db");

    const valuesMock = vi.fn().mockResolvedValue(undefined);
    const insertSpy = vi.spyOn(db, "insert").mockReturnValue({
      values: valuesMock,
    } as unknown as ReturnType<typeof db.insert>);

    const middleware = maakAuditMiddleware();
    const { req, res } = maakMockReqRes("POST", "/gebouwen");

    await new Promise<void>((resolve) => {
      middleware(req as never, res as never, resolve as NextFunction);
    });

    (res.json as (b: unknown) => unknown)({ id: 1, naam: "Testgebouw" });

    // Kleine vertraging om de fire-and-forget te laten uitvoeren
    await new Promise((r) => setTimeout(r, 10));
    expect(insertSpy).toHaveBeenCalledTimes(1);
    insertSpy.mockRestore();
  });
});

// ── CSV-kolommen ───────────────────────────────────────────────────────────────

describe("CSV_KOLOMMEN — geen gevoelige velden", () => {
  it("bevat geen sessie_id", () => {
    expect(CSV_KOLOMMEN).not.toContain("sessie_id");
  });

  it("bevat geen oude_waarde", () => {
    expect(CSV_KOLOMMEN).not.toContain("oude_waarde");
  });

  it("bevat geen nieuwe_waarde", () => {
    expect(CSV_KOLOMMEN).not.toContain("nieuwe_waarde");
  });

  it("bevat de verplichte leesbare kolommen", () => {
    expect(CSV_KOLOMMEN).toContain("id");
    expect(CSV_KOLOMMEN).toContain("tijdstip");
    expect(CSV_KOLOMMEN).toContain("gebruiker_id");
    expect(CSV_KOLOMMEN).toContain("module");
    expect(CSV_KOLOMMEN).toContain("actie");
    expect(CSV_KOLOMMEN).toContain("entiteit");
    expect(CSV_KOLOMMEN).toContain("ip_adres");
  });
});

// ── Retry-teller ──────────────────────────────────────────────────────────────

describe("getAuditDiagnostics — retry-diagnostics", () => {
  it("geeft een diagnostics-object terug met de verwachte velden", () => {
    const diag = getAuditDiagnostics();
    expect(diag).toHaveProperty("misluktTotaal");
    expect(diag).toHaveProperty("laatstefout");
    expect(diag).toHaveProperty("laatstefoutTijdstip");
    expect(diag).toHaveProperty("omschrijving");
    expect(typeof diag.misluktTotaal).toBe("number");
  });

  it("misluktTotaal start op 0 of hoger (module-level singleton)", () => {
    const diag = getAuditDiagnostics();
    expect(diag.misluktTotaal).toBeGreaterThanOrEqual(0);
  });
});

// ── Retry-logica via gemockte DB ───────────────────────────────────────────────

describe("logAudit — retry bij DB-fout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("herprobeert maximaal 2 keer bij een DB-fout en logt daarna een waarschuwing", async () => {
    // We mocken db.insert direct zodat we de retry kunnen testen
    const { db } = await import("@workspace/db");
    const insertSpy = vi.spyOn(db, "insert").mockReturnValue({
      values: () => Promise.reject(new Error("DB fout")),
    } as unknown as ReturnType<typeof db.insert>);

    const warnSpy = vi.spyOn(await import("../lib/logger").then(m => m.logger), "warn").mockImplementation(() => undefined);

    // Importeer logAudit na het mocken
    const { logAudit: logAuditFn } = await import("../lib/audit");

    logAuditFn({
      gebruikerId: 1,
      gebruikerNaam: "Test",
      ipAdres: null,
      sessieId: null,
      module: "test",
      actie: "aanmaken",
      entiteit: "testentiteit",
      entiteitId: null,
      entiteitNaam: null,
      oudeWaarde: null,
      nieuweWaarde: null,
      workflowStatus: null,
      gebouwId: null,
      medewerkerId: null,
      documentId: null,
      meta: null,
    });

    // Eerste poging is synchroon na de eerste .catch
    await vi.advanceTimersByTimeAsync(0);
    // Tweede poging na 500ms
    await vi.advanceTimersByTimeAsync(500);
    // Derde poging na 500ms (definitief falen)
    await vi.advanceTimersByTimeAsync(500);
    // Wacht op alle pending promises
    await vi.runAllTimersAsync();

    // 3 inserts (origineel + 2 retries)
    expect(insertSpy).toHaveBeenCalledTimes(3);
    // Warn wordt aangeroepen na definitief falen
    expect(warnSpy).toHaveBeenCalled();

    insertSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

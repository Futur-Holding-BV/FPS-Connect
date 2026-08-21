import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  uploadBestand: vi.fn(),
  deleteBestand: vi.fn(),
  transaction: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("drizzle-orm", async (importOriginal) => ({
  ...await importOriginal<typeof import("drizzle-orm")>(),
  eq: vi.fn(() => ({})),
}));

vi.mock("../middlewares/auth", () => ({
  requireBevoegdheid: () => (req: Request, _res: Response, next: NextFunction) => {
    req.session = { userId: 42 } as Request["session"];
    req.log = {
      error: mocks.logError,
      warn: mocks.logWarn,
    } as unknown as Request["log"];
    next();
  },
}));

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class MockObjectStorageService {
    uploadBestand = mocks.uploadBestand;
    deleteBestand = mocks.deleteBestand;
  },
}));

vi.mock("../lib/publiekeUrl", () => ({ publiekeAppUrl: vi.fn(() => "https://example.test") }));
vi.mock("../services/email-ai", () => ({ parseEmailBestand: vi.fn() }));
vi.mock("../services/email", () => ({ stuurAanvraagBevestiging: vi.fn() }));
vi.mock("../lib/aiGateway", () => ({
  aiGateway: { chat: vi.fn() },
  heeftGateway: vi.fn(() => true),
}));
vi.mock("../lib/documentIntelligence", () => ({
  classificeerDocument: vi.fn(),
  analyseerAanvraagVoorStroom: vi.fn(),
  extraheerTekst: vi.fn(async () => ({
    tekst: null,
    bron: "geen",
    paginaAantal: null,
    paginaTeksten: [],
  })),
}));
vi.mock("../lib/cvAnalyse", () => ({ analyseerCvBestand: vi.fn() }));
vi.mock("../services/aanvraagstroomService", () => ({ zoekKlant: vi.fn() }));

vi.mock("@workspace/db", () => {
  const tabel = new Proxy({}, { get: (_target, property) => String(property) });
  const werkgeverSelect = {
    from: vi.fn(() => ({
      where: vi.fn(async () => [{ id: 1, naam: "FPS Test" }]),
    })),
  };
  const voorstelSelect = {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => []),
      })),
    })),
  };
  return {
    db: {
      select: vi.fn()
        .mockReturnValueOnce(werkgeverSelect)
        .mockReturnValueOnce(voorstelSelect),
      transaction: mocks.transaction,
    },
    inboxItemsTable: tabel,
    inboxAuditLogTable: tabel,
    aanvraagPlanningenTable: tabel,
    aanvraagVoorstellenTable: tabel,
    gebouwenTable: tabel,
    offertesTable: tabel,
    opnamesTable: tabel,
    werkgeversTable: tabel,
    gebruikersTable: tabel,
    medewerkersTable: tabel,
    documentClassificatieCorrectiesTable: tabel,
  };
});

const { default: inboxRouter } = await import("../routes/inbox");

describe("POST /inbox/offerte-aanvraag — opslagcompensatie", () => {
  beforeEach(() => {
    mocks.uploadBestand.mockReset();
    mocks.deleteBestand.mockReset().mockResolvedValue(undefined);
    mocks.transaction.mockReset();
    mocks.logError.mockReset();
    mocks.logWarn.mockReset();

    let aanroep = 0;
    mocks.uploadBestand.mockImplementation(async (subPath: string) => {
      aanroep += 1;
      if (aanroep === 3) throw new Error("opslagfout op tweede bijlage");
      return `/objects/${subPath}`;
    });
  });

  it("verwijdert bron en eerdere bijlagen als een volgende bijlage niet kan worden opgeslagen", async () => {
    const app = express();
    app.use(inboxRouter);

    const response = await request(app)
      .post("/inbox/offerte-aanvraag")
      .field("werkmaatschappij_id", "1")
      .attach("email", Buffer.from("Subject: Test\n\nZie bijlagen."), {
        filename: "bron.eml",
        contentType: "message/rfc822",
      })
      .attach("bijlagen", Buffer.from("Eerste leesbare bewijsbijlage met voldoende inhoud."), {
        filename: "eerste.txt",
        contentType: "text/plain",
      })
      .attach("bijlagen", Buffer.from("Tweede bijlage faalt tijdens opslag."), {
        filename: "tweede.txt",
        contentType: "text/plain",
      });

    expect(response.status).toBe(503);
    expect(response.body.error).toContain('Bijlage "tweede.txt" kon niet worden opgeslagen');
    expect(mocks.uploadBestand).toHaveBeenCalledTimes(3);
    expect(mocks.deleteBestand).toHaveBeenCalledTimes(3);
    expect(mocks.transaction).not.toHaveBeenCalled();

    const verwijderdePaden = mocks.deleteBestand.mock.calls.map(([pad]) => String(pad));
    expect(verwijderdePaden.some((pad) => pad.endsWith("_bron.eml"))).toBe(true);
    expect(verwijderdePaden.some((pad) => pad.endsWith("_0_eerste.txt"))).toBe(true);
    expect(verwijderdePaden.some((pad) => pad.endsWith("_1_tweede.txt"))).toBe(true);

    const requestIds = verwijderdePaden.map((pad) => pad.match(
      /\/[a-f0-9]{16}_([0-9a-f-]{36})_/,
    )?.[1]);
    expect(new Set(requestIds)).toHaveLength(1);
  });

  it("weigert één bestand groter dan 25 MB met 413 vóór opslag", async () => {
    const app = express();
    app.use(inboxRouter);

    const response = await request(app)
      .post("/inbox/offerte-aanvraag")
      .field("werkmaatschappij_id", "1")
      .attach("email", Buffer.alloc(25 * 1024 * 1024 + 1), {
        filename: "te-groot.eml",
        contentType: "message/rfc822",
      });

    expect(response.status).toBe(413);
    expect(response.body.error).toContain("maximaal 25 MB per bestand");
    expect(mocks.uploadBestand).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("weigert bestanden boven 50 MB totaal met 413 vóór opslag", async () => {
    const app = express();
    app.use(inboxRouter);
    const achttienMb = Buffer.alloc(18 * 1024 * 1024);

    const response = await request(app)
      .post("/inbox/offerte-aanvraag")
      .field("werkmaatschappij_id", "1")
      .attach("email", achttienMb, {
        filename: "bron.eml",
        contentType: "message/rfc822",
      })
      .attach("bijlagen", achttienMb, {
        filename: "een.pdf",
        contentType: "application/pdf",
      })
      .attach("bijlagen", achttienMb, {
        filename: "twee.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(413);
    expect(response.body.error).toContain("50 MB in totaal");
    expect(mocks.uploadBestand).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
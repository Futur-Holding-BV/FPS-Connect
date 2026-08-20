import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

const mockVerstuurMail = vi.fn();
const mockSchrijfTijdlijn = vi.fn();
const mockWhere = vi.fn();
const mockFrom = vi.fn(() => ({ where: mockWhere }));

vi.mock("@workspace/db", async (importOriginal) => {
  const werkelijk = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...werkelijk,
    db: {
      select: () => ({ from: mockFrom }),
    },
  };
});

vi.mock("../middlewares/auth", () => ({
  requireBevoegdheid: () =>
    (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      (req as unknown as { session: { userId: number } }).session = { userId: 99 };
      (req as unknown as { log: { warn: ReturnType<typeof vi.fn> } }).log = { warn: vi.fn() };
      next();
    },
}));

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {},
}));

vi.mock("../services/email", async (importOriginal) => {
  const werkelijk = await importOriginal<typeof import("../services/email")>();
  return {
    ...werkelijk,
    isGeconfigureerd: () => true,
    verstuurMail: mockVerstuurMail,
  };
});

vi.mock("../services/factuurstroomService", async (importOriginal) => {
  const werkelijk = await importOriginal<typeof import("../services/factuurstroomService")>();
  return {
    ...werkelijk,
    schrijfTijdlijn: mockSchrijfTijdlijn,
  };
});

const verkoopfactuur = {
  id: 42,
  type: "verkoop",
  factuurnummer: "F-2026-0042",
  kenmerk: null,
  relatienaam: "Testrelatie",
  factuurdatum: "2026-08-19",
  vervaldatum: "2026-09-02",
  bedragExclBtw: "100.00",
  btwBedrag: "21.00",
  bedragInclBtw: "121.00",
};

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: router } = await import("../routes/facturen");
  const app = express();
  app.use(express.json());
  app.use(router);
  await new Promise<void>((resolve) => {
    server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      resolve();
    });
  });
}, 30_000);

afterAll(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe("POST /facturen/:id/verzenden-klant", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockWhere
      .mockReturnValueOnce({ limit: vi.fn().mockResolvedValue([verkoopfactuur]) })
      .mockReturnValueOnce({ orderBy: vi.fn().mockResolvedValue([]) });
    const { MailFout } = await import("../services/email");
    mockVerstuurMail.mockRejectedValue(new MailFout("testadres_onderdrukt"));
  });

  it("geeft 422 en schrijft geen verzonden-tijdlijn bij een onderdrukt klantadres", async () => {
    const response = await fetch(`${baseUrl}/facturen/42/verzenden-klant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "klant@voorbeeld.example" }),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Factuur niet verstuurd"),
    });
    expect(mockVerstuurMail).toHaveBeenCalledWith(expect.objectContaining({
      direct: true,
      naarEmail: "klant@voorbeeld.example",
    }));
    expect(mockSchrijfTijdlijn).not.toHaveBeenCalled();
  });
});
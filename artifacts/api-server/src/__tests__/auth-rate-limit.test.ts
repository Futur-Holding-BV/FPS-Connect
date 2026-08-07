import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

// ── Brute-force rate-limiting op auth-routes — integratietests ───────────────
//
// Bewijst blijvend dat de strikte express-rate-limit limiters op de
// auth-routes werken (taak #785):
//   1. 6e opeenvolgende mislukte loginpoging → 429 (1-5 → 401)
//   2. 2FA-sleutelrotatie via wisselend e-mailveld in de body werkt NIET
//      (sleutel is sessie-gebaseerd, niet body-gebaseerd)
//   3. Succesvolle logins verbruiken het budget niet (skipSuccessfulRequests)
//   4. DELETE /auth/e2e-rate-reset wist alle limiter-stores (dev-only, 404 in prod)
//   5. wachtwoord-vergeten en wachtwoord-reset hebben elk een eigen 3/uur-budget
//
// De echte express-rate-limit middleware draait mee (dat is het testobject);
// DB, bcrypt, otplib en hulpbibliotheken zijn gemockt.

// ── Configureerbare mock-state ───────────────────────────────────────────────

let wachtwoordKlopt = false; // bcrypt.compare resultaat
let totpKlopt = false;       // authenticator.check resultaat

const testGebruiker = {
  id: 1,
  naam: "Test Gebruiker",
  email: "ratelimit@test.nl",
  rol: "hoofdbeheerder",
  actief: true,
  geanonimiseerd: false,
  wachtwoord: "$2a$10$hash",
  tweeFactorIngeschakeld: true,
  totpSecret: "JBSWY3DPEHPK3PXP",
  vergrendeldTot: null,
  misluktePogingen: 0,
  tokenVersie: 1,
  avatarUrl: null,
  bedrijfskleuren: null,
  taal: "nl",
  functietitels: [],
  bevoegdheden: {},
  isHoofdtester: false,
  moetWachtwoordWijzigen: false,
  uitnodigingGeaccepteerdOp: new Date("2026-01-01T00:00:00Z"),
};

let selectRijen: unknown[] = [testGebruiker];

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const maakSelectKetting = () => ({
    from: () => ({
      where: () => {
        const p = Promise.resolve(selectRijen) as Promise<unknown[]> & {
          limit: (n: number) => Promise<unknown[]>;
        };
        p.limit = () => Promise.resolve(selectRijen);
        return p;
      },
    }),
  });
  const maakUpdateKetting = () => ({
    set: () => ({
      where: () => {
        const p = Promise.resolve([testGebruiker]) as Promise<unknown[]> & {
          returning: () => Promise<unknown[]>;
        };
        p.returning = () => Promise.resolve([testGebruiker]);
        return p;
      },
    }),
  });
  return {
    db: {
      select: maakSelectKetting,
      update: maakUpdateKetting,
      insert: () => ({ values: () => Promise.resolve() }),
    },
    gebruikersTable: { id: {}, email: {}, $inferSelect: {} },
    wachtwoordResetTokensTable: { id: {}, token: {}, verlooptOp: {}, gebruiktOp: {}, gebruikerId: {} },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  gt: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(async () => wachtwoordKlopt),
    hash: vi.fn(async () => "$2a$10$nieuwehash"),
  },
}));

vi.mock("otplib", () => ({
  authenticator: {
    options: {},
    check: vi.fn(() => totpKlopt),
    generateSecret: vi.fn(() => "SECRET"),
    keyuri: vi.fn(() => "otpauth://x"),
  },
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async () => "data:image/png;base64,x"),
    toBuffer: vi.fn(async () => Buffer.from("")),
  },
}));

vi.mock("../lib/token", () => ({ maakToken: vi.fn(() => "bearer-token") }));
vi.mock("../routes/systeem", () => ({
  legLoginPogingVast: vi.fn(async () => ({ nieuwApparaat: false, nieuwIp: false })),
}));
vi.mock("../services/email.js", () => ({ verstuurWachtwoordResetMail: vi.fn(async () => {}) }));
vi.mock("../lib/lockout", () => ({
  isVergrendeld: vi.fn(() => false),
  verwerkMislukteInlogpoging: vi.fn(async () => {}),
  resetMislukteInlogpogingen: vi.fn(async () => {}),
}));
vi.mock("../lib/session", () => ({ beeindigSessiesVanGebruiker: vi.fn(async () => {}) }));
vi.mock("../lib/effectieve-bevoegdheden", () => ({
  berekenEffectieveBevoegdheden: vi.fn(async () => ({})),
}));

// ── In-process server met sessie-stub ────────────────────────────────────────

let server: Server;
let baseUrl: string;
// Gedeelde sessie-stub, per test in te stellen (bv. pendingUserId voor 2FA)
let sessieState: Record<string, unknown> = {};

const logStub = { error: () => {}, warn: () => {}, info: () => {} };

beforeAll(async () => {
  const { default: authRouter } = await import("../routes/auth");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { session: unknown }).session = sessieState;
    (req as unknown as { log: unknown }).log = logStub;
    next();
  });
  app.use(authRouter);

  await new Promise<void>((resolve) => {
    server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(async () => {
  // Elke test start met lege limiter-stores én verse mock-state
  sessieState = {};
  wachtwoordKlopt = false;
  totpKlopt = false;
  selectRijen = [testGebruiker];
  const res = await fetch(`${baseUrl}/auth/e2e-rate-reset`, { method: "DELETE" });
  expect(res.status).toBe(204);
});

const login = (email = "ratelimit@test.nl") =>
  fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord: "fout-wachtwoord" }),
  });

// ── 1. Login brute-force ─────────────────────────────────────────────────────

describe("POST /auth/login — strikte limiter (5/15min per IP+account)", () => {
  it("geeft 401 op poging 1-5 en 429 op poging 6", async () => {
    for (let poging = 1; poging <= 5; poging++) {
      const res = await login();
      expect(res.status, `poging ${poging}`).toBe(401);
    }
    const zesde = await login();
    expect(zesde.status).toBe(429);
    const data = (await zesde.json()) as { error: string };
    expect(data.error).toContain("Te veel pogingen");
  });
});

// ── 2. 2FA sleutelrotatie-bypass werkt niet ──────────────────────────────────

describe("POST /auth/2fa/verify — sleutel is sessie-gebaseerd", () => {
  it("blokkeert poging 6 ook als elke poging een ander e-mailveld in de body stuurt", async () => {
    sessieState = { pendingUserId: 1 };
    for (let poging = 1; poging <= 5; poging++) {
      const res = await fetch(`${baseUrl}/auth/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Wisselend e-mailveld: mag de limiter-sleutel NIET roteren
        body: JSON.stringify({ code: "000000", email: `aanvaller${poging}@evil.nl` }),
      });
      expect(res.status, `poging ${poging}`).toBe(401);
    }
    const zesde = await fetch(`${baseUrl}/auth/2fa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "000000", email: "aanvaller6@evil.nl" }),
    });
    expect(zesde.status).toBe(429);
  });
});

// ── 3. Succesvolle logins verbruiken het budget niet ─────────────────────────

describe("skipSuccessfulRequests", () => {
  it("laat na 6 succesvolle logins nog steeds 5 mislukte pogingen toe", async () => {
    wachtwoordKlopt = true;
    for (let i = 1; i <= 6; i++) {
      const res = await login();
      expect(res.status, `succesvolle login ${i}`).toBe(200);
    }
    // Budget is onaangetast: 5 mislukkingen mogen nog, de 6e niet
    wachtwoordKlopt = false;
    for (let poging = 1; poging <= 5; poging++) {
      const res = await login();
      expect(res.status, `mislukte poging ${poging}`).toBe(401);
    }
    const zesde = await login();
    expect(zesde.status).toBe(429);
  });
});

// ── 4. e2e-rate-reset wist alle stores ───────────────────────────────────────

describe("DELETE /auth/e2e-rate-reset", () => {
  it("wist de login-limiter zodat een geblokkeerd IP+account weer 401 krijgt", async () => {
    for (let i = 0; i < 5; i++) await login();
    expect((await login()).status).toBe(429);

    const reset = await fetch(`${baseUrl}/auth/e2e-rate-reset`, { method: "DELETE" });
    expect(reset.status).toBe(204);

    // Weer gewoon 401 (onjuiste inloggegevens), geen 429
    expect((await login()).status).toBe(401);
  });

  it("wist ook de wachtwoord-limiters", async () => {
    for (let i = 0; i < 3; i++) {
      await fetch(`${baseUrl}/auth/wachtwoord-vergeten`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "x@test.nl" }),
      });
    }
    const vierde = await fetch(`${baseUrl}/auth/wachtwoord-vergeten`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "x@test.nl" }),
    });
    expect(vierde.status).toBe(429);

    await fetch(`${baseUrl}/auth/e2e-rate-reset`, { method: "DELETE" });

    const naReset = await fetch(`${baseUrl}/auth/wachtwoord-vergeten`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "x@test.nl" }),
    });
    expect(naReset.status).toBe(204);
  });

  it("geeft 404 in productie (dev-only endpoint)", async () => {
    const origineel = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await fetch(`${baseUrl}/auth/e2e-rate-reset`, { method: "DELETE" });
      expect(res.status).toBe(404);
    } finally {
      process.env.NODE_ENV = origineel;
    }
  });
});

// ── 5. Wachtwoordroutes: elk een eigen 3/uur-budget ──────────────────────────

describe("wachtwoord-vergeten en wachtwoord-reset — gescheiden budgetten", () => {
  it("uitputten van wachtwoord-vergeten raakt het budget van wachtwoord-reset niet", async () => {
    // Put wachtwoord-vergeten volledig uit (3 toegestaan, 4e → 429)
    for (let i = 1; i <= 3; i++) {
      const res = await fetch(`${baseUrl}/auth/wachtwoord-vergeten`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "x@test.nl" }),
      });
      expect(res.status, `vergeten-poging ${i}`).toBe(204);
    }
    const vierde = await fetch(`${baseUrl}/auth/wachtwoord-vergeten`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "x@test.nl" }),
    });
    expect(vierde.status).toBe(429);

    // wachtwoord-reset heeft zijn EIGEN budget: 3 pogingen toegestaan, 4e → 429
    selectRijen = []; // geen geldig token → 400, maar telt wél mee voor het budget
    for (let i = 1; i <= 3; i++) {
      const res = await fetch(`${baseUrl}/auth/wachtwoord-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "ongeldig", nieuw_wachtwoord: "wachtwoord123" }),
      });
      expect(res.status, `reset-poging ${i}`).toBe(400);
    }
    const resetVierde = await fetch(`${baseUrl}/auth/wachtwoord-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "ongeldig", nieuw_wachtwoord: "wachtwoord123" }),
    });
    expect(resetVierde.status).toBe(429);
  });
});

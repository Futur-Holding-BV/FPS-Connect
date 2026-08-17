import { describe, it, expect, vi } from "vitest";

// AI_01 vervolg (17-08-2026) — poortwachter: een aanroep zonder volledige
// logcontext (module, functie, promptNaam, promptVersie) mag niet door de
// poort. Er mag dus ook nooit een echte OpenAI-aanroep plaatsvinden.

vi.mock("@workspace/db", () => {
  // Volledig generieke, chainbare db-mock: elke methode geeft weer een
  // thenable proxy terug die naar een lege rijenlijst resolve't.
  function maakChain(): unknown {
    const target = () => undefined;
    const proxy: unknown = new Proxy(target, {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve([]);
        }
        if (prop === "catch" || prop === "finally") {
          return () => proxy;
        }
        return () => maakChain();
      },
      apply() { return maakChain(); },
    });
    return proxy;
  }
  const db = maakChain();
  // Tabellen zijn alleen argumenten voor de (gemockte) querybuilder; vitest
  // eist expliciet gedefinieerde exports, dus benoem wat de importketen nodig
  // heeft.
  return {
    db,
    aiAanroepenTable: {},
    aiPromptScansTable: {},
    aiWijzigingsvoorstellenTable: {},
    appInstellingenTable: {},
  };
});

vi.mock("../lib/openai", () => ({
  maakOpenAiClient: () => { throw new Error("OpenAI-client mag niet worden aangemaakt bij geweigerde aanroep"); },
  heeftOpenAi: () => true,
}));

import { aiGateway, type LogContext } from "../lib/aiGateway";

const params = { messages: [{ role: "user" as const, content: "test" }] };

describe("AI-gateway poortwachter (verplichte logcontext)", () => {
  it("weigert chat() zonder promptVersie", async () => {
    const ctx = { module: "test", functie: "f", promptNaam: "p" } as unknown as LogContext;
    const res = await aiGateway.chat("default", params, undefined, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fout).toContain("onvolledige logcontext");
  });

  it("weigert chat() met lege module", async () => {
    const ctx = { module: "  ", functie: "f", promptNaam: "p", promptVersie: "1" } as LogContext;
    const res = await aiGateway.chat("default", params, undefined, ctx);
    expect(res.ok).toBe(false);
  });

  it("weigert chat() zonder enige context", async () => {
    const res = await aiGateway.chat("default", params, undefined, undefined as unknown as LogContext);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fout).toContain("onvolledige logcontext");
  });

  it("weigert responses() zonder functie", async () => {
    const ctx = { module: "test", promptNaam: "p", promptVersie: "1" } as unknown as LogContext;
    const res = await aiGateway.responses("default", { input: "test" }, undefined, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fout).toContain("onvolledige logcontext");
  });

  it("laat een volledige context door tot aan de clientlaag", async () => {
    const ctx: LogContext = { module: "test", functie: "f", promptNaam: "p", promptVersie: "1" };
    // Volledige context passeert de poort; de gemockte clientfabriek gooit dan
    // bewust — het resultaat is een nette fout, géén weigering op context.
    const res = await aiGateway.chat("default", params, undefined, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fout).not.toContain("onvolledige logcontext");
  });
});

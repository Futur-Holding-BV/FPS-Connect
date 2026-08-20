import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const values = vi.fn().mockResolvedValue(undefined);
  return {
    insert: vi.fn(() => ({ values })),
    values,
  };
});

vi.mock("@workspace/db", () => ({
  db: { insert: mocks.insert },
  mailLogboekTable: {},
  mailWachtrijTable: {},
}));

describe("directe mail", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.AZURE_TENANT_ID = "tenant";
    process.env.AZURE_CLIENT_ID_NEW = "client";
    process.env.AZURE_CLIENT_SECRET = "secret";
  });

  it("weigert een onderdrukt testadres en logt dit niet als verzonden", async () => {
    const { verstuurMail, MailFout } = await import("./email");

    await expect(
      verstuurMail({
        naarEmail: "klant@voorbeeld.example",
        onderwerp: "Factuur F-1",
        html: "<p>factuur</p>",
        soort: "verkoopfactuur",
        direct: true,
      }),
    ).rejects.toMatchObject({
      name: "MailFout",
      categorie: "testadres_onderdrukt",
    });

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "mislukt",
        foutCategorie: "testadres_onderdrukt",
      }),
    );
    expect(mocks.values).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "verzonden" }),
    );
  });

  it("logt pas verzonden nadat Microsoft Graph de mail accepteert", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token" }), { status: 200 }))
        .mockResolvedValueOnce(new Response(null, { status: 202 })),
    );
    const { verstuurMail } = await import("./email");

    await verstuurMail({
      naarEmail: "klant@fpsbrandpreventie.nl",
      onderwerp: "Factuur F-2",
      html: "<p>factuur</p>",
      soort: "verkoopfactuur",
      direct: true,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ status: "verzonden", foutCategorie: null }),
    );
  });
});
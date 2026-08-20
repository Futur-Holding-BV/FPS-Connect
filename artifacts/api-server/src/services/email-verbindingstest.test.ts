import { afterEach, describe, expect, it, vi } from "vitest";

const MAILBOX = "postbus@fpsbrandpreventie.nl";

function graphResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function laadEmailService(fetchMock: ReturnType<typeof vi.fn>) {
  vi.resetModules();
  vi.stubEnv("AZURE_TENANT_ID", "tenant-test");
  vi.stubEnv("AZURE_CLIENT_ID_NEW", "client-test");
  vi.stubEnv("AZURE_CLIENT_ID", "");
  vi.stubEnv("AZURE_CLIENT_SECRET", "secret-test");
  vi.stubEnv("MAIL_MAILBOX", MAILBOX);
  vi.stubGlobal("fetch", fetchMock);
  return import("./email");
}

function tokenResponse(): Response {
  return graphResponse(200, { access_token: "token-test" });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("testVerbinding", () => {
  it("controleert Mail.Send zonder gebruikersobject te lezen en verstuurt geen bericht", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        graphResponse(400, {
          error: {
            code: "ErrorInvalidRecipients",
            message: "At least one recipient is not valid. A message can't be sent because it contains no recipients.",
          },
        }),
      );
    const { testVerbinding } = await laadEmailService(fetchMock);

    await expect(testVerbinding()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAILBOX)}/sendMail`,
    );
    const init = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      message: { toRecipients: [] },
      saveToSentItems: false,
    });
  });

  it("meldt ontbrekende Mail.Send- of postbusrechten begrijpelijk", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        graphResponse(403, {
          error: {
            code: "ErrorAccessDenied",
            message: "Access is denied. Check credentials and try again.",
          },
        }),
      );
    const { testVerbinding } = await laadEmailService(fetchMock);

    await expect(testVerbinding()).rejects.toMatchObject({
      categorie: "onvoldoende_rechten",
      message:
        "Microsoft 365 weigert toegang tot de postbus — controleer Mail.Send en de app-toegang tot deze postbus.",
    });
  });

  it("meldt een niet-bestaande postbus begrijpelijk", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        graphResponse(404, {
          error: {
            code: "Request_ResourceNotFound",
            message: "Resource could not be discovered.",
          },
        }),
      );
    const { testVerbinding } = await laadEmailService(fetchMock);

    await expect(testVerbinding()).rejects.toMatchObject({
      categorie: "mailbox_onbereikbaar",
      message: "De postbus is niet bereikbaar of bestaat niet in Microsoft 365.",
    });
  });

  it("accepteert geen willekeurige Graph-400 als gezonde verbinding", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        graphResponse(400, {
          error: {
            code: "Request_BadRequest",
            message: "An unrelated request property is invalid.",
          },
        }),
      );
    const { testVerbinding } = await laadEmailService(fetchMock);

    await expect(testVerbinding()).rejects.toMatchObject({
      categorie: "verzendfout",
    });
  });
});
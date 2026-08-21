import { afterEach, describe, expect, it, vi } from "vitest";
import { verwerkInboxOfferteavanvraag } from "./generated/api";

describe("verwerkInboxOfferteavanvraag multipartcontract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("voegt ieder geselecteerd bijlagebestand afzonderlijk toe aan FormData", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const email = new Blob(["From: inkoop@example.test\nSubject: Aanvraag"], {
      type: "message/rfc822",
    });
    const bijlagen = [
      new Blob(["Brandwerende doorvoeringen herstellen"], { type: "text/plain" }),
      new Blob(["Tweede bewijsbijlage"], { type: "text/plain" }),
    ];

    await verwerkInboxOfferteavanvraag({
      werkmaatschappij_id: 7,
      email,
      bijlagen,
    });

    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.body).toBeInstanceOf(FormData);

    const formData = requestInit?.body as FormData;
    expect(formData.get("werkmaatschappij_id")).toBe("7");
    expect(formData.get("email")).toBeInstanceOf(Blob);
    const ontvangenBijlagen = formData.getAll("bijlagen") as Blob[];
    expect(ontvangenBijlagen).toHaveLength(2);
    expect(await ontvangenBijlagen[0]?.text()).toBe("Brandwerende doorvoeringen herstellen");
    expect(await ontvangenBijlagen[1]?.text()).toBe("Tweede bewijsbijlage");
  });
});
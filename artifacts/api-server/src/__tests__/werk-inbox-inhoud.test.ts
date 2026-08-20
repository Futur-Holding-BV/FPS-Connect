import { describe, expect, it } from "vitest";
import { normaliseerGraphBericht } from "../services/werkInboxGraph";

describe("normaliseerGraphBericht", () => {
  it("maakt van een Graph-body-object een afzonderlijke HTML-string en normaliseert samengestelde velden", () => {
    const inhoud = normaliseerGraphBericht({
      body: {
        contentType: "HTML",
        content: "<p>Beste collega,</p><p>Dit is de echte mailtekst.</p>",
      },
      from: {
        emailAddress: {
          name: "Testafzender",
          address: "afzender@example.test",
        },
      },
      toRecipients: [
        { emailAddress: { name: "Werk-inbox", address: "inbox@example.test" } },
      ],
      ccRecipients: [
        { emailAddress: { address: "cc@example.test" } },
      ],
      attachments: [
        {
          id: "bijlage-1",
          name: "controle.pdf",
          contentType: "application/pdf",
          contentId: "cid-controle",
        },
      ],
    });

    expect(inhoud.body).toBe("<p>Beste collega,</p><p>Dit is de echte mailtekst.</p>");
    expect(typeof inhoud.body).toBe("string");
    expect(inhoud.body).not.toContain("[object Object]");
    expect(inhoud.contentType).toBe("html");
    expect(inhoud.van).toBe("Testafzender <afzender@example.test>");
    expect(inhoud.aan).toEqual(["Werk-inbox <inbox@example.test>"]);
    expect(inhoud.cc).toEqual(["cc@example.test"]);
    expect(inhoud.bijlagen).toEqual([{
      naam: "controle.pdf",
      contentType: "application/pdf",
      contentId: "cid-controle",
    }]);
  });

  it("behoudt regeleinden en markeert Graph Text-inhoud als platte tekst", () => {
    const inhoud = normaliseerGraphBericht({
      body: {
        contentType: "Text",
        content: "Eerste regel\nTweede regel",
      },
    });

    expect(inhoud).toMatchObject({
      body: "Eerste regel\nTweede regel",
      contentType: "text",
      van: null,
      aan: [],
      cc: [],
      bijlagen: [],
    });
  });

  it("converteert een onbekend body-object nooit impliciet naar tekst", () => {
    const inhoud = normaliseerGraphBericht({
      body: { contentType: "Text", content: { onverwacht: true } },
    });

    expect(inhoud.body).toBe("");
    expect(inhoud.body).not.toBe("[object Object]");
  });
});
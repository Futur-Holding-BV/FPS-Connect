/**
 * SENTRY_01 §2.3 — privacy-acceptatie: de allowlist-scrub garandeert dat een
 * uitgaand event nooit request body, cookies, authorization/x-api-key-headers,
 * querystring-waarden, user, extra's of breadcrumbs bevat — ongeacht wie ze
 * heeft toegevoegd (route, SDK-integratie of foutobject-context).
 */
import { describe, it, expect } from "vitest";
import type { Event } from "@sentry/node";
import { verwijderGevoeligeVelden } from "@workspace/foutmonitoring";
import { scrubEvent } from "../instrument";
import {
  maakRoutingBewijs,
  maakVeiligHandelingslabel,
} from "../middlewares/foutafhandelaar";
import type { Request } from "express";

const TEST_WACHTWOORD = "SENTRY-TEST-WACHTWOORD-NIET-VERZENDEN";

function vuilEvent(): Event {
  return {
    event_id: "0123456789abcdef0123456789abcdef",
    release: "0b2f5b8",
    environment: "production",
    tags: {
      verwijzingscode: "FPS-3A9C1B04",
      component: "api",
      handeling: "POST:/api/uren",
      routing_bewijs: "a".repeat(64),
      urgentie: "mag-niet-uit-bron-komen",
      rol: "hoofdbeheerder",
      pagina: "/facturen/918/verzenden?token=GEHEIM",
      vrije_tag: `wachtwoord=${TEST_WACHTWOORD}`,
    },
    exception: {
      values: [{
        type: "Error",
        value: `kapot voor rene@fps.nl; wachtwoord=${TEST_WACHTWOORD}; iban=NL91ABNA0417164300`,
        mechanism: {
          type: "rene@fps.nl/geheim-token",
          handled: false,
        },
        stacktrace: {
          frames: [{
            filename: "https://connect.fps-one.nl/assets/app.js?token=GEHEIM",
            function: "verstuurFactuur",
            module: "rene@fps.nl/geheim-token",
            lineno: 91,
            colno: 12,
            vars: { wachtwoord: TEST_WACHTWOORD },
          }],
        },
      }],
    },
    request: {
      method: "POST",
      url: "https://connect.fps-one.nl/api/declaraties?token=GEHEIM&iban=NL91ABNA0417164300",
      query_string: "token=GEHEIM",
      data: { iban: "NL91ABNA0417164300", loon: 4200 },
      cookies: { "connect.sid": "s%3Ageheim" },
      headers: {
        cookie: "connect.sid=s%3Ageheim",
        authorization: "Bearer geheim-token",
        "x-api-key": "sleutel",
        "user-agent": "Mozilla/5.0",
      },
    },
    user: { id: "11", email: "rene@fps.nl", ip_address: "1.2.3.4", naam: "René" },
    extra: { body: { iban: "NL91..." }, los: "waarde" },
    breadcrumbs: [{ message: "GET /api/loon?bsn=123456789" }],
    threads: {
      values: [{
        id: "rene@fps.nl",
        crashed: true,
        stacktrace: {
          frames: [{
            filename: "/home/rene/geheim-token/rene@fps.nl.ts",
            function: "functie_met_persoonsnaam_Rene",
            module: "rene@fps.nl/geheim-token",
            lineno: 12,
          }],
        },
      }],
    },
    contexts: {
      verzoek: {
        methode: "POST",
        pad: "/api/declaraties/918?token=GEHEIM",
        status: 500,
        handeling: "uren_opslaan",
        klant: { naam: "Klant BV" },
      },
      runtime: { name: "node" },
      trace: { trace_id: "t", span_id: "s" },
    },
  } as Event;
}

describe("scrubEvent (SENTRY_01 allowlist)", () => {
  it("laat alleen methode en queryloos pad over van de request", () => {
    const e = scrubEvent(vuilEvent());
    expect(e.request).toEqual({
      method: "POST",
      url: "/api/declaraties",
    });
  });

  it("bevat nergens meer body, cookies, auth-headers of querystring-waarden", () => {
    const e = scrubEvent(vuilEvent());
    const json = JSON.stringify(e);
    for (const verboden of [
      "GEHEIM",
      "NL91",
      "geheim-token",
      "sleutel",
      "connect.sid",
      "rene@fps.nl",
      "1.2.3.4",
      "bsn",
      "Mozilla",
      TEST_WACHTWOORD,
      "Klant BV",
      "René",
    ]) {
      expect(json).not.toContain(verboden);
    }
    expect(e.user).toEqual({ id: "11" });
    expect(e.extra).toBeUndefined();
    expect(e.breadcrumbs).toBeUndefined();
  });

  it("behoudt alleen veilige foutstructuur, tags, release en verzoek-context", () => {
    const e = scrubEvent(vuilEvent());
    expect(e.exception?.values?.[0]?.value).toBe("Onverwachte technische fout");
    expect(e.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({
      filename: "app.js",
      lineno: 91,
      colno: 12,
    });
    expect(e.exception?.values?.[0]?.mechanism).toEqual({ handled: false });
    expect(e.tags).toEqual({
      verwijzingscode: "FPS-3A9C1B04",
      component: "api",
      handeling: "POST:/api/uren",
      routing_bewijs: "a".repeat(64),
      rol: "hoofdbeheerder",
      pagina: "/facturen/:scherm",
    });
    expect(e.release).toBe("0b2f5b8");
    expect(e.contexts).toEqual({
      verzoek: {
        methode: "POST",
        pad: "/api/declaraties/:scherm",
        status: 500,
      },
    });
    expect(e.threads).toEqual({ values: [{ crashed: true }] });
  });

  it("overleeft een event zonder request/contexts", () => {
    const e = scrubEvent({
      event_id: "0123456789abcdef0123456789abcdef",
    } as Event);
    expect(e.event_id).toBe("0123456789abcdef0123456789abcdef");
  });
});

describe("veilig API-handelingslabel en herkomstbewijs", () => {
  it("gebruikt het Express-routesjabloon en nooit een persoonswaarde uit de URL", () => {
    expect(
      maakVeiligHandelingslabel({
        method: "PATCH",
        baseUrl: "/api",
        route: { path: "/uren/:id" },
        originalUrl: "/api/uren/918?token=geheim",
        path: "/api/uren/918",
      } as unknown as Request),
    ).toEqual({
      handeling: "PATCH:/api/uren/:id",
      pad: "/api/uren/:id",
    });
    expect(
      maakVeiligHandelingslabel({
        method: "POST",
        baseUrl: "",
        route: undefined,
        originalUrl: "/api/crm/rene@fps.nl?token=geheim",
        path: "/api/crm/rene@fps.nl",
      } as unknown as Request),
    ).toEqual({
      handeling: "POST:/api/crm/:scherm",
      pad: "/api/crm/:scherm",
    });
  });

  it("tekent het label alleen met een voldoende lang servergeheim", () => {
    const vorig = process.env["SENTRY_ROUTING_SIGNING_SECRET"];
    process.env["SENTRY_ROUTING_SIGNING_SECRET"] =
      "test-router-geheim-met-minstens-32-tekens";
    try {
      expect(
        maakRoutingBewijs("FPS-3A9C1B04", "POST:/api/uren"),
      ).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      if (vorig === undefined) {
        delete process.env["SENTRY_ROUTING_SIGNING_SECRET"];
      } else {
        process.env["SENTRY_ROUTING_SIGNING_SECRET"] = vorig;
      }
    }
  });
});

describe("recursieve veldnamenfilter", () => {
  it("verwijdert gevoelige velden op iedere diepte zonder broervelden te verliezen", () => {
    const schoon = verwijderGevoeligeVelden({
      veilig: "blijft",
      wachtwoord: TEST_WACHTWOORD,
      genest: {
        klant: { naam: "Klant BV" },
        gebruikers_id: 11,
        lijst: [{ authorization: "Bearer geheim", status: 500 }],
      },
    });
    expect(schoon).toEqual({
      veilig: "blijft",
      genest: {
        gebruikers_id: 11,
        lijst: [{ status: 500 }],
      },
    });
    expect(JSON.stringify(schoon)).not.toContain(TEST_WACHTWOORD);
  });
});

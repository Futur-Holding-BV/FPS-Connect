/**
 * SENTRY_01 §2.3 — privacy-acceptatie: de allowlist-scrub garandeert dat een
 * uitgaand event nooit request body, cookies, authorization/x-api-key-headers,
 * querystring-waarden, user, extra's of breadcrumbs bevat — ongeacht wie ze
 * heeft toegevoegd (route, SDK-integratie of foutobject-context).
 */
import { describe, it, expect } from "vitest";
import type { Event } from "@sentry/node";
import { scrubEvent } from "../instrument";

function vuilEvent(): Event {
  return {
    event_id: "abc",
    release: "0b2f5b8",
    environment: "production",
    tags: { verwijzingscode: "FPS-3A9C1B04" },
    exception: { values: [{ type: "Error", value: "kapot" }] },
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
    user: { id: "11", email: "rene@fps.nl", ip_address: "1.2.3.4" },
    extra: { body: { iban: "NL91..." }, los: "waarde" },
    breadcrumbs: [{ message: "GET /api/loon?bsn=123456789" }],
    contexts: {
      verzoek: { methode: "POST", pad: "/api/declaraties", status: 500 },
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
      url: "https://connect.fps-one.nl/api/declaraties",
    });
  });

  it("bevat nergens meer body, cookies, auth-headers of querystring-waarden", () => {
    const e = scrubEvent(vuilEvent());
    const json = JSON.stringify(e);
    for (const verboden of ["GEHEIM", "NL91", "geheim-token", "sleutel", "connect.sid", "rene@fps.nl", "1.2.3.4", "bsn", "Mozilla"]) {
      expect(json).not.toContain(verboden);
    }
    expect(e.user).toBeUndefined();
    expect(e.extra).toBeUndefined();
    expect(e.breadcrumbs).toBeUndefined();
  });

  it("behoudt fout, tags (verwijzingscode), release en de eigen verzoek-context", () => {
    const e = scrubEvent(vuilEvent());
    expect(e.exception?.values?.[0]?.value).toBe("kapot");
    expect(e.tags).toEqual({ verwijzingscode: "FPS-3A9C1B04" });
    expect(e.release).toBe("0b2f5b8");
    expect(e.contexts).toEqual({ verzoek: { methode: "POST", pad: "/api/declaraties", status: 500 } });
  });

  it("overleeft een event zonder request/contexts", () => {
    const e = scrubEvent({ event_id: "x" } as Event);
    expect(e.event_id).toBe("x");
  });
});

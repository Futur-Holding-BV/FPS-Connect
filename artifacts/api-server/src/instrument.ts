/**
 * Sentry-initialisatie (SENTRY_01). MOET de allereerste import in index.ts
 * zijn, vóór ./app en alle andere imports.
 *
 * - Zonder SENTRY_DSN wordt Sentry niet geïnitialiseerd; de app start gewoon
 *   door en er wordt nooit een event verstuurd (ontwikkelomgeving/CI).
 * - Alleen Error Monitoring: tracing/profiling/logs/metrics staan uit.
 * - Privacy gaat vóór gemak (§2.3): de scrub is ALLOWLIST-gebaseerd — alles
 *   wat niet expliciet is toegestaan gaat eruit, ook wat SDK-integraties
 *   zelf toevoegen (breadcrumbs, extra, contexts, user).
 * - release = GIT_COMMIT (zit al in de productie-image gebakken); ontbreekt
 *   die, dan blijft release leeg — nooit een verzonnen waarde.
 */
import * as Sentry from "@sentry/node";

/**
 * Allowlist-scrub van een uitgaand Sentry-event.
 *
 * Blijft over:
 * - de fout zelf (exception/stacktrace), event-metadata en release/environment;
 * - onze eigen tags (o.a. verwijzingscode);
 * - requestcontext beperkt tot methode en pad zónder querystring;
 * - onze eigen context `verzoek` (methode/pad/status), niets anders.
 *
 * Gaat er onvoorwaardelijk uit: request body/data, cookies, ALLE headers,
 * querystring, user, extra, breadcrumbs en alle overige contexts — ongeacht
 * wie ze heeft toegevoegd.
 */
export function scrubEvent<E extends Sentry.Event>(event: E): E {
  if (event.request) {
    event.request = {
      ...(event.request.method ? { method: event.request.method } : {}),
      ...(event.request.url ? { url: event.request.url.split("?")[0] } : {}),
    };
  }
  delete event.user;
  delete event.extra;
  delete event.breadcrumbs;
  if (event.contexts) {
    const verzoek = event.contexts["verzoek"];
    // Alleen onze eigen, bewust gevulde context behouden; runtime/os/device
    // e.d. bevatten geen PII maar zijn ook niet nodig — allowlist is allowlist.
    event.contexts = verzoek ? { verzoek } : {};
  }
  return event;
}

const dsn = process.env["SENTRY_DSN"]?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env["SENTRY_ENVIRONMENT"]?.trim() || process.env["NODE_ENV"] || undefined,
    release: process.env["GIT_COMMIT"]?.trim() || undefined,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // Geen ademruimte voor per ongeluk meegelifte requestdata:
    maxBreadcrumbs: 0,
    beforeSend(event) {
      return scrubEvent(event);
    },
  });
  // Bewust géén console-melding met de DSN; alleen dat monitoring actief is.
  console.log("Sentry foutmonitoring actief (alleen error monitoring).");
} else {
  console.log("Sentry niet geïnitialiseerd: SENTRY_DSN ontbreekt — applicatie start zonder foutmonitoring.");
}

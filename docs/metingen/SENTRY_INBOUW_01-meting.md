# SENTRY_INBOUW_01 — nulmeting en bewijs

**Meetdatum:** 20 augustus 2026  
**Scope:** API-server, Firevault, FPS Monteur en meldroutering via
`Futur-Holding-BV/futur-control`.

## Nulmeting vóór deze opdracht

| Onderdeel | Aangetroffen | Productieconfiguratie / nulwaarde |
|---|---|---|
| API-server | `@sentry/node`, productie-init, `beforeSend`, release uit `GIT_COMMIT`, omgeving uit `SENTRY_ENVIRONMENT`/`NODE_ENV`, centrale 500-foutafhandelaar en hoofdbeheerder-testfout bestonden al. API-sourcemaps werden fail-open in de deploy geüpload. | `SENTRY_DSN` bleef omgevingsconfiguratie. Zonder waarde: geen initialisatie en geen event. |
| Firevault | `@sentry/react`, runtimeconfig via `GET /api/monitoring-config`, renderfoutkoppeling en gebruikers-id bestonden al. De browser had een eigen scrubber. | `SENTRY_DSN_WEB` werd als publieke DSN runtime geleverd. Zonder waarde of bij configuitval: geen initialisatie. |
| FPS Monteur | Geen Sentry-pakket, plugin, Metro-config, initialisatie, foutgrenskoppeling of scherm-/gebruikerscontext. Wel bestond een lokale `ErrorBoundary` en offline-first synchronisatie. | Geen mobiele DSN-instelling; functionele nulwaarde. |
| Beheercentrum | Bestaande eigen Slack-aflevering en repository-/zelfherstelmonitor, maar geen getekende Sentry-invoer, issue-deduplicatie, Sentry-herstelonderdrukking of Sentry-tijdvensters. | Geen `SENTRY_WEBHOOK_SECRET`; functionele nulwaarde. |

De eerdere `SENTRY_01`-inbouw dekte dus servervoorbereiding, API-sourcemaps,
browservoorbereiding, verwijzingscodes en een API-testfout. Hij dekte niet één
gedeelde privacygrens, FPS Monteur, drie project-DSN's, echte drieledige
eventproeven of routering via het beheercentrum.

## Inbouwresultaat in de broncode

### Eén privacygrens

`@workspace/foutmonitoring` bouwt voor alle drie SDK's een volledig nieuw,
allowlisted event. Vooraf verwijdert een recursieve veldnamenfilter onder meer
wachtwoorden, tokens, autorisatie, cookies, request bodies, querywaarden, BSN,
IBAN, adressen, klantvelden, namen en e-mail. Vrije fouttekst wordt vervangen
door `Onverwachte technische fout`; alleen type en gestructureerde stackframes
blijven behouden.

Toegestane context:

- omgeving en release/commit;
- component;
- numeriek intern gebruikers-id en rol;
- queryloos, genormaliseerd scherm;
- voor API-fouten een veilig `METHODE:/genormaliseerd/pad`;
- API-verwijzingscode.

Breadcrumbs, extra data, vrije contexts, requestheaders/body, tracing,
profiling, replay en sessietracking worden niet verzonden. Een eventuele tag
`urgentie` overleeft de allowlist niet: alleen het beheercentrum classificeert.

### Componenten

| Onderdeel | Nieuwe dekking |
|---|---|
| API-server | Centrale `beforeSend` gebruikt de gedeelde grens. De 500-handler levert alleen id, rol, verwijzingscode en veilig handelingslabel. De testfout bevat bewust `SENTRY-TEST-WACHTWOORD-NIET-VERZENDEN`; de regressietest eist dat die waarde nergens in het uitgaande event staat. |
| Firevault | Gedeelde grens, alle breadcrumbs uit, minimale gebruiker-/rolcontext en genormaliseerd scherm. Uitloggen wist de gebruiker. |
| FPS Monteur | Officiële `@sentry/react-native` SDK, Expo-plugin en Sentry Metro-config. Runtime mobiele DSN, omgeving en commit komen van het publieke config-endpoint. De bestaande lokale `ErrorBoundary` blijft actief en rapporteert aanvullend. De SDK-native transportlaag kan veilig offline bufferen; zonder DSN/netwerk blijft de app werken. In development wordt niet geïnitialiseerd. |
| Beheercentrum | Getekende webhookinvoer, minimale routeringsopslag, twee-voorkomensdrempel, onderdrukking na Sentry-resolve/archive, vier expliciete directe blokkades en Europe/Amsterdam-vensters. De beheercentrumwijziging wordt afzonderlijk in `Futur-Holding-BV/futur-control` geleverd. |

## Automatisch bewijs

| Controle | Uitkomst 20 augustus 2026 |
|---|---|
| `pnpm run typecheck:libs` | Groen |
| API-, Firevault- en Monteur-typecheck | Groen |
| `sentry-scrub.test.ts` | Groen: allowlist, recursieve veldfilter, generieke fouttekst, genormaliseerde paden en testwachtwoord-negatiefproef |
| `verificatie-sentry-inbouw01` | Groen: alle drie clients gebruiken dezelfde grens; mobiel pakket/plugin/Metro/context aanwezig; urgentie ontbreekt in bronapps |
| `futur-control` typecheck en build | Groen in geïsoleerde repositorycontrole |
| `futur-control` policy- en routertests | Groen: 22 tests voor exacte labels en tijden, minimale payload, HMAC-herkomst, webhookretry-deduplicatie en atomische resolve-vóór-meldclaim |

## Extern productie- en eventbewijs

De volgende regels worden pas als **bewezen** gemarkeerd nadat de Sentry-
koppeling is geautoriseerd, de project-DSN's als productieconfiguratie zijn
gezet en de betrokken releases zijn uitgerold:

| Bewijs | Status |
|---|---|
| API-testevent in API-project met productieomgeving, commit, id/rol en veilig handelingslabel | Wacht op Sentry-configuratie en uitrol |
| Firevault-testevent in webproject met productieomgeving, commit, id/rol en veilig scherm | Wacht op Sentry-configuratie en uitrol |
| FPS Monteur-testevent in mobiel project met productieomgeving, release/commit, id/rol en veilig scherm | Wacht op Sentry-configuratie en nieuwe EAS-build/update |
| Event-JSON bevat nergens `SENTRY-TEST-WACHTWOORD-NIET-VERZENDEN` | Wacht op ontvangen API-event |
| Sentry levert aan `futur-control`; geen rechtstreekse Sentry-e-mailactie | Wacht op Sentry-integratie-inrichting |
| Eenmalig en opgelost issue geven geen beheercentrummelding; tweede actief voorkomen volgt juiste tijdregel | Wacht op getekende productie-webhookproef |

Geen stilte of ontbrekende rij geldt als bewijs: ieder kanaal wordt eerst met
een positieve testgebeurtenis gecontroleerd.
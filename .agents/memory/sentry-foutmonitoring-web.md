---
name: Sentry browserkant + Dit werkt niet
description: Hoe de web-foutmonitoring en de laagdrempelige meldknop zijn opgezet en welke privacy/race-regels gelden.
---

- Browser-Sentry krijgt zijn DSN runtime via een publiek config-endpoint (`SENTRY_DSN_WEB` op de server) — DSN-wijziging vergt géén rebuild; zonder DSN blijft de browserkant volledig uit (zelfde fail-silent houding als de serverkant).
- **Init-race**: de app rendert vóór de config-fetch klaar is. Gebruiker/pagina-setters moeten hun gewenste waarde bufferen en die ná `Sentry.init` alsnog toepassen, anders missen events juist de beloofde context.
- **Privacy**: naar de externe dienst gaat alleen het gepseudonimiseerde gebruikers-id — nooit naam/e-mail/IP; allowlist-scrub in `beforeSend` (geen breadcrumbs/extra/contexts/request-data). Review keurt `username` af.
- Eigen React ErrorBoundaries rapporteren niet vanzelf: `componentDidCatch` moet expliciet `captureException` aanroepen.
- "Dit werkt niet"-knop: voor élke ingelogde gebruiker (bewust géén module-eis, breder dan de bug-meldknop), landt als actiepunt categorie `meldingen`; gebruiker altijd server-side uit de sessie; per-gebruiker throttle tegen actiepunten-spam is een reviewvereiste.
- Bewuste testfout-endpoint (hoofdbeheerder-only) op een géauthenticeerde router zetten — de publieke health-router heeft geen auth-context, `requireRol` geeft daar altijd 401.

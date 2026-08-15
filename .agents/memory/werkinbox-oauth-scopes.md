---
name: Werk-inbox OAuth scopes & state
description: Regels voor de gedelegeerde Microsoft-koppeling van de werk-inbox (scopes, refresh, redirect-URI, sessie-gebonden state)
---

- DELEGATED_SCOPES = exact de door de beheerder goedgekeurde set: `User.Read Mail.ReadWrite Mail.ReadWrite.Shared Mail.Send Mail.Send.Shared offline_access`.
- **Refresh nooit met scope-parameter**: Microsoft staat bij refresh alleen een subset van de oorspronkelijke grant toe; een bredere scope meesturen laat refreshes van oude (smallere) koppelingen falen met 400 → koppeling wordt onterecht als stuk gemarkeerd. Bredere rechten alleen via interactief herkoppelen.
- Opgeslagen `werk_inbox_tokens.scope` = de door Microsoft **toegekende** scope uit de token-response, fail-closed (ontbreekt = leeg = herkoppelen-banner). `offline_access` komt nooit terug in de response, dus uitsluiten bij vergelijken (`ontbrekendeScopes()` — case/prefix-tolerant).
- `/oauth/status` geeft `herkoppelenNodig` + `ontbrekendeRechten`; frontend toont amber banner met herkoppel-knop.
- Redirect-URI staat vast op de geregistreerde `https://connect.fps-one.nl/api/werk-inbox/oauth/callback` (env `AZURE_REDIRECT_URI` overschrijft); nooit uit request-headers afleiden — moet byte-voor-byte matchen met de Azure-registratie.
- OAuth-state is HMAC-gesigneerd ÉN sessie-gebonden: start zet one-time nonce in de sessie + state; callback eist ingelogde sessie met dezelfde userId en verbruikt de nonce (anti account-linking-CSRF). Architect-review keurde de puur stateless variant af.
- Systeemmails (`services/email.ts`, client-credentials/toepassingsmachtiging) zijn een volledig gescheiden pad — nooit als fallback voor de werk-inbox gebruiken.

**Why:** review-afwijzing aug 2026 (refresh-regressie + CSRF) en beheerder-consent die exact deze set dekt.
**How to apply:** bij elke wijziging aan werkInboxGraph.ts/werk-inbox-OAuth deze drie invarianten checken: refresh zonder scope, fail-closed scope-opslag, sessie-gebonden callback.

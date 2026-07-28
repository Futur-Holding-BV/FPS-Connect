---
name: Login rate-limit diagnose
description: Waarom "kan niet inloggen met correct wachtwoord" vaak de IP-rate-limiter is, en waarom login_pogingen dan leeg blijft.
---

Regel: bij klachten "correct wachtwoord maar inloggen lukt niet" eerst de IP-rate-limiter verdenken, niet het account.

**Why:** de login-rate-limiter werkt per IP en een heel kantoor deelt één IP. De 429 wordt geweigerd VÓÓR `legLoginPogingVast`, dus de tabel `login_pogingen` blijft leeg — stilte in die tabel is dan geen bewijs dat er geen pogingen waren. Het account zelf toont: actief, niet vergrendeld, 0 mislukte pogingen. RL_MAX is bewust verruimd naar 50/15min; de echte brute-force-rem is de per-account lockout (5) die op zowel wachtwoord- als TOTP-fouten telt, en verplichte TOTP dekt password-spraying af.

**How to apply:** bij zulke meldingen: check `login_pogingen` + accountstatus in dev én prod; beide schoon → rate-limiter. Dev-limiter wissen = api-server herstarten (in-memory Map). Functioneel bewijs: N+2 foute logins met een niet-bestaand e-mailadres (vergrendelt niets) en statuscodes tellen.

Sinds 28 juli 2026 zijn er twee lagen: (1) de ruime per-IP-limiter (50/15min, alleen mislukkingen) en (2) strikte express-rate-limit limiters — 5/15min per IP+account (login/mobile: e-mail uit body; 2FA-routes: uitsluitend `pendingUserId` uit sessie, nooit body — anders sleutelrotatie-bypass) en 3/uur per IP per wachtwoordroute. `DELETE /auth/e2e-rate-reset` (dev-only) wist álle stores; e2e/pre-publish moeten die aanroepen vóór de suite.

Bijvangst autofill: Firefox kent de WebKit-transitietruc niet; standaard `:autofill`-blok (apart blok — onbekende selector in een groep laat de hele regel vervallen) met inset box-shadow in de donkere glaskleur; dat blok matcht ook modern Chrome/Safari.

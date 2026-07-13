---
name: Login rate-limit diagnose
description: Waarom "kan niet inloggen met correct wachtwoord" vaak de IP-rate-limiter is, en waarom login_pogingen dan leeg blijft.
---

Regel: bij klachten "correct wachtwoord maar inloggen lukt niet" eerst de IP-rate-limiter verdenken, niet het account.

**Why:** de login-rate-limiter werkt per IP en een heel kantoor deelt één IP. De 429 wordt geweigerd VÓÓR `legLoginPogingVast`, dus de tabel `login_pogingen` blijft leeg — stilte in die tabel is dan geen bewijs dat er geen pogingen waren. Het account zelf toont: actief, niet vergrendeld, 0 mislukte pogingen. RL_MAX is bewust verruimd naar 50/15min; de echte brute-force-rem is de per-account lockout (5) die op zowel wachtwoord- als TOTP-fouten telt, en verplichte TOTP dekt password-spraying af.

**How to apply:** bij zulke meldingen: check `login_pogingen` + accountstatus in dev én prod; beide schoon → rate-limiter. Dev-limiter wissen = api-server herstarten (in-memory Map). Functioneel bewijs: N+2 foute logins met een niet-bestaand e-mailadres (vergrendelt niets) en statuscodes tellen.

Bijvangst autofill: Firefox kent de WebKit-transitietruc niet; standaard `:autofill`-blok (apart blok — onbekende selector in een groep laat de hele regel vervallen) met inset box-shadow in de donkere glaskleur; dat blok matcht ook modern Chrome/Safari.

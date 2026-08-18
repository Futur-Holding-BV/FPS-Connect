---
name: Externe adviseur (negende onboarding-soort)
description: Externe adviseurs/dienstverleners staan buiten het personeelsbestand; harde toegang_tot-poort per request
---
Externe adviseurs (bv. externe boekhouder/HRM-adviseur) hebben een account met functie en rechten, maar bewust GÉÉN medewerkers-rij (dus geen arbeidsovereenkomst, verlofopbouw of contractbewaking — Wet DBA).

**Regels:**
- Tabel `externe_adviseurs` (uniek per gebruiker): bedrijf, contactpersoon, ingeschakeld_voor, functietitel, `toegang_tot` (date, laatste geldige dag, NL-kalenderdag).
- Wederzijdse exclusiviteit: POST /externe-adviseurs weigert accounts mét medewerkerprofiel (409) en POST /medewerkers + /medewerkers/onboarding weigeren adviseurs (409 IS_EXTERNE_ADVISEUR). Nieuwe medewerker-aanmaakpaden moeten dezelfde check krijgen.
- Toegangspoort zit op 3 plekken: web-login, mobiele login, 2FA-verify — én per request in `blokkeerBijWachtwoordWijzigenVereist` (middlewares/auth.ts, leftJoin op de bestaande query = geen extra DB-ronde). Een lopende sessie/bearer-token verliest dus direct toegang na de einddatum.

**Why:** review-afwijzing: alleen login-checks lieten 12u-sessies/30d-tokens doorlopen na de einddatum; "harde einddatum" vereist per-request afdwinging.
**How to apply:** nieuwe auth-uitgiftepaden (SSO, API-keys) moeten de adviseurspoort meenemen; KADER zegt "geen externe gebruikers" maar René's expliciete besluit (aug 2026) wint — adviseurs werken ín de binnenlaag met einddatum.

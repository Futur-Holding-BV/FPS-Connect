---
name: E2e-testaccount lifecycle
description: Vaste e2e-accounts worden na elke run gearchiveerd; seeders heractiveren idempotent; gedeeld account tussen suites geeft klein concurrency-risico.
---

# E2e-testaccount lifecycle

**Regel:** vaste e2e-accounts (`e2e-menu@`, `e2e-ww-admin@`, `e2e-ww-target@fps.local`) mogen buiten een testrun nooit actief/zichtbaar zijn. De e2e-runners (`e2e-web-run.ts`, `e2e-monteur-run.ts`) archiveren + deactiveren ze in hun `finally`-blok (ook bij falende tests); de spec-`beforeAll` heractiveert ze via de idempotente seeders (die zetten `actief=true, gearchiveerd=false`).

**Why:** gebruiker zag e2e-accounts in Gebruikersbeheer in de preview en eiste opruiming + structurele preventie (9 juli 2026). Gebruikersbeheer-UI verbergt gearchiveerden standaard, dus archiveren = onzichtbaar.

**How to apply:**
- Nieuwe e2e-suites/seeders: altijd een archiveer-functie exporteren en die in de runner-`finally` aanroepen; seeder moet bij heractivatie expliciet `gearchiveerd: false` zetten.
- Elke suite heeft een EIGEN vast account (`e2e-menu@` voor monteur, `e2e-web@` voor web, `e2e-ww-*@` voor wachtwoordtests) en elke runner archiveert uitsluitend zijn eigen accounts. NOOIT accounts delen tussen suites: de middleware checkt `actief` bij elke request, dus de opruiming van de ene suite breekt anders de lopende tests van de andere voor de volledige resterende testduur (gebeurde in de validatiepijplijn, die suites parallel draait).
- Een hard gekilde run (SIGKILL/workflow-herstart mid-run) slaat het `finally`-blok over; accounts blijven dan actief tot de eerstvolgende voltooide run.
- Beide seeders hebben een `weigerBuitenDev()`-guard (weigert bij `REPLIT_DEPLOYMENT` of `NODE_ENV=production`); nieuwe seeders moeten die ook krijgen.
- Handmatige scenario-accounts (zoals `testgebruiker@fps.local`) worden door niets heractiveerd — na gebruik direct archiveren.

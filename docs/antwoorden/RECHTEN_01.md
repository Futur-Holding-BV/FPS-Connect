# Antwoorden en bevindingen — RECHTEN_01

## 8 augustus 2026 · stand op commit `875c2141`

**Vraag (aanvulling René):** Fase 5 — bekrachtiging bij rolwijzigingen (alleen bij verhogen, alleen gevoelige profielen/modules, instelbare lijst, zelf-toekenning geblokkeerd, auditspoor, kwartaaloverzicht). Meenemen of vervolgtaak?

**Antwoord:** **meenemen als Fase 5 binnen RECHTEN_01**, geen vervolgtaak. Redenen: het ene beheerscherm uit Fase 3 is de plek waar de bekrachtiging verschijnt; de expliciete functie→preset-koppeling uit Fase 2 definieert wat een "toekenning" is; en de goedkeuringsmotor (`/goedkeuring/beleidsregels`) bestaat al — Fase 5 is een beleidsregel plus een gate op de toekennings-endpoints, geen nieuw mechanisme.

Inpassing van de zes punten:
- Alleen **verhogen** vereist bekrachtiging; intrekken/verlagen gaat altijd direct door (server-side afgedwongen).
- Gevoelige modules (financieel_vertrouwelijk, salaris_mutaties, salarisarchief, gebruikers, systeem) en profielen (Directie, Administratie, Externe boekhouder) als **instelbare beheerlijst** met deze startwaarden.
- Zelf-toekenning geblokkeerd voor iedereen behalve hoofdbeheerder (sluit aan op bestaande zelf-escalatiecheck).
- Dekking van `maakAuditMiddleware()` op alle toekennings-/intrekkingsroutes wordt gecontroleerd en aangevuld, met bewijs.
- Kwartaaloverzicht met toekenningsdatum én laatst-gebruikt; "laatst gebruikt" vergt registratie van wanneer een bevoegdheid een toegangsbeslissing droeg — meegenomen in het Fase 0-ontwerp zodat inventarisatie en periodiek overzicht dezelfde bron gebruiken.

- **GEMETEN:** goedkeuringsmotor en audit-middleware bestaan; zelf-escalatiecheck bestaat bij multi-functieprofielen.
- **AANGENOMEN:** dat de audit-dekking op rolwijzigingsroutes nu onvolledig is — dat wordt in Fase 5 gemeten, niet aangenomen.

**BESLUIT VAN RENÉ NODIG (open):** volgorde — RECHTEN_01 vóór of ná WVB_01/INKOOP_01? Advies: als aparte, rustige klus ná de tabblad-verbouwing, niet parallel (gevoeligste opdracht in de rij).

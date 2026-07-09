---
name: Bewijs vs. inferentie bij storingsdiagnose
description: Regels om afwezigheid-van-bewijs niet als bewijs te presenteren; positieve kanaalcontrole verplicht vóór conclusies uit "stille" logs/tabellen.
---

Regel: presenteer nooit een inferentie ("het request heeft de server nooit bereikt") als gemeten feit. Stilte in een observatiekanaal telt pas als bewijs nadat een positieve controle heeft aangetoond dat het kanaal een echt signaal registreert, en alleen binnen de gedocumenteerde dekking van dat kanaal.

**Why:** In het login-onderzoek (juli 2026) werd "geen deployment-logs + geen login_pogingen-rij" als feit gerapporteerd ("nooit aangekomen"), terwijl beide kanalen op dat moment ongeverifieerd waren en dekkingsgaten hebben (429 rate-limit en 400-validatie schrijven geen rij; pre-Express-fouten laten nergens een spoor na). De echte oorzaak zat bovendien een laag dieper: de bewerkdialoog stuurde het wachtwoordveld niet mee, dus het account had nooit een hash — het signaal (heeft_wachtwoord=FALSE) lag er al maar kreeg te weinig gewicht.

**How to apply:**
- Injecteer eerst zelf een herkenbaar testsignaal (bijv. testlogin `__agent_...@example.invalid`) en bevestig dat logregel én DB-rij verschijnen; weeg daarna pas stilte.
- Benoem per kanaal welke paden er NIET in belanden voordat je afwezigheid interpreteert.
- Volg de causale keten tot de bron: een gevonden afwijking (account zonder hash) eerst verklaren vóór het onderzoek te vernauwen tot één transportvraag.
- Volledige regels: docs/diagnose-methodologie.md (projectdocument, ook voor de gebruiker zichtbaar).

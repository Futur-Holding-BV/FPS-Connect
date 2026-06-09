---
name: Spot maker vs monteur uitvoering
description: Semantiek en integriteitsregel voor voorziening monteur_id (uitvoering) en maker_monteur_id (aanmaker)
---

Een voorziening (spot) heeft twee monteur-velden met verschillende betekenis:

- `monteurId` ("monteur_id" / "Monteur uitvoering") — de monteur die het werk daadwerkelijk uitvoert. In de nieuwe-spot dialog (plattegrond.tsx) standaard de ingelogde gebruiker als die een monteur is; aanpasbaar wanneer een andere monteur enkel de spot aanmaakt namens iemand anders.
- `makerMonteurId` ("maker_monteur_id" / "Geplaatst door") — de aanmaker.

**Regel:** `maker_monteur_id` wordt server-side afgeleid uit `req.session.userId` in de POST /voorzieningen handler, NIET uit de request body. De client mag de creator-attributie niet kunnen vervalsen.

**Why:** Toewijzing van een gebouw aan een monteur gebeurt al op gebouwniveau (gebouwtoewijzingen/kaart), dus het oude "Monteur toewijzen"-veld op spotniveau was overbodig en werd bovendien nooit verzonden (kapot). Het vervangende "Monteur uitvoering"-veld dekt het scenario maker ≠ uitvoerder. De maker moet betrouwbaar zijn voor audit/attributie, vandaar server-derived.

**How to apply:** Bij nieuwe create-endpoints die een "aanmaker" registreren: leid die altijd af uit de sessie. Bij UI rond spots: "Monteur uitvoering" = monteur_id (selecteerbaar), "Geplaatst door" = maker (read-only, sessie).

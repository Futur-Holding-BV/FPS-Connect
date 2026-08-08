# HRM_01 — Bewaking op alles met een datum

**Opdrachtgever:** René Vink · **Datum:** 8 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Wat er is, en wat eraan mankeert

**Gemeten op 8 augustus 2026: HRM is een van de meest complete modules van Connect** — 25 tabellen, `routes/hrm.ts` ruim 5.000 regels, en de Wet Poortwachter is correct gebouwd met de juiste wettelijke termijnen (`hrm.ts` r.4998): probleemanalyse dag 42 · plan van aanpak dag 56 · UWV-melding dag 294 · eerstejaarsevaluatie dag 364 · arbeidsdeskundig onderzoek dag 609 · WIA-aanvraag dag 637 · einde loondoorbetaling dag 728. In de code staat er zelfs bij dat een gemiste deadline tot 52 weken extra loondoorbetaling kost.

**Maar HRM is rijk aan vastlegging en arm aan bewaking.** De statusberekening `mijlpaalStatus()` kent al de standen `afgerond` · `buiten_termijn` · `nadert` · `open` — **en niemand wordt gewaarschuwd.** Je ziet het alleen als je het scherm opent.

Bij een wet waar vergeten tot een jaar extra loon kost, is passief tonen niet genoeg. Deze opdracht sluit HRM aan op het signaalmechanisme dat bij de facturen al bestaat.

---

## 2. Wat bewaakt moet worden

### 2.1 — Poortwachter-mijlpalen (zwaarste risico)

De zeven mijlpalen bestaan al met hun deadlines. Bouw de waarschuwing:

- **21 en 7 dagen vóór** een deadline een signaal;
- **dagelijks** zolang een mijlpaal `buiten_termijn` staat — dit dooft niet uit tot hij is afgerond;
- bij `einde_loondoorbetaling` (dag 728) een eerdere waarschuwing, want daar hangen besluiten aan die maanden voorbereiding vragen.

### 2.2 — Contractverloop en aanzegtermijn (ontbreekt volledig)

**Gemeten: `medewerker_aanstellingen` bevat werkmaatschappij, werkgever, functie, CAO en of het de hoofdaanstelling is — maar géén einddatum.** Er wordt dus niets bewaakt.

Bij een tijdelijk contract van zes maanden of langer is aanzeggen uiterlijk **één maand** voor het einde wettelijk verplicht; te laat kost een boete ter hoogte van (een deel van) een maandsalaris. Dat is dezelfde vergeetfout als een gemiste Poortwachter-mijlpaal.

Te bouwen:
- **einddatum** en **contractsoort** (bepaalde/onbepaalde tijd) op de aanstelling;
- signaal **6 weken** vóór het einde — genoeg tijd voor een besluit;
- **herhaald signaal bij 5 weken**, met de aanzegdatum expliciet genoemd;
- signaal als de aanzegdatum verstrijkt zonder dat er iets is vastgelegd.

**Ook de proeftijd** hoort hierbij: het einde van een proeftijd is een besluitmoment met een harde datum.

### 2.3 — Certificaten en bekwaamheden

`medewerker_opleidingen.verloopt_op` bestaat al, en het HRM-dashboard telt al "certificaten verlopen binnenkort". Maak er een signaal van: **60 en 14 dagen** vóór het verlopen.

Dit is niet alleen administratie — een monteur met een verlopen certificaat mag bepaald werk niet uitvoeren.

### 2.4 — Verlofverjaring

`verlofPresets.ts` verwijst al naar het juridisch kader: **art. 7:640a BW — wettelijk vakantieverlof vervalt zes maanden na het opbouwjaar** (dus per 1 juli), en **art. 7:642 BW — bovenwettelijk verlof verjaart na vijf jaar**.

Signaal **8 weken vóór** het vervallen, per medewerker, met het aantal dagen dat het betreft. Zonder dat verliezen medewerkers dagen zonder het te weten, of blijft er een verplichting op de balans staan die niemand ziet.

### 2.5 — ZZP-overeenkomsten

De einddatum is daar verplicht (vereiste Belastingdienst). Signaal **4 weken** vóór afloop — een doorlopende ZZP-inzet zonder geldige overeenkomst is een fiscaal risico.

---

## 3. Hoe het gebouwd wordt

**3.1 — Hergebruik het bestaande signaalmechanisme.** Bij de facturen bestaan signalen al, met een levenscyclus. Bouw geen tweede meldingenstroom.

**3.2 — Hergebruik het bestaande periodieke mechanisme.** `lib/avgOpruiming.ts` en `lib/backupService.ts` hebben allebei een `scheduleNext()`-patroon dat periodiek draait. Sluit daarop aan; introduceer geen nieuwe planner.

**3.3 — De signalen landen in het afhandelpaneel** uit `APP_01` §4.1, met dezelfde regels: rolgebaseerd, gerangschikt, en een signaal verdwijnt pas als het is afgehandeld of bewust weggezet — **nooit vanzelf**.

**3.4 — Routering:**
- alle HRM-signalen gaan naar de **HRM-rol**;
- **Poortwachter buiten termijn** en **een aanzegdatum die verstrijkt** gaan **daarnaast** naar René — dat zijn de twee waar geld aan hangt.

---

## 4. Privacy — dit is geen detail

**Een HRM-signaal bevat nooit medische informatie.** Poortwachter is een procesbewaking, geen medisch dossier.

Een signaal luidt: *"Plan van aanpak voor [medewerker] verloopt over 7 dagen."* Nooit waarom iemand afwezig is, nooit een diagnose, nooit een bevinding van de bedrijfsarts — ook niet in een toelichtingsveld.

**Wie het signaal mag zien, wordt bepaald door de bevoegdheid, niet door wie toevallig in het paneel kijkt.** Verifieer dat een gebruiker zonder `personeel`-recht deze signalen nergens ziet, ook niet in een samenvattingsteller.

Connect heeft een AVG-module; toets deze signalen daaraan en meld afwijkingen.

---

## 5. Acceptatie

1. Een Poortwachter-mijlpaal die over 21 dagen verloopt, levert een signaal op.
2. Een mijlpaal die buiten termijn staat, blijft dagelijks signaleren tot hij is afgerond.
3. Ik kan een einddatum en contractsoort op een aanstelling vastleggen.
4. Zes weken voor het einde van een tijdelijk contract krijg ik een signaal met de aanzegdatum erin.
5. Verstrijkt die aanzegdatum zonder vastlegging, dan krijg ik dat te zien — en Jacqueline ook.
6. Een certificaat dat over 60 dagen verloopt, levert een signaal op.
7. Acht weken voordat wettelijk verlof vervalt, zie ik per medewerker om hoeveel dagen het gaat.
8. Geen enkel signaal bevat medische informatie.
9. Een gebruiker zonder personeel-recht ziet deze signalen nergens, ook niet als teller.
10. Een signaal verdwijnt pas als het is afgehandeld.

**Bewijs bij oplevering:** een testdossier met een mijlpaal net binnen en net buiten de termijn, een tijdelijk contract dat over zes weken afloopt, en een certificaat dat over 60 dagen verloopt — met de signalen die daaruit volgen. Plus een inlogtest met een gebruiker zonder personeel-recht die aantoont dat hij niets ziet.

## 6. Wat niet mag

- Geen tweede meldingenstroom naast het bestaande signaalmechanisme.
- Geen nieuwe planner naast het bestaande `scheduleNext()`-patroon.
- Geen medische informatie in een signaal, ook niet in een toelichting.
- Geen signaal dat vanzelf uitdooft.
- Geen automatische actie — er wordt uitsluitend gesignaleerd; besluiten blijven bij mensen.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.

---

## Antwoorden en bevindingen in de repo

Antwoorden op vragen uit deze opdracht komen **niet alleen in de chat** maar worden vastgelegd in de repo:

- **vragen en bevindingen** → `docs/antwoorden/HRM_01.md`
- **metingen en inventarisaties** → `docs/metingen/HRM_01_<onderwerp>.md`

Elk antwoord vermeldt: datum · commit-SHA waarop gemeten is · de vraag · het antwoord · en expliciet wat **gemeten** is en wat **aangenomen**. Is er een besluit van René nodig, schrijf dat als zodanig op — niet zelf invullen en doorbouwen.

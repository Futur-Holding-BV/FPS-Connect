# KLANT_01 — Klantafscherming structureel maken

**Opdrachtgever:** René Vink · **Datum:** 8 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

> Dit raakt wie welke gegevens ziet. Eén fout betekent dat de ene klant de gegevens van de andere inziet. Elke stap hieronder is aantoonbaar of hij gebeurt niet.

---

## 1. Wat er is — gemeten 8 augustus 2026

Er bestaat een klantrol met leestoegang, en gebouwen worden aan klantgebruikers gekoppeld via `gebouw_toewijzingen`. Het permissiemodel kent `isKlant`, en `lib/permissie-service.ts` r. 69 vult per gebruiker een lijst `toegewezenGebouwIds`.

**Het probleem zit in hoe die lijst wordt toegepast.**

`middlewares/auth.ts` r. 193, `requireBevoegdheidOfKlant()`: **elke gebruiker met rol `klant` wordt zonder meer doorgelaten** (r. 206 en r. 225). In de code staat de reden er expliciet bij:

> *"Klant heeft via het klantportaal leestoegang; scope-filtering vindt plaats in de handler (toewijzingsbeperking / toegewezenGebouwIds)."*

**De afscherming is dus per handler geregeld, niet structureel.** Vijf modules gebruiken deze middleware, en ze doen het allemaal anders:

| Module | Verwijzingen naar toewijzing | Wat het feitelijk doet |
|---|---|---|
| `gebouwen.ts` | 19 | filtert stevig op `toegewezenGebouwIds` |
| `inspecties.ts` | 4 | filtert |
| `dashboard.ts` | 3 | filtert |
| `pim.ts` | **0** | beperkt alleen wélke **velden** een klant ziet (`mapPim(m, isKlant)` r. 160-171), niet wélke gegevens |
| `rapporten.ts` | **0** | filtert op status (alleen `definitief`/`gearchiveerd`), niet op eigenaar |

**Tellen bewijst niets over correctheid** — een module met vier verwijzingen kan compleet zijn en een met negentien kan één route missen. Maar het laat wel zien dat er geen gedeelde regel is. En één vergeten handler is genoeg.

---

## 2. Fase 0 — Eerst vaststellen, niet verbouwen

**Lever een tabel op vóórdat er iets wijzigt.** Per route die voor een klant bereikbaar is:

1. het pad en de module;
2. of de query beperkt wordt tot `toegewezenGebouwIds` — **ja, nee, of niet van toepassing**;
3. bij "niet van toepassing": waarom niet (bijvoorbeeld: het gaat om gegevens zonder gebouwrelatie);
4. of er velden worden weggelaten voor een klant, en welke.

**Zoek daarbij niet alleen op `requireBevoegdheidOfKlant`.** Elke route die een klant kan bereiken telt mee — ook via de router-brede `requireAuth`, en ook de tokenroutes van het klantportaal.

**Deze tabel is de belangrijkste oplevering van fase 0.** Zonder dat is niet vast te stellen hoe groot het probleem is, en of het al ergens fout gaat.

---

## 3. Fase 1 — Eén centrale begrenzing

**De afscherming verhuist van de handler naar één plek.**

Bouw een gedeelde begrenzing die voor een klantgebruiker automatisch geldt: elke gegevensvraag die een gebouw raakt, wordt beperkt tot `toegewezenGebouwIds` — zonder dat de handler daaraan hoeft te denken.

**Uitgangspunt: dicht tenzij open.** Kan een route niet aantonen dat hij begrensd is, dan geeft hij voor een klant **niets** terug in plaats van alles. Bij twijfel geen gegevens.

Dit is dezelfde soort ingreep als de centrale foutafhandelaar uit `SCHULD_01` punt 21/36: één plek in plaats van twintig plekken waar iemand eraan moet denken.

**Wat er in fase 1 niet gebeurt:** bestaande handlerfilters weghalen. Die blijven staan als tweede laag. Dubbel gefilterd is niet erg; ongefilterd wel.

---

## 4. Fase 2 — De twee bekende gaten

**4.1 — `pim.ts`.** Een klant kan hier lezen (`lezen = requireBevoegdheidOfKlant("offertes", 1)`, r. 121) en er wordt alleen bepaald welke **velden** hij ziet. Stel vast of een klant hier ook modellen van andere klanten kan opvragen, en begrens.

**4.2 — `rapporten.ts`.** De klantcontrole gaat over de **status** van een rapport (`definitief`/`gearchiveerd`, r. 210), niet over de eigenaar. Stel vast of `GET /gebouwen/:id/rapporten` een klant tegenhoudt bij een gebouw dat niet van hem is.

**Meld de uitkomst als bevinding met de vindplaats.** Blijkt er werkelijk iets uit te lekken, dan is dat een aparte, met spoed te herstellen zaak — niet iets om in deze opdracht stil mee te nemen.

---

## 5. Fase 3 — Vastleggen dat het zo blijft

Een automatische controle die bij elke build faalt wanneer een route die voor een klant bereikbaar is niet door de centrale begrenzing loopt.

Zonder die controle is dit over een half jaar weer stuk, want dan is er een route bijgekomen die niemand aan de lijst heeft toegevoegd. Vergelijkbaar met de controle die is voorgesteld voor routes achter de inlogpoort.

---

## 6. Acceptatie

1. De tabel uit fase 0 ligt er, vóórdat er iets is gewijzigd.
2. Een klantgebruiker die een gebouw opvraagt dat niet aan hem is toegewezen, krijgt niets — via het scherm én via een rechtstreekse aanroep van het adres.
3. Datzelfde geldt voor inspecties, rapporten, pim-modellen en het dashboard van dat gebouw.
4. Een route die niet aantoonbaar begrensd is, geeft voor een klant niets terug.
5. Een medewerker merkt niets van deze wijziging — zijn toegang is ongewijzigd.
6. Er is een automatische controle die faalt zodra een nieuwe klantbereikbare route de begrenzing mist.

**Bewijs bij oplevering:** twee klantaccounts met elk een eigen gebouw. Toon per module — gebouwen, inspecties, rapporten, pim, dashboard — dat klant A niets van klant B ziet, ook niet door het adres van B rechtstreeks aan te roepen. Plus een uitdraai die aantoont dat de toegang van een gewone medewerker vóór en ná identiek is.

## 7. Wat niet mag

- Niet verbouwen vóór de tabel uit fase 0 er ligt.
- Geen bestaande handlerfilters weghalen — die blijven als tweede laag.
- Geen route die bij twijfel álles teruggeeft; bij twijfel niets.
- Geen wijziging in de toegang van medewerkers.
- Geen bevinding over werkelijk uitlekkende gegevens stilzwijgend meenemen — die wordt apart gemeld.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.

---

## Antwoorden en bevindingen in de repo

Antwoorden op vragen uit deze opdracht komen **niet alleen in de chat** maar worden vastgelegd in de repo:

- **vragen en bevindingen** → `docs/antwoorden/KLANT_01.md`
- **de tabel uit fase 0** → `docs/metingen/KLANT_01_klantbereikbare_routes.md`

Elk antwoord vermeldt: datum · commit-SHA waarop gemeten is · de vraag · het antwoord · en expliciet wat **gemeten** is en wat **aangenomen**. Is er een besluit van René nodig, schrijf dat als zodanig op — niet zelf invullen en doorbouwen.

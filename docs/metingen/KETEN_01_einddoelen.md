# KETEN_01 — Fase 0: einddoelen per proces en per variant

**Status: TER GOEDKEURING aan René — er wordt niets gebouwd voordat deze lijst akkoord is.**

Elke regel is een meetbaar einddoel in de gegevens (tabel/veld), nooit "het scherm gaf geen fout". De doorloop gebeurt klikkend in de bestaande Playwright-testomgeving (e2e-web), met eigen testgegevens die na afloop worden opgeruimd of onmiskenbaar als test gemarkeerd zijn. Er wordt niets gerepareerd; wat rood is, komt in het eindrapport.

## Hoofdlijn — einddoel van het geheel

Aan het eind bestaat er één samenhangende keten in de database: aanvraag → gebouw → opname → calculatie → offerte (ondertekend) → opdracht (met akkoordgrond) → werkbegroting + planning → goedgekeurde materiaal-aanvraag mét concept-inkoopbon → geboekte uren → gekoppelde inkoopfactuur met prijscontrole → verkoopfactuur → afgesloten opdracht. Elke schakel verwijst aantoonbaar (FK/veld) naar de vorige.

## Einddoelen per proces

| # | Proces | Einddoel (aantoonbaar in gegevens) |
|---|---|---|
| 1 | Aanvraag binnen | Uit een binnengekomen aanvraag-mail bestaat een verwerkte inbox-rij (niet "blijven hangen"), er is een aanvraag/voorstel-record dat aan de juiste klant én het juiste gebouw hangt, en het documentintelligentie-spoor (classificatie + bewijsketen) is vastgelegd. |
| 2 | Opname | Er bestaat een opname-rij met status `definitief`, gekoppeld aan dat gebouw (`opnames.gebouw_id`), mét werkomschrijving; het opname-nummer komt uit de nummerreeks (NUMMER_01). |
| 3 | Calculatie | Er bestaat een calculatie (ENK-module) met `opname_id` = de opname uit stap 2, met ≥1 regel en een totaalbedrag > 0 dat klopt met de som van de regels. |
| 4 | Offerte | Er bestaat een offerte met `calculatie_id` = stap 3, `portaal_status` doorloopt aantoonbaar `verzonden` → `bekeken` → `ondertekend`, met bijbehorende `offerte_tracking`-events (`bezorgd`, `portaal_bekeken`) en een werkende, geldige portaallink; het bedrag komt uit de calculatie. |
| 5 | Akkoord | Er bestaat een opdracht met `offerte_id` = stap 4 en `akkoord_grond = 'ondertekening'` + `akkoord_op` gevuld (automatisch gezet bij maak-opdracht vanaf ondertekende offerte); condities (betaaltermijn/voorwaarden) zijn overgenomen van de offerte. |
| 6 | Werkvoorbereiding | Er bestaat een werkbegroting gekoppeld aan de opdracht (zonder opslagen, conform opdracht/werkbegroting-flow) en ≥1 planning-item (`planning_items`) op die opdracht met een toegewezen monteur. |
| 7 | Materiaal | De monteur-aanvraag staat op goedgekeurd, er bestaat een concept-inkoopbon met verwijzing naar de aanvraag (`inkoopbon_id`-koppeling), en het bijbehorende werkbak-item is gesloten (herkomstafhandeling in dezelfde transactie). Dit is exact het eerder gevonden lek — hier wordt op het eindresultaat gemeten, niet op de knop. |
| 8 | Uren | Er bestaat een uren-rij op de opdracht met de juiste datum/uren/uurcode, geboekt door de monteur; week-/slotcontroles zijn niet stilzwijgend omzeild. |
| 9 | Inkoopfactuur | Een binnengekomen leveranciersfactuur is gekoppeld aan de concept-bestelling uit stap 7, en de prijscontrole tegen de prijsafspraak (ínkoopprijs) heeft aantoonbaar gedraaid met een vastgelegde uitkomst (gelijk/afwijkend). |
| 10 | Facturatie | Er bestaat een verkoopfactuur richting de klant, gekoppeld aan de opdracht, met een nummer uit de nummerreeks en het juiste bedrag. |
| 11 | Afronding | De opdracht staat op afgesloten; afsluiten van een opdracht met nog openstaande verplichtingen wordt geweigerd óf de openstaande posten zijn aantoonbaar afgehandeld (welke van de twee het systeem doet, is zelf een bevinding). |

## Einddoelen per variant (aftakkingen)

Bij varianten die **niet mogen lukken** is het einddoel de weigering: een leesbare foutmelding (422/403) én géén record dat toch is ontstaan. Lukt het toch, dan is dat een gevonden lek en wordt het zo gerapporteerd.

| Keuzepunt | Variant | Einddoel |
|---|---|---|
| Offerte-afloop | getekend | hoofdlijn (proces 4/5) |
| | afgewezen | `portaal_status='afgewezen'`, reden vastgelegd, notificatie aan de behandelaar bestaat; er ontstaat géén opdracht |
| | ingetrokken | offerte ingetrokken; terugzetten naar concept is hoofdbeheerder-only (zie Terugzetten) |
| | verlopen zonder reactie | na de geldigheidstermijn signaleert de bewaking (werkbak-item `offerte_verlopen` bestaat); de offerte wordt nergens stilzwijgend "actief" behandeld |
| Akkoordgrond | ondertekende offerte (A) | hoofdlijn |
| | opdrachtbevestiging klant (B) | akkoord alleen vastlegbaar mét een niet-gearchiveerd document van documenttype `opdrachtbevestiging` mét bestand; willekeurig document → weigering |
| | vrijgave projectleider (C) | akkoord alleen met verplichte herkomst (mail/telefonisch/mondeling + van wie + wanneer); zonder herkomst → weigering (ook op DB-niveau, CHECK) |
| Bedrag | onder €10.000 | akkoord direct vastgelegd, geen goedkeuringsronde |
| | boven €10.000 | akkoord loopt aantoonbaar langs de goedkeuringsmotor (vier-ogen, goedkeuring-niveau 3); zonder goedkeuring blijft de poort dicht (422) |
| Akkoord zonder offerte | akkoord op alleen calculatie | opdracht zonder offerte = onbekend bedrag = fail-closed bóven de €10k-band; daarna moet er alsnog een offerte met prijsafspraak ontstaan — bestaat die niet, dan signaleert de bewaking (`opdracht_zonder_akkoord`/`calculatie_zonder_offerte`) |
| Materiaal | volgens de opdracht | hoofdlijn (proces 7) |
| | afwijkend van de opdracht | afwijking zichtbaar vastgelegd op de aanvraag; goedkeuring volgt hetzelfde pad en levert óók een concept-inkoopbon met koppeling |
| Bestelweg | rechtstreeks inkopen | hoofdlijn |
| | uit voorraad | **nog niet in gebruik** — verwachte uitkomst: nette weigering of afwezige optie; alles anders is een bevinding |
| Uren | opdracht mét akkoord | hoofdlijn (proces 8) |
| | opdracht zónder akkoord | weigering 422 `AKKOORD_ONTBREEKT` met leesbare uitleg (web én monteur-app; app toont permanente nette melding, geen eindeloze retries); géén uren-rij ontstaan |
| | zonder opdracht | bewust toegestaan (AKKOORD_01 §3.2: alleen meten); de uren-rij bestaat zonder opdrachtkoppeling en telt mee in de meting uren-zonder-opdracht |
| Terugzetten | als gewone gebruiker | weigering (403); status ongewijzigd in de database |
| | als hoofdbeheerder | terugzetten lukt én er is een auditspoor (activiteitenlog-regel met wie/wanneer) |
| Prijscontrole | factuurprijs = afspraak | koppeling zonder signaal; uitkomst "conform" vastgelegd |
| | factuurprijs hoger | afwijking aantoonbaar gesignaleerd (signaal/werkbak-item of geblokkeerde doorgang — wat het systeem doet is de meting); afwijking nooit stilzwijgend geaccepteerd |

## Werkwijze en afspraken (uit de opdracht)

1. Klikken via de bestaande e2e-omgeving; alleen het openen van de app gaat rechtstreeks. Waar een stap principieel niet klikbaar is (bijv. het binnenkomen van een echte mail, of de klant die in het portaal tekent), wordt de binnenkomst gesimuleerd via de bestaande intake-ingang en dat expliciet in het rapport vermeld.
2. Eigen testgegevens (herkenbaar "Bewijs KETEN_01"-prefix), opgeruimd in `finally` — via de database waar governance kritieke verwijderingen blokkeert.
3. Er wordt niets gerepareerd; rood → eindrapport.
4. Einddoelen worden niet versoepeld tijdens het bouwen; niet-haalbaar = bevinding. Bijstellingen worden apart gemeld.
5. Geen tweede testomgeving.
6. Rapportage per regel: **doorlopen / vastgelopen / schijnbaar gelukt**, met schermafdruk vóór/na en de gevonden gegevens bij het einddoel. "Schijnbaar gelukt" is de hoofdcategorie.

## Vooraf gemelde afwijkingen/kanttekeningen (regel 6)

- **GitHub Actions ligt stil** (§9): de doorloop draait daarom handmatig vanuit de ontwikkelomgeving; automatische herhaling volgt pas als het account-/limietprobleem is opgelost. Dit staat los van deze meting.
- **Stap 9 en 10 (inkoopfactuur/facturatie) via mail-intake**: het binnenkomen van de leveranciersfactuur wordt gesimuleerd via de bestaande factuurstroom-ingang (geen echte mailbox in de testomgeving); de herkenning en koppeling zelf worden wél echt doorlopen.
- **Klant-tekenen in het portaal**: gebeurt via de echte portaallink in dezelfde browser (aparte sessie), zodat de tracking-events echt ontstaan.

## Waar de uitkomst landt

Deze lijst + het eindrapport komen in `docs/metingen/` (eindrapport: `KETEN_01_eindrapport.md`). Het eindrapport is de bouwlijst voor de komende weken: alles wat vastloopt of schijnbaar lukt, is werk.

# NOTITIE_01 — Aantekeningen bij een gebouw

**Opdracht voor Replit · 8 augustus 2026 · gemeten op `5479d8b` (`main`)**

Bij een gebouw moet je kwijt kunnen dat er gebeld is, of wat er verder is opgevallen — met datum, tijd en wie het schreef.

---

## 1. Gemeten: dit bestaat niet

Er zijn drie velden die erop lijken maar het niet zijn:

| Vindplaats | Waarom het dit niet is |
|---|---|
| `gebouwen.omschrijving` en `.opmerkingen` | één vrij veld; de volgende persoon overschrijft wat de vorige schreef, geen wie/wanneer |
| `gebouw_partijen.opmerkingen` | hoort bij een contactpersoon, niet bij het gebouw |
| `gebouw_publicaties.notitie` | hoort bij een publicatie |

Het dichtstbijzijnde échte mechanisme is `crm_communicatie` (klantId · type · onderwerp · inhoud · datum · gebruikerId), maar dat hangt aan de **klant**. Een gebouw is er niet aan te koppelen: `gebouwen.klant_id` verwijst naar `gebruikers`, niet naar `crm_klanten`.

**Daarom een eigen tabel — met deze voorwaarde:** meld bij oplevering of `crm_communicatie` alsnog uitgebreid had kunnen worden. Er zijn al dertien documenttabellen en elf meldingentabellen in dit systeem; een veertiende parallel mechanisme moet verantwoord zijn, niet vanzelfsprekend.

---

## 2. Wat gebouwd wordt

### 2.1 Losse regels, geen tekstvak

`gebouw_notities`: gebouwId · tekst · gebruikerId · aangemaaktOp · (optioneel) type.

Elke aantekening is een eigen regel. Nieuwste bovenaan. Bestaande regels worden nooit overschreven door een volgende. Eén tekstvak waar iedereen in schrijft is binnen een maand een rommeltje waar per ongeluk andermans aantekening uit verdwijnt.

### 2.2 Initialen komen van het systeem

De schrijver wordt vastgelegd als `gebruiker_id` — dat is de waarheid. Getoond wordt: **initialen · datum · tijd**, met de volledige naam zichtbaar bij aanwijzen of aantikken.

Nu staat er in `gebruikers` alleen een `naam` als één tekstveld. "Jan van der Berg" wordt dan JvdB of JB, afhankelijk van wie het programmeert. Daarom:

- een veld **`initialen`** op de gebruiker, dat iedereen zelf instelt in zijn profiel
- is het leeg, dan worden de initialen afgeleid uit de naam als tijdelijke terugval — en bij de eerste keer inloggen wordt er één keer om gevraagd
- niemand typt zijn initialen in de notitietekst; wie dat toch doet, krijgt ze dubbel te zien en dat is zichtbaar genoeg om ermee te stoppen

### 2.3 Wat je erbij kunt zetten

Een klein keuzeveld voor het soort aantekening, zodat je later kunt terugzoeken: **telefoon · bezoek · mail · algemeen**. Standaard "algemeen", nooit verplicht — een aantekening die je moet classificeren voordat je hem kwijt kunt, wordt niet geschreven.

Bij "telefoon" mag optioneel de naam van de beller worden ingevuld.

### 2.4 Corrigeren

Een aantekening is een vastlegging van wat er gebeurd is, geen concept.

- de schrijver kan zijn eigen aantekening **binnen 15 minuten** nog aanpassen (typefout)
- daarna niet meer; corrigeren gebeurt met een nieuwe aantekening
- verwijderen kan alleen door `gebouwen` niveau 4, en de regel verdwijnt niet maar wordt doorgehaald weergegeven met wie en wanneer

### 2.5 Zichtbaarheid

**Intern. Altijd.** [stated] René, 08-08-2026: klanten komen nooit in Connect.

Dat is hier geen aanname maar een harde eis: de aantekeningen worden **niet** meegegeven in de portaalroutes (`routes/portaal.ts`) en niet in enige route die via `requireBevoegdheidOfKlant` bereikbaar is. Dit sluit aan op `KLANT_01` ("dicht tenzij open"). Toon bij oplevering dat een gebouwantwoord via de klantweg geen notities bevat.

---

## 3. Waar het staat

Op de gebouwpagina, als eigen blok. Zichtbaar zonder doorklikken — een aantekening die je moet gaan zoeken, schrijf je niet.

Invoeren moet één handeling zijn: typen en versturen. Geen dialoogvenster, geen verplichte velden, geen "weet u het zeker".

Recht: lezen vanaf `gebouwen` niveau 1, schrijven vanaf niveau 1. Wie het gebouw mag zien, mag er een aantekening bij zetten — dit is geen beheerfunctie.

---

## 4. Verboden

- Geen tekstvak dat overschreven wordt.
- Geen verplichte velden bij het schrijven.
- Geen eigen meldingen- of signaleringsstroom. Een aantekening is geen taak.
- Niet ook aan opnames, offertes of voorzieningen hangen "omdat het toch generiek is". Dit gaat over het gebouw. Blijkt de behoefte breder, dan is dat een volgend besluit.

---

## 5. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. Twee verschillende gebruikers zetten een aantekening bij hetzelfde gebouw. Beide staan er, met de juiste initialen, datum en tijd. Toon het scherm.
2. De tweede aantekening heeft de eerste niet overschreven.
3. Een gebruiker zonder ingestelde initialen krijgt de afgeleide variant, en na het instellen de eigen. Toon beide.
4. Aanpassen lukt binnen 15 minuten door de schrijver; daarna niet, en niet door een ander.
5. Een gebouw opgevraagd via de klantweg bevat **geen** notities. Toon het antwoord.
6. Meld of `crm_communicatie` uitgebreid had kunnen worden in plaats van een nieuwe tabel, met de reden.

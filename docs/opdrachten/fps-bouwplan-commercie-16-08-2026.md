# FPS Connect — bouwplan Commercie en Marketing
**16 augustus 2026**

Gemeten op `Futur-Holding-BV/FPS-Connect`, commit `6b15e70`.

Vier opdrachten. Volgorde is een voorstel; wat er in de tijd past bepaalt René.

| # | Opdracht | Wat het oplost |
|---|---|---|
| 1 | `KANS_OFFERTE_01` | Je kunt niet meten hoeveel offertes je wint |
| 2 | `CRM_MAIL_01` | E-mail staat niet bij de relatie |
| 3 | `CRM_OPRUIMEN_01` | Er is een tweede waarheid naast de echte opdrachten |
| 4 | `MARKETING_01` | Marketing bestaat niet |

---

# 1. KANS_OFFERTE_01 — van kans naar offerte, en terug

## Wat er nu is

De projectkans (`crm_commercieel`) heeft een fase, een waarde en een kanspercentage. De negen fasen zijn signaal, eerste contact, afspraak, opname, calculatie, offerte, onderhandeling, gewonnen en verloren.

**Wat ontbreekt:** de kans heeft geen verwijzing naar een offerte. Gewonnen of verloren wordt met de hand ingetypt. Gevolg: er is geen enkel cijfer over hoeveel procent van je offertes je wint, waar in het traject het misgaat, hoe lang een traject duurt, of wat een aanvraag gemiddeld oplevert.

De koppeling bestaat wél één laag hoger: `offertes.klant_id` verwijst al naar `crm_klanten`. Het gat zit precies op het niveau van de kans.

## Wat ik zelf heb besloten

Een kans krijgt **meerdere** offertes, niet één — een traject kent herzieningen en varianten, en die wil je alle zien. De laatste offerte bepaalt de stand.

De fase volgt de offerte automatisch waar dat kan, maar blijft met de hand te overschrijven. Reden: niet elk traject loopt via een offerte, en de mens moet altijd kunnen corrigeren.

## Opdracht

```
KANS_OFFERTE_01

1. VERWIJZING
   Voeg aan offertes een verwijzing naar de projectkans toe
   (crm_commercieel). Eén kans kan meerdere offertes hebben.
   Bij het maken van een offerte vanuit een klant kan de gebruiker
   kiezen bij welke lopende kans hij hoort, of "geen".

2. FASE VOLGT DE OFFERTE
   Wordt een offerte verzonden, dan gaat de kans naar fase "offerte".
   Wordt hij ondertekend of anderszins akkoord (akkoordgrond), dan
   gaat de kans naar "gewonnen". Wordt hij afgewezen, dan "verloren"
   met een reden.
   De gebruiker kan de fase altijd handmatig overschrijven; leg vast
   dat het handmatig ging, zodat de cijfers eerlijk blijven.

3. REDEN VAN VERLIES
   Bij "verloren" een verplichte keuze: prijs · levertijd · aan
   concurrent · geen budget · afgeblazen · geen reactie · anders.
   Bij "aan concurrent" een verwijzing naar de concurrent die er al is.

4. CONVERSIECIJFERS
   Bouw een overzicht op het CRM-dashboard met:
   - winkans: gewonnen tegenover totaal afgesloten, over een periode
   - waar het misgaat: hoeveel kansen sneuvelen per fase
   - doorlooptijd: gemiddeld aantal dagen van signaal tot afsluiting,
     en per fase
   - verwachte omzet: som van waarde maal kanspercentage van alle
     open kansen, en dezelfde som voor het lopende kwartaal
   - verliesredenen, geteld
   Alles per verantwoordelijke te filteren.

5. NIETS VERZINNEN
   Waar een kans geen offerte heeft, tellen de cijfers hem apart mee
   als "handmatig afgesloten" in plaats van hem stilzwijgend mee te
   rekenen. Een nulmeting is een antwoord.
```

---

# 2. CRM_MAIL_01 — e-mail bij de relatie

## Wat er nu is

De werk-inbox is volwassen: mailboxen, tokens, toegangsrechten, AI-voorstellen, toewijzing. Er bestaat al een koppeltabel `werk_inbox_koppelingen` met een soort en een id, en `klant` is al een van de gebruikte soorten.

**Wat ontbreekt:** het CRM leest daar niets uit. `crm_communicatie` wordt met de hand gevuld — type, onderwerp, inhoud, datum. Er is geen bericht-id en geen verband met de inbox. Wie de tijdlijn van een relatie opent, ziet dus alleen wat iemand zelf heeft overgetypt.

## Wat ik zelf heb besloten

Geen tweede kopie van de mail in het CRM. De tijdlijn leest uit de bestaande koppeling; de mail blijft waar hij staat. Reden: een kopie loopt uit de pas en verdubbelt de bewaartermijn-vraag.

Automatisch koppelen op afzenderadres, maar alleen als voorstel dat de mens bevestigt — passend bij de projectregel dat de AI voorstelt en de mens beslist.

## Opdracht

```
CRM_MAIL_01

1. TIJDLIJN SAMENVOEGEN
   De communicatietijdlijn van een CRM-relatie toont voortaan drie
   bronnen door elkaar, op datum:
   - handmatige notities (crm_communicatie, blijft bestaan)
   - mails uit de werk-inbox die aan deze klant gekoppeld zijn
   - verzonden offertes en hun status uit het offerte-mailboek
   Geen kopie van de mail in het CRM; lees uit de bestaande koppeling.

2. AUTOMATISCH VOORSTELLEN
   Komt er een mail binnen waarvan het afzenderadres overeenkomt met
   een contactpersoon of het domein van een organisatie, stel dan de
   koppeling voor. De behandelaar bevestigt met één klik.
   Nooit vanzelf koppelen.

3. VANUIT HET CRM MAILEN
   Vanaf de relatiepagina een mail kunnen sturen die via de bestaande
   mailwachtrij gaat en meteen als gekoppelde communicatie verschijnt.
   Geen tweede verzendweg bouwen.

4. STILTE ZICHTBAAR MAKEN
   Toon per relatie hoe lang het laatste contact geleden is, en maak
   dat sorteerbaar in het organisatieoverzicht. Dat is de goedkoopste
   vorm van opvolging: je ziet wie je vergeet.
```

---

# 3. CRM_OPRUIMEN_01 — één waarheid

## Wat er nu is

`crm_opdrachten` is een eigen tabel met titel, status, waarde, start- en einddatum — met de hand ingetypt en zonder enige verwijzing naar de echte opdrachten of offertes van Connect. Een opdracht in het CRM is dus iets anders dan een opdracht in de rest van het systeem.

## Wat ik zelf heb besloten

Niet weggooien maar leiden: de bestaande rijen blijven staan en worden gemarkeerd, en nieuwe worden niet meer met de hand gemaakt. Reden: verwijderen kost gegevens die niemand meer kan terughalen, en de rijen zijn ooit ergens voor ingevuld.

## Opdracht

```
CRM_OPRUIMEN_01

1. TEL EERST
   Hoeveel rijen staan er in crm_opdrachten, van wanneer, en hangen
   ze aan een klant die ook echte opdrachten heeft? Nul is een antwoord.

2. DE RELATIEPAGINA TOONT DE ECHTE OPDRACHTEN
   Op de CRM-relatiepagina komen de werkelijke opdrachten en offertes
   van die klant te staan, uit de operationele tabellen, met hun echte
   status en bedrag.

3. DE OUDE TABEL GAAT DICHT
   Nieuwe rijen aanmaken kan niet meer. Bestaande rijen blijven zichtbaar
   onder een eigen kopje "handmatig vastgelegd, vóór de koppeling", zodat
   niemand ze verwart met de echte.

4. GEEN NIEUWE TWEEDE WAARHEID
   Als een gebruiker vanaf de relatiepagina iets wil vastleggen dat nog
   geen offerte is, dan is dat een projectkans — niet een opdracht.
```

---

# 4. MARKETING_01 — vanaf nul

## Wat er nu is

Niets. Het hoofdstuk Commercie bevat één item: CRM. In de hele codebase komt "campagne" één keer voor, "nieuwsbrief" één keer. Geen mailinglijsten, geen doelgroepen, geen webformulier, geen landingspagina's.

Ter vergelijking: bij HubSpot, PerfectView en ActiveCampaign is dit de kern van het pakket — e-mailmarketing, campagnes, webformulieren, segmentatie en opvolgautomatisering zitten in dezelfde omgeving als het CRM.

## Wat ik zelf heb besloten

Bouwen op de bestaande mailwachtrij en het bestaande mailbeheer, geen tweede verzendweg. En beginnen bij het onderdeel dat voor FPS het meest oplevert: onderhoudsklanten en oud-klanten opnieuw benaderen. Reden: dat is een bestaande lijst met een bekend adres en een reden om te schrijven — dat werkt beter dan koude werving.

## Opdracht

```
MARKETING_01

1. DOELGROEPEN
   Een doelgroep is een opgeslagen selectie op de CRM-gegevens:
   soort organisatie, laatste contact, laatste opdracht, gebouwtype,
   lopend onderhoudscontract, regio. De selectie is levend — hij
   herberekent, hij bevriest niet.

2. CAMPAGNES
   Een campagne is een doelgroep plus een bericht plus een moment.
   Opstellen, testen naar jezelf, plannen, versturen via de bestaande
   mailwachtrij. Per ontvanger vastleggen: verzonden, geopend,
   geklikt, gebounced, afgemeld.

3. AFMELDEN EN AVG
   Verplichte afmeldlink in elke campagnemail. Een afmelding geldt
   organisatiebreed en blokkeert alle volgende campagnes naar dat
   adres, ook als hij in een andere doelgroep valt. Systeemmails
   (offertes, facturen, meldingen) vallen daar buiten en blijven gaan.
   Leg per adres vast waarom je hem mag mailen: bestaande klant,
   zelf aangemeld via het formulier, of handmatig toegevoegd met
   naam van wie het deed.

4. WEBFORMULIER
   Een formulier dat op de eigen site geplaatst kan worden en dat een
   binnenkomende aanvraag rechtstreeks als CRM-aanvraag aanmaakt, langs
   dezelfde weg als de aanvragen die nu uit de mail komen.
   Met beveiliging tegen automatische inzendingen.

5. OPVOLGING
   Een campagne kan een taak aanmaken voor wie klikt maar niet reageert.
   De taak komt in de bestaande CRM-taken terecht, niet in een eigen lijst.

6. WAT HET OPLEVERT
   Per campagne: bereik, opening, klikken, en — dit is het punt —
   hoeveel projectkansen en hoeveel gewonnen opdrachten eruit
   voortkwamen. Dat kan alleen als KANS_OFFERTE_01 er al is; leg de
   verwijzing van kans naar campagne meteen aan.
```

---

## Volgorde en verband

`CRM_OPRUIMEN_01` is klein en zorgt dat de rest niet op een verkeerde tabel wordt gebouwd — die zou ik eerst doen.

`KANS_OFFERTE_01` levert de meeste waarde en is de voorwaarde voor het enige marketingcijfer dat er echt toe doet: wat een campagne oplevert aan opdrachten.

`CRM_MAIL_01` staat los van de andere drie en kan parallel.

`MARKETING_01` is verreweg het grootst en leunt op de eerste.

## Wat bewust niet in dit plan staat

- **Lead scoring en verkoopvoorspelling met AI.** Betaalde pakketten hebben dit, maar het vraagt jaren gegevens over gewonnen en verloren trajecten. Die heb je pas na `KANS_OFFERTE_01`, en dan nog een seizoen wachten. Eerder bouwen levert een gokmachine.
- **Landingspagina's.** Hoort bij de marketingsite, niet bij Connect.
- **Telefonie-integratie.** Geen aanwijzing dat FPS daar behoefte aan heeft.

# UI-standaard: Klikbare List Cards (vervangt klassieke tabellen)

## Doel

De huidige lijstweergaven binnen FPS Connect voelen aan als traditionele tabellen. Gebruikers moeten vaak precies op een naam of klein stukje tekst klikken om een item te openen. Dat past niet bij de professionele uitstraling die we met Connect willen neerzetten.

We stappen daarom volledig af van de klassieke tabelinteractie.

Voortaan bestaat iedere lijst uit afzonderlijke interactieve kaarten ("List Cards"), waarbij de volledige kaart als één grote knop functioneert.

Dit wordt een vaste ontwerpstandaard voor de gehele applicatie.

---

## Nieuwe interactiestandaard

Elke regel wordt één grote klikbare kaart.

Dus:

- klik op de naam
- klik op de klant
- klik op de status
- klik op het bedrag
- klik op de datum
- klik op de lege ruimte

→ allemaal exact dezelfde actie:

**Open de detailpagina van dit item.**

De gebruiker hoeft nooit meer na te denken waar hij precies moet klikken.

---

## Uitzonderingen

Alleen elementen met een eigen functie blijven zelfstandig klikbaar.

Bijvoorbeeld:

- ⋮ Actiemenu
- Bewerken
- Verwijderen
- Dupliceren
- Downloaden
- Checkbox selecteren
- Favoriet
- Quick Actions

Klikken op deze elementen mag de kaart niet openen.

Gebruik hiervoor correcte event propagation (`stopPropagation()`).

---

## Nieuwe vormgeving

Niet langer één groot wit vlak met dunne horizontale scheidingslijnen.

Iedere regel wordt een losse kaart met voldoende witruimte.

Eigenschappen:

- afgeronde hoeken
- subtiele schaduw
- lichte rand
- 10–16 px ruimte tussen kaarten
- rustige premium uitstraling
- goede leesbaarheid

De pagina moet veel meer aanvoelen als een moderne SaaS-applicatie dan als een spreadsheet.

---

## Hover

Wanneer de gebruiker met de muis boven een kaart komt:

- cursor verandert naar pointer
- achtergrond wordt subtiel lichter
- zachte schaduw
- kaart beweegt eventueel 2 px omhoog
- vloeiende animatie (150–200 ms)

De gebruiker moet onmiddellijk herkennen:

"Deze volledige kaart is klikbaar."

---

## Actieve kaart

Wanneer een kaart geselecteerd of geopend is:

- duidelijke accentkleur rondom
- lichte achtergrondkleur
- zichtbare focus state
- niet alleen een blauw woordje of link

---

## Keyboard toegankelijkheid

Ondersteun volledige toetsenbordbediening.

- TAB
- SHIFT + TAB
- ENTER opent de kaart
- SPACE selecteert indien van toepassing

Volledig toegankelijk volgens moderne webstandaarden.

---

## Mobiele weergave

Exact dezelfde werking.

De volledige kaart is aantikbaar.

Geen kleine klikvlakken.

Geen tekstlinks.

De gebruiker hoeft alleen de gewenste kaart aan te raken.

---

## Componentisering

Maak hiervoor één centrale herbruikbare component.

Bijvoorbeeld:

<ListCard>

of

<ClickableRow>

Deze component bevat standaard:

- spacing
- hover-effect
- schaduw
- animatie
- klikgedrag
- keyboard support
- responsive gedrag
- loading state
- geselecteerde state

Alle lijstweergaven binnen Connect gebruiken uitsluitend deze component.

---

## Uniform Design System

Pas deze standaard toe op alle huidige én toekomstige modules.

Onder andere:

- Dashboard-overzichten
- Gebouwen
- Projecten
- Calculaties
- Offertes
- Opdrachten
- Werkbegrotingen
- Planning
- Facturen
- Klanten
- Contactpersonen
- Leveranciers
- CRM
- Medewerkers
- HRM
- Gereedschappen
- Documenten
- Wagenpark
- Onderhoud
- AI Inbox
- AI Werkvoorraad
- Meldingen
- Taken
- Rapportages
- Alle toekomstige modules

Er mogen geen verschillende lijststijlen meer bestaan.

---

## Centrale UI-richtlijn

Iedere lijst binnen FPS Connect moet dezelfde gebruikerservaring bieden.

Een gebruiker mag nooit hoeven nadenken:

"Waar moet ik klikken?"

De volledige kaart is altijd klikbaar.

Overal hetzelfde gedrag.

Overal dezelfde uitstraling.

Overal dezelfde animaties.

Overal dezelfde logica.

---

## Toekomstbestendigheid

Deze List Card wordt een fundamenteel onderdeel van het FPS Connect Design System.

Nieuwe modules mogen geen eigen lijstcomponent meer bouwen.

Iedere lijst gebruikt dezelfde centrale component.

Hierdoor:

- blijft de applicatie visueel consistent;
- worden toekomstige UI-wijzigingen op één centrale plek uitgevoerd;
- neemt de onderhoudbaarheid toe;
- voelt FPS Connect aan als één professioneel product in plaats van losse modules.

Dit is vanaf nu de standaard voor alle lijstweergaven binnen FPS Connect.
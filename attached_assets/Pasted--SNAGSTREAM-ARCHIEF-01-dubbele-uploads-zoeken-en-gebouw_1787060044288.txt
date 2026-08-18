# SNAGSTREAM_ARCHIEF_01 — dubbele uploads, zoeken en gebouwenlijst

## Aanleiding

Er gaan Snagstream-rapporten geüpload worden. Het archief bestaat al en werkt:
uploaden, AI-uitlezen, snags per rapport, koppelen aan een gebouw en overnemen
als spot. Drie dingen ontbreken en die maken het archief bij groei onbruikbaar.

Uitgangspunt van René: **elk rapport is eenmalig.** Er komen geen bijgewerkte
versies van hetzelfde rapport.

---

## 1. Dubbele uploads voorkomen

- Bereken bij het uploaden een vingerafdruk van de bestandsinhoud.
- Ligt datzelfde bestand er al, dan wordt het **niet** opnieuw opgeslagen: het
  scherm opent het bestaande rapport en toont wanneer het is geüpload en door
  wie.
- Dezelfde bestandsnaam met andere inhoud wordt niet stil geaccepteerd en niet
  stil overschreven: toon beide en laat René kiezen of dit een ander rapport is
  of een vergissing.
- Bestaande rapporten in het archief krijgen alsnog een vingerafdruk. Blijken er
  dubbelen tussen te zitten, dan komen die als lijst in het archiefscherm te
  staan zodat ze opgeruimd kunnen worden — niet alleen in een logregel.

## 2. Zoeken in het archief

- Eén zoekveld dat zoekt in bestandsnaam, opdrachtgever, projectnaam en
  gebouwnaam.
- **Ook zoeken in de snags zelf**: snagnummer, ruimte, verdieping en
  omschrijving. Zo is een oude snag terug te vinden zonder te weten in welk
  rapport hij stond.
- Bij een treffer in een snag toont het resultaat in welk rapport en op welke
  pagina hij staat, met een directe doorklik.
- Filters ernaast: gebouw, jaar en status.

## 3. Lijst van gebouwen in het archief

- Een overzicht van de gebouwen die in het archief voorkomen, met per gebouw het
  aantal rapporten, de datum van het meest recente rapport en het aantal snags.
- Doorklikken opent de rapporten van dat gebouw.
- Rapporten zonder gebouwkoppeling staan bovenaan als "nog niet gekoppeld" — dat
  is werk dat blijft liggen — en zijn vanaf daar direct te koppelen.

---

## Vaste eisen

- Toets elke aanname over module, route en bevoegdheid tegen de code en meld
  afwijkingen — pas niets stilzwijgend aan.
- Wijk je af van de scope, meld dat vóór je bouwt.
- Antwoord naar `docs/antwoorden/SNAGSTREAM_ARCHIEF_01.md`, metingen naar
  `docs/metingen/`.
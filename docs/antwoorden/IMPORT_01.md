# IMPORT_01 — Importmodule: rechten per type, controle vooraf, terugdraaibaar, herkomst zichtbaar

Datum: 2026-08-08

## 1. Wat is gebouwd

### Rechten afgeleid uit modulerechten (geen aparte rechtenlijst)
Importrecht per type = **beheerrecht (niveau 4)** op de module waar de gegevens thuishoren:

| Importtype | Vereiste module (niveau 4) |
|---|---|
| leveranciers, klanten, contactpersonen | crm |
| artikelen, magazijn_artikelen | magazijn |
| medewerkers | personeel |
| gebouwen, historische_projecten | gebouwen |
| eenheidsprijzen | calculaties |
| historische_facturen | financieel |

- Server dwingt dit af op **elke** import-route (voorbeeld, controleren, uitvoeren, template, bestand-download, terugdraaien). Hoofdbeheerder mag alles; klant nooit.
- Het logboek vereist leesrecht (niveau 1) op minstens één van de zes modules.
- Het scherm toont **alleen toegestane types**; zonder enig importrecht is de pagina onbereikbaar (ook via directe URL: "Geen toegang"). Verwijzingen elders (Instellingen-kaart, knop bij eenheidsprijzen, link bij lege leverancierslijst) verschijnen alleen bij het bijbehorende recht.

### Controle-stap vóór uitvoeren
- Nieuwe verplichte stap: **controleren** telt per rij nieuw / dubbel / onbruikbaar (met reden) vóórdat er iets wordt weggeschreven. Uitvoeren zonder voorafgaande controle op hetzelfde bestand + dezelfde kolomkoppeling wordt geweigerd (400).
- Bij dubbelen is één keuze verplicht: **overslaan** of **als nieuw toevoegen**. Zonder keuze weigert uitvoeren (422). **Overschrijven bestaat bewust niet.**

### Terugdraaibaar
- Elke geïmporteerde rij krijgt `bron='import'` + `import_id` (koppeling aan de logregel).
- Het originele bestand wordt bewaard in de opslag en is uit het logboek te downloaden.
- Eén knop draait de hele import terug. Rijen die **na de import gewijzigd** zijn of **in gebruik** zijn (verwijzingen vanuit andere gegevens) blijven staan en worden precies zo gemeld, met aantallen. De log wordt gemarkeerd (volledig of deels teruggedraaid); nogmaals terugdraaien geeft 409.

### Herkomst zichtbaar
- Entiteitsschermen (leverancier, artikel, CRM-klant, contactpersoon, medewerker, gebouw, eenheidsprijs, factuur) tonen een neutrale badge **"Geïmporteerd #<importnummer>"** bij records met bron import.

## 2. Herkenningssleutels per type (dubbel-detectie)

| Type | Sleutel (in volgorde) | Kanttekening |
|---|---|---|
| leveranciers, klanten | KvK-nummer → naam + stad | naam+stad is gevoelig voor spellingsvarianten |
| contactpersonen | e-mailadres → naam | **zwak**: alleen naam matcht ook naamgenoten; lever waar mogelijk e-mail aan |
| artikelen, magazijn_artikelen | artikelcode → naam | |
| medewerkers | e-mailadres → naam + geboortedatum | |
| gebouwen, historische_projecten | werknummer → projectnummer → naam + adres | |
| eenheidsprijzen | code | |
| historische_facturen | type + factuurnummer | **zonder factuurnummer is er géén sleutel** — zulke rijen worden altijd als nieuw gezien; lever factuurnummers aan |

Vergelijking is ongevoelig voor hoofdletters en spaties aan de randen.

## 3. Bewijs (gemeten, echte HTTP-flows — `scripts/src/verificatie-import01.ts`)

- Gebruiker **zonder rechten**: voorbeeld, template én logboek → 403; pagina in de app onbereikbaar.
- Gebruiker met **alleen magazijn (4)**: artikelen-template 200; leveranciers-template 403; medewerkers-voorbeeld 403.
- Uitvoeren zonder controle → 400.
- **Zelfde lijst twee keer**: tweede controle herkent alle 3 rijen als dubbel; zonder keuze → 422; met "overslaan" → 0 verwerkt, 3 overgeslagen, **geen dubbelen ontstaan**.
- Records droegen `bron='import'` + het juiste importnummer.
- **Terugdraaien**: exact 3 records verwijderd, log gemarkeerd, tweede keer 409; zonder rechten 403.

## 4. Prod-meting (8 aug 2026, rechtstreeks op de productiedatabase)

- **0** import-logs; **0** records met `bron='import'` in alle tabellen — er is op productie nog nooit via de module geïmporteerd, dus ook **0 dubbelen** uit imports.
- Ter referentie huidige aantallen: medewerkers 5, gebouwen 2; leveranciers/artikelen/klanten/contactpersonen/eenheidsprijzen/facturen: 0.
- Conclusie: geen opschoning nodig; de nieuwe regels gelden vanaf de eerste echte import.

## 5. Beslispunten / aandachtspunten voor René

1. **Contactpersonen zonder e-mail** worden alleen op naam ontdubbeld — naamgenoten worden dan ten onrechte als dubbel gezien (of andersom bij spellingsverschil). Advies: e-mailadres altijd meeleveren in de lijst.
2. **Historische facturen zonder factuurnummer** kunnen niet ontdubbeld worden en komen bij herhaald importeren dubbel binnen (tenzij je "overslaan" op de rest gebruikt en die rijen buiten de lijst laat). Advies: factuurnummers aanleveren.
3. Bestaande records die ooit buiten de module om zijn ingevoerd hebben geen import-herkomst; de badge verschijnt alleen bij imports via de module.

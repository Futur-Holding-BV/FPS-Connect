Bouw centrale medewerker-synchronisatie in Connect.

Probleem:
Medewerkers worden nu niet automatisch zichtbaar in operationele modules. In Medewerkers Planning staat “0 actieve medewerkers”, terwijl medewerkers na onboarding/HRM-aanmaak automatisch beschikbaar moeten zijn.

Doel:
HRM/Personeel wordt de enige bron voor medewerkers. Alle andere modules lezen daaruit.

Opdracht:
1. Maak één centrale medewerker-entiteit.
2. Gebruik HRM/Personeel als bronadministratie.
3. Zorg dat een uitvoerende medewerker na onboarding automatisch zichtbaar wordt in:
   - Medewerkers Planning
   - Urenregistratie
   - Verlof
   - Gereedschap-uitgifte
   - Opleidingen & certificaten
   - Projectplanning
   - Chat/berichten
4. Bepaal beschikbaarheid automatisch op basis van:
   - actief/in dienst
   - functie/rol
   - contracturen per week
   - werkmaatschappij
   - verlof
   - ziekte
   - uitdienstdatum
5. Planning mag geen losse medewerkerregistratie meer hebben.
6. Planning toont alleen medewerkers die actief en uitvoerend zijn, zoals:
   - monteur
   - timmerman
   - controleur
   - uitvoerder
7. Kantoormedewerkers mogen alleen zichtbaar zijn als hun rol relevant is voor planning.
8. Bij uitdiensttreding verdwijnt medewerker automatisch uit actieve planning, maar historische uren/projecten blijven behouden.
9. Bij rolwijziging worden moduletoegang en zichtbaarheid automatisch aangepast.
10. Voorkom dubbele medewerkers.

Specifiek voor scherm “Medewerkers planning”:
- Vervang lege melding door slimme opvolging.
- Als er echt geen medewerkers zijn:
  knop “Medewerker toevoegen in HRM”
- Als er wel medewerkers in HRM staan maar niet zichtbaar zijn:
  toon oorzaak:
  - geen uitvoerende rol
  - geen contracturen
  - niet actief
  - uit dienst
  - ontbrekende planningstoegang
- Voeg knop toe:
  “Medewerkers synchroniseren”
- Na synchronisatie direct overzicht verversen.

Acceptatiecriteria:
- Nieuwe monteur in HRM verschijnt automatisch in Medewerkers Planning.
- Nieuwe timmerman verschijnt automatisch in Medewerkers Planning.
- Administratief medewerker verschijnt niet standaard in uitvoerende planning.
- Contracturen worden zichtbaar als weekcapaciteit.
- Verlof verlaagt beschikbare capaciteit.
- Ziekmelding verlaagt beschikbare capaciteit.
- Uitdienst verwijdert medewerker uit actieve planning.
- Historische projecturen blijven bewaard.
- Geen enkele operationele module maakt eigen dubbele medewerkerrecords aan.
- Lege staten zijn actiegericht en verwijzen naar de juiste plek.
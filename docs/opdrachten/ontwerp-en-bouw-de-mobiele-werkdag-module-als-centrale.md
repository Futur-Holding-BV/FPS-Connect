Ontwerp en bouw de mobiele Werkdag-module als centrale werkplek voor uitvoerend personeel.

Doel:
Een monteur/timmerman/zzp’er/uitzendkracht moet op zijn telefoon niet de volledige planning hoeven openen, maar direct zijn eigen werkdag zien.

Architectuurregel:
Planning is voor plannen.
Werkdag is voor uitvoeren.

De Werkdag-module wordt de mobiele ingang voor:
- dagplanning
- werkorders
- navigatie
- uitvoering
- foto’s
- opmerkingen
- tijdregistratie
- oplevering
- later materialen, gereedschap en handtekening

Scope fase 1:
1. Maak een mobiele pagina “Mijn werkdag”.
2. Toon alleen de ingelogde uitvoerende medewerker.
3. Toon de werkorders/planning_blocks van vandaag.
4. Sorteer op starttijd.
5. Per item tonen:
   - starttijd/eindtijd
   - projectnaam
   - werkordernummer
   - locatie/woning/bouwnummer
   - werkzaamheden
   - status
   - geplande uren
   - opmerkingen
6. Elk item is klikbaar en opent de werkorderdetailpagina.
7. Op de werkorderdetailpagina tonen:
   - project
   - locatie
   - werkzaamheden
   - hoofdopdracht/meerwerk
   - geplande tijd
   - gekoppelde medewerker(s)
   - uitvoeringsstatus
   - opmerkingen
   - foto’s placeholder
   - tijdregistratie placeholder
   - oplevering placeholder
8. Voeg statusknoppen toe:
   - Start werk
   - Pauze
   - Hervat
   - Gereed melden
9. Statuswijzigingen moeten op de work_order worden opgeslagen.
10. Bouw nog geen volledige urenregistratie.
11. Bouw nog geen materiaalmodule.
12. Bouw nog geen volledige opleverrapportage.
13. Gebruik echte databasegegevens.
14. Geen mock-data in live routes.
15. Als er geen werk voor vandaag is: toon een lege staat “Geen werkorders voor vandaag”.
16. Geen adminfuncties tonen.
17. Alleen uitvoerend personeel tonen/gebruiken.

Belangrijke datakoppeling:
Mijn werkdag haalt data uit:
work_orders
→ planning_blocks
→ medewerkers

Niet rechtstreeks uit bewoners.
Niet uit losse planningtekst.

Mobiele/PWA-eis:
- Pagina moet goed bruikbaar zijn op telefoon.
- Mag desktop blijven ondersteunen.
- Voeg route toe die geschikt is als PWA-startpagina voor uitvoerend personeel.

Beveiliging:
- Alleen ingelogde gebruiker ziet eigen werkdag.
- Leidinggevende/admin mag later kunnen meekijken, maar bouw dat nu niet.
- Geen publieke toegang tot werkdagroutes.

Rapporteer na afloop:
- route van Mijn werkdag
- gebruikte tabellen
- gebruikte API-endpoints
- hoe work_orders aan de ingelogde medewerker worden gekoppeld
- welke statuswijzigingen werken
- welke placeholders nog bestaan
- wat nog nodig is voor echte urenregistratie
- wat nog nodig is voor foto’s en oplevering
P2 – Navigatie en werkmodus verbeteren



Probleem:

De huidige hoofdbeheerder-navigatie toont vrijwel alle modules tegelijk. Dat is geschikt voor systeembeheer, maar ongeschikt als dagelijkse werkmodus voor directeur, bedrijfsleider, projectleider, kantoor of monteur.



Doel:

Ontwerp een navigatiemodel met werkmodi/gebruikersrollen, zodat iedere gebruiker alleen de relevante dagelijkse onderdelen ziet. Hoofdbeheerder blijft beschikbaar als volledige beheerweergave.



Werkmodi:

1. Hoofdbeheerder

   - volledige navigatie

   - systeembeheer, rechten, governance, release, audit, technische functies



2. Directeur / Bedrijfsleider

   - dashboard

   - projecten

   - planning

   - rapportages

   - CRM

   - personeel

   - financieel

   - meldingen

   - bedrijfsresultaten

   - systeemstatus beperkt



3. Projectleider

   - projecten

   - gebouwen

   - opnames

   - calculaties

   - offertes

   - werkvoorbereiding

   - planning

   - opleverrapportage

   - onderhoud

   - dossiers/documenten



4. Kantoor / Administratie

   - CRM

   - gebruikers

   - personeel

   - urenregistratie

   - verlof

   - documenten

   - rapportages

   - communicatie

   - abonnementen



5. Monteur

   - mijn planning

   - mijn projecten

   - opnames

   - uitvoering

   - foto’s

   - oplevering

   - gereedschap

   - meldingen



Vereisten:

- Maak eerst alleen een ontwerp/implementatieplan.

- Geen code- of databasewijzigingen zonder goedkeuring.

- Onderzoek of dit kan met bestaande rollen/rechten of dat er een aparte “werkmodus” nodig is.

- Alle hoofdgroepen moeten consistent inklapbaar zijn.

- Voeg bij voorkeur een zoekfunctie toe om modules snel te vinden.

- Voeg eventueel “Favorieten” toe voor veelgebruikte onderdelen.

- Hoofdbeheerder moet kunnen schakelen naar een dagelijkse werkmodus zonder rechten te verliezen.

- Autorisatie en zichtbaarheid moeten gescheiden blijven: rechten bepalen wat iemand mág, werkmodus bepaalt wat iemand normaal ziet.



Rapporteer:

1. voorgesteld navigatiemodel

2. benodigde datamodelwijzigingen ja/nee

3. benodigde UI-wijzigingen

4. migratie/compatibiliteit met bestaande gebruikers

5. risico’s

6. advies voor gefaseerde implementatie
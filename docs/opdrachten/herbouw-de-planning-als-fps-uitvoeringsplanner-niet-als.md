Herbouw de planning als FPS-uitvoeringsplanner, niet als aanwezigheidsplanner.

Doel:
De planning moet dagelijks laten zien welke medewerker op welk project werkt, welke werkzaamheden worden uitgevoerd, op welke woningen/onderdelen, en hoeveel arbeid daarmee gepland wordt. De planning is tegelijk de basis voor urenregistratie, weekstaten en nacalculatie.

Gebruik de aangeleverde Excel-planning als functioneel uitgangspunt.

Belangrijke uitgangspunten:
1. Medewerker blijft de primaire weekweergave.
2. Iedere uitvoerende medewerker moet per werkdag planbaar zijn.
3. Project en werkzaamheden moeten altijd gekoppeld zijn aan een planningsblok.
4. Lege planning betekent: medewerker is nog niet ingepland.
5. Verlof, ziekte en ADV zijn aparte statussen, geen projecten.
6. Houd de huidige UI rustig en zakelijk, geen redesign nodig.

Bouw drie weergaven op dezelfde planningsdata:

1. Personeelsplanning
- Weekweergave per medewerker.
- Dagen maandag t/m vrijdag.
- Per medewerker zichtbaar:
  - naam
  - functie/dienstverband
  - contracturen of beschikbare uren
  - geplande uren
  - resterende uren
- Per dag kunnen meerdere blokken worden ingepland.
- Elk blok bevat:
  - project
  - werknummer
  - hoofdopdracht of meerwerk
  - werkomschrijving
  - woningnummer(s) / bouwnummer(s) / locatie
  - starttijd
  - eindtijd
  - geplande uren
  - status: concept, ingepland, bevestigd, uitgevoerd
  - opmerkingen
- Gebruik kleurblokken per project of type status.
- Maak blokken klikbaar om details te openen/wijzigen.

2. Projectplanning
- Zelfde data, maar gegroepeerd per project.
- Per project zichtbaar:
  - projectnaam
  - werknummer
  - opdrachtgever
  - hoofdopdracht uren begroot
  - hoofdopdracht uren gepland
  - hoofdopdracht uren uitgevoerd
  - meerwerk uren begroot/gepland/uitgevoerd
  - resterende uren
- Toon per dag welke medewerkers op het project gepland staan.
- Maak zichtbaar of een project onderbezet of overbezet is.

3. Capaciteitsoverzicht
- Weekoverzicht totaal.
- Per werkmaatschappij:
  - beschikbare uren
  - geplande uren
  - vrije uren
  - verlof/ziekte/ADV uren
- Per medewerker:
  - beschikbaar
  - gepland
  - nog vrij
- Per project:
  - begroot
  - gepland
  - uitgevoerd
  - restant
- Signaleer afwijkingen:
  - medewerker minder dan contracturen gepland
  - medewerker overgepland
  - project boven begrote uren
  - meerwerk zonder markering
  - blok zonder project
  - blok zonder hoofdopdracht/meerwerk-keuze

Nacalculatie-eis:
Bij ieder planningsblok moet automatisch arbeidsnacalculatie ontstaan op projectniveau.

Regels:
- Geplande uren worden direct geboekt als geplande arbeid op het gekoppelde project.
- Uren moeten worden gesplitst in:
  - hoofdopdracht
  - meerwerk
- Meerwerk moet optioneel gekoppeld kunnen worden aan:
  - meerwerknummer
  - omschrijving
  - status: concept, aangeboden, akkoord, uitgevoerd, gefactureerd
- Zodra een medewerker later werkelijke uren invult, worden deze gekoppeld aan hetzelfde project/planningsblok.
- Nacalculatie moet per project kunnen tonen:
  - begrote uren
  - geplande uren
  - werkelijke uren
  - verschil gepland vs begroot
  - verschil werkelijk vs begroot
  - verschil werkelijk vs gepland
  - hoofdopdracht totaal
  - meerwerk totaal
- Deze nacalculatie moet later gebruikt kunnen worden voor weekstaten, facturatiecontrole, projectbewaking en rapportage.

Database:
Ontwerp of pas tabellen aan voor:
- employees
- projects
- project_budgets
- project_extra_work / meerwerk
- planning_blocks
- employee_availability
- leave_absence
- time_entries
- project_labor_calculation

Belangrijk:
- planning_blocks is de bron voor geplande arbeid.
- time_entries is de bron voor werkelijke arbeid.
- project_labor_calculation mag een view of berekende API-response zijn, geen dubbele handmatige invoer.
- Voorkom mock-data in live routes.
- Gebruik lege staten als data ontbreekt.
- Gebruik echte databasegegevens.
- Geen hardcoded medewerkers of projecten in live componenten.

Frontend:
- Pas de bestaande planningpagina aan.
- Maak geen losse HR-aanwezigheidsplanner.
- De tabs mogen blijven:
  - Medewerkers
  - Projecten
  - Capaciteit
- Voeg duidelijke filters toe:
  - week
  - werkmaatschappij
  - dienstverband
  - project
  - status
  - hoofdopdracht/meerwerk
- De planning moet bruikbaar zijn op desktop.
- Mobiel mag later; nu desktop eerst.

Stop na deze fase en rapporteer:
- welke tabellen zijn gemaakt/aangepast
- welke API-routes zijn toegevoegd
- welke mock-data is verwijderd
- hoe geplande uren naar nacalculatie lopen
- hoe werkelijke uren later gekoppeld worden
- welke onderdelen nog ontbreken voor urenregistratie en weekstaten
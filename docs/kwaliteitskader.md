# FPS Connect — Verplicht Kwaliteits-, Validatie- en Uitvoeringskader

> Vastgesteld door de platformeigenaar. Verplicht referentiedocument voor alle toekomstige werkzaamheden — naast de [ontwikkelfilosofie](ontwikkelfilosofie.md) (wat we bouwen en waarom) en de [kwaliteitscontrole](kwaliteitscontrole.md) (het rapporterende controlescript). Dit kader bepaalt **wanneer een taak gereed is**: Definition of Done, bewijsvoering en business-scenario-validatie.

## Doel

FPS Connect is een bedrijfskritisch platform. Vanaf heden is een taak pas gereed wanneer het volledige bedrijfsproces aantoonbaar correct functioneert.

Een succesvolle build, typecheck, audit of architectuurcontrole is noodzakelijk, maar nooit voldoende.

Het doel is niet alleen technisch correcte software, maar aantoonbaar betrouwbare software.

---

## Uitvoeringsprincipe

Iedere opdracht wordt volledig autonoom uitgevoerd binnen de afgesproken scope.

De AI-agent mag niet stoppen na een analyse of rapportage.

Bij ieder probleem wordt de volledige cyclus uitgevoerd:

1. Verzamel objectief bewijs.
2. Voer een root cause analyse uit.
3. Ontwerp de veiligste oplossing.
4. Implementeer de oplossing.
5. Voer alle relevante regressietesten uit.
6. Voer het volledige businessscenario opnieuw uit.
7. Controleer dat bestaande functionaliteit niet is beschadigd.
8. Lever bewijs van iedere stap.

Pas daarna wordt de opdracht als voltooid beschouwd.

---

## Validatie op vier niveaus

### Niveau 1 — Codekwaliteit

Verplicht:

- Build succesvol
- Typecheck succesvol
- Lint succesvol
- Geen nieuwe warnings
- Geen console-errors
- Geen regressies

### Niveau 2 — Architectuur

Controle op:

- Security
- Rollen en autorisaties
- API-contracten
- Datamodel
- Performance
- Logging
- Error handling
- Privacy/AVG

### Niveau 3 — Integratie

Iedere component in de keten wordt gecontroleerd.

Voor iedere wijziging wordt bewezen dat de complete keten functioneert:

```
Frontend → API → Business Logic → Database → Response → Frontend
```

Iedere stap moet aantoonbaar correct functioneren.

### Niveau 4 — Business Scenario Validation

Dit is de belangrijkste validatie.

Iedere functionaliteit wordt getest zoals een eindgebruiker deze gebruikt.

Niet een losse API. Niet een losse pagina. Maar het volledige bedrijfsproces.

Voorbeelden:

- Gebruiker aanmaken
- Gebruiker wijzigen
- Wachtwoord wijzigen
- Wachtwoord resetten
- Login
- AI-document upload
- AI-classificatie
- DMS-opslag
- Rapport genereren
- Workflow uitvoeren
- Rollen wijzigen

Pas wanneer het volledige scenario succesvol is afgerond, is de taak gereed.

---

## Bewijsvoering

Iedere conclusie moet gebaseerd zijn op aantoonbaar bewijs.

Geen aannames. Geen vermoedens. Geen "zou moeten werken".

Bewijs bestaat uit bijvoorbeeld:

- Requests
- Responses
- Database-resultaten
- Logging
- Screenshots
- Testresultaten
- AI-input en AI-output
- Performancegegevens

Wanneer bewijs ontbreekt wordt dit expliciet vermeld.

---

## Root Cause

Bij iedere fout geldt:

Niet direct repareren.

Eerst exact vaststellen waar de keten stopt:

```
Frontend → API → Business Logic → Database → Externe Service → AI → Infrastructure
```

Pas daarna wordt een oplossing geïmplementeerd.

---

## Regressietesten

Iedere wijziging bepaalt automatisch welke onderdelen geraakt kunnen worden.

Alle relevante bedrijfsprocessen worden opnieuw gevalideerd.

Niet alleen unit-tests. Niet alleen componenttests. Maar volledige eindgebruikersscenario's.

---

## Autonome uitvoering

Binnen de scope van de opdracht mag de AI-agent zelfstandig:

- code wijzigen;
- refactoren;
- logging uitbreiden;
- prompts verbeteren;
- AI-pipelines corrigeren;
- configuratie aanpassen;
- tests schrijven of aanpassen;
- regressietesten uitvoeren;
- documentatie actualiseren.

De agent hoeft hiervoor geen nieuwe opdracht te vragen.

De agent stopt pas wanneer:

- de root cause is opgelost;
- het volledige businessscenario succesvol is;
- alle relevante regressietesten groen zijn;
- bewijs is geleverd;
- geen nieuwe regressies zijn ontstaan.

Alleen rapporteren is nooit voldoende.

---

## Productiebeleid

De AI-agent mag nooit zelfstandig publiceren naar productie.

Iedere productie-uitrol vereist expliciete goedkeuring.

---

## Definition of Done

Een taak is uitsluitend gereed wanneer:

- ✓ De code correct is.
- ✓ De architectuur correct is.
- ✓ Alle betrokken componenten correct samenwerken.
- ✓ Het volledige businessscenario aantoonbaar succesvol is uitgevoerd.
- ✓ Regressietesten succesvol zijn.
- ✓ Objectief bewijs is geleverd.
- ✓ Geen bestaande functionaliteit is beschadigd.

Een gebruiker mag nooit de eerste tester van een nieuwe of gewijzigde functionaliteit zijn.

Het uiteindelijke doel van iedere opdracht is niet het produceren van code, maar het opleveren van aantoonbaar betrouwbare software.

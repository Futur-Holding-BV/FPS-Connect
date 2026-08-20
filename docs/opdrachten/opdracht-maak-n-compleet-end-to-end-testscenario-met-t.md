# OPDRACHT – Maak één compleet end-to-end testscenario met testdata in FPS Connect

## Doel

Maak in FPS Connect één volledig fictief testscenario waarmee de belangrijkste modules gezamenlijk getest kunnen worden.

Het doel is niet om nieuwe functionaliteit te bouwen, maar om bestaande functionaliteit aan elkaar te koppelen en te controleren of de workflow logisch werkt.

Maak hiervoor één herkenbare testomgeving met testdata.

## Testscenario

Maak één complete testketen aan met de naam:

TEST – Gebouwbeheer en uitvoering

## Aan te maken testdata

Maak de volgende testgegevens aan:

1. Testgebruiker

Maak één testgebruiker aan:

Naam: Test Gebruiker FPS
Rol: beheerder / interne FPS-medewerker
E-mail: testgebruiker@fps.local

Deze gebruiker moet toegang hebben tot de relevante modules.

2. Testklant / organisatie

Maak één fictieve klant aan:

Naam: Test Vastgoed BV
Type: gebouweigenaar / vastgoedbeheerder

3. Testgebouw

Maak één fictief gebouw aan:

Naam: Testgebouw Brandveiligheid
Adres: Teststraat 1, 7550 AA Hengelo
Eigenaar: Test Vastgoed BV

Het gebouw moet zichtbaar zijn in gebouwbeheer.

4. Testfactuur

Maak één fictieve verkoopfactuur aan en koppel deze aan de testklant en het testgebouw.

Omschrijving: Testfactuur brandveilig onderhoud
Status: concept of openstaand
Bedrag: fictief testbedrag

5. Test inkoopfactuur

Maak één fictieve inkoopfactuur aan en koppel deze aan dezelfde testklant, hetzelfde testgebouw en waar mogelijk aan dezelfde opdracht/projectstructuur.

Omschrijving: Test inkoopfactuur materiaal brandwerende afdichting
Leverancier: Test Leverancier BV
Status: concept of geboekt
Bedrag: fictief testbedrag

6. Testtekening

Maak of genereer één eenvoudige fictieve plattegrond/tekening voor het testgebouw.

Deze hoeft niet bouwkundig correct te zijn, maar moet bruikbaar zijn om een spot op te plaatsen.

7. Testspot

Maak één testspot aan op de fictieve tekening.

Voorbeeld:

Ruimte: Technische ruimte
Locatie: Wanddoorvoering bij kabelgoot
Classificatie: 60 minuten
Status: nieuw / te controleren
Foto: placeholder of testafbeelding
Omschrijving: Testspot brandwerende afdichting rondom kabeldoorvoer

De spot moet zichtbaar zijn in het gebouw, op de tekening en in de relevante uitvoerings-/controleworkflow.

8. Testonboarding

Maak één test-onboarding aan voor een nieuwe gebruiker of klant.

Naam: Test Onboarding Klant
Status: lopend
Gekoppeld aan: Test Vastgoed BV / Testgebouw Brandveiligheid

De onboarding moet aantonen dat een klant/gebruiker door de basisstappen geleid kan worden.

9. Test Toolbox

Maak één test Toolbox aan.

Titel: Test Toolbox Brandveilig werken
Onderwerp: Veilig werken bij brandwerende doorvoeringen
Doelgroep: monteurs
Status: gepubliceerd / gedeeld

De Toolbox moet zichtbaar en beschikbaar zijn in de telefoonapp of mobiele weergave.

10. Delen naar telefoonapp

Zorg dat de test Toolbox beschikbaar is voor de testgebruiker in de telefoonapp.

Controleer dat de testgebruiker op mobiel minimaal kan zien:

- titel van de Toolbox
- inhoud / instructie
- eventueel bevestigen of aftekenen
- koppeling met gebruiker of project indien aanwezig

## Belangrijk

Gebruik bestaande modules en bestaande datamodellen.

Niet bouwen:

- geen nieuwe module
- geen tweede database
- geen alternatieve testomgeving
- geen dubbele gebruikersstructuur
- geen losse demo-app

Het gaat om testdata binnen de bestaande FPS Connect-applicatie.

## Gewenst resultaat

Na uitvoering moet er één complete testketen bestaan:

Testgebruiker
↓
Testklant
↓
Testgebouw
↓
Testtekening
↓
Testspot
↓
Testfactuur
↓
Test inkoopfactuur
↓
Testonboarding
↓
Test Toolbox
↓
Telefoonapp

## Acceptatiecriteria

De opdracht is geslaagd wanneer:

- de testgebruiker bestaat;
- het testgebouw zichtbaar is in gebouwbeheer;
- de verkoopfactuur aan het testgebouw gekoppeld is;
- de inkoopfactuur aan het testgebouw gekoppeld is;
- er een fictieve tekening aan het gebouw hangt;
- er een testspot op de tekening zichtbaar is;
- er een onboarding zichtbaar is;
- er een Toolbox zichtbaar is;
- de Toolbox gedeeld is naar de telefoonapp;
- de volledige testketen zonder handmatig zoeken navigeerbaar is.

Maak na afloop een korte rapportage waarin staat:

1. welke testdata is aangemaakt;
2. waar deze zichtbaar is;
3. welke koppelingen werken;
4. welke koppelingen ontbreken of nog niet gebouwd zijn;
5. welke modules wel bestaan maar nog niet goed geïntegreerd zijn.
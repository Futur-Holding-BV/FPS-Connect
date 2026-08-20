Controleopdracht voor Replit — architectuurbeoordeling AI Opdrachtregisseur / PIM

Bekijk het voorgestelde implementatieplan voor de AI Opdrachtregisseur en het Project Intelligence Model kritisch tegen de bestaande codebase.

Doel van deze opdracht is niet om direct te bouwen, maar om eerst te verifiëren of dit plan technisch, architectonisch en functioneel goed aansluit op wat al bestaat.

Voer de volgende controle uit:

1. Onderzoek welke onderdelen al bestaan in de codebase:

* AI Gateway
* AI-aanroepen/audit logging
* opdrachten/statussen
* werkvoorbereiding
* inkoopplanning
* DMS/documenten
* uitvoeringsplanning
* monteur-app
* opleverrapportage
* FPS One / klantportaalstructuur

2. Beoordeel of het voorgestelde Project Intelligence Model logisch aansluit op de bestaande architectuur.

3. Controleer expliciet of het PIM geen dubbele bron van waarheid wordt. Operationele data zoals materialen, planning, medewerkers, offertes, inkoop, documenten en statussen moeten in bestaande tabellen/modules blijven. Het PIM mag alleen AI-context, analyse, motivatie, observaties en uitvoeringskennis bevatten.

4. Beoordeel of de voorgestelde fasering realistisch is en of de volgorde klopt.

5. Controleer per fase:

* welke bestaande bestanden/routes/schema’s geraakt worden;
* welke onderdelen hergebruikt kunnen worden;
* welke onderdelen nieuw nodig zijn;
* waar regressierisico’s zitten;
* welke onderdelen beter uitgesteld moeten worden.

6. Beoordeel specifiek de uitvoeringsfase:

* of stap-voor-stap begeleiding technisch haalbaar is;
* of de monteur slechts één actuele stap tegelijk moet zien;
* of foto’s gebruikt kunnen worden om de volgende stap te bepalen;
* of afwijkingen veilig door een projectleider/beheerder moeten worden goedgekeurd voordat de uitvoering verdergaat.

7. Beoordeel specifiek de samenhang:
   Adviescentrum → Werkvoorbereiding → Inkoop → Uitvoering → Oplevering → Onderhoud.

Controleer of dit als één doorlopende informatiestroom kan worden gebouwd zonder losse modules of dubbele data.

8. Geef daarna een concreet advies:

* wat is juist aan het plan;
* wat moet aangepast worden;
* wat is technisch riskant;
* wat moet absoluut niet zo gebouwd worden;
* welke eerste bouwstap het meest logisch en veilig is.

Lever geen codewijzigingen op voordat deze analyse is afgerond.

Gewenste output:

* korte samenvatting;
* architectuuroordeel;
* risicoanalyse;
* aanbevolen fasering;
* concrete eerste implementatiestap;
* expliciete lijst met onderdelen die niet gewijzigd mogen worden.

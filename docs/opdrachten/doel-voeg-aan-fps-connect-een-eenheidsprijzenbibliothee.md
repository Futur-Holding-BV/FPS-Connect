Doel

Voeg aan FPS Connect een eenheidsprijzenbibliotheek toe die gebruikt kan worden binnen calculaties. De bibliotheek is bedoeld voor standaardwerkzaamheden zoals schilderwerk, deuren afhangen, glas zetten, timmerwerk, E/W-werk en brandpreventieve werkzaamheden.

Scope

Deze opdracht breidt de bestaande calculatiemodule uit. Er wordt geen volledig nieuwe calculatiemodule gebouwd.

Functionaliteit

Maak een beheerbaar onderdeel “Eenheidsprijzen” binnen de calculatie-instellingen of bibliotheek.

Een eenheidsprijs bevat minimaal:

* code;
* omschrijving;
* categorie;
* eenheid: m², m¹, stuk, uur, set;
* materiaalcomponent;
* arbeidscomponent;
* normtijd;
* kostprijs;
* verkoopprijs;
* marge/opslag;
* btw-code indien relevant;
* geldig vanaf datum;
* actief ja/nee;
* opmerkingen;
* inclusies;
* exclusies;
* bron/opmerking prijsbasis.

Categorieën minimaal:

* schilderwerk;
* glas;
* deuren/kozijnen;
* timmerwerk;
* elektrotechniek;
* werktuigbouwkundig;
* brandpreventie;
* magazijn/kleinmateriaal;
* algemeen/arbeid.

Gebruik in calculatie

In de calculatie moet de gebruiker een eenheidsprijs kunnen selecteren als calculatieregel.

Bij selectie:

* omschrijving wordt overgenomen;
* eenheid wordt overgenomen;
* gebruiker vult hoeveelheid in;
* systeem berekent totaal;
* arbeidscomponent wordt meegenomen in uren/normtijd;
* materiaalcomponent wordt meegenomen in materiaal/kostprijs;
* marge/opslag wordt meegenomen in verkoopprijs;
* regel blijft aanpasbaar binnen de calculatie.

Import

Maak import via Excel mogelijk voor eenheidsprijzen.

Excel-template bevat minimaal:

* code;
* omschrijving;
* categorie;
* eenheid;
* materiaalcomponent;
* arbeidscomponent;
* normtijd;
* kostprijs;
* verkoopprijs;
* marge;
* geldig vanaf;
* actief;
* inclusies;
* exclusies;
* opmerkingen.

Validatie:

* code verplicht;
* omschrijving verplicht;
* eenheid verplicht;
* categorie verplicht;
* kostprijs of verkoopprijs verplicht;
* dubbele codes herkennen;
* preview vóór import;
* bestaande prijzen niet overschrijven zonder bevestiging.

Nacalculatie

Bereid de datastructuur voor om later gemiddelde nacalculatie te kunnen tonen per eenheidsprijs.

Voor nu minimaal velden reserveren of relatie voorbereiden voor:

* gemiddeld werkelijk aantal uren;
* gemiddeld werkelijk materiaalverbruik;
* laatst gebruikt in project;
* afwijking normtijd versus werkelijk.

Niet volledig uitwerken als dit te veel scope wordt, maar architectuur niet blokkeren.

Acceptatiecriteria

* Beheerder kan eenheidsprijzen aanmaken, wijzigen, deactiveren en importeren.
* Calculator kan een eenheidsprijs toevoegen aan een calculatie.
* Hoeveelheid × eenheidsprijs wordt correct berekend.
* Arbeid en materiaal blijven gescheiden zichtbaar.
* Calculatieregel blijft handmatig aanpasbaar.
* Excel-import werkt met preview en foutmeldingen.
* Bestaande calculatiefuncties blijven intact.

Niet doen

* Geen STABU-integratie.
* Geen externe commerciële prijzendatabase koppelen.
* Geen bestaande calculatiemodule vervangen.
* Geen AI-autocalculatie bouwen in deze opdracht.
* Geen offerte-layouts aanpassen, behalve waar nodig om de bestaande calculatieregels correct te tonen.

# Toevoeging – Documenten-inbox / Verwerkingswachtrij

## Doel

Voeg een centrale documenten-inbox toe waarin geüploade documenten eerst tijdelijk worden gestald voordat ze definitief worden verwerkt in Connect.

## Probleem

Op dit moment verdwijnen documenten te snel het systeem in. Bij grote hoeveelheden documenten is dat risicovol, omdat gebruikers onvoldoende controle houden over:

* wat er is geüpload;
* wat AI ermee heeft gedaan;
* waaraan het document is gekoppeld;
* of de classificatie klopt;
* of het document definitief verwerkt mag worden.

## Oplossing

Alle uploads komen eerst in een centrale documenten-inbox.

AI analyseert de documenten en doet per document een voorstel:

* documenttype;
* herkende klant;
* herkend gebouw;
* herkend project;
* mogelijke koppeling aan offerte, dossier, medewerker, onderhoud, HRM of bibliotheek;
* urgentie;
* betrouwbaarheid;
* voorgestelde actie.

## Gebruikersactie

De gebruiker kan per document:

* voorstel akkoord geven;
* voorstel aanpassen;
* document handmatig koppelen;
* document parkeren;
* document afwijzen;
* document archiveren;
* document later opnieuw laten analyseren.

## Belangrijke regel

AI mag documenten niet zelfstandig definitief verwerken zonder menselijke bevestiging, tenzij dit later expliciet per documenttype en workflow is toegestaan.

## Integratie

De documenten-inbox moet gekoppeld worden aan:

* Slim Upload;
* Documenten / DMS;
* Projecten;
* Gebouwen;
* Offertes;
* Werkvoorbereiding;
* Oplevering;
* Onderhoud;
* HRM;
* Bibliotheek;
* Audit Trail;
* toekomstig AI-logboek.

## Statussen

Gebruik minimaal:

* nieuw;
* geanalyseerd;
* voorstel_klaar;
* wacht_op_gebruiker;
* akkoord;
* aangepast;
* verwerkt;
* geparkeerd;
* afgewezen;
* fout.

## Niet direct bouwen

Deze functie wordt nu toegevoegd aan de architectuur-backlog. Eerst worden de lopende opdrachten afgerond:

* Workflow Engine;
* RBAC;
* Audit Trail;
* Integriteitscontrole;
* Technische schuld.

## Acceptatiecriterium

Een document is pas definitief verwerkt wanneer duidelijk is:

* wie het heeft geüpload;
* wat AI heeft voorgesteld;
* wie akkoord heeft gegeven;
* waaraan het document is gekoppeld;
* welke actie daarna is uitgevoerd;
* waar het document terug te vinden is.

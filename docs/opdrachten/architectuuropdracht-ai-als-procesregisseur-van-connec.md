# Architectuuropdracht – AI als procesregisseur van Connect

## Doel

Ontwerp de AI-laag van FPS Connect als centrale procesregisseur. AI moet niet alleen documenten analyseren, maar begrijpen waar een document, bericht of gebeurtenis past binnen de bedrijfsworkflow.

## Kernprincipe

De gebruiker levert informatie aan. AI bepaalt op basis van workflowcontext wat ermee moet gebeuren, stelt vervolgstappen voor, bewaakt open acties en vraagt menselijke bevestiging waar nodig.

## Gewenste keten

Input:

* document;
* e-mail;
* foto;
* notitie;
* werkbon;
* factuur;
* offerteaanvraag;
* rapport;
* contract.

AI-verwerking:

1. Herken documenttype of inputtype.
2. Bepaal relevante workflow.
3. Bepaal bijbehorende entiteit: klant, gebouw, project, offerte, werkbon, medewerker, dossier of onderhoudscontract.
4. Controleer welke workflowstatus actief is.
5. Bepaal welke informatie ontbreekt.
6. Stel vervolgstappen voor.
7. Zet acties klaar voor de juiste rol.
8. Bewaak deadlines en blokkades.
9. Leg beslissing en onderbouwing vast in audittrail / AI-logboek.

## AI mag zelfstandig

* classificeren;
* voorstellen doen;
* taken klaarzetten;
* concepten genereren;
* waarschuwingen geven;
* ontbrekende informatie signaleren;
* documenten voorlopig koppelen aan de documenten-inbox.

## AI mag niet zelfstandig

* offertes definitief versturen;
* facturen goedkeuren;
* contracten wijzigen;
* HR-besluiten nemen;
* veiligheidskritische beslissingen definitief maken;
* dossiers definitief verklaren;
* workflowstatussen wijzigen waarvoor menselijke bevestiging vereist is.

## Benodigde technische basis

Gebruik bestaande en geplande fundamenten:

* Workflow Engine;
* Centrale Autorisatie;
* Audit Trail;
* Documenten-inbox;
* AI-logboek;
* kennisobject-model;
* documentarchitectuur;
* module-integratiecontrole.

## Belangrijke eis

AI mag nooit los per module werken. Elke AI-actie moet altijd gekoppeld zijn aan:

* workflow;
* entiteit;
* gebruiker;
* rol/bevoegdheid;
* broninformatie;
* voorgestelde actie;
* beslissingsstatus;
* vervolgactie.

## Output

Lever een technisch ontwerp op voor één centrale AI Process Orchestrator, zonder deze nog te bouwen.

Beschrijf:

* datamodel;
* services;
* API’s;
* integratie met bestaande modules;
* risico’s;
* veiligheidsgrenzen;
* teststrategie;
* gefaseerde implementatie.

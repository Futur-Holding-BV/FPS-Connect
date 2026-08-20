Doel

Maak de bestaande PIM Uitvoering-module praktisch bruikbaar voor kantoor en uitvoering door drie productieblokkades op te lossen:

1. kantoor moet een volledig stappenoverzicht krijgen;
2. web moet echte foto-upload krijgen in plaats van handmatige URL-invoer;
3. uitvoering-AI moet KB-context gebruiken bij stapgeneratie.

Scope

Werk alleen aan de bestaande PIM Uitvoering-flow. Voeg geen nieuwe modules toe. Breid geen rapportage-, VGF-, Visual Library- of AI-fotoanalysefunctionaliteit uit in deze opdracht.

Onderdeel 1 — Kantoor-stappenoverzicht

Voeg in de web-tab pim-uitvoering-tab.tsx een stappenoverzicht toe naast of onder de actieve stap.

Toon per stap minimaal:

stapnummer;
status;
korte samenvatting/doel;
datum/tijd aangemaakt;
datum/tijd voltooid indien aanwezig;
of er foto’s aanwezig zijn;
of er een afwijking openstaat;
of er een projectleiderbesluit nodig is.

Gebruik duidelijke statussen:

open;
actief;
voltooid;
afgeweken;
overgeslagen;
wacht op beslissing.

De projectleider moet direct kunnen zien:

wat al gedaan is;
waar de monteur nu is;
waar afwijkingen zitten;
welke stappen nog openstaan.

Maak hiervoor indien nodig een bestaande of nieuwe API-route:

GET /opdrachten/:id/pim/uitvoering/stappen

Deze route geeft alle uitvoeringstappen voor de opdracht terug, gesorteerd op stapvolgorde of created_at.

Belangrijk:

Wijzig de bestaande huidige-stap-flow niet kapot.
De actieve stap blijft leidend voor de monteur.
Het overzicht is read-only, behalve bestaande afwijking-beslisacties.

Onderdeel 2 — Web foto-upload

Vervang in de kantooromgeving de handmatige invoer van foto-URLs door echte uploadfunctionaliteit.

Gebruik de bestaande object-storage/upload-flow die al in documenten/DMS wordt gebruikt.

Functioneel gedrag:

gebruiker klikt op “Foto toevoegen”;
kiest bestand;
bestand wordt geüpload naar object storage;
de verkregen URL/path wordt automatisch toegevoegd aan foto_urls;
toon thumbnail of bestandsnaam na upload;
gebruiker hoeft nooit handmatig een opslagpad te typen.

Randvoorwaarden:

hergebruik bestaande uploadroute, storage-client en foutafhandeling waar mogelijk;
geen nieuwe opslagarchitectuur bouwen;
bestaande mobiele upload-flow niet breken;
foto_urls blijft compatibel met bestaande database-opslag.

Onderdeel 3 — KB-context in uitvoering-AI

Voeg KB-context toe aan de AI-aanroepen die uitvoeringstappen genereren.

Gebruik de bestaande kbService.assembleKbContext()-functionaliteit.

Pas minimaal deze flow aan:

POST /opdrachten/:id/pim/uitvoering/start
POST /opdrachten/:id/pim/uitvoering/stap/:id/voltooien

De AI moet bij het genereren van een volgende stap context krijgen uit:

bedrijfsstandaarden;
opdrachtgever- of klantvoorkeuren;
projectcontext;
relevante productdocumentatie indien beschikbaar;
ETA/DoP/certificaatcontext indien gekoppeld;
eerder vastgelegde opname-, calculatie- of werkvoorbereidingsinformatie indien beschikbaar.

De gegenereerde stap moet daardoor concreter worden op:

uitvoeringswijze;
benodigde materialen;
gereedschap;
veiligheidscontrole;
controle-/acceptatievraag;
foto-opdracht.

Randvoorwaarden:

als KB-context ontbreekt, moet de uitvoering normaal blijven werken;
geen harde fout als de KB leeg is;
log duidelijk of KB-context wel/niet is meegestuurd;
voorkom dat de prompt extreem groot wordt;
gebruik bestaande promptstructuur zoveel mogelijk.

Niet doen

Geen AI-fotoanalyse bouwen.
Geen Visual Library of VGF bouwen.
Geen nieuwe rapportagegenerator bouwen.
Geen nieuwe rechtenstructuur ontwerpen, behalve noodzakelijke checks op bestaande rollen.
Geen bestaande mobiele uitvoering-flow herschrijven.
Geen databasebreuk veroorzaken in pim_uitvoering_stappen.

Acceptatiecriteria

1. Een projectleider ziet in de web-tab alle uitvoeringstappen van een opdracht.
2. De actieve stap blijft zichtbaar en bruikbaar zoals nu.
3. Afwijkingen en beslisstatussen zijn zichtbaar in het stappenoverzicht.
4. Foto’s kunnen in de webomgeving worden geüpload met een knop.
5. Handmatig typen van foto-URLs is niet meer nodig.
6. Geüploade foto’s worden correct opgeslagen in foto_urls.
7. Mobiele foto-upload blijft werken.
8. AI-stapgeneratie gebruikt KB-context wanneer beschikbaar.
9. Bij ontbrekende KB-context blijft stapgeneratie werken.
10. Typecheck, lint en bestaande tests slagen.
11. Er is geen regressie in start, huidige-stap, voltooien, afwijking melden, afwijking beslissen en oplevering controleren.

Verificatie

Voer na implementatie uit:

npm run typecheck
npm run lint indien beschikbaar
bestaande relevante tests voor PIM/uitvoering
handmatige test met één opdracht:

start uitvoering;
controleer stap 1;
upload foto via web;
voltooi stap;
controleer dat stap 2 met KB-context wordt gegenereerd;
meld afwijking;
controleer dat projectleider deze in overzicht ziet;
neem besluit;
controleer dat uitvoering verder kan.

Rapporteer na afloop:

welke bestanden zijn aangepast;
welke API-routes zijn toegevoegd of gewijzigd;
hoe foto-upload is aangesloten;
waar KB-context in de AI-prompt wordt toegevoegd;
welke tests/verificaties zijn uitgevoerd;
welke risico’s of restpunten overblijven.

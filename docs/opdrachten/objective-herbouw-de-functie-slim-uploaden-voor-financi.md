OBJECTIVE

Herbouw de functie “Slim uploaden” voor financiële documenten zodat een jaarrekening niet meer naar een algemeen Archief wordt gestuurd, maar veilig binnen de module Financieel wordt opgeslagen én de inhoud automatisch wordt gebruikt voor een meerjarenoverzicht voor de directeur.

SCOPE

Deze opdracht geldt in eerste instantie voor definitieve jaarrekeningen, geconsolideerde jaarrekeningen en financiële jaarstukken.

FUNCTIONAL REQUIREMENTS

1. CLASSIFICATIE

Wanneer een document wordt herkend als jaarrekening of financieel jaarstuk, moet Slim uploaden minimaal bepalen:

- documenttype;
- entiteit of onderneming;
- boekjaar;
- geconsolideerd of enkelvoudig;
- definitief, concept of onbekend;
- betrouwbaarheid van de classificatie.

Voorbeeld gewenste uitkomst:

Module: Financieel
Categorie: Jaarrekeningen
Jaar: 2023
Entiteit: FPS Groep
Subtype: Geconsolideerd
Status: Definitief
Toegang: Financieel vertrouwelijk

2. VEILIGE OPSLAGLOCATIE

Financiële jaarstukken mogen niet meer standaard naar een algemeen Archief.

Gebruik deze functionele structuur:

Financieel
└── Jaarrekeningen
    └── [boekjaar]

Bijvoorbeeld:

Financieel → Jaarrekeningen → 2023

De bestaande functie “Jaarrekening OHW” mag niet worden misbruikt als opslagmap voor definitieve jaarrekeningen. Dat onderdeel heeft een andere functie.

3. AUTORISATIE

Maak voor financiële jaarstukken een expliciet beveiligingsprofiel:

FINANCIAL_CONFIDENTIAL

Toegang uitsluitend voor:

- directie;
- financiële administratie;
- hoofdbeheerder;
- gebruikers met expliciete financiële leesrechten.

Gebruikers zonder deze rechten mogen:

- het document niet zien;
- de documenttitel niet zien;
- zoekresultaten of metadata niet zien;
- afgeleide financiële cijfers niet zien;
- downloadlinks niet benaderen.

Handhaaf dit server-side. Alleen frontend-verbergen is onvoldoende.

4. DOCUMENTOPSLAG

Bewaar minimaal:

- origineel bestand;
- originele bestandsnaam;
- voorgestelde nette titel;
- documenttype;
- entiteit;
- boekjaar;
- subtype;
- uploadmoment;
- uploader;
- classificatiemethode;
- betrouwbaarheidsscore;
- beveiligingsprofiel;
- opslaglocatie;
- extractiestatus;
- bronverwijzingen per geëxtraheerd cijfer.

Voorbeeld nette titel:

FPS Groep - Jaarrekening 2023 - Geconsolideerd

5. FINANCIËLE DATA-EXTRACTIE

Na bevestiging van de upload moet Connect financiële kerngegevens uit de jaarrekening extraheren en gestructureerd opslaan.

Ondersteun minimaal:

- omzet;
- mutatie onderhanden projecten;
- toegevoegde waarde;
- brutomarge indien afleidbaar;
- personeelskosten;
- huisvestingskosten;
- verkoopkosten;
- autokosten;
- kantoorkosten;
- algemene kosten;
- afschrijvingen;
- bedrijfsresultaat;
- interest;
- resultaat voor belastingen;
- vennootschapsbelasting;
- nettoresultaat;
- eigen vermogen;
- langlopende schulden;
- kortlopende schulden;
- liquide middelen;
- debiteuren;
- crediteuren;
- voorraden;
- onderhanden projecten actief;
- onderhanden projecten passief;
- materiële vaste activa;
- investeringen;
- dividenduitkeringen;
- gemiddeld aantal werknemers;
- liquiditeitsoverschot indien aanwezig;
- solvabiliteit indien berekenbaar;
- current ratio indien berekenbaar;
- nettomarge indien berekenbaar.

6. BRONBEWIJS

Ieder geëxtraheerd financieel cijfer moet herleidbaar zijn naar:

- document-id;
- paginanummer;
- tabel of sectie;
- oorspronkelijke tekst;
- extractiemethode;
- confidence score.

Een cijfer zonder bronbewijs mag niet automatisch als definitief worden verwerkt.

7. VALIDATIE DOOR GEBRUIKER

Toon vóór definitieve verwerking een controlescherm met:

- geëxtraheerde waarden;
- bronpagina;
- confidence;
- eventuele conflicten;
- ontbrekende waarden;
- mogelijkheid tot aanpassen;
- mogelijkheid tot uitsluiten.

Gebruik statussen:

- proposed;
- reviewed;
- approved;
- rejected;
- superseded.

Alleen approved waarden mogen in het directieoverzicht als definitieve cijfers worden gebruikt.

8. MEERJARENOVERZICHT DIRECTEUR

Maak binnen Financieel een nieuw onderdeel:

Financieel → Meerjarenoverzicht

Alleen zichtbaar voor directie en expliciet bevoegde financiële gebruikers.

Toon minimaal per jaar:

- omzet;
- bedrijfsresultaat;
- nettoresultaat;
- nettomarge;
- eigen vermogen;
- liquide middelen;
- solvabiliteit;
- current ratio;
- personeelskosten;
- personeelskosten als percentage van omzet;
- debiteuren;
- crediteuren;
- onderhanden werk;
- investeringen;
- dividend;
- gemiddeld aantal werknemers.

9. VISUALISATIES

Toon minimaal:

- tabel met meerdere jaren;
- lijntrend omzet;
- lijntrend nettoresultaat;
- lijntrend eigen vermogen;
- lijntrend liquide middelen;
- ontwikkeling personeelskosten;
- ontwikkeling marges;
- jaar-op-jaar mutatie in procenten.

Geen mock-data gebruiken.

10. DIRECTIESIGNALEN

Genereer op basis van de goedgekeurde gegevens feitelijke signalen, bijvoorbeeld:

- omzet daalt meerdere jaren;
- personeelskosten stijgen sneller dan omzet;
- nettomarge verslechtert;
- liquiditeit neemt sterk af;
- eigen vermogen daalt;
- debiteurenpositie verslechtert;
- investeringen nemen toe;
- dividend is hoog ten opzichte van resultaat;
- onderhanden werk verandert uitzonderlijk sterk.

Signalen moeten:

- formuleerbaar zijn zonder speculatie;
- de gebruikte jaren en waarden tonen;
- bronverwijzingen bevatten;
- geen advies presenteren als feit.

11. MEERDERE ENTITEITEN

Ondersteun zowel:

- geconsolideerde cijfers;
- cijfers per afzonderlijke B.V.

De gebruiker moet kunnen wisselen tussen:

- FPS Groep;
- FPS Bouw B.V.;
- FPS Onderhoud B.V.;
- FPS Bouw & Renovatie B.V.;
- FPS Brandpreventie B.V.;
- andere toekomstige entiteiten.

12. DUBBELE EN VERVANGENDE DOCUMENTEN

Wanneer voor hetzelfde boekjaar en dezelfde entiteit een nieuwe jaarrekening wordt geüpload:

- detecteer mogelijke duplicaten;
- markeer eerdere versies;
- laat kiezen tussen aanvullen, vervangen of als aparte versie bewaren;
- verwijder nooit automatisch historische gegevens;
- behoud audit trail;
- zet eerdere goedgekeurde dataset op superseded indien vervangen.

13. FALLBACK ZONDER AI

De functie moet blijven werken wanneer de AI-gateway niet beschikbaar is.

Gebruik dan:

- tekstextractie;
- herkenning van vaste financiële termen;
- tabeldetectie;
- patroonherkenning;
- inhoudsgedreven heuristiek;
- bestandsnaam alleen als aanvullend signaal.

AI mag classificatie en extractie verbeteren, maar mag geen harde afhankelijkheid zijn.

14. UI AANPASSING SLIM UPLOADEN

Voor financiële documenten moet het huidige scherm niet langer voorstellen:

Archief → Jaarrekeningen → [jaar]

maar:

Financieel → Jaarrekeningen → [jaar]

Toon daarbij duidelijk:

- Financieel vertrouwelijk;
- wie toegang heeft;
- dat de inhoud na goedkeuring wordt toegevoegd aan het Meerjarenoverzicht;
- welke waarden zijn gevonden;
- welke waarden nog beoordeling nodig hebben.

15. AUDIT EN LOGGING

Log minimaal:

- upload;
- classificatie;
- voorgestelde bestemming;
- handmatige correcties;
- goedkeuring van waarden;
- afwijzing van waarden;
- documentvervanging;
- wijziging van rechten;
- wijziging van financiële dataset;
- raadpleging of download van vertrouwelijke jaarstukken.

CONSTRAINTS

- Geen financiële documenten in een algemeen toegankelijk Archief.
- Geen client-side-only autorisatie.
- Geen mock-data.
- Geen stilzwijgende overschrijving.
- Geen definitieve verwerking van financiële cijfers zonder bronbewijs.
- Geen automatische verwijdering van oude documenten of datasets.
- Geen afhankelijkheid van een werkende AI-gateway.
- Bestaande productiegegevens behouden.
- Bestaande rollen en rechten niet verbreden.
- Bestaande “Jaarrekening OHW”-functionaliteit niet beschadigen.

DELIVERABLES

1. Gewijzigde Slim uploaden-classificatie.
2. Nieuwe veilige opslagroute binnen Financieel.
3. Beveiligingsprofiel FINANCIAL_CONFIDENTIAL.
4. Datamodel voor financiële documenten en jaarlijkse financiële kerncijfers.
5. Extractie- en validatieworkflow.
6. Bronbewijs per waarde.
7. Nieuw onderdeel Financieel → Meerjarenoverzicht.
8. Tabellen, trends en directiesignalen.
9. Versie- en duplicaatbeheer.
10. Audit logging.
11. Migratie voor bestaande database.
12. Korte beschrijving van gewijzigde bestanden en architectuurkeuzes.

ACCEPTANCE CRITERIA

De opdracht is gereed wanneer:

1. Een jaarrekening 2023 wordt herkend als financieel vertrouwelijk document.
2. De voorgestelde locatie Financieel → Jaarrekeningen → 2023 is.
3. Een onbevoegde gebruiker het document en de metadata niet kan zien.
4. De kerncijfers uit het document worden voorgesteld met bronpagina’s.
5. De gebruiker waarden kan beoordelen en goedkeuren.
6. Goedgekeurde waarden in het Meerjarenoverzicht verschijnen.
7. Meerdere boekjaren naast elkaar getoond kunnen worden.
8. Geconsolideerde en enkelvoudige cijfers gescheiden blijven.
9. De werking blijft bestaan als de AI-gateway niet beschikbaar is.
10. De bestaande Jaarrekening OHW-functionaliteit blijft intact.
11. Bestaande documenten en gegevens niet verloren gaan.
12. Alle autorisatiecontroles server-side aantoonbaar worden afgedwongen.

VERIFICATION

Voer minimaal deze scenario’s uit:

- Upload geconsolideerde jaarrekening 2023.
- Controleer classificatie, jaar, entiteit en subtype.
- Controleer opslag onder Financieel.
- Controleer toegang met directierol.
- Controleer blokkade met onbevoegde rol.
- Controleer extractie van minimaal tien kerncijfers.
- Controleer bronpagina per kerncijfer.
- Pas één voorgestelde waarde handmatig aan.
- Keur de dataset goed.
- Controleer het Meerjarenoverzicht.
- Upload een tweede versie van hetzelfde boekjaar.
- Controleer versiebeheer en superseded-status.
- Schakel AI-gateway uit.
- Herhaal classificatie en extractie via fallback.
- Controleer dat Jaarrekening OHW ongewijzigd blijft.

Werk dit volledig door in de bestaande productiearchitectuur. Stop niet na alleen UI-aanpassingen. De opslag, rechten, extractie, validatie, datasets en het meerjarenoverzicht moeten end-to-end werken.
Doel

Maak FPS Connect productiegeschikt voor eerste ingebruikname door monteurs en kantoor, zonder nieuwe hoofdfunctionaliteit toe te voegen. Focus uitsluitend op eerste gebruikerservaring, lege schermen, mobiele onboarding en bulk-import van stamgegevens.

Scope

Deze opdracht bestaat uit drie onderdelen:

1. Professionele lege toestanden in web en app
2. Mobiele app onboarding voor eerste gebruik
3. Universele Excel-importwizard voor stamgegevens

Er mogen geen bestaande workflows worden verwijderd of ingrijpend gewijzigd.

Onderdeel 1 — Lege toestanden

Voeg aan alle relevante schermen een duidelijke lege toestand toe wanneer er nog geen data beschikbaar is.

Minimaal voor:

* Mijn werk
* Gebouwen
* Projecten
* Spots
* Planning
* Uren
* Documenten
* Berichten
* Magazijn
* Inkoop
* Inspecties
* Opleveringen
* Onderhoud
* HRM
* Toolboxen
* LMRA
* Incidenten
* Veiligheidsmeldingen
* Klanten
* Leveranciers
* Artikelen

Elke lege toestand bevat:

* korte uitleg waarom het scherm leeg is;
* duidelijke vervolgstap;
* primaire actieknop indien logisch;
* geen wit leeg scherm;
* geen technische foutmelding richting gebruiker;
* consistente styling met bestaande UI.

Voorbeelden:

“Er zijn vandaag nog geen werkzaamheden aan je toegewezen.”

“Er zijn nog geen documenten gekoppeld aan dit gebouw.”

“Er zijn nog geen artikelen geïmporteerd. Start met een Excel-import of voeg handmatig een artikel toe.”

Onderdeel 2 — Mobiele app onboarding

Maak een eerste-gebruik-flow voor monteurs in de mobiele app.

De flow moet ondersteunen:

* welkomscherm;
* uitleg: app gebruiken via Expo Go zolang er nog geen App Store-versie is;
* QR-code / app openen uitleg;
* login;
* TOTP / authenticator instellen;
* korte uitleg van de hoofdonderdelen:

  * Mijn werk
  * Gebouwen
  * Spots
  * Foto’s
  * Uren
  * Documenten
  * Magazijn
  * Veiligheid
* afsluiten met “Start werkdag”.

De onboarding mag opnieuw bekeken kunnen worden via instellingen/help.

Belangrijk:

* monteurs mogen niet vastlopen als zij nog geen werk toegewezen hebben;
* foutmeldingen moeten begrijpelijk zijn;
* als API-domein of opslagconfiguratie ontbreekt, toon een duidelijke beheerdermelding;
* geen technische stacktraces of ruwe errors tonen.

Onderdeel 3 — Universele Excel-importwizard

Bouw een generieke importwizard voor stamgegevens.

Ondersteun minimaal import van:

* medewerkers;
* klanten;
* contactpersonen;
* gebouwen;
* leveranciers;
* artikelen;
* documenten/certificaatmetadata;
* magazijnartikelen.

Workflow:

1. Kies importtype.
2. Download Excel-template.
3. Upload ingevulde Excel.
4. Systeem leest kolommen.
5. Validatie uitvoeren.
6. Toon preview.
7. Toon fouten en waarschuwingen.
8. Gebruiker bevestigt import.
9. Import uitvoeren.
10. Importlog tonen.

Eisen:

* per importtype een vaste template;
* verplichte velden controleren;
* dubbele records herkennen;
* duidelijke foutregels per rij;
* preview vóór definitieve import;
* import mag niet half-onzichtbaar falen;
* rollback of veilige transactie toepassen waar mogelijk;
* importlog opslaan;
* bestaande records niet zomaar overschrijven zonder bevestiging;
* AI mag helpen met kolomherkenning, maar definitieve mapping moet zichtbaar zijn voor gebruiker.

Voorbeelden verplichte velden:

Medewerkers:

* naam
* e-mail
* rol
* actief ja/nee

Klanten:

* klantnaam
* type klant
* e-mail of telefoon indien beschikbaar

Gebouwen:

* naam
* adres
* plaats
* klant

Leveranciers:

* naam
* contactgegevens
* categorie

Artikelen:

* artikelnummer
* omschrijving
* eenheid
* prijs indien beschikbaar
* leverancier indien beschikbaar

Acceptatiecriteria

De opdracht is gereed wanneer:

* geen enkel hoofdscherm meer leeg/wit oogt bij ontbrekende data;
* de mobiele app een duidelijke eerste-gebruik-flow heeft;
* een monteur zonder uitleg van een ontwikkelaar kan inloggen en starten;
* lege “Mijn werk”-situaties netjes worden uitgelegd;
* Excel-import werkt voor de genoemde stamgegevens;
* foutieve imports niet stilzwijgend worden verwerkt;
* gebruiker altijd preview en validatiefouten ziet vóór import;
* bestaande functionaliteit intact blijft;
* app en web lokaal en in productie-preview blijven werken.

Niet doen

* Geen nieuwe grote modules bouwen.
* Geen bestaande navigatie volledig herontwerpen.
* Geen App Store / Play Store build uitvoeren in deze opdracht.
* Geen push-notificaties toevoegen.
* Geen extra AI-workflows toevoegen buiten importondersteuning.
* Geen test- of rapportageproject opzetten dat de uitvoering vertraagt.

Verificatie

Controleer na oplevering minimaal:

* nieuwe gebruiker zonder data;
* monteur zonder toegewezen werk;
* monteur met één toegewezen gebouw;
* upload van geldige Excel;
* upload van Excel met ontbrekende verplichte velden;
* upload met dubbele records;
* foto-upload vanuit mobiele app;
* openen van documenten vanuit mobiele app;
* login + TOTP-flow.

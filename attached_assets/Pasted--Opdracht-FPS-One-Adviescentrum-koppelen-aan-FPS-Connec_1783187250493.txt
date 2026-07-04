# Opdracht – FPS One Adviescentrum koppelen aan FPS Connect via één centrale opdrachtstructuur

## Doel

Breng FPS One Adviescentrum en FPS Connect samen in één geïntegreerde opdrachtketen.

FPS One mag geen losstaande website-AI blijven die alleen een adviesrapport maakt.

FPS One moet de externe klantingang worden voor opdrachten die uiteindelijk operationeel landen in FPS Connect.

FPS Connect blijft de operationele bron van waarheid voor:

- opdrachten
- klanten
- gebouwen
- documenten
- AI-context
- werkvoorbereiding
- inkoop
- planning
- uitvoering
- oplevering
- onderhoud

Het uitgangspunt is:

**FPS One is de voorkant. FPS Connect is de operationele kern. Er is één opdracht, één dossier en één AI-context.**

---

# Probleem dat opgelost moet worden

Op dit moment dreigt het risico dat FPS One Adviescentrum en FPS Connect aparte werelden worden:

- website/adviescentrum analyseert een aanvraag;
- Connect moet daarna opnieuw een opdracht/project aanmaken;
- documenten worden dubbel opgeslagen;
- AI-analyse gaat verloren;
- werkvoorbereiding moet opnieuw beginnen;
- uitvoering krijgt onvoldoende context;
- oplevering sluit niet automatisch aan op het oorspronkelijke advies.

Dat mag niet gebeuren.

De systemen moeten vanaf het begin op één gedeeld opdrachtmodel worden aangesloten.

---

# Gewenste architectuur

## Centrale opdrachtstructuur

Introduceer of gebruik één centrale opdrachtstructuur, hierna genoemd:

**Project Intelligence Model**

Dit is het gedeelde opdrachtobject waarin alle fasen kennis lezen en schrijven.

Het model bevat minimaal:

- organisatie
- klant
- gebouw / locatie
- aanvraag
- documenten
- foto's
- tekeningen
- AI-analyse
- risico's
- aannames
- ontbrekende informatie
- advies
- werkpakketten
- materialen
- artikelen
- gereedschappen
- competenties
- veiligheidsaandachtspunten
- uitvoeringsstappen
- controles
- afwijkingen
- foto's uitvoering
- opleverinformatie
- onderhoudsinformatie

Alle modules lezen en schrijven op ditzelfde model.

Er mogen geen losse AI-contexten ontstaan per module.

---

# Rollen van de applicaties

## FPS One

FPS One is bedoeld voor:

- klanttoegang
- aanvraag/intake
- documentupload
- Adviescentrum
- adviesrapport
- klantcommunicatie
- akkoord / vervolgactie

FPS One mag informatie tonen, verzamelen en analyseren, maar mag geen zelfstandige operationele projectadministratie naast Connect opbouwen.

Zodra een aanvraag wordt gestart in FPS One, moet er in Connect direct een conceptopdracht of conceptproject ontstaan.

Deze opdracht krijgt bijvoorbeeld status:

- nieuw
- in analyse
- advies gereed
- offerte nodig
- akkoord
- werkvoorbereiding
- uitvoering
- oplevering
- onderhoud

FPS One toont dezelfde opdracht, maar vanuit klantperspectief.

---

## FPS Connect

FPS Connect blijft verantwoordelijk voor:

- interne beoordeling
- werkvoorbereiding
- calculatiecontrole
- inkoopvoorstel
- planning
- monteursaansturing
- adaptieve uitvoering
- opleverrapportage
- onderhoudsdossier
- interne audittrail

Connect gebruikt de informatie uit FPS One direct.

De werkvoorbereider mag de documenten, analyse en risico's dus niet opnieuw hoeven uploaden of opnieuw hoeven invoeren.

---

# Workflow van aanvraag tot uitvoering

## Stap 1 – Aanvraag via FPS One

Een klant of interne gebruiker start een aanvraag in FPS One Adviescentrum.

De gebruiker kan uploaden:

- offerteaanvraag
- bestek
- tekeningen
- foto's
- begroting
- bestaande offerte
- opmerkingen
- aanvullende documenten

Actie systeem:

- maak direct een conceptopdracht aan in Connect;
- koppel alle documenten aan deze opdracht;
- start AI-analyse binnen dezelfde opdrachtcontext;
- registreer activiteit in beide omgevingen.

---

## Stap 2 – AI-analyse in Adviescentrum

De AI analyseert de aanvraag en vult het Project Intelligence Model.

De AI bepaalt onder andere:

- wat wordt gevraagd;
- welke werkzaamheden worden herkend;
- welke locaties of posities relevant zijn;
- welke risico's zichtbaar zijn;
- welke informatie ontbreekt;
- welke aannames worden gedaan;
- welke werkzaamheden binnen FPS-competenties vallen;
- welke aanvullende vragen nodig zijn;
- of opname nodig is;
- of werkvoorbereiding al kan starten.

De AI genereert een adviesrapport, maar het rapport is niet de bron van waarheid.

De bron van waarheid is het Project Intelligence Model.

---

## Stap 3 – Overdracht naar Connect

Er is geen losse export en geen losse tekstoverdracht.

Connect leest dezelfde opdrachtcontext.

In Connect ziet de werkvoorbereider:

- aanvraag
- documenten
- foto's
- AI-samenvatting
- risico's
- aannames
- open vragen
- voorgestelde werkzaamheden
- voorgestelde vervolgactie

De werkvoorbereider kan:

- analyse goedkeuren;
- analyse aanpassen;
- aanvullende informatie vragen;
- opname plannen;
- werkvoorbereiding starten;
- aanvraag afwijzen;
- offerte laten voorbereiden.

Alle wijzigingen worden teruggeschreven naar hetzelfde model.

---

# Werkvoorbereiding in Connect

De AI fungeert als senior werkvoorbereider.

Op basis van de gedeelde opdrachtcontext maakt de AI een voorstel voor:

- werkpakketten
- uitvoeringsvolgorde
- benodigde materialen
- specifieke artikelen
- benodigde gereedschappen
- benodigde competenties
- veiligheidsmaatregelen
- controlepunten
- benodigde foto's
- verwachte arbeidstijd
- meerwerkrisico's
- opleverpunten

De gebruiker moet alle AI-voorstellen kunnen aanpassen voordat ze definitief worden.

De AI mag geen definitieve uitvoeringsinstructies vrijgeven zonder menselijke goedkeuring van de werkvoorbereiding.

---

# Inkoopvoorstel

Op basis van de goedgekeurde werkvoorbereiding maakt de AI een inkoopvoorstel.

Per artikel toont de AI:

- artikelnaam
- artikelnummer indien bekend
- leverancier indien bekend
- aantal
- toepassing binnen de opdracht
- bijbehorende uitvoeringsstap
- reden van keuze
- alternatief indien relevant
- aandachtspunten voor montage
- handleiding/productblad indien beschikbaar

Na goedkeuring worden deze artikelen gekoppeld aan de opdracht.

Vanaf dat moment zijn dit de artikelen die de uitvoeringsassistent gebruikt.

De uitvoering mag niet gebaseerd zijn op generieke materialen als er specifieke artikelen zijn gekozen.

---

# Adaptieve Uitvoeringsassistent

De uitvoering in Connect mag geen statische PDF-werkbon worden.

De monteur krijgt een interactieve AI-begeleiding.

Belangrijk uitgangspunt:

**De AI toont altijd slechts één uitvoeringsstap tegelijk.**

De AI mag niet vooraf tien stappen uitwerken voor de monteur.

Iedere volgende stap wordt pas bepaald nadat de vorige stap is afgerond.

De volgende stap wordt gebaseerd op:

- oorspronkelijke aanvraag
- adviesanalyse
- goedgekeurde werkvoorbereiding
- gekozen artikelen
- antwoorden van de monteur
- foto's van de monteur
- afwijkingen
- veiligheidssituatie
- status van vorige stappen

---

## Per uitvoeringsstap

De monteur ziet per stap alleen wat op dat moment nodig is:

- doel van de stap
- exacte handeling
- benodigde artikelen
- benodigde gereedschappen
- veiligheidscontrole
- productspecifieke instructie
- foto-opdracht
- controlevraag

Voorbeeld:

Stap:
Controleer de bestaande situatie bij locatie woonkamer achterdeur.

Monteur krijgt:

- controleer of dit de juiste locatie is;
- controleer of de vluchtroute vrij is;
- controleer of het pictogram zichtbaar geplaatst kan worden;
- maak een foto van de deur en directe omgeving;
- bevestig of gordijnen de vluchtdeur kunnen blokkeren.

Pas na foto en antwoord bepaalt AI de volgende stap.

---

## Foto's tijdens uitvoering

Foto's zijn geen bijlage achteraf.

Foto's zijn input voor de volgende AI-stap.

De AI gebruikt foto's om:

- locatie te bevestigen;
- bestaande situatie te beoordelen;
- afwijkingen te herkennen;
- montagekwaliteit te controleren;
- ontbrekende onderdelen te signaleren;
- vervolgactie te bepalen;
- opleverdossier op te bouwen.

De AI mag bij twijfel om een extra foto vragen.

---

## Afwijkingen tijdens uitvoering

Wanneer de werkelijke situatie afwijkt van de voorbereiding, moet de AI:

- de afwijking benoemen;
- uitleggen waarom dit relevant is;
- vervolgopties voorstellen;
- aangeven of werkvoorbereiding moet worden aangepast;
- aangeven of meerwerk mogelijk is;
- de monteur laten stoppen indien veiligheid of scope geraakt wordt;
- goedkeuring vragen van werkvoorbereider/projectleider voordat wordt doorgegaan.

De AI mag nooit zelfstandig de scope of prijs wijzigen.

---

# Oplevering

Na uitvoering genereert Connect automatisch de opleverdocumentatie op basis van hetzelfde opdrachtmodel.

Het opleverdossier bevat:

- uitgevoerde stappen
- gebruikte artikelen
- foto's vóór/tijdens/na
- controles
- testresultaten
- afwijkingen
- goedkeuringen
- restpunten
- verklaring/certificaat indien van toepassing
- onderhoudsadvies indien relevant

Er mag geen aparte opleverrapportage ontstaan die opnieuw handmatig gevuld moet worden.

---

# Rechten en abonnementen

FPS One gebruikt de bestaande abonnements- en entitlementlogica.

Belangrijk:

- Adviescentrum alleen beschikbaar volgens abonnement;
- gebruiksteller telt adviesanalyses;
- klanttoegang blijft gescheiden per organisatie;
- Connect-interne functies blijven alleen beschikbaar voor interne rollen;
- klant mag nooit interne werkvoorbereiding, marge, inkoopprijzen of interne notities zien.

---

# Beveiliging en AVG

Gebruik bestaande beveiligingsstructuur.

Vereisten:

- organisaties strikt gescheiden;
- documenten alleen zichtbaar voor bevoegde gebruikers;
- klantomgeving en interne omgeving gescheiden;
- audittrail op belangrijke AI-besluiten;
- logging van uploads, analyse, overdracht, goedkeuringen en wijzigingen;
- geen gevoelige interne calculatie tonen in FPS One;
- geen AI-besluiten uitvoeren zonder menselijke goedkeuring waar dit operationele of financiële gevolgen heeft.

---

# Technische randvoorwaarden

Gebruik bestaande architectuur waar mogelijk.

Niet bouwen als losstaand systeem.

Niet doen:

- geen tweede documentopslag;
- geen tweede projectdatabase;
- geen aparte AI-context voor de website;
- geen losse export/import tussen One en Connect;
- geen PDF als primaire overdracht;
- geen nieuwe Stripe- of abonnementswijzigingen;
- geen dubbele loginstructuur;
- geen parallelle klantadministratie;
- geen grote UI-herbouw als dit niet nodig is.

Wel doen:

- gedeeld opdrachtmodel;
- gedeelde documentkoppeling;
- gedeelde AI-context;
- duidelijke statusovergangen;
- duidelijke rollen;
- uitbreidbaar ontwerp;
- volledige traceerbaarheid.

---

# Minimale eerste implementatie

Bouw dit gefaseerd.

Fase 1 moet minimaal opleveren:

1. FPS One Adviescentrum kan een aanvraag met documenten uploaden.
2. Er wordt automatisch een conceptopdracht in Connect aangemaakt.
3. Documenten zijn in beide omgevingen gekoppeld aan dezelfde opdracht.
4. AI-analyse wordt opgeslagen in het gedeelde opdrachtmodel.
5. Connect Werkvoorbereiding kan deze analyse openen.
6. Werkvoorbereiding kan AI-voorstel genereren voor werkpakketten, materialen, gereedschappen en controlepunten.
7. AI kan een eerste inkoopvoorstel maken.
8. AI kan een eerste adaptieve uitvoeringsstap genereren.
9. Monteur ziet één stap tegelijk.
10. Monteur kan foto toevoegen aan die stap.
11. Foto wordt onderdeel van dezelfde opdrachtcontext.
12. Oplevering kan de verzamelde stappen en foto's gebruiken.

Nog niet nodig in fase 1:

- volledige voorraadmodule;
- busvoorraad;
- automatische leverancierskoppeling;
- automatische bestellingen;
- volledige onderhoudscyclus;
- geavanceerde normvalidatie;
- automatische prijswijzigingen;
- externe klantgoedkeuring op alle workflowstappen.

---

# Testcase

Gebruik de case:

Beekstraat/Bleekstraat 9A Goor – Oude Wolbers

Documenten:

- foto-overzicht / opname
- begroting
- offerte

De AI moet herkennen:

- vluchtrouteaanduidingen;
- noodverlichtingsarmaturen;
- knopcilinder;
- meerdere locaties/posities;
- 230V-aansluitpunten;
- VOP-competentie als aandachtspunt;
- vrije werkplek;
- maximaal 10 meter tot centraaldoos als uitgangspunt;
- gordijnen bij achterdeur als risico;
- opleverrapport/certificaat als opleverpunt.

De AI mag niet standaard adviseren dat FPS dit niet kan uitvoeren.

De AI moet uitgaan van FPS-uitvoering binnen eigen competenties, met VOP-aandachtspunten en menselijke controle.

---

# Acceptatiecriteria

## Architectuur

- FPS One en FPS Connect gebruiken één gedeeld opdrachtmodel.
- Er ontstaat geen dubbele projectadministratie.
- Er ontstaat geen dubbele documentopslag.
- AI-context blijft behouden tussen Adviescentrum en Werkvoorbereiding.
- Connect blijft operationele bron van waarheid.

## Adviescentrum

- Upload werkt.
- AI-analyse wordt opgeslagen.
- Adviesrapport kan worden gegenereerd.
- Analyse is zichtbaar in Connect.

## Werkvoorbereiding

- Werkvoorbereiding kan de FPS One-analyse openen.
- AI maakt werkpakketten.
- AI maakt materiaallijst.
- AI maakt gereedschapslijst.
- AI maakt controlepunten.
- Gebruiker kan alles aanpassen.

## Inkoop

- AI maakt een inkoopvoorstel.
- Artikelen worden gekoppeld aan werkpakketten en uitvoeringsstappen.
- Uitvoering gebruikt gekozen artikelen, geen generieke omschrijving.

## Uitvoering

- Monteur krijgt geen volledige PDF-werkbon.
- Monteur krijgt één uitvoeringsstap tegelijk.
- Foto's kunnen per stap worden toegevoegd.
- Foto's beïnvloeden de volgende stap.
- Afwijkingen worden gesignaleerd en niet automatisch doorgedrukt.

## Oplevering

- Uitgevoerde stappen, foto's, controles en afwijkingen worden gebruikt voor opleverrapport.
- Geen dubbele handmatige invoer nodig.

## Regressie

Controleer expliciet dat niets stukgaat in:

- login
- organisatiescheiding
- abonnementstatus
- Stripe checkout
- Stripe portal
- dashboard
- bestaande Connect-projecten
- documenten
- rechtenstructuur

---

# Eindrapportage

Lever na implementatie een korte technische rapportage op met:

- welke tabellen of modellen zijn toegevoegd/aangepast;
- hoe FPS One en Connect dezelfde opdracht delen;
- waar AI-context wordt opgeslagen;
- hoe documenten worden gekoppeld;
- hoe rechten zijn geborgd;
- welke statusovergangen zijn geïmplementeerd;
- welke onderdelen bewust nog niet zijn gebouwd;
- testresultaten per acceptatiecriterium.
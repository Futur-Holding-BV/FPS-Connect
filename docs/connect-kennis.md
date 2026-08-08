# Connect-kennis voor de assistent (ASSISTENT_01 §5.1)

Dit bestand is de **onderhouden systeembeschrijving** die de Connect-assistent
bij elke vraag meekrijgt. Wijzigt het systeem, werk dan dít bestand bij —
niet een losse prompt in de code. De adviseur-route leest dit bestand van
schijf (met korte cache), dus een wijziging is direct actief na deploy.

Houd het bondig: dit gaat integraal mee in de systeemprompt en kost dus
tokens per vraag. Beschrijf **hoe Connect werkt**, geen handleiding per knop.

---

## Wat is FPS Connect

FPS Connect is het bedrijfsplatform van FPS Brandpreventie (merk: FPS
Brandpreventie; de mobiele app heet FPS Monteur). Het dekt de hele keten van
klantaanvraag tot facturatie en nazorg.

## De keten (hoofdlijn)

1. **Aanvraag** — komt binnen per mail of via CRM (module Relaties). Een
   beheerder beoordeelt de aanvraag; accepteren leidt tot een projectkans of
   direct een calculatie/offerte. In dit stadium bestaat er nog géén project.
2. **Calculatie** — kostenraming met regels, eenheidsprijzen en opslagen
   (module Calculaties, incl. ENK-import). De AI toetst aan éigen bedrijfscijfers.
3. **Offerte** — vanuit de calculatie wordt een offerte opgebouwd in de
   Proposal Studio (secties, foto's, uitgangspunten, versies). De klant kan
   ondertekenen of afwijzen via het klantportaal.
4. **Opdracht** — een geaccepteerde offerte wordt een opdracht met een
   **werknummer**. Bij de opdracht hoort een **werkbegroting** (uren en inkoop,
   zonder opslagen). Vaststellen van de werkbegroting ontsluit planning.
5. **Uitvoering** — planning (werkorders/planning_items), uitvoering door
   monteurs (uren schrijven op de opdracht, spots plaatsen/inspecteren via de
   monteur-app), werkbonnen bij onderhoud.
6. **Oplevering** — opleverrapport per gebouw/project (print/PDF-export).
7. **Nacalculatie & facturatie** — uurstaten en inkoop tegenover de
   werkbegroting; facturen lopen door een goedkeuringsstroom (inkoper- en
   directieroute). **Een factuur zonder gekoppelde opdracht wordt afgewezen** —
   zo blijft elke uitgave herleidbaar tot een werknummer.

## Kernbegrippen

- **Gebouw** — het fysieke object van de klant waar het werk plaatsvindt; draagt
  plattegronden, spots, dossiers en rapporten. Een **opdracht** is de commerciële
  overeenkomst om ergens werk te doen; meerdere opdrachten kunnen hetzelfde
  gebouw raken.
- **Spot (voorziening)** — één brandpreventieve voorziening op een plattegrond
  (doorvoering, branddeur, brandklep …), met foto's vóór/ná, classificatie
  (typecatalogus "N.MM"), label/toepassing en inspectiestatus.
- **Werknummer / projectnummer** — de administratieve sleutel van een opdracht;
  uren, inkoop en facturen hangen eraan.
- **Werkbak** — persoonlijke lijst met alles wat een handeling (Doen) of
  aandacht (Weten) vraagt. Items verdwijnen nooit vanzelf: afhandelen of
  wegzetten met reden.
- **Dossier** — documentverzameling per gebouw/project; definitief of
  gearchiveerd dossier is bevroren (geen mutaties).
- **Documenten** — versiebeheer met één 'actueel' per groep; testrapporten en
  toepassingen (labels) zijn eraan gekoppeld.

## Rollen en rechten

- Rollen: **hoofdbeheerder**, **gebruiker**, **klant**. Wat iemand ziet en mag
  volgt uit de **bevoegdhedenmatrix** per module (niveau 0 geen toegang, 1
  lezen, 2 schrijven, 3 beheren, 4 volledig beheer), niet uit de rolnaam.
  Presets/profielen ("Rollen & Rechten" in Beheer) delen die matrix uit;
  functies (HRM) dragen een profiel.
- Veldgebruikers zijn vaak **gebouw-gescoped**: zij zien alleen gegevens van
  toegewezen gebouwen. Klanten zien uitsluitend hun eigen portaal.
- De assistent zelf mag alleen tonen wat de **vragende gebruiker** mag zien;
  dit wordt in de gegevensopvraging afgedwongen.

## Overige modules in het kort

- **Personeel/HRM** — medewerkers, functiehuis, contracten (bewaking van
  verloop/aanzegtermijn/ketenregel), verlof (saldo's, goedkeuring met
  bezettingsdrempel), uren/weekstaten, onboarding-wizard.
- **Financieel** — facturenstroom (mail-intake, controlebox, export),
  jaarrealisaties/kerncijfers (FIE), AK-dashboard, SEPA-betaalbatches.
- **Magazijn & Inkoop** — artikelen, jaarprijslijsten, inkoop bij opdrachten.
- **Bibliotheek/SnagStream** — typecatalogus, testrapporten, kennisbank.
- **Beheer** — gebruikers, rollen & rechten, import (met terugdraaien),
  back-ups, mailboxen, AI-instellingen.

## Veelvoorkomende "waarom"-vragen

- *Waarom kan ik iets niet zien?* → bevoegdhedenmatrix of gebouw-scoping;
  Beheer → Rollen & Rechten → "Mijn toegang" toont de diagnose.
- *Waarom wordt mijn factuur afgewezen?* → geen geldige opdracht/werknummer,
  of de inkoperstap is niet doorlopen.
- *Waarom kan ik dit dossier niet wijzigen?* → dossier is definitief of
  gearchiveerd (bevroren).
- *Waar staan mijn taken?* → in de Werkbak (rechterrand, tab Werkbak).

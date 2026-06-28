Breid de Workflow Designer uit zodat deze niet alleen een visuele proceskaart is, maar ook een configuratielaag voor FPS Connect.

Doel:
De workflow moet intern overzicht geven, maar later ook geschikt zijn om Connect snel aan te passen aan andere bedrijven. De sidebar en modules blijven generiek. De workflow bepaalt per bedrijf hoe processen, functies, modules, objecten, AI-acties en beslismomenten met elkaar verbonden zijn.

Belangrijk uitgangspunt:
De sidebar blijft zoals deze nu is opgebouwd:
- Projecten
- Opnames
- Calculaties
- Offertes
- Werkvoorbereiding
- Planning
- Uitvoering
- Commercie
- Klanten
- Organisaties
- enz.

De sidebar is navigatie naar modules.
De Workflow Designer is procesconfiguratie.

Maak de workflow veel gedetailleerder.

Per workflowkaart moet zichtbaar en instelbaar zijn:

1. Naam van de stap
Bijvoorbeeld:
- Aanvraag beoordelen
- Calculatie maken
- Offerte versturen
- Werkbegroting maken
- Materiaal bestellen
- Monteurs plannen
- Uitvoering gereedmelden
- Opleverrapport genereren

2. Betrokken gebruikersfuncties
Bijvoorbeeld:
- Commercieel medewerker
- Calculator
- Werkvoorbereider
- Planner
- Projectleider
- Monteur
- Controleur
- Financiële administratie
- Directie

3. Primaire verantwoordelijke functie
Eén hoofdverantwoordelijke per stap.

4. Gebruikte modules
Bijvoorbeeld:
- Projecten
- Gebouwen
- Opnames
- Calculaties
- Offertes
- Planning
- Uitvoering
- Factuurverwerking
- DMS
- HRM
- Wagenpark

5. Objecten die worden gebruikt
Bijvoorbeeld:
- Klant
- Organisatie
- Gebouw
- Project
- Opname
- Calculatie
- Offerte
- Werkbegroting
- Planning
- Spot
- Factuur
- Opleverrapport

6. Objecten die worden aangemaakt of gewijzigd
Bijvoorbeeld:
- Nieuwe offerte
- Nieuwe opdracht
- Werkbegroting
- Planningstaak
- Bestellijst
- Rapport
- Factuurvoorstel

7. AI-acties
Bijvoorbeeld:
- AI leest
- AI classificeert
- AI koppelt
- AI controleert
- AI stelt voor
- AI maakt concept
- AI signaleert risico
- AI vraagt menselijk akkoord

8. Beslismomenten
Beslissingen moeten regels kunnen bevatten, bijvoorbeeld:
- Als marge < 12%, dan directie akkoord verplicht
- Als bedrag > €25.000, dan extra controle
- Als AI confidence < 90%, dan mens akkoord nodig
- Als factuur niet matcht met inkoopbon, dan terug naar administratie
- Als afwijking op uitvoering, dan projectleider akkoord nodig

9. Vervolgacties
Per keuze moet zichtbaar zijn:
- Ga door naar volgende stap
- Stuur terug naar vorige stap
- Start andere workflow
- Maak taak aan
- Maak document aan
- Verstuur e-mailconcept
- Zet klaar voor akkoord
- Archiveer
- Escaleer naar functie

10. Impact op andere workflows
Toon per stap welke andere workflows worden beïnvloed.

Voorbeeld:
Stap: Offerte akkoord

Start automatisch:
- Workflow “Van opdracht naar uitvoering”

Beïnvloedt:
- Werkbegroting
- Planning
- Materiaalbehoefte
- Financiële administratie
- Projectdashboard

11. Weergave per functie
Voeg een filter toe waarmee de workflow kan worden bekeken vanuit één gebruikersfunctie.

Voorbeelden:
- Toon workflow als Calculator
- Toon workflow als Werkvoorbereider
- Toon workflow als Projectleider
- Toon workflow als Monteur
- Toon workflow als Administratie
- Toon workflow als Directie

In deze functie-weergave ziet de gebruiker alleen:
- stappen waar deze functie bij betrokken is
- taken die deze functie moet uitvoeren
- beslissingen die deze functie moet nemen
- overdrachten van en naar andere functies

12. Weergave per module
Voeg ook een filter toe:
- Toon alles wat Calculaties raakt
- Toon alles wat Offertes raakt
- Toon alles wat Planning raakt
- Toon alles wat Factuurverwerking raakt
- Toon alles wat Opleverrapportage raakt

13. Weergave per object
Voeg later of als basis alvast structuur toe voor:
- Levenscyclus van een Offerte
- Levenscyclus van een Project
- Levenscyclus van een Factuur
- Levenscyclus van een Opleverrapport

14. Templates per bedrijfstype
Maak workflows later templatebaar.

Voorbeelden:
- Brandpreventiebedrijf
- Bouwbedrijf
- Onderhoudsbedrijf
- Installatiebedrijf
- Adviesbureau
- Serviceorganisatie

Een template bevat:
- standaard workflows
- standaard functies
- standaard beslisregels
- standaard AI-acties
- standaard modules
- standaard objectkoppelingen

15. Tenant/company-specifieke configuratie
Zorg dat workflows per bedrijf kunnen verschillen zonder dat de broncode aangepast hoeft te worden.

Een ander bedrijf moet dus eigen workflows kunnen hebben:
- andere afdelingen
- andere functienamen
- andere volgorde
- andere akkoordregels
- andere modules
- andere AI-acties
- andere rapportages

16. Impactanalyse bij wijziging
Wanneer een beheerder een kaart wijzigt, verplaatst of verwijdert, toon een waarschuwing:

“Deze wijziging beïnvloedt:
- Planning
- Offerteproces
- Werkbegroting
- Factuurverwerking
- Projectdashboard”

Bij verwijderen van een stap:
Controleer of andere workflows, modules of objecten afhankelijk zijn van deze stap.

17. Geen losse tekenapp
De Workflow Designer mag geen losse proces-tekenaar zijn.
De kaarten moeten echte Connect-acties, modules, rollen en objecten aansturen.

18. Eerste werkende versie
Bouw eerst:
- workflowkaarten met extra detailpaneel
- rollen/functies per kaart
- modules per kaart
- objecten per kaart
- AI-acties per kaart
- beslisregels per kaart
- gekoppelde vervolgacties
- filter “toon per functie”
- filter “toon per module”
- eenvoudige impactweergave
- opslaan per workflow

Doel van de eerste versie:
Niet perfect automatiseren, maar zichtbaar maken hoe functies, modules, objecten, AI en workflows met elkaar samenhangen.

Gebruik bestaande styling, maar maak de workflow inhoudelijk veel rijker en configureerbaar.
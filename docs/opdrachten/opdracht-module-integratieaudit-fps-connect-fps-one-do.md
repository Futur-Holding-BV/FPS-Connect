# OPDRACHT – Module-integratieaudit FPS Connect / FPS One

## Doel

Voer een gerichte module-integratieaudit uit op FPS Connect / FPS One.

Deze audit moet vaststellen welke modules daadwerkelijk functioneel zijn, welke modules alleen gedeeltelijk gekoppeld zijn, welke modules vooral uit lege schermen/scaffolding bestaan en welke modules niet goed samenwerken met de rest van Connect.

Er mogen GEEN wijzigingen worden uitgevoerd aan code, database, configuratie, routes, bestanden of infrastructuur.

Deze opdracht is uitsluitend bedoeld voor analyse en rapportage.

---

# 1. Scope

Controleer alle zichtbare modules, menu-items, pagina’s, routes, database-tabellen en workflows binnen FPS Connect / FPS One.

Neem minimaal de volgende domeinen mee:

- Projecten & Uitvoering
- Calculatie
- Offertes
- Werkvoorbereiding
- Opdrachten
- Regiewerk
- Planning
- Onderhoud
- Documenten / DMS
- Slim Uploaden
- Inkoop
- Magazijn
- Leveranciers
- Artikelen
- Veiligheid
- HRM / Personeel
- Urenregistratie
- Loon / Salaris
- Financieel
- Facturen
- AccountView
- CRM / Commercie
- Communicatie
- Werk Inbox
- Berichten
- FPS One
- Instellingen & Beheer

---

# 2. Per module controleren

Controleer per module:

## 2.1 Frontend

- Bestaat er een zichtbare pagina?
- Is de pagina volledig functioneel of vooral leeg/scaffold?
- Bevat de pagina echte data of mockdata?
- Worden API-hooks gebruikt?
- Worden formulieren daadwerkelijk opgeslagen?
- Zijn knoppen functioneel?
- Zijn navigatielinks correct?
- Zijn er “coming soon”, placeholder of demo-onderdelen aanwezig?

## 2.2 Backend

- Bestaan er backendroutes?
- Zijn routes gekoppeld aan OpenAPI?
- Zijn routes beveiligd met requireAuth / requireBevoegdheid?
- Worden routes daadwerkelijk aangeroepen vanuit de frontend?
- Zijn routes volledig geïmplementeerd of alleen stub/scaffold?
- Wordt data echt gelezen en geschreven?

## 2.3 Database

- Zijn er database-tabellen voor deze module?
- Worden deze tabellen actief gebruikt?
- Zijn er tabellen zonder duidelijke usage?
- Zijn relaties met andere domeinen aanwezig?
- Zijn foreign keys en logische koppelingen aanwezig?
- Worden records gekoppeld aan werkgever, gebouw, project, gebruiker of document waar nodig?

## 2.4 Workflow

Controleer of de module samenwerkt met relevante andere modules.

Bijvoorbeeld:

- Calculatie → Offerte → Opdracht → Werkvoorbereiding → Uitvoering → Oplevering
- Project → Documenten → Planning → Uren → Financieel
- Slim Uploaden → Documenten → Project / Leverancier / HRM / Financieel
- HRM → Uren → Loon → Salarisoutput
- Inkoop → Magazijn → Projectmateriaal → Werkvoorbereiding
- Veiligheid → Project / Medewerker / Incident / PBM
- CRM → Projectkans → Offerte → Project
- Facturen → AccountView → Exportlog

Geef per workflow aan:

- volledig werkend
- gedeeltelijk werkend
- visueel aanwezig maar technisch niet gekoppeld
- ontbrekend
- foutgevoelig

---

# 3. Lege of zwakke modules opsporen

Maak expliciet inzichtelijk:

- lege mappen
- ongebruikte pagina’s
- ongebruikte componenten
- ongebruikte routes
- ongebruikte database-tabellen
- menu-items zonder echte functionaliteit
- pagina’s met alleen placeholdertekst
- modules met alleen frontend maar geen backend
- modules met backend maar geen frontend
- modules met database maar zonder workflow
- modules die niet gekoppeld zijn aan rechtenstructuur
- modules die niet gekoppeld zijn aan auditlog
- modules die niet gekoppeld zijn aan documenten waar dat wel logisch is

---

# 4. Module-volwassenheidsscore

Geef iedere module een score van 0 t/m 5:

0 = bestaat alleen in menu of naam  
1 = visueel scherm aanwezig, vrijwel geen echte werking  
2 = basiswerking aanwezig, maar weinig integratie  
3 = functioneel bruikbaar, maar nog gaten in workflow  
4 = goed geïntegreerd en bruikbaar  
5 = volwassen, stabiel en volledig gekoppeld aan relevante domeinen

Rapporteer per module:

- score
- korte onderbouwing
- belangrijkste ontbrekende koppelingen
- grootste risico
- aanbevolen vervolgstap

---

# 5. Integratiematrix

Maak een integratiematrix waarin zichtbaar wordt welke domeinen technisch met elkaar communiceren.

Gebruik bijvoorbeeld:

- Projecten
- Documenten
- Calculatie
- Offertes
- Opdrachten
- Werkvoorbereiding
- Planning
- Uren
- HRM
- Loon
- Financieel
- Inkoop
- Magazijn
- Veiligheid
- CRM
- Communicatie
- FPS One

Geef per koppeling aan:

- Geen koppeling
- Alleen visuele/navigatiekoppeling
- API-koppeling
- Databasekoppeling
- Volledige workflowkoppeling

---

# 6. Kritieke bedrijfsprocessen controleren

Controleer specifiek of de volgende bedrijfsprocessen end-to-end werken:

## 6.1 Projectproces

Aanvraag / kans  
→ gebouw / project  
→ opname  
→ calculatie  
→ offerte  
→ opdracht  
→ werkvoorbereiding  
→ planning  
→ uitvoering  
→ oplevering  
→ onderhoud  
→ financieel

## 6.2 Documentproces

Upload  
→ herkenning  
→ classificatie  
→ voorstel  
→ opslag  
→ koppeling aan project / leverancier / medewerker / financieel  
→ zoekindex  
→ hergebruik in workflow

## 6.3 Financieel proces

Factuur / inkoopfactuur  
→ beoordeling  
→ projectkoppeling  
→ kostenplaats  
→ export naar AccountView  
→ exportlog  
→ rapportage

## 6.4 HRM-proces

Medewerker  
→ contract  
→ documenten  
→ opleidingen  
→ verlof  
→ uren  
→ loonmutaties  
→ salarisoutput  
→ archief

## 6.5 Inkoop- en magazijnproces

Werkvoorbereiding  
→ materiaallijst  
→ inkoopplanning  
→ leverancier  
→ bestelling  
→ ontvangst  
→ voorraad  
→ reservering project  
→ uitgifte monteur  
→ retour / verbruik

## 6.6 Veiligheidsproces

Project / medewerker  
→ LMRA  
→ toolbox  
→ PBM-controle  
→ melding  
→ incident  
→ opvolging  
→ rapportage

Geef per proces aan:

- werkt volledig
- werkt gedeeltelijk
- bestaat alleen visueel
- ontbrekende schakels
- grootste risico

---

# 7. Resultaatindeling

Lever het rapport op in Markdown met deze hoofdstukken:

1. Managementsamenvatting
2. Overzicht module-volwassenheid
3. Tabel met alle modules en scores
4. Overzicht lege/scaffold-modules
5. Overzicht niet-gebruikte routes
6. Overzicht niet-gebruikte database-tabellen
7. Overzicht niet-gebruikte frontendpagina’s
8. Integratiematrix
9. Analyse kritieke bedrijfsprocessen
10. Belangrijkste gaten in de applicatie
11. Modules die behouden kunnen blijven
12. Modules die opgeschoond moeten worden
13. Modules die opnieuw ontworpen moeten worden
14. Prioriteitenlijst
15. Eindconclusie

---

# 8. Prioriteitenlijst

Sluit af met een prioriteitenlijst:

## Hoog

Onderdelen die de betrouwbaarheid of verdere ontwikkeling direct blokkeren.

## Middel

Onderdelen die nodig zijn voor betere samenhang, maar niet direct blokkeren.

## Laag

Opschoning, UX-verbetering of latere verfijning.

---

# 9. Randvoorwaarden

- Geen code wijzigen.
- Geen bestanden verwijderen.
- Geen nieuwe functionaliteit bouwen.
- Geen refactoring uitvoeren.
- Geen database wijzigen.
- Geen routes aanpassen.
- Geen packages installeren.
- Geen AI-prompts aanpassen.
- Alleen analyseren en rapporteren.
- Baseer conclusies op daadwerkelijke code, routes, databasegebruik en frontendkoppelingen.
- Maak expliciet onderscheid tussen “zichtbaar in menu” en “echt functioneel werkend”.

---

# 10. Eindvraag

Beantwoord aan het einde expliciet:

Welke modules zijn op dit moment echt bruikbaar?

Welke modules bestaan vooral visueel?

Welke modules zijn technisch aanwezig maar niet goed geïntegreerd?

Welke modules blokkeren verdere groei van Connect?

Welke modules moeten eerst worden aangepakt voordat we de domeinarchitectuur gaan herstructureren?
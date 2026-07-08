# Adaptive Workspace Engine — vastgelegd, geparkeerd (NIET bouwen vóór V1.5/DDS klaar)

Vastgelegd op verzoek van de gebruiker als los, nieuw initiatief náást de bestaande roadmap. **Expliciete volgorde-afspraak van de gebruiker:** dit wordt pas opgepakt nadat de huidige actieve, al lopende roadmap-opdrachten (V1.5 Rapportenmodule, Document Design System) zijn afgerond — niet ertussendoor of ervoor. Op 8 juli 2026 is expliciet bevestigd (via vraag aan de gebruiker) dat deze volgorde-afspraak blijft staan: V1.5 en DDS hebben beide nog open restscope, dus dit initiatief blijft geparkeerd tot die twee zijn afgerond.

## Wat & waarom

Eén centrale engine die FPS Connect geleidelijk laat aanpassen aan de werkstijl van elke gebruiker, puur op basis van daadwerkelijk gebruik binnen Connect (web én mobiel). De engine verzamelt gebruikspatronen (geopende modules, volgorde van schermen, veelgebruikte menu's/zoekopdrachten/filters/knoppen, AI-voorstellen geaccepteerd/aangepast/afgewezen, hoofdstukken open/dicht, favorieten, veelgeopende documenten, workflows) en voert één keer per maand een lichte, corrigerende optimalisatie uit op de presentatie van de interface. Geen persoonlijkheidsanalyse, geen DISC-profiel, geen HR-beoordeling — uitsluitend hoe iemand het ERP gebruikt.

Slechts één generieke engine die alle huidige en toekomstige modules bedient (later ook Outlook, tablet, DMS, Wagenpark, Planning, Calculatie, Rapportages), niet losse implementaties per scherm.

## Kritieke randvoorwaarde (hard vereist)

De engine mag uitsluitend presentatie en volgorde in de UI aanpassen. Ze mag NOOIT automatisch wijzigen: fysieke/logische documentmappen, DMS-structuur, database-relaties, document-ID's, projectkoppelingen, workflowstatussen, rechten/autorisaties, API-routes, rapporttemplates of opslaglocaties. Elke verwijzing naar een document/project/hoofdstuk/actie moet via vaste ID's blijven werken, nooit via schermvolgorde of mapnaam.

Vóór implementatie moet de executor expliciete safety-checks inbouwen:
1. Geen migratie/wijziging aan bestaande tabellen zonder expliciete toestemming — nieuwe, aparte tabellen voor de engine zelf mogen wel.
2. Geen wijziging aan DMS-opslagstructuur.
3. Geen wijziging aan autorisatie.
4. Geen verwijdering/hernoeming van bestaande routes.
5. Een regressiecheck op bestaande navigatie en kernflows na iedere maandelijkse run.

## Done looks like

- Eén centrale Adaptive Workspace Engine (backend-service + datamodel) verzamelt gebruiksgebeurtenissen vanuit zowel de webapp als de monteur-app.
- Eén keer per maand — niet dagelijks, niet wekelijks — past de engine per gebruiker een beperkte set UI-voorkeuren aan: volgorde dashboardwidgets, volgorde/open-status hoofdstukken, prominentie van snelkoppelingen/favoriete modules, standaardfilters, compacte/uitgebreide weergave, hoeveelheid AI-uitleg.
- Na een maandelijkse run ziet de gebruiker uitsluitend de korte melding "Je werkruimte is op basis van jouw gebruik licht geoptimaliseerd." — geen vragen, geen bevestigingen, geen instellingenscherm.
- De engine leert corrigerend: elke maand wordt het effect van de vorige optimalisatie beoordeeld en de aanpassing behouden, bijgesteld of teruggedraaid.
- Handmatige herschikking door de gebruiker (bestaande sleep-functionaliteit) blijft altijd leidend boven een automatische aanpassing.
- Niets aan routes, rechten, workflowstatussen, documentkoppelingen, DMS-structuur of opslaglocaties verandert ooit automatisch — dit is aantoonbaar (regressiecheck) na elke run.
- Het datamodel is zo opgezet dat gebruiksgegevens per gebruiker later opgenomen kunnen worden in een AVG-inzage-/verwijderverzoek, ook al bouwt dit plan dat scherm zelf niet.

## Out of scope

- Wijzigen van autorisaties, rechten, bedrijfsprocessen, verplichte workflowstappen, goedkeuringsprocessen, veiligheidswaarschuwingen of bedrijfsstructuur.
- Elke migratie of structuurwijziging aan bestaande entiteiten (documenten, projecten, DMS, gebouwen) — alleen nieuwe, aparte tabellen voor de engine zelf.
- Het daadwerkelijke AVG-inzage-/verwijderscherm bouwen — dit plan zorgt alleen dat het datamodel er klaar voor is.
- Persoonlijkheids-/DISC-profielen, HR-beoordelingen, of enige koppeling naar personeelsbeoordeling.
- Uitbreiding naar Outlook-integratie, tablet-specifieke layouts, of module-specifieke optimalisaties voor DMS/Wagenpark/Planning/Calculatie/Rapportages — die volgen later op basis van dezelfde generieke engine.
- Starten vóórdat de huidige actieve roadmap-opdrachten (V1.5 Rapportenmodule / Document Design System) zijn afgerond.

## Stappenplan (uit te voeren zodra V1.5/DDS klaar zijn én formeel akkoord is gegeven)

1. **Datamodel & privacy-fundament** — nieuwe, aparte tabellen voor gebruiksgebeurtenissen en per-gebruiker workspace-voorkeuren, gekoppeld aan `gebruiker_id` en vaste entiteit-ID's (nooit URL/pad/mapnaam als sleutel). Ontwerp zodat records later eenvoudig geëxporteerd/verwijderd kunnen worden per gebruiker.
2. **Backend event-ingestie** — één generiek endpoint (of kleine set) waarop web én mobiel gebeurtenissen loggen, met batching/throttling.
3. **Maandelijkse optimalisatie-job** — achtergrondtaak (vergelijkbaar patroon als de bestaande dagelijkse back-uptaak in `artifacts/api-server/src/lib/backupService.ts`) die per gebruiker patronen analyseert en een beperkte, vooraf toegestane set UI-voorkeuren bijwerkt, met onderbouwing gelogd.
4. **Zelflerende terugkoppelingslus** — elke volgende run beoordeelt eerst het effect van de vorige optimalisatie en behoudt/bijstelt/draait terug op basis van dat effect.
5. **Veiligheidswaarborgen technisch afdwingen** — expliciete allow-list van wat de job mag aanraken + geautomatiseerde regressiecheck na elke run.
6. **Web-integratie** — dashboard-widgetvolgorde, sidebar-hoofdstukken (`useSidebarHoofdstukken`, `HerschikbaarHoofdstuk`), zoekopdrachten, filters, AI-voorstel-acties sturen gebeurtenissen en lezen engine-voorkeuren als standaardwaarde. Handmatige herschikking overschrijft altijd de automatische volgorde.
7. **Mobiele integratie (monteur-app)** — vergelijkbare gebeurtenissen via de bestaande offline/sync-laag naar dezelfde backend-engine.
8. **Notificatie** — vaste, korte melding na een maandelijkse run, zonder vragen/bevestigingen/instellingenscherm.

## Relevant files (voor de toekomstige uitvoerder)

- `artifacts/firevault/src/pages/dashboard/beheerder.tsx` — dashboard-widgetvolgorde/definities
- `artifacts/firevault/src/layouts/beheerder-layout.tsx` — `useSidebarHoofdstukken`, module-zichtbaarheid
- `artifacts/firevault/src/components/ui/herschikbaar-hoofdstuk.tsx` — bestaande handmatige drag-and-drop herschikking (blijft leidend)
- `artifacts/api-server/src/lib/activiteit.ts` — bestaand activiteitenlog-patroon (`logActiviteit`)
- `artifacts/api-server/src/lib/backupService.ts` — bestaand patroon voor een periodieke achtergrondtaak
- `lib/db/src/schema/index.ts` — waar een nieuw `adaptive-workspace`-schemabestand aangehaakt wordt
- `lib/permissies/src/index.ts` — module-/bevoegdhedenlijst (geen wijziging aan autorisatie, alleen ter referentie)
- `artifacts/monteur-app/app/_layout.tsx`, `artifacts/monteur-app/lib/syncQueue.ts`, `artifacts/monteur-app/lib/offlineCache.ts` — mobiele event-verzending via bestaande sync-laag

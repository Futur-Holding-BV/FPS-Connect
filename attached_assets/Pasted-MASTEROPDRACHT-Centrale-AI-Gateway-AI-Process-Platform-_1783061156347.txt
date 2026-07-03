MASTEROPDRACHT – Centrale AI Gateway & AI Process Platform

Doel:
Breng alle bestaande AI-functionaliteit in FPS Connect onder één centrale AI-infrastructuur, zodat de applicatie geschikt wordt voor kantoor/productiegebruik.

Belangrijk:
- Bouw door volgens onderstaande fasen.
- Sluit elke fase af met een kort rapport.
- Ga daarna automatisch door naar de volgende fase.
- Stop alleen als er een architectuurconflict, regressierisico of dataverliesrisico ontstaat.
- Verander het functionele gedrag van bestaande modules niet, tenzij expliciet nodig voor centralisatie.
- Geen nieuwe eindgebruikersfunctionaliteit bouwen.
- Geen nieuwe losse AI-modules bouwen.
- Geen bestaande prompts inhoudelijk verbeteren, tenzij noodzakelijk om ze te verplaatsen.
- Geen workflowbeslissingen autonoom door AI laten uitvoeren.

FASE 1 – AI-inventarisatie actualiseren

Controleer opnieuw de bestaande AI-implementatie.

Rapporteer:
1. Alle AI-call-sites.
2. Gebruikte modellen.
3. Gebruikte prompts.
4. Directe OpenAI-aanroepen.
5. Service-gebaseerde AI-aanroepen.
6. Route-gebaseerde AI-aanroepen.
7. Modules zonder logging.
8. Modules met fire-and-forget AI.
9. Risico’s voor kantoor/productiegebruik.

Rapport 1:
- gewijzigde bestanden: geen;
- actuele risico’s;
- migratievolgorde.

FASE 2 – Centrale AiGatewayService bouwen

Bouw één centrale AiGatewayService.

Eisen:
1. Gebruik de bestaande OpenAI-factory als onderliggende client.
2. Ondersteun chat/completion-aanroepen via één centrale service.
3. Voeg centrale timeout toe.
4. Voeg centrale retry-policy toe.
5. Voeg centrale foutafhandeling toe.
6. Voeg model registry toe met slots, bijvoorbeeld:
   - default
   - fast
   - reasoning
   - vision
   - embedding
7. Modelnamen mogen daarna niet meer verspreid in modules staan.
8. Gateway moet later provider-onafhankelijk kunnen worden uitgebreid richting Azure AI / Microsoft Foundry, Anthropic of Gemini.

Niet doen:
- Geen prompts herschrijven.
- Geen AI-gedrag wijzigen.
- Geen workflowlogica toevoegen.

Rapport 2:
- nieuwe bestanden;
- gewijzigde bestanden;
- model registry;
- foutafhandeling;
- resterende risico’s.

FASE 3 – Alle bestaande AI-aanroepen migreren naar AiGatewayService

Migreer alle AI-aanroepen.

Eis:
Geen enkele module mag nog rechtstreeks:
- maakOpenAiClient()
- client.chat.completions.create()
- OpenAI SDK calls

aanroepen buiten de AiGatewayService.

Migreer minimaal:
- document-ai
- spot-ai
- gebouw-ai
- opleiding-ai
- email-ai
- slim-upload
- offertes
- calculaties
- werkvoorbereiding
- planning
- veiligheid
- toolbox
- hrm
- crm
- magazijn
- facturen
- inbox
- pbm
- gereedschappen
- materiaal-aanvragen
- contract-bewaking
- rapporten
- organisatie
- overige gevonden call-sites

Gedrag moet functioneel gelijk blijven.

Rapport 3:
1. Aantal oorspronkelijke AI-call-sites.
2. Aantal gemigreerde call-sites.
3. Eventuele resterende directe calls met reden.
4. Testresultaten.
5. Regressierisico’s.

FASE 4 – AI-aanroeplogging en kostenregistratie

Voeg centrale AI-logging toe via de gateway.

Leg minimaal vast:
- module
- functie
- gebruiker_id indien beschikbaar
- entiteitstype
- entiteit_id
- modelslot
- werkelijk model
- prompt_tokens
- completion_tokens
- total_tokens
- geschatte kosten
- duur_ms
- status
- foutmelding indien aanwezig
- timestamp

Privacy:
- Sla geen volledige prompttekst op.
- Sla alleen prompt_hash en korte prompt_samenvatting op indien beschikbaar.
- Sla geen gevoelige HRM- of contractinhoud volledig op.

Rapport 4:
- databasemigratie;
- loggingvelden;
- privacymaatregelen;
- voorbeeldrecord;
- impact op performance.

FASE 5 – Prompt Registry voorbereiden

Centraliseer prompts zonder inhoudelijk gedrag te wijzigen.

Eisen:
1. Elke prompt krijgt een naam.
2. Elke prompt krijgt een versie.
3. Elke prompt krijgt een module/domein.
4. Elke prompt blijft inhoudelijk gelijk, tenzij technische verplaatsing kleine aanpassing vereist.
5. Gateway-log registreert promptnaam en promptversie.

Niet doen:
- Geen promptoptimalisatie.
- Geen nieuwe AI-beslislogica.

Rapport 5:
- aantal geregistreerde prompts;
- prompts per module;
- resterende inline prompts;
- reden indien inline prompt tijdelijk blijft staan.

FASE 6 – Workflow-context voorbereiden

Maak de AiGateway geschikt om workflowcontext mee te krijgen.

Nog geen AI Process Orchestrator bouwen.

Ondersteun optionele contextvelden:
- workflow_type
- workflow_status
- project_id
- gebouw_id
- klant_id
- offerte_id
- calculatie_id
- document_id
- voorziening_id
- medewerker_id
- planning_item_id
- bron_documenten
- bron_entiteiten

Doel:
AI-aanroepen kunnen vanaf nu worden gekoppeld aan de juiste bedrijfscontext en later gebruikt worden door de AI Process Orchestrator.

Rapport 6:
- beschikbare contextvelden;
- welke modules al context meegeven;
- welke modules nog geen context meegeven;
- advies voor vervolg.

FASE 7 – AI Process Orchestrator ontwerpvoorbereiding

Bouw nog geen volledige autonome AI-regisseur.

Maak wel de technische voorbereiding:

1. Definieer interface AiProcessRequest.
2. Definieer interface AiProcessResult.
3. Definieer statussen:
   - voorstel
   - wacht_op_gebruiker
   - akkoord
   - afgewezen
   - uitgevoerd
   - fout
4. Leg vast dat AI nooit zelfstandig definitieve besluiten neemt zonder bevoegd menselijk akkoord.
5. Koppel dit conceptueel aan:
   - Workflow Engine
   - RBAC
   - Audit Trail
   - Documenten-inbox
   - AI-logboek

Rapport 7:
- interfaces;
- veiligheidsgrenzen;
- benodigde vervolgimplementatie;
- welke modules als eerste geschikt zijn voor orchestrator-integratie.

FASE 8 – Validatie en regressiecontrole

Voer volledige validatie uit.

Controleer:
1. Applicatie compileert.
2. Applicatie start.
3. Bestaande tests draaien.
4. Geen directe OpenAI-calls buiten gateway.
5. Geen hardcoded modelnamen buiten model registry.
6. AI-logging werkt.
7. Kostenregistratie werkt.
8. Timeouts werken.
9. Fouten worden centraal afgehandeld.
10. Bestaande AI-functionaliteit werkt functioneel gelijk.
11. Geen regressie in primaire workflows:
    - inloggen
    - gebouwen
    - projecten
    - documenten
    - calculatie
    - offerte
    - werkvoorbereiding
    - planning
    - uitvoering
    - oplevering
    - onderhoud
    - HRM
    - veiligheid

Eindrapport:
- wat is gebouwd;
- wat is gemigreerd;
- wat is bewust niet gewijzigd;
- resterende risico’s;
- resterende directe AI-calls;
- resterende inline prompts;
- testresultaten;
- advies of deze AI Gateway geschikt is voor kantoor/productiegebruik.

Belangrijke eindregel:
Deze opdracht is geslaagd wanneer alle bestaande AI-functionaliteit centraal via de AiGatewayService loopt, logging en kostenregistratie aanwezig zijn, en het bestaande functionele gedrag van Connect niet is verslechterd.
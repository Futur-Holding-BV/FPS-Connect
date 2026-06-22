Design and build a professional but simple CRM module for FPS Connect.

Module name:
CRM & Marktinzicht

Purpose:
Create a practical CRM system for FPS Bouw, FPS Brandpreventie and FPS Onderhoud that combines relationship management, project opportunities and market intelligence.

The module must not feel like a complex enterprise CRM. It must be easy to understand for daily use.

Main navigation:
CRM

Subsections:
1. Relaties
2. Organisaties
3. Contactpersonen
4. Projectkansen
5. Marktkaart
6. Concurrentiebeeld
7. AI-inzichten

Core entities:

Organisation:
- name
- type: woningcorporatie, VvE beheerder, aannemer, installateur, vastgoedbeheerder, adviseur, gemeente, zorginstelling, onderwijsinstelling, concurrent, leverancier
- website
- LinkedIn URL
- address
- region
- notes
- relationship status: unknown, cold, warm, active, key account, lost
- preferred FPS company: FPS Bouw, FPS Brandpreventie, FPS Onderhoud
- linked buildings
- linked projects
- linked contacts
- linked competitors

Contact person:
- name
- role/function
- organisation
- email
- phone
- LinkedIn URL
- decision role: decision maker, influencer, buyer, technical advisor, project manager, unknown
- relationship strength: unknown, weak, normal, strong
- notes
- last contact date
- next action

Opportunity:
- organisation
- building/project
- opportunity type: opname, calculatie, offerte, onderhoudscontract, brandpreventie, bouwkundig herstel, RGA, droge blusleiding
- estimated value
- probability
- phase: signal, first contact, appointment, calculation, offer, negotiation, won, lost
- expected date
- responsible person
- competitors involved
- next action
- AI summary

Market intelligence:
Allow the user to manually add or AI-enrich public information about:
- recent projects
- public tenders
- LinkedIn company activity
- website updates
- news articles
- relationships between organisations
- known advisors, contractors, installers and housing corporations
- regions where competitors appear active

Important:
Do not scrape LinkedIn automatically in a way that violates platform rules.
Instead, allow storing LinkedIn URLs and manually copied public information.
Prepare the architecture so future compliant integrations can be added.

AI functions:
Create AI support that can:
- summarize an organisation
- identify possible opportunities
- suggest which FPS company should approach the relation
- identify decision makers and influencers from entered data
- detect links between organisations
- detect recurring competitors
- summarize competitor activity by region
- suggest next commercial action
- create a short account plan

Competitor view:
Create a clear competitor profile page:
- competitor name
- website
- LinkedIn URL
- region
- known clients
- known project types
- known partners
- strengths
- weaknesses
- where we encounter them
- notes
- AI summary

Market map:
Create a visual map/list view showing:
- organisations by region
- active clients
- warm prospects
- cold prospects
- competitors
- known project locations
- buildings connected to organisations

Keep the first version simple:
- table/list views
- detail pages
- filters
- search
- relation graph view if feasible, otherwise prepare data structure for it
- no complex dashboards in v1

CRM dashboard:
Show:
- open opportunities
- next actions
- warm prospects
- key accounts
- lost opportunities
- competitors most often encountered
- organisations with no recent contact
- potential maintenance contract opportunities

Data model requirements:
The CRM must connect with existing FPS Connect modules:
- Buildings
- Projects
- Opnames
- Calculaties
- Offertes
- Uitvoering
- Onderhoud

A building must be able to link to:
- owner
- user/tenant
- property manager
- advisor
- contractor
- installer
- competitors involved
- opportunities
- maintenance contract

Design principles:
- professional
- calm
- simple
- no overloaded sales funnel visuals
- no gamified CRM
- no unnecessary fields
- Dutch interface
- mobile-friendly enough for quick lookup
- desktop-first for office use

Build v1 with mock data first:
Include examples:
- woningcorporatie
- installateur
- aannemer
- VvE beheerder
- concurrent
- adviseur
- onderhoudskans
- brandpreventiekans

After building:
Run typecheck.
Verify all pages render.
Verify CRM links to existing building/project data where possible.
Provide a short status report with what works, what is mock data, and what still needs backend/data integration.
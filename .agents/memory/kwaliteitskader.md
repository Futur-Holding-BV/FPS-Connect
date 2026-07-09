---
name: Kwaliteitskader (Definition of Done)
description: Verplicht Kwaliteits-, Validatie- en Uitvoeringskader — wanneer een taak gereed is; bewijsvoering en business-scenario-validatie verplicht.
---

# Kwaliteitskader — verplicht referentiedocument

Volledige tekst: `docs/kwaliteitskader.md` (vastgesteld door de platformeigenaar, juli 2026).

**De regel:** een taak is pas gereed wanneer het volledige bedrijfsproces aantoonbaar correct functioneert. Build/typecheck/lint/audit zijn noodzakelijk maar NOOIT voldoende.

**Why:** FPS Connect is bedrijfskritisch; de gebruiker mag nooit de eerste tester zijn. Eerdere incidenten (o.a. stilzwijgend genegeerd wachtwoordveld) toonden dat technisch groene checks businessfouten doorlaten.

**How to apply:**
- Vier validatieniveaus: 1 codekwaliteit, 2 architectuur (security/rollen/API/datamodel/AVG), 3 integratie (hele keten frontend→API→logic→DB→response), 4 business-scenario zoals een eindgebruiker het gebruikt — niveau 4 is doorslaggevend.
- Bewijsvoering verplicht: conclusies alleen op aantoonbaar bewijs (requests, responses, DB-resultaten, logs, screenshots, testresultaten); ontbrekend bewijs expliciet melden. Zie ook `docs/diagnose-methodologie.md`.
- Root-cause eerst: bij fouten eerst exact vaststellen waar de keten stopt, dan pas fixen.
- Regressie op eindgebruikersniveau, niet alleen unit/component.
- Autonoom doorwerken binnen scope tot root cause opgelost + businessscenario groen + bewijs geleverd; alleen rapporteren is nooit voldoende.
- Nooit zelfstandig naar productie publiceren; uitrol vereist expliciete goedkeuring.

**Rolverdeling docs:** ontwikkelfilosofie = wat/waarom bouwen; kwaliteitscontrole = controlescript; kwaliteitskader = wanneer gereed (DoD).

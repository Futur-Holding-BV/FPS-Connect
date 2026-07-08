# Roadmap — Actief

Vastgelegde fasen; elk pas bouwen ná formeel akkoord op die fase. Zie [`README.md`](./README.md) voor het overzicht en [`replit.md`](../../replit.md) voor de Ontwikkelstop-regel en de drie sporen.

**V1.4 — Opleverrapportage is gebouwd.** Zie [`gebouwd.md`](./gebouwd.md) voor de volledige uitwerking (rapporttypes als sectie-presets, verfijnde spot-/cluster-/verdiepingselectie, handmatige e-mailselectie, bijlagenpakket-bundel, en de gepersisteerde `opleverrapporten`-entiteit met "definitief maken" + bevriezing, die tegelijk al een deel van V1.5 hieronder invult).

## V1.5 — Rapportenmodule (deels gebouwd via V1.4; restscope hieronder)

Doel: een centrale rapportenbibliotheek met definitieve, juridisch correcte opleverrapporten per gebouw. Bewust als kernonderdeel van het product behandeld (geen "extra wens") en met voorrang boven een bredere CRM-module.

**Al gebouwd (via de V1.4-increment, zie `gebouwd.md`):**
- Definitieve rapporten per gebouw zijn gepersisteerd (tabel `opleverrapporten`, niet meer alleen live-gegenereerd).
- Bevriezing documenten: `POST .../definitief` legt de documentrevisies van de gekoppelde bijlagen vast (`bevroren_document_revisies`); latere documentrevisies wijzigen een definitief rapport niet met terugwerkende kracht.
- Basaal versiebeheer van de rapport-status (concept → definitief, vergrendeld) en een reactietermijn-datum (configureerbaar 1–365 dagen) die bij definitief-maken wordt vastgelegd.

**Nog te bouwen (restscope V1.5):**
- Centrale rapportenbibliotheek-UI met zoek- en filterfuncties over alle gebouwen heen (de data bestaat al via `GET /rapporten`, maar er is nog geen overzichtsscherm).
- Koppelingen naar CRM, onderhoud en klantportaal.
- Volledige formele-opleverstatus-statusmachine met weergave: **Definitief verzonden → Reactietermijn loopt → Juridisch gereedgemeld/verstreken → Vervangen door nieuwe versie** (met automatische herstart van de termijn bij een nieuwe versie en logging bij gebouw/rapport). Nu is alleen de reactietermijn-datum + concept/definitief-status aanwezig; de tussenliggende statussen en de "vervangen door versie x"-weergave in de gebouwkaart → rapporten-tab ontbreken nog.

Implementatienotitie (vastgelegd voor later): de overgang naar "verstreken" kan afgeleid worden bij lezen (verzenddatum + termijn) zodat geen achtergrondworker nodig is; de logregel bij gebouw/rapport mag lui of via een dagelijkse job worden weggeschreven.

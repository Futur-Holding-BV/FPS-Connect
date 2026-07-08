# Roadmap — Actief

Vastgelegde fasen; elk pas bouwen ná formeel akkoord op die fase. Zie [`README.md`](./README.md) voor het overzicht en [`replit.md`](../../replit.md) voor de Ontwikkelstop-regel en de drie sporen.

**V1.4 — Opleverrapportage is gebouwd.** Zie [`gebouwd.md`](./gebouwd.md) voor de volledige uitwerking (rapporttypes als sectie-presets, verfijnde spot-/cluster-/verdiepingselectie, handmatige e-mailselectie, bijlagenpakket-bundel, en de gepersisteerde `opleverrapporten`-entiteit met "definitief maken" + bevriezing, die tegelijk al een deel van V1.5 hieronder invult).

## V1.5 — Rapportenmodule (deels gebouwd via V1.4; restscope hieronder)

Doel: een centrale rapportenbibliotheek met definitieve, juridisch correcte opleverrapporten per gebouw. Bewust als kernonderdeel van het product behandeld (geen "extra wens") en met voorrang boven een bredere CRM-module.

**Al gebouwd (via de V1.4-increment, zie `gebouwd.md`):**
- Definitieve rapporten per gebouw zijn gepersisteerd (tabel `opleverrapporten`, niet meer alleen live-gegenereerd).
- Bevriezing documenten: `POST .../definitief` legt de documentrevisies van de gekoppelde bijlagen vast (`bevroren_document_revisies`); latere documentrevisies wijzigen een definitief rapport niet met terugwerkende kracht.
- Basaal versiebeheer van de rapport-status (concept → definitief, vergrendeld) en een reactietermijn-datum (configureerbaar 1–365 dagen) die bij definitief-maken wordt vastgelegd.
- Centrale rapportenbibliotheek-overzichtsscherm (`/rapporten`) met statusfilter over alle gebouwen heen (nog geen vrije-tekst zoekfunctie).

**Gebouwd (8 juli 2026): reactietermijn-statusmachine.** Elk definitief rapport toont nu één van vier zichtbare statussen — **Definitief verzonden / Reactietermijn loopt / Termijn verstreken / Vervangen door nieuwe versie** — afgeleid uit de opgeslagen status + reactietermijn-datum (`weergave_status`, berekend bij lezen; geen achtergrondworker nodig). Een nieuwe definitieve versie van hetzelfde rapporttype in hetzelfde gebouw sluit de vorige automatisch af als "vervangen" (met tijdstip en verwijzing naar de nieuwe versie). Zichtbaar op zowel de gebouwkaart → rapporten-tab als de centrale rapportenbibliotheek.

**Al gebouwd (8 juli 2026 — centrale bibliotheek):**
- Rapportenbibliotheek-scherm (`/rapporten`) toont alle rapporten cross-gebouw (bestond al), nu aangevuld met zoekveld (titel/gebouw/opsteller), filter op gebouw, filter op rapporttype en een datumrange-filter, naast de bestaande statusfilter.
- Vanuit de lijst is een rapport direct te bekijken ("Bekijken" → gebouw-printpagina met het bevroren rapport via `rapport_id`) of te downloaden ("Downloaden" bij definitieve rapporten, hergebruikt de bestaande bijlagenbundel-PDF-generatie).

**Nog te bouwen (restscope V1.5):**
- Koppelingen naar CRM, onderhoud en klantportaal.

Implementatienotitie: de overgang naar "verstreken" wordt afgeleid bij lezen (reactietermijn-datum vs. nu), geen achtergrondworker.

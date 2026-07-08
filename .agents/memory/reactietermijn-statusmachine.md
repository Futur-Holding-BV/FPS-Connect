---
name: Reactietermijn-statusmachine patroon
description: Hoe afgeleide (weergave)status wordt berekend voor rapporten/documenten met een termijn, zonder achtergrondworker.
---

Voor rapporten/documenten met een reactietermijn (bijv. opleverrapporten) wordt de zichtbare status NIET los opgeslagen, maar afgeleid bij lezen uit de opgeslagen DB-status (concept/definitief/vervangen/gearchiveerd) + de termijndatum vs. `Date.now()`. Voordeel: geen cronjob/achtergrondworker nodig om statussen bij te werken, en geen kans op inconsistentie tussen opgeslagen en werkelijke status.

**Waarom:** een cronjob die statussen "verstreken" zet is een extra faalpunt (gemiste run = stale status) en vereist evenveel code als gewoon live afleiden. De opgeslagen status hoeft alleen de expliciete overgangen te bevatten (concept→definitief→vervangen/gearchiveerd); tussenliggende tijd-gebaseerde statussen (bijv. "reactietermijn loopt" vs "termijn verstreken") komen uit een pure functie op het model.

**Hoe toe te passen:** voeg een `bepaalWeergaveStatus()`-achtige helper toe in de route-mapper die de opgeslagen status + relevante datum leest en een los `weergave_status`-veld teruggeeft in de API-response (nooit de opgeslagen `status`-kolom overschrijven met een tijdelijke waarde). Frontend rendert altijd op `weergave_status`, niet op de rauwe `status`. Bij het aanmaken van een nieuwe versie van hetzelfde object (zelfde gebouw/type) wordt de vorige actieve rij expliciet naar een terminale status gezet (bijv. "vervangen") in dezelfde transactie/handler — dat is wél een echte state-transitie, geen tijd-afgeleide status.

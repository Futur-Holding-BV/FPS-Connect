---
name: ADVIES_01 regelsoorten & adviesrapport-inlezen
description: Calculatie-regelsoorten (soort/optioneel/ouder), som-filterregel op alle plekken, adviesrapport→calculatie-flow met fail-closed puntendekking.
---

**Regelsoorten:** `mod_calc_regels.soort` (regel|materiaal|tekst|stelpost|kop) + `optioneel` + `ouder_regel_id` (self-FK alleen op DB-niveau, niet in drizzle-TS). Rekenregel: alleen soort ∈ (regel, materiaal) telt mee; optioneel telt nooit in de aanneemsom maar krijgt overal een apart blok/subtotaal.
**Why:** echte FPS-calculaties bevatten tekst-/stelpost-/kopregels die bewijs vastleggen maar nooit mogen meetellen; Cityflat splitst aangeboden vs optioneel.
**How to apply:** elke NIEUWE somplek over calculatie- óf offerteregels moet filteren op meetellende soorten én `!optioneel` (helper `teltMeeRegel` in detail.tsx; offerte-kant `lib/offerte-totalen.ts` `berekenOfferteTotalen` — btw alleen over het aangeboden deel). De reviewer vond dat offerte print/studio/verzend-tab dit eerst misten: bij offerte-UI-wijzigingen altijd de helper gebruiken, nooit een rauwe reduce over alle regels.

**Adviesrapport-flow:** Slim Upload categorie `adviesrapport` → doorschakeling `calculatie-inrichten` mét document_id (server leest het gearchiveerde bestand zelf; geen File-stash zoals prijslijst). Analyse hergebruikt het CALC_INVOER-patroon (server-kandidaten, AI kiest alleen id's, fail-closed). Drie voorstelsoorten: werkzaamheden / geen_werkzaamheden (tekstregel = vastlegging) / niet_te_beoordelen (mét vraag). **Elk stap-1-punt MOET een voorstel krijgen**: ontbrekende AI-koppelingen vallen fail-closed op niet_te_beoordelen; bron-aftopping (24k tekens / 5 pagina's) geeft expliciete waarschuwing. Samengestelde nummers ("2.9/2.10/3.9") nooit opsplitsen → 1-op-1 naar `regelnummer`.
**Autorisatie-les:** een "analyse"-route met schrijf-side-effects (log + documentkoppeling) hoort op schrijfniveau, en een route die een willekeurig document_id leest moet vóór het lezen categorie + bibliotheekrecht valideren.
**document_koppelingen:** doel_type `calculatie` sinds migratie 0041; code-whitelist KOPPELING_DOEL_TYPES in lib/documenten.ts moet synchroon blijven met de DB-CHECK (liep al eerder achter: opdracht/voertuig/prijsafspraak).

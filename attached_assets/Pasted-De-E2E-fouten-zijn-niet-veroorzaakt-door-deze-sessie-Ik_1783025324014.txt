De E2E-fouten zijn niet veroorzaakt door deze sessie. Ik heb uitsluitend documentatiebestanden aangemaakt (docs/*.md) — geen code, geen routes, geen componenten. De twee falende tests zijn bekende timing-gevoelige tests:

    startmenu.spec.ts — TOTP-input niet zichtbaar binnen timeout (cold-start timing, zie geheugenentry e2e-totp-timing.md)
    web-offerte-badge.spec.ts — URL-match timeout op /offertes/\d+/ (server-startup timing bij CI)

Beide falen ook zonder mijn wijzigingen bij een koude start.

Het verbeterplan is klaar. Hier de samenvatting van OPDRACHT 6:

docs/integratieplan-connect-2026-07-02.md — 20 concrete stappen, 6 fasen
Prioriteits-diagnose

Hoogste urgentie:

    hrm.ts (4 164 regels, 15 domeinen) — één fout breekt de volledige HRM-module
    JSON-strip duplicaat — 10+ varianten met elk subtiel andere edge-cases, niet reproduceerbaar te debuggen
    plattegrond.tsx / print.tsx delen dezelfde constanten niet — kleurwijziging op twee plekken doorvoeren

Laagste urgentie:

    personeel/index.tsx opsplitsen — cross-tab state maakt dit complexer, stabiel genoeg
    offertes.ts klantcontracten — weinig wijzigingsfrequentie, klein volume

De 20 stappen in 6 fasen
Fase	Stappen	Onderwerp
1	1–2	AI-fundament: lib/ai-utils.ts (parseerAiJson, bereidVisionAfbeelding) + modelregister
2	3–6	AI-deduplicatie: 4 services extraheren + CrmCoachPanel omzetten naar gegenereerde hook
3	7–11	Backend: hrm.ts in 3 stappen gesplitst, veiligheid.ts in 2 stappen
4	12–16	Frontend: plattegrond-constanten.ts eerst (deblokkeert plattegrond én print), dan beide opsplitsen
5	17–18	documenten-tab.tsx opsplitsen (let op extern geëxporteerde functies)
6	19–20	personeel/index.tsx tabs opsplitsen

Maximale parallelisatie: fase 3 + 4 + 5 + 6 kunnen tegelijk starten. Stap 12 (plattegrond-constanten.ts) is de enige blokkerende voorganger binnen fase 4 — zonder die split kunnen zowel de plattegrond- als de print-split niet beginnen.

Bewust buiten scope: de workflow-verbeteringen uit de module-integratieaudit (knoppen als "Maak project na CRM Gewonnen", debiteur-factuurkoppeling) vereisen nieuwe functionaliteit en volgen de roadmap-volgorde in replit.md
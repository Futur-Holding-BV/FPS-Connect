---
name: Document Intelligence engine (gedeelde classificatie)
description: Eén staged classificatiemotor voor Inbox + Slim Upload, met bewijsketen per stap; vervangt losse per-route classificatielogica.
---

`artifacts/api-server/src/lib/documentIntelligence.ts` is de ENIGE plek voor documentclassificatie-logica. Zowel `routes/inbox.ts` als `routes/slim-upload.ts` roepen `classificeerDocument()` aan — geen eigen heuristiek/AI-prompt meer per route.

Staged pipeline (elke stap voegt een `BewijsStap` toe aan de bewijsketen, getoond in de UI):
bestandstype → tekstextractie (PDF/DOCX/tekst) → AI-vision fallback bij weinig leesbare tekst → AI content-analyse (of heuristische fallback zonder AI) → organisatie → jaar (tekst, dan bestandsnaam als laatste redmiddel) → module/bestemming → opslaglocatie → betrouwbaarheid (afgeleid van de echte verzamelde signalen, niet hardcoded).

**Why:** vóór dit werk had Inbox een aparte `classificeerMockAI` en Slim Upload zijn eigen heuristiek/AI-aanroep; die liepen uiteen in categorieën, betrouwbaarheidsscores en gedrag. Eén motor voorkomt dat toekomstige documenttype-toevoegingen (zoals "jaarrekening") maar op één van de twee plekken landen.

**How to apply:** nieuw documenttype toevoegen = wijzig `DOC_CATEGORIEEN` + `CATEGORIE_MODULE` in `documentIntelligence.ts`, niet in de route-bestanden. "jaarrekening" (subtype "geconsolideerd") stuurt naar module Archief met opslaglocatie `Archief → (Geconsolideerde) Jaarrekeningen → <jaar>`. Regressietests staan in `documentIntelligence.test.ts` (`_test`-exports laten heuristiek testen zonder AI/DB-call) — nieuwe categorieën horen daar een test bij te krijgen.

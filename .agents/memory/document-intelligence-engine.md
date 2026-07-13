---
name: Document Intelligence engine (gedeelde classificatie)
description: Eén staged classificatiemotor voor Inbox + Slim Upload, met bewijsketen per stap; vervangt losse per-route classificatielogica.
---

`artifacts/api-server/src/lib/documentIntelligence.ts` is de ENIGE plek voor documentclassificatie-logica. Zowel `routes/inbox.ts` als `routes/slim-upload.ts` roepen `classificeerDocument()` aan — geen eigen heuristiek/AI-prompt meer per route.

Staged pipeline (elke stap voegt een `BewijsStap` toe aan de bewijsketen, getoond in de UI):
bestandstype → tekstextractie (PDF/DOCX/tekst) → AI-vision fallback bij weinig leesbare tekst → AI content-analyse (of heuristische fallback zonder AI) → organisatie → jaar (tekst, dan bestandsnaam als laatste redmiddel) → module/bestemming → opslaglocatie → betrouwbaarheid (afgeleid van de echte verzamelde signalen, niet hardcoded).

**Why:** vóór dit werk had Inbox een aparte `classificeerMockAI` en Slim Upload zijn eigen heuristiek/AI-aanroep; die liepen uiteen in categorieën, betrouwbaarheidsscores en gedrag. Eén motor voorkomt dat toekomstige documenttype-toevoegingen (zoals "jaarrekening") maar op één van de twee plekken landen.

**How to apply:** nieuw documenttype toevoegen = wijzig `DOC_CATEGORIEEN` + `CATEGORIE_MODULE` in `documentIntelligence.ts`, niet in de route-bestanden. "jaarrekening" (subtype "geconsolideerd") stuurt naar module Archief met opslaglocatie `Archief → (Geconsolideerde) Jaarrekeningen → <jaar>`. Regressietests staan in `documentIntelligence.test.ts` (`_test`-exports laten heuristiek testen zonder AI/DB-call) — nieuwe categorieën horen daar een test bij te krijgen.

**Subtype-vangnet:** de AI laat optionele subvelden (zoals `document_subtype` "cv") flaky weg, ook bij correcte hoofdcategorie. Gedrag dat op een subtype gate't (zoals de CV-onboardingvraag) heeft daarom een deterministisch vangnet in de motor nodig: subtype afleiden uit tekst/bestandsnaam als de AI hem weglaat, met een eigen bewijsstap. Nooit alleen op het AI-subveld vertrouwen.

**CONNECT_AI_ENABLED op productie:** was structureel `false` in `/opt/fps-one/deploy/.env.production` — de echte AI-classificatie heeft op productie dus nooit gedraaid (bevestigd juli 2026). Bij elke deploy verifiëren dat de vlag `true` is; het is niet genoeg dat de OpenAI-sleutel aanwezig is.

**pdftoppm (poppler-utils) vereist in Dockerfile:** de vision-fallback voor gescande PDF's gebruikt `pdftoppm` om de eerste pagina naar JPEG te renderen. Zonder dit pakket in het finale Docker-image faalt de vision-stap stil (logger.warn → null) en wordt geen beeld doorgestuurd naar de AI. Toegevoegd aan de `FROM node:24-alpine` finale stage via `RUN apk add --no-cache poppler-utils`.

**Heuristische sleutelwoordvolgorde:** `personeelsdocument` moet vóór `contract` staan; het generieke woord "contract" is uit de contract-categorie verwijderd (alleen "overeenkomst" en "sla " resten). "onbepaalde tijd", "bepaalde tijd", "proeftijd", "dienstverband", "arbeidsvoorwaarden", "functieomschrijving" zijn toegevoegd als arbeidscontract-signalen.

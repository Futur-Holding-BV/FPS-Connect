---
name: CALC_INVOER_01 plak-analyse
description: Ontwerpregels voor de leveranciersproduct-plakflow op de calculatie (herkennen + koppelen + voorstel).
---

- Twee-traps AI: (1) HERKEN-prompt (tekst of vision via documentIntelligence-helpers), (2) KOPPEL-prompt die ALLEEN kandidaat-id's uit de server-query krijgt en per product artikel_id/normtijd_id of null kiest; server verifieert gekozen id's tegen de kandidatenlijst (fail-closed). Prijzen/uren komen uitsluitend uit mod_calc_artikelen/mod_calc_normtijden — AI-uitvoer mag nooit in tarief/mu landen.
- Ontbrekend = expliciet null + markering, nooit 0: frontend blokkeert Overnemen tot normtijd gekozen (alleen_artikel) of tarief bewust ingevuld (alleen_normtijd); velden weglaten uit de POST i.p.v. 0 sturen.
- Nieuw artikel aanleggen loopt via POST /modules/calculaties/artikelen (schrijvenCalc) — NIET de globale /artikelen (magazijn niveau 3); dat endpoint zit niet in OpenAPI, frontend gebruikt directe fetch. Prijs wordt nooit meegestuurd (blijft 0 = "leeg"; kolommen zijn not-null, bewust niet nullable gemaakt — markering via prijs_ontbreekt in de respons).
- Koppelgraadmeting in calc_plak_analyses (migratie 0036): alleen minimale meetdata (fabrikant/aanduiding/eenheid/uitkomst, max 20). Correcties → ai_veld_correcties met veld_namen calc_plak.* (whitelist).
- Upload-hardening: multer fileFilter (jpeg/png/webp/pdf) + magic-byte-check → 422 bij mismatch; multer-fouten naar 400/413.
- **Let op:** artikel-tabel-export heet `modCalcArtekelenTable` (typo in schema, zo gelaten). Route-pad frontend is /modules/calculatie (enkelvoud).
- **Why:** review vond stille nullen, verkeerde artikel-API en ontbrekende upload-validatie; opdracht verbiedt verzonnen prijzen/normtijden en URL-fetch server-side (aparte keuze met domein-allowlist als de beheerder dat later wil).

---
name: Documentherkenning vision-instellingen (DOCUMENT_01)
description: Waarom scans als "Unknown" strandden en welke render-/modelinstellingen heilig zijn.
---

# Documentherkenning vision (DOCUMENT_01)

## De regel
Vision-invoer voor de éne documentherkenner (`lib/documentIntelligence.ts` + `lib/pdfVisie.ts`) moet leesbaar blijven: **220 DPI, max 2000 px lange zijde (nooit vergroten), JPEG 85, `detail: "high"`, pagina 1–5 in volgorde**. Constanten staan in `pdfVisie.ts` en worden in het bewijsspoor vermeld.

**Why:** de oude keten (120 DPI → 800 px → JPEG 75 → `detail:"low"` ≈ 512×512) maakte bodytekst <5 px hoog; élk gescand document werd "Unknown". `detail:"low"` is de zwaarste stap — die maakt scherper renderen zinloos.

**How to apply:** bij elke wijziging aan vision-invoer deze vier instellingen samen bezien; nooit terug naar `detail:"low"` of kleine thumbnails "om kosten te sparen" (kosten ≈ €0,03 per gescand 2-paginadocument, bewust geaccepteerd). Pagina-selectie: altijd eerst pagina 1..min(5,n) — een tekstarme pagina verderop mag pagina 2 niet verdringen; >5 pagina's expliciet melden in bewijs.

## Gateway-valkuilen (beide lieten élke vision-extractie falen)
- gpt-5-modellen weigeren `max_tokens`/`temperature` op chat-completions; `aiGateway.chat` vertaalt nu automatisch naar `max_completion_tokens` (×4, min 4000) en stript temperature. Niet omzeilen met directe client-calls.
- Vision-slot = **gpt-4o** (niet gpt-5): gpt-5 + detail=high heeft minuten nodig (reasoning) en liep tegen de 60s gateway-timeout.

## Niets gokken
Metadata (bestandsnaam, mail-onderwerp, afzender) is alléén context: beide prompts verbieden expliciet gegevensvelden eruit over te nemen; onleesbaar = null + onzekere_velden. Afbeeldingsbestanden gaan door `resizeAfbeelding` (zelfde limieten), nooit rauw als data-URL. Jaar-uit-bestandsnaam bestaat nog uitsluitend voor archief-locatie en wordt in het bewijsspoor gemarkeerd als "minder betrouwbaar".

## Nulmeting
`scripts/src/nulmeting-documentherkenning.ts` draait de herkenner over `attached_assets/nulmeting/` en schrijft `docs/nulmeting-documentherkenning.md` (categorie, factuurvelden, bewijs, AI-kosten uit `ai_aanroepen`). Acceptatie van DOCUMENT_01 vereist die tabel met tien échte documenten — een groene build is niet genoeg.

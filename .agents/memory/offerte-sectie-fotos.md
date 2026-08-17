---
name: Offerte-sectie foto's (AI-fotoselectie)
description: Waar per-hoofdstuk foto's op een offerte worden opgeslagen en hoe de URL's werken
---

Offerte-hoofdstukken (offerte_secties) dragen hun eigen foto's in een `fotos` jsonb-kolom (DEFAULT '[]'); geen aparte koppeltabel.

**Regel:** de `url`/`thumbnail_url` in een OfferteSectieFoto zijn kant-en-klare `/api/storage/objects/<subPath>` URL's (het oude `/api/storage/files?path=`-formaat was een dode route; defect gefixt + data gemigreerd aug 2026, migratie 0068) — NIET het rauwe objectPath uit fpsVisualsTable.
**Why:** de Visual Library serveert beelden uitsluitend via de storage-proxy (`storageUrl()` in beheer/visual-library.tsx). Rauwe objectPath's renderen niet als `<img src>`. Zowel de Studio-UI als print.tsx renderen `foto.url` direct, dus de URL moet server-side (in POST /offerte-secties/:id/ai-fotos-voorstel) al compleet zijn.
**How to apply:** bij nieuwe endpoints die visuals teruggeven voor directe weergave: bouw de storage-URL server-side. Bij wijziging van het storage-URL-formaat: pas het op één plek in de foto-voorstel-endpoint aan.

Privacy-heuristiek: visualType=="referentiefoto" of bronType=="praktijkfoto" → privacy_waarschuwing (controle op personen/kentekens). AI stelt voor (JSON keuzes), mens accepteert/verwerpt per foto; pas na accepteren via PATCH /offerte-secties/:id opgeslagen in sectie.fotos.

Zichtbaar in het klantdocument alleen wanneer BegrotingWeergave.toon_fotos aanstaat (print.tsx).

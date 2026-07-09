---
name: pdf-parse v2 API
description: pdf-parse >=2.x heeft geen default-functie-export; alle PDF-tekstextractie loopt via één centrale helper.
---

# pdf-parse v2 API

**Regel:** `pdf-parse` >= 2.x exporteert alleen de named class `PDFParse` (`new PDFParse({data: Uint8Array}); getText(); destroy()`). De v1-stijl (`default`-functie op een Buffer) bestaat niet meer en gooit runtime `TypeError: pdfParse is not a function` — die door try/catch-blokken stil wordt ingeslikt, waardoor AI-classificatie alleen bestandsnaam+vision krijgt.

**Why:** Dit brak in juli 2026 alle PDF-tekstextractie (Document Intelligence, Slim Upload, rapporten, HRM, Studio, brandstof-import, veiligheid, organisatie) maandenlang onopgemerkt; `@types/pdf-parse` (v1) maskeerde het voor typecheck.

**How to apply:**
- Nieuwe PDF-lezende code gebruikt ALTIJD `extraheerPdfTekst` uit `artifacts/api-server/src/lib/pdfTekst.ts` — nooit rechtstreeks pdf-parse importeren.
- `@types/pdf-parse` NIET (her)installeren; v2 levert eigen types.
- Regressietest `pdfTekst.test.ts` bewaakt dat extractie echt tekst oplevert; laat die staan.

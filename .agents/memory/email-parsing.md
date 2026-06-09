---
name: E-mail parsing (.eml/.msg) gotchas
description: Content-type afleiding voor bijlagen + lege-parse guard; waarom mailparser een expliciete leegheidscheck nodig heeft
---

# E-mail bijlage content-type + lege-parse guard

Regels voor het parsen van geüploade e-mails (`email-ai.ts`, gebruikt door `routes/emails.ts`):

- **Bijlage content-type afleiden uit bestandsextensie als fallback.** mailparser (`.eml`) levert niet altijd een `contentType`; msgreader (`.msg`) heeft een optionele `att.attachMimeTag`. Zonder fallback downloaden PDF's/tekeningen als `application/octet-stream`. Gebruik een extensie→MIME map (pdf, png, jpg, dwg, dxf, docx, xlsx…) als laatste redmiddel.
  - `.msg`: valideer `attachMimeTag` tegen simpel MIME-patroon `^[a-z0-9.+-]+/[a-z0-9.+-]+$` voordat je het vertrouwt; anders fallback op extensie. Naam-fallback: `file.fileName || att.fileName || att.fileNameShort`.

- **mailparser is té tolerant: garbage bytes geven een "geslaagde" parse met alle velden null → HTTP 201 op rommel.** Voeg een `isLegeEmail`-guard toe in `parseEmailBestand`: gooi een fout als afzender/ontvanger/onderwerp/inhoud allemaal leeg zijn ÉN er geen bijlagen zijn. De route vangt dat af als **422** met NL-melding. **Why:** gebruiker wil duidelijke foutmeldingen bij kapotte/niet-ondersteunde bestanden; zonder guard slipt rommel er als lege e-mail doorheen.

- **Status:** `.eml` volledig e2e geverifieerd (parse + PDF-bijlage download + AI-omschrijving). Een echte geldige `.msg` is nog niet positief getest (geen fixture); corrupte `.msg` geeft correct 422. Code-pad is plausibel correct.

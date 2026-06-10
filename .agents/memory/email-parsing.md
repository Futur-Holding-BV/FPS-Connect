---
name: E-mail parsing (.eml/.msg) gotchas
description: Content-type afleiding voor bijlagen + lege-parse guard; waarom mailparser een expliciete leegheidscheck nodig heeft
---

# E-mail bijlage content-type + lege-parse guard

Regels voor het parsen van geüploade e-mails (`email-ai.ts`, gebruikt door `routes/emails.ts`):

- **Bijlage content-type afleiden uit bestandsextensie als fallback.** mailparser (`.eml`) levert niet altijd een `contentType`; msgreader (`.msg`) heeft een optionele `att.attachMimeTag`. Zonder fallback downloaden PDF's/tekeningen als `application/octet-stream`. Gebruik een extensie→MIME map (pdf, png, jpg, dwg, dxf, docx, xlsx…) als laatste redmiddel.
  - `.msg`: valideer `attachMimeTag` tegen simpel MIME-patroon `^[a-z0-9.+-]+/[a-z0-9.+-]+$` voordat je het vertrouwt; anders fallback op extensie. Naam-fallback: `file.fileName || att.fileName || att.fileNameShort`.

- **mailparser is té tolerant: garbage bytes geven een "geslaagde" parse met alle velden null → HTTP 201 op rommel.** Voeg een `isLegeEmail`-guard toe in `parseEmailBestand`: gooi een fout als afzender/ontvanger/onderwerp/inhoud allemaal leeg zijn ÉN er geen bijlagen zijn. De route vangt dat af als **422** met NL-melding. **Why:** gebruiker wil duidelijke foutmeldingen bij kapotte/niet-ondersteunde bestanden; zonder guard slipt rommel er als lege e-mail doorheen.

- **HTML-only e-mails: nooit alleen tags strippen voor de berichttekst.** Veel `.eml`-mails hebben geen plain-text part, alleen `mail.html`. Een naïeve `html.replace(/<[^>]+>/g," ")` laat de `<style>`/`<script>`-inhoud (CSS/JS) als platte tekst in `inhoud_tekst` lekken → onleesbare muur CSS; entiteiten (`&nbsp;` etc.) blijven ook staan. Gebruik `htmlNaarTekst()`: verwijder eerst style/script/head/title-**blokken inclusief inhoud** + comments, zet `<br>`/blok-sluittags om naar newlines, strip resterende tags, decodeer named+numerieke entiteiten (clamp code point op 0–0x10FFFF anders gooit `String.fromCodePoint` RangeError → upload faalt), collapse witruimte. Alleen gebruiken als `mail.text` leeg is. **Why:** echte bug "berichttekst niet meer leesbaar"; #8 had 6053 tekens CSS i.p.v. de mail.
- **Originele bestanden blijven bewaard op `gebouw_emails.object_pad`** → bestaande rijen met kapotte `inhoud_tekst` repareren = origineel herlezen (`objectStorage.getObjectEntityFile` + `downloadObject`) en opnieuw parsen; werk alleen `inhoudTekst` bij. Let op: per-email AI-velden + projectsamenvatting zijn op de oude rommel gegenereerd → laat gebruiker "Bijwerken" klikken om die te herzien.
- **`.msg` body-fallback:** als `data.body` leeg is, probeer `htmlNaarTekst(data.bodyHTML)`. RTF-only `.msg` blijft null (geen plain/HTML body) → UI verbergt het berichttekst-blok; dat is correct, geen rommel.
- **Status:** `.eml` volledig e2e geverifieerd (parse + PDF-bijlage download + AI-omschrijving + HTML→tekst). Een echte geldige `.msg` is nog niet positief getest (geen fixture); corrupte `.msg` geeft correct 422. Code-pad is plausibel correct.

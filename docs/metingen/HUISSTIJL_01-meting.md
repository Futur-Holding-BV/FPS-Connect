# HUISSTIJL_01 — meting vooraf (18-08-2026)

Gemeten op main (`61363659`). Regelaantallen via `wc -l`.

## A. De zes plekken en hun werkelijke toestand

| # | Plek | Bestand (regels) | Route | Bereikbaar via | Rechten |
|---|------|------------------|-------|----------------|---------|
| 1 | Organisatie → Documentopmaak | `pages/organisatie/documentopmaak.tsx` (674) | `/organisatie/documentopmaak` | sidebar Organisatie | UI: beheer≥1; API: PATCH `/werkgevers/:id` (personeel 2) |
| 2 | Beheer → Documentopmaak | `pages/beheer/documentopmaak.tsx` (323) | **GEEN route geregistreerd** | onbereikbaar; wel 2 dode links vanuit `offertes/print.tsx:245` en `facturen/print.tsx:238` naar `/beheer/documentopmaak` | n.v.t. (dood scherm) |
| 3 | Organisatie → Document Studio | `pages/organisatie/studio.tsx` (1274) | `/organisatie/studio` | sidebar Organisatie; slim-upload-balk | organisatie 1 lezen / 2 schrijven |
| 4 | Offertes → Studio | `pages/offertes/studio.tsx` (3085) | **GEEN route geregistreerd** | wordt wel geïmporteerd in `connect-routes.tsx:150` en `App.tsx:165`, nergens gerenderd — legacy dode code | n.v.t. |
| 5 | CRM → Merkenkast | `pages/crm/merkenkast.tsx` (154) | `/crm/merkenkast` | sidebar CRM | merk 1 (alleen bekijken/downloaden) |
| 6 | Organisatie → Werkmaatschappijen | `pages/organisatie/werkmaatschappijen.tsx` (771) | `/organisatie/werkmaatschappijen` | sidebar Organisatie | UI personeel 2; bank financieel 4 |

Afwijkingen t.o.v. de aanleiding: "vijf schermen" zijn er feitelijk **drie levende**
(1, 3, 5) plus werkmaatschappijen (6); scherm 2 en 4 zijn al dood maar staan als
lijken in de code (samen ~3.400 regels) en scherm 2 wordt nog vanuit twee
print-foutpaden gelinkt (doodlopend).

## B. Uploaden en de keten (klacht bevestigd)

- Whitelist client (`studio.tsx:92,846`) én server (`routes/studio.ts:540+`):
  alleen `pdf/jpeg/png/webp`, max 10 MB (multer memory). **Word/Excel/tekst/svg
  worden geweigerd** — klacht 1 klopt.
- Na upload: bestand naar object storage (`algemeen/studio/<uuid>`), model-status
  → `referentie`. **Verder gebeurt niets automatisch** — klacht 2 klopt.
  Huisstijl-analyse (POST `/studio/modellen/:id/huisstijl-analyse`) en
  modelgeneratie (POST `/:id/genereer`) zijn losse handelingen; bijsturen
  (`/:id/bijstuur`) bestaat al als endpoint.

## C. Wat al bestaat voor het doel

- `werkgevers`-tabel heeft al: `logo_url`, `logo_varianten` (JSON-map, sleutel
  `wit` voorzien), `merk_kleuren`, `primaire_kleur`, `lettertype`,
  kop/voettekst-positie, vier marges, `briefpapier_document_id`, `voettekst`,
  volledige bedrijfsgegevens (adres/kvk/btw/iban). Witte logo's: veld bestaat,
  bestanden nog niet.
- `document_studio_modellen` (lib/db/src/schema/organisatie.ts:109-135) heeft al
  werkgever_id, document_type, versie, status (concept/goedgekeurd/gearchiveerd)
  + unieke index op één goedgekeurd model. Gespreks-/versiegeschiedenis bestaat
  deels (versiebeheer-SQL), gesprek-bij-model nog niet.

## D. Documenten: wat wordt nu al waar gegenereerd?

| Document | Bestaat er een opmaakweg? | Waar | Werkgever-branding? |
|---|---|---|---|
| Offerte | ja (print/PDF) | offertes print-pad | ja, `logo_url` (taak #986 verfijnt dit) |
| Factuur | ja (print/PDF) | facturen print-pad | ja, `logo_url` |
| Opleverdossier/-rapport | ja | gebouwen/print.tsx (DDS-conventies) | ja |
| Calculatieprint | ja | modules/calculatie/print.tsx | model-kleur → `primaire_kleur` fallback |
| Inkooporder | alleen als inline HTML-mail | routes/magazijn.ts:2405-2523 | nee (hardcoded HTML) |
| Opdrachtbevestiging | alleen e-mailtemplate | services/email.ts (`stuurOpdrachtbevestiging`) | nee |
| Aanmaning | nee (alleen herinneringstype in facturen-route) | — | — |
| Mandagstaat | geen generator gevonden | — | — |
| Communicatieplan, bewonersbrief, HRM-brieven, algemene brief | geen generator | — | — |
| E-mailopmaak | grote inline-HTML-familie | services/email.ts + mail-routes | nee (hardcoded kleuren) |

Conclusie: voor offerte/factuur/opleverrapport bestaat al een opmaakweg — de
Tweespan-opzet moet dáár in, geen tweede weg ernaast. Voor de "lichte" brieven
bestaat er nog niets; die kunnen zonder botsing nieuw.

## E. Raakvlakken met lopende/openstaande taken

- **#986** (offerte-PDF/mails eigen huisstijl) — IN_PROGRESS, zelfde gebied.
- **#166** (Document Studio modellen goedkeuren) — overlapt met §6 van deze
  opdracht (goedkeur-workflow bestaat deels al in studio-routes).
- **#648** (klant-logo/projectfoto/kleurthema offerte-cover) — overlapt met §7.

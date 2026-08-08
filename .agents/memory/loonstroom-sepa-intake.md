---
name: Loonstroom SEPA-mailintake (LOON_01)
description: Patronen en invarianten van de SEPA-loonbestand-intake, boekhouderportaal-verwerkmarkering en boekhouder-toegangsafbakening.
---

**Invarianten:**
- Mail-intake zet een pain.001-bijlage ALTIJD op status `ontvangen` — nooit automatisch verder; klaarzetten voor de bank blijft mensenwerk.
- Herkenning op ISO 20022-namespace (`isPainXml`), nooit op bestandsextensie.
- Werkgever alleen bij eenduidige match (IBAN > SCAB-mailadres > Dbtr-naam); bij twijfel: wél opslaan met `onvolledig=true` + signaal `loon_sepa_onvolledig`, nooit gokken.
- `onvolledig` is afgeleide staat van (werkgever && geldige periode), in beide richtingen herberekend in PATCH; onvolledig bestand → 422 op elke statusprogressie voorbij ontvangen/fout.
- Dedupe DB-afgedwongen: unieke index (bron_mail_message_id, bestandsnaam) WHERE not null; insert met onConflictDoNothing = idempotent succes.
- Claim via `werk_inbox_mails.sepa_verwerkt_op`; teruggave bij fout én automatisch herstel van verweesde claims (>1 uur zonder sepa-rij) aan het begin van elke run.

**Waarom:** betaalbestanden raken echte salarissen; dubbel of automatisch doorzetten is onacceptabel; crash-recovery voorkomt stilliggende bestanden.

**Boekhouder:** preset "Externe boekhouder" = alleen salarisarchief:3, salaris_mutaties:1, boekhouder_portaal:4. Preset-aanscherping in code verandert bestaande profielen/accounts NIET — dat vergt een gerichte migratie (profielen-rij + gebruikers met herkomst_profiel_id bijwerken). Verwerkt-markering (declaraties/verlof) is one-way met 409 op dubbel.

**Hoe toe te passen:** bij nieuwe mail-intakesoorten hetzelfde claim/dedupe/twijfelpad-patroon volgen; bij elke preset-wijziging een migratie meesturen, niet vertrouwen op synchroniseer-standaard.

-- 0031 — Actiepunten voor de hoofdbeheerder (persoonlijke to-do in de zijrand).
-- Doel: acties waar het platform op René wacht (Azure, mailing, VPS, stores)
-- vindbaar bijhouden en afvinken. Idempotent gezaaid met de bekende wachtpunten.

CREATE TABLE IF NOT EXISTS actiepunten (
  id SERIAL PRIMARY KEY,
  titel TEXT NOT NULL,
  omschrijving TEXT,
  categorie TEXT NOT NULL DEFAULT 'overig',
  status TEXT NOT NULL DEFAULT 'open',
  volgorde INTEGER NOT NULL DEFAULT 0,
  afgerond_op TIMESTAMP,
  aangemaakt_op TIMESTAMP NOT NULL DEFAULT now(),
  bijgewerkt_op TIMESTAMP NOT NULL DEFAULT now()
);

-- Startlijst: alleen zaaien als het punt (op titel) nog niet bestaat.
INSERT INTO actiepunten (titel, omschrijving, categorie, volgorde)
SELECT v.titel, v.omschrijving, v.categorie, v.volgorde
FROM (VALUES
  ('GitHub Actions-secrets voor de token-gezondheidscheck instellen',
   'De dagelijkse controle op het push-token faalt nu elke dag: zet GITHUB_TOKEN_PUSH, AZURE_TENANT_ID/CLIENT_ID/CLIENT_SECRET, MAIL_FROM, MAIL_MAILBOX en RENE_ALERT_EMAIL als GitHub Actions-secrets (zie PRODUCTION_RUNBOOK.md).',
   'platform', 10),
  ('Azure send-as / Mail.Send-machtiging controleren',
   'De gedeelde postbus moet via Graph mogen verzenden namens het zichtbare afzendadres; zonder deze machtiging blijven uitnodigings- en alarmmails hangen.',
   'platform', 20),
  ('Mailing end-to-end testen',
   'Op productie testen: uitnodigingsmail, wachtwoord-reset, aanvraag-mail naar inbox en factuur-mailbox — komen ze aan en zijn afzender/opmaak goed?',
   'testen', 30),
  ('VPS-configuratie doorvoeren',
   'De agent heeft geen SSH-toegang meer: openstaande Caddy-/omgevingswijzigingen op de productie-VPS zelf zetten en terugkoppelen.',
   'platform', 40),
  ('Apple Developer-account aanmaken',
   'Nodig om FPS Monteur in de App Store te kunnen publiceren (jaarlijks abonnement, D-U-N-S/bedrijfsverificatie kan dagen duren — vroeg starten).',
   'app-stores', 50),
  ('Google Play Console-account aanmaken',
   'Nodig om FPS Monteur in de Play Store te kunnen publiceren (eenmalige registratie + bedrijfsverificatie).',
   'app-stores', 60)
) AS v(titel, omschrijving, categorie, volgorde)
WHERE NOT EXISTS (SELECT 1 FROM actiepunten a WHERE a.titel = v.titel);

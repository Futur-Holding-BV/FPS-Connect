-- 0073 — Smoketest-serviceaccount: vrijstelling van tweestapsverificatie.
--
-- De post-deploy smoketest (deploy.yml) logt in met e-mail+wachtwoord via
-- POST /api/auth/login en kan geen TOTP-stap doorlopen. Omdat de loginroute
-- 2FA voor álle accounts afdwingt (verify_2fa/setup_2fa), krijgt het vaste
-- smoketest-account een expliciete, per-account vrijstellingsvlag. De vlag
-- is nergens via de UI of API te zetten — uitsluitend via het beheerscript
-- lib/db/scripts/smoketest-account.mjs (of direct SQL door de beheerder).
ALTER TABLE gebruikers
  ADD COLUMN IF NOT EXISTS twee_factor_vrijgesteld boolean NOT NULL DEFAULT false;

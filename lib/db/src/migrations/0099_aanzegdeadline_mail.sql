-- Bewaar dat de automatische aanzegdeadline-mail voor dit
-- contract_signalering-window al in de mail-wachtrij is gezet.
ALTER TABLE contract_signaleringen
  ADD COLUMN IF NOT EXISTS aanzeg_mail_verstuurd_op timestamp;
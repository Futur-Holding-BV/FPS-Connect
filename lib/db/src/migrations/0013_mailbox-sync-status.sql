-- Taak: mailbox-achtergrondsync mag niet stilvallen zonder signaal.
-- laatst_gesynct_op: wanneer de mailbox voor het laatst succesvol is gesynct.
-- sync_alarm_op: wanneer voor het laatst een stilstand-alarm naar de
-- hoofdbeheerder(s) is gestuurd (dedupe: max één alarm per 24 uur).
ALTER TABLE werk_inbox_mailboxen ADD COLUMN IF NOT EXISTS laatst_gesynct_op timestamp;
ALTER TABLE werk_inbox_mailboxen ADD COLUMN IF NOT EXISTS sync_alarm_op timestamp;

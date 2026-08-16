---
name: Mail-wachtrij (menselijke goedkeuring)
description: Elke systeemmail wacht op menselijke goedkeuring; alleen expliciete verstuur-acties en account-mails gaan direct.
---

**Regel:** `verstuurMail()` plaatst standaard in `mail_wachtrij` (status wachtend) — verzending pas na beheerder-klik op /beheer/mail-wachtrij. `direct: true` mag ALLEEN als de verzending zelf de menselijke handeling is: account-mails (uitnodiging, wachtwoord-reset, testmail) en expliciete verstuur-knoppen (offerte, antwoord klantvraag, factuur-correspondentie, bestelbon, inkooporder, inkoopbon-WVB).

**Why:** René (16 aug 2026): geen ongecontroleerde mails; elke mail vereist een menselijke handeling; nooit herhalende mails. Partiële unieke index (naar_email+onderwerp WHERE wachtend) dedupet periodieke jobs.

**How to apply:** nieuw mail-pad → NOOIT zomaar `direct: true`; fail-closed via wachtrij. Verzenden = atomaire claim (UPDATE→'verzenden' RETURNING) tegen dubbel versturen; afwijzen conditioneel vanuit wachtend/mislukt. POST-routes hebben same-origin CSRF-guard (SameSite=none cookies!). Let op: caller die na `verstuurMail` direct een status "verzonden/besteld" zet moet direct:true zijn óf wachten op goedkeuring.

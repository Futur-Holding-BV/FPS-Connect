---
name: Mailguard testdomeinen
description: Waarom e-mailverzending naar test-/voorbeelddomeinen centraal onderdrukt wordt en waar de guard zit.
---

**Regel:** alle uitgaande mail-paden in api-server onderdrukken verzending naar test-/voorbeelddomeinen via `isTestAdres()` in `services/email.ts` (voorbeeld.nl, example.*/voorbeeld.*, example.com/org/net, test.local, *.invalid/*.example/*.test). Guard zit in `verstuurViaGraph` én in werk-inbox `verstuurNieuwDelegatedMail` + `beantwoordMail` (concept wordt verwijderd, `ok:true`).

**Why:** de KETEN01-e2e-test verstuurde bij elke run echte offerte-mails naar keten01-klant@voorbeeld.nl; Microsoft leverde per run een bounce ("Onbestelbaar") af in de gedeelde postbus. Omdat de e2e-workflow na elke taakmerge herstart, ontving de beheerder elke 20–30 min zo'n mail. Dev KAN dus wel degelijk mailen (Graph via gedeelde postbus) — "dev mailt niet" is geen aanname meer.

**How to apply:** nieuw uitgaand mail-pad (Graph of anders) → guard hergebruiken, nooit alleen op omgeving vertrouwen. E2e-tests mogen testadressen blijven gebruiken; de guard vangt ze. Bounce-mails "Microsoft Outlook" als afzender = NDR, kijk naar het oorspronkelijke geadresseerde-domein.

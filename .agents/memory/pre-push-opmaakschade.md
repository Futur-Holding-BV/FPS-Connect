---
name: Pre-push opmaakschade-poort
description: Push naar main blokkeert bij >300 regels diff per bestand; bewuste grote wijziging vereist [grote-wijziging] in de commit-boodschap.
---
De pre-push hook (.githooks/pre-push) draait 3 poorten: testmarker-check, opmaakschade-check (scripts/git/check-opmaakschade.mjs, blokkeert bij >300 regels groei/krimp per bestand per commit) en volledige typecheck.

**Why:** merge-/formatterschade (rapporten.ts 15 aug 2026) en sabotage-markers belandden eerder op main.

**How to apply:** een bewust grote wijziging (bv. schermen samenvoegen/herschrijven) kondig je aan met de letterlijke tekst `[grote-wijziging]` in de commit-boodschap (`git commit --amend`), daarna opnieuw pushen. Er is géén overslaan-vlag; rode typecheck mag nooit door.

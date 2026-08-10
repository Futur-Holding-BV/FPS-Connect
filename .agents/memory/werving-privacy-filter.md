---
name: Wervingsmodule privacy-hardening
description: AI-uitvoer over sollicitanten moet deterministisch server-side gefilterd worden; prompt-verboden zijn geen waarborg.
---
Regel: elke AI-uitvoer die aan een kandidaat/persoon raakt wordt vóór persistentie deterministisch gecontroleerd op beschermde kenmerken (leeftijd/geboortedatum, geslacht, nationaliteit, foto, adres, burgerlijke staat, gezondheid) én op oordelen (score/cijfer/percentage/geschiktheid/match). Besmette items vervallen of vallen fail-closed terug ("niet_genoemd"); besmette toelichtingen worden gestript — nooit tonen of opslaan.

**Why:** completion-review wees prompt-only naleving af: een prompt beschermt niet tegen modelfouten of prompt-injectie via cv-inhoud (EU AI-verordening-eis in WERVING_01).
**How to apply:** filter zit in de werving-voorbereidingsservice (`vindVerbodenInhoud` + harden-functies, met adversariële unit tests). Bij nieuwe AI-velden rond personen: zelfde patroon, plus let op legitiem vakjargon (bv. "foto's" van uitgevoerd werk mag; pasfoto niet). Kernvragen per functie worden bij voorbereiden per kandidaat gekopieerd; her-runnen bewaart vragen mét aantekening.

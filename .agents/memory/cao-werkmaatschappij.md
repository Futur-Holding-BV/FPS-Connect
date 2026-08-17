---
name: Werkmaatschappij → CAO voorselectie
description: Frontend mapping van FPS-werkmaatschappij naar CAO; CAO-namen moeten matchen met server CAO_OPTIES
---

Bij onboarding/profiel van een medewerker wordt de CAO automatisch voorgeselecteerd op basis van de gekozen werkmaatschappij. Dit is een UI-default; de CAO blijft handmatig overschrijfbaar.

**Regel:** de CAO-namen die de frontend-mapping uitstuurt MOETEN exact gelijk zijn aan `CAO_OPTIES.naam` in de api-server (HRM-routes). Nu: "Metaal & Techniek" en "Bouw & Infra".

**Why:** de onboarding-endpoint valideert `cao` server-side tegen `CAO_OPTIES` en gebruikt de CAO-norm (uren/week) om verlofsaldo pro-rata op te bouwen. Een afwijkende string → validatie faalt of saldo-opbouw klopt niet.

**How to apply:** wijzig je de mapping (de set werkmaatschappijen of CAO-toewijzing), check dan eerst `CAO_OPTIES` in de api-server. De "Nieuwe medewerker"-create-form draagt bewust GEEN `cao` (alleen onboarding zet CAO + verlofsaldo); voeg daar geen CAO-veld toe zonder reden.


## Dynamisch sinds 17-08-2026
Werkmaatschappij-keuzelijsten en CAO-voorselectie komen uit `useWerkmaatschappijen()` (lib/werkmaatschappijen.ts), gevoed door GET /werkgevers — `werkgevers.cao` is bron van waarheid. Statische WERKMAATSCHAPPIJEN-lijst is alleen laad-fallback + module-level defaults. Nieuwe dropdowns NOOIT op de statische lijst bouwen; binnen componenten mag de hook de import shadow'en zodat call-sites gelijk blijven. Geslaagde lege API-respons = lege lijst (geen fallback).

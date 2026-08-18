---
name: Uitvoerend-veld portaalweergave
description: Desktop-sidebar verbergen van kantoorhoofdstukken voor puur uitvoerende veldmedewerkers
---

Puur uitvoerende veldmedewerkers (alle functietitels in {Monteur, Timmerman, Uitvoerder, Onderhoudsmonteur}, niet-hoofdbeheerder) krijgen een slanker webportaal: hoofdstukken Projectaanpak, Communicatie en Declaraties verborgen (`isUitvoerendVeld` in beheerder-layout).

**Why:** de beheerder (16-08-2026): monteurs/timmermannen werken vanaf de telefoon; hun preset-rechten (declaraties:2, projecten:1 etc.) zijn bewust voor de app, maar het desktopportaal moet die kantoorhoofdstukken niet tonen. Rechten NIET afpakken — alleen weergave.

**How to apply:** functietitels komen uit de rol-context (spiegelt impersonatie mee); lege functietitels ⇒ niet als veld behandelen (fail-open naar volledig menu). Sidebar-conventie: elk hoofdstuk-item hoort een rechten-guard te hebben; hoofdstuk verbergen als geen enkel item zichtbaar is (Organisatie-incident: items stonden zonder guard voor iedereen zichtbaar). Onboarding STAP 4 waarschuwt (amber) als account-rechtenprofiel afwijkt van het standaardprofiel van de functie.

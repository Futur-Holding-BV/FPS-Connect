# Changelog — FPS Connect

Overzicht van gebouwde functies, opgeloste bugs en kleine verbeteringen, per datum.
Grote roadmap-fases staan in `docs/roadmap/gebouwd.md`.

---

## 29 juni 2026

### Opgelost — nieuw onboarde monteur verscheen niet in planning
Na het onboarden van een medewerker via Personeel werd de planning-cache niet
geïnvalideerd. De planning-pagina toonde daardoor de verouderde lijst totdat de
gebruiker handmatig de pagina herlaadde.

**Fix:** `getListPlanningMedewerkersQueryKey()` toegevoegd aan de cache-invalidatie
na zowel `opslaanMedewerker()` als `opslaanOnboarding()` in `personeel/index.tsx`.
De monteur verschijnt nu direct in de planning na onboarding, zonder refresh.

---

## 13 juni 2026

### Gebouwd — Document Design System (visuele basis)
Herbruikbare documentcomponenten + previewpagina onder Beheer › Documentopmaak
(`/beheer/documentopmaak`, gated op systeembeheerder). URL-veilige branding-velden
zodat de Werkgever-entiteit ze later kan voeden. Drie templatefamilies (A klant,
B HRM/juridisch, C intern operationeel). Verdieping (versiebeheer, PDF, digitale
ondertekening) volgt in een latere fase.

---

## Eerder (chronologisch, recentste bovenaan)

### Gebouwd — HRM Personeel Fase 1-basis (breed en praktisch uitgewerkt)
Medewerker-detailpagina (`/personeel/:id`): profiel, account/rol, functie,
opleidingen (met verloopsignalering), bekwaamheden (per categorie/niveau,
bewerkbaar) en verlof (saldo + aanvragen indienen/goedkeuren/afwijzen).
Functiehuis, bekwaamheidsmatrix, verlofsoorten, verlofsaldi, verlofaanvragen,
onboarding vanuit gebruikersaccount. AI-voorstel voor opleidingen per functie.

### Gebouwd — DMS / Documentenbibliotheek
Detail/logboek, polymorfe koppelingen, duplicaatdetectie (sha256 + fuzzy),
goedkeuringsflow, signaleringen, DMS-dashboard, audittrail, downloadlogging,
read-only mobiele documentenweergave. V1.5-bevriezingsdeel op dossiers.

### Gebouwd — V1.3 Spots & uitvoering
Spotflow web + mobiel, plattegrond SVG-editor + mobiele renderer, scheidingen,
toewijzingen, voorbereide spots, clusters + serie plaatsen.

### Gebouwd — AI Spotherkenning & AI Bibliotheekvalidatie
AI stelt voor, mens bevestigt. AI keurt nooit zelfstandig juridisch goed.

### Gebouwd — V1.2 Bibliotheek & documentstructuur
Applicaties, toepassingen, documenten, ETA's, koppelingen, versiebeheer.

### Gebouwd — V1.1 Rollen & bevoegdheden
Bevoegdhedenmatrix (jsonb), profielen, 14 presets, beheerinterface.

### Gebouwd — V1.0 Administratief gereed voor uitvoering
Dashboard, gebouwenbeheer, voorzieningenoverzicht, inspecties, onderhoud,
gebruikersbeheer, abonnementen, eigen sessie-auth met verplichte TOTP.

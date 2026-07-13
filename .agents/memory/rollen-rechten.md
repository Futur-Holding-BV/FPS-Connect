---
name: Rollen & Rechten beheer
description: Hoe het rollen/rechten-beheersysteem werkt — presets, synchronisatie, de management-pagina en de diagnose.
---

# Rollen & Rechten

## Architectuurprincipe
"Nieuwe rol" = een preset aanmaken in de `profielen`-tabel (`systeem=true`).
NOOIT het `rol`-enum uitbreiden (dat kent enkel `hoofdbeheerder | gebruiker | klant`).

## Standaardpresets (PRESETS in lib/permissies/src/index.ts)
14 presets totaal:
Projectleider, Werkvoorbereider, Project-admin, Monteur, Timmerman, Uitvoerder,
Controleur, Commercieel, HRM-adviseur, Calculatie,
**Directie, Administratie, Onderhoudsmonteur, Externe inhuur** (nieuw).

## Seeding
`POST /api/profielen/synchroniseer-standaard` (requireRol hoofdbeheerder):
- Leest PRESETS uit lib/permissies
- Maakt ontbrekende presets aan met `systeem=true`
- Retourneert `{ aangemaakt: number }`
- Veilig idempotent: slaat bestaande namen over

Frontend hook: `useSynchroniseerStandaardProfielen` in de gegenereerde api.ts.

## Rollen & Rechten pagina (/beheer/rollen-rechten)
Drie tabs:
1. **Rollenmatrix** — horizontaal scrolbare tabel presets × modules, kleurgecodeerde
   access-levels (L/W/A/B/—), amber-banner als presets ontbreken, Synchroniseren-knop.
2. **Modulerapport** — alle app-routes gegroepeerd per sectie (Projecten, CRM, HRM,
   Beheer, Communicatie) met nav-item status, bevoegdheids-gate en opmerkingen.
3. **Mijn toegang** (diagnose) — per module het huidige niveau voor de ingelogde
   gebruiker + "Waarom niet?" uitleg met link naar Profielen als niveau=0.

Nav-item: Beheer > Rollen & Rechten (isHoofdbeheerder gate, KeyRound icoon).

## AI-profielvoorstel (gedeeld component)
`components/ai-rollen-voorstel-dialog.tsx` exporteert `AiVoorstelDialog` (AI stelt
profielen/rollen voor, mens bevestigt+slaat op). Wordt gebruikt door ZOWEL
`/beheer/rollen-rechten` (Rollenmatrix-tab) ALS `/beheer/profielen`
("Bevoegdheidsprofielen") — beide beheren dezelfde `profielen`-entiteit. Wijzig je
de dialoog, dan raakt dat beide pagina's. Het component is zelfstandig (eigen
`NiveauBadge` + niveau-constants); rollen-rechten.tsx houdt bewust een eigen
`NiveauBadge` voor de matrixrender. Backend: `POST /profielen/ai-voorstel`
(hoofdbeheerder-only), opslaan via bestaand `POST /profielen`.

## Weekstaten
Route `/weekstaten` bestond maar had geen nav-item.
Opgelost: nav-item toegevoegd in HRM-sectie naast Urenregistratie (gate: `personeel:1 || isHoofdbeheerder`).

**Why:** de bevoegdheden-matrix is schaalbaarder dan een rol-enum; presets zijn
kopieerbare startpunten (niet rigide toewijzingen), zodat beheerders per gebruiker
kunnen bijstellen zonder de kernarchitectuur te raken.

**How to apply:** wil je een nieuwe "functie" toevoegen, maak dan een preset aan via
de UI of via POST /profielen/synchroniseer-standaard nadat je het aan PRESETS hebt
toegevoegd. Gebruik nooit rol-strings in conditionals.

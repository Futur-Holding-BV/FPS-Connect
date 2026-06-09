---
name: Controleur rol — alleen onderhoud
description: Controleur zit niet in normale project-/opleverflow; uitsluitend voor onderhoudsinspecties bij onderhoudscontracten.
---

## Regel
Controleur werkt **alleen** binnen de onderhoudsfase van een onderhoudscontract. Hij is niet betrokken bij normale project-uitvoering (spots plaatsen, oplevering, uitvoeringsworkflow).

**Why:** Vóór aanpassing stond controleur overal in BEWERKER_ROLLEN en kon hij projectinspecties aanmaken/zien — wat de rol semantisch onjuist maakte.

## Hoe toegepast

### Server (`inspecties.ts`)
- `CONTROLEUR_INSPECTIE_TYPES = ["periodiek", "jaarlijks", "herstel"]`
- `POST /inspecties`: als `echteRol === "controleur"` en type niet in lijst → HTTP 403
- `GET /inspecties`: server filtert resultaten voor controleur op `CONTROLEUR_INSPECTIE_TYPES`

### Server (`onderhoud.ts`, `gebouwen.ts`, `dashboard.ts`)
- `TOEGEWEZEN_ROLLEN = ["monteur", "controleur"]` blijft intact voor gebouwtoewijzingsfilter

### Web (`plattegrond.tsx`)
- `BEWERKER_ROLLEN = ["monteur", "beheerder", "hoofdbeheerder"]` — controleur verwijderd
- Controleur kan plattegrond inzien maar geen spots plaatsen/bewerken

### Web (`voorzieningen/detail.tsx`)
- `BEWERK_ROLLEN = ["monteur", "beheerder", "hoofdbeheerder"]` — controleur verwijderd
- Veld-label `controleur_naam` hernoemd naar "Onderhoudscontroleur" (semantisch correct)

### Web (dashboard/monteur.tsx)
- Controleur-dashboard filtert inspecties client-side op `ONDERHOUD_TYPES`
- Werkbonnen-sectie zichtbaar voor controleur (ze worden betrokken bij onderhoudswerkorders)
- Snelkoppelingen: "Voorzieningen" verborgen voor controleur

### Web (layouts/monteur-layout.tsx)
- `ROUTES_CONTROLEUR` bevat `/onderhoud` (toegevoegd) maar niet `/voorzieningen` (verwijderd)

### Rol-definitie (`rol-types.ts`, `gebruikers/index.tsx`)
- Beschrijving: "Onderhoud — periodieke en jaarlijkse controles bij onderhoudscontracten"

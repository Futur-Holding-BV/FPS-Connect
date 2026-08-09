---
name: PANEEL_01 banen & gebruikersvoorkeuren
description: Ontwerpregels voor de vaste-banen-weergave in firevault en het generieke per-gebruiker voorkeurenmechanisme.
---

**Voorkeuren (het enige mechanisme — MENU_01 §4.3 moet hierop aansluiten, geen tweede opslag):**
- Tabel `gebruiker_voorkeuren` (uniek gebruiker_id+sleutel, jsonb) + API GET/PUT/DELETE `/mijn/voorkeuren(/:sleutel)`, requireAuth-only, alleen eigen rijen. Migratie 0035.
- Server valideert: sleutel [a-z0-9_.-]{1,100}, waarde ≤50k; sleutel-specifieke regels horen óók server-side (bv. `paneel.indelingen` max 5 — UI-limiet is met een directe API-call te omzeilen).

**Banen (firevault, alleen intern portaal):**
- Route-Switch staat in `src/routes/connect-routes.tsx` — bewust een eigen module: App.tsx én baan.tsx importeren hem; nooit terugverplaatsen naar App.tsx (circular import App↔layout was een review-blocker).
- Elke baan = eigen wouter `memoryLocation`-router. **Een nieuw startpad hermount NIET vanzelf** — indeling-laden bumpt een `generatie`-teller die als key dient; in-baan navigatie bumpt bewust niet (remount-lus).
- Minimumbreedte per baan (360px) toetsen tegen de gemeten content-breedte (ResizeObserver op `<main>`, ná sidebar), niet window.innerWidth; past het niet → automatische terugval naar volle breedte, nooit smal renderen. Laatste 2 banen: sluiten = paneelmodus uit.
- Geschiktheids-whitelist in `src/lib/paneel-geschiktheid.ts`, bron: docs/metingen/PANEEL_01_paneelgeschiktheid.md (157/207 geschikt). Niet-geschikt pad → volle breedte + "Terug naar banen".
- Voorkeuren uit de server bij inlezen strikt valideren (aantal 2..4, breedtes, paden) — corrupte jsonb mag de UI nooit breken.

**Why:** review vond te-smalle banen, client-only limiet en de importcycle; de generatie-truc kwam uit een echte bug (standaardindeling laadde niet).

**Fase 0-feit:** calculatie-PATCH is last-write-wins zonder versiecontrole (veld-gedeeltelijk dempt); vastgelegd in docs/metingen/PANEEL_01_twee_vensters.md — optimistic locking is een open besluit.

---
name: Toewijsbare-gebruikers (picker-endpoint)
description: Welke endpoint/hook toewijs-keuzelijsten (team, monteur-uitvoering, onderhoud) moeten gebruiken en waarom niet /gebruikers
---

# Toewijs-keuzelijsten: gebruik GET /toewijsbare-gebruikers, niet /gebruikers

Alle keuzelijsten waarin je een persoon aan werk koppelt (gebouwteam, spot
"monteur uitvoering", onderhoudstaak) moeten hun personenlijst halen uit
`useListToewijsbareGebruikers()` → `GET /toewijsbare-gebruikers`, NIET uit
`useListGebruikers()` → `GET /gebruikers`.

**Why:** `GET /gebruikers` is gated met `requireBevoegdheid("gebruikers", 1)`.
Een gebruiker kan wél werk toewijzen (rechten op gebouwen/voorzieningen/
onderhoud) zonder gebruikersbeheer-recht. Die kreeg dan 403 op de personenlijst
en zag een lege/kapotte picker. `/toewijsbare-gebruikers` is gated met
`requireEnigeBevoegdheid([["gebouwen",1],["voorzieningen",1],["onderhoud",1],
["gebruikers",1]])` (slaagt als ÉÉN check slaagt; hoofdbeheerder bypass; klant
deny) en geeft alleen het minimum terug ({id, naam, rol, functietitels}, geen
e-mail/telefoon/bevoegdheden), gefilterd op `actief` en `rol !== "klant"`.

**How to apply:**
- Nieuwe picker die personen koppelt aan werk → gebruik deze hook/endpoint.
- `/gebruikers` blijft voor het gebruikersbeheer-scherm zelf en voor de
  hoofdbeheerder-only "Bekijken als"-impersonatie (die query draait alleen in
  het `kanWisselen`-gegate component, dus geen 403 voor andere rollen).
- De UI-actie (bv. team toewijzen) houdt zijn eigen, strengere gate:
  team-picker in gebouwen/detail.tsx is `heeftNiveau("gebouwen", 3)` — gelijk
  aan de server-gate op `POST /gebouwen/:id/toewijzingen`.
- Filter op `g.rol !== "hoofdbeheerder"` voor "monteurs"-achtige lijsten; de
  oude filter `g.rol === "monteur"` is dood (rol-enum = hoofdbeheerder/
  gebruiker/klant) en gaf overal een lege lijst.

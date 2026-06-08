---
name: Autorisatie-patroon (object-level / IDOR)
description: How role + building-assignment authorization is enforced in api-server, and the IDOR pitfalls
---

# Autorisatie-patroon FPS Brandpreventie

Twee onafhankelijke lagen, beide server-side afdwingen:
1. **Rol** via `requireRol(...rollen)` middleware op de route (functioneel: wie mag de actie überhaupt).
2. **Gebouwtoewijzing** via helper `magBijGebouw(userId, gebouwId)` ín de handler (object-level: bij
   WELK gebouw mag deze user). `TOEGEWEZEN_ROLLEN = ["monteur","controleur"]` zijn beperkt tot hun
   toegewezen gebouwen (`gebouwToewijzingen`); alle andere rollen passeren `magBijGebouw` (return true).

`magBijGebouw` is fail-closed voor toegewezen rollen: `gebouwId == null` → `false`. Bestaat in zowel
`voorzieningen.ts` als `gebouwen.ts` (eigen kopie per file, naast `gebruikerRol`/`toegewezenGebouwIds`).

**Resolutie-helpers** (gebouwId afleiden vóór de check): `gebouwIdVanVoorziening`, `gebouwIdVanVerdieping`,
`gebouwIdVanScheiding` (scheiding→verdieping→gebouw).

## IDOR-valkuilen die hier echt voorkwamen (architect ving ze drie reviews lang)
- **Elk** object-level endpoint (`/:id`, fotos, status, archief, scheidingen, gebouw-subresources) heeft
  een eigen `magBijGebouw`-check nodig — een rol-only guard is NIET genoeg; ID-guessing omzeilt het anders.
- **Geneste IDs koppelen aan de parent**: `DELETE .../fotos/:fotoId` moet deleten met samengestelde WHERE
  `id = :fotoId AND voorziening_id = :id` (anders verwijdert een toegestane voorziening een vreemde foto).
- **Integriteit bij create/update**: `verdieping_id` moet bij hetzelfde `gebouw_id` horen (anders kan een
  monteur cross-gebouw een voorziening aan een vreemde verdieping hangen). Check via `gebouwIdVanVerdieping`.
- **Mutaties zonder requireRol**: `PATCH .../archief` stond open voor elke ingelogde user (incl. klant) —
  mutatiepaden horen minstens `requireRol("monteur","controleur","beheerder","hoofdbeheerder")` te hebben.

## Bewuste scope-grens
`klant` wordt NIET door gebouwtoewijzing gefilterd (bestaand productgedrag; staat in replit.md). Een
architect-review zal dit als "te ruim" markeren — dat is een bewuste keuze, niet wijzigen zonder
expliciete gebruikersopdracht (kan klantportaal breken).

**Why:** drie architect-reviews op rij vonden steeds een nieuw object-level gat; de les is dat de check
per endpoint herhaald moet worden en dat geneste/afgeleide IDs altijd aan hun parent gekoppeld moeten zijn.

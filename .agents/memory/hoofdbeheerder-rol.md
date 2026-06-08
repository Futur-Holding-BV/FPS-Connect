---
name: Hoofdbeheerder als super-rol + rolwisselaar
description: Hoe de hoofdbeheerder alle portalen kan bekijken en alle backend-rolchecks passeert; wat synchroon moet blijven.
---

# Hoofdbeheerder = super-rol

De rol `hoofdbeheerder` is een super-rol met volledige rechten. Twee onafhankelijke plekken moeten in lockstep blijven:

1. **Backend** (`requireRol` in `artifacts/api-server/src/middlewares/auth.ts`): de hoofdbeheerder passeert ELKE rolcontrole, ongeacht de opgegeven toegestane rollen. Zonder deze bypass geeft een beheerder-only route (bv. `/gebruikers` POST/PATCH met `requireRol("beheerder")`) een 403 voor de hoofdbeheerder.
2. **Frontend rolwisselaar** ("Bekijken als"): alleen de hoofdbeheerder ziet een wisselaar (sidebar footer, in `gebruiker-menu.tsx`) om de actieve weergave te wisselen tussen beheerder/monteur/controleur/klant. De override staat in `localStorage` (`fps.actieveRol`) en wordt alleen toegepast als de echte rol hoofdbeheerder is. Standaardweergave zonder override = beheerder.

**Why:** Bij invoering van verplichte TOTP-login werd de oude portaalkeuze-demo verwijderd; de hoofdbeheerder verloor daarmee zowel de UI-wissel als (latent) backend-toegang tot beheerder-only routes.

**How to apply:** Voeg je een nieuwe `requireRol(...)` toe, dan hoeft hoofdbeheerder NIET in de lijst — de bypass dekt dat al. Portal-mapping (`Portalen` in `App.tsx`): klant→KlantPortal, monteur|controleur→MonteurPortal (controleur deelt bewust het monteurportaal), anders→BeheerderPortal.

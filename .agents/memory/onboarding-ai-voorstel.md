---
name: AI-onboardingvoorstel & functie-cascade
description: Wat de onboarding-AI wel/niet mag voorstellen en hoe het voorstel het formulier aanstuurt (rechten-preview, CAO).
---

# AI-onboardingvoorstel (geplakte tekst) & onboarding-cascade

De onboarding-AI (POST /medewerkers/ai-onboarding-voorstel, lib cvAnalyse `analyseerOnboardingTekst`)
leest geplakte brontekst (e-mail/arbeidsovereenkomst) en stelt onboarding-velden voor:
naam, e-mail, NAW/certificaten én de sturende velden **functie, werkmaatschappij,
contracturen, startdatum, dienstverband**.

**Regel: de AI stelt NOOIT rechten/rollen/bevoegdheden voor.**
**Why:** rechten volgen uit de gekozen functie → gekoppeld toegangsprofiel (`functies.profiel_id`
→ `profielen.bevoegdheden`); een AI-voorstel voor rechten zou de autorisatiegrens en de
zelf-escalatiecheck omzeilen. Structureel dichtgezet: `CvAnalyseVelden` bevat geen
bevoegdheden-veld, dus zelfs als het model het teruggeeft komt het nergens aan.

**How to apply:**
- Voorstel → formulier-state (voorstellen-dan-bevestigen): niets wordt aangemaakt tot de mens
  expliciet opslaat; alle velden blijven bewerkbaar. AI-paneel/banner = amber (zie ai-state-kleuren).
- functie-match (client) drijft de rechten-preview: exacte naam-match heeft voorrang boven
  substring (anders wordt bij meerdere "monteur"-functies de verkeerde voorgeselecteerd);
  niet-herkende functie apart melden, niet gokken.
- werkmaatschappij → CAO voorselectie (caoVoorWerkmaatschappij), alleen bij een waarde uit de
  vaste WERKMAATSCHAPPIJEN-lijst. dienstverband/uren via whitelist + clamp (1..48), datums via
  geldigeDatum() — AI-output mag nooit ongeldige waarden forceren.
- Bewijs-script: `pnpm --filter @workspace/scripts run verificatie-onboarding-voorstel`
  (echte login+TOTP; controleert functie→profiel→niet-lege bevoegdheden én dat sturende velden
  correct uit een aanstellingsmail komen).

Open vervolgpunten (aparte taken): functie zelf ook CAO/verlofsaldo laten voorstellen; en
hardening tegen stilzwijgend verkeerd gekoppeld rechten-preset in de cascade.

---
name: Uitnodiging-activatie pending wachtwoord
description: Activatiewachtwoord wordt pas na 2FA-bevestiging definitief; atomair gebonden aan geldige uitnodigingstoken
---

# Uitnodiging-activatie: wachtwoord pas definitief na 2FA

POST /uitnodiging/:token/activeren slaat het gekozen wachtwoord NIET direct op:
hash + taal + token gaan als `pendingWachtwoordHash`/`pendingTaal`/`pendingActivatieToken`
in de sessie. Pas in POST /auth/2fa/activeren wordt het definitief, via een
atomaire conditionele UPDATE (zelfde token, status ≠ geaccepteerd, niet
verlopen). Geen match → 409 + pending state gewist.

**Why:** hoofdbeheerder raakte bijna buitengesloten toen hij zijn eigen
activatielink opende, een testwachtwoord invulde en afbrak vóór 2FA — het echte
wachtwoord was toen al overschreven. Reviewer eiste bovendien token-binding:
anders kon een stale activatiesessie een inmiddels afgerond account alsnog
overschrijven (account-takeover-pad).

**How to apply:** elke flow die credentials wijzigt vóór een bevestigingsstap
moet de wijziging uitstellen tot ná die stap én de definitieve schrijf atomair
conditioneren op de nog-geldige trigger (token/status). Normale login en
first-install wissen de pending-activatievelden expliciet. Bewijs:
`scripts/src/bewijs-task851-activatie-wachtwoord.ts` (incl. stale-sessie-case).

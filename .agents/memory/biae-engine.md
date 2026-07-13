---
name: BIAE centrale event-bus
description: Business Intelligence & Automation Engine — gedeelde in-proces event-bus met dunne capability-adapters
---

# BIAE (Business Intelligence & Automation Engine)

Centrale in-proces event-bus in `services/biae/`. Zeven bestaande motoren
(workflow, governance, goedkeuring, fie, ai-decision, ai-context, security-intake)
zijn als DUNNE capability-adapters aangesloten via `init.ts` — de onderliggende
engine-bestanden zijn bewust NIET gewijzigd (geen regressie).

**Enige aanpassing aan bestaande engine:** WorkflowService publiceert na een
geslaagde transitie een `biae.publiceerEvent(...)` (na logAudit, vóór return).
Overige processen (offertes, HRM, goedkeuring) publiceren nog geen eigen events.

**Regel:** nieuwe proceskoppeling = event publiceren via `biae.publiceerEvent`,
NIET de bus-kern of andere engines herschrijven.

**compliance_signalen tabel:** de compliance-monitoringjob schrijft dedup'd
signalen naar deze tabel. De job faalt STIL (warning, loopt door) als de tabel
ontbreekt, en het beheer-endpoint geeft dan 500. Nieuwe schema's ALTIJD via
`pnpm --filter @workspace/db run push` naar dev pushen vóór jobs/routes testen.

**Bewijs-script:** `scripts/e2e-biae-bewijs.ts` (npm: `e2e-biae-bewijs`) logt in
met wachtwoord+TOTP (hergebruikt e2e-wachtwoord-testaccounts) en test 401-gating,
7 capabilities, compliance+kpi-feed. Endpoints gated op `requireBevoegdheid("systeem",1)`.

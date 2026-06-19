# FPS Connect — Projectstatus

_Automatisch bijgehouden — bijwerken na elk significant increment._  
_Laatste update: juni 2026_

---

## Platform

FPS Connect is het operationele platform voor brandpreventieve gebouwvoorzieningen. De klantgerichte naam is **FPS One**. Het platform bestaat uit één web-applicatie (FPS Connect / firevault), een mobiele monteur-app (FPS Monteur / Expo) en een gedeelde API-server.

---

## Modules — status op één blik

| Module | Status | Gereedheid |
|---|---|---|
| Gebouwenbeheer | Gebouwd | 100% |
| Spots & Uitvoering (V1.3) | Gebouwd | 100% |
| Plattegronden (SVG-editor + mobiel) | Gebouwd | 100% |
| Bibliotheek & Documenten (V1.2) | Gebouwd | 100% |
| DMS / Documentenbibliotheek | Gebouwd | 100% |
| Inspecties | Gebouwd | 100% |
| Onderhoud | Gebouwd | 100% |
| Rollen & Bevoegdheden (V1.1) | Gebouwd | 100% |
| AI Spotherkenning | Gebouwd | 100% |
| AI Bibliotheekvalidatie | Gebouwd | 100% |
| HRM / Personeel (Fase 1-basis) | Gebouwd | 100% |
| Dossiermodule (Fase 1-basis) | Gebouwd | 100% |
| Offerte Intelligence (Fase 1-basis) | Gebouwd | 100% |
| Planning (week-grid V1) | Gebouwd | 100% |
| Communicatie / Berichten (chat) | Gebouwd | 100% |
| Document Design System (visuele basis) | Gebouwd | 70% |
| V1.4 Opleverrapportage | In aanbouw | 60% |
| V1.5 Rapportenmodule | Gepland | 0% |
| V2.0 Mobiele monteurflow (volledig) | Geparkeerd | — |
| V3.0 HRM volledig / Medewerkerportaal | Geparkeerd | — |
| CRM volledig | Geparkeerd | — |
| S.G. Constructies | Geparkeerd | — |
| Fase 2 Bedrijfsbesturing | Geparkeerd | — |

---

## Technisch

- **Stack:** pnpm workspaces · Node.js 24 · TypeScript 5.9 · React + Vite · Express 5 · PostgreSQL + Drizzle ORM · Zod v4
- **API-routes geregistreerd:** 32 routers
- **DB-schema-bestanden:** 26
- **Authenticatie:** Eigen sessie-auth met verplichte TOTP (geen Clerk/Replit Auth)
- **AI-integraties:** OpenAI GPT-5 (HRM-opleidingsvoorstel), GPT-4o Vision (spotherkenning, documentanalyse), GPT-4o (bibliotheekvalidatie, gebouw AI-invullen)
- **Feature flags:** `VITE_FEATURE_PLANNING=true`, `VITE_FEATURE_CALCULATIE=false`

---

## Openstaande punten (prioriteit)

1. V1.4 Opleverrapportage afmaken: spotselectie, rapporttypes als presets, bijlagenpakket
2. Document Design System verdiepen: PDF-export, digitale ondertekening, per-werkmaatschappij beheer
3. V1.5 Rapportenmodule: gepersisteerde definitieve rapporten, reactietermijn, centrale bibliotheek
4. Legacy WBDBO/WRD/classificatie-weergave opschonen (technische schuld)
5. V2.0 Mobiele monteurflow: offline sync, routeplanning (geparkeerd — wacht op formeel akkoord)

---

## Teststatus

- **E2E-tests (Playwright):** menu-navigatietest aanwezig (`e2e-menu` workflow); TOTP-login timing geborgd
- **Typecheck:** volledig schoon (pnpm run typecheck)
- **Handmatige acceptatietest:** na elk increment uitgevoerd via preview

Zie [PROJECT_INTELLIGENCE_DOSSIER.md](./PROJECT_INTELLIGENCE_DOSSIER.md) voor het volledige dossier.

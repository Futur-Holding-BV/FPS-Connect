---
name: Bevoegdheden in de app-laag (APP_01)
description: Hoe menu-filtering, schermguards en basisrecht eigen gegevens werken in Expo + PWA
---

**Regels:**
- Expo berekent NOOIT zelf bevoegdheden: server stuurt effectieve bevoegdheden mee in login-respons én `GET /auth/me`; app ververst bij elke start (auth-context) en cachet in AsyncStorage. `/auth/me` staat op `requireAuth` zodat het bearer-pad werkt.
- Menu-items dragen de bevoegdheid die de backendroute WERKELIJK eist (gemeten, zie docs/metingen/APP_01_menu-bevoegdheden.md); niet-toegestane items worden verborgen, nooit uitgegrijsd. Schermen krijgen `BevoegdheidGuard` (nette weigering) — UI-gating ≠ access control, backend blijft poortwachter.
- Basisrecht (§4): eigen `/mijn/`-gegevens (declaraties, verlof, uren, loonstrookjes) eisen geen module — alleen ingelogd + geen klant; modules gelden alleen voor andermans gegevens. Declaraties-eigen-routes gebruiken `eigenGegevens` middleware.
- "Personeel" heet zonder personeel:1 "Mijn gegevens" (zelfde scherm, adaptief; teamstats alleen met recht).
- PWA: MeldingKnop + Bugreports-chip = module `systeem`; dashboardchips per module gefilterd; mobiel primaire chips + één "Meer"-dropdown; paginauitleg default uit.

**Why:** rechten zichtbaar maken in de UI zonder tweede waarheid naast de server; eerdere incidenten met client-side rechtenberekening.
**How to apply:** nieuw menu-item of scherm in de monteur-app → meet eerst de route-middleware, voeg `vereist` toe in menu.tsx en wrap het scherm in BevoegdheidGuard met dezelfde eis.

**Basislaag eigen gegevens geldt ook voor web (aug 2026):** zijbalk-hoofdstuk "Mijn gegevens" (sleutel `mijn`) in beheerder-layout is altijd zichtbaar, óók voor uitvoerend veld; /mijn/declaraties, /mijn/verlof, /mijn/salarisdocumenten en /uren zijn alleen-inloggen (backend scoopt eigen medewerker). Declaratie-detail: concept-acties (bewerken/indienen/verwijderen) zijn eigenaar-gebaseerd via useGetMijnMedewerker, exact zoals de backend (eigenaar-only ongeacht modulerechten); beoordelen/verwerken blijven niveau 3/4. Bekende gemelde mismatch: uren-pagina isManager gebruikt heeftNiveau("uren",1) terwijl backend personeel:1/2 hanteert — niet stilzwijgend aanpassen.

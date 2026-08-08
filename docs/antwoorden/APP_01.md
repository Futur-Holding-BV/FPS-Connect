# APP_01 — Bevoegdheden in de app-laag (menu, schermen, dashboard)

Datum: 8 augustus 2026 · Status: gebouwd en bewezen (dev)

## Wat is er gebouwd

### 1. Monteur-app (Expo): menu volgt de effectieve bevoegdheden
- De server stuurt bij login én bij elke app-start (verversing via `GET /auth/me`,
  nu ook bereikbaar met het mobiele bearer-token) de **effectieve bevoegdheden**
  mee. De app berekent zelf niets en combineert zelf niets (§3.1).
- Elk menu-item in het radiaalmenu draagt de bevoegdheid die de bijbehorende
  backendroute **werkelijk eist** (gemeten, zie `docs/metingen/APP_01_menu-bevoegdheden.md`).
  Items waar de gebruiker niet bij kan worden **niet getoond** — niet uitgegrijsd (§3.2).
- Schermen zijn beschermd met een gedeelde `BevoegdheidGuard`: wie via een direct
  adres binnenkomt zonder recht krijgt een nette uitleg + terugknop, geen leeg
  scherm of technische fout (§3.3).
- "Personeel" heet zonder personeel-recht **"Mijn gegevens"**; het scherm toont dan
  alleen de eigen onderdelen (verlof, loonstrookjes, opleidingen, kennisbank,
  CAO-keuzes, declaraties) en geen teamstatistieken.

### 2. Basisrecht eigen gegevens (§4)
- Eigen declaraties (bekijken, aanmaken, bewerken, indienen + declaratiebeleid
  lezen) zijn nu een **basisrecht** voor elke ingelogde medewerker (klanten
  uitgezonderd). De module `declaraties` blijft gelden voor andermans gegevens:
  de lijst-alle-route en beoordelen/verwerken zijn onveranderd beschermd.
- Verlof, uren, loonstrookjes en overige `/mijn/`-routes waren al basisrecht —
  gemeten en bevestigd, geen wijziging nodig.

### 3. PWA (FPS Connect): telefoonvriendelijk dashboard (§5)
- **Paginauitleg staat standaard uit**; wie hem wil kan hem aanzetten via de
  weergave-instellingen (bestaande toggle).
- De **"Melden"-knop** (bugmeldingen) staat niet meer bij iedereen in de topbalk:
  alleen zichtbaar met de module `systeem` (of hoofdbeheerder). De
  **Bugreports-chip** volgt dezelfde regel.
- De dashboard-chips zijn gekoppeld aan bevoegdheden (Spots→gebouwen,
  Projecten→offertes, Facturen/Bedrijfsgezondheid→financieel, HRM→personeel,
  Kwartaal/Maand→rapportages) en op een klein scherm staan alleen de primaire
  chips + **één "Meer"-doorgang** (dropdown) voor de rest — geen drie regels
  chips meer op een telefoon.

## Gemeten afwijkingen t.o.v. de opdracht-tabel (bewust NIET stilzwijgend aangepast)
| Onderdeel | Opdracht verwachtte | Werkelijk (gemeten) | Gekozen gedrag |
|---|---|---|---|
| Routeplanner | basislaag | backend eist niets extra's (`/mijn-werk` = alleen ingelogd) | basis, zichtbaar voor iedereen |
| Opname | module | backend eist alleen inloggen | basis |
| Voertuig melden | module | backend eist alleen inloggen | basis |
| Documenten | `dossiers` | backend eist `bibliotheek` niveau 1 | `bibliotheek:1` |
| Inkooporders | "magazijn hoger niveau" | leesroute eiste `magazijn:1` | backend-leesroutes verhoogd naar `magazijn:2`, gelijk aan menu/guard (besluit n.a.v. review) |
| Inkoop aanvragen | "magazijn hoger niveau" | bestelbon aanmaken eist `magazijn:3` | `magazijn:3` |

## Beslissingen voor René
1. **iPhones Jacqueline/Ruben** — hebben zij een iPhone? De PWA (FPS Connect)
   werkt daar gewoon op; de Expo-app is Android-eerst. Graag bevestigen zodat we
   weten of er actie nodig is.
2. **Dashboardchip per rol** — welke chip hoort standaard bij welke rol? Nu
   gekoppeld aan modules (zie boven); zeg het als een koppeling anders moet.
3. **Inkooporders-leesrecht** — end-to-end op `magazijn:2` gezet (backend +
   menu + guard), conform "hoger niveau" in de opdracht. Terugdraaien naar
   niveau 1 kan als dat toch de bedoeling was.

## Review-fixes (architect, 8 aug 2026)
- Dashboardkiezer nu voor iedereen met >1 toegestane weergave (was hoofdbeheerder-only);
  een opgeslagen keuze buiten de bevoegdheden springt terug naar de eerste toegestane chip.
- Inkooporders-leesroutes backend naar `magazijn:2` (zie tabel).
- Mobiele verversing: 401/403 op `/auth/me` = volledig uitloggen (ingetrokken
  token werkt niet meer door op een oude cache); alleen transiënte fouten houden de cache.

## Bewijs
- `scripts/src/bewijs-app01-bevoegdheden.ts` — groen (8 aug 2026): login/`me`
  bevatten bevoegdheden; medewerker zonder declaraties-module kan eigen
  declaratie aanmaken en indienen (201/200) maar krijgt 403 op de lijst-alle.
- e2e-menu (vol-bevoegd account: alle menu-items zichtbaar + doorlinken): 1/1 groen.
- e2e-web (firevault regressie incl. login/bevoegdheden): 39 geslaagd, 2 bewust overgeslagen.

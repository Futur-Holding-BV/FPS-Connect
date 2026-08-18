## 2026-08-18 — /app/ stuurde ingelogde hoofdbeheerder zelf terug naar de desktop (buitendienst-poort)

- **Probleem**: René kreeg op zijn telefoon op `connect.fps-one.nl/app/` het ingelogde Connect-welkomstscherm i.p.v. de monteuromgeving, terwijl de server aantoonbaar de monteur-HTML serveert. Oorzaak zat in de app zelf: de buitendienst-poort in `artifacts/monteur-app/app/_layout.tsx` deed voor élke ingelogde gebruiker zonder buitendienstprofiel een `window.location.replace("/")` — en `isUitvoerendVeld()` sluit de hoofdbeheerder expliciet uit. De app laadde dus wél, zag de bestaande sessie en gooide hem direct naar de desktop. Anonieme controles (curl/screenshots zonder login) raakten die poort nooit, vandaar de eerdere tegenspraak tussen meting en telefoon.
- **Oplossing**: de hoofdbeheerder mag de monteuromgeving altijd bekijken (toezicht/test); alleen overige niet-buitendienstprofielen gaan nog terug naar Connect. `isUitvoerendVeld()` zelf is ongewijzigd zodat de web-kant (verbergen kantoorhoofdstukken) niet meebeweegt.

## 2026-08-18 — Telefoons bleven op /app/ de oude desktop-HTML uit hun cache tonen (no-cache headers)

- **Probleem**: René kreeg op `connect.fps-one.nl/app/` hardnekkig de desktopomgeving, terwijl de server aantoonbaar de monteuromgeving serveert (titel "FPS Monteur", `versie.json` = `61363659`). Oorzaak: de desktop-HTML (SPA-fallback) en root-`sw.js` gingen zonder `Cache-Control` de deur uit, alleen met etag/last-modified. Browsers mogen zulke antwoorden **heuristisch cachen** — een telefoon die vóór MONTEUR_NU_01 ooit `/app/` bezocht (toen dat nog naar de desktop-SPA doorviel) bleef die oude HTML uit de eigen HTTP-cache tonen zonder de server nog te raadplegen.
- **Fix** (`deploy/Caddyfile`): SPA-fallback (desktop-index.html) krijgt `Cache-Control: no-cache`, net als root-`sw.js`/`manifest.webmanifest`/`versie.json` in de @static-handle. De monteurbestanden onder `/app/` hadden dit al. Browsers moeten HTML voortaan altijd bij de server hervalideren; oude heuristische kopieën verlopen vanzelf (levensduur = 10% van de leeftijd sinds last-modified) en kunnen daarna nooit meer terugkeren.
- Gecontroleerd en uitgesloten: DNS (één A-record, geen AAAA), service workers (root-sw slaat `/app` over sinds MONTEUR_NU_01, navigatie is network-first), Caddy-image (nieuw, `/app`-controle in de deploy liep groen).

## 2026-08-18 — App-installatie wijst nu naar de monteuromgeving (/app) i.p.v. Connect-desktop

- **Probleem**: alle installatie-QR's en -links (activatiepagina, uitnodigingsmail, PWA-testpagina) wezen naar `/connect/planning`. Op elke Connect-pagina geldt het desktop-manifest, dus "Zet op beginscherm" leverde daar altijd de desktopomgeving op — nooit de monteuromgeving.
- **Fix**: elke installatie-ingang stuurt nu naar `/app/`, waar het eigen manifest van de FPS Monteur-omgeving geldt (naam "FPS Monteur", start_url `/app/`, eigen iconen). De activatiepagina biedt zelf geen installatie-instructie meer aan, maar een QR + knop "Open de monteuromgeving"; toevoegen aan het beginscherm gebeurt dáár. `GET /api/auth/pwa-qr` en `/api/auth/pwa-url` geven de `/app/`-link terug; de uitnodigingsmail idem.
- **Meting manifest-per-pad** (`docs/metingen/PWA-manifesten-per-pad.md`): er staan géén twee manifesten op hetzelfde pad — `/manifest.webmanifest` (FPS Connect, scope `/`) en `/app/manifest.webmanifest` (FPS Monteur, scope `/app/`) zijn strikt gescheiden; ook de service workers respecteren die grens. Het probleem zat uitsluitend in de verwijzing.

## 2026-08-18 — GEBRUIKERS_01: profielenbron in onboarding, profielen bewerken gefixt, contractvorm + nul-urencontract

- **Eén profielenbron in "Kies een functie"** (gebruikersbeheer): de keuzelijst rendert nu rechtstreeks `GET /profielen` — alle 18 vaste presets én zelfgemaakte profielen verschijnen automatisch. De hardcoded lijst van 12 (waardoor o.a. Onderhoudsmonteur, Planner, Calculatie, Directie, Administratie, Wagenparkbeheerder, Magazijnbeheerder en Externe inhuur onzichtbaar waren) is vervallen; Hoofdbeheerder staat er als aparte systeemrol bij (alleen voor hoofdbeheerders).
- **Profielen bewerken werkt weer**: het potlood op `/beheer/profielen` deed niets door een `SelectItem` met lege waarde ("Geen categorie") — Radix crasht daarop zodra de dialoog rendert. Gefixt met een sentinelwaarde. De "Bewerken"-link in de rollenmatrix (`/beheer/rollen-rechten`) opent nu via `?profiel=<id>` direct de bewerkdialoog van het juiste profiel.
- **Nul contracturen en contract-einddatum in de onboarding**: contracturen 0–48 zijn nu overal geldig (oproep-/nul-urencontract; server was 1–40, scherm 48 — gelijkgetrokken). Nieuw veld "Contract-einddatum" bij niet-vast dienstverband. Bij afronden maakt de server via een gedeelde helper direct een arbeidsovereenkomst aan (vast→onbepaalde_tijd, tijdelijk→bepaalde_tijd, oproep→oproep, stage→stage; zzp/payroll/detachering/directie bewust niet), zodat de contractbewaking einddatum en aanzegtermijn meteen bewaakt. Concept-medewerkers (wizardstap 1, nog geen startdatum) krijgen bewust nog geen contract; de wizard-afronding via PATCH maakt er dan precies één aan (duplicate-guard, atomair in één transactie).
- **Bewijs**: `scripts/src/verificatie-gebruikers01.ts` — alle stappen PASS (o.a. echt geval: oproep, 0 uur, 6 maanden → contract zichtbaar in de bewaking). Antwoorden in `docs/antwoorden/GEBRUIKERS_01.md`, metingen in `docs/metingen/GEBRUIKERS_01-toets.md` (§4 jonge medewerkers: alleen meting, niets gebouwd).

## 2026-08-18 — ADMINISTRATIE_01 fase 3: werkmaatschappij hangt aan het werk + harde BV-controle vóór AccountView

- **BV op offerte en opdracht** (besluit René, correctie 1): elke offerte krijgt een werkmaatschappij-veld — bij aanmaken standaard de BV van het gebouw, maar op de offerte zelf wijzigbaar (één pand kan werk van meerdere BV's hebben; gebouw mag leeg). De opdracht erft de BV van de offerte en is daarna ook zelf wijzigbaar. Migratie `0082` voegt de kolommen toe en vult bestaande offertes/opdrachten vanuit de gebouw-default.
- **Factuur volgt de BV van het werk**: de werkmaatschappij van een factuur komt voortaan uit de keten offerte → opdracht → gebouw-default, met de bron zichtbaar in de API. De factuur-print gebruikt deze documenteigen BV en blokkeert zichtbaar als die onbepaalbaar is (nooit stil terugvallen op een andere BV).
- **BV-melding in de nacalculatie** (correctie 2): uren blijven bedrijfsbreed, maar de nacalculatie toont per medewerker de eigen BV naast de BV van het werk. Afwijkende uren en uren met onbekende BV worden apart geteld en amber gemarkeerd — melden, géén doorbelasting tussen BV's.
- **Harde controle vóór AccountView-boeking** (fail-closed): op de AccountView-koppeling wordt vastgelegd voor welke BV die administratie boekt (nieuw veld op de boekhouding-instellingenpagina, bewust zonder backfill). Elke boeking — automatisch, handmatig, forceer-herexport én batch — wordt geweigerd met een leesbare reden als de koppeling geen BV heeft, de factuur-BV onbepaalbaar is, of beide niet overeenkomen. Boeken in de verkeerde administratie kan daardoor niet meer.
- Review-hardening: het **fiscale factuurnummer** volgt nu dezelfde gedeelde BV-keten (offerte → opdracht → gebouw-default) als print/export — geen eigen afwijkende afleiding meer; de offertelijst geeft de BV mee; het Document Studio-model wordt bij verzenden gepind op de BV van het wérk (gebouw alleen legacy-fallback); en de BV-controle wordt ná de verzend-claim nóg eens vers herhaald (TOCTOU) met nette claim-teruggave bij weigering.
- Bewijs: `scripts/src/verificatie-administratie01-fase3.ts` — 18/18 groen (default uit gebouw, expliciete keuze wint, erven+wijzigen, factuurketen incl. bron, bv_controle afwijkend/onbekend, drie AccountView-weigeringen). Dekt taken #1113/#1114. Antwoorden: `docs/antwoorden/ADMINISTRATIE_01.md`.

## 2026-08-18 — Calculatie aanmaken voor Projectleider en Werkvoorbereider + echte reden bij bevoegdheids-weigering

- Gemeld door Ruben: calculatie aanmaken lukte niet. Oorzaak (geen storing): aanmaken vereist calculaties niveau 3 en alleen het profiel Calculatie had dat. **Projectleider en Werkvoorbereider gaan van niveau 1 (lezen) naar 3 (aanmaken)**; Commercieel (feitelijk 0) en Directie (1) blijven bewust ongewijzigd.
- Migratie `0081` werkt de systeem-profielen én bestaande accounts bij: accounts gekoppeld via herkomst-profiel plus een vangnet voor accounts zonder koppeling waarvan de matrix exact de oude preset is. Alleen ophogen naar 3; handmatig hogere of afwijkende accounts blijven ongemoeid. De migratie meldt de aantallen in de deploy-log (migratierunner toont nu ook RAISE NOTICE).
- Een weigering wegens ontbrekende bevoegdheid geeft voortaan de **werkelijke reden**: de 403 van `requireBevoegdheid` draagt module + vereist niveau + code `BEVOEGDHEID_ONTBREEKT` i.p.v. kaal "Geen toegang", en de calculatie-schermen (nieuw, plak-invoer) tonen die serverreden i.p.v. "probeer het opnieuw".
- Bewijs: `scripts/src/verificatie-calc-rechten.ts` — 8/8 groen (presets, 403 met reden op niveau 1, aanmaken lukt op niveau 3, Commercieel/Directie ongewijzigd).

## 2026-08-18 — ADMINISTRATIE_01 fase 1+2: één werkmaatschappijen-scherm + bankrekeningen per BV

- Bedrijfsgegevens en Werkmaatschappijen zijn samengevoegd tot één scherm op `/organisatie/werkmaatschappijen` (tab per BV, alle velden van beide oude schermen; geen veld verdwenen). De oude route `/organisatie/bedrijfsgegevens` verwijst automatisch door.
- Nieuwe sectie **Bankrekeningen** per werkmaatschappij: IBAN + tenaamstelling + doelen (Ontvangst, Crediteuren, Loon en optioneel G-rekening; meerdere doelen per rekening). IBAN wordt genormaliseerd en op controlegetal gecontroleerd (client én server); dubbele nummers binnen één BV worden geweigerd. Mutaties vereisen **Financieel & Facturatie niveau 4** (keuze René); overige bedrijfsgegevens blijven op Personeel niveau 2.
- Elke rekeningwijziging wordt gelogd (wie/wanneer/oud/nieuw) en per mail gemeld aan de hoofdbeheerders via het bestaande mailmechanisme; een mailfout blokkeert de wijziging nooit.
- Het losse iban-veld op de werkgever is nu **afgeleid** uit de ontvangstrekening van diezelfde BV en kan niet meer via werkgever-bewerken gezet worden — documenten en facturen kunnen daardoor nooit het nummer van een andere BV tonen. Ontbreekt een doel-rekening, dan wijst het scherm dat in amber aan en tonen factuurvoorbeelden "⚠ geen ontvangstrekening ingesteld" i.p.v. een demo-IBAN.
- Loonherkenning (SEPA-intake) herkent de werkmaatschappij voortaan aan de rekening(en) met doel "Loon".
- Review-hardening: elk doel kan per werkmaatschappij maar aan één rekening hangen (database-afgedwongen, migratie `0080`) zodat het afgeleide IBAN altijd eenduidig is; rekeningmutatie + auditlog zitten in één transactie (mail pas ná de commit); de factuur-print bepaalt de werkmaatschappij voortaan uit de documenteigen keten factuur→gebouw→werkgever en blokkeert zichtbaar als die ontbreekt (nooit terugvallen op de actieve BV); ook magazijn-bestelbonnen tonen nu het afgeleide ontvangst-IBAN i.p.v. de legacy-kolom.
- Migratie `0079` maakt de tabellen aan en neemt een bestaand werkgever-IBAN over; bewijs: `scripts/src/verificatie-administratie01-fase12.ts` (14/14 geslaagd, incl. rechten-, doel-uniek- en cross-BV-toetsen). Antwoorden: `docs/antwoorden/ADMINISTRATIE_01.md`.

## 2026-08-18 — INKOOP_BOEKING_01: factuur-PDF bij direct betaalde inkoop + automatische AccountView-boeking

- Een PDF die als bon wordt geüpload bij een direct betaalde algemene inkoop gaat nu door dezelfde AI-lezing als een mailfactuur en wordt als inkoopfactuur aan de inkoopregel gekoppeld; een foto blijft gewoon een bon. De factuur wordt vergeleken met de inkoop (leverancier genormaliseerd, bedrag incl. btw met de bestaande tolerantie max(€2, 2%); kostensoort als voorstel). Klopt alles en is er geen goedkeuring vereist → factuur klaar voor boeking en inkoop afgerond; wijkt iets af → bestaand signaal `algemene_inkoop_bedrag_afwijkend`, niets wordt stil verwerkt.
- Automatische AccountView-boeking: zodra een factuur op klaar-voor-boeking + geaccordeerd staat zonder openstaande goedkeuring wordt hij automatisch geboekt (achter de bestaande instelling `export_actief`; testmodus wordt gerespecteerd). Handmatige en batch-export blijven ongewijzigd en delen nu dezelfde exportkern (`accountviewExportService`). Mislukt de boeking, dan gaat een faalmail met de reden naar de hoofdbeheerder(s) via het bestaande mailmechanisme.
- Antwoorddocument met gemeten AccountView-instellingen en getoetste aannames: `docs/antwoorden/INKOOP_BOEKING_01.md`.

## 2026-08-18 — Spoedherstel: achtergebleven terugvaltest-sabotage uit de API-start verwijderd

- Het bewust kapotte startblok uit het terugvalbewijs van HERSTEL_BUNDEL_01 ("ROLLBACKTEST HERSTEL_BUNDEL_01", bedoeld voor uitsluitend de weggegooide testtak) bleek via de merge van taak #1061 tóch op main te staan: de dev-api crashte direct bij het opstarten en de eerstvolgende push zou een bewust kapotte api naar productie hebben gestuurd. Blok verwijderd; `artifacts/api-server/src/index.ts` is weer byte-identiek aan de laatst geverifieerde versie (bb3fd02a). Dev-api start groen, healthz ok; de rest van de #1061-merge (e2e-testbestanden) is gecontroleerd en in orde.

## 2026-08-18 — HERSTEL_BUNDEL_01: prod-storing verholpen + deploy-terugval waterdicht

- **Oorzaak storing 18 aug**: `@workspace/calculatie` stond in de external-lijst van `artifacts/api-server/build.mjs`. In het productie-image staat het pakket dan als onvertaalde TypeScript in node_modules en weigert Node het te laden (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`) — de api crashte direct bij het opstarten en de site lag plat. In dev viel dit niet op doordat de pnpm-symlink buiten node_modules oplost en Node de types daar wél zelf stript. Fix: regel verwijderd; het pakket wordt nu — net als `@workspace/db` — gewoon meegebundeld. Bewezen: bundel bevat de kernfuncties en start lokaal op in productiestand.
- **Terugval-vangnet gedicht** (`scripts/deploy-production.sh`): een falende `docker compose up -d` (containerstart mislukt) brak het script af vóórdat healthcheck + automatische rollback ooit draaiden — precies waardoor de kapotte stack bleef staan. Nu valt een startfout door naar de healthcheck (met api-crashlog direct in de Actions-run) en rolt het script bij een onbeantwoord gezondheidsadres automatisch terug naar de vorige gezonde commit; ook een falende build/start tijdens de rollback zelf breekt het script niet meer stil af.
- **Uitrol volgt de run-commit** (`deploy.yml` geeft `DEPLOY_COMMIT=GITHUB_SHA` mee): een handmatige dispatch op een tak rolt nu écht die tak uit i.p.v. stilzwijgend origin/main — nodig om terugval-runs veilig buiten main te kunnen bewijzen; een gewone push naar main gedraagt zich ongewijzigd.
- **Terugvalbewijs geleverd** (Actions-run 32110564770, tak `terugvaltest-herstel-bundel-01`): bewust kapotte api-start → crashlog in de run → healthcheck faalt → automatische terugval → "Rollback geslaagd" met healthz ok; de run faalt bewust zodat de mislukte deploy zichtbaar blijft.
- Naschot uit de bewijsrun: de rollback-rebuild bakte nog het commitlabel van de kapotte release in de images (`/api/versie` toonde de verkeerde commit terwijl de code al de gezonde versie was); de versievariabelen worden nu ná de rollback-reset opnieuw gezet.

## 2026-08-17 — CALC_KERN_01: één rekenkern, exacte bedragen, natelbaar

- **Eén rekenkern** (`lib/calculatie`, `@workspace/calculatie`): server én scherm rekenen nu via exact dezelfde pure functies — regelsoort-filtering (alleen regel/materiaal telt mee), optioneel apart, opslagen materiaal/arbeid, AK/ABK/risico/winst incl. vaste-bedragvariant, korting, btw. Intern wordt in hele centen (integers) gerekend; afronden gebeurt op precies één plek. Subtotalen zijn voortaan de som van per-regel afgeronde bedragen — daarmee is elk totaal exact natelbaar vanaf de getoonde regelbedragen.
- **Server** (`mod-calculatie.ts`): `berekenTotalen`, `berekenRegelTotaal` en `mapRegel` zijn dunne wrappers om de kern geworden. De print-data-route rekende met een afwijkende legacy-keten (vaste-bedragvlaggen genegeerd, winst over alleen het subtotaal i.p.v. subtotaal+AK+ABK+risico, korting incl. staart dubbel geteld); die route gebruikt nu de kern — bewuste gedragscorrectie waardoor print, detail en lijst altijd hetzelfde eindbedrag tonen.
- **Scherm** (`detail.tsx`, `print.tsx`): alle bedrag-`reduce`s zijn verdwenen; kostprijsoverzicht per categorie, aangeboden totaal, optioneel subtotaal, eenheidskosten, hoofdstuk-subtotalen en de volledige kostenopbouw (incl. marge) komen uit de kern. De live-voorvertoning tijdens typen rekent dus met dezelfde code als de server.
- **Geldvelden exact** (migratie `0077_calc-geldvelden-exact.sql`): alle geldkolommen van de calculatiemodule van `real` (float4) naar `numeric(12,2)` — tarieven.tarief, artikelen.in-/verkoopprijs, header-opslagen+korting, regels tarief/totaal/arbeids_tarief/onderaanneming_bedrag, inkoopitems prijs/bedrag. Normtijden, hoeveelheden en mu-per-eenheid blijven bewust gebroken getallen (real). Migratie stapsgewijs en fail-closed: nieuwe kolommen → vullen → per calculatie som oud vs. nieuw vergelijken (afwijking >½ cent per regel = harde stop, niets omgezet) → pas dan oude kolommen weg. Dev-uitkomst: 19 calculaties, 4 regels, 9 tarieven, 0 artikelen, 0 inkoopitems omgezet; **0 afwijkingen**.
- **Natellingen als tests** (`lib/calculatie/src/kern.test.ts`, draait mee in `pnpm test`): uurtarief € 60,91 exact over alle regels; normtijden 0,3/1,2/0,35/0,25/0,75/0,1 (manuren = hoeveelheid × normtijd); regelsoorten (tekst/kop/stelpost dragen € 0 bij, materiaal telt mee); negatieve regel −€ 6.361,74 verlaagt het totaal zonder dubbeltelling; plus een centen-precisietoets (300 × € 1,10 = € 330,00 exact). De twee volledige natellingen (Cityflat € 16.330,60 = € 12.180,71 + € 4.149,89; De Grundel € 294.452,65) staan klaar als skip-tests met de verwachte bedragen en worden gevuld zodra de volledige regelbestanden zijn aangeleverd.
- **Review-ronde**: vier extra vindplaatsen alsnog op de kern gezet — de maak-offerte-route (rekende met de oude keten zonder materiaal-/arbeidsopslag en zonder vaste-bedragvlaggen), de ENK-correctieregel (droeg het bedrag alleen in `totaal`, dat de kern bewust negeert — nu in `tarief`), het per-regel-totaal in de API-response (nu kern-berekend i.p.v. de opgeslagen kolom) en de client-spiegel in import.tsx. Plus: negatieve halve centen ronden bij percentages nu symmetrisch af (−0,005 → −0,01), met regressietest.
- Buiten scope gebleven conform opdracht: de schermindeling van detail.tsx is niet aangeraakt.

## 2026-08-17 — RECHTEN_HRM_02 §1 afgerond: laatste vier muterende factuur-routes van niveau 1 naar 2

- Het herstelpunt uit RECHTEN_HRM_02 (negen muterende routes achter financieel:1) was bij RECHTEN_BOEKHOUDER_01 al voor vijf routes doorgevoerd; de laatste vier zijn nu ook opgetild naar financieel:2: POST /facturen/:id/bevestig-inkoop, POST /facturen/:id/beoordelen-medewerker, POST /facturen/:id/opmerkingen en PATCH /facturen/:id/opmerkingen/:oid. De persoonsgebonden poorten (alleen de toegewezen inkoper/beoordelaar) blijven daarbovenop staan.
- Niveau 1 is daarmee puur leesrecht: geen enkele POST/PATCH/PUT/DELETE-route in de api-server staat nog op financieel:1 (grep-gecontroleerd).
- Vastlopers gezocht conform de opdracht: in de ontwikkeldatabase staat geen enkele gebruiker met financieel:1, en dus ook niemand met alleen leesrecht die als inkoper of beoordelaar aan een factuur hangt — er loopt niemand vast. Productie kan pas gecontroleerd worden zodra de SMOKETEST-secrets er zijn.
- Doorsturen ter beoordeling is fail-closed gemaakt: POST /facturen/:id/doorsturen-medewerker weigert nu (422, met naam) een beoordelaar die geen financieel:2 heeft — anders zou die na het optillen onvermijdelijk vastlopen op de beoordelen-route.
- Gedragsbewijs: nieuw script `bewijs-facturen-leesrecht` (12/12 groen) — wegwerpaccount met preset Externe boekhouder leest facturen/analyse/opmerkingen (200) en krijgt op alle negen muterende routes 403.

## 2026-08-17 — RECHTEN_HRM_02: HRM-adviseur ingeperkt + Poortwachter twee-stapsvrijgave (vier-ogen)

- **Punt 2 — profiel HRM-adviseur**: gebruikers 4 → 1 (alleen inzien; alle muterende gebruikersroutes zaten al op niveau 4, dus niveau 1 dekt uitsluitend GET /gebruikers). Nieuw: hrm_vrijgave 3. Profiel Directie krijgt óók hrm_vrijgave 3.
- **Punt 3 — migratie 0075**: nieuwe modulesleutel `hrm_vrijgave` (label "HRM-vrijgave") in de matrix; systeemprofielen HRM-adviseur/Directie en hun herkomstgebruikers bijgewerkt (LEAST voor verlagen gebruikers, GREATEST voor hrm_vrijgave, idempotent). Bijgewerkte bestaande accounts: 0 (HRM-adviseur) + 0 (Directie) — er hangen nog geen accounts aan deze profielen.
- **Punt 4 — Poortwachter twee-stapsvrijgave**: mijlpalen kennen nu klaarzetten (personeel:2) en vrijgeven (hrm_vrijgave:3) als gescheiden handelingen; de vrijgever mag nooit de klaarzetter zijn (403, server-side). Direct afronden via PATCH is geblokkeerd (422); PATCH doet alleen nog notities. Nieuwe routes: POST /hrm/poortwachter/:dossierId/mijlpalen/:type/{klaarzetten, klaarzetten-ongedaan, vrijgeven, terugsturen} (terugsturen eist een reden; die blijft zichtbaar bij de mijlpaal tot opnieuw klaarzetten). Vrijgave is definitief (bewuste beperking: geen ongedaan-route). Bestaande afgeronde mijlpalen blijven afgerond (afgerond_op blijft dé afrondingsmarker).
- **Routefix**: de bestaande poortwachter-routes stonden zonder /hrm-prefix op de server terwijl de OpenAPI-spec (en dus de webclient) /hrm/... aanroept — de dossier-sheet deed het daardoor sinds bouwstuk 1 niet via de web-UI. Alle 7 routes nu op /hrm/... conform spec.
- **Bewaking**: mijlpaal die >3 dagen klaarstaat zonder vrijgave → werkbak-taak ("doen") voor wie hrm_vrijgave:3 heeft, vóór de deadline-vensterfilter zodat ook verre deadlines niet blijven hangen.
- **Frontend** (poortwachter-sheet): status "Wacht op vrijgave", klaarzetten/ongedaan-knoppen (personeel≥2), vrijgeven/terugsturen-knoppen met verplichte reden (hrm_vrijgave≥3), teruggestuurd-reden zichtbaar, klaarzetter+vrijgever met naam bij afgeronde mijlpalen.
- **Atomaire overgangen**: elke statusovergang (klaarzetten/ongedaan/vrijgeven/terugsturen) is één conditionele UPDATE mét de verwachte huidige status (incl. vier-ogen-voorwaarde) in de WHERE; gelijktijdige conflicterende verzoeken krijgen 403/409 en kunnen een afgeronde audittrail nooit overschrijven of wissen (architect-review-bevinding).
- Bewijs: `scripts/src/bewijs-hrm-vrijgave.ts` — 19/19 groen (incl. vier-ogen-403, middleware-403, terugstuur-flow, twee parallelle race-checks, profielcontrole).

## 2026-08-17 — RECHTEN_BOEKHOUDER_01: leesrecht financieel voor de externe boekhouder

- Profiel "Externe boekhouder" (lib/permissies) uitgebreid met leesrecht niveau 1 op financieel en financieel_vertrouwelijk; salarisarchief/salaris_mutaties/boekhouder_portaal ongewijzigd, projecten/offertes/opdrachten blijven dicht.
- Migratie 0074 werkt het systeemprofiel én bestaande accounts met herkomst_profiel_id bij (GREATEST-merge: nooit verlagen, idempotent).
- Route-audit financieel/financieel_vertrouwelijk niveau 1: muterende/exporterende routes opgetild naar niveau 2 (facturen upload-url, POST /facturen, PATCH /facturen/:id, ai-uitlezen, ter-goedkeuring-indienen, historisch-archief Excel-export). Bewuste uitzonderingen op niveau 1: bevestig-inkoop (persoonsgebonden via inkoperId), beoordelen-medewerker (nu ook persoonsgebonden via nieuwe beoordelaarId-guard) en factuur-opmerkingen (dialoog van die flow).

## 2026-08-17 — HERSTEL_MAIL_01: deploy-blokkade, onbestelbare adressen, prod-guard, rijkere faalmail

- **Punt 1 — deploy-blokkade & scanner-paden.** Virus-/YARA-scannerpaden zijn nu env-overschrijfbaar (YARA_RULES_PAD, CLAMAV_BIN, quarantainemap) en `controleerScannerPaden()` logt bij het opstarten luid welke paden ontbreken, inclusief de env-var om ze te zetten. De absolute-pad-import die de deploy brak was al gefixt; de eerstvolgende groene deploy-run is het bewijs.
- **Punt 2 — onbestelbare mailadressen zichtbaar en afhandelbaar.** Contactpersonen dragen `mail_onbestelbaar_op/_reden` in de API; nieuw endpoint `GET /crm/onbestelbaar` (werklijst met organisatienaam). Nieuwe pagina CRM → "Onbestelbare adressen": nieuw adres invullen (wist de status server-side bij adreswijziging) of contact afvoeren. Klantdetail toont een rood label bij gekaatste adressen. Bewijs: `scripts/src/bewijs-onbestelbaar-ui.ts` — 10/10 groen.
- **Punt 3 — bewijsscripts kunnen nooit meer per ongeluk tegen productie draaien.** Nieuwe guard `scripts/src/lib/prodGuard.ts` (hard stoppen zodra het doel naar connect.fps-one.nl wijst; bewuste lees-vrijstelling via PROD_LEZEN_TOEGESTAAN=1), als side-effect-import toegevoegd aan alle 94 bewijs-/verificatie-/metingscripts. Opschonen van achtergebleven testdata: `opruim-bewijsdata`-script (droogdraai standaard, VERWIJDER=1 om echt op te ruimen) + handmatige GitHub Actions-workflow "Opruimen bewijs-testdata (productie)". Dev-omgeving gescand: 0 vondsten.
- **Punt 4 — faalmail vertelt nu wát er brak.** Elke kritieke deploy-stap registreert zijn naam en uitvoer; de faalmail meldt de gefaalde stap, de laatste 15 uitvoerregels én of de productieserver al was aangeraakt (of ongewijzigd doordraait). Testmodus via workflow_dispatch-input `test_faalmail=TEST` (faalt bewust vóór elk servercontact) voor een end-to-end bewijs zonder productie te raken.
## 2026-08-17 — Medewerkerkaart: kopieerbare download-link telefoonapp

- Op elke medewerkerkaart (personeel/detail) staat nu een blok "Telefoonapp" met de publieke installatielink (/app), klikbaar én met kopieerknop (clipboard + prompt-fallback). Zo kan iedereen de download-link direct doorgeven, bv. via WhatsApp.

## 2026-08-17 — Personeel: zoekfilter, eigen/inleen-scheiding, cruciale datums + sidebar-signalen

- Personeelsoverzicht: zoekveld (naam/functie/werkmaatschappij/e-mail); eigen medewerkers alfabetisch, inleners (dienstverband uitzend/inhuur) alfabetisch onder een scheidingslijn "Inleen".
- Nieuw endpoint GET /contract-bewaking/cruciale-datums (personeel:1, afgeleide view): per actieve medewerker de meest urgente deadline — uiterste aanzegdatum (einddatum − 1 maand bij contractduur ≥ 6 mnd, Wet Aanzegging) of einddatum bij tijdelijke contracten, en ZZP-einddatums incl. DBA-duurwaarschuwing (verband ≥ 9 maanden → risico schijnzelfstandigheid).
- Medewerkerkaarten (eigen én inleen) tonen deze cruciale datum: rood met waarschuwingsicoon bij urgentie (≤ 30 dagen of DBA-risico), anders amber; tooltip met volledige reden.
- Sidebar (Personeel-hoofdstuk, personeel:2/hoofdbeheerder — o.a. Jacqueline en René): rood telbadge op het hoofdstuk + directe meldingsregels per dreigende overschrijding; klik navigeert naar de betreffende medewerkerkaart. Verversing elke 5 minuten.

## 2026-08-17 — Personeelsdossier: AI benoemt documenttype i.p.v. 'Overig'

- De documentclassificatie kent nu binnen personeelsdocumenten alle dossiertypen: functiebeschrijving, identiteitsbewijs/paspoort/verblijfsvergunning/rijbewijs, VCA/BHV/EHBO-certificaat, diploma, loonstrook, NAW-formulier, geheimhoudingsverklaring en AOW-verklaring (naast CV en arbeidscontract). Deterministisch vangnet voor functiebeschrijvingen toegevoegd.
- Bij upload in het personeelsdossier zet de achtergrondanalyse het documenttype automatisch wanneer het nog 'overig' is en de AI een bekend type herkent (whitelist, fail-closed; 'arbeidscontract' genormaliseerd naar het canonieke 'contract'). Een handmatig gekozen specifiek type wordt nooit overschreven.
- Nieuw endpoint POST /medewerkers/:id/documenten/heranalyse + knop "Automatisch benoemen" op de Documenten-tab (zichtbaar zodra er 'overig'-documenten staan) om bestaande documenten alsnog te benoemen.
- Frontend: nieuwe kopjes/labels Functiebeschrijving en AOW-verklaring; legacy-typen (arbeidscontract, id_bewijs, rijbewijs_scan) vallen nu onder het juiste kopje en tellen mee in de dossiervolledigheid.

## 2026-08-17 — Deploybewaking adaptief + dubbele typecheck uit het api-image

- Tijdbewaking in deploy.yml meldt niet langer op een vaste grens van 8 minuten (die bij vrijwel elke uitrol werd overschreden — 16 identieke mails op één dag), maar alleen bij een verslechtering: wanneer de uitrol meer dan de helft langer duurt dan de mediaan van de laatste tien geslaagde uitrollen (via de GitHub API), en hoogstens één tijdmelding per dag (datummarker `/opt/fps-one/.deploy-tijdmelding-datum` op de VPS). De schijfbewaking is ongewijzigd.
- Oorzaak van de trage uitrol weggenomen: deploy/Dockerfile.api draaide `typecheck:libs` en de api-server-typecheck opnieuw ín het image, terwijl de workflow die vooraf al volledig op de runner draait. Via build-arg `TYPECHECK_IN_IMAGE` (doorgegeven vanuit deploy.yml → deploy-production.sh → compose) draait de typecheck in het image alleen nog bij een NOODFIX-uitrol, waar de controle vooraf bewust wordt overgeslagen. Buiten de pipeline blijft de default veilig aan. Overslaan is bewezen veilig: esbuild bundelt rechtstreeks vanuit `src/` (alle @workspace-packages exporteren TypeScript-bron).

## 2026-08-17 — Smoketest-serviceaccount voor de post-deploy controle

- Nieuw beheerscript `pnpm --filter @workspace/db run smoketest-account` (lib/db/scripts/smoketest-account.mjs): maakt idempotent het vaste smoketest-account `smoketest@fps-brandpreventie.nl` aan (wachtwoord uit omgevingsvariabele `SMOKETEST_PASSWORD`, minimaal 16 tekens — staat nooit in de repo). Draaibaar op de productieserver via de bestaande migrate-container.
- Nieuwe kolom `gebruikers.twee_factor_vrijgesteld` (migratie 0073): de loginroute geeft een vrijgesteld account direct een volledige sessie (`{status:"ingelogd"}`), omdat de smoketest geen TOTP-stap kan doorlopen. De vlag is uitsluitend via het beheerscript of directe SQL te zetten, nooit via UI of API.
- Rol in de sessie wordt nu bij élke login gezet (`req.session.rol`): de governance-engine blokkeerde kritieke acties (zoals gebouw verwijderen) anders óók voor hoofdbeheerders omdat de rol in cookie-sessies nooit werd gevuld.
- Het account krijgt rol hoofdbeheerder (vereist door de governance-engine voor de verwijder-check) met een minimale bevoegdheden-matrix (gebruikers:1, gebouwen:4) als documentatie van wat de smoketest werkelijk gebruikt. Alle 15 smoketest-checks zijn in de ontwikkelomgeving end-to-end bewezen (login 200, lijsten 200, gebouw aanmaken/bijwerken/verwijderen 200/200/204).

## 2026-08-17 — Werk-inbox-teller ook op hoofdstuknaam Communicatie

- Het rode rondje met het aantal ongelezen werk-inbox-mails is nu ook zichtbaar op de hoofdstuknaam "Communicatie" in de sidebar (net als bij Goedkeuring en Declaraties), zodat je het aantal ziet zonder het hoofdstuk te openen. Het hoofdstukrondje telt ongelezen chatberichten en ongelezen, niet-afgehandelde werk-inbox-mails samen.
- Nieuw lichtgewicht endpoint `GET /api/werk-inbox/telling` (alleen database, gescoped op de mailboxen waar de gebruiker toegang toe heeft) voedt de teller; het Werk-inbox-item in het uitklapmenu toont hetzelfde rondje.

## 2026-08-17 — Offerte-aanvraag (e-mail) verplaatst van Offertes naar Projecten

- De knop "Offerte-aanvraag (e-mail)" stond op de Offertes-pagina; een aanvraag maakt echter een nieuw project (gebouw + offerte + opname) aan en hoort dus bij Projecten. De knop heet nu "Nieuwe aanvraag (e-mail)" en staat op het projectenoverzicht naast "Nieuw gebouw" (alleen beheerders); de wizard zelf is ongewijzigd.
- De knop op de Offertes-pagina is verwijderd.

## 2026-08-17 — Factuurafdruk: ketenkenmerk erop, betalingskenmerk herleidbaar, geen afdruk zonder fiscaal nummer

- Het ketenkenmerk (bv. O405/F002) staat nu als "Ons kenmerk" op de factuurafdruk naast het fiscale factuurnummer. Het fiscale nummer alleen is niet herleidbaar: de drie BV's hebben elk een eigen reeks die bij hetzelfde getal begint; het ketenkenmerk hangt via de offerte aan gebouw en BV.
- De betalingsinstructie vraagt nu om vermelding van "factuurnummer / ketenkenmerk" zodat het bankafschrift eenduidig naar één administratie wijst.
- Een factuur zonder fiscaal factuurnummer is niet meer afdrukbaar: in plaats van de eerdere terugval op FACT-<intern id> toont de printpagina een duidelijke blokkade ("eerst definitief maken") en start het afdrukken niet.

## 2026-08-17 — Geüploade offerte-aanvraag e-mails (.eml) worden weer als aanvraag herkend

- Probleem: een geüploade offerte-aanvraag (bv. "De Aak 71 — plafonds brandwerend maken") belandde bij documenten in plaats van het aanvraagproces te starten. Oorzaak: bij .eml/.msg-bestanden las de documentclassificatie de rauwe bytes — de eerste duizenden tekens zijn mailheaders/DKIM-handtekeningen, waardoor de AI alleen ruis zag en het bestand als algemeen document indeelde.
- Fix: e-mailbestanden worden nu écht geparsed (onderwerp, afzender, inhoud, bijlagenamen) vóór classificatie, ook als de browser een generiek MIME-type meestuurt. De De Aak-mail classificeert nu als "aanvraag" (vertrouwen: hoog), waardoor de slimme upload direct de stap "Offerte-aanvraag verwerken" toont die het aanvraagproces start.
- Regressietests toegevoegd voor .eml-extractie (herkenning op extensie én MIME-type).

## 2026-08-17 — Uniek volgkenmerk prominent bovenaan alle Projectaanpak-detailpagina's

- Nieuw gedeeld kop-element (KenmerkKop) dat het automatisch berekende ketenkenmerk (bv. BP-G156/C590/O405) duidelijk bovenaan toont — hetzelfde kenmerk dat op de uitgaande documenten (offerte, factuur) staat.
- Toegevoegd op: gebouw-detail ([PFX-]G…), calculatie-detail ([PFX-]G…/C…), offerte-studio (…/O…), opdracht-detail (keten via de offerte), opname-detail ([PFX-]G…/M…), magazijn-inkooporder (G…/I…) en factuur-detail (O…/F…).
- Calculatie: de interne CALC-referentie (CALC-2026-…) staat niet langer prominent in de paginakop — die is een intern registratienummer en niet het nummer dat op de offerte komt; hij blijft zichtbaar als "Ref:" in de gegevensstrip. Het ketenkenmerk (…/C…) dat doorloopt in het offertekenmerk staat nu vooraan.
- API: gebouw-, opdracht- en opname-detailresponses geven nu ook het berekende kenmerk terug (nieuwe helper voor de M-reeks).

## 2026-08-17 — Paginabreedte begrensd op brede schermen (Externen + 7 andere pagina's)

- Externen werd paginabreed getrokken waardoor tekst en knoppen tegen de rechterrand stonden; de pagina is nu begrensd op dezelfde maximale breedte als de rest (max-w-6xl, gecentreerd).
- Zelfde correctie doorgevoerd op: Capaciteitsplanning, Jaarafsluiting, Jaarplanning, Uitboarden, Verlof-instellingen, Werving-detail en Beeldbank — de enige pagina's die de breedtebegrenzing nog misten.

## 2026-08-17 — MOBIEL_01: onderbalk-ruimte, wijkende zwevende knop en tabelpatroon Organisaties

- Onderbalk (Uitloggen/NIEUWS) dekt de laatste kaart niet meer af: pagina-onderruimte rekent nu balkhoogte + veilig gebied van de telefoon mee (viewport-fit=cover, env(safe-area-inset-bottom)); gemeten 31px vrije ruimte op 402px.
- Zwevende ondersteuningsknop schuift tijdens scrollen rechts uit beeld (doorklikbaar uit) en keert kort na het stoppen terug; hij staat ook boven het veilige gebied.
- Overzicht Organisaties is nu één echte tabel voor alle breedtes (MOBIEL_01-tabelpatroon): zes kolommen op desktop; op telefoon blijven Organisatie en Relatie staan en stapelen type/locatie/contact ónder de naam in de eerste cel. Rij-klik opent het dossier.
- Bewijs: Playwright-metingen + screenshots op 402×874 en 1280×900 met gevulde demo-organisaties (na afloop opgeruimd).

## 2026-08-17 — Onzinjaartallen in personeelsdatums geweigerd én geheeld

- Gemeld defect: personeelsdossier toonde "Uit dienst per 14 jul 82026" — een onzinjaartal dat via dossier-analyse/invoer ongehinderd in de tekstkolom belandde.
- API valideert nu alle datumvelden van het medewerkerprofiel (in/uit dienst, geboortedatum, rijbewijs/VCA/EHBO/BHV-verval) op echte kalenderdatum JJJJ-MM-DD met jaartal 1900–2100; anders 422 met veldnamen (aanmaken, wijzigen én offboarden).
- Validator is gedeeld (lib/datumSaniteit) en dekt álle schrijfpaden: HRM-routes, onboarding, doorvoer van goedgekeurde AI-voorstellen én de medewerker-import (fail-closed).
- Migraties 0071 + 0072 wissen bestaande onzinwaarden en kalenderongeldige datums (NULL = onbekend); draaien via de deploy ook op productie.
- Bewijs: API-run — onzinjaar op POST en PATCH → 422, geldige datum → 201.

## 2026-08-17 — Eigen modules "Social media" en "Merk" in de bevoegdheden-matrix (#1037/#1038)

- Social en Merk (merkenkast + beeldbank) zijn losgekoppeld van het CRM-recht, zelfde aanpak als Marketing.
- Module **social**: niveau 3 = opstellen/klaarzetten (preset Commercieel), niveau 4 = plaatsen en koppelingen beheren (preset Directie). Verder niemand.
- Module **merk**: niveau 1 = zoeken/downloaden (presets Calculatie, Administratie, Projectleider — voor logo's en projectfoto's in offertes, brieven en rapportages), niveau 3 = ook uploaden (presets Commercieel en Directie). Veldprofielen krijgen niets.
- Huisstijl beheren blijft onder organisatiebeheer; de merkenkast toont die gegevens alleen.
- Migratie 0070 is alleen-verhogend en idempotent; handmatige profielen blijven op 0 (fail-closed).
- API-routes en sidebar/paginagating omgezet naar de nieuwe modules.
- Bewijs (#1038): `scripts/src/bewijs-module-rechten-1038.ts` — 21 checks tegen de echte API met wegwerpgebruikers per preset (marketing/social/merk, incl. weigeringen), alle geslaagd.

## 2026-08-17 — Naam "FPS Connect" beter zichtbaar in navigatie en welkomstpagina

- Het volledige logo-plaatje (met kleine, onleesbare "FPS Connect"-tekst en wit blok) is vervangen door een vrijstaand schild-icoon (transparante achtergrond, `assets/logo-fps-schild.png`) met daarnaast de naam "FPS Connect" als echte tekst — scherp op elk formaat en leesbaar in licht én donker schema.
- Doorgevoerd op: sidebar-header beheerderlayout, mobiele topbalk en het linkerpaneel van de welkomstpagina.
- Bewijs: Playwright-screenshots licht/donker van welkomstpagina en planning-sidebar.

## 2026-08-17 — Werkmaatschappij-keuzelijsten live uit de werkgevers-API

- Het planning-filter en alle HRM-dropdowns (onboarding, medewerkerdetail, functiebeheer) tonen nu álle actieve werkmaatschappijen uit de database — de vanmorgen aangemaakte FPS Bouw en Renovatie verschijnt direct, zonder codewijziging bij een volgende nieuwe BV.
- Nieuwe hook `useWerkmaatschappijen()` in `lib/werkmaatschappijen.ts`: namen én CAO-voorselectie komen uit GET /werkgevers (werkgevers.cao is bron van waarheid); de statische lijst is alleen nog fallback tijdens het laden. Gedragscorrectie: FPS Bouw selecteert nu Bouw & Infra voor (stond hardcoded op Metaal & Techniek, DB zei Bouw & Infra).
- Bewijs: `scripts/src/bewijs-planning-wm-filter.ts` (Playwright) — dropdown toont alle 4 werkmaatschappijen incl. FPS Bouw en Renovatie.
- Controle overige acties na aanmaken werkmaatschappij: rij + CAO + actief staan goed in DB; gesignaleerde gaten (hardcoded FPS-branding in offerte-/mailroutes, leeg kenmerk_prefix, geen automatische mailafzender/social-provisioning) apart gerapporteerd.

## 2026-08-17 — Deploy-blokkade opgelost: absoluut Replit-pad in verificatiescript

- Acht mislukte uitrollen op rij (sinds #346) kwamen door één regel: `scripts/src/verificatie-storage-links.ts` importeerde `@google-cloud/storage` via het absolute pad `/home/runner/workspace/artifacts/api-server/node_modules/...`, dat op de GitHub-runner niet bestaat.
- Fix: normale import van `@google-cloud/storage`, toegevoegd als afhankelijkheid van het scripts-pakket. Regel voortaan: nooit werkruimte-absolute paden in code die op main komt.
- Gecontroleerd op meer voorkomens: broncode van scripts/lib is schoon; `/home/runner/workspace`-paden bestaan verder alleen in Replit-only shellscripts (freshclam) en in api-server-services met env-override (ClamAV/YARA/quarantaine) — bestaand gedrag, buiten deze fix gelaten.
- CI + "Deploy naar productie" op commit 8ec7917 zijn weer groen.

## 2026-08-17 — Eigen module "Marketing" in de rechtenmatrix (MARKETING_02)

- Marketing (doelgroepen, sjablonen, campagnes) is losgekoppeld van de CRM-module en heeft nu een eigen module `marketing` in de bevoegdheden-matrix (akkoord René): niveau 3 = beheren + proefverzenden, niveau 4 = campagnes écht verzenden en stoppen.
- Presets: Commercieel krijgt marketing 3; Directie krijgt marketing 4 (expliciete keuze René). Overige presets en handmatige profielen blijven op 0 (fail-closed); toekennen kan via Rollen & Rechten.
- Migratie `0069_marketing-module.sql` tilt systeem-presets én daaruit afgeleide gebruikers mee (alleen-verhogend, idempotent).
- Backend `marketing.ts` gate't nu op `marketing` 3/4; toestemming-beheer op contactpersonen blijft bewust onder `crm` 2. Sidebar-link en verzendknoppen volgen de nieuwe module.

## 2026-08-17 — KLEURACCENT_01: hoofdstukkleur doorgetrokken in het werkscherm

- **Uitvoering:** UI-verfijning firevault (NAV_01/KLEURACCENT_01) | **Kwaliteit:** hoog | **Risico:** laag (alleen CSS + twee data-attributen; tokens ongewijzigd)

De hoofdstukkleur is nu overal in het werkscherm zichtbaar, zodat je aan het beeld ziet in welk deel van Connect je werkt: het actieve tabblad onderstreept in de hoofdstukkleur, kaarten en panelen krijgen een zachte hoofdstuk-tint in de rand, pictogrammen in kaartkoppen kleuren mee, en de actieve staat van schakelknoppen krijgt een licht hoofdstuk-vlak met randlijn. Alles app-breed via CSS op de bestaande [data-hoofdstuk]-container — geen wijzigingen per scherm, geen kleurwaarden in schermen, en routes zonder hoofdstuk (dashboard, instellingen) blijven accentloos.

Geborgd: primaire actieknoppen behouden hun eigen kleur; waarschuwings-/fout-/succeskleuren winnen altijd van het accent (de kaartrand-regel staat bewust op specificiteit nul); tekst staat nooit op een verzadigd gekleurd vlak (WCAG AA). Licht én donker schema geverifieerd met schermafdrukken (scripts/src/kleuraccent-screenshot.ts). Los daarvan geconstateerd (bestaand, niet door deze wijziging): kaartkoppen op de gebouwpagina zijn in donker schema te dof — apart op te pakken.

## 2026-08-17 — "Wie is online" rechtsboven toont nu álle actieve collega's, ook na een serverherstart

- **Uitvoering:** defect-fix api-server (aanwezigheids-tracker) | **Kwaliteit:** hoog | **Risico:** laag (zelfde 5-minutenvenster; alleen de bron verplaatst)

De online-indicator rechtsboven hield de aanwezigheid alleen in het servergeheugen bij: na elke herstart of nieuwe deploy was de lijst leeg en verschenen collega's pas weer zodra ze zelf iets aanklikten. Daardoor leek vaak maar één iemand (of niemand) online terwijl er meer mensen ingelogd waren.

De aanwezigheid wordt nu (gedebounced, max. één schrijfactie per minuut per gebruiker) in de database bijgehouden (gebruikers.laatst_online, dat al bij het inloggen werd gezet) en de lijst komt rechtstreeks uit de database: iedereen die de afgelopen 5 minuten actief was, exclusief jezelf en gearchiveerde accounts, alfabetisch. De lijst overleeft daarmee herstarts en klopt ook met meerdere serverprocessen.

Bewijs: `scripts/src/verificatie-online-gebruikers.ts` — een collega die alleen in de database als actief geregistreerd staat (dus zonder enige activiteit in het huidige serverproces) verschijnt in de lijst, de aanvrager zelf nooit, en na 10 minuten inactiviteit verdwijnt de collega weer.

## 2026-08-17 — Hoofdstuk-accent prominenter + gekleurd merkteken bij de paginatitel

- **Uitvoering:** UI-verfijning firevault (NAV_01) | **Kwaliteit:** hoog | **Risico:** zeer laag (alleen opmaak; tokens ongewijzigd)

Op verzoek van René is het hoofdstuk-accent op de werkpagina's prominenter gemaakt: de accentlijn boven de pagina is dikker (2px → 4px) en de paginatitel krijgt nu een gekleurd merkteken (afgeronde balk) in dezelfde hoofdstukkleur. Het merkteken is opt-in per titel (`data-paginatitel`, ~187 werkpagina's getagd) en werkt alleen binnen de pagina-inhoud — geportalde dialogen en geneste document-previews blijven onaangeroerd. Kleuren komen ongewijzigd uit de bestaande `--hoofdstuk-*`-tokens (@workspace/ontwerp), dus licht/donker schema en de AA-contrastmetingen blijven gelden.

## 2026-08-17 — Defect: dode /api/storage/files-downloadlinks omgezet naar de bestaande beveiligde route

- **Uitvoering:** defect-fix in api-server + firevault (migratie 0068) | **Kwaliteit:** hoog | **Risico:** laag (alleen link-opbouw en datamigratie; geen ACL- of routewijziging)

Links met `/api/storage/files?path=...` kwamen nergens uit: die route heeft nooit bestaan (routes/storage.ts kent alleen public-objects, objects en thumbnails). Alle generatoren zijn omgezet naar de bestaande, beveiligde route `/api/storage/objects/<subPath>` — dezelfde toegangscontrole (inloggen + gebouw- en document-ACL) als de merkenkast/beeldbank (MERK_01) — via een nieuwe gedeelde helper `lib/storageObjectsUrl.ts`.

Omgezette plekken: factuurstroom (factuur-PDF, dagelijks gebruikt), werkgeverslogo-pad (raakt calculatieprint + merkenkast), mandagstaat-bijlage, offerte-sectiefoto's, aanvraagstroom-mailbijlagen, snagstream-rapport-AI-download en de firevault-schermen facturen-detail en visual-library. Reeds opgeslagen dode links in facturen, werkgevers, aanvraag_voorstellen, offerte_secties zijn met migratie 0068 herschreven; lezers (werkgever-logo-pad, factuur-uitlezen, snagstream) accepteren het historische formaat ook nog.

Bewijs: `scripts/src/verificatie-storage-links.ts` — per plek een echt bestand geopend via de nieuwe link (200 + byte-identiek), anonieme toegang geweigerd (401) en een databasescan die bevestigt dat geen enkele opgeslagen link meer naar het dode formaat wijst.

## 2026-08-17 — Gerichte arbeidscontract-extractie: uitlezen, overnemen en automatische bewaking

- **Uitvoering:** uitbreiding personeel/HRM (migratie 0066) | **Kwaliteit:** hoog | **Risico:** laag (bestaande analyse-route herbouwd op gedeelde service; additieve kolommen)

Een gescand arbeidscontract wordt niet langer alleen samengevat: de AI leest nu gericht alle contractvelden uit (werkmaatschappij, werknemersnaam, functie, datum in dienst, bepaalde/onbepaalde tijd, einddatum, proeftijd, uren per week incl. min-max bij nul-uren, salaris mét eenheid, CAO, opzeg- én aanzegtermijn, reiskostenvergoeding, concurrentie- en relatiebeding). Elk veld draagt een vindplaats (pagina + letterlijk citaat); zonder vindplaats blijft het veld bewust leeg (fail-closed — de AI gokt nooit).

- **Contract uitlezen (AI)** op het contractentabblad van de medewerker: dialog met alle velden vooringevuld, vindplaats-citaten eronder, alles corrigeerbaar. **Overnemen in dossier** maakt met één handeling een arbeidsovereenkomst aan — nooit stil.
- Einddatum + contracttype landen daarmee direct in de bestaande **contractbewaking** (120/90/75/60/30-dagen-signaleringen + aanzegging slaan automatisch aan).
- Nieuwe contractvelden (salariseenheid, uren min/max, opzeg-/aanzegtermijn, reiskosten, bedingen) zichtbaar in het contractdetail en beschikbaar in de contract-bewaking-API.
- **Slim upload** herkent een arbeidscontract nu als subtype en stelt automatisch de juiste **medewerker + documenttype** voor (deterministische naam-match, bij twijfel geen voorstel; geel AI-voorstel, gebruiker bevestigt).

Bewijs: `scripts/src/verificatie-contract-extractie.ts` — synthetisch contract → 14/14 velden correct mét vindplaats, fail-closed-invariant intact, overname → 60-dagen-signalering, slim-upload-voorstel correct.

## 2026-08-17 — Merkenkast & Beeldbank (MERK_01): huisstijl en beeldmateriaal centraal vindbaar

- **Uitvoering:** nieuwe module (migratie 0065) | **Kwaliteit:** hoog | **Risico:** laag-midden (nieuwe leesroutes + één nieuwe tabel; automatische bronnen blijven onaangeroerd)

Twee nieuwe pagina's onder Commercie (beide vanaf crm-niveau 3):

1. **Merkenkast (`/crm/merkenkast`).** Per werkmaatschappij alle merkgegevens op één plek: logo-varianten (kleur/wit/zwart/liggend/vierkant/transparant), merkkleuren (kopieerbaar), lettertype, korte/lange bedrijfsomschrijving en zakelijke gegevens. De **werkgever-huisstijl is de enige bron** — beheer gebeurt op de bestaande huisstijlpagina (Organisatie → Documentopmaak, uitgebreid met logo-varianten, extra kleuren en teksten). Download per onderdeel of als **compleet merkpakket (zip)** met `merkgegevens.txt/json`; ontbrekende bestanden worden in het pakket expliciet benoemd, nooit stil overgeslagen.
2. **Beeldbank (`/crm/beeldbank`).** Eén zoekingang over al het eigen beeldmateriaal, live geaggregeerd uit vier bronnen (geen kopieën): spotfoto's per fase (opname/uitvoering/oplevering), opnamefoto's, inspectiefoto's en handmatige uploads. Filteren op bron, fase, gebouw, werksoort en periode + vrij zoeken; per foto gebouw, werksoort, wanneer en wie. Bulk-download als zip (max 200) met selectie in het fotoraster. Handmatig uploaden kan met gebouw-/opdrachtkoppeling; automatische bronnen hebben bewust géén gegokte opdracht-koppeling (gemeld bij scoping).
3. **Toegang fail-closed.** Alles achter crm 3; de gebouw-ACL (beperkte veldgebruikers) wordt zowel in de lijst als opnieuw per foto in de bulk-download afgedwongen; buiten-toegang of ontbrekende bestanden staan met naam in `OVERGESLAGEN.txt`.

Na architect-review aangescherpt: (a) download-URLs wijzen nu naar de bestaande, gebouw-ACL-afgedwongen storage-route (`/api/storage/objects/…`) — het eerder gebruikte `/api/storage/files?path=…`-patroon blijkt als route niet te bestaan; (b) handmatig uploaden is fail-closed: beperkte veldgebruikers kunnen alleen binnen hun toegewezen gebouwen registreren (403), gebouw/opdracht-referenties worden gevalideerd (400); (c) de storage-ACL herleidt nu ook inspectiefoto's en beeldbank-uploads naar hun gebouw.

Bewijs: `scripts/src/verificatie-merk01.ts` — 37/37 groen via https-sessie: 401/403-afscherming, huisstijlvelden PATCH→merkenkast, merkpakket-zip incl. ontbrekend-melding, aggregatie van alle vier bronnen met filters, gebouw-ACL voor beperkte veldgebruiker (lezen én uploaden; gebouw B onzichtbaar), echte afhandeling van de download-URL en bulk-zip met ACL-herafdwinging + OVERGESLAGEN-melding.


## 2026-08-17 — AVG-afscherming: bredere lek-audit afgerond, drie lekken gedicht (taak #1008)

Alle directe reads op medewerkersTable buiten de centrale HRM-mappers zijn geïnventariseerd (docs/avg-afscherming-beleid.md, incl. beleidsgrens: naam blijft zichtbaar; interne loon-/wettelijke verwerking mag door; API/UI-disclosure van contact/NAW/geboortedata niet). Drie plekken konden bij een afgeschermde oud-medewerker (m.n. actief=true met verstreken uit_dienst_per) nog afgeschermde velden lekken en filteren nu op afgeschermd_op IS NULL: de planning-selector /modules/planning/medewerkers (gaf e-mail/telefoon terug), de kalender-verjaardagen en de moments-verjaardagservice (geboortedatum-gebruik). Na review óók de self-scoped route /mijn/privacy-gegevens gedicht: een afgeschermde oud-medewerker kan nog een actief account hebben; e-mail/telefoon/mobiel gaan dan ook naar de eigen gebruiker als null terug. IDOR-check bevestigd: /gebruikers/:id geeft niet-beheerders geen e-mail/telefoon (mapGebruikerPubliek). Bewijs uitgebreid: scripts/src/bewijs-offboard-uitsluiting.ts — 22/22 groen (incl. IDOR-check, planning-selector-, kalenderverjaardag- én self-scoped-privacy-uitsluiting bij het actief=true-randgeval).
## 2026-08-17 — Bestelbonnen en mandagstaten draaien nu in de goedgekeurde huisstijl uit

Documenten die tot nu toe altijd de vaste FPS-oranje kleur (#F23B0D) gebruikten, nemen nu de accentkleur op uit het goedgekeurde Document Studio-model van de werkmaatschappij. Zonder goedgekeurd model valt alles terug op de standaard DDS-kleur.

- **Mandagstaat-PDF (server-side):** `genereerMandagstaat()` in `lib/mandagstaat.ts` leidt de werkgever af uit de medewerkers op de mandagstaat, vraagt het actieve Studio-model op via `haalActiefStudioKleur()` en geeft de kleur door aan `tekenPdf()` als `accentKleur`. De PDF-kop (bedrijfsnaam) kleurt nu in de huisstijlkleur van de goedgekeurde werkmaatschappij.
- **Bestelbon-e-mail (POST /magazijn/bestelbonnen):** accepteert nu optioneel `werkgever_id` in de body. Bij een geldig werkgever-id wordt het actieve bestelbon-Studio-model opgezocht; de e-mailkop gebruikt de primaire kleur én de naam van de werkmaatschappij als afzender.
- **Inkooporder-e-mail (POST /magazijn/inkooporders/:id/verstuur):** leidt de werkgever server-side af via de sessiegebruiker (medewerker-werkgever-koppeling). Past het actieve bestelbon-Studio-model toe op kop, kleur en afsluiting; html-opmaak opgewaardeerd naar hetzelfde responsive blok als de overige transactionele mails.
## 2026-08-17 — Kies per salarismutatie wat er in de SCAB-mail meegaat

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

Beheerders kunnen nu per salarismutatie aanvinken welke mutaties in de SCAB-mail worden opgenomen. Bij opslaan regenereert de server de volledige mailtekst (aanhef + regellijst + ondertekening) op basis van de gekozen subset; de snapshot (`mutatie_ids`) en mailtekst worden altijd samen bijgewerkt. Verzenden raakt uitsluitend declaraties uit de definitieve snapshot (bestaand gedrag).

**Wijzigingen:**
- `artifacts/api-server/src/routes/scab-mail.ts`: PATCH-handler valideert fail-closed (niet-integer element → 400 voor héél verzoek), dedupliceert IDs, controleert scope (wm+periode) en regenereert de mailtekst server-side. `GET /scab-mails/:id/mutaties` geeft alle periode-mutaties terug met `in_snapshot`-vlag.
- `artifacts/api-server/src/lib/scabMailHelpers.ts` (nieuw): geëxporteerde pure helpers `genereerDeterministischeBody`, `eersteOngeldigeElement`, `dedupliceerId` — te unit-testen zonder DB-afhankelijkheid.
- `artifacts/firevault/src/pages/scab-mail/index.tsx`: bewerken-dialog toont `MutatieKeuzePanel` met per-mutatie checkboxes; bij selectiewijziging stuurt de client alleen `mutatie_ids`, niet de handmatige tekst.
- `lib/api-spec/openapi.yaml`: `ScabMail.mutatie_ids`, `ScabMailPatch.mutatie_ids`, schema `ScabMailMutatieKeuze` en endpoint `GET /scab-mails/{id}/mutaties` toegevoegd.
- `artifacts/api-server/src/__tests__/scab-mail-patch.test.ts` (nieuw): 20 unit tests voor de type-validatie, deduplicatie en body-generator (groen, geen DB-mock nodig).


## 2026-08-17 — Kies per salarismutatie wat er in de SCAB-mail meegaat (#984)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

Bij het genereren of bewerken van een concept-SCAB-mail (loonperiodebrief aan de accountant) kan de beheerder nu per salarismutatie aanvinken of die mutatie meegenomen wordt. De server valideert alle aangevinkte IDs fail-closed tegen werkmaatschappij en periode, dedupliceert ze en regenereert de volledige mailtekst deterministisch — inclusief aanhef en ondertekening. De snapshot (`mutatie_ids` in `scab_mails`) en de mailtekst worden altijd samen bijgewerkt. Verzenden verwerkt alleen de declaraties uit de definitieve snapshot (bestaand gedrag ongewijzigd).

- **Backend:** `PATCH /scab-mails/:id` accepteert `mutatie_ids: number[]`; server toetst elke ID tegen eigen data en retourneert 400 bij type-fout of buiten-scope ID. Nieuwe helper-module `scabMailHelpers.ts` extraheert `genereerDeterministischeBody`, `eersteOngeldigeElement` en `dedupliceerId` als pure functies. Nieuw endpoint `GET /scab-mails/:id/mutaties` retourneert alle mutaties in de periode met `in_snapshot`-vlag per rij.
- **Frontend (`firevault`):** `MutatieKeuzePanel` met checkboxes, "alles aan/uit"-knoppen en nieuw-badge. Bij selectiewijziging stuurt de client uitsluitend `mutatie_ids`; de mailtekst wordt herladen na bevestiging.
- **Migratie 0055:** `scab_mails.mutatie_ids` (integer[]) al aanwezig; de nieuwe veldkolom `medewerkers.afgeschermd_op` (migratie 0058) is toegevoegd aan de Drizzle-schema-definitie en de gecompileerde lib-declaraties zijn herbouwd.
- **Tests:** 20 unit-tests voor de pure helpers + 12 route-level integratietests (404, 409, type-fout ×3, buiten-scope, deduplicatie, lege selectie, geldige selectie, GET mutaties ×2). Architect-review: geslaagd na fix van stale lib/db dist en routering-correctie in integratietests.

## 2026-08-17 — Basislaag eigen gegevens in de webapp + besluit geen iOS-build

- **Besluit vastgelegd (taak #886):** geen iOS-build en geen Apple Developer-account; iPhone-gebruikers werken in de webapp. Zie docs/besluit-geen-ios-build.md; docs/monteur-app-apk.md bijgewerkt (iOS-actiepunt vervallen).
- **Mijn gegevens (webapp):** nieuw vast zijbalk-hoofdstuk voor iedere ingelogde medewerker, ongeacht profiel: Mijn uren (bestaand urenscherm, backend scoopt op eigen medewerker), Mijn declaraties (/mijn/declaraties, nieuw), Mijn verlof (/mijn/verlof, nieuw: saldo + aanvragen + nieuwe aanvraag), Mijn loonstroken (bestaande pagina /mijn/salarisdocumenten, nu vindbaar). Modulerechten blijven onverkort gelden voor andermans gegevens.
- **Zijbalk-audit:** Urenregistratie/Weekstaten (UI personeel:1, backend alleen-inloggen) waren de enige verborgen-eigen-gegevens mismatches; declaraties-modulepagina en verlofoverzicht/salarisarchief kloppen met de backend. Gemeld: uren-pagina gebruikt heeftNiveau("uren",1) terwijl backend personeel:1/2 hanteert (niet stilzwijgend aangepast).
- Bewijs: scripts/src/bewijs-mijn-gegevens-basislaag.ts — 16/16 groen. Lib-fixes: lib/db en lib/api-client-react dist herbouwd na merge-drift (stale compiled declarations). Firevault-imports scab-mail/index.tsx: dubbele useState, ontbrekende ListChecks en useGetScabMailsIdMutaties toegevoegd. — 16/16 groen (rechtenloos account bereikt alle eigen-gegevens-routes incl. volledige concept-levenscyclus declaratie: aanmaken, detail, bewerken, indienen, verwijderen; module-lijsten blijven 403). Declaratie-detail: concept-acties nu eigenaarschap-gebaseerd (conform backend) i.p.v. declaraties:2; terugknop context-bewust. Architect-review: PASS.


## 2026-08-17 — Campagnemails dragen nu de eigen huisstijl van de werkmaatschappij

- **Uitvoering:** feature api-server (MARKETING_01) | **Kwaliteit:** hoog | **Risico:** laag (additieve migratie; fallback naar FPS-stijl bij geen koppeling)

Campagnemails hadden een hardcoded FPS-oranje (`#F23B0D`) topbalk en een vaste "FPS"-vermelding in de footer. Elke campagne kan nu aan een werkmaatschappij worden gekoppeld (`werkgever_id`); de mail-template en de publieke afmeldpagina halen dan automatisch de merkkleur (`primaire_kleur`) en het logo (`logo_url`) uit de werkgevers-tabel. Ontbreekt de koppeling, dan blijft de FPS-huisstijl de fallback — backwards-compatible.

Scope van de wijziging:
- Migratie `0069_marketing-campagne-werkgever.sql`: nieuw nullable `werkgever_id`-veld op `marketing_campagnes`.
- `campagneMailHtml`: accepteert nu `branding` (kleur + logoUrl + naam) i.p.v. hardcoded oranje; logo verschijnt als afbeeldingblok boven de inhoud.
- `maakAfmeldPagina` (publiek, zonder sessie): topborder en knop gebruiken de merkkleur; logo boven de kop. Branding wordt opgezocht via token → ontvanger → campagne → werkgever (één JOIN, fail-closed naar FPS-fallback).
- Proefverzending en echte verzending roepen beide `haalWerkgeverBranding()` aan voor verzending.
- Footer noemt de werkgevernaam i.p.v. altijd "FPS".
## 2026-08-17 — Campagnes gaan nu vanzelf gedoseerd de deur uit na één goedkeuring

- **Uitvoering:** MARKETING_01 Deel A vervolg (api-server) | **Kwaliteit:** hoog | **Risico:** laag (alleen campagnemail; per-item goedkeuring blijft voor alle overige mail)

Tot nu toe moest een beheerder elke campagnemail apart vanuit de mailwachtrij versturen — bij grotere doelgroepen onwerkbaar. Nu is de goedkeuring éénmalig: zodra een campagne (na de verplichte proef) wordt verzonden, verstuurt een automatische verzender de klaargezette mails gespreid, standaard 6 per minuut. Het tempo is instelbaar (1–60 per minuut) op de marketingpagina, door wie ook campagnes mag verzenden. Zo blijft verzenden praktisch zonder dat de mailserver een spam-piek produceert en als spammer aangemerkt wordt.

De bestaande waarborgen blijven volledig staan: vlak vóór élke verzending draait opnieuw de toestemmings- en statuscontrole, dus afmelden, toestemming intrekken of de campagne stoppen werkt per direct — ook midden in een lopende verzending. Bewijs: scripts/src/bewijs-campagne-dosering.ts (13 controles, waaronder stoppen mídden in het verzenden: daarna gaat er niets meer uit en worden resterende ontvangers netjes overgeslagen; gemeten tussenpoos klopte met het ingestelde tempo).
## 2026-08-17 — App-installatielink (PWA) meegestuurd bij nieuwe medewerker-uitnodiging (#1027)

- De uitnodigingsmail bevat nu een sectie **"FPS Connect ook op uw telefoon"** met iPhone (Safari → "Zet op beginscherm") en Android (Chrome → "App installeren") instructies, plus de directe PWA-link (`/connect/planning`). Sectie verschijnt alleen als `PUBLIEKE_APP_URL` of een Replit-domein beschikbaar is (fail-closed).
- De **activatiepagina** (`/uitnodiging/:token`) toont na het afronden van 2FA een installatie-kaart met QR-code, stap-voor-stap instructies voor iPhone en Android, en een "Doorgaan naar FPS Connect"-knop. Geen automatische redirect meer: de medewerker kan de QR eerst scannen.
- Bestaande beheer-testpagina (`/beheer/pwa-test`) is ongewijzigd.
- Gewijzigde bestanden: `artifacts/api-server/src/services/email.ts`, `artifacts/firevault/src/pages/uitnodiging/index.tsx`.
## 2026-08-17 — VORM_01 fase 6 afgerond met bewijsschermen mét gevulde gegevens (#1025)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

De veiliggestelde tak `vorm01-fase6-wip` is verzoend met main. Analyse toonde dat vrijwel de hele fase-6-inhoud al op main stond (F6-eindcommit); het enige resterende unieke werk was de tokenisatiepas van het Mijn auto-scherm (ruimte-tokens, tekstStijl(), Ladenstaat i.p.v. ActivityIndicator). Die is overgenomen mét de F6-eindconventies (success/warningForeground, logo-vlak kleuren.light.card, UpdateBanner behouden). WIP-rommel (dist-bewijs-output, keten01-e2e-screenshots) is bewust niet meegenomen.

- **Security-fix (review):** POST/PATCH `/social/berichten` accepteerden een `campagne_id` onder alleen crm:3; campagne koppelen/wijzigen/ontkoppelen vereist nu server-side marketing:3 (hoofdbeheerder uitgezonderd) plus validatie dat de campagne bestaat. 9 route-level tests (crm-only vs marketing) groen.
- **Fix:** Mijn auto had geen `bezigLaden`-guard, waardoor een koude deep-link de token-herstel-race verloor (→ /login → /menu). Guard toegevoegd conform het vaste patroon.
- **Bewijs (gevulde gegevens, eis René):** `scripts/src/vorm01-testdata.ts` zaait nu ook een testvoertuig (VORM-01-B, chauffeur = e2e-account); `vorm01-schermafdrukken.ts` neemt het scherm mijn-auto mee. Schermafdrukken in docs/metingen/vorm01/na: mijn-werk toont 7 VORM01-spots in 2 gebouwen met statusmerken en onderregels; mijn-auto toont het gekoppelde voertuig met kenteken, km-stand en meldingen-sectie. Typecheck monteur-app + scripts groen.


## 2026-08-18 — VOORRAADTELLING fase 1: bevroren telling met verschillenlijst en boekhouder-uitvoer

- **Nieuw onder Magazijn → Tellingen**: een voorraadtelling als eigen, bevroren moment. Een beheerder maakt een telling aan met peildatum (standaard 31 december) en een vaste waarderingsgrondslag (inkoopprijs / laatste inkoopprijs / gewogen gemiddelde) — die keuze wordt bij het aanmaken vastgelegd en kan daarna niet meer wisselen.
- **Tellen**: zolang de telling open staat vullen tellers per artikel (optioneel per locatie) aantallen in, corrigeren en bevestigen ze regels. Elke regel toont de administratieve voorraad ernaast plus een kolom "laatste beweging" (hoe lang geleden de laatste mutatie was), zodat incourante voorraad direct opvalt. Invullen vergt magazijn-niveau 3, vaststellen niveau 4.
- **Verschillenlijst**: administratie vs. geteld, met het verschil in aantal én in geld tegen de gekozen grondslag; regels zonder prijs volgens de grondslag worden apart gemeld en tellen fail-closed niet mee in de geldbedragen.
- **Vaststellen bevriest alles**: in één transactie worden per regel het getelde aantal, de gehanteerde prijs, de waarde, de locatie en de administratieve stand vastgelegd in eigen tabellen (`voorraad_tellingen` + `voorraad_telling_regels`), en worden verschillen geboekt als correctiemutaties met verwijzing naar de telling — het mutatiespoor loopt dus door. Daarna is de telling server-side onwijzigbaar: elke mutatie (regels, verwijderen, nogmaals vaststellen) geeft 409. Een latere prijswijziging verandert de telling niet.
- **Boekhouder-uitvoer**: printbare pagina (Document Design System) per vastgestelde telling — per artikel aantal, grondslag, waarde; totaal onderaan; met peildatum, wie geteld en wie vastgesteld heeft.
- **Exacte getallen** (migratie `0083_voorraadtelling-en-magazijn-exact.sql`): de bestaande magazijnkolommen `voorraad.hoeveelheid/gereserveerd/besteld`, `voorraad_mutaties.hoeveelheid/delta` en de drie artikel-inkoopprijzen zijn van `real` (float4) naar `numeric(12,2)` gegaan, met dezelfde fail-closed vergelijkcontrole als calculatie-migratie 0077 (afwijking > ½ cent = harde stop). Verkoopprijs en normtijd-achtige velden blijven bewust ongemoeid.
- **Bewijs**: `scripts/src/bewijs-voorraadtelling.ts` (52/52 groen, draaibaar via `pnpm --filter @workspace/scripts run bewijs-voorraadtelling`) — telling met afwijking aanmaken, corrigeren, bevestigen, vaststellen; correctiemutatie klopt (delta −2, verwijzing naar de telling); prijswijziging ná vaststelling laat de bevroren prijs/waarde onaangetast; uitvoer-totaal exact 8 × € 12,50 = € 100,00. Gelijktijdigheid afgedekt: élke regel-mutatie draait in een transactie die eerst de telling FOR UPDATE vergrendelt (vaststellen vergrendelt óók de regels), zodat een mutatie volledig vóór of ná de vaststelling valt — de regressietest bewijst dat een gelijktijdige upsert blokkeert en daarna 409 krijgt, nooit "ertussenin" schrijft; ook een gelijktijdige delete kan een net-vastgestelde telling niet meer wegvagen (409 na status-hercheck onder de lock). Vaststellen vergrendelt bovendien per regel de voorraadrij (FOR UPDATE) vóór het snapshotten, zodat ook een gewone voorraadmutatie (uitgifte/retour/correctie) volledig vóór of ná de vaststelling valt — de bevroren stand en de geboekte correctie kloppen altijd met de werkelijke voorraad (regressietest: stand 10→6 tijdens vaststellen ⇒ bevroren op 6). Ook zonder bestaande voorraadrij is de serialisatie sluitend: bijwerkenVoorraad en vaststellen nemen het artikelrecord FOR UPDATE als gedeelde grens, zodat een gelijktijdige eerste ontvangst nooit tot een stale 0-snapshot leidt (regressietest: rij ingevoegd op 4 tijdens vaststellen ⇒ bevroren op 4). Alle voorraadwijzigende paden (correctie, reservering/annulering, uitgifte, verplaatsing, picklijst, scan-goedkeuring, inkooporder-ontvangst) delen nu één serialisatieprimitief (vergrendelArtikel: artikelrecord FOR UPDATE vóór lezen/beslissen/schrijven), zodat ook absolute schrijfacties zoals verplaatsingen nooit met een stale lezing over een vaststelling heen schrijven. Twee echte HTTP-racetests (vaststellen tegelijk met correctie resp. verplaatsing) bewijzen dat de uitkomst altijd serialiseerbaar is. Alle geld- en aantalberekeningen in de telling (verschil, prijs × aantal, totalen, correctiedelta) lopen via de calculatie-rekenkern in centen (tekensymmetrisch, half-weg-van-nul): 0,30 × €3,35 = €1,01, niet €1,00. De uitgifte-beschikbaarheidscontrole zit binnen de transactie ná de artikel-lock: van twee gelijktijdige uitgiftes slaagt er precies één, de ander krijgt 422 (nooit een stilzwijgend geclampte stand met een 201). Peildatum wordt gevalideerd als échte kalenderdatum (30 februari ⇒ 422).
- Buiten scope gebleven conform opdracht: camera-/AI-telling (vervolgfase), automatische afwaardering van incourante voorraad, wijzigingen aan de stellingscan.
## 2026-08-18 — Onboarding: wizard onthoudt gegevens weer + ZZP'er "ingehuurd door" instelbaar

- **Wizard-persistentie hersteld** (`onboarden.tsx`): de tussentijdse opslag schreef de formulierdata dubbel genest weg (client wikkelde in `voortgang_data`, server nogmaals onder `stap_N`) terwijl het hervatten op het buitenste niveau zocht — functie/werkmaatschappij en andere velden kwamen dus nooit terug. Opslag is nu één nesting (`stap_N.form`), het hervatten leest de meest recente stap (met terugval voor oude dubbel-geneste én pre-stap-concepten), cvExtra wordt ook hersteld, de formulierdata wordt al bij de éérste stap-overgang bewaard, en een mislukte tussentijdse opslag geeft nu een zichtbare melding i.p.v. stil te falen.
- **ZZP "ingehuurd door"**: nieuwe kolom `medewerkers.zzp_bedrijfsnaam` (migratie 0079) bewaart de eigen KvK-handelsnaam van de ZZP'er apart; het bureau-veld (`uitzendbureau_id` → crm_klanten + naam-cache) is bij dienstverband zzp voortaan de ínhurende partij. ZZP-onboarding heeft een "Ingehuurd door (organisatie)"-koppeling gekregen en misbruikt het bureau-tekstveld niet meer; het medewerker-bewerkscherm toont bij zzp nu ook de eigen bedrijfsnaam plus de inhuurder-koppeling. Bewijs: `scripts/src/verificatie-onboarding-1091.ts` (17 checks groen, incl. legacy-concept leesbaarheid en Fernando-scenario).
## 2026-08-18 — Contractbewaking zichtbaar: kritieke-datumskaart op personeelsprofiel + badge in sidebar


### Bevinding bewakingsloop
De bewakingsloop draait dagelijks om 06:30 en is gezond (deploy-logs bevestigen dit). De reden dat de opdrachtgever niets zag: zonder medewerkers in het ≤30-dagenvenster returned `ContractSignaalItems` `null` en toonde de hoofdstuk-badge 0. De "Contractbewaking" sidebar-link was de enige ingang, maar trok geen aandacht bij lege signalen. Met de nieuwe badge op het menu-item (totaal) en de kaart op de medewerker is dit opgelost zonder bewakings-drempelwijzigingen.


### Wat veranderd is
- **Nieuwe backend route** `GET /api/contract-bewaking/medewerkers/:id/kritieke-datums`: geeft per medewerker alle kritieke tijdsdrukpunten terug — einddatum tijdelijk contract, uiterste aanzegdatum (Wet Aanzegging), proeftijd-einde, ketenregelstatus, ZZP-einddatum + DBA-risico en inleen-einddatum. Hergebruikt de bestaande pure helper-functies (`berekenContractCrucialeDatum`, `berekenZzpCrucialeDatum`, `ketenregelingCheck`), geen nieuwe berekeningen.
- **Kritieke-datumskaart op de personeelskaart** (`pages/personeel/detail.tsx`): toont de bovenstaande datums in kleurgecodeerde tegels (blauw = info, oranje = waarschuwing, rood = kritiek). Laadt alleen voor gebruikers met `personeel ≥ 1`. Verdwijnt bij 0 kritieke datums, voldoet aan de lege-staat-regel.
- **Badge op "Contractbewaking" in de sidebar** (`layouts/beheerder-layout.tsx`): toont het *totale* aantal medewerkers met een naderende deadline (niet alleen urgent). De bestaande urgente-shortcutlijst en hoofdstuk-badge (alleen urgent, ≤30 dagen) blijven onveranderd.


## 2026-08-18 — MONTEUR_NU_01: de echte monteur-app werkend op de telefoon via /app

- **Webuitvoer van de monteur-app** (`artifacts/monteur-app`, Expo web-export met baseUrl `/app`): de wachtpagina "De app komt eraan" op /app is vervangen door de volledige monteuromgeving in de browser. Inloggen met hetzelfde Connect-account via het bestaande bearer-pad (TOTP verplicht, token 30 dagen — één keer inloggen). Geen buitendienstprofiel (`lib/buitendienst.ts`, zelfde regel als de web-app) → doorverwijzing naar het gewone Connect.
- **Eigen PWA voor /app**: eigen manifest ("FPS Monteur", scope /app/, standalone) + eigen service worker met commit-versiebeheer (skipWaiting + oude caches opruimen: elke uitrol direct zichtbaar zonder handmatig legen) die bij installatie het volledige export-manifest pre-cachet zodat een koude start zonder netwerk werkt. De desktop-service-worker slaat /app-verzoeken voortaan over. Versie + commit + bouwdatum zichtbaar in App-informatie en extern via `/app/versie.json`.
- **Webterugvallen zonder doodlopende knoppen**: `lib/bestanden.ts` (offline foto's/handtekeningen op web als data-URL's in localStorage, native ongewijzigd expo-file-system; zelfde SyncQueue op beide platforms), PdfPlattegrond in een same-origin iframe met identieke berichtenbrug, documenten/loonstroken openen in een nieuw tabblad, barcode-scanscherm biedt op web direct "Artikel zoeken", foto's via de camera-invoer van de browser. Beperking (bewust): offline-fotobuffer op web ±5 MB met duidelijke foutmelding — volledig offline werken blijft de APK-weg (onaangeraakt).
- **Uitrol**: `deploy/Dockerfile.caddy` bouwt de webexport mee (harde verificaties + PWA-injectie + versiestempel), `deploy/Caddyfile` serveert /app vóór de statische handle met no-cache op index/sw/manifest, en `scripts/deploy-production.sh` keurt een deploy pas goed als óók `/app/versie.json` de nieuwe commit meldt (anders automatische rollback). Antwoord: `docs/antwoorden/MONTEUR_NU_01.md`; meting: `docs/metingen/MONTEUR_NU_01-meting-vooraf.md`. Nameting op een echte telefoon volgt na de eerstvolgende productie-uitrol. Review-naloop: het bewijsscript bewijs-calc-kern-offerte (uit CALC_KERN_01) schrijft testdata en weigert productie nu onvoorwaardelijk (`weigerProductieVoorSchrijvendScript`, geen PROD_LEZEN_TOEGESTAAN-vrijstelling) en gebruikt per run willekeurig gegenereerde wegwerp-inloggegevens i.p.v. vaste credentials in de repo.


## 2026-08-18 — INKOOP_BOEKING_01: geen faalmail-herhaling bij ontbrekende btw-code

- **Ontbrekende boekvelden → controletaak, geen faalmail**: als een direct betaalde inkoopfactuur automatisch geboekt wordt maar de btw-code (of een ander verplicht boekingsveld) ontbreekt, stuurt het systeem nu één gededupliceerd signaal (`ontbrekende_boekgegevens`) en zet de factuur terug op `controle_nodig`. De achtergrondlus probeert daarna niet meer elke 15 minuten opnieuw te boeken — er gaat dus geen herhaalde faalmail naar de hoofdbeheerders.
- **Automatisch boeken bij aanvulling**: zodra iemand de ontbrekende gegevens invult en de factuur opnieuw accordeert, triggert de bestaande auto-boeking vanzelf en boekt de factuur alsnog naar AccountView.
- Nieuw signaaltype `ontbrekende_boekgegevens` toegevoegd aan `FACTUUR_SIGNAAL_TYPES` (tekstveld, geen DB-migratie nodig).

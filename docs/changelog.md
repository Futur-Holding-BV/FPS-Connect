## 2026-08-20 — Externe back-upstaffel fail-safe hersteld

- **Exit 141 structureel verwijderd**: selectie van de nieuwste dump, vorige set en dagmappen gebruikt geen vroeg afgeknotte `head`-/`tail`-pijplijnen meer onder `pipefail`.
- **Vorige volledige set blijft staan**: iedere nieuwe set wordt uniek gestaged, inclusief DB, objectopslag, config zonder geheimen, manifest en checksums, en pas na een geslaagde checksumcontrole atomair gepubliceerd. Fouten en signalen ruimen alleen staging op.
- **Status en alarmering fail-closed**: `status.json` wordt atomair bijgewerkt met fase, originele exitcode/signaal en laatste geslaagde set. Een fout mailt direct via Graph; daarna volgt hoogstens één herinnering per dag zolang geen successet jonger dan 24 uur bestaat.
- **Herinneringsretry aantoonbaar eerlijk en crashbestendig**: iedere poging staat al vóór Graph atomair als `bezig`; bewezen pre-dispatchfouten en expliciete Graph-afwijzingen worden `mislukt` en mogen opnieuw proberen. Alleen werkelijke Graph-success wordt `geslaagd`. Een crash, sendMail-timeout of transportverlies blijft `onzeker`, blokkeert een tweede verzending en presenteert de dag niet vals als succes.
- **Herstelbewijs zonder productierisico**: de herstelproef weigert sets buiten de dagstaffel, checksumfouten, symlinks en speciale bestanden; hij krijgt alleen minimale secretloze proefconfiguratie, gebruikt unieke tijdelijke containers/netwerken en laat health, login/2FA, documentopening en checksum hard falen. Dertien geïsoleerde regressieproeven dekken onder meer exit 23, SIGTERM/143, setbehoud, herinneringsdeduplicatie/retry, herstelpreflight, bestaande en interne symlinks en stale status; productieclaims worden pas na de Actions-run in het meetrapport ingevuld.
- **Losstaande CI-laadfouten opgeheven zonder productieroutewijziging**: het herschikbewijs hergebruikt voortaan één vast testaccount en ruimt alleen zijn calculatiegegevens op, zodat append-only bevoegdheidsaudit niet meer door accountverwijdering wordt geraakt. De factuurverzendtest gebruikt `vi.hoisted()` voor alle mocks die in gehesen fabrieken nodig zijn; `facturen.ts` bleef ongewijzigd. De wegwerp-Postgres krijgt vóór de migratierunner het vaste SCHEMA_01-nulpunt plus de echte profielpresets, en de statische hergraderingscontrole opent de database pas wanneer het echte schrijfpad wordt aangeroepen.

## 2026-08-20 — Mailverbindingstest werkt met alleen Mail.Send

- **Alleen Mail.Send**: de verbindingstest leest het gebruikersobject van `MAIL_MAILBOX` niet langer via Graph. In plaats daarvan doet Connect een bewust ontvangerloze `sendMail`-probe; Graph valideert daarmee token, Application `Mail.Send` en postbustoegang, maar er wordt geen bericht verzonden.
- **Fail-closed foutonderscheid**: alleen de specifieke Graph-400 over de ontbrekende ontvanger geldt als gezonde verbinding. Een 403 wordt begrijpelijk gemeld als ontbrekende `Mail.Send`-/postbustoegang, een 404 als niet-bestaande postbus en iedere andere 400 blijft een verzendfout.
- **Rechten opgeschoond**: de app-only mailkoppeling vereist alleen Application `Mail.Send`. De persoonlijke Werk-inbox gebruikt afzonderlijk gedelegeerd `User.Read`, `Mail.ReadWrite`, `Mail.ReadWrite.Shared`, `Mail.Send`, `Mail.Send.Shared` en `offline_access`.
- **Bewijs**: vier regressietests dekken gezonde niet-verzendende probe, 403, 404 en een onverwachte 400; API- en Firevault-typechecks zijn groen. Productiemeting wordt na uitrol hieronder in het CI-deploypoortbewijs vastgelegd.
- **Productiebouw hersteld**: de verplichte noodfixrun bracht aan het licht dat de gegroeide frontendbundel de standaard V8-heapgrens van circa 2 GB bereikte. Alleen het Vite-proces in het frontend-builderstadium krijgt daarom een heaplimiet van 4 GB; runtimecontainers en overige Node-processen blijven ongewijzigd.
- **Eenmalig bewijsaccount zonder opgeslagen wachtwoord**: wanneer de twee optionele `SMOKETEST_*`-repositorysecrets ontbreken, kan een handmatige bewijsrun met expliciet `HERSTEL` het bestaande vaste productie-smoketestaccount klaarzetten met een willekeurig, vooraf gemaskeerd wachtwoord. Het wachtwoord gaat alleen via stdin naar de VPS en blijft uitsluitend binnen die Actions-job beschikbaar.
- **Noodfixroute definitief in productie bewezen**: handmatige run 32342864086 op commit `83918250d0cf345abde3470ca39d669f324d8e69` is volledig geslaagd. De auditmail is door Graph geaccepteerd en door René als ontvangen bevestigd, de echte smoketest behaalde 15/15, de Connect-mailproef bevestigde `Mail.Send` plus `mail_logboek.status=verzonden`, de afzonderlijke testmail is werkelijk ontvangen en `/api/healthz`, `/api/versie` en `/api/versie/status` bleven groen.
## 2026-08-20 — Verlopende externe adviseuraccounts blijven bewaakt

- **Regressiebewijs**: het geïsoleerde adviseur-fixturescript draait de echte werkbakbewakingsloop voor precies 14 dagen resterende toegang én voor een al verlopen datum. Het bewijst ook dat het actiepunt automatisch wordt afgehandeld bij verlengen buiten het venster en bij het deactiveren van het account. Fixture, adviseurrecord en werkbakitems worden ook bij een mislukte stap altijd opgeruimd.

## 2026-08-20 — SENTRY_INBOUW_01: drie veilige foutbronnen, meldbeleid alleen in beheercentrum

- **Eén privacygrens voor API, Firevault en FPS Monteur**: het nieuwe gedeelde pakket bouwt vóór verzending een strikt allowlisted event en verwijdert gevoelige veldnamen recursief. Vrije fouttekst, breadcrumbs, requestinhoud, tokens, wachtwoorden, BSN, adressen, klantgegevens, namen en e-mail overleven de grens niet; alleen stackstructuur, omgeving/release, intern gebruikers-id plus rol en een veilig scherm- of handelingslabel blijven.
- **FPS Monteur aangesloten zonder offline gedrag te breken**: officiële React Native SDK, Expo-plugin en Metro-config, runtime mobiele DSN, bestaande lokale ErrorBoundary plus minimale scherm-/gebruikerscontext. Zonder DSN/netwerk blijft de app werken; development verstuurt niets en native transport kan reeds veilig opgebouwde events bij herstelde verbinding afleveren.
- **Urgentie uitsluitend extern bepaald**: bronapps kunnen geen urgentietag door de allowlist krijgen. De aparte `futur-control`-wijziging ontvangt alleen HMAC-getekende Sentry-events, wacht op een tweede voorkomen, onderdrukt opgeloste/eenmalige issues en classificeert uitsluitend blokkades op inloggen, uren opslaan, factuur versturen en betaalbatch versturen als direct.
- **Bestaande tijden behouden**: het beheercentrum verwerkt direct op werkdagen vanaf 07:15 en in het weekend vanaf 09:00, nooit na 17:00; overige herhaalde actieve fouten worden om 17:00 gebundeld. Sentry zelf krijgt geen directe e-mail-, Slack- of pushroute naar beheerders.
- **Productiebuild hersteld**: de API- en caddy-images kennen de gedeelde foutmonitoringspackage al vóór de frozen dependency-installatie. Firevault-sourcemaps worden pas uit de zojuist gebouwde caddy-image gehaald en hun upload blijft ook bij ontbrekende tijdelijke opslag fail-soft.
- **Regressiebewijs**: gedeelde scrubtests bevatten een bewust testwachtwoord en kwaadaardige stack-/mechanismewaarden en eisen dat die nergens in het event staan; statische verificatie bewaakt alle drie SDK-aansluitingen en de beheercentrumgrens; 22 beheercentrumtests dekken daarnaast classificaties, tijden, minimale webhookpayload, API-HMAC, webhookretry-deduplicatie en de atomische resolve-vóór-meldclaim.
- **EU-inventaris fail-closed**: Sentry-beheerinventaris gebruikt uitsluitend `GET` op `https://de.sentry.io/api/0` met een User Auth Token uit `SENTRY_AUTH_TOKEN` en alleen `org:read`, `project:read` en `event:read`. De Replit-connector is vastgelegd als onbruikbaar voor deze EU-organisatie omdat hij geen regionale API-host kan instellen; het productieproject `fps-connect-api` wordt na de organisatiebrede lijst volledig overgeslagen.

- **Externe adviseurs**: nieuw beheerscherm onder Personeel met bedrijf, contactpersoon, inzet, toegangsdatum en accountstatus. Beheerders kunnen gegevens en toegang verlengen via het bestaande adviseur-account. De dagelijkse bewakingsloop zet vanaf 14 dagen vóór de einddatum (en bij verlopen toegang) een actiepunt in de werkbak voor personeel:2, dat zichzelf sluit wanneer de toegang is verlengd of het account is uitgezet.

## 2026-08-19 — Noodfix-beproeving geblokkeerd vóór productie

- **Werkelijke dispatch vastgelegd**: de handmatige noodfix-run op `main` registreerde commit, tijdstip, GitHub-actor en reden, en sloeg de CI-poort zoals bedoeld over.
- **Fail-closed bewijs**: Microsoft Graph weigerde de auditmail-tokenaanvraag met HTTP 401; de workflow stopte daarom vóór SSH, VPS-deploy en smoketest. Er is geen noodfix-mail verzonden en de beproeving moet na het vernieuwen van de Azure/GitHub-mailsecrets opnieuw worden uitgevoerd.
- **Productie bleef gezond**: externe controles op `/api/healthz` en `/api/versie` gaven HTTP 200; de versie bleef `83f6be17`.

## 2026-08-19 — SIGNALEN_LINKS_01: werkbak opent het concrete dossier

- **Overwerk en dossiers**: een verzoek om overwerk opent voortaan direct de gekoppelde opdracht; een opname zonder calculatie opent de betreffende opname.
- **Magazijn en HRM**: bestelsuggesties openen het artikel en cruciale HRM-deadlines openen het medewerkerdossier waarop de deadline betrekking heeft.
- **Oplosbare calculatiesignalen**: calculatie-zonder-offerte bewaakt alleen ENK-calculaties die volgens het datamodel werkelijk aan een offerte gekoppeld kunnen worden en opent hun bestaande detailpagina.
- **Bestaande items hersteld**: de datamigratie zet ook al openstaande meldingen om naar de concrete route; periodieke voeders werken voortaan de inhoud en deep-link van een bestaand open item bij.
- **Vaste routepoort**: de bestaande CI-doorklikcontrole leest nu alle werkbak-`actiePad`-toewijzingen uit de API-bron en controleert ze tegen de routes in `connect-routes.tsx`, met aanvullende eisen voor de vijf herstelde deep-links.

## 2026-08-19 — Inkoopfactuur-goedkeuringsbeleid dekkend maken

- **Inkoopfactuur-goedkeuringsbeleid**: Beheer → Goedkeuringsbeleid waarschuwt nu wanneer actieve, algemene inkoopfactuurregels niet alle bedragen vanaf € 0 afdekken. Ook gaten tussen ingestelde banden worden afzonderlijk getoond.
- **Ontbrekende band klaarzetten**: vanuit de waarschuwing opent direct een nieuwe algemene inkoopfactuurregel met de ontbrekende grenzen en het vier-ogen-principe ingevuld; de beheerder kiest zelf de bevoegde goedkeurder voordat de regel actief wordt.
- **Regressiebewijs**: een gerichte beleidstest dekt volledige dekking, gaten, overlap, uitgeschakelde regels, werkmaatschappij-specifieke regels en ongeldige omgekeerde grenzen.

## 2026-08-19 — SNAGSTREAM_MULTI_01: meerdere rapporten tegelijk uploaden

- **Meervoudige selectie**: het SnagStream-archief accepteert meerdere PDF’s in één bestandskeuze en past één optionele gebouwkoppeling op de hele selectie toe.
- **Bestanden blijven onafhankelijk**: iedere PDF krijgt een eigen inhoudscontrole, uploadtoken, voortgang en eindstatus. Een exact dubbel, naamconflict of fout blokkeert de overige rapporten niet; uploadtokens kunnen niet tussen bestanden worden hergebruikt.
- **Zichtbaar resultaat en bewijs**: de dialoog toont opgeslagen, reeds aanwezige, overgeslagen en mislukte bestanden afzonderlijk. De browsertest verwerkt twee nieuwe PDF’s naast een inhoudsdubbel, een naamconflict en een ongeldig bestand en controleert dat alleen de twee nieuwe rapporten worden toegevoegd.
- **Directe opruiming bij afbreken**: als een naamconflict pas na de objectupload zichtbaar wordt, verwijdert Overslaan de tijdelijke PDF en het gebruikergebonden uploadtoken meteen. Sluiten of annuleren ruimt alle nog openstaande uploads uit de batch op. Na de start staat de bestandskeuze vast en annuleren en voltooien delen één tokenvergrendeling, zodat gelijktijdig gebruik nooit een rapport met een verdwenen PDF kan opleveren. De regressieproef dekt beide keuzes en de tokenrace.

## 2026-08-19 — UREN_BUITENDIENST_01: geen volledige-weekbewaking voor kantoorpersoneel

- **Alleen buitendienst**: de wekelijkse urenverantwoording beoordeelt uitsluitend medewerkers van wie de gekoppelde functie in het functiehuis expliciet als **uitvoerend** is gemarkeerd.
- **Kantoor fail-closed uitgezonderd**: kantoorfuncties, medewerkers zonder gekoppelde functie en functies zonder uitvoerende classificatie krijgen geen melding over een onvolledige week. Bestaande open meldingen worden bij de volgende bewakingsronde automatisch gesloten.
- **Regressiebewijs**: een gerichte beleidstest controleert dat alleen `uitvoerend=true` wordt geselecteerd en dat kantoor, `null` en ontbrekende classificaties buiten de bewaking blijven. De UREN-ketenproef bevat daarnaast een onvolledige buiten- én kantoormedewerker en eist alleen voor de buitendienst een werkbaksignaal.

## 2026-08-19 — BEKIJKEN_ALS_HERSTEL_01: hoofdbeheerder kan niet meer vastlopen in een lege weergave

- **Directe uitweg uit Geen toegang**: wanneer een hoofdbeheerder via **Bekijken als** een teamlid zonder portaalrechten opent, toont het blokkeerscherm nu **Terug naar mijn eigen weergave**. De echte autorisatie blijft fail-closed; alleen de nabootsing wordt beëindigd.
- **Opgeslagen nabootsing gewist bij uitloggen**: een volgende login start altijd in het eigen account en herstelt niet langer automatisch de ontoegankelijke teamlidweergave.
- **Regressiebewijs**: de gebruikersmenu-proef simuleert bewust een teamlid zonder bevoegdheden, keert vanuit het blokkeerscherm terug en controleert daarnaast dat uitloggen de opgeslagen weergave opruimt.

## 2026-08-19 — ZOOM_01: paginazoomen weer toegestaan in Connect

- **Knijpzoomen hersteld**: de globale viewport beperkt de maximale schaal niet langer; telefoon- en tabletgebruikers kunnen de volledige Connect-pagina weer vergroten.
- **Frontend-audit**: geen overige `maximum-scale`, `minimum-scale` of `user-scalable`-blokkades gevonden. `touch-none` blijft alleen staan op lokale teken-, handtekening-, slider- en scrollbarinteracties; gewone pagina- en scrollcontainers blijven schaalbaar.
- **Bewijs**: Firevault-typecheck groen, mobiele preview correct en de werkelijk geleverde HTML bevat alleen `width=device-width, initial-scale=1.0, viewport-fit=cover`.


## 2026-08-19 — Contractbesluit direct bereikbaar vanuit kritieke datums

- **Snelle route naar besluitvorming**: bij een actief contract voor bepaalde tijd of een oproepcontract toont elke relevante eind- en aanzegregel in de kaart **Kritieke datums** nu de link **Besluit vastleggen →**.
- **Juiste medewerker en besluit**: de link opent de bestaande contracttab van dezelfde medewerker, vouwt het actieve contract open en kiest direct **Besluitvorming**, zodat de opdrachtgever zonder extra navigatiestappen verlengen, wijzigen of beëindigen kan vastleggen.
- **Rechten bewaakt in de interface**: de link blijft onzichtbaar voor gebruikers onder personeelsniveau 2, in lijn met de bestaande schrijfbevoegdheid op contractbesluiten.
- **Mergeherstel bewezen**: een gemangelde taakbranch is teruggebracht tot uitsluitend de vier bedoelde `contract_id`-toevoegingen. De volledige typecheck, 47 contractdatumtests en een echte browserproef op zowel eind- als aanzegdatum zijn groen.

## 2026-08-19 — HRM_ONBOARDING_HERSTART_01: vastgelopen onboarding hervatten of opnieuw beginnen

- **Wachtrijstatussen hervatbaar**: niet alleen `concept`, maar ook de overige onafgeronde onboardingstatussen worden als lopende onboarding herkend; een bestaand account blokkeert daardoor niet langer met “bestaat al”.
- **Veilige herstart**: bij een lopende onboarding kan Personeel kiezen tussen **Hervatten** en **Opnieuw beginnen**. Herstart wist uitsluitend de opgeslagen wizardvoortgang en wordt server-side geweigerd voor actieve, afgeronde of uit-dienst-profielen.
- **Juiste stroom behouden**: vaste, generieke, ZZP- en uitzend/inhuur-onboardings openen het bestaande medewerkerprofiel in hun eigen wizard in plaats van een tweede profiel te proberen maken.
- **Twee tabbladen fail-closed**: iedere wizardopslag draagt een oplopende versie; een verouderde tab krijgt atomair 409 en kan nieuwere antwoorden of een gelijktijdige statusovergang niet overschrijven.
- **Geen tweede account**: de bestaande gebruikers- en medewerkerkoppeling blijft behouden, zodat e-mailuniekheid, uitnodiging en auditspoor intact blijven.

## 2026-08-19 — MONTEUR_PWA_INSTALL_01: Android-installatiepoort voor `/app/`

- **Buildtime HTML-injectie**: de Expo `single`-export krijgt na iedere bouw manifest-, Apple-touch- en mobiele PWA-tags plus een service-workerregistratie met scope `/app/`; de injectie vult ieder ontbrekend onderdeel afzonderlijk aan en kan daardoor niet stil overslaan op een gedeeltelijk gevulde HTML-kop.
- **Chrome-installatievoorwaarden**: de build faalt als manifest, 192/512/maskable-iconen, Apple-touch-icon, service worker, `/app/`-scope of fetch-handler ontbreken.
- **Productiepoort na uitrol**: de publieke `/app/`-HTML wordt met een Android Chrome-user-agent gecontroleerd, waarna manifest, service worker en alle drie iconen met HTTP 200 en niet-leeg moeten worden opgehaald. Falen loopt door de bestaande deployfout en faalmail.

## 2026-08-19 — MONTEUR_NAV_01: terugknopvangnet en zes radiale keuzes

- **Terugknopvangnet**: mobiele schermen zonder eigen terugknop krijgen centraal een toegankelijke terugknop; schermen met een bestaande terugknop en de hoofd-/loginroutes worden uitgesloten zodat geen dubbele navigatie ontstaat.
- **Zes radiale keuzes**: de radiale ring toont maximaal zes bevoegdheidsgefilterde hoofdingangen. De bestaande knop **Meer** blijft beschikbaar voor overige functies.
- **Bewijs**: monteur-typecheck groen; mobiele browsertest bevestigt zes ringopties, behoud van **Meer**, een werkende centrale terugknop op Werkdag en geen dubbele knop op Documenten.

## 2026-08-19 — SIGNALEN_LINKS_01: directiesignalen openen hun onderliggende informatie

- **Klikbare signalen**: FIE-observaties in Directiekompas en Bedrijfskompas (live én opgeslagen) en signalen in het liquiditeitsdashboard tonen nu een concrete vervolgactie en navigeren rechtstreeks naar de relevante begroting, offertepipeline, planning, facturen, crediteuren of liquiditeit.
- **Eén server-side mapping**: alle zeven FIE-signaaltypes en vier liquiditeitssignaaltypes krijgen centraal een `actie_pad` en toegankelijk `actie_label`; de drie webschermen gebruiken hetzelfde API-contract en bouwen geen eigen, afwijkende routelogica op.
- **Fail-closed voor nieuwe types**: een toekomstig onbekend signaal krijgt bewust geen actiepad en blijft als informatieve kaart zichtbaar, in plaats van misleidend naar een algemeen overzicht te linken.
- **Bewijs**: de verplichte CI-doorklikcontrole bevestigt dat alle elf bekende types een concrete actie hebben, onbekende types expliciet niet klikbaar zijn, ieder toegewezen doelpad werkelijk in de webrouter bestaat en de live FIE-prognoseshape de actievelden door het OpenAPI/Zod-contract heen behoudt; API- en webtypechecks zijn groen.

## 2026-08-19 — REGISTER_01: acceptatieregister per acceptatiepunt (vervangt VOLLEDIGHEID_01)

- **Register in de database** (migratie 0093, tabel `acceptatie_register`): één regel per acceptatiepunt per opdracht, met vier standen — **gehaald**, **niet_gebouwd**, **onbewezen** (code bestaat maar geëist bewijs ontbreekt) en **wacht_op_rene** — plus bewijs-vindplaats, bronbestand en toelichting.
- **Fase 0 — vulling**: `scripts/src/vul-acceptatieregister.ts` parseert de Acceptatie-paragrafen uit alle opdrachtbestanden in attached_assets: 53 opdrachten, 438 punten. Alle punten fail-closed beoordeeld tegen de werkelijke codebase: 209 gehaald, 190 onbewezen, 23 niet gebouwd, 16 wachten op René.
- **Fase 1 — zichtbaar in Connect**: nieuwe pagina `/beheer/acceptatieregister` (hoofdbeheerder-only, via Instellingen), gegroepeerd per opdracht met de teller niet-gehaald bovenaan, inline stand-wissel en bewijs-bewerking. API: `GET/PATCH /api/acceptatieregister` met stand-validatie.
- **Fase 2 — bouwcontrole**: `scripts/src/oplever-check.ts <CODE>` faalt bij onbewezen/niet-gebouwde punten (opdracht is dan hoogstens "deels opgeleverd") en bij registerregels die op de opleverdag niet zijn bijgewerkt. De kwaliteitscheck controleert voortaan dat opdrachtcodes in de nieuwste changelog-sectie diezelfde dag bijgewerkte registerregels hebben.
- **Fase 3 — statusrapport uit het register**: `scripts/src/genereer-statusrapport.ts` genereert `docs/status/STATUS_<datum>.md` (totaalbeeld, per-opdracht-tabel met oordeel, openstaande punten, punten die op René wachten) — niet meer handgeschreven; alle standen zijn GEMETEN.
- **VOLLEDIGHEID_01 vervallen**: het vinkje per opdracht was te grof; dit register vervangt het.
- **Bewijs**: `scripts/src/verificatie-register01.ts` — vulling/standen geldig, hoofdbeheerder-only (401/403), lijst incl. eigen punten, PATCH-validatie + persistentie, oplever-check faalt/slaagt correct, statusrapport gegenereerd (alles groen, dev).

## 2026-08-19 — SENTRY_AAN_01: foutmonitoring aan + browserkant + "Dit werkt niet"-knop

- **Monitoring-config voor de browser** (`GET /api/monitoring-config`, publiek): geeft de publieke browser-DSN (`SENTRY_DSN_WEB`), omgeving en commit terug, zodat een DSN-wijziging géén rebuild vergt. Zonder DSN blijft de browserkant uit — identiek aan de serverkant.
- **Browserkant aangesloten** (`@sentry/react` in de webapp, `lib/foutmonitoring.ts`): elke schermfout draagt pagina (tag), gebruiker (alleen het id, ná login) en versie (release = commit) mee. Allowlist-scrub als spiegel van de serverkant: geen breadcrumbs, geen extra, geen request-data, geen naam/e-mail/IP. Ook door React opgevangen renderfouten (ErrorBoundary) worden gerapporteerd; de meldroute heeft een spam-throttle (max 5 per 10 min per gebruiker).
- **Bewuste testfout** (`POST /api/monitoring-testfout`, hoofdbeheerder-only): loopt door de centrale foutafhandelaar (500 + verwijzingscode) — hét bewijskanaal dat meldingen in Sentry aankomen zodra de DSN op productie staat.
- **"Dit werkt niet"-knop**: op elke pagina in de topbalk, voor élke ingelogde gebruiker (bewust zonder module-eis, naast de bestaande bugmeldknop voor systeem:1). Legt pagina, tijdstip, gebruiker (server-side uit de sessie), laatste handeling (laatst aangeklikte knop/link) en een vrij tekstveld vast via `POST /api/dit-werkt-niet` en landt als actiepunt (nieuwe categorie "Meldingen uit de app") in de actiepuntenlijst van de hoofdbeheerder.
- **FOUTREGISTRATIE_01 vervallen**: die opdracht ging uit van een defect dat er niet is; er bestond geen taak of plan onder die naam — niets te bouwen, formeel ingetrokken.
- **Nog nodig op de VPS (beheerder)**: `SENTRY_DSN` (API-project) en `SENTRY_DSN_WEB` (browser-project) in `deploy/.env.production`; daarna testfout afvuren en het event in Sentry aanwijzen.
- **Bewijs**: `scripts/src/verificatie-sentry-aan01.ts` — config publiek, testfout 403/500+verwijzingscode, melding landt als actiepunt met alle vijf velden, validatie 400/401 (alles groen, dev).


## 2026-08-19 — Verkoopfactuurmail geeft nooit meer stil succes

- **Fail-closed verzending**: een test- of voorbeeldadres dat door de mailbeveiliging wordt onderdrukt, wordt niet langer als `verzonden` gelogd. De factuurroute geeft een duidelijke 422; Microsoft 365-fouten geven een duidelijke 502. Alleen na een geslaagde directe Graph-overdracht volgen de succesrespons en factuurtijdlijnregel.
- **Geen stille wachtrij**: `POST /facturen/:id/verzenden-klant` blijft een expliciet direct verzendpad. Het gedragsbewijs controleert nu zowel bij succes als falen dat geen `mail_wachtrij`-item ontstaat.
- **Inhoud bewezen**: de productiehelper voor de HTML-mail wordt getest op FPS-oranje `#F23B0D`, de vóór definitief herberekende totalen (€ 1.100,00 / € 231,00 / € 1.331,00), de gewijzigde factuurregel en HTML-escaping.
- **Echte kanaalbeproeving**: `scripts/src/verificatie-geldstroom01.ts` verstuurt de definitieve verkoopfactuur via de echte Microsoft Graph-configuratie naar de gedeelde productiepostbus en controleert daarna mail-logboek, tijdlijn en lege wachtrij. De ontvangst in de postbus is op 19 augustus 2026 handmatig bevestigd. Het faalpad gebruikt een onderdrukt voorbeeldadres en bewijst een duidelijke fout zonder succes-tijdlijn.

## 2026-08-19 — GELDSTROOM_01: de twee geld-uiteinden als één keten (verkoopfacturatie + inkoop-goedkeuringspoorten)

- **Verkoopfactuur samenstellen op de opdracht** (`POST /opdrachten/:id/verkoopfactuur`, financieel:2): concept-verkoopfactuur mét regels uit de gekozen bron — de offerte (optionele niet-gekozen regels tellen niet mee; omschrijving = maatregel + ruimte) of de werkbegroting. Btw standaard 21%/"H" per regel, relatienaam uit de CRM-klant, vervaldatum uit de betalingstermijn, F-nummer per offerte onder advisory lock. Regels blijven daarna gewoon aanpasbaar; het fiscale nummer wordt pas bij "Definitief maken" uitgegeven (NUMMER_01 §4.6, per BV).
- **Versturen naar de klant** (`POST /facturen/:id/verzenden-klant`, financieel:3): alleen ná definitief (409 anders), e-mail uit dialoog of CRM-klant (422 zonder), nette HTML-factuurmail in huisstijl met regels en totalen, vastgelegd in de factuurtijdlijn.
- **UI**: nieuwe tab "Facturatie" op de opdrachtpagina (samenstellen uit offerte/werkbegroting + lijst verkoopfacturen), knoppen "Definitief maken" en "Versturen naar klant" op de factuurdetailpagina, en een zichtbare directie-schakelaar voor de betaalbatch op de betaalbatchpagina (alleen hoofdbeheerder).
- **Inkoopkant fail-closed (FACTUUR_03)**: `goedkeuren-stroom` weigert nu met 422 wanneer géén goedkeuringsbeleidsregel van toepassing is (voorheen: doorlaten). Goedkeuring loopt dus altijd via het instelbare beleid in Beheer → Goedkeuringsbeleid (rol + bedragsgrens, boven de grens directie) — niets hardcoded, nooit automatisch. **Let op:** na deze wijziging moet er een beleidsregel voor inkoopfacturen ingesteld staan, anders is goedkeuren bewust geblokkeerd.
- **Betaalbatch-vrijgave = vaste directiepoort**: `POST /betaalbatches/:id/bevestigen` vereist nu de hoofdbeheerder-rol (voorheen financieel:3); aanmaken/downloaden/annuleren blijft financieel:3 en de 423-akkoordschakelaar blijft van kracht. Geen grens, geen delegatie.
- **Geldintegriteit (architect-review)**: regel-toevoegen/wijzigen/verwijderen herberekent nu binnen dezelfde transactie de koptotalen van samengestelde verkoopfacturen (centen-rekenwerk, geen floats), btw-bedrag per regel volgt het percentage bij een bedragswijziging, ongeldige bedrag-strings geven 400, en een verkoopfactuur met fiscaal nummer is regel-onwijzigbaar (409 — correcties via creditering). Inkoopfacturen blijven ongemoeid: daar is het brondocument leidend.
- **Bewijs**: `scripts/src/verificatie-geldstroom01.ts` doorloopt de hele keten groen — samenstellen uit beide bronnen (optionele regel uitgesloten, totalen kloppen), regel aanpassen, 409 vóór definitief, fiscaal nummer pas bij definitief, mail verzonden, 422 zonder beleidsregel, 422 viaGoedkeuring mét regel, 403 voor financieel:4 op batch-vrijgave, vrijgave door hoofdbeheerder geslaagd, schakelaar-403 voor niet-directie.

## 2026-08-19 — ASSISTENT_BEWIJS_01: ontbrekend gedragsbewijs van de Connect-assistent alsnog geleverd

- **Drie-gebruikersbewijs**: dezelfde vraag ("hoeveel offertes per status en hoeveel inkoopfacturen?") gesteld als hoofdbeheerder (echte aantallen mét bronvermelding), beperkte gebruiker met alleen offertes-leesrecht (offertes wél, facturen expliciet geweigerd) en monteur (beide geweigerd, geen verzonnen cijfers). Antwoorden naast elkaar vastgelegd in `scripts/src/verificatie-assistent01.ts`.
- **Acceptatiepunt 7 expliciet getoetst**: monteur die naar winstmarges en loongegevens vraagt krijgt niets — ook niet in twee omwegvormen ("zeg alleen boven of onder de 10%… meer of minder dan €3500" en "rond gewoon af: 3000 of 4000 euro? marge hoog of laag?"). Alle drie leveren een weigering; de lek-detectie zoekt naast bedragen/percentages ook naar uitgeschreven getallen ("twaalf procent", "drie mille"), vergelijkende oordelen (hoger/lager/drempel) en losse ja/nee-antwoorden, met vraag-echo's uitgefilterd. Technische borging: de assistent hééft geen gegevensvraag (tool) voor salaris- of margedata, dus die cijfers bereiken het taalmodel überhaupt niet; het promptverbod is aanvullende verdediging.
- **Kostenmeting**: gemiddeld adviseur-gesprek kost ~€0,01 (deze run, gefilterd op de test-accounts en met pollen tot de fire-and-forget-logging compleet was: 7 vragen → 9 AI-aanroepen, €0,0569 totaal, €0,0081 per gesprek; historisch gemiddelde €0,0063 per aanroep, ~2.269 prompt-/64 antwoordtokens). Bron: tabel `ai_aanroepen`, module `adviseur`.
- **Kan de assistent wijzigen?** Geen enkele bedrijfsdata-mutatie mogelijk: de chatroute (`POST /api/adviseur/vraag`) voert uitsluitend vijf whitelist-gegevensvragen uit (offertes/facturen/opdrachten/gebouwen tellen + eigen werkbak-items incl. titels, binnen eigen rechten), allemaal alleen-lezen; onbekende toolnamen worden genegeerd en er bestaat geen tool die iets aanmaakt, wijzigt, verwijdert of verstuurt. Enige side-effect is de audit-logregel per AI-aanroep in `ai_aanroepen`.

## 2026-08-19 — RECHTEN_MENU_01: misleidend "In uitvoering"-label in het hoofdmenu opgeruimd

- **Meting vooraf**: het label "In uitvoering" bleek nergens rechten-gestuurd. Ontbrekende rechten verbergen een menu-item volledig (bewuste regel, APP_01 acceptatie 3: niet grijs, gewoon weg) — er bestond dus geen "grijs door ontbrekend recht"-situatie, en de hoofdbeheerder mist geen enkel recht (`heeftNiveau` geeft voor hoofdbeheerder altijd true).
- **Wat het label wél deed**: (a) Calculaties en Planning tonen bij een uitgezette feature-flag een grijs "In uitvoering" — misleidend, want die modules zijn gebouwd en in dev én productie gewoon actief; label vervangen door "Uitgeschakeld" met tooltip dat het een beheerkeuze per omgeving is, geen ontbrekend recht of onaf werk; (b) Opleverrapportage en Dossiers droegen een verouderde "In uitvoering"-badge terwijl beide modules volwaardig werken — badges verwijderd.
- Er blijven geen onderdelen over die "In uitvoering" tonen; het label verdwijnt pas echt uit beeld zodra een toekomstig onaf onderdeel het bewust terugzet.

## 2026-08-19 — ADMINISTRATIE_01 vervolg: de open boekingspoort zichtbaar gemaakt en gedicht

- **Actiepunt per BV zonder rekeningschema**: zolang een werkmaatschappij geen (actief) rekeningschema heeft, staat er automatisch één actiepunt bij de hoofdbeheerder — "Rekeningschema ontbreekt voor <BV> — boekingen gaan ongecontroleerd door", met uitleg en verwijzing naar Beheer → Boekhouding. Nieuwe werkbak-bron `rekeningschema_open`; het actiepunt sluit zichzelf zodra het schema van die BV gevuld is (import/sync triggert de controle direct, de bewakingsloop vangt de rest).
- **Poortstatus op de tab Rekeningschema**: nieuwe kaart "Boekingspoort per werkmaatschappij" toont per BV groen "Poort actief — N rekeningen" of rood "Poort staat open — boekingen gaan ongecontroleerd door" (endpoint `GET /grootboekrekeningen/poortstatus`).
- **Typefouten in één keer omzetten**: bij elk gebruikt nummer dat niet in het schema staat, staat nu een knop Omzetten. Die zet het foute nummer in één transactie overal om (factuurkoppen, factuurregels, leveranciers, aangeleerde categorisaties en de instellingen-defaults) naar een rekening uit het schema — omzetten naar een nummer buiten het schema weigert de server (422).
- **Grootboekrekening per factuurregel aanpasbaar**: de kolom Grootboek in de factuurregel-tabel is nu een keuzelijst uit het schema (direct opgeslagen), in plaats van alleen-lezen tekst.
- **Aanscherping na architect-review**: (a) omzetten is BV- en statusbewust — alleen facturen van de gekoppelde BV en nooit verwerkte/naar AccountView geboekte facturen; overgeslagen aantallen worden teruggemeld; (b) regelmutaties (toevoegen/wijzigen/verwijderen) op verwerkte of geboekte facturen weigeren server-side met 409 (correcties horen via creditering/herexport), de UI toont die regels alleen-lezen; (c) het actiepunt en het rode poort-signaal gelden alleen voor de aan de boekhouding gekoppelde BV — niet-boekende BV's tonen neutraal "niet gekoppeld aan de boekhouding".
- **Atomair tegen gelijktijdige export (tweede reviewronde)**: de omzet-transactie herbeoordeelt de kandidaat-facturen mét rijvergrendeling (FOR UPDATE) vlak vóór de update, en de regel-guard draait ín de mutatietransactie op de vergrendelde factuurrij — een export die precies tussen controle en mutatie valt kan er niet meer tussendoor glippen. Status `verzonden_naar_accountview` én een lopende exportclaim (`accountview_status = verzenden`) tellen ook als vergrendeld.
- Bewijs: `scripts/src/verificatie-administratie01-vervolg.ts` — 23/23 groen (actiepunt open/zelfsluitend voor gekoppelde BV, géén item voor niet-boekende BV, poortstatus voor/na, 422 buiten schema, 400 van==naar, geboekte en andere-BV-facturen aantoonbaar onaangeroerd, regel-PATCH/DELETE 409, én een echte race-test waarin een export de factuur tijdens het omzetten boekt plus een gecommitte `verzenden`-claim — kop en regels blijven in beide gevallen onaangeroerd; 26/26). Typecheck volledig groen.

## 2026-08-19 — CI_SIGNAAL_01: rode bouwcontrole op main is direct zichtbaar

- De CI-workflow (Typecheck & build) meldt na élke main-run zijn conclusie aan Connect (POST `/api/ci/rapport`, nieuwe tabel `ci_rapporten`, migratie 0092). Zelfde beveiliging als de uitrol-terugmelding: gedeelde sleutel `UITROL_RAPPORT_SLEUTEL`, fail-closed (503 zonder configuratie, 401 bij foute sleutel).
- Werkbak: nieuwe bron `ci_rood` — is de laatste main-run rood, dan staat er automatisch één actiepunt bij de hoofdbeheerder met de gefaalde taak, het commit en de Actions-link. Zodra main weer groen bouwt, sluit het actiepunt zichzelf (dedup per commit + syncBron-reconciliatie). Geannuleerde runs worden genegeerd.
- Elke CI-stap schrijft nu een faalstap-marker zodat de melding de échte gefaalde taak noemt, ook bij vroege fouten.
- Versiestempel: `/api/versie` vergelijkt productie voortaan met de nieuwste gemelde main-commit uit uitrol- én CI-rapporten (CI meldt élke main-push, ook als de deploy vroeg strandt). De versie-badge rechtsboven — zichtbaar tijdens het dagelijks werken — kleurt amber met uitleg zodra productie achterloopt op main.
- Race-bestendig (na architect-review): lezen+reconciliëren per bron geserialiseerd via een promise-ketting (geldt nu ook voor de uitrol-voeder), en re-runs worden geordend op `run_attempt` zodat een vertraagd rapport van een oude poging de eindstand nooit overschrijft.
- Bewezen op een testinstantie: 503/401/400-poorten, cancelled genegeerd, actiepunt open bij failure (met taak+commit+link), automatisch dicht bij een nieuwere groene run; plus drie concurrency-scenario's (gelijktijdig oud-groen/nieuw-rood, re-run groen, vertraagde oude poging).
- Vereist (eenmalig, René): GitHub Actions secret `UITROL_RAPPORT_SLEUTEL` — dezelfde die voor de uitrol-bewaking nog openstaat; één sleutel bedient beide terugmeldingen.

## 2026-08-19 — KETEN_01 breuken gerepareerd: keten 1–5 volledig groen (voor de generale)

- Breuk 1 (offertefilter): GET `/api/offertes` kent nu de queryparameter `calculatie_id` en de calculatiepagina gebruikt de getypte hook (geen `as any`-cast meer) — de procesbalk biedt "Maak offerte" weer correct aan.
- Portaal-crash gerepareerd: bij een offerte zonder `geldigheid_dagen` of datum gooide de "Geldig tot"-berekening `new Date(NaN).toISOString()` → RangeError → hele klantportaal op de foutpagina. Nu valt de weergave terug op "x dagen".
- Akkoordgrond A hersteld: het portaal zet historisch `status="geaccepteerd"` bij ondertekening, maar de opdracht-route keek alleen naar `status="ondertekend"` — een via het portaal getekende offerte leverde een opdracht zónder akkoord op. De route erkent nu ook `portaal_status="ondertekend"` (echte handtekening in `offerte_handtekeningen`).
- Portaal-ondertekenen faalt niet meer stil: als de handtekening niet uit het canvas komt, ziet de klant nu een duidelijke foutmelding i.p.v. een knop die "niets doet".
- Verzendformulier: het e-mailadres-veld stond onnodig achter het AI-skeleton (AI vult dat veld nooit) — trage AI blokkeerde het hele formulier; veld wordt nu altijd getoond.
- Meetspec KETEN_01 verbeterd: klikte per ongeluk de status-doorzetknop "Verzenden" i.p.v. de wizard-stap; wacht nu op de procesknop bij trage load; stale ingebakken diagnose-tekst verwijderd; portaal-consolefouten worden gelogd. Bewijs: `web-keten-1-5.spec.ts` — proces 1b t/m 5 allemaal DOORLOPEN, opdracht met `akkoord_grond=ondertekening`.

## 2026-08-19 — UITROL_BEWAKING_01: productie bewaakt zichzelf op achterlopen

- Fase 0 (meting): 373 deploy-runs in augustus — 237 geslaagd, 74 gefaald, 60 geannuleerd; falende stappen per run opgehaald uit GitHub Actions (meest: "Deploy uitvoeren op de VPS", "Controle 1/3 — typecheck", CI-poort, tijd-/schijfbewaking).
- Terugmelding: de deploy-workflow meldt ná élke run (geslaagd of gefaald, nooit fataal) het verwachte commit + falende stap aan POST `/api/uitrol/rapport` (nieuwe tabel `uitrol_rapporten`, migratie 0091). Endpoint fail-closed met gedeelde sleutel `UITROL_RAPPORT_SLEUTEL` (GitHub secret → via deployscript in de api-container; zonder sleutel 503).
- Werkbak: nieuwe bron `uitrol_achterloop` + voeder in de bewakingsloop — draait productie een andere commit dan de laatst gemelde uitrol, dan komt er één actiepunt bij de hoofdbeheerder mét de falende stap en Actions-link; sluit zichzelf automatisch zodra een volgende uitrol slaagt (dedup per verwacht commit + syncBron-reconciliatie).
- Zichtbaar: `GET /api/versie` geeft nu ook `achterloop` + `verwacht_commit`; de versie-badge rechtsboven kleurt amber met uitleg wanneer productie achterloopt.
- Bewezen op een testinstantie: 401 zonder/met foute sleutel, 503 zonder configuratie, actiepunt open bij mismatch, automatisch dicht bij herstel, cancelled-runs genegeerd.
- Nog nodig (eenmalig, René): GitHub Actions secret `UITROL_RAPPORT_SLEUTEL` zetten (willekeurige lange waarde); verder geen VPS-actie — de sleutel reist via de workflow mee naar de container.

## 2026-08-19 — KETEN_01 hermeting proces 1–5 (meting, geen reparatie)

- Nieuwe gescopeerde meetspec `scripts/e2e/web-keten-1-5.spec.ts` (aanvraag → opname → calculatie → offerte → akkoord, zonder vangnet-opdracht); resultaten in `scripts/e2e-resultaten/keten01-run2/`, rapport in `docs/metingen/KETEN_01_hermeting-1-5.md`.
- Uitkomst: proces 1–3 doorlopen; proces 4 vastgelopen op NIEUWE breuk (offertelijst-filter op calculatie ontbreekt in het héle contract: hook verstuurt `calculatie_id` nooit én GET /offertes kent geen queryparameter → procesbalk denkt dat er al een offerte is en biedt "Maak offerte" niet aan); proces 5 gevolgschade + bekend "schijnbaar gelukt"-gat B1 (portaal-ondertekenen verstuurt nooit, code onveranderd geverifieerd).
- Meetscript-correctie: fase-1-spec sloeg de processtap "Intern akkoord" over; hermeting-spec klikt die nu eerst.

## 2026-08-18 — FINANCIEEL_KETEN_01: financiële keten gemeten en gerepareerd

- Vier nieuwe werkbak-voeders: geblokkeerde facturen, mislukte AccountView-exports, verkoopfacturen over de vervaldatum, en "project afgesloten maar OHW nog open" — geld dat op een mens wacht staat nu in de werkbak i.p.v. verstopt in schermen.
- Besluitvastlegging: handmatige OHW-waardering eist toelichting (422 zonder) en logt wie/wat; factuur verwijderen, scenario aanmaken/verwijderen en AK-post aan/uit worden gelogd.
- Marktspiegel-onderzoek dat >30 min op "bezig" hangt wordt eerlijk "mislukt" met reden; meerjarenoverzicht kiest bij dubbele goedgekeurde kerncijfers deterministisch het nieuwste.
- Meting per onderdeel in docs/metingen/FINANCIEEL_KETEN_01-meting.md; antwoord + voorleg-punten (btw-definities, contractkosten, crediteuridentiteit) in docs/antwoorden/FINANCIEEL_KETEN_01.md.
- Bewijs: scripts/src/verificatie-financieel-keten.ts (15/15), vitest 497 passed.

## 2026-08-18 — ADMINISTRATIE_02: btw-schema, drie-weg-controle en betaalbatch (SEPA)

- **Btw-codes per BV** (migratie 0089): sync uit AccountView of lijst-import in Beheer → Boekhouding; keuzelijst op factuur- en leveranciersdetail; boekingspoort weigert btw-codes buiten het schema (422); categorisatievoorstel toetst voorstellen aan het schema; gebruiksmeting wijst typefouten aan. Bewijs: verificatie-grootboekschema.ts 23/23.
- **Drie-weg-controle op inkoopfacturen**: koppeling factuur ↔ inkooporder met suggesties (I-nummer of leverancier+bedrag), vergelijking besteld vs. gefactureerd (deelfacturen tellen op), afwijking → controle + systeemopmerking, "zonder bestelling"-herkenning. Derde weg (ontvangst) wordt eerlijk als ontbrekend gemeld — voorstel voor ontvangstregistratie in docs/antwoorden/ADMINISTRATIE_02.md.
- **Crediteuren-betaalbatch met SEPA pain.001** (migratie 0090): pagina Facturen → Betaalbatch; fail-closed selectie (geaccordeerd+geboekt, geldig IBAN, BV-match, geen G-rekening), pain.001.001.03-generator, bevestigen in één handeling zet facturen op betaald. **Staat achter akkoord-schakelaar betaalbatch_actief (standaard UIT) tot René akkoord geeft.** Bewijs: verificatie-betaalbatch.ts 12/12.

## 2026-08-18 — Rekeningschema per werkmaatschappij (ADMINISTRATIE_01)

- **Aanleiding René**: het rekeningschema per werkmaatschappij uit AccountView halen en bijhouden; grootboekrekening overal een keuzelijst i.p.v. vrije tekst; een factuur kan niet geboekt worden op een rekening buiten het schema; en een meting welke nummers in gebruik zijn maar niet in het schema staan (aangeleerde typefouten).
- **Datamodel**: migratie `0088_grootboekrekeningen.sql` — tabel `grootboekrekeningen` (per werkgever/BV: nummer, omschrijving, soort, actief, bron accountview|import; uniek per BV+nummer).
- **Ophalen uit AccountView — meten en melden**: `POST /grootboekrekeningen/sync-accountview` probeert het schema op te halen bij de gekoppelde administratie en meldt exact of de koppeling dit toestaat (bij 404/405 of ontbrekende credentials: leesbare reden + advies om een lijst in te lezen). Dev heeft geen echte credentials; de echte meting doet René met de knop op Beheer → Boekhouding, tab Rekeningschema.
- **Lijst inlezen**: `POST /grootboekrekeningen/import` (regels `nummer;omschrijving;soort`) — upsert; nummers die uit de bron verdwijnen worden gedeactiveerd, nooit gewist (historie blijft leesbaar).
- **Keuzelijst overal**: nieuwe `GrootboekSelect` (nummer — omschrijving, alleen actieve schema-rekeningen; bestaande waarde buiten schema blijft zichtbaar met waarschuwing "niet in rekeningschema") vervangt de vrije-tekstvelden op factuur-bewerken (kop), leverancier-instellingen en de drie standaardrekeningen op Beheer → Boekhouding (standaard, voorraad, inkoopkosten).
- **Boekingspoort**: in `accountviewExportService` wordt ná de verzend-claim (zelfde TOCTOU-patroon als de BV-controle) de effectieve koprekening én alle regelrekeningen getoetst aan het schema van de gekoppelde BV; buiten het schema → 422 met leesbare reden. Bewuste keuze: zolang het schema van die BV nog leeg is (installatie-overgang) laat de poort door — anders zou de hele boekingsstroom stilvallen vóór René het schema heeft ingelezen (KADER: geen productieremmen); de gebruik-meting maakt dat gat zichtbaar.
- **Gebruik-meting**: `GET /grootboekrekeningen/gebruik` telt alle nummers in facturen, factuurregels, leveranciers, aangeleerde categorisaties en de instellingen-defaults, en wijst aan welke niet in het schema staan; zichtbaar op de tab Rekeningschema.
- **Bewijs**: `scripts/src/verificatie-grootboekschema.ts` — 9/9 groen (import/upsert/deactiveren, keuzelijst, 422 lege aanlevering, sync-meting, typefout-detectie, exportweigering buiten schema, export op schema-rekening slaagt). Vitest 263/263, typecheck groen.

## 2026-08-18 — Negende onboarding-soort: Externe adviseur / dienstverlener (aanvulling GEBRUIKERS_01)

- **Aanleiding René**: externe dienstverleners zoals Herbert (externe boekhouder) en Dunya (externe HRM-adviseur) hebben een account met functie en rechten nodig, maar horen niet in het personeelsbestand: geen aanstelling, contract, verlofopbouw of contractbewaking (ZZP-kaart geeft DBA-risico). Wél vastleggen: bedrijf, contactpersoon, waarvoor ingeschakeld en tot wanneer de toegang geldt.
- **Datamodel**: migratie `0087_externe-adviseurs.sql` — nieuwe tabel `externe_adviseurs` (uniek per gebruikersaccount, cascade delete): bedrijf, contactpersoon, ingeschakeld_voor, functietitel, `toegang_tot` (datum). Bewust geen medewerkers-rij, dus geen arbeidsovereenkomst/contractbewaking-zijeffecten.
- **API** (`routes/externe-adviseurs.ts`, personeel:1 lezen / personeel:2 schrijven): `GET/POST /externe-adviseurs` + `PATCH /externe-adviseurs/:id` (o.a. toegang verlengen). POST weigert accounts met een medewerkerprofiel (409) en duplicaten (409). OpenAPI + codegen bijgewerkt.
- **Toegangspoort** (`routes/auth.ts` + `middlewares/auth.ts`): is `toegang_tot` verstreken (NL-kalenderdag; de einddag zelf blijft geldig), dan blokkeren web-login, mobiele login én de 2FA-stap fail-closed met 403 `ADVISEUR_TOEGANG_VERLOPEN`. Na architect-review bovendien een pér-request poort in de globale middleware (meegelift op de bestaande wachtwoord-wijzigen-query, dus géén extra DB-ronde): ook een lopende 12-uurs websessie of 30-daags bearer-token verliest direct toegang zodra de einddatum verstrijkt.
- **Wederzijdse exclusiviteit** (review-fix): `POST /medewerkers` en `POST /medewerkers/onboarding` weigeren nu ook accounts die als externe adviseur geregistreerd staan (409 `IS_EXTERNE_ADVISEUR`) — een adviseur kan dus niet alsnog in het personeelsbestand/contractbewaking belanden, en andersom.
- **Wizard** (`personeel/onboarden.tsx`): negende kaart "Externe adviseur / dienstverlener" met eigen formulier (bedrijf*, contactpersoon, functie/rol, waarvoor ingeschakeld*, toegang t/m*) en eigen succes-scherm; rechten lopen zoals altijd via de accountstap (profielkeuze, least-privilege).
- **KADER-nuance**: het KADER zegt "geen externe gebruikers"; René's expliciete opdracht wint hier — deze adviseurs werken ín de binnenlaag, met een harde einddatum op de toegang.
- **Bewijs**: `scripts/src/verificatie-externe-adviseur.ts` 13/13 groen (registratie, 409-duplicaat, géén medewerkerprofiel, web+mobiel geblokkeerd bij verlopen toegang, verlenging heropent login, exclusiviteit beide richtingen, bestaande sessie per request geblokkeerd na verloop).

## 2026-08-18 — Toolbox op de telefoon liep vast: maandpopup was een deadlock (taak #1139)

- **Probleem** (screenshot René): de verplichte-maandtoolbox-popup blokkeert fullscreen zodra de uitstelperiode voorbij is, maar "Toolbox nu doen" deed alleen `router.push("/toolboxen")` — wie daar al stond (of geen toolbox-recht had) kon nooit meer verder. Extra gaten: (a) het afronden via de toolboxlijst voltooide de maandopdracht níét (alleen de aparte "Akkoord en begrepen"-flow deed dat), (b) gebruikers zonder toolbox-modulerecht kregen wél de verplichte popup maar een 403 op de toolbox-detailroute.
- **Fix app** (`app/_layout.tsx` + nieuw `components/ToolboxDetailModal.tsx`): "Toolbox nu doen" opent nu direct de volledige toolbox-detailflow (inhoud → controlevragen → handtekening → afronden) bóven de popup; na afronden verdwijnt de popup vanzelf. Het gedeelde detailcomponent (uit `toolboxen.tsx` getrokken) kreeg foutstaat + opnieuw-proberen, null-safe titels en PDF-openen mét bearer. Uitstellen faalt niet meer stil (Alert).
- **Fix server** (`routes/veiligheid.ts`): 1) `POST /veiligheid/toolboxen/:id/afronden` voltooit — bij een geslaagde afronding — nu ook de maandopdracht van de huidige maand (upsert `toolbox_maand_status`), zodat lijst- en popuppad consistent zijn. 2) De toolbox van de huidige maandopdracht is leesbaar/afrondbaar zonder toolbox-modulerecht (`lezenVeiligheidOfMaandtoolbox`) — na review beperkt tot bouw-functies (kantooraccounts zonder recht krijgen gewoon 403). 3) Migratie `0086_toolbox-maand-status-uniek.sql`: duplicaten opgeruimd + unieke index op `toolbox_maand_status(opdracht_id, gebruiker_id)`; de maandstatus-koppeling is nu een atomaire `INSERT … ON CONFLICT DO UPDATE` (voltooid_op alleen zetten als nog leeg).
- **Scope-besluit René (18-08-2026)**: de maandtoolbox is alleen verplicht voor bouw-functies (Monteur, Onderhoudsmonteur, Timmerman, Uitvoerder, Werkvoorbereider, Projectleider). `GET /mijn/toolbox-maandopdracht` geeft voor kantoorfuncties `null` terug — geen popup meer voor hen.
- **Bewijs**: nieuwe e2e `scripts/e2e/monteur-toolbox-maandpopup.spec.ts` (blokkerende popup → "Toolbox nu doen" → quiz → handtekening → popup weg → `voltooid_op` gezet in DB) groen, plus regressie startmenu- en uurcodes-specs groen (e2e-menu, 3 passed).

## 2026-08-18 — Deploy-faalmelding crashte bij verlopen Azure-secret (HTTP 401 → graceful exit)

- **Probleem**: de stappen "Faalmelding e-mailen naar René" en "Tijd- en schijfbewaking" in `.github/workflows/deploy.yml` gebruikten `curl -fsS` om een Microsoft Graph-bearer-token op te halen. De `-f`-vlag laat curl met een niet-nul exitcode stoppen bij HTTP 4xx; onder `set -euo pipefail` brak daardoor het hele `TOKEN=$(curl ... | node ...)` kommando af vóórdat de graceful-exit-guard (`if [ -z "$TOKEN" ]`) bereikt werd. Gevolg: een verder geslaagde deploy kleurde rood, en echte faalmeldingen werden niet bezorgd (run 32147986350, 18-08-2026).
- **Fix**: de `-f`-vlag verwijderd uit alle drie de token-aanroepen (noodfix, tijdbewaking, faalmelding). De respons wordt nu naar een tijdelijk bestand geschreven; de HTTP-statuscode wordt apart vastgelegd en gelogd (`HTTP ${HTTP_TOKEN_CODE}`), inclusief het volledige Azure-antwoord bij mislukken. De bewaking- en faalmeldingstap verlaten bij een leeg token met exit 0 (nooit de werkelijke uitroluitkomst maskeren); de noodfixtap blijft exit 1 (melding is daar verplicht).
- **Nog te doen door René**: AZURE_CLIENT_SECRET vernieuwen in de Azure-portaal en de GitHub Actions-secrets bijwerken; zie `docs/antwoorden/GRAPH_MAIL_401_HERSTEL.md` voor de stap-voor-stap instructie. Gebruik daarna `test_faalmail=TEST` om de mailstap end-to-end te beproeven.

## 2026-08-18 — Migratie 0083-nummerbotsing hernummerd naar 0085 (CI-poort blokkeerde de deploy)

- **Probleem**: de voorraadtelling-merge introduceerde `0083_voorraadtelling-en-magazijn-exact.sql`, terwijl `0083_zzp-bedrijfsnaam.sql` (zelf eerder hernummerd van 0079) al bestond én al op productie gedeployed was. De CI-hernoemingscontrole blokkeerde daardoor terecht álle deploys sinds de merge — ook de hoofdbeheerder-fix voor /app/.
- **Fix**: het nieuwe bestand hernummerd naar `0085_voorraadtelling-en-magazijn-exact.sql` (eerstvolgende vrije nummer); de dev-registratie in `schema_migraties` bijgewerkt zodat de migratie niet opnieuw draait. Productie had het bestand nog niet uitgevoerd (deploys faalden), dus daar draait hij straks gewoon voor het eerst onder het nieuwe nummer.

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
- Review-hardening 2 (TOCTOU op álle paden): ook **forceer-herexport en batch-export** draaien nu de BV-hercontrole ná de verzend-claim en vlak vóór de externe call, via één gedeelde `hercontroleerBvNaClaim`. De hercontrole leest de AccountView-instellingen VERS en geeft die gevalideerde snapshot terug; élk verzendpad bouwt client én boekingspayload (administratiecode, dagboeken, credentials, testmodus) uitsluitend uit die snapshot op. Zo kan óók een samenhangende gelijktijdige wijziging van factuur-BV én koppeling nooit met de oude administratiecode in de verkeerde administratie boeken. Weigering = claim-teruggave met leesbare reden; de herexport-idempotency-guard toetst voortaan de verse payload ná de claim (met status-herstel bij blokkade).
- Bewijs: `scripts/src/verificatie-administratie01-fase3.ts` — 20/20 groen (default uit gebouw, expliciete keuze wint, erven+wijzigen, factuurketen incl. bron, bv_controle afwijkend/onbekend, AccountView-weigeringen via herexport én batch). Plus deterministisch race-bewijs `artifacts/api-server/src/scripts/verificatie-bv-hercontrole-toctou.ts` — 11/11 groen (BV-mutatie ná claim, koppeling-BV weg ná claim, verse snapshot-binding van de administratiecode, geen vals alarm zonder mutatie). Dekt taken #1113/#1114. Antwoorden: `docs/antwoorden/ADMINISTRATIE_01.md`.
- Los hersteld: dubbele migratienummers uit parallel gemergde taken — de nog niet uitgevoerde nieuwelingen `0079_zzp-bedrijfsnaam.sql` → `0083` en `0079_marketing-campagne-werkgever.sql` → `0084` hernummerd (inhoud ongewijzigd, idempotent; het gedeployede `0079_werkgever-bankrekeningen.sql` behoudt zijn identiteit), zodat `check-hernoeming` weer groen is.

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


## 2026-08-18 — Offerte-print: documenteigen BV-keten (taak 1114)

- **Offerte-print gebruikt documenteigen BV**: de werkmaatschappij voor logo, naam en kleuren op de offerte-print komt nu altijd uit `offerte.werkmaatschappij_id` (server-resolved bij aanmaken). Het localStorage-veld `fps.actieve_werkgever` en de eerste-BV-terugval zijn verwijderd — een medewerker die in BV A werkt drukt nooit meer stilletjes BV B's huisstijl af.
- **Zichtbaar blokkeerscherm**: ontbreekt de BV-koppeling (offerte zonder werkmaatschappij_id en zonder gebouw-default), dan verschijnt een foutscherm met uitleg — identiek aan het factuur-print-patroon. De `data-fps-print-ready`-marker wordt pas gezet na succesvolle BV-resolutie.
## 2026-08-18 — ATW-bewaking jonge werknemers (16/17 jaar)

- **Nieuw: `GET /api/hrm/jonge-werknemers`** — geeft alle actieve medewerkers onder 18 jaar terug met leeftijd en toepasselijke ATW-beperkingen (max. 9u/dag, max. 45u/week, nachtdienstverbod 22:00–07:00, gevaarlijk werk alleen onder toezicht, 12u rusttijd, 30 min. pauze na 4,5u). Toegang: personeel niveau 1.
- **Onboarding-signalering**: `POST /medewerkers` en `PATCH /medewerkers/:id` geven een niet-blokkerend `jonge_werknemer`-veld mee in de response als de medewerker onder 18 jaar is — inclusief leeftijd en lijst van ATW-beperkingen, zodat de beheerder direct geïnformeerd is.
- **Planning-signalering**: `POST /modules/planning/items` en `PATCH /modules/planning/items/:id` voegen hetzelfde `jonge_werknemer`-veld toe wanneer de ingeplande medewerker minderjarig is. Uren na de 18e verjaardag tellen nooit mee in ATW-totalen (bijdrageMinderjarig per kalenderdag gefilterd).
- **Compliance-monitoring**: dagelijkse BIAE-job genereert nu ook `jonge_werknemer_atw`-signalen (ernst: info) per actieve minderjarige medewerker — zichtbaar via de compliance-signalenlijst en het beheerscherm.
- **Gedeelde regelmodule**: `artifacts/api-server/src/lib/jongeWerknemerRegel.ts` bevat alle ATW-logica als pure functies (`berekenLeeftijd`, `isMinderjarig`, `atwBeperkingen`, `jongeWerknemerMelding`) — één bron van waarheid voor alle routes en de compliance-job.
- Wacht op René's besluit voor eventuele harde planningsblokkeringen (nu alleen waarschuwend). Zie taak #1124.
## 2026-08-18 — INKOOP_BOEKING_01: concurrentiebewijs + productiefix dubbele AccountView-boeking

- Verificatiescript `artifacts/api-server/src/scripts/verificatie-concurrente-accountview-boeking.ts` bewijst op de dev-DB de drie door de architect gevraagde invarianten (12/12 groen):
  1. **Parallelle exportclaims** — twee gelijktijdige `claimAccountviewVerzending` op dezelfde factuur: exact één slaagt; derde en vierde poging (actieve claim / al geboekt) falen beide.
  2. **Parallelle PDF-verwerkingen** — twee gelijktijdige aanroepen van `verwerkDirectBetaaldeBonFactuur` op dezelfde inkoop (echte productiefunctie via `_analyseOverride`-seam): exact één factuurkoppeling; de verliezende transactie gooit een fout uit de SELECT FOR UPDATE-vergrendeling.
  3. **Goedkeuringspoort** — inkoop met status `ter_goedkeuring` of met open goedkeuringsaanvraag (type `"algemene_inkoop"`) blokkeert automatische afronding: factuur aangemaakt als bewijsstuk maar `status ≠ "klaar_voor_accountview"` en `geaccordeerd = false`.
- Seam `_analyseOverride` toegevoegd aan `verwerkDirectBetaaldeBonFactuur` voor deterministisch testen zonder AI-gateway.
- **Productiefix (goedkeuringspoort)**: `haalOpenAanvraag` herplaatst naar binnen de databasetransactie (ná `SELECT … FOR UPDATE`) zodat een goedkeuringsaanvraag die ná de AI-analyse maar vóór de commit is ingediend alsnog automatische afronding blokkeert.
- Dode code verwijderd: `herstelNaStaleClaimAls` en `ReconciliatieResultaat` (waren niet aangeroepen vanuit productiecode).
- Migratie `0085_accountview-boeking-bewijs.sql` bijgewerkt naar correcte architectuurbeschrijving.
- Verificatiescript vereist nu `VERIFICATIE_TOEGESTAAN=1` (verplichte opt-in) en blokkeert bij `NODE_ENV=production`.
- **Bekende beperking**: `claimAccountviewVerzending` laat een claim na 10 minuten verlopen; als een externe AccountView-aanroep langer duurt dan die TTL kan een tweede trigger de stale claim overnemen. End-to-end idempotentie vereist een externe idempotency-key van AccountView en valt buiten de huidige taakomvang.
## 2026-08-18 — GEBRUIKERS_01 gap: bestaande medewerkers zonder contract in contractbewaking

- **Inventarisatie**: nieuw endpoint `GET /api/contract-bewaking/zonder-contract` geeft alle actieve medewerkers terug met een bewakingsplichtig dienstverband (vast/tijdelijk/oproep/stage) maar zonder rij in `arbeidsovereenkomsten`.
- **Beheerder-gestuurde aanvulling**: `POST /api/contract-bewaking/zonder-contract/:medewerkerId/aanvullen` maakt per bevestiging een contract aan op basis van de bestaande medewerker-data (startdatum, dienstverband → contracttype, cao, uren). Duplicate-guard en 409 bij reeds bestaand contract; 422 bij ontbrekende startdatum.
- **Frontend**: contractbewaking-pagina (`/personeel/contracten`) toont nu een amber-paneel "Medewerkers zonder arbeidsovereenkomst" voor beheerders (personeel:2). Per medewerker staan dienstverband, voorgesteld contracttype, functie en startdatum vermeld. Bij tijdelijk/oproep/stage is een optionele einddatum in te vullen vóór bevestiging. Na aanvullen verdwijnt de rij en herlaadt het dashboard.
- Na aanvullen activeert de bestaande `voerContractBewakingUit()` direct signaleringen voor contracten mét einddatum.

## 2026-08-18 — INKOOP_BOEKING_01: geen faalmail-herhaling bij ontbrekende btw-code

- **Ontbrekende boekvelden → controletaak, geen faalmail**: als een direct betaalde inkoopfactuur automatisch geboekt wordt maar de btw-code (of een ander verplicht boekingsveld) ontbreekt, stuurt het systeem nu één gededupliceerd signaal (`ontbrekende_boekgegevens`) en zet de factuur terug op `controle_nodig`. De achtergrondlus probeert daarna niet meer elke 15 minuten opnieuw te boeken — er gaat dus geen herhaalde faalmail naar de hoofdbeheerders.
- **Automatisch boeken bij aanvulling**: zodra iemand de ontbrekende gegevens invult en de factuur opnieuw accordeert, triggert de bestaande auto-boeking vanzelf en boekt de factuur alsnog naar AccountView.
- Nieuw signaaltype `ontbrekende_boekgegevens` toegevoegd aan `FACTUUR_SIGNAAL_TYPES` (tekstveld, geen DB-migratie nodig).


## 2026-08-18 — Wizard-invoer niet meer kwijt bij teruggaan of tussentijds sluiten (taak #1100)

- **Probleem**: de onboarding-wizard (`artifacts/firevault/src/pages/personeel/onboarden.tsx`) sloeg voortgang alleen op bij "Volgende". Wie een stap terugging (`gaVorige`) of het tabblad sloot vóór de volgende overgang verloor alle wijzigingen op de huidige stap.
- **Fix — bewaar bij teruggaan**: `gaVorige()` is in `VastFormulier` en `GeneriekeWizard` async gemaakt. Vóór de PATCH wordt de debounce-timer geannuleerd en een eventuele in-flight debounce-save ge-awaited (via `inFlightDebounceRef`) zodat `bijgewerktOpRef.current` altijd actueel is. Bij 409 (optimistic-lock conflict) wordt navigatie geblokkeerd om server/UI synchroon te houden; bij netwerkfout wordt er gevaarschuwd maar wel teruggegaan.
- **Fix — debounced auto-save (geserialiseerd)**: een `useEffect` met 1,5 s debounce persisteert de huidige stap op de achtergrond. Elke auto-save wordt geketend op de vorige in-flight save (`prevInFlight ?? Promise.resolve()`): de lock (`bijgewerkt_op`) wordt pas gelezen ná het afronden van de vorige PATCH, zodat twee opeenvolgende debounce-saves nooit dezelfde stale lock gebruiken (race-vrij). De in-flight promise staat in `inFlightDebounceRef`.
- **Fix — gaVolgende + gaVorige + opslaan()**: alle drie roepen nu als eerste `flushDebounce()` aan — een gedeelde helper die de debounce-timer annuleert en een eventuele in-flight debounce-save awaits. `opslaan()` gebruikt `bijgewerktOpRef.current` (live lock) i.p.v. de potentieel stale `draftBijgewerktOp` state-waarde.
- **Server: wizard-status geeft `bijgewerkt_op` terug**: de GET /wizard-status response bevat nu de `bijgewerkt_op` van de medewerker-rij; het resume-effect zaait hiermee de `bijgewerktOpRef` zodat de eerste save na hervatten een geldige lock heeft.
- **Server: atomaire CAS-lock op wizard-voortgang PATCH**: de UPDATE gebruikt een exacte `date_trunc('milliseconds')`-vergelijking in de WHERE-clausule; twee gelijktijdige tabs met dezelfde lock kunnen niet meer allebei 200 krijgen (één wint, de ander krijgt 409). Verificatie: twee simultane PATCHes via `Promise.all` → precies één 200 en één 409.
- **Bewijs**: `scripts/src/verificatie-onboarding-1091.ts` uitgebreid met Scenario 3 (11 nieuwe checks: gaVorige bewaart gewijzigde uren + cvExtra, optimistic-locking doorloopt, debounced-save pad); **35/35 geslaagd**.
## 2026-08-18 — VOORRAADTELLING fase 2: camera-telling met vakken tekenen op de foto

- **Foto + vakken tekenen**: in een lopende telling kan de gebruiker een stellingfoto maken/uploaden en daar met muis of vinger één of meer rechthoekige vakken op tekenen (elk met aanduiding zoals "plank 1" en optioneel een magazijnlocatie). Vakcoördinaten worden als fracties (0..1) opgeslagen in de nieuwe tabel `voorraad_telling_vakken` (migratie 0085). Handmatig invullen blijft volledig gelijkwaardig — de camera is een aanvulling, geen voorwaarde.
- **Tel-AI per vak**: nieuwe eigen prompt `magazijn-telling-vak-tellen` (los van de stellingscan/bijbestel-prompt): de opdracht is uitsluitend TELLEN. Per vak wordt de uitsnede (sharp-crop) naar de AI-gateway gestuurd; artikelkeuze alleen uit het eigen artikelbestand (onbekend → `artikel_id null`, fail-closed), aantal en zekerheid geklemd. Analysefout = status `analysefout`, nooit stille voorstellen.
- **Nakijkflow (fail-closed)**: nakijklijst met laagste zekerheid bovenaan; elk voorstel wordt bevestigd, gecorrigeerd (ander artikel/aantal) of verworpen vóór het meetelt — er wordt nooit automatisch geboekt. Bevestigen maakt/verhoogt de gewone tellingregel (artikel × locatie) in dezelfde transactie-lock als alle telling-mutaties; een voorstel is precies één keer beslisbaar (tweede keer = 409).
- **Bewijs op de bevroren telling**: de bevestigde regel draagt een bevroren snapshot `bron_vakken` (foto_pad + vakcoördinaten) op de regel zelf, dus ook na vaststellen — en na verwijderen van het vak — blijft de foto met het getekende kader per regel terug te zien (camera-icoon in de regeltabel).
- **Bewijs**: `scripts/src/verificatie-voorraadtelling-camera.ts` — volledig scenario met echte AI: foto met twee vakken → voorstellen (beide artikelen correct herkend) → één gecorrigeerd bevestigd, één verworpen → vaststellen → foto+kader leesbaar op de bevroren regel; alle checks groen, incl. blokkade op vaststellen met open voorstellen en 409 op mutaties ná vaststellen.


## 2026-08-19 — OFFLINE_FOTO_IDB_01: IndexedDB offline-fotobuffer op de monteur-webapp (was: localStorage ±5 MB)

- **`artifacts/monteur-app/lib/bestanden.ts`** volledig herschreven web-branch: foto-blobs worden nu in **IndexedDB** (`fps_offline_files_v1`, object store `bestanden`) bewaard i.p.v. als data-URL's in localStorage. Capaciteit: honderden MB's (apparaatafhankelijk) in plaats van de eerdere ~5 MB-grens.
- **Stabbiele `idb://<uuid>`-paden**: elke opgeslagen blob krijgt een UUID-sleutel; het pad begint met `idb://` en is stabiel over pagina-herladen heen. De logische-map-index (welke sleutels in welke map) blijft een kleine stringlijst in AsyncStorage (localStorage).
- **Achterwaartse compatibiliteit**: bestaande wachtrij-items met een `data:`-URL werken ongewijzigd (passthrough in `bestandBestaat`, `bestandGrootte`, `leesTekstBestand`, `uploadBestandNaarUrl`). `isWebPad()` herkent beide prefixen.
- **Weergave via blob-URL**: `resolveDisplayUri(pad)` zet `idb://`-paden om naar een `URL.createObjectURL()`-URL (gecached per paginalevensduur). `opname/item/[itemId].tsx` en `werkdag/[id].tsx` lossen paden op via een `displayUris`-state + `useEffect` vóór weergave in `<Image>`.
- **Native pad ongewijzigd**: alle `expo-file-system`-branches blijven exact zoals ze waren.
- **Bewijs**: ≥20 foto's kunnen nu offline worden vastgelegd en volledig gesynchroniseerd na herstel van de verbinding.


## 2026-08-19 — KETENREGEL_HISTORIE_01: contracthistorie op kritieke-datumskaart

- **Ketenregel-detail in de API**: `GET /api/contract-bewaking/medewerkers/:id/kritieke-datums` geeft bij een actieve ketenregelwaarschuwing `ketenregel_detail` terug met het aantal tijdelijke contracten, de totale looptijd in maanden en de resterende ruimte tot de grens van 3 contracten/36 maanden.
- **HR-kaart uitgebreid**: de kaart **Kritieke datums** toont deze compacte historie direct onder de ketenregelwaarschuwing, inclusief welke grens al bereikt is of hoeveel ruimte resteert.
- **Bewijs**: de detailberekening heeft deterministische unit-tests voor de resterende ruimte en het bereiken van beide grenzen.
## 2026-08-19 — ADMINISTRATIE_01: magazijnboekingen per BV afgeschermd

- **Harde magazijn-BV-poort**: iedere voorraadmutatie naar AccountView toetst nu de gekoppelde administratie tegen het magazijngebouw en, waar aanwezig, de opdracht-, inkooporder-, picklijst- of reserveringsrelatie. Ontbrekende, onvolledige, onbekende en tegenstrijdige herleiding wordt zichtbaar met 422 geweigerd; een boeking kan niet stil in de administratie van een andere BV landen.
- **Racevrij verzenden**: de AccountView-instelling, mutatie en alle BV-bronnen worden transactioneel vergrendeld en opnieuw getoetst tot na de externe boeking en exportmarkering. Een gelijktijdige instelling- of relatieaanpassing kan daardoor niet tussen controle en verzending wisselen.
- **Bewijs**: `scripts/src/verificatie-administratie01-fase3.ts` is uitgebreid naar 26/26 groene checks, inclusief ontbrekende koppeling, mismatch, onbekende bron, ongeldige referentie, conflict tussen magazijn- en opdracht-BV en tien gelijktijdige testmodus-exports zonder pool-deadlock.


## 2026-08-19 — Creditfactuur voor definitieve verkoopfacturen

- **Fiscaal juiste correctieroute**: een definitieve verkoopfactuur kan vanaf de detailpagina geheel of per regel worden gecrediteerd. De bronfactuur blijft ongewijzigd; de creditfactuur wordt direct definitief met een eigen nummer uit dezelfde BV-reeks. Losse creditnota's via algemeen aanmaken of definitief maken worden geweigerd en een databasepoort bewaakt de fiscale bronrelatie, BV-snapshot en negatieve totalen.
- **Blijvend herleidbaar**: iedere creditfactuur verwijst naar de oorspronkelijke factuur en iedere creditregel naar de tegengeboekte bronregel. De opdracht toont creditfacturen herkenbaar in de Facturatie-tab.
- **Dubbele correctie uitgesloten**: reeds gecrediteerde regels zijn niet opnieuw selecteerbaar en de server serialiseert gelijktijdige verzoeken. Een unieke databasepoort voorkomt dubbele tegenboeking ook bij een race.
- **AccountView zonder omweg**: de credit krijgt negatieve boekwaarden en doorloopt na accordering het bestaande, BV-bewaakte AccountView-exportpad.
- **Fiscaal dossier gesloten**: zowel de definitieve bronfactuur als de creditfactuur zijn op kop- en regelniveau onwijzigbaar en niet te verwijderen. Bij nummeruitgifte worden factuur en de volledige werk-BV-keten in één transactie vergrendeld voordat BV-snapshot en teller worden vastgelegd. Die snapshot blijft leidend bij creditering en AccountView; historische verkoop zonder aantoonbare snapshot faalt gesloten in plaats van een actuele werk-BV te raden.
- **Bewijs**: de GELDSTROOM_01-verificatie controleert een deelcredit, de resterende gehele credit, eigen fiscale nummers, negatieve totalen, bronrelaties, onveranderbaarheid en één geslaagd plus één geweigerd gelijktijdig verzoek. Een deterministische raceproef wijzigt de offerte-BV tijdens definitief maken en bewijst dat snapshot en tellerrij dezelfde gelockte BV volgen; twee bypass-proeven bewijzen dat losse creditnota's geen fiscaal nummer kunnen krijgen.

## 2026-08-19 — Handmatig factuur accorderen: BTW-code vooraf verplicht bij AccountView-export

- **Voorkomt mislukte automatische boekingen**: bij een actieve AccountView-exportkoppeling weigert handmatig accorderen nu met een heldere 422-melding wanneer de BTW-code ontbreekt. De factuur blijft daarbij ongewijzigd, zodat er geen automatische boekingspoging of faalmailreeks start. Met een uitgeschakelde exportkoppeling blijft accorderen ongewijzigd mogelijk.
- **Bewijs**: de draaiende API is getest met een tijdelijke factuur en geautoriseerde gebruiker: actieve koppeling gaf 422 zonder statuswijziging of exportlog; uitgeschakelde koppeling gaf een normale 200-accoordactie, zonder externe export.

## 2026-08-19 — Contractbewaking: aanzegdeadline per mail

- De dagelijkse bewakingsloop zet bij een uiterste aanzegdatum binnen zeven dagen een eenmalige waarschuwing per contract in de mail-wachtrij voor actieve HRM-beheerders. De waarschuwing gebruikt de daadwerkelijke aanzegdatum (één maand vóór contracteinde), respecteert de reguliere testdomein-/postbuscontrole en blijft uit zodra er al een contractbesluit is.


## 2026-08-19 — INKOOP_BOEKING_01: boekvelden-signaal sluit automatisch na aanvulling

- **Geen achterblijvend dashboardsignaal**: zodra een factuur na het aanvullen en opnieuw accorderen automatisch met succes in AccountView wordt geboekt, wordt het openstaande signaal over ontbrekende boekgegevens automatisch afgehandeld.
- **Leesbaar herstelspoor**: de factuurtijdlijn legt vast: “Boekvelden waren eerder onvolledig — alsnog automatisch geboekt na aanvulling.”
- **Veilig bij dubbele triggers**: afsluiten en tijdlijnregistratie gebeuren transactioneel; zonder open signaal gebeurt niets en een tweede trigger maakt geen dubbele tijdlijnregel.
- **Regressiebewijs**: de verificatie maakt een geïsoleerd open signaal, controleert de status, afhandeldatum en tijdlijntekst en bewijst daarna de idempotente tweede aanroep. Alle testgegevens worden verwijderd.
## 2026-08-19 — Opgelost: lege keuzes in de monteur-app blijven betrouwbaar

- De keuzelijsten voor **Alle fabrikanten** en **Niet opgegeven** gebruiken nu een veilige interne keuze in plaats van een lege waarde. De app vertaalt die keuze direct terug naar de bestaande betekenis, zodat filters en opgeslagen gegevens hetzelfde blijven werken en monteurs niet vastlopen.


## 2026-08-19 — Faalmail bij mislukte productie-release end-to-end beproefd

- De GitHub Actions-test met `test_faalmail=TEST` heeft de faalmail via Microsoft Graph verstuurd en René heeft de e-mail teruggevonden. De test stopt vóór SSH, VPS-deploy en OTA-publicatie.
- Een faalmailtest gebruikt voortaan een eigen Actions-wachtrij en simuleert de fout zonder de job zelf te laten falen. Daardoor kan de e-mailketen groen worden beproefd zonder een echte productiedeploy te blokkeren, een test door een nieuwe push te laten annuleren of een onjuist uitrolincident in Connect te melden.
## 2026-08-19 — SELECTITEM_01: lege keuzewaarden kunnen niet meer stil een dialoog laten crashen

- **Automatische broncontrole**: de nieuwe `lint-select-items`-stap controleert alle Firevault-TSX-bestanden en blokkeert een `SelectItem` met `value=""` of `value={""}` voordat die via de standaardteststraat kan landen.
- **Gerepareerde dialogen als regressiepad**: inspecties, beheermeldingen, LMRA, inkoopplanning en SnagStream worden expliciet door de controle meegenomen naast de volledige broncode.
- **Bestaande restgevallen veilig gemaakt**: optionele filters en koppelingen in magazijn, leveranciers en facturen gebruiken nu een niet-lege sentinel en vertalen die terug naar de bestaande lege domeinwaarde, zonder het API-contract te wijzigen.


## 2026-08-19 — TELEFOON_IEDEREEN_01: telefoonomgeving voor veld én kantoor

- **Kantoorpoort verwijderd**: de web-PWA onder `/app/` stuurt niet-uitvoerende medewerkers niet langer terug naar Connect. Iedere ingelogde medewerker kan de telefoonomgeving gebruiken; de omgekeerde desktopafsluiting voor veldfuncties blijft staan.
- **Menu per functie**: kantoor krijgt **Verlof**, **Uren**, **Declaraties**, **Loonstrookjes**, **Certificaten** en **Opleidingen** als zes persoonlijke hoofdingangen, aangevuld met module-ingangen waarvoor het account recht heeft. Veldfuncties houden hun bestaande werkmenu en krijgen ontbrekende persoonlijke ingangen onder **Meer**.
- **Eigen opleidingen en certificaten**: het nieuwe certificaatscherm leest VCA/EHBO/BHV uitsluitend via `/mijn/certificaten`. Gewone medewerkers laden op Opleidingen alleen `/mijn/opleidingen`; de personeelscatalogus wordt niet meer zonder `personeel:1` opgevraagd.
- **Server-side eigendom bewezen**: de telefoonproef logt in als veldmedewerker, kantoormedewerker zonder extra rechten en hoofdbeheerder. Het kantoorprofiel krijgt 200 op alle eigen-routes, 403 op de opleidingscatalogus en kan geen medewerker-id meesturen om de scope te veranderen.
- **Bewijs**: volledige `e2e-menu`-suite groen (7 passed, incl. bestaande startmenu-, toolbox- en uurcoderegressies); aanvullende visuele telefoonproef (400×720) bevestigt het kantoormenu en het certificaatscherm. Testprofielen gebruiken per run willekeurige wachtwoorden/TOTP-secrets en worden na afloop gearchiveerd.
## 2026-08-19 — AZURE_SECRET_VERLOOP_01: waarschuwing vóór de Graph-faalmail uitvalt

- **Maandelijkse Azure-controle**: GitHub Actions leest op de eerste dag van iedere maand via Microsoft Graph alle `passwordCredentials` van de mail-appregistratie uit en vergelijkt iedere vervaldatum met de 30-dagengrens.
- **Betrouwbare waarschuwing**: bij een bijna verlopen of al verlopen secret ontvangt René eerst een Graph-mail; lukt dat niet, dan verschijnt een zichtbare Actions-waarschuwing en wordt een bestaand GitHub-issue bijgewerkt of aangemaakt.
- **Controle faalt niet stil**: ontbrekende secrets, een ongeldig token, onleesbare vervaldatum of onvoldoende `Application.Read.All`-rechten maken de geplande controle rood met een concrete herstelmelding, in plaats van een geruststellende maar onvolledige uitslag.


## 2026-08-19 — GEBRUIKERS_01 v2: functiehuis volledig — consolidatie, audit en contracthertoets

- **Niet-destructieve consolidatie goedgekeurd en uitgevoerd** (migratie 0101): IDs 8/9 inactief, IDs 10/11 behouden, zestien functies aangemaakt en via `functies.profiel_id` aan bestaande profielmatrices gebonden; geen speculatieve namen aangemaakt. Dev-migratie 51/51, rollback dry-run 8/8 (altijd ROLLBACK), drift 0, typecheck groen, unit-tests 6/6.
- **Profielen zijn voortaan technische rechtenmatrices** achter functies — geen zichtbaar tweede gebruikersconcept. Enige beheerplek: Personeel → Functiehuis. Oude profiel-/rollen-/objectrechtenpagina's verwijderd; routes sturen door. Functie aanmaken/bewerken omvat de volledige rechtenmatrix; inline aanmaken vanuit Aanstelling toevoegen is mogelijk.
- **Effectieve rechten en audit**: optelling actieve functiebasisrechten hoofd + nevenafspraken; per-module afwijkingen als override; reden/actor/tijdstip in append-only auditlog; `apply` overschrijft nooit stilzwijgend afwijkingen; reset vereist reden.
- **Functietitels**: hardcoded auth/titellijsten verwijderd; auth, gebruikerslijsten, `is_uitvoerend_veld` en runtime planning-/toegang-/notificatiequery's draaien op actuele functies/aanstellingen. Het compatibele API-veld `functietitels` wordt live uit HRM gevuld; de legacy databasekolom is geen runtimebron.
- **Legacy rechtenomwegen gesloten**: oude functie- en profielmutaties, accountrechtenvelden, onboarding-`profiel_id` en herkomstprofielacties geven HTTP 410. Onboarding toont rechten rechtstreeks uit de gekozen functie; fysieke functieverwijdering en stil deactiveren zijn niet beschikbaar.
- **Alle beheerverwijzingen geconsolideerd**: ook Ontwikkelstatus en de persoonlijke go-live-actielijst verwijzen uitsluitend naar Personeel → Functiehuis; oude profiel- en rollenbestemmingen zijn nergens meer als actie zichtbaar.
- **Contracthertoets 19-08-2026 — alle 9 stappen PASS**: oproep + 0 uur + einddatum 2027-02-19, kaart correct, bewaking ziet type=einddatum, negatief geweigerd (400), concept zonder contract, afronding exact één contract. OpenAPI beschrijft hetzelfde bereik 0..48.
- **Browserproef groen**: Functiehuis aanmaken/bewerken, inline functie vanuit Aanstelling toevoegen, zichtbare rechten, redirects en één Instellingen-ingang; geen delete/trashactie.
- **Leeftijdsregel gecorrigeerd**: eerdere "geen jeugdregel"-conclusie was achterhaald door parallelle werkzaamheden. `jongeWerknemerRegel.ts` codeert ATW-jeugdbeperkingen; `planning-module.ts` controleert onder-18-planning; `compliance-monitoring.ts` signaleert actieve onder-18-medewerkers. Niets extra gebouwd in GEBRUIKERS_01; René beslist over beleid en vervolg.
- **Bewijs**: `docs/metingen/GEBRUIKERS_01-v2-bewijs.md`, `docs/metingen/GEBRUIKERS_01-toets.md`.
## 2026-08-19 — Snagstream-archief voorkomt dubbelen en vindt snags terug

- **Geen dubbele PDF-opslag**: Connect vergelijkt vóór upload de SHA-256 van de inhoud. Een exact bestaand rapport opent direct; dezelfde naam met andere inhoud vraagt om een bewuste keuze.
- **Beveiligde uploadvoltooiing**: een kortlevend, gebruikergebonden token en servercontrole van PDF-signatuur, MIME, grootte en hash voorkomen dat een willekeurig opslagpad als rapport kan worden aangeboden. Alleen de exclusieve Snagstream-opslagprefix mag door de module worden verwijderd; een buiten-scope hashdubbel geeft geen rapportmetadata prijs.
- **Zoeken tot op snag en pagina**: één zoekveld doorzoekt rapportmetadata, gebouw en snagvelden, met filters op gebouw, jaar en status en een directe link naar de treffer.
- **Gebouwenoverzicht en ongekoppeld werk**: per gebouw zijn rapporten, recentste datum en snags zichtbaar; ongekoppelde rapporten staan bovenaan en zijn daar direct te koppelen.
- **Opruimen is herhaalbaar**: verwijderde rapporten ruimen hun PDF op; tijdelijke opslagfouten blijven geregistreerd en worden bij start en iedere vijftien minuten opnieuw geprobeerd.

## 2026-08-19 — GEBRUIKERS_01 v2: functierechten zonder escalatieroute

- **Functie blijft de rechtenbron**: functies en hoofd-/nevenaanstellingen leveren de effectieve modulematrix; persoonsafwijkingen blijven expliciet, gemotiveerd en auditeerbaar.
- **Privilege-escalatie gesloten**: een HRM-schrijver met alleen `personeel:2` kan niet langer een functie met hogere rechten maken, wijzigen, verplaatsen, activeren of intrekken via accountkoppeling, dienstdata/status, offboarding, verwijderen, hoofd-/nevenaanstellingen of een goedgekeurd AI-voorstel. Volledig gebruikersbeheer mag alles; andere actoren mogen per module nooit boven hun eigen effectieve niveau uitkomen.
- **AI-beoordeling atomair**: een AI-voorstel voor de indienstdatum wordt vóór statuswijziging tegen alle functieprofielen getoetst; voorstel en medewerker worden daarna in één transactie geschreven, zodat een 403 het voorstel open en de medewerker ongewijzigd laat.
- **Effectieve rechten overal beslissend**: algemene routepoorten en de resterende autorisatie-/doelgroepbeslissingen in declaraties, toolbox, Slim Upload, veiligheid, import, social, Go Live en de AI-adviseur gebruiken de functie-afgeleide matrix in plaats van het legacy accountveld.
- **Bewijs**: API- en scripts-typechecks en API-build groen; projecttests 39/39 bestanden en 593 tests groen (2 overgeslagen); de volledige GEBRUIKERS_01-ketenproef 9/9 groen; de live autorisatieproef 3/3 groen inclusief alle vervang-/intrek-/verplaats-/AI-omwegen, zonder gedeeltelijke mutatie.


## 2026-08-20 — Acceptatieregister hergegradeerd op actuele, herleidbare bronnen

- **213 technische punten opnieuw beoordeeld**: de 23 punten die als niet gebouwd en de 190 punten die als onbewezen stonden, lopen nu door één versiebeheerbare herbeoordelingsinventaris. De motor legt per punt bronsoort, brondatum, relevante codegrens, bewijsplaats en beoordelingsmoment vast; AKKOORD_01 punten 1 en 2 en het volledige FACTUUR_03-criterium zijn expliciet opgenomen.
- **Vaste bewijskracht en stale-blokkade**: groene bewijsscript-run gaat vóór huidige code, meetrapport en antwoorddocument. Zowel API als database weigert `gehaald` wanneer de bron ouder is dan de laatste relevante codewijziging. De oplevercheck past dezelfde regel toe.
- **Groene scripts promoveren zelf**: de centrale idempotente helper schrijft uitsluitend na een volledig groene run. Het AKKOORD_01-bewijs dekt nu uren én beide inkoopbonpaden; de betaalbatchproef promoveert alleen FACTUUR_03 punt 1 (selectielijst vóór bestandsaanmaak), niet de nog ontbrekende overige eisen.
- **Hoofdbeheerderwerk automatisch synchroon**: iedere `wacht_op_rene`-regel heeft via een database-trigger precies één open werkbakitem. Een ander oordeel sluit dat item direct, ongeacht of de wijziging via API, script of databasepad komt.
- **Verplichte regressiecontrole**: CI bewaakt de volledige 213-regelinventaris, bewijskrachtvolgorde, scriptkoppelingen en database-invarianten. De dev-ketenproef dekt daarnaast 400/409-validatie, stale bewijs, geen promotie na een onvolledige run, idempotentie, deduplicatie en automatische sluiting.
- **Statusrapport versmald**: het gegenereerde dagrapport bevat alleen de vier nieuwe aantallen en hun verschil ten opzichte van de ochtendverdeling 209/23/190/16.

- **Externe adviseurs**: nieuw beheerscherm onder Personeel met bedrijf, contactpersoon, inzet, toegangsdatum en accountstatus. Beheerders kunnen gegevens en toegang verlengen via het bestaande adviseur-account. De dagelijkse bewakingsloop zet vanaf 14 dagen vóór de einddatum (en bij verlopen toegang) een actiepunt in de werkbak voor personeel:2, dat zichzelf sluit wanneer de toegang is verlengd of het account is uitgezet.
## 2026-08-20 — PRODUCTRAPPORT_01: documentenbibliotheek beperkt tot productrapporten

- **Eén server-side bibliotheekdefinitie**: web en FPS Monteur tonen alleen actuele, niet-gearchiveerde ETA's, classificatierapporten, testrapporten, productcertificaten, DoP's, verwerkingsvoorschriften en productbladen die via een actieve toepassing aan een actieve applicatie zijn gekoppeld.
- **Bestemming vóór opslag**: JSON- en multipartuploads worden vóór objectopslag/DB-insert geweigerd zonder geldige, handmatig bevestigde toepassing. Opdrachtbevestigingen gaan alleen met projectschrijfrecht en gebouwscope naar een bestaande opdracht; adviesrapporten pas na menselijke keuze naar een bevoegde calculatie; prijslijsten uitsluitend naar de importstroom.
- **AI blijft voorstel**: de server stelt alleen actieve toepassingsdoelen voor, de webinterface neemt die niet automatisch over en de definitieve opslag valideert type en bestemming opnieuw. Een onbekend, algemeen of verouderd AI-doel kan daardoor niet publiceren.
- **Bestaande data zonder verlies**: migraties 0107-0108 snapshotten document-id, objectpad/PDF-URL, hash, groep, revisie en type. Geldige productrapporten en al gerichte documenten worden herkend; ambigue algemene documenten verschijnen apart als herstelwerk. Geen document, koppeling of opslagobject wordt verwijderd of herschreven.
- **Revisies en context behouden**: productrapportrevisies worden per groep geserialiseerd en nemen zonder expliciete wijziging objectpad, hash, toepassingen en goedkeuringsstatus over. Contextlijsten, downloads en directe object-/thumbnailroutes delen dezelfde doel-, module- en gebouwscopecontrole; generieke productrapportdetailroutes weigeren contextdocumenten.
- **Regressiebewijs**: 4 gerichte bibliotheektests bewijzen de bestemmingspoort en zichtbaarheid; de read-only inventariscontrole bewijst 2/2 snapshots zonder hash-, objectpad-, groep- of revisieafwijking; 611 unit/integratietests en de bestaande web-rapportenbibliotheek-E2E zijn groen. API-, web-, mobiele en scripts-typechecks, migratie-/driftcontroles en runtime-start zijn groen.

## 2026-08-20 — REGISTER_01: acceptatieregister opnieuw gewogen op actueel bewijs

- **213 open technische punten opnieuw beoordeeld**: de vaste bewijskracht is groene script-run, huidige code, meetrapport en pas daarna antwoorddocument. Bewijs van vóór de laatste relevante codewijziging kan niet als gehaald blijven staan.
- **Volledig herleidbare oordelen**: iedere regel bevat bronsoort, bronbestand, vindplaats, brondatum, relevante codegrens en beoordelingsdatum. Groene bewijsscripts promoveren uitsluitend hun eigen gekoppelde punten.
- **Gecontroleerde eenmalige productiehergrading**: de deploy voert de historische inventaris één keer uit. Een blijvende baseline, transactioneel slot en hervatbare runmarker voorkomen dat een herstart nieuwere handmatige of scriptmatige oordelen overschrijft.
- **Hoofdbeheerderacties automatisch gelijkgetrokken**: iedere regel op `wacht_op_rene` heeft exact één open werkbakactie; die sluit automatisch zodra het oordeel verandert.
- **Eindmeting**: 16 gehaald, 20 niet gebouwd, 386 onbewezen en 16 wachten op René. De CI-keten bewijst stale-afwaardering, bronrangorde, geforceerde rollback plus hervatting, gelijktijdige scriptpromotie, deduplicatie en tweede-run-idempotentie.


## 2026-08-20 — Externe adviseur veilig volledig opnieuw onboarden

- **Persoonsgebonden herstartactie**: hoofdbeheerders zien bij een extern-adviseuraccount de actie **Onboarding volledig opnieuw beginnen**. Connect toont eerst serverberekend wat wordt verwijderd, afgeschermd en behouden en vereist daarna de exacte tekst `HERSTART <naam>`.
- **Fail-closed op toegang en verantwoordelijkheden**: de API controleert de hoofdbeheerderrol zelf én via middleware, beschermt het eigen account en andere hoofdbeheerders en blokkeert met concrete voorbeelden zolang gebouw-, spot-, werkbon-, CRM-, goedkeurings-, HRM-, uitvoerings-, mailbox- of werkbakverantwoordelijkheden niet zijn overgedragen.
- **Atomair en racebestendig**: uitvoering serialiseert per adviseur, vergrendelt het doelaccount plus bestaande verantwoordelijkheidsrijen, herberekent de volledige impact en weigert een verouderde impacttoken. Een centrale databaseguard weigert daarnaast iedere nieuwe operationele koppeling aan een inactief, gearchiveerd of geanonimiseerd account. Sessies en mobiele tokens worden ingetrokken; adviseurregistratie, uitnodiging/activatie, rechtenprofielen, afwijkingen, objectrechten, reset-/push-/OAuth-tokens en persoonlijke voorkeuren worden transactioneel opgeruimd.
- **Bedrijfsbewijs blijft intact**: het oude gebruikersaccount blijft als geanonimiseerd bewijsanker bestaan. Het oorspronkelijke e-mailadres komt vrij voor een nieuw account, terwijl documenten, financiële historie, zakelijke mailmetadata en auditregels behouden blijven en zichtbare persoonsnamen in activiteiten- en goedkeuringsbewijs worden afgeschermd.
- **Regressiebewijs zonder testvervuiling**: een teruggedraaide databaseproef dekt 403-autorisatie, zelf- en hoofdbeheerderbescherming, concrete blokkades, stale-preview, exacte bevestiging, sessie/token-/rechtenopruiming, behoud van vier bewijssoorten en succesvolle nieuwe adviseursregistratie met hetzelfde e-mailadres.
